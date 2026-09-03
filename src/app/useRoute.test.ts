/**
 * Four routes, and the back button.
 *
 * The hand-rolled router exists because a library would be twenty kilobytes
 * to answer a question with four values — but "hand-rolled" is only defensible
 * if the two things a router must actually get right are pinned: the address
 * decides the screen, and history behaves.
 *
 * `/privacy` and `/terms` raise the stakes on the first of those. Their
 * addresses are given to Google's OAuth consent screen, so a change that
 * quietly sent them to the landing page would not break a button anyone
 * presses — it would break a link the app has promised elsewhere.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { pathOf, routeOf, useRoute } from './useRoute';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('routeOf', () => {
  it('sends /play to the app and everything else to the landing page', () => {
    expect(routeOf('/play')).toBe('play');
    expect(routeOf('/')).toBe('landing');
    // Unknown paths land on the front door rather than on a blank screen —
    // there are only two pages, so a 404 would be a page this app does not
    // have.
    expect(routeOf('/anything-else')).toBe('landing');
  });

  it('ignores a trailing slash, which a shared link often carries', () => {
    expect(routeOf('/play/')).toBe('play');
    expect(routeOf('/privacy/')).toBe('privacy');
  });

  it('serves the two pages the consent screen links to', () => {
    expect(routeOf('/privacy')).toBe('privacy');
    expect(routeOf('/terms')).toBe('terms');
  });

  it('round-trips with pathOf', () => {
    for (const route of ['landing', 'play', 'privacy', 'terms'] as const) {
      expect(routeOf(pathOf(route))).toBe(route);
    }
  });
});

describe('useRoute', () => {
  it('reads the address it was loaded at, so a link works', () => {
    window.history.replaceState(null, '', '/play');
    const { result } = renderHook(() => useRoute());
    expect(result.current.route).toBe('play');
  });

  it('pushes history on the way in, so Back returns to the landing page', () => {
    window.history.replaceState(null, '', '/');
    const { result } = renderHook(() => useRoute());

    act(() => result.current.go('play'));
    expect(result.current.route).toBe('play');
    expect(window.location.pathname).toBe('/play');

    act(() => {
      window.history.back();
    });
    // jsdom's `back()` is asynchronous; the route follows the event, so this
    // asserts the listener exists rather than racing it.
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.route).toBe('landing');
  });

  it('does not stack a second entry for the page it is already on', () => {
    // Pressing Start twice must not make Back a button that appears to do
    // nothing.
    window.history.replaceState(null, '', '/play');
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;

    act(() => result.current.go('play'));
    expect(window.history.length).toBe(before);
  });
});
