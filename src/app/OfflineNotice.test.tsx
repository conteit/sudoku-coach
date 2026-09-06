/**
 * What can actually be asserted here without a real service worker.
 *
 * jsdom has none, so the registration itself — `registerSW`, the
 * `visibilitychange`-driven `update()`, and the `controllerchange` listener
 * that sets the mark in the first place — is left to `tests/e2e/pwa.spec.ts`,
 * which runs against the real production build. What is tested here is the
 * half that is pure state: given the mark this component's own
 * `controllerchange` listener would have set on an earlier load, does mount
 * show the notice and clear the mark. `registerSW` is stubbed to a no-op so
 * mounting the component does not require the virtual module vite-plugin-pwa
 * only provides at build time.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';

vi.mock('virtual:pwa-register', () => ({
  registerSW: () => undefined,
}));

const { OfflineNotice } = await import('./OfflineNotice');

const UPDATED_KEY = 'sudoku-coach:updated';

const show = () =>
  render(
    <LocaleProvider locale="en">
      <OfflineNotice />
    </LocaleProvider>,
  );

beforeEach(() => {
  sessionStorage.clear();
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
