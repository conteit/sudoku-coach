/**
 * The disclosure ladder (R7) and the coach surface the UI talks to.
 *
 * The product thesis is that the app never hands out a digit. That is not a
 * tone of voice, it is a property of this file: a hint is an authored template
 * filled with tokens drawn from a `Finding`, and the set of tokens available at
 * a level is `TOKENS_ALLOWED_BY_LEVEL`. Nothing else is ever substituted, so
 * the only way a level-2 hint could name a cell is if a lesson template asked
 * for `{cells}` — which the library test rejects — and even then the renderer
 * would leave the placeholder unfilled rather than resolve it.
 *
 * Three rules are worth stating because they are easy to erode:
 *
 * - **Nothing here reads a solution string.** Not the board's, not the game's.
 *   Every word of every hint comes from the finding. `triggers.ts` is the one
 *   module allowed to compare against a solution, and only to notice that an
 *   entry is wrong — never to say what the right one was.
 * - **Chain techniques never anchor to a house.** `xy_wing`, `simple_coloring`
 *   and `remote_pairs` populate `houses` with every house carrying a chain
 *   link, so any one of them is an arbitrary member of a set that can span six.
 *   Their templates use `{count}` alone, the renderer withholds `{house}` and
 *   `{house2}` from them, and `Hint.houses` stays empty so the UI cannot tint
 *   its way around the rule.
 * - **`Hint.houses` says no more than the copy does.** At levels 1-2 it carries
 *   only the houses the template actually names. A naked single's finding holds
 *   all three of its cell's houses; tinting row, column and box at level 1
 *   would put a spotlight on their single intersection, which is the cell —
 *   disclosure through the highlight channel rather than the text.
 */

import type { Digit, Finding } from '../engine/types';
import { Board } from '../engine/board';
import { firstFinding } from '../engine/solver';
import { interpolate } from '../i18n';
import type { CoachExchange, DisclosureLevel, Locale, PlayerProfile } from '../state/types';
import {
  hasReached,
  onHintedApplication,
  onMiss,
  onTaught,
  onUnaidedApplication,
} from '../state/mastery';
import type { CandidateReview, Coach, Hint, HintToken, LessonLibrary } from './types';
import { CHAIN_TECHNIQUES, TOKENS_ALLOWED_BY_LEVEL } from './types';
import { loadLessons } from './lessons';
import { reviewMarks } from './candidates';
import {
  type CoachCell,
  findingKey,
  formatCells,
  formatDigits,
  formatEliminations,
  formatHouse,
  houseRef,
  orderedHouses,
  placeholdersOf,
} from './format';

export type { CoachCell } from './format';
export { findingKey } from './format';

/** A rung of the ladder. Level 0 means "nothing asked for yet". */
export type HintLevel = 1 | 2 | 3 | 4;

export const MAX_LEVEL: HintLevel = 4;

const clampLevel = (level: DisclosureLevel): HintLevel =>
  (level < 1 ? 1 : level > MAX_LEVEL ? MAX_LEVEL : level) as HintLevel;

const isChain = (finding: Finding): boolean => CHAIN_TECHNIQUES.includes(finding.technique);

/**
 * The tokens a level may spend on this finding: the level's allowance, minus
 * the house tokens when the finding is a chain, minus anything the finding
 * cannot actually supply (a second house it does not have, an elimination list
 * it does not prove).
 */
function tokenValues(
  finding: Finding,
  level: HintLevel,
  locale: Locale,
): Record<string, string | number> {
  const allowed = new Set<HintToken>(TOKENS_ALLOWED_BY_LEVEL[String(level) as '1' | '2' | '3' | '4']);
  if (isChain(finding)) {
    allowed.delete('house');
    allowed.delete('house2');
  }
  const houses = orderedHouses(finding);
  const values: Record<string, string | number> = {};
  if (allowed.has('house') && houses[0]) values.house = formatHouse(locale, houses[0]);
  if (allowed.has('house2') && houses[1]) values.house2 = formatHouse(locale, houses[1]);
  if (allowed.has('digit') && finding.digits.length > 0) values.digit = finding.digits[0];
  if (allowed.has('digits') && finding.digits.length > 0) {
    values.digits = formatDigits(locale, finding.digits);
  }
  if (allowed.has('cells') && finding.cells.length > 0) {
    values.cells = formatCells(locale, finding.cells);
  }
  if (allowed.has('eliminations') && finding.eliminations.length > 0) {
    values.eliminations = formatEliminations(locale, finding.eliminations);
  }
  if (allowed.has('count')) values.count = finding.cells.length;
  return values;
}

