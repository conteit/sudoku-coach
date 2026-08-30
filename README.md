# Sudoku Coach

A sudoku PWA that teaches you to solve — it never solves for you.

**Live:** https://sudoku-coach-steel.vercel.app
<sub>Vercel appends a word because `sudoku-coach.vercel.app` was already taken by an unrelated project.</sub>

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
  stale — with the constraint that proves each one
- Progressive hints: region → technique name → exact cells → full walk-through
- Installable, and fully playable offline

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · Dexie (IndexedDB) · Vitest ·
Playwright · vite-plugin-pwa. All computation runs in the browser; generation
runs in a Web Worker. No backend.

## Develop

```sh
npm install
npm run dev        # dev server
npm run verify     # lint + typecheck + unit tests + build
npm run e2e        # Playwright against the production build
```

Architecture and module contracts: [`docs/architecture.md`](docs/architecture.md).

## Licence

Apache 2.0.
