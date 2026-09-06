# Coach Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach keeps what it was showing when the mobile sheet closes, ages a note-check report against the live board instead of re-running it, and refuses to teach a technique on a board that cannot be finished.

**Architecture:** One new pure module ages an existing report; the panel renders the aged form instead of the raw one; two one-line couplings in `GameView` are cut. Nothing new is persisted and no frozen contract moves.

**Tech Stack:** React 19, TypeScript, Tailwind v4, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-06-coach-memory-design.md` — read it before Task 1, especially "The placement problem", which is the reasoning the whole revalidator rests on.

## Global Constraints

- **`npm run verify`** = lint → `tsc -b` → vitest → build. Never weaken a config to make it pass.
- **Run the mutation on every new test.** Break the thing it covers, watch it fail, restore it, watch it pass. This repo has shipped nine tests that passed for the wrong reason; the last plan produced four briefs whose own test code was subtly wrong. **Verify every fixture actually exercises what it claims before trusting it.**
- **Every new i18n key MUST go in BOTH `src/i18n/en.ts` and `src/i18n/it.ts`** with matching placeholders. `src/i18n/i18n.test.ts` enforces parity and will fail the build otherwise. Italian is a first draft for native review under issue #65 — write it, do not skip it.
- **Architecture invariant 1: user candidates are user-owned.** Nothing here edits a mark. The revalidator only ever *reads*, and it can only ever *remove* rows.
- **Architecture invariant 4: the app never reveals which digit belongs in a cell.** A report describes the player's own marks. Nothing in this work may consult `game.solution`.
- **`src/coach/types.ts` and `src/state/types.ts` are frozen contracts.** This work touches neither.
- Comments explain *why*, not *what*. `src/coach/candidates.ts` sets the tone for `coach/`.
- Redirect heavy output: `npm run verify > /tmp/v.log 2>&1; tail -20 /tmp/v.log`
- Commit messages explain reasoning, not files. Every commit ends with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
```

---

### Task 1: `trackReview` — ageing a report without re-running it

**Files:**
- Create: `src/coach/reviewProgress.ts`
- Test: `src/coach/reviewProgress.test.ts`

**Interfaces:**
- Consumes: `CandidateIssue`, `CandidateReview` (`src/coach/types.ts:60-75`), `CoachCell` (`src/coach/format.ts:35-44`), `peersOf` (`src/engine/board.ts:67`), `Board.fromValues` / `Board.trueCandidates`.
- Produces: `ReviewSnapshot`, `TrackedIssue`, `IssueState`, `ReviewProgress`, `trackReview(snapshot, cells)`. Tasks 2 and 3 consume all of them.

**Background you need.** `reviewMarks` (`src/coach/candidates.ts:117-156`) produces two kinds of issue:
- `invalid` — `noted.has(digit) && !truth.has(digit)`: the player wrote a mark a *peer already holding that digit* refutes. Basic elimination, exactly revalidatable.
- `missing` — `!noted.has(digit) && truth.has(digit)` **and** the digit is not in `eliminableCandidates(board)`, a full catalog fixed point. That second half is why it cannot be revalidated cheaply, and why a neighbourhood change retires it. Read the spec's "The placement problem" before writing this.

- [ ] **Step 1: Write the failing tests**

