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
 *   - Coverage:      % of labelled positions where ANY tactical motif fired.
 *   - Correct-motif: % where the EXPECTED motif was among those detected.
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
  note?: string;
}

const TACTICAL: MotifName[] = ['fork', 'pin', 'skewer', 'backrank', 'trapped', 'hanging', 'mate'];

function run() {
  const rows: Labelled[] = positions as Labelled[];
  let covered = 0;
  let correct = 0;

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

    const mark = hit ? '✓ PASS ' : anyTactic ? '~ other' : '✗ MISS ';
    console.log(`  ${mark}  ${row.expectedMotif.padEnd(12)} [${uniq.join(', ') || 'none'}]`);
  }

  const pct = (n: number) => `${((n / rows.length) * 100).toFixed(0)}%`;
  console.log('\n  ' + '-'.repeat(50));
  console.log(`  Coverage (any tactic fired):  ${pct(covered)}  (${covered}/${rows.length})`);
  console.log(`  Correct-motif rate:           ${pct(correct)}  (${correct}/${rows.length})`);
  console.log('');

  // Non-zero exit if the correct-motif rate regresses below a floor.
  if (correct / rows.length < 0.8) {
    console.error('Correct-motif rate below 80% floor.');
    process.exit(1);
  }
}

run();
