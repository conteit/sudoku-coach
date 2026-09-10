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

  Sign-in is optional in the strongest sense the code can express: without the
  Firebase config in the environment the build has *no* sign-in — not a
  disabled button, not an error — and `src/state/account.ts` answers every
  call with a shrug. The SDK is dynamically imported, so a player who never
  signs in never downloads it. Signing out stops syncing and touches no saved
  game; the account lives in its own store rather than on `PlayerProfile`,
  because an account is not a coaching preference.
- **Static hosting, free tier.** The build is a static bundle deployed to Vercel.
  Zero serverless functions in P0.

  The CSP in `vercel.json` is the tightest thing that still works, and it is
  widened only against evidence. Sign-in needs three entries beyond `'self'`,
  and each was added after a console line named it: `script-src` reaches
  `apis.google.com`, which is where the SDK loads the loader for its own
  iframe (`api.js?onload=__iframefcb…`); `connect-src` covers the two token
  endpoints; `frame-src` covers the auth handler's iframe. The popup window
  itself is a top-level context and outside our policy entirely. Anything
  further waits for another such line, because a policy widened on a guess is
  a policy nobody can tighten later with confidence — this one was widened on
  a guess once, and taken back.

  **`unsafe-inline` in `script-src` is the line that does not move.** If the
  popup flow ever genuinely requires it, the answer is the redirect flow.
  `Cross-Origin-Opener-Policy` is `same-origin-allow-popups` for the same
  feature: `same-origin` stops the popup talking back to the page that opened
  it.

  Vercel's preview-comments toolbar (`vercel.live`) is blocked by this policy
  and stays blocked. It is a vendor widget on preview deployments only, and
  production's CSP is not the place to make room for it.
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
| `src/engine/exercise.ts` | Where along a solve path a technique becomes the move | solver, techniques |
| `src/state/types.ts` | **Frozen contracts.** Move, Game, PlayerProfile, CoachExchange | engine/types |
| `src/state/game.ts` | Game reducer, move log, undo/redo, timer | state/types |
| `src/state/db.ts` | Dexie schema + migrations | state/types |
| `src/state/store.ts` | Multi-game registry, active game, autosave | game, db |
| `src/state/mastery.ts` | Per-technique mastery state machine | state/types |
| `src/coach/types.ts` | **Frozen contracts.** Lesson, Hint, CandidateReview | engine, state |
| `src/coach/lessons/{en,it}.json` | Authored lesson library — reviewed like code | — |
| `src/coach/coach.ts` | Disclosure ladder, hint rendering, teachable triggers | techniques, lessons |
| `src/coach/candidates.ts` | Pencil-mark diff against true candidates | board |
| `src/coach/roles.ts` | What each cell of a pattern is doing — hinge, arms, corners | engine |
| `src/state/profile.ts` | Profile store: locale, settings, mastery. Write-through | db, mastery |
| `src/i18n/` | Flat dotted dictionary, `t()`, and the locale React context | state/types |
| `src/ui/` | Presentational components: grid, keypad, game list, coach panel | engine, state, i18n |
| `src/app/` | The assembled app: screens, and the hooks that bind them to the layers below | everything |
| `src/app/LandingView.tsx` | The front door: the thesis, and today's puzzle to try it on | engine, i18n |
| `src/app/dailyPuzzle.ts` | The day's seed. One puzzle a day, the same for everyone, stored nowhere | — |
| `src/legal/` | The privacy policy and terms, authored per locale. Read like lesson copy | — |
| `src/sync/plan.ts` | **Every sync decision**, as a pure function. No I/O | — |
| `src/sync/drive.ts` | Google Drive, confined to `appDataFolder`. Five REST calls | — |
| `src/sync/token.ts` | Incremental consent for `drive.appdata`; silent re-issue | — |
| `src/sync/engine.ts` | One sync: read both sides, execute the plan, write the manifest | plan, drive, db |
| `src/sync/store.ts` | The switch, the status, the time. Serialises runs | engine, token, account |
| `src/App.tsx` | Shell: hydration order, theme, locale, which screen is showing | app, state |

