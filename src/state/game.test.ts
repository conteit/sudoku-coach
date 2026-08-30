import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Board, CELL_COUNT } from '../engine/board';
import type { Digit } from '../engine/types';
import type { LiveGame } from './types';
import {
  elapsedAt, isComplete, MAX_HISTORY, newGame, progress, reduce, toLive, topBatch, toStored,
} from './game';
import type { GameAction } from './game';

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

/** First empty cell of PUZZLE — r1c3. Every single-cell test aims here. */
const OPEN = 2;
const GIVEN = 0;

const start = (over: Partial<Parameters<typeof newGame>[0]> = {}): LiveGame =>
  newGame({ id: 'g1', givens: PUZZLE, solution: SOLVED, difficulty: 'easy', at: 1000, ...over });

const run = (game: LiveGame, ...actions: GameAction[]): LiveGame =>
  actions.reduce(reduce, game);

const marks = (game: LiveGame, cell: number): Digit[] => [...game.cells[cell].candidates].sort();

describe('newGame', () => {
  it('locks the givens and leaves everything else open', () => {
    const game = start();
    expect(game.cells).toHaveLength(CELL_COUNT);
    expect(game.cells[GIVEN]).toEqual({ value: 5, given: true, candidates: new Set() });
    expect(game.cells[OPEN]).toEqual({ value: null, given: false, candidates: new Set() });
    expect(game.cells.filter((c) => c.given)).toHaveLength(
      [...PUZZLE].filter((c) => c !== '.').length,
    );
  });

  it('starts paused, unplayed and unfinished', () => {
    const game = start();
    expect([game.elapsedMs, game.runningSince, game.completedAt]).toEqual([0, null, null]);
    expect([game.undoStack, game.redoStack, game.coachLog]).toEqual([[], [], []]);
  });

  it('starts the clock only when asked', () => {
    expect(start({ running: true }).runningSince).toBe(1000);
  });

  it('mints an id when none is supplied', () => {
    expect(newGame({ givens: PUZZLE, solution: SOLVED, difficulty: 'easy', at: 1 }).id).toMatch(/\S/);
  });

  it('rejects an incomplete solution', () => {
    expect(() => start({ solution: PUZZLE })).toThrow(/complete grid/);
  });
});

describe('given cells', () => {
  const mutations: GameAction[] = [
    { type: 'setValue', cell: GIVEN, digit: 9, at: 2000 },
    { type: 'clearCell', cell: GIVEN, at: 2000 },
    { type: 'addCandidate', cell: GIVEN, digit: 9, at: 2000 },
    { type: 'removeCandidate', cell: GIVEN, digit: 9, at: 2000 },
    { type: 'toggleCandidate', cell: GIVEN, digit: 9, at: 2000 },
    { type: 'clearCandidates', cell: GIVEN, at: 2000 },
  ];

  it.each(mutations.map((a) => [a.type, a] as const))('ignores %s on a given', (_kind, action) => {
    const game = start();
    const next = reduce(game, action);
    expect(next).toBe(game);
    expect(next.undoStack).toEqual([]);
  });

  it('leaves the redo stack alone when a mutation is refused', () => {
    const played = run(
      start(),
      { type: 'setValue', cell: OPEN, digit: 4, at: 2000 },
      { type: 'undo', at: 2100 },
    );
    expect(played.redoStack).toHaveLength(1);
    expect(reduce(played, { type: 'setValue', cell: GIVEN, digit: 9, at: 2200 })).toBe(played);
  });

  it('never touches a given under a reset or a candidate fill', () => {
    const game = run(
      start(),
      { type: 'fillCandidates', at: 2000 },
      { type: 'reset', at: 3000 },
    );
    expect(game.cells[GIVEN]).toEqual({ value: 5, given: true, candidates: new Set() });
    expect(game.undoStack.every((m) => !game.cells[m.cell].given)).toBe(true);
  });
});

