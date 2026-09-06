# Sync you can see, and a clock that stops lying about it

Design, 2026-09-06. Paolo reported that sync "works but only when I press the button", that a synced
change needs a page reload to appear, and that nothing tells him anything arrived.

Two of those are true. The first is not, and the investigation turned up something worse than any
of them.

## What is actually there

- **Triggering is already rich.** `src/App.tsx` syncs on page load, on sign-in, on the network
  becoming stable (5s debounce), on the network being lost, on the tab being hidden (after a
  flush), and on the tab becoming visible. Plus two buttons in Settings. There is no interval, and
  the visibility trigger largely covers the same ground more cheaply.
- **Nothing reads back.** `syncOnce` writes downloaded games straight to Dexie via `saveGame`. Both
  Zustand stores hydrate once at boot and never re-read: there is no `liveQuery`, no
  `dexie-react-hooks`, no subscription of any kind. `refreshSummaries` exists and its only caller
  in the whole app is `closeGame`. **That is the whole of the "needs a refresh" bug.**
- **The outcome is thrown away.** `SyncOutcome` already carries `uploaded`, `downloaded`,
  `removedLocal`, `removedRemote` and `profile`. `src/sync/store.ts` reads `outcome.at` and
  discards the rest on the next line.
- **Nothing renders a success.** `SyncNotice` covers `consent` and `error` only.

## 1 — What "active" means, and when a game is not

### Paolo's framing, and what it replaces

The first draft of this section proposed changing what `updatedAt` means — `pause` and `resume`
would stop stamping it. **That is rejected.** `updatedAt` keeps its current semantics. The question
worth answering instead is the one underneath: when is a game actually being played, and when is it
merely on screen?

Today the app has no answer. `openGame` resumes, `hydrate` auto-opens and resumes the last game at
startup, `wake` resumes on tab visibility, and a game left open with nobody touching it counts time
forever. "Active" is currently a synonym for "rendered".

### The model

**Opening a game starts its clock**, exactly as R5 says today. That rule stands.

**A game with no interaction for `DEFAULT_STUCK_MS` (2 minutes) goes idle** — the clock folds into
`elapsedMs` and stops. Any board interaction starts it again. The threshold is the coach's own
stall constant, reused rather than invented: that module already defines 2 minutes as "long enough
that it is not a pause for thought", which is exactly the judgement being made here.

**Backgrounding still pauses**, as `suspend` already does, and coming back to the board resumes it.

### Idling is not pausing, and must not stamp

These two requirements collide, and the collision is the whole reason this section is subtle.
`pause` stamps `updatedAt`. If an idle timeout dispatched `pause`, a game sitting untouched would
re-date itself on a timer — inventing exactly the phantom activity the model exists to eliminate,
and doing it while the player is out of the room.

So idling gets **its own action**:

```ts
| { type: 'idle'; at: number }
```

It folds the running stretch into `elapsedMs` and clears `runningSince`, and it leaves `updatedAt`
alone. That is precisely what `tick` already does, minus the part where the clock keeps running,
and `tick`'s comment already states the principle: *not a player action, so it leaves `updatedAt` —
and therefore the game list's ordering — alone.*

`pause` is untouched, keeps stamping, and keeps meaning "the player put this down".

### Where the timer lives

In the app layer, not in `state/`. Architecture invariant 6 says `state/` never imports `coach/`,
and `DEFAULT_STUCK_MS` lives in `src/coach/triggers.ts`. `GameView` already knows every interaction
the player makes and already holds this kind of timer; it dispatches `idle` and nothing in `state/`
learns about the coach.

The timer is reset by the same events that count as activity, and cleared on unmount — this app
cares specifically about timers that outlive what created them.

### Startup restores the last game paused

One narrow addition, offered as inside Paolo's rule rather than against it. `hydrate` currently
auto-opens the last unfinished game, which resumes it and stamps `updatedAt` **with no player
action whatsoever** — the app decided, not the person.

