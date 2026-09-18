/**
 * SPIKE (#140) — throwaway, and tested anyway.
 *
 * The spike exists to be judged by a person playing it, and a verifier that
 * says "yes" to a pattern that is not there would make that judgement
 * worthless — worse than no spike, because the answer it produces is
 * confident. So the one thing it does is pinned against the same fixture the
 * real detector is pinned against.
 */

import { describe, expect, it } from 'vitest';
import { Board } from './board';
import { EXAMPLES, PUZZLES } from './techniques/fixtures';
import { colouringClaim, xWingHolds, xyWingClaim } from './claim';

// `fish.test.ts` proves the detector finds exactly this: a 2 in r2c4, r2c6,
// r4c4, r4c6, based on columns 4 and 6, eliminating r2c1 and r2c2.
const VALUES = Board.fromString(EXAMPLES.x_wing).values;
const CORNERS = [12, 14, 30, 32];

describe('the spike x-wing verifier', () => {
  it('accepts the x-wing the detector finds', () => {
    expect(xWingHolds(VALUES, 2, CORNERS)).toBe(true);
  });

  it('accepts it whatever order the corners were tapped in', () => {
    expect(xWingHolds(VALUES, 2, [32, 12, 30, 14])).toBe(true);
  });

  it('refuses the right cells on the wrong digit', () => {
    // The claim carries its digit for exactly this reason: four cells alone
    // do not say what pattern they are.
    expect(xWingHolds(VALUES, 5, CORNERS)).toBe(false);
  });

  it('refuses three of the four corners', () => {
    expect(xWingHolds(VALUES, 2, CORNERS.slice(0, 3))).toBe(false);
  });

  it('refuses a rectangle whose base lines have a third home for the digit', () => {
    // Rows 2 and 4 hold the same four cells, but `fish.test.ts` records that
    // row 2 has more than two homes for a 2 — so read row-wise the pigeonhole
    // is not tight. It holds only because the *columns* are tight, which is
    // what this cross-checks: swap in a rectangle with no tight axis at all.
    expect(xWingHolds(VALUES, 2, [12, 14, 21, 23])).toBe(false);
  });

  it('refuses a pattern that eliminates nothing', () => {
    // r2c1 and r2c2 are the only two cells this fish would have eliminated
    // from. Fill them and the pigeonhole is still tight — columns 4 and 6
    // still have exactly these four corners as homes for a 2 — but it now
    // proves nothing, and `fish.ts` does not call that a finding either.
    const spent = [...VALUES];
    spent[9] = 1;
    spent[10] = 4;
    expect(xWingHolds(spent, 2, CORNERS)).toBe(false);
  });

  it('refuses four cells that are not a rectangle', () => {
    expect(xWingHolds(VALUES, 2, [12, 14, 30, 33])).toBe(false);
  });

  it('refuses two tight columns that do not share their rows', () => {
    // The trap this shape sets: in `EXAMPLES.hidden_single` the 7s of columns
    // 1 and 8 have exactly two homes each, which is half of what an X-Wing
    // needs — but they sit in four different rows, so they pin nothing and
    // the pattern proves nothing. Without the two-rows-two-columns guard the
    // verifier accepts it and the app then offers eliminations that are
    // simply false, which is the one failure mode this whole feature cannot
    // have.
    const values = Board.fromString(EXAMPLES.hidden_single).values;
    expect(xWingHolds(values, 7, [54, 72, 16, 25])).toBe(false);
  });
});

/**
 * The chain half. `EXAMPLES.simple_coloring` carries one: the 3s make a
 * six-cell chain of conjugate pairs, 15-16-43-37-46-51, and `coloring.ts`
 * finds exactly one elimination from it.
 */
const CHAIN = [15, 16, 43, 37, 46, 51];

