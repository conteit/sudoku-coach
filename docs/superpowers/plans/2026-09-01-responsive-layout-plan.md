# Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game screen answer to the viewport — a phone column below 640px, a wider board on a tablet, board-and-coach side by side on a laptop, and board-coach-lesson on a desktop.

**Architecture:** One hook decides which of four tiers the viewport is in; one presentational shell arranges the regions for that tier; `GameView` keeps game state and hands each region its props. The lesson body and technique index are extracted out of `LearnView` so the game screen shows the same content rather than a second copy of it.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 (utilities only, stock breakpoints, no config file), vitest + @testing-library/react, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-09-01-responsive-layout-design.md`

## Global Constraints

- **The generalised invariant:** no content appearing or disappearing during play may resize the board, **at any viewport**. The tier decides the board's size; nothing the coach does during a game may. This replaces the height-only wording of `docs/architecture.md` invariant 9 and is the property to defend in review.
- **The phone layout must not change.** Below 640px the DOM and the CSS must be what they are today. **If an existing phone test needs editing, that is a defect in the change, not a test update** — stop and report it.
- **Board caps at 40rem (640px).**
- **Tiers:** phone `< 640`, tablet `640–1023`, laptop `1024–1535`, desktop `≥ 1536`. Stock Tailwind `sm` / `lg` / `2xl`; `md` and `xl` are deliberately unused and that deserves a comment where the tiers are declared.
- **Frozen contracts:** `src/engine/types.ts`, `src/state/types.ts`, `src/coach/types.ts` must not be edited.
- **Do not touch** `src/app/useCoachSession.ts` or `src/coach/triggers.ts`.
- **Every UI string reads the dictionary**, same key in `src/i18n/en.ts` and `src/i18n/it.ts`, or `tsc` fails on the `MessageKey` union.
- **Verify contract:** `npm run verify` = lint → `tsc -b` → vitest → build; CI runs that plus `npm run e2e`. Never weaken a config, a test or an assertion to make either pass. Redirect heavy output: `npm run e2e > /tmp/e2e.log 2>&1; tail -40 /tmp/e2e.log`.
- **Style:** comments explain *why*, not *what*. Commit messages explain the reasoning, not the file list.
- The modal machinery (`modalOpen`, focus trap, Escape, `role="dialog"`) is already gated to the narrow viewport and must stay that way — on tablet and up the coach panel is not a modal, which is today's behaviour.

---

### Task 1: Lift the lesson body and the technique index out of `LearnView`

**Files:**
- Create: `src/ui/learn/LessonBody.tsx`, `src/ui/learn/TechniqueIndex.tsx`, `src/ui/learn/prose.tsx`
- Create: `src/ui/learn/LessonBody.test.tsx`, `src/ui/learn/TechniqueIndex.test.tsx`
- Modify: `src/app/LearnView.tsx`

**Interfaces:**
- Consumes: `getLesson(locale, id)` and `exampleMarks(lesson)` from `src/coach/lessons`; `masteryOf(profile, id)` from `src/state/mastery`; `TECHNIQUE_IDS` from the engine types barrel `LearnView` already imports.
- Produces:
  - `LessonBody({ id, locale, profile }: { id: TechniqueId; locale: Locale; profile: PlayerProfile }): JSX.Element` — the lesson's prose, example and mastery state, **without** the back button or page chrome.
  - `TechniqueIndex({ profile, onOpen }: { profile: PlayerProfile; onOpen?: (id: TechniqueId) => void }): JSX.Element` — the list of techniques with their mastery chips. When `onOpen` is omitted the rows render as static text rather than buttons, because in the game screen's lesson column there is nowhere to navigate to.
  - `Prose`, `Section`, `MasteryChip`, `Example` move to `prose.tsx` and are exported from there.

**This is a pure extraction. No behaviour changes.** `LearnView` must render exactly what it renders today.

- [ ] **Step 1: Pin the current behaviour before moving anything**

`src/app/LearnView.tsx` has no test file today. Write one first, so the extraction has something to be judged against. Create `src/app/LearnView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../state/mastery';
import { LearnView } from './LearnView';
import { renderWithLocale } from '../test/renderWithLocale';

