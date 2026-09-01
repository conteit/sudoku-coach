/**
 * The dictionary layer is small, so what is worth testing is the contract
 * between locales: the same keys, the same placeholders, and house labels that
 * agree with the lesson copy that surrounds them.
 */
import { describe, expect, it } from 'vitest';
import type { HouseKind } from '../engine/types';
import { en } from './en';
import { it as itDictionary } from './it';
import { dictionary, DEFAULT_LOCALE, formatList, houseLabel, interpolate, LOCALES, t } from './index';
import type { MessageKey } from './types';

const KEYS = Object.keys(en) as MessageKey[];
const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  it('ships exactly the locales the profile can hold', () => {
    expect([...LOCALES].sort()).toEqual(['en', 'it']);
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it('has identical key sets in every locale', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(dictionary(locale)).sort(), locale).toEqual([...KEYS].sort());
    }
  });

  it.each(LOCALES)('%s has no empty or untrimmed strings', (locale) => {
    for (const [key, value] of Object.entries(dictionary(locale))) {
      expect(value.length, key).toBeGreaterThan(0);
      expect(value, key).toBe(value.trim());
    }
  });

  it.each(KEYS)('%s takes the same placeholders in every locale', (key) => {
    const reference = placeholders(en[key]);
    for (const locale of LOCALES) {
      expect(placeholders(dictionary(locale)[key]), `${locale}: ${key}`).toEqual(reference);
    }
  });

  it('is not a copy of English pretending to be Italian', () => {
    const identical = KEYS.filter((key) => en[key] === itDictionary[key]);
    // Proper nouns match, and so does a string made only of placeholders —
    // `cell.value` is "{cell}, {digit}" in any language. Everything else must
    // actually have been written.
    expect(new Set(identical)).toEqual(
      new Set(['app.name', 'coach.title', 'coach.open', 'cell.value']),
    );
  });
});

describe('t', () => {
  it('returns the locale string', () => {
    expect(t('en', 'action.hint')).toBe('Hint');
    expect(t('it', 'action.hint')).toBe('Suggerimento');
  });

  it('substitutes placeholders', () => {
    expect(t('en', 'games.filled', { filled: 12, total: 81 })).toBe('12 of 81 cells filled');
    expect(t('it', 'games.filled', { filled: 12, total: 81 })).toBe('12 celle su 81 compilate');
  });

  it('leaves unknown placeholders alone rather than printing undefined', () => {
    expect(interpolate('a {known} b {unknown}', { known: 'x' })).toBe('a x b {unknown}');
  });
});

describe('houseLabel', () => {
  const kinds: HouseKind[] = ['row', 'col', 'box'];

  it('renders one-based labels in each locale', () => {
    expect(kinds.map((k) => houseLabel('en', k, 0))).toEqual(['row 1', 'column 1', 'box 1']);
    expect(kinds.map((k) => houseLabel('it', k, 0))).toEqual(['riga 1', 'colonna 1', 'riquadro 1']);
    expect(houseLabel('en', 'box', 8)).toBe('box 9');
    expect(houseLabel('it', 'box', 8)).toBe('riquadro 9');
  });

  it('covers all nine indices of all three kinds', () => {
    for (const locale of LOCALES) {
      for (const kind of kinds) {
        for (let i = 0; i < 9; i++) {
          const label = houseLabel(locale, kind, i);
          expect(label, `${locale} ${kind} ${i}`).toMatch(new RegExp(`\\b${i + 1}$`));
        }
      }
    }
  });
});

describe('formatList', () => {
  it('joins the way the locale joins', () => {
    expect(formatList('en', ['r3c1', 'r3c3'])).toBe('r3c1 and r3c3');
    expect(formatList('it', ['r3c1', 'r3c3'])).toBe('r3c1 e r3c3');
    expect(formatList('en', [3, 7, 9])).toBe('3, 7, and 9');
    expect(formatList('it', [3, 7, 9])).toBe('3, 7 e 9');
  });

  it('handles the degenerate lengths', () => {
    for (const locale of LOCALES) {
      expect(formatList(locale, [])).toBe('');
      expect(formatList(locale, ['r1c1'])).toBe('r1c1');
    }
  });
});
