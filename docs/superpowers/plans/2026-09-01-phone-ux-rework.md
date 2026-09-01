# Phone UX Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone build playable — the board never resizes, the coach speaks only when asked, the same-digit highlight survives a selection change, and a note is struck through only when a *later* placement kills it.

**Architecture:** Four independent changes to the existing game screen. The note rule becomes a pure, move-log-derived function in `src/state/` (replayable through undo/redo and reload, no change to the frozen `Game` shape). The highlight becomes explicit view state in `GameView` instead of a value derived from the selection inside `SudokuGrid`. The coach's resting bar and the nudge `<aside>` leave the document flow entirely and become one floating button plus a bottom sheet, so `<main>` holds exactly two flow children forever.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 (utilities only, no config file, stock `sm:` 640px breakpoint), Zustand-style store in `src/state/store.ts`, vitest + @testing-library/react, Playwright + axe for e2e.

**Spec:** `docs/superpowers/specs/2026-09-01-phone-ux-rework-design.md`

## Global Constraints

- **Layout invariant (new, binding):** nothing outside the board and the keypad may occupy layout height during play. `GameView`'s `<main>` has exactly two flow children for the whole life of a game.
- **Architecture invariant 1 (existing):** the engine never edits the player's board on its own. Every elimination stays something the player asks for.
- **Frozen contracts:** `src/engine/types.ts`, `src/state/types.ts`, `src/coach/types.ts` must not be edited by this work. Nothing in this plan needs to.
- **Verify contract:** `npm run verify` = lint → `tsc -b` → vitest → build. CI runs that plus `npm run e2e`. Never weaken a config to make it pass.
- **Every UI string reads the dictionary.** New copy goes in `src/i18n/en.ts` and `src/i18n/it.ts`, same key, both files, or `tsc` fails on the `MessageKey` union.
- **Comments explain why, not what.** Match the surrounding voice: `src/engine/board.ts` for engine, `src/app/GameView.tsx` for the screen.
- **Commit messages explain the reasoning**, not the file list.
- Branch: `feat/phone-ux-rework`, already created, spec already committed on it.

---

### Task 1: A note is dead only if a *later* placement killed it

**Files:**
- Create: `src/state/deadNotes.ts`
- Create: `src/state/deadNotes.test.ts`

**Interfaces:**
- Consumes: `Board.staleAt` (`src/engine/board.ts:195`), `Move` (`src/state/types.ts:18`), `Cell` (`src/engine/types.ts`).
- Produces: `deadNotes(cells: readonly Cell[], moves: readonly Move[]): readonly (readonly Digit[])[]` — one ascending `Digit[]` per cell index, length 81. Task 2 and Task 3 of the reducer both call exactly this.

**Why a new module rather than a method on `Board`:** `Board` is values-only and knows nothing about moves; the question "when was this note written" is a fact about the move log, which lives in `src/state/`. Keeping `staleAt` time-blind matters — `coach/candidates.ts` and the "check my notes" review still need the timeless question.

- [ ] **Step 1: Write the failing test**

