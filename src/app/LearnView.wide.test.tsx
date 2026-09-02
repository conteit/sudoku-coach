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
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function renderLearn(options: {
  tier: Tier;
  technique?: Parameters<typeof LearnView>[0]['technique'];
  onClose?: () => void;
}) {
  matchOnly(...TIER_QUERIES[options.tier]);
  const user = userEvent.setup();
  const onClose = options.onClose ?? vi.fn();
  const result = render(
    <LocaleProvider locale="en">
      <LearnView profile={PROFILE} technique={options.technique} onClose={onClose} />
    </LocaleProvider>,
  );
  return { ...result, user, onClose };
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
    await user.click(within(index).getByRole('button', { name: /naked single/i }));
    expect(within(screen.getByTestId('right-pane')).getByText(/what it is/i)).toBeTruthy();
    // Asserts the index's own row survives, not `className` — `SplitLayout`
    // hardcodes the pane's class regardless of what's inside it, so a
    // `className` comparison can never fail and proves nothing. This fails
    // the moment the left pane's content is swapped out for anything else,
    // which is the thing "does not move the list you chose it from" means.
    expect(
      within(screen.getByTestId('left-pane')).getByRole('button', { name: /naked single/i }),
    ).toBeTruthy();
  });

  it('opens on the technique the coach deep-linked', () => {
    renderLearn({ tier: 'laptop', technique: 'hidden_single' });
    expect(within(screen.getByTestId('right-pane')).getByText(/what it is/i)).toBeTruthy();
  });

  it('gives the lesson a main landmark and the index a labelled nav', () => {
    // Learn is the one screen that is entirely document content, and it was
    // the only one with no primary landmark — its lesson pane announced as a
    // generic `region` named "Learn", which is the page's own `<h1>` and,
    // once a lesson is open, the wrong title for what is in the pane. The
    // e2e axe pass is no evidence here: `landmark-one-main` and `region` are
    // best-practice rules, outside the wcag2a/aa tags `audit()` scopes to.
    renderLearn({ tier: 'laptop' });
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /the techniques/i })).toBeTruthy();

    // Named *by* the heading it contains, not by a second spelling of it: an
    // `aria-label` here is a copy of the visible `h2` that can drift from it,
    // and a screen reader then announces the landmark one way and the heading
    // inside it another.
    const nav = screen.getByRole('navigation', { name: /the techniques/i });
    expect(nav.getAttribute('aria-label')).toBeNull();
    const heading = screen.getByRole('heading', { name: /the techniques/i });
    expect(nav.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(screen.queryByRole('region', { name: /^learn$/i })).toBeNull();
  });

  it('caps the lesson at 40rem however wide the pane gets', () => {
    // Invariant 10. This pane is `flex-1`, so at 1536px it is ~1136px wide;
    // without the cap a lesson would be a ~200-character measure and its
    // worked 9x9 a ~1000px-tall illustration. Nothing else in the tree
    // constrains it, so the cap is the only thing standing between the
    // reader and the whole viewport.
    renderLearn({ tier: 'desktop' });
    expect(screen.getByRole('main').className).toContain('max-w-[40rem]');
    expect(screen.getByTestId('right-pane').className).toContain('flex-1');
    expect(screen.getByTestId('left-pane').className).toContain('w-[20rem]');
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

  it('opens straight onto a deep-linked technique on a phone, and backs out to the caller', async () => {
    // `LearnView.tsx`'s `onBack` is a ternary on the `technique` prop, not on
    // `open`: reached the index by clicking (the case above), `back` clears
    // `open` and shows the index again; reached it by deep link, there is no
    // index screen this render came from, so `back` calls `onClose` instead.
    // Nothing before this test exercised that second arm at any tier.
    const { user, onClose } = renderLearn({ tier: 'phone', technique: 'hidden_single' });
    // No click needed — the lesson is already open, the index never shown.
    expect(within(screen.getByRole('article')).getByText(/what it is/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /hidden single/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
