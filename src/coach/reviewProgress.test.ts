import { describe, expect, it } from 'vitest';
import type { Digit } from '../engine/types';
import type { CandidateIssue, CandidateReview } from './types';
import type { CoachCell } from './format';
import { markMask, trackReview, type ReviewSnapshot } from './reviewProgress';

/** 81 empty cells; individual tests fill in only what they are about. */
const emptyCells = (): CoachCell[] =>
  Array.from({ length: 81 }, () => ({ value: null, candidates: new Set<Digit>() }));

const values = (cells: readonly CoachCell[]): (Digit | null)[] => cells.map((c) => c.value);

const issue = (over: Partial<CandidateIssue> = {}): CandidateIssue => ({
  cell: 40,
  kind: 'missing',
  digit: 6,
  reason: 'because',
  witness: [],
  ...over,
});

const report = (issues: CandidateIssue[]): CandidateReview => ({
  issues,
  cleanCells: [],
  checkedCells: 12,
});

const snapshotOf = (cells: readonly CoachCell[], issues: CandidateIssue[]): ReviewSnapshot => ({
  report: report(issues),
  values: values(cells),
  marks: cells.map((c) => markMask(c.candidates)),
});

describe('trackReview', () => {
  it('leaves an untouched report entirely open', () => {
    const cells = emptyCells();
    cells[40] = { value: null, candidates: new Set<Digit>([1]) };
    const progress = trackReview(snapshotOf(cells, [issue()]), cells);

    expect(progress.items.map((i) => i.state)).toEqual(['open']);
    expect(progress.open).toBe(1);
    expect(progress.total).toBe(1);
    expect(progress.checkedCells).toBe(12);
  });

  it('marks a missing note fixed once the player writes it', () => {
    const cells = emptyCells();
    cells[40] = { value: null, candidates: new Set<Digit>([6]) };
    const progress = trackReview(snapshotOf(cells, [issue()]), cells);

    expect(progress.items[0].state).toBe('fixed');
    expect(progress.open).toBe(0);
    // Fixed rows stay on screen: seeing what you have done is the point of
    // showing progress rather than a list that silently shrinks.
    expect(progress.total).toBe(1);
  });

  it('marks an invalid note fixed once the player erases it', () => {
    const cells = emptyCells();
    cells[40] = { value: null, candidates: new Set<Digit>() };
    const bad = issue({ kind: 'invalid', digit: 9 });
    const progress = trackReview(snapshotOf(cells, [bad]), cells);

    expect(progress.items[0].state).toBe('fixed');
  });

  it('drops an issue whose cell has since been filled', () => {
    // `kind: 'invalid'` on purpose: a `missing` issue on this same fixture
    // would also be caught by `neighbourhoodMoved`'s self-value check, which
    // makes the fill-in guard look redundant without actually exercising it.
    // `invalid` revalidates via `trueCandidates`, which is silently empty on
    // a filled cell either way, so only the guard itself stops a stale mark
    // under a placed digit from being reported as fixed.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([9]) };
    const snapshot = snapshotOf(before, [issue({ kind: 'invalid', digit: 9 })]);

    const after = emptyCells();
    after[40] = { value: 3, candidates: new Set<Digit>() };

    expect(trackReview(snapshot, after).items).toEqual([]);
    expect(trackReview(snapshot, after).total).toBe(0);
  });

  it('retires a missing issue once a peer has been filled', () => {
    // The whole point of the snapshot. `missing` means "possible AND no
    // technique refutes it", and a placement can unlock an elimination that
    // makes the advice wrong. The report stops asserting rather than assert
    // something it can no longer prove. Next door is the obvious case; the
    // test below covers the one that is not.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[41] = { value: 5, candidates: new Set<Digit>() }; // r5c6, a peer of r5c5

    expect(trackReview(snapshot, after).items).toEqual([]);
  });

  it('retires a missing issue when a far-away cell has been filled', () => {
    // INVERTED. This case used to assert the opposite, and the opposite was
    // the bug: `missing` means "unrefuted by any technique", and that half of
    // the definition comes from a fixed point over the *whole* board. An
    // x-wing, an xy-wing or a colouring chain concludes from cells nowhere
    // near the target's twenty peers, so a correct placement across the grid
    // can make a noted digit provably impossible while its own neighbourhood
    // is untouched — and `invalid` cannot catch it, because the digit is
    // still a true candidate under basic elimination. The old fixture was 81
    // empty cells, on which no technique can fire, so it never exercised the
    // case it looked like it covered.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[0] = { value: 5, candidates: new Set<Digit>() }; // r1c1 sees nothing of r5c5

    expect(trackReview(snapshot, after).items).toEqual([]);
  });

  it('drops a missing issue whose own cell has been filled under a surviving mark', () => {
    // The filled-cell guard, on its own. A placement does not wipe the notes
    // underneath it — that is exactly why `deadNotes` and the stale-marks
    // eraser exist — so the mark the report asked for is still here, and the
    // credit-first branch runs *before* any retirement check. Without the
    // guard this reports `fixed`: a green tick and the word "fixed" against a
    // pencil mark sitting under a placed digit.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>() };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[40] = { value: 3, candidates: new Set<Digit>([6]) };

    expect(trackReview(snapshot, after).items).toEqual([]);
  });

  it('keeps an invalid issue open while the peer that refutes it still holds the digit', () => {
    // Binds the branch that decides an `invalid` issue is still worth showing.
    // Retiring it unconditionally — the natural mutation — drops every
    // genuinely wrong pencil mark the check found, silently, and no other test
    // in this file has an `invalid` issue that ends up open.
    const cells = emptyCells();
    cells[40] = { value: null, candidates: new Set<Digit>([9]) };
    cells[41] = { value: 9, candidates: new Set<Digit>() }; // r5c6 still holds the 9
    const snapshot = snapshotOf(cells, [issue({ kind: 'invalid', digit: 9 })]);

    const progress = trackReview(snapshot, cells);
    expect(progress.items.map((i) => i.state)).toEqual(['open']);
    expect(progress.open).toBe(1);
  });

  it('credits the fix when the player noted it AND the neighbourhood moved', () => {
    // Order matters: they did the thing that was asked. Retiring it instead
    // would take away credit for work actually done.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[40] = { value: null, candidates: new Set<Digit>([6]) };
    after[41] = { value: 5, candidates: new Set<Digit>() };

    expect(trackReview(snapshot, after).items[0].state).toBe('fixed');
  });

  it('retires an invalid issue once the peer that refuted it is gone', () => {
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([9]) };
    before[41] = { value: 9, candidates: new Set<Digit>() };
    const snapshot = snapshotOf(before, [issue({ kind: 'invalid', digit: 9 })]);

    const after = before.map((c) => ({ ...c }));
    after[41] = { value: null, candidates: new Set<Digit>() };

    // Still noted, but now legitimately: nothing sees a 9 any more.
    expect(trackReview(snapshot, after).items).toEqual([]);
  });

  it('keeps the reported order', () => {
    const cells = emptyCells();
    cells[10] = { value: null, candidates: new Set<Digit>([1]) };
    cells[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(cells, [issue({ cell: 10 }), issue({ cell: 40 })]);

    expect(trackReview(snapshot, cells).items.map((i) => i.issue.cell)).toEqual([10, 40]);
  });

  it('goes stale when the player edits a note, with no value on the board moving', () => {
    // A clean report has no issues to age, so this flag is the only thing that
    // can ever expire it — and its claim is about the *notes*, which is why
    // the snapshot carries the marks and not just the values.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, []);

    const after = before.map((c) => ({ ...c }));
    after[40] = { value: null, candidates: new Set<Digit>([1, 4]) };

    expect(trackReview(snapshot, before).stale).toBe(false);
    expect(trackReview(snapshot, after).stale).toBe(true);
  });

  it('goes stale on a placement into a cell that never held a note', () => {
    // The other half, and not reachable through the marks: a cell with no
    // candidates before or after has an identical mask either way.
    const before = emptyCells();
    const snapshot = snapshotOf(before, []);

    const after = before.map((c) => ({ ...c }));
    after[0] = { value: 5, candidates: new Set<Digit>() };

    expect(trackReview(snapshot, after).stale).toBe(true);
  });

  it('handles a report with no issues at all', () => {
    const cells = emptyCells();
    const progress = trackReview(snapshotOf(cells, []), cells);

    expect(progress.items).toEqual([]);
    expect(progress.open).toBe(0);
    expect(progress.total).toBe(0);
  });

  it('distinguishes "nothing was ever wrong" from "everything wrong has retired"', () => {
    // total === 0 must not collapse two different worlds into one number: a
    // clean report, and a report whose every issue moved on without being
    // fixed. `reported` is what tells them apart, since the report is the
    // only thing that knows how many issues it was born with.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[41] = { value: 5, candidates: new Set<Digit>() }; // retires the issue, not a fix

    const progress = trackReview(snapshot, after);
    expect(progress.total).toBe(0);
    expect(progress.reported).toBeGreaterThan(0);
  });
});
