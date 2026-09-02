import type { ReactNode } from 'react';
import { useT } from '../i18n/locale';
import type { Tier } from './useViewportTier';

export interface GameLayoutProps {
  tier: Tier;
  header: ReactNode;
  board: ReactNode;
  keypad: ReactNode;
  coach: ReactNode;
  /**
   * The lesson column: what it shows, and what it is called.
   *
   * One prop rather than two, because the pair has to agree and nothing but
   * convention was making it. `title` is what the column announces when it
   * swaps — one phrase, a technique's name or the index's own title — and it
   * is carried alongside the content rather than read back out of it: see the
   * live region below for why the announcement must not be the content.
   *
   * A caller building the two separately could hand over a lesson titled by
   * the index; here the title cannot be updated without touching the body it
   * describes.
   */
  lesson: { title: string; body: ReactNode };
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
export function GameLayout({
  tier,
  header,
  board,
  keypad,
  coach,
  lesson,
}: GameLayoutProps) {
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
      {/* `gap-6`, where `SplitLayout` gaps at 8: this row is already over
          budget at 1024 — a 40rem board plus a 22rem coach column plus the
          page padding does not fit — so the gutter is width taken straight
          off the board, and invariant 9 is about the board's box. The two
          layouts differ because their rows are spending on different things,
          not by accident; `SplitLayout`'s comment carries the other half. */}
      <div className="flex flex-1 items-start justify-center gap-6 px-6 pb-6">
        <main className="flex w-full max-w-[40rem] flex-col gap-3">
          {board}
          {keypad}
        </main>
        {/* `w-[..] shrink-0 min-w-0`, all three: invariant 9 says nothing that
            comes and goes during play may resize the board, and a sidebar
            that grows when a hint arrives — or when the technique index
            becomes a lesson — resizes the board just as surely as a bar that
            appears above it on a phone. `w-*` alone would still stretch under
            `flex-1`; `shrink-0` alone still leaves `min-width: auto` in
            place, which floors a flex item at its min-content width — one
            unbreakable string (a long technique name, a cell reference, a
            future locale's compound word) would then push the column wider
            than its declared width and steal the difference from `main`.
            `min-w-0` is what makes the width a property of the tier alone
            rather than of what the coach happens to be saying.

            A plain `div`, not an `aside`: `CoachPanel` already renders its
            own named `region` landmark ("Coach") inside `coach` — wrapping
            it in a second, unlabelled `complementary` landmark would give a
            screen-reader user two "Coach" entries in the landmark list, the
            outer one with no name to tell it apart from the lesson column
            beside it. */}
        <div data-testid="coach-column" className="w-[22rem] min-w-0 shrink-0">
          {coach}
        </div>
        {tier === 'desktop' ? (
          // Unlike the coach column, nothing inside `lesson` names its own
          // landmark — `TechniqueIndex` and `LessonBody` are both bare
          // `<section>`s with no accessible name of their own — so this one
          // keeps the `aside` and gets an explicit label instead of losing
          // the landmark altogether.
          <aside
            data-testid="lesson-column"
            aria-label={t('game.lessonAria')}
            // No `tabIndex` of its own. It carried one while neither of its
            // states had a focusable descendant — static index rows, and a
            // lesson whose only grid is an illustration `Example` keeps out
            // of the tab order — which left a keyboard user unable to reach
            // a scrolled column. Both states are reachable now: the index is
            // fourteen buttons, and every lesson shown here carries its way
            // back. A tab stop on the container as well would be a second
            // stop that lands on the landmark rather than on anything in it.
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
            className="max-h-[calc(100dvh-6rem)] w-[26rem] min-w-0 shrink-0 overflow-y-auto"
          >
            {/* Announce the *change*, not the content. The column must not
                swap silently — a player who has just paid for rung 2 should
                hear that the sidebar answered — but `aria-live` on the aside
                itself would, with the default `aria-relevant`, mark the whole
                incoming subtree as an addition: title, one-liner, mastery
                chip, both prose sections, the figcaption, and `Example`'s
                81-cell grid, every cell of which carries an `aria-label` like
                "r3c4, empty, notes 1, 4, 9". Several hundred words, read at a
                player mid-move, in both directions of the swap. This span is
                the whole live region instead: it is never itself replaced —
                it is a sibling of `{lesson}`, not part of it — so only its
                text mutates, and the mutation is one short phrase. The prose
                stays where a screen-reader user can go and read it when they
                choose to. */}
            <span className="sr-only" aria-live="polite">
              {t('game.lessonAnnounce', { title: lesson.title })}
            </span>
            {lesson.body}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
