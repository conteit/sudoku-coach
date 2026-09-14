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

import type { CellIndex, Digit, TechniqueId } from '../../engine/types';
import type { Hint, TeachableTrigger } from '../../coach/types';
import type { ReviewProgress, TrackedIssue } from '../../coach/reviewProgress';
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

/**
 * The coach says two kinds of thing, and until now they looked identical.
 *
 * "There is something here" and "something you did is wrong" shared one amber
 * box, so a contradiction — a digit that cannot be right — arrived in exactly
 * the livery of an offer of help. Amber is this app's colour for *there is
 * something here for you*: the eraser with dead notes to clear, the armed
 * rewind, the sync button wanting a tap. It keeps the suggestions. A
 * correction takes the danger colour the note check already uses for an
 * impossible mark, so the two are not two shades of the same thing.
 *
 * The icon rides along because a difference carried by colour alone is no
 * difference at all to a player who cannot see it.
 */
type Tone = 'suggestion' | 'correction';

const toneText = (tone: Tone): string => (tone === 'correction' ? 'text-danger' : 'text-coach');

const toneBox = (tone: Tone): string =>
  tone === 'correction' ? 'border-danger/35 bg-danger-wash' : 'border-coach/35 bg-coach-wash';

function ToneIcon({ tone }: { tone: Tone }) {
  return tone === 'correction' ? (
    <span aria-hidden="true" className="shrink-0 leading-none">
      <AlertIcon />
    </span>
  ) : null;
}

export interface CoachPanelProps {
  /** The current hint, or null before the player has asked for anything. */
  hint: Hint | null;
  /** Localized technique name from the lesson library; falls back to the id. */
  techniqueLabel?: string;
  /** Ask for the first rung. */
  onAsk: () => void;
  /** Take one more rung of the ladder. */
  onEscalate: () => void;
  /**
   * The pencil-mark check (R8), aged against the board since it was run.
   *
   * A `ReviewProgress` rather than the raw report: the panel is a renderer and
   * has no business knowing about boards or candidates, which is the same
   * division `reviewProgress.ts` and `candidates.ts` have between them.
   */
  progress?: ReviewProgress | null;
  onReviewCandidates?: () => void;
  /** Hover/focus on an issue asks the board to spotlight its witnesses. */
  onSpotlight?: (cells: CellIndex[]) => void;
  /** The player asked and the board yielded nothing a technique can crack. */
  exhausted?: boolean;
  /**
   * Exhausted for a reason the player can fix: the note check found a
   * candidate missing that nothing rules out, so the marks cannot be trusted
   * and the coach will not read them. A correction, not a shrug.
   */
  notesBlocked?: boolean;
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
   * Sets the finding on screen aside and asks for the next one.
   *
   * Offered only while a hint is showing, because "another" is meaningless
   * without a *this* — and only then does the player know what they are
   * turning down.
   */
  onAnother?: () => void;
  /**
   * Takes the coach's advice off the screen — the hint, its spotlight, the
   * report — and leaves the board plain. "I'll take it from here."
   *
   * Distinct from `onAnother`, which is the only other exit a player had, and
   * which hands back a *different* finding painted on a *different* part of
   * the board. There was no way out of being coached that was not more
   * coaching, which is the wrong shape for an app whose whole claim is that
   * the coach is asked rather than endured.
   *
   * Also distinct from `onCollapse`, which on a phone only slides the sheet
   * down: the highlight stays up on purpose there, because looking at the
   * board is exactly what the player closed the sheet to do.
   */
  onDismissHint?: () => void;
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
  /**
   * Applies every issue the report is showing, in one undoable step.
   *
   * Offered only with issues on screen, and it fixes *those* — the report
   * already names each digit and the constraint that proves it, so this
   * discloses nothing the player has not just been told. It is the typing it
   * saves, which is the difference between this and the note-fill that was
   * removed in #53: that one wrote marks into cells nobody had asked about.
   */
  onFixNotes?: () => void;
  /** Notes a placement has killed since they were written; drives the eraser. */
  staleCount?: number;
  onClearStale?: () => void;
  /**
   * What a rewind has undone, newest first. Empty outside a rewind.
   *
   * Read after stepping rather than during it: on a phone this panel is a
   * sheet that covers the keypad the player is tapping. `redoStack` outlives
   * the rewind, so the path is still here when they open it.
   */
  rewindTrail?: readonly RewindStep[];
  /** The board is still unfinishable — a rewind in progress, not a record. */
  rewinding?: boolean;
  /**
   * Some cell on this board has no digit left that fits, so nothing the
   * catalog finds is worth acting on. The coach declines to teach rather than
   * spend a rung on a board the player has to repair first.
   *
   * This is the dead end itself, not the rewind phase. The two come apart: the
   * phase stays armed while any entry still contradicts the solution, and a
   * player who has stepped back out of the dead end has a board that is
   * perfectly good to teach on.
   */
  unfinishable?: boolean;
  className?: string;
}

