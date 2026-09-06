/**
 * A note-check report, aged against the board rather than re-run.
 *
 * A report is a snapshot, and the player immediately starts changing the thing
 * it describes. Re-running it on every change is the honest answer and it is
 * also the most expensive computation in the app — `reviewMarks` runs the
 * whole technique catalog to a fixed point. So the report is produced once and
 * aged here, which costs one lookup per issue.
 *
 * **The list can only ever shrink.** Nothing is added: a new issue requires a
 * new check, which requires the player to ask. That is what keeps this from
 * becoming a report nobody requested, and it is why an issue can only move
 * from `open` to `fixed`, or leave the list entirely.
 *
 * **`missing` is the one that needs the snapshot.** It does not mean "this
 * digit is possible" — it means possible *and* unrefuted by any technique, and
 * that second half came from the fixed point. A placement can unlock a new
 * elimination, at which point cheap revalidation would keep telling the player
 * to note a digit that is now provably impossible; they would write it, and
 * nothing downstream would catch it, because `invalid` only sees basic
 * elimination. So a `missing` issue retires as soon as its cell or any of its
 * peers changes value: past that point the report says nothing rather than
 * something it can no longer prove.
 *
 * `invalid` rests on basic elimination alone — a peer holding the digit — so
 * revalidating it against the live board is exact and needs no snapshot.
 */

import { Board, peersOf } from '../engine/board';
import type { Digit } from '../engine/types';
import type { CandidateIssue, CandidateReview } from './types';
import type { CoachCell } from './format';

export type IssueState = 'open' | 'fixed';

export interface TrackedIssue {
  issue: CandidateIssue;
  state: IssueState;
}

/** A report plus the board it was run against. */
export interface ReviewSnapshot {
  report: CandidateReview;
  values: readonly (Digit | null)[];
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
   * or every issue it found has since retired because the neighbourhood
   * moved. Those are not the same claim — the first is "your notes are
   * right," the second is "we can no longer tell" — and this app never
   * states what it cannot prove. Only the report itself, not the aged
   * result, knows which world `total === 0` came from, so that count is
   * carried through here rather than reconstructed later.
   */
  reported: number;
}

/** True when this cell, or anything that constrains it, holds a different digit now. */
const neighbourhoodMoved = (
  snapshot: ReviewSnapshot,
  cells: readonly CoachCell[],
  cell: number,
): boolean =>
  cells[cell].value !== snapshot.values[cell] ||
  peersOf(cell).some((peer) => cells[peer].value !== snapshot.values[peer]);

export function trackReview(
  snapshot: ReviewSnapshot,
  cells: readonly CoachCell[],
): ReviewProgress {
  const board = Board.fromValues(cells.map((c) => c.value));
  const items: TrackedIssue[] = [];

  for (const issue of snapshot.report.issues) {
    const cell = cells[issue.cell];
    // A settled cell has no pencil marks worth arguing about, whoever settled
    // it and whether or not they took the report's advice on the way.
    if (cell === undefined || cell.value !== null) continue;

    const noted = cell.candidates.has(issue.digit);
    // Credit first: the player did the thing that was asked, and a
    // neighbourhood that moved in the same breath must not take that away.
    const fixed = issue.kind === 'missing' ? noted : !noted;
    if (fixed) {
      items.push({ issue, state: 'fixed' });
      continue;
    }

    if (issue.kind === 'missing') {
      if (neighbourhoodMoved(snapshot, cells, issue.cell)) continue;
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
  };
}
