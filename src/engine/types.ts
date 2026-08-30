/**
 * Core engine contracts. FROZEN INTERFACE — parallel modules build against this.
 * Spec §5.3. Cell indices are 0..80, r = floor(i/9), c = i%9.
 */

export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** 0..80 */
export type CellIndex = number;

export interface Cell {
  value: Digit | null;
  /** Given cells are immutable and render in ink black (R2). */
  given: boolean;
  /** User pencil marks. USER-OWNED: the engine never silently edits these. */
  candidates: Set<Digit>;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'] as const;

/** A house is one of the 27 constraint groups: 9 rows, 9 columns, 9 boxes. */
export type HouseKind = 'row' | 'col' | 'box';

export interface House {
  kind: HouseKind;
  /** 0..8 within its kind. */
  index: number;
  cells: readonly CellIndex[];
}

/**
 * Ordered technique catalog. Order defines both solver preference and
 * difficulty rating: a puzzle's level is the hardest technique its solve path
 * requires (spec §5.4). Adding a detector means appending here.
 */
export const TECHNIQUE_IDS = [
  'naked_single',
  'hidden_single',
  'naked_pair',
  'hidden_pair',
  'pointing',
  'claiming',
  'naked_triple',
  'hidden_triple',
  'naked_quad',
  'x_wing',
  'xy_wing',
  'swordfish',
  'simple_coloring',
  'remote_pairs',
] as const;

export type TechniqueId = (typeof TECHNIQUE_IDS)[number];

/** Hardest technique class permitted per difficulty level (spec §5.4). */
export const DIFFICULTY_TECHNIQUES: Record<Difficulty, readonly TechniqueId[]> = {
  easy: ['naked_single', 'hidden_single'],
  medium: ['naked_single', 'hidden_single', 'naked_pair', 'hidden_pair', 'pointing', 'claiming'],
  hard: [
    'naked_single', 'hidden_single', 'naked_pair', 'hidden_pair', 'pointing', 'claiming',
    'naked_triple', 'hidden_triple', 'naked_quad', 'x_wing', 'xy_wing',
  ],
  expert: [...TECHNIQUE_IDS],
};

/** One candidate removal proved by a finding. */
export interface Elimination {
  cell: CellIndex;
  digit: Digit;
}

/** A placement proved by a finding (singles only). */
export interface Placement {
  cell: CellIndex;
  digit: Digit;
}

/**
 * Structured result of a detector (R6). Every field is ground truth derived
 * from true candidates — never from the stored solution string.
 */
export interface Finding {
  technique: TechniqueId;
  /** Digits the pattern is about. */
  digits: Digit[];
  /** Cells forming the pattern (the evidence). */
  cells: CellIndex[];
  /** Houses the pattern lives in. */
  houses: House[];
  /** Candidates this finding proves impossible. */
  eliminations: Elimination[];
  /** Placements this finding proves (naked/hidden single only). */
  placements: Placement[];
}

/** Detector signature. Pure: same board in, same finding out. */
export interface Detector {
  id: TechniqueId;
  /** Returns the first finding of this technique, or null. */
  detect(board: BoardView): Finding | null;
}

/**
 * Read-only view the detectors and coach operate on. Implemented by
 * engine/board. `trueCandidates` are engine-computed, distinct from the
 * player's pencil marks.
 */
export interface BoardView {
  readonly values: readonly (Digit | null)[];
  /** Engine-computed candidates for an empty cell; empty set for a filled cell. */
  trueCandidates(cell: CellIndex): ReadonlySet<Digit>;
  /** Every cell sharing a row, column or box with `cell` (20 peers). */
  peers(cell: CellIndex): readonly CellIndex[];
  /** The three houses containing `cell`. */
  housesOf(cell: CellIndex): readonly House[];
  isSolved(): boolean;
  hasContradiction(): boolean;
}

export interface GeneratedPuzzle {
  /** 81 chars, '.' for empty. */
  givens: string;
  /** 81 chars, engine-only. Never serialized to the coach in full (spec §5.6). */
  solution: string;
  difficulty: Difficulty;
  /** Hardest technique the rating solver needed. */
  hardestTechnique: TechniqueId;
  /** Every technique the solve path used, in order of first use. */
  techniquesUsed: TechniqueId[];
}
