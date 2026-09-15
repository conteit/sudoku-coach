/**
 * One sync: read both sides, ask the planner what to do, do it.
 *
 * The remote is three kinds of file in the hidden app folder — a manifest, the
 * profile, and one file per game. One file per game rather than a single
 * document so a sync costs what changed rather than what exists, and so a file
 * that somehow arrives corrupt costs one puzzle instead of a library.
 *
 * **The manifest is written last, and that ordering is the whole crash story.**
 * `index.json` is what the next sync reads to decide what moved; the game
 * files are the data. Write the manifest first and a failure halfway through
 * leaves it claiming games that were never uploaded, and the next sync will
 * believe it and never send them. Write it last and the same failure leaves a
 * manifest that is merely behind — the next sync re-uploads, which is
 * idempotent and costs bytes rather than a board.
 *
 * Nothing here decides anything. Every comparison lives in `plan.ts`, so the
 * rules can be tested without a network and this file stays a transcription of
 * the plan.
 */

import {
  deleteGame,
  deleteSavePoint,
  listTombstones,
  loadGame,
  pruneTombstones,
  readProfile,
  readSavePoint,
  readSyncRecord,
  saveGame,
  savePointIndex,
  saveProfile,
  withDefaultSettings,
  writeSavePoint,
  writeSyncRecord,
  TOMBSTONE_TTL_MS,
  type SudokuCoachDB,
} from '../state/db';
import { db } from '../state/db';
import type { SavePoint } from '../state/db';
import type { Game, PlayerProfile } from '../state/types';
import type { Drive, DriveFile } from './drive';
import { isEmptyPlan, planSync, type ProfileMove, type RecordIndex } from './plan';

export const INDEX_FILE = 'index.json';
export const PROFILE_FILE = 'profile.json';

/** `game-<id>.json`. The id is in the name so the manifest and the folder agree. */
export const gameFile = (id: string): string => `game-${id}.json`;

/** `savepoint-<id>.json`, for the game of the same id. One apiece, like the table. */
export const savePointFile = (id: string): string => `savepoint-${id}.json`;

/**
 * The manifest. `version` is here so a future shape change can be recognised
 * rather than misread — an unknown version is treated as an empty remote,
 * which re-uploads rather than corrupting anything.
 */
export interface RemoteIndex {
  version: 1;
  games: RecordIndex;
  tombstones: RecordIndex;
  profileAt: number;
  /**
   * Save points, added after the fact — and optional for a reason worth
   * spelling out, because the obvious alternative is worse.
   *
   * Bumping `version` to 2 would be the tidy way to announce a new field, and
   * it would break every client still on the old build: `isIndex` rejects an
   * unknown version and falls back to `EMPTY_INDEX`, so an old client would
   * read the remote as empty, forget the tombstones, re-upload its whole
   * library and rewrite the manifest as v1 — after which the new client does
   * the same in reverse. Two clients erasing each other's manifest on
   * alternate syncs is a much worse failure than anything this field can
   * cause.
   *
   * Left optional at version 1, the worst an old client does is write a
   * manifest without this key. The snapshot files stay in the folder; they are
   * simply unlisted until a new client syncs again, which re-lists them. A
   * save point that takes an extra sync to propagate is a scratch feature
   * behaving slightly slowly, not data loss.
   */
  savePoints?: RecordIndex;
}

export const EMPTY_INDEX: RemoteIndex = {
  version: 1,
  games: {},
  tombstones: {},
  profileAt: 0,
  savePoints: {},
};

export interface SyncOutcome {
  at: number;
  uploaded: number;
  downloaded: number;
  removedLocal: number;
  removedRemote: number;
  profile: ProfileMove;
  /**
   * Ids actually pulled from the remote, gathered inside the download loop
   * rather than copied from `plan.download`. The plan is an intention; a
   * manifest can name a game whose file never made it into the folder (see
   * "Manifest ahead of the folder" below), and the UI is about to tell a
   * player something happened to these games — it must not name one that
   * didn't.
   */
  downloadedIds: readonly string[];
  /** Same reasoning as `downloadedIds`, for the local deletions actually applied. */
  droppedLocalIds: readonly string[];
  /**
   * Games whose save point changed on this device — pulled from the remote or
   * dropped because the game was deleted. Its own list rather than a count:
   * the screen showing a game has to know whether *its* snapshot moved, and it
   * must not be told a board changed when only the snapshot did.
   */
  savePointIds: readonly string[];
}

export interface SyncDeps {
  drive: Drive;
  conn?: SudokuCoachDB;
  now?: () => number;
}

const isIndex = (value: unknown): value is RemoteIndex =>
  typeof value === 'object' && value !== null && (value as RemoteIndex).version === 1;

/** Every id and when it last changed, read from the index alone. */
async function localGameIndex(conn: SudokuCoachDB): Promise<RecordIndex> {
  const index: Record<string, number> = {};
  // Index-only: a game carries its whole undo history, and reading every
  // record to learn its timestamp would make the cheap case — nothing
  // changed — the most expensive thing the app does.
  await conn.games.orderBy('updatedAt').eachKey((key, cursor) => {
    index[String(cursor.primaryKey)] = Number(key);
  });
  return index;
}

const indexFrom = (rows: readonly { id: string; deletedAt: number }[]): RecordIndex =>
  Object.fromEntries(rows.map((row) => [row.id, row.deletedAt]));

