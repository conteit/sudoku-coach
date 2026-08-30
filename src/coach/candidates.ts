/**
 * The pencil-mark check (R8).
 *
 * A pure diff of what the player has noted against what the constraints
 * actually allow. It reports and it stops there: **nothing in this module
 * writes a mark**. That is architecture invariant 1 — user candidates are
 * user-owned — and it is the easiest thing in the coach to get wrong, because
 * "check my notes" is one keystroke away from "fix my notes" and the fix is
 * always available. Every input is `readonly`/`ReadonlySet` so the compiler
 * says no first, and `candidates.test.ts` deep-compares the marks either side
 * of a review so a future refactor cannot quietly start correcting them.
 *
 * ## What counts as checked
 *
 * Only empty cells the player has actually written in. A cell with no marks is
 * not a wrong cell, it is a cell they have not got to yet; reporting eight
 * "missing" candidates there would bury the two real mistakes in eighty pieces
 * of noise. A filled cell is left alone as well — leftover marks under a placed
 * digit are the stale-marks teachable moment (`triggers.ts`), not a mistake in
 * reasoning.
 */

import type { BoardView, CellIndex, Digit } from '../engine/types';
import { DIGITS } from '../engine/types';
import { Board } from '../engine/board';
import { t } from '../i18n';
import type { Locale } from '../state/types';
import type { CandidateIssue, CandidateReview } from './types';
import type { CoachCell } from './format';

/** Peers that already hold `digit` — the constraint that kills a mark. */
const holdersOf = (board: BoardView, cell: CellIndex, digit: Digit): CellIndex[] =>
  board.peers(cell).filter((peer) => board.values[peer] === digit);

/**
 * Diffs `marks` against the board's true candidates.
 *
 * Issues come back in cell order, then digit order, so the same board and the
 * same notes always produce the same list — the UI spotlights from it, and a
 * list that reshuffled between two identical checks would read as the coach
 * changing its mind.
 */
export function reviewMarks(
  board: BoardView,
  marks: readonly ReadonlySet<Digit>[],
  locale: Locale,
): CandidateReview {
  const issues: CandidateIssue[] = [];
  const cleanCells: CellIndex[] = [];
  let checkedCells = 0;

  for (let cell = 0; cell < marks.length; cell++) {
    const noted = marks[cell];
    if (board.values[cell] !== null || noted.size === 0) continue;
    checkedCells++;

    const truth = board.trueCandidates(cell);
    const before = issues.length;
    for (const digit of DIGITS) {
      if (noted.has(digit) === truth.has(digit)) continue;
      issues.push(
        noted.has(digit)
          ? {
              cell,
              kind: 'invalid',
              digit,
              // The proof is a peer already holding the digit, so the player is
              // pointed at the constraint rather than told what to erase.
              reason: t(locale, 'coach.markInvalid', { digit }),
              witness: holdersOf(board, cell, digit),
            }
          : {
              cell,
              kind: 'missing',
              digit,
              // Nothing *proves* a missing mark except the absence of a
              // blocker, so there is no witness cell to spotlight: the
              // evidence is the twenty peers that do not hold the digit.
              reason: t(locale, 'coach.markMissing', { digit }),
              witness: [],
            },
      );
    }
    if (issues.length === before) cleanCells.push(cell);
  }

  return { issues, cleanCells, checkedCells };
}

/** `reviewMarks` for callers holding cells rather than a board and a mark list. */
export const reviewCells = (cells: readonly CoachCell[], locale: Locale): CandidateReview =>
  reviewMarks(
    Board.fromValues(cells.map((c) => c.value)),
    cells.map((c) => c.candidates),
    locale,
  );
