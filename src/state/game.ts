/**
 * Game reducer: moves, undo/redo and the per-game clock (spec §5.2 state/game,
 * R2, R4, R5).
 *
 * Three rules shape everything here.
 *
 * 1. The reducer is pure and clock-free. Every action that needs a timestamp
 *    carries one, so a test can drive a whole game — including the timer —
 *    without faking `Date.now`. The store layer is the only place allowed to
 *    read a real clock.
 * 2. Pencil marks are the player's (architecture invariant 1). No branch below
 *    edits candidates unless the player asked for it, and every edit that does
 *    happen leaves a `Move` behind. Stale marks after a placement are the
 *    player's to clear.
 * 3. Undo restores a cell wholesale from `Move.prev`, never by inverting the
 *    action. That is why `prev` carries both the value and the candidates: a
 *    placement wipes the cell's marks, and only a recorded snapshot can bring
 *    them back exactly.
 *
 * **Batching.** `Game.undoStack` is a frozen flat `Move[]`, so a batch cannot be
 * a nested object. Instead a batch is the trailing run of moves sharing one
 * `at` timestamp, and the reducer keeps `at` strictly increasing across
 * distinct actions (`nextAt`) so two independent actions can never be mistaken
 * for one batch — even when they land in the same millisecond. Undo and redo
 * both consume a whole run, so "fill candidates" and "reset" cost one press.
 * `topBatch` exposes that grouping as the frozen `MoveBatch` shape for the UI.
 */

import { Board, CELL_COUNT, parseGrid } from '../engine/board';
import type { Cell, CellIndex, Difficulty, Digit } from '../engine/types';
import type { Game, LiveGame, Move, MoveBatch, MoveKind } from './types';

/**
 * Ceiling on a game's move log. A pencil-mark toggle is a move, so an unbounded
 * log is unbounded IndexedDB growth for a player who fidgets. Old history is
 * dropped a whole batch at a time so the stack never starts mid-run.
 */
export const MAX_HISTORY = 2000;

export interface NewGameInput {
  /** 81-char puzzle string, '.' for empty. */
  givens: string;
  /** 81-char solution, engine-only (architecture invariant 2). */
  solution: string;
  difficulty: Difficulty;
  at: number;
  /** Supply in tests or when restoring; otherwise a UUID is minted. */
  id?: string;
  /** Games start paused; the store resumes the one the player is looking at. */
  running?: boolean;
}

export type GameAction =
  | { type: 'setValue'; cell: CellIndex; digit: Digit; at: number }
  | { type: 'clearCell'; cell: CellIndex; at: number }
  | { type: 'toggleCandidate'; cell: CellIndex; digit: Digit; at: number }
  | { type: 'addCandidate'; cell: CellIndex; digit: Digit; at: number }
  | { type: 'removeCandidate'; cell: CellIndex; digit: Digit; at: number }
  | { type: 'clearCandidates'; cell: CellIndex; at: number }
  | { type: 'fillCandidates'; at: number }
  | { type: 'reset'; at: number }
  | { type: 'undo'; at: number }
  | { type: 'redo'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number };

const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `game-${Date.now().toString(36)}`;

