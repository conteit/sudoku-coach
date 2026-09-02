import type { ReactNode } from 'react';

export interface SplitLayoutProps {
  /**
   * Which pane gets the fixed width; the other one takes the rest.
   *
   * Two props rather than a `narrow`/`wide` pair because the two questions
   * are independent: `left`/`right` are DOM order — what a screen reader
   * reaches first, and what the callers' order tests pin — while `narrow`
   * is geometry. Naming the panes by their width would force a screen that
   * wants its main content wide *and* first to choose which of the two it
   * gives up. The library wants both, so it passes `narrow="right"`.
   *
   * Required, with no default: a screen that forgets to say would inherit
   * whichever geometry the other screen happened to want, which is the same
   * silent-inheritance failure the deleted `tier` prop could cause.
   */
  narrow: 'left' | 'right';
  left: ReactNode;
  right: ReactNode;
}

/* 20rem, and the row below gaps at 8 — both looser than `GameLayout`'s 22rem
   column and gap-6, which is the family's other wide layout. The difference is
   what each row is spending its width on rather than an oversight.

   `GameLayout` is over budget at its narrowest wide tier: a 40rem board beside
   a 22rem coach column already exceeds 1024 once the page padding is counted,
   so every pixel in that gutter comes out of the board, and the board is the
   thing invariant 9 exists to protect. Here nothing is squeezed — two panes
   inside 96rem, the wide one `flex-1` — so the gutter can be the 32px that
   actually reads as two surfaces rather than one wrapped column.

   The widths differ for the same kind of reason: 22rem holds the coach's
   controls (a four-rung ladder, buttons, an eraser), 20rem holds a list of
   technique names and a mastery chip. A reading column is not a control panel
   and does not need the control panel's width. */

/* All three of `w-*`, `shrink-0` and `min-w-0`: `w-*` alone stretches under a
   flex parent, and `shrink-0` alone leaves `min-width: auto`, which floors a
   flex item at its min-content width — one long technique name would widen
   this pane and take the difference from the pane beside it. Choosing a
   lesson must not move the list you chose it from. */
const NARROW = 'w-[20rem] min-w-0 shrink-0';
const WIDE = 'min-w-0 flex-1';

/**
 * The wide split: two panes side by side, above 1024.
 *
 * It has no narrow branch on purpose. Both callers decide at the tier before
 * they get here — below 1024 each returns its own signed-off single column,
 * with its own padding — so a stacked branch here would be unreachable code
 * carrying one screen's geometry, which the *next* screen would silently
 * inherit by passing a narrow tier. Owning only the wide case means the
 * component cannot be wrong about a case it does not handle.
 *
 * The library and Learn arrived at the same shape — a narrow pane beside a
 * wider one — but not at the same *side*: Learn's index is narrow and its
 * lesson wide, the library's games are wide and its progress narrow. Hence
 * `narrow`.
 *
 * It carries no landmarks on purpose: the two screens do not agree about what
 * the panes *are*. Learn's left pane is navigation and its right pane is the
 * document; the library's left pane is the main content and its right pane is
 * complementary. Baking either reading in here would ship the other screen a
 * lie, so each supplies its own element.
 *
 * Deliberately not `GameLayout`: that one arranges three regions under the
 * invariant that nothing may resize the board mid-play. Different problem,
 * different failure mode, and one component with two unrelated reasons to
 * change is how both end up wrong.
 */
export function SplitLayout({ narrow, left, right }: SplitLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-[96rem] px-6 pt-6 pb-12">
      <div className="flex items-start gap-8">
        <div data-testid="left-pane" className={narrow === 'left' ? NARROW : WIDE}>
          {left}
        </div>
        <div data-testid="right-pane" className={narrow === 'right' ? NARROW : WIDE}>
          {right}
        </div>
      </div>
    </div>
  );
}
