/**
 * Coaching contracts. FROZEN INTERFACE (spec §5.5).
 * All coaching output is produced from a deterministic Finding plus authored
 * lesson content — there is no runtime inference path in P0.
 */

import type { CellIndex, Digit, Finding, TechniqueId } from '../engine/types';
import type { DisclosureLevel, Locale } from '../state/types';

/**
 * Authored per-technique content, shipped as reviewed static JSON.
 * One file per locale: src/coach/lessons/{locale}.json
 */
export interface Lesson {
  id: TechniqueId;
  name: string;
  /** One line, shown at disclosure level 2. */
  oneLiner: string;
  /** Full lesson body, markdown-lite. */
  what: string;
  why: string;
  /** Worked micro-example, rendered as a mini board. */
  example: {
    /** 81-char grid for the illustration. */
    grid: string;
    /** Candidate overrides so the example reads without a full solve. */
    marks?: Record<string, number[]>;
    highlight: number[];
    caption: string;
  };
  /**
   * Hint templates per disclosure level. Placeholders are `{name}` tokens
   * filled from HintParams. Level 4 states the logic, never "put N here".
   */
  templates: Record<'1' | '2' | '3' | '4', string>;
}

export type LessonLibrary = Record<TechniqueId, Lesson>;

/** Values substituted into a template. Never contains a solution digit for a cell. */
export interface HintParams {
  [key: string]: string | number;
}

export interface Hint {
  technique: TechniqueId;
  level: DisclosureLevel;
  /** Rendered text, already localized. */
  text: string;
  /** Cells the UI should spotlight at this level (empty below level 3). */
  spotlight: CellIndex[];
  /** Houses the UI should tint (level 1+). */
  houses: { kind: 'row' | 'col' | 'box'; index: number }[];
  /** True when a deeper level exists. */
  canEscalate: boolean;
  findingKey: string;
}

/** One item from the pencil-mark review (R8). Never auto-corrects. */
export interface CandidateIssue {
  cell: CellIndex;
  kind: 'missing' | 'invalid';
  digit: Digit;
  /** The constraint that proves it, localized. */
  reason: string;
  /** Cells that prove the constraint, for spotlighting. */
  witness: CellIndex[];
}

export interface CandidateReview {
  issues: CandidateIssue[];
  /** Cells whose marks are exactly right. */
  cleanCells: CellIndex[];
  checkedCells: number;
}

export type TeachableTrigger =
  | { kind: 'stuck'; sinceMs: number }
  | { kind: 'contradiction'; cell: CellIndex }
  | { kind: 'stale_marks'; cells: CellIndex[] };

export interface CoachContext {
  locale: Locale;
  library: LessonLibrary;
}

/** The deterministic coach surface the UI talks to. */
export interface Coach {
  /**
   * Next finding on the board, cheapest technique first.
   *
   * `skip` holds `findingKey`s the player has set aside — "I have already
   * done that one". The engine still reads placed digits only, so it cannot
   * tell that a player's notes have applied a pattern; rather than trust the
   * notes (a hint built on a wrong mark is a wrong hint), it lets the player
   * say so and walks on. Returns null when everything the catalog can see has
   * been set aside, which is a true answer and a useful one.
   */
  nextFinding(skip?: ReadonlySet<string>): Finding | null;
  /** Render a finding at a disclosure level. */
  hint(finding: Finding, level: DisclosureLevel): Hint;
  /** Diff player marks against true candidates. */
  reviewCandidates(): CandidateReview;
}

/**
 * The template placeholder vocabulary. Lesson authoring and hint rendering are
 * built in parallel, so this list is the contract between them: a template may
 * only use tokens named here, and the renderer must supply every one it uses.
 */
export const HINT_TOKENS = [
  /** Localized house label, e.g. "box 1" / "riquadro 1". */
  'house',
  /** Second house, for techniques spanning two (pointing, claiming, X-wing). */
  'house2',
  /** The pattern's digit, e.g. "4". Permitted from level 2 — see the rule below. */
  'digit',
  /** The pattern's digits joined for reading, e.g. "3 and 7". */
  'digits',
  /** Cell names joined for reading, e.g. "r3c1 and r3c3". Level 3+. */
  'cells',
  /** Rendered elimination list, e.g. "4 from r3c4, r3c7". Level 4 only. */
  'eliminations',
  /** A count used by the copy, e.g. how many cells the digit is confined to. */
  'count',
] as const;

export type HintToken = (typeof HINT_TOKENS)[number];

/**
 * Token semantics, pinned because the lesson library and the hint renderer are
 * built separately and each one guessing would produce hints that are wrong
 * rather than merely awkward.
 *
 * - `{count}` is `finding.cells.length` — the size of the pattern. Never a
 *   digit, never a count of eliminations.
 * - `{house}` and `{house2}` are the *semantic* first and second house of the
 *   pattern — for pointing the box then its line, for claiming the line then
 *   its box, for a fish the base lines then the cover lines.
 *
 *   **`finding.houses` is not in that order.** `buildFinding` runs every
 *   detector's houses through `orderHouses`, which sorts them into canonical
 *   `HOUSES` position. Since `HOUSES` interleaves row/col/box by index, the
 *   result sometimes coincides with the semantic order and sometimes inverts
 *   it: `box0` precedes `row1`, but `col1` precedes `box3`. Read literally,
 *   level-1 copy such as "the candidates all lie in {house2}" is then not
 *   vague but *false* — true of a box and its line, untrue of a line and its
 *   box.
 *
 *   So callers must derive the roles rather than index into the array:
 *   `coach/format.ts::orderedHouses` reconstructs them (by kind for
 *   pointing/claiming, by which houses carry the eliminations for a fish).
 *   Fixing `orderHouses` to preserve detector order would make that function a
 *   no-op; until then it is load-bearing. Tracked in the contract-gaps issue.
 * - **Chain techniques must not use `{house}`.** `xy_wing`, `simple_coloring`
 *   and `remote_pairs` populate `houses` with every house carrying a chain
 *   link, so `houses[0]` is one arbitrary member of a set that may span six
 *   houses. "Look at box 4" would be actively misleading rather than merely
 *   vague. Their level-1 copy uses `{count}` alone; a test over the shipped
 *   library enforces this.
 */
export const CHAIN_TECHNIQUES: readonly TechniqueId[] = ['xy_wing', 'simple_coloring', 'remote_pairs'];

/**
 * DISCLOSURE RULE (R7). What is forbidden is revealing *which digit belongs in
 * which cell*, not naming the digit a pattern is about:
 *
 *  - level 1  region only. No digit, no cell names.
 *  - level 2  technique name + one-liner. May name the pattern digit; no cells.
 *  - level 3  exact cells and houses. Still states no cell-to-digit assignment.
 *  - level 4  full walk-through: the eliminations and the logic that proves
 *             them. Never phrased as "put N in rXcY".
 *
 * `{cells}` and `{eliminations}` are therefore rejected in level 1-2 templates,
 * and `{eliminations}` in level 3. A unit test enforces this over the shipped
 * lesson library.
 */
export const TOKENS_ALLOWED_BY_LEVEL: Record<'1' | '2' | '3' | '4', readonly HintToken[]> = {
  '1': ['house', 'house2', 'count'],
  '2': ['house', 'house2', 'digit', 'digits', 'count'],
  '3': ['house', 'house2', 'digit', 'digits', 'cells', 'count'],
  '4': [...HINT_TOKENS],
};
