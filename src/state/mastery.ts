/**
 * Per-technique mastery state machine (spec §5.5).
 *
 *   unseen -> taught -> recognized_with_hint -> applied_unaided
 *
 * The stages answer one question — how much scaffolding does this player still
 * need for this technique — and the coach reads them to decide whether to open
 * a lesson, offer a nudge, or stay quiet. Two rules make that reading safe:
 *
 * - **Stages only ever advance.** A player who once applied a technique unaided
 *   has demonstrated something that a later bad day cannot un-demonstrate.
 *   Demoting them would re-run a lesson they have already earned their way out
 *   of, which reads as the app forgetting who they are.
 * - **Misses are counted, not punished.** Asking for a hint on a technique
 *   already taught is the honest signal that the teaching has not landed yet, so
 *   it increments `misses` and leaves the stage alone. The coach can use a high
 *   miss count to re-offer a lesson without the state machine lying about what
 *   the player has managed before.
 *
 * Every function is pure and returns a new profile: the store owns persistence,
 * and a transition that mutated in place would defeat structural sharing in the
 * React tree.
 */

import { DIFFICULTIES, DIFFICULTY_TECHNIQUES, TECHNIQUE_IDS } from '../engine/types';
import type { Difficulty, TechniqueId } from '../engine/types';
import type { MasteryEntry, MasteryStage, PlayerProfile } from './types';

/** Rank of each stage; the machine may only move to a strictly higher one. */
const RANK: Record<MasteryStage, number> = {
  unseen: 0,
  taught: 1,
  recognized_with_hint: 2,
  applied_unaided: 3,
};

export const DEFAULT_PROFILE: PlayerProfile = {
  id: 'profile',
  mastery: {},
  locale: 'it',
  settings: {
    highlightConflicts: true,
    theme: 'system',
    haptics: true,
    highlightMatchingNotes: false,
    // The board as it has always drawn itself; these exist to be turned off.
    highlightMatches: true,
    highlightPeers: true,
    markDeadNotes: true,
    colorEntries: true,
    // Invariant 1: the app does not edit a player's marks unless asked to.
    autoClearDeadNotes: false,
    // Off because it takes something away — one digit at a time is the point.
    sweepOneDigit: false,
  },
};

const UNSEEN: MasteryEntry = { stage: 'unseen', applications: 0, misses: 0, lastSeenAt: 0 };

/** The entry for a technique, or the zero entry for one never encountered. */
export const masteryOf = (profile: PlayerProfile, technique: TechniqueId): MasteryEntry =>
  profile.mastery[technique] ?? UNSEEN;

/** True once the player has reached at least `stage` for this technique. */
export const hasReached = (
  profile: PlayerProfile,
  technique: TechniqueId,
  stage: MasteryStage,
): boolean => RANK[masteryOf(profile, technique).stage] >= RANK[stage];

/**
 * Applies one transition. `stage` is a floor, not an assignment, and
 * `lastSeenAt` takes the later of the two timestamps so an event replayed out
 * of order cannot rewind the record.
 */
function transition(
  profile: PlayerProfile,
  technique: TechniqueId,
  at: number,
  stage: MasteryStage,
  delta: { applications?: number; misses?: number },
): PlayerProfile {
  const entry = masteryOf(profile, technique);
  const next: MasteryEntry = {
    stage: RANK[stage] > RANK[entry.stage] ? stage : entry.stage,
    applications: entry.applications + (delta.applications ?? 0),
    misses: entry.misses + (delta.misses ?? 0),
    lastSeenAt: Math.max(entry.lastSeenAt, at),
  };
  return { ...profile, mastery: { ...profile.mastery, [technique]: next } };
}

/** A lesson was delivered. First contact with the technique. */
export const onTaught = (profile: PlayerProfile, technique: TechniqueId, at: number): PlayerProfile =>
  transition(profile, technique, at, 'taught', {});

/**
 * The player carried out the finding's action after being shown a hint. They
 * recognised the pattern with help, which is progress but not yet independence.
 */
export const onHintedApplication = (
  profile: PlayerProfile,
  technique: TechniqueId,
  at: number,
): PlayerProfile => transition(profile, technique, at, 'recognized_with_hint', { applications: 1 });

/**
 * The player made a taught technique's elimination or placement without asking
 * for a hint. This is the only evidence of real mastery the app can observe, so
 * it is the only path to `applied_unaided`.
 */
export const onUnaidedApplication = (
  profile: PlayerProfile,
  technique: TechniqueId,
  at: number,
): PlayerProfile => transition(profile, technique, at, 'applied_unaided', { applications: 1 });

/**
 * The player asked for a hint on a technique already taught. Counted, never
 * demoted (see the header): the stage records the best they have shown, the
 * miss count records how much they still lean on the coach.
 */
export const onMiss = (profile: PlayerProfile, technique: TechniqueId, at: number): PlayerProfile =>
  transition(profile, technique, at, 'unseen', { misses: 1 });

/* -------------------------------------------------------------------------- */
/* Choosing what to practise                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The technique at the edge of this player's mastery — what a puzzle chosen
 * *for* them should require (spec §5.5, the learning metric in §7).
 *
 * Two cases, in this order:
 *
 * 1. Something has been taught but not yet applied unaided. That is the edge:
 *    they have met it, they have not owned it, and another encounter is worth
 *    more than meeting something new. The **hardest** such technique wins,
 *    because the catalog is ordered by difficulty and the easier ones will keep
 *    turning up on their own in any puzzle that needs the hard one.
 * 2. Nothing is half-learned, so the edge is the next technique they have never
 *    met — the **first** unseen one, for the same reason in reverse.
 *
 * Null when there is nothing left to practise: every technique applied unaided
 * is a player who does not need to be handed a puzzle.
 */
export function edgeOfMastery(profile: PlayerProfile): TechniqueId | null {
  let halfLearned: TechniqueId | null = null;
  let unseen: TechniqueId | null = null;

  for (const technique of TECHNIQUE_IDS) {
    const { stage } = masteryOf(profile, technique);
    if (stage === 'taught' || stage === 'recognized_with_hint') halfLearned = technique;
    else if (stage === 'unseen' && unseen === null) unseen = technique;
  }

  return halfLearned ?? unseen;
}

/**
 * The gentlest difficulty whose solve paths are allowed to need `technique`.
 *
 * Practising a hidden pair on an expert grid means finding it among four other
 * patterns you cannot read yet; the point is to meet the technique, not to
 * survive everything above it.
 */
export function easiestLevelFor(technique: TechniqueId): Difficulty {
  const level = DIFFICULTIES.find((difficulty) =>
    DIFFICULTY_TECHNIQUES[difficulty].includes(technique),
  );
  // Every technique appears in `expert` by construction, so this is total.
  return level ?? 'expert';
}
