/**
 * The small building blocks a lesson is made of: paragraphs, a titled
 * section, a mastery chip, and the worked-example board.
 *
 * Shared by `LessonBody` (the lesson itself) and `LearnView` (the rules and
 * "how the coach behaves" copy above the technique index), so it lives apart
 * from both rather than being owned by either.
 */

import { parseGrid } from '../../engine/board';
import type { CellIndex, Digit } from '../../engine/types';
import { exampleMarks } from '../../coach/lessons';
import type { Lesson } from '../../coach/types';
import type { Translate } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/types';
import type { MasteryStage } from '../../state/types';
import { SudokuGrid, type GridCell } from '../board/SudokuGrid';
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
 */
export function Example({
  lesson,
  focusable = true,
}: {
  lesson: Lesson;
  /**
   * Whether the illustration keeps its cell in the tab order.
   *
   * True on the Learn page, where the example is the page's own content and a
   * tab stop on it costs nothing. False in the game screen's lesson column,
   * where the tab order leads a keyboard player from the keypad onward and
   * must not deposit them inside a board they cannot play.
   */
  focusable?: boolean;
}) {
  const marks = exampleMarks(lesson);
  const cells: GridCell[] = parseGrid(lesson.example.grid).map((value, index) => ({
    value,
    given: value !== null,
    candidates: (marks.get(index) ?? []) as Digit[],
  }));

  return (
    <figure className="mt-4">
      {/* An illustration, not a board to play: taps would only move a selection
          nobody asked for. */}
      <div className="pointer-events-none">
        <SudokuGrid
          cells={cells}
          selected={null}
          onSelect={() => undefined}
          spotlight={lesson.example.highlight as CellIndex[]}
          highlightPeers={false}
          highlightMatches={false}
          focusable={focusable}
          label={lesson.name}
        />
      </div>
      <figcaption className="mt-2.5 text-sm leading-relaxed text-ink-soft">
        {lesson.example.caption}
      </figcaption>
    </figure>
  );
}
