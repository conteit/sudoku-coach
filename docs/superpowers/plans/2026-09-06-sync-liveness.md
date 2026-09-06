# Sync Liveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A game stops counting time it is not being played, and a sync that changes something says so — in the game, in the library, and without a page reload.

**Architecture:** Two independent halves. The activity model adds one reducer action and one timer. The sync surfaces widen an internal outcome type to carry ids, keep it in the sync store instead of dropping it, and drive a read-back plus three UI surfaces.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Zustand, Dexie, vitest + @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-sync-liveness-design.md` — read it before Task 1. Section 1's "Idling is not pausing" is the reasoning the first two tasks rest on.

## Global Constraints

- **`npm run verify`** = lint → `tsc -b` → vitest → build. Never weaken a config to make it pass.
- **`npm run e2e` is NOT part of `verify` and has caught a break `verify` structurally cannot** — an i18n key removed out from under a Playwright assertion. **Any task that removes or renames an i18n key must run `npm run e2e` before committing.**
- **Run the mutation on every new test.** Break the thing it covers, watch it fail, restore, watch it pass. If a mutation cannot fail, the test is wrong — fix the test and say so. Several mutations in previous plans here turned out unprovable as written; reporting that is the job.
- **Every new i18n key in BOTH `src/i18n/en.ts` and `src/i18n/it.ts`.** `src/i18n/i18n.test.ts` enforces key and placeholder parity.
- **Architecture invariant 6: `state/` never imports `coach/`.** The idle threshold lives in `src/coach/triggers.ts`, so the timer lives in the app layer.
- **Architecture invariant 9: nothing appearing or disappearing during play may resize the board.** The sync toast is an overlay, like `SyncNotice`.
- **`src/state/types.ts` and `src/coach/types.ts` are frozen contracts.** Nothing here edits them. `SyncOutcome` in `src/sync/engine.ts` is internal and may change.
- **Sync is best-effort and silent** (`src/sync/store.ts` header): a failure is a state, never a dialog, and nothing in a game ever waits on it.
- **The Drive access token must never enter a store.** It lives in a module-local in `src/sync/store.ts`.
- Timers must be cleared on unmount. This project cares specifically about unbounded timers.
- Comments explain *why*, not *what*. Commit messages explain reasoning, not files, and end with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
```

---

## Stage A — the activity model

### Task 1: The `idle` action

**Files:** Modify `src/state/game.ts`; test `src/state/game.test.ts`.

**Produces:** `{ type: 'idle'; at: number }` on `GameAction`. Task 2 dispatches it.

- [ ] **Step 1: Write the failing tests.** Append to `src/state/game.test.ts`, using its existing `start(over)` and `run(game, ...actions)` helpers:

```ts
describe('idle', () => {
  it('folds the running stretch and stops the clock', () => {
    const idled = reduce(start({ running: true }), { type: 'idle', at: 4000 });
    expect([idled.elapsedMs, idled.runningSince]).toEqual([3000, null]);
  });

  it('leaves updatedAt alone, because nobody did anything', () => {
    // The whole point. `pause` means the player put the game down and stamps
    // accordingly; going idle means they did not touch it, and a game must not
    // re-date itself — nor climb the library's ordering — while its player is
    // out of the room.
    const idled = reduce(start({ running: true }), { type: 'idle', at: 4000 });
    expect(idled.updatedAt).toBe(1000);
  });

  it('is a no-op on a game that is already stopped', () => {
    const paused = reduce(start({ running: false }), { type: 'idle', at: 4000 });
    expect(paused).toBe(reduce(paused, { type: 'idle', at: 9000 }));
  });

  it('still stamps updatedAt when the player pauses deliberately', () => {
    const paused = reduce(start({ running: true }), { type: 'pause', at: 4000 });
    expect(paused.updatedAt).toBe(4000);
  });
});
```

