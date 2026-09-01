/**
 * The player profile store: locale, settings and per-technique mastery.
 *
 * Kept apart from the game store because its lifetime is different. A game is
 * opened, played and evicted; the profile is a singleton that every screen
 * reads and that any screen may write — a settings toggle, a language switch,
 * or the coach crediting a technique the player just applied.
 *
 * Writes are write-through rather than debounced. The profile changes a few
 * times a session, not a few times a second, and losing a language switch to a
 * crash would be worse than the cost of an IndexedDB put. They are serialized
 * through one promise chain so two rapid updates can never land out of order
 * and leave the older one on disk.
 */

import { create, createStore, type StateCreator, type StoreApi } from 'zustand';
import { db, readProfile, saveProfile, type SudokuCoachDB } from './db';
import { DEFAULT_PROFILE } from './mastery';
import type { Locale, PlayerProfile } from './types';

export interface ProfileDeps {
  conn: SudokuCoachDB;
}

export interface ProfileStore {
  profile: PlayerProfile;
  hydrated: boolean;
  /**
   * Reads the stored profile. On a first run there is none, and `preferred` —
   * whatever the browser asks for — decides the language instead of the
   * built-in default.
   */
  hydrate: (preferred?: Locale) => Promise<void>;
  /** Applies a pure transition and persists the result. */
  update: (change: (profile: PlayerProfile) => PlayerProfile) => void;
  setLocale: (locale: Locale) => void;
  setSettings: (patch: Partial<PlayerProfile['settings']>) => void;
  /** Resolves once every queued write has landed. Tests and page-hide use it. */
  flush: () => Promise<void>;
}

export type ProfileStoreApi = StoreApi<ProfileStore>;

function profileStore(deps: ProfileDeps): StateCreator<ProfileStore> {
  return (set, get) => {
    let queue: Promise<unknown> = Promise.resolve();

    const persist = (profile: PlayerProfile): void => {
      queue = queue.then(() => saveProfile(profile, deps.conn));
    };

    return {
      profile: DEFAULT_PROFILE,
      hydrated: false,

      hydrate: async (preferred) => {
        const stored = await readProfile(deps.conn);
        // A first run is not persisted here: nothing has been chosen yet, and
        // writing the guess would turn it into a choice.
        if (stored === undefined) {
          set({
            profile: preferred === undefined ? DEFAULT_PROFILE : { ...DEFAULT_PROFILE, locale: preferred },
            hydrated: true,
          });
          return;
        }
        // A profile saved before a settings field existed does not have it on
        // disk — `settings` predates structural sharing of individual keys,
        // so a stored object is whatever shape it was written in. Filling
        // gaps from `DEFAULT_PROFILE` here, once, means every new setting
        // gets its documented default for existing players without a
        // migration step, and every reader downstream can keep treating
        // `settings` as fully populated.
        set({
          profile: { ...stored, settings: { ...DEFAULT_PROFILE.settings, ...stored.settings } },
          hydrated: true,
        });
      },

      update: (change) => {
        const next = change(get().profile);
        if (next === get().profile) return;
        set({ profile: next });
        persist(next);
      },

      setLocale: (locale) => {
        get().update((profile) => (profile.locale === locale ? profile : { ...profile, locale }));
      },

      setSettings: (patch) => {
        get().update((profile) => ({ ...profile, settings: { ...profile.settings, ...patch } }));
      },

      flush: async () => {
        await queue;
      },
    };
  };
}

/** A store wired to explicit dependencies. Tests use this; the app uses `useProfile`. */
export const createProfileStore = (deps: Partial<ProfileDeps> = {}): ProfileStoreApi =>
  createStore<ProfileStore>(profileStore({ conn: db, ...deps }));

export const useProfile = create<ProfileStore>()(profileStore({ conn: db }));