Create `src/coach/reviewProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Digit } from '../engine/types';
import type { CandidateIssue, CandidateReview } from './types';
import type { CoachCell } from './format';
import { trackReview, type ReviewSnapshot } from './reviewProgress';

/** 81 empty cells; individual tests fill in only what they are about. */
const emptyCells = (): CoachCell[] =>
  Array.from({ length: 81 }, () => ({ value: null, candidates: new Set<Digit>() }));

const values = (cells: readonly CoachCell[]): (Digit | null)[] => cells.map((c) => c.value);

const issue = (over: Partial<CandidateIssue> = {}): CandidateIssue => ({
  cell: 40,
  kind: 'missing',
  digit: 6,
  reason: 'because',
  witness: [],
  ...over,
});

const report = (issues: CandidateIssue[]): CandidateReview => ({
  issues,
  cleanCells: [],
  checkedCells: 12,
});

const snapshotOf = (cells: readonly CoachCell[], issues: CandidateIssue[]): ReviewSnapshot => ({
  report: report(issues),
  values: values(cells),
});

describe('trackReview', () => {
  it('leaves an untouched report entirely open', () => {
    const cells = emptyCells();
    cells[40] = { value: null, candidates: new Set<Digit>([1]) };
    const progress = trackReview(snapshotOf(cells, [issue()]), cells);

    expect(progress.items.map((i) => i.state)).toEqual(['open']);
    expect(progress.open).toBe(1);
    expect(progress.total).toBe(1);
    expect(progress.checkedCells).toBe(12);
  });

  it('marks a missing note fixed once the player writes it', () => {
    const cells = emptyCells();
    cells[40] = { value: null, candidates: new Set<Digit>([6]) };
    const progress = trackReview(snapshotOf(cells, [issue()]), cells);

    expect(progress.items[0].state).toBe('fixed');
    expect(progress.open).toBe(0);
    // Fixed rows stay on screen: seeing what you have done is the point of
    // showing progress rather than a list that silently shrinks.
    expect(progress.total).toBe(1);
  });

  it('marks an invalid note fixed once the player erases it', () => {
    const cells = emptyCells();
    cells[40] = { value: null, candidates: new Set<Digit>() };
    const bad = issue({ kind: 'invalid', digit: 9 });
    const progress = trackReview(snapshotOf(cells, [bad]), cells);

    expect(progress.items[0].state).toBe('fixed');
  });

  it('drops an issue whose cell has since been filled', () => {
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = emptyCells();
    after[40] = { value: 3, candidates: new Set<Digit>() };

    expect(trackReview(snapshot, after).items).toEqual([]);
    expect(trackReview(snapshot, after).total).toBe(0);
  });

  it('retires a missing issue once a peer has been filled', () => {
    // The whole point of the snapshot. `missing` means "possible AND no
    // technique refutes it", and a placement next door can unlock an
    // elimination that makes the advice wrong. The report stops asserting
    // rather than assert something it can no longer prove.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[41] = { value: 5, candidates: new Set<Digit>() }; // r5c6, a peer of r5c5

    expect(trackReview(snapshot, after).items).toEqual([]);
  });

  it('keeps a missing issue when a far-away cell has been filled', () => {
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[0] = { value: 5, candidates: new Set<Digit>() }; // r1c1 sees nothing of r5c5

    expect(trackReview(snapshot, after).items.map((i) => i.state)).toEqual(['open']);
  });

  it('credits the fix when the player noted it AND the neighbourhood moved', () => {
    // Order matters: they did the thing that was asked. Retiring it instead
    // would take away credit for work actually done.
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(before, [issue()]);

    const after = before.map((c) => ({ ...c }));
    after[40] = { value: null, candidates: new Set<Digit>([6]) };
    after[41] = { value: 5, candidates: new Set<Digit>() };

    expect(trackReview(snapshot, after).items[0].state).toBe('fixed');
  });

  it('retires an invalid issue once the peer that refuted it is gone', () => {
    const before = emptyCells();
    before[40] = { value: null, candidates: new Set<Digit>([9]) };
    before[41] = { value: 9, candidates: new Set<Digit>() };
    const snapshot = snapshotOf(before, [issue({ kind: 'invalid', digit: 9 })]);

    const after = before.map((c) => ({ ...c }));
    after[41] = { value: null, candidates: new Set<Digit>() };

    // Still noted, but now legitimately: nothing sees a 9 any more.
    expect(trackReview(snapshot, after).items).toEqual([]);
  });

  it('keeps the reported order', () => {
    const cells = emptyCells();
    cells[10] = { value: null, candidates: new Set<Digit>([1]) };
    cells[40] = { value: null, candidates: new Set<Digit>([1]) };
    const snapshot = snapshotOf(cells, [issue({ cell: 10 }), issue({ cell: 40 })]);

    expect(trackReview(snapshot, cells).items.map((i) => i.issue.cell)).toEqual([10, 40]);
  });

  it('handles a report with no issues at all', () => {
    const cells = emptyCells();
    const progress = trackReview(snapshotOf(cells, []), cells);

    expect(progress.items).toEqual([]);
    expect(progress.open).toBe(0);
    expect(progress.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/coach/reviewProgress.test.ts > /tmp/t1.log 2>&1; tail -20 /tmp/t1.log`
Expected: FAIL — cannot resolve `./reviewProgress`.

**Before writing the implementation, verify the geometry these fixtures assume:** cell 40 is r5c5 and cell 41 is r5c6, so 41 is a peer of 40; cell 0 is r1c1 and is not. Confirm with `peersOf(40)` rather than trusting this sentence.

- [ ] **Step 3: Implement**

Create `src/coach/reviewProgress.ts`:

