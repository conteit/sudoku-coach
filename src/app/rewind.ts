/**
 * Recovering from a board that cannot be finished.
 *
 * Pure, for `greenHighlight.ts`'s reason: the interesting behaviour here is a
 * *transition*, and a transition asserted through a rendered component is
 * asserted through three other things that can also be wrong.
 *
 * The machine has three states and they are not symmetrical, deliberately:
 *
 * - `off`     nothing to recover from.
 * - `active`  the board is unfinishable and the wrong digit is still on it.
 * - `done`    the wrong digit is gone; the trail is still worth reading.
 *
 * It arms on a dead end and disarms on the absence of a contradiction, which
 * are different conditions on purpose. A dead end implies a contradiction, so
 * the two can never fight: while the board is still stuck, the disarming test
 * is false by construction. And it deliberately does NOT arm on a
 * contradiction alone — that is the nudge's job, and a board the player can
 * still play is not a board in recovery.
 */

import type { CellIndex, Digit } from '../engine/types';
import type { Move } from '../state/types';

export type RewindPhase = 'off' | 'active' | 'done';

export interface RewindInput {
  /** Some empty cell has no digit left to take (`deadEndCells`). */
  deadEnd: boolean;
  /** An entry still contradicts the solution (`contradictionAt`). */
  contradicted: boolean;
  /** Undone moves remain restorable — which is the trail's whole lifetime. */
  canRedo: boolean;
}

export function nextRewindPhase(phase: RewindPhase, input: RewindInput): RewindPhase {
  if (input.deadEnd) return 'active';
  if (input.contradicted) return phase === 'off' ? 'off' : 'active';
  if (phase === 'active') return 'done';
  if (phase === 'done' && !input.canRedo) return 'off';
  return phase;
}

export type RewindLabel = 'placed' | 'cleared' | 'noted' | 'unnoted';

export interface RewindStep {
  cell: CellIndex;
  /** The digit the move was about, or null for one that cleared a cell. */
  digit: Digit | null;
  label: RewindLabel;
}

/**
 * How many undone moves the trail shows. A rewind out of a deep mistake can
 * run to dozens of moves, and a list that long is scrolled past rather than
 * read — as well as being unbounded growth inside a panel that has to stay
 * inside its own box (invariant 9).
 */
export const MAX_TRAIL = 12;

const LABELS: Record<Move['kind'], RewindLabel> = {
  set: 'placed',
  clear: 'cleared',
  addCandidate: 'noted',
  fillCandidates: 'noted',
  removeCandidate: 'unnoted',
  clearCandidates: 'unnoted',
};

/**
 * The undone moves, newest first, capped.
 *
 * `redoStack` is chronological and is already exactly this record — undo
 * pushes onto it — so nothing new has to be stored to know what a rewind
 * walked back through. Reversed because the player's last step back is the
 * one they are still thinking about.
 */
export function rewindTrail(redoStack: readonly Move[]): RewindStep[] {
  const out: RewindStep[] = [];
  for (let i = redoStack.length - 1; i >= 0 && out.length < MAX_TRAIL; i--) {
    const move = redoStack[i];
    out.push({ cell: move.cell, digit: move.digit ?? null, label: LABELS[move.kind] });
  }
  return out;
}