/** A fresh game from a generated puzzle. Givens are locked in immediately. */
export function newGame(input: NewGameInput): LiveGame {
  const values = parseGrid(input.givens);
  if (parseGrid(input.solution).some((v) => v === null)) {
    throw new Error('solution must be a complete grid');
  }
  return {
    id: input.id ?? newId(),
    createdAt: input.at,
    updatedAt: input.at,
    difficulty: input.difficulty,
    givens: input.givens,
    solution: input.solution,
    cells: values.map((value) => ({ value, given: value !== null, candidates: new Set<Digit>() })),
    undoStack: [],
    redoStack: [],
    elapsedMs: 0,
    runningSince: input.running === true ? input.at : null,
    completedAt: null,
    coachLog: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Live -> stored. Candidate sets become sorted arrays so the same board always
 * serializes to the same bytes; a save/load round trip is then a deep equality
 * check, not a set comparison.
 */
export const toStored = (live: LiveGame): Game => ({
  ...live,
  cells: live.cells.map((c) => ({
    value: c.value,
    given: c.given,
    candidates: [...c.candidates].sort((a, b) => a - b),
  })),
});

/** Stored -> live. Sets are rehydrated; everything else is already plain data. */
export const toLive = (stored: Game): LiveGame => ({
  ...stored,
  cells: stored.cells.map((c) => ({
    value: c.value,
    given: c.given,
    candidates: new Set(c.candidates),
  })),
});

/* -------------------------------------------------------------------------- */
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

const valuesOf = (game: LiveGame): (Digit | null)[] => game.cells.map((c) => c.value);

/**
 * Complete means "a valid full grid", checked against the constraints rather
 * than the stored solution: the puzzle is unique, so a legal full grid is the
 * solution, and invariant 2 keeps the solution string out of gameplay logic.
 */
export const isComplete = (game: LiveGame): boolean => Board.fromValues(valuesOf(game)).isSolved();

/**
 * Percent of the cells the player has to fill that now hold a digit. It counts
 * filled cells, not correct ones — a progress bar that dips on a wrong digit
 * would leak the solution one cell at a time (R7).
 */
export function progress(game: { cells: readonly Pick<Cell, 'value' | 'given'>[] }): number {
  const open = game.cells.filter((c) => !c.given);
  if (open.length === 0) return 100;
  return Math.round((open.filter((c) => c.value !== null).length / open.length) * 100);
}

/**
 * Elapsed time including the stretch currently running. Typed on the two clock
 * fields so the game list can call it on a stored record without rehydrating.
 */
export const elapsedAt = (
  game: Pick<LiveGame, 'elapsedMs' | 'runningSince'>,
  now: number,
): number =>
  game.elapsedMs + (game.runningSince === null ? 0 : Math.max(0, now - game.runningSince));

/**
 * The trailing batch of a move stack as the frozen `MoveBatch` shape: the run
 * of moves undo (or redo) will consume in one press. `label` is the move kind,
 * a stable key the UI can translate.
 */
export function topBatch(stack: readonly Move[]): MoveBatch | null {
  if (stack.length === 0) return null;
  const { at } = stack[stack.length - 1];
  let start = stack.length;
  while (start > 0 && stack[start - 1].at === at) start--;
  const moves = stack.slice(start);
  return { moves, label: moves[0].kind };
}

/* -------------------------------------------------------------------------- */
/* Move application                                                           */
/* -------------------------------------------------------------------------- */

const snapshot = (cell: Cell): Move['prev'] => ({
  value: cell.value,
  candidates: [...cell.candidates].sort((a, b) => a - b),
});

/**
 * Replays one move forward. `digit` is asserted rather than checked: the only
 * kinds that read it are constructed below with one, and a defensive branch
 * here would be dead code that still has to be maintained.
 */
function applyMove(draft: Cell[], move: Move, board: Board | null): void {
  const cell = draft[move.cell];
  switch (move.kind) {
    case 'set':
      draft[move.cell] = { ...cell, value: move.digit as Digit, candidates: new Set() };
      break;
    case 'clear':
      draft[move.cell] = { ...cell, value: null, candidates: new Set() };
      break;
    case 'addCandidate': {
      const candidates = new Set(cell.candidates);
      candidates.add(move.digit as Digit);
      draft[move.cell] = { ...cell, candidates };
      break;
    }
    case 'removeCandidate': {
      const candidates = new Set(cell.candidates);
      candidates.delete(move.digit as Digit);
      draft[move.cell] = { ...cell, candidates };
      break;
    }
    case 'clearCandidates':
      draft[move.cell] = { ...cell, candidates: new Set() };
      break;
    case 'fillCandidates':
      // The new marks are recomputed instead of stored: redo only ever runs on
      // the exact board the batch first saw, so the engine returns the same set.
      draft[move.cell] = {
        ...cell,
        candidates: new Set(board === null ? cell.candidates : board.trueCandidates(move.cell)),
      };
      break;
  }
}

/** Restores the cell snapshot a move captured. Uniform across every kind. */
function invertMove(draft: Cell[], move: Move): void {
  draft[move.cell] = {
    ...draft[move.cell],
    value: move.prev.value,
    candidates: new Set(move.prev.candidates),
  };
}

const boardFor = (draft: readonly Cell[], moves: readonly Move[]): Board | null =>
  moves.some((m) => m.kind === 'fillCandidates')
    ? Board.fromValues(draft.map((c) => c.value))
    : null;

function applyAll(cells: readonly Cell[], moves: readonly Move[]): Cell[] {
  const draft = [...cells];
  const board = boardFor(draft, moves);
  for (const move of moves) applyMove(draft, move, board);
  return draft;
}

function invertAll(cells: readonly Cell[], moves: readonly Move[]): Cell[] {
  const draft = [...cells];
  for (let i = moves.length - 1; i >= 0; i--) invertMove(draft, moves[i]);
  return draft;
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Timestamp for a new batch, forced strictly past the last recorded move. A
 * shared `at` is what marks a batch, so two separate actions landing in the
 * same millisecond must not share one.
 */
function nextAt(game: LiveGame, at: number): number {
  const last = game.undoStack[game.undoStack.length - 1];
  return last === undefined ? at : Math.max(at, last.at + 1);
}

/** Drops the oldest whole batches until the log fits. */
function trimHistory(stack: Move[]): Move[] {
  if (stack.length <= MAX_HISTORY) return stack;
  let start = stack.length - MAX_HISTORY;
  const boundary = stack[start].at;
  while (start < stack.length && stack[start].at === boundary) start++;
  return stack.slice(start);
}

const stopped = (game: LiveGame, at: number): Pick<LiveGame, 'elapsedMs' | 'runningSince'> => ({
  elapsedMs: elapsedAt(game, at),
  runningSince: null,
});

/**
 * Completion is derived, never remembered: the action that fills the last cell
 * stops the clock and stamps `completedAt`, and any action that empties a cell
 * again clears it. Undoing out of a finished game deliberately leaves the clock
 * stopped — restarting it is the player's call, not a side effect of undo.
 */
function settle(game: LiveGame, at: number): LiveGame {
  const complete = isComplete(game);
  if (complete && game.completedAt === null) {
    return { ...game, ...stopped(game, at), completedAt: at };
  }
  if (!complete && game.completedAt !== null) return { ...game, completedAt: null };
  return game;
}

/**
 * Records a player action. A new action always invalidates the redo branch —
 * history is linear. An action that changes nothing produces no moves and
 * returns the same object, so a tap on a given cell cannot cost the player
 * their redo stack.
 */
function commit(game: LiveGame, cells: Cell[], moves: Move[], at: number): LiveGame {
  if (moves.length === 0) return game;
  return settle(
    {
      ...game,
      cells,
      undoStack: trimHistory([...game.undoStack, ...moves]),
      redoStack: [],
      updatedAt: at,
    },
    at,
  );
}

/** Builds and applies a single-cell move, or returns the game untouched. */
function single(
  game: LiveGame,
  index: CellIndex,
  kind: MoveKind,
  digit: Digit | undefined,
  at: number,
  changes: (cell: Cell) => boolean,
): LiveGame {
  const cell = game.cells[index];
  // Givens are ink (R2): every mutation aimed at one is a no-op with no move.
  if (cell === undefined || cell.given || !changes(cell)) return game;
  const move: Move = { kind, cell: index, prev: snapshot(cell), at: nextAt(game, at) };
  if (digit !== undefined) move.digit = digit;
  return commit(game, applyAll(game.cells, [move]), [move], move.at);
}

/** Builds one batch: every move shares a timestamp and undoes in one press. */
function batch(
  game: LiveGame,
  kind: MoveKind,
  at: number,
  changes: (cell: Cell, index: CellIndex) => boolean,
): LiveGame {
  const stamp = nextAt(game, at);
  const moves: Move[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const cell = game.cells[i];
    if (cell.given || !changes(cell, i)) continue;
    moves.push({ kind, cell: i, prev: snapshot(cell), at: stamp });
  }
  return commit(game, applyAll(game.cells, moves), moves, stamp);
}

function undo(game: LiveGame, at: number): LiveGame {
  const top = topBatch(game.undoStack);
  if (top === null) return game;
  return settle(
    {
      ...game,
      cells: invertAll(game.cells, top.moves),
      undoStack: game.undoStack.slice(0, game.undoStack.length - top.moves.length),
      // Pushed chronologically, so the redo stack's own trailing run is this batch.
      redoStack: [...game.redoStack, ...top.moves],
      updatedAt: at,
    },
    at,
  );
}

function redo(game: LiveGame, at: number): LiveGame {
  const top = topBatch(game.redoStack);
  if (top === null) return game;
  return settle(
    {
      ...game,
      cells: applyAll(game.cells, top.moves),
      undoStack: [...game.undoStack, ...top.moves],
      redoStack: game.redoStack.slice(0, game.redoStack.length - top.moves.length),
      updatedAt: at,
    },
    at,
  );
}

/** Pure transition. The same game plus the same action always yields the same game. */
export function reduce(game: LiveGame, action: GameAction): LiveGame {
  switch (action.type) {
    case 'setValue':
      return single(
        game, action.cell, 'set', action.digit, action.at,
        (c) => c.value !== action.digit,
      );

    case 'clearCell':
      return single(
        game, action.cell, 'clear', undefined, action.at,
        (c) => c.value !== null || c.candidates.size > 0,
      );

    case 'toggleCandidate':
      return reduce(game, {
        ...action,
        type: game.cells[action.cell]?.candidates.has(action.digit)
          ? 'removeCandidate'
          : 'addCandidate',
      });

    case 'addCandidate':
      // A filled cell has no room for pencil marks; clear the digit first.
      return single(
        game, action.cell, 'addCandidate', action.digit, action.at,
        (c) => c.value === null && !c.candidates.has(action.digit),
      );

    case 'removeCandidate':
      return single(
        game, action.cell, 'removeCandidate', action.digit, action.at,
        (c) => c.candidates.has(action.digit),
      );

    case 'clearCandidates':
      return single(
        game, action.cell, 'clearCandidates', undefined, action.at,
        (c) => c.candidates.size > 0,
      );

    case 'fillCandidates': {
      // "Training wheels": the player asks the engine to write the true
      // candidates into every empty cell, replacing what is there. It is a
      // request, not the engine reaching in on its own — and it is one undo.
      const board = Board.fromValues(valuesOf(game));
      return batch(game, 'fillCandidates', action.at, (cell, i) => {
        if (cell.value !== null) return false;
        const truth = board.trueCandidates(i);
        return (
          truth.size !== cell.candidates.size || [...truth].some((d) => !cell.candidates.has(d))
        );
      });
    }

    case 'reset':
      // Back to the givens in one press. The clock keeps running: the time
      // already spent was really spent, and undoing a reset has to restore the
      // board exactly, which a rewound timer would contradict.
      return batch(game, 'clear', action.at, (c) => c.value !== null || c.candidates.size > 0);

    case 'undo':
      return undo(game, action.at);

    case 'redo':
      return redo(game, action.at);

    case 'tick':
      // Folds the running stretch into `elapsedMs` so an autosave a millisecond
      // later persists an honest total. Not a player action, so it leaves
      // `updatedAt` — and therefore the game list's ordering — alone.
      return game.runningSince === null
        ? game
        : { ...game, elapsedMs: elapsedAt(game, action.at), runningSince: action.at };

    case 'pause':
      return game.runningSince === null
        ? game
        : { ...game, ...stopped(game, action.at), updatedAt: action.at };

    case 'resume':
      // A finished game's clock stays stopped, and a running one is not
      // restarted — that would discard the stretch since the last resume.
      return game.runningSince !== null || game.completedAt !== null
        ? game
        : { ...game, runningSince: action.at, updatedAt: action.at };
  }
}
