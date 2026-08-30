/**
 * The dictionary layer (spec R7/R9): a typed lookup with `{name}` substitution.
 *
 * There is no i18n library here on purpose. The app must be fully playable
 * offline from a precached static bundle, and a runtime message loader would
 * mean either a fetch or a second copy of the ICU machinery in the bundle for
 * two locales of flat strings. What a library would buy us — plural rules and
 * list joining — the platform already provides through `Intl`.
 *
 * Both dictionaries are statically imported, so both ship in the precache and
 * switching language never touches the network.
 */
import type { HouseKind } from '../engine/types';
import type { Locale } from '../state/types';
import { en } from './en';
import { it } from './it';
import type { Dictionary, MessageArgs, MessageKey } from './types';

export type { Dictionary, MessageKey } from './types';

export const LOCALES: readonly Locale[] = ['en', 'it'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

const DICTIONARIES: Record<Locale, Dictionary> = { en, it };

/** The whole dictionary for a locale, for callers that need to enumerate it. */
export const dictionary = (locale: Locale): Dictionary => DICTIONARIES[locale];

const PLACEHOLDER = /\{(\w+)\}/g;

/** Substitutes `{name}` placeholders. Unknown names are left untouched. */
export const interpolate = (template: string, params: Record<string, string | number>): string =>
  template.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );

/**
 * Look up a UI string. The key is checked against the English dictionary, and
 * so is the shape of `params`: a key with no placeholders takes no second
 * argument, and one with placeholders requires exactly those names.
 */
export function t<K extends MessageKey>(locale: Locale, key: K, ...args: MessageArgs<K>): string {
  const template = DICTIONARIES[locale][key];
  const params = args[0] as Record<string, string | number> | undefined;
  return params ? interpolate(template, params) : template;
}

/**
 * Localized name of a house, e.g. "box 1" / "riquadro 1".
 *
 * `index` is the zero-based `House.index` from the engine; the label is
 * one-based, matching the `rXcY` coordinates used everywhere else in the UI.
 * This is what fills the `{house}` and `{house2}` tokens of a hint template,
 * so it has to agree with the lesson copy in both locales.
 */
export const houseLabel = (locale: Locale, kind: HouseKind, index: number): string => {
  const key = ({ row: 'house.row', col: 'house.col', box: 'house.box' } as const)[kind];
  return t(locale, key, { index: index + 1 });
};

const LIST_FORMATTERS = new Map<string, Intl.ListFormat>();

/**
 * Joins items the way the locale joins them: "a, b and c" / "a, b e c".
 * Used for the `{cells}`, `{digits}` and `{eliminations}` tokens.
 */
export const formatList = (locale: Locale, items: readonly (string | number)[]): string => {
  let formatter = LIST_FORMATTERS.get(locale);
  if (!formatter) {
    formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
    LIST_FORMATTERS.set(locale, formatter);
  }
  return formatter.format(items.map(String));
};
