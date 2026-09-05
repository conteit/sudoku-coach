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

/**
 * A game stranded the way a real one strands: every empty cell filled from
 * the solution except r1c3 and r1c4, then r1c3 given r1c4's digit. r1c4's row
 * now wants only r1c3's digit and its column already holds it, so nothing can
 * go there.
 *
 * The 6 in r1c3 *does* conflict — with r2c1 (same box) and r5c3 (same column),
 * both of which hold 6. On a board this full it cannot not: every digit occurs
 * once per unit, so a wrong digit whose right home is one of the two empty
 * cells collides with the copy standing in every other unit. That is fine for
 * what these tests assert — the arming is driven by the dead end, not by the
 * conflict — but it means this fixture cannot speak for the case `deadEndCells`
 * exists for. `ruleCleanDeadEnd()` below is the one that does.
 */
function strandedGame(): LiveGame {
  let game = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `rewind-test-${counter++}`,
    running: true,
  });
  let at = 1100;
  for (let cell = 0; cell < 81; cell++) {
    if (PUZZLE[cell] !== '.' || cell === 2 || cell === 3) continue;
    game = reduce(game, {
      type: 'setValue',
      cell,
      digit: Number(SOLVED[cell]) as never,
      at: at++,
    });
  }
  game = reduce(game, { type: 'setValue', cell: 2, digit: Number(SOLVED[3]) as never, at: at++ });
  return game;
}

/**
 * A dead end reached by a placement that breaks no rule at all — the case
 * `deadEndCells` exists for, and the only one `Board.conflicts()` could never
 * stand in for.
 *
 * Three cells stay empty: r1c3 (2), r1c9 (8) and r2c3 (11). The solution puts
 * a 2 in the last two of those and a 4 in r1c3; the player puts the 2 in r1c3
 * instead. Every unit that would object to it has had its 2 emptied — row 1's
 * lives in r1c9, and the single cell that is both column 3's and box 1's lives
 * in r2c3 — so the placement duplicates nothing and no cell is coloured.
 *
 * Two cells are stranded by it. Row 1 is then short only a 4, so r1c9 must
 * take one, and column 9 already holds its 4 in r7c9. Row 2 is short only a 2,
 * so r2c3 must take one, and column 3 now holds the player's. Neither has a
 * digit left, and nothing on the board says so.
 */
function ruleCleanDeadEnd(): LiveGame {
  let game = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `rewind-test-${counter++}`,
    running: true,
  });
  let at = 1100;
  for (let cell = 0; cell < 81; cell++) {
    if (PUZZLE[cell] !== '.' || cell === 2 || cell === 8 || cell === 11) continue;
    game = reduce(game, {
      type: 'setValue',
      cell,
      digit: Number(SOLVED[cell]) as never,
      at: at++,
    });
  }
  return reduce(game, { type: 'setValue', cell: 2, digit: 2, at: at++ });
}

const SETTINGS: PlayerProfile['settings'] = { ...DEFAULT_PROFILE.settings, haptics: false };
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

/** Cells name themselves with `data-cell`, the same handle the e2e reads. */
function cell(index: number): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
}

function renderGame(game: LiveGame) {
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });
  useProfile.setState((state) => ({
    profile: { ...state.profile, locale: 'en', settings: SETTINGS },
  }));

  function Host() {
    const live = useGameStore((state) =>
      state.activeGameId === null ? null : (state.games[state.activeGameId] ?? null),
    );
    if (live === null) return null;
    return (
      <GameView
        game={live}
        settings={SETTINGS}
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

  return { user: userEvent.setup() };
}

describe('the amber rewind', () => {
  it('turns the undo key amber when the board cannot be finished', async () => {
    renderGame(strandedGame());

    expect(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    ).toBeTruthy();
  });

  it('arms on a dead end the rules cannot see, which is why it reads the solution and not the conflicts', async () => {
    renderGame(ruleCleanDeadEnd());

    // No peer holds the digit, so the conflict colour has nothing to say about
    // it — asserted first, because without this the test would pass just as
    // well against a `Board.conflicts()` implementation and would prove none of
    // what it claims.
    expect(cell(2).getAttribute('data-conflict')).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    ).toBeTruthy();
  });

  it('goes back to being undo on the press that removes the wrong digit', async () => {
    const { user } = renderGame(strandedGame());

    await user.click(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    );

    expect(await screen.findByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo — one of your digits is wrong' })).toBeNull();
  });

  it('redo puts the whole rewind back, for a player who was wrong about being wrong', async () => {
    // Stepping back is the ordinary undo, so every step lands on redoStack and
    // nothing about a rewind is one-way. This is why it needs no confirmation.
    const { user } = renderGame(strandedGame());
    const before = cell(2).textContent;

    await user.click(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    );
    await user.click(screen.getByRole('button', { name: 'Redo' }));

    expect(cell(2).textContent).toBe(before);
    expect(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    ).toBeTruthy();
  });

  it('leaves the undo key alone on an ordinary board', () => {
    const plain = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `rewind-test-${counter++}`,
      running: true,
    });
    renderGame(plain);

    expect(screen.queryByRole('button', { name: 'Undo — one of your digits is wrong' })).toBeNull();
  });

  it('does not arm merely because a digit is wrong — the board still plays', async () => {
    // SOLVED[2] is '4'; a 9 there contradicts the solution but strands nothing,
    // so the nudge is the right response and the rewind is not.
    const plain = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `rewind-test-${counter++}`,
      running: true,
    });
    const wrong = reduce(plain, { type: 'setValue', cell: 2, digit: 9, at: 1100 });
    renderGame(wrong);

    expect(screen.queryByRole('button', { name: 'Undo — one of your digits is wrong' })).toBeNull();
  });

  it('an ordinary undo during normal play raises no trail', async () => {
    const plain = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `rewind-test-${counter++}`,
      running: true,
    });
    const played = reduce(plain, { type: 'setValue', cell: 2, digit: 4, at: 1100 });
    const { user } = renderGame(played);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.queryByText(/what you undid/)).toBeNull();
  });
});