describe('LearnView', () => {
  it('lists every technique with its mastery state', () => {
    renderWithLocale(<LearnView profile={DEFAULT_PROFILE} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /techniques/i })).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(10);
  });

  it('opens a technique page and comes back', async () => {
    const user = userEvent.setup();
    renderWithLocale(<LearnView profile={DEFAULT_PROFILE} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /naked single/i }));
    expect(screen.getByRole('article')).toBeTruthy();
  });
});
```

`renderWithLocale` may not exist. Look at how `src/i18n/react.test.tsx` and `src/ui/game/GameList.test.tsx` provide the locale context and follow whichever pattern is already there — do not invent a second helper if one exists. If none exists, create `src/test/renderWithLocale.tsx` wrapping `render` in the same provider `src/App.tsx` uses.

- [ ] **Step 2: Run it and watch it pass**

Run: `npx vitest run src/app/LearnView.test.tsx`
Expected: PASS. This is a characterisation test — it passes before the refactor and must still pass after.

- [ ] **Step 3: Move the shared pieces**

Create `src/ui/learn/prose.tsx` and move `Prose`, `Section`, `MasteryChip` and `Example` into it verbatim from `LearnView.tsx`, exporting each. Keep their implementations byte-identical; this step is a move, not a rewrite.

Create `src/ui/learn/LessonBody.tsx` holding what `TechniquePage` renders *below* its back-button header — the lesson name, one-liner, the `Section`s and the `Example`:

```tsx
/**
 * A lesson, with no page around it.
 *
 * Split out of `LearnView` because the game screen shows the same lesson beside
 * the board on a wide viewport. Two copies of this would drift, and the copy
 * that drifted would be the one teaching the player the wrong thing.
 */
export function LessonBody({ id, locale, profile }: LessonBodyProps) {
  // …the body of TechniquePage from `const lesson = getLesson(...)` down,
  // minus the <header> that owns the back button.
}
```

Create `src/ui/learn/TechniqueIndex.tsx` holding the `<ul>` of techniques with their `MasteryChip`s. When `onOpen` is undefined, render each row as a `<div>` rather than a `<button>` — a control that goes nowhere is worse than text.

- [ ] **Step 4: Rewire `LearnView` and confirm nothing moved**

`LearnView`'s `TechniquePage` keeps its back-button header and renders `<LessonBody …/>` beneath it. Its index section renders `<TechniqueIndex profile={profile} onOpen={setOpen} />`.

Run: `npx vitest run > /tmp/t1.log 2>&1; tail -20 /tmp/t1.log`
Expected: PASS, including the characterisation test from Step 1 unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/ui/learn src/app/LearnView.tsx src/app/LearnView.test.tsx src/test
git commit -m "refactor(learn): a lesson and the technique index, with no page around them

The game screen is about to show both beside the board on a wide viewport, and
the version that drifts is the one teaching the player the wrong thing. Pinned
LearnView's behaviour with a characterisation test first, so the move could be
judged against something rather than eyeballed."
```

---

### Task 2: One hook decides the tier

**Files:**
- Create: `src/app/useViewportTier.ts`, `src/app/useViewportTier.test.ts`
- Modify: `src/app/GameView.tsx` (replace `MOBILE_QUERY` / `isNarrow`)

**Interfaces:**
- Produces: `type Tier = 'phone' | 'tablet' | 'laptop' | 'desktop'` and `useViewportTier(): Tier`. Task 3 and Task 4 both consume it. `isNarrow` in `GameView` becomes `tier === 'phone'` — **the modal machinery must keep keying off exactly that**, so `modalOpen` stays `sheetOpen && tier === 'phone'`.

`GameView.tsx:68` currently holds `const MOBILE_QUERY = '(max-width: 639.98px)'` and `:116-125` subscribes to it with a live `change` listener. That subscription is the pattern to generalise — keep the live listener; a one-shot read at mount was already rejected once because the viewport can change under a running game.

- [ ] **Step 1: Write the failing test**

