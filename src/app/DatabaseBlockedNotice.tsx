/**
 * The screen that says why nothing is happening.
 *
 * It exists because the alternative shipped once: a blocked IndexedDB upgrade
 * leaves `open()` pending forever, so the shell's loading placeholder — an
 * empty `aria-busy` div — is what a player sees, indefinitely, with every
 * saved game apparently gone. Silence is the worst possible rendering of "your
 * data is fine, another window is in the way", because it is also what data
 * loss looks like.
 *
 * So this says the two things that matter, in this order: nothing is lost, and
 * here is the one action that clears it. The action is the player's — no
 * amount of retrying here can close their other window.
 */

import { useT } from '../i18n/locale';
import type { DatabaseBlock } from '../state/db';
import { Button } from '../ui/primitives/Button';

/**
 * `unavailable` is not a Dexie event like the other two: it is what is left
 * when opening storage simply failed — a private window, a browser out of
 * space, a profile the app cannot write to. Same screen, because from where
 * the player sits it is the same situation and the same first question.
 */
export type StorageProblem = Exclude<DatabaseBlock, 'none'> | 'unavailable';

export interface DatabaseBlockedNoticeProps {
  state: StorageProblem;
  /** Overridable so a test does not reload the test runner. */
  onReload?: () => void;
}

export function DatabaseBlockedNotice({
  state,
  onReload = () => window.location.reload(),
}: DatabaseBlockedNoticeProps) {
  const t = useT();
  // Spelled out rather than looked up in a table: `t()` checks a key's
  // placeholders at the call site, and a key arriving as a union loses that.
  const [title, body] =
    state === 'blocked'
      ? [t('db.blocked.title'), t('db.blocked.body')]
      : state === 'superseded'
        ? [t('db.superseded.title'), t('db.superseded.body')]
        : [t('db.unavailable.title'), t('db.unavailable.body')];

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      {/* `alert`, not `status`: nothing else is on screen and nothing will be
          until this is dealt with, so it is the one thing a screen reader
          should be interrupted for. */}
      <div className="flex max-w-[32rem] flex-col gap-4" role="alert">
        <h1 className="font-display text-3xl leading-tight text-ink">{title}</h1>
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
        <div className="sm:max-w-[16rem]">
          <Button variant="primary" size="lg" block onClick={onReload}>
            {t('action.reload')}
          </Button>
        </div>
      </div>
    </div>
  );
}
