import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Board, CELL_COUNT } from './board';
import { CandidateGrid, countSolutions, firstFinding, solveBruteForce, solveLogically } from './solver';
import { CATALOG } from './techniques';
import {
  EMPTY_GRID, EXAMPLES, lcg, maskGrid, PUZZLES, SOLVED_GRID,
} from './techniques/fixtures';

/**
 * The easy puzzle with r1c3 set to 1. Nothing on the board contradicts it, so
 * only a full search can tell that the grid has no completion.
 */
const UNSATISFIABLE =
  '531.7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

const puzzle = (name: string) => {
  const found = PUZZLES.find((p) => p.name === name);
  if (!found) throw new Error(`no corpus puzzle named ${name}`);
  return found;
};

describe('CandidateGrid', () => {
  it('starts from the board\'s true candidates', () => {
    const board = Board.fromString(PUZZLES[0].givens);
    const grid = CandidateGrid.fromBoard(board);
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      expect([...grid.trueCandidates(cell)]).toEqual([...board.trueCandidates(cell)]);
    }
    expect(grid.values).toEqual(board.values);
  });

  it('remembers eliminations a rebuilt Board would forget', () => {
    // This is the whole reason the layer exists: findings mostly eliminate, and
    // a Board recomputes candidates from placed digits alone.
    const grid = CandidateGrid.fromString(EXAMPLES.naked_pair);
    expect(grid.trueCandidates(30).has(1)).toBe(true);
    expect(grid.eliminate(30, 1)).toBe(true);
    expect(grid.trueCandidates(30).has(1)).toBe(false);
    expect(grid.toBoard().trueCandidates(30).has(1)).toBe(true);
  });

  it('reports an eliminate that changed nothing', () => {
    const grid = CandidateGrid.fromString(EXAMPLES.naked_pair);
    expect(grid.eliminate(30, 1)).toBe(true);
    expect(grid.eliminate(30, 1)).toBe(false);
  });

  it('propagates a placement to its peers', () => {
    const grid = CandidateGrid.fromString(EXAMPLES.naked_single);
    expect(grid.place(70, 5)).toBe(true);
    expect(grid.values[70]).toBe(5);
    expect(grid.trueCandidates(70).size).toBe(0);
    for (const peer of grid.peers(70)) expect(grid.trueCandidates(peer).has(5)).toBe(false);
    expect(grid.place(70, 5)).toBe(false);
  });

  it('applies placements before eliminations and reports whether it moved', () => {
    const grid = CandidateGrid.fromString(EXAMPLES.naked_single);
    const finding = CATALOG[0].detect(grid);
    expect(finding).not.toBeNull();
    expect(grid.apply(finding!)).toBe(true);
    expect(grid.apply(finding!)).toBe(false);
  });

  it('notices a house holding a digit twice', () => {
    const grid = CandidateGrid.fromString(SOLVED_GRID);
    expect(grid.isSolved()).toBe(true);
    expect(grid.hasContradiction()).toBe(false);
    const broken = CandidateGrid.fromString(SOLVED_GRID.slice(0, 1) + '5' + SOLVED_GRID.slice(2));
    expect(broken.hasContradiction()).toBe(true);
    expect(broken.isSolved()).toBe(false);
  });

  it('notices an empty cell with nothing left to try', () => {
    const grid = CandidateGrid.fromString(PUZZLES[0].givens);
    for (const digit of grid.trueCandidates(2)) grid.eliminate(2, digit);
    expect(grid.hasContradiction()).toBe(true);
  });

  it('round-trips to a Board and a string', () => {
    const grid = CandidateGrid.fromString(PUZZLES[0].givens);
    expect(grid.toString()).toBe(PUZZLES[0].givens);
    expect(grid.toBoard().toString()).toBe(PUZZLES[0].givens);
    expect(grid.housesOf(0).map((h) => h.kind)).toEqual(['row', 'col', 'box']);
  });
});

describe('firstFinding', () => {
  it('returns the cheapest technique that applies', () => {
    // The naked-pair example also contains a hidden single; catalog order
    // decides, and hidden_single comes first.
    const board = Board.fromString(EXAMPLES.naked_pair);
    expect(firstFinding(board)?.technique).toBe('hidden_single');
  });

  it('returns null when nothing applies', () => {
    expect(firstFinding(Board.fromString(SOLVED_GRID))).toBeNull();
  });
});

describe('solveLogically', () => {
  it('solves each corpus puzzle to its known solution', () => {
    for (const p of PUZZLES) {
      const result = solveLogically(Board.fromString(p.givens));
      expect(result.solved, `${p.name}`).toBe(p.solvable);
      if (p.solvable) expect(result.board.toString(), `${p.name}`).toBe(p.solution);
    }
  });

  it('rates each corpus puzzle by the hardest technique its path needs', () => {
    for (const p of PUZZLES) {
      expect(solveLogically(Board.fromString(p.givens)).hardest, p.name).toBe(p.hardest);
    }
  });

  it('lists techniques in order of first use, without repeats', () => {
    const result = solveLogically(Board.fromString(puzzle('needs pointing').givens));
    expect(new Set(result.techniquesUsed).size).toBe(result.techniquesUsed.length);
    const firstUse = result.steps.map((s) => s.technique);
    expect(result.techniquesUsed[0]).toBe(firstUse[0]);
    for (const technique of result.techniquesUsed) {
      expect(firstUse).toContain(technique);
    }
    expect(result.techniquesUsed).toEqual(
      firstUse.filter((t, i) => firstUse.indexOf(t) === i),
    );
  });

  it('stops where the catalog runs out rather than guessing', () => {
    const stuck = puzzle('beyond the catalog');
    const result = solveLogically(Board.fromString(stuck.givens));
    expect(result.solved).toBe(false);
    expect(result.board.hasContradiction()).toBe(false);
    // What it did place is still correct — it just could not finish.
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const value = result.board.values[cell];
      if (value !== null) expect(value).toBe(Number(stuck.solution[cell]));
    }
    expect(firstFinding(CandidateGrid.fromBoard(result.board))).not.toBeNull();
  });

  it('reports nothing at all for a board it cannot touch', () => {
    const result = solveLogically(Board.fromString(EMPTY_GRID));
    expect(result).toMatchObject({ solved: false, techniquesUsed: [], hardest: null, steps: [] });
  });

  it('is a no-op on an already solved board', () => {
    const result = solveLogically(Board.fromString(SOLVED_GRID));
    expect(result.solved).toBe(true);
    expect(result.steps).toEqual([]);
  });

  it('records every step it applied, in order', () => {
    const result = solveLogically(Board.fromString(PUZZLES[0].givens));
    expect(result.steps.length).toBeGreaterThan(0);
    const replay = CandidateGrid.fromBoard(Board.fromString(PUZZLES[0].givens));
    for (const step of result.steps) expect(replay.apply(step)).toBe(true);
    expect(replay.toBoard().toString()).toBe(PUZZLES[0].solution);
  });
});

