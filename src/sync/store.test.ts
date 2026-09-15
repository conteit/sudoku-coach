// Must come first: Dexie captures the global `indexedDB` when it is imported.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_NAME, SudokuCoachDB, readSyncRecord } from '../state/db';
import { useAccount } from '../state/account';
import { DriveError } from './drive';

const syncOnce = vi.hoisted(() => vi.fn());
vi.mock('./engine', () => ({ syncOnce }));

// The game store is mocked rather than run for real: what matters here is
// whether the sync store *asks* it to catch up, and how many times — not
// what catching up does once asked, which is `state/store.test.ts`'s job.
const refreshSummaries = vi.hoisted(() => vi.fn());
const refreshGames = vi.hoisted(() => vi.fn());
vi.mock('../state/store', () => ({
  useGameStore: { getState: () => ({ refreshSummaries, refreshGames }) },
}));

// Same reasoning for the save point store: the question here is whether a
// snapshot that arrived for the game on screen makes the sync store go back
// and re-read it. `watching` stands in for "this game is open".
const watchSavePoint = vi.hoisted(() => vi.fn());
const watching = vi.hoisted(() => ({ gameId: null as string | null }));
vi.mock('../state/savePoint', () => ({
  useSavePoint: { getState: () => ({ gameId: watching.gameId, watch: watchSavePoint }) },
}));

const { createSyncStore, forgetGrant } = await import('./store');

/**
 * The states Settings renders, and the two rules underneath them.
 *
 * One: sync is silent. Every failure below ends as a *state*, never a throw
 * that reaches a caller who would have to decide what to show. Two: the token
 * is not in the store. The app can write a diagnostic report of its own state
 * and invites players to paste it into a bug report, so a bearer token for
 * someone's Drive must never be somewhere that report can reach.
 */

let opened: SudokuCoachDB[] = [];
let counter = 0;

const device = (): SudokuCoachDB => {
  const conn = new SudokuCoachDB(`${DB_NAME}-syncstore-${counter++}`);
  opened.push(conn);
  return conn;
};

const grant = { token: 'secret-token', expiresAt: 9_000_000 };

const storeWith = (
  conn: SudokuCoachDB,
  getGrant = vi.fn().mockResolvedValue(grant),
  available = true,
  offline = false,
) =>
  createSyncStore({
    conn,
    now: () => 1000,
    available: () => available,
    getGrant,
    offline: () => offline,
  });

/** A no-op outcome: the shape `syncOnce` returns when the plan was empty. */
const EMPTY_OUTCOME = {
  at: 1000,
  uploaded: 0,
  downloaded: 0,
  removedLocal: 0,
  removedRemote: 0,
  profile: 'none' as const,
  downloadedIds: [],
  droppedLocalIds: [],
  savePointIds: [],
};

beforeEach(() => {
  forgetGrant();
  syncOnce.mockReset();
  syncOnce.mockResolvedValue(EMPTY_OUTCOME);
  refreshSummaries.mockReset();
  refreshSummaries.mockResolvedValue(undefined);
  refreshGames.mockReset();
  refreshGames.mockResolvedValue(undefined);
  watchSavePoint.mockReset();
  watchSavePoint.mockResolvedValue(undefined);
  watching.gameId = null;
  useAccount.setState({ account: { uid: 'u1', email: 'a@b.c', displayName: null } });
});

afterEach(async () => {
  for (const conn of opened) await conn.delete();
  opened = [];
  useAccount.setState({ account: null });
});

