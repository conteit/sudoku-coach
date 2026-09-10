/**
 * What each cell of a pattern is doing.
 *
 * A `Finding` carries its evidence as one flat `cells` list, which is all the
 * detectors need and all a hint template asks for. An exercise needs more: to
 * ask a player to point at the hinge of an XY-Wing and then at its arms is to
 * ask them for the thing the technique is actually about, and one undivided
 * list cannot pose that question.
 *
 * So this is a decomposition, not new evidence. Every cell here comes from
 * `finding.cells` and no cell is added or dropped — a property test pins that
 * — because a role that invented a cell would be a wrong hint wearing a
 * different hat.
 *
 * Most techniques have one role and that is honest rather than lazy: the four
 * cells of an x-wing are interchangeable, and inventing "first corner" and
 * "second corner" would teach an order the pattern does not have. Only
 * XY-Wing genuinely divides, which is why it is the example everyone reaches
 * for when explaining what a role is.
 */

import type { CellIndex, Digit, Finding, TechniqueId } from '../engine/types';

export type RoleId = 'cell' | 'pattern' | 'corners' | 'pivot' | 'wings' | 'chain';

export interface PatternRole {
  id: RoleId;
  cells: CellIndex[];
}

/** The single role each technique's cells play, where there is only one. */
const SINGLE_ROLE: Record<TechniqueId, RoleId> = {
  naked_single: 'cell',
  hidden_single: 'cell',
  naked_pair: 'pattern',
  hidden_pair: 'pattern',
  pointing: 'pattern',
  claiming: 'pattern',
  naked_triple: 'pattern',
  hidden_triple: 'pattern',
  naked_quad: 'pattern',
  x_wing: 'corners',
  swordfish: 'corners',
  // Divided below; the entry is the fallback when the division cannot be read.
  xy_wing: 'pattern',
  simple_coloring: 'chain',
  remote_pairs: 'chain',
};

/**
 * Pivot and pincers, told apart by the digit the wing eliminates.
 *
 * Not by geometry: the pivot is usually the cell that sees both others, but
 * all three can sit in one house, and then "sees both" picks out all three.
 * The candidates are exact instead. An XY-Wing eliminates the digit its two
 * pincers share, and `wings.ts` only builds one when that digit is absent
 * from the pivot — so the pivot is the pattern cell whose marks lack it, and
 * there is exactly one.
 */
function xyWingRoles(finding: Finding, marks: ReadonlyMap<CellIndex, ReadonlySet<Digit>>) {
  const digit = finding.eliminations[0]?.digit;
  if (digit === undefined) return null;

  const pivots = finding.cells.filter((cell) => marks.get(cell)?.has(digit) === false);
  if (pivots.length !== 1) return null;

  return [
    { id: 'pivot' as const, cells: pivots },
    { id: 'wings' as const, cells: finding.cells.filter((cell) => cell !== pivots[0]) },
  ];
}

/**
 * The roles of a finding's cells, in the order an exercise should ask for them.
 *
 * `marks` is the candidate state the pattern was found in — the exercise's own
 * pre-filled marks, not the board's basic candidates, since those are a
 * superset the pattern may not even exist in (see `engine/exercise.ts`). A
 * division that cannot be read off them falls back to one undivided role,
 * which is a worse question but never a wrong one.
 */
export function patternRoles(
  finding: Finding,
  marks: ReadonlyMap<CellIndex, ReadonlySet<Digit>>,
): PatternRole[] {
  if (finding.technique === 'xy_wing') {
    const divided = xyWingRoles(finding, marks);
    if (divided !== null) return divided;
  }
  return [{ id: SINGLE_ROLE[finding.technique], cells: [...finding.cells] }];
}

/** The marks of an exercise position, in the shape `patternRoles` reads. */
export const marksOf = (candidates: readonly (readonly Digit[])[]): Map<CellIndex, Set<Digit>> =>
  new Map(candidates.map((digits, cell) => [cell as CellIndex, new Set(digits)]));
