/**
 * The main thread's half of the generation protocol.
 *
 * The UI never imports `generator.ts`: the only supported way to get a puzzle
 * is to ask this client, which asks the worker (R1, docs/architecture.md "No
 * backend computation"). Everything the UI needs is a promise, a progress
 * callback and an `AbortSignal` — the message plumbing, the request ids and the
 * worker's lifetime stay in here.
 *
 * The worker is spawned lazily and then kept warm. Spawning costs a module
 * parse and the engine is not small, so paying it once per session rather than
 * once per puzzle is the difference between "new game" feeling instant and
 * feeling like a page load. `spawn` is injectable so the tests can drive the
 * real protocol against a fake worker: vitest runs under jsdom, which has no
 * `Worker`, and a client whose only test was a mock of itself would prove
 * nothing.
 */

import type { Difficulty } from './types';
import type { GenerationProgress, GenerationResult, Symmetry } from './generator';
import type { GeneratorMessage, GeneratorRequest } from './generator.worker';

/**
 * The slice of `Worker` this client uses, so a test double is a small object
 * rather than a stub of the whole DOM interface.
 */
export interface WorkerLike {
  postMessage(message: GeneratorRequest): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<GeneratorMessage>) => void,
  ): void;
  addEventListener(type: 'error', listener: (event: { message: string }) => void): void;
  terminate(): void;
}

/** Spawns the bundled worker. Vite rewrites this URL at build time. */
export const spawnGeneratorWorker = (): WorkerLike =>
  new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });

/**
 * Rejection reason when a run is aborted.
 *
 * A distinct class rather than a plain `Error`, because the UI must be able to
 * tell "the player changed their mind" from "generation failed" — the first is
 * silent, the second is a message the player has to see.
 */
export class GenerationCancelledError extends Error {
  constructor(message = 'generation cancelled') {
    super(message);
    this.name = 'GenerationCancelledError';
  }
}

export interface GenerateRunOptions {
  difficulty: Difficulty;
  symmetry?: Symmetry;
  maxAttempts?: number;
  /** Seeds the run so a reported puzzle can be reproduced exactly. */
  seed?: number;
  /** Aborting posts a cancel to the worker and rejects with `GenerationCancelledError`. */
  signal?: AbortSignal;
  /**
   * Called once per finished attempt. The worker reports every attempt rather
   * than sampling, so a caller that wants a calmer bar should throttle here —
   * dropping a frame is the UI's decision to make, not the engine's.
   */
  onProgress?: (progress: GenerationProgress) => void;
}

export interface GeneratorClient {
  generate(options: GenerateRunOptions): Promise<GenerationResult>;
  /** Terminates the worker and rejects every run still in flight. */
  dispose(): void;
}

interface PendingRun {
  resolve: (result: GenerationResult) => void;
  reject: (reason: Error) => void;
  onProgress?: (progress: GenerationProgress) => void;
  /** Detaches the abort listener; a run must not outlive its own subscription. */
  cleanup: () => void;
}

/**
 * A client over one worker.
 *
 * Runs are keyed by an incrementing id, so a second `generate` while the first
 * is still going is well defined: both complete, each resolving its own
 * promise. That matters less for the UI — which cancels before it restarts —
 * than for the failure mode it removes, where a stale `done` from an abandoned
 * run resolves the run the player is actually waiting for.
 */
export function createGeneratorClient(spawn: () => WorkerLike = spawnGeneratorWorker): GeneratorClient {
  const pending = new Map<number, PendingRun>();
  let worker: WorkerLike | null = null;
  let nextId = 1;

  const settle = (id: number, run: PendingRun): void => {
    pending.delete(id);
    run.cleanup();
  };

  const failAll = (reason: Error): void => {
    for (const [id, run] of [...pending]) {
      settle(id, run);
      run.reject(reason);
    }
  };

  const ensureWorker = (): WorkerLike => {
    if (worker) return worker;
    const spawned = spawn();
    spawned.addEventListener('message', (event) => {
      const message = event.data;
      const run = pending.get(message.id);
      // No entry means the run was already abandoned by an abort. Dropping the
      // message is the whole point of correlating by id.
      if (!run) return;
      switch (message.type) {
        case 'progress':
          run.onProgress?.({
            attempts: message.attempts,
            maxAttempts: message.maxAttempts,
            best: message.best,
          });
          return;
        case 'done':
          settle(message.id, run);
          run.resolve(message.result);
          return;
        case 'cancelled':
          settle(message.id, run);
          run.reject(new GenerationCancelledError());
          return;
        case 'error':
          settle(message.id, run);
          run.reject(new Error(message.message));
          return;
      }
    });
    spawned.addEventListener('error', (event) => {
      // A worker that failed to load or died mid-run will never answer, so
      // every waiting promise has to be told rather than left hanging.
      failAll(new Error(`generator worker failed: ${event.message}`));
    });
    worker = spawned;
    return spawned;
  };

  return {
    generate(options) {
      const { difficulty, symmetry, maxAttempts, seed, signal, onProgress } = options;
      if (signal?.aborted) return Promise.reject(new GenerationCancelledError());

      const id = nextId++;
      const active = ensureWorker();

      return new Promise<GenerationResult>((resolve, reject) => {
        const abort = (): void => {
          const run = pending.get(id);
          if (!run) return;
          settle(id, run);
          // Reject now and tell the worker to stop. The player is not made to
          // wait for the in-flight attempt to finish before the sheet closes,
          // and the worker still stops grinding at the next attempt boundary.
          active.postMessage({ type: 'cancel', id });
          reject(new GenerationCancelledError());
        };

        signal?.addEventListener('abort', abort);
        pending.set(id, {
          resolve,
          reject,
          onProgress,
          cleanup: () => signal?.removeEventListener('abort', abort),
        });
        active.postMessage({ type: 'generate', id, difficulty, symmetry, maxAttempts, seed });
      });
    },

    dispose() {
      failAll(new GenerationCancelledError('generator client disposed'));
      worker?.terminate();
      worker = null;
    },
  };
}
