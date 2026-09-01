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

// Must come first: Dexie captures the global `indexedDB` when it is imported,
// and `./GameView` reaches it transitively (`useCoachSession` and the new
// lesson column both read `useProfile`, whose store writes through to Dexie
// on every level-2 disclosure — a real one, not a debounced autosave, per
// `state/profile.ts`'s own "write-through rather than debounced" doc
// comment). jsdom has no IndexedDB of its own; without this shim, the first
// test that reaches a level-2 hint or a drill turns a real write attempt into
// an unhandled rejection instead of the successful save a browser would give
// it. Same convention as `state/store.test.ts`, `state/db.test.ts` and
// `state/profile.test.ts`.
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { newGame, reduce } from '../state/game';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { GameView } from './GameView';
import type { Tier } from './useViewportTier';

// Mobile is this file's default context — the sheet, the header's coach
// trigger and the modal behaviours only exist below `sm` (640px). The one
// wide-screen case sets its own width; `beforeEach` puts every other test
// back on narrow before it runs, so ordering can't leak one test's width
// into the next.
beforeEach(() => {
  window.innerWidth = 375;
});

// `useViewportTier` decides between 'laptop' and 'desktop' by checking two
// overlapping `min-width` queries at once — desktop matches both. Mirrors
// `useViewportTier.ts`'s own query strings rather than picking new ones: a
// stub built from different numbers would prove nothing about the hook this
// file drives through them.
const TIER_QUERIES: Record<Tier, string[]> = {
  phone: ['(max-width: 639.98px)'],
  tablet: [],
  laptop: ['(min-width: 1024px)'],
  desktop: ['(min-width: 1024px)', '(min-width: 1536px)'],
};

// Captured once, before any test can have replaced it — this is the
// `tests/setup.ts` stub that reads `window.innerWidth`, which most of this
// file's tests still drive directly rather than through `tier`.
const innerWidthMatchMedia = window.matchMedia;

/**
 * Same shape as `useViewportTier.test.ts`'s own `matchOnly`: pins the exact
 * query set the hook checks, so a test can choose a tier directly instead of
 * reasoning about which `innerWidth` would produce it under the shared
 * `tests/setup.ts` stub.
 */