`tests/setup.ts` already stubs `window.matchMedia`. Read it first: if the stub ignores the query string and answers every query the same way, extend it to answer per query before writing this test, or the test cannot distinguish tiers.

Create `src/app/useViewportTier.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewportTier } from './useViewportTier';

/** Drives the matchMedia stub: the listed queries match, all others do not. */
function matchOnly(...matching: string[]) {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('useViewportTier', () => {
  it('is phone below 640', () => {
    matchOnly('(max-width: 639.98px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('phone');
  });

  it('is tablet between 640 and 1023', () => {
    matchOnly();
    expect(renderHook(() => useViewportTier()).result.current).toBe('tablet');
  });

  it('is laptop from 1024', () => {
    matchOnly('(min-width: 1024px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('laptop');
  });

  it('is desktop from 1536', () => {
    matchOnly('(min-width: 1024px)', '(min-width: 1536px)');
    expect(renderHook(() => useViewportTier()).result.current).toBe('desktop');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/useViewportTier.test.ts`
Expected: FAIL — `Failed to resolve import "./useViewportTier"`.

- [ ] **Step 3: Implement**

```ts
/**
 * Which of the four layouts the viewport is in.
 *
 * The queries mirror the Tailwind breakpoints the CSS uses (`sm`, `lg`, `2xl`)
 * rather than picking their own numbers: when JS and CSS disagree about which
 * tier is current, the layout and the behaviour gated on it come apart, and
 * that is exactly how the coach sheet once trapped focus on a desktop panel
 * that was not a modal. `md` and `xl` are deliberately unused — a lesson is
 * prose, and a third column narrower than this reads worse than no column.
 */
export type Tier = 'phone' | 'tablet' | 'laptop' | 'desktop';

const PHONE = '(max-width: 639.98px)';
const LAPTOP = '(min-width: 1024px)';
const DESKTOP = '(min-width: 1536px)';

function read(): Tier {
  if (window.matchMedia(DESKTOP).matches) return 'desktop';
  if (window.matchMedia(LAPTOP).matches) return 'laptop';
  if (window.matchMedia(PHONE).matches) return 'phone';
  return 'tablet';
}

export function useViewportTier(): Tier {
  const [tier, setTier] = useState<Tier>(read);
  useEffect(() => {
    const queries = [PHONE, LAPTOP, DESKTOP].map((q) => window.matchMedia(q));
    const sync = () => setTier(read());
    for (const mql of queries) mql.addEventListener('change', sync);
    return () => {
      for (const mql of queries) mql.removeEventListener('change', sync);
    };
  }, []);
  return tier;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/app/useViewportTier.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Adopt it in `GameView` with no behaviour change**

Delete `MOBILE_QUERY` and the `isNarrow` state and effect from `GameView.tsx`. Add `const tier = useViewportTier();` and `const isNarrow = tier === 'phone';`. Everything downstream — `modalOpen`, the two focus effects, the shortcuts `enabled` gate, `onHint` — is untouched.

Run: `npm run verify > /tmp/t2.log 2>&1; tail -20 /tmp/t2.log`
Expected: PASS. The desktop-no-modalize test in `GameView.layout.test.tsx` is the one that proves this swap changed nothing.

- [ ] **Step 6: Commit**

```bash
git add src/app/useViewportTier.ts src/app/useViewportTier.test.ts src/app/GameView.tsx tests/setup.ts
git commit -m "feat(app): name the four layouts, and let one hook decide which we are in

