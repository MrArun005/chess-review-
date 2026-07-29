// Move sounds, synthesized with the Web Audio API — no audio files, so nothing
// to bundle and no CSP/cross-origin concerns, and legally clean (we do NOT ship
// chess.com's proprietary samples).
//
// Instead of plain tones we model a real piece impact: a short filtered noise
// "tick" (the contact) plus a fast-decaying resonant "body" (wood/plastic ring)
// — which reads as the familiar chess.com-style click/clack. Captures are
// harder and lower; check adds an alert; castle is a double knock; promotion
// adds a bright rising chime.
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
    // A soft limiter keeps the transient clicks from clipping.
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

/** One reusable short white-noise buffer for the contact "tick". */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

interface Knock {
  /** Resonant body frequency (Hz) — lower reads heavier/harder. */
  body: number;
  /** Contact-tick loudness. */
  tick: number;
  /** Body loudness. */
  ring: number;
  /** Body decay time (s). */
  decay: number;
  /** Highpass cutoff for the tick (Hz). */
  hp: number;
  /** Delay from now (s), for double knocks. */
  at?: number;
}

function knock({ body, tick, ring, decay, hp, at = 0 }: Knock): void {
  const c = audioCtx();
  if (!c || !master || muted) return;
  const t = c.currentTime + at;

  // Contact tick: a few ms of highpassed noise.
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const hpf = c.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = hp;
  const ng = c.createGain();
  ng.gain.setValueAtTime(tick, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  src.connect(hpf);
  hpf.connect(ng);
  ng.connect(master);
  src.start(t);
  src.stop(t + 0.04);

  // Resonant body: a sine that drops slightly and decays fast (wooden knock).
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(body, t);
  osc.frequency.exponentialRampToValueAtTime(body * 0.7, t + decay);
  const og = c.createGain();
  og.gain.setValueAtTime(ring, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(og);
  og.connect(master);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

/** A short two-note alert layered on top of a knock (check). */
function alert(): void {
  const c = audioCtx();
  if (!c || !master || muted) return;
  const out = master; // capture for the closure below (keeps the non-null narrowing)
  const t = c.currentTime;
  const notes = [660, 880];
  notes.forEach((f, i) => {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    const start = t + 0.04 + i * 0.07;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.05, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
    o.connect(g);
    g.connect(out);
    o.start(start);
    o.stop(start + 0.11);
  });
}

/** A bright rising chime for a promotion. */
function chime(): void {
  const c = audioCtx();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(700, t + 0.05);
  o.frequency.exponentialRampToValueAtTime(1200, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g);
  g.connect(master);
  o.start(t + 0.05);
  o.stop(t + 0.24);
}

export const sound = {
  move() {
    knock({ body: 250, tick: 0.16, ring: 0.32, decay: 0.075, hp: 1400 });
  },
  capture() {
    // Harder, lower, with a touch more grit.
    knock({ body: 190, tick: 0.3, ring: 0.4, decay: 0.1, hp: 900 });
  },
  check() {
    knock({ body: 250, tick: 0.16, ring: 0.3, decay: 0.07, hp: 1400 });
    alert();
  },
  castle() {
    // Two knocks: king, then rook.
    knock({ body: 240, tick: 0.15, ring: 0.3, decay: 0.07, hp: 1400 });
    knock({ body: 220, tick: 0.15, ring: 0.3, decay: 0.07, hp: 1400, at: 0.11 });
  },
  promote() {
    knock({ body: 250, tick: 0.16, ring: 0.3, decay: 0.07, hp: 1400 });
    chime();
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
