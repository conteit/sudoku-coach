# Wide Library and Learn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the library and the Learn section a second pane on wide viewports, so neither is a 576px column centred in empty space.

**Architecture:** One presentational `SplitLayout` arranges an index pane beside a content pane per tier, and both screens use it. The library's new pane is a thin `ProgressPanel` built from the `TechniqueIndex` the game screen already shows, so the two cannot drift into different accounts of the same mastery data. Learn becomes master-detail above 1024 and keeps its push-a-page behaviour below.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 (stock breakpoints, no config file), vitest + @testing-library/react, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-09-02-wide-library-and-learn-design.md`

## Global Constraints

- **Prose caps at 40rem** — roughly a 70-character measure. It applies to the prose inside a pane, not to the pane: an example grid or a heading may use the pane's full width.
- **Two panes appear at `laptop` (≥1024).** Phone (<640) and tablet (640–1023) stay one column. Tiers come from `src/app/useViewportTier.ts` — no new breakpoints, no second source of truth.
- **The phone layout of both screens must not change**, and no pre-existing phone assertion may be edited. If one needs editing, that is a defect in the change — stop and report it.
- **Selecting a technique must not resize the index pane.** Pane widths are a property of the tier, exactly as on the game screen: `w-[..] shrink-0 min-w-0`, all three. `shrink-0` alone leaves `min-width: auto`, which floors a flex item at min-content, so one unbreakable string would push the pane wider and steal the difference from its neighbour.
- **Frozen contracts, must not be edited:** `src/engine/types.ts`, `src/state/types.ts`, `src/coach/types.ts`.
- **Do not touch** `src/app/GameLayout.tsx`, `src/app/GameView.tsx`, `src/app/useCoachSession.ts` or `src/coach/triggers.ts`.
- **Every UI string reads the dictionary** — same key in `src/i18n/en.ts` and `src/i18n/it.ts`, or `tsc` fails on the `MessageKey` union. New Italian is a translation pending native review: say so in your report and it goes on a `needs-human` issue.
- **Verify contract:** `npm run verify` = lint → `tsc -b` → vitest → build; CI runs that plus `npm run e2e` across four projects. Never weaken a config, test or assertion. Redirect heavy output: `npm run e2e > /tmp/e2e.log 2>&1; tail -60 /tmp/e2e.log`.
- **Style:** comments explain *why*, not *what*. `src/app/GameLayout.tsx` is the reference for how a layout decision gets argued in a comment. Commit messages explain the reasoning.

---

### Task 1: `SplitLayout` — one split, used twice

**Files:**
- Create: `src/app/SplitLayout.tsx`, `src/app/SplitLayout.test.tsx`

**Interfaces:**
- Consumes: `Tier` from `src/app/useViewportTier.ts`.
- Produces: `SplitLayout({ tier, left, right }: { tier: Tier; left: ReactNode; right: ReactNode }): JSX.Element`. Tasks 3 and 4 both render it.

**It is geometry only.** It renders two panes and nothing else — no landmarks, no headings, no labels. That is deliberate: the two screens do **not** share landmark semantics. In Learn the left pane is navigation and the right is the document; in the library the left pane is the main content and the right is complementary. A component that hardcoded `<nav>` beside `<section>` would be right for one screen and wrong for the other, and the wrong one would ship a lie to a screen-reader user. Each screen supplies its own landmark element inside the pane it owns.

Below `laptop` it renders `left` then `right` in one column, inside a single container — a phone must get the same DOM it gets today.

**Why not `GameLayout`:** that arranges three regions under invariant 9, where nothing may resize the board mid-play. This arranges two panes on screens that scroll normally. Merging them would make one component with two unrelated reasons to change.

- [ ] **Step 1: Write the failing test**

