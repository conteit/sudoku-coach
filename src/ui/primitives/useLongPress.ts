/**
 * A held press, shared by the keypad's digits and the board's cells.
 *
 * Extracted from the keypad rather than written twice: threshold and
 * drag-cancellation are the parts of a long press that are easy to get subtly
 * different, and two gestures that disagree about how far a thumb may drift
 * feel like a bug in whichever one the player tried second.
 */

import { useEffect, useRef } from 'react';

/**
 * Long enough that every ordinary tap resolves as a tap, short enough that
 * holding does not feel like a broken control.
 */
export const LONG_PRESS_MS = 500;

/**
 * How far a pointer can drift before a held press is cancelled. Needed
 * specifically for touch: a touch pointer gets *implicit* capture on
 * `pointerdown`, so `pointerleave`/`pointerout` are not dispatched while the
 * finger is still down and moving across other targets — they are deferred
 * until release. `pointermove` is the only event that still reaches the
 * original target once the finger has wandered off it, so it is the only
 * reliable way to honour drag-off-to-cancel on a touchscreen.
 */
export const MOVE_CANCEL_PX = 10;

export interface LongPressOptions<T> {
  onLongPress: (payload: T) => void;
  ms?: number;
  moveCancelPx?: number;
}

export interface LongPress<T> {
  start: (payload: T, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
  /**
   * Whether this payload's press already fired as a long press — and clears
   * the flag. A pointer held past the threshold still ends in a `click` on
   * release (that is how buttons work, mouse or touch), and the long press
   * already did its thing, so that click must be swallowed rather than
   * treated as a second action.
   */
  consumeFired: (payload: T) => boolean;
}

export function useLongPress<T>({
  onLongPress,
  ms = LONG_PRESS_MS,
  moveCancelPx = MOVE_CANCEL_PX,
}: LongPressOptions<T>): LongPress<T> {
  /*
   * Only one target can be under a pointer at a time, so a single ref tracks
   * the press in flight rather than one per target. `x`/`y` are the down
   * coordinates, for `move`.
   */
  const press = useRef<{
    payload: T | null;
    timer: ReturnType<typeof setTimeout> | null;
    fired: boolean;
    x: number;
    y: number;
  }>({ payload: null, timer: null, fired: false, x: 0, y: 0 });

  /*
   * The callback the timer will run, read at fire time rather than captured
   * at `pointerdown`. Half a second is long enough for the board to change
   * underneath a hold: `Cell` fires `onActivate` *before* `press.start`, so in
   * sweep mode the tap-half of the very same gesture mutates the cell, and a
   * captured `onLongPress` would then resolve against a board that no longer
   * exists — placing a digit the cell has no business receiving. Nothing about
   * that is sweep-specific; any state change during the hold has the same
   * shape.
   */
  const latest = useRef(onLongPress);
  /*
   * Assigned in an effect rather than during render. Render must stay pure —
   * React may discard a render it has begun, and a discarded render that had
   * already written the ref would leave it pointing at a callback from a tree
   * that was never committed. No concurrent feature is in this app today, so
   * the hazard is latent rather than live; the effect costs nothing and the
   * rule holds whether or not one arrives. Safe without a dependency array
   * because effects run after commit and before any pointer event the user
   * can raise, so `start` never reads a stale callback.
   */
  useEffect(() => {
    latest.current = onLongPress;
  });

  const end = (): void => {
    if (press.current.timer === null) return;
    clearTimeout(press.current.timer);
    press.current.timer = null;
  };

  // A press left pending by an unmount is otherwise a live timer nothing ever
  // clears. Captured as `state` rather than read via `press.current` inside
  // the cleanup: `press` is never reassigned — only its fields mutate — so
  // the two are the same object for the component's whole life.
  useEffect(() => {
    const state = press.current;
    return () => {
      if (state.timer !== null) clearTimeout(state.timer);
    };
  }, []);

  return {
    start: (payload, x, y) => {
      press.current.payload = payload;
      press.current.fired = false;
      press.current.x = x;
      press.current.y = y;
      press.current.timer = setTimeout(() => {
        press.current.fired = true;
        latest.current(payload);
      }, ms);
    },
    move: (x, y) => {
      if (press.current.timer === null) return;
      const dx = x - press.current.x;
      const dy = y - press.current.y;
      if (dx * dx + dy * dy > moveCancelPx * moveCancelPx) end();
    },
    end,
    consumeFired: (payload) => {
      if (!press.current.fired || press.current.payload !== payload) return false;
      press.current.fired = false;
      return true;
    },
  };
}
