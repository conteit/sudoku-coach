/**
 * The account section of Settings — the only place in the app that mentions
 * an account, apart from one invitation on the library screen.
 *
 * The store is real; only its config is swapped. What is asserted is what
 * Paolo asked for: optional, invisible when unavailable, and never anywhere
 * near the board.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { DEFAULT_PROFILE } from '../state/mastery';
import { SettingsSheet } from './SettingsSheet';

const available = vi.fn(() => true);
const state = {
  account: null as { uid: string; email: string | null; displayName: string | null } | null,
  busy: false,
  failed: false,
  ready: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
  watch: vi.fn(),
};

vi.mock('../state/account', () => ({
  authAvailable: () => available(),
  useAccount: (select: (s: typeof state) => unknown) => select(state),
}));

afterEach(() => {
  state.account = null;
  state.busy = false;
  state.failed = false;
  available.mockReturnValue(true);
  state.signIn.mockReset();
  state.signOut.mockReset();
});

/**
 * Opens Settings on the Account tab, which is where all of this now lives.
 * Settings is tabbed because it outgrew a phone screen; the account section
 * itself is unchanged, and so are the claims below.
 */
const renderSettings = async () => {
  render(
    <LocaleProvider locale="en">
      <SettingsSheet
        open
        onClose={() => undefined}
        profile={{ ...DEFAULT_PROFILE, locale: 'en' }}
        onLocale={() => undefined}
        onSettings={() => undefined}
      />
    </LocaleProvider>,
  );
  const user = userEvent.setup();
  const tab = screen.queryByRole('tab', { name: 'Account' });
  if (tab !== null) await user.click(tab);
  return user;
};

describe('the account section', () => {
  it('offers sign-in, and says it is optional in the same breath', async () => {
    await renderSettings();

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.getByText(/Optional\./)).toBeInTheDocument();
    expect(screen.getByText(/everything works without it/)).toBeInTheDocument();
  });

  it('is absent entirely from a build with no Firebase config', async () => {
    // Not a disabled button: that advertises a feature this build does not
    // have and invites a bug report about it.
    available.mockReturnValue(false);
    await renderSettings();

    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
    expect(screen.queryByText('Account')).toBeNull();
    // And no tab leading to an empty panel, which is the same mistake one
    // level up.
    expect(screen.queryByRole('tab', { name: 'Account' })).toBeNull();
  });

  it('names who is signed in, and offers the way out', async () => {
    state.account = { uid: 'u1', email: 'someone@example.com', displayName: 'Someone' };
    await renderSettings();

    expect(screen.getByText(/someone@example.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  });

  it('reports a failed attempt as a line, not a dialog', async () => {
    // The commonest failure is a closed popup, which the player did on
    // purpose. A modal about it would be the app arguing with them.
    state.failed = true;
    await renderSettings();

    expect(screen.getByText('Sign-in did not complete.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /sign/i })).toBeNull();
  });

  it('holds the button while an attempt is in flight', async () => {
    state.busy = true;
    await renderSettings();

    expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled();
  });
});