Create `src/state/deadNotes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Cell, Digit } from '../engine/types';
import { parseGrid } from '../engine/board';
import type { Move } from './types';
import { deadNotes } from './deadNotes';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020060000419005000080079000000000';

/** r1c3 (index 2) is empty; r1c1 is a given 5 and r1c5 a given 7, both its peers. */
function cellsWith(notes: Record<number, Digit[]>, entries: Record<number, Digit> = {}): Cell[] {
  const values = parseGrid(PUZZLE);
  return values.map((value, index) => ({
    value: entries[index] ?? value,
    given: value !== null,
    candidates: new Set<Digit>(notes[index] ?? []),
  }));
}

const noteMove = (cell: number, digit: Digit, at: number): Move => ({
  kind: 'addCandidate',
  cell,
  digit,
  prev: { value: null, candidates: [] },
  at,
});

const setMove = (cell: number, digit: Digit, at: number): Move => ({
  kind: 'set',
  cell,
  digit,
  prev: { value: null, candidates: [] },
  at,
});

describe('deadNotes', () => {
  it('flags a note that a later placement killed', () => {
    // Note 4 in r1c3 at t=1, then place 4 in r1c4 (index 3, same row) at t=2.
    const cells = cellsWith({ 2: [4] }, { 3: 4 });
    const moves = [noteMove(2, 4, 1), setMove(3, 4, 2)];
    expect(deadNotes(cells, moves)[2]).toEqual([4]);
  });

  it('leaves a note written after the placement alone — that error is the player to find', () => {
    const cells = cellsWith({ 2: [4] }, { 3: 4 });
    const moves = [setMove(3, 4, 1), noteMove(2, 4, 2)];
    expect(deadNotes(cells, moves)[2]).toEqual([]);
  });

  it('never flags a note that only a given contradicts', () => {
    // 5 is a given at r1c1, a peer of r1c3. No move placed it, so nothing killed it.
    const cells = cellsWith({ 2: [5] });
    expect(deadNotes(cells, [noteMove(2, 5, 1)])[2]).toEqual([]);
  });

  it('unflags when the killing placement is gone from the log', () => {
    // Same board, but the set move has been undone off the stack.
    const cells = cellsWith({ 2: [4] }, { 3: 4 });
    expect(deadNotes(cells, [noteMove(2, 4, 1)])[2]).toEqual([]);
  });

  it('re-flags a note rewritten before a second placement', () => {
    // Written at 1, killed at 2, erased and rewritten at 3, killed again at 4.
    const cells = cellsWith({ 2: [4] }, { 3: 4, 4: 4 });
    const moves = [
      noteMove(2, 4, 1),
      setMove(3, 4, 2),
      { kind: 'removeCandidate', cell: 2, digit: 4 as Digit, prev: { value: null, candidates: [4 as Digit] }, at: 3 },
      noteMove(2, 4, 4),
      setMove(4, 4, 5),
    ];
    expect(deadNotes(cells, moves)[2]).toEqual([4]);
  });

  it('reports ascending digits and an empty array for a cell with nothing dead', () => {
    const cells = cellsWith({ 2: [4, 6] }, { 3: 6, 5: 4 });
    const moves = [noteMove(2, 4, 1), noteMove(2, 6, 2), setMove(3, 6, 3), setMove(5, 4, 4)];
    expect(deadNotes(cells, moves)[2]).toEqual([4, 6]);
    expect(deadNotes(cells, moves)[0]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/state/deadNotes.test.ts`
Expected: FAIL — `Failed to resolve import "./deadNotes"`.

- [ ] **Step 3: Write the implementation**

Create `src/state/deadNotes.ts`:

```ts
/**
 * The notes a placement killed, as opposed to the notes that were never true.
 *
 * `Board.staleAt` answers "is this digit already held by a peer", which is a
 * timeless question and the wrong one to draw on the board: it strikes a note
 * through the instant it is written next to a peer, and doing the elimination
 * for the player is the one thing this app does not do. The question worth
 * drawing is "did a move I made *after* writing this note kill it" — that is
 * bookkeeping about the player's own placement, not a deduction taken away
 * from them.
 *
 * Both timestamps are already in the move log, so the answer is derived rather
 * than stored: it survives undo, redo and a reload with no change to the
 * persisted `Game` shape.
 */

import type { Cell, CellIndex, Digit } from '../engine/types';
import { CELL_COUNT, PEERS } from '../engine/board';
import type { Move } from './types';

/** Ascending dead digits per cell, index-aligned with `cells`. */
export function deadNotes(
  cells: readonly Cell[],
  moves: readonly Move[],
): readonly (readonly Digit[])[] {
  // When each cell last received a value from a move. A given was never placed
  // by the player, so it has no entry and can never kill anything.
  const placedAt = new Map<CellIndex, number>();
  // When each note was last written. Keyed cell*10+digit to keep it one map.
  const notedAt = new Map<number, number>();

  for (const move of moves) {
    if (move.kind === 'set') {
      placedAt.set(move.cell, move.at);
    } else if (move.kind === 'addCandidate' && move.digit !== undefined) {
      notedAt.set(move.cell * 10 + move.digit, move.at);
    } else if (move.kind === 'fillCandidates') {
      // Unreachable today, but a batch fill writes every mark in the cell at
      // once and the rule has to hold if it ever comes back.
      for (const digit of cells[move.cell]?.candidates ?? []) {
        notedAt.set(move.cell * 10 + digit, move.at);
      }
    }
  }

  const out: Digit[][] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const cell = cells[i];
    const dead: Digit[] = [];
    if (cell !== undefined && cell.value === null && cell.candidates.size > 0) {
      for (const digit of cell.candidates) {
        const written = notedAt.get(i * 10 + digit);
        if (written === undefined) continue;
        for (const peer of PEERS[i]) {
          if (cells[peer]?.value !== digit) continue;
          const killed = placedAt.get(peer);
          if (killed !== undefined && killed > written) {
            dead.push(digit);
            break;
          }
        }
      }
    }
    out.push(dead.sort((a, b) => a - b));
  }
  return out;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/state/deadNotes.test.ts`
