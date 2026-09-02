import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TECHNIQUE_IDS } from '../../engine/types';
import { DEFAULT_PROFILE } from '../../state/mastery';
import type { MasteryEntry, PlayerProfile } from '../../state/types';
import { renderWithLocale } from '../../test/renderWithLocale';
import { ProgressPanel } from './ProgressPanel';

const PROFILE = { ...DEFAULT_PROFILE, locale: 'en' } as const;

// `edgeOfMastery` (src/state/mastery.ts:138) returns null only when every
// technique has reached `applied_unaided` — that is the one stage the
// half-learned and unseen branches can never re-select, so once all of them
// sit there both `halfLearned` and `unseen` stay null. Anything less than
// every technique still leaves an edge to practise.
function everyTechniqueMastered(profile: PlayerProfile): PlayerProfile {
  const mastered: MasteryEntry = {
    stage: 'applied_unaided',
    applications: 1,
    misses: 0,
    lastSeenAt: 1,
  };
  const mastery = Object.fromEntries(TECHNIQUE_IDS.map((id) => [id, mastered]));
  return { ...profile, mastery };
}

describe('ProgressPanel', () => {
  it('names what to learn next', () => {
    renderWithLocale(<ProgressPanel profile={PROFILE} />);
    expect(screen.getByText(/next up/i)).toBeTruthy();
  });

  it('lists the techniques as text, not as controls — there is nowhere to go from here', () => {
    renderWithLocale(<ProgressPanel profile={PROFILE} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  // One panel, not two sibling sections. `TechniqueIndex` is shared with two
  // screens that host it as a section of their own, where its `h2` is right;
  // here it sits under this panel's own `h2` and has to step down a level or
  // the outline gains a section the pane does not have.
  it('nests the technique list under its own heading', () => {
    renderWithLocale(<ProgressPanel profile={PROFILE} />);

    const headings = screen.getAllByRole('heading');
    expect(headings.map((heading) => [heading.tagName, heading.textContent])).toEqual([
      ['H2', 'Your progress'],
      ['H3', 'The techniques'],
    ]);
  });

  it('says so when there is nothing left to meet', () => {
    const mastered = everyTechniqueMastered(PROFILE);
    renderWithLocale(<ProgressPanel profile={mastered} />);
    expect(screen.getByText(/every technique/i)).toBeTruthy();
  });
});
