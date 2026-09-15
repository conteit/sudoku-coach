import { describe, expect, it } from 'vitest';
import { buildStamp, momentOf, shaFrom, STAMP_PATTERN, UNKNOWN_SHA } from './buildStamp';

describe('the moment half of a build stamp', () => {
  it('is UTC, whatever the machine thinks the time is', () => {
    // 23:30 UTC is already the next day in most of Europe. A local-time stamp
    // would put this build on the 16th, out of order with a Vercel build made
    // minutes later — and ordering is the one thing this format has that a
    // bare sha does not.
    expect(momentOf(new Date('2026-09-15T23:30:00Z'))).toBe('20260915-23');
  });

  it('pads month, day and hour, so the string always sorts', () => {
    expect(momentOf(new Date('2026-01-02T03:04:05Z'))).toBe('20260102-03');
  });

  it('orders two builds the way the clock does', () => {
    const earlier = momentOf(new Date('2026-09-14T08:00:00Z'));
    const later = momentOf(new Date('2026-09-15T21:00:00Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe('the sha half', () => {
  it('prefers Vercel, which is the build a bug report will be about', () => {
    expect(
      shaFrom({ vercelSha: 'cb174ef0123456', githubSha: 'aaaaaaa', gitSha: 'bbbbbbb' }),
    ).toBe('cb174ef');
  });

  it('falls back to Actions, then to git', () => {
    expect(shaFrom({ githubSha: 'aaaaaaa1234', gitSha: 'bbbbbbb' })).toBe('aaaaaaa');
    expect(shaFrom({ gitSha: 'bbbbbbb1234' })).toBe('bbbbbbb');
  });

  it('says "dev" rather than inventing one', () => {
    // A stamp exists to be looked up. One that cannot name its commit has to
    // admit that, or it sends someone hunting for a sha that never existed.
    expect(shaFrom({})).toBe(UNKNOWN_SHA);
  });

  it('treats an empty or blank variable as absent, which is how CI sets it', () => {
    // `VERCEL_GIT_COMMIT_SHA=` is present-but-empty outside a git deployment,
    // and a truthiness check on the key alone would produce a stamp ending in
    // nothing at all.
    expect(shaFrom({ vercelSha: '', githubSha: '   ', gitSha: 'bbbbbbb' })).toBe('bbbbbbb');
  });
});

describe('the whole stamp', () => {
  it('reads the way Paolo wrote it', () => {
    expect(buildStamp(new Date('2026-09-15T21:12:00Z'), { vercelSha: 'cb174ef9999' })).toBe(
      '20260915-21-cb174ef',
    );
  });

  it('matches the pattern the tests downstream lean on', () => {
    expect(buildStamp(new Date('2026-09-15T21:00:00Z'), { gitSha: 'abc1234' })).toMatch(
      STAMP_PATTERN,
    );
    expect(buildStamp(new Date('2026-09-15T21:00:00Z'), {})).toMatch(STAMP_PATTERN);
    expect('not-a-stamp').not.toMatch(STAMP_PATTERN);
  });
});
