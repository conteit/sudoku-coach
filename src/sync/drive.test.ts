/**
 * The Drive client, against a fake `fetch`.
 *
 * Two of these are about correctness and the rest are about the promise the
 * privacy policy makes: every request is confined to `appDataFolder`. That
 * confinement is really enforced by the token's scope, not by this file — but
 * a request that named a different space would be the first sign that someone
 * had widened the scope to match it, so it is asserted here where it is cheap.
 */

import { describe, expect, it, vi } from 'vitest';
import { APP_DATA_FOLDER, DriveError, driveFor } from './drive';

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

const fail = (status: number): Response => ({ ok: false, status }) as Response;

describe('driveFor', () => {
  it('sends the token as a bearer, on every call', async () => {
    const doFetch = vi.fn().mockResolvedValue(ok({ files: [] }));
    await driveFor('tok', doFetch).list();

    const [, init] = doFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('asks only for the hidden app folder', async () => {
    const doFetch = vi.fn().mockResolvedValue(ok({ files: [] }));
    await driveFor('tok', doFetch).list();

    const [url] = doFetch.mock.calls[0] as [string];
    expect(url).toContain(`spaces=${APP_DATA_FOLDER}`);
  });

  it('pages, so a library larger than one page is not half-read', async () => {
    // A half-read listing looks to the planner exactly like games the remote
    // has never seen, and would re-upload the overflow on every sync.
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(ok({ files: [{ id: '1', name: 'a' }], nextPageToken: 'more' }))
      .mockResolvedValueOnce(ok({ files: [{ id: '2', name: 'b' }] }));

    const files = await driveFor('tok', doFetch).list();

    expect(files.map((file) => file.name)).toEqual(['a', 'b']);
    expect((doFetch.mock.calls[1] as [string])[0]).toContain('pageToken=more');
  });

  it('creates inside the app folder and nowhere else', async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(ok({ id: 'new', name: 'x.json' }))
      .mockResolvedValueOnce(ok({}));

    await driveFor('tok', doFetch).create('x.json', { a: 1 });

    const [, init] = doFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'x.json',
      parents: [APP_DATA_FOLDER],
    });
  });

  it('marks a dead token as such, and nothing else', async () => {
    const drive = (status: number) => driveFor('tok', vi.fn().mockResolvedValue(fail(status)));

    await expect(drive(401).list()).rejects.toMatchObject({ unauthorized: true });
    await expect(drive(403).list()).rejects.toMatchObject({ unauthorized: true });
    // A server error is not a consent problem: retrying with the same token is
    // exactly the right response, and telling the player to sign in again
    // would be a lie.
    await expect(drive(500).list()).rejects.toMatchObject({ unauthorized: false });
    await expect(drive(500).list()).rejects.toBeInstanceOf(DriveError);
  });
});
