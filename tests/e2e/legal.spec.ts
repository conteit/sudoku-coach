/**
 * The privacy policy and the terms, at the addresses other people hold.
 *
 * These two URLs are typed into Google's OAuth consent screen, which means
 * they are load-bearing in a way no in-app screen is: they are followed cold,
 * by someone who has never opened this app, from a page this app does not
 * control. A deep link that 404s here is not a broken button — it is a broken
 * promise to a third party, and the hosting rewrite that makes it work has
 * already regressed once.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  { path: '/privacy', heading: 'Privacy' },
  { path: '/terms', heading: 'Terms' },
] as const;

for (const { path, heading } of PAGES) {
  test(`${path} loads cold, at its own address`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test(`${path} is accessible`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('names the Drive permission it is the disclosure for', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByText('drive.appdata')).toBeVisible();
});

test('is reachable from the landing page, without a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();

  // Back belongs to the browser here, not to a button inside the page.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});
