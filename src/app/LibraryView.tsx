/**
 * The resting screen: everything on the desk, newest first.
 *
 * It reads summaries rather than games, so opening the app never rehydrates
 * four boards to draw four rows — the summary already carries the sigil, the
 * clock and the progress the list renders.
 */

import { useT } from '../i18n/locale';
import type { GameSummary } from '../state/db';
import { GameList } from '../ui/game/GameList';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { SettingsIcon } from '../ui/primitives/icons';

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
  // A solved board and a board waiting for you are different objects, and the
  // list said so about neither until now.
  const inProgress = summaries.filter((game) => game.completedAt === null);
  const finished = summaries.filter((game) => game.completedAt !== null);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-6 pb-10">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl leading-none text-ink">{t('app.name')}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">{t('app.tagline')}</p>
        </div>
        <Button variant="ghost" className="flex-none" onClick={onLearn}>
          {t('learn.title')}
        </Button>
        <IconButton
          label={t('settings.title')}
          icon={<SettingsIcon />}
          className="flex-none"
          onClick={onOpenSettings}
        />
      </header>

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
    </div>
  );
}
