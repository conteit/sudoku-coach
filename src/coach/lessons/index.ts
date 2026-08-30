/**
 * The lesson library loader.
 *
 * Both locales are *statically* imported so the content lands in the main
 * bundle and is precached by the service worker: every coaching feature has to
 * work with the network off (R9), which rules out a dynamic import or a fetch
 * keyed on the player's locale. Two locales of authored text is a few tens of
 * kilobytes — cheaper than the machinery needed to load it lazily.
 *
 * ## Conventions the hint renderer has to match
 *
 * The templates in the JSON are written against a fixed reading of the
 * `HINT_TOKENS` vocabulary. Rendering a `Finding` must fill them like this:
 *
 * - `{house}`   `houseLabel(locale, finding.houses[0])`
 * - `{house2}`  `houseLabel(locale, finding.houses[1])`
 * - `{digit}`   `finding.digits[0]`, only used by single-digit techniques
 * - `{digits}`  every digit of the finding, list-formatted for the locale
 * - `{cells}`   `finding.cells` as `rXcY` names, list-formatted
 * - `{eliminations}` the finding's eliminations, rendered for reading
 * - `{count}`   `finding.cells.length` — the size of the pattern, never a
 *               digit value and never a count of eliminations
 *
 * House order matters, because level-1 and level-2 copy names houses before it
 * is allowed to name cells:
 *
 * - `pointing`   houses[0] is the box, houses[1] the line it points along
 * - `claiming`   houses[0] is the line, houses[1] the box it claims from
 * - `x_wing` / `swordfish`  the base lines come first, then the covered lines
 * - `xy_wing`, `simple_coloring`, `remote_pairs` span the board rather than a
 *   house, so their level-1 copy uses `{count}` only and needs no house at all
 *
 * ## Example blocks
 *
 * `example.marks` is keyed by cell name (`"r4c1"`), not by index, so the JSON
 * stays reviewable by a human. Every marked cell is empty in `example.grid` and
 * its digits are exactly that cell's true candidates — `lessons.test.ts`
 * recomputes them from the grid and fails if the two disagree.
 */
import { type CellIndex, type Digit, type TechniqueId } from '../../engine/types';
import type { Locale } from '../../state/types';
import type { Lesson, LessonLibrary } from '../types';
import enLessons from './en.json';
import itLessons from './it.json';

type Expect<T extends true> = T;

/** True only when `T`'s keys are exactly the technique catalog. */
type KeyedByTechnique<T> = [TechniqueId] extends [keyof T]
  ? [keyof T] extends [TechniqueId]
    ? true
    : false
  : false;

/**
 * Compile-time completeness checks. Adding an id to `TECHNIQUE_IDS` without
 * authoring its lesson, or authoring one under a key that is not a technique,
 * breaks the build here rather than handing the coach an `undefined` lesson at
 * runtime. They are exported so they read as assertions rather than dead code.
 */
export type EnglishLessonsCoverEveryTechnique = Expect<KeyedByTechnique<typeof enLessons>>;
export type ItalianLessonsCoverEveryTechnique = Expect<KeyedByTechnique<typeof itLessons>>;

/**
 * JSON imports widen every string to `string`, so the literal unions inside
 * `Lesson` (`id`, and the `'1' | '2' | '3' | '4'` template keys) cannot be
 * recovered by inference. The keys are checked above; the value shape is
 * checked field by field in lessons.test.ts.
 */
const LIBRARIES: Record<Locale, LessonLibrary> = {
  en: enLessons as unknown as LessonLibrary,
  it: itLessons as unknown as LessonLibrary,
};

/** The whole authored library for a locale. Never hits the network. */
export const loadLessons = (locale: Locale): LessonLibrary => LIBRARIES[locale];

/** One lesson. Total by construction: every technique id has an entry. */
export const getLesson = (locale: Locale, id: TechniqueId): Lesson => LIBRARIES[locale][id];

const CELL_NAME = /^r([1-9])c([1-9])$/;

/** Inverse of `cellName` from engine/board: "r4c1" -> 27. */
export const parseCellName = (name: string): CellIndex => {
  const match = CELL_NAME.exec(name);
  if (!match) throw new Error(`not a cell name: ${JSON.stringify(name)}`);
  return (Number(match[1]) - 1) * 9 + (Number(match[2]) - 1);
};

/**
 * The example's pencil marks keyed by cell index, ready for a mini board.
 * Empty when the lesson's example carries no marks.
 */
export const exampleMarks = (lesson: Lesson): Map<CellIndex, Digit[]> => {
  const marks = new Map<CellIndex, Digit[]>();
  for (const [name, digits] of Object.entries(lesson.example.marks ?? {})) {
    marks.set(parseCellName(name), digits as Digit[]);
  }
  return marks;
};
