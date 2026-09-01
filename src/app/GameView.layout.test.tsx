/**
 * The layout invariant this task exists to enforce: `<main>` holds the board
 * and the keypad and nothing else, in every state a game can be in. Anything
 * that used to be a third flow sibling — the stale-note row, the nudge — is a
 * regression the moment `main.children` stops being exactly two.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { newGame, reduce } from '../state/game';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { GameView } from './GameView';

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

const SETTINGS: PlayerProfile['settings'] = {
  highlightConflicts: true,
  theme: 'system',
  haptics: false,
};

let counter = 0;

/**
 * Cells 2 and 3 (r1c3, r1c4) are the first two blanks in `PUZZLE`'s opening
 * row, so they are peers by construction — exactly what `deadNotes()` and
 * `contradictionAt()` need, without hand-building an 81-cell board.
 */
function makeGame(options: { deadNotes?: boolean; nudge?: boolean } = {}): LiveGame {
  let game = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `layout-test-${counter++}`,
  });

  if (options.deadNotes) {
    // A note in r1c3, then the peer placement that kills it.
    game = reduce(game, { type: 'addCandidate', cell: 2, digit: 9, at: 1100 });
    game = reduce(game, { type: 'setValue', cell: 3, digit: 9, at: 1200 });
  }

  if (options.nudge) {
    // SOLVED[2] is '4'; entering 9 there is a contradiction the trigger
    // machinery can see without a detector pass.
    game = reduce(game, { type: 'setValue', cell: 2, digit: 9, at: 1100 });
  }

  return game;
}

/**
 * The store the app ships is real — Dexie-backed, autosave and all — so
 * seeding it with `setState` (rather than going through `startGame`) is what
 * keeps this a layout test rather than a store test: `dispatch` still works
 * for anything a click triggers, but nothing here waits on IndexedDB.
 */
function renderGame(options: { deadNotes?: boolean; nudge?: boolean } = {}) {
  const game = makeGame(options);
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });

  render(
    <LocaleProvider locale="en">
      <GameView
        game={game}
        settings={SETTINGS}
        locale="en"
        onExit={() => undefined}
        onOpenSettings={() => undefined}
        onNewGame={() => undefined}
        onLearn={() => undefined}
      />
    </LocaleProvider>,
  );

  return { user: userEvent.setup() };
}

describe('the game screen', () => {
  it('keeps exactly the board and the keypad in flow', () => {
    renderGame();
    const main = screen.getByRole('main');
    expect(main.children).toHaveLength(2);
  });

  it('keeps them in flow when there are dead notes to clear', () => {
    renderGame({ deadNotes: true });
    expect(screen.getByRole('main').children).toHaveLength(2);
  });

  it('keeps them in flow when the coach has something to say', () => {
    renderGame({ nudge: true });
    expect(screen.getByRole('main').children).toHaveLength(2);
  });

  it('keeps them in flow with the coach sheet open', async () => {
    const { user } = renderGame();
    await user.click(screen.getByRole('button', { name: /coach/i }));
    expect(screen.getByRole('main').children).toHaveLength(2);
  });
});
