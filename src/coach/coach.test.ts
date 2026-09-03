/**
 * The disclosure ladder, proved rather than asserted by example.
 *
 * The headline is `describe('R7 over the whole shipped library')`: every
 * technique in the catalog, every level, both locales, driven by findings the
 * real detectors produced on real grids. `lessons.test.ts` already proves the
 * *templates* obey R7; this file proves the *renderer* does — that filling a
 * template cannot introduce a disclosure the template did not contain.
 *
 * The property is stated numerically, because "does not reveal which digit
 * belongs in which cell" is otherwise a matter of prose. Strip every cell name
 * and every house label out of a rendered hint and whatever numbers are left
 * are the ones the coach chose to say out loud. Level 1 may say the pattern's
 * size; levels 2 and 3 may also name the pattern's digits — except that a
 * *placement* finding's digit is the answer, so the moment a hint names cells
 * it may not name that digit at all. Anything else remaining is a leak.
 */

import { describe, expect, it } from 'vitest';
import { Board, cellName } from '../engine/board';
import { solveLogically } from '../engine/solver';
import { DETECTORS } from '../engine/techniques';
import { EXAMPLES, PUZZLES } from '../engine/techniques/fixtures';
import type { Digit, Finding, TechniqueId } from '../engine/types';
import { TECHNIQUE_IDS } from '../engine/types';
import { houseLabel, LOCALES } from '../i18n';
import type { CoachExchange, DisclosureLevel, Locale, PlayerProfile } from '../state/types';
import { DEFAULT_PROFILE, masteryOf, onTaught } from '../state/mastery';
import type { LessonLibrary } from './types';
import { CHAIN_TECHNIQUES, HINT_TOKENS, TOKENS_ALLOWED_BY_LEVEL } from './types';
import { loadLessons as loadLibrary } from './lessons';
import { findingKey, formatEliminations, orderedHouses, placeholdersOf } from './format';
import type { CoachCell } from './format';
import {
  createCoach,
  escalatedLevel,
  findingIsApplied,
  MAX_COACH_LOG,
  masteryAfterHint,
  masteryAfterMove,
  reachedLevel,
  recordExchange,
  renderHint,
  resumeLevel,
  wasHinted,
} from './coach';

/* ------------------------------------------------------------------------ */
/* A corpus of real findings                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Findings the detectors actually produced, never hand-written literals: a
 * fixture would only prove the renderer agrees with whoever typed the fixture.
 * `EXAMPLES` covers the techniques a well-formed puzzle rarely needs; the solve
 * paths of `PUZZLES` cover the mid-solve state the coach really sees.
 */
const PER_TECHNIQUE = 8;

const CORPUS: ReadonlyMap<TechniqueId, Finding[]> = (() => {
  const corpus = new Map<TechniqueId, Finding[]>(TECHNIQUE_IDS.map((id) => [id, []]));
  const add = (finding: Finding): void => {
    const found = corpus.get(finding.technique);
    if (found && found.length < PER_TECHNIQUE) found.push(finding);
  };
  for (const id of TECHNIQUE_IDS) {
    const finding = DETECTORS[id].detect(Board.fromString(EXAMPLES[id]));
    if (finding) add(finding);
  }
  for (const puzzle of PUZZLES) {
    for (const step of solveLogically(Board.fromString(puzzle.givens)).steps) add(step);
  }
  return corpus;
})();

const findingsFor = (id: TechniqueId): readonly Finding[] => CORPUS.get(id) ?? [];

const LEVELS = [1, 2, 3, 4] as const;
type Level = (typeof LEVELS)[number];

/** Every (locale, technique) pair, so a failure names the case that broke. */
const CASES: [Locale, TechniqueId][] = LOCALES.flatMap((locale) =>
  TECHNIQUE_IDS.map((id): [Locale, TechniqueId] => [locale, id]),
);

/** Findings that carry an answer: the only ones that *could* give one away. */
const PLACEMENT_TECHNIQUES: readonly TechniqueId[] = ['naked_single', 'hidden_single'];

/* ------------------------------------------------------------------------ */
/* Disclosure helpers                                                        */
/* ------------------------------------------------------------------------ */

const CELL_NAME = /r[1-9]c[1-9]/;
const EVERY_CELL_NAME = /r[1-9]c[1-9]/g;

/**
 * Blanks out the two things a hint is allowed to say that contain digits but
 * disclose no value: cell coordinates and house labels. Whatever numbers
 * survive are the ones the copy is genuinely stating.
 */
