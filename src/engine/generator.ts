/**
 * Full-grid generation, clue digging, uniqueness and difficulty rating
 * (spec §5.2 engine/generator, R1).
 *
 * Three steps, each usable on its own:
 *
 * 1. `fullGrid` produces a completed board. It is `solveBruteForce` on an empty
 *    grid — that search already shuffles its digit order through an injected
 *    `Rng`, so a second randomized backtracker here would duplicate a solver
 *    the engine already trusts, with its own bugs.
 * 2. `dig` removes clues from a completed board one group at a time, putting
 *    back any removal that costs the puzzle its unique solution.
 * 3. `rate` runs the technique catalog as a solver and reports the hardest
 *    technique the solve path needed. That — not the clue count — is the
 *    difficulty (spec §5.4, docs/architecture.md "Difficulty rating").
 *
 * The generate-and-rate loop repeats 1-3 until the rating matches the request.
 * Digging is *ceilinged* to keep that loop short: a removal is accepted only if
 * the puzzle still finishes using nothing harder than the requested level
 * allows. An attempt can therefore undershoot the target but never overshoot
 * it, and never yields a puzzle the catalog cannot finish at all — which would
 * be a puzzle whose difficulty we would have to invent.
 *
 * Nothing here touches the DOM or the clock. The loop is exposed as a JS
 * generator (`generation`) so the worker can drive it one attempt at a time and
 * stay answerable to a cancel, while `generate` drives the same loop straight
 * through for callers already off the main thread.
 */

import type { BoardView, CellIndex, Difficulty, GeneratedPuzzle, TechniqueId } from './types';
import { DIFFICULTIES, DIFFICULTY_TECHNIQUES } from './types';
import { Board, CELL_COUNT } from './board';
import type { Rng } from './solver';
import { CandidateGrid, countSolutions, solveBruteForce, solveLogically } from './solver';
import { CATALOG, rankOf } from './techniques';

/* ------------------------------------------------------------------------ */
/* Randomness                                                                */
/* ------------------------------------------------------------------------ */

/**
 * A seedable `Rng`, so a generated puzzle can be replayed from its seed alone.
 *
 * The engine tests seed through the fixture PRNG, but that file is test-only
 * and must not reach the bundle; the worker needs the same guarantee at
 * runtime, because "generation produced a bad puzzle" is otherwise a bug report
 * with nothing to reproduce it from.
 *
 * mulberry32 rather than a plain LCG: the dig order is a shuffle driven by the
 * low bits of successive draws, and an LCG's low bits have famously short
 * periods.
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, in place. Returns `items` so call sites read as expressions. */
function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/* ------------------------------------------------------------------------ */
/* Full grids                                                                */
/* ------------------------------------------------------------------------ */

const EMPTY_VALUES: readonly null[] = Object.freeze(new Array<null>(CELL_COUNT).fill(null));

/**
 * A completed, valid grid — randomized backtracking by way of the solver's
 * seeded search, so the same `rng` always yields the same board and every
 * generator test is reproducible.
 */
export function fullGrid(rng: Rng = Math.random): Board {
  const grid = solveBruteForce(Board.fromValues(EMPTY_VALUES), rng);
  // The empty grid has 6.67e21 completions; the search cannot fail on it.
  if (grid === null) throw new Error('brute force failed on an empty grid');
  return grid;
}

/* ------------------------------------------------------------------------ */
/* Difficulty rating                                                         */
/* ------------------------------------------------------------------------ */

export interface Rating {
  difficulty: Difficulty;
  hardest: TechniqueId;
  /** Techniques in order of first use — the solve path, for the coach's recap. */
  techniquesUsed: TechniqueId[];
}

/** The easiest level whose technique set covers `technique`. */
export function levelOf(technique: TechniqueId): Difficulty {
  const level = DIFFICULTIES.find((d) => DIFFICULTY_TECHNIQUES[d].includes(technique));
  // Every id in TECHNIQUE_IDS is in the expert band, which is TECHNIQUE_IDS.
  if (level === undefined) throw new Error(`technique ${technique} is in no difficulty band`);
  return level;
}

/**
 * The puzzle's level, or null when it is not gradeable.
 *
 * "Not gradeable" means the catalog cannot finish the grid: the solve path
 * would need a guess, and a puzzle we would have to invent a difficulty for is
 * rejected rather than labelled (R1). An already-complete grid is rejected for
 * the mirror-image reason — no technique was needed, so there is no hardest one
 * to name.
 */
export function rate(board: BoardView): Rating | null {
  const solution = solveLogically(board);
  if (!solution.solved || solution.hardest === null) return null;
  return {
    difficulty: levelOf(solution.hardest),
    hardest: solution.hardest,
    techniquesUsed: solution.techniquesUsed,
  };
}

