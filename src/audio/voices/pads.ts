/**
 * Pads: the score's sustained beds and voices (v0.15.5, score v3). Five instruments, all from standard nodes:
 *
 *   makeStringMachine  the Solina / ARP string ensemble: phase-locked divide-down saws (16' 8' 4'), a soft tone
 *                      filter and the three-line ensemble that is the whole sound (city pop, disco strings)
 *   makeStrings        a synth string section: three or four players a note over the section's steady core, each a
 *                      bowed saw with its own bow position, intonation and vibrato, through a wooden body's
 *                      resonances; a bowed attack with rosin, a bite on hard strokes, swells from nothing, slurs
 *   makeChoir          an airy choir: singers through a formant tract (male and female) over the section's steady
 *                      core, breath shaped by the same vowel, gentle late vibrato, vowel morphs, a head voice the
 *                      sopranos fade into
 *   makeGlassPad       Act V light: bright additive glass in three groups of partials, each breathing at its own slow
 *                      rate, a crystal onset and a faint inharmonic ring
 *   makeWarmPad        an analogue polysynth pad: two saws a voice card whose phases wander but never cancel, a sub
 *                      triangle under the chord, a 4-pole low-pass per voice that opens slowly, a Juno's chorus
 *
 * What things cost, measured in WebKitGTK (the desktop app's engine, and the slower one): an automation event is
 * about a microsecond, a value curve 45 µs plus a third of a microsecond a point (its values cross the bindings one
 * by one), a node 20–40 µs, a PeriodicWave 25–55 ms. So every envelope and pitch path here is a few dozen
 * breakpoints joined by the engine's own linear ramps, dense where the shape moves (an attack, a bite, a scoop) and
 * sparse where it doesn't; vibrato and phasing are LFO oscillators per note; every wave is made once per context in
 * the factory, never per note. Unison voices never beat through silence: a section's lowest two harmonics, where the
 * beating of near-identical sines is deepest, are one steady core oscillator a note, and the players and singers
 * carry the harmonics above, where dozens of them only shimmer. Voices start and end at exact zero, start their
 * oscillators a random fraction of a cycle early under a closed gain, stop themselves and free their nodes.
 */
import { freeWhenDone, voiceFilter } from '../engine';
import { mtof, pan, type Rnd, type Strip } from '../synth';
import { cachedBuffer, noiseGen } from './buffers';
import type { Lab } from './lab';

// ── shared helpers ──────────────────────────────────────────────────────────────────────────
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
/** Smoothstep: a gentle S from 0 to 1 over x = 0..1. */
const sRise = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** An RC charge reaching 1 at x = 1: quick off the mark, easing in (an analogue envelope's attack). */
const rcRise = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : (1 - Math.exp(-3.4 * x)) / (1 - Math.exp(-3.4)));
/** An RC discharge: 1 at y = 0, −60 dB at y = 1. */
const fall = (y: number) => (y <= 0 ? 1 : Math.exp(-6.9 * y));
const TAU = Math.PI * 2;
/** Cents per unit of ln(frequency ratio): a deviation of δ Hz on f is LN2C·δ/f cents. */
const LN2C = 1200 / Math.LN2;
/** A note is held at most this long (a longer drone is two notes). */
const MAX_DUR = 240;

/** Every note function's guard: a NaN time, length or velocity would put NaN into the automation. */
const bad = (t: number, dur: number, vel: number) => !Number.isFinite(t) || !Number.isFinite(dur) || !Number.isFinite(vel);
const finiteNotes = (notes: number[]) => notes.filter((m) => Number.isFinite(m));
/** A finite number, or 0. */
const fin = (v: number) => (v - v === 0 ? v : 0);

/** A sine table: `sinT(x)` = sin(2πx), x in turns, a lookup and a line. */
const SIN_N = 4096;
const SIN = new Float64Array(SIN_N + 1).map((_, i) => Math.sin((TAU * i) / SIN_N));
function sinT(x: number): number {
  const p = (x - Math.floor(x)) * SIN_N;
  const i = p | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (p - i);
}

// ── automation: breakpoints joined by the engine's own ramps ────────────────────────────────
/** Where an attack is pinned (shares of its length): dense at first, then spreading past its end. */
const RISE = [0.04, 0.1, 0.17, 0.25, 0.35, 0.47, 0.6, 0.75, 0.9, 1.05, 1.25];
/** Where a release is pinned (shares of its length to −60 dB). */
const FALL = [0.03, 0.08, 0.15, 0.24, 0.35, 0.48, 0.63, 0.8, 1];
/** Where a scoop or a quick decay is pinned (multiples of its time constant). */
const DECAY = [0.25, 0.6, 1.1, 1.9, 3.2];
/** Where a glide is pinned (shares of its length). */
const GLIDE = [0.15, 0.3, 0.45, 0.6, 0.75, 1];

/** Knot times `from + x·by`. */
const span = (ks: readonly number[], by: number, from = 0) => ks.map((x) => from + x * by);

/** Times evenly inside (a, b), about `step` apart (at most 400). */
function every(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  if (!(b > a) || !(step > 0)) return out;
  const n = Math.min(400, Math.floor((b - a) / step));
  for (let i = 1; i <= n; i++) out.push(a + ((b - a) * i) / (n + 1));
  return out;
}

/** Knot times: merged, sorted, kept inside (0, len) at least 2 ms apart, then `len` itself. */
function knots(len: number, ...groups: (number | number[])[]): number[] {
  const all = ([] as number[]).concat(...groups).filter((s) => s - s === 0);
  all.sort((x, y) => x - y);
  const out: number[] = [];
  let last = 0;
  for (const s of all) if (s >= last + 0.002 && s <= len - 0.002) out.push((last = s));
  out.push(len);
  return out;
}

/** Closes a gain envelope early: from `at`, on its own path, down to zero over `fade` seconds. */
type Closer = (at: number, fade: number) => void;

/**
 * A gain from `t`: zero before and at `t`, `f` at each knot (seconds from `t`), the engine's linear ramps between,
 * exact zero at the last knot. The zero before `t` is pinned at time 0, never at `currentTime` (`.value =` would put
 * an event there, inside a note a stalled main thread is already playing). Returns its closer: a slur or the next
 * chord fades it out from wherever it is, exactly on its path, so nothing steps.
 */
function gainEnv(p: AudioParam, t: number, ks: number[], f: (s: number) => number): Closer {
  const n = ks.length, vs = new Array<number>(n);
  for (let i = 0; i < n - 1; i++) vs[i] = fin(f(ks[i]));
  vs[n - 1] = 0;
  p.setValueAtTime(0, 0);
  p.setValueAtTime(0, t);
  for (let i = 0; i < n; i++) p.linearRampToValueAtTime(vs[i], t + ks[i]);
  return (at, fade) => {
    const s = at - t;
    if (s >= ks[n - 1]) return;
    let v = 0;
    if (s > 0) {
      let i = 0;
      while (ks[i] < s) i++;
      const s0 = i ? ks[i - 1] : 0, v0 = i ? vs[i - 1] : 0;
      v = v0 + ((vs[i] - v0) * (s - s0)) / (ks[i] - s0);
    }
    const from = Math.max(at, t);
    p.cancelScheduledValues(from);
    p.linearRampToValueAtTime(v, from);
    p.linearRampToValueAtTime(0, from + fade);
  };
}

/** Any other parameter (or several sharing one path): `f(0)` before `t`, `f` at each knot, ramps between. */
function paramEnv(ps: AudioParam | AudioParam[], t: number, ks: number[], f: (s: number) => number): void {
  const v0 = fin(f(0)), vs = ks.map((s) => fin(f(s)));
  for (const p of Array.isArray(ps) ? ps : [ps]) {
    p.setValueAtTime(v0, 0);
    p.setValueAtTime(v0, t);
    for (let i = 0; i < ks.length; i++) p.linearRampToValueAtTime(vs[i], t + ks[i]);
  }
}

/**
 * Sources and nodes of one call (a chord): started as they are made, each stopped when its own sound has died (or
 * all at `end`), freed together when the last has stopped. `cut(at)` stops everything still running at `at` (a chord
 * cut short by the next one: its gains are closed by then, so nothing is heard stopping).
 */
class Notes {
  private srcs: { s: AudioScheduledSourceNode; stop: number }[] = [];
  private nodes: AudioNode[] = [];
  private last = Infinity;
  add<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  /** Start `s` at `at` (from `offset` in a buffer); `stop` = when it is silent, if before the chord's end. */
  src<T extends AudioScheduledSourceNode>(s: T, at: number, offset?: number, stop = Infinity): T {
    if (offset !== undefined && s instanceof AudioBufferSourceNode) s.start(Math.max(0, at), offset);
    else s.start(Math.max(0, at));
    this.srcs.push({ s, stop });
    return s;
  }
  end(t: number): void {
    if (!this.srcs.length) return;
    this.last = t;
    let lastSrc = this.srcs[0];
    for (const x of this.srcs) {
      x.stop = Math.min(x.stop, t);
      x.s.stop(x.stop);
      if (x.stop >= lastSrc.stop) lastSrc = x;
    }
    // freed by the source that stops last (a cut keeps the order: every stop moves to min(its own, the cut))
    freeWhenDone(lastSrc.s, ...this.srcs.filter((x) => x !== lastSrc).map((x) => x.s), ...this.nodes);
  }
  cut(at: number): void {
    if (at >= this.last) return;
    for (const x of this.srcs)
      if (x.stop > at) {
        try {
          x.s.stop(at);
          x.stop = at;
        } catch {
          // an engine that refuses a second stop() lets it run on, silent behind its closed gain
        }
      }
  }
}

/** An oscillator on a wave (or a plain sine) whose detune is read once a block (ramps and LFOs drive it). */
function oscOn(ctx: BaseAudioContext, w: PeriodicWave | 'sine', f: number): OscillatorNode {
  const o = ctx.createOscillator();
  if (w !== 'sine') o.setPeriodicWave(w as PeriodicWave);
  o.frequency.value = f;
  o.detune.automationRate = 'k-rate';
  return o;
}

/** Start an oscillator up to one cycle before `t` (its gain is shut until then): a free-running phase. */
const early = (t: number, f: number, r: Rnd) => t - r() / Math.max(f, 20);

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q: number, gain = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

/** A chain of nodes, connected in order; returns [first, last]. */
function chain(...ns: AudioNode[]): [AudioNode, AudioNode] {
  for (let i = 0; i + 1 < ns.length; i++) ns[i].connect(ns[i + 1]);
  return [ns[0], ns[ns.length - 1]];
}

/**
 * A wave from its partials (`amp(n)` = the amplitude of harmonic n, `phase(n)` its phase, sine phase by default).
 * The browser normalises a wave's peak to 1: `peak` is the raw sum's peak (a gain of `peak` gives each partial its
 * `amp`), `k` = peak / RMS (a gain of `k` gives the wave unit RMS), so waves of any shape mix at known levels.
 * Cached per context and key: WebKit takes 25–55 ms to build one.
 */
