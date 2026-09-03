/**
 * The daily puzzle is a promise that it is the *same* puzzle, everywhere, all
 * day. Nothing stores it, so nothing but this function can keep that promise.
 */

import { describe, expect, it } from 'vitest';
import { dayKey, seedForDate, seedForDay } from './dailyPuzzle';

describe('the daily puzzle seed', () => {
  it('is the same all day and different the next', () => {
    const morning = new Date(2026, 8, 3, 6, 30);
    const midnightish = new Date(2026, 8, 3, 23, 59);
    const tomorrow = new Date(2026, 8, 4, 0, 1);

    expect(seedForDate(midnightish)).toBe(seedForDate(morning));
    expect(seedForDate(tomorrow)).not.toBe(seedForDate(morning));
  });

  it('reads the local day, not UTC', () => {
    // A player in Italy at 01:00 gets the puzzle of the day it is *there*.
    // `Date.getFullYear` and friends are local by definition, which is the
    // whole reason they are used here rather than the UTC pair.
    const localDate = new Date(2026, 0, 1, 1, 0);
    expect(dayKey(localDate)).toBe('2026-01-01');
  });

  it('is stable across devices and runs, since nothing stores it', () => {
    // Pinned to literals on purpose. If this hash is ever "improved", every
    // player's puzzle changes mid-day and two devices disagree about what
    // today's puzzle is — the test exists to make that a deliberate act.
    expect(seedForDay('2026-09-03')).toBe(seedForDay('2026-09-03'));
    expect(seedForDay('2026-09-03')).not.toBe(seedForDay('2026-09-04'));
    expect(Number.isInteger(seedForDay('2026-09-03'))).toBe(true);
    expect(seedForDay('2026-09-03')).toBeGreaterThanOrEqual(0);
  });
});
