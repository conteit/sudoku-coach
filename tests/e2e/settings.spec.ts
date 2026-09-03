/**
 * Settings has to fit the screen it is on.
 *
 * It stopped doing so: an account, sync, two choosers and eight switches in
 * one column, inside a panel with no height cap. A bottom sheet is laid out
 * against the bottom of a fixed, unscrollable container, so a panel taller
 * than the viewport does not gain a scrollbar — it grows *upwards* off the top
 * of the screen, and the title and first section become unreachable by any
 * gesture. That is what "unusable on a phone" meant, and it is a geometric
 * claim, so it is asserted geometrically here rather than by eye.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * A deliberately short window, and that is the point rather than a detail.
 *
 * At a normal phone height the tabs alone shorten each panel enough to fit, so
 * a test taken there passes with the height cap removed — it was protecting
 * nothing, which a mutation run is how you find out. Grouping and capping are
 * two separate guarantees and this file is asserting the second one, so the
 * viewport has to be short enough that the content genuinely cannot fit.
 */
const SHORT = { width: 375, height: 380 };

const openSettings = async (page: Page) => {
  await page.setViewportSize(SHORT);
  await page.goto('/play');
  await page.getByRole('button', { name: 'Settings' }).click();
  return page.getByRole('dialog');
};

test('fits inside the viewport, title and all', async ({ page }) => {
  const sheet = await openSettings(page);
  await expect(sheet).toBeVisible();

  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();

  // The failure was `box.y < 0` — the panel's top edge above the screen, with
  // nothing able to scroll to it.
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(SHORT.height + 1);

  // And the overflow went somewhere reachable rather than off-screen.
  const scrollable = await sheet.evaluate((node) =>
    [...node.querySelectorAll('*')].some((el) => el.scrollHeight > el.clientHeight + 1),
  );
  expect(scrollable).toBe(true);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('reaches every group without leaving the sheet', async ({ page }) => {
  const sheet = await openSettings(page);

  await expect(sheet.getByRole('switch', { name: /conflicting/i })).toBeVisible();

  await sheet.getByRole('tab', { name: 'General' }).click();
  await expect(sheet.getByText('Language')).toBeVisible();

  // Still inside the screen after the tallest panel is shown.
  const box = await sheet.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(SHORT.height + 1);
});

test('is clean to axe with the sheet open', async ({ page }) => {
  await openSettings(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
