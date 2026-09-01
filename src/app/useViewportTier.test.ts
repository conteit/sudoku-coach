import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewportTier } from './useViewportTier';

/** Drives the matchMedia stub: the listed queries match, all others do not. */
function matchOnly(...matching: string[]) {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('useViewportTier', () => {
  it('is phone below 640', () => {
    matchOnly('(max-width: 639.98px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('phone');
  });

  it('is tablet between 640 and 1023', () => {
    matchOnly();
    expect(renderHook(() => useViewportTier()).result.current).toBe('tablet');
  });

  it('is laptop from 1024', () => {
    matchOnly('(min-width: 1024px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('laptop');
  });

  it('is desktop from 1536', () => {
    matchOnly('(min-width: 1024px)', '(min-width: 1536px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('desktop');
  });
});
