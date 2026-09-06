// Must come first: Dexie captures the global `indexedDB` when it is imported.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, loadGame, SudokuCoachDB } from './db';
import type { Game } from './types';
import {
  createGameStore, disposeLifecycleHooks, installLifecycleHooks, MAX_LOADED_GAMES,
} from './store';
import type { GameStoreApi } from './store';

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const PUZZLE_INPUT = { givens: PUZZLE, solution: SOLVED, difficulty: 'medium' } as const;

/** The app's own store installs page hooks at import; keep them off these tests. */
disposeLifecycleHooks();

let counter = 0;
let clock = 0;
let conn: SudokuCoachDB;
let store: GameStoreApi;
let disposers: (() => void)[] = [];

const now = (): number => clock;

/** Debounces long enough that only an explicit flush can persist anything. */
const NEVER = 10_000_000;

const makeStore = (autosaveMs = NEVER, clockAutosaveMs = NEVER): GameStoreApi =>
  createGameStore({ conn, now, autosaveMs, clockAutosaveMs });

beforeEach(() => {
  clock = 1000;
  conn = new SudokuCoachDB(`${DB_NAME}-store-${counter++}`);
  store = makeStore();
});

afterEach(async () => {
  for (const dispose of disposers) dispose();
  disposers = [];
  setVisibility('visible');
  vi.useRealTimers();
  await conn.delete();
});

const setVisibility = (state: 'hidden' | 'visible'): void => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

/** What a mobile OS does when the player swipes the app away. */
const setHidden = (hidden: boolean): void => {
  setVisibility(hidden ? 'hidden' : 'visible');
  document.dispatchEvent(new Event('visibilitychange'));
};

const stored = async (id: string): Promise<Game> => {
  const game = await loadGame(id, conn);
  if (game === undefined) throw new Error(`expected ${id} in the database`);
  return game;
};

describe('starting and opening games', () => {
  it('writes a new game before it becomes the active one', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    expect(store.getState().activeGameId).toBe(id);
    expect((await stored(id)).givens).toBe(PUZZLE);
  });

  it('starts the clock of the game the player is looking at, and only that one', async () => {
    const first = await store.getState().startGame(PUZZLE_INPUT);
    clock += 5000;
    const second = await store.getState().startGame(PUZZLE_INPUT);

    // Switching parked the outgoing game: five seconds banked, clock stopped.
    const parked = await stored(first);
    expect(parked.elapsedMs).toBe(5000);
    expect(parked.runningSince).toBeNull();

    clock += 3000;
    await store.getState().suspend();
    expect((await stored(first)).elapsedMs).toBe(5000);
    expect((await stored(second)).elapsedMs).toBe(3000);
  });

  it('carries the board, the marks and both stacks across a switch', async () => {
    const first = await store.getState().startGame(PUZZLE_INPUT);
    store.getState().dispatch({ type: 'fillCandidates' });
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    store.getState().dispatch({ type: 'setValue', cell: 3, digit: 6 });
    store.getState().dispatch({ type: 'undo' });
    const before = store.getState().activeGame();

    await store.getState().startGame(PUZZLE_INPUT);
    await store.getState().openGame(first);
    const after = store.getState().activeGame();

    expect(after?.cells).toEqual(before?.cells);
    expect(after?.undoStack).toEqual(before?.undoStack);
    expect(after?.redoStack).toEqual(before?.redoStack);
    expect(store.getState().dispatch).toBeTypeOf('function');
  });

  it('ignores a request to open the game already open', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    const before = store.getState().activeGame();
    await store.getState().openGame(id);
    expect(store.getState().activeGame()).toBe(before);
  });

  it('refuses to open a game that is not there', async () => {
    await expect(store.getState().openGame('ghost')).rejects.toThrow(/no stored game/);
  });

  it('forgets a deleted game everywhere', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    await store.getState().refreshSummaries();
    await store.getState().removeGame(id);
    expect(store.getState().activeGameId).toBeNull();
    expect(store.getState().activeGame()).toBeNull();
    expect(store.getState().games).toEqual({});
    expect(store.getState().summaries).toEqual([]);
    expect(await loadGame(id, conn)).toBeUndefined();
  });
});

