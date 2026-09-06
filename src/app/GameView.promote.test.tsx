/**
 * Holding a cell down to one note to place its digit.
 *
 * A cell down to one mark still needs selecting and then hitting the right
 * key, and the mis-key writes a digit that is simply false — at the moment
 * the player has just done the reasoning correctly. Holding the cell places
 * it instead.
 */

// Dexie captures the global `indexedDB` on import and `GameView` reaches it
// transitively — same reasoning as `GameView.layout.test.tsx`.
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Digit } from '../engine/types';
import { LocaleProvider } from '../i18n/react';
import { newGame, reduce } from '../state/game';
import { DEFAULT_PROFILE } from '../state/mastery';
import { useProfile } from '../state/profile';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { LONG_PRESS_MS } from '../ui/primitives/useLongPress';
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

function renderGame(
  overrides: Partial<PlayerProfile['settings']> = {},
  game: LiveGame,
) {
  const settings: PlayerProfile['settings'] = {
    ...DEFAULT_PROFILE.settings,
    haptics: false,
    ...overrides,
  };
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

/** Cells name themselves with `data-cell`, the same handle the e2e reads. */
function cell(index: number): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
}

const keypad = () => screen.getByRole('group', { name: /^Keypad/ });

/** The digits noted in a cell, by slot. Empty once the cell holds a value. */
const notes = (index: number): string[] =>
  [...cell(index).querySelectorAll<HTMLElement>('[data-marked]')].map(
    (node) => node.dataset.slot ?? '',
  );

describe('promoting a lone note', () => {
  /** r1c3 empty, with exactly one note in it. */
  function gameWithLoneNote(digit: Digit = 4) {
    let game = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `promote-test-${counter++}`,
      running: true,
    });
    game = reduce(game, { type: 'addCandidate', cell: 2, digit, at: 1100 });
    return game;
  }

  it('places the digit on a held press', () => {
    vi.useFakeTimers();
    renderGame({}, gameWithLoneNote());

    fireEvent.pointerDown(cell(2), { clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });

    // The digit, not the note: a placed digit is large and centred, so the
    // cell reports it as its own text rather than inside a mark slot. The
    // brief's own assertion here compared `?.textContent` (which is
    // `undefined` once the slot is gone, not `''`) — `toBeNull()` is the
    // fixed form of the same claim: the mark slot no longer exists at all.
    expect(cell(2).querySelector('[data-slot="4"]')).toBeNull();
    expect(cell(2).textContent).toContain('4');
    vi.useRealTimers();
  });

  it('does nothing while a sweep is armed — that press belongs to the sweep', async () => {
    /*
     * The two gestures collided, and the collision placed digits.
     *
     * Mid-sweep a press on an empty cell already means "note the swept digit
     * here", and `activateCell` writes that note on pointerdown. The hold then
     * found a cell with exactly one mark — the one its own first half had just
     * written — and promoted it. So a gesture the player meant as a note put a
     * digit on the board, which is the one thing a note-taking mode must never
     * do.
     *
     * The keypad's long press is untouched: it is what arms the green in the
     * first place, and nothing on the grid competes with it.
     */
    const plain = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `promote-test-${counter++}`,
      running: true,
    });
    const { user } = renderGame({ sweepOneDigit: true }, plain);

    // Notes mode, then arm the green on the given 5 in r1c1 — the same way
    // `GameView.sweep.test.tsx` starts a sweep.
    await user.click(within(keypad()).getByRole('button', { name: 'Notes off' }));
    await user.click(cell(0));

    vi.useFakeTimers();
    fireEvent.pointerDown(cell(2), { clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    vi.useRealTimers();

    // A note, and only a note. A placed digit would have removed the mark
    // slots entirely, so their presence is the assertion.
    expect(notes(2)).toEqual(['5']);
  });

  it('does nothing when the cell has two notes left', () => {
    vi.useFakeTimers();
    let game = gameWithLoneNote(4);
    game = reduce(game, { type: 'addCandidate', cell: 2, digit: 6, at: 1200 });
    renderGame({}, game);

    fireEvent.pointerDown(cell(2), { clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });

    expect(cell(2).querySelector('[data-slot="4"]')?.textContent).toBe('4');
    vi.useRealTimers();
  });

  it('does nothing with the setting off', () => {
    vi.useFakeTimers();
    renderGame({ promoteLoneNote: false }, gameWithLoneNote());

    fireEvent.pointerDown(cell(2), { clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });

    expect(cell(2).querySelector('[data-slot="4"]')?.textContent).toBe('4');
    vi.useRealTimers();
  });

  it('places even in notes mode — the gesture means one thing', () => {
    vi.useFakeTimers();
    const { user } = renderGame({}, gameWithLoneNote());
    // Notes mode on; a held press still places, because promoting a note is
    // not a note-taking action.
    //
    // The toggle's accessible name is `keypad.notesOn` / `keypad.notesOff`
    // ('Notes on' / 'Notes off'), not the bare `action.notes` ('Notes') the
    // brief named — `GameView` starts with notes mode off, so 'Notes off' is
    // the label this render actually has.
    vi.useRealTimers();
    return user
      .click(screen.getByRole('button', { name: 'Notes off' }))
      .then(() => {
        vi.useFakeTimers();
        fireEvent.pointerDown(cell(2), { clientX: 10, clientY: 10 });
        act(() => {
          vi.advanceTimersByTime(LONG_PRESS_MS + 10);
        });
        // The `data-slot` null check, not `textContent` alone: the pencil
        // mark 4 already renders the character '4' inside the cell, so the
        // text assertion on its own holds whether or not the promote fired.
        // `Cell` drops the mark grid entirely once the cell holds a value, so
        // the slot's absence is what actually separates a digit from a note —
        // the same discriminator the sibling test above uses.
        expect(cell(2).querySelector('[data-slot="4"]')).toBeNull();
        expect(cell(2).textContent).toContain('4');
        vi.useRealTimers();
      });
  });
});
