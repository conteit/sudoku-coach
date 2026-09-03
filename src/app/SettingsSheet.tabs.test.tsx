/**
 * Settings, once it stopped fitting on a phone.
 *
 * The sheet had grown to an account, sync, two choosers and eight switches,
 * laid out in one column inside a panel with no height cap — so on a phone it
 * grew *upwards* off the top of the screen and neither the title nor the first
 * section could be reached at all. Capping the sheet made everything
 * reachable; the tabs are what make it findable.
 *
 * What is pinned here is the grouping and the keyboard contract, not the
 * styling: which switch is behind which tab is a decision, and a switch that
 * silently moved tab would be a switch a player cannot find again.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { DEFAULT_PROFILE } from '../state/mastery';
import type { Locale } from '../state/types';
import { SettingsSheet } from './SettingsSheet';

// Auth is configured by environment, and a test build has none — so without
// this the Account tab correctly does not exist, which is a different thing
// from the grouping being wrong.
vi.mock('../state/account', () => ({
  authAvailable: () => true,
  useAccount: (select: (state: unknown) => unknown) =>
    select({
      account: null,
      busy: false,
      failed: false,
      ready: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      watch: vi.fn(),
    }),
}));

const renderSettings = (locale: Locale = 'en') => {
  const onSettings = vi.fn();
  const onLocale = vi.fn();
  render(
    <LocaleProvider locale={locale}>
      <SettingsSheet
        open
        onClose={() => undefined}
        profile={{ ...DEFAULT_PROFILE, locale }}
        onLocale={onLocale}
        onSettings={onSettings}
      />
    </LocaleProvider>,
  );
  return { user: userEvent.setup(), onSettings, onLocale };
};

const tab = (name: string) => screen.getByRole('tab', { name });

describe('the settings tabs', () => {
  it('opens on Board — the switches anyone changes twice', () => {
    renderSettings();

    expect(tab('Board')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('switch', { name: /conflicting/i })).toBeInTheDocument();
  });

  it('keeps each group behind its own tab', async () => {
    const { user } = renderSettings();

    // Board holds what the grid draws, and nothing else.
    expect(screen.queryByText('Language')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();

    await user.click(tab('General'));
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /conflicting/i })).toBeNull();

    await user.click(tab('Account'));
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByText('Language')).toBeNull();
  });

  it('puts Account last, where a player who never signs in never has to go', () => {
    renderSettings();

    expect(screen.getAllByRole('tab').map((node) => node.textContent)).toEqual([
      'Board',
      'General',
      'Account',
    ]);
  });

  it('still reaches every switch that existed before the tabs', async () => {
    // The regression that would matter most: a setting that quietly stopped
    // being reachable because it fell between two groups.
    const { user } = renderSettings();
    const onBoard = [
      /conflicting/i,
      /same digit/i,
      /matching notes/i,
      /row, column/i,
      /colour|color/i,
      /dead notes/i,
    ];
    for (const name of onBoard) {
      expect(screen.getAllByRole('switch', { name }).length).toBeGreaterThan(0);
    }

    await user.click(tab('General'));
    expect(screen.getByRole('switch', { name: /vibrat|haptic/i })).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys, and takes focus along', async () => {
    const { user } = renderSettings();

    tab('Board').focus();
    await user.keyboard('{ArrowRight}');
    expect(tab('General')).toHaveAttribute('aria-selected', 'true');
    expect(tab('General')).toHaveFocus();

    // Wraps, so the strip has no dead end.
    await user.keyboard('{ArrowLeft}');
    await user.keyboard('{ArrowLeft}');
    expect(tab('Account')).toHaveAttribute('aria-selected', 'true');
  });

  it('leaves only the selected tab in the tab order', () => {
    // The ARIA pattern, and it is also what keeps the sheet's focus trap from
    // making a player walk through three tabs to reach a switch.
    renderSettings();

    expect(tab('Board')).toHaveAttribute('tabindex', '0');
    expect(tab('General')).toHaveAttribute('tabindex', '-1');
  });

  it('names the panel after the tab that opened it', () => {
    renderSettings();

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tab('Board').id);
    expect(tab('Board')).toHaveAttribute('aria-controls', panel.id);
  });

  it('translates the tabs rather than shipping English ones', () => {
    renderSettings('it');

    expect(screen.getByRole('tab', { name: 'Griglia' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Generale' })).toBeInTheDocument();
  });
});
