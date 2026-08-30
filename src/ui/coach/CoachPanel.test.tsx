import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateReview, Hint } from '../../coach/types';
import type { DisclosureLevel } from '../../state/types';
import { CoachPanel } from './CoachPanel';

const hintAt = (level: DisclosureLevel, text: string, canEscalate = true): Hint => ({
  technique: 'hidden_single',
  level,
  text,
  spotlight: level >= 3 ? [27, 36] : [],
  houses: [{ kind: 'box', index: 3 }],
  canEscalate,
  findingKey: 'hidden_single:b3:7',
});

const REVIEW: CandidateReview = {
  checkedCells: 12,
  cleanCells: [1, 2, 3],
  issues: [
    {
      cell: 6,
      kind: 'invalid',
      digit: 9,
      reason: 'Column 7 already has a 9 at r7c7.',
      witness: [60],
    },
    {
      cell: 30,
      kind: 'missing',
      digit: 6,
      reason: 'Nothing rules a 6 out of this cell.',
      witness: [27, 31],
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
        review={REVIEW}
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
        review={REVIEW}
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
        review={{ issues: [], cleanCells: [1, 2], checkedCells: 30 }}
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
        review={REVIEW}
        onSpotlight={onSpotlight}
      />,
    );

    await user.hover(screen.getByRole('button', { name: /Column 7 already has a 9/ }));
    expect(onSpotlight).toHaveBeenCalledWith([6, 60]);

    await user.unhover(screen.getByRole('button', { name: /Column 7 already has a 9/ }));
    expect(onSpotlight).toHaveBeenLastCalledWith([]);
  });
});
