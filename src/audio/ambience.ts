/**
 * Ambience: quiet sound beds under the music, one per kind of place, made from filtered noise,
 * a few sine drones and the odd scheduled chirp. Switching crossfades over a couple of seconds.
 * It plays on the music bus (it is part of the soundtrack), a little below the tune.
 */
import { audioCtx, musicBus } from './engine';

export type Ambience = 'none' | 'map' | 'campus' | 'night' | 'rain' | 'coast' | 'lake' | 'moon' | 'space' | 'habitat';

interface Layer {
  stop(): void;
}

let current: Ambience = 'none';
let bed: { out: GainNode; layers: Layer[]; timers: number[] } | null = null;
let noiseBuf: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  // pink-ish: a running average takes the hiss off
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.92 + (Math.random() * 2 - 1) * 0.08;
    d[i] = last * 3;
  }
  return noiseBuf;
}

/** Looping filtered noise with a slow swell (wind, surf, rain, water, hum hiss). */
function noiseBed(ctx: AudioContext, out: AudioNode, type: BiquadFilterType, freq: number, q: number, vol: number, swellHz = 0, swellDepth = 0): Layer {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(out);
  let lfo: OscillatorNode | null = null;
  if (swellHz > 0) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = swellHz;
    const depth = ctx.createGain();
    depth.gain.value = vol * swellDepth;
    lfo.connect(depth);
    depth.connect(g.gain);
    lfo.start();
  }
  src.start(0, Math.random() * 1.5);
  return { stop: () => (src.stop(), lfo?.stop()) };
}

/** A soft sine drone (the data halls' hum, the dark of space). */
function drone(ctx: AudioContext, out: AudioNode, freq: number, vol: number, wobble = 0): Layer {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  o.connect(g);
  g.connect(out);
  let lfo: OscillatorNode | null = null;
  if (wobble) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const d = ctx.createGain();
    d.gain.value = wobble;
    lfo.connect(d);
    d.connect(o.frequency);
    lfo.start();
  }
  o.start();
  return { stop: () => (o.stop(), lfo?.stop()) };
}

/** Schedule little sounds now and then (birds, crickets, gulls, suit radio), every `gap` seconds or so. */
function every(ctx: AudioContext, out: AudioNode, gap: number, play: (t: number) => void, timers: number[]) {
  const loop = () => {
    play(ctx.currentTime + 0.05);
    timers.push(window.setTimeout(loop, (gap * (0.5 + Math.random())) * 1000));
  };
  timers.push(window.setTimeout(loop, gap * Math.random() * 1000));
  void out;
}

function chirp(ctx: AudioContext, out: AudioNode, t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function build(kind: Ambience, ctx: AudioContext, out: GainNode, timers: number[]): Layer[] {
  const L: Layer[] = [];
  const birds = () =>
    every(ctx, out, 3.5, (t) => {
      const f = 2400 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) chirp(ctx, out, t + k * 0.11, f, f * (1.15 + Math.random() * 0.2), 0.07, 0.025);
    }, timers);
  switch (kind) {
    case 'map':
      L.push(noiseBed(ctx, out, 'lowpass', 380, 0.5, 0.05, 0.05, 0.5));
      break;
    case 'campus':
      L.push(noiseBed(ctx, out, 'lowpass', 500, 0.6, 0.045, 0.08, 0.6), drone(ctx, out, 60, 0.012), drone(ctx, out, 120, 0.006), noiseBed(ctx, out, 'bandpass', 3200, 3, 0.006));
      birds();
      break;
    case 'night':
      L.push(noiseBed(ctx, out, 'lowpass', 420, 0.6, 0.035, 0.05, 0.5), drone(ctx, out, 60, 0.012), drone(ctx, out, 120, 0.006));
      // crickets: quick pulsed trills
      every(ctx, out, 1.6, (t) => {
        for (let k = 0; k < 4; k++) chirp(ctx, out, t + k * 0.045, 4400, 4300, 0.03, 0.012, 'triangle');
      }, timers);
      break;
    case 'rain':
      L.push(noiseBed(ctx, out, 'highpass', 1400, 0.7, 0.05), noiseBed(ctx, out, 'lowpass', 600, 0.5, 0.04, 0.03, 0.4));
      break;
    case 'coast':
      L.push(noiseBed(ctx, out, 'lowpass', 900, 0.6, 0.048, 0.11, 0.85), noiseBed(ctx, out, 'lowpass', 300, 0.5, 0.022, 0.05, 0.5));
      every(ctx, out, 7, (t) => chirp(ctx, out, t, 1500, 900, 0.35, 0.015, 'triangle'), timers);
      break;
    case 'lake':
      L.push(noiseBed(ctx, out, 'bandpass', 700, 0.9, 0.055, 0.15, 0.6), noiseBed(ctx, out, 'lowpass', 400, 0.5, 0.045, 0.04, 0.4));
      every(ctx, out, 8, (t) => (chirp(ctx, out, t, 1700, 1100, 0.25, 0.014, 'triangle'), chirp(ctx, out, t + 0.3, 1600, 1000, 0.3, 0.012, 'triangle')), timers);
      birds();
      break;
    case 'moon':
      // near silence: your own breathing gear and the suit radio
      L.push(noiseBed(ctx, out, 'lowpass', 220, 0.5, 0.02, 0.25, 0.9), drone(ctx, out, 48, 0.006));
      every(ctx, out, 9, (t) => {
        chirp(ctx, out, t, 2200, 2200, 0.04, 0.012, 'square');
        chirp(ctx, out, t + 0.6, 2200, 1900, 0.06, 0.01, 'square');
      }, timers);
      break;
    case 'space':
      L.push(drone(ctx, out, 55, 0.018, 0.6), drone(ctx, out, 82.4, 0.012, 0.4), noiseBed(ctx, out, 'lowpass', 160, 0.4, 0.02, 0.03, 0.6));
      break;
    case 'habitat':
      L.push(noiseBed(ctx, out, 'bandpass', 800, 0.8, 0.05, 0.12, 0.5), noiseBed(ctx, out, 'lowpass', 350, 0.5, 0.045));
      birds();
      break;
  }
  return L;
}

/** Ask for a sound bed; the old one fades out, the new one fades in. 'none' = silence. */
export function setAmbience(kind: Ambience): void {
  if (kind === current) return;
  current = kind;
  const ctx = audioCtx();
  const bus = musicBus();
  if (bed && ctx) {
    const old = bed;
    old.out.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    for (const t of old.timers) window.clearTimeout(t);
    window.setTimeout(() => {
      for (const l of old.layers) {
        try {
          l.stop();
        } catch {
          /* already stopped */
        }
      }
      old.out.disconnect();
    }, 3000);
  }
  bed = null;
  if (!ctx || !bus || kind === 'none' || ctx.state !== 'running') return;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.setTargetAtTime(1, ctx.currentTime, 1);
  out.connect(bus);
  const timers: number[] = [];
  bed = { out, layers: build(kind, ctx, out, timers), timers };
}

/** The bed that should be playing (resumed after the audio context unlocks). */
export function ambienceWanted(): Ambience {
  return current;
}

/** Re-create the current bed (after a user gesture unlocks audio). */
export function restartAmbience(): void {
  const k = current;
  current = 'none';
  setAmbience(k);
}
