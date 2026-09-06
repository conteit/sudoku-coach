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
 * so an empty pending set renders nothing at all.
 *
 * What it shows is `changed \ announced`, not `changed` itself, and the read
 * receipt (`announced`) lives in the sync store rather than here. Two things
 * follow from that, and both were bugs in an earlier version that kept the
 * receipt as local component state:
 *
 * - Opening a game from the library calls `seen()`, which shrinks `changed`.
 *   That must never reopen this toast to announce the games the player
 *   *hasn't* opened yet — the one thing this component can never do is
 *   interrupt the game that is currently on screen. Deriving from the
 *   difference handles this for free: removing an id from `changed` can only
 *   shrink the pending set, never grow it, so it cannot cause a reopen.
 * - A genuinely new arrival — `changed` growing past what `announced` already
 *   covers — must still show, even if the player is mid-game and already
 *   dismissed an earlier one. Comparing against a store-held `announced`
 *   handles this too, and it survives this component unmounting between
 *   games, where local state would not.
 *
 * Dismissing or timing out calls `announce()`, never `seen()`: putting an
 * id in front of the player is not the same as the player having opened that
 * game, and only opening it earns the id's removal from `changed` (see that
 * store's doc comment).
 */

import { useEffect } from 'react';
import { useT } from '../i18n/locale';
import { useSync } from '../sync/store';
import { IconButton } from '../ui/primitives/IconButton';
import { CloseIcon } from '../ui/primitives/icons';

/** Same duration as `OfflineNotice`: long enough to read twice. */
const VISIBLE_MS = 6000;

/** `changed` minus `announced` — arrived, and not yet put in front of anyone. */
const pending = (changed: ReadonlySet<string>, announced: ReadonlySet<string>): string[] =>
  [...changed].filter((id) => !announced.has(id));

export function SyncToast() {
  const t = useT();
  const changed = useSync((state) => state.changed);
  const announced = useSync((state) => state.announced);
  const ids = pending(changed, announced);
  const count = ids.length;
  // Which ids, not just how many — two different arrivals that happen to be
  // the same size must each restart the timeout rather than being confused
  // for one that already ran its course.
  const key = ids.slice().sort().join(',');

  useEffect(() => {
    if (count === 0) return;
    const handle = setTimeout(() => useSync.getState().announce(), VISIBLE_MS);
    return () => clearTimeout(handle);
  }, [key, count]);

  if (count === 0) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-cell border border-rule-strong bg-paper-raised px-4 py-3 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">
        {count === 1 ? t('sync.toast.gamesOne') : t('sync.toast.games', { count })}
      </p>
      <IconButton
        size="sm"
        className="pointer-events-auto"
        label={t('action.close')}
        icon={<CloseIcon />}
        onClick={() => useSync.getState().announce()}
      />
    </div>
  );
}
