/**
 * The toast that says what a sync brought in, while a game is open.
 *
 * Paolo's standing rule for sync is that it never interrupts a game and never
 * gets in the way — so the one behaviour that matters most here is silence:
 * a sync that moved nothing must render nothing, full stop.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';

const store = vi.hoisted(() => ({
  state: { changed: new Set<string>() },
}));

vi.mock('../sync/store', () => ({
  useSync: (select: (s: typeof store.state) => unknown) => select(store.state),
}));

const { SyncToast } = await import('./SyncToast');

const show = (ids: string[], locale: 'en' | 'it' = 'en') => {
  store.state = { changed: new Set(ids) };
  return render(
    <LocaleProvider locale={locale}>
      <SyncToast />
    </LocaleProvider>,
  );
};

beforeEach(() => {
  store.state = { changed: new Set() };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the sync toast', () => {
  it('says nothing when a sync moved nothing', () => {
    show([]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('names the one game that arrived', () => {
    show(['g1']);
    expect(screen.getByRole('status')).toHaveTextContent(/a game was updated/i);
  });

  it('counts more than one', () => {
    show(['g1', 'g2']);
    expect(screen.getByRole('status')).toHaveTextContent(/2 games were updated/i);
  });

  it('can be dismissed early, and stays quiet for that same arrival', async () => {
    const user = userEvent.setup();
    show(['g1']);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('times out on its own, the way the offline notice does', () => {
    vi.useFakeTimers();
    show(['g1']);
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('speaks the player language', () => {
    show(['g1'], 'it');
    expect(screen.getByRole('status')).toHaveTextContent(/aggiornata da un altro dispositivo/i);
  });
});
