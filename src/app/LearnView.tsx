/**
 * Learn: the rules, how the coach behaves, and every technique it can name.
 *
 * The technique pages are rendered from the shipped lesson library, not from a
 * second copy of the same explanations. A Learn section with its own words for
 * a hidden pair would drift from the words the coach uses mid-game, and then
 * the app would be teaching two subtly different things — which is worse than
 * teaching one of them badly.
 *
 * Only two pieces of copy here are new, because nothing in the repo said them:
 * the rules of sudoku, and what the disclosure ladder does. The second is
 * itself a teaching moment — a player who does not know the coach withholds the
 * digit on purpose will read a level-1 hint as a broken one.
 */

import { useState } from 'react';
import { parseGrid } from '../engine/board';
import { TECHNIQUE_IDS, type CellIndex, type Digit, type TechniqueId } from '../engine/types';
import { exampleMarks, getLesson, loadLessons } from '../coach/lessons';
import type { Lesson } from '../coach/types';
import { useT, type Translate } from '../i18n/locale';
import type { MessageKey } from '../i18n/types';
import { masteryOf } from '../state/mastery';
import type { Locale, MasteryStage, PlayerProfile } from '../state/types';
import { SudokuGrid, type GridCell } from '../ui/board/SudokuGrid';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { ChevronLeftIcon } from '../ui/primitives/icons';
import { cx } from '../ui/primitives/cx';

const MASTERY_KEYS = {
  unseen: 'mastery.unseen',
  taught: 'mastery.taught',
  recognized_with_hint: 'mastery.recognized_with_hint',
  applied_unaided: 'mastery.applied_unaided',
} as const satisfies Record<MasteryStage, MessageKey>;

/** How far along a stage reads, so the chip can carry it without extra words. */
const STAGE_TONE: Record<MasteryStage, string> = {
  unseen: 'border-rule text-ink-faint',
  taught: 'border-coach/40 text-coach',
  recognized_with_hint: 'border-coach/60 text-coach',
  applied_unaided: 'border-match/50 text-match',
};

export interface LearnViewProps {
  profile: PlayerProfile;
  /** Opens straight onto one technique — the coach panel links in this way. */
  technique?: TechniqueId | null;
  onClose: () => void;
}

/** Lesson prose is paragraphs separated by blank lines; nothing more. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((paragraph, i) => (
        <p key={i} className="mt-3 text-[0.9375rem] leading-relaxed text-ink first:mt-0">
          {paragraph}
        </p>
      ))}
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-t border-rule py-6">
      <h2 className="font-display mb-3 text-xl leading-tight text-ink">{title}</h2>
      <Prose text={body} />
    </section>
  );
}

function MasteryChip({ stage, t }: { stage: MasteryStage; t: Translate }) {
  return (
    <span
      className={cx(
        'shrink-0 rounded-cell border px-2 py-0.5 text-[0.6875rem] font-medium',
        STAGE_TONE[stage],
      )}
    >
      {t(MASTERY_KEYS[stage])}
    </span>
  );
}

/**
 * The lesson's worked example as a real board.
 *
 * Every filled cell is drawn as a given: in an illustration there is no player
 * entry to distinguish, and the difference in weight would suggest one.
 */
function Example({ lesson }: { lesson: Lesson }) {
  const marks = exampleMarks(lesson);
  const cells: GridCell[] = parseGrid(lesson.example.grid).map((value, index) => ({
    value,
    given: value !== null,
    candidates: (marks.get(index) ?? []) as Digit[],
  }));

  return (
    <figure className="mt-4">
      {/* An illustration, not a board to play: taps would only move a selection
          nobody asked for. */}
      <div className="pointer-events-none">
        <SudokuGrid
          cells={cells}
          selected={null}
          onSelect={() => undefined}
          spotlight={lesson.example.highlight as CellIndex[]}
          highlightPeers={false}
          highlightMatches={false}
          label={lesson.name}
        />
      </div>
      <figcaption className="mt-2.5 text-sm leading-relaxed text-ink-soft">
        {lesson.example.caption}
      </figcaption>
    </figure>
  );
}

function TechniquePage({
  id,
  locale,
  profile,
  onBack,
}: {
  id: TechniqueId;
  locale: Locale;
  profile: PlayerProfile;
  onBack: () => void;
}) {
  const t = useT();
  const lesson = getLesson(locale, id);

  return (
    <article>
      <header className="flex items-start gap-3 pb-4">
        <IconButton
          label={t('action.back')}
          icon={<ChevronLeftIcon />}
          className="flex-none"
          onClick={onBack}
        />
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
    </article>
  );
}

export function LearnView({ profile, technique = null, onClose }: LearnViewProps) {
  const t = useT();
  const [open, setOpen] = useState<TechniqueId | null>(technique);
  const lessons = loadLessons(profile.locale);

  if (open !== null) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-12">
        <TechniquePage
          id={open}
          locale={profile.locale}
          profile={profile}
          onBack={() => (technique === null ? setOpen(null) : onClose())}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-12">
      <header className="flex items-start gap-3 pb-5">
        <IconButton
          label={t('action.back')}
          icon={<ChevronLeftIcon />}
          className="flex-none"
          onClick={onClose}
        />
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-none text-ink">{t('learn.title')}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t('learn.intro')}</p>
        </div>
      </header>

      <Section title={t('learn.rules.title')} body={t('learn.rules.body')} />
      <Section title={t('learn.notes.title')} body={t('learn.notes.body')} />
      <Section title={t('learn.coach.title')} body={t('learn.coach.body')} />
      <Section title={t('learn.keys.title')} body={t('learn.keys.body')} />

      <section className="border-t border-rule pt-6">
        <h2 className="font-display text-xl leading-tight text-ink">
          {t('learn.techniques.title')}
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
          {t('learn.techniques.intro')}
        </p>

        <ul className="mt-4 divide-y divide-rule border-t border-rule">
          {TECHNIQUE_IDS.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setOpen(id)}
                className="flex w-full items-center gap-3 py-3.5 text-left transition-colors duration-100 ease-snap hover:bg-paper-sunk"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{lessons[id].name}</span>
                  <span className="mt-0.5 block truncate text-sm text-ink-soft">
                    {lessons[id].oneLiner}
                  </span>
                </span>
                <MasteryChip stage={masteryOf(profile, id).stage} t={t} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="pt-8">
        <Button variant="secondary" size="lg" block onClick={onClose}>
          {t('action.back')}
        </Button>
      </div>
    </div>
  );
}
