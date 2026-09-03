# Sudoku Coach

[![ci](https://github.com/conteit/sudoku-coach/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/conteit/sudoku-coach/actions/workflows/ci.yml)
[![licence](https://img.shields.io/badge/licence-Apache%202.0-blue)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-installable%20%C2%B7%20offline-5a5a5a)](https://sudoku-coach.lab.paolocontessi.me)

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
- Sweeping aids, both off by default because each takes something from the
  player: one digit at a time while taking notes, so a mis-tap cannot write the
  wrong note or move the highlight; and cross-hatching that shades where the
  highlighted digit cannot go. The second is a training wheel — it draws the
  eliminations, never the conclusion, because the last unshaded cell in a box
  is a digit and the digit is always yours to find
- An optional Google account, and sync through the hidden app-data folder of
  your own Drive: newest save wins per whole game, deletions carry tombstones so
  a puzzle deleted on one device stays deleted, and none of it is ever in the
  way of a game
- Playable from the keyboard, and in English or Italian
- Installable, and fully playable offline

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · Dexie (IndexedDB) · Vitest ·
Playwright · vite-plugin-pwa. All computation runs in the browser; generation
runs in a Web Worker.

**No backend of ours.** Sign-in is Firebase Authentication and sync writes to
the player's own Google Drive under the `drive.appdata` scope — a hidden folder
this app cannot see past. There is no server holding anyone's puzzles, which is
also why the app is complete with the network off and complete without an
account.

## Develop

```sh
npm install
npm run dev        # dev server; #gallery renders the component gallery
npm run verify     # lint + typecheck + unit tests + build
npm run e2e        # Playwright against the production build
npm run audit      # Lighthouse, thresholds in lighthouserc.json
```

CI runs all three; the badge above is that workflow on `main`. The e2e suite
plays a generated puzzle to completion with no test-only seam in the bundle — it reads the board out of the DOM and solves it
with the same engine the app ships — and asserts installability, offline play
and WCAG 2 AA (axe) on the real screens.

Architecture and module contracts: [`docs/architecture.md`](docs/architecture.md).
It is the binding reference — where it and the code disagree, one of them is a
bug, and which one is worth saying out loud.

## Licence

Apache 2.0.
