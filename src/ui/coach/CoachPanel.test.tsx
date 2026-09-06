import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Hint } from '../../coach/types';
import type { ReviewProgress } from '../../coach/reviewProgress';
import type { DisclosureLevel } from '../../state/types';
import { LocaleProvider } from '../../i18n/react';
import { CoachPanel, type CoachPanelProps } from './CoachPanel';

const hintAt = (level: DisclosureLevel, text: string, canEscalate = true): Hint => ({
  technique: 'hidden_single',
  level,
  text,
  spotlight: level >= 3 ? [27, 36] : [],
  houses: [{ kind: 'box', index: 3 }],
  canEscalate,
  findingKey: 'hidden_single:b3:7',
});

/**
 * The panel takes a `ReviewProgress`, not the raw `CandidateReview` a check
 * produces — that aging is `reviewProgress.test.ts`'s job, not this file's.
 * Both issues are `open` here: these tests are about how a freshly run check
 * is laid out, not about aging, which gets its own `describe` below.
 */
const PROGRESS: ReviewProgress = {
  checkedCells: 12,
  reported: 2,
  total: 2,
  open: 2,
  items: [
    {
      state: 'open',
      issue: {
        cell: 6,
        kind: 'invalid',
        digit: 9,
        reason: 'Column 7 already has a 9 at r7c7.',
        witness: [60],
      },
    },
    {
      state: 'open',
      issue: {
        cell: 30,
        kind: 'missing',
        digit: 6,
        reason: 'Nothing rules a 6 out of this cell.',
        witness: [27, 31],
      },
    },
  ],
};

describe('the disclosure ladder', () => {
  it('invites the first, smallest question before anything has been asked', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    render(<CoachPanel hint={null} onAsk={onAsk} onEscalate={() => undefined} />);

    expect(screen.getByLabelText('Disclosure level 0 of 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Where should I look?' }));

    expect(onAsk).toHaveBeenCalledOnce();
  });

  it('names the level the player is on and what the next one costs', async () => {
    const user = userEvent.setup();
    const onEscalate = vi.fn();
    render(
      <CoachPanel
        hint={hintAt(2, 'Hidden single: a digit with only one home left.')}
        onAsk={() => undefined}
        onEscalate={onEscalate}
      />,
    );

    expect(screen.getByLabelText('Disclosure level 2 of 4')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Show me the cells — disclosure level 3 of 4' }),
    );

    expect(onEscalate).toHaveBeenCalledOnce();
  });

  it('withholds the technique name until level 2, where it is disclosed', () => {
    const { rerender } = render(
      <CoachPanel
        hint={hintAt(1, 'There is a placement waiting in box 4.')}
        onAsk={() => undefined}
        onEscalate={() => undefined}
      />,
    );
    expect(screen.queryByText('Hidden single')).not.toBeInTheDocument();

    rerender(
      <CoachPanel
        hint={hintAt(2, 'Hidden single: a digit with only one home left.')}
        onAsk={() => undefined}
        onEscalate={() => undefined}
      />,
    );
    expect(screen.getByText('Hidden single')).toBeInTheDocument();
  });

  it('prefers the lesson library name over the technique id', () => {
    render(
      <CoachPanel
        hint={hintAt(3, 'The 7 in box 4 is down to three cells.')}
        techniqueLabel="Singolo nascosto"
        onAsk={() => undefined}
        onEscalate={() => undefined}
      />,
    );

    expect(screen.getByText('Singolo nascosto')).toBeInTheDocument();
  });

  it('stops at the last rung and hands the placement back to the player', () => {
    render(
      <CoachPanel
        hint={hintAt(4, 'Row 4 already holds a 7, so 7 leaves r4c1.', false)}
        onAsk={() => undefined}
        onEscalate={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /disclosure level/ })).not.toBeInTheDocument();
    expect(screen.getByText(/The digit is yours to place/)).toBeInTheDocument();
  });

  it('renders the hint text the coach produced, verbatim', () => {
    render(
      <CoachPanel
        hint={hintAt(1, 'There is a placement waiting in box 4.')}
        onAsk={() => undefined}
        onEscalate={() => undefined}
      />,
    );

    expect(screen.getByText('There is a placement waiting in box 4.')).toBeInTheDocument();
  });
});