Create `src/app/SplitLayout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitLayout } from './SplitLayout';

const panes = { left: <p>the left</p>, right: <p>the right</p> };

describe('SplitLayout', () => {
  it('stacks one column on a phone', () => {
    render(<SplitLayout tier="phone" {...panes} />);
    expect(screen.getByText('the left')).toBeTruthy();
    expect(screen.getByText('the right')).toBeTruthy();
    expect(screen.queryByTestId('left-pane')).toBeNull();
  });

  it('stacks on a tablet too — two columns there are worse than one', () => {
    render(<SplitLayout tier="tablet" {...panes} />);
    expect(screen.queryByTestId('left-pane')).toBeNull();
  });

  it('splits at laptop, left before right in the DOM', () => {
    render(<SplitLayout tier="laptop" {...panes} />);
    const left = screen.getByTestId('left-pane');
    const right = screen.getByTestId('right-pane');
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pins the left pane so its neighbour cannot squeeze it', () => {
    render(<SplitLayout tier="desktop" {...panes} />);
    const cls = screen.getByTestId('left-pane').className;
    expect(cls).toContain('shrink-0');
    expect(cls).toContain('min-w-0');
  });

  it('adds no landmarks of its own — each screen owns its own semantics', () => {
    render(<SplitLayout tier="laptop" {...panes} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/SplitLayout.test.tsx`
Expected: FAIL — `Failed to resolve import "./SplitLayout"`.

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import type { Tier } from './useViewportTier';

export interface SplitLayoutProps {
  tier: Tier;
  left: ReactNode;
  right: ReactNode;
}

/**
 * Two panes side by side, above 1024; one column below it.
 *
 * The library and Learn arrived at the same geometry — a narrow pane beside a
 * wider one — so it is written once. It carries no landmarks on purpose: the
 * two screens do not agree about what the panes *are*. Learn's left pane is
 * navigation and its right pane is the document; the library's left pane is
 * the main content and its right pane is complementary. Baking either reading
 * in here would ship the other screen a lie, so each supplies its own element.
 *
 * Deliberately not `GameLayout`: that one arranges three regions under the
 * invariant that nothing may resize the board mid-play. Different problem,
 * different failure mode, and one component with two unrelated reasons to
 * change is how both end up wrong.
 */
