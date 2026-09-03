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
  /*
   * The wait is a second over the default, not because this is slow — a check
   * sweeps the detector catalog in 2-7ms — but because it renders the whole
   * game screen twice over. An earlier version of this test carried fifteen
   * seconds, on a diagnosis of "CI is loaded" that turned out to be wrong
   * twice: what actually failed was a race in the re-check and a fixture that
   * emptied the only noted cell. Both are fixed; the budget goes back to
   * something ordinary, so the next real failure fails fast.
   */
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
    // A second, *legitimate* note in the same cell — 4 is r1c3's solution
    // digit, so nothing rules it out. Without it, fixing empties the only
    // noted cell on the board and the panel correctly reports "nothing to
    // check" rather than "exactly right": a check of no notes is not a clean
    // check. The fixture, not the app, was wrong.
    const withBoth = reduce(game, { type: 'addCandidate', cell: 2, digit: 4, at: 1150 });
    const { user } = renderGame({}, withBoth);

    await user.click(screen.getByRole('button', { name: /check my notes/i }));
    expect(screen.getByRole('button', { name: 'Fix them all' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fix them all' }));

    // The impossible 5 is gone, and the cell now carries the marks it should.
    expect(cell(2).textContent).not.toContain('5');
    expect(cell(2).textContent).toContain('4');

    // And the report is re-run rather than left describing a board that has
    // moved. Awaited, because the re-check is deliberately deferred a render:
    // `checkMarks` closes over the board of the render it came from, so it
    // has to wait for the one holding the fixed board. Asserting the button's
    // absence synchronously passed on a fast machine and failed on CI — the
    // wait is the honest reading of a re-check that was never synchronous.
    expect(
      await screen.findByText(/notes are exactly right/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fix them all' })).toBeNull();
  }, 10_000);

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
