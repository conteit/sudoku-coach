/**
 * The two singles — the only detectors that prove a *placement* rather than an
 * elimination, and the only ones a beginner needs (spec §5.4, difficulty easy).
 *
 * Neither reports eliminations. A single's peer eliminations follow from the
 * placement itself, not from the pattern, and the solver derives them when it
 * writes the digit in; listing them here would double-count the same deduction
 * in the hint text.
 */

import type { Detector, Digit } from '../types';
import { DIGITS } from '../types';
import { CELL_COUNT, HOUSES } from '../board';
import { buildFinding, cellsWithCandidate } from './util';

/** A cell with exactly one remaining candidate. */
export const nakedSingle: Detector = {
  id: 'naked_single',
  detect(board) {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const candidates = board.trueCandidates(cell);
      if (candidates.size !== 1) continue;
      const [digit] = candidates as ReadonlySet<Digit>;
      return buildFinding({
        technique: 'naked_single',
        digits: [digit],
        cells: [cell],
        houses: board.housesOf(cell),
        placements: [{ cell, digit }],
      });
    }
    return null;
  },
};

/**
 * A digit with exactly one home left in a house. Scanned in `HOUSES` order
 * (row 0, col 0, box 0, row 1, ...) so the same board always yields the same
 * house first.
 */
export const hiddenSingle: Detector = {
  id: 'hidden_single',
  detect(board) {
    for (const house of HOUSES) {
      for (const digit of DIGITS) {
        const spots = cellsWithCandidate(board, house, digit);
        if (spots.length !== 1) continue;
        return buildFinding({
          technique: 'hidden_single',
          digits: [digit],
          cells: spots,
          houses: [house],
          placements: [{ cell: spots[0], digit }],
        });
      }
    }
    return null;
  },
};