describe('single-cell moves', () => {
  it('records the exact prior cell on every move', () => {
    const game = run(
      start(),
      { type: 'addCandidate', cell: OPEN, digit: 4, at: 2000 },
      { type: 'setValue', cell: OPEN, digit: 1, at: 2001 },
    );
    expect(game.undoStack.map((m) => [m.kind, m.cell, m.digit, m.prev])).toEqual([
      ['addCandidate', OPEN, 4, { value: null, candidates: [] }],
      ['set', OPEN, 1, { value: null, candidates: [4] }],
    ]);
  });

  it('clears the cell candidates when a value goes in, and undo brings them back', () => {
    const pencilled = run(
      start(),
      { type: 'addCandidate', cell: OPEN, digit: 1, at: 2000 },
      { type: 'addCandidate', cell: OPEN, digit: 4, at: 2001 },
      { type: 'addCandidate', cell: OPEN, digit: 2, at: 2002 },
    );
    const placed = reduce(pencilled, { type: 'setValue', cell: OPEN, digit: 4, at: 3000 });
    expect(placed.cells[OPEN]).toEqual({ value: 4, given: false, candidates: new Set() });

    const undone = reduce(placed, { type: 'undo', at: 4000 });
    expect(undone.cells[OPEN].value).toBeNull();
    expect(marks(undone, OPEN)).toEqual([1, 2, 4]);
    expect(undone.cells).toEqual(pencilled.cells);
  });

  it('leaves a placement elsewhere without touching the player pencil marks', () => {
    // Architecture invariant 1: stale marks are the player's to clear.
    const peer = 1; // r1c2, a peer of OPEN
    const game = run(
      start(),
      { type: 'addCandidate', cell: OPEN, digit: 4, at: 2000 },
      { type: 'setValue', cell: peer, digit: 4, at: 2001 },
    );
    expect(marks(game, OPEN)).toEqual([4]);
  });

  it('toggles a candidate on and off', () => {
    const on = reduce(start(), { type: 'toggleCandidate', cell: OPEN, digit: 7, at: 2000 });
    expect(marks(on, OPEN)).toEqual([7]);
    const off = reduce(on, { type: 'toggleCandidate', cell: OPEN, digit: 7, at: 2001 });
    expect(marks(off, OPEN)).toEqual([]);
    expect(off.undoStack.map((m) => m.kind)).toEqual(['addCandidate', 'removeCandidate']);
  });

  it('refuses a pencil mark on a filled cell', () => {
    const filled = reduce(start(), { type: 'setValue', cell: OPEN, digit: 4, at: 2000 });
    expect(reduce(filled, { type: 'addCandidate', cell: OPEN, digit: 7, at: 2001 })).toBe(filled);
  });

  it('erases both the value and the marks, and undo restores both', () => {
    const before = reduce(start(), { type: 'addCandidate', cell: OPEN, digit: 7, at: 2000 });
    const erased = reduce(before, { type: 'clearCell', cell: OPEN, at: 2001 });
    expect(erased.cells[OPEN]).toEqual({ value: null, given: false, candidates: new Set() });
    expect(reduce(erased, { type: 'undo', at: 2002 }).cells).toEqual(before.cells);
  });

  it('clears only the marks under clearCandidates', () => {
    const before = run(
      start(),
      { type: 'addCandidate', cell: OPEN, digit: 7, at: 2000 },
      { type: 'addCandidate', cell: OPEN, digit: 1, at: 2001 },
    );
    const cleared = reduce(before, { type: 'clearCandidates', cell: OPEN, at: 2002 });
    expect(marks(cleared, OPEN)).toEqual([]);
    expect(cleared.undoStack.at(-1)?.prev).toEqual({ value: null, candidates: [1, 7] });
  });

  it.each([
    ['a value that is already there', { type: 'setValue', cell: OPEN, digit: 4 }],
    ['an erase of an empty cell', { type: 'clearCell', cell: OPEN }],
    ['a mark that is already set', { type: 'addCandidate', cell: OPEN, digit: 4 }],
    ['a mark that is not set', { type: 'removeCandidate', cell: OPEN, digit: 9 }],
    ['a clear of empty marks', { type: 'clearCandidates', cell: OPEN }],
    ['a cell outside the grid', { type: 'setValue', cell: 99, digit: 4 }],
  ] as const)('records nothing for %s', (_label, partial) => {
    // Each is exercised against a board where the action genuinely changes nothing.
    const base =
      partial.type === 'setValue' && partial.cell === OPEN
        ? reduce(start(), { type: 'setValue', cell: OPEN, digit: 4, at: 2000 })
        : partial.type === 'addCandidate'
          ? reduce(start(), { type: 'addCandidate', cell: OPEN, digit: 4, at: 2000 })
          : start();
    expect(reduce(base, { ...partial, at: 5000 } as GameAction)).toBe(base);
  });
});

