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
import type { Difficulty } from '../engine/types';

export interface GeneratorState {
  running: boolean;
  progress: GenerationProgress | null;
  /** Set when the worker itself failed. A cancellation is not an error. */
  failed: boolean;
}

export interface UseGenerator extends GeneratorState {
  /** Resolves to null when the run was cancelled or the worker failed. */
  generate: (difficulty: Difficulty) => Promise<GenerationResult | null>;
  cancel: () => void;
}

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

  const generate = useCallback(async (difficulty: Difficulty) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    clientRef.current ??= createGeneratorClient();
    setState({ running: true, progress: null, failed: false });

    try {
      const result = await clientRef.current.generate({
        difficulty,
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

  return { ...state, generate, cancel };
}
