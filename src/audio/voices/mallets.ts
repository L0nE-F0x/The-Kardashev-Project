/**
 * Tuned percussion by modal synthesis (the v0.15.5 score): vibraphone, marimba, xylophone, kalimba, steel pan,
 * celesta and glockenspiel.
 *
 * A struck bar is a handful of modes, each a decaying sinusoid with its own frequency ratio and its own decay, set
 * ringing by a mallet whose contact time decides how high up the modes it reaches. Here:
 *  - the long-ringing low modes (the fundamental, the second mode) are live oscillators with envelopes of their own:
 *    a faster first stage where a resonator tube radiates the energy away, a bloom where a tube or a shell builds up,
 *    a damper that lands when the note's time is up;
 *  - everything that dies fast (the upper modes, the mallet's contact noise, the wood's knock, a box resonance, the
 *    strike's ping) is computed once in JavaScript per pitch zone (a buffer every three semitones, three or four
 *    variants that differ in every partial's level, decay and phase and in their knocks and noise, never the same one
 *    twice running) and played at the rate that lands it on the note;
 *  - velocity is the mallet's hardness: one low-pass on the buffer path and the same curve on the live modes' levels,
 *    plus a tilt (a harder stroke puts relatively more into the high modes), so soft notes are round and pure and
 *    loud ones ring with upper partials and a click, in every register;
 *  - each strike also varies on its own: the buffer's low-pass and level, the strike position (the upper modes).
 * The early reflections round an instrument hear only the strike (the buffer path): the long-ringing modes reach the
 * strip dry, so a sustained note keeps its level and its place whatever its pitch.
 * A note is 8–10 nodes. Every envelope starts and ends at zero; every note stops itself and frees its nodes.
 */
import { freeWhenDone, onPump, voiceFilter } from '../engine';
import { melody } from '../score';
import { mtof, pan as panNode, type Rnd, type Strip } from '../synth';
import { THEME, THEME_HOME } from '../theme';
import { cachedBuffer, noiseGen } from './buffers';
import { tremolo } from './fx';
import type { Lab } from './lab';

/** A mallet instrument: strike a bar at `t` (`dur` = how long until the damper or the hand lands, where there is one). */
export interface Mallet {
  (t: number, m: number, dur: number, vel: number, pan?: number): void;
  /** Several bars at once (four mallets): each at vel/√n so the chord is as loud as one note, the top voice leading. */
  chord(t: number, notes: number[], dur: number, vel: number, pan?: number): void;
  /** Make the strike buffers for notes `lo`..`hi` now (a track's setup), so no first note computes its own. */
  warm(lo: number, hi: number): void;
}

// ── small helpers ───────────────────────────────────────────────────────────────────────────
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp(k, 0, 1);
const dbGain = (db: number) => Math.pow(10, db / 20);
/** A random gain within ±`db` (uniform in dB). */
const wobble = (r: Rnd, db: number) => dbGain((r() * 2 - 1) * db);

/** WebAudio reads a low-pass's Q in dB: −3.01 dB is Q 0.707, the flat (Butterworth) curve `reach` models. */
const BUTTERWORTH = -3.01;

/**
 * A note outside an instrument's range, moved by octaves into it: a theme transposed past the bottom bar plays an
 * octave up, never a different note. (Every range here spans more than an octave.)
 */
function fold(m: number, lo: number, hi: number): number {
  if (m < lo) m += 12 * Math.ceil((lo - m) / 12);
  if (m > hi) m -= 12 * Math.ceil((m - hi) / 12);
  return m;
}

function hash(...xs: (string | number)[]): number {
  let h = 2166136261;
  for (const x of xs)
    for (const ch of String(x)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
  return h >>> 0;
}

/** A fixed trait of one bar (its tuning error, say): −1..1, the same every time that bar is struck. */
const trait = (...xs: (string | number)[]) => (hash(...xs) / 4294967296) * 2 - 1;

/**
 * The mallet's contact, as a low-pass cutoff, moving exponentially with velocity between a soft end and a hard end.
 * The soft end is the mallet's (`soft`, shifted by `mallet`: 0 the softest mallets in the bag, 1 the hardest) but never
 * under `floor` × the fundamental (a high bar throws the mallet off within half a period, so the contact can't last
 * longer than that); the hard end is the mallet's core (`hard`, shifted the same way) and at least an octave above the
 * soft end. So where the bar limits a soft stroke, a hard one still reaches higher: velocity changes the colour all the
 * way up the range, not only the level.
 */
function contact(vel: number, soft: number, hard: number, mallet: number, f0: number, floor: number): number {
  const mf = Math.pow(2, (mallet - 0.5) * 2.2);
  const lo = Math.max(soft * mf, f0 * floor);
  const hi = Math.max(hard * mf, lo * 2);
  return Math.min(16000, lo * Math.pow(hi / lo, clamp(vel, 0, 1)));
}

/**
 * A harder stroke puts relatively more of its energy into the high modes (the contact stiffens as it compresses): the
 * upper live modes and the strike buffer scale by this on top of the velocity. 1 at vel 0.8, where the levels are set;
 * 6 dB between vel 0.3 and 1.
 */
const tilt = (vel: number) => Math.pow(Math.max(vel, 1e-3) / 0.8, 0.6);

/**
 * How strongly the contact excites a mode at `f`. A mallet's force is close to a half-sine pulse as long as the
 * contact τ: flat to ~0.6/τ, then falling 12 dB an octave (the lobes between its notches). A second-order low-pass
 * at fc = 0.59/τ follows it within a few dB, and the buffer path's biquad is the same curve.
 */
const reach = (f: number, fc: number) => 1 / Math.sqrt(1 + Math.pow(f / fc, 4));

/** The live modes' attack: the contact time τ, from the cutoff. */
const contactTime = (fc: number) => clamp(0.59 / fc, 0.0004, 0.004);

/** The buffer path's low-pass: the contact's, a little more open (the mallet's own knock is not the bar's). */
const airy = (fc: number) => Math.min(18000, fc * 1.4);

/**
 * One strike's buffer low-pass: `airy`, a quarter of an octave either way at random (no two contacts are quite alike),
 * independent of the live modes.
 */
const strikeLp = (fc: number, r: Rnd) => airy(fc * Math.pow(2, (r() * 2 - 1) * 0.24));

/** The note's place in the stereo picture: its own pan plus a spread by pitch (low bars left, high right). */
const place = (m: number, p: number, spread: number, centre: number) => clamp(p + spread * clamp((m - centre) / 24, -1, 1), -1, 1);

// ── wave tables (cached per context) ───────────────────────────────────────────────────────
const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/**
 * A harmonic cluster as one oscillator (`harmonics[n]` = the n-th harmonic's level, as given: no normalisation; a
 * browser that normalises anyway only plays it a dB or two quieter).
 */
function periodic(ctx: BaseAudioContext, key: string, harmonics: number[]): PeriodicWave {
  let m = waves.get(ctx);
  if (!m) waves.set(ctx, (m = new Map()));
  let w = m.get(key);
  if (!w) {
    const n = Math.max(2, harmonics.length);
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < harmonics.length; i++) imag[i] = harmonics[i];
    w = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    m.set(key, w);
  }
  return w;
}

// ── the buffers: upper modes, contact noise, knocks ─────────────────────────────────────────
/**
 * A partial in a buffer: `r` × the zone's fundamental (or `r` Hz when `hz`), level, T60, an onset (s) and the phase it
 * starts at. `fixed`: a property of the instrument rather than of the strike (a kalimba's box), the same in every
 * variant but for its level.
 */
interface Part {
  r: number;
  a: number;
  t60: number;
  att?: number;
  hz?: boolean;
  ph?: number;
  fixed?: boolean;
}

/** A burst of filtered noise: high-pass, low-pass and/or band-pass (Hz), onset and decay (s), peak level. */
interface Noise {
  hp?: number;
  lp?: number;
  bp?: number;
  q?: number;
  att: number;
  tau: number;
  a: number;
}

interface Recipe {
  parts: Part[];
  noise: Noise[];
}

