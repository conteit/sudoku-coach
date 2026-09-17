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
import { EXAMPLES } from './techniques/fixtures';
import { xWingHolds } from './claim';

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
