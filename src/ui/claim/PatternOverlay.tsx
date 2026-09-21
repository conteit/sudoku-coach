/**
 * One way of drawing a pattern on the board, for every technique that has one.
 *
 * Paolo, on the first chain: *"I feel the need to have consistent
 * representation also in x and xy wing and to have this consistent with the
 * exercise area."* Three techniques had grown three visual languages — a ring
 * for a fish, numbered nodes and lines for a colouring, and a third, flatter
 * ring on the exercise screen. This is the one language:
 *
 * What is left here is the part that is **chrome rather than content**: the
 * links between cells, and the numbered chips that say where in a chain each
 * cell falls. The rings and squares moved into `Cell`, because a mark that
 * belongs to a cell has to paint *under* that cell's digits and marks, and
 * nothing stuck on top of the grid can do that at any z-index.
 *
 * The chips are **inverted** — a filled disc with a paper-coloured numeral —
 * and sit on the vertex where four cells meet. Both decisions answer the same
 * question, which Paolo put as "how to distinguish notes from circle number":
 * every digit and every mark on this board is dark ink on paper, so nothing
 * inverted can be read as content, and a vertex is the one place on the grid
 * that belongs to no note slot.
 */

import { MARK_ALT, marked } from '../board/patternMark';
import type { CellIndex } from '../../engine/types';

/**
 * Presentational, and deliberately ignorant of techniques: it is handed tones
 * and links, and knows nothing about pivots or conjugate pairs. The same
 * division `CoachPanel` keeps.
 */
export interface PatternOverlayProps {
  links?: readonly (readonly [CellIndex, CellIndex])[];
  /** Where in a chain each cell falls; drawn as a chip on the cell's corner. */
  order?: ReadonlyMap<CellIndex, number>;
  /**
   * The same per-cell bitfields the board is drawing, read for one thing only:
   * which of a colouring's two colours the chip belongs to. Without it every
   * chip is one colour, which says *these are all the same* over rings that
   * say the opposite — and in a colouring the alternation is the argument.
   */
  marks?: readonly number[];
  /** The one link that does not hold, drawn as the thing that failed. */
  broken?: readonly [CellIndex, CellIndex] | null;
}

const at = (cell: CellIndex) => ({ x: (cell % 9) + 0.5, y: Math.floor(cell / 9) + 0.5 });

/**
 * Half the ring's width, plus a hair, in cell units — `Cell` draws the ring at
 * `size-[74%]`, so it reaches 0.37 from the centre.
 */
const RING = 0.41;

/**
 * A link, drawn between the two rings rather than between the two centres.
 *
 * Paolo: *"why the circle is crossed by the connecting lines?"* Because they
 * were drawn centre to centre, which puts a stroke straight through both rings
 * and through whatever the cells contain. A link is a statement about the two
 * cells, not a line that has to reach their middles, so it stops where each
 * ring begins and the rings stay closed.
 *
 * Trimming is clamped: two cells could in principle sit closer together than
 * two ring radii, and a segment that has been shortened past its own midpoint
 * would be drawn backwards.
 */
const between = (a: CellIndex, b: CellIndex) => {
  const from = at(a);
  const to = at(b);
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const trim = Math.min(RING, span / 2 - 0.02);
  const ux = (to.x - from.x) / span;
  const uy = (to.y - from.y) / span;
  return {
    x1: from.x + ux * trim,
    y1: from.y + uy * trim,
    x2: to.x - ux * trim,
    y2: to.y - uy * trim,
  };
};

/**
 * A vertex of the cell — where four cells meet, which is the one place on the
 * grid that belongs to no note slot.
 *
 * The top-left one, except along the board's top and left edges, where it is
 * the board's own outer corner and half the chip would be drawn outside the
 * viewBox and clipped. There the opposite vertex is used: still a vertex, so
 * still clear of every note, and always inside the board. Nudging it inward
 * instead would push it onto a note's centre, which is the thing this
 * placement exists to avoid.
 */
const corner = (cell: CellIndex) => {
  const col = cell % 9;
  const row = Math.floor(cell / 9);
  return { x: col === 0 ? 1 : col, y: row === 0 ? 1 : row };
};

export function PatternOverlay({ links = [], order, marks, broken = null }: PatternOverlayProps) {
  const chips = [...(order ?? new Map())];
  if (links.length === 0 && chips.length === 0) return null;

  const isBroken = (a: CellIndex, b: CellIndex) =>
    broken !== null && ((broken[0] === a && broken[1] === b) || (broken[0] === b && broken[1] === a));

  return (
    <svg
      viewBox="0 0 9 9"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 aspect-square w-full"
    >
      {links.map(([a, b]) => {
        const failed = isBroken(a, b);
        return (
          <line
            key={`${a}-${b}`}
            {...between(a, b)}
            stroke={failed ? 'var(--color-danger)' : 'var(--color-ink)'}
            strokeOpacity={failed ? 1 : 0.4}
            strokeWidth={failed ? 0.07 : 0.045}
            strokeDasharray={failed ? '0.16 0.12' : undefined}
          />
        );
      })}
      {chips.map(([cell, position]) => {
        const point = corner(cell);
        const tone = marked(marks?.[cell] ?? 0, MARK_ALT)
          ? 'var(--color-ink-soft)'
          : 'var(--color-entry)';
        return (
          <g key={cell}>
            {/* `Cell` lays its marks out as a 3x3 grid with `p-[6%]`, which
                puts a slot's centre 0.207 of a cell in from the corner on
                *each axis* — so the distance from the vertex to the nearest
                note is the diagonal, 0.29, not 0.207. Sized against that:
                0.19 keeps a tenth of a cell of clearance and still gives the
                numeral room to be read at phone size. */}
            <circle cx={point.x} cy={point.y} r={0.19} fill={tone} />
            <text
              x={point.x}
              y={point.y + 0.08}
              textAnchor="middle"
              fill="var(--color-paper-raised)"
              fontSize={0.26}
              fontWeight={700}
            >
              {position}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