/** A JavaScript biquad (RBJ), for shaping the noise in the buffers. */
class Biquad {
  private b0: number;
  private b1: number;
  private b2: number;
  private a1: number;
  private a2: number;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(type: 'lp' | 'hp' | 'bp', f: number, q: number, sr: number) {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    if (type === 'lp') {
      this.b0 = (1 - cw) / 2 / a0;
      this.b1 = (1 - cw) / a0;
      this.b2 = this.b0;
    } else if (type === 'hp') {
      this.b0 = (1 + cw) / 2 / a0;
      this.b1 = -(1 + cw) / a0;
      this.b2 = this.b0;
    } else {
      this.b0 = al / a0;
      this.b1 = 0;
      this.b2 = -al / a0;
    }
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - al) / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** A raised-cosine onset over `n` samples (no partial ever starts on a step). */
const onset = (i: number, n: number) => (i < n ? 0.5 - 0.5 * Math.cos((Math.PI * i) / n) : 1);

/**
 * How far under a recipe's loudest part its buffer is kept. The buffer plays at the fundamental's level or below, so
 * what is cut lies under −58 dB of the note: nothing in any mix, and a shorter buffer.
 */
const KEEP_DB = 48;

/** The loudest part of a recipe (partial or noise burst). */
const loudest = (rc: Recipe) => Math.max(1e-9, ...rc.parts.map((p) => p.a), ...rc.noise.map((z) => z.a));

/** How long a buffer partial is kept: until it is KEEP_DB under the recipe's loudest part (0: not at all). */
const keepFor = (p: Part, loud: number) => (p.t60 * Math.max(0, KEEP_DB - 20 * Math.log10(loud / p.a))) / 60;

/** How long a noise burst is kept (to ~−52 dB of its own peak). */
const noiseFor = (z: Noise) => z.att + z.tau * 6;

/**
 * Write a recipe into `d` (a zone whose fundamental is `f0`): every partial a recursively rotated, decaying phasor
 * from its own phase (its onset at least a quarter of its period, so no phase starts on a step); every noise burst
 * filtered and peak-set. Partials that would pass 0.42 × the sample rate when played a semitone and a half up are left
 * out. Returns the samples used (to KEEP_DB under the loudest part), the last 15 % faded.
 */
function render(d: Float32Array, sr: number, f0: number, rc: Recipe, seed: number): number {
  const N = d.length;
  let used = 0;
  const top = (0.42 * sr) / Math.pow(2, 1.5 / 12);
  const loud = loudest(rc);
  for (const p of rc.parts) {
    const f = p.hz ? p.r : f0 * p.r;
    if (f >= top || p.a <= 0 || p.t60 <= 0) continue;
    const n = Math.min(N, Math.ceil(keepFor(p, loud) * sr));
    if (n < 8) continue;
    const dec = Math.pow(10, -3 / (p.t60 * sr)), w = (2 * Math.PI * f) / sr;
    const cr = dec * Math.cos(w), ci = dec * Math.sin(w);
    const ph = p.ph ?? 0;
    const att = Math.max(3, Math.round(Math.max(p.att ?? 0.00025, ph ? 0.25 / f : 0) * sr));
    let x = p.a * Math.cos(ph), y = p.a * Math.sin(ph);
    for (let i = 0; i < n; i++) {
      d[i] += y * onset(i, att);
      const nx = x * cr - y * ci;
      y = x * ci + y * cr;
      x = nx;
    }
    used = Math.max(used, n);
  }
  const rnd = noiseGen(seed);
  for (const z of rc.noise) {
    const n = Math.min(N, Math.ceil(noiseFor(z) * sr));
    const fs: Biquad[] = [];
    if (z.hp) fs.push(new Biquad('hp', z.hp, 0.7, sr));
    if (z.lp) fs.push(new Biquad('lp', z.lp, 0.7, sr));
    if (z.bp) fs.push(new Biquad('bp', z.bp, z.q ?? 1, sr));
    const tmp = new Float32Array(n);
    const att = Math.max(3, Math.round(z.att * sr)), k = Math.exp(-1 / (z.tau * sr));
    let env = 1, peak = 0;
    for (let i = 0; i < n; i++) {
      let v = rnd();
      for (const f of fs) v = f.run(v);
      if (i >= att) env *= k;
      tmp[i] = v * onset(i, att) * env;
      peak = Math.max(peak, Math.abs(tmp[i]));
    }
    const g = peak > 0 ? z.a / peak : 0;
    for (let i = 0; i < n; i++) d[i] += tmp[i] * g;
    used = Math.max(used, n);
  }
  used = Math.max(16, Math.min(N, used));
  const fade = Math.floor(used * 0.15);
  for (let i = 0; i < fade; i++) d[used - 1 - i] *= i / fade;
  return used;
}

/** How long a recipe's buffer must be (what `render` keeps), capped. */
function span(rc: Recipe, cap: number): number {
  const loud = loudest(rc);
  let s = 0.01;
  for (const p of rc.parts) s = Math.max(s, keepFor(p, loud));
  for (const z of rc.noise) s = Math.max(s, noiseFor(z));
  return Math.min(cap, s);
}

/**
 * One variant of a recipe. A mallet never lands twice in the same place or the same way: every partial comes out a few
 * dB louder or softer (±4 dB: the strike point against the modes' nodes) and rings a little longer or shorter, starts
 * at its own phase, the knocks and clanks (`hz` parts) move about and change level more, and the noise bursts change
 * colour, level and length. A `fixed` part (an instrument's box) keeps its frequency.
 */
function vary(rc: Recipe, rnd: () => number): Recipe {
  return {
    parts: rc.parts.map((p) => ({
      ...p,
      r: p.hz && !p.fixed ? p.r * Math.pow(2, 0.2 * rnd()) : p.r,
      a: p.a * dbGain((p.hz && !p.fixed ? 5 : 4) * rnd()),
      t60: p.t60 * Math.pow(1.25, rnd()),
      ph: Math.PI * (1 + rnd()),
    })),
    noise: rc.noise.map((z) => ({
      ...z,
      hp: z.hp && z.hp * Math.pow(2, 0.3 * rnd()),
      lp: z.lp && z.lp * Math.pow(2, 0.3 * rnd()),
      bp: z.bp && z.bp * Math.pow(2, 0.3 * rnd()),
      a: z.a * dbGain(3 * rnd()),
      tau: z.tau * Math.pow(1.3, rnd()),
    })),
  };
}

/** Bytes of buffers this family has made since the page loaded (a ceiling on its working set; for QA). */
let made = 0;
export const malletBytes = () => made;

/** The zone a note's buffer comes from: every three semitones (played at most a semitone and a half off). */
const zoneOf = (m: number) => 3 * Math.round(m / 3);

/** Each buffer's length, worked out once per buffer (a cache hit needs no recipe). */
const spans = new Map<string, number>();

/**
 * The buffer for note `m` of an instrument: its zone's, variant `k`, made the first time and kept; played at `rate`
 * it lands on the note. `recipe(f0, rnd)` writes the zone's partials and noise; `vary` makes the variant of it.
 */
function zoneBuffer(ctx: BaseAudioContext, name: string, m: number, k: number, cap: number, recipe: (f0: number, rnd: () => number) => Recipe): { buf: AudioBuffer; rate: number } {
  const zone = zoneOf(m), f0 = mtof(zone);
  const seed = hash(name, zone, k);
  const key = `mallets:${name}:${zone}:${k}`;
  let rc: Recipe | null = null;
  const make = () => {
    if (!rc) {
      const rnd = noiseGen(seed ^ 0x9e3779b9);
      rc = vary(recipe(f0, rnd), rnd);
    }
    return rc;
  };
  let len = spans.get(key);
  if (len === undefined) spans.set(key, (len = span(make(), cap)));
  const buf = cachedBuffer(ctx, key, len, (d, sr) => {
    const n = render(d, sr, f0, make(), seed);
    made += n * 4;
    return n;
  });
  return { buf, rate: Math.pow(2, (m - zone) / 12) };
}

/** A zone's variants in random order, never the same one twice in a row. */
function picker(r: Rnd, variants: number) {
  const last = new Map<number, number>();
  return (m: number) => {
    const zone = zoneOf(m);
    const prev = last.get(zone) ?? -1;
    let k = Math.floor(r() * (prev < 0 ? variants : variants - 1));
    if (prev >= 0 && k >= prev) k++;
    last.set(zone, k);
    return k;
  };
}

// ── the strike: live modes + the buffer ─────────────────────────────────────────────────────
/** One mode played live: an oscillator through its own envelope. */
interface Live {
  /** The oscillator's frequency (a harmonic cluster's wave sounds at its multiples). */
  f: number;
  /** Peak level. */
  amp: number;
  /** Seconds to fall 60 dB after the peak (in the slow stage, when there are two). */
  t60: number;
  /** A faster first stage: [seconds, dB lost in it] (a resonator radiating the energy away). */
  fast?: [number, number];
  /** A bloom: the share of the peak reached at the contact, and the seconds from there to the full peak. */
  pre?: number;
  bloom?: number;
  /** Cents sharp at the strike, settling within ~0.1 s (a tine or a shell stiffening under a hard hit). */
  glide?: number;
  /** Cents off the nominal tuning (a bar's small tuning error). */
  detune?: number;
  /** A harmonic cluster instead of a sine. */
  wave?: PeriodicWave;
  /**
   * A sine the other way up: an antisymmetric mode (a node at the bar's middle) struck on the far side of the middle
   * starts against the fundamental, not with it. Where a repeated note lands on a ringing bar, that decides whether
   * the mode builds or cancels.
   */
  flip?: boolean;
  /** A quieter second oscillator in the same envelope, [Hz, level]: a beating pair, the shimmer. */
  partner?: [number, number];
  /** Through the instrument's motor (the vibraphone's fundamental) rather than straight out. */
  motor?: boolean;
  /**
   * In a roll, how a softer stroke re-excites this mode: its level × the stroke's share to this power (1, the default,
   * for the fundamental; more for an upper mode, which a softer stroke reaches less).
   */
  vexp?: number;
}

interface Hit {
  t: number;
  /** The contact time: the live modes' attack (s). */
  attack: number;
  live: Live[];
  /** The fast-dying part, computed ahead: played at `rate`, at `bufAmp`, through a low-pass at `lp` (the mallet). */
  buf: AudioBuffer | null;
  rate: number;
  bufAmp: number;
  lp: number;
  /**
   * A second buffer beside the first (the kalimba's buzz): level, the seconds it takes to fall 60 dB, and `until`, the
   * seconds after the strike when it lets go (the tine's swing no longer reaches the buzzer).
   */
  extra?: { buf: AudioBuffer; rate: number; amp: number; t60: number; until?: number };
  /** When the damper (or a hand) lands, Infinity to ring out, and how long it takes to silence the bar (T60). */
  off: number;
  damp: number;
  pan: number;
}

/**
 * A live mode's envelope: up over the contact (through a bloom if it has one), a one- or two-stage exponential fall,
 * the damper if it lands first, and the last trace linearly to exactly zero. Returns the end time.
 */
function modeEnvelope(p: AudioParam, t: number, a: number, md: Live, off: number, damp: number): number {
  const P = md.amp, bloom = md.bloom ?? 0, tp = t + a + bloom;
  p.value = 0;
  p.setValueAtTime(0, t);
  if (bloom > 0) {
    p.linearRampToValueAtTime(P * (md.pre ?? 0.5), t + a);
    p.linearRampToValueAtTime(P, tp);
  } else p.linearRampToValueAtTime(P, tp);
  const [f1, dbLost] = md.fast ?? [0, 0];
  const k1 = Math.pow(10, -dbLost / 20);
  const level = (x: number) => P * (x <= f1 ? Math.pow(k1, x / f1) : k1 * Math.pow(10, (-3 * (x - f1)) / md.t60));
  const xEnd = ringFor(P, k1, f1, md.t60);
  const xo = Math.max(0.003, off - tp);
  if (xo < xEnd) {
    if (f1 > 0 && xo > f1) p.exponentialRampToValueAtTime(P * k1, tp + f1);
    const vo = Math.max(1e-6, level(xo));
    p.exponentialRampToValueAtTime(vo, tp + xo);
    p.exponentialRampToValueAtTime(vo * 1e-3, tp + xo + damp);
    p.linearRampToValueAtTime(0, tp + xo + damp + 0.005);
    return tp + xo + damp + 0.005;
  }
  if (f1 > 0 && xEnd > f1) p.exponentialRampToValueAtTime(P * k1, tp + f1);
  p.exponentialRampToValueAtTime(Math.max(1e-7, level(xEnd)), tp + xEnd);
  p.linearRampToValueAtTime(0, tp + xEnd + 0.005);
  return tp + xEnd + 0.005;
}

/**
 * How long a mode rings after its peak: until it is 54 dB down or under an absolute floor (−68 dB at the strip, some
 * −80 dBFS after a strip and the bus: below hearing in any mix), whichever comes first, so quiet notes (a soft strum,
 * a far comp) free their nodes sooner.
 * `k1` and `f1` are a faster first stage's level and length.
 */
function ringFor(P: number, k1: number, f1: number, t60: number): number {
  const floor = Math.max(P * 2e-3, 4e-4);
  if (P * k1 > floor) return f1 + (t60 / 3) * Math.log10((P * k1) / floor);
  return f1 > 0 ? Math.max(0.01, (f1 * Math.log(floor / P)) / Math.log(k1)) : 0.01;
}

/** A buffer's gain: open at `t` (the buffer itself starts from zero), closed by the damper if it lands first. */
function gate(p: AudioParam, t: number, amp: number, natural: number, off: number, damp: number): number {
  p.value = 0;
  p.setValueAtTime(amp, t);
  if (off >= natural) return natural;
  const at = Math.max(off, t + 0.003);
  p.setValueAtTime(amp, at);
  p.exponentialRampToValueAtTime(amp * 1e-3, at + damp);
  p.linearRampToValueAtTime(0, at + damp + 0.005);
  return at + damp + 0.005;
}

function oscFor(ctx: BaseAudioContext, md: Live, t: number): OscillatorNode {
  const o = ctx.createOscillator();
  if (md.wave) o.setPeriodicWave(md.wave);
  else if (md.flip) o.setPeriodicWave(periodic(ctx, 'minus-sine', [0, -1]));
  o.frequency.value = md.f;
  if (md.detune) o.detune.value = md.detune;
  if (md.glide) {
    o.frequency.setValueAtTime(md.f * Math.pow(2, md.glide / 1200), t);
    o.frequency.exponentialRampToValueAtTime(md.f, t + 0.11);
  }
  return o;
}

/** A mode's quieter twin a fraction of a hertz away, in the same envelope: the pair beats (the shimmer, the wah). */
function partner(ctx: BaseAudioContext, [hz, level]: [number, number], into: GainNode, srcs: AudioScheduledSourceNode[], ends: number[], end: number, nodes: AudioNode[]): void {
  const q = ctx.createOscillator();
  q.frequency.value = hz;
  const qg = ctx.createGain();
  qg.gain.value = level;
  q.connect(qg);
  qg.connect(into);
  srcs.push(q);
  ends.push(end);
  nodes.push(qg);
}

/** Start every source at `t`, stop each at its own end, and free the lot when the last one ends. */
function launch(srcs: AudioScheduledSourceNode[], ends: number[], t: number, nodes: AudioNode[]): void {
  let last = 0;
  srcs.forEach((s, i) => {
    s.start(t);
    s.stop(ends[i] + 0.02);
    if (ends[i] > ends[last]) last = i;
  });
  freeWhenDone(srcs[last], ...srcs.filter((_, i) => i !== last), ...nodes);
}

/**
 * One strike: the live modes, the buffer through the mallet's low-pass, an extra layer, one panner (two with a motor).
 * The buffer and the extra layer also feed the stage's early reflections (the live modes never do).
 */
function strike(ctx: BaseAudioContext, st: Stage, h: Hit, motor?: AudioNode): void {
  const out = panNode(ctx, h.pan);
  out.connect(st.dry);
  const nodes: AudioNode[] = [out];
  const srcs: AudioScheduledSourceNode[] = [];
  const ends: number[] = [];
  let mout: AudioNode | null = null;
  for (const md of h.live) {
    if (md.amp < 1e-5 || md.f * (md.wave ? 4 : 1) > 0.45 * ctx.sampleRate) continue;
    const g = ctx.createGain();
    const end = modeEnvelope(g.gain, h.t, h.attack, md, h.off, h.damp);
    const o = oscFor(ctx, md, h.t);
    o.connect(g);
    srcs.push(o);
    ends.push(end);
    if (md.partner) partner(ctx, md.partner, g, srcs, ends, end, nodes);
    if (md.motor && motor) {
      if (!mout) {
        mout = panNode(ctx, h.pan);
        mout.connect(motor);
        nodes.push(mout);
      }
      g.connect(mout);
    } else g.connect(out);
    nodes.push(g);
  }
  if (h.buf && h.bufAmp > 1e-5) {
    const src = ctx.createBufferSource();
    src.buffer = h.buf;
    src.playbackRate.value = h.rate;
    const lp = voiceFilter(ctx);
    lp.type = 'lowpass';
    lp.frequency.value = h.lp;
    lp.Q.value = BUTTERWORTH;
    const g = ctx.createGain();
    const end = gate(g.gain, h.t, h.bufAmp, h.t + h.buf.duration / h.rate, h.off, h.damp);
    src.connect(lp);
    lp.connect(g);
    g.connect(out);
    if (st.room) g.connect(st.room);
    srcs.push(src);
    ends.push(end);
    nodes.push(lp, g);
  }
  if (h.extra && h.extra.amp > 1e-5) {
    const x = h.extra;
    const src = ctx.createBufferSource();
    src.buffer = x.buf;
    src.playbackRate.value = x.rate;
    const g = ctx.createGain();
    // it rattles until the swing no longer reaches it (or a hand stops the tine), and lets go over a few cycles; a
    // buffer that runs out first ends on its own faded tail
    const natural = h.t + x.buf.duration / x.rate;
    const stop = Math.max(h.t + 0.01, Math.min(natural, h.t + (x.until ?? Infinity), Math.max(h.off, h.t + 0.01)));
    g.gain.value = 0;
    g.gain.setValueAtTime(x.amp, h.t);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-7, x.amp * Math.pow(10, (-3 * (stop - h.t)) / x.t60)), stop);
    g.gain.linearRampToValueAtTime(0, stop + 0.08);
    src.connect(g);
    g.connect(out);
    if (st.room) g.connect(st.room);
    srcs.push(src);
    ends.push(Math.min(natural, stop + 0.08));
    nodes.push(g);
  }
  if (srcs.length) launch(srcs, ends, h.t, nodes);
  else out.disconnect();
}

