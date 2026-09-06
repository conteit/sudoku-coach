/**
 * The idle timer: a board nobody has touched for `DEFAULT_STUCK_MS` stops
 * counting instead of accruing thinking time nobody spent.
 *
 * These are store tests wearing a component, not screen tests — the claim is
 * about what a dispatch does to `runningSince`, so the `Host` below reads the
 * live game back out of the store (copied from `GameView.promote.test.tsx`)
 * rather than trusting the prop `GameView` was first handed, which would
 * still read stale after the reducer moved on.
 */

// Dexie captures the global `indexedDB` on import and `GameView` reaches it
// transitively — same reasoning as `GameView.layout.test.tsx`.
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STUCK_MS } from '../coach/triggers';
import { LocaleProvider } from '../i18n/react';
import { newGame } from '../state/game';
import { DEFAULT_PROFILE } from '../state/mastery';
import { useProfile } from '../state/profile';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { GameView } from './GameView';

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

let counter = 0;

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
  useGameStore.setState({ activeGameId: null, games: {}, hydrated: true });
  vi.useRealTimers();
});

/** A running game, its clock anchored at a known, non-real-world instant. */
function freshGame(): LiveGame {
  return newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `idle-test-${counter++}`,
    running: true,
  });
}

function renderGame(game: LiveGame) {
  const settings: PlayerProfile['settings'] = { ...DEFAULT_PROFILE.settings, haptics: false };
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });
  useProfile.setState((state) => ({ profile: { ...state.profile, locale: 'en', settings } }));

  function Host() {
    const live = useGameStore((state) =>
      state.activeGameId === null ? null : (state.games[state.activeGameId] ?? null),
    );
    if (live === null) return null;
    return (
      <GameView
        game={live}
        settings={settings}
        locale="en"
        onExit={() => undefined}
        onOpenSettings={() => undefined}
        onNewGame={() => undefined}
        onLearn={() => undefined}
      />
    );
  }

  const { unmount } = render(
    <LocaleProvider locale="en">
      <Host />
    </LocaleProvider>,
  );

  return { unmount };
}

/** Cells name themselves with `data-cell`, the same handle the e2e reads. */
function cell(index: number): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
}

/** Read off the store, not the screen — the clock's display is not the subject. */
function liveGame(id: string): LiveGame {
  const game = useGameStore.getState().games[id];
  if (game === undefined) throw new Error(`no game ${id} in the store`);
  return game;
}

/**
 * Selects r1c3 (empty in `PUZZLE`) and places digit 4 in it — a real move,
 * not a mere selection, because the claim under test ("an interaction starts
 * the clock again") is specifically that a *dispatch* resumes it, not that
 * looking at the board does.
 */
function placeADigit(): void {
  fireEvent.pointerDown(cell(2), { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(cell(2));
  fireEvent.click(screen.getByRole('button', { name: 'Place 4' }));
}

describe('the idle timer', () => {
  it('stops the clock after no interaction for DEFAULT_STUCK_MS', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const game = freshGame();
    renderGame(game);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_STUCK_MS);
    });

    const after = liveGame(game.id);
    expect(after.runningSince).toBeNull();
    // Folded, not discarded — `idle` draws the same distinction `tick` does.
    expect(after.elapsedMs).toBe(DEFAULT_STUCK_MS);
  });

  it('does not stop the clock when the player acts before the threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const game = freshGame();
    renderGame(game);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_STUCK_MS - 1000);
    });
    placeADigit();
    // Well past the *original* threshold, but under a full threshold since
    // the move above reset it.
    act(() => {
      vi.advanceTimersByTime(DEFAULT_STUCK_MS - 1000);
    });

    expect(liveGame(game.id).runningSince).not.toBeNull();
  });

  it('starts the clock again on the first interaction after it stopped', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const game = freshGame();
    renderGame(game);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_STUCK_MS);
    });
    expect(liveGame(game.id).runningSince).toBeNull();

    placeADigit();

    // `dispatchMove` resumes before it does its own work, stamped with
    // `Date.now()` at the click — which fake timers have carried to exactly
    // one threshold past the start.
    expect(liveGame(game.id).runningSince).toBe(1000 + DEFAULT_STUCK_MS);
  });

  it('leaves the board unblurred and offers no Resume panel while merely idle', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const game = freshGame();
    renderGame(game);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_STUCK_MS);
    });
    expect(liveGame(game.id).runningSince).toBeNull();

    // The deliberate-pause styling is keyed on the player's own act, not on
    // the clock being stopped — idling must never reach it (design
    // correction to this task).
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    expect(screen.getByRole('grid').className).not.toMatch(/blur-md/);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('dispatches nothing if the screen is gone before the threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const game = freshGame();
    const { unmount } = renderGame(game);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_STUCK_MS - 1000);
    });
    unmount();
    // Well past what would have been the threshold, had the screen stayed.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const after = liveGame(game.id);
    expect(after.runningSince).not.toBeNull();
    expect(after.elapsedMs).toBe(0);
  });
});
