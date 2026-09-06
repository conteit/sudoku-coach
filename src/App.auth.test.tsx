/**
 * Which routes are allowed to touch Google.
 *
 * The landing page used to. A restored session on `/` fired a sync, a sync
 * asked for an access token, and a token request opens a popup — so reading
 * the front page could throw a sign-in window at a visitor who had asked for
 * nothing, and an anonymous reader initialised Firebase and reached Google
 * before touching a control, which is not what `/privacy` says the app does.
 *
 * Asserted here rather than in an e2e because the e2e build has no Firebase
 * config at all: every "no auth on the landing page" assertion passes there
 * whatever the code does, which is the same trap as a test that passes with
 * the fix deleted. Mocking the stores is what makes the claim mean something.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({
  state: {
    account: null as { uid: string; email: string | null; displayName: string | null } | null,
    ready: true,
    busy: false,
    failed: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    watch: vi.fn(),
  },
  subscribe: vi.fn(() => () => undefined),
}));

const sync = vi.hoisted(() => ({
  state: {
    enabled: false,
    status: 'off' as const,
    lastSyncedAt: null,
    hydrate: vi.fn(async () => undefined),
    enable: vi.fn(),
    disable: vi.fn(),
    syncNow: vi.fn(async () => undefined),
    seen: vi.fn(),
    forget: vi.fn(),
  },
}));

vi.mock('./state/account', () => ({
  authAvailable: () => true,
  accountOf: (user: unknown) => user,
  useAccount: Object.assign((select: (s: unknown) => unknown) => select(account.state), {
    getState: () => account.state,
    subscribe: account.subscribe,
  }),
}));

vi.mock('./sync/store', () => ({
  useSync: Object.assign((select: (s: unknown) => unknown) => select(sync.state), {
    getState: () => sync.state,
  }),
}));

const profile = vi.hoisted(() => ({
  state: {
    profile: {
      id: 'profile' as const,
      locale: 'en' as const,
      mastery: {},
      settings: { theme: 'system' as const },
    },
    hydrated: true,
    hydrate: vi.fn(async () => undefined),
    setLocale: vi.fn(),
    setSettings: vi.fn(),
  },
}));

vi.mock('./state/profile', () => ({
  useProfile: Object.assign((select: (s: unknown) => unknown) => select(profile.state), {
    getState: () => profile.state,
  }),
}));

const games = vi.hoisted(() => ({
  state: {
    hydrated: true,
    summaries: [],
    activeGameId: null as string | null,
    games: {} as Record<string, unknown>,
    hydrate: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
    startGame: vi.fn(async () => 'g1'),
    openGame: vi.fn(),
    closeGame: vi.fn(),
    dispatch: vi.fn(),
  },
}));

vi.mock('./state/store', () => ({
  useGameStore: Object.assign((select: (s: unknown) => unknown) => select(games.state), {
    getState: () => games.state,
  }),
}));

vi.mock('./state/db', () => ({
  watchDatabaseBlock: (watch: (state: string) => void) => {
    watch('none');
    return () => undefined;
  },
}));

// The screens themselves are not what is under test, and two of them want a
// generator worker.
vi.mock('./app/LandingView', () => ({ LandingView: () => <div>landing</div> }));
vi.mock('./app/LibraryView', () => ({ LibraryView: () => <div>library</div> }));
vi.mock('./app/GameView', () => ({
  GameView: ({ onExit }: { onExit: () => void }) => (
    <div>
      game<button onClick={onExit}>leave</button>
    </div>
  ),
}));
vi.mock('./app/LearnView', () => ({ LearnView: () => <div>learn</div> }));
vi.mock('./app/LegalView', () => ({ LegalView: () => <div>legal</div> }));
vi.mock('./app/NewGameSheet', () => ({ NewGameSheet: () => null }));
vi.mock('./app/SettingsSheet', () => ({ SettingsSheet: () => null }));
vi.mock('./app/OfflineNotice', () => ({ OfflineNotice: () => null }));
vi.mock('./app/SyncNotice', () => ({ SyncNotice: () => <div>sync notice</div> }));
vi.mock('./app/SyncToast', () => ({ SyncToast: () => null }));

const { default: App } = await import('./App');

const at = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => {
  account.state.watch.mockClear();
  account.subscribe.mockClear();
  sync.state.hydrate.mockClear();
  sync.state.syncNow.mockClear();
  profile.state.hydrate.mockClear();
  games.state.hydrate.mockClear();
  sync.state.seen.mockClear();
  games.state.activeGameId = null;
  games.state.games = {};
});

afterEach(() => at('/'));

describe('what the landing page is allowed to start', () => {
  it('does not restore a session, and does not sync', async () => {
    at('/');
    render(<App />);

    await screen.findByText('landing');
    expect(account.state.watch).not.toHaveBeenCalled();
    expect(sync.state.hydrate).not.toHaveBeenCalled();
    expect(account.subscribe).not.toHaveBeenCalled();
  });

  it.each(['/privacy', '/terms'])('leaves %s alone too', async (path) => {
    // These are read by people deciding whether to sign in at all. Touching
    // Google to render them would be its own small joke.
    at(path);
    render(<App />);

    await screen.findByText('legal');
    expect(account.state.watch).not.toHaveBeenCalled();
    expect(sync.state.hydrate).not.toHaveBeenCalled();
  });

  it('does not open the database either', async () => {
    // The day's board comes from the date's own seed and the page writes
    // nothing, so there is nothing here for a database to be needed for —
    // and opening one only creates a way for this page to fail.
    at('/');
    render(<App />);

    await screen.findByText('landing');
    expect(profile.state.hydrate).not.toHaveBeenCalled();
    expect(games.state.hydrate).not.toHaveBeenCalled();
  });
});

describe('what the app starts', () => {
  it('restores the session and boots sync on /play', async () => {
    at('/play');
    render(<App />);

    await screen.findByText('library');
    await waitFor(() => expect(account.state.watch).toHaveBeenCalled());
    expect(sync.state.hydrate).toHaveBeenCalled();
    expect(account.subscribe).toHaveBeenCalled();
    // And the storage the app is actually made of.
    expect(profile.state.hydrate).toHaveBeenCalled();
    expect(games.state.hydrate).toHaveBeenCalled();
  });

  it('does not leave an unhandled rejection when the sync record fails to load', async () => {
    // Issue #126: a rejected read of the sync record (a Dexie open that
    // never opens is the mechanism, but any rejection has the same shape)
    // used to be an unhandled rejection nobody saw. Vitest fails a run that
    // produces one — but only for a *real* rejection: `vi.fn().mockRejectedValueOnce`
    // has its own internal `.then` for call-result tracking, which quietly
    // counts as "handled" no matter what App.tsx does, so it cannot exercise
    // this claim. A plain function standing in for one call is what makes
    // the assertion mean something.
    let called = false;
    const original = sync.state.hydrate;
    sync.state.hydrate = (() => {
      called = true;
      return Promise.reject(new Error('dexie blocked'));
    }) as typeof sync.state.hydrate;

    try {
      at('/play');
      render(<App />);

      await screen.findByText('library');
      await waitFor(() => expect(called).toBe(true));
      // Give the rejected promise a turn of the event loop to surface as an
      // unhandled rejection if nothing is catching it.
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      sync.state.hydrate = original;
    }
  });

  it('bootstraps sync once a load, not once a visit', async () => {
    // Bouncing between the front door and the board is not a reason to ask
    // Google for another token — and a token request is what opens a popup.
    at('/play');
    const { rerender } = render(<App />);
    await screen.findByText('library');

    at('/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    rerender(<App />);
    await screen.findByText('landing');

    at('/play');
    window.dispatchEvent(new PopStateEvent('popstate'));
    rerender(<App />);
    await screen.findByText('library');

    expect(sync.state.hydrate).toHaveBeenCalledTimes(1);
  });
});

/**
 * The library's arrival dot means "this came from another device and you have
 * not opened it". Two paths reach a game without a tap on its row, which is
 * the only thing that used to clear one: the app restoring the last game at
 * launch, and an arrival landing while that game is already open. Both leave
 * a dot on a game the player has been looking at. Wired here because App is
 * where the two stores meet — neither can see the other on its own.
 */
describe('the arrival dot on a game the player is already in', () => {
  it('clears for the game restored at launch', async () => {
    const original = games.state.hydrate;
    games.state.hydrate = vi.fn(async () => {
      games.state.activeGameId = 'g7';
    });
    try {
      at('/play');
      render(<App />);

      await screen.findByText('library');
      await waitFor(() => expect(sync.state.seen).toHaveBeenCalledWith('g7'));
    } finally {
      games.state.hydrate = original;
    }
  });

  it('clears for the game the player leaves, for an arrival that landed while it was open', async () => {
    games.state.activeGameId = 'g7';
    games.state.games = { g7: { id: 'g7' } };
    at('/play');
    render(<App />);

    // The mount's own hydrate already calls `seen('g7')` for the boot race, so
    // without this the assertion below passes on that call and proves nothing
    // about leaving — the test stayed green with the leave-side call deleted.
    await waitFor(() => expect(sync.state.seen).toHaveBeenCalled());
    (sync.state.seen as ReturnType<typeof vi.fn>).mockClear();

    await userEvent.click(await screen.findByRole('button', { name: 'leave' }));

    expect(sync.state.seen).toHaveBeenCalledWith('g7');
    expect(games.state.closeGame).toHaveBeenCalled();
  });
});