/**
 * A roll (a long note on a pan, a marimba chorale): strokes alternating hands at `t`s, `v` each stroke's level as a
 * share of the note's (the first, the accent, 1). The live modes are one oscillator set, re-excited by every stroke
 * (the level wanders a little, as a real roll's does). The strokes' attack buffers go through the two hands: each a
 * gain, set to the coming stroke's level just before it lands, and a low-pass, the accent's at `h.lp` and every softer
 * stroke's at `lpSoft` (a softer stroke is a longer contact: darker as well as quieter). One node a stroke.
 */
function strikeRoll(ctx: BaseAudioContext, st: Stage, h: Hit, strokes: { t: number; v: number }[], bufFor: () => { buf: AudioBuffer; rate: number }, r: Rnd, lpSoft: number): void {
  const out = panNode(ctx, h.pan);
  out.connect(st.dry);
  const shared: AudioNode[] = [out];
  const srcs: AudioScheduledSourceNode[] = [];
  const ends: number[] = [];
  const t0 = strokes[0].t;
  for (const md of h.live) {
    if (md.amp < 1e-5 || md.f * (md.wave ? 4 : 1) > 0.45 * ctx.sampleRate) continue;
    const g = ctx.createGain();
    const p = g.gain;
    p.value = 0;
    p.setValueAtTime(0, t0);
    let tc = t0, vc = 0;
    strokes.forEach((s, i) => {
      const vb = vc * Math.pow(10, (-3 * (s.t - tc)) / md.t60);
      if (vc > 0) p.exponentialRampToValueAtTime(Math.max(1e-6, vb), s.t);
      // each stroke lands at a random phase against the ringing bar: on average the energies add; a player keeping a
      // roll even leaves only a little of the random walk (a pure random-phase sum wanders ±10 dB)
      const b = md.amp * Math.pow(s.v, md.vexp ?? 1);
      const va = i === 0 ? b : Math.sqrt(vb * vb + b * b) * (0.93 + 0.14 * r());
      // the accent wakes the bar as a single strike does (its bloom); the later strokes find it ringing
      const bloom = i === 0 ? md.bloom ?? 0 : 0;
      // (the accent peaks with its strike buffer, as a single strike does; a later stroke's swell takes a little longer)
      const rise = bloom > 0 ? bloom : i === 0 ? 0 : 0.0015;
      if (bloom > 0) p.linearRampToValueAtTime(va * (md.pre ?? 0.5), s.t + h.attack);
      p.linearRampToValueAtTime(va, s.t + h.attack + rise);
      tc = s.t + h.attack + rise;
      vc = va;
    });
    const xEnd = ringFor(vc, 1, 0, md.t60);
    p.exponentialRampToValueAtTime(Math.max(1e-7, vc * Math.pow(10, (-3 * xEnd) / md.t60)), tc + xEnd);
    p.linearRampToValueAtTime(0, tc + xEnd + 0.005);
    // the accent's pitch settles as a single strike's does (the softer strokes' glides are a quarter of it: left out)
    const o = oscFor(ctx, md, t0);
    o.connect(g);
    srcs.push(o);
    ends.push(tc + xEnd + 0.005);
    if (md.partner) partner(ctx, md.partner, g, srcs, ends, tc + xEnd + 0.005, shared);
    g.connect(out);
    shared.push(g);
  }
  // the strokes' attacks, through the two hands
  const hands = [0, 1].map((k) => {
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = voiceFilter(ctx);
    lp.type = 'lowpass';
    lp.Q.value = BUTTERWORTH;
    lp.frequency.value = k === 0 ? h.lp : lpSoft;
    g.connect(lp);
    lp.connect(out);
    if (st.room) lp.connect(st.room);
    shared.push(g, lp);
    return { g, lp, level: 0 };
  });
  let lastEnd = Math.max(t0, ...ends);
  strokes.forEach((s, i) => {
    const hand = hands[i % 2];
    // the buffer carries the upper modes and the contact: a softer stroke's falls faster than its level (the tilt)
    const level = h.bufAmp * Math.pow(s.v, 1.6);
    // the hand's gain moves to this stroke's level in the 3 ms before it lands (its earlier strokes' tails, nearly
    // gone by then, go along), and the left hand turns to the softer strokes' colour after the accent
    const prep = s.t - 0.003;
    hand.g.gain.setValueAtTime(hand.level, prep);
    hand.g.gain.linearRampToValueAtTime(level, s.t);
    if (i === 2) hand.lp.frequency.setValueAtTime(lpSoft, prep);
    hand.level = level;
    const b = bufFor();
    const src = ctx.createBufferSource();
    src.buffer = b.buf;
    src.playbackRate.value = b.rate;
    src.connect(hand.g);
    const end = s.t + b.buf.duration / b.rate;
    src.start(s.t);
    src.stop(end + 0.02);
    freeWhenDone(src);
    lastEnd = Math.max(lastEnd, end);
  });
  if (!srcs.length) return;
  // the oscillators carry the shared nodes; if a stroke's buffer outlives them, the first holds on until it is done
  srcs.forEach((s, i) => {
    s.start(t0);
    s.stop((i === 0 ? Math.max(ends[i], lastEnd) : ends[i]) + 0.02);
  });
  freeWhenDone(srcs[0], ...srcs.slice(1), ...shared);
}

/**
 * The strokes of a roll lasting `dur`: alternating hands at `rate` a second, the first accented. Levels are shares of
 * the note's own (the accent 1, the rest about half): the note's velocity is applied once, by the caller.
 */
function rollStrokes(t: number, dur: number, rate: number, r: Rnd): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  const gap = 1 / rate;
  const n = Math.max(2, Math.floor(dur / gap));
  for (let i = 0; i < n; i++) {
    const v = i === 0 ? 1 : (i % 2 ? 0.46 : 0.52) * (0.9 + r() * 0.2);
    out.push({ t: t + i * gap + (i ? (r() - 0.5) * gap * 0.16 : 0), v });
  }
  return out;
}

