/**
 * "2 games were updated from another device" — said once, in the game that
 * is open, when a sync actually brought something in.
 *
 * `SyncNotice`'s twin: same fixed overlay, same pointer-transparency (only the
 * close button is clickable), same `role="status"`. The difference is why it
 * exists. `SyncNotice` reports a *condition* that stays true whether or not
 * you read it — signed out is signed out until you sign back in, so it never
 * times out. This reports *news*: a fact that was new once and is not new
 * forever, so it borrows `OfflineNotice`'s other half instead — a
 * `VISIBLE_MS` timeout with a cleanup, because a timer nobody cancels on
 * unmount is a leak this project names explicitly.
 *
 * It is `SyncNotice` and `OfflineNotice`'s opposite in one more way: `App.tsx`
 * mounts those only while the library is showing, and mounts this only while
 * a game is open. A sync that moved nothing must stay silent — sync is
 * best-effort by the spec's standing rule, and nothing may interrupt a game —
 * so an empty `changed` set renders nothing at all.
 *
 * Dismissing or timing out does not call `seen()` and does not touch
 * `changed`. That set is also what the library's per-game dots (a later task)
 * read to show *which* games moved, and a player who glanced past this toast
 * — or was in a different game when it arrived — has not seen that yet. Only
 * opening the specific game that changed earns its removal, which is what the
 * store's own doc comment for `seen` says ("opened, not merely glanced at").
 * What this component tracks instead is its own read receipt — the exact set
 * of ids it has already shown — so the same arrival is not re-announced on
 * every re-render, while a genuinely new arrival (the set growing) shows
 * again with the current, larger count.
 */

import { useEffect, useState } from 'react';
import { useT } from '../i18n/locale';
import { useSync } from '../sync/store';
import { IconButton } from '../ui/primitives/IconButton';
import { CloseIcon } from '../ui/primitives/icons';

/** Same duration as `OfflineNotice`: long enough to read twice. */
const VISIBLE_MS = 6000;

/** A stable fingerprint for "this particular arrival" — order-independent. */
const fingerprint = (ids: ReadonlySet<string>): string => [...ids].sort().join(',');

export function SyncToast() {
  const t = useT();
  const changed = useSync((state) => state.changed);
  const current = fingerprint(changed);
  const [shown, setShown] = useState<string | null>(null);
  const visible = changed.size > 0 && current !== shown;

  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(() => setShown(current), VISIBLE_MS);
    return () => clearTimeout(handle);
  }, [visible, current]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-cell border border-rule-strong bg-paper-raised px-4 py-3 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">
        {changed.size === 1
          ? t('sync.toast.gamesOne')
          : t('sync.toast.games', { count: changed.size })}
      </p>
      <IconButton
        size="sm"
        className="pointer-events-auto"
        label={t('action.close')}
        icon={<CloseIcon />}
        onClick={() => setShown(current)}
      />
    </div>
  );
}
