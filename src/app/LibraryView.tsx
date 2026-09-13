/**
 * The resting screen: everything on the desk, newest first.
 *
 * It reads summaries rather than games, so opening the app never rehydrates
 * four boards to draw four rows — the summary already carries the sigil, the
 * clock and the progress the list renders.
 */

import { useT } from '../i18n/locale';
import { authAvailable, useAccount } from '../state/account';
import { useProfile } from '../state/profile';
import type { GameSummary } from '../state/db';
import { useSync } from '../sync/store';
import { syncAvailable } from '../sync/token';
import { GameList } from '../ui/game/GameList';
import { ProgressPanel } from '../ui/learn/ProgressPanel';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { SettingsIcon, SyncIcon } from '../ui/primitives/icons';
import { SplitLayout } from './SplitLayout';
import { useViewportTier } from './useViewportTier';

export interface LibraryViewProps {
  summaries: readonly GameSummary[];
  onResume: (id: string) => void;
  onNewGame: () => void;
  onOpenSettings: () => void;
  onLearn: () => void;
}

/**
 * The one invitation to sign in outside Settings.
 *
 * An invitation and not a gate: it sits under the games rather than over
 * them, it never blocks anything, and it disappears the moment it is
 * accepted. It lives on this screen because this is where a player decides
 * what to do next — and nowhere near the board, which is for the board.
 */
function SignInInvitation() {
  const t = useT();
  const account = useAccount((state) => state.account);
  const ready = useAccount((state) => state.ready);
  const signIn = useAccount((state) => state.signIn);

  // Nothing while the answer is still arriving: an invitation that appears a
  // beat after the page, then vanishes because a session was restored, is
  // worse than one that waits.
  if (!authAvailable() || !ready || account !== null) return null;

  return (
    <div className="mt-8 flex flex-col items-start gap-2 border-t border-rule pt-6">
      <p className="text-sm leading-relaxed text-ink-soft">{t('account.invite')}</p>
      <Button variant="ghost" onClick={() => void signIn()}>
        {t('account.signIn')}
      </Button>
    </div>
  );
}

/**
 * "Sync now", out of Settings and onto the screen where a player already is.
 *
 * Gated exactly the way `SyncSection` gates its own controls in Settings —
 * built in, usable in this browser, an account to sync to, and the switch
 * on — because Settings is still where the switch itself lives; this is a
 * shortcut for the action, not a second place to turn the feature on.
 */
function SyncControl() {
  const t = useT();
  const account = useAccount((state) => state.account);
  const enabled = useSync((state) => state.enabled);
  const status = useSync((state) => state.status);

  if (!authAvailable() || !syncAvailable() || account === null || !enabled) return null;

  const syncing = status === 'syncing';
  const paused = status === 'paused';

  return (
    /*
     * `relative` on a wrapper rather than on the button: the dot is
     * positioned against it, and putting it inside `IconButton` would give
     * every icon button in the app a positioning context it has no use for.
     */
    <div className="relative flex">
      <IconButton
        // The dot is the only thing carrying "this needs you" visually, so
        // the label has to carry it too — a screen reader gets no colour.
        label={t(syncing ? 'sync.syncing' : paused ? 'sync.nowNeeded' : 'sync.now')}
        icon={<SyncIcon className={syncing ? 'animate-spin' : undefined} />}
        disabled={syncing}
        // A real press, so a silent renewal that comes back empty may go on
        // to ask in person. This button is the fix the dot is pointing at,
        // and without this it would be inert in the browser that shows it.
        onClick={() => void useSync.getState().syncNow({ ask: true })}
      />
      {paused ? (
        /* Amber, the coach's colour, which everywhere else in this app means
           "there is something here for you" rather than "something is wrong"
           — the eraser with dead notes to clear, the armed rewind. Red would
           promise a fault, and there is none: the games are safe and one tap
           clears this. `aria-hidden` because the label above already says it,
           and `pointer-events-none` so the dot can never eat the press. */
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-coach ring-2 ring-paper"
        />
      ) : null}
    </div>
  );
}

