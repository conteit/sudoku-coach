/**
 * The rules of one exercise, as a pure function.
 *
 * An exercise is a drill, not a game, and the difference is entirely in what
 * a move is allowed to do. On a real board every legal move lands and the
 * coach waits to be asked; here a move is an *answer*, judged the moment it
 * is made against the one step the position is about. So the judging lives in
 * a reducer of its own, wrapped around the game reducer rather than replacing
 * it: undo, redo and the move log are the same code every board uses, and the
 * only thing this adds is which moves are allowed to reach it.
 *
 * Nothing here is persisted. There is no store, no Dexie row, no mastery
 * credit and no sync — an exercise is generated, worked and thrown away, and
 * `LiveGame` is used purely as an in-memory board that already knows how to
 * undo. That is why every action carries its own `at` and why the session
 * holds the game rather than the store holding it.
 *
 * Feedback is a code, never a sentence. The reducer has no locale and must
 * not acquire one (invariant 7); the screen turns these into text.
 */

import { formatGrid } from '../engine/board';
import { gridOf, type ExercisePosition } from '../engine/exercise';
import { DETECTORS } from '../engine/techniques';
import type { CellIndex, Difficulty, Digit, Finding, TechniqueId } from '../engine/types';
import { marksOf, patternRoles, type PatternRole } from '../coach/roles';
import { newGame, reduce } from '../state/game';
import type { LiveGame } from '../state/types';

/** Whether the technique is given, or is itself part of the question. */
export type ExerciseMode =
  | { kind: 'technique'; technique: TechniqueId }
  | { kind: 'open'; difficulty: Difficulty };

export type ExerciseStage =
  /** Open mode only: which technique applies here? */
  | { kind: 'naming' }
  /** Point at the cells playing role `step`. */
  | { kind: 'roles'; step: number }
  /** Now do what the pattern proves. */
  | { kind: 'applying' }
  | { kind: 'solved' };

/**
 * Why an answer was refused. Deliberately about *this step* rather than about
 * the board: "the pattern does not prove that" is something the position can
 * back up, where "that digit is impossible" would be a claim about the
 * solution, which no exercise is allowed to make.
 */
export type FeedbackCode =
  /** Not one of the cells playing the role being asked for. */
  | 'roleWrong'
  /** That technique does not apply to this board. */
  | 'techniqueWrong'
  /** An elimination this pattern does not prove. */
  | 'notProved'
  /** A placement this step does not prove. */
  | 'notPlaced';

export interface ExerciseSession {
  mode: ExerciseMode;
  stage: ExerciseStage;
  /** The step being drilled. In open mode, whichever one the player named. */
  finding: Finding;
  roles: PatternRole[];
  /** Cells the player has correctly named, across every role so far. */
  named: CellIndex[];
  feedback: FeedbackCode | null;
  game: LiveGame;
  position: ExercisePosition;
}

export type SessionAction =
  | { type: 'name'; technique: TechniqueId }
  | { type: 'pick'; cell: CellIndex }
  | { type: 'place'; cell: CellIndex; digit: Digit; at: number }
  | { type: 'note'; cell: CellIndex; digit: Digit; at: number }
  | { type: 'clear'; cell: CellIndex; at: number }
  | { type: 'undo'; at: number }
  | { type: 'redo'; at: number }
  | { type: 'dismissFeedback' };

export interface StartInput {
  mode: ExerciseMode;
  position: ExercisePosition;
  /** The generated puzzle's solution. Engine-only, and never read here. */
  solution: string;
  difficulty: Difficulty;
  at: number;
  /** Supply in tests; otherwise `newGame` mints one. */
  id?: string;
}

const rolesOf = (position: ExercisePosition, finding: Finding): PatternRole[] =>
  patternRoles(finding, marksOf(position.candidates));

/** Has the player done everything the step proves? */
export function stepSolved(game: LiveGame, finding: Finding): boolean {
  return (
    finding.placements.every(({ cell, digit }) => game.cells[cell].value === digit) &&
    finding.eliminations.every(({ cell, digit }) => !game.cells[cell].candidates.has(digit))
  );
}

export function startSession(input: StartInput): ExerciseSession {
  const { mode, position } = input;
  return {
    mode,
    position,
    stage: mode.kind === 'open' ? { kind: 'naming' } : { kind: 'roles', step: 0 },
    finding: position.finding,
    roles: rolesOf(position, position.finding),
    named: [],
    feedback: null,
    game: newGame({
      givens: formatGrid(position.values),
      solution: input.solution,
      difficulty: input.difficulty,
      at: input.at,
      id: input.id,
      // The position *is* the premise, so everything already placed is a
      // given: an exercise is not a puzzle to finish, and a player who could
      // edit the cells the pattern rests on would be drilling a board that no
      // longer contains it.
      candidates: position.candidates,
    }),
  };
}