Expected: PASS, 6 tests.

If `PEERS` or `CELL_COUNT` is not exported from `src/engine/board.ts`, export it there rather than re-deriving the peer table — `staleAt` already uses `PEERS[cell]`.

- [ ] **Step 5: Commit**

```bash
git add src/state/deadNotes.ts src/state/deadNotes.test.ts
git commit -m "feat(state): a note counts as dead only when a later placement killed it

Board.staleAt is time-blind, so drawing it strikes a note through the moment
it is written beside a peer and hands the player the elimination they came to
do. The question worth drawing is whether one of their own later placements
killed the note, and both timestamps are already in the move log — so the
answer is derived rather than stored, and survives undo and a reload without
touching the frozen Game shape."
```

---

### Task 2: The board and the eraser both use the new rule

**Files:**
- Modify: `src/app/GameView.tsx:87-103` (the `stale` and `staleCount` memos)
- Modify: `src/state/game.ts:454-469` (`clearStaleCandidates`)
- Modify: `src/state/game.test.ts` (add the case below)

**Interfaces:**
- Consumes: `deadNotes(cells, moves)` from Task 1.
- Produces: nothing new; `stale` in `GameView` keeps its name, shape and its `staleMarks` prop on `SudokuGrid`.

**Why both:** if only the display changes, the "clear dead notes" button silently erases notes it never struck through — including notes beside a given. The button must clear exactly what is drawn.

- [ ] **Step 1: Write the failing reducer test**

Add to `src/state/game.test.ts`, inside the existing `clearStaleCandidates` describe block (create one if absent):

```ts
it('leaves notes a given contradicts, because no move of the player killed them', () => {
  // r1c3 is empty and r1c1 is a given 5. Noting 5 there is the player's own
  // error to find; the eraser is bookkeeping, not a correction.
  let game = newGame();
  game = reduce(game, { type: 'toggleCandidate', cell: 2, digit: 5, at: 1 });
  game = reduce(game, { type: 'clearStaleCandidates', at: 2 });
  expect(game.cells[2].candidates.has(5)).toBe(true);
});

it('clears a note that a later placement killed', () => {
  let game = newGame();
  game = reduce(game, { type: 'toggleCandidate', cell: 2, digit: 4, at: 1 });
  game = reduce(game, { type: 'setValue', cell: 3, digit: 4, at: 2 });
  game = reduce(game, { type: 'clearStaleCandidates', at: 3 });
  expect(game.cells[2].candidates.has(4)).toBe(false);
  game = reduce(game, { type: 'undo', at: 4 });
  expect(game.cells[2].candidates.has(4)).toBe(true);
});
```

Use whatever `newGame()` / `reduce()` helpers `src/state/game.test.ts` already defines — read the top of that file and match it rather than inventing new ones. If the fixture puzzle there does not put a given 5 at a peer of cell 2, pick indices from its own puzzle and say so in the comment.

- [ ] **Step 2: Run it and watch the first case fail**

Run: `npx vitest run src/state/game.test.ts`
Expected: FAIL — the given-contradicted note is cleared today, so `toBe(true)` fails.

- [ ] **Step 3: Swap the rule in the reducer**

In `src/state/game.ts`, replace the body of `case 'clearStaleCandidates'` (currently building a `Board` and calling `board.staleAt(i, cell.candidates)`):

