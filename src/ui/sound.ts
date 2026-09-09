import { KNOCKS, renderKnock, type KnockName } from './knock';
// Move sounds, synthesized with the Web Audio API — no audio files (nothing to
// bundle, CSP-safe, offline) and legally clean (we do NOT ship chess.com's
// proprietary samples).
//
// The knocks themselves are modal synthesis (see knock.ts): an impulse into
// a few damped, inharmonic resonances with a slight pitch sag, plus a 2 ms
// contact click — rendered once to PCM and played back like a sample.
//
// Browsers block audio until a user gesture; we lazily create/resume the
// AudioContext on first play, which in practice follows a click or keypress.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem('cr-muted') === '1';
  } catch {
    return false;
  }
}

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(comp);
    comp.connect(ctx.destination);
    loadSamples();
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

// --- optional recorded samples -------------------------------------------
// Drop files in public/sounds (move.mp3, capture.mp3, check.mp3, castle.mp3,
// promote.mp3 — or .ogg/.wav) and they override the synth for that event. This
// lets you use the exact sound you want without touching code. Missing files
// silently fall back to the synthesized wooden knocks.

const SAMPLE_NAMES = ['move', 'capture', 'check', 'castle', 'promote'] as const;
type SampleName = (typeof SAMPLE_NAMES)[number];

const samples = new Map<SampleName, AudioBuffer | null>();
let samplesRequested = false;

function loadSamples(): void {
  if (samplesRequested) return;
  samplesRequested = true;
  const c = ctx;
  if (!c) return;
  const base = import.meta.env.BASE_URL ?? '/';
  for (const name of SAMPLE_NAMES) {
    void (async () => {
      for (const ext of ['mp3', 'ogg', 'wav']) {
        try {
          const res = await fetch(`${base}sounds/${name}.${ext}`, { cache: 'force-cache' });
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          samples.set(name, await c.decodeAudioData(buf));
          return;
        } catch {
          /* try next extension */
        }
      }
      samples.set(name, null); // no file for this event → use synth
    })();
  }
}

/** Play a recorded sample if one is loaded. Returns true if it played. */
function playSample(name: SampleName): boolean {
  const buf = samples.get(name);
  const c = ctx;
  if (!buf || !c || !master) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(master);
  src.start();
  return true;
}

// --- synthesized knocks ----------------------------------------------------
// Each event's knock is rendered once (per sample rate) into an AudioBuffer
// and then simply played, with a few percent of random pitch variation so a
// run of moves doesn't sound machine-gunned.

const rendered = new Map<KnockName, AudioBuffer>();

function knockBuffer(c: AudioContext, name: KnockName): AudioBuffer {
  let b = rendered.get(name);
  if (b && b.sampleRate === c.sampleRate) return b;
  const pcm = renderKnock(KNOCKS[name], c.sampleRate);
  b = c.createBuffer(1, pcm.length, c.sampleRate);
  b.getChannelData(0).set(pcm);
  rendered.set(name, b);
  return b;
}

function tap(name: KnockName, { gain = 1, at = 0, vary = 0.04 }: { gain?: number; at?: number; vary?: number } = {}): void {
  const c = audioCtx();
  if (!c || !master || muted) return;
  const src = c.createBufferSource();
  src.buffer = knockBuffer(c, name);
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(master);
  src.start(c.currentTime + at);
}

function synthMove(): void {
  tap('move');
}
function synthCapture(): void {
  tap('capture');
}
function synthCheck(): void {
  tap('check');
}
function synthCastle(): void {
  // King, then rook — two taps a beat apart.
  tap('move', { gain: 0.9 });
  tap('move', { gain: 1, at: 0.13 });
}
function synthPromote(): void {
  // Pawn lands, then the new piece is set down.
  tap('move', { gain: 0.85 });
  tap('promoteTop', { at: 0.14 });
}

export const sound = {
  move() {
    if (muted) return;
    if (!playSample('move')) synthMove();
  },
  capture() {
    if (muted) return;
    if (!playSample('capture')) synthCapture();
  },
  check() {
    if (muted) return;
    if (!playSample('check')) synthCheck();
  },
  castle() {
    if (muted) return;
    if (!playSample('castle')) synthCastle();
  },
  promote() {
    if (muted) return;
    if (!playSample('promote')) synthPromote();
  },
  /** Pick the right cue from a SAN string. */
  forSan(san: string) {
    if (san.startsWith('O-O')) this.castle();
    else if (san.includes('=')) this.promote();
    else if (/[+#]/.test(san)) this.check();
    else if (san.includes('x')) this.capture();
    else this.move();
  },
  isMuted() {
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem('cr-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
};
