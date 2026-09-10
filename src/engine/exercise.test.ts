import { describe, expect, it } from 'vitest';
import { Board } from './board';
import { bandFor, exerciseAmong, exerciseFor, gridOf } from './exercise';
import { levelOf, seededRng } from './generator';
import { firstFinding } from './solver';
import { DETECTORS } from './techniques';
import { TECHNIQUE_IDS, type CellIndex, type Digit, type TechniqueId } from './types';
import { EASY, EXPERT, HARD } from '../test/exercisePuzzles';

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
      if (position === null || !position.exclusive) continue;
      // The solver's own next step, so the first thing the catalog offers on
      // the position's own marks has to be this very finding.
      const next = firstFinding(gridOf(position));
      expect(next?.technique).toBe(technique);
      expect(next?.cells).toEqual(position.finding.cells);
    }
  });

  it('offers a shared position when the technique is never the solver’s own next step', () => {
    // `claiming` is a real pattern that something cheaper always beats to the
    // board — 0 exclusive positions in 12 generated puzzles when measured.
    const position = exerciseFor(EXPERT.givens, 'claiming');
    expect(position).not.toBeNull();
    expect(position!.exclusive).toBe(false);
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
    expect(position?.exclusive).toBe(true);
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
      expect(position!.exclusive).toBe(true);
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
