/**
 * The locale, as React context.
 *
 * Separate from the provider component so a module that only needs `useT()`
 * does not import a component — and so fast refresh keeps working in both.
 */

import { createContext, useContext, useMemo } from 'react';
import type { Locale } from '../state/types';
import { DEFAULT_LOCALE, t } from './index';
import type { MessageArgs, MessageKey } from './types';

/**
 * Defaults to the reference locale rather than throwing: a component rendered
 * in a unit test without a provider should still read.
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export const useLocale = (): Locale => useContext(LocaleContext);

export type Translate = <K extends MessageKey>(key: K, ...args: MessageArgs<K>) => string;

/** A `t()` bound to the tree's locale. Stable per locale, so it is safe in deps. */
export function useT(): Translate {
  const locale = useLocale();
  return useMemo<Translate>(
    () =>
      (key, ...args) =>
        t(locale, key, ...args),
    [locale],
  );
}
