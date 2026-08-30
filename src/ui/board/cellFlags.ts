/**
 * The value types a `Cell` compares on.
 *
 * Both of these exist so that 81 memoized cells can be compared by value. The
 * engine models pencil marks as `Set<Digit>` — a fresh object on every render,
 * which would defeat `memo` for the whole board on every keystroke — so the
 * grid packs them into a 9-bit mask, and packs the highlight layers into a
 * second byte. Adding a layer widens neither the prop list nor the comparison.
 */

import type { Digit } from '../../engine/types';

export const CELL_SELECTED = 1 << 0;
/** Shares a row, column or box with the selection. */
export const CELL_PEER = 1 << 1;
/** Holds the same digit as the selected cell (R3). */
export const CELL_MATCH = 1 << 2;
/** Named by a coach hint at disclosure level 3+. */
export const CELL_SPOTLIGHT = 1 << 3;
/** Inside a house the coach is tinting. */
export const CELL_HOUSE = 1 << 4;
/** Duplicates a digit in one of its houses. */
export const CELL_CONFLICT = 1 << 5;

export const hasFlag = (flags: number, bit: number): boolean => (flags & bit) !== 0;

/** Pack a candidate set into a 9-bit mask; bit 0 is the digit 1. */
export const marksToMask = (candidates: Iterable<Digit>): number => {
  let mask = 0;
  for (const digit of candidates) mask |= 1 << (digit - 1);
  return mask;
};

export const maskHas = (mask: number, digit: Digit): boolean => (mask & (1 << (digit - 1))) !== 0;