describe('the spike colouring verifier', () => {
  it('accepts the chain the detector proves something from', () => {
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    expect(colouringClaim(values, 3, CHAIN)).toEqual({ kind: 'proves', cells: 1 });
  });

  it('says a real chain that proves nothing is barren, not broken', () => {
    // Three cells of the same chain, genuinely linked — the player did the
    // technique correctly and it happens to pay nothing. Telling them it was
    // "wrong" would teach them to distrust a method that worked.
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    expect(colouringClaim(values, 3, CHAIN.slice(0, 3))).toEqual({ kind: 'barren' });
  });

  it('names the link a chain breaks at', () => {
    // 15 and 16 are conjugate; 51 is nowhere near 16.
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    expect(colouringClaim(values, 3, [15, 16, 51])).toEqual({ kind: 'broken', link: 2 });
  });

  it('refuses a chain that comes back to a cell it already used', () => {
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    expect(colouringClaim(values, 3, [15, 16, 43, 16])).toEqual({ kind: 'broken', link: 3 });
  });

  it('proves a colour that traps itself, not just a cell that sees both', () => {
    // The other of colouring's two conclusions, and the fixture chain above
    // does not reach it: in `PUZZLES[0]` the 7s make a three-cell chain whose
    // two end cells wear the same colour and share a house, so that colour is
    // the false one and both give the digit up.
    const values = Board.fromString(PUZZLES[0].givens).values;
    expect(colouringClaim(values, 7, [24, 26, 17])).toEqual({ kind: 'proves', cells: 2 });
  });

  it('refuses a chain too short to be one', () => {
    // Two cells is a conjugate pair, which the intersections already use —
    // `coloring.ts` sets the same floor for the same reason.
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    expect(colouringClaim(values, 3, [15, 16])).toEqual({ kind: 'broken', link: 2 });
  });
});

describe('the spike xy-wing verifier', () => {
  // `wings.test.ts` pins the detector on this fixture: pivot r1c1 with its
  // two pincers r1c7 and r1c9, proving one elimination.
  const VALUES = Board.fromString(EXAMPLES.xy_wing).values;

  it('finds the pivot whatever order the three cells were tapped in', () => {
    // The role is the lesson of this pattern, and the player never states it:
    // at most one of three cells can be the pivot, so asking would be a
    // question with one possible answer.
    for (const order of [
      [0, 6, 8],
      [8, 0, 6],
      [6, 8, 0],
    ]) {
      expect(xyWingClaim(VALUES, order)).toEqual({ holds: true, pivot: 0, wings: [6, 8] });
    }
  });

  it('refuses a pivot that is not bivalue', () => {
    // In `EXAMPLES.naked_single` these three fit the shape in every other
    // respect — the wings are bivalue, both hang off the pivot by the same
    // outside digit and grip different ones, and something would be
    // eliminated. Only the pivot's third candidate stops it, and it stops it
    // completely: a pivot free to take a third digit forces neither wing.
    const fat = Board.fromString(EXAMPLES.naked_single).values;
    expect(xyWingClaim(fat, [59, 54, 62])).toEqual({ holds: false });
  });

  it('refuses two wings that grip the same digit of the pivot', () => {
    // In `EXAMPLES.remote_pairs` the pivot holds {1,8} and both wings hold
    // {1,5} — same outside digit, both gripping the 1, and a cell seeing both
    // wings really does hold a 5, so the shape is refused on the grips alone
    // and on nothing else. It proves nothing all the same: the pivot taking
    // the 8 leaves both wings free, and neither is forced to the 5.
    const same = Board.fromString(EXAMPLES.remote_pairs).values;
    expect(xyWingClaim(same, [21, 13, 48])).toEqual({ holds: false });
  });

  it('refuses three cells whose digits fit but which are not connected', () => {
    // r1c1, r1c9 and r6c2 fit the digit shape for one assignment of the
    // roles — and for that assignment the pivot cannot see both wings, and no
    // other assignment fits at all. The pattern is an argument about what one
    // cell forces on two others; three cells that cannot see each other force
    // nothing, however their candidates happen to line up.
    expect(xyWingClaim(VALUES, [0, 8, 46])).toEqual({ holds: false });
  });

  it('accepts a valid xy-wing the detector never reports', () => {
    // This is the whole argument for a verifier rather than `detect()`, as a
    // test. `wings.test.ts` pins the detector on this board at r1c1/r1c7/r1c9
    // — it returns the first pattern it meets and stops. But r1c7 is *also*
    // the pivot of a second, equally valid xy-wing, with r1c1 and r2c9 as its
    // wings. A player who sees that one and claims it is right, and any check
    // built on the detector would tell them they are wrong.
    expect(xyWingClaim(VALUES, [0, 6, 17])).toEqual({ holds: true, pivot: 6, wings: [0, 17] });
  });

  it('refuses two cells', () => {
    expect(xyWingClaim(VALUES, [0, 6])).toEqual({ holds: false });
  });
});
