# Sudoku Coach

A sudoku PWA that teaches you to solve — it never solves for you.

**Live:** https://sudoku-coach.lab.paolocontessi.me
<sub>On a domain of its own rather than the `*.vercel.app` one it was deployed to first. That is not
cosmetic: `vercel.app` is on the Public Suffix List, so a browser partitions storage for the
Firebase Auth helper iframe served from `*.firebaseapp.com`, and sign-in breaks with a
cross-origin frame error. Serving the app from a domain we control is Firebase's own remedy.</sub>

Most sudoku apps answer "I'm stuck" by revealing a digit, which teaches nothing.
Sudoku Coach answers with the *reasoning*: it names the technique that applies to
your actual board, points at the region, and walks the logic — escalating only as
far as you ask. The digit is never volunteered.

## What makes it trustworthy

Every hint is produced by a deterministic technique engine plus hand-reviewed
lesson content. There is no model inventing an explanation, so a wrong hint is
impossible by construction. A property test asserts that no finding ever
eliminates a digit that belongs in the solution.

## Features

- Classic 9×9 generation at four difficulty levels, rated by the hardest
  technique the solve path actually requires
- Pencil marks in a fixed 3×3 mini-grid, unlimited undo/redo, same-digit
  highlighting
- Several puzzles in progress at once, each with its own timer and history
- A coach that verifies *your* pencil marks and tells you which are missing or
  stale — with the constraint that proves each one, and changes none of them
- Progressive hints: region → technique name → exact cells → full walk-through
- Drills: the coach names a pattern that is on your board and waits for you to
  find it, judging the result on the board rather than on your word for it
- "Let the coach choose": a puzzle whose solve path needs the technique you are
  closest to owning, on the gentlest grid that can require it
- A Learn section — the rules, what the coach will and will not say, and a page
  per technique built from the same lessons the coach delivers mid-game
- Playable from the keyboard, and in English or Italian
- Installable, and fully playable offline

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · Dexie (IndexedDB) · Vitest ·
Playwright · vite-plugin-pwa. All computation runs in the browser; generation
runs in a Web Worker. No backend.

## Develop

```sh
npm install
npm run dev        # dev server; #gallery renders the component gallery
npm run verify     # lint + typecheck + unit tests + build
npm run e2e        # Playwright against the production build
npm run audit      # Lighthouse, thresholds in lighthouserc.json
```

CI runs all three. The e2e suite plays a generated puzzle to completion with no
test-only seam in the bundle — it reads the board out of the DOM and solves it
with the same engine the app ships — and asserts installability, offline play
and WCAG 2 AA (axe) on the real screens.

Architecture and module contracts: [`docs/architecture.md`](docs/architecture.md).

## Licence

Apache 2.0.
