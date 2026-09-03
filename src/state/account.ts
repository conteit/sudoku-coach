/**
 * Who is signed in, if anyone.
 *
 * Deliberately its own store rather than a field on `PlayerProfile`: an
 * account is not a coaching preference. `state/types.ts` is a frozen contract
 * and this needs none of it — the profile stays exactly what it was, which is
 * also what keeps signing out from touching a single saved game.
 *
 * **Auth is optional at every level.** Without the Firebase config in the
 * environment there is no sign-in — not a broken button, not an error, simply
 * a feature the build does not have. That is the local-first constraint taken
 * literally: an account is an addition, so its absence cannot be a failure.
 *
 * The Firebase SDK is loaded on demand, never at startup. It is a large
 * dependency in service of an optional feature, and a player who never signs
 * in should not pay for it — so the import lives inside `signIn`, and the
 * session restore that runs at boot only touches it when a config exists.
 */

import { create } from 'zustand';

export interface Account {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface AccountStore {
  /** Null when signed out, which is the default and a perfectly good state. */
  account: Account | null;
  /** False until the first auth answer arrives, so nothing flickers. */
  ready: boolean;
  /** A sign-in attempt is in flight. */
  busy: boolean;
  /** The last attempt failed. Not a dialog — a state Settings can show. */
  failed: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Restores an existing session. Safe to call when auth is unavailable. */
  watch: () => void;
}

/**
 * The config, or null when this build has none.
 *
 * Read once, at module load, from `import.meta.env` — Vite substitutes these
 * at build time, so a missing variable is a missing feature in that build
 * rather than something to check for at runtime.
 */
export function configFromEnv(env: Record<string, string | undefined>): FirebaseConfig | null {
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

export const FIREBASE_CONFIG = configFromEnv(
  import.meta.env as unknown as Record<string, string | undefined>,
);

/** Whether this build can offer sign-in at all. */
export const authAvailable = (): boolean => FIREBASE_CONFIG !== null;

/** The signed-in user, reduced to what the app actually uses. */
export const accountOf = (user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Account => ({ uid: user.uid, email: user.email, displayName: user.displayName });

export const createAccountStore = (config: FirebaseConfig | null = FIREBASE_CONFIG) =>
  create<AccountStore>()((set) => ({
    account: null,
    // Nothing to wait for when the build has no auth: `ready` is immediately
    // true so no screen sits behind a spinner for a feature that is absent.
    ready: config === null,
    busy: false,
    failed: false,

    watch: () => {
      if (config === null) return;
      void (async () => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const { authOf } = await import('./firebase');
        onAuthStateChanged(await authOf(config), (user) => {
          set({ account: user === null ? null : accountOf(user), ready: true });
        });
      })();
    },

    signIn: async () => {
      if (config === null) return;
      set({ busy: true, failed: false });
      try {
        const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
        const { authOf } = await import('./firebase');
        const result = await signInWithPopup(await authOf(config), new GoogleAuthProvider());
        set({ account: accountOf(result.user), busy: false, ready: true });
      } catch {
        // A closed popup is the most common "failure" here and is not an
        // error the player needs told about in those terms; Settings says
        // sign-in did not complete, and that is the whole report.
        set({ busy: false, failed: true });
      }
    },

    signOut: async () => {
      if (config === null) return;
      const { signOut } = await import('firebase/auth');
      const { authOf } = await import('./firebase');
      await signOut(await authOf(config));
      // Local data is untouched, on purpose and by contract: signing out
      // stops syncing, it does not take the player's games away.
      set({ account: null, failed: false });
    },
  }));

export const useAccount = createAccountStore();
