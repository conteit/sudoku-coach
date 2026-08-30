// Must come first: Dexie captures the global `indexedDB` when it is imported.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { formatGrid } from '../engine/board';
import { Dexie } from 'dexie';
import type { Digit } from '../engine/types';
import {
  applySchema, db, DB_NAME, deleteGame, listSummaries, loadGame, loadProfile, saveGame,
  saveProfile, SCHEMA, SudokuCoachDB, toSummary,
} from './db';
import type { SchemaVersion } from './db';
import { newGame, reduce, toStored } from './game';
import { DEFAULT_PROFILE, onTaught } from './mastery';
import type { Game } from './types';

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

let opened: Dexie[] = [];
let counter = 0;

/** A private database per test: real IndexedDB semantics, no shared state. */
function freshDb(): SudokuCoachDB {
  const conn = new SudokuCoachDB(`${DB_NAME}-test-${counter++}`);
  opened.push(conn);
  return conn;
}

afterEach(async () => {
  for (const conn of opened) await conn.delete();
  opened = [];
});

/** A game with history in it: two placements, a candidate fill and an undo. */
function playedGame(id: string, at = 1000): Game {
  let game = newGame({ id, givens: PUZZLE, solution: SOLVED, difficulty: 'medium', at });
  game = reduce(game, { type: 'fillCandidates', at: at + 1 });
  game = reduce(game, { type: 'setValue', cell: 2, digit: 4, at: at + 2 });
  game = reduce(game, { type: 'setValue', cell: 3, digit: 6 as Digit, at: at + 3 });
  game = reduce(game, { type: 'undo', at: at + 4 });
  return toStored(game);
}

describe('schema', () => {
  it('declares one version with the indexes the game list queries', () => {
    expect(SCHEMA).toHaveLength(1);
    expect(SCHEMA[0].stores.games).toContain('updatedAt');
    expect(SCHEMA[0].stores.games).toContain('completedAt');
    expect(SCHEMA[0].stores.games).toContain('difficulty');
  });

  it('opens at the declared version with both stores', async () => {
    const conn = freshDb();
    await conn.open();
    expect(conn.verno).toBe(1);
    expect(conn.tables.map((t) => t.name).sort()).toEqual(['games', 'profile']);
  });

  it('names the app database', () => {
    expect(db.name).toBe(DB_NAME);
  });

  it('runs the upgrade path when a version is appended', async () => {
    const name = `${DB_NAME}-migration-${counter++}`;
    const v1 = new Dexie(name);
    applySchema(v1, SCHEMA);
    await v1.open();
    await v1.table('games').put(playedGame('legacy'));
    v1.close();

    // What appending `{ version: 2, ... }` to SCHEMA will look like.
    let upgraded = 0;
    const v2: SchemaVersion = {
      version: 2,
      stores: { games: 'id, updatedAt, completedAt, difficulty, createdAt' },
      upgrade: async (tx) => {
        upgraded = await tx
          .table<Game>('games')
          .toCollection()
          .modify((game) => {
            game.coachLog = [];
          });
      },
    };

    const next = new Dexie(name);
    applySchema(next, [...SCHEMA, v2]);
    opened.push(next);
    await next.open();

    expect(next.verno).toBe(2);
    expect(upgraded).toBe(1);
    expect(await next.table<Game>('games').get('legacy')).toBeDefined();
  });
});

describe('games', () => {
  it('round-trips a played game, undo stacks and all', async () => {
    const conn = freshDb();
    const game = playedGame('g1');
    await saveGame(game, conn);
    expect(await loadGame('g1', conn)).toEqual(game);
  });

  it('survives a closed connection, which is what a killed app looks like', async () => {
    const name = `${DB_NAME}-reopen-${counter++}`;
    const first = new SudokuCoachDB(name);
    const game = playedGame('g1');
    await saveGame(game, first);
    first.close();

    const second = new SudokuCoachDB(name);
    opened.push(second);
    const reloaded = await loadGame('g1', second);
    expect(reloaded).toEqual(game);
    expect(reloaded?.undoStack).toHaveLength(game.undoStack.length);
    expect(reloaded?.redoStack).toHaveLength(1);
  });

  it('overwrites in place rather than accumulating records', async () => {
    const conn = freshDb();
    await saveGame(playedGame('g1'), conn);
    await saveGame({ ...playedGame('g1'), updatedAt: 5000 }, conn);
    expect(await conn.games.count()).toBe(1);
    expect((await loadGame('g1', conn))?.updatedAt).toBe(5000);
  });

  it('deletes a game', async () => {
    const conn = freshDb();
    await saveGame(playedGame('g1'), conn);
    await deleteGame('g1', conn);
    expect(await loadGame('g1', conn)).toBeUndefined();
  });

  it('reports nothing for an unknown id', async () => {
    expect(await loadGame('nope', freshDb())).toBeUndefined();
  });
});

