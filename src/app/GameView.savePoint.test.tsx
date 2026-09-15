/**
 * The save point, through the assembled screen.
 *
 * The reducer's own tests cover what restoring does to a board and the store's
 * cover what reaches disk. What only the screen can show is the part Paolo
 * actually asked about: that there is a way to pin a board and a way back to
 * it, that the way back turns up under the thumb in the redo key exactly when
 * redo is dead, and that it never takes redo's place while redo still means
 * something.
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
import { useSavePoint } from '../state/savePoint';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { GameView } from './GameView';

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

/** First blank of the opening row, the cell every test here writes to. */
const OPEN = 2;

let counter = 0;

const freshGame = (): LiveGame =>
  newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `savepoint-screen-${counter++}`,
    running: true,
  });

beforeEach(() => {
  window.innerWidth = 375;
  // The store is a singleton wired to the app's own database, so a point left
  // behind by one test would be the next one's starting state.
  useSavePoint.setState({ point: null, gameId: null });
});

afterEach(async () => {
  await useSavePoint.getState().flush();
  useSavePoint.getState().forget();
  await useSavePoint.getState().flush();
  useGameStore.setState({ activeGameId: null, games: {}, hydrated: true });
});

function renderGame(game: LiveGame = freshGame()) {
  const settings: PlayerProfile['settings'] = { ...DEFAULT_PROFILE.settings, haptics: false };
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });
  useProfile.setState((state) => ({ profile: { ...state.profile, locale: 'en', settings } }));

  // Reads the live game out of the store the way `App` does: every test here
  // turns on what a dispatch did, and a frozen prop would render none of it.
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

const keypad = () => within(screen.getByRole('group', { name: /^Keypad/ }));

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'This puzzle' }));
};

/*
 * Scoped to the open sheet, and it has to be: the way back is deliberately
 * offered in two places at once — here and in the pad's redo slot — so an
 * unscoped query for it finds two buttons, and one that happened to find one
 * would not say which.
 */
const menu = () => within(screen.getByRole('dialog', { name: 'This puzzle' }));


describe('pinning a board', () => {
  it('offers one thing to do before there is a pin, and exactly two after', async () => {
    const { user } = renderGame();

    await openMenu(user);
    expect(menu().getByRole('button', { name: 'Pin this board' })).toBeInTheDocument();
    expect(menu().queryByRole('button', { name: 'Back to pin' })).toBeNull();

    await user.click(menu().getByRole('button', { name: 'Pin this board' }));
    await openMenu(user);

    // And the single create button is gone rather than sitting above the pair:
    // once there is a pin there are two things you can do with it, not three.
    expect(menu().queryByRole('button', { name: 'Pin this board' })).toBeNull();
    expect(menu().getByRole('button', { name: 'Back to pin' })).toBeInTheDocument();
    expect(menu().getByRole('button', { name: 'Update pin' })).toBeInTheDocument();
  });

  it('keeps the pair on one row, side by side', async () => {
    // Paolo's objection: two full-width rows is a sixth of the menu for a
    // scratch feature.
    const { user } = renderGame();
    await openMenu(user);
    await user.click(menu().getByRole('button', { name: 'Pin this board' }));
    await openMenu(user);

    const back = menu().getByRole('button', { name: 'Back to pin' });
    const update = menu().getByRole('button', { name: 'Update pin' });

    // Shared parentage alone proves nothing — in the two-row version they were
    // siblings too, in the menu's own column. What says "one row" is that the
    // box they share lays out horizontally, so the assertion is on that.
    const row = back.parentElement;
    expect(update.parentElement).toBe(row);
    expect(row?.classList.contains('flex')).toBe(true);
    expect(row?.classList.contains('flex-col')).toBe(false);

    // Going back is the leftmost of the two: it is the frequent one, and the
    // left half of the sheet is where the thumb lands.
    expect(back.compareDocumentPosition(update) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the board back, and one undo returns to where the player was', async () => {
    const { user } = renderGame();

    await openMenu(user);
    await user.click(menu().getByRole('button', { name: 'Pin this board' }));

    // The line that does not work out.
    await user.click(cell(OPEN));
    await keypad().getByRole('button', { name: 'Place 4' }).click();
    expect(cell(OPEN)).toHaveTextContent('4');

    await openMenu(user);
    await user.click(menu().getByRole('button', { name: 'Back to pin' }));
    expect(cell(OPEN)).not.toHaveTextContent('4');

    // Paolo's semantic: undo after a restore is not a replay forward from the
    // pin, it is the way back to the board you pressed it on.
    await keypad().getByRole('button', { name: 'Undo' }).click();
    expect(cell(OPEN)).toHaveTextContent('4');
  });

  it('leaves the pin standing, so backing out twice needs no re-pinning', async () => {
    const { user } = renderGame();
    await openMenu(user);
    await user.click(menu().getByRole('button', { name: 'Pin this board' }));

    await user.click(cell(OPEN));
    await keypad().getByRole('button', { name: 'Place 4' }).click();
    await openMenu(user);
    await user.click(menu().getByRole('button', { name: 'Back to pin' }));

    await openMenu(user);
    expect(menu().getByRole('button', { name: 'Back to pin' })).toBeInTheDocument();
  });
});

describe('the way back in the redo key', () => {
  it('takes the redo key only while redo is dead', async () => {
    const { user } = renderGame();
    await openMenu(user);
    await user.click(menu().getByRole('button', { name: 'Pin this board' }));

    // Nothing has been undone, so redo is inert and the slot is free.
    expect(keypad().getByRole('button', { name: 'Back to the pinned board' })).toBeInTheDocument();
    expect(keypad().queryByRole('button', { name: 'Redo' })).toBeNull();

    // A move and an undo make redo mean something again, and redo wins: the
    // key the player pressed undo expecting must be the key that comes back.
    await user.click(cell(OPEN));
    await keypad().getByRole('button', { name: 'Place 4' }).click();
    await keypad().getByRole('button', { name: 'Undo' }).click();

    expect(keypad().getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(keypad().queryByRole('button', { name: 'Back to the pinned board' })).toBeNull();
  });

  it('is not there at all until something is pinned', () => {
    renderGame();
    expect(keypad().getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(keypad().queryByRole('button', { name: 'Back to the pinned board' })).toBeNull();
  });

  it('restores from the pad, not only from the menu', async () => {
    const { user } = renderGame();
    await openMenu(user);
    await user.click(menu().getByRole('button', { name: 'Pin this board' }));

    await user.click(cell(OPEN));
    await keypad().getByRole('button', { name: 'Place 4' }).click();
    // The move left something to undo but nothing to redo, which is the state
    // this key exists for.
    await user.click(keypad().getByRole('button', { name: 'Back to the pinned board' }));

    expect(cell(OPEN)).not.toHaveTextContent('4');
  });
});
