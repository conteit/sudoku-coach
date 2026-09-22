/**
 * The coach's finding, as something the board can draw.
 *
 * Out of `GameView` because it is a rule rather than a rendering: the
 * disclosure ladder decides what may be shown, and a rule that lives in a
 * `useMemo` is a rule nothing can test directly.
 *
 * Paolo, repeatedly, about colouring: "it is not clear how the chain is
 * created". A flat ring on every cell is why — it says *these five* and
 * nothing about which alternates with which, or what joins them.
 */

import { Board } from '../engine/board';
import { chainShapeOf } from '../coach/chainShape';
import { patternRoles } from '../coach/roles';
import { drawingOf, shapeOf, type Drawing } from '../ui/claim/shape';
import type { Digit, Finding } from '../engine/types';

/**
 * Null below level 3, and that is the ladder, not a convenience: withholding
 * the cells is the entire meaning of the rungs beneath it (invariant 4). The
 * amber targets wait for level 4, where the coach may state what a pattern
 * eliminates.
 */
export function hintDrawing(
  finding: Finding | null,
  level: number,
  values: readonly (Digit | null)[],
): Drawing | null {
  if (finding === null || level < 3) return null;

  const shape = shapeOf(finding.technique);
  const board = Board.fromValues(values);
  // The engine's own view of the candidates, never the player's notes: a role
  // read off marks that may be wrong is a role that may be wrong.
  const marks = new Map(finding.cells.map((cell) => [cell, board.trueCandidates(cell)]));
  const pivot = patternRoles(finding, marks).find((role) => role.id === 'pivot')?.cells[0] ?? null;

  return drawingOf(shape, finding.cells, {
    pivot,
    chain: shape === 'chain' ? chainShapeOf(board, finding.digits[0], finding.cells) : null,
    targets: level >= 4 ? finding.eliminations.map((elimination) => elimination.cell) : [],
  });
}
