/**
 * Finding a position to practise a technique on.
 *
 * An exercise is a board frozen at the moment one technique is the way
 * forward, with the candidates already written in. The digging is done; the
 * player's whole job is to see the pattern.
 *
 * ## Why the marks are the solve path's candidates and not the board's
 *
 * The obvious construction — take the values at that point and pencil in
 * `Board.trueCandidates` — does not work, and the reason is worth writing
 * down because it cost a measurement to find. Basic candidates are a superset
 * of what a solver has proved by the time a hard technique fires: every
 * elimination the easier techniques earned is missing from them. Two things
 * follow, both fatal. The pattern usually is not there at all — an XY-Wing
 * needs bivalue cells, and a cell only becomes bivalue once something has
 * taken the third digit off it. And where it survives, a naked single
 * elsewhere on the board is almost always available too, so the position is
 * not a drill in the technique, it is a drill in spotting a single. Judged
 * that way, nine of the fourteen techniques were found in 0 of 12 generated
 * puzzles, against solve paths that had genuinely used them.
 *
 * So an exercise carries the `CandidateGrid`'s state: values, plus exactly the
 * candidates the solver still holds open at that step. That is the position a
 * player reaches by working the puzzle honestly, it is sound — every mark
 * missing from it was removed by a proof — and the technique fires there.
 *
 * The cost is that the coach cannot re-derive the step from the board:
 * `createCoach` builds from values alone (invariant 3b) and would be looking
 * at the basic candidates again. It does not need to. The finding is known
 * here, and `renderHint` is a pure function of a finding — so an exercise
 * carries its own step and asks the coach to explain *that* one, rather than
 * asking it to go looking.
 *
 * ## Three grades of position, and why the middle one exists
 *
 * `exclusive` is the position where the solver itself reached for the
 * technique, so nothing cheaper in the catalog applied. That is the drill
 * everyone wants and it is tried first, but for some techniques it barely
 * exists: over 20 puzzles at each technique's own difficulty, `hidden_triple`,
 * `naked_quad` and `remote_pairs` were the solver's next step 0 times, and
 * `claiming` and `naked_triple` once. They are real patterns that something
 * cheaper always happens to beat to the board.
 *
 * The first fallback tried was "the pattern is present", and it was wrong in a
 * way only playing it revealed: the pattern is present very early, while
 * singles are still everywhere, so the drill handed over a grid with a cell
 * already down to one candidate. A player reads that as the answer, does it,
 * and is told it is not part of the pattern — the exercise looks like a trick.
 * Worse, the good position usually existed in the same puzzle and was walked
 * straight past: 12 of 20 puzzles offered `hidden_pair` on a board with no
 * single on it, and the search took an earlier, polluted one every time.
 *
 * So `clean` is the middle grade and the one the fallback actually aims at:
 * the pattern is there and **no single is anywhere on the board**, which is
 * what makes a position feel stuck rather than rigged. Something else at the
 * same sort of level may also apply, and that is ordinary sudoku. `shared` —
 * a single is available too — is a last resort, kept only because refusing it
 * would mean refusing to drill `naked_quad` at all, and the screen says so
 * plainly when it has to use one.
 */

import { formatGrid } from './board';
import { CandidateGrid, firstFinding } from './solver';
import type { Rng } from './solver';
import { DETECTORS } from './techniques';
import {
  DIFFICULTIES,
  DIFFICULTY_TECHNIQUES,
  type CellIndex,
  type Difficulty,
  type Digit,
  type Finding,
  type TechniqueId,
} from './types';

/** How good a drill this position is. Best first; see the module comment. */
export type PositionQuality =
  /** The solver's own next step: nothing in the catalog is easier. */
  | 'exclusive'
  /** The pattern is there and no single is, so the board is genuinely stuck. */
  | 'clean'
  /** The pattern is there, but so is a single. A last resort. */
  | 'shared';

/** One board, one step, and the marks the player starts with. */
export interface ExercisePosition {
  /** 81 values. Every filled cell is a given here: the position is the premise. */
  values: (Digit | null)[];
  /** The marks to pre-fill, per cell. Empty for a filled cell. */
  candidates: Digit[][];
  /** The step this position is about. */
  finding: Finding;
  quality: PositionQuality;
}

/**
 * The solver's own cap, restated rather than imported — `solver.ts` keeps it
 * private, and a walk that cannot terminate is a hang either way.
 */
const MAX_STEPS = 810;

const snapshot = (
  grid: CandidateGrid,
  finding: Finding,
  quality: PositionQuality,
): ExercisePosition => ({
  values: [...grid.values],
  candidates: grid.values.map((value, cell) =>
    value === null ? [...grid.trueCandidates(cell as CellIndex)] : [],
  ),
  finding,
  quality,
});

