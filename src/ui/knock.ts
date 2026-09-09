/**
 * Wooden "tuk" synthesis — a pure function from parameters to PCM samples so
 * the very same code renders in the browser (into an AudioBuffer) and in Node
 * (to a WAV file for listening/tests).
 *
 * How a piece landing on a board actually sounds: a near-instant impulse
 * excites a handful of damped, inharmonic resonances (the piece + the board),
 * whose pitch sags slightly in the first few milliseconds as the contact
 * settles, on top of a ~2 ms bright contact click. So we sum a few
 * exponentially decaying sines with a fast pitch-drop and add a tiny lowpassed
 * noise tick. No sustained tones, nothing that "beeps".
 */

export interface Mode {
  /** Resonant frequency (Hz). */
  f: number;
  /** Time constant of the exponential decay (s). Higher modes should be shorter. */
  decay: number;
  /** Relative amplitude. */
  g: number;
}

export interface KnockParams {
  modes: Mode[];
  /** Initial pitch sag as a fraction (0.2 = starts 20% high, settles in ~8 ms). */
  drop: number;
  /** Contact-click level (0–1). */
  click: number;
  /** Lowpass for the click (Hz) — lower = softer felt, higher = hard wood. */
  clickTone: number;
  /** Total render length (s). */
  length: number;
  /** Peak level after normalisation (0–1). */
  peak: number;
}

/** Deterministic noise so renders are reproducible (tests, identical taps). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff * 2 - 1;
  };
}

export function renderKnock(p: KnockParams, sampleRate: number): Float32Array {
  const n = Math.max(1, Math.ceil(p.length * sampleRate));
  const out = new Float32Array(n);
  const dt = 1 / sampleRate;

  // Resonant body.
  for (const m of p.modes) {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const env = Math.exp(-t / m.decay);
      if (env < 1e-4) break;
      const f = m.f * (1 + p.drop * Math.exp(-t / 0.008));
      phase += 2 * Math.PI * f * dt;
      out[i] += m.g * env * Math.sin(phase);
    }
  }

  // Contact click: ~2 ms of noise through a one-pole lowpass.
  if (p.click > 0) {
    const rnd = lcg(12345);
    const a = Math.exp(-2 * Math.PI * p.clickTone * dt);
    let lp = 0;
    const clickLen = Math.min(n, Math.ceil(0.006 * sampleRate));
    for (let i = 0; i < clickLen; i++) {
      const t = i * dt;
      lp = (1 - a) * rnd() + a * lp;
      out[i] += p.click * lp * Math.exp(-t / 0.0012) * 3;
    }
  }

  // Soft 0.3 ms attack so there is no DC pop, then normalise to `peak`.
  const att = Math.max(1, Math.floor(0.0003 * sampleRate));
  for (let i = 0; i < att && i < n; i++) out[i] *= i / att;
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) {
    const k = p.peak / max;
    for (let i = 0; i < n; i++) out[i] *= k;
  }
  return out;
}

/** The knock library: one profile per event. Tuned as a dry, close-miked
 *  wooden piece on a wooden board — low body, short bright top. */
export const KNOCKS = {
  /** Plain move: a compact "tuk". */
  move: {
    modes: [
      { f: 205, decay: 0.040, g: 1.0 },
      { f: 610, decay: 0.026, g: 0.55 },
      { f: 1380, decay: 0.011, g: 0.30 },
      { f: 2750, decay: 0.005, g: 0.14 },
    ],
    drop: 0.22,
    click: 0.45,
    clickTone: 4500,
    length: 0.16,
    peak: 0.9,
  },
  /** Capture: heavier, lower "thock" — the piece comes down harder. */
  capture: {
    modes: [
      { f: 165, decay: 0.058, g: 1.0 },
      { f: 470, decay: 0.032, g: 0.6 },
      { f: 1150, decay: 0.013, g: 0.32 },
      { f: 2400, decay: 0.006, g: 0.16 },
    ],
    drop: 0.28,
    click: 0.7,
    clickTone: 3800,
    length: 0.2,
    peak: 1.0,
  },
  /** Check: sharper, brighter rap. */
  check: {
    modes: [
      { f: 260, decay: 0.032, g: 0.8 },
      { f: 880, decay: 0.024, g: 0.8 },
      { f: 2050, decay: 0.012, g: 0.4 },
      { f: 3900, decay: 0.005, g: 0.18 },
    ],
    drop: 0.18,
    click: 0.9,
    clickTone: 6500,
    length: 0.14,
    peak: 1.0,
  },
  /** Promotion's second tap: lighter and higher. */
  promoteTop: {
    modes: [
      { f: 320, decay: 0.03, g: 0.7 },
      { f: 980, decay: 0.022, g: 0.7 },
      { f: 2300, decay: 0.01, g: 0.35 },
    ],
    drop: 0.2,
    click: 0.5,
    clickTone: 5500,
    length: 0.14,
    peak: 0.85,
  },
} satisfies Record<string, KnockParams>;

export type KnockName = keyof typeof KNOCKS;

/** Encode mono float samples as a 16-bit PCM WAV (for the sound lab / files). */
export function toWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Uint8Array(buf);
}
