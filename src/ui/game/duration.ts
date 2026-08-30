/** m:ss, widening to h:mm:ss only once it has to. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Total elapsed time for a game, from the two persisted fields: `elapsedMs` is
 * what is banked and `runningSince` is the wall clock the current run started
 * at. Kept in one place so the list and the in-game header can never disagree.
 */
export function totalElapsed(elapsedMs: number, runningSince: number | null, now: number): number {
  return elapsedMs + (runningSince === null ? 0 : Math.max(0, now - runningSince));
}
