/**
 * The hosting config, checked for the one interaction that broke it.
 *
 * `/play` returned 404 in production while every local server served it
 * happily: `cleanUrls: true` makes Vercel answer `/index.html` with a 308 to
 * `/`, so an SPA rewrite pointing *at* `/index.html` resolves to a redirect
 * and the rewrite fails. Nothing in the app could see this — Playwright's
 * preview server does SPA fallback natively, so the e2e that loads `/play`
 * cold passed against a server that does not behave like the host.
 *
 * This is the cheap half of the fix: the rewrite has to survive `cleanUrls`.
 * The expensive half is checking the deployed URL, which no unit test can do.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolved from the working directory rather than `import.meta.url`: the
// suite runs in jsdom, where `import.meta.url` is an http URL and `readFile`
// wants a path.
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  cleanUrls?: boolean;
  rewrites?: { source: string; destination: string }[];
  headers?: { source: string; headers: { key: string; value: string }[] }[];
};

describe('the SPA rewrite', () => {
  it('exists, because two routes only work if unknown paths reach the app', () => {
    const spa = config.rewrites?.find((rule) => rule.source === '/(.*)');
    expect(spa, 'every path must fall through to the app shell').toBeDefined();
  });

  it('does not point at a path that cleanUrls redirects', () => {
    // The actual bug: `/index.html` is a 308 to `/` under `cleanUrls`, and a
    // rewrite whose destination redirects does not resolve.
    const spa = config.rewrites?.find((rule) => rule.source === '/(.*)');
    if (config.cleanUrls === true) {
      expect(spa?.destination.endsWith('.html'), 'cleanUrls turns /x.html into a redirect').toBe(
        false,
      );
    }
  });
});

describe('the security headers', () => {
  const csp = config.headers
    ?.find((rule) => rule.source === '/(.*)')
    ?.headers.find((header) => header.key === 'Content-Security-Policy')?.value;

  it('never allows inline scripts', () => {
    // The line that does not move. If the sign-in flow ever demands it, the
    // answer is the redirect flow, not this.
    expect(csp).toBeDefined();
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp?.match(/script-src[^;]*/)?.[0]).not.toContain('unsafe-inline');
  });

  it('keeps the popup able to talk back to the page that opened it', () => {
    const coop = config.headers
      ?.find((rule) => rule.source === '/(.*)')
      ?.headers.find((header) => header.key === 'Cross-Origin-Opener-Policy')?.value;
    // `same-origin` silently breaks Google sign-in; this is the one value
    // that both isolates the page and permits the flow.
    expect(coop).toBe('same-origin-allow-popups');
  });
});
