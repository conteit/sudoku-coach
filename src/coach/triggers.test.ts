/**
 * Teachable moments.
 *
 * Every assertion here is about deterministic work, never about elapsed time:
 * `now` is a parameter, so "stuck for three minutes" is an ordinary equality
 * check rather than a sleep. The other thing under test is a prohibition — the
 * contradiction path may read the solution to notice a wrong entry, but nothing
 * it returns may carry the digit the solution expected.
 */

import { describe, expect, it } from 'vitest';
import { Board, peersOf } from '../engine/board';
import { firstFinding } from '../engine/solver';
import { PUZZLES } from '../engine/techniques/fixtures';
import type { CellIndex, Digit } from '../engine/types';
import { t } from '../i18n';
import type { Move } from '../state/types';
import {
  constraintBreach,
  contradictionAt,
  DEFAULT_STUCK_MS,
  staleMarksAfterPlacement,
  teachableTriggers,
  type TriggerCell,
} from './triggers';

const PUZZLE = PUZZLES[0];

const cellsOf = (grid: string): TriggerCell[] =>
  [...Board.fromString(grid).values].map((value) => ({
    value,
    given: value !== null,
    candidates: new Set<Digit>(),
  }));

const withValue = (cells: readonly TriggerCell[], cell: CellIndex, value: Digit): TriggerCell[] =>
  cells.map((c, i) => (i === cell ? { ...c, value, given: false } : c));

const withMarks = (
  cells: readonly TriggerCell[],
  cell: CellIndex,
  digits: readonly Digit[],
): TriggerCell[] =>
  cells.map((c, i) => (i === cell ? { ...c, candidates: new Set(digits) } : c));

const setMove = (cell: CellIndex, digit: Digit, at = 1): Move => ({
  kind: 'set',
  cell,
  digit,
  prev: { value: null, candidates: [] },
  at,
});

const BASE = cellsOf(PUZZLE.givens);
const EMPTY_CELL = BASE.findIndex((c) => c.value === null);
const SOLVED_DIGIT = Number(PUZZLE.solution[EMPTY_CELL]) as Digit;
const FINDING = firstFinding(Board.fromString(PUZZLE.givens));

describe('stuck', () => {
  const base = {
    cells: BASE,
    lastActionAt: 0,
    finding: FINDING,
    stuckMs: 60_000,
  };

  it('stays quiet before the threshold', () => {
    expect(teachableTriggers({ ...base, now: 59_999 })).toEqual([]);
  });

  it('offers once the player has been still long enough', () => {
    expect(teachableTriggers({ ...base, now: 60_000 })).toEqual([
      { kind: 'stuck', sinceMs: 60_000 },
    ]);
  });

  it('says nothing when no technique cracks the board', () => {
    expect(teachableTriggers({ ...base, now: 600_000, finding: null })).toEqual([]);
  });

  it('has a default threshold rather than firing immediately', () => {
    expect(DEFAULT_STUCK_MS).toBeGreaterThan(0);
    expect(
      teachableTriggers({ cells: BASE, now: DEFAULT_STUCK_MS - 1, lastActionAt: 0, finding: FINDING }),
    ).toEqual([]);
    expect(
      teachableTriggers({ cells: BASE, now: DEFAULT_STUCK_MS, lastActionAt: 0, finding: FINDING }),
    ).toHaveLength(1);
  });

  it('is a pure function of the clock value it is handed', () => {
    const call = () => teachableTriggers({ ...base, now: 120_000 });
    expect(call()).toEqual(call());
  });
});