A player opening a game is activity. The app restoring one on launch is not. So startup restores
the board paused, and the player's first interaction starts the clock. Opening a game *by choice*
still starts it immediately, so R5 is untouched for every deliberate open.

### The residual risk, recorded rather than solved

With `updatedAt` semantics unchanged, this remains true and is accepted:

> Play on the phone at 10:00. At 11:00 open the same game on the laptop, which holds yesterday's
> board, and deliberately open it. The laptop stamps 11:00, wins the next sync, and the hour of
> play on the phone is gone.

Startup-restores-paused removes the variant where nobody chose anything. A deliberate open on a
stale device still loses the newer board. Paolo was shown this trade and took it; it is written
here so the next reader finds a decision rather than an oversight.

## 2 — The outcome carries ids, not just counts

`SyncPlan` already holds `upload`, `download`, `dropLocal`, `dropRemote` as sorted `readonly
string[]`, and the engine calls `.length` on them. `SyncOutcome` gains the id arrays alongside the
counts.

**Collected inside the loops, not copied from the plan.** The download loop `continue`s past ids
that turn out not to be actionable — a manifest naming a game whose file is not in the folder. The
outcome must say what was *applied*, because the UI is about to tell a player something happened to
those games, and a plan is an intention.

The `dropLocal` loop has no such skip today: `deleteGame` is unconditional and idempotent, so every
planned id is applied. Its ids are collected in the loop anyway, for the same reason and not
because it currently differs — the rule is "report what happened", and a loop that grows a `continue`
later should not silently start lying. The cost is that this half of the rule is unobservable, and
therefore untestable, until it does.

`SyncOutcome` is an internal type; no frozen contract moves.

## 3 — Read-back: the store learns what changed

`src/sync/store.ts` keeps the outcome instead of dropping it, and gains one piece of state:

```ts
/** Games this session has pulled from another device and not yet shown. */
changed: ReadonlySet<string>;
```

Deliberately **not persisted, and never written to a `Game`.** A per-game "arrived from sync" flag
in the record would sync to the other device, where it means nothing — it is a fact about this
session's screen, not about the game.

After a sync that applied anything, the sync store asks the game store to catch up:

- `refreshSummaries()` — the library list, which is otherwise a boot-time snapshot;
- for any downloaded id that is currently loaded in `games`, re-read it from Dexie and replace the
  in-memory copy.

That second half is safe **only because of change 1**. Today the in-memory copy would be re-stamped
by the next write and would clobber the download; once `updatedAt` tracks the board, a genuinely
newer remote wins and a locally-played board stays because it really is newer. This is why the
root-cause fix comes first and is not optional.

The active game is not special-cased. Paolo's call: fix the re-stamp and let newest-wins decide.

`changed` is cleared for one game when the player opens it, and at no other time. "Leaving the
library" was the first draft's rule and it is wrong: a player who glances at the list, switches to
another app and comes back would find the marks gone without ever having looked at what moved. A
mark earns its removal by being acted on.

It is session state, so a reload clears it wholesale — which is honest, because after a reload
every board on screen came from disk and none of it is news.

## 4 — Three surfaces, each where interrupting is cheapest

The three are mutually exclusive by where the player is, which is what keeps them from stacking up.
`App.tsx` already renders `OfflineNotice` only when there is no active game; the toast is its
opposite — mounted only while a game is open — and the library's dot and header control exist only
on the library. A player never sees two of these at once.

**In a game: a toast.** `SyncNotice`'s twin, and its precedent — same fixed overlay, same
pointer-transparency, same dismissal. It says what arrived ("2 games updated"), and unlike
`SyncNotice` it times out, because it is news rather than a condition. Shown only when a sync
actually changed something; a no-op sync stays silent, which is the spec's standing rule that sync
never gets in the way of a game.

**In the library: a dot per row.** A row in `GameList` is one full-width `<button>`, so the badge
cannot be interactive and must not steal the row's accessible name. It goes in the metadata line
that already reads `12:04 · yesterday` — an existing `flex items-center gap-2` row, so no layout
surgery — and it is `aria-hidden`, with the row's `aria-label` gaining a clause instead. A dot
that only sighted players can see is not a signal.

