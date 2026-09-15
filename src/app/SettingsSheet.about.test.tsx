/**
 * The About tab: which build this is, and going to look for a newer one.
 *
 * The update check is mocked here rather than driven for real, and that is not
 * laziness — `vite dev` and jsdom both register no service worker at all
 * (`devOptions.enabled: false`), so a check against the real module can only
 * ever answer `unavailable`. What this file pins is the part that is actually
 * this screen's: that every outcome becomes a sentence, and that the ordinary
 * one — "nothing changed" — is said out loud rather than looking like the
 * button did nothing. The registration plumbing is pinned in
 * `tests/e2e/pwa.spec.ts`, where a real worker exists.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { DEFAULT_PROFILE } from '../state/mastery';
import { STAMP_PATTERN } from '../buildStamp';
import type { Locale } from '../state/types';

const checkForUpdate = vi.hoisted(() => vi.fn());
vi.mock('./serviceWorker', () => ({
  checkForUpdate,
  UPDATE_TIMEOUT_MS: 10_000,
  // The module installs a worker at import; the rest of the sheet does not
  // touch it, so the mock only has to be shaped like it.
  usePwaStatus: { getState: () => ({ offlineReady: false }) },
  UPDATED_KEY: 'sudoku-coach:updated',
}));

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

const { SettingsSheet } = await import('./SettingsSheet');

beforeEach(() => {
  checkForUpdate.mockReset();
  checkForUpdate.mockResolvedValue('current');
});

const openAbout = async (locale: Locale = 'en') => {
  render(
    <LocaleProvider locale={locale}>
      <SettingsSheet
        open
        onClose={() => undefined}
        profile={{ ...DEFAULT_PROFILE, locale }}
        onLocale={() => undefined}
        onSettings={() => undefined}
      />
    </LocaleProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: locale === 'it' ? 'Info' : 'About' }));
  return { user };
};

describe('the About tab', () => {
  it('shows the build this app was made from', async () => {
    await openAbout();

    // By shape, because the value is baked in at build time and changes every
    // hour — an exact expectation would be a test rewritten to keep passing.
    const stamp = screen.getByText(STAMP_PATTERN);
    expect(stamp).toBeInTheDocument();
    // Its whole job is to be copied into a bug report.
    expect(stamp).toHaveClass('select-all');
  });

  it('says you are current, rather than saying nothing at all', async () => {
    // The ordinary answer, and the one the button exists to make legible: a
    // press that changes nothing on screen reads as a broken button.
    const { user } = await openAbout();

    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText('You are on the latest build.')).toBeInTheDocument();
  });

  it('reports a newer build as arriving, not as done', async () => {
    // `autoUpdate` reloads the page itself once the new worker takes over, so
    // "found" is a promise about what is about to happen.
    checkForUpdate.mockResolvedValue('found');
    const { user } = await openAbout();

    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText(/on its way/)).toBeInTheDocument();
  });

  it('admits when it could not reach the server', async () => {
    checkForUpdate.mockResolvedValue('failed');
    const { user } = await openAbout();

    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });

  it('says when there is no worker to ask, instead of pretending to check', async () => {
    checkForUpdate.mockResolvedValue('unavailable');
    const { user } = await openAbout();

    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByText(/not running the offline worker/)).toBeInTheDocument();
  });

  it('holds the button while it is looking', async () => {
    let settle: (outcome: string) => void = () => undefined;
    checkForUpdate.mockReturnValue(
      new Promise<string>((resolve) => {
        settle = resolve;
      }),
    );
    const { user } = await openAbout();

    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(screen.getByRole('button', { name: 'Looking…' })).toBeDisabled();

    settle('current');
    expect(await screen.findByText('You are on the latest build.')).toBeInTheDocument();
  });

  it('puts the answer where a screen reader will hear it', async () => {
    // A line that appears silently below a button is a line a player using a
    // screen reader never learns about.
    const { user } = await openAbout();
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(await screen.findByRole('status')).toHaveTextContent('You are on the latest build.');
  });

  it('speaks the player language', async () => {
    const { user } = await openAbout('it');
    await user.click(screen.getByRole('button', { name: 'Cerca aggiornamenti' }));

    expect(await screen.findByText('Stai usando la build più recente.')).toBeInTheDocument();
  });
});
