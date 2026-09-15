/// <reference types="vite/client" />

/**
 * The build stamp, replaced at build time by the `define` in `vite.config.ts`
 * — `20260915-21-cb174ef`. See `src/buildStamp.ts` for what each part is and
 * why the app identifies builds rather than versioning them.
 *
 * A typed global rather than a cast on `import.meta.env`: the value is not
 * configuration and never comes from `.env`, so the three lines of declaration
 * buy real typing instead of the `as unknown as Record<string, …>` the runtime
 * keys have to use.
 */
declare const __BUILD_STAMP__: string;
