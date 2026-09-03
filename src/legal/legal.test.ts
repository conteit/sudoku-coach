/**
 * The documents are a factual description of the app, and these are the
 * claims that would be a lie if the text drifted — not a spellcheck.
 *
 * The privacy policy is linked from Google's OAuth consent screen as the
 * disclosure for the `drive.appdata` scope, and it is the contact route for a
 * data-protection request. A build that shipped it missing a locale, missing
 * the scope, or missing the address would pass every other test in the suite.
 */

import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n';
import { LEGAL_IDS, legalDocument } from '.';

const CONTACT = 'hello@paolocontessi.me';

describe('the published documents', () => {
  it.each(LOCALES.flatMap((locale) => LEGAL_IDS.map((id) => ({ locale, id }))))(
    'has $id authored in $locale',
    ({ locale, id }) => {
      const doc = legalDocument(locale, id);

      expect(doc.title.trim()).not.toBe('');
      expect(doc.updated.trim()).not.toBe('');
      expect(doc.intro.trim()).not.toBe('');
      expect(doc.sections.length).toBeGreaterThan(0);

      for (const section of doc.sections) {
        expect(section.heading.trim()).not.toBe('');
        expect(section.body.trim()).not.toBe('');
      }
    },
  );

  it.each(LEGAL_IDS)('says the same number of things about %s in both locales', (id) => {
    // Translations, not two independent documents: a section that exists in
    // one language and not the other means one of the two audiences is being
    // told less than the other about what the app does.
    const [first, ...rest] = LOCALES.map((locale) => legalDocument(locale, id).sections.length);
    for (const count of rest) expect(count).toBe(first);
  });

  it.each(LOCALES)('gives a way to reach a human in %s', (locale) => {
    for (const id of LEGAL_IDS) {
      const doc = legalDocument(locale, id);
      const text = doc.sections.map((section) => section.body).join('\n');
      expect(text).toContain(CONTACT);
    }
  });

  it.each(LOCALES)('discloses the Drive scope the consent screen asks for, in %s', (locale) => {
    const text = legalDocument(locale, 'privacy')
      .sections.map((section) => `${section.heading}\n${section.body}`)
      .join('\n');

    // Naming the scope is the disclosure Google's verification expects, and
    // the sentence that follows it is the promise that matters to a reader:
    // this permission cannot reach the rest of their Drive.
    expect(text).toContain('drive.appdata');
    expect(text).toMatch(/Google Drive/);
  });
});
