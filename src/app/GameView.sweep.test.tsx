/**
 * Sweeping one digit at a time.
 *
 * Paolo hit both of these playing: running a digit across the board in notes
 * mode, eyes on the grid rather than the keypad, two mis-taps are easy and
 * they cost differently. A wrong key writes a note that is simply false. A
 * stray tap on a solved cell re-points the green, and the sweep carries on
 * against a digit the player is no longer looking at — the worse of the two,
 * because nothing about it looks like a mistake.
 *
 * The setting is off by default and is asserted in both positions, for the
 * reason this file's neighbour already gives: a toggle tested only in the
 * state it ships in is a toggle nothing is holding.
 */

// Dexie captures the global `indexedDB` on import and `GameView` reaches it
// transitively — same reasoning as `GameView.layout.test.tsx`.
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

const freshGame = (): LiveGame =>
  newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `sweep-test-${counter++}`,
    running: true,
  });

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
  const game = freshGame();
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
  return { user: userEvent.setup() };
}

const cell = (index: number): HTMLElement => {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
};

const keypad = () => screen.getByRole('group', { name: /^Keypad/ });

/** The key names itself by what it will do — "Note 5" or "Place 5". */
const key = (digit: number) =>
  within(keypad()).getByRole('button', { name: new RegExp(`^(Note|Place) ${digit}$`) });

/** Which digit the green is on, read off the keypad's own marker. */
const highlighted = (): string | null => {
  const node = keypad().querySelector<HTMLElement>('[data-highlighted="true"]');
  return node?.getAttribute('aria-label')?.match(/(\d)$/)?.[1] ?? null;
};

const notes = (index: number): string[] =>
  [...cell(index).querySelectorAll<HTMLElement>('[data-marked]')].map(
    (node) => node.dataset.slot ?? '',
  );

/** r1c1 holds a given 5; r1c2 holds a given 3; r1c3 is empty. */
const FIVE = 0;
const THREE = 1;
const EMPTY = 2;

/** Into notes mode with the green armed on 5, which is the swept state. */
async function startSweeping(user: ReturnType<typeof renderGame>['user']) {
  await user.click(within(keypad()).getByRole('button', { name: 'Notes off' }));
  await user.click(cell(FIVE));
  expect(highlighted()).toBe('5');
  await user.click(cell(EMPTY));
}

describe('with sweeping on', () => {
  it('writes a note of the digit being swept', async () => {
    const { user } = renderGame({ sweepOneDigit: true });
    await startSweeping(user);

    await user.click(key(5));

    expect(notes(EMPTY)).toEqual(['5']);
  });

  it('refuses any other digit, writing nothing', async () => {
    // Refused rather than corrected: writing a 5 because the player pressed 6
    // would be the app deciding what they meant.
    const { user } = renderGame({ sweepOneDigit: true });
    await startSweeping(user);

    await user.click(key(6));

    expect(notes(EMPTY)).toEqual([]);
  });

  it('keeps the green when a tap lands on a solved cell', async () => {
    const { user } = renderGame({ sweepOneDigit: true });
    await startSweeping(user);

    await user.click(cell(THREE));

    expect(highlighted()).toBe('5');
  });

  it('still moves the caret on that tap — only the green is pinned', async () => {
    const { user } = renderGame({ sweepOneDigit: true });
    await startSweeping(user);

    await user.click(cell(THREE));
    // The caret went there, so the board is not ignoring the tap; it simply
    // did not take the sweep with it.
    expect(cell(THREE).getAttribute('aria-selected')).toBe('true');
  });

  it('leaves the keypad long-press as the way to change it', async () => {
    const { user } = renderGame({ sweepOneDigit: true });
    await startSweeping(user);

    await user.pointer([
      { keys: '[MouseLeft>]', target: key(7) },
      { keys: '[/MouseLeft]', target: key(7) },
    ]);
    // A short press writes nothing while sweeping; the deliberate gesture is
    // the long one, and it is the one that still moves the green.
    expect(highlighted()).toBe('5');
  });
});

describe('with sweeping off, which is the default', () => {
  it('takes any digit as a note', async () => {
    const { user } = renderGame();
    await startSweeping(user);

    await user.click(key(6));

    expect(notes(EMPTY)).toEqual(['6']);
  });

  it('lets a tap on a solved cell re-point the green, as it always has', async () => {
    const { user } = renderGame();
    await startSweeping(user);

    await user.click(cell(THREE));

    expect(highlighted()).toBe('3');
  });

  it('ships off', () => {
    expect(DEFAULT_PROFILE.settings.sweepOneDigit).toBe(false);
  });
});

describe('outside a sweep', () => {
  it('does not restrict digits while placing rather than noting', async () => {
    // The setting is about sweeping notes. With the pencil down the player is
    // answering the board, and the green is not a filter on that.
    const { user } = renderGame({ sweepOneDigit: true });
    await user.click(cell(FIVE));
    expect(highlighted()).toBe('5');

    await user.click(cell(EMPTY));
    await user.click(key(6));

    expect(cell(EMPTY).textContent).toContain('6');
  });
});
