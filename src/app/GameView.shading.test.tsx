/**
 * Cross-hatching: where the highlighted digit cannot go.
 *
 * Paolo asked for it as a beginner's aid and said in the same breath that it
 * should come off later, which is the whole design. It does a share of the
 * scanning the player came here to learn, so it ships off — the same call, for
 * the same reason and nearly the same words, as `highlightMatchingNotes`.
 *
 * The claim that has to hold, and the reason this file exists: it draws the
 * geometry and never the conclusion. The last unshaded cell in a box is a
 * hidden single; emphasising it would hand over a digit, which is the one
 * thing this app does not do (invariant 4). Shading eliminations teaches
 * cross-hatching. Marking the answer replaces it.
 */

// Dexie captures the global `indexedDB` on import and `GameView` reaches it
// transitively — same reasoning as `GameView.layout.test.tsx`.
import 'fake-indexeddb/auto';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { boxOf, colOf, peersOf, rowOf } from '../engine/board';
import type { CellIndex } from '../engine/types';
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
});

function renderGame(overrides: Partial<PlayerProfile['settings']> = {}) {
  const settings: PlayerProfile['settings'] = {
    ...DEFAULT_PROFILE.settings,
    haptics: false,
    ...overrides,
  };
  const game: LiveGame = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `shading-test-${counter++}`,
    running: true,
  });
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

  render(
    <LocaleProvider locale="en">
      <Host />
    </LocaleProvider>,
  );
  return { user: userEvent.setup(), game };
}

const cell = (index: number): HTMLElement => {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
};

const shaded = (): number[] =>
  [...document.querySelectorAll<HTMLElement>('[data-excluded]')].map((node) =>
    Number(node.dataset.cell),
  );

/** Every cell holding `digit`, from the puzzle string. */
const placedAt = (digit: number): number[] =>
  [...PUZZLE].flatMap((char, index) => (char === String(digit) ? [index] : []));

/** r1c1 holds a given 5. Selecting it arms the green on 5. */
const FIVE_CELL = 0;

describe('with the shading on', () => {
  it('shades nothing until a digit is highlighted', () => {
    renderGame({ shadeDigitPeers: true });
    expect(shaded()).toEqual([]);
  });

  it('shades exactly the empty cells that digit cannot go in', async () => {
    const { user } = renderGame({ shadeDigitPeers: true });
    await user.click(cell(FIVE_CELL));

    // Derived from the rule rather than from a recorded list: every empty cell
    // sharing a house with a placed 5, and nothing else.
    const expected = new Set<number>();
    for (const placed of placedAt(5)) {
      for (const peer of peersOf(placed as CellIndex)) {
        if (PUZZLE[peer] === '.') expected.add(peer);
      }
    }

    expect(new Set(shaded())).toEqual(expected);
  });

  it('never shades a filled cell — a note cannot go there anyway', async () => {
    const { user } = renderGame({ shadeDigitPeers: true });
    await user.click(cell(FIVE_CELL));

    for (const index of shaded()) expect(PUZZLE[index]).toBe('.');
  });

  it('shades only cells that truly share a house with a placed instance', async () => {
    const { user } = renderGame({ shadeDigitPeers: true });
    await user.click(cell(FIVE_CELL));

    const fives = placedAt(5);
    for (const index of shaded()) {
      const shares = fives.some(
        (five) =>
          rowOf(five as CellIndex) === rowOf(index as CellIndex) ||
          colOf(five as CellIndex) === colOf(index as CellIndex) ||
          boxOf(five as CellIndex) === boxOf(index as CellIndex),
      );
      expect(shares, `cell ${index} shades without sharing a house with a 5`).toBe(true);
    }
  });

  it('draws the geometry and never the conclusion', async () => {
    // The line this feature is not allowed to cross. A box whose empty cells
    // are all shaded but one has a hidden single in it, and the app must not
    // mark that cell in any way — it is the digit, and the digit is the
    // player's to find (invariant 4).
    const { user } = renderGame({ shadeDigitPeers: true });
    await user.click(cell(FIVE_CELL));

    const shadedSet = new Set(shaded());
    for (let box = 0; box < 9; box += 1) {
      const empties = [...Array(81).keys()].filter(
        (index) => boxOf(index as CellIndex) === box && PUZZLE[index] === '.',
      );
      const survivors = empties.filter((index) => !shadedSet.has(index));
      if (survivors.length !== 1) continue;

      // A hidden single is on the board. Nothing may point at it.
      const node = cell(survivors[0]);
      expect(node.dataset.spotlight).toBeUndefined();
      expect(node.dataset.match).toBeUndefined();
      expect(node.dataset.excluded).toBeUndefined();
    }
  });

  it('stops when the highlight is cleared', async () => {
    const { user } = renderGame({ shadeDigitPeers: true });
    await user.click(cell(FIVE_CELL));
    expect(shaded().length).toBeGreaterThan(0);

    await user.click(cell(FIVE_CELL));
    expect(shaded()).toEqual([]);
  });
});

describe('with the shading off, which is the default', () => {
  it('shades nothing even with a digit lit', async () => {
    const { user } = renderGame();
    await user.click(cell(FIVE_CELL));

    expect(shaded()).toEqual([]);
  });

  it('ships off, because it does a share of the player scanning', () => {
    expect(DEFAULT_PROFILE.settings.shadeDigitPeers).toBe(false);
  });
});
