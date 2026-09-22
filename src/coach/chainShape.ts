/**
 * The shape of a chain the *coach* found, for drawing.
 *
 * A claim the player builds is a walk: they tap cell after cell, so the order
 * is real and the board can number it. A chain the engine finds is not. It is
 * a connected component of the conjugate-pair graph — it can branch, and its
 * cells arrive in ascending order, which is no order at all as far as the
 * argument goes. Numbering it would invent a sequence the pattern does not
 * have, which is the same mistake a fish's corners are spared.
 *
 * What it does have, and what a player needs to see, is the two-colouring and
 * the links: *these* cells alternate with *those*, joined here, here and here.
 * Neither survives in `Finding` — it carries the cells and the houses, not the
 * pairs — and `engine/types.ts` is a frozen contract. So this re-derives them
 * from the board, which is cheap and needs no coordinated change: the links
 * are the houses in which the digit has exactly two homes, restricted to the
 * cells the finding names.
 */

import { HOUSES } from '../engine/board';
import { chainComponents, type Link } from '../engine/techniques/chain';
import { cellsWithCandidate } from '../engine/techniques/util';
import type { Board } from '../engine/board';
import type { CellIndex, Digit } from '../engine/types';

export interface ChainShape {
  /** The cells wearing the second colour. The first is everything else. */
  alt: CellIndex[];
  /** The conjugate pairs joining them, as the board should draw them. */
  links: (readonly [CellIndex, CellIndex])[];
}

/**
 * Null when the cells do not form one two-colourable component on this digit
 * — which should not happen for a finding the engine produced, and is exactly
 * why it is checked rather than assumed. A caller that gets null draws the
 * cells plainly, which is a weaker picture and never a wrong one.
 */
export function chainShapeOf(
  board: Board,
  digit: Digit,
  cells: readonly CellIndex[],
): ChainShape | null {
  const member = new Set(cells);
  const links: Link[] = [];
  for (const house of HOUSES) {
    const spots = cellsWithCandidate(board, house, digit);
    if (spots.length === 2 && member.has(spots[0]) && member.has(spots[1])) {
      links.push({ a: spots[0], b: spots[1], house });
    }
  }

  const components = chainComponents(links);
  if (components.length !== 1) return null;
  const [component] = components;
  if (!component.bipartite) return null;
  // Every cell of the finding has to be in it, or the picture would show a
  // chain the finding is not actually about.
  if (component.cells.length !== member.size) return null;

  return {
    alt: component.cells.filter((cell) => component.color.get(cell) === 1),
    links: component.links.map((link) => [link.a, link.b] as const),
  };
}