describe('the game list', () => {
  it('projects a summary without the move log', async () => {
    const conn = freshDb();
    const game = playedGame('g1');
    await saveGame(game, conn);
    const [summary] = await listSummaries(2000, conn);
    expect(summary).toEqual({
      id: 'g1',
      difficulty: 'medium',
      createdAt: 1000,
      updatedAt: game.updatedAt,
      completedAt: null,
      elapsedMs: 0,
      runningSince: null,
      progress: 2,
      moves: game.undoStack.length,
      givens: game.givens,
      board: formatGrid(game.cells.map((cell) => cell.value)),
    });
    expect(Object.keys(summary)).not.toContain('undoStack');
  });

  it('counts the clock of a game left running', () => {
    const running = { ...playedGame('g1'), elapsedMs: 5000, runningSince: 1000 };
    expect(toSummary(running, 3000).elapsedMs).toBe(7000);
  });

  it('lists the most recently played first', async () => {
    const conn = freshDb();
    await saveGame({ ...playedGame('old'), updatedAt: 10 }, conn);
    await saveGame({ ...playedGame('new'), updatedAt: 30 }, conn);
    await saveGame({ ...playedGame('mid'), updatedAt: 20 }, conn);
    expect((await listSummaries(0, conn)).map((s) => s.id)).toEqual(['new', 'mid', 'old']);
  });

  it('is empty on a first run', async () => {
    expect(await listSummaries(0, freshDb())).toEqual([]);
  });

  it('finds finished games by index, and leaves unfinished ones out of it', async () => {
    // IndexedDB cannot index `null`, so an in-progress game is absent from the
    // `completedAt` index entirely. That makes this query exact and
    // `orderBy('completedAt')` a trap; the module header says so too.
    const conn = freshDb();
    await saveGame(playedGame('open'), conn);
    await saveGame({ ...playedGame('done'), completedAt: 4242 }, conn);
    expect(await conn.games.where('completedAt').above(0).primaryKeys()).toEqual(['done']);
    expect(await conn.games.orderBy('completedAt').count()).toBe(1);
    expect(await conn.games.count()).toBe(2);
  });

  it('filters by difficulty through the index', async () => {
    const conn = freshDb();
    await saveGame({ ...playedGame('a'), difficulty: 'easy' }, conn);
    await saveGame({ ...playedGame('b'), difficulty: 'expert' }, conn);
    expect(await conn.games.where('difficulty').equals('expert').primaryKeys()).toEqual(['b']);
  });
});

describe('the player profile', () => {
  it('hands back the defaults on a first run without writing them', async () => {
    const conn = freshDb();
    expect(await loadProfile(conn)).toEqual(DEFAULT_PROFILE);
    expect(await conn.profile.count()).toBe(0);
  });

  it('round-trips mastery state under the singleton key', async () => {
    const conn = freshDb();
    const profile = onTaught(DEFAULT_PROFILE, 'x_wing', 500);
    await saveProfile(profile, conn);
    expect(await loadProfile(conn)).toEqual(profile);
    expect(await conn.profile.count()).toBe(1);
  });

  it('stays a singleton however it is saved', async () => {
    const conn = freshDb();
    await saveProfile({ ...DEFAULT_PROFILE, id: 'profile' }, conn);
    await saveProfile({ ...DEFAULT_PROFILE, locale: 'en' }, conn);
    expect(await conn.profile.count()).toBe(1);
    expect((await loadProfile(conn)).locale).toBe('en');
  });
});
