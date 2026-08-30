/**
 * Naked and hidden subsets — the two duals of the same counting argument.
 *
 * Naked: N cells in a house between them hold exactly N digits, so those N
 * digits are used up by those N cells and leave the rest of the house.
 * Hidden: N digits in a house fit in exactly N cells, so those N cells are
 * used up by those N digits and every other candidate leaves those cells.
 *
 * Both are parameterised by N because the argument does not change with size —
 * only the search cost does, which is why the catalog orders pair before
 * triple before quad.
 */

import type { CellIndex, Detector, Digit, Elimination, TechniqueId } from '../types';
import { DIGITS } from '../types';
import { HOUSES } from '../board';
import { buildFinding, cellsWithCandidate, combinations, unionCandidates } from './util';

/**
 * N cells whose candidate union is exactly N digits.
 *
 * Cells are restricted to 2..N candidates. One candidate would be a naked
 * single — a strictly easier deduction the catalog has already tried — and
 * admitting it here would let a degenerate "pair" of {5} and {5,7} claim a
 * technique the player has not been taught yet.
 */
function nakedSubset(technique: TechniqueId, n: number): Detector {
  return {
    id: technique,
    detect(board) {
      for (const house of HOUSES) {
        const hosts = house.cells.filter((c) => {
          const size = board.trueCandidates(c).size;
          return size >= 2 && size <= n;
        });
        if (hosts.length < n) continue;
        for (const combo of combinations(hosts, n)) {
          const digits = unionCandidates(board, combo);
          if (digits.size !== n) continue;
          const inSubset = new Set(combo);
          const eliminations: Elimination[] = [];
          for (const cell of house.cells) {
            if (inSubset.has(cell)) continue;
            const candidates = board.trueCandidates(cell);
            for (const digit of digits) if (candidates.has(digit)) eliminations.push({ cell, digit });
          }
          const finding = buildFinding({
            technique, digits, cells: combo, houses: [house], eliminations,
          });
          if (finding) return finding;
        }
      }
      return null;
    },
  };
}

/**
 * N digits confined to exactly N cells of a house.
 *
 * Digits are restricted to 2..N homes for the mirror-image reason: a digit with
 * a single home is a hidden single.
 */
function hiddenSubset(technique: TechniqueId, n: number): Detector {
  return {
    id: technique,
    detect(board) {
      for (const house of HOUSES) {
        const homes = new Map<Digit, CellIndex[]>();
        for (const digit of DIGITS) {
          const spots = cellsWithCandidate(board, house, digit);
          if (spots.length >= 2 && spots.length <= n) homes.set(digit, spots);
        }
        if (homes.size < n) continue;
        for (const combo of combinations([...homes.keys()], n)) {
          const cells = new Set<CellIndex>();
          for (const digit of combo) for (const c of homes.get(digit) ?? []) cells.add(c);
          if (cells.size !== n) continue;
          const inSubset = new Set<Digit>(combo);
          const eliminations: Elimination[] = [];
          for (const cell of cells) {
            for (const digit of board.trueCandidates(cell)) {
              if (!inSubset.has(digit)) eliminations.push({ cell, digit });
            }
          }
          const finding = buildFinding({
            technique, digits: combo, cells, houses: [house], eliminations,
          });
          if (finding) return finding;
        }
      }
      return null;
    },
  };
}

export const nakedPair = nakedSubset('naked_pair', 2);
export const nakedTriple = nakedSubset('naked_triple', 3);
export const nakedQuad = nakedSubset('naked_quad', 4);
export const hiddenPair = hiddenSubset('hidden_pair', 2);
export const hiddenTriple = hiddenSubset('hidden_triple', 3);
