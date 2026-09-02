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

import type { CellIndex, TechniqueId } from '../../engine/types';
import type { CandidateReview, Hint, TeachableTrigger } from '../../coach/types';
import type { DisclosureLevel } from '../../state/types';
import { cellName } from '../../engine/board';
import { Button } from '../primitives/Button';
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  EraserIcon,
  TargetIcon,
} from '../primitives/icons';
import { IconButton } from '../primitives/IconButton';
import { cx } from '../primitives/cx';
import type { MessageKey } from '../../i18n/types';
import { useT } from '../../i18n/locale';

/**
 * What each rung of the ladder costs the player, in their words. The copy is
 * the dictionary's; only the shape of the ladder lives here.
 */
const RUNGS = [
  { level: 1, name: 'coach.rung1.name', gives: 'coach.rung1.gives', ask: 'coach.rung1.ask' },
  { level: 2, name: 'coach.rung2.name', gives: 'coach.rung2.gives', ask: 'coach.rung2.ask' },
  { level: 3, name: 'coach.rung3.name', gives: 'coach.rung3.gives', ask: 'coach.rung3.ask' },
  { level: 4, name: 'coach.rung4.name', gives: 'coach.rung4.gives', ask: 'coach.rung4.ask' },
] as const satisfies readonly { level: DisclosureLevel; name: MessageKey; gives: MessageKey; ask: MessageKey }[];

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
  /** A challenge in flight: the technique named, and whether it has been found. */
  drill?: { technique: TechniqueId; solved: boolean; gone: boolean } | null;
  /** Offered while there is something on the board to be challenged about. */
  onDrill?: () => void;
  onDismissDrill?: () => void;
  /**
   * Opens the full lesson for the technique on screen. Offered only once the
   * technique has been named — below rung 2, the link itself would disclose
   * what the rung is holding back. A live drill names one too: it is announced
   * by `coach.drillActive` right here in this panel, and `useCoachSession`
   * logs the level-2 exchange before it sets the challenge.
   */
  onLearn?: (technique: TechniqueId) => void;
  /**
   * Puts the panel back to its resting bar. Offered only while it is showing
   * something, and only where it overlays the board's controls.
   */
  onCollapse?: () => void;
  /**
   * The most urgent unprompted moment, surfaced inside the sheet rather than
   * as a surface of its own — the sheet is the only place left that can show
   * it without taking board height to do it.
   */
  nudge?: TeachableTrigger | null;
  onDismissNudge?: () => void;
  /** Notes a placement has killed since they were written; drives the eraser. */
  staleCount?: number;
  onClearStale?: () => void;
  className?: string;
}

