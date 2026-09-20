/**
 * The practice screen.
 *
 * A grid built on the spot to drill one technique, and thrown away when the
 * player leaves. Nothing here reaches the store, Dexie, mastery or sync: the
 * board is a `LiveGame` held in this component's state because the reducer
 * already knows how to undo, and that is the whole of its involvement with
 * the rest of the app.
 *
 * Two things about the layout are deliberate.
 *
 * The **prompt lives in the header**, not in the panel. On a phone the panel
 * is a sheet the player has to open — that is `GameView`'s pattern and
 * invariant 9's sanctioned answer to a narrow screen — and the one line that
 * says what to do cannot be behind a button. The header's message box is a
 * fixed two lines high at every tier for the same invariant: it holds the
 * prompt and, when an answer is refused, the refusal, so a message that comes
 * and goes never changes the board's box.
 *
 * The **coaching is `CoachPanel`**, not a copy of it. An exercise asks the
 * coach exactly what a game asks it, and the finding is already known here,
 * so the ladder runs on `renderHint` directly rather than on `createCoach` —
 * which could not re-derive this step anyway, since it builds from values
 * alone and the position's marks are the solver's, not the board's
 * (`engine/exercise.ts` has the long version).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { escalatedLevel, recordExchange, renderHint, resumeLevel } from '../coach/coach';
import { findingKey } from '../coach/format';
import { getLesson } from '../coach/lessons';
import type { Hint } from '../coach/types';
import {
  bandFor,
  exerciseAmong,
  exerciseFor,
  type ExercisePosition,
  type PositionQuality,
} from '../engine/exercise';
import {
  DIFFICULTY_TECHNIQUES,
  TECHNIQUE_IDS,
  type CellIndex,
  type Difficulty,
  type Digit,
  type TechniqueId,
} from '../engine/types';
import { useT } from '../i18n/locale';
import type { CoachExchange, PlayerProfile } from '../state/types';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { ChevronLeftIcon, TargetIcon } from '../ui/primitives/icons';
import { cx } from '../ui/primitives/cx';
import { SudokuGrid } from '../ui/board/SudokuGrid';
// The exercise screen marked every named cell with one
// undifferentiated ring, so the roles it is asking about — pivot, then wings —
// were named in the prompt and invisible on the board. The same overlay the
// claim flow uses gives them the same two tones there as here, which is the
// consistency Paolo asked for and, on this screen, also a straight
// improvement: the thing being taught is now drawn.
import { MARK_DASHED, MARK_ON } from '../ui/board/patternMark';
import { Keypad } from '../ui/keypad/Keypad';
import { ExercisePanel } from '../ui/learn/ExercisePanel';
import { LessonBody } from '../ui/learn/LessonBody';
import { TechniqueIndex } from '../ui/learn/TechniqueIndex';
import { GameLayout } from './GameLayout';
import {
  reduceSession,
  startSession,
  type ExerciseMode,
  type ExerciseSession,
  type SessionAction,
} from './exerciseSession';
import { useGenerator } from './useGenerator';
import { useViewportTier } from './useViewportTier';

/**
 * The band the mixed exercise generates at.
 *
 * `expert` because its catalog is the whole catalog: an expert solve path
 * still opens with naked singles, so drawing a technique from one of these
 * puzzles can land anywhere in the fourteen, where a `medium` grid could only
 * ever ask about six. It is not a harder *question* — the exercise is one
 * step either way — only a busier grid to find it on.
 */
const MIXED_BAND: Difficulty = 'expert';

/**
 * Puzzles to dig before settling for the best position found so far.
 *
 * Every one of them is used: the search grades what it finds rather than
 * taking the first hit, so a run that never turns up an `exclusive` position
 * still returns the best `clean` one it saw. An exclusive position ends the
 * loop early, which is the common case — for most techniques the first puzzle
 * has one. The stubborn ones spend the whole budget, which at ~250ms a puzzle
 * in the worker is a second and a half of "building a grid".
 */
const ATTEMPTS = 6;

const RANK: Record<PositionQuality, number> = { exclusive: 0, clean: 1, shared: 2 };

const better = (a: ExercisePosition, b: ExercisePosition | null): boolean =>
  b === null || RANK[a.quality] < RANK[b.quality];

