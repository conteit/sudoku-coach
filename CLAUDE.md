# Sudoku Coach — working agreements

Read `docs/architecture.md` before changing anything. It is the binding reference; if code and that
document disagree, one of them is a bug — say which rather than quietly picking a side.

## The product thesis constrains the code

The app never hands out a digit. Every hint is grounded in a deterministic `Finding` from the
technique engine plus authored lesson text. If a change would make an incorrect hint *possible*, it
is wrong regardless of how convenient it is. The invariants in `docs/architecture.md` are not style
preferences.

## Frozen contracts

`src/engine/types.ts`, `src/state/types.ts` and `src/coach/types.ts` are frozen interfaces. Work
streams run in parallel against them. Changing one is a coordinated change — raise it in a PR body
or an issue, do not edit it locally to make your branch compile.

## Issue tracking

Anything that needs Paolo — a permission to grant, a third-party app to authorise, a product
decision, a native-language review — gets a **GitHub issue labelled `needs-human`**, filed as soon as
it is discovered. A blocker mentioned only in terminal output does not exist. Roadmap and
agent-executable work gets issues too, without that label.

Filter his queue with:

```sh
gh issue list --label needs-human
```

## Announce outward-facing actions

State the action in the turn before running it: creating a repo, pushing a new remote, deploying,
publishing anything under Paolo's identity. One line is enough — the point is that he is not
surprised, not that he is blocked on a prompt. Ordinary commits and pushes to this repo need no
announcement.

## Context is expensive — GitHub is the memory

Issue **#22** is the living build status and the resume point. Keep it current: when a wave lands or
a decision is made, edit that issue. It exists so a session can be cleared and picked up cold from
`gh issue view 22` + `docs/architecture.md` + this file, without re-reading the source tree.

Rules that follow from that:

- **Do not read files to build context.** Read a file when you are about to change it. The frozen
  contracts and #22 are the summary; the source is not.
- **Delegate wide reads.** A question spanning many files goes to a subagent that returns the
  conclusion, not to a sequence of reads that lands every file in the main context.
- **Redirect heavy command output to a file and tail it.** Builds, installs and test suites produce
  hundreds of lines that are worth twenty: `npm ci > /tmp/x.log 2>&1; tail -20 /tmp/x.log`.
- **Record decisions where they survive.** A conclusion that only exists in a transcript is lost at
  the next clear. It belongs in an issue, a commit message, or `docs/architecture.md`.

Watch the usage quota (`/usage`) and clear proactively at a wave boundary rather than mid-task —
a clear between waves costs nothing because #22 carries the state across it.

## Verify contract

`npm run verify` = lint → `tsc -b` → vitest → build. CI runs exactly this, plus `npm run e2e`.
Never weaken a config to make it pass. `main` requires the `verify` check and linear history; land
work through a PR with `gh pr merge --auto --rebase`.

## Style

Match the surrounding code — `src/engine/board.ts` sets the tone for the engine, `src/index.css` for
the design system. Comments explain *why*, not what. Commit messages explain the reasoning behind a
change, not a list of the files it touched.
