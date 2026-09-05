# Mistake Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player who has reached an unfinishable board walk back to their mistake and read the path, stop auto-clear from acting on a digit that already breaks the rules, and place a cell's last remaining note without typing it.

**Architecture:** Three changes, no new reducer action and no new `Move` kind. The rewind is the existing `undo` plus a three-state machine in the view; the trail it shows is `redoStack`, which already records exactly what was undone. The auto-clear gate is a peer scan at the placement site. The promote gesture is a long press extracted out of `Keypad` into a shared hook and reused on `Cell`.

**Tech Stack:** React 19 + TypeScript, Zustand stores, Tailwind v4 (CSS-first `@theme`, no config file), vitest + @testing-library/react, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-09-05-mistake-recovery-design.md` — read it before Task 1. It carries the reasoning; this plan carries the steps.

## Global Constraints

- **`npm run verify` is the gate** = lint → `tsc -b` → vitest → build. Never weaken a config to make it pass.
- **Run the mutation on every new test.** Break the thing the test covers, watch it fail, restore it, watch it pass. A test that has never been seen red is not evidence. Say so in the commit if a claim could not be made to fail.
- **Every user-visible string comes from `src/i18n`.** A new key MUST be added to BOTH `src/i18n/en.ts` and `src/i18n/it.ts` — `src/i18n/i18n.test.ts` enforces key and placeholder parity across locales and will fail the build otherwise. Italian copy here is a first draft for review under issue #65; write it, do not skip it.
- **Invariant 2: the solution never leaves the engine as an answer.** `contradictionAt` may be consulted; the digit the solution expects must never be rendered, logged, or inferable from something the player can see.
- **Invariant 9: the board never gives up its box.** Nothing that appears or disappears during play may resize the board. Everything this plan adds lives inside the coach panel's or the keypad's existing box.
- **Invariant 1: the app never silently edits a player's marks.** `autoClearDeadNotes` is the explicitly-requested branch and stays a separate move.
- **`Cell` is memoized under a stated contract** (`src/ui/board/Cell.tsx:1-21`): props stay primitives, and callbacks are ONE stable function shared by all 81 cells that takes the index as an argument. Never pass a per-cell arrow from `SudokuGrid`.
- **Colours come from the 16 tokens in `src/index.css`.** The amber is `--color-coach`. Do not add a token.
- **Commit messages explain the reasoning, not the file list.** Every commit below ends with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
```

---

### Task 1: `deadEndCells` — the rules noticing an unfinishable board

**Files:**
- Modify: `src/coach/triggers.ts` (add an exported function after `constraintBreach`, which ends at line 137)
- Test: `src/coach/triggers.test.ts`

**Interfaces:**
- Consumes: `TriggerCell` (`src/coach/triggers.ts:34`), `Board.fromValues` / `Board.trueCandidates` (`src/engine/board.ts:110,130`)
- Produces: `deadEndCells(cells: readonly TriggerCell[]): CellIndex[]` — every empty cell with no digit left to take, ascending. Task 3 consumes it.

- [ ] **Step 1: Write the failing tests**

Append to `src/coach/triggers.test.ts`. The existing helpers `cellsOf`, `BASE` and `PUZZLE` are already in that file (`triggers.test.ts:29,52,27`); add `deadEndCells` to the existing import block from `./triggers`.

```ts
describe('deadEndCells', () => {
  /** The finished puzzle, as the triggers see it. */
  const solvedCells = (): TriggerCell[] =>
    [...PUZZLE.solution].map((ch) => ({
      value: Number(ch) as Digit,
      given: true,
      candidates: new Set<Digit>(),
    }));

  it('is silent while every empty cell still has a digit it can take', () => {
    expect(deadEndCells(BASE)).toEqual([]);
  });

  it('finds the cell a wrong entry has left with nothing', () => {
    // r1c1 and r1c2 emptied, then r1c1 given r1c2's digit. The row now wants
    // only r1c1's digit and r1c2's column already holds it, so r1c2 has
    // nothing left. The rules alone prove that — nothing here reads the
    // solution to reach the answer, only to build the fixture.
    const cells = solvedCells();
    cells[0] = { ...cells[0], value: Number(PUZZLE.solution[1]) as Digit, given: false };
    cells[1] = { ...cells[1], value: null, given: false };

    expect(deadEndCells(cells)).toEqual([1]);
  });

  it('says nothing about a filled cell, however wrong it is', () => {
    const cells = solvedCells();
    cells[0] = { ...cells[0], value: Number(PUZZLE.solution[1]) as Digit, given: false };

    expect(deadEndCells(cells)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/coach/triggers.test.ts > /tmp/t1.log 2>&1; tail -20 /tmp/t1.log`
Expected: FAIL — `deadEndCells is not a function` / TypeScript cannot resolve the import.

- [ ] **Step 3: Implement**

Add to `src/coach/triggers.ts`, immediately after `constraintBreach` (which ends at line 137):

```ts
/**
 * Every empty cell with no digit left to take, ascending.
 *
 * The board cannot be finished from here, and a generated puzzle has exactly
 * one solution — so this is proof that something already placed is wrong. It
 * is proof the *rules* give, which is what makes it usable where
 * `contradictionAt` is not: nothing here reads the solution.
 *
 * `constraintBreach` asks the same question of one cell's peers. This asks it
 * of the board, because the player who needs the answer is the one who cannot
 * find anywhere to write at all.
 */
export function deadEndCells(cells: readonly TriggerCell[]): CellIndex[] {
  const board = Board.fromValues(cells.map((c) => c.value));
  const out: CellIndex[] = [];
  for (let cell = 0; cell < cells.length; cell++) {
    if (board.values[cell] === null && board.trueCandidates(cell).size === 0) out.push(cell);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/coach/triggers.test.ts > /tmp/t1.log 2>&1; tail -20 /tmp/t1.log`
Expected: PASS.

- [ ] **Step 5: Run the mutation**

Change `board.trueCandidates(cell).size === 0` to `board.trueCandidates(cell).size === 1`, re-run.
Expected: FAIL on "finds the cell a wrong entry has left with nothing".
Restore the line, re-run, expect PASS. If the test passed with the mutation in place, the fixture is not stranding anything — fix the fixture, not the assertion.

- [ ] **Step 6: Commit**

```bash
git add src/coach/triggers.ts src/coach/triggers.test.ts
git commit -F - <<'MSG'
feat(coach): notice a board that cannot be finished, using the rules alone

A player who has nowhere left to write is the one who most needs to be told
something is wrong, and this is the form of "wrong" that needs no solution to
see: an empty cell with no digit any of its peers has left it.

constraintBreach already asks this of one cell's peers. The rewind needs it
asked of the whole board, so it is its own function rather than a widened
private branch of that one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 2: The rewind state machine and its trail

**Files:**
- Create: `src/app/rewind.ts`
- Test: `src/app/rewind.test.ts`

**Interfaces:**
- Consumes: `Move`, `MoveKind` (`src/state/types.ts:18,7`), `CellIndex`, `Digit` (`src/engine/types.ts`)
- Produces:
  - `type RewindPhase = 'off' | 'active' | 'done'`
  - `nextRewindPhase(phase: RewindPhase, input: { deadEnd: boolean; contradicted: boolean; canRedo: boolean }): RewindPhase`
  - `interface RewindStep { cell: CellIndex; digit: Digit | null; label: RewindLabel }`
  - `type RewindLabel = 'placed' | 'cleared' | 'noted' | 'unnoted'`
  - `rewindTrail(redoStack: readonly Move[]): RewindStep[]`
  - `const MAX_TRAIL = 12`
  Tasks 3 and 4 consume all of these.

This module is pure and lives beside `src/app/greenHighlight.ts`, which is the precedent: view rules that are worth testing without a rendered component.

- [ ] **Step 1: Write the failing tests**

Create `src/app/rewind.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Move } from '../state/types';
import { MAX_TRAIL, nextRewindPhase, rewindTrail } from './rewind';

const move = (cell: number, kind: Move['kind'], digit?: number, at = 1): Move =>
  ({ kind, cell, digit, prev: { value: null, candidates: [] }, at }) as Move;