```ts
    case 'clearStaleCandidates': {
      const dead = deadNotes(game.cells, game.undoStack);
      const stamp = nextAt(game, action.at);
      const moves: Move[] = [];
      for (let i = 0; i < CELL_COUNT; i++) {
        const cell = game.cells[i];
        if (cell.given || cell.value !== null || cell.candidates.size === 0) continue;
        // One move per dead digit, all sharing the stamp: redo replays each
        // removal exactly, and undo restores the cell from the snapshot they
        // all took before the batch began.
        for (const digit of dead[i]) {
          moves.push({ kind: 'removeCandidate', cell: i, digit, prev: snapshot(cell), at: stamp });
        }
      }
      return commit(game, applyAll(game.cells, moves), moves, stamp);
    }
```

Add `import { deadNotes } from './deadNotes';` at the top. If `Board` becomes unused in `game.ts`, drop the import — lint will say so.

- [ ] **Step 4: Swap the rule in the view**

In `src/app/GameView.tsx`, replace the `stale` memo (and its comment block at L87-96, which now states the opposite of the rule) with:

```ts
  /**
   * The notes one of the player's own placements has killed since they were
   * written. Deliberately not every note a peer contradicts: striking those
   * through as they are typed performs the elimination the player came here to
   * learn. A note written into a square that was already dead stays unmarked —
   * that one is theirs to find, and "check my notes" is what finds it.
   */
  const stale = useMemo(() => deadNotes(game.cells, game.undoStack), [game.cells, game.undoStack]);
```

`staleCount` on the next line is unchanged. Add `import { deadNotes } from '../state/deadNotes';`. The `values` memo is still used by `conflicts` and `Keypad`, so leave it.

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run > /tmp/t2.log 2>&1; tail -20 /tmp/t2.log`
Expected: PASS. If a `coach/triggers.test.ts` case breaks, do not touch it — `staleMarksAfterPlacement` is a different function on the nudge path and Task 4 keeps it.

- [ ] **Step 6: Commit**

```bash
git add src/app/GameView.tsx src/state/game.ts src/state/game.test.ts
git commit -m "fix(app): stop marking a note dead the moment it is written

Drawing staleAt across every note meant the grid struck a mark through as the
player wrote it beside an existing peer, which is the elimination they opened
the app to practise. The eraser moves to the same rule in the same commit:
clearing notes the board never struck through would be the app editing the
player's work behind their back."
```

---

### Task 3: The green highlight is sticky and driven by the keypad

**Files:**
- Modify: `src/ui/board/SudokuGrid.tsx:64-66` (props), `:106` (the derived `matchDigit`), `:110-128` (flag pass)
- Modify: `src/ui/keypad/Keypad.tsx` (new `highlighted` prop, armed styling)
- Modify: `src/app/GameView.tsx:80` (state), `:204-216` (grid props), `:246-253` (keypad props)
- Modify: `src/ui/board/SudokuGrid.test.tsx`, `src/ui/keypad/Keypad.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SudokuGridProps.highlightDigit?: Digit | null` (replaces the internal derivation; `highlightMatches` stays as the on/off gate that `LearnView.tsx:113` uses). `KeypadProps.highlighted?: Digit | null`.

- [ ] **Step 1: Write the failing grid test**

`SudokuGrid.test.tsx` already has a `Harness` that owns `selected`. Add `highlightDigit` passthrough to it, then:

```ts
it('keeps the same-digit highlight when the selection moves', async () => {
  const user = userEvent.setup();
  render(<Harness initialSelected={0} highlightDigit={5} />);
  // r1c1 is a given 5; the highlight is on 5 regardless of where the caret is.
  const before = screen.getByRole('gridcell', { name: /r1c1/ });
  expect(before).toHaveAttribute('data-match', 'true');
  await user.click(screen.getByRole('gridcell', { name: /r5c5/ }));
  expect(screen.getByRole('gridcell', { name: /r1c1/ })).toHaveAttribute('data-match', 'true');
});

it('draws no match layer when highlightDigit is null', () => {
  render(<Harness initialSelected={0} highlightDigit={null} />);
  expect(screen.getByRole('gridcell', { name: /r1c1/ })).not.toHaveAttribute('data-match');
});
```

`Cell.tsx` must expose the match layer to the test. If it does not already set `data-match`, add `data-match={flags & CELL_MATCH ? 'true' : undefined}` next to the existing `data-digit` / `data-complete` style attributes — the codebase already uses data attributes for exactly this.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/board/SudokuGrid.test.tsx`
Expected: FAIL — `highlightDigit` is not a prop, so the match layer still follows the selection and the second assertion of the first test fails after the click.

