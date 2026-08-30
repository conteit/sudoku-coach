/**
 * Component gallery.
 *
 * Kept after the integration pass as the UI layer's review surface, reachable
 * in a dev server at `#gallery`. It is dynamically imported behind
 * `import.meta.env.DEV`, so no part of it reaches the production bundle.
 *
 * The review surface for the UI layer: every component rendered against one
 * real puzzle, wired to enough local state that the board and keypad can
 * actually be played. Wiring to the real store, engine and coach lands in the
 * integration pass — nothing here reaches for a store, a database or a
 * detector.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CellIndex, Digit } from '../../engine/types';
import { SudokuGrid, type GridCell } from '../board/SudokuGrid';
import { Keypad } from '../keypad/Keypad';
import { GameList } from '../game/GameList';
import { Timer } from '../game/Timer';
import { DifficultyBadge } from '../game/DifficultyBadge';
import { ConfirmDialog } from '../game/ConfirmDialog';
import { CoachPanel } from '../coach/CoachPanel';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Toggle } from '../primitives/Toggle';
import { Sheet } from '../primitives/Sheet';
import { cx } from '../primitives/cx';
import { MoonIcon, PencilIcon, PlusIcon, SunIcon } from '../primitives/icons';
import { DEMO_CONFLICTS, DEMO_HINTS, DEMO_REVIEW, demoCells, demoGames } from './mocks';

type ThemeChoice = 'system' | 'light' | 'dark';

/** Gallery-local undo history. The real move log lives in state/game.ts. */
interface BoardState {
  cells: GridCell[];
  past: GridCell[][];
  future: GridCell[][];
}

