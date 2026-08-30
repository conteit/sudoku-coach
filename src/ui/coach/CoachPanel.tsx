/**
 * The coach surface (R7, R8).
 *
 * The disclosure ladder is drawn, not implied. Four rungs, named for what each
 * one gives up, filled to the level the player has taken — so asking for more
 * is a visible choice with a visible cost, and stopping early is the obvious
 * thing to do. That is the whole product in one control, which is why it gets
 * the panel's only piece of colour.
 *
 * Strictly presentational: it takes a `Hint`, calls `onEscalate`, and renders
 * whatever the coach already decided to say. It never derives a rung's text
 * itself, and it will not name the technique below level 2 — the level's own
 * rule, honoured by the view as well as by the renderer.
 */

import type { CellIndex } from '../../engine/types';
import type { CandidateReview, Hint } from '../../coach/types';
import type { DisclosureLevel } from '../../state/types';
import { cellName } from '../../engine/board';
import { Button } from '../primitives/Button';
import { AlertIcon, CheckIcon, ChevronDownIcon } from '../primitives/icons';
import { cx } from '../primitives/cx';

/** What each rung of the ladder costs the player, in their words. */
const RUNGS: { level: DisclosureLevel; name: string; gives: string; ask: string }[] = [
  { level: 1, name: 'Region', gives: 'Where to look', ask: 'Where should I look?' },
  { level: 2, name: 'Technique', gives: 'What pattern it is', ask: 'Name the technique' },
  { level: 3, name: 'Cells', gives: 'Exactly which cells', ask: 'Show me the cells' },
  { level: 4, name: 'Proof', gives: 'The full argument', ask: 'Walk me through it' },
];

const titleCase = (id: string) =>
  id.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase());

export interface CoachPanelProps {
  /** The current hint, or null before the player has asked for anything. */
  hint: Hint | null;
  /** Localized technique name from the lesson library; falls back to the id. */
  techniqueLabel?: string;
  /** Ask for the first rung. */
  onAsk: () => void;
  /** Take one more rung of the ladder. */
  onEscalate: () => void;
  /** Result of the pencil-mark check, when the player has run one (R8). */
  review?: CandidateReview | null;
  onReviewCandidates?: () => void;
  /** Hover/focus on an issue asks the board to spotlight its witnesses. */
  onSpotlight?: (cells: CellIndex[]) => void;
  /** The player asked and the board yielded nothing a technique can crack. */
  exhausted?: boolean;
  className?: string;
}

