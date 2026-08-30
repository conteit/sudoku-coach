/**
 * Client and worker protocol, tested end to end against a fake `Worker`.
 *
 * The fake is a pair of message pumps wired to the *real* `attach` from
 * `generator.worker.ts`, so every assertion here exercises the shipped handler:
 * the request ids, the cancel path, the progress stream and the error
 * translation. Mocking the worker away would leave the protocol — the only part
 * of this seam that can actually be wrong — untested.
 *
 * jsdom has no `Worker`, which is why `spawn` is injectable in the first place.
 * It does have `MessageChannel`, so the worker's between-attempt yield runs for
 * real and cancellation is tested as it actually behaves rather than as a stub.
 */

import { describe, expect, it, vi } from 'vitest';
import { Board } from './board';
import { countSolutions } from './solver';
import { attach } from './generator.worker';
import type { GeneratorMessage, GeneratorRequest } from './generator.worker';
import type { WorkerLike } from './generatorClient';
import { createGeneratorClient, GenerationCancelledError } from './generatorClient';

/**
 * A `Worker` stand-in that runs the real handler in the same realm.
 *
 * Both directions deliver through `queueMicrotask`, so no message is ever
 * observed synchronously inside the `postMessage` that sent it — which is the
 * one behaviour of a real worker that the client's bookkeeping depends on.
 */
class FakeWorker implements WorkerLike {
  /** Every message the worker sent, in order. The cancellation assertions read this. */
  readonly sent: GeneratorMessage[] = [];
  terminated = false;

  #toClient: ((event: MessageEvent<GeneratorMessage>) => void)[] = [];
  #toWorker: ((event: MessageEvent<GeneratorRequest>) => void)[] = [];

  constructor() {
    attach({
      addEventListener: (_type, listener) => this.#toWorker.push(listener),
      postMessage: (message) => {
        if (this.terminated) return;
        this.sent.push(message);
        const listeners = [...this.#toClient];
        queueMicrotask(() => {
          for (const listener of listeners) listener({ data: message } as MessageEvent<GeneratorMessage>);
        });
      },
    });
  }

  postMessage(message: GeneratorRequest): void {
    if (this.terminated) return;
    const listeners = [...this.#toWorker];
    queueMicrotask(() => {
      for (const listener of listeners) listener({ data: message } as MessageEvent<GeneratorRequest>);
    });
  }

  addEventListener(
    type: 'message' | 'error',
    listener: ((event: MessageEvent<GeneratorMessage>) => void) & ((event: { message: string }) => void),
  ): void {
    if (type === 'message') this.#toClient.push(listener);
    else this.errorListeners.push(listener);
  }

  /** Exposed so a test can simulate the worker dying. */
  readonly errorListeners: ((event: { message: string }) => void)[] = [];

  terminate(): void {
    this.terminated = true;
  }
}

/** Lets every queued micro- and macrotask drain, several turns deep. */
const settle = async (turns = 5): Promise<void> => {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const withClient = (): { client: ReturnType<typeof createGeneratorClient>; worker: FakeWorker } => {
  const worker = new FakeWorker();
  return { client: createGeneratorClient(() => worker), worker };
};

describe('generator client', () => {
  it('resolves with a rated, unique puzzle from off the main thread', async () => {
    const { client } = withClient();
    const result = await client.generate({ difficulty: 'medium', seed: 5 });

    expect(result.requested).toBe('medium');
    expect(result.matched).toBe(true);
    expect(result.puzzle.difficulty).toBe('medium');
    expect(countSolutions(Board.fromString(result.puzzle.givens), 2)).toBe(1);
    client.dispose();
  });

  it('spawns one worker and keeps it warm across runs', async () => {
    const worker = new FakeWorker();
    const spawn = vi.fn(() => worker);
    const client = createGeneratorClient(spawn);

    await client.generate({ difficulty: 'easy', seed: 1 });
    await client.generate({ difficulty: 'easy', seed: 2 });

    expect(spawn).toHaveBeenCalledTimes(1);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('streams attempt counts so the UI can show progress rather than a spinner', async () => {
    const { client } = withClient();
    const progress: number[] = [];
    // Seed 1 at a one-attempt-per-match-failure cadence guarantees a few
    // attempts, so there is a stream to observe at all.
    const result = await client.generate({
      difficulty: 'expert',
      seed: 1,
      maxAttempts: 40,
      onProgress: (p) => progress.push(p.attempts),
    });

    expect(progress.length).toBeGreaterThan(0);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(result.attempts - 1);
    client.dispose();
  });

  it('reports a downgrade instead of pretending it matched', async () => {
    const { client } = withClient();
    const result = await client.generate({ difficulty: 'expert', seed: 1, maxAttempts: 1 });

    expect(result.matched).toBe(false);
    expect(result.requested).toBe('expert');
    expect(result.puzzle.difficulty).not.toBe('expert');
    client.dispose();
  });

  /* --- Cancellation: backing out must not leave a worker grinding --------- */

  it('stops the worker when the run is aborted', async () => {
    const { client, worker } = withClient();
    const controller = new AbortController();

    const run = client.generate({
      difficulty: 'expert',
      seed: 3,
      maxAttempts: 5_000,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    await expect(run).rejects.toBeInstanceOf(GenerationCancelledError);

    await settle();
    const cancelled = worker.sent.findIndex((m) => m.type === 'cancelled');
    expect(cancelled, 'worker acknowledged the cancel').toBeGreaterThanOrEqual(0);
    const after = worker.sent.length;

    // The proof that the loop actually stopped: with a 5000-attempt cap, a
    // worker still grinding would post hundreds more progress messages over
    // the turns below.
    await settle(20);
    expect(worker.sent.length).toBe(after);
    expect(worker.sent.at(-1)?.type).toBe('cancelled');
    client.dispose();
  });

  it('rejects an already-aborted request without spawning a worker', async () => {
    const spawn = vi.fn(() => new FakeWorker());
    const client = createGeneratorClient(spawn);
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.generate({ difficulty: 'easy', signal: controller.signal }),
    ).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('drops the tail of a cancelled run rather than resolving the next one', async () => {
    const { client } = withClient();
    const controller = new AbortController();

    const abandoned = client.generate({
      difficulty: 'expert',
      seed: 3,
      maxAttempts: 5_000,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(abandoned).rejects.toBeInstanceOf(GenerationCancelledError);

    const next = await client.generate({ difficulty: 'easy', seed: 8 });
    expect(next.puzzle.difficulty).toBe('easy');
    client.dispose();
  });

  it('rejects runs still in flight when the client is disposed', async () => {
    const { client } = withClient();
    const run = client.generate({ difficulty: 'expert', seed: 4, maxAttempts: 5_000 });
    client.dispose();
    await expect(run).rejects.toBeInstanceOf(GenerationCancelledError);
  });

  /* --- Failure ----------------------------------------------------------- */

  it('surfaces a thrown generation as an error, not a cancellation', async () => {
    const { client } = withClient();
    // maxAttempts 0 is rejected inside the loop, i.e. inside the worker.
    await expect(client.generate({ difficulty: 'easy', maxAttempts: 0 })).rejects.toThrow(
      /positive integer/,
    );
    client.dispose();
  });

  it('does not leave a promise hanging when the worker itself dies', async () => {
    const { client, worker } = withClient();
    const run = client.generate({ difficulty: 'expert', seed: 6, maxAttempts: 5_000 });
    await settle(1);
    for (const listener of worker.errorListeners) listener({ message: 'boom' });

    await expect(run).rejects.toThrow(/boom/);
    client.dispose();
  });
});
