/**
 * Puzzle generation, bound to a component's lifetime.
 *
 * One worker per mounted app, spawned on first use and terminated on unmount —
 * generation is rare and bursty, so keeping a worker alive from startup would
 * cost a thread for nothing, and spawning one per request would pay the module
 * load on every new puzzle. An in-flight run is aborted when the player
 * dismisses the sheet, because a worker still digging clues for a puzzle nobody
 * will play is a phone burning battery.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GenerationCancelledError,
  createGeneratorClient,
  type GeneratorClient,
} from '../engine/generatorClient';
import type { GenerationProgress, GenerationResult } from '../engine/generator';
import type { Difficulty, TechniqueId } from '../engine/types';

export interface GeneratorState {
  running: boolean;
  progress: GenerationProgress | null;
  /** Set when the worker itself failed. A cancellation is not an error. */
  failed: boolean;
}

export interface UseGenerator extends GeneratorState {
  /**
   * Resolves to null when the run was cancelled or the worker failed.
   *
   * `seed` makes a run reproducible, which the worker protocol has always
   * supported for replaying bug reports. The landing page uses it for the
   * opposite reason: the same seed every day means every visitor is handed
   * the same puzzle without anything having to store or serve it.
   */
  generate: (difficulty: Difficulty, seed?: number) => Promise<GenerationResult | null>;
  /**
   * A puzzle whose solve path actually needs `technique`. Falls back to the
   * last puzzle generated — `matched` on the result says which happened, so a
   * caller can tell the player rather than quietly handing them a drill that
   * drills nothing.
   */
  generateNeeding: (
    technique: TechniqueId,
    difficulty: Difficulty,
  ) => Promise<{ result: GenerationResult; needed: boolean } | null>;
  cancel: () => void;
}

/**
 * How many puzzles to look at before settling. Each one is a full generate +
 * rate cycle in the worker, so this is a few seconds of phone, not a search:
 * the techniques worth practising turn up often, and the ones that do not are
 * exactly the ones worth settling on a near miss for.
 */
export const TECHNIQUE_ATTEMPTS = 5;

export function useGenerator(): UseGenerator {
  const clientRef = useRef<GeneratorClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<GeneratorState>({
    running: false,
    progress: null,
    failed: false,
  });

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ running: false, progress: null, failed: false });
  }, []);

  const generate = useCallback(async (difficulty: Difficulty, seed?: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    clientRef.current ??= createGeneratorClient();
    setState({ running: true, progress: null, failed: false });

    try {
      const result = await clientRef.current.generate({
        difficulty,
        seed,
        signal: controller.signal,
        onProgress: (progress) => {
          // A stale run's progress must not repaint the sheet the player is
          // watching; the controller identity is what tells them apart.
          if (abortRef.current === controller) setState((s) => ({ ...s, progress }));
        },
      });
      if (abortRef.current !== controller) return null;
      setState({ running: false, progress: null, failed: false });
      return result;
    } catch (error) {
      if (error instanceof GenerationCancelledError || controller.signal.aborted) return null;
      setState({ running: false, progress: null, failed: true });
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const generateNeeding = useCallback(
    async (technique: TechniqueId, difficulty: Difficulty) => {
      let last: GenerationResult | null = null;
      for (let attempt = 0; attempt < TECHNIQUE_ATTEMPTS; attempt++) {
        const result = await generate(difficulty);
        if (result === null) return null;
        last = result;
        if (result.puzzle.techniquesUsed.includes(technique)) {
          return { result, needed: true };
        }
      }
      return last === null ? null : { result: last, needed: false };
    },
    [generate],
  );

  return { ...state, generate, generateNeeding, cancel };
}
