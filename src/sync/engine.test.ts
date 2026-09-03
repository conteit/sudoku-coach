// Must come first: Dexie captures the global `indexedDB` when it is imported.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DB_NAME, SudokuCoachDB, deleteGameRecording, loadGame, readSyncRecord, saveGame, saveProfile } from '../state/db';
import { newGame, toStored } from '../state/game';
import { DEFAULT_PROFILE } from '../state/mastery';
import type { Game } from '../state/types';
import type { Drive, DriveFile } from './drive';
import { INDEX_FILE, gameFile, syncOnce, type RemoteIndex } from './engine';

/**
 * Two devices, one Drive.
 *
 * The interesting failures in a sync are never in one run — they are what the
 * *second* device sees afterwards, which is why almost everything here syncs
 * A, then syncs B, then looks at B. A fake Drive rather than a mocked
 * `syncOnce` for the same reason: the bug this suite exists to catch is the
 * engine and the planner disagreeing about what a plan meant, and a mock of
 * either one cannot show that.
 */

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

let opened: SudokuCoachDB[] = [];
let counter = 0;

function device(): SudokuCoachDB {
  const conn = new SudokuCoachDB(`${DB_NAME}-sync-${counter++}`);
  opened.push(conn);
  return conn;
}

afterEach(async () => {
  for (const conn of opened) await conn.delete();
  opened = [];
});

const gameAt = (id: string, at: number): Game =>
  toStored({
    ...newGame({ id, givens: PUZZLE, solution: SOLVED, difficulty: 'easy', at }),
    updatedAt: at,
  });

interface FakeDrive extends Drive {
  files: Map<string, { name: string; body: unknown }>;
  calls: string[];
  read<T>(id: string): Promise<T>;
}

/** An in-memory app folder. Ids are opaque, exactly as Drive's are. */
function fakeDrive(): FakeDrive {
  const files = new Map<string, { name: string; body: unknown }>();
  const calls: string[] = [];
  let next = 0;

  const find = (name: string): DriveFile | undefined => {
    for (const [id, file] of files) if (file.name === name) return { id, name };
    return undefined;
  };

  return {
    files,
    calls,
    list: () => {
      calls.push('list');
      return Promise.resolve([...files].map(([id, file]) => ({ id, name: file.name })));
    },
    read: <T,>(id: string) => {
      const file = files.get(id);
      if (file === undefined) return Promise.reject(new Error(`no such file ${id}`));
      calls.push(`read ${file.name}`);
      // Round-tripped through JSON, like the real thing: a value that cannot
      // survive that is a value this app must not be storing.
      return Promise.resolve(JSON.parse(JSON.stringify(file.body)) as T);
    },
    create: (name, body) => {
      calls.push(`create ${name}`);
      const id = `file-${next++}`;
      files.set(id, { name, body });
      return Promise.resolve({ id, name });
    },
    update: (id, body) => {
      const file = files.get(id);
      if (file === undefined) return Promise.reject(new Error(`no such file ${id}`));
      calls.push(`update ${file.name}`);
      files.set(id, { name: file.name, body });
      return Promise.resolve();
    },
    remove: (id) => {
      const file = files.get(id);
      calls.push(`remove ${file?.name ?? id}`);
      files.delete(id);
      return Promise.resolve();
    },
    // Only used by the assertions below.
    ...{ find },
  } as FakeDrive & { find: typeof find };
}

const indexOf = (drive: FakeDrive): RemoteIndex => {
  for (const file of drive.files.values()) {
    if (file.name === INDEX_FILE) return file.body as RemoteIndex;
  }
  throw new Error('no manifest');
};

