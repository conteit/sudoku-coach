/**
 * The 9x9 board.
 *
 * Layout: a single CSS grid of 81 cells. The row wrappers exist only for the
 * accessibility tree and carry `display: contents`, so the cells stay direct
 * grid items and the geometry is one grid, not nine nested ones.
 *
 * Sizing: the grid is a container-query context, so everything inside — digits,
 * pencil marks — is expressed in `cqw` and scales with the board instead of
 * with the viewport. One `aspect-square` keeps it square at any width with no
 * layout shift while the fonts load.
 *
 * The component is presentational: it owns no board state, takes highlight
 * layers as plain index arrays, and reports intent through callbacks.
 */

import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import type { CellIndex, Digit, HouseKind } from '../../engine/types';
import { CELL_COUNT, HOUSES, SIZE, colOf, peersOf, rowOf } from '../../engine/board';
import { Cell } from './Cell';
import {
  CELL_CONFLICT,
  CELL_HOUSE,
  CELL_MATCH,
  CELL_PEER,
  CELL_SELECTED,
  CELL_SPOTLIGHT,
  marksToMask,
} from './cellFlags';
import { cx } from '../primitives/cx';
import { useT } from '../../i18n/locale';

/** The shape the grid needs from a cell — a structural subset of engine `Cell`. */
export interface GridCell {
  value: Digit | null;
  given: boolean;
  candidates: Iterable<Digit>;
}

export interface HouseRef {
  kind: HouseKind;
  /** 0..8 within its kind. */
  index: number;
}

export interface SudokuGridProps {
  /** Exactly 81, in engine order. */
  cells: readonly GridCell[];
  selected: CellIndex | null;
  onSelect: (cell: CellIndex) => void;
  /** Digit typed into a cell. Never fired for a given (R2). */
  onEnter?: (cell: CellIndex, digit: Digit) => void;
  /** Backspace / Delete on a cell. Never fired for a given. */
  onClear?: (cell: CellIndex) => void;
  /** Coach spotlight, disclosure level 3+. */
  spotlight?: readonly CellIndex[];
  /** Houses the coach is tinting, disclosure level 1+. */
  tintedHouses?: readonly HouseRef[];
  /** Cells to flag as duplicated. Opt-in: conflict flagging is a setting. */
  conflicts?: readonly CellIndex[];
  /** Per cell, the noted digits a placed peer has already ruled out. */
  staleMarks?: readonly (readonly Digit[])[];
  /**
   * Whether the grid takes part in the tab order at all.
   *
   * A playable board does: one cell holds `tabIndex={0}` (the roving tabindex
   * a `role="grid"` is expected to have) and the arrow keys move from there.
   * An illustration does not — `Example` renders a grid whose `onSelect` is a
   * no-op, so a keyboard user who lands in it can neither move nor leave by
   * any means except tabbing straight back out. That is a dead stop, not an
   * affordance, and beside a live board it is a dead stop *inside* the
   * player's path off the keypad.
   */
  focusable?: boolean;
  /** Shade the selection's row, column and box. */
  highlightPeers?: boolean;
  /** Green same-number highlight across the board (R3). */
  highlightMatches?: boolean;
  /**
   * The digit the green layer is on, independent of the selection (R3).
   *
   * Derived from the selected cell it could not survive moving the caret,
   * which is the one thing a player uses it for: scanning the grid for where
   * else this digit can go.
   */
  highlightDigit?: Digit | null;
  /**
   * Also echo the green onto pencil marks that match `highlightDigit`, not
   * just placed digits. Independent of `highlightMatches`: that one turns the
   * whole layer off, this one only decides whether it reaches into notes. The
   * app itself defaults this to off (a player setting) — every note it would
   * light is a square the digit could still go, which is the elimination the
   * coach exists to make the player find for themselves.
   */
  highlightMatchingNotes?: boolean;
  /**
   * Draw the player's own entries in the entry colour. A player setting: off
   * takes away the blue and leaves the weight difference, which is the signal
   * that survives greyscale anyway.
   */
  colorEntries?: boolean;
  /** Accessible name for the grid. Defaults to the localized board name. */
  label?: string;
  className?: string;
}

const ROW_INDEXES = Array.from({ length: SIZE }, (_, r) => r);

