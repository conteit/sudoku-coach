/**
 * The playing screen: one board, one keypad, one coach.
 *
 * Every board mutation goes through `store.dispatch`, so the reducer stays the
 * only writer and undo, autosave and the clock come for free. The view holds
 * exactly the state that is not worth persisting — which cell is selected,
 * whether the keypad is in notes mode, which sheet is open — and derives
 * everything else from the game it is handed.
 *
 * Conflict flagging is computed here rather than in the grid, because whether
 * it happens at all is a player setting (#10): the grid renders the flags it is
 * given and holds no opinion about whether the player wants them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../engine/board';
import type { CellIndex, Digit, TechniqueId } from '../engine/types';
import { getLesson } from '../coach/lessons';
import { recap } from '../coach/recap';
import { deadNotes } from '../state/deadNotes';
import type { CoachExchange, LiveGame, Locale, PlayerProfile } from '../state/types';
import { useProfile } from '../state/profile';
import { useGameStore } from '../state/store';
import { formatList } from '../i18n';
import { useT } from '../i18n/locale';
import { SudokuGrid } from '../ui/board/SudokuGrid';
import { CoachPanel } from '../ui/coach/CoachPanel';
import { ConfirmDialog } from '../ui/game/ConfirmDialog';
import { DifficultyBadge } from '../ui/game/DifficultyBadge';
import { Timer } from '../ui/game/Timer';
import { formatDuration } from '../ui/game/duration';
import { Keypad, type HapticPattern } from '../ui/keypad/Keypad';
import { LessonBody } from '../ui/learn/LessonBody';
import { TechniqueIndex } from '../ui/learn/TechniqueIndex';
import { cx } from '../ui/primitives/cx';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { FOCUSABLE, Sheet } from '../ui/primitives/Sheet';
import {
  ChevronLeftIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  // The coach's own glyph reuses the drill's target rather than drawing a
  // second icon that would mean the same thing: something to aim at.
  TargetIcon as CoachIcon,
  TrashIcon,
  UndoIcon,
} from '../ui/primitives/icons';
import { useAccount } from '../state/account';
import { buildDiagnosticReport, formatDiagnosticReport } from './diagnostics';
import { isDevUser } from './devTools';
import { GameLayout } from './GameLayout';
import { selectHighlight, toggleHighlight } from './greenHighlight';
import { useBoardShortcuts } from './useBoardShortcuts';
import { useCoachSession } from './useCoachSession';
import { useViewportTier } from './useViewportTier';

/** How long a vibration says each thing. Absent hardware simply ignores it. */
const HAPTICS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  toggle: [4, 30, 4],
  blocked: [12, 40, 12],
};

/**
 * Writes the report to a file the developer can keep.
 *
 * A file rather than the sheet, because this one is for reading later and
 * beside other reports — the sheet is for pasting into a message now. The
 * object URL is revoked immediately: the download has already started by
 * then, and a URL left alive pins the whole report in memory for the life of
 * the document.
 */