describe('batched actions', () => {
  it('fills every empty cell with the engine candidates in one undo step', () => {
    const filled = reduce(start(), { type: 'fillCandidates', at: 2000 });
    const board = Board.fromString(PUZZLE);
    for (let i = 0; i < CELL_COUNT; i++) {
      expect(filled.cells[i].candidates).toEqual(new Set(board.trueCandidates(i)));
    }
    expect(filled.undoStack).toHaveLength(CELL_COUNT - [...PUZZLE].filter((c) => c !== '.').length);
    expect(new Set(filled.undoStack.map((m) => m.at)).size).toBe(1);

    const undone = reduce(filled, { type: 'undo', at: 3000 });
    expect(undone.cells).toEqual(start().cells);
    expect(undone.undoStack).toEqual([]);
    expect(undone.redoStack).toHaveLength(filled.undoStack.length);
  });

  it('exposes the batch as one MoveBatch', () => {
    const filled = reduce(start(), { type: 'fillCandidates', at: 2000 });
    const top = topBatch(filled.undoStack);
    expect(top?.label).toBe('fillCandidates');
    expect(top?.moves).toHaveLength(filled.undoStack.length);
    expect(topBatch([])).toBeNull();
  });

  it('replays a candidate fill on redo by recomputing it', () => {
    const filled = reduce(start(), { type: 'fillCandidates', at: 2000 });
    const again = run(filled, { type: 'undo', at: 3000 }, { type: 'redo', at: 4000 });
    expect(again.cells).toEqual(filled.cells);
    expect(again.undoStack).toEqual(filled.undoStack);
    expect(again.redoStack).toEqual([]);
  });

  it('replaces existing marks rather than merging with them', () => {
    const pencilled = reduce(start(), { type: 'addCandidate', cell: OPEN, digit: 9, at: 2000 });
    const filled = reduce(pencilled, { type: 'fillCandidates', at: 3000 });
    expect(marks(filled, OPEN)).toEqual([...Board.fromString(PUZZLE).trueCandidates(OPEN)].sort());
    expect(reduce(filled, { type: 'undo', at: 4000 }).cells).toEqual(pencilled.cells);
  });

  it('does nothing when the marks already match', () => {
    const filled = reduce(start(), { type: 'fillCandidates', at: 2000 });
    expect(reduce(filled, { type: 'fillCandidates', at: 3000 })).toBe(filled);
  });

  it('resets to the givens and undoes in one step', () => {
    const played = run(
      start(),
      { type: 'setValue', cell: OPEN, digit: 4, at: 2000 },
      { type: 'addCandidate', cell: 3, digit: 1, at: 2001 },
      { type: 'fillCandidates', at: 2002 },
    );
    const reset = reduce(played, { type: 'reset', at: 3000 });
    expect(reset.cells).toEqual(start().cells);
    expect(new Set(reset.undoStack.slice(played.undoStack.length).map((m) => m.at)).size).toBe(1);
    expect(reduce(reset, { type: 'undo', at: 4000 }).cells).toEqual(played.cells);
  });

  it('leaves the clock alone on reset so undo can restore the board exactly', () => {
    const played = run(
      start({ running: true }),
      { type: 'setValue', cell: OPEN, digit: 4, at: 2000 },
    );
    const reset = reduce(played, { type: 'reset', at: 3000 });
    expect([reset.elapsedMs, reset.runningSince]).toEqual([0, 1000]);
  });

  it('does not merge two actions that land in the same millisecond', () => {
    const game = run(
      start(),
      { type: 'setValue', cell: OPEN, digit: 4, at: 2000 },
      { type: 'setValue', cell: 3, digit: 6, at: 2000 },
    );
    expect(game.undoStack.map((m) => m.at)).toEqual([2000, 2001]);
    const undone = reduce(game, { type: 'undo', at: 2002 });
    expect(undone.cells[3].value).toBeNull();
    expect(undone.cells[OPEN].value).toBe(4);
  });
});

