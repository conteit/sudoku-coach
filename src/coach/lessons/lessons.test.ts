/**
 * The lesson library is content, but it is content the coach reads out loud, so
 * it is tested like code.
 *
 * Three things are checked here, and each of them is a requirement rather than
 * a style preference:
 *
 *  1. Coverage and shape — every technique has a lesson in every locale, and
 *     the two locales have identical structure (R7: the coach must never fall
 *     back to English because an Italian key is missing).
 *  2. Disclosure discipline (R7) — every template is parsed and rejected if it
 *     uses a token that is not permitted at its level, and every template in
 *     every locale is run past a set of assignment-phrasing regexes. This is
 *     the mechanical guarantee that no hint ever says "put N in rXcY".
 *  3. The worked examples are real. The detectors are being built on another
 *     branch and are deliberately not used here: each example is re-derived
 *     from the grid string alone, using `Board.trueCandidates`, against an
 *     explicit claim about what the pattern is and where. If a detector later
 *     disagrees with one of these boards, one of the two is wrong and this file
 *     says exactly what the board was supposed to show.
 */
import { describe, expect, it } from 'vitest';
import {
  Board,
  CELL_COUNT,
  cellName,
  HOUSES,
  parseGrid,
  peersOf,
  sharesHouse,
} from '../../engine/board';
import type { CellIndex, Digit, House, HouseKind } from '../../engine/types';
import { TECHNIQUE_IDS, type TechniqueId } from '../../engine/types';
import type { Locale } from '../../state/types';
import type { Lesson } from '../types';
import { HINT_TOKENS, TOKENS_ALLOWED_BY_LEVEL } from '../types';
import { exampleMarks, loadLessons, parseCellName } from './index';

const LOCALES: readonly Locale[] = ['en', 'it'] as const;
const LEVELS = ['1', '2', '3', '4'] as const;

const lessonsFor = (locale: Locale) => loadLessons(locale);
const everyLesson = (): [Locale, TechniqueId, Lesson][] =>
  LOCALES.flatMap((locale) =>
    TECHNIQUE_IDS.map((id): [Locale, TechniqueId, Lesson] => [locale, id, lessonsFor(locale)[id]]),
  );

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TOKEN = /\{(\w+)\}/g;
const tokensIn = (text: string): string[] => [...text.matchAll(TOKEN)].map((m) => m[1]);
/** The template with its placeholders removed, so we can inspect literal text. */
const literalText = (text: string): string => text.replace(TOKEN, ' ');

const sortedCandidates = (board: Board, cell: CellIndex): number[] =>
  [...board.trueCandidates(cell)].sort((a, b) => a - b);

const houseOf = (kind: HouseKind, oneBased: number): House => {
  const house = HOUSES.find((h) => h.kind === kind && h.index === oneBased - 1);
  if (!house) throw new Error(`no ${kind} ${oneBased}`);
  return house;
};

/** Cells of a house that are still empty. */
const emptyCellsOf = (board: Board, house: House): CellIndex[] =>
  house.cells.filter((c) => board.values[c] === null);

/** Where a digit can still go inside a house. */
const positionsOf = (board: Board, house: House, digit: Digit): CellIndex[] =>
  house.cells.filter((c) => board.trueCandidates(c).has(digit));

/** Backtracking solution counter, early exit at `cap`. Used to prove that each
 *  example grid is a real position of a real puzzle, not a plausible string. */
const countSolutions = (grid: string, cap = 2): number => {
  const values: number[] = parseGrid(grid).map((v) => v ?? 0);
  let found = 0;
  const search = (): boolean => {
    let target = -1;
    let options: number[] = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (values[i] !== 0) continue;
      const used = new Set(peersOf(i).map((p) => values[p]));
      const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d));
      if (free.length === 0) return false;
      if (target === -1 || free.length < options.length) {
        target = i;
        options = free;
        if (free.length === 1) break;
      }
    }
    if (target === -1) {
      found++;
      return found >= cap;
    }
    for (const d of options) {
      values[target] = d;
      if (search()) {
        values[target] = 0;
        return true;
      }
      values[target] = 0;
    }
    return false;
  };
  search();
  return found;
};

// ---------------------------------------------------------------------------
// What each worked example claims to show.
//
// These are the authored claims, kept beside the copy they illustrate. Every
// one is checked below against candidates recomputed from the grid string, and
// the elimination lists are checked for *completeness*, not just soundness: a
// claim that misses an elimination the pattern also proves fails too.
// ---------------------------------------------------------------------------