export function SudokuGrid({
  cells,
  selected,
  onSelect,
  onEnter,
  onClear,
  spotlight,
  tintedHouses,
  conflicts,
  staleMarks,
  focusable = true,
  highlightPeers = true,
  highlightMatches = true,
  highlightDigit = null,
  highlightMatchingNotes = true,
  colorEntries = true,
  label,
  className,
}: SudokuGridProps) {
  const t = useT();
  const gridRef = useRef<HTMLDivElement>(null);

  const masks = useMemo(() => {
    const out = new Uint16Array(CELL_COUNT);
    for (let i = 0; i < cells.length; i++) out[i] = marksToMask(cells[i].candidates);
    return out;
  }, [cells]);

  const staleMasks = useMemo(() => {
    const out = new Uint16Array(CELL_COUNT);
    if (staleMarks === undefined) return out;
    for (let i = 0; i < staleMarks.length; i++) out[i] = marksToMask(staleMarks[i]);
    return out;
  }, [staleMarks]);

  // One pass builds every highlight layer into a byte per cell. Cells compare
  // that byte, so a selection change re-renders only the cells whose byte moved.
  const flags = useMemo(() => {
    const out = new Uint8Array(CELL_COUNT);
    if (selected !== null) {
      out[selected] |= CELL_SELECTED;
      if (highlightPeers) for (const peer of peersOf(selected)) out[peer] |= CELL_PEER;
    }
    if (highlightMatches && highlightDigit !== null) {
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].value === highlightDigit) out[i] |= CELL_MATCH;
      }
    }
    for (const house of tintedHouses ?? []) {
      const found = HOUSES.find((h) => h.kind === house.kind && h.index === house.index);
      for (const cell of found?.cells ?? []) out[cell] |= CELL_HOUSE;
    }
    for (const cell of spotlight ?? []) out[cell] |= CELL_SPOTLIGHT;
    for (const cell of conflicts ?? []) out[cell] |= CELL_CONFLICT;
    return out;
  }, [cells, selected, highlightDigit, spotlight, tintedHouses, conflicts, highlightPeers, highlightMatches]);

  const move = useCallback(
    (from: CellIndex, dRow: number, dCol: number) => {
      const row = Math.min(SIZE - 1, Math.max(0, rowOf(from) + dRow));
      const col = Math.min(SIZE - 1, Math.max(0, colOf(from) + dCol));
      const next = row * SIZE + col;
      if (next !== from) onSelect(next);
    },
    [onSelect],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const cell = selected ?? 0;
      const { key } = event;

      switch (key) {
        case 'ArrowUp':
          event.preventDefault();
          move(cell, -1, 0);
          return;
        case 'ArrowDown':
          event.preventDefault();
          move(cell, 1, 0);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          move(cell, 0, -1);
          return;
        case 'ArrowRight':
          event.preventDefault();
          move(cell, 0, 1);
          return;
        case 'Home':
          event.preventDefault();
          onSelect(rowOf(cell) * SIZE);
          return;
        case 'End':
          event.preventDefault();
          onSelect(rowOf(cell) * SIZE + (SIZE - 1));
          return;
        default:
          break;
      }

      // A given is immutable: it swallows the keystroke rather than reporting
      // a change nobody is allowed to make (R2).
      if (cells[cell]?.given) return;

      if (key >= '1' && key <= '9') {
        event.preventDefault();
        onEnter?.(cell, Number(key) as Digit);
        return;
      }
      if (key === 'Backspace' || key === 'Delete' || key === '0') {
        event.preventDefault();
        onClear?.(cell);
      }
    },
    [cells, selected, move, onSelect, onEnter, onClear],
  );

  // Keep DOM focus on the selected cell, but only once the grid already holds
  // focus — otherwise setting the selection from elsewhere (a hint, a restored
  // game) would yank focus away from whatever the player was using.
  useEffect(() => {
    const root = gridRef.current;
    if (selected === null || !root || !root.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>(`[data-cell="${selected}"]`)?.focus();
  }, [selected]);

  // Which single cell carries `tabIndex={0}` — the roving tabindex a grid
  // widget owes the tab order. An unfocusable grid has no such cell at all,
  // so `-1` (no index) leaves every one of the 81 at `tabIndex={-1}`.
  const rovingCell = focusable ? (selected ?? 0) : -1;

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={label ?? t('board.label')}
      onKeyDown={onKeyDown}
      className={cx(
        '@container grid aspect-square w-full grid-cols-9 grid-rows-9',
        'border-2 border-rule-strong bg-paper-raised',
        className,
      )}
    >
      {ROW_INDEXES.map((row) => (
        // display:contents — present for screen readers, invisible to layout.
        <div key={row} role="row" className="contents">
          {ROW_INDEXES.map((col) => {
            const index = row * SIZE + col;
            const cell = cells[index];
            return (
              <Cell
                key={index}
                index={index}
                value={cell?.value ?? null}
                given={cell?.given ?? false}
                marks={masks[index]}
                stale={staleMasks[index]}
                flags={flags[index]}
                matchDigit={highlightMatches && highlightMatchingNotes ? highlightDigit : null}
                colorEntries={colorEntries}
                tabIndex={index === rovingCell ? 0 : -1}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
