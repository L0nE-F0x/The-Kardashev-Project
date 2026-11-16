/**
 * Plucked strings (v0.15.5, SPEC §40): the bossa nova's nylon guitar, a clean single-coil funk guitar, a concert
 * harp, a double bass played pizzicato and a fingered Precision bass.
 *
 * Every string is a physical model computed once in JavaScript and cached as a buffer (buffers.ts): a single-delay-loop
 * waveguide, Karplus–Strong grown up, with the instrument's body folded into the pluck (commuted synthesis).
 *   pluck → body → string loop ×2 (two polarisations) → pickup → normalised, trimmed buffer
 * - The pluck: a pulse as long as the pluck point's distance from the bridge (what a released string sends into the
 *   bridge: harmonics falling as sin(nπβ)/n, the pluck point's notches included), its edges rounded by what plucks it
 *   (a thumb's flesh, a fingertip, a nail, a pick). The rounding is a share of the string's period (what touches the
 *   string is a share of its length) capped at a time, so a treble string keeps its harmonics and a bass string its
 *   roundness. Every zone is rendered as the instrument's hardest pluck; softer ones are made at play time (below).
 * - The body: 38–46 resonances (a guitar's or a double bass's box, a harp's soundboard), denser towards the top, their
 *   gains scattered round the instrument's curve (peaks and notches of ±10 dB: what makes wood sound like wood), and a
 *   few milliseconds of knock. String and body are linear, so the body colours the pluck before the string instead of
 *   filtering the whole ring after it: the same sound for a twentieth of the work. The two or three strongest low modes
 *   (a guitar's air and top modes, a bass's) are shared peaking filters made once per instrument, so they stay at their
 *   frequencies whichever zone plays. The electric instruments have no body: their pickup's place on the string (a
 *   comb) is in the buffer, the pickup's resonance, the amp and its tone stack are shared nodes.
 * - The loop: an integer delay, a first-order all-pass for the fraction (tuned at the fundamental with the loop
 *   filter's own delay counted, so a note is in tune to a fraction of a cent), a stiffness all-pass for wound bass
 *   strings (their upper partials run sharp), and a one-pole low-pass fitted to two decay times, the fundamental's and
 *   a high partial's: every partial dies at its own rate, the highs first.
 * - Two polarisations, a little detuned and decaying at different rates (a real string's two-stage decay and slow
 *   beating); where an instrument blooms (the harp's and the double bass's low strings) the second is fed by the first.
 * Buffers are made per zone (every third semitone; playbackRate covers the steps between and the microtuning) in two to
 * four round-robin variants (another pluck of the same string: its pluck point, rise, decay and detune drawn from its
 * seed; a string never plays the variant it played last), stored at a reduced rate: ÷2 for the nylon's trebles and the
 * harp's top, ÷3 for the funk guitar, the nylon's basses and the harp's middle, ÷4–6 for the basses and the harp's
 * wound strings (nothing they make above 3–6 kHz survives the pluck). They are trimmed where they fall 60 dB under their peak.
 * The finger, nail and pick noises, which do reach high, are short buffers at the full rate. Making a buffer takes 1–4
 * ms on the main thread: `warm: [lo, hi]` in a factory's options (or `warmPlucked(…, { idle: true })`) makes a range
 * ahead, a few milliseconds at a time while the page is idle, the middle of the range first.
 *
 * Playing: a note is buffer → gain → velocity low-pass → one of the instrument's pan positions (the acoustic ones) or
 * the shared amp (the electric ones, mono, as an amp is), with its touch noise into the same low-pass: three to seven
 * nodes. A gesture (a strum, a chick) shares one low-pass among its strings. A string plucked again stops its last note
 * first (it can't ring twice); the basses play one note at a time; the funk guitar's chick mutes whatever was ringing.
 *
 * Velocity changes the timbre the way a harder pluck does. In a linear string a softer pluck is the same string with a
 * duller excitation, so a per-note low-pass set by velocity and pitch (a few harmonics for a soft pluck, open for a hard
 * one) *is* that excitation; on top, harder notes start a few cents sharp and settle (tension modulation), bring the
 * finger, nail or pick forward (their noise grows with the square of velocity) and push the electric amps into their
 * bias (even harmonics, then grit). Held single notes on the guitars get a finger vibrato that fades in. A note's `dur`
 * is when it is damped: the highs go at once and the body over 60–90 ms, with the soft thud of a finger landing on the
 * string.
 */
import { freeWhenDone, voiceFilter } from '../engine';
import { mtof, pan, type Rnd, type Strip } from '../synth';
import { cachedBuffer, fadeTail, fillSamples, noiseGen, normalise } from './buffers';
import { askWorker } from './offthread';
import { chorus } from './fx';
import type { Lab } from './lab';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ── a small DSP kit, run in JavaScript while a buffer is made ───────────────────────────────
type Coefs = readonly [number, number, number, number, number];
type FType = 'lp' | 'hp' | 'bp' | 'pk';

/** RBJ biquad coefficients (normalised): low-pass, high-pass, band-pass (0 dB peak) or a peaking EQ of `db`. */
function coefs(type: FType, f: number, q: number, sr: number, db = 0): Coefs {
  const w = (2 * Math.PI * Math.min(f, sr * 0.47)) / sr;
  const cs = Math.cos(w), al = Math.sin(w) / (2 * q), A = Math.pow(10, db / 40);
  let b: [number, number, number, number, number, number];
  if (type === 'lp') b = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al];
  else if (type === 'hp') b = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al];
  else if (type === 'bp') b = [al, 0, -al, 1 + al, -2 * cs, 1 - al];
  else b = [1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A];
  return [b[0] / b[3], b[1] / b[3], b[2] / b[3], b[4] / b[3], b[5] / b[3]];
}

/** Run a biquad over `x[0..n)` into `y` (in place by default). */
function iir(x: Float32Array, n: number, c: Coefs, y: Float32Array = x): void {
  const [b0, b1, b2, a1, a2] = c;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = o;
    y[i] = o;
  }
}

/**
 * A magnetic pickup's place on the string: y = x − Σ w·x(n − D), D = the pickup's distance from the bridge as a
 * share of the loop (fractional, interpolated). Harmonics with a node over the pickup vanish. In place, from the end.
 */
function pickup(x: Float32Array, n: number, taps: readonly (readonly [number, number])[]): void {
  for (let i = n - 1; i >= 0; i--) {
    let y = x[i];
    for (const [D, w] of taps) {
      const p = i - D;
      if (p < 0) continue;
      const j = Math.floor(p), fr = p - j;
      y -= w * (x[j] * (1 - fr) + x[j + 1] * fr);
    }
    x[i] = y;
  }
}

// ── the body ────────────────────────────────────────────────────────────────────────────────
/** [Hz, Q, gain]: a resonance (gain linear in a body's modes, dB in an instrument's shared ones). */
type Mode = readonly [number, number, number];

/**
 * A body: the direct share (the string's own radiation, the plates' broadband response) plus `n` resonances from `lo`
 * to `hi` Hz, denser towards the top (`shape` < 1), Q from `q[0]` to `q[1]` (but never narrower than 8 Hz: the low
 * modes ring a few hundred milliseconds at most), gains following `env` ([Hz, dB] points, interpolated in log
 * frequency) scattered by `scatter` dB, and the knock: a noise burst's level (re the coloured pluck's peak), its
 * low-pass (Hz) and decay (s).
 */
interface BodySpec {
  direct: number;
  n: number;
  lo: number;
  hi: number;
  shape: number;
  q: readonly [number, number];
  env: readonly (readonly [number, number])[];
  scatter: number;
  knock: readonly [number, number, number];
  seed: number;
}

function envAt(env: BodySpec['env'], f: number): number {
  if (f <= env[0][0]) return env[0][1];
  const lf = Math.log(f);
  for (let i = 1; i < env.length; i++) {
    if (f > env[i][0]) continue;
    const a = Math.log(env[i - 1][0]), b = Math.log(env[i][0]);
    return env[i - 1][1] + ((lf - a) / (b - a)) * (env[i][1] - env[i - 1][1]);
  }
  return env[env.length - 1][1];
}

const bodyModes = new Map<BodySpec, Mode[]>();

/** The body's resonances, drawn once from its seed (the same box for every note of the instrument). */
function modesOf(B: BodySpec): Mode[] {
  let out = bodyModes.get(B);
  if (out) return out;
  const g = noiseGen(B.seed), u = () => 0.5 + 0.5 * g();
  out = [];
  for (let k = 0; k < B.n; k++) {
    const x = Math.pow(clamp((k + 0.5 + 0.8 * (u() - 0.5)) / B.n, 0, 1), B.shape);
    const f = B.lo * Math.pow(B.hi / B.lo, x);
    const q = Math.min(B.q[0] * Math.pow(B.q[1] / B.q[0], u()), f / 8);
    // a gain scattered round the curve (three uniforms: near enough a bell curve)
    const s = (u() + u() + u() - 1.5) * 2;
    out.push([f, q, Math.pow(10, (envAt(B.env, f) + B.scatter * s) / 20)]);
  }
  bodyModes.set(B, out);
  return out;
}

/**
 * The pluck as the body answers it (commuted synthesis): the direct share plus every resonance rung by the pluck, each
 * run until it has died 60 dB, plus the knock. What comes out is the string's excitation.
 */
function colour(ex: Float64Array, sr: number, B: BodySpec, seed: number): Float64Array {
  const modes = modesOf(B).filter(([f]) => f < 0.45 * sr);
  const ringOf = (f: number, q: number) => Math.ceil(((6.9 * q) / (Math.PI * f)) * sr);
  let ring = Math.round(0.01 * sr);
  for (const [f, q] of modes) ring = Math.max(ring, ringOf(f, q));
  const n = ex.length + ring, out = new Float64Array(n);
  for (let i = 0; i < ex.length; i++) out[i] = B.direct * ex[i];
  for (const [f, q, gain] of modes) {
    const [b0, , b2, a1, a2] = coefs('bp', f, q, sr);
    const m = Math.min(n, ex.length + ringOf(f, q));
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < m; i++) {
      const x = i < ex.length ? ex[i] : 0;
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] += gain * y;
    }
  }
  const [kl, kf, kd] = B.knock;
  if (kl > 0) {
    const kn = Math.min(n, Math.ceil(kd * 8 * sr)), tmp = new Float32Array(kn), rnd = noiseGen(seed * 13 + 5);
    for (let i = 0; i < kn; i++) {
      const t = i / sr;
      tmp[i] = rnd() * (1 - Math.exp(-t / 0.0003)) * Math.exp(-t / kd);
    }
    iir(tmp, kn, coefs('lp', kf, 0.7, sr));
    let pk = 0, opk = 0;
    for (let i = 0; i < kn; i++) pk = Math.max(pk, Math.abs(tmp[i]));
    for (let i = 0; i < n; i++) opk = Math.max(opk, Math.abs(out[i]));
    const k = pk > 0 ? (kl * opk) / pk : 0;
    for (let i = 0; i < kn; i++) out[i] += k * tmp[i];
  }
  return out;
}

// ── the string ──────────────────────────────────────────────────────────────────────────────
interface Spec {
  f0: number;
  /** T60 (seconds) of the fundamental and of the partials near `fHi` Hz. */
  t60: number;
  t60hi: number;
  fHi: number;
  /** The pluck: its point (share of the string from the bridge), how long the release takes and how much the flesh
   * rounds the pulse's edges, each as the smaller of a time (s) and a share of the period, and the noise riding on it. */
  beta: number;
  rise: number;
  riseFrac: number;
  soft: number;
  softFrac: number;
  noise: number;
  /** Stiffness: `stages` first-order all-passes of coefficient `disp` (< 0) in the loop. */
  disp: number;
  stages: number;
  /** The first polarisation's decay multiplier (it drives the body: below 1 it gives its energy away faster). */
  t60a?: number;
  /** The second polarisation: its share of the pluck, detune (cents), decay multipliers, feed from the first
   * (its steady share: the bloom) and its weight in the output. */
  p2: number;
  det2: number;
  t60b: number;
  t60hib: number;
  couple: number;
  out2: number;
  seed: number;
}

