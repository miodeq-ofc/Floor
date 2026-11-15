// Dźwięki The Floor — generowane na żywo (bez plików i bez muzyki w tle).
// Web Audio nie wymaga pobierania assetów, więc działa też z GitHub Pages.
const STORAGE_KEY = 'floor:sound';
let ctx = null;
let enabled = true;
try {
  enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
} catch {}

function audio() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, duration, { type = 'sine', gain = 0.04, when = 0, slideTo = null } = {}) {
  const c = audio();
  if (!c) return;
  const start = c.currentTime + when;
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(30, freq), start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), start + duration);
  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.linearRampToValueAtTime(gain, start + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(vol);
  vol.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function noise(duration = 0.08, gain = 0.025) {
  const c = audio();
  if (!c) return;
  const frames = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = c.createBufferSource();
  const vol = c.createGain();
  src.buffer = buffer;
  vol.gain.setValueAtTime(gain, c.currentTime);
  src.connect(vol);
  vol.connect(c.destination);
  src.start();
}

export const Sound = {
  unlock() {
    audio();
  },

  isEnabled() {
    return enabled;
  },

  toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {}
    if (enabled) audio();
    return enabled;
  },

  // Cichy tik zegara — dokładnie w rytmie widocznego licznika.
  tick(urgent = false) {
    tone(urgent ? 1320 : 920, 0.028, { type: 'square', gain: urgent ? 0.028 : 0.016 });
    noise(0.018, urgent ? 0.012 : 0.008);
  },

  // Odliczanie 3-2-1 przed pojedynkiem.
  countdown(step) {
    tone(step <= 1 ? 760 : 520, 0.12, { type: 'triangle', gain: 0.05 });
  },

  correct() {
    tone(660, 0.11, { type: 'sine', gain: 0.045 });
    tone(880, 0.12, { type: 'sine', gain: 0.045, when: 0.1 });
    tone(1320, 0.22, { type: 'sine', gain: 0.035, when: 0.22 });
  },

  pass() {
    tone(440, 0.1, { type: 'triangle', gain: 0.035 });
    tone(554, 0.14, { type: 'triangle', gain: 0.03, when: 0.09 });
  },
};
