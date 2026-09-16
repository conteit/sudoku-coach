import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// jsdom's own default is 1024 — a plausible screen width, and exactly
// `useViewportTier`'s inclusive `laptop` boundary. A test that renders a
// tier-aware component without stubbing a tier was therefore landing on
// `'laptop'` by coincidence, not by design: silently exercising the wide
// layout instead of the narrow one every such test was written against
// before tier-awareness existed. Pinned here to a phone width instead — this
// app is designed mobile-first, and `GameView.layout.test.tsx` already names
// 375 as "this file's default context" for the same reason. A test that
// cares about a specific tier still says so explicitly (see
// `LearnView.test.tsx`, `LibraryView.test.tsx`); this only fixes what an
// *unstubbed* render implicitly assumes.
//
// Reset in a `beforeEach`, not assigned once at module scope: a test file
// runs many `it`s against one shared `window`, and a test that sets
// `innerWidth` itself (as several already do, for their own tier) would
// otherwise leak that width into every test that runs after it in the same
// file. The files that happen to reset it themselves today are immune by
// luck, not by design — this makes the default self-healing instead.
beforeEach(() => {
  window.innerWidth = 375;
  // Pinned alongside the width, and for the same reason: the landscape-phone
  // query is the first one to read a height, and jsdom's 768 default would
  // decide it. 812 makes the default viewport a whole phone held upright
  // rather than a width with an accidental height attached.
  window.innerHeight = 812;
});

// jsdom implements no rendering engine, so it never had a reason to implement
// `matchMedia` — but `useViewportTier` needs it to tell the four layouts
// apart (the modal focus-trap/Escape machinery must never activate on the
// static desktop panel). Evaluated against `window.innerWidth` and
// `window.innerHeight`, which a test can set before rendering to choose which
// tier it's exercising.
//
// Every clause of a query has to hold, not just one of them. An earlier
// version pulled out one `min-width` and one `max-width` and OR'd them, which
// is right for the single-clause queries but wrong the moment a compound one
// appears: `(min-width: 640px) and (max-width: 1023.98px) and (max-height:
// 480px)` — the landscape-phone query — then matched at `innerWidth = 375`,
// because 375 is indeed below 1023.98. Every portrait test in the suite was
// silently reporting itself as a phone held sideways, which switched off the
// coach sheet's modality and failed four tests that assert it. Height is read
// for the same reason: a query the stub cannot see the height half of is a
// query it answers by guessing.
if (typeof window.matchMedia !== 'function') {
  const CLAUSE = /\((min|max)-(width|height):\s*([\d.]+)px\)/g;

  window.matchMedia = (query: string): MediaQueryList => {
    const clauses = [...query.matchAll(CLAUSE)];
    const matches =
      clauses.length > 0 &&
      clauses.every(([, bound, axis, px]) => {
        const actual = axis === 'width' ? window.innerWidth : window.innerHeight;
        return bound === 'min' ? actual >= parseFloat(px) : actual <= parseFloat(px);
      });
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}
