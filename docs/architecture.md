# Sudoku Coach — architecture

Binding reference for every module. If code and this document disagree, one of
them is a bug; say which.

## Thesis

The app never hands out a digit. Every hint is grounded in a deterministic
`Finding` produced by the technique engine plus authored lesson text, so an
incorrect hint is impossible by construction. A runtime LLM is an optional P1
enhancement on top of a hint that has already been delivered — never a
dependency.

## Constraints

- **No backend computation.** Generation, rating, detection and coaching all run
  in the browser. Generation runs in a Web Worker so the UI thread never blocks.

  **Detection does not, and does not need to.** A full sweep of the detector
  catalog — every technique, in order, until one fires — was measured across
  whole solve paths at each difficulty: median 0.02ms, worst case 0.87ms, on an
  expert board whose hardest step is simple colouring. Generation is three
  orders of magnitude more expensive (7ms easy, 188ms expert) and is the only
  thing that earns a worker. The coach's 400ms idle debounce exists to avoid
  running a sweep between two keystrokes, not because a sweep is slow.
- **Local-first.** IndexedDB is the source of truth. No account is required for
  any P0 feature.
- **Static hosting, free tier.** The build is a static bundle deployed to Vercel.
  Zero serverless functions in P0.
- **Offline-complete.** Every P0 feature works with the network off (R9).

## Module map

| Path | Responsibility | Depends on |
| --- | --- | --- |
| `src/engine/types.ts` | **Frozen contracts.** Digit, Cell, House, Finding, TechniqueId, Difficulty | — |
| `src/engine/board.ts` | Board model, houses, peers, true candidates, contradiction checks | types |
| `src/engine/techniques/` | Ordered detector catalog; each returns a `Finding` | board |
| `src/engine/solver.ts` | Logical solver + solution counter (early exit at 2) | board, techniques |
| `src/engine/generator.ts` | Full-grid generation, clue digging, uniqueness, difficulty rating | solver |
| `src/engine/generator.worker.ts` | Worker wrapper; the UI never generates on the main thread | generator |
| `src/state/types.ts` | **Frozen contracts.** Move, Game, PlayerProfile, CoachExchange | engine/types |
| `src/state/game.ts` | Game reducer, move log, undo/redo, timer | state/types |
| `src/state/db.ts` | Dexie schema + migrations | state/types |
| `src/state/store.ts` | Multi-game registry, active game, autosave | game, db |
| `src/state/mastery.ts` | Per-technique mastery state machine | state/types |
| `src/coach/types.ts` | **Frozen contracts.** Lesson, Hint, CandidateReview | engine, state |
| `src/coach/lessons/{en,it}.json` | Authored lesson library — reviewed like code | — |
| `src/coach/coach.ts` | Disclosure ladder, hint rendering, teachable triggers | techniques, lessons |
| `src/coach/candidates.ts` | Pencil-mark diff against true candidates | board |
| `src/state/profile.ts` | Profile store: locale, settings, mastery. Write-through | db, mastery |
| `src/i18n/` | Flat dotted dictionary, `t()`, and the locale React context | state/types |
| `src/ui/` | Presentational components: grid, keypad, game list, coach panel | engine, state, i18n |
| `src/app/` | The assembled app: screens, and the hooks that bind them to the layers below | everything |
| `src/App.tsx` | Shell: hydration order, theme, locale, which screen is showing | app, state |

**The three `types.ts` files are frozen interfaces.** Parallel work streams build
against them. Changing one is a coordinated change: raise it rather than editing
locally. Open gaps are collected in issue #25.

### Inside `src/app/`

| Path | Responsibility |
| --- | --- |
| `LibraryView.tsx` | The resting screen: games in progress, finished games, the way in to Learn |
| `GameView.tsx` | The board, keypad, coach panel, and every dialog that belongs to a game |
| `LearnView.tsx` | The rules, the coach's contract, and a page per technique rendered from the lesson library |
| `NewGameSheet.tsx` | Difficulty choice, "let the coach choose", generation progress |
| `SettingsSheet.tsx` | Language, theme, conflict flagging, haptics |
| `OfflineNotice.tsx` | Says once when the precache makes offline play real |
| `useCoachSession.ts` | The ladder, the note check, teachable nudges, and mastery credit |
| `useGenerator.ts` | One worker per mounted app, aborted when nobody is waiting |

There is no router. Which screen shows is derived from the store's
`activeGameId` plus two pieces of shell state, because a URL for a board would
only mean something on the device holding that game.

## Key invariants

1. **User candidates are user-owned.** The engine computes true candidates on
   demand for checking. It never silently edits a player's pencil marks. Every
   mark change is a `Move` the player caused or explicitly requested.
2. **The solution string never leaves the engine.** It exists to verify
   uniqueness and to detect contradictions. It is never read to produce hint
   text, and never serialized to the coach in full (spec §5.6).
3. **A finding's eliminations are sound.** Property test: applying any finding's
   eliminations never removes the true solution's digit from a cell (R6).
4. **Disclosure discipline.** A cell's digit is never rendered below disclosure
   level 4, and level 4 states eliminations and logic — not "put N here" (R7).
5. **`Game` is self-contained and serializable.** No class instances, no
   functions, no cycles — so a P2 sync layer is additive.
6. **The reducer is the only writer of a game.** Every board change goes through
   `state/game.ts`, so undo, autosave and the clock cannot be bypassed by a
   screen. The coach hands its log back through `setCoachLog` rather than
   mutating; `coach/` owns the rules for what that log may contain, and `state/`
   never imports `coach/`.
