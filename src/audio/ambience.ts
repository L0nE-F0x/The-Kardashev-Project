/**
 * Ambience: a living sound bed under the music, one per kind of place. Each is a few layers of filtered noise whose
 * level and colour wander (three slow sines that never line up, so nothing loops audibly), plus things that happen
 * now and then, each a little different every time: birds, a far car, an owl, thunder, a wave, a voice on the suit
 * radio. Beds cross-fade when the place changes. It has its own bus (Settings → Audio → Ambience).
 */
import { audioCtx, audioRunning, freeWhenDone, glide, mixBus, noiseBuffer, onPump, voiceFilter } from './engine';
import { seeded } from './score';

export type Ambience = 'none' | 'map' | 'campus' | 'night' | 'rain' | 'coast' | 'lake' | 'moon' | 'space' | 'habitat';

/** Per-bed trim, set by measurement so every place sits at about the same loudness (rain a little over, space under). */
const LEVEL: Record<Exclude<Ambience, 'none'>, number> = { map: 1, campus: 2, night: 1.95, rain: 1.1, coast: 0.85, lake: 1.9, moon: 3.1, space: 0.8, habitat: 1.05 };

/** Where each bed's low cut sits (Hz); 110 unless named. */
const FLOOR: Partial<Record<Ambience, number>> = { rain: 55, coast: 65, moon: 80, space: 38 };

type Rnd = () => number;

/** What a bed's layers are built from. */
interface Bed {
  ctx: BaseAudioContext;
  r: Rnd;
  /** Close sounds (mostly dry) and far ones (quieter, mostly hall). */
  near: GainNode;
  far: GainNode;
  /** Everything to stop and disconnect when the bed goes. */
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  /** Things that happen now and then: `fire(t)` plays one and returns the seconds until the next. */
  events: { next: number; fire: (t: number) => number }[];
}

let current: Ambience = 'none';
let bed: { fades: GainNode[]; b: Bed; off: () => void } | null = null;
let builds = 0;
let waiting = false;

// ── continuous layers ───────────────────────────────────────────────────────────────────────
/** A slow, never-repeating wobble between −1 and 1: three sines at rates that share no common period. */
function wander(b: Bed, rate: number): AudioNode {
  const sum = b.ctx.createGain();
  for (const [mul, amp] of [[1, 0.5], [1.63, 0.3], [2.71, 0.2]]) {
    const o = b.ctx.createOscillator();
    o.frequency.value = rate * mul * (0.9 + b.r() * 0.2);
    const g = b.ctx.createGain();
    g.gain.value = amp;
    o.connect(g);
    g.connect(sum);
    o.start();
    b.sources.push(o);
    b.nodes.push(g);
  }
  b.nodes.push(sum);
  return sum;
}

/** Let a wobble move a parameter by ±`depth`. */
function sway(b: Bed, from: AudioNode, param: AudioParam, depth: number) {
  const g = b.ctx.createGain();
  g.gain.value = depth;
  from.connect(g);
  g.connect(param);
  b.nodes.push(g);
}

/**
 * Looping noise through a filter: wind, rain, sea, air, fans. `move` (a wobble) swells its level by ±`swell`
 * (a share of the level) and bends its filter by ±`bend` cents.
 */
function wash(b: Bed, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, freq: number, q: number, level: number, o: { to?: AudioNode; move?: AudioNode; swell?: number; bend?: number; pan?: number } = {}) {
  const { ctx } = b;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(kind);
  src.loop = true;
  const f = voiceFilter(ctx);
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(f);
  f.connect(g);
  b.nodes.push(f, g);
  if (o.move) {
    if (o.swell) sway(b, o.move, g.gain, level * o.swell);
    if (o.bend) sway(b, o.move, f.detune, o.bend);
  }
  let tail: AudioNode = g;
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    g.connect(p);
    b.nodes.push(p);
    tail = p;
  }
  tail.connect(o.to ?? b.near);
  src.start(0, b.r() * 5);
  b.sources.push(src);
}