```ts
/**
 * A note-check report, aged against the board rather than re-run.
 *
 * A report is a snapshot, and the player immediately starts changing the thing
 * it describes. Re-running it on every change is the honest answer and it is
 * also the most expensive computation in the app — `reviewMarks` runs the
 * whole technique catalog to a fixed point. So the report is produced once and
 * aged here, which costs one lookup per issue.
 *
 * **The list can only ever shrink.** Nothing is added: a new issue requires a
 * new check, which requires the player to ask. That is what keeps this from
 * becoming a report nobody requested, and it is why an issue can only move
 * from `open` to `fixed`, or leave the list entirely.
 *
 * **`missing` is the one that needs the snapshot.** It does not mean "this
 * digit is possible" — it means possible *and* unrefuted by any technique, and
 * that second half came from the fixed point. A placement can unlock a new
 * elimination, at which point cheap revalidation would keep telling the player
 * to note a digit that is now provably impossible; they would write it, and
 * nothing downstream would catch it, because `invalid` only sees basic
 * elimination. So a `missing` issue retires as soon as its cell or any of its
 * peers changes value: past that point the report says nothing rather than
 * something it can no longer prove.
 *
 * `invalid` rests on basic elimination alone — a peer holding the digit — so
 * revalidating it against the live board is exact and needs no snapshot.
 */

import { Board, peersOf } from '../engine/board';
import type { Digit } from '../engine/types';
import type { CandidateIssue, CandidateReview } from './types';
import type { CoachCell } from './format';

export type IssueState = 'open' | 'fixed';

export interface TrackedIssue {
  issue: CandidateIssue;
  state: IssueState;
}

/** A report plus the board it was run against. */
export interface ReviewSnapshot {
  report: CandidateReview;
  values: readonly (Digit | null)[];
}

export interface ReviewProgress {
  /** The issues still worth showing, in the order they were reported. */
  items: TrackedIssue[];
  open: number;
  total: number;
  /** Carried through from the report, so the panel needs no second prop. */
  checkedCells: number;
}

/** True when this cell, or anything that constrains it, holds a different digit now. */
const neighbourhoodMoved = (
  snapshot: ReviewSnapshot,
  cells: readonly CoachCell[],
  cell: number,
): boolean =>
  cells[cell].value !== snapshot.values[cell] ||
  peersOf(cell).some((peer) => cells[peer].value !== snapshot.values[peer]);

export function trackReview(
  snapshot: ReviewSnapshot,
  cells: readonly CoachCell[],
): ReviewProgress {
  const board = Board.fromValues(cells.map((c) => c.value));
  const items: TrackedIssue[] = [];

  for (const issue of snapshot.report.issues) {
    const cell = cells[issue.cell];
    // A settled cell has no pencil marks worth arguing about, whoever settled
    // it and whether or not they took the report's advice on the way.
    if (cell === undefined || cell.value !== null) continue;

    const noted = cell.candidates.has(issue.digit);
    // Credit first: the player did the thing that was asked, and a
    // neighbourhood that moved in the same breath must not take that away.
    const fixed = issue.kind === 'missing' ? noted : !noted;
    if (fixed) {
      items.push({ issue, state: 'fixed' });
      continue;
    }

    if (issue.kind === 'missing') {
      if (neighbourhoodMoved(snapshot, cells, issue.cell)) continue;
    } else if (board.trueCandidates(issue.cell).has(issue.digit)) {
      // Nothing holds the digit any more, so the mark the report called
      // invalid has become a perfectly good one.
      continue;
    }

    items.push({ issue, state: 'open' });
  }

  return {
    items,
    open: items.reduce((n, item) => n + (item.state === 'open' ? 1 : 0), 0),
    total: items.length,
    checkedCells: snapshot.report.checkedCells,
  };
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run src/coach/reviewProgress.test.ts > /tmp/t1.log 2>&1; tail -20 /tmp/t1.log`
Expected: PASS, all ten.

- [ ] **Step 5: Run the mutations**

Four, each targeting a different claim. Run them one at a time, restoring between:
1. Delete the `if (cell.value !== null) continue;` guard → expect FAIL on "drops an issue whose cell has since been filled".
2. Change `neighbourhoodMoved` to compare only `cells[cell].value !== snapshot.values[cell]`, dropping the peer scan → expect FAIL on "retires a missing issue once a peer has been filled".
3. Move the `fixed` check *after* the `neighbourhoodMoved` check → expect FAIL on "credits the fix when the player noted it AND the neighbourhood moved".
4. Change `open` to count `items.length` → expect FAIL on "marks a missing note fixed once the player writes it".

If any mutation does not fail its named test, the test is wrong — fix the test, not the assertion, and say so in your report.

- [ ] **Step 6: Commit**

```bash
git add src/coach/reviewProgress.ts src/coach/reviewProgress.test.ts
git commit -F - <<'MSG'
feat(coach): age a note-check report instead of re-running it

A report describes the board at the instant it was run, and the player starts
changing that board immediately. Re-running it is honest and it is also the
most expensive thing the app does — reviewMarks runs the technique catalog to
a fixed point. Ageing what the report already names costs one lookup per issue.

The list can only shrink. Nothing is ever added, because a new issue would
need a check the player did not ask for.

'missing' is why this carries a snapshot of the board's values. It does not
mean a digit is possible; it means possible and unrefuted by any technique,
and that second half came from the fixed point. A placement can unlock an
elimination that makes the advice wrong, and nothing downstream would catch
the bad mark — 'invalid' only sees basic elimination. So a missing issue
retires as soon as its cell or a peer changes value, and past that the report
says nothing rather than something it can no longer prove.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 2: The panel renders progress, and the sheet stops clearing it

**Files:**
- Modify: `src/app/useCoachSession.ts` — `coachCells` exported and re-signatured; `review` becomes a `ReviewSnapshot`
- Modify: `src/ui/coach/CoachPanel.tsx` — `progress` replaces `review`; `IssueList` renders state
- Modify: `src/app/GameView.tsx` — the memo, the prop, `closeSheet`, and the deletion of `recheckAfterFix`
- Modify: `src/i18n/en.ts`, `src/i18n/it.ts`
- Test: `src/ui/coach/CoachPanel.test.tsx`, `src/app/GameView.noteCheck.test.tsx`

**Interfaces:**
- Consumes: `trackReview`, `ReviewSnapshot`, `ReviewProgress`, `TrackedIssue` (Task 1)
- Produces: `CoachPanelProps.progress?: ReviewProgress | null` (replacing `review`); `CoachSession.review: ReviewSnapshot | null`; `coachCells(cells)` exported from `useCoachSession.ts`

- [ ] **Step 1: Add the strings**

`src/i18n/en.ts`, before the closing `} as const;`:

```ts
  'coach.marksProgress': '{open} of {total} still to fix.',
  'coach.marksAllFixed': 'All fixed.',
  'coach.tagFixed': 'fixed',
