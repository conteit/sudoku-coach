/**
 * What the coach was asked for over one game, read back out of its own log.
 *
 * It lives with the coach rather than with the screen that shows it, because
 * every rule in it is a coaching rule: what counts as one thing the player got
 * stuck on, and what may be named afterwards.
 */

import type { TechniqueId } from '../engine/types';
import type { CoachExchange, DisclosureLevel } from '../state/types';

export interface CoachRecap {
  /**
   * Distinct findings the player asked about. Climbing one finding from rung 1
   * to rung 4 is one thing they got stuck on; counting the exchanges would tell
   * them they leaned on the coach four times when they leaned once.
   */
  findings: number;
  /** The deepest rung taken over the whole game. */
  deepest: DisclosureLevel;
  /**
   * Techniques disclosed at level 2 or deeper, in the order they were first
   * named. Level 1 names nothing, and listing a technique the player only ever
   * saw at level 1 would disclose after the fact what that rung held back.
   */
  named: TechniqueId[];
}

export function recap(log: readonly CoachExchange[]): CoachRecap {
  const findings = new Set<string>();
  const named: TechniqueId[] = [];
  let deepest: DisclosureLevel = 0;

  for (const exchange of log) {
    findings.add(exchange.findingKey);
    if (exchange.level > deepest) deepest = exchange.level;
    if (exchange.level >= 2 && !named.includes(exchange.technique)) named.push(exchange.technique);
  }

  return { findings: findings.size, deepest, named };
}
