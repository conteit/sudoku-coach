/**
 * Sync as the app sees it: a switch, a status, and a time.
 *
 * Everything hard is elsewhere — `plan.ts` decides, `engine.ts` performs,
 * `token.ts` negotiates consent. What is left here is the part the spec is
 * strictest about: **sync is best-effort and silent**. A failure is a state in
 * Settings, never a dialog, and nothing in the game ever waits on it. A player
 * with no network is a player playing sudoku, not a player looking at a
 * warning.
 *
 * **The access token is not in this store, and must not be.** It lives in a
 * module-local variable that nothing serialises. The app can write a
 * diagnostic report containing its own state (#79), players are invited to
 * paste that report into a bug report, and a bearer token for someone's Drive
 * is precisely the thing that must never travel that way.
 */

import { create } from 'zustand';
import { db, readSyncRecord, writeSyncRecord, type SudokuCoachDB } from '../state/db';
import { useAccount } from '../state/account';
import { useGameStore } from '../state/store';
import { DriveError, driveFor } from './drive';
import { syncOnce, type SyncOutcome } from './engine';
import { requestGrant, syncAvailable, usable, type Grant } from './token';
import { isOffline } from './connectivity';

export type SyncStatus =
  /** This build cannot sync, or the player has not switched it on. */
  | 'off'
  /** On, and nothing is happening. The resting state. */
  | 'idle'
  | 'syncing'
  /** On, but Google will not issue a token without being asked in person. */
  | 'consent'
  /**
   * On, and there is no network. Not a failure and not the player's problem:
   * this app is meant to be played offline, so nothing is shown for it.
   */
  | 'offline'
  /** On, and the last attempt failed. Not fatal: the next one may not. */
  | 'error';

export interface SyncStore {
  enabled: boolean;
  status: SyncStatus;
  lastSyncedAt: number | null;
  /**
   * Games this session has pulled from another device and not yet shown.
   * Session state on purpose: never persisted, and never written into a
   * `Game` record — a per-game "arrived from sync" flag would itself sync to
   * the other device, where it describes nobody's screen. A reload clears it
   * wholesale, which is honest: everything on screen after a reload came
   * from disk, and none of it is news.
   */
  changed: ReadonlySet<string>;
  /**
   * Ids the toast has already put in front of the player. Session state, same
   * lifetime and the same reason as `changed`: it is a receipt for something
   * that happened on this screen, not a fact about a game, so it is never
   * persisted and never written into a `Game` record.
   *
   * It exists so the toast can be shown only for `changed \ announced` —
   * ids that have arrived and not yet been put in front of anyone — rather
   * than for the whole of `changed`. Without it, the toast's own read receipt
   * would have to live in the component, which breaks two ways: `seen()`
   * removing an *opened* game's id from `changed` changes what is left in the
   * set, which the component can't tell apart from a *new* arrival, so it
   * reopens to announce games the player hasn't touched — at the exact moment
   * a game is open, which is the one surface this is never allowed to
   * interrupt. And the component unmounts between games, so its receipt
   * doesn't survive leaving and reopening one, and "news, once" turns into
   * "news, every time you look".
   */
  announced: ReadonlySet<string>;
  /** Reads the stored switch. Syncs straight away if it is on. */
  hydrate: () => Promise<void>;
  /** From a real click: this is the one path allowed to open a popup. */
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  /** Silent. Safe to call on a timer, on wake, or on the way out. */
  syncNow: () => Promise<void>;
  /** A mark earns its removal by being acted on — opened, not merely glanced at. */
  seen: (id: string) => void;
  /**
   * Marks the current contents of `changed` as announced — called when the
   * toast is dismissed or times out, never when a game is opened (`seen()`
   * is the only thing that clears `changed` itself). Sets rather than unions:
   * bounding `announced` by `changed` means an id `seen()` has since dropped
   * from `changed` is not still sitting in `announced` forever, growing a set
   * nothing will ever read again.
   */
  announce: () => void;
  /**
   * Drops the token and rests, without touching the switch. Signing out is
   * not a decision to stop syncing — it is the end of a session — so the
   * preference has to survive it or signing back in would ask again.
   */
  forget: () => void;
}

/**
 * Whether `run` actually moved anything — as opposed to a plan that turned
 * out empty, which still touches `lastSyncedAt` but nothing else. Gates the
 * catch-up below: the whole point of the trigger design (sync on load,
 * sign-in, reconnect and both edges of tab visibility) is that a no-op sync
 * is cheap, and an unconditional summary rebuild would tax every tab switch.
 */
const appliedSomething = (outcome: SyncOutcome): boolean =>
  outcome.downloadedIds.length > 0 ||
  outcome.droppedLocalIds.length > 0 ||
  outcome.uploaded > 0 ||
  outcome.removedRemote > 0 ||
  outcome.profile !== 'none';

/** Held here rather than in the store. See the header. */
let grant: Grant | null = null;