/**
 * A note function made into an instrument: arguments that can't be played are dropped (never a NaN in the graph), and
 * it gains its four-mallet chord and `warm` (`warm1(m)` makes the buffers note `m` would use).
 */
function instrument(note: (t: number, m: number, dur: number, vel: number, pan: number) => void, r: Rnd, warm1: (m: number, k: number) => void, variants: number): Mallet {
  const fn = ((t: number, m: number, dur: number, vel: number, p = 0) => {
    if (!Number.isFinite(t) || !Number.isFinite(m) || !(vel > 0)) return;
    note(t, m, Number.isFinite(dur) ? Math.max(0, dur) : 0, Math.min(1, vel), Number.isFinite(p) ? p : 0);
  }) as Mallet;
  fn.chord = (t, notes, dur, vel, p = 0) => {
    const ns = [...notes].sort((a, b) => a - b);
    const k = 1 / Math.sqrt(Math.max(1, ns.length));
    ns.forEach((m, i) => fn(t + r() * 0.007, m, dur, vel * k * (i === ns.length - 1 ? 1.12 : 0.96), p));
  };
  fn.warm = (lo, hi) => {
    // live, a buffer at a time while the page is idle (a zone's variants were 10–40 ms in one go, in the frame a
    // piece started); in Node at once
    for (let m = zoneOf(lo); m <= hi + 1; m += 3) for (let k = 0; k < variants; k++) idle(() => warm1(m, k));
  };
  return fn;
}

// buffers made ahead, one at a time while the page is idle (each 1–6 ms)
const ahead: (() => void)[] = [];
let booked = false;

function idle(job: () => void): void {
  if (typeof window === 'undefined') return void job();
  ahead.push(job);
  if (booked) return;
  booked = true;
  const run = (dl?: IdleDeadline) => {
    const t0 = performance.now();
    do {
      try {
        ahead.shift()!();
      } catch {
        // a broken buffer is made (or not) when it is played
      }
    } while (ahead.length && performance.now() - t0 < 8 && (dl && !dl.didTimeout ? dl.timeRemaining() > 6 : performance.now() - t0 < 3));
    booked = false;
    if (ahead.length) {
      booked = true;
      later(run);
    }
  };
  later(run);
}

function later(fn: (dl?: IdleDeadline) => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 300 });
  else setTimeout(fn, 16);
}

/** Where an instrument's notes go: `dry` straight to the strip, `room` (null when off) into its early reflections. */
interface Stage {
  dry: AudioNode;
  room: AudioNode | null;
}

/**
 * The instrument on a stage: its dry sound and two early reflections of its strikes (the floor and the back wall, 11
 * and 17 ms late, darker, one to each side), so the attack stands in a room with some width before the hall takes
 * over. Only the strike feeds them (the buffer path: noise, knocks, the fast upper modes): on a mode that rings for
 * seconds two fixed reflections are a comb, a level and a place that change with the pitch, whereas on a strike they
 * read as the room. Made once per instrument (no oscillators: nothing to stop).
 */
function stage(ctx: BaseAudioContext, s: Strip, amount: number): Stage {
  if (amount <= 0) return { dry: s.in, room: null };
  const input = ctx.createGain();
  s.nodes.push(input);
  for (const [delay, side, cut] of [[0.0113, -0.85, 3800], [0.0171, 0.85, 3000]] as const) {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = delay;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cut;
    f.Q.value = BUTTERWORTH;
    const g = ctx.createGain();
    g.gain.value = amount;
    const p = panNode(ctx, side);
    input.connect(d);
    d.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(s.in);
    s.nodes.push(d, f, g, p);
  }
  return { dry: s.in, room: input };
}

// ── the instruments ─────────────────────────────────────────────────────────────────────────
interface Common {
  /** Mallet hardness: 0 the softest in the bag … 1 the hardest (default 0.5). */
  mallet?: number;
  /** How far the range spreads across the stereo picture, low left and high right (0 = all at `pan`). */
  spread?: number;
  /** Early reflections of the strikes (0 = none, default 0.2): width and a room before the hall. */
  room?: number;
}

/** A rolled instrument's options: `roll` strokes a second (0 = never), for notes held `rollFrom` seconds or longer. */
interface Rolls {
  roll?: number;
  /**
   * The shortest note that is rolled (s, default 0.9): a half note at 132 bpm and anything longer is rolled, a quarter
   * note is struck down to 66 bpm.
   */
  rollFrom?: number;
}

/**
 * Vibraphone: aluminium bars tuned 1 : 4 : 10 over resonator tubes, yarn mallets. The fundamental rings for seconds
 * (faster at first while the tube radiates); the two-octave partial gives the metal; a hard stroke adds the tenth
 * partial and a clank. `motor` (Hz, 0 = off) turns the discs in the tubes: a tremolo on the fundamental only, the
 * strike and the upper partials untouched, as on the real one (it needs `onStop`, which stops its LFO: without one the
 * vibes play with the motor off). The damper lands at `dur` unless `pedal`.
 */
export function makeVibes(ctx: BaseAudioContext, s: Strip, r: Rnd, o: Common & { motor?: number; depth?: number; pedal?: boolean; onStop?: (fn: () => void) => void } = {}): Mallet {
  const { motor = 0, depth = 0.55, pedal = false, mallet = 0.5, spread = 0.3, room = 0.2 } = o;
  const st = stage(ctx, s, room);
  let motorIn: AudioNode | undefined;
  if (motor > 0 && !o.onStop) console.warn('makeVibes: a motor needs onStop (its LFO would never stop); playing without it');
  else if (motor > 0 && o.onStop) {
    const fx = tremolo(ctx, st.dry, { rate: motor, depth });
    o.onStop(fx.stop);
    motorIn = fx.input;
  }
  // the motor's dips, made up on average
  const makeUp = motorIn ? 1 / (1 - depth / 3) : 1;
  const V = 3, pick = picker(r, V);
  const ring = (f0: number) => clamp(9 * Math.pow(f0 / 175, -0.6), 1.8, 10);
  const recipe = (f0: number, rnd: () => number): Recipe => {
    const T = ring(f0);
    const clank = [0, 1, 2].map(() => ({ r: 3200 + 5500 * Math.abs(rnd()), a: 0.012 + 0.012 * Math.abs(rnd()), t60: 0.03 + 0.05 * Math.abs(rnd()), hz: true }));
    return {
      parts: [
        { r: 9.92 * (1 + 0.003 * rnd()), a: 0.17, t60: T * 0.11 },
        { r: 2.63 * (1 + 0.02 * rnd()), a: 0.018, t60: T * 0.12 },
        { r: 15.3 * (1 + 0.01 * rnd()), a: 0.05, t60: T * 0.05 },
        { r: 21.6 * (1 + 0.01 * rnd()), a: 0.03, t60: T * 0.03 },
        { r: 29.1 * (1 + 0.01 * rnd()), a: 0.018, t60: T * 0.02 },
        ...clank,
      ],
      noise: [{ hp: 140, lp: 1500, att: 0.0005, tau: 0.0022, a: 0.12 }],
    };
  };
  const note = (t: number, m: number, dur: number, vel: number, p: number) => {
    m = fold(m, 36, 108);
    vel = clamp(vel, 0, 1) * (0.96 + r() * 0.08);
    const f0 = mtof(m), T = ring(f0);
    const fc = contact(vel, 300, 3200, mallet, f0, 1.4);
    const A = 0.44 * vel, tl = tilt(vel);
    // where the mallet lands against the 4× mode's node (the bar's middle): ±3 dB of it
    const pos = 0.5 + 0.5 * r();
    const f2 = f0 * 4 * (1 + 0.0012 * trait('vibes', m, 2));
    const b = zoneBuffer(ctx, 'vibes', m, pick(m), 0.8, recipe);
    t += r() * 0.0012;
    strike(ctx, st, {
      t,
      attack: contactTime(fc),
      live: [
        // the tube takes a few cycles to wake (the bloom), then radiates fast for a moment (the first stage)
        { f: f0, detune: 1.2 * trait('vibes', m, 1), amp: A * makeUp, t60: T, pre: 0.62, bloom: clamp(0.02 * Math.pow(349 / f0, 0.7), 0.004, 0.04), fast: [0.35, 3.5], motor: true },
        { f: f2, amp: A * 0.42 * pos * reach(f2, fc) * tl, t60: T * 0.36, flip: r() < 0.5 },
      ],
      buf: b.buf,
      rate: b.rate,
      bufAmp: A * tl * wobble(r, 2),
      lp: strikeLp(fc, r),
      off: pedal ? Infinity : t + Math.max(0.04, dur),
      damp: 0.22,
      pan: place(m, p, spread, 70),
    }, motorIn);
  };
  return instrument(note, r, (m, k) => void zoneBuffer(ctx, 'vibes', m, k, 0.8, recipe), V);
}

/**
 * Marimba: rosewood bars tuned 1 : 4 : 10 over tubes that boost the fundamental. Low bars boom (the tube takes a
 * moment to build, then the note rings for seconds), high ones are short and woody. Velocity is the yarn's give: a
 * soft stroke is nearly a pure tone, a hard one brings the two-octave partial, the tenth and the wood's knock.
 * `roll` (strokes a second, 0 = off, the default) rolls the notes held `rollFrom` seconds or more.
 */
