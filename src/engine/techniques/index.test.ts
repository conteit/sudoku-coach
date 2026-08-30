import { describe, expect, it } from 'vitest';
import { Board } from '../board';
import { TECHNIQUE_IDS } from '../types';
import { CATALOG, DETECTORS, harderOf, rankOf } from './index';
import { describeFinding, EMPTY_GRID, EXAMPLES, PUZZLES, SOLVED_GRID } from './fixtures';

describe('the catalog', () => {
  it('is exactly TECHNIQUE_IDS, in order', () => {
    // The order is the difficulty scale (spec §5.4). If this fails, every
    // puzzle the generator has ever rated has silently changed grade.
    expect(CATALOG.map((d) => d.id)).toEqual([...TECHNIQUE_IDS]);
  });

  it('indexes every detector by id', () => {
    for (const id of TECHNIQUE_IDS) expect(DETECTORS[id].id).toBe(id);
  });

  it('ranks techniques by catalog position', () => {
    expect(rankOf('naked_single')).toBe(0);
    expect(rankOf('remote_pairs')).toBe(TECHNIQUE_IDS.length - 1);
    expect(harderOf('naked_pair', 'x_wing')).toBe('x_wing');
    expect(harderOf('x_wing', 'naked_pair')).toBe('x_wing');
    expect(harderOf('pointing', 'pointing')).toBe('pointing');
  });
});

describe('every detector', () => {
  it('finds nothing on an empty grid', () => {
    // Nine candidates everywhere: no cell is cornered, no digit is confined,
    // no pair of cells agrees on anything.
    const board = Board.fromString(EMPTY_GRID);
    for (const detector of CATALOG) expect(detector.detect(board)).toBeNull();
  });

  it('finds nothing on a solved grid', () => {
    const board = Board.fromString(SOLVED_GRID);
    for (const detector of CATALOG) expect(detector.detect(board)).toBeNull();
  });

  it('fires on its own worked example', () => {
    for (const detector of CATALOG) {
      const finding = detector.detect(Board.fromString(EXAMPLES[detector.id]));
      expect(finding, `${detector.id} found nothing on its own example`).not.toBeNull();
      expect(finding?.technique).toBe(detector.id);
    }
  });

  it('never returns a finding that proves nothing', () => {
    forEveryBoard((board, label) => {
      for (const detector of CATALOG) {
        const finding = detector.detect(board);
        if (!finding) continue;
        expect(
          finding.eliminations.length + finding.placements.length,
          `${label}: ${describeFinding(finding)}`,
        ).toBeGreaterThan(0);
      }
    });
  });

  it('only eliminates candidates the board actually still holds', () => {
    forEveryBoard((board, label) => {
      for (const detector of CATALOG) {
        const finding = detector.detect(board);
        if (!finding) continue;
        for (const e of finding.eliminations) {
          expect(
            board.trueCandidates(e.cell).has(e.digit),
            `${label}: ${describeFinding(finding)} — r${e.cell} has no ${e.digit} to remove`,
          ).toBe(true);
        }
        for (const p of finding.placements) {
          expect(board.values[p.cell], `${label}: ${describeFinding(finding)}`).toBeNull();
          expect(board.trueCandidates(p.cell).has(p.digit)).toBe(true);
        }
      }
    });
  });

  it('reports evidence cells and houses that belong to the pattern', () => {
    forEveryBoard((board, label) => {
      for (const detector of CATALOG) {
        const finding = detector.detect(board);
        if (!finding) continue;
        expect(finding.cells.length, `${label}: ${describeFinding(finding)}`).toBeGreaterThan(0);
        expect(finding.digits.length, `${label}: ${describeFinding(finding)}`).toBeGreaterThan(0);
        expect([...finding.cells].sort((a, b) => a - b)).toEqual(finding.cells);
        expect(new Set(finding.cells).size).toBe(finding.cells.length);
        expect(new Set(finding.houses).size).toBe(finding.houses.length);
      }
    });
  });

  it('is deterministic: the same board yields the same finding', () => {
    forEveryBoard((board, label) => {
      for (const detector of CATALOG) {
        const first = detector.detect(board);
        const second = detector.detect(Board.fromString(board.toString()));
        expect(second, label).toEqual(first);
      }
    });
  });
});

/** Runs `check` over every fixture grid, labelled for legible failures. */
function forEveryBoard(check: (board: Board, label: string) => void): void {
  for (const [id, grid] of Object.entries(EXAMPLES)) check(Board.fromString(grid), `example ${id}`);
  for (const puzzle of PUZZLES) check(Board.fromString(puzzle.givens), `puzzle ${puzzle.name}`);
}
