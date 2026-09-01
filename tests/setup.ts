import '@testing-library/jest-dom/vitest';

// jsdom implements no rendering engine, so it never had a reason to implement
// `matchMedia` — but `GameView` needs it to tell the mobile sheet apart from
// the static desktop panel (the modal focus-trap/Escape machinery must never
// activate on the static one). Evaluated against `window.innerWidth`, which a
// test can set before rendering to choose which layout it's exercising.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const matches = max !== null && window.innerWidth <= parseFloat(max[1]);
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
