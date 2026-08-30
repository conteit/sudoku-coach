import { describe, expect, it } from 'vitest';
import { Board, peersOf } from '../board';
import { xyWing } from './wings';
import { EXAMPLES, findingShape, PUZZLES } from './fixtures';

describe('xy-wing', () => {
  it('proves the wing digit from either branch of the pivot', () => {
    // Pivot r1c1={1,7} sees pincers r1c7={1,5} and r1c9={5,7} along row 1.
    // Pivot 1 forces r1c9=5; pivot 7 forces r1c7=5. Either way a 5 lands on
    // one of the pincers, so r2c9 — which sees both — cannot be 5.
    const board = Board.fromString(EXAMPLES.xy_wing);
    expect([...board.trueCandidates(0)].sort()).toEqual([1, 7]);
    expect([...board.trueCandidates(6)].sort()).toEqual([1, 5]);
    expect([...board.trueCandidates(8)].sort()).toEqual([5, 7]);
    expect(peersOf(17)).toEqual(expect.arrayContaining([6, 8]));
    expect(findingShape(xyWing.detect(board))).toEqual({
      technique: 'xy_wing',
      digits: [1, 5, 7],
      cells: ['r1c1', 'r1c7', 'r1c9'],
      houses: ['row0'],
      eliminations: ['r2c9≠5'],
      placements: [],
    });
  });

  it('declines a puzzle with no bi-value pivot and matching pincers', () => {
    expect(xyWing.detect(Board.fromString(PUZZLES[6].givens))).toBeNull();
  });

  it('declines a board that has bi-value cells but no wing among them', () => {
    // The null here is not vacuous: there are plenty of two-candidate cells to
    // choose a pivot from, none of which has a matching pair of pincers.
    const board = Board.fromString(EXAMPLES.pointing);
    const bivalue = [...Array(81).keys()].filter((c) => board.trueCandidates(c).size === 2);
    expect(bivalue.length).toBeGreaterThan(3);
    expect(xyWing.detect(board)).toBeNull();
  });
});
