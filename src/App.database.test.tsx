/**
 * What survives a database that cannot be read.
 *
 * A blocked IndexedDB upgrade left `open()` pending forever and took the whole
 * app down with it — the 2026-09-03 incident. #100 turned the silence into a
 * message. This is the other half of that: the front door and the legal pages
 * are not made of stored state at all, so they should not be casualties of it.
 * The landing board comes from the day's seed and the documents are authored
 * text; the only thing either wants from the profile is a language, and there
 * is a perfectly good fallback for that in the browser.
 *
 * The privacy policy is the sharpest case. Google's consent screen links to
 * it, so it is read by people who have never opened the app, on machines whose
 * database state is nobody's business.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ block: 'none' as 'none' | 'blocked' | 'superseded' }));
const profile = vi.hoisted(() => ({
  hydrated: true,
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

vi.mock('./state/db', () => ({
  watchDatabaseBlock: (watch: (state: string) => void) => {
    watch(db.block);
    return () => undefined;
  },
}));
vi.mock('./state/profile', () => ({
  useProfile: Object.assign((select: (s: unknown) => unknown) => select(profile.state), {
    getState: () => profile.state,
  }),
}));
vi.mock('./state/store', () => ({
  useGameStore: Object.assign((select: (s: unknown) => unknown) => select(games.state), {
    getState: () => games.state,
  }),
}));
vi.mock('./state/account', () => ({
  authAvailable: () => false,
  useAccount: Object.assign((select: (s: unknown) => unknown) => select({ account: null }), {
    getState: () => ({ account: null, watch: vi.fn() }),
    subscribe: () => () => undefined,
  }),
}));
vi.mock('./sync/store', () => ({
  useSync: Object.assign((select: (s: unknown) => unknown) => select({ enabled: false, status: 'off' }), {
    getState: () => ({ hydrate: vi.fn(), syncNow: vi.fn(), forget: vi.fn() }),
  }),
}));

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

/** Stands in for the taster: a button that hands a played board to the shell. */
vi.mock('./app/LandingView', () => ({
  LandingView: ({ onStart }: { onStart: (t: unknown) => void }) => (
    <div>
      landing
      <button
        type="button"
        onClick={() =>
          onStart({
            puzzle: { givens: PUZZLE, solution: PUZZLE, difficulty: 'easy' },
            entries: new Array(81).fill(null),
          })
        }
      >
        start with board
      </button>
    </div>
  ),
}));
vi.mock('./app/LibraryView', () => ({ LibraryView: () => <div>library</div> }));
vi.mock('./app/GameView', () => ({ GameView: () => <div>game</div> }));
vi.mock('./app/LearnView', () => ({ LearnView: () => <div>learn</div> }));
vi.mock('./app/NewGameSheet', () => ({ NewGameSheet: () => null }));
vi.mock('./app/SettingsSheet', () => ({ SettingsSheet: () => null }));
vi.mock('./app/OfflineNotice', () => ({ OfflineNotice: () => null }));
vi.mock('./app/SyncNotice', () => ({ SyncNotice: () => null }));

const { default: App } = await import('./App');

const at = (path: string) => window.history.replaceState(null, '', path);

/** A database that never answers: hydration simply never completes. */
const unreadable = () => {
  db.block = 'blocked';
  profile.state.hydrated = false;
  games.state.hydrated = false;
};

beforeEach(() => {
  db.block = 'none';
  games.state.startGame.mockReset().mockResolvedValue('g1');
  profile.state.hydrate.mockReset().mockResolvedValue(undefined);
  games.state.hydrate.mockReset().mockResolvedValue(undefined);
  profile.state.hydrated = true;
  games.state.hydrated = true;
});

afterEach(() => at('/'));

describe('when the database cannot be read', () => {
  it('still opens the front door', async () => {
    unreadable();
    at('/');
    render(<App />);

    expect(await screen.findByText('landing')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['/privacy', '/terms'])('still serves %s, which Google links to', async (path) => {
    unreadable();
    at(path);
    render(<App />);

    // Rendered from authored text and the address alone.
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so on the app itself, where the stored games actually are', async () => {
    unreadable();
    at('/play');
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/another tab|installed app/i);
    expect(screen.queryByText('library')).toBeNull();
  });

  it('falls back to the browser language rather than waiting for a stored one', async () => {
    unreadable();
    at('/privacy');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['it-IT', 'it']);
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/Ultimo aggiornamento/)).toBeInTheDocument();
  });
});

describe('the hand-off from the front door', () => {
  it('parks the board and writes it once the app has storage open', async () => {
    // The landing page has no database open to save into — that is the point
    // of it not having one — so the board is carried across and written on
    // arrival rather than at the moment it is handed over.
    at('/');
    games.state.hydrated = false;
    const user = userEvent.setup();
    const { rerender } = render(<App />);

    await user.click(await screen.findByRole('button', { name: 'start with board' }));
    expect(games.state.startGame).not.toHaveBeenCalled();

    games.state.hydrated = true;
    rerender(<App />);
    await waitFor(() => expect(games.state.startGame).toHaveBeenCalledTimes(1));
  });

  it('explains it, with a way out, when that write fails', async () => {
    // Paolo's rule for this transition: a failure gets a message and a way to
    // unlock it, not a board that silently never appears.
    games.state.startGame.mockRejectedValueOnce(new Error('no storage'));
    at('/');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'start with board' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot reach its storage/i);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});

describe('when opening storage fails outright', () => {
  it('says so on the app, and offers a way to try again', async () => {
    profile.state.hydrate.mockRejectedValueOnce(new Error('private window'));
    at('/play');
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot reach its storage/i);
    expect(alert).toHaveTextContent(/reload to try again/i);
  });

  it('leaves the front door open even then', async () => {
    profile.state.hydrate.mockRejectedValue(new Error('private window'));
    at('/');
    render(<App />);

    expect(await screen.findByText('landing')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('when the database is merely slow', () => {
  it('holds the app, because a first paint in the wrong language is worse', async () => {
    // The original rule, kept — and now scoped to the screens it was written
    // for rather than applied to pages with no stored language to wait for.
    profile.state.hydrated = false;
    at('/play');
    const { container } = render(<App />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('library')).toBeNull();
  });

  it('never holds the front door, which reads nothing and so waits for nothing', async () => {
    // The regression the e2e caught and the mocks hid: hydration was removed
    // from the landing page while the gate still waited for it, so the front
    // door sat on the loading placeholder for good.
    profile.state.hydrated = false;
    games.state.hydrated = false;
    at('/');
    const { container } = render(<App />);

    expect(await screen.findByText('landing')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it.each(['/privacy', '/terms'])('never holds %s either', async (path) => {
    profile.state.hydrated = false;
    games.state.hydrated = false;
    at(path);
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('does hold the app for it', async () => {
    games.state.hydrated = false;
    at('/play');
    const { container } = render(<App />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('library')).toBeNull();
  });
});
