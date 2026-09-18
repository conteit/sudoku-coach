/**
 * Turning a claim into the one drawing language, per shape. Kept out of the
 * overlay so that the overlay stays ignorant of techniques, and out of the
 * view so the rule lives in one place.
 */

import type { CellIndex } from '../../engine/types';
import type { PatternNode } from './PatternOverlay';

export type ClaimShape = 'set' | 'chain' | 'wing';

export interface Drawing {
  nodes: PatternNode[];
  links: (readonly [CellIndex, CellIndex])[];
}

/**
 * `pivot` is known only once a claim has been checked — nobody asks the player
 * which cell it is, because at most one of three can be. Until then an
 * XY-Wing draws as what the player has actually said: three cells, one tone.
 */
export function drawingOf(
  shape: ClaimShape,
  cells: readonly CellIndex[],
  pivot: CellIndex | null = null,
): Drawing {
  if (shape === 'chain') {
    return {
      // Alternating, because that is what a colouring *is* — and the same two
      // tones an XY-Wing uses, so two tones means the same thing everywhere.
      nodes: cells.map((cell, i) => ({ cell, tone: i % 2 === 0 ? 'a' : 'b' })),
      links: cells.slice(1).map((cell, i) => [cells[i], cell] as const),
    };
  }
  if (shape === 'wing' && pivot !== null) {
    return {
      nodes: cells.map((cell) => ({ cell, tone: cell === pivot ? 'b' : 'a' })),
      links: cells.filter((cell) => cell !== pivot).map((wing) => [pivot, wing] as const),
    };
  }
  // A fish's corners are interchangeable and an unchecked wing has no pivot
  // yet: one tone, no links, nothing implied that the player did not say.
  return { nodes: cells.map((cell) => ({ cell, tone: 'a' as const })), links: [] };
}