- [ ] **Step 2: Run and watch them fail.** `npx vitest run src/state/game.test.ts > /tmp/t1.log 2>&1; tail -20 /tmp/t1.log` — expect a type error on `'idle'`.

- [ ] **Step 3: Implement.** Add to the `GameAction` union in `src/state/game.ts`, immediately after the `pause` member, with this comment:

```ts
  /**
   * The player has not touched this game for long enough that the clock is
   * measuring absence rather than thought. Folds the running stretch into
   * `elapsedMs` and stops.
   *
   * Deliberately NOT `pause`. `pause` means the player put the game down, and
   * stamps `updatedAt` to say so. Going idle is the opposite — nobody did
   * anything — so it leaves `updatedAt`, and therefore the game list's
   * ordering, alone. `tick` already draws exactly this distinction and gives
   * exactly this reason; this is the same rule for the moment the clock stops
   * rather than the moment it folds.
   */
  | { type: 'idle'; at: number }
```

and the reducer case, beside `tick` and `pause`:

```ts
    case 'idle':
      return game.runningSince === null
        ? game
        : { ...game, elapsedMs: elapsedAt(game, action.at), runningSince: null };
```

- [ ] **Step 4: Run and watch them pass.** Same command.

- [ ] **Step 5: Mutate.** Add `updatedAt: action.at` to the `idle` case → expect FAIL on "leaves updatedAt alone". Restore. Then change the guard to always fold → expect FAIL on "is a no-op on a game that is already stopped". Restore.

- [ ] **Step 6: Commit.**

```
feat(state): a game that nobody is touching stops counting, without re-dating

The clock ran for as long as a game was on screen, so a board left while the
player made coffee banked the coffee. Going idle now folds the running stretch
and stops it.

Deliberately not `pause`. `pause` means the player put the game down and
stamps updatedAt to say so; idling means they did nothing at all, and a game
must not re-date itself — nor climb the library's ordering — while its player
is out of the room. `tick` already draws that distinction for the same reason.
```

---

### Task 2: The idle timer, and a startup that does not claim you played

**Files:** Modify `src/app/GameView.tsx`, `src/state/store.ts`; test `src/app/GameView.idle.test.tsx` (create), `src/state/store.test.ts`.

**Consumes:** the `idle` action (Task 1), `DEFAULT_STUCK_MS` from `src/coach/triggers.ts`.

**Why the timer is in the view:** architecture invariant 6 — `state/` must not import `coach/`, and the threshold is the coach's constant. `GameView` may import both.

- [ ] **Step 1: Write the failing tests.** Create `src/app/GameView.idle.test.tsx`, copying the `Host` render helper from `src/app/GameView.promote.test.tsx` (it reads the live game out of the store, which is required — these tests are about what a dispatch does). Use fake timers.

Three claims: no interaction for `DEFAULT_STUCK_MS` stops the clock (`runningSince` becomes null in the store, `elapsedMs` folded); an interaction before the threshold does not; an interaction after it starts the clock again. Read `runningSince` off `useGameStore.getState().games[id]` rather than off the screen — the clock's display is not the subject.

Also add to `src/state/store.test.ts`: hydrate restores the last unfinished game **paused**, and its stored `updatedAt` is unchanged by the restore.

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: The timer.** In `GameView`, add an effect keyed on the game's move count and the paused/solved flags. Reset on every player interaction — the honest key is `game.undoStack.length` plus the selection, because those are what change when the player acts. Dispatch `{ type: 'idle' }` when it expires. Clear the timeout in the effect's cleanup; a timer that outlives the screen is the failure mode this project names explicitly.

Do not dispatch `idle` when the game is already paused, solved, or not running — `apply` returns the same object, but a pointless dispatch still marks the record dirty.

- [ ] **Step 4: Startup restores paused.** In `src/state/store.ts`'s `hydrate`, the last unfinished game is opened with `openGame`, which resumes it. Restore it without resuming: the board is on screen, the clock is stopped, and the player's first interaction starts it (the existing `wake`/interaction path already resumes). Leave a comment saying why — the app restoring a game on launch is the app deciding, not the player, and a resume there stamps `updatedAt` with nobody having done anything.

