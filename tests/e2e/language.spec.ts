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
import { openCoach } from './coach';
import { boardGrid } from './board';

test('switches language, and keeps it across a restart', async ({ page }) => {
  await page.goto('/play');
  await page.getByRole('button', { name: 'Settings' }).click();
  // Language sits under General since Settings grew tabs; the tab strip is
  // itself localised, so this is the last press that can name an English one.
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByRole('button', { name: 'Italiano' }).click();

  // The strip retitles itself along with everything else.
  await expect(page.getByRole('tab', { name: 'Generale' })).toBeVisible();

  // The sheet retitles itself under the player's hand.
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: 'Nuova griglia' })).toBeVisible();
  await expect(page.getByText('Scrivania sgombra')).toBeVisible();

  await page.getByRole('button', { name: 'Nuova griglia' }).click();
  await page.getByRole('button', { name: 'Facile', exact: true }).click();
  await expect(boardGrid(page)).toBeVisible({ timeout: 60_000 });

  // Chrome, keypad and coach all speak it, not just the parts with a lesson.
  await expect(page.getByRole('button', { name: 'Questa griglia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annulla mossa' })).toBeVisible();

  const coach = await openCoach(page);
  await coach.getByRole('button', { name: 'Dove devo guardare?' }).click();
  await expect(coach.getByLabel('Livello di rivelazione 1 su 4')).toBeVisible();

  // A choice is a choice: it survives the app being killed and reopened.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Questa griglia' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
});
