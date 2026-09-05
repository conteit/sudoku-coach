# Recovering from a mistake

Design, 2026-09-05. Three changes that arrived from a play session: Paolo reached a board where no
digit could go anywhere, the coach told him a digit was wrong, and the only thing on offer was
"Not now".

The three share a root. The app knows more than it says — it knows an entry contradicts the
solution, it knows a placement conflicts with a peer, it knows a cell is down to one mark — and in
each case it either says nothing or acts on the knowledge in a way that costs the player work. The
theme is letting it act, without any of the three handing over a digit.

## What the app already has

Read before designing anything here; every mechanism below is existing code.

- `contradictionAt` (`src/coach/triggers.ts`) returns the cell holding a wrong entry, most recently
  placed first. It compares against the solution and reports a cell index, never the expected
  digit.
- `constraintBreach` (same file) already asks, per peer of a cell, whether `trueCandidates` is
  empty — the stranded-cell case.
- `Game.undoStack` is a flat `Move[]` capped at `MAX_HISTORY = 2000`, which is more moves than a
  sudoku has. The whole game is in the log.
- `undo` pops one batch and pushes it onto `redoStack`. Repeated undo therefore *builds a
  chronological record of what was undone*, and it is already persisted and already serializable.
- Auto-clear is dispatched from `enter()` in `src/app/GameView.tsx`, as a consequence of the
  placement rather than from an effect — see invariant 1 for why that distinction is load-bearing.
- `Keypad.tsx` holds the only long-press timer in the app, inline, for the digit long-press that
  arms the green highlight.

## 1 — Amber rewind

### The problem

A wrong entry is knowable long before it is fatal. Today the player learns about it from a nudge
that names no cell, and the only remedy is to undo by feel or to abandon the game. Paolo's ask is
narrow and worth quoting: *reduce the frustration of having to restart from scratch*. It is not a
request for a hint.

### Trigger

A new pure function in `src/coach/triggers.ts`:

```ts
export function deadEndCells(cells: readonly TriggerCell[]): CellIndex[]
```

Empty cells whose true candidate set is empty. This is `constraintBreach`'s stranded-cell test
widened from one cell's peers to the board.

It is a plain exported function, not a new `TeachableTrigger` variant. `coach/types.ts` is a frozen
contract, and this does not need to be in it: a dead end is a recovery affordance the view offers,
not a moment the coach speaks about. Nothing in `coach/` grows a new output shape.

A generated puzzle has a unique solution, so a dead end implies a wrong entry. The converse is
false, which is what makes the dead end the right trigger rather than the contradiction: it is the
moment the player is actually stuck, and it is the moment Paolo asked for.

### The latch

`GameView` holds ephemeral component state, `rewinding`:

- set true on any render where `deadEndCells(...)` is non-empty
- set false on any render where `contradictionAt(...)` returns null

The two are evaluated in that order and cannot fight, because a dead end implies a contradiction:
while the board is still stuck, the disarming condition is false by construction.

Not persisted, and not added to `Game` — `Game` is a sync payload (invariant 5) and this is a
transient view mode that a reload can recompute. After a reload mid-rewind the dead end is still
on the board, so the latch re-arms by itself.

The two conditions are deliberately different. It arms at the dead end, and it disarms one press
earlier than that — at the moment the wrong digit leaves the board.

### Disclosure

The amber going out tells the player which move was wrong. This was put to Paolo explicitly and he
accepted it, with the reasoning that the existing nudge already tells him a mistake exists and that
going back until the warning clears reaches the same place by hand. Recorded here because it is a
deliberate loosening of what the coach says, not an oversight:

**The known edge.** In a cell the player had narrowed to two candidates, "this one is wrong" is the
other digit. This design accepts that. It is the price of recovery, and the alternative — clearing
the amber some indeterminate number of steps late — makes the control lie about its own state.

Invariant 4 is untouched: no cell is ever *rendered* with a digit it does not hold, and no hint text
gains an assignment. What changes is that a control's colour is derived from the contradiction, and
the contradiction was already announced.

### The control

The existing undo button (`src/ui/keypad/Keypad.tsx`) takes an amber variant while `rewinding`.
Paolo's words: a yellowish undo in place of the original, returning to normal when the mistake is
reverted.

No new button, and **no new reducer action**. Stepping back is the `undo` that already exists, and
every step lands on `redoStack`, so a rewind is itself reversible: a player who decides they were
wrong about being wrong presses redo.

### The trail

`redoStack` is the list of undone moves. The coach panel renders it — newest first, each row
naming the cell and what the move did, with the top entry marked as the placement that was wrong.

It is shown while `rewinding`, and afterwards while a second ephemeral flag `rewound` holds. That
flag is set the moment `rewinding` clears and is itself cleared when `redoStack` empties — which
happens either because the player redid everything or because they made a new move, since
`commit` invalidates the redo branch. So the trail outlives the rewind exactly as long as the moves
it describes are still restorable, and no longer.

The flag is what keeps an ordinary mid-game undo from raising a trail. Pressing undo once during
normal play is not a rewind and must not look like one.

**Known limitation, stated rather than hidden.** On a phone the coach panel is a sheet that covers
the keypad. The trail is therefore read *after* stepping, not during it. That is an acceptable
ordering — the learning value is in reviewing the path, and `redoStack` survives until the next
action — but it is a compromise and a later design may improve on it.

Invariant 9 holds: the trail is inside the coach panel's existing box and resizes no board.

## 2 — Auto-clear skips a red digit

### The problem

