# The library and Learn answer to the viewport too

Date: 2026-09-02
Status: approved in chat, not yet implemented
Origin: Paolo, after the game screen's responsive rework merged (#63) — "consider all
other views needs to use whole the area."

## The complaint

The game screen now has four layouts. Every other screen still caps at 576px and centres:
`LibraryView.tsx:38` and `LearnView.tsx:72,84` are all `mx-auto w-full max-w-xl`. On a
laptop the game list and the whole Learn section are still a phone column with empty space
either side.

## The constraint that shapes both answers

**Prose has a maximum useful width.** A lesson stretched across 1536px is a ~200-character
measure, which is harder to read than a narrow column, not easier. "Use the whole area"
cannot mean "make the text wider" — it has to mean *put more in it*. Both screens therefore
gain a second pane rather than a wider one, and any pane containing prose keeps a readable
cap regardless of how much room it is given.

## Tiers

The same four the game screen uses, from `src/app/useViewportTier.ts` — no new breakpoints,
no second source of truth about what "wide" means.

| Tier | Width | Both screens |
| --- | --- | --- |
| phone | < 640 | **Unchanged.** One column; Learn is a list that opens a full page. |
| tablet | 640–1023 | One column, cap lifted so it uses the width it has. |
| laptop | 1024–1535 | Two panes. |
| desktop | ≥ 1536 | Two panes, wider. |

Two panes wait for 1024 for the reason they did on the game screen: splitting a 640px
viewport gives two columns that are each worse than the one they replaced.

## One split, not two

Both screens land on the same shape — a narrower index pane beside a wider content pane —
so the split is one small presentational component rather than the same flex row written
twice. It takes the two panes as nodes, arranges them per tier, and holds no state.

That component is the only new layout primitive this work adds. `GameLayout` stays as it is:
it arranges three regions under a different invariant, and merging the two would produce a
component with two unrelated reasons to change.

## The library

**Left pane:** the existing `GameList` sections, unchanged.

**Right pane — your progress.** Almost all of it exists. `TechniqueIndex` already renders
the fourteen techniques with their names, one-liners and mastery chips, and takes an
optional `onOpen`; the library passes none, so its rows render as static text rather than
controls. Above it sits one line naming what to learn next, from
`edgeOfMastery(profile)` — the same reading the coach uses to choose a puzzle at the edge of
what the player knows.

So the pane is a thin `ProgressPanel`: the next-up line plus `TechniqueIndex`. It introduces
almost no new rendering code, which is the point — the library and the game screen's third
column should not drift into two different accounts of the same mastery data.

`LibraryView` does not currently receive the profile. It takes it from `useProfile` the way
`GameView` does, rather than threading a new prop through `App.tsx`.

## Learn

**Left pane:** the technique index, with `onOpen` wired as it is today.

**Right pane:** the selected lesson — and when nothing is selected, the four intro sections
(rules, notes, the coach, the keys) that currently sit above the list. The pane therefore has
content from the moment the screen opens: nothing jumps, and the layout never shows a blank
half.

`LearnView` already accepts a `technique` prop, which the coach uses to deep-link "what is
this technique?". Two-pane means that opens with the technique selected in the right pane
rather than pushing a page over the list.

**Phone and tablet keep today's behaviour exactly**: the intro sections above the index, and
opening a technique replaces the screen with a page carrying a back button.

## What each screen must not do

- No pane may stretch prose past a readable measure. The content pane caps its text
  regardless of the pane's width.
- Selecting a technique must not resize the index pane. The panes' widths are a property of
  the tier, as on the game screen.
- The phone layout of both screens is signed-off work. If a phone test needs editing, that is
  a defect in the change, not a test to update.

## Testing

- Unit, per tier, for both screens: which panes exist, that the content pane always has
  something in it, and that the prose cap is applied.
- The four Playwright projects already exist. Both screens get a laptop and a wide case, plus
  axe — a two-pane screen is a new reading order and a new set of landmarks, and Learn's
  index pane is a list of controls beside a document.
- The existing phone specs for both screens must pass unedited.

## Out of scope

The game screen; the settings and new-game sheets, which are modals and correctly sized; the
lesson content itself; the mastery rules; and anything about what the coach says.