- [ ] **Step 3: Make the highlight an input, not a derivation**

In `src/ui/board/SudokuGrid.tsx`, add to `SudokuGridProps` beside `highlightMatches`:

```ts
  /**
   * The digit the green layer is on, independent of the selection (R3).
   *
   * Derived from the selected cell it could not survive moving the caret,
   * which is the one thing a player uses it for: scanning the grid for where
   * else this digit can go.
   */
  highlightDigit?: Digit | null;
```

Destructure `highlightDigit = null` in the signature, delete the `const matchDigit = selected === null ? …` line at L106, and change the flag pass so the match layer no longer sits inside the `if (selected !== null)` block:

```ts
  const flags = useMemo(() => {
    const out = new Uint8Array(CELL_COUNT);
    if (selected !== null) {
      out[selected] |= CELL_SELECTED;
      if (highlightPeers) for (const peer of peersOf(selected)) out[peer] |= CELL_PEER;
    }
    if (highlightMatches && highlightDigit !== null) {
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].value === highlightDigit) out[i] |= CELL_MATCH;
      }
    }
    for (const house of tintedHouses ?? []) {
      const found = HOUSES.find((h) => h.kind === house.kind && h.index === house.index);
      for (const cell of found?.cells ?? []) out[cell] |= CELL_HOUSE;
    }
    for (const cell of spotlight ?? []) out[cell] |= CELL_SPOTLIGHT;
    for (const cell of conflicts ?? []) out[cell] |= CELL_CONFLICT;
    return out;
  }, [cells, selected, highlightDigit, spotlight, tintedHouses, conflicts, highlightPeers, highlightMatches]);
```

`Cell.tsx` takes a `matchDigit` prop for the pencil-mark echo (L175-177) — pass `highlightDigit` into it wherever `matchDigit` was passed, renaming nothing else.

- [ ] **Step 4: Run the grid test and watch it pass**

Run: `npx vitest run src/ui/board/SudokuGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing keypad test**

In `src/ui/keypad/Keypad.test.tsx`:

```ts
it('marks the armed digit so the player can see what the green is', () => {
  render(<Keypad {...baseProps} highlighted={5} />);
  expect(screen.getByRole('button', { name: /5/ })).toHaveAttribute('data-highlighted', 'true');
  expect(screen.getByRole('button', { name: /4/ })).not.toHaveAttribute('data-highlighted');
});
```

Match the prop-spreading style already used in that file rather than introducing `baseProps` if it does not exist.

- [ ] **Step 6: Implement the armed key**

In `src/ui/keypad/Keypad.tsx`, add `highlighted?: Digit | null` to `KeypadProps` with the comment *"The digit the board's green layer is on, so the key that controls it looks like it does."*, destructure `highlighted = null`, and on the digit `<button>` add `data-highlighted={digit === highlighted ? 'true' : undefined}` plus a ring in the class list:

```ts
                digit === highlighted && 'ring-2 ring-match',
```

Keep it inside the existing `cx(...)` call, after the `done` branch so a finished digit still reads as finished.

- [ ] **Step 7: Own the state in GameView**

In `src/app/GameView.tsx`, beside the other view state at L80:

```ts
  const [highlightDigit, setHighlightDigit] = useState<Digit | null>(null);
```

Pass `highlightDigit={highlightDigit}` to `SudokuGrid` and `highlighted={highlightDigit}` to `Keypad`, and replace the keypad's `onDigit`:

```ts
          onDigit={(digit) => {
            const entered = selected !== null && game.cells[selected]?.value !== digit;
            if (entered) enter(selected as CellIndex, digit);
            // A tap that wrote something arms the green on what was just written.
            // A tap that wrote nothing is purely a request about the highlight,
            // and that is the only tap allowed to turn it off — otherwise
            // placing the same digit into two cells would blink it away.
            setHighlightDigit((current) =>
              !entered && current === digit ? null : digit,
            );
          }}
