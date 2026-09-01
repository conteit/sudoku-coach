import { describe, expect, it } from 'vitest';
import type { Cell, Digit } from '../engine/types';
import { parseGrid } from '../engine/board';
import type { Move } from './types';
import { deadNotes } from './deadNotes';

// Same fixture as board.test.ts. Row 0 is "53..7....": r1c1 (index 0) is a
// given 5 and r1c5 (index 4) a given 7; r1c3, r1c4 and r1c6 (indices 2, 3, 5)
// are empty and all peers of each other via the row.
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

function cellsWith(notes: Record<number, Digit[]>, entries: Record<number, Digit> = {}): Cell[] {
  const values = parseGrid(PUZZLE);
  return values.map((value, index) => ({
    value: entries[index] ?? value,
    given: value !== null,
    candidates: new Set<Digit>(notes[index] ?? []),
  }));
}

const noteMove = (cell: number, digit: Digit, at: number): Move => ({
  kind: 'addCandidate',
  cell,
  digit,
  prev: { value: null, candidates: [] },
  at,
});

const setMove = (cell: number, digit: Digit, at: number): Move => ({
  kind: 'set',
  cell,
  digit,
  prev: { value: null, candidates: [] },
  at,
});

describe('deadNotes', () => {
  it('flags a note that a later placement killed', () => {
    // Note 4 in r1c3 (index 2) at t=1, then place 4 in r1c4 (index 3, same row) at t=2.
    const cells = cellsWith({ 2: [4] }, { 3: 4 });
    const moves = [noteMove(2, 4, 1), setMove(3, 4, 2)];
    expect(deadNotes(cells, moves)[2]).toEqual([4]);
  });

  it('leaves a note written after the placement alone — that error is the player to find', () => {
    const cells = cellsWith({ 2: [4] }, { 3: 4 });
    const moves = [setMove(3, 4, 1), noteMove(2, 4, 2)];
    expect(deadNotes(cells, moves)[2]).toEqual([]);
  });

  it('never flags a note that only a given contradicts', () => {
    // 5 is a given at r1c1 (index 0), a peer of r1c3 (index 2). No move
    // placed it, so nothing killed it.
    const cells = cellsWith({ 2: [5] });
    expect(deadNotes(cells, [noteMove(2, 5, 1)])[2]).toEqual([]);
  });

  it('unflags when the killing placement is gone from the log', () => {
    // Same board as the first case, but the set move has been undone off the stack.
    const cells = cellsWith({ 2: [4] }, { 3: 4 });
    expect(deadNotes(cells, [noteMove(2, 4, 1)])[2]).toEqual([]);
  });

  it('re-flags a note rewritten before a second placement', () => {
    // Written at 1, killed at 2 (r1c4, index 3), erased and rewritten at 3,
    // killed again at 5 by a second peer (r1c6, index 5) placed at t=4/5.
    const cells = cellsWith({ 2: [4] }, { 3: 4, 5: 4 });
    const moves: Move[] = [
      noteMove(2, 4, 1),
      setMove(3, 4, 2),
      { kind: 'removeCandidate', cell: 2, digit: 4 as Digit, prev: { value: null, candidates: [4 as Digit] }, at: 3 },
      noteMove(2, 4, 4),
      setMove(5, 4, 5),
    ];
    expect(deadNotes(cells, moves)[2]).toEqual([4]);
  });

  it('reports ascending digits and an empty array for a cell with nothing dead', () => {
    const cells = cellsWith({ 2: [4, 6] }, { 3: 6, 5: 4 });
    const moves = [noteMove(2, 4, 1), noteMove(2, 6, 2), setMove(3, 6, 3), setMove(5, 4, 4)];
    expect(deadNotes(cells, moves)[2]).toEqual([4, 6]);
    // Index 0 is a given cell (value 5): never eligible for a note, always [].
    expect(deadNotes(cells, moves)[0]).toEqual([]);
  });
});