```

`src/i18n/it.ts`, same place:

```ts
  'coach.marksProgress': '{open} di {total} ancora da sistemare.',
  'coach.marksAllFixed': 'Tutto sistemato.',
  'coach.tagFixed': 'sistemato',
```

- [ ] **Step 2: Write the failing tests**

Append to `src/ui/coach/CoachPanel.test.tsx`. That file renders `CoachPanel` bare with no `LocaleProvider` (`useT()` defaults to `en`), so follow that pattern:

```tsx
describe('the note check as it ages', () => {
  const PROGRESS = {
    checkedCells: 12,
    total: 2,
    open: 1,
    items: [
      {
        state: 'fixed' as const,
        issue: {
          cell: 6,
          kind: 'invalid' as const,
          digit: 9,
          reason: 'Column 7 already has a 9 at r7c7.',
          witness: [60],
        },
      },
      {
        state: 'open' as const,
        issue: {
          cell: 30,
          kind: 'missing' as const,
          digit: 6,
          reason: 'Nothing rules a 6 out of this cell.',
          witness: [27, 31],
        },
      },
    ],
  };

  it('says how much is left to fix', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={PROGRESS}
      />,
    );

    expect(screen.getByText('1 of 2 still to fix.')).toBeInTheDocument();
  });

  it('keeps a fixed issue on screen, marked as done', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={PROGRESS}
      />,
    );

    // The row is still there — that is the whole point of showing progress
    // rather than letting the list silently shrink.
    const row = screen.getByRole('button', { name: /Column 7 already has a 9/ });
    expect(row).toBeInTheDocument();
    expect(within(row).getByText('fixed')).toBeInTheDocument();
  });

  it('says so when everything has been fixed', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={{ ...PROGRESS, open: 0, items: PROGRESS.items.map((i) => ({ ...i, state: 'fixed' as const })) }}
      />,
    );

    expect(screen.getByText('All fixed.')).toBeInTheDocument();
  });

  it('offers to fix them all only while something is open', () => {
    const onFixNotes = vi.fn();
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={{ ...PROGRESS, open: 0, items: PROGRESS.items.map((i) => ({ ...i, state: 'fixed' as const })) }}
        onFixNotes={onFixNotes}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Fix them all' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run src/ui/coach/CoachPanel.test.tsx > /tmp/t2.log 2>&1; tail -30 /tmp/t2.log`
Expected: FAIL — `progress` is not a prop.

- [ ] **Step 4: Re-signature `coachCells` and snapshot the report**

In `src/app/useCoachSession.ts`, replace the private helper (`:107-108`):

```ts
const coachCells = (game: LiveGame): CoachCell[] =>
  game.cells.map((cell) => ({ value: cell.value, candidates: cell.candidates }));
```

with, placed beside the exported `triggerCells` and carrying the same reasoning:

```ts
/**
 * Exported for the same reason `triggerCells` is: the view ages the report
 * against these cells, and a second copy of this two-line map is exactly the
 * drift the export exists to prevent.
 *
 * Takes the cells rather than the game because that is all it reads, and the
 * caller that memoizes it needs a dependency that changes when a move does and
 * not when a coach log or a sync merge does.
 */
export const coachCells = (cells: LiveGame['cells']): CoachCell[] =>
  cells.map((cell) => ({ value: cell.value, candidates: cell.candidates }));
```

Then update its four call sites in that file to pass `game.cells`.

Change the review state's type (`:143`) and its interface declaration (`:74`) from `CandidateReview | null` to `ReviewSnapshot | null`, importing `ReviewSnapshot` from `../coach/reviewProgress`, and rewrite `checkMarks` (`:348-350`):

```ts
  const checkMarks = useCallback(() => {
    const cells = coachCells(game.cells);
    // The values are captured with the report, not derived from it later: a
    // report is only revalidatable against the board it was actually run on.
    setReview({
      report: createCoach({ cells, locale }).reviewCandidates(),
      values: cells.map((c) => c.value),
    });
  }, [game.cells, locale]);
```

- [ ] **Step 5: The panel takes progress**

In `src/ui/coach/CoachPanel.tsx`, replace the `review` prop declaration (`:56-58`) with:

```tsx
  /**
   * The pencil-mark check (R8), aged against the board since it was run.
   *
   * A `ReviewProgress` rather than the raw report: the panel is a renderer and
   * has no business knowing about boards or candidates, which is the same
   * division `reviewProgress.ts` and `candidates.ts` have between them.
   */
  progress?: ReviewProgress | null;
```

Import `ReviewProgress` and `TrackedIssue` from `../../coach/reviewProgress`, and drop the now-unused `CandidateReview` import if nothing else uses it. Swap `review` for `progress` in the destructuring.

Rewrite `IssueList` (`:193-261`) to take `progress` and render each item's state. Keep every existing comment and the whole hover/focus spotlight behaviour unchanged — only the source of the list and the per-row marking change:

```tsx
function IssueList({
  progress,
  onSpotlight,
}: {
  progress: ReviewProgress;
  onSpotlight?: (cells: CellIndex[]) => void;
}) {
  const t = useT();
  // "All 0 cells checked — your notes are exactly right" is true and useless:
  // a player with no notes was told they had done something perfectly.
  if (progress.checkedCells === 0) {
    return <p className="py-3 text-sm text-ink-soft">{t('coach.marksNone')}</p>;
  }

  if (progress.total === 0) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-match">
        <CheckIcon className="text-base" />
        {t('coach.marksAllClean', { count: progress.checkedCells })}
      </p>
    );
  }

  return (
    <>
      <p className="py-2.5 text-sm text-ink-soft">
        {progress.open === 0
          ? t('coach.marksAllFixed')
          : t('coach.marksProgress', { open: progress.open, total: progress.total })}{' '}
        <span className="text-ink-faint">{t('coach.marksUnchanged')}</span>
      </p>
      <ul className="divide-y divide-rule border-t border-rule">
        {progress.items.map(({ issue, state }) => (
          <li key={`${issue.cell}-${issue.digit}-${issue.kind}`}>
            <button
              type="button"
              onMouseEnter={() => onSpotlight?.([issue.cell, ...issue.witness])}
              onFocus={() => onSpotlight?.([issue.cell, ...issue.witness])}
              onMouseLeave={() => onSpotlight?.([])}
              onBlur={() => onSpotlight?.([])}
              className={cx(
                'flex w-full items-start gap-3 py-2.5 text-left transition-colors duration-100 ease-snap hover:bg-paper-sunk',
                // A fixed row stays legible rather than going decorative: the
                // player is reading it to see what they have already done.
                state === 'fixed' && 'opacity-60',
              )}
            >
              {state === 'fixed' ? (
                <CheckIcon className="mt-0.5 shrink-0 text-base text-match" />
              ) : (
                <AlertIcon
                  className={cx(
                    'mt-0.5 shrink-0 text-base',
                    issue.kind === 'invalid' ? 'text-danger' : 'text-coach',
                  )}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={cx(
                      'font-medium text-sm text-ink tabular-nums',
                      state === 'fixed' && 'line-through',
                    )}
                  >
                    {cellName(issue.cell)}
                  </span>
                  <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
                    {state === 'fixed'
                      ? t('coach.tagFixed')
                      : issue.kind === 'invalid'
                        ? t('coach.tagInvalid', { digit: issue.digit })
                        : t('coach.tagMissing', { digit: issue.digit })}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-ink-soft">{issue.reason}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

In the rendered review section (`:521-536`), swap `review` for `progress` and gate the fix-all button on `progress.open > 0` rather than `review.issues.length > 0` — applying a report with nothing open would be a no-op move on the undo stack:

```tsx
      {progress ? (
        <div className="border-t border-rule px-4 pb-4">
          <h3 className="pt-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
            {t('coach.notesHeading')}
          </h3>
          <IssueList progress={progress} onSpotlight={onSpotlight} />
          {/* Under the list, not above it: the offer to apply them all only
              makes sense once the player has had the chance to read what
              "them" is. Gated on what is still open — a report the player has
              already worked through has nothing left to apply. */}
          {onFixNotes && progress.open > 0 ? (
            <Button variant="secondary" size="lg" block className="mt-3" onClick={onFixNotes}>
              {t('action.fixNotes')}
            </Button>
          ) : null}
        </div>
      ) : null}
```

- [ ] **Step 6: Wire it in GameView, and cut the two couplings**

In `src/app/GameView.tsx`:

Add the memo, beside the other board-derived ones:

```tsx
  const coached = useMemo(() => coachCells(cells), [cells]);
  const progress = useMemo(
    () => (coach.review === null ? null : trackReview(coach.review, coached)),
    [coach.review, coached],
  );
```

Pass `progress={progress}` in place of `review={coach.review}`, and change `onFixNotes`'s body to read the open issues off the progress rather than the raw report — the reducer must still only ever see what was on screen:

```tsx
                  dispatch({
                    type: 'applyNoteFixes',
                    fixes:
                      progress?.items
                        .filter((item) => item.state === 'open')
                        .map(({ issue }) => ({
                          cell: issue.cell,
                          digit: issue.digit,
                          kind: issue.kind,
                        })) ?? [],
                  });
```

**Delete `recheckAfterFix` entirely** — the ref, its effect, and the assignment inside `onFixNotes`. The list revalidates itself on the board change the fix causes, so the targeted re-run has nothing left to do, and its two edge cases and the CI race its comment documents go with it.

Change `closeSheet` to stop clearing the panel:

```tsx
  /**
   * The one path every way of closing the sheet has to go through.
   *
   * It does NOT dismiss the panel. On a phone the sheet *is* the panel, so
   * closing it used to be a lifecycle event rather than a viewport change —
   * a note check the player was working through vanished, and they had to run
   * it again from nothing. On a wide screen the same panel is static and only
   * the X does that, which is the asymmetry that gave the bug away.
   *
   * Consuming the nudge stays here rather than moving to open: dismissing it
   * the moment the sheet appears would clear the badge before the player has
   * read what it was pointing at (spec: a nudge is read, not re-solicited).
   */
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    coach.dismissNudge();
  }, [coach]);
