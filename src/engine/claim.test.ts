/**
 * A verifier that says "yes" to a pattern that is not there is worse than no
 * verifier, because the answer it gives is confident — and the app's whole
 * claim is that it cannot be wrong. So each rule is pinned against the same
 * fixtures the detector it shadows is pinned against, and the cross-check at
 * the bottom binds the two together for as long as both exist.
 */

import { describe, expect, it } from 'vitest';
import { Board } from './board';
import { EXAMPLES, PUZZLES } from './techniques/fixtures';
import { CATALOG } from './techniques';
import { colouringClaim, colouringHolds, xWingClaim, xyWingClaim } from './claim';

// `fish.test.ts` proves the detector finds exactly this: a 2 in r2c4, r2c6,
// r4c4, r4c6, based on columns 4 and 6, eliminating r2c1 and r2c2.
const VALUES = Board.fromString(EXAMPLES.x_wing).values;
const CORNERS = [12, 14, 30, 32];

describe('the x-wing verifier', () => {
  it('accepts the x-wing the detector finds', () => {
    expect(xWingClaim(VALUES, 2, CORNERS).holds).toBe(true);
  });

  it('accepts it whatever order the corners were tapped in', () => {
    expect(xWingClaim(VALUES, 2, [32, 12, 30, 14]).holds).toBe(true);
  });

  it('refuses the right cells on the wrong digit', () => {
    // The claim carries its digit for exactly this reason: four cells alone
    // do not say what pattern they are.
    expect(xWingClaim(VALUES, 5, CORNERS).holds).toBe(false);
  });

  it('refuses three of the four corners', () => {
    expect(xWingClaim(VALUES, 2, CORNERS.slice(0, 3)).holds).toBe(false);
  });

  it('refuses a rectangle whose base lines have a third home for the digit', () => {
    // Rows 2 and 4 hold the same four cells, but `fish.test.ts` records that
    // row 2 has more than two homes for a 2 — so read row-wise the pigeonhole
    // is not tight. It holds only because the *columns* are tight, which is
    // what this cross-checks: swap in a rectangle with no tight axis at all.
    expect(xWingClaim(VALUES, 2, [12, 14, 21, 23]).holds).toBe(false);
  });

  it('refuses a pattern that eliminates nothing', () => {
    // r2c1 and r2c2 are the only two cells this fish would have eliminated
    // from. Fill them and the pigeonhole is still tight — columns 4 and 6
    // still have exactly these four corners as homes for a 2 — but it now
    // proves nothing, and `fish.ts` does not call that a finding either.
    const spent = [...VALUES];
    spent[9] = 1;
    spent[10] = 4;
    expect(xWingClaim(spent, 2, CORNERS).holds).toBe(false);
  });

  it('refuses four cells that are not a rectangle', () => {
    expect(xWingClaim(VALUES, 2, [12, 14, 30, 33]).holds).toBe(false);
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
    expect(xWingClaim(values, 7, [54, 72, 16, 25]).holds).toBe(false);
  });
});

/**
 * The chain half. `EXAMPLES.simple_coloring` carries one: the 3s make a
 * six-cell chain of conjugate pairs, 15-16-43-37-46-51, and `coloring.ts`
 * finds exactly one elimination from it.
 */
const CHAIN = [15, 16, 43, 37, 46, 51];

describe('the colouring verifier', () => {
  it('accepts the chain the detector proves something from', () => {
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    const verdict = colouringClaim(values, 3, CHAIN);
    expect(verdict).toEqual({
      kind: 'proves',
      digits: [3],
      // The cells, not a count. What the claim clears is what the player is
      // offered afterwards, so a verdict that only counted could not be acted
      // on without the app deducing it a second time.
      eliminations: [{ cell: 64, digit: 3 }],
    });
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
    expect(colouringClaim(values, 7, [24, 26, 17])).toEqual({
      kind: 'proves',
      digits: [7],
      // Both cells of the trapped colour, each losing the 7.
      eliminations: [
        { cell: 24, digit: 7 },
        { cell: 17, digit: 7 },
      ],
    });
  });

  it('refuses a chain too short to be one', () => {
    // Two cells is a conjugate pair, which the intersections already use —
    // `coloring.ts` sets the same floor for the same reason.
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    expect(colouringClaim(values, 3, [15, 16])).toEqual({ kind: 'broken', link: 2 });
  });
});

