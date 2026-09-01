import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../../state/mastery';
import { renderWithLocale } from '../../test/renderWithLocale';
import { LessonBody } from './LessonBody';

const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

describe('LessonBody', () => {
  it('renders the lesson prose, worked example and mastery state, with no page chrome', () => {
    renderWithLocale(<LessonBody id="naked_single" locale="en" profile={PROFILE} />);

    expect(screen.getByRole('heading', { name: 'Naked single' })).toBeInTheDocument();
    expect(screen.getByText('A cell with a single candidate left.')).toBeInTheDocument();
    expect(screen.getByText('Not met yet')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Naked single' })).toBeInTheDocument();

    // No back button and no outer page div — that chrome stays with LearnView.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