describe('contradiction', () => {
  /** A wrong digit that no peer already holds, so nothing collides yet. */
  const quietlyWrong = (): Digit => {
    const board = Board.fromString(PUZZLE.givens);
    const candidate = [...board.trueCandidates(EMPTY_CELL)].find((d) => d !== SOLVED_DIGIT);
    expect(candidate).toBeDefined();
    return candidate!;
  };

  it('notices an entry the solution disagrees with', () => {
    const cells = withValue(BASE, EMPTY_CELL, quietlyWrong());
    expect(contradictionAt(cells, PUZZLE.solution)).toBe(EMPTY_CELL);
  });

  it('says nothing about a correct entry, or about the givens', () => {
    expect(contradictionAt(withValue(BASE, EMPTY_CELL, SOLVED_DIGIT), PUZZLE.solution)).toBeNull();
    expect(contradictionAt(BASE, PUZZLE.solution)).toBeNull();
  });

  it('prefers the entry the player made most recently', () => {
    const first = EMPTY_CELL;
    const second = BASE.findIndex((c, i) => c.value === null && i > first);
    const wrongSecond = ((Number(PUZZLE.solution[second]) % 9) + 1) as Digit;
    const cells = withValue(withValue(BASE, first, quietlyWrong()), second, wrongSecond);
    const moves = [setMove(first, quietlyWrong(), 1), setMove(second, wrongSecond, 2)];
    expect(contradictionAt(cells, PUZZLE.solution, moves)).toBe(second);
    // Without a log it still answers, deterministically, in board order.
    expect(contradictionAt(cells, PUZZLE.solution)).toBe(first);
  });

  it('is offered ahead of the other moments', () => {
    const cells = withValue(BASE, EMPTY_CELL, quietlyWrong());
    const triggers = teachableTriggers({
      cells,
      now: 10 ** 6,
      lastActionAt: 0,
      finding: FINDING,
      solution: PUZZLE.solution,
    });
    expect(triggers[0]).toEqual({ kind: 'contradiction', cell: EMPTY_CELL });
    expect(triggers.map((x) => x.kind)).toContain('stuck');
  });

  it('is skipped entirely when no solution is supplied', () => {
    const cells = withValue(BASE, EMPTY_CELL, quietlyWrong());
    const triggers = teachableTriggers({ cells, now: 0, lastActionAt: 0, finding: FINDING });
    expect(triggers.map((x) => x.kind)).not.toContain('contradiction');
  });
});

describe('the breach is reported, never the answer', () => {
  const duplicated = (): { cells: TriggerCell[]; digit: Digit; holder: CellIndex } => {
    const board = Board.fromString(PUZZLE.givens);
    const holder = peersOf(EMPTY_CELL).find((p) => board.values[p] !== null)!;
    const digit = board.values[holder]!;
    return { cells: withValue(BASE, EMPTY_CELL, digit), digit, holder };
  };

  it('names the constraint and the cells that prove it', () => {
    const { cells, holder } = duplicated();
    const breach = constraintBreach(cells, EMPTY_CELL, 'en');
    expect(breach.reason).toBe(t('en', 'board.conflict'));
    expect(breach.witness).toContain(holder);
  });

  it('localizes that constraint', () => {
    const { cells } = duplicated();
    expect(constraintBreach(cells, EMPTY_CELL, 'it').reason).toBe(t('it', 'board.conflict'));
    expect(constraintBreach(cells, EMPTY_CELL, 'it').reason).not.toBe(t('en', 'board.conflict'));
  });

  it('never mentions the digit the solution expected', () => {
    for (const locale of ['en', 'it'] as const) {
      const cells = withValue(BASE, EMPTY_CELL, quietlyWrongDigit());
      const breach = constraintBreach(cells, EMPTY_CELL, locale);
      expect(breach.reason ?? '').not.toContain(String(SOLVED_DIGIT));
      expect(breach.witness).not.toContain(EMPTY_CELL);
    }
  });

  it('falls back to the cells the entry stranded when nothing collides yet', () => {
    const cells = withValue(BASE, EMPTY_CELL, quietlyWrongDigit());
    const breach = constraintBreach(cells, EMPTY_CELL, 'en');
    // No peer holds the digit and nothing has been stranded: the entry is
    // wrong, but no rule can see it yet, and saying so would mean reading the
    // solution.
    expect(breach.reason).toBeNull();
    expect(breach.cell).toBe(EMPTY_CELL);
  });

  function quietlyWrongDigit(): Digit {
    const board = Board.fromString(PUZZLE.givens);
    return [...board.trueCandidates(EMPTY_CELL)].find((d) => d !== SOLVED_DIGIT)!;
  }
});

