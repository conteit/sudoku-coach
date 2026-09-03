import { expect, test } from '@playwright/test';

test('app shell renders and registers a service worker', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByRole('heading', { name: 'Sudoku Coach' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
});
