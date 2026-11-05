/**
 * Tiny procedural sound effects with WebAudio — square/triangle blips in a chiptune spirit.
 * No audio files; every sound is a few oscillator notes.
 */
import { audioCtx, sfxBus } from './engine';

export type SoundId =
  | 'click'
  | 'select'
  | 'confirm'
  | 'error'
  | 'build'
  | 'cash'
  | 'alert'
  | 'objective'
  | 'research'
  | 'fanfare'
  | 'whoosh'
  | 'start'
  | 'page'
  // ── M5: the newer systems ──
  | 'launch'
  | 'thump'
  | 'jump'
  | 'decision'
  | 'arc'
  | 'storm'
  | 'bubble'
  | 'hello';

interface Note {
  /** A burst of filtered noise instead of a tone (rumbles, thumps, wind). */
  noise?: { type: BiquadFilterType; to?: number };
  f: number;
  t: number;
  d: number;
  type?: OscillatorType;
  slide?: number;
  vol?: number;
}

function play(notes: Note[]): void {
  const a = audioCtx();
  const bus = sfxBus();
  if (!a || !bus || a.state !== 'running') return;
  const now = a.currentTime + 0.005;
  for (const n of notes) {
    if (n.noise) {
      noiseBurst(a, bus, now + n.t, n);
      continue;
    }
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = n.type ?? 'square';
    osc.frequency.setValueAtTime(n.f, now + n.t);
    if (n.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, n.f * n.slide), now + n.t + n.d);
    const v = n.vol ?? 0.5;
    g.gain.setValueAtTime(0, now + n.t);
    g.gain.linearRampToValueAtTime(v, now + n.t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
    osc.connect(g);
    g.connect(bus);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.02);
  }
}

let noiseBuf: AudioBuffer | null = null;

/** Filtered noise, its filter sweeping from f to noise.to (a rumble, a thump, a gust). */
function noiseBurst(a: AudioContext, bus: GainNode, t: number, n: Note) {
  if (!noiseBuf || noiseBuf.sampleRate !== a.sampleRate) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = n.noise!.type;
  f.frequency.setValueAtTime(n.f, t);
  if (n.noise!.to) f.frequency.exponentialRampToValueAtTime(n.noise!.to, t + n.d);
  const g = a.createGain();
  const v = n.vol ?? 0.4;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + Math.min(0.3, n.d * 0.25));
  g.gain.exponentialRampToValueAtTime(0.001, t + n.d);
  src.connect(f);
  f.connect(g);
  g.connect(bus);
  src.start(t);
  src.stop(t + n.d + 0.05);
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

