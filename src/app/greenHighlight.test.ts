import { describe, expect, it } from 'vitest';
import type { Digit } from '../engine/types';
import { selectHighlight, sweepRefuses, toggleHighlight } from './greenHighlight';

const FIVE: Digit = 5;
const THREE: Digit = 3;

describe('selectHighlight', () => {
  it('arms an unlit highlight on the selected digit', () => {
    expect(selectHighlight(FIVE, null)).toBe(FIVE);
  });

  it('moves the highlight to a different selected digit', () => {
    expect(selectHighlight(FIVE, THREE)).toBe(FIVE);
  });

  it('clears the highlight when the selected cell already holds it', () => {
    expect(selectHighlight(FIVE, FIVE)).toBeNull();
  });

  it('leaves an unlit highlight alone when the selected cell is empty', () => {
    // The stickiness that matters: scanning happens across empty cells, and
    // losing the green there is the defect this rule exists to fix.
    expect(selectHighlight(null, null)).toBeNull();
  });

  it('leaves a lit highlight alone when the selected cell is empty', () => {
    expect(selectHighlight(null, FIVE)).toBe(FIVE);
  });
});

describe('toggleHighlight', () => {
  it('arms an unlit highlight on the toggled digit', () => {
    expect(toggleHighlight(FIVE, null)).toBe(FIVE);
  });

  it('re-arms on a different digit without needing to clear first', () => {
    expect(toggleHighlight(FIVE, THREE)).toBe(FIVE);
  });

  it('clears when the toggled digit is already armed', () => {
    // The regression the old keypad-tap guard existed for: toggling the same
    // digit a second time is the only thing that puts it away.
    expect(toggleHighlight(FIVE, FIVE)).toBeNull();
  });
});

describe('sweeping one digit at a time', () => {
  // Two mis-taps cost a sweep, and they cost it differently. A wrong key
  // writes a note that is simply false. A stray tap on a solved cell re-points
  // the green, and the player carries on sweeping a digit they are no longer
  // looking at — which is the worse of the two, because nothing about it looks
  // like a mistake.
  it('keeps the highlight when a filled cell is tapped mid-sweep', () => {
    expect(selectHighlight(7, 5, true)).toBe(5);
  });

  it('keeps it even when the tap lands on the swept digit itself', () => {
    // Clearing by tapping the digit's own cell is a real gesture, but it is
    // exactly as easy to do by accident as any other tap on the grid. The
    // keypad's long-press is the deliberate way out and it still works.
    expect(selectHighlight(5, 5, true)).toBe(5);
  });

  it('still arms a highlight from nothing, because there is no sweep to protect', () => {
    expect(selectHighlight(5, null, true)).toBe(5);
  });

  it('leaves every rule alone when no sweep is running', () => {
    expect(selectHighlight(7, 5, false)).toBe(7);
    expect(selectHighlight(5, 5, false)).toBeNull();
    expect(selectHighlight(null, 5, false)).toBe(5);
  });

  it('refuses a keypad digit that is not the one being swept', () => {
    expect(sweepRefuses(6, 5, true)).toBe(true);
  });

  it('allows the digit being swept', () => {
    expect(sweepRefuses(5, 5, true)).toBe(false);
  });

  it('refuses nothing when there is no highlight, or no sweep', () => {
    expect(sweepRefuses(6, null, true)).toBe(false);
    expect(sweepRefuses(6, 5, false)).toBe(false);
  });
});
