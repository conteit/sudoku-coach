/**
 * The green same-digit highlight's arm/clear rule (R3).
 *
 * The grid drives it, not the keypad: selecting a cell that holds a digit is
 * the arm/clear decision, and selecting an empty cell is deliberately not a
 * decision at all — the highlight has to survive it, because scanning across
 * the board's empty cells for where a digit still fits is the one thing a
 * player uses this highlight for.
 */

import type { Digit } from '../engine/types';

/**
 * `value` is the digit the selected cell holds, or null for an empty one.
 * An empty cell passes `current` straight through unchanged.
 */
export function selectHighlight(value: Digit | null, current: Digit | null): Digit | null {
  if (value === null) return current;
  return value === current ? null : value;
}
