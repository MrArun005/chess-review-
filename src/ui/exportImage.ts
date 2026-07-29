import { gameAccuracy } from '../review/accuracy';
import { CLASS_LABEL, CLASS_COLOR, type MoveClass } from '../review/classify';
import type { ReviewResult } from '../review/pipeline';

/**
 * Render the review summary to a PNG and trigger a download. Pure canvas — no
 * external libraries, no network — so it works offline like the rest of the app.
 */
export function exportSummaryPng(result: ReviewResult): void {
  const W = 640;
  const H = 400;
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const h = result.headers;
  const white = result.moves.filter((m) => m.color === 'w');
  const black = result.moves.filter((m) => m.color === 'b');
  const wAcc = Math.round(gameAccuracy(white.map((m) => m.accuracy), white.map((m) => m.winMoverBefore)));
  const bAcc = Math.round(gameAccuracy(black.map((m) => m.accuracy), black.map((m) => m.winMoverBefore)));

  // Background
  ctx.fillStyle = '#262421';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#e9e6df';
  ctx.font = '700 26px Segoe UI, system-ui, sans-serif';
  ctx.fillText('♟ Chess Review', 28, 46);

  // Players
  ctx.fillStyle = '#9e9a92';
  ctx.font = '15px Segoe UI, system-ui, sans-serif';
  const players = `${h.White ?? 'White'} vs ${h.Black ?? 'Black'}`;
  ctx.fillText(players, 28, 72);
  if (result.openingName) {
    ctx.fillText(result.openingName, 28, 94);
  }

  // Accuracies
  drawAccuracy(ctx, 120, 170, 'White', wAcc);
  drawAccuracy(ctx, 400, 170, 'Black', bAcc);

  // Counts
  const order: MoveClass[] = ['brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'blunder'];
  drawCounts(ctx, 28, 250, 'White', countBy(white), order);
  drawCounts(ctx, 330, 250, 'Black', countBy(black), order);

  // Footer
  ctx.fillStyle = '#6f6c66';
  ctx.font = '12px Segoe UI, system-ui, sans-serif';
  ctx.fillText('Reviewed in the browser — no engine limits.', 28, H - 20);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chess-review.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function drawAccuracy(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  label: string,
  acc: number
): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#95bb4a';
  ctx.font = '700 44px Segoe UI, system-ui, sans-serif';
  ctx.fillText(`${acc}`, cx, y);
  ctx.fillStyle = '#9e9a92';
  ctx.font = '14px Segoe UI, system-ui, sans-serif';
  ctx.fillText(`${label} accuracy`, cx, y + 22);
  ctx.textAlign = 'left';
}

function drawCounts(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  title: string,
  counts: Record<string, number>,
  order: MoveClass[]
): void {
  ctx.fillStyle = '#e9e6df';
  ctx.font = '700 14px Segoe UI, system-ui, sans-serif';
  ctx.fillText(title, x, y);
  ctx.font = '13px Segoe UI, system-ui, sans-serif';
  let row = y + 22;
  for (const c of order) {
    if (!counts[c]) continue;
    ctx.fillStyle = CLASS_COLOR[c];
    ctx.fillText(`${CLASS_LABEL[c]}`, x, row);
    ctx.fillStyle = '#e9e6df';
    ctx.fillText(`${counts[c]}`, x + 200, row);
    row += 20;
  }
}

function countBy(moves: { classification: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moves) out[m.classification] = (out[m.classification] ?? 0) + 1;
  return out;
}

/** Build a shareable URL that re-runs this game's review on open. */
export function shareLink(pgn: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#pgn=${encodeURIComponent(pgn)}`;
}

/** Read a PGN out of the current URL hash, if present. */
export function pgnFromHash(): string | null {
  const hash = window.location.hash;
  const m = hash.match(/[#&]pgn=([^&]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
