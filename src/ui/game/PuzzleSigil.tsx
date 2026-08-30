/**
 * A saved game's own board, drawn at 40px.
 *
 * This is the progress indicator. A bar would tell you a number you can
 * already read next to it; the sigil tells you *where* you are — a board
 * filled from the top, a board with one stubborn empty box — and every saved
 * game gets a mark that is unmistakably its own. Givens sit in ink, the
 * player's own entries in blue, so the list also shows how much of it is
 * genuinely yours.
 *
 * Drawn as one SVG rather than 81 elements: it stays crisp at any size and
 * costs a single node subtree per row in the list.
 */

import type { Digit } from '../../engine/types';
import { cx } from '../primitives/cx';

export interface PuzzleSigilProps {
  /** 81-char puzzle string, '.' for empty. */
  givens: string;
  /** Current board values, 81 long. */
  values: readonly (Digit | null)[];
  /** Rendered px size; the drawing is resolution independent. */
  size?: number;
  className?: string;
}

const UNIT = 3;
const SPAN = UNIT * 9;

export function PuzzleSigil({ givens, values, size = 40, className }: PuzzleSigilProps) {
  const marks = [];
  for (let i = 0; i < 81; i++) {
    const value = values[i] ?? null;
    if (value === null) continue;
    const isGiven = givens[i] !== '.' && givens[i] !== '0';
    const x = (i % 9) * UNIT + 0.55;
    const y = Math.floor(i / 9) * UNIT + 0.55;
    marks.push(
      <rect
        key={i}
        x={x}
        y={y}
        width={UNIT - 1.1}
        height={UNIT - 1.1}
        rx={0.35}
        fill={isGiven ? 'var(--color-ink)' : 'var(--color-entry)'}
      />,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${SPAN} ${SPAN}`}
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      className={cx('shrink-0', className)}
    >
      <rect
        x={0.3}
        y={0.3}
        width={SPAN - 0.6}
        height={SPAN - 0.6}
        fill="none"
        stroke="var(--color-rule-strong)"
        strokeWidth={0.6}
      />
      {[1, 2].map((n) => (
        <g key={n} stroke="var(--color-rule)" strokeWidth={0.4}>
          <line x1={n * 9} y1={0} x2={n * 9} y2={SPAN} />
          <line x1={0} y1={n * 9} x2={SPAN} y2={n * 9} />
        </g>
      ))}
      {marks}
    </svg>
  );
}