7. **Chrome is never hardcoded English.** Every user-visible string comes from
   `src/i18n`, read through the locale context. A component that spells its own
   copy will ship English into the Italian build.
8. **A note is flagged only when the player killed it.** The sharpest form of
   invariant 1. The board strikes a pencil mark through only when one of the
   player's *own later* placements contradicted it: `deadNotes()`
   (`src/state/deadNotes.ts`) compares when a mark was written against when a
   peer was filled, and both timestamps come from the move log. A mark written
   into a square a peer already held stays unmarked — striking that one as it
   is typed would perform the elimination the player came here to learn. It is
   theirs to find, and "check my notes" is what finds it.
9. **The board never gives up its box.** No content that appears or
   disappears during play — a nudge, a badge, an aside that exists only at
   a wider tier — may resize the board, at any viewport: it is drawn over
   the board and keypad or it is not drawn. Four tiers share the rule —
   `phone`, `tablet`, `laptop`, `desktop` — declared in
   `src/app/useViewportTier.ts`. Guarded at both levels it could break. In
   `src/app/GameView.layout.test.tsx`, two unit canaries, because the
   stacked and side-by-side branches break differently: the stacked one
   asserts the root column's in-flow children are the header and `<main>`
   alone, and the wide one asserts the row's in-flow children are `<main>`
   and the columns, each column pinned by `w-* shrink-0 min-w-0` so it
   cannot take width from the board. Above them, the Playwright board-box
   assertion in `tests/e2e/play.spec.ts` measures the real thing in all four
   projects, through the level-2 disclosure that swaps the lesson column's
   contents — the one state that actually changes a column's content mid-game.
10. **Prose caps at 40rem; the narrow pane's width is the tier's, not the
    content's.** Cousins of invariant 9 — one protects the board's box, this
    protects the reader's measure and the panes around it. "Use the whole
    area" cannot mean wider sentences: a lesson stretched across 1536px reads
    worse than a narrow column, so the width bought above 1024 buys more
    panes, not a wider one. `SplitLayout` (`src/app/SplitLayout.tsx`) is where
    the library and Learn split into two panes at that width. It fixes the
    *narrow* pane's width to the tier alone — `w-*`, `shrink-0` and `min-w-0`
    together, because `shrink-0` alone leaves `min-width: auto`, which floors
    a flex item at its min-content width, so one long technique name would
    widen the pane and take the difference from its neighbour. Choosing a
    lesson must not move the list you chose it from. The other pane is
    `flex-1` and tracks the viewport, so it is the one that needs a cap.
    Which side is which is the caller's call — the `narrow` prop — because
    the two screens disagree: Learn's index is narrow beside a wide lesson,
    the library's games are wide beside a narrow progress pane. A screen's
    main content belongs in the wide pane; the library's list is why that
    screen exists, and in the narrow one it would have been 320px on a laptop
    against 343px on a phone. `SplitLayout` leaves the 40rem prose cap
    (roughly a 70-character measure) to its callers, consistent with its own
    refusal to own pane content: Learn wraps its lesson in `max-w-[40rem]`
    itself, asserted in `LearnView.wide.test.tsx`. Content in a *narrow* pane
    needs no cap — 20rem is half of it — which is why `ProgressPanel` carries
    none; `LibraryView.test.tsx` pins it to the narrow pane instead, so the
    measure stays bounded by something that is actually load-bearing. The
    game screen splits at the same tiers, for invariant 9's reason, not this
    one.

## Difficulty rating

Difficulty is a property of the *solve path*, not of clue count: rate a puzzle by
solving it with the detector catalog in order and recording the hardest technique
required. See `DIFFICULTY_TECHNIQUES` in `src/engine/types.ts` for the
level → technique mapping. Generation retries until the rating matches, with an
attempt cap and a fallback to the nearest achieved level.

## Verify contract

`npm run verify` = `lint` → `tsc -b` → `test` → `build`. CI runs exactly this,
plus `npm run e2e` and `npm run audit` (Lighthouse, thresholds in
`lighthouserc.json`). A branch merges when all three jobs are green.

The e2e suite plays a generated puzzle to completion with no test-only seam in
the bundle: it reads the board out of the DOM and solves it with the engine the
app ships. Installability and offline play are asserted there too — Lighthouse
12 removed the PWA category, so the remaining Lighthouse gate covers
performance, accessibility, best practices and SEO.

## Milestones

| Milestone | Scope | Branch prefix |
| --- | --- | --- |
| M0 | Repo, contracts, `engine/board`, design system, CI | `main` |
| M1 | Technique detectors + property tests | `feat/techniques` |
| M2 | Game state, moves, undo/redo, timer | `feat/game-state` |
| M3 | Dexie persistence, multi-game registry | `feat/persistence` |
| M4 | UI: grid, keypad, pencil marks, highlight, game list | `feat/ui` |
| M5 | Generator + rating + worker | `feat/generator` |
| M6 | Coach: ladder, candidate check, triggers | `feat/coach` |
| M7 | Lesson library IT + EN, mastery model, recap | `feat/lessons` |
| M8 | Integration, e2e, PWA audit, deploy | `main` |

M8 landed in #36. Work since then is P1 from the issue tracker rather than
milestones: Learn (#31), the training-wheels candidate fill (#20), the post-solve
recap and mastery-biased puzzle choice (#19).
