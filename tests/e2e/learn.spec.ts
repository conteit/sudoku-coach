/**
 * Learn is where the app explains itself, so the assertions are about the two
 * things that would make it worthless: content that does not actually render,
 * and a route into it from the one place a player is most likely to want it —
 * a hint that has just named a technique.
 */

import { expect, test } from '@playwright/test';

test('reads the rules, the ladder and a technique lesson', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn' }).click();

  await expect(page.getByRole('heading', { name: 'How sudoku works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /What the coach will and will not say/ })).toBeVisible();

  // Every technique the engine can find has a page, listed with its one-liner.
  const techniques = page.getByRole('listitem');
  await expect(techniques).toHaveCount(14);

  await page.getByRole('button', { name: /Hidden pair/ }).click();
  await expect(page.getByRole('heading', { name: 'Hidden pair', level: 1 })).toBeVisible();
  await expect(page.getByText('What it is')).toBeVisible();
  await expect(page.getByText('Why it works')).toBeVisible();

  // The worked example is a real board rendered from the lesson's own grid.
  await expect(page.getByRole('grid', { name: 'Hidden pair' })).toBeVisible();
  await expect(page.locator('[data-spotlight]')).toHaveCount(2);
});

test('a named technique links from the coach panel to its lesson', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New puzzle' }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 60_000 });

  const coach = page.getByRole('region', { name: 'Coach' });
  await coach.getByRole('button', { name: 'Where should I look?' }).click();

  // Level 1 names nothing, so there is nothing to link to yet (R7).
  await expect(coach.getByRole('button', { name: 'What is this technique?' })).toHaveCount(0);

  await coach.getByRole('button', { name: /Name the technique/ }).click();
  await coach.getByRole('button', { name: 'What is this technique?' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Why it works')).toBeVisible();
});

test('offers a puzzle chosen for the technique at the edge of mastery', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New puzzle' }).click();

  // A fresh player has met nothing, so the edge is the first technique in the
  // catalog, practised on the gentlest grid that can need it.
  await expect(page.getByText(/Naked single, at easy level/)).toBeVisible();

  await page.getByRole('button', { name: 'Let the coach choose' }).click();
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Easy')).toBeVisible();
});
