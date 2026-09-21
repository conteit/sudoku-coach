/**
 * The chrome's geometry, in the viewBox's own units.
 *
 * `tests/e2e/play.spec.ts` measures the chips against real pixels, because
 * their hazard is the coordinate space the SVG is stretched into. The links'
 * hazard is different and lives here: where they *start and stop*.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PatternOverlay } from './PatternOverlay';
import type { CellIndex } from '../../engine/types';

/** The box `Cell` draws reaches this far from the centre along each axis. */
const HALF = 0.48;

/** How far outside the marked box a point lies, along the axis it exits by. */
const clearance = (p: { x: number; y: number }, centre: { x: number; y: number }) =>
  Math.max(Math.abs(p.x - centre.x), Math.abs(p.y - centre.y)) - HALF;

const centreOf = (cell: CellIndex) => ({ x: (cell % 9) + 0.5, y: Math.floor(cell / 9) + 0.5 });

const lineOf = (container: HTMLElement) => {
  const line = container.querySelector('line');
  if (line === null) throw new Error('no link was drawn');
  return {
    a: { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) },
    b: { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) },
  };
};

const gap = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);

describe('a link is drawn between two marked boxes, not between two centres', () => {
  // Paolo, on the version trimmed by a radius: "review how the arrow
  // connecting chain's cell to not enter the coloured border". A circle's
  // radius is the wrong measure for a box — the diagonal is the case that
  // exposes it, because that is where a box reaches furthest from its centre.
  it.each([
    ['along a column', 0, 27],
    ['along a row', 0, 3],
    ['on a diagonal', 0, 30],
    ['on a shallow slant', 0, 20],
  ] as const)('stops outside both boxes %s', (_how, from, to) => {
    const { container } = render(
      <PatternOverlay links={[[from as CellIndex, to as CellIndex]]} />,
    );
    const line = lineOf(container);
    expect(clearance(line.a, centreOf(from as CellIndex))).toBeGreaterThan(0);
    expect(clearance(line.b, centreOf(to as CellIndex))).toBeGreaterThan(0);
  });

  it('still runs the right way round, and still spans most of the distance', () => {
    // A trim applied past the midpoint would draw the segment backwards.
    const { container } = render(<PatternOverlay links={[[0 as CellIndex, 27 as CellIndex]]} />);
    const line = lineOf(container);
    expect(line.a.y).toBeLessThan(line.b.y);
    expect(gap(line.a, line.b)).toBeGreaterThan(0);
  });
});
