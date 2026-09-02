/**
 * The library's second pane exists only where there is width to spend it.
 * Below `laptop`, `LibraryView` must render exactly what it renders today —
 * that screen is signed-off work, and this task changes where the list sits
 * on a wide viewport, not the phone's layout. The tablet case is the
 * regression guard for that: two columns fit above 640px, but the panel does
 * not appear until `SplitLayout` actually splits, at 1024.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseGrid, formatGrid } from '../engine/board';
import type { Difficulty } from '../engine/types';
import { LocaleProvider } from '../i18n/react';
import type { GameSummary } from '../state/db';
import { LibraryView } from './LibraryView';
import type { Tier } from './useViewportTier';

// Same puzzle and construction `GameList.test.tsx`'s own `savedGame` factory
// uses, widened to the full `state/db.GameSummary` shape `LibraryView`
// actually takes — `GameList`'s factory returns a narrower Pick that has no
// `completedAt`, which is what this screen filters on, so it cannot be
// imported as-is.
const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

let counter = 0;

function summary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: `g${counter++}`,
    difficulty: 'medium' as Difficulty,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    elapsedMs: 12 * 60_000,
    runningSince: null,
    progress: 40,
    moves: 12,
    givens: PUZZLE,
    board: formatGrid(parseGrid(PUZZLE)),
    ...overrides,
  };
}

// Mirrors `useViewportTier.ts`'s own query strings and `GameView.layout.test`'s
// `TIER_QUERIES` — a stub built from different numbers would prove nothing
// about the hook this file drives through them.
const TIER_QUERIES: Record<Tier, string[]> = {
  phone: ['(max-width: 639.98px)'],
  tablet: [],
  laptop: ['(min-width: 1024px)'],
  desktop: ['(min-width: 1024px)', '(min-width: 1536px)'],
};

function matchOnly(...matching: string[]) {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderLibrary(options: { tier: Tier; summaries?: readonly GameSummary[] }) {
  matchOnly(...TIER_QUERIES[options.tier]);
  return render(
    <LocaleProvider locale="en">
      <LibraryView
        summaries={options.summaries ?? [summary()]}
        onResume={() => undefined}
        onNewGame={() => undefined}
        onOpenSettings={() => undefined}
        onLearn={() => undefined}
      />
    </LocaleProvider>,
  );
}

describe('LibraryView', () => {
  it('is one column on a phone, with no progress pane', () => {
    renderLibrary({ tier: 'phone' });
    expect(screen.queryByTestId('left-pane')).toBeNull();
    expect(screen.queryByText(/your progress/i)).toBeNull();
  });

  it('renders the phone screen exactly as it does today — same root, no landmarks', () => {
    // The regression guard for the controller ruling: below `laptop`,
    // `LibraryView` must return its pre-existing markup untouched rather than
    // routing through `SplitLayout`'s stacked branch, which uses different
    // padding and drops `min-h-dvh`.
    const { container } = renderLibrary({ tier: 'phone' });
    const root = container.firstElementChild;
    expect(root?.className).toBe(
      'mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-6 pb-10',
    );
    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('adds nothing to a tablet either — the width is what buys the panel', () => {
    renderLibrary({ tier: 'tablet' });
    expect(screen.queryByTestId('left-pane')).toBeNull();
    expect(screen.queryByText(/your progress/i)).toBeNull();
  });

  it('shows progress beside the games on a laptop', () => {
    renderLibrary({ tier: 'laptop' });
    expect(screen.getByText(/your progress/i)).toBeTruthy();
    // GameList's "In progress" eyebrow is a <p>, not the row count <h2> that
    // carries the section's accessible name — so this reads the games pane's
    // own copy directly rather than through the (wrong) heading role.
    expect(screen.getByText(/in progress/i)).toBeTruthy();
  });

  it('keeps the games first in the DOM — they are why the screen exists', () => {
    renderLibrary({ tier: 'laptop' });
    const games = screen.getByTestId('left-pane');
    const progress = screen.getByTestId('right-pane');
    expect(games.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives the games a main landmark and the progress a labelled aside', () => {
    renderLibrary({ tier: 'laptop' });
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: /your progress/i })).toBeTruthy();
  });
});