interface Loop {
  L: number;
  C: number;
  g: number;
  a: number;
  G0: number;
}

/** Phase delay (samples) at `w` of the all-pass (c + z⁻¹)/(1 + c·z⁻¹). */
const apDelay = (c: number, w: number) => 1 - (2 / w) * Math.atan2(c * Math.sin(w), 1 + c * Math.cos(w));

/**
 * One polarisation's loop: the one-pole loss filter g(1−a)/(1−a·z⁻¹) whose gain per trip matches the decay times at
 * the fundamental and at `fHi`, then the integer delay and the all-pass fraction that make the whole trip exactly
 * one period at the fundamental (the loss filter's and the stiffness all-passes' delays counted).
 */
function design(sr: number, f0: number, t60: number, t60hi: number, fHi: number, disp: number, stages: number): Loop {
  const w0 = (2 * Math.PI * f0) / sr;
  const w1 = clamp((2 * Math.PI * fHi) / sr, w0 * 2.5, 2 * Math.PI * 0.4);
  const G0 = Math.pow(10, -3 / (t60 * f0)), G1 = Math.pow(10, -3 / (Math.min(t60hi, t60 * 0.999) * f0));
  const r2 = (G1 / G0) ** 2, k = 1 - r2, B = Math.cos(w0) - r2 * Math.cos(w1);
  const a = clamp((B - Math.sqrt(Math.max(0, B * B - k * k))) / k, 0, 0.995);
  const g = Math.min(0.99998, (G0 * Math.sqrt(1 - 2 * a * Math.cos(w0) + a * a)) / (1 - a));
  const lpDelay = Math.atan2(a * Math.sin(w0), 1 - a * Math.cos(w0)) / w0;
  const rest = sr / f0 - lpDelay - (stages ? stages * apDelay(disp, w0) : 0);
  const L = Math.max(2, Math.floor(rest - 0.5));
  const d = rest - L;
  return { L, C: Math.sin(((1 - d) * w0) / 2) / Math.sin(((1 + d) * w0) / 2), g, a, G0 };
}

/**
 * The pluck: a pulse β·period long whose leading edge takes the release time to rise (a raised cosine: a finger or a
 * pick slips off the string, it does not vanish), both edges rounded by the flesh (two one-pole smoothings), a little
 * noise riding on it. Both roundings are the smaller of a time and a share of the period: a fingertip covers a share
 * of a string's length, so a treble string's pluck is as sharp, harmonic for harmonic, as a bass string's.
 */
function excite(sp: Spec, sr: number): Float64Array {
  const P = sr / sp.f0;
  const w = Math.max(1, sp.beta * P);
  const R = Math.max(1, Math.min(sp.rise * sr, sp.riseFrac * P));
  const tau = Math.max(0.3, Math.min(sp.soft * sr, sp.softFrac * P));
  // the pulse is w samples long between its edges' half-heights (a treble string's period is only 20-odd samples:
  // a sample lost to the edges would move its pluck point and the notch with it)
  const off = Math.ceil(R / 2) + 1;
  const len = Math.max(Math.ceil(off + w + 14 * tau) + 4, Math.ceil(2 * P) + 2);
  const ex = new Float64Array(len);
  const rnd = noiseGen(sp.seed);
  let nz = 0;
  for (let i = 1; i < len; i++) {
    // the noise is a little smoothed (a finger's roughness, not hiss)
    nz = nz * 0.45 + rnd() * 0.55;
    const t = i - off;
    const up = t <= -R / 2 ? 0 : t >= R / 2 ? 1 : 0.5 + 0.5 * Math.sin((Math.PI * t) / R);
    ex[i] = up * clamp(w - t + 0.5, 0, 1) * (1 + sp.noise * nz * 1.6);
  }
  const k = Math.exp(-1 / tau);
  let a = 0, b = 0;
  for (let i = 0; i < len; i++) {
    a = a * k + ex[i] * (1 - k);
    b = b * k + a * (1 - k);
    ex[i] = b;
  }
  return ex;
}

/**
 * Take the excitation's DC out: a single-delay loop would keep DC circulating like a harmonic (a real string has no
 * 0 Hz mode) and every pluck would thump below its note. The DC goes as a Hann window two periods long, whose spectrum
 * is zero at every harmonic, so the harmonics are untouched.
 */
function noDC(ex: Float64Array, P: number): void {
  const W = 2 * P, hann = (i: number) => (i <= W ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W) : 0);
  let sum = 0, hs = 0;
  for (let i = 0; i < ex.length; i++) {
    sum += ex[i];
    hs += hann(i);
  }
  if (hs > 0) for (let i = 0; i < ex.length && i <= W; i++) ex[i] -= (sum * hann(i)) / hs;
}

/**
 * Pluck the string with `ex` and let it ring into `out` (up to `n` samples at `sr`). Returns how many samples were
 * written: it stops once the sound has stayed 74 dB under its peak for a few blocks.
 */
function pluckString(sp: Spec, ex: Float64Array, sr: number, out: Float32Array, n: number): number {
  const two = sp.p2 > 0 || sp.couple > 0;
  // the two polarisations sit either side of the note, the one that carries the sound nearer it (the first, or the
  // second where it blooms), so the note is in tune
  const ka = sp.t60a ?? 1, split = sp.couple > 1 ? 0.7 : 0.3;
  const A = design(sr, sp.f0 * Math.pow(2, (two ? -split * sp.det2 : 0) / 1200), sp.t60 * ka, sp.t60hi * ka, sp.fHi, sp.disp, sp.stages);
  const Bp = two ? design(sr, sp.f0 * Math.pow(2, ((1 - split) * sp.det2) / 1200), sp.t60 * sp.t60b, sp.t60hi * sp.t60hib, sp.fHi, sp.disp, sp.stages) : A;
  let size = 1;
  while (size < Math.max(A.L, Bp.L) + 4) size <<= 1;
  const mask = size - 1;
  const d1 = new Float64Array(size), d2 = new Float64Array(size);
  const ns = sp.stages, dc = sp.disp;
  const s1 = new Float64Array(2 * ns + 2), s2 = new Float64Array(2 * ns + 2);
  let f1x = 0, f1y = 0, l1 = 0, f2x = 0, f2y = 0, l2 = 0;
  const ga = A.g * (1 - A.a), gb = Bp.g * (1 - Bp.a), aa = A.a, ab = Bp.a, ca = A.C, cb = Bp.C;
  const e1 = 1 - sp.p2, e2 = sp.p2, cpl = sp.couple * (1 - Bp.G0), o2 = sp.out2;
  const quietAt = Math.pow(10, -74 / 20), minLen = ex.length + Math.round(0.05 * sr);
  let peak = 0, blk = 0, quiet = 0;
  for (let i = 0; i < n; i++) {
    const e = i < ex.length ? ex[i] : 0;
    let x = d1[(i - A.L) & mask];
    for (let s = 0; s < ns; s++) {
      const y = dc * x + s1[2 * s] - dc * s1[2 * s + 1];
      s1[2 * s] = x;
      s1[2 * s + 1] = y;
      x = y;
    }
    const fy = ca * x + f1x - ca * f1y;
    f1x = x;
    f1y = fy;
    l1 = ga * fy + aa * l1;
    const y1 = e * e1 + l1;
    d1[i & mask] = y1;
    let o = y1;
    if (two) {
      let z = d2[(i - Bp.L) & mask];
      for (let s = 0; s < ns; s++) {
        const y = dc * z + s2[2 * s] - dc * s2[2 * s + 1];
        s2[2 * s] = z;
        s2[2 * s + 1] = y;
        z = y;
      }
      const fz = cb * z + f2x - cb * f2y;
      f2x = z;
      f2y = fz;
      l2 = gb * fz + ab * l2;
      const y2 = e * e2 + l2 + cpl * y1;
      d2[i & mask] = y2;
      o += o2 * y2;
    }
    out[i] = o;
    const m = o < 0 ? -o : o;
    if (m > blk) blk = m;
    if ((i & 511) === 511) {
      if (blk > peak) peak = blk;
      quiet = i > minLen && blk < peak * quietAt ? quiet + 1 : 0;
      blk = 0;
      if (quiet >= 3) return i + 1;
    }
  }
  return n;
}

/** Buffers are normalised to this RMS over their first `win` seconds (the attack and the early ring). */
const RMS = 0.2;

/**
 * Normalise (AudioBuffers are float: no peak cap, the voice's gain sets the headroom), trim where the tail falls
 * `floorDb` under the peak, fade the end. Returns the length to keep.
 */
function finish(x: Float32Array, n: number, sr: number, win: number, floorDb: number): number {
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (!(peak > 0)) return 1;
  const w = Math.max(1, Math.min(n, Math.round(win * sr)));
  let e = 0;
  for (let i = 0; i < w; i++) e += x[i] * x[i];
  const k = e > 0 ? RMS / Math.sqrt(e / w) : 0.5 / peak;
  const thr = peak * Math.pow(10, floorDb / 20);
  let end = n;
  while (end > 1 && Math.abs(x[end - 1]) < thr) end--;
  const capped = end > n - Math.round(0.05 * sr);
  end = Math.min(n, end + Math.round(0.004 * sr));
  for (let i = 0; i < end; i++) x[i] *= k;
  x[0] = 0;
  if (capped) {
    // cut off before it had died away: let it go the way a damped string does, over the last quarter (≤ 0.5 s)
    const f = Math.min(Math.round(0.5 * sr), Math.round(end * 0.25));
    for (let i = 0; i < f; i++) x[end - f + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / f);
  } else fadeTail(x, sr, Math.min(20, (end / sr) * 250), end);
  return end;
}

// ── instruments as models: zones, the string, the body ─────────────────────────────────────
interface Model {
  id: string;
  /** Zone roots every `zone` semitones from `base`, kept within [lo, hi] (both on the grid). */
  base: number;
  zone: number;
  lo: number;
  hi: number;
  /** Stored at the context's rate ÷ div. */
  div(root: number): number;
  /** The longest the buffer may be (seconds). */
  secs(root: number): number;
  /** How many round-robin variants a zone has. */
  variants(root: number): number;
  /** The string for variant `v` (an index: its differences come from its seed). */
  spec(root: number, v: number): Spec;
  body?: BodySpec;
  post(x: Float32Array, n: number, sr: number, root: number): void;
  /** Loudness window for normalising (s); how far under the peak the tail is cut (dB). */
  win: number;
  floor: number;
}

function zoneOf(M: Model, m: number): number {
  return clamp(M.base + M.zone * Math.round((m - M.base) / M.zone), M.lo, M.hi);
}

/** Buffers this family has made (bytes), for the lab. */
let made = 0;

function zoneBuffer(ctx: BaseAudioContext, M: Model, root: number, v: number): AudioBuffer {
  return cachedBuffer(ctx, `plucked|${M.id}|${root}|${v}`, M.secs(root) / M.div(root), zoneFill(M, root, v));
}

function zoneFill(M: Model, root: number, v: number) {
  const div = M.div(root);
  return (data: Float32Array, rate: number) => {
    const sr = rate / div, sp = M.spec(root, v);
    let ex = excite(sp, sr);
    if (M.body) ex = colour(ex, sr, M.body, sp.seed);
    noDC(ex, sr / sp.f0);
    const used = pluckString(sp, ex, sr, data, data.length);
    const n = Math.min(data.length, used + Math.round(0.05 * sr));
    M.post(data, n, sr, root);
    const end = finish(data, n, sr, M.win, M.floor);
    made += end * 4;
    return end;
  };
}

