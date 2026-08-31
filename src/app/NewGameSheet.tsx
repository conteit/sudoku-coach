/**
 * Starting a puzzle: pick a level, watch it being built, play it.
 *
 * Generation is the one operation in the app that can take seconds, so it is
 * shown honestly — the attempt counter and the level reached so far come
 * straight from the worker's progress events. Closing the sheet aborts the run
 * rather than letting it finish into a void.
 *
 * When the cap runs out at a nearer level than the one asked for, the puzzle is
 * still offered, and the difference is stated (R1) rather than quietly
 * relabelled.
 */

import { useState } from 'react';
import { DIFFICULTIES } from '../engine/types';
import type { Difficulty, GeneratedPuzzle, TechniqueId } from '../engine/types';
import { useLocale, useT } from '../i18n/locale';
import { getLesson } from '../coach/lessons';
import { easiestLevelFor, edgeOfMastery } from '../state/mastery';
import type { PlayerProfile } from '../state/types';
import { Button } from '../ui/primitives/Button';
import { Sheet } from '../ui/primitives/Sheet';
import { cx } from '../ui/primitives/cx';
import { useGenerator } from './useGenerator';

export interface NewGameSheetProps {
  open: boolean;
  onClose: () => void;
  /** Handed a generated puzzle to turn into a game. */
  onStart: (puzzle: { givens: string; solution: string; difficulty: Difficulty }) => void;
  /** The profile decides what "let the coach choose" means. */
  profile: PlayerProfile;
}

const DIFFICULTY_KEYS = {
  easy: 'difficulty.easy',
  medium: 'difficulty.medium',
  hard: 'difficulty.hard',
  expert: 'difficulty.expert',
} as const;

export function NewGameSheet({ open, onClose, onStart, profile }: NewGameSheetProps) {
  const t = useT();
  const locale = useLocale();
  const { generate, generateNeeding, cancel, running, progress, failed } = useGenerator();
  /** The technique this player would get the most out of meeting again. */
  const edge = edgeOfMastery(profile);
  const [missed, setMissed] = useState<TechniqueId | null>(null);
  /** A puzzle that came out at a different level than asked for (R1). */
  const [settled, setSettled] = useState<{ requested: Difficulty; puzzle: GeneratedPuzzle } | null>(
    null,
  );

  const close = (): void => {
    cancel();
    setSettled(null);
    setMissed(null);
    onClose();
  };

  const start = (puzzle: GeneratedPuzzle): void => {
    setSettled(null);
    onStart({
      givens: puzzle.givens,
      solution: puzzle.solution,
      difficulty: puzzle.difficulty,
    });
  };

  /** "Let the coach choose": practise the technique at the edge of mastery. */
  const pickForMe = async (): Promise<void> => {
    if (edge === null) return;
    setSettled(null);
    setMissed(null);
    const outcome = await generateNeeding(edge, easiestLevelFor(edge));
    if (outcome === null) return;
    if (!outcome.needed) setMissed(edge);
    start(outcome.result.puzzle);
  };

  const pick = async (difficulty: Difficulty): Promise<void> => {
    setSettled(null);
    setMissed(null);
    const result = await generate(difficulty);
    if (result === null) return;
    // A puzzle that missed the level asked for is offered, not relabelled: the
    // player decides whether to play it or ask again.
    if (result.matched) start(result.puzzle);
    else setSettled({ requested: difficulty, puzzle: result.puzzle });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('action.newGame')}
      description={running ? t('games.generating') : t('games.newGamePrompt')}
    >
      {edge !== null ? (
        <div className="pb-3">
          <Button
            variant="coach"
            size="lg"
            block
            disabled={running}
            onClick={() => void pickForMe()}
          >
            {t('games.coachPick')}
          </Button>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {t('games.coachPickBody', {
              difficulty: t(DIFFICULTY_KEYS[easiestLevelFor(edge)]).toLocaleLowerCase(locale),
              technique: getLesson(profile.locale, edge).name,
            })}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 pb-2">
        {DIFFICULTIES.map((difficulty) => (
          <Button
            key={difficulty}
            variant="secondary"
            size="lg"
            block
            disabled={running}
            onClick={() => void pick(difficulty)}
          >
            {t(DIFFICULTY_KEYS[difficulty])}
          </Button>
        ))}
      </div>

      <p
        aria-live="polite"
        className={cx('min-h-6 text-sm', failed ? 'text-danger' : 'text-ink-soft')}
      >
        {failed
          ? t('games.generationFailed')
          : missed !== null
            ? t('games.coachPickMissed', {
                technique: getLesson(profile.locale, missed).name,
                difficulty: t(DIFFICULTY_KEYS[easiestLevelFor(missed)]).toLocaleLowerCase(locale),
              })
          : progress !== null
            ? t('games.generatingAttempt', {
                attempt: progress.attempts + 1,
                max: progress.maxAttempts,
              })
            : settled !== null
              ? t('games.settledFor', {
                  requested: t(DIFFICULTY_KEYS[settled.requested]),
                  actual: t(DIFFICULTY_KEYS[settled.puzzle.difficulty]),
                })
              : ''}
      </p>

      {settled !== null ? (
        <div className="flex gap-2 pt-1 pb-2">
          <Button variant="primary" size="lg" block onClick={() => start(settled.puzzle)}>
            {t('action.continue')}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            block
            onClick={() => void pick(settled.requested)}
          >
            {t('action.newGame')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
