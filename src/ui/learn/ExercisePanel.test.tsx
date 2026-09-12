import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExercisePanel } from './ExercisePanel';

const show = (quality: Parameters<typeof ExercisePanel>[0]['quality']) =>
  render(
    <ExercisePanel
      techniqueLabel="Hidden pair"
      quality={quality}
      hint={null}
      onAsk={vi.fn()}
      onEscalate={vi.fn()}
      onNewGrid={vi.fn()}
      onExit={vi.fn()}
    />,
  );

describe('ExercisePanel', () => {
  it('says nothing about the grid when the technique is the only way forward', () => {
    show('exclusive');
    expect(document.body.textContent).not.toMatch(/also works|single candidate/i);
  });

  it('owns up when another technique also works here', () => {
    show('clean');
    expect(screen.getByText(/another technique also works/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/single candidate/i);
  });

  it('warns outright when a single is sitting on the board', () => {
    // The grade Paolo's hidden-pair drill was: a cell down to one candidate
    // reads as the answer, and being told it is not part of the pattern reads
    // as a trick. If the exercise has to use such a grid, it says so first.
    show('shared');
    expect(screen.getByText(/single candidate/i)).toBeTruthy();
  });
});
