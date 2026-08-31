/**
 * Puzzles in progress (R5).
 *
 * Typed as a `Pick` of `state/db`'s summary rather than a shape of its own: the
 * store hands rows straight through, and the omission of `solution` is
 * load-bearing — the list literally cannot read the answer.
 *
 * Rows are hairline-ruled rather than carded. A card per row would put three
 * borders and a shadow around information that is already a list, and at four
 * saved games it reads as clutter.
 */

import { useState } from 'react';
import { parseGrid } from '../../engine/board';
import type { GameSummary as StoredSummary } from '../../state/db';
import { Button } from '../primitives/Button';
import { PlayIcon, PlusIcon } from '../primitives/icons';
import { cx } from '../primitives/cx';
import { DifficultyBadge } from './DifficultyBadge';
import { PuzzleSigil } from './PuzzleSigil';
import { formatDuration, totalElapsed } from './duration';
import type { Locale } from '../../state/types';
import { useLocale, useT, type Translate } from '../../i18n/locale';

/** Everything the list needs, and nothing it must not see. */
export type GameSummary = Pick<
  StoredSummary,
  'id' | 'difficulty' | 'givens' | 'board' | 'elapsedMs' | 'updatedAt'
> & {
  /**
   * Widened from the store's summary, which is always frozen: a row can still
   * be handed a live clock and will count it up, which is what keeps the
   * component usable outside the list — and testable without a store.
   */
  runningSince: number | null;
};

export interface GameListProps {
  games: readonly GameSummary[];
  onResume: (id: string) => void;
  onNewGame: () => void;
  /**
   * `finished` drops the "new puzzle" control and reads the clock as a final
   * time. A solved board is not something you continue, and listing it under
   * "in progress" made the list lie about what a tap would open.
   */
  variant?: 'active' | 'finished';
  /** Reference instant for the "updated" line; injectable so tests are stable. */
  now?: number;
  className?: string;
}

/** The difficulty label is part of the row's accessible name, so it is localized too. */
const DIFFICULTY_KEYS = {
  easy: 'difficulty.easy',
  medium: 'difficulty.medium',
  hard: 'difficulty.hard',
  expert: 'difficulty.expert',
} as const;

/** Share of the cells the player has to fill that are filled. Givens are not progress. */
function completion(game: GameSummary): number {
  let toFill = 0;
  let filled = 0;
  for (let cell = 0; cell < game.givens.length; cell++) {
    if (game.givens[cell] !== '.' && game.givens[cell] !== '0') continue;
    toFill += 1;
    if (game.board[cell] !== '.' && game.board[cell] !== '0') filled += 1;
  }
  return toFill === 0 ? 100 : Math.round((filled / toFill) * 100);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** One formatter per locale; building one is not free. */
const RELATIVE = new Map<Locale, Intl.RelativeTimeFormat>();

function relative(locale: Locale): Intl.RelativeTimeFormat {
  let formatter = RELATIVE.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    RELATIVE.set(locale, formatter);
  }
  return formatter;
}

function lastPlayed(locale: Locale, t: Translate, updatedAt: number, now: number): string {
  const delta = updatedAt - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) return relative(locale).format(Math.round(delta / ms), unit);
  }
  return t('games.justNow');
}

export function GameList({
  games,
  onResume,
  onNewGame,
  variant = 'active',
  now,
  className,
}: GameListProps) {
  const locale = useLocale();
  const t = useT();
  // The list is a resting screen, not a stopwatch: one reading of the clock at
  // mount is enough, and it keeps the rows out of a per-second re-render.
  const [mountedAt] = useState(() => Date.now());
  const reference = now ?? mountedAt;

  return (
    <section className={cx('w-full', className)} aria-labelledby="game-list-heading">
      <header className="flex items-end justify-between gap-4 border-b border-ink pb-3">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
            {variant === 'finished' ? t('games.completed') : t('games.inProgress')}
          </p>
          <h2 id="game-list-heading" className="digit mt-1 text-2xl leading-none text-ink">
            {games.length === 0
              ? t('games.deskEmpty')
              : games.length === 1
                ? t('games.puzzleCountOne', { count: games.length })
                : t('games.puzzleCountOther', { count: games.length })}
          </h2>
        </div>
        {variant === 'active' ? (
          <Button variant="primary" icon={<PlusIcon />} onClick={onNewGame}>
            {t('games.newPuzzle')}
          </Button>
        ) : null}
      </header>

      {games.length === 0 ? (
        <p className="py-8 text-sm text-ink-soft">{t('games.emptyBody')}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {games.map((game) => {
            const percent = completion(game);
            const elapsed = formatDuration(
              totalElapsed(game.elapsedMs, game.runningSince, reference),
            );
            return (
              <li key={game.id}>
                <button
                  type="button"
                  onClick={() => onResume(game.id)}
                  aria-label={t('games.resumeLabel', {
                    difficulty: t(DIFFICULTY_KEYS[game.difficulty]).toLocaleLowerCase(locale),
                    percent,
                    elapsed,
                  })}
                  className={cx(
                    'group flex w-full items-center gap-4 py-3.5 text-left',
                    'transition-colors duration-100 ease-snap hover:bg-paper-sunk',
                  )}
                >
                  <PuzzleSigil
                    givens={game.givens}
                    values={parseGrid(game.board)}
                    size={44}
                    className="ml-0.5"
                  />

                  <span className="min-w-0 flex-1">
                    <DifficultyBadge difficulty={game.difficulty} />
                    <span className="mt-1.5 flex items-center gap-2 text-sm text-ink-soft tabular-nums">
                      {variant === 'finished' ? t('games.finishedIn', { time: elapsed }) : elapsed}
                      <span aria-hidden="true" className="text-ink-faint">
                        &middot;
                      </span>
                      <span className="truncate">
                        {lastPlayed(locale, t, game.updatedAt, reference)}
                      </span>
                    </span>
                  </span>

                  <span aria-hidden="true" className="flex items-baseline gap-px text-ink">
                    <span className="digit text-2xl leading-none">{percent}</span>
                    <span className="text-xs text-ink-faint">%</span>
                  </span>

                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-cell border border-rule text-ink-soft transition-colors duration-100 ease-snap group-hover:border-ink group-hover:text-ink"
                  >
                    <PlayIcon className="text-[1.05rem]" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
