import { useCallback } from 'react';
import { getSharedEngine } from '../engine/analyzer';
import type { Analysis } from '../engine/types';

export type AnalyzeFn = (
  fen: string,
  opts: { depth: number; multipv: number }
) => Promise<Analysis>;

/**
 * Analyze with the shared session engine (drag-to-explore and the engine-lines
 * panel). Sharing one engine means the ~40 MB neural net loads only once;
 * requests are serialized inside the engine, so concurrent callers just queue.
 */
export function useAnalysisEngine(): AnalyzeFn {
  return useCallback((fen, opts) => {
    return getSharedEngine().analyze({ fen, depth: opts.depth, multipv: opts.multipv });
  }, []);
}
