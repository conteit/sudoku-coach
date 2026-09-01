/**
 * The layout invariant this task exists to enforce: `<main>` holds the board
 * and the keypad and nothing else, in every state a game can be in. Anything
 * that used to be a third flow sibling — the stale-note row, the nudge — is a
 * regression the moment `main.children` stops being exactly two.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { newGame, reduce } from '../state/game';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { GameView } from './GameView';

// Mobile is this file's default context — the sheet, the FAB and the modal
// behaviours only exist below `sm` (640px). The one wide-screen case sets its
// own width; `beforeEach` puts every other test back on narrow before it
// runs, so ordering can't leak one test's width into the next.
beforeEach(() => {
  window.innerWidth = 375;
});

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
function makeGame(
  options: { deadNotes?: boolean; nudge?: boolean; running?: boolean } = {},
): LiveGame {
  let game = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `layout-test-${counter++}`,
    // `newGame` starts every game paused unless told otherwise — realistic
    // for a game just opened, and exactly what the paused-eraser case below
    // needs without any extra setup.
    running: options.running,
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
function renderGame(
  options: { deadNotes?: boolean; nudge?: boolean; running?: boolean } = {},
) {
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

  it('keeps them in flow when the coach has something to say', async () => {
    renderGame({ nudge: true });
    // `nudge` is only set once `useCoachSession`'s IDLE_MS (400ms) debounce
    // fires — asserting immediately would pass whether or not the badge ever
    // renders, since a synchronous read always finds `coach.nudge === null`.
    // Waiting for the badge is what makes this case actually exercise the
    // nudge state rather than merely re-running the plain case under a
    // different name.
    await screen.findByRole('button', { name: /has something for you/i });
    expect(screen.getByRole('main').children).toHaveLength(2);
  });

  it('keeps them in flow with the coach sheet open', async () => {
    const { user } = renderGame();
    await user.click(screen.getByRole('button', { name: /coach/i }));
    expect(screen.getByRole('main').children).toHaveLength(2);
  });
});

describe('the coach sheet', () => {
  it('moves focus into the panel on open', async () => {
    const { user } = renderGame();
    await user.click(screen.getByRole('button', { name: 'Coach' }));
    // The X is the first focusable thing in the panel's own header — a
    // keyboard user who opens the sheet should not have to hunt for
    // wherever the browser happened to leave focus. Scoped to the panel
    // itself: the scrim behind it answers to the same "Close" name but is
    // deliberately excluded from the tab order.
    const panel = screen.getByRole('region', { name: 'Coach' });
    expect(within(panel).getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('restores focus to the coach button on close', async () => {
    const { user } = renderGame();
    const fab = screen.getByRole('button', { name: 'Coach' });
    await user.click(fab);
    await user.keyboard('{Escape}');
    // The button has to still be the *same node* handed back focus — it is
    // kept mounted (merely `hidden`) while the sheet is open specifically so
    // this reference stays live across the round trip.
    expect(fab).toHaveFocus();
  });

  it('closes on Escape and consumes the nudge badge on the way out', async () => {
    const { user } = renderGame({ nudge: true });
    const fab = await screen.findByRole('button', { name: /has something for you/i });
    await user.click(fab);
    await user.keyboard('{Escape}');
    // Consuming happens on close, not on open (spec: read, not re-solicited)
    // — so the proof is that the badge is gone *after* Escape, not that it
    // was never there.
    expect(screen.getByRole('button', { name: 'Coach' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /has something for you/i })).not.toBeInTheDocument();
  });

  it("offers the eraser while the board is live, and withholds it while paused", () => {
    renderGame({ deadNotes: true, running: true });
    expect(screen.getByRole('button', { name: /clear 1 dead note/i })).toBeInTheDocument();
  });

  it('withholds the eraser while paused, even though the notes are still dead', () => {
    // `renderGame` starts paused by default — see `makeGame`.
    renderGame({ deadNotes: true });
    expect(screen.queryByRole('button', { name: /clear \d+ dead notes?/i })).not.toBeInTheDocument();
  });

  it('is announced as a dialog only while it is actually the modal overlay', async () => {
    const { user } = renderGame();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coach' }));
    expect(screen.getByRole('dialog', { name: 'Coach' })).toBeInTheDocument();
  });
});

describe('the coach panel on a wide screen', () => {
  it('does not modalize or trap focus when "h" is pressed', async () => {
    window.innerWidth = 1024;
    // The default game starts paused, and a paused board takes no shortcuts
    // (`useBoardShortcuts`'s own `enabled` guard) — this case is about
    // whether "h" traps focus, which needs the shortcut to actually fire.
    const { user } = renderGame({ running: true });
    await user.keyboard('h');
    // The desktop bar is static and was always visible — asking for a hint
    // through it must stay exactly what it was before this task: no dialog
    // appears, and focus is left wherever it already was rather than being
    // pulled into the panel.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const panel = screen.getByRole('region', { name: 'Coach' });
    expect(panel.contains(document.activeElement)).toBe(false);
  });
});
