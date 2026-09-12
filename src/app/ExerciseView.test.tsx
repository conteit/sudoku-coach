/**
 * The practice screen, driven from the outside.
 *
 * The generator is stubbed rather than run: `useGenerator` spawns a real
 * worker, which jsdom has none of, and what is under test here is the
 * question-and-answer loop, not the digging. The puzzle it hands back is the
 * same expert fixture the engine tests use, so the positions asserted below
 * are the ones the engine really finds.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cellName } from '../engine/board';
import { exerciseAmong, exerciseFor, gridOf } from '../engine/exercise';
import { DETECTORS } from '../engine/techniques';
import { getLesson } from '../coach/lessons';
import {
  DIFFICULTY_TECHNIQUES,
  TECHNIQUE_IDS,
  type CellIndex,
  type TechniqueId,
} from '../engine/types';
import { DEFAULT_PROFILE } from '../state/mastery';
import { EXPERT } from '../test/exercisePuzzles';
import { renderWithLocale } from '../test/renderWithLocale';
import { ExerciseView } from './ExerciseView';

const result = {
  puzzle: {
    givens: EXPERT.givens,
    solution: EXPERT.solution,
    difficulty: 'expert' as const,
    hardestTechnique: 'simple_coloring' as TechniqueId,
    techniquesUsed: [] as TechniqueId[],
  },
  requested: 'expert' as const,
  matched: true,
  attempts: 1,
};

const generate = vi.fn(async () => result);
const generateNeeding = vi.fn(async () => ({ result, needed: true }));

vi.mock('./useGenerator', () => ({
  useGenerator: () => ({
    running: false,
    progress: null,
    failed: false,
    generate,
    generateNeeding,
    cancel: vi.fn(),
  }),
}));

const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

const show = (technique: TechniqueId | null) =>
  renderWithLocale(
    <ExerciseView
      technique={technique}
      profile={PROFILE}
      onExit={vi.fn()}
      onLearn={vi.fn()}
    />,
  );

const cell = (index: CellIndex) =>
  screen.getByRole('gridcell', { name: new RegExp(`^${cellName(index)},`) });

/**
 * The prompt and every refusal share one live region in the header, beside
 * the title. Read the region alone: the title sits in the same block, and a
 * test that swept it up would pass on a heading that said the wrong thing.
 */
const message = () =>
  screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent ?? '';

beforeEach(() => {
  window.innerWidth = 375;
  generate.mockClear();
  generateNeeding.mockClear();
});

describe('a technique exercise', () => {
  it('opens on the grid with every mark already written in', async () => {
    show('naked_pair');
    const position = exerciseFor(EXPERT.givens, 'naked_pair')!;
    const marked = position.candidates.findIndex((digits) => digits.length > 0) as CellIndex;

    expect(await screen.findByRole('grid')).toBeTruthy();
    expect(cell(marked).getAttribute('aria-label')).toContain('notes');
  });

  it('asks for the pattern cells first, and refuses one that is not in it', async () => {
    const user = userEvent.setup();
    show('naked_pair');
    await screen.findByRole('grid');
    const position = exerciseFor(EXPERT.givens, 'naked_pair')!;

    expect(message()).toContain('cells that form the pattern');

    const outside = ([...Array(81).keys()] as CellIndex[]).find(
      (index) => !position.finding.cells.includes(index),
    )!;
    await user.click(cell(outside));
    expect(message()).toContain('Not that cell');
  });

  it('walks the hinge and the arms of an XY-Wing in turn', async () => {
    const user = userEvent.setup();
    show('xy_wing');
    await screen.findByRole('grid');
    const position = exerciseFor(EXPERT.givens, 'xy_wing')!;
    const digit = position.finding.eliminations[0].digit;
    const pivot = position.finding.cells.find(
      (index) => !position.candidates[index].includes(digit),
    )!;

    expect(message()).toContain('hinge');
    await user.click(cell(pivot));
    expect(message()).toContain('arms');

    for (const arm of position.finding.cells.filter((index) => index !== pivot)) {
      await user.click(cell(arm));
    }
    expect(message()).toContain('take off');
  });

  it('refuses a note the pattern does not rule out, and keeps it on the board', async () => {
    const user = userEvent.setup();
    show('naked_pair');
    await screen.findByRole('grid');
    const position = exerciseFor(EXPERT.givens, 'naked_pair')!;
    for (const index of position.finding.cells) await user.click(cell(index));

    const target = position.finding.eliminations[0].cell;
    const spare = position.candidates[target].find(
      (digit) =>
        !position.finding.eliminations.some((e) => e.cell === target && e.digit === digit),
    )!;

    await user.click(cell(target));
    await user.click(screen.getByRole('button', { name: new RegExp(`note ${spare}`, 'i') }));

    expect(message()).toContain('does not rule that note out');
    expect(cell(target).getAttribute('aria-label')).toContain(String(spare));
  });

  it('calls the step solved once every elimination the pattern proves is gone', async () => {
    const user = userEvent.setup();
    show('naked_pair');
    await screen.findByRole('grid');
    const position = exerciseFor(EXPERT.givens, 'naked_pair')!;
    for (const index of position.finding.cells) await user.click(cell(index));

    for (const { cell: target, digit } of position.finding.eliminations) {
      await user.click(cell(target));
      await user.click(screen.getByRole('button', { name: new RegExp(`note ${digit}`, 'i') }));
    }

    expect(message()).toContain('Solved');
  });
});