function downloadDiagnostics(report: string, gameId: string): void {
  const url = URL.createObjectURL(new Blob([report], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `sudoku-coach-${gameId}-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** One frozen empty reading, so turning the flag off does not rebuild 81 arrays. */
const NO_STALE: readonly (readonly Digit[])[] = [];

/** The column's way back, so a swap can hand focus to it (and back again). */
const LESSON_BACK_ID = 'lesson-back';

export interface GameViewProps {
  game: LiveGame;
  settings: PlayerProfile['settings'];
  locale: Locale;
  /** Back to the library; the store parks the game on the way out. */
  onExit: () => void;
  onOpenSettings: () => void;
  onNewGame: () => void;
  /** Opens the Learn section, optionally straight onto one technique. */
  onLearn: (technique?: TechniqueId) => void;
}

export function GameView({
  game,
  settings,
  locale,
  onExit,
  onOpenSettings,
  onNewGame,
  onLearn,
}: GameViewProps) {
  const t = useT();
  const dispatch = useGameStore((state) => state.dispatch);
  const removeGame = useGameStore((state) => state.removeGame);
  // `GameView` is handed `settings` alone (the slice `App.tsx` already reads
  // for itself); the lesson column needs the whole profile, the same way
  // `useCoachSession` reaches into the profile store for mastery credit
  // rather than having it threaded down as a second prop for the same data.
  const profile = useProfile((state) => state.profile);

  const [selected, setSelected] = useState<CellIndex | null>(null);
  // Not derived from `selected` on every render: a highlight that dies on the
  // move that makes it useful — scanning the grid for where else a digit can
  // go — is not a highlight (R3). Selecting a filled cell arms or clears it
  // (see `selectCell` below); selecting an empty cell leaves it alone.
  const [highlightDigit, setHighlightDigit] = useState<Digit | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [confirming, setConfirming] = useState<'restart' | 'delete' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /*
   * The diagnostic report, held as text once it is built. Built on demand
   * rather than kept live: it walks the whole detector catalog, which is
   * cheap (a full sweep is 0.02ms median) but pointless on every render of a
   * screen where nobody has asked a question.
   */
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /*
   * The win animation, played on the board as it stands. Paolo's call, and it
   * is what keeps this tool free: nothing is written, so there is no
   * completion to record, no mastery to credit, no recap to generate and
   * nothing to sync. A view state, not a move — which is why it is a piece of
   * component state and not a dispatch.
   */
  const [previewWin, setPreviewWin] = useState(false);
  const devUser = isDevUser(useAccount((state) => state.account));
  const [reviewSpotlight, setReviewSpotlight] = useState<readonly CellIndex[]>([]);
  // The coach's own open/closed state, not derived from `speaking`: opening
  // the sheet is how the player asks to be spoken to, and closing it is a
  // deliberate dismissal — neither should flip because a hint arrived.
  const [sheetOpen, setSheetOpen] = useState(false);
  /*
   * What the lesson column is showing, at the desktop tier where it exists.
   *
   * `auto` is the column's own reading of the game — the coach's lesson once
   * a technique has been named at level 2, the index before that — and it is
   * where the column rests. The other two are the player disagreeing with
   * that reading: `lesson` because they opened one from the index, `index`
   * because they pressed back out of the coach's.
   *
   * The player's disagreement is deliberately not durable. Every fresh
   * naming resets to `auto` (see the effect below), because a rung the
   * player just paid for outranks a page they were browsing.
   */
  const [columnView, setColumnView] = useState<
    { kind: 'auto' } | { kind: 'index' } | { kind: 'lesson'; id: TechniqueId }
  >({ kind: 'auto' });
  /*
   * What to focus after the column's next swap, since the swap replaces the
   * content rather than revealing it: the way back when a lesson opens, and
   * the row it came from when it closes. Without it a keyboard reader returns
   * to the top of a fourteen-row list after every lesson.
   */
  const columnRef = useRef<HTMLDivElement>(null);
  const columnFocus = useRef<'back' | TechniqueId | null>(null);
  // Mirrors `Sheet.tsx`'s own focus bookkeeping: where focus was before the
  // sheet took it, so closing can hand it back rather than dropping a
  // keyboard user at the top of the document.
  const coachPanelRef = useRef<HTMLDivElement>(null);
  const coachRestoreRef = useRef<HTMLElement | null>(null);
  // Below Tailwind's `sm` (640px), the coach panel is the mobile overlay; at
  // and above it, it's the static desktop bar. The modal machinery — focus
  // trap, Escape — must key off the same line the CSS does, or pressing "h"
  // on a wide screen traps keyboard focus in a panel that visually covers
  // nothing and cannot be escaped without also discarding the hint just
  // asked for (WCAG 2.1.2).
  const tier = useViewportTier();
  const isNarrow = tier === 'phone';

  const values = useMemo(() => game.cells.map((cell) => cell.value), [game.cells]);

  /**
   * The notes one of the player's own placements has killed since they were
   * written. Deliberately not every note a peer contradicts: striking those
   * through as they are typed performs the elimination the player came here to
   * learn. A note written into a square that was already dead stays unmarked —
   * that one is theirs to find, and "check my notes" is what finds it.
   */
  const stale = useMemo(() => deadNotes(game.cells, game.undoStack), [game.cells, game.undoStack]);
  /*
   * What the player has asked to *see* of that, which is all any control here
   * may act on. With `markDeadNotes` off the board strikes nothing through,
   * and the two eraser affordances go with it: a key offering to clear
   * something the board never marked is a control with no visible referent.
   * "Check my notes" still finds them — that path was always the one meant
   * to, and it says so in words rather than in colour.
   */
  const flaggedStale = settings.markDeadNotes ? stale : NO_STALE;
  const staleCount = useMemo(
    () => flaggedStale.reduce((n, digits) => n + digits.length, 0),
    [flaggedStale],
  );
  const summary = useMemo(() => recap(game.coachLog), [game.coachLog]);
  const conflicts = useMemo(
    () => (settings.highlightConflicts ? Board.fromValues(values).conflicts() : []),
    [settings.highlightConflicts, values],
  );

  const onCoachLog = useCallback(
    (log: readonly CoachExchange[]) => dispatch({ type: 'setCoachLog', log }),
    [dispatch],
  );
  const coach = useCoachSession({ game, locale, onCoachLog });

  /*
   * A report describes the board at the moment it was run, so applying it
   * leaves the panel showing a reading that is no longer true. Re-running the
   * check is the honest answer, but it cannot happen in the click handler:
   * `checkMarks` closes over the `game` of the render it came from, which is
   * the board *before* the dispatch.
   *
   * What it waits for is the *board*, not the next render. A boolean flag was
   * the first attempt and it was a race: this component re-renders for plenty
   * of reasons that are not a new game — a coach state change, a parent's
   * subscription firing — and whichever render arrived first consumed the
   * flag and re-checked the board that was already on screen. It passed on a
   * fast machine and failed on CI, which is what a race looks like from the
   * outside. Remembering the move count instead makes the condition the one
   * that was always meant: re-check when the board has actually moved.
   */
  const recheckAfterFix = useRef<number | null>(null);
  useEffect(() => {
    if (recheckAfterFix.current === null || game.undoStack.length === recheckAfterFix.current) {
      return;
    }
    recheckAfterFix.current = null;
    coach.checkMarks();
  }, [coach, game.undoStack.length]);

  /**
   * Opens the sheet. The restore target has to be captured *here*, synchronously
   * in the click handler, not in an effect: the panel's own focus-move effect
   * below also fires once `sheetOpen` commits, and effects run in declaration
   * order — a capture written as an effect could just as easily run after it,
   * by which point `document.activeElement` is already the panel's own Close
   * button, not whatever had focus before the click.
   */
  const openSheet = useCallback(() => {
    coachRestoreRef.current = document.activeElement as HTMLElement | null;
    setSheetOpen(true);
  }, []);

  /**
   * The one path every way of closing the sheet has to go through. Consuming
   * the nudge belongs here rather than on open: dismissing it the moment the
   * sheet appears would clear the badge before the player has read what it
   * was pointing at (spec: a nudge is read, not re-solicited).
   */
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    coach.dismiss();
    coach.dismissNudge();
  }, [coach]);

  /**
   * Whether the panel is actually presented as the modal overlay right now —
   * `sheetOpen` alone isn't enough, because `sheetOpen` can be true on a wide
   * screen too (see `onHint` below): the static desktop bar is never a modal
   * no matter what this flag says.
   */
  const modalOpen = sheetOpen && isNarrow;

  /*
   * Moves focus into the sheet on open and hands it back on close — the
   * capture happens in `openSheet` above, this just does the moving.
   * Escape-to-close and a tab trap below are hand-rolled rather than routed
   * through `Sheet.tsx`: that component portals a full-viewport modal — on
   * `sm` and up it centres itself as a card, which is exactly the "coach
   * becomes a modal on desktop" regression this task exists to prevent, and
   * it always draws its own title bar and close button on top of whatever
   * `children` is, duplicating the header `CoachPanel` already owns. What's
   * reused is `Sheet.tsx`'s own focusable-element query (`FOCUSABLE`) and the
   * same move-in/restore/trap logic, applied to this panel instead of a
   * portal. Both effects are gated on `modalOpen`, not `sheetOpen`: trapping
   * Tab and hijacking Escape on the static desktop bar — which is visible and
   * interactive with or without `sheetOpen` — is a keyboard trap with no way
   * out except discarding whatever the player was just doing.
   */
  useEffect(() => {
    if (!modalOpen) return;
    const panel = coachPanelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => coachRestoreRef.current?.focus?.();
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeSheet();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = coachPanelRef.current;
      if (panel === null) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [modalOpen, closeSheet]);

  const haptic = useCallback(
    (pattern: HapticPattern) => {
      if (settings.haptics) navigator.vibrate?.(HAPTICS[pattern]);
    },
    [settings.haptics],
  );

  const enter = useCallback(
    (cell: CellIndex, digit: Digit) => {
      dispatch(
        pencilMode
          ? { type: 'toggleCandidate', cell, digit }
          : { type: 'setValue', cell, digit },
      );
      /*
       * Auto-clear is dispatched here, as a consequence of the placement,
       * rather than by an effect watching the board. An effect would fire on
       * every render that found dead notes — including the render right after
       * an *undo* restored them, which would make undo unusable: the notes
       * would come back and be swept again before the player saw them. Tying
       * it to the move that killed them means it can only ever happen once,
       * for the reason the player caused.
       *
       * Its own move, deliberately (Paolo's call): one undo puts the notes
       * back and leaves the digit, so what the setting did on the player's
       * behalf is visible and reversible on its own. `clearStaleCandidates`
       * no-ops when nothing is dead — `commit` returns the game untouched on
       * an empty batch — so this costs a scan and nothing else.
       */
      if (!pencilMode && settings.autoClearDeadNotes) {
        dispatch({ type: 'clearStaleCandidates' });
      }
    },
    [dispatch, pencilMode, settings.autoClearDeadNotes],
  );

  /**
   * Selecting a cell is the green's arm/clear decision now, not a keypad tap
   * (R3). Empty cells pass `selectHighlight` a null value, which is exactly
   * what makes it a no-op for them — the caret can move across the whole
   * board hunting for a spot without ever disturbing the highlight.
   */
  const selectCell = useCallback(
    (cell: CellIndex) => {
      setSelected(cell);
      const value = game.cells[cell]?.value ?? null;
      setHighlightDigit((current) => selectHighlight(value, current));
    },
    [game.cells],
  );

  // "Speaking" is the panel having something the player asked for on screen.
  const speaking =
    coach.hint !== null || coach.review !== null || coach.drill !== null || coach.exhausted;
  const paused = game.runningSince === null && game.completedAt === null;
  const solved = game.completedAt !== null;

  // The coach's spotlight is the hint's, unless the player is pointing at a
  // note the review flagged — that is a more specific thing to be looking at.
  const spotlight = reviewSpotlight.length > 0 ? reviewSpotlight : (coach.hint?.spotlight ?? []);

  useBoardShortcuts({
    onToggleNotes: () => setPencilMode((on) => !on),
    onUndo: () => dispatch({ type: 'undo' }),
    onRedo: () => dispatch({ type: 'redo' }),
    // On a narrow screen, asking by keyboard has to open the sheet itself, or
    // "h" fires a hint into a panel the player cannot see. On a wide screen
    // the panel is already visible and static — it was never behind
    // anything — so this stays exactly the plain `coach.ask()` it was before
    // this task: opening a sheet that already shows nothing new would only
    // add the modal machinery to a control that never needed it.
    onHint: () => {
      if (isNarrow) openSheet();
      coach.ask();
    },
    // A dialog is a question; answering it with "u" should not rewind the board
    // behind it. That covers every overlay that owns the screen, the coach
    // sheet included — it became a real `role="dialog"` on narrow viewports in
    // this task, and `onHint` above opens it deliberately, so "h" twice would
    // otherwise re-capture the focus-restore target and strand focus on
    // Escape. A paused or finished board takes no moves either.
    enabled: confirming === null && !paused && !solved && !modalOpen && !menuOpen,
  });

  const header = (
    <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
      <IconButton
        label={t('action.back')}
        icon={<ChevronLeftIcon />}
        className="flex-none"
        onClick={onExit}
      />
      {/* `overflow-hidden` is load-bearing, not decorative: `DifficultyBadge`'s
          own root is `inline-flex`, which sizes to its own content rather
          than to this shrunk flex item, so on a narrow header (a long word —
          worst case, Italian "Difficile" — with five siblings competing for
          room) the badge painted past this div's edge and into the timer's
          digits without it. This clips instead of overlapping; it does not
          make the badge fit. */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <DifficultyBadge difficulty={game.difficulty} />
      </div>
      <Timer elapsedMs={game.elapsedMs} runningSince={game.runningSince} size="md" />
      <IconButton
        label={paused ? t('action.resume') : t('action.pause')}
        icon={paused ? <PlayIcon /> : <PauseIcon />}
        className="flex-none"
        disabled={solved}
        onClick={() => dispatch({ type: paused ? 'resume' : 'pause' })}
      />
      {/*
        * Lives in the header, not floating over the board's own corner (it
        * clipped r9c9, eating taps meant for the grid) or anchored above the
        * keypad on a guessed offset (it overlapped the keypad's top-right
        * key once the keypad grew taller than the guess). The header is
        * fixed chrome a phone player already reads for controls: it covers
        * no board cell and no keypad key, and needs no offset math to avoid
        * either.
        *
        * Placed beside Pause rather than beside the menu: both are actions
        * taken *during* a move, unlike the menu's rare, out-of-play ones, so
        * the overflow button stays the rightmost, catch-all item it already
        * was.
        *
        * Unconditional, like every other header child — a coach control
        * that only appeared once there was something to say would change
        * the header's own height, and the board would move with it, which
        * is the defect this branch exists to fix. `hidden` while the sheet
        * is open only toggles visibility, not presence: `openSheet` above
        * captures this exact node as the focus-restore target, and a node
        * that has left the document can't be focused back onto once the
        * sheet closes.
        *
        * `relative` is new here — the badge below is an `after:`
        * pseudo-element positioned `absolute`, which only ever worked
        * because the floating button was itself `position: absolute`. A
        * header child isn't, so it needs its own containing block.
        */}
      <IconButton
        label={coach.nudge === null ? t('coach.open') : t('coach.openWaiting')}
        icon={<CoachIcon />}
        className={cx(
          'relative flex-none sm:hidden',
          // `!` (important), not the plain utility: `.hidden{display:none}`
          // sits *before* `.inline-flex{display:inline-flex}` in Tailwind's
          // generated stylesheet, so on equal specificity the later rule —
          // IconButton's own base class — always won regardless of the
          // order these classes appear in `className`. Unnoticed on the old
          // floating button because the sheet's own backdrop happened to
          // cover the same corner; in the header, still-visible-and-live
          // means a second, unhidden "Coach" control sitting right next to
          // the open dialog.
          sheetOpen && '!hidden',
          coach.nudge !== null &&
            'after:absolute after:top-0 after:right-0 after:size-3 after:rounded-full after:bg-coach',
        )}
        onClick={openSheet}
      />
      <IconButton
        label={t('game.menu')}
        icon={<MoreIcon />}
        className="flex-none"
        onClick={() => setMenuOpen(true)}
      />
    </header>
  );

  const board = (
    // The board takes the height nobody else claimed and stays square, so it
    // is the piece that gives when a screen is short. A fixed height budget
    // was tried and is wrong: the coach panel is a different height on a
    // phone than on a laptop, and the board has to answer to what is
    // actually there.
    <div className="flex min-h-0 flex-1 items-center justify-center sm:block sm:flex-none">
      <div className="relative aspect-square h-full max-w-full sm:h-auto sm:w-full">
        <SudokuGrid
          cells={game.cells}
          selected={selected}
          onSelect={selectCell}
          onEnter={enter}
          onClear={(cell) => dispatch({ type: 'clearCell', cell })}
          spotlight={spotlight}
          tintedHouses={coach.hint?.houses ?? []}
          conflicts={conflicts}
          staleMarks={flaggedStale}
          highlightDigit={highlightDigit}
          highlightPeers={settings.highlightPeers}
          highlightMatches={settings.highlightMatches}
          highlightMatchingNotes={settings.highlightMatchingNotes}
          colorEntries={settings.colorEntries}
          // Finishing the puzzle is the one thing on this screen that is
          // purely a reward, so the board says so itself rather than leaving
          // it to the sheet that opens over it.
          celebrate={solved || previewWin}
          className={paused ? 'pointer-events-none blur-md select-none' : undefined}
        />
        {paused ? (
          <div className="absolute inset-0 grid place-items-center bg-paper/80">
            <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'resume' })}>
              {t('action.resume')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );

  const keypad = (
    <Keypad
      className="min-h-[11.5rem] shrink-0"
      values={values}
      pencilMode={pencilMode}
      onTogglePencil={() => setPencilMode((on) => !on)}
      onDigit={(digit) => {
        // The key's single meaning again: a tap that has somewhere to write
        // writes there, and does nothing else (R3). `enter` itself no-ops
        // when the cell already holds `digit`. The haptic for a digit tap is
        // decided here rather than by the keypad itself, because only this
        // layer knows whether the tap is legal — a blanket 'tap' would fire
        // even with nothing selected, which is exactly the no-op 'blocked'
        // exists to feel different from.
        if (selected === null) {
          haptic('blocked');
          return;
        }
        haptic('tap');
        enter(selected, digit);
      }}
      onDigitLongPress={(digit) => setHighlightDigit((current) => toggleHighlight(digit, current))}
      onErase={() => {
        if (selected !== null) dispatch({ type: 'clearCell', cell: selected });
      }}
      onUndo={() => dispatch({ type: 'undo' })}
      onRedo={() => dispatch({ type: 'redo' })}
      canUndo={game.undoStack.length > 0}
      canRedo={game.redoStack.length > 0}
      // The pad as a whole stays live with nothing selected — a long press
      // still has to reach a digit with none of its nine placed yet — but
      // the eraser has nothing to erase, so it needs the gate the pad no
      // longer applies for it.
      canErase={selected !== null}
      // The same count and the same single undoable step the coach panel's
      // eraser dispatches — one action, two doors. The pad is the near one:
      // a phone player's thumb is already on it, where the panel's copy is a
      // notification, a sheet and a tap away.
      staleCount={staleCount}
      onClearStale={() => dispatch({ type: 'clearStaleCandidates' })}
      disabled={paused || solved}
      highlighted={highlightDigit}
      onHaptic={haptic}
    />
  );

  const coachRegion = (
    <>
      {/* A real, if unreachable-by-Tab, button rather than a decorative div:
          it needs an accessible name and an activation the platform actually
          recognises, or a pointer is the only way to back out of the sheet.
          `tabIndex={-1}` keeps it out of the tab order on purpose — the panel
          itself is where Tab should land, not the backdrop behind it. */}
      {modalOpen ? (
        <button
          type="button"
          aria-label={t('action.close')}
          tabIndex={-1}
          onClick={closeSheet}
          className="absolute inset-0 z-10 cursor-default bg-ink/20 sm:hidden"
        />
      ) : null}

      <div
        ref={coachPanelRef}
        tabIndex={-1}
        // Only while it's genuinely the modal overlay: the static desktop
        // bar is a `region` (from `CoachPanel`'s own labelled `<section>`),
        // never a `dialog` — announcing it as one would tell a screen reader
        // to treat a permanently-visible part of the page as something that
        // opened and will close. `aria-modal="true"` is what tells assistive
        // tech to stop offering the board and keypad behind it, the same
        // contract `Sheet.tsx` relies on for its own portal.
        role={modalOpen ? 'dialog' : undefined}
        aria-modal={modalOpen ? true : undefined}
        aria-label={modalOpen ? t('coach.title') : undefined}
        className={cx(
          'bg-paper-raised sm:static sm:block sm:max-h-none sm:overflow-visible sm:shadow-none',
          sheetOpen
            ? 'absolute inset-x-0 bottom-0 z-20 max-h-[72dvh] overflow-y-auto shadow-lift'
            : 'hidden',
        )}
      >
        <CoachPanel
          hint={coach.hint}
          techniqueLabel={
            coach.hint === null ? undefined : getLesson(locale, coach.hint.technique).name
          }
          onAsk={coach.ask}
          onEscalate={coach.escalate}
          review={coach.review}
          onReviewCandidates={coach.checkMarks}
          onSpotlight={setReviewSpotlight}
          exhausted={coach.exhausted}
          drill={coach.drill}
          onDrill={coach.startDrill}
          onDismissDrill={coach.dismissDrill}
          onLearn={onLearn}
          onAnother={coach.another}
          onFixNotes={
            paused || solved
              ? undefined
              : () => {
                  // Exactly the issues on screen, mapped straight from the
                  // report the player is reading — the reducer is never
                  // handed a fresh reading of the board, so nothing can be
                  // corrected that was not displayed.
                  dispatch({
                    type: 'applyNoteFixes',
                    fixes: coach.review?.issues.map(({ cell, digit, kind }) => ({
                      cell,
                      digit,
                      kind,
                    })) ?? [],
                  });
                  recheckAfterFix.current = game.undoStack.length;
                }
          }
          // Open (mobile), the X has to close the whole sheet — not just
          // clear the hint underneath it — or it stops the panel dead in its
          // resting state with no way left to dismiss it. At rest on desktop
          // there is no sheet to close, only a hint to collapse.
          onCollapse={sheetOpen ? closeSheet : speaking ? coach.dismiss : undefined}
          nudge={coach.nudge}
          onDismissNudge={coach.dismissNudge}
          staleCount={staleCount}
          onClearStale={
            paused || solved ? undefined : () => dispatch({ type: 'clearStaleCandidates' })
          }
        />
      </div>
    </>
  );

  /*
   * The column always has something in it, so its box never changes and the
   * board never moves. Before the coach has named a technique that is the
   * player's own mastery — the same reading the coach uses to pick a puzzle
   * at the edge of what they know. Level 2 is where the name is paid for;
   * showing the lesson earlier would hand over the rung they have not
   * climbed. Reading a lesson the player opens themselves is not that rung:
   * Learn is browsable from the library at any time, and the ladder is about
   * hints for *this board*, not about who may read what.
   *
   * The gate is the *rule* — has a level-2 disclosure been logged — not the
   * mechanism that usually carries it. `useCoachSession.startDrill` calls
   * `coach.hint(finding, 2)` and records that exchange before it ever sets
   * `drill`, then immediately sets `hint` back to `null` (the panel shows
   * the challenge banner instead of hint text while one is live). Reading
   * only `coach.hint` would miss that: the technique was already named, the
   * log already says so, but the sidebar would still show the index — the
   * coach saying "there is a hidden single here" while the column beside it
   * declines to explain what one is. `coach.drill` is the other place a
   * level-2 naming shows up in this hook's state, so it counts too.
   */
  const namedTechnique: TechniqueId | null =
    coach.hint !== null && coach.hint.level >= 2
      ? coach.hint.technique
      : (coach.drill?.technique ?? null);

  /*
   * A naming is the coach answering, and it takes the column back from
   * whatever was being browsed — the player paid a rung for it and the live
   * region announces it. Only a *new* naming does: this fires when
   * `namedTechnique` becomes non-null, not when a dismissed hint sets it back
   * to null, so dismissing does not yank a lesson out from under a reader.
   */
  useEffect(() => {
    if (namedTechnique !== null) setColumnView({ kind: 'auto' });
  }, [namedTechnique]);

  // The one technique the column is showing, if it is showing one at all.
  const shownTechnique: TechniqueId | null =
    columnView.kind === 'lesson'
      ? columnView.id
      : columnView.kind === 'index'
        ? null
        : namedTechnique;

  const openLesson = (id: TechniqueId) => {
    columnFocus.current = 'back';
    setColumnView({ kind: 'lesson', id });
  };

  const closeLesson = (from: TechniqueId) => {
    columnFocus.current = from;
    setColumnView({ kind: 'index' });
  };

  useEffect(() => {
    const target = columnFocus.current;
    if (target === null) return;
    columnFocus.current = null;
    const column = columnRef.current;
    if (column === null) return;
    const node =
      target === 'back'
        ? column.querySelector<HTMLElement>(`#${LESSON_BACK_ID}`)
        : column.querySelector<HTMLElement>(`[data-technique="${target}"]`);
    node?.focus();
  }, [columnView]);

  // The column's content and the phrase that announces it, built together —
  // `GameLayout` takes them as one prop so a swap cannot change one without
  // the other. The phrase is deliberately not read back out of the content:
  // see the live region in `GameLayout`.
  const lessonRegion =
    shownTechnique !== null
      ? {
          title: getLesson(locale, shownTechnique).name,
          body: (
            <div ref={columnRef}>
              {/* `h2`, not the `h1` this renders on Learn: here the document
                  is a game in progress, and the sidebar is not its root.
                  The way back is the same `leading` slot Learn's own
                  technique page puts its back button in — and it is offered
                  from the coach's lesson too, so a level-2 hint no longer
                  pins the column to one technique for the rest of the
                  game. */}
              <LessonBody
                id={shownTechnique}
                profile={profile}
                titleAs="h2"
                leading={
                  <IconButton
                    id={LESSON_BACK_ID}
                    label={t('action.back')}
                    icon={<ChevronLeftIcon />}
                    className="flex-none"
                    onClick={() => closeLesson(shownTechnique)}
                  />
                }
              />
            </div>
          ),
        }
      : {
          title: t('learn.techniques.title'),
          body: (
            <div ref={columnRef}>
              <TechniqueIndex profile={profile} onOpen={openLesson} />
            </div>
          ),
        };

  return (
    <>
      <GameLayout
        tier={tier}
        header={header}
        board={board}
        keypad={keypad}
        coach={coachRegion}
        lesson={lessonRegion}
      />

      {/* Everything about this puzzle that is not a move. Rare actions do not
          earn permanent space on a phone, and a menu is where a player looks
          for them anyway. */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('game.menu')}>
        <div className="flex flex-col gap-2 pb-2">
          <Button
            variant="secondary"
            size="lg"
            block
            icon={<UndoIcon />}
            onClick={() => {
              setMenuOpen(false);
              setConfirming('restart');
            }}
          >
            {t('action.restart')}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            block
            onClick={() => {
              setMenuOpen(false);
              onLearn();
            }}
          >
            {t('learn.title')}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            block
            icon={<SettingsIcon />}
            onClick={() => {
              setMenuOpen(false);
              onOpenSettings();
            }}
          >
            {t('settings.title')}
          </Button>
          {/* Two entries nobody else sees. The allowlist is public in the
              bundle and that is fine: it grants nothing to anyone not signed
              in as that account, and neither tool does anything a player
              could not do to their own board. */}
          {devUser ? (
            <>
              <Button
                variant="ghost"
                size="lg"
                block
                onClick={() => {
                  setMenuOpen(false);
                  // Writes nothing. The board is not solved, the game is not
                  // completed, and closing the menu again is the whole undo.
                  setPreviewWin(true);
                }}
              >
                {t('dev.previewWin')}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                block
                onClick={() => {
                  setMenuOpen(false);
                  downloadDiagnostics(
                    formatDiagnosticReport(
                      buildDiagnosticReport({
                        game,
                        profile,
                        tier,
                        viewport: `${window.innerWidth}x${window.innerHeight}`,
                        hint: coach.hint,
                        drill: coach.drill,
                        exhausted: coach.exhausted,
                        review: coach.review,
                      }),
                    ),
                    game.id,
                  );
                }}
              >
                {t('dev.dumpState')}
              </Button>
            </>
          ) : null}

          {/* Below the ordinary actions, above the destructive one: it is not
              something a player reaches for while playing, but when the coach
              has said something that cannot be right, it has to be findable
              without leaving the board that proves it. */}
          <Button
            variant="ghost"
            size="lg"
            block
            onClick={() => {
              setMenuOpen(false);
              setCopied(false);
              setDiagnostics(
                formatDiagnosticReport(
                  buildDiagnosticReport({
                    game,
                    profile,
                    tier,
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    hint: coach.hint,
                    drill: coach.drill,
                    exhausted: coach.exhausted,
                    review: coach.review,
                  }),
                ),
              );
            }}
          >
            {t('action.diagnostics')}
          </Button>
          <Button
            variant="danger"
            size="lg"
            block
            icon={<TrashIcon />}
            onClick={() => {
              setMenuOpen(false);
              setConfirming('delete');
            }}
          >
            {t('action.delete')}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirming === 'restart'}
        title={t('confirm.restart.title')}
        body={t('confirm.restart.body')}
        confirmLabel={t('action.restart')}
        cancelLabel={t('action.cancel')}
        onConfirm={() => {
          dispatch({ type: 'reset' });
          coach.dismiss();
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming === 'delete'}
        title={t('confirm.deleteGame.title')}
        body={t('confirm.deleteGame.body')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
        destructive
        onConfirm={() => {
          setConfirming(null);
          void removeGame(game.id);
        }}
        onCancel={() => setConfirming(null)}
      />

      {/* The report is shown, not just copied. `navigator.clipboard` needs a
          secure context and a permission that a browser is free to refuse,
          and a "report a problem" button that silently does nothing is a
          worse bug than the one being reported — so the text is on screen and
          selectable either way, and the copy button is the convenience. */}
      <Sheet
        open={diagnostics !== null}
        onClose={() => setDiagnostics(null)}
        title={t('diagnostics.title')}
      >
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            {t('diagnostics.intro')}
          </p>
          <pre className="max-h-[45dvh] overflow-auto rounded-cell border border-rule bg-paper-sunk p-3 text-xs leading-relaxed text-ink select-all">
            {diagnostics}
          </pre>
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              void navigator.clipboard?.writeText(diagnostics ?? '').then(
                () => setCopied(true),
                // A refused clipboard is not worth an error dialog: the text
                // is already on screen and selectable.
                () => undefined,
              );
            }}
          >
            {copied ? t('action.copied') : t('action.copy')}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={solved}
        onClose={onExit}
        title={t('board.solvedTitle')}
        // Completing the puzzle is what stopped the clock and banked the last
        // stretch, so `elapsedMs` is the final time — reading the wall clock
        // here would count the seconds spent admiring the result.
        description={t('board.solved', { time: formatDuration(game.elapsedMs) })}
        footer={
          <>
            <Button variant="ghost" size="lg" block onClick={onExit}>
              {t('games.title')}
            </Button>
            <Button variant="primary" size="lg" block onClick={onNewGame}>
              {t('action.newGame')}
            </Button>
          </>
        }
      >
        {/* The recap is about how the puzzle was solved, not that it was: the
            coach log already knows what the player leaned on, and saying it
            back is the only part of a finished game worth reading. */}
        <div className="pb-2 text-sm leading-relaxed text-ink-soft">
          {summary.findings === 0 ? (
            <p className="text-match">{t('recap.noHints')}</p>
          ) : (
            <>
              <p>{t('recap.asked', { count: summary.findings, level: summary.deepest })}</p>
              {summary.named.length > 0 ? (
                <p className="mt-1.5">
                  {t('recap.named', {
                    list: formatList(
                      locale,
                      summary.named.map((id) => getLesson(locale, id).name),
                    ),
                  })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