describe('countSolutions', () => {
  it('finds exactly one solution for a well-formed puzzle', () => {
    for (const p of PUZZLES) expect(countSolutions(Board.fromString(p.givens)), p.name).toBe(1);
  });

  it('stops at the limit for an under-constrained grid', () => {
    // An empty grid has ~6.67e21 solutions. The default limit is the only
    // reason this returns at all.
    expect(countSolutions(Board.fromString(EMPTY_GRID))).toBe(2);
    expect(countSolutions(Board.fromString(EMPTY_GRID), 1)).toBe(1);
    expect(countSolutions(Board.fromString(EMPTY_GRID), 25)).toBe(25);
    expect(countSolutions(Board.fromString(EMPTY_GRID), 0)).toBe(0);
  });

  it('counts a genuinely ambiguous puzzle, and stops early when told to', () => {
    // r1c4/r1c5 and r4c4/r4c5 hold 6,7 and 7,6 in the solved grid. Blank all
    // four and the pair can be swapped: exactly two solutions, and no amount of
    // logic can choose between them.
    const rectangle = [3, 4, 30, 31];
    const ambiguous = maskGrid(
      SOLVED_GRID,
      [...Array(CELL_COUNT).keys()].filter((c) => !rectangle.includes(c)),
    );
    expect(countSolutions(Board.fromString(ambiguous), 10)).toBe(2);
    // The early exit is the point: asking for one solution must not enumerate
    // the second.
    expect(countSolutions(Board.fromString(ambiguous), 1)).toBe(1);
    expect(solveLogically(Board.fromString(ambiguous)).solved).toBe(false);
  });

  it('finds no solution for a contradictory grid', () => {
    // Two 5s in row 1.
    expect(countSolutions(Board.fromString(`55${'.'.repeat(79)}`))).toBe(0);
    // Consistent givens with no completion: r1c3=1 conflicts with nothing on
    // the board, yet no full grid contains it.
    expect(Board.fromString(UNSATISFIABLE).hasContradiction()).toBe(false);
    expect(countSolutions(Board.fromString(UNSATISFIABLE))).toBe(0);
  });

  it('counts a 17-clue puzzle in single-digit milliseconds', () => {
    const board = Board.fromString(puzzle('seventeen clues').givens);
    const runs = 50;
    const started = performance.now();
    for (let i = 0; i < runs; i++) countSolutions(board);
    const perCall = (performance.now() - started) / runs;
    // The generator calls this thousands of times per puzzle, on the UI's
    // worker thread. Ten milliseconds a call would make generation visible.
    expect(perCall).toBeLessThan(10);
  });
});

describe('solveBruteForce', () => {
  it('returns the unique solution of a well-formed puzzle whatever the rng', () => {
    for (const p of PUZZLES) {
      for (const seed of [1, 7, 99]) {
        expect(solveBruteForce(Board.fromString(p.givens), lcg(seed))?.toString(), p.name)
          .toBe(p.solution);
      }
    }
  });

  it('is reproducible for a given rng and varies across seeds', () => {
    const first = solveBruteForce(Board.fromString(EMPTY_GRID), lcg(4))?.toString();
    const again = solveBruteForce(Board.fromString(EMPTY_GRID), lcg(4))?.toString();
    const other = solveBruteForce(Board.fromString(EMPTY_GRID), lcg(5))?.toString();
    expect(first).toBe(again);
    expect(first).not.toBe(other);
  });

  it('produces a legal full grid from nothing', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 30 }), (seed) => {
        const grid = solveBruteForce(Board.fromString(EMPTY_GRID), lcg(seed));
        expect(grid?.isSolved()).toBe(true);
      }),
      { numRuns: 25 },
    );
  });

  it('returns null when the grid cannot be completed', () => {
    expect(solveBruteForce(Board.fromString(`55${'.'.repeat(79)}`))).toBeNull();
    expect(solveBruteForce(Board.fromString(UNSATISFIABLE))).toBeNull();
  });

  it('agrees with countSolutions on whether a grid is solvable at all', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 30 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 80 }), { minLength: 20, maxLength: 60 }),
        (seed, keep) => {
          const full = solveBruteForce(Board.fromString(EMPTY_GRID), lcg(seed));
          const grid = Board.fromString(maskGrid(full!.toString(), keep));
          expect(solveBruteForce(grid, lcg(seed))?.isSolved()).toBe(true);
          expect(countSolutions(grid, 1)).toBe(1);
        },
      ),
      { numRuns: 30 },
    );
  });
});
