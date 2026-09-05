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
    ]);
    expect(trail.map((s) => s.label)).toEqual(['unnoted', 'noted', 'cleared', 'placed']);
    expect(trail.map((s) => s.digit)).toEqual([8, 7, null, 4]);
  });

  it('caps the trail, because a long rewind is not a long list', () => {
    const many = Array.from({ length: MAX_TRAIL + 5 }, (_, i) => move(i, 'set', 1));
    expect(rewindTrail(many)).toHaveLength(MAX_TRAIL);
  });
});
