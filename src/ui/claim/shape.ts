/**
 * Turning a pattern into the marks the board draws, per shape.
 *
 * Kept out of `Cell` so the cell stays ignorant of techniques, and out of the
 * views so the rule lives in one place — the same division `CoachPanel` keeps.
 */

import { MARK_ALT, MARK_DASHED, MARK_ON, MARK_TARGET } from '../board/patternMark';
import type { CellIndex, TechniqueId } from '../../engine/types';
import { CHAIN_TECHNIQUES } from '../../coach/types';

export type ClaimShape = 'set' | 'chain' | 'wing';

/**
 * Which of the three a technique draws as.
 *
 * Here rather than at a call site because there are three call sites — a claim
 * in progress, a lesson's worked example, and the practice grid — and Paolo
 * asked for exactly one visual language across them. A second copy of this
 * mapping is how the three drift apart.
 *
 * The wing is checked before the chain because `CHAIN_TECHNIQUES` counts
 * XY-Wing as one: it *is* a chain argument, but it is drawn as a hub and two
 * spokes rather than as a walk, which is what a shape is about.
 */
export const shapeOf = (technique: TechniqueId): ClaimShape =>
  technique === 'xy_wing' ? 'wing' : CHAIN_TECHNIQUES.includes(technique) ? 'chain' : 'set';

export interface Drawing {
  /** One bitfield per cell of the board, zero where there is no mark. */
  marks: number[];
  /** Links the technique claims, drawn between cells. */
  links: (readonly [CellIndex, CellIndex])[];
  /** Position in the chain, for the cells that have one. */
  order: Map<CellIndex, number>;
}

const empty = (): number[] => new Array(81).fill(0);

/**
 * `pivot` is known only once a claim has been checked — nobody is asked which
 * cell it is, because at most one of three can be. Until then an XY-Wing draws
 * as what the player actually said: three cells, one treatment.
 *
 * `targets` are the cells the pattern takes a digit away from. They are the
 * answer to "so what", and they are **level-4 content** (invariant 4), so a
 * caller that has not reached that rung passes none.
 */
export function drawingOf(
  shape: ClaimShape,
  cells: readonly CellIndex[],
  options: { pivot?: CellIndex | null; targets?: readonly CellIndex[] } = {},
): Drawing {
  const marks = empty();
  const order = new Map<CellIndex, number>();
  const links: (readonly [CellIndex, CellIndex])[] = [];

  if (shape === 'chain') {
    // Two colours, because that is what a colouring *is*. The number says
    // where in the order each cell falls; the overlay draws it as chrome,
    // never as a glyph that could be mistaken for a pencil mark.
    for (const [i, cell] of cells.entries()) {
      marks[cell] = MARK_ON | (i % 2 === 1 ? MARK_ALT : 0);
      order.set(cell, i + 1);
      if (i > 0) links.push([cells[i - 1], cell] as const);
    }
  } else if (shape === 'wing' && options.pivot != null) {
    for (const cell of cells) {
      const isPivot = cell === options.pivot;
      // The wings are dashed and the pivot is not. This is the distinction
      // with no colour of its own, so it takes the channel the colouring does
      // not need.
      marks[cell] = MARK_ON | (isPivot ? 0 : MARK_DASHED);
      if (!isPivot) links.push([options.pivot, cell] as const);
    }
  } else {
    // A fish's corners are interchangeable and an unchecked wing has no pivot
    // yet: one treatment, no links, no order. Numbering them would invent an
    // order the pattern does not have.
    for (const cell of cells) marks[cell] = MARK_ON;
  }

  for (const cell of options.targets ?? []) marks[cell] = MARK_ON | MARK_TARGET;
  return { marks, links, order };
}