/**
 * How many detectors a level is allowed to use.
 *
 * Every `DIFFICULTY_TECHNIQUES` band is a prefix of `TECHNIQUE_IDS`, so a level
 * is a single cut point in the catalog rather than an arbitrary subset — a
 * property `generator.test.ts` asserts, because the rest of this file leans on
 * it. It is what makes the ceiling check below equivalent to a full solve: the
 * unrestricted solver takes the first detector that fires in catalog order, so
 * if a grid finishes on the prefix alone, the full solver walks that same path
 * and reaches that same rating.
 */
function detectorsFor(difficulty: Difficulty): number {
  return Math.max(...DIFFICULTY_TECHNIQUES[difficulty].map(rankOf)) + 1;
}

/**
 * Whether the catalog's first `limit` detectors finish the grid.
 *
 * This is `solveLogically` with two things dropped: the detectors above the
 * cut, and the per-step bookkeeping. It runs once per accepted candidate
 * removal — dozens of times per attempt, thousands per generated puzzle — so
 * the step list `solveLogically` accumulates would be pure garbage pressure
 * inside the dig loop. The rating a player ever sees still comes from
 * `solveLogically`, so nothing user-facing depends on this shortcut.
 */
function solvableWithin(board: BoardView, limit: number): boolean {
  const grid = CandidateGrid.fromBoard(board);
  for (;;) {
    if (grid.isSolved()) return true;
    if (grid.hasContradiction()) return false;
    let moved = false;
    for (let i = 0; i < limit; i++) {
      const finding = CATALOG[i].detect(grid);
      if (finding && grid.apply(finding)) {
        moved = true;
        break;
      }
    }
    if (!moved) return false;
  }
}

/* ------------------------------------------------------------------------ */
/* Clue digging                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Which cells come out together.
 *
 * `rotational` removes 180-degree pairs, which is what makes a grid read as
 * hand-made rather than machine-spat. It is a presentation preference, never a
 * constraint on correctness: a pair whose removal breaks uniqueness goes
 * straight back, so a symmetric puzzle is simply one that found fewer safe
 * removals. The symmetry is exact either way.
 */
export type Symmetry = 'rotational' | 'none';

/** The removal groups, in the order the dig will try them. */
function digOrder(symmetry: Symmetry, rng: Rng): CellIndex[][] {
  if (symmetry === 'none') {
    return shuffle(
      Array.from({ length: CELL_COUNT }, (_, cell) => [cell]),
      rng,
    );
  }
  // The centre is its own mirror, so it digs alone; every other cell pairs with
  // the one 180 degrees opposite.
  const centre = (CELL_COUNT - 1) / 2;
  const groups: CellIndex[][] = [[centre]];
  for (let cell = 0; cell < centre; cell++) groups.push([cell, CELL_COUNT - 1 - cell]);
  return shuffle(groups, rng);
}

export interface DigOptions {
  symmetry?: Symmetry;
  rng?: Rng;
  /**
   * Refuse any removal that pushes the solve path above this level. Omit to dig
   * for uniqueness alone, which yields a minimal puzzle worth whatever it
   * happens to be worth — including "not gradeable", when the catalog cannot
   * finish it.
   */
  ceiling?: Difficulty;
}

/**
 * Removes as many clues as the order allows, keeping the solution unique.
 *
 * Every removal is provisional: blank the group, ask the counter for a second
 * solution, and put the digits back if one exists. `countSolutions(board, 2)`
 * stops at the second solution rather than enumerating them, which is the
 * difference between a dig measured in milliseconds and one measured in
 * minutes.
 *
 * Returns the puzzle as an 81-char givens string.
 */
export function dig(solution: Board, options: DigOptions = {}): string {
  const { symmetry = 'rotational', rng = Math.random, ceiling } = options;
  const limit = ceiling === undefined ? null : detectorsFor(ceiling);
  const values = [...solution.values];

  for (const group of digOrder(symmetry, rng)) {
    const removed = group.map((cell) => values[cell]);
    for (const cell of group) values[cell] = null;

    const board = Board.fromValues(values);
    // Uniqueness first: it is the cheaper of the two questions and the one that
    // rejects most candidate removals.
    const keep = countSolutions(board, 2) === 1 && (limit === null || solvableWithin(board, limit));
    if (!keep) for (const [i, cell] of group.entries()) values[cell] = removed[i];
  }

  return Board.fromValues(values).toString();
}

/* ------------------------------------------------------------------------ */
/* Generate and rate                                                         */
/* ------------------------------------------------------------------------ */

export interface GenerateOptions {
  difficulty: Difficulty;
  rng?: Rng;
  symmetry?: Symmetry;
  /** Attempts before the loop settles for the nearest level it reached. */
  maxAttempts?: number;
}

