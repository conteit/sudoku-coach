/**
 * The front door: what this app is, and a board to prove it on.
 *
 * The hero is a real puzzle rather than a picture of one — the same easy
 * board for everyone until midnight, generated from the date's own seed, so
 * nothing has to store or serve it. A visitor can place a digit before they
 * have decided anything.
 *
 * It is deliberately *not* a game: no coach, no timer, no autosave, nothing
 * in IndexedDB. What it is, is an argument — the thesis is the selling point,
 * because never handing out a digit is the only thing that distinguishes this
 * from every other sudoku on the web.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseGrid } from '../engine/board';
import type { CellIndex, Digit, GeneratedPuzzle } from '../engine/types';
import { useT } from '../i18n/locale';
import { SudokuGrid, type GridCell } from '../ui/board/SudokuGrid';
import { Button } from '../ui/primitives/Button';
import { seedForDate } from './dailyPuzzle';
import { useGenerator } from './useGenerator';

export interface LandingViewProps {
  /**
   * Into the app. The taster's own placements come along when there are any:
   * a visitor who has started thinking about a board should not have to start
   * it again to keep going.
   */
  onStart: (taster: { puzzle: GeneratedPuzzle; entries: readonly (Digit | null)[] } | null) => void;
  /** Overridable so a test does not depend on what day it is. */
  now?: () => Date;
}

export function LandingView({ onStart, now = () => new Date() }: LandingViewProps) {
  const t = useT();
  const generator = useGenerator();
  const [puzzle, setPuzzle] = useState<GeneratedPuzzle | null>(null);
  const [entries, setEntries] = useState<readonly (Digit | null)[]>([]);
  const [selected, setSelected] = useState<CellIndex | null>(null);

  const seed = useMemo(() => seedForDate(now()), [now]);

  useEffect(() => {
    let live = true;
    void generator.generate('easy', seed).then((result) => {
      if (!live || result === null) return;
      setPuzzle(result.puzzle);
      setEntries(parseGrid(result.puzzle.givens));
    });
    return () => {
      live = false;
      generator.cancel();
    };
    // Once per seed: the puzzle is the day's, and re-running it on every
    // render of a marketing page would burn a worker for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const givens = useMemo(
    () => (puzzle === null ? null : parseGrid(puzzle.givens)),
    [puzzle],
  );

  const cells: GridCell[] = useMemo(
    () =>
      (givens ?? new Array<Digit | null>(81).fill(null)).map((given, index) => ({
        value: entries[index] ?? given,
        given: given !== null,
        candidates: new Set<Digit>(),
      })),
    [givens, entries],
  );

  const enter = useCallback(
    (cell: CellIndex, digit: Digit) => {
      setEntries((current) => {
        const next = [...current];
        // A tap on the digit already there clears it, which is the whole
        // erase affordance this board needs.
        next[cell] = next[cell] === digit ? null : digit;
        return next;
      });
    },
    [],
  );

  const touched = givens !== null && entries.some((value, i) => value !== givens[i]);

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-10 px-6 pt-10 pb-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">{t('app.name')}</h1>
        <p className="font-display max-w-[30rem] text-xl leading-tight text-ink">
          {t('landing.tagline')}
        </p>
        {/* The prose cap is invariant 10's, and it applies to a marketing
            page exactly as much as to a lesson. */}
        <p className="max-w-[40rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          {t('landing.lede')}
        </p>
      </header>

      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-10">
        <div className="w-full max-w-[28rem] shrink-0">
          {puzzle === null ? (
            // A fixed-size placeholder rather than nothing: the board's box
            // is the page's largest element, and a page that reflows around
            // it when generation lands is a page that moves under a reader.
            <div
              className="grid aspect-square w-full place-items-center rounded-cell border-2 border-rule-strong bg-paper-raised text-sm text-ink-soft"
              role="status"
            >
              {t('landing.tasterLoading')}
            </div>
          ) : (
            <SudokuGrid
              cells={cells}
              selected={selected}
              onSelect={setSelected}
              onEnter={enter}
              onClear={(cell) =>
                setEntries((current) => {
                  const next = [...current];
                  next[cell] = null;
                  return next;
                })
              }
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <h2 className="font-display text-xl leading-tight text-ink">
            {t('landing.tasterTitle')}
          </h2>
          <p className="max-w-[40rem] text-[0.9375rem] leading-relaxed text-ink-soft">
            {t('landing.tasterIntro')}
          </p>
          <div className="flex flex-col gap-2 sm:max-w-[20rem]">
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => onStart(touched && puzzle !== null ? { puzzle, entries } : null)}
            >
              {touched ? t('landing.startWithBoard') : t('landing.start')}
            </Button>
            <p className="text-sm text-ink-soft">{t('landing.offline')}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 border-t border-rule pt-8 sm:grid-cols-3">
        {(['point1', 'point2', 'point3'] as const).map((point) => (
          <div key={point} className="flex flex-col gap-2">
            <h2 className="font-display text-lg leading-tight text-ink">
              {t(`landing.${point}.title`)}
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
              {t(`landing.${point}.body`)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
