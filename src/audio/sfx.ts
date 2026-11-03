/**
 * Tiny procedural sound effects with WebAudio — square/triangle blips in a chiptune spirit.
 * No audio files; every sound is a few oscillator notes.
 */
import { audioCtx, sfxBus } from './engine';

type SoundId =
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
  | 'page';

interface Note {
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
};

export function sfx(id: SoundId): void {
  play(SOUNDS[id]);
}
