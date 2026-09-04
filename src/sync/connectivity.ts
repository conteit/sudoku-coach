/**
 * Knowing when there is no network, and when there is one worth trusting.
 *
 * This app is built to be played offline — installed, fully precached, R9 — so
 * a session with no network is the ordinary case, not a fault. Sync did not
 * know the difference: a dropped connection fell into the same bucket as a
 * genuine failure and told the player their sync had gone wrong, on every
 * entry to the app, about a problem they did not have and could not fix.
 *
 * **`navigator.onLine` is trustworthy in exactly one direction.** `false` means
 * there is no network interface and nothing can succeed. `true` means only that
 * an interface exists — a captive portal, a dead router or a tunnel all report
 * `true`. So it is used here as a cheap way to *skip*, never as proof that a
 * request will work: when it says `true` and the attempt fails anyway, that is
 * an ordinary failure and is reported as one.
 *
 * **"Stable" is the other half.** Coming back into signal often means flapping
 * — a train leaving a tunnel raises `online` several times in a few seconds —
 * and re-authenticating is the most expensive thing sync can do, since it is
 * the one that can put a Google popup in front of someone. So a reconnection
 * has to hold for a while before it counts as one.
 */

/** How long the connection must hold before a reconnection is acted on. */
export const STABLE_MS = 5000;

/** True only when the browser is certain there is no network. */
export const isOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

export interface ConnectionWatch {
  /** The connection came back and stayed back. */
  onStable: () => void;
  /** The connection went away. Fired immediately — losing it is never in doubt. */
  onLost?: () => void;
  stableMs?: number;
}

/**
 * Watches the connection, and calls back once it is worth acting on.
 * Returns an unsubscribe.
 */
export function watchConnection({
  onStable,
  onLost,
  stableMs = STABLE_MS,
}: ConnectionWatch): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (pending === null) return;
    clearTimeout(pending);
    pending = null;
  };

  const gained = (): void => {
    // Restarted, not stacked: each `online` event resets the clock, so a
    // connection that flaps five times waits out one settling period from the
    // last flap rather than firing five times.
    cancel();
    pending = setTimeout(() => {
      pending = null;
      // Checked again on the way out, because the wait is exactly long enough
      // for it to have gone away again without an event we saw.
      if (!isOffline()) onStable();
    }, stableMs);
  };

  const lost = (): void => {
    cancel();
    onLost?.();
  };

  window.addEventListener('online', gained);
  window.addEventListener('offline', lost);

  return () => {
    cancel();
    window.removeEventListener('online', gained);
    window.removeEventListener('offline', lost);
  };
}
