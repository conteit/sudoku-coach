import type { ReactNode } from 'react';
import { useT } from '../i18n/locale';
import { cx } from '../ui/primitives/cx';
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

/*
 * Both asides, at every wide tier: a box of their own to overflow inside, and
 * a position that survives the page scrolling under them.
 *
 * `sticky top-4` rather than a fixed row height, because the page still has
 * to scroll when the board and keypad genuinely do not fit — a 40rem board
 * plus its keypad is taller than a 720px laptop, and clipping that would hide
 * the controls rather than the commentary. This way the page scrolls for the
 * board alone, and the columns come along instead of sliding off.
 *
 * `5rem` off the viewport is the 4rem the sticky offset leaves above plus a
 * rem below, so a stuck column never runs its own bottom edge past the fold —
 * the thing `play.spec.ts` measures for real.
 */
const COLUMN_SCROLL =
  'sticky top-4 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain';

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
       * `compact:max-w-none` is what lets the row actually be a row: the
       * 576px cap below is a *reading* width, right for a stacked column and
       * wrong for a screen whose width is the whole point. Measured with the
       * cap still on, the board and keypad divided 576px on an 852px screen
       * and left 276 of it empty.
       *
       * `max-w-xl roomy:max-w-[40rem]`, not a bare `max-w-[40rem]`: below 640
       * the `roomy:` rule never applies, so the phone keeps the 576px column it
       * shipped with — raising the cap there would widen a layout that was
       * already signed off. Above 640 (still one stacked column — the tablet
       * has no room for a second) the same column gets to use more of the
       * width it actually has.
       */
      <div className="relative mx-auto flex h-dvh w-full max-w-xl flex-col overflow-hidden compact:max-w-none compact:flex-row roomy:h-auto roomy:min-h-dvh roomy:max-w-[40rem] roomy:overflow-visible">
        {header}
        {/* Side by side once the screen is wide and short — a phone held
            sideways. Stacked, the board would have to fit the height left
            after a 214px keypad, which at 393px tall is about 110px: nine
            cells at twelve pixels each, every one of them "visible" and none
            of them usable. In a row the board is bound by height instead and
            comes out near the size it has in portrait, with the keypad in the
            width that rotating just freed.

            Only the direction changes. The board slot is already
            `flex-1 items-center` with an `aspect-square h-full` inside, so it
            stays square and height-bound in a row without being told again;
            the keypad takes what is left, capped so its keys do not stretch
            into a row of dinner plates.

            `compact:pt-2`, never `py-2`: `padding-block` would set the bottom
            too and override the safe-area inset on the line above, which is
            the whole of #141 undone on the axis where landscape needs it
            most. Top padding only; the bottom stays the hardware's.

            No `items-center` on the row, and that is not an oversight: it
            collapses the board to nothing. Centring makes each item shrink to
            its content height, the board slot then has no height of its own,
            and the `h-full` inside it resolves to zero — measured at 4px
            square. The row has to stretch so the board has a height to be
            square against; the keypad centres itself instead. */}
        {/* The bottom padding is the safe-area inset, not a fixed 2 — the
            keypad is the last thing in this column, so it is the thing that
            lands in the phone's rounded corner and behind its home indicator.
            `viewport-fit=cover` (index.html) is what puts it there: the layout
            viewport runs under the hardware, and `100dvh` includes the part
            the player cannot comfortably reach. In a browser the address bar
            happened to occupy that strip, which is why this was invisible
            until the app was installed. `max()` rather than an addition, the
            same idiom `Sheet.tsx` uses: on a device with no inset nothing
            changes. */}
        <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] compact:min-w-0 compact:flex-row compact:gap-3 compact:pt-2 compact:pl-[max(0.75rem,env(safe-area-inset-left))]">
          {board}
          {/* `contents` everywhere but compact, so the stacked layout is the
              one it always was — this wrapper exists only to give the keypad
              a width to be bound by in a row. */}
          <div className="contents compact:block compact:min-w-0 compact:flex-1 compact:max-w-[24rem] compact:self-center">
            {keypad}
          </div>
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
        <div
          data-testid="coach-column"
          /* Its own scroller, and it sticks. Two things follow from that,
             both of them Paolo's: a long hint scrolls *inside* this column
             instead of growing the page and pushing the board out of view,
             and when the page does scroll — which it now only does because
             the board and keypad genuinely do not fit — the column stays
             where it was rather than sliding away from a board the player is
             still looking at.

             `overscroll-contain` is what makes "without moving the grid" true
             on a trackpad: without it, a flick that reaches the end of this
             column keeps going and takes the page with it.

             The width tokens are untouched, and have to be: invariant 9's
             canary reads them, and `sticky` keeps the element in flow, so
             nothing here changes what the board is allowed to be. */
          className={cx(COLUMN_SCROLL, 'w-[22rem] min-w-0 shrink-0')}
        >
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
            // Same scroller and the same stickiness as the coach column —
            // see `COLUMN_SCROLL`. The cap is sized off the viewport alone,
            // never off `main` or the coach column: those two have their own
            // height budgets (the board's aspect ratio, the coach bar's
            // content), and reading either back into this element would make
            // the lesson column's box a function of siblings that have
            // nothing to do with it.
            className={cx(COLUMN_SCROLL, 'w-[26rem] min-w-0 shrink-0')}
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