describe('nextRewindPhase', () => {
  it('arms at a dead end', () => {
    expect(nextRewindPhase('off', { deadEnd: true, contradicted: true, canRedo: false })).toBe(
      'active',
    );
  });

  it('stays off while a wrong digit is on the board but the board still works', () => {
    // The contradiction nudge's job, not the rewind's: the player can still
    // play, and arming here would put the board in recovery every time a
    // digit went in wrong.
    expect(nextRewindPhase('off', { deadEnd: false, contradicted: true, canRedo: false })).toBe(
      'off',
    );
  });

  it('stays active while the wrong digit is still on the board', () => {
    expect(nextRewindPhase('active', { deadEnd: false, contradicted: true, canRedo: true })).toBe(
      'active',
    );
  });

  it('goes to done on the step that removes the wrong digit', () => {
    expect(nextRewindPhase('active', { deadEnd: false, contradicted: false, canRedo: true })).toBe(
      'done',
    );
  });

  it('holds done while the undone moves can still be restored', () => {
    expect(nextRewindPhase('done', { deadEnd: false, contradicted: false, canRedo: true })).toBe(
      'done',
    );
  });

  it('goes off when the undone moves are gone', () => {
    // Either the player redid them or they made a new move, which invalidates
    // the redo branch. Both mean the trail describes nothing restorable.
    expect(nextRewindPhase('done', { deadEnd: false, contradicted: false, canRedo: false })).toBe(
      'off',
    );
  });

  it('re-arms if a second mistake strands the board again', () => {
    expect(nextRewindPhase('done', { deadEnd: true, contradicted: true, canRedo: true })).toBe(
      'active',
    );
  });
});