describe('undo and redo', () => {
  it('walks the whole history back and forward again', () => {
    const played = run(
      start(),
      { type: 'setValue', cell: OPEN, digit: 4, at: 2000 },
      { type: 'addCandidate', cell: 3, digit: 1, at: 2001 },
      { type: 'setValue', cell: 5, digit: 9, at: 2002 },
    );
    let game = played;
    for (let i = 0; i < 3; i++) game = reduce(game, { type: 'undo', at: 3000 + i });
    expect(game.cells).toEqual(start().cells);
    expect(game.undoStack).toEqual([]);
    for (let i = 0; i < 3; i++) game = reduce(game, { type: 'redo', at: 4000 + i });
    expect(game.cells).toEqual(played.cells);
    expect(game.undoStack).toEqual(played.undoStack);
  });

  it('drops the redo branch as soon as a new move is made', () => {
    const game = run(
      start(),
      { type: 'setValue', cell: OPEN, digit: 4, at: 2000 },
      { type: 'undo', at: 2001 },
      { type: 'setValue', cell: 3, digit: 6, at: 2002 },
    );
    expect(game.redoStack).toEqual([]);
    expect(game.undoStack.map((m) => m.cell)).toEqual([3]);
  });

  it('is a no-op on an empty stack', () => {
    const game = start();
    expect(reduce(game, { type: 'undo', at: 2000 })).toBe(game);
    expect(reduce(game, { type: 'redo', at: 2000 })).toBe(game);
  });

  it('caps the move log by dropping whole batches', () => {
    let game = reduce(start(), { type: 'fillCandidates', at: 2000 });
    const batchSize = game.undoStack.length;
    for (let i = 0; i < MAX_HISTORY; i++) {
      game = reduce(game, { type: 'toggleCandidate', cell: OPEN, digit: 1, at: 3000 + i });
    }
    expect(batchSize).toBeGreaterThan(1);
    expect(game.undoStack.length).toBeLessThanOrEqual(MAX_HISTORY);
    // The oldest batch went out whole, not sliced down the middle.
    expect(game.undoStack.some((m) => m.kind === 'fillCandidates')).toBe(false);
  });
});

describe('the clock', () => {
  it('accumulates only while running', () => {
    const game = run(
      start(),
      { type: 'resume', at: 1000 },
      { type: 'pause', at: 4000 },
      { type: 'resume', at: 10_000 },
      { type: 'pause', at: 10_500 },
    );
    expect(game.elapsedMs).toBe(3500);
    expect(game.runningSince).toBeNull();
    expect(elapsedAt(game, 999_999)).toBe(3500);
  });

  it('does not advance while paused, however long the app is backgrounded', () => {
    const paused = run(start(), { type: 'resume', at: 1000 }, { type: 'pause', at: 2000 });
    expect(elapsedAt(paused, 1000 + 86_400_000)).toBe(1000);
  });

  it('folds the running stretch on tick without disturbing the game list order', () => {
    const running = reduce(start({ running: true }), { type: 'tick', at: 4000 });
    expect([running.elapsedMs, running.runningSince, running.updatedAt]).toEqual([3000, 4000, 1000]);
    expect(elapsedAt(running, 5000)).toBe(4000);
  });

  it('ignores redundant transitions', () => {
    const paused = start();
    expect(reduce(paused, { type: 'pause', at: 2000 })).toBe(paused);
    expect(reduce(paused, { type: 'tick', at: 2000 })).toBe(paused);
    const running = reduce(paused, { type: 'resume', at: 2000 });
    expect(reduce(running, { type: 'resume', at: 3000 })).toBe(running);
  });

  it('shrugs off a clock that jumps backwards', () => {
    expect(elapsedAt(start({ running: true }), 500)).toBe(0);
  });
});

describe('completion', () => {
  /** The last cell the player has to fill; everything after it is a given. */
  const LAST_OPEN = PUZZLE.lastIndexOf('.');

  /** Every cell but `LAST_OPEN`, filled from the solution, clock running. */
  const nearlyDone = (): LiveGame => {
    let game = start({ running: true });
    let at = 2000;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (game.cells[i].given || i === LAST_OPEN) continue;
      game = reduce(game, { type: 'setValue', cell: i, digit: Number(SOLVED[i]) as Digit, at: at++ });
    }
    return game;
  };

  const finish = (): LiveGame =>
    reduce(nearlyDone(), {
      type: 'setValue', cell: LAST_OPEN, digit: Number(SOLVED[LAST_OPEN]) as Digit, at: 9000,
    });

  it('stamps the finish and stops the clock on the last digit', () => {
    const done = finish();
    expect(isComplete(done)).toBe(true);
    expect(done.completedAt).toBe(9000);
    expect(done.runningSince).toBeNull();
    expect(done.elapsedMs).toBe(8000);
    expect(progress(done)).toBe(100);
  });

  it('reopens the game when the last digit is undone', () => {
    const done = finish();
    const reopened = reduce(done, { type: 'undo', at: 9500 });
    expect(reopened.completedAt).toBeNull();
    // The clock stays stopped: restarting it is the player's call, not undo's.
    expect(reopened.runningSince).toBeNull();
    expect(reduce(reopened, { type: 'resume', at: 10_000 }).runningSince).toBe(10_000);
  });

  it('refuses to restart a finished game', () => {
    const done = finish();
    expect(reduce(done, { type: 'resume', at: 10_000 })).toBe(done);
  });

  it('is not fooled by a full but wrong grid', () => {
    let game = start();
    let at = 2000;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (game.cells[i].given) continue;
      game = reduce(game, { type: 'setValue', cell: i, digit: 1, at: at++ });
    }
    expect(isComplete(game)).toBe(false);
    expect(game.completedAt).toBeNull();
    expect(progress(game)).toBe(100);
  });
});

