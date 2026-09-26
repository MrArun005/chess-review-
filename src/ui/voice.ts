/**
 * The puzzle coach's voice: the browser's built-in speech synthesis (Web
 * Speech API) — no audio files, no network. On by default; the choice is
 * remembered on this device. Browsers without speechSynthesis stay silent.
 */

const KEY = 'cr-voice';

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

let on = readOn();

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/** Prefer a natural-sounding English voice when the platform offers one. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  return (
    voices.find((v) => /natural|neural/i.test(v.name)) ??
    voices.find((v) => /google|samantha|aria|jenny|daniel|serena/i.test(v.name)) ??
    voices.find((v) => v.localService) ??
    voices[0] ??
    null
  );
}

export const voice = {
  supported,
  isOn: () => on,
  setOn(v: boolean) {
    on = v;
    if (!v) voice.stop();
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
  /** Say `text`, cutting off anything still being said. */
  say(text: string) {
    if (!on || !supported() || !text.trim()) return;
    const s = window.speechSynthesis;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? 'en-US';
    u.rate = 1.03;
    s.speak(u);
  },
  stop() {
    if (supported()) window.speechSynthesis.cancel();
  },
};