describe('rewindTrail', () => {
  it('reads newest first, which is the order the player walked back', () => {
    const trail = rewindTrail([move(10, 'set', 4), move(20, 'addCandidate', 7)]);
    expect(trail.map((s) => s.cell)).toEqual([20, 10]);
  });

  it('names what each move did', () => {
    const trail = rewindTrail([
      move(1, 'set', 4),
      move(2, 'clear'),
      move(3, 'addCandidate', 7),
      move(4, 'removeCandidate', 8),
    ]);
    expect(trail.map((s) => s.label)).toEqual(['unnoted', 'noted', 'cleared', 'placed']);
    expect(trail.map((s) => s.digit)).toEqual([8, 7, null, 4]);
  });

  it('caps the trail, because a long rewind is not a long list', () => {
    const many = Array.from({ length: MAX_TRAIL + 5 }, (_, i) => move(i, 'set', 1));
    expect(rewindTrail(many)).toHaveLength(MAX_TRAIL);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/app/rewind.test.ts > /tmp/t2.log 2>&1; tail -20 /tmp/t2.log`
Expected: FAIL — cannot resolve `./rewind`.

- [ ] **Step 3: Implement**

Create `src/app/rewind.ts`:

```ts
/**
 * Recovering from a board that cannot be finished.
 *
 * Pure, for `greenHighlight.ts`'s reason: the interesting behaviour here is a
 * *transition*, and a transition asserted through a rendered component is
 * asserted through three other things that can also be wrong.
 *
 * The machine has three states and they are not symmetrical, deliberately:
 *
 * - `off`     nothing to recover from.
 * - `active`  the board is unfinishable and the wrong digit is still on it.
 * - `done`    the wrong digit is gone; the trail is still worth reading.
 *
 * It arms on a dead end and disarms on the absence of a contradiction, which
 * are different conditions on purpose. A dead end implies a contradiction, so
 * the two can never fight: while the board is still stuck, the disarming test
 * is false by construction. And it deliberately does NOT arm on a
 * contradiction alone — that is the nudge's job, and a board the player can
 * still play is not a board in recovery.
 */

import type { CellIndex, Digit } from '../engine/types';
import type { Move } from '../state/types';

export type RewindPhase = 'off' | 'active' | 'done';

export interface RewindInput {
  /** Some empty cell has no digit left to take (`deadEndCells`). */
  deadEnd: boolean;
  /** An entry still contradicts the solution (`contradictionAt`). */
  contradicted: boolean;
  /** Undone moves remain restorable — which is the trail's whole lifetime. */
  canRedo: boolean;
}

export function nextRewindPhase(phase: RewindPhase, input: RewindInput): RewindPhase {
  if (input.deadEnd) return 'active';
  if (input.contradicted) return phase === 'off' ? 'off' : 'active';
  if (phase === 'active') return 'done';
  if (phase === 'done' && !input.canRedo) return 'off';
  return phase;
}

export type RewindLabel = 'placed' | 'cleared' | 'noted' | 'unnoted';

export interface RewindStep {
  cell: CellIndex;
  /** The digit the move was about, or null for one that cleared a cell. */
  digit: Digit | null;
  label: RewindLabel;
}

/**
 * How many undone moves the trail shows. A rewind out of a deep mistake can
 * run to dozens of moves, and a list that long is scrolled past rather than
 * read — as well as being unbounded growth inside a panel that has to stay
 * inside its own box (invariant 9).
 */
export const MAX_TRAIL = 12;

const LABELS: Record<Move['kind'], RewindLabel> = {
  set: 'placed',
  clear: 'cleared',
  addCandidate: 'noted',
  fillCandidates: 'noted',
  removeCandidate: 'unnoted',
  clearCandidates: 'unnoted',
};

/**
 * The undone moves, newest first, capped.
 *
 * `redoStack` is chronological and is already exactly this record — undo
 * pushes onto it — so nothing new has to be stored to know what a rewind
 * walked back through. Reversed because the player's last step back is the
 * one they are still thinking about.
 */
export function rewindTrail(redoStack: readonly Move[]): RewindStep[] {
  const out: RewindStep[] = [];
  for (let i = redoStack.length - 1; i >= 0 && out.length < MAX_TRAIL; i--) {
    const move = redoStack[i];
    out.push({ cell: move.cell, digit: move.digit ?? null, label: LABELS[move.kind] });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/app/rewind.test.ts > /tmp/t2.log 2>&1; tail -20 /tmp/t2.log`
Expected: PASS.

- [ ] **Step 5: Run the mutation**

Two mutations, both required:
1. In `nextRewindPhase`, change `if (input.contradicted) return phase === 'off' ? 'off' : 'active';` to `return 'active';` — re-run, expect FAIL on "stays off while a wrong digit is on the board but the board still works". Restore.
2. In `rewindTrail`, remove the `out.length < MAX_TRAIL` condition — re-run, expect FAIL on the cap test. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/app/rewind.ts src/app/rewind.test.ts
git commit -F - <<'MSG'
feat(app): the rewind's three states, and the trail as a reading of redoStack

Arming and disarming are different conditions on purpose. It arms at a dead
end — the board the player cannot write in at all — and disarms the moment no
entry contradicts the solution any more, which is one step earlier and is the
step that actually removed the mistake. They cannot fight: a dead end implies
a contradiction, so while the board is stuck the disarming test is false.

It deliberately does not arm on a contradiction alone. That is the nudge's
job, and a board that can still be played is not a board in recovery.

The trail stores nothing new. redoStack already *is* the record of what an
undo walked back through, so the panel reads it backwards and caps it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 3: The amber undo

**Files:**
- Modify: `src/app/useCoachSession.ts:111` — export the existing private `triggerCells` helper
- Modify: `src/app/GameView.tsx` — the latch, and the new Keypad prop
- Modify: `src/ui/keypad/Keypad.tsx:29-95` (props), `:418-424` (the undo button)
- Modify: `src/i18n/en.ts`, `src/i18n/it.ts`
- Test: `src/app/GameView.rewind.test.tsx` (create)

**Interfaces:**
- Consumes: `deadEndCells` (Task 1), `nextRewindPhase` / `RewindPhase` (Task 2), `contradictionAt` (`src/coach/triggers.ts:77`)
- Produces: `KeypadProps.rewinding?: boolean`; `GameView`'s `rewind: RewindPhase` local, which Task 4 also reads.

- [ ] **Step 1: Add the strings**

In `src/i18n/en.ts`, append before the closing `} as const;` (line 300):

```ts
  'action.undoRewind': 'Undo — one of your digits is wrong',
  'keypad.captionRewind': 'Rewind',
```

In `src/i18n/it.ts`, append in the same place:

```ts
  'action.undoRewind': 'Annulla — una delle tue cifre è sbagliata',
  'keypad.captionRewind': 'Torna indietro',
```

- [ ] **Step 2: Write the failing test**

Create `src/app/GameView.rewind.test.tsx`. Copy the `Host` render pattern from `GameView.settings.test.tsx:88-139` verbatim — it reads the live game out of the store, which is required here because every assertion is about what a *dispatch* did:

```tsx
// Dexie captures the global `indexedDB` on import and `GameView` reaches it
// transitively — same reasoning as `GameView.layout.test.tsx`.
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
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

/**
 * A game stranded the way a real one strands: every empty cell filled from
 * the solution except r1c3 and r1c4, then r1c3 given r1c4's digit. r1c4's row
 * now wants only r1c3's digit and its column already holds it, so nothing can
 * go there — and the digit in r1c3 conflicts with no peer, which is what makes
 * this the case the conflict colour cannot catch.
 */
function strandedGame(): LiveGame {
  let game = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `rewind-test-${counter++}`,
    running: true,
  });
  let at = 1100;
  for (let cell = 0; cell < 81; cell++) {
    if (PUZZLE[cell] !== '.' || cell === 2 || cell === 3) continue;
    game = reduce(game, {
      type: 'setValue',
      cell,
      digit: Number(SOLVED[cell]) as never,
      at: at++,
    });
  }
  game = reduce(game, { type: 'setValue', cell: 2, digit: Number(SOLVED[3]) as never, at: at++ });
  return game;
}

const SETTINGS: PlayerProfile['settings'] = { ...DEFAULT_PROFILE.settings, haptics: false };
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

/** Cells name themselves with `data-cell`, the same handle the e2e reads. */
function cell(index: number): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
  if (node === null) throw new Error(`no cell ${index} on the board`);
  return node;
}

function renderGame(game: LiveGame) {
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });
  useProfile.setState((state) => ({
    profile: { ...state.profile, locale: 'en', settings: SETTINGS },
  }));

  function Host() {
    const live = useGameStore((state) =>
      state.activeGameId === null ? null : (state.games[state.activeGameId] ?? null),
    );
    if (live === null) return null;
    return (
      <GameView
        game={live}
        settings={SETTINGS}
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

describe('the amber rewind', () => {
  it('turns the undo key amber when the board cannot be finished', async () => {
    renderGame(strandedGame());

    expect(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    ).toBeTruthy();
  });

  it('goes back to being undo on the press that removes the wrong digit', async () => {
    const { user } = renderGame(strandedGame());

    await user.click(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    );

    expect(await screen.findByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo — one of your digits is wrong' })).toBeNull();
  });

  it('redo puts the whole rewind back, for a player who was wrong about being wrong', async () => {
    // Stepping back is the ordinary undo, so every step lands on redoStack and
    // nothing about a rewind is one-way. This is why it needs no confirmation.
    const { user } = renderGame(strandedGame());
    const before = cell(2).textContent;

    await user.click(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    );
    await user.click(screen.getByRole('button', { name: 'Redo' }));

    expect(cell(2).textContent).toBe(before);
    expect(
      await screen.findByRole('button', { name: 'Undo — one of your digits is wrong' }),
    ).toBeTruthy();
  });

  it('leaves the undo key alone on an ordinary board', () => {
    const plain = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `rewind-test-${counter++}`,
      running: true,
    });
    renderGame(plain);

    expect(screen.queryByRole('button', { name: 'Undo — one of your digits is wrong' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run src/app/GameView.rewind.test.tsx > /tmp/t3.log 2>&1; tail -30 /tmp/t3.log`
Expected: FAIL — no button by that name.

- [ ] **Step 4: Export `triggerCells` so the view and the coach agree on the shape**

In `src/app/useCoachSession.ts:111`, change:

```ts
const triggerCells = (game: LiveGame): TriggerCell[] =>
```

to:

```ts
/** Exported so the view's own trigger reads use the same shape, not a copy. */
export const triggerCells = (game: LiveGame): TriggerCell[] =>
```

- [ ] **Step 5: Add the Keypad prop and the amber undo**

In `src/ui/keypad/Keypad.tsx`, add to `KeypadProps` (after `canRedo?: boolean;`, line 53):

```tsx
  /**
   * The board cannot be finished and the wrong digit is still on it. Undo
   * wears the coach's amber and says what it is for, and goes back to being
   * an ordinary undo the press that takes the digit off the board.
   *
   * The state is in the accessible name, not only in the colour: a caption is
   * inside a button whose `aria-label` overrides its contents, so a caption
   * alone would say this to sighted players and nobody else.
   */
  rewinding?: boolean;
```

Add `rewinding = false,` to the destructure alongside `canUndo = true` (line ~137).

Replace the undo `IconButton` at `Keypad.tsx:418-424` with:

```tsx
        <IconButton
          label={rewinding ? t('action.undoRewind') : t('action.undo')}
          caption={rewinding ? t('keypad.captionRewind') : t('keypad.captionUndo')}
          icon={<UndoIcon />}
          // The clear-stale key's treatment, for the same reason and from the
          // same token: amber is the coach's colour and means "something to do
          // here". The `!` prefixes are load-bearing — IconButton sets its own
          // border/bg/text and Tailwind's emission order decides the winner.
          className={
            rewinding
              ? '!border-coach !bg-coach !text-paper hover:!border-coach hover:!text-paper'
              : undefined
          }
          disabled={!canUndo}
          onClick={() => fire('tap', onUndo)}
        />
```

- [ ] **Step 6: Wire the latch in GameView**

Add to the imports in `src/app/GameView.tsx`:

```tsx
import { contradictionAt, deadEndCells } from '../coach/triggers';
import { nextRewindPhase, type RewindPhase } from './rewind';
import { triggerCells } from './useCoachSession';
```

(`useCoachSession` is already imported there — extend that import rather than adding a second.)

After the `conflicts` memo (`GameView.tsx:214-217`), add:

```tsx
  /*
   * The rewind's two inputs. Both are recomputed only when the reducer
   * replaces the game, which is the same budget `conflicts` above already
   * spends — one board scan per move, not one per render.
   */
  const triggers = useMemo(() => triggerCells(game), [game]);
  const deadEnd = useMemo(() => deadEndCells(triggers).length > 0, [triggers]);
  const contradicted = useMemo(
    () => contradictionAt(triggers, game.solution, game.undoStack) !== null,
    [triggers, game.solution, game.undoStack],
  );
  const [rewind, setRewind] = useState<RewindPhase>('off');
  useEffect(() => {
    setRewind((phase) =>
      nextRewindPhase(phase, { deadEnd, contradicted, canRedo: game.redoStack.length > 0 }),
    );
  }, [deadEnd, contradicted, game.redoStack.length]);
```

Pass it to the keypad — add to the `<Keypad>` props, next to `canUndo` (`GameView.tsx:621`):

```tsx
      rewinding={rewind === 'active'}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run src/app/GameView.rewind.test.tsx > /tmp/t3.log 2>&1; tail -30 /tmp/t3.log`
Expected: PASS, all three.

- [ ] **Step 8: Run the mutation**

In `GameView.tsx`, change `rewinding={rewind === 'active'}` to `rewinding={false}` — re-run, expect FAIL on the first two tests. Restore.

Then change the latch's `deadEnd` to `contradicted` in the `nextRewindPhase` call — re-run, expect FAIL on "leaves the undo key alone on an ordinary board"? It will NOT fail, because that board has no wrong digit. That is the point of the third test being weaker than it looks: add this fourth test rather than leaving the gap, then restore the mutation:

```tsx
  it('does not arm merely because a digit is wrong — the board still plays', async () => {
    // SOLVED[2] is '4'; a 9 there contradicts the solution but strands nothing,
    // so the nudge is the right response and the rewind is not.
    const plain = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `rewind-test-${counter++}`,
      running: true,
    });
    const wrong = reduce(plain, { type: 'setValue', cell: 2, digit: 9, at: 1100 });
    renderGame(wrong);

    expect(screen.queryByRole('button', { name: 'Undo — one of your digits is wrong' })).toBeNull();
  });
```

- [ ] **Step 9: Run the whole suite and commit**

Run: `npm run verify > /tmp/verify3.log 2>&1; tail -20 /tmp/verify3.log`
Expected: green. `Keypad.test.tsx` still passes — the undo button's default name is unchanged.

```bash
git add src/app/rewind.ts src/app/GameView.tsx src/app/GameView.rewind.test.tsx src/app/useCoachSession.ts src/ui/keypad/Keypad.tsx src/i18n/en.ts src/i18n/it.ts
git commit -F - <<'MSG'
feat(board): undo goes amber on a board that cannot be finished

Reaching a square where no digit fits used to leave one honest and useless
option: the coach saying a digit was wrong, and "Not now". The remedy was to
undo by feel or to abandon the game.

Undo now says what it is for while the board is stranded, and goes back to
being undo on the press that takes the wrong digit off. That press is also the
disclosure: it tells the player which move was wrong, and in a cell they had
narrowed to two candidates it tells them the other digit. Accepted
deliberately — the nudge already says a mistake exists, and walking back until
it clears arrives at the same place by hand. The reasoning is in the spec.

The state is in the button's accessible name and not only in its colour: a
caption sits inside a button whose aria-label overrides its contents, so a
caption alone would say this to sighted players and to nobody else.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 4: The rewind trail in the coach panel

**Files:**
- Modify: `src/ui/coach/CoachPanel.tsx` — props and one new block after the nudge (`:290-308`)
- Modify: `src/app/GameView.tsx` — pass the trail
- Modify: `src/i18n/en.ts`, `src/i18n/it.ts`
- Test: `src/ui/coach/CoachPanel.test.tsx`

**Interfaces:**
- Consumes: `rewindTrail`, `RewindStep` (Task 2); `rewind` phase (Task 3); `cellName` (`src/engine/board.ts`, already used by `src/coach/format.ts:31`)
- Produces: `CoachPanelProps.rewindTrail?: readonly RewindStep[]` and `CoachPanelProps.rewinding?: boolean`

- [ ] **Step 1: Add the strings**

`src/i18n/en.ts`, before the closing `} as const;`:

```ts
  'coach.rewind.active': 'This board cannot be finished. Step back with Undo until this clears.',
  'coach.rewind.done': 'Back to a board that works. Here is what you undid.',
  'coach.rewind.placed': '{digit} in {cell}',
  'coach.rewind.cleared': 'cleared {cell}',
  'coach.rewind.noted': 'noted {digit} in {cell}',
  'coach.rewind.unnoted': 'took the note {digit} off {cell}',
```

`src/i18n/it.ts`, same place:

```ts
  'coach.rewind.active': 'Questa griglia non si può completare. Torna indietro con Annulla finché questo avviso non sparisce.',
  'coach.rewind.done': 'Sei tornato a una griglia che funziona. Ecco cosa hai annullato.',
  'coach.rewind.placed': '{digit} in {cell}',
  'coach.rewind.cleared': 'svuotata {cell}',
  'coach.rewind.noted': 'annotato {digit} in {cell}',
  'coach.rewind.unnoted': 'tolta l\'annotazione {digit} da {cell}',
```

- [ ] **Step 2: Write the failing test**

Append to `src/ui/coach/CoachPanel.test.tsx`. Do not depend on that file's existing render helper — render the panel directly with only its required props, so this block is self-contained:

```tsx
describe('the rewind trail', () => {
  const renderTrail = (props: Partial<CoachPanelProps>) =>
    render(
      <LocaleProvider locale="en">
        <CoachPanel
          hint={null}
          onAsk={() => undefined}
          onEscalate={() => undefined}
          {...props}
        />
      </LocaleProvider>,
    );

  const TRAIL = [
    { cell: 3, digit: 9 as const, label: 'placed' as const },
    { cell: 2, digit: 7 as const, label: 'noted' as const },
  ];

  it('lists the undone moves newest first, and says the board is still wrong', () => {
    renderTrail({ rewindTrail: TRAIL, rewinding: true });

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('r1c4');
    expect(items[1].textContent).toContain('r1c3');
    expect(screen.getByText(/cannot be finished/)).toBeTruthy();
  });

  it('changes what it says once the board works again', () => {
    renderTrail({ rewindTrail: TRAIL, rewinding: false });

    expect(screen.getByText(/Back to a board that works/)).toBeTruthy();
  });

  it('shows nothing at all with no trail', () => {
    renderTrail({ rewindTrail: [], rewinding: false });

    expect(screen.queryByRole('list')).toBeNull();
  });
});
```

`CoachPanelProps` and `LocaleProvider` are already imported in that file; add `render` from `@testing-library/react` if it is not.

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/ui/coach/CoachPanel.test.tsx > /tmp/t4.log 2>&1; tail -30 /tmp/t4.log`
Expected: FAIL — no list rendered.

- [ ] **Step 4: Implement the panel block**

Add to `CoachPanelProps` in `src/ui/coach/CoachPanel.tsx`, after `onDismissNudge` (line 96):

```tsx
  /**
   * What a rewind has undone, newest first. Empty outside a rewind.
   *
   * Read after stepping rather than during it: on a phone this panel is a
   * sheet that covers the keypad the player is tapping. `redoStack` outlives
   * the rewind, so the path is still here when they open it.
   */
  rewindTrail?: readonly RewindStep[];
  /** The board is still unfinishable — a rewind in progress, not a record. */
  rewinding?: boolean;
```

Add the imports:

```tsx
import { cellName } from '../../engine/board';
import type { RewindStep } from '../../app/rewind';
```

Add `rewindTrail`, `rewinding = false` to the destructure.

Insert immediately after the nudge block (which closes at line 308) — before the ladder:

```tsx
      {/* Below the nudge and above the ladder: it is the more specific thing
          to be looking at than the resting invitation, and less urgent than
          the coach noticing something on its own. Inside the panel's own box,
          so invariant 9 holds. */}
      {rewindTrail !== undefined && rewindTrail.length > 0 ? (
        <div className="mx-4 mt-3 rounded-cell border border-coach/35 bg-coach-wash px-4 py-3">
          <p className="text-sm text-coach">
            {rewinding ? t('coach.rewind.active') : t('coach.rewind.done')}
          </p>
          <ol className="mt-2 space-y-0.5">
            {rewindTrail.map((step, i) => (
              <li
                key={`${step.cell}-${step.label}-${i}`}
                className={cx(
                  'text-[0.8125rem] tabular-nums',
                  // The newest step is the one the player is still thinking
                  // about, and once the amber is out it is the move that was
                  // wrong.
                  i === 0 ? 'text-coach' : 'text-ink-soft',
                )}
              >
                {step.label === 'cleared'
                  ? t('coach.rewind.cleared', { cell: cellName(step.cell) })
                  : step.label === 'placed'
                    ? t('coach.rewind.placed', {
                        cell: cellName(step.cell),
                        digit: step.digit ?? 0,
                      })
                    : step.label === 'noted'
                      ? t('coach.rewind.noted', {
                          cell: cellName(step.cell),
                          digit: step.digit ?? 0,
                        })
                      : t('coach.rewind.unnoted', {
                          cell: cellName(step.cell),
                          digit: step.digit ?? 0,
                        })}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
```

- [ ] **Step 5: Pass it from GameView**

Add to the `<CoachPanel>` props (`GameView.tsx:679-724`), after `onDismissNudge`:

```tsx
          rewindTrail={rewind === 'off' ? EMPTY_TRAIL : rewindTrail(game.redoStack)}
          rewinding={rewind === 'active'}
```

Add near the other module constants (`GameView.tsx:86`):

```tsx
const EMPTY_TRAIL: readonly RewindStep[] = [];
```

and extend the `./rewind` import to `{ nextRewindPhase, rewindTrail, type RewindPhase, type RewindStep }`.

- [ ] **Step 6: Run and watch it pass**

Run: `npx vitest run src/ui/coach/CoachPanel.test.tsx > /tmp/t4.log 2>&1; tail -30 /tmp/t4.log`
Expected: PASS.

- [ ] **Step 7: Run the mutation**

Change `rewindTrail.map(...)` to `[...rewindTrail].reverse().map(...)` — re-run, expect FAIL on the newest-first assertion. Restore.

- [ ] **Step 8: Add the ordinary-undo guard**

This is the claim the design added on review, and it needs its own test in `src/app/GameView.rewind.test.tsx`:

```tsx
  it('an ordinary undo during normal play raises no trail', async () => {
    const plain = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `rewind-test-${counter++}`,
      running: true,
    });
    const played = reduce(plain, { type: 'setValue', cell: 2, digit: 4, at: 1100 });
    const { user } = renderGame(played);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.queryByText(/what you undid/)).toBeNull();
  });
```

Run it, watch it pass. Then mutate: change the `rewind === 'off' ? EMPTY_TRAIL : …` guard to always pass the trail — expect FAIL. Restore.

- [ ] **Step 9: Verify and commit**

Run: `npm run verify > /tmp/verify4.log 2>&1; tail -20 /tmp/verify4.log`

```bash
git add src/ui/coach/CoachPanel.tsx src/ui/coach/CoachPanel.test.tsx src/app/GameView.tsx src/app/GameView.rewind.test.tsx src/i18n/en.ts src/i18n/it.ts
git commit -F - <<'MSG'
feat(coach): show the path a rewind walked back through

Recovering from a mistake is only half of what was asked for. The other half
is seeing how the board got there, and redoStack already holds it — undo
pushes every reverted move onto it, chronologically, and it survives until
the player either restores those moves or makes a new one.

So the trail stores nothing and lives exactly as long as the moves it
describes are still restorable. An ordinary undo in normal play raises none of
it: pressing undo once is not a rewind and must not look like one.

It is read after stepping rather than during, because on a phone this panel is
a sheet covering the keypad being tapped. That is a compromise, not a design;
it is written down in the spec rather than hidden.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 5: Auto-clear leaves a conflicting digit's notes alone

**Files:**
- Modify: `src/app/GameView.tsx:342-369` — split `enter` into `place` + `enter`
- Test: `src/app/GameView.settings.test.tsx`

**Interfaces:**
- Consumes: `peersOf` (`src/engine/board.ts:67`)
- Produces: `place(cell: CellIndex, digit: Digit): void` in `GameView` — Task 8's promote handler calls it.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/GameView.settings.test.tsx`. Note `renderGame` there is `(settingsOverrides, game)`:

```tsx
  it('leaves the notes alone behind a digit that already breaks the rules', async () => {
    // r1c1 is a given 5. Placing a second 5 in r1c3 is a typo the rules can
    // see, and a typo must not cost the player their notes.
    const fresh = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `settings-test-${counter++}`,
      running: true,
    });
    const withNote = reduce(fresh, { type: 'addCandidate', cell: 3, digit: 5, at: 1100 });
    const { user } = renderGame({ autoClearDeadNotes: true }, withNote);

    await user.click(cell(2));
    await user.click(screen.getByRole('button', { name: 'Place 5' }));

    expect(cell(3).textContent).toContain('5');
  });

  it('still clears behind a digit that breaks nothing', async () => {
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

    expect(cell(2).textContent).not.toContain('9');
  });

  it('does not take its cue from the conflict colour being switched off', async () => {
    // The skip is keyed on the fact of the conflict, not on whether the
    // player has asked to see it. Turning a colour off changes what they see,
    // never what the app does on their behalf.
    const fresh = newGame({
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'medium',
      at: 1000,
      id: `settings-test-${counter++}`,
      running: true,
    });
    const withNote = reduce(fresh, { type: 'addCandidate', cell: 3, digit: 5, at: 1100 });
    const { user } = renderGame(
      { autoClearDeadNotes: true, highlightConflicts: false },
      withNote,
    );

    await user.click(cell(2));
    await user.click(screen.getByRole('button', { name: 'Place 5' }));

    expect(cell(3).textContent).toContain('5');
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/app/GameView.settings.test.tsx > /tmp/t5.log 2>&1; tail -30 /tmp/t5.log`
Expected: the first and third FAIL (the note is swept); the second PASSES already.

- [ ] **Step 3: Implement**

Replace `enter` at `src/app/GameView.tsx:342-369` with:

```tsx
  /**
   * Writes a digit, and runs the auto-clear the placement may have earned.
   *
   * Separate from `enter` because it is also what the promote gesture does:
   * promoting a lone note places a digit whatever mode the player is in, so
   * it cannot go through a path whose first decision is notes-or-values.
   */
  const place = useCallback(
    (cell: CellIndex, digit: Digit) => {
      dispatch({ type: 'setValue', cell, digit });
      /*
       * Auto-clear is dispatched here, as a consequence of the placement,
       * rather than by an effect watching the board. An effect would fire on
       * every render that found dead notes — including the render right after
       * an *undo* restored them, which would make undo unusable: the notes
       * would come back and be swept again before the player saw them. Tying
       * it to the move that killed them means it can only ever happen once,
       * for the reason the player caused.
       *
       * Its own move, deliberately (Paolo's call): one undo puts the notes
       * back and leaves the digit, so what the setting did on the player's
       * behalf is visible and reversible on its own. `clearStaleCandidates`
       * no-ops when nothing is dead — `commit` returns the game untouched on
       * an empty batch — so this costs a scan and nothing else.
       *
       * And not behind a digit that already breaks the rules. A placement
       * duplicating a peer is a typo far more often than it is a move, and
       * sweeping the notes it "kills" costs the player work they then have to
       * notice in time to undo. Read from the board rather than from
       * `settings.highlightConflicts`: turning the colour off changes what the
       * player sees, not what the app does for them.
       *
       * Wrong entries that break no rule are deliberately left alone. The
       * solution could catch those, but notes surviving a placement would then
       * be a visible tell that the digit is wrong — invariant 2 leaking out
       * through a side effect instead of through text.
       */
      const breaksARule = peersOf(cell).some((peer) => values[peer] === digit);
      if (settings.autoClearDeadNotes && !breaksARule) {
        dispatch({ type: 'clearStaleCandidates' });
      }
    },
    [dispatch, settings.autoClearDeadNotes, values],
  );

  const enter = useCallback(
    (cell: CellIndex, digit: Digit) => {
      if (pencilMode) {
        dispatch({ type: 'toggleCandidate', cell, digit });
        return;
      }
      place(cell, digit);
    },
    [dispatch, pencilMode, place],
  );
```

Add `peersOf` to the existing `../engine/board` import in `GameView.tsx`.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/app/GameView.settings.test.tsx > /tmp/t5.log 2>&1; tail -30 /tmp/t5.log`
Expected: PASS, including the existing auto-clear tests, which must not have changed behaviour.

- [ ] **Step 5: Run the mutation**

Change `!breaksARule` to `true` — re-run, expect FAIL on the first and third new tests. Restore.
Then change `values[peer] === digit` to `values[peer] === null` — re-run, expect FAIL on "still clears behind a digit that breaks nothing". Restore.

- [ ] **Step 6: Commit**

```bash
git add src/app/GameView.tsx src/app/GameView.settings.test.tsx
git commit -F - <<'MSG'
feat(board): a typo should not cost you your notes

Auto-clear treated every placement as authoritative, so a mistyped digit swept
away the notes it "killed". One undo put them back by design, but only for a
player who noticed in time — and the same undo took away the digit they were
mid-thought about.

A placement that duplicates a peer is a typo far more often than it is a move,
so it no longer clears anything. Keyed on the fact of the conflict rather than
on highlightConflicts: turning a colour off changes what the player sees, not
what the app does for them.

Wrong entries that break no rule are deliberately still swept. The solution
could catch those, but notes surviving a placement would then be a visible
tell that the digit is wrong — invariant 2 leaking through a side effect.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 6: Extract `useLongPress`

Pure refactor. No behaviour change, and `src/ui/keypad/Keypad.test.tsx` is the guard: it must pass untouched before and after.

**Files:**
- Create: `src/ui/primitives/useLongPress.ts`
- Modify: `src/ui/keypad/Keypad.tsx:97-113` (constants), `:156-226` (the press machinery), `:253-283` (the handlers)
- Test: `src/ui/keypad/Keypad.test.tsx` (unchanged — that is the point)

**Interfaces:**
- Produces: `useLongPress<T>(options: { onLongPress: (payload: T) => void; ms?: number; moveCancelPx?: number }): LongPress<T>` where

```ts
interface LongPress<T> {
  start: (payload: T, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
  /** True when this payload's press already fired, so its click must be swallowed. */
  consumeFired: (payload: T) => boolean;
}
```

Task 7 consumes it.

- [ ] **Step 1: Record the baseline**

Run: `npx vitest run src/ui/keypad/Keypad.test.tsx > /tmp/t6-before.log 2>&1; tail -5 /tmp/t6-before.log`
Note the passing count. It must be identical at the end.

- [ ] **Step 2: Create the hook**

Create `src/ui/primitives/useLongPress.ts`, moving the comments from `Keypad.tsx` with the code they explain:

```ts
/**
 * A held press, shared by the keypad's digits and the board's cells.
 *
 * Extracted from the keypad rather than written twice: threshold and
 * drag-cancellation are the parts of a long press that are easy to get subtly
 * different, and two gestures that disagree about how far a thumb may drift
 * feel like a bug in whichever one the player tried second.
 */

import { useEffect, useRef } from 'react';

/**
 * Long enough that every ordinary tap resolves as a tap, short enough that
 * holding does not feel like a broken control.
 */
export const LONG_PRESS_MS = 500;

/**
 * How far a pointer can drift before a held press is cancelled. Needed
 * specifically for touch: a touch pointer gets *implicit* capture on
 * `pointerdown`, so `pointerleave`/`pointerout` are not dispatched while the
 * finger is still down and moving across other targets — they are deferred
 * until release. `pointermove` is the only event that still reaches the
 * original target once the finger has wandered off it, so it is the only
 * reliable way to honour drag-off-to-cancel on a touchscreen.
 */
export const MOVE_CANCEL_PX = 10;

export interface LongPressOptions<T> {
  onLongPress: (payload: T) => void;
  ms?: number;
  moveCancelPx?: number;
}

export interface LongPress<T> {
  start: (payload: T, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
  /**
   * Whether this payload's press already fired as a long press — and clears
   * the flag. A pointer held past the threshold still ends in a `click` on
   * release (that is how buttons work, mouse or touch), and the long press
   * already did its thing, so that click must be swallowed rather than
   * treated as a second action.
   */
  consumeFired: (payload: T) => boolean;
}

export function useLongPress<T>({
  onLongPress,
  ms = LONG_PRESS_MS,
  moveCancelPx = MOVE_CANCEL_PX,
}: LongPressOptions<T>): LongPress<T> {
  /*
   * Only one target can be under a pointer at a time, so a single ref tracks
   * the press in flight rather than one per target. `x`/`y` are the down
   * coordinates, for `move`.
   */
  const press = useRef<{
    payload: T | null;
    timer: ReturnType<typeof setTimeout> | null;
    fired: boolean;
    x: number;
    y: number;
  }>({ payload: null, timer: null, fired: false, x: 0, y: 0 });

  const end = (): void => {
    if (press.current.timer === null) return;
    clearTimeout(press.current.timer);
    press.current.timer = null;
  };

  // A press left pending by an unmount is otherwise a live timer nothing ever
  // clears. Captured as `state` rather than read via `press.current` inside
  // the cleanup: `press` is never reassigned — only its fields mutate — so
  // the two are the same object for the component's whole life.
  useEffect(() => {
    const state = press.current;
    return () => {
      if (state.timer !== null) clearTimeout(state.timer);
    };
  }, []);

  return {
    start: (payload, x, y) => {
      press.current.payload = payload;
      press.current.fired = false;
      press.current.x = x;
      press.current.y = y;
      press.current.timer = setTimeout(() => {
        press.current.fired = true;
        onLongPress(payload);
      }, ms);
    },
    move: (x, y) => {
      if (press.current.timer === null) return;
      const dx = x - press.current.x;
      const dy = y - press.current.y;
      if (dx * dx + dy * dy > moveCancelPx * moveCancelPx) end();
    },
    end,
    consumeFired: (payload) => {
      if (!press.current.fired || press.current.payload !== payload) return false;
      press.current.fired = false;
      return true;
    },
  };
}
```

- [ ] **Step 3: Rewrite Keypad to use it**

Delete `LONG_PRESS_MS` and `MOVE_CANCEL_PX` from `Keypad.tsx:97-113`, and the whole `press` ref / `startPress` / `endPress` / `trackMove` / cleanup effect block (`:156-226`).

Add the import and, in the component body next to `fire`:

```tsx
  const press = useLongPress<Digit>({
    // Nothing to feel if there is nothing wired to do: firing the haptic
    // unconditionally would vibrate for a press that has no effect at all.
    onLongPress: (digit) => {
      if (onDigitLongPress) fire('toggle', () => onDigitLongPress(digit));
    },
  });
```

Rewire the digit button's handlers (`Keypad.tsx:253-283`):

```tsx
              onPointerDown={(event) => press.start(digit, event.clientX, event.clientY)}
              onPointerMove={(event) => press.move(event.clientX, event.clientY)}
              onPointerUp={press.end}
              onPointerLeave={press.end}
              onPointerCancel={press.end}
              onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => {
                // A long press's release still ends in a click; swallow it.
                // `event.detail !== 0` distinguishes a real pointer click from
                // a keyboard-activated one, which never had a press.
                if (event.detail !== 0 && press.consumeFired(digit)) return;
                onDigit(digit);
              }}
```

- [ ] **Step 4: Run the keypad tests**

Run: `npx vitest run src/ui/keypad/Keypad.test.tsx > /tmp/t6-after.log 2>&1; tail -5 /tmp/t6-after.log`
Expected: the SAME pass count as Step 1, zero failures. If any test changed behaviour, the extraction is wrong — fix the hook, do not touch the test.

- [ ] **Step 5: Verify and commit**

Run: `npm run verify > /tmp/verify6.log 2>&1; tail -20 /tmp/verify6.log`

```bash
git add src/ui/primitives/useLongPress.ts src/ui/keypad/Keypad.tsx
git commit -F - <<'MSG'
refactor(ui): the held press becomes a hook, before a second one needs it

Threshold and drag-cancellation are the parts of a long press that are easy to
get subtly different, and two gestures that disagree about how far a thumb may
drift feel like a bug in whichever one the player tried second. The board is
about to grow a held press of its own, so the keypad's stops being private
first.

No behaviour change: Keypad.test.tsx passes untouched, which is the whole
evidence for this commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 7: A held press, and Enter, reach the board

**Files:**
- Modify: `src/ui/board/Cell.tsx:41-73` (props), `:164-179` (handlers)
- Modify: `src/ui/board/SudokuGrid.tsx:47-136` (props), `:254-303` (keydown), `:335-362` (pass-through)
- Test: `src/ui/board/SudokuGrid.test.tsx`

**Interfaces:**
- Consumes: `useLongPress` (Task 6)
- Produces: `SudokuGridProps.onPromote?: (cell: CellIndex) => void` — fired by a held press on a cell and by `Enter` on the focused cell. Task 8 supplies it.

**Note on the spec:** the design named `src/app/useBoardShortcuts.ts` for the `Enter` binding. That is wrong and this plan corrects it — `useBoardShortcuts` is documented (`useBoardShortcuts.ts:1-12`) as the shortcuts that are about the *game*, while the grid already owns every key that is about a *cell* because only the grid knows which one is focused. `Enter` is about a cell.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/board/SudokuGrid.test.tsx`, self-contained — do not depend on that file's existing helpers:

```tsx
describe('promoting a cell', () => {
  const PUZZLE =
    '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
  /** r1c1 is a given 5; r1c3 is empty. Those are the two cells these tests use. */
  const GIVEN_CELL = 0;
  const EMPTY_CELL = 2;

  const gridCells = () =>
    [...PUZZLE].map((ch) => ({
      value: ch === '.' ? null : (Number(ch) as Digit),
      given: ch !== '.',
      candidates: [] as Digit[],
    }));

  const renderGrid = (props: Partial<SudokuGridProps>) => {
    render(
      <LocaleProvider locale="en">
        <SudokuGrid cells={gridCells()} selected={null} onSelect={() => undefined} {...props} />
      </LocaleProvider>,
    );
    return { user: userEvent.setup() };
  };

  const cell = (index: number): HTMLElement => {
    const node = document.querySelector<HTMLElement>(`[data-cell="${index}"]`);
    if (node === null) throw new Error(`no cell ${index} on the board`);
    return node;
  };

  it('fires on Enter over the focused cell', async () => {
    const onPromote = vi.fn();
    const { user } = renderGrid({ onPromote, selected: EMPTY_CELL });

    await user.click(cell(EMPTY_CELL));
    await user.keyboard('{Enter}');

    expect(onPromote).toHaveBeenCalledWith(EMPTY_CELL);
  });

  it('does not fire on Enter over a given', async () => {
    // Givens are not the player's to change, by the same guard the digit keys
    // already go through.
    const onPromote = vi.fn();
    const { user } = renderGrid({ onPromote, selected: GIVEN_CELL });

    await user.click(cell(GIVEN_CELL));
    await user.keyboard('{Enter}');

    expect(onPromote).not.toHaveBeenCalled();
  });

  it('fires on a held press', () => {
    vi.useFakeTimers();
    const onPromote = vi.fn();
    renderGrid({ onPromote });

    fireEvent.pointerDown(cell(EMPTY_CELL), { clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });

    expect(onPromote).toHaveBeenCalledWith(EMPTY_CELL);
    vi.useRealTimers();
  });

  it('does not fire when the thumb drifts off', () => {
    vi.useFakeTimers();
    const onPromote = vi.fn();
    renderGrid({ onPromote });

    fireEvent.pointerDown(cell(EMPTY_CELL), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cell(EMPTY_CELL), { clientX: 40, clientY: 40 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });

    expect(onPromote).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

Add to that file's imports as needed: `act`, `fireEvent`, `render` from `@testing-library/react`; `userEvent` from `@testing-library/user-event`; `vi` from vitest; `LONG_PRESS_MS` from `../primitives/useLongPress`; `LocaleProvider` from `../../i18n/react`; `type Digit` from `../../engine/types`; `type SudokuGridProps` from `./SudokuGrid`.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/ui/board/SudokuGrid.test.tsx > /tmp/t7.log 2>&1; tail -30 /tmp/t7.log`
Expected: FAIL — `onPromote` is not a prop.

- [ ] **Step 3: Cell takes a held press**

In `src/ui/board/Cell.tsx`, add to `CellProps` after `onActivate`:

```tsx
  /**
   * Held past the long-press threshold.
   *
   * A different gesture from `onActivate` on purpose: activation is a tap,
   * and a tap must stay able to move the caret without writing anything.
   *
   * Like every other callback here this must be ONE stable function for all
   * 81 cells (see the memo contract at the top of this file) — the cell index
   * comes back as the argument.
   */
  onLongPress?: (cell: CellIndex) => void;
```

In the component body:

```tsx
  const press = useLongPress<CellIndex>({ onLongPress: (c) => onLongPress?.(c) });
```

Extend the root element's handlers (`Cell.tsx:176-179`):

```tsx
      onPointerDown={(event) => {
        onSelect(index);
        onActivate?.(index);
        press.start(index, event.clientX, event.clientY);
      }}
      onPointerMove={(event) => press.move(event.clientX, event.clientY)}
      onPointerUp={press.end}
      onPointerLeave={press.end}
      onPointerCancel={press.end}
      // The platform's own long press has to lose to this one, exactly as on
      // the keypad: a held finger otherwise raises a selection callout.
      onContextMenu={(event) => event.preventDefault()}
```

Add the `useLongPress` import.

- [ ] **Step 4: SudokuGrid exposes it**

Add to `SudokuGridProps` after `onClear`:

```tsx
  /**
   * Turn a cell's last remaining note into its digit. Fired by a held press
   * and by Enter — never by a tap, which has to stay free to move the caret.
   *
   * The grid only reports the gesture. Whether the cell qualifies, and
   * whether the player has asked for this at all, is the caller's decision.
   */
  onPromote?: (cell: CellIndex) => void;
```

Pass it straight through to `Cell` — by reference, never wrapped (`SudokuGrid.tsx:359`):

```tsx
                onLongPress={onPromote}
```

In the grid's `onKeyDown`, immediately after the given guard (`SudokuGrid.tsx:290`):

```tsx
    if (event.key === 'Enter') {
      event.preventDefault();
      onPromote?.(cell);
      return;
    }
```

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run src/ui/board/SudokuGrid.test.tsx src/ui/board/Cell.test.tsx > /tmp/t7.log 2>&1; tail -30 /tmp/t7.log`
Expected: PASS, and the existing cell/grid tests unchanged.

- [ ] **Step 6: Run the mutation**

Move the `Enter` branch ABOVE the given guard — re-run, expect FAIL on "does not fire on Enter over a given". Restore.
Then remove `press.move` from `onPointerMove` — re-run, expect FAIL on the drift test. Restore.

- [ ] **Step 7: Verify and commit**

Run: `npm run verify > /tmp/verify7.log 2>&1; tail -20 /tmp/verify7.log`

```bash
git add src/ui/board/Cell.tsx src/ui/board/SudokuGrid.tsx src/ui/board/SudokuGrid.test.tsx
git commit -F - <<'MSG'
feat(board): a held press, and Enter, are a gesture the grid can report

Both are deliberately not a tap. A tap moves the caret, and a caret walking
the board hunting for a square must never write anything on the way.

Enter lives here rather than in useBoardShortcuts, which is documented as the
shortcuts that are about the game: the grid already owns every key that is
about a cell, because only the grid knows which cell has the caret.

The grid reports the gesture and decides nothing. Whether a cell qualifies is
the caller's business, which keeps the disclosure rules in one place.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 8: `promoteLoneNote`

**Files:**
- Modify: `src/state/types.ts` (the `settings` block, after `shadeDigitPeers`)
- Modify: `src/state/mastery.ts:37-58` (`DEFAULT_PROFILE`)
- Modify: `src/app/GameView.tsx` — the `promote` handler, wired to `SudokuGrid`
- Modify: `src/app/SettingsSheet.tsx:318-380` — the toggle
- Modify: `src/i18n/en.ts`, `src/i18n/it.ts`
- Test: `src/app/GameView.promote.test.tsx` (create)

**Interfaces:**
- Consumes: `place` (Task 5), `SudokuGridProps.onPromote` (Task 7)
- Produces: `PlayerProfile['settings'].promoteLoneNote: boolean`

**No migration and no profile test.** `withDefaultSettings` (`src/state/db.ts:284`) already backfills any absent settings key from `DEFAULT_PROFILE` on every read path, and `src/state/profile.test.ts:51` asserts that generically with a spread — it is written so a new setting needs no edit there. Adding the field to `DEFAULT_PROFILE` is the whole of the coordination. Do not add a migration step.

- [ ] **Step 1: Add the strings**

`src/i18n/en.ts`: `  'settings.promoteLoneNote': 'Hold a cell to place its last note',`
`src/i18n/it.ts`: `  'settings.promoteLoneNote': 'Tieni premuta una cella per inserire la sua ultima annotazione',`

- [ ] **Step 2: Write the failing tests**

Create `src/app/GameView.promote.test.tsx`, copying the `Host` render helper from `GameView.settings.test.tsx:88-139` (the dispatch-reading one):

```tsx
describe('promoting a lone note', () => {
  /** r1c3 empty, with exactly one note in it. */
  function gameWithLoneNote(digit = 4) {
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
    // cell reports it as its own text rather than inside a mark slot.
    expect(cell(2).querySelector('[data-slot="4"]')?.textContent).toBe('');
    expect(cell(2).textContent).toContain('4');
    vi.useRealTimers();
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
    vi.useRealTimers();
    return user
      .click(screen.getByRole('button', { name: 'Notes' }))
      .then(() => {
        vi.useFakeTimers();
        fireEvent.pointerDown(cell(2), { clientX: 10, clientY: 10 });
        act(() => {
          vi.advanceTimersByTime(LONG_PRESS_MS + 10);
        });
        expect(cell(2).textContent).toContain('4');
        vi.useRealTimers();
      });
  });
});
```

The notes toggle's accessible name is `t('action.notes')` = **'Notes'** (`src/i18n/en.ts:42`, used at `src/ui/keypad/Keypad.tsx:365`), so `screen.getByRole('button', { name: 'Notes' })` is the exact query.

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run src/app/GameView.promote.test.tsx > /tmp/t8.log 2>&1; tail -30 /tmp/t8.log`
Expected: FAIL — `promoteLoneNote` is not a settings key, and nothing places.

- [ ] **Step 4: Add the setting**

In `src/state/types.ts`, after `shadeDigitPeers: boolean;` inside `settings`:

```ts
    /**
     * Hold a cell that has exactly one note left to place that digit.
     *
     * **On** by default, which none of the other aids here are — and the
     * difference is the reason. `shadeDigitPeers` and `highlightMatchingNotes`
     * do a share of the scanning the player came here to learn;
     * `autoClearDeadNotes` edits their marks. This does neither. It places a
     * conclusion the player has already written down, as an ordinary undoable
     * move, and discloses nothing: if the note was wrong, the digit is wrong,
     * and everything downstream treats it exactly like a typed one.
     *
     * The switch exists because **a slow tap on a phone is a long press**. The
     * gesture can fire by accident, and a player it keeps surprising cannot
     * simply decline to use it. That, and not the aid, is what the off state
     * is for.
     */
    promoteLoneNote: boolean;
```

In `src/state/mastery.ts`, inside `DEFAULT_PROFILE.settings`:

```ts
    // On, unlike the aids above it: it places a conclusion the player already
    // wrote down rather than doing any of their reasoning for them.
    promoteLoneNote: true,
```

- [ ] **Step 5: The handler**

In `src/app/GameView.tsx`, after `activateCell` (`:406-422`):

```tsx
  /**
   * Turn a cell's last remaining note into its digit.
   *
   * Every guard is here rather than in the grid, so the rules about what may
   * be placed stay in one place. It goes through `place` rather than `enter`
   * because the gesture means one thing in both modes: a player holding a
   * cell with one note left is placing a digit, not taking a note.
   */
  const promote = useCallback(
    (cell: CellIndex) => {
      if (!settings.promoteLoneNote) return;
      const target = game.cells[cell];
      if (target === undefined || target.given || target.value !== null) return;
      if (target.candidates.size !== 1) return;
      const [digit] = target.candidates;
      haptic('tap');
      place(cell, digit);
    },
    [game.cells, settings.promoteLoneNote, place, haptic],
  );
```

Pass it to the grid (`GameView.tsx:548-570`), after `onClear`:

```tsx
          onPromote={paused || solved ? undefined : promote}
```

- [ ] **Step 6: The toggle**

In `src/app/SettingsSheet.tsx`, after the `shadeDigitPeers` toggle (which closes at line ~379):

```tsx
              {/* The only aid in this group that ships on, because it is the
                  only one that neither does the player's scanning nor edits
                  their marks. It is here to be turned off by a thumb that
                  keeps triggering it. */}
              <Toggle
                label={t('settings.promoteLoneNote')}
                checked={profile.settings.promoteLoneNote}
                onChange={(promoteLoneNote) => onSettings({ promoteLoneNote })}
              />
```

- [ ] **Step 7: Run and watch them pass**

Run: `npx vitest run src/app/GameView.promote.test.tsx > /tmp/t8.log 2>&1; tail -30 /tmp/t8.log`
Expected: PASS.

- [ ] **Step 8: Run the mutation**

Change `target.candidates.size !== 1` to `target.candidates.size < 1` — re-run, expect FAIL on "does nothing when the cell has two notes left". Restore.
Then remove the `if (!settings.promoteLoneNote) return;` line — re-run, expect FAIL on "does nothing with the setting off". Restore.

- [ ] **Step 9: Verify and commit**

Run: `npm run verify > /tmp/verify8.log 2>&1; tail -20 /tmp/verify8.log`

```bash
git add src/state/types.ts src/state/mastery.ts src/app/GameView.tsx src/app/GameView.promote.test.tsx src/app/SettingsSheet.tsx src/i18n/en.ts src/i18n/it.ts
git commit -F - <<'MSG'
feat(board): hold a cell to place its last remaining note

A cell down to one mark still needed selecting and then hitting the right key,
and the mis-key writes a digit that is simply false — at the moment the player
has just done the reasoning correctly.

It ships on, which none of the other aids in that group do, and the difference
is the reason: this neither scans for the player nor edits their marks. It
places a conclusion they already wrote down, as an ordinary undoable move. If
the note was wrong the digit is wrong, exactly as if they had typed it.

The switch is there because a slow tap on a phone is a long press. The gesture
can fire by accident, and a player it keeps surprising cannot simply decline
to use it.

Deliberately one cell at a time: promoting on selection, or promoting every
lone note at once, chains into an automatic solve.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 9: Write the reasoning where it binds

**Files:**
- Modify: `docs/architecture.md` — invariant 1's exception, and a new subsection under "Key invariants"
- Modify: `README.md` if it lists settings (check first; leave alone if not)
- Issue: update **#22**

- [ ] **Step 1: Amend invariant 1**

In `docs/architecture.md`, in invariant 1's `autoClearDeadNotes` paragraph, append:

```
   It does not run behind a placement that duplicates a peer. Such a placement
   is a typo far more often than it is a move, and sweeping the notes it kills
   costs the player work they then have to notice in time to undo. The test is
   the *fact* of the conflict, never `settings.highlightConflicts`: turning a
   colour off changes what the player sees, not what the app does for them.
   Entries that are wrong but break no rule are still swept — the engine could
   catch those from the solution, but notes surviving a placement would then be
   a visible tell that the digit is wrong, which is invariant 2 leaking out
   through a side effect instead of through text.
```

- [ ] **Step 2: Add invariant 11**

After invariant 10, add:

```
11. **Recovery may point at a mistake; a hint may not.** The rewind
    (`src/app/rewind.ts`) arms when `deadEndCells` finds an empty cell with no
    digit left to take, and disarms when `contradictionAt` finds no wrong entry
    — different conditions, and they cannot fight, because a dead end implies a
    contradiction. It deliberately does not arm on a contradiction alone: that
    is the nudge's job, and a board that can still be played is not a board in
    recovery.

    The amber going out tells the player which move was wrong, and in a cell
    they had narrowed to two candidates that is the other digit. This is a
    deliberate loosening, taken with Paolo's decision on the record: the nudge
    already announces that a mistake exists, and stepping back until it clears
    reaches the same place by hand. Invariant 4 is untouched — no cell is
    rendered with a digit it does not hold, and no hint gains an assignment.
    What changed is that a *control's colour* is derived from a contradiction
    that was already announced. Nothing else may take that licence.

    The trail is `redoStack` read backwards and capped, so it stores nothing
    and lives exactly as long as the moves it describes are restorable. An
    ordinary undo in normal play must raise none of it.
```

- [ ] **Step 3: Verify the docs claim what the code does**

Run: `npm run verify > /tmp/verify9.log 2>&1; tail -20 /tmp/verify9.log`
Then re-read invariant 11 against `src/app/rewind.ts`. If they disagree, one of them is a bug — say which rather than quietly picking a side.

- [ ] **Step 4: Commit and update #22**

```bash
git add docs/architecture.md
git commit -F - <<'MSG'
docs: record what recovery is allowed to disclose, and what still is not

Invariant 1 gains the auto-clear exception in its own words, and a new
invariant 11 states the rewind's rule: recovery may point at a mistake, a hint
may not. It also states the price — the amber going out identifies the wrong
move, and in a two-candidate cell that is the other digit — because a
loosening nobody wrote down is one a later reader will either repeat by
accident or undo by accident.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

Then edit issue #22: under "Where the project is", record that mistake recovery shipped (amber rewind, the auto-clear conflict skip, hold-to-promote), and add the disclosure trade to "Things that are true and surprising" as a one-line pointer to invariant 11. Add the new Italian keys to #65's list.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin HEAD
gh pr create --fill
gh pr merge --auto --rebase
```

PR body must end with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
```
