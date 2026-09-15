/**
 * Service-worker registration, the resume-time update check, and the mark an
 * update leaves behind — all of it at module scope, installed once at import.
 *
 * This was inside `OfflineNotice`'s effect, and that is a component with a
 * mounting rule: it renders only when no game is open, because a fixed banner
 * over a board covers either the grid or the controls. That rule is right for
 * a *notice* and wrong for *behaviour*. The app restores the last game at
 * launch, so an installed PWA that is resumed — the exact case the update
 * check was written for — had no listener at all; the check only ran for a
 * player who happened to be sitting in the library, which is also the only
 * case the e2e exercised.
 *
 * Registering once has a second effect worth naming. `registerSW` builds a
 * fresh `Workbox` on every call, with `activated`/`installed` handlers plus
 * workbox-window's own listeners on `navigator.serviceWorker`, and nothing
 * removes them — so a per-mount registration left one more live registration
 * behind on every library↔game transition, each holding an `activated`
 * handler that reloads the page. Nothing here renders, so nothing here
 * mounts, so there is nothing to accumulate.
 *
 * `registerType: 'autoUpdate'` (see the Vite config) means a newer build takes
 * over and reloads the page on its own, with no prompt to answer, and
 * `immediate: true` checks for one on navigation. Neither covers a resume, so
 * `onRegisteredSW` hands back the registration for a `visibilitychange`
 * listener to call `update()` on, at the same moment sync already checks in.
 *
 * The reload itself stays silent — interrupting a puzzle to announce a
 * background update would be worse than the update — but happening with no
 * trace at all left a real bug (#126) invisible until reported by hand. So
 * `controllerchange` (fired the instant the new worker takes control,
 * immediately before `autoUpdate`'s own reload) writes a `sessionStorage`
 * mark *before* that reload, which `OfflineNotice` reads *after* it, on the
 * next load, to say what just happened.
 */

import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';

/** Set just before `autoUpdate`'s own reload; read and cleared on next mount. */
export const UPDATED_KEY = 'sudoku-coach:updated';

/**
 * "The precache finished and nobody has been told yet."
 *
 * Held here rather than in the component because the component is not always
 * mounted: precaching can finish while a game is open, and a promise kept
 * with nobody watching is still a promise kept. Cleared when the notice is
 * dismissed or times out — an event — never on a mount, so React's
 * development double-mount cannot swallow it.
 */
export const usePwaStatus = create<{ offlineReady: boolean }>()(() => ({ offlineReady: false }));

/** The notice has had its say. */
export const offlineReadySaid = (): void => usePwaStatus.setState({ offlineReady: false });

/**
 * What a hand-driven update check can end as.
 *
 * `current` is the ordinary answer and the one worth designing for: almost
 * every press lands here, and it has to read as an answer rather than as the
 * button having done nothing. `found` is rarer than it looks — with
 * `registerType: 'autoUpdate'` a new worker takes over and reloads the page
 * itself, so the honest report is "something is arriving", not "done".
 * `unavailable` covers the two cases with no worker to ask: a browser without
 * service workers, and `vite dev`, where the plugin registers none at all.
 */
export type UpdateCheck = 'current' | 'found' | 'unavailable' | 'failed';

/** How long to wait before calling a check failed. */
export const UPDATE_TIMEOUT_MS = 10_000;

/**
 * The live registration, or undefined until one exists.
 *
 * Module-scoped because `installServiceWorker` runs once at import and the
 * Settings screen needs to reach what it captured. Not in the zustand store:
 * nothing renders from it, and putting a live browser object in a store
 * invites a component to subscribe to something that never changes.
 */
let current: ServiceWorkerRegistration | undefined;

/**
 * Asks the browser to go and look, on purpose, because the player pressed a
 * button.
 *
 * The same `registration.update()` the resume handler already calls — the
 * difference is entirely that someone is waiting for an answer, which is why
 * this one has a deadline. `update()` is a fetch of `sw.js` with no timeout of
 * its own (and `vercel.json` serves it `must-revalidate`, so the fetch is
 * real), and a button that can hang forever on a dead network is worse than
 * one that admits defeat.
 *
 * "Found" is read off the registration afterwards rather than from the
 * promise, which resolves either way: a waiting or installing worker is the
 * only evidence that the look turned something up.
 */
export async function checkForUpdate(
  timeoutMs: number = UPDATE_TIMEOUT_MS,
): Promise<UpdateCheck> {
  const registration = current;
  if (registration === undefined) return 'unavailable';

  const timeout = new Promise<'failed'>((resolve) => {
    setTimeout(() => resolve('failed'), timeoutMs);
  });

  const look = registration
    .update()
    .then(() =>
      registration.waiting !== null || registration.installing !== null ? 'found' : 'current',
    )
    .catch((): UpdateCheck => 'failed');

  return Promise.race([look, timeout]);
}

/**
 * Registers the worker and watches for the two things worth reacting to.
 * Returns a disposer, exported for the same reason `installLifecycleHooks`
 * does: a listener on a page that has moved on is work nobody can finish.
 */
export function installServiceWorker(): () => void {
  registerSW({
    immediate: true,
    onOfflineReady: () => usePwaStatus.setState({ offlineReady: true }),
    onRegisteredSW: (_swUrl, reg) => {
      current = reg;
    },
  });

  const container = navigator.serviceWorker;
  // Guarded on a *previous* controller: this event also fires once, on a
  // first install, and a visitor arriving for the first time was never on an
  // older version for this to be news about.
  let hadController = Boolean(container?.controller);
  const onControllerChange = (): void => {
    if (hadController) {
      try {
        sessionStorage.setItem(UPDATED_KEY, '1');
      } catch {
        // `sessionStorage` throws in a locked-down context (private browsing
        // in some browsers). Losing the notice there is a fair trade for not
        // losing the app; the update itself has already happened.
      }
    }
    hadController = true;
  };
  container?.addEventListener('controllerchange', onControllerChange);

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') void current?.update();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    container?.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisibility);
    // Dropped with the listeners: a disposed installation must not leave the
    // Settings button holding a registration from a page that has moved on.
    current = undefined;
  };
}

/**
 * Installed at import rather than from a component — the same reasoning as
 * `installLifecycleHooks` in `state/store.ts`: keeping the app up to date is
 * not something that should depend on which screen is showing.
 */
export const disposeServiceWorker = installServiceWorker();