GameView already subscribed to a phone media query to decide whether the coach
sheet was a modal. The layout needs the same question answered with more than
two answers, and answering it twice in two places is how the CSS and the
behaviour gated on it drift apart."
```

---

### Task 3: The shell arranges the regions

**Files:**
- Create: `src/app/GameLayout.tsx`
- Modify: `src/app/GameView.tsx` (the shell, `<main>` and the coach host)
- Modify: `src/app/GameView.layout.test.tsx`

**Interfaces:**
- Consumes: `Tier` from Task 2.
- Produces: `GameLayout({ tier, header, board, keypad, coach, lesson }: { tier: Tier; header: ReactNode; board: ReactNode; keypad: ReactNode; coach: ReactNode; lesson?: ReactNode }): JSX.Element`. Task 4 supplies `lesson`.

**The phone case must produce the DOM it produces today**: a root column, `<header>`, a `<main>` with exactly two flow children (board wrapper, keypad), and the coach host as a root-level sibling that is `hidden` or `absolute`. `GameView.layout.test.tsx`'s existing assertions encode that — they must pass unedited.

- [ ] **Step 1: Write the failing per-tier tests**

Extend `src/app/GameView.layout.test.tsx`. It already has `expectOnlyTheBoardAndKeypadInFlow()`; add tier coverage around it:

```tsx
it('gives the phone one column and the coach no space in flow', () => {
  renderGame({ tier: 'phone' });
  expectOnlyTheBoardAndKeypadInFlow();
  expect(screen.queryByTestId('coach-column')).toBeNull();
});

it('puts the coach beside the board on a laptop', () => {
  renderGame({ tier: 'laptop' });
  expect(screen.getByTestId('coach-column')).toBeTruthy();
  expect(screen.queryByTestId('lesson-column')).toBeNull();
});

it('adds the lesson column on a desktop', () => {
  renderGame({ tier: 'desktop' });
  expect(screen.getByTestId('coach-column')).toBeTruthy();
  expect(screen.getByTestId('lesson-column')).toBeTruthy();
});

it('keeps the tablet stacked, but lets the board past the phone cap', () => {
  renderGame({ tier: 'tablet' });
  expect(screen.queryByTestId('coach-column')).toBeNull();
  // The cap lives on the root column, not on <main>, and it is raised only
  // from `sm` up — below 640 the phone keeps the 576px column it shipped with.
  const root = screen.getByRole('main').parentElement!;
  expect(root.className).toContain('max-w-xl');
  expect(root.className).toContain('sm:max-w-[40rem]');
});
```

`renderGame` currently drives the real `useViewportTier` through the `matchMedia` stub. Give it a `tier` option that sets the stub accordingly, using the same `matchOnly` shape as Task 2's test — do not add a prop to `GameView` purely so a test can set the tier.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/app/GameView.layout.test.tsx`
Expected: FAIL — no `coach-column` / `lesson-column` test ids exist, and `<main>` carries no `max-w-[40rem]`.

- [ ] **Step 3: Write the shell**

Create `src/app/GameLayout.tsx`. It is presentational — it takes nodes and arranges them, holds no game state and imports nothing from `src/state/`:

```tsx
/**
 * Which regions exist at this width, and how they sit.
 *
 * Split out of `GameView` because composing four regions three ways inside a
 * file that also owns the game's state is how that file stopped being readable.
 * The rule this enforces is invariant 9: whatever the tier, nothing that comes
 * and goes during play may change the board's box. Each column's width is a
 * property of the tier, never of what the coach happens to be saying.
 */
export function GameLayout({ tier, header, board, keypad, coach, lesson }: GameLayoutProps) {
  if (tier === 'phone' || tier === 'tablet') {
    return (
      <div className="relative mx-auto flex h-dvh w-full max-w-xl flex-col overflow-hidden sm:h-auto sm:min-h-dvh sm:max-w-[40rem] sm:overflow-visible">
        {header}
        <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-2">
          {board}
          {keypad}
        </main>
        {coach}
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[96rem] flex-col">
      {header}
      <div className="flex flex-1 items-start justify-center gap-6 px-6 pb-6">
        <main className="flex w-full max-w-[40rem] flex-col gap-3">
          {board}
          {keypad}
        </main>
        <aside data-testid="coach-column" className="w-[22rem] shrink-0">
          {coach}
        </aside>
        {tier === 'desktop' && lesson ? (
          <aside data-testid="lesson-column" className="w-[26rem] shrink-0 overflow-y-auto">
            {lesson}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
```

**The cap is `max-w-xl sm:max-w-[40rem]`, not a bare `max-w-[40rem]`.** Below 640 the phone must keep
the 576px column it shipped with: on a 600px-wide phone the old cap binds and centres the column, and
raising it there would widen a layout that was signed off. The `sm:` prefix is what keeps the phone
case byte-identical while the tablet gets its extra width.

