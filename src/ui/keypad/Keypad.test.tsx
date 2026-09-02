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
    // `detail: 1` is what marks this as the real pointer-originated click a
    // completed press-and-release produces (a keyboard activation is always
    // 0) — see the "does not swallow a keyboard activation" case below for
    // the other half of that gate.
    fireEvent.pointerUp(key);
    fireEvent.click(key, { detail: 1 });

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

  it('cancels a held press once the pointer drifts past the move threshold', () => {
    // The touch case `pointerleave` cannot cover: a touch pointer gets
    // implicit capture on `pointerdown`, so `pointerleave`/`pointerout` are
    // deferred until release rather than firing as the finger slides onto a
    // neighbour — `pointermove` is what still reaches this key while that is
    // happening, and is what the fix under test relies on.
    const onDigitLongPress = vi.fn();
    renderKeypad({ onDigitLongPress });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(key, { clientX: 20, clientY: 0 });
    vi.advanceTimersByTime(500);

    expect(onDigitLongPress).not.toHaveBeenCalled();
  });

  it('tolerates a small wobble that stays under the move threshold', () => {
    const onDigitLongPress = vi.fn();
    renderKeypad({ onDigitLongPress });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(key, { clientX: 3, clientY: 3 });
    vi.advanceTimersByTime(500);

    expect(onDigitLongPress).toHaveBeenCalledWith(6);
  });

  it('does not swallow a keyboard activation against a stale fired flag', () => {
    // The gap the `event.detail` gate closes: a press that fires (held past
    // the threshold) and is then abandoned — dragged off and released
    // somewhere that never dispatches this key's own click — leaves `fired`
    // stale-true with nothing to clear it. A keyboard Enter/Space on the
    // same key afterwards is a click with no preceding `pointerdown` at all,
    // and always `detail: 0`; it must still enter the digit.
    const onDigit = vi.fn();
    const onDigitLongPress = vi.fn();
    renderKeypad({ onDigit, onDigitLongPress });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    vi.advanceTimersByTime(500);
    fireEvent.pointerLeave(key); // the drag-off; no click ever follows it

    expect(onDigitLongPress).toHaveBeenCalledWith(6);

    fireEvent.click(key); // the keyboard activation — detail defaults to 0

    expect(onDigit).toHaveBeenCalledWith(6);
  });

  it('does nothing on a long-press with no handler wired', () => {
    const onHaptic = vi.fn();
    renderKeypad({ onHaptic });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    vi.advanceTimersByTime(500);
    fireEvent.pointerUp(key);

    // Not merely "did not throw": no handler wired means no haptic either —
    // there is nothing for the player to feel a response to.
    expect(onHaptic).not.toHaveBeenCalled();
  });

  it('clears a pending press on unmount rather than leaving the timer live', () => {
    const onDigitLongPress = vi.fn();
    const { unmount } = renderKeypad({ onDigitLongPress });

    const key = screen.getByRole('button', { name: 'Place 6' });
    fireEvent.pointerDown(key);
    unmount();
    vi.advanceTimersByTime(500);

    // If the timer were still live, this is exactly when it would fire —
    // into a component that no longer exists.
    expect(onDigitLongPress).not.toHaveBeenCalled();
  });

  it('suppresses the platform long-press (text selection, context menu)', () => {
    renderKeypad();

    const key = screen.getByRole('button', { name: 'Place 6' });
    expect(key).toHaveClass('select-none', 'touch-none');

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    key.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

/**
 * A note a placement has killed is bookkeeping the player owes the board, and
 * until this the only way to pay it was to open the coach — a notification, a
 * sheet and a tap away from a phone player whose thumb is already on the pad.
 *
 * So the pad's own eraser carries it: while anything is dead, the key *is*
 * the clear, and the ordinary erase waits. That is deliberate rather than
 * incidental — clearing first is the point — and Undo, one key over, is the
 * right tool for the mis-tap the erase would otherwise fix.
 */
describe('the eraser, while notes are dead', () => {
  it('carries the clear instead, named by what it will do', () => {
    renderKeypad({ staleCount: 3, onClearStale: noop });

    expect(screen.getByRole('button', { name: 'Clear 3 dead notes' })).toBeInTheDocument();
    // Not both: one key, one meaning at a time. A pad offering "erase" and
    // "clear" at once is a pad the player has to read before every tap.
    expect(screen.queryByRole('button', { name: 'Erase cell' })).toBeNull();
  });

  it('counts one dead note in the singular', () => {
    renderKeypad({ staleCount: 1, onClearStale: noop });

    expect(screen.getByRole('button', { name: 'Clear 1 dead note' })).toBeInTheDocument();
  });

  it('clears on a tap, and hands the key back to the eraser', async () => {
    const onClearStale = vi.fn();
    const user = userEvent.setup();
    const { rerender, props } = renderKeypad({ staleCount: 2, onClearStale });

    await user.click(screen.getByRole('button', { name: 'Clear 2 dead notes' }));
    expect(onClearStale).toHaveBeenCalledOnce();

    // The host clears the notes; the key goes back to what it was. Nothing
    // about the mode is remembered — it is a reading of the board.
    rerender(<Keypad {...props} staleCount={0} onClearStale={onClearStale} />);
    expect(screen.getByRole('button', { name: 'Erase cell' })).toBeInTheDocument();
  });

  it('is live with no cell selected — there is something to do either way', () => {
    // `canErase` asks whether a cell is selected, which is the wrong question
    // for a key that is about to clear notes all over the board.
    renderKeypad({ staleCount: 2, onClearStale: noop, canErase: false });

    expect(screen.getByRole('button', { name: 'Clear 2 dead notes' })).toBeEnabled();
  });

  it('stays dead while the board is paused or solved', () => {
    // `disabled` means no move is legal right now, and clearing notes is a
    // move: it goes on the undo stack like any other.
    renderKeypad({ staleCount: 2, onClearStale: noop, disabled: true });

    expect(screen.getByRole('button', { name: 'Clear 2 dead notes' })).toBeDisabled();
  });

  it('erases as usual when the host wires no clear at all', () => {
    // Every other pad control is optional-by-design in the same way: a host
    // that never wires this gets today's eraser, not a broken key.
    renderKeypad({ staleCount: 3 });

    expect(screen.getByRole('button', { name: 'Erase cell' })).toBeInTheDocument();
  });
});
