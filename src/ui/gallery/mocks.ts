/**
 * Realistic fixtures for the component gallery.
 *
 * One real puzzle, played to three different points, so every component is
 * reviewed against data it will actually meet: pencil marks that fill awkward
 * positions, a genuine duplicate for the conflict layer, and hint copy written
 * to the disclosure rules in coach/types.ts rather than to whatever reads well.
 */

import type { CellIndex, Digit } from '../../engine/types';
import type { CandidateReview } from '../../coach/types';
import type { Hint } from '../../coach/types';
import type { StoredCell } from '../../state/types';
import { parseGrid } from '../../engine/board';
import type { GridCell } from '../board/SudokuGrid';
import type { GameSummary } from '../game/GameList';

export const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

/** Entries the player has made, cell -> digit. All correct except r5c5. */
const ENTRIES: [CellIndex, Digit][] = [
  [2, 4],
  [3, 6],
  [11, 7],
  [20, 1],
  [40, 5],
  [45, 9],
  [60, 1],
  [72, 3],
];

/** Pencil marks chosen to exercise every slot of the 3x3 mini-grid. */
const MARKS: [CellIndex, Digit[]][] = [
  [4, [1, 5, 9]],
  [5, [2, 4, 6, 8]],
  [6, [1, 2, 3, 7, 8, 9]],
  [15, [2, 3, 4]],
  [16, [3, 4, 8]],
  [24, [2, 3, 5]],
  [25, [4, 5]],
  [30, [1, 2, 4, 5, 7, 9]],
  [37, [1, 2, 3, 5, 6, 9]],
  [43, [2, 7]],
  [52, [4, 5, 8]],
  [64, [3, 5, 7, 9]],
  [70, [2, 6]],
];

export function demoCells(): GridCell[] {
  const givens = parseGrid(PUZZLE);
  const cells: GridCell[] = givens.map((value) => ({
    value,
    given: value !== null,
    candidates: new Set<Digit>(),
  }));
  for (const [cell, digit] of ENTRIES) cells[cell] = { ...cells[cell], value: digit };
  for (const [cell, digits] of MARKS) {
    if (cells[cell].value !== null) continue;
    cells[cell] = { ...cells[cell], candidates: new Set(digits) };
  }
  return cells;
}

/** Two 5s in row 5: what the optional conflict layer is for. */
export const DEMO_CONFLICTS: CellIndex[] = [40, 44];

/** A hidden single in box 4, spotlit as the coach would at level 3+. */
export const DEMO_SPOTLIGHT: CellIndex[] = [27, 36, 46];

export const DEMO_HINTS: Record<1 | 2 | 3 | 4, Hint> = {
  1: {
    technique: 'hidden_single',
    level: 1,
    text: 'There is a placement waiting in box 4. Nothing outside that box matters yet.',
    spotlight: [],
    houses: [{ kind: 'box', index: 3 }],
    canEscalate: true,
    findingKey: 'hidden_single:b3:7',
  },
  2: {
    technique: 'hidden_single',
    level: 2,
    text: 'Hidden single: a digit that still has a home in its house, but only one. Here the digit is 7.',
    spotlight: [],
    houses: [{ kind: 'box', index: 3 }],
    canEscalate: true,
    findingKey: 'hidden_single:b3:7',
  },
  3: {
    technique: 'hidden_single',
    level: 3,
    text: 'The 7 in box 4 is down to r4c1, r5c1 and r6c2. Read row 4 and column 1 across them.',
    spotlight: DEMO_SPOTLIGHT,
    houses: [
      { kind: 'box', index: 3 },
      { kind: 'row', index: 3 },
    ],
    canEscalate: true,
    findingKey: 'hidden_single:b3:7',
  },
  4: {
    technique: 'hidden_single',
    level: 4,
    text:
      'Row 4 already holds a 7, so 7 leaves r4c1. Column 1 holds one too, so 7 leaves r5c1. ' +
      'Box 4 must contain a 7 somewhere, and after those two eliminations only one cell in it can still take one.',
    spotlight: DEMO_SPOTLIGHT,
    houses: [
      { kind: 'box', index: 3 },
      { kind: 'row', index: 3 },
    ],
    canEscalate: false,
    findingKey: 'hidden_single:b3:7',
  },
};

export const DEMO_REVIEW: CandidateReview = {
  checkedCells: 34,
  cleanCells: [4, 5, 15, 16, 24, 25, 43, 52, 64, 70],
  issues: [
    {
      cell: 6,
      kind: 'invalid',
      digit: 9,
      reason: 'Column 7 already has a 9 at r7c7.',
      witness: [60],
    },
    {
      cell: 30,
      kind: 'missing',
      digit: 6,
      reason: 'No 6 in row 4, column 4 or box 5 — it still belongs here.',
      witness: [27, 31, 39],
    },
    {
      cell: 37,
      kind: 'invalid',
      digit: 3,
      reason: 'Box 4 already has a 3 at r6c3.',
      witness: [47],
    },
  ],
};

const HOUR = 3_600_000;

function storedCells(values: readonly (Digit | null)[], filled: readonly [CellIndex, Digit][]) {
  const cells: StoredCell[] = values.map((value) => ({
    value,
    given: value !== null,
    candidates: [],
  }));
  for (const [cell, digit] of filled) cells[cell] = { ...cells[cell], value: digit };
  return cells;
}

/** Fills the first `count` empty cells with a plausible digit, for the sigils. */
function progressed(count: number): [CellIndex, Digit][] {
  const values = parseGrid(PUZZLE);
  const out: [CellIndex, Digit][] = [];
  for (let i = 0; i < values.length && out.length < count; i++) {
    if (values[i] === null) out.push([i, (((i * 5) % 9) + 1) as Digit]);
  }
  return out;
}

export function demoGames(now: number): GameSummary[] {
  const values = parseGrid(PUZZLE);
  return [
    {
      id: 'g-expert',
      difficulty: 'expert',
      givens: PUZZLE,
      cells: storedCells(values, progressed(6)),
      elapsedMs: 41 * 60_000 + 12_000,
      runningSince: null,
      updatedAt: now - 9 * 60_000,
    },
    {
      id: 'g-medium',
      difficulty: 'medium',
      givens: PUZZLE,
      cells: storedCells(values, progressed(29)),
      elapsedMs: 8 * 60_000 + 4_000,
      runningSince: null,
      updatedAt: now - 5 * HOUR,
    },
    {
      id: 'g-easy',
      difficulty: 'easy',
      givens: PUZZLE,
      cells: storedCells(values, progressed(47)),
      elapsedMs: 22 * 60_000 + 51_000,
      runningSince: null,
      updatedAt: now - 3 * 24 * HOUR,
    },
  ];
}