- [ ] **Step 5: Run, watch pass, mutate.** Remove the cleanup and confirm no test catches it — if none does, add one that unmounts mid-wait and asserts no dispatch lands. Then make `hydrate` resume, and watch the store test fail.

- [ ] **Step 6: `npm run verify`, then commit.**

---

## Stage B — the sync surfaces

### Task 3: The outcome says what it actually applied

**Files:** Modify `src/sync/engine.ts`; test `src/sync/engine.test.ts`.

**Produces:** `SyncOutcome` gains `downloadedIds`, `droppedLocalIds` (both `readonly string[]`). Tasks 4-6 consume them.

**The subtlety:** the download loop and the `dropLocal` loop each `continue` past ids that turn out not to be actionable — a manifest ahead of the folder, most obviously. **Collect inside the loops.** The plan is an intention; the outcome is about to tell a player something happened to those games, so it must report what was applied.

- [ ] **Step 1: Write the failing test** — a remote index naming a game whose file is absent must download nothing and report no id, while a sibling that is present reports its id. That case already exists in the engine's fixtures as the `continue`; this pins it.

- [ ] **Step 2-6:** fail → implement → pass → mutate (populate the ids from `plan.download` instead of the loop, and watch the absent-file test fail) → commit.

**Note:** `src/sync/store.test.ts`'s `beforeEach` mocks a full `SyncOutcome` literal. It must gain the new fields or `tsc` fails.

---

### Task 4: The store keeps what changed, and the app catches up

**Files:** Modify `src/sync/store.ts`, `src/state/store.ts`; test `src/sync/store.test.ts`, `src/state/store.test.ts`.

**Produces:** `SyncStore.changed: ReadonlySet<string>`, `SyncStore.seen(id: string): void`, and a game-store action that re-reads named games from Dexie.

- [ ] **Step 1: Write the failing tests.**
  - After a sync that downloaded ids, `changed` holds them; after a no-op sync it is empty.
  - `seen(id)` removes one id and leaves the others.
  - The game store's new action replaces a loaded game with the stored copy and refreshes summaries.
  - A sync that changed nothing does **not** refresh summaries — the point is to be cheap when nothing moved, which is the property the whole trigger design rests on.

- [ ] **Step 2-4:** In `src/sync/store.ts`'s `run`, keep the outcome instead of dropping it after `outcome.at`. When anything was applied, ask the game store to catch up: refresh summaries, and re-read any downloaded id that is currently loaded.

**Do not import the game store into `src/sync/engine.ts`** — the engine has no store references today and that separation is why it is testable without React. The dependency goes in `sync/store.ts`, which is already the layer that knows about the app.

`changed` is session state: never persisted, never written into a `Game`. A per-game "arrived from sync" flag in the record would sync to the other device, where it is meaningless.

- [ ] **Step 5-6:** mutate (refresh summaries unconditionally, and watch the no-op test fail), verify, commit.

---

### Task 5: A toast, in a game, when something arrived

**Files:** Create `src/app/SyncToast.tsx`; modify `src/App.tsx`, `src/i18n/en.ts`, `src/i18n/it.ts`; test `src/app/SyncToast.test.tsx`.

`src/app/SyncNotice.tsx` is the precedent and the twin — read it first and match its shape: the same fixed overlay classes, the same `pointer-events-none` with a `pointer-events-auto` close button, the same `role="status"`. **The difference is that this one times out**, the way `OfflineNotice` does with its `VISIBLE_MS`, because it is news rather than a condition.

Shown only when a sync actually applied something, and only while a game is open — `App.tsx` already renders `OfflineNotice` when `activeGame === null`, so this is its opposite. Never shown for a sync that moved nothing.