type HouseRef = readonly [HouseKind, number];
type Elim = readonly [cell: string, digit: Digit];

type Claim =
  | { kind: 'naked_single'; cell: string; digit: Digit }
  | { kind: 'hidden_single'; cell: string; digit: Digit; house: HouseRef }
  | { kind: 'naked_set'; house: HouseRef; cells: string[]; digits: Digit[]; eliminations: Elim[] }
  | { kind: 'hidden_set'; house: HouseRef; cells: string[]; digits: Digit[]; eliminations: Elim[] }
  | {
      kind: 'line_box';
      /** The house the digit is confined in. */
      from: HouseRef;
      /** The house that loses the digit as a result. */
      to: HouseRef;
      digit: Digit;
      cells: string[];
      eliminations: Elim[];
    }
  | {
      kind: 'fish';
      digit: Digit;
      base: HouseRef[];
      cover: HouseRef[];
      cells: string[];
      eliminations: Elim[];
    }
  | { kind: 'xy_wing'; pivot: string; arms: [string, string]; z: Digit; eliminations: Elim[] }
  | {
      kind: 'coloring';
      digit: Digit;
      links: [string, string][];
      tintA: string[];
      tintB: string[];
      eliminations: Elim[];
    }
  | { kind: 'remote_pairs'; digits: [Digit, Digit]; chain: string[]; eliminations: Elim[] };

const CLAIMS: Record<TechniqueId, Claim> = {
  // r4c1 sees eight distinct digits, so only 1 survives.
  naked_single: { kind: 'naked_single', cell: 'r4c1', digit: 1 },

  // Row 6 needs a 4; every empty cell but r6c1 already sees one. r6c1 keeps
  // three candidates, so it is genuinely hidden rather than a naked single.
  hidden_single: { kind: 'hidden_single', cell: 'r6c1', digit: 4, house: ['row', 6] },

  naked_pair: {
    kind: 'naked_set',
    house: ['row', 3],
    cells: ['r3c4', 'r3c7'],
    digits: [5, 8],
    eliminations: [
      ['r3c5', 5],
      ['r3c5', 8],
      ['r3c8', 5],
      ['r3c8', 8],
    ],
  },

  hidden_pair: {
    kind: 'hidden_set',
    house: ['row', 5],
    cells: ['r5c7', 'r5c9'],
    digits: [4, 8],
    eliminations: [
      ['r5c7', 3],
      ['r5c9', 1],
      ['r5c9', 3],
    ],
  },

  // Box 8 confines 7 to row 7, so row 7 loses it outside the box.
  pointing: {
    kind: 'line_box',
    from: ['box', 8],
    to: ['row', 7],
    digit: 7,
    cells: ['r7c5', 'r7c6'],
    eliminations: [['r7c9', 7]],
  },

  // Column 5 confines 1 to box 8, so box 8 loses it outside the column.
  claiming: {
    kind: 'line_box',
    from: ['col', 5],
    to: ['box', 8],
    digit: 1,
    cells: ['r7c5', 'r9c5'],
    eliminations: [['r9c6', 1]],
  },

  naked_triple: {
    kind: 'naked_set',
    house: ['col', 4],
    cells: ['r2c4', 'r7c4', 'r9c4'],
    digits: [3, 4, 6],
    eliminations: [
      ['r1c4', 6],
      ['r3c4', 4],
      ['r5c4', 4],
      ['r8c4', 3],
      ['r8c4', 4],
      ['r8c4', 6],
    ],
  },

  hidden_triple: {
    kind: 'hidden_set',
    house: ['box', 4],
    cells: ['r5c2', 'r6c2', 'r6c3'],
    digits: [1, 2, 5],
    eliminations: [
      ['r5c2', 4],
      ['r6c2', 4],
      ['r6c2', 8],
      ['r6c3', 4],
    ],
  },

  naked_quad: {
    kind: 'naked_set',
    house: ['col', 5],
    cells: ['r2c5', 'r3c5', 'r4c5', 'r7c5'],
    digits: [1, 5, 7, 9],
    eliminations: [
      ['r8c5', 1],
      ['r9c5', 9],
    ],
  },

  x_wing: {
    kind: 'fish',
    digit: 2,
    base: [
      ['row', 5],
      ['row', 8],
    ],
    cover: [
      ['col', 4],
      ['col', 9],
    ],
    cells: ['r5c4', 'r5c9', 'r8c4', 'r8c9'],
    eliminations: [
      ['r6c4', 2],
      ['r7c4', 2],
    ],
  },

  // Hinge r1c8 = {2,9}; arms r1c4 = {2,6} and r3c7 = {6,9}; shared digit 6.
  xy_wing: {
    kind: 'xy_wing',
    pivot: 'r1c8',
    arms: ['r1c4', 'r3c7'],
    z: 6,
    eliminations: [
      ['r1c7', 6],
      ['r3c4', 6],
    ],
  },

  swordfish: {
    kind: 'fish',
    digit: 4,
    base: [
      ['row', 3],
      ['row', 6],
      ['row', 8],
    ],
    cover: [
      ['col', 1],
      ['col', 2],
      ['col', 9],
    ],
    cells: ['r3c1', 'r3c9', 'r6c2', 'r6c9', 'r8c1', 'r8c2'],
    eliminations: [
      ['r1c1', 4],
      ['r5c2', 4],
    ],
  },

  // Three conjugate links on 7, two-coloured; r1c2 sees one cell of each tint.
  simple_coloring: {
    kind: 'coloring',
    digit: 7,
    links: [
      ['r1c6', 'r4c6'],
      ['r4c6', 'r5c5'],
      ['r5c5', 'r5c2'],
    ],
    tintA: ['r1c6', 'r5c5'],
    tintB: ['r4c6', 'r5c2'],
    eliminations: [['r1c2', 7]],
  },

  // Four {6,9} cells, three links, so the ends are opposites.
  remote_pairs: {
    kind: 'remote_pairs',
    digits: [6, 9],
    chain: ['r1c1', 'r1c9', 'r2c8', 'r7c8'],
    eliminations: [['r7c1', 6]],
  },
};

