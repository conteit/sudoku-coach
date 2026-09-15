/**
 * The save point store: one pinned board per game, for the game on screen.
 *
 * A save point is permission to experiment — pin the board, try a line, and
 * get back if it goes nowhere. The rules that follow from that, all of them
 * Paolo's:
 *
 * - **One per game, overwritten.** Not a stack and not named slots. The
 *   feature answers "get me back to where I was", and a list of places you
 *   have been is a different, larger feature.
 * - **A full snapshot, not an index into the move log.** An index is smaller
 *   and it breaks in the ordinary case: undo past the save point, play
 *   differently, and the stack is rewritten under it. That case is not exotic
 *   here — it is precisely the "try, back out, try again" the feature exists
 *   to support.
 * - **Restoring does not spend it.** It stays until deliberately overwritten,
 *   so backing out twice does not require remembering to re-save in between.
 *
 * Written through rather than debounced, for the same reason the profile is: a
 * save point is written once when the player presses a button, not many times
 * a second, and losing one to a crash would defeat the point of having it.
 * Writes are serialized through one promise chain so two rapid saves cannot
 * land out of order.
 *
 * This store holds only the point for the game currently in view. The table
 * holds them all; nothing on screen ever needs more than one, and keeping the
 * library's worth of boards in memory to render a single button would be the
 * wrong trade.
 */

import { create, createStore, type StateCreator, type StoreApi } from 'zustand';
import {
  db,
  deleteSavePoint,
  readSavePoint,
  writeSavePoint,
  type SavePoint,
  type SudokuCoachDB,
} from './db';
import { toStored } from './game';
import type { LiveGame } from './types';

export interface SavePointDeps {
  conn: SudokuCoachDB;
  now: () => number;
}

export interface SavePointStore {
  /** The point for `gameId`, or null when that game has none. */
  point: SavePoint | null;
  /** Which game `point` describes. Null before anything has been watched. */
  gameId: string | null;
  /**
   * Points the store at a game and reads its save point.
   *
   * Idempotent per game *except* when forced: sync can put a newer snapshot
   * under an open game, and the screen has to be able to ask again without
   * pretending the game changed.
   */
  watch: (gameId: string, options?: { reload?: boolean }) => Promise<void>;
  /** Pins the board as it stands, replacing whatever was pinned before. */
  save: (game: LiveGame) => void;
  /** Throws the pin away. Not reached by restoring — that leaves it standing. */
  forget: () => void;
  /** Resolves once every queued write has landed. Tests and page-hide use it. */
  flush: () => Promise<void>;
}

export type SavePointStoreApi = StoreApi<SavePointStore>;

function savePointStore(deps: SavePointDeps): StateCreator<SavePointStore> {
  return (set, get) => {
    let queue: Promise<unknown> = Promise.resolve();
    /*
     * Counts the writes the player has made, so a read can tell whether its
     * answer is still current.
     *
     * Checking the game id is not enough. A read is in flight for the whole
     * of a tick, and pressing Pin during it leaves the id unchanged while
     * making the read's answer — "there is no pin" — older than the truth.
     * Without this the store was overwritten by that stale answer: the write
     * still reached disk, but the screen went back to offering a pin and the
     * pad's key vanished until the game was reopened.
     */
    let writes = 0;

    return {
      point: null,
      gameId: null,

      watch: async (gameId, options) => {
        if (get().gameId === gameId && options?.reload !== true) return;
        // Cleared before the read, not after: the await below is a tick during
        // which the screen would otherwise offer the *previous* game's save
        // point under the new game's board.
        set({ gameId, point: null });
        // A snapshot that cannot be read is the same as not having one, and
        // this must not throw into the render that asked for it: the read can
        // fail for reasons that have nothing to do with the player's board —
        // a private window with IndexedDB switched off, a blocked upgrade, a
        // quota refusal. The cost of swallowing it is one button not being
        // offered; the cost of not swallowing it is an unhandled rejection
        // during play.
        const before = writes;
        const stored = await readSavePoint(gameId, deps.conn).catch(() => undefined);
        // Two ways the answer can be stale by the time it arrives: the game
        // changed under it, or the player wrote a pin while it was reading.
        // Either way the read loses — it is the older fact.
        if (get().gameId !== gameId || writes !== before) return;
        set({ point: stored ?? null });
      },

      save: (game) => {
        writes++;
        const point: SavePoint = {
          id: game.id,
          updatedAt: deps.now(),
          cells: toStored(game).cells,
        };
        set({ gameId: game.id, point });
        queue = queue.then(() => writeSavePoint(point, deps.conn));
      },

      forget: () => {
        const id = get().gameId;
        if (id === null) return;
        writes++;
        set({ point: null });
        queue = queue.then(() => deleteSavePoint(id, deps.conn));
      },

      flush: async () => {
        await queue;
      },
    };
  };
}

/** A store wired to explicit dependencies. Tests use this; the app uses `useSavePoint`. */
export const createSavePointStore = (deps: Partial<SavePointDeps> = {}): SavePointStoreApi =>
  createStore<SavePointStore>(savePointStore({ conn: db, now: () => Date.now(), ...deps }));

export const useSavePoint = create<SavePointStore>()(
  savePointStore({ conn: db, now: () => Date.now() }),
);
