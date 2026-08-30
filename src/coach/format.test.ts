/**
 * Token rendering, and the house order it has to reconstruct.
 *
 * The `orderedHouses` block is the interesting one: it exists because the
 * frozen `coach/types.ts` promises a per-technique house order that the merged
 * detectors do not deliver — `buildFinding` sorts every finding's houses into
 * canonical position. These tests assert the *documented* order against
 * findings the real detectors produced, so if the engine is ever fixed to emit
 * it directly they keep passing and this module can be deleted.
 */

import { describe, expect, it } from 'vitest';
import { Board, cellName } from '../engine/board';
import { DETECTORS } from '../engine/techniques';
import { EXAMPLES } from '../engine/techniques/fixtures';
import type { Elimination, Finding, TechniqueId } from '../engine/types';
import { formatList, houseLabel } from '../i18n';
import {
  findingKey,
  formatCells,
  formatDigits,
  formatEliminations,
  formatHouse,
  houseRef,
  orderedHouses,
  placeholdersOf,
} from './format';

const findingFor = (id: TechniqueId): Finding => {
  const finding = DETECTORS[id].detect(Board.fromString(EXAMPLES[id]));
  expect(finding, `no ${id} on its own example grid`).not.toBeNull();
  return finding!;
};

describe('orderedHouses recovers the order the lesson copy assumes', () => {
  it('puts the box first for pointing, whatever the canonical sort did', () => {
    const finding = findingFor('pointing');
    // The engine really does hand back the line first here, which is the bug
    // this function works around.
    expect(finding.houses[0].kind).not.toBe('box');
    expect(orderedHouses(finding).map((h) => h.kind)).toEqual(['box', 'col']);
  });

  it('puts the line first for claiming', () => {
    const finding = findingFor('claiming');
    expect(finding.houses[0].kind).toBe('row');
    expect(orderedHouses(finding).map((h) => h.kind)).toEqual(['row', 'box']);
  });

  it('puts a fish s base lines before the lines it covers', () => {
    const finding = findingFor('swordfish');
    // Canonically sorted, base and cover lines interleave.
    expect(new Set(finding.houses.slice(0, 3).map((h) => h.kind)).size).toBe(2);
    const ordered = orderedHouses(finding);
    expect(new Set(ordered.slice(0, 3).map((h) => h.kind)).size).toBe(1);
    expect(new Set(ordered.slice(3).map((h) => h.kind)).size).toBe(1);
    const eliminated = new Set(finding.eliminations.map((e) => e.cell));
    for (const base of ordered.slice(0, 3)) {
      expect(base.cells.some((c) => eliminated.has(c))).toBe(false);
    }
  });

  it('leaves a finding it cannot classify exactly as it found it', () => {
    const finding = findingFor('x_wing');
    const covered = new Set(finding.houses.flatMap((h) => [...h.cells]));
    const outside = [...Array(81).keys()].find((c) => !covered.has(c))!;
    // An elimination in none of the finding's houses means base and cover
    // cannot be told apart: pass the houses through rather than guess.
    const opaque: Finding = { ...finding, eliminations: [{ cell: outside, digit: 1 }] };
    expect(orderedHouses(opaque)).toEqual(finding.houses);
  });

  it('leaves every other technique alone', () => {
    for (const id of ['naked_single', 'hidden_pair', 'xy_wing', 'remote_pairs'] as const) {
      const finding = findingFor(id);
      expect(orderedHouses(finding)).toEqual(finding.houses);
    }
  });
});

describe('token strings', () => {
  it('joins cells the way the locale joins things', () => {
    const cells = [0, 4, 8];
    expect(formatCells('en', cells)).toBe('r1c1, r1c5, and r1c9');
    expect(formatCells('it', cells)).toBe(formatList('it', cells.map(cellName)));
    expect(formatCells('it', cells)).not.toBe(formatCells('en', cells));
  });

  it('joins digits the same way', () => {
    expect(formatDigits('en', [3, 7])).toBe('3 and 7');
    expect(formatDigits('it', [3, 7])).toBe('3 e 7');
  });

  it('labels a house through i18n', () => {
    const finding = findingFor('hidden_single');
    const house = finding.houses[0];
    expect(formatHouse('en', house)).toBe(houseLabel('en', house.kind, house.index));
    expect(formatHouse('it', house)).not.toBe(formatHouse('en', house));
  });

  it('groups eliminations by digit, cells ascending', () => {
    const eliminations: Elimination[] = [
      { cell: 12, digit: 4 },
      { cell: 3, digit: 4 },
      { cell: 20, digit: 1 },
    ];
    expect(formatEliminations('en', eliminations)).toBe('1 (r3c3) and 4 (r1c4 and r2c4)');
  });

  it('renders an empty elimination list as nothing at all', () => {
    expect(formatEliminations('en', [])).toBe('');
  });

  it('strips a house down to what a Hint carries', () => {
    const house = findingFor('hidden_single').houses[0];
    expect(houseRef(house)).toEqual({ kind: house.kind, index: house.index });
    expect(houseRef(house)).not.toHaveProperty('cells');
  });

  it('reads the placeholders out of a template', () => {
    expect([...placeholdersOf('a {house} b {count} c {house}')].sort()).toEqual(['count', 'house']);
    expect([...placeholdersOf('nothing to fill')]).toEqual([]);
  });
});

describe('findingKey', () => {
  it('changes with the pattern and not with what it happens to prove', () => {
    const finding = findingFor('pointing');
    expect(findingKey({ ...finding, eliminations: [] })).toBe(findingKey(finding));
    expect(findingKey({ ...finding, cells: finding.cells.slice(1) })).not.toBe(findingKey(finding));
    expect(findingKey({ ...finding, digits: [9] })).not.toBe(findingKey(finding));
  });

  it('is a plain string, so it can be persisted and compared', () => {
    expect(typeof findingKey(findingFor('naked_pair'))).toBe('string');
  });
});
