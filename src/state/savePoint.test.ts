// Must come first: Dexie captures the global `indexedDB` when it is imported.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DB_NAME, SudokuCoachDB, readSavePoint, writeSavePoint } from './db';
import { newGame, reduce, toStored } from './game';
import { createSavePointStore } from './savePoint';
import type { LiveGame } from './types';

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

let opened: SudokuCoachDB[] = [];
let counter = 0;

function freshDb(): SudokuCoachDB {
  const conn = new SudokuCoachDB(`${DB_NAME}-savepoint-${counter++}`);
  opened.push(conn);
  return conn;
}

afterEach(async () => {
  for (const conn of opened) await conn.delete();
  opened = [];
});

const game = (id: string): LiveGame =>
  newGame({ id, givens: PUZZLE, solution: SOLVED, difficulty: 'easy', at: 1000 });

const storeFor = (conn: SudokuCoachDB, now = () => 2000) =>
  createSavePointStore({ conn, now });

describe('the save point store', () => {
  it('writes the board through to storage, marks and all', async () => {
    const conn = freshDb();
    const store = storeFor(conn);
    const played = reduce(game('g1'), { type: 'addCandidate', cell: 2, digit: 4, at: 1100 });

    store.getState().save(played);
    await store.getState().flush();

    const stored = await readSavePoint('g1', conn);
    expect(stored?.updatedAt).toBe(2000);
    expect(stored?.cells[2].candidates).toEqual([4]);
  });

  it('keeps one per game: saving again replaces what was pinned', async () => {
    const conn = freshDb();
    let clock = 2000;
    const store = storeFor(conn, () => clock);

    store.getState().save(game('g1'));
    clock = 3000;
    store.getState().save(reduce(game('g1'), { type: 'setValue', cell: 2, digit: 4, at: 1100 }));
    await store.getState().flush();

    expect(await conn.savePoints.count()).toBe(1);
    expect(store.getState().point?.updatedAt).toBe(3000);
    expect((await readSavePoint('g1', conn))?.cells[2].value).toBe(4);
  });

  it('reads the stored point when it starts watching a game', async () => {
    const conn = freshDb();
    await writeSavePoint({ id: 'g1', updatedAt: 1500, cells: toStored(game('g1')).cells }, conn);
    const store = storeFor(conn);

    await store.getState().watch('g1');

    expect(store.getState().point?.updatedAt).toBe(1500);
  });

  it('never offers one game’s save point under another game’s board', async () => {
    // The state that would cause it is real: `watch` awaits a read, and the
    // previous game's point is sitting in the store for the whole of that
    // tick. Clearing before the read rather than after is what closes it.
    const conn = freshDb();
    await writeSavePoint({ id: 'g1', updatedAt: 1500, cells: toStored(game('g1')).cells }, conn);
    const store = storeFor(conn);
    await store.getState().watch('g1');

    const switching = store.getState().watch('g2');
    expect(store.getState().point).toBeNull();
    await switching;
    expect(store.getState().point).toBeNull();
  });

  it('re-reads on request, because sync can change what is stored under an open game', async () => {
    const conn = freshDb();
    const store = storeFor(conn);
    await store.getState().watch('g1');
    expect(store.getState().point).toBeNull();

    // What a download does behind the store's back.
    await writeSavePoint({ id: 'g1', updatedAt: 9000, cells: toStored(game('g1')).cells }, conn);

    await store.getState().watch('g1');
    expect(store.getState().point, 'the same id alone must not trigger a read').toBeNull();

    await store.getState().watch('g1', { reload: true });
    expect(store.getState().point?.updatedAt).toBe(9000);
  });

  it('forgets a point on request, on disk as well as on screen', async () => {
    const conn = freshDb();
    const store = storeFor(conn);
    store.getState().save(game('g1'));
    await store.getState().flush();

    store.getState().forget();
    await store.getState().flush();

    expect(store.getState().point).toBeNull();
    expect(await readSavePoint('g1', conn)).toBeUndefined();
  });
});
