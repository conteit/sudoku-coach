/**
 * The small building blocks a lesson is made of: paragraphs, a titled
 * section, a mastery chip, and the worked-example board.
 *
 * Shared by `LessonBody` (the lesson itself) and `LearnView` (the rules and
 * "how the coach behaves" copy above the technique index), so it lives apart
 * from both rather than being owned by either.
 */

import { parseGrid } from '../../engine/board';
import type { Digit } from '../../engine/types';
import { exampleMarks, exampleRoles } from '../../coach/lessons';
import type { Lesson } from '../../coach/types';
import type { Translate } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/types';
import type { MasteryStage } from '../../state/types';
import { SudokuGrid, type GridCell } from '../board/SudokuGrid';
import { PatternOverlay } from '../claim/PatternOverlay';
import { drawingOf, shapeOf } from '../claim/shape';
import { cx } from '../primitives/cx';

const MASTERY_KEYS = {
  unseen: 'mastery.unseen',
  taught: 'mastery.taught',
  recognized_with_hint: 'mastery.recognized_with_hint',
  applied_unaided: 'mastery.applied_unaided',
} as const satisfies Record<MasteryStage, MessageKey>;

/** How far along a stage reads, so the chip can carry it without extra words. */
const STAGE_TONE: Record<MasteryStage, string> = {
  unseen: 'border-rule text-ink-faint',
  taught: 'border-coach/40 text-coach',
  recognized_with_hint: 'border-coach/60 text-coach',
  applied_unaided: 'border-match/50 text-match',
};

/** Lesson prose is paragraphs separated by blank lines; nothing more. */
export function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((paragraph, i) => (
        <p key={i} className="mt-3 text-[0.9375rem] leading-relaxed text-ink first:mt-0">
          {paragraph}
        </p>
      ))}
    </>
  );
}

export function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-t border-rule py-6">
      <h2 className="font-display mb-3 text-xl leading-tight text-ink">{title}</h2>
      <Prose text={body} />
    </section>
  );
}

export function MasteryChip({ stage, t }: { stage: MasteryStage; t: Translate }) {
  return (
    <span
      className={cx(
        'shrink-0 rounded-cell border px-2 py-0.5 text-[0.6875rem] font-medium',
        STAGE_TONE[stage],
      )}
    >
      {t(MASTERY_KEYS[stage])}
    </span>
  );
}

/**
 * The lesson's worked example as a real board.
 *
 * Every filled cell is drawn as a given: in an illustration there is no player
 * entry to distinguish, and the difference in weight would suggest one.
 *
 * Drawn in the same language a claim is drawn in, which is the point of it —
 * Paolo: *"I feel the need to have consistent representation also in x and xy
 * wing and to have this consistent with the exercise area"*, and then, of
 * Learn: *"remember to align also learn part"*. The example used to paint
 * every highlighted cell with the coach's amber spotlight, which said two
 * wrong things at once: that the pattern and what it eliminates are the same
 * kind of thing, and that amber means *look here* rather than *this cell loses
 * a digit*. Now the pattern is rings in the drawing's own colours and only the
 * eliminations are amber, so a lesson and a claim teach the same picture.
 */
export function Example({ lesson }: { lesson: Lesson }) {
  const marks = exampleMarks(lesson);
  const cells: GridCell[] = parseGrid(lesson.example.grid).map((value, index) => ({
    value,
    given: value !== null,
    candidates: (marks.get(index) ?? []) as Digit[],
  }));
  const { pattern, pivot, targets } = exampleRoles(lesson);
  const drawing = drawingOf(shapeOf(lesson.id), pattern, { pivot, targets });

  return (
    <figure className="mt-4">
      {/* An illustration, not a board to play: taps would only move a selection
          nobody asked for. */}
      <div className="pointer-events-none relative">
        <SudokuGrid
          cells={cells}
          selected={null}
          onSelect={() => undefined}
          patternMarks={drawing.marks}
          highlightPeers={false}
          highlightMatches={false}
          /* Never in the tab order, wherever it is shown. The grid is
             `pointer-events-none` and answers no key: a tab stop on it is a
             stop that leads nowhere, whether the page around it is Learn or a
             game. It used to be focusable on Learn on the grounds that a stop
             there "costs nothing" — it costs a keyboard reader a roving-cell
             widget with no move to make. The illustration keeps its accessible
             name and its cell labels, so it is still readable in browse mode;
             it is only the tab order it leaves. */
          focusable={false}
          label={lesson.name}
        />
        <PatternOverlay links={drawing.links} order={drawing.order} marks={drawing.marks} />
      </div>
      <figcaption className="mt-2.5 text-sm leading-relaxed text-ink-soft">
        {lesson.example.caption}
      </figcaption>
    </figure>
  );
}
