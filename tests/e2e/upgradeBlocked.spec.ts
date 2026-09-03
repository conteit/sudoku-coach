/**
 * The outage of 2026-09-03, as a test.
 *
 * Shipping a schema change hung the app for a player who had the installed PWA
 * open in the background. An IndexedDB upgrade cannot run while another
 * connection holds the old version, and the blocked `open()` never settles —
 * no timeout, no rejection. Both stores' `hydrate()` waited forever, `hydrated`
 * stayed false, and the shell rendered its loading placeholder. A blank page,
 * with every saved game apparently gone and nothing on screen saying otherwise.
 *
 * The unit test in `state/db.test.ts` covers the wiring. This one is here
 * because the failure was only ever visible as *what the player saw*, and that
 * takes a real browser holding a real second connection.
 */

import { expect, test } from '@playwright/test';

/** The v1 schema, held by a connection that will not yield — a frozen window. */
const HOLD_OLD_VERSION = `
  new Promise((resolve) => {
    indexedDB.deleteDatabase('sudoku-coach').onsuccess = () => {
      const request = indexedDB.open('sudoku-coach', 10);
      request.onupgradeneeded = () => {
        const db = request.result;
        const games = db.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('profile', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        window.__held = request.result;
        resolve('held');
      };
    };
  })
`;

test('leaves the front door and the legal pages open while it is blocked', async ({
  browser,
}, testInfo) => {
  // The app is made of stored games and cannot run without them. The landing
  // page is made of the day's seed, and the legal pages of authored text —
  // neither reads the database, so neither should be a casualty of it. The
  // privacy policy especially: Google's consent screen links to it, and the
  // people following that link have never opened the app.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const base = testInfo.project.use.baseURL ?? '/';

  const stale = await context.newPage();
  await stale.route('**/*.js', (route) => route.abort());
  await stale.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  expect(await stale.evaluate(HOLD_OLD_VERSION)).toBe('held');

  const page = await context.newPage();

  await page.goto(base, { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1, name: 'Sudoku Coach' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('alert')).toBeHidden();

  // Reached by the footer link rather than a fresh `goto`: this context has
  // service workers blocked, and the preview server has no SPA fallback of its
  // own, so a hard navigation to a deep link 404s here for reasons that have
  // nothing to do with what is being tested.
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible({
    timeout: 20_000,
  });

  // That the app itself still reports the problem is the next test's claim,
  // asserted there on a cold load rather than repeated here on a warm one.

  await stale.evaluate('window.__held.close()');
  await context.close();
});

test('tells the player which window is in the way, rather than showing nothing', async ({
  browser,
}, testInfo) => {
  // Service workers blocked so the first page cannot be handed the app from
  // cache: it has to stand in for a window running the *previous* build, which
  // means it must not boot this one and upgrade the database itself.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const base = testInfo.project.use.baseURL ?? '/';

  const stale = await context.newPage();
  await stale.route('**/*.js', (route) => route.abort());
  await stale.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  expect(await stale.evaluate(HOLD_OLD_VERSION)).toBe('held');

  const fresh = await context.newPage();
  // `/play` is the app, and the app is the part that genuinely needs the
  // database — the landing page is covered by the test above.
  await fresh.goto(`${base.replace(/\/$/, '')}/play`, { waitUntil: 'load' });

  // The whole point: a sentence, not an empty document.
  const alert = fresh.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(alert).toContainText(/another tab|installed app/i);
  // And it must say the games are safe, because a blank screen and data loss
  // look identical and only one of them is true here.
  await expect(alert).toContainText(/nothing has been lost/i);

  // Clearing the obstruction is enough; no reinstall, no lost data.
  await stale.evaluate('window.__held.close()');
  await fresh.reload({ waitUntil: 'load' });
  await expect(fresh.getByRole('button', { name: 'New puzzle' })).toBeVisible({
    timeout: 20_000,
  });

  await context.close();
});
