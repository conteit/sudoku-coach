/**
 * Board model and constraint queries (spec §5.2 engine/board).
 *
 * All 27 houses, the peer sets and the box index are precomputed once at module
 * load: they are pure functions of the 9x9 geometry and never change. Detectors
 * and the generator run these lookups in tight loops, so allocation here is the
 * difference between a snappy rating pass and a janky one.
 */

import type { BoardView, CellIndex, Digit, House } from './types';
import { DIGITS } from './types';

export const SIZE = 9;
export const CELL_COUNT = 81;

export const rowOf = (cell: CellIndex): number => Math.floor(cell / SIZE);
export const colOf = (cell: CellIndex): number => cell % SIZE;
export const boxOf = (cell: CellIndex): number =>
  Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
export const cellAt = (row: number, col: number): CellIndex => row * SIZE + col;

/** Human-facing coordinate, e.g. cell 0 -> "r1c1". Used in every hint template. */
export const cellName = (cell: CellIndex): string => `r${rowOf(cell) + 1}c${colOf(cell) + 1}`;

const buildHouses = (): House[] => {
  const houses: House[] = [];
  for (let i = 0; i < SIZE; i++) {
    const row: CellIndex[] = [];
    const col: CellIndex[] = [];
    const box: CellIndex[] = [];
    for (let j = 0; j < SIZE; j++) {
      row.push(cellAt(i, j));
      col.push(cellAt(j, i));
      const br = Math.floor(i / 3) * 3 + Math.floor(j / 3);
      const bc = (i % 3) * 3 + (j % 3);
      box.push(cellAt(br, bc));
    }
    houses.push({ kind: 'row', index: i, cells: row });
    houses.push({ kind: 'col', index: i, cells: col });
    houses.push({ kind: 'box', index: i, cells: box });
  }
  return houses;
};

/** All 27 houses: rows 0-8, then cols, then boxes, interleaved by index. */
export const HOUSES: readonly House[] = Object.freeze(buildHouses());

export const ROWS: readonly House[] = HOUSES.filter((h) => h.kind === 'row');
export const COLS: readonly House[] = HOUSES.filter((h) => h.kind === 'col');
export const BOXES: readonly House[] = HOUSES.filter((h) => h.kind === 'box');

const HOUSES_OF: readonly (readonly House[])[] = Object.freeze(
  Array.from({ length: CELL_COUNT }, (_, cell) =>
    Object.freeze([ROWS[rowOf(cell)], COLS[colOf(cell)], BOXES[boxOf(cell)]]),
  ),
);

const PEERS: readonly (readonly CellIndex[])[] = Object.freeze(
  Array.from({ length: CELL_COUNT }, (_, cell) => {
    const set = new Set<CellIndex>();
    for (const house of HOUSES_OF[cell]) for (const c of house.cells) set.add(c);
    set.delete(cell);
    return Object.freeze([...set].sort((a, b) => a - b));
  }),
);

/** The 20 cells that constrain `cell`. */
export const peersOf = (cell: CellIndex): readonly CellIndex[] => PEERS[cell];

/** The row, column and box containing `cell`. */
export const housesOf = (cell: CellIndex): readonly House[] => HOUSES_OF[cell];

export const sharesHouse = (a: CellIndex, b: CellIndex): boolean =>
  a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

/** Parse an 81-char grid string. '.', '0' and ' ' all mean empty. */
export function parseGrid(grid: string): (Digit | null)[] {
  const compact = grid.replace(/\s/g, '');
  if (compact.length !== CELL_COUNT) {
    throw new Error(`grid must be ${CELL_COUNT} chars, got ${compact.length}`);
  }
  return [...compact].map((ch) => {
    if (ch === '.' || ch === '0') return null;
    const n = Number(ch);
    if (!Number.isInteger(n) || n < 1 || n > 9) throw new Error(`bad grid char ${JSON.stringify(ch)}`);
    return n as Digit;
  });
}

export const formatGrid = (values: readonly (Digit | null)[]): string =>
  values.map((v) => (v === null ? '.' : String(v))).join('');