/** Roles are asked for one at a time, in the order `patternRoles` gives them. */
const advance = (session: ExerciseSession, step: number, named: CellIndex[]): ExerciseSession => {
  const done = session.roles[step].cells.every((cell) => named.includes(cell));
  if (!done) return { ...session, named, feedback: null };
  const next = step + 1;
  return {
    ...session,
    named,
    feedback: null,
    stage: next < session.roles.length ? { kind: 'roles', step: next } : { kind: 'applying' },
  };
};

/**
 * Applying and solved are the same state read twice — the step is solved or it
 * is not — so an undo that takes an elimination back returns the player to
 * work rather than leaving a stale congratulation on screen.
 */
const settle = (session: ExerciseSession, game: LiveGame): ExerciseSession => ({
  ...session,
  game,
  stage: stepSolved(game, session.finding) ? { kind: 'solved' } : { kind: 'applying' },
});

function named(session: ExerciseSession, action: Extract<SessionAction, { type: 'name' }>) {
  // Any technique that genuinely applies here is a right answer, not just the
  // one the generator happened to stop on: two techniques can both be true of
  // one board, and marking a correct reading wrong would teach the opposite of
  // what the exercise is for. The drill then continues on *their* pattern.
  const finding = DETECTORS[action.technique].detect(gridOf(session.position));
  if (finding === null) return { ...session, feedback: 'techniqueWrong' as const };
  return {
    ...session,
    finding,
    roles: rolesOf(session.position, finding),
    named: [],
    feedback: null,
    stage: { kind: 'roles', step: 0 } as const,
  };
}

export function reduceSession(session: ExerciseSession, action: SessionAction): ExerciseSession {
  switch (action.type) {
    case 'dismissFeedback':
      return session.feedback === null ? session : { ...session, feedback: null };

    case 'name':
      return session.stage.kind === 'naming' ? named(session, action) : session;

    case 'pick': {
      if (session.stage.kind !== 'roles') return session;
      const { step } = session.stage;
      if (!session.roles[step].cells.includes(action.cell)) {
        return { ...session, feedback: 'roleWrong' };
      }
      if (session.named.includes(action.cell)) return { ...session, feedback: null };
      return advance(session, step, [...session.named, action.cell]);
    }

    case 'place': {
      if (session.stage.kind !== 'applying' && session.stage.kind !== 'solved') return session;
      const proved = session.finding.placements.some(
        ({ cell, digit }) => cell === action.cell && digit === action.digit,
      );
      if (!proved) return { ...session, feedback: 'notPlaced' };
      return settle(
        { ...session, feedback: null },
        reduce(session.game, {
          type: 'setValue',
          cell: action.cell,
          digit: action.digit,
          at: action.at,
        }),
      );
    }

    case 'note': {
      if (session.stage.kind !== 'applying' && session.stage.kind !== 'solved') return session;
      const held = session.game.cells[action.cell].candidates.has(action.digit);
      // Writing a mark back is thinking out loud and is never refused; it is
      // only the *removal* that claims something, so it is only the removal
      // that has to be earned.
      if (!held) {
        return settle(
          { ...session, feedback: null },
          reduce(session.game, {
            type: 'addCandidate',
            cell: action.cell,
            digit: action.digit,
            at: action.at,
          }),
        );
      }
      const proved = session.finding.eliminations.some(
        ({ cell, digit }) => cell === action.cell && digit === action.digit,
      );
      if (!proved) return { ...session, feedback: 'notProved' };
      return settle(
        { ...session, feedback: null },
        reduce(session.game, {
          type: 'removeCandidate',
          cell: action.cell,
          digit: action.digit,
          at: action.at,
        }),
      );
    }

    case 'clear': {
      if (session.stage.kind !== 'applying' && session.stage.kind !== 'solved') return session;
      // Only ever takes back the player's own placement. Everything else on
      // the board is a given — the position is the premise — and the reducer
      // would no-op on those anyway; refusing here is what keeps the eraser
      // from looking like it did nothing.
      const cell = session.game.cells[action.cell];
      if (cell.value === null || cell.given) return session;
      return settle(
        { ...session, feedback: null },
        reduce(session.game, { type: 'clearCell', cell: action.cell, at: action.at }),
      );
    }

    case 'undo':
    case 'redo':
      return settle(
        { ...session, feedback: null },
        reduce(session.game, { type: action.type, at: action.at }),
      );
  }
}
