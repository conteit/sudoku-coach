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
import { DriveError, driveFor } from './drive';
import { syncOnce } from './engine';
import { requestGrant, syncAvailable, usable, type Grant } from './token';

export type SyncStatus =
  /** This build cannot sync, or the player has not switched it on. */
  | 'off'
  /** On, and nothing is happening. The resting state. */
  | 'idle'
  | 'syncing'
  /** On, but Google will not issue a token without being asked in person. */
  | 'consent'
  /** On, and the last attempt failed. Not fatal: the next one may not. */
  | 'error';

export interface SyncStore {
  enabled: boolean;
  status: SyncStatus;
  lastSyncedAt: number | null;
  /** Reads the stored switch. Syncs straight away if it is on. */
  hydrate: () => Promise<void>;
  /** From a real click: this is the one path allowed to open a popup. */
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  /** Silent. Safe to call on a timer, on wake, or on the way out. */
  syncNow: () => Promise<void>;
  /**
   * Drops the token and rests, without touching the switch. Signing out is
   * not a decision to stop syncing — it is the end of a session — so the
   * preference has to survive it or signing back in would ask again.
   */
  forget: () => void;
}

/** Held here rather than in the store. See the header. */
let grant: Grant | null = null;

/** Serialises runs: two syncs at once would race each other's writes. */
let running: Promise<void> = Promise.resolve();

export interface SyncDeps {
  conn: SudokuCoachDB;
  now: () => number;
  available: () => boolean;
  getGrant: (prompt: string, hint?: string) => Promise<Grant | null>;
}

const defaultDeps = (): SyncDeps => ({
  conn: db,
  now: () => Date.now(),
  available: () => syncAvailable(),
  getGrant: (prompt, hint) => requestGrant({ prompt, hint }),
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

      set({ status: 'syncing' });
      try {
        const token = await tokenFor(prompt);
        if (token === null) {
          set({ status: 'consent' });
          return;
        }
        const outcome = await syncOnce({ drive: driveFor(token), conn: deps.conn, now: deps.now });
        set({ status: 'idle', lastSyncedAt: outcome.at });
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
