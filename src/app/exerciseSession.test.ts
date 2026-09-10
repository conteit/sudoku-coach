import { describe, expect, it } from 'vitest';
import { exerciseFor } from '../engine/exercise';
import type { CellIndex, Digit, TechniqueId } from '../engine/types';
import { EXPERT, HARD } from '../test/exercisePuzzles';
import {
  reduceSession,
  startSession,
  stepSolved,
  type ExerciseMode,
  type ExerciseSession,
} from './exerciseSession';

let clock = 1_000;
const at = () => (clock += 10);

function open(technique: TechniqueId, puzzle = EXPERT, mode?: ExerciseMode): ExerciseSession {
  const position = exerciseFor(puzzle.givens, technique)!;
  return startSession({
    mode: mode ?? { kind: 'technique', technique },
    position,
    solution: puzzle.solution,
    difficulty: puzzle.difficulty,
    at: at(),
    id: 'exercise',
  });
}

/** Name every cell of every role, in order. */
const nameAll = (session: ExerciseSession): ExerciseSession =>
  session.roles
    .flatMap((role) => role.cells)
    .reduce((s, cell) => reduceSession(s, { type: 'pick', cell }), session);

/** Do everything the step proves. */
const applyStep = (session: ExerciseSession): ExerciseSession => {
  const withNotes = session.finding.eliminations.reduce(
    (s, { cell, digit }) => reduceSession(s, { type: 'note', cell, digit, at: at() }),
    session,
  );
  return session.finding.placements.reduce(
    (s, { cell, digit }) => reduceSession(s, { type: 'place', cell, digit, at: at() }),
    withNotes,
  );
};

describe('startSession', () => {
  it('hands the player a board with the marks already in and nothing to undo', () => {
    const session = open('xy_wing', HARD);
    expect(session.game.undoStack).toEqual([]);
    expect(session.game.redoStack).toEqual([]);
    const marked = session.game.cells.filter((cell) => cell.candidates.size > 0);
    expect(marked.length).toBeGreaterThan(0);
    session.game.cells.forEach((cell, i) => {
      expect([...cell.candidates].sort()).toEqual([...session.position.candidates[i]].sort());
    });
  });

  it('locks the position in: every filled cell is a given', () => {
    const session = open('x_wing');
    session.game.cells.forEach((cell) => expect(cell.given).toBe(cell.value !== null));
  });

  it('asks for the technique first only when it is the open exercise', () => {
    expect(open('x_wing').stage).toEqual({ kind: 'roles', step: 0 });
    expect(
      open('x_wing', EXPERT, { kind: 'open', difficulty: 'expert' }).stage,
    ).toEqual({ kind: 'naming' });
  });
});

describe('naming the technique', () => {
  const openMode: ExerciseMode = { kind: 'open', difficulty: 'expert' };

  it('refuses a technique that does not apply to this board', () => {
    const session = open('naked_single', EXPERT, openMode);
    const after = reduceSession(session, { type: 'name', technique: 'swordfish' });
    expect(after.feedback).toBe('techniqueWrong');
    expect(after.stage).toEqual({ kind: 'naming' });
  });

  it('accepts any technique that genuinely applies, and drills that one', () => {
    const session = open('naked_pair', EXPERT, openMode);
    const after = reduceSession(session, { type: 'name', technique: 'naked_pair' });
    expect(after.feedback).toBeNull();
    expect(after.stage).toEqual({ kind: 'roles', step: 0 });
    expect(after.finding.technique).toBe('naked_pair');
  });
});

describe('naming the cells', () => {
  it('refuses a cell that is not playing the role being asked for', () => {
    const session = open('xy_wing', HARD);
    const outside = ([...Array(81).keys()] as CellIndex[]).find(
      (cell) => !session.finding.cells.includes(cell),
    )!;
    const after = reduceSession(session, { type: 'pick', cell: outside });
    expect(after.feedback).toBe('roleWrong');
    expect(after.named).toEqual([]);
    expect(after.stage).toEqual({ kind: 'roles', step: 0 });
  });

  it('refuses an arm while the hinge is what was asked for', () => {
    const session = open('xy_wing', HARD);
    const after = reduceSession(session, { type: 'pick', cell: session.roles[1].cells[0] });
    expect(after.feedback).toBe('roleWrong');
  });

  it('moves on to the next role once one is complete, then to the work', () => {
    const session = open('xy_wing', HARD);
    const hinged = reduceSession(session, { type: 'pick', cell: session.roles[0].cells[0] });
    expect(hinged.stage).toEqual({ kind: 'roles', step: 1 });

    const oneArm = reduceSession(hinged, { type: 'pick', cell: session.roles[1].cells[0] });
    expect(oneArm.stage).toEqual({ kind: 'roles', step: 1 });

    const bothArms = reduceSession(oneArm, { type: 'pick', cell: session.roles[1].cells[1] });
    expect(bothArms.stage).toEqual({ kind: 'applying' });
    expect([...bothArms.named].sort((a, b) => a - b)).toEqual(
      [...session.finding.cells].sort((a, b) => a - b),
    );
  });

  it('shrugs at a cell already named rather than counting it twice', () => {
    const session = open('naked_pair');
    const cell = session.roles[0].cells[0];
    const once = reduceSession(session, { type: 'pick', cell });
    const twice = reduceSession(once, { type: 'pick', cell });
    expect(twice.named).toEqual(once.named);
    expect(twice.feedback).toBeNull();
  });
});

