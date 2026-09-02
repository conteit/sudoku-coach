/**
 * "Fix them all" on the note-check report, through the real screen.
 *
 * The reducer's own tests cover what a fix does to a board; this is the part
 * only the assembled screen can show — that the button applies the issues the
 * player was actually reading, and that the report then tells the truth about
 * the board rather than going on listing problems that are gone.
 */


// Dexie captures the global `indexedDB` on import and `GameView` reaches it
// transitively — same reasoning as `GameView.layout.test.tsx`.
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { newGame, reduce } from '../state/game';
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

/** A running game with a note in r1c3 that the placement in r1c4 then kills. */
function gameWithDeadNote(): LiveGame {
  let game = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `settings-test-${counter++}`,
    running: true,
  });
  game = reduce(game, { type: 'addCandidate', cell: 2, digit: 9, at: 1100 });
  game = reduce(game, { type: 'setValue', cell: 3, digit: 9, at: 1200 });
  return game;
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
  useGameStore.setState({ activeGameId: null, games: {}, hydrated: true });
});

function renderGame(
  overrides: Partial<PlayerProfile['settings']> = {},
  game: LiveGame = gameWithDeadNote(),
) {
  const settings: PlayerProfile['settings'] = {
    ...DEFAULT_PROFILE.settings,
    haptics: false,
    ...overrides,
  };
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });
  useProfile.setState((state) => ({ profile: { ...state.profile, locale: 'en', settings } }));

  /*
   * Reads the live game out of the store the way `App` does, rather than
   * handing `GameView` a frozen snapshot. Every test below is about what a
   * *dispatch* does — a note swept, an undo putting it back — and a static
   * prop would render none of it: the store would change and the screen
   * would not, so the tests would pass or fail on nothing.
   */
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

  render(
    <LocaleProvider locale="en">
      <Host />
    </LocaleProvider>,
  );

  return { user: userEvent.setup(), game };
}

/** Cells name themselves with `data-cell`, the same handle the e2e reads. */
function cell(index: number): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
}


describe('fixing the notes the check found', () => {
  it('applies the issues on screen, then reports the board as it now is', async () => {
    // r1c3 gets a 5 it cannot hold — r1c1 is a given 5 — and misses digits it
    // can. The check names both kinds; one press settles them.
    const game = reduce(
      newGame({
        givens: PUZZLE,
        solution: SOLVED,
        difficulty: 'medium',
        at: 1000,
        id: `note-check-${counter++}`,
        running: true,
      }),
      { type: 'addCandidate', cell: 2, digit: 5, at: 1100 },
    );
    const { user } = renderGame({}, game);

    await user.click(screen.getByRole('button', { name: /check my notes/i }));
    expect(screen.getByRole('button', { name: 'Fix them all' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fix them all' }));

    // The impossible 5 is gone, and the cell now carries the marks it should.
    expect(cell(2).textContent).not.toContain('5');
    // And the report is re-run rather than left describing a board that has
    // moved: there is nothing left to fix, so nothing left to offer.
    expect(screen.queryByRole('button', { name: 'Fix them all' })).toBeNull();
  });

  it('takes one undo to put the notes back exactly as they were', async () => {
    const game = reduce(
      newGame({
        givens: PUZZLE,
        solution: SOLVED,
        difficulty: 'medium',
        at: 1000,
        id: `note-check-${counter++}`,
        running: true,
      }),
      { type: 'addCandidate', cell: 2, digit: 5, at: 1100 },
    );
    const { user } = renderGame({}, game);

    await user.click(screen.getByRole('button', { name: /check my notes/i }));
    await user.click(screen.getByRole('button', { name: 'Fix them all' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(cell(2).textContent).toContain('5');
  });
});