/** Cells the UI may light up. Empty below level 3 — the contract says so. */
function spotlightFor(finding: Finding, level: HintLevel): number[] {
  if (level < 3) return [];
  const cells = new Set(finding.cells);
  // Level 4 states the eliminations, so the cells they land in are already part
  // of what has been said; showing them is what makes the argument followable.
  if (level === MAX_LEVEL) {
    for (const { cell } of finding.eliminations) cells.add(cell);
    for (const { cell } of finding.placements) cells.add(cell);
  }
  return [...cells].sort((a, b) => a - b);
}

function housesFor(
  finding: Finding,
  level: HintLevel,
  template: string,
): Hint['houses'] {
  if (isChain(finding)) return [];
  const houses = orderedHouses(finding);
  if (level >= 3) return houses.map(houseRef);
  const named = placeholdersOf(template);
  const tinted: Hint['houses'] = [];
  if (named.has('house') && houses[0]) tinted.push(houseRef(houses[0]));
  if (named.has('house2') && houses[1]) tinted.push(houseRef(houses[1]));
  return tinted;
}

export interface RenderHintInput {
  finding: Finding;
  level: DisclosureLevel;
  locale: Locale;
  /** Defaults to the shipped library for `locale`. */
  library?: LessonLibrary;
}

/**
 * Renders one rung. Pure and total: the same finding at the same level in the
 * same locale is the same hint, every time and on every device.
 *
 * A token the level does not permit is simply never supplied, so a template
 * asking for one would render its placeholder literally rather than leak. That
 * is a visible defect, not a disclosure — and `coach.test.ts` proves over both
 * shipped locales that no authored template ever takes that path.
 */
export function renderHint({ finding, level, locale, library }: RenderHintInput): Hint {
  const rung = clampLevel(level);
  const lessons = library ?? loadLessons(locale);
  const template = lessons[finding.technique].templates[String(rung) as '1' | '2' | '3' | '4'];
  return {
    technique: finding.technique,
    level: rung,
    text: interpolate(template, tokenValues(finding, rung, locale)),
    spotlight: spotlightFor(finding, rung),
    houses: housesFor(finding, rung, template),
    canEscalate: rung < MAX_LEVEL,
    findingKey: findingKey(finding),
  };
}

/* ------------------------------------------------------------------------ */
/* Ladder state                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Far above what a puzzle can produce — a solve path is a few dozen findings
 * and each contributes at most four exchanges — so trimming only ever bites a
 * player who has churned through hundreds of distinct patterns with undo. It is
 * here so a persisted game cannot grow without bound, not as a tuning knob.
 */
export const MAX_COACH_LOG = 500;

/** The deepest rung already taken for this finding; 0 when it is new. */
export const reachedLevel = (
  log: readonly CoachExchange[],
  key: string,
): DisclosureLevel =>
  log.reduce<DisclosureLevel>(
    (deepest, exchange) =>
      exchange.findingKey === key && exchange.level > deepest ? exchange.level : deepest,
    0,
  );

/**
 * What to show when the player asks for a hint. A finding they have already
 * been walked through resumes where they left it; a new one starts at the top
 * of the ladder. The level never rewinds, because `reachedLevel` is a maximum
 * over the log rather than a reading of its last entry.
 */
export const resumeLevel = (log: readonly CoachExchange[], key: string): HintLevel =>
  clampLevel(reachedLevel(log, key));

/** What "tell me more" shows: one rung deeper, capped at the last one. */
export const escalatedLevel = (log: readonly CoachExchange[], key: string): HintLevel =>
  clampLevel(Math.min(MAX_LEVEL, reachedLevel(log, key) + 1) as DisclosureLevel);

/**
 * Appends the exchange, unless that exact rung of that exact finding is already
 * recorded — re-reading a hint is not a new disclosure, and letting it append
 * would turn a re-read into log growth and into a second mastery event.
 */
export function recordExchange(
  log: readonly CoachExchange[],
  hint: Hint,
  at: number,
  offered = false,
): CoachExchange[] {
  if (log.some((e) => e.findingKey === hint.findingKey && e.level === hint.level)) {
    return [...log];
  }
  const next = [
    ...log,
    {
      at,
      technique: hint.technique,
      level: hint.level,
      findingKey: hint.findingKey,
      offered,
    } satisfies CoachExchange,
  ];
  return next.length > MAX_COACH_LOG ? next.slice(next.length - MAX_COACH_LOG) : next;
}

