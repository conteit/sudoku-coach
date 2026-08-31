/**
 * The Italian build, played rather than inspected.
 *
 * The dictionary tests prove every key exists in both locales, and the
 * component tests prove a component reads the one it is given. Neither proves
 * that the app the player installs actually switches — the language lives in
 * the profile, which is read from IndexedDB, handed to a context, and used by
 * every screen. This walks that path in the real build.
 */

import { expect, test } from '@playwright/test';

test('switches language, and keeps it across a restart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Italiano' }).click();

  // The sheet retitles itself under the player's hand.
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: 'Nuova griglia' })).toBeVisible();
  await expect(page.getByText('Scrivania sgombra')).toBeVisible();

  await page.getByRole('button', { name: 'Nuova griglia' }).click();
  await page.getByRole('button', { name: 'Facile', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 60_000 });

  // Chrome, keypad and coach all speak it, not just the parts with a lesson.
  await expect(page.getByRole('button', { name: 'Compila tutte le annotazioni' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annulla mossa' })).toBeVisible();

  const coach = page.getByRole('region', { name: 'Coach' });
  await coach.getByRole('button', { name: 'Dove devo guardare?' }).click();
  await expect(coach.getByLabel('Livello di rivelazione 1 su 4')).toBeVisible();

  // A choice is a choice: it survives the app being killed and reopened.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Compila tutte le annotazioni' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
});
