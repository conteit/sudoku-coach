/**
 * The mark a cell carries when it is part of a pattern the app is drawing —
 * as a bitfield, for the reason `Cell`'s performance contract gives: every
 * prop of a memoized cell compares by value, and an object would allocate a
 * fresh one per cell per render and defeat `memo` for all 81 of them. This is
 * the same trick `flags` plays with the six highlight layers.
 *
 * Kept beside the board rather than in `ui/claim/`, because the coach's "show
 * me the cells", a lesson's worked example and a claim in progress all draw
 * the same thing and none of them owns it.
 *
 * Three channels, deliberately independent:
 *
 * - **Shape** says what the cell *is*: a ring is part of the pattern, a square
 *   is a cell the pattern takes a digit away from.
 * - **Stroke** says which part: solid and dashed alternate along a colouring,
 *   and an XY-Wing's wings are dotted where its pivot is solid.
 * - **Colour** reinforces; it never carries anything by itself. A difference
 *   carried by colour alone is no difference on a dim screen (#125).
 */

export const MARK_NONE = 0;

/** Present at all. Everything else is ignored without it. */
export const MARK_ON = 1 << 0;
/** A cell the pattern removes a digit from, rather than one it is built of. */
export const MARK_TARGET = 1 << 1;
export const MARK_DASHED = 1 << 2;
export const MARK_DOTTED = 1 << 3;
/** Heavier: the one cell of a pattern doing something the others are not. */
export const MARK_LEAD = 1 << 4;

export const marked = (mark: number, bit: number): boolean => (mark & bit) !== 0;