describe('the sync store', () => {
  it('is off until the player turns it on', async () => {
    const conn = device();
    const useStore = storeWith(conn);

    await useStore.getState().hydrate();

    expect(useStore.getState().status).toBe('off');
    expect(syncOnce).not.toHaveBeenCalled();
  });

  it('remembers the switch across a reload, and syncs on the way in', async () => {
    const conn = device();
    await storeWith(conn).getState().enable();

    // A second store over the same database is what a reload looks like.
    const reloaded = storeWith(conn);
    await reloaded.getState().hydrate();

    expect(reloaded.getState().enabled).toBe(true);
    expect(reloaded.getState().status).toBe('idle');
    expect((await readSyncRecord(conn)).enabled).toBe(true);
  });

  it('records when the sync finished', async () => {
    const useStore = storeWith(device());
    await useStore.getState().enable();

    expect(useStore.getState().lastSyncedAt).toBe(1000);
    expect(useStore.getState().status).toBe('idle');
  });

  it('asks in person once, and silently after that', async () => {
    const getGrant = vi.fn().mockResolvedValue(grant);
    const useStore = storeWith(device(), getGrant);

    await useStore.getState().enable();
    expect(getGrant).toHaveBeenCalledWith('consent', 'a@b.c');

    // The held grant is still good, so the second run asks Google for nothing.
    await useStore.getState().syncNow();
    expect(getGrant).toHaveBeenCalledTimes(1);
  });

  it('rests in "consent" when Google will not issue a token', async () => {
    const useStore = storeWith(device(), vi.fn().mockResolvedValue(null));

    await useStore.getState().enable();

    expect(useStore.getState().status).toBe('consent');
    expect(syncOnce).not.toHaveBeenCalled();
  });

  it('drops a token Drive rejects, rather than retrying it', async () => {
    const getGrant = vi.fn().mockResolvedValue(grant);
    const useStore = storeWith(device(), getGrant);
    syncOnce.mockRejectedValueOnce(new DriveError(401, 'expired'));

    await useStore.getState().enable();
    expect(useStore.getState().status).toBe('consent');

    // The next attempt must go and get a new one, not reuse the dead one.
    await useStore.getState().syncNow();
    expect(getGrant).toHaveBeenCalledTimes(2);
  });

  it('treats anything else as "not now", keeping the token', async () => {
    const getGrant = vi.fn().mockResolvedValue(grant);
    const useStore = storeWith(device(), getGrant);
    syncOnce.mockRejectedValueOnce(new Error('offline'));

    await useStore.getState().enable();

    expect(useStore.getState().status).toBe('error');
    await useStore.getState().syncNow();
    expect(getGrant).toHaveBeenCalledTimes(1);
  });

  it('never throws at the caller — a failed sync is a state', async () => {
    const useStore = storeWith(device());
    syncOnce.mockRejectedValue(new Error('offline'));

    await expect(useStore.getState().enable()).resolves.toBeUndefined();
    await expect(useStore.getState().syncNow()).resolves.toBeUndefined();
  });

  it('does nothing while signed out', async () => {
    const useStore = storeWith(device());
    await useStore.getState().enable();
    syncOnce.mockClear();

    useAccount.setState({ account: null });
    await useStore.getState().syncNow();

    expect(syncOnce).not.toHaveBeenCalled();
    expect(useStore.getState().status).toBe('off');
  });

  it('keeps the preference when a session ends', async () => {
    const useStore = storeWith(device());
    await useStore.getState().enable();

    useStore.getState().forget();

    expect(useStore.getState().enabled).toBe(true);
    expect(useStore.getState().status).toBe('off');
  });

  it('forgets the preference only when the player switches it off', async () => {
    const conn = device();
    const useStore = storeWith(conn);
    await useStore.getState().enable();

    await useStore.getState().disable();

    expect(useStore.getState().enabled).toBe(false);
    expect((await readSyncRecord(conn)).enabled).toBe(false);
  });

  it('runs one sync at a time', async () => {
    // Two concurrent runs would race each other's writes to the same manifest,
    // and the loser's uploads would be recorded as never having happened.
    let running = 0;
    let overlapped = false;
    syncOnce.mockImplementation(async () => {
      running += 1;
      if (running > 1) overlapped = true;
      await Promise.resolve();
      running -= 1;
      return EMPTY_OUTCOME;
    });

    const useStore = storeWith(device());
    await useStore.getState().enable();
    await Promise.all([useStore.getState().syncNow(), useStore.getState().syncNow()]);

    expect(overlapped).toBe(false);
  });

  describe('with no network', () => {
    it('does not ask Google for anything', async () => {
      // The point of the whole exercise. Asking for a token is the one thing
      // sync does that can put a popup in front of someone, and offline it can
      // only fail — so a player on a train is never asked to sign in again.
      const getGrant = vi.fn().mockResolvedValue(grant);
      const useStore = storeWith(device(), getGrant, true, true);

      await useStore.getState().enable();

      expect(getGrant).not.toHaveBeenCalled();
      expect(syncOnce).not.toHaveBeenCalled();
    });

    it('rests in "offline", which is neither a failure nor a consent problem', async () => {
      // Kept out of both so they keep meaning something: `error` is a real
      // failure, `consent` is Google refusing a token. Absorbing "no network"
      // into either would make both unactionable.
      const useStore = storeWith(device(), vi.fn().mockResolvedValue(grant), true, true);

      await useStore.getState().enable();

      expect(useStore.getState().status).toBe('offline');
    });

    it('remembers the switch, so coming back needs no decision', async () => {
      const conn = device();
      const useStore = storeWith(conn, vi.fn().mockResolvedValue(grant), true, true);

      await useStore.getState().enable();

      expect(useStore.getState().enabled).toBe(true);
      expect((await readSyncRecord(conn)).enabled).toBe(true);
    });

    it('still refuses to sync when the player is signed out', async () => {
      const useStore = storeWith(device(), vi.fn().mockResolvedValue(grant), true, true);
      await useStore.getState().enable();

      useAccount.setState({ account: null });
      await useStore.getState().syncNow();

      expect(useStore.getState().status).toBe('off');
    });
  });

  it('keeps the access token out of anything that can be serialised', async () => {
    const useStore = storeWith(device());
    await useStore.getState().enable();

    expect(JSON.stringify(useStore.getState())).not.toContain(grant.token);
  });

  describe('what changed', () => {
    it('holds the ids a sync actually pulled from the remote', async () => {
      syncOnce.mockResolvedValue({
        ...EMPTY_OUTCOME,
        downloaded: 2,
        downloadedIds: ['g1', 'g2'],
      });
      const useStore = storeWith(device());

      await useStore.getState().enable();

      expect(useStore.getState().changed).toEqual(new Set(['g1', 'g2']));
    });

    it('stays empty after a sync that downloaded nothing', async () => {
      const useStore = storeWith(device());

      await useStore.getState().enable();

      expect(useStore.getState().changed.size).toBe(0);
    });

    it('drops an id the same sync deleted locally, so the toast cannot claim it arrived', async () => {
      // Sync 1 pulls g1 while the player is in the library, where the toast
      // is not mounted — so nothing announces it and it sits in `changed`.
      syncOnce.mockResolvedValue({ ...EMPTY_OUTCOME, downloaded: 1, downloadedIds: ['g1'] });
      const useStore = storeWith(device());
      await useStore.getState().enable();
      expect(useStore.getState().changed).toEqual(new Set(['g1']));

      // The other device then deletes g1, and sync 2 applies that deletion:
      // the game is gone from the library. Announcing "1 game was updated
      // from another device" now would be a claim about nothing.
      syncOnce.mockResolvedValue({ ...EMPTY_OUTCOME, removedLocal: 1, droppedLocalIds: ['g1'] });
      await useStore.getState().syncNow();

      expect(useStore.getState().changed.size).toBe(0);
    });

    it('seen(id) removes one id and leaves the rest', async () => {
      syncOnce.mockResolvedValue({
        ...EMPTY_OUTCOME,
        downloaded: 2,
        downloadedIds: ['g1', 'g2'],
      });
      const useStore = storeWith(device());
      await useStore.getState().enable();

      useStore.getState().seen('g1');

      expect(useStore.getState().changed).toEqual(new Set(['g2']));
    });

    it('announce() marks the current changed ids as announced', async () => {
      syncOnce.mockResolvedValue({
        ...EMPTY_OUTCOME,
        downloaded: 2,
        downloadedIds: ['g1', 'g2'],
      });
      const useStore = storeWith(device());
      await useStore.getState().enable();

      useStore.getState().announce();

      expect(useStore.getState().announced).toEqual(new Set(['g1', 'g2']));
      // announce() is a receipt, not a clear: what was pulled is still pulled.
      expect(useStore.getState().changed).toEqual(new Set(['g1', 'g2']));
    });

    it('announce() replaces the receipt rather than growing it, pruning ids seen() already dropped', async () => {
      syncOnce.mockResolvedValue({
        ...EMPTY_OUTCOME,
        downloaded: 2,
        downloadedIds: ['g1', 'g2'],
      });
      const useStore = storeWith(device());
      await useStore.getState().enable();

      useStore.getState().announce();
      useStore.getState().seen('g1');
      useStore.getState().announce();

      // g1 left `changed` via seen(), so the second announce() must not carry
      // it forward — a set() rather than a union() is what keeps `announced`
      // bounded by `changed` instead of accreting ids nothing reads again.
      expect(useStore.getState().announced).toEqual(new Set(['g2']));
    });

    it('asks the game store to catch up exactly once after a sync that applied something', async () => {
      syncOnce.mockResolvedValue({
        ...EMPTY_OUTCOME,
        downloaded: 1,
        downloadedIds: ['g1'],
      });
      const useStore = storeWith(device());

      await useStore.getState().enable();

      expect(refreshSummaries).toHaveBeenCalledTimes(1);
      expect(refreshGames).toHaveBeenCalledTimes(1);
      expect(refreshGames).toHaveBeenCalledWith(['g1']);
    });

    it('re-reads the save point when a snapshot arrived for the game on screen', async () => {
      watching.gameId = 'g1';
      syncOnce.mockResolvedValue({ ...EMPTY_OUTCOME, savePointIds: ['g1'] });
      const useStore = storeWith(device());

      await useStore.getState().enable();

      // Forced: the game id has not changed, only what is stored under it, so
      // a plain watch() would see the id it already has and do nothing.
      expect(watchSavePoint).toHaveBeenCalledWith('g1', { reload: true });
    });

    it('leaves the open game alone when the snapshot that moved was another game\'s', async () => {
      watching.gameId = 'g1';
      syncOnce.mockResolvedValue({ ...EMPTY_OUTCOME, savePointIds: ['g2'] });
      const useStore = storeWith(device());

      await useStore.getState().enable();

      expect(watchSavePoint).not.toHaveBeenCalled();
    });

    it('counts a save point as something applied, so the catch-up is not skipped', async () => {
      // `appliedSomething` gates every refresh below it. A sync whose only
      // movement was a snapshot used to look exactly like a no-op.
      watching.gameId = 'g1';
      syncOnce.mockResolvedValue({ ...EMPTY_OUTCOME, savePointIds: ['g1'] });
      const useStore = storeWith(device());

      await useStore.getState().enable();

      expect(refreshSummaries).toHaveBeenCalledTimes(1);
    });

    it('does not ask the game store to catch up after a no-op sync', async () => {
      const useStore = storeWith(device());

      await useStore.getState().enable();

      expect(refreshSummaries).not.toHaveBeenCalled();
      expect(refreshGames).not.toHaveBeenCalled();
    });

    it('catches up on an upload-only sync too, even with nothing to download', async () => {
      // `changed` is specifically "pulled from elsewhere", but the library
      // list still needs a repaint — an upload can be paired with a remote
      // deletion elsewhere in the same plan, and either way "applied
      // something" is the catch-up trigger, not "downloaded something".
      syncOnce.mockResolvedValue({ ...EMPTY_OUTCOME, uploaded: 1 });
      const useStore = storeWith(device());

      await useStore.getState().enable();

      expect(refreshSummaries).toHaveBeenCalledTimes(1);
      expect(refreshGames).toHaveBeenCalledWith([]);
      expect(useStore.getState().changed.size).toBe(0);
    });
  });
});

