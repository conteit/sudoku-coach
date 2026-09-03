/**
 * The two pages Google's consent screen links to.
 *
 * What is worth pinning is not the prose — that is `legal/legal.test.ts` —
 * but that the address renders the right document in the reader's own
 * language, and that neither page is a dead end for someone who arrived from
 * outside with no history behind them.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { legalDocument } from '../legal';
import { renderWithLocale } from '../test/renderWithLocale';
import { LegalView } from './LegalView';

describe('LegalView', () => {
  it('renders the requested document, headings and all', () => {
    const onNavigate = vi.fn();
    renderWithLocale(<LegalView id="privacy" locale="en" onNavigate={onNavigate} />);

    const doc = legalDocument('en', 'privacy');
    expect(screen.getByRole('heading', { level: 1, name: doc.title })).toBeInTheDocument();
    for (const section of doc.sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeInTheDocument();
    }
  });

  it('reads in the profile locale, because that is the language it was accepted in', () => {
    const onNavigate = vi.fn();
    renderWithLocale(<LegalView id="terms" locale="it" onNavigate={onNavigate} />, 'it');

    expect(
      screen.getByRole('heading', { level: 1, name: legalDocument('it', 'terms').title }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ultimo aggiornamento/)).toBeInTheDocument();
  });

  it('leads home rather than into a history a visitor from Google does not have', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithLocale(<LegalView id="privacy" locale="en" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(onNavigate).toHaveBeenCalledWith('landing');
  });

  it('links to the other document, and not to itself', () => {
    const onNavigate = vi.fn();
    renderWithLocale(<LegalView id="privacy" locale="en" onNavigate={onNavigate} />);

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.queryByRole('link', { name: 'Privacy' })).not.toBeInTheDocument();
  });

  it('navigates in-app on a plain click, so the bundle is not reloaded', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithLocale(<LegalView id="privacy" locale="en" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('link', { name: 'Terms' }));
    expect(onNavigate).toHaveBeenCalledWith('terms');
  });
});
