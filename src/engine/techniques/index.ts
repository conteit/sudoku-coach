/**
 * The ordered detector catalog.
 *
 * `CATALOG` is in `TECHNIQUE_IDS` order, cheapest and most teachable first.
 * That order is load-bearing twice over: the solver takes the first detector
 * that fires, and the difficulty rating is the hardest technique the solve path
 * needed (spec §5.4). Reordering it changes what every puzzle is worth, so the
 * ordering is asserted against `TECHNIQUE_IDS` in the tests rather than left to
 * the reader to keep in sync.
 */

import type { Detector, TechniqueId } from '../types';
import { TECHNIQUE_IDS } from '../types';
import { hiddenSingle, nakedSingle } from './singles';
import { hiddenPair, hiddenTriple, nakedPair, nakedQuad, nakedTriple } from './subsets';
import { claiming, pointing } from './intersections';
import { swordfish, xWing } from './fish';
import { xyWing } from './wings';
import { simpleColoring } from './coloring';
import { remotePairs } from './remotePairs';

export const CATALOG: readonly Detector[] = Object.freeze([
  nakedSingle,
  hiddenSingle,
  nakedPair,
  hiddenPair,
  pointing,
  claiming,
  nakedTriple,
  hiddenTriple,
  nakedQuad,
  xWing,
  xyWing,
  swordfish,
  simpleColoring,
  remotePairs,
]);

/** Catalog position, i.e. how hard a technique is relative to the others. */
export const rankOf = (id: TechniqueId): number => TECHNIQUE_IDS.indexOf(id);

/** The harder of two techniques by catalog rank. */
export const harderOf = (a: TechniqueId, b: TechniqueId): TechniqueId =>
  rankOf(a) >= rankOf(b) ? a : b;

export const DETECTORS: Readonly<Record<TechniqueId, Detector>> = Object.freeze(
  Object.fromEntries(CATALOG.map((d) => [d.id, d])) as Record<TechniqueId, Detector>,
);

export { chainComponents, pathHouses, shortestPath } from './chain';
export type { ChainComponent, Color, Link } from './chain';
export { buildFinding, cellsWithCandidate, combinations, commonPeers, unionCandidates } from './util';
export { hiddenSingle, nakedSingle };
export { hiddenPair, hiddenTriple, nakedPair, nakedQuad, nakedTriple };
export { claiming, pointing };
export { swordfish, xWing };
export { xyWing };
export { simpleColoring };
export { remotePairs };
