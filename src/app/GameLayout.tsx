import type { ReactNode } from 'react';
import { useT } from '../i18n/locale';
import type { Tier } from './useViewportTier';

export interface GameLayoutProps {
  tier: Tier;
  header: ReactNode;
  board: ReactNode;
  keypad: ReactNode;
  coach: ReactNode;
  lesson?: ReactNode;
}

/**
 * Which regions exist at this width, and how they sit.
 *
 * Split out of `GameView`, not because that file got shorter — it grew, by
 * design, since the brief kept every hook and handler exactly where it was —
 * but because composing four tiers from one set of regions needed a function
 * of its own to do the composing. The rule this enforces is invariant 9:
 * whatever the tier, nothing that comes and goes during play may change the
 * board's box. Each column's width is a property of the tier, never of what
 * the coach happens to be saying.
 */
export function GameLayout({ tier, header, board, keypad, coach, lesson }: GameLayoutProps) {
  const t = useT();

  if (tier === 'phone' || tier === 'tablet') {
    return (
      /*
       * One screen, no page scroll, up to the point the phone cap gives way.
       * A phone has to show the board, the keypad and a way to reach the
       * coach at once — scrolling between them turns every hint into a hunt —
       * so the board is the thing that gives: it takes whatever height the
       * chrome leaves and stays square.
       *
       * `max-w-xl sm:max-w-[40rem]`, not a bare `max-w-[40rem]`: below 640
       * the `sm:` rule never applies, so the phone keeps the 576px column it
       * shipped with — raising the cap there would widen a layout that was
       * already signed off. Above 640 (still one stacked column — the tablet
       * has no room for a second) the same column gets to use more of the
       * width it actually has.
       */
      <div className="relative mx-auto flex h-dvh w-full max-w-xl flex-col overflow-hidden sm:h-auto sm:min-h-dvh sm:max-w-[40rem] sm:overflow-visible">
        {header}
        <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-2">
          {board}
          {keypad}
        </main>
        {coach}
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[96rem] flex-col">
      {header}
      {/* The board comes before the coach in the DOM even though it sits
          visually between the two asides on a laptop: a screen-reader user
          should meet the puzzle before the commentary about it. */}
      <div className="flex flex-1 items-start justify-center gap-6 px-6 pb-6">
        <main className="flex w-full max-w-[40rem] flex-col gap-3">
          {board}
          {keypad}
        </main>
        {/* Fixed width, not `flex-1` or `min-w-*`: invariant 9 says nothing
            that comes and goes during play may resize the board, and a
            sidebar that grows when a hint arrives — or when the technique
            index becomes a lesson — resizes the board just as surely as a
            bar that appears above it on a phone. Each aside's width is a
            property of the tier alone.

            A plain `div`, not an `aside`: `CoachPanel` already renders its
            own named `region` landmark ("Coach") inside `coach` — wrapping
            it in a second, unlabelled `complementary` landmark would give a
            screen-reader user two "Coach" entries in the landmark list, the
            outer one with no name to tell it apart from the lesson column
            beside it. */}
        <div data-testid="coach-column" className="w-[22rem] shrink-0">
          {coach}
        </div>
        {tier === 'desktop' && lesson ? (
          // Unlike the coach column, nothing inside `lesson` names its own
          // landmark — `TechniqueIndex` and `LessonBody` are both bare
          // `<section>`s with no accessible name of their own — so this one
          // keeps the `aside` and gets an explicit label instead of losing
          // the landmark altogether.
          <aside
            data-testid="lesson-column"
            aria-label={t('game.lessonAria')}
            // The hint text itself has its own `aria-live="polite"` region
            // in `CoachPanel` (the sentence a level-1 or higher ask
            // produces); this column's entire job is to reflect the same
            // disclosure ladder one step further along — from the
            // technique index to a named lesson — so a screen-reader user
            // who has just paid for a rung deserves the same announcement
            // here, not silence while the sidebar quietly swaps under them.
            aria-live="polite"
            // `overflow-y-auto` does nothing on its own: the row is
            // `items-start` with no height constraint on this aside, so
            // there is no box for it to overflow *out of* — a tall lesson
            // just grows the row, and the page scrolls instead of the
            // column. The cap is sized off the viewport alone, not off
            // `main` or the coach column: those two already have their own
            // fixed-height budgets (the board's aspect ratio, the coach
            // bar's own content), and reading either one back into this
            // element's height would make the lesson column's box a
            // function of siblings that have nothing to do with it. `6rem`
            // is the header's own budget (its icon buttons plus `pt-3
            // pb-2`) plus this row's `pb-6` — generous rather than exact,
            // since a pixel-perfect match buys nothing a scrollbar doesn't
            // already cover, and a comment can't stay honest against a
            // header that is free to change height later.
            className="max-h-[calc(100dvh-6rem)] w-[26rem] shrink-0 overflow-y-auto"
          >
            {lesson}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
