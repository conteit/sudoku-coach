/**
 * The pencil-mark check (R8).
 *
 * The first test in this file is the one that matters: a review leaves the
 * player's marks exactly as it found them. Everything else here describes what
 * the review *says*; that one describes what it is forbidden to do, and it is
 * architecture invariant 1 — the invariant a helpful refactor is most likely to
 * break, because auto-correcting is a one-line change away from reporting.
 */

import { describe, expect, it } from 'vitest';
import { Board, cellName, peersOf } from '../engine/board';
import { EXAMPLES, PUZZLES } from '../engine/techniques/fixtures';
import type { CellIndex, Digit } from '../engine/types';
import { t } from '../i18n';
import type { CoachCell } from './format';
import { reviewCells, reviewMarks } from './candidates';

const cellsOf = (grid: string, marks: Record<number, Digit[]> = {}): CoachCell[] =>
  [...Board.fromString(grid).values].map((value, cell) => ({
    value,
    candidates: new Set<Digit>(marks[cell] ?? []),
  }));

const clone = (cells: readonly CoachCell[]): CoachCell[] =>
  cells.map((c) => ({ value: c.value, candidates: new Set(c.candidates) }));

const firstEmpty = (cells: readonly CoachCell[]): CellIndex =>
  cells.findIndex((c) => c.value === null);

describe('the review never touches the marks it reads', () => {
  it.each(PUZZLES.map((p) => [p.name, p.givens] as const))(
    '%s: marks are deep-equal before and after',
    (_name, givens) => {
      const board = Board.fromString(givens);
      // Deliberately messy notes: every empty cell gets the same five digits,
      // so the review has plenty of both kinds of issue to report.
      const cells = [...board.values].map((value) => ({
        value,
        candidates: value === null ? new Set<Digit>([1, 2, 3, 4, 5]) : new Set<Digit>(),
      }));
      const before = clone(cells);
      const review = reviewCells(cells, 'en');
      expect(review.issues.length).toBeGreaterThan(0);
      expect(cells).toEqual(before);
    },
  );

  it('does not hand back the sets it was given for a caller to edit', () => {
    const cells = cellsOf(EXAMPLES.naked_pair, { [firstEmpty(cellsOf(EXAMPLES.naked_pair))]: [1] });
    const review = reviewCells(cells, 'en');
    // Nothing in a CandidateReview is a live reference to a mark set.
    expect(Object.values(review).some((v) => v instanceof Set)).toBe(false);
  });
});

describe('what the review reports', () => {
  const grid = EXAMPLES.naked_pair;
  const board = Board.fromString(grid);

  it('reports a mark no constraint allows, with the peer that proves it', () => {
    const cell = firstEmpty(cellsOf(grid));
    // Pick a digit some peer already holds: that peer is the whole argument.
    const holder = peersOf(cell).find((p) => board.values[p] !== null)!;
    const digit = board.values[holder]!;
    // Otherwise-perfect notes, plus the one impossible digit.
    const review = reviewMarks(board, markOnly(cell, withTruth(cell, digit)), 'en');
    expect(review.issues).toHaveLength(1);
    expect(review.issues[0]).toMatchObject({ cell, kind: 'invalid', digit });
    expect(review.issues[0].witness).toContain(holder);
    expect(review.issues[0].reason).toBe(t('en', 'coach.markInvalid', { digit }));
  });

  it('reports a candidate the player has not noted', () => {
    const cell = firstEmpty(cellsOf(grid));
    const truth = [...board.trueCandidates(cell)].sort((a, b) => a - b);
    expect(truth.length).toBeGreaterThan(1);
    const review = reviewMarks(board, markOnly(cell, [truth[0]]), 'en');
    expect(review.issues.map((i) => i.digit)).toEqual(truth.slice(1));
    for (const issue of review.issues) {
      expect(issue.kind).toBe('missing');
      expect(issue.witness).toEqual([]);
      expect(issue.reason).toBe(t('en', 'coach.markMissing', { digit: issue.digit }));
    }
  });

  it('calls a cell clean when the notes match the constraints exactly', () => {
    const cell = firstEmpty(cellsOf(grid));
    const truth = [...board.trueCandidates(cell)];
    const review = reviewMarks(board, markOnly(cell, truth), 'en');
    expect(review.issues).toEqual([]);
    expect(review.cleanCells).toEqual([cell]);
    expect(review.checkedCells).toBe(1);
  });

  it('leaves a cell the player has not written in alone', () => {
    const review = reviewMarks(board, board.values.map(() => new Set<Digit>()), 'en');
    expect(review.checkedCells).toBe(0);
    expect(review.issues).toEqual([]);
    expect(review.cleanCells).toEqual([]);
  });

  it('leaves marks under a placed digit to the stale-marks moment', () => {
    const filled = board.values.findIndex((v) => v !== null);
    const review = reviewMarks(board, markOnly(filled, [1, 2, 3]), 'en');
    expect(review.checkedCells).toBe(0);
    expect(review.issues).toEqual([]);
  });

  it('orders issues by cell then digit, so two identical checks read alike', () => {
    const cells = cellsOf(grid);
    const empties = cells.flatMap((c, i) => (c.value === null ? [i] : []));
    const marks = board.values.map(() => new Set<Digit>());
    for (const cell of empties.slice(0, 4)) marks[cell] = new Set<Digit>([9, 1, 5]);
    const review = reviewMarks(board, marks, 'en');
    const keys = review.issues.map((i) => i.cell * 10 + i.digit);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(review.issues).toEqual(reviewMarks(board, marks, 'en').issues);
  });

  it('localizes the reason rather than concatenating English', () => {
    const cell = firstEmpty(cellsOf(grid));
    const holder = peersOf(cell).find((p) => board.values[p] !== null)!;
    const digit = board.values[holder]!;
    const marks = markOnly(cell, withTruth(cell, digit));
    const en = reviewMarks(board, marks, 'en').issues[0].reason;
    const it = reviewMarks(board, marks, 'it').issues[0].reason;
    expect(it).not.toBe(en);
    expect(it).toBe(t('it', 'coach.markInvalid', { digit }));
    // A cell name is a coordinate, not prose: it must not be baked into the
    // reason, or the UI cannot spotlight it in the player's own language.
    expect(it).not.toContain(cellName(cell));
  });

  /** The cell's true candidates plus one extra digit. */
  function withTruth(cell: CellIndex, extra: Digit): Digit[] {
    return [...new Set<Digit>([...board.trueCandidates(cell), extra])];
  }

  function markOnly(cell: CellIndex, digits: readonly Digit[]): ReadonlySet<Digit>[] {
    const marks = board.values.map(() => new Set<Digit>());
    marks[cell] = new Set(digits);
    return marks;
  }
});
