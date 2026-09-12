import { describe, expect, it } from 'vitest';
import { Board } from './board';
import {
  bandFor,
  exerciseAmong,
  exerciseFor,
  gridOf,
  type PositionQuality,
} from './exercise';
import { levelOf, seededRng } from './generator';
import { CandidateGrid, firstFinding } from './solver';
import { DETECTORS } from './techniques';
import { TECHNIQUE_IDS, type CellIndex, type Digit, type TechniqueId } from './types';
import { EASY, EXPERT, HARD, MEDIUM } from '../test/exercisePuzzles';

const digitAt = (solution: string, cell: CellIndex): Digit =>
  Number(solution[cell]) as Digit;

describe('exerciseFor', () => {
  it('finds a position for every technique in a puzzle whose path uses them all', () => {
    const missing = TECHNIQUE_IDS.filter(
      (technique) => exerciseFor(EXPERT.givens, technique) === null,
    );
    expect(missing).toEqual([]);
  });

  it('returns a position about the technique that was asked for', () => {
    for (const technique of TECHNIQUE_IDS) {
      expect(exerciseFor(EXPERT.givens, technique)?.finding.technique).toBe(technique);
    }
  });

  it('marks the position exclusive only when nothing easier applies', () => {
    for (const technique of TECHNIQUE_IDS) {
      const position = exerciseFor(EXPERT.givens, technique);
      if (position === null || position.quality !== 'exclusive') continue;
      // The solver's own next step, so the first thing the catalog offers on
      // the position's own marks has to be this very finding.
      const next = firstFinding(gridOf(position));
      expect(next?.technique).toBe(technique);
      expect(next?.cells).toEqual(position.finding.cells);
    }
  });

  it('offers a shared position when the technique is never the solver’s own next step', () => {
    // `claiming` is a real pattern that something cheaper always beats to the
    // board — the solver's own next step in 1 of 20 puzzles when measured.
    const position = exerciseFor(EXPERT.givens, 'claiming');
    expect(position).not.toBeNull();
    expect(position!.quality).not.toBe('exclusive');
    // Shared or not, the pattern is genuinely there on the marks shown.
    expect(DETECTORS.claiming.detect(gridOf(position!))).not.toBeNull();
  });

  it('shows the marks the step was proved on, not the board’s basic candidates', () => {
    // The reason this module exists, in two halves that have to be asserted
    // together. First: the pattern is really there on the marks the player is
    // handed — that is the whole promise, and it is what breaks if `snapshot`
    // ever goes back to `Board.trueCandidates`.
    const absent: TechniqueId[] = [];
    for (const technique of TECHNIQUE_IDS) {
      const position = exerciseFor(EXPERT.givens, technique);
      if (position === null) continue;
      expect(DETECTORS[technique].detect(gridOf(position))).not.toBeNull();
      if (DETECTORS[technique].detect(Board.fromValues(position.values)) === null) {
        absent.push(technique);
      }
    }
    // Second: the two candidate sets genuinely differ, so the assertion above
    // is not passing because there was nothing to get wrong. Basic candidates
    // are a superset of what the solver has proved, and most patterns do not
    // survive the difference.
    expect(absent.length).toBeGreaterThan(0);
  });

  it('proves only eliminations the solution agrees with', () => {
    for (const technique of TECHNIQUE_IDS) {
      const position = exerciseFor(EXPERT.givens, technique);
      if (position === null) continue;
      for (const { cell, digit } of position.finding.eliminations) {
        expect(digit).not.toBe(digitAt(EXPERT.solution, cell));
      }
      for (const { cell, digit } of position.finding.placements) {
        expect(digit).toBe(digitAt(EXPERT.solution, cell));
      }
    }
  });

  it('keeps every mark the solution needs', () => {
    for (const technique of TECHNIQUE_IDS) {
      const position = exerciseFor(EXPERT.givens, technique);
      if (position === null) continue;
      position.values.forEach((value, cell) => {
        if (value !== null) return expect(value).toBe(digitAt(EXPERT.solution, cell));
        expect(position.candidates[cell]).toContain(digitAt(EXPERT.solution, cell as CellIndex));
      });
    }
  });

  it('starts an easy puzzle on its first step', () => {
    const position = exerciseFor(EASY.givens, 'naked_single');
    expect(position?.quality).toBe('exclusive');
    expect(position?.values.join(',')).toBe(
      [...EASY.givens].map((c) => (c === '.' ? '' : c)).join(','),
    );
  });
});

