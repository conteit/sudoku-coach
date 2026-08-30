/**
 * Basic fish: X-Wing (N=2) and Swordfish (N=3).
 *
 * Take N rows in which a digit has only 2..N possible columns. If between them
 * those rows cover exactly N distinct columns, then the digit occupies each of
 * those N rows once and therefore fills all N columns — so no other cell in
 * those columns can hold it. Transposing rows and columns gives the mirror
 * case, which is why the search runs twice with the axes swapped.
 *
 * The base rows must be *exactly* N so the pigeonhole is tight; allowing a row
 * with a single home would be a hidden single, handled earlier and far cheaper.
 */

import type { BoardView, CellIndex, Detector, Elimination, House, TechniqueId } from '../types';
import { DIGITS } from '../types';
import { COLS, colOf, ROWS, rowOf } from '../board';
import { buildFinding, cellsWithCandidate, combinations } from './util';

interface Orientation {
  base: readonly House[];
  cover: readonly House[];
  /** Index of the cover house a cell falls in. */
  coverOf: (cell: CellIndex) => number;
}

/** Rows covered by columns, then columns covered by rows. */
const ORIENTATIONS: readonly Orientation[] = [
  { base: ROWS, cover: COLS, coverOf: colOf },
  { base: COLS, cover: ROWS, coverOf: rowOf },
];

function fish(technique: TechniqueId, n: number): Detector {
  return {
    id: technique,
    detect(board: BoardView) {
      for (const digit of DIGITS) {
        for (const { base, cover, coverOf } of ORIENTATIONS) {
          const homes = new Map<House, CellIndex[]>();
          for (const house of base) {
            const spots = cellsWithCandidate(board, house, digit);
            if (spots.length >= 2 && spots.length <= n) homes.set(house, spots);
          }
          if (homes.size < n) continue;
          for (const combo of combinations([...homes.keys()], n)) {
            const cells = combo.flatMap((h) => homes.get(h) ?? []);
            const lines = new Set(cells.map(coverOf));
            if (lines.size !== n) continue;
            const inFish = new Set(cells);
            const covers = [...lines].sort((a, b) => a - b).map((i) => cover[i]);
            const eliminations: Elimination[] = [];
            for (const house of covers) {
              for (const cell of house.cells) {
                if (inFish.has(cell)) continue;
                if (board.trueCandidates(cell).has(digit)) eliminations.push({ cell, digit });
              }
            }
            const finding = buildFinding({
              technique,
              digits: [digit],
              cells,
              houses: [...combo, ...covers],
              eliminations,
            });
            if (finding) return finding;
          }
        }
      }
      return null;
    },
  };
}

export const xWing = fish('x_wing', 2);
export const swordfish = fish('swordfish', 3);
