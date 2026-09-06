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

## 1 — `updatedAt` must mean "the board changed"

### The bug this fixes is data loss, and it is on production now

`store.ts`'s `write` persists through `saveGame(toStored(reduce(game, { type: 'pause', at })))`,
and the reducer's `pause` case stamps `updatedAt: at`. So every write of a *running* game re-dates
it, whatever happened to the board. The paths that do this include `openGame` (via `parkActive`,
and again via its own `resume` plus the scheduled autosave), `closeGame`, `suspend`, `wake`,
`flush` after a bare clock tick, `evict`, and `hydrate` — which resumes the last game at startup.

**Merely opening a game to look at it makes it newer than every other copy of it.**

Against newest-wins-per-whole-game, that is silent data loss:

1. Play on the phone at 10:00.
2. At 11:00, open the laptop — which holds yesterday's board — and touch nothing.
3. The laptop re-dates its stale record to 11:00 and wins the next sync.
4. The hour of play on the phone is gone, and nothing anywhere said so.

The reducer already holds the correct instinct and states it. From the `tick` case:

> Not a player action, so it leaves `updatedAt` — and therefore the game list's ordering — alone.

`pause` and `resume` are not player actions either. They are clock bookkeeping, and they are the
only reason `write` re-dates anything.

### The change

`pause` and `resume` stop writing `updatedAt`. Everything that genuinely changes the record keeps
it: every board move (through `commit`, which already no-ops on an empty batch), `undo`, `redo`,
and `setCoachLog`.

Nothing else changes. The clock still runs, still folds into `elapsedMs`, and is still persisted —
`suspend`'s comment about a player banking five minutes of thought stays true, because the write
still happens. What stops is that write claiming the board moved.

### What this costs, stated plainly

- **Elapsed time alone no longer wins a sync.** Sit on one device for an hour without placing a
  digit, and that hour will lose to a device that placed one digit. Newest-wins is per whole game,
  so the clock rides along with the board rather than competing with it. Losing minutes of clock is
  a far smaller harm than losing moves, and it is the direction the current bug gets wrong.
- **The library stops re-ordering when you open a game.** Rows are ordered by `updatedAt`, so today
  merely opening a game floats it to the top. After this it moves when you *play*. The row's own
  copy already calls this "last played", so the label becomes true rather than aspirational.

Both are behaviour changes a player can notice. They are the point, not side effects.

### It needs a test it never had

There is currently no test asserting that `pause` bumps `updatedAt` — the behaviour is unpinned,
which is why it survived. The new tests pin the opposite, and one of them is the scenario above,
written as a two-device sequence against the real planner.

## 2 — The outcome carries ids, not just counts

`SyncPlan` already holds `upload`, `download`, `dropLocal`, `dropRemote` as sorted `readonly
string[]`, and the engine calls `.length` on them. `SyncOutcome` gains the id arrays alongside the
counts.

**Collected inside the loops, not copied from the plan.** Both the download loop and the
`dropLocal` loop `continue` past ids that turn out not to be actionable — a manifest ahead of the
folder, most obviously. The outcome must say what was *applied*, because the UI is about to tell a
player something happened to those games, and a plan is an intention.

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

## This wants to be two changes, not one

Section 1 is a **bug fix for silent data loss that is live right now**. Sections 2-5 are a feature.
They are described together because the feature is unsafe without the fix, but they should not ship
together: the fix is small, it is testable on its own, and every day it waits is a day a player can
lose a game by opening it on the wrong device.

Recommended: section 1 lands as its own change, immediately. Sections 2-5 follow as the feature,
built on it. The implementation plan should be written for the second only once the first is in.

## Testing

- The reducer: `pause` and `resume` leave `updatedAt` alone; a move still stamps it. Mutation: put
  the stamp back and watch the two-device test fail.
- **The data-loss scenario end to end**, against the real planner: device A plays, device B opens
  the stale copy without playing, sync, and A's board must survive. This is the test the whole of
  change 1 exists for, and it must be watched fail first.
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

- `src/state/game.ts` — `pause`/`resume` stop stamping `updatedAt`
- `src/sync/engine.ts` — `SyncOutcome` carries applied ids
- `src/sync/store.ts` — keeps the outcome, holds `changed`, drives the read-back
- `src/state/store.ts` — an action to re-read named games from Dexie
- `src/app/SyncToast.tsx` — new, `SyncNotice`'s twin
- `src/ui/game/GameList.tsx` — the per-row dot and its accessible name
- `src/app/LibraryView.tsx` — the header sync control
- `src/app/OfflineNotice.tsx` — the resume check and the post-update notice
- `src/i18n/en.ts`, `src/i18n/it.ts` — new strings; Italian to #65
- `docs/architecture.md` — what `updatedAt` means, and why sync is visible now
