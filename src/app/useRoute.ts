/**
 * Two routes, and a hand-rolled router to serve them.
 *
 * `docs/architecture.md` said there was no router, and gave a reason worth
 * keeping: *a URL for a board would only mean something on the device holding
 * that game*. That reason survives here — there are no per-game URLs, and
 * there never will be. What changed is that a landing page has to be
 * linkable, shareable and indexable, and a page reachable only by pressing
 * something inside the app is none of those.
 *
 * A router library would be twenty kilobytes to answer a question with two
 * possible values. This is that question: which of two screens, plus the
 * back button behaving the way a back button should.
 */

import { useCallback, useEffect, useState } from 'react';

export type Route = 'landing' | 'play';

/** `/play` is the app; everything else is the landing page. */
export const routeOf = (pathname: string): Route =>
  pathname.replace(/\/+$/, '') === '/play' ? 'play' : 'landing';

export const pathOf = (route: Route): string => (route === 'play' ? '/play' : '/');

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