function Ladder({ level }: { level: DisclosureLevel }) {
  const t = useT();
  const reached = RUNGS.find((rung) => rung.level === level);
  return (
    <>
      <ol className="flex gap-1.5" aria-label={t('coach.ladderAria', { level })}>
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
                {t(rung.name)}
              </span>
              {/* Four captions do not fit a phone; the line below carries it there. */}
              <span className="mt-0.5 hidden text-[0.6875rem] leading-tight text-ink-faint sm:block">
                {t(rung.gives)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[0.6875rem] text-ink-faint sm:hidden">
        {reached
          ? t('coach.ladderReached', { level, gives: t(reached.gives).toLocaleLowerCase() })
          : t('coach.ladderNone')}
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
  const t = useT();
  // "All 0 cells checked — your notes are exactly right" is true and useless:
  // a player with no notes was told they had done something perfectly.
  if (review.checkedCells === 0) {
    return <p className="py-3 text-sm text-ink-soft">{t('coach.marksNone')}</p>;
  }

  if (review.issues.length === 0) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-match">
        <CheckIcon className="text-base" />
        {t('coach.marksAllClean', { count: review.checkedCells })}
      </p>
    );
  }

  return (
    <>
      <p className="py-2.5 text-sm text-ink-soft">
        {t('coach.marksNeedLook', {
          count: review.issues.length,
          total: review.checkedCells,
        })}{' '}
        <span className="text-ink-faint">{t('coach.marksUnchanged')}</span>
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
                    {issue.kind === 'invalid'
                      ? t('coach.tagInvalid', { digit: issue.digit })
                      : t('coach.tagMissing', { digit: issue.digit })}
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
  drill = null,
  onDrill,
  onDismissDrill,
  onLearn,
  onCollapse,
  nudge,
  onDismissNudge,
  staleCount,
  onClearStale,
  className,
}: CoachPanelProps) {
  const t = useT();
  const level = hint?.level ?? 0;
  const next = RUNGS.find((rung) => rung.level === level + 1);
  /*
   * Whether a technique is on the table by name, which is what the lesson
   * link is allowed to key off — the same rule the game screen's lesson
   * column uses to decide between the index and the lesson (`GameView`'s
   * `namedTechnique`). The two used to disagree: the column taught the
   * technique during a drill while this panel, which had just named it in
   * `coach.drillActive`, offered no way to read about it.
   */
  const namedTechnique: TechniqueId | null =
    hint && level >= 2 ? hint.technique : (drill?.technique ?? null);

  return (
    <section
      aria-label={t('coach.title')}
      className={cx('w-full border-t-2 border-ink bg-paper-raised', className)}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-2.5 empty:hidden sm:pt-3">
        {/* The panel is unmistakable without a caption, and on a phone the
            caption is a line of board. The region keeps its accessible name. */}
        <h2 className="hidden text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase sm:block">
          {t('coach.title')}
        </h2>
        {/* The technique is a level-2 disclosure; the view honours that too. */}
        {hint && level >= 2 ? (
          <p className="font-display min-w-0 flex-1 truncate text-right text-base text-ink">
            {techniqueLabel ?? titleCase(hint.technique)}
          </p>
        ) : null}
        {onCollapse ? (
          <IconButton
            size="sm"
            label={t('action.close')}
            icon={<CloseIcon />}
            className="-my-1 shrink-0"
            onClick={onCollapse}
          />
        ) : null}
      </div>

      {/* Outranks even the ladder: a nudge is the coach noticing something on
          its own, and a player who opened the sheet to see it should not have
          to scroll past the resting invitation first. No "show me where" here
          — the sheet that carries this nudge is covering the board it would
          point at. */}
      {nudge ? (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-cell border border-coach/35 bg-coach-wash px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-coach">
            {nudge.kind === 'contradiction'
              ? t('coach.nudge.contradiction')
              : nudge.kind === 'stale_marks'
                ? t('coach.nudge.staleMarks')
                : t('coach.nudge.stuck')}
          </p>
          <Button variant="ghost" onClick={onDismissNudge}>
            {t('action.dismiss')}
          </Button>
        </div>
      ) : null}

      {/* The ladder is the product in one control, so it stays wherever there is
          room for it. Before the player has taken a rung it is a diagram of
          nothing, and on a phone that diagram costs a sixth of the board. */}
      <div className={cx('px-4 pt-3', level === 0 && 'hidden sm:block')}>
        <Ladder level={level} />
      </div>

      {/* A challenge outranks the resting copy: it is the thing the player is
          currently doing, and its result is what they are waiting for. */}
      {drill ? (
        <div aria-live="polite" className="px-4 pt-3 empty:pt-0">
          <p
            className={cx(
              'text-[0.9375rem] leading-relaxed',
              drill.solved ? 'text-match' : drill.gone ? 'text-ink-soft' : 'text-coach',
            )}
          >
            {drill.solved
              ? t('coach.drillSolved', { technique: techniqueLabel ?? titleCase(drill.technique) })
              : drill.gone
                ? t('coach.drillGone')
                : t('coach.drillActive', {
                    technique: techniqueLabel ?? titleCase(drill.technique),
                  })}
          </p>
        </div>
      ) : null}

      <div aria-live="polite" className="px-4 pt-3 empty:pt-0">
        {hint ? (
          <p className="text-[0.9375rem] leading-relaxed text-ink">{hint.text}</p>
        ) : /* A live challenge has already said what the panel is for; repeating
               the invitation to ask for a hint under it reads like two coaches
               talking over each other. */
        drill && !drill.solved && !drill.gone ? null : exhausted ? (
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            {t('coach.nothingFound')}
          </p>
        ) : (
          // Three lines of prose the player reads once. On a phone the same
          // space is board, and the same words are in Learn.
          <p className="hidden text-[0.9375rem] leading-relaxed text-ink-soft sm:block">
            {t('coach.idlePrompt')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-3">
        {drill && !drill.solved && !drill.gone ? (
          <Button variant="ghost" size="lg" onClick={onDismissDrill}>
            {t('action.dismiss')}
          </Button>
        ) : null}
        {hint === null ? (
          <Button variant="coach" size="lg" onClick={onAsk}>
            {t('coach.rung1.ask')}
          </Button>
        ) : next && hint.canEscalate ? (
          <Button
            variant="coach"
            size="lg"
            icon={<ChevronDownIcon />}
            onClick={onEscalate}
            aria-label={t('coach.escalateAria', { ask: t(next.ask), level: next.level })}
          >
            {t(next.ask)}
          </Button>
        ) : (
          <p className="py-2 text-sm text-ink-soft">{t('coach.done')}</p>
        )}
        {/* Resting, the coach's other two offers are glyphs: three sentences
            side by side wrap to three lines on a phone, and every line is a
            line of board. On a wide screen they are spelled out. */}
        {onDrill && drill === null && hint === null ? (
          <>
            <span className="sm:hidden">
              <IconButton size="sm" label={t('coach.drill')} icon={<TargetIcon />} onClick={onDrill} />
            </span>
            <span className="hidden sm:block">
              <Button variant="ghost" size="lg" onClick={onDrill}>
                {t('coach.drill')}
              </Button>
            </span>
          </>
        ) : null}
        {/* Spelled out at every width. Asking whether your notes are right is
            one of the two things the coach is for, and a player who cannot find
            it does not have it — which is exactly how it read as a glyph. */}
        {onReviewCandidates ? (
          <Button variant="ghost" size="lg" icon={<CheckIcon />} onClick={onReviewCandidates}>
            {t('action.checkMarks')}
          </Button>
        ) : null}
        {/* Lives here rather than as a standing row of its own: starting over
            and deleting are rare enough to earn a permanent line, and this is
            not that — it is offered exactly while there is something to clear. */}
        {onClearStale && staleCount ? (
          <Button variant="ghost" size="lg" icon={<EraserIcon />} onClick={onClearStale}>
            {staleCount === 1
              ? t('action.clearStaleOne')
              : t('action.clearStaleCount', { count: staleCount })}
          </Button>
        ) : null}
        {onLearn && namedTechnique !== null ? (
          <Button variant="ghost" size="lg" onClick={() => onLearn(namedTechnique)}>
            {t('coach.whatIsThis')}
          </Button>
        ) : null}
      </div>

      {review ? (
        <div className="border-t border-rule px-4 pb-4">
          <h3 className="pt-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
            {t('coach.notesHeading')}
          </h3>
          <IssueList review={review} onSpotlight={onSpotlight} />
        </div>
      ) : null}
    </section>
  );
}
