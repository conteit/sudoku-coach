/**
 * What the player has learned, beside their games.
 *
 * The list is `TechniqueIndex` — the same component the game screen shows in
 * its third column — because two renderings of one player's mastery are two
 * things that can disagree, and the one that disagrees is the one telling
 * them they know something they do not. `onOpen` is omitted: there is
 * nowhere in this pane to navigate a technique row to.
 */

import { loadLessons } from '../../coach/lessons';
import { useT } from '../../i18n/locale';
import { edgeOfMastery } from '../../state/mastery';
import type { PlayerProfile } from '../../state/types';
import { TechniqueIndex } from './TechniqueIndex';

export function ProgressPanel({ profile }: { profile: PlayerProfile }) {
  const t = useT();
  const next = edgeOfMastery(profile);
  const lessons = loadLessons(profile.locale);

  return (
    <section>
      <h2 className="font-display text-xl leading-tight text-ink">{t('progress.title')}</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
        {next === null
          ? t('progress.nothingNext')
          : t('progress.nextUp', { technique: lessons[next].name })}
      </p>
      <div className="mt-4">
        {/* `h3`: this panel's own `h2` is above it, and the list is part of
            the panel rather than a section beside it. */}
        <TechniqueIndex profile={profile} titleAs="h3" />
      </div>
    </section>
  );
}
