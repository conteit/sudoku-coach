/**
 * The worked example is the one place a technique is *drawn* before a player
 * has ever claimed one, so it has to be drawn in the language they will meet
 * on the board. Paolo: *"remember to align also learn part"*.
 *
 * These read `data-mark` rather than the border classes, because a ring's
 * colour and stroke are Tailwind's business and what the mark *means* is not.
 */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getLesson } from '../../coach/lessons';
import { TECHNIQUE_IDS, type TechniqueId } from '../../engine/types';
import { renderWithLocale } from '../../test/renderWithLocale';
import { MARK_ALT, MARK_DASHED, MARK_ON, MARK_TARGET, marked } from '../board/patternMark';
import { Example } from './prose';

const marksOf = (id: TechniqueId): Map<number, number> => {
  renderWithLocale(<Example lesson={getLesson('en', id)} />);
  const found = new Map<number, number>();
  for (const cell of screen.getByRole('grid').querySelectorAll('[data-cell][data-mark]')) {
    found.set(Number(cell.getAttribute('data-cell')), Number(cell.getAttribute('data-mark')));
  }
  return found;
};

describe('a lesson draws its example the way the board draws a claim', () => {
  it('rings the colouring chain in two colours and squares only what it clears', () => {
    const marks = marksOf('simple_coloring');
    // r1c6 -> r4c6 -> r5c5 -> r5c2, and r1c2 is what the colouring removes 7 from.
    expect([5, 32, 40, 37].map((cell) => marked(marks.get(cell) ?? 0, MARK_ALT))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(marked(marks.get(1) ?? 0, MARK_TARGET)).toBe(true);
    for (const cell of [5, 32, 40, 37]) {
      expect(marked(marks.get(cell) ?? 0, MARK_TARGET), `r?c? ${cell} is not a target`).toBe(false);
    }
  });

  it('numbers the chain, so the order the argument runs in is on the board', () => {
    renderWithLocale(<Example lesson={getLesson('en', 'simple_coloring')} />);
    expect([...screen.getByRole('figure').querySelectorAll('svg text')].map((n) => n.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('dashes the wing arms against its solid hinge', () => {
    const marks = marksOf('xy_wing');
    expect(marked(marks.get(7) ?? 0, MARK_DASHED), 'the hinge r1c8 is solid').toBe(false);
    for (const arm of [3, 24]) {
      expect(marked(marks.get(arm) ?? 0, MARK_DASHED), `arm ${arm} is dashed`).toBe(true);
    }
  });

  it('gives a fish four plain corners — no order to imply, no role to divide', () => {
    const marks = marksOf('x_wing');
    for (const corner of [39, 44, 66, 71]) expect(marks.get(corner)).toBe(MARK_ON);
    for (const target of [48, 57]) expect(marks.get(target)).toBe(MARK_ON | MARK_TARGET);
  });

  it('keeps a hidden pair reading as the pair, though it is where the digits come off', () => {
    // The eliminations of a hidden set fall *inside* its own cells. Drawing
    // them as targets would turn the pattern into its own consequence.
    const marks = marksOf('hidden_pair');
    for (const cell of [42, 44]) {
      expect(marked(marks.get(cell) ?? 0, MARK_TARGET), `r5c${cell === 42 ? 7 : 9}`).toBe(false);
      expect(marked(marks.get(cell) ?? 0, MARK_ON)).toBe(true);
    }
  });

  it.each(TECHNIQUE_IDS)('%s marks every cell its caption talks about, and no other', (id) => {
    const lesson = getLesson('en', id);
    const marks = marksOf(id);
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([...lesson.example.highlight]);
  });
});