describe('surviving a kill (R5)', () => {
  /** Plays a real session: marks, placements, an undo and a redo. */
  const play = (): void => {
    store.getState().dispatch({ type: 'fillCandidates' });
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    store.getState().dispatch({ type: 'toggleCandidate', cell: 5, digit: 9 });
    store.getState().dispatch({ type: 'setValue', cell: 3, digit: 6 });
    store.getState().dispatch({ type: 'undo' });
  };

  it('comes back identical — board, marks, undo and redo — after a suspend', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    play();
    clock += 12_000;
    const before = store.getState().activeGame();
    await store.getState().suspend();

    // A cold start: new store, same database.
    const reopened = makeStore();
    await reopened.getState().hydrate();
    const after = reopened.getState().activeGame();

    expect(after?.id).toBe(id);
    expect(after?.cells).toEqual(before?.cells);
    expect(after?.undoStack).toEqual(before?.undoStack);
    expect(after?.redoStack).toEqual(before?.redoStack);
    expect(after?.elapsedMs).toBe(12_000);
    // The record was stored paused, and `hydrate`'s own restore no longer
    // resumes it — that is the app reopening the game the player left, not
    // the player choosing to play it (see the `hydrate` test below).
    expect(after?.runningSince).toBeNull();
    expect(reopened.getState().hydrated).toBe(true);
  });

  it('flushes when the app is backgrounded, without waiting for the debounce', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    disposers.push(installLifecycleHooks(store));
    play();
    expect((await stored(id)).undoStack).toEqual([]);

    setHidden(true);
    await vi.waitFor(async () => {
      expect((await stored(id)).undoStack.length).toBeGreaterThan(0);
    });
    const parked = await stored(id);
    expect(parked.runningSince).toBeNull();
    expect(parked.cells[2].value).toBe(4);
    expect(parked.redoStack).toHaveLength(1);
  });

  // Rewritten from "stops the clock while hidden and restarts it on return".
  // The old rule mapped `visibilitychange` straight onto the player-action
  // verbs, so a tab regaining visibility restarted the clock and stamped
  // `updatedAt` — a screen unlock re-dating a game nobody played, which under
  // newest-wins overwrites real play from another device. Returning is no
  // longer an act of play; the first move is (invariant 13).
  it('stops the clock while hidden, and leaves it stopped and undated on return', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    const played = store.getState().activeGame()?.updatedAt;
    disposers.push(installLifecycleHooks(store));
    clock += 4000;

    setHidden(true);
    await vi.waitFor(async () => {
      expect((await stored(id)).elapsedMs).toBe(4000);
    });
    // Backgrounding banks the time without claiming the player did anything.
    expect((await stored(id)).updatedAt).toBe(played);

    clock += 600_000; // the player left the app open in another tab all day
    setHidden(false);
    expect(store.getState().activeGame()?.elapsedMs).toBe(4000);
    expect(store.getState().activeGame()?.runningSince).toBeNull();
    expect(store.getState().activeGame()?.updatedAt).toBe(played);

    // ...and the next real move is what starts it again. `GameView`'s
    // `dispatchMove` is the funnel that issues this `resume`; the point here
    // is that the clock the store handed back is one a move can restart.
    store.getState().dispatch({ type: 'resume' });
    expect(store.getState().activeGame()?.runningSince).toBe(clock);
  });

  it('banks thinking time even when nothing else changed since the last save', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    play();
    await store.getState().flush();
    expect((await stored(id)).elapsedMs).toBe(0);

    clock += 300_000; // five minutes staring at the grid, not a single tap
    await store.getState().suspend();
    expect((await stored(id)).elapsedMs).toBe(300_000);
  });

  it('flushes on pagehide, the last event a discarded tab sees', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    disposers.push(installLifecycleHooks(store));
    play();

    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () => {
      expect((await stored(id)).cells[2].value).toBe(4);
    });
  });

  it('stops listening once disposed', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    const dispose = installLifecycleHooks(store);
    dispose();
    play();

    window.dispatchEvent(new Event('pagehide'));
    setHidden(true);
    await Promise.resolve();
    expect((await stored(id)).undoStack).toEqual([]);
  });
});

describe('closing a game', () => {
  it('parks the game on the way out: clock stopped, record written', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    clock += 7000;

    await store.getState().closeGame();

    expect(store.getState().activeGameId).toBeNull();
    const parked = await stored(id);
    expect(parked.runningSince).toBeNull();
    expect(parked.elapsedMs).toBe(7000);
    expect(parked.cells[2].value).toBe(4);
  });

  it('refreshes the summaries so the row shows what was just played', async () => {
    await store.getState().startGame(PUZZLE_INPUT);
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });

    await store.getState().closeGame();

    expect(store.getState().summaries[0].progress).toBeGreaterThan(0);
  });

  it('does nothing when there is no active game', async () => {
    await expect(store.getState().closeGame()).resolves.toBeUndefined();
    expect(store.getState().activeGameId).toBeNull();
  });
});