/* ------------------------------------------------------------------------ */
/* Mastery from observed play                                                */
/* ------------------------------------------------------------------------ */

/**
 * Whether the coach has already named the technique behind this finding.
 *
 * Level 1 is deliberately not enough: it points at a region and names nothing,
 * so a player who solves from it has not been handed the technique and their
 * next move still counts as unaided.
 */
export const wasHinted = (log: readonly CoachExchange[], key: string): boolean =>
  log.some((e) => e.findingKey === key && e.level >= 2);

/**
 * Mastery effect of showing `hint`, given the log as it stood *before* the
 * exchange was recorded.
 *
 * Naming a technique for the first time teaches it; naming one the player has
 * already been taught is a miss — the honest signal that the lesson has not
 * landed. Escalating from level 2 to 3 to 4 on the same finding is one event,
 * not three, so a curious player is not scored as a struggling one.
 */
export function masteryAfterHint(
  profile: PlayerProfile,
  log: readonly CoachExchange[],
  hint: Hint,
  at: number,
): PlayerProfile {
  if (hint.level < 2 || wasHinted(log, hint.findingKey)) return profile;
  return hasReached(profile, hint.technique, 'taught')
    ? onMiss(profile, hint.technique, at)
    : onTaught(profile, hint.technique, at);
}

/** True when the player's board already reflects everything `finding` proves. */
export function findingIsApplied(finding: Finding, cells: readonly CoachCell[]): boolean {
  for (const { cell, digit } of finding.placements) {
    if (cells[cell].value !== digit) return false;
  }
  for (const { cell, digit } of finding.eliminations) {
    if (cells[cell].candidates.has(digit)) return false;
  }
  return true;
}

export interface ObservedMove {
  profile: PlayerProfile;
  log: readonly CoachExchange[];
  /** The finding that was on the board before the move. */
  finding: Finding;
  before: readonly CoachCell[];
  after: readonly CoachCell[];
  at: number;
}

/**
 * Credits a move that completes the current finding's action.
 *
 * The guard is the transition, not the end state: a finding whose eliminations
 * were already absent — because the player keeps no pencil marks there — was
 * never applied by this move, and crediting it would hand out mastery for
 * doing nothing. Credit lands as unaided only when the technique was never
 * named for this finding; otherwise the player recognised it with help, which
 * is progress but not independence.
 */
export function masteryAfterMove({
  profile,
  log,
  finding,
  before,
  after,
  at,
}: ObservedMove): PlayerProfile {
  if (findingIsApplied(finding, before) || !findingIsApplied(finding, after)) return profile;
  return wasHinted(log, findingKey(finding))
    ? onHintedApplication(profile, finding.technique, at)
    : onUnaidedApplication(profile, finding.technique, at);
}

/* ------------------------------------------------------------------------ */
/* The Coach surface                                                         */
/* ------------------------------------------------------------------------ */

export interface CoachOptions {
  /** 81 cells: the placed digits and the player's own pencil marks. */
  cells: readonly CoachCell[];
  locale: Locale;
  /** Defaults to the shipped library for `locale`. */
  library?: LessonLibrary;
}

/**
 * A coach bound to one board snapshot.
 *
 * Detection runs against engine-computed candidates, never the player's marks:
 * a hint derived from notes the player got wrong would be a wrong hint, which
 * is the one failure mode the whole design exists to rule out. The board and
 * the finding are computed once and reused, because the UI asks for the same
 * finding again at every rung of the ladder.
 */
export function createCoach({ cells, locale, library }: CoachOptions): Coach {
  const board = Board.fromValues(cells.map((c) => c.value));
  const marks: readonly ReadonlySet<Digit>[] = cells.map((c) => c.candidates);
  const lessons = library ?? loadLessons(locale);
  let finding: Finding | null | undefined;

  return {
    nextFinding(): Finding | null {
      if (finding === undefined) finding = firstFinding(board);
      return finding;
    },
    hint(target: Finding, level: DisclosureLevel): Hint {
      return renderHint({ finding: target, level, locale, library: lessons });
    },
    reviewCandidates(): CandidateReview {
      return reviewMarks(board, marks, locale);
    },
  };
}
