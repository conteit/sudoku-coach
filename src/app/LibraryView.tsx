/**
 * The resting screen: everything on the desk, newest first.
 *
 * It reads summaries rather than games, so opening the app never rehydrates
 * four boards to draw four rows — the summary already carries the sigil, the
 * clock and the progress the list renders.
 */

import { useT } from '../i18n/locale';
import { useProfile } from '../state/profile';
import type { GameSummary } from '../state/db';
import { GameList } from '../ui/game/GameList';
import { ProgressPanel } from '../ui/learn/ProgressPanel';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { SettingsIcon } from '../ui/primitives/icons';
import { SplitLayout } from './SplitLayout';
import { useViewportTier } from './useViewportTier';

export interface LibraryViewProps {
  summaries: readonly GameSummary[];
  onResume: (id: string) => void;
  onNewGame: () => void;
  onOpenSettings: () => void;
  onLearn: () => void;
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
  // A solved board and a board waiting for you are different objects, and the
  // list said so about neither until now.
  const inProgress = summaries.filter((game) => game.completedAt === null);
  const finished = summaries.filter((game) => game.completedAt !== null);

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
      <GameList games={inProgress} onResume={onResume} onNewGame={onNewGame} />

      {finished.length > 0 ? (
        <GameList
          className="mt-10"
          variant="finished"
          games={finished}
          onResume={onResume}
          onNewGame={onNewGame}
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
