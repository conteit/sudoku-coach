/**
 * Shared by every spec that queries the interactive board mid-game.
 *
 * Scoped to `main`: a worked example — `LearnView`'s technique page, or the
 * desktop tier's lesson column once a drill or a level-2+ disclosure names a
 * technique — renders its illustration with the same `SudokuGrid`/`Cell`
 * markup as the real board (`role="grid"`, `data-cell`). An unscoped query
 * once a technique has been named would return both boards: 162 cells
 * instead of 81, or two grids instead of one. Within the game screen the
 * interactive board is the only grid inside `<main>` — the lesson column's
 * worked example sits outside it, in `GameLayout`'s aside.
 *
 * That scoping is the game screen's alone. Learn's lesson pane is itself a
 * `<main>` from the laptop tier up, so a worked example there *is* inside a
 * `main`; every caller below is on the game screen, and the two screens are
 * mutually exclusive, so nothing here is ambiguous today. A spec that opens
 * Learn and reaches for `boardGrid` would match the illustration.
 */
import type { Page } from '@playwright/test';

/** The interactive board's cell at `index`, never a read-only worked example. */
export const boardCell = (page: Page, index: number) => page.locator(`main [data-cell="${index}"]`);

/** Same scoping, for the grid itself rather than one of its cells. */
export const boardGrid = (page: Page) => page.locator('main').getByRole('grid');
