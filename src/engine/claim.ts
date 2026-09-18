/**
 * SPIKE (#140) — throwaway. Delete this file, do not build on it.
 *
 * One technique, written by hand, so that a crude claim panel can be played
 * on a real phone before the feature is designed properly. The real verifier
 * turns every detector into a generator and defines `detect` as "the first
 * one it yields", so that the rule has exactly one reading; this file is the
 * second reading that approach exists to avoid, and it is acceptable only
 * because nothing downstream of it is meant to survive.
 *
 * What it does share with the real design, because the spike is worthless
 * otherwise: it judges the claim against **true candidates computed from the
 * values**, never the player's notes. A missing note would otherwise
 * manufacture a pattern that is not there and the app would confirm it.
 */

import { COLS, HOUSES, ROWS, colOf, rowOf, Board } from './board';
import type { CellIndex, Digit, House } from './types';
import { cellsWithCandidate, commonPeers } from './techniques/util';

/**
 * Whether `cells` really are an X-Wing on `digit`.
 *
 * Mirrors `fish.ts` deliberately, including its last condition: a pattern
 * that eliminates nothing is not a finding there and is not a claim here.
 */
export function xWingHolds(
  values: readonly (Digit | null)[],
  digit: Digit,
  cells: readonly CellIndex[],
): boolean {
  const claimed = new Set(cells);
  if (claimed.size !== 4) return false;

  const board = Board.fromValues(values);

  // Four distinct cells spanning two rows and two columns can only be the
  // full cross product of them, which is the shape an X-Wing has.
  const rows = [...new Set([...claimed].map(rowOf))];
  const cols = [...new Set([...claimed].map(colOf))];
  if (rows.length !== 2 || cols.length !== 2) return false;

  // The pigeonhole has to be tight: in each base house the digit must have
  // exactly these two homes and no third one, or it proves nothing.
  //
  // This is also what rules out a claimed cell that is filled, or that cannot
  // take the digit at all: such a cell is not among the house's homes, so no
  // house can have exactly the claimed pair. An explicit candidate check
  // ahead of this was written first and then deleted — no mutation could kill
  // it, which is the tell that it was never deciding anything.
  const tight = (houses: readonly House[], lines: number[]): boolean =>
    lines.every((line) => {
      const spots = cellsWithCandidate(board, houses[line], digit);
      return spots.length === 2 && spots.every((spot) => claimed.has(spot));
    });

  const byRow = tight(ROWS, rows);
  if (!byRow && !tight(COLS, cols)) return false;

  const covers = byRow ? cols.map((c) => COLS[c]) : rows.map((r) => ROWS[r]);
  return covers.some((house) =>
    house.cells.some((cell) => !claimed.has(cell) && board.trueCandidates(cell).has(digit)),
  );
}

/**
 * What a colouring chain the player built turns out to be.
 *
 * `broken` carries the link it failed at, which is a deliberate loosening of
 * the disclosure discipline and Paolo's call, on the record: it discloses
 * that the links before it are real conjugate pairs. The argument for it is
 * invariant 11's — it points at a mistake in the player's own assertion
 * rather than at anything on the board — and the argument against is that a
 * graded verdict is a hint channel, which is why the *set* claims get one
 * flat sentence and this does not.
 */
export type ChainVerdict =
  | { kind: 'proves'; cells: number }
  | { kind: 'broken'; link: number }
  | { kind: 'barren' };

/** A house in which `digit` has exactly these two homes, and no third. */
function conjugate(board: Board, digit: Digit, a: CellIndex, b: CellIndex): boolean {
  return HOUSES.some((house) => {
    const spots = cellsWithCandidate(board, house, digit);
    return spots.length === 2 && spots.includes(a) && spots.includes(b);
  });
}

/**
 * SPIKE (#140). Whether a chain of conjugate pairs, two-coloured by the order
 * it was built in, holds — and whether it proves anything.
 *
 * Mirrors `coloring.ts`: the same two conclusions (a colour that traps itself,
 * a cell outside that sees both colours) and the same three-cell floor, below
 * which a chain is a conjugate pair wearing a bigger name.
 */
