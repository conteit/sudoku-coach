/**
 * The locale, as React context.
 *
 * Separate from the provider component so a module that only needs `useT()`
 * does not import a component — and so fast refresh keeps working in both.
 */

import { createContext, useContext, useMemo } from 'react';
import type { Locale } from '../state/types';
import { DEFAULT_LOCALE, LOCALES, t } from './index';
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

/**
 * The locale to open with on a first run: the first language the browser asks
 * for that this app actually speaks. It is a guess, not a choice — the settings
 * sheet is where a choice is made, and once made it wins forever.
 */
export function preferredLocale(
  requested: readonly string[] = navigator.languages ?? [navigator.language],
): Locale | undefined {
  for (const tag of requested) {
    const base = tag.toLowerCase().split('-')[0];
    const match = LOCALES.find((locale) => locale === base);
    if (match !== undefined) return match;
  }
  return undefined;
}
