/**
 * Logical solver and brute-force counter (spec §5.2 engine/solver).
 *
 * Two solvers live here because they answer two different questions.
 *
 * `solveLogically` answers "how would a *person* solve this, and how hard is
 * it": it walks the detector catalog in order and applies findings until the
 * grid is solved or nothing fires. Its output is the difficulty rating and, in
 * M6, the coach's hint stream.
 *
 * `countSolutions` and `solveBruteForce` answer "is this grid well-formed":
 * pure search, no technique vocabulary, no explanation. The generator calls
 * `countSolutions` once per dug clue — thousands of times per puzzle — so it is
 * written against typed-array bitmasks rather than the `Board` object graph.
 */

import type {
  BoardView, CellIndex, Digit, Finding, House, TechniqueId,
} from './types';
import { DIGITS } from './types';
import { Board, boxOf, CELL_COUNT, colOf, HOUSES, housesOf, peersOf, rowOf } from './board';
import { CATALOG, harderOf } from './techniques';

/* ------------------------------------------------------------------------ */
/* Mutable candidate grid                                                    */
/* ------------------------------------------------------------------------ */

/**
 * A `BoardView` whose candidates can be narrowed in place.
 *
 * `Board` recomputes candidates from the placed digits alone, so it cannot
 * remember that an X-Wing ruled a digit out three steps ago — replay it and the
 * candidate reappears. The logical solver needs that memory: most findings
 * eliminate rather than place, and a chain of eliminations is exactly what
 * makes a puzzle hard. So the solver runs against this layer, which starts from
 * `board.trueCandidates` and only ever shrinks.
 *
 * Shrinking is the invariant that keeps the whole engine sound: a cell's
 * candidate set here is always a subset of its true candidates, so any detector
 * reading it sees a legal — if pessimistic — view of the puzzle. Nothing ever
 * adds a candidate back.
 */
export class CandidateGrid implements BoardView {
  #values: (Digit | null)[];
  #candidates: Set<Digit>[];

  private constructor(values: (Digit | null)[], candidates: Set<Digit>[]) {
    this.#values = values;
    this.#candidates = candidates;
  }

  static fromBoard(view: BoardView): CandidateGrid {
    return new CandidateGrid(
      [...view.values],
      Array.from({ length: CELL_COUNT }, (_, c) => new Set(view.trueCandidates(c))),
    );
  }

  static fromString(grid: string): CandidateGrid {
    return CandidateGrid.fromBoard(Board.fromString(grid));
  }

  get values(): readonly (Digit | null)[] {
    return this.#values;
  }

  trueCandidates(cell: CellIndex): ReadonlySet<Digit> {
    return this.#candidates[cell];
  }

  peers(cell: CellIndex): readonly CellIndex[] {
    return peersOf(cell);
  }

  housesOf(cell: CellIndex): readonly House[] {
    return housesOf(cell);
  }

  /** Narrows one cell. Returns false when the candidate was already gone. */
  eliminate(cell: CellIndex, digit: Digit): boolean {
    return this.#candidates[cell].delete(digit);
  }

