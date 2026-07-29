import { useCallback, useEffect, useRef } from 'react';
import { Engine } from '../engine/analyzer';
import type { Analysis } from '../engine/types';

export type AnalyzeFn = (
  fen: string,
  opts: { depth: number; multipv: number }
) => Promise<Analysis>;

/**
 * One long-lived on-demand analysis engine shared by the interactive features
 * (drag-to-explore and the engine-lines panel). Sharing a single engine avoids
 * loading the 40 MB NNUE more than once; requests are serialized inside the
 * engine, so concurrent callers simply queue.
 */
export function useAnalysisEngine(): AnalyzeFn {
  const ref = useRef<Engine | null>(null);

  useEffect(() => {
    return () => {
      ref.current?.dispose();
      ref.current = null;
    };
  }, []);

  return useCallback((fen, opts) => {
    if (!ref.current) ref.current = new Engine();
    return ref.current.analyze({ fen, depth: opts.depth, multipv: opts.multipv });
  }, []);
}
