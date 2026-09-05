import { describe, expect, it } from 'vitest';
import type { Move } from '../state/types';
import { MAX_TRAIL, nextRewindPhase, rewindTrail } from './rewind';

const move = (cell: number, kind: Move['kind'], digit?: number, at = 1): Move =>
  ({ kind, cell, digit, prev: { value: null, candidates: [] }, at }) as Move;

describe('nextRewindPhase', () => {
  it('arms at a dead end', () => {
    expect(nextRewindPhase('off', { deadEnd: true, contradicted: true, canRedo: false })).toBe(
      'active',
    );
  });

  it('stays off while a wrong digit is on the board but the board still works', () => {
    // The contradiction nudge's job, not the rewind's: the player can still
    // play, and arming here would put the board in recovery every time a
    // digit went in wrong.
    expect(nextRewindPhase('off', { deadEnd: false, contradicted: true, canRedo: false })).toBe(
      'off',
    );
  });

  it('stays active while the wrong digit is still on the board', () => {
    expect(nextRewindPhase('active', { deadEnd: false, contradicted: true, canRedo: true })).toBe(
      'active',
    );
  });

  it('goes to done on the step that removes the wrong digit', () => {
    expect(nextRewindPhase('active', { deadEnd: false, contradicted: false, canRedo: true })).toBe(
      'done',
    );
  });

  it('holds done while the undone moves can still be restored', () => {
    expect(nextRewindPhase('done', { deadEnd: false, contradicted: false, canRedo: true })).toBe(
      'done',
    );
  });

  it('goes off when the undone moves are gone', () => {
    // Either the player redid them or they made a new move, which invalidates
    // the redo branch. Both mean the trail describes nothing restorable.
    expect(nextRewindPhase('done', { deadEnd: false, contradicted: false, canRedo: false })).toBe(
      'off',
    );
  });

  it('re-arms if a second mistake strands the board again', () => {
    expect(nextRewindPhase('done', { deadEnd: true, contradicted: true, canRedo: true })).toBe(
      'active',
    );
  });

  it('tells a rewound player nothing about a digit they probe with', () => {
    // The cell the whole machine exists to get right. `done` is a board that
    // plays: if a bare contradiction re-armed from here, the player could type
    // a digit into any cell and read the answer off the undo key — amber for
    // wrong, plain for right — undo the probe, repeat. That is a complete
    // solution oracle bought with one dead end, and this app never tells a
    // player whether a digit is right.
    expect(nextRewindPhase('done', { deadEnd: false, contradicted: true, canRedo: true })).toBe(
      'done',
    );
  });

  it('does not keep a probe alive once the trail it belongs to is gone', () => {
    // Same probe, after the redo branch has been spent. The contradiction is
    // still there and still says nothing: the trail is what `done` is for, and
    // without one there is nothing left to be in.
    expect(nextRewindPhase('done', { deadEnd: false, contradicted: true, canRedo: false })).toBe(
      'off',
    );
  });

  it('stays off on a board with nothing wrong with it', () => {
    // The resting cell, asserted so the table has no hole rather than because
    // it is interesting: every `off` row must reach `off` without a dead end.
    expect(nextRewindPhase('off', { deadEnd: false, contradicted: false, canRedo: true })).toBe(
      'off',
    );
  });
});

describe('rewindTrail', () => {
  it('reads newest first, which is the order the player walked back', () => {
    const trail = rewindTrail([move(10, 'set', 4), move(20, 'addCandidate', 7)]);
    expect(trail.map((s) => s.cell)).toEqual([20, 10]);
  });

  it('names what each move did', () => {
    const trail = rewindTrail([
      move(1, 'set', 4),
      move(2, 'clear'),
      move(3, 'addCandidate', 7),
      move(4, 'removeCandidate', 8),
      move(5, 'fillCandidates'),
      move(6, 'clearCandidates'),
    ]);
    expect(trail.map((s) => s.label)).toEqual([
      'unnotedAll',
      'notedAll',
      'unnoted',
      'noted',
      'cleared',
      'placed',
    ]);
    // The digit-less labels don't just happen to read undefined here — the
    // field isn't in the type for that shape, so a future call site can't
    // read it even if it tried.
    expect(trail.map((s) => ('digit' in s ? s.digit : null))).toEqual([
      null,
      null,
      8,
      7,
      null,
      4,
    ]);
  });

  it('caps the trail, because a long rewind is not a long list', () => {
    const many = Array.from({ length: MAX_TRAIL + 5 }, (_, i) => move(i, 'set', 1));
    expect(rewindTrail(many)).toHaveLength(MAX_TRAIL);
  });

  it('reads the digit-less label for a digit-bearing kind that somehow arrives without one, rather than inventing a digit', () => {
    // `Move.digit` is optional in the type for every kind — this shouldn't
    // happen for `set` in practice, but the fabrication this whole task
    // exists to rule out was exactly this shape of surprise.
    const trail = rewindTrail([move(9, 'set')]);
    expect(trail).toEqual([{ cell: 9, label: 'cleared' }]);
    expect('digit' in trail[0]).toBe(false);
  });
});
