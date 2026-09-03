# Accounts, Drive sync, dev tools and a landing page

Design for the work Paolo asked for on 2026-09-03. Four things arrived in one
message; they are one milestone because three of them depend on the fourth
(an identity), but they are four *shippable slices* and should land in that
order.

Decisions already taken by Paolo are marked **settled**. Nothing here is
built yet.

## What this must not break

The thesis and the constraints in `docs/architecture.md` survive intact, and
saying how is most of the design:

- **Local-first stays literal.** IndexedDB remains the source of truth. Every
  P0 feature works signed out, offline, forever. Sync is a *mirror*, never a
  dependency, and the app must be fully playable with the network off and no
  account — R9 and the "no account required" constraint are unchanged.
- **Still no backend computation.** Firebase Auth and the Drive REST API are
  both called from the browser. Zero serverless functions, static hosting,
  free tier — the constraint holds because nothing new is computed anywhere
  but the client.
- **Invariant 5 is what makes this cheap.** `Game` is already self-contained
  and serializable, "so a P2 sync layer is additive". This is that layer, and
  it should need no change to `state/types.ts`.
- **The coach is untouched.** No slice here changes a hint, a lesson or a
  disclosure rule.

## Slice 1 — Routing and the landing page

**Settled:** real routes. `/` is the landing page, `/play` is the app.

A marketing page that cannot be linked to, shared or indexed is not doing its
job, and that is the whole reason to break the "no router" note in
`docs/architecture.md`. The note's *reasoning* survives and must be written
into the router: **there are no per-game URLs.** A board lives on the device
holding it, so `/play/<id>` would be a link that means nothing on any other
machine. Two routes, and `/play` is where the existing `App` shell lives
unchanged.

The landing page:

- **Hero: a real board, one puzzle per day.** `seededRng` already exists
  (`src/engine/generator.ts`), so the day's puzzle is a pure function of the
  date — the same puzzle for everyone, with no backend to serve it. It is an
  *easy* board by rating, generated in the existing worker so the page never
  blocks. A visitor can place digits and see the app's feedback without an
  account, a decision, or a download.
- **Below it: what the app is for.** The selling point is the thesis — the
  app never hands out a digit; every hint is a technique with a lesson behind
  it. That is a claim worth putting in the first screen, because it is the
  only thing that distinguishes this from every other sudoku app.
- **A Start button** into `/play`.
- **The taster's progress is not a saved game.** It lives in the page, and it
  is offered as one on Start ("keep this board?") rather than silently
  becoming one.

Open for Paolo: the copy itself. An agent should draft the selling points and
have them reviewed, in both locales, before they ship.

## Slice 2 — Optional Firebase authentication

**Settled:** optional, Google provider, suggested at the game start page,
invisible in the game view except in Settings.

- Sign-in is an *invitation*, never a gate. The library's empty state and
  Settings are the only places that mention it.
- No avatar, no session chrome in the game view. Paolo was explicit: the
  board screen is for the board.
- The profile store gains an account section; `PlayerProfile` itself should
  not — a signed-in identity is not a coaching preference. A separate
  `account` slice of the profile store keeps `state/types.ts` frozen.
- **Signing out never deletes local data.** It stops syncing. The games are
  the player's, on their device, either way.

## Slice 3 — Drive sync

**Settled:** the hidden `appDataFolder`, and newest-wins per whole game.

- **Scope: `drive.appdata` only.** The app can never see the user's own
  files, and there is nothing in their Drive UI to accidentally delete. This
  scope is *sensitive* in Google's classification: an unverified app is
  limited to test users until verification, which is a real constraint on
  "share it with friends" and has to be known now rather than discovered
  later.
- **Shape:** `profile.json` plus one file per game, keyed by game id. One
  file per game rather than one big document, so a sync is proportional to
  what changed and a corrupted file costs one puzzle.
- **Conflict rule:** compare `updatedAt`; the later save replaces the earlier
  one whole. Simple, predictable, and it never invents a board neither device
  had. The cost is stated plainly to the player in Settings: the device you
  played on last wins.
- **Deletions must not resurrect.** A game deleted on one device needs a
  tombstone, or the next sync from the other device brings it back. This is
  the one part of "newest wins" that is not free.
- **Sync is best-effort and silent.** A failed sync is not an error dialog;
  it is a state in Settings. Play never waits for the network.

## Slice 4 — Dev controls

**Settled:** an allowlist of UIDs or emails in a Vercel environment
variable, the way Paolo's other project does it.

- `VITE_DEV_ALLOWLIST`, comma-separated, read at build time. A signed-in user
  whose UID or email is in it sees two extra entries in the game menu:
  - **Solve the board** — fills the solution and completes the game, so the
    win animation can be watched without playing a puzzle out.
  - **Dump state** — the existing diagnostic report (#79), written to a file
    rather than a sheet, for offline analysis.
- The allowlist is public in the bundle. That is fine and worth saying: it
  contains no secret, grants nothing to anyone who is not signed in as that
  account, and the tools it unlocks are harmless anyway.
- **Solve the board must not pollute the record.** A dev-solved game should
  be marked as such, or mastery and the recap will report a puzzle nobody
  played.

## What Paolo has to do before slices 2-4 can start

Filed as `needs-human` issues, not buried here:

1. Create the Firebase project and enable the Google sign-in provider.
2. Configure the Google Cloud OAuth consent screen and add the
   `drive.appdata` scope — including the decision about verification.
3. Set the Vercel environment variables: the Firebase web config, and
   `VITE_DEV_ALLOWLIST`.

Slice 1 depends on none of them and can start immediately.

## Order, and why

1. **Landing + routing.** No dependencies, no blockers, and it is the slice
   with the clearest user-facing value on its own.
2. **Auth.** Needs the Firebase project.
3. **Dev controls.** Needs auth, and is small once it exists.
4. **Drive sync.** Needs auth and the consent screen, and is the largest and
   riskiest of the four — tombstones, conflict handling and offline queues
   are where this kind of work actually goes wrong.

Sync last is deliberate: it is the slice most likely to need a second pass,
and the other three are useful without it.
