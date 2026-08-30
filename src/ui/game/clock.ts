/**
 * One second-hand for the whole app.
 *
 * Every running clock in the UI subscribes to this single interval rather than
 * starting its own, and the interval is created on the first subscriber and
 * cleared on the last — so a screen with no visible timer holds no timer at
 * all, and a list of ten paused games still holds none.
 *
 * Shaped for `useSyncExternalStore`, which is how React wants a component to
 * read a mutable outside value: the snapshot is cached between ticks so it is
 * stable within a render pass.
 */

let handle: ReturnType<typeof setInterval> | null = null;
let snapshot = 0;
const listeners = new Set<() => void>();

const tick = () => {
  snapshot = Date.now();
  for (const listener of listeners) listener();
};

export function subscribeToSeconds(listener: () => void): () => void {
  listeners.add(listener);
  if (handle === null) {
    snapshot = Date.now();
    handle = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && handle !== null) {
      clearInterval(handle);
      handle = null;
    }
  };
}

/** Milliseconds since the epoch, as of the last tick. */
export const secondsSnapshot = (): number => snapshot;

/** Subscribe stand-in for a paused clock: nothing to listen to, nothing to clean up. */
export const noSubscription = (): (() => void) => () => undefined;

/** Snapshot stand-in for a paused clock. */
export const zeroSnapshot = (): number => 0;
