/**
 * "Ready to play offline", said once, when it becomes true — and, separately,
 * "updated", said once after the service worker has quietly replaced itself.
 *
 * Offline-complete is the promise the whole PWA setup exists to keep (R9), and
 * until the service worker finishes precaching it is not yet kept. The player
 * has no way to know when that flips, and finding out by losing signal on a
 * train is the wrong way to learn it.
 *
 * Only the *saying* lives here. Registering the worker, checking for a new
 * build on resume and marking that one took over are in
 * `app/serviceWorker.ts`, at module scope: this component is mounted only
 * when no game is open, and behaviour must not inherit a mounting rule
 * written for a banner. The two facts it renders therefore both arrive from
 * outside it — `offlineReady` from that module's store, and the update mark
 * from the `sessionStorage` the load *before* this one wrote, which is read
 * here and cleared as it is read so an update is announced once rather than
 * on every later mount.
 */

import { useEffect, useState } from 'react';
import { useT } from '../i18n/locale';
import { UPDATED_KEY, offlineReadySaid, usePwaStatus } from './serviceWorker';
import { IconButton } from '../ui/primitives/IconButton';
import { CloseIcon } from '../ui/primitives/icons';

/** Long enough to read twice, short enough not to sit over the keypad. */
const VISIBLE_MS = 6000;

export function OfflineNotice() {
  const t = useT();
  const ready = usePwaStatus((state) => state.offlineReady);
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
    if (!ready) return;
    const handle = setTimeout(offlineReadySaid, VISIBLE_MS);
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
          offlineReadySaid();
          setUpdated(false);
        }}
      />
    </div>
  );
}
