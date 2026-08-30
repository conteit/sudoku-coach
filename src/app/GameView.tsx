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
import type { CellIndex, Digit } from '../engine/types';
import { getLesson } from '../coach/lessons';
import type { CoachExchange, LiveGame, Locale, PlayerProfile } from '../state/types';
import { useGameStore } from '../state/store';
import { useT } from '../i18n/locale';
import { SudokuGrid } from '../ui/board/SudokuGrid';
import { CoachPanel } from '../ui/coach/CoachPanel';
import { ConfirmDialog } from '../ui/game/ConfirmDialog';
import { DifficultyBadge } from '../ui/game/DifficultyBadge';
import { Timer } from '../ui/game/Timer';
import { formatDuration } from '../ui/game/duration';
import { Keypad, type HapticPattern } from '../ui/keypad/Keypad';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { Sheet } from '../ui/primitives/Sheet';
import { ChevronLeftIcon, SettingsIcon, TrashIcon, UndoIcon } from '../ui/primitives/icons';
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
}

/** Cells holding a digit that repeats in one of their houses. */
function conflictsOf(values: readonly (Digit | null)[]): CellIndex[] {
  const board = Board.fromValues(values);
  const flagged: CellIndex[] = [];
  for (let cell = 0; cell < values.length; cell++) {
    if (values[cell] !== null && board.conflictsAt(cell).length > 0) flagged.push(cell);
  }
  return flagged;
}

export function GameView({
  game,
  settings,
  locale,
  onExit,
  onOpenSettings,
  onNewGame,
}: GameViewProps) {
  const t = useT();
  const dispatch = useGameStore((state) => state.dispatch);
  const removeGame = useGameStore((state) => state.removeGame);

  const [selected, setSelected] = useState<CellIndex | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [confirming, setConfirming] = useState<'restart' | 'delete' | null>(null);
  const [reviewSpotlight, setReviewSpotlight] = useState<readonly CellIndex[]>([]);

  const values = useMemo(() => game.cells.map((cell) => cell.value), [game.cells]);
  const conflicts = useMemo(
    () => (settings.highlightConflicts ? conflictsOf(values) : []),
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

  const paused = game.runningSince === null && game.completedAt === null;
  const solved = game.completedAt !== null;

  // The coach's spotlight is the hint's, unless the player is pointing at a
  // note the review flagged — that is a more specific thing to be looking at.
  const spotlight = reviewSpotlight.length > 0 ? reviewSpotlight : (coach.hint?.spotlight ?? []);
  const nudgeCells =
    coach.nudge === null
      ? []
      : coach.nudge.kind === 'contradiction'
        ? [coach.nudge.cell]
        : coach.nudge.kind === 'stale_marks'
          ? coach.nudge.cells
          : [];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="flex items-center gap-3 px-4 pt-4 pb-3">
        <IconButton label={t('action.back')} icon={<ChevronLeftIcon />} onClick={onExit} />
        <div className="min-w-0 flex-1">
          <DifficultyBadge difficulty={game.difficulty} />
        </div>
        <Timer elapsedMs={game.elapsedMs} runningSince={game.runningSince} size="md" />
        <IconButton
          label={paused ? t('action.resume') : t('action.pause')}
          icon={<span aria-hidden="true">{paused ? '▶' : '⏸'}</span>}
          disabled={solved}
          onClick={() => dispatch({ type: paused ? 'resume' : 'pause' })}
        />
        <IconButton label={t('settings.title')} icon={<SettingsIcon />} onClick={onOpenSettings} />
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pb-4">
        <div className="relative">
          <SudokuGrid
            cells={game.cells}
            selected={selected}
            onSelect={setSelected}
            onEnter={enter}
            onClear={(cell) => dispatch({ type: 'clearCell', cell })}
            spotlight={spotlight}
            tintedHouses={coach.hint?.houses ?? []}
            conflicts={conflicts}
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

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" icon={<UndoIcon />} onClick={() => setConfirming('restart')}>
            {t('action.restart')}
          </Button>
          <IconButton
            label={t('action.delete')}
            icon={<TrashIcon />}
            onClick={() => setConfirming('delete')}
          />
        </div>

        <Keypad
          values={values}
          pencilMode={pencilMode}
          onTogglePencil={() => setPencilMode((on) => !on)}
          onDigit={(digit) => {
            if (selected !== null) enter(selected, digit);
          }}
          onErase={() => {
            if (selected !== null) dispatch({ type: 'clearCell', cell: selected });
          }}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          canUndo={game.undoStack.length > 0}
          canRedo={game.redoStack.length > 0}
          disabled={selected === null || paused || solved}
          onHaptic={haptic}
        />
      </main>

      {coach.nudge !== null ? (
        <aside className="mx-4 mb-3 flex items-center gap-3 rounded-cell border border-coach/35 bg-coach-wash px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-coach">
            {coach.nudge.kind === 'contradiction'
              ? t('coach.nudge.contradiction')
              : coach.nudge.kind === 'stale_marks'
                ? t('coach.nudge.staleMarks')
                : t('coach.nudge.stuck')}
          </p>
          {nudgeCells.length > 0 ? (
            <Button variant="coach" onClick={() => setReviewSpotlight(nudgeCells)}>
              {t('coach.nudge.show')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={coach.dismissNudge}>
            {t('action.dismiss')}
          </Button>
        </aside>
      ) : null}

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
      />

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
      />
    </div>
  );
}
