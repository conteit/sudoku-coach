/**
 * Two routes, and the back button.
 *
 * The hand-rolled router exists because a library would be twenty kilobytes
 * to answer a question with two values — but "hand-rolled" is only defensible
 * if the two things a router must actually get right are pinned: the address
 * decides the screen, and history behaves.
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
  });

  it('round-trips with pathOf', () => {
    expect(routeOf(pathOf('play'))).toBe('play');
    expect(routeOf(pathOf('landing'))).toBe('landing');
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