export interface GenerationProgress {
  /** Attempts finished so far. */
  attempts: number;
  /** The cap in force, so a UI can render a fraction rather than a bare count. */
  maxAttempts: number;
  /**
   * Nearest level reached so far, or null while nothing gradeable has come out.
   * A UI shows this as what it would settle for if the cap ran out.
   */
  best: Difficulty | null;
}

export interface GenerationResult {
  puzzle: GeneratedPuzzle;
  /** What the caller asked for. */
  requested: Difficulty;
  /**
   * False when the cap ran out and this is the nearest level reached instead.
   * A caller must be able to tell "you asked for expert and got hard" (R1), so
   * it is stated rather than left to be inferred by comparing two fields.
   */
  matched: boolean;
  attempts: number;
}

/**
 * Attempts before the loop settles for the nearest level it reached.
 *
 * Sized from the measured attempt cost of a 180-degree-symmetric dig over 100
 * seeded runs per level: mean 1.0 (easy), 7.7 (medium), 17.7 (hard), 14.8
 * (expert), worst single run 78. Attempts are geometric in the per-attempt
 * yield, so a cap at 200 leaves the fallback path about one run in a hundred
 * thousand for the worst level while bounding the worst case near a second.
 *
 * It is a safety net against a pathological seed, not a tuning knob: raising it
 * trades a rarer downgraded puzzle for a rarer long wait, and the downgrade is
 * reported to the caller either way.
 */
export const DEFAULT_MAX_ATTEMPTS = 200;

/** Band distance between two levels, e.g. expert to medium is 2. */
const distance = (level: Difficulty, target: Difficulty): number =>
  Math.abs(DIFFICULTIES.indexOf(level) - DIFFICULTIES.indexOf(target));

/**
 * Whether `candidate` is a better consolation prize than `incumbent`.
 *
 * Closest band wins. Ties break towards the harder puzzle: a player who asked
 * for expert is better served by hard than by medium, and ceilinged digging
 * only ever undershoots so the tie is largely theoretical anyway.
 */
function preferable(candidate: Difficulty, incumbent: Difficulty, target: Difficulty): boolean {
  const gap = distance(candidate, target) - distance(incumbent, target);
  return gap < 0 || (gap === 0 && DIFFICULTIES.indexOf(candidate) > DIFFICULTIES.indexOf(incumbent));
}

/** One full grid, dug and rated. Null when the dig left nothing gradeable. */
function attempt(difficulty: Difficulty, symmetry: Symmetry, rng: Rng): GeneratedPuzzle | null {
  const solution = fullGrid(rng);
  const givens = dig(solution, { symmetry, rng, ceiling: difficulty });
  const rating = rate(Board.fromString(givens));
  if (rating === null) return null;
  return {
    givens,
    solution: solution.toString(),
    difficulty: rating.difficulty,
    hardestTechnique: rating.hardest,
    techniquesUsed: rating.techniquesUsed,
  };
}

/**
 * The generate-and-rate loop, one attempt per `yield`.
 *
 * A JS generator so that the two callers that need it — a worker that must
 * check for a cancel between attempts, and the synchronous `generate` — share
 * one copy of the retry and fallback rules instead of drifting apart. Pausing
 * at a `yield` also makes cancellation free: the iterator holds nothing but its
 * own locals, so an abandoned run is collected outright.
 */
export function* generation(
  options: GenerateOptions,
): Generator<GenerationProgress, GenerationResult> {
  const {
    difficulty,
    rng = Math.random,
    symmetry = 'rotational',
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(`maxAttempts must be a positive integer, got ${maxAttempts}`);
  }

  let best: GeneratedPuzzle | null = null;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const puzzle = attempt(difficulty, symmetry, rng);
    attempts++;
    if (puzzle !== null) {
      if (puzzle.difficulty === difficulty) {
        return { puzzle, requested: difficulty, matched: true, attempts };
      }
      if (best === null || preferable(puzzle.difficulty, best.difficulty, difficulty)) {
        best = puzzle;
      }
    }
    if (attempts < maxAttempts) yield { attempts, maxAttempts, best: best?.difficulty ?? null };
  }

  // Unreachable in practice: a ceilinged dig always leaves a gradeable puzzle,
  // because it never accepts a removal the catalog cannot solve through. The
  // throw is here so a future change that breaks that property fails loudly
  // instead of handing the UI an undefined puzzle.
  if (best === null) throw new Error(`no gradeable puzzle in ${attempts} attempts`);
  return { puzzle: best, requested: difficulty, matched: false, attempts };
}

/**
 * Generates one puzzle, blocking until it is rated. Runs the loop straight
 * through, so call it from a worker — never from the UI thread (R1).
 */
export function generate(options: GenerateOptions): GenerationResult {
  const steps = generation(options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
