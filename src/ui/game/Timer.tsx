/**
 * Elapsed time, derived entirely from the persisted `Game` fields so there is
 * no second source of truth: `elapsedMs` is what is banked, `runningSince` is
 * the wall clock the current run started at.
 *
 * The tick comes from the shared second-hand in clock.ts through
 * `useSyncExternalStore` — the sanctioned way to read a mutable outside value
 * — so a paused timer subscribes to nothing and holds no interval.
 */

import { useSyncExternalStore } from 'react';
import { cx } from '../primitives/cx';
import { noSubscription, secondsSnapshot, subscribeToSeconds, zeroSnapshot } from './clock';
import { formatDuration, totalElapsed } from './duration';
import { useT } from '../../i18n/locale';

export interface TimerProps {
  /** Banked milliseconds, excluding the current run. */
  elapsedMs: number;
  /** Wall clock the current run resumed at; null when paused. */
  runningSince: number | null;
  /** Larger treatment for the in-game header. */
  size?: 'sm' | 'md';
  className?: string;
}

export function Timer({ elapsedMs, runningSince, size = 'sm', className }: TimerProps) {
  const t = useT();
  const running = runningSince !== null;
  const now = useSyncExternalStore(
    running ? subscribeToSeconds : noSubscription,
    running ? secondsSnapshot : zeroSnapshot,
  );

  const text = formatDuration(totalElapsed(elapsedMs, runningSince, now));

  return (
    <span
      role="timer"
      aria-label={t('board.elapsedTime', { time: text })}
      className={cx(
        'inline-flex items-baseline tabular-nums',
        size === 'md' ? 'digit text-xl text-ink' : 'text-sm font-medium text-ink-soft',
        className,
      )}
    >
      {text}
    </span>
  );
}
