/**
 * A lesson, with no page around it.
 *
 * Split out of `LearnView` because the game screen shows the same lesson beside
 * the board on a wide viewport. Two copies of this would drift, and the copy
 * that drifted would be the one teaching the player the wrong thing.
 */

import { memo, type ReactNode } from 'react';
import { getLesson } from '../../coach/lessons';
import { useT } from '../../i18n/locale';
import { masteryOf } from '../../state/mastery';
import type { PlayerProfile } from '../../state/types';
import type { TechniqueId } from '../../engine/types';
import { Example, MasteryChip, Prose } from './prose';

export interface LessonBodyProps {
  id: TechniqueId;
  /**
   * The player, for their mastery of this technique — and for the locale the
   * lesson is read in, which is a property of the same player rather than a
   * second thing a caller could get wrong. `TechniqueIndex`, the other half of
   * this module, already derived it this way; a module that disagrees with
   * itself about where the locale comes from will eventually be asked to
   * render an Italian index beside an English lesson.
   */
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
}

/**
 * Memoised for the game screen's lesson column, where this renders beside a
 * live board: without it, selecting a cell re-ran `parseGrid` and
 * `exampleMarks` and re-rendered an 81-cell illustration on every keystroke of
 * a game that has its own board to draw. The props are an id, a locale-bearing
 * profile and two display choices — all stable across a move — so the
 * comparison is cheap and it holds.
 *
 * A caller that passes `leading` (Learn's back button, built inline) defeats
 * it, which is correct: that host re-renders only when the page changes.
 */
export const LessonBody = memo(function LessonBody({
  id,
  profile,
  leading,
  titleAs: Title = 'h1',
}: LessonBodyProps) {
  const t = useT();
  const lesson = getLesson(profile.locale, id);

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
        <Example lesson={lesson} />
      </section>
    </>
  );
});
