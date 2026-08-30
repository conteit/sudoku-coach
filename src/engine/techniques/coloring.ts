/**
 * Simple colouring (single-digit chains of conjugate pairs).
 *
 * A conjugate pair is a house in which a digit has exactly two homes: one of
 * them holds it, the other does not. Chaining conjugate pairs and two-colouring
 * the result splits a component into colour A and colour B, one of which is
 * entirely true and the other entirely false. Two conclusions follow, and this
 * detector reports whichever it meets first:
 *
 * - Colour trap: if two cells of the *same* colour share a house they cannot
 *   both hold the digit, so that colour is the false one — clear the digit from
 *   every cell wearing it.
 * - Colour wing: a cell outside the chain that sees both colours cannot hold
 *   the digit, because one of the two colours is true.
 *
 * Components of fewer than three cells are skipped. A lone conjugate pair
 * carries no information the box/line intersections have not already used, and
 * a hint saying "colouring" for it would teach the wrong lesson.
 */

import type { BoardView, CellIndex, Detector, Digit, Elimination } from '../types';
import { DIGITS } from '../types';
import { CELL_COUNT, HOUSES } from '../board';
import type { Color, Link } from './chain';
import { chainComponents } from './chain';
import { buildFinding, cellsWithCandidate } from './util';

const MIN_CHAIN = 3;

/** Every house in which `digit` has exactly two homes. */
function conjugatePairs(board: BoardView, digit: Digit): Link[] {
  const links: Link[] = [];
  for (const house of HOUSES) {
    const spots = cellsWithCandidate(board, house, digit);
    if (spots.length === 2) links.push({ a: spots[0], b: spots[1], house });
  }
  return links;
}

export const simpleColoring: Detector = {
  id: 'simple_coloring',
  detect(board) {
    for (const digit of DIGITS) {
      const links = conjugatePairs(board, digit);
      if (links.length === 0) continue;
      for (const component of chainComponents(links)) {
        if (!component.bipartite || component.cells.length < MIN_CHAIN) continue;
        const wearing = (c: Color): CellIndex[] =>
          component.cells.filter((cell) => component.color.get(cell) === c);
        const evidence = {
          digits: [digit],
          cells: component.cells,
          houses: component.links.map((l) => l.house),
        };

        // Colour trap: same colour twice in one house condemns that colour.
        const member = new Set(component.cells);
        for (const house of HOUSES) {
          const inHouse = house.cells.filter((c) => member.has(c));
          for (const color of [0, 1] as const) {
            if (inHouse.filter((c) => component.color.get(c) === color).length < 2) continue;
            const finding = buildFinding({
              ...evidence,
              technique: 'simple_coloring',
              houses: [...evidence.houses, house],
              eliminations: wearing(color).map((cell) => ({ cell, digit })),
            });
            if (finding) return finding;
          }
        }

        // Colour wing: seeing both colours means seeing the true one.
        const [colorA, colorB] = [wearing(0), wearing(1)];
        const eliminations: Elimination[] = [];
        for (let cell = 0; cell < CELL_COUNT; cell++) {
          if (member.has(cell) || !board.trueCandidates(cell).has(digit)) continue;
          const seen = new Set(board.peers(cell));
          if (colorA.some((c) => seen.has(c)) && colorB.some((c) => seen.has(c))) {
            eliminations.push({ cell, digit });
          }
        }
        const finding = buildFinding({
          ...evidence, technique: 'simple_coloring', eliminations,
        });
        if (finding) return finding;
      }
    }
    return null;
  },
};