describe('the note check', () => {
  it('lists each issue by cell, with the constraint that proves it', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={PROGRESS}
      />,
    );

    expect(screen.getByText('r1c7')).toBeInTheDocument();
    expect(screen.getByText("9 can't be here")).toBeInTheDocument();
    expect(screen.getByText('Column 7 already has a 9 at r7c7.')).toBeInTheDocument();
    expect(screen.getByText('r4c4')).toBeInTheDocument();
    expect(screen.getByText('6 is missing')).toBeInTheDocument();
  });

  it('says plainly that nothing was corrected', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={PROGRESS}
      />,
    );

    expect(screen.getByText(/Nothing has been changed for you/)).toBeInTheDocument();
  });

  it('celebrates a clean set of notes without listing anything', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={{ items: [], open: 0, total: 0, checkedCells: 30, reported: 0 }}
      />,
    );

    expect(screen.getByText(/All 30 cells checked/)).toBeInTheDocument();
  });

  it('asks the board to spotlight an issue and its witnesses on hover', async () => {
    const user = userEvent.setup();
    const onSpotlight = vi.fn();
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={PROGRESS}
        onSpotlight={onSpotlight}
      />,
    );

    await user.hover(screen.getByRole('button', { name: /Column 7 already has a 9/ }));
    expect(onSpotlight).toHaveBeenCalledWith([6, 60]);

    await user.unhover(screen.getByRole('button', { name: /Column 7 already has a 9/ }));
    expect(onSpotlight).toHaveBeenLastCalledWith([]);
  });
});

it('says there is nothing to check when the player has made no notes', () => {
  render(
    <CoachPanel
      hint={null}
      onAsk={() => undefined}
      onEscalate={() => undefined}
      progress={{ items: [], open: 0, total: 0, checkedCells: 0, reported: 0 }}
    />,
  );

  expect(screen.getByText(/nothing to check/)).toBeInTheDocument();
  expect(screen.queryByText(/exactly right/)).not.toBeInTheDocument();
});

/*
 * The lesson link keys off "has a technique been named", not off "is there a
 * hint". A drill names one — this panel says so itself in `coach.drillActive`
 * — and the game screen's lesson column already teaches it while one is live.
 * Before this, the column explained the technique and the panel beside it
 * offered no way in.
 */
describe('the way into the lesson', () => {
  it('stays shut while the technique is still being paid for', () => {
    render(
      <CoachPanel
        hint={hintAt(1, 'Look at box 4.')}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        onLearn={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: 'What is this technique?' })).toBeNull();
  });

  it('opens the named technique during a drill, with no hint on screen', async () => {
    const onLearn = vi.fn();
    const user = userEvent.setup();
    render(
      <CoachPanel
        hint={null}
        drill={{ technique: 'hidden_single', solved: false, gone: false }}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        onLearn={onLearn}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'What is this technique?' }));
    expect(onLearn).toHaveBeenCalledWith('hidden_single');
  });
});

/*
 * "Fix them all" applies the report the player is looking at. The panel's own
 * job is narrow: offer it only when there is something to apply, and hand the
 * press straight back — what gets fixed is decided by whoever built the
 * review, not here.
 */
