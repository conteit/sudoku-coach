import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../state/mastery';
import { renderWithLocale } from '../../test/renderWithLocale';
import { TechniqueIndex } from './TechniqueIndex';

const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

describe('TechniqueIndex', () => {
  it('lists every technique with its mastery state and opens the one clicked', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithLocale(<TechniqueIndex profile={PROFILE} onOpen={onOpen} />);

    expect(screen.getByRole('heading', { name: /techniques/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(10);

    await user.click(screen.getByRole('button', { name: /naked single/i }));
    expect(onOpen).toHaveBeenCalledWith('naked_single');
  });

  it('renders static rows with no onOpen, because there is nowhere to navigate to', () => {
    renderWithLocale(<TechniqueIndex profile={PROFILE} />);

    expect(screen.getByRole('heading', { name: /techniques/i })).toBeInTheDocument();
    expect(screen.getByText('Naked single')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
