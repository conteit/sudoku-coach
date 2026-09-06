/**
 * The toast that says what a sync brought in, while a game is open.
 *
 * Paolo's standing rule for sync is that it never interrupts a game and never
 * gets in the way — so the one behaviour that matters most here is silence:
 * a sync that moved nothing must render nothing, full stop.
 *
 * The real `useSync` store is used rather than a hand-rolled mock, the same
 * way `LibraryView.test.tsx` does it: this component's whole job is to react
 * correctly to `changed`/`announced` changing underneath it, including from
 * `seen()` — a mock that just returns a snapshot on each render cannot tell
 * the difference between "the store notified a subscriber" and "the test
 * re-rendered for an unrelated reason", which is exactly the distinction the
 * bug this file guards against turned on.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/react';
import { useSync } from '../sync/store';
import { SyncToast } from './SyncToast';

const show = (ids: string[], locale: 'en' | 'it' = 'en') => {
  useSync.setState({ changed: new Set(ids), announced: new Set() });
  return render(
    <LocaleProvider locale={locale}>
      <SyncToast />
    </LocaleProvider>,
  );
};

afterEach(() => {
  vi.useRealTimers();
  useSync.setState({ changed: new Set(), announced: new Set() });
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

  it('reopens when a second, larger arrival comes in after being dismissed', () => {
    show(['g1']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).toBeNull();

    // A new id, not the one already announced — g1 stays covered by
    // `announced`, so only g2 is the news this reopening is about.
    act(() => {
      useSync.setState({ changed: new Set(['g1', 'g2']) });
    });

    expect(screen.getByRole('status')).toHaveTextContent(/a game was updated/i);
  });

  it('does not reopen when seen() shrinks the set', () => {
    // This is the failure this component used to have: dismissing recorded a
    // fingerprint of the *whole* set, so seen() removing one id changed that
    // fingerprint and looked exactly like a new arrival — reopening the
    // toast inside the game the player just opened to make it go away.
    show(['g1', 'g2']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      useSync.getState().seen('g1');
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces nothing on remount for an arrival already shown', () => {
    // The other half of the same bug: the receipt used to be local state, so
    // leaving the game (unmounting this component) and opening another one
    // re-announced an arrival the player had already been told about.
    const first = show(['g1']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).toBeNull();
    first.unmount();

    render(
      <LocaleProvider locale="en">
        <SyncToast />
      </LocaleProvider>,
    );

    expect(screen.queryByRole('status')).toBeNull();
  });
});
