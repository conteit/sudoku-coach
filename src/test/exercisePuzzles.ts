/**
 * Four generated puzzles, frozen as strings.
 *
 * The exercise search needs whole puzzles rather than the single positions in
 * `engine/techniques/fixtures.ts`: what it is being asked is "walk this solve
 * path and find where the technique becomes the move", which a position
 * cannot answer. Generating them per run would put a second of digging into
 * the unit suite and would let a generator change quietly rewrite what the
 * tests are about, so they are recorded here instead — seeds 2001, 2003, 2005
 * and 2007 at each difficulty.
 *
 * `expert` is the interesting one: all fourteen techniques appear somewhere
 * along its path, which is what makes a whole-catalog assertion possible.
 */

import type { Difficulty } from '../engine/types';

export interface ExercisePuzzle {
  givens: string;
  solution: string;
  difficulty: Difficulty;
}

export const EASY: ExercisePuzzle = {
  givens: '.....9.472...5..19...3......182....3..91.38..3....579......2...12..3...583.6.....',
  solution: '653819247284756319791324586418297653579163824362485791946572138127938465835641972',
  difficulty: 'easy',
};

export const MEDIUM: ExercisePuzzle = {
  givens: '1.4.28....8......2.5...17....8.6.234.9.....6.246.8.9....75...2.4......7....97.6.3',
  solution: '174628395689357142352491786518769234793245861246183957937516428461832579825974613',
  difficulty: 'medium',
};

export const HARD: ExercisePuzzle = {
  givens: '.1..8....679..4...2..7.3....9...6.534.......153.4...7....1.5..4...9..265....6..1.',
  solution: '314689527679524138258713946891276453427358691536491872962135784183947265745862319',
  difficulty: 'hard',
};

export const EXPERT: ExercisePuzzle = {
  givens: '4..8...2.1.......8.9...5.4..87.9.5..9...3...2..2.8.37..7.4...1.8.......5.1...8..4',
  solution: '435869127126347958798125643387294561951736482642581379279453816864912735513678294',
  difficulty: 'expert',
};