describe('autosave', () => {
  it('coalesces a burst of moves into a single debounced write', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const debounced = makeStore(50, 5000);
    const id = await debounced.getState().startGame(PUZZLE_INPUT);
    const writes = vi.spyOn(conn.games, 'put');

    for (const cell of [2, 3, 5, 7]) {
      debounced.getState().dispatch({ type: 'setValue', cell, digit: 4 });
    }
    expect(writes).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);
    expect(writes).toHaveBeenCalledTimes(1);
    expect((await stored(id)).cells[7].value).toBe(4);
  });

  it('puts clock ticks on a lazier schedule than player moves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const debounced = makeStore(50, 5000);
    const id = await debounced.getState().startGame(PUZZLE_INPUT);

    clock += 1000;
    debounced.getState().dispatch({ type: 'tick' });
    await vi.advanceTimersByTimeAsync(100);
    expect((await stored(id)).elapsedMs).toBe(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect((await stored(id)).elapsedMs).toBe(1000);
  });

  it('lets an urgent write overtake a pending lazy one', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const debounced = makeStore(50, 5000);
    const id = await debounced.getState().startGame(PUZZLE_INPUT);

    debounced.getState().dispatch({ type: 'tick' });
    debounced.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    await vi.advanceTimersByTimeAsync(60);
    expect((await stored(id)).cells[2].value).toBe(4);
  });

  it('writes a running game out without re-dating it, and never backwards', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    const played = store.getState().activeGame()?.updatedAt;

    // Five minutes of thought with the clock still running, then an autosave.
    // The write freezes the record's clock — but freezing it with `pause`
    // stamped `updatedAt` with the *write's* own timestamp, folding screen
    // time into the field newest-wins sync compares.
    clock += 300_000;
    await store.getState().flush();
    expect((await stored(id)).elapsedMs).toBe(300_000);
    expect((await stored(id)).updatedAt).toBe(played);

    // And once the clock is genuinely stopped, `pause` became a no-op and the
    // next write persisted the older in-memory value — so the stored
    // timestamp went backwards. Both writes now agree.
    await store.getState().suspend();
    clock += 60_000;
    // Leaving for the library writes it out a second time, an hour of wall
    // clock later, with the game's own clock already stopped.
    await store.getState().closeGame();
    expect((await stored(id)).updatedAt).toBe(played);
  });

  it('does not dirty the record for a move that changes nothing', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    await store.getState().flush();
    const before = store.getState().activeGame();

    const writes = vi.spyOn(conn.games, 'put');
    // Cell 0 is a given (R2).
    store.getState().dispatch({ type: 'setValue', cell: 0, digit: 9 });
    expect(store.getState().activeGame()).toBe(before);

    await store.getState().flush();
    expect(writes).not.toHaveBeenCalled();
    expect((await stored(id)).undoStack).toEqual([]);
  });

  // The `wake()` call this test also made is gone with `wake` itself: there
  // is no foreground half of the lifecycle any more, so there is no
  // no-active-game path through it left to assert.
  it('does nothing when there is no active game', () => {
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    expect(store.getState().activeGameId).toBeNull();
    expect(store.getState().games).toEqual({});
  });
});