```

`Keypad`'s `disabled={selected === null || …}` must go: with no cell selected the digits now still do something. Change it to `disabled={paused || solved}` and keep the per-key `done` disabling. `onErase` and the undo/redo keys already guard themselves.

Selecting a cell must not touch `highlightDigit` — leave `onSelect={setSelected}` exactly as it is.

- [ ] **Step 8: Run the unit suite**

Run: `npx vitest run > /tmp/t3.log 2>&1; tail -20 /tmp/t3.log`
Expected: PASS. `LearnView.tsx` passes `highlightMatches={false}` and no `highlightDigit`, which still draws nothing.

- [ ] **Step 9: Commit**

```bash
git add src/ui/board/SudokuGrid.tsx src/ui/board/Cell.tsx src/ui/board/SudokuGrid.test.tsx src/ui/keypad/Keypad.tsx src/ui/keypad/Keypad.test.tsx src/app/GameView.tsx
git commit -m "feat(ui): the green highlight stays put when the caret moves

It was derived from the selected cell, so it died on the move that made it
useful: scanning the grid for where else a digit can go means moving the
caret. It is now state the keypad owns — tap a digit to arm it, tap it again
with nothing to write to put it away — and the selection no longer touches it.
The pad shows which digit is armed, because a highlight with no visible source
reads as a bug."
```

---

### Task 4: The coach floats, and asks for nothing

**Files:**
- Modify: `src/app/GameView.tsx:196-320` (`<main>`, the nudge `<aside>`, the coach host div, the stale-note button)
- Modify: `src/ui/coach/CoachPanel.tsx` (resting state is no longer a bar; accept the nudge and the eraser)
- Modify: `src/i18n/en.ts`, `src/i18n/it.ts`
- Create: `src/app/GameView.layout.test.tsx`

**Interfaces:**
- Consumes: `coach.nudge`, `coach.dismissNudge` from `useCoachSession` (unchanged), `staleCount` and the `clearStaleCandidates` dispatch from Task 2.
- Produces: no new module. `CoachPanelProps` gains `nudge?: TeachableTrigger | null`, `onDismissNudge?: () => void`, `staleCount?: number`, `onClearStale?: () => void`.

**Do not touch** `useCoachSession.ts` or `coach/triggers.ts`. The trigger machinery — 400ms debounce, 15s poll, `triggerKey` dismissal — is right; only its sink changes.

- [ ] **Step 1: Write the failing layout test**

Create `src/app/GameView.layout.test.tsx`. It asserts the invariant, not the pixels:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
```

Write `renderGame` at the top of the file: build a `LiveGame` with the store's own factory (see how `src/state/store.test.ts` makes one), wrap in whatever providers `src/App.tsx` puts around `GameView` (locale at minimum), and return `{ user: userEvent.setup() }`. `<main>` needs no `role` attribute — the element is implicitly `role="main"`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/GameView.layout.test.tsx`
Expected: FAIL — the stale-note row makes three children, and the resting coach bar sits outside `<main>` but still in flow, so the last case fails once the sheet opens too.

- [ ] **Step 3: Add the copy**

In `src/i18n/en.ts`:

```ts
  'coach.open': 'Coach',
  'coach.openWaiting': 'Coach — has something for you',
```

In `src/i18n/it.ts`, same keys:

```ts
  'coach.open': 'Coach',
  'coach.openWaiting': 'Coach — ha qualcosa per te',
```

The Italian line is a translation to be reviewed, not approved copy — Task 6 files the issue for it.

- [ ] **Step 4: Take the coach out of flow**

In `src/app/GameView.tsx`:

