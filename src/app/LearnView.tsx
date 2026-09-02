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
import type { TechniqueId } from '../engine/types';
import { useT } from '../i18n/locale';
import type { Locale, PlayerProfile } from '../state/types';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { ChevronLeftIcon } from '../ui/primitives/icons';
import { LessonBody } from '../ui/learn/LessonBody';
import { Section } from '../ui/learn/prose';
import { TechniqueIndex } from '../ui/learn/TechniqueIndex';
import { SplitLayout } from './SplitLayout';
import { useViewportTier } from './useViewportTier';

export interface LearnViewProps {
  profile: PlayerProfile;
  /** Opens straight onto one technique — the coach panel links in this way. */
  technique?: TechniqueId | null;
  onClose: () => void;
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

  return (
    <article>
      <LessonBody
        id={id}
        locale={locale}
        profile={profile}
        leading={
          <IconButton
            label={t('action.back')}
            icon={<ChevronLeftIcon />}
            className="flex-none"
            onClick={onBack}
          />
        }
      />
    </article>
  );
}

export function LearnView({ profile, technique = null, onClose }: LearnViewProps) {
  const t = useT();
  const tier = useViewportTier();
  const [open, setOpen] = useState<TechniqueId | null>(technique);

  if (tier !== 'laptop' && tier !== 'desktop') {
    // Below `laptop` this is the pre-existing, signed-off phone/tablet
    // layout, untouched: the back-button page push and the stacked body.
    // `SplitLayout` is reached for only at `laptop` and above — its shared
    // stacked branch uses different padding and would silently change this
    // screen's phone layout.
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

        {/* The divider between this section and the four `Section`s above it is
            drawn here rather than by `TechniqueIndex`: the index is also the
            game screen's resting lesson column, where it is the first thing in
            the column and has nothing to be separated from. */}
        <div className="border-t border-rule pt-6">
          <TechniqueIndex profile={profile} onOpen={setOpen} />
        </div>

        <div className="pt-8">
          <Button variant="secondary" size="lg" block onClick={onClose}>
            {t('action.back')}
          </Button>
        </div>
      </div>
    );
  }

  // The content pane is never empty: until a technique is chosen it holds
  // the same four intro sections the stacked layout puts above the list. A
  // pane that starts blank is a pane that jumps the first time it is used,
  // and half a screen of nothing reads as a bug rather than as an invitation.
  const intro = (
    <>
      <Section title={t('learn.rules.title')} body={t('learn.rules.body')} />
      <Section title={t('learn.notes.title')} body={t('learn.notes.body')} />
      <Section title={t('learn.coach.title')} body={t('learn.coach.body')} />
      <Section title={t('learn.keys.title')} body={t('learn.keys.body')} />
    </>
  );

  return (
    <div className="flex min-h-dvh w-full flex-col">
      {/* Not the split's own children: the header is fixed chrome, not a
          pane. This wrapper only borrows `SplitLayout`'s width cap and side
          padding so the title lines up with the columns beneath it — same
          convention `LibraryView` uses for its own header. */}
      <header className="mx-auto flex w-full max-w-[96rem] items-start gap-3 px-6 pt-6">
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
      <SplitLayout
        tier={tier}
        left={
          <nav aria-label={t('learn.techniques.title')}>
            <TechniqueIndex profile={profile} onOpen={setOpen} />
          </nav>
        }
        right={
          // `max-w-[40rem]` sits on this `<section>`, not on `SplitLayout`'s
          // pane, so the cap is this screen's own call and `SplitLayout`
          // stays reusable by a screen that wants its right pane full width.
          // It caps the whole lesson, `Example`'s worked grid included: a
          // lesson stretched across a 1536px column would be a ~200-character
          // prose measure, and an uncapped 9x9 at that width would be a
          // ~1000px-tall illustration — both worse than reading the lesson,
          // grid included, at one fixed measure.
          <section aria-label={t('learn.title')} className="max-w-[40rem]">
            {open === null ? (
              intro
            ) : (
              <LessonBody id={open} locale={profile.locale} profile={profile} titleAs="h2" />
            )}
          </section>
        }
      />
    </div>
  );
}