`GameList` takes the ids as a prop rather than reading a store: it is a presentational component
today and stays one.

**In the library header: the sync control, when sync is on.** Paolo asked for it out of Settings
and able to animate while running. It joins the existing right-hand cluster beside Learn and
Settings — inside that `div`, not as a third header child, because `LibraryView.test.tsx` asserts
the header has exactly two children and that assertion is protecting the title's half of the row.

It spins while `status === 'syncing'`, and is absent entirely when sync is off or unavailable —
the same rule `SyncSection` already follows. Settings keeps its own controls; this is a shortcut,
not a move.

## 5 — The service worker checks on resume

`registerType: 'autoUpdate'` with `registerSW({ immediate: true })` means the browser checks for a
new worker on navigation and nowhere else. An installed PWA that is resumed rather than navigated
can sit on an old build indefinitely.

`registerSW` gains `onRegisteredSW`, which hands back the registration; a `visibilitychange`
listener calls `registration.update()` when the tab becomes visible. Cheap, and it is the same
moment sync already uses.

**And the reload gets a sentence.** `autoUpdate` takes the new worker over and reloads by itself,
which today happens silently. Paolo asked for a message afterwards. Detecting it needs a mark set
before the reload and read after:

- a `controllerchange` listener sets a `sessionStorage` flag — guarded on there having *been* a
  previous controller, because the same event fires on first install;
- on boot, if the flag is set, show the notice and clear it.

`offline.updateAvailable` already exists in both locales, written for a prompt that was never
wired. Its wording is for a prompt ("Reload to use it"), so it is **rewritten** for what actually
happens rather than left to imply a button that does not exist.

## Staging

Section 1 is a behaviour change to the clock; sections 2-5 are the sync surfaces. They are
independent — nothing in the surfaces depends on the activity model, and vice versa — so they can
land as two changes in either order. One plan can cover both, with section 1 first because it is
the smaller and touches the reducer everything else reads.

## Testing

- The reducer: `idle` folds the clock and stops it **without** moving `updatedAt`; `pause` still
  stamps. Mutation: make `idle` stamp, and watch the ordering test fail.
- The idle timer: no interaction for the threshold stops the clock; an interaction before it does
  not; an interaction after it starts the clock again. The timer is cleared on unmount.
- Startup restores the last game paused, and its `updatedAt` is unchanged by the restore. Mutation:
  resume on restore, and watch it move.
- The engine: applied ids, including that an id skipped by the `continue` does not appear.
- The sync store: `changed` after a download; empty after a no-op sync; the game store asked to
  refresh exactly once.
- `GameList`: the dot renders for a given id and reaches the row's accessible name.
- `LibraryView`: the header keeps two children with the sync button present.
- The service-worker notice is the one claim that cannot be tested in vitest — there is no service
  worker in jsdom, and the e2e build has one. **Say so rather than writing a test whose subject is
  absent**; assert what can be asserted (the flag-reading branch renders the notice) and leave the
  registration itself to the e2e PWA spec.

## Files

- `src/state/game.ts` — the `idle` action, which stops the clock without stamping
- `src/state/store.ts` — `hydrate` restores the last game paused
- `src/app/GameView.tsx` — the idle timer, reset by interaction
- `src/sync/engine.ts` — `SyncOutcome` carries applied ids
- `src/sync/store.ts` — keeps the outcome, holds `changed`, drives the read-back
- `src/state/store.ts` — an action to re-read named games from Dexie
- `src/app/SyncToast.tsx` — new, `SyncNotice`'s twin
- `src/ui/game/GameList.tsx` — the per-row dot and its accessible name
- `src/app/LibraryView.tsx` — the header sync control
- `src/app/OfflineNotice.tsx` — the resume check and the post-update notice
- `src/i18n/en.ts`, `src/i18n/it.ts` — new strings; Italian to #65
- `docs/architecture.md` — what `updatedAt` means, and why sync is visible now