  /**
   * Writes a digit and propagates the immediate consequence: the cell has
   * nothing left to place, and no peer can take that digit. Returns false when
   * the cell already held the digit.
   */
  place(cell: CellIndex, digit: Digit): boolean {
    if (this.#values[cell] === digit) return false;
    this.#values[cell] = digit;
    this.#candidates[cell] = new Set();
    for (const peer of peersOf(cell)) this.#candidates[peer].delete(digit);
    return true;
  }

  /**
   * Applies a finding, placements before eliminations — a placement already
   * clears the digit from its peers, so doing it first keeps the elimination
   * list from re-reporting work as if it were new. Returns whether the grid
   * actually moved; a finding that changes nothing means the caller is looping.
   */
  apply(finding: Finding): boolean {
    let changed = false;
    for (const { cell, digit } of finding.placements) changed = this.place(cell, digit) || changed;
    for (const { cell, digit } of finding.eliminations) {
      changed = this.eliminate(cell, digit) || changed;
    }
    return changed;
  }

  isSolved(): boolean {
    return this.#values.every((v) => v !== null) && !this.hasContradiction();
  }

  /** A repeated digit in a house, or an empty cell with nothing left to try. */
  hasContradiction(): boolean {
    for (const house of HOUSES) {
      const seen = new Set<Digit>();
      for (const cell of house.cells) {
        const value = this.#values[cell];
        if (value === null) continue;
        if (seen.has(value)) return true;
        seen.add(value);
      }
    }
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (this.#values[cell] === null && this.#candidates[cell].size === 0) return true;
    }
    return false;
  }

  toBoard(): Board {
    return Board.fromValues(this.#values);
  }

  toString(): string {
    return this.toBoard().toString();
  }
}

/* ------------------------------------------------------------------------ */
/* Logical solve                                                             */
/* ------------------------------------------------------------------------ */

export interface LogicalSolution {
  solved: boolean;
  /** The grid the solver reached — solved, or as far as logic got. */
  board: Board;
  /** Techniques in order of first use. */
  techniquesUsed: TechniqueId[];
  /** Hardest technique by catalog rank; the puzzle's difficulty signal. */
  hardest: TechniqueId | null;
  /** Every finding applied, in order. */
  steps: Finding[];
}

/**
 * Every step removes at least one candidate or places a digit, so 810 is a hard
 * ceiling (729 candidates + 81 cells). The cap is a tripwire for a detector
 * that reports a finding it does not actually prove, not a tuning knob.
 */
const MAX_STEPS = 810;

/** The first finding any detector reports, in catalog order. */
export function firstFinding(board: BoardView): Finding | null {
  for (const detector of CATALOG) {
    const finding = detector.detect(board);
    if (finding) return finding;
  }
  return null;
}

/**
 * Solves as far as the catalog allows. Stops on solved, on contradiction, or
 * when no detector fires — the last of which is the definition of "harder than
 * the techniques we teach".
 */
export function solveLogically(board: BoardView): LogicalSolution {
  const grid = CandidateGrid.fromBoard(board);
  const steps: Finding[] = [];
  const techniquesUsed: TechniqueId[] = [];

  while (steps.length < MAX_STEPS && !grid.isSolved() && !grid.hasContradiction()) {
    const finding = firstFinding(grid);
    if (!finding || !grid.apply(finding)) break;
    steps.push(finding);
    if (!techniquesUsed.includes(finding.technique)) techniquesUsed.push(finding.technique);
  }

  return {
    solved: grid.isSolved(),
    board: grid.toBoard(),
    techniquesUsed,
    hardest: techniquesUsed.length === 0 ? null : techniquesUsed.reduce(harderOf),
    steps,
  };
}

/* ------------------------------------------------------------------------ */
/* Brute force                                                               */
/* ------------------------------------------------------------------------ */

const FULL_MASK = 0x1ff;

const ROW_INDEX = Uint8Array.from({ length: CELL_COUNT }, (_, i) => rowOf(i));
const COL_INDEX = Uint8Array.from({ length: CELL_COUNT }, (_, i) => colOf(i));
const BOX_INDEX = Uint8Array.from({ length: CELL_COUNT }, (_, i) => boxOf(i));

/** popcount for 9-bit masks, and the digit a single-bit mask stands for. */
const POPCOUNT = Uint8Array.from({ length: FULL_MASK + 1 }, (_, m) => {
  let n = 0;
  for (let bits = m; bits !== 0; bits &= bits - 1) n++;
  return n;
});
const DIGIT_OF = (() => {
  const table = new Uint8Array(FULL_MASK + 1);
  for (const d of DIGITS) table[1 << (d - 1)] = d;
  return table;
})();

/**
 * The search state: one digit byte per cell, a used-digit bitmask per row,
 * column and box, and the still-empty cells kept in a compact list.
 *
 * The list is what keeps the search cheap. Choosing a branch cell means scoring
 * every empty cell, and the tree's mass sits at its deepest levels where only a
 * handful of cells remain — scanning all 81 there would spend most of the
 * search re-reading cells that were filled dozens of frames ago. `empties` is
 * maintained by swapping the chosen cell to the end, which is O(1) both ways
 * because recursion unwinds in the exact reverse order.
 */
interface Search {
  grid: Uint8Array;
  rows: Int32Array;
  cols: Int32Array;
  boxes: Int32Array;
  /** `empties[0 .. open-1]` are the unfilled cells, in no meaningful order. */
  empties: Int32Array;
  /** Where each cell currently sits in `empties`. */
  slot: Int32Array;
  open: number;
}

/** Builds the search state, or null when the givens already conflict. */
function load(values: readonly (Digit | null)[]): Search | null {
  const state: Search = {
    grid: new Uint8Array(CELL_COUNT),
    rows: new Int32Array(9),
    cols: new Int32Array(9),
    boxes: new Int32Array(9),
    empties: new Int32Array(CELL_COUNT),
    slot: new Int32Array(CELL_COUNT),
    open: 0,
  };
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const value = values[cell];
    if (value === null || value === undefined) {
      state.slot[cell] = state.open;
      state.empties[state.open++] = cell;
      continue;
    }
    const bit = 1 << (value - 1);
    const r = ROW_INDEX[cell];
    const c = COL_INDEX[cell];
    const b = BOX_INDEX[cell];
    if ((state.rows[r] | state.cols[c] | state.boxes[b]) & bit) return null;
    state.rows[r] |= bit;
    state.cols[c] |= bit;
    state.boxes[b] |= bit;
    state.grid[cell] = value;
  }
  return state;
}

/** Fills `cell` and closes it, returning the slot `unset` needs to reopen it. */
function set(state: Search, cell: number, bit: number): number {
  state.rows[ROW_INDEX[cell]] |= bit;
  state.cols[COL_INDEX[cell]] |= bit;
  state.boxes[BOX_INDEX[cell]] |= bit;
  state.grid[cell] = DIGIT_OF[bit];
  const slot = state.slot[cell];
  const last = state.empties[--state.open];
  state.empties[slot] = last;
  state.slot[last] = slot;
  state.empties[state.open] = cell;
  state.slot[cell] = state.open;
  return slot;
}

function unset(state: Search, cell: number, bit: number, slot: number): void {
  state.rows[ROW_INDEX[cell]] &= ~bit;
  state.cols[COL_INDEX[cell]] &= ~bit;
  state.boxes[BOX_INDEX[cell]] &= ~bit;
  state.grid[cell] = 0;
  const displaced = state.empties[slot];
  state.empties[state.open] = displaced;
  state.slot[displaced] = state.open;
  state.empties[slot] = cell;
  state.slot[cell] = slot;
  state.open++;
}

/**
 * Branch cell and its legal digits, packed as `cell | mask << 8` to keep the
 * inner loop allocation-free; -1 when the grid is full.
 *
 * Fewest-candidates-first is the whole reason this search is fast: branching on
 * a 2-way cell instead of a 9-way one collapses the tree, and a 0-way cell
 * prunes it immediately.
 */
function mostConstrained(state: Search): number {
  let choice = -1;
  let best = 10;
  for (let k = 0; k < state.open; k++) {
    const i = state.empties[k];
    const legal =
      FULL_MASK & ~(state.rows[ROW_INDEX[i]] | state.cols[COL_INDEX[i]] | state.boxes[BOX_INDEX[i]]);
    const count = POPCOUNT[legal];
    if (count >= best) continue;
    choice = i | (legal << 8);
    best = count;
    if (count <= 1) break; // 0 is a dead end, 1 is forced: either way, stop looking.
  }
  return choice;
}

/** Counts up to `remaining` solutions from the current state. */
function countFrom(state: Search, remaining: number): number {
  if (state.open === 0) return 1;
  const choice = mostConstrained(state);
  const cell = choice & 0xff;
  let bits = choice >> 8;
  let found = 0;
  while (bits !== 0) {
    const bit = bits & -bits;
    bits ^= bit;
    const slot = set(state, cell, bit);
    found += countFrom(state, remaining - found);
    unset(state, cell, bit, slot);
    if (found >= remaining) break;
  }
  return found;
}

/**
 * How many solutions the grid has, counting no further than `limit`.
 *
 * The cap is not an optimisation detail the caller can ignore: the generator
 * only ever asks "is this unique", so the default stops the moment a second
 * solution appears rather than enumerating a half-empty grid's millions.
 */
export function countSolutions(board: BoardView, limit = 2): number {
  if (limit <= 0) return 0;
  const state = load(board.values);
  if (state === null) return 0;
  return countFrom(state, limit);
}

/** A source of numbers in [0,1). Injected so generation and tests are seedable. */
export type Rng = () => number;

function fill(state: Search, rng: Rng): boolean {
  if (state.open === 0) return true;
  const choice = mostConstrained(state);
  const cell = choice & 0xff;
  const bits: number[] = [];
  for (let rest = choice >> 8; rest !== 0; rest &= rest - 1) bits.push(rest & -rest);
  for (let i = bits.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bits[i], bits[j]] = [bits[j], bits[i]];
  }
  for (const bit of bits) {
    const slot = set(state, cell, bit);
    if (fill(state, rng)) return true;
    unset(state, cell, bit, slot);
  }
  return false;
}

/**
 * One solution, with the digit order shuffled by `rng`. Called on an empty
 * board it is a uniform-ish full-grid generator; called on a puzzle it is a
 * solution oracle. Returns null when the grid cannot be completed.
 */
export function solveBruteForce(board: BoardView, rng: Rng = Math.random): Board | null {
  const state = load(board.values);
  if (state === null) return null;
  if (!fill(state, rng)) return null;
  return Board.fromValues([...state.grid].map((v) => v as Digit));
}