export function makeMarimba(ctx: BaseAudioContext, s: Strip, r: Rnd, o: Common & Rolls = {}): Mallet {
  const { mallet = 0.5, spread = 0.35, roll = 0, rollFrom = 0.9, room = 0.2 } = o;
  const st = stage(ctx, s, room);
  const V = 4, pick = picker(r, V);
  const ring = (f0: number) => clamp(1.5 * Math.pow(f0 / 262, -0.75), 0.2, 4.5);
  const recipe = (f0: number, rnd: () => number): Recipe => {
    const T = ring(f0);
    const knockAt = 1700 * Math.pow(f0 / 262, 0.25);
    const knock = [0, 1, 2, 3, 4].map(() => ({ r: knockAt * (0.6 + 1.6 * Math.abs(rnd())), a: 0.055 + 0.055 * Math.abs(rnd()), t60: 0.008 + 0.018 * Math.abs(rnd()), hz: true }));
    return {
      parts: [
        { r: 9.9 * (1 + 0.004 * rnd()), a: 0.3, t60: T * 0.1 },
        { r: 17.6 * (1 + 0.01 * rnd()), a: 0.1, t60: T * 0.045 },
        { r: 6.4 * (1 + 0.03 * rnd()), a: 0.035, t60: T * 0.08 },
        { r: 13.1 * (1 + 0.03 * rnd()), a: 0.03, t60: T * 0.04 },
        ...knock,
      ],
      noise: [{ hp: 90, lp: 2300, att: 0.0004, tau: 0.0018, a: 0.2 }],
    };
  };
  const note = (t: number, m: number, dur: number, vel: number, p: number) => {
    m = fold(m, 28, 104);
    vel = clamp(vel, 0, 1) * (0.95 + r() * 0.1);
    const f0 = mtof(m), T = ring(f0);
    const fc = contact(vel, 280, 2200, mallet, f0, 1.5);
    const low = clamp((60 - m) / 24, 0, 1);
    // the bass bars' big tubes give them more than enough: the bottom octaves are levelled with the rest (voiced, as
    // a maker evens out a real one: the tenor octave's strong two-octave partial makes it the peakiest)
    const A = 0.45 * vel * Math.pow(f0 / 262, f0 < 262 ? 0.12 : -0.05) * (1 - 0.11 * Math.sin(Math.PI * low)), tl = tilt(vel);
    const pos = 0.45 + 0.55 * r();
    const f2 = f0 * 3.98 * (1 + 0.002 * trait('marimba', m, 2));
    const h: Hit = {
      t: t + r() * 0.0012,
      attack: contactTime(fc),
      live: [
        {
          f: f0,
          detune: 1.2 * trait('marimba', m, 1),
          amp: A,
          t60: T,
          pre: lerp(0.85, 0.45, low),
          bloom: clamp(0.012 * Math.pow(262 / f0, 0.8), 0.002, 0.045),
          fast: [0.25, 3],
          // low bars and their tubes are never quite one frequency: the slow wah of the bottom octaves
          partner: low > 0.2 ? [f0 * (1 + (0.004 + 0.004 * Math.abs(trait('marimba', m, 4))) * low), 0.08 + 0.1 * low] : undefined,
        },
        { f: f2, amp: A * (0.55 + 0.1 * low) * pos * reach(f2, fc) * tl, t60: T * 0.3, vexp: 1.6, flip: r() < 0.5 },
      ],
      buf: null,
      rate: 1,
      bufAmp: A * tl * wobble(r, 2),
      lp: strikeLp(fc, r),
      off: Infinity,
      damp: 0.1,
      pan: place(m, p, spread, 64),
    };
    if (roll > 0 && dur >= rollFrom) {
      const soft = airy(contact(vel * 0.5, 280, 2200, mallet, f0, 1.5));
      strikeRoll(ctx, st, h, rollStrokes(h.t, dur, roll, r), () => zoneBuffer(ctx, 'marimba', m, pick(m), 0.6, recipe), r, soft);
      return;
    }
    const b = zoneBuffer(ctx, 'marimba', m, pick(m), 0.6, recipe);
    h.buf = b.buf;
    h.rate = b.rate;
    strike(ctx, st, h);
  };
  return instrument(note, r, (m, k) => void zoneBuffer(ctx, 'marimba', m, k, 0.6, recipe), V);
}

/**
 * Xylophone: hard rosewood bars tuned 1 : 3 : 6 (the twelfth gives it its hollow brightness), short tubes, hard
 * mallets. Short, bright, with a crack on every stroke. `roll` and `rollFrom` as on the marimba.
 */
export function makeXylophone(ctx: BaseAudioContext, s: Strip, r: Rnd, o: Common & Rolls = {}): Mallet {
  const { mallet = 0.6, spread = 0.3, roll = 0, rollFrom = 0.9, room = 0.2 } = o;
  const st = stage(ctx, s, room);
  const V = 4, pick = picker(r, V);
  const ring = (f0: number) => clamp(0.85 * Math.pow(f0 / 523, -0.7), 0.12, 1.6);
  const recipe = (f0: number, rnd: () => number): Recipe => {
    const T = ring(f0);
    const knockAt = 3600 * Math.pow(f0 / 523, 0.2);
    const knock = [0, 1, 2, 3].map(() => ({ r: knockAt * (0.6 + 1.2 * Math.abs(rnd())), a: 0.04 + 0.04 * Math.abs(rnd()), t60: 0.005 + 0.012 * Math.abs(rnd()), hz: true }));
    return {
      parts: [
        { r: 6.25 * (1 + 0.01 * rnd()), a: 0.32, t60: T * 0.11 },
        { r: 10.1 * (1 + 0.01 * rnd()), a: 0.14, t60: T * 0.05 },
        { r: 14.6 * (1 + 0.01 * rnd()), a: 0.07, t60: T * 0.03 },
        ...knock,
      ],
      noise: [
        { hp: 800, bp: 4200, q: 0.7, att: 0.00015, tau: 0.0007, a: 0.2 },
        { hp: 120, lp: 1800, att: 0.0003, tau: 0.0012, a: 0.08 },
      ],
    };
  };
  const note = (t: number, m: number, dur: number, vel: number, p: number) => {
    m = fold(m, 48, 112);
    vel = clamp(vel, 0, 1) * (0.95 + r() * 0.1);
    const f0 = mtof(m), T = ring(f0);
    const fc = contact(vel, 600, 6000, mallet, f0, 1.8);
    const A = 0.48 * vel * Math.pow(f0 / 523, -0.05), tl = tilt(vel);
    const pos = 0.6 + 0.4 * r();
    const f2 = f0 * 3 * (1 + 0.002 * trait('xylo', m, 2));
    const h: Hit = {
      t: t + r() * 0.001,
      attack: contactTime(fc),
      live: [
        { f: f0, detune: trait('xylo', m, 1), amp: A, t60: T, fast: [0.08, 2] },
        { f: f2, amp: A * 0.6 * pos * reach(f2, fc) * tl, t60: T * 0.35, vexp: 1.6, flip: r() < 0.5 },
      ],
      buf: null,
      rate: 1,
      bufAmp: A * tl * wobble(r, 2),
      lp: strikeLp(fc, r),
      off: Infinity,
      damp: 0.08,
      pan: place(m, p, spread, 84),
    };
    if (roll > 0 && dur >= rollFrom) {
      const soft = airy(contact(vel * 0.5, 600, 6000, mallet, f0, 1.8));
      strikeRoll(ctx, st, h, rollStrokes(h.t, dur, roll, r), () => zoneBuffer(ctx, 'xylo', m, pick(m), 0.3, recipe), r, soft);
      return;
    }
    const b = zoneBuffer(ctx, 'xylo', m, pick(m), 0.3, recipe);
    h.buf = b.buf;
    h.rate = b.rate;
    strike(ctx, st, h);
  };
  return instrument(note, r, (m, k) => void zoneBuffer(ctx, 'xylo', m, k, 0.3, recipe), V);
}

/**
 * Kalimba: steel tines over a hollow box, plucked by thumbs. The tines aren't tuned above their fundamental (the
 * overtones near 5.4× and 13.8× wander tine to tine), the box knocks and colours the low notes, neighbouring tines
 * ring along, the thumbnail ticks. `buzz` (0..1) adds the rattle of the buzzers that ride on the tines: it follows the
 * tine's swing and lets go when the swing no longer reaches it, so a hard pluck rattles longer; `damp` lets the thumb
 * stop a tine at `dur`.
 */
export function makeKalimba(ctx: BaseAudioContext, s: Strip, r: Rnd, o: Common & { buzz?: number; damp?: boolean } = {}): Mallet {
  const { mallet = 0.5, spread = 0.25, buzz = 0, damp = false, room = 0.2 } = o;
  const st = stage(ctx, s, room);
  const V = 4, pick = picker(r, V);
  const ring = (f0: number) => clamp(3.8 * Math.pow(f0 / 262, -0.55), 0.9, 5.5);
  // the box is the same box under every tine: its modes are the instrument's, not the note's
  const box = [320, 880, 1900].map((hz, i) => hz * (1 + 0.03 * trait('kalimba-box', i)));
  const recipe = (f0: number, rnd: () => number): Recipe => {
    const T = ring(f0);
    return {
      parts: [
        { r: 13.8 * (1 + 0.02 * rnd()), a: 0.12, t60: T * 0.045 },
        // the neighbours ringing along: the octave and the twelfth tines, slow to wake
        { r: 2 * (1 + 0.0015 * rnd()), a: 0.09, t60: 0.42, att: 0.04 },
        { r: 3 * (1 + 0.002 * rnd()), a: 0.05, t60: 0.34, att: 0.05 },
        // the box: its air (Helmholtz) and its board
        { r: box[0], a: 0.1, t60: 0.07, hz: true, fixed: true },
        { r: box[1], a: 0.05, t60: 0.035, hz: true, fixed: true },
        { r: box[2], a: 0.03, t60: 0.02, hz: true, fixed: true },
      ],
      noise: [
        { hp: 1500, bp: 3800, q: 1.2, att: 0.0001, tau: 0.0005, a: 0.09 },
        { lp: 700, att: 0.0008, tau: 0.003, a: 0.05 },
      ],
    };
  };
  // the buzzers: a rattle that fires on each swing of the tine past them, each touch shorter as the swing narrows;
  // the buffer itself fades only slowly (the note's own gain follows its tine)
  const BUZZ_LEN = 1.5, BUZZ_TAU = 2;
  const buzzFill = (d: Float32Array, sr: number, f0: number, seed: number): number => {
    const rnd = noiseGen(seed);
    const hp = new Biquad('hp', 1200, 0.7, sr), bp = new Biquad('bp', 3000, 0.8, sr), lp = new Biquad('lp', 7000, 0.7, sr);
    const n = d.length, w = (2 * Math.PI * f0) / sr, k = Math.exp(-1 / (BUZZ_TAU * sr));
    let env = 1, peak = 0;
    for (let i = 0; i < n; i++) {
      const thr = 0.5 + 0.35 * (i / n);
      const swing = Math.max(0, Math.abs(Math.sin(w * i)) - thr) / (1 - thr);
      env *= k;
      d[i] = lp.run(bp.run(hp.run(rnd()))) * swing * env * onset(i, 48);
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < n; i++) d[i] /= peak || 1;
    const fade = Math.floor(n * 0.15);
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
    made += n * 4;
    return n;
  };
  // a rattle's colour hardly cares about the note: one buffer every six semitones, its pulse still on the tine's
  const buzzBuffer = (m: number) => {
    const zone = 6 * Math.round(m / 6);
    const buf = cachedBuffer(ctx, `mallets:kalimba-buzz:${zone}`, BUZZ_LEN, (d, sr) => buzzFill(d, sr, mtof(zone), hash('buzz', zone)));
    return { buf, rate: Math.pow(2, (m - zone) / 12) };
  };
  const note = (t: number, m: number, dur: number, vel: number, p: number) => {
    m = fold(m, 40, 100);
    vel = clamp(vel, 0, 1) * (0.95 + r() * 0.1);
    const f0 = mtof(m), T = ring(f0);
    const fc = contact(vel, 600, 4500, mallet, f0, 1.5);
    const A = 0.48 * vel * Math.pow(f0 / 262, -0.05), tl = tilt(vel);
    // how far along the tine and how squarely the thumb takes it: the overtone a couple of dB either way
    const pos = 0.65 + 0.35 * r();
    const f2 = f0 * 5.4 * (1 + 0.012 * trait('kalimba', m, 2));
    const b = zoneBuffer(ctx, 'kalimba', m, pick(m), 0.42, recipe);
    let extra: Hit['extra'];
    if (buzz > 0) {
      // the rattle falls a quarter faster than the tine (the buzzer's taps weaken faster than the swing), on top of the
      // buffer's own slow fade, and lets go some 25 dB under a full pluck's peak (the swing no longer reaches it)
      const fall = 1.25 * (60 / T) - 8.686 / BUZZ_TAU;
      extra = { ...buzzBuffer(m), amp: A * buzz * 0.26 * Math.sqrt(vel / 0.8), t60: 60 / Math.max(6, fall), until: Math.max(0.15, (T / 60) * (25 + 20 * Math.log10(vel))) };
    }
    t += r() * 0.0015;
    strike(ctx, st, {
      t,
      attack: contactTime(fc) * 1.3,
      live: [
        // tines are tuned by ear and drift: a few cents either way, the same every time
        { f: f0, detune: 3 * trait('kalimba', m, 1), amp: A, t60: T, glide: 5 * vel * vel },
        { f: f2, amp: A * 0.5 * pos * reach(f2, fc) * tl, t60: T * 0.13 },
      ],
      buf: b.buf,
      rate: b.rate,
      bufAmp: A * tl * wobble(r, 2),
      lp: strikeLp(fc, r),
      extra,
      off: damp ? t + Math.max(0.05, dur) : Infinity,
      damp: 0.12,
      pan: place(m, p, spread, 72),
    });
  };
  return instrument(note, r, (m, k) => {
    zoneBuffer(ctx, 'kalimba', m, k, 0.42, recipe);
    if (buzz > 0 && k === 0) buzzBuffer(m);
  }, V);
}

