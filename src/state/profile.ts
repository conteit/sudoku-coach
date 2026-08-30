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
import { db, loadProfile, saveProfile, type SudokuCoachDB } from './db';
import { DEFAULT_PROFILE } from './mastery';
import type { Locale, PlayerProfile } from './types';

export interface ProfileDeps {
  conn: SudokuCoachDB;
}

export interface ProfileStore {
  profile: PlayerProfile;
  hydrated: boolean;
  /** Reads the stored profile, or keeps the defaults when there is none yet. */
  hydrate: () => Promise<void>;
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

      hydrate: async () => {
        set({ profile: await loadProfile(deps.conn), hydrated: true });
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
