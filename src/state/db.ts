/**
 * IndexedDB schema and access (spec §5.2 state/db).
 *
 * IndexedDB is the source of truth: there is no server in P0 and the app has to
 * come back byte-identical after a hard kill (R5, R9). Two stores are enough —
 * one record per game keyed by `id`, and a singleton `PlayerProfile` under the
 * fixed key `'profile'`. Nothing here writes a class instance or a `Set`: the
 * `Game` shape is already structurally serializable (architecture invariant 5),
 * so a P2 sync layer can ship by adding a writer, not by rewriting storage.
 *
 * **Migrations.** `SCHEMA` is the full version history, oldest first, and
 * `applySchema` replays it onto a Dexie instance. There is only v1 today, but a
 * schema change is exactly the kind of thing that gets bolted on badly under
 * time pressure: appending `{ version: 2, stores, upgrade }` to the array is now
 * the whole procedure, and `upgrade` receives Dexie's transaction so a data
 * backfill lives next to the index change that needs it.
 */

import { Dexie } from 'dexie';
import type { Table, Transaction } from 'dexie';
import { formatGrid } from '../engine/board';
import type { Difficulty } from '../engine/types';
import { elapsedAt, progress } from './game';
import { DEFAULT_PROFILE } from './mastery';
import type { Game, PlayerProfile } from './types';

export const DB_NAME = 'sudoku-coach';

export interface SchemaVersion {
  version: number;
  /** Dexie store definitions: `'primaryKey, index, index'`. */
  stores: Record<string, string>;
  /** Data backfill for players upgrading from the previous version. */
  upgrade?: (tx: Transaction) => Promise<unknown> | void;
}

/**
 * Indexes are exactly what the game list queries and nothing more — every extra
 * index is write amplification on a device that autosaves every few seconds.
 *
 * A caveat worth knowing before writing a query: `completedAt` is `number |
 * null` in the frozen `Game` contract, and IndexedDB cannot index `null`. An
 * in-progress game is therefore *absent* from the `completedAt` index rather
 * than sorted first, which makes `where('completedAt').above(0)` an exact
 * "finished games" query but makes `orderBy('completedAt')` silently drop every
 * unfinished game. Order by `updatedAt` and filter in memory instead.
 */
export const SCHEMA: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: {
      games: 'id, updatedAt, completedAt, difficulty, [difficulty+updatedAt]',
      profile: 'id',
    },
  },
  {
    version: 2,
    stores: {
      // Sync's two additions. A later version lists only the stores it
      // changes; `games` and `profile` carry over untouched.
      tombstones: 'id, deletedAt',
      sync: 'id',
    },
  },
];

/** Replays a version history onto a Dexie instance, in order. */
export function applySchema(db: Dexie, versions: readonly SchemaVersion[] = SCHEMA): void {
  for (const { version, stores, upgrade } of versions) {
    const declared = db.version(version).stores(stores);
    if (upgrade !== undefined) declared.upgrade(upgrade);
  }
}

/**
 * A game that was deleted, and when.
 *
 * Written on every deletion, signed in or not. "Newest wins" cannot express a
 * deletion on its own — a game absent locally and present remotely is
 * indistinguishable from one that has never been synced down — so without this
 * record a game deleted on a phone comes back from the laptop on the next
 * sync, and comes back again every time it is deleted. The tombstone is the
 * only thing that says *when* it went, which is what lets a later play on
 * another device legitimately outrank it.
 */
export interface Tombstone {
  id: string;
  deletedAt: number;
}

/**
 * Sync's own bookkeeping. A singleton under the fixed key `'sync'`, alongside
 * the profile and for the same reason: there is exactly one of it.
 *
 * `profileTouchedAt` exists because `PlayerProfile` is a frozen contract with
 * no timestamp on it and newest-wins needs one. Stamping it here rather than
 * on the profile keeps the contract closed and puts the fact in the one place
 * that already knows when a profile write happened.
 */