export async function syncOnce({
  drive,
  conn = db,
  now = () => Date.now(),
}: SyncDeps): Promise<SyncOutcome> {
  const files = await drive.list();
  const byName = new Map<string, DriveFile>(files.map((file) => [file.name, file]));

  const indexFile = byName.get(INDEX_FILE);
  const remote =
    indexFile === undefined ? EMPTY_INDEX : await drive.read<unknown>(indexFile.id).then(
      (value) => (isIndex(value) ? value : EMPTY_INDEX),
    );

  const localGames = await localGameIndex(conn);
  const localTombstones = indexFrom(await listTombstones(conn));
  const localSavePoints = await savePointIndex(conn);
  const sync = await readSyncRecord(conn);

  const plan = planSync({
    localGames,
    remoteGames: remote.games,
    localTombstones,
    remoteTombstones: remote.tombstones,
    localProfileAt: sync.profileTouchedAt,
    remoteProfileAt: remote.profileAt,
    localSavePoints,
    // Absent on a manifest written by a client that predates save points, and
    // an absent index is an empty one: every local snapshot then looks newer
    // and is re-listed, which is the recovery path the field's comment
    // describes rather than an error.
    remoteSavePoints: remote.savePoints ?? {},
  });

  const at = now();
  if (isEmptyPlan(plan)) {
    await writeSyncRecord({ lastSyncedAt: at }, conn);
    return {
      at,
      uploaded: 0,
      downloaded: 0,
      removedLocal: 0,
      removedRemote: 0,
      profile: 'none',
      downloadedIds: [],
      droppedLocalIds: [],
      savePointIds: [],
    };
  }

  const put = async (name: string, body: unknown): Promise<void> => {
    const existing = byName.get(name);
    if (existing === undefined) byName.set(name, await drive.create(name, body));
    else await drive.update(existing.id, body);
  };

  const games = { ...remote.games };
  const savePoints = { ...(remote.savePoints ?? {}) };
  const downloadedIds: string[] = [];
  const droppedLocalIds: string[] = [];
  const savePointIds: string[] = [];

  for (const id of plan.download) {
    const file = byName.get(gameFile(id));
    if (file === undefined) continue; // Manifest ahead of the folder; next run.
    const game = await drive.read<Game>(file.id);
    await saveGame(game, conn);
    downloadedIds.push(id);
  }

  for (const id of plan.upload) {
    const game = await loadGame(id, conn);
    if (game === undefined) continue; // Deleted while this sync was running.
    await put(gameFile(id), game);
    games[id] = game.updatedAt;
  }

  for (const id of plan.dropLocal) {
    // Plain delete: the tombstone that justifies it is already in the plan and
    // is written below. Recording a second one would only re-date the deletion
    // and hand it a fresh chance to outrank a play on a third device.
    await deleteGame(id, conn);
    droppedLocalIds.push(id);
  }

  for (const id of plan.dropRemote) {
    const file = byName.get(gameFile(id));
    if (file !== undefined) await drive.remove(file.id);
    delete games[id];
  }

  for (const id of plan.savePoints.download) {
    const file = byName.get(savePointFile(id));
    if (file === undefined) continue; // Manifest ahead of the folder; next run.
    await writeSavePoint(await drive.read<SavePoint>(file.id), conn);
    savePointIds.push(id);
  }

  for (const id of plan.savePoints.upload) {
    const point = await readSavePoint(id, conn);
    if (point === undefined) continue; // Overwritten or deleted mid-sync.
    await put(savePointFile(id), point);
    savePoints[id] = point.updatedAt;
  }

  for (const id of plan.savePoints.dropLocal) {
    await deleteSavePoint(id, conn);
    savePointIds.push(id);
  }

  for (const id of plan.savePoints.dropRemote) {
    const file = byName.get(savePointFile(id));
    if (file !== undefined) await drive.remove(file.id);
    delete savePoints[id];
  }

  let profileAt = remote.profileAt;
  if (plan.profile === 'upload') {
    const profile = await readProfile(conn);
    if (profile !== undefined) {
      await put(PROFILE_FILE, profile);
      profileAt = sync.profileTouchedAt;
    }
  } else if (plan.profile === 'download') {
    const file = byName.get(PROFILE_FILE);
    if (file !== undefined) {
      const profile = await drive.read<PlayerProfile>(file.id);
      // Stamped with the remote's own time, not with now: stamping it locally
      // would make the copy we just pulled look newer than its source and push
      // it straight back on the next run.
      await saveProfile(withDefaultSettings(profile), conn, remote.profileAt);
    }
  }

  await conn.transaction('rw', conn.tombstones, async () => {
    await conn.tombstones.clear();
    await conn.tombstones.bulkPut(
      Object.entries(plan.tombstones).map(([id, deletedAt]) => ({ id, deletedAt })),
    );
  });

  // Last, on purpose. See the header.
  await put(INDEX_FILE, {
    version: 1,
    games,
    tombstones: plan.tombstones,
    profileAt,
    savePoints,
  } satisfies RemoteIndex);

  await pruneTombstones(at - TOMBSTONE_TTL_MS, conn);
  await writeSyncRecord({ lastSyncedAt: at, profileTouchedAt: profileAt }, conn);

  return {
    at,
    uploaded: plan.upload.length,
    downloaded: downloadedIds.length,
    removedLocal: droppedLocalIds.length,
    removedRemote: plan.dropRemote.length,
    profile: plan.profile,
    downloadedIds,
    droppedLocalIds,
    savePointIds,
  };
}
