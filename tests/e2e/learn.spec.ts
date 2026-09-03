/**
 * Learn is where the app explains itself, so the assertions are about the two
 * things that would make it worthless: content that does not actually render,
 * and a route into it from the one place a player is most likely to want it —
 * a hint that has just named a technique.
 */

import { expect, test } from '@playwright/test';
import { openCoach } from './coach';
import { boardGrid } from './board';

test('reads the rules, the ladder and a technique lesson', async ({ page }, testInfo) => {
  await page.goto('/play');
  await page.getByRole('button', { name: 'Learn' }).click();

  await expect(page.getByRole('heading', { name: 'How sudoku works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /What the coach will and will not say/ })).toBeVisible();

  // Every technique the engine can find has a page, listed with its one-liner.
  const techniques = page.getByRole('listitem');
  await expect(techniques).toHaveCount(14);

  await page.getByRole('button', { name: /Hidden pair/ }).click();
  // At laptop and wide the lesson sits in `SplitLayout`'s right pane, beside
  // Learn's own `<h1>`, so `LessonBody` renders its title as `h2`
  // (`titleAs`) — an `h1` there would give the page two document roots.
  // Below laptop the lesson is still the whole page and the title is `h1`.
  const level = ['laptop', 'wide'].includes(testInfo.project.name) ? 2 : 1;
  await expect(page.getByRole('heading', { name: 'Hidden pair', level })).toBeVisible();
  await expect(page.getByText('What it is')).toBeVisible();
  await expect(page.getByText('Why it works')).toBeVisible();

  // The worked example is a real board rendered from the lesson's own grid.
  await expect(page.getByRole('grid', { name: 'Hidden pair' })).toBeVisible();
  await expect(page.locator('[data-spotlight]')).toHaveCount(2);
});

test('keeps the index on screen while a lesson opens beside it', async ({ page }, testInfo) => {
  test.skip(!['laptop', 'wide'].includes(testInfo.project.name), 'one column below laptop');
  await page.goto('/play');
  await page.getByRole('button', { name: 'Learn' }).click();

  const index = page.getByTestId('left-pane');
  await expect(index).toBeVisible();
  const before = (await index.boundingBox())!;

  await index.getByRole('button', { name: /naked single/i }).click();

  // `h2`, not `h1`: see the tier check above — the lesson pane's title sits
  // beneath Learn's own heading here, so `level: 1` would never resolve.
  await expect(
    page.getByTestId('right-pane').getByRole('heading', { level: 2 }).first(),
  ).toBeVisible();

  // The point of the case: choosing a lesson from the index must not move
  // the index it was chosen from.
  const after = (await index.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.x).toBeCloseTo(before.x, 1);
});

test('a named technique links from the coach panel to its lesson', async ({ page }, testInfo) => {
  await page.goto('/play');
  await page.getByRole('button', { name: 'New puzzle' }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await expect(boardGrid(page)).toBeVisible({ timeout: 60_000 });

  const coach = await openCoach(page);
  await coach.getByRole('button', { name: 'Where should I look?' }).click();

  // Level 1 names nothing, so there is nothing to link to yet (R7).
  await expect(coach.getByRole('button', { name: 'What is this technique?' })).toHaveCount(0);

  await coach.getByRole('button', { name: /Name the technique/ }).click();

  // Which technique gets named depends on the generated puzzle, not on this
  // test, so the expected name is read off the coach's own level-2 hint
  // rather than hard-coded. Every lesson's rung-2 template opens with its
  // technique's exact display name followed by "in" or "on" (naming the
  // house/digit it was found in) — checked against every entry in
  // `src/coach/lessons/en.json` before relying on it here.
  const hintText = await coach.locator('[aria-live="polite"]').innerText();
  const technique = hintText.match(/^(.+?)\s(?:in|on)\s/)?.[1];
  expect(technique, `could not read a technique name out of hint text: "${hintText}"`).toBeTruthy();

  await coach.getByRole('button', { name: 'What is this technique?' }).click();

  // Unscoped, `level: 1` would find Learn's own page heading at laptop/wide
  // ("Learn") and pass without ever looking at the lesson — the same bug
  // the tier check in the first test above exists to catch. Naming the
  // heading with the technique that was actually named rules that out:
  // "Learn" can never satisfy it.
  const level = ['laptop', 'wide'].includes(testInfo.project.name) ? 2 : 1;
  await expect(page.getByRole('heading', { name: technique!, level })).toBeVisible();
  await expect(page.getByText('Why it works')).toBeVisible();
});

test('offers a puzzle chosen for the technique at the edge of mastery', async ({ page }) => {
  await page.goto('/play');
  await page.getByRole('button', { name: 'New puzzle' }).click();

  // A fresh player has met nothing, so the edge is the first technique in the
  // catalog, practised on the gentlest grid that can need it.
  await expect(page.getByText(/Naked single, at easy level/)).toBeVisible();

  await page.getByRole('button', { name: 'Let the coach choose' }).click();
  await expect(boardGrid(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Easy')).toBeVisible();
});
