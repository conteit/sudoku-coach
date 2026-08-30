/**
 * Multi-game registry, active game and autosave (spec §5.2 state/store, R5).
 *
 * R5 is one sentence — kill the app mid-game, reopen it, get the same game back
 * including the undo history — and it is entirely a question of *when* state
 * reaches IndexedDB. Three decisions carry it.
 *
 * 1. **Debounce, then flush on the way out.** Every mutation schedules a write
 *    ~1s later so a burst of pencil marks is one put, not thirty. That alone
 *    loses the last second of play on a hard kill, so `installLifecycleHooks`
 *    also flushes on `visibilitychange -> hidden` and on `pagehide`. On mobile
 *    those are the last events an app reliably sees: a backgrounded tab can be
 *    discarded without ever firing `beforeunload`, which is why that event is
 *    not used here.
 * 2. **A stored game is always a paused game.** Writes freeze the clock —
 *    `elapsedMs` folded up to the moment of the write, `runningSince: null`. If
 *    a running `runningSince` were persisted, a crash at 9pm reopened at 9am
 *    would credit the player with eleven hours of thinking. Resuming is an
 *    explicit act, performed when a game is opened.
 * 3. **Only the active game's clock runs.** Switching games pauses the outgoing
 *    one and persists it — board, marks, both stacks and the clock — before the
 *    incoming one is loaded.
 *
 * Loading is lazy in both directions: the game list holds `GameSummary`
 * projections, and at most `MAX_LOADED_GAMES` full games (undo stacks and all)
 * stay in memory, least-recently-opened evicted first after being written out.
 */

