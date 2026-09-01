/**
 * Game + player state contracts. FROZEN INTERFACE (spec §5.3).
 * Everything here must stay structurally serializable so a P2 sync layer can
 * ship without a rewrite: no class instances, no functions, no cycles.
 */

import type { CellIndex, Cell, Difficulty, Digit, TechniqueId } from '../engine/types';

export type MoveKind =
  | 'set'
  | 'clear'
  | 'addCandidate'
  | 'removeCandidate'
  | 'clearCandidates'
  | 'fillCandidates';

/** Undo/redo are two stacks of Moves; `prev` is the inverse (R4). */
export interface Move {
  kind: MoveKind;
  cell: CellIndex;
  digit?: Digit;
  /** Exact prior state of the cell, so undo restores value AND candidates. */
  prev: { value: Digit | null; candidates: Digit[] };
  at: number;
}

/** A batched, single-undo action (e.g. the P1 "training wheels" candidate fill). */
export interface MoveBatch {
  moves: Move[];
  label?: string;
}

export type DisclosureLevel = 0 | 1 | 2 | 3 | 4;

/**
 * One coaching interaction, persisted per game so the ladder never resets
 * mid-puzzle (spec §5.5).
 */
export interface CoachExchange {
  at: number;
  technique: TechniqueId;
  /** Highest disclosure level the player escalated to for this finding. */
  level: DisclosureLevel;
  /** Stable key for the finding, so repeat hints resume rather than restart. */
  findingKey: string;
  /** True when the coach offered unprompted (teachable moment) vs player asked. */
  offered: boolean;
}

/** Serialized form stored in IndexedDB. Sets become sorted arrays. */
export interface StoredCell {
  value: Digit | null;
  given: boolean;
  candidates: Digit[];
}

export interface Game {
  id: string;
  createdAt: number;
  updatedAt: number;
  difficulty: Difficulty;
  /** 81-char puzzle string, '.' for empty. */
  givens: string;
  /** 81-char, engine-only, never sent to the coach in full. */
  solution: string;
  cells: StoredCell[];
  undoStack: Move[];
  redoStack: Move[];
  elapsedMs: number;
  /** Wall-clock at which the timer last resumed; null when paused. */
  runningSince: number | null;
  completedAt: number | null;
  coachLog: CoachExchange[];
}

/** In-memory game with Sets rehydrated. */
export interface LiveGame extends Omit<Game, 'cells'> {
  cells: Cell[];
}

export type MasteryStage = 'unseen' | 'taught' | 'recognized_with_hint' | 'applied_unaided';

export interface MasteryEntry {
  stage: MasteryStage;
  applications: number;
  misses: number;
  lastSeenAt: number;
}

export type Locale = 'it' | 'en';

/** Singleton record, separate from games. */
export interface PlayerProfile {
  id: 'profile';
  mastery: Partial<Record<TechniqueId, MasteryEntry>>;
  locale: Locale;
  /** P1 settings; defaults keep the coaching philosophy intact. */
  settings: {
    highlightConflicts: boolean;
    theme: 'system' | 'light' | 'dark';
    haptics: boolean;
    /**
     * Echo the green same-digit highlight onto matching pencil marks, not
     * just placed digits. Off by default: every note it would light is a
     * square the digit could still go, which is the elimination the coach
     * exists to make the player find for themselves.
     */
    highlightMatchingNotes: boolean;
  };
}
