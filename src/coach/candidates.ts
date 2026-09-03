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
import { CandidateGrid } from '../engine/solver';
import { CATALOG } from '../engine/techniques';
import { t } from '../i18n';
import type { Locale } from '../state/types';
import type { CandidateIssue, CandidateReview } from './types';
import type { CoachCell } from './format';

/**
 * Every candidate the technique catalog can prove impossible, as `cell:digit`.
 *
 * The check used to read `trueCandidates` alone, which is *basic* elimination
 * — a peer already holding the digit — and nothing else. So a player who
 * worked a naked pair and removed its two digits from the rest of the column
 * was told both were missing: the pattern proves the elimination, and the
 * check could not see patterns. It punished exactly the play the app exists
 * to teach.
 *
 * **Eliminations only, never placements.** Findings that place a digit —
 * naked and hidden single — are skipped rather than applied, and the reason
 * is the thesis rather than tidiness: applying them would narrow other cells
 * by way of an answer the player has not been given, and a cell narrowed to
 * one candidate is one "missing" report away from being handed its digit.
 * Every elimination applied here is sound by the R6 property test, so this
 * can only ever make the check quieter, never wrong.
 *
 * It runs to a fixed point because one elimination unlocks the next; the step
 * cap is the same tripwire `solveLogically` uses — 810 is one per candidate
 * plus one per cell, so reaching it means a detector is reporting something
 * it cannot prove.
 */
const MAX_STEPS = 810;

export function eliminableCandidates(board: BoardView): ReadonlySet<string> {
  const grid = CandidateGrid.fromBoard(board);
  const proven = new Set<string>();

  for (let pass = 0; pass < MAX_STEPS; pass++) {
    let progressed = false;
    // Every detector gets a turn each pass rather than the catalog
    // restarting the moment one fires. Same fixed point either way —
    // eliminations only remove candidates, so a different order cannot prove
    // less — and measured at parity (2-7ms per board on the corpus either
    // way); this shape is simply the one that says "run them all, then look
    // again". The cost that matters is the detector sweep itself, which
    // neither shape avoids.
    for (const detector of CATALOG) {
      const finding = detector.detect(grid);
      if (finding === null || finding.eliminations.length === 0) continue;
      for (const { cell, digit } of finding.eliminations) {
        if (!grid.eliminate(cell, digit)) continue;
        proven.add(`${cell}:${digit}`);
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  return proven;
}

/** Whether any technique proves this one digit impossible in this one cell. */
export const eliminableByTechnique = (
  board: BoardView,
  cell: CellIndex,
  digit: Digit,
): boolean => eliminableCandidates(board).has(`${cell}:${digit}`);

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
  // Computed once for the whole review rather than per cell: the sweep is the
  // expensive part of a check that is already a deliberate, occasional press.
  const eliminable = eliminableCandidates(board);

  for (let cell = 0; cell < marks.length; cell++) {
    const noted = marks[cell];
    if (board.values[cell] !== null || noted.size === 0) continue;
    checkedCells++;

    const truth = board.trueCandidates(cell);
    const before = issues.length;
    for (const digit of DIGITS) {
      if (noted.has(digit) === truth.has(digit)) continue;
      // A digit the player has removed, which a technique proves impossible,
      // is not missing — it is the elimination they came here to learn,
      // already made. Silence rather than praise: saying "good, the pair
      // rules that out" would name a pattern the coach has not been asked
      // about, which is the ladder's business and not the checker's.
      if (!noted.has(digit) && eliminable.has(`${cell}:${digit}`)) continue;
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
