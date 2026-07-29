# Chess Review

A chess.com-style game review that runs **entirely in your browser**. Paste a
PGN (or import your games from chess.com / lichess by username) and get an eval
bar, per-move classification, accuracy scores, best-move arrows, and
**plain-English explanations of your mistakes**.

No backend. No API keys. No login. No per-day limit. Deploy the static build and
it works.

---

## What makes it different

The explanations are **deterministic** — there is no LLM in the analysis path.
Stockfish does the calculation; a fact extractor reads the resulting position
and principal variation into a set of booleans and numbers (material swings,
forks, pins, hanging pieces, back-rank weaknesses…), and a small rule DSL turns
those facts into prose through templates.

Nothing generates, so nothing can hallucinate. Every sentence is backed by a
concrete fact on the board.

```
FEN + played move + engine PV
     → FACT EXTRACTOR   (deterministic booleans + numbers)
     → RULE MATCHER     (JSON DSL, priority-ordered, top 1-2 fire)
     → TEMPLATE RENDER  (phrasing selected by FEN hash — varied but stable)
```

---

## Architecture

| Layer | What it does |
|---|---|
| `src/engine/` | Stockfish (WASM) in a worker, promise-wrapped `analyze(fen, depth, multipv)`, UCI parsing, IndexedDB cache |
| `src/review/` | PGN → per-ply pipeline, win% math, move classification, game accuracy, opening detection, game import |
| `src/brain/` | The fact extractor: geometric motif detectors, positional feature diff, the rule DSL, template rendering |
| `src/ui/` | Board, eval bar, eval graph, move list, move-detail panel, summary, key moments |
| `eval/` | Hand-labelled positions + a metrics harness for motif coverage |

### Core ideas worth knowing

- **Classify on win%, not centipawns.** A 200cp drop is "good" when you're up a
  queen and a "blunder" when the game is level. All grading runs on win
  probability (`src/review/winpct.ts`).
- **Eval sign flips every ply.** UCI scores are from the side-to-move's
  perspective. They are normalized to White's perspective the moment they are
  parsed (`src/engine/uci.ts`).
- **Two-pass analysis.** A fast shallow scan (depth ~12, MultiPV 1) fills the
  eval graph immediately; a deeper pass (depth ~18, MultiPV 2) re-examines only
  inaccuracy-or-worse moves and their neighbours. Everything is cached by
  `fen|depth|multipv`, so a re-review is instant.
- **The PV is the explanation.** Play the engine's line out on a board and
  observe what happens — material won, a piece forked, the back rank collapsing.

---

## Getting started

```bash
npm install      # also copies a Stockfish build into public/engine
npm run dev      # http://localhost:5173
```

`npm install`'s postinstall step (`scripts/fetch-stockfish.mjs`) copies a
Stockfish build out of `node_modules/stockfish` into `public/engine/`, so the
engine is served same-origin — no CDN, no network at runtime. If it can't find
the package, it prints how to drop a build in manually.

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
npm test           # unit tests (win% math, classifier, motif detectors)
npm run eval       # motif-detection metrics over eval/positions.json
```

---

## Deploying

Multi-threaded Stockfish needs `SharedArrayBuffer`, which requires
cross-origin isolation headers:

```
Cross-Origin-Opener-Policy:   same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are set for you on **Vercel** (`vercel.json`) and **Netlify**
(`netlify.toml`), and in the Vite dev/preview servers (`vite.config.ts`).

> **GitHub Pages cannot set these headers**, so there you're stuck on the
> single-threaded engine (3–4× slower). Use Vercel or Netlify.

---

## The eval harness

`eval/` is the measurable core. `npm run eval` runs the motif detectors against
hand-labelled positions and reports:

- **Coverage** — % of positions where a tactical motif fired
- **Correct-motif rate** — % where the *expected* motif was detected

The detectors are pure functions over the board, so this runs in Node with no
engine. The labelled set ships small and is meant to grow toward ~200
positions — then quote the measured number:

> *"Deterministic chess annotation engine — a rule DSL over an extracted fact
> layer, measured at X% motif coverage across 200 hand-labelled positions."*

---

## Known limits vs chess.com

- **Depth.** chess.com runs deep server-side; this runs at ~12–18 in WASM.
  Sharp tactical positions will occasionally disagree.
- **Brilliant / Great.** chess.com's exact criteria are undocumented and have
  changed repeatedly. This uses a transparent heuristic (a sound sacrifice that
  stays best-or-near and isn't already winning) — expect honest disagreement.
- **Estimated rating** and **"X% of players played this"** need proprietary
  data and huge game databases; both are out of scope.
- **Quiet positional errors** ("released the tension too early", "wrong rook")
  fall through to the positional feature-diff fallback: true, but bland.

Where it wins: unlimited, instant, no login, any PGN from any source.

---

## License

The application code in this repository is MIT.

The Stockfish engine is **not** bundled in the repo — it is fetched into
`public/engine/` from the `stockfish` npm package at install time and is
licensed separately under **GPLv3**. If you redistribute a built copy that
includes the engine binaries, the engine remains under GPLv3.