describe('gridOf', () => {
  it('rebuilds exactly the marks the position carries', () => {
    const position = exerciseFor(HARD.givens, 'xy_wing')!;
    const grid = gridOf(position);
    position.values.forEach((value, cell) => {
      const marks = [...grid.trueCandidates(cell as CellIndex)].sort((a, b) => a - b);
      expect(marks).toEqual(value === null ? [...position.candidates[cell]].sort((a, b) => a - b) : []);
    });
  });
});

describe('exerciseAmong', () => {
  it('only ever returns a technique that was allowed', () => {
    const allowed: TechniqueId[] = ['naked_pair', 'x_wing', 'simple_coloring'];
    for (let seed = 1; seed <= 20; seed++) {
      const position = exerciseAmong(EXPERT.givens, allowed, seededRng(seed));
      expect(allowed).toContain(position!.finding.technique);
      expect(position!.quality).toBe('exclusive');
    }
  });

  it('spreads across the techniques present rather than the positions', () => {
    const allowed: TechniqueId[] = ['naked_single', 'simple_coloring'];
    const seen = new Set<TechniqueId>();
    for (let seed = 1; seed <= 30; seed++) {
      seen.add(exerciseAmong(EXPERT.givens, allowed, seededRng(seed))!.finding.technique);
    }
    // A naked single is available at nearly every step and colouring at one,
    // so a per-position draw would essentially never pick the colouring.
    expect([...seen].sort()).toEqual(['naked_single', 'simple_coloring']);
  });

  it('says so when nothing allowed is on the path', () => {
    expect(exerciseAmong(EASY.givens, ['swordfish'], seededRng(1))).toBeNull();
  });
});

describe('bandFor', () => {
  it('agrees with the generator’s own levelOf, technique for technique', () => {
    // Pins the duplicate. The copy exists so the app bundle need not import
    // `generator.ts`; this is what stops the two drifting apart.
    for (const technique of TECHNIQUE_IDS) {
      expect(bandFor(technique)).toBe(levelOf(technique));
    }
  });
});

/**
 * What the puzzle actually offers, worked out independently and naively.
 *
 * Deliberately not a call into `exercise.ts`: the bug this guards against was
 * the search settling for the first position it found, and only an oracle
 * that looks at every position can see that a better one was walked past.
 */
function bestAvailable(givens: string, technique: TechniqueId): PositionQuality | null {
  const rank: Record<PositionQuality, number> = { exclusive: 0, clean: 1, shared: 2 };
  const grid = CandidateGrid.fromString(givens);
  let best: PositionQuality | null = null;

  for (let step = 0; step < 810; step++) {
    const next = firstFinding(grid);
    if (next === null) break;

    let here: PositionQuality | null = null;
    if (next.technique === technique) here = 'exclusive';
    else if (DETECTORS[technique].detect(grid) !== null) {
      here =
        DETECTORS.naked_single.detect(grid) === null &&
        DETECTORS.hidden_single.detect(grid) === null
          ? 'clean'
          : 'shared';
    }
    if (here !== null && (best === null || rank[here] < rank[best])) best = here;
    if (best === 'exclusive') break;
    if (!grid.apply(next)) break;
  }
  return best;
}

describe('position quality', () => {
  it('takes the best position the puzzle has, not the first one it meets', () => {
    // The bug Paolo hit: a hidden-pair drill on a grid that still had a cell
    // down to one candidate, when the same puzzle offered a clean position
    // later on. The pattern shows up early, while singles are everywhere.
    for (const puzzle of [EASY, MEDIUM, HARD, EXPERT]) {
      for (const technique of TECHNIQUE_IDS) {
        expect({
          puzzle: puzzle.difficulty,
          technique,
          quality: exerciseFor(puzzle.givens, technique)?.quality ?? null,
        }).toEqual({
          puzzle: puzzle.difficulty,
          technique,
          quality: bestAvailable(puzzle.givens, technique),
        });
      }
    }
  });

  it('never hands over a board with a digit simply waiting to be written in', () => {
    for (const puzzle of [EASY, MEDIUM, HARD, EXPERT]) {
      for (const technique of TECHNIQUE_IDS) {
        const position = exerciseFor(puzzle.givens, technique);
        if (position === null || position.quality === 'shared') continue;
        const grid = gridOf(position);
        // A single anywhere is the move the player takes instead of the one
        // being drilled — and then the exercise refuses it, which reads as a
        // trick. Drilling a single is the one case where it is the point.
        if (technique !== 'naked_single') {
          expect(DETECTORS.naked_single.detect(grid)).toBeNull();
        }
        if (technique !== 'naked_single' && technique !== 'hidden_single') {
          expect(DETECTORS.hidden_single.detect(grid)).toBeNull();
        }
      }
    }
  });
});
