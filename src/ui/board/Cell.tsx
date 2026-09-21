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

import { memo, type CSSProperties } from 'react';
import type { CellIndex, Digit } from '../../engine/types';
import { MARK_ALT, MARK_DASHED, MARK_ON, MARK_TARGET, marked } from './patternMark';
import { DIGITS } from '../../engine/types';
import { cellName, colOf, rowOf } from '../../engine/board';
import { useT, type Translate } from '../../i18n/locale';
import { cx } from '../primitives/cx';
import { useLongPress } from '../primitives/useLongPress';
import {
  CELL_CONFLICT,
  CELL_EXCLUDED,
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
  /**
   * The pattern mark, if this cell is carrying one.
   *
   * A bitfield, like `flags` and for the same reason — see `patternMark.ts`.
   *
   * Rendered as the cell's **first child**, which is what puts it above the
   * wash and below the digit and the pencil marks. Paolo, on the version that
   * drew it over the top: "ok the circle, but probably it should be below the
   * numbers in the cell". An overlay stuck on the grid cannot do that at any
   * z-index — the content is inside the cells, so the mark has to be too.
   */
  mark?: number;
  value: Digit | null;
  given: boolean;
  /** 9-bit candidate mask — see `marksToMask`. */
  marks: number;
  /**
   * Subset of `marks` that a placed peer has already ruled out. Struck through
   * rather than hidden: the player wrote them, and they disappear when the
   * player says so.
   */
  stale: number;
  flags: number;
  /** Digit the selection is about, so pencil marks for it can echo the match. */
  matchDigit: Digit | null;
  /** Draw a player entry in the entry colour rather than the givens' ink. */
  colorEntries: boolean;
  /**
   * The board is solved and this cell is taking its turn in the celebration.
   * `null` when there is nothing to celebrate; a delay in milliseconds when
   * there is, which is what makes the flip a wave rather than a flash.
   */
  winDelayMs: number | null;
  /** Roving tabindex: exactly one cell in the grid is 0. */
  tabIndex: number;
  onSelect: (cell: CellIndex) => void;
  /**
   * The cell was *pressed*, as opposed to merely selected. Selection also
   * happens when the caret is walked here with the arrow keys, and a caret
   * passing over a cell must never change it.
   */
  onActivate?: (cell: CellIndex) => void;
  /**
   * Held past the long-press threshold.
   *
   * A different gesture from `onActivate` on purpose: activation is a tap,
   * and a tap must stay able to move the caret without writing anything.
   *
   * Like every other callback here this must be ONE stable function for all
   * 81 cells (see the memo contract at the top of this file) — the cell index
   * comes back as the argument.
   */
  onLongPress?: (cell: CellIndex) => void;
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
  // Above the selection's peer shading, and that ordering is a choice worth
  // stating: a player with this on has asked where a digit cannot go, and the
  // twenty cells around the caret are exactly the ones they are looking at. A
  // grey peer wash painting over the green there would hide the answer in the
  // one place it was wanted. The selection is still unmistakable — it carries
  // a ring, not a wash.
  if (has(flags, CELL_EXCLUDED)) return 'bg-match-wash/40';
  // Deliberately the quietest layer: twenty cells light up at once, and it has
  // to stay behind the selection ring and the match green in the hierarchy.
  if (has(flags, CELL_PEER)) return 'bg-paper-sunk/70';
  return '';
}

/**
 * Colour is never the only signal: a given is also 200 weight units heavier
 * than a player entry, which survives greyscale and colour-blind viewing.
 *
 * That is also what makes the entry colour safe to switch off — `colorEntries`
 * takes away the blue, never the weight, so a board with it off still tells
 * the player which digits are theirs.
 */
function digitClass(flags: number, given: boolean, colorEntries: boolean): string {
  const weight = given ? 'font-[640]' : 'font-[440]';
  if (has(flags, CELL_CONFLICT)) return `${weight} text-danger`;
  if (has(flags, CELL_MATCH)) return `${weight} text-match`;
  return `${weight} ${given || !colorEntries ? 'text-ink' : 'text-entry'}`;
}

function describe(
  t: Translate,
  index: CellIndex,
  value: Digit | null,
  given: boolean,
  marks: number,
  stale: number,
): string {
  const cell = cellName(index);
  if (value !== null) {
    return given ? t('cell.valueGiven', { cell, digit: value }) : t('cell.value', { cell, digit: value });
  }
  const noted = DIGITS.filter((d) => maskHas(marks, d));
  if (noted.length === 0) return t('cell.empty', { cell });
  const dead = DIGITS.filter((d) => maskHas(stale, d));
  const label = t('cell.emptyNotes', { cell, notes: noted.join(', ') });
  // Colour and a strike-through are not available to a screen reader, so the
  // same fact is said in words.
  return dead.length > 0 ? `${label} ${t('cell.notesStale', { notes: dead.join(', ') })}` : label;
}