interface Wave {
  w: PeriodicWave;
  k: number;
  peak: number;
}
const waves = new WeakMap<BaseAudioContext, Map<string, Wave>>();
function waveOf(ctx: BaseAudioContext, key: string, count: number, amp: (n: number) => number, phase?: (n: number) => number): Wave {
  let m = waves.get(ctx);
  if (!m) waves.set(ctx, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  // x(θ) = Σ real[n]·cos nθ + imag[n]·sin nθ = Σ a·sin(nθ + φ)
  const real = new Float32Array(count + 1), imag = new Float32Array(count + 1);
  let ms = 0;
  for (let n = 1; n <= count; n++) {
    const a = amp(n), ph = phase ? phase(n) : 0;
    real[n] = a * Math.sin(ph);
    imag[n] = a * Math.cos(ph);
    ms += (a * a) / 2;
  }
  // the browser scales the table so its peak is 1: find that peak the same way (sin nθ, cos nθ by recurrence)
  const N = 2048;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const th = (TAU * i) / N, c2 = 2 * Math.cos(th);
    let s0 = 0, s1 = Math.sin(th), k0 = 1, k1 = Math.cos(th);
    let x = imag[1] * s1 + real[1] * k1;
    for (let n = 2; n <= count; n++) {
      const sn = c2 * s1 - s0, cn = c2 * k1 - k0;
      x += imag[n] * sn + real[n] * cn;
      s0 = s1;
      s1 = sn;
      k0 = k1;
      k1 = cn;
    }
    peak = Math.max(peak, Math.abs(x));
  }
  const w: Wave = { w: ctx.createPeriodicWave(real, imag), k: peak / Math.sqrt(ms), peak };
  m.set(key, w);
  return w;
}

/**
 * A stiff string's dispersion: harmonic n's phase ∝ n², so the saw's corner arrives as a chirp a few percent of a
 * period long instead of one sample (the bow's width and the string's stiffness round the real corner). The ear
 * hears the same tone; the waveform has no razor edge to tick in a low note. `spread` = the share of a period.
 */
const stiff = (count: number, spread: number) => (n: number) => (TAU * spread * n * n) / count;

/** A one-pole high-pass / low-pass and an RBJ band-pass for the noise models (in place). */
function onePole(d: Float32Array, sr: number, hz: number, high: boolean): void {
  const a = Math.exp((-TAU * hz) / sr);
  let y = 0, x1 = 0;
  for (let i = 0; i < d.length; i++) {
    if (high) {
      y = a * (y + d[i] - x1);
      x1 = d[i];
    } else y = d[i] * (1 - a) + y * a;
    d[i] = y;
  }
}
function bandPass(d: Float32Array, sr: number, hz: number, q: number): void {
  const w0 = (TAU * hz) / sr, al = Math.sin(w0) / (2 * q), c = Math.cos(w0);
  const a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
}

/** Fold a loop's seam: what would have followed the end fades into the start (a looping noise never ticks). */
function loopable(d: Float32Array, len: number, fold: number): number {
  for (let i = 0; i < fold; i++) {
    const k = i / fold;
    d[i] = d[i] * Math.sqrt(k) + d[len + i] * Math.sqrt(1 - k);
  }
  return len;
}

function peakNormalise(d: Float32Array, n: number, to = 0.9): void {
  let p = 0;
  for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(d[i]));
  if (p > 0) for (let i = 0; i < n; i++) d[i] *= to / p;
}

/** A looping noise source at a random place in its buffer. */
function noiseSrc(ctx: BaseAudioContext, buf: AudioBuffer, r: Rnd): { src: AudioBufferSourceNode; offset: number } {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return { src, offset: r() * buf.duration * 0.95 };
}

/** Slow wander for a voice: two incommensurate sines (cents, or a share of level), seeded per voice. */
function wander(r: Rnd, depth: number, lo = 0.07, hi = 0.4): (s: number) => number {
  const f1 = lerp(lo, hi * 0.6, r()), f2 = lerp(lo * 2, hi, r()), p1 = r(), p2 = r(), w = 0.6 + r() * 0.4;
  const a1 = depth * 0.62 * w, a2 = depth * 0.62 * (1 - w * 0.5);
  return (s) => a1 * sinT(f1 * s + p1) + a2 * sinT(f2 * s + p2);
}

/**
 * A vibrato for the voices of one note: a sine LFO whose rate wanders a few percent from breath to breath (no
 * player's vibrato is a metronome) into a gain whose level is the depth in cents, arriving from `delay` over `ramp`
 * seconds. Connect the gain to the voices' detunes (two of these a note: voices on one, the other or both). It
 * stops with the note.
 */
function vibratoLfo(ctx: BaseAudioContext, g: Notes, r: Rnd, t: number, len: number, rate: number, depth: number, delay: number, ramp: number): GainNode {
  const o = ctx.createOscillator();
  o.frequency.automationRate = 'k-rate';
  const wob = 0.035 + r() * 0.04;
  paramEnv(o.frequency, t, knots(len, every(0, len, 0.8 + r() * 0.6)), (s) => rate * (s > 0 ? 1 + wob * (r() * 2 - 1) : 1));
  g.src(o, t - r() / rate, undefined, t + len + 0.02);
  const d = g.add(ctx.createGain());
  const p = d.gain, on = t + Math.max(0, delay);
  p.setValueAtTime(0, 0);
  p.setValueAtTime(0, on);
  if (ramp > 0.01) for (const q of [0.25, 0.5, 0.75, 1]) p.linearRampToValueAtTime(depth * sRise(q), on + ramp * q);
  else p.linearRampToValueAtTime(depth, on + 0.01);
  o.connect(d);
  return d;
}

// ── 1. the string machine ───────────────────────────────────────────────────────────────────
export interface StringMachineOpts {
  /** Footages, the stops of the real thing: 16', 8' and 4' levels (0..1). Default 8' with a bright 4' (violins). */
  feet?: [number, number, number];
  /** Crescendo (seconds to full level at vel 0.5; harder notes speak sooner). */
  attack?: number;
  /** Sustain: the release, seconds to silence. */
  release?: number;
  /** Brightness: scales the tone filter (0.6 dark viola … 1.3 bright violin). */
  tone?: number;
  /** The ensemble's depth (0 = a bare organ-like divide-down, 1 = the Solina's, up to 1.5). */
  ensemble?: number;
  /** The track's `k.onStop` (demos: `lab.onStop`): the ensemble's six LFOs stop with the track. */
  onStop: (fn: () => void) => void;
}

/**
 * The string machine's ensemble, after the Solina's: three delay lines, each swept by a slow and a fast LFO, the
 * lines 120° apart, all wet (no dry path: a dry copy beside a swept one is a flanger's jet). Line A is left, line B
 * right and line C in the middle at half their level, so no channel holds two equal copies and the mono sum holds
 * three unequal ones: each side shimmers (its own chorus of pitch, ±5 cents slow and ±7 quick) instead of sweeping a
 * deep comb, and a held note keeps its level within about a decibel. Made once.
 */
function ensemble(ctx: BaseAudioContext, dest: AudioNode, depth: number): { input: GainNode; nodes: AudioNode[]; stop: () => void } {
  const input = ctx.createGain();
  const nodes: AudioNode[] = [input];
  const oscs: OscillatorNode[] = [];
  const RATE = 0.63, DELAY = 0.0068, SLOW = 0.00075 * depth, FAST = 0.00011 * depth;
  ([[-0.92, 1], [0.92, 1], [0, 0.5]] as const).forEach(([side, level], l) => {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = DELAY;
    for (const [hz, dep] of [[RATE, SLOW], [RATE * 9.5, FAST]]) {
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = dep;
      o.connect(g);
      g.connect(d.delayTime);
      // 120° apart: each line's LFOs start a third of a cycle after the last one's
      o.start(ctx.currentTime + ((l / 3) / hz) * 0.999);
      oscs.push(o);
      nodes.push(g);
    }
    const g = ctx.createGain();
    g.gain.value = level;
    const p = pan(ctx, side);
    input.connect(d);
    d.connect(g);
    g.connect(p);
    p.connect(dest);
    nodes.push(d, g, p);
  });
  return { input, nodes, stop: () => oscs.forEach((x) => x.stop()) };
}

/**
 * The Solina / ARP String Ensemble: every key a divide-down saw from one master oscillator, so all octaves are
 * phase-locked and nothing beats on its own; the life is the ensemble (above), made once for the instrument. A soft
 * low-pass per chord opens with the velocity and blooms a little through the crescendo; a fixed body (high-pass, a
 * warm mid hump, a gentle top) is shared. Chords: `(t, notes, dur, vel)`. Register: F2–C7; best C3–G5.
 */
export function makeStringMachine(ctx: BaseAudioContext, s: Strip, r: Rnd, o: StringMachineOpts) {
  const { feet = [0, 1, 0.62], tone = 1, ensemble: depth = 1 } = o;
  const attack = Math.max(0.005, o.attack ?? 0.14), release = Math.max(0.02, o.release ?? 1.1);
  const ens = ensemble(ctx, s.in, clamp(depth, 0, 1.5));
  o.onStop?.(ens.stop);
  const hp = biquad(ctx, 'highpass', 72, -3);
  const warm = biquad(ctx, 'peaking', 820, 0.8, 2.5);
  const top = biquad(ctx, 'lowpass', 7600, -2);
  const [input] = chain(hp, warm, top, ens.input);
  s.nodes.push(hp, warm, top, ...ens.nodes);
  const [a16, a8, a4] = feet;
  const low = a16 > 0;
  // one oscillator a key: the footages summed into one phase-locked wave at the lowest footage's pitch. Every
  // footage's own staircase saw lacks the harmonics a 4-stage divider can't make (every 16th): authentic, inaudible
  const wave = waveOf(ctx, `sm:${feet.join(',')}`, 192, (j) => {
    let a = 0;
    const own = (h: number) => (h % 16 === 0 ? 0.15 : 1) / h / (1 + (h / 48) ** 2);
    // each footage a whole saw (its fundamental at its level), counted in the lowest footage's harmonics
    if (low) {
      a += a16 * own(j);
      if (j % 2 === 0) a += a8 * own(j / 2);
      if (j % 4 === 0) a += a4 * own(j / 4);
    } else {
      a += a8 * own(j);
      if (j % 2 === 0) a += a4 * own(j / 2);
    }
    return a;
  }, stiff(192, 0.3));
  return (t: number, notes: number[], dur: number, vel: number) => {
    if (bad(t, dur, vel)) return;
    notes = finiteNotes(notes);
    const n = notes.length;
    if (!n) return;
    t = Math.max(0, t);
    const v = clamp(vel, 0, 1);
    dur = clamp(dur, 0.04, MAX_DUR);
    const g = new Notes();
    // the crescendo: soft notes swell in, hard ones speak at once
    const a = Math.min(attack * lerp(1.7, 0.45, v), 0.02 + dur * 0.5) * (0.9 + r() * 0.2);
    const rel = release * (0.55 + 0.45 * Math.min(1, dur / 0.6));
    const len = dur + rel + 0.03;
    // the tone filter: velocity opens it, a crescendo blooms it, the release darkens it
    const hi = Math.max(...notes);
    const cut = clamp(tone * (1500 + 5600 * v ** 1.35) * (1 + Math.max(0, hi - 74) / 28), 500, 15000);
    const lp = g.add(voiceFilter(ctx));
    lp.type = 'lowpass';
    lp.Q.value = -1.5;
    const bloom = a * 1.6 + 0.05;
    paramEnv(lp.frequency, t, knots(len, span([0.1, 0.25, 0.45, 0.7, 1], bloom), dur, span([0.15, 0.4, 0.7, 1], rel, dur)), (u) =>
      cut * (0.7 + 0.3 * rcRise(u / bloom)) * (0.65 + 0.35 * fall(Math.max(0, u - dur) / rel)),
    );
    lp.connect(input);
    // a 4-note chord as loud as one note; low keys a touch fuller, high keys thinner, as on the real thing
    const lvl = (0.142 * (0.3 + 0.7 * v ** 1.1) * wave.k) / Math.sqrt(n);
    for (const m of notes) {
      const f = mtof(m) / (low ? 2 : 1);
      const x = g.src(oscOn(ctx, wave.w, f), early(t, f, r));
      const vca = g.add(ctx.createGain());
      const key = lvl * (1 + clamp((64 - m) / 72, -0.3, 0.05)) * (0.93 + r() * 0.14);
      // fingers never land together: a few milliseconds between the keys of a chord
      const d = r() * 0.007;
      gainEnv(vca.gain, t, knots(len, d, span(RISE, a, d), dur, span(FALL, rel, dur)), (u) => {
        const on = u - d;
        if (on <= 0) return 0;
        return key * rcRise(Math.min(on, dur) / a) * fall((u - dur) / rel);
      });
      x.connect(vca);
      vca.connect(lp);
    }
    g.end(t + len + 0.02);
  };
}

