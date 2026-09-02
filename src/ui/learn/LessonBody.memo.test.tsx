/**
 * The lesson column sits beside a live board on a desktop viewport, so it
 * re-renders whenever the game does — which is on every selection and every
 * keystroke. Rebuilding the worked example that often means `parseGrid` plus
 * `exampleMarks` plus an 81-cell grid competing with the board the player is
 * actually using.
 *
 * The mock is the real implementation with a counter around it: what is being
 * asserted is how often the example is rebuilt, not what it contains.
 */

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../state/mastery';
import { exampleMarks } from '../../coach/lessons';
import { LessonBody } from './LessonBody';

vi.mock('../../coach/lessons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../coach/lessons')>();
  return { ...actual, exampleMarks: vi.fn(actual.exampleMarks) };
});

const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

function Host() {
  const [selected, setSelected] = useState(0);

  return (
    <>
      <button type="button" onClick={() => setSelected((cell) => cell + 1)}>
        select
      </button>
      <output>{selected}</output>
      <LessonBody id="naked_single" profile={PROFILE} titleAs="h2" />
    </>
  );
}

describe('LessonBody, beside a board', () => {
  it('does not rebuild the worked example when its host re-renders with the same props', async () => {
    const rebuilds = vi.mocked(exampleMarks);
    render(<Host />);
    expect(rebuilds).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'select' }));
    await userEvent.click(screen.getByRole('button', { name: 'select' }));

    // Proof the host really did re-render twice — a memo test that passes
    // because nothing rendered at all proves nothing.
    expect(screen.getByRole('status')).toHaveTextContent('2');
    expect(rebuilds).toHaveBeenCalledTimes(1);
  });
});
