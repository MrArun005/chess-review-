// Move sounds, synthesized with the Web Audio API — no audio files (nothing to
// bundle, CSP-safe, offline) and legally clean (we do NOT ship chess.com's
// proprietary samples).
//
// The trick to a convincing wooden "tak" (vs. a cheap game beep) is to avoid
// pure tones. A real piece hitting a board is an impulse exciting a few damped
// resonant modes of the wood, plus a bright contact click — so we drive short
// resonant BANDPASS filters with a noise burst and let them decay fast. No
// sine oscillators, no melody.
//
// Browsers block audio until a user gesture; we lazily create/resume the
// AudioContext on first play, which in practice follows a click or keypress.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
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

/** One reusable short white-noise buffer that excites the resonators. */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.12);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/** A resonant mode of the "wood": center frequency, sharpness, loudness. */
interface Mode {
  f: number;
  q: number;
  g: number;
}

interface Knock {
  /** Resonant modes (a couple gives a woody character). */
  modes: Mode[];
  /** Overall decay of the body (s). */
  decay: number;
  /** Loudness of the bright contact click. */
  tick: number;
  /** Highpass cutoff for the click (Hz). */
  hp: number;
  /** Master level for this knock. */
  gain?: number;
  /** Delay from now (s), for double knocks. */
  at?: number;
}

function knock({ modes, decay, tick, hp, gain = 1, at = 0 }: Knock): void {
  const c = audioCtx();
  if (!c || !master || muted) return;
  const out = master;
  const t = c.currentTime + at;

  const bus = c.createGain();
  bus.gain.value = gain;
  bus.connect(out);

  // Damped resonant body: noise through short, sharp bandpasses.
  for (const m of modes) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = m.f;
    bp.Q.value = m.q;
    const g = c.createGain();
    g.gain.setValueAtTime(m.g, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(bp);
    bp.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + decay + 0.02);
  }

  // Bright contact click — a few ms of highpassed noise.
  const s2 = c.createBufferSource();
  s2.buffer = noise(c);
  const hpf = c.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = hp;
  const g2 = c.createGain();
  g2.gain.setValueAtTime(tick, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
  s2.connect(hpf);
  hpf.connect(g2);
  g2.connect(bus);
  s2.start(t);
  s2.stop(t + 0.03);
}

// The "Deep tok" profile chosen in the sound lab: low, warm, almost no click.
const DEEP_TOK: Knock = {
  modes: [
    { f: 1100, q: 7, g: 0.42 },
    { f: 450, q: 5, g: 0.55 },
    { f: 200, q: 3, g: 0.4 },
  ],
  decay: 0.07,
  tick: 0.05,
  hp: 1800,
  gain: 1,
};

// --- synthesized fallbacks -----------------------------------------------

function synthMove(): void {
  knock(DEEP_TOK);
}
function synthCapture(): void {
  // Heavier deep tok — lower, a touch more contact.
  knock({
    modes: [
      { f: 900, q: 6, g: 0.45 },
      { f: 380, q: 5, g: 0.6 },
      { f: 170, q: 3, g: 0.45 },
    ],
    decay: 0.085,
    tick: 0.09,
    hp: 1600,
    gain: 1,
  });
}
function synthCheck(): void {
  // A single firm, brighter rap — more assertive than the plain tok.
  knock({
    modes: [
      { f: 1800, q: 9, g: 0.45 },
      { f: 800, q: 7, g: 0.5 },
      { f: 360, q: 4, g: 0.35 },
    ],
    decay: 0.055,
    tick: 0.16,
    hp: 3000,
    gain: 1,
  });
}
function synthCastle(): void {
  knock(DEEP_TOK);
  knock({
    modes: [
      { f: 1000, q: 7, g: 0.4 },
      { f: 410, q: 5, g: 0.55 },
      { f: 185, q: 3, g: 0.4 },
    ],
    decay: 0.07,
    tick: 0.05,
    hp: 1800,
    gain: 1,
    at: 0.12,
  });
}
function synthPromote(): void {
  knock(DEEP_TOK);
  knock({
    modes: [
      { f: 1400, q: 7, g: 0.38 },
      { f: 600, q: 6, g: 0.5 },
      { f: 260, q: 3, g: 0.36 },
    ],
    decay: 0.06,
    tick: 0.1,
    hp: 2400,
    gain: 0.95,
    at: 0.12,
  });
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
