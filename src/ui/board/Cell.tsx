/**
 * One cell of the board.
 *
 * PERFORMANCE CONTRACT — read before changing the props.
 *
 * Eighty-one of these are mounted for the whole session and a keystroke
 * changes at most a couple of them, so `Cell` is memoized and every prop is a
 * primitive that compares by value:
 *
 *  - candidates arrive as `marks`, a 9-bit mask, never as the `Set<Digit>` the
 *    engine models them with. A Set is a fresh object on every render and
 *    would defeat `memo` for all 81 cells on every keystroke.
 *  - the six highlight layers arrive as `flags`, one bitfield, so adding a
 *    layer never widens the comparison.
 *  - `onSelect` takes the cell index and is a single stable callback shared by
 *    all 81 cells. A per-cell `() => onSelect(i)` arrow would allocate 81 new
 *    functions per render and, again, defeat `memo`.
 *
 * The result: typing a digit re-renders the cell that changed, the cells whose
 * highlight changed, and nothing else.
 */

import { memo } from 'react';
import type { CellIndex, Digit } from '../../engine/types';
import { DIGITS } from '../../engine/types';
import { cellName, colOf, rowOf } from '../../engine/board';
import { cx } from '../primitives/cx';
import {
  CELL_CONFLICT,
  CELL_MATCH,
  CELL_SELECTED,
  CELL_SPOTLIGHT,
  CELL_HOUSE,
  CELL_PEER,
  hasFlag as has,
  maskHas,
} from './cellFlags';

export interface CellProps {
  index: CellIndex;
  value: Digit | null;
  given: boolean;
  /** 9-bit candidate mask — see `marksToMask`. */
  marks: number;
  flags: number;
  /** Digit the selection is about, so pencil marks for it can echo the match. */
  matchDigit: Digit | null;
  /** Roving tabindex: exactly one cell in the grid is 0. */
  tabIndex: number;
  onSelect: (cell: CellIndex) => void;
}

/**
 * Box rules are drawn as real borders on the cells themselves — right and
 * bottom only, so no edge is ever painted twice — with the outer frame left to
 * the grid container. Nested wrappers with margins would blur at fractional
 * sizes; a border always snaps to the device pixel.
 */
function edgeClasses(index: CellIndex): string {
  const row = rowOf(index);
  const col = colOf(index);
  const right =
    col === 8 ? '' : col % 3 === 2 ? 'border-r-2 border-r-rule-strong' : 'border-r border-r-rule';
  const bottom =
    row === 8 ? '' : row % 3 === 2 ? 'border-b-2 border-b-rule-strong' : 'border-b border-b-rule';
  return `${right} ${bottom}`;
}

/** Background layers, most specific first. Only one ever paints. */
function washClass(flags: number): string {
  if (has(flags, CELL_CONFLICT)) return 'bg-danger-wash';
  if (has(flags, CELL_MATCH)) return 'bg-match-wash';
  if (has(flags, CELL_SPOTLIGHT)) return 'bg-coach-wash';
  if (has(flags, CELL_SELECTED)) return 'bg-entry-wash';
  if (has(flags, CELL_HOUSE)) return 'bg-coach-wash/70';
  // Deliberately the quietest layer: twenty cells light up at once, and it has
  // to stay behind the selection ring and the match green in the hierarchy.
  if (has(flags, CELL_PEER)) return 'bg-paper-sunk/70';
  return '';
}

/**
 * Colour is never the only signal: a given is also 200 weight units heavier
 * than a player entry, which survives greyscale and colour-blind viewing.
 */
function digitClass(flags: number, given: boolean): string {
  const weight = given ? 'font-[640]' : 'font-[440]';
  if (has(flags, CELL_CONFLICT)) return `${weight} text-danger`;
  if (has(flags, CELL_MATCH)) return `${weight} text-match`;
  return `${weight} ${given ? 'text-ink' : 'text-entry'}`;
}

function describe(index: CellIndex, value: Digit | null, given: boolean, marks: number): string {
  const where = cellName(index);
  if (value !== null) return `${where}, ${value}${given ? ', given' : ''}`;
  const noted = DIGITS.filter((d) => maskHas(marks, d));
  return noted.length > 0 ? `${where}, empty, notes ${noted.join(', ')}` : `${where}, empty`;
}

function CellImpl({
  index,
  value,
  given,
  marks,
  flags,
  matchDigit,
  tabIndex,
  onSelect,
}: CellProps) {
  const selected = has(flags, CELL_SELECTED);

  return (
    <div
      role="gridcell"
      data-cell={index}
      data-given={given || undefined}
      data-match={has(flags, CELL_MATCH) || undefined}
      data-spotlight={has(flags, CELL_SPOTLIGHT) || undefined}
      data-conflict={has(flags, CELL_CONFLICT) || undefined}
      aria-selected={selected}
      aria-label={describe(index, value, given, marks)}
      tabIndex={tabIndex}
      onPointerDown={() => onSelect(index)}
      className={cx(
        'relative grid aspect-square cursor-pointer place-items-center select-none',
        'transition-colors duration-100 ease-snap outline-offset-[-2px]',
        edgeClasses(index),
        washClass(flags),
        // The selection ring is inset so it never nudges the grid geometry, and
        // it sits above the wash so a selected match still reads as selected.
        selected && 'z-10 shadow-[inset_0_0_0_2px_var(--color-ink)]',
        has(flags, CELL_SPOTLIGHT) && !selected && 'shadow-[inset_0_0_0_2px_var(--color-coach)]',
      )}
    >
      {value !== null ? (
        <span className={cx('digit text-[6.4cqw]', digitClass(flags, given))}>{value}</span>
      ) : (
        // All nine slots are always rendered, empty or not: a pencil mark's
        // position is a property of the digit, not of how many siblings it has
        // (R2). Aria-hidden because the cell's own label already lists them.
        <div aria-hidden="true" className="grid size-full grid-cols-3 grid-rows-3 p-[6%]">
          {DIGITS.map((digit) => (
            <span
              key={digit}
              data-slot={digit}
              data-marked={maskHas(marks, digit) || undefined}
              className={cx(
                'grid place-items-center text-[2.5cqw] leading-none tabular-nums',
                matchDigit === digit && maskHas(marks, digit)
                  ? 'font-semibold text-match'
                  : 'text-ink-faint',
              )}
            >
              {maskHas(marks, digit) ? digit : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const Cell = memo(CellImpl);
