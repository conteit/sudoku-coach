import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from './react';
import { preferredLocale } from './locale';
import { GameList } from '../ui/game/GameList';
import { Keypad } from '../ui/keypad/Keypad';
import { formatGrid, parseGrid } from '../engine/board';
import type { Locale } from '../state/types';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

const values = parseGrid(PUZZLE);

function inLocale(locale: Locale, node: React.ReactNode) {
  return render(<LocaleProvider locale={locale}>{node}</LocaleProvider>);
}

describe('components read the dictionary', () => {
  it('renders the keypad in the tree locale', () => {
    inLocale('it', (
      <Keypad
        values={values}
        pencilMode={false}
        onTogglePencil={() => undefined}
        onDigit={() => undefined}
        onErase={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
      />
    ));

    expect(screen.getByRole('group', { name: 'Tastierino' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annulla mossa' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Inserisci 5/)).toBeInTheDocument();
  });

  it('renders the game list in the tree locale, difficulty label included', () => {
    inLocale('it', (
      <GameList
        games={[
          {
            id: 'g1',
            difficulty: 'hard',
            givens: PUZZLE,
            board: formatGrid(values),
            elapsedMs: 60_000,
            runningSince: null,
            updatedAt: Date.now(),
          },
        ]}
        onResume={() => undefined}
        onNewGame={() => undefined}
      />
    ));

    expect(screen.getByRole('button', { name: 'Nuova griglia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Riprendi la griglia difficile/ })).toBeInTheDocument();
  });

  it('defaults to English when no provider is above it', () => {
    render(
      <Keypad
        values={values}
        pencilMode
        onTogglePencil={() => undefined}
        onDigit={() => undefined}
        onErase={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
      />,
    );

    expect(screen.getByRole('group', { name: 'Keypad, notes mode' })).toBeInTheDocument();
  });
});

describe('preferredLocale', () => {
  it('takes the first language the browser asks for that we speak', () => {
    expect(preferredLocale(['fr-FR', 'it-IT', 'en-GB'])).toBe('it');
    expect(preferredLocale(['en-US'])).toBe('en');
  });

  it('says nothing rather than guessing when it speaks none of them', () => {
    expect(preferredLocale(['fr-FR', 'de'])).toBeUndefined();
  });
});
