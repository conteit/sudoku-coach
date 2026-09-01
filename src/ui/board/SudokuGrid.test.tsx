import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CellIndex, Digit } from '../../engine/types';
import { cellName, parseGrid } from '../../engine/board';
import { SudokuGrid, type GridCell } from './SudokuGrid';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function buildCells(
  marks: Record<number, Digit[]> = {},
  entries: Record<number, Digit> = {},
): GridCell[] {
  const values = parseGrid(PUZZLE);
  return values.map((value, index) => ({
    value: entries[index] ?? value,
    given: value !== null,
    candidates: new Set<Digit>(marks[index] ?? []),
  }));
}

/** The grid is controlled, so tests drive it through a minimal owner. */
function Harness({
  initialSelected = null,
  cells = buildCells(),
  onEnter,
  onClear,
  ...rest
}: {
  initialSelected?: CellIndex | null;
  cells?: GridCell[];
  onEnter?: (cell: CellIndex, digit: Digit) => void;
  onClear?: (cell: CellIndex) => void;
  highlightMatches?: boolean;
  highlightDigit?: Digit | null;
}) {
  const [selected, setSelected] = useState<CellIndex | null>(initialSelected);
  return (
    <SudokuGrid
      cells={cells}
      selected={selected}
      onSelect={setSelected}
      onEnter={onEnter}
      onClear={onClear}
      {...rest}
    />
  );
}

/** The cell a player would point at, found the way a screen reader names it. */
const cellAt = (index: CellIndex) =>
  screen.getByRole('gridcell', { name: new RegExp(`^${cellName(index)},`) });

/**
 * Text of the nine pencil-mark slots in reading order: slot 1 is top-left and
 * slot 9 is bottom-right, so the position of a mark in this array is the
 * position a player sees it in inside the cell.
 */
const markSlots = (index: CellIndex) =>
  Array.from(cellAt(index).querySelectorAll('[data-slot]')).map((el) => el.textContent);

describe('pencil marks', () => {
  it('puts every mark in its own fixed slot of the 3x3 mini-grid', () => {
    render(<Harness cells={buildCells({ 2: [1, 5, 9] })} />);

    expect(markSlots(2)).toEqual(['1', '', '', '', '5', '', '', '', '9']);
  });

  it('keeps a mark in place when a sibling is added or removed', () => {
    const { rerender } = render(<Harness cells={buildCells({ 2: [4] })} />);
    expect(markSlots(2)).toEqual(['', '', '', '4', '', '', '', '', '']);

    rerender(<Harness cells={buildCells({ 2: [1, 4, 8] })} />);
    expect(markSlots(2)).toEqual(['1', '', '', '4', '', '', '', '8', '']);

    rerender(<Harness cells={buildCells({ 2: [4, 8] })} />);
    expect(markSlots(2)).toEqual(['', '', '', '4', '', '', '', '8', '']);
  });

  it('reads the marks out as part of the cell, not as loose digits', () => {
    render(<Harness cells={buildCells({ 2: [1, 4] })} />);

    expect(screen.getByRole('gridcell', { name: 'r1c3, empty, notes 1, 4' })).toBeInTheDocument();
  });
});

