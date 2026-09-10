/**
 * The commentary beside a practice grid.
 *
 * Everything here is either the question being asked or a way out of it. The
 * *answer* side — the prompt, and the refusal when an answer is wrong — lives
 * in the screen's header instead, because on a phone this panel is a sheet
 * the player has to open, and an instruction you cannot see is not an
 * instruction.
 *
 * The coaching is `CoachPanel`, unchanged and un-forked. An exercise asks the
 * coach exactly what a game asks it — the same four rungs, the same refusal
 * to name a digit — and a second ladder that merely looked like the first
 * would be a second place for that contract to drift.
 */

import type { Hint } from '../../coach/types';
import type { TechniqueId } from '../../engine/types';
import { useT } from '../../i18n/locale';
import { Button } from '../primitives/Button';
import { cx } from '../primitives/cx';
import { CoachPanel } from '../coach/CoachPanel';

export interface ExerciseChoice {
  id: TechniqueId;
  name: string;
}

export interface ExercisePanelProps {
  /** Which technique is being drilled, once that is not itself the question. */
  techniqueLabel: string | null;
  /** Naming stage: the techniques on offer. Absent once one has been named. */
  choices?: readonly ExerciseChoice[];
  onName?: (technique: TechniqueId) => void;
  /** True when something easier also applies to this grid. */
  shared?: boolean;
  solved?: boolean;
  hint: Hint | null;
  onAsk: () => void;
  onEscalate: () => void;
  onNewGrid: () => void;
  onExit: () => void;
  onLearn?: (technique: TechniqueId) => void;
  className?: string;
}

export function ExercisePanel({
  techniqueLabel,
  choices,
  onName,
  shared = false,
  solved = false,
  hint,
  onAsk,
  onEscalate,
  onNewGrid,
  onExit,
  onLearn,
  className,
}: ExercisePanelProps) {
  const t = useT();
  const naming = choices !== undefined && onName !== undefined;

  return (
    <section
      aria-label={t('exercise.panel')}
      className={cx('flex flex-col gap-3 px-4 py-3 sm:px-0', className)}
    >
      {naming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">{t('exercise.namingHelp')}</p>
          {/* A list rather than loose buttons: fourteen names is a set to read
              through, and a screen reader should be told how long it is
              before the player starts down it. */}
          <ul className="flex flex-wrap gap-1.5">
            {choices.map((choice) => (
              <li key={choice.id}>
                <Button variant="secondary" size="sm" onClick={() => onName(choice.id)}>
                  {choice.name}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {shared ? (
            <p className="text-sm text-ink-soft">
              {t('exercise.shared', { technique: techniqueLabel ?? '' })}
            </p>
          ) : null}

          {solved ? (
            <p className="rounded-md bg-match-wash px-3 py-2 text-sm font-medium text-ink">
              {t('exercise.solved')}
            </p>
          ) : null}

          <CoachPanel
            hint={hint}
            techniqueLabel={techniqueLabel ?? undefined}
            onAsk={onAsk}
            onEscalate={onEscalate}
            onLearn={onLearn}
          />
        </>
      )}

      <div className="flex flex-col gap-2 border-t border-rule pt-3">
        <Button variant={solved ? 'primary' : 'secondary'} size="lg" block onClick={onNewGrid}>
          {t('exercise.newGrid')}
        </Button>
        <Button variant="ghost" size="lg" block onClick={onExit}>
          {t('exercise.exit')}
        </Button>
        {/* Said here rather than only at the door: a player who has just been
            told "solved" is exactly the one who might go looking for what it
            counted towards. */}
        <p className="text-xs text-ink-soft">{t('exercise.untracked')}</p>
      </div>
    </section>
  );
}