export interface SyncRecord {
  id: 'sync';
  /** When the local profile was last written. 0 when it never has been. */
  profileTouchedAt: number;
  /** When a sync last completed cleanly. Shown in Settings. */
  lastSyncedAt: number | null;
  /**
   * Whether the player has switched sync on. Separate from holding a usable
   * token: consent survives a reload, a token does not, and forgetting the
   * former would ask permission again on every visit.
   */
  enabled: boolean;
}

export const DEFAULT_SYNC_RECORD: SyncRecord = {
  id: 'sync',
  profileTouchedAt: 0,
  lastSyncedAt: null,
  enabled: false,
};

export class SudokuCoachDB extends Dexie {
  // `declare` keeps these type-only: with `useDefineForClassFields` a real field
  // declaration would emit `games = undefined` and clobber Dexie's own binding.
  declare games: Table<Game, string>;
  declare profile: Table<PlayerProfile, string>;
  declare tombstones: Table<Tombstone, string>;
  declare sync: Table<SyncRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    applySchema(this);
  }
}

/** The app's connection. Dexie opens lazily, so importing this is free. */
export const db = new SudokuCoachDB();

/* -------------------------------------------------------------------------- */
/* Games                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What the game list renders. A stored game carries its whole undo history,
 * which is most of its bytes and none of the list's business — IndexedDB has no
 * column projection, so the record is read whole and reduced to this
 * immediately. The saving is memory retention over a long session, not I/O:
 * only the game the player opens keeps its move log alive.
 */
export interface GameSummary {
  id: string;
  difficulty: Difficulty;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  /** Frozen at read time; a running game's clock keeps moving in the store. */
  elapsedMs: number;
  /**
   * Always null: `elapsedMs` above already folded in the stretch that was
   * running when the list was read. Kept in the shape so a row can be rendered
   * with the same clock helpers as a live game without double-counting it.
   */
  runningSince: null;
  /** Percent of the open cells filled. */
  progress: number;
  moves: number;
  /**
   * The puzzle and the board as 81-char strings, for the row's sigil and its
   * completion figure. Strings rather than cells on purpose: the list needs the
   * digits, not the player's pencil marks, and two strings per game is a
   * rounding error against the cell objects they replace.
   */
  givens: string;
  board: string;
}

export const toSummary = (game: Game, now: number): GameSummary => ({
  id: game.id,
  difficulty: game.difficulty,
  createdAt: game.createdAt,
  updatedAt: game.updatedAt,
  completedAt: game.completedAt,
  elapsedMs: elapsedAt(game, now),
  runningSince: null,
  progress: progress(game),
  moves: game.undoStack.length,
  givens: game.givens,
  board: formatGrid(game.cells.map((cell) => cell.value)),
});

export const saveGame = (game: Game, conn: SudokuCoachDB = db): Promise<string> =>
  conn.games.put(game);

export const loadGame = (id: string, conn: SudokuCoachDB = db): Promise<Game | undefined> =>
  conn.games.get(id);

export const deleteGame = (id: string, conn: SudokuCoachDB = db): Promise<void> =>
  conn.games.delete(id);

