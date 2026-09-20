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
 * - **Colour** is the colouring's, because that technique *is* two colours —
 *   Paolo: "not for colouring where color plays a role". Using a stroke there
 *   would be describing the idea in a channel that is not the idea.
 * - **Stroke** is therefore free for the role distinction that has no colour
 *   of its own: an XY-Wing's wings are dashed where its pivot is solid.
 *
 * All of it is drawn quietly. These marks sit under the player's own digits
 * and notes and are there to be glanced at, not read.
 */

export const MARK_NONE = 0;

/** Present at all. Everything else is ignored without it. */
export const MARK_ON = 1 << 0;
/** A cell the pattern removes a digit from, rather than one it is built of. */
export const MARK_TARGET = 1 << 1;
/** The colouring's second colour. Only a chain alternates. */
export const MARK_ALT = 1 << 2;
/** A wing, as against the pivot it hangs off. */
export const MARK_DASHED = 1 << 3;

export const marked = (mark: number, bit: number): boolean => (mark & bit) !== 0;