/**
 * Safari will not renew the Drive permission through Google's hidden iframe —
 * its tracking prevention drops the cookie behind it — so the silent path
 * fails there on every load while the same account renews silently in Chrome.
 * Nothing is withdrawn and nothing is lost, so this must not look like a
 * fault; and the button that fixes it has to be allowed to ask in person, or
 * it is inert in exactly the browser that shows it.
 */
describe('a browser that will not renew silently', () => {
  it('rests in "paused" when a silent renewal comes back empty, without asking anyone', async () => {
    const conn = device();
    await storeWith(conn).getState().enable();
    // An hour later, or a reload: the held token is gone.
    forgetGrant();

    const getGrant = vi.fn().mockResolvedValue(null);
    const useStore = storeWith(conn, getGrant);
    await useStore.getState().hydrate();

    expect(getGrant.mock.calls.map((call) => call[0])).toEqual(['']);
    expect(useStore.getState().status).toBe('paused');
  });

  it('asks in person when a press finds the silent path closed', async () => {
    const getGrant = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grant);
    const useStore = storeWith(device(), getGrant);
    useStore.setState({ enabled: true });

    await useStore.getState().syncNow({ ask: true });

    // Silent first — in a browser where that works, nobody sees a popup.
    expect(getGrant.mock.calls.map((call) => call[0])).toEqual(['', 'consent']);
    expect(useStore.getState().status).toBe('idle');
  });

  it('calls it consent only when someone was actually asked and said no', async () => {
    const getGrant = vi.fn().mockResolvedValue(null);
    const useStore = storeWith(device(), getGrant);
    useStore.setState({ enabled: true });

    await useStore.getState().syncNow({ ask: true });

    expect(getGrant.mock.calls.map((call) => call[0])).toEqual(['', 'consent']);
    expect(useStore.getState().status).toBe('consent');
  });

  it('never puts a popup in front of work nobody pressed for', async () => {
    const getGrant = vi.fn().mockResolvedValue(null);
    const useStore = storeWith(device(), getGrant);
    useStore.setState({ enabled: true });

    await useStore.getState().syncNow();

    expect(getGrant.mock.calls.map((call) => call[0])).toEqual(['']);
    expect(useStore.getState().status).toBe('paused');
  });
});
