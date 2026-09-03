/**
 * The front door.
 *
 * Everything here is about the two properties a landing page has that a
 * screen inside an app does not: it lives at an address someone can link to,
 * and it has to survive being loaded cold at that address. The rest of the
 * suite drives `/play` directly, which is exactly why this file exists.
 */

import { expect, test } from '@playwright/test';

test.describe('the landing page', () => {
  test('is what the root address serves, and it says what the app is', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Sudoku Coach', level: 1 })).toBeVisible();
    await expect(page.getByText(/refuses to tell you the answer/i)).toBeVisible();
  });

  test("deals today's board and lets a visitor play it before deciding anything", async ({
    page,
  }) => {
    await page.goto('/');

    // Generation runs in the same worker the app uses, so this is a real
    // puzzle arriving, not a fixture.
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible({ timeout: 20_000 });

    const empty = grid.getByRole('gridcell').filter({ hasText: /^$/ }).first();
    await empty.click();
    await page.keyboard.press('4');
    await expect(grid.getByRole('gridcell', { name: /, 4/ }).first()).toBeVisible();
  });

  test('Start takes you to /play, and Back returns', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Start playing|Continue this puzzle/ }).click();
    await expect(page).toHaveURL(/\/play$/);
    // The library, i.e. the app proper.
    await expect(page.getByRole('button', { name: 'Learn' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/refuses to tell you the answer/i)).toBeVisible();
  });

  test('/play survives being loaded cold, which is what a rewrite is for', async ({ page }) => {
    // A shared link, or a refresh. Without the SPA rewrite this is a 404,
    // and the failure only ever shows up in a real deployment.
    await page.goto('/play');
    await expect(page.getByRole('button', { name: 'Learn' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Learn' })).toBeVisible();
  });
});
