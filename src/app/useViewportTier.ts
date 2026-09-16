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
/**
 * A phone held sideways: wide enough to have escaped `phone` on width alone,
 * and far too short to be treated as a tablet.
 *
 * It reports `phone` because everything gated on that tier is right for it —
 * the coach is a sheet over the board rather than a static bar beside it, and
 * the header keeps the button that opens it. What is *not* the same is the
 * arrangement, and that is CSS's half: `compact:` in `index.css` mirrors this
 * query exactly and turns the board and keypad into a row.
 *
 * Capped below the laptop breakpoint on purpose. A short, wide *desktop*
 * window has width to spare for the coach column it already gets, and pulling
 * it into the phone layout would be a bigger claim than this fixes.
 */
const COMPACT = '(min-width: 640px) and (max-width: 1023.98px) and (max-height: 480px)';
const LAPTOP = '(min-width: 1024px)';
const DESKTOP = '(min-width: 1536px)';

function read(): Tier {
  if (window.matchMedia(DESKTOP).matches) return 'desktop';
  if (window.matchMedia(LAPTOP).matches) return 'laptop';
  if (window.matchMedia(PHONE).matches || window.matchMedia(COMPACT).matches) return 'phone';
  return 'tablet';
}

/**
 * Whether the game screen is in its wide-and-short arrangement.
 *
 * `useViewportTier` folds this case into `phone`, which is right for almost
 * everything gated on the tier — but not for modality. In portrait the coach
 * sheet covers the board, so it is a modal and behaves like one. In `compact`
 * it covers only the keypad's column and the board stays visible beside it,
 * which is the whole point of the arrangement; a scrim over the board, a
 * focus trap and `aria-modal` would each contradict it.
 *
 * Same query string as `compact:` in `index.css`, for the reason stated
 * above `COMPACT`: two readings of one layout that can drift are two bugs
 * waiting.
 */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT).matches);
  useEffect(() => {
    const mql = window.matchMedia(COMPACT);
    const sync = () => setCompact(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);
  return compact;
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
    const queries = [PHONE, COMPACT, LAPTOP, DESKTOP].map((q) => window.matchMedia(q));
    const sync = () => setTier(read());
    // Closes the gap between the lazy `useState(read)` initializer (evaluated
    // at render, before these listeners exist) and the subscription below
    // (wired up after commit): a viewport change in between would otherwise
    // be missed entirely rather than merely delayed.
    sync();
    for (const mql of queries) mql.addEventListener('change', sync);
    return () => {
      for (const mql of queries) mql.removeEventListener('change', sync);
    };
  }, []);
  return tier;
}