describe('stale marks after a placement', () => {
  const peer = peersOf(EMPTY_CELL).find(
    (p) => BASE[p].value === null && p !== EMPTY_CELL,
  ) as CellIndex;

  it('finds peers still offering the digit the player just placed', () => {
    const placed = withMarks(withValue(BASE, EMPTY_CELL, SOLVED_DIGIT), peer, [SOLVED_DIGIT]);
    expect(staleMarksAfterPlacement(placed, [setMove(EMPTY_CELL, SOLVED_DIGIT)])).toEqual([peer]);
  });

  it('includes marks left under the placed digit itself', () => {
    const placed = withMarks(withValue(BASE, EMPTY_CELL, SOLVED_DIGIT), EMPTY_CELL, [1, 2]);
    expect(staleMarksAfterPlacement(placed, [setMove(EMPTY_CELL, SOLVED_DIGIT)])).toContain(
      EMPTY_CELL,
    );
  });

  it('says nothing when the placement has been undone', () => {
    expect(staleMarksAfterPlacement(BASE, [setMove(EMPTY_CELL, SOLVED_DIGIT)])).toEqual([]);
  });

  it('says nothing without a placement to react to', () => {
    expect(staleMarksAfterPlacement(BASE, [])).toEqual([]);
  });

  it('reacts to the latest placement, not the first', () => {
    const other = peersOf(peer).find((p) => BASE[p].value === null && p !== EMPTY_CELL)!;
    const digit = Number(PUZZLE.solution[peer]) as Digit;
    const cells = withMarks(
      withValue(withValue(BASE, EMPTY_CELL, SOLVED_DIGIT), peer, digit),
      other,
      [digit],
    );
    const moves = [setMove(EMPTY_CELL, SOLVED_DIGIT, 1), setMove(peer, digit, 2)];
    expect(staleMarksAfterPlacement(cells, moves)).toEqual([other]);
  });

  it('is surfaced as a trigger, sorted, ahead of a stall', () => {
    const cells = withMarks(withValue(BASE, EMPTY_CELL, SOLVED_DIGIT), peer, [SOLVED_DIGIT]);
    const triggers = teachableTriggers({
      cells,
      now: 10 ** 6,
      lastActionAt: 0,
      finding: FINDING,
      moves: [setMove(EMPTY_CELL, SOLVED_DIGIT)],
    });
    expect(triggers.map((x) => x.kind)).toEqual(['stale_marks', 'stuck']);
  });
});

describe('a breach the rules can only see downstream', () => {
  /**
   * The solution with two cells of one row emptied, and the second cell's digit
   * written into the first. Nothing duplicates — so there is no constraint to
   * quote — but the second cell now has no digit left it can take.
   */
  /**
   * An entry that duplicates nothing and still breaks the rules: it takes the
   * last digit some empty peer could have held. Searched for on the fixture
   * rather than hand-written, so it stays a real board.
   */
  function stranding(): { cells: TriggerCell[]; cell: CellIndex; stranded: CellIndex } {
    const board = Board.fromString(PUZZLE.givens);
    for (let cell = 0; cell < 81; cell++) {
      if (board.values[cell] !== null) continue;
      for (const digit of board.trueCandidates(cell as CellIndex)) {
        const cells = withValue(BASE, cell as CellIndex, digit);
        const after = Board.fromValues(cells.map((c) => c.value));
        const stranded = peersOf(cell as CellIndex).find(
          (peer) => after.values[peer] === null && after.trueCandidates(peer).size === 0,
        );
        if (stranded !== undefined) return { cells, cell: cell as CellIndex, stranded };
      }
    }
    throw new Error('no stranding entry on this puzzle');
  }

  it('names the damage rather than falling silent', () => {
    const { cells, cell, stranded } = stranding();
    const breach = constraintBreach(cells, cell, 'en');

    expect(breach.reason).toBe(t('en', 'board.strandedCell'));
    expect(breach.witness).toContain(stranded);
  });

  it('says it in the player’s language', () => {
    const { cells, cell } = stranding();

    expect(constraintBreach(cells, cell, 'it').reason).toBe(t('it', 'board.strandedCell'));
  });

  it('still names no digit', () => {
    const { cells, cell } = stranding();

    for (const locale of ['en', 'it'] as const) {
      expect(constraintBreach(cells, cell, locale).reason).not.toMatch(/[1-9]/);
    }
  });
});
