import { describe, expect, it } from 'vitest';
import { Board } from '../board';
import { hiddenSingle, nakedSingle } from './singles';
import { EXAMPLES, findingShape, ONE_ROW_GRID } from './fixtures';

describe('naked single', () => {
  it('places the only digit a cell has left', () => {
    // r8c8 is the first cell in index order with a single candidate: its row,
    // column and box between them account for eight of the nine digits.
    const board = Board.fromString(EXAMPLES.naked_single);
    expect(board.trueCandidates(70)).toEqual(new Set([5]));
    expect(findingShape(nakedSingle.detect(board))).toEqual({
      technique: 'naked_single',
      digits: [5],
      cells: ['r8c8'],
      houses: ['row7', 'col7', 'box8'],
      eliminations: [],
      placements: ['r8c8=5'],
    });
  });

  it('declines a board where every empty cell still has a choice', () => {
    // A 27-clue puzzle whose remaining cells all carry two or more candidates.
    const board = Board.fromString(EXAMPLES.hidden_single);
    for (let cell = 0; cell < 81; cell++) {
      if (board.values[cell] === null) expect(board.trueCandidates(cell).size).toBeGreaterThan(1);
    }
    expect(nakedSingle.detect(board)).toBeNull();
  });
});

describe('hidden single', () => {
  it('places a digit with one home left in a house', () => {
    // In box 1 the digit 3 fits only r1c4 — the other empty cells of the box
    // all see a 3 already. r1c4 itself has more than one candidate, which is
    // what makes this hidden rather than naked.
    const board = Board.fromString(EXAMPLES.hidden_single);
    expect(board.trueCandidates(3).size).toBeGreaterThan(1);
    expect(findingShape(hiddenSingle.detect(board))).toEqual({
      technique: 'hidden_single',
      digits: [3],
      cells: ['r1c4'],
      houses: ['box1'],
      eliminations: [],
      placements: ['r1c4=3'],
    });
  });

  it('declines a board too sparse to corner any digit', () => {
    // One filled row leaves every digit at least two homes in every house.
    expect(hiddenSingle.detect(Board.fromString(ONE_ROW_GRID))).toBeNull();
  });
});
