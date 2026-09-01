/**
 * Shared by every spec that has to reach the coach.
 *
 * Below `sm` (639.98px — GameView's own `MOBILE_QUERY`) the panel rests
 * behind a header button and only renders once the sheet is opened; at and
 * above it, the panel is the static bar and was never hidden in the first
 * place. The viewport width is what decides which of those is true here, not
 * a live read of the trigger's current visibility: a `getByRole('button',
 * ...).isVisible()` probe races React's own commit of `sheetOpen` — ask
 * whether the button that just opened the sheet is still there, and
 * sometimes the DOM answers from a half-committed render. Width is settled
 * before the test ever starts.
 */
import { expect, type Page } from '@playwright/test';

const MOBILE_BREAKPOINT_PX = 640;

/** Opens the coach where it rests behind the header's trigger, and reads it either way. */
export async function openCoach(page: Page) {
  const width = page.viewportSize()?.width ?? MOBILE_BREAKPOINT_PX;
  if (width < MOBILE_BREAKPOINT_PX) {
    await page.getByRole('button', { name: /^Coach/ }).click();
  }
  const region = page.getByRole('region', { name: 'Coach' });
  // The panel stays mounted but CSS-hidden while resting, so the role query
  // above can resolve to zero elements instead of throwing — a negative
  // assertion made against that empty locator would pass for the wrong
  // reason. Requiring it visible here turns a silently no-op open into an
  // honest failure at the point it happened, not three assertions later.
  await expect(region).toBeVisible();
  return region;
}
