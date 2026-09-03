/**
 * The privacy policy and the terms, rendered from the authored documents.
 *
 * One component for both because they are the same shape — a title, a date, an
 * intro and a list of sections — and a second component would only be a second
 * place for the layout to drift. Which document it is arrives as a route, not
 * as a prop from somewhere inside the app: these pages are reached from the
 * outside as often as from within, so they have to render from the address
 * alone with no game, no profile and no account in hand.
 *
 * The prose reuses `ui/learn/prose`, so a legal page reads in the same voice
 * and at the same measure as a lesson (invariant 10's cap included). A privacy
 * policy set in a different typeface from the rest of the app looks pasted in
 * from a template, which is exactly the impression this one should not give.
 */

import { useT } from '../i18n/locale';
import { legalDocument, type LegalId } from '../legal';
import type { Locale } from '../state/types';
import { IconButton } from '../ui/primitives/IconButton';
import { ChevronLeftIcon } from '../ui/primitives/icons';
import { Section } from '../ui/learn/prose';
import { LegalFooter } from './LegalFooter';
import type { Route } from './useRoute';

export interface LegalViewProps {
  id: LegalId;
  locale: Locale;
  onNavigate: (route: Route) => void;
}

export function LegalView({ id, locale, onNavigate }: LegalViewProps) {
  const t = useT();
  const doc = legalDocument(locale, id);

  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-8 px-6 pt-10 pb-16">
      <header className="flex items-start gap-3">
        {/* Goes to the landing page rather than into history: a reader who
            arrived here from Google's consent screen has no history to go
            back to, and a Back that leaves the site is not a way in. */}
        <IconButton
          label={t('legal.home')}
          icon={<ChevronLeftIcon />}
          className="flex-none"
          onClick={() => onNavigate('landing')}
        />
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-none text-ink">{doc.title}</h1>
          <p className="mt-1.5 text-sm text-ink-faint">
            {t('legal.updated', { date: doc.updated })}
          </p>
        </div>
      </header>

      <p className="text-[0.9375rem] leading-relaxed text-ink">{doc.intro}</p>

      <div>
        {doc.sections.map((section) => (
          <Section key={section.heading} title={section.heading} body={section.body} />
        ))}
      </div>

      <LegalFooter onNavigate={onNavigate} current={id} />
    </div>
  );
}
