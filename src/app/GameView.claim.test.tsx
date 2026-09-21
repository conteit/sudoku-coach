/**
 * A verified claim, through the assembled screen.
 *
 * The engine's own tests say what each pattern eliminates and the reducer's
 * say what removing a note does to the undo stack. What only the screen can
 * show is the part Paolo asked for: that a claim which *holds* names the roles
 * it settled, marks what it clears, and offers to take those notes off — and
 * that the offer is an offer, spent once taken.
 *
 * The board is the corpus puzzle every other screen test uses. On it, the 7s
 * at r3c7, r3c9 and r2c9 form a colouring whose two ends wear the same colour
 * and share a house, so that colour is the false one and **both of its cells**
 * give the 7 up. That case is deliberate: the eliminations land on cells of
 * the chain itself, which is the one shape where marking a target could erase
 * the tint that says why it is a target.
 */

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
import { MARK_ON, MARK_TARGET, marked } from '../ui/board/patternMark';
import { GameView } from './GameView';

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

/** r3c7, r3c9, r2c9 — the chain, in the order it is built. */
const CHAIN = [24, 26, 17];
/** The two cells of the trapped colour, which are the ones that lose the 7. */
const TRAPPED = [24, 17];

let counter = 0;

beforeEach(() => {
  window.innerWidth = 375;
});

afterEach(() => {
  useGameStore.setState({ activeGameId: null, games: {}, hydrated: true });
});

function renderGame() {
  const game: LiveGame = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `claim-screen-${counter++}`,
    running: true,
  });
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

  render(
    <LocaleProvider locale="en">
      <Host />
    </LocaleProvider>,
  );
  return userEvent.setup();
}

const cell = (index: number): HTMLElement => {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
};

const markOf = (index: number): number => Number(cell(index).getAttribute('data-mark') ?? 0);

const noted = (index: number): string[] =>
  [...cell(index).querySelectorAll('[data-slot][data-marked]')].map((slot) =>
    (slot.textContent ?? '').trim(),
  );

const keypad = () => within(screen.getByRole('group', { name: /^Keypad/ }));

/** Notes a 7 into each of the given cells, the way a player would. */
async function note7(user: ReturnType<typeof userEvent.setup>, cells: readonly number[]) {
  await user.click(keypad().getByRole('button', { name: /Notes o/ }));
  for (const index of cells) {
    await user.click(cell(index));
    await user.click(keypad().getByRole('button', { name: 'Note 7' }));
  }
  await user.click(keypad().getByRole('button', { name: /Notes o/ }));
}

/** Opens the claim flow and taps the chain, stopping short of Check. */
async function claimTheChain(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Coach/ }));
  await user.click(screen.getByRole('button', { name: /spotted something/ }));
  const panel = within(screen.getByRole('region', { name: 'Your claim' }));
  await user.click(panel.getByRole('button', { name: 'Show every technique' }));
  await user.click(panel.getByRole('button', { name: 'Simple colouring' }));
  for (const index of CHAIN) await user.click(cell(index));
  return panel;
}

describe('a claim that holds', () => {
  it('marks what it clears, and clears it only when asked', async () => {
    const user = renderGame();
    await note7(user, TRAPPED);
    expect(noted(24)).toContain('7');
    expect(noted(17)).toContain('7');

    const panel = await claimTheChain(user);
    // Nothing is a target before the check — there is no conclusion yet.
    for (const index of CHAIN) expect(marked(markOf(index), MARK_TARGET)).toBe(false);

    await user.click(panel.getByRole('button', { name: 'Check' }));

    // The two cells of the trapped colour are amber, and they keep their
    // chain mark: a target here *is* a cell of the pattern.
    for (const index of TRAPPED) {
      expect(marked(markOf(index), MARK_TARGET), `r?c? ${index} is not a target`).toBe(true);
      expect(marked(markOf(index), MARK_ON)).toBe(true);
    }
    expect(marked(markOf(26), MARK_TARGET), 'the surviving colour is not cleared').toBe(false);

    // Offered, not taken: the notes are still there until the press.
    expect(noted(24)).toContain('7');
    const apply = panel.getByRole('button', { name: 'Clear those notes' });

    await user.click(apply);
    expect(noted(24)).not.toContain('7');
    expect(noted(17)).not.toContain('7');
    // Spent — the same press twice would be a second undo step for nothing.
    expect(panel.queryByRole('button', { name: 'Clear those notes' })).toBeNull();
    expect(panel.getByText(/Cleared/)).toBeTruthy();
  });

  it('says nothing about roles on a shape that has none', async () => {
    // A colouring's cells have no pivot to name. The roles line belongs to the
    // wing, and printing an empty one would be chrome pretending to be a fact.
    const user = renderGame();
    const panel = await claimTheChain(user);
    await user.click(panel.getByRole('button', { name: 'Check' }));

    expect(panel.queryByText(/hinge/)).toBeNull();
  });
});
