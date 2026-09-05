/**
 * The held press, tested at the hook rather than through a component.
 *
 * The property that matters here is a *timing* one — which version of the
 * callback runs half a second after the finger went down — and asserting it
 * through a rendered board asserts it through the board's own state, the
 * grid's props and `Cell`'s memo as well.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, useLongPress } from './useLongPress';

afterEach(() => {
  vi.useRealTimers();
});

describe('useLongPress', () => {
  it('runs the callback as it stands when the timer fires, not as it stood at pointerdown', () => {
    // The defect this pins: `start` used to close over the render's own
    // `onLongPress`, so a press resolved against props that were half a second
    // old. `Cell` fires `onActivate` before `press.start`, so in sweep mode the
    // tap-half of the same gesture changes the board first — and the hold then
    // acted on a cell that no longer looked like that.
    vi.useFakeTimers();
    const atPointerDown = vi.fn();
    const atFireTime = vi.fn();

    const { result, rerender } = renderHook(
      ({ onLongPress }: { onLongPress: (payload: string) => void }) =>
        useLongPress<string>({ onLongPress }),
      { initialProps: { onLongPress: atPointerDown } },
    );

    act(() => {
      result.current.start('r1c3', 10, 10);
    });
    // The board changed under the finger: a new render, a new callback.
    rerender({ onLongPress: atFireTime });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });

    expect(atPointerDown).not.toHaveBeenCalled();
    expect(atFireTime).toHaveBeenCalledWith('r1c3');
  });
});
