/**
 * Remote pairs.
 *
 * Take every cell whose only candidates are the same two digits {X,Y} and join
 * two of them when they see each other: peers cannot take the same digit, so
 * along such a link the assignment flips. Colour the resulting graph and any
 * two cells of opposite colour are guaranteed to be X and Y in some order — so
 * a cell seeing both of them can hold neither, and *both* digits come out.
 *
 * The chain must span at least four cells (an odd link-distance of three or
 * more). At distance one the "chain" is two cells of a naked pair sharing a
 * house, which the catalog has already spent; reporting it as a remote pair
 * would show the player the wrong lesson for the board in front of them.
 *
 * Only bipartite components are used. See `chain.ts` for why.
 */

import type { BoardView, CellIndex, Detector, Digit, Elimination } from '../types';
import { DIGITS } from '../types';
import { CELL_COUNT } from '../board';
import type { Link } from './chain';
import { chainComponents, pathHouses, shortestPath } from './chain';
import { buildFinding, combinations, commonPeers } from './util';

/** Shortest distance in links; three is the shortest chain worth reporting. */
const MIN_DISTANCE = 3;

/** Cells whose candidates are exactly `pair`, ascending. */
function bivalueCells(board: BoardView, pair: readonly Digit[]): CellIndex[] {
  const cells: CellIndex[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const candidates = board.trueCandidates(cell);
    if (candidates.size === 2 && pair.every((d) => candidates.has(d))) cells.push(cell);
  }
  return cells;
}

/** Every peer relation among `cells`, tagged with the house that carries it. */
function peerLinks(board: BoardView, cells: readonly CellIndex[]): Link[] {
  const links: Link[] = [];
  for (const [a, b] of combinations(cells, 2)) {
    const house = board.housesOf(a).find((h) => h.cells.includes(b));
    if (house) links.push({ a, b, house });
  }
  return links;
}

export const remotePairs: Detector = {
  id: 'remote_pairs',
  detect(board) {
    for (const pair of combinations(DIGITS, 2)) {
      const nodes = bivalueCells(board, pair);
      if (nodes.length <= MIN_DISTANCE) continue;
      for (const component of chainComponents(peerLinks(board, nodes))) {
        if (!component.bipartite || component.cells.length <= MIN_DISTANCE) continue;
        const member = new Set(component.cells);
        for (const [from, to] of combinations(component.cells, 2)) {
          if (component.color.get(from) === component.color.get(to)) continue;
          const path = shortestPath(component, from, to);
          if (!path || path.length - 1 < MIN_DISTANCE) continue;
          const eliminations: Elimination[] = [];
          for (const cell of commonPeers(board, from, to)) {
            if (member.has(cell)) continue;
            const candidates = board.trueCandidates(cell);
            for (const digit of pair) if (candidates.has(digit)) eliminations.push({ cell, digit });
          }
          const finding = buildFinding({
            technique: 'remote_pairs',
            digits: pair,
            cells: path,
            houses: pathHouses(component, path),
            eliminations,
          });
          if (finding) return finding;
        }
      }
    }
    return null;
  },
};