describe('doing what the pattern proves', () => {
  it('refuses to erase a mark this pattern does not rule out', () => {
    const session = nameAll(open('xy_wing', HARD));
    const { cell } = session.finding.eliminations[0];
    const spare = [...session.game.cells[cell].candidates].find(
      (digit) =>
        !session.finding.eliminations.some((e) => e.cell === cell && e.digit === digit),
    )!;
    const after = reduceSession(session, { type: 'note', cell, digit: spare, at: at() });
    expect(after.feedback).toBe('notProved');
    expect(after.game.cells[cell].candidates.has(spare)).toBe(true);
    expect(after.game.undoStack).toEqual([]);
  });

  it('accepts each elimination the pattern proves, and calls the step done at the last', () => {
    const session = nameAll(open('xy_wing', HARD));
    expect(session.stage).toEqual({ kind: 'applying' });
    const solved = applyStep(session);
    expect(solved.stage).toEqual({ kind: 'solved' });
    expect(stepSolved(solved.game, solved.finding)).toBe(true);
  });

  it('lets a player write a mark back without judging it', () => {
    const session = nameAll(open('xy_wing', HARD));
    const empty = session.game.cells.findIndex(
      (cell) => cell.value === null && !cell.candidates.has(9),
    ) as CellIndex;
    const after = reduceSession(session, { type: 'note', cell: empty, digit: 9, at: at() });
    expect(after.feedback).toBeNull();
    expect(after.game.cells[empty].candidates.has(9)).toBe(true);
  });

  it('refuses a placement this step does not prove', () => {
    const session = nameAll(open('xy_wing', HARD));
    const cell = session.finding.cells[0];
    const digit = [...session.game.cells[cell].candidates][0] as Digit;
    const after = reduceSession(session, { type: 'place', cell, digit, at: at() });
    expect(after.feedback).toBe('notPlaced');
    expect(after.game.cells[cell].value).toBeNull();
  });

  it('takes the placement a single proves', () => {
    const session = nameAll(open('naked_single'));
    const { cell, digit } = session.finding.placements[0];
    const after = reduceSession(session, { type: 'place', cell, digit, at: at() });
    expect(after.stage).toEqual({ kind: 'solved' });
    expect(after.game.cells[cell].value).toBe(digit);
  });

  it('refuses a different digit in the very cell the single is about', () => {
    const session = nameAll(open('naked_single'));
    const { cell, digit } = session.finding.placements[0];
    const other = ((digit % 9) + 1) as Digit;
    const after = reduceSession(session, { type: 'place', cell, digit: other, at: at() });
    expect(after.feedback).toBe('notPlaced');
    expect(after.stage).toEqual({ kind: 'applying' });
  });

  it('lets the eraser take back a placement, and nothing else', () => {
    const session = nameAll(open('naked_single'));
    const { cell, digit } = session.finding.placements[0];
    const placed = reduceSession(session, { type: 'place', cell, digit, at: at() });
    const given = placed.game.cells.findIndex((c) => c.given) as CellIndex;
    expect(reduceSession(placed, { type: 'clear', cell: given, at: at() })).toBe(placed);

    const cleared = reduceSession(placed, { type: 'clear', cell, at: at() });
    expect(cleared.game.cells[cell].value).toBeNull();
    expect(cleared.stage).toEqual({ kind: 'applying' });
  });

  it('puts the player back to work when an undo takes the step apart again', () => {
    const solved = applyStep(nameAll(open('xy_wing', HARD)));
    expect(solved.stage).toEqual({ kind: 'solved' });
    const undone = reduceSession(solved, { type: 'undo', at: at() });
    expect(undone.stage).toEqual({ kind: 'applying' });
    const redone = reduceSession(undone, { type: 'redo', at: at() });
    expect(redone.stage).toEqual({ kind: 'solved' });
  });

  it('ignores board actions while the cells are still being named', () => {
    const session = open('xy_wing', HARD);
    const { cell, digit } = session.finding.eliminations[0];
    expect(reduceSession(session, { type: 'note', cell, digit, at: at() })).toBe(session);
  });
});

describe('feedback', () => {
  it('clears on request and is not re-raised by a correct answer', () => {
    const session = open('naked_pair');
    const outside = ([...Array(81).keys()] as CellIndex[]).find(
      (cell) => !session.finding.cells.includes(cell),
    )!;
    const wrong = reduceSession(session, { type: 'pick', cell: outside });
    expect(wrong.feedback).not.toBeNull();
    expect(reduceSession(wrong, { type: 'dismissFeedback' }).feedback).toBeNull();
    const right = reduceSession(wrong, { type: 'pick', cell: session.roles[0].cells[0] });
    expect(right.feedback).toBeNull();
  });
});
