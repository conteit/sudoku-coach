/**
 * The drawing rules, which are where the visual language is actually decided:
 * which cells get a mark, which of the two channels — colour and stroke —
 * carries which distinction, and which cells are numbered.
 *
 * Worth testing at this level rather than through a rendered board because the
 * rule is the thing that has to hold. Paolo set it: *"dashed line more for
 * xy-wing, not for colouring where color plays a role"*. Colour is the
 * colouring's, stroke is the wing's, and nothing may quietly borrow the other.
 */

import { describe, expect, it } from 'vitest';
import { drawingOf } from './shape';
import {
  MARK_ALT,
  MARK_DASHED,
  MARK_ON,
  MARK_TARGET,
  marked,
} from '../board/patternMark';
import type { CellIndex } from '../../engine/types';

const cells = (drawing: { marks: number[] }): CellIndex[] =>
  drawing.marks.flatMap((mark, cell) => (mark === 0 ? [] : [cell as CellIndex]));

describe('a chain is drawn in two colours', () => {
  const chain = [0, 9, 11, 29] as CellIndex[];

  it('alternates them, so the colour says which side of the argument a cell is on', () => {
    const { marks } = drawingOf('chain', chain);
    expect(chain.map((cell) => marked(marks[cell], MARK_ALT))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it('leaves the stroke alone — a colouring has no dashed cell', () => {
    const { marks } = drawingOf('chain', chain);
    expect(chain.some((cell) => marked(marks[cell], MARK_DASHED))).toBe(false);
  });

  it('numbers the cells in the order they were tapped, and links each to the last', () => {
    const { order, links } = drawingOf('chain', chain);
    expect([...order]).toEqual([
      [0, 1],
      [9, 2],
      [11, 3],
      [29, 4],
    ]);
    expect(links).toEqual([
      [0, 9],
      [9, 11],
      [11, 29],
    ]);
  });
});

describe('a wing is drawn in one colour, with the stroke doing the dividing', () => {
  const wing = [10, 13, 46] as CellIndex[];

  it('dashes the wings and leaves the pivot solid', () => {
    const { marks } = drawingOf('wing', wing, { pivot: 10 });
    expect(marked(marks[10], MARK_DASHED)).toBe(false);
    expect(marked(marks[13], MARK_DASHED)).toBe(true);
    expect(marked(marks[46], MARK_DASHED)).toBe(true);
  });

  it('leaves the colour alone — the second colour belongs to the colouring', () => {
    const { marks } = drawingOf('wing', wing, { pivot: 10 });
    expect(wing.some((cell) => marked(marks[cell], MARK_ALT))).toBe(false);
  });

  it('links each wing to the pivot, and does not number them', () => {
    const { links, order } = drawingOf('wing', wing, { pivot: 10 });
    expect(links).toEqual([
      [10, 13],
      [10, 46],
    ]);
    expect(order.size).toBe(0);
  });

  it('treats a wing with no pivot yet as three cells with one treatment', () => {
    // Nobody is asked which cell is the pivot — it is only known once the
    // claim has been checked. Until then the board must not imply an answer.
    const { marks, links } = drawingOf('wing', wing);
    expect(wing.map((cell) => marks[cell])).toEqual([MARK_ON, MARK_ON, MARK_ON]);
    expect(links).toEqual([]);
  });
});

describe('a set is drawn flat', () => {
  it('gives every corner the same mark, with no links and no numbers', () => {
    const corners = [0, 4, 36, 40] as CellIndex[];
    const { marks, links, order } = drawingOf('set', corners);
    expect(cells({ marks })).toEqual(corners);
    expect(corners.map((cell) => marks[cell])).toEqual([MARK_ON, MARK_ON, MARK_ON, MARK_ON]);
    expect(links).toEqual([]);
    expect(order.size).toBe(0);
  });
});

describe('targets', () => {
  it('are marked as targets, whatever shape they belong to', () => {
    const { marks } = drawingOf('chain', [0, 9] as CellIndex[], { targets: [72] as CellIndex[] });
    expect(marked(marks[72], MARK_TARGET)).toBe(true);
    expect(marked(marks[0], MARK_TARGET)).toBe(false);
  });

  it('are none of them unless the caller passes them, because they are level-4 content', () => {
    const { marks } = drawingOf('chain', [0, 9] as CellIndex[]);
    expect(marks.some((mark) => marked(mark, MARK_TARGET))).toBe(false);
  });
});
