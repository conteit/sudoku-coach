import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../../state/mastery';
import { renderWithLocale } from '../../test/renderWithLocale';
import { LessonBody } from './LessonBody';

const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

describe('LessonBody', () => {
  it('renders the lesson prose, worked example and mastery state, with no page chrome', () => {
    renderWithLocale(<LessonBody id="naked_single" profile={PROFILE} />);

    expect(screen.getByRole('heading', { name: 'Naked single' })).toBeInTheDocument();
    expect(screen.getByText('A cell with a single candidate left.')).toBeInTheDocument();
    expect(screen.getByText('Not met yet')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Naked single' })).toBeInTheDocument();

    // No back button and no outer page div — that chrome stays with LearnView.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // The locale is the profile's — the prop that could disagree with it is
  // gone, and this is what proves the remaining path actually reads it.
  it('reads the lesson in the profile\'s locale', () => {
    renderWithLocale(
      <LessonBody id="naked_single" profile={{ ...PROFILE, locale: 'it' }} />,
      'it',
    );

    expect(screen.getByRole('heading', { name: 'Singolo nudo' })).toBeInTheDocument();
  });

  // The title/mastery-chip header has to stay one flex row whether or not a
  // caller fills `leading` — it already split into two rows once, and no
  // other test in this suite would notice if it did again.
  it('keeps the title/mastery-chip header a single row, with or without a leading control', () => {
    const { container: withLeading } = renderWithLocale(
      <LessonBody
        id="naked_single"
        profile={PROFILE}
        leading={<button type="button">Back</button>}
      />,
    );
    const headerWithLeading = withLeading.querySelector('header');
    expect(headerWithLeading).not.toBeNull();
    expect(headerWithLeading!.className).toBe('flex items-start gap-3 pb-4');
    expect(Array.from(headerWithLeading!.children).map((child) => child.tagName)).toEqual([
      'BUTTON',
      'DIV',
      'SPAN',
    ]);

    const { container: withoutLeading } = renderWithLocale(
      <LessonBody id="naked_single" profile={PROFILE} />,
    );
    const headerWithoutLeading = withoutLeading.querySelector('header');
    expect(headerWithoutLeading).not.toBeNull();
    expect(headerWithoutLeading!.className).toBe('flex items-start gap-3 pb-4');
    expect(Array.from(headerWithoutLeading!.children).map((child) => child.tagName)).toEqual([
      'DIV',
      'SPAN',
    ]);
  });
});