describe('syncOnce', () => {
  it('uploads what the remote has never seen, and writes a manifest', async () => {
    const drive = fakeDrive();
    const a = device();
    await saveGame(gameAt('g1', 1000), a);

    const outcome = await syncOnce({ drive, conn: a, now: () => 5000 });

    expect(outcome.uploaded).toBe(1);
    expect(indexOf(drive).games).toEqual({ g1: 1000 });
    expect([...drive.files.values()].map((f) => f.name).sort()).toEqual(
      [INDEX_FILE, gameFile('g1')].sort(),
    );
  });

  it('writes the manifest last, so a crash leaves it behind rather than ahead', async () => {
    // A manifest that ran ahead of the data would claim games that were never
    // uploaded, and the next sync would believe it and never send them. Behind
    // is recoverable: the next sync simply uploads again.
    const drive = fakeDrive();
    const a = device();
    await saveGame(gameAt('g1', 1000), a);

    await syncOnce({ drive, conn: a, now: () => 5000 });

    const manifest = drive.calls.findIndex((call) => call.includes(INDEX_FILE));
    const game = drive.calls.findIndex((call) => call.includes(gameFile('g1')));
    expect(game).toBeGreaterThanOrEqual(0);
    expect(manifest).toBeGreaterThan(game);
  });

  it('carries a game to the second device whole', async () => {
    const drive = fakeDrive();
    const a = device();
    const b = device();
    const original = gameAt('g1', 1000);
    await saveGame(original, a);

    await syncOnce({ drive, conn: a, now: () => 5000 });
    const outcome = await syncOnce({ drive, conn: b, now: () => 6000 });

    expect(outcome.downloaded).toBe(1);
    expect(await loadGame('g1', b)).toEqual(original);
  });

  it('settles: a second run with nothing changed moves nothing', async () => {
    const drive = fakeDrive();
    const a = device();
    await saveGame(gameAt('g1', 1000), a);
    await syncOnce({ drive, conn: a, now: () => 5000 });

    const again = await syncOnce({ drive, conn: a, now: () => 6000 });

    expect(again).toMatchObject({ uploaded: 0, downloaded: 0, profile: 'none' });
  });

  it('lets the device played on last win, whole', async () => {
    const drive = fakeDrive();
    const a = device();
    const b = device();
    await saveGame(gameAt('g1', 1000), a);
    await syncOnce({ drive, conn: a, now: () => 5000 });
    await syncOnce({ drive, conn: b, now: () => 5100 });

    // B plays on, and pushes.
    await saveGame(gameAt('g1', 9000), b);
    await syncOnce({ drive, conn: b, now: () => 6000 });
    // A picks it up.
    await syncOnce({ drive, conn: a, now: () => 7000 });

    expect((await loadGame('g1', a))?.updatedAt).toBe(9000);
  });

  describe('deletions', () => {
    it('does not bring back a game deleted on the other device', async () => {
      const drive = fakeDrive();
      const a = device();
      const b = device();
      await saveGame(gameAt('g1', 1000), a);
      await syncOnce({ drive, conn: a, now: () => 5000 });
      await syncOnce({ drive, conn: b, now: () => 5100 });
      expect(await loadGame('g1', b)).toBeDefined();

      await deleteGameRecording('g1', 6000, a);
      await syncOnce({ drive, conn: a, now: () => 6100 });
      await syncOnce({ drive, conn: b, now: () => 6200 });

      expect(await loadGame('g1', b)).toBeUndefined();
      expect(indexOf(drive).games).toEqual({});
      // And it stays gone: the third sync must not re-upload it from B.
      await syncOnce({ drive, conn: b, now: () => 6300 });
      expect(indexOf(drive).games).toEqual({});
    });

    it('takes the remote copy down with it', async () => {
      const drive = fakeDrive();
      const a = device();
      await saveGame(gameAt('g1', 1000), a);
      await syncOnce({ drive, conn: a, now: () => 5000 });

      await deleteGameRecording('g1', 6000, a);
      await syncOnce({ drive, conn: a, now: () => 6100 });

      expect([...drive.files.values()].map((f) => f.name)).not.toContain(gameFile('g1'));
    });

    it('lets a play newer than the deletion resurrect the game', async () => {
      const drive = fakeDrive();
      const a = device();
      const b = device();
      await saveGame(gameAt('g1', 1000), a);
      await syncOnce({ drive, conn: a, now: () => 5000 });
      await syncOnce({ drive, conn: b, now: () => 5100 });

      // A deletes it; B, not yet knowing, plays it further.
      await deleteGameRecording('g1', 6000, a);
      await saveGame(gameAt('g1', 7000), b);

      await syncOnce({ drive, conn: a, now: () => 8000 });
      await syncOnce({ drive, conn: b, now: () => 8100 });
      await syncOnce({ drive, conn: a, now: () => 8200 });

      // The later play wins, and the spent tombstone is not kept to re-delete
      // it on the next run.
      expect((await loadGame('g1', a))?.updatedAt).toBe(7000);
      expect(indexOf(drive).tombstones).toEqual({});
    });
  });

  describe('the profile', () => {
    it('travels to a device that has never written one', async () => {
      const drive = fakeDrive();
      const a = device();
      const b = device();
      await saveProfile({ ...DEFAULT_PROFILE, locale: 'it' }, a, 1000);

      await syncOnce({ drive, conn: a, now: () => 5000 });
      const outcome = await syncOnce({ drive, conn: b, now: () => 6000 });

      expect(outcome.profile).toBe('download');
      expect((await b.profile.get('profile'))?.locale).toBe('it');
    });

    it('does not bounce a freshly pulled profile straight back', async () => {
      // Stamping a downloaded profile with the local clock would make the copy
      // look newer than its source, and the two devices would push it back and
      // forth forever.
      const drive = fakeDrive();
      const a = device();
      const b = device();
      await saveProfile({ ...DEFAULT_PROFILE, locale: 'it' }, a, 1000);
      await syncOnce({ drive, conn: a, now: () => 5000 });
      await syncOnce({ drive, conn: b, now: () => 6000 });

      const again = await syncOnce({ drive, conn: b, now: () => 7000 });

      expect(again.profile).toBe('none');
      expect((await readSyncRecord(b)).profileTouchedAt).toBe(1000);
    });
  });

  it('records when it last finished, for Settings to show', async () => {
    const drive = fakeDrive();
    const a = device();
    await saveGame(gameAt('g1', 1000), a);

    await syncOnce({ drive, conn: a, now: () => 5000 });

    expect((await readSyncRecord(a)).lastSyncedAt).toBe(5000);
  });

  it('treats a manifest it cannot read as an empty remote, and re-uploads', async () => {
    const drive = fakeDrive();
    const a = device();
    await saveGame(gameAt('g1', 1000), a);
    await drive.create(INDEX_FILE, { version: 99, nonsense: true });

    const outcome = await syncOnce({ drive, conn: a, now: () => 5000 });

    expect(outcome.uploaded).toBe(1);
    expect(indexOf(drive).games).toEqual({ g1: 1000 });
  });
});
