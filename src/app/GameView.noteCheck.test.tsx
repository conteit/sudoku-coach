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
import { render, screen, within } from '@testing-library/react';
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

// Pinned to the phone tier rather than "matches nothing" (which
// `useViewportTier`'s own fallback reads as `tablet`): the sheet-vs-panel bug
// this file's reopen test exists to catch only exists on a phone, where the
// sheet IS the coach panel. Mirrors `useViewportTier.ts`'s own query string
// rather than a new one, the same reasoning `GameView.layout.test.tsx`'s
// `matchOnly` gives for doing the same thing.
const PHONE_QUERY = '(max-width: 639.98px)';

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_QUERY,
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
  it('applies the issues on screen, then ages the same report against the fixed board', async () => {
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

    await user.click(screen.getByRole('button', { name: /check notes/i }));
    expect(screen.getByRole('button', { name: 'Fix them all' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fix them all' }));

    // The impossible 5 is gone, and the cell now carries the marks it should.
    expect(cell(2).textContent).not.toContain('5');
    expect(cell(2).textContent).toContain('4');

    // The report is never re-run — it is aged. Every issue it originally
    // found was about r1c3, and the fix just applied settles every one of
    // them, so the aged reading says "All fixed" rather than the "exactly
    // right" a fresh, empty check would say. That distinction is the point of
    // this task: the list still shows what was found, struck through, not a
    // report that silently reset itself.
    expect(await screen.findByText('All fixed.')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /check notes/i }));
    await user.click(screen.getByRole('button', { name: 'Fix them all' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(cell(2).textContent).toContain('5');
  });
});

describe('the sheet as a viewport rather than a lifecycle event', () => {
  it('keeps the note check across closing and reopening the sheet', async () => {
    // On a phone the sheet IS the panel, so closing it must be a viewport
    // change and not a lifecycle event. This is the bug in one test: run a
    // check, close, reopen, and the reading must still be there.
    const { user } = renderGame();

    // `gameWithDeadNote` raises the `stale_marks` nudge (a placement just
    // killed a note), so the trigger button carries `coach.openWaiting`
    // rather than the plain `coach.open` — a regex over both rather than
    // pinning one, per `coach.open`/`coach.openWaiting` in `src/i18n/en.ts`.
    await user.click(screen.getByRole('button', { name: /^Coach/ }));
    await user.click(screen.getByRole('button', { name: 'Check notes' }));
    // r1c3 is the only noted cell on the board. The placement in r1c4 makes
    // its noted 9 invalid, and the check also finds a genuine 2 the player
    // never noted — two open issues, not a clean report. (Verified against
    // the rendered report rather than assumed: an earlier draft of this test
    // guessed "1 of 1" and the fixture actually produces "2 of 2".)
    const reading = screen.getByText('2 of 2 still to fix.');
    expect(reading).toBeInTheDocument();

    // Forcing the phone tier (see `beforeEach` above) makes the sheet a real
    // `dialog` with a backdrop button of its own, and both it and the
    // panel's own X share the accessible name "Close" — scoped to the
    // dialog to press the panel's, not the backdrop's.
    const dialog = screen.getByRole('dialog', { name: 'Coach' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: /^Coach/ }));

    expect(screen.getByText('2 of 2 still to fix.')).toBeInTheDocument();
  });
});
