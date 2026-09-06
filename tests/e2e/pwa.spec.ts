/**
 * R9 — offline-complete, and installable.
 *
 * These assertions are made here rather than left to Lighthouse on purpose.
 * Lighthouse 12 removed the PWA category, so "the Lighthouse PWA audit passes"
 * is no longer a thing that can be asserted; and the requirement was never
 * really "a tool gives us a badge", it is "the app works with the network off".
 * That is exactly what is checked below, on the real build.
 *
 * The Lighthouse run that remains in CI covers performance, accessibility, best
 * practices and SEO, where it still has categories to score.
 */

import { expect, test } from '@playwright/test';
import { openCoach } from './coach';
import { boardGrid } from './board';

interface Manifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  icons?: { src: string; sizes: string; type?: string; purpose?: string }[];
}

test('ships an installable manifest with the icons an install prompt needs', async ({
  page,
  request,
}) => {
  await page.goto('/play');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href, 'a manifest must be linked from the document').not.toBeNull();

  const response = await request.get(new URL(href!, page.url()).toString());
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as Manifest;
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  // `/play`, not `/`: an installed app opens the board, since whoever
  // installed it has already read the landing page.
  expect(manifest.start_url).toContain('/play');
  expect(manifest.display).toBe('standalone');

  const sizes = (manifest.icons ?? []).map((icon) => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(
    (manifest.icons ?? []).some((icon) => icon.purpose?.includes('maskable')),
    'an install needs a maskable icon or it gets a letterboxed one',
  ).toBe(true);

  for (const icon of manifest.icons ?? []) {
    const icons = await request.get(new URL(icon.src, page.url()).toString());
    expect(icons.ok(), `${icon.src} must be served`).toBe(true);
  }
});

test('says when it is ready to play offline', async ({ page }) => {
  await page.goto('/play');

  // The promise is only kept once the precache is in place, and a player who
  // is never told finds out by losing signal.
  await expect(page.getByRole('status')).toContainText('Ready to play offline', {
    timeout: 20_000,
  });
});

test('checks for an update when the tab is resumed rather than navigated', async ({ page }) => {
  // `immediate: true` alone only checks for a new worker on navigation.
  // `onRegisteredSW` hands back the registration so a `visibilitychange`
  // listener can call `update()` at the same moment sync already checks in —
  // the fix for a resumed (not reloaded) PWA sitting on an old build.
  await page.addInitScript(() => {
    (window as unknown as { __updateCalls: number }).__updateCalls = 0;
    const proto = window.ServiceWorkerRegistration?.prototype;
    if (proto) {
      const original = proto.update;
      proto.update = function (this: ServiceWorkerRegistration) {
        (window as unknown as { __updateCalls: number }).__updateCalls++;
        return original.call(this);
      };
    }
  });

  await page.goto('/play');

  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 20_000,
    })
    .toBe(true);
  // `onRegisteredSW` fires asynchronously after `register()` resolves; give
  // it a moment to hand the registration to the component before the tab is
  // "hidden", or there is nothing yet for `visibilitychange` to call into.
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __updateCalls: number }).__updateCalls))
    .toBeGreaterThan(0);
});

test('says it updated, once, after the service worker takes over', async ({ page }) => {
  // `autoUpdate` reloads on its own the instant a new worker takes control —
  // silently, which is the point for a puzzle in progress, but it left a real
  // regression (#126) with no trace at all. `controllerchange` is simulated
  // here rather than produced by an actual second build, which the e2e
  // pipeline has no second build to install; the event itself, fired with a
  // controller already in place, is exactly what the component's listener
  // reacts to either way.
  await page.goto('/play');

  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 20_000,
    })
    .toBe(true);

  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await page.reload();

  await expect(page.getByRole('status')).toContainText('Updated to the latest version', {
    timeout: 20_000,
  });

  // One-shot: the mark is cleared the moment it is read, so a plain reload
  // afterwards — nothing having changed again — has nothing left to say.
  await page.reload();
  await expect(page.getByText('Updated to the latest version.')).toHaveCount(0);
});

test('plays with the network off', async ({ page, context }) => {
  await page.goto('/play');

  // The service worker must be in control before the network goes away —
  // precaching is what makes the next load possible at all.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 20_000,
    })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Sudoku Coach' })).toBeVisible();

  // Not just the shell: generation, the board and the coach are all local, so
  // a whole puzzle has to start and play with no network at all.
  await page.getByRole('button', { name: 'New puzzle' }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await expect(boardGrid(page)).toBeVisible({ timeout: 60_000 });

  const coach = await openCoach(page);
  await coach.getByRole('button', { name: 'Where should I look?' }).click();
  await expect(coach.getByLabel('Disclosure level 1 of 4')).toBeVisible();

  await context.setOffline(false);
});
