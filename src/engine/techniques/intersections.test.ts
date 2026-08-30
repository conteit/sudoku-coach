import { describe, expect, it } from 'vitest';
import { Board, boxOf, colOf } from '../board';
import { claiming, pointing } from './intersections';
import { cellsWithCandidate } from './util';
import { BOXES, COLS, ROWS } from '../board';
import { EXAMPLES, findingShape, ONE_ROW_GRID } from './fixtures';

describe('pointing', () => {
  it('exports a box-confined digit to the line it sits on', () => {
    // Box 3 can only take a 3 in r5c2 and r6c2 — both in column 2. Column 2
    // therefore spends its 3 inside box 3, so r8c2 loses the candidate.
    const board = Board.fromString(EXAMPLES.pointing);
    const spots = cellsWithCandidate(board, BOXES[3], 3);
    expect(spots).toEqual([37, 46]);
    expect(new Set(spots.map(colOf)).size).toBe(1);
    expect(findingShape(pointing.detect(board))).toEqual({
      technique: 'pointing',
      digits: [3],
      cells: ['r5c2', 'r6c2'],
      houses: ['col1', 'box3'],
      eliminations: ['r8c2≠3'],
      placements: [],
    });
  });

  it('declines a puzzle where no box corners a digit onto one line', () => {
    expect(pointing.detect(Board.fromString(EXAMPLES.hidden_single))).toBeNull();
  });
});

describe('claiming', () => {
  it('exports a line-confined digit to the box it sits in', () => {
    // Row 2 can only take a 3 in r2c7 and r2c8, both inside box 2. Box 2
    // therefore spends its 3 on row 2, so r1c7 and r1c8 lose it.
    const board = Board.fromString(EXAMPLES.claiming);
    const spots = cellsWithCandidate(board, ROWS[1], 3);
    expect(spots).toEqual([15, 16]);
    expect(new Set(spots.map(boxOf)).size).toBe(1);
    expect(findingShape(claiming.detect(board))).toEqual({
      technique: 'claiming',
      digits: [3],
      cells: ['r2c7', 'r2c8'],
      houses: ['row1', 'box2'],
      eliminations: ['r1c7≠3', 'r1c8≠3'],
      placements: [],
    });
  });

  it('declines a board too sparse to confine a line digit to one box', () => {
    // With one row filled, a digit that row spent elsewhere — 4 sits in box 1 —
    // still has homes spanning all three boxes of column 1.
    const board = Board.fromString(ONE_ROW_GRID);
    expect(new Set(cellsWithCandidate(board, COLS[0], 4).map(boxOf)).size).toBe(3);
    expect(claiming.detect(board)).toBeNull();
  });
});
