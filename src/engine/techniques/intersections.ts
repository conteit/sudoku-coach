/**
 * Box/line intersections — the same observation read from either side.
 *
 * A digit's homes inside a box, or inside a line, live in the intersection of a
 * box and a line. Whichever house the digit is *known* to occupy exports the
 * constraint to the other one:
 *
 * - pointing: confined within a box to one line -> clear the rest of the line.
 * - claiming: confined within a line to one box -> clear the rest of the box.
 */

import type { BoardView, CellIndex, Detector, Digit, Elimination, House } from '../types';
import { DIGITS } from '../types';
import { BOXES, boxOf, COLS, colOf, ROWS, rowOf } from '../board';
import { buildFinding, cellsWithCandidate } from './util';

/** Eliminations of `digit` from `from`, skipping the intersection cells. */
function clearOutside(
  board: BoardView,
  from: House,
  keep: ReadonlySet<CellIndex>,
  digit: Digit,
): Elimination[] {
  const eliminations: Elimination[] = [];
  for (const cell of from.cells) {
    if (keep.has(cell)) continue;
    if (board.trueCandidates(cell).has(digit)) eliminations.push({ cell, digit });
  }
  return eliminations;
}

export const pointing: Detector = {
  id: 'pointing',
  detect(board) {
    for (const box of BOXES) {
      for (const digit of DIGITS) {
        const spots = cellsWithCandidate(board, box, digit);
        if (spots.length < 2) continue;
        const sameRow = spots.every((c) => rowOf(c) === rowOf(spots[0]));
        const sameCol = spots.every((c) => colOf(c) === colOf(spots[0]));
        const line = sameRow ? ROWS[rowOf(spots[0])] : sameCol ? COLS[colOf(spots[0])] : null;
        if (!line) continue;
        const finding = buildFinding({
          technique: 'pointing',
          digits: [digit],
          cells: spots,
          houses: [box, line],
          eliminations: clearOutside(board, line, new Set(spots), digit),
        });
        if (finding) return finding;
      }
    }
    return null;
  },
};

export const claiming: Detector = {
  id: 'claiming',
  detect(board) {
    for (const line of [...ROWS, ...COLS]) {
      for (const digit of DIGITS) {
        const spots = cellsWithCandidate(board, line, digit);
        if (spots.length < 2) continue;
        if (!spots.every((c) => boxOf(c) === boxOf(spots[0]))) continue;
        const box = BOXES[boxOf(spots[0])];
        const finding = buildFinding({
          technique: 'claiming',
          digits: [digit],
          cells: spots,
          houses: [line, box],
          eliminations: clearOutside(board, box, new Set(spots), digit),
        });
        if (finding) return finding;
      }
    }
    return null;
  },
};