/**
 * Steel pan (a tenor, the lead): each note area a shallow dome tuned to its fundamental, octave and twelfth. The
 * octave blooms a moment after the strike (the shell hands it energy) and sings nearly as long as the fundamental,
 * beating slowly against the fundamental's own trace of it: the shimmer. The twelfth blooms with it and fades sooner,
 * so the note grows purer as it rings. The strike is a bright ping (the shell's higher harmonics, falling fast) and the
 * rubber tip. Hard strokes start a few cents sharp, and bring the octave and the twelfth up more than the fundamental
 * (the shell's coupling is nonlinear). Notes held `rollFrom` seconds or more are rolled (`roll` strokes a second, 0 =
 * never), as pan players sustain.
 */
export function makeSteelPan(ctx: BaseAudioContext, s: Strip, r: Rnd, o: Common & Rolls = {}): Mallet {
  const { mallet = 0.5, spread = 0.25, roll = 13, rollFrom = 0.9, room = 0.2 } = o;
  const st = stage(ctx, s, room);
  const V = 4, pick = picker(r, V);
  const ring = (f0: number) => clamp(2.6 * Math.pow(f0 / 294, -0.6), 0.7, 4);
  const recipe = (f0: number, rnd: () => number): Recipe => {
    const T = ring(f0);
    const harm: Part[] = [];
    // the ping: the fourth harmonic up (the fundamental, octave and twelfth ring live)
    for (let k = 4; k <= 10; k++) harm.push({ r: k * (1 + 0.0015 * rnd()), a: 0.42 * Math.pow(0.6, k - 3), t60: (T * 0.22) / Math.pow(k - 2, 0.7) });
    const skirt = [2.43, 3.62, 4.47, 5.71, 7.3].map((x) => ({ r: x * (1 + 0.01 * rnd()), a: 0.02 + 0.015 * Math.abs(rnd()), t60: 0.12 + 0.25 * Math.abs(rnd()) }));
    return {
      parts: [...harm, ...skirt],
      noise: [
        { hp: 300, bp: 2200, q: 0.8, att: 0.00025, tau: 0.0012, a: 0.09 },
        { hp: 5000, att: 0.0001, tau: 0.00035, a: 0.04 },
      ],
    };
  };
  const note = (t: number, m: number, dur: number, vel: number, p: number) => {
    m = fold(m, 48, 100);
    vel = clamp(vel, 0, 1) * (0.95 + r() * 0.1);
    const f0 = mtof(m), T = ring(f0);
    const fc = contact(vel, 900, 5000, mallet, f0, 2.2);
    // the octave and the twelfth are fed by the shell's nonlinear coupling as well as by the stroke: they grow faster
    // with it than the other instruments' upper modes do (9 dB against the fundamental from vel 0.3 to 1)
    const A = 0.4 * vel * Math.pow(f0 / 294, -0.05), tl = Math.pow(tilt(vel), 1.5);
    const pos = 0.75 + 0.25 * r();
    // the fundamental's oscillator carries a trace of the octave too; the octave proper sits a hertz or two above it,
    // so the two beat slowly as they decay at their own rates: the shimmer, with no extra oscillator
    const beat = 0.8 + 1.4 * Math.abs(trait('pan', m, 3));
    const tune = 2 * trait('pan', m, 1);
    const glide = 7 * vel * vel;
    const bloom = clamp(0.03 * Math.pow(294 / f0, 0.4), 0.015, 0.05);
    const h: Hit = {
      t: t + r() * 0.0012,
      attack: contactTime(fc),
      live: [
        { f: f0, wave: periodic(ctx, 'pan-fund', [0, 1, 0.15]), detune: tune, amp: A, t60: T, fast: [0.12, 1.5], glide },
        {
          f: 2 * f0,
          glide,
          detune: tune + 1200 * Math.log2(1 + beat / (2 * f0)),
          amp: A * 0.8 * pos * Math.sqrt(reach(2 * f0, fc)) * tl,
          t60: T * 0.85,
          pre: 0.35,
          bloom,
          vexp: 1.6,
        },
        // the twelfth: tuned too, a few cents out on any real pan
        {
          f: 3 * f0,
          glide,
          detune: tune + 4 * trait('pan', m, 6),
          amp: A * 0.35 * (1.75 - pos) * reach(3 * f0, fc) * tl,
          t60: T * 0.45,
          pre: 0.4,
          bloom: bloom * 0.6,
          vexp: 1.6,
        },
      ],
      buf: null,
      rate: 1,
      // the shell's harmonics come from its nonlinearity: they grow faster than the stroke
      bufAmp: A * (0.25 + 0.75 * Math.pow(vel, 1.5)) * wobble(r, 2),
      lp: strikeLp(fc, r),
      off: Infinity,
      damp: 0.1,
      pan: place(m, p, spread, 74),
    };
    if (roll > 0 && dur >= rollFrom) {
      const soft = airy(contact(vel * 0.5, 900, 5000, mallet, f0, 2.2));
      strikeRoll(ctx, st, h, rollStrokes(h.t, dur, roll, r), () => zoneBuffer(ctx, 'pan', m, pick(m), 0.35, recipe), r, soft);
      return;
    }
    const b = zoneBuffer(ctx, 'pan', m, pick(m), 0.35, recipe);
    h.buf = b.buf;
    h.rate = b.rate;
    strike(ctx, st, h);
  };
  return instrument(note, r, (m, k) => void zoneBuffer(ctx, 'pan', m, k, 0.35, recipe), V);
}

/**
 * Celesta: steel plates over wooden resonator boxes, struck by felt hammers through a piano's action. A sweet, round
 * fundamental with a slow shimmer, a bell's inharmonic second partial that fades quickly, the hammer's soft thump
 * and the action's knock; a hard stroke rings like a small bell. Dampers land at `dur` unless `pedal`.
 */
export function makeCelesta(ctx: BaseAudioContext, s: Strip, r: Rnd, o: Common & { pedal?: boolean } = {}): Mallet {
  const { mallet = 0.5, spread = 0.3, pedal = false, room = 0.2 } = o;
  const st = stage(ctx, s, room);
  const V = 4, pick = picker(r, V);
  const ring = (f0: number) => clamp(2.4 * Math.pow(f0 / 523, -0.65), 0.4, 4);
  const recipe = (f0: number, rnd: () => number): Recipe => {
    const T = ring(f0);
    return {
      parts: [
        { r: 5.4 * (1 + 0.01 * rnd()), a: 0.08, t60: T * 0.07 },
        { r: 8.93 * (1 + 0.01 * rnd()), a: 0.04, t60: T * 0.04 },
        { r: 190 * (1 + 0.05 * rnd()), a: 0.05, t60: 0.035, hz: true },
        { r: 450 * (1 + 0.05 * rnd()), a: 0.03, t60: 0.025, hz: true },
      ],
      noise: [
        { hp: 120, lp: 1400, att: 0.0006, tau: 0.0022, a: 0.07 },
        { hp: 5500, att: 0.0001, tau: 0.0003, a: 0.025 },
      ],
    };
  };
  const note = (t: number, m: number, dur: number, vel: number, p: number) => {
    m = fold(m, 48, 112);
    vel = clamp(vel, 0, 1) * (0.96 + r() * 0.08);
    const f0 = mtof(m), T = ring(f0);
    const fc = contact(vel, 500, 2500, mallet, f0, 1.6);
    const A = 0.5 * vel * Math.pow(f0 / 523, -0.05), tl = tilt(vel);
    const pos = 0.6 + 0.4 * r();
    const f2 = f0 * 2.76 * (1 + 0.006 * trait('celesta', m, 2));
    t += r() * 0.0012;
    const b = zoneBuffer(ctx, 'celesta', m, pick(m), 0.35, recipe);
    strike(ctx, st, {
      t,
      attack: contactTime(fc),
      live: [
        { f: f0, detune: trait('celesta', m, 5), amp: A, t60: T, fast: [0.2, 2], partner: [f0 + 0.25 + 0.4 * Math.abs(trait('celesta', m, 1)), 0.12] },
        // the plate's second mode: a hint under a soft touch, a small bell under a hard one
        { f: f2, amp: A * 0.6 * pos * reach(f2, fc) * tl, t60: T * 0.22 },
      ],
      buf: b.buf,
      rate: b.rate,
      bufAmp: A * tl * wobble(r, 2),
      lp: strikeLp(fc, r),
      off: pedal ? Infinity : t + Math.max(0.05, dur),
      damp: 0.2,
      pan: place(m, p, spread, 84),
    });
  };
  return instrument(note, r, (m, k) => void zoneBuffer(ctx, 'celesta', m, k, 0.35, recipe), V);
}

/**
 * Glockenspiel: bare steel bars (overtones at 2.71× and 5.15×, untuned), brass or hard plastic mallets. Very
 * bright, a sharp tink, a ring of seconds. `damp` lets a hand stop a bar at `dur`.
 */
