/**
 * A lesson, with no page around it.
 *
 * Split out of `LearnView` because the game screen shows the same lesson beside
 * the board on a wide viewport. Two copies of this would drift, and the copy
 * that drifted would be the one teaching the player the wrong thing.
 */

import type { ReactNode } from 'react';
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
  /**
   * A control that belongs in the same header row as the title, owned by
   * whoever is hosting this lesson rather than by the lesson itself: the
   * back button in `LearnView`'s technique page, and nothing at all in the
   * game screen's lesson column, which has nowhere to go back to. Passed in
   * rather than duplicated so the title/mastery-chip row stays one row and
   * one piece of markup in both places.
   */
  leading?: ReactNode;
  /**
   * The heading level of the lesson's title, which is a property of the page
   * hosting it rather than of the lesson.
   *
   * `h1` on Learn's technique page, where the lesson *is* the document. `h2`
   * in the game screen's lesson column, where the document is a game in
   * progress: an `h1` there would make a sidebar the play screen's only
   * top-level heading, and one that comes and goes with the disclosure
   * ladder — the outline would gain and lose its root as hints are asked for.
   */
  titleAs?: 'h1' | 'h2';
  /**
   * Passed through to the worked example. See `Example`'s own `focusable`:
   * the illustration is a dead tab stop, and beside a live board it sits in
   * the player's path off the keypad.
   */
  exampleFocusable?: boolean;
}

export function LessonBody({
  id,
  locale,
  profile,
  leading,
  titleAs: Title = 'h1',
  exampleFocusable = true,
}: LessonBodyProps) {
  const t = useT();
  const lesson = getLesson(locale, id);

  return (
    <>
      <header className="flex items-start gap-3 pb-4">
        {leading}
        <div className="min-w-0 flex-1">
          <Title className="font-display text-2xl leading-tight text-ink">{lesson.name}</Title>
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
        <Example lesson={lesson} focusable={exampleFocusable} />
      </section>
    </>
  );
}
