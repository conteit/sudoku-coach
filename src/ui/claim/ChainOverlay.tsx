/**
 * SPIKE (#140) — throwaway. Delete with the spike.
 *
 * A colouring chain drawn over the board: the cells you have named, in the
 * order you named them, joined by their links and two-coloured.
 *
 * An overlay rather than cell tints, for two reasons. The wash stack in
 * `Cell.tsx` is full and paints exactly one layer, so a chain would have to
 * fight the selection, the peer shading and the green — and `excluded` and
 * `match` are already separated by opacity alone (#125). But mostly: the
 * *links* are the technique. A chain drawn as cells is a set of cells again,
 * which is the thing this whole shape exists not to be.
 *
 * The two colours are `--color-entry` and `--color-coach`, which differ in
 * hue and in lightness and are both already checked against paper. Green is
 * deliberately not one of them — it means "cannot go here" everywhere else on
 * this board.
 */

import type { CellIndex } from '../../engine/types';

const COLORS = ['var(--color-entry)', 'var(--color-coach)'] as const;

const at = (cell: CellIndex) => ({ x: (cell % 9) + 0.5, y: Math.floor(cell / 9) + 0.5 });

export function ChainOverlay({ cells }: { cells: readonly CellIndex[] }) {
  if (cells.length === 0) return null;
  const points = cells.map(at);
  return (
    <svg
      viewBox="0 0 9 9"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {points.slice(1).map((point, i) => (
        <line
          key={`${cells[i]}-${cells[i + 1]}`}
          x1={points[i].x}
          y1={points[i].y}
          x2={point.x}
          y2={point.y}
          stroke="var(--color-ink)"
          strokeOpacity={0.45}
          strokeWidth={0.05}
        />
      ))}
      {points.map((point, i) => (
        <g key={cells[i]}>
          <circle cx={point.x} cy={point.y} r={0.34} fill="var(--color-paper-raised)" />
          <circle
            cx={point.x}
            cy={point.y}
            r={0.34}
            fill="none"
            stroke={COLORS[i % 2]}
            strokeWidth={0.09}
          />
          {/* The position in the chain, because "which link broke" is the
              verdict this shape gives and it has to be countable on screen. */}
          <text
            x={point.x}
            y={point.y + 0.11}
            textAnchor="middle"
            fill={COLORS[i % 2]}
            fontSize={0.34}
            fontWeight={700}
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