/** Cells the claim treats as the pattern itself, ignoring the targets. */
const claimPatternCells = (claim: Claim): string[] => {
  switch (claim.kind) {
    case 'naked_single':
    case 'hidden_single':
      return [claim.cell];
    case 'xy_wing':
      return [claim.pivot, ...claim.arms];
    case 'coloring':
      return [...claim.tintA, ...claim.tintB];
    case 'remote_pairs':
      return claim.chain;
    default:
      return claim.cells;
  }
};

const claimEliminations = (claim: Claim): readonly Elim[] =>
  'eliminations' in claim ? claim.eliminations : [];

const elimKey = ([cell, digit]: Elim): string => `${digit}@${cell}`;
const sortedElims = (elims: readonly Elim[]): string[] => elims.map(elimKey).sort();

// ---------------------------------------------------------------------------
// Coverage and structure
// ---------------------------------------------------------------------------

describe('lesson library coverage', () => {
  it.each(LOCALES)('%s has a lesson for every technique', (locale) => {
    const library = lessonsFor(locale);
    for (const id of TECHNIQUE_IDS) {
      expect(library[id], `${locale}: missing lesson ${id}`).toBeDefined();
      expect(library[id].id).toBe(id);
    }
    expect(Object.keys(library).sort()).toEqual([...TECHNIQUE_IDS].sort());
  });

  it.each(everyLesson())('%s/%s has complete, non-empty copy', (_locale, _id, lesson) => {
    for (const field of ['name', 'oneLiner', 'what', 'why'] as const) {
      expect(lesson[field].trim().length).toBeGreaterThan(0);
      expect(lesson[field]).toBe(lesson[field].trim());
    }
    // A lesson body that is one paragraph is a summary, not a lesson.
    expect(lesson.what).toContain('\n\n');
    expect(lesson.why).toContain('\n\n');
    expect(lesson.example.caption.trim().length).toBeGreaterThan(0);
    expect(Object.keys(lesson.templates).sort()).toEqual([...LEVELS]);
    for (const level of LEVELS) expect(lesson.templates[level].trim().length).toBeGreaterThan(0);
  });

  it('en and it have identical key structure', () => {
    const paths = (value: unknown, prefix = ''): string[] => {
      if (value === null || typeof value !== 'object') return [prefix];
      if (Array.isArray(value)) return [`${prefix}[]`];
      return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        paths(v, prefix ? `${prefix}.${k}` : k),
      );
    };
    expect(paths(lessonsFor('it')).sort()).toEqual(paths(lessonsFor('en')).sort());
  });

  it.each(TECHNIQUE_IDS)('%s uses the same worked board in both locales', (id) => {
    const en = lessonsFor('en')[id].example;
    const it = lessonsFor('it')[id].example;
    expect(it.grid).toBe(en.grid);
    expect(it.highlight).toEqual(en.highlight);
    expect(it.marks).toEqual(en.marks);
    // The caption is the one part that is genuinely rewritten per locale.
    expect(it.caption).not.toBe(en.caption);
  });

  it.each(everyLesson())('%s/%s keeps the house tone', (_locale, _id, lesson) => {
    const prose = [lesson.name, lesson.oneLiner, lesson.what, lesson.why, lesson.example.caption, ...LEVELS.map((l) => lesson.templates[l])];
    for (const text of prose) {
      expect(text, `no exclamation marks: ${text}`).not.toMatch(/!/);
      expect(text, `no emoji: ${text}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

// ---------------------------------------------------------------------------
// Disclosure discipline (R7)
// ---------------------------------------------------------------------------

/**
 * Phrasings that hand the player a cell-to-digit assignment. These run against
 * every template at every level, in both languages: level 4 is allowed to state
 * the logic and name the digit, but it is never allowed to say "write it here".
 */
const ASSIGNMENT_PATTERNS: readonly RegExp[] = [
  // "r3c1 = 4", "{cells}: {digit}", "{cells} -> 4"
  /(\{cells\}|r\d\s*c\d)\s*(=|:|->|→)\s*(\{digits?\}|\d)/i,
  /(\{digits?\}|\d)\s*(=|->|→)\s*(\{cells\}|r\d\s*c\d)/i,
  // "put 4 in r3c1", "write {digit} into {cells}", "metti 4 in r3c1"
  /\b(put|place[sd]?|write|enter|fill in)\b[^.]{0,60}?(\{cells\}|r\d\s*c\d)/i,
  /(^|[\s(])(metti|mettere|scrivi|scrivere|inserisci|inserire|piazza|piazzare|segna|segnare)\b[^.]{0,60}?(\{cells\}|r\d\s*c\d)/i,
  // "4 goes in r3c1", "il 4 va in r3c1"
  /\b(goes|belongs)\s+(in|into|at)\b/i,
  /(^|[\s(])va\s+(in|nella|nel|su)\b/i,
  // "{cells} is 4", "{cells} deve essere 4"
  /(\{cells\}|r\d\s*c\d)[^.]{0,40}?\s(is|are|must be|has to be)\s[^.]{0,20}?(\{digits?\}|\d)/i,
  /(\{cells\}|r\d\s*c\d)[^.]{0,40}?\s(è|sono|vale|valgono|deve essere|devono essere)\s[^.]{0,20}?(\{digits?\}|\d)/i,
];

/** Techniques whose finding is a placement: naming the digit and the cell in the
 *  same breath below level 4 would be handing over the answer. */
const PLACEMENT_TECHNIQUES: readonly TechniqueId[] = ['naked_single', 'hidden_single'];

describe('disclosure rule (R7)', () => {
  it.each(everyLesson())('%s/%s only uses tokens allowed at each level', (locale, id, lesson) => {
    for (const level of LEVELS) {
      const template = lesson.templates[level];
      const allowed: readonly string[] = TOKENS_ALLOWED_BY_LEVEL[level];
      for (const token of tokensIn(template)) {
        expect(HINT_TOKENS, `${locale}/${id} level ${level}: unknown token {${token}}`).toContain(
          token,
        );
        expect(
          allowed,
          `${locale}/${id} level ${level}: {${token}} is not permitted at this level`,
        ).toContain(token);
      }
    }
  });

  it.each(everyLesson())('%s/%s never hardcodes a cell below level 3', (locale, id, lesson) => {
    for (const level of ['1', '2'] as const) {
      expect(
        literalText(lesson.templates[level]),
        `${locale}/${id} level ${level} names a cell`,
      ).not.toMatch(/r\d\s*c\d/i);
    }
  });

  it.each(everyLesson())('%s/%s keeps level 1 free of digits', (locale, id, lesson) => {
    // Level 1 is region-only. Any literal digit in the copy — a cell name, a
    // house number, a value — would leak more than the level allows.
    expect(literalText(lesson.templates['1']), `${locale}/${id} level 1`).not.toMatch(/\d/);
  });

  it.each(everyLesson())('%s/%s names its technique at level 2, not level 1', (locale, id, lesson) => {
    const name = lesson.name.toLowerCase();
    expect(lesson.templates['2'].toLowerCase(), `${locale}/${id}`).toContain(name);
    expect(lesson.templates['1'].toLowerCase(), `${locale}/${id}`).not.toContain(name);
  });

  it.each(everyLesson())('%s/%s never phrases a placement', (locale, id, lesson) => {
    for (const level of LEVELS) {
      const template = lesson.templates[level];
      for (const pattern of ASSIGNMENT_PATTERNS) {
        expect(
          template,
          `${locale}/${id} level ${level} matches assignment pattern ${pattern}`,
        ).not.toMatch(pattern);
      }
    }
  });

  it.each(
    LOCALES.flatMap((locale) =>
      PLACEMENT_TECHNIQUES.map((id): [Locale, TechniqueId] => [locale, id]),
    ),
  )('%s/%s keeps digit and cell apart below level 4', (locale, id) => {
    const lesson = lessonsFor(locale)[id];
    for (const level of ['1', '2', '3'] as const) {
      const tokens = tokensIn(lesson.templates[level]);
      const namesDigit = tokens.includes('digit') || tokens.includes('digits');
      const namesCell = tokens.includes('cells');
      expect(
        namesDigit && namesCell,
        `${locale}/${id} level ${level} names both the digit and the cell`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The worked examples
// ---------------------------------------------------------------------------

describe('worked examples are real positions', () => {
  it.each(everyLesson())('%s/%s has a legal, solvable grid', (locale, id, lesson) => {
    const { grid } = lesson.example;
    expect(grid, `${locale}/${id}`).toHaveLength(CELL_COUNT);
    expect(() => parseGrid(grid)).not.toThrow();
    const board = Board.fromString(grid);
    expect(board.hasContradiction(), `${locale}/${id} grid contradicts itself`).toBe(false);
    expect(board.isSolved(), `${locale}/${id} grid is already finished`).toBe(false);
    // A single solution means this is a position from a real puzzle, not a
    // string that merely happens to be consistent.
    expect(countSolutions(grid), `${locale}/${id} grid is not uniquely solvable`).toBe(1);
  });

  it.each(everyLesson())('%s/%s marks match the true candidates', (locale, id, lesson) => {
    const board = Board.fromString(lesson.example.grid);
    const marks = exampleMarks(lesson);
    expect(marks.size, `${locale}/${id} has no marks`).toBeGreaterThan(0);
    for (const [cell, digits] of marks) {
      expect(board.values[cell], `${locale}/${id} ${cellName(cell)} is not empty`).toBeNull();
      expect(digits, `${locale}/${id} ${cellName(cell)}`).toEqual(sortedCandidates(board, cell));
    }
  });

  it.each(everyLesson())('%s/%s highlights exactly what the caption talks about', (locale, id, lesson) => {
    const claim = CLAIMS[id];
    const board = Board.fromString(lesson.example.grid);
    const expected = [
      ...new Set([
        ...claimPatternCells(claim).map(parseCellName),
        ...claimEliminations(claim).map(([cell]) => parseCellName(cell)),
      ]),
    ].sort((a, b) => a - b);
    expect(lesson.example.highlight, `${locale}/${id}`).toEqual(expected);
    for (const cell of lesson.example.highlight) {
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(CELL_COUNT);
      expect(board.values[cell], `${locale}/${id} highlights a filled cell`).toBeNull();
    }
    // Every highlighted cell is marked, so the mini board reads on its own.
    expect([...exampleMarks(lesson).keys()].sort((a, b) => a - b)).toEqual(expected);
  });
});

/**
 * Re-derives each pattern from the grid. Every check below works only from
 * `Board.trueCandidates`, so it is independent of the technique detectors.
 */
describe('worked examples really contain the technique', () => {
  const boardFor = (id: TechniqueId): Board => Board.fromString(lessonsFor('en')[id].example.grid);

  it('naked_single: the cell has exactly one candidate, and eight peers block the rest', () => {
    const claim = CLAIMS.naked_single as Extract<Claim, { kind: 'naked_single' }>;
    const board = boardFor('naked_single');
    const cell = parseCellName(claim.cell);
    expect(sortedCandidates(board, cell)).toEqual([claim.digit]);
    const peerDigits = new Set(peersOf(cell).map((p) => board.values[p]).filter((v) => v !== null));
    expect(peerDigits.size).toBe(8);
    expect(peerDigits.has(claim.digit)).toBe(false);
  });

  it('hidden_single: the digit has one home in the house, and the cell is not a naked single', () => {
    const claim = CLAIMS.hidden_single as Extract<Claim, { kind: 'hidden_single' }>;
    const board = boardFor('hidden_single');
    const house = houseOf(...claim.house);
    const cell = parseCellName(claim.cell);
    expect(house.cells).toContain(cell);
    expect(positionsOf(board, house, claim.digit)).toEqual([cell]);
    // More than one candidate is what makes it hidden rather than naked.
    expect(board.trueCandidates(cell).size).toBeGreaterThan(1);
    // And the digit really is still missing from the house.
    expect(house.cells.some((c) => board.values[c] === claim.digit)).toBe(false);
  });

  it.each(['naked_pair', 'naked_triple', 'naked_quad'] as const)(
    '%s: the cells draw on exactly their own digits, and clear the rest of the house',
    (id) => {
      const claim = CLAIMS[id] as Extract<Claim, { kind: 'naked_set' }>;
      const board = boardFor(id);
      const house = houseOf(...claim.house);
      const cells = claim.cells.map(parseCellName);
      expect(cells).toHaveLength(claim.digits.length);
      const union = new Set<Digit>();
      for (const cell of cells) {
        expect(house.cells).toContain(cell);
        const candidates = board.trueCandidates(cell);
        expect(candidates.size).toBeGreaterThanOrEqual(2);
        for (const d of candidates) {
          expect(claim.digits, `${cellName(cell)} strays outside the set`).toContain(d);
          union.add(d);
        }
      }
      // Not a smaller set in disguise: the union is the whole claimed set.
      expect([...union].sort((a, b) => a - b)).toEqual([...claim.digits].sort((a, b) => a - b));

      const proved: Elim[] = [];
      for (const cell of emptyCellsOf(board, house)) {
        if (cells.includes(cell)) continue;
        for (const d of claim.digits) {
          if (board.trueCandidates(cell).has(d)) proved.push([cellName(cell), d]);
        }
      }
      expect(sortedElims(proved)).toEqual(sortedElims(claim.eliminations));
      expect(proved.length).toBeGreaterThan(0);
    },
  );

  it.each(['hidden_pair', 'hidden_triple'] as const)(
    '%s: the digits live only in those cells, and the cells keep nothing else',
    (id) => {
      const claim = CLAIMS[id] as Extract<Claim, { kind: 'hidden_set' }>;
      const board = boardFor(id);
      const house = houseOf(...claim.house);
      const cells = claim.cells.map(parseCellName);
      expect(cells).toHaveLength(claim.digits.length);
      const covered = new Set<CellIndex>();
      for (const digit of claim.digits) {
        expect(house.cells.some((c) => board.values[c] === digit), `${digit} already placed`).toBe(
          false,
        );
        const positions = positionsOf(board, house, digit);
        expect(positions.length).toBeGreaterThanOrEqual(2);
        for (const cell of positions) {
          expect(cells, `${digit} escapes the hidden set at ${cellName(cell)}`).toContain(cell);
          covered.add(cell);
        }
      }
      // Every claimed cell is actually used, so the set is not oversized.
      expect([...covered].sort((a, b) => a - b)).toEqual([...cells].sort((a, b) => a - b));

      const proved: Elim[] = [];
      for (const cell of cells) {
        for (const d of board.trueCandidates(cell)) {
          if (!claim.digits.includes(d)) proved.push([cellName(cell), d]);
        }
      }
      expect(sortedElims(proved)).toEqual(sortedElims(claim.eliminations));
      expect(proved.length).toBeGreaterThan(0);
    },
  );

  it.each(['pointing', 'claiming'] as const)(
    '%s: the digit is confined to the overlap, and the other house loses it',
    (id) => {
      const claim = CLAIMS[id] as Extract<Claim, { kind: 'line_box' }>;
      const board = boardFor(id);
      const from = houseOf(...claim.from);
      const to = houseOf(...claim.to);
      const cells = claim.cells.map(parseCellName);
      // The claimed cells are exactly where the digit can still go in `from`.
      expect(positionsOf(board, from, claim.digit)).toEqual(cells);
      expect(cells.length).toBeGreaterThanOrEqual(2);
      // ...and all of them lie in the overlap with `to`.
      for (const cell of cells) expect(to.cells).toContain(cell);

      const proved: Elim[] = [];
      for (const cell of emptyCellsOf(board, to)) {
        if (cells.includes(cell)) continue;
        if (board.trueCandidates(cell).has(claim.digit)) proved.push([cellName(cell), claim.digit]);
      }
      expect(sortedElims(proved)).toEqual(sortedElims(claim.eliminations));
      expect(proved.length).toBeGreaterThan(0);
    },
  );

  it.each(['x_wing', 'swordfish'] as const)(
    '%s: every base line keeps the digit inside the cover lines',
    (id) => {
      const claim = CLAIMS[id] as Extract<Claim, { kind: 'fish' }>;
      const board = boardFor(id);
      const size = claim.base.length;
      expect(claim.cover).toHaveLength(size);
      const coverHouses = claim.cover.map((ref) => houseOf(...ref));
      const coverCells = new Set(coverHouses.flatMap((h) => [...h.cells]));
      const cells = claim.cells.map(parseCellName);

      const seen: CellIndex[] = [];
      const coversTouched = new Set<number>();
      for (const ref of claim.base) {
        const positions = positionsOf(board, houseOf(...ref), claim.digit);
        expect(positions.length).toBeGreaterThanOrEqual(2);
        expect(positions.length).toBeLessThanOrEqual(size);
        for (const cell of positions) {
          expect(coverCells, `${cellName(cell)} escapes the cover lines`).toContain(cell);
          coversTouched.add(coverHouses.findIndex((h) => h.cells.includes(cell)));
          seen.push(cell);
        }
      }
      // Each cover line is used, so the fish is not a smaller one padded out.
      expect(coversTouched.size).toBe(size);
      expect(seen.sort((a, b) => a - b)).toEqual([...cells].sort((a, b) => a - b));

      const proved: Elim[] = [];
      for (const house of coverHouses) {
        for (const cell of emptyCellsOf(board, house)) {
          if (cells.includes(cell)) continue;
          if (board.trueCandidates(cell).has(claim.digit)) {
            proved.push([cellName(cell), claim.digit]);
          }
        }
      }
      expect(sortedElims(proved)).toEqual(sortedElims(claim.eliminations));
      expect(proved.length).toBeGreaterThan(0);
    },
  );

  it('xy_wing: hinge and arms are bi-value, correctly linked, and force the shared digit', () => {
    const claim = CLAIMS.xy_wing as Extract<Claim, { kind: 'xy_wing' }>;
    const board = boardFor('xy_wing');
    const pivot = parseCellName(claim.pivot);
    const [armA, armB] = claim.arms.map(parseCellName);

    const pivotCandidates = [...board.trueCandidates(pivot)];
    expect(pivotCandidates).toHaveLength(2);
    for (const arm of [armA, armB]) {
      expect(board.trueCandidates(arm).size).toBe(2);
      expect(sharesHouse(pivot, arm), 'the hinge must see each arm').toBe(true);
      expect(board.trueCandidates(arm).has(claim.z)).toBe(true);
    }
    // Each arm shares exactly one of the hinge's two candidates, and a
    // different one, which is what makes the case split exhaustive.
    const sharedWithA = pivotCandidates.filter((d) => board.trueCandidates(armA).has(d));
    const sharedWithB = pivotCandidates.filter((d) => board.trueCandidates(armB).has(d));
    expect(sharedWithA).toHaveLength(1);
    expect(sharedWithB).toHaveLength(1);
    expect(sharedWithA[0]).not.toBe(sharedWithB[0]);
    // ...and the shared digit is not one of the hinge's own candidates.
    expect(pivotCandidates).not.toContain(claim.z);

    const proved: Elim[] = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (cell === pivot || cell === armA || cell === armB) continue;
      if (!board.trueCandidates(cell).has(claim.z)) continue;
      if (sharesHouse(cell, armA) && sharesHouse(cell, armB)) proved.push([cellName(cell), claim.z]);
    }
    expect(sortedElims(proved)).toEqual(sortedElims(claim.eliminations));
  });

  it('simple_coloring: every link is a conjugate pair, the tints alternate, and the target sees both', () => {
    const claim = CLAIMS.simple_coloring as Extract<Claim, { kind: 'coloring' }>;
    const board = boardFor('simple_coloring');
    const tintA = claim.tintA.map(parseCellName);
    const tintB = claim.tintB.map(parseCellName);
    const chain = [...tintA, ...tintB];

    for (const [a, b] of claim.links) {
      const [x, y] = [parseCellName(a), parseCellName(b)];
      // A strong link: some house holds exactly these two candidates for the digit.
      const conjugate = HOUSES.filter(
        (h) => h.cells.includes(x) && h.cells.includes(y),
      ).filter((h) => {
        const positions = positionsOf(board, h, claim.digit);
        return positions.length === 2 && positions.includes(x) && positions.includes(y);
      });
      expect(conjugate.length, `${a}-${b} is not a conjugate pair for ${claim.digit}`).toBeGreaterThan(0);
      // Opposite tints, which is what alternating colouring means.
      expect(tintA.includes(x) === tintB.includes(y), `${a}-${b} is not bichromatic`).toBe(true);
    }
    for (const cell of chain) expect(board.trueCandidates(cell).has(claim.digit)).toBe(true);

    const proved: Elim[] = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (chain.includes(cell)) continue;
      if (!board.trueCandidates(cell).has(claim.digit)) continue;
      const seesA = tintA.some((c) => sharesHouse(cell, c));
      const seesB = tintB.some((c) => sharesHouse(cell, c));
      if (seesA && seesB) proved.push([cellName(cell), claim.digit]);
    }
    expect(sortedElims(proved)).toEqual(sortedElims(claim.eliminations));
  });

  it('remote_pairs: an unbroken chain of identical pairs whose ends are an odd number of links apart', () => {
    const claim = CLAIMS.remote_pairs as Extract<Claim, { kind: 'remote_pairs' }>;
    const board = boardFor('remote_pairs');
    const chain = claim.chain.map(parseCellName);
    const digits = [...claim.digits].sort((a, b) => a - b);

    expect(chain.length).toBeGreaterThanOrEqual(4);
    for (const cell of chain) expect(sortedCandidates(board, cell)).toEqual(digits);
    for (let i = 1; i < chain.length; i++) {
      expect(sharesHouse(chain[i - 1], chain[i]), `link ${i} is broken`).toBe(true);
    }
    // An odd number of links is what makes the ends opposites.
    expect((chain.length - 1) % 2).toBe(1);

    const [start, end] = [chain[0], chain[chain.length - 1]];
    const proved: Elim[] = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (chain.includes(cell)) continue;
      if (!sharesHouse(cell, start) || !sharesHouse(cell, end)) continue;
      for (const d of claim.digits) {
        if (board.trueCandidates(cell).has(d)) proved.push([cellName(cell), d]);
      }
    }
    expect(sortedElims(proved)).toEqual(sortedElims(claim.eliminations));
  });
});

// ---------------------------------------------------------------------------
// The safety net, tested. A guard nobody has watched fail is not a guard.
// ---------------------------------------------------------------------------

describe('the disclosure guards themselves', () => {
  const flagged = (text: string): boolean => ASSIGNMENT_PATTERNS.some((p) => p.test(text));

  it.each([
    'The cell {cells} = {digit}.',
    'r3c1 -> 4',
    'Put {digit} in {cells}.',
    'Write 4 into r3c1.',
    '4 goes in r3c1.',
    '{cells} is {digit}.',
    'Metti {digit} in {cells}.',
    'Il 4 va in r3c1.',
    '{cells} è {digit}.',
  ])('rejects %j', (bad) => {
    expect(flagged(bad)).toBe(true);
  });

  it.each([
    'Look at {house}. One digit there is confined to a single row.',
    '{cells} hold nothing but {digits}. That removes {eliminations}.',
    'In {house}, {digit} survives only at {cells}.',
    'Dentro {house}, {digits} compaiono solo in {cells}.',
  ])('accepts %j', (good) => {
    expect(flagged(good)).toBe(false);
  });

  it('still reads the disclosure ladder off the frozen contract', () => {
    // If this ever fails, coach/types.ts changed and the whole library needs
    // re-reading — not this test relaxing.
    expect(TOKENS_ALLOWED_BY_LEVEL['1']).not.toContain('digit');
    expect(TOKENS_ALLOWED_BY_LEVEL['1']).not.toContain('cells');
    expect(TOKENS_ALLOWED_BY_LEVEL['2']).not.toContain('cells');
    expect(TOKENS_ALLOWED_BY_LEVEL['3']).not.toContain('eliminations');
    expect(TOKENS_ALLOWED_BY_LEVEL['4']).toEqual([...HINT_TOKENS]);
  });
});
