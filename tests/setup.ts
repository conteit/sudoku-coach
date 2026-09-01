import '@testing-library/jest-dom/vitest';

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
