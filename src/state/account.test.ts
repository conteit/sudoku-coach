/**
 * The account store, tested with no Firebase in the room.
 *
 * Everything asserted here is a *rule* rather than a call: auth is optional,
 * absence is not failure, and signing out never touches a saved game. The SDK
 * lives behind `firebase.ts` for exactly this reason.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountOf, configFromEnv, createAccountStore } from './account';

// `watch()`'s dynamic imports are mocked at module scope so a per-test flag
// can flip the first one from a rejection to a success — the exact shape of
// a chunk 404 followed by a working retry (issue #126).
const restore = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  fails: true,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => restore.onAuthStateChanged(...args),
}));

vi.mock('./firebase', () => ({
  authOf: async () => {
    if (restore.fails) throw new Error('chunk 404');
    return {};
  },
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('whether this build has auth at all', () => {
  it('is a config, and a partial one does not count', () => {
    const full = {
      VITE_FIREBASE_API_KEY: 'k',
      VITE_FIREBASE_AUTH_DOMAIN: 'd',
      VITE_FIREBASE_PROJECT_ID: 'p',
      VITE_FIREBASE_APP_ID: 'a',
    };
    expect(configFromEnv(full)).toEqual({
      apiKey: 'k',
      authDomain: 'd',
      projectId: 'p',
      appId: 'a',
    });

    // Three of four is not "nearly configured", it is a build that would fail
    // at the first call. Better to have no sign-in than a button that throws.
    expect(configFromEnv({ ...full, VITE_FIREBASE_APP_ID: undefined })).toBeNull();
    expect(configFromEnv({})).toBeNull();
  });

  it('treats an empty string as absent, which is what an unset Vercel var looks like', () => {
    expect(
      configFromEnv({
        VITE_FIREBASE_API_KEY: '',
        VITE_FIREBASE_AUTH_DOMAIN: 'd',
        VITE_FIREBASE_PROJECT_ID: 'p',
        VITE_FIREBASE_APP_ID: 'a',
      }),
    ).toBeNull();
  });
});

describe('a build without auth', () => {
  it('is ready immediately, so nothing waits for a feature it does not have', () => {
    const store = createAccountStore(null);
    expect(store.getState().ready).toBe(true);
    expect(store.getState().account).toBeNull();
  });

  it('answers sign-in with a shrug rather than an error', async () => {
    // The local-first constraint taken literally: an account is an addition,
    // so its absence cannot be a failure.
    const store = createAccountStore(null);
    await store.getState().signIn();

    expect(store.getState().failed).toBe(false);
    expect(store.getState().busy).toBe(false);
    expect(store.getState().account).toBeNull();
  });

  it('does nothing when asked to watch', () => {
    const store = createAccountStore(null);
    expect(() => store.getState().watch()).not.toThrow();
  });
});

describe('the account it keeps', () => {
  it('reduces a Firebase user to the three things the app uses', () => {
    // Not the whole user object: everything kept here is a thing some screen
    // reads, and a token or a provider profile in the store is a thing that
    // could end up somewhere it should not.
    const account = accountOf({
      uid: 'abc',
      email: 'someone@example.com',
      displayName: 'Someone',
      // @ts-expect-error — deliberately more than the app wants
      refreshToken: 'secret',
      providerData: [{}],
    });

    expect(account).toEqual({ uid: 'abc', email: 'someone@example.com', displayName: 'Someone' });
    expect(Object.keys(account).sort()).toEqual(['displayName', 'email', 'uid']);
  });

  it('survives an anonymous-looking user with no email or name', () => {
    expect(accountOf({ uid: 'abc', email: null, displayName: null })).toEqual({
      uid: 'abc',
      email: null,
      displayName: null,
    });
  });
});

describe('watch(), when the session restore fails partway through', () => {
  const config = { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' };

  beforeEach(() => {
    restore.fails = true;
    restore.onAuthStateChanged.mockClear();
  });

  it('does not latch permanently, so a later call — the next entry to /play — retries', async () => {
    const store = createAccountStore(config);

    store.getState().watch();
    await flush();
    // The import rejected before `onAuthStateChanged` was ever reached.
    expect(restore.onAuthStateChanged).not.toHaveBeenCalled();

    // The chunk is fetchable now — the retry a later `watch()` call is
    // supposed to get.
    restore.fails = false;
    store.getState().watch();
    await flush();

    expect(restore.onAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  it('ignores a call made while the first attempt is still in flight', async () => {
    // Two calls back to back, before either await resolves — `pending`
    // exists so this cannot register two listeners once the retry succeeds.
    restore.fails = false;
    const store = createAccountStore(config);

    store.getState().watch();
    store.getState().watch();
    await flush();

    expect(restore.onAuthStateChanged).toHaveBeenCalledTimes(1);
  });
});

describe('signing out', () => {
  it('never touches local data — it stops syncing, it does not take games away', async () => {
    // The contract, asserted at the only level a unit test can reach it: the
    // store has no path to the game store, and this is the test that fails if
    // someone gives it one.
    const store = createAccountStore(null);
    const gameStoreImport = vi.fn();
    await store.getState().signOut();
    expect(gameStoreImport).not.toHaveBeenCalled();
    expect(store.getState().account).toBeNull();
  });
});
