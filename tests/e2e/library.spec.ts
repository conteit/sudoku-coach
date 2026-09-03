/**
 * The library is the resting screen, so its one layout question is: does the
 * width that buys a second pane actually spend it? Below laptop the games
 * list is the whole screen, signed off as-is; at laptop and above a progress
 * pane appears beside it. One test, both directions — the phone/tablet half
 * is the regression guard that the wide layout gained a pane rather than
 * just moving one that was already there.
 */

import { expect, test } from '@playwright/test';

test('shows progress beside the games once there is room', async ({ page }, testInfo) => {
  const wide = ['laptop', 'wide'].includes(testInfo.project.name);
  await page.goto('/play');

  const progress = page.getByRole('complementary', { name: 'Your progress' });
  if (wide) {
    await expect(progress).toBeVisible();
  } else {
    await expect(progress).toHaveCount(0);
  }
});
