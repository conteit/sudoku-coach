/**
 * Who gets the developer entries in the game menu.
 *
 * An allowlist of Firebase UIDs and/or email addresses, comma-separated, read
 * from the environment at build time. Being public in the bundle is fine and
 * deliberate: it is not a credential, it grants nothing to anyone who is not
 * already signed in as that account, and the two tools it unlocks are things
 * a player could do to their own board anyway.
 *
 * UIDs are preferred over emails for a reason that has nothing to do with
 * security: a UID means nothing to whoever reads the bundle, and an email
 * address in a public bundle is a spam magnet.
 */

import type { Account } from '../state/account';

/** Case-insensitive on emails, exact on UIDs, and blank-tolerant throughout. */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export const DEV_ALLOWLIST = parseAllowlist(
  (import.meta.env as unknown as Record<string, string | undefined>).VITE_DEV_ALLOWLIST,
);

/**
 * Signed in, and named in the list.
 *
 * Signed *out* never counts, even with an empty allowlist — an empty list
 * means "nobody", not "everybody", which is the only reading that is safe
 * when a variable goes missing from a deploy.
 */
export function isDevUser(account: Account | null, allowlist: readonly string[] = DEV_ALLOWLIST) {
  if (account === null || allowlist.length === 0) return false;
  const uid = account.uid.toLowerCase();
  const email = account.email?.toLowerCase();
  return allowlist.includes(uid) || (email !== undefined && allowlist.includes(email));
}