`autoClearDeadNotes` treats every placement as authoritative. A typo therefore destroys the notes
its wrong digit contradicts. One undo restores them by invariant 1's design, but the player has to
notice in time, and the undo also removes the digit they were mid-thought about.

### The change

In `enter()` (`src/app/GameView.tsx`), skip the `clearStaleCandidates` dispatch when the placed
digit conflicts with a peer:

```ts
if (!pencilMode && settings.autoClearDeadNotes && !conflictsWithPeer(cell, digit)) {
  dispatch({ type: 'clearStaleCandidates' });
}
```

Computed from `Board.conflictsAt`, keyed on the *fact* of the conflict and never on
`settings.highlightConflicts`. A player who turns the colour off has changed what they see, not
what the app does on their behalf.

### What this deliberately does not do

It does not extend to entries that are wrong but conflict with nothing. The engine could catch
those from the solution — but notes surviving a placement would then be a visible tell that the
digit is wrong, which is invariant 2 leaking out through a side effect instead of through text.
Conflict-only is exactly what the rules can see without the answer.

Invariant 1 in `docs/architecture.md` gains this exception in its own words.

## 3 — Long-press promotes a lone note

### The problem

A cell down to one mark still requires selecting it and hitting the right key, and the mis-key
writes a digit that is simply false. The risk is highest at the moment the player has just done the
reasoning correctly.

### The change

Long-pressing an empty cell that holds exactly one note places that digit, as one ordinary
`setValue` move. `Enter` on the selected cell does the same from the keyboard
(`src/app/useBoardShortcuts.ts`).

No new move kind, no batch, nothing outside the existing reducer. It places the player's own
conclusion; if the note was wrong, the digit is wrong, and everything downstream — conflicts, the
contradiction nudge, the amber rewind — behaves exactly as it does for a typed digit.

### The setting

`settings.promoteLoneNote`, **on by default**.

The first draft of this design argued for no switch, on the grounds that the gesture is its own
opt-in and that an off state of "the long press silently does nothing" is a control with no visible
referent. That argument is wrong, and the reason it is wrong is worth keeping: **a slow tap on a
phone is a long press.** The gesture can fire by accident, and when it does it places a digit. A
player it keeps surprising cannot simply decline to use it, so the switch has a referent after
all — it is the difference between a board that gains digits from a hesitant thumb and one that
does not.

On by default because it discloses nothing. Every aid that defaults off here —
`autoClearDeadNotes`, `sweepOneDigit`, `shadeDigitPeers`, `highlightMatchingNotes` — defaults off
because it does a share of the player's reasoning or edits their marks unasked. This does neither:
it places a conclusion the player has already written down, as an ordinary undoable move. The
annoyance it removes is the reason it was asked for, and an aid that has to be discovered in
Settings before it helps has not helped.

It stays deliberately one cell at a time. Promoting on selection, or promoting every lone note at
once, would chain into an automatic solve — which Paolo ruled out.

### The cost of the field

`PlayerProfile.settings` lives in `src/state/types.ts`, a frozen contract, and the profile is a
sync payload with no timestamp of its own. The change is additive and follows the path
`sweepOneDigit` and `shadeDigitPeers` already took: a new boolean with its default in
`src/state/mastery.ts`, so a profile written by an older build reads back with the default rather
than `undefined`. Noted here because "frozen" means coordinated, not immovable, and this is the
coordination.

### Shared gesture code

`Keypad.tsx` holds the app's only press timer, inline. Extract it to a shared `useLongPress` hook
and use it for both gestures, so threshold and drag-cancellation cannot drift between the two. This
is a targeted improvement to code the change is already touching, not a refactor of its own.

## Testing

Every test below gets the mutation run required by `CLAUDE.md` — break the subject, watch it fail,
restore it.

| Claim | Where |
| --- | --- |
| `deadEndCells` finds a stranded empty cell and is silent on a solvable board | `src/coach/triggers.test.ts` |
| Undo goes amber at a dead end | `src/app/GameView.*.test.tsx` |
| Amber clears on the undo that removes the wrong digit, not before | same |
| Redo restores a rewind | same |
| The trail lists undone moves, newest first | `src/ui/coach/CoachPanel.test.tsx` |
| An ordinary undo during normal play raises no trail | `src/app/GameView.*.test.tsx` |
| Auto-clear leaves notes alone behind a conflicting digit | `src/app/GameView.settings.test.tsx` |
| Auto-clear still clears behind a clean digit | same |
| The skip does not depend on `highlightConflicts` | same |
| Long-press promotes at exactly one note | new `GameView.promote.test.tsx` |
| Long-press does nothing at zero, two or more notes, or on a filled cell | same |
| Long-press does nothing with `promoteLoneNote` off | same |
| A profile stored without the field reads back with the default | `src/state/profile.test.ts` |

## Files

- `src/coach/triggers.ts` — `deadEndCells`
- `src/app/GameView.tsx` — the `rewinding` latch, the auto-clear gate, the promote handler
- `src/ui/keypad/Keypad.tsx` — amber undo variant; `useLongPress` extracted out of it
- `src/ui/board/Cell.tsx`, `src/ui/board/SudokuGrid.tsx` — long-press plumbing to the cell
- `src/ui/coach/CoachPanel.tsx` — the rewind trail
- `src/app/useBoardShortcuts.ts` — `Enter` promotes
- `src/state/types.ts`, `src/state/mastery.ts` — `promoteLoneNote` and its default
- `src/app/SettingsSheet.tsx` — the switch, beside the other play aids
- `src/i18n/en.ts`, `src/i18n/it.ts` — new strings; the Italian goes on #65's pile
- `docs/architecture.md` — invariant 1's exception, and the rewind's own note
