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

import { useEffect, useRef, useState } from 'react';
import { preferredLocale } from './i18n/locale';
import { LocaleProvider } from './i18n/react';
import { useAccount } from './state/account';
import { useProfile } from './state/profile';
import { watchDatabaseBlock, type DatabaseBlock } from './state/db';
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
import { DatabaseBlockedNotice } from './app/DatabaseBlockedNotice';
import { LearnView } from './app/LearnView';
import { LegalView } from './app/LegalView';
import { LibraryView } from './app/LibraryView';
import { useRoute } from './app/useRoute';
import { NewGameSheet } from './app/NewGameSheet';
import { OfflineNotice } from './app/OfflineNotice';
import { SyncNotice } from './app/SyncNotice';
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
  /**
   * Another window holding the database open. Watched rather than derived,
   * because it is the one condition under which hydration never finishes and
   * so the usual "not ready yet" placeholder would be shown forever.
   */
  const [block, setBlock] = useState<DatabaseBlock>('none');
  /** Sync is bootstrapped once a load, on first entering the app. */
  const syncBooted = useRef(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  /** null = Learn is closed; a technique = opened straight onto that lesson. */
  const [learning, setLearning] = useState<{ technique: TechniqueId | null } | null>(null);

  useEffect(() => watchDatabaseBlock(setBlock), []);

  useEffect(() => {
    void useProfile.getState().hydrate(preferredLocale());
    void useGameStore.getState().hydrate();
    // Restores an existing session if there is one. A no-op in a build with
    // no Firebase config, which is what keeps sign-in genuinely optional
    // rather than merely unused.
  }, []);

  /**
   * Auth and sync belong to the app, not to the front door.
   *
   * They used to start with the shell, and the cost was not theoretical: a
   * restored session on the *landing page* fired a sync, a sync asked Google
   * for a token, and a token request opens a popup — so reading the front page
   * could throw a sign-in window at a visitor who had asked for nothing. It
   * also had an anonymous reader of a marketing page initialising Firebase and
   * reaching Google before they touched a control, which is not what the
   * privacy policy says the app does.
   *
   * None of it can block a page either. Everything below resolves on its own
   * schedule and reports failure as a state; the notice is how a player learns
   * sync is paused, and their games are on the device either way.
   */
  useEffect(() => {
    if (route !== 'play') return;

    // Idempotent, so returning to the app does not stack listeners.
    useAccount.getState().watch();

    // Once per load rather than once per visit to `/play`: entering the app
    // is a reasonable moment to sync, but bouncing between the landing page
    // and the board is not a reason to ask Google for a token each time.
    if (!syncBooted.current) {
      syncBooted.current = true;
      void useSync.getState().hydrate();
    }

    // Sync follows the session rather than the other way round. Signing out
    // drops the token but keeps the preference — it ends a session, it is not
    // a decision to stop syncing — and signing in is the moment the other
    // device's games become worth asking for.
    const unwatch = useAccount.subscribe((state, previous) => {
      if (state.account === previous.account) return;
      if (state.account === null) useSync.getState().forget();
      else void useSync.getState().syncNow();
    });

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
    return () => {
      unwatch();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [route]);

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
    // Before the profile is read the stored language is unknown, and the
    // blocked notice below is shown in exactly that state — so it falls back
    // to what the browser asks for rather than to English.
    <LocaleProvider locale={profileReady ? profile.locale : (preferredLocale() ?? profile.locale)}>
      {/* Nothing renders before the profile is read: a first paint in the wrong
          language or the wrong theme is worse than one frame of nothing. */}
      {block !== 'none' ? (
        // Ahead of the hydration check on purpose: 'superseded' can arrive
        // long after the app is running, and by then the connection is closed
        // and every screen behind this one is reading from nothing.
        <DatabaseBlockedNotice state={block} />
      ) : !profileReady || !gamesReady ? (
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

      {/* Same rule as the offline notice, and the same reason: a fixed banner
          over a board covers either the grid or the controls. Sync being
          paused is worth knowing and is never worth a swallowed tap. */}
      {activeGame === null ? <SyncNotice /> : null}

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