describe('progress', () => {
  it('counts the cells the player has filled, right or wrong', () => {
    expect(progress(start())).toBe(0);
    const one = reduce(start(), { type: 'setValue', cell: OPEN, digit: 9, at: 2000 });
    expect(progress(one)).toBe(Math.round((1 / 51) * 100));
  });

  it('calls a puzzle with nothing to fill complete', () => {
    expect(progress(start({ givens: SOLVED }))).toBe(100);
  });
});

describe('serialization', () => {
  it('round-trips through the stored shape', () => {
    const game = run(
      start({ running: true }),
      { type: 'fillCandidates', at: 2000 },
      { type: 'setValue', cell: OPEN, digit: 4, at: 3000 },
      { type: 'undo', at: 3500 },
    );
    expect(toLive(toStored(game))).toEqual(game);
  });

  it('sorts candidate arrays so equal boards serialize identically', () => {
    const a = run(
      start(),
      { type: 'addCandidate', cell: OPEN, digit: 9, at: 2000 },
      { type: 'addCandidate', cell: OPEN, digit: 2, at: 2001 },
    );
    const b = run(
      start(),
      { type: 'addCandidate', cell: OPEN, digit: 2, at: 2000 },
      { type: 'addCandidate', cell: OPEN, digit: 9, at: 2001 },
    );
    expect(toStored(a).cells[OPEN].candidates).toEqual([2, 9]);
    expect(toStored(a).cells).toEqual(toStored(b).cells);
  });

  it('carries the move log across, prev snapshots and all', () => {
    const game = reduce(start(), { type: 'setValue', cell: OPEN, digit: 4, at: 2000 });
    const stored = toStored(game);
    expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
    expect(toLive(stored).undoStack).toEqual(game.undoStack);
  });
});

describe('undo/redo round trip', () => {
  const digit = fc.integer({ min: 1, max: 9 }).map((n) => n as Digit);
  const cell = fc.integer({ min: 0, max: 80 });

  const anyAction = fc.oneof(
    fc.record({ type: fc.constant('setValue' as const), cell, digit }),
    fc.record({ type: fc.constant('clearCell' as const), cell }),
    fc.record({ type: fc.constant('toggleCandidate' as const), cell, digit }),
    fc.record({ type: fc.constant('addCandidate' as const), cell, digit }),
    fc.record({ type: fc.constant('removeCandidate' as const), cell, digit }),
    fc.record({ type: fc.constant('clearCandidates' as const), cell }),
    fc.record({ type: fc.constant('fillCandidates' as const) }),
    fc.record({ type: fc.constant('reset' as const) }),
  );

  it('returns the board and both stacks to their starting state', () => {
    fc.assert(
      fc.property(fc.array(anyAction, { maxLength: 40 }), (actions) => {
        const initial = start();
        let at = 2000;
        let game = initial;
        for (const action of actions) game = reduce(game, { ...action, at: at++ } as GameAction);

        const played = game;
        while (topBatch(game.undoStack) !== null) game = reduce(game, { type: 'undo', at: at++ });

        expect(game.cells).toEqual(initial.cells);
        expect(game.undoStack).toEqual([]);
        expect(game.completedAt).toBeNull();

        // ...and the redo branch replays the same session exactly.
        while (topBatch(game.redoStack) !== null) game = reduce(game, { type: 'redo', at: at++ });
        expect(game.cells).toEqual(played.cells);
        expect(game.undoStack).toEqual(played.undoStack);
        expect(game.redoStack).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it('never records a move against a given cell', () => {
    fc.assert(
      fc.property(fc.array(anyAction, { maxLength: 20 }), (actions) => {
        let at = 2000;
        let game = start();
        for (const action of actions) game = reduce(game, { ...action, at: at++ } as GameAction);
        for (const move of [...game.undoStack, ...game.redoStack]) {
          expect(game.cells[move.cell].given).toBe(false);
        }
        for (let i = 0; i < CELL_COUNT; i++) {
          if (PUZZLE[i] !== '.') expect(game.cells[i].value).toBe(Number(PUZZLE[i]));
        }
      }),
      { numRuns: 100 },
    );
  });
});
