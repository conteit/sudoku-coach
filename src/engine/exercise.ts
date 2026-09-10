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
 * ## Why a position may be shared with an easier technique
 *
 * `exclusive` is the position where the solver itself reached for the
 * technique, so nothing cheaper in the catalog applied. That is the better
 * drill and it is tried first, but for some techniques it barely exists:
 * measured over 12 puzzles at each technique's own difficulty, `claiming`,
 * `hidden_triple`, `naked_quad`, `swordfish` and `remote_pairs` were the
 * solver's next step 0 times. They are real patterns that a cheaper technique
 * always happens to beat to the board. Refusing to drill five of fourteen
 * techniques is the worse trade, so the search falls back to a position where
 * the pattern is merely *present*, and says which it found.
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

/** One board, one step, and the marks the player starts with. */
export interface ExercisePosition {
  /** 81 values. Every filled cell is a given here: the position is the premise. */
  values: (Digit | null)[];
  /** The marks to pre-fill, per cell. Empty for a filled cell. */
  candidates: Digit[][];
  /** The step this position is about. */
  finding: Finding;
  /** True when this is the solver's own next step, so nothing easier applies. */
  exclusive: boolean;
}

/**
 * The solver's own cap, restated rather than imported — `solver.ts` keeps it
 * private, and a walk that cannot terminate is a hang either way.
 */
const MAX_STEPS = 810;

const snapshot = (grid: CandidateGrid, finding: Finding, exclusive: boolean): ExercisePosition => ({
  values: [...grid.values],
  candidates: grid.values.map((value, cell) =>
    value === null ? [...grid.trueCandidates(cell as CellIndex)] : [],
  ),
  finding,
  exclusive,
});

/**
 * A position in this puzzle where `technique` is worth practising.
 *
 * One walk, two answers: it returns the first position where the solver
 * itself reached for the technique, and only if the whole path offers none
 * does it hand back the first position where the pattern was merely there.
 * The fallback detector stops running as soon as it has found one, so the
 * common case costs one extra sweep per step and the rare case costs none.
 */
export function exerciseFor(givens: string, technique: TechniqueId): ExercisePosition | null {
  const grid = CandidateGrid.fromString(givens);
  const detector = DETECTORS[technique];
  let shared: ExercisePosition | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const next = firstFinding(grid);
    if (next === null) break;
    if (next.technique === technique) return snapshot(grid, next, true);

    if (shared === null) {
      const finding = detector.detect(grid);
      if (finding !== null) shared = snapshot(grid, finding, false);
    }

    if (!grid.apply(next)) break;
  }

  return shared;
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
      const position = snapshot(grid, finding, true);
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
