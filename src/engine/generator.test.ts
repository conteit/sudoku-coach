/**
 * Generator tests, including the R1 acceptance run.
 *
 * **No test in this file asserts elapsed time.** Generation is the app's one
 * expensive computation and it is tempting to guard it with a millisecond
 * ceiling, but a ceiling tuned on a laptop measures the runner rather than the
 * algorithm: `main` went red earlier today on a 10ms bound that passed locally
 * at 0.6ms and failed at 13ms on a shared CI box under coverage
 * instrumentation. Everything here is asserted on deterministic work instead —
 * attempts burned and `countSolutionsWithStats().nodes`, both identical on
 * every machine for a given seed. Real timings live in the PR body.
 *
 * The requirement is 100 generated puzzles per level, all unique-solvable. That
 * is roughly half a minute of CPU, which is too much to pay on every `npm run
 * test`, so the default tier is 10 per level and the full run is gated:
 *
 * ```sh
 * SUDOKU_GENERATOR_SOAK=1 npm run test -- src/engine/generator.test.ts
 * ```
 */

import { describe, expect, it } from 'vitest';
import { Board, CELL_COUNT } from './board';
import { countSolutions, countSolutionsWithStats, solveLogically } from './solver';
import type { Difficulty } from './types';
import { DIFFICULTIES, DIFFICULTY_TECHNIQUES, TECHNIQUE_IDS } from './types';
import { lcg, PUZZLES, SOLVED_GRID } from './techniques/fixtures';
import {
  DEFAULT_MAX_ATTEMPTS,
  dig,
  fullGrid,
  generate,
  generation,
  levelOf,
  rate,
  seededRng,
} from './generator';

/** Read off `globalThis`: the app's tsconfig deliberately omits node types. */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const SOAK = env?.SUDOKU_GENERATOR_SOAK === '1';
const PER_LEVEL = SOAK ? 100 : 10;

/** Generous: 100 expert puzzles is ~30s of engine work on a slow runner. */
const ACCEPTANCE_TIMEOUT = SOAK ? 600_000 : 120_000;

const EMPTY_GRID = '.'.repeat(CELL_COUNT);
const clueCount = (givens: string): number => [...givens].filter((c) => c !== '.').length;

describe('difficulty bands', () => {
  /**
   * `detectorsFor` treats a band as a cut point in the catalog rather than a
   * set membership test, which is only sound while every band is a prefix. It
   * is a property of a frozen contract, so nothing in this branch can fix a
   * violation — but the generator would silently mis-rate every puzzle, so it
   * is worth failing loudly here.
   */
  it('are nested prefixes of the catalog order', () => {
    for (const difficulty of DIFFICULTIES) {
      const band = DIFFICULTY_TECHNIQUES[difficulty];
      expect([...band]).toEqual([...TECHNIQUE_IDS.slice(0, band.length)]);
    }
    expect(DIFFICULTY_TECHNIQUES.expert.length).toBe(TECHNIQUE_IDS.length);
  });

  it('map every technique to the easiest band that covers it', () => {
    for (const technique of TECHNIQUE_IDS) {
      const level = levelOf(technique);
      expect(DIFFICULTY_TECHNIQUES[level]).toContain(technique);
      const easier = DIFFICULTIES.slice(0, DIFFICULTIES.indexOf(level));
      for (const band of easier) expect(DIFFICULTY_TECHNIQUES[band]).not.toContain(technique);
    }
  });
});

