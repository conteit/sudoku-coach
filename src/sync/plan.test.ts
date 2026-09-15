/**
 * The planner is the part of sync that can be wrong quietly, so it is the part
 * pinned hardest.
 *
 * The cases below are the ones that cost data rather than the ones that are
 * easy to write: a deletion racing a play, a tombstone a later play outranks,
 * and the tie. The property at the end is the claim that matters more than any
 * single case — run the plan and the two sides agree, whatever they started
 * from.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isEmptyPlan, planSync, type RecordIndex, type SyncInputs } from './plan';

const inputs = (patch: Partial<SyncInputs> = {}): SyncInputs => ({
  localGames: {},
  remoteGames: {},
  localTombstones: {},
  remoteTombstones: {},
  localProfileAt: 0,
  remoteProfileAt: 0,
  localSavePoints: {},
  remoteSavePoints: {},
  ...patch,
});

describe('save points in the plan', () => {
  it('pushes one the remote has never seen, and pulls a newer one', () => {
    expect(planSync(inputs({ localSavePoints: { a: 5 } })).savePoints.upload).toEqual(['a']);
    // And a plan that moves only a save point is not an empty plan. Without
    // this the engine would skip the whole run — `isEmptyPlan` is the gate —
    // and a save point on its own would never leave the device.
    expect(isEmptyPlan(planSync(inputs({ localSavePoints: { a: 5 } })))).toBe(false);
    expect(
      planSync(inputs({ localSavePoints: { a: 5 }, remoteSavePoints: { a: 9 } })).savePoints
        .download,
    ).toEqual(['a']);
  });

  it('is nothing to do when the two sides already agree', () => {
    const plan = planSync(inputs({ localSavePoints: { a: 5 }, remoteSavePoints: { a: 5 } }));
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('goes from both sides when the game it belongs to is deleted', () => {
    const plan = planSync(
      inputs({
        localGames: { a: 1 },
        remoteGames: { a: 1 },
        localTombstones: { a: 9 },
        localSavePoints: { a: 5 },
        remoteSavePoints: { a: 5 },
      }),
    );

    expect(plan.dropLocal).toEqual(['a']);
    expect(plan.savePoints.dropLocal).toEqual(['a']);
    expect(plan.savePoints.dropRemote).toEqual(['a']);
  });

  it('survives a deletion that a later play outranked', () => {
    // The case that rules out comparing a snapshot's date with a tombstone's.
    // The game was deleted on one device at 9 and played on another at 12, so
    // the game lives — and its save point, taken at 5 and therefore "older
    // than the deletion", has to live with it.
    const plan = planSync(
      inputs({
        localGames: { a: 12 },
        remoteTombstones: { a: 9 },
        localSavePoints: { a: 5 },
        remoteSavePoints: { a: 5 },
      }),
    );

    expect(plan.dropLocal).toEqual([]);
    expect(plan.savePoints.dropLocal).toEqual([]);
    expect(plan.savePoints.dropRemote).toEqual([]);
  });
});

describe('planSync', () => {
  it('does nothing when both sides already agree', () => {
    const plan = planSync(inputs({ localGames: { a: 5 }, remoteGames: { a: 5 } }));
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('pushes a game the remote has never seen', () => {
    const plan = planSync(inputs({ localGames: { a: 5 } }));
    expect(plan.upload).toEqual(['a']);
    expect(plan.download).toEqual([]);
  });

  it('pulls a game played on another device', () => {
    const plan = planSync(inputs({ localGames: { a: 5 }, remoteGames: { a: 9 } }));
    expect(plan.download).toEqual(['a']);
    expect(plan.upload).toEqual([]);
  });

  it('lets the later save replace the earlier one whole, in either direction', () => {
    expect(planSync(inputs({ localGames: { a: 9 }, remoteGames: { a: 5 } })).upload).toEqual(['a']);
    expect(planSync(inputs({ localGames: { a: 5 }, remoteGames: { a: 9 } })).download).toEqual(['a']);
  });

  describe('deletions', () => {
    it('removes the remote copy a local deletion outranks', () => {
      const plan = planSync(
        inputs({ remoteGames: { a: 5 }, localTombstones: { a: 7 } }),
      );
      expect(plan.dropRemote).toEqual(['a']);
      expect(plan.download).toEqual([]);
      expect(plan.tombstones).toEqual({ a: 7 });
    });

    it('removes the local copy a remote deletion outranks', () => {
      const plan = planSync(inputs({ localGames: { a: 5 }, remoteTombstones: { a: 7 } }));
      expect(plan.dropLocal).toEqual(['a']);
      expect(plan.upload).toEqual([]);
    });

    it('does not resurrect a game deleted on the other device', () => {
      // The failure this exists to prevent: without a tombstone the remote
      // simply lacks the game, which is indistinguishable from never having
      // received it — so it would be uploaded again, every sync, forever.
      const plan = planSync(inputs({ localGames: { a: 5 }, remoteTombstones: { a: 7 } }));
      expect(plan.upload).toEqual([]);
    });

    it('keeps the tombstone once both copies are gone, so a third device learns of it', () => {
      const plan = planSync(inputs({ localTombstones: { a: 7 } }));
      expect(plan.dropLocal).toEqual([]);
      expect(plan.dropRemote).toEqual([]);
      expect(plan.tombstones).toEqual({ a: 7 });
    });

    it('lets a play newer than the deletion win, and forgets the tombstone', () => {
      // Not a special case: the deletion is dated and it lost. Keeping the
      // tombstone here would re-delete the game on every future sync.
      const plan = planSync(inputs({ localGames: { a: 9 }, remoteTombstones: { a: 7 } }));
      expect(plan.upload).toEqual(['a']);
      expect(plan.dropLocal).toEqual([]);
      expect(plan.tombstones).toEqual({});
    });

    it('keeps the board when a deletion and a save share a millisecond', () => {
      // A tie has to break towards the data. Losing a puzzle to clock
      // granularity is a bug the player cannot undo.
      const plan = planSync(inputs({ localGames: { a: 7 }, remoteTombstones: { a: 7 } }));
      expect(plan.dropLocal).toEqual([]);
      expect(plan.tombstones).toEqual({});
    });

    it('takes the later of two disagreeing tombstones', () => {
      const plan = planSync(
        inputs({ localTombstones: { a: 3 }, remoteTombstones: { a: 8 } }),
      );
      expect(plan.tombstones).toEqual({ a: 8 });
    });
  });

  describe('the profile', () => {
    it('moves towards whichever side wrote it last', () => {
      expect(planSync(inputs({ localProfileAt: 9, remoteProfileAt: 5 })).profile).toBe('upload');
      expect(planSync(inputs({ localProfileAt: 5, remoteProfileAt: 9 })).profile).toBe('download');
      expect(planSync(inputs({ localProfileAt: 5, remoteProfileAt: 5 })).profile).toBe('none');
    });

    it('is uploaded on a first sync, when the remote has none', () => {
      expect(planSync(inputs({ localProfileAt: 1 })).profile).toBe('upload');
    });
  });

  describe('whatever the two sides hold', () => {
    const index = (): fc.Arbitrary<RecordIndex> =>
      fc.dictionary(fc.constantFrom('a', 'b', 'c'), fc.integer({ min: 1, max: 6 }));

    const anyInputs = (): fc.Arbitrary<SyncInputs> =>
      fc.record({
        localGames: index(),
        remoteGames: index(),
        localTombstones: index(),
        remoteTombstones: index(),
        localProfileAt: fc.integer({ min: 0, max: 6 }),
        remoteProfileAt: fc.integer({ min: 0, max: 6 }),
        localSavePoints: index(),
        remoteSavePoints: index(),
      });

    it('never asks for two contradictory things about one game', () => {
      fc.assert(
        fc.property(anyInputs(), (given) => {
          const plan = planSync(given);
          // Upload and download are opposites; a game being dropped is not
          // also being moved. Any overlap is a plan that fights itself.
          expect(new Set(plan.upload).size + new Set(plan.download).size).toBe(
            new Set([...plan.upload, ...plan.download]).size,
          );
          for (const id of [...plan.dropLocal, ...plan.dropRemote]) {
            expect(plan.upload).not.toContain(id);
            expect(plan.download).not.toContain(id);
          }
        }),
      );
    });

    it('leaves both sides holding the same games — the point of the exercise', () => {
      fc.assert(
        fc.property(anyInputs(), (given) => {
          const plan = planSync(given);

          const local = { ...given.localGames };
          const remote = { ...given.remoteGames };
          for (const id of plan.upload) remote[id] = local[id];
          for (const id of plan.download) local[id] = remote[id];
          for (const id of plan.dropLocal) delete local[id];
          for (const id of plan.dropRemote) delete remote[id];

          expect(local).toEqual(remote);
        }),
      );
    });

    it('settles: running the plan again finds nothing left to do', () => {
      fc.assert(
        fc.property(anyInputs(), (given) => {
          const plan = planSync(given);

          const local = { ...given.localGames };
          const remote = { ...given.remoteGames };
          for (const id of plan.upload) remote[id] = local[id];
          for (const id of plan.download) local[id] = remote[id];
          for (const id of plan.dropLocal) delete local[id];
          for (const id of plan.dropRemote) delete remote[id];

          // Save points converge on the same terms, and the property has to
          // carry them or a planner that never settled a snapshot would still
          // pass: `isEmptyPlan` counts their four lists too.
          const localPoints = { ...given.localSavePoints };
          const remotePoints = { ...given.remoteSavePoints };
          for (const id of plan.savePoints.upload) remotePoints[id] = localPoints[id];
          for (const id of plan.savePoints.download) localPoints[id] = remotePoints[id];
          for (const id of plan.savePoints.dropLocal) delete localPoints[id];
          for (const id of plan.savePoints.dropRemote) delete remotePoints[id];

          const profileAt = Math.max(given.localProfileAt, given.remoteProfileAt);
          const second = planSync({
            localGames: local,
            remoteGames: remote,
            localTombstones: plan.tombstones,
            remoteTombstones: plan.tombstones,
            localProfileAt: profileAt,
            remoteProfileAt: profileAt,
            localSavePoints: localPoints,
            remoteSavePoints: remotePoints,
          });

          expect(isEmptyPlan(second)).toBe(true);
        }),
      );
    });
  });
});