import { create } from 'zustand';
import type { StateCreator, StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { GameSummary, SudokuCoachDB } from './db';
import { db, deleteGame, listSummaries, loadGame, saveGame } from './db';
import type { GameAction, NewGameInput } from './game';
import { newGame, reduce, toLive, toStored } from './game';
import type { LiveGame } from './types';

/** Debounce for player actions: long enough to coalesce a burst of taps. */
export const AUTOSAVE_MS = 1000;
/**
 * Debounce for clock ticks. A tick changes nothing a player would miss, so it
 * rides a much lazier schedule: writing once a second to keep a timer honest
 * would be the app's single busiest source of disk I/O.
 */
export const CLOCK_AUTOSAVE_MS = 15_000;
/** Full games kept in memory. Bounded so a long session cannot grow forever. */
export const MAX_LOADED_GAMES = 4;

/** Actions as the UI issues them: the store stamps the time (R4 determinism). */
type WithoutAt<T> = T extends unknown ? Omit<T, 'at'> : never;
export type UiAction = WithoutAt<GameAction>;

export interface StoreDeps {
  conn: SudokuCoachDB;
  now: () => number;
  autosaveMs: number;
  clockAutosaveMs: number;
}

export interface GameStore {
  activeGameId: string | null;
  /** Fully loaded games, keyed by id. Bounded by `MAX_LOADED_GAMES`. */
  games: Record<string, LiveGame>;
  /** Lightweight list projections, most recently played first. */
  summaries: GameSummary[];
  hydrated: boolean;

  activeGame: () => LiveGame | null;
  /** Reads the game list and, unless told otherwise, reopens the last game. */
  hydrate: (options?: { resumeLast?: boolean }) => Promise<void>;
  refreshSummaries: () => Promise<void>;
  startGame: (input: Omit<NewGameInput, 'at'>) => Promise<string>;
  openGame: (id: string) => Promise<void>;
  removeGame: (id: string) => Promise<void>;
  dispatch: (action: UiAction) => void;
  /** Backgrounded: stop the clock and get everything on disk. */
  suspend: () => Promise<void>;
  /** Foregrounded: restart the active game's clock. */
  wake: () => void;
  /** Writes every pending change now. Awaitable, unlike the debounce. */
  flush: () => Promise<void>;
}

export type GameStoreApi = StoreApi<GameStore>;

const defaultDeps = (): StoreDeps => ({
  conn: db,
  now: () => Date.now(),
  autosaveMs: AUTOSAVE_MS,
  clockAutosaveMs: CLOCK_AUTOSAVE_MS,
});

interface Pending {
  delay: number;
  handle: ReturnType<typeof setTimeout>;
}

function gameStore(deps: StoreDeps): StateCreator<GameStore> {
  return (set, get) => {
    const timers = new Map<string, Pending>();
    const dirty = new Set<string>();
    /** Least-recently-opened first; the eviction order. */
    let opened: string[] = [];

    const cancel = (id: string): void => {
      const pending = timers.get(id);
      if (pending === undefined) return;
      clearTimeout(pending.handle);
      timers.delete(id);
    };

    /**
     * Persists one game with its clock frozen (see the header). The live game
     * keeps running; only the record is paused.
     */
    const write = async (id: string): Promise<void> => {
      cancel(id);
      dirty.delete(id);
      const game = get().games[id];
      if (game === undefined) return;
      const at = deps.now();
      await saveGame(toStored(reduce(game, { type: 'pause', at })), deps.conn);
    };

    /** First-wins debounce; an urgent request overtakes a lazy one. */
    const schedule = (id: string, delay: number): void => {
      dirty.add(id);
      const pending = timers.get(id);
      if (pending !== undefined) {
        if (pending.delay <= delay) return;
        clearTimeout(pending.handle);
      }
      timers.set(id, {
        delay,
        handle: setTimeout(() => {
          void write(id);
        }, delay),
      });
    };

    const flush = async (): Promise<void> => {
      await Promise.all([...dirty].map(write));
    };

    const touch = (id: string): void => {
      opened = [...opened.filter((x) => x !== id), id];
    };

    /** Writes out and drops the games past the cap. Never the active one. */
    const evict = async (): Promise<void> => {
      const active = get().activeGameId;
      const excess = opened.length - MAX_LOADED_GAMES;
      if (excess <= 0) return;
      const victims = opened.filter((id) => id !== active).slice(0, excess);
      if (victims.length === 0) return;
      opened = opened.filter((id) => !victims.includes(id));
      await Promise.all(victims.map(write));
      set((state) => {
        const games = { ...state.games };
        for (const id of victims) delete games[id];
        return { games };
      });
    };

    const apply = (id: string, action: GameAction): LiveGame | null => {
      const game = get().games[id];
      if (game === undefined) return null;
      const next = reduce(game, action);
      // A no-op action (a tap on a given cell) must not dirty the record.
      if (next === game) return game;
      set((state) => ({ games: { ...state.games, [id]: next } }));
      return next;
    };

    /** Stops the outgoing game's clock and gets it on disk before we move on. */
    const parkActive = async (): Promise<void> => {
      const id = get().activeGameId;
      if (id === null) return;
      apply(id, { type: 'pause', at: deps.now() });
      await write(id);
    };

    return {
      activeGameId: null,
      games: {},
      summaries: [],
      hydrated: false,

      activeGame: () => {
        const { activeGameId, games } = get();
        return activeGameId === null ? null : (games[activeGameId] ?? null);
      },

      refreshSummaries: async () => {
        set({ summaries: await listSummaries(deps.now(), deps.conn) });
      },

      hydrate: async (options) => {
        const summaries = await listSummaries(deps.now(), deps.conn);
        set({ summaries, hydrated: true });
        if (options?.resumeLast === false) return;
        // `summaries` is newest-first, so this is the game the player left.
        const last = summaries.find((s) => s.completedAt === null);
        if (last !== undefined) await get().openGame(last.id);
      },

      startGame: async (input) => {
        const game = newGame({ ...input, at: deps.now() });
        // Written before it becomes active: a crash between the two leaves a
        // playable game in the list rather than nothing at all.
        await saveGame(toStored(game), deps.conn);
        set((state) => ({ games: { ...state.games, [game.id]: game } }));
        await get().openGame(game.id);
        return game.id;
      },

      openGame: async (id) => {
        if (get().activeGameId === id) return;
        await parkActive();
        if (get().games[id] === undefined) {
          const stored = await loadGame(id, deps.conn);
          if (stored === undefined) throw new Error(`no stored game ${id}`);
          set((state) => ({ games: { ...state.games, [id]: toLive(stored) } }));
        }
        set({ activeGameId: id });
        touch(id);
        await evict();
        // Records are stored paused; opening one is what starts its clock (R5).
        apply(id, { type: 'resume', at: deps.now() });
        schedule(id, deps.clockAutosaveMs);
      },

      removeGame: async (id) => {
        cancel(id);
        dirty.delete(id);
        opened = opened.filter((x) => x !== id);
        await deleteGame(id, deps.conn);
        set((state) => {
          const games = { ...state.games };
          delete games[id];
          return {
            games,
            activeGameId: state.activeGameId === id ? null : state.activeGameId,
            summaries: state.summaries.filter((s) => s.id !== id),
          };
        });
      },

      dispatch: (action) => {
        const id = get().activeGameId;
        if (id === null) return;
        const before = get().games[id];
        // The union is reconstructed with the store's timestamp; `WithoutAt`
        // erased the discriminant's sibling, not the discriminant itself.
        const next = apply(id, { ...action, at: deps.now() } as GameAction);
        if (next === null || next === before) return;
        schedule(id, action.type === 'tick' ? deps.clockAutosaveMs : deps.autosaveMs);
      },

      suspend: async () => {
        const id = get().activeGameId;
        if (id !== null) {
          apply(id, { type: 'pause', at: deps.now() });
          // Always written, dirty or not: a player who spent five minutes
          // staring at the grid since the last autosave has banked five minutes
          // of clock and nothing else, and that is still theirs to keep.
          dirty.add(id);
        }
        await flush();
      },

      wake: () => {
        const id = get().activeGameId;
        if (id === null) return;
        if (apply(id, { type: 'resume', at: deps.now() }) !== null) {
          schedule(id, deps.clockAutosaveMs);
        }
      },

      flush,
    };
  };
}

/** A store wired to explicit dependencies. Tests use this; the app uses `useGameStore`. */
export const createGameStore = (deps: Partial<StoreDeps> = {}): GameStoreApi =>
  createStore<GameStore>(gameStore({ ...defaultDeps(), ...deps }));

/**
 * Page lifecycle wiring. `visibilitychange -> hidden` is the reliable "the
 * player just left" signal on mobile; `pagehide` covers navigation away and
 * bfcache. Both call `suspend`, which is idempotent, so firing both is fine.
 * Returns a disposer — leaving listeners on a dead store is how a long-lived
 * page accumulates work it can never finish.
 */
export function installLifecycleHooks(store: GameStoreApi): () => void {
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') void store.getState().suspend();
    else store.getState().wake();
  };
  const onPageHide = (): void => {
    void store.getState().suspend();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}

/** The app's store. */
export const useGameStore = create<GameStore>()(gameStore(defaultDeps()));

/**
 * Installed at import rather than from a component: R5 is not something that
 * should depend on remembering to mount a hook.
 */
export const disposeLifecycleHooks = installLifecycleHooks(useGameStore);