```

- [ ] **Step 7: Add the GameView test**

Append to `src/app/GameView.noteCheck.test.tsx`, following that file's existing helpers:

```tsx
  it('keeps the note check across closing and reopening the sheet', async () => {
    // On a phone the sheet is the panel, so closing it must be a viewport
    // change and not a lifecycle event.
    const { user } = renderGame(/* a game with notes worth checking */);

    await user.click(screen.getByRole('button', { name: 'Check my notes' }));
    expect(screen.getByText(/still to fix|exactly right/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: /coach/i }));

    expect(screen.getByText(/still to fix|exactly right/)).toBeInTheDocument();
  });
```

Read the existing helpers in that file first and match them — it already sets up a game with notes and opens the coach, and those fixtures should be reused rather than re-derived. If the phone tier is not already forced there, force it the way `GameView.layout.test.tsx` does with `matchOnly('(max-width: 639.98px)')`, because the bug only exists at that tier.

- [ ] **Step 8: Run everything and watch it pass**

Run: `npm run verify > /tmp/v2.log 2>&1; tail -30 /tmp/v2.log`
Expected: green. Existing `GameView.noteCheck.test.tsx` tests that asserted the old re-check behaviour may now fail — **read each one before changing it.** A test that asserted "the review is cleared when the sheet closes" was pinning the bug and should be rewritten to assert the new behaviour; a test that asserted the report re-runs after "fix them all" is now asserting something the design deliberately removed. Say in your report which tests you changed and why, one line each.

- [ ] **Step 9: Run the mutations**

1. Restore `coach.dismiss()` in `closeSheet` → expect FAIL on the reopen test.
2. Change the fix-all gate back to `progress.total > 0` → expect FAIL on "offers to fix them all only while something is open".
3. Render every row with the `open` treatment → expect FAIL on "keeps a fixed issue on screen, marked as done".

- [ ] **Step 10: Commit**

```bash
git add src/coach/reviewProgress.ts src/app/useCoachSession.ts src/ui/coach/CoachPanel.tsx src/app/GameView.tsx src/ui/coach/CoachPanel.test.tsx src/app/GameView.noteCheck.test.tsx src/i18n/en.ts src/i18n/it.ts
git commit -F - <<'MSG'
feat(coach): the sheet is a viewport, and the note check outlives it

