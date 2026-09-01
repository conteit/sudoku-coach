import { describe, expect, it } from 'vitest';
import type { Digit } from '../engine/types';
import { selectHighlight } from './greenHighlight';

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