describe('seededRng', () => {
  it('replays exactly from the same seed', () => {
    const draws = (seed: number) => Array.from({ length: 20 }, seededRng(seed));
    expect(draws(42)).toEqual(draws(42));
    expect(draws(42)).not.toEqual(draws(43));
  });

  it('stays in [0, 1)', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 5_000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('fullGrid', () => {
  it('produces a solved grid', () => {
    const grid = fullGrid(lcg(1));
    expect(grid.isSolved()).toBe(true);
    expect(grid.toString()).toMatch(/^[1-9]{81}$/);
  });

  it('is reproducible from its rng and varies across seeds', () => {
    expect(fullGrid(lcg(9)).toString()).toBe(fullGrid(lcg(9)).toString());
    const grids = new Set(Array.from({ length: 20 }, (_, i) => fullGrid(lcg(i)).toString()));
    expect(grids.size).toBe(20);
  });
});

describe('rate', () => {
  it('agrees with the corpus the solver tests pin', () => {
    for (const puzzle of PUZZLES.filter((p) => p.solvable)) {
      const rating = rate(Board.fromString(puzzle.givens));
      expect(rating, puzzle.name).not.toBeNull();
      expect(rating?.hardest, puzzle.name).toBe(puzzle.hardest);
      expect(rating?.difficulty, puzzle.name).toBe(levelOf(puzzle.hardest));
    }
  });

  /**
   * A puzzle the catalog cannot finish has no honest label: the solve path we
   * would be rating does not exist. Rejecting it is the only option that keeps
   * a difficulty badge meaningful (R1).
   */
  it('refuses a puzzle the catalog cannot finish', () => {
    for (const puzzle of PUZZLES.filter((p) => !p.solvable)) {
      expect(rate(Board.fromString(puzzle.givens)), puzzle.name).toBeNull();
    }
    expect(rate(Board.fromString(EMPTY_GRID))).toBeNull();
  });

  /** No technique was needed, so there is no hardest one to name. */
  it('refuses an already-solved grid', () => {
    expect(rate(Board.fromString(SOLVED_GRID))).toBeNull();
  });
});

describe('dig', () => {
  const solution = fullGrid(lcg(11));

  it('only ever blanks cells — it never invents a clue', () => {
    const givens = dig(solution, { rng: lcg(12) });
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (givens[cell] !== '.') expect(givens[cell]).toBe(solution.toString()[cell]);
    }
  });

  it('leaves exactly one solution', () => {
    for (let seed = 0; seed < 8; seed++) {
      const givens = dig(solution, { rng: lcg(seed), symmetry: seed % 2 ? 'none' : 'rotational' });
      expect(countSolutions(Board.fromString(givens), 2), givens).toBe(1);
      expect(clueCount(givens)).toBeLessThan(CELL_COUNT);
    }
  });

  it('keeps 180-degree symmetry exactly, for every seed', () => {
    for (let seed = 0; seed < 8; seed++) {
      const givens = dig(solution, { rng: lcg(seed), symmetry: 'rotational' });
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        expect(givens[cell] === '.', `${givens} at ${cell}`).toBe(
          givens[CELL_COUNT - 1 - cell] === '.',
        );
      }
    }
  });

  /**
   * Symmetry costs clues — a pair is only removable when both halves are — so
   * the free dig is expected to go deeper. Asserted in aggregate rather than
   * per seed, because a single symmetric dig can get lucky.
   */
  it('digs deeper without the symmetry constraint', () => {
    const total = (symmetry: 'rotational' | 'none') =>
      Array.from({ length: 8 }, (_, seed) =>
        clueCount(dig(solution, { rng: lcg(seed), symmetry })),
      ).reduce((a, b) => a + b, 0);
    expect(total('none')).toBeLessThan(total('rotational'));
  });

  it('honours a difficulty ceiling', () => {
    for (const ceiling of DIFFICULTIES) {
      for (let seed = 0; seed < 4; seed++) {
        const givens = dig(solution, { rng: lcg(seed), ceiling });
        const rating = rate(Board.fromString(givens));
        expect(rating, `${ceiling}/${seed}`).not.toBeNull();
        expect(DIFFICULTY_TECHNIQUES[ceiling], givens).toContain(rating?.hardest);
      }
    }
  });
});

describe('generation loop', () => {
  it('reports monotonic progress inside the cap', () => {
    const steps = generation({ difficulty: 'expert', rng: lcg(1), maxAttempts: 5 });
    const seen: number[] = [];
    let step = steps.next();
    while (!step.done) {
      expect(step.value.maxAttempts).toBe(5);
      expect(step.value.best === null || DIFFICULTIES).toBeTruthy();
      seen.push(step.value.attempts);
      step = steps.next();
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
    expect(step.value.attempts).toBeLessThanOrEqual(5);
  });

  /**
   * The caller must be able to tell "you asked for expert and got hard" (R1).
   * Seed 1 at a one-attempt cap undershoots — verified, not hoped for, which is
   * why the seed is pinned rather than drawn.
   */
  it('falls back to the nearest level reached and says so', () => {
    const result = generate({ difficulty: 'expert', rng: lcg(1), maxAttempts: 1 });
    expect(result.matched).toBe(false);
    expect(result.requested).toBe('expert');
    expect(result.puzzle.difficulty).not.toBe('expert');
    expect(result.attempts).toBe(1);
    // Still a real puzzle, not a consolation stub.
    expect(countSolutions(Board.fromString(result.puzzle.givens), 2)).toBe(1);
  });

  it('rejects a nonsensical cap rather than looping forever', () => {
    expect(() => generate({ difficulty: 'easy', maxAttempts: 0 })).toThrow(/positive integer/);
    expect(() => generate({ difficulty: 'easy', maxAttempts: 1.5 })).toThrow(/positive integer/);
  });

  it('is reproducible from a seed', () => {
    const run = () => generate({ difficulty: 'medium', rng: seededRng(2024) });
    expect(run().puzzle).toEqual(run().puzzle);
  });
});

/* ------------------------------------------------------------------------ */
/* R1 acceptance                                                             */
/* ------------------------------------------------------------------------ */

describe.each(DIFFICULTIES)('R1: %s puzzles', (difficulty: Difficulty) => {
  it(
    `generates ${PER_LEVEL} puzzles that are unique-solvable and correctly rated`,
    () => {
      let attemptsSpent = 0;
      let hardestSearch = 0;

      for (let i = 0; i < PER_LEVEL; i++) {
        const seed = 1_000 + i;
        const result = generate({ difficulty, rng: seededRng(seed) });
        const { puzzle } = result;
        const label = `${difficulty} seed ${seed}: ${puzzle.givens}`;
        const board = Board.fromString(puzzle.givens);

        // Uniqueness — the requirement itself.
        const stats = countSolutionsWithStats(board, 2);
        expect(stats.solutions, label).toBe(1);

        // The stored solution is that one solution, and every given agrees.
        const logical = solveLogically(board);
        expect(logical.solved, label).toBe(true);
        expect(logical.board.toString(), label).toBe(puzzle.solution);
        for (let cell = 0; cell < CELL_COUNT; cell++) {
          if (puzzle.givens[cell] !== '.') {
            expect(puzzle.givens[cell], label).toBe(puzzle.solution[cell]);
          }
        }

        // The rating is the solve path's hardest technique, and it is the level
        // that was asked for.
        expect(result.matched, label).toBe(true);
        expect(puzzle.difficulty, label).toBe(difficulty);
        expect(logical.hardest, label).toBe(puzzle.hardestTechnique);
        expect(levelOf(puzzle.hardestTechnique), label).toBe(difficulty);
        expect(puzzle.techniquesUsed, label).toContain(puzzle.hardestTechnique);
        expect(DIFFICULTY_TECHNIQUES[difficulty], label).toEqual(
          expect.arrayContaining(puzzle.techniquesUsed),
        );

        attemptsSpent += result.attempts;
        hardestSearch = Math.max(hardestSearch, stats.nodes);
      }

      // Deterministic work, not elapsed time. `attempts` is the loop's own cost
      // measure and `nodes` is the search effort of proving uniqueness: a
      // change that halves the per-attempt yield, or that starts emitting
      // puzzles whose uniqueness proof explodes, moves these and nothing else.
      //
      // Bounds are roughly 3x and 7x the worst value measured over the full
      // 400-puzzle soak (attempts: mean 1.0/7.7/17.7/14.8 by level; nodes: max
      // 7080). Loose enough that noise cannot reach them, tight enough that a
      // real regression does.
      expect(attemptsSpent).toBeLessThanOrEqual(PER_LEVEL * DEFAULT_MAX_ATTEMPTS);
      expect(attemptsSpent / PER_LEVEL).toBeLessThan(60);
      expect(hardestSearch).toBeLessThan(50_000);
    },
    ACCEPTANCE_TIMEOUT,
  );
});