export function makeGlock(ctx: BaseAudioContext, s: Strip, r: Rnd, o: Common & { damp?: boolean } = {}): Mallet {
  const { mallet = 0.6, spread = 0.3, damp = false, room = 0.2 } = o;
  const st = stage(ctx, s, room);
  const V = 4, pick = picker(r, V);
  const ring = (f0: number) => clamp(5.5 * Math.pow(f0 / 784, -0.75), 0.9, 7);
  const recipe = (f0: number, rnd: () => number): Recipe => {
    const T = ring(f0);
    const tick = [0, 1, 2].map(() => ({ r: 6000 + 6000 * Math.abs(rnd()), a: 0.03 + 0.03 * Math.abs(rnd()), t60: 0.02 + 0.03 * Math.abs(rnd()), hz: true }));
    return {
      parts: [
        { r: 8.4 * (1 + 0.01 * rnd()), a: 0.12, t60: T * 0.06 },
        { r: 12.4 * (1 + 0.01 * rnd()), a: 0.07, t60: T * 0.035 },
        { r: 3.6 * (1 + 0.02 * rnd()), a: 0.025, t60: T * 0.06 },
        ...tick,
      ],
      noise: [{ hp: 3000, lp: 14000, att: 0.00008, tau: 0.00045, a: 0.2 }],
    };
  };
  const note = (t: number, m: number, dur: number, vel: number, p: number) => {
    m = fold(m, 60, 115);
    vel = clamp(vel, 0, 1) * (0.95 + r() * 0.1);
    const f0 = mtof(m), T = ring(f0);
    const fc = contact(vel, 2500, 9000, mallet, f0, 1.6);
    const A = 0.44 * vel * Math.pow(f0 / 1047, -0.05), tl = tilt(vel);
    const pos = 0.6 + 0.4 * r();
    const f2 = f0 * 2.71 * (1 + 0.004 * trait('glock', m, 2)), f3 = f0 * 5.15 * (1 + 0.005 * trait('glock', m, 3));
    const live: Live[] = [
      { f: f0, detune: trait('glock', m, 1), amp: A, t60: T },
      { f: f2, amp: A * 0.45 * pos * reach(f2, fc) * tl, t60: T * 0.42, flip: r() < 0.5 },
    ];
    if (f3 < 0.42 * ctx.sampleRate) live.push({ f: f3, amp: A * 0.25 * (1.3 - pos) * reach(f3, fc) * tl, t60: T * 0.16 });
    t += r() * 0.001;
    const b = zoneBuffer(ctx, 'glock', m, pick(m), 0.35, recipe);
    strike(ctx, st, {
      t,
      attack: contactTime(fc),
      live,
      buf: b.buf,
      rate: b.rate,
      bufAmp: A * tl * wobble(r, 2),
      lp: strikeLp(fc, r),
      off: damp ? t + Math.max(0.05, dur) : Infinity,
      damp: 0.15,
      pan: place(m, p, spread, 92),
    });
  };
  return instrument(note, r, (m, k) => void zoneBuffer(ctx, 'glock', m, k, 0.35, recipe), V);
}

// ── demos (dev only: tools/audio/render.mjs fn /src/audio/voices/mallets.ts demoX) ────────────
type Ev = [number, () => void];

/**
 * Hand events to the engine's pump a little ahead of time, as a track does (a whole demo scheduled at once costs), and
 * leave the pump once the last one is out.
 */
function sequence(evs: Ev[]): void {
  evs.sort((a, b) => a[0] - b[0]);
  let i = 0;
  const off = onPump((until) => {
    while (i < evs.length && evs[i][0] < until) evs[i++][1]();
    if (i >= evs.length) off();
  });
}

// ── the demos: a phrase each, in the game's major keys, most of them on the theme ─────────────
/** A tune in scale degrees (score.ts `melody`, 16 steps a bar) as timed notes: start, note, length, on the bar line. */
function tune(line: string, tonic: number, step: number, t0: number): { t: number; m: number; d: number; on: boolean }[] {
  return melody(line, 16).map((n) => ({ t: t0 + n.at * step, m: tonic + n.semi, d: n.len * step, on: n.at % 16 === 0 }));
}

/** The first `n` bars of a tune line. */
const bars = (line: string, from: number, n: number) => line.split('|').slice(from, from + n).join('|');

/**
 * Vibraphone, bossa nova at 132 in F: a soft arpeggio up the range with the motor turning, then the theme over
 * four-mallet comping (rootless voicings, the bossa's anticipations), a run down and a held F6/9.
 */
export function demoVibes(lab: Lab): void {
  const { ctx, r } = lab;
  const vib = makeVibes(ctx, lab.strip('vibes', { gain: 0.5, rev: 0.24, del: 0.04 }), r, { motor: 4.6, depth: 0.5, onStop: lab.onStop });
  const st = 60 / 132 / 4, bar = st * 16, ev: Ev[] = [];
  const at = (time: number, fn: (u: number) => void) => ev.push([time, () => fn(time)]);
  let t = lab.t0;
  [53, 57, 60, 64, 67, 69, 72, 76, 79, 81].forEach((m, i) => at(t + i * st * 1.5, (u) => vib(u, m, bar * 1.25 - i * st * 1.5, 0.2 + i * 0.045)));
  t += bar;
  const chords = [[57, 60, 64, 67], [57, 60, 62, 65], [53, 57, 60, 64], [58, 62, 64, 69], [57, 60, 62, 65], [57, 60, 64, 65], [53, 57, 58, 62], [57, 62, 67, 72]];
  const late: (number[] | null)[] = [null, null, null, null, null, null, [58, 62, 64, 67], null];
  // two bars of bossa comping: [step, length]; the last hit anticipates the next bar's chord
  const comp: [number, number][] = [[0, 5], [6, 4], [10, 4], [18, 4], [24, 5], [30, 6]];
  for (let b = 0; b < 8; b += 2)
    for (const [k, len] of comp) {
      const bb = b + Math.floor(k / 16), step = k % 16;
      const ch = k === 30 ? chords[Math.min(7, b + 2)] : step >= 8 && late[bb] ? late[bb]! : chords[bb];
      if (k === 30 && b + 2 > 7) continue;
      const tt = t + bb * bar + step * st;
      at(tt, (u) => vib.chord(u, ch, len * st, 0.42 + r() * 0.08));
    }
  for (const n of tune(THEME_HOME, 65, st, t)) at(n.t, (u) => vib(u, n.m, n.d * 1.02, (n.on ? 0.88 : 0.74) + r() * 0.06));
  t += 8 * bar;
  // repeated notes building, a run down, softening, and the last chord left to ring with the motor
  for (let i = 0; i < 6; i++) at(t + i * st, (u) => vib(u, 84, st * 0.9, 0.45 + i * 0.08));
  t += 6 * st;
  [89, 86, 84, 81, 79, 77, 74, 72, 69, 67, 65, 62].forEach((m, i) => at(t + i * st, (u) => vib(u, m, st * 2, 0.86 - i * 0.035)));
  const end = t + 12 * st + st * 2;
  at(end, (u) => vib.chord(u, [53, 57, 62, 67, 72, 77], 3.6, 0.95));
  sequence(ev);
}

/**
 * Marimba, two players interlocking at 112 in D (Reich meets West Africa): each plays ten or six of the sixteen
 * sixteenths, panned apart, so together they make one continuous line; a bass marimba walks D F♯ G A on a 3+3+2;
 * a crescendo from soft yarn to full brightness and back, and a rolled chord to close.
 */
export function demoMarimba(lab: Lab): void {
  const { ctx, r } = lab;
  const s = lab.strip('marimba', { gain: 0.42, rev: 0.16 });
  const mar = makeMarimba(ctx, s, r);
  const chorale = makeMarimba(ctx, s, r, { roll: 15 });
  const st = 60 / 112 / 4, bar = st * 16, ev: Ev[] = [];
  const at = (time: number, fn: (u: number) => void) => ev.push([time, () => fn(time)]);
  const t0 = lab.t0;
  const p1 = [[62, 66, 69, 74], [62, 66, 69, 71], [62, 66, 67, 71], [61, 64, 69, 73]];
  const p2 = [[69, 74, 78, 81], [71, 74, 78, 81], [71, 74, 78, 79], [69, 73, 76, 81]];
  const bass = [38, 42, 43, 45];
  const A = [0, -1, 2, 1, -1, 3, 2, -1, 0, -1, 2, 1, -1, 3, 2, -1];
  const B = [-1, 2, -1, -1, 1, -1, -1, 3, -1, 2, -1, -1, 1, -1, -1, 0];
  const A2 = [2, -1, 0, 3, -1, 1, 0, -1, 2, -1, 3, 1, -1, 0, 1, -1];
  const dyn = [0.36, 0.46, 0.56, 0.66, 0.78, 0.9, 1, 0.82];
  for (let b = 0; b < 8; b++) {
    const h = b % 4, tb = t0 + b * bar;
    for (let k = 0; k < 16; k++) {
      const acc = k === 0 ? 1.1 : k === 6 || k === 12 ? 1.04 : 0.9 + r() * 0.08;
      const v = Math.min(1, dyn[b] * acc);
      const i1 = (b < 4 ? A : A2)[k], i2 = B[k], tt = tb + k * st;
      if (i1 >= 0) at(tt, (u) => mar(u, p1[h][i1], st, v, -0.55));
      if (i2 >= 0) at(tt, (u) => mar(u, p2[h][i2], st, v * 0.95, 0.55));
    }
    for (const k of [0, 6, 12]) {
      const tt = tb + k * st;
      at(tt, (u) => mar(u, bass[h] + (k === 12 && b % 2 ? 12 : 0), st * 6, Math.min(1, 0.4 + dyn[b] * 0.3)));
    }
  }
  // a D major scale up two octaves, the players taking turns, into the low D and a rolled chord
  const ts = t0 + 8 * bar;
  [62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81, 83, 85, 86].forEach((m, k) => at(ts + k * st, (u) => mar(u, m, st, 0.55 + k * 0.03, k % 2 ? 0.55 : -0.55)));
  const te = ts + 16 * st;
  at(te, (u) => mar(u, 38, 3, 0.9));
  at(te, (u) => chorale.chord(u, [62, 66, 69, 74], 2.4, 0.95));
  sequence(ev);
}

/**
 * Kalimba at 100 in C, played as it is played: both thumbs alternating low and high through C and F, then the left
 * thumb keeps the low notes going while the right one takes the theme; the last bars on a kalimba with buzzers, and
 * a chord left to ring.
 */
