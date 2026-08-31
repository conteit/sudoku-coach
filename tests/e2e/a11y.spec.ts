/**
 * Accessibility, on the screens Lighthouse never sees.
 *
 * The Lighthouse job scores the library screen, because that is what a cold
 * load renders. The board is where the app actually is — 81 grid cells, a
 * keypad, and a coach panel that rewrites itself as the ladder is climbed — and
 * none of it existed when a Lighthouse run finished. axe runs against the real
 * thing, in the state the player is in.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** WCAG 2 A and AA, which is the bar this app has been drawn to. */
const audit = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

test('the library screen is clean', async ({ page }) => {
  await page.goto('/');
  const results = await audit(page).analyze();
  expect(results.violations).toEqual([]);
});

test('Learn is clean, list and lesson', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn' }).click();
  expect((await audit(page).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: /Hidden pair/ }).click();
  expect((await audit(page).analyze()).violations).toEqual([]);
});

test('the board is clean, with a hint open and notes flagged', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New puzzle' }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 60_000 });

  expect((await audit(page).analyze()).violations).toEqual([]);

  // The coach at its loudest: a spotlight, tinted houses, and an issue list.
  const coach = page.getByRole('region', { name: 'Coach' });
  await coach.getByRole('button', { name: 'Where should I look?' }).click();
  await coach.getByRole('button', { name: /Name the technique/ }).click();
  await coach.getByRole('button', { name: /Show me the cells/ }).click();
  await coach.getByRole('button', { name: 'Check my notes' }).click();

  expect((await audit(page).analyze()).violations).toEqual([]);
});

test('a dialog traps nothing it should not', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New puzzle' }).click();
  expect((await audit(page).analyze()).violations).toEqual([]);
});