const seedOf = (id: string, root: number, v: number) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) + root * 131 + v * 7919;
};

/** A variant's own small differences (another pluck of the same string), drawn from its seed. */
function vary(seed: number) {
  const g = noiseGen(seed * 31 + 7);
  g();
  g();
  return { beta: 0.015 * g(), t60hi: 1 + 0.08 * g(), det2: 0.7 + 0.3 * g(), rise: 1 + 0.2 * g(), p2: 0.04 * g(), k: g() };
}

const T60 = {
  nylon: (root: number) => 3.4 * Math.pow(82.4 / mtof(root), 0.55),
  strat: (root: number) => 4.6 * Math.pow(82.4 / mtof(root), 0.5),
  harp: (root: number) => 5.4 * Math.pow(65.4 / mtof(root), 0.4),
  upright: (root: number) => 2.4 * Math.pow(41.2 / mtof(root), 0.3),
  pbass: (root: number) => 4.4 * Math.pow(41.2 / mtof(root), 0.35),
};

/** A classical guitar's box: the plates' modes from 100 Hz to 5 kHz, a presence region at 2–3 kHz. Its air and main
 * top modes (98 and 196 Hz) are the instrument's shared filters (`BOX.nylon`). */
const NYLON_BODY: BodySpec = {
  direct: 0.22,
  n: 46,
  lo: 100,
  hi: 5200,
  shape: 0.8,
  q: [16, 45],
  env: [[100, -3], [200, 0], [450, -1], [900, -2.5], [1600, -1.5], [2600, 1], [3600, -2], [5200, -9]],
  scatter: 5,
  knock: [0.25, 2400, 0.003],
  seed: 11,
};

/** A concert harp's soundboard and box: smooth resonances from 250 Hz up, a presence at 1.5–3 kHz (the pluck's
 * sparkle: a round tone, but an open one). */
const HARP_BODY: BodySpec = {
  direct: 0.28,
  n: 44,
  lo: 85,
  hi: 6000,
  shape: 0.85,
  q: [12, 34],
  env: [[85, -3], [250, -1], [600, 0], [1200, 1], [2000, 3.5], [3000, 3], [4200, -1], [6000, -8]],
  scatter: 4,
  knock: [0.1, 1800, 0.004],
  seed: 23,
};

/** A double bass's box: dense low and middle modes, little above 1.7 kHz; the air and main top modes (56 and 98 Hz)
 * are the instrument's shared filters (`BOX.upright`). */
const UPRIGHT_BODY: BodySpec = {
  direct: 0.22,
  n: 38,
  lo: 65,
  hi: 1700,
  shape: 0.85,
  q: [9, 28],
  env: [[65, -3], [140, 0], [300, -1], [600, -2], [1000, -4], [1700, -9]],
  scatter: 5,
  knock: [0.3, 800, 0.006],
  seed: 37,
};

/** The strongest body modes, shared peaking filters [Hz, Q, dB] that stay put whichever zone plays. */
const BOX = {
  nylon: [[98, 9, 5], [196, 11, 4]],
  upright: [[56, 8, 6], [98, 10, 4.5]],
} satisfies Record<string, Mode[]>;

/** The nylon guitar: thumb on the wound bass strings (round, wide pluck), flesh and nail on the trebles. */
const NYLON: Model = {
  id: 'nylon',
  base: 40,
  zone: 3,
  lo: 40,
  hi: 88,
  div: (root) => (root < 52 ? 3 : 2),
  secs: (root) => clamp(1.25 * T60.nylon(root), 1.4, 4.5),
  variants: () => 2,
  spec(root, v) {
    const thumb = root < 52, seed = seedOf('nylon', root, v), d = vary(seed);
    return {
      f0: mtof(root),
      t60: T60.nylon(root),
      t60hi: 0.7 * d.t60hi,
      fHi: 3000,
      beta: (thumb ? 0.2 : 0.145) + d.beta,
      rise: (thumb ? 0.0005 : 0.0003) * d.rise,
      riseFrac: (thumb ? 0.035 : 0.022) * d.rise,
      soft: thumb ? 0.0002 : 0.0001,
      softFrac: thumb ? 0.012 : 0.007,
      noise: thumb ? 0.12 : 0.2,
      disp: 0,
      stages: 0,
      p2: 0.35 + d.p2,
      det2: d.det2,
      t60b: 1.35,
      t60hib: 1.25,
      couple: 0,
      out2: 0.75,
      seed,
    };
  },
  body: NYLON_BODY,
  post(x, n, sr) {
    iir(x, n, coefs('hp', 60, 0.7, sr));
    iir(x, n, coefs('lp', Math.min(7000, 0.42 * sr), 0.55, sr));
  },
  win: 0.25,
  floor: -60,
};

/** A single-coil electric through neck and middle pickups, picked: bright, glassy, quick. */
const strat = (id: string, muted: boolean): Model => ({
  id,
  base: 40,
  zone: 3,
  lo: 40,
  hi: 88,
  // the pickup's resonance and the speaker leave nothing above 7 kHz: a third of the rate keeps all of it
  div: () => 3,
  secs: (root) => (muted ? 0.16 : clamp(0.85 * T60.strat(root), 1.2, 3)),
  variants: () => (muted ? 4 : 2),
  spec(root, v) {
    const seed = seedOf(id, root, v), d = vary(seed);
    return {
      f0: mtof(root),
      // a muted string: the fretting hand's light touch stops the low modes as fast as the high ones
      t60: muted ? 0.04 + 0.006 * d.k : T60.strat(root),
      t60hi: muted ? 0.03 : 0.55 * d.t60hi,
      fHi: muted ? 2500 : 4000,
      beta: 0.135 + d.beta,
      rise: 0.00012 * d.rise,
      riseFrac: 0.015 * d.rise,
      soft: 0.00003,
      softFrac: 0.005,
      noise: muted ? 0.8 : 0.25,
      disp: 0,
      stages: 0,
      p2: muted ? 0 : 0.3 + d.p2,
      det2: 1.2 * d.det2,
      t60b: 1.3,
      t60hib: 1.15,
      couple: 0,
      out2: 0.6,
      seed,
    };
  },
  post(x, n, sr, root) {
    const P = sr / mtof(root);
    pickup(x, n, [[0.247 * P, 0.5], [0.159 * P, 0.5]]);
    iir(x, n, coefs('hp', 75, 0.7, sr));
    iir(x, n, coefs('lp', 0.42 * sr, 0.6, sr));
    // what is left of a muted string is its scratch, not its thump
    if (muted) iir(x, n, coefs('hp', 320, 0.7, sr));
  },
  win: muted ? 0.04 : 0.2,
  floor: -60,
});
const STRAT = strat('strat', false);
const STRAT_MUTE = strat('strat-mute', true);

/**
 * The concert harp: fingertips near the middle of gut and nylon, wound bass wires that bloom, a long ring. The bloom:
 * on the low strings the polarisation that drives the soundboard (the bright pluck) gives its energy away fast and
 * feeds the other, which rings long; their sum swells by a decibel or two a quarter of a second after the attack,
 * mostly in the fundamental (the feed is scaled by its loss), so the tone grows rounder as it grows.
 */
const HARP: Model = {
  id: 'harp',
  base: 36,
  zone: 3,
  lo: 24,
  hi: 102,
  // the wound strings keep nothing above 3–4 kHz (their pluck is round, their highs die first): stored at an eighth
  // to a quarter of the rate, the middle at a third, the top at half
  div: (root) => (root < 40 ? 6 : root < 57 ? 4 : root < 69 ? 3 : 2),
  secs: (root) => clamp(1.3 * T60.harp(root), 1.2, 8),
  variants: () => 2,
  spec(root, v) {
    const bloom = clamp((62 - root) / 26, 0, 1), seed = seedOf('harp', root, v), d = vary(seed);
    return {
      f0: mtof(root),
      t60: T60.harp(root),
      t60hi: 0.95 * d.t60hi,
      fHi: 3200,
      // nearer the middle on the wound strings, nearer the soundboard in the middle (brighter), and at the top, where
      // only the first five harmonics are left to share out, a point that keeps all five (its notch between the 3rd
      // and 4th: no 3rd or 4th more than 20 dB under the 1st)
      beta: (root < 55 ? 0.28 : root < 79 ? 0.24 : 0.28) + d.beta,
      rise: (root < 55 ? 0.0004 : 0.0003) * d.rise,
      riseFrac: 0.035 * d.rise,
      soft: root < 55 ? 0.00014 : root < 75 ? 0.00009 : 0.00006,
      softFrac: 0.012,
      noise: 0.12,
      // the wire-wound bass strings are stiff: their upper partials a little sharp
      disp: root < 52 ? -0.8 + 0.3 * clamp((root - 36) / 16, 0, 1) : 0,
      stages: root < 52 ? 1 : 0,
      t60a: 1 - 0.7 * bloom,
      p2: Math.max(0.02, 0.12 - 0.07 * bloom + 0.5 * d.p2),
      det2: 1.6 * d.det2,
      t60b: 1.45 - 0.2 * bloom,
      t60hib: 1.3,
      couple: 8 * bloom,
      out2: 1,
      seed,
    };
  },
  body: HARP_BODY,
  post(x, n, sr) {
    iir(x, n, coefs('hp', 50, 0.7, sr));
    iir(x, n, coefs('lp', Math.min(9500, 0.38 * sr), 0.55, sr));
  },
  win: 0.3,
  // a long ring's last 3 dB are under any hall: trimmed, they save a fifth of the low strings' memory
  floor: -57,
};

/** The double bass, pizzicato: the side of a finger near the end of the fingerboard, a big box. */
const UPRIGHT: Model = {
  id: 'upright',
  base: 28,
  zone: 3,
  lo: 22,
  hi: 67,
  div: () => 4,
  secs: (root) => clamp(1.3 * T60.upright(root), 1, 4.5),
  variants: () => 3,
  spec(root, v) {
    const seed = seedOf('upright', root, v), d = vary(seed);
    return {
      f0: mtof(root),
      t60: T60.upright(root),
      t60hi: 0.28 * d.t60hi,
      fHi: 1200,
      beta: 0.27 + d.beta,
      rise: 0.0007 * d.rise,
      riseFrac: 0.035 * d.rise,
      soft: 0.00024,
      softFrac: 0.012,
      noise: 0.15,
      disp: -0.7 + 0.3 * clamp((root - 28) / 30, 0, 1),
      stages: 1,
      p2: 0.3 + d.p2,
      det2: 0.8 * d.det2,
      t60b: 1.4,
      t60hib: 1.2,
      couple: 0.25,
      out2: 0.8,
      seed,
    };
  },
  body: UPRIGHT_BODY,
  post(x, n, sr) {
    iir(x, n, coefs('hp', 35, 0.7, sr));
    iir(x, n, coefs('lp', 4000, 0.6, sr));
  },
  win: 0.25,
  floor: -60,
};

