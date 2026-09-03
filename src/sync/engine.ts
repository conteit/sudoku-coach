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
  listTombstones,
  loadGame,
  pruneTombstones,
  readProfile,
  readSyncRecord,
  saveGame,
  saveProfile,
  withDefaultSettings,
  writeSyncRecord,
  TOMBSTONE_TTL_MS,
  type SudokuCoachDB,
} from '../state/db';
import { db } from '../state/db';
import type { Game, PlayerProfile } from '../state/types';
import type { Drive, DriveFile } from './drive';
import { isEmptyPlan, planSync, type ProfileMove, type RecordIndex } from './plan';

export const INDEX_FILE = 'index.json';
export const PROFILE_FILE = 'profile.json';

/** `game-<id>.json`. The id is in the name so the manifest and the folder agree. */
export const gameFile = (id: string): string => `game-${id}.json`;

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
}

export const EMPTY_INDEX: RemoteIndex = {
  version: 1,
  games: {},
  tombstones: {},
  profileAt: 0,
};

export interface SyncOutcome {
  at: number;
  uploaded: number;
  downloaded: number;
  removedLocal: number;
  removedRemote: number;
  profile: ProfileMove;
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
  const sync = await readSyncRecord(conn);

  const plan = planSync({
    localGames,
    remoteGames: remote.games,
    localTombstones,
    remoteTombstones: remote.tombstones,
    localProfileAt: sync.profileTouchedAt,
    remoteProfileAt: remote.profileAt,
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
    };
  }

  const put = async (name: string, body: unknown): Promise<void> => {
    const existing = byName.get(name);
    if (existing === undefined) byName.set(name, await drive.create(name, body));
    else await drive.update(existing.id, body);
  };

  const games = { ...remote.games };

  for (const id of plan.download) {
    const file = byName.get(gameFile(id));
    if (file === undefined) continue; // Manifest ahead of the folder; next run.
    const game = await drive.read<Game>(file.id);
    await saveGame(game, conn);
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
  }

  for (const id of plan.dropRemote) {
    const file = byName.get(gameFile(id));
    if (file !== undefined) await drive.remove(file.id);
    delete games[id];
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
  } satisfies RemoteIndex);

  await pruneTombstones(at - TOMBSTONE_TTL_MS, conn);
  await writeSyncRecord({ lastSyncedAt: at, profileTouchedAt: profileAt }, conn);

  return {
    at,
    uploaded: plan.upload.length,
    downloaded: plan.download.length,
    removedLocal: plan.dropLocal.length,
    removedRemote: plan.dropRemote.length,
    profile: plan.profile,
  };
}
