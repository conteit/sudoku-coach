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

/** The ring `Cell` draws reaches this far from the cell's centre: half of 74%. */
const RING_RADIUS = 0.37;

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

describe('a link is drawn between two rings, not between two centres', () => {
  // Paolo: "why the circle is crossed by the connecting lines?" — because they
  // ran centre to centre, straight through both rings and whatever the cells
  // hold.
  it.each([
    ['along a column', 0, 9],
    ['along a row', 0, 8],
    ['on a diagonal', 0, 40],
  ] as const)('clears both rings %s', (_how, from, to) => {
    const { container } = render(
      <PatternOverlay links={[[from as CellIndex, to as CellIndex]]} />,
    );
    const line = lineOf(container);
    expect(gap(line.a, centreOf(from as CellIndex))).toBeGreaterThanOrEqual(RING_RADIUS);
    expect(gap(line.b, centreOf(to as CellIndex))).toBeGreaterThanOrEqual(RING_RADIUS);
  });

  it('still runs the right way round, and still spans most of the distance', () => {
    // A trim applied past the midpoint would draw the segment backwards.
    const { container } = render(<PatternOverlay links={[[0 as CellIndex, 9 as CellIndex]]} />);
    const line = lineOf(container);
    expect(line.a.y).toBeLessThan(line.b.y);
    expect(gap(line.a, line.b)).toBeGreaterThan(0);
  });
});
