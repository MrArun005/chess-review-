import { createStockfishWorker, readLine } from './stockfish.worker';
import {
  parseInfoLine,
  isBestmove,
  normalizeToWhite,
  type RawPvLine,
} from './uci';
import type { Analysis, PvLine } from './types';

export interface AnalyzeOptions {
  fen: string;
  depth: number;
  multipv: number;
  /** Called with each improved PV line as the search deepens (White POV). */
  onProgress?: (line: PvLine, sideToMove: 'w' | 'b') => void;
}

export interface EngineOptions {
  /** Hash table size in MB. */
  hash?: number;
  /** Search threads. Ignored (falls back to 1) without cross-origin isolation. */
  threads?: number;
}

/**
 * A single, long-lived Stockfish instance with a serialized request queue.
 *
 * Gotcha #5: one engine, queued requests. Spawning a worker per position
 * thrashes memory and dies on mobile. All `analyze` calls funnel through one
 * worker; the queue guarantees only one `go` runs at a time.
 */
export class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private currentReject: ((e: Error) => void) | null = null;
  private opts: EngineOptions;

  constructor(opts: EngineOptions = {}) {
    this.opts = opts;
  }

  /** Boot the worker and complete the UCI handshake. Idempotent. */
  async init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.boot();
    return this.ready;
  }

  private async boot(): Promise<void> {
    const worker = createStockfishWorker();
    this.worker = worker;

    worker.onerror = (e) => {
      const err = new Error(
        `Stockfish worker failed to load. Is public/engine/stockfish.js present? (${e.message})`
      );
      this.currentReject?.(err);
    };

    await this.handshake();
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  /** uci -> uciok, set options, isready -> readyok. */
  private handshake(): Promise<void> {
    const threads = crossOriginIsolated ? this.opts.threads ?? navigatorThreads() : 1;
    const hash = this.opts.hash ?? 64;

    return new Promise<void>((resolve, reject) => {
      const worker = this.worker;
      if (!worker) return reject(new Error('Engine not constructed'));

      let sawUciOk = false;
      const onMsg = (ev: MessageEvent) => {
        const line = readLine(ev.data);
        if (line === 'uciok') {
          sawUciOk = true;
          this.send(`setoption name Threads value ${threads}`);
          this.send(`setoption name Hash value ${hash}`);
          this.send('isready');
        } else if (line === 'readyok' && sawUciOk) {
          worker.removeEventListener('message', onMsg);
          resolve();
        }
      };
      worker.addEventListener('message', onMsg);
      this.send('uci');

      // Safety timeout: if the engine never answers, surface a real error
      // instead of hanging the UI forever.
      setTimeout(() => {
        if (!sawUciOk) {
          worker.removeEventListener('message', onMsg);
          reject(new Error('Stockfish did not respond to `uci` within 15s.'));
        }
      }, 15_000);
    });
  }

  /**
   * Analyze one position. Requests are serialized; the returned promise
   * resolves with the best line and all MultiPV lines, normalized to White.
   */
  analyze(options: AnalyzeOptions): Promise<Analysis> {
    const run = () => this.runOne(options);
    // Chain onto the queue so only one search is in flight at a time.
    const result = this.queue.then(run, run);
    // Keep the queue alive even if this request rejects.
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async runOne(options: AnalyzeOptions): Promise<Analysis> {
    await this.init();
    const worker = this.worker;
    if (!worker) throw new Error('Engine not initialized');

    const { fen, depth, multipv, onProgress } = options;
    const sideToMove = fenSideToMove(fen);

    // Best-so-far raw line per multipv rank.
    const rawByRank = new Map<number, RawPvLine>();

    return new Promise<Analysis>((resolve, reject) => {
      this.currentReject = reject;

      const onMsg = (ev: MessageEvent) => {
        const line = readLine(ev.data);
        if (!line) return;

        if (isBestmove(line)) {
          cleanup();
          const lines = [...rawByRank.values()]
            .map((r) => normalizeToWhite(r, sideToMove))
            .sort((a, b) => a.multipv - b.multipv);
          if (lines.length === 0) {
            // No PV (e.g. immediate mate/stalemate at the root). Return an
            // empty best line rather than throwing so the pipeline can flag it.
            const empty: PvLine = { multipv: 1, depth, cp: 0, mate: null, pv: [] };
            resolve({ fen, depth, lines: [empty], best: empty });
            return;
          }
          resolve({ fen, depth, lines, best: lines[0] });
          return;
        }

        const raw = parseInfoLine(line);
        if (!raw) return;
        // Keep the deepest report per rank.
        const prev = rawByRank.get(raw.multipv);
        if (!prev || raw.depth >= prev.depth) {
          rawByRank.set(raw.multipv, raw);
          onProgress?.(normalizeToWhite(raw, sideToMove), sideToMove);
        }
      };

      const cleanup = () => {
        worker.removeEventListener('message', onMsg);
        this.currentReject = null;
      };

      worker.addEventListener('message', onMsg);
      this.send(`setoption name MultiPV value ${Math.max(1, multipv)}`);
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  /** Stop any in-flight search and terminate the worker. */
  dispose(): void {
    try {
      this.send('stop');
      this.send('quit');
    } catch {
      /* ignore */
    }
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}

function fenSideToMove(fen: string): 'w' | 'b' {
  return fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

function navigatorThreads(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2;
  // Leave headroom for the UI; cap so mobile doesn't choke.
  return Math.max(1, Math.min(4, (cores || 2) - 1));
}