const SOUNDS: Record<SoundId, Note[]> = {
  click: [{ f: 880, t: 0, d: 0.03, vol: 0.25 }],
  select: [{ f: 660, t: 0, d: 0.04, vol: 0.3 }, { f: 990, t: 0.035, d: 0.05, vol: 0.25 }],
  confirm: [{ f: C5, t: 0, d: 0.06 }, { f: G5, t: 0.06, d: 0.09 }],
  error: [{ f: 220, t: 0, d: 0.12, type: 'sawtooth', vol: 0.3 }, { f: 165, t: 0.1, d: 0.16, type: 'sawtooth', vol: 0.3 }],
  build: [{ f: 196, t: 0, d: 0.06, type: 'triangle' }, { f: 294, t: 0.07, d: 0.06, type: 'triangle' }, { f: 392, t: 0.14, d: 0.12, type: 'triangle' }],
  cash: [{ f: 1318, t: 0, d: 0.05, vol: 0.3 }, { f: 1760, t: 0.05, d: 0.12, vol: 0.3 }],
  alert: [{ f: 740, t: 0, d: 0.1, vol: 0.35 }, { f: 554, t: 0.12, d: 0.14, vol: 0.35 }],
  objective: [{ f: C5, t: 0, d: 0.07 }, { f: E5, t: 0.07, d: 0.07 }, { f: G5, t: 0.14, d: 0.07 }, { f: C6, t: 0.21, d: 0.16 }],
  research: [{ f: 880, t: 0, d: 0.06, type: 'triangle' }, { f: 1175, t: 0.06, d: 0.06, type: 'triangle' }, { f: 1568, t: 0.12, d: 0.14, type: 'triangle' }],
  fanfare: [
    { f: 392, t: 0, d: 0.1 }, { f: 523, t: 0.1, d: 0.1 }, { f: 659, t: 0.2, d: 0.1 }, { f: 784, t: 0.3, d: 0.22 },
    { f: 659, t: 0.52, d: 0.08 }, { f: 784, t: 0.6, d: 0.4 },
    { f: 196, t: 0, d: 0.5, type: 'triangle', vol: 0.4 }, { f: 262, t: 0.5, d: 0.5, type: 'triangle', vol: 0.4 },
  ],
  whoosh: [{ f: 300, t: 0, d: 0.25, type: 'triangle', slide: 3, vol: 0.25 }],
  start: [{ f: 262, t: 0, d: 0.12, type: 'triangle' }, { f: 392, t: 0.12, d: 0.12, type: 'triangle' }, { f: 523, t: 0.24, d: 0.25, type: 'triangle' }],
  page: [{ f: 1200, t: 0, d: 0.025, type: 'triangle', vol: 0.2 }, { f: 1600, t: 0.025, d: 0.03, type: 'triangle', vol: 0.15 }],
  // a rocket: the roar builds and rolls off, with a low growl under it
  launch: [
    { noise: { type: 'lowpass', to: 900 }, f: 120, t: 0, d: 3.2, vol: 0.5 },
    { f: 55, t: 0, d: 3, type: 'sawtooth', slide: 0.6, vol: 0.12 },
    { noise: { type: 'bandpass', to: 300 }, f: 2200, t: 0.4, d: 2.4, vol: 0.12 },
  ],
  // the mass driver: a clack, a deep thump, a fading whine
  thump: [{ f: 90, t: 0, d: 0.35, type: 'sine', slide: 0.4, vol: 0.6 }, { noise: { type: 'highpass' }, f: 3000, t: 0, d: 0.05, vol: 0.2 }, { f: 1400, t: 0.05, d: 0.6, type: 'triangle', slide: 2.5, vol: 0.05 }],
  // years pass: a rising sweep with a shimmer on top
  jump: [{ noise: { type: 'bandpass', to: 4000 }, f: 400, t: 0, d: 1.1, vol: 0.25 }, { f: 523, t: 0.3, d: 0.4, type: 'triangle', vol: 0.15 }, { f: 784, t: 0.5, d: 0.5, type: 'triangle', vol: 0.15 }, { f: 1046, t: 0.7, d: 0.7, type: 'triangle', vol: 0.12 }],
  // a big decision: two low notes and a held question
  decision: [{ f: 147, t: 0, d: 0.5, type: 'triangle', vol: 0.45 }, { f: 196, t: 0.25, d: 0.5, type: 'triangle', vol: 0.45 }, { f: 587, t: 0.5, d: 0.9, type: 'triangle', vol: 0.18 }, { f: 554, t: 0.5, d: 0.9, type: 'square', vol: 0.05 }],
  // a swarm arc lights: a sparkling climb
  arc: [{ f: 1046, t: 0, d: 0.12, type: 'triangle', vol: 0.18 }, { f: 1318, t: 0.07, d: 0.12, type: 'triangle', vol: 0.18 }, { f: 1568, t: 0.14, d: 0.12, type: 'triangle', vol: 0.18 }, { f: 2093, t: 0.21, d: 0.4, type: 'triangle', vol: 0.15 }, { noise: { type: 'highpass' }, f: 6000, t: 0.2, d: 0.5, vol: 0.05 }],
  // the storm arrives: a falling howl of static
  storm: [{ noise: { type: 'bandpass', to: 200 }, f: 3000, t: 0, d: 2.2, vol: 0.35 }, { f: 220, t: 0, d: 2, type: 'sawtooth', slide: 0.5, vol: 0.08 }],
  // campus life: a soft pop for a speech bubble, a cheerful "hi" for an advisor
  bubble: [{ f: 1800, t: 0, d: 0.04, type: 'sine', slide: 1.4, vol: 0.1 }],
  hello: [{ f: 660, t: 0, d: 0.07, type: 'triangle', vol: 0.25 }, { f: 880, t: 0.08, d: 0.12, type: 'triangle', vol: 0.25 }],
};

export function sfx(id: SoundId): void {
  play(SOUNDS[id]);
}
