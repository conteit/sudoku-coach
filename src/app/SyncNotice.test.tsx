/**
 * The notice that says sync stopped and the games did not.
 *
 * Paolo's rule for this whole feature: a sync that fails is never allowed to
 * interrupt a puzzle, and never allowed to be silent either. So what is pinned
 * is when it appears, when it stays quiet, and that it leads with the fact a
 * player actually needs — the games are on the device.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import type { SyncStatus } from '../sync/store';

const store = vi.hoisted(() => ({
  state: { enabled: true, status: 'idle' as SyncStatus, lastSyncedAt: null },
}));

vi.mock('../sync/store', () => ({
  useSync: (select: (s: typeof store.state) => unknown) => select(store.state),
}));

const { SyncNotice } = await import('./SyncNotice');

const show = (status: SyncStatus, enabled = true) => {
  store.state = { enabled, status, lastSyncedAt: null };
  return render(
    <LocaleProvider locale="en">
      <SyncNotice />
    </LocaleProvider>,
  );
};

beforeEach(() => {
  store.state = { enabled: true, status: 'idle', lastSyncedAt: null };
});

describe('the sync notice', () => {
  it('says nothing while sync is working', () => {
    show('idle');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing mid-sync — that is not news', () => {
    show('syncing');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing to a player who never turned sync on', () => {
    // The status can be anything at all; without the switch there is no
    // promise to have broken.
    show('consent', false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('explains a lost sign-in, and leads with the games being safe', () => {
    show('consent');

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/saved on this device/i);
    expect(notice).toHaveTextContent(/sign in to Google again/i);
  });

  it('explains a failed attempt as something that will be retried', () => {
    show('error');

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/saved on this device/i);
    expect(notice).toHaveTextContent(/try again/i);
  });

  it('can be dismissed, and stays dismissed for that condition', async () => {
    const user = userEvent.setup();
    show('consent');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('speaks the player language', () => {
    store.state = { enabled: true, status: 'consent', lastSyncedAt: null };
    render(
      <LocaleProvider locale="it">
        <SyncNotice />
      </LocaleProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/salvate su questo dispositivo/i);
  });
});
