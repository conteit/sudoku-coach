import { describe, expect, it } from 'vitest';
import { Board } from '../board';
import { hiddenPair, hiddenTriple, nakedPair, nakedQuad, nakedTriple } from './subsets';
import { EXAMPLES, findingShape, PUZZLES } from './fixtures';

const candidatesOf = (grid: string, cell: number): number[] =>
  [...Board.fromString(grid).trueCandidates(cell)].sort((a, b) => a - b);

describe('naked pair', () => {
  it('clears the pair digits from the rest of the house', () => {
    // r4c3 and r4c7 both hold exactly {1,9}: between them they use up both
    // digits, so row 4 has none left for r4c4.
    const grid = EXAMPLES.naked_pair;
    expect(candidatesOf(grid, 29)).toEqual([1, 9]);
    expect(candidatesOf(grid, 33)).toEqual([1, 9]);
    expect(findingShape(nakedPair.detect(Board.fromString(grid)))).toEqual({
      technique: 'naked_pair',
      digits: [1, 9],
      cells: ['r4c3', 'r4c7'],
      houses: ['row3'],
      eliminations: ['r4c4≠1'],
      placements: [],
    });
  });

  it('declines a puzzle with no two cells sharing a pair', () => {
    expect(nakedPair.detect(Board.fromString(PUZZLES[0].givens))).toBeNull();
  });
});

describe('naked triple', () => {
  it('clears three digits shared by three cells of a box', () => {
    // r4c3={1,9}, r5c2={1,3,9}, r6c2={1,3,9} — three cells, three digits.
    // None of them holds all three, which is what makes it a triple rather
    // than three pairs.
    const grid = EXAMPLES.naked_triple;
    expect(candidatesOf(grid, 29)).toEqual([1, 9]);
    expect(candidatesOf(grid, 37)).toEqual([1, 3, 9]);
    expect(candidatesOf(grid, 46)).toEqual([1, 3, 9]);
    expect(findingShape(nakedTriple.detect(Board.fromString(grid)))).toEqual({
      technique: 'naked_triple',
      digits: [1, 3, 9],
      cells: ['r4c3', 'r5c2', 'r6c2'],
      houses: ['box3'],
      eliminations: ['r6c3≠1', 'r6c3≠3', 'r6c3≠9'],
      placements: [],
    });
  });

  it('declines a puzzle whose houses hold no three-cell subset', () => {
    expect(nakedTriple.detect(Board.fromString(PUZZLES[4].givens))).toBeNull();
  });
});

describe('naked quad', () => {
  it('clears four digits shared by four cells of a row', () => {
    const grid = EXAMPLES.naked_quad;
    expect(candidatesOf(grid, 37)).toEqual([1, 3, 9]);
    expect(candidatesOf(grid, 39)).toEqual([1, 7]);
    expect(candidatesOf(grid, 41)).toEqual([1, 7, 9]);
    expect(candidatesOf(grid, 43)).toEqual([1, 3, 9]);
    expect(findingShape(nakedQuad.detect(Board.fromString(grid)))).toEqual({
      technique: 'naked_quad',
      digits: [1, 3, 7, 9],
      cells: ['r5c2', 'r5c4', 'r5c6', 'r5c8'],
      houses: ['row4'],
      eliminations: ['r5c9≠1'],
      placements: [],
    });
  });

  it('declines a board with no four-cell subset', () => {
    expect(nakedQuad.detect(Board.fromString(EXAMPLES.naked_single))).toBeNull();
  });
});

describe('hidden pair', () => {
  it('clears the other candidates from the pair of cells', () => {
    // In row 4, 2 and 7 fit nowhere but r4c4 and r4c6. Those two cells are
    // therefore spoken for, and everything else in them goes.
    const board = Board.fromString(EXAMPLES.hidden_pair);
    expect([...board.trueCandidates(30)].sort()).toEqual([2, 5, 7, 8]);
    expect([...board.trueCandidates(32)].sort()).toEqual([2, 5, 7, 8]);
    expect(findingShape(hiddenPair.detect(board))).toEqual({
      technique: 'hidden_pair',
      digits: [2, 7],
      cells: ['r4c4', 'r4c6'],
      houses: ['row3'],
      eliminations: ['r4c4≠5', 'r4c4≠8', 'r4c6≠5', 'r4c6≠8'],
      placements: [],
    });
  });

  it('declines a puzzle where no two digits share exactly two homes', () => {
    expect(hiddenPair.detect(Board.fromString(PUZZLES[4].givens))).toBeNull();
  });
});

describe('hidden triple', () => {
  it('clears the other candidates from the three cells', () => {
    // 6, 8 and 9 are confined to the right-hand column of box 8.
    const board = Board.fromString(EXAMPLES.hidden_triple);
    expect(findingShape(hiddenTriple.detect(board))).toEqual({
      technique: 'hidden_triple',
      digits: [6, 8, 9],
      cells: ['r7c7', 'r8c7', 'r9c7'],
      houses: ['box8'],
      eliminations: ['r7c7≠1', 'r7c7≠5', 'r8c7≠1', 'r8c7≠5', 'r9c7≠5'],
      placements: [],
    });
  });

  it('declines a board with no three digits confined to three cells', () => {
    expect(hiddenTriple.detect(Board.fromString(EXAMPLES.hidden_single))).toBeNull();
  });
});
