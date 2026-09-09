/**
 * Motif-detection eval harness.
 *
 * This measures the deterministic fact layer — the part that makes this more
 * than "I prompted an LLM". It runs the motif detectors against a hand-labelled
 * set of positions and reports coverage and correct-motif rate. No engine
 * needed: the detectors are pure functions over the board, so this runs in
 * Node via `npm run eval`.
 *
 * Metrics reported:
 *   - Coverage:   % of labelled positions where ANY tactical motif fired.
 *   - Recall:     % where the EXPECTED motif was among those detected.
 *   - Precision:  of every distinct motif fired, the share that was labelled
 *                 (expected, or listed in `alsoAllowed`). A detector that fires
 *                 everything scores 100% recall and terrible precision.
 *   - F1:         harmonic mean of the two — the number to quote.
 *
 * Grow eval/positions.json toward ~200 positions and quote the measured number
 * ("... at X% motif coverage over 200 hand-labelled positions").
 */
import { Chess } from 'chess.js';
import { boardMap, type Color } from '../src/brain/attacks';
import { detectAll, type MotifName } from '../src/brain/motifs/index';
import positions from './positions.json';

interface Labelled {
  fen: string;
  byColor: string;
  expectedMotif: string;
  /** Other motifs that are genuinely present and must not count as false positives. */
  alsoAllowed?: string[];
  note?: string;
}

const TACTICAL: MotifName[] = ['fork', 'pin', 'skewer', 'backrank', 'trapped', 'hanging', 'mate'];

function run() {
  const rows: Labelled[] = positions as Labelled[];
  let covered = 0;
  let correct = 0;
  let fired = 0; // distinct motifs fired across all rows
  let falsePositives = 0;

  console.log(`\nMotif eval — ${rows.length} labelled positions\n`);
  console.log('  result   expected     detected');
  console.log('  ' + '-'.repeat(50));

  for (const row of rows) {
    let detected: MotifName[] = [];
    try {
      const chess = new Chess(row.fen);
      detected = detectAll(boardMap(chess), row.byColor as Color).map((h) => h.motif);
    } catch (e) {
      console.log(`  ERROR    ${row.expectedMotif.padEnd(12)} (bad FEN: ${(e as Error).message})`);
      continue;
    }

    const uniq = [...new Set(detected)];
    const anyTactic = uniq.some((m) => TACTICAL.includes(m));
    const hit = uniq.includes(row.expectedMotif as MotifName);
    if (anyTactic) covered++;
    if (hit) correct++;
    const allowed = new Set([row.expectedMotif, ...(row.alsoAllowed ?? [])]);
    const extra = uniq.filter((m) => !allowed.has(m));
    fired += uniq.length;
    falsePositives += extra.length;

    const mark = hit ? (extra.length ? '✓ noisy' : '✓ PASS ') : anyTactic ? '~ other' : '✗ MISS ';
    const extraNote = extra.length ? `  (+${extra.join(', ')})` : '';
    console.log(`  ${mark}  ${row.expectedMotif.padEnd(12)} [${uniq.join(', ') || 'none'}]${extraNote}`);
  }

  const pct = (n: number) => `${((n / rows.length) * 100).toFixed(0)}%`;
  console.log('\n  ' + '-'.repeat(50));
  const recall = correct / rows.length;
  const precision = fired ? (fired - falsePositives) / fired : 0;
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
  console.log(`  Coverage (any tactic fired):  ${pct(covered)}  (${covered}/${rows.length})`);
  console.log(`  Recall (expected detected):   ${pct(correct)}  (${correct}/${rows.length})`);
  console.log(`  Precision (fired ∈ labelled): ${(precision * 100).toFixed(0)}%  (${fired - falsePositives}/${fired})`);
  console.log(`  F1:                           ${(f1 * 100).toFixed(0)}%`);
  console.log('');

  // Non-zero exit if either side regresses below its floor.
  if (recall < 0.8) {
    console.error('Recall below 80% floor.');
    process.exit(1);
  }
  if (precision < 0.6) {
    console.error('Precision below 60% floor.');
    process.exit(1);
  }
}

run();
