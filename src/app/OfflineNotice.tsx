/**
 * "Ready to play offline", said once, when it becomes true — and, separately,
 * "updated", said once after the service worker has quietly replaced itself.
 *
 * Offline-complete is the promise the whole PWA setup exists to keep (R9), and
 * until the service worker finishes precaching it is not yet kept. The player
 * has no way to know when that flips, and finding out by losing signal on a
 * train is the wrong way to learn it.
 *
 * The service worker registers itself — `registerType: 'autoUpdate'` in the
 * Vite config — so a newer build takes over and reloads the page on its own,
 * with no prompt to answer. But `immediate: true` only checks for that newer
 * build on navigation, so an installed PWA that is *resumed* — brought to the
 * foreground rather than freshly opened — can sit on an old build for as long
 * as it is never closed. `onRegisteredSW` hands back the registration so a
 * `visibilitychange` listener can call `registration.update()` at the same
 * moment sync already checks in.
 *
 * The reload itself stays silent — interrupting a puzzle to announce a
 * background update would be worse than the update — but happening with no
 * trace at all left a real bug (#126) invisible until reported by hand. So a
 * `controllerchange` listener (fired the instant the new worker takes
 * control, immediately before `autoUpdate`'s own reload) marks a
 * `sessionStorage` flag *before* that reload, which this component reads
 * *after* it, on the next mount, to say what just happened. The guard on
 * there having been a *previous* controller matters: the same event fires
 * once on a first install too, and a first-time visitor was never on an old
 * version to begin with.
 */

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useT } from '../i18n/locale';
import { IconButton } from '../ui/primitives/IconButton';
import { CloseIcon } from '../ui/primitives/icons';

/** Long enough to read twice, short enough not to sit over the keypad. */
const VISIBLE_MS = 6000;

/** Set just before `autoUpdate`'s own reload; read and cleared on next mount. */
const UPDATED_KEY = 'sudoku-coach:updated';

export function OfflineNotice() {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [updated, setUpdated] = useState(false);

  // Read the mark left by the load this one replaced, before anything else
  // runs. A try/catch because `sessionStorage` can throw in a locked-down
  // context (private browsing in some browsers) — losing the one-time notice
  // there is a fair trade for not losing the app.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(UPDATED_KEY) === '1') {
        sessionStorage.removeItem(UPDATED_KEY);
        setUpdated(true);
      }
    } catch {
      // Nothing to do: the mark cannot be read, so there is nothing to say.
    }
  }, []);

  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined;

    registerSW({
      immediate: true,
      onOfflineReady: () => setReady(true),
      onRegisteredSW: (_swUrl, reg) => {
        registration = reg;
      },
    });

    const container = navigator.serviceWorker;
    // Guarded on a *previous* controller: this event also fires once, on a
    // first install, and a visitor arriving for the first time was never on
    // an older version for this to be news about.
    let hadController = Boolean(container?.controller);
    const onControllerChange = () => {
      if (hadController) {
        try {
          sessionStorage.setItem(UPDATED_KEY, '1');
        } catch {
          // See above — the notice is a nicety, not the update itself.
        }
      }
      hadController = true;
    };
    container?.addEventListener('controllerchange', onControllerChange);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void registration?.update();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      container?.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const handle = setTimeout(() => setReady(false), VISIBLE_MS);
    return () => clearTimeout(handle);
  }, [ready]);

  useEffect(() => {
    if (!updated) return;
    const handle = setTimeout(() => setUpdated(false), VISIBLE_MS);
    return () => clearTimeout(handle);
  }, [updated]);

  if (!ready && !updated) return null;

  // `ready` first: the rarer case of the two arriving in the same instant is
  // a first-ever install that also had time to update before its first
  // paint, and "ready to play offline" is the more important of the pair.
  const message = ready ? t('offline.ready') : t('offline.updateAvailable');

  return (
    // Top of the screen, and transparent to the pointer except for its own
    // close button. At the bottom it sat over the keypad and the coach's
    // controls, and for the seconds it was up it swallowed their taps — a
    // notice about a promise being kept is not worth breaking the app for.
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-cell border border-rule-strong bg-paper-raised px-4 py-3 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">{message}</p>
      <IconButton
        size="sm"
        className="pointer-events-auto"
        label={t('action.close')}
        icon={<CloseIcon />}
        onClick={() => {
          setReady(false);
          setUpdated(false);
        }}
      />
    </div>
  );
}
