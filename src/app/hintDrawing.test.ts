/**
 * The ladder, as geometry.
 *
 * #165 names these three and calls the middle one "the one that would
 * otherwise rot": nothing below level 3, the pattern at 3, the pattern *and*
 * its targets at 4. A test that only pinned the ends would let level 3 drift
 * into showing eliminations without anything noticing.
 */

import { describe, expect, it } from 'vitest';
import { Board } from '../engine/board';
import { CATALOG } from '../engine/techniques';
import { EXAMPLES } from '../engine/techniques/fixtures';
import { MARK_ALT, MARK_ON, MARK_TARGET, marked } from '../ui/board/patternMark';
import { hintDrawing } from './hintDrawing';
import type { Finding, TechniqueId } from '../engine/types';

const findingOn = (technique: TechniqueId): { finding: Finding; values: Board['values'] } => {
  const board = Board.fromString(EXAMPLES[technique]);
  const detector = CATALOG.find((d) => d.id === technique);
  if (detector === undefined) throw new Error(`no detector for ${technique}`);
  const finding = detector.detect(board);
  if (finding === null) throw new Error(`no ${technique} on its own fixture`);
  return { finding, values: board.values };
};

describe('what the coach may draw, by rung', () => {
  const { finding, values } = findingOn('simple_coloring');

  it.each([0, 1, 2])('draws nothing at level %i', (level) => {
    // Withholding the cells *is* the meaning of the rungs below 3. Drawing
    // them would hand out level-3 content at level 1.
    expect(hintDrawing(finding, level, values)).toBeNull();
  });

  it('draws the pattern at level 3, and nothing it eliminates', () => {
    const drawing = hintDrawing(finding, 3, values)!;
    expect(drawing).not.toBeNull();
    for (const cell of finding.cells) expect(marked(drawing.marks[cell], MARK_ON)).toBe(true);
    // The rung the ladder is most likely to lose: a target here would be the
    // coach answering "so what" a level early.
    expect(drawing.marks.some((mark) => marked(mark, MARK_TARGET))).toBe(false);
    expect(finding.eliminations.length, 'this finding eliminates nothing to leak').toBeGreaterThan(0);
  });

  it('adds the amber targets at level 4', () => {
    const drawing = hintDrawing(finding, 4, values)!;
    for (const { cell } of finding.eliminations) {
      expect(marked(drawing.marks[cell], MARK_TARGET), `cell ${cell}`).toBe(true);
    }
  });
});

describe('a colouring the coach found', () => {
  const { finding, values } = findingOn('simple_coloring');

  it('alternates its two colours and draws its real links', () => {
    const drawing = hintDrawing(finding, 3, values)!;
    const alt = new Set(finding.cells.filter((cell) => marked(drawing.marks[cell], MARK_ALT)));
    expect(alt.size).toBeGreaterThan(0);
    expect(alt.size).toBeLessThan(finding.cells.length);
    expect(drawing.links.length).toBeGreaterThan(0);
    for (const [a, b] of drawing.links) {
      expect(alt.has(a), `${a}-${b} joins one colour to itself`).not.toBe(alt.has(b));
    }
  });

  it('numbers nothing, because a found chain has no order', () => {
    // A claim is a walk the player built, so its cells are numbered. This is a
    // connected component of the conjugate-pair graph: it can branch, and its
    // cells arrive in ascending order. Numbering would invent a sequence.
    expect(hintDrawing(finding, 3, values)!.order.size).toBe(0);
  });
});

describe('an xy-wing the coach found', () => {
  const { finding, values } = findingOn('xy_wing');

  it('tells the hinge from the arms, which a claim can only do after a check', () => {
    // The coach knows the roles because it found the pattern; nobody is being
    // asked to guess, so nothing is being answered for them.
    const drawing = hintDrawing(finding, 3, values)!;
    const solid = finding.cells.filter((cell) => !marked(drawing.marks[cell], 1 << 3));
    expect(solid).toHaveLength(1);
    expect(drawing.links).toHaveLength(2);
  });
});
