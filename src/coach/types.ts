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
