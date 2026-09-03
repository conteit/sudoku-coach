/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // The app must be fully playable offline (R9); everything it needs is
      // static, so precache the whole build rather than runtime-caching.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,json}'],
        // unicode-range means the browser only ever fetches the latin cuts;
        // precaching the rest would triple the offline payload for nothing.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
      manifest: {
        name: 'Sudoku Coach',
        short_name: 'Coach',
        description: 'A sudoku that teaches you to solve it — never solves it for you.',
        theme_color: '#1b1917',
        background_color: '#faf7f2',
        display: 'standalone',
        orientation: 'portrait',
        // The installed app opens the app, not the front door: someone who
        // has added this to their home screen has already been sold. `scope`
        // stays '/' so the landing page is still inside the service worker's
        // reach and still installable from there.
        start_url: '/play',
        scope: '/',
        categories: ['games', 'education', 'puzzle'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: { target: 'es2022' },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/state/**', 'src/coach/**'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
