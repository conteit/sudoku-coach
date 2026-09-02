/**
 * The two wide screens are one family, and this is the seam where they were
 * visibly not.
 *
 * Above 1024 the library and Learn are both a header of fixed chrome over a
 * `SplitLayout`. They are built from the same primitive and had no reason to
 * space that header differently, but Learn's simply omitted the class and sat
 * 24px tighter than the library's until it was fixed by hand. Nothing stopped
 * them drifting apart again: each screen's own suite asserts its own markup,
 * and neither has any reason to look at the other.
 *
 * The gap is read as a number rather than as a className because the two
 * screens do not spell it the same way — the library's header pushes with
 * `mb-6`, Learn's pads with `pb-6`, and both then sit above the split's own
 * `pt-6`. What has to agree is the distance, not the spelling.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatGrid, parseGrid } from '../engine/board';
import { LocaleProvider } from '../i18n/react';
import { DEFAULT_PROFILE } from '../state/mastery';
import type { GameSummary } from '../state/db';
import { LibraryView } from './LibraryView';
import { LearnView } from './LearnView';
import type { Tier } from './useViewportTier';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

const SUMMARY: GameSummary = {
  id: 'g0',
  difficulty: 'medium',
  createdAt: 0,
  updatedAt: 0,
  completedAt: null,
  elapsedMs: 0,
  runningSince: null,
  progress: 40,
  moves: 12,
  givens: PUZZLE,
  board: formatGrid(parseGrid(PUZZLE)),
};

// Mirrors `useViewportTier.ts`'s own query strings, like every other tier
// test in this directory.
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

/** Tailwind's spacing scale: one step is 0.25rem, so `-6` is 24px. */
const STEP_PX = 4;

function spacing(className: string, pattern: RegExp): number {
  const match = pattern.exec(className);
  if (match === null) return 0;
  return Number(match[1]) * STEP_PX;
}

/**
 * The distance between the bottom of the screen's header and the top of its
 * panes: whatever the header pushes or pads below itself, plus the split's
 * own top padding.
 */
function headerGapPx(container: HTMLElement): number {
  const header = container.querySelector('header');
  expect(header).not.toBeNull();
  const paneRow = screen.getByTestId('left-pane').parentElement;
  const split = paneRow?.parentElement;
  expect(split).not.toBeNull();

  return (
    spacing(header!.className, /\b[mp]b-(\d+)\b/) + spacing(split!.className, /\bpt-(\d+)\b/)
  );
}

/** Every element from the pane row up to the screen's own root. */
function ancestorsOfPanes(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let node = screen.getByTestId('left-pane').parentElement;
  while (node !== null && container.contains(node)) {
    out.push(node);
    node = node.parentElement;
  }
  return out;
}

describe('the wide screens', () => {
  /*
   * The page used to stop at 96rem, which left a third of a large monitor
   * empty on the two screens with the most to put there. Paolo asked for the
   * width; the cap that protects reading is the 40rem prose one, which lives
   * with the callers and is asserted separately in `LearnView.wide.test.tsx`.
   *
   * Asserted by walking the ancestors rather than by reading one known
   * element's class, because the cap could come back on any of them — the
   * screen root, the split's wrapper, the row — and a test pinned to the one
   * that happens to carry it today would miss the other two.
   */
  it('put no ceiling on the width of the panes', () => {
    matchOnly(...TIER_QUERIES.desktop);
    const library = render(
      <LocaleProvider locale="en">
        <LibraryView
          summaries={[SUMMARY]}
          onResume={() => undefined}
          onNewGame={() => undefined}
          onOpenSettings={() => undefined}
          onLearn={() => undefined}
        />
      </LocaleProvider>,
    );
    for (const node of ancestorsOfPanes(library.container)) {
      expect(node.className).not.toMatch(/\bmax-w-/);
    }
    library.unmount();

    matchOnly(...TIER_QUERIES.desktop);
    const learn = render(
      <LocaleProvider locale="en">
        <LearnView profile={{ ...DEFAULT_PROFILE, locale: 'en' }} onClose={() => undefined} />
      </LocaleProvider>,
    );
    for (const node of ancestorsOfPanes(learn.container)) {
      expect(node.className).not.toMatch(/\bmax-w-/);
    }
    // The header is chrome outside the panes, and it lines up with them —
    // a cap left there would put the title in a different place from the
    // list underneath it.
    expect(learn.container.querySelector('header')!.className).not.toMatch(/\bmax-w-/);
  });

  it('give the narrow pane more room above 1536, by tier and not by content', () => {
    // Invariant 10 says the narrow pane's width is the tier's business. This
    // is that, expressed as the breakpoint `useViewportTier` calls `desktop`
    // rather than as a prop a caller could get wrong.
    matchOnly(...TIER_QUERIES.desktop);
    render(
      <LocaleProvider locale="en">
        <LearnView profile={{ ...DEFAULT_PROFILE, locale: 'en' }} onClose={() => undefined} />
      </LocaleProvider>,
    );

    const narrow = screen.getByTestId('left-pane');
    expect(narrow.className).toContain('w-[20rem]');
    expect(narrow.className).toContain('2xl:w-[24rem]');
  });

  it('put the same gap between their header and their panes', () => {
    matchOnly(...TIER_QUERIES.laptop);
    const library = render(
      <LocaleProvider locale="en">
        <LibraryView
          summaries={[SUMMARY]}
          onResume={() => undefined}
          onNewGame={() => undefined}
          onOpenSettings={() => undefined}
          onLearn={() => undefined}
        />
      </LocaleProvider>,
    );
    const libraryGap = headerGapPx(library.container);
    library.unmount();

    matchOnly(...TIER_QUERIES.laptop);
    const learn = render(
      <LocaleProvider locale="en">
        <LearnView profile={{ ...DEFAULT_PROFILE, locale: 'en' }} onClose={() => undefined} />
      </LocaleProvider>,
    );
    const learnGap = headerGapPx(learn.container);

    expect(learnGap).toBe(libraryGap);
    // Pinned, not merely equal: two screens that agree on nothing would also
    // pass an equality check.
    expect(libraryGap).toBe(48);
  });
});
