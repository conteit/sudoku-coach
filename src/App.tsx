/**
 * The app shell: two screens, one profile, one store.
 *
 * There is no router. The app has a library and a board, and which one is
 * showing is a fact the store already knows — `activeGameId`. A URL for the
 * board would be a URL that only means something on the device that holds the
 * game, so the back gesture is a control, not an address.
 *
 * Hydration order matters and is the reason this file owns it: the profile
 * carries the locale and the theme, so it is read before anything renders,
 * and the game store then resumes the game the player left (R5).
 */

import { useEffect, useState } from 'react';
import { preferredLocale } from './i18n/locale';
import { LocaleProvider } from './i18n/react';
import { useAccount } from './state/account';
import { useProfile } from './state/profile';
import { useGameStore } from './state/store';
import { useSync } from './sync/store';
import { parseGrid } from './engine/board';
import type {
  CellIndex,
  Difficulty,
  Digit,
  GeneratedPuzzle,
  TechniqueId,
} from './engine/types';
import { GameView } from './app/GameView';
import { LandingView } from './app/LandingView';
import { LearnView } from './app/LearnView';
import { LegalView } from './app/LegalView';
import { LibraryView } from './app/LibraryView';
import { useRoute } from './app/useRoute';
import { NewGameSheet } from './app/NewGameSheet';
import { OfflineNotice } from './app/OfflineNotice';
import { SettingsSheet } from './app/SettingsSheet';

export default function App() {
  const profile = useProfile((state) => state.profile);
  const profileReady = useProfile((state) => state.hydrated);
  const setLocale = useProfile((state) => state.setLocale);
  const setSettings = useProfile((state) => state.setSettings);

  const gamesReady = useGameStore((state) => state.hydrated);
  const summaries = useGameStore((state) => state.summaries);
  const activeGameId = useGameStore((state) => state.activeGameId);
  const games = useGameStore((state) => state.games);
  const activeGame = activeGameId === null ? null : (games[activeGameId] ?? null);

  const { route, go } = useRoute();
  const [showNewGame, setShowNewGame] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  /** null = Learn is closed; a technique = opened straight onto that lesson. */
  const [learning, setLearning] = useState<{ technique: TechniqueId | null } | null>(null);

  useEffect(() => {
    void useProfile.getState().hydrate(preferredLocale());
    void useGameStore.getState().hydrate();
    // Restores an existing session if there is one. A no-op in a build with
    // no Firebase config, which is what keeps sign-in genuinely optional
    // rather than merely unused.
    useAccount.getState().watch();
    // Reads the stored switch and, if sync is on, runs one straight away. It
    // resolves on its own schedule: nothing on screen waits for the network.
    void useSync.getState().hydrate();
  }, []);

  // Sync follows the session rather than the other way round. Signing out
  // drops the token but keeps the preference — it ends a session, it is not a
  // decision to stop syncing — and signing in is the moment the other
  // device's games become worth asking for.
  useEffect(
    () =>
      useAccount.subscribe((state, previous) => {
        if (state.account === previous.account) return;
        if (state.account === null) useSync.getState().forget();
        else void useSync.getState().syncNow();
      }),
    [],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Flush first, then sync. The autosave debounce means the last few
        // seconds of play are still in memory at this point, and a sync that
        // ran before the write would upload the board as it was, then record
        // that timestamp as synced — losing those moves until the next change.
        void useGameStore
          .getState()
          .flush()
          .then(() => useSync.getState().syncNow());
      } else {
        // Back from another device, possibly. Cheap when nothing moved: the
        // manifest is one small read and an unchanged plan does nothing.
        void useSync.getState().syncNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // An explicit `data-theme` beats the OS preference; "system" is its absence,
  // which is what lets the media query in index.css do the work (R9 dark mode).
  useEffect(() => {
    const root = document.documentElement;
    if (profile.settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = profile.settings.theme;
  }, [profile.settings.theme]);

  useEffect(() => {
    document.documentElement.lang = profile.locale;
  }, [profile.locale]);

  const startGame = (puzzle: {
    givens: string;
    solution: string;
    difficulty: Difficulty;
  }): void => {
    setShowNewGame(false);
    void useGameStore.getState().startGame(puzzle);
  };

  const exitGame = (): void => {
    void useGameStore.getState().closeGame();
  };

  /**
   * Into the app, carrying the landing board if the visitor started one.
   *
   * The taster's placements are replayed as real moves rather than written
   * into the new game's cells: they are the player's moves, and a board whose
   * first four digits cannot be undone would be lying about where they came
   * from.
   */
  const startFromLanding = (
    taster: { puzzle: GeneratedPuzzle; entries: readonly (Digit | null)[] } | null,
  ): void => {
    go('play');
    if (taster === null) return;
    const givens = parseGrid(taster.puzzle.givens);
    void useGameStore
      .getState()
      .startGame(taster.puzzle)
      .then(() => {
        const dispatch = useGameStore.getState().dispatch;
        taster.entries.forEach((value, cell) => {
          if (value === null || givens[cell] !== null) return;
          dispatch({ type: 'setValue', cell: cell as CellIndex, digit: value });
        });
      });
  };

  return (
    <LocaleProvider locale={profile.locale}>
      {/* Nothing renders before the profile is read: a first paint in the wrong
          language or the wrong theme is worse than one frame of nothing. */}
      {!profileReady || !gamesReady ? (
        <div className="min-h-dvh" aria-busy="true" />
      ) : route === 'privacy' || route === 'terms' ? (
        // Reachable from outside the app, and rendered from the address
        // alone: Google's OAuth consent screen links straight here, and so
        // does anyone deciding whether to sign in at all.
        <LegalView id={route} locale={profile.locale} onNavigate={go} />
      ) : route === 'landing' ? (
        // The front door. It reads no game state and writes none — a visitor
        // who has never played sees the same page as one with four saved
        // puzzles, and "Start" is what moves them.
        <LandingView onStart={startFromLanding} onNavigate={go} />
      ) : learning !== null ? (
        <LearnView
          profile={profile}
          technique={learning.technique}
          onClose={() => setLearning(null)}
        />
      ) : activeGame !== null ? (
        <GameView
          game={activeGame}
          settings={profile.settings}
          locale={profile.locale}
          onExit={exitGame}
          onOpenSettings={() => setShowSettings(true)}
          onNewGame={() => {
            exitGame();
            setShowNewGame(true);
          }}
          onLearn={(technique) => setLearning({ technique: technique ?? null })}
        />
      ) : (
        <LibraryView
          summaries={summaries}
          onResume={(id) => void useGameStore.getState().openGame(id)}
          onNewGame={() => setShowNewGame(true)}
          onOpenSettings={() => setShowSettings(true)}
          onLearn={() => setLearning({ technique: null })}
        />
      )}

      <NewGameSheet
        open={showNewGame}
        onClose={() => setShowNewGame(false)}
        onStart={startGame}
        profile={profile}
      />

      {/* Only at rest. It is a fixed overlay, and on a phone anywhere it can
          sit covers either the board or the controls; the library is where the
          player is when the precache finishes anyway. */}
      {activeGame === null ? <OfflineNotice /> : null}

      <SettingsSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        profile={profile}
        onLocale={setLocale}
        onSettings={setSettings}
      />
    </LocaleProvider>
  );
}
