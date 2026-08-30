/**
 * XY-Wing.
 *
 * A pivot holding exactly {X,Y} sees two pincers holding exactly {X,Z} and
 * {Y,Z}. Whichever digit the pivot takes forces the opposite pincer to Z, so
 * one of the two pincers is Z no matter what — and any cell seeing both of them
 * cannot be Z.
 *
 * The argument needs nothing of the pincers but that each sees the pivot; they
 * need not see each other, and they need not share a house with the eliminated
 * cell beyond both being visible from it.
 */

import type { BoardView, CellIndex, Detector, Digit, Elimination, House } from '../types';
import { CELL_COUNT } from '../board';
import { buildFinding, combinations, commonPeers } from './util';

/** Houses containing both `a` and `b` — how the pincer hangs off the pivot. */
function linkHouses(board: BoardView, a: CellIndex, b: CellIndex): House[] {
  return board.housesOf(a).filter((h) => h.cells.includes(b));
}

/** The single digit of `pair` that is not in `pivot`, or null if not exactly one. */
function wingDigit(pair: ReadonlySet<Digit>, pivot: ReadonlySet<Digit>): Digit | null {
  const outside = [...pair].filter((d) => !pivot.has(d));
  return outside.length === 1 ? outside[0] : null;
}

/** The single digit shared by `pair` and `pivot`, or null if not exactly one. */
function hingeDigit(pair: ReadonlySet<Digit>, pivot: ReadonlySet<Digit>): Digit | null {
  const shared = [...pair].filter((d) => pivot.has(d));
  return shared.length === 1 ? shared[0] : null;
}

export const xyWing: Detector = {
  id: 'xy_wing',
  detect(board) {
    for (let pivot = 0; pivot < CELL_COUNT; pivot++) {
      const hinge = board.trueCandidates(pivot);
      if (hinge.size !== 2) continue;
      const bivalue = board.peers(pivot).filter((p) => board.trueCandidates(p).size === 2);
      if (bivalue.length < 2) continue;
      for (const [left, right] of combinations(bivalue, 2)) {
        const leftCands = board.trueCandidates(left);
        const rightCands = board.trueCandidates(right);
        const digit = wingDigit(leftCands, hinge);
        // Both pincers must hang off the pivot by the *same* outside digit...
        if (digit === null || wingDigit(rightCands, hinge) !== digit) continue;
        // ...and grip *different* pivot digits, or the pivot proves nothing.
        const leftHinge = hingeDigit(leftCands, hinge);
        const rightHinge = hingeDigit(rightCands, hinge);
        if (leftHinge === null || rightHinge === null || leftHinge === rightHinge) continue;
        const eliminations: Elimination[] = [];
        for (const cell of commonPeers(board, left, right)) {
          if (cell === pivot) continue;
          if (board.trueCandidates(cell).has(digit)) eliminations.push({ cell, digit });
        }
        const finding = buildFinding({
          technique: 'xy_wing',
          digits: [leftHinge, rightHinge, digit],
          cells: [pivot, left, right],
          houses: [...linkHouses(board, pivot, left), ...linkHouses(board, pivot, right)],
          eliminations,
        });
        if (finding) return finding;
      }
    }
    return null;
  },
};