// ── 2. the string section ───────────────────────────────────────────────────────────────────
export interface StringsOpts {
  /** Seconds to full tone at vel 0.5 (harder bows bite sooner). */
  attack?: number;
  /** The bow leaving the string: seconds to silence (shorter for short notes). */
  release?: number;
  /** Players a note (2–6; a single note, a line, has at most three). */
  players?: number;
  /** How far apart the left and right desks sit (0..1). */
  width?: number;
  /** Scales the bowing brightness. */
  bright?: number;
  /** Scales the vibrato (1 = a warm section vibrato; 0 = senza vibrato). */
  vibrato?: number;
  /** The rosin: the bow's noise on the attack and under the tone (0..2). */
  rosin?: number;
}

/**
 * A synth string section. Each note is the section's core (its first two harmonics, one steady oscillator: the
 * players' own would beat through silence every second or two) and `players` bowed saws carrying the harmonics
 * above (Helmholtz motion: a saw, its harmonics at the bow's position thinned; four bow positions round-robin), each
 * player with their own tuning, entry, scoop into the note and drift, on two desks left and right (low notes lean
 * right, high ones left, as an orchestra sits). The note's two vibratos arrive late, each at its own wandering rate:
 * a player takes one, the other or both, the core the gentler one. Each desk's low-pass is the bow: a hard attack
 * bites bright (an accent of a few dB that settles in a tenth of a second), a soft one opens slowly, and the
 * brightness breathes with the bow's pressure. The body is fixed and shared, a wooden box's resonances (the air mode,
 * the main wood, the nasal dip, the bridge hill), so formants stay put as the notes move; rosin noise scrapes on a
 * hard attack and hisses under the tone.
 *
 * `(t, notes, dur, vel, swell = 0, legato = false)`: `swell` > 0 grows the chord from soft to `vel` across its length
 * (1 = from nothing: the bow lands softly, whatever the chord grows to), < 0 fades it; `legato` slurs from the chord
 * that ends about now (within 0.4 s): no new bite, players slide from the nearest note they were on, that chord
 * stops. A legato note with no chord ending at its start is played as a fresh stroke, and chords still held (a pad
 * under a line) are never cut: one instrument can carry a held pad and a slurred line over it. Register: C2–C7; the
 * sweet range G3–E6.
 */
export function makeStrings(ctx: BaseAudioContext, s: Strip, r: Rnd, o: StringsOpts = {}) {
  const { players = 4, width = 0.62, bright = 1, vibrato: vib = 1, rosin = 1 } = o;
  const attack = Math.max(0.005, o.attack ?? 0.3), release = Math.max(0.02, o.release ?? 0.5);
  const P = clamp(Math.round(players), 2, 6);
  // the body: fixed resonances every note passes through, the size of a violin's peaks and dips
  const bodyIn = ctx.createGain();
  const body = [
    biquad(ctx, 'highpass', 48, -3),
    biquad(ctx, 'peaking', 280, 2.5, 5), // the air cavity: warmth
    biquad(ctx, 'peaking', 460, 3, 4), // the main wood resonance
    biquad(ctx, 'peaking', 700, 2, -3),
    biquad(ctx, 'peaking', 1400, 1.5, -5), // the nasal region a saw has too much of
    biquad(ctx, 'peaking', 2600, 1.2, 6), // the bridge hill: silk
    biquad(ctx, 'peaking', 4500, 2, -4),
    biquad(ctx, 'lowpass', 9500, -2),
  ];
  chain(bodyIn, ...body, s.in);
  const desks = [pan(ctx, -width), pan(ctx, width)];
  for (const d of desks) d.connect(bodyIn);
  s.nodes.push(bodyIn, ...body, ...desks);
  // four bow positions (from the bridge: 1/β = 6.6 … 11.4): the harmonics there are thinned, never quite gone. The
  // waves carry harmonic 3 up; `full` = the RMS of the whole saw (fundamental at amp(1)), `a1`, `a2` its first two
  const bows = [6.6, 8.1, 9.6, 11.4].map((ib, i) => {
    const amp = (n: number) => (0.3 + 0.7 * Math.abs(Math.sin((Math.PI * n) / ib)) ** 0.7) / n / (1 + (n / 52) ** 2);
    let ms = 0;
    for (let n = 1; n <= 160; n++) ms += amp(n) ** 2 / 2;
    return { ...waveOf(ctx, `str2:${i}`, 160, (n) => (n < 3 ? 0 : amp(n)), stiff(160, 0.18 + i * 0.03)), full: Math.sqrt(ms), a1: amp(1), a2: amp(2) };
  });
  // the core: the fundamental and the second harmonic in the bows' ratio (0.645 at every bow position)
  const core = waveOf(ctx, 'str2:core', 2, (n) => (n === 1 ? 1 : 0.645));
  // rosin: band noise with grain (the stick-slip is never perfect)
  const rosinBuf = cachedBuffer(ctx, 'pads:rosin', 1.65, (d, sr) => {
    const len = Math.floor(1.6 * sr), fold = d.length - len;
    const rnd = noiseGen(4242);
    let grain = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % 64 === 0) grain = 0.55 + 0.45 * Math.abs(rnd());
      d[i] = rnd() * grain;
    }
    bandPass(d, sr, 3400, 0.8);
    onePole(d, sr, 1100, true);
    loopable(d, len, fold);
    peakNormalise(d, len);
    return len;
  });
  /** Chords still sounding: a slur takes the one ending about now and leaves the held ones alone. */
  let sounding: { notes: number[]; off: number; end: number; cut: (at: number) => void }[] = [];

  return (t: number, notes: number[], dur: number, vel: number, swell = 0, legato = false) => {
    if (bad(t, dur, vel)) return;
    notes = finiteNotes(notes);
    const n = notes.length;
    if (!n) return;
    t = Math.max(0, t);
    const v = clamp(vel, 0, 1);
    dur = clamp(dur, 0.05, MAX_DUR);
    const g = new Notes();
    sounding = sounding.filter((c) => c.end > t);
    // a slur needs a chord ending about now (not long gone, not held on under this one); the fingers change, so the
    // old notes stop within a tenth of a second instead of ringing on under the new ones
    let from: (typeof sounding)[number] | null = null;
    if (legato) for (const c of sounding) if (Math.abs(c.off - t) < 0.4 && (!from || Math.abs(c.off - t) < Math.abs(from.off - t))) from = c;
    const slur = from !== null;
    const prev = from ? from.notes : null;
    if (from) {
      from.cut(t + 0.035);
      sounding = sounding.filter((c) => c !== from);
    }
    // every gain of the chord, for a slur that stops it
    const closers: Closer[] = [];
    const sw = clamp(swell, -1, 1);
    // how hard the bow lands: a swell from nothing starts soft, whatever it grows to (the target `v` sets the tone)
    const v0 = v * (sw > 0 ? 1 - 0.82 * sw : 1);
    // soft strokes lean in, hard ones bite; short notes are bowed shorter (spiccato): the attack fits the note
    const a = Math.min(slur ? Math.min(0.09, attack * 0.35) : attack * lerp(1.55, 0.36, v0), 0.025 + dur * 0.45);
    const bite = slur ? 0 : 0.32 * clamp((v0 - 0.5) / 0.5, 0, 1);
    const rel = release * (0.35 + 0.65 * Math.min(1, dur / 0.7));
    const len = dur + rel + 0.06;
    sounding.push({
      notes: [...notes],
      off: t + dur,
      end: t + len,
      cut: (at) => {
        for (const c of closers) c(at, 0.1);
        g.cut(at + 0.12);
      },
    });
    // the dynamic across the note: a crescendo from (1 − 0.82·swell) to 1, or a fade to (1 − 0.7·|swell|)
    const dyn = (u: number) => {
      const x = clamp(u / dur, 0, 1);
      return sw >= 0 ? 1 - 0.82 * sw * (1 - sRise(x * 1.15)) : 1 - 0.7 * -sw * sRise(x);
    };
    // a stroke's gain (a player's or the core's): the rise (a bitten one with its accent on top: it peaks at 0.6 of
    // the attack, gone with τ 80 ms), the dynamic, the bow lifting at `off`
    const stroke = (pk: number, enter: number, off: number, bump: number, tp: number): [number[], (u: number) => number] => [
      knots(
        len,
        enter,
        span(RISE, a, enter),
        bump > 0 ? [enter + tp * 0.5, enter + tp, ...span([0.5, 1, 2, 3.5], 0.08, enter + tp)] : [],
        sw ? every(enter + a * 1.25, off, Math.max(0.25, dur / 8)) : [],
        off,
        span(FALL, rel, off),
      ),
      (u) => {
        const on = u - enter;
        if (on <= 0) return 0;
        const h = Math.min(on, off - enter);
        let at = rcRise(h / a) * (1 - bite * 0.5) + sRise(h / a) * bite * 0.5;
        if (bump > 0) at += bump * (on < tp ? sRise(on / tp) : Math.exp(-(on - tp) / 0.08));
        return pk * at * dyn(Math.min(u, off)) ** 1.15 * fall((u - off) / rel);
      },
    ];
    // the desks' low-pass: brightness from the bow (the flash of a bitten attack, then the dynamic), breathing a
    // little with the bow's pressure
    const hiNote = Math.max(...notes);
    const C = clamp(bright * (1300 + 5400 * v ** 1.3) * (1 + Math.max(0, hiNote - 78) / 24), 400, 14000);
    const open = a * 1.4 + 0.02;
    const dk = knots(len, [0.01, 0.025, 0.05, 0.08, 0.12, 0.17, 0.23], span(RISE, open), every(open * 1.25, dur, 0.45), dur, span([0.2, 0.5, 1], rel * 1.5, dur));
    const deskLp = desks.map((d) => {
      const f = g.add(voiceFilter(ctx));
      f.type = 'lowpass';
      f.Q.value = -1;
      const press = wander(r, 0.07, 0.1, 0.45);
      paramEnv(f.frequency, t, dk, (u) => {
        const op = slur ? 1 : lerp(0.45 + 0.55 * sRise(u / open), 1 + 0.7 * Math.exp(-u / 0.07), bite / 0.32);
        const out = 0.6 + 0.4 * fall(Math.max(0, u - dur) / (rel * 1.5));
        return clamp(C * op * (0.42 + 0.58 * dyn(Math.min(u, dur))) * out * (1 + press(u)), 250, 16000);
      });
      f.connect(d);
      return f;
    });
    // a line is three players a note; big chords are dense already: one player fewer a note from five notes up
    const PP = n === 1 ? Math.min(P, 3) : n >= 5 ? Math.max(2, P - 1) : P;
    const lvl = (0.172 * (0.28 + 0.72 * v ** 1.15)) / Math.sqrt(n * PP);
    // the vibrato: arriving once the bow has settled (at once on a slur, carried over from the last note)
    const vd = vib * (8 + 9 * v);
    notes.forEach((m, j) => {
      const f = mtof(m);
      const x = clamp((m - 64) / 18, -1, 1);
      // the nearest note this desk was on (a slur slides from it)
      let slide = 0;
      if (prev) {
        let best = 99;
        for (const pm of prev) if (Math.abs(pm - m) < Math.abs(best)) best = pm - m;
        slide = Math.abs(best) <= 7 ? best : 0;
      }
      const vDelay = slur ? 0 : 0.22 + r() * 0.25 + a * 0.4, vRamp = slur ? 0.15 : 0.5;
      const lfoA = vd > 0 ? vibratoLfo(ctx, g, r, t, len, 5 + r() * 1.3, vd * (0.62 + r() * 0.16), vDelay, vRamp) : null;
      const lfoB = vd > 0 ? vibratoLfo(ctx, g, r, t, len, 5 + r() * 1.3, vd * (0.9 + r() * 0.25), vDelay + (slur ? 0 : r() * 0.2), vRamp) : null;
      // the section sags and recovers together on this note (the core too); each player wanders a little of their own
      const drift = wander(r, 1.8);
      const bitBump = (0.6 * bite) / 0.32;
      let c1 = 0, cEnter = 0, cScoop = 0;
      for (let p = 0; p < PP; p++) {
        const bw = bows[(p + j) % bows.length];
        const osc = g.src(oscOn(ctx, bw.w, f), early(t, f, r));
        const amp = g.add(ctx.createGain());
        // where this player sits: spread across the desks, the register leaning the section left or right
        const spread = PP > 1 ? (p / (PP - 1)) * 2 - 1 : 0;
        const pos = spread * 0.8 - 0.35 * x;
        const desk = deskLp[pos < 0 ? 0 : 1];
        const tune = spread * 7 * (0.6 + r() * 0.8) + (r() - 0.5) * 3;
        const enter = slur ? r() * 0.012 : r() * lerp(0.035, 0.012, v0);
        const leave = (r() - 0.3) * 0.03;
        // the player's scale: their whole saw's harmonics at A·amp(n), the first two given to the core
        const A = (lvl * (0.88 + r() * 0.24)) / bw.full;
        c1 += (A * bw.a1) ** 2;
        cEnter += enter / PP;
        const bump = bitBump * (0.75 + r() * 0.5), tp = 0.6 * a * (0.85 + r() * 0.3);
        const offP = dur + leave;
        closers.push(gainEnv(amp.gain, t, ...stroke(A * bw.peak, enter, offP, bump, tp)));
        // intonation: a scoop into the note (or a slide from the last one), a hair flat as the bow lifts
        const glide = slide && p % 3 !== 2 ? 0.05 + r() * 0.07 + (p % 2) * 0.05 : 0;
        const scoop = slur ? 0 : -(4 + r() * 10) * (0.5 + v0 * 0.7), sc = 0.045 + r() * 0.06;
        cScoop += (scoop * sc) / PP;
        const own = wander(r, 1.3);
        paramEnv(osc.detune, t, knots(len, scoop ? span(DECAY, sc) : [], glide ? span(GLIDE, glide) : [], every(0.25, len, 0.7), offP, offP + rel * 0.5), (u) => {
          let c = tune + drift(u) + own(u);
          if (scoop) c += scoop * Math.exp(-u / sc);
          if (glide) c += slide * 100 * (1 - sRise(u / glide));
          // the release: a hair flat as the bow lifts
          if (u > offP) c -= 3 * sRise((u - offP) / rel);
          return c;
        });
        if (lfoA && p % 3 !== 1) lfoA.connect(osc.detune);
        if (lfoB && p % 3 !== 0) lfoB.connect(osc.detune);
        osc.connect(amp);
        amp.connect(desk);
      }
      // the core: as loud as the players' first two harmonics add up to, steady, into both desks; the section's
      // drift, its average entry and scoop, the gentler vibrato
      const co = g.src(oscOn(ctx, core.w, f), early(t, f, r));
      const cg = g.add(ctx.createGain());
      closers.push(gainEnv(cg.gain, t, ...stroke(Math.sqrt(c1 / 2) * core.peak, cEnter, dur, bitBump, 0.6 * a)));
      const csc = 0.075, cs = cScoop / csc, cGlide = slide ? 0.1 : 0;
      paramEnv(co.detune, t, knots(len, cs ? span(DECAY, csc) : [], cGlide ? span(GLIDE, cGlide) : [], every(0.25, len, 0.7), dur, dur + rel * 0.5), (u) => {
        let c = drift(u);
        if (cs) c += cs * Math.exp(-u / csc);
        if (cGlide) c += slide * 100 * (1 - sRise(u / cGlide));
        if (u > dur) c -= 3 * sRise((u - dur) / rel);
        return c;
      });
      if (lfoA) lfoA.connect(co.detune);
      co.connect(cg);
      cg.connect(deskLp[0]);
      cg.connect(deskLp[1]);
    });
    // rosin: a scrape on a bitten attack, a hiss under the tone that follows the dynamic
    if (rosin > 0) {
      const { src, offset } = noiseSrc(ctx, rosinBuf, r);
      const ng = g.add(ctx.createGain());
      const scrape = slur ? 0 : rosin * 0.05 * v0 ** 1.6 * dyn(0), hiss = rosin * 0.009 * (0.35 + 0.65 * v);
      const hr = a + 0.05, hrel = rel * 0.6;
      const ks = knots(len, scrape ? [0.002, 0.004, 0.008, 0.016, 0.035, 0.06, 0.1, 0.16, 0.25, 0.35] : [], span(RISE, hr), sw ? every(hr * 1.25, dur, Math.max(0.25, dur / 8)) : [], dur, span(FALL, hrel, dur));
      closers.push(
        gainEnv(ng.gain, t, ks, (u) => {
          const b = scrape * (1 - Math.exp(-u / 0.004)) * Math.exp(-u / 0.075);
          const h = hiss * sRise(u / hr) * dyn(Math.min(u, dur)) * fall((u - dur) / hrel);
          return b + h;
        }),
      );
      g.src(src, t - 0.01, offset);
      src.connect(ng);
      ng.connect(bodyIn);
    }
    g.end(t + len + 0.02);
  };
}

