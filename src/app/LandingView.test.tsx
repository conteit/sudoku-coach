/**
 * The front door. It has one job beyond reading well: prove the app on a real
 * board, and carry whatever the visitor started into the app when they press
 * Start.
 *
 * The generator is stubbed rather than run — it is the *page* being tested,
 * and a real generation is seconds of worker in a suite that has to stay
 * fast. `dailyPuzzle.test.ts` is what pins the seed being the day's.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { LandingView } from './LandingView';
import { seedForDate } from './dailyPuzzle';

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

const generate = vi.fn();

vi.mock('./useGenerator', () => ({
  useGenerator: () => ({ generate, cancel: () => undefined, running: false, progress: null, failed: false }),
}));

beforeEach(() => {
  generate.mockReset();
  generate.mockResolvedValue({
    puzzle: {
      givens: PUZZLE,
      solution: SOLVED,
      difficulty: 'easy',
      hardestTechnique: 'naked_single',
      techniques: ['naked_single'],
    },
    requested: 'easy',
    matched: true,
    attempts: 1,
  });
});

const renderLanding = (onStart = vi.fn()) => {
  const onNavigate = vi.fn();
  render(
    <LocaleProvider locale="en">
      <LandingView
        onStart={onStart}
        onNavigate={onNavigate}
        now={() => new Date(2026, 8, 3, 12)}
      />
    </LocaleProvider>,
  );
  return { onStart, onNavigate, user: userEvent.setup() };
};

describe('the landing page', () => {
  it("asks for today's easy board, by the day's own seed", async () => {
    renderLanding();

    await waitFor(() => expect(generate).toHaveBeenCalled());
    const [difficulty, seed] = generate.mock.calls[0];
    expect(difficulty).toBe('easy');
    // Same seed the daily module derives for that date: the page must not
    // invent its own, or two devices see different "puzzles of the day".
    expect(seed).toBe(seedForDate(new Date(2026, 8, 3, 12)));
  });

  it('says what the app is before it says anything else', async () => {
    renderLanding();
    // The thesis is the selling point — it is the only thing distinguishing
    // this from every other sudoku on the web, so it is the promise on the
    // page rather than a feature list.
    expect(screen.getByText(/refuses to tell you the answer/i)).toBeInTheDocument();
    expect(screen.getByText(/None of them ever hands you a digit/i)).toBeInTheDocument();
  });

  it('holds the board’s box while the puzzle is still being dealt', () => {
    // The grid is the page's largest element; a page that reflows around it
    // when generation lands moves under whoever is reading it.
    renderLanding();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('is playable before any decision has been made', async () => {
    const { user } = renderLanding();
    const grid = await screen.findByRole('grid');

    // r1c3 is empty in this puzzle.
    await user.click(within(grid).getByRole('gridcell', { name: /^r1c3,/ }));
    await user.keyboard('4');

    expect(within(grid).getByRole('gridcell', { name: /^r1c3, 4/ })).toBeInTheDocument();
  });

  it('starts empty-handed when nothing was played', async () => {
    const { onStart, user } = renderLanding();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Start playing' }));
    expect(onStart).toHaveBeenCalledWith(null);
  });

  it('carries the visitor’s own board into the app when they started one', async () => {
    // A visitor who has begun thinking about a puzzle should not have to
    // begin it again, and the button says so before they press it.
    const { onStart, user } = renderLanding();
    const grid = await screen.findByRole('grid');

    await user.click(within(grid).getByRole('gridcell', { name: /^r1c3,/ }));
    await user.keyboard('4');

    await user.click(screen.getByRole('button', { name: 'Continue this puzzle' }));
    const taster = onStart.mock.calls[0][0];
    expect(taster.puzzle.givens).toBe(PUZZLE);
    expect(taster.entries[2]).toBe(4);
  });
});
