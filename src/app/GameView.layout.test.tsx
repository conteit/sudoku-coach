/**
 * The layout invariant this task exists to enforce: the board and the keypad
 * are the only things that take height while a game is being played, in every
 * state a game can be in.
 *
 * Counting `main.children` alone is not that check, and would not have caught
 * the defect it was written for. Of the three surfaces the spec names as the
 * cause, only the stale-note row was ever a child of `<main>`; the resting
 * coach bar and the nudge `<aside>` were `shrink-0` children of the *root*
 * flex column, siblings of a `flex-1` `<main>`, and stole board height without
 * ever touching `main.children`. So both levels are asserted here — and the
 * pixel-height property they exist to protect is measured for real in
 * `tests/e2e/play.spec.ts`, which has a browser that can do layout.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { newGame, reduce } from '../state/game';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { GameView } from './GameView';

// Mobile is this file's default context — the sheet, the header's coach
// trigger and the modal behaviours only exist below `sm` (640px). The one
// wide-screen case sets its own width; `beforeEach` puts every other test
// back on narrow before it runs, so ordering can't leak one test's width
// into the next.
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
  highlightMatchingNotes: false,
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

/**
 * Class tokens that take an element out of flow, or out of the render
 * entirely. jsdom carries no stylesheet, so the Tailwind class list is where
 * position and visibility have to be read from — the same strings the browser
 * reads. Exact tokens, not substrings: `sm:hidden` is a wide-screen rule and
 * says nothing about the phone layout this file is about.
 */
const OUT_OF_FLOW = new Set(['absolute', 'fixed', 'hidden']);

/**
 * Both halves of the invariant. `<main>` gaining a third child is how it broke
 * the first time; a new `shrink-0` sibling of `<main>` is how it broke the
 * other two times, silently. Nothing but the header may share the root column
 * with `<main>` — the header is fixed chrome whose height never moves. The
 * coach's own trigger lives there now, as a plain, unconditional, fixed-height
 * header child; everything else the coach does — the sheet, the scrim — is
 * either out of flow or not rendered at all.
 */
function expectOnlyTheBoardAndKeypadInFlow(): void {
  const main = screen.getByRole('main');
  expect(main.children).toHaveLength(2);

  const root = main.parentElement;
  expect(root).not.toBeNull();
  const inFlow = Array.from(root!.children).filter(
    (child) => !Array.from(child.classList).some((token) => OUT_OF_FLOW.has(token)),
  );
  expect(inFlow.map((child) => child.tagName)).toEqual(['HEADER', 'MAIN']);
}

describe('the game screen', () => {
  it('keeps exactly the board and the keypad in flow', () => {
    renderGame();
    expectOnlyTheBoardAndKeypadInFlow();
  });

  it('keeps them in flow when there are dead notes to clear', () => {
    renderGame({ deadNotes: true });
    expectOnlyTheBoardAndKeypadInFlow();
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
    expectOnlyTheBoardAndKeypadInFlow();
  });

  it('keeps them in flow with the coach sheet open', async () => {
    const { user } = renderGame();
    await user.click(screen.getByRole('button', { name: /coach/i }));
    expectOnlyTheBoardAndKeypadInFlow();
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
    const trigger = screen.getByRole('button', { name: 'Coach' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    // The button has to still be the *same node* handed back focus — it is
    // kept mounted (merely `hidden`) while the sheet is open specifically so
    // this reference stays live across the round trip.
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and consumes the nudge badge on the way out', async () => {
    const { user } = renderGame({ nudge: true });
    const trigger = await screen.findByRole('button', { name: /has something for you/i });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    // Consuming happens on close, not on open (spec: read, not re-solicited)
    // — so the proof is that the badge is gone *after* Escape, not that it
    // was never there.
    expect(screen.getByRole('button', { name: 'Coach' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /has something for you/i })).not.toBeInTheDocument();
  });

  it('offers the eraser once a placement has killed a note', () => {
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

describe('the board shortcuts', () => {
  /*
   * The probe is "n" (notes mode) rather than "u": `enabled` gates all four
   * shortcuts as one flag, and pencil mode is the one whose effect this
   * harness can actually observe — the view renders the `game` it is handed
   * as a prop, so a dispatched undo changes the store and nothing on screen.
   * A test written around "u" here would pass whether or not the guard
   * exists.
   */
  it('do not reach the board behind the open coach sheet', async () => {
    const { user } = renderGame({ running: true });
    await user.click(screen.getByRole('button', { name: 'Coach' }));
    await user.keyboard('n');
    expect(screen.getByRole('group', { name: 'Keypad' })).toBeInTheDocument();
  });

  it('do not reach the board behind the open game menu', async () => {
    const { user } = renderGame({ running: true });
    await user.click(screen.getByRole('button', { name: 'This puzzle' }));
    await user.keyboard('n');
    expect(screen.getByRole('group', { name: 'Keypad' })).toBeInTheDocument();
  });

  it('leave the focus-restore target alone when "h" is pressed twice', async () => {
    const { user } = renderGame({ running: true });
    // Wherever focus plausibly is when a keyboard player asks for a hint —
    // and where the sheet owes it back on close.
    const pause = screen.getByRole('button', { name: 'Pause' });
    pause.focus();

    // The first "h" opens the sheet and records `pause` as the restore
    // target. The second must not fire at all: `openSheet` reads
    // `document.activeElement` unconditionally, so a second run would record
    // the panel's own Close button instead — and `setSheetOpen(true)` being a
    // no-op means nothing re-renders to show it, until Escape hands focus to
    // a control inside a panel that has just been hidden.
    await user.keyboard('h');
    await user.keyboard('h');
    await user.keyboard('{Escape}');

    expect(pause).toHaveFocus();
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
