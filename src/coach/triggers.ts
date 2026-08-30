/**
 * Teachable moments (spec §5.5).
 *
 * The coach offers; it never forces. Everything here answers one question —
 * "is now a moment where a nudge would help?" — and answers it as data. What to
 * do with a trigger, whether to surface it at all, and how insistently, is the
 * UI's call.
 *
 * Two properties make that safe to build on.
 *
 * **No clock is read here.** `now` is a parameter. Time-dependent behaviour
 * that calls `Date.now()` internally can only be tested by waiting, and a test
 * that waits is a test that flakes on a loaded runner; passing the instant in
 * makes "stuck for four minutes" an ordinary assertion. Every function in this
 * module is pure.
 *
 * **The solution is used to notice, never to tell.** `contradictionAt` compares
 * an entry against the solution string because there is no other way to catch a
 * wrong digit that has not yet collided with anything — but what comes back is
 * a cell index, and `constraintBreach` turns that into the *constraint the
 * entry breaks*, with the cells that prove it. Neither ever reports the digit
 * the solution expected. That is spec §5.6 and architecture invariant 2: the
 * solution never leaves the engine as an answer.
 */

import type { CellIndex, Digit, Finding } from '../engine/types';
import { Board, peersOf } from '../engine/board';
import { t } from '../i18n';
import type { Locale, Move } from '../state/types';
import type { TeachableTrigger } from './types';
import type { CoachCell } from './format';

/** A cell as the triggers see it: the coach's view plus whether it was given. */
export interface TriggerCell extends CoachCell {
  given: boolean;
}

/**
 * Long enough that it is not a pause for thought, short enough that it lands
 * while the player is still on the same idea. The caller may override it; the
 * default is the one the UI ships with.
 */
export const DEFAULT_STUCK_MS = 120_000;

export interface TriggerInput {
  cells: readonly TriggerCell[];
  /** Wall clock, passed in. This module never reads one itself. */
  now: number;
  /** When the player last changed the board. */
  lastActionAt: number;
  /**
   * The finding the coach would offer. Passed in rather than detected here so
   * the caller decides when to pay for a detector pass — and so a trigger set
   * is a pure function of state.
   */
  finding: Finding | null;
  /** 81-char solution. Read only to spot a wrong entry; never rendered. */
  solution?: string;
  /** The game's move log, oldest first. */
  moves?: readonly Move[];
  stuckMs?: number;
}

const digitAt = (solution: string, cell: CellIndex): Digit | null => {
  const ch = solution[cell];
  const n = Number(ch);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? (n as Digit) : null;
};

/**
 * The cell holding an entry that contradicts the solution, or null.
 *
 * The most recently entered one wins when a move log is available, because that
 * is the one the player still has in mind; without a log it falls back to the
 * lowest index so the answer stays deterministic either way.
 */
export function contradictionAt(
  cells: readonly TriggerCell[],
  solution: string,
  moves: readonly Move[] = [],
): CellIndex | null {
  const wrong = (cell: CellIndex): boolean => {
    const entry = cells[cell];
    if (entry === undefined || entry.given || entry.value === null) return false;
    const expected = digitAt(solution, cell);
    return expected !== null && entry.value !== expected;
  };
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i].kind === 'set' && wrong(moves[i].cell)) return moves[i].cell;
  }
  for (let cell = 0; cell < cells.length; cell++) if (wrong(cell)) return cell;
  return null;
}

export interface ConstraintBreach {
  cell: CellIndex;
  /**
   * The constraint the entry breaks, localized — or null when it breaks none
   * *yet* and the damage is downstream. The dictionary has no key for "this
   * leaves nothing for that cell" and i18n is outside this branch's scope, so
   * that case ships as witnesses without prose rather than as hardcoded
   * English; see the PR body.
   */
  reason: string | null;
  /** Cells that prove it, for spotlighting. */
  witness: CellIndex[];
}

/**
 * Why an entry is wrong, said in terms of the rules rather than the answer.
 *
 * First choice is a peer already holding the same digit — the constraint the
 * player can check for themselves. Failing that, the entry has stranded some
 * empty cell with no candidate left, which is the real violation even though it
 * is a step removed. In neither case does the expected digit appear.
 */
export function constraintBreach(
  cells: readonly TriggerCell[],
  cell: CellIndex,
  locale: Locale,
): ConstraintBreach {
  const board = Board.fromValues(cells.map((c) => c.value));
  const value = board.values[cell];
  const duplicates = value === null ? [] : board.conflictsAt(cell);
  if (duplicates.length > 0) {
    return { cell, reason: t(locale, 'board.conflict'), witness: duplicates };
  }
  const stranded = peersOf(cell).filter(
    (peer) => board.values[peer] === null && board.trueCandidates(peer).size === 0,
  );
  return { cell, reason: null, witness: stranded };
}

/**
 * Marks left behind by a placement: peers of the last placed cell that still
 * offer the digit it took, plus anything still noted under the digit itself.
 *
 * Scoped to the most recent placement on purpose. Every wrong mark on the board
 * is already `reviewMarks`' business; what makes this a *moment* is that the
 * player's own move just invalidated these, so pointing at them teaches the
 * habit rather than grading the notes.
 */
export function staleMarksAfterPlacement(
  cells: readonly TriggerCell[],
  moves: readonly Move[],
): CellIndex[] {
  for (let i = moves.length - 1; i >= 0; i--) {
    const move = moves[i];
    if (move.kind !== 'set' || move.digit === undefined) continue;
    const { cell, digit } = move;
    if (cells[cell]?.value !== digit) return [];
    const stale = peersOf(cell).filter(
      (peer) => cells[peer].value === null && cells[peer].candidates.has(digit),
    );
    if (cells[cell].candidates.size > 0) stale.push(cell);
    return stale.sort((a, b) => a - b);
  }
  return [];
}

/**
 * Every moment worth offering, most urgent first: a wrong entry outranks tidy
 * notes, which outrank a stall. The caller takes as many as it wants to show.
 */
export function teachableTriggers(input: TriggerInput): TeachableTrigger[] {
  const { cells, now, lastActionAt, finding, solution, moves = [] } = input;
  const stuckMs = input.stuckMs ?? DEFAULT_STUCK_MS;
  const triggers: TeachableTrigger[] = [];

  if (solution !== undefined) {
    const cell = contradictionAt(cells, solution, moves);
    if (cell !== null) triggers.push({ kind: 'contradiction', cell });
  }

  const stale = staleMarksAfterPlacement(cells, moves);
  if (stale.length > 0) triggers.push({ kind: 'stale_marks', cells: stale });

  const sinceMs = now - lastActionAt;
  // A stall is only teachable when there is something to teach: offering a
  // nudge on a board no technique cracks would be an empty promise.
  if (finding !== null && sinceMs >= stuckMs) triggers.push({ kind: 'stuck', sinceMs });

  return triggers;
}