/** A Precision bass with roundwounds, fingered over its split-coil pickup. */
const pbass = (id: string, muted: boolean): Model => ({
  id,
  base: 28,
  zone: 3,
  lo: 22,
  hi: 70,
  // the pickup's resonance and the speaker after it leave nothing above 4 kHz: a fifth of the rate keeps all of it
  div: () => 5,
  secs: (root) => (muted ? 0.22 : clamp(1.1 * T60.pbass(root), 1, 5)),
  variants: () => (muted ? 4 : 3),
  spec(root, v) {
    const seed = seedOf(id, root, v), d = vary(seed);
    return {
      f0: mtof(root),
      t60: muted ? 0.075 + 0.012 * d.k : T60.pbass(root),
      t60hi: muted ? 0.02 : 0.48 * d.t60hi,
      fHi: muted ? 800 : 2000,
      beta: 0.2 + d.beta,
      rise: (muted ? 0.0005 : 0.0004) * d.rise,
      riseFrac: 0.03 * d.rise,
      soft: muted ? 0.0004 : 0.00018,
      softFrac: 0.01,
      noise: muted ? 0.35 : 0.15,
      // roundwound strings are stiff: the upper partials run sharp (about +10 cents at the 10th, +25 at the 20th on E1)
      disp: muted ? 0 : -0.85 + 0.35 * clamp((root - 28) / 30, 0, 1),
      stages: muted ? 0 : 1,
      p2: muted ? 0 : 0.25 + d.p2,
      det2: 0.7 * d.det2,
      t60b: 1.35,
      t60hib: 1.2,
      couple: 0,
      out2: 0.6,
      seed,
    };
  },
  post(x, n, sr, root) {
    const P = sr / mtof(root);
    pickup(x, n, [[0.17 * P, 1]]);
    iir(x, n, coefs('hp', 32, 0.7, sr));
    iir(x, n, coefs('lp', Math.min(4500, 0.4 * sr), 0.6, sr));
  },
  win: muted ? 0.05 : 0.25,
  floor: -60,
});
const PBASS = pbass('pbass', false);
const PBASS_MUTE = pbass('pbass-mute', true);

// ── the noises: what touches the string, heard directly (full rate, a few milliseconds) ──────
interface Part {
  /** Attack and decay time constants (s), level, filters, an optional ripple (Hz: a wound string's ridges). */
  a: number;
  d: number;
  g: number;
  f: readonly (readonly [FType, number, number])[];
  ripple?: number;
}

const NOISES = {
  // a nail leaving a nylon string: a small crisp tick
  nail: { secs: 0.014, seed: 1, parts: [{ a: 0.0002, d: 0.0012, g: 1, f: [['hp', 1800, 0.7], ['bp', 4200, 0.9]] }] },
  // the thumb's flesh landing on a wound string and leaving it: a soft, low thup
  thup: { secs: 0.03, seed: 9, parts: [{ a: 0.001, d: 0.006, g: 1, f: [['lp', 900, 0.7], ['hp', 80, 0.7]] }] },
  // the fretting hand sliding along a wound string to a new chord: the squeak of a position shift
  zip: { secs: 0.05, seed: 2, parts: [{ a: 0.004, d: 0.012, g: 1, f: [['bp', 1700, 0.8], ['lp', 4000, 0.7]], ripple: 260 }] },
  // a plectrum: a hard little tick
  pick: { secs: 0.012, seed: 3, parts: [{ a: 0.0001, d: 0.0012, g: 1, f: [['hp', 900, 0.7], ['bp', 2800, 0.8]] }] },
  // a pick raking across muted strings: a rasp, rippling at the rate it crosses them
  rasp: { secs: 0.032, seed: 8, parts: [{ a: 0.0004, d: 0.007, g: 1, f: [['hp', 1200, 0.7], ['bp', 2600, 0.9]], ripple: 220 }] },
  // a harpist's fingertip leaving gut: a soft, bright zip
  flick: { secs: 0.016, seed: 4, parts: [{ a: 0.0004, d: 0.0025, g: 1, f: [['bp', 2400, 0.9]] }] },
  // the pad of a finger thumping a double-bass string, and the string clacking on the fingerboard
  thock: { secs: 0.06, seed: 5, parts: [{ a: 0.0015, d: 0.012, g: 1, f: [['lp', 380, 0.7], ['hp', 70, 0.7]] }, { a: 0.0003, d: 0.0035, g: 0.55, f: [['bp', 1300, 1.4]] }] },
  // a finger on a bass-guitar string, and its click on the fret or the pickup
  thwp: { secs: 0.035, seed: 6, parts: [{ a: 0.0008, d: 0.007, g: 1, f: [['lp', 1100, 0.7], ['hp', 150, 0.7]] }, { a: 0.0001, d: 0.0009, g: 0.4, f: [['bp', 3200, 1]] }] },
  // a finger landing on a string to stop it
  damp: { secs: 0.03, seed: 7, parts: [{ a: 0.002, d: 0.007, g: 1, f: [['lp', 700, 0.7], ['hp', 90, 0.7]] }] },
} satisfies Record<string, { secs: number; seed: number; parts: Part[] }>;
type Noise = keyof typeof NOISES;

function noiseBuf(ctx: BaseAudioContext, kind: Noise, v: number): AudioBuffer {
  return cachedBuffer(ctx, `plucked|noise|${kind}|${v}`, NOISES[kind].secs, noiseFill(kind, v));
}

function noiseFill(kind: Noise, v: number) {
  const spec = NOISES[kind];
  return (data: Float32Array, sr: number) => {
    const n = data.length, tmp = new Float32Array(n);
    spec.parts.forEach((p: Part, j) => {
      const rnd = noiseGen(spec.seed * 7717 + j * 131 + v * 977);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = (1 - Math.exp(-t / p.a)) * Math.exp(-t / p.d);
        tmp[i] = rnd() * env * (p.ripple ? 0.6 + 0.4 * Math.sin(2 * Math.PI * p.ripple * t) : 1);
      }
      for (const [type, f, q] of p.f) iir(tmp, n, coefs(type, f, q, sr));
      let pk = 0;
      for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(tmp[i]));
      if (pk > 0) for (let i = 0; i < n; i++) data[i] += (p.g / pk) * tmp[i];
    });
    normalise(data, 0.9);
    data[0] = 0;
    fadeTail(data, sr, 3);
    made += n * 4;
  };
}

/** A noise on its own (the squeak of a position shift): two nodes, freed when it ends. */
function hit(ctx: BaseAudioContext, buf: AudioBuffer, dest: AudioNode, t: number, gain: number): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(dest);
  const at = Math.max(0, t);
  src.start(at);
  src.stop(at + buf.duration + 0.01);
  freeWhenDone(src, g);
}

// ── playing a note ──────────────────────────────────────────────────────────────────────────
interface Vibrato {
  /** Depth (cents), rate (Hz), starting phase; `up` bends only sharp (a finger pushing across the string). */
  depth: number;
  rate: number;
  phase: number;
  up: boolean;
}

interface Play {
  buf: AudioBuffer;
  /** Pitch ratio to play the zone's buffer at (semitones and microtuning) and the buffer's storage divisor. */
  rate: number;
  div: number;
  gain: number;
  /** The velocity low-pass (Hz) and the frequency it closes to when the note is damped. */
  lp: number;
  damp: number;
  /** Held this long, then damped over `release` seconds. */
  dur: number;
  release: number;
  /** Starts this many cents sharp and settles with time constant `twangT` (a hard pluck stretches the string). */
  twang: number;
  twangT: number;
  /** The touch: a noise heard directly, starting `trAt` seconds from the note (negative = just before). */
  tr: AudioBuffer | null;
  trGain: number;
  trAt: number;
  /** The damping finger's thud, when the note is stopped before it has rung out. */
  dn?: AudioBuffer | null;
  dnGain?: number;
  vib?: Vibrato;
}

/**
 * The velocity low-pass's resonance. A Web Audio low-pass reads its Q in dB: −6 dB is a linear Q of 0.5, a critically
 * damped roll-off (two one-poles at the cutoff), the way a fingertip's flesh smooths a pluck; a peaked one (Q > 0 dB)
 * would lift the very harmonics a soft pluck loses.
 */
const SMOOTH = -6;

/** A hand's gesture (a strum, a chick): its strings share one low-pass and one pan, and are damped together. */
interface Gesture {
  f: BiquadFilterNode;
  dest: AudioNode;
  nodes: AudioNode[];
  voices: { src: AudioBufferSourceNode; nodes: AudioNode[] }[];
}

/** A gesture's shared low-pass, into `dest` (the instrument's pan position for it, or its amp). */
function gesture(ctx: BaseAudioContext, dest: AudioNode, t: number, lp: number): Gesture {
  const f = voiceFilter(ctx);
  f.type = 'lowpass';
  f.Q.value = SMOOTH;
  f.frequency.value = lp;
  f.frequency.setValueAtTime(lp, t);
  f.connect(dest);
  return { f, dest, nodes: [f], voices: [] };
}

/**
 * Close a gesture: its low-pass closes with the damping hand at `off` (the highs in a few milliseconds); each string
 * frees its own nodes when it stops, and the shared ones go with the last string to stop (a choked string can stop
 * before the others).
 */
function release(G: Gesture, lp: number, off: number, rel: number, damp: number): void {
  G.f.frequency.setValueAtTime(lp, off);
  G.f.frequency.exponentialRampToValueAtTime(clamp(damp, 60, lp), off + rel * 0.18);
  let left = G.voices.length;
  for (const v of G.voices) {
    v.src.onended = () => {
      v.src.onended = null;
      v.src.disconnect();
      for (const n of v.nodes) n.disconnect();
      if (--left === 0) for (const n of G.nodes) n.disconnect();
    };
  }
}

/**
 * A finger's vibrato on a held note, on the source's detune (cents; the playback rate where detune is missing): it
 * fades in over 0.3 s from `t0` and out just before `t1`. No nodes: one value curve.
 */
function vibrato(src: AudioBufferSourceNode, v: Vibrato, t0: number, t1: number, rate: number): void {
  const span = t1 - t0;
  if (span < 0.2) return;
  const det = src.detune as AudioParam | undefined;
  const n = Math.max(8, Math.ceil(span * 60)), curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tt = (i / (n - 1)) * span;
    const env = Math.min(1, tt / 0.3) * Math.min(1, (span - tt) / 0.06);
    const ph = 2 * Math.PI * v.rate * tt + v.phase;
    const c = v.depth * env * (v.up ? 0.5 - 0.5 * Math.cos(ph) : Math.sin(ph));
    curve[i] = det ? c : rate * Math.pow(2, c / 1200);
  }
  (det ?? src.playbackRate).setValueCurveAtTime(curve, t0, span);
}

/**
 * One note: buffer → gain → low-pass → `dest` (the instrument's pan position or amp), with its touch noise into the same
 * low-pass and the damping thud straight into `dest`: three to seven nodes; in a gesture the low-pass is the
 * gesture's (two to six a string). Starts at zero (every buffer's first sample is 0) and ends at zero (a buffer's own
 * faded tail, or the damping ramp); frees its nodes when its source stops (a gesture's strings: `release`).
 */
function voice(ctx: BaseAudioContext, dest: AudioNode, t: number, o: Play, G?: Gesture): Ring {
  const src = ctx.createBufferSource();
  src.buffer = o.buf;
  const rate = o.rate / o.div;
  // k-rate params: set the value now as well as at `t`, or the render quantum the note starts in would run on the
  // defaults (a 350 Hz filter, rate 1) and jump at the next quantum's edge
  const r0 = o.twang > 0.05 ? rate * Math.pow(2, o.twang / 1200) : rate;
  src.playbackRate.value = r0;
  if (o.twang > 0.05) {
    src.playbackRate.setValueAtTime(r0, t);
    src.playbackRate.setTargetAtTime(rate, t + 0.002, o.twangT);
  }
  const natural = o.buf.duration / rate;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(o.gain, t);
  const nodes: AudioNode[] = [g];
  let f: BiquadFilterNode;
  if (G) f = G.f;
  else {
    f = voiceFilter(ctx);
    f.type = 'lowpass';
    f.Q.value = SMOOTH;
    f.frequency.value = o.lp;
    f.frequency.setValueAtTime(o.lp, t);
    nodes.push(f);
  }
  let end = t + natural;
  const off = t + Math.max(0.004, o.dur);
  const damped = off + o.release < end;
  if (damped) {
    // the finger kills the highs at once and the body over the release
    g.gain.setValueAtTime(o.gain, off);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-5, o.gain * 1e-3), off + o.release);
    g.gain.linearRampToValueAtTime(0, off + o.release + 0.004);
    if (!G) {
      f.frequency.setValueAtTime(o.lp, off);
      f.frequency.exponentialRampToValueAtTime(clamp(o.damp, 60, o.lp), off + o.release * 0.18);
    }
    end = off + o.release + 0.004;
  }
  if (o.vib && o.vib.depth > 0) vibrato(src, o.vib, t + 0.22, (damped ? off : end) - 0.03, rate);
  src.connect(g);
  g.connect(f);
  if (!G) f.connect(dest);
  let last = end, quiet = t;
  let thud: GainNode | null = null;
  const touch = (buf: AudioBuffer, level: number, at: number, into: AudioNode) => {
    const ts = ctx.createBufferSource();
    ts.buffer = buf;
    const tg = ctx.createGain();
    tg.gain.value = level;
    ts.connect(tg);
    tg.connect(into);
    const start = Math.max(0, at);
    ts.start(start);
    ts.stop(start + buf.duration + 0.01);
    last = Math.max(last, start + buf.duration);
    nodes.push(ts, tg);
    return { tg, end: start + buf.duration };
  };
  if (o.tr && o.trGain > 0) quiet = touch(o.tr, o.trGain * o.gain, t + o.trAt, f).end;
  if (damped && o.dn && o.dnGain) thud = touch(o.dn, o.dnGain * o.gain, off, G ? G.dest : dest).tg;
  src.start(t);
  src.stop(last + 0.02);
  if (G) G.voices.push({ src, nodes });
  else freeWhenDone(src, ...nodes);
  return { start: t, off: damped ? off : end, g, gain: o.gain, thud, src, quiet };
}

