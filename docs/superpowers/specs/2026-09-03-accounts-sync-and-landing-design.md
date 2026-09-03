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
  files, and there is nothing in their Drive UI to accidentally delete.

  An earlier draft of this document called that scope *sensitive* and warned
  about verification. **That was wrong**, and the correction matters because
  it removes the only real obstacle here: Google classifies `drive.appdata`
  as **non-sensitive**, alongside `drive.file` and unlike `drive` or
  `drive.readonly`. No security assessment, no sensitive-scope review.

  What does bite is the consent screen's *publishing status*, which is a
  button rather than a review:

  | | Testing | In production, non-sensitive scopes only |
  | --- | --- | --- |
  | Who can sign in | listed test users, max 100 | anyone |
  | Consent screen | unverified warning | normal |
  | Refresh tokens | expire after 7 days | normal lifetime |
  | Google review | none | none required |

  So: publish to production, request `drive.appdata` and nothing else, and
  there is no cap and no review. The 7-day rule is close to moot anyway for a
  browser-only client, which receives hour-long access tokens through the
  Google Identity token client rather than a refresh token.
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
  - **Preview the win** — plays the celebration on the board as it stands,
    without completing anything. Paolo's call, and it makes the feature
    simpler than the "solve it" it started as: nothing is written, so there
    is no completion to record, no mastery to credit, no recap to generate
    and nothing to sync. It is a view state, not a move.
  - **Dump state** — the existing diagnostic report (#79), written to a file
    rather than a sheet, for offline analysis.
- The allowlist is public in the bundle. That is fine and worth saying: it
  contains no secret, grants nothing to anyone who is not signed in as that
  account, and the tools it unlocks are harmless anyway.
- The record cannot be polluted, because nothing is written. This is why
  "preview the win" beats "solve the board": a dev-solved game would have
  needed a flag on `Game`, a rule in mastery, a rule in the recap and a rule
  in sync, all to describe a puzzle nobody played.

## What Paolo has to do before slices 2-4 can start

Filed as `needs-human` issues, not buried here:

1. Create the Firebase project and enable the Google sign-in provider.
2. Configure the consent screen and **publish it to production**. It lives in
   the *Cloud* console rather than Firebase — the same project seen through a
   second console — under APIs & Services → Google Auth Platform, whose
   Audience tab holds the Publish button. Testing status is what imposes the
   100-user cap and the 7-day refresh tokens; the scope imposes nothing.
   Paolo wants no custom logo, which is also the answer that avoids brand
   verification entirely. Steps are in #85.
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