/** A steady tone (mains hum, a pump), its level breathing a little if given a wobble. */
function hum(b: Bed, freq: number, level: number, move?: AudioNode) {
  const o = b.ctx.createOscillator();
  o.frequency.value = freq;
  const g = b.ctx.createGain();
  g.gain.value = level;
  if (move) sway(b, move, g.gain, level * 0.4);
  o.connect(g);
  g.connect(b.near);
  o.start();
  b.sources.push(o);
  b.nodes.push(g);
}

/** The data halls from outside: fans (two bands of air), the transformers' hum and its octave. */
function halls(b: Bed, level: number, move: AudioNode) {
  wash(b, 'pink', 'bandpass', 310, 1.1, level, { move, swell: 0.25 });
  wash(b, 'pink', 'bandpass', 1250, 0.8, level * 0.3, { move, swell: 0.3, pan: 0.3 });
  hum(b, 60, level * 0.5, move);
  hum(b, 120, level * 0.22);
}

// ── baked loops (made once: far cheaper than scheduling thousands of tiny voices) ───────────
const loops = new Map<string, AudioBuffer>();

function baked(ctx: BaseAudioContext, name: 'crickets' | 'drops' | 'stream'): AudioBuffer {
  const key = `${name}@${ctx.sampleRate}`;
  let buf = loops.get(key);
  if (buf) return buf;
  const sr = ctx.sampleRate, len = sr * 6;
  buf = ctx.createBuffer(2, len, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const r = seeded(name.length * 131);
  /** A sine blip with a raised-cosine shape, panned; never across the loop point. */
  const blip = (at: number, dur: number, f0: number, f1: number, amp: number, pan: number) => {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    if (i0 + n >= len) return;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      ph += (2 * Math.PI * (f0 + (f1 - f0) * k)) / sr;
      const v = Math.sin(ph) * amp * 0.5 * (1 - Math.cos(2 * Math.PI * k));
      L[i0 + i] += v * Math.min(1, 1 - pan);
      R[i0 + i] += v * Math.min(1, 1 + pan);
    }
  };
  if (name === 'crickets') {
    // four crickets, each with its own pitch, tempo and place: three quick pulses a chirp
    for (const [f, every, amp, pan] of [[4350, 0.61, 0.5, -0.7], [4720, 0.74, 0.36, 0.6], [5080, 0.53, 0.24, 0.15], [3980, 0.92, 0.2, -0.2]]) {
      for (let t = r() * every; t < 6; t += every * (0.96 + r() * 0.08)) {
        const a = amp * (0.7 + r() * 0.3);
        for (let p = 0; p < 3; p++) blip(t + p * 0.034, 0.022, f, f * 0.985, a, pan);
      }
    }
  } else if (name === 'drops') {
    // rain close by: hundreds of small taps, a few fat ones
    for (let k = 0; k < 520; k++) {
      const fat = r() < 0.08;
      blip(r() * 5.95, fat ? 0.03 : 0.006 + r() * 0.008, fat ? 600 + r() * 500 : 2200 + r() * 4200, fat ? 380 : 1800 + r() * 2500, (fat ? 0.5 : 0.3) * r() ** 2 + 0.03, r() * 1.8 - 0.9);
    }
  } else {
    // a brook: a crowd of little rising bloops
    for (let k = 0; k < 700; k++) {
      const f = 420 + r() ** 2 * 1700;
      blip(r() * 5.95, 0.018 + r() * 0.04, f, f * (1.15 + r() * 0.5), 0.05 + 0.2 * r() ** 3, r() * 1.2 - 0.6);
    }
  }
  loops.set(key, buf);
  return buf;
}

function loop(b: Bed, name: 'crickets' | 'drops' | 'stream', level: number, to: AudioNode = b.near) {
  const src = b.ctx.createBufferSource();
  src.buffer = baked(b.ctx, name);
  src.loop = true;
  const g = b.ctx.createGain();
  g.gain.value = level;
  src.connect(g);
  g.connect(to);
  src.start(0, b.r() * 5);
  b.sources.push(src);
  b.nodes.push(g);
}

