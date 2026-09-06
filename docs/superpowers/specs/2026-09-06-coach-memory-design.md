# The coach remembers, and knows when not to speak

Design, 2026-09-06. Three findings from a play session, one root: the coach's on-screen state is
either wrong or forgotten.

Paolo ran "check my notes", fixed one issue, closed the sheet, reopened it — and had to run the
check again from nothing. He also noticed the coach still offering to teach a technique on a board
it had just declared unfinishable (issue #116).

**This design stacks on `feat/mistake-recovery`**, which is not yet merged. It consumes `deadEnd`
and the `rewind` phase from that branch.

## What the code does today

Read before designing anything; each of these is the current behaviour, not a guess.

- **`closeSheet` calls `coach.dismiss()`** (`src/app/GameView.tsx`), which nulls `hint`, `review`
  and `exhausted`. On a phone the sheet is the panel, so closing it is a *lifecycle* event rather
  than a viewport change. On a wide screen the panel is static and only the X does this — the
  asymmetry is the tell that the coupling is wrong.
- **The review has both failure modes at once.** It goes *stale* when a note is fixed by hand
  (nothing revalidates it) and *empty* when the sheet closes. `CandidateReview` is a one-shot
  snapshot; the `Coach` that produced it is thrown away immediately.
- **`recheckAfterFix`** (`src/app/GameView.tsx`) re-runs the check, but only after the bulk "fix
  notes" button. It carries two edge cases of its own: it stays armed indefinitely if the fix
  produced no moves, and its inequality test fires on an undo as readily as on a fix.
- **The ask button's only condition is `hint === null`** (`src/ui/coach/CoachPanel.tsx`). It is
  offered on a dead-end board, mid-rewind, and directly underneath "nothing found". `exhausted` is
  a latched flag, not a fact about the board.
- **The rewind banner needs a non-empty `redoStack`.** A dead end reached without undoing anything
  shows nothing at all, while the undo key sits amber. That is a gap in the branch this stacks on.
- `Board.hasContradiction()` exists and the coach never calls it. `deadEndCells` reimplements half
  of it. This design adds no third copy.

## 1 — The coach refuses to teach a board that cannot be finished

`GameView` already computes `deadEnd` for the rewind latch. It passes it to `CoachPanel` as
`unfinishable`. While it holds, the ask, escalate and challenge controls are replaced by one line
saying no hint can help until the board is fixable.

**"Check my notes" stays available.** It is the most useful thing to run when hunting for what went
wrong, and it reads the player's own marks rather than the catalog — it cannot be made wrong by an
unfinishable board.

### Gate on the fact, not on the phase

`unfinishable` is `deadEnd`, **not** `rewind === 'active'`. The two answer different questions and
they come apart: the phase stays `active` while any entry still contradicts the solution, but a
player who has stepped back out of the dead end has a board that is playable again, and a hint on
it is a perfectly good hint. Gating on the phase would refuse to teach a board that is fine.

The banner keeps using the phase, because "you are still on a wrong board" is what the phase means.
Its condition changes from `trail.length > 0` to `rewinding || trail.length > 0`, which closes the
gap above.

### What this deliberately does not do

`nextFinding()` stays a pure detector sweep. It returns null for three different boards — solved,
past the catalog's reach, unsolvable — and this design does not teach it to tell them apart. The
knowledge that a board is unfinishable already lives in `deadEndCells`; routing the decision
through the view keeps one source of it rather than adding a second inside the coach.

## 2 — The check list revalidates rather than re-runs

### Why revalidate

A full re-check runs the technique catalog to a fixed point (`eliminableCandidates`), which is the
most expensive computation in the app. Revalidating an existing report is O(issues): each issue
already names its cell and digit, so asking "is this still true?" is a candidate lookup.

Paolo's own framing settles it — *don't recheck unless tracking is more expensive than rechecking*.
It is not, by a wide margin, so the report is produced once and aged thereafter.

### The module

New file `src/coach/reviewProgress.ts`, pure, no React:

```ts
export type IssueState = 'open' | 'fixed';

export interface TrackedIssue {
  issue: CandidateIssue;
  state: IssueState;
}

export interface ReviewProgress {
  /** The issues still worth showing, in the order they were reported. */
  items: TrackedIssue[];
  open: number;
  total: number;
  /** Carried through from the report, so the panel needs no second prop. */
  checkedCells: number;
}

export function trackReview(
  review: CandidateReview,
  cells: readonly CoachCell[],
): ReviewProgress;
```

It lives beside `candidates.ts` rather than inside it: that module's job is producing a report, and
this one's is aging it. Two purposes, two files, each testable alone.

### The rules, per issue

Evaluated against the live board. A `Board` is built once per call from the cells' values.

| Condition | Result | Why |
| --- | --- | --- |
| The cell now holds a digit | dropped entirely | The cell is settled; a question about its pencil marks no longer means anything. |
| `missing`, and the digit is now noted | `fixed` | The player did the thing the report asked for. |
| `missing`, and the digit is no longer a true candidate | dropped | No longer true. Not the player's doing, and not something to take credit for. |
| `invalid`, and the note is gone | `fixed` | Same. |
| `invalid`, and the digit has become possible | dropped | A later change made the mark legitimate. |
| otherwise | `open` | Still to do. |

**The rows are tested in that order and the first match wins.** It matters: a `missing` digit the
player noted *and* whose cell they then filled is dropped, not counted as fixed. The cell being
settled is the stronger fact, and crediting a fix for a question that stopped existing would
inflate the count the player is reading.

**The list can only shrink.** Nothing is ever added — a new issue requires a new check, which
requires the player to ask. That is the property that keeps this from becoming a report nobody
requested, and it is why "drop" and "fixed" are the only two ways an item can leave `open`.

`open` and `total` count `items`, so a dropped issue leaves both — "2 of 4 left" rather than
"2 of 5 left" with one invisible. Honest, and it avoids a total the player cannot account for.

### Who calls it

`GameView` does, in a `useMemo` keyed on the review and `game.cells`, alongside the board-derived
memos it already holds. It passes `progress: ReviewProgress | null` to `CoachPanel` **in place of**
the current `review` prop — `checkedCells` rides along on `ReviewProgress` so the panel still has
everything the "N cells checked" copy needs, and the panel gains no second source of truth.

`CoachPanel` therefore stays a renderer and learns nothing about boards or candidates, which is the
same division `reviewProgress.ts` and `candidates.ts` have between them.

### What the panel shows

Fixed issues stay visible, ticked and struck through, with a count of what remains. Paolo chose
this over a list that simply shrinks: seeing what you have done is worth the extra rows, and the
rows are bounded by a report the player asked for.

### `recheckAfterFix` is deleted

The bulk "fix notes" button no longer needs to re-run anything — the list revalidates itself on the
next board change, which the fix causes. Deleting the ref removes both of its edge cases and the
race its comment documents, and it is the second time in this codebase that a targeted re-run has
turned out to be a symptom of state that should have been derived.

## 3 — Closing the sheet stops being a lifecycle event

`closeSheet` stops calling `coach.dismiss()`. It keeps calling `dismissNudge()`, deliberately: a
nudge is read, not re-solicited, and that reasoning is already written where it happens.

Reopening the sheet therefore shows what was left, revalidated against the board as it now stands.
The X on a wide screen still dismisses explicitly, because that is what it means there — the
control that clears the panel and the control that hides it are different controls, and the bug was
that on a phone they were the same one.

### Lifetime, stated exactly

Survives: closing and reopening the sheet, any number of times; every board change, with the
report aging as described.

Does not survive: switching games, switching locale (the issues carry localized `reason` strings),
or a reload. **Nothing new is persisted**, so `Game`, `PlayerProfile` and the frozen contracts are
untouched, and this design adds nothing to the sync payload.

## Testing

`trackReview` is pure, so its tests need no rendering: an issue fixed by hand, a cell filled since
the report, a `missing` digit that became eliminable, an `invalid` note that became legitimate, a
report with everything fixed, and an empty report.

In `GameView`: closing and reopening the sheet preserves the review; the ask button is absent on a
dead-end board and present on an ordinary one; "check my notes" is still offered on a dead-end
board; the rewind banner appears at a dead end with an empty redo stack.

Each gets the mutation. The dead-end fixture must be one that strands the board **without** a
rule-breaking placement — the `ruleCleanDeadEnd` fixture on the branch this stacks on already
exists and should be reused rather than re-derived.

## Files

- `src/coach/reviewProgress.ts` — new, plus its tests
- `src/ui/coach/CoachPanel.tsx` — the `unfinishable` prop, `progress` replacing `review`, the gated
  controls, the progress list, the banner's condition. Its `IssueList` currently branches on
  `review.checkedCells` and `review.issues`; it reads the same values off `ReviewProgress`.
- `src/app/GameView.tsx` — pass `unfinishable`, stop dismissing on close, delete `recheckAfterFix`
- `src/i18n/en.ts`, `src/i18n/it.ts` — the new strings; Italian to #65's pile
- `docs/architecture.md` — the coach's state lifetime, and why the sheet is a viewport