1. Delete the stale-note button row (L231-244) from `<main>` entirely.
2. Delete the nudge `<aside>` (L266-284) entirely, and the `nudgeCells` computation that only fed it — but keep `reviewSpotlight`/`setReviewSpotlight`, which `CoachPanel` still uses.
3. Replace the coach host div with a FAB plus a sheet. Both are siblings of `<main>`, positioned against the screen shell (`GameView`'s outer div is already `relative`):

```tsx
      {/*
        * Resting, the coach is one button floating over the board's corner. It
        * used to be a bar in the flow, and a bar is height the square board
        * gave up for a control the player was not using yet. Speaking, it is a
        * sheet over the keypad. Neither state is a flow child, which is what
        * keeps the board the same size from the first move to the last.
        */}
      {!sheetOpen ? (
        <IconButton
          size="lg"
          label={coach.nudge === null ? t('coach.open') : t('coach.openWaiting')}
          icon={<CoachIcon />}
          className={cx(
            'absolute right-4 bottom-[13rem] z-20 shadow-lift sm:hidden',
            coach.nudge !== null &&
              'after:absolute after:top-0 after:right-0 after:size-3 after:rounded-full after:bg-coach',
          )}
          onClick={() => setSheetOpen(true)}
        />
      ) : null}

      {sheetOpen ? (
        <div
          className="absolute inset-0 z-10 bg-ink/20 sm:hidden"
          onClick={() => { setSheetOpen(false); coach.dismiss(); }}
          aria-hidden="true"
        />
      ) : null}

      <div
        className={cx(
          'bg-paper-raised sm:static sm:block sm:max-h-none sm:overflow-visible sm:shadow-none',
          sheetOpen
            ? 'absolute inset-x-0 bottom-0 z-20 max-h-[72dvh] overflow-y-auto shadow-lift'
            : 'hidden',
        )}
      >
        <CoachPanel … />
      </div>
```

Add `const [sheetOpen, setSheetOpen] = useState(false);` to the view state, and derive nothing else — `speaking` stays as it is and is what keeps `onCollapse` wired.

The button's `bottom-[13rem]` clears the `min-h-[11.5rem]` keypad. If the keypad's height budget changes, that number changes with it; a comment on the class saying so is worth its line.

`CoachIcon` — reuse the existing `TargetIcon` from `src/ui/primitives/icons` rather than drawing a
new glyph, unless the icon set already has something better named. Check `IconButton`'s `size`
union before using `size="lg"`; `CoachPanel` only ever passes `sm`, so `lg` may not exist yet —
if it does not, add it there rather than reaching past the primitive with a className.

4. The sheet must open when the player asks for a hint by keyboard, or `H` would put text into a hidden panel: in `useBoardShortcuts`, change `onHint: coach.ask` to `onHint: () => { setSheetOpen(true); coach.ask(); }`.

- [ ] **Step 5: Move the nudge and the eraser into the panel**

In `src/ui/coach/CoachPanel.tsx`, add the four props from the Interfaces block above, and render them at the top of the panel body — above the ladder, below the header:

```tsx
      {nudge ? (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-cell border border-coach/35 bg-coach-wash px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-coach">
            {nudge.kind === 'contradiction'
              ? t('coach.nudge.contradiction')
              : nudge.kind === 'stale_marks'
                ? t('coach.nudge.staleMarks')
                : t('coach.nudge.stuck')}
          </p>
          <Button variant="ghost" onClick={onDismissNudge}>
            {t('action.dismiss')}
          </Button>
        </div>
      ) : null}
```

The "Show me where" button goes: the sheet covers the board, so spotlighting cells behind it points at nothing. Dismissal still records `triggerKey`, so a dismissed nudge stays dismissed.

Add the eraser to the existing action row, beside "Check my notes". `EraserIcon` is not imported
in this file yet — add it to the existing `../primitives/icons` import, and add `TeachableTrigger`
to the type import from `../../coach/types`:

```tsx
        {onClearStale && staleCount ? (
          <Button variant="ghost" size="lg" icon={<EraserIcon />} onClick={onClearStale}>
            {staleCount === 1 ? t('action.clearStaleOne') : t('action.clearStaleCount', { count: staleCount })}
          </Button>
        ) : null}
```

Wire both from `GameView`: `nudge={coach.nudge}`, `onDismissNudge={coach.dismissNudge}`, `staleCount={staleCount}`, `onClearStale={() => dispatch({ type: 'clearStaleCandidates' })}`.

- [ ] **Step 6: Run the layout test and the suite**

Run: `npx vitest run > /tmp/t4.log 2>&1; tail -25 /tmp/t4.log`
Expected: PASS, all four layout cases included.

- [ ] **Step 7: Commit**

```bash
git add src/app/GameView.tsx src/ui/coach/CoachPanel.tsx src/app/GameView.layout.test.tsx src/i18n/en.ts src/i18n/it.ts
git commit -m "feat(app): the coach floats, and the board stops moving

Three surfaces were appearing and disappearing around the square board — the
resting coach bar, the nudge, and the row of eraser buttons — and each one
resized the grid and walked the keypad under the player's thumb. Main now
holds the board and the keypad and nothing else, ever; the coach is a button
over the corner that opens a sheet, and the nudge it used to shout is a dot on
that button. The trigger machinery is untouched: what changed is that a
teachable moment now waits to be asked about."
```

---

### Task 5: The e2e specs play the new screen

**Files:**
- Modify: `tests/e2e/play.spec.ts:101-137`, `:234-265`, `:297`
- Modify: `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: the FAB label `Coach` and the sheet from Task 4; the armed-key `data-highlighted` from Task 3.

- [ ] **Step 1: Open the sheet before every coach assertion**

Every block that does `const coach = page.getByRole('region', { name: 'Coach' })` now needs the sheet open first. Add a helper at the top of `tests/e2e/play.spec.ts`:

```ts
/** The coach rests as a button on a phone; the panel is behind it. */
async function openCoach(page: Page) {
  const fab = page.getByRole('button', { name: /^Coach/ });
  if (await fab.isVisible()) await fab.click();
  return page.getByRole('region', { name: 'Coach' });
}
```

and replace each `const coach = page.getByRole(...)` with `const coach = await openCoach(page);`. The `isVisible()` guard keeps the desktop viewport passing, where the panel is static and there is no FAB.

- [ ] **Step 2: Add a spec for the sticky highlight**

```ts
test('the green highlight survives moving the caret', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: /^5/ }).click();
  const lit = page.locator('[role="gridcell"][data-match="true"]');
  await expect(lit.first()).toBeVisible();
  const before = await lit.count();
  await page.getByRole('gridcell', { name: /r5c5/ }).click();
  await expect(lit).toHaveCount(before);
});
```

Use whatever the file already calls its "start a game" helper instead of `startGame` if the name differs.

- [ ] **Step 3: Add the sheet to the axe pass**

In `tests/e2e/a11y.spec.ts`, the game screen is already audited. Add a second scan with the sheet open — it is a new screen state and the scrim plus the sheet change the focus order:

```ts
test('the coach sheet is accessible', async ({ page }) => {
  await startGame(page);
  await page.getByRole('button', { name: /^Coach/ }).click();
  await expect(page.getByRole('region', { name: 'Coach' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

Match the existing file's AxeBuilder setup, including any `withTags` or disabled-rule configuration it already applies.

- [ ] **Step 4: Run the e2e suite**

Run: `npm run e2e > /tmp/e2e.log 2>&1; tail -30 /tmp/e2e.log`
Expected: PASS. A failure in `pwa.spec.ts` or `language.spec.ts` means a selector moved — fix the selector, never the assertion.

- [ ] **Step 5: Run the whole gate**

Run: `npm run verify > /tmp/verify.log 2>&1; tail -25 /tmp/verify.log`
Expected: lint, `tsc -b`, vitest and build all clean.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): play the screen as it is now, with the coach behind a button

The specs reached straight for the coach region, which only existed because
the panel was always on screen. They now open it the way a player does, and
two new cases hold the lines this rework exists for: the highlight surviving a
caret move, and the sheet passing axe as its own screen state."
```

---

### Task 6: Ship it

**Files:** none — repository and tracker only.

- [ ] **Step 1: Open the PR**

```bash
git push -u origin feat/phone-ux-rework
gh pr create --fill --title "Phone UX: floating coach, sticky highlight, honest notes"
```

The body should say what the four defects cost the player and link the spec, not list the files.

- [ ] **Step 2: File the Italian review issue**

```bash
gh issue create --label needs-human \
  --title "Review the Italian for the coach button" \
  --body "\`coach.open\` and \`coach.openWaiting\` in src/i18n/it.ts were written by an agent and need a native reading. Introduced in feat/phone-ux-rework."
```

- [ ] **Step 3: Merge and update the tracker**

```bash
gh pr merge --auto --rebase
```

Then edit issue #22: add a row to the "Changed after the first play session" table naming this PR and the four defects, and record the new layout invariant under the verify contract so the next session does not re-break it.

---

## Notes for the executor

- **The board's height is the whole point.** If a change makes `<main>` hold a third flow child, the rework has failed even if every other test passes.
- **`Board.staleAt` stays.** Two callers still want the timeless question: `coach/candidates.ts` (the note review) and `coach/triggers.ts` (`staleMarksAfterPlacement`, on the nudge path). Only the drawn rule changed.
- **Desktop is out of scope.** Every new class is `sm:`-guarded back to what it was. If a desktop screenshot changes, something is over-reaching.
