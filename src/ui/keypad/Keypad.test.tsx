import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('has nothing to erase until a cell is selected', () => {
    renderKeypad({ canErase: false });

    // The digits stay live with no selection on purpose — a long-press still
    // has to reach a digit with none of its nine placed yet (R3) — which is
    // exactly why the eraser cannot ride along on the pad's own `disabled`.
    expect(screen.getByRole('button', { name: 'Erase cell' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Place 6' })).toBeEnabled();
  });

  it('goes quiet while disabled, but still allows undo', () => {
    renderKeypad({ disabled: true });

    expect(screen.getByRole('button', { name: 'Place 6' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Erase cell' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('marks the armed digit so the player can see what the green is', () => {
    renderKeypad({ highlighted: 5 });

    const armed = screen.getByRole('button', { name: /5/ });
    const other = screen.getByRole('button', { name: /4/ });
    expect(armed).toHaveAttribute('data-highlighted', 'true');
    expect(other).not.toHaveAttribute('data-highlighted');
  });

  it('carries no aria-pressed — the key\'s own activation always enters a digit', () => {
    // A tap or an Enter/Space activation never toggles anything any more —
    // only a long-press does, and that has no keyboard equivalent at all —
    // so aria-pressed would promise assistive tech a toggle this control's
    // own activation does not perform.
    renderKeypad({ highlighted: 5 });

    expect(screen.getByRole('button', { name: /5/ })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: /4/ })).not.toHaveAttribute('aria-pressed');
  });
});

describe('long-press', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enters the digit on an ordinary tap and never calls the long-press handler', () => {
    const onDigit = vi.fn();
    const onDigitLongPress = vi.fn();
    renderKeypad({ onDigit, onDigitLongPress });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    fireEvent.pointerUp(key);
    fireEvent.click(key);

    expect(onDigit).toHaveBeenCalledWith(6);
    expect(onDigitLongPress).not.toHaveBeenCalled();
  });

  it('toggles the highlight and enters nothing when held past the threshold', () => {
    const onDigit = vi.fn();
    const onDigitLongPress = vi.fn();
    const onHaptic = vi.fn();
    renderKeypad({ onDigit, onDigitLongPress, onHaptic });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    vi.advanceTimersByTime(500);
    // The release still ends in a browser `click`, mouse or touch — the key
    // under test is that it gets swallowed rather than also entering.
    fireEvent.pointerUp(key);
    fireEvent.click(key);

    expect(onDigitLongPress).toHaveBeenCalledWith(6);
    expect(onDigit).not.toHaveBeenCalled();
    expect(onHaptic).toHaveBeenCalledWith('toggle');
  });

  it('cancels a held press that releases before the threshold', () => {
    const onDigitLongPress = vi.fn();
    renderKeypad({ onDigitLongPress });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    vi.advanceTimersByTime(499);
    fireEvent.pointerUp(key);
    vi.advanceTimersByTime(1000);

    expect(onDigitLongPress).not.toHaveBeenCalled();
  });

  it('cancels a held press when the pointer leaves the key', () => {
    const onDigitLongPress = vi.fn();
    renderKeypad({ onDigitLongPress });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    fireEvent.pointerLeave(key);
    vi.advanceTimersByTime(500);

    expect(onDigitLongPress).not.toHaveBeenCalled();
  });

  it('does nothing on a long-press with no handler wired', () => {
    renderKeypad();

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    vi.advanceTimersByTime(500);
    // No assertion beyond "did not throw" — the prop is optional by design.
    fireEvent.pointerUp(key);
  });
});
