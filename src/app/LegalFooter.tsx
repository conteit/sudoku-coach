/**
 * The footer that carries the privacy and terms links.
 *
 * They are real anchors with real `href`s, not buttons: these two addresses
 * are handed to Google's OAuth consent screen and to anyone who wants to read
 * them before signing in, so they have to survive being copied, opened in a
 * new tab and crawled. The click handler is an enhancement on top of a link
 * that already works — it keeps an in-app navigation from reloading the bundle
 * and losing the taster board, and it stands aside for the modified clicks a
 * reader uses to open a page beside the one they are on.
 */

import type { MouseEvent } from 'react';
import { useT } from '../i18n/locale';
import { pathOf, type Route } from './useRoute';

/** A middle-click or a modifier means "not here" — let the browser have it. */
const wantsNewTab = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

function RouteLink({
  route,
  label,
  onNavigate,
}: {
  route: Route;
  label: string;
  onNavigate: (route: Route) => void;
}) {
  return (
    <a
      href={pathOf(route)}
      className="rounded-cell underline underline-offset-2 hover:text-ink"
      onClick={(event) => {
        if (wantsNewTab(event)) return;
        event.preventDefault();
        onNavigate(route);
      }}
    >
      {label}
    </a>
  );
}

export interface LegalFooterProps {
  onNavigate: (route: Route) => void;
  /** The page the reader is already on, which is not a link back to itself. */
  current?: Route;
}

export function LegalFooter({ onNavigate, current }: LegalFooterProps) {
  const t = useT();

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-6 text-sm text-ink-soft">
      <span>{t('app.name')}</span>
      {current !== 'landing' ? (
        <RouteLink route="landing" label={t('legal.home')} onNavigate={onNavigate} />
      ) : null}
      {current !== 'privacy' ? (
        <RouteLink route="privacy" label={t('legal.privacy')} onNavigate={onNavigate} />
      ) : null}
      {current !== 'terms' ? (
        <RouteLink route="terms" label={t('legal.terms')} onNavigate={onNavigate} />
      ) : null}
    </footer>
  );
}
