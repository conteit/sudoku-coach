/**
 * The board's colouring, and what the app is allowed to do to the player's
 * notes on its own.
 *
 * Paolo asked for the same switch the conflict flagging has to cover the rest
 * of the colour on the board: the green same-digit layer, the peer shading,
 * the dead-note strike-through, and the blue his own entries are drawn in.
 * Each defaults on — these exist to be turned *off*, not to introduce
 * anything — and each is asserted in both positions, because a toggle tested
 * only in the state it ships in is a toggle nothing is holding.
 *
 * `autoClearDeadNotes` is the one that is off by default, and the reason is
 * invariant 1 rather than taste: the app does not edit a player's marks
 * unless it is asked to. Turning it on is that request.
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

/**
 * A running game with one *correct* player entry in r1c6.
 *
 * Correct on purpose: a wrong digit is drawn in the conflict colour, which
 * outranks the entry colour in `Cell`'s own hierarchy, so a test written on
 * a conflicting entry would be asserting about the wrong layer entirely.
 */
function gameWithEntry(): LiveGame {
  const game = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `settings-test-${counter++}`,
    running: true,
  });
  return reduce(game, { type: 'setValue', cell: 5, digit: 8, at: 1100 });
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

describe('the dead-note flag', () => {
  it('strikes the killed note through, and offers the clear, by default', () => {
    renderGame();

    expect(cell(2).querySelector('[data-stale]')).not.toBeNull();
    expect(
      within(screen.getByRole('group', { name: /^Keypad/ })).getByRole('button', {
        name: /^clear dead notes$/i,
      }),
    ).toBeInTheDocument();
  });

  it('flags them nowhere at all when it is off', () => {
    // Off has to mean the whole apparatus, not just the strike-through: a
    // key offering to clear something the board never marked is a control
    // with no visible referent.
    renderGame({ markDeadNotes: false });

    expect(cell(2).querySelector('[data-stale]')).toBeNull();
    expect(
      within(screen.getByRole('group', { name: /^Keypad/ })).getByRole('button', {
        name: 'Erase cell',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear .*dead notes?/i })).toBeNull();
  });
});

describe('the board colouring', () => {
  it('draws the player entries in the entry colour by default', () => {
    renderGame({}, gameWithEntry());
    expect(cell(5).querySelector('.text-entry')).not.toBeNull();
  });

  it('drops the entry colour when asked, and keeps the weight that replaces it', () => {
    // Colour is never the only signal — an entry stays 200 weight units
    // lighter than a given — so turning the colour off leaves a board that
    // is still readable in greyscale, which is the whole reason the weight
    // is there.
    renderGame({ colorEntries: false }, gameWithEntry());

    const digit = cell(5).querySelector('.digit');
    expect(digit).not.toBeNull();
    expect(digit!.className).not.toContain('text-entry');
    expect(digit!.className).toContain('font-[440]');
  });

  it('shades the selection\'s peers by default, and stops when told to', async () => {
    const { user } = renderGame();
    await user.click(cell(2));
    // r1c1 shares row 1 with r1c3, so it is a peer of the selection.
    expect(cell(0).className).toContain('bg-paper-sunk');
  });

  it('leaves the peers alone with the shading off', async () => {
    const { user } = renderGame({ highlightPeers: false });
    await user.click(cell(2));

    expect(cell(0).className).not.toContain('bg-paper-sunk');
  });

  it('lights every instance of a tapped digit by default', async () => {
    // Tapping a placed digit arms the green on that digit (R3), and every
    // cell holding it lights — r1c6 is the 8 the fixture placed, r4c1 is a
    // given 8.
    const { user } = renderGame({}, gameWithEntry());
    await user.click(cell(5));

    expect(cell(5).getAttribute('data-match')).toBe('true');
    expect(cell(27).getAttribute('data-match')).toBe('true');
  });

  it('does not light matching digits when the layer is off', async () => {
    const { user } = renderGame({ highlightMatches: false }, gameWithEntry());
    await user.click(cell(5));

    expect(cell(5).getAttribute('data-match')).toBeNull();
    expect(cell(27).getAttribute('data-match')).toBeNull();
  });
});

describe('clearing dead notes without being asked', () => {
  it('leaves them for the player by default', async () => {
    const { user } = renderGame();

    // The note is still struck through rather than gone: nothing cleared it.
    expect(cell(2).querySelector('[data-stale]')).not.toBeNull();
    await user.click(cell(2));
    expect(cell(2).textContent).toContain('9');
  });

  it('clears them right after the placement that killed them, when it is on', async () => {
    // A fresh game, so the killing placement happens *through the view* —
    // the clear is a consequence of the player's move, not of the component
    // mounting, and that is the difference between a setting and a bug that
    // eats notes on reopening a game.
    const fresh = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `settings-test-${counter++}`,
      running: true,
    });
    const withNote = reduce(fresh, { type: 'addCandidate', cell: 2, digit: 9, at: 1100 });
    const { user } = renderGame({ autoClearDeadNotes: true }, withNote);

    expect(cell(2).textContent).toContain('9');

    await user.click(cell(3));
    await user.click(screen.getByRole('button', { name: 'Place 9' }));

    expect(cell(2).querySelector('[data-stale]')).toBeNull();
    expect(cell(2).textContent).not.toContain('9');
  });

  it('puts the notes back on one undo, and the digit stays', async () => {
    // The clear is its own move, deliberately: the player can see and
    // reverse what the setting did on their behalf without also losing the
    // placement they meant to make.
    const fresh = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `settings-test-${counter++}`,
      running: true,
    });
    const withNote = reduce(fresh, { type: 'addCandidate', cell: 2, digit: 9, at: 1100 });
    const { user } = renderGame({ autoClearDeadNotes: true }, withNote);

    await user.click(cell(3));
    await user.click(screen.getByRole('button', { name: 'Place 9' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(cell(2).textContent).toContain('9');
    expect(cell(3).textContent).toContain('9');
  });
});