describe('applying the note check', () => {
  it('offers to fix the issues it is showing', async () => {
    const onFixNotes = vi.fn();
    const user = userEvent.setup();
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={PROGRESS}
        onFixNotes={onFixNotes}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Fix them all' }));
    expect(onFixNotes).toHaveBeenCalledOnce();
  });

  it('offers nothing on a clean report', () => {
    // Nothing to apply, and a button that would do nothing reads as a button
    // that failed.
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={{ items: [], open: 0, total: 0, checkedCells: 2, reported: 0 }}
        onFixNotes={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Fix them all' })).toBeNull();
  });

  it('offers nothing when no check has been run', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        onFixNotes={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Fix them all' })).toBeNull();
  });

  it('sits under the issues, so "them" has been read before it is offered', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={PROGRESS}
        onFixNotes={() => undefined}
      />,
    );

    const fix = screen.getByRole('button', { name: 'Fix them all' });
    const firstIssue = screen.getByRole('button', { name: /Column 7 already has a 9/ });
    expect(
      firstIssue.compareDocumentPosition(fix) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

/*
 * "Not that one." The engine reads placed digits, so a player who has already
 * worked a pattern in their notes gets the same finding back every time they
 * ask — the detector cannot see what they did. The way out is the player
 * saying so, rather than the coach trusting marks it must not trust.
 */
describe('setting a finding aside', () => {
  it('offers the way past whatever is on screen', async () => {
    const onAnother = vi.fn();
    const user = userEvent.setup();
    render(
      <CoachPanel
        hint={hintAt(2, 'There is a naked pair in column 3.')}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        onAnother={onAnother}
      />,
    );

    await user.click(screen.getByRole('button', { name: /show me another/i }));
    expect(onAnother).toHaveBeenCalledOnce();
  });

  it('offers nothing to step past when nothing is being said', () => {
    // "Another" is meaningless without a *this*, and at rest the invitation
    // to ask a first question is the only thing that belongs here.
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        onAnother={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /show me another/i })).toBeNull();
  });
});

describe('the rewind trail', () => {
  const renderTrail = (props: Partial<CoachPanelProps>) =>
    render(
      <LocaleProvider locale="en">
        <CoachPanel
          hint={null}
          onAsk={() => undefined}
          onEscalate={() => undefined}
          {...props}
        />
      </LocaleProvider>,
    );

  // All six labels the union can carry — 'placed', 'noted' and 'unnoted'
  // are each about one digit; 'cleared', 'notedAll' and 'unnotedAll' never
  // have one. The digit-bearing fixtures came first in the original test
  // and are left first so its ordering assertion still means what it says;
  // the other four were added under review, because a fixture that only
  // ever exercised 'placed' and 'noted' is exactly how `?? 0` went uncaught.
  const TRAIL = [
    { cell: 3, digit: 9 as const, label: 'placed' as const },
    { cell: 2, digit: 7 as const, label: 'noted' as const },
    { cell: 4, digit: 5 as const, label: 'unnoted' as const },
    { cell: 5, label: 'cleared' as const },
    { cell: 6, label: 'notedAll' as const },
    { cell: 7, label: 'unnotedAll' as const },
  ];

  it('lists the undone moves newest first, and says the board is still wrong', () => {
    renderTrail({ rewindTrail: TRAIL, rewinding: true });

    // Scoped to the trail's own list: the ladder renders four <li>s
    // unconditionally, and `hidden sm:block` does not hide it from jsdom, so a
    // panel-wide `getAllByRole('listitem')` is correct only for as long as the
    // trail keeps coming first in the JSX.
    const items = within(screen.getByTestId('rewind-trail')).getAllByRole('listitem');
    // The count is the assertion that makes the scoping load-bearing rather
    // than decorative: unscoped, this query also collects the ladder's four.
    expect(items).toHaveLength(TRAIL.length);
    expect(items[0].textContent).toContain('r1c4');
    expect(items[1].textContent).toContain('r1c3');
    expect(screen.getByText(/cannot be finished/)).toBeTruthy();
  });

  it('describes every kind of undone move, and never invents a digit for the ones that have none', () => {
    renderTrail({ rewindTrail: TRAIL, rewinding: true });

    const items = within(screen.getByTestId('rewind-trail')).getAllByRole('listitem');
    expect(items[0].textContent).toBe('9 in r1c4');
    expect(items[1].textContent).toBe('noted 7 in r1c3');
    expect(items[2].textContent).toBe('took the note 5 off r1c5');
    expect(items[3].textContent).toBe('cleared r1c6');
    expect(items[4].textContent).toBe('filled in the notes in r1c7');
    expect(items[5].textContent).toBe('cleared the notes in r1c8');
  });

  it('changes what it says once the board works again', () => {
    renderTrail({ rewindTrail: TRAIL, rewinding: false });

    expect(screen.getByText(/Back to a board that works/)).toBeTruthy();
  });

  it('shows nothing at all with no trail', () => {
    // Not `queryByRole('list')`: the ladder above renders its own <ol>
    // unconditionally (its four rungs have to be there to show "not taken
    // yet"), so that role is never absent from this panel. The rewind
    // block's own status lines are what must vanish with it.
    renderTrail({ rewindTrail: [], rewinding: false });

    expect(screen.queryByText(/cannot be finished/)).toBeNull();
    expect(screen.queryByText(/Back to a board that works/)).toBeNull();
  });
});

describe('the note check as it ages', () => {
  // `reported` is required here too — Task 1's `ReviewProgress` carries it so
  // the `total === 0` branch below can tell "clean" from "everything
  // retired" apart. Neither issue here has retired, so it equals `total`.
  const PROGRESS: ReviewProgress = {
    checkedCells: 12,
    total: 2,
    open: 1,
    reported: 2,
    items: [
      {
        state: 'fixed',
        issue: {
          cell: 6,
          kind: 'invalid',
          digit: 9,
          reason: 'Column 7 already has a 9 at r7c7.',
          witness: [60],
        },
      },
      {
        state: 'open',
        issue: {
          cell: 30,
          kind: 'missing',
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

/*
 * A CORRECTION to what an earlier draft of this panel did: `total === 0` is
 * not one claim, it is two. A report born with zero issues and a report every
 * one of whose issues has since retired both reach `total === 0`, but only
 * the first is "your notes are exactly right" — the second is the coach
 * admitting it can no longer prove anything about what it originally found,
 * which is a different sentence entirely.
 */
describe('when a note check has nothing left to show', () => {
  it('says the check found nothing at all when nothing was ever reported', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={{ items: [], open: 0, total: 0, checkedCells: 12, reported: 0 }}
      />,
    );

    expect(screen.getByText(/exactly right/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing from that check still applies/)).toBeNull();
  });

  it('says the check has nothing left to say when everything it found has retired', () => {
    render(
      <CoachPanel
        hint={null}
        onAsk={() => undefined}
        onEscalate={() => undefined}
        progress={{ items: [], open: 0, total: 0, checkedCells: 12, reported: 2 }}
      />,
    );

    expect(screen.getByText(/Nothing from that check still applies/)).toBeInTheDocument();
    expect(screen.queryByText(/exactly right/)).toBeNull();
  });
});

describe('a board that cannot be finished', () => {
  const base = {
    hint: null,
    onAsk: () => undefined,
    onEscalate: () => undefined,
  };

  it('will not offer a hint', () => {
    render(<CoachPanel {...base} unfinishable onDrill={() => undefined} />);

    expect(screen.queryByRole('button', { name: 'Where should I look?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set me a challenge' })).toBeNull();
    expect(screen.getByText(/No technique can help/)).toBeInTheDocument();
  });

  it('still offers the note check, which reads only the player own marks', () => {
    render(<CoachPanel {...base} unfinishable onReviewCandidates={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Check my notes' })).toBeInTheDocument();
  });

  it('offers a hint again once the board is finishable', () => {
    render(<CoachPanel {...base} onDrill={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Where should I look?' })).toBeInTheDocument();
  });

  it('says the board is stuck even with nothing undone yet', () => {
    // The banner used to need a non-empty trail, so a dead end reached without
    // undoing anything left the panel silent while the undo key sat amber.
    render(<CoachPanel {...base} rewinding rewindTrail={[]} />);

    expect(screen.getByText(/cannot be finished/)).toBeInTheDocument();
  });
});
