/**
 * A lesson, with no page around it.
 *
 * Split out of `LearnView` because the game screen shows the same lesson beside
 * the board on a wide viewport. Two copies of this would drift, and the copy
 * that drifted would be the one teaching the player the wrong thing.
 */

import { getLesson } from '../../coach/lessons';
import { useT } from '../../i18n/locale';
import { masteryOf } from '../../state/mastery';
import type { Locale, PlayerProfile } from '../../state/types';
import type { TechniqueId } from '../../engine/types';
import { Example, MasteryChip, Prose } from './prose';

export interface LessonBodyProps {
  id: TechniqueId;
  locale: Locale;
  profile: PlayerProfile;
}

export function LessonBody({ id, locale, profile }: LessonBodyProps) {
  const t = useT();
  const lesson = getLesson(locale, id);

  return (
    <>
      <header className="flex items-start gap-3 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-tight text-ink">{lesson.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">{lesson.oneLiner}</p>
        </div>
        <MasteryChip stage={masteryOf(profile, id).stage} t={t} />
      </header>

      <section className="border-t border-rule py-5">
        <h2 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
          {t('learn.what')}
        </h2>
        <Prose text={lesson.what} />
      </section>

      <section className="border-t border-rule py-5">
        <h2 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
          {t('learn.why')}
        </h2>
        <Prose text={lesson.why} />
      </section>

      <section className="border-t border-rule py-5">
        <h2 className="mb-1 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
          {t('learn.example')}
        </h2>
        <Example lesson={lesson} />
      </section>
    </>
  );
}
