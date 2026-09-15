import { describe, expect, it } from 'vitest';
import {
  buildStamp,
  momentOf,
  pullRequestFrom,
  shaFrom,
  STAMP_PATTERN,
  UNKNOWN_SHA,
} from './buildStamp';

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

describe('the pull request a preview came from', () => {
  it('takes the number Vercel hands over', () => {
    expect(pullRequestFrom({ pullRequestId: '150' })).toBe('150');
  });

  it('digs it out of the ref, which is all Actions says', () => {
    expect(pullRequestFrom({ ref: 'refs/pull/150/merge' })).toBe('150');
  });

  it('is absent on production, where neither source names one', () => {
    // Vercel sets the variable to an empty string off a PR rather than
    // leaving it unset, so "present" is not the same question as "a number".
    expect(pullRequestFrom({ pullRequestId: '', ref: 'refs/heads/main' })).toBeUndefined();
    expect(pullRequestFrom({})).toBeUndefined();
  });

  it('refuses anything that is not digits, rather than putting junk in the stamp', () => {
    // Both sources are environment strings. A stamp carrying nonsense is worse
    // than one carrying nothing, because it still looks authoritative.
    expect(pullRequestFrom({ pullRequestId: 'true' })).toBeUndefined();
    expect(pullRequestFrom({ pullRequestId: '150; rm' })).toBeUndefined();
    expect(pullRequestFrom({ ref: 'refs/heads/pull/150/merge' })).toBeUndefined();
  });
});

describe('the whole stamp', () => {
  it('reads the way Paolo wrote it', () => {
    expect(buildStamp(new Date('2026-09-15T21:12:00Z'), { vercelSha: 'cb174ef9999' })).toBe(
      '20260915-21-cb174ef',
    );
  });

  it('names the pull request a preview was built from', () => {
    expect(
      buildStamp(new Date('2026-09-15T21:12:00Z'), {
        vercelSha: 'cb174ef9999',
        pullRequestId: '150',
      }),
    ).toBe('20260915-21.150-cb174ef');
  });

  it('says nothing about a PR when there was none, so a release stays short', () => {
    expect(
      buildStamp(new Date('2026-09-15T21:12:00Z'), { vercelSha: 'cb174ef', pullRequestId: '' }),
    ).toBe('20260915-21-cb174ef');
  });

  it('still sorts by moment first, with the PR number along for the ride', () => {
    const earlier = buildStamp(new Date('2026-09-15T08:00:00Z'), {
      gitSha: 'aaaaaaa',
      pullRequestId: '999',
    });
    const later = buildStamp(new Date('2026-09-15T21:00:00Z'), {
      gitSha: 'bbbbbbb',
      pullRequestId: '2',
    });
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('matches the pattern the tests downstream lean on', () => {
    expect(buildStamp(new Date('2026-09-15T21:00:00Z'), { gitSha: 'abc1234' })).toMatch(
      STAMP_PATTERN,
    );
    expect(buildStamp(new Date('2026-09-15T21:00:00Z'), {})).toMatch(STAMP_PATTERN);
    expect(
      buildStamp(new Date('2026-09-15T21:00:00Z'), { gitSha: 'abc1234', pullRequestId: '150' }),
    ).toMatch(STAMP_PATTERN);
    expect('not-a-stamp').not.toMatch(STAMP_PATTERN);
    expect('20260915-21.-abc1234').not.toMatch(STAMP_PATTERN);
  });
});