function matchOnly(...matching: string[]) {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

// Only tests that ask for a `tier` replace `window.matchMedia`; every other
// test in this file still relies on the `innerWidth`-driven stub, so a swap
// left in place by one test would silently misreport the tier for the next.
afterEach(() => {
  window.matchMedia = innerWidthMatchMedia;
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
  options: { deadNotes?: boolean; nudge?: boolean; running?: boolean; tier?: Tier } = {},
) {
  if (options.tier !== undefined) matchOnly(...TIER_QUERIES[options.tier]);
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

/** The one live region inside a subtree, which is all a swapping column may have. */
function liveRegionIn(root: HTMLElement): HTMLElement {
  const regions = root.querySelectorAll<HTMLElement>('[aria-live]');
  expect(regions).toHaveLength(1);
  return regions[0];
}

describe('the game screen at each tier', () => {
  it('gives the phone one column and the coach no space in flow', () => {
    renderGame({ tier: 'phone' });
    expectOnlyTheBoardAndKeypadInFlow();
    expect(screen.queryByTestId('coach-column')).toBeNull();
  });

  it('puts the coach beside the board on a laptop', () => {
    renderGame({ tier: 'laptop' });
    expect(screen.getByTestId('coach-column')).toBeTruthy();
    expect(screen.queryByTestId('lesson-column')).toBeNull();
  });

  it('adds the lesson column on a desktop', () => {
    renderGame({ tier: 'desktop' });
    expect(screen.getByTestId('coach-column')).toBeTruthy();
    expect(screen.getByTestId('lesson-column')).toBeTruthy();
  });

  it('keeps the tablet stacked, but lets the board past the phone cap', () => {
    renderGame({ tier: 'tablet' });
    expect(screen.queryByTestId('coach-column')).toBeNull();
    // The cap lives on the root column, not on <main>, and it is raised only
    // from `sm` up — below 640 the phone keeps the 576px column it shipped with.
    const root = screen.getByRole('main').parentElement!;
    expect(root.className).toContain('max-w-xl');
    expect(root.className).toContain('sm:max-w-[40rem]');
  });
});

describe('the lesson column', () => {
  it('shows the technique index until the coach has named a technique', () => {
    renderGame({ tier: 'desktop' });
    const lesson = screen.getByTestId('lesson-column');
    expect(within(lesson).getByRole('heading', { name: /techniques/i })).toBeTruthy();
  });

  // The one that matters: a sidebar that prints the lesson at level 1 hands
  // over the rung the ladder is deliberately withholding. "Where should I
  // look?" (coach.rung1.ask) only ever produces a level-1 hint — the coach's
  // own `resumeLevel` picker starts every fresh exchange there — so if the
  // lesson region's gate were `level >= 1` instead of `level >= 2`, this is
  // the click that would catch it: the index would vanish and the lesson
  // would take its place, one rung early.
  it('does not name the technique in the sidebar at disclosure level 1', async () => {
    const { user } = renderGame({ tier: 'desktop' });
    await user.click(screen.getByRole('button', { name: /where should i look/i }));
    const lesson = screen.getByTestId('lesson-column');
    expect(within(lesson).getByRole('heading', { name: /techniques/i })).toBeTruthy();
  });

  // `useCoachSession.startDrill` names the technique — `coach.hint(finding, 2)`,
  // logged before `drill` is even set — and then sets `hint` back to `null` so
  // the panel can show the challenge banner instead of hint text. A gate that
  // only reads `coach.hint` misses that a level-2 disclosure already
  // happened: the coach says "there is a hidden single here" while the
  // sidebar still shows the index, which reads as a bug rather than as
  // discipline. The proof of the swap is `LessonBody`'s own "What it is"
  // heading, which no other state of this column renders — that says the
  // lesson is there without hardcoding which technique this fixed board's
  // first finding turns out to be. (It used to check for an `<h1>`; the
  // lesson's title is an `<h2>` in this column now, and the reason is in
  // `LessonBody`'s `titleAs`.)
  it('names the technique in the sidebar once a drill has named it', async () => {
    const { user } = renderGame({ tier: 'desktop' });
    // `CoachPanel` renders this control twice — an icon-only `sm:hidden`
    // button for the phone and a spelled-out `hidden sm:block` one for wide
    // screens, both with the same accessible name — because jsdom applies no
    // stylesheet, both are visible to `getByRole`. Only the spelled-out one
    // has "Set me a challenge" as its own text content; the icon-only one
    // carries the same string solely as an `aria-label`. `getByText` finds
    // the former without depending on DOM order between the two.
    const drillButton = screen.getByText('Set me a challenge').closest('button');
    expect(drillButton).not.toBeNull();
    await user.click(drillButton!);
    const lesson = screen.getByTestId('lesson-column');
    expect(within(lesson).getByRole('heading', { name: 'What it is' })).toBeTruthy();
    expect(within(lesson).queryByRole('heading', { name: /techniques/i })).toBeNull();
  });

  // The lesson's title is an `<h1>` on Learn, where the lesson is the
  // document. Here the document is a game in progress: an `<h1>` in this
  // column would be the play screen's only top-level heading, and one that
  // appears and disappears with the disclosure ladder — the outline gaining
  // and losing its root as the player asks for hints.
  it('does not make a sidebar the play screen the only h1', async () => {
    const { user } = renderGame({ tier: 'desktop' });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    await user.click(screen.getByText('Set me a challenge').closest('button')!);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  // The worked example is an illustration: its `onSelect` is a no-op, so a
  // keyboard player who tabs off the keypad and lands in it can neither move
  // within it nor do anything there. Beside a live board that dead stop sits
  // in the player's own path.
  it('keeps the worked example out of the tab order', async () => {
    const { user } = renderGame({ tier: 'desktop' });
    await user.click(screen.getByText('Set me a challenge').closest('button')!);
    const lesson = screen.getByTestId('lesson-column');
    const example = within(lesson).getByRole('grid');
    expect(example.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
  });
});

/*
 * Announce the change, not the content.
 *
 * The column must not swap silently — a player who has just paid for rung 2
 * should hear that the sidebar answered. But the first attempt put
 * `aria-live="polite"` on the `<aside>` wrapping the whole lesson, and with
 * the default `aria-relevant="additions text"` that makes the entire incoming
 * subtree an addition: title, one-liner, mastery chip, both prose sections,
 * the figcaption, and `Example`'s 81-cell grid, every cell of which carries
 * an `aria-label` like "r3c4, empty, notes 1, 4, 9". Several hundred words,
 * read at a player mid-move, in both directions of the swap. Neither axe nor
 * any test then in the suite could see it, which is why it survived two
 * reviews; these three are what would have caught it.
 */
describe('the lesson column announces the change, not the lesson', () => {
  it('says only which column changed and what it is now showing', () => {
    renderGame({ tier: 'desktop' });
    const lesson = screen.getByTestId('lesson-column');
    // The aside itself must be inert: it is the thing that wraps the content.
    expect(lesson.hasAttribute('aria-live')).toBe(false);
    expect(liveRegionIn(lesson).textContent).toBe('Lesson: The techniques');
  });

  it('mutates that one node rather than replacing it', async () => {
    const { user } = renderGame({ tier: 'desktop' });
    const lesson = screen.getByTestId('lesson-column');
    const before = liveRegionIn(lesson);
    await user.click(screen.getByText('Set me a challenge').closest('button')!);

    // The same DOM node, or the region is itself an addition on every swap —
    // and a live region that arrives with its text already in it is exactly
    // the case a screen reader announces wholesale.
    const after = liveRegionIn(lesson);
    expect(after).toBe(before);
    expect(after.textContent).toMatch(/^Lesson: .+/);
    expect(after.textContent).not.toBe('Lesson: The techniques');
  });

  it('never puts the lesson itself inside a live region', async () => {
    const { user } = renderGame({ tier: 'desktop' });
    await user.click(screen.getByText('Set me a challenge').closest('button')!);
    // Every live region on the screen, not just this column's: the defect is
    // "a region wraps something that would be read in full", and the board is
    // the other 81-cell grid this screen has.
    for (const region of document.querySelectorAll('[aria-live]')) {
      expect(region.querySelector('[role="grid"]')).toBeNull();
      expect(region.querySelector('h1, h2, h3')).toBeNull();
    }
  });
});

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
