/**
 * The hand-driven update check.
 *
 * Its own file because `serviceWorker.ts` registers a worker at import, and
 * these tests need to drive the registration the module captured — so the
 * `virtual:pwa-register` mock has to be in place before the import, the same
 * convention `OfflineNotice.test.tsx` uses.
 *
 * What is pinned here is the part that is easy to get wrong and invisible when
 * it is: that `update()` resolving does not mean an update was found, and that
 * a check which never comes back is reported rather than left spinning.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerSW = vi.hoisted(() => vi.fn());
vi.mock('virtual:pwa-register', () => ({ registerSW }));

/** Just enough registration for the two fields the check reads. */
function fakeRegistration(
  update: () => Promise<void>,
  after: { waiting?: unknown; installing?: unknown } = {},
): ServiceWorkerRegistration {
  return {
    update,
    waiting: after.waiting ?? null,
    installing: after.installing ?? null,
  } as unknown as ServiceWorkerRegistration;
}

/**
 * Re-imports the module with a registration already handed to it, by running
 * `registerSW`'s `onRegisteredSW` callback the way the plugin would.
 */
async function moduleWith(registration?: ServiceWorkerRegistration) {
  vi.resetModules();
  registerSW.mockImplementation(
    (options: { onRegisteredSW?: (url: string, reg?: ServiceWorkerRegistration) => void }) => {
      if (registration !== undefined) options.onRegisteredSW?.('/sw.js', registration);
    },
  );
  return import('./serviceWorker');
}

beforeEach(() => {
  registerSW.mockReset();
});

describe('checking for an update on purpose', () => {
  it('says the app is current when the look turns nothing up', async () => {
    // `update()` resolves whether or not there was anything to find, which is
    // the trap: reading success off the promise would report every check as a
    // new version.
    const { checkForUpdate } = await moduleWith(fakeRegistration(() => Promise.resolve()));

    await expect(checkForUpdate()).resolves.toBe('current');
  });

  it('reports a find only when a worker is actually waiting for its turn', async () => {
    const { checkForUpdate } = await moduleWith(
      fakeRegistration(() => Promise.resolve(), { waiting: {} }),
    );

    await expect(checkForUpdate()).resolves.toBe('found');
  });

  it('counts one that is still installing, which is the same news slightly earlier', async () => {
    const { checkForUpdate } = await moduleWith(
      fakeRegistration(() => Promise.resolve(), { installing: {} }),
    );

    await expect(checkForUpdate()).resolves.toBe('found');
  });

  it('gives up rather than hanging when the network never answers', async () => {
    // `registration.update()` is a fetch of `sw.js` with no deadline of its
    // own. Without this the button spins forever on a dead connection, which
    // is worse than an honest failure.
    vi.useFakeTimers();
    try {
      const { checkForUpdate } = await moduleWith(fakeRegistration(() => new Promise(() => {})));

      const settled = checkForUpdate(5000);
      await vi.advanceTimersByTimeAsync(5000);

      await expect(settled).resolves.toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a refusal as a failure rather than throwing into the press', async () => {
    const { checkForUpdate } = await moduleWith(
      fakeRegistration(() => Promise.reject(new Error('offline'))),
    );

    await expect(checkForUpdate()).resolves.toBe('failed');
  });

  it('says there is nothing to ask when no worker was ever registered', async () => {
    // `vite dev` and any browser without service workers. Reporting this as a
    // failure would send a player looking for a network problem they do not
    // have.
    const { checkForUpdate } = await moduleWith(undefined);

    await expect(checkForUpdate()).resolves.toBe('unavailable');
  });
});
