import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Digit } from '../../engine/types';
import { formatGrid, parseGrid } from '../../engine/board';
import { GameList, type GameSummary } from './GameList';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** A saved game with `filled` of its blank cells written in. */
function savedGame(overrides: Partial<GameSummary> & { filled?: number } = {}): GameSummary {
  const { filled = 0, ...rest } = overrides;
  const values = parseGrid(PUZZLE);
  const board = [...values];
  let written = 0;
  for (let i = 0; i < board.length && written < filled; i++) {
    if (values[i] !== null) continue;
    board[i] = 1 as Digit;
    written += 1;
  }
  return {
    id: 'g1',
    difficulty: 'medium',
    givens: PUZZLE,
    board: formatGrid(board),
    elapsedMs: 12 * 60_000 + 4_000,
    runningSince: null,
    updatedAt: NOW - 60_000,
    ...rest,
  };
}

const BLANKS = parseGrid(PUZZLE).filter((value) => value === null).length;

describe('completion', () => {
  it('measures progress over the cells the player has to fill, not all 81', () => {
    const half = Math.round(BLANKS / 2);
    render(
      <GameList
        games={[savedGame({ filled: half })]}
        now={NOW}
        onResume={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    const expected = Math.round((half / BLANKS) * 100);
    expect(
      screen.getByRole('button', { name: new RegExp(`${expected} percent complete`) }),
    ).toBeInTheDocument();
    expect(screen.getByText(String(expected))).toBeInTheDocument();
  });

  it('reads zero on a puzzle that has only its givens', () => {
    render(
      <GameList
        games={[savedGame({ filled: 0 })]}
        now={NOW}
        onResume={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /0 percent complete/ })).toBeInTheDocument();
  });

  it('reads a hundred once every blank is filled', () => {
    render(
      <GameList
        games={[savedGame({ filled: BLANKS })]}
        now={NOW}
        onResume={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /100 percent complete/ })).toBeInTheDocument();
  });
});

describe('the list', () => {
  it('shows difficulty, elapsed time and when it was last touched', () => {
    render(
      <GameList
        games={[savedGame({ elapsedMs: 12 * 60_000 + 4_000, updatedAt: NOW - 2 * 3_600_000 })]}
        now={NOW}
        onResume={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('12:04')).toBeInTheDocument();
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('counts a running game up to now', () => {
    render(
      <GameList
        games={[savedGame({ elapsedMs: 60_000, runningSince: NOW - 30_000 })]}
        now={NOW}
        onResume={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('reads a finished game as finished, with no invitation to start another', () => {
    render(
      <GameList
        variant="finished"
        games={[savedGame({ filled: BLANKS })]}
        now={NOW}
        onResume={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.getByText('Finished in 12:04')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New puzzle' })).not.toBeInTheDocument();
  });

  it('resumes the game the player picked', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(
      <GameList
        games={[savedGame({ id: 'a', difficulty: 'easy' }), savedGame({ id: 'b', difficulty: 'hard' })]}
        now={NOW}
        onResume={onResume}
        onNewGame={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Resume hard puzzle/ }));

    expect(onResume).toHaveBeenCalledWith('b');
  });

  it('offers a new puzzle whether or not any are in progress', async () => {
    const user = userEvent.setup();
    const onNewGame = vi.fn();
    const { rerender } = render(
      <GameList games={[]} now={NOW} onResume={() => undefined} onNewGame={onNewGame} />,
    );

    expect(screen.getByText(/Start a puzzle and it waits here/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New puzzle' }));

    rerender(
      <GameList
        games={[savedGame()]}
        now={NOW}
        onResume={() => undefined}
        onNewGame={onNewGame}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'New puzzle' }));

    expect(onNewGame).toHaveBeenCalledTimes(2);
  });
});
