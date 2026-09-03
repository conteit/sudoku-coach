/**
 * Four routes, and a hand-rolled router to serve them.
 *
 * `docs/architecture.md` said there was no router, and gave a reason worth
 * keeping: *a URL for a board would only mean something on the device holding
 * that game*. That reason survives here — there are no per-game URLs, and
 * there never will be. What changed is that some pages have to be linkable
 * from outside the app: a landing page that is shareable and indexable, and
 * the privacy policy and terms, whose addresses are handed to Google's OAuth
 * consent screen and have to keep resolving without anyone pressing anything
 * inside the app first.
 *
 * A router library would be twenty kilobytes to answer a question with four
 * possible values. This is that question: which screen, plus the back button
 * behaving the way a back button should.
 */

import { useCallback, useEffect, useState } from 'react';

export type Route = 'landing' | 'play' | 'privacy' | 'terms';

/**
 * The address of each screen. One table, read in both directions, so a route
 * and its path can never drift apart the way two switch statements can.
 */
const PATHS = {
  landing: '/',
  play: '/play',
  privacy: '/privacy',
  terms: '/terms',
} as const satisfies Record<Route, string>;

const BY_PATH = new Map<string, Route>(
  Object.entries(PATHS).map(([route, path]) => [path, route as Route]),
);

export const pathOf = (route: Route): string => PATHS[route];

/** A known address gets its screen; everything else is the landing page. */
export const routeOf = (pathname: string): Route => {
  // A shared link often carries a trailing slash, and "/" itself is the one
  // path that is nothing but one.
  const path = pathname.replace(/\/+$/, '') || '/';
  return BY_PATH.get(path) ?? 'landing';
};

export interface Routing {
  route: Route;
  /** Pushes a history entry, so Back returns to where the player was. */
  go: (route: Route) => void;
}

export function useRoute(): Routing {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? 'landing' : routeOf(window.location.pathname),
  );

  useEffect(() => {
    // The browser's own back and forward buttons are the reason this exists
    // rather than a piece of state: a landing page you cannot leave by
    // pressing Back is a landing page that traps people.
    const onPop = () => setRoute(routeOf(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: Route) => {
    // Guarded: pressing "Start" twice should not put two entries in the
    // history, or Back becomes a button that appears to do nothing.
    if (routeOf(window.location.pathname) !== next) {
      window.history.pushState(null, '', pathOf(next));
    }
    setRoute(next);
  }, []);

  return { route, go };
}