function Section({
  module,
  title,
  note,
  children,
}: {
  module: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-8 pb-14">
      <div className="mb-7 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
        <p className="shrink-0 text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-faint uppercase tabular-nums">
          {module}
        </p>
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-cell border border-rule bg-paper-raised p-4">
      <p className="mb-3 text-[0.625rem] font-semibold tracking-[0.14em] text-ink-faint uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

export function Gallery() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [board, setBoard] = useState<BoardState>(() => ({
    cells: demoCells(),
    past: [],
    future: [],
  }));
  const [selected, setSelected] = useState<CellIndex | null>(30);
  const [pencil, setPencil] = useState(false);
  const [level, setLevel] = useState<0 | 1 | 2 | 3 | 4>(1);
  const [showReview, setShowReview] = useState(true);
  const [peers, setPeers] = useState(true);
  const [matches, setMatches] = useState(true);
  const [conflicts, setConflicts] = useState(false);
  const [coachLayer, setCoachLayer] = useState(true);
  const [spotlight, setSpotlight] = useState<readonly CellIndex[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now] = useState(() => Date.now());

  // index.css lets an explicit `data-theme` beat the OS preference, so the
  // gallery switch is the same mechanism the real settings screen will use.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const commit = useCallback((mutate: (cells: readonly GridCell[]) => GridCell[] | null) => {
    setBoard((state) => {
      const next = mutate(state.cells);
      if (next === null) return state;
      return { cells: next, past: [...state.past.slice(-49), state.cells], future: [] };
    });
  }, []);

  const write = useCallback(
    (cell: CellIndex, digit: Digit) => {
      commit((cells) => {
        const target = cells[cell];
        if (target.given) return null;
        const next = [...cells];
        if (pencil) {
          const marks = new Set(target.candidates);
          if (marks.has(digit)) marks.delete(digit);
          else marks.add(digit);
          next[cell] = { ...target, candidates: marks };
        } else {
          next[cell] = {
            ...target,
            value: target.value === digit ? null : digit,
            candidates: new Set<Digit>(),
          };
        }
        return next;
      });
    },
    [pencil, commit],
  );

  const erase = useCallback(
    (cell: CellIndex) => {
      commit((cells) => {
        const target = cells[cell];
        if (target.given) return null;
        const next = [...cells];
        next[cell] = { ...target, value: null, candidates: new Set<Digit>() };
        return next;
      });
    },
    [commit],
  );

  const undo = useCallback(() => {
    setBoard((state) =>
      state.past.length === 0
        ? state
        : {
            cells: state.past[state.past.length - 1],
            past: state.past.slice(0, -1),
            future: [state.cells, ...state.future],
          },
    );
  }, []);

  const redo = useCallback(() => {
    setBoard((state) =>
      state.future.length === 0
        ? state
        : {
            cells: state.future[0],
            past: [...state.past, state.cells],
            future: state.future.slice(1),
          },
    );
  }, []);

  const cells = board.cells;
  const values = useMemo(() => cells.map((cell) => cell.value), [cells]);
  const hint = level === 0 ? null : DEMO_HINTS[level];
  const games = useMemo(() => demoGames(now), [now]);

  const coachSpotlight = spotlight.length > 0 ? spotlight : coachLayer ? hint?.spotlight : undefined;
  const coachHouses = coachLayer ? hint?.houses : undefined;

  return (
    <div className="min-h-dvh bg-paper pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-30 border-b border-ink bg-paper/92 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <h1 className="font-display text-lg leading-none tracking-tight text-ink">
            Sudoku&nbsp;Coach
          </h1>
          <p className="hidden flex-1 text-xs text-ink-faint sm:block">
            UI layer &mdash; component gallery
          </p>
          <div
            role="group"
            aria-label="Theme"
            className="ml-auto flex overflow-hidden rounded-cell border border-rule-strong"
          >
            {(['light', 'system', 'dark'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={theme === choice}
                onClick={() => setTheme(choice)}
                className={cx(
                  'flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium capitalize',
                  'transition-colors duration-100 ease-snap',
                  theme === choice ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-sunk',
                )}
              >
                {choice === 'light' ? <SunIcon /> : choice === 'dark' ? <MoonIcon /> : null}
                {choice}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <div className="py-14">
          <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
            Ink &amp; Paper
          </p>
          <p className="mt-4 max-w-2xl font-display text-3xl leading-[1.2] text-ink sm:text-4xl">
            A puzzle book that happens to be a phone app. Editorial numerals, hairline rules, one
            accent, and nothing that moves without a reason.
          </p>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Every component below is live and prop-driven. Click a cell, type a digit, take the
            coach one rung further. Switch the theme in the header to review the dark palette.
          </p>
        </div>

        <Section
          module="src/ui/board"
          title="The board"
          note="One CSS grid, 81 memoized cells. Box rules are heavier borders on the cells themselves rather than nested wrappers, so the drawing stays pixel-crisp at any width. Pencil marks hold a fixed slot in a 3x3 mini-grid — a mark never moves when a sibling is added."
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="mx-auto w-full max-w-[34rem]">
              <div className="mb-3 flex items-center justify-between gap-4">
                <DifficultyBadge difficulty="expert" />
                <Timer elapsedMs={41 * 60_000 + 12_000} runningSince={now} size="md" />
              </div>
              <SudokuGrid
                cells={cells}
                selected={selected}
                onSelect={setSelected}
                onEnter={write}
                onClear={erase}
                highlightPeers={peers}
                highlightMatches={matches}
                conflicts={conflicts ? DEMO_CONFLICTS : undefined}
                spotlight={coachSpotlight}
                tintedHouses={coachHouses}
              />
              <p className="mt-3 text-xs text-ink-faint">
                Arrows move, 1&ndash;9 write, backspace clears. Givens swallow the keystroke.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <Panel label="Highlight layers">
                <div className="flex flex-col gap-3">
                  <Toggle
                    checked={peers}
                    onChange={setPeers}
                    label="Row, column and box"
                    description="Shades the selection's houses."
                  />
                  <Toggle
                    checked={matches}
                    onChange={setMatches}
                    label="Same number"
                    description="Green on every placed occurrence."
                  />
                  <Toggle
                    checked={coachLayer}
                    onChange={setCoachLayer}
                    label="Coach layers"
                    description="Spotlight cells and tinted houses."
                  />
                  <Toggle
                    checked={conflicts}
                    onChange={setConflicts}
                    label="Flag conflicts"
                    description="Off by default — it is a setting, not a rule."
                  />
                </div>
              </Panel>
              <Panel label="Keypad">
                <Keypad
                  values={values}
                  pencilMode={pencil}
                  onTogglePencil={() => setPencil((p) => !p)}
                  onDigit={(digit) => selected !== null && write(selected, digit)}
                  onErase={() => selected !== null && erase(selected)}
                  onUndo={undo}
                  onRedo={redo}
                  canUndo={board.past.length > 0}
                  canRedo={board.future.length > 0}
                  disabled={selected === null}
                />
              </Panel>
            </div>
          </div>
        </Section>

        <Section
          module="src/ui/keypad"
          title="Digit entry"
          note="A 3x3 pad, not a 1x9 strip: nine keys across a phone leaves 36px targets, and the box shape echoes the board. Each key shows how many of that digit are unplaced. In notes mode the key previews the slot the mark will land in."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
            <Panel label="Place mode">
              <Keypad
                values={values}
                pencilMode={false}
                onTogglePencil={() => setPencil(true)}
                onDigit={() => undefined}
                onErase={() => undefined}
                onUndo={() => undefined}
                onRedo={() => undefined}
                canUndo={false}
              />
            </Panel>
            <Panel label="Notes mode">
              <Keypad
                values={values}
                pencilMode
                onTogglePencil={() => setPencil(false)}
                onDigit={() => undefined}
                onErase={() => undefined}
                onUndo={() => undefined}
                onRedo={() => undefined}
              />
            </Panel>
          </div>
        </Section>

        <Section
          module="src/ui/game"
          title="Saved puzzles"
          note="Progress is the board itself. Each row draws its own game at 44px — givens in ink, your entries in blue — so you recognise a puzzle by its shape and see where the gaps are, which is more than a progress bar has ever told anyone."
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <GameList
              games={games}
              now={now}
              onResume={() => setSheetOpen(false)}
              onNewGame={() => setSheetOpen(true)}
            />
            <div className="flex flex-col gap-4">
              <Panel label="Difficulty">
                <div className="flex flex-col gap-2.5">
                  <DifficultyBadge difficulty="easy" />
                  <DifficultyBadge difficulty="medium" />
                  <DifficultyBadge difficulty="hard" />
                  <DifficultyBadge difficulty="expert" />
                </div>
              </Panel>
              <Panel label="Timer">
                <div className="flex items-baseline gap-5">
                  <Timer elapsedMs={62_000} runningSince={null} />
                  <Timer elapsedMs={41 * 60_000 + 12_000} runningSince={null} size="md" />
                  <Timer elapsedMs={3 * 3_600_000 + 4_000} runningSince={null} size="md" />
                </div>
              </Panel>
              <Panel label="Destructive confirmation">
                <Button variant="danger" block onClick={() => setConfirmOpen(true)}>
                  Reset board
                </Button>
              </Panel>
            </div>
          </div>
        </Section>

        <Section
          module="src/ui/coach"
          title="The coach"
          note="The disclosure ladder is drawn, not implied: four rungs named for what each one gives up, filled to the level taken. Asking for more is a visible choice, and the last rung still stops short of the digit."
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <div>
              <CoachPanel
                hint={hint}
                onAsk={() => setLevel(1)}
                onEscalate={() => setLevel((l) => (l < 4 ? ((l + 1) as 1 | 2 | 3 | 4) : l))}
                review={showReview ? DEMO_REVIEW : null}
                onReviewCandidates={() => setShowReview(true)}
                onSpotlight={setSpotlight}
              />
            </div>
            <div className="flex flex-col gap-4">
              <Panel label="Drive the ladder">
                <div className="flex flex-wrap gap-2">
                  {([0, 1, 2, 3, 4] as const).map((step) => (
                    <Button
                      key={step}
                      size="sm"
                      variant={level === step ? 'primary' : 'secondary'}
                      onClick={() => setLevel(step)}
                    >
                      {step === 0 ? 'Not asked' : `Level ${step}`}
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                  Hovering a note-check issue spotlights its witnesses on the board above.
                </p>
              </Panel>
              <Panel label="Note check">
                <Toggle
                  checked={showReview}
                  onChange={setShowReview}
                  label="Show the review"
                  description="Nothing is ever corrected for the player."
                />
              </Panel>
            </div>
          </div>
        </Section>

        <Section
          module="src/ui/primitives"
          title="Shared pieces"
          note="Rectangles with a 3px radius instead of pills, hairline rules instead of shadows, and a 1px press on --ease-snap. Icons are hand-drawn on one 24-unit grid; no icon library, no emoji."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Panel label="Button">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary">Primary</Button>
                <Button>Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="coach" icon={<PencilIcon />}>
                  Coach
                </Button>
                <Button variant="danger">Danger</Button>
                <Button disabled>Disabled</Button>
              </div>
            </Panel>
            <Panel label="Sizes">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" icon={<PlusIcon />}>
                  Small
                </Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </Panel>
            <Panel label="Icon button">
              <div className="flex gap-2">
                <IconButton size="sm" label="Notes" icon={<PencilIcon />} />
                <IconButton size="sm" label="Notes on" icon={<PencilIcon />} pressed />
                <IconButton size="sm" label="Add" icon={<PlusIcon />} />
                <IconButton size="sm" label="Disabled" icon={<PlusIcon />} disabled />
              </div>
            </Panel>
            <Panel label="Toggle">
              <div className="flex flex-col gap-3">
                <Toggle checked onChange={() => undefined} label="Haptics" description="On" />
                <Toggle checked={false} onChange={() => undefined} label="Auto notes" />
              </div>
            </Panel>
            <Panel label="Sheet">
              <Button block onClick={() => setSheetOpen(true)}>
                Open sheet
              </Button>
            </Panel>
          </div>
        </Section>
      </main>

      <footer className="border-t border-rule px-5 py-10">
        <p className="mx-auto max-w-6xl text-xs text-ink-faint">
          Components are pure and prop-driven. Store, persistence and the technique engine arrive in
          the integration pass.
        </p>
      </footer>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset this board?"
        body="Every digit and note you have entered goes back to the original puzzle. The clock keeps running."
        confirmLabel="Reset board"
        destructive
        onConfirm={() => {
          commit(() => demoCells());
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="New puzzle"
        description="Pick how hard you want to work for it."
        footer={
          <Button variant="primary" size="lg" block onClick={() => setSheetOpen(false)}>
            Deal it
          </Button>
        }
      >
        <div className="flex flex-col gap-1">
          {(['easy', 'medium', 'hard', 'expert'] as const).map((difficulty) => (
            <button
              key={difficulty}
              type="button"
              className="flex items-center justify-between rounded-cell border border-transparent px-2 py-2.5 text-left transition-colors duration-100 ease-snap hover:border-rule hover:bg-paper-sunk"
            >
              <DifficultyBadge difficulty={difficulty} />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
