/**
 * The privacy policy and the terms, as authored text.
 *
 * These live here rather than in `src/i18n/{locale}.ts` for the same reason
 * lesson copy does not: that dictionary is chrome — short flat strings, one
 * line each — and a ten-section legal document written as forty dotted keys
 * would be unreadable to the only people who ever need to read it closely,
 * which is whoever has to check it still matches what the app does.
 *
 * Both locales are statically imported, exactly as `coach/lessons` does it, so
 * the pages are precached and readable offline. A privacy policy that needs
 * the network to be read is a privacy policy nobody reads.
 *
 * **This is a factual description of the app's behaviour, not decoration.** If
 * a change makes the app collect, transmit or store something these documents
 * do not describe, the document is now wrong and updating it is part of that
 * change — the Google OAuth consent screen links here, and the disclosure it
 * requires is exactly this text.
 */
import type { Locale } from '../state/types';
import enLegal from './en.json';
import itLegal from './it.json';

/** The two documents the app publishes. Also the two routes that show them. */
export const LEGAL_IDS = ['privacy', 'terms'] as const;
export type LegalId = (typeof LEGAL_IDS)[number];

export interface LegalSection {
  heading: string;
  /** Paragraphs separated by blank lines, like lesson prose. */
  body: string;
}

export interface LegalDocument {
  title: string;
  /** Human-written date, in the locale's own form — it is read, not compared. */
  updated: string;
  intro: string;
  sections: readonly LegalSection[];
}

export type LegalLibrary = Record<LegalId, LegalDocument>;

type Expect<T extends true> = T;

/** True only when `T`'s keys are exactly the two document ids. */
type KeyedByDocument<T> = [LegalId] extends [keyof T]
  ? [keyof T] extends [LegalId]
    ? true
    : false
  : false;

/**
 * Compile-time completeness: a locale that is missing a document, or that
 * carries one under a key the app never renders, fails the build here rather
 * than producing a blank page at an address Google has been told to trust.
 */
export type EnglishCoversEveryDocument = Expect<KeyedByDocument<typeof enLegal>>;
export type ItalianCoversEveryDocument = Expect<KeyedByDocument<typeof itLegal>>;

const LIBRARIES: Record<Locale, LegalLibrary> = {
  en: enLegal as LegalLibrary,
  it: itLegal as LegalLibrary,
};

/** One document, in one locale. Total by construction. */
export const legalDocument = (locale: Locale, id: LegalId): LegalDocument =>
  LIBRARIES[locale][id];
