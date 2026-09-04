/**
 * The two things this has to get right, and they pull in opposite directions.
 *
 * Never act while there is no network — that is the cheap half. And when the
 * network comes back, wait before believing it: a train leaving a tunnel
 * raises `online` several times in a few seconds, and the thing sync does on
 * reconnection is ask Google for a token, which is the one operation that can
 * put a popup in front of someone. Firing that five times on a flap would be
 * worse than the nagging this replaces.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STABLE_MS, isOffline, watchConnection } from './connectivity';

/** jsdom leaves `navigator.onLine` read-only and true; this is the only way in. */
const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

const fire = (event: 'online' | 'offline') => window.dispatchEvent(new Event(event));

beforeEach(() => {
  vi.useFakeTimers();
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  setOnline(true);
});

describe('isOffline', () => {
  it('is true only when the browser is certain', () => {
    setOnline(false);
    expect(isOffline()).toBe(true);
  });

  it('is false when online', () => {
    setOnline(true);
    expect(isOffline()).toBe(false);
  });

  it('treats an unknown answer as online, so it can only ever skip work', () => {
    // `true` never proves reachability — a captive portal says `true` — so
    // this is used to skip, never as a licence to claim a request will work.
    // The safe reading of "no idea" is therefore "try, and report the truth".
    Object.defineProperty(navigator, 'onLine', { value: undefined, configurable: true });
    expect(isOffline()).toBe(false);
  });
});

describe('watchConnection', () => {
  it('waits for the connection to hold before acting on it', () => {
    const onStable = vi.fn();
    watchConnection({ onStable });

    fire('online');
    vi.advanceTimersByTime(STABLE_MS - 1);
    expect(onStable).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onStable).toHaveBeenCalledTimes(1);
  });

  it('fires once for a flapping connection, not once per flap', () => {
    const onStable = vi.fn();
    watchConnection({ onStable });

    for (let i = 0; i < 5; i += 1) {
      fire('offline');
      setOnline(true);
      fire('online');
      vi.advanceTimersByTime(500);
    }
    expect(onStable).not.toHaveBeenCalled();

    vi.advanceTimersByTime(STABLE_MS);
    expect(onStable).toHaveBeenCalledTimes(1);
  });

  it('does not act if the connection went away again while it waited', () => {
    // The window is exactly long enough for that to happen, and a callback
    // fired into no network is the thing this exists to prevent.
    const onStable = vi.fn();
    watchConnection({ onStable });

    fire('online');
    vi.advanceTimersByTime(STABLE_MS - 1);
    setOnline(false);
    vi.advanceTimersByTime(1);

    expect(onStable).not.toHaveBeenCalled();
  });

  it('reports a loss at once, because losing it is never in doubt', () => {
    const onLost = vi.fn();
    watchConnection({ onStable: vi.fn(), onLost });

    fire('offline');

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending reconnection when the connection drops', () => {
    const onStable = vi.fn();
    watchConnection({ onStable });

    fire('online');
    vi.advanceTimersByTime(STABLE_MS - 1);
    fire('offline');
    vi.advanceTimersByTime(STABLE_MS * 2);

    expect(onStable).not.toHaveBeenCalled();
  });

  it('stops listening, and drops a pending timer, when unsubscribed', () => {
    const onStable = vi.fn();
    const stop = watchConnection({ onStable });

    fire('online');
    stop();
    vi.advanceTimersByTime(STABLE_MS * 2);
    fire('online');
    vi.advanceTimersByTime(STABLE_MS * 2);

    expect(onStable).not.toHaveBeenCalled();
  });
});