// ── 3. the choir ────────────────────────────────────────────────────────────────────────────
export type ChoirVowel = 'oo' | 'ah' | 'oh' | 'ee';

/**
 * Formants of sung vowels (F1–F4 Hz, levels dB, bandwidths Hz): men from tenors and basses (their singer's formant
 * at F3–F4 eased 4 dB: a choir blends, a soloist rings), women from sopranos and altos (bandwidths widened for their
 * sparse high harmonics).
 */
const FORMANTS: Record<'m' | 'f', Record<ChoirVowel, { F: number[]; dB: number[]; BW: number[] }>> = {
  m: {
    ah: { F: [625, 1060, 2450, 2700], dB: [0, -6.5, -12, -13], BW: [75, 85, 115, 125] },
    oh: { F: [400, 775, 2500, 2700], dB: [0, -10.5, -19.5, -20], BW: [45, 80, 105, 120] },
    oo: { F: [350, 600, 2550, 2790], dB: [0, -20, -27, -25], BW: [45, 70, 100, 120] },
    ee: { F: [270, 1810, 2700, 3150], dB: [0, -16, -19.5, -23], BW: [50, 90, 100, 120] },
  },
  f: {
    ah: { F: [800, 1150, 2850, 3700], dB: [0, -5, -22, -26], BW: [130, 145, 190, 210] },
    oh: { F: [450, 800, 2830, 3650], dB: [0, -10, -17, -23], BW: [90, 130, 160, 200] },
    oo: { F: [325, 700, 2615, 3650], dB: [0, -14, -28, -34], BW: [80, 100, 270, 290] },
    ee: { F: [310, 1920, 2825, 3800], dB: [0, -16, -24, -27], BW: [90, 150, 175, 215] },
  },
};
const VOWELS: ChoirVowel[] = ['oo', 'ah', 'oh', 'ee'];

/** The choir's air band: centre, Q and level (each tract its own; the sopranos' rises on high chords). */
const AIR_HZ = 5200, AIR_Q = 0.7, AIR_GAIN = 0.3;
/**
 * The air band's sign per vowel. It overlaps every formant, and against an all-pole tract (the real thing) a
 * positive one digs a notch below F2 in 'ee' 23 dB deeper than nature's, and one between F3 and F4 in the women's
 * 'ah'; negative there, positive elsewhere, no valley is more than 8 dB deeper than the cascade's.
 */
const AIR_SIGN: Record<'m' | 'f', Record<ChoirVowel, number>> = {
  m: { oo: 1, ah: 1, oh: 1, ee: -1 },
  f: { oo: 1, ah: -1, oh: 1, ee: -1 },
};

/** How far apart a section tunes, ± cents edge to edge: closest on the narrow vowels, freest on 'ah'. */
const TUNING: Record<ChoirVowel, number> = { oo: 4, ee: 4, oh: 4.5, ah: 7 };

/** The four places on the stage, left to right (a share of the width). */
const STAGE = [-1, -1 / 3, 1 / 3, 1];

/**
 * Vocal effort: soft singing is darker, loud singing rings, in the formants above F1 (the old high shelf at 1.4 kHz:
 * −11 dB soft … +3.5 dB loud, 0 at vel 0.8). Gains for F1–F4 and the air band.
 */
function effort(v: number): { f: number[]; air: number } {
  const e = lerp(-11, 3.5, v ** 0.9) - 0.86;
  const g = (k: number) => 10 ** ((k * e) / 20);
  return { f: [1, g(0.5), g(1), g(1)], air: g(1.1) };
}

export interface ChoirOpts {
  /** Seconds to full voice at vel 0.5 (louder entries are quicker). */
  attack?: number;
  release?: number;
  /** Singers a note (2–6). */
  voices?: number;
  width?: number;
  /** The breath: the "h" on a fresh entry and the air under soft singing (0..2). */
  breath?: number;
  /** Scales the vibrato (1 = a gentle choral vibrato). */
  vibrato?: number;
}

/**
 * An airy choir. Each note is the section's core (the fundamental and second harmonic, one steady oscillator as loud
 * as the singers' add up to: a real section's low harmonics are near-identical sines that cancel one another in
 * turns, on 'oo', which is little else, a warble) and `voices` singers carrying the harmonics above (a glottal
 * source, two timbres round-robin, and the head voice the sopranos fade into from C5 to A5), each with their own
 * tuning, entry, scoop, drift and breathing, dealt across four places on the stage. The note's two vibratos arrive
 * late at their own wandering rates: a singer takes one, the other, both or none (a straight tone, as choirs blend),
 * the core the gentler one. Through a vowel: a formant tract per voice type (F1 a resonant low-pass, flat beneath as
 * a real tract is, so the basses have their chest; F2–F4 band-passes with alternating signs, so the valleys between
 * formants stay natural; an air band), the men's for notes below A♭3 and the women's above. A choir sings one vowel
 * at a time: each chord glides the tracts to its vowel (and on to `to` across the chord) and to its effort (soft is
 * darker and breathier with less vibrato, loud is brighter and rings); a second vowel at the same time needs a
 * second choir. Breath (a soft "h" on a fresh entry, never when the choir moves on from a chord; air under soft
 * singing) goes through the same vowel, so it whispers it.
 *
 * `(t, notes, dur, vel, vowel = 'oo', to?)`. Register: E2–C6 (men E2–G3, women A♭3 up); loveliest 'oo' / 'ah' in
 * close chords from G3 to G5.
 */