describe('the mixed exercise', () => {
  /*
   * The mixed exercise draws a position at random — that is the feature — so
   * a test that names a technique has to know which board it is naming it
   * on. `Math.random` is pinned to 0 here and the same draw is replayed
   * below, which is what makes "this one applies" and "this one does not"
   * facts about the grid on screen rather than about the day.
   */
  const drawn = () => {
    const position = exerciseAmong(EXPERT.givens, DIFFICULTY_TECHNIQUES.expert, () => 0)!;
    const grid = gridOf(position);
    const absent = TECHNIQUE_IDS.find((id) => DETECTORS[id].detect(grid) === null)!;
    return {
      applies: getLesson('en', position.finding.technique).name,
      absent: getLesson('en', absent).name,
    };
  };

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks which technique applies before anything else, and refuses a wrong name', async () => {
    const user = userEvent.setup();
    show(null);
    await screen.findByRole('grid');

    expect(message()).toContain('Which technique');
    // The panel is a sheet on a phone, and the question *is* the panel, so it
    // opens itself rather than waiting to be found.
    const panel = await screen.findByRole('dialog', { name: 'Practice' });
    await user.click(within(panel).getByRole('button', { name: drawn().absent }));
    expect(message()).toContain('not on this grid');
  });

  it('does not name the technique in the heading it is asking about', async () => {
    // The screen used to read its own answer off `session.finding`, which is
    // set the moment the grid is built: the heading said "Naked pair" over
    // the question "which technique moves this board on?".
    show(null);
    await screen.findByRole('grid');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mixed practice');
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(drawn().applies);
  });

  it('names the technique in the heading once the player has named it', async () => {
    const user = userEvent.setup();
    show(null);
    const panel = await screen.findByRole('dialog', { name: 'Practice' });
    await user.click(within(panel).getByRole('button', { name: drawn().applies }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(drawn().applies);
  });

  it('takes a technique that genuinely applies and drills that one', async () => {
    const user = userEvent.setup();
    show(null);
    const panel = await screen.findByRole('dialog', { name: 'Practice' });
    await user.click(within(panel).getByRole('button', { name: drawn().applies }));
    expect(message()).not.toContain('not on this grid');
    expect(message()).toMatch(/Point at|Now /);
  });
});

describe('when no grid can be built', () => {
  it('says so and offers another go, rather than digging forever', async () => {
    generate.mockResolvedValueOnce(null as never);
    show('remote_pairs');

    expect(
      await screen.findByRole('button', { name: /try again/i }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain('No grid to practise this on');
  });

  it('keeps the way out on screen while a grid is still being built', () => {
    generate.mockReturnValueOnce(new Promise(() => {}) as never);
    show('x_wing');
    expect(screen.getByRole('button', { name: /leave practice/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
