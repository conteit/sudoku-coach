/**
 * A note-check report, aged against the board rather than re-run.
 *
 * A report is a snapshot, and the player immediately starts changing the thing
 * it describes. Re-running it on every change is the honest answer and it is
 * also the most expensive computation in the app — `reviewMarks` runs the
 * whole technique catalog to a fixed point. So the report is produced once and
 * aged here, which costs one lookup per issue.
 *
 * **Nothing is ever added.** Every row on screen was in the report the player
 * asked for; a new issue requires a new check, which requires them to ask
 * again. That is the guarantee — not that the list shrinks monotonically over
 * time, which is false: this is a pure function of the live board, so an undo
 * restores a retired issue and un-noting a digit moves a row from `fixed` back
 * to `open`. Both are safe, because a restored board genuinely restores the
 * report's proof.
 *
 * **`missing` is the one that needs the snapshot.** It does not mean "this
 * digit is possible" — it means possible *and* unrefuted by any technique, and
 * that second half came from `eliminableCandidates`, a fixed point over the
 * **whole board**. A placement can unlock a new elimination, at which point
 * cheap revalidation would keep telling the player to note a digit that is now
 * provably impossible; they would write it, and nothing downstream would catch
 * it, because `invalid` only sees basic elimination.
 *
 * So a `missing` issue retires as soon as **any** cell on the board changes
 * value. A neighbourhood check would be the intuitive rule and it is the wrong
 * one: `xWing`, `swordfish`, `xyWing`, `simpleColoring` and `remotePairs` all
 * draw their conclusions from cells far outside the target's twenty peers, so a
 * correct placement across the grid can refute a mark whose own neighbourhood
 * is byte-identical to the snapshot. The price is that a report now survives
 * only *note* edits — one placement retires every `missing` issue in it — and
 * that is the case this was built for: a player working through their marks.
 * Erring the other way advises a mark the catalog can disprove.
 *
 * `invalid` rests on basic elimination alone — a peer holding the digit — so
 * revalidating it against the live board is exact and needs no snapshot.
 */

import { Board } from '../engine/board';
import type { Digit } from '../engine/types';
import type { CandidateIssue, CandidateReview } from './types';
import type { CoachCell } from './format';

export type IssueState = 'open' | 'fixed';

export interface TrackedIssue {
  issue: CandidateIssue;
  state: IssueState;
}

/**
 * The player's marks in one cell as a nine-bit set — digit `d` is bit `d - 1`.
 *
 * Comparing two of these is one integer comparison, which is what makes it
 * affordable to ask "have the notes moved?" about all 81 cells on every board
 * change. A `Set` per cell would answer the same question and allocate 81
 * objects to do it.
 */
export const markMask = (candidates: ReadonlySet<Digit>): number => {
  let mask = 0;
  for (const digit of candidates) mask |= 1 << (digit - 1);
  return mask;
};

/** A report plus the board it was run against. */
export interface ReviewSnapshot {
  report: CandidateReview;
  values: readonly (Digit | null)[];
  /**
   * The marks as they stood when the check ran, one `markMask` per cell.
   *
   * A report that found nothing wrong has no issues to age, so nothing about
   * it expires from the inside — and its claim is *about the notes*, so the
   * values alone cannot see the edit that falsifies it.
   */
  marks: readonly number[];
}

export interface ReviewProgress {
  /** The issues still worth showing, in the order they were reported. */
  items: TrackedIssue[];
  open: number;
  total: number;
  /** Carried through from the report, so the panel needs no second prop. */
  checkedCells: number;
  /**
   * How many issues the report was born with, before any of them retired.
   *
   * `total` reaches zero two different ways: the report found nothing wrong,
   * or every issue it found has since retired because the board moved. Those are not the same claim — the first is "your notes are
   * right," the second is "we can no longer tell" — and this app never
   * states what it cannot prove. Only the report itself, not the aged
   * result, knows which world `total === 0` came from, so that count is
   * carried through here rather than reconstructed later.
   */
  reported: number;
  /**
   * The board is not the one the check ran on any more.
   *
   * A report with issues ages through them: each one retires or is credited
   * as the player works. A clean report has nothing to age, and would go on
   * saying "your notes are exactly right" over a grid it never saw. This is
   * what lets the panel stop asserting it.
   */
  stale: boolean;
}

export function trackReview(
  snapshot: ReviewSnapshot,
  cells: readonly CoachCell[],
): ReviewProgress {
  const board = Board.fromValues(cells.map((c) => c.value));
  const items: TrackedIssue[] = [];

  // Whole board, not a neighbourhood: see the header. One pass, and the marks
  // half is skipped entirely once a placement has already settled it.
  const boardMoved = cells.some((cell, i) => cell.value !== snapshot.values[i]);
  const stale =
    boardMoved || cells.some((cell, i) => markMask(cell.candidates) !== snapshot.marks[i]);

  for (const issue of snapshot.report.issues) {
    const cell = cells[issue.cell];
    // A settled cell has no pencil marks worth arguing about, whoever settled
    // it and whether or not they took the report's advice on the way.
    if (cell === undefined || cell.value !== null) continue;

    const noted = cell.candidates.has(issue.digit);
    // Credit first: the player did the thing that was asked, and a board that
    // moved in the same breath must not take that away.
    const fixed = issue.kind === 'missing' ? noted : !noted;
    if (fixed) {
      items.push({ issue, state: 'fixed' });
      continue;
    }

    if (issue.kind === 'missing') {
      if (boardMoved) continue;
    } else if (board.trueCandidates(issue.cell).has(issue.digit)) {
      // Nothing holds the digit any more, so the mark the report called
      // invalid has become a perfectly good one.
      continue;
    }

    items.push({ issue, state: 'open' });
  }

  return {
    items,
    open: items.reduce((n, item) => n + (item.state === 'open' ? 1 : 0), 0),
    total: items.length,
    checkedCells: snapshot.report.checkedCells,
    reported: snapshot.report.issues.length,
    stale,
  };
}
