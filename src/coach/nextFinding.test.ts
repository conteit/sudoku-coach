/**
 * The coach kept pointing at work the player had already done.
 *
 * From Paolo's diagnostics report on game 6822a4b2 (2026-09-13): the coach
 * offered a naked pair whose two eliminations were already gone from his
 * notes, and behind it four more findings in the same state. The board's real
 * next step — an x-wing on 6 — was sixth in line.
 *
 * The values and marks below are that report, verbatim.
 */

import { describe, expect, it } from 'vitest';
import { Board, parseGrid } from '../engine/board';
import { CATALOG } from '../engine/techniques';
import type { CellIndex, Digit } from '../engine/types';
import { createCoach, findingIsApplied, findingIsSpent, type CoachCell } from './coach';

const VALUES =
  '....1.32.73..624..12.83..5.85.32...4613.4.8922...81.35.8..73.4...1.98.73372.5....';

const NOTES = `
r1c1: 4,5,9    r1c2: 4,6,9    r1c3: 4,5,6,8,9  r1c4: 4,5,7,9  r1c6: 4,5,7,9
r1c9: 6,7,8,9  r2c3: 5,8,9    r2c4: 5,9        r2c8: 1,8      r2c9: 1,8,9
r3c3: 4,6,9    r3c6: 4,7,9    r3c7: 6,9        r3c9: 6,7,9    r4c3: 7,9
r4c6: 6,9      r4c7: 1,6,7    r4c8: 1,6        r5c4: 5,7      r5c6: 5,7
r6c2: 4,9      r6c3: 4,7,9    r6c4: 6,9        r6c7: 6,7      r7c1: 5,9
r7c3: 5,6,9    r7c4: 1,2,6    r7c7: 2,5        r7c9: 1,6,9    r8c1: 4,5
r8c2: 4,6      r8c4: 2,4,6    r8c7: 2,5        r9c4: 1,4,6    r9c6: 4,6
r9c7: 1,6,9    r9c8: 1,6,8    r9c9: 1,6,8,9
`;

function board(): CoachCell[] {
  const values = parseGrid(VALUES);
  const cells: CoachCell[] = values.map((value) => ({ value, candidates: new Set<Digit>() }));
  for (const entry of NOTES.trim().split(/\s{2,}|\n/)) {
    const match = /^r(\d)c(\d): ([\d,]+)$/.exec(entry.trim());
    if (match === null) continue;
    const index = ((Number(match[1]) - 1) * 9 + Number(match[2]) - 1) as CellIndex;
    cells[index].candidates = new Set(match[3].split(',').map(Number) as Digit[]);
  }
  return cells;
}

const coachFor = (cells: CoachCell[]) => createCoach({ cells, locale: 'en' });

describe("Paolo's board: findings the player has already worked", () => {
  it('has a naked pair whose eliminations the notes no longer contain', () => {
    const cells = board();
    // The engine sees a naked pair {5,7} at r5c4/r5c6 in box 5, ruling 7 out
    // of r4c6 and r6c4 — both of which he had already erased.
    expect(cells[3 * 9 + 5].candidates.has(7)).toBe(false); // r4c6
    expect(cells[5 * 9 + 3].candidates.has(7)).toBe(false); // r6c4
  });

  it('still has genuine work on it: the x-wing on 6 is untouched', () => {
    const cells = board();
    for (const [r, c] of [
      [3, 6],
      [8, 3],
      [8, 6],
      [8, 8],
    ]) {
      expect(cells[r * 9 + c].candidates.has(6)).toBe(true);
    }
  });

  it('points at the step that still changes something, not the one already done', () => {
    const cells = board();
    const finding = coachFor(cells).nextFinding();

    expect(finding).not.toBeNull();
    expect(findingIsApplied(finding!, cells)).toBe(false);
    // Everything cheaper than the x-wing is spent on this board.
    expect(finding!.technique).toBe('x_wing');
  });
});

describe('the two ways this could have gone wrong', () => {
  it('keeps advising a player who writes no notes at all', () => {
    // The dangerous reading of "already done": an empty candidate set does
    // not contain the digit either. Take that as spent and every finding on
    // every unmarked board is spent, and the coach goes quiet for everyone
    // who plays without pencil marks.
    const bare = board().map((cell) => ({ value: cell.value, candidates: new Set<Digit>() }));
    const finding = coachFor(bare).nextFinding();

    expect(finding).not.toBeNull();
    // Asserted on the predicate, not on which finding comes back: the
    // fallback returns the first finding whether it is judged spent or not,
    // so "naked pair, as before" is true either way and pins nothing.
    expect(findingIsSpent(finding!, bare)).toBe(false);
    expect(finding!.technique).toBe('naked_pair');
  });

  it('treats a cell the player has since filled as settled, not as work', () => {
    const cells = board();
    const finding = coachFor(cells).nextFinding()!;
    const { cell, digit } = finding.eliminations[0];
    // Filling the target makes that elimination moot rather than outstanding.
    cells[cell] = { value: (digit === 9 ? 1 : 9) as Digit, candidates: new Set<Digit>() };

    const next = coachFor(cells).nextFinding();
    expect(next === null || next.technique !== finding.technique).toBe(true);
  });

  it('declares exhaustion when every finding left is spent, rather than repeating one', () => {
    // The bug's last hiding place. A board worked to a standstill must not be
    // handed back one of the eliminations the player has already made — that
    // is the original complaint, arriving one step later. Nothing is the
    // honest answer, and the panel already has words for it.
    const cells = board();
    // Erasing one finding's eliminations is not enough — the next technique
    // simply becomes the live one, and the test never reaches the state it
    // claims to be about. Every detector's, in one pass: the values do not
    // change, so what each one sees does not either.
    const view = Board.fromValues(cells.map((cell) => cell.value));
    for (const detector of CATALOG) {
      const found = detector.detect(view);
      if (found === null) continue;
      for (const { cell, digit } of found.eliminations) {
        const kept = new Set(cells[cell].candidates);
        kept.delete(digit);
        cells[cell] = { ...cells[cell], candidates: kept };
      }
    }
    const remaining = CATALOG.map((detector) => detector.detect(view)).filter(
      (found) => found !== null,
    );
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.every((found) => findingIsSpent(found!, cells))).toBe(true);

    expect(coachFor(cells).nextFinding()).toBeNull();
  });

  it('does not go quiet while any finding still has work in it', () => {
    // The other side of the same rule: exhaustion has to mean exhausted. One
    // spent finding must never take a live one down with it.
    const cells = board();
    const live = coachFor(cells).nextFinding();
    expect(live).not.toBeNull();
    expect(findingIsSpent(live!, cells)).toBe(false);
  });
});