export function makeChoir(ctx: BaseAudioContext, s: Strip, r: Rnd, o: ChoirOpts = {}) {
  const { voices = 4, width = 0.65, breath = 1, vibrato: vib = 1 } = o;
  const attack = Math.max(0.005, o.attack ?? 0.45), release = Math.max(0.02, o.release ?? 1.5);
  const V = clamp(Math.round(voices), 2, 6);
  // two singer timbres (a glottal source: −6 dB an octave, a little steeper for the second), and the head voice the
  // high sopranos fade into (fewer harmonics, nearly a flute, but not quite): every one from the third harmonic up,
  // the first two are the note's core. FULL = the RMS a whole voice of each slope would have (fundamental 1)
  const SLOPES = [1.08, 1.24, 1.4];
  const srcs = SLOPES.map((p, i) => waveOf(ctx, `ch3:${i}`, 128, (n) => (n < 3 ? 0 : 1 / n ** p)));
  // the core: the fundamental and the second harmonic in the section's usual ratio
  const coreW = waveOf(ctx, 'ch3:core', 2, (n) => (n === 1 ? 1 : 0.45), (n) => (n === 2 ? 0.6 : 0));
  const FULL = SLOPES.map((p) => {
    let ms = 0;
    for (let n = 1; n <= 128; n++) ms += n ** (-2 * p) / 2;
    return Math.sqrt(ms);
  });
  /** A tract: an input fed from four places on the stage, four formants in parallel and an air band into the strip. */
  const tract = (type: 'm' | 'f') => {
    const input = ctx.createGain();
    const sides = STAGE.map((x) => pan(ctx, x * width));
    for (const x of sides) x.connect(input);
    const air = biquad(ctx, 'bandpass', AIR_HZ, AIR_Q);
    const airG = ctx.createGain();
    airG.gain.automationRate = 'k-rate';
    airG.gain.value = AIR_GAIN;
    input.connect(air);
    air.connect(airG);
    airG.connect(s.in);
    const bps: BiquadFilterNode[] = [], gs: GainNode[] = [];
    for (let k = 0; k < 4; k++) {
      // every formant parameter glides slowly: read once a block (an a-rate Q in motion would make the filter
      // recompute its coefficients every sample)
      const bp = voiceFilter(ctx);
      // F1 the Klatt way: a resonant low-pass (unity gain below it, its Q in dB), the others band-passes
      bp.type = k === 0 ? 'lowpass' : 'bandpass';
      bp.Q.automationRate = 'k-rate';
      const gk = ctx.createGain();
      gk.gain.automationRate = 'k-rate';
      input.connect(bp);
      bp.connect(gk);
      gk.connect(s.in);
      bps.push(bp);
      gs.push(gk);
    }
    s.nodes.push(input, ...sides, air, airG, ...bps, ...gs);
    // per vowel: frequencies, Qs (F1's in dB) and the gains that give the table's peaks over a −6 dB/oct source, all
    // vowels brought to one loudness (measured on the tract's response at a typical note)
    const ref = mtof(type === 'm' ? 50 : 67);
    const shapes = {} as Record<ChoirVowel, { F: number[]; Q: number[]; Qp: number[]; G: number[]; air: number }>;
    /** The energy a note at `f0` gets through a vowel and the air band (a 1/n^`p` source, fundamental at 1). */
    const energy = (F: number[], Q: number[], G: number[], f0: number, p: number, airG0: number) => {
      let e = 0;
      for (let h = 1; h * f0 < 12000; h++) {
        const f = h * f0;
        // F1: a low-pass, 1 / (1 − x² + jx/Q) (its peak, Q, is in its gain G[0] = level / Q)
        const x = f / F[0], ar = 1 - x * x, ai = x / Q[0], d0 = ar * ar + ai * ai;
        let re = (G[0] * ar) / d0, im = (-G[0] * ai) / d0;
        for (let k = 1; k <= 4; k++) {
          // a band-pass (0 dB at its centre): 1 / (1 + jQ(f/F − F/f)); k = 4 is the air band
          const isAir = k === 4, Fk = isAir ? AIR_HZ : F[k], Qk = isAir ? AIR_Q : Q[k], Gk = isAir ? airG0 : G[k];
          const y = Qk * (f / Fk - Fk / f), den = 1 + y * y;
          re += Gk / den;
          im -= (Gk * y) / den;
        }
        e += (re * re + im * im) / h ** (2 * p);
      }
      return e;
    };
    for (const vw of VOWELS) {
      const d = FORMANTS[type][vw];
      const Q = d.F.map((F, k) => F / d.BW[k]);
      const G = d.dB.map((db, k) => ((k % 2 ? -1 : 1) * 10 ** (db / 20) * (d.F[k] / d.F[0])) / (k === 0 ? Q[0] : 1));
      const air = AIR_SIGN[type][vw] * AIR_GAIN;
      // to one loudness: the formants alone, then again with the air band beside them at its own level
      const n1 = 1 / Math.sqrt(energy(d.F, Q, G, ref, 1.08, 0));
      const norm = n1 / Math.sqrt(energy(d.F, Q, G.map((x) => x * n1), ref, 1.08, air));
      shapes[vw] = { F: d.F, Q, Qp: Q.map((q, k) => (k === 0 ? 20 * Math.log10(q) : q)), G: G.map((x) => x * norm), air };
    }
    /**
     * What a note needs to sound as loud as the reference through a vowel: a soprano's high note finds no formant
     * under its fundamental (a real one moves F1 up to meet it; the shared tract can't, so the note is lifted).
     */
    const lift = (vw: ChoirVowel, f0: number, p = 1.08) => {
      const sh = shapes[vw];
      return clamp(1 / Math.sqrt(energy(sh.F, sh.Q, sh.G, f0, p, sh.air)), 0.5, 3);
    };
    let first = true;
    /**
     * Glide to a vowel at an effort from `t` (time constant `tau`), then let it live until `until`: the formants
     * wander a few percent (a mouth is never still). Every event a setTarget, so overlapping chords stay smooth.
     */
    const sing = (vw: ChoirVowel, t: number, tau: number, until: number, eff: { f: number[]; air: number }, airLevel: number) => {
      const sh = shapes[vw];
      for (let k = 0; k < 4; k++) {
        const pr: [AudioParam, number][] = [[bps[k].frequency, sh.F[k]], [bps[k].Q, sh.Qp[k]], [gs[k].gain, sh.G[k] * eff.f[k]]];
        for (const [p, val] of pr) {
          if (first) p.value = val;
          p.cancelScheduledValues(t);
          p.setTargetAtTime(val, t, tau);
        }
        const wob = [0.035, 0.045, 0.02, 0.02][k], f = bps[k].frequency;
        for (let at = t + tau * 3 + 0.3 + r() * 0.4; at < until; at += 0.6 + r() * 0.7) f.setTargetAtTime(sh.F[k] * (1 + wob * (r() * 2 - 1)), at, 0.35);
      }
      // the air band: the vowel's sign, the chord's level
      const ag = Math.sign(sh.air) * airLevel * eff.air;
      if (first) airG.gain.value = ag;
      airG.gain.cancelScheduledValues(t);
      airG.gain.setTargetAtTime(ag, t, tau);
      first = false;
    };
    return { sides, input, sing, lift };
  };
  const banks = { m: tract('m'), f: tract('f') };
  const rest = effort(0.8);
  banks.m.sing('oo', ctx.currentTime, 0.01, ctx.currentTime, rest, AIR_GAIN);
  banks.f.sing('oo', ctx.currentTime, 0.01, ctx.currentTime, rest, AIR_GAIN);
  const breathBuf = cachedBuffer(ctx, 'pads:breath', 1.65, (d, sr) => {
    const len = Math.floor(1.6 * sr), fold = d.length - len;
    const rnd = noiseGen(777);
    // pink (Kellet), then the lows off: air through a throat, not wind
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rnd();
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
    }
    onePole(d, sr, 380, true);
    onePole(d, sr, 380, true);
    loopable(d, len, fold);
    peakNormalise(d, len);
    return len;
  });

  /** The chord before: when it is releasing as the next one starts, the singers move on together. */
  let last: { off: number; end: number; cut: (at: number) => void } | null = null;
  let deal = 0;

  return (t: number, notes: number[], dur: number, vel: number, vowel: ChoirVowel = 'oo', to?: ChoirVowel) => {
    if (bad(t, dur, vel)) return;
    notes = finiteNotes(notes);
    const n = notes.length;
    if (!n) return;
    t = Math.max(0, t);
    const v = clamp(vel, 0, 1);
    dur = clamp(dur, 0.08, MAX_DUR);
    const g = new Notes();
    // moving on from a releasing chord: no new breath, the old one fades as this one enters
    const moving = last !== null && t >= last.off - 0.05 && t < last.end;
    if (moving) last!.cut(t);
    // short notes are sung shorter: the entry fits the note
    const a = Math.min(attack * lerp(1.45, 0.5, v), 0.05 + dur * 0.5);
    const rel = release * (0.45 + 0.55 * Math.min(1, dur / 1.2));
    const len = dur + rel + 0.05;
    const used = { m: notes.some((m) => m < 56), f: notes.some((m) => m >= 56) };
    // the vowel and the effort: arrive quickly, then (if asked) open into the second vowel across the chord; the
    // sopranos keep a little air over their few harmonics on high chords (+4 dB from A5)
    const top = Math.max(...notes);
    const eff = effort(v);
    for (const key of ['m', 'f'] as const) {
      if (!used[key]) continue;
      const b = banks[key];
      const air = AIR_GAIN * (key === 'f' ? 1 + 0.6 * clamp((top - 72) / 9, 0, 1) : 1);
      const morph = to && to !== vowel ? t + Math.min(a * 0.6, dur * 0.3) : t + len;
      b.sing(vowel, t, 0.045, morph, eff, air);
      if (morph < t + len) b.sing(to!, morph, Math.max(0.12, dur * 0.22), t + len, eff, air);
    }
    // every gain of the chord: the next chord closes them (the release cut short when the choir moves on)
    const closers: Closer[] = [];
    last = {
      off: t + dur,
      end: t + len,
      cut: (at) => {
        for (const c of closers) c(at, 0.35);
        g.cut(at + 0.37);
      },
    };
    // big chords are a crowd already: one singer fewer a note from five notes up
    const VV = n >= 5 ? Math.max(2, V - 1) : V;
    const lvl = (0.21 * (0.25 + 0.75 * v ** 1.2)) / Math.sqrt(n * VV);
    // how far apart the singers tune: the narrower vowel of the two decides
    const spread = Math.min(TUNING[vowel], TUNING[to ?? vowel]);
    notes.forEach((m, j) => {
      const f = mtof(m);
      const key = m < 56 ? 'm' : 'f';
      const sides = banks[key].sides;
      // the head voice: from C5 to A5 more and more of the sopranos sing in it (never a switch)
      const headShare = clamp((m - 72) / 9, 0, 1);
      const liftOf = (slope: number) => Math.sqrt(banks[key].lift(vowel, f, slope) * banks[key].lift(to ?? vowel, f, slope));
      const lifts = [liftOf(SLOPES[0]), headShare > 0 ? liftOf(SLOPES[2]) : 0];
      // the section sags and recovers together (one drift for the note); high voices vibrate a little narrower
      const drift = wander(r, 3, 0.05, 0.3);
      const depth = vib * (5 + 6 * v) * Math.min(1, (440 / f) ** 0.7);
      const vDelay = Math.min(dur * 0.5, 0.35 + r() * 0.35) + a * 0.3;
      const lfoA = depth > 0 ? vibratoLfo(ctx, g, r, t, len, 4.8 + r() * 0.9, depth * (0.55 + r() * 0.15), vDelay, 0.7) : null;
      const lfoB = depth > 0 ? vibratoLfo(ctx, g, r, t, len, 4.8 + r() * 0.9, depth * (0.85 + r() * 0.3), vDelay + 0.1 + r() * 0.25, 0.7) : null;
      const place = deal++;
      // what the core takes from the singers: their fundamentals' power, their average entry and scoop
      let core = 0, coreEnter = 0, coreScoop = 0;
      for (let k = 0; k < VV; k++) {
        const head = headShare > 0 && r() < headShare;
        const si = head ? 2 : (k + j) % 2;
        const w = srcs[si];
        const enter = r() * lerp(0.06, 0.02, v);
        // the singer's scale: their fundamental's amplitude, were it theirs (a whole voice would be at `lvl`)
        const A = (lvl * lifts[head ? 1 : 0] * (0.85 + r() * 0.3)) / FULL[si];
        const pk = A * w.peak;
        const breathe = wander(r, 0.05, 0.1, 0.45);
        // a singer's pitch: their own tuning, a scoop for some, the section's drift and their own, a hair flat as
        // the breath runs out
        const tune = (VV > 1 ? (k / (VV - 1)) * 2 - 1 : 0) * spread * (0.85 + r() * 0.3) + (r() - 0.5) * 2;
        const scoop = r() < 0.55 ? -(8 + r() * 16) * (1.1 - v * 0.5) : 0, sc = 0.06 + r() * 0.07;
        const own = wander(r, 1.6, 0.05, 0.35);
        core += A * A;
        coreEnter += enter / VV;
        coreScoop += (scoop * sc) / VV;
        const osc = g.src(oscOn(ctx, w.w, f), early(t, f, r));
        const amp = g.add(ctx.createGain());
        closers.push(
          gainEnv(amp.gain, t, knots(len, enter, span(RISE, a, enter), every(enter + a * 1.25, dur, 0.7), dur, span(FALL, rel, dur)), (u) => {
            const on = u - enter;
            if (on <= 0) return 0;
            const h = Math.min(on, dur - enter);
            const at = lerp(sRise(h / a), rcRise(h / a), 0.4 + 0.4 * v);
            return pk * at * (1 + breathe(u)) * fall((u - dur) / rel);
          }),
        );
        paramEnv(osc.detune, t, knots(len, scoop ? span(DECAY, sc) : [], every(0.25, len, 0.7), dur, dur + rel * 0.5), (u) => {
          let c = tune + drift(u) + own(u);
          if (scoop) c += scoop * Math.exp(-u / sc);
          if (u > dur) c -= 6 * sRise((u - dur) / rel);
          return c;
        });
        // vibrato: the first singer of every four on A, the second on B, the third on both, the fourth straight
        const q = k % 4;
        if (lfoA && (q === 0 || q === 2)) lfoA.connect(osc.detune);
        if (lfoB && (q === 1 || q === 2)) lfoB.connect(osc.detune);
        osc.connect(amp);
        // four places: each note's singers fill the stage, the next note starts one place on
        amp.connect(sides[(place + k) % 4]);
      }
      // the core: the note's fundamental and second harmonic, as loud as the section's sum to on average, but steady
      // (the harmonics above, dozens of them, only shimmer). It follows the section: its drift, its average entry
      // and scoop (the same pitch area), the gentler vibrato
      const ck = Math.sqrt(core) * coreW.peak, csc = 0.09, cs = coreScoop / csc;
      const co = g.src(oscOn(ctx, coreW.w, f), early(t, f, r));
      const cg = g.add(ctx.createGain());
      const cbr = wander(r, 0.02, 0.1, 0.4);
      closers.push(
        gainEnv(cg.gain, t, knots(len, coreEnter, span(RISE, a, coreEnter), every(coreEnter + a * 1.25, dur, 0.9), dur, span(FALL, rel, dur)), (u) => {
          const on = u - coreEnter;
          if (on <= 0) return 0;
          const h = Math.min(on, dur - coreEnter);
          const at = lerp(sRise(h / a), rcRise(h / a), 0.4 + 0.4 * v);
          return ck * at * (1 + cbr(u)) * fall((u - dur) / rel);
        }),
      );
      paramEnv(co.detune, t, knots(len, cs ? span(DECAY, csc) : [], every(0.25, len, 0.7), dur, dur + rel * 0.5), (u) => {
        let c = drift(u);
        if (cs) c += cs * Math.exp(-u / csc);
        if (u > dur) c -= 6 * sRise((u - dur) / rel);
        return c;
      });
      if (lfoA) lfoA.connect(co.detune);
      co.connect(cg);
      cg.connect(sides[1 + (place % 2)]);
    });
    // the breath: an "h" leading a fresh entry and air under the tone (more of it when soft), through the vowel
    if (breath > 0) {
      const { src, offset } = noiseSrc(ctx, breathBuf, r);
      const bg = g.add(ctx.createGain());
      const h = moving ? 0 : breath * 0.15 * (0.3 + 0.7 * (1 - v)), air = breath * 0.12 * (0.3 + 0.9 * (1 - v));
      const ar = a * 0.8 + 0.05, brel = rel * 0.7;
      closers.push(
        gainEnv(bg.gain, t, knots(len, h ? [0.005, 0.01, 0.02, 0.035, 0.05, 0.07, 0.1, 0.14, 0.2, 0.3] : [], span(RISE, ar), dur, span(FALL, brel, dur)), (u) => {
          const onset = h ? h * (1 - Math.exp(-u / 0.02)) * Math.exp(-u / 0.06) : 0;
          return onset + air * sRise(u / ar) * fall((u - dur) / brel);
        }),
      );
      g.src(src, t - 0.01, offset);
      src.connect(bg);
      // into the tract most of the notes are in
      bg.connect((notes.filter((m) => m < 56).length * 2 > n ? banks.m : banks.f).input);
    }
    g.end(t + len + 0.02);
  };
}

