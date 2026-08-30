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
  /** Next finding on the board, cheapest technique first. */
  nextFinding(): Finding | null;
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