export function demoKalimba(lab: Lab): void {
  const { ctx, r } = lab;
  const s = lab.strip('kalimba', { gain: 0.8, rev: 0.2, del: 0.06 });
  const kal = makeKalimba(ctx, s, r);
  const buzz = makeKalimba(ctx, s, r, { buzz: 0.75 });
  const e = 60 / 100 / 2, bar = e * 8, ev: Ev[] = [];
  const at = (time: number, fn: (u: number) => void) => ev.push([time, () => fn(time)]);
  // chord tones: three low (left thumb), three high (right thumb); the theme's chords from the third bar
  const C = [[60, 64, 67], [72, 76, 79]], F = [[60, 65, 69], [72, 77, 81]], Am = [[60, 64, 69], [72, 76, 81]], G = [[62, 67, 71], [74, 79, 83]];
  const prog = [C, F, C, F, Am, G, F, Am];
  const both: [number, number][] = [[0, 0], [1, 1], [0, 1], [1, 0], [0, 2], [1, 2], [1, 0], [1, 1]];
  const t = lab.t0;
  prog.forEach((ch, b) => {
    const inst = b >= 6 ? buzz : kal, tb = t + b * bar;
    if (b < 2)
      both.forEach(([hand, i], k) => at(tb + k * e, (u) => inst(u, ch[hand][i], e * 2, (k === 0 ? 0.48 : 0.36) + r() * 0.06)));
    else [0, 1, 2, 1, 0, 2, 1, 2].forEach((i, k) => at(tb + k * e, (u) => inst(u, ch[0][i], e * 2, (k % 2 ? 0.3 : 0.4) + r() * 0.05)));
  });
  // the theme in the right thumb (sixteenths at 100: half an eighth)
  const sx = e / 2;
  for (const n of tune(bars(THEME, 0, 4), 60, sx, t + 2 * bar)) at(n.t, (u) => kal(u, n.m, n.d, (n.on ? 0.72 : 0.62) + r() * 0.06));
  for (const n of tune(bars(THEME, 4, 2), 60, sx, t + 6 * bar)) at(n.t, (u) => buzz(u, n.m, n.d, (n.on ? 0.74 : 0.64) + r() * 0.06));
  // a run up the scale, the thumbs taking turns, and the last chord
  const run = t + 8 * bar;
  [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79].forEach((m, k) => at(run + k * sx, (u) => buzz(u, m, sx * 2, 0.4 + k * 0.025)));
  const end = run + 14 * sx;
  [60, 67, 72, 76, 84].forEach((m, k) => at(end + k * 0.035, (u) => buzz(u, m, 3, 0.6 - k * 0.03)));
  sequence(ev);
}

/**
 * Steel pan, calypso at 118 in C: a second pan strumming the off-beats, the lead playing the theme (its long notes
 * rolled, as pan players hold a note), a burst of repeated notes and a run, and a rolled double stop to finish.
 */
export function demoSteelPan(lab: Lab): void {
  const { ctx, r } = lab;
  const lead = makeSteelPan(ctx, lab.strip('pan', { gain: 0.6, rev: 0.18, del: 0.05 }), r);
  const strum = makeSteelPan(ctx, lab.strip('pan2', { gain: 0.38, rev: 0.16, pan: 0.2 }), r, { roll: 0, spread: 0.15 });
  const st = 60 / 118 / 4, bar = st * 16, ev: Ev[] = [];
  const at = (time: number, fn: (u: number) => void) => ev.push([time, () => fn(time)]);
  // the second pan below the tune, double stops (a player has two sticks): C | Fmaj7 | Am7 | G | Fmaj7 | Am9 | Dm7 G | C
  const chords = [[60, 64], [57, 64], [57, 60], [59, 62], [57, 64], [59, 64], [57, 65], [60, 64]];
  const late: (number[] | null)[] = [null, null, null, null, null, null, [59, 62], null];
  let t = lab.t0 + 0.5 * bar;
  // a pickup: the strum alone for two beats
  for (const k of [0, 2, 4, 6]) at(lab.t0 + k * st, (u) => strum.chord(u, chords[0], st * 1.5, k % 4 ? 0.5 : 0.62));
  for (let b = 0; b < 9; b++)
    for (const k of [2, 6, 10, 14]) {
      if (b === 8 && k > 6) continue;
      const ch = b === 8 ? chords[0] : k >= 8 && late[b] ? late[b]! : chords[b];
      const tt = t + b * bar + k * st;
      at(tt, (u) => strum.chord(u, ch, st * 1.5, 0.58 + r() * 0.1));
    }
  for (const n of tune(THEME_HOME, 60, st, t)) at(n.t, (u) => lead(u, n.m, n.d, (n.on ? 0.86 : 0.74) + r() * 0.06));
  t += 8 * bar;
  // repeated notes, then a run up the scale, and the last notes rolled together
  for (let k = 0; k < 8; k++) at(t + k * st, (u) => lead(u, 79, st, 0.45 + k * 0.06));
  [72, 74, 76, 77, 79, 81, 83, 84].forEach((m, k) => at(t + (8 + k) * st, (u) => lead(u, m, st, 0.6 + k * 0.03)));
  const end = t + bar;
  at(end, (u) => lead(u, 84, 1.6, 0.8));
  at(end + 0.03, (u) => lead(u, 76, 1.6, 0.7));
  sequence(ev);
}

/**
 * Celesta at 96: sixteenth-note arpeggios climbing through Cmaj9, Am9, Fmaj9 and G6/9 into the top octave, the
 * theme's first bars high over a soft left hand, a sparkle down from the top, and a chord to ring out.
 */
export function demoCelesta(lab: Lab): void {
  const { ctx, r } = lab;
  const cel = makeCelesta(ctx, lab.strip('celesta', { gain: 0.6, rev: 0.3, del: 0.08 }), r);
  const st = 60 / 96 / 4, bar = st * 16, ev: Ev[] = [];
  const at = (time: number, fn: (u: number) => void) => ev.push([time, () => fn(time)]);
  const arps = [[72, 76, 79, 83, 86, 88, 91, 95], [69, 72, 76, 79, 83, 84, 88, 91], [65, 69, 72, 76, 79, 81, 84, 88], [67, 71, 74, 76, 79, 83, 86, 88]];
  let t = lab.t0;
  arps.forEach((a, b) => {
    const line = [...a, ...a.slice(4).map((x) => x + 12), ...a.slice(4).reverse()];
    line.forEach((m, k) => {
      const tt = t + b * bar + k * st;
      at(tt, (u) => cel(u, m, 1.1, Math.min(1, (0.26 + 0.3 * Math.sin((Math.PI * k) / 15)) * (0.85 + b * 0.1)) + r() * 0.04));
    });
  });
  t += 4 * bar;
  // the theme high, a soft chord under each bar
  for (const n of tune(bars(THEME, 0, 2), 84, st, t)) at(n.t, (u) => cel(u, n.m, n.d * 1.1, (n.on ? 0.72 : 0.6) + r() * 0.05));
  [[64, 67, 72], [65, 69, 72, 76]].forEach((ch, b) => {
    const tt = t + b * bar;
    at(tt, (u) => cel.chord(u, ch, bar * 0.95, 0.5));
    at(tt + 8 * st, (u) => cel.chord(u, ch, bar * 0.45, 0.4));
  });
  t += 2 * bar;
  // a tremolo on the top G, a sparkle down from the top (thirty-seconds), and the last chord
  for (let k = 0; k < 8; k++) at(t + (k * st) / 2, (u) => cel(u, k % 2 ? 103 : 100, st, 0.35 + k * 0.04));
  t += 4 * st;
  [108, 107, 105, 103, 100, 98, 96, 95, 93, 91, 88, 86, 84].forEach((m, k) => at(t + (k * st) / 2, (u) => cel(u, m, 0.5, 0.45 + k * 0.02)));
  const end = t + 7 * st;
  at(end, (u) => cel.chord(u, [72, 76, 79, 83, 86], 3.2, 0.95));
  sequence(ev);
}

/**
 * Glockenspiel at 120 in G: the theme's first four bars high and bright, a crescendo on one repeated note, a scale
 * and an arpeggio, a music-box figure pianissimo, and a chord left to ring.
 */
export function demoGlock(lab: Lab): void {
  const { ctx, r } = lab;
  const gl = makeGlock(ctx, lab.strip('glock', { gain: 0.6, rev: 0.26, del: 0.06 }), r);
  const st = 60 / 120 / 4, bar = st * 16, ev: Ev[] = [];
  const at = (time: number, fn: (u: number) => void) => ev.push([time, () => fn(time)]);
  let t = lab.t0;
  for (const n of tune(bars(THEME, 0, 4), 79, st, t)) at(n.t, (u) => gl(u, n.m, n.d, (n.on ? 0.8 : 0.66) + r() * 0.06));
  t += 4 * bar;
  for (let k = 0; k < 16; k++) at(t + k * st, (u) => gl(u, 98, st, 0.25 + k * 0.045));
  t += bar;
  [91, 93, 95, 96, 98, 100, 102, 103, 98, 95, 91, 86, 91, 95, 98, 103].forEach((m, k) => at(t + k * st, (u) => gl(u, m, st, 0.62 + (k % 4 === 0 ? 0.12 : 0) + r() * 0.05)));
  t += bar;
  [91, 98, 95, 98, 103, 98, 95, 98, 93, 98, 96, 98, 102, 98, 96, 98].forEach((m, k) => at(t + k * st, (u) => gl(u, m, st, 0.22 + r() * 0.05)));
  t += bar;
  at(t, (u) => gl.chord(u, [91, 95, 98, 103], 3, 1));
  sequence(ev);
}

/**
 * Xylophone at 132 in C: a scale up two octaves and back, the theme bouncing along with grace notes, a burst of
 * repeated notes, a roll, and an octave to finish.
 */
export function demoXylophone(lab: Lab): void {
  const { ctx, r } = lab;
  const xy = makeXylophone(ctx, lab.strip('xylo', { gain: 0.5, rev: 0.14 }), r, { roll: 18 });
  const st = 60 / 132 / 4, bar = st * 16, ev: Ev[] = [];
  const at = (time: number, fn: (u: number) => void) => ev.push([time, () => fn(time)]);
  let t = lab.t0;
  const up = [72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96];
  up.forEach((m, k) => at(t + k * st, (u) => xy(u, m, st, 0.4 + k * 0.04)));
  [...up].reverse().forEach((m, k) => at(t + (16 + k) * st, (u) => xy(u, m, st, 0.95 - k * 0.035)));
  t += 2 * bar;
  for (const n of tune(bars(THEME, 0, 4), 72, st, t)) {
    if (n.on) at(n.t - 0.035, (u) => xy(u, n.m - 1, 0.03, 0.45));
    at(n.t, (u) => xy(u, n.m, Math.min(n.d, 0.2), (n.on ? 0.9 : 0.72) + r() * 0.06));
  }
  t += 4 * bar;
  for (let k = 0; k < 16; k++) at(t + k * st, (u) => xy(u, 91, st, k % 4 === 0 ? 0.95 : k % 2 ? 0.55 : 0.72));
  t += bar;
  at(t, (u) => xy(u, 88, 1.2, 0.7));
  at(t + 0.02, (u) => xy(u, 84, 1.2, 0.66));
  const end = t + 1.4;
  at(end, (u) => xy.chord(u, [84, 88, 91, 96], 0.3, 1.6));
  sequence(ev);
}