// ── things that happen ──────────────────────────────────────────────────────────────────────
/** A one-shot voice: an oscillator or noise through an optional filter, shaped by `shape` (a gain curve over `dur`). */
function shot(b: Bed, t: number, dur: number, shape: Float32Array, o: { wave?: OscillatorType; freq?: Float32Array | number; noise?: 'white' | 'pink' | 'brown'; filter?: [BiquadFilterType, number, number]; sweep?: number; pan?: number; panTo?: number; to?: AudioNode }) {
  const { ctx } = b;
  let src: AudioScheduledSourceNode;
  if (o.noise) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(o.noise);
    n.loop = true;
    n.start(t, b.r() * 5);
    src = n;
  } else {
    const osc = ctx.createOscillator();
    osc.type = o.wave ?? 'sine';
    if (typeof o.freq === 'number') osc.frequency.value = o.freq;
    else if (o.freq) osc.frequency.setValueCurveAtTime(o.freq, t, dur);
    osc.start(t);
    src = osc;
  }
  src.stop(t + dur + 0.05);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueCurveAtTime(shape, t, dur);
  const nodes: AudioNode[] = [g];
  let tail: AudioNode = src;
  if (o.filter) {
    const f = voiceFilter(ctx);
    f.type = o.filter[0];
    f.frequency.setValueAtTime(o.filter[1], t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.filter[2];
    tail.connect(f);
    tail = f;
    nodes.push(f);
  }
  tail.connect(g);
  tail = g;
  if (o.pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(o.pan, t);
    if (o.panTo !== undefined) p.pan.linearRampToValueAtTime(o.panTo, t + dur);
    tail.connect(p);
    tail = p;
    nodes.push(p);
  }
  tail.connect(o.to ?? b.far);
  freeWhenDone(src, ...nodes);
}

/** Gain curves: `arc` swells and falls (peak at `at`, 0..1); `pulses` is a few bumps; both start and end at zero. */
function arc(peak: number, at = 0.3, n = 32): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    c[i] = peak * (k < at ? Math.sin((Math.PI / 2) * (k / at)) ** 2 : Math.cos((Math.PI / 2) * ((k - at) / (1 - at))) ** 2);
  }
  return c;
}

function line(...v: number[]): Float32Array {
  return new Float32Array(v);
}

/** A bird: one of four calls, at a random place and distance. */
function bird(b: Bed, t: number, level: number) {
  const { r } = b;
  const pan = r() * 1.6 - 0.8, vol = level * (0.4 + r() * 0.6), kind = r();
  if (kind < 0.4) {
    // a run of quick rising chirps
    const f = 2600 + r() * 1700, n = 2 + Math.floor(r() * 4), up = 1.15 + r() * 0.25;
    for (let k = 0; k < n; k++) shot(b, t + k * (0.1 + r() * 0.03), 0.07, arc(vol, 0.25, 12), { freq: line(f, f * up), pan });
  } else if (kind < 0.65) {
    // a warble: one long note trembling
    const f = 2100 + r() * 1200, dur = 0.35 + r() * 0.3, curve = new Float32Array(26);
    for (let i = 0; i < curve.length; i++) curve[i] = f * (i % 2 ? 1.09 : 0.93) * (1 + (i / curve.length) * 0.08);
    shot(b, t, dur, arc(vol * 0.9, 0.2), { freq: curve, pan });
  } else if (kind < 0.88) {
    // two notes, the second lower: "fee-bee"
    const f = 3000 + r() * 800;
    shot(b, t, 0.24, arc(vol, 0.2, 16), { freq: line(f, f * 0.99), pan });
    shot(b, t + 0.3, 0.32, arc(vol * 0.9, 0.2, 16), { freq: line(f * 0.84, f * 0.82), pan });
  } else {
    // a dove, low and round
    const f = 470 + r() * 80;
    for (let k = 0; k < 2 + Math.floor(r() * 2); k++) shot(b, t + k * 0.55, 0.42, arc(vol * 1.2, 0.35), { freq: line(f, f * 1.06, f * 0.94), pan });
  }
}

