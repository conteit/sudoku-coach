import { useEffect, useState } from 'react';

/**
 * Which of the four layouts the viewport is in.
 *
 * The queries mirror the Tailwind breakpoints the CSS uses (`sm`, `lg`, `2xl`)
 * rather than picking their own numbers: when JS and CSS disagree about which
 * tier is current, the layout and the behaviour gated on it come apart, and
 * that is exactly how the coach sheet once trapped focus on a desktop panel
 * that was not a modal. `md` and `xl` are deliberately unused — a lesson is
 * prose, and a third column narrower than this reads worse than no column.
 */
export type Tier = 'phone' | 'tablet' | 'laptop' | 'desktop';

const PHONE = '(max-width: 639.98px)';
const LAPTOP = '(min-width: 1024px)';
const DESKTOP = '(min-width: 1536px)';

function read(): Tier {
  if (window.matchMedia(DESKTOP).matches) return 'desktop';
  if (window.matchMedia(LAPTOP).matches) return 'laptop';
  if (window.matchMedia(PHONE).matches) return 'phone';
  return 'tablet';
}

/**
 * Read once for the first paint (so it's right immediately, not a frame
 * late) and kept live for anyone who resizes or rotates mid-game — a
 * one-shot read at mount was rejected in earlier work because the viewport
 * can change under a running game.
 */
export function useViewportTier(): Tier {
  const [tier, setTier] = useState<Tier>(read);
  useEffect(() => {
    const queries = [PHONE, LAPTOP, DESKTOP].map((q) => window.matchMedia(q));
    const sync = () => setTier(read());
    for (const mql of queries) mql.addEventListener('change', sync);
    return () => {
      for (const mql of queries) mql.removeEventListener('change', sync);
    };
  }, []);
  return tier;
}