describe('same-number highlight', () => {
  // The highlight is driven by highlightDigit, not by the selection (R3) — so
  // these render it directly rather than clicking a cell to derive it.
  it('highlights every placed occurrence of highlightDigit', () => {
    const values = parseGrid(PUZZLE);
    const fives = values.flatMap((value, index) => (value === 5 ? [index] : []));
    expect(fives.length).toBeGreaterThan(1);

    render(<Harness highlightDigit={5} />);

    for (const index of fives) expect(cellAt(index)).toHaveAttribute('data-match', 'true');

    const highlighted = document.querySelectorAll('[role="gridcell"][data-match="true"]');
    expect(highlighted).toHaveLength(fives.length);
  });

  it('highlights a player entry alongside the givens that match it', () => {
    // r1c3 is empty in the puzzle; the player writes a 5 into it.
    render(<Harness cells={buildCells({}, { 2: 5 })} highlightDigit={5} />);

    expect(cellAt(2)).toHaveAttribute('data-match', 'true');
    expect(cellAt(0)).toHaveAttribute('data-match', 'true');
  });

  it('keeps the same-digit highlight when the selection moves', async () => {
    const user = userEvent.setup();
    render(<Harness initialSelected={0} highlightDigit={5} />);
    // r1c1 is a given 5; the highlight is on 5 regardless of where the caret is.
    const before = screen.getByRole('gridcell', { name: /r1c1/ });
    expect(before).toHaveAttribute('data-match', 'true');
    await user.click(screen.getByRole('gridcell', { name: /r5c5/ }));
    expect(screen.getByRole('gridcell', { name: /r1c1/ })).toHaveAttribute('data-match', 'true');
  });

  it('draws no match layer when highlightDigit is null', () => {
    render(<Harness initialSelected={0} highlightDigit={null} />);
    expect(screen.getByRole('gridcell', { name: /r1c1/ })).not.toHaveAttribute('data-match');
  });
});

describe('givens', () => {
  it('never reports a change for a given cell', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    const onClear = vi.fn();
    render(<Harness onEnter={onEnter} onClear={onClear} />);

    await user.click(cellAt(0));
    await user.keyboard('9');
    await user.keyboard('{Backspace}');

    expect(onEnter).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(cellAt(0)).toHaveAccessibleName('r1c1, 5, given');
  });

  it('still lets the player select and move away from a given', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(cellAt(0));
    expect(cellAt(0)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(cellAt(1)).toHaveAttribute('aria-selected', 'true');
  });
});

describe('keyboard', () => {
  it('moves the selection with the arrow keys and stops at the edges', async () => {
    const user = userEvent.setup();
    render(<Harness initialSelected={0} />);

    await user.click(cellAt(0));
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(cellAt(10)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowLeft}{ArrowLeft}');
    expect(cellAt(0)).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the ends of the row with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness initialSelected={13} />);

    await user.click(cellAt(13));
    await user.keyboard('{End}');
    expect(cellAt(17)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(cellAt(9)).toHaveAttribute('aria-selected', 'true');
  });

  it('writes a typed digit into the selected cell and clears it again', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    const onClear = vi.fn();
    render(<Harness onEnter={onEnter} onClear={onClear} />);

    await user.click(cellAt(2));
    await user.keyboard('7');
    expect(onEnter).toHaveBeenCalledWith(2, 7);

    await user.keyboard('{Backspace}');
    expect(onClear).toHaveBeenCalledWith(2);

    await user.keyboard('{Delete}');
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it('keeps exactly one cell in the tab order', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const tabbable = () =>
      Array.from(document.querySelectorAll('[role="gridcell"][tabindex="0"]'));
    expect(tabbable()).toHaveLength(1);

    await user.click(cellAt(40));
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(cellAt(40));
    expect(cellAt(40)).toHaveFocus();
  });
});

describe('coach and conflict layers', () => {
  it('spotlights the cells and tints the houses a hint names', () => {
    render(
      <SudokuGrid
        cells={buildCells()}
        selected={null}
        onSelect={() => undefined}
        spotlight={[27, 36]}
        tintedHouses={[{ kind: 'box', index: 3 }]}
      />,
    );

    expect(cellAt(27)).toHaveAttribute('data-spotlight', 'true');
    expect(cellAt(36)).toHaveAttribute('data-spotlight', 'true');
    expect(cellAt(0)).not.toHaveAttribute('data-spotlight');
  });

  it('flags conflicts only when asked to', () => {
    const { rerender } = render(
      <SudokuGrid cells={buildCells()} selected={null} onSelect={() => undefined} />,
    );
    expect(document.querySelectorAll('[data-conflict]')).toHaveLength(0);

    rerender(
      <SudokuGrid
        cells={buildCells()}
        selected={null}
        onSelect={() => undefined}
        conflicts={[30, 34]}
      />,
    );
    expect(cellAt(30)).toHaveAttribute('data-conflict', 'true');
  });
});
