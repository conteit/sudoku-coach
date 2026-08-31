import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIFFICULTY_TECHNIQUES, TECHNIQUE_IDS } from '../engine/types';
import type { TechniqueId } from '../engine/types';
import type { MasteryStage, PlayerProfile } from './types';
import {
  DEFAULT_PROFILE, easiestLevelFor, edgeOfMastery, hasReached, masteryOf,
  onHintedApplication, onMiss, onTaught, onUnaidedApplication,
} from './mastery';

const T: TechniqueId = 'hidden_single';
const OTHER: TechniqueId = 'x_wing';

const STAGES: readonly MasteryStage[] = [
  'unseen', 'taught', 'recognized_with_hint', 'applied_unaided',
];

type Transition = (p: PlayerProfile, t: TechniqueId, at: number) => PlayerProfile;

const TRANSITIONS: readonly [string, Transition][] = [
  ['onTaught', onTaught],
  ['onHintedApplication', onHintedApplication],
  ['onUnaidedApplication', onUnaidedApplication],
  ['onMiss', onMiss],
];

/** Drives a profile to `stage` using only the public transitions. */
function at(stage: MasteryStage): PlayerProfile {
  switch (stage) {
    case 'unseen':
      return DEFAULT_PROFILE;
    case 'taught':
      return onTaught(DEFAULT_PROFILE, T, 100);
    case 'recognized_with_hint':
      return onHintedApplication(onTaught(DEFAULT_PROFILE, T, 100), T, 200);
    case 'applied_unaided':
      return onUnaidedApplication(onTaught(DEFAULT_PROFILE, T, 100), T, 200);
  }
}

describe('the default profile', () => {
  it('knows nothing and keeps the coaching defaults on', () => {
    expect(DEFAULT_PROFILE.mastery).toEqual({});
    expect(DEFAULT_PROFILE.locale).toBe('it');
    expect(DEFAULT_PROFILE.settings.highlightConflicts).toBe(true);
  });

  it('reports an unseen entry for a technique never encountered', () => {
    expect(masteryOf(DEFAULT_PROFILE, T)).toEqual({
      stage: 'unseen', applications: 0, misses: 0, lastSeenAt: 0,
    });
    expect(hasReached(DEFAULT_PROFILE, T, 'taught')).toBe(false);
    expect(hasReached(DEFAULT_PROFILE, T, 'unseen')).toBe(true);
  });
});

describe('transitions', () => {
  it('records a delivered lesson', () => {
    expect(masteryOf(onTaught(DEFAULT_PROFILE, T, 100), T)).toEqual({
      stage: 'taught', applications: 0, misses: 0, lastSeenAt: 100,
    });
  });

  it('promotes to recognized when the player acts on a hint', () => {
    const profile = onHintedApplication(at('taught'), T, 200);
    expect(masteryOf(profile, T)).toEqual({
      stage: 'recognized_with_hint', applications: 1, misses: 0, lastSeenAt: 200,
    });
  });

  it('promotes to applied_unaided when the player acts without a hint', () => {
    const profile = onUnaidedApplication(at('recognized_with_hint'), T, 300);
    expect(masteryOf(profile, T)).toEqual({
      stage: 'applied_unaided', applications: 2, misses: 0, lastSeenAt: 300,
    });
  });

  it('counts a miss without demoting the player', () => {
    const profile = onMiss(at('applied_unaided'), T, 400);
    expect(masteryOf(profile, T)).toEqual({
      stage: 'applied_unaided', applications: 1, misses: 1, lastSeenAt: 400,
    });
    expect(masteryOf(onMiss(profile, T, 500), T).misses).toBe(2);
  });

  it('lets an unaided application skip the middle stage entirely', () => {
    // A player who reads the lesson and immediately applies it has shown
    // mastery; making them go via a hint first would be theatre.
    expect(masteryOf(onUnaidedApplication(at('taught'), T, 200), T).stage).toBe('applied_unaided');
  });

  it('touches only the technique it is given', () => {
    const profile = onTaught(at('applied_unaided'), OTHER, 500);
    expect(masteryOf(profile, T).stage).toBe('applied_unaided');
    expect(masteryOf(profile, OTHER).stage).toBe('taught');
  });

  it('returns a new profile rather than mutating the old one', () => {
    const before = at('taught');
    const after = onUnaidedApplication(before, T, 300);
    expect(after).not.toBe(before);
    expect(masteryOf(before, T).stage).toBe('taught');
  });

  it('keeps the latest sighting when events arrive out of order', () => {
    expect(masteryOf(onMiss(onTaught(DEFAULT_PROFILE, T, 900), T, 100), T).lastSeenAt).toBe(900);
  });
});

