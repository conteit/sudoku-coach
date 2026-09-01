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
  // columns — at 2xl — each width chosen well inside its tier rather than on
  // the Tailwind breakpoint that separates it from its neighbours. `laptop`
  // keeps Playwright's stock Desktop Chrome viewport (1280×720) — it is
  // genuinely the laptop tier, not the desktop one the old project name
  // claimed.
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
    { name: 'wide', use: { ...devices['Desktop Chrome'], viewport: { width: 1680, height: 1050 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
