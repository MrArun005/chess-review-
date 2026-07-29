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
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
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

export const sound = {
  move() {
    // Crisp, dry wooden tap.
    knock({
      modes: [
        { f: 2100, q: 9, g: 0.3 },
        { f: 900, q: 7, g: 0.5 },
        { f: 380, q: 4, g: 0.32 },
      ],
      decay: 0.05,
      tick: 0.11,
      hp: 3200,
      gain: 0.95,
    });
  },
  capture() {
    // Heavier, lower — a harder knock.
    knock({
      modes: [
        { f: 1500, q: 7, g: 0.42 },
        { f: 520, q: 5, g: 0.6 },
        { f: 240, q: 3, g: 0.4 },
      ],
      decay: 0.07,
      tick: 0.18,
      hp: 2400,
      gain: 1,
    });
  },
  check() {
    // A sharper, brighter tap so it stands out — still wood, no beep.
    knock({
      modes: [
        { f: 2600, q: 10, g: 0.38 },
        { f: 1100, q: 8, g: 0.42 },
      ],
      decay: 0.045,
      tick: 0.2,
      hp: 3600,
      gain: 0.95,
    });
  },
  castle() {
    // Two knocks: king, then rook.
    this.move();
    knock({
      modes: [
        { f: 1900, q: 9, g: 0.28 },
        { f: 820, q: 7, g: 0.48 },
        { f: 360, q: 4, g: 0.3 },
      ],
      decay: 0.05,
      tick: 0.1,
      hp: 3200,
      gain: 0.9,
      at: 0.1,
    });
  },
  promote() {
    // Two rising taps.
    this.move();
    knock({
      modes: [
        { f: 2600, q: 10, g: 0.3 },
        { f: 1200, q: 8, g: 0.42 },
      ],
      decay: 0.05,
      tick: 0.14,
      hp: 3600,
      gain: 0.9,
      at: 0.09,
    });
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
