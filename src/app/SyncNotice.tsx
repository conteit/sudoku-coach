/**
 * "Sync is paused, your games are still here" — said when it becomes true.
 *
 * Sync can stop working for reasons the player did nothing to cause: a token
 * expires after an hour, consent is withdrawn from a Google account page, the
 * network is a train tunnel. None of that is allowed to interrupt a puzzle,
 * and none of it is allowed to be silent either — a player who turned sync on
 * and believes it is running is a player who may be relying on it.
 *
 * So it is the offline notice's twin, deliberately: same place, same shape,
 * same rule that it is transparent to the pointer except for its own close
 * button. The difference is that it does not time out. "Ready to play offline"
 * is news that stays true whether or not you read it; this is a condition that
 * persists, and hiding it after six seconds would be hiding it.
 *
 * The message leads with what is still true — the games are on the device —
 * because that is the part a player is entitled to be sure of, and the part
 * silence would leave them guessing at.
 */

import { useEffect, useState } from 'react';
import { useT } from '../i18n/locale';
import { useSync, type SyncStatus } from '../sync/store';
import { IconButton } from '../ui/primitives/IconButton';
import { CloseIcon } from '../ui/primitives/icons';

/** The two states worth telling the player about. Everything else is normal. */
const MESSAGES = {
  consent: 'sync.notice.signedOut',
  error: 'sync.notice.failed',
} as const;

const tellable = (status: SyncStatus): status is keyof typeof MESSAGES =>
  status === 'consent' || status === 'error';

export function SyncNotice() {
  const t = useT();
  const enabled = useSync((state) => state.enabled);
  const status = useSync((state) => state.status);
  const [dismissed, setDismissed] = useState<SyncStatus | null>(null);

  // Dismissal is per-condition, not forever: closing the "signed out" notice
  // should not also silence a later failure of a different kind.
  useEffect(() => {
    if (dismissed !== null && status !== dismissed) setDismissed(null);
  }, [status, dismissed]);

  if (!enabled || !tellable(status) || dismissed === status) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-cell border border-rule-strong bg-paper-raised px-4 py-3 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm text-ink">{t(MESSAGES[status])}</p>
      <IconButton
        size="sm"
        className="pointer-events-auto"
        label={t('action.close')}
        icon={<CloseIcon />}
        onClick={() => setDismissed(status)}
      />
    </div>
  );
}
