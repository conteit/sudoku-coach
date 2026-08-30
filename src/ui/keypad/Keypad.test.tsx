import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Digit } from '../../engine/types';
import { DIGITS } from '../../engine/types';
import { parseGrid } from '../../engine/board';
import { Keypad } from './Keypad';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

const noop = () => undefined;

function renderKeypad(overrides: Partial<Parameters<typeof Keypad>[0]> = {}) {
  const props = {
    values: parseGrid(PUZZLE),
    pencilMode: false,
    onTogglePencil: noop,
    onDigit: noop,
    onErase: noop,
    onUndo: noop,
    onRedo: noop,
    ...overrides,
  };
  return { ...render(<Keypad {...props} />), props };
}

describe('remaining counts', () => {
  it('reports nine minus what is already on the board, for every digit', () => {
    const values = parseGrid(PUZZLE);
    renderKeypad({ values });

    for (const digit of DIGITS) {
      const placed = values.filter((value) => value === digit).length;
      expect(
        screen.getByRole('button', { name: `Place ${digit}, ${9 - placed} left` }),
      ).toBeInTheDocument();
    }
  });

  it('follows the board as the player places digits', () => {
    const values = parseGrid(PUZZLE);
    const before = values.filter((value) => value === 4).length;
    const { rerender } = renderKeypad({ values });

    expect(screen.getByRole('button', { name: `Place 4, ${9 - before} left` })).toBeEnabled();

    const next = [...values];
    next[2] = 4;
    rerender(
      <Keypad
        values={next}
        pencilMode={false}
        onTogglePencil={noop}
        onDigit={noop}
        onErase={noop}
        onUndo={noop}
        onRedo={noop}
      />,
    );

    expect(screen.getByRole('button', { name: `Place 4, ${8 - before} left` })).toBeInTheDocument();
  });

  it('retires a digit once all nine are placed', async () => {
    const values = parseGrid(PUZZLE).map((value, index) => (index < 9 ? (7 as Digit) : value));
    renderKeypad({ values });

    const seven = screen.getByRole('button', { name: 'Place 7, 0 left' });
    expect(seven).toBeDisabled();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('never counts below zero on a board that already contradicts itself', () => {
    const values = new Array(81).fill(3) as Digit[];
    renderKeypad({ values });

    expect(screen.getByRole('button', { name: 'Place 3, 0 left' })).toBeInTheDocument();
  });
});

describe('actions', () => {
  it('reports the digit the player pressed', async () => {
    const user = userEvent.setup();
    const onDigit = vi.fn();
    renderKeypad({ onDigit });

    await user.click(screen.getByRole('button', { name: /^Place 6,/ }));

    expect(onDigit).toHaveBeenCalledWith(6);
  });

  it('names the keys as notes while notes mode is on', () => {
    renderKeypad({ pencilMode: true });

    expect(screen.getByRole('button', { name: /^Note 6,/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notes on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports erase, undo and redo', async () => {
    const user = userEvent.setup();
    const onErase = vi.fn();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    renderKeypad({ onErase, onUndo, onRedo });

    await user.click(screen.getByRole('button', { name: 'Erase cell' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Redo' }));

    expect(onErase).toHaveBeenCalledOnce();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('turns undo and redo off when there is nothing to step through', () => {
    renderKeypad({ canUndo: false, canRedo: false });

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('offers the haptic hook before it runs the action', async () => {
    const user = userEvent.setup();
    const onHaptic = vi.fn();
    const onTogglePencil = vi.fn();
    renderKeypad({ onHaptic, onTogglePencil });

    await user.click(screen.getByRole('button', { name: 'Notes off' }));

    expect(onHaptic).toHaveBeenCalledWith('toggle');
    expect(onTogglePencil).toHaveBeenCalledOnce();
  });

  it('goes quiet when no cell is selected, but still allows undo', () => {
    renderKeypad({ disabled: true });

    expect(screen.getByRole('button', { name: /^Place 6,/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Erase cell' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });
});
