/**
 * Test-only fixtures for the engine. Nothing in `src` imports this at runtime;
 * it lives beside the detectors so a worked example and the detector it
 * exercises stay in the same directory.
 *
 * Two kinds of thing live here:
 *
 * 1. Grids. `EXAMPLES` holds one board per technique on which that detector
 *    fires from a plain grid string — no pre-narrowed candidates, so a reader
 *    can reconstruct the pattern with nothing but the string. `PUZZLES` is a
 *    corpus of uniquely-solvable puzzles with their solutions.
 * 2. `possibleDigits`, an oracle. It enumerates *every* solution of a grid and
 *    reports which digits each cell can take across all of them. That is the
 *    ground truth a sound elimination must respect, and it is derived by brute
 *    force rather than by any code the detectors share — so it can catch a
 *    detector and its unit test being wrong in the same direction.
 */

import type { CellIndex, Digit, Finding, TechniqueId } from '../types';
import { CELL_COUNT, cellName } from '../board';

export const EMPTY_GRID = '.'.repeat(CELL_COUNT);

/**
 * One filled row and nothing else. Sparse enough that no digit is cornered
 * anywhere — the useful negative case for detectors that fire on every real
 * puzzle state, where "empty grid" is too degenerate to prove much.
 */
export const ONE_ROW_GRID = `123456789${'.'.repeat(72)}`;

export const SOLVED_GRID =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

/**
 * One board per technique, each verified against `possibleDigits`: every
 * elimination the detector reports is impossible in every solution of the grid.
 */
export const EXAMPLES: Readonly<Record<TechniqueId, string>> = {
  naked_single: '.28934.6...9...38.53....429364.9..1.8..6.32949.2.4.736.8342..7....3....229...1.43',
  hidden_single: '67..........4.....3...8....82..35.474.6.2.8..5..8...26.5...3..9......7.....9.4.53',
  naked_pair: '67..........4.....3...8....82..35.474.6.2.8..5..8...26.5...3..9......7.....9.4.53',
  hidden_pair: '..8..4.6.......3..5......29364.9..1....6.32.4..2...7...8.42..7...........9...1..3',
  pointing: '67.3........4.....3...8....82.635.474.6.2.8..5.78...26.5...3..9......7.....9.4.53',
  claiming: '67..........4.....3...8....82..35.474.6.2.8..5..8...26.5...3..9......7.....9.4.53',
  naked_triple: '67..........4.....3...8....82..35.474.6.2.8..5..8...26.5...3..9......7.....9.4.53',
  hidden_triple: '.28934.6...9...38.53....429364.9..1.8..6.32949.2.4.736.8342..7....3....229...1.43',
  naked_quad: '67..........4.....3...8....82..35.474.6.2.8..5..8...26.5...3..9......7.....9.4.53',
  x_wing: '..89.4.6.......3..5......29364.9..1....6.32.49.2.4.736.8.42..7...........9...1..3',
  xy_wing: '.28934.6...9...38.53....429364.9..1.8..6.32949.2.4.736.8342..71...3...5229...1.43',
  swordfish: '67.3........4.....3...8....82.635.474.6.2.8..5.78...26.5...3..9......7.....9.4.53',
  simple_coloring: '67.3........4.....3...8....82.635.474.6.2.8..5.78...26.5...3..9......7.....9.4.53',
  remote_pairs: '728934165..9..6387536..74293647925188..6.32949.2.48736683425971...3...5229...1.43',
};

export interface CorpusPuzzle {
  name: string;
  givens: string;
  solution: string;
  /** Whether the catalog finishes the grid on its own. */
  solvable: boolean;
  /** The hardest technique the solve path reaches, solved or not. */
  hardest: TechniqueId;
}

/**
 * Uniquely-solvable puzzles spanning the catalog. `hardest` is asserted in
 * `solver.test.ts`, so a detector that starts over- or under-firing shifts a
 * rating here and fails loudly rather than silently re-grading every puzzle the
 * generator will later produce.
 */
export const PUZZLES: readonly CorpusPuzzle[] = [
  {
    name: 'wikipedia easy',
    givens: '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
    solution: SOLVED_GRID,
    solvable: true,
    hardest: 'naked_single',
  },
  {
    name: 'hidden singles only',
    givens: '8.96....12.....8....69.4........82.3..243.9....4.5........7....6......3.3.1....7.',
    solution: '879623451243517869516984327165798243782436915934152786458371692697245138321869574',
    solvable: true,
    hardest: 'hidden_single',
  },
  {
    name: 'needs a naked pair',
    givens: '.5.......2..7...31.9.14.5..........33....87..716..2.........4..8...5..1..758...9.',
    solution: '153289674248765931697143582589476123324518769716392845931627458862954317475831296',
    solvable: true,
    hardest: 'naked_pair',
  },
  {
    name: 'needs a hidden pair',
    givens: '.3...71...72..3....6.2..4.7.....5......3.1.2...592..6...4....9...9...21.....5.6..',
    solution: '938647152472513986561298437296785341847361529315924768654172893789436215123859674',
    solvable: true,
    hardest: 'hidden_pair',
  },
  {
    name: 'needs pointing',
    givens: '..8..4.6.......3..5......2936..9..1....6.3..4..2...7...8.42..7...........9...1..3',
    solution: '728934165149256387536187429364792518857613294912548736683425971471369852295871643',
    solvable: true,
    hardest: 'pointing',
  },
  {
    name: 'needs claiming',
    givens: '..7..........3.91..6.........45......56..9.737..8...4..8...2..6..21..8.......513.',
    solution: '917258364248736915563941728394527681856419273721863549185372496632194857479685132',
    solvable: true,
    hardest: 'claiming',
  },
  {
    name: 'needs an xy-wing',
    givens: '..2..83....9...7.4..6.2.........5.69...871...1.........6.5..4.........3..7..962.5',
    solution: '742918356819653724536724981287435169693871542154269873361582497925147638478396215',
    solvable: true,
    hardest: 'xy_wing',
  },
  {
    name: 'needs simple colouring',
    givens: '.2.4..78.4....6.....81...9.63.2....1...8.7.4...5.....37...2....2.6....1....7.....',
    solution: '521493786497586132368172594634259871912837645875614923759321468286945317143768259',
    solvable: true,
    hardest: 'simple_coloring',
  },
  {
    name: 'beyond the catalog',
    givens: '67..........4.....3...8....82..35.474.6.2.8..5..8...26.5...3..9......7.....9.4.53',
    solution: '674392518185476932392581674829635147436127895517849326251763489943258761768914253',
    solvable: false,
    hardest: 'simple_coloring',
  },
  {
    name: 'seventeen clues',
    givens: '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
    solution: '693784512487512936125963874932651487568247391741398625319475268856129743274836159',
    solvable: true,
    hardest: 'hidden_single',
  },
];