Closing the coach sheet used to call dismiss(), which nulled the hint, the
note check and the exhausted flag. On a phone the sheet is the panel, so that
made closing it a lifecycle event: a player who ran a check, fixed one issue
and closed the sheet came back to nothing and had to start again. On a wide
screen the same panel is static and only the X does that — the asymmetry is
what gave it away.

The panel now renders an aged report rather than the raw one, so what comes
back is not merely the old reading but a true one, with fixed rows struck
through and a count of what remains. Seeing what you have done is worth the
rows it costs; Paolo chose that over a list that silently shrinks.

recheckAfterFix is deleted. It existed to re-run the report after the bulk fix
button, and the list now ages itself on the board change that fix causes. Its
two edge cases and the CI race its own comment documents go with it — the
second time here that a targeted re-run turned out to be state that should
have been derived.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 3: The coach declines to teach a board that cannot be finished

**Files:**
- Modify: `src/ui/coach/CoachPanel.tsx` — the `unfinishable` prop, the gated controls, the banner's condition
- Modify: `src/app/GameView.tsx` — pass it
- Modify: `src/i18n/en.ts`, `src/i18n/it.ts`
- Test: `src/ui/coach/CoachPanel.test.tsx`, `src/app/GameView.rewind.test.tsx`

**Interfaces:**
- Consumes: `deadEnd` (already computed in `GameView.tsx:235`), `rewinding` (already a `CoachPanel` prop)
- Produces: `CoachPanelProps.unfinishable?: boolean`

