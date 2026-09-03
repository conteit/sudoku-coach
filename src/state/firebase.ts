/**
 * The Firebase app, created once and only if someone asks.
 *
 * Split from `account.ts` so that store can be tested without the SDK in the
 * room: everything here is initialisation, and everything there is a rule.
 */

import type { Auth } from 'firebase/auth';
import type { FirebaseConfig } from './account';

let auth: Promise<Auth> | null = null;

/** Initialises on first use and reuses it after — Firebase throws on a second app. */
export function authOf(config: FirebaseConfig): Promise<Auth> {
  auth ??= (async () => {
    const { initializeApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    return getAuth(initializeApp(config));
  })();
  return auth;
}
