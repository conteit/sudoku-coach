# Phone UX rework — floating coach, on-demand help, sticky highlight, honest notes

Date: 2026-09-01
Status: approved, not yet implemented
Origin: Paolo's second play session on an iPhone, after #53/#54/#55 landed.

## The complaint

The phone build is unusable in four distinct ways, and they are independent bugs
rather than one layout problem:

1. The grid and the controls move. Coach output changes the height available to the
   board, so the square shrinks and the keypad drifts out of reach.
2. The coach speaks before it is wanted. Help that arrives unasked is noise.
3. The green same-digit highlight dies the moment the selected cell moves, so it
   cannot be used to scan the grid — the one job it exists for.
4. A note is struck through the instant it is written next to a peer that already
   holds it. The app performs the elimination the player came to learn.

PR #54 already made the coach *overlay while speaking*. That part works. What still
moves the board is everything else the coach owns.

## Invariant this work adds

**Nothing outside the board and the keypad may occupy layout height during play.**

`GameView`'s `<main>` gets exactly two flow children for the whole life of a game.
Every other surface — coach, nudge, stale-note actions — is positioned out of flow.
This is the property to regression-test: board pixel height is constant from first
move to last.

## 1. The coach floats

Today `<main>` (`GameView.tsx` L196) contains the board wrapper (`flex-1`,
`aspect-square h-full`) and `Keypad` (`shrink-0`), but three siblings appear and
disappear around them:

| Surface | Where | Why it moves the board |
| --- | --- | --- |
| Resting coach bar | `GameView.tsx` L292-297 | `shrink-0` in normal flow until `speaking` |
| Nudge `<aside>` | `GameView.tsx` L266-284 | flow sibling with no `shrink-0`; steals height from the square |
| "Clear stale" row | `GameView.tsx` L231-244 | conditional `shrink-0` row |

Changes:

- The coach's resting state becomes a **FAB**, `absolute` over the board's
  bottom-right corner, above the keypad. It is not a flow child.
- Tapping it opens the **bottom sheet**: `absolute inset-x-0 bottom-0 z-20
  max-h-[72dvh] overflow-y-auto`, i.e. the styles `CoachPanel`'s host already
  applies while speaking (L292-298). Dismiss by tap-away or swipe down.
  `sm:static` keeps the desktop layout as it is.
- The nudge `<aside>` is deleted as a surface. Its content is reachable in the
  sheet; its signal becomes the badge in §2.
- The "clear stale" action moves into the sheet.

`CoachPanel` keeps its ladder, hint text and buttons. What changes is who positions
it and what its resting state looks like.

## 2. The coach is silent until asked

Hints are already strictly user-invoked (`useCoachSession.ts`: `ask`, `escalate`,
`startDrill`, `checkMarks`). The only unprompted channel is the nudge — the
debounced effect at L179-242 (`IDLE_MS` 400, `NUDGE_POLL_MS` 15s) feeding
`teachableTriggers` (`coach/triggers.ts` L166-189: `contradiction` > `stale_marks` >
`stuck`).

Keep that machinery. Change only its sink: a live trigger lights a **dot on the
FAB** instead of rendering a surface. The coach never opens itself and never takes
space. Opening the sheet consumes the badge. Per-trigger `triggerKey` /
`dismissedNudge` identity carries over unchanged.

## 3. The highlight is sticky and keypad-driven

`SudokuGrid.tsx` L106 derives the highlight from the selection:

```ts
const matchDigit = selected === null ? null : cells[selected]?.value ?? null;
```

That is the whole bug — there is no highlight state, so moving the selection
recomputes it away.

- Add `highlightDigit: Digit | null` to `GameView` view state and pass it down.
  `selected` no longer influences it; `CELL_MATCH` flagging and the pencil-mark echo
  in `Cell.tsx` are unchanged below that prop.
- Tapping keypad digit `d` sets the highlight to `d`.
- Tapping `d` while `d` is already highlighted **and the tap enters nothing** — no
  cell selected, or the selected cell already holds `d` — clears the highlight.
  The guard exists so that placing the same digit into two cells in a row does not
  flicker the highlight off.
- The keypad shows which digit is armed.
- `highlightMatches={false}` (`LearnView.tsx` L113) still suppresses the whole
  layer.

## 4. Notes are flagged only when a placement kills them

`GameView.tsx` L97-103 memoises `board.staleAt` across every note on every board
change. `Board.staleAt` (`engine/board.ts` L195-202) answers "is this noted digit
already held by a peer?" — a time-blind question. So a note written next to an
existing peer is struck through immediately, and finding the live notes stops being
work.

The rule becomes: **a note is flagged only when the peer placement that kills it
happened after the note was written.**

Both timestamps are already in the move list — `toggleCandidate` moves carry the
note's `at`, `set` moves carry the placement's `at` (`state/types.ts: Move`). So the
flag set is derivable by replaying moves, which means it survives undo, redo and
reload with no change to the frozen `Game` shape.

- The derivation belongs beside `Board.staleAt` in the engine, not in the view.
- `Board.staleAt` itself stays: `coach/candidates.ts` and the coach's own note
  review are separate features and keep the time-blind question.
- `state/game.ts` `clearStaleCandidates` (L454-470) is unchanged; it clears whatever
  the new rule flags, still in one undoable step.
- A note typed into an already-dead square stays unmarked. That is deliberate: it is
  the player's error to find, and "check my notes" is the affordance that finds it.

## Testing

- vitest: the timestamp rule (note before placement → flagged; note after → not;
  undo of the placement unflags), and the highlight state machine including the
  no-entry toggle guard.
- A regression test for the invariant: board height constant across coach open,
  coach closed, badge lit, and stale-notes present.
- e2e: the spec that drives the coach bar is rewritten for FAB + sheet.
- axe: the open sheet is a new screen state and needs a pass.
- `npm run verify` and `npm run e2e` unchanged as the gate.

## Out of scope

Desktop layout, the lesson content, the disclosure ladder, drill mode, and the
`fillCandidates` reducer case (already unreachable, left alone).
