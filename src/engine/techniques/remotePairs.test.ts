import { describe, expect, it } from 'vitest';
import { Board, peersOf } from '../board';
import { remotePairs } from './remotePairs';
import { shortestPath } from './chain';
import { chainComponents } from './chain';
import { EXAMPLES, findingShape, PUZZLES } from './fixtures';

describe('remote pairs', () => {
  it('clears both digits from a cell seeing the two ends of an odd chain', () => {
    // r2c5 — r5c5 (column 5) — r6c4 (box 5) — r6c2 (row 6): four cells, all
    // {1,5}, three links. Peers cannot repeat a digit, so the assignment flips
    // at every link and the two ends are opposite. r2c2 sees both ends, so one
    // of them is a 1 whichever way the chain falls.
    const board = Board.fromString(EXAMPLES.remote_pairs);
    for (const cell of [13, 40, 46, 48]) {
      expect([...board.trueCandidates(cell)].sort()).toEqual([1, 5]);
    }
    expect(peersOf(10)).toEqual(expect.arrayContaining([13, 46]));
    expect(peersOf(13)).not.toContain(46);

    expect(findingShape(remotePairs.detect(board))).toEqual({
      technique: 'remote_pairs',
      digits: [1, 5],
      cells: ['r2c5', 'r5c5', 'r6c2', 'r6c4'],
      houses: ['col4', 'box4', 'row5'],
      eliminations: ['r2c2≠1'],
      placements: [],
    });
  });

  it('declines a puzzle with too few cells sharing one pair', () => {
    expect(remotePairs.detect(Board.fromString(PUZZLES[0].givens))).toBeNull();
  });

  it('declines chains shorter than four cells, which are only naked pairs', () => {
    // No pair of digits has four cells to itself here, so the shortest odd
    // distance available is one — a naked pair, whose deduction belongs to a
    // detector the player meets much earlier.
    const board = Board.fromString(EXAMPLES.xy_wing);
    const counts = new Map<string, number>();
    for (let cell = 0; cell < 81; cell++) {
      const candidates = board.trueCandidates(cell);
      if (candidates.size !== 2) continue;
      const key = [...candidates].sort().join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThan(4);
    expect(remotePairs.detect(board)).toBeNull();
  });
});

describe('shortest path', () => {
  it('walks the chain and reports null for disconnected cells', () => {
    const house = { kind: 'row' as const, index: 0, cells: [0, 1, 2] };
    const [component] = chainComponents([
      { a: 0, b: 1, house },
      { a: 1, b: 2, house },
    ]);
    expect(shortestPath(component, 0, 2)).toEqual([0, 1, 2]);
    expect(shortestPath(component, 0, 0)).toEqual([0]);
    expect(shortestPath(component, 0, 5)).toBeNull();
  });
});