/** A small deterministic PRNG, so a failing property test replays exactly. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** `solution` with every cell outside `keep` blanked. */
export function maskGrid(solution: string, keep: Iterable<CellIndex>): string {
  const kept = new Set(keep);
  return [...solution].map((ch, i) => (kept.has(i) ? ch : '.')).join('');
}

/**
 * For every cell, the digits it takes in at least one solution of `grid`.
 * Returns null when the grid has more than `cap` solutions — the caller then
 * falls back to the single known solution, which is a weaker but still valid
 * soundness witness.
 */
export function possibleDigits(grid: string, cap = 20000): Set<Digit>[] | null {
  const values = [...grid.replace(/\s/g, '')].map((ch) =>
    ch === '.' || ch === '0' ? 0 : Number(ch),
  );
  const possible: Set<Digit>[] = Array.from({ length: CELL_COUNT }, () => new Set<Digit>());
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
  const rowOf = (i: number): number => Math.floor(i / 9);
  const colOf = (i: number): number => i % 9;
  const boxOf = (i: number): number => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);

  for (let i = 0; i < CELL_COUNT; i++) {
    if (values[i] === 0) continue;
    const bit = 1 << (values[i] - 1);
    if ((rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & bit) return possible; // no solutions
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }

  let solutions = 0;
  let overflowed = false;
  const recurse = (): void => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (values[i] !== 0) continue;
      const legal = 0x1ff & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      let count = 0;
      for (let m = legal; m !== 0; m &= m - 1) count++;
      if (count >= bestCount) continue;
      best = i;
      bestMask = legal;
      bestCount = count;
      if (count <= 1) break;
    }
    if (best === -1) {
      if (++solutions > cap) {
        overflowed = true;
        return;
      }
      for (let i = 0; i < CELL_COUNT; i++) possible[i].add(values[i] as Digit);
      return;
    }
    for (let m = bestMask; m !== 0; m &= m - 1) {
      const bit = m & -m;
      values[best] = 32 - Math.clz32(bit);
      rows[rowOf(best)] |= bit;
      cols[colOf(best)] |= bit;
      boxes[boxOf(best)] |= bit;
      recurse();
      rows[rowOf(best)] &= ~bit;
      cols[colOf(best)] &= ~bit;
      boxes[boxOf(best)] &= ~bit;
      values[best] = 0;
      if (overflowed) return;
    }
  };
  recurse();
  return overflowed ? null : possible;
}

/**
 * A finding rewritten in cell names, so an expectation reads like the pattern
 * a player would see rather than like a list of indices between 0 and 80.
 */
export interface FindingShape {
  technique: TechniqueId;
  digits: Digit[];
  cells: string[];
  houses: string[];
  eliminations: string[];
  placements: string[];
}

export function findingShape(finding: Finding | null): FindingShape | null {
  if (!finding) return null;
  return {
    technique: finding.technique,
    digits: finding.digits,
    cells: finding.cells.map(cellName),
    houses: finding.houses.map((h) => `${h.kind}${h.index}`),
    eliminations: finding.eliminations.map((e) => `${cellName(e.cell)}≠${e.digit}`),
    placements: finding.placements.map((p) => `${cellName(p.cell)}=${p.digit}`),
  };
}

/** One-line rendering of a finding, for legible assertion failures. */
export function describeFinding(finding: Finding): string {
  const eliminations = finding.eliminations
    .map((e) => `${cellName(e.cell)}≠${e.digit}`)
    .join(' ');
  const placements = finding.placements.map((p) => `${cellName(p.cell)}=${p.digit}`).join(' ');
  return [
    finding.technique,
    `digits ${finding.digits.join('')}`,
    `cells ${finding.cells.map(cellName).join(',')}`,
    `houses ${finding.houses.map((h) => `${h.kind}${h.index}`).join(',')}`,
    eliminations && `eliminates ${eliminations}`,
    placements && `places ${placements}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

/** A 9x9 rendering of a grid string, for the same reason. */
export function describeGrid(grid: string): string {
  return (grid.match(/.{9}/g) ?? []).join('\n');
}
