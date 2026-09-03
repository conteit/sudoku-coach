/**
 * The landing page's puzzle: one a day, the same one for everybody, and no
 * backend to serve it.
 *
 * The generator has been seedable since it was written — `seededRng`, and a
 * `seed` on the worker protocol, both there so a bug report could be replayed
 * — which means "today's puzzle" is a pure function of today's date. Nobody
 * has to store it, ship it, or fetch it.
 */

/** The day, in the visitor's own timezone: a puzzle that changes at midnight. */
export function dayKey(now: Date): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A seed from that day.
 *
 * FNV-1a: small, stable, and dependency-free. What matters is not its
 * statistical quality — the generator has its own PRNG downstream — but that
 * the same date always produces the same number, on every device, forever.
 */
export function seedForDay(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export const seedForDate = (now: Date): number => seedForDay(dayKey(now));