function stripCoordinates(locale: Locale, text: string): string {
  let out = text.replace(EVERY_CELL_NAME, '·');
  for (const kind of ['row', 'col', 'box'] as const) {
    for (let index = 0; index < 9; index++) {
      out = out.split(houseLabel(locale, kind, index)).join('·');
    }
  }
  return out;
}

const numbersIn = (text: string): number[] => [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));

/**
 * Phrasings that hand over a cell-to-digit assignment, applied to *rendered*
 * text. `lessons.test.ts` runs the same shape of check over the raw templates;
 * running it again after substitution is what catches a renderer that turns
 * innocent copy into an instruction by what it fills in.
 */
const ASSIGNMENT_PATTERNS: readonly RegExp[] = [
  /r\d\s*c\d\s*(?:=|:|->|→)\s*\d/i,
  /\d\s*(?:=|->|→)\s*r\d\s*c\d/i,
  /\b(?:put|place[sd]?|write|enter|fill in)\b[^.]{0,60}?r\d\s*c\d/i,
  /(?:^|[\s(])(?:metti|mettere|scrivi|scrivere|inserisci|inserire|piazza|piazzare|segna|segnare)\b[^.]{0,60}?r\d\s*c\d/i,
  /\b(?:goes|belongs)\s+(?:in|into|at)\b/i,
  /(?:^|[\s(])va\s+(?:in|nella|nel|su)\b/i,
  /r\d\s*c\d[^.]{0,40}?\s(?:is|are|must be|has to be)\s[^.]{0,20}?\d/i,
  /r\d\s*c\d[^.]{0,40}?\s(?:è|sono|vale|valgono|deve essere|devono essere)\s[^.]{0,20}?\d/i,
];

/* ------------------------------------------------------------------------ */
/* The property                                                              */
/* ------------------------------------------------------------------------ */

describe('R7 over the whole shipped library', () => {
  it('has a real finding for every technique in the catalog', () => {
    for (const id of TECHNIQUE_IDS) {
      expect(findingsFor(id).length, `no real finding for ${id}`).toBeGreaterThan(0);
    }
  });

  it.each(CASES)('%s/%s never renders a cell-to-digit assignment below level 4', (locale, id) => {
    const isPlacement = PLACEMENT_TECHNIQUES.includes(id);
    for (const finding of findingsFor(id)) {
      for (const level of [1, 2, 3] as const) {
        const { text } = renderHint({ finding, level, locale });
        const where = `${locale}/${id} level ${level}: ${text}`;

        // Levels 1 and 2 are region-only: no coordinate may appear at all.
        if (level < 3) expect(text, where).not.toMatch(CELL_NAME);

        // Whatever number survives the strip is a number the copy is stating.
        const namesCells = CELL_NAME.test(text);
        const allowed = new Set<number>([finding.cells.length]);
        // A placement finding's digit *is* the answer, so it may never share a
        // hint with the cell it belongs in.
        if (level >= 2 && !(namesCells && isPlacement)) {
          for (const digit of finding.digits) allowed.add(digit);
        }
        for (const value of numbersIn(stripCoordinates(locale, text))) {
          expect(allowed, `${where} — leaked the number ${value}`).toContain(value);
        }

        // The elimination list binds digits to cells; it is level 4's alone.
        if (finding.eliminations.length > 0) {
          expect(text, where).not.toContain(formatEliminations(locale, finding.eliminations));
        }

        for (const pattern of ASSIGNMENT_PATTERNS) {
          expect(text, `${where} — matched ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });

  it.each(CASES)('%s/%s never phrases level 4 as a placement either', (locale, id) => {
    for (const finding of findingsFor(id)) {
      const { text } = renderHint({ finding, level: 4, locale });
      for (const pattern of ASSIGNMENT_PATTERNS) {
        expect(text, `${locale}/${id} level 4: ${text} — matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it.each(CASES)('%s/%s resolves every placeholder its copy asks for', (locale, id) => {
    for (const finding of findingsFor(id)) {
      for (const level of LEVELS) {
        const { text } = renderHint({ finding, level, locale });
        expect(text, `${locale}/${id} level ${level} left a placeholder unfilled`).not.toMatch(
          /\{\w+\}/,
        );
      }
    }
  });

  it.each(CASES)('%s/%s spends only the tokens its level allows', (locale, id) => {
    const library = loadLibrary(locale);
    for (const level of LEVELS) {
      const template = library[id].templates[String(level) as '1' | '2' | '3' | '4'];
      const used = [...placeholdersOf(template)];
      for (const token of used) {
        expect(HINT_TOKENS, `${locale}/${id} level ${level}: unknown {${token}}`).toContain(token);
        expect(
          TOKENS_ALLOWED_BY_LEVEL[String(level) as '1' | '2' | '3' | '4'] as readonly string[],
          `${locale}/${id} level ${level}: {${token}} is not permitted`,
        ).toContain(token);
      }
    }
  });

  it.each(CASES)('%s/%s renders the same hint every time', (locale, id) => {
    for (const finding of findingsFor(id)) {
      for (const level of LEVELS) {
        expect(renderHint({ finding, level, locale })).toEqual(
          renderHint({ finding, level, locale }),
        );
      }
    }
  });
});

/* ------------------------------------------------------------------------ */
/* The renderer's own gate                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The block above proves the shipped copy and the renderer together never leak.
 * It cannot prove the *renderer* would refuse, because no authored template
 * asks for a token its level forbids — substituting a value nobody asked for
 * changes nothing. So the gate gets its own test, against a library written to
 * ask for everything at every level. This is the assertion that fails if the
 * allowance is ever widened to `HINT_TOKENS`.
 */
const GREEDY_TEMPLATE = '[{house}][{house2}][{digit}][{digits}][{cells}][{eliminations}][{count}]';

function greedyLibrary(): LessonLibrary {
  const real = loadLibrary('en');
  return Object.fromEntries(
    TECHNIQUE_IDS.map((id) => [
      id,
      {
        ...real[id],
        templates: {
          '1': GREEDY_TEMPLATE,
          '2': GREEDY_TEMPLATE,
          '3': GREEDY_TEMPLATE,
          '4': GREEDY_TEMPLATE,
        },
      },
    ]),
  ) as LessonLibrary;
}

describe('the renderer withholds what the level forbids', () => {
  const library = greedyLibrary();
  const unresolved = (text: string): string[] =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each([
    [1, ['cells', 'digit', 'digits', 'eliminations']],
    [2, ['cells', 'eliminations']],
    [3, ['eliminations']],
    [4, []],
  ] as [Level, string[]][])(
    'leaves %i asking in vain for %j',
    (level, withheld) => {
      const finding = findingsFor('pointing')[0];
      const { text } = renderHint({ finding, level, locale: 'en', library });
      expect(unresolved(text)).toEqual(withheld);
    },
  );

  it('never binds a cell to a digit below level 4, even for greedy copy', () => {
    for (const id of TECHNIQUE_IDS) {
      for (const finding of findingsFor(id)) {
        for (const level of [1, 2, 3] as const) {
          const { text } = renderHint({ finding, level, locale: 'en', library });
          if (finding.eliminations.length > 0) {
            expect(text, `${id} level ${level}`).not.toContain(
              formatEliminations('en', finding.eliminations),
            );
          }
          if (level < 3) expect(text, `${id} level ${level}`).not.toMatch(CELL_NAME);
        }
      }
    }
  });

  it('withholds both house tokens from a chain technique at every level', () => {
    for (const id of CHAIN_TECHNIQUES) {
      for (const finding of findingsFor(id)) {
        for (const level of LEVELS) {
          const { text } = renderHint({ finding, level, locale: 'en', library });
          expect(unresolved(text), `${id} level ${level}`).toContain('house');
          expect(unresolved(text), `${id} level ${level}`).toContain('house2');
        }
      }
    }
  });

  it('still fills the house tokens for a technique that may anchor', () => {
    const finding = findingsFor('pointing')[0];
    const { text } = renderHint({ finding, level: 1, locale: 'en', library });
    expect(unresolved(text)).not.toContain('house');
    expect(unresolved(text)).not.toContain('house2');
  });
});

/* ------------------------------------------------------------------------ */
/* Spotlight and tint                                                        */
/* ------------------------------------------------------------------------ */

describe('what the UI is allowed to light up', () => {
  it('keeps the spotlight empty below level 3, then shows the pattern', () => {
    for (const finding of TECHNIQUE_IDS.flatMap((id) => [...findingsFor(id)])) {
      expect(renderHint({ finding, level: 1, locale: 'en' }).spotlight).toEqual([]);
      expect(renderHint({ finding, level: 2, locale: 'en' }).spotlight).toEqual([]);
      expect(renderHint({ finding, level: 3, locale: 'en' }).spotlight).toEqual(finding.cells);
    }
  });

  it('adds the elimination targets at level 4, sorted and deduped', () => {
    const finding = findingsFor('naked_pair')[0];
    const level4 = renderHint({ finding, level: 4, locale: 'en' }).spotlight;
    const expected = [
      ...new Set([...finding.cells, ...finding.eliminations.map((e) => e.cell)]),
    ].sort((a, b) => a - b);
    expect(level4).toEqual(expected);
  });

  it('tints only the house a naked single actually names at level 1', () => {
    // The finding carries the cell's row, column *and* box. Tinting all three
    // spotlights their single intersection — the cell — at the level that is
    // meant to say only "look over here".
    const finding = findingsFor('naked_single')[0];
    expect(finding.houses).toHaveLength(3);
    const hint = renderHint({ finding, level: 1, locale: 'en' });
    expect(hint.houses).toEqual([
      { kind: finding.houses[0].kind, index: finding.houses[0].index },
    ]);
  });

  it('tints both houses of a pointing hint, box first', () => {
    for (const finding of findingsFor('pointing')) {
      const hint = renderHint({ finding, level: 1, locale: 'en' });
      expect(hint.houses).toHaveLength(2);
      expect(hint.houses[0].kind).toBe('box');
      expect(hint.houses[1].kind).not.toBe('box');
    }
  });

  it('names the line before the box for claiming', () => {
    for (const finding of findingsFor('claiming')) {
      const [first, second] = orderedHouses(finding);
      expect(first.kind).not.toBe('box');
      expect(second.kind).toBe('box');
    }
  });

  it('names the base lines of a fish, not the covered ones', () => {
    for (const id of ['x_wing', 'swordfish'] as const) {
      for (const finding of findingsFor(id)) {
        const houses = orderedHouses(finding);
        const size = id === 'x_wing' ? 2 : 3;
        const base = houses.slice(0, size);
        const cover = houses.slice(size);
        // A base house is one the pattern's cells are confined *within*; a
        // cover house is one the eliminations fall in.
        const eliminated = new Set(finding.eliminations.map((e) => e.cell));
        for (const house of base) {
          expect(house.cells.some((c) => eliminated.has(c)), `${id} base ${house.kind}`).toBe(false);
        }
        expect(new Set(base.map((h) => h.kind)).size).toBe(1);
        expect(new Set(cover.map((h) => h.kind)).size).toBe(1);
        expect(base[0].kind).not.toBe(cover[0].kind);
      }
    }
  });
});

describe('chain techniques never anchor to a single house', () => {
  it.each(CHAIN_TECHNIQUES.flatMap((id) => LOCALES.map((l): [Locale, TechniqueId] => [l, id])))(
    '%s/%s withholds every house token and tints nothing',
    (locale, id) => {
      const library = loadLibrary(locale);
      for (const level of LEVELS) {
        const tokens = placeholdersOf(library[id].templates[String(level) as '1' | '2' | '3' | '4']);
        expect([...tokens], `${locale}/${id} level ${level}`).not.toContain('house');
        expect([...tokens], `${locale}/${id} level ${level}`).not.toContain('house2');
      }
      for (const finding of findingsFor(id)) {
        // The findings really do carry houses — this is not vacuous.
        expect(finding.houses.length).toBeGreaterThan(0);
        for (const level of LEVELS) {
          expect(renderHint({ finding, level, locale }).houses).toEqual([]);
        }
      }
    },
  );
});

/* ------------------------------------------------------------------------ */
/* Token semantics                                                           */
/* ------------------------------------------------------------------------ */

describe('token semantics from the frozen contract', () => {
  it('renders {count} as the size of the pattern', () => {
    for (const id of ['naked_pair', 'naked_triple', 'naked_quad'] as const) {
      const finding = findingsFor(id)[0];
      const text = renderHint({ finding, level: 1, locale: 'en' }).text;
      expect(text, id).toContain(String(finding.cells.length));
    }
  });

  it('renders {house} as houses[0] and {house2} as houses[1] of the ordered set', () => {
    const finding = findingsFor('pointing')[0];
    const [first, second] = orderedHouses(finding);
    const text = renderHint({ finding, level: 2, locale: 'en' }).text;
    expect(text).toContain(houseLabel('en', first.kind, first.index));
    expect(text).toContain(houseLabel('en', second.kind, second.index));
  });

  it('localizes the house label rather than shipping English', () => {
    const finding = findingsFor('hidden_single')[0];
    const it = renderHint({ finding, level: 1, locale: 'it' }).text;
    const en = renderHint({ finding, level: 1, locale: 'en' }).text;
    expect(it).not.toBe(en);
    expect(it).toMatch(/riga|colonna|riquadro/);
  });

  it('lists eliminations grouped by digit at level 4', () => {
    const finding = findingsFor('hidden_pair')[0];
    const text = renderHint({ finding, level: 4, locale: 'en' }).text;
    for (const { cell } of finding.eliminations) expect(text).toContain(cellName(cell));
  });

  it('clamps a level outside the ladder onto it', () => {
    const finding = findingsFor('naked_single')[0];
    expect(renderHint({ finding, level: 0, locale: 'en' })).toEqual(
      renderHint({ finding, level: 1, locale: 'en' }),
    );
  });

  it('reports whether a deeper rung exists', () => {
    const finding = findingsFor('naked_single')[0];
    expect(renderHint({ finding, level: 3, locale: 'en' }).canEscalate).toBe(true);
    expect(renderHint({ finding, level: 4, locale: 'en' }).canEscalate).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
/* findingKey                                                                */
/* ------------------------------------------------------------------------ */

describe('findingKey', () => {
  it('is the same across a reload — the same board yields the same key', () => {
    const board = Board.fromString(EXAMPLES.pointing);
    const first = DETECTORS.pointing.detect(board);
    const second = DETECTORS.pointing.detect(Board.fromString(EXAMPLES.pointing));
    expect(first).not.toBeNull();
    expect(findingKey(first!)).toBe(findingKey(second!));
  });

  it('separates two different findings', () => {
    const keys = new Set(TECHNIQUE_IDS.map((id) => findingKey(findingsFor(id)[0])));
    expect(keys.size).toBe(TECHNIQUE_IDS.length);
  });

  it('survives an unrelated elimination, so the ladder does not restart', () => {
    // Keying on the eliminations would mint a new key the moment an unrelated
    // move cleared one of them, dropping the player back to level 1.
    const finding = findingsFor('naked_pair')[0];
    const narrowed: Finding = { ...finding, eliminations: finding.eliminations.slice(1) };
    expect(findingKey(narrowed)).toBe(findingKey(finding));
  });
});

/* ------------------------------------------------------------------------ */
/* Ladder state                                                              */
/* ------------------------------------------------------------------------ */

const exchange = (findingKeyValue: string, level: DisclosureLevel): CoachExchange => ({
  at: 1,
  technique: 'naked_pair',
  level,
  findingKey: findingKeyValue,
  offered: false,
});

describe('the ladder resumes rather than restarts', () => {
  const finding = findingsFor('naked_pair')[0];
  const key = findingKey(finding);

  it('starts a new finding at level 1', () => {
    expect(reachedLevel([], key)).toBe(0);
    expect(resumeLevel([], key)).toBe(1);
  });

  it('resumes a finding at the rung already reached', () => {
    const log = [exchange(key, 1), exchange(key, 2), exchange(key, 3)];
    expect(resumeLevel(log, key)).toBe(3);
  });

  it('escalates one rung and stops at the last one', () => {
    expect(escalatedLevel([exchange(key, 2)], key)).toBe(3);
    expect(escalatedLevel([exchange(key, 4)], key)).toBe(4);
  });

  it('never rewinds, even when a shallower exchange is recorded later', () => {
    const log = [exchange(key, 4), exchange(key, 1)];
    expect(resumeLevel(log, key)).toBe(4);
    expect(escalatedLevel(log, key)).toBe(4);
  });

  it('starts a different finding at level 1 regardless of the log', () => {
    const other = findingKey(findingsFor('hidden_pair')[0]);
    expect(resumeLevel([exchange(key, 4)], other)).toBe(1);
  });

  it('records an exchange once per rung', () => {
    const hint = renderHint({ finding, level: 2, locale: 'en' });
    const once = recordExchange([], hint, 10);
    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({ level: 2, findingKey: key, offered: false, at: 10 });
    expect(recordExchange(once, hint, 20)).toHaveLength(1);
    const deeper = renderHint({ finding, level: 3, locale: 'en' });
    expect(recordExchange(once, deeper, 20)).toHaveLength(2);
  });

  it('marks an unprompted offer as offered', () => {
    const hint = renderHint({ finding, level: 1, locale: 'en' });
    expect(recordExchange([], hint, 1, true)[0].offered).toBe(true);
  });

  it('does not mutate the log it is given', () => {
    const log: CoachExchange[] = [];
    recordExchange(log, renderHint({ finding, level: 1, locale: 'en' }), 1);
    expect(log).toEqual([]);
  });

  it('bounds the log so a persisted game cannot grow without end', () => {
    let log: CoachExchange[] = Array.from({ length: MAX_COACH_LOG }, (_, i) =>
      exchange(`key-${i}`, 1),
    );
    log = recordExchange(log, renderHint({ finding, level: 1, locale: 'en' }), 99);
    expect(log).toHaveLength(MAX_COACH_LOG);
    expect(log[log.length - 1].findingKey).toBe(key);
  });
});

/* ------------------------------------------------------------------------ */
/* Mastery from observed play                                                */
/* ------------------------------------------------------------------------ */

const cellsOf = (grid: string, marks: Record<number, Digit[]> = {}): CoachCell[] =>
  [...Board.fromString(grid).values].map((value, cell) => ({
    value,
    candidates: new Set<Digit>(marks[cell] ?? []),
  }));

describe('mastery follows what the player does', () => {
  const finding = findingsFor('naked_pair')[0];
  const key = findingKey(finding);
  const profile: PlayerProfile = DEFAULT_PROFILE;

  it('teaches a technique the first time the coach names it', () => {
    const hint = renderHint({ finding, level: 2, locale: 'en' });
    const after = masteryAfterHint(profile, [], hint, 5);
    expect(masteryOf(after, 'naked_pair').stage).toBe('taught');
    expect(masteryOf(after, 'naked_pair').misses).toBe(0);
  });

  it('does not teach at level 1, which names no technique', () => {
    const hint = renderHint({ finding, level: 1, locale: 'en' });
    expect(masteryAfterHint(profile, [], hint, 5)).toBe(profile);
  });

  it('counts a hint on an already-taught technique as a miss', () => {
    const taught = onTaught(profile, 'naked_pair', 1);
    const hint = renderHint({ finding, level: 2, locale: 'en' });
    const after = masteryAfterHint(taught, [], hint, 5);
    expect(masteryOf(after, 'naked_pair').misses).toBe(1);
    expect(masteryOf(after, 'naked_pair').stage).toBe('taught');
  });

  it('scores escalation on one finding as a single event', () => {
    const level2 = renderHint({ finding, level: 2, locale: 'en' });
    const log = recordExchange([], level2, 1);
    const level4 = renderHint({ finding, level: 4, locale: 'en' });
    const taught = masteryAfterHint(profile, [], level2, 1);
    expect(masteryAfterHint(taught, log, level4, 2)).toBe(taught);
  });

  it('reads the log to tell a hinted solve from an unaided one', () => {
    expect(wasHinted([], key)).toBe(false);
    expect(wasHinted([exchange(key, 1)], key)).toBe(false);
    expect(wasHinted([exchange(key, 2)], key)).toBe(true);
  });

  it('credits an unaided application when the player performs the elimination', () => {
    const marks = Object.fromEntries(
      finding.eliminations.map((e) => [e.cell, [e.digit] as Digit[]]),
    );
    const before = cellsOf(EXAMPLES.naked_pair, marks);
    const after = cellsOf(EXAMPLES.naked_pair);
    expect(findingIsApplied(finding, before)).toBe(false);
    expect(findingIsApplied(finding, after)).toBe(true);
    const next = masteryAfterMove({ profile, log: [], finding, before, after, at: 7 });
    expect(masteryOf(next, 'naked_pair').stage).toBe('applied_unaided');
    expect(masteryOf(next, 'naked_pair').applications).toBe(1);
  });

  it('credits only a hinted application when the coach had named the technique', () => {
    const marks = Object.fromEntries(
      finding.eliminations.map((e) => [e.cell, [e.digit] as Digit[]]),
    );
    const before = cellsOf(EXAMPLES.naked_pair, marks);
    const after = cellsOf(EXAMPLES.naked_pair);
    const next = masteryAfterMove({
      profile,
      log: [exchange(key, 3)],
      finding,
      before,
      after,
      at: 7,
    });
    expect(masteryOf(next, 'naked_pair').stage).toBe('recognized_with_hint');
  });

  it('credits nothing when the finding was already satisfied before the move', () => {
    // A player who keeps no pencil marks has "already eliminated" everything;
    // crediting that would hand out mastery for doing nothing.
    const cells = cellsOf(EXAMPLES.naked_pair);
    expect(masteryAfterMove({ profile, log: [], finding, before: cells, after: cells, at: 7 })).toBe(
      profile,
    );
  });

  it('credits a placement only when the placed digit is the proved one', () => {
    const single = findingsFor('naked_single')[0];
    const { cell, digit } = single.placements[0];
    const before = cellsOf(EXAMPLES.naked_single);
    const right = before.map((c, i) => (i === cell ? { ...c, value: digit } : c));
    const wrong = before.map((c, i) =>
      i === cell ? { ...c, value: ((digit % 9) + 1) as Digit } : c,
    );
    expect(
      masteryOf(
        masteryAfterMove({ profile, log: [], finding: single, before, after: right, at: 1 }),
        'naked_single',
      ).stage,
    ).toBe('applied_unaided');
    expect(
      masteryAfterMove({ profile, log: [], finding: single, before, after: wrong, at: 1 }),
    ).toBe(profile);
  });
});

/* ------------------------------------------------------------------------ */
/* The Coach surface                                                         */
/* ------------------------------------------------------------------------ */

describe('createCoach', () => {
  const cells = cellsOf(EXAMPLES.pointing);

  it('offers the cheapest technique the catalog can see', () => {
    const coach = createCoach({ cells, locale: 'en' });
    const finding = coach.nextFinding();
    expect(finding).not.toBeNull();
    expect(coach.nextFinding()).toBe(finding);
  });

  /*
   * Paolo, mid-game: he had worked the naked pair the coach was pointing at,
   * but his eliminations live in his notes and the engine reads placed digits
   * only — so the same pair came back every time he asked. The engine is
   * right not to trust notes (a hint built on a wrong mark is a wrong hint),
   * so the player says "not that one" instead, and the coach walks on.
   */
  it('walks past a finding the player has set aside', () => {
    const coach = createCoach({ cells, locale: 'en' });
    const first = coach.nextFinding()!;
    expect(first).not.toBeNull();

    const another = createCoach({ cells, locale: 'en' }).nextFinding(
      new Set([findingKey(first)]),
    );

    expect(another).not.toBeNull();
    expect(findingKey(another!)).not.toBe(findingKey(first));
  });

  it('runs out honestly once everything on the board has been set aside', () => {
    // "There is nothing else here" is a true and useful answer; inventing a
    // finding to fill the silence is not.
    const coach = createCoach({ cells, locale: 'en' });
    const skip = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const finding = coach.nextFinding(skip);
      if (finding === null) break;
      skip.add(findingKey(finding));
    }

    expect(coach.nextFinding(skip)).toBeNull();
  });

  it('detects from engine candidates, not from the player s marks', () => {
    // Marks nobody could justify must not change what the coach sees, or a
    // player with sloppy notes would get a hint that is simply wrong.
    const withJunk = cells.map((c) => ({ ...c, candidates: new Set<Digit>([1, 2, 3]) }));
    expect(createCoach({ cells: withJunk, locale: 'en' }).nextFinding()).toEqual(
      createCoach({ cells, locale: 'en' }).nextFinding(),
    );
  });

  it('returns null on a board no technique cracks', () => {
    const solved = createCoach({
      cells: cellsOf(
        '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
      ),
      locale: 'en',
    });
    expect(solved.nextFinding()).toBeNull();
  });

  it('renders through the same ladder as renderHint', () => {
    const coach = createCoach({ cells, locale: 'it' });
    const finding = coach.nextFinding()!;
    expect(coach.hint(finding, 3)).toEqual(renderHint({ finding, level: 3, locale: 'it' }));
  });

  it('reviews the player s marks', () => {
    const empty = cells.findIndex((c) => c.value === null);
    const marked = cells.map((c, i) =>
      i === empty ? { ...c, candidates: new Set<Digit>([1, 2, 3, 4, 5]) } : c,
    );
    const review = createCoach({ cells: marked, locale: 'en' }).reviewCandidates();
    expect(review.checkedCells).toBe(1);
    expect(review.issues.length).toBeGreaterThan(0);
  });
});