/**
 * Declared here rather than imported from `app/rewind` — `ui/` is rendered by
 * `app/`, never the reverse, so the panel does not depend on the app layer.
 * Structurally identical to `app/rewind`'s own `RewindStep`; the one place
 * the two meet is `GameView` passing `rewindTrail(game.redoStack)` into this
 * prop, where `tsc` catches any drift between them.
 *
 * A discriminated union, not one shape with an optional `digit`: `placed`,
 * `noted` and `unnoted` are each about one digit in one cell and always carry
 * one, while `cleared`, `notedAll` and `unnotedAll` act on the whole cell at
 * once — a value removed, every note written, every note wiped — and never
 * have a single digit to name. Giving the digit-less variant no `digit` field
 * at all (rather than `null`) is what makes a fabricated one a compile error
 * instead of a runtime maybe.
 */
export type RewindStep =
  | {
      cell: CellIndex;
      /** The one digit the move placed, noted or un-noted. Never guessed. */
      digit: Digit;
      label: 'placed' | 'noted' | 'unnoted';
    }
  // No `digit` field at all: `cleared` emptied the whole cell, and
  // `notedAll`/`unnotedAll` touched every candidate in it, so none of the
  // three is about any single digit.
  | { cell: CellIndex; label: 'cleared' | 'notedAll' | 'unnotedAll' };

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
  progress,
  onSpotlight,
}: {
  progress: ReviewProgress;
  onSpotlight?: (cells: CellIndex[]) => void;
}) {
  const t = useT();

  // A report that found nothing has no issues to age, so on its own it would
  // keep certifying notes it has not seen for an hour. `marksNothingLeft`
  // below covers the `reported > 0` half; this is the other one, and it is
  // the only branch where the snapshot's marks are what expire the claim.
  if (progress.reported === 0 && progress.stale) {
    return <p className="py-3 text-sm text-ink-soft">{t('coach.marksStale')}</p>;
  }

  // "All 0 cells checked — your notes are exactly right" is true and useless:
  // a player with no notes was told they had done something perfectly.
  if (progress.checkedCells === 0) {
    return <p className="py-3 text-sm text-ink-soft">{t('coach.marksNone')}</p>;
  }

  if (progress.total === 0) {
    return progress.reported === 0 ? (
      <p className="flex items-center gap-2 py-3 text-sm text-match">
        <CheckIcon className="text-base" />
        {t('coach.marksAllClean', { count: progress.checkedCells })}
      </p>
    ) : (
      // Everything that check found has retired rather than been fixed: the
      // board moved under it, so the report can no longer prove any of it.
      // Saying "your notes are exactly right" here would be claiming something
      // it explicitly gave up on.
      <p className="py-3 text-sm text-ink-soft">{t('coach.marksNothingLeft')}</p>
    );
  }

  return (
    <>
      <p className="py-2.5 text-sm text-ink-soft">
        {/* "All fixed" has to mean the check is closed, and it only is when
            every issue the report was born with is on this list. Fewer rows
            than `reported` means the rest retired unproven — the player did
            not fix them and nobody can now say whether they needed fixing. */}
        {progress.open > 0
          ? t('coach.marksProgress', { open: progress.open, total: progress.total })
          : progress.total < progress.reported
            ? t('coach.marksFixedRestGone')
            : t('coach.marksAllFixed')}{' '}
        <span className="text-ink-faint">{t('coach.marksUnchanged')}</span>
      </p>
      <ul className="divide-y divide-rule border-t border-rule">
        {progress.items.map(({ issue, state }: TrackedIssue) => (
          <li key={`${issue.cell}-${issue.digit}-${issue.kind}`}>
            <button
              type="button"
              onMouseEnter={() => onSpotlight?.([issue.cell, ...issue.witness])}
              onFocus={() => onSpotlight?.([issue.cell, ...issue.witness])}
              onMouseLeave={() => onSpotlight?.([])}
              onBlur={() => onSpotlight?.([])}
              className={cx(
                'flex w-full items-start gap-3 py-2.5 text-left transition-colors duration-100 ease-snap hover:bg-paper-sunk',
                // A fixed row stays legible rather than going decorative: the
                // player is reading it to see what they have already done.
                state === 'fixed' && 'opacity-60',
              )}
            >
              {state === 'fixed' ? (
                <CheckIcon className="mt-0.5 shrink-0 text-base text-match" />
              ) : (
                <AlertIcon
                  className={cx(
                    'mt-0.5 shrink-0 text-base',
                    issue.kind === 'invalid' ? 'text-danger' : 'text-coach',
                  )}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={cx(
                      'font-medium text-sm text-ink tabular-nums',
                      state === 'fixed' && 'line-through',
                    )}
                  >
                    {cellName(issue.cell)}
                  </span>
                  <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
                    {state === 'fixed'
                      ? t('coach.tagFixed')
                      : issue.kind === 'invalid'
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
  progress,
  onReviewCandidates,
  onSpotlight,
  exhausted = false,
  notesBlocked = false,
  drill = null,
  onDrill,
  onDismissDrill,
  onLearn,
  onAnother,
  onDismissHint,
  onFixNotes,
  onCollapse,
  nudge,
  onDismissNudge,
  staleCount,
  onClearStale,
  rewindTrail,
  rewinding = false,
  unfinishable = false,
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
      {/* Sticky, because on a phone this panel is a 72dvh sheet that scrolls
          its whole contents: a long lesson took the technique's name and the
          way out with it, and what was left was a wall of text with no label
          saying what it was about and no visible exit. The name is not chrome
          here — below rung 2 the coach is *withholding* it, so once it is on
          screen it is the frame for everything under it. Needs its own
          background or the text slides through it. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-paper-raised px-4 pt-2.5 pb-1.5 empty:hidden sm:pt-3">
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
        <div
          className={cx(
            'mx-4 mt-3 flex items-center gap-3 rounded-cell border px-4 py-3',
            // A contradiction is the one nudge that reports a mistake. The
            // other two offer something: a technique to find, notes to tidy.
            toneBox(nudge.kind === 'contradiction' ? 'correction' : 'suggestion'),
          )}
        >
          <ToneIcon tone={nudge.kind === 'contradiction' ? 'correction' : 'suggestion'} />
          <p
            className={cx(
              'min-w-0 flex-1 text-sm',
              toneText(nudge.kind === 'contradiction' ? 'correction' : 'suggestion'),
            )}
          >
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

      {/* Below the nudge and above the ladder: it is the more specific thing
          to be looking at than the resting invitation, and less urgent than
          the coach noticing something on its own. Inside the panel's own box,
          so invariant 9 holds. */}
      {rewinding || (rewindTrail !== undefined && rewindTrail.length > 0) ? (
        <div className="mx-4 mt-3 rounded-cell border border-coach/35 bg-coach-wash px-4 py-3">
          <p className="text-sm text-coach">
            {rewinding ? t('coach.rewind.active') : t('coach.rewind.done')}
          </p>
          {/* A handle rather than the bare `listitem` role: the ladder above
              renders four <li>s of its own unconditionally, so a test reaching
              for list items panel-wide is only ever right by JSX ordering.
              Rendered only with a trail to show: a dead end reached without
              undoing anything yet has nothing to list, and an empty <ol>
              would say so anyway. */}
          {rewindTrail !== undefined && rewindTrail.length > 0 ? (
          <ol data-testid="rewind-trail" className="mt-2 space-y-0.5">
            {rewindTrail.map((step, i) => (
              <li
                key={`${step.cell}-${step.label}-${i}`}
                className={cx(
                  'text-[0.8125rem] tabular-nums',
                  // The newest step is the one the player is still thinking
                  // about, and once the amber is out it is the move that was
                  // wrong.
                  i === 0 ? 'text-coach' : 'text-ink-soft',
                )}
              >
                {/* Narrowed with `'digit' in step` first, not with equality
                    checks on `step.label` alone: each of the two shapes has
                    three labels of its own, so a chain of `label === …`
                    comparisons never fully eliminates one shape in favour of
                    the other for `tsc`. Splitting on the field's presence is
                    what keeps this honest — the digit-less branch below has
                    no `digit` in scope to reach for. */}
                {'digit' in step
                  ? step.label === 'placed'
                    ? t('coach.rewind.placed', { cell: cellName(step.cell), digit: step.digit })
                    : step.label === 'noted'
                      ? t('coach.rewind.noted', { cell: cellName(step.cell), digit: step.digit })
                      : t('coach.rewind.unnoted', {
                          cell: cellName(step.cell),
                          digit: step.digit,
                        })
                  : step.label === 'cleared'
                    ? t('coach.rewind.cleared', { cell: cellName(step.cell) })
                    : step.label === 'notedAll'
                      ? t('coach.rewind.notedAll', { cell: cellName(step.cell) })
                      : t('coach.rewind.unnotedAll', { cell: cellName(step.cell) })}
              </li>
            ))}
          </ol>
          ) : null}
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
          notesBlocked ? (
            // Not "nothing here" — "I cannot read your notes". The player has
            // something to do about this one, so it looks like a correction
            // and says what the something is.
            <p className={cx('flex items-start gap-2 text-sm leading-relaxed', toneText('correction'))}>
              <ToneIcon tone="correction" />
              {t('coach.notesBlocked')}
            </p>
          ) : (
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
              {t('coach.nothingFound')}
            </p>
          )
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
        {unfinishable ? (
          // A dead end is a wrong entry, not an invitation.
          <p className={cx('flex items-center gap-2 py-2 text-sm', toneText('correction'))}>
            <ToneIcon tone="correction" />
            {t('coach.deadEnd')}
          </p>
        ) : hint === null ? (
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
        {onDrill && drill === null && hint === null && !unfinishable ? (
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
        {/* Beside the way deeper into this finding, because it is the other
            half of the same question: the ladder goes down into the pattern
            on screen, this steps sideways to a different one. A player who
            has already worked this pattern in their notes has nowhere else
            to go — the engine reads placed digits, so it keeps offering what
            it can still see. */}
        {/* `!unfinishable` as well as the callback `GameView` withholds: a
            panel that is refusing to teach must not be drawing an offer to
            teach something else in the same row, whatever it was handed. */}
        {onAnother && hint !== null && !unfinishable ? (
          <Button variant="ghost" size="lg" onClick={onAnother}>
            {t('coach.another')}
          </Button>
        ) : null}
        {/* Next to "show me another" because it answers the same question and
            gives the opposite answer: that one steps sideways to a different
            pattern, this one steps out. Spelled out at every width rather than
            reduced to a glyph on a phone — a player who cannot find the way
            out does not have one, which is the whole of the complaint this
            button exists for. Offered whenever the coach has something on
            screen to take away; a live challenge has its own dismissal, and
            `hint` is null while one is running. */}
        {onDismissHint && (hint !== null || exhausted) ? (
          <Button variant="ghost" size="lg" onClick={onDismissHint}>
            {t('coach.putAway')}
          </Button>
        ) : null}
        {onLearn && namedTechnique !== null ? (
          <Button variant="ghost" size="lg" onClick={() => onLearn(namedTechnique)}>
            {t('coach.whatIsThis')}
          </Button>
        ) : null}
      </div>

      {progress ? (
        <div className="border-t border-rule px-4 pb-4">
          <h3 className="pt-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
            {t('coach.notesHeading')}
          </h3>
          <IssueList progress={progress} onSpotlight={onSpotlight} />
          {/* Under the list, not above it: the offer to apply them all only
              makes sense once the player has had the chance to read what
              "them" is. Gated on what is still open — a report the player has
              already worked through has nothing left to apply. */}
          {onFixNotes && progress.open > 0 ? (
            <Button variant="secondary" size="lg" block className="mt-3" onClick={onFixNotes}>
              {t('action.fixNotes')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
