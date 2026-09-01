import { defineConfig, devices } from '@playwright/test';

// The app is static and offline-first: e2e runs against the real production
// build so the service worker and precache manifest are exercised too.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  // One project per layout tier `useViewportTier` recognises — phone below
  // sm, tablet at sm and above (640–1023.98), laptop at lg, desktop — three
  // columns — at 2xl. `laptop` keeps Playwright's stock Desktop Chrome
  // viewport (1280×720) — it is genuinely the laptop tier, not the desktop
  // one the old project name claimed.
  //
  // `wide` sits exactly on 1536, the first width at which the desktop tier
  // exists at all, because that is where its arithmetic is tightest: the
  // three columns plus their gaps and the row's padding need 640 + 352 + 416
  // + 48 + 48 = 1504, leaving 32px. A wider viewport tests a layout with
  // slack to spare and would pass over the one width that cannot afford any.
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
    { name: 'wide', use: { ...devices['Desktop Chrome'], viewport: { width: 1536, height: 1050 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
