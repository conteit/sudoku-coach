/**
 * The drawing has to be the chain the engine actually found, not a plausible
 * one. These work from the fixture boards the detectors are pinned against.
 */

import { describe, expect, it } from 'vitest';
import { Board, HOUSES } from '../engine/board';
import { EXAMPLES } from '../engine/techniques/fixtures';
import { CATALOG } from '../engine/techniques';
import { chainShapeOf } from './chainShape';
import type { CellIndex, Digit } from '../engine/types';

const findingOn = (technique: 'simple_coloring') => {
  const board = Board.fromString(EXAMPLES[technique]);
  const detector = CATALOG.find((d) => d.id === technique);
  if (detector === undefined) throw new Error(`no detector for ${technique}`);
  const finding = detector.detect(board);
  if (finding === null) throw new Error(`no ${technique} on its own fixture`);
  return { board, finding };
};

describe('the shape of a colouring the coach found', () => {
  it('two-colours the cells, and every link joins opposite colours', () => {
    const { board, finding } = findingOn('simple_coloring');
    const shape = chainShapeOf(board, finding.digits[0], finding.cells);
    expect(shape).not.toBeNull();

    const alt = new Set(shape!.alt);
    expect(alt.size).toBeGreaterThan(0);
    expect(alt.size).toBeLessThan(finding.cells.length);
    for (const [a, b] of shape!.links) {
      expect(alt.has(a), `${a}-${b} joins two cells of one colour`).not.toBe(alt.has(b));
    }
  });

  it('draws only links the board actually justifies', () => {
    const { board, finding } = findingOn('simple_coloring');
    const shape = chainShapeOf(board, finding.digits[0], finding.cells)!;
    const digit = finding.digits[0];

    for (const [a, b] of shape.links) {
      // Conjugacy is the whole claim a link makes, and it is stronger than
      // "these two share a house and both can take the digit": there has to be
      // a house where they are its *only* two homes for it. A link drawn
      // without that is the board telling the player something untrue.
      const conjugate = HOUSES.some((house) => {
        if (!house.cells.includes(a) || !house.cells.includes(b)) return false;
        const homes = house.cells.filter((cell) => board.trueCandidates(cell).has(digit));
        return homes.length === 2;
      });
      expect(conjugate, `${a}-${b} is not a conjugate pair for ${digit}`).toBe(true);
    }
    expect(shape.links.length).toBeGreaterThanOrEqual(finding.cells.length - 1);
  });

  it('will not join two cells a house does not confine the digit to', () => {
    // The fixture cannot test this: every pair it would wrongly join happens
    // to be conjugate anyway, so loosening the rule to "the first two homes"
    // changes nothing there and the assertion above passes either way. So the
    // case is built instead — a house where the digit has *three* homes. Two
    // of them share a house and both hold the digit, which is everything a
    // link needs except the thing that makes it true.
    const { board } = findingOn('simple_coloring');
    let crowded: { digit: Digit; cells: CellIndex[] } | null = null;
    for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]) {
      for (const house of HOUSES) {
        const homes = house.cells.filter((cell) => board.trueCandidates(cell).has(digit));
        if (homes.length >= 3) {
          crowded = { digit, cells: [homes[0], homes[1]] };
          break;
        }
      }
      if (crowded !== null) break;
    }
    expect(crowded, 'no house on this board has a digit with three homes').not.toBeNull();

    expect(chainShapeOf(board, crowded!.digit, crowded!.cells)).toBeNull();
  });

  it('refuses cells that are not one component on that digit', () => {
    // Two cells of the real chain plus one that has nothing to do with it:
    // the picture would show a chain the finding is not about.
    const { board, finding } = findingOn('simple_coloring');
    const stranger = [...Array(81).keys()].find(
      (cell) => !finding.cells.includes(cell as CellIndex) && board.values[cell] === null,
    ) as CellIndex;

    expect(chainShapeOf(board, finding.digits[0], [...finding.cells, stranger])).toBeNull();
  });

  it('refuses a digit the cells are not linked on', () => {
    const { board, finding } = findingOn('simple_coloring');
    const other = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).find((d) => d !== finding.digits[0])!;

    // Not an assertion that *this* digit fails — a guard that says so when it
    // does, rather than drawing links from whatever the graph happens to hold.
    const shape = chainShapeOf(board, other, finding.cells);
    if (shape !== null) {
      for (const [a, b] of shape.links) {
        expect(board.trueCandidates(a).has(other)).toBe(true);
        expect(board.trueCandidates(b).has(other)).toBe(true);
      }
    }
  });
});