// ── 4. the glass pad ────────────────────────────────────────────────────────────────────────
export interface GlassPadOpts {
  attack?: number;
  release?: number;
  /** Depth of the partials' slow breathing (0..1.5). */
  shimmer?: number;
  width?: number;
  /** Scales the upper partials. */
  bright?: number;
}

/**
 * The glass: three groups of partials, each one oscillator that breathes on its own. The body (1, 2), the glass
 * (3–6: where the brightness lives) and the sparkle (8–16), each group stretched a few cents above the one under it
 * (glass is stiff: no partial is shared, so nothing beats), with how deep and how fast it breathes, how much sooner
 * than the body it dies (`die`), how much it glints on the onset, how strongly velocity reaches it (`vel`: soft
 * notes are nearly pure) and where it sits (0 near the middle, ±1 out wide, swapping sides from note to note).
 */
const GLASS: { parts: [number, number][]; cents: number; depth: number; rate: [number, number]; die: number; glint: number; vel: number; side: number }[] = [
  { parts: [[1, 1], [2, 0.62]], cents: 0, depth: 0.1, rate: [0.05, 0.12], die: 1, glint: 0, vel: 0, side: 0 },
  { parts: [[3, 0.62], [4, 0.78], [5, 0.34], [6, 0.6]], cents: 1.6, depth: 0.34, rate: [0.1, 0.26], die: 1.4, glint: 0.32, vel: 0.45, side: 1 },
  { parts: [[8, 0.5], [10, 0.32], [12, 0.27], [14, 0.12], [16, 0.13]], cents: 3.6, depth: 0.5, rate: [0.18, 0.42], die: 2, glint: 0.28, vel: 0.85, side: -1 },
];

/**
 * Act V's light: bright but soft. Each note is three groups of glass partials (above), every group its own
 * oscillator with its own slow breathing (a raised-cosine swell at its own rate, deeper and quicker up high) so the
 * chord shimmers and never repeats; the groups sit apart in the stereo field and swap sides from note to note, so the
 * light moves. The onset is crystal (the D-50's trick: a struck attack over a soft body): the upper groups glint and
 * settle, a faint inharmonic ring (a glass's own 5.4×) flashes and then stays, 30 dB down, breathing with the
 * sparkle; the body blooms; the upper groups die first. Velocity brightens the top, the glint and the bloom.
 * `(t, notes, dur, vel)`. Register: G3–C7.
 */
export function makeGlassPad(ctx: BaseAudioContext, s: Strip, r: Rnd, o: GlassPadOpts = {}) {
  const { shimmer = 1, width = 0.75, bright = 1 } = o;
  const attack = Math.max(0.005, o.attack ?? 1.1), release = Math.max(0.02, o.release ?? 2.8);
  // far left, near left, near right, far right: the body near the middle, the glass and the sparkle out wide
  const sides = [pan(ctx, -width), pan(ctx, -width * 0.35), pan(ctx, width * 0.35), pan(ctx, width)];
  for (const x of sides) x.connect(s.in);
  s.nodes.push(...sides);
  const sideOf = (side: number, flip: number) => (side === 0 ? (flip > 0 ? 2 : 1) : side * flip > 0 ? 3 : 0);
  // each group one wave, its partials' phases spread (no peak piles up)
  const groups = GLASS.map((gr, i) => {
    const amp = new Map(gr.parts), topK = gr.parts[gr.parts.length - 1][0];
    return waveOf(ctx, `glass2:${i}`, topK, (n) => amp.get(n) ?? 0, (n) => (TAU * n * n) / 7);
  });
  let flip = 1;
  return (t: number, notes: number[], dur: number, vel: number) => {
    if (bad(t, dur, vel)) return;
    notes = finiteNotes(notes);
    const n = notes.length;
    if (!n) return;
    t = Math.max(0, t);
    const v = clamp(vel, 0, 1);
    dur = clamp(dur, 0.1, MAX_DUR);
    const g = new Notes();
    // short notes bloom quicker (a quick repeat still speaks)
    const a = Math.min(attack * lerp(1.35, 0.55, v), 0.04 + dur * 0.45);
    const rel = release * (0.5 + 0.5 * Math.min(1, dur / 1.5));
    const lvl = (0.165 * (0.3 + 0.7 * v ** 1.1)) / Math.sqrt(n);
    const glint = bright * v ** 1.2;
    // the top's share: soft notes nearly pure, loud ones glitter
    const top = clamp(bright * (0.3 + 0.75 * v), 0.05, 1.6);
    notes.forEach((m) => {
      flip = -flip;
      const f0 = mtof(m);
      // high notes thinner (fewer partials fit, and the ear needs less of them)
      const key = 1 + clamp((64 - m) / 60, -0.25, 0.25);
      GLASS.forEach((gr, i) => {
        if (f0 * gr.parts[0][0] > 16000) return;
        const wv = groups[i];
        // each group stops once its own release has died (the sparkle long before the body); its gain is at 0 first
        const relI = rel / gr.die, lenI = dur + relI + 0.06;
        const osc = g.src(oscOn(ctx, wv.w, f0), early(t, f0, r), undefined, t + lenI + 0.02);
        osc.detune.value = gr.cents + (r() - 0.5) * 2;
        const amp = g.add(ctx.createGain());
        // the body moves slowly: its gain is read once a block (cheaper; nothing in it is quick enough to zip)
        if (!gr.glint) amp.gain.automationRate = 'k-rate';
        const pk = lvl * key * wv.peak * top ** gr.vel * (0.88 + r() * 0.24);
        const bloom = a * (1 + i * 0.18);
        const rate = lerp(gr.rate[0], gr.rate[1], r()) * (1 + 0.6 * v);
        const ph = r(), depth = clamp(gr.depth * shimmer, 0, 0.92);
        const swayF = 0.05 + r() * 0.08, swayP = r();
        const gl = pk * gr.glint * glint * (0.8 + r() * 0.4), ring = 0.3 + i * 0.12 + r() * 0.15;
        const ks = knots(lenI, span(RISE, bloom), gl ? [0.004, 0.012, 0.025, 0.05, ...span(DECAY, ring)] : [], every(0, dur, 1 / (5 * rate)), dur, span(FALL, relI, dur));
        gainEnv(amp.gain, t, ks, (u) => {
          const h = Math.min(u, dur);
          const at = sRise(h / bloom) * 0.7 + rcRise(h / bloom) * 0.3;
          // the breathing: a raised cosine whose own rate sways a little
          const br = 1 - depth * (0.5 - 0.5 * sinT(rate * u + ph + 0.25 + 0.13 * sinT(swayF * u + swayP)));
          const g0 = gl ? gl * (1 - Math.exp(-u / 0.012)) * Math.exp(-u / ring) : 0;
          return (pk * at * br + g0) * fall((u - dur) / relI);
        });
        osc.connect(amp);
        amp.connect(sides[sideOf(gr.side, flip)]);
      });
      // the glass's own ring: inharmonic, a flash on the onset, then 30 dB under the note, breathing with the sparkle
      const fr = f0 * (5.36 + r() * 0.1);
      if (fr < 15000) {
        const tr = 0.42 * (0.8 + r() * 0.4), relR = rel / 2.2, lenR = dur + relR + 0.06;
        const osc = g.src(oscOn(ctx, 'sine', fr), early(t, fr, r), undefined, t + lenR + 0.02);
        const amp = g.add(ctx.createGain());
        const flash = lvl * key * 0.11 * glint, sus = lvl * key * 0.032 * (0.4 + 0.6 * top);
        const rate = lerp(0.2, 0.45, r()), ph = r(), ra = a * 1.3;
        const ks = knots(lenR, [0.002, 0.005, 0.01, 0.02], span(DECAY, tr), span(RISE, ra), every(0, dur, 1 / (5 * rate)), dur, span(FALL, relR, dur));
        gainEnv(amp.gain, t, ks, (u) => {
          const body = sus * sRise(Math.min(u, dur) / ra) * (0.75 - 0.25 * sinT(rate * u + ph));
          const g0 = flash * (1 - Math.exp(-u / 0.005)) * Math.exp(-u / tr);
          return (body + g0) * fall((u - dur) / relR);
        });
        osc.connect(amp);
        amp.connect(sides[flip > 0 ? 0 : 3]);
      }
    });
    g.end(t + dur + rel + 0.1);
  };
}

