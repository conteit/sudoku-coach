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
 * Registers the worker and watches for the two things worth reacting to.
 * Returns a disposer, exported for the same reason `installLifecycleHooks`
 * does: a listener on a page that has moved on is work nobody can finish.
 */
export function installServiceWorker(): () => void {
  let registration: ServiceWorkerRegistration | undefined;

  registerSW({
    immediate: true,
    onOfflineReady: () => usePwaStatus.setState({ offlineReady: true }),
    onRegisteredSW: (_swUrl, reg) => {
      registration = reg;
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
    if (document.visibilityState === 'visible') void registration?.update();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    container?.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * Installed at import rather than from a component — the same reasoning as
 * `installLifecycleHooks` in `state/store.ts`: keeping the app up to date is
 * not something that should depend on which screen is showing.
 */
export const disposeServiceWorker = installServiceWorker();
