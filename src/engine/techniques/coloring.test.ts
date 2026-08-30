import { describe, expect, it } from 'vitest';
import { Board, boxOf, HOUSES } from '../board';
import { simpleColoring } from './coloring';
import { chainComponents } from './chain';
import { cellsWithCandidate } from './util';
import { EMPTY_GRID, EXAMPLES, findingShape, possibleDigits, PUZZLES } from './fixtures';

/** A board whose 5s colour into a side that appears twice inside box 4. */
const COLOUR_TRAP =
  '728934165..9.563875361.74293647925188..6.32949.2.48736683425971...3.9.5229.8.1.43';

/** The conjugate-pair graph the detector builds, rebuilt independently here. */
const linksFor = (grid: string, digit: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) => {
  const board = Board.fromString(grid);
  return HOUSES.flatMap((house) => {
    const spots = cellsWithCandidate(board, house, digit);
    return spots.length === 2 ? [{ a: spots[0], b: spots[1], house }] : [];
  });
};

describe('simple colouring', () => {
  it('clears a digit from a cell seeing both colours of a chain', () => {
    // Six cells are linked by conjugate pairs on 3. Colouring splits them into
    // {r2c7, r5c8, r6c2} and {r2c8, r6c7, r5c2}; one whole side holds the 3s.
    // r8c2 sees r6c2 from one side and r5c2 from the other, so it sees a 3
    // whichever side is the true one.
    const board = Board.fromString(EXAMPLES.simple_coloring);
    const [component] = chainComponents(linksFor(EXAMPLES.simple_coloring, 3));
    expect(component.bipartite).toBe(true);
    expect(component.cells).toEqual([15, 16, 37, 43, 46, 51]);
    expect(component.cells.filter((c) => component.color.get(c) === 0)).toEqual([15, 43, 46]);
    expect(component.cells.filter((c) => component.color.get(c) === 1)).toEqual([16, 37, 51]);

    expect(findingShape(simpleColoring.detect(board))).toEqual({
      technique: 'simple_coloring',
      digits: [3],
      cells: ['r2c7', 'r2c8', 'r5c2', 'r5c8', 'r6c2', 'r6c7'],
      houses: ['row1', 'box2', 'box3', 'row4', 'row5', 'box5', 'col6', 'col7'],
      eliminations: ['r8c2≠3'],
      placements: [],
    });
  });

  it('condemns a whole colour when it appears twice in one house', () => {
    // The 5s chain through r5c2 — r5c3 (row 5), r5c2 — r6c2 (column 2),
    // r6c2 — r6c4 (row 6) and r5c3 — r9c3 (column 3). Colouring puts r5c3 and
    // r6c2 on the same side, and both sit in the same box: that side cannot be
    // the true one, so the 5 leaves both of them at once.
    const board = Board.fromString(COLOUR_TRAP);
    const [component] = chainComponents(linksFor(COLOUR_TRAP, 5));
    expect(component.cells).toEqual([37, 38, 46, 48, 74]);
    expect(component.cells.filter((c) => component.color.get(c) === 1)).toEqual([38, 46]);
    expect(boxOf(38)).toBe(boxOf(46));

    const finding = simpleColoring.detect(board);
    expect(findingShape(finding)).toEqual({
      technique: 'simple_coloring',
      digits: [5],
      cells: ['r5c2', 'r5c3', 'r6c2', 'r6c4', 'r9c3'],
      houses: ['col1', 'col2', 'box3', 'row4', 'row5'],
      eliminations: ['r5c3≠5', 'r6c2≠5'],
      placements: [],
    });

    // And the trap is not merely plausible: no solution of this board puts a 5
    // in either cell.
    const possible = possibleDigits(COLOUR_TRAP);
    expect(possible).not.toBeNull();
    expect(possible?.[38].has(5)).toBe(false);
    expect(possible?.[46].has(5)).toBe(false);
  });

  it('declines a grid with no conjugate pairs at all', () => {
    expect(simpleColoring.detect(Board.fromString(EMPTY_GRID))).toBeNull();
  });

  it('declines a puzzle whose chains are too short to prove anything', () => {
    // Conjugate pairs exist, but no component reaches three cells with a
    // cell outside it seeing both colours.
    const grid = PUZZLES[3].givens;
    expect(linksFor(grid, 1).length + linksFor(grid, 2).length).toBeGreaterThan(0);
    expect(simpleColoring.detect(Board.fromString(grid))).toBeNull();
  });
});

describe('chain components', () => {
  it('two-colours a path and reports it bipartite', () => {
    const links = linksFor(EXAMPLES.simple_coloring, 3);
    for (const component of chainComponents(links)) {
      expect(component.bipartite).toBe(true);
      for (const link of component.links) {
        expect(component.color.get(link.a)).not.toBe(component.color.get(link.b));
      }
    }
  });

  it('flags an odd cycle as not bipartite so no detector reasons from it', () => {
    const house = HOUSES[0];
    const odd = chainComponents([
      { a: 0, b: 1, house },
      { a: 1, b: 2, house },
      { a: 2, b: 0, house },
    ]);
    expect(odd).toHaveLength(1);
    expect(odd[0].bipartite).toBe(false);
  });
});
