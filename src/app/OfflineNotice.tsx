/**
 * "Ready to play offline", said once, when it becomes true.
 *
 * Offline-complete is the promise the whole PWA setup exists to keep (R9), and
 * until the service worker finishes precaching it is not yet kept. The player
 * has no way to know when that flips, and finding out by losing signal on a
 * train is the wrong way to learn it.
 *
 * The service worker registers itself — `registerType: 'autoUpdate'` in the
 * Vite config — so this asks for the callback, not for the registration, and a
 * newer build takes over silently on the next load rather than interrupting a
 * puzzle to ask.
 */

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useT } from '../i18n/locale';
import { IconButton } from '../ui/primitives/IconButton';
import { CloseIcon } from '../ui/primitives/icons';

/** Long enough to read twice, short enough not to sit over the keypad. */
const VISIBLE_MS = 6000;

export function OfflineNotice() {
  const t = useT();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    registerSW({ immediate: true, onOfflineReady: () => setReady(true) });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const handle = setTimeout(() => setReady(false), VISIBLE_MS);
    return () => clearTimeout(handle);
  }, [ready]);

  if (!ready) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-cell border border-rule-strong bg-paper-raised px-4 py-3 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">{t('offline.ready')}</p>
      <IconButton
        size="sm"
        label={t('action.close')}
        icon={<CloseIcon />}
        onClick={() => setReady(false)}
      />
    </div>
  );
}