/**
 * Is a digit simply waiting to be written in somewhere on this board?
 *
 * The test that separates `clean` from `shared`. Both single detectors,
 * because either one hands the player a move that needs no pattern at all,
 * and that is the move they will take.
 */
const singleAvailable = (grid: CandidateGrid): boolean =>
  DETECTORS.naked_single.detect(grid) !== null || DETECTORS.hidden_single.detect(grid) !== null;

/**
 * The best position this puzzle offers for practising `technique`.
 *
 * One walk, best-of-three. An `exclusive` position ends it immediately; short
 * of that the walk keeps going and keeps the best it has seen, because the
 * good position is usually *later* than the first one — early in a solve the
 * pattern and a naked single are both on the board, and it is the single the
 * player will take.
 *
 * The probing stops once a `clean` position is in hand: from then on only an
 * exclusive one would be an improvement, and `firstFinding` already answers
 * that. So the extra detector sweep runs on the early steps and then stops.
 */
export function exerciseFor(givens: string, technique: TechniqueId): ExercisePosition | null {
  const grid = CandidateGrid.fromString(givens);
  const detector = DETECTORS[technique];
  let best: ExercisePosition | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const next = firstFinding(grid);
    if (next === null) break;
    if (next.technique === technique) return snapshot(grid, next, 'exclusive');

    if (best === null || best.quality === 'shared') {
      const finding = detector.detect(grid);
      if (finding !== null) {
        const quality = singleAvailable(grid) ? 'shared' : 'clean';
        if (best === null || quality === 'clean') best = snapshot(grid, finding, quality);
      }
    }

    if (!grid.apply(next)) break;
  }

  return best;
}

/**
 * A position drilling any one of `allowed`, chosen at random.
 *
 * Only the solver's own steps here — an open exercise asks the player which
 * technique applies, and a position where two answers are equally true is a
 * question with no marking scheme. Random over the *techniques* present
 * rather than over the positions, because a puzzle offers a naked single at
 * nearly every step and its one x-wing once: picking a position uniformly
 * would make the open exercise a naked-single drill with extra steps.
 */
export function exerciseAmong(
  givens: string,
  allowed: readonly TechniqueId[],
  rng: Rng = Math.random,
): ExercisePosition | null {
  const wanted = new Set(allowed);
  const grid = CandidateGrid.fromString(givens);
  const byTechnique = new Map<TechniqueId, ExercisePosition[]>();

  for (let step = 0; step < MAX_STEPS; step++) {
    const finding = firstFinding(grid);
    if (finding === null) break;
    if (wanted.has(finding.technique)) {
      const position = snapshot(grid, finding, 'exclusive');
      const bucket = byTechnique.get(finding.technique);
      if (bucket === undefined) byTechnique.set(finding.technique, [position]);
      else bucket.push(position);
    }
    if (!grid.apply(finding)) break;
  }

  const techniques = [...byTechnique.keys()];
  if (techniques.length === 0) return null;
  const positions = byTechnique.get(techniques[Math.floor(rng() * techniques.length)])!;
  return positions[Math.floor(rng() * positions.length)];
}

/**
 * The position's own candidate state, as something the detectors can read.
 *
 * A `CandidateGrid` starts from basic candidates, so rebuilding one means
 * taking back off it every mark the position no longer holds. Needed because
 * an exercise stores marks as plain arrays — it has to, `LiveGame` is where
 * they end up — while asking "does this other technique also apply here?"
 * needs a `BoardView` over exactly those marks and not over the superset.
 */
export function gridOf(position: ExercisePosition): CandidateGrid {
  const grid = CandidateGrid.fromString(formatGrid(position.values));
  position.values.forEach((value, cell) => {
    if (value !== null) return;
    const keep = new Set(position.candidates[cell]);
    // Copied before the loop: `trueCandidates` hands back the live set, and
    // eliminating from it while iterating it would skip entries.
    for (const digit of [...grid.trueCandidates(cell as CellIndex)]) {
      if (!keep.has(digit)) grid.eliminate(cell as CellIndex, digit);
    }
  });
  return grid;
}

/**
 * The easiest difficulty whose catalog reaches this technique.
 *
 * The twin of `generator.ts`'s `levelOf`, and a deliberate duplicate of it.
 * `generator.ts` is the one module the UI may not import — it is what the
 * worker exists to keep off the main thread — and an exercise is chosen on
 * the main thread, so reaching for `levelOf` would pull clue-digging into the
 * app bundle to read a lookup table. `exercise.test.ts` asserts the two agree
 * for every technique, so the copy cannot drift in silence.
 */
export const bandFor = (technique: TechniqueId): Difficulty =>
  DIFFICULTIES.find((level) => DIFFICULTY_TECHNIQUES[level].includes(technique)) ?? 'expert';