describe('lazy loading', () => {
  it('keeps only summaries for the game list', async () => {
    await store.getState().startGame(PUZZLE_INPUT);
    store.getState().dispatch({ type: 'fillCandidates' });
    await store.getState().flush();
    await store.getState().refreshSummaries();

    const [summary] = store.getState().summaries;
    expect(summary.moves).toBeGreaterThan(0);
    expect(Object.keys(summary)).not.toContain('undoStack');
    expect(Object.keys(summary)).not.toContain('cells');
  });

  it('holds a bounded number of full games in memory', async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_LOADED_GAMES + 2; i++) {
      ids.push(await store.getState().startGame(PUZZLE_INPUT));
      clock += 1000;
    }
    const loaded = Object.keys(store.getState().games);
    expect(loaded.length).toBeLessThanOrEqual(MAX_LOADED_GAMES);
    expect(loaded).toContain(store.getState().activeGameId);
    // Everything evicted is still on disk, and reopens intact.
    for (const id of ids) expect((await stored(id)).givens).toBe(PUZZLE);
    await store.getState().openGame(ids[0]);
    expect(store.getState().activeGame()?.id).toBe(ids[0]);
  });

  // Renamed from "resumes the last unfinished game and leaves finished ones
  // closed": with only a finished game on disk there is no unfinished one to
  // reopen, so this test only ever exercised the second half of that claim.
  // The first half — restoring the last unfinished game — has its own test
  // below, and restoring no longer means resuming it (see the design
  // correction to this task).
  it('leaves a finished game closed, with nothing unfinished to reopen', async () => {
    const finished = await store.getState().startGame(PUZZLE_INPUT);
    await store.getState().flush();
    await conn.games.update(finished, { completedAt: 1234, updatedAt: 9_000_000 });

    const reopened = makeStore();
    await reopened.getState().hydrate();
    expect(reopened.getState().summaries.map((s) => s.id)).toEqual([finished]);
    expect(reopened.getState().activeGameId).toBeNull();
  });

  it('restores the last unfinished game stopped, without touching its updatedAt', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    store.getState().dispatch({ type: 'setValue', cell: 2, digit: 4 });
    clock += 5000;
    await store.getState().suspend();
    const before = await stored(id);

    // The clock has to move between the write and the relaunch, or the
    // `updatedAt` assertion below is vacuous: a stamp taken at the same
    // `deps.now()` as the stored one is the same number, and the test passes
    // whether the code stamps or not. Ten minutes on the shelf makes any
    // stamp land on a value `before.updatedAt` cannot be.
    clock += 600_000;

    // A cold start: new store, same database — the app relaunching, not the
    // player choosing to open this game.
    const reopened = makeStore();
    await reopened.getState().hydrate();
    const after = reopened.getState().activeGame();

    expect(after?.id).toBe(id);
    // The app decided to reopen this game; the player did not, so there is
    // no clock to start and no `updatedAt` to stamp. `openGame`'s own
    // `resume: false` is what `hydrate` passes to get here.
    expect(after?.runningSince).toBeNull();
    expect(after?.updatedAt).toBe(before.updatedAt);
  });

  it('can list games without opening any of them', async () => {
    await store.getState().startGame(PUZZLE_INPUT);
    await store.getState().suspend();

    const reopened = makeStore();
    await reopened.getState().hydrate({ resumeLast: false });
    expect(reopened.getState().summaries).toHaveLength(1);
    expect(reopened.getState().games).toEqual({});
    expect(reopened.getState().activeGameId).toBeNull();
  });
});

describe('catching up after a sync (refreshGames)', () => {
  it('replaces a loaded game with what is now on disk', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    await store.getState().flush();
    // Stands in for what `syncOnce` does: write a downloaded copy straight to
    // Dexie, bypassing the store entirely. Stored games are always paused
    // (see the header), so a genuine downloaded record has `runningSince: null`.
    await conn.games.update(id, { updatedAt: 9_000_000, elapsedMs: 42_000, runningSince: null });

    await store.getState().refreshGames([id]);

    const game = store.getState().games[id];
    expect(game?.updatedAt).toBe(9_000_000);
    expect(game?.elapsedMs).toBe(42_000);
  });

  it('replaces the active game too — not special-cased', async () => {
    // Documents the trade named in the design: the active game can be
    // mid-move when a background sync lands, and this action does not check
    // for that. Newest-wins is left to decide, per the accepted risk.
    const id = await store.getState().startGame(PUZZLE_INPUT);
    expect(store.getState().activeGame()?.runningSince).not.toBeNull();
    await conn.games.update(id, { runningSince: null, elapsedMs: 7000 });

    await store.getState().refreshGames([id]);

    expect(store.getState().activeGameId).toBe(id);
    expect(store.getState().activeGame()?.runningSince).toBeNull();
    expect(store.getState().activeGame()?.elapsedMs).toBe(7000);
  });

  it('leaves an id nobody has open alone — nothing to refresh, nothing loaded', async () => {
    // Evict the first game out of `games` by opening past the cap, the same
    // way the "bounded number of full games" test does — closeGame does not
    // unload, only eviction does.
    const id = await store.getState().startGame(PUZZLE_INPUT);
    for (let i = 0; i < MAX_LOADED_GAMES; i++) await store.getState().startGame(PUZZLE_INPUT);
    expect(store.getState().games[id]).toBeUndefined();

    await store.getState().refreshGames([id]);

    expect(store.getState().games[id]).toBeUndefined();
  });

  it('does nothing for an id that vanished from storage in the interim', async () => {
    const id = await store.getState().startGame(PUZZLE_INPUT);
    const before = store.getState().games[id];
    await conn.games.delete(id);

    await expect(store.getState().refreshGames([id])).resolves.toBeUndefined();
    expect(store.getState().games[id]).toBe(before);
  });
});