/** A sounding note, as a later pluck of the same string sees it. */
interface Ring {
  start: number;
  /** When it stops of itself (damped or rung out). */
  off: number;
  g: GainNode;
  gain: number;
  /** The gain of its damping thud, if one is coming. */
  thud: GainNode | null;
  src: AudioBufferSourceNode;
  /** When its touch noise has finished (its nodes may not go before). */
  quiet: number;
}

/**
 * A string can't ring twice: plucking it again stops what it was doing (the finger lands on it first), over `rel`
 * seconds from `t`. Only a note that is still at its steady level is stopped (its gain is known: no ramp has begun).
 * Its source stops then too, so a choked note's nodes go at once instead of working on silence to their old end.
 */
function choke(prev: Ring | undefined, t: number, rel: number): void {
  if (!prev || t <= prev.start + 0.005 || t >= prev.off - 0.002) return;
  const p = prev.g.gain;
  p.cancelScheduledValues(t);
  p.setValueAtTime(prev.gain, t);
  p.exponentialRampToValueAtTime(Math.max(1e-5, prev.gain * 1e-3), t + rel);
  p.linearRampToValueAtTime(0, t + rel + 0.004);
  // its own damping thud, if it had one coming, is not needed any more
  prev.thud?.gain.setValueAtTime(0, t);
  try {
    prev.src.stop(Math.max(t + rel + 0.02, prev.quiet + 0.01));
  } catch {
    // older WebKit threw on a second stop(): the note still goes silent, its nodes just go later
  }
  prev.off = t;
}

/** The notes an instrument has sounding, by string (pitch), so a new pluck can stop the old one; and each string's
 * last round-robin variant, so a repeated note never replays the same buffer. */
class Strings {
  private ring = new Map<number, Ring>();
  private last = new Map<number, number>();
  /** Stop what `key` is ringing at `t`; with `key` undefined, everything (a hand muting all the strings). */
  stop(t: number, rel: number, key?: number): void {
    if (key === undefined) for (const v of this.ring.values()) choke(v, t, rel);
    else choke(this.ring.get(key), t, rel);
  }
  set(key: number, v: Ring): void {
    const old = this.ring.get(key);
    // keep the later of two notes scheduled out of order
    if (!old || v.start >= old.start) this.ring.set(key, v);
    if (this.ring.size > 64) for (const [k, x] of this.ring) if (x.off < v.start) this.ring.delete(k);
  }
  /** A variant for `key` out of `n`: any but the one it played last. */
  pick(key: number, n: number, r: Rnd): number {
    if (n <= 1) return 0;
    const was = this.last.get(key);
    let v = Math.floor(r() * (was === undefined ? n : n - 1));
    if (was !== undefined && v >= was) v++;
    this.last.set(key, Math.min(v, n - 1));
    return Math.min(v, n - 1);
  }
}

/** A biquad for a node chain: [type, Hz, Q (linear, as in the DSP kit), dB (peaking and shelves)]. */
type Filt = readonly [BiquadFilterType, number, number, number?];

/**
 * A shared amp for the electric instruments (made once, mono as an amp is): the pickup's resonance, a preamp that
 * leans on its bias (even harmonics, then grit, as it is pushed: unity gain and zero output at rest), the tone stack,
 * the speaker's band. Notes connect to the node it returns. `room` is the input level the shaper takes before it
 * flattens (2: twice full scale).
 */
function amp(ctx: BaseAudioContext, s: Strip, dest: AudioNode, o: { drive: number; bias: number; room: number; os: OverSampleType; pre: readonly Filt[]; post: readonly Filt[]; trim: number }): AudioNode {
  const input = ctx.createGain();
  input.channelCount = 1;
  input.channelCountMode = 'explicit';
  input.gain.value = 1 / o.room;
  const nodes: AudioNode[] = [input];
  let tail: AudioNode = input;
  const add = (n: AudioNode) => {
    tail.connect(n);
    tail = n;
    nodes.push(n);
  };
  const biquad = ([type, f, q, db]: Filt) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    // a Web Audio low- or high-pass reads its Q as the resonance in dB
    b.Q.value = type === 'lowpass' || type === 'highpass' ? 20 * Math.log10(q) : q;
    if (db !== undefined) b.gain.value = db;
    add(b);
  };
  o.pre.forEach(biquad);
  const sh = ctx.createWaveShaper();
  // an odd length, so silence lands exactly on the middle point (0)
  const N = 4097, curve = new Float32Array(N), D = Math.max(0.05, o.drive), b0 = Math.tanh(o.bias * D), slope = D * (1 - b0 * b0);
  for (let i = 0; i < N; i++) {
    const x = ((i / (N - 1)) * 2 - 1) * o.room;
    curve[i] = (Math.tanh(D * (x + o.bias)) - b0) / slope;
  }
  sh.curve = curve;
  sh.oversample = o.os;
  add(sh);
  o.post.forEach(biquad);
  const trim = ctx.createGain();
  trim.gain.value = o.trim;
  add(trim);
  trim.connect(dest);
  s.nodes.push(...nodes);
  return input;
}

/** An instrument's strongest body modes as shared peaking filters into `dest` (made once). Returns the chain's head. */
function box(ctx: BaseAudioContext, s: Strip, dest: AudioNode, modes: readonly Mode[]): AudioNode {
  let head: AudioNode = dest;
  for (const [f, q, db] of [...modes].reverse()) {
    const b = ctx.createBiquadFilter();
    b.type = 'peaking';
    b.frequency.value = f;
    b.Q.value = q;
    b.gain.value = db;
    b.connect(head);
    head = b;
    s.nodes.push(b);
  }
  return head;
}

/**
 * Pan positions made once per instrument (seven across ±`width`): a note joins the nearest instead of making a panner
 * of its own. Returns the node to connect a note to for a pan position. The middle one is a panner too: a panner
 * sends a mono note out at the equal-power law (0.707 a side in the middle), a plain connection at 1 a side, and
 * every position must be as loud as the others.
 */
function panBank(ctx: BaseAudioContext, s: Strip, dest: AudioNode, width: number, n = 7): (p: number) => AudioNode {
  const w = Math.max(0.001, width);
  const outs: AudioNode[] = [];
  for (let i = 0; i < n; i++) {
    const p = -w + (2 * w * i) / (n - 1);
    const pn = pan(ctx, Math.abs(p) < 1e-6 ? 0 : p);
    pn.connect(dest);
    s.nodes.push(pn);
    outs.push(pn);
  }
  return (p) => outs[Math.round(clamp((p + w) / (2 * w), 0, 1) * (n - 1))];
}

/** Order a chord for a strum: low to high going down, high to low coming up. */
const order = (notes: number[], dir: 'down' | 'up') => {
  const ns = [...notes].sort((a, b) => a - b);
  return dir === 'up' ? ns.reverse() : ns;
};

/**
 * The velocity low-pass of a plucked string (Hz), as the harmonic a pluck keeps up to: `n0` for the softest, opening
 * as velocity^2.5 to `n0 + n1` for the hardest, so the tone brightens over the whole range a track plays in (with 2 and
 * 30: three or four harmonics at 0.3, seven at 0.5, twelve at 0.65, nineteen at 0.8, all of them at 1); `add` Hz more
 * at full velocity keeps the low strings' soft notes from going woolly.
 */
const opens = (f0: number, x: number, n0: number, n1: number, add = 0) => (n0 + n1 * Math.pow(x, 2.5)) * f0 + add * x;

/** The basses' velocity low-pass (Hz): a soft note keeps its first few harmonics and the finger's definition (about
 * 800 Hz at 0.3 on E1–E2), a hard one opens to the pickup's or the box's top. */
const bassLp = (f0: number, x: number) => 200 + 3 * f0 + 4800 * Math.pow(x, 2.2);

/** Random cents → a pitch ratio. */
const cents = (r: Rnd, spread: number) => Math.pow(2, ((r() - 0.5) * 2 * spread) / 1200);

// ── making buffers ahead ────────────────────────────────────────────────────────────────────
const MODELS = { nylon: [NYLON], funk: [STRAT, STRAT_MUTE], harp: [HARP], upright: [UPRIGHT], ebass: [PBASS, PBASS_MUTE] };
type Which = keyof typeof MODELS;

const pending: (() => void)[] = [];
let warming = false;

function later(fn: (d?: IdleDeadline) => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 250 });
  else setTimeout(fn, 20);
}

/**
 * Make queued buffers while the page is idle: at least one a call (a buffer takes 1–4 ms), more only while the idle
 * period has 6 ms left (or, without idle callbacks, for 3 ms), then give the thread back.
 */
function pump(d?: IdleDeadline): void {
  const t0 = performance.now();
  do pending.shift()?.();
  while (pending.length && (d && !d.didTimeout ? d.timeRemaining() > 6 : performance.now() - t0 < 3));
  if (pending.length) later(pump);
  else warming = false;
}

/** Queue every zone and variant from `lo` to `hi` (MIDI), the middle of the range first: in the worker when there is one. */
function queue(ctx: BaseAudioContext, models: readonly Model[], lo: number, hi: number): void {
  const mid = (lo + hi) / 2, jobs: [number, () => void, string][] = [];
  for (const M of models)
    for (let root = zoneOf(M, lo); root <= zoneOf(M, hi); root += M.zone)
      for (let v = 0; v < M.variants(root); v++) jobs.push([Math.abs(root - mid) + v * 0.5, () => void zoneBuffer(ctx, M, root, v), `plucked|${M.id}|${root}|${v}`]);
  jobs.sort((a, b) => a[0] - b[0]);
  const live = typeof OfflineAudioContext === 'undefined' || !(ctx instanceof OfflineAudioContext);
  for (const [, job, key] of jobs) if (!(live && askWorker(ctx.sampleRate, key))) pending.push(job);
  if (!warming && pending.length) {
    warming = true;
    later(pump);
  }
}

// ── the instruments ─────────────────────────────────────────────────────────────────────────
/**
 * The bossa nova guitar: a nylon-string classical, thumb on the bass strings (round and warm), fingers on the chord
 * (flesh with a little nail), a wooden box. `note(t, m, dur, vel, pan?)` plucks one string (a treble note held over
 * 0.45 s gets a finger vibrato); `strum(t, notes, dur, vel, dir, spread)` sweeps a chord (`spread` seconds between
 * strings: 0.004–0.008 for the fingers' pinch, 0.012–0.03 for a strum); moving to a new chord shape the left hand now
 * and then squeaks on a wound string. Range E2–C6 (m 40–84). `bright` scales the velocity low-pass, `width` the
 * strings' spread in the stereo, `vibrato` its depth in cents (0 = none), `warm` a range to make ahead.
 */