Copy: one line naming what arrived. Add `sync.toast.games` with a `{count}` placeholder, and a singular sibling — this codebase branches on two keys rather than using ICU plurals (`action.clearStaleOne` / `action.clearStaleCount` is the precedent).

- [ ] Failing test → implement → pass → mutate (render it for an empty change set, watch the silence test fail) → verify → commit.

---

### Task 6: The library says which games moved, and offers the sync

**Files:** Modify `src/ui/game/GameList.tsx`, `src/app/LibraryView.tsx`, `src/i18n/*`; test `src/ui/game/GameList.test.tsx`, `src/app/LibraryView.test.tsx`.

**Two constraints, both load-bearing:**

1. **A row is one full-width `<button>`.** A badge inside it cannot be interactive, and the row's `aria-label` (`games.resumeLabel`) is its entire accessible name. So the dot is `aria-hidden` **and** the label gains a clause — a signal only sighted players get is not a signal. It goes in the metadata line that already reads `12:04 · yesterday`, an existing `flex items-center gap-2` row, so no layout surgery.
2. **`src/app/LibraryView.test.tsx` asserts the header has exactly two children** and that Learn and Settings share a parent. The sync control joins **inside** that existing right-hand cluster, not as a third header child. That assertion is protecting the title's half of the row; keep it green.

`GameList` takes the changed ids as a prop. It is presentational today and stays so — it does not read a store.

The header control is present only when sync is on and available, mirroring `SyncSection`'s own gate (`authAvailable() && syncAvailable() && account !== null`), and it spins while `status === 'syncing'`.

- [ ] Failing tests → implement → pass → mutate (drop the `aria-label` clause and watch the accessibility test fail; add a third header child and watch the existing layout test fail, then put it back inside the cluster) → verify → commit.

---

### Task 7: The service worker checks on resume, and says when it reloaded you

**Files:** Modify `src/app/OfflineNotice.tsx`, `src/i18n/en.ts`, `src/i18n/it.ts`; test `src/app/OfflineNotice.test.tsx`.

`registerSW` gains `onRegisteredSW(swUrl, registration)`; a `visibilitychange` listener calls `registration.update()` when the tab becomes visible. Remove the listener on unmount.

**The post-update notice.** `autoUpdate` takes the new worker over and reloads by itself. To say so afterwards, mark it before the reload and read the mark after:

- a `controllerchange` listener sets a `sessionStorage` flag — **guarded on there having been a previous controller**, because the same event fires on first install and would otherwise announce an update to every first-time visitor;
- on mount, if the flag is set, show the notice and clear it.

`offline.updateAvailable` exists in both locales and nothing renders it — it was written for a prompt that was never wired, and its wording ("Reload to use it") promises a button that does not exist. **Rewrite it** for what actually happens. **This renames the meaning of an existing key, so run `npm run e2e` before committing.**

**One claim here cannot be tested in vitest, and that must be said rather than faked:** jsdom has no service worker. Test the flag-reading branch — set the `sessionStorage` mark, mount, assert the notice, assert the mark is cleared — and leave the registration and the real update to `tests/e2e/pwa.spec.ts`. Do not write a test whose subject is absent from the environment; this repo has shipped several and `CLAUDE.md` names the failure.

---

### Task 8: Write it down

**Files:** Modify `docs/architecture.md`; update issue **#22**; add the new Italian keys to **#65**.

Invariant 13, covering: what `updatedAt` means and what `idle` deliberately does not touch; that startup restores a game paused because the app opening one is not the player playing it; that sync results reach the UI through the sync store rather than through the engine, which has no store references by design; and the residual risk the spec records — a deliberate open of a stale copy on a second device still overwrites newer play, accepted knowingly.

- [ ] Read the new invariant back against the code. If they disagree, say which is wrong rather than smoothing it over — on two previous branches this exact check was the one that mattered.

- [ ] `npm run verify` **and** `npm run e2e`, then commit.

**Do not push and do not open a PR from within a task.**
