// Must come first: Dexie captures the global `indexedDB` when it is imported.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, readProfile, saveProfile, SudokuCoachDB } from './db';
import { DEFAULT_PROFILE, onTaught } from './mastery';
import { createProfileStore, type ProfileStoreApi } from './profile';
import type { PlayerProfile } from './types';

let counter = 0;
let conn: SudokuCoachDB;
let store: ProfileStoreApi;

beforeEach(() => {
  conn = new SudokuCoachDB(`${DB_NAME}-profile-${counter++}`);
  store = createProfileStore({ conn });
});

afterEach(async () => {
  await conn.delete();
});

describe('hydration', () => {
  it('takes the stored profile over anything the browser asks for', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, locale: 'en' }, conn);

    await store.getState().hydrate('it');

    expect(store.getState().profile.locale).toBe('en');
    expect(store.getState().hydrated).toBe(true);
  });

  it('opens a first run in the language the browser asked for', async () => {
    await store.getState().hydrate('en');

    expect(store.getState().profile.locale).toBe('en');
  });

  it('falls back to the default when the browser speaks neither language', async () => {
    await store.getState().hydrate(undefined);

    expect(store.getState().profile).toEqual(DEFAULT_PROFILE);
  });

  it('writes nothing on a first run — a guess is not a choice', async () => {
    await store.getState().hydrate('en');
    await store.getState().flush();

    expect(await readProfile(conn)).toBeUndefined();
  });

  it('backfills a settings field a stored profile predates, without disturbing the rest', async () => {
    // Shaped the way a profile saved before `highlightMatchingNotes` existed
    // would actually be on disk: the key is simply absent, not `undefined`.
    const legacy = {
      ...DEFAULT_PROFILE,
      settings: {
        highlightConflicts: false,
        theme: 'dark',
        haptics: false,
      },
    } as PlayerProfile;
    await saveProfile(legacy, conn);

    await store.getState().hydrate();

    expect(store.getState().profile.settings).toEqual({
      highlightConflicts: false,
      theme: 'dark',
      haptics: false,
      highlightMatchingNotes: DEFAULT_PROFILE.settings.highlightMatchingNotes,
    });
  });
});

describe('updates', () => {
  it('persists a language the player chose', async () => {
    await store.getState().hydrate('en');
    store.getState().setLocale('it');
    await store.getState().flush();

    expect(store.getState().profile.locale).toBe('it');
    expect((await readProfile(conn))?.locale).toBe('it');
  });

  it('patches one setting without disturbing the others', async () => {
    await store.getState().hydrate();
    store.getState().setSettings({ highlightConflicts: false });
    await store.getState().flush();

    const stored = await readProfile(conn);
    expect(stored?.settings.highlightConflicts).toBe(false);
    expect(stored?.settings.haptics).toBe(DEFAULT_PROFILE.settings.haptics);
    expect(stored?.settings.theme).toBe(DEFAULT_PROFILE.settings.theme);
  });

  it('carries mastery transitions through to storage', async () => {
    await store.getState().hydrate();
    store.getState().update((profile) => onTaught(profile, 'naked_single', 5000));
    await store.getState().flush();

    expect((await readProfile(conn))?.mastery.naked_single?.stage).toBe('taught');
  });

  it('ignores a transition that changed nothing, and writes nothing for it', async () => {
    await store.getState().hydrate();
    const before = store.getState().profile;

    store.getState().update((profile) => profile);
    await store.getState().flush();

    expect(store.getState().profile).toBe(before);
    expect(await readProfile(conn)).toBeUndefined();
  });

  it('lands two rapid writes in the order they were made', async () => {
    await store.getState().hydrate();
    store.getState().setLocale('en');
    store.getState().setLocale('it');
    await store.getState().flush();

    expect((await readProfile(conn))?.locale).toBe('it');
  });
});
