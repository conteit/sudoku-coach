/**
 * The generation worker (spec §5.2 engine/generator.worker, R1).
 *
 * Generation is the one genuinely expensive thing the app does: an expert
 * puzzle costs tens of attempts, each a full-grid search plus forty uniqueness
 * proofs. On the UI thread that is a frozen tap target and a stalled timer, so
 * it runs here and the UI thread only ever sees messages.
 *
 * Two obligations shape the protocol, and both come from the player rather than
 * from the algorithm:
 *
 * - **Progress.** The loop knows exactly how many attempts it has burned, so it
 *   says so. A spinner that cannot distinguish "half a second in" from "wedged"
 *   is the thing this avoids.
 * - **Cancellation.** Backing out of "new game" must actually stop the work,
 *   not just stop looking at it. So the loop is driven one attempt at a time
 *   with the event loop handed back in between — a synchronous `while` would
 *   starve this worker's own message handler and the cancel would arrive only
 *   after the run it was meant to abort had already finished.
 *
 * `attach` takes the scope as a parameter rather than reaching for `self`, so
 * the protocol is testable against a fake scope with no real `Worker` and no
 * bundler in the loop. The wiring at the bottom is guarded for the same reason:
 * importing this module outside a worker is inert.
 */

import type { Difficulty } from './types';
import type { GenerationResult, Symmetry } from './generator';
import { generation, seededRng } from './generator';

/* ------------------------------------------------------------------------ */
/* Protocol                                                                  */
/* ------------------------------------------------------------------------ */

export interface GenerateRequest {
  type: 'generate';
  /**
   * Correlates every response with the request that caused it, so a client
   * that starts a second run can ignore the tail of the first.
   */
  id: number;
  difficulty: Difficulty;
  symmetry?: Symmetry;
  maxAttempts?: number;
  /** Seeds the run. Omit for `Math.random`; supply it to replay a bug report. */
  seed?: number;
}

export interface CancelRequest {
  type: 'cancel';
  id: number;
}

export type GeneratorRequest = GenerateRequest | CancelRequest;

export interface ProgressMessage {
  type: 'progress';
  id: number;
  attempts: number;
  /** So a UI can render a fraction rather than a bare count. */
  maxAttempts: number;
  /** Nearest level reached so far; null until something gradeable comes out. */
  best: Difficulty | null;
}

export interface DoneMessage {
  type: 'done';
  id: number;
  result: GenerationResult;
}

export interface CancelledMessage {
  type: 'cancelled';
  id: number;
  attempts: number;
}

export interface ErrorMessage {
  type: 'error';
  id: number;
  message: string;
}

export type GeneratorMessage = ProgressMessage | DoneMessage | CancelledMessage | ErrorMessage;

/**
 * The slice of `DedicatedWorkerGlobalScope` this module uses.
 *
 * Declared structurally rather than imported: the app's `lib` is `DOM`, where
 * `self` is a `Window` whose `postMessage` has a different signature. Naming
 * only the two members it needs also makes the test double a five-line object.
 */
export interface WorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<GeneratorRequest>) => void,
  ): void;
  postMessage(message: GeneratorMessage): void;
}

/* ------------------------------------------------------------------------ */
/* Driving the loop                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Hands the event loop back so queued messages — a cancel, above all — are
 * actually delivered.
 *
 * A `MessageChannel` round-trip rather than `setTimeout(0)`: nested timeouts
 * are clamped to 4ms past the fifth level, which would add whole seconds of
 * pure sleeping to a run that goes the distance.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Flipped by a `cancel` for as long as the run it names is still going. */
interface Token {
  cancelled: boolean;
}

async function run(request: GenerateRequest, scope: WorkerScope, token: Token): Promise<void> {
  const { id, difficulty, symmetry, maxAttempts, seed } = request;
  const steps = generation({
    difficulty,
    symmetry,
    maxAttempts,
    rng: seed === undefined ? undefined : seededRng(seed),
  });

  for (;;) {
    const step = steps.next();
    if (step.done) {
      scope.postMessage({ type: 'done', id, result: step.value });
      return;
    }
    const { attempts, maxAttempts: cap, best } = step.value;
    scope.postMessage({ type: 'progress', id, attempts, maxAttempts: cap, best });
    await yieldToEventLoop();
    if (token.cancelled) {
      // `steps` is simply dropped: an iterator paused at a yield holds nothing
      // but its own locals, so abandoning it frees the run outright.
      scope.postMessage({ type: 'cancelled', id, attempts });
      return;
    }
  }
}

/**
 * Wires the protocol onto a worker scope. Exported so the test drives the real
 * handler against a fake scope.
 */
export function attach(scope: WorkerScope): void {
  const active = new Map<number, Token>();

  scope.addEventListener('message', (event) => {
    const request = event.data;

    if (request.type === 'cancel') {
      // A cancel naming a run that already finished is a no-op, not an error:
      // the player's tap and the last attempt raced, and the player lost.
      const token = active.get(request.id);
      if (token) token.cancelled = true;
      return;
    }

    const token: Token = { cancelled: false };
    active.set(request.id, token);
    void run(request, scope, token)
      .catch((error: unknown) => {
        scope.postMessage({
          type: 'error',
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => active.delete(request.id));
  });
}

/**
 * Only wire up when this module really is a worker's global scope.
 *
 * Read off `globalThis` rather than named directly, because the app's `lib` is
 * `DOM` and `WorkerGlobalScope` lives in `WebWorker` — a lib that cannot be
 * added without redeclaring half of `DOM`. Under vitest's jsdom the property is
 * simply absent, so importing this module in a test leaves no stray listener on
 * `window`.
 */
const globals = globalThis as { WorkerGlobalScope?: abstract new () => object };
if (globals.WorkerGlobalScope && globalThis instanceof globals.WorkerGlobalScope) {
  attach(globalThis as unknown as WorkerScope);
}