/** A car on the far road: a band of noise swelling and passing from one side to the other. */
function car(b: Bed, t: number, level: number) {
  const dir = b.r() < 0.5 ? -1 : 1, dur = 7 + b.r() * 4;
  shot(b, t, dur, arc(level * (0.6 + b.r() * 0.4), 0.5, 48), { noise: 'pink', filter: ['lowpass', 420 + b.r() * 200, 0.5], sweep: 380, pan: -0.9 * dir, panTo: 0.9 * dir });
}

/** Thunder, far off: a crack that isn't sharp, then the roll, bumping and fading. */
function thunder(b: Bed, t: number, level: number) {
  const dur = 5 + b.r() * 3, c = new Float32Array(72);
  for (let i = 1; i < c.length - 1; i++) {
    const k = i / c.length;
    c[i] = level * Math.min(1, k * 16) * Math.exp(-k * 3.4) * (0.55 + 0.45 * b.r());
  }
  shot(b, t, dur, c, { noise: 'brown', filter: ['lowpass', 260 + b.r() * 120, 0.5], sweep: 70, pan: b.r() * 1.2 - 0.6 });
}

/** A wave coming in: it gathers, breaks (the filter opens), and hisses back down the sand. */
function wave(b: Bed, t: number, level: number) {
  const dur = 6.5 + b.r() * 2.5, side = b.r() * 1.2 - 0.6, vol = level * (0.6 + b.r() * 0.4);
  shot(b, t, dur, arc(vol, 0.38, 48), { noise: 'pink', filter: ['lowpass', 420, 0.6], sweep: 2600, pan: side, panTo: side * 0.3, to: b.near });
  shot(b, t + dur * 0.36, dur * 0.64, arc(vol * 0.5, 0.12, 32), { noise: 'white', filter: ['highpass', 2800, 0.5], sweep: 5200, pan: side * 0.5, to: b.near });
}

