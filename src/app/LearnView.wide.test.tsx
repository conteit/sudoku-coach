/**
 * Above `laptop`, Learn becomes master-detail: the technique index stays on
 * screen in the left pane and the lesson opens beside it in the right pane,
 * rather than pushing a page over the index the way the phone layout does.
 *
 * `LearnView.test.tsx` already characterises the phone/tablet behaviour and
 * must not be edited — this file only adds the wide-viewport behaviour and a
 * regression guard that the phone branch still behaves exactly as before.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../state/mastery';
import { LocaleProvider } from '../i18n/react';
import { LearnView } from './LearnView';
import type { Tier } from './useViewportTier';

// DEFAULT_PROFILE is Italian; an English-language test needs an English
// profile to match the English tree LocaleProvider renders below — same
// reasoning as LearnView.test.tsx and ProgressPanel.test.tsx.
const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

// Mirrors useViewportTier.ts's own query strings and LibraryView.test.tsx's
// TIER_QUERIES — a stub built from different numbers would prove nothing
// about the hook this file drives through them.
const TIER_QUERIES: Record<Tier, string[]> = {
  phone: ['(max-width: 639.98px)'],
  tablet: [],
  laptop: ['(min-width: 1024px)'],
  desktop: ['(min-width: 1024px)', '(min-width: 1536px)'],
};

const defaultMatchMedia = window.matchMedia;

function matchOnly(...matching: string[]) {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = defaultMatchMedia;
});

function renderLearn(options: { tier: Tier; technique?: Parameters<typeof LearnView>[0]['technique'] }) {
  matchOnly(...TIER_QUERIES[options.tier]);
  const user = userEvent.setup();
  const result = render(
    <LocaleProvider locale="en">
      <LearnView profile={PROFILE} technique={options.technique} onClose={() => undefined} />
    </LocaleProvider>,
  );
  return { ...result, user };
}

describe('LearnView — wide viewport', () => {
  it('shows the intro beside the index when nothing is selected', () => {
    renderLearn({ tier: 'laptop' });
    const content = screen.getByTestId('right-pane');
    // "How sudoku works" is the actual rules section title (i18n/en.ts) — the
    // brief's /the rules/i sketch does not appear verbatim in the copy.
    expect(within(content).getByText(/how sudoku works/i)).toBeTruthy();
  });

  it('swaps the intro for the lesson without moving the index', async () => {
    const { user } = renderLearn({ tier: 'laptop' });
    const index = screen.getByTestId('left-pane');
    const before = index.className;
    await user.click(within(index).getByRole('button', { name: /naked single/i }));
    expect(within(screen.getByTestId('right-pane')).getByText(/what it is/i)).toBeTruthy();
    expect(screen.getByTestId('left-pane').className).toBe(before);
  });

  it('opens on the technique the coach deep-linked', () => {
    renderLearn({ tier: 'laptop', technique: 'hidden_single' });
    expect(within(screen.getByTestId('right-pane')).getByText(/what it is/i)).toBeTruthy();
  });

  it('does the same at desktop', () => {
    renderLearn({ tier: 'desktop' });
    const content = screen.getByTestId('right-pane');
    expect(within(content).getByText(/how sudoku works/i)).toBeTruthy();
  });

  it('still pushes a page on a phone, with a way back', async () => {
    const { user } = renderLearn({ tier: 'phone' });
    await user.click(screen.getByRole('button', { name: /naked single/i }));
    expect(screen.getByRole('button', { name: /back/i })).toBeTruthy();
    expect(screen.queryByTestId('left-pane')).toBeNull();
  });
});
