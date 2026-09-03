/**
 * The developer entries in the game menu.
 *
 * What matters here is who sees them and what they cost. "Preview the win"
 * writes nothing — no completion, no mastery, no recap, nothing to sync —
 * which is the whole reason it is a preview rather than a solve, and the
 * reason it needs a test that reads the board rather than the animation.
 */

import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { newGame } from '../state/game';
import { DEFAULT_PROFILE } from '../state/mastery';
import { useProfile } from '../state/profile';
import { useGameStore } from '../state/store';
import type { LiveGame } from '../state/types';
import { GameView } from './GameView';

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

const account = { current: null as { uid: string; email: string | null; displayName: string | null } | null };

vi.mock('../state/account', () => ({
  useAccount: (select: (s: { account: unknown }) => unknown) => select({ account: account.current }),
  authAvailable: () => true,
}));

// The allowlist is read at module load from the environment, so the test
// stubs the decision rather than the variable.
const dev = vi.fn(() => false);
vi.mock('./devTools', () => ({ isDevUser: () => dev() }));

let counter = 0;

function makeGame(): LiveGame {
  return newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `dev-${counter++}`,
    running: true,
  });
}

const defaultMatchMedia = window.matchMedia;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = defaultMatchMedia;
  dev.mockReturnValue(false);
  account.current = null;
});

function renderGame(game: LiveGame = makeGame()) {
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });
  useProfile.setState((state) => ({ profile: { ...state.profile, locale: 'en' } }));

  function Host() {
    const live = useGameStore((state) =>
      state.activeGameId === null ? null : (state.games[state.activeGameId] ?? null),
    );
    if (live === null) return null;
    return (
      <GameView
        game={live}
        settings={{ ...DEFAULT_PROFILE.settings, haptics: false }}
        locale="en"
        onExit={() => undefined}
        onOpenSettings={() => undefined}
        onNewGame={() => undefined}
        onLearn={() => undefined}
      />
    );
  }

  render(
    <LocaleProvider locale="en">
      <Host />
    </LocaleProvider>,
  );
  return { user: userEvent.setup(), game };
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'This puzzle' }));
  return within(screen.getByRole('dialog'));
};

describe('the developer entries', () => {
  it('are absent for everyone else', async () => {
    const { user } = renderGame();
    const menu = await openMenu(user);

    expect(menu.queryByRole('button', { name: 'Preview the win' })).toBeNull();
    expect(menu.queryByRole('button', { name: 'Download diagnostics' })).toBeNull();
  });

  it('appear for a signed-in developer', async () => {
    dev.mockReturnValue(true);
    const { user } = renderGame();
    const menu = await openMenu(user);

    expect(menu.getByRole('button', { name: 'Preview the win' })).toBeInTheDocument();
    expect(menu.getByRole('button', { name: 'Download diagnostics' })).toBeInTheDocument();
  });

  it('play the celebration without completing anything', async () => {
    // The point of the whole design decision: a preview writes nothing, so
    // there is no completion to record and nothing to sync. Asserted on the
    // board and on the game, not on the animation.
    dev.mockReturnValue(true);
    const { user, game } = renderGame();
    const menu = await openMenu(user);
    await user.click(menu.getByRole('button', { name: 'Preview the win' }));

    const cell = document.querySelector('[data-cell="0"]');
    expect(cell?.className).toContain('cell-win');

    const stored = useGameStore.getState().games[game.id];
    expect(stored.completedAt).toBeNull();
    expect(stored.undoStack).toHaveLength(0);
    // And the board itself is untouched: the puzzle is not solved, it is lit.
    expect(stored.cells.filter((c) => c.value !== null && !c.given)).toHaveLength(0);
  });
});
