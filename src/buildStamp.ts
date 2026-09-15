/**
 * The build stamp: which build this is, not which version.
 *
 *     20260915-21-cb174ef
 *     └─ date ─┘ └h┘ └sha┘
 *
 * Paolo's call, and the reasoning is worth keeping because the obvious
 * alternative was tried first. Semver from conventional commits needs the
 * version computed somewhere that can read git history — and the build that
 * ships is Vercel's, whose clone is shallow and carries no tags at all. Every
 * way around that costs something real: a bump commit on `main` (so every
 * merge deploys twice), a merge-blocking check on every PR, or moving the
 * deploy out of the Vercel integration. A stamp needs none of it, because
 * every part of it is already sitting in the build environment.
 *
 * What it is actually for is identification, which is what the number was
 * wanted for in the first place: a bug report that can say which build
 * produced it, and a line in Settings that answers "am I current".
 *
 * It sorts, too. `20260915-21` against `20260914-08` says which is newer at a
 * glance — something a bare sha can never do, and that semver only does if you
 * trust whoever bumped it.
 *
 * This module is deliberately free of Node and of `import.meta`: it is called
 * from `vite.config.ts` at build time, where the answers are, and it is unit
 * tested like anything else. The *reading* side is `__BUILD_STAMP__`, the
 * global the config defines from this.
 */

/** Where the parts of a stamp can come from, in the order we trust them. */
export interface StampSources {
  /** Vercel's, on a real deployment — preview or production. */
  vercelSha?: string | undefined;
  /** GitHub Actions', in CI. */
  githubSha?: string | undefined;
  /** Whatever `git rev-parse HEAD` said, for a build made on a laptop. */
  gitSha?: string | undefined;
  /**
   * Vercel's `VERCEL_GIT_PULL_REQUEST_ID` — the PR number on a preview built
   * from one, and empty on everything else including production.
   */
  pullRequestId?: string | undefined;
  /**
   * Actions' `GITHUB_REF`, which is `refs/pull/150/merge` on a `pull_request`
   * run and a branch ref otherwise. Parsed here rather than in the config so
   * the parsing is testable like everything else.
   */
  ref?: string | undefined;
}

/** Marks a build made outside Vercel, Actions and a git checkout. */
export const UNKNOWN_SHA = 'dev';

const SHA_LENGTH = 7;

/**
 * The first sha that is actually there, shortened to git's own seven.
 *
 * Order matters: Vercel is the deployed case and the one a bug report will be
 * about, Actions is CI, git is a local `npm run build`. `dev` rather than an
 * invented value — a stamp that cannot name its commit should say so, because
 * the whole point of the thing is being able to go and look.
 */
export function shaFrom(sources: StampSources): string {
  const found = [sources.vercelSha, sources.githubSha, sources.gitSha].find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return found === undefined ? UNKNOWN_SHA : found.trim().slice(0, SHA_LENGTH);
}

const PULL_REF = /^refs\/pull\/(\d+)\//;

/**
 * The pull request this build came from, when it came from one.
 *
 * A preview is the build Paolo is most likely to be looking at when something
 * is wrong, and "which PR is this" is the first thing he would otherwise have
 * to go and work out from the sha. Production has no PR and says nothing —
 * the segment is absent rather than empty, so a released build's stamp stays
 * the short form.
 *
 * Digits only. Both sources are environment strings and a stamp with junk in
 * it is worse than a stamp without the number, because it looks authoritative.
 */
export function pullRequestFrom(sources: StampSources): string | undefined {
  const direct = sources.pullRequestId?.trim();
  if (direct !== undefined && /^\d+$/.test(direct)) return direct;

  const fromRef = PULL_REF.exec(sources.ref?.trim() ?? '');
  return fromRef === null ? undefined : fromRef[1];
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * `YYYYMMDD-HH`, in UTC.
 *
 * UTC is not incidental. Vercel builds in UTC and a laptop does not, so a
 * local-time stamp would make two builds an hour apart look like they were
 * made in the wrong order — the one property this format has over a bare sha.
 *
 * The hour, and not the minute: a minute makes two builds of the same commit
 * look like different things, and an hour is still short enough to read out
 * over a phone.
 */
export function momentOf(at: Date): string {
  const date = `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`;
  return `${date}-${pad(at.getUTCHours())}`;
}

/**
 * The whole stamp: `20260915-21-cb174ef`, or `20260915-21.150-cb174ef` when
 * the build came from a pull request.
 *
 * The PR number rides on the hour rather than taking a segment of its own, so
 * the string keeps the same three-part shape either way and still sorts by
 * moment first.
 */
export function buildStamp(at: Date, sources: StampSources): string {
  const pull = pullRequestFrom(sources);
  const moment = pull === undefined ? momentOf(at) : `${momentOf(at)}.${pull}`;
  return `${moment}-${shaFrom(sources)}`;
}

/**
 * Whether a string is a stamp this app produced.
 *
 * Exported for the tests rather than for the app — nothing at runtime parses a
 * stamp, it only shows one. It exists so the tests can assert the *shape* of a
 * value that is different on every build, which is the only honest assertion
 * available for something baked in at build time.
 */
export const STAMP_PATTERN = /^\d{8}-\d{2}(\.\d+)?-([0-9a-f]{7}|dev)$/;
