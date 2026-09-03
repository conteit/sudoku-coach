/**
 * The report is the whole point of the button, so it is tested as data: what
 * a player pastes has to be exactly what a test can be written against.
 *
 * The case that motivated it is the one asserted below — a checker that
 * disagrees with a technique the player applied correctly. Answering that
 * needs three things at once, and only one of them is on screen: the marks,
 * the true candidates, and whether the catalog sees the pattern at all.
 */

import { describe, expect, it } from 'vitest';
import { newGame, reduce } from '../state/game';
import { DEFAULT_PROFILE } from '../state/mastery';
import type { LiveGame } from '../state/types';
import { buildDiagnosticReport, formatDiagnosticReport } from './diagnostics';

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

const start = (): LiveGame =>
  newGame({
    givens: PUZZLE,
    solution: SOLVED,
    difficulty: 'medium',
    at: 1000,
    id: 'diag-1',
    running: true,
  });

const input = (game: LiveGame) => ({
  game,
  profile: { ...DEFAULT_PROFILE, locale: 'en' as const },
  tier: 'laptop',
  viewport: '1280x720',
  hint: null,
  drill: null,
  exhausted: false,
  review: null,
  now: new Date('2026-09-03T10:00:00.000Z'),
});

describe('the diagnostic report', () => {
  it('carries the board as both a puzzle and a position', () => {
    const game = reduce(start(), { type: 'setValue', cell: 2, digit: 4, at: 1100 });
    const report = buildDiagnosticReport(input(game));

    expect(report.game.givens).toBe(PUZZLE);
    expect(report.game.values.startsWith('534')).toBe(true);
    expect(report.game.undoDepth).toBe(1);
    // `set`, not `setValue`: the log records `MoveKind`, which is the
    // frozen contract's own vocabulary rather than the action's.
    expect(report.game.lastMoves).toEqual(['set r1c3 4']);
  });

  it('lists only the cells the player has noted', () => {
    const game = reduce(start(), { type: 'addCandidate', cell: 2, digit: 4, at: 1100 });
    const report = buildDiagnosticReport(input(game));

    expect(report.game.notes).toEqual(['r1c3: 4']);
  });

  it('carries the engine\'s own reading, not just the screen\'s', () => {
    // The half a screenshot cannot show. Every technique that fires, not only
    // the cheapest one play would offer — "the checker disagrees with my
    // naked pair" is answered by whether the catalog sees that pair at all.
    const report = buildDiagnosticReport(input(start()));

    expect(report.engine.nextFinding).not.toBeNull();
    expect(report.engine.allFindings.length).toBeGreaterThan(0);
    expect(report.engine.allFindings[0].eliminates.length + report.engine.allFindings[0].cells.length)
      .toBeGreaterThan(0);
  });

  it('puts the true candidates of every cell the review complained about beside it', () => {
    // This is the pair that makes a checker disagreement readable: what the
    // player noted (above) against what basic elimination allows (here).
    const game = reduce(start(), { type: 'addCandidate', cell: 2, digit: 4, at: 1100 });
    const report = buildDiagnosticReport({
      ...input(game),
      review: {
        checkedCells: 1,
        cleanCells: [],
        issues: [
          { cell: 2, kind: 'missing', digit: 1, reason: 'Nothing rules a 1 out of this cell.', witness: [] },
        ],
      },
    });

    expect(report.coach.review?.issues).toEqual([
      { cell: 'r1c3', kind: 'missing', digit: 1, reason: 'Nothing rules a 1 out of this cell.' },
    ]);
    expect(report.engine.trueCandidates).toHaveLength(1);
    expect(report.engine.trueCandidates[0].startsWith('r1c3: ')).toBe(true);
  });

  it('formats as something a player can paste whole', () => {
    const text = formatDiagnosticReport(buildDiagnosticReport(input(start())));

    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text).at).toBe('2026-09-03T10:00:00.000Z');
  });

  it('says nothing about the player beyond the game and the settings', () => {
    // A bug report travels: it goes in an issue, or into a chat window. It
    // may carry a puzzle and a set of preferences; it may not carry a mastery
    // history or anything that reads as a profile.
    const text = formatDiagnosticReport(buildDiagnosticReport(input(start())));
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual(['app', 'at', 'coach', 'engine', 'game', 'settings']);
    expect(text).not.toContain('mastery');
  });
});
