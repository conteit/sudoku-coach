/**
 * R6, the one test this repo cannot afford to lose.
 *
 * The product promise is that a hint is never wrong. Every hint is a `Finding`,
 * and a finding is wrong exactly when it removes a candidate the solution needs
 * or places a digit the solution does not have. So: generate boards whose
 * solution we already know, run every detector over every state the solver can
 * reach from them, and check each finding against the truth.
 *
 * Two oracles are used, deliberately.
 *
 * - The known solution. Required by R6, cheap, and applies to every board.
 * - `possibleDigits`, which enumerates *every* solution of the board. This is
 *   the stronger statement — a sound elimination must be impossible in all
 *   solutions, not merely in the one we happened to start from — and it catches
 *   a detector that quietly assumes uniqueness. It is only affordable on boards
 *   with few solutions, so it runs where it can and the known-solution check
 *   covers the rest.
 *
 * Neither oracle shares code with the detectors: one is a string we generated
 * before digging, the other a from-scratch backtracker in `fixtures.ts`.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Digit, Finding } from '../types';
import { Board, cellName } from '../board';
import { CandidateGrid, solveBruteForce } from '../solver';
import { CATALOG } from './index';
import {
  describeFinding, describeGrid, EMPTY_GRID, EXAMPLES, lcg, maskGrid, possibleDigits, PUZZLES,
} from './fixtures';

/** A full grid, deterministic in `seed`. */
function randomSolvedGrid(seed: number): string {
  const grid = solveBruteForce(Board.fromString(EMPTY_GRID), lcg(seed));
  if (!grid) throw new Error(`seed ${seed} produced no grid`);
  return grid.toString();
}

/** Throws with everything a reader needs to reconstruct the failure by hand. */
function fail(reason: string, grid: string, finding: Finding): never {
  throw new Error(
    [
      reason,
      `  finding: ${describeFinding(finding)}`,
      '  board:',
      describeGrid(grid)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
    ].join('\n'),
  );
}

/** The R6 check: `finding` must agree with `solution`. */
function assertAgreesWithSolution(finding: Finding, grid: string, solution: string): void {
  for (const { cell, digit } of finding.eliminations) {
    if (Number(solution[cell]) === digit) {
      fail(
        `${finding.technique} removed ${digit} from ${cellName(cell)}, ` +
          'which is the digit the solution puts there',
        grid,
        finding,
      );
    }
  }
  for (const { cell, digit } of finding.placements) {
    if (Number(solution[cell]) !== digit) {
      fail(
        `${finding.technique} placed ${digit} at ${cellName(cell)}, ` +
          `but the solution has ${solution[cell]} there`,
        grid,
        finding,
      );
    }
  }
}

/** The stronger check: `finding` must agree with *every* solution of the grid. */
function assertAgreesWithAllSolutions(
  finding: Finding,
  grid: string,
  possible: readonly Set<Digit>[],
): void {
  for (const { cell, digit } of finding.eliminations) {
    if (possible[cell].has(digit)) {
      fail(
        `${finding.technique} removed ${digit} from ${cellName(cell)}, ` +
          'but some solution of this board puts it there',
        grid,
        finding,
      );
    }
  }
  for (const { cell, digit } of finding.placements) {
    const options = [...possible[cell]];
    if (options.length !== 1 || options[0] !== digit) {
      fail(
        `${finding.technique} placed ${digit} at ${cellName(cell)}, ` +
          `but solutions of this board allow {${options.join(',')}} there`,
        grid,
        finding,
      );
    }
  }
}

/**
 * Walks the board through its whole logical solve path, checking every
 * detector at every state — not just the finding the solver happens to apply.
 * A detector that only misfires two steps in is still a detector that will show
 * a player a wrong hint.
 */