/** Serialises runs: two syncs at once would race each other's writes. */
let running: Promise<void> = Promise.resolve();

export interface SyncDeps {
  conn: SudokuCoachDB;
  now: () => number;
  available: () => boolean;
  getGrant: (prompt: string, hint?: string) => Promise<Grant | null>;
  offline: () => boolean;
}

const defaultDeps = (): SyncDeps => ({
  conn: db,
  now: () => Date.now(),
  available: () => syncAvailable(),
  getGrant: (prompt, hint) => requestGrant({ prompt, hint }),
  offline: isOffline,
});

export const createSyncStore = (deps: SyncDeps = defaultDeps()) =>
  create<SyncStore>()((set, get) => {
    const emailHint = (): string | undefined => useAccount.getState().account?.email ?? undefined;

    /**
     * A usable token, or null. `prompt` is `''` everywhere except the switch:
     * a silent request that finds no consent simply fails, which is the
     * correct outcome for anything the player did not just click.
     */
    const tokenFor = async (prompt: string): Promise<string | null> => {
      if (usable(grant, deps.now())) return grant.token;
      grant = await deps.getGrant(prompt, emailHint());
      return grant?.token ?? null;
    };

    const run = async (prompt: string): Promise<void> => {
      // Signed out is not an error: it is the resting state of an optional
      // feature, and it is reached by the player pressing "Sign out".
      if (!get().enabled || !deps.available() || useAccount.getState().account === null) {
        set({ status: 'off' });
        return;
      }

      // Before the token, and that order is the whole point: asking Google for
      // one is the single thing sync does that can put a popup in front of
      // someone, and doing it with no network can only fail. A player on a
      // train is not having an account problem.
      if (deps.offline()) {
        set({ status: 'offline' });
        return;
      }

      set({ status: 'syncing' });
      try {
        const token = await tokenFor(prompt);
        if (token === null) {
          set({ status: 'consent' });
          return;
        }
        const outcome = await syncOnce({ drive: driveFor(token), conn: deps.conn, now: deps.now });
        set({ status: 'idle', lastSyncedAt: outcome.at });
        if (appliedSomething(outcome)) {
          if (outcome.downloadedIds.length > 0 || outcome.droppedLocalIds.length > 0) {
            // Arrivals in, departures out, in one step. A game announced as
            // having arrived and then deleted from another device would
            // otherwise stay in `changed` forever: the toast would say a game
            // was updated, and there would be no row anywhere to reconcile
            // that claim against, because the deletion has already been
            // applied locally. An id can only be in one of the two lists.
            set((state) => {
              const changed = new Set([...state.changed, ...outcome.downloadedIds]);
              for (const id of outcome.droppedLocalIds) changed.delete(id);
              return { changed };
            });
          }
          // Order doesn't matter to the game store — each call reads storage
          // for itself — but the summary rebuild is what the library repaints
          // from, so it goes first.
          await useGameStore.getState().refreshSummaries();
          await useGameStore.getState().refreshGames(outcome.downloadedIds);
        }
      } catch (error) {
        // An expired or withdrawn grant is the one failure with a next step,
        // so it gets its own state and the dead token is dropped rather than
        // retried. Everything else — offline, a 500, a truncated read — is
        // simply "not now".
        if (error instanceof DriveError && error.unauthorized) {
          grant = null;
          set({ status: 'consent' });
        } else {
          set({ status: 'error' });
        }
      }
    };

    /** Queued behind whatever is already in flight, never concurrent with it. */
    const queue = (prompt: string): Promise<void> => {
      running = running.then(() => run(prompt));
      return running;
    };

    return {
      enabled: false,
      status: 'off',
      lastSyncedAt: null,
      changed: new Set(),
      announced: new Set(),

      hydrate: async () => {
        const record = await readSyncRecord(deps.conn);
        set({
          enabled: record.enabled,
          lastSyncedAt: record.lastSyncedAt,
          status: record.enabled && deps.available() ? 'idle' : 'off',
        });
        if (record.enabled) await queue('');
      },

      enable: async () => {
        if (!deps.available()) return;
        set({ enabled: true });
        await writeSyncRecord({ enabled: true }, deps.conn);
        // The only 'consent' prompt in the app, and it is reached by a press.
        await queue('consent');
      },

      disable: async () => {
        grant = null;
        set({ enabled: false, status: 'off' });
        await writeSyncRecord({ enabled: false }, deps.conn);
      },

      syncNow: () => queue(''),

      seen: (id) =>
        set((state) => {
          if (!state.changed.has(id)) return state;
          const changed = new Set(state.changed);
          changed.delete(id);
          return { changed };
        }),

      announce: () => set((state) => ({ announced: new Set(state.changed) })),

      forget: () => {
        grant = null;
        set({ status: 'off' });
      },
    };
  });

export const useSync = createSyncStore();

/** Drops the held token. Called on sign-out; exported for tests. */
export const forgetGrant = (): void => {
  grant = null;
};
