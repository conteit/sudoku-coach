/**
 * Shared plumbing for the detector catalog.
 *
 * Every detector is a pure scan over `BoardView.trueCandidates`. The helpers
 * here exist so the detectors themselves read like their textbook definitions:
 * enumerate a house, ask which cells still hold a digit, take combinations,
 * hand the result to `buildFinding`. Nothing here touches a solution string —
 * detectors have no access to one, by design (spec §5.6).
 *
 * Determinism is a contract, not a nicety: the coach must show the same hint
 * for the same board every time. Two rules keep it: scans run in ascending
 * house/cell/digit order, and `buildFinding` sorts every array it returns.
 */

import type {
  BoardView, CellIndex, Digit, Elimination, Finding, House, Placement, TechniqueId,
} from '../types';
import { HOUSES } from '../board';

const byIndex = (a: number, b: number): number => a - b;

/** Position of each house in `HOUSES`, so findings can order houses canonically. */
const HOUSE_ORDER = new Map<House, number>(HOUSES.map((h, i) => [h, i]));

/**
 * Lexicographic k-combinations of `items`, lazily. Laziness matters: a detector
 * returns the *first* qualifying pattern, and quads over a nine-cell house are
 * 126 combinations we would rather not materialise.
 */
export function* combinations<T>(items: readonly T[], k: number): Generator<T[]> {
  const n = items.length;
  if (k <= 0 || k > n) return;
  const picked = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield picked.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && picked[i] === n - k + i) i--;
    if (i < 0) return;
    picked[i]++;
    for (let j = i + 1; j < k; j++) picked[j] = picked[j - 1] + 1;
  }
}

/** Cells of `house` that still hold `digit` as a candidate, ascending. */
export const cellsWithCandidate = (
  board: BoardView,
  house: House,
  digit: Digit,
): CellIndex[] => house.cells.filter((c) => board.trueCandidates(c).has(digit));

/** Union of the true candidates of `cells`. */
export function unionCandidates(board: BoardView, cells: Iterable<CellIndex>): Set<Digit> {
  const union = new Set<Digit>();
  for (const c of cells) for (const d of board.trueCandidates(c)) union.add(d);
  return union;
}

/** Cells seeing both `a` and `b`, excluding `a` and `b` themselves. */
export function commonPeers(board: BoardView, a: CellIndex, b: CellIndex): CellIndex[] {
  const seenByB = new Set(board.peers(b));
  return board.peers(a).filter((c) => c !== a && c !== b && seenByB.has(c));
}

/** Deduped, ascending by `HOUSES` position — a finding never repeats a house. */
export function orderHouses(houses: Iterable<House>): House[] {
  return [...new Set(houses)].sort(
    (a, b) => (HOUSE_ORDER.get(a) ?? 0) - (HOUSE_ORDER.get(b) ?? 0),
  );
}

export interface FindingDraft {
  technique: TechniqueId;
  digits: Iterable<Digit>;
  cells: Iterable<CellIndex>;
  houses: Iterable<House>;
  eliminations?: readonly Elimination[];
  placements?: readonly Placement[];
}

/**
 * Normalises a draft into a `Finding`, or returns null when the pattern proves
 * nothing. A finding with neither an elimination nor a placement is not a
 * finding: it would burn a hint on a board state it cannot advance, so every
 * detector funnels through here rather than deciding for itself.
 */
export function buildFinding(draft: FindingDraft): Finding | null {
  const eliminations = dedupe(draft.eliminations ?? []);
  const placements = dedupe(draft.placements ?? []);
  if (eliminations.length === 0 && placements.length === 0) return null;
  return {
    technique: draft.technique,
    digits: [...new Set(draft.digits)].sort(byIndex),
    cells: [...new Set(draft.cells)].sort(byIndex),
    houses: orderHouses(draft.houses),
    eliminations,
    placements,
  };
}

/** Sorted by cell then digit, with duplicates collapsed. */
function dedupe<T extends { cell: CellIndex; digit: Digit }>(items: readonly T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.cell * 10 + item.digit;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => a.cell - b.cell || a.digit - b.digit);
}
