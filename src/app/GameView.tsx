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

import { useCallback, useMemo, useState } from 'react';
import { Board } from '../engine/board';
import type { CellIndex, Digit, TechniqueId } from '../engine/types';
import { getLesson } from '../coach/lessons';
import { recap } from '../coach/recap';
import { deadNotes } from '../state/deadNotes';
import type { CoachExchange, LiveGame, Locale, PlayerProfile } from '../state/types';
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
import { cx } from '../ui/primitives/cx';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { Sheet } from '../ui/primitives/Sheet';
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
import { keypadTap } from './keypadTap';
import { useBoardShortcuts } from './useBoardShortcuts';
import { useCoachSession } from './useCoachSession';

/** How long a vibration says each thing. Absent hardware simply ignores it. */
const HAPTICS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  toggle: [4, 30, 4],
  blocked: [12, 40, 12],
};

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

  const [selected, setSelected] = useState<CellIndex | null>(null);
  // Owned by the keypad, not derived from the selection: a highlight that
  // dies on the move that makes it useful — scanning the grid for where else
  // a digit can go — is not a highlight (R3).
  const [highlightDigit, setHighlightDigit] = useState<Digit | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [confirming, setConfirming] = useState<'restart' | 'delete' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewSpotlight, setReviewSpotlight] = useState<readonly CellIndex[]>([]);
  // The coach's own open/closed state, not derived from `speaking`: opening
  // the sheet is how the player asks to be spoken to, and closing it is a
  // deliberate dismissal — neither should flip because a hint arrived.
  const [sheetOpen, setSheetOpen] = useState(false);

  const values = useMemo(() => game.cells.map((cell) => cell.value), [game.cells]);

  /**
   * The notes one of the player's own placements has killed since they were
   * written. Deliberately not every note a peer contradicts: striking those
   * through as they are typed performs the elimination the player came here to
   * learn. A note written into a square that was already dead stays unmarked —
   * that one is theirs to find, and "check my notes" is what finds it.
   */
  const stale = useMemo(() => deadNotes(game.cells, game.undoStack), [game.cells, game.undoStack]);
  const staleCount = useMemo(() => stale.reduce((n, digits) => n + digits.length, 0), [stale]);
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
    },
    [dispatch, pencilMode],
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
    // Asking by keyboard has to open the sheet itself, or "h" fires a hint
    // into a panel the player cannot see.
    onHint: () => {
      setSheetOpen(true);
      coach.ask();
    },
    // A dialog is a question; answering it with "u" should not rewind the board
    // behind it. A paused or finished board takes no moves either.
    enabled: confirming === null && !paused && !solved,
  });

  return (
    /*
     * One screen, no page scroll. A phone has to show the board, the keypad
     * and a way to reach the coach at once — scrolling between them turns
     * every hint into a hunt — so the board is the thing that gives: it takes
     * whatever height the chrome leaves and stays square.
     */
    <div className="relative mx-auto flex h-dvh w-full max-w-xl flex-col overflow-hidden sm:h-auto sm:min-h-dvh sm:overflow-visible">
      <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
        <IconButton
          label={t('action.back')}
          icon={<ChevronLeftIcon />}
          className="flex-none"
          onClick={onExit}
        />
        <div className="min-w-0 flex-1">
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
        <IconButton
          label={t('game.menu')}
          icon={<MoreIcon />}
          className="flex-none"
          onClick={() => setMenuOpen(true)}
        />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-2">
        {/*
          * The board takes the height nobody else claimed and stays square, so
          * it is the piece that gives when a screen is short. A fixed height
          * budget was tried and is wrong: the coach panel is a different height
          * on a phone than on a laptop, and the board has to answer to what is
          * actually there.
          */}
        <div className="flex min-h-0 flex-1 items-center justify-center sm:block sm:flex-none">
          <div className="relative aspect-square h-full max-w-full sm:h-auto sm:w-full">
            <SudokuGrid
            cells={game.cells}
            selected={selected}
            onSelect={setSelected}
            onEnter={enter}
            onClear={(cell) => dispatch({ type: 'clearCell', cell })}
            spotlight={spotlight}
            tintedHouses={coach.hint?.houses ?? []}
            conflicts={conflicts}
            staleMarks={stale}
            highlightDigit={highlightDigit}
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

        <Keypad
          className="min-h-[11.5rem] shrink-0"
          values={values}
          pencilMode={pencilMode}
          onTogglePencil={() => setPencilMode((on) => !on)}
          onDigit={(digit) => {
            const { entered, highlight } = keypadTap(
              selected,
              selected !== null ? (game.cells[selected]?.value ?? null) : null,
              digit,
              highlightDigit,
            );
            if (entered) enter(selected as CellIndex, digit);
            setHighlightDigit(highlight);
          }}
          onErase={() => {
            if (selected !== null) dispatch({ type: 'clearCell', cell: selected });
          }}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          canUndo={game.undoStack.length > 0}
          canRedo={game.redoStack.length > 0}
          disabled={paused || solved}
          highlighted={highlightDigit}
          onHaptic={haptic}
        />
      </main>

      {/*
        * Resting, the coach is one button floating over the board's corner. It
        * used to be a bar in the flow, and a bar is height the square board
        * gave up for a control the player was not using yet. Speaking, it is a
        * sheet over the keypad. Neither state is a flow child, which is what
        * keeps the board the same size from the first move to the last.
        */}
      {!sheetOpen ? (
        <IconButton
          size="lg"
          label={coach.nudge === null ? t('coach.open') : t('coach.openWaiting')}
          icon={<CoachIcon />}
          // The keypad's floor (min-h-[11.5rem] below) plus <main>'s own
          // pb-2 (0.5rem) puts its top edge 12rem off the screen bottom;
          // 13rem leaves a 1rem gap above it. The two numbers are coupled —
          // raise the keypad's floor and this one has to follow.
          className={cx(
            'absolute right-4 bottom-[13rem] z-20 shadow-lift sm:hidden',
            coach.nudge !== null &&
              'after:absolute after:top-0 after:right-0 after:size-3 after:rounded-full after:bg-coach',
          )}
          onClick={() => setSheetOpen(true)}
        />
      ) : null}

      {sheetOpen ? (
        <div
          className="absolute inset-0 z-10 bg-ink/20 sm:hidden"
          onClick={() => {
            setSheetOpen(false);
            coach.dismiss();
          }}
          aria-hidden="true"
        />
      ) : null}

      <div
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
          onCollapse={speaking ? coach.dismiss : undefined}
          nudge={coach.nudge}
          onDismissNudge={coach.dismissNudge}
          staleCount={staleCount}
          onClearStale={() => dispatch({ type: 'clearStaleCandidates' })}
        />
      </div>

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
    </div>
  );
}
