import { describe, expect, it } from 'vitest';
import { Board, COLS, ROWS } from '../board';
import { swordfish, xWing } from './fish';
import { cellsWithCandidate } from './util';
import { EXAMPLES, findingShape, PUZZLES } from './fixtures';

describe('x-wing', () => {
  it('covers two base lines with two cross lines', () => {
    // Columns 4 and 6 can each take a 2 only on rows 2 and 4. Between them
    // they use rows 2 and 4 up, so row 2 has no 2 left outside those columns.
    // Note the base here is the columns, not the rows: row 2 has more than two
    // homes for a 2, which is exactly why r2c1 and r2c2 are the targets.
    const board = Board.fromString(EXAMPLES.x_wing);
    expect(cellsWithCandidate(board, COLS[3], 2)).toEqual([12, 30]);
    expect(cellsWithCandidate(board, COLS[5], 2)).toEqual([14, 32]);
    expect(cellsWithCandidate(board, ROWS[1], 2).length).toBeGreaterThan(2);
    expect(findingShape(xWing.detect(board))).toEqual({
      technique: 'x_wing',
      digits: [2],
      cells: ['r2c4', 'r2c6', 'r4c4', 'r4c6'],
      houses: ['row1', 'row3', 'col3', 'col5'],
      eliminations: ['r2c1≠2', 'r2c2≠2'],
      placements: [],
    });
  });

  it('declines a puzzle with no two lines sharing a digit pair', () => {
    expect(xWing.detect(Board.fromString(PUZZLES[4].givens))).toBeNull();
  });
});

describe('swordfish', () => {
  it('covers three base lines with three cross lines', () => {
    // Rows 2, 5 and 6 hold the 3s of columns 2, 7 and 8 between them.
    const board = Board.fromString(EXAMPLES.swordfish);
    for (const row of [ROWS[1], ROWS[4], ROWS[5]]) {
      expect(cellsWithCandidate(board, row, 3).length).toBe(2);
    }
    expect(findingShape(swordfish.detect(board))).toEqual({
      technique: 'swordfish',
      digits: [3],
      cells: ['r2c7', 'r2c8', 'r5c2', 'r5c8', 'r6c2', 'r6c7'],
      houses: ['row1', 'col1', 'row4', 'row5', 'col6', 'col7'],
      eliminations: ['r8c2≠3'],
      placements: [],
    });
  });

  it('declines a puzzle with no three lines covering three cross lines', () => {
    expect(swordfish.detect(Board.fromString(PUZZLES[0].givens))).toBeNull();
  });
});