describe('the xy-wing verifier', () => {
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
      expect(xyWingClaim(VALUES, order)).toEqual({
        holds: true,
        pivot: 0,
        wings: [6, 8],
        eliminations: [{ cell: 17, digit: 5 }],
      });
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
    expect(xyWingClaim(VALUES, [0, 6, 17])).toEqual({
      holds: true,
      pivot: 6,
      wings: [0, 17],
      eliminations: [
        { cell: 8, digit: 7 },
        { cell: 9, digit: 7 },
        { cell: 10, digit: 7 },
      ],
    });
  });

  it('refuses two cells', () => {
    expect(xyWingClaim(VALUES, [0, 6])).toEqual({ holds: false });
  });
});

/**
 * The verifiers and the detectors are two readings of the same rules, and two
 * readings that can drift are two bugs waiting. Until the detectors become
 * generators — at which point the duplication goes away and `detect` is
 * defined as the first thing a verifier yields — this is what keeps them
 * honest: every finding a detector reports must be accepted by the verifier
 * for the same technique, on every fixture board in the repo.
 *
 * It is a weaker statement than equality, deliberately. A verifier accepting
 * *more* than its detector reports is the whole point — the detector stops at
 * the first pattern and the player may have spotted the second. What must
 * never happen is the other direction: a pattern the engine itself calls an
 * X-Wing that the claim flow then refuses.
 */
describe('the verifiers agree with the detectors they shadow', () => {
  const BOARDS = [
    ...Object.entries(EXAMPLES),
    ...PUZZLES.map((puzzle, i) => [`puzzle${i}`, puzzle.givens] as const),
  ];

  it.each(BOARDS)('accepts every finding the detectors report on %s', (_name, grid) => {
    const board = Board.fromString(grid);
    let checked = 0;

    for (const detector of CATALOG) {
      const finding = detector.detect(board);
      if (finding === null) continue;
      checked += 1;
      if (finding.technique === 'x_wing') {
        expect(xWingClaim(board.values, finding.digits[0], finding.cells).holds).toBe(true);
      } else if (finding.technique === 'xy_wing') {
        expect(xyWingClaim(board.values, finding.cells)).toMatchObject({ holds: true });
      }
    }

    // Without this the test passes on a board where no detector fires at all,
    // which is the shape of an assertion that cannot fail.
    expect(checked).toBeGreaterThan(0);
  });
});

/**
 * The digit is never asked for. A chain's links are houses in which some digit
 * has exactly two homes, so a chain only works for a digit that makes *every*
 * link conjugate — the cells determine it, as four corners determine a fish's.
 */
describe('a chain knows its own digit', () => {
  it('finds the digit the chain is about', () => {
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    expect(colouringHolds(values, CHAIN)).toEqual({
      kind: 'proves',
      digits: [3],
      eliminations: [{ cell: 64, digit: 3 }],
    });
  });

  it('reports the digit that proves something, not merely one that fits', () => {
    // In `EXAMPLES.remote_pairs` these three cells are a valid chain for both
    // the 1 and the 4 — the links are conjugate pairs either way — but only
    // the 1 eliminates anything. A verdict naming the 4 would be true and
    // useless.
    //
    // Measured across the fixtures: 18 of 1,216 chains are valid for two
    // digits like this, and **none proves for two**. The verdict still
    // carries a list rather than one digit, because nothing rules that case
    // out mathematically — but it is honest to record that the multi-digit
    // branch is not exercised by any board in this repo.
    const values = Board.fromString(EXAMPLES.remote_pairs).values;
    expect(colouringHolds(values, [63, 9, 10])).toEqual({
      kind: 'proves',
      digits: [1],
      eliminations: [
        { cell: 12, digit: 1 },
        { cell: 13, digit: 1 },
      ],
    });
  });

  it('reports the break from the digit that got furthest', () => {
    // r1c1, r1c9, r1c7 in `EXAMPLES.naked_single` break at link 1 for some
    // digits and at link 2 for others. A chain that holds for nothing still
    // has a most plausible reading, and that is the one the player building
    // it had in mind — telling them the first link failed, when their digit
    // got past it, points at the wrong place.
    const values = Board.fromString(EXAMPLES.naked_single).values;
    expect(colouringHolds(values, [0, 8, 6])).toEqual({ kind: 'broken', link: 2 });
  });

  it('still refuses a chain too short to be one', () => {
    const values = Board.fromString(EXAMPLES.simple_coloring).values;
    // `link` is the chain's own length here, as the per-digit check reports
    // it; the panel disables Check below three cells, so this is the
    // verifier's answer rather than anything a player sees.
    expect(colouringHolds(values, [CHAIN[0], CHAIN[1]])).toEqual({ kind: 'broken', link: 2 });
  });
});