export function LibraryView({
  summaries,
  onResume,
  onNewGame,
  onOpenSettings,
  onLearn,
}: LibraryViewProps) {
  const t = useT();
  const tier = useViewportTier();
  const profile = useProfile((state) => state.profile);
  const changed = useSync((state) => state.changed);
  // A solved board and a board waiting for you are different objects, and the
  // list said so about neither until now.
  const inProgress = summaries.filter((game) => game.completedAt === null);
  const finished = summaries.filter((game) => game.completedAt !== null);

  // The mark is cleared by opening the game, and nothing else — not by the
  // dot being seen, not by the toast timing out. This is where "opening from
  // the library" actually happens: the list itself only ever reports a tap.
  const resume = (id: string) => {
    useSync.getState().seen(id);
    onResume(id);
  };

  // `mb-6` is the phone layout's, unchanged; on a wide viewport it is also
  // what `LearnView`'s header spaces itself by, so the two screens put the
  // same gap between the chrome and the panes.
  const header = (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl leading-none text-ink">{t('app.name')}</h1>
        <p className="mt-1.5 text-sm text-ink-soft">{t('app.tagline')}</p>
      </div>
      {/* One cluster, not two loose siblings: with three children under
          `justify-between` the free space fell *between* Learn and Settings,
          which left Learn adrift in the middle of the header instead of
          reading as one of the two ways out of this screen. Grouped, the
          title holds the left and both controls sit together on the right. */}
      <div className="flex flex-none items-center gap-2">
        <Button variant="ghost" onClick={onLearn}>
          {t('learn.title')}
        </Button>
        {/* Inside the cluster, not a third header child: `LibraryView.test
            .tsx` asserts this header has exactly two children, and that
            assertion is protecting the title's half of the row. Present
            only when sync is on and usable, so a build or session with
            neither reflows nothing — there is simply nothing here. */}
        <SyncControl />
        <IconButton
          label={t('settings.title')}
          icon={<SettingsIcon />}
          onClick={onOpenSettings}
        />
      </div>
    </header>
  );

  const games = (
    <>
      <GameList games={inProgress} onResume={resume} onNewGame={onNewGame} changed={changed} />
      <SignInInvitation />

      {finished.length > 0 ? (
        <GameList
          className="mt-10"
          variant="finished"
          games={finished}
          onResume={resume}
          onNewGame={onNewGame}
          changed={changed}
        />
      ) : null}
    </>
  );

  if (tier === 'phone' || tier === 'tablet') {
    // Today's screen, to the class. The width is what buys the progress pane;
    // without the width there is nothing to spend, and stacking it under the
    // list would add a whole section to a layout that was already signed off.
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-6 pb-10">
        {header}
        {games}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full flex-col">
      {/* Not the split's own children: the header is fixed chrome, not a
          pane. This wrapper only borrows `SplitLayout`'s width cap and side
          padding so the title lines up with the columns beneath it. */}
      {/* Tracks `SplitLayout`'s own padding so the title lines up with the
          panes; no cap, for the same reason it has none. */}
      <div className="w-full px-6 pt-6">{header}</div>
      <SplitLayout
        // The games take the width, not the progress summary: this list is
        // the reason the screen exists, and with `narrow="left"` it would
        // have been 320px on a laptop against 343px on a phone — crossing
        // 1024 would have made the primary content *narrower*. `left` is
        // still the games, so they stay first in the DOM: a screen-reader
        // user reaches their unfinished puzzles before a summary of what
        // they have mastered.
        narrow="right"
        left={<main>{games}</main>}
        right={
          <aside aria-label={t('progress.title')}>
            <ProgressPanel profile={profile} />
          </aside>
        }
      />
    </div>
  );
}
