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
  highlightMatchingNotes?: boolean;
  celebrate?: boolean;
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

describe('matching-notes echo', () => {
  // r1c3 (index 2) is empty in PUZZLE, so it can carry a pencil mark for 5
  // without also being a placed match — the note styling is the only thing
  // under test here.
  const notedSlot = () => cellAt(2).querySelector('[data-slot="5"]');

  it('leaves matching notes alone when the setting is off — that would point at every square the digit could still go', () => {
    render(<Harness cells={buildCells({ 2: [5] })} highlightDigit={5} highlightMatchingNotes={false} />);
    expect(notedSlot()).not.toHaveClass('text-match');
  });

  it('echoes onto matching notes when the setting is on', () => {
    render(<Harness cells={buildCells({ 2: [5] })} highlightDigit={5} highlightMatchingNotes />);
    expect(notedSlot()).toHaveClass('text-match');
  });

  it('does not echo a note for a digit other than the one highlighted', () => {
    render(<Harness cells={buildCells({ 2: [4] })} highlightDigit={5} highlightMatchingNotes />);
    expect(cellAt(2).querySelector('[data-slot="4"]')).not.toHaveClass('text-match');
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


/**
 * The finished board turns itself over and comes back gold.
 *
 * Asserted through the class and the per-cell delay rather than through
 * anything visual: jsdom runs no animations and applies no stylesheet, so
 * what a unit test can honestly hold is *which* cells were told to flip and
 * *when* each was told to start. The keyframes themselves are one block in
 * `index.css` with the reduced-motion rule already sitting over them.
 */
describe('the win', () => {
  it('leaves the board alone until there is something to celebrate', () => {
    render(<Harness />);

    expect(cellAt(0).className).not.toContain('cell-win');
    expect(cellAt(0).getAttribute('style')).toBeNull();
  });

  it('falls row by row, scattered within each row', () => {
    render(<Harness celebrate />);

    expect(cellAt(0).className).toContain('cell-win');

    const delayOf = (cell: number): number =>
      Number(cellAt(cell as CellIndex).style.getPropertyValue('--win-delay').replace('ms', ''));

    // It falls: every cell of row 3 starts after every cell of row 1, however
    // the scatter lands. That is the difference between rain and a curtain
    // being drawn sideways.
    const row1 = Array.from({ length: 9 }, (_, col) => delayOf(col));
    const row3 = Array.from({ length: 9 }, (_, col) => delayOf(18 + col));
    expect(Math.max(...row1)).toBeLessThan(Math.min(...row3));

    // And it is uneven: a row whose cells all started together is a column
    // sweep wearing a different direction, which is what this replaced.
    expect(new Set(row1).size).toBeGreaterThan(1);
  });

  it('scatters the same way every time, so a win is not a dice roll', () => {
    // The unevenness is a hash of the cell, not a random number: the same
    // board has to animate the same way twice, or nothing can pin it.
    const { unmount } = render(<Harness celebrate />);
    const first = Array.from({ length: 9 }, (_, col) =>
      cellAt(col as CellIndex).style.getPropertyValue('--win-delay'),
    );
    unmount();

    render(<Harness celebrate />);
    const second = Array.from({ length: 9 }, (_, col) =>
      cellAt(col as CellIndex).style.getPropertyValue('--win-delay'),
    );

    expect(second).toEqual(first);
  });

  it('drops the green while it celebrates', () => {
    // Green digits and a green wash on gold are two colours arguing over a
    // third, and a solved board has nothing left to point at.
    const cells = buildCells({}, { 1: 4 });
    const { rerender } = render(<Harness cells={cells} highlightDigit={4} />);
    expect(cellAt(1).getAttribute('data-match')).toBe('true');

    rerender(<Harness cells={cells} highlightDigit={4} celebrate />);
    expect(cellAt(1).getAttribute('data-match')).toBeNull();
  });
});
