/**
 * Token rendering for the disclosure ladder — the layer that turns a `Finding`
 * into the strings a lesson template asks for (spec §5.5, R7).
 *
 * It is a separate module from `coach.ts` for one reason: everything here is a
 * pure function of a `Finding` plus a locale, so the disclosure rules in
 * `coach.ts` can be read without the string plumbing in the way, and the
 * plumbing can be tested against every technique without a Coach.
 *
 * ## House order is recovered here, not trusted
 *
 * `coach/types.ts` pins `{house}` to `finding.houses[0]` and `{house2}` to
 * `houses[1]`, and states the per-technique order the lesson copy is written
 * against: pointing `[box, line]`, claiming `[line, box]`, fish
 * `[...base, ...cover]`. **The merged detectors do not produce that order.**
 * Every detector funnels through `buildFinding`, which calls `orderHouses` and
 * sorts houses into canonical `HOUSES` position — so a pointing finding comes
 * back as `col1/box3` as often as `box0/col1`, and a swordfish interleaves its
 * base and cover lines (`row0/col0/row2/col5/col6/row7`).
 *
 * Taking `houses[0]` literally would therefore make the copy false, not merely
 * vague: "One digit missing from {house} has candidates only in cells that all
 * lie in {house2}" is a true sentence about a box and its line, and a false one
 * about a line and its box. The engine is frozen and out of scope for this
 * branch, so `orderedHouses` reconstructs the documented order from the finding
 * itself — box/line by kind, base/cover by which houses carry the eliminations.
 * That is a workaround for a contract bug, and it is written down in the PR.
 */

import type { CellIndex, Digit, Elimination, Finding, House } from '../engine/types';
import { cellName } from '../engine/board';
import { formatList, houseLabel } from '../i18n';
import type { Locale } from '../state/types';

/**
 * The slice of a cell the coach reads: the digit in it and the player's own
 * pencil marks. `candidates` is `ReadonlySet` deliberately — architecture
 * invariant 1 says marks are user-owned, and a read-only type is the cheapest
 * place to enforce it (`LiveGame['cells']` is assignable as-is).
 */
export interface CoachCell {
  value: Digit | null;
  candidates: ReadonlySet<Digit>;
}

const isBox = (house: House): boolean => house.kind === 'box';

/**
 * Base lines first, then the covered lines. The base houses are the ones the
 * digit is confined *within*; the cover houses are the ones the eliminations
 * fall in, and every elimination lies in a cover house — that is the whole
 * argument of a fish, so it is a sound way to tell the two sets apart even
 * after the canonical sort has interleaved them.
 */
function fishHouses(finding: Finding): readonly House[] {
  const kinds = [...new Set(finding.houses.map((h) => h.kind))];
  const coverKind = kinds.find((kind) =>
    finding.eliminations.every((elimination) =>
      finding.houses.some((h) => h.kind === kind && h.cells.includes(elimination.cell)),
    ),
  );
  if (coverKind === undefined) return finding.houses;
  const base = finding.houses.filter((h) => h.kind !== coverKind);
  const cover = finding.houses.filter((h) => h.kind === coverKind);
  return base.length > 0 && cover.length > 0 ? [...base, ...cover] : finding.houses;
}

/**
 * The finding's houses in the order the lesson templates are written against.
 * Chain techniques are left alone: their copy never names a house (see
 * `CHAIN_TECHNIQUES`), so there is no order to recover.
 */
export function orderedHouses(finding: Finding): readonly House[] {
  switch (finding.technique) {
    case 'pointing':
      return [...finding.houses.filter(isBox), ...finding.houses.filter((h) => !isBox(h))];
    case 'claiming':
      return [...finding.houses.filter((h) => !isBox(h)), ...finding.houses.filter(isBox)];
    case 'x_wing':
    case 'swordfish':
      return fishHouses(finding);
    default:
      return finding.houses;
  }
}

/** A house stripped to what `Hint.houses` carries. */
export const houseRef = (house: House): { kind: House['kind']; index: number } => ({
  kind: house.kind,
  index: house.index,
});

/** `{cells}` — "r3c1 and r3c3" / "r3c1 e r3c3". */
export const formatCells = (locale: Locale, cells: readonly CellIndex[]): string =>
  formatList(locale, cells.map(cellName));

/** `{digits}` — "3 and 7" / "3 e 7". */
export const formatDigits = (locale: Locale, digits: readonly Digit[]): string =>
  formatList(locale, digits);

/** `{house}` / `{house2}` — "box 1" / "riquadro 1". */
export const formatHouse = (locale: Locale, house: House): string =>
  houseLabel(locale, house.kind, house.index);

/**
 * `{eliminations}` — "4 (r3c4 and r3c7)", grouped by digit.
 *
 * The dictionary has no connective for this ("4 *from* r3c4"), and the i18n
 * layer is outside this branch's scope, so the grouping leans on punctuation
 * rather than on an English word that would survive into the Italian build.
 * Both locales' level-4 copy reads it as an object — "That removes …" /
 * "Questo elimina …" — so a parenthesised list slots in cleanly.
 */
export function formatEliminations(
  locale: Locale,
  eliminations: readonly Elimination[],
): string {
  const byDigit = new Map<Digit, CellIndex[]>();
  for (const { cell, digit } of eliminations) {
    const cells = byDigit.get(digit) ?? [];
    cells.push(cell);
    byDigit.set(digit, cells);
  }
  const groups = [...byDigit.entries()]
    .sort(([a], [b]) => a - b)
    .map(([digit, cells]) => `${digit} (${formatCells(locale, [...cells].sort((a, b) => a - b))})`);
  return formatList(locale, groups);
}

/**
 * A stable identity for a finding, so escalation resumes rather than restarts.
 *
 * It hashes the *pattern* — technique, digits, evidence cells, houses — and
 * deliberately not the eliminations. A finding is the same finding whether or
 * not an unrelated move elsewhere on the board has since removed one of the
 * candidates it would have cleared; keying on the eliminations would silently
 * mint a new key and drop the player back to level 1 for the pattern they were
 * already three rungs into.
 *
 * Being a pure function of the finding, it also survives a reload: the same
 * board reproduces the same finding, which reproduces the same key.
 */
export const findingKey = (finding: Finding): string =>
  [
    finding.technique,
    finding.digits.join(''),
    finding.cells.join('.'),
    orderedHouses(finding)
      .map((h) => `${h.kind[0]}${h.index}`)
      .join('.'),
  ].join('|');

const PLACEHOLDER = /\{(\w+)\}/g;

/** The `{name}` placeholders a template uses, in no particular order. */
export const placeholdersOf = (template: string): Set<string> =>
  new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]));
