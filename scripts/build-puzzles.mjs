// Build the offline puzzle pack from the lichess puzzle database (CC0).
//
//   curl -LO https://database.lichess.org/lichess_db_puzzle.csv.zst
//   node scripts/build-puzzles.mjs lichess_db_puzzle.csv.zst
//
// Needs the zstd CLI on PATH (or ZSTD=/path/to/zstd). Piping works too:
//   zstdcat lichess_db_puzzle.csv.zst | node scripts/build-puzzles.mjs
//
// Keeps only well-tested, well-liked puzzles, then reservoir-samples PER_BUCKET
// per (rating band × primary theme) so every theme exists at every level —
// including the rare ones (smothered mate, zugzwang, interference…) that a
// uniform sample would drown. The RNG is seeded, so re-runs give the same pack.
//
// Output (public/puzzles/):
//   <band>.json   rows for one 200-point rating band
//   daily.json    lichess's own hand-picked daily puzzles
//   master.json   positions from games between titled players / super-GMs
//   index.json    counts + theme coverage
//
// Row format (compact, positional): [id, fen, moves, rating, themes]
//   moves  – UCI, space separated. moves[0] is the opponent's setup move.
//   themes – space separated lichess theme tags.

import { createInterface } from 'node:readline';
import { createReadStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PER_BUCKET = 45;
const MIN_BAND = 400;
const MAX_BAND = 2800;
const MASTER_MAX = 1500;

// Training themes. A puzzle is bucketed under its RAREST matching theme, so the
// sampler over-represents the patterns you would otherwise almost never meet.
const THEMES = [
  'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5',
  'backRankMate', 'smotheredMate', 'arabianMate', 'anastasiaMate', 'bodenMate',
  'doubleBishopMate', 'hookMate', 'dovetailMate',
  'fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'doubleCheck',
  'hangingPiece', 'trappedPiece', 'deflection', 'attraction', 'clearance',
  'interference', 'intermezzo', 'xRayAttack', 'capturingDefender', 'sacrifice',
  'quietMove', 'defensiveMove', 'zugzwang', 'promotion', 'underPromotion',
  'advancedPawn', 'exposedKing', 'kingsideAttack', 'queensideAttack', 'attackingF2F7',
  'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame',
  'queenRookEndgame', 'equality', 'enPassant', 'castling',
];
const EXTRA_TAGS = [
  'opening', 'middlegame', 'endgame', 'short', 'long', 'veryLong', 'oneMove',
  'crushing', 'advantage', 'mate', 'master', 'masterVsMaster', 'superGM',
];
const KEEP = new Set([...THEMES, ...EXTRA_TAGS]);

let seed = 0x9e3779b9;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const band = (r) => Math.min(MAX_BAND, Math.max(MIN_BAND, Math.floor(r / 200) * 200));

function input() {
  const file = process.argv[2];
  if (!file) return process.stdin;
  if (!file.endsWith('.zst')) return createReadStream(file);
  // The dump opens with a zstd skippable frame (seekable format), which Node's
  // built-in decoder rejects, so hand it to the zstd CLI.
  const zstd = spawn(process.env.ZSTD ?? 'zstd', ['-dc', '--long=31', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  zstd.on('error', () => {
    console.error('zstd not found. Install it (brew/apt/winget install zstd) or set ZSTD=/path/to/zstd.');
    process.exit(1);
  });
  return zstd.stdout;
}

/** Reservoir-sample `row` into bucket `key` of `store`. */
function sample(store, counts, key, row, cap) {
  const n = (counts.get(key) ?? 0) + 1;
  counts.set(key, n);
  let b = store.get(key);
  if (!b) store.set(key, (b = []));
  if (b.length < cap) b.push(row);
  else {
    const j = Math.floor(rand() * n);
    if (j < cap) b[j] = row;
  }
}

// Picking the rarest theme needs global frequencies. These counts
// come from the 2026-09 dump and only steer bucketing, so staleness is harmless.
const FREQ = {
  mateIn1: 898212, mateIn2: 807425, fork: 781805, kingsideAttack: 533175, sacrifice: 459740,
  advancedPawn: 379089, defensiveMove: 368202, pin: 366072, rookEndgame: 328823,
  discoveredAttack: 308429, deflection: 264140, quietMove: 255378, pawnEndgame: 226117,
  hangingPiece: 222072, attraction: 221081, backRankMate: 206205, mateIn3: 196470,
  exposedKing: 183326, promotion: 146748, skewer: 134761, discoveredCheck: 108796,
  queensideAttack: 92462, bishopEndgame: 83604, clearance: 80373, intermezzo: 73021,
  queenEndgame: 71270, trappedPiece: 67001, zugzwang: 63824, knightEndgame: 50679,
  queenRookEndgame: 46069, attackingF2F7: 44813, capturingDefender: 39866, doubleCheck: 31924,
  mateIn4: 28698, smotheredMate: 24039, interference: 21969, xRayAttack: 21731,
  equality: 12875, hookMate: 10783, enPassant: 8580, arabianMate: 7474, anastasiaMate: 7441,
  mateIn5: 6198, dovetailMate: 4013, bodenMate: 3720, doubleBishopMate: 3709, castling: 2486,
  underPromotion: 1123,
};

const buckets = new Map();
const counts = new Map();
const daily = [];
const master = new Map();
const masterCounts = new Map();
let total = 0;
let kept = 0;
let header = true;

for await (const line of createInterface({ input: input(), crlfDelay: Infinity })) {
  if (header) {
    header = false;
    continue;
  }
  total++;
  const [id, fen, moves, rating, rd, pop, plays, themes, , , dailyDate] = line.split(',');
  const r = +rating;
  const tags = themes.split(' ');
  const row = [id, fen, moves, r, tags.filter((t) => KEEP.has(t)).join(' ')];

  // Lichess's daily puzzles are hand-picked; keep every one that is sound.
  if (dailyDate && +rd <= 100 && +pop >= 50) daily.push([...row, +dailyDate]);

  // High-rated puzzles get fewer plays; relax the bar a little up there.
  const minPlays = r >= 2400 ? 150 : 300;
  if (+pop < 85 || +plays < minPlays || +rd > 90) continue;

  if (tags.includes('superGM') || tags.includes('masterVsMaster')) {
    sample(master, masterCounts, 'm', row, MASTER_MAX);
  }

  let theme = null;
  for (const t of tags) if (t in FREQ && (theme === null || FREQ[t] < FREQ[theme])) theme = t;
  if (!theme) continue;
  kept++;
  sample(buckets, counts, `${band(r)}|${theme}`, row, PER_BUCKET);
}

const byBand = new Map();
for (const [key, rows] of buckets) {
  const bd = +key.split('|')[0];
  if (!byBand.has(bd)) byBand.set(bd, []);
  byBand.get(bd).push(...rows);
}

// Start clean so a band that no longer exists doesn't linger from an old build.
rmSync('public/puzzles', { recursive: true, force: true });
mkdirSync('public/puzzles', { recursive: true });
const bands = {};
const coverage = {};
for (const [bd, rows] of [...byBand].sort((a, b) => a[0] - b[0])) {
  rows.sort((a, b) => a[3] - b[3]);
  writeFileSync(`public/puzzles/${bd}.json`, JSON.stringify(rows));
  bands[bd] = rows.length;
  for (const row of rows) for (const t of row[4].split(' ')) coverage[t] = (coverage[t] ?? 0) + 1;
}
daily.sort((a, b) => a[5] - b[5]);
writeFileSync('public/puzzles/daily.json', JSON.stringify(daily.map((d) => d.slice(0, 5))));
const masterRows = (master.get('m') ?? []).sort((a, b) => a[3] - b[3]);
writeFileSync('public/puzzles/master.json', JSON.stringify(masterRows));

const packed = Object.values(bands).reduce((a, b) => a + b, 0);
writeFileSync(
  'public/puzzles/index.json',
  JSON.stringify(
    {
      source: 'lichess.org open puzzle database (CC0) — https://database.lichess.org/#puzzles',
      bandWidth: 200,
      bands,
      daily: daily.length,
      master: masterRows.length,
      total: packed,
      themes: Object.fromEntries(Object.entries(coverage).sort((a, b) => b[1] - a[1])),
    },
    null,
    2
  ) + '\n'
);
console.log(`read ${total}, eligible ${kept}, packed ${packed} + ${daily.length} daily + ${masterRows.length} master`);
console.log('bands:', bands);
