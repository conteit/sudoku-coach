/**
 * Checking a claim: whether the cells a player named really are the pattern
 * they said, and what it proves.
 *
 * **This is not detection, and the difference is the whole reason the module
 * exists.** `DETECTORS[x].detect(board)` answers "is there one of these", by
 * returning the *first* it meets and stopping — so a player who spots the
 * second, equally valid X-Wing on the same board would be told they are
 * wrong. `claim.test.ts` pins exactly that case on a fixture. A verifier
 * answers "is *this* one", which is a different question and needs its own
 * code until the detectors become generators and `detect` is defined as the
 * first thing one yields. That is the end state; see #140.
 *
 * Until then these are a second reading of rules `techniques/` already
 * encodes, and two readings that can drift are two bugs waiting. What keeps
 * them honest is the cross-check in `claim.test.ts`: every finding a detector
 * reports, on every fixture board, must be accepted here.
 *
 * Judged against **true candidates computed from the values**, never the
 * player's notes (invariant 3b). A missing note would otherwise manufacture a
 * pattern that is not there, and the app would confirm it.
 */

import { COLS, HOUSES, ROWS, colOf, rowOf, Board } from './board';
import { DIGITS } from './types';
import type { CellIndex, Digit, Elimination, House, TechniqueId } from './types';
import { cellsWithCandidate, commonPeers } from './techniques/util';

/**
 * Whether `cells` really are an X-Wing on `digit`.
 *
 * Mirrors `fish.ts` deliberately, including its last condition: a pattern
 * that eliminates nothing is not a finding there and is not a claim here.
 */
/**
 * The techniques a claim can be made about, in catalog order.
 *
 * Two things keep this list shorter than the catalog. The verifiers below
 * cover three shapes, one technique each, and the rest wait on the detectors
 * becoming generators. And the two **singles are excluded on principle, not
 * for now**: confirming "there is a naked single here, and it is a 7" is
 * confirming a digit, which is the one thing this app never does. They stay
 * out when the rest arrive.
 */
export const CLAIMABLE: readonly TechniqueId[] = Object.freeze([
  'x_wing',
  'xy_wing',
  'simple_coloring',
]);

/**
 * What a claim on a set-shaped technique turns out to be.
 *
 * It carries the eliminations rather than a bare yes, because the player who
 * just proved the pattern has earned the *"so what"* — see `docs/architecture.md`
 * on why a verified claim is not the coach's disclosure ladder.
 */
export type SetVerdict = { holds: false } | { holds: true; eliminations: Elimination[] };

export function xWingClaim(
  values: readonly (Digit | null)[],
  digit: Digit,
  cells: readonly CellIndex[],
): SetVerdict {
  const claimed = new Set(cells);
  if (claimed.size !== 4) return { holds: false };

  const board = Board.fromValues(values);

  // Four distinct cells spanning two rows and two columns can only be the
  // full cross product of them, which is the shape an X-Wing has.
  const rows = [...new Set([...claimed].map(rowOf))];
  const cols = [...new Set([...claimed].map(colOf))];
  if (rows.length !== 2 || cols.length !== 2) return { holds: false };

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
  if (!byRow && !tight(COLS, cols)) return { holds: false };

  const covers = byRow ? cols.map((c) => COLS[c]) : rows.map((r) => ROWS[r]);
  const eliminations = covers.flatMap((house) =>
    house.cells
      .filter((cell) => !claimed.has(cell) && board.trueCandidates(cell).has(digit))
      .map((cell) => ({ cell, digit })),
  );
  // A fish that clears nothing is a rectangle, not an argument.
  return eliminations.length > 0 ? { holds: true, eliminations } : { holds: false };
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
  | { kind: 'proves'; digits: Digit[]; eliminations: Elimination[] }
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
 * Whether a chain of conjugate pairs, two-coloured by the order
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
    if (trapped) {
      return { kind: 'proves', digits: [digit], eliminations: worn.map((cell) => ({ cell, digit })) };
    }
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
  return wings.length > 0
    ? {
        kind: 'proves',
        digits: [digit],
        eliminations: wings.map((cell) => ({ cell: cell as CellIndex, digit })),
      }
    : { kind: 'barren' };
}

/**
 * Whether three cells are an XY-Wing, and which is the pivot.
 *
 * The one technique whose cells are not interchangeable, so the verdict has to
 * carry the roles: the overlay colours the pivot differently from its wings,
 * and that distinction is the entire lesson of the pattern.
 *
 * The player does not say which cell is the pivot. They cannot mistype it —
 * at most one of three cells can be — so asking would be a question with one
 * possible answer, which is the same mistake the digit stage was.
 */
export type WingVerdict =
  | { holds: false }
  | { holds: true; pivot: CellIndex; wings: CellIndex[]; eliminations: Elimination[] };

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
    const eliminations = commonPeers(board, wings[0], wings[1])
      .filter((cell) => cell !== pivot && board.trueCandidates(cell).has(outside[0]))
      .map((cell) => ({ cell, digit: outside[0] }));
    // Sorted, so the verdict is a function of the cells and not of the order
    // they were tapped in. The two wings are interchangeable — the same
    // argument `roles.ts` makes about the corners of a fish, and the reason
    // the overlay gives them one colour between them.
    if (eliminations.length > 0) {
      return { holds: true, pivot, wings: [...wings].sort((a, b) => a - b), eliminations };
    }
  }
  return { holds: false };
}

/**
 * The same question without being told the digit.
 *
 * A chain's links are houses in which *some* digit has exactly two homes, and
 * a chain only works for a digit that makes **every** link conjugate — so the
 * cells determine the digit, the way four corners determine a fish's. Asking
 * for it up front was a step that existed only because this shape was written
 * before the fish's was.
 *
 * Unlike the fish, the digit is not always unique: measured across the
 * fixtures, 18 of 1,216 chains are a **valid chain** for two digits at once.
 * In every one of those the two readings disagree about whether anything
 * follows, so the verdict prefers a digit that proves something over one that
 * merely fits — a verdict naming the other would be true and useless. It
 * still carries a list rather than a single digit, because nothing rules out
 * a chain proving for two; no board in this repo does, so that branch is
 * unexercised and says so here rather than pretending otherwise.
 *
 * When nothing holds, the break reported is the one from the digit that got
 * furthest. A player building a chain has a digit in mind, and the reading
 * that survives longest is the closest thing to it the board can offer.
 */
export function colouringHolds(
  values: readonly (Digit | null)[],
  cells: readonly CellIndex[],
): ChainVerdict {
  const verdicts = DIGITS.map((digit) => colouringClaim(values, digit, cells));

  const proving = verdicts.flatMap((verdict) =>
    verdict.kind === 'proves' ? [verdict] : [],
  );
  if (proving.length > 0) {
    return {
      kind: 'proves',
      digits: proving.flatMap((verdict) => verdict.digits),
      // Concatenated, not merged: an elimination of a 1 and an elimination of
      // a 4 are two different marks even when they are in the same cell, and
      // no two readings can produce the same (cell, digit) twice because each
      // reading owns its digit.
      eliminations: proving.flatMap((verdict) => verdict.eliminations),
    };
  }
  if (verdicts.some((verdict) => verdict.kind === 'barren')) return { kind: 'barren' };

  return verdicts.reduce<{ kind: 'broken'; link: number }>(
    (furthest, verdict) =>
      verdict.kind === 'broken' && verdict.link > furthest.link ? verdict : furthest,
    { kind: 'broken', link: 1 },
  );
}
