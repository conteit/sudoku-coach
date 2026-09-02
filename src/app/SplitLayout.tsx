import type { ReactNode } from 'react';

export interface SplitLayoutProps {
  left: ReactNode;
  right: ReactNode;
}

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
 * The library and Learn arrived at the same geometry — a narrow pane beside a
 * wider one — so it is written once. It carries no landmarks on purpose: the
 * two screens do not agree about what the panes *are*. Learn's left pane is
 * navigation and its right pane is the document; the library's left pane is
 * the main content and its right pane is complementary. Baking either reading
 * in here would ship the other screen a lie, so each supplies its own element.
 *
 * Deliberately not `GameLayout`: that one arranges three regions under the
 * invariant that nothing may resize the board mid-play. Different problem,
 * different failure mode, and one component with two unrelated reasons to
 * change is how both end up wrong.
 */
export function SplitLayout({ left, right }: SplitLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-[96rem] px-6 pt-6 pb-12">
      <div className="flex items-start gap-8">
        {/* All three of `w-*`, `shrink-0` and `min-w-0`: `w-*` alone stretches
            under a flex parent, and `shrink-0` alone leaves `min-width: auto`,
            which floors a flex item at its min-content width — one long
            technique name would widen this pane and take the difference from
            the pane beside it. Choosing a lesson must not move the list you
            chose it from. */}
        <div data-testid="left-pane" className="w-[20rem] min-w-0 shrink-0">
          {left}
        </div>
        <div data-testid="right-pane" className="min-w-0 flex-1">
          {right}
        </div>
      </div>
    </div>
  );
}
