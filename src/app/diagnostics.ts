/**
 * The diagnostic report: everything needed to reproduce a moment of play,
 * built as data rather than as prose.
 *
 * It exists because a bug report about a coaching decision is unanswerable
 * without the board *and* the reading the engine took of it. "The checker told
 * me to put back digits my naked pair removed" is a sentence about three
 * things at once — the marks, the true candidates, and which findings the
 * catalog can see — and only one of them is on screen.
 *
 * Pure and synchronous on purpose: the UI prints what this returns, so what
 * the player pastes is exactly what a test can be written against.
 */

import { Board, CELL_COUNT } from '../engine/board';
import { CATALOG } from '../engine/techniques';
import { DIGITS, type CellIndex, type Digit } from '../engine/types';
import type { Finding } from '../engine/types';
import type { CandidateReview } from '../coach/types';
import type { Hint } from '../coach/types';
import type { LiveGame, PlayerProfile } from '../state/types';

/** A finding, flattened to the parts a reader of the report needs. */
export interface ReportedFinding {
  technique: string;
  digits: Digit[];
  cells: CellIndex[];
  eliminates: string[];
}

export interface DiagnosticReport {
  at: string;
  app: { locale: string; tier: string; viewport: string };
  game: {
    id: string;
    difficulty: string;
    elapsedMs: number;
    solved: boolean;
    givens: string;
    /** Row-major, `.` for empty — the same shape the givens string uses. */
    values: string;
    /** Only cells the player has noted, as `r1c3: 1,4,9`. */
    notes: string[];
    undoDepth: number;
    redoDepth: number;
    lastMoves: string[];
  };
  coach: {
    hint: { technique: string; level: number; findingKey: string } | null;
    drill: string | null;
    exhausted: boolean;
    review: {
      checkedCells: number;
      cleanCells: number;
      issues: { cell: string; kind: string; digit: Digit; reason: string }[];
    } | null;
  };
  /**
   * The engine's own reading of the same board — the half of a bug report that
   * cannot be seen from the screen.
   */
  engine: {
    /** What the catalog would offer next, cheapest technique first. */
    nextFinding: ReportedFinding | null;
    /** Every technique that fires on this board, not just the cheapest. */
    allFindings: ReportedFinding[];
    /**
     * True candidates for the cells the review complained about, so a
     * disagreement between the player and the checker can be read directly.
     * Basic elimination only — which is exactly the axis such disagreements
     * tend to be on.
     */
    trueCandidates: string[];
  };
  settings: PlayerProfile['settings'];
  note?: string;
}

const cellName = (cell: number): string =>
  `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;

const digitsOf = (set: ReadonlySet<Digit>): string =>
  DIGITS.filter((digit) => set.has(digit)).join(',');

function report(finding: Finding): ReportedFinding {
  return {
    technique: finding.technique,
    digits: finding.digits,
    cells: finding.cells,
    eliminates: finding.eliminations.map(({ cell, digit }) => `${cellName(cell)}-${digit}`),
  };
}

/**
 * Every technique that fires, not just the first.
 *
 * The catalog is ordered cheapest-first and play only ever needs the head of
 * it, but a bug report is the one place the tail matters: "the checker
 * disagrees with my naked pair" is answered by whether the catalog sees that
 * pair at all, which the first finding alone would not say.
 */
function allFindings(board: Board): ReportedFinding[] {
  const out: ReportedFinding[] = [];
  for (const detector of CATALOG) {
    const finding = detector.detect(board);
    if (finding !== null) out.push(report(finding));
  }
  return out;
}

export interface DiagnosticInput {
  game: LiveGame;
  profile: PlayerProfile;
  tier: string;
  viewport: string;
  hint: Hint | null;
  drill: { technique: string } | null;
  exhausted: boolean;
  review: CandidateReview | null;
  /** Whatever the player typed about what looked wrong. */
  note?: string;
  now?: Date;
}

export function buildDiagnosticReport(input: DiagnosticInput): DiagnosticReport {
  const { game, profile, review } = input;
  const values = game.cells.map((cell) => cell.value);
  const board = Board.fromValues(values);

  const notes: string[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const marks = game.cells[cell].candidates;
    if (game.cells[cell].value !== null || marks.size === 0) continue;
    notes.push(`${cellName(cell)}: ${digitsOf(marks)}`);
  }

  // Only the cells under discussion: a full 81-cell dump would bury the two
  // the report is about, and the marks above already say what the player put
  // where.
  const flagged = [...new Set((review?.issues ?? []).map((issue) => issue.cell))];

  return {
    at: (input.now ?? new Date()).toISOString(),
    app: { locale: profile.locale, tier: input.tier, viewport: input.viewport },
    game: {
      id: game.id,
      difficulty: game.difficulty,
      elapsedMs: game.elapsedMs,
      solved: game.completedAt !== null,
      givens: game.givens,
      values: values.map((value) => value ?? '.').join(''),
      notes,
      undoDepth: game.undoStack.length,
      redoDepth: game.redoStack.length,
      // The tail of the log, which is usually where the surprise came from.
      lastMoves: game.undoStack
        .slice(-12)
        .map((move) => `${move.kind} ${cellName(move.cell)}${move.digit ? ` ${move.digit}` : ''}`),
    },
    coach: {
      hint:
        input.hint === null
          ? null
          : {
              technique: input.hint.technique,
              level: input.hint.level,
              findingKey: input.hint.findingKey,
            },
      drill: input.drill?.technique ?? null,
      exhausted: input.exhausted,
      review:
        review === null
          ? null
          : {
              checkedCells: review.checkedCells,
              cleanCells: review.cleanCells.length,
              issues: review.issues.map((issue) => ({
                cell: cellName(issue.cell),
                kind: issue.kind,
                digit: issue.digit,
                reason: issue.reason,
              })),
            },
    },
    engine: {
      nextFinding: (() => {
        for (const detector of CATALOG) {
          const finding = detector.detect(board);
          if (finding !== null) return report(finding);
        }
        return null;
      })(),
      allFindings: allFindings(board),
      trueCandidates: flagged.map(
        (cell) => `${cellName(cell)}: ${digitsOf(board.trueCandidates(cell))}`,
      ),
    },
    settings: profile.settings,
    ...(input.note === undefined || input.note === '' ? {} : { note: input.note }),
  };
}

/** The report as the player will paste it: stable key order, readable indent. */
export const formatDiagnosticReport = (report: DiagnosticReport): string =>
  JSON.stringify(report, null, 2);
