import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Board, BOXES, COLS, HOUSES, ROWS } from '../board';
import {
  buildFinding, cellsWithCandidate, combinations, commonPeers, orderHouses, unionCandidates,
} from './util';
import { EXAMPLES } from './fixtures';

describe('combinations', () => {
  it('enumerates in lexicographic order so scans stay deterministic', () => {
    expect([...combinations([1, 2, 3, 4], 2)]).toEqual([
      [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
    ]);
  });

  it('yields nothing when k is out of range', () => {
    expect([...combinations([1, 2], 0)]).toEqual([]);
    expect([...combinations([1, 2], 3)]).toEqual([]);
  });

  it('yields n-choose-k tuples of distinct, ascending items', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 1, max: 4 }), (n, k) => {
        const items = Array.from({ length: n }, (_, i) => i);
        const combos = [...combinations(items, k)];
        const expected = k > n ? 0 : factorial(n) / (factorial(k) * factorial(n - k));
        expect(combos).toHaveLength(expected);
        for (const combo of combos) {
          expect(combo).toHaveLength(k);
          expect([...combo].sort((a, b) => a - b)).toEqual(combo);
        }
        expect(new Set(combos.map((c) => c.join(','))).size).toBe(combos.length);
      }),
    );
  });

  it('produces one tuple at a time, so a detector can stop at the first hit', () => {
    // 126 quads exist over nine items; asking twice must compute exactly two.
    const tuples = combinations([1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
    expect(tuples.next()).toEqual({ value: [1, 2, 3, 4], done: false });
    expect(tuples.next()).toEqual({ value: [1, 2, 3, 5], done: false });
  });
});

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

describe('house queries', () => {
  it('lists the cells of a house still holding a digit', () => {
    const board = Board.fromString(EXAMPLES.pointing);
    expect(cellsWithCandidate(board, BOXES[3], 3)).toEqual([37, 46]);
    // Filled cells report no candidates, so they never appear.
    expect(cellsWithCandidate(board, ROWS[0], 6)).not.toContain(1);
  });

  it('unions candidates across cells', () => {
    const board = Board.fromString(EXAMPLES.naked_pair);
    expect([...unionCandidates(board, [29, 33])].sort()).toEqual([1, 9]);
  });

  it('finds cells seeing two others, excluding the two themselves', () => {
    const board = Board.fromString(EXAMPLES.xy_wing);
    const shared = commonPeers(board, 6, 8);
    expect(shared).not.toContain(6);
    expect(shared).not.toContain(8);
    for (const cell of shared) {
      expect(board.peers(cell)).toContain(6);
      expect(board.peers(cell)).toContain(8);
    }
  });

  it('orders and dedupes houses canonically', () => {
    expect(orderHouses([COLS[7], ROWS[0], BOXES[0], ROWS[0]]).map((h) => `${h.kind}${h.index}`))
      .toEqual(['row0', 'box0', 'col7']);
    expect(orderHouses(HOUSES)).toEqual([...HOUSES]);
  });
});

describe('buildFinding', () => {
  it('refuses a pattern that proves nothing', () => {
    expect(
      buildFinding({
        technique: 'naked_pair',
        digits: [1, 9],
        cells: [29, 33],
        houses: [ROWS[3]],
      }),
    ).toBeNull();
  });

  it('sorts and dedupes everything it returns', () => {
    const finding = buildFinding({
      technique: 'naked_triple',
      digits: [9, 1, 3, 9],
      cells: [46, 29, 37, 29],
      houses: [BOXES[3], ROWS[3], BOXES[3]],
      eliminations: [
        { cell: 47, digit: 9 },
        { cell: 47, digit: 1 },
        { cell: 47, digit: 9 },
        { cell: 30, digit: 3 },
      ],
    });
    expect(finding?.digits).toEqual([1, 3, 9]);
    expect(finding?.cells).toEqual([29, 37, 46]);
    expect(finding?.houses.map((h) => `${h.kind}${h.index}`)).toEqual(['row3', 'box3']);
    expect(finding?.eliminations).toEqual([
      { cell: 30, digit: 3 },
      { cell: 47, digit: 1 },
      { cell: 47, digit: 9 },
    ]);
  });

  it('accepts a placement with no eliminations', () => {
    const finding = buildFinding({
      technique: 'naked_single',
      digits: [5],
      cells: [70],
      houses: [],
      placements: [{ cell: 70, digit: 5 }],
    });
    expect(finding?.placements).toEqual([{ cell: 70, digit: 5 }]);
    expect(finding?.eliminations).toEqual([]);
  });
});