function build(kind: Exclude<Ambience, 'none'>, b: Bed) {
  const { r } = b;
  const every = (first: number, fire: (t: number) => number) => b.events.push({ next: b.ctx.currentTime + first, fire });
  const slow = wander(b, 0.045), gusts = wander(b, 0.11);
  // wind is air moving, not rumble: a body, a gust that whistles a little, and whatever it stirs (leaves, grass)
  const wind = (level: number, tone = 1, leaves = 0.1) => {
    wash(b, 'pink', 'lowpass', 520 * tone, 0.5, level, { move: slow, swell: 0.55, bend: 500 });
    wash(b, 'pink', 'bandpass', 820 * tone, 0.8, level * 0.3, { move: gusts, swell: 0.85, bend: 700, pan: -0.3 });
    if (leaves) wash(b, 'pink', 'highpass', 2600, 0.5, level * leaves, { move: gusts, swell: 0.9, pan: 0.3 });
  };
  const birds = (gap: number, level = 0.05) =>
    every(0.6 + r() * 2, (t) => {
      bird(b, t, level);
      return gap * (0.4 + r() * 1.2);
    });
  const traffic = (first: number, gap: number, level = 0.1) =>
    every(first, (t) => {
      car(b, t, level);
      return gap * (0.6 + r() * 0.9);
    });
  switch (kind) {
    case 'map':
      // the world from high up: thin wind, and air moving far below
      wind(0.2, 0.8, 0);
      wash(b, 'pink', 'bandpass', 1900, 0.5, 0.02, { move: gusts, swell: 0.7, bend: 900, pan: 0.3 });
      break;
    case 'campus':
      wind(0.12);
      halls(b, 0.03, slow);
      birds(3.4);
      traffic(4 + r() * 4, 20);
      break;
    case 'night':
      wind(0.085, 0.85, 0.05);
      halls(b, 0.032, slow);
      loop(b, 'crickets', 0.055, b.far);
      traffic(9 + r() * 6, 42, 0.07);
      // an owl, twice, somewhere out past the fence
      every(6 + r() * 5, (t) => {
        const f = 350 + r() * 40, pan = r() * 1.4 - 0.7;
        for (const [dt, len] of [[0, 0.3], [0.48, 0.5]]) shot(b, t + dt, len, arc(0.09, 0.3), { freq: line(f, f * 1.03, f * 0.93), pan });
        return 26 + r() * 30;
      });
      break;
    case 'rain':
      // rain is three sounds: the hiss in the air, the drumming on roofs, and the drops by your feet
      wash(b, 'pink', 'highpass', 1500, 0.5, 0.075, { move: slow, swell: 0.2 });
      wash(b, 'white', 'bandpass', 5600, 0.6, 0.022, { move: gusts, swell: 0.3, pan: 0.3 });
      wash(b, 'pink', 'lowpass', 480, 0.5, 0.1, { move: gusts, swell: 0.4 });
      loop(b, 'drops', 0.3);
      halls(b, 0.014, slow);
      every(5 + r() * 3, (t) => {
        thunder(b, t, 0.55);
        return 19 + r() * 24;
      });
      break;
    case 'coast':
      wash(b, 'brown', 'lowpass', 300, 0.5, 0.12, { move: slow, swell: 0.4 });
      wind(0.07, 1.2, 0);
      every(0.5, (t) => {
        wave(b, t, 0.12);
        return 5.5 + r() * 3.5;
      });
      // gulls: a few falling cries, thin and far
      every(3 + r() * 4, (t) => {
        const f = 1500 + r() * 400, pan = r() * 1.6 - 0.8, n = 2 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) shot(b, t + k * 0.42, 0.34, arc(0.05, 0.25), { wave: 'sawtooth', freq: line(f * 0.85, f * 1.12, f * 0.72), filter: ['bandpass', 1900, 4], pan });
        return 10 + r() * 14;
      });
      break;
    case 'lake':
      wind(0.11);
      // water against the quay: small, irregular laps
      every(0.4, (t) => {
        shot(b, t, 0.7 + r() * 0.5, arc(0.08 + r() * 0.06, 0.3), { noise: 'pink', filter: ['bandpass', 650 + r() * 500, 1.2], sweep: 1300, pan: r() * 1.4 - 0.7, to: b.near });
        return 1.3 + r() * 1.9;
      });
      birds(5, 0.04);
      break;
    case 'moon': {
      // no air, so no world: only the suit. Its pump, your own breath, and now and then the radio
      wash(b, 'pink', 'bandpass', 230, 2, 0.05, { move: slow, swell: 0.2 });
      hum(b, 100, 0.005, slow);
      wash(b, 'white', 'bandpass', 2600, 1.5, 0.004);
      every(0.8, (t) => {
        shot(b, t, 1.5, arc(0.03, 0.55), { noise: 'pink', filter: ['bandpass', 950, 0.8], to: b.near });
        shot(b, t + 1.9, 2.1, arc(0.04, 0.25), { noise: 'pink', filter: ['bandpass', 560, 0.8], to: b.near });
        return 4.6 + r() * 0.6;
      });
      every(4 + r() * 3, (t) => {
        // the Apollo "Quindar" tones bracket a transmission; between them, a voice too far to make out
        const len = 1.1 + r() * 1.3, talk = new Float32Array(Math.ceil(len * 9) + 2);
        for (let i = 1; i < talk.length - 1; i++) talk[i] = r() < 0.2 ? 0 : 0.03 + r() * 0.05;
        shot(b, t, 0.25, arc(0.035, 0.1, 12), { freq: 2525, pan: 0.4, to: b.near });
        shot(b, t + 0.32, len, talk, { noise: 'pink', filter: ['bandpass', 1100 + r() * 500, 1.6], pan: 0.4, to: b.near });
        shot(b, t + 0.4 + len, 0.25, arc(0.035, 0.1, 12), { freq: 2475, pan: 0.4, to: b.near });
        return 13 + r() * 12;
      });
      break;
    }
    case 'space':
      // a drone with no pitch you could name: noise ringing in two low resonances, a thin band of solar wind above
      wash(b, 'brown', 'bandpass', 92, 3, 0.2, { move: slow, swell: 0.4, bend: 300 });
      wash(b, 'brown', 'bandpass', 165, 4, 0.14, { move: gusts, swell: 0.6, bend: 500, pan: -0.4 });
      wash(b, 'pink', 'bandpass', 2300, 0.8, 0.012, { move: slow, swell: 0.8, bend: 1400, pan: 0.4 });
      break;
    case 'habitat':
      // parkland inside a turning drum: a breeze, a brook, birds with a roof over them, the hull's slow hum
      wind(0.06, 1.1);
      loop(b, 'stream', 0.2);
      wash(b, 'brown', 'bandpass', 110, 2, 0.1, { move: slow, swell: 0.3 });
      hum(b, 48, 0.02, slow);
      birds(2.4, 0.06);
      break;
  }
}

