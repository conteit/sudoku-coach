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
import { LocaleProvider } from './i18n/react';
import { useProfile } from './state/profile';
import { useGameStore } from './state/store';
import type { Difficulty } from './engine/types';
import { GameView } from './app/GameView';
import { LibraryView } from './app/LibraryView';
import { NewGameSheet } from './app/NewGameSheet';
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

  const [showNewGame, setShowNewGame] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void useProfile.getState().hydrate();
    void useGameStore.getState().hydrate();
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

  return (
    <LocaleProvider locale={profile.locale}>
      {/* Nothing renders before the profile is read: a first paint in the wrong
          language or the wrong theme is worse than one frame of nothing. */}
      {!profileReady || !gamesReady ? (
        <div className="min-h-dvh" aria-busy="true" />
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
        />
      ) : (
        <LibraryView
          summaries={summaries}
          onResume={(id) => void useGameStore.getState().openGame(id)}
          onNewGame={() => setShowNewGame(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      <NewGameSheet
        open={showNewGame}
        onClose={() => setShowNewGame(false)}
        onStart={startGame}
      />

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
