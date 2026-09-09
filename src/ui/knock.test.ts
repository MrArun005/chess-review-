import { describe, it, expect } from 'vitest';
import { KNOCKS, renderKnock, toWav, type KnockName } from './knock';

const SR = 48000;
const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

describe('knock synthesis', () => {
  for (const name of Object.keys(KNOCKS) as KnockName[]) {
    it(`${name} is a short, clean, decaying tap`, () => {
      const p = KNOCKS[name];
      const s = renderKnock(p, SR);
      expect(s.length).toBe(Math.ceil(p.length * SR));
      let peak = 0;
      for (const x of s) {
        expect(Number.isFinite(x)).toBe(true);
        peak = Math.max(peak, Math.abs(x));
      }
      expect(peak).toBeCloseTo(p.peak, 3);
      // No pop: first sample is silent.
      expect(Math.abs(s[0])).toBeLessThan(0.05);
      // Energy is front-loaded and gone by the end (a tap, not a tone).
      const w = Math.floor(0.01 * SR);
      const head = rms(s.subarray(0, w));
      const tail = rms(s.subarray(s.length - w));
      expect(tail).toBeLessThan(head * 0.05);
    });
  }

  it('renders deterministically', () => {
    const a = renderKnock(KNOCKS.move, SR);
    const b = renderKnock(KNOCKS.move, SR);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('encodes a valid WAV header', () => {
    const s = renderKnock(KNOCKS.move, SR);
    const w = toWav(s, SR);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...w.subarray(8, 12))).toBe('WAVE');
    expect(w.length).toBe(44 + s.length * 2);
  });
});
