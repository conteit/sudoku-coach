/**
 * Difficulty as a word plus a four-pip meter. The pips do the fast reading and
 * the word does the accessible reading, so neither colour nor shape is ever
 * carrying the meaning on its own.
 */

import type { Difficulty } from '../../engine/types';
import { DIFFICULTIES } from '../../engine/types';
import { cx } from '../primitives/cx';

export interface DifficultyBadgeProps {
  difficulty: Difficulty;
  className?: string;
}

const LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

export function DifficultyBadge({ difficulty, className }: DifficultyBadgeProps) {
  const level = DIFFICULTIES.indexOf(difficulty) + 1;

  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <span className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">
        {LABELS[difficulty]}
      </span>
      <span aria-hidden="true" className="flex items-center gap-[3px]">
        {DIFFICULTIES.map((_, i) => (
          <span
            key={i}
            className={cx('h-[3px] w-2.5', i < level ? 'bg-ink' : 'bg-rule')}
          />
        ))}
      </span>
    </span>
  );
}
