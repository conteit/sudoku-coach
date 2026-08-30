/**
 * Puzzles in progress (R5).
 *
 * Typed as a `Pick` of the frozen `Game` contract rather than a shape of our
 * own: the integration pass hands rows straight through, and the omission of
 * `solution` is load-bearing — the list literally cannot read the answer.
 *
 * Rows are hairline-ruled rather than carded. A card per row would put three
 * borders and a shadow around information that is already a list, and at four
 * saved games it reads as clutter.
 */

import { useState } from 'react';
import type { Digit } from '../../engine/types';
import type { Game } from '../../state/types';
import { Button } from '../primitives/Button';
import { PlayIcon, PlusIcon } from '../primitives/icons';
import { cx } from '../primitives/cx';
import { DifficultyBadge } from './DifficultyBadge';
import { PuzzleSigil } from './PuzzleSigil';
import { formatDuration, totalElapsed } from './duration';

/** Everything the list needs, and nothing it must not see. */
export type GameSummary = Pick<
  Game,
  'id' | 'difficulty' | 'givens' | 'cells' | 'elapsedMs' | 'runningSince' | 'updatedAt'
>;

export interface GameListProps {
  games: readonly GameSummary[];
  onResume: (id: string) => void;
  onNewGame: () => void;
  /** Reference instant for the "updated" line; injectable so tests are stable. */
  now?: number;
  className?: string;
}

/** Share of the cells the player has to fill that are filled. Givens are not progress. */
function completion(game: GameSummary): number {
  let toFill = 0;
  let filled = 0;
  for (const cell of game.cells) {
    if (cell.given) continue;
    toFill += 1;
    if (cell.value !== null) filled += 1;
  }
  return toFill === 0 ? 100 : Math.round((filled / toFill) * 100);
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

function lastPlayed(updatedAt: number, now: number): string {
  const delta = updatedAt - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) return RELATIVE.format(Math.round(delta / ms), unit);
  }
  return 'just now';
}

export function GameList({ games, onResume, onNewGame, now, className }: GameListProps) {
  // The list is a resting screen, not a stopwatch: one reading of the clock at
  // mount is enough, and it keeps the rows out of a per-second re-render.
  const [mountedAt] = useState(() => Date.now());
  const reference = now ?? mountedAt;

  return (
    <section className={cx('w-full', className)} aria-labelledby="game-list-heading">
      <header className="flex items-end justify-between gap-4 border-b border-ink pb-3">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
            In progress
          </p>
          <h2 id="game-list-heading" className="digit mt-1 text-2xl leading-none text-ink">
            {games.length === 0 ? 'Nothing on the desk' : `${games.length} puzzle${games.length === 1 ? '' : 's'}`}
          </h2>
        </div>
        <Button variant="primary" icon={<PlusIcon />} onClick={onNewGame}>
          New puzzle
        </Button>
      </header>

      {games.length === 0 ? (
        <p className="py-8 text-sm text-ink-soft">
          Start a puzzle and it waits here, exactly where you left it.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {games.map((game) => {
            const percent = completion(game);
            const values = game.cells.map((cell) => cell.value as Digit | null);
            const elapsed = formatDuration(
              totalElapsed(game.elapsedMs, game.runningSince, reference),
            );
            return (
              <li key={game.id}>
                <button
                  type="button"
                  onClick={() => onResume(game.id)}
                  aria-label={`Resume ${game.difficulty} puzzle, ${percent} percent complete, ${elapsed} played`}
                  className={cx(
                    'group flex w-full items-center gap-4 py-3.5 text-left',
                    'transition-colors duration-100 ease-snap hover:bg-paper-sunk',
                  )}
                >
                  <PuzzleSigil givens={game.givens} values={values} size={44} className="ml-0.5" />

                  <span className="min-w-0 flex-1">
                    <DifficultyBadge difficulty={game.difficulty} />
                    <span className="mt-1.5 flex items-center gap-2 text-sm text-ink-soft tabular-nums">
                      {elapsed}
                      <span aria-hidden="true" className="text-ink-faint">
                        &middot;
                      </span>
                      <span className="truncate">{lastPlayed(game.updatedAt, reference)}</span>
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
