/**
 * One way of drawing a pattern on the board, for every technique that has one.
 *
 * Paolo, on the first chain: *"I feel the need to have consistent
 * representation also in x and xy wing and to have this consistent with the
 * exercise area."* Three techniques had grown three visual languages — a ring
 * for a fish, numbered nodes and lines for a colouring, and a third, flatter
 * ring on the exercise screen. This is the one language:
 *
 * - **A cell you have named is a ring.** Always, in every technique.
 * - **Two tones mean the pattern divides**, and nothing else does. A fish's
 *   corners are interchangeable, so they are all one tone; an XY-Wing's pivot
 *   is not its wings, so it takes the second; a colouring alternates, which is
 *   the same statement made link by link.
 * - **A line means a link the technique actually claims.** Fish have none.
 *
 * There are no numbers. They were here to make "breaks between 3 and 4"
 * countable, which was solving a problem the drawing can solve better: the
 * link that fails is simply drawn as the one that fails.
 */

import type { CellIndex } from '../../engine/types';

export type Tone = 'a' | 'b';

export interface PatternNode {
  cell: CellIndex;
  tone: Tone;
}

/**
 * Presentational, and deliberately ignorant of techniques: it is handed tones
 * and links, and knows nothing about pivots or conjugate pairs. The same
 * division `CoachPanel` keeps.
 */
export interface PatternOverlayProps {
  nodes: readonly PatternNode[];
  links?: readonly (readonly [CellIndex, CellIndex])[];
  /** The one link that does not hold, drawn as the thing that failed. */
  broken?: readonly [CellIndex, CellIndex] | null;
  /** The end a chain is being extended from. */
  active?: CellIndex | null;
}

const INK: Record<Tone, string> = {
  a: 'var(--color-entry)',
  b: 'var(--color-coach)',
};

const at = (cell: CellIndex) => ({ x: (cell % 9) + 0.5, y: Math.floor(cell / 9) + 0.5 });

export function PatternOverlay({ nodes, links = [], broken = null, active = null }: PatternOverlayProps) {
  if (nodes.length === 0) return null;
  const isBroken = (a: CellIndex, b: CellIndex) =>
    broken !== null && ((broken[0] === a && broken[1] === b) || (broken[0] === b && broken[1] === a));

  /*
   * `aspect-square` and pinned to the top, **not** `inset-0 h-full`.
   *
   * The box this sits in is the board's *slot*, which is the same shape as
   * the board only when the board is what constrains it. On a phone in
   * portrait the slot is bound by width and keeps the height nobody else
   * claimed — measured 369x558 around a 369x369 grid — and an SVG stretched
   * to that box scales its 9x9 viewBox to the width and then *centres* it
   * vertically, which is what `preserveAspectRatio` does by default. Every
   * ring it drew sat 93px, about two rows, below the cell it named. Landscape
   * is square, so the two coincide there, and landscape is where it was
   * checked.
   *
   * Squaring the element to the width makes the viewBox the grid's own
   * coordinate space again, in every arrangement.
   */
  return (
    <svg
      viewBox="0 0 9 9"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 aspect-square w-full"
    >
      {links.map(([a, b]) => {
        const from = at(a);
        const to = at(b);
        const failed = isBroken(a, b);
        return (
          <line
            key={`${a}-${b}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={failed ? 'var(--color-danger)' : 'var(--color-ink)'}
            strokeOpacity={failed ? 1 : 0.4}
            strokeWidth={failed ? 0.07 : 0.045}
            strokeDasharray={failed ? '0.16 0.12' : undefined}
          />
        );
      })}
      {nodes.map(({ cell, tone }) => {
        const point = at(cell);
        return (
          <circle
            key={cell}
            cx={point.x}
            cy={point.y}
            r={0.36}
            fill="none"
            stroke={INK[tone]}
            // The end you are extending, so a chain says which way it grows
            // without numbering every cell to do it.
            strokeWidth={cell === active ? 0.13 : 0.075}
          />
        );
      })}
    </svg>
  );
}
