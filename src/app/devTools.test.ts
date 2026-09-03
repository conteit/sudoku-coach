/**
 * The allowlist. Small, and worth its own tests because every mistake it
 * could make is a mistake about *who* rather than about what.
 */

import { describe, expect, it } from 'vitest';
import { isDevUser, parseAllowlist } from './devTools';

const account = { uid: 'UID-1', email: 'Someone@Example.com', displayName: null };

describe('parseAllowlist', () => {
  it('reads a comma-separated list, forgiving the spacing a human leaves', () => {
    expect(parseAllowlist('abc, def@example.com ,, ghi ')).toEqual([
      'abc',
      'def@example.com',
      'ghi',
    ]);
  });

  it('treats an unset or empty variable as an empty list', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist('   ')).toEqual([]);
  });
});

describe('isDevUser', () => {
  it('matches a UID', () => {
    expect(isDevUser(account, ['uid-1'])).toBe(true);
  });

  it('matches an email whatever its case, since nobody types their own carefully', () => {
    expect(isDevUser(account, ['someone@example.com'])).toBe(true);
  });

  it('says no to someone not on the list', () => {
    expect(isDevUser(account, ['somebody-else'])).toBe(false);
  });

  it('says no to a signed-out visitor', () => {
    expect(isDevUser(null, ['uid-1'])).toBe(false);
  });

  it('reads an empty list as nobody, not everybody', () => {
    // The reading that matters when a variable goes missing from a deploy:
    // the failure mode of the other reading is every visitor getting the
    // developer menu.
    expect(isDevUser(account, [])).toBe(false);
    expect(isDevUser(null, [])).toBe(false);
  });
});