The fixed `w-` values on the two asides are the invariant: they do not flex, so nothing the coach renders can push the board's column. Say that in a comment beside them.

- [ ] **Step 4: Rewire `GameView`**

`GameView` keeps every hook and handler it has. Its return becomes `<GameLayout tier={tier} header={…} board={…} keypad={…} coach={…} lesson={…} />`, passing the JSX it already builds. The coach host div — with its `modalOpen` attributes and `sm:static` classes — moves into the `coach` node unchanged.

Run: `npx vitest run > /tmp/t3.log 2>&1; tail -25 /tmp/t3.log`
Expected: PASS, including every pre-existing phone assertion unedited.

- [ ] **Step 5: Commit**

```bash
git add src/app/GameLayout.tsx src/app/GameView.tsx src/app/GameView.layout.test.tsx
git commit -m "feat(app): the layout answers to the viewport

Below 640 the screen is what it was; above it the board stops being a phone
column centred in an empty desktop. The columns are fixed-width on purpose:
invariant 9 says nothing that comes and goes during play may resize the board,
and a flexing sidebar is exactly how a hint would."
```

---

### Task 4: The lesson column, and what it shows before there is a lesson

**Files:**
- Modify: `src/app/GameView.tsx`
- Modify: `src/app/GameView.layout.test.tsx`

**Interfaces:**
- Consumes: `LessonBody` and `TechniqueIndex` from Task 1; `GameLayout`'s `lesson` prop from Task 3.

`Hint` (`src/coach/types.ts`) carries `technique` and `level`. The lesson shows once the coach has *named* the technique, which is disclosure level 2 — below that, naming it in a sidebar would hand over the answer the ladder is deliberately withholding.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows the technique index until the coach has named a technique', () => {
  renderGame({ tier: 'desktop' });
  const lesson = screen.getByTestId('lesson-column');
  expect(within(lesson).getByRole('heading', { name: /techniques/i })).toBeTruthy();
});

it('does not name the technique in the sidebar at disclosure level 1', async () => {
  const { user } = renderGame({ tier: 'desktop' });
  await user.click(screen.getByRole('button', { name: /where should i look/i }));
  const lesson = screen.getByTestId('lesson-column');
  expect(within(lesson).getByRole('heading', { name: /techniques/i })).toBeTruthy();
});
```

The second test is the one that matters: it is the product thesis in a test. A sidebar that names the technique at level 1 gives away the rung the player has not paid for.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/app/GameView.layout.test.tsx`
Expected: FAIL — nothing renders inside `lesson-column`.

- [ ] **Step 3: Implement**

In `GameView`, build the lesson region:

```tsx
{/*
  * The column always has something in it, so its box never changes and the
  * board never moves. Before the coach has named a technique that is the
  * player's own mastery — the same reading the coach uses to pick a puzzle at
  * the edge of what they know. Level 2 is where the name is paid for; showing
  * the lesson earlier would hand over the rung they have not climbed.
  */}
const lessonRegion =
  coach.hint !== null && coach.hint.level >= 2 ? (
    <LessonBody id={coach.hint.technique} locale={locale} profile={profile} />
  ) : (
    <TechniqueIndex profile={profile} />
  );
```

`GameView` receives `settings` and `locale` already; check how it reaches the full `PlayerProfile` — if it does not, take it from `useProfile()` the way `useCoachSession` does rather than threading a new prop through `App.tsx`.

- [ ] **Step 4: Run and watch them pass**

Run: `npm run verify > /tmp/t4.log 2>&1; tail -20 /tmp/t4.log`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/GameView.tsx src/app/GameView.layout.test.tsx
git commit -m "feat(app): the third column teaches, and never gives the rung away

It shows the player's own mastery until the coach has named a technique, and
the lesson after. Naming it earlier than level 2 would hand over the rung the
ladder is deliberately withholding, so the test for that is the product thesis
rather than a detail of the layout."
```

---

### Task 5: Prove it at every width

**Files:**
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/play.spec.ts`, `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: the `coach-column` / `lesson-column` test ids from Task 3.

- [ ] **Step 1: Add a project per tier**

`playwright.config.ts` has `mobile` (Pixel 7) and `desktop` (Desktop Chrome, 1280×720 — which is the *laptop* tier, not desktop). Rename honestly and add the two missing widths:

```ts
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
    { name: 'wide', use: { ...devices['Desktop Chrome'], viewport: { width: 1680, height: 1050 } } },
  ],