export function colouringClaim(
  values: readonly (Digit | null)[],
  digit: Digit,
  cells: readonly CellIndex[],
): ChainVerdict {
  if (cells.length < 3) return { kind: 'broken', link: cells.length };
  const board = Board.fromValues(values);

  // Colour by position: the alternation is not a choice the player makes, it
  // is forced by the chain, which is the whole idea being taught.
  const colours = new Map<CellIndex, number>();
  for (const [i, cell] of cells.entries()) {
    // A chain visits each cell once. Coming back to one is the player's own
    // chain folding over itself, and it fails at the link that closed it.
    // This also covers a cell "linked" to itself: an explicit `a === b` guard
    // in `conjugate` was written and deleted, because this check runs first
    // and no mutation could reach past it.
    if (colours.has(cell)) return { kind: 'broken', link: i };
    if (i > 0 && !conjugate(board, digit, cells[i - 1], cell)) return { kind: 'broken', link: i };
    colours.set(cell, i % 2);
  }

  const wearing = (colour: number): CellIndex[] =>
    [...colours.entries()].filter(([, c]) => c === colour).map(([cell]) => cell);

  // A colour that traps itself is the false one, and every cell wearing it
  // gives the digit up.
  for (const colour of [0, 1]) {
    const worn = wearing(colour);
    const trapped = worn.some((a) =>
      worn.some((b) => a !== b && HOUSES.some((h) => h.cells.includes(a) && h.cells.includes(b))),
    );
    if (trapped) return { kind: 'proves', cells: worn.length };
  }

  // Otherwise: anything outside the chain that can see both colours.
  const sees = (cell: CellIndex, colour: number): boolean =>
    wearing(colour).some((c) => board.peers(cell).includes(c));
  const wings = [...Array(81).keys()].filter(
    (cell) =>
      !colours.has(cell as CellIndex) &&
      board.trueCandidates(cell as CellIndex).has(digit) &&
      sees(cell as CellIndex, 0) &&
      sees(cell as CellIndex, 1),
  );
  return wings.length > 0 ? { kind: 'proves', cells: wings.length } : { kind: 'barren' };
}

/**
 * SPIKE (#140). Whether three cells are an XY-Wing, and which is the pivot.
 *
 * The one technique whose cells are not interchangeable, so the verdict has to
 * carry the roles: the overlay colours the pivot differently from its wings,
 * and that distinction is the entire lesson of the pattern.
 *
 * The player does not say which cell is the pivot. They cannot mistype it —
 * at most one of three cells can be — so asking would be a question with one
 * possible answer, which is the same mistake the digit stage was.
 */
export type WingVerdict = { holds: false } | { holds: true; pivot: CellIndex; wings: CellIndex[] };

export function xyWingClaim(
  values: readonly (Digit | null)[],
  cells: readonly CellIndex[],
): WingVerdict {
  if (new Set(cells).size !== 3) return { holds: false };
  const board = Board.fromValues(values);
  const pairs = cells.map((cell) => board.trueCandidates(cell));

  for (const [i, pivot] of cells.entries()) {
    const wings = cells.filter((_, j) => j !== i);
    const hinge = pairs[i];
    // The pivot must be bivalue. A third digit in it forces neither wing, so
    // dropping this accepts a shape that proves nothing — which is why the
    // check is here and not on the wings: a wing that is not bivalue has
    // either two digits outside the hinge or two inside it, and both of the
    // tests below already refuse that. An explicit all-three-are-bivalue
    // guard was written and deleted for exactly that reason.
    if (hinge.size !== 2) continue;
    if (!wings.every((wing) => board.peers(pivot).includes(wing))) continue;

    const [left, right] = wings.map((wing) => board.trueCandidates(wing));
    // Both wings hang off the pivot by the same outside digit...
    const outside = [...left].filter((d) => !hinge.has(d));
    if (outside.length !== 1 || !right.has(outside[0]) || hinge.has(outside[0])) continue;
    if ([...right].filter((d) => !hinge.has(d)).length !== 1) continue;
    // ...and grip different pivot digits, or the pivot proves nothing.
    const grips = [left, right].map((pair) => [...pair].filter((d) => hinge.has(d)));
    if (grips.some((g) => g.length !== 1) || grips[0][0] === grips[1][0]) continue;

    // And, as everywhere else here, it has to eliminate something.
    const proves = commonPeers(board, wings[0], wings[1]).some(
      (cell) => cell !== pivot && board.trueCandidates(cell).has(outside[0]),
    );
    // Sorted, so the verdict is a function of the cells and not of the order
    // they were tapped in. The two wings are interchangeable — the same
    // argument `roles.ts` makes about the corners of a fish, and the reason
    // the overlay gives them one colour between them.
    if (proves) return { holds: true, pivot, wings: [...wings].sort((a, b) => a - b) };
  }
  return { holds: false };
}