describe('stages never regress', () => {
  it.each(
    STAGES.flatMap((stage) => TRANSITIONS.map(([name, fn]) => [stage, name, fn] as const)),
  )('%s survives %s', (stage, _name, fn) => {
    const before = at(stage);
    const after = fn(before, T, 999);
    expect(hasReached(after, T, stage)).toBe(true);
  });

  it('holds for any sequence of transitions on any technique', () => {
    const rank = (p: PlayerProfile, t: TechniqueId): number =>
      STAGES.indexOf(masteryOf(p, t).stage);

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            step: fc.integer({ min: 0, max: TRANSITIONS.length - 1 }),
            technique: fc.constantFrom(...TECHNIQUE_IDS),
            at: fc.integer({ min: 0, max: 10_000 }),
          }),
          { maxLength: 30 },
        ),
        (events) => {
          let profile = DEFAULT_PROFILE;
          for (const event of events) {
            const before = rank(profile, event.technique);
            profile = TRANSITIONS[event.step][1](profile, event.technique, event.at);
            expect(rank(profile, event.technique)).toBeGreaterThanOrEqual(before);
          }
          for (const entry of Object.values(profile.mastery)) {
            expect(entry.applications).toBeGreaterThanOrEqual(0);
            expect(entry.misses).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('the edge of mastery', () => {
  const withStages = (stages: Partial<Record<TechniqueId, MasteryStage>>): PlayerProfile => ({
    ...DEFAULT_PROFILE,
    mastery: Object.fromEntries(
      Object.entries(stages).map(([id, stage]) => [
        id,
        { stage, applications: 0, misses: 0, lastSeenAt: 0 },
      ]),
    ),
  });

  it('is the first technique never met, on a fresh profile', () => {
    expect(edgeOfMastery(DEFAULT_PROFILE)).toBe(TECHNIQUE_IDS[0]);
  });

  it('prefers something half-learned over something new', () => {
    const profile = withStages({ hidden_pair: 'taught' });
    expect(edgeOfMastery(profile)).toBe('hidden_pair');
  });

  it('takes the hardest half-learned one — the easy ones come along for free', () => {
    const profile = withStages({
      naked_pair: 'taught',
      x_wing: 'recognized_with_hint',
      swordfish: 'applied_unaided',
    });
    expect(edgeOfMastery(profile)).toBe('x_wing');
  });

  it('moves on to the next unmet technique once nothing is half-learned', () => {
    const profile = withStages({
      naked_single: 'applied_unaided',
      hidden_single: 'applied_unaided',
    });
    expect(edgeOfMastery(profile)).toBe(TECHNIQUE_IDS[2]);
  });

  it('has nothing to suggest to a player who has applied everything unaided', () => {
    const profile = withStages(
      Object.fromEntries(TECHNIQUE_IDS.map((id) => [id, 'applied_unaided' as MasteryStage])),
    );
    expect(edgeOfMastery(profile)).toBeNull();
  });
});

describe('easiestLevelFor', () => {
  it('practises a technique on the gentlest grid that can need it', () => {
    expect(easiestLevelFor('naked_single')).toBe('easy');
    expect(easiestLevelFor('hidden_pair')).toBe('medium');
    expect(easiestLevelFor('x_wing')).toBe('hard');
    expect(easiestLevelFor('swordfish')).toBe('expert');
  });

  it('names a level for every technique in the catalog', () => {
    for (const technique of TECHNIQUE_IDS) {
      expect(DIFFICULTY_TECHNIQUES[easiestLevelFor(technique)]).toContain(technique);
    }
  });
});