**The distinction this task turns on, and it is easy to get wrong.** `unfinishable` is `deadEnd` — **not** `rewind === 'active'`. The phase stays `active` while any entry still contradicts the solution, but a player who has stepped back *out* of the dead end has a board that is playable again, and a hint on it is a perfectly good hint. Gating on the phase would refuse to teach a board that is fine. The banner keeps using the phase, because "you are still on a wrong board" is what the phase means. Two questions, two inputs.

- [ ] **Step 1: Add the strings**

`src/i18n/en.ts`:

```ts
  'coach.deadEnd': 'No technique can help until this board is fixable. Step back with Undo, then ask again.',
```

`src/i18n/it.ts`:

```ts
  'coach.deadEnd': 'Nessuna tecnica può aiutarti finché questa griglia non torna risolvibile. Torna indietro con Annulla, poi chiedi di nuovo.',
```

- [ ] **Step 2: Write the failing tests**

Append to `src/ui/coach/CoachPanel.test.tsx`:

```tsx
describe('a board that cannot be finished', () => {
  const base = {
    hint: null,
    onAsk: () => undefined,
    onEscalate: () => undefined,
  };

  it('will not offer a hint', () => {
    render(<CoachPanel {...base} unfinishable onDrill={() => undefined} />);

    expect(screen.queryByRole('button', { name: /Ask/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set me a challenge' })).toBeNull();
    expect(screen.getByText(/No technique can help/)).toBeInTheDocument();
  });

  it('still offers the note check, which reads only the player own marks', () => {
    render(<CoachPanel {...base} unfinishable onReviewCandidates={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Check my notes' })).toBeInTheDocument();
  });

  it('offers a hint again once the board is finishable', () => {
    render(<CoachPanel {...base} onDrill={() => undefined} />);

    expect(screen.getByRole('button', { name: /Ask/i })).toBeInTheDocument();
  });

  it('says the board is stuck even with nothing undone yet', () => {
    // The banner used to need a non-empty trail, so a dead end reached without
    // undoing anything left the panel silent while the undo key sat amber.
    render(<CoachPanel {...base} rewinding rewindTrail={[]} />);

    expect(screen.getByText(/cannot be finished/)).toBeInTheDocument();
  });
});
```

The exact accessible name of the ask button comes from `coach.rung1.ask` in `src/i18n/en.ts` — read it and use it verbatim rather than the `/Ask/i` sketch above.

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run src/ui/coach/CoachPanel.test.tsx > /tmp/t3.log 2>&1; tail -30 /tmp/t3.log`

- [ ] **Step 4: Implement**

Add to `CoachPanelProps`:

```tsx
  /**
   * No digit fits anywhere on this board, so nothing the catalog finds is
   * worth acting on. The coach declines to teach rather than spend a rung on
   * a board the player has to repair first.
   *
   * This is the dead end itself, not the rewind phase. The two come apart: the
   * phase stays armed while any entry still contradicts the solution, and a
   * player who has stepped back out of the dead end has a board that is
   * perfectly good to teach on.
   */
  unfinishable?: boolean;
```

Destructure it with `unfinishable = false`.

In the button row (`:451-470`), replace the ask/escalate/`coach.done` three-way with a four-way whose first branch is the refusal, and gate the drill block on it too:

```tsx
        {unfinishable ? (
          <p className="py-2 text-sm text-coach">{t('coach.deadEnd')}</p>
        ) : hint === null ? (
          <Button variant="coach" size="lg" onClick={onAsk}>
            {t('coach.rung1.ask')}
          </Button>
        ) : next && hint.canEscalate ? (
          // ...unchanged...
        ) : (
          <p className="py-2 text-sm text-ink-soft">{t('coach.done')}</p>
        )}