export function makeNylon(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { bright?: number; width?: number; vibrato?: number; warm?: readonly [number, number] } = {}) {
  const bright = o.bright ?? 1, width = o.width ?? 0.28, vib = o.vibrato ?? 6;
  if (o.warm) queue(ctx, MODELS.nylon, o.warm[0], o.warm[1]);
  const seat = panBank(ctx, s, box(ctx, s, s.in, BOX.nylon), width);
  // a soft pluck keeps a few harmonics, a hard one all the box gives
  const lpOf = (f0: number, x: number) => clamp(opens(f0, x, 2, 30, 300) * bright * (0.9 + r() * 0.2), 300, 9000 * Math.max(1, bright));
  const strings = new Strings();
  let shape = '', shapeAt = -1;
  const one = (t: number, m: number, dur: number, vel: number, p: number, scale: number, G?: Gesture, first = true) => {
    const root = zoneOf(NYLON, m), thumb = root < 52, f0 = mtof(m), x = clamp(vel, 0, 1), key = Math.round(m);
    strings.stop(t, 0.03, key);
    const v = voice(ctx, seat(p), t, {
      buf: zoneBuffer(ctx, NYLON, root, strings.pick(key, NYLON.variants(root), r)),
      div: NYLON.div(root),
      rate: Math.pow(2, (m - root) / 12) * cents(r, 2.2),
      // the trebles carry more of their sound where the ear is keenest: a gentle tilt keeps the range even
      gain: LEVEL.nylon * scale * Math.pow(x, 1.2) * Math.pow(2, -Math.max(0, m - 64) / 96) * (0.93 + r() * 0.14),
      lp: G ? 0 : lpOf(f0, x),
      damp: f0 * 1.5,
      dur,
      release: thumb ? 0.09 : 0.075,
      twang: 5 * x * x,
      twangT: 0.035,
      tr: noiseBuf(ctx, thumb ? 'thup' : 'nail', Math.floor(r() * 4)),
      trGain: (thumb ? 0.17 : 0.23) * x * x * (first ? 1 : 0.7),
      trAt: -0.003,
      dn: first ? noiseBuf(ctx, 'damp', Math.floor(r() * 4)) : null,
      dnGain: 0.1,
      vib: !G && vib > 0 && dur > 0.45 && m >= 52 ? { depth: vib * (0.75 + 0.5 * r()), rate: 5 + 1.2 * r(), phase: 6.283 * r(), up: false } : undefined,
    }, G);
    strings.set(key, v);
  };
  const where = (m: number) => clamp(((m - 62) / 22) * width, -width, width);
  return {
    note(t: number, m: number, dur: number, vel: number, p = where(m)) {
      one(t, m, dur, vel, p, 1);
    },
    strum(t: number, notes: number[], dur: number, vel: number, dir: 'down' | 'up' = 'down', spread = 0.012) {
      if (!notes.length) return;
      const ns = order(notes, dir), k = 1 / Math.sqrt(ns.length), low = Math.min(...ns);
      const mid = ns.reduce((a, b) => a + b, 0) / ns.length, lp = lpOf(mtof(mid), clamp(vel, 0, 1));
      const at0 = where(mid) + (r() - 0.5) * 0.06;
      const G = gesture(ctx, seat(at0), t, lp);
      // a new chord shape: the left hand slides there, and now and then a finger squeaks on a wound string
      const sh = [...notes].sort((a, b) => a - b).join(' ');
      if (sh !== shape && shapeAt >= 0 && t - shapeAt > 0.15 && r() < 0.3) hit(ctx, noiseBuf(ctx, 'zip', Math.floor(r() * 4)), seat(at0 - 0.12), t - 0.04 - 0.04 * r(), LEVEL.nylon * 0.035 * (0.6 + 0.8 * r()) * Math.sqrt(clamp(vel, 0.2, 1)));
      shape = sh;
      shapeAt = t;
      let at = t;
      ns.forEach((m, i) => {
        const pos = ns.length > 1 ? i / (ns.length - 1) : 0;
        one(at, m, Math.max(0.03, dur - (at - t)), vel * (dir === 'up' ? 0.88 : 1) * (1 - 0.12 * pos) * (0.94 + r() * 0.12), 0, k, G, i === 0);
        at += spread * (0.75 + r() * 0.5);
      });
      release(G, lp, t + Math.max(0.03, dur), low < 52 ? 0.09 : 0.075, mtof(low) * 1.5);
    },
  };
}

/**
 * A clean single-coil electric for funk and city pop: neck and middle pickups, a pick, a clean amp (mono, as an amp
 * is) that leans into its bias and rounds the loudest notes (`drive`, default 2.2: more is grittier), a 1×12 speaker,
 * a little chorus for width if `chorus` (mix 0..1) is set and `onStop` is given (the chorus's LFOs stop there; without
 * it the guitar is mono: place it with the strip's pan). `note(t, m, dur, vel)` (held over 0.45 s: a finger vibrato
 * that bends sharp, `vibrato` cents, default 10) and `strum` as the nylon's; `chick(t, notes, vel)` is the muted
 * "chicken scratch": strings stopped under the fretting hand, a quick dry rake with the pitch barely there (it also
 * stops whatever was ringing). Range E2–E6 (m 40–88).
 */
export function makeFunkGuitar(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { chorus?: number; drive?: number; bright?: number; vibrato?: number; onStop?: (fn: () => void) => void; warm?: readonly [number, number] } = {}) {
  const bright = o.bright ?? 1, vib = o.vibrato ?? 10;
  if (o.warm) queue(ctx, MODELS.funk, o.warm[0], o.warm[1]);
  let out: AudioNode = s.in;
  if ((o.chorus ?? 0) > 0 && o.onStop) {
    const fx = chorus(ctx, s.in, { mix: o.chorus, rate: 0.55, depth: 0.0022, delay: 0.011 });
    o.onStop(fx.stop);
    out = fx.input;
    s.nodes.push(fx.input);
  }
  // the pickup's resonance with its cable, the preamp, the tone stack (scooped mids, a little presence), the speaker
  const into = amp(ctx, s, out, {
    drive: o.drive ?? 2.2,
    bias: 0.1,
    room: 2,
    os: '2x',
    pre: [['lowpass', 4300, 2.2]],
    post: [['peaking', 480, 0.7, -3.5], ['peaking', 2600, 1.1, 2], ['highpass', 90, 0.6], ['lowpass', 5400, 0.9], ['lowpass', 7200, 0.6]],
    trim: 1.31,
  });
  const lpOf = (f0: number, x: number) => clamp(opens(f0, x, 2.5, 34, 400) * bright * (0.9 + r() * 0.2), 700, 12000 * Math.max(1, bright));
  const strings = new Strings();
  const one = (t: number, m: number, dur: number, vel: number, scale: number, G?: Gesture, first = true) => {
    const root = zoneOf(STRAT, m), f0 = mtof(m), x = clamp(vel, 0, 1), key = Math.round(m);
    strings.stop(t, 0.025, key);
    const v = voice(ctx, into, t, {
      buf: zoneBuffer(ctx, STRAT, root, strings.pick(key, STRAT.variants(root), r)),
      div: STRAT.div(root),
      rate: Math.pow(2, (m - root) / 12) * cents(r, 2),
      gain: LEVEL.funk * scale * Math.pow(x, 1.15) * (0.93 + r() * 0.14),
      lp: G ? 0 : lpOf(f0, x),
      damp: f0 * 1.5,
      dur,
      release: 0.06,
      twang: 4 * x * x,
      twangT: 0.03,
      tr: noiseBuf(ctx, 'pick', Math.floor(r() * 4)),
      trGain: 0.15 * x * x * (first ? 1 : 0.6),
      trAt: -0.0015,
      dn: first ? noiseBuf(ctx, 'damp', Math.floor(r() * 4)) : null,
      dnGain: 0.08,
      vib: !G && vib > 0 && dur > 0.45 ? { depth: vib * (0.75 + 0.5 * r()), rate: 5.2 + r(), phase: 6.283 * r(), up: true } : undefined,
    }, G);
    strings.set(key, v);
  };
  return {
    note(t: number, m: number, dur: number, vel: number) {
      one(t, m, dur, vel, 1);
    },
    strum(t: number, notes: number[], dur: number, vel: number, dir: 'down' | 'up' = 'down', spread = 0.008) {
      if (!notes.length) return;
      const ns = order(notes, dir), k = 1 / Math.sqrt(ns.length), low = Math.min(...ns);
      const mid = ns.reduce((a, b) => a + b, 0) / ns.length, lp = lpOf(mtof(mid), clamp(vel, 0, 1));
      const G = gesture(ctx, into, t, lp);
      let at = t;
      ns.forEach((m, i) => {
        const pos = ns.length > 1 ? i / (ns.length - 1) : 0;
        one(at, m, Math.max(0.03, dur - (at - t)), vel * (dir === 'up' ? 0.85 : 1) * (1 - 0.1 * pos) * (0.94 + r() * 0.12), k, G, i === 0);
        at += spread * (0.75 + r() * 0.5);
      });
      release(G, lp, t + Math.max(0.03, dur), 0.06, mtof(low) * 1.5);
    },
    chick(t: number, notes: number[], vel: number) {
      if (!notes.length) return;
      const ns = order(notes, 'down'), k = 1 / Math.sqrt(ns.length), x = clamp(vel, 0, 1);
      const lp = clamp((2500 + 9000 * x * x) * bright * (0.85 + r() * 0.3), 600, 16000);
      const G = gesture(ctx, into, t, lp);
      // the fretting hand lies across the strings: whatever was ringing stops
      strings.stop(t, 0.02);
      let at = t;
      ns.forEach((m, i) => {
        const root = zoneOf(STRAT_MUTE, m);
        voice(ctx, into, at, {
          buf: zoneBuffer(ctx, STRAT_MUTE, root, strings.pick(1000 + Math.round(m), STRAT_MUTE.variants(root), r)),
          div: STRAT_MUTE.div(root),
          rate: Math.pow(2, (m - root) / 12) * cents(r, 6),
          gain: LEVEL.chick * k * Math.pow(x, 1.1) * (0.85 + r() * 0.3),
          lp: 0,
          damp: 400,
          dur: 1,
          release: 0.02,
          twang: 0,
          twangT: 0.03,
          tr: i === 0 ? noiseBuf(ctx, 'rasp', Math.floor(r() * 4)) : null,
          trGain: 0.3 * x,
          trAt: -0.001,
        }, G);
        at += 0.0045 * (0.7 + r() * 0.6);
      });
      release(G, lp, t + 1, 0.02, 400);
    },
  };
}

/**
 * The concert harp: fingertips near the middle of the string, a bright pluck, a long pure ring, the wound bass
 * strings blooming after the attack. `note(t, m, dur, vel, pan?)` (a short `dur` is a damped, étouffé note; let it
 * ring with a long one); `chord(t, notes, dur, vel, roll?)` rolls a chord up from the bottom; `gliss(t, notes,
 * spacing, vel)` plays `notes` in the order given, `spacing` seconds apart (0.03–0.07), each left to ring. Range
 * C2–C7 (m 36–96); panned low left, high right by `width`; `warm` a range to make ahead.
 */
