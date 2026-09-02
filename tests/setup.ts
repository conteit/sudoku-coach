import '@testing-library/jest-dom/vitest';

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
window.innerWidth = 375;

// jsdom implements no rendering engine, so it never had a reason to implement
// `matchMedia` — but `useViewportTier` needs it to tell the four layouts
// apart (the modal focus-trap/Escape machinery must never activate on the
// static desktop panel). Evaluated against `window.innerWidth`, which a test
// can set before rendering to choose which tier it's exercising. Both
// `min-width` and `max-width` are handled — `useViewportTier` queries both
// kinds (`(max-width: …)` for phone, `(min-width: …)` for laptop/desktop),
// and a stub that only understood one would silently pin every wide test to
// the tablet tier no matter how wide `innerWidth` actually was.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const matches =
      (max !== null && window.innerWidth <= parseFloat(max[1])) ||
      (min !== null && window.innerWidth >= parseFloat(min[1]));
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