```

and

```tsx
        {onDrill && drill === null && hint === null && !unfinishable ? (
```

Leave the `onReviewCandidates` block untouched — the note check reads the player's own marks and cannot be made wrong by an unfinishable board, which is the reason it stays.

Change the banner's condition (`:353`) from `rewindTrail !== undefined && rewindTrail.length > 0` to:

```tsx
      {rewinding || (rewindTrail !== undefined && rewindTrail.length > 0) ? (
```

and make the `<ol>` render only when there is a trail, so a stuck board with nothing undone gets the message without an empty list.

In `src/app/GameView.tsx`, pass `unfinishable={deadEnd}` to `<CoachPanel>`.

- [ ] **Step 5: Add the GameView test**

Append to `src/app/GameView.rewind.test.tsx`, reusing the `ruleCleanDeadEnd()` fixture already in that file — a dead end reached **without** a rule-breaking placement, which is the case that distinguishes `deadEndCells` from `Board.conflicts()`. Do not re-derive a fixture.

```tsx
  it('will not offer a hint on a board that cannot be finished', () => {
    renderGame(ruleCleanDeadEnd());

    expect(screen.getByText(/No technique can help/)).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run and watch them pass, then mutate**

Run: `npm run verify > /tmp/v3.log 2>&1; tail -30 /tmp/v3.log`

Mutations:
1. Change `unfinishable={deadEnd}` to `unfinishable={rewind === 'active'}` → the panel tests still pass, so this one needs a GameView test to catch it. Add: step back out of a dead end so the board is playable but a wrong digit remains, and assert the ask button is back. If you cannot construct that state from the existing fixtures, say so in your report rather than leaving the mutation unproven.
2. Revert the banner condition to `rewindTrail.length > 0` → expect FAIL on "says the board is stuck even with nothing undone yet".

- [ ] **Step 7: Commit**

```bash
git add src/ui/coach/CoachPanel.tsx src/app/GameView.tsx src/ui/coach/CoachPanel.test.tsx src/app/GameView.rewind.test.tsx src/i18n/en.ts src/i18n/it.ts
git commit -F - <<'MSG'
feat(coach): decline to teach a board that cannot be finished

The ask button's only condition was that no hint was showing, so the coach
offered to teach a technique on a board where no digit fits anywhere — and
would happily do it directly underneath its own "nothing found". The finding
is real; acting on it is worthless until the board is repaired.

Gated on the dead end itself rather than on the rewind phase, and the
difference is not cosmetic: the phase stays armed while any entry still
contradicts the solution, so a player who has stepped back out would have been
refused a hint their board deserved. Two questions, two inputs.

"Check my notes" stays. It reads the player's own marks rather than the
catalog, so an unfinishable board cannot make it wrong, and it is the most
useful thing to run when hunting for what went wrong.

The banner also stops needing a non-empty trail: a dead end reached without
undoing anything left the panel silent while the undo key sat amber.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

---

### Task 4: Write down what the coach remembers

**Files:**
- Modify: `docs/architecture.md`
- Issue: update **#22**, close **#116**

- [ ] **Step 1: Add invariant 12**

After invariant 11, add:

```
12. **The coach's panel is a view, and the sheet is a viewport.** Closing the
    mobile sheet hides the panel and consumes the nudge; it does not clear what
    the panel was showing. The bug it replaces existed only on a phone, because
    only there is the sheet the panel — the wide-screen layout has always kept
    its state and nobody noticed the coupling.

    A note-check report is produced once and **aged**, never re-run:
    `trackReview` (`src/coach/reviewProgress.ts`) walks the issues the report
    already names and marks each fixed, still open, or gone. The list can only
    shrink — a new issue would require a check the player did not ask for.

    `missing` is the reason the report carries the board's values with it. It
    means "possible **and** unrefuted by any technique", and that second half
    came from `eliminableCandidates`' fixed point. A placement can unlock a new
    elimination, at which point cheap revalidation would keep advising a mark
    that is now provably impossible — and nothing downstream would catch it,
    because `invalid` sees only basic elimination. So a `missing` issue retires
    the moment its cell or a peer changes value: past that the report says
    nothing rather than something it can no longer prove. `invalid` rests on
    basic elimination alone and is revalidated exactly.

    And the coach declines to teach a board with no digit that fits anywhere,
    gated on the dead end rather than on the rewind phase — the phase outlives
    the dead end, and a repaired board deserves its hint. The note check stays
    offered: it reads the player's own marks, so an unfinishable board cannot
    make it wrong.
```

- [ ] **Step 2: Check the doc against the code**

Read invariant 12 back against `src/coach/reviewProgress.ts`, `src/ui/coach/CoachPanel.tsx` and `src/app/GameView.tsx`. If they disagree, one of them is a bug — say which in your report rather than smoothing it over. `docs/architecture.md` is binding.

- [ ] **Step 3: Verify, commit, update the issues**

Run: `npm run verify > /tmp/v4.log 2>&1; tail -20 /tmp/v4.log`

```bash
git add docs/architecture.md
git commit -F - <<'MSG'
docs: record what the coach remembers, and what it refuses to say

Invariant 12 covers three things that are one thing: the panel is a view, the
sheet is a viewport, and a report is aged rather than re-run.

The part worth writing down is why the ageing carries a snapshot. 'missing'
means possible AND unrefuted by any technique, so a placement can make a cheap
revalidation actively wrong rather than merely stale — and the wrong advice
would not be caught by anything downstream. That reasoning is invisible in the
code that implements it, which is exactly the kind that has to live here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012HtE926ZtMbqJMwT2TvpYt
MSG
```

Then update **#22** — record that the coach's memory work shipped, and add a one-line pointer to invariant 12 under "Things that are true and surprising". Close **#116** with a note saying which commit addressed it. Add the new Italian keys (`coach.marksProgress`, `coach.marksAllFixed`, `coach.tagFixed`, `coach.deadEnd`) to **#65**.

**Do not push and do not open a PR.** `main` auto-deploys, and that decision is Paolo's.
