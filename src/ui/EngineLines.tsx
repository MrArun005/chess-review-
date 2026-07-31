import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import type { PvLine } from '../engine/types';
import type { AnalyzeFn } from './useAnalysisEngine';

interface Props {
  fen: string;
  analyze: AnalyzeFn;
  /** Play the first move of a line (from,to) — hooks into exploration. */
  onPlay?: (from: string, to: string) => void;
  depth?: number;
  multipv?: number;
}

interface Row {
  score: string;
  san: string;
  pv: string;
  from?: string;
  to?: string;
}

/**
 * On-demand "top engine moves" for the position on screen. Collapsed by default
 * so it doesn't spend compute unless asked; when open it analyzes the current
 * FEN at higher MultiPV and lists the candidate moves with their evals and PVs.
 */
export function EngineLines({ fen, analyze, onPlay, depth = 16, multipv = 3 }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setRows(null);
    // Debounce: stepping quickly through the game shouldn't enqueue a full
    // MultiPV search per move — only analyze once the position settles.
    const timer = setTimeout(() => {
      analyze(fen, { depth, multipv })
        .then((a) => {
          if (cancelled) return;
          setRows(a.lines.map((l) => toRow(fen, l)));
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, fen, analyze, depth, multipv]);

  return (
    <div className="card lines">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Engine lines</h3>
        <button onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</button>
      </div>

      {open && loading && <p className="note">Analyzing…</p>}
      {open && !loading && rows && (
        <div style={{ marginTop: 8 }}>
          {rows.map((r, i) => (
            <div
              className="line"
              key={i}
              onClick={() => r.from && r.to && onPlay?.(r.from, r.to)}
              title={r.from ? 'Play this move' : undefined}
            >
              <span className="score">{r.score}</span>
              <span className="pv">
                <strong>{r.san}</strong> {r.pv}
              </span>
            </div>
          ))}
          <p className="note" style={{ marginTop: 6 }}>
            Evals are from White's perspective. Click a line to play its first move.
          </p>
        </div>
      )}
    </div>
  );
}

function toRow(fen: string, line: PvLine): Row {
  const sans = pvToSan(fen, line.pv);
  const first = line.pv[0];
  return {
    score: fmtEval(line),
    san: sans[0] ?? '—',
    pv: sans.slice(1).join(' '),
    from: first?.slice(0, 2),
    to: first?.slice(2, 4),
  };
}

/** White-perspective eval string: "#3", "-#2", "+1.4", "-0.6". */
function fmtEval(line: PvLine): string {
  if (line.mate !== null) {
    return line.mate >= 0 ? `#${line.mate}` : `-#${Math.abs(line.mate)}`;
  }
  const pawns = (line.cp ?? 0) / 100;
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
}

function pvToSan(fen: string, pv: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, 8)) {
    try {
      const m = c.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] as never,
      });
      if (!m) break;
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}
