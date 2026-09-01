/**
 * The one seam Playwright's touch emulation cannot exercise honestly (see
 * `Keypad.test.tsx`'s own long-press coverage and its "not covered" note):
 * whether a held keypad digit actually reaches the grid's green highlight on
 * the other side of `onDigitLongPress`, and whether a blocked tap feels
 * different from one that worked. `Keypad.test.tsx` proves the press-timing
 * mechanics against the keypad alone; this is what proves `GameView` actually
 * wires them to something.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { newGame } from '../state/game';
import { useGameStore } from '../state/store';
import type { LiveGame, PlayerProfile } from '../state/types';
import { GameView } from './GameView';

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
// Carries five givens of '6' — enough to prove the highlight reaches every
// matching cell on the board, not just the one key that armed it.
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

const SETTINGS: PlayerProfile['settings'] = {
  highlightConflicts: true,
  theme: 'system',
  haptics: false,
  highlightMatchingNotes: false,
};

let counter = 0;

function renderGame(settings: PlayerProfile['settings'] = SETTINGS) {
  const game: LiveGame = newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: `long-press-test-${counter++}`,
    // Paused keys are disabled — a real board mid-game is what a long-press
    // actually happens against.
    running: true,
  });
  useGameStore.setState({ activeGameId: game.id, games: { [game.id]: game }, hydrated: true });

  render(
    <LocaleProvider locale="en">
      <GameView
        game={game}
        settings={settings}
        locale="en"
        onExit={() => undefined}
        onOpenSettings={() => undefined}
        onNewGame={() => undefined}
        onLearn={() => undefined}
      />
    </LocaleProvider>,
  );
}

const litCells = () => document.querySelectorAll('[role="gridcell"][data-match="true"]');

/**
 * One full press-hold-release gesture past the long-press threshold. The
 * timer advance is wrapped in `act` because it fires outside any DOM event
 * React itself is watching — a bare `vi.advanceTimersByTime` here runs the
 * `setHighlightDigit` update, but leaves it unflushed until *something* else
 * touches React's scheduler, which the very next assertion does not.
 */
function longPress(key: HTMLElement): void {
  fireEvent.pointerDown(key);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  fireEvent.pointerUp(key);
  // `detail: 1` marks this as the real trailing click a completed gesture
  // produces — see `Keypad.test.tsx` for why the swallow logic needs it.
  fireEvent.click(key, { detail: 1 });
}

describe('keypad long-press', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('arms the grid highlight on the digit, without entering anything', () => {
    renderGame();
    longPress(screen.getByRole('button', { name: 'Place 6' }));

    expect(litCells()).toHaveLength(5);
  });

  it('clears the grid highlight on a second long-press of the same digit', () => {
    renderGame();
    const key = screen.getByRole('button', { name: 'Place 6' });

    longPress(key);
    expect(litCells()).toHaveLength(5);

    longPress(key);
    expect(litCells()).toHaveLength(0);
  });

  it('moves the highlight to a different digit on a second key\'s long-press', () => {
    renderGame();

    longPress(screen.getByRole('button', { name: 'Place 6' }));
    expect(litCells()).toHaveLength(5);

    longPress(screen.getByRole('button', { name: 'Place 9' }));
    // PUZZLE's givens carry four 9s.
    expect(litCells()).toHaveLength(4);
  });
});

describe('a digit tap with nothing selected', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fires the blocked haptic pattern rather than tap, and enters nothing', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    renderGame({ ...SETTINGS, haptics: true });

    fireEvent.click(screen.getByRole('button', { name: 'Place 6' }));

    // Duplicated from `GameView.tsx`'s own `HAPTICS` map deliberately: the
    // point under test is that a no-op tap is *distinguishable* from one
    // that worked, which a same-pattern assertion could not show.
    expect(vibrate).toHaveBeenCalledWith([12, 40, 12]);
    expect(vibrate).not.toHaveBeenCalledWith(8);
    expect(litCells()).toHaveLength(0);
  });
});