export interface ExerciseViewProps {
  /** The technique to drill, or null for the mixed exercise. */
  technique: TechniqueId | null;
  profile: PlayerProfile;
  onExit: () => void;
  onLearn: (technique: TechniqueId) => void;
}

export function ExerciseView({ technique, profile, onExit, onLearn }: ExerciseViewProps) {
  const t = useT();
  const tier = useViewportTier();
  const locale = profile.locale;
  const { generate } = useGenerator();

  const [session, setSession] = useState<ExerciseSession | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<CellIndex | null>(null);
  const [pencil, setPencil] = useState(true);
  const [hint, setHint] = useState<Hint | null>(null);
  const [log, setLog] = useState<CoachExchange[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  /*
   * One build per (technique, attempt). `generate` is stable, so this runs
   * when the player asks for a new grid and at no other time; `cancelled` is
   * what stops a build the player has already left from writing a session
   * into an unmounted screen.
   */
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setFailed(false);
    setSelected(null);
    setPencil(true);

    void (async () => {
      const band = technique === null ? MIXED_BAND : bandFor(technique);
      const mode: ExerciseMode =
        technique === null
          ? { kind: 'open', difficulty: MIXED_BAND }
          : { kind: 'technique', technique };
      let best: { position: ExercisePosition; solution: string; difficulty: Difficulty } | null =
        null;

      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const result = await generate(band);
        if (cancelled) return;
        // A null result is the worker having failed or the run having been
        // abandoned. Either way there is no grid coming, and saying so beats
        // leaving "building a grid" on screen forever.
        if (result === null) break;

        const position =
          technique === null
            ? exerciseAmong(result.puzzle.givens, DIFFICULTY_TECHNIQUES[MIXED_BAND])
            : exerciseFor(result.puzzle.givens, technique);

        if (position !== null && better(position, best?.position ?? null)) {
          best = {
            position,
            solution: result.puzzle.solution,
            difficulty: result.puzzle.difficulty,
          };
        }
        // Nothing beats the solver's own next step, so stop paying for more.
        if (best?.position.quality === 'exclusive') break;
      }

      if (cancelled) return;
      if (best === null) {
        setFailed(true);
        return;
      }
      setSession(
        startSession({
          mode,
          position: best.position,
          solution: best.solution,
          difficulty: best.difficulty,
          at: Date.now(),
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [technique, attempt, generate]);

  const stage = session?.stage.kind ?? null;
  const naming = stage === 'naming';
  const working = stage === 'applying' || stage === 'solved';

  /*
   * The technique, but only once naming it is no longer the question.
   *
   * `session.finding` is set the moment the grid is built, so in the mixed
   * exercise it holds the answer while the screen is still asking for it.
   * Reading it straight put the technique's name in the heading over
   * "which technique moves this board on?", and the lesson beside it — the
   * question answered twice before it was asked.
   */
  const drilled = naming ? null : (session?.finding.technique ?? null);
  const key = session === null ? '' : findingKey(session.finding);

  // A new grid, or a newly named technique in the mixed exercise, is a new
  // argument: the ladder starts again rather than resuming where the last
  // one left off.
  useEffect(() => {
    setHint(null);
    setLog([]);
  }, [key]);

  const dispatch = useCallback((action: SessionAction) => {
    setSession((current) => (current === null ? current : reduceSession(current, action)));
  }, []);

  const showHint = useCallback(
    (level: 1 | 2 | 3 | 4) => {
      if (session === null) return;
      const rendered = renderHint({ finding: session.finding, level, locale });
      setHint(rendered);
      setLog((current) => recordExchange(current, rendered, Date.now()));
    },
    [session, locale],
  );

  // The sheet is the panel on a phone, so the two moments that *are* the
  // panel — the question in the mixed exercise, and the answer at the end —
  // open it themselves rather than waiting to be found.
  useEffect(() => {
    if (naming || stage === 'solved') setSheetOpen(true);
  }, [naming, stage]);

  const selectCell = useCallback(
    (cell: CellIndex) => {
      setSelected(cell);
      if (stage === 'roles') dispatch({ type: 'pick', cell });
    },
    [dispatch, stage],
  );

  const enter = useCallback(
    (cell: CellIndex, digit: Digit) => {
      dispatch(
        pencil
          ? { type: 'note', cell, digit, at: Date.now() }
          : { type: 'place', cell, digit, at: Date.now() },
      );
    },
    [dispatch, pencil],
  );

  // The hint's own spotlight stays the board's, but the cells the *player*
  // has named are the overlay's — the same division the game screen keeps.
  const spotlight = useMemo(() => [...new Set(hint?.spotlight ?? [])], [hint]);

  /**
   * The cells the player has named, as marks the board draws under its own
   * content. Only XY-Wing divides, which is `roles.ts`'s own finding — its
   * pivot is the one cell doing something different, so the wings are the ones
   * drawn dashed.
   */
  const named = useMemo(() => {
    const marks = new Array(81).fill(0);
    for (const cell of session?.named ?? []) {
      const role = session?.roles.find((entry) => entry.cells.includes(cell))?.id;
      marks[cell] = MARK_ON | (role === 'wings' ? MARK_DASHED : 0);
    }
    return marks;
  }, [session?.named, session?.roles]);

  const title =
    technique !== null
      ? getLesson(locale, technique).name
      : drilled !== null
        ? getLesson(locale, drilled).name
        : t('exercise.openTitle');

  const message = useMemo(() => {
    if (session === null) return failed ? t('exercise.unavailable') : t('exercise.building');
    if (session.feedback !== null) return t(`exercise.feedback.${session.feedback}`);
    switch (session.stage.kind) {
      case 'naming':
        return t('exercise.naming');
      case 'roles': {
        const role = session.roles[session.stage.step];
        const count = role.cells.length;
        switch (role.id) {
          case 'cell':
            return t('exercise.prompt.cell');
          case 'pivot':
            return t('exercise.prompt.pivot');
          case 'pattern':
            return t('exercise.prompt.pattern', { count });
          case 'corners':
            return t('exercise.prompt.corners', { count });
          case 'wings':
            return t('exercise.prompt.wings', { count });
          case 'chain':
            return t('exercise.prompt.chain', { count });
        }
        break;
      }
      case 'applying':
        return session.finding.placements.length > 0
          ? t('exercise.prompt.placement')
          : t('exercise.prompt.eliminations', {
              count: session.finding.eliminations.filter(
                ({ cell, digit }) => session.game.cells[cell].candidates.has(digit),
              ).length,
            });
      case 'solved':
        return t('exercise.solved');
    }
    return '';
  }, [session, failed, t]);

  if (session === null) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
        <p aria-live="polite" className="text-sm text-ink-soft">
          {message}
        </p>
        <div className="flex w-full flex-col gap-2">
          {/* Retry only once there is something to retry. The way out is
              always here: a player must never be held by a grid that is
              still being dug. */}
          {failed ? (
            <Button variant="primary" size="lg" block onClick={() => setAttempt((a) => a + 1)}>
              {t('exercise.retry')}
            </Button>
          ) : null}
          <Button variant="ghost" size="lg" block onClick={onExit}>
            {t('exercise.exit')}
          </Button>
        </div>
      </div>
    );
  }

  const header = (
    // Laid out like Learn's header, which is the screen this one is reached
    // from: back control, then a title block. `flex-none` on the button is
    // the whole difference between that and a `<` stretched across half the
    // width — `IconButton` defaults to `flex-1` for the keypad's tool row.
    <header className="flex items-start gap-3 px-3 pt-4 pb-2 sm:px-0">
      <IconButton
        label={t('action.back')}
        icon={<ChevronLeftIcon />}
        className="flex-none"
        onClick={onExit}
      />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-2xl leading-none text-ink">{title}</h1>
        {/* Two lines, always, whatever it is saying. See the module comment:
            this is the box invariant 9 would otherwise be at the mercy of. */}
        <p
          aria-live="polite"
          className={cx(
            'mt-1.5 h-10 overflow-hidden text-sm leading-5',
            session.feedback === null ? 'text-ink-soft' : 'font-medium text-coach',
          )}
        >
          {message}
        </p>
      </div>
      <IconButton
        label={t('exercise.openPanel')}
        icon={<TargetIcon />}
        onClick={() => setSheetOpen((open) => !open)}
        pressed={sheetOpen}
        className="flex-none sm:hidden"
      />
    </header>
  );

  const board = (
    <div className="flex min-h-0 flex-1 items-center justify-center sm:block sm:flex-none">
      <div className="relative aspect-square h-full max-w-full sm:h-auto sm:w-full">
        <SudokuGrid
          cells={session.game.cells}
          selected={selected}
          onSelect={selectCell}
          onEnter={working ? enter : undefined}
          onClear={working ? (cell) => dispatch({ type: 'clear', cell, at: Date.now() }) : undefined}
          spotlight={spotlight}
          tintedHouses={hint?.houses ?? []}
          highlightPeers={profile.settings.highlightPeers}
          highlightMatches={profile.settings.highlightMatches}
          highlightMatchingNotes={profile.settings.highlightMatchingNotes}
          shadeDigitPeers={profile.settings.shadeDigitPeers}
          colorEntries={profile.settings.colorEntries}
          patternMarks={named}
        />
      </div>
    </div>
  );

  const erasable =
    selected !== null &&
    session.game.cells[selected].value !== null &&
    !session.game.cells[selected].given;

  const keypad = (
    <Keypad
      className="min-h-[11.5rem] shrink-0"
      values={session.game.cells.map((cell) => cell.value)}
      pencilMode={pencil}
      onTogglePencil={() => setPencil((on) => !on)}
      onDigit={(digit) => {
        if (selected !== null) enter(selected, digit);
      }}
      onErase={() => {
        if (selected !== null) dispatch({ type: 'clear', cell: selected, at: Date.now() });
      }}
      canErase={erasable}
      onUndo={() => dispatch({ type: 'undo', at: Date.now() })}
      onRedo={() => dispatch({ type: 'redo', at: Date.now() })}
      canUndo={session.game.undoStack.length > 0}
      canRedo={session.game.redoStack.length > 0}
      // Until the cells are named there is nothing to enter: the question on
      // screen is about where the pattern is, not about what it proves.
      disabled={!working}
    />
  );

  const panel = (
    <>
      {sheetOpen ? (
        <button
          type="button"
          aria-label={t('action.close')}
          tabIndex={-1}
          onClick={() => setSheetOpen(false)}
          className="absolute inset-0 z-10 cursor-default bg-ink/20 sm:hidden"
        />
      ) : null}
      <div
        role={sheetOpen && tier === 'phone' ? 'dialog' : undefined}
        aria-modal={sheetOpen && tier === 'phone' ? true : undefined}
        aria-label={sheetOpen && tier === 'phone' ? t('exercise.panel') : undefined}
        className={cx(
          'bg-paper-raised sm:static sm:block sm:max-h-none sm:overflow-visible sm:shadow-none',
          sheetOpen
            ? 'absolute inset-x-0 bottom-0 z-20 max-h-[72dvh] overflow-y-auto shadow-lift'
            : 'hidden',
        )}
      >
        <ExercisePanel
          techniqueLabel={drilled === null ? null : getLesson(locale, drilled).name}
          choices={
            naming
              ? TECHNIQUE_IDS.map((id) => ({ id, name: getLesson(locale, id).name }))
              : undefined
          }
          onName={naming ? (named) => dispatch({ type: 'name', technique: named }) : undefined}
          quality={session.position.quality}
          solved={stage === 'solved'}
          hint={hint}
          onAsk={() => showHint(resumeLevel(log, key))}
          onEscalate={() => showHint(escalatedLevel(log, key))}
          onNewGrid={() => setAttempt((a) => a + 1)}
          onExit={onExit}
          onLearn={drilled === null ? undefined : onLearn}
        />
      </div>
    </>
  );

  return (
    <GameLayout
      tier={tier}
      header={header}
      board={board}
      keypad={keypad}
      coach={panel}
      lesson={
        // Never before it has been named: in the mixed exercise the lesson
        // beside the board would be the answer to the question on screen.
        drilled === null
          ? { title: t('learn.techniques.title'), body: <TechniqueIndex profile={profile} /> }
          : {
              title: getLesson(locale, drilled).name,
              body: <LessonBody id={drilled} profile={profile} titleAs="h2" />,
            }
      }
    />
  );
}
