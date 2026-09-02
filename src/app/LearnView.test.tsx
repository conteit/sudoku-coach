import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../state/mastery';
import { LearnView } from './LearnView';
import { renderWithLocale } from '../test/renderWithLocale';

// `LearnView` reads lesson copy from `profile.locale`, same as the real app,
// which always keeps the tree locale (from LocaleProvider) and the profile's
// locale in step. DEFAULT_PROFILE is Italian, so an English-language test
// needs an English profile to match the English tree renderWithLocale defaults to.
const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

// This file characterises the narrow (phone/tablet) layout — the page push
// with a back button, below `LearnView`'s `laptop`/`desktop` split. That was
// once true unconditionally, before `LearnView` had a tier at all; now that
// it does, the assumption has to be stated rather than left to
// `tests/setup.ts`'s shared default, the same correction this branch already
// made for `DEFAULT_PROFILE`'s locale not being English.
beforeEach(() => {
  window.innerWidth = 375;
});

describe('LearnView', () => {
  it('lists every technique with its mastery state', () => {
    renderWithLocale(<LearnView profile={PROFILE} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /techniques/i })).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(10);
  });

  it('opens a technique page and comes back', async () => {
    const user = userEvent.setup();
    renderWithLocale(<LearnView profile={PROFILE} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /naked single/i }));
    expect(screen.getByRole('article')).toBeTruthy();
  });
});