// ── 5. the warm pad ─────────────────────────────────────────────────────────────────────────
export interface WarmPadOpts {
  /** The filter's open cutoff for a mid note at vel 0.6 (Hz). */
  cut?: number;
  /** The second filter stage's resonance (dB). */
  q?: number;
  attack?: number;
  release?: number;
  /** Seconds the low-pass takes to open (at vel 0.5). */
  open?: number;
  /**
   * How far the card's two saws drift against each other (9 = a gentle analogue phasing, 0 = locked). Their phases
   * wander but never far enough to cancel: the timbre moves, the level holds.
   */
  detune?: number;
  /** The sub triangle's level, under the chord's lowest note (default 0.45, 0.35 for chords of four notes or more). */
  sub?: number;
  width?: number;
  /** The Juno chorus's depth (0 = none). */
  chorus?: number;
  /** The track's `k.onStop` (demos: `lab.onStop`): the chorus's LFO stops with the track. */
  onStop: (fn: () => void) => void;
}

/**
 * A Juno's chorus (mode I: a delay swept between 1.7 and 5.4 ms by a 0.5 Hz triangle), wired as the Juno is: the
 * delayed copy added on the left and subtracted on the right, the dry signal in both. Each side sweeps a comb, the
 * two in opposite senses, so the stereo image moves while the pair's power and the mono sum (the dry signal alone)
 * hold still: a chorus that never pumps the level. Made once.
 */
function junoChorus(ctx: BaseAudioContext, dest: AudioNode, wet: number): { input: GainNode; nodes: AudioNode[]; stop: () => void } {
  const input = ctx.createGain();
  input.connect(dest);
  const d = ctx.createDelay(0.02);
  d.delayTime.value = 0.0035;
  const lfo = ctx.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = 0.513;
  const lg = ctx.createGain();
  lg.gain.value = 0.00185;
  lfo.connect(lg);
  lg.connect(d.delayTime);
  lfo.start(ctx.currentTime);
  // the bucket brigade's own darkness
  const bbd = biquad(ctx, 'lowpass', 7500, -3);
  input.connect(d);
  d.connect(bbd);
  const plus = ctx.createGain(), minus = ctx.createGain();
  plus.gain.value = wet;
  minus.gain.value = -wet;
  const left = pan(ctx, -1), right = pan(ctx, 1);
  bbd.connect(plus);
  plus.connect(left);
  left.connect(dest);
  bbd.connect(minus);
  minus.connect(right);
  right.connect(dest);
  return { input, nodes: [input, d, lg, bbd, plus, minus, left, right], stop: () => lfo.stop() };
}

/**
 * An analogue polysynth pad (a Juno's warmth, an OB's spread). Each voice card: two saws (the second at 0.7) starting
 * together and drifting as one, the second's phase swung ±1 radian around the first's by a slow LFO of its own (the
 * upper harmonics phase and the timbre breathes, the fundamental never cancels: no beat, no pulse), into a 4-pole
 * low-pass (two biquads, the second a little resonant) that opens slowly from dark, key-tracked, and closes on the
 * release; every card slightly different (cutoff, envelope times, level), voices dealt left, centre and right. A
 * triangle sub sits under the chord's lowest note only (an octave under from E3, fading in to A3; at unison and
 * fading out below E3). Then the Juno's chorus (above, made once). Velocity opens the filter further and quickens
 * it. `(t, notes, dur, vel, bright = 1)`: `bright` scales the cutoff (an arranger can drift it over minutes).
 * Register: C2–C6.
 */
export function makeWarmPad(ctx: BaseAudioContext, s: Strip, r: Rnd, o: WarmPadOpts) {
  const { cut = 1700, q = 2.5, detune = 9, width = 0.65, chorus: wet = 0.4 } = o;
  const attack = Math.max(0.005, o.attack ?? 0.7), release = Math.max(0.02, o.release ?? 1.8), open = Math.max(0.02, o.open ?? 2.2);
  // how far the second saw's phase swings around the first's (radians), from the detune knob
  const PHI = clamp(detune / 9, 0, 1.45);
  let into: AudioNode = s.in;
  if (wet > 0) {
    const ens = junoChorus(ctx, s.in, clamp(wet, 0, 1.2));
    o.onStop?.(ens.stop);
    into = ens.input;
    s.nodes.push(...ens.nodes);
  }
  // the pad is not the bass: what's under 75 Hz is left to it
  const hp = biquad(ctx, 'highpass', 75, -3);
  hp.connect(into);
  // left, centre, right, all equal-power (a plain gain in the middle would up-mix to full level in both channels)
  const sides = [pan(ctx, -width), pan(ctx, 0), pan(ctx, width)];
  for (const x of sides) x.connect(hp);
  s.nodes.push(hp, ...sides);
  const saw = waveOf(ctx, 'wp:saw', 160, (n) => 1 / n);
  const tri = waveOf(ctx, 'wp:tri', 31, (n) => (n % 2 ? ((n - 1) / 2) % 2 ? -1 : 1 : 0) / (n * n));
  let deal = 0;
  return (t: number, notes: number[], dur: number, vel: number, bright = 1) => {
    if (bad(t, dur, vel) || !Number.isFinite(bright)) return;
    notes = finiteNotes(notes);
    const n = notes.length;
    if (!n) return;
    t = Math.max(0, t);
    const v = clamp(vel, 0, 1);
    dur = clamp(dur, 0.05, MAX_DUR);
    const g = new Notes();
    const lvl = (0.235 * (0.3 + 0.7 * v ** 1.1)) / Math.sqrt(n);
    const lowest = Math.min(...notes);
    const subLvl = Math.max(0, o.sub ?? (n >= 4 ? 0.35 : 0.45));
    let longest = 0;
    notes.forEach((m) => {
      const f = mtof(m);
      const card = 0.96 + r() * 0.08;
      // short notes (stabs) are played with quicker envelopes
      const a = Math.min(attack * lerp(1.35, 0.55, v), 0.03 + dur * 0.5) * (0.92 + r() * 0.16);
      const op = Math.min(open * lerp(1.25, 0.65, v), 0.1 + dur * 0.8) * (0.9 + r() * 0.2);
      const rel = release * (0.4 + 0.6 * Math.min(1, dur / 1)) * (0.92 + r() * 0.16);
      const len = dur + rel + 0.05;
      longest = Math.max(longest, len);
      // the filter: key-tracked by half, dark at the start, velocity sets how far it opens (one path, both stages)
      const C = cut * card * bright * (f / 261.6) ** 0.45;
      const lo = 0.16, hi = 0.5 + 0.85 * v;
      const lpA = g.add(voiceFilter(ctx)), lpB = g.add(voiceFilter(ctx));
      lpA.type = lpB.type = 'lowpass';
      lpA.Q.value = -3;
      lpB.Q.value = q;
      paramEnv([lpA.frequency, lpB.frequency], t, knots(len, span([0.04, 0.1, 0.2, 0.32, 0.46, 0.62, 0.8, 1, 1.2], op), dur, span([0.1, 0.25, 0.45, 0.7, 1], rel, dur)), (u) => {
        const e = rcRise(Math.min(u, dur) / op) * 0.75 + sRise(Math.min(u, dur) / op) * 0.25;
        const shut = 0.35 + 0.65 * Math.exp((-3 * Math.max(0, u - dur)) / rel);
        return clamp(C * lerp(lo, hi, e) * shut, 60, 16000);
      });
      const vca = g.add(ctx.createGain());
      // the saws' unit-RMS gain lives in the VCA (the two together at about unit RMS); the triangle relative to them
      const pk = lvl * saw.k * 0.6 * (0.94 + r() * 0.12) * (1 + clamp((60 - m) / 40, -0.3, 0.35));
      gainEnv(vca.gain, t, knots(len, span(RISE, a), dur, span(FALL, rel, dur)), (u) => {
        const h = Math.min(u, dur);
        return pk * lerp(sRise(h / a), rcRise(h / a), 0.6) * fall((u - dur) / rel);
      });
      // both saws start together, well before t; the second runs `b` radians behind, and its phase LFO (a sine on
      // its detune: its phase is the integral, b·(1 − cos)) swings it to `b` ahead and back
      const start = t - (1 + r()) / f, stop = t + len + 0.02;
      const b = PHI * (0.85 + r() * 0.15), fw = lerp(0.15, 0.42, r());
      const xa = g.src(oscOn(ctx, saw.w, f), start, undefined, stop);
      const xb = g.src(oscOn(ctx, saw.w, f), start + b / (TAU * f), undefined, stop);
      const gb = g.add(ctx.createGain());
      gb.gain.value = 0.7;
      xa.connect(lpA);
      xb.connect(gb);
      gb.connect(lpA);
      if (b > 0) {
        const pw = g.src(ctx.createOscillator(), start, undefined, stop);
        pw.frequency.value = fw;
        const pg = g.add(ctx.createGain());
        pg.gain.value = (b * LN2C * fw) / f;
        pw.connect(pg);
        pg.connect(xb.detune);
      }
      const detunes = [xa.detune, xb.detune];
      // the sub: under the lowest note only, an octave down from E3 (fading in to A3), at unison below (fading out
      // from C3), so a chord carries one sub, never a duplicate of every note an octave down
      if (m === lowest && subLvl > 0) {
        const octave = m >= 52;
        const share = octave ? sRise((m - 52) / 5) : 0.55 * (1 - sRise((m - 48) / 4));
        if (share > 0.01) {
          const fs = octave ? f / 2 : f;
          const tr = g.src(oscOn(ctx, tri.w, fs), start, undefined, stop);
          const tg = g.add(ctx.createGain());
          tg.gain.value = (share * subLvl * tri.k) / saw.k;
          tr.connect(tg);
          tg.connect(lpA);
          detunes.push(tr.detune);
        }
      }
      // the card's pitch: one drift for the whole card (both saws and the sub)
      const dr = wander(r, 2.6, 0.08, 0.45);
      paramEnv(detunes, t, knots(len, every(0, len, 0.6)), dr);
      lpA.connect(lpB);
      lpB.connect(vca);
      vca.connect(sides[deal++ % 3]);
    });
    // every voice card stops when its own release ends; the chord's nodes go when the longest has
    g.end(t + longest + 0.03);
  };
}

