/**
 * Every technique the coach can name, with the player's mastery of each.
 *
 * Shown two places: the Learn screen, where a row opens the lesson, and the
 * game screen's lesson column before the coach has named a technique, where
 * there is nowhere to navigate to and a row is just a reading of where the
 * player stands.
 */

import { loadLessons } from '../../coach/lessons';
import { useT } from '../../i18n/locale';
import { masteryOf } from '../../state/mastery';
import type { PlayerProfile } from '../../state/types';
import { TECHNIQUE_IDS, type TechniqueId } from '../../engine/types';
import { MasteryChip } from './prose';

export interface TechniqueIndexProps {
  profile: PlayerProfile;
  /** Omitted where a row has nowhere to go — it then renders as static text. */
  onOpen?: (id: TechniqueId) => void;
}

export function TechniqueIndex({ profile, onOpen }: TechniqueIndexProps) {
  const t = useT();
  const lessons = loadLessons(profile.locale);

  return (
    // No rule of its own across the top. On Learn this section follows four
    // others and needs the divider they all share, so `LearnView` draws it —
    // there the rule separates two things. In the lesson column it is the
    // first and only thing in the column, and a divider with nothing above it
    // is a line under the column's own top edge.
    <section>
      <h2 className="font-display text-xl leading-tight text-ink">
        {t('learn.techniques.title')}
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
        {t('learn.techniques.intro')}
      </p>

      <ul className="mt-4 divide-y divide-rule border-t border-rule">
        {TECHNIQUE_IDS.map((id) => {
          const row = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{lessons[id].name}</span>
                <span className="mt-0.5 block truncate text-sm text-ink-soft">
                  {lessons[id].oneLiner}
                </span>
              </span>
              <MasteryChip stage={masteryOf(profile, id).stage} t={t} />
            </>
          );

          return (
            <li key={id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(id)}
                  className="flex w-full items-center gap-3 py-3.5 text-left transition-colors duration-100 ease-snap hover:bg-paper-sunk"
                >
                  {row}
                </button>
              ) : (
                <div className="flex w-full items-center gap-3 py-3.5 text-left">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