export function makeHarp(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { bright?: number; width?: number; warm?: readonly [number, number] } = {}) {
  const bright = o.bright ?? 1, width = o.width ?? 0.45;
  if (o.warm) queue(ctx, MODELS.harp, o.warm[0], o.warm[1]);
  const where = (m: number) => clamp(((m - 66) / 30) * width, -width, width);
  const seat = panBank(ctx, s, s.in, width);
  const strings = new Strings();
  const one = (t: number, m: number, dur: number, vel: number, p: number, scale: number, flick = true) => {
    const root = zoneOf(HARP, m), f0 = mtof(m), x = clamp(vel, 0, 1), key = Math.round(m);
    strings.stop(t, 0.05, key);
    const sounding = voice(ctx, seat(p), t, {
      buf: zoneBuffer(ctx, HARP, root, strings.pick(key, HARP.variants(root), r)),
      div: HARP.div(root),
      rate: Math.pow(2, (m - root) / 12) * cents(r, 1.5),
      gain: LEVEL.harp * scale * Math.pow(x, 1.2) * (0.93 + r() * 0.14),
      // a harpist's softest pluck still rings clear (the menu and era 4 play it at 0.25–0.5): four or five harmonics
      lp: clamp(opens(f0, x, 3, 30, 300) * bright * (0.9 + r() * 0.2), 300, 11000 * Math.max(1, bright)),
      damp: f0 * 1.5,
      dur,
      release: 0.25,
      twang: 4 * x * x,
      twangT: 0.04,
      tr: flick ? noiseBuf(ctx, 'flick', Math.floor(r() * 4)) : null,
      trGain: 0.15 * x * x,
      trAt: -0.002,
      dn: noiseBuf(ctx, 'damp', Math.floor(r() * 4)),
      dnGain: 0.08,
    });
    strings.set(key, sounding);
  };
  return {
    note(t: number, m: number, dur: number, vel: number, p = where(m)) {
      one(t, m, dur, vel, p, 1);
    },
    /** A chord rolled from the bottom (`roll` seconds between strings, each gap its own; 0 = all at once), 1/√n. */
    chord(t: number, notes: number[], dur: number, vel: number, roll = 0.025) {
      const ns = [...notes].sort((a, b) => a - b), k = 1 / Math.sqrt(Math.max(1, ns.length));
      let at = t;
      for (const m of ns) {
        one(at, m, dur, vel * (0.94 + r() * 0.12), where(m), k);
        at += roll * (0.8 + r() * 0.4);
      }
    },
    gliss(t: number, notes: number[], spacing: number, vel: number) {
      const n = notes.length;
      notes.forEach((m, i) => {
        const shape = 0.84 + 0.16 * Math.sin((Math.PI * (i + 0.5)) / n);
        one(t + i * spacing + (r() - 0.5) * spacing * 0.25, m, 30, vel * shape * (0.92 + r() * 0.16), where(m), LEVEL.gliss, i === 0);
      });
    },
  };
}

/**
 * The double bass, pizzicato: a woody thump, the finger's noise and the string's clack on the fingerboard, a round
 * warm sustain that blooms a little, a pitch that drops into place on a hard pluck; damped at `dur`. Range E1–G3
 * (m 28–55, notes down to C1 work); `warm` a range to make ahead.
 */
export function makeUprightBass(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { warm?: readonly [number, number] } = {}) {
  if (o.warm) queue(ctx, MODELS.upright, o.warm[0], o.warm[1]);
  const into = box(ctx, s, s.in, BOX.upright);
  // a bass line is one note at a time: each pluck stops the note before
  const strings = new Strings();
  return (t: number, m: number, dur: number, vel: number) => {
    const root = zoneOf(UPRIGHT, m), f0 = mtof(m), x = clamp(vel, 0, 1);
    strings.stop(t, 0.04);
    const v = voice(ctx, into, t, {
      buf: zoneBuffer(ctx, UPRIGHT, root, strings.pick(Math.round(m), UPRIGHT.variants(root), r)),
      div: UPRIGHT.div(root),
      rate: Math.pow(2, (m - root) / 12) * cents(r, 2),
      gain: LEVEL.upright * Math.pow(x, 1.1) * (0.93 + r() * 0.14),
      lp: clamp(bassLp(f0, x) * (0.9 + r() * 0.2), 250, 6000),
      damp: f0 * 1.5,
      dur,
      release: 0.07,
      twang: 6 + 16 * x * x,
      twangT: 0.06,
      tr: noiseBuf(ctx, 'thock', Math.floor(r() * 4)),
      trGain: 0.17 * Math.pow(x, 1.5),
      trAt: -0.002,
      dn: noiseBuf(ctx, 'damp', Math.floor(r() * 4)),
      dnGain: 0.1,
    });
    strings.set(0, v);
  };
}

/**
 * A fingered Precision bass with roundwounds: punchy, warm, an amp that leans into its bias and grits when played
 * hard (`drive`, default 2.6). `mute` plays a ghost note: the string stopped by the fretting hand, a percussive thud
 * with the pitch barely there. One note at a time. Range E1–G3 (m 28–55; down to B0 works); `warm` a range to make
 * ahead.
 */
export function makeElectricBass(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { drive?: number; warm?: readonly [number, number] } = {}) {
  if (o.warm) queue(ctx, MODELS.ebass, o.warm[0], o.warm[1]);
  const into = amp(ctx, s, s.in, {
    drive: o.drive ?? 2.6,
    bias: 0.12,
    room: 2,
    os: '2x',
    pre: [['lowpass', 3200, 1.5]],
    post: [['peaking', 850, 0.9, 2.5], ['highpass', 32, 0.7], ['lowpass', 4800, 0.7]],
    trim: 0.87,
  });
  const strings = new Strings();
  return (t: number, m: number, dur: number, vel: number, mute = false) => {
    const M = mute ? PBASS_MUTE : PBASS, root = zoneOf(M, m), f0 = mtof(m), x = clamp(vel, 0, 1);
    strings.stop(t, 0.03);
    const v = voice(ctx, into, t, {
      buf: zoneBuffer(ctx, M, root, strings.pick(Math.round(m) + (mute ? 1000 : 0), M.variants(root), r)),
      div: M.div(root),
      rate: Math.pow(2, (m - root) / 12) * cents(r, mute ? 5 : 1.6),
      gain: (mute ? LEVEL.ghost : LEVEL.pbass) * Math.pow(x, 1.1) * (0.93 + r() * 0.14),
      lp: clamp(bassLp(f0, x) * (0.9 + r() * 0.2), 250, 6000),
      damp: f0 * 1.5,
      dur: mute ? Math.min(dur, 0.12) : dur,
      release: mute ? 0.03 : 0.06,
      twang: mute ? 0 : 3 + 9 * x * x,
      twangT: 0.05,
      tr: noiseBuf(ctx, 'thwp', Math.floor(r() * 4)),
      trGain: (mute ? 0.4 : 0.15) * Math.pow(x, 1.5),
      trAt: -0.0015,
      dn: mute ? null : noiseBuf(ctx, 'damp', Math.floor(r() * 4)),
      dnGain: 0.1,
    });
    strings.set(0, v);
  };
}

/**
 * Per-note levels, calibrated in the lab (demoPluckedLevels): a vel-0.8 note in the instrument's middle reads about
 * −23 LUFS momentary on a dry strip of gain 1 on every instrument (peaks −16…−10 dBFS: the harp's pure tone has the
 * least crest, the pick's attack the most); a chord about as loud as a note. The electric instruments' levels feed
 * their amps (how hard they drive them); their loudness is set by the amp's trim.
 */
const LEVEL = { nylon: 0.99, funk: 0.75, chick: 0.3, harp: 0.9, gliss: 0.4, upright: 0.74, pbass: 0.85, ghost: 0.3 };

/** The family's buffers made so far (bytes), for the lab. */
export const pluckedBytes = () => made;

/**
 * Make an instrument's buffers ahead so its first bars don't pay for them: every zone from `lo` to `hi` (MIDI), every
 * variant, the muted strings too for the funk guitar and the electric bass. At once (returns the bytes made), or with
 * `idle` a few milliseconds at a time while the page is idle, the middle of the range first (returns 0). A buffer
 * takes 1–4 ms to make; the noises are made on first use (a fraction of a millisecond each).
 */
export function warmPlucked(ctx: BaseAudioContext, which: Which, lo: number, hi: number, o: { idle?: boolean } = {}): number {
  if (o.idle) {
    queue(ctx, MODELS[which], lo, hi);
    return 0;
  }
  const before = made;
  for (const M of MODELS[which])
    for (let root = zoneOf(M, lo); root <= zoneOf(M, hi); root += M.zone)
      for (let v = 0; v < M.variants(root); v++) zoneBuffer(ctx, M, root, v);
  return made - before;
}

// ── made in the worker (offthread.ts) ───────────────────────────────────────────────────────
const ALL_MODELS: Model[] = [HARP, PBASS, PBASS_MUTE, NYLON, UPRIGHT, STRAT, STRAT_MUTE];

/** The samples of a `plucked|…` key at `sr` (a string's zone or a touch noise): the worker's job. */
export function pluckedSamples(key: string, sr: number): Float32Array[] | null {
  const [, id, a, b] = key.split('|');
  const v = Number(b);
  if (id === 'noise') {
    const kind = a as Noise;
    return NOISES[kind] ? [fillSamples(NOISES[kind].secs, sr, noiseFill(kind, v))] : null;
  }
  const M = ALL_MODELS.find((m) => m.id === id);
  const root = Number(a);
  return M ? [fillSamples(M.secs(root) / M.div(root), sr, zoneFill(M, root, v))] : null;
}

/**
 * Start making the plucked instruments in the worker at `sr` while the game loads: every zone and variant, `title` =
 * the title screen's harp and bass, `rest` = the others and every touch noise. Nothing happens without a worker.
 */
export function prewarmPlucked(sr: number, which: 'title' | 'rest'): void {
  if (which === 'rest') for (const kind of Object.keys(NOISES)) for (let v = 0; v < 4; v++) askWorker(sr, `plucked|noise|${kind}|${v}`);
  for (const M of ALL_MODELS.filter((m) => (m === HARP || m === PBASS || m === PBASS_MUTE) === (which === 'title')))
    for (let root = M.lo; root <= M.hi; root += M.zone)
      for (let v = 0; v < M.variants(root); v++) if (!askWorker(sr, `plucked|${M.id}|${root}|${v}`)) return;
}

// ── demos (tools/audio/render.mjs fn /src/audio/voices/plucked.ts demoX) ────────────────────
/** Bossa nova comping over Fmaj7 – Gm7 – C9 at 132: thumb on 1 and 3, the chord on the clave; soft, then loud;
 * a scale and fast repeats; a melody note held with vibrato; a last chord left to ring. */
export function demoNylon(lab: Lab): void {
  const g = makeNylon(lab.ctx, lab.strip('nylon', { gain: 1, rev: 0.16 }), lab.r);
  const e8 = 60 / 132 / 2, bar = e8 * 8;
  const CH: Record<string, { bass: [number, number]; v: number[] }> = {
    F: { bass: [41, 48], v: [53, 57, 60, 64] },
    Gm: { bass: [43, 50], v: [53, 58, 62, 67] },
    C: { bass: [48, 43], v: [52, 58, 62, 67] },
  };
  const prog = ['F', 'F', 'Gm', 'C', 'F', 'F', 'Gm', 'C'];
  // the chord's clave over two bars, in eighths
  const clave = [0, 3, 6, 10, 13];
  prog.forEach((name, b) => {
    const c = CH[name], t = lab.t0 + b * bar, loud = b >= 4;
    const tv = loud ? 0.72 : 0.42, cv = loud ? 0.78 : 0.4;
    g.note(t, c.bass[0], e8 * 3.8, tv);
    g.note(t + e8 * 4, c.bass[1], e8 * 3.8, tv * 0.92);
    for (const k of clave) {
      if (Math.floor(k / 8) !== b % 2) continue;
      const at = t + (k % 8) * e8;
      const next = clave.find((q) => q > k) ?? 16;
      g.strum(at, c.v, (next - k) * e8 * 0.8, cv * (k === 0 ? 1 : 0.92), loud && k === 13 ? 'up' : 'down', 0.006);
    }
  });
  // a run up the scale in sixteenths, fast repeats, a held melody note
  const t9 = lab.t0 + 8 * bar, s16 = e8 / 2;
  const scale = [53, 55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72, 74, 76, 77];
  scale.forEach((m, i) => g.note(t9 + i * s16, m, s16 * 1.2, 0.45 + (0.45 * i) / scale.length));
  for (let i = 0; i < 6; i++) g.note(t9 + (15 + i) * s16, 69, s16 * 0.9, 0.75 - i * 0.04);
  g.note(t9 + 21 * s16, 72, 1.2, 0.8);
  // the last chord: F6/9 over F, a slow strum, left to ring
  const t10 = t9 + 21 * s16 + 1.3;
  g.note(t10, 41, 4, 0.7);
  g.strum(t10 + 0.04, [53, 57, 62, 67, 72], 4, 0.72, 'down', 0.045);
}