/**
 * Immutable board view over a value array. Candidates are computed lazily and
 * memoized, then invalidated wholesale on any value change — a board is cheap
 * to rebuild and detectors expect a stable snapshot.
 */
export class Board implements BoardView {
  readonly values: readonly (Digit | null)[];
  #candidates: (Set<Digit> | null)[] = new Array(CELL_COUNT).fill(null);

  private constructor(values: readonly (Digit | null)[]) {
    this.values = values;
  }

  static fromString(grid: string): Board {
    return new Board(Object.freeze(parseGrid(grid)));
  }

  static fromValues(values: readonly (Digit | null)[]): Board {
    if (values.length !== CELL_COUNT) throw new Error(`expected ${CELL_COUNT} values`);
    return new Board(Object.freeze([...values]));
  }

  /** Returns a new Board; the receiver is untouched. */
  withValue(cell: CellIndex, digit: Digit | null): Board {
    const next = [...this.values];
    next[cell] = digit;
    return new Board(Object.freeze(next));
  }

  toString(): string {
    return formatGrid(this.values);
  }

  /**
   * Digits not already placed in any peer. Empty for a filled cell — callers
   * asking about a filled cell want "nothing to place here", not the digit.
   */
  trueCandidates(cell: CellIndex): ReadonlySet<Digit> {
    const cached = this.#candidates[cell];
    if (cached) return cached;
    const set = new Set<Digit>();
    if (this.values[cell] === null) {
      for (const d of DIGITS) set.add(d);
      for (const peer of PEERS[cell]) {
        const v = this.values[peer];
        if (v !== null) set.delete(v);
      }
    }
    this.#candidates[cell] = set;
    return set;
  }

  peers(cell: CellIndex): readonly CellIndex[] {
    return PEERS[cell];
  }

  housesOf(cell: CellIndex): readonly House[] {
    return HOUSES_OF[cell];
  }

  emptyCells(): CellIndex[] {
    const out: CellIndex[] = [];
    for (let i = 0; i < CELL_COUNT; i++) if (this.values[i] === null) out.push(i);
    return out;
  }

  isSolved(): boolean {
    return this.values.every((v) => v !== null) && !this.hasContradiction();
  }

  /** A house holding the same digit twice, or an empty cell with no candidate. */
  hasContradiction(): boolean {
    for (const house of HOUSES) {
      const seen = new Set<Digit>();
      for (const c of house.cells) {
        const v = this.values[c];
        if (v === null) continue;
        if (seen.has(v)) return true;
        seen.add(v);
      }
    }
    for (let i = 0; i < CELL_COUNT; i++) {
      if (this.values[i] === null && this.trueCandidates(i).size === 0) return true;
    }
    return false;
  }

  /** Cells conflicting with `cell` under its own value (R2 conflict flagging). */
  conflictsAt(cell: CellIndex): CellIndex[] {
    const v = this.values[cell];
    if (v === null) return [];
    return PEERS[cell].filter((p) => this.values[p] === v);
  }

  /**
   * Digits noted in `cell` that a peer already holds.
   *
   * These are dead by the rules alone — no technique, no deduction, just a
   * digit that cannot go there any more because the player placed it next
   * door. Kept separate from `trueCandidates` because that answers "what could
   * go here", and this answers "what did the player's own move just kill".
   */
  staleAt(cell: CellIndex, noted: Iterable<Digit>): Digit[] {
    if (this.values[cell] !== null) return [...noted].sort((a, b) => a - b);
    const dead: Digit[] = [];
    for (const digit of noted) {
      if (PEERS[cell].some((peer) => this.values[peer] === digit)) dead.push(digit);
    }
    return dead.sort((a, b) => a - b);
  }

  /**
   * Every cell whose digit repeats in one of its houses, ascending.
   *
   * Whether these are shown is a player setting, which is why the board only
   * answers the question and holds no opinion about the answer being drawn.
   */
  conflicts(): CellIndex[] {
    const flagged: CellIndex[] = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (this.values[cell] !== null && this.conflictsAt(cell).length > 0) flagged.push(cell);
    }
    return flagged;
  }
}