function checkSolvePath(
  puzzle: string,
  solution: string,
  exercised: Set<string> = new Set(),
  steps = 200,
): number {
  const grid = CandidateGrid.fromBoard(Board.fromString(puzzle));
  let checked = 0;
  for (let step = 0; step < steps; step++) {
    const snapshot = grid.toBoard().toString();
    // The narrowed candidate set must never lose the truth either: it is what
    // every later detector reads.
    for (let cell = 0; cell < 81; cell++) {
      if (grid.values[cell] !== null) continue;
      const truth = Number(solution[cell]) as Digit;
      if (!grid.trueCandidates(cell).has(truth)) {
        throw new Error(
          `candidate ${truth} was eliminated from ${cellName(cell)} but the solution needs it` +
            `\n  board:\n${describeGrid(snapshot)}`,
        );
      }
    }
    let next: Finding | null = null;
    for (const detector of CATALOG) {
      const finding = detector.detect(grid);
      if (!finding) continue;
      assertAgreesWithSolution(finding, snapshot, solution);
      exercised.add(detector.id);
      checked++;
      if (!next) next = finding;
    }
    if (!next || !grid.apply(next)) break;
  }
  return checked;
}

describe('R6 — no finding ever removes a digit the solution needs', () => {
  it('holds over every state reachable from a random partial fill', () => {
    const exercised = new Set<string>();
    let checked = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 30 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 80 }), { minLength: 22, maxLength: 60 }),
        (seed, keep) => {
          const solution = randomSolvedGrid(seed);
          checked += checkSolvePath(maskGrid(solution, keep), solution, exercised);
        },
      ),
      { numRuns: 60 },
    );
    // A property that checked nothing passes trivially, so the run's own reach
    // is asserted: thousands of findings across most of the catalog.
    expect(checked).toBeGreaterThan(2000);
    expect(exercised.size).toBeGreaterThanOrEqual(10);
  });

  it('holds against every solution of the board, not just the one we dug from', () => {
    let verified = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 30 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 80 }), { minLength: 30, maxLength: 60 }),
        (seed, keep) => {
          const solution = randomSolvedGrid(seed);
          const puzzle = maskGrid(solution, keep);
          const possible = possibleDigits(puzzle, 5000);
          fc.pre(possible !== null); // too many solutions to enumerate; skip
          if (!possible) return;
          for (const detector of CATALOG) {
            const finding = detector.detect(Board.fromString(puzzle));
            if (!finding) continue;
            assertAgreesWithAllSolutions(finding, puzzle, possible);
            verified++;
          }
        },
      ),
      { numRuns: 40 },
    );
    expect(verified).toBeGreaterThan(20);
  });

  it('holds for every worked example, checked against all its solutions', () => {
    for (const detector of CATALOG) {
      const grid = EXAMPLES[detector.id];
      const finding = detector.detect(Board.fromString(grid));
      expect(finding, `${detector.id} found nothing on its own example`).not.toBeNull();
      const possible = possibleDigits(grid);
      expect(possible, `${grid} has too many solutions to enumerate`).not.toBeNull();
      if (finding && possible) assertAgreesWithAllSolutions(finding, grid, possible);
    }
  });

  it('holds over the whole solve path of every corpus puzzle', () => {
    for (const puzzle of PUZZLES) {
      const checked = checkSolvePath(puzzle.givens, puzzle.solution);
      expect(checked, `${puzzle.name} exercised no detector`).toBeGreaterThan(0);
    }
  });

  it('is not vacuous: the property test really does exercise the hard detectors', () => {
    // A soundness test that never reaches a chain detector proves nothing about
    // chain detectors. Assert the corpus alone drives every technique at least
    // once, so this file's coverage cannot silently narrow.
    const fired = new Set<string>();
    for (const puzzle of PUZZLES) {
      const grid = CandidateGrid.fromBoard(Board.fromString(puzzle.givens));
      for (let step = 0; step < 200; step++) {
        let next: Finding | null = null;
        for (const detector of CATALOG) {
          const finding = detector.detect(grid);
          if (!finding) continue;
          fired.add(detector.id);
          if (!next) next = finding;
        }
        if (!next || !grid.apply(next)) break;
      }
    }
    expect([...fired].sort()).toEqual(CATALOG.map((d) => d.id).sort());
  });
});
