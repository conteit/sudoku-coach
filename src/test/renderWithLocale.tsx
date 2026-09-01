/**
 * `render`, with the dictionary bound to a locale.
 *
 * Most component tests never need this — `useT()` falls back to the reference
 * locale when no provider is above it (see `LocaleContext`), which is enough
 * for English-only assertions. This helper exists for tests that need a
 * specific locale in the tree, or just want the same provider `App.tsx` uses
 * rather than reaching into `i18n/react` themselves.
 */

import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '../i18n/react';
import type { Locale } from '../state/types';

export function renderWithLocale(
  node: ReactNode,
  locale: Locale = 'en',
): RenderResult {
  return render(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
}
