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

export type DigitRewindLabel = 'placed' | 'noted' | 'unnoted';
export type DigitlessRewindLabel = 'cleared' | 'notedAll' | 'unnotedAll';

/**
 * A discriminated union rather than one shape with an optional `digit`:
 * `set`, `addCandidate` and `removeCandidate` always name a digit, while
 * `clear`, `fillCandidates` and `clearCandidates` never do — replacing every
 * mark or every value in a cell at once, not one digit's mark. Folding those
 * into a single `digit: Digit | null` field left the null case indistinguishable
 * from "a digit was expected but missing", which is exactly the gap that let
 * `?? 0` fabricate one. Making the two variants distinct types means a digit
 * can only be read where one is guaranteed to exist.
 */
export type RewindStep =
  | {
      cell: CellIndex;
      /** The one digit the move placed, noted or un-noted. Never guessed. */
      digit: Digit;
      label: DigitRewindLabel;
    }
  // No `digit` field at all: `cleared` emptied the whole cell, and
  // `notedAll`/`unnotedAll` touched every candidate in it, so none of the
  // three is about any single digit.
  | { cell: CellIndex; label: DigitlessRewindLabel };

/**
 * How many undone moves the trail shows. A rewind out of a deep mistake can
 * run to dozens of moves, and a list that long is scrolled past rather than
 * read — as well as being unbounded growth inside a panel that has to stay
 * inside its own box (invariant 9).
 */
export const MAX_TRAIL = 12;

/**
 * Each digit-bearing kind's own fallback: the digit-less reading from the
 * same family (single value / single note / single note-removal), for the
 * boundary case in `rewindTrail` below. Not the same claim as the ordinary
 * digit-less kinds — a `set` that arrived with no digit did not actually
 * clear the cell — but it is the vaguest true statement available ("this
 * cell changed") where the specific one ("this digit went here") cannot be
 * made honestly.
 */
const DIGIT_LABELS: Record<
  'set' | 'addCandidate' | 'removeCandidate',
  { label: DigitRewindLabel; fallback: DigitlessRewindLabel }
> = {
  set: { label: 'placed', fallback: 'cleared' },
  addCandidate: { label: 'noted', fallback: 'notedAll' },
  removeCandidate: { label: 'unnoted', fallback: 'unnotedAll' },
};

const DIGITLESS_LABELS: Record<'clear' | 'fillCandidates' | 'clearCandidates', DigitlessRewindLabel> = {
  clear: 'cleared',
  fillCandidates: 'notedAll',
  clearCandidates: 'unnotedAll',
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
    if (move.kind === 'set' || move.kind === 'addCandidate' || move.kind === 'removeCandidate') {
      const { label, fallback } = DIGIT_LABELS[move.kind];
      // Belt and braces: these kinds always carry a digit in practice, but
      // `Move.digit` is optional in the type for every kind. A move log that
      // somehow disagrees produces the vaguer, digit-less copy rather than a
      // fabricated digit — wrong copy is the one outcome this cannot have.
      out.push(
        move.digit === undefined
          ? { cell: move.cell, label: fallback }
          : { cell: move.cell, digit: move.digit, label },
      );
    } else {
      out.push({ cell: move.cell, label: DIGITLESS_LABELS[move.kind] });
    }
  }
  return out;
}