function Ladder({ level }: { level: DisclosureLevel }) {
  const reached = RUNGS.find((rung) => rung.level === level);
  return (
    <>
      <ol className="flex gap-1.5" aria-label={`Disclosure level ${level} of 4`}>
        {RUNGS.map((rung) => {
          const taken = level >= rung.level;
          const here = level === rung.level;
          return (
            <li key={rung.level} className="flex-1">
              <span
                aria-hidden="true"
                className={cx(
                  'block h-[3px] transition-colors duration-150 ease-snap',
                  taken ? (here ? 'bg-coach' : 'bg-ink') : 'bg-rule',
                )}
              />
              <span
                className={cx(
                  'mt-1.5 block text-[0.625rem] font-semibold tracking-[0.1em] uppercase',
                  here ? 'text-coach' : taken ? 'text-ink-soft' : 'text-ink-faint',
                )}
              >
                {rung.name}
              </span>
              {/* Four captions do not fit a phone; the line below carries it there. */}
              <span className="mt-0.5 hidden text-[0.6875rem] leading-tight text-ink-faint sm:block">
                {rung.gives}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[0.6875rem] text-ink-faint sm:hidden">
        {reached ? `Level ${level} of 4 — ${reached.gives.toLowerCase()}` : 'Nothing taken yet'}
      </p>
    </>
  );
}

function IssueList({
  review,
  onSpotlight,
}: {
  review: CandidateReview;
  onSpotlight?: (cells: CellIndex[]) => void;
}) {
  if (review.issues.length === 0) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-match">
        <CheckIcon className="text-base" />
        All {review.checkedCells} cells checked — your notes are exactly right.
      </p>
    );
  }

  return (
    <>
      <p className="py-2.5 text-sm text-ink-soft">
        {review.issues.length} of {review.checkedCells} checked cells need a second look.{' '}
        <span className="text-ink-faint">Nothing has been changed for you.</span>
      </p>
      <ul className="divide-y divide-rule border-t border-rule">
        {review.issues.map((issue) => (
          <li key={`${issue.cell}-${issue.digit}-${issue.kind}`}>
            <button
              type="button"
              onMouseEnter={() => onSpotlight?.([issue.cell, ...issue.witness])}
              onFocus={() => onSpotlight?.([issue.cell, ...issue.witness])}
              onMouseLeave={() => onSpotlight?.([])}
              onBlur={() => onSpotlight?.([])}
              className="flex w-full items-start gap-3 py-2.5 text-left transition-colors duration-100 ease-snap hover:bg-paper-sunk"
            >
              <AlertIcon
                className={cx(
                  'mt-0.5 shrink-0 text-base',
                  issue.kind === 'invalid' ? 'text-danger' : 'text-coach',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-medium text-sm text-ink tabular-nums">
                    {cellName(issue.cell)}
                  </span>
                  <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
                    {issue.kind === 'invalid' ? `${issue.digit} can't be here` : `${issue.digit} is missing`}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-ink-soft">{issue.reason}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CoachPanel({
  hint,
  techniqueLabel,
  onAsk,
  onEscalate,
  review,
  onReviewCandidates,
  onSpotlight,
  exhausted = false,
  className,
}: CoachPanelProps) {
  const level = hint?.level ?? 0;
  const next = RUNGS.find((rung) => rung.level === level + 1);

  return (
    <section
      aria-label="Coach"
      className={cx('w-full border-t-2 border-ink bg-paper-raised', className)}
    >
      <div className="flex items-baseline justify-between gap-4 px-4 pt-3.5">
        <h2 className="text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
          Coach
        </h2>
        {/* The technique is a level-2 disclosure; the view honours that too. */}
        {hint && level >= 2 ? (
          <p className="font-display truncate text-base text-ink">
            {techniqueLabel ?? titleCase(hint.technique)}
          </p>
        ) : null}
      </div>

      <div className="px-4 pt-3">
        <Ladder level={level} />
      </div>

      <div aria-live="polite" className="px-4 pt-4">
        {hint ? (
          <p className="text-[0.9375rem] leading-relaxed text-ink">{hint.text}</p>
        ) : exhausted ? (
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            Nothing on this board yields to a technique yet. Fill in what you can and come back.
          </p>
        ) : (
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            Stuck? Ask, and you get the smallest useful nudge first. You decide how far down the
            ladder to go — the digit is never one of the rungs.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pt-4 pb-4">
        {hint === null ? (
          <Button variant="coach" size="lg" onClick={onAsk}>
            Where should I look?
          </Button>
        ) : next && hint.canEscalate ? (
          <Button
            variant="coach"
            size="lg"
            icon={<ChevronDownIcon />}
            onClick={onEscalate}
            aria-label={`${next.ask} — disclosure level ${next.level} of 4`}
          >
            {next.ask}
          </Button>
        ) : (
          <p className="py-2 text-sm text-ink-soft">
            That is the whole argument. The digit is yours to place.
          </p>
        )}
        {onReviewCandidates ? (
          <Button variant="ghost" size="lg" onClick={onReviewCandidates}>
            Check my notes
          </Button>
        ) : null}
      </div>

      {review ? (
        <div className="border-t border-rule px-4 pb-4">
          <h3 className="pt-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
            Note check
          </h3>
          <IssueList review={review} onSpotlight={onSpotlight} />
        </div>
      ) : null}
    </section>
  );
}
