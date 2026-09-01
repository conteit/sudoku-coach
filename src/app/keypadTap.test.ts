import { describe, expect, it } from 'vitest';
import type { Digit } from '../engine/types';
import { keypadTap } from './keypadTap';

const FIVE: Digit = 5;

describe('keypadTap', () => {
  it('arms an unlit highlight when no cell is selected', () => {
    // No cell selected: the tap is purely a request about the highlight, and
    // there is nothing yet armed to clear, so it arms.
    const result = keypadTap(null, null, FIVE, null);
    expect(result).toEqual({ entered: false, highlight: FIVE });
  });

  it('clears an already-armed highlight when no cell is selected', () => {
    const result = keypadTap(null, null, FIVE, FIVE);
    expect(result).toEqual({ entered: false, highlight: null });
  });

  it('writes into a selected, empty cell and arms on what was written', () => {
    // Cell selected and empty: the tap has somewhere to write, so it always
    // enters, regardless of what was previously armed.
    const result = keypadTap(0, null, FIVE, 3 as Digit);
    expect(result).toEqual({ entered: true, highlight: FIVE });
  });

  it('overwrites a selected cell holding a different digit and re-arms', () => {
    // Placing the same digit into a second cell must not blink the highlight
    // off: this is the exact regression the enter-vs-toggle guard exists for.
    const result = keypadTap(1, 3 as Digit, FIVE, FIVE);
    expect(result).toEqual({ entered: true, highlight: FIVE });
  });

  it('arms without writing when the selected cell already holds the digit', () => {
    // Nothing to write — the cell already holds it — so the tap is only
    // about the highlight, and nothing was armed yet, so it arms.
    const result = keypadTap(0, FIVE, FIVE, null);
    expect(result).toEqual({ entered: false, highlight: FIVE });
  });

  it('clears when the selected cell already holds the already-armed digit', () => {
    // The guard's namesake case: a tap that enters nothing on a digit that
    // is already highlighted is the only tap allowed to put it away.
    const result = keypadTap(0, FIVE, FIVE, FIVE);
    expect(result).toEqual({ entered: false, highlight: null });
  });
});