/** Garage funk at 100: chicken scratch on D9, stabs on G9, a single-note riff, upper triads, a ringing 6/9. */
export function demoFunkGuitar(lab: Lab): void {
  const g = makeFunkGuitar(lab.ctx, lab.strip('funk', { gain: 1, rev: 0.12 }), lab.r, { chorus: 0.25, onStop: lab.onStop });
  const s16 = 60 / 100 / 4, bar = s16 * 16;
  const D9 = [50, 54, 60, 64], G9 = [55, 59, 65, 69];
  // chicks on the sixteenths; full stabs on the accents
  const scratch = 'x.-.o-x.-.o-x-o.';
  const stabs = [4, 12];
  for (let b = 0; b < 4; b++) {
    const t = lab.t0 + b * bar, ch = b === 2 ? G9 : D9;
    for (let i = 0; i < 16; i++) {
      const at = t + i * s16;
      if (stabs.includes(i)) g.strum(at, ch, s16 * 0.9, 0.82, 'down', 0.006);
      else if (scratch[i] !== '.') g.chick(at, ch, scratch[i] === 'x' ? 0.72 : scratch[i] === 'o' ? 0.5 : 0.3);
    }
    if (b === 3) g.strum(t + 14 * s16, ch, s16 * 1.6, 0.7, 'up', 0.005);
  }
  // a single-note riff (D mixolydian), with muted ghosts between
  const riff: [number, number, number][] = [[0, 50, 1], [3, 50, 1], [4, 54, 1], [6, 57, 2], [9, 59, 1], [10, 57, 1], [12, 60, 2], [14, 59, 1], [15, 57, 1]];
  for (let b = 4; b < 6; b++) {
    const t = lab.t0 + b * bar;
    for (const [i, m, len] of riff) g.note(t + i * s16, b === 5 && i === 12 ? 62 : m, s16 * len * 0.8, b === 5 ? 0.85 : 0.62);
    for (const i of [2, 5, 8, 11, 13]) g.chick(t + i * s16, [50, 55], 0.35);
  }
  // upper triads, syncopated
  const tri: [number, number[]][] = [[0, [62, 66, 69]], [3, [62, 66, 69]], [6, [62, 67, 71]], [10, [64, 69, 73]], [12, [62, 66, 69]]];
  const t6 = lab.t0 + 6 * bar;
  for (const [i, ch] of tri) g.strum(t6 + i * s16, ch, s16 * 1.2, 0.8, 'down', 0.004);
  for (const i of [1, 2, 5, 8, 9, 14]) g.chick(t6 + i * s16, [62, 66, 69], 0.4);
  // a held, bent-up melody note, then a ringing D6/9
  g.note(lab.t0 + 7 * bar, 74, 1.1, 0.85);
  g.strum(lab.t0 + 7 * bar + 1.3, [50, 54, 59, 64, 69], 3, 0.75, 'down', 0.02);
}

/** The harp: glissandi up and down, rolled chords, the theme's opening up high, fast repeats, a last rolled chord. */
export function demoHarp(lab: Lab): void {
  const h = makeHarp(lab.ctx, lab.strip('harp', { gain: 1, rev: 0.3 }), lab.r);
  const C = [0, 2, 4, 5, 7, 9, 11];
  const diatonic = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let m = lo; m <= hi; m++) if (C.includes(m % 12)) out.push(m);
    return out;
  };
  let t = lab.t0;
  h.gliss(t, diatonic(48, 84), 0.05, 0.64);
  h.gliss(t + 1.6, diatonic(60, 84).reverse(), 0.06, 0.5);
  // rolled chords at 72: Cmaj7, Am9, Fmaj7, G6
  t += 3.2;
  const q = 60 / 72;
  const chords: [number[], number[]][] = [[[36, 43], [52, 55, 59, 64]], [[33, 40], [55, 59, 60, 64]], [[29, 36], [53, 57, 60, 64]], [[31, 38], [52, 55, 59, 62]]];
  chords.forEach(([bass, up], i) => {
    const at = t + i * 2 * q;
    h.chord(at, bass, 2.5, 0.4, 0.05);
    up.forEach((m, j) => h.note(at + q * 0.5 * (j + 1), m, 3, 0.5 + j * 0.05));
  });
  // the theme's opening (so–do–re–mi, up to so) up high, loud, over bass notes
  t += 8 * q;
  const tune: [number, number, number][] = [[0, 67, 0.75], [0.75, 72, 0.75], [1.5, 74, 0.5], [2, 76, 1], [3, 79, 1], [4, 77, 0.75], [4.75, 76, 0.75], [5.5, 74, 0.5], [6, 72, 1.5]];
  const b8 = 60 / 120;
  for (const [at, m, len] of tune) h.note(t + at * b8, m, len * b8 * 2, 0.72);
  h.chord(t + 0.03, [36, 43], 3, 0.4, 0.04);
  h.chord(t + 4 * b8 + 0.03, [41, 48], 3, 0.38, 0.04);
  // fast repeats, then a soft gliss down from the top
  t += 7.6 * b8;
  for (let i = 0; i < 6; i++) h.note(t + i * 0.1, 76, 0.5, 0.55 - i * 0.03);
  h.gliss(t + 0.7, diatonic(72, 96).reverse(), 0.04, 0.42);
  // the last chord, rolled from the bottom, left to ring
  h.chord(t + 2.0, [36, 43, 52, 57, 62, 64, 67, 72], 6, 0.66, 0.07);
}

/** A walking line at 132 in F: soft for four bars, louder for four, skips and ghosts, a low ring at the end. */
export function demoUpright(lab: Lab): void {
  const b = makeUprightBass(lab.ctx, lab.strip('upright', { gain: 1, rev: 0.1 }), lab.r);
  const q = 60 / 132;
  const line = [41, 45, 48, 49, 50, 48, 45, 44, 43, 45, 46, 47, 48, 46, 43, 40, 41, 29, 36, 40, 45, 40, 38, 42, 43, 38, 36, 40, 41, 45, 48, 53];
  line.forEach((m, i) => {
    const loud = i >= 16;
    const v = (loud ? 0.82 : 0.5) * (i % 4 === 0 ? 1 : 0.9);
    b(lab.t0 + i * q, m, q * 0.92, v);
    // a ghosted triplet skip into some beats
    if (i % 4 === 3 && i < line.length - 1) b(lab.t0 + (i + 2 / 3) * q, line[i + 1], q * 0.2, 0.22);
  });
  const t = lab.t0 + line.length * q;
  b(t, 55, q * 0.9, 0.7);
  b(t + q, 52, q * 0.9, 0.65);
  b(t + 2 * q, 48, q * 1.8, 0.7);
  b(t + 4 * q, 29, 3.5, 0.85);
}

/** A funk line at 100 in D: octave pops, ghost notes, a fill, then louder; a long note at the end. */
export function demoElectricBass(lab: Lab): void {
  const b = makeElectricBass(lab.ctx, lab.strip('ebass', { gain: 1, rev: 0.04 }), lab.r);
  const s16 = 60 / 100 / 4, bar = s16 * 16;
  // [step, note, length in steps, velocity, ghost]
  const A: [number, number, number, number, boolean][] = [
    [0, 38, 2, 0.9, false], [2, 38, 1, 0.3, true], [3, 38, 1, 0.6, false], [5, 38, 1, 0.3, true], [6, 50, 1, 0.8, false],
    [7, 50, 1, 0.3, true], [8, 48, 2, 0.7, false], [10, 45, 1, 0.7, false], [11, 45, 1, 0.3, true], [12, 43, 2, 0.75, false],
    [14, 45, 1, 0.6, false], [15, 45, 1, 0.3, true],
  ];
  const B: [number, number, number, number, boolean][] = [
    [0, 31, 3, 0.9, false], [3, 31, 1, 0.3, true], [4, 43, 1, 0.75, false], [6, 31, 1, 0.6, false], [7, 31, 1, 0.3, true],
    [8, 38, 1, 0.7, false], [9, 40, 1, 0.65, false], [10, 42, 1, 0.7, false], [11, 45, 1, 0.7, false], [12, 47, 1, 0.75, false],
    [13, 50, 1, 0.8, false], [14, 52, 1, 0.8, false], [15, 54, 1, 0.85, false],
  ];
  for (let k = 0; k < 6; k++) {
    const t = lab.t0 + k * bar, pat = k % 3 === 2 ? B : A, loud = k >= 3 ? 1.12 : 0.85;
    for (const [i, m, len, v, ghost] of pat) b(t + i * s16, m, s16 * len * 0.85, Math.min(1, v * loud), ghost);
  }
  const t = lab.t0 + 6 * bar;
  b(t, 38, 0.4, 0.95);
  b(t + 3 * s16, 33, 0.3, 0.7);
  b(t + 6 * s16, 28, 3, 0.85);
}

/**
 * The level calibration: single notes and chords of every instrument at vel 0.8 (and a soft one, a ghost, a chick, a
 * glissando), 2.5 s apart on dry strips of gain 1. Each window's peak should sit near −12 dBFS (render 53 s).
 */
export function demoPluckedLevels(lab: Lab): void {
  const ny = makeNylon(lab.ctx, lab.strip('a', { gain: 1 }), lab.r);
  const fk = makeFunkGuitar(lab.ctx, lab.strip('b', { gain: 1 }), lab.r);
  const hp = makeHarp(lab.ctx, lab.strip('c', { gain: 1 }), lab.r);
  const up = makeUprightBass(lab.ctx, lab.strip('d', { gain: 1 }), lab.r);
  const eb = makeElectricBass(lab.ctx, lab.strip('e', { gain: 1 }), lab.r);
  const at = (k: number) => 0.1 + k * 2.5;
  ny.note(at(0), 64, 2, 0.8);
  ny.strum(at(1), [57, 60, 64, 67], 2, 0.8, 'down', 0.006);
  fk.note(at(2), 64, 1.5, 0.8);
  fk.strum(at(3), [55, 59, 64, 67], 1.5, 0.8, 'down', 0.008);
  hp.note(at(4), 67, 2.4, 0.8);
  hp.chord(at(5), [55, 60, 64, 67], 2.4, 0.8);
  up(at(6), 40, 1.5, 0.8);
  up(at(7), 52, 1.5, 0.8);
  eb(at(8), 40, 1.5, 0.8);
  eb(at(9), 52, 1.5, 0.8);
  ny.note(at(10), 45, 2, 0.8);
  ny.note(at(11), 76, 2, 0.8);
  fk.note(at(12), 45, 1.5, 0.8);
  hp.note(at(13), 48, 2.4, 0.8);
  hp.note(at(14), 84, 2.4, 0.8);
  fk.chick(at(15), [55, 59, 64, 67], 0.8);
  eb(at(16), 40, 0.3, 0.8, true);
  up(at(17), 31, 1.5, 0.8);
  eb(at(18), 31, 1.5, 0.8);
  ny.note(at(19), 64, 2, 0.4);
  hp.gliss(at(20), [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79], 0.05, 0.8);
}