**The three `types.ts` files are frozen interfaces.** Parallel work streams build
against them. Changing one is a coordinated change: raise it rather than editing
locally, and say so in the PR body — `PlayerProfile.settings` has been widened
that way several times (#60, #73, #107, #108).

### The four gaps that were open, and why they stay as they are

Issue #25 collected these when the state layer was young and they were cheap to
change. **One fact has since decided three of them: `Game` is a sync payload.**
Every stored game is serialised to `game-<id>.json` in a player's Drive, so a
change to its shape now needs a Dexie migration *and* a remote-format migration
*and* a merge rule, where it used to need an edit.

1. **`completedAt: number | null` is indexed, and IndexedDB cannot index
   `null`.** In-progress games are therefore *absent* from that index rather
   than sorted first: `where('completedAt').above(0)` is an exact "finished
   games" query, while `orderBy('completedAt')` silently drops every unfinished
   game. A sentinel `0` would remove the trap at the cost of a less honest type.
   **Kept as it is** — the trap is documented in `db.ts`, pinned by a test, and
   no caller can reach it: `listSummaries` orders by `updatedAt`. Rewriting
   every stored and synced game to defuse a trap nothing walks into is the
   worse trade.
2. **`Move.at` is the wall clock and the batch identity.** A batch is the
   trailing run of moves sharing one `at`, with the reducer forcing each action
   strictly past the last recorded move so two actions in the same millisecond
   cannot merge into one undo step. Implicit, but enforced and tested. **Kept**
   — an explicit `batch` field would rewrite every persisted and synced `Move`.
3. **`MoveBatch` has no persisted role.** It does have a role: `topBatch`
   returns it and the undo and redo paths consume it. It is an in-memory view
   of the flat `Move[]`, which is a real job and not a stored one. **Kept.**
4. **`mastery.ts` transitions take an explicit `at`** where the original spec
   listed two arguments. That is the reducer's determinism rule applied to pure
   functions — no `Date.now()` inside one — and this document, not the spec, is
   the binding reference. **No gap.**

The pattern worth carrying: a contract is cheap to change until something
outside the process depends on its bytes. These stopped being cheap the day
sync shipped, and nothing has needed them to change since.

### Inside `src/app/`

| Path | Responsibility |
| --- | --- |
| `LibraryView.tsx` | The resting screen: games in progress, finished games, the way in to Learn |
| `GameView.tsx` | The board, keypad, coach panel, and every dialog that belongs to a game |
| `LearnView.tsx` | The rules, the coach's contract, and a page per technique rendered from the lesson library |
| `NewGameSheet.tsx` | Difficulty choice, "let the coach choose", generation progress |
| `SettingsSheet.tsx` | Language, theme, conflict flagging, haptics |
| `OfflineNotice.tsx` | Says once when the precache makes offline play real, and once after an update |
| `serviceWorker.ts` | Registers the worker, checks for a new build on resume, marks that one took over |
| `ExerciseView.tsx` | The practice grid: the question, the board it is asked on, and the way out |
| `exerciseSession.ts` | The rules of one exercise, as a pure reducer around the game reducer |
| `useCoachSession.ts` | The ladder, the note check, teachable nudges, and mastery credit |
| `useGenerator.ts` | One worker per mounted app, aborted when nobody is waiting |

**Two routes, and no more.** `/` is the landing page, `/play` is the app;
`src/app/useRoute.ts` is forty lines of `pushState` and `popstate` rather than
a router dependency, because the question has two possible answers. Inside
`/play`, which screen shows is still derived from the store's `activeGameId`
plus two pieces of shell state.

**There are no per-game URLs**, and that is the original no-router note
surviving intact rather than being overruled: a URL for a board would only
mean something on the device holding that game. What changed is that a
landing page has to be linkable, shareable and indexable, and a page reachable
only by pressing something inside the app is none of those. `vercel.json`
already rewrites every path to `index.html`, so the addresses work on a cold
load; the installed app's `start_url` is `/play`, since whoever installed it
has already read the front door.

## Key invariants

1. **User candidates are user-owned.** The engine computes true candidates on
   demand for checking. It never silently edits a player's pencil marks. Every
   mark change is a `Move` the player caused or explicitly requested.

   `settings.autoClearDeadNotes` is the "explicitly requested" branch, and it
   is off by default. With it on, a placement that kills notes is followed by
   a `clearStaleCandidates` **as its own move**, so one undo restores the
   notes and leaves the digit — what the app did on the player's behalf stays
   visible and separately reversible. It is dispatched from the placement
   handler, never from an effect watching the board: an effect would fire
   again on the render after an undo restored the notes, and sweep them back
   out before the player saw them.

   It does not run behind a placement that duplicates a peer. Such a placement
   is a typo far more often than it is a move, and sweeping the notes it kills
   costs the player work they then have to notice in time to undo. The test is
   the *fact* of the conflict, never `settings.highlightConflicts`: turning a
   colour off changes what the player sees, not what the app does for them.
   Entries that are wrong but break no rule are still swept — the engine could
   catch those from the solution, but notes surviving a placement would then be
   a visible tell that the digit is wrong, which is invariant 2 leaking out
   through a side effect instead of through text.
2. **The solution string never leaves the engine.** It exists to verify
   uniqueness and to detect contradictions. It is never read to produce hint
   text, and never serialized to the coach in full (spec §5.6).
3. **A finding's eliminations are sound.** Property test: applying any finding's
   eliminations never removes the true solution's digit from a cell (R6).
3b. **The engine reads placed digits, and the player says what is spent.**
   `createCoach` builds its board from values alone — never from pencil marks,
   because a hint built on a wrong mark is a wrong hint. The cost is that a
   player who has worked a pattern in their notes has changed nothing the
   detector can see, so the same finding comes back. `nextFinding(skip)` is
   the answer: the player sets a finding aside ("show me another") and the
   catalog walks on. The set is cleared whenever the board changes, since a
   placement rewrites what the catalog sees.

   The note check has the same root and the opposite symptom. "Missing" used
   to mean "a basic true candidate the player has not noted", which reported
   every elimination a technique had earned as an oversight.
   `eliminableCandidates` (`src/coach/candidates.ts`) now runs the catalog to
   a fixed point and stays silent about any digit a technique proves
   impossible. **Eliminations only, never placements** — applying a naked
   single there would narrow other cells by way of an answer the player has
   not been given, and a cell narrowed to one candidate is one "missing"
   report away from being handed its digit.

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

   `settings.markDeadNotes` turns the *flag* off, and when it is off nothing
   offers to act on it either — not the strike-through, not the keypad's amber
   key, not the coach panel's eraser. A control that clears something the
   board never marked has no visible referent. The colour settings beside it
   (`highlightMatches`, `highlightPeers`, `colorEntries`) work the same way:
   each takes away a layer of colour and nothing else, and none of them can
   take away a signal that is the *only* one carrying a fact — a player entry
   keeps its lighter weight with `colorEntries` off, which is what survives
   greyscale anyway. The coach's spotlight has no switch: it is not
   decoration, it is the hint pointing.
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
9b. **The celebration is transform-only.** The solved board turns each cell
    over — `rotateX`, top over bottom, along the wave rather than across it —
    and leaves it in the board's own match green, `--color-match-wash`
    (`.cell-win` in `src/index.css`, driven by `SudokuGrid`'s `celebrate`).
    There is no separate win colour: a celebration in a colour the player has
    never seen is a new thing to learn at the moment they have finished
    learning, and the match green already means "these belong together". It animates `transform` and
    `background-color` and nothing else, so invariant 9 holds through it —
    the board's box is the same box before, during and after. The delay falls
    with the row and is scattered within it by a hash of the cell index, so
    the board reads as a shower rather than as columns switching on in turn;
    the hash rather than a random number, because the same board has to
    animate the same way twice. `animation-fill-mode: both` is what makes the
    reduced-motion rule degrade honestly: the animation collapses to 0.01ms
    and the board simply *is* green.

9c. **The commentary scrolls; the board does not.** At `laptop` and above both
    asides are their own scrollers — `overflow-y-auto` with
    `overscroll-contain`, capped off the viewport, `sticky` so they stay with
    a page that scrolls under them (`COLUMN_SCROLL` in
    `src/app/GameLayout.tsx`). A long hint or a long lesson therefore scrolls
    inside its column instead of growing the page, and a flick that runs out
    of column does not carry on into the page. The page still scrolls when
    the board and keypad genuinely do not fit — a 40rem board plus its keypad
    is taller than a 720px laptop — because clipping *that* would hide the
    controls rather than the commentary. `sticky` keeps the columns in flow,
    so invariant 9's canary still sees them.

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
    Neither screen caps its own page width any more: at 96rem a large monitor
    was a third empty on the two screens with the most to put there, and the
    cap that protects reading is this one, not that one. The narrow pane grows
    with the tier instead — 20rem, 24rem from 1536 — written as the `2xl`
    breakpoint rather than as a prop, so it stays the tier's business and
    cannot be handed a wrong value. The game screen keeps its 96rem cap for
    the opposite reason: a board that grew with the monitor would be a metre
    of sudoku.
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

12. **The coach's panel is a view, and the sheet is a viewport.** Closing the
    mobile sheet hides the panel and consumes the nudge; it does not clear what
    the panel was showing. The bug it replaces existed only on a phone, because
    only there is the sheet the panel — the wide-screen layout has always kept
    its state and nobody noticed the coupling.

    A note-check report is produced once and **aged**, never re-run
    automatically: `trackReview` (`src/coach/reviewProgress.ts`) walks the
    issues the report already names and marks each fixed, still open, or gone.
    The guarantee is that **no issue ever appears that the report did not
    contain** — a new one would require a check the player did not ask for. It
    is not that the list only ever shrinks: `trackReview` is a pure function of
    the live board, so an undo restores a retired issue and un-noting a digit
    moves a row from `fixed` back to `open`. Both are safe, because a restored
    board restores the report's proof along with it. The player can also re-run
    the check whenever they like, and `coach.marksNothingLeft` invites it.

    `missing` is the reason the report carries the board's values with it. It
    means "possible **and** unrefuted by any technique", and that second half
    came from `eliminableCandidates`' fixed point — over the **whole board**. A
    placement can unlock a new elimination, at which point cheap revalidation
    would keep advising a mark that is now provably impossible, and nothing
    downstream would catch it, because `invalid` sees only basic elimination.
    So a `missing` issue retires the moment **any** cell changes value. A
    neighbourhood check is not enough and was the bug: `xWing`, `xyWing`,
    `simpleColoring` and the rest conclude from cells far outside the target's
    twenty peers, so a correct placement across the grid can refute a mark
    whose own neighbourhood is unchanged. The price is that a report survives
    only note edits — one placement retires every `missing` issue in it — and
    that is the case it was built for. `invalid` rests on basic elimination
    alone and is revalidated exactly.

    A report that found **nothing** has no issues to age, so it carries the
    marks as well: `stale` is what stops "your notes are exactly right" from
    outliving the notes it was about.

    And the coach declines to teach a board where some cell has no digit left
    that fits, gated on the dead end rather than on the rewind phase — the
    phase outlives the dead end, and a repaired board deserves its hint. The
    refusal is enforced where the hint is produced, not only where the button
    is drawn: the `h` shortcut and "Show me another" are both withheld, because
    either would record a disclosure and charge mastery for advice the panel is
    declining to give, and a hint already on screen is cleared. The note check
    stays offered: it reads the player's own marks, so an unfinishable board
    cannot make it wrong.

    A review does not survive a game switch, a locale switch or a reload
    (`src/app/useCoachSession.ts` resets it on the first two; nothing persists
    it past the third). It is a reading of one board in one sitting.

13. **`updatedAt` means the player changed the board, and only that.** It is
    what newest-wins sync compares, so it must track play — not screen time,
    not app behaviour. `pause` (`src/state/game.ts`) stamps it because putting
    a game down is something the player did. `idle` folds the running stretch
    into `elapsedMs` and stops the clock exactly as `pause` does, but
    deliberately does **not** stamp: nobody touched the board, so the game
    must not re-date itself, nor climb the library's ordering, while its
    player is out of the room. The same reasoning restores the last game at
    startup stopped rather than resumed — `hydrate` calls `openGame(id,
    { resume: false })` — because the app opening a game on launch is the app
    deciding, not the player playing it.

    **The page lifecycle is app behaviour, so it uses the silent verbs too.**
    `visibilitychange -> hidden` and `pagehide` call `suspend`, which stops the
    clock with `idle` and flushes; there is no foreground half at all. A tab
    regaining visibility means the app is on screen, not that anyone is
    playing — a screen unlock, an app switch and a glance at a notification
    all fire it — so restarting the clock there would run it for an empty
    room, and stamping there would hand a stale copy the next newest-wins
    sync. Autosave follows the same rule: `write` persists
    `reduce(game, { type: 'idle' })`, so no write can fold its own timestamp
    into `updatedAt` and none can persist one older than the last. The only
    things that restart a clock are opening a game from the library, pressing
    Resume, and the first move after a silent stop.

    A deliberate pause and a silently stopped clock are different things, and
    the UI keys on the difference rather than on `runningSince`. `GameView`
    tracks `playerPaused` as its own local flag: the blurred board and the
    blocking Resume panel appear only when the player chose to put the game
    down, never for an idle timeout or a startup restore, or every two
    minutes of thought and every cold launch would demand a tap before
    reading the board. A `dispatchMove` funnel resumes the clock — dispatching
    `resume`, which does stamp — on the first player move after any silent
    stop, so play picks back up the instant it's used and the pause/idle
    distinction never leaks into what the reducer does with a real move.

    The converse holds because nothing outside the player restarts a clock: a
    `playerPaused` board is always a stopped board. That is what makes a local
    flag safe here. When the lifecycle still resumed on `-> visible`, a paused
    game came back from a tab switch with its timer counting behind its own
    blurred board and Resume panel, and the idle timeout — disarmed while
    paused — could not stop it. Removing the foreground resume is what makes
    that state unreachable rather than merely unlikely.

    **Sync results reach the UI through the sync store, never through the
    engine.** `src/sync/engine.ts` imports only `db` and shared types — no
    store, by design, so one sync run stays a pure read-execute-write cycle
    that a test can call without a React tree. `SyncOutcome` carries
    `downloadedIds` and `droppedLocalIds`, collected inside the engine's loops
    at the point each id's work actually succeeds, not copied from the
    `SyncPlan` that only proposed it: the download loop skips an id the manifest
    names but whose file isn't in the folder, and the outcome must say what
    happened, not what was intended. `src/sync/store.ts` reads that outcome and holds two sets,
    `changed` and `announced`, and asks the game store to `refreshSummaries`
    and re-read any downloaded game still open. `changed` takes the outcome's
    departures out in the same step it puts its arrivals in — a game deleted
    from another device must not be announced as having arrived, since the
    deletion has already been applied and there is no row left to reconcile
    the claim against — and a game the player is *in* counts as seen: the one
    restored at launch, and the one they leave, both clear their own dot. Both sets are **session-only,
    never persisted and never written into a `Game`.** A per-game "arrived
    from sync" flag would itself sync to the other device, where it describes
    a screen nobody there was looking at — it is a fact about this session,
    not about the game.

    **The residual risk this shifts but does not close, recorded rather than
    solved:** play on the phone at 10:00, then at 11:00 deliberately open the
    same game on a laptop holding yesterday's board. The laptop stamps 11:00
    on an open the player genuinely chose, wins the next sync on newest-wins,
    and the hour of play on the phone is gone. Startup-restores-stopped
    removes the variant where nobody chose anything; it does not touch the
    one where someone did. Paolo was shown this trade and took it knowingly —
    it is written here so the next reader finds a decision, not an oversight.

14. **An exercise is not a game, and nothing it does is kept.** A practice
    grid is generated, worked and thrown away. It writes no Dexie row, no
    store entry, no mastery credit, no sync payload and no coach log that
    outlives the screen — a reload ends it, which is what "on the fly" means.
    `LiveGame` is used as the board because the reducer already knows how to
    undo, and that is the whole of the exercise's involvement with `state/`;
    `App` holds it beside `learning` rather than inside it, so leaving an
    exercise reveals the lesson it was started from instead of rebuilding a
    screen the player never left.

    Mastery in particular is deliberate rather than overlooked. The mastery
    model reads "applied unaided" off a board the player chose to play, and a
    drill that hands over the position, the marks and the name of the pattern
    is not that evidence. Counting it would inflate the one number the coach
    uses to decide what to teach next.

    Every filled cell of the position is a **given**. The position is the
    premise of the question, and a player who could edit the cells the pattern
    rests on would be drilling a board that no longer contains it.

## Learn exercises

A practice grid is a board frozen at the moment one technique is the way
forward, with the candidates already written in, and a question attached:
point at the cells playing each role, then do what the pattern proves. It is
reached from a technique's lesson page ("practise this") or from the index as
the **mixed** exercise, where naming the technique is itself the first
question.

**The marks are the solve path's candidates, not the board's.** This is the
decision the whole feature rests on and it is not the obvious one. Taking the
values at that step and pencilling in `Board.trueCandidates` does not work:
basic candidates are a *superset* of what a solver has proved by the time a
hard technique fires, so the pattern usually is not there at all — an XY-Wing
needs bivalue cells, and a cell only becomes bivalue once something took the
third digit off it — and where it survives, a naked single elsewhere is
available too, which makes the position a drill in spotting a single. Measured
over 12 generated puzzles per technique, judging positions that way found the
technique in **0 of 12 for nine of the fourteen**, against solve paths that had
genuinely used them. So an exercise carries the `CandidateGrid`'s own state.
Every mark missing from it was removed by a proof, so the position is sound
and it is the one a player reaches by working the puzzle honestly.

The cost is that **the coach cannot re-derive the step**: `createCoach` builds
from values alone (invariant 3b) and would be looking at basic candidates
again. It does not need to. The finding is known, and `renderHint` is a pure
function of a finding, so an exercise carries its own step and asks the coach
to explain that one. The ladder, the four rungs and the refusal to name a
digit are `CoachPanel` and `renderHint` unchanged — an exercise asks the coach
exactly what a game asks it.

**A position may be shared with an easier technique.** `exclusive` marks the
position where the solver itself reached for the technique, which is the
better drill, but for `claiming`, `hidden_triple`, `naked_quad`, `swordfish`
and `remote_pairs` that position was measured at 0 in 12: they are real
patterns that something cheaper always beats to the board. Refusing to drill
five of fourteen techniques is the worse trade, so the search falls back to a
position where the pattern is merely present and the screen says so.

**Feedback is judged against the step, never against the solution.** A refused
elimination is refused because *this pattern does not prove it* — something
the position can back up — where "that digit is impossible" would be a claim
about the solution, which invariant 2 does not allow an exercise to make. The
reducer returns a code and the screen turns it into a sentence, so no rule
here holds a locale.

**The mixed exercise must not answer itself.** `session.finding` is set the
moment the grid is built, so the technique is known to the screen while
naming it is still the question. Reading it straight put the name in the
heading over "which technique moves this board on?", and its lesson in the
column beside it. The technique is therefore derived as *null until the
naming stage is past* — the one piece of state on this screen that is
deliberately harder to read than it needs to be.

**The offer to practise sits at the bottom of the content pane, and
practises whatever that pane is about.** So the mixed exercise ends Learn's
intro and a technique's ends its lesson, never both at once. It hung off the
technique index too at first, which on a wide screen put "mixed practice" in
the left column level with "practise this technique" in the right: two
near-identical buttons side by side meaning different things. The nav is for
navigating.

**The prompt lives in the screen's header, not in the panel.** On a phone the
panel is a sheet the player opens — `GameView`'s pattern, and invariant 9's
sanctioned answer to a narrow screen — and the one line saying what to do
cannot be behind a button. The header's message box is a fixed two lines at
every tier so that a refusal appearing and going never changes the board's
box.

## Developer tools

Two entries appear in the game menu for a signed-in account named in
`VITE_DEV_ALLOWLIST` (UIDs and/or emails, comma-separated, read at build
time). The list is public in the bundle on purpose: it is not a credential,
it grants nothing to anyone not signed in as that account, and neither tool
does anything a player could not do to their own board. An **empty list means
nobody** — the only reading that is safe when a variable goes missing from a
deploy.

- **Preview the win** plays the celebration on the board as it stands. It
  writes nothing: no completion, no mastery credit, no recap, nothing to
  sync. A view state rather than a move, which is why it is a preview and not
  a "solve the board" — that one would have needed a flag on `Game` plus a
  rule in each of those four places to describe a puzzle nobody played.
- **Download diagnostics** writes the report from `src/app/diagnostics.ts` to
  a file, for reading later and beside other reports. The sheet is still
  there for pasting one into a message now.

## Drive sync

Optional, off until switched on, and **never in the way of a game**. Play does
not wait for the network and a failure is a line in Settings, never a dialog.

- **Scope `drive.appdata` and nothing else.** The token cannot reach a
  player's own files. Sign-in does not request it: consent for sync is
  incremental, asked once when the switch is turned on, so a player who only
  wanted their settings to follow them is never shown a Drive prompt.
- **The remote is a manifest, a profile and one file per game.** One file per
  game so a sync costs what changed rather than what exists, and so a file
  that arrives corrupt costs one puzzle.
- **`index.json` is written last.** It is what the next sync reads to decide
  what moved. Written first, a crash halfway leaves it claiming games that
  were never uploaded and the next sync believes it. Written last, the same
  crash leaves it merely behind, and the next sync re-uploads — idempotent,
  and it costs bytes rather than a board.
- **Newest wins, per whole game**, by `updatedAt`. Not per cell and not per
  move: the later save replaces the earlier record entirely. It can never
  invent a board neither device had. The cost — the other version is gone —
  is written on screen in Settings rather than left to be discovered.
- **Deletions are dated and compete on the same terms.** A deletion writes a
  tombstone locally whether or not anyone is signed in; without one, a game
  deleted on a phone is indistinguishable from one the laptop has not yet
  sent, and comes back on every sync forever. A play *newer* than the
  tombstone legitimately outranks it, and the spent tombstone is dropped
  rather than kept to re-delete the resurrected game. Tombstones are pruned
  past `TOMBSTONE_TTL_MS`, which bounds the table at the stated cost that a
  device silent for longer than that can resurrect a game.
- **`PlayerProfile` stays frozen.** It has no timestamp and newest-wins needs
  one, so the stamp lives in the `sync` singleton next to it, written in the
  same transaction as the profile.
- **The access token is never in a store.** The app can write a diagnostic
  report of its own state and invites players to paste it into a bug report;
  a bearer token for someone's Drive must not be reachable from there.

Sync needs `VITE_GOOGLE_CLIENT_ID` alongside the Firebase config. A build
without it has no sync — not a broken switch, a feature that build does not
have, the same rule sign-in follows.

## Schema changes are a hazard, not a chore

An IndexedDB upgrade cannot run while another connection holds the old version
open, and a blocked `open()` **never settles** — no timeout, no rejection. That
took the app down to a blank page on 2026-09-03: both stores' `hydrate()` waited
forever, `hydrated` stayed false, and the shell rendered its loading
placeholder with every saved game apparently gone.

Two things make it worse than it sounds, and both are counter-intuitive:

- **An awake Dexie connection yields on its own** — its default `versionchange`
  handler closes it so the upgrade proceeds. A **frozen background window runs
  no JavaScript at all**, so it yields nothing. An installed PWA sitting in the
  background is exactly that window, and it is the common case rather than the
  exotic one.
- Which means a test that holds the old version *with Dexie* proves nothing,
  because Dexie lets go. The test in `db.test.ts` holds it with raw IndexedDB
  for that reason, and the first version of it passed for the wrong reason.

`observeBlocking(db)` now closes this connection on `versionchange` so it can
never be the obstruction, and being blocked is a state the shell renders —
which window is in the way, that nothing has been lost, and a reload. Before
adding a `SchemaVersion`, read that code rather than this paragraph.

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
