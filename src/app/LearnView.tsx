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
  const [open, setOpen] = useState<TechniqueId | null>(technique);

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

      <TechniqueIndex profile={profile} onOpen={setOpen} />

      <div className="pt-8">
        <Button variant="secondary" size="lg" block onClick={onClose}>
          {t('action.back')}
        </Button>
      </div>
    </div>
  );
}