```

Renaming `mobile` breaks every `testInfo.project.name === 'mobile'` guard in the suite — `tests/e2e/coach.ts` and the `test.skip` in `a11y.spec.ts` at minimum. Grep for `'mobile'` and `'desktop'` across `tests/` and update each; a stale guard silently skips or silently runs a case at the wrong width, which is worse than a failure.

- [ ] **Step 2: Assert the board's box per tier**

`tests/e2e/play.spec.ts` has a board-height test on a short phone viewport. Generalise its body into a helper and run it in every project, extending the states it walks:

```ts
test('the board keeps its box whatever the coach is doing', async ({ page }) => {
  await startEasyGame(page);
  const grid = page.getByRole('grid');
  const atRest = (await grid.boundingBox())!;

  await openCoach(page);
  const withCoach = (await grid.boundingBox())!;
  expect(withCoach.width).toBeCloseTo(atRest.width, 1);
  expect(withCoach.height).toBeCloseTo(atRest.height, 1);

  await page.getByRole('button', { name: /where should i look/i }).click();
  const withHint = (await grid.boundingBox())!;
  expect(withHint.width).toBeCloseTo(atRest.width, 1);
  expect(withHint.height).toBeCloseTo(atRest.height, 1);
});
```

Keep the existing short-viewport precondition assertion on the phone project — it is what stops that case going vacuous when the board becomes width-bound.

- [ ] **Step 3: axe every tier**

`a11y.spec.ts`'s game-screen scan runs per project already, so adding the projects covers it. Add one assertion that the reading order is sane on the wide tier — the board must come before the coach in the accessibility tree, because a screen reader user should meet the puzzle before the commentary:

```ts
test('puts the board before the coach in the reading order', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'wide', 'three columns only exist on the wide tier');
  await startEasyGame(page);
  const order = await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]')!;
    const coach = document.querySelector('[data-testid="coach-column"]')!;
    return grid.compareDocumentPosition(coach) & Node.DOCUMENT_POSITION_FOLLOWING ? 'board-first' : 'coach-first';
  });
  expect(order).toBe('board-first');
});
```

- [ ] **Step 4: Run the whole suite**

Run: `npm run e2e > /tmp/e2e.log 2>&1; tail -40 /tmp/e2e.log`
Expected: PASS across all four projects. Four projects is roughly double today's runtime — if CI time becomes the problem, say so in your report rather than dropping a project.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): play the game at every width we claim to support

The suite ran a phone and a 1280 laptop and called the second one 'desktop',
so the tier that grew a third column was never opened by a test. The board-box
assertion now runs in all four, which is the invariant this rework turns on."
```

---

### Task 6: Write the invariant down where it binds

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Generalise invariant 9**

It currently says nothing outside the board and the keypad may occupy layout *height* during play. Rewrite it to the generalised form — **no content appearing or disappearing during play may resize the board, at any viewport** — and name both enforcement points: the unit canary over the root column's in-flow children, and the Playwright board-box assertion that now runs in four projects. Keep the existing voice; invariants 1-8 set it.

Add a sentence naming the tiers and where they are declared (`src/app/useViewportTier.ts`), so the next reader learns the layout has four modes from the binding reference rather than from the CSS.

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: the invariant was about height because the app was a phone

Side by side, a sidebar that flexes resizes the board just as surely as a bar
that appears above it. The rule is the board's box, not the axis."
```

---

## Notes for the executor

- **The phone is done.** If you find yourself editing a phone assertion, stop: the change has reached a layout that was signed off, and that is a defect to report rather than a test to update.
- **`md` and `xl` are unused on purpose.** A lesson column narrower than 1536 gives a ~45-character measure. Do not "complete" the breakpoint set.
- **The columns do not flex.** That is the invariant, not a styling preference.
