import { describe, expect, it } from 'vitest';
import { exerciseFor, gridOf } from '../engine/exercise';
import { TECHNIQUE_IDS, type CellIndex, type Digit } from '../engine/types';
import { EXPERT, HARD } from '../test/exercisePuzzles';
import { marksOf, patternRoles } from './roles';

const rolesAt = (givens: string, technique: (typeof TECHNIQUE_IDS)[number]) => {
  const position = exerciseFor(givens, technique)!;
  return { position, roles: patternRoles(position.finding, marksOf(position.candidates)) };
};

describe('patternRoles', () => {
  it('accounts for every pattern cell exactly once, whatever the technique', () => {
    for (const technique of TECHNIQUE_IDS) {
      const { position, roles } = rolesAt(EXPERT.givens, technique);
      const cells = roles.flatMap((role) => role.cells).sort((a, b) => a - b);
      expect(cells).toEqual([...position.finding.cells].sort((a, b) => a - b));
      expect(new Set(cells).size).toBe(cells.length);
      expect(roles.every((role) => role.cells.length > 0)).toBe(true);
    }
  });

  it('splits an XY-Wing into its hinge and its two arms', () => {
    const { position, roles } = rolesAt(HARD.givens, 'xy_wing');
    expect(roles.map((role) => role.id)).toEqual(['pivot', 'wings']);
    expect(roles[0].cells).toHaveLength(1);
    expect(roles[1].cells).toHaveLength(2);

    // The hinge is the cell without the eliminated digit; the arms both carry
    // it, which is the whole reason one of them must take it.
    const digit = position.finding.eliminations[0].digit;
    const marks = marksOf(position.candidates);
    expect(marks.get(roles[0].cells[0])!.has(digit)).toBe(false);
    expect(roles[1].cells.every((cell) => marks.get(cell)!.has(digit))).toBe(true);
  });

  it('gives the interchangeable patterns one undivided role', () => {
    expect(rolesAt(EXPERT.givens, 'naked_pair').roles.map((r) => r.id)).toEqual(['pattern']);
    expect(rolesAt(EXPERT.givens, 'x_wing').roles.map((r) => r.id)).toEqual(['corners']);
    expect(rolesAt(EXPERT.givens, 'simple_coloring').roles.map((r) => r.id)).toEqual(['chain']);
    expect(rolesAt(EXPERT.givens, 'naked_single').roles.map((r) => r.id)).toEqual(['cell']);
  });

  it('falls back to one role rather than guessing when the hinge cannot be read', () => {
    const position = exerciseFor(HARD.givens, 'xy_wing')!;
    // Marks that say every pattern cell holds the eliminated digit: no cell
    // can be the hinge, so there is no division to report.
    const blurred = new Map<CellIndex, Set<Digit>>(
      position.finding.cells.map((cell) => [cell, new Set<Digit>([1, 2, 3, 4, 5, 6, 7, 8, 9])]),
    );
    const roles = patternRoles(position.finding, blurred);
    expect(roles).toHaveLength(1);
    expect(roles[0].cells).toEqual(position.finding.cells);
  });

  it('reads the hinge off the position the pattern was found in', () => {
    // A guard against reading roles from basic candidates: `gridOf` is the
    // state the finding was proved on, and the hinge is only bivalue there.
    const position = exerciseFor(HARD.givens, 'xy_wing')!;
    const grid = gridOf(position);
    const roles = patternRoles(position.finding, marksOf(position.candidates));
    for (const cell of position.finding.cells) {
      expect(grid.trueCandidates(cell).size).toBe(2);
    }
    expect(roles[0].cells[0]).not.toBe(roles[1].cells[0]);
  });
});
