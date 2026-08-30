/**
 * The dictionary, bound to the React tree.
 *
 * The locale lives in the player profile, and every component below the shell
 * needs it — passing it down as a prop would put a `locale` on components that
 * only render chrome. A context is the cheaper contract: components ask for
 * `useT()` and get a lookup already bound to the current locale, with the key
 * and its placeholders still checked by the compiler.
 */

import type { ReactNode } from 'react';
import type { Locale } from '../state/types';
import { LocaleContext } from './locale';

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}
