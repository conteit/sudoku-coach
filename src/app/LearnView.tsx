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
import type { PlayerProfile } from '../state/types';
import { Button } from '../ui/primitives/Button';
import { IconButton } from '../ui/primitives/IconButton';
import { ChevronLeftIcon } from '../ui/primitives/icons';
import { LessonBody } from '../ui/learn/LessonBody';
import { Section } from '../ui/learn/prose';
import { TechniqueIndex } from '../ui/learn/TechniqueIndex';
import { SplitLayout } from './SplitLayout';
import { useViewportTier } from './useViewportTier';

/** The index's heading, which also names the nav around it on a wide screen. */
const TECHNIQUES_NAV_TITLE = 'learn-techniques-title';

export interface LearnViewProps {
  profile: PlayerProfile;
  /** Opens straight onto one technique — the coach panel links in this way. */
  technique?: TechniqueId | null;
  onClose: () => void;
  /**
   * Into the practice grids: a technique to drill, or null for the mixed
   * exercise where naming the technique is itself the first question.
   *
   * Required rather than optional, so a screen that renders Learn has to
   * decide what practice means there. Reading is the half of Learn that
   * already worked; leaving the other half quietly un-wired is the failure
   * mode an optional prop invites.
   */
  onPractise: (technique: TechniqueId | null) => void;
}

/**
 * The way from reading a technique to trying it.
 *
 * Under the lesson rather than beside its title: the offer only makes sense
 * to someone who has read what the pattern is, and a button above the prose
 * is an invitation to skip it.
 *
 * **One rule places every instance: the offer sits at the bottom of the
 * content pane, and practises whatever that pane is about.** The mixed
 * exercise therefore ends the intro, and a technique's ends its lesson —
 * never both at once. It used to hang off the technique index too, which on
 * a wide screen put "mixed practice" in the left column level with
 * "practise this technique" in the right: two near-identical buttons, side
 * by side, meaning different things. The nav is for navigating.
 */
function PractiseButton({ technique, onPractise }: {
  technique: TechniqueId | null;
  onPractise: (technique: TechniqueId | null) => void;
}) {
  const t = useT();
  return (
    <div className="mt-8 flex flex-col gap-1.5 border-t border-rule pt-6">
      <Button variant="coach" size="lg" block onClick={() => onPractise(technique)}>
        {technique === null ? t('exercise.startOpen') : t('exercise.start')}
      </Button>
      <p className="text-xs leading-relaxed text-ink-soft">
        {technique === null ? t('exercise.openIntro') : t('exercise.untracked')}
      </p>
    </div>
  );
}

function TechniquePage({
  id,
  profile,
  onBack,
  onPractise,
}: {
  id: TechniqueId;
  profile: PlayerProfile;
  onBack: () => void;
  onPractise: (technique: TechniqueId | null) => void;
}) {
  const t = useT();

  return (
    <article>
      <LessonBody
        id={id}
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
      <PractiseButton technique={id} onPractise={onPractise} />
    </article>
  );
}

export function LearnView({ profile, technique = null, onClose, onPractise }: LearnViewProps) {
  const t = useT();
  const tier = useViewportTier();
  const [open, setOpen] = useState<TechniqueId | null>(technique);

  if (tier !== 'laptop' && tier !== 'desktop') {
    // Below `laptop` this is the pre-existing, signed-off phone/tablet
    // layout, untouched: the back-button page push and the stacked body.
    // `SplitLayout` is the wide split and nothing else — it is reached for
    // only at `laptop` and above, and this branch keeps its own padding
    // rather than borrowing a shared one that would change this screen.
    if (open !== null) {
      return (
        <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-12">
          <TechniquePage
            id={open}
            profile={profile}
            onBack={() => (technique === null ? setOpen(null) : onClose())}
            onPractise={onPractise}
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
          <PractiseButton technique={null} onPractise={onPractise} />
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
      <PractiseButton technique={null} onPractise={onPractise} />
    </>
  );

  return (
    <div className="flex min-h-dvh w-full flex-col">
      {/* Not the split's own children: the header is fixed chrome, not a
          pane. This wrapper only borrows `SplitLayout`'s width cap and side
          padding so the title lines up with the columns beneath it — same
          convention `LibraryView` uses for its own header. */}
      {/* `pb-6` matches the `mb-6` on `LibraryView`'s header: both screens
          put the same 48px between the chrome and the panes below it. They
          are built in the same branch from the same primitive and had no
          reason to differ — this one was simply missing the class. */}
      <header className="flex w-full items-start gap-3 px-6 pt-6 pb-6">
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
        narrow="left"
        left={
          // Named by the heading the index already renders, rather than by a
          // second copy of the same words: an `aria-label` here made the nav
          // and the visible `h2` under it two independently editable
          // spellings of one name.
          <nav aria-labelledby={TECHNIQUES_NAV_TITLE}>
            <TechniqueIndex
              profile={profile}
              onOpen={setOpen}
              titleId={TECHNIQUES_NAV_TITLE}
            />
          </nav>
        }
        right={
          // `<main>`, not a labelled `<section>`: this pane *is* the page's
          // content, and a generic `region` is what a screen reader announces
          // when nothing claims the primary landmark. The label went with it
          // — it repeated the page's own `<h1>`, and once a lesson was open it
          // announced "Learn" over what was actually the hidden-pair page.
          //
          // `max-w-[40rem]` sits here, not on `SplitLayout`'s pane, so the cap
          // is this screen's own call and `SplitLayout` stays reusable by a
          // screen that wants its wide pane full width. It caps the whole
          // lesson, `Example`'s worked grid included: a lesson stretched
          // across a 1536px column would be a ~200-character prose measure,
          // and an uncapped 9x9 at that width would be a ~1000px-tall
          // illustration — both worse than reading the lesson, grid included,
          // at one fixed measure.
          <main className="max-w-[40rem]">
            {open === null ? (
              intro
            ) : (
              <LessonBody
                id={open}
                profile={profile}
                titleAs="h2"
                // A way back to the page itself. The index beside it can open
                // another technique, but nothing could return this pane to
                // the rules and the coach's contract it opened on — the one
                // part of Learn that is not a technique, and the part a
                // player is most likely to want a second look at.
                leading={
                  <IconButton
                    // Not plain "Back", which is what the page header beside
                    // it already says — and that one leaves Learn altogether.
                    // Two controls on screen at once, both named "Back",
                    // going to different places, is a coin toss for anyone
                    // reading the accessible name instead of the layout.
                    label={t('learn.backToIndex')}
                    icon={<ChevronLeftIcon />}
                    className="flex-none"
                    onClick={() => setOpen(null)}
                  />
                }
              />
            )}
            {open === null ? null : <PractiseButton technique={open} onPractise={onPractise} />}
          </main>
        }
      />
    </div>
  );
}
