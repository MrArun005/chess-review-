// Tiny self-contained sound layer using the Web Audio API — no audio files, so
// nothing to bundle and no CSP/cross-origin concerns. Distinct cues for a plain
// move, a capture, and a check, plus a persisted mute toggle.
//
// Browsers block audio until a user gesture; we lazily create/resume the
// AudioContext on first play, which in practice follows a click or keypress.

let ctx: AudioContext | null = null;
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
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

interface Blip {
  freq: number;
  durMs: number;
  type?: OscillatorType;
  gain?: number;
}

function blip({ freq, durMs, type = 'triangle', gain = 0.06 }: Blip): void {
  if (muted) return;
  const c = audioCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const amp = c.createGain();
  const now = c.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
  osc.connect(amp);
  amp.connect(c.destination);
  osc.start(now);
  osc.stop(now + durMs / 1000);
}

export const sound = {
  move() {
    blip({ freq: 300, durMs: 70, type: 'triangle', gain: 0.05 });
  },
  capture() {
    blip({ freq: 170, durMs: 95, type: 'square', gain: 0.06 });
  },
  check() {
    blip({ freq: 540, durMs: 130, type: 'sine', gain: 0.06 });
  },
  /** Pick the right cue from a SAN string. */
  forSan(san: string) {
    if (/[+#]/.test(san)) this.check();
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
