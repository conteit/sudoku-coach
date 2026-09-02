import type { ReactNode } from 'react';
import type { Tier } from './useViewportTier';

export interface SplitLayoutProps {
  tier: Tier;
  left: ReactNode;
  right: ReactNode;
}

/**
 * Two panes side by side, above 1024; one column below it.
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
export function SplitLayout({ tier, left, right }: SplitLayoutProps) {
  if (tier === 'phone' || tier === 'tablet') {
    // `max-w-xl sm:max-w-[48rem]`, not a bare raise: below 640 the `sm:` rule
    // never applies, so the phone keeps the 576px column it shipped with —
    // widening a signed-off layout is not what this change is for.
    return <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-12 sm:max-w-[48rem]">{left}{right}</div>;
  }

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