// ── demos (tools/audio/render.mjs `fn`, --secs 20; dev only) ─────────────────────────────────
/** Bars at a tempo: `at(beat)` in seconds from the demo's start. */
const beats = (lab: Lab, bpm: number) => (b: number) => lab.t0 + (b * 60) / bpm;

/** City pop in C: IVmaj7 · iii7 soft, vi7 · ii7 · V7sus loud, off-beat stabs, a run up the top, a wide last chord. */
export function demoStringMachine(lab: Lab): void {
  const sm = makeStringMachine(lab.ctx, lab.strip('sm', { gain: 0.78, rev: 0.28, del: 0.05 }), lab.r, { onStop: lab.onStop });
  const at = beats(lab, 112);
  const bar = (4 * 60) / 112;
  sm(at(0), [53, 57, 60, 64], bar, 0.35);
  sm(at(4), [52, 55, 59, 62], bar, 0.4);
  sm(at(8), [57, 60, 64, 67, 71], bar / 2, 0.85);
  sm(at(10), [50, 57, 60, 65], bar / 2, 0.85);
  sm(at(12), [55, 60, 62, 65, 69], bar, 0.92);
  // stabs on the off-beats: Fmaj7 up high
  for (let k = 0; k < 8; k++) sm(at(16 + k * 0.5 + 0.25), [65, 69, 72, 76], 0.16, 0.7 + (k % 2) * 0.15);
  // a run to the top
  [72, 74, 76, 77, 79, 81, 84, 86].forEach((m, k) => sm(at(20 + k * 0.5), [m], 0.3, 0.6));
  // home: C major spread wide
  sm(at(24.5), [48, 55, 60, 64, 67, 72], 3.8, 0.8);
}

/** I–vi–IV–V in D with swells, a slurred line over a held chord, spiccato chords, a last swell from nothing. */
export function demoStrings(lab: Lab): void {
  const st = makeStrings(lab.ctx, lab.strip('str', { gain: 0.77, rev: 0.32, del: 0.04 }), lab.r);
  const at = beats(lab, 96);
  const D = [50, 57, 62, 66, 69], Bm = [47, 54, 62, 66, 71], G = [43, 55, 62, 67, 71], A = [45, 57, 61, 64, 69];
  const beat = 60 / 96;
  st(at(0), D, 3 * beat, 0.35, 0.6);
  st(at(3), Bm, 3 * beat, 0.4, 0.5, true);
  st(at(6), G, 3 * beat, 0.85, 0.3, true);
  st(at(9), A, 3 * beat, 0.9, -0.4, true);
  // a slurred violin line over a held low chord (the same instrument: the held chord is never cut)
  st(at(12), [38, 50, 57], 7 * beat, 0.4);
  [78, 79, 81, 83, 81, 79, 78, 76, 74].forEach((m, k) => st(at(12 + k * 0.75), [m], 0.75 * beat + 0.02, 0.62 + (k === 3 ? 0.2 : 0), 0, true));
  // spiccato: short bitten chords
  for (let k = 0; k < 8; k++) st(at(19 + k * 0.5), k % 4 === 3 ? [57, 62, 66] : [57, 61, 64], 0.11, 0.8 + (k % 2 ? -0.15 : 0.1));
  // and the last chord swells from nothing
  st(at(23.5), [38, 50, 57, 62, 66, 69, 74], 3.7, 0.95, 1);
}

/** A progression in G with vowel morphs: oo → ah, ah → oh, ee → ah, a loud D, soft women up high, men low, a line. */
export function demoChoir(lab: Lab): void {
  const ch = makeChoir(lab.ctx, lab.strip('choir', { gain: 0.72, rev: 0.4, del: 0.03 }), lab.r);
  const at = beats(lab, 92);
  const beat = 60 / 92;
  ch(at(0), [43, 50, 59, 62, 67], 3 * beat, 0.5, 'oo', 'ah');
  ch(at(3), [40, 52, 59, 62, 67], 3 * beat, 0.62, 'ah', 'oh');
  ch(at(6), [48, 55, 59, 64, 67], 3 * beat, 0.75, 'ee', 'ah');
  ch(at(9), [50, 54, 57, 62, 66], 3 * beat, 0.95, 'ah');
  ch(at(12), [67, 71, 74, 79], 2.7 * beat, 0.3, 'oo');
  ch(at(15), [43, 50, 55, 59], 2.7 * beat, 0.6, 'oh');
  [67, 69, 71, 72, 74, 76].forEach((m, k) => ch(at(18 + k * 0.5), [m], 0.32, 0.7, 'ah'));
  ch(at(21.5), [43, 55, 62, 67, 71, 74], 3.4, 0.8, 'oo', 'ah');
}

/** E major light: a soft Emaj9, loud C♯m9 · Amaj7 · B6/9, high single notes, quick repeats, a wide last chord. */
export function demoGlassPad(lab: Lab): void {
  const gp = makeGlassPad(lab.ctx, lab.strip('glass', { gain: 0.78, rev: 0.42, del: 0.12 }), lab.r);
  const at = beats(lab, 104);
  gp(at(0), [64, 68, 71, 75, 78], 2.6, 0.4);
  gp(at(5), [61, 68, 71, 75, 80], 1.9, 0.85);
  gp(at(8.5), [57, 64, 68, 73, 76], 1.9, 0.85);
  gp(at(12), [59, 66, 68, 71, 73], 1.9, 0.9);
  [83, 88, 90, 92].forEach((m, k) => gp(at(15.5 + k), [m], 1.1, 0.6));
  for (let k = 0; k < 8; k++) gp(at(19.5 + k * 0.25), [88], 0.14, 0.45 + (k % 2) * 0.15);
  gp(at(22), [52, 64, 71, 75, 80, 83], 3.3, 0.7);
}

/** A major: a soft chord opening slowly, F♯m7, a loud Dmaj9, E with a bright sweep, stabs, a line, home. */
export function demoWarmPad(lab: Lab): void {
  const wp = makeWarmPad(lab.ctx, lab.strip('warm', { gain: 0.85, rev: 0.3, del: 0.06 }), lab.r, { onStop: lab.onStop });
  const at = beats(lab, 100);
  wp(at(0), [45, 52, 57, 61, 64], 2.6, 0.3, 0.85);
  wp(at(4), [54, 57, 61, 64, 66], 2.6, 0.6);
  wp(at(8), [50, 54, 57, 61, 64, 69], 2.6, 0.95, 1.2);
  wp(at(12), [52, 56, 59, 64, 66], 2.6, 0.7, 1.5);
  for (let k = 0; k < 8; k++) wp(at(16 + k * 0.5), [57, 61, 64, 68], 0.18, 0.7 + (k % 2) * 0.2, 1.1);
  [69, 71, 73, 74, 76, 78, 80, 81].forEach((m, k) => wp(at(20 + k * 0.5), [m], 0.32, 0.65));
  wp(at(24), [45, 52, 57, 61, 64, 69, 73], 3.2, 0.8, 1);
}

/**
 * Load (dev): all five at once, a five-note chord every two seconds with tails overlapping, then an eight-second one:
 * the family's cost under a full arrangement. Every call is timed: a chord over budget (2 ms of main thread for
 * eight seconds of five notes, 1 ms for two) warns, and render.mjs lists the warning as a page error.
 */
export function demoPadsLoad(lab: Lab): void {
  const strip = (name: string) => lab.strip(name, { gain: 0.3, rev: 0.2 });
  const sm = makeStringMachine(lab.ctx, strip('sm'), lab.r, { onStop: lab.onStop });
  const st = makeStrings(lab.ctx, strip('st'), lab.r);
  const ch = makeChoir(lab.ctx, strip('ch'), lab.r);
  const gp = makeGlassPad(lab.ctx, strip('gp'), lab.r);
  const wp = makeWarmPad(lab.ctx, strip('wp'), lab.r, { onStop: lab.onStop });
  const prog = [[48, 55, 64, 67, 71], [45, 52, 60, 64, 67], [41, 53, 57, 60, 64], [43, 50, 59, 62, 67]];
  const cost: Record<string, { dur: number; ms: number }[]> = { sm: [], st: [], ch: [], gp: [], wp: [] };
  const time = (name: string, dur: number, play: () => void) => {
    const a = performance.now();
    play();
    cost[name].push({ dur, ms: performance.now() - a });
  };
  const chord = (t: number, c: number[], dur: number, k: number) => {
    time('sm', dur, () => sm(t, c, dur, 0.6));
    time('st', dur, () => st(t, c, dur, 0.7, 0.3, k > 0));
    time('ch', dur, () => ch(t, c.map((m) => m + 12), dur, 0.6, 'oo', 'ah'));
    time('gp', dur, () => gp(t, c.map((m) => m + 12), dur, 0.6));
    time('wp', dur, () => wp(t, c, dur, 0.6));
  };
  for (let k = 0; k < 6; k++) chord(lab.t0 + k * 2, prog[k % 4], 2, k);
  chord(lab.t0 + 12, prog[0], 8, 6);
  // the first chord of each warms the JIT: not counted
  for (const [name, calls] of Object.entries(cost))
    for (const c of calls.slice(1)) {
      const budget = c.dur > 4 ? 2 : 1;
      if (c.ms > budget) console.warn(`pads: ${name} took ${c.ms.toFixed(2)} ms for a ${c.dur} s chord (budget ${budget} ms)`);
    }
  (globalThis as unknown as Record<string, unknown>).padsCost = cost;
}

/** Calibration (dev): each instrument's E4 at vel 0.8, a 4-note chord and notes across the range, dry, 2.5 s apart. */
export function demoLevels(lab: Lab): void {
  const dry = (name: string) => lab.strip(name, { gain: 1 });
  const sm = makeStringMachine(lab.ctx, dry('sm'), lab.r, { onStop: lab.onStop });
  const st = makeStrings(lab.ctx, dry('st'), lab.r);
  const ch = makeChoir(lab.ctx, dry('ch'), lab.r);
  const gp = makeGlassPad(lab.ctx, dry('gp'), lab.r);
  const wp = makeWarmPad(lab.ctx, dry('wp'), lab.r, { onStop: lab.onStop });
  const all: ((t: number, notes: number[], dur: number, vel: number) => void)[] = [sm, st, ch, gp, wp];
  let t = lab.t0;
  for (const play of all) {
    play(t, [64], 1.2, 0.8);
    play(t + 2.5, [60, 64, 67, 71], 1.2, 0.8);
    for (const m of [40, 52, 76, 88]) {
      t += 2.5;
      play(t + 2.5, [m], 1.2, 0.8);
    }
    t += 5;
  }
}