export function SplitLayout({ tier, left, right }: SplitLayoutProps) {
  if (tier === 'phone' || tier === 'tablet') {
    // `max-w-xl sm:max-w-[48rem]`, not a bare raise: below 640 the `sm:` rule
    // never applies, so the phone keeps the 576px column it shipped with —
    // widening a signed-off layout is not what this change is for.
    return <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-12 sm:max-w-[48rem]">{left}{right}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[96rem] px-6 pt-6 pb-12">
      <div className="flex items-start gap-8">
        {/* All three of `w-*`, `shrink-0` and `min-w-0`: `w-*` alone stretches
            under a flex parent, and `shrink-0` alone leaves `min-width: auto`,
            which floors a flex item at its min-content width — one long
            technique name would widen this pane and take the difference from
            the pane beside it. Choosing a lesson must not move the list you
            chose it from. */}
        <div data-testid="left-pane" className="w-[20rem] min-w-0 shrink-0">
          {left}
        </div>
        <div data-testid="right-pane" className="min-w-0 flex-1">
          {right}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/app/SplitLayout.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/SplitLayout.tsx src/app/SplitLayout.test.tsx
git commit -m "feat(app): an index beside what it indexes

The library and Learn want the same geometry on a wide screen, and writing it
twice is how two screens drift apart. It carries no landmarks: the screens
disagree about what the panes are — Learn's left pane navigates, the
library's left pane *is* the content — so each supplies its own element
rather than inheriting one screen's reading of the other."
```

---

### Task 2: `ProgressPanel` — what the library shows beside the list

**Files:**
- Create: `src/ui/learn/ProgressPanel.tsx`, `src/ui/learn/ProgressPanel.test.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/it.ts`

**Interfaces:**
- Consumes: `TechniqueIndex({ profile, onOpen? })` from `src/ui/learn/TechniqueIndex.tsx` — with `onOpen` omitted its rows render as static text rather than controls, which is what the library wants; `edgeOfMastery(profile): TechniqueId | null` and `masteryOf` from `src/state/mastery.ts`; `loadLessons(locale)` from `src/coach/lessons` for the technique's display name.
- Produces: `ProgressPanel({ profile }: { profile: PlayerProfile }): JSX.Element`. Task 3 renders it.

**Why it reuses `TechniqueIndex`:** the game screen's third column already shows exactly this data. A second hand-rolled mastery list would be a second account of the same thing, free to disagree.

- [ ] **Step 1: Add the copy**

`src/i18n/en.ts`:

```ts
  'progress.title': 'Your progress',
  'progress.nextUp': 'Next up: {technique}',
  'progress.nothingNext': 'You have met every technique the coach teaches.',
```

`src/i18n/it.ts`, same keys:

```ts
  'progress.title': 'I tuoi progressi',
  'progress.nextUp': 'Prossima: {technique}',
  'progress.nothingNext': 'Hai incontrato tutte le tecniche che il coach insegna.',
```

The Italian is a translation pending native review — say so in your report.

- [ ] **Step 2: Write the failing test**

Create `src/ui/learn/ProgressPanel.test.tsx`. Read `src/ui/learn/TechniqueIndex.test.tsx` first and follow its locale-provider pattern rather than inventing a second one:

```tsx
it('names what to learn next', () => {
  renderWithLocale(<ProgressPanel profile={DEFAULT_PROFILE} />);
  expect(screen.getByText(/next up/i)).toBeTruthy();
});

it('lists the techniques as text, not as controls — there is nowhere to go from here', () => {
  renderWithLocale(<ProgressPanel profile={DEFAULT_PROFILE} />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('says so when there is nothing left to meet', () => {
  const mastered = everyTechniqueMastered(DEFAULT_PROFILE);
  renderWithLocale(<ProgressPanel profile={mastered} />);
  expect(screen.getByText(/every technique/i)).toBeTruthy();
});
```

`everyTechniqueMastered` is a local helper: build a profile whose mastery entries all sit at the stage `edgeOfMastery` treats as done. **Read `src/state/mastery.ts:138` to see what `edgeOfMastery` actually returns `null` for** and construct the fixture from that, rather than guessing at a stage name.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/ui/learn/ProgressPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProgressPanel"`.

- [ ] **Step 4: Implement**

```tsx
/**
 * What the player has learned, beside their games.
 *
 * The list is `TechniqueIndex` — the same component the game screen shows in
 * its third column — because two renderings of one player's mastery are two
 * things that can disagree, and the one that disagrees is the one telling
 * them they know something they do not.
 */
export function ProgressPanel({ profile }: { profile: PlayerProfile }) {
  const t = useT();
  const next = edgeOfMastery(profile);
  const lessons = loadLessons(profile.locale);

  return (
    <section>
      <h2 className="font-display text-xl leading-tight text-ink">{t('progress.title')}</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
        {next === null
          ? t('progress.nothingNext')
          : t('progress.nextUp', { technique: lessons[next].name })}
      </p>
      <div className="mt-4">
        <TechniqueIndex profile={profile} />
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/ui/learn/ProgressPanel.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/learn/ProgressPanel.tsx src/ui/learn/ProgressPanel.test.tsx src/i18n/en.ts src/i18n/it.ts
git commit -m "feat(learn): the player's progress, from the list the coach already shows

Built on TechniqueIndex rather than a second mastery list: two renderings of
one player's mastery are two things that can disagree, and the one that
disagrees is the one telling them they know something they do not."
```

---

### Task 3: The library gets its second pane

**Files:**
- Modify: `src/app/LibraryView.tsx`
- Create: `src/app/LibraryView.test.tsx`

**Interfaces:**
- Consumes: `SplitLayout` (Task 1), `ProgressPanel` (Task 2), `useViewportTier()`.

`LibraryView` does not currently receive the profile. **Take it from `useProfile((state) => state.profile)`**, the way `GameView` does — do not thread a new prop through `src/App.tsx`.

Today's root is `<div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-6 pb-10">` holding a `<header>` and one or two `GameList`s. The header stays outside the split — it is the screen's title bar, not part of either pane.

- [ ] **Step 1: Write the failing test**

Create `src/app/LibraryView.test.tsx`. Build the `summaries` fixture from the `GameSummary` shape `src/ui/game/GameList.test.tsx` already uses — read it and reuse its factory rather than writing a second one.

```tsx
it('is one column on a phone, with no progress pane', () => {
  renderLibrary({ tier: 'phone' });
  expect(screen.queryByTestId('left-pane')).toBeNull();
  expect(screen.queryByText(/your progress/i)).toBeNull();
});

it('adds nothing to a tablet either — the width is what buys the panel', () => {
  renderLibrary({ tier: 'tablet' });
  expect(screen.queryByText(/your progress/i)).toBeNull();
});

it('shows progress beside the games on a laptop', () => {
  renderLibrary({ tier: 'laptop' });
  expect(screen.getByText(/your progress/i)).toBeTruthy();
  expect(screen.getByRole('heading', { name: /in progress/i })).toBeTruthy();
});

it('keeps the games first in the DOM — they are why the screen exists', () => {
  renderLibrary({ tier: 'laptop' });
  const games = screen.getByTestId('left-pane');
  const progress = screen.getByTestId('right-pane');
  expect(games.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

`renderLibrary` sets the tier through the shared `matchMedia` stub the way `GameView.layout.test.tsx`'s `renderGame` does — read it and follow it. **Do not add a prop to `LibraryView` so a test can set the tier.**

Pane assignment: **games left, progress right.** The games come first in the DOM because they are why the screen exists — a screen-reader user should reach their unfinished puzzles before a summary of their mastery. `SplitLayout` carries no landmarks, so this screen supplies its own: the games are wrapped in `<main>`, the progress pane in `<aside aria-label={t('progress.title')}>`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/LibraryView.test.tsx`
Expected: FAIL — no `left-pane`, no "Your progress".

- [ ] **Step 3: Implement**

The `<header>` stays outside the split — it is the screen's title bar, not part of either pane. The root loses its `mx-auto ... max-w-xl px-4 pt-6 pb-10`, because `SplitLayout` owns the cap and the padding now:

```tsx
export function LibraryView({ summaries, onResume, onNewGame, onOpenSettings, onLearn }: LibraryViewProps) {
  const t = useT();
  const tier = useViewportTier();
  const profile = useProfile((state) => state.profile);
  const wide = tier === 'laptop' || tier === 'desktop';
  const inProgress = summaries.filter((game) => game.completedAt === null);
  const finished = summaries.filter((game) => game.completedAt !== null);

  const games = (
    <main>
      <GameList games={inProgress} onResume={onResume} onNewGame={onNewGame} />
      {finished.length > 0 ? (
        <GameList
          className="mt-10"
          variant="finished"
          games={finished}
          onResume={onResume}
          onNewGame={onNewGame}
        />
      ) : null}
    </main>
  );

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="mx-auto mb-6 flex w-full max-w-[96rem] items-start justify-between gap-3 px-4 pt-6 sm:px-6">
        {/* unchanged contents: the title, the tagline, the Learn button, the settings icon */}
      </header>
      <SplitLayout
        tier={tier}
        left={games}
        right={
          /* Only above 1024. `SplitLayout` stacks its two panes below that, so
             passing the panel unconditionally would add a whole new section to
             the phone's library — a screen that is signed-off work and that
             this change is not for. The width is what buys the panel; without
             the width there is nothing to spend. */
          wide ? (
            <aside aria-label={t('progress.title')}>
              <ProgressPanel profile={profile} />
            </aside>
          ) : null
        }
      />
    </div>
  );
}
```

Keep the header's existing children exactly as they are — only its wrapper classes change, so it lines up with the split beneath it.

- [ ] **Step 4: Run the suite**

Run: `npm run verify > /tmp/t3.log 2>&1; tail -20 /tmp/t3.log`
Expected: PASS. `src/ui/game/GameList.test.tsx` must pass unedited — this task changes where the list sits, not what it renders.

- [ ] **Step 5: Commit**

```bash
git add src/app/LibraryView.tsx src/app/LibraryView.test.tsx
git commit -m "feat(app): the library shows what you have learned beside what you have played

A 27-inch screen showed a 576px column of game rows and two feet of nothing.
The width buys the one thing the library could never say: where you are, and
what the coach thinks you should learn next."
```

---

### Task 4: Learn becomes master-detail above 1024

**Files:**
- Modify: `src/app/LearnView.tsx`
- Create: `src/app/LearnView.wide.test.tsx`

**Interfaces:**
- Consumes: `SplitLayout` (Task 1), `useViewportTier()`, `LessonBody`, `TechniqueIndex`, `Section` — all already imported by `LearnView`.

`LearnView` today: when `open !== null` it returns a `TechniquePage` (back button + `LessonBody`); otherwise the four intro `Section`s, then `TechniqueIndex` with `onOpen={setOpen}`. It also accepts a `technique` prop the coach uses to deep-link a lesson.

**Above 1024 both halves render at once**: `TechniqueIndex` in the index pane, and in the content pane either the selected lesson or — when nothing is selected — the four intro sections. The pane therefore always has content, so the layout never shows a blank half and nothing jumps on first selection.

**Below 1024, nothing changes at all.** The existing early-return for `open !== null` and the existing stacked body stay exactly as they are, back button included.

- [ ] **Step 1: Write the failing test**

Create `src/app/LearnView.wide.test.tsx`:

```tsx
it('shows the intro beside the index when nothing is selected', () => {
  renderLearn({ tier: 'laptop' });
  const content = screen.getByTestId('right-pane');
  expect(within(content).getByText(/the rules/i)).toBeTruthy();
});

it('swaps the intro for the lesson without moving the index', async () => {
  const { user } = renderLearn({ tier: 'laptop' });
  const index = screen.getByTestId('left-pane');
  const before = index.className;
  await user.click(within(index).getByRole('button', { name: /naked single/i }));
  expect(within(screen.getByTestId('right-pane')).getByText(/what it is/i)).toBeTruthy();
  expect(screen.getByTestId('left-pane').className).toBe(before);
});

it('opens on the technique the coach deep-linked', () => {
  renderLearn({ tier: 'laptop', technique: 'hidden_single' });
  expect(within(screen.getByTestId('right-pane')).getByText(/what it is/i)).toBeTruthy();
});

it('still pushes a page on a phone, with a way back', async () => {
  const { user } = renderLearn({ tier: 'phone' });
  await user.click(screen.getByRole('button', { name: /naked single/i }));
  expect(screen.getByRole('button', { name: /back/i })).toBeTruthy();
  expect(screen.queryByTestId('left-pane')).toBeNull();
});
```

Verify every selector against the real copy in `src/i18n/en.ts` before relying on it — `/the rules/i` and `/what it is/i` are sketches. The phone case is a regression guard for behaviour that must not change.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/LearnView.wide.test.tsx`
Expected: FAIL — no `right-pane` at any tier.

- [ ] **Step 3: Implement**

Add `const tier = useViewportTier();` at the top. **Below `laptop`, return exactly what the function returns today** — both the `open !== null` early return and the stacked body, untouched. Above it, take the split branch:

```tsx
  const intro = (
    <>
      <Section title={t('learn.rules.title')} body={t('learn.rules.body')} />
      <Section title={t('learn.notes.title')} body={t('learn.notes.body')} />
      <Section title={t('learn.coach.title')} body={t('learn.coach.body')} />
      <Section title={t('learn.keys.title')} body={t('learn.keys.body')} />
    </>
  );

  if (tier === 'laptop' || tier === 'desktop') {
    return (
      <div className="flex min-h-dvh w-full flex-col">
        <header className="mx-auto flex w-full max-w-[96rem] items-start gap-3 px-6 pt-6">
          {/* the same back button, title and intro paragraph the stacked body uses */}
        </header>
        <SplitLayout
          tier={tier}
          left={
            <nav aria-label={t('learn.techniques.title')}>
              <TechniqueIndex profile={profile} onOpen={setOpen} />
            </nav>
          }
          right={
            /* The pane is never empty: until a technique is chosen it holds the
               same four sections the stacked layout puts above the list. A pane
               that starts blank is a pane that jumps the first time it is used,
               and half a screen of nothing reads as a bug rather than as an
               invitation.

               `max-w-[40rem]` on the prose, not on the pane: a lesson stretched
               across a 1536px column is a ~200-character measure, which reads
               worse than a narrow one. The example grid inside `LessonBody` is
               free to use the pane's full width — it is not prose. */
            <section aria-label={t('learn.title')} className="max-w-[40rem]">
              {open === null ? (
                intro
              ) : (
                <LessonBody id={open} locale={profile.locale} profile={profile} titleAs="h2" />
              )}
            </section>
          }
        />
      </div>
    );
  }
```

`LessonBody` takes `titleAs` because the screen's `<h1>` here is Learn's own title, so the lesson's title is an `h2` beneath it. It also takes `leading` for a back button; the wide pane passes nothing, because there is nowhere to go back to while the list is still on screen.

- [ ] **Step 4: Run the suite**

Run: `npm run verify > /tmp/t4.log 2>&1; tail -20 /tmp/t4.log`
Expected: PASS, including `src/app/LearnView.test.tsx` unedited — it characterises the phone behaviour and this task must not change it.

- [ ] **Step 5: Commit**

```bash
git add src/app/LearnView.tsx src/app/LearnView.wide.test.tsx
git commit -m "feat(app): Learn reads as a book with a contents page

Above 1024 the index stays on screen and the lesson opens beside it, so
comparing two techniques stops being a matter of remembering the first one.
The content pane shows the intro sections until a technique is chosen — a
pane that starts empty is a pane that jumps the moment you use it."
```

---

### Task 5: Prove both screens at every width

**Files:**
- Modify: `tests/e2e/learn.spec.ts`, `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: the `left-pane` / `right-pane` test ids from Task 1.

The four Playwright projects already exist (`phone` 412, `tablet` 820, `laptop` 1280, `wide` 1536). Both screens now behave differently across them and nothing asserts it.

- [ ] **Step 1: Add the wide Learn case**

In `tests/e2e/learn.spec.ts`, gated to the projects where two panes exist:

```ts
test('keeps the index on screen while a lesson opens beside it', async ({ page }, testInfo) => {
  test.skip(!['laptop', 'wide'].includes(testInfo.project.name), 'one column below 1024');
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn' }).click();
  const index = page.getByTestId('left-pane');
  await expect(index).toBeVisible();
  const before = (await index.boundingBox())!;
  await index.getByRole('button', { name: /naked single/i }).click();
  await expect(page.getByTestId('right-pane').getByRole('heading', { level: 2 }).first()).toBeVisible();
  const after = (await index.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 1);
});
```

Check the "Learn" button's real accessible name in `src/i18n/en.ts` before relying on it.

- [ ] **Step 2: Add the wide library case**

No spec file owns the library today — the closest assertions live in `tests/e2e/pwa.spec.ts`, which is about installability rather than layout. Create `tests/e2e/library.spec.ts`, following `learn.spec.ts`'s shape (same imports, same `openCoach`-style helper conventions from `tests/e2e/coach.ts` and `tests/e2e/board.ts`):

```ts
test('shows progress beside the games once there is room', async ({ page }, testInfo) => {
  const wide = ['laptop', 'wide'].includes(testInfo.project.name);
  await page.goto('/');
  const progress = page.getByRole('complementary', { name: /your progress/i });
  if (wide) await expect(progress).toBeVisible();
  else await expect(progress).toHaveCount(0);
});
```

Check the real accessible name against `src/i18n/en.ts` before relying on it. Note this case asserts *both* directions in one test rather than skipping on three of four projects — the phone half is the regression guard that the library's signed-off layout gained nothing.

- [ ] **Step 3: axe both screens in their two-pane state**

Extend `tests/e2e/a11y.spec.ts` with a scan of the library and of Learn with a lesson open, gated to `laptop`/`wide`. Use the file's existing `audit()` builder and tags — do not introduce a second axe configuration.

- [ ] **Step 4: Run the whole suite**

Run: `npm run e2e > /tmp/e2e.log 2>&1; tail -60 /tmp/e2e.log`
Expected: PASS across all four projects. A failure at a new width is a finding — assert the correct new behaviour, never weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): the library and Learn, at the widths they now differ across

Both screens grew a second pane and nothing opened them wide enough to see it.
The index-does-not-move assertion is the one that matters: it is the rule that
selecting a lesson may not shift the list you selected it from."
```

---

### Task 6: Say what changed, where it is binding

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Record the rule**

`docs/architecture.md`'s invariants are the binding reference. Add one entry, in the register of its neighbours: **prose caps at 40rem wherever it is shown, and a pane's width is a property of the tier rather than of its content** — naming `SplitLayout` as where both are enforced, and noting that the library and Learn split at 1024 while the game screen splits at the same tiers for a different reason.

Do not restate invariant 9; point at it. The two rules are cousins — one protects the board's box, one protects the reader's measure — and saying so in one sentence is worth more than repeating either.

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: a pane's width is the tier's business, and prose has a ceiling

Two screens now depend on both rules and neither was written down."
```

---

## Notes for the executor

- **The phone is signed-off work on both screens.** Editing a phone assertion means the change has reached a layout that was already approved — stop and report it.
- **`TechniqueIndex` is shared by three surfaces now** (the game screen's third column, the library's progress pane, Learn's index). A change to it lands in all three; check all three before changing it.
- **Prose caps at 40rem, panes do not.** An example grid may use the pane's full width; the sentences may not.
