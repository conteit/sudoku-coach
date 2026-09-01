import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Digit } from '../../engine/types';
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

/**
 * The counts themselves are no longer printed: nine little numbers cost a line
 * of key height each, and none of them is a move. What the count still decides
 * is when a digit is finished, which is the only thing left to pin.
 */
describe('finished digits', () => {
  it('retires a digit once all nine are placed', async () => {
    const values = parseGrid(PUZZLE).map((value, index) => (index < 9 ? (7 as Digit) : value));
    renderKeypad({ values });

    // The count is no longer printed under the key; being retired is now the
    // only thing it is used for, and the only thing worth asserting.
    expect(screen.getByRole('button', { name: 'Place 7' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Place 4' })).toBeEnabled();
  });

  it('never counts below zero on a board that already contradicts itself', () => {
    const values = new Array(81).fill(3) as Digit[];
    renderKeypad({ values });

    expect(screen.getByRole('button', { name: 'Place 3' })).toBeDisabled();
  });
});

describe('actions', () => {
  it('reports the digit the player pressed', async () => {
    const user = userEvent.setup();
    const onDigit = vi.fn();
    renderKeypad({ onDigit });

    await user.click(screen.getByRole('button', { name: 'Place 6' }));

    expect(onDigit).toHaveBeenCalledWith(6);
  });

  it('names the keys as notes while notes mode is on', () => {
    renderKeypad({ pencilMode: true });

    expect(screen.getByRole('button', { name: 'Note 6' })).toBeInTheDocument();
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

  it('goes quiet while disabled, but still allows undo', () => {
    renderKeypad({ disabled: true });

    expect(screen.getByRole('button', { name: 'Place 6' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Erase cell' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('marks the armed digit so the player can see what the green is', () => {
    renderKeypad({ highlighted: 5 });

    expect(screen.getByRole('button', { name: /5/ })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('button', { name: /4/ })).not.toHaveAttribute('data-highlighted');
  });
});
