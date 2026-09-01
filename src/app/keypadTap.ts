/**
 * The keypad's arm/clear/re-arm decision (R3).
 *
 * Pulled out of `GameView` so the one rule this feature is graded against —
 * a tap that writes something arms the green on what it wrote, and only a
 * tap that writes nothing is allowed to turn an already-armed highlight off
 * — can be exercised directly, without a rendered view standing in for four
 * lines of logic.
 */

import type { CellIndex, Digit } from '../engine/types';

export interface KeypadTapResult {
  /** Whether the tap should write `digit` into the selected cell. */
  entered: boolean;
  /** The highlight after the tap. */
  highlight: Digit | null;
}

/**
 * `selected` is the cell the tap would write into, `selectedValue` its
 * current value (meaningless when `selected` is null). A tap enters a digit
 * exactly when a cell is selected and does not already hold that digit —
 * nothing is selected, or the digit is already there, both write nothing.
 */
export function keypadTap(
  selected: CellIndex | null,
  selectedValue: Digit | null,
  digit: Digit,
  current: Digit | null,
): KeypadTapResult {
  const entered = selected !== null && selectedValue !== digit;
  // The guard: only a tap that entered nothing may clear an already-armed
  // highlight. A tap that wrote something always arms on what it wrote, even
  // over a different current highlight — that is what stops placing the same
  // digit into a second cell from blinking the green off.
  const highlight = !entered && current === digit ? null : digit;
  return { entered, highlight };
}
