import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  Board, BOXES, boxOf, CELL_COUNT, cellAt, cellName, COLS, colOf, formatGrid,
  HOUSES, housesOf, parseGrid, peersOf, ROWS, rowOf, sharesHouse,
} from './board';

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

describe('geometry', () => {
  it('derives row, col and box from the index', () => {
    expect([rowOf(0), colOf(0), boxOf(0)]).toEqual([0, 0, 0]);
    expect([rowOf(80), colOf(80), boxOf(80)]).toEqual([8, 8, 8]);
    expect([rowOf(40), colOf(40), boxOf(40)]).toEqual([4, 4, 4]);
    expect(boxOf(cellAt(2, 6))).toBe(2);
    expect(boxOf(cellAt(6, 2))).toBe(6);
  });

  it('round-trips index and coordinates', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), (i) => {
        expect(cellAt(rowOf(i), colOf(i))).toBe(i);
      }),
    );
  });

  it('names cells one-based for humans', () => {
    expect(cellName(0)).toBe('r1c1');
    expect(cellName(80)).toBe('r9c9');
  });

  it('has 27 houses of 9 distinct cells each', () => {
    expect(HOUSES).toHaveLength(27);
    expect([ROWS, COLS, BOXES].map((h) => h.length)).toEqual([9, 9, 9]);
    for (const house of HOUSES) {
      expect(house.cells).toHaveLength(9);
      expect(new Set(house.cells).size).toBe(9);
    }
  });

  it('covers every cell exactly once per house kind', () => {
    for (const kind of [ROWS, COLS, BOXES]) {
      expect(new Set(kind.flatMap((h) => [...h.cells])).size).toBe(CELL_COUNT);
    }
  });

  it('gives every cell exactly 20 peers, and peering is symmetric', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      const peers = peersOf(i);
      expect(peers).toHaveLength(20);
      expect(peers).not.toContain(i);
      for (const p of peers) expect(peersOf(p)).toContain(i);
    }
  });

  it('agrees with sharesHouse on the peer relation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 80 }), (a, b) => {
        expect(peersOf(a).includes(b)).toBe(sharesHouse(a, b));
      }),
    );
  });

  it('returns the row, col and box for a cell', () => {
    const hs = housesOf(cellAt(4, 7));
    expect(hs.map((h) => h.kind)).toEqual(['row', 'col', 'box']);
    expect(hs.map((h) => h.index)).toEqual([4, 7, 5]);
  });
});

describe('parsing', () => {
  it('round-trips a grid string', () => {
    expect(formatGrid(parseGrid(PUZZLE))).toBe(PUZZLE);
  });

  it('accepts 0 and whitespace as empty', () => {
    const zeros = '0'.repeat(81);
    expect(parseGrid(zeros).every((v) => v === null)).toBe(true);
    expect(formatGrid(parseGrid(SOLVED.replace(/(.{9})/g, '$1\n')))).toBe(SOLVED);
  });

  it('rejects wrong length and bad characters', () => {
    expect(() => parseGrid('123')).toThrow(/81 chars/);
    expect(() => parseGrid('x'.repeat(81))).toThrow(/bad grid char/);
  });
});

describe('Board', () => {
  it('computes candidates as digits absent from every peer', () => {
    const b = Board.fromString(PUZZLE);
    const cell = 2; // r1c3, empty
    const placed = new Set(peersOf(cell).map((p) => b.values[p]).filter((v) => v !== null));
    for (const d of b.trueCandidates(cell)) expect(placed.has(d)).toBe(false);
    expect(b.trueCandidates(cell).size).toBe(9 - placed.size);
  });

  it('reports no candidates for a filled cell', () => {
    expect(Board.fromString(PUZZLE).trueCandidates(0).size).toBe(0);
  });

  it('never drops the solution digit from a cell candidate set', () => {
    const puzzle = Board.fromString(PUZZLE);
    for (let i = 0; i < CELL_COUNT; i++) {
      if (puzzle.values[i] !== null) continue;
      const truth = Number(SOLVED[i]);
      expect([...puzzle.trueCandidates(i)]).toContain(truth);
    }
  });

  it('is immutable under withValue', () => {
    const a = Board.fromString(PUZZLE);
    const b = a.withValue(2, 4);
    expect(a.values[2]).toBeNull();
    expect(b.values[2]).toBe(4);
    expect(b.trueCandidates(2).size).toBe(0);
  });

  it('recognises a solved grid', () => {
    const solved = Board.fromString(SOLVED);
    expect(solved.isSolved()).toBe(true);
    expect(solved.hasContradiction()).toBe(false);
  });

  it('detects a duplicate digit in a house', () => {
    const broken = Board.fromString(SOLVED).withValue(1, 5);
    expect(broken.hasContradiction()).toBe(true);
    expect(broken.conflictsAt(1)).toContain(0);
  });

  it('detects an empty cell with no remaining candidate', () => {
    const starved = Board.fromString(SOLVED).withValue(0, null).withValue(1, null);
    expect(starved.withValue(0, 3).hasContradiction()).toBe(true);
  });

  it('lists empty cells', () => {
    expect(Board.fromString(PUZZLE).emptyCells()).toHaveLength(
      [...PUZZLE].filter((c) => c === '.').length,
    );
  });
});