/** Most recently played first — the order the game list wants (R5). */
export async function listSummaries(
  now: number,
  conn: SudokuCoachDB = db,
): Promise<GameSummary[]> {
  const games = await conn.games.orderBy('updatedAt').reverse().toArray();
  return games.map((game) => toSummary(game, now));
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `stored`, with any settings field it predates filled in from
 * `DEFAULT_PROFILE`. A profile saved before a field existed simply lacks the
 * key on disk — it is absent, not `undefined` — so every path that hands a
 * stored profile to a caller has to apply this once, or `settings` cannot be
 * trusted to be fully populated the way `PlayerProfile`'s type claims it is.
 */
export function withDefaultSettings(stored: PlayerProfile): PlayerProfile {
  return { ...stored, settings: { ...DEFAULT_PROFILE.settings, ...stored.settings } };
}

/**
 * The profile always exists as far as callers are concerned: a first run gets
 * the defaults in memory and only writes them when something actually changes,
 * so opening the app never dirties storage.
 */
export async function loadProfile(conn: SudokuCoachDB = db): Promise<PlayerProfile> {
  const stored = await readProfile(conn);
  return stored === undefined ? DEFAULT_PROFILE : withDefaultSettings(stored);
}

/**
 * The stored profile, or undefined on a first run. The distinction matters
 * exactly once: a player who has never chosen a language should get the one
 * their browser asks for, and a player who has chosen must never be overridden
 * by it. Raw as written to disk — a settings field it predates is simply
 * absent — so a caller that needs `settings` fully populated wants
 * `loadProfile` (or `withDefaultSettings` directly) instead.
 */
export const readProfile = (conn: SudokuCoachDB = db): Promise<PlayerProfile | undefined> =>
  conn.profile.get('profile');

/**
 * Writes the profile and records when, in one transaction.
 *
 * The stamp is not decoration: it is the only timestamp the profile has, and a
 * sync that wrote the profile without it would have no way to tell a local
 * change from a remote one on the next run. Both puts are in one transaction
 * so a crash between them cannot leave a changed profile claiming it is older
 * than it is — which would silently let a stale remote copy overwrite it.
 */
export const saveProfile = (
  profile: PlayerProfile,
  conn: SudokuCoachDB = db,
  at: number = Date.now(),
): Promise<void> =>
  conn.transaction('rw', conn.profile, conn.sync, async () => {
    await conn.profile.put({ ...profile, id: 'profile' });
    const current = await conn.sync.get('sync');
    await conn.sync.put({ ...(current ?? DEFAULT_SYNC_RECORD), profileTouchedAt: at });
  });

/* -------------------------------------------------------------------------- */
/* Sync bookkeeping                                                           */
/* -------------------------------------------------------------------------- */

export const readSyncRecord = async (conn: SudokuCoachDB = db): Promise<SyncRecord> =>
  (await conn.sync.get('sync')) ?? DEFAULT_SYNC_RECORD;

export const writeSyncRecord = async (
  patch: Partial<Omit<SyncRecord, 'id'>>,
  conn: SudokuCoachDB = db,
): Promise<void> => {
  await conn.transaction('rw', conn.sync, async () => {
    const current = (await conn.sync.get('sync')) ?? DEFAULT_SYNC_RECORD;
    await conn.sync.put({ ...current, ...patch, id: 'sync' });
  });
};

/**
 * Deletes a game and remembers that it was deleted, atomically.
 *
 * One transaction because the two halves are one fact. A deletion recorded
 * without the game gone would re-delete it forever; a game gone without the
 * record is exactly the resurrection the tombstone exists to prevent.
 */
export const deleteGameRecording = (
  id: string,
  at: number,
  conn: SudokuCoachDB = db,
): Promise<void> =>
  conn.transaction('rw', conn.games, conn.tombstones, async () => {
    await conn.games.delete(id);
    await conn.tombstones.put({ id, deletedAt: at });
  });

export const listTombstones = (conn: SudokuCoachDB = db): Promise<Tombstone[]> =>
  conn.tombstones.toArray();

export const forgetTombstones = async (
  ids: readonly string[],
  conn: SudokuCoachDB = db,
): Promise<void> => {
  if (ids.length === 0) return;
  await conn.tombstones.bulkDelete([...ids]);
};

/**
 * Drops tombstones older than `before`.
 *
 * Without this the table only ever grows, on a device that may be in use for
 * years. The cost of pruning is stated rather than hidden: a device that has
 * not synced since before the cutoff can resurrect a game deleted elsewhere,
 * because the record proving the deletion is gone. `TOMBSTONE_TTL_MS` is set
 * far past any plausible gap between two syncs of the same account.
 */
export const pruneTombstones = async (
  before: number,
  conn: SudokuCoachDB = db,
): Promise<number> => conn.tombstones.where('deletedAt').below(before).delete();

/** Ninety days. Long enough that pruning is invisible; short enough to bound. */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
