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
    activeGameId: null,
    games: {},
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
vi.mock('./app/GameView', () => ({ GameView: () => <div>game</div> }));
vi.mock('./app/LearnView', () => ({ LearnView: () => <div>learn</div> }));
vi.mock('./app/LegalView', () => ({ LegalView: () => <div>legal</div> }));
vi.mock('./app/NewGameSheet', () => ({ NewGameSheet: () => null }));
vi.mock('./app/SettingsSheet', () => ({ SettingsSheet: () => null }));
vi.mock('./app/OfflineNotice', () => ({ OfflineNotice: () => null }));
vi.mock('./app/SyncNotice', () => ({ SyncNotice: () => <div>sync notice</div> }));

const { default: App } = await import('./App');

const at = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => {
  account.state.watch.mockClear();
  account.subscribe.mockClear();
  sync.state.hydrate.mockClear();
  sync.state.syncNow.mockClear();
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

  it('still reads the profile and the saved games, which are local', async () => {
    at('/');
    render(<App />);

    await waitFor(() => expect(profile.state.hydrate).toHaveBeenCalled());
    expect(games.state.hydrate).toHaveBeenCalled();
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
