/**
 * SPIKE (#140) — throwaway. Delete this file, do not build on it.
 *
 * One technique, written by hand, so that a crude claim panel can be played
 * on a real phone before the feature is designed properly. The real verifier
 * turns every detector into a generator and defines `detect` as "the first
 * one it yields", so that the rule has exactly one reading; this file is the
 * second reading that approach exists to avoid, and it is acceptable only
 * because nothing downstream of it is meant to survive.
 *
 * What it does share with the real design, because the spike is worthless
 * otherwise: it judges the claim against **true candidates computed from the
 * values**, never the player's notes. A missing note would otherwise
 * manufacture a pattern that is not there and the app would confirm it.
 */

import { COLS, ROWS, colOf, rowOf, Board } from './board';
import type { CellIndex, Digit, House } from './types';
import { cellsWithCandidate } from './techniques/util';

/**
 * Whether `cells` really are an X-Wing on `digit`.
 *
 * Mirrors `fish.ts` deliberately, including its last condition: a pattern
 * that eliminates nothing is not a finding there and is not a claim here.
 */
export function xWingHolds(
  values: readonly (Digit | null)[],
  digit: Digit,
  cells: readonly CellIndex[],
): boolean {
  const claimed = new Set(cells);
  if (claimed.size !== 4) return false;

  const board = Board.fromValues(values);

  // Four distinct cells spanning two rows and two columns can only be the
  // full cross product of them, which is the shape an X-Wing has.
  const rows = [...new Set([...claimed].map(rowOf))];
  const cols = [...new Set([...claimed].map(colOf))];
  if (rows.length !== 2 || cols.length !== 2) return false;

  // The pigeonhole has to be tight: in each base house the digit must have
  // exactly these two homes and no third one, or it proves nothing.
  //
  // This is also what rules out a claimed cell that is filled, or that cannot
  // take the digit at all: such a cell is not among the house's homes, so no
  // house can have exactly the claimed pair. An explicit candidate check
  // ahead of this was written first and then deleted — no mutation could kill
  // it, which is the tell that it was never deciding anything.
  const tight = (houses: readonly House[], lines: number[]): boolean =>
    lines.every((line) => {
      const spots = cellsWithCandidate(board, houses[line], digit);
      return spots.length === 2 && spots.every((spot) => claimed.has(spot));
    });

  const byRow = tight(ROWS, rows);
  if (!byRow && !tight(COLS, cols)) return false;

  const covers = byRow ? cols.map((c) => COLS[c]) : rows.map((r) => ROWS[r]);
  return covers.some((house) =>
    house.cells.some((cell) => !claimed.has(cell) && board.trueCandidates(cell).has(digit)),
  );
}
