/**
 * What can actually be asserted here without a real service worker.
 *
 * jsdom has none, so the registration itself — `registerSW`, the
 * `visibilitychange`-driven `update()`, and the `controllerchange` listener
 * that sets the mark in the first place — is left to `tests/e2e/pwa.spec.ts`,
 * which runs against the real production build. All three now live in
 * `app/serviceWorker.ts` rather than in this component; `registerSW` is
 * stubbed to a no-op so importing that module does not require the virtual
 * module vite-plugin-pwa only provides at build time.
 *
 * What is tested here is the half that is pure state: given the mark an
 * earlier load left, does mount show the notice and clear the mark — and
 * does a precache that finished while this component was unmounted (a game
 * was open) still get announced when it comes back.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';

vi.mock('virtual:pwa-register', () => ({
  registerSW: () => undefined,
}));

const { OfflineNotice } = await import('./OfflineNotice');
const { usePwaStatus } = await import('./serviceWorker');

const UPDATED_KEY = 'sudoku-coach:updated';

const show = () =>
  render(
    <LocaleProvider locale="en">
      <OfflineNotice />
    </LocaleProvider>,
  );

beforeEach(() => {
  sessionStorage.clear();
  usePwaStatus.setState({ offlineReady: false });
});

describe('the post-update notice', () => {
  it('says nothing when no earlier load left a mark', () => {
    show();

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the notice and clears the mark, when one was left', () => {
    sessionStorage.setItem(UPDATED_KEY, '1');
    show();

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Updated to the latest version.');
    // One-shot: a mark that survived would announce the same update on
    // every later mount, including a plain reload of an already-current app.
    expect(sessionStorage.getItem(UPDATED_KEY)).toBeNull();
  });

  it('can be dismissed early, before the timeout', async () => {
    sessionStorage.setItem(UPDATED_KEY, '1');
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('speaks the player language', () => {
    sessionStorage.setItem(UPDATED_KEY, '1');
    render(
      <LocaleProvider locale="it">
        <OfflineNotice />
      </LocaleProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Aggiornato all’ultima versione.');
  });
});

describe('the offline-ready notice', () => {
  it('announces a precache that finished while no notice was mounted', () => {
    // The flag lives in `serviceWorker.ts`, not in this component, precisely
    // so that finishing the precache with a game open — this component
    // unmounted — is not a promise kept in silence.
    usePwaStatus.setState({ offlineReady: true });
    show();

    expect(screen.getByRole('status')).toHaveTextContent('Ready to play offline');
  });

  it('says it once: dismissing clears the flag for good, not just this mount', async () => {
    usePwaStatus.setState({ offlineReady: true });
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(usePwaStatus.getState().offlineReady).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

/*
 * #147's scenario, asserted rather than assumed.
 *
 * `App` renders this component only while no game is open, and `autoUpdate`
 * reloads the page under a player mid-puzzle — so the worry was that the
 * update mark is written to a screen that is not listening and lost. It is
 * not: the mark is `sessionStorage`, nothing else reads it, and the first
 * mount after the player leaves the game is the mount that finds it.
 */
describe('an update that landed while a game was open', () => {
  it('is announced when the player next leaves the game', async () => {
    // The controllerchange handler runs at module scope during play, with no
    // notice mounted anywhere.
    sessionStorage.setItem(UPDATED_KEY, '1');

    // Exiting to the library is what mounts it for the first time since.
    show();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Updated to the latest version.',
    );
    expect(sessionStorage.getItem(UPDATED_KEY)).toBeNull();
  });
});
