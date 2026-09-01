import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewportTier } from './useViewportTier';

const PHONE = '(max-width: 639.98px)';
const LAPTOP = '(min-width: 1024px)';
const DESKTOP = '(min-width: 1536px)';

/** Drives the matchMedia stub: the listed queries match, all others do not. */
function matchOnly(...matching: string[]) {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/**
 * A `matchMedia` that actually remembers its listeners, so the effect — not
 * just `read()` — can be exercised.
 *
 * The stub above cannot do this: with `addEventListener` a no-op, every test
 * written against it passes whether the hook subscribes to anything or not,
 * and the `sync()` that closes the mount gap is unreachable. Here the harness
 * owns the set of matching queries, and `resizeTo` changes it and then fires
 * `change` on every query the way a browser does — including on queries whose
 * own `matches` did not change, which is what a `flushSync`-free listener has
 * to tolerate.
 */
function liveMatchMedia(initial: string[]) {
  let matching = new Set(initial);
  const listeners = new Map<string, Set<() => void>>();

  window.matchMedia = ((query: string) => ({
    get matches() {
      return matching.has(query);
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      const set = listeners.get(query) ?? new Set();
      set.add(listener);
      listeners.set(query, set);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.get(query)?.delete(listener);
    },
  })) as unknown as typeof window.matchMedia;

  return {
    /**
     * Changes which queries match *without* firing `change` — the mount gap,
     * where the viewport has already moved and no listener exists yet.
     */
    silentlySetTo(...next: string[]) {
      matching = new Set(next);
    },
    resizeTo(...next: string[]) {
      matching = new Set(next);
      act(() => {
        for (const set of listeners.values()) for (const listener of set) listener();
      });
    },
    /** How many listeners are still registered — zero after unmount, or the cleanup leaks. */
    get listenerCount() {
      return [...listeners.values()].reduce((total, set) => total + set.size, 0);
    },
  };
}

describe('useViewportTier', () => {
  it('is phone below 640', () => {
    matchOnly('(max-width: 639.98px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('phone');
  });

  it('is tablet between 640 and 1023', () => {
    matchOnly();
    expect(renderHook(() => useViewportTier()).result.current).toBe('tablet');
  });

  it('is laptop from 1024', () => {
    matchOnly('(min-width: 1024px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('laptop');
  });

  it('is desktop from 1536', () => {
    matchOnly('(min-width: 1024px)', '(min-width: 1536px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('desktop');
  });

  // The four above stub `addEventListener` as a no-op, so they only ever
  // prove `read()`. These three are about the subscription itself: a hook
  // that never listened would pass every one of the four and still leave a
  // player who rotated a tablet mid-game looking at the wrong layout.
  it('follows the viewport when a query changes under a running game', () => {
    const media = liveMatchMedia([LAPTOP]);
    const { result } = renderHook(() => useViewportTier());
    expect(result.current).toBe('laptop');

    media.resizeTo(LAPTOP, DESKTOP);
    expect(result.current).toBe('desktop');

    media.resizeTo(PHONE);
    expect(result.current).toBe('phone');

    media.resizeTo();
    expect(result.current).toBe('tablet');
  });

  // The `sync()` the effect runs before subscribing. `useState(read)` is
  // evaluated during render; the listeners are wired after commit; a viewport
  // change in between belongs to neither, and without the catch-up read it is
  // missed outright rather than merely delayed. The layout effect below is
  // that window made reachable: React runs every layout effect in a commit
  // before any passive one, so this fires after `useViewportTier`'s render
  // and before `useViewportTier`'s own `useEffect`. Nothing fires `change`,
  // which is the point — the event the hook missed is the one that never
  // reached a listener that did not exist yet.
  it('catches a change that landed between the first read and the subscription', () => {
    const media = liveMatchMedia([PHONE]);
    const { result } = renderHook(() => {
      const tier = useViewportTier();
      useLayoutEffect(() => media.silentlySetTo(LAPTOP, DESKTOP), []);
      return tier;
    });
    expect(result.current).toBe('desktop');
  });

  it('unsubscribes on unmount', () => {
    const media = liveMatchMedia([LAPTOP]);
    const { unmount } = renderHook(() => useViewportTier());
    expect(media.listenerCount).toBe(3);
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