function CellImpl({
  index,
  mark = 0,
  value,
  given,
  marks,
  stale,
  flags,
  matchDigit,
  colorEntries,
  winDelayMs,
  tabIndex,
  onSelect,
  onActivate,
  onLongPress,
}: CellProps) {
  const t = useT();
  const selected = has(flags, CELL_SELECTED);
  const press = useLongPress<CellIndex>({ onLongPress: (c) => onLongPress?.(c) });

  return (
    <div
      role="gridcell"
      data-cell={index}
      data-given={given || undefined}
      data-match={has(flags, CELL_MATCH) || undefined}
      data-excluded={has(flags, CELL_EXCLUDED) || undefined}
      data-spotlight={has(flags, CELL_SPOTLIGHT) || undefined}
      // The bitfield itself, alongside the other layers that already publish
      // themselves this way. A ring's meaning is carried by a border colour
      // and a border style, and a test that reads those is a test of Tailwind;
      // this is the fact underneath them.
      data-mark={mark === 0 ? undefined : mark}
      data-conflict={has(flags, CELL_CONFLICT) || undefined}
      aria-selected={selected}
      aria-label={describe(t, index, value, given, marks, stale)}
      tabIndex={tabIndex}
      onPointerDown={(event) => {
        onSelect(index);
        onActivate?.(index);
        press.start(index, event.clientX, event.clientY);
      }}
      onPointerMove={(event) => press.move(event.clientX, event.clientY)}
      onPointerUp={press.end}
      onPointerLeave={press.end}
      onPointerCancel={press.end}
      // The platform's own long press has to lose to this one, exactly as on
      // the keypad: a held finger otherwise raises a selection callout.
      onContextMenu={(event) => event.preventDefault()}
      // The delay rides a custom property rather than `animationDelay`
      // directly, so the timing stays the grid's business and the animation
      // itself stays in the stylesheet with the keyframes it belongs to.
      style={winDelayMs === null ? undefined : ({ '--win-delay': `${winDelayMs}ms` } as CSSProperties)}
      className={cx(
        'relative grid aspect-square cursor-pointer place-items-center select-none',
        'transition-colors duration-100 ease-snap outline-offset-[-2px]',
        edgeClasses(index),
        washClass(flags),
        // The selection ring is inset so it never nudges the grid geometry, and
        // it sits above the wash so a selected match still reads as selected.
        selected && 'z-10 shadow-[inset_0_0_0_2px_var(--color-ink)]',
        has(flags, CELL_SPOTLIGHT) && !selected && 'shadow-[inset_0_0_0_2px_var(--color-coach)]',
        winDelayMs !== null && 'cell-win',
      )}
    >
      {marked(mark, MARK_ON) ? (
        <span
          aria-hidden="true"
          className={cx(
            // The cell's own edge, not a shape drawn inside it. Paolo, on the
            // circle that was: "it feels like the circle crosses all the
            // numbers, it is disturbing... the idea of a shape in the cell is
            // a bit annoying". He was right, and not only about the look: a
            // ring big enough to read is a ring wide enough to pass through
            // four of the nine pencil-mark slots, so *every* size was a choice
            // about which notes to strike through. An outline hugging the cell
            // crosses nothing at any size.
            //
            // `inset-[5%]` puts it between the box rule and the note grid,
            // which starts at `p-[6%]` — clear of both.
            'pointer-events-none absolute rounded-[0.6cqw]',
            marked(mark, MARK_TARGET)
              ? // The whole cell, filled — the treatment Paolo picked out of
                // the old Learn screenshot for "cells I can clear notes from".
                // A wash is right here and nowhere else in this language: the
                // pattern is cells to look *at*, and a target is a cell
                // something happens *to*.
                'inset-0 border-[0.38cqw] border-coach bg-coach-wash'
              : // A box *inside* the cell rather than a second cell border —
                // Paolo: "not exactly on the edge". The inset plus the stroke
                // has to stay inside the note grid's own `p-[6%]` gutter, or
                // the mark is back to crossing the notes; 2% + 0.3cqw is 4.7%
                // of a cell, and both scale with the grid, so that holds at
                // every board size.
                cx(
                  'inset-[2%] border-[0.3cqw]',
                  marked(mark, MARK_ALT) ? 'border-ink-soft' : 'border-entry',
                ),
            marked(mark, MARK_DASHED) ? 'border-dashed' : 'border-solid',
          )}
        />
      ) : null}
      {/* `relative` on both, and it is load-bearing rather than tidy: the mark
          above is absolutely positioned, and a positioned element paints over
          a static sibling however late that sibling comes in the DOM. While
          the mark was a bare border that was invisible; the moment a target
          gained its wash it painted straight over the cell's own notes.
          Positioning the content puts DOM order back in charge. */}
      {value !== null ? (
        <span className={cx('digit relative text-[6.4cqw]', digitClass(flags, given, colorEntries))}>
          {value}
        </span>
      ) : (
        // All nine slots are always rendered, empty or not: a pencil mark's
        // position is a property of the digit, not of how many siblings it has
        // (R2). Aria-hidden because the cell's own label already lists them.
        <div aria-hidden="true" className="relative grid size-full grid-cols-3 grid-rows-3 p-[6%]">
          {DIGITS.map((digit) => (
            <span
              key={digit}
              data-slot={digit}
              data-marked={maskHas(marks, digit) || undefined}
              data-stale={maskHas(stale, digit) || undefined}
              className={cx(
                'grid place-items-center text-[2.5cqw] leading-none tabular-nums',
                maskHas(stale, digit)
                  ? 'text-danger line-through decoration-[0.4cqw]'
                  : matchDigit === digit && maskHas(marks, digit)
                    ? 'font-semibold text-match'
                    : // Heavier wherever a mark is drawn behind them. Paolo:
                      // "can't we make notes bold to better stand out?" — the
                      // ring is quiet, but `ink-faint` is quieter still, and a
                      // cell the app has drawn on is exactly the cell whose
                      // contents the player is trying to read. Only there:
                      // pencil marks are working, not content, and eighty-one
                      // cells of bold would make the board shout.
                      marked(mark, MARK_ON)
                      ? 'font-semibold text-ink-soft'
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
