# The layout answers to the viewport

Date: 2026-09-01
Status: approved in chat, not yet implemented
Origin: Paolo, after the phone rework merged — "the layout we recently discussed was for optimizing
mobile experience; I expect the webpage on laptops and desktops to take advantage of the whole
available area and make it a richer experience."

## The complaint

`GameView`'s shell is `mx-auto … max-w-xl`, a hard 576px cap, and `sm:` (640px) is the only
breakpoint in the codebase. Every screen wider than a large phone gets the same thing: a phone
column centred in the middle of the display with empty space either side. On a 27" monitor that is
two feet of nothing.

The phone layout is not the problem — it was designed for a phone and it works. The problem is that
it is also the *only* layout.

## What the extra room is for

Not a bigger board. A sudoku grid past roughly 640px means moving your head to scan a row, so
growing it further stops helping and starts hurting. The room buys **more of the app visible at
once**: the coach stops being something you summon and dismiss, and the lesson stops being a place
you navigate away to.

## Tiers

| Tier | Width | Layout |
| --- | --- | --- |
| phone | < 640 | **Untouched.** One column, board + keypad, coach as a sheet behind the header button. |
| tablet | 640–1023 | Stacked, as today — board + keypad, coach beneath, page scrolls — but the 576px cap lifts so the board can use the width it has. |
| laptop | 1024–1535 | Two columns: board + keypad, and the coach beside it. |
| desktop | ≥ 1536 | Three columns: board + keypad, coach, lesson. |

**The board caps at 40rem (640px).** Past roughly that, scanning a row means moving your head rather
than your eyes, so a larger grid is not a better one. Every tier above tablet spends its surplus
width on columns instead of on the board.

Two columns deliberately wait for 1024 rather than starting at 640. Splitting a 640px viewport gives
a ~380px board beside a ~250px coach — both worse than the stacked layout that is already there. The
tablet tier therefore changes one thing only: the cap. That is the smallest change that answers the
letterboxing without inventing a cramped layout nobody asked for.

The lesson column waits until 1536 because a lesson is prose. A third of a 1280px screen is roughly
a 45-character measure, which reads worse than not having the column at all.

Tailwind's stock scale supplies 640 (`sm`), 1024 (`lg`) and 1536 (`2xl`), so the tiers need no custom
breakpoints. `md` and `xl` go unused, which is worth a comment where the tiers are declared so the
next reader does not assume they were forgotten.

## The invariant generalises

`docs/architecture.md` invariant 9 says nothing outside the board and the keypad may occupy layout
height during play. That was written for a phone, where the columns stack and height is the scarce
thing. Side by side, the threat is width instead.

The invariant becomes: **no content appearing or disappearing during play may resize the board, at
any viewport.**

Concretely: the coach and lesson columns are fixed-width for their tier, and the board is capped and
centred in whatever the board column has. A hint arriving, a nudge lighting, dead notes appearing,
the lesson swapping in — none of them may change the board's box. Which tier you are in decides the
board's size; nothing the coach does during a game may.

The existing Playwright height assertion already checks this on a short phone viewport. It extends
to one check per tier, which is also the regression test for the whole feature.

## The three regions

**Board column.** Board and keypad, exactly as today. The keypad stays on desktop — it is the input
for touchscreen laptops and for every player who has not found the keyboard shortcuts, and removing
it would make the mouse the only pointer path.

**Coach column.** The `CoachPanel` that already renders statically at `sm:` and up. Its ladder, hint
text, drill and note review are the column's content. The modal machinery — `isNarrow`, `modalOpen`,
the focus trap, Escape — is already gated to narrow viewports and stays exactly as it is; on tablet
and up the panel simply is not a modal, which is today's behaviour.

**Lesson column.** Shows the lesson for the technique the coach has named, once it has named one
(disclosure level 2+). Before that — and after a hint is dismissed — it shows the **technique
index**: what the player has mastered and what is next, drawn from the existing mastery store.

The index is not filler. It is the same data the coach uses to choose a puzzle at the edge of
mastery, and putting it beside the board is the clearest statement the app can make about what it is
for. It also means the column never renders empty and the layout never jumps: the column's box is
constant, only its contents change.

## Structure

`LearnView` already renders lesson bodies. Extracting that into a component both it and the game
screen use is the whole of the sharing needed — the game screen must not grow its own copy of lesson
rendering.

`GameView.tsx` is already long, and adding three-way composition to it directly is how it becomes
unreadable. The shell — which regions exist at this tier and how they are arranged — belongs in its
own component, leaving `GameView` to own game state and hand each region its props.

That split is worth doing as part of this work rather than after it: the layout is the thing being
changed, and it is the last moment when the file is small enough to divide cleanly.

## Testing

- One Playwright project per tier that has a distinct layout, so each is actually exercised rather
  than asserted about.
- The board-box assertion per tier: constant across coach idle, hint shown, nudge lit, dead notes
  present, and (at desktop) lesson swapped in.
- The existing phone specs must pass unchanged. If a phone spec needs editing, the phone layout has
  been touched and that is a defect, not a test update.
- axe on each tier — a three-column layout is a different reading order and a different set of
  landmarks from a single column.

## Out of scope

The Learn section's own screen, the library, lesson content, the coaching rules, and the phone
layout in every respect.
