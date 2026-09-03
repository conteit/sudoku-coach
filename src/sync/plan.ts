/**
 * What a sync should do, decided without touching the network or the disk.
 *
 * This is the whole of sync's judgement, deliberately pulled out of the code
 * that performs it. Everything here is a pure function of two indexes and two
 * sets of tombstones, so the cases that actually go wrong — a deletion racing
 * a play, a game that exists on neither side any more, a tombstone that a
 * later play should outrank — are unit tests rather than a manual experiment
 * with two devices and a stopwatch.
 *
 * **The rule is newest wins, per whole game** (Paolo's call, spec slice 3).
 * Not per cell, not per move: the later `updatedAt` replaces the earlier
 * record entirely. It is predictable and it can never invent a board that
 * neither device had — the cost, which Settings says out loud, is that the
 * device you played on last wins and the other version is gone.
 *
 * A deletion is dated like anything else and competes on the same terms. A
 * tombstone beats a record older than it; a play *newer* than the tombstone
 * beats the tombstone. That is not a special case bolted on, it is the same
 * comparison, and it means two devices that disagree about whether a game
 * exists settle it the same way they settle its contents.
 */

/** When each record was last written, by id. Absent means "not here". */
export type RecordIndex = Readonly<Record<string, number>>;

export interface SyncInputs {
  localGames: RecordIndex;
  remoteGames: RecordIndex;
  localTombstones: RecordIndex;
  remoteTombstones: RecordIndex;
  /** 0 when the profile has never been written on this side. */
  localProfileAt: number;
  remoteProfileAt: number;
}

export type ProfileMove = 'upload' | 'download' | 'none';

export interface SyncPlan {
  /** Local is newer: push the whole game. */
  upload: readonly string[];
  /** Remote is newer: pull the whole game. */
  download: readonly string[];
  /** A tombstone outranks the local copy. */
  dropLocal: readonly string[];
  /** A tombstone outranks the remote copy. */
  dropRemote: readonly string[];
  profile: ProfileMove;
  /**
   * The tombstones both sides should hold after this sync. A tombstone that a
   * newer play has outranked is *not* here: keeping it would mean re-deleting
   * the resurrected game on every future sync.
   */
  tombstones: RecordIndex;
}

/** Absent is older than anything that exists, including a zero timestamp. */
const at = (index: RecordIndex, id: string): number =>
  Object.hasOwn(index, id) ? index[id] : Number.NEGATIVE_INFINITY;

const idsOf = (...indexes: readonly RecordIndex[]): string[] => [
  ...new Set(indexes.flatMap((index) => Object.keys(index))),
];

export function planSync(inputs: SyncInputs): SyncPlan {
  const upload: string[] = [];
  const download: string[] = [];
  const dropLocal: string[] = [];
  const dropRemote: string[] = [];
  const tombstones: Record<string, number> = {};

  const ids = idsOf(
    inputs.localGames,
    inputs.remoteGames,
    inputs.localTombstones,
    inputs.remoteTombstones,
  );

  for (const id of ids) {
    const local = at(inputs.localGames, id);
    const remote = at(inputs.remoteGames, id);
    const deleted = Math.max(at(inputs.localTombstones, id), at(inputs.remoteTombstones, id));

    // Strictly newer, so a deletion and a save that share a millisecond leave
    // the game standing. Losing a board to a tie is worse than keeping one.
    if (deleted > local && deleted > remote) {
      tombstones[id] = deleted;
      if (local !== Number.NEGATIVE_INFINITY) dropLocal.push(id);
      if (remote !== Number.NEGATIVE_INFINITY) dropRemote.push(id);
      continue;
    }

    // Equal timestamps are the ordinary case for a game that has not been
    // touched since the last sync, and mean there is nothing to do.
    if (local > remote) upload.push(id);
    else if (remote > local) download.push(id);
  }

  const profile =
    inputs.localProfileAt > inputs.remoteProfileAt
      ? 'upload'
      : inputs.remoteProfileAt > inputs.localProfileAt
        ? 'download'
        : 'none';

  return {
    upload: upload.sort(),
    download: download.sort(),
    dropLocal: dropLocal.sort(),
    dropRemote: dropRemote.sort(),
    profile,
    tombstones,
  };
}

/** True when a plan would move nothing — the common case, and worth skipping. */
export const isEmptyPlan = (plan: SyncPlan): boolean =>
  plan.upload.length === 0 &&
  plan.download.length === 0 &&
  plan.dropLocal.length === 0 &&
  plan.dropRemote.length === 0 &&
  plan.profile === 'none';