/** Ask for a sound bed; the old one fades out, the new one fades in. 'none' = silence. */
export function setAmbience(kind: Ambience): void {
  if (kind === current) return;
  current = kind;
  try {
    const ctx = audioCtx();
    const bus = mixBus('amb');
    if (bed && ctx) {
      const old = bed;
      const killAt = ctx.currentTime + 4;
      for (const f of old.fades) glide(f.gain, 0, ctx.currentTime, 0.7);
      old.off();
      const off = onPump((_until, now) => {
        if (now < killAt) return;
        off();
        for (const s of old.b.sources) {
          s.stop();
          s.disconnect();
        }
        for (const n of [...old.b.nodes, old.b.near, old.b.far, ...old.fades]) n.disconnect();
      });
    }
    bed = null;
    if (!ctx || !bus || kind === 'none') return;
    if (!audioRunning()) {
      // not unlocked yet, or suspended: the pump only turns while audio runs, so it builds the bed the moment it does
      if (!waiting) {
        waiting = true;
        const off = onPump(() => {
          off();
          waiting = false;
          restartAmbience();
        });
      }
      return;
    }
    // near: mostly dry; far: softer and mostly hall. Both fade as one
    const near = ctx.createGain(), far = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), farDry = ctx.createGain(), nearWet = ctx.createGain();
    farDry.gain.value = 0.55;
    nearWet.gain.value = 0.12;
    // nothing outdoors needs the bottom octave: it only eats headroom (thunder, surf and the void keep more of it)
    const floor = voiceFilter(ctx);
    floor.type = 'highpass';
    floor.frequency.value = FLOOR[kind] ?? 110;
    floor.Q.value = 0.5;
    near.connect(floor);
    near.connect(nearWet);
    nearWet.connect(wet);
    far.connect(farDry);
    farDry.connect(floor);
    far.connect(wet);
    floor.connect(dry);
    dry.connect(bus.dry);
    wet.connect(bus.rev);
    const b: Bed = { ctx, r: seeded(kind.length * 977 + builds++ * 7919), near, far, sources: [], nodes: [farDry, nearWet, floor], events: [] };
    for (const f of [dry, wet]) {
      f.gain.value = 0;
      f.gain.setTargetAtTime(LEVEL[kind], ctx.currentTime, 0.9);
    }
    build(kind, b);
    const off = onPump((until, now) => {
      for (const e of b.events)
        while (e.next < until) {
          // a stalled timer: let the missed ones go rather than play them all at once
          const gap = e.next > now - 0.05 ? e.fire(Math.max(e.next, now + 0.01)) : 1 + b.r() * 3;
          e.next = Math.max(e.next, now) + gap;
        }
    });
    bed = { fades: [dry, wet], b, off };
  } catch {
    // never let a sound bed break the game
    bed = null;
  }
}

/** Re-create the current bed (after a user gesture unlocks audio). */
export function restartAmbience(): void {
  const k = current;
  current = 'none';
  setAmbience(k);
}

let lastLook = 0;

/**
 * The 3D campus doesn't choose its own bed (the pixel diorama does): ask the scene which one its place, weather and
 * hour call for, once a second. A scene with no `ambience()` is left alone.
 */
export function ambienceForScene(scene: unknown): void {
  const t = performance.now();
  if (t - lastLook < 1000) return;
  lastLook = t;
  const bed = (scene as { ambience?: () => Ambience } | null)?.ambience?.();
  if (bed) setAmbience(bed);
}
