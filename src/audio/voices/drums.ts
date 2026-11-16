/**
 * Drums and percussion for the score (v3): four kits and a table of hand percussion. Every hit is modelled in
 * JavaScript and kept as short buffers (voices/buffers.ts), three takes of each, played round-robin.
 *
 * The models:
 * - a membrane is the circular membrane's modes (120 Bessel-zero ratios), each as loud as the mode moves where the
 *   stick or the hand lands (J_m at the strike radius) and as the contact time lets through, each dying at its own rate,
 *   all bent down together from a higher pitch at the strike (the head stretches, then relaxes); a tubed shell's air
 *   pulls its two lowest modes down a little (the congas, the djembe);
 * - a snare's wires are noise gated by the bottom head's motion: they buzz once a cycle and die with it;
 * - a cymbal is a strike and a ring. The strike (a buffer a take) is the stick, sine partials for the low, tonal modes
 *   (in split pairs that beat) and bands of noise for the dense upper ones, which bloom late and die first. The ring
 *   (one two-channel loop per cymbal, made by an inverse FFT, so its end meets its start exactly) is narrow bands at
 *   those partials over a smooth wash: it blooms under the strike and dies with the cymbal's own time while a low-pass
 *   closes over it (the highs go first). A cymbal is one piece of metal: a new stroke takes its ring over instead of
 *   piling another on; a hand, or the hats closing, damps it;
 * - a bell or a bar is its own short list of modes; the long-ringing ones (the agogô, the triangle, the ride's bell)
 *   keep their low partials in a ring too, as pure tones;
 * - a shaker, a cabasa or a tambourine's jingles are a cloud of collisions (Cook's PhISEM);
 * - each buffer carries a little of its room (a small Freeverb-style network); the 80s machine's big gated room is a
 *   two-channel buffer of its own, played round the dry hit.
 * At playback velocity sets the level, a low-pass (soft strokes are darker), how much a cymbal washes against its ping,
 * and a harder layer only loud strokes bring in (a stick's crack, a beater's click, a hand's slap); loud strokes on a
 * drum also start a little sharp and settle. A hit costs two nodes, two more with its hard layer or its room, three
 * more with a ring; the panners and low-passes they feed are shared and kept with the strip (see `Bank`). A hand on a
 * drum damps what the head still rang with, as the 80s machine's voices cut themselves off.
 * Takes are built in the background between frames, at most ~10 ms at a time (take 0 of everything first, a hit's other
 * takes once it has played); a hit that plays before any take of it exists is built on the spot. An
 * OfflineAudioContext builds them when first asked for. `kit.warm()` builds them all (a promise).
 *
 *   makeFunkKit      a tight, dry, warm 70s soul kit (ghost notes, rim shots, cross-stick, choked hats)
 *   makeBrushKit     jazz / bossa brushes: taps, sweeps, a brushed snare, a feathered kick, a dark ride
 *   makeEightiesKit  a LinnDrum-era city-pop kit: punchy kick, gated snare and toms, claps, cowbell, rim
 *   makePercussion   congas, bongos, timbales, bells, claves, shaker, cabasa, tambourine, triangle, surdos, djembe,
 *                    woodblocks, tamborim
 */
import { freeWhenDone } from '../engine';
import { mtof, type Rnd, type Strip } from '../synth';
import { cachedBuffer, noiseGen } from './buffers';
import { askWorker, workerDone, workerMade } from './offthread';
import type { Lab } from './lab';

const TAU = Math.PI * 2;
/** Takes of every hit (round-robin: never the same one twice running). */
const TAKES = 3;
/** A take's first 60 ms are levelled to this RMS (its peak at most 0.95): the takes of a hit sound as loud. */
const REF = 0.12;
const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

// ── buffer DSP ──────────────────────────────────────────────────────────────────────────────
type Filter = 'lp' | 'hp' | 'bp' | 'peak';

/** An RBJ biquad over `d` in place (transposed direct form II). `bp` peaks at 0 dB; `db` is for `peak`. */
function bq(d: Float32Array, sr: number, type: Filter, f: number, q = 0.707, db = 0): void {
  const w = (TAU * Math.min(f, sr * 0.45)) / sr;
  const cw = Math.cos(w), al = Math.sin(w) / (2 * q), A = Math.pow(10, db / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'lp') [b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'hp') [b0, b1, b2, a0, a1, a2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'bp') [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * cw, 1 - al];
  else [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A];
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  let z1 = 0, z2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i], y = B0 * x + z1;
    z1 = B1 * x - A1 * y + z2;
    z2 = B2 * x - A2 * y;
    d[i] = y;
  }
}

type Chain = [Filter, number, number?, number?][];
/** A chain moved by `x` (a take's attack noise, centred a little differently). */
const shift = (c: Chain, x: number): Chain => c.map(([t, f, q, db]): Chain[number] => [t, f * x, q, db]);

function unitRms(x: Float32Array): void {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  const k = 1 / Math.sqrt(e / x.length + 1e-20);
  for (let i = 0; i < x.length; i++) x[i] *= k;
}

/** White noise through `chain`, at unit RMS. */
function noise(n: number, sr: number, seed: number, chain: Chain = []): Float32Array {
  const x = new Float32Array(Math.max(1, n));
  const g = noiseGen(seed);
  for (let i = 0; i < x.length; i++) x[i] = g();
  for (const [type, f, q, db] of chain) bq(x, sr, type, f, q ?? 0.707, db ?? 0);
  unitRms(x);
  return x;
}

interface Hiss {
  /** RMS at the top of the envelope. */
  a: number;
  /** The exponential fall (s), after the rise and the hold. */
  tau: number;
  rise?: number;
  hold?: number;
  /** Start (s). */
  at?: number;
  f?: Chain;
}

/** Filtered noise with a half-cosine rise, a hold and an exponential fall, added into `d`. */
function hiss(d: Float32Array, sr: number, seed: number, h: Hiss): void {
  const at = Math.round((h.at ?? 0) * sr);
  const rise = Math.max(1, Math.round((h.rise ?? 0.0002) * sr));
  const hold = Math.round((h.hold ?? 0) * sr);
  const n = Math.min(d.length - at, rise + hold + Math.ceil(h.tau * sr * 7));
  if (n <= 0) return;
  const x = noise(n, sr, seed, h.f);
  const dec = Math.exp(-1 / (h.tau * sr));
  let env = h.a;
  for (let i = 0; i < n; i++) {
    let w: number;
    if (i < rise) w = h.a * (0.5 - 0.5 * Math.cos((Math.PI * i) / rise));
    else if (i < rise + hold) w = h.a;
    else {
      w = env;
      env *= dec;
    }
    d[at + i] += x[i] * w;
  }
}

interface Mode {
  f: number;
  /** Peak amplitude. */
  a: number;
  /** Decay time constant (s). */
  tau: number;
  /** A late onset (s): the mode grows as (1 − e^(−t/rise)) — a cymbal's high partials blooming. */
  rise?: number;
}

/**
 * Damped sinusoids into `d` from sample `at`, each a decaying rotation (four multiplies a sample) starting in sine
 * phase, as an impulse leaves every mode: the strike is sharp but never a step. `bend` is a pitch envelope all the
 * modes share (bend[i] = ratio − 1 at sample i), followed in steps of 32 samples.
 */
function ring(d: Float32Array, sr: number, ms: Mode[], bend: Float32Array | null = null, at = 0): void {
  const ok = (m: Mode) => m.a !== 0 && m.f > 0 && m.f < sr * 0.45;
  for (let k = 0; k < ms.length; k++) {
    const m = ms[k];
    if (!ok(m)) continue;
    // a cymbal's split pairs share their bloom: one pass for both (half the trips through the buffer)
    const two = ms[k + 1];
    if (!bend && two && ok(two) && (two.rise ?? 0) === (m.rise ?? 0)) {
      ringTwo(d, sr, m, two, at);
      k++;
      continue;
    }
    const total = Math.min(d.length - at, Math.ceil(m.tau * sr * 7.5));
    if (total <= 0) continue;
    const dec = Math.exp(-1 / (m.tau * sr));
    const rk = m.rise ? Math.exp(-1 / (m.rise * sr)) : 0;
    let c = m.a, s = 0, q = 1, i = 0;
    if (bend) {
      // the bent start: the rotation's frequency renewed every 32 samples (the bend is smooth: no sine a sample)
      const nb = Math.min(total, bend.length);
      while (i < nb) {
        const stop = Math.min(nb, i + 32);
        const wb = (TAU * m.f * (1 + bend[(i + stop) >> 1])) / sr;
        if (wb >= Math.PI) break;
        const cb = dec * Math.cos(wb), sb = dec * Math.sin(wb);
        for (; i < stop; i++) {
          d[at + i] += rk ? s * (1 - q) : s;
          q *= rk;
          const nc = c * cb - s * sb;
          s = s * cb + c * sb;
          c = nc;
        }
      }
    }
    const w = (TAU * m.f) / sr, cw = dec * Math.cos(w), sw = dec * Math.sin(w);
    if (rk)
      for (; i < total && q > 1e-4; i++) {
        d[at + i] += s * (1 - q);
        q *= rk;
        const nc = c * cw - s * sw;
        s = s * cw + c * sw;
        c = nc;
      }
    for (; i < total; i++) {
      d[at + i] += s;
      const nc = c * cw - s * sw;
      s = s * cw + c * sw;
      c = nc;
    }
  }
}

/** Two unbent modes with the same bloom in one pass (see `ring`). */
function ringTwo(d: Float32Array, sr: number, a: Mode, b: Mode, at: number): void {
  const room = d.length - at;
  const na = Math.min(room, Math.ceil(a.tau * sr * 7.5)), nb = Math.min(room, Math.ceil(b.tau * sr * 7.5));
  const da = Math.exp(-1 / (a.tau * sr)), db = Math.exp(-1 / (b.tau * sr));
  const wa = (TAU * a.f) / sr, wb = (TAU * b.f) / sr;
  const ca = da * Math.cos(wa), sa = da * Math.sin(wa), cb = db * Math.cos(wb), sb = db * Math.sin(wb);
  let xa = a.a, ya = 0, xb = b.a, yb = 0;
  const rk = a.rise ? Math.exp(-1 / (a.rise * sr)) : 0;
  const both = Math.min(na, nb), all = Math.max(na, nb);
  let q = rk ? 1 : 0, i = 0;
  for (; i < both && q > 1e-4; i++) {
    d[at + i] += (ya + yb) * (1 - q);
    q *= rk;
    const ta = xa * ca - ya * sa;
    ya = ya * ca + xa * sa;
    xa = ta;
    const tb = xb * cb - yb * sb;
    yb = yb * cb + xb * sb;
    xb = tb;
  }
  for (; i < both; i++) {
    d[at + i] += ya + yb;
    const ta = xa * ca - ya * sa;
    ya = ya * ca + xa * sa;
    xa = ta;
    const tb = xb * cb - yb * sb;
    yb = yb * cb + xb * sb;
    xb = tb;
  }
  // the longer-lived of the two runs on alone
  const [x0, y0, c0, s0] = na > nb ? [xa, ya, ca, sa] : [xb, yb, cb, sb];
  let x = x0, y = y0;
  for (; i < all; i++) {
    d[at + i] += q > 1e-4 ? y * (1 - q) : y;
    q *= rk;
    const t = x * c0 - y * s0;
    y = y * c0 + x * s0;
    x = t;
  }
}

/** The pitch envelope of a struck head: `amt` above, falling with `tau` (the stretch relaxes as the head settles). */
function bendCurve(sr: number, amt: number, tau: number): Float32Array | null {
  if (amt <= 0) return null;
  const n = Math.max(1, Math.ceil(tau * sr * Math.log(amt / 2e-5)));
  const b = new Float32Array(n);
  const k = Math.exp(-1 / (tau * sr));
  let v = amt;
  for (let i = 0; i < n; i++, v *= k) b[i] = v;
  return b;
}

/** The first `sec` seconds rise on a half cosine (a stick's contact, a hand's): nothing starts off zero. */
function onset(d: Float32Array, sr: number, sec: number): void {
  const n = Math.max(2, Math.round(sec * sr));
  for (let i = 0; i < n && i < d.length; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
}

/** Tape and console warmth: a soft clip that rounds the peaks (the peak lands at 1). Returns small signals' gain. */
function saturate(d: Float32Array, drive: number): number {
  let peak = 1e-12;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = drive / peak, norm = 1 / Math.tanh(drive);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * k) * norm;
  return k * norm;
}

/** The gain `finish` levels a take by: its first 60 ms at `ref` RMS, its peak at most 0.95. */
function levelOf(d: Float32Array, sr: number, ref = REF): number {
  const n = Math.min(d.length, Math.round(0.06 * sr));
  let e = 0, peak = 0;
  for (let i = 0; i < n; i++) e += d[i] * d[i];
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const rms = Math.sqrt(e / Math.max(1, n));
  return rms > 0 && peak > 0 ? Math.min(ref / rms, 0.95 / peak) : 0;
}

/** The last `share` of a buffer damped (×e^(−6.9x²): −60 dB at the end), its last 2 ms down to exactly zero. */
function damp(d: Float32Array, sr: number, share = 0.35): void {
  const n = Math.max(16, Math.round(d.length * share));
  for (let i = 0; i < n; i++) {
    const x = (i + 1) / n;
    d[d.length - n + i] *= Math.exp(-6.9 * x * x);
  }
  const z = Math.min(d.length, Math.max(2, Math.round(sr * 0.002)));
  for (let i = 0; i < z; i++) d[d.length - 1 - i] *= i / z;
}

/**
 * Level a take (`levelOf`) and end it: cut a few ms after the tail falls under `floor` dB (re its peak), the last
 * `fade` seconds faded; a tail that never gets down there is damped across the buffer's last 35% instead, never cut
 * while it rings. Returns the length.
 */
function finish(d: Float32Array, sr: number, floor = -60, fade = 0.01, ref = REF): number {
  const k = levelOf(d, sr, ref);
  if (!(k > 0)) return d.length;
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs((d[i] *= k)));
  const th = peak * Math.pow(10, floor / 20);
  let end = d.length;
  while (end > 1 && Math.abs(d[end - 1]) < th) end--;
  if (end > d.length - Math.round(sr * 0.012)) {
    damp(d, sr);
    return d.length;
  }
  end = Math.min(d.length, end + Math.round(sr * 0.004));
  const nf = Math.min(end - 1, Math.max(8, Math.round(sr * fade)));
  for (let i = 0; i < nf; i++) d[end - 1 - i] *= (i / nf) * (i / nf);
  return end;
}

/** A take's own tuning: the three takes ten cents apart, give or take three (no hand lands twice the same). */
const det = (k: number, take: () => number, cents = 10) => Math.pow(2, ((k - 1) * cents + 3 * take()) / 1200);
/** A take's attack noise: its level ±3 dB, its centre ±15%. */
const vary = (take: () => number): [number, number] => [Math.pow(10, (3 * take()) / 20), 1 + 0.15 * take()];

// ── rings: loops without a seam, from an inverse FFT ────────────────────────────────────────
const twiddles = new Map<number, [Float64Array, Float64Array]>();

/** An in-place radix-2 FFT of `re` + i·`im` (a power of two long); `inverse` leaves out the 1/n. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let x = re[i];
      re[i] = re[j];
      re[j] = x;
      x = im[i];
      im[i] = im[j];
      im[j] = x;
    }
  }
  let tw = twiddles.get(n);
  if (!tw) {
    const c = new Float64Array(n >> 1), s = new Float64Array(n >> 1);
    for (let k = 0; k < n >> 1; k++) {
      c[k] = Math.cos((TAU * k) / n);
      s[k] = Math.sin((TAU * k) / n);
    }
    twiddles.set(n, (tw = [c, s]));
  }
  const [C, S] = tw, sg = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len)
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half, wr = C[k], wi = sg * S[k];
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
  }
}

/** What a struck cymbal or bell settles into, as a loop. */
interface LoopO {
  key: string;
  /** 2^bits samples long (15: 0.68 s, 16: 1.37 s at 48 kHz). */
  bits: number;
  seed: number;
  /** [Hz, amplitude, Q]: a band of noise Q wide (a cluster of modes) or, with Q 0, a pure tone. */
  parts: [number, number, number][];
  /** A smooth wash under the parts: its amplitude density at f (Hz), and its share of the power. */
  floor?: (f: number) => number;
  share?: number;
  /** 0: the same in both ears … 1: each ear its own. */
  width: number;
}

/** A ring's two channels (at REF RMS): every component on the FFT's bins, so the loop's end meets its start. */
function makeLoop(sr: number, o: LoopO): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const n = 1 << o.bits, half = n >> 1, df = sr / n;
  const g = noiseGen(o.seed);
  const aL = new Float64Array(half), bL = new Float64Array(half), aR = new Float64Array(half), bR = new Float64Array(half);
  const put = (b: number, m: number) => {
    if (b < 1 || b >= half || !(m > 0)) return;
    const p = Math.PI * g(), q = p + o.width * Math.PI * g();
    aL[b] += m * Math.cos(p);
    bL[b] += m * Math.sin(p);
    aR[b] += m * Math.cos(q);
    bR[b] += m * Math.sin(q);
  };
  let ep = 0;
  for (const [f, a, q] of o.parts) {
    if (!(f > 0) || f >= sr * 0.45 || !(a > 0)) continue;
    ep += a * a;
    if (!q) {
      put(Math.round(f / df), a);
      continue;
    }
    // a Lorentzian band: half its power within ±f/2Q
    const bw = f / q, lo = Math.max(1, Math.floor((f - 4 * bw) / df)), hi = Math.min(half - 1, Math.ceil((f + 4 * bw) / df));
    const w = (b: number) => {
      const x = (2 * (b * df - f)) / bw;
      return 1 / (1 + x * x);
    };
    let sum = 0;
    for (let b = lo; b <= hi; b++) sum += w(b);
    for (let b = lo; b <= hi; b++) put(b, a * Math.sqrt(w(b) / sum));
  }
  if (o.floor && o.share) {
    const dens = new Float64Array(half);
    let ef = 0;
    for (let b = 1; b < half; b++) {
      dens[b] = Math.max(0, o.floor(b * df));
      ef += dens[b] * dens[b];
    }
    const share = Math.min(0.95, o.share);
    const k = Math.sqrt(((ep || 1) * share) / (1 - share) / (ef + 1e-30));
    for (let b = 1; b < half; b++) put(b, dens[b] * k);
  }
  // the two real channels as one complex signal: Z = L + iR
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let b = 1; b < half; b++) {
    re[b] = aL[b] - bR[b];
    im[b] = bL[b] + aR[b];
    re[n - b] = aL[b] + bR[b];
    im[n - b] = aR[b] - bL[b];
  }
  fft(re, im, true);
  let e = 0;
  for (let i = 0; i < n; i++) e += re[i] * re[i] + im[i] * im[i];
  const k = REF / Math.sqrt(e / (2 * n) + 1e-30);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = re[i] * k;
    R[i] = im[i] * k;
  }
  return [L, R];
}

/** A smooth spectrum for a ring's wash: ∝ (f / 1 kHz)^tilt between `lo` and `hi`, rolling off outside them. */
const shape = (lo: number, hi: number, tilt: number) => (f: number) => {
  const a = lo / f, b = f / hi;
  return Math.pow(f / 1000, tilt) / Math.sqrt((1 + a * a * a * a) * (1 + b * b * b * b));
};

// ── the circular membrane ───────────────────────────────────────────────────────────────────
/** Modes (m, j_mn) lowest first, every one below j = 31.5: (0,1) (1,1) (2,1) (0,2) (3,1) (1,2) … */
const MEM: [number, number][] = [
  [0, 2.4048], [1, 3.8317], [2, 5.1356], [0, 5.5201], [3, 6.3802], [1, 7.0156], [4, 7.5883], [2, 8.4172], [0, 8.6537],
  [5, 8.7715], [3, 9.761], [6, 9.9361], [1, 10.1735], [4, 11.0647], [7, 11.0864], [2, 11.6198], [0, 11.7915], [8, 12.2251],
  [5, 12.3386], [3, 13.0152], [1, 13.3237], [9, 13.3543], [6, 13.5893], [4, 14.3725], [10, 14.4755], [2, 14.796], [7, 14.8213],
  [0, 14.9309], [11, 15.5898], [5, 15.7002], [8, 16.0378], [3, 16.2235], [1, 16.4706], [12, 16.6982], [6, 17.0038], [9, 17.2412],
  [4, 17.616], [13, 17.8014], [2, 17.9598], [0, 18.0711], [7, 18.2876], [10, 18.4335], [14, 18.9], [5, 18.9801], [3, 19.4094],
  [8, 19.5545], [1, 19.6159], [11, 19.616], [15, 19.9944], [6, 20.3208], [12, 20.7899], [9, 20.807], [4, 20.8269], [16, 21.0851],
  [2, 21.117], [0, 21.2116], [7, 21.6415], [13, 21.9562], [10, 22.047], [17, 22.1725], [5, 22.2178], [3, 22.5827], [1, 22.7601],
  [8, 22.9452], [14, 23.1158], [18, 23.2568], [11, 23.2759], [6, 23.5861], [4, 24.019], [9, 24.2339], [15, 24.2692], [2, 24.2701],
  [19, 24.3382], [0, 24.3525], [12, 24.4949], [7, 24.9349], [16, 25.417], [20, 25.4171], [5, 25.4303], [10, 25.5095], [13, 25.7051],
  [3, 25.7482], [1, 25.9037], [8, 26.2668], [21, 26.4936], [17, 26.5598], [11, 26.7733], [6, 26.8202], [14, 26.9074], [4, 27.1991],
  [2, 27.4206], [0, 27.4935], [22, 27.5679], [9, 27.5837], [18, 27.6979], [12, 28.0267], [15, 28.1024], [7, 28.1912], [5, 28.6266],
  [23, 28.6402], [19, 28.8317], [10, 28.8874], [3, 28.9084], [1, 29.0468], [13, 29.2706], [16, 29.2909], [8, 29.5457], [24, 29.7105],
  [20, 29.9616], [6, 30.0337], [11, 30.1791], [4, 30.371], [17, 30.4733], [14, 30.506], [2, 30.5692], [0, 30.6346], [9, 30.8854],
  [21, 31.0878], [7, 31.4228], [12, 31.46],
];
/** How well a mode with m nodal diameters radiates (the (0,n) modes push air; the others mostly slosh it). */
const RAD = [1, 0.78, 0.62, 0.52, 0.46, 0.42, 0.4, 0.38, 0.36, 0.35];

function besselJ(m: number, x: number): number {
  let term = 1;
  for (let i = 1; i <= m; i++) term *= x / 2 / i;
  const q = -(x * x) / 4;
  let sum = 0;
  for (let k = 0; k < 80; k++) {
    sum += term;
    term *= q / ((k + 1) * (k + 1 + m));
    if (k > x && Math.abs(term) < 1e-11) break;
  }
  return sum;
}

/** The spectrum of a contact `tc` seconds long: flat below 1/(2·tc), then falling 12 dB an octave. */
const contact = (f: number, tc: number) => {
  const x = 2 * f * tc;
  return tc > 0 ? 1 / Math.sqrt(1 + x * x * x * x) : 1;
};

interface SkinO {
  /** The (0,1) mode (Hz). */
  f0: number;
  /** Where it is struck: 0 the centre … 1 the edge. */
  at: number;
  /** The fundamental's decay (s); higher modes die faster by `slope`. */
  tau: number;
  slope?: number;
  /** Scales the (0,1) mode's decay (a closed shell's air damps it; a resonant head feeds it). */
  t01?: number;
  /** How many modes. */
  n?: number;
  /** The stick's, beater's or hand's contact time (s). */
  contact?: number;
  /** Per-mode amplitude spread between takes (the fundamental's is 0.1). */
  spread?: number;
  /** Total RMS at the strike. */
  gain?: number;
  /** A tubed shell's air: the (0,1) and (1,1) modes' frequencies scaled (f0 stays the (0,1)'s). */
  air?: [number, number];
}

/** A struck membrane's modes. `take` varies the amplitudes (no stick or hand lands twice on one spot). */
function skin(o: SkinO, take: () => number): Mode[] {
  const out: Mode[] = [];
  const n = Math.min(o.n ?? 12, MEM.length);
  const [a0, a1] = o.air ?? [1, 1];
  let e = 0;
  for (let i = 0; i < n; i++) {
    const [m, j] = MEM[i];
    const ratio = ((j / MEM[0][1]) * (i === 0 ? a0 : i === 1 ? a1 : 1)) / a0;
    const f = o.f0 * ratio;
    const spread = i === 0 ? 0.1 : (o.spread ?? 0.35);
    const a = Math.abs(besselJ(m, j * clamp(o.at, 0, 0.98))) * RAD[Math.min(m, RAD.length - 1)] * contact(f, o.contact ?? 0) * Math.max(0.05, 1 + spread * take());
    let tau = o.tau * Math.pow(ratio, -(o.slope ?? 0.8));
    if (i === 0) tau *= o.t01 ?? 1;
    out.push({ f, a, tau });
    e += a * a;
  }
  const k = (o.gain ?? 1) / Math.sqrt(e / 2 + 1e-20);
  for (const md of out) md.a *= k;
  return out;
}

/** Hand-made mode lists: [ratio, amplitude, decay] × f0 (the first mode's amplitude varies 0.1 a take, the rest `spread`). */
function modesOf(f0: number, list: [number, number, number][], take: () => number, spread = 0.35, gain = 1): Mode[] {
  let e = 0;
  const out = list.map(([r, a, tau], i) => {
    const amp = a * Math.max(0.05, 1 + (i ? spread : 0.1) * take());
    e += amp * amp;
    return { f: f0 * r, a: amp, tau };
  });
  const k = gain / Math.sqrt(e / 2 + 1e-20);
  for (const m of out) m.a *= k;
  return out;
}

interface WireO {
  seed: number;
  /** The bottom (snare-side) head's fundamental (Hz): tuned above the top. */
  f0: number;
  tau: number;
  /** RMS at full buzz. */
  a: number;
  /** Delay after the strike (s): the air in the shell takes a moment to push the bottom head. */
  at?: number;
  /** Where the wires' hiss peaks (Hz). */
  tone?: number;
  /** The low rattle's share (the wires slapping, 500–1000 Hz). */
  low?: number;
  /** Below this share of its swing the bottom head can't lift the wires (soft strokes buzz less, and stop sooner). */
  th?: number;
}

/** Snare wires: noise that buzzes when the bottom head swings away from it and settles back, once a cycle. */
function wires(d: Float32Array, sr: number, o: WireO): void {
  const n = Math.min(d.length, Math.ceil(o.tau * sr * 7));
  const b = new Float32Array(n);
  ring(b, sr, [{ f: o.f0, a: 1, tau: o.tau }, { f: o.f0 * 1.594, a: 0.55, tau: o.tau * 0.75 }, { f: o.f0 * 2.136, a: 0.35, tau: o.tau * 0.6 }]);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(b[i]));
  const th = (o.th ?? 0.04) * peak;
  const tone = o.tone ?? 5000;
  const x = noise(n, sr, o.seed, [['hp', tone * 0.22, 0.6], ['peak', tone, 0.8, 5], ['lp', tone * 2.3, 0.6]]);
  const y = noise(n, sr, o.seed + 1, [['bp', 760, 0.8]]);
  const low = o.low ?? 0.3;
  const at = Math.round((o.at ?? 0.0005) * sr);
  const kf = 1 - Math.exp((-TAU * 1600) / sr), ks = 1 - Math.exp((-TAU * 45) / sr);
  let fast = 0, slow = 0;
  for (let i = 0; i < n && i + at < d.length; i++) {
    const v = b[i] > th ? (b[i] - th) / (peak - th) : 0;
    fast += kf * (v - fast);
    slow += ks * (Math.max(0, Math.abs(b[i]) - th) / peak - slow);
    d[i + at] += o.a * (0.7 * fast + 0.9 * slow) * (x[i] + low * y[i]);
  }
}

// ── cymbals, bells, bars ────────────────────────────────────────────────────────────────────
interface MetalO {
  /** The cymbal itself: the same seed is the same cymbal, whatever the take. */
  seed: number;
  /** Partial pairs. */
  n: number;
  lo: number;
  hi: number;
  /** Amplitude ∝ (f / 1 kHz)^tilt. */
  tilt?: number;
  /** A broad emphasis: [centre Hz, width in octaves, gain ×]. */
  peak?: [number, number, number];
  /** Decay at `lo` (s); higher partials faster: tau ∝ (f / lo)^−slope. */
  tau: number;
  slope?: number;
  /** The highest partial's late onset (s), less for the lower ones. */
  bloom?: number;
  /** The widest split within a pair (Hz at 1 kHz; grows with √f). */
  split?: number;
  /** Per-take amplitude spread (where the stick lands). */
  spread?: number;
  tauMul?: number;
  /** Total RMS at the strike. */
  gain?: number;
}

interface Overtone {
  f: number;
  a: number;
  tau: number;
  /** The twin's distance (Hz), its share of the amplitude and of the decay. */
  split: number;
  ta: number;
  tt: number;
}

/** A cymbal's partials, fixed by its seed: log-spread in [lo, hi], each with a twin a few Hz up (the beating). */
function partialsOf(o: MetalO): Overtone[] {
  const cym = noiseGen(o.seed);
  const out: Overtone[] = [];
  for (let k = 0; k < o.n; k++) {
    const u = (k + 0.5 + 0.4 * cym()) / o.n;
    const f = o.lo * Math.pow(o.hi / o.lo, u);
    let a = Math.pow(f / 1000, o.tilt ?? 0) * (0.55 + 0.45 * Math.abs(cym()));
    if (o.peak) {
      const [pc, w, pg] = o.peak, oct = Math.log2(f / pc) / w;
      a *= 1 + (pg - 1) * Math.exp(-oct * oct);
    }
    const tau = o.tau * Math.pow(f / o.lo, -(o.slope ?? 0.5)) * (0.85 + 0.3 * Math.abs(cym()));
    const split = (o.split ?? 2) * (0.25 + 0.75 * Math.abs(cym())) * Math.sqrt(f / 1000);
    out.push({ f, a, tau, split, ta: 0.35 + 0.5 * Math.abs(cym()), tt: 0.75 + 0.45 * Math.abs(cym()) });
  }
  return out;
}

/** A cymbal's strike: its partials in pairs, the high ones late and short; `take` moves where the stick lands. */
function metal(o: MetalO, take: () => number): Mode[] {
  const out: Mode[] = [];
  let e = 0;
  for (const p of partialsOf(o)) {
    const a = p.a * Math.max(0.1, 1 + (o.spread ?? 0.3) * take());
    const tau = p.tau * (o.tauMul ?? 1);
    const rise = o.bloom ? o.bloom * Math.pow(p.f / o.hi, 1.3) : 0;
    const ta = a * p.ta;
    out.push({ f: p.f, a, tau, rise }, { f: p.f + p.split, a: ta, tau: tau * p.tt, rise });
    e += a * a + ta * ta;
  }
  const k = (o.gain ?? 1) / Math.sqrt(e / 2 + 1e-20);
  for (const m of out) m.a *= k;
  return out;
}

/** A cymbal's partials as a ring's bands (each pair inside one band, Q wide), leant by `tilt`. */
const bands = (o: MetalO, q: number, tilt = 0): [number, number, number][] =>
  partialsOf(o).map((p): [number, number, number] => [p.f, p.a * Math.sqrt(1 + p.ta * p.ta) * Math.pow(p.f / 1000, tilt), q]);

interface WashO {
  /** The cymbal: its band centres are fixed by the seed, whatever the take. */
  seed: number;
  /** Bands, log-spread in [lo, hi]. */
  n: number;
  lo: number;
  hi: number;
  /** Narrow enough to ring (a cluster of modes), wide enough to stay noise. */
  q: number;
  /** Decay at `lo` (s); higher bands faster: tau ∝ (f / lo)^−slope. */
  tau: number;
  slope: number;
  /** The highest band's late onset (s): energy climbing from the low modes into the high ones after the strike. */
  bloom?: number;
  /** Amplitude ∝ (f / 1 kHz)^tilt. */
  tilt?: number;
  /** Total RMS at the top. */
  gain: number;
}

/**
 * A cymbal's dense upper modes, which no handful of sines can stand in for: bands of noise at fixed, inharmonic
 * centres, each blooming and dying at its own rate — metallic (the bands ring) and dense (they're noise).
 */
function wash(d: Float32Array, sr: number, o: WashO, take: number): void {
  const cym = noiseGen(o.seed);
  const per = o.gain / Math.sqrt(o.n);
  for (let k = 0; k < o.n; k++) {
    const u = (k + 0.5 + 0.4 * cym()) / o.n;
    const f = o.lo * Math.pow(o.hi / o.lo, u);
    const tau = o.tau * Math.pow(f / o.lo, -o.slope) * (0.8 + 0.4 * Math.abs(cym()));
    const rise = (o.bloom ?? 0.002) * Math.pow(f / o.hi, 1.3) + 0.0004;
    const a = per * Math.pow(f / 1000, o.tilt ?? 0) * (0.6 + 0.4 * Math.abs(cym()));
    hiss(d, sr, o.seed * 131 + take * 7919 + k * 17, { a, tau, rise, f: [['bp', f, o.q]] });
  }
}

/** Split every mode of a bell or bar in two, `hz` apart (an imperfect casting: the slow warble of a real bell). */
function twins(ms: Mode[], hz: number, take: () => number, share = 0.5): Mode[] {
  const out: Mode[] = [];
  for (const m of ms) {
    const s = hz * (0.4 + 0.6 * Math.abs(take())) * Math.sqrt(m.f / 1000);
    out.push({ ...m, a: m.a * Math.sqrt(1 - share * share * 0.5) }, { ...m, f: m.f + s, a: m.a * share, tau: m.tau * (0.8 + 0.3 * Math.abs(take())) });
  }
  return out;
}

type ModeList = [number, number, number][];

/** A bell's long partials as a ring's pure tones, each with a twin `hz` (at 1 kHz) up: [ratio, amplitude] × f0. */
function bellTones(f0: number, list: [number, number][], hz: number, seed: number): [number, number, number][] {
  const g = noiseGen(seed);
  const out: [number, number, number][] = [];
  for (const [r, a] of list) {
    const f = f0 * r, s = hz * (0.5 + 0.5 * Math.abs(g())) * Math.sqrt(f / 1000);
    out.push([f, a * 0.94, 0], [f + s, a * 0.45, 0]);
  }
  return out;
}

// ── shakers, jingles ────────────────────────────────────────────────────────────────────────
interface BeadsO {
  seed: number;
  /** Collisions a second at full energy. */
  rate: number;
  /** The stroke (s): after hitting the wall the beads stream across for this long. */
  len: number;
  /** How hard they hit the wall at the stroke's start (the accent, on the beat); the streaming peaks at 0.3. */
  jolt: number;
  /** The jolt's energy falls with this (s). */
  settle: number;
  /** One collision's own decay (s). */
  grain: number;
  /** Resonances of the body the beads hit: [Hz, Q, gain]. */
  res: [number, number, number][];
  /** Jingles: [Hz, decay s, gain]; each collision rings about a third of them. */
  jingles?: [number, number, number][];
}

/** Cook's PhISEM: collisions at a rate and loudness that follow the shake's energy, each a grain of noise. */
function beads(d: Float32Array, sr: number, o: BeadsO): void {
  const g = noiseGen(o.seed);
  const n = d.length, lenN = Math.max(1, Math.round(o.len * sr));
  const exc = new Float32Array(n), imp = new Float32Array(n);
  const grain = Math.exp(-1 / (o.grain * sr)), settle = Math.exp(-1 / (o.settle * sr));
  let lvl = 0, jolt = o.jolt;
  for (let i = 0; i < n; i++) {
    let e = jolt;
    jolt *= settle;
    if (i < lenN) e += 0.3 * Math.sin((Math.PI * i) / lenN);
    if (e < 1e-5 && lvl < 1e-5) continue;
    if (g() * 0.5 + 0.5 < (o.rate * e) / sr) {
      const a = (0.35 + 0.65 * Math.abs(g())) * Math.sqrt(e);
      lvl += a;
      imp[i] += a * (g() > 0 ? 1 : -1);
    }
    exc[i] = lvl * g();
    lvl *= grain;
  }
  const mix = new Float32Array(n);
  for (const [f, q, gain] of o.res) {
    const x = exc.slice();
    bq(x, sr, 'bp', f, q);
    for (let i = 0; i < n; i++) mix[i] += x[i] * gain;
  }
  if (o.jingles) {
    // each collision sets a jingle ringing: a rotation per jingle, kicked by its share of the impulses
    o.jingles.forEach(([f, tau, gain], k) => {
      const dec = Math.exp(-1 / (tau * sr)), w = (TAU * f) / sr, cw = dec * Math.cos(w), sw = dec * Math.sin(w);
      const pick = noiseGen(o.seed * 31 + k);
      let c = 0, s = 0;
      for (let i = 0; i < n; i++) {
        if (imp[i] !== 0 && pick() > 0.3) c += imp[i] * (0.5 + 0.5 * Math.abs(pick()));
        mix[i] += s * gain;
        const nc = c * cw - s * sw;
        s = s * cw + c * sw;
        c = nc;
      }
    });
  }
  for (let i = 0; i < n; i++) d[i] += mix[i];
}

// ── the room ────────────────────────────────────────────────────────────────────────────────
interface RoomO {
  /** Scales the network's delays (1 = a big room). */
  size: number;
  t60: number;
  /** The wet energy as a share of the dry. */
  mix: number;
  /** High-frequency loss in the walls (0 bright … 0.8 dull). */
  damp?: number;
  /** A gate: the room is cut `gate` seconds after the strike, over `release` (the 80s); `all` gates the drum too. */
  gate?: number;
  release?: number;
  all?: boolean;
  pre?: number;
}

/**
 * A small Freeverb-style room (eight damped combs, four all-passes) mixed into `d`; with `out`, the room goes there
 * instead, in two channels (the right's network a little longer, as Freeverb spreads it), and `d` keeps the drum.
 */
function room(d: Float32Array, sr: number, o: RoomO, out?: [Float32Array, Float32Array]): void {
  const n = d.length;
  const dry = d.slice();
  const scale = (sr / 44100) * o.size, damp = o.damp ?? 0.35;
  const pre = Math.round((o.pre ?? 0.004) * sr);
  const wets = (out ? [0, 23] : [0]).map((spread) => {
    const wet = new Float32Array(n);
    for (const len of [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]) {
      const D = Math.max(16, Math.round((len + spread) * scale));
      const fb = Math.pow(10, (-3 * D) / (o.t60 * sr));
      const line = new Float32Array(D);
      let idx = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const y = line[idx];
        lp = y * (1 - damp) + lp * damp;
        line[idx] = (i >= pre ? dry[i - pre] : 0) + lp * fb;
        wet[i] += y;
        if (++idx >= D) idx = 0;
      }
    }
    for (const len of [556, 441, 341, 225]) {
      const D = Math.max(8, Math.round((len + spread) * (sr / 44100) * Math.max(0.5, o.size)));
      const line = new Float32Array(D);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const bo = line[idx], x = wet[i];
        line[idx] = x + bo * 0.5;
        wet[i] = bo - x;
        if (++idx >= D) idx = 0;
      }
    }
    return wet;
  });
  const g0 = o.gate !== undefined ? Math.round(o.gate * sr) : n, gr = Math.max(1, Math.round((o.release ?? 0.03) * sr));
  const gate = (i: number) => (i < g0 ? 1 : i < g0 + gr ? 0.5 + 0.5 * Math.cos((Math.PI * (i - g0)) / gr) : 0);
  let ed = 0, ew = 0;
  for (const wet of wets) for (let i = g0; i < n; i++) wet[i] *= gate(i);
  for (let i = 0; i < n; i++) ed += dry[i] * dry[i];
  for (const wet of wets) for (let i = 0; i < n; i++) ew += (wet[i] * wet[i]) / wets.length;
  const k = Math.sqrt((o.mix * ed) / (ew + 1e-20));
  for (let i = 0; i < n; i++) d[i] = o.all ? dry[i] * gate(i) : dry[i];
  if (out) wets.forEach((wet, c) => {
    for (let i = 0; i < n && i < out[c].length; i++) out[c][i] = wet[i] * k;
  });
  else for (let i = 0; i < n; i++) d[i] += wets[0][i] * k;
}

// ── playing a hit ───────────────────────────────────────────────────────────────────────────
interface Hit {
  /** Unique cache key. */
  key: string;
  /** Longest it may be (s); `fill` trims it. */
  secs: number;
  fill(d: Float32Array, sr: number, take: number): number | void;
  /** What it rings on with after the strike (a cymbal, a bell): one loop for the instrument. */
  ring?: Ring;
  /** Its room as a two-channel buffer of its own, a take for each of the hit's, played round the dry hit. */
  room?: RoomHit;
  /** Its own hard layer (a drum's upper modes, struck harder), in place of the feel's crack: same take, same bend. */
  edge?: Hit;
}

interface Ring {
  loop: LoopO;
  /** Its level at full velocity against the strike's (both are made at REF: 1 = the strike's first 60 ms). */
  level: number;
  /** Level ∝ velocity^curve (a hard stroke washes more than it pings). */
  curve: number;
  /** It fades in with this time constant (s) from the strike, holds `hold` (s), then dies with `tau` (s). */
  bloom: number;
  hold: number;
  tau: number;
  /** Its low-pass: [Hz at the hardest stroke, Hz at the softest, the Hz it closes towards, how fast (s)]. */
  lp: [number, number, number, number];
}

interface RoomHit {
  key: string;
  secs: number;
  /** Against the dry hit (1: as the model mixed it). */
  level: number;
  fill(L: Float32Array, R: Float32Array, sr: number, take: number): number;
}

/** How a hit answers velocity. */
interface Feel {
  /** Level at full velocity. */
  gain: number;
  /** Level ∝ velocity^curve. */
  curve?: number;
  /** The low-pass at the softest stroke (Hz), opening to `open` at the hardest; none if omitted. */
  dark?: number;
  open?: number;
  /** Extra pitch at the strike at full velocity (a share), settling with `bendTau`. */
  bend?: number;
  bendTau?: number;
  /** The hard layer (the stick's crack, a beater's click, a hand's slap), ∝ velocity^2.6. */
  crack?: Hit;
  crackGain?: number;
  pan?: number;
  /** Each stroke tuned a little differently, ±detune/2 (a drum's tension is never quite the same twice). */
  detune?: number;
}

interface Part {
  src: AudioBufferSourceNode;
  g: GainNode;
  t: number;
  end: number;
  /** Its gain (a strike's holds). */
  peak: number;
}

interface RingPart extends Part {
  bloom: number;
  hold: number;
  tau: number;
  f0: number;
  shut: number;
  ftau: number;
  /** Once let go: [from when, its level then, the fall's time constant]. */
  gone?: [number, number, number];
}

interface Voice {
  t: number;
  end: number;
  parts: Part[];
  ring?: RingPart;
  /** A stroke that damps what rings (the hats closing, a hand gripping the triangle). */
  shuts?: boolean;
}

interface PlayO {
  rate?: number;
  pan?: number;
  gain?: number;
  /** A ring taken over: its level and its low-pass now. */
  inherit?: number;
  inheritLp?: number;
}

/** A ring's level at `t`: its bloom, its hold, its decay (or its fall, once let go). */
function ringLevel(p: RingPart, t: number): number {
  if (t <= p.t || t >= p.end) return 0;
  if (p.gone && t >= p.gone[0]) return p.gone[1] * Math.exp(-(t - p.gone[0]) / p.gone[2]);
  if (t < p.t + p.hold) return p.peak * (1 - Math.exp(-(t - p.t) / p.bloom));
  return p.peak * (1 - Math.exp(-p.hold / p.bloom)) * Math.exp(-(t - p.t - p.hold) / p.tau);
}

/** What a new stroke takes over from a voice still ringing at `t`. */
function heir(v: Voice | undefined, t: number): PlayO {
  const p = v?.ring;
  if (!p) return {};
  return { inherit: ringLevel(p, t), inheritLp: p.shut + (p.f0 - p.shut) * Math.exp(-Math.max(0, t - p.t) / p.ftau) };
}

// the builder: takes made between frames, a few at a time
const jobs: (() => void)[] = [];
let booked = false;

/** Run the queued builds when the page is idle, about 10 ms at a time (at least one a turn). */
function buildSoon(): void {
  if (booked || !jobs.length) return;
  booked = true;
  const run = (dl?: IdleDeadline) => {
    booked = false;
    const until = performance.now() + (dl ? clamp(dl.timeRemaining(), 4, 12) : 8);
    do {
      try {
        jobs.shift()!();
      } catch {
        // a broken model must not stop the others
      }
    } while (jobs.length && performance.now() < until);
    buildSoon();
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 250 });
  else setTimeout(run, 0);
}

// the builder in a worker (v0.15.4): live, every take is made off the main thread (offthread.ts: a take is 5–40 ms of
// arithmetic, a kit 100–450 ms; built between frames they were a stutter a stroke), starting while the game loads
// (`prewarmDrums`). Without a worker (tests, offline renders) the idle builder above does it as before.
const drumKey = (id: string, take: number) => `drum|${id}|${take}`;
const ask = (sr: number, id: string, take: number, soon = false) => askWorker(sr, drumKey(id, take), soon);

/** Every buffer a hit is made of: [id as the bank names it, takes]. */
function partsOf(h: Hit, out: [string, number, unknown][] = []): [string, number, unknown][] {
  out.push([h.key, TAKES, h]);
  if (h.edge) partsOf(h.edge, out);
  if (h.ring) out.push([`ring:${h.ring.loop.key}`, 1, h.ring]);
  if (h.room) out.push([`room:${h.room.key}`, TAKES, h.room]);
  return out;
}

let registry: Map<string, unknown> | null = null;
/** Every hit, ring and room of every kit, by the id the bank gives it. */
function drumRegistry(): Map<string, unknown> {
  if (!registry) {
    registry = new Map();
    for (const h of [...FUNK_ALL, ...PERC_ALL, ...LINN_ALL, ...BRUSH_ALL, STICK, TIP, BEATER, HAND, TICK])
      for (const [id, , x] of partsOf(h)) if (!registry.has(id)) registry.set(id, x);
  }
  return registry;
}

/** The samples of take `take` of `id` at `sr` (one channel for a hit, two for a ring or a room): the worker's job. */
export function drumSamples(id: string, take: number, sr: number): Float32Array[] | null {
  const x = drumRegistry().get(id);
  if (!x) return null;
  if (id.startsWith('ring:')) return makeLoop(sr, (x as Ring).loop);
  if (id.startsWith('room:')) {
    const rm = x as RoomHit;
    const n = Math.max(1, Math.ceil(rm.secs * sr));
    const L = new Float32Array(n), R = new Float32Array(n);
    const len = clamp(Math.round(rm.fill(L, R, sr, take)) || n, 1, n);
    return len === n ? [L, R] : [L.slice(0, len), R.slice(0, len)];
  }
  const h = x as Hit;
  const n = Math.max(1, Math.ceil(h.secs * sr));
  const d = new Float32Array(n);
  const used = h.fill(d, sr, take);
  const len = typeof used === 'number' && used > 0 && used < n ? used : n;
  return [len === n ? d : d.slice(0, len)];
}

/**
 * Start making the kits' takes in the worker now, at `sr` (the rate the game's audio last ran at), take 0 of each
 * hit before the others: `title` = the title screen's kits (funk and the hand percussion), `rest` = the others.
 * Nothing happens without a worker: the kits then build their own as before.
 */
export function prewarmDrums(sr: number, which: 'title' | 'rest'): void {
  const order: [string, number][] = [];
  for (const list of which === 'title' ? [FUNK_ALL, PERC_ALL] : [LINN_ALL, BRUSH_ALL]) {
    const parts = list.flatMap((h) => partsOf(h));
    for (const [id] of parts) order.push([id, 0]);
    for (const [id, takes] of parts) for (let k = 1; k < takes; k++) order.push([id, k]);
  }
  for (const [id, k] of order) if (!ask(sr, id, k)) return;
}

const stereo = new Map<string, AudioBuffer>();
/** A two-channel buffer, kept here (buffers.ts keeps mono ones): the rings and the rooms, a few hundred kB each. */
function stereoBuffer(ctx: BaseAudioContext, key: string, make: (sr: number) => [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>]): AudioBuffer {
  const k = `${ctx.sampleRate}|${key}`;
  let b = stereo.get(k);
  if (!b) {
    const [L, R] = make(ctx.sampleRate);
    b = ctx.createBuffer(2, Math.max(1, L.length), ctx.sampleRate);
    b.copyToChannel(L, 0);
    b.copyToChannel(R, 1);
    stereo.set(k, b);
  }
  return b;
}

const isOffline = (ctx: BaseAudioContext) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

/**
 * A kit's player: picks takes round-robin, builds each hit's nodes, damps what rings. A hit is two nodes (source →
 * gain), two more for its hard layer and for its room, three more for its ring (source → gain → its closing low-pass).
 * What they feed is shared and made once, kept with the strip's nodes: a panner for each place on the stage, and in
 * front of it a low-pass for each brightness (third-octave steps), which is how velocity darkens soft strokes without a
 * filter per hit. The takes it has in hand are its own: live, a stroke whose take isn't built yet plays another of the
 * same hit and the missing one is queued for the background builder; offline, it is built on the spot.
 */
class Bank {
  private last = new Map<string, number>();
  private lanes = new Map<string, AudioNode>();
  private have = new Map<string, AudioBuffer>();
  private queued = new Set<string>();
  private offline: boolean;
  constructor(private ctx: BaseAudioContext, private s: Strip, private r: Rnd, private width: number) {
    this.offline = isOffline(ctx);
  }

  private keep<T extends AudioNode>(key: string, make: () => T): T {
    let n = this.lanes.get(key) as T | undefined;
    if (!n) {
      n = make();
      this.s.nodes.push(n);
      this.lanes.set(key, n);
    }
    return n;
  }

  /** The node a hit at `pan` feeds, through the shared low-pass nearest `cut` (0: none). */
  private lane(pan: number, cut: number): AudioNode {
    const p = typeof this.ctx.createStereoPanner === 'function' ? Math.round(clamp(pan * this.width) * 50) / 50 : 0;
    const place = p
      ? this.keep(`p${p}`, () => {
          const sp = this.ctx.createStereoPanner();
          sp.pan.value = p;
          sp.connect(this.s.in);
          return sp;
        })
      : this.s.in;
    if (!cut) return place;
    const step = Math.round(Math.log2(cut / 1000) * 3);
    return this.keep(`p${p}/${step}`, () => {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1000 * Math.pow(2, step / 3);
      lp.Q.value = 0.55;
      lp.connect(place);
      return lp;
    });
  }

  /** Take `k` of `id` if this bank has it, or the worker has made it (it is then this bank's too). */
  private held(id: string, k: number): AudioBuffer | undefined {
    const w = `${id}/${k}`;
    let b = this.have.get(w);
    if (!b && !this.offline && (b = workerMade(this.ctx.sampleRate, drumKey(id, k)))) this.have.set(w, b);
    return b;
  }

  /** Take `k` of `id`: in hand; or, live, another take in hand while this one is queued; or made now. */
  private get(id: string, k: number, takes: number, make: (k: number) => AudioBuffer): AudioBuffer {
    const mine = this.held(id, k);
    if (mine) return mine;
    if (!this.offline)
      for (let j = 0; j < takes; j++) {
        const other = this.held(id, j);
        if (other) {
          this.queue(id, takes, make, true);
          return other;
        }
      }
    const b = make(k);
    this.have.set(`${id}/${k}`, b);
    if (!this.offline) this.queue(id, takes, make, true);
    return b;
  }

  /** Queue the takes of `id` not in hand (`soon`: ahead of the background work; `only`: that take alone). */
  private queue(id: string, takes: number, make: (k: number) => AudioBuffer, soon: boolean, only?: number): void {
    for (let j = 0; j < takes; j++) {
      const w = `${id}/${j}`;
      if ((only !== undefined && j !== only) || this.held(id, j) || this.queued.has(w)) continue;
      // live, the worker makes it (off the main thread); without one, the idle builder below
      if (!this.offline && ask(this.ctx.sampleRate, id, j, soon)) continue;
      this.queued.add(w);
      const job = () => {
        this.queued.delete(w);
        if (!this.have.has(w)) this.have.set(w, make(j));
      };
      if (soon) jobs.unshift(job);
      else jobs.push(job);
    }
    buildSoon();
  }

  private hitMake = (h: Hit) => (k: number) => cachedBuffer(this.ctx, `drums/${h.key}/${k}`, h.secs, (d, sr) => h.fill(d, sr, k));
  private loopMake = (rg: Ring) => () => stereoBuffer(this.ctx, `drums/${rg.loop.key}`, (sr) => makeLoop(sr, rg.loop));
  private roomMake = (rm: RoomHit) => (k: number) =>
    stereoBuffer(this.ctx, `drums/${rm.key}/${k}`, (sr) => {
      const n = Math.max(1, Math.ceil(rm.secs * sr));
      const L = new Float32Array(n), R = new Float32Array(n);
      const len = clamp(Math.round(rm.fill(L, R, sr, k)) || n, 1, n);
      return [L.subarray(0, len), R.subarray(0, len)];
    });

  private hitBuf(h: Hit, k: number): AudioBuffer {
    return this.get(h.key, k, TAKES, this.hitMake(h));
  }

  /** Queue what these hits are made of in the background: take 0 of each (`all`: every take), rings and rooms too. */
  prepare(hits: Hit[], all = false): void {
    if (this.offline) return;
    const only = all ? undefined : 0;
    for (const h of hits) {
      this.queue(h.key, TAKES, this.hitMake(h), false, only);
      if (h.edge) this.queue(h.edge.key, TAKES, this.hitMake(h.edge), false, only);
      if (h.ring) this.queue(`ring:${h.ring.loop.key}`, 1, this.loopMake(h.ring), false);
      if (h.room) this.queue(`room:${h.room.key}`, TAKES, this.roomMake(h.room), false, only);
    }
  }

  /** Every take of these hits, built in the background (offline: now); the promise keeps its word when they're in hand. */
  warm(hits: Hit[]): Promise<void> {
    if (this.offline) {
      for (const h of hits)
        for (let k = 0; k < TAKES; k++) {
          this.hitBuf(h, k);
          if (h.edge) this.hitBuf(h.edge, k);
          if (h.ring) this.get(`ring:${h.ring.loop.key}`, 0, 1, this.loopMake(h.ring));
          if (h.room) this.get(`room:${h.room.key}`, k, TAKES, this.roomMake(h.room));
        }
      return Promise.resolve();
    }
    this.prepare(hits, true);
    return Promise.all([
      workerDone(this.ctx.sampleRate, 'drum|'),
      new Promise<void>((done) => {
        jobs.push(done);
        buildSoon();
      }),
    ]).then(() => undefined);
  }

  private take(key: string): number {
    const prev = this.last.get(key) ?? -1;
    let k = Math.floor(this.r() * TAKES) % TAKES;
    if (k === prev) k = (k + 1 + Math.floor(this.r() * (TAKES - 1))) % TAKES;
    this.last.set(key, k);
    return k;
  }

  /** The shared low-pass a stroke at `v` goes through (0: none, once it has opened past what the sound holds). */
  private cut(f: Feel, v: number): number {
    if (!f.dark) return 0;
    const open = f.open ?? 20000;
    const c = f.dark * Math.pow(open / f.dark, Math.pow(v, 0.85));
    return c < open * 0.8 && c < 18000 ? c : 0;
  }

  private source(buf: AudioBuffer, t: number, rate: number, peak: number, dest: AudioNode, bend = 0, bendTau = 0.03): Part {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (bend > 0.002) {
      src.playbackRate.setValueAtTime(rate * (1 + bend), t);
      src.playbackRate.setTargetAtTime(rate, t, bendTau);
    }
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(peak, t);
    src.connect(g);
    g.connect(dest);
    const end = t + buf.duration / rate + 0.02;
    src.start(t);
    src.stop(end);
    freeWhenDone(src, g);
    return { src, g, t, end, peak };
  }

  /** A ring under a strike: the instrument's loop, faded in, held, dying, under a low-pass that closes. */
  private ringOf(rg: Ring, t: number, v: number, rate: number, level: number, pan: number, o: PlayO): RingPart {
    const { ctx } = this;
    const buf = this.get(`ring:${rg.loop.key}`, 0, 1, this.loopMake(rg));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    const own = level * rg.level * Math.pow(v, rg.curve), inh = o.inherit ?? 0;
    const peak = Math.sqrt(own * own + inh * inh);
    const hold = Math.max(rg.hold, rg.bloom * 5);
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(peak, t, rg.bloom);
    g.gain.setTargetAtTime(0, t + hold, rg.tau);
    const [hard, soft, shut, ftau] = rg.lp;
    let f0 = soft * Math.pow(hard / soft, Math.pow(v, 0.85));
    // a ring taken over keeps the brightness it had, in its share
    if (inh > 0 && o.inheritLp) f0 = Math.exp((own * own * Math.log(f0) + inh * inh * Math.log(o.inheritLp)) / (own * own + inh * inh));
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.setTargetAtTime(shut, t, ftau);
    src.connect(g);
    g.connect(lp);
    lp.connect(this.lane(pan, 0));
    const end = t + hold + rg.tau * 6.9 + 0.05;
    src.start(t, this.r() * buf.duration * 0.999);
    src.stop(end);
    freeWhenDone(src, g, lp);
    return { src, g, t, end, peak, bloom: rg.bloom, hold, tau: rg.tau, f0, shut, ftau };
  }

  /**
   * One stroke: `rate` tunes it, `pan` places it, `gain` scales it. A loud stroke on a drum starts sharp by
   * `feel.bend` and settles; velocity picks the shared low-pass (none once it has opened past what the sound holds).
   */
  play(h: Hit, f: Feel, t: number, vel: number, o: PlayO = {}): Voice {
    const { r } = this;
    const v = clamp(vel, 0.02, 1);
    const k = this.take(h.key);
    const rate = (o.rate ?? 1) * (f.detune ? 1 + (r() - 0.5) * f.detune : 1);
    const bend = f.bend ? f.bend * Math.max(0, (v - 0.35) / 0.65) : 0;
    const level = f.gain * (o.gain ?? 1) * (1 + (r() - 0.5) * 0.14);
    const lift = Math.pow(v, f.curve ?? 1.6);
    const pan = o.pan ?? f.pan ?? 0;
    const parts: Part[] = [this.source(this.hitBuf(h, k), t, rate, level * lift, this.lane(pan, this.cut(f, v)), bend, f.bendTau)];
    const hard = h.edge ?? f.crack;
    if (hard && f.crackGain) {
      const cg = f.crackGain * (o.gain ?? 1) * Math.pow(v, 2.6);
      if (cg > 0.003) parts.push(h.edge ? this.source(this.hitBuf(h.edge, k), t, rate, cg, this.lane(pan, 0), bend, f.bendTau) : this.source(this.hitBuf(hard, this.take(hard.key)), t, rate, cg, this.lane(pan, 0)));
    }
    if (h.room) {
      const rb = this.get(`room:${h.room.key}`, k, TAKES, this.roomMake(h.room));
      parts.push(this.source(rb, t, rate, level * lift * h.room.level, this.s.in, bend, f.bendTau));
    }
    const ring = h.ring ? this.ringOf(h.ring, t, v, rate, level, pan, o) : undefined;
    let end = ring?.end ?? 0;
    for (const p of parts) end = Math.max(end, p.end);
    return { t, end, parts, ring };
  }

  /** Damp a voice from `t` (a hand on it, the hats closing) over about `fade` seconds: its strike and its ring. */
  choke(vc: Voice, t: number, fade = 0.03): void {
    for (const p of vc.ring ? [...vc.parts, vc.ring] : vc.parts) {
      if (t >= p.end - 0.005) continue;
      if (t <= p.t) {
        // closed before it began: it never sounds
        p.g.gain.cancelScheduledValues(p.t);
        p.end = p.t + 0.01;
      } else {
        const val = p === vc.ring ? ringLevel(vc.ring, t) : p.peak;
        p.g.gain.cancelScheduledValues(t);
        p.g.gain.setValueAtTime(val, t);
        if (val > 1e-5) p.g.gain.exponentialRampToValueAtTime(val * 1e-3, t + fade);
        p.g.gain.linearRampToValueAtTime(0, t + fade + 0.006);
        if (p === vc.ring) vc.ring.gone = [t, val, fade / 6.9];
        p.end = t + fade + 0.03;
      }
      try {
        p.src.stop(p.end);
      } catch {
        // an engine that allows only one stop(): the part runs out silent
      }
    }
    vc.end = Math.max(vc.ring?.end ?? 0, ...vc.parts.map((p) => p.end));
  }

  /** Let a voice's ring go (a new stroke took it over): it falls from `t` with time constant `tc`. */
  release(vc: Voice, t: number, tc = 0.04): void {
    const p = vc.ring;
    if (!p || t >= p.end - 0.005) return;
    if (t <= p.t) {
      p.g.gain.cancelScheduledValues(p.t);
      p.end = p.t + 0.01;
    } else {
      const val = ringLevel(p, t);
      p.g.gain.cancelScheduledValues(t);
      p.g.gain.setValueAtTime(val, t);
      p.g.gain.setTargetAtTime(0, t, tc);
      p.gone = [t, val, tc];
      p.end = t + tc * 7 + 0.02;
    }
    try {
      p.src.stop(p.end);
    } catch {
      // an engine that allows only one stop(): the ring runs on, silent
    }
    vc.end = Math.max(p.end, ...vc.parts.map((x) => x.end));
  }
}

/**
 * One thing that rings (a cymbal, a bell, the hats, a hand drum's head): its voices in time order, so a stroke can
 * take over from (or damp) the one still sounding whatever order the strokes were scheduled in.
 */
class Ringer {
  private vs: Voice[] = [];
  add(v: Voice): void {
    let i = this.vs.length;
    while (i > 0 && this.vs[i - 1].t > v.t) i--;
    this.vs.splice(i, 0, v);
    const latest = this.vs[this.vs.length - 1].t;
    while (this.vs.length > 1 && this.vs[0].end < latest - 2) this.vs.shift();
  }
  /** The latest voice that began before `t` and still sounds at it. */
  ringing(t: number, ok: (v: Voice) => boolean = () => true): Voice | undefined {
    for (let i = this.vs.length - 1; i >= 0; i--) {
      const v = this.vs[i];
      if (v.t < t && v.end > t && ok(v)) return v;
    }
    return undefined;
  }
  /** The first voice that begins after `t`. */
  after(t: number, ok: (v: Voice) => boolean = () => true): Voice | undefined {
    for (const v of this.vs) if (v.t > t && ok(v)) return v;
    return undefined;
  }
}

/** A stroke on a cymbal or a bell: it takes over the ring still sounding, and hands its own to a stroke already due. */
function ringOn(bank: Bank, it: Ringer, h: Hit, f: Feel, t: number, vel: number, o: PlayO = {}): Voice {
  const prev = it.ringing(t, (x) => !!x.ring && x.ring.end > t);
  const v = bank.play(h, f, t, vel, { ...o, ...heir(prev, t) });
  if (prev) bank.release(prev, t, Math.max(0.02, (h.ring?.bloom ?? 0.03) * 1.2));
  const next = it.after(t, (x) => !!x.ring);
  if (next) bank.release(v, next.t, 0.04);
  it.add(v);
  return v;
}

/** A stroke on something a hand damps (a drum's head, a sampler's voice): what it still rang with dies over `fade`. */
function onHead(bank: Bank, head: Ringer, h: Hit, f: Feel, t: number, vel: number, fade: number, o: PlayO = {}): Voice {
  const prev = head.ringing(t);
  if (prev) bank.choke(prev, t, fade);
  const v = bank.play(h, f, t, vel, o);
  const next = head.after(t);
  if (next) bank.choke(v, next.t, 0.02);
  head.add(v);
  return v;
}

/**
 * The hats (or a triangle and the hand that grips it): a closing stroke chokes the open one still ringing; an open one
 * takes over the one before and is choked by the next closing stroke already scheduled. `fades` = [closing, opening].
 */
function hatStroke(bank: Bank, hats: Ringer, h: Hit, f: Feel, t: number, vel: number, shuts: boolean, fades: [number, number]): Voice {
  if (shuts) {
    const v = bank.play(h, f, t, vel);
    v.shuts = true;
    const open = hats.ringing(t - 0.004, (x) => !x.shuts);
    if (open) bank.choke(open, t - 0.004, fades[0]);
    hats.add(v);
    return v;
  }
  const prev = hats.ringing(t, (x) => !x.shuts);
  const v = bank.play(h, f, t, vel, heir(prev, t));
  if (prev) bank.choke(prev, t, fades[1]);
  const shut = hats.after(t, (x) => !!x.shuts), again = hats.after(t, (x) => !x.shuts);
  if (shut && (!again || shut.t <= again.t)) bank.choke(v, shut.t - 0.004, fades[0]);
  else if (again) bank.choke(v, again.t, fades[1]);
  hats.add(v);
  return v;
}

/** A shared stick crack and the like: short, bright, the hard layer of loud strokes. */
function crack(key: string, chain: Chain, tau: number, ring1?: [number, number, number]): Hit {
  return {
    key,
    secs: Math.max(0.04, 8 * Math.max(tau, ring1?.[2] ?? 0)),
    fill(d, sr, k) {
      hiss(d, sr, 9001 + k * 37 + key.length, { a: 1, tau, rise: 0.00012, f: chain });
      if (ring1) ring(d, sr, [{ f: ring1[0] * (1 + 0.02 * k), a: ring1[1], tau: ring1[2] }]);
      onset(d, sr, 0.00012);
      return finish(d, sr, -50, 0.002);
    },
  };
}

const STICK = crack('stick', [['hp', 1100, 0.7], ['peak', 3300, 0.8, 6], ['lp', 12000]], 0.0016, [2900, 0.3, 0.003]);
const TIP = crack('tip', [['hp', 5000, 0.7], ['peak', 8500, 1, 4], ['lp', 13000]], 0.0009);
const BEATER = crack('beater', [['bp', 2600, 0.9], ['lp', 7000]], 0.0022, [1500, 0.25, 0.004]);
/** The fingers' slap on a hand drum's head: the bright edge only hard strokes have. */
const HAND = crack('hand', [['bp', 2200, 0.9], ['lp', 7000]], 0.003, [950, 0.3, 0.006]);
/** A hard stick's tick on wood or a small bell: higher than the instrument's own tone. */
const TICK = crack('tick', [['hp', 3800, 0.7], ['peak', 7000, 1, 5], ['lp', 13000]], 0.0012, [6200, 0.25, 0.0025]);

/**
 * A drum's edge: what a hard stroke adds to a soft one — the head's upper modes (a shorter contact reaches them), short,
 * and the skin's slap — the drum's own hard layer (`Hit.edge`), played on the stroke's take, ∝ velocity^2.6.
 */
function edge(key: string, f0: number, o: { at: number; tau: number; seed: number; slap: number; slapF?: number; air?: [number, number]; n?: number; contact?: number }): Hit {
  return {
    key,
    secs: Math.max(0.12, 7 * o.tau),
    fill(d, sr, k) {
      const take = noiseGen(o.seed + k * 7919);
      const [va, vf] = vary(take);
      const ms = skin({ f0: f0 * det(k, take), at: o.at, tau: o.tau, slope: 0.5, n: o.n ?? 36, contact: o.contact ?? 0.00035, air: o.air }, take);
      // the lowest modes are the stroke's own: the edge is what lies above them
      ms[0].a = 0;
      ms[1].a *= 0.25;
      ring(d, sr, ms);
      hiss(d, sr, o.seed + 300 + k, { a: o.slap * va, tau: 0.005, rise: 0.0003, f: shift([['bp', o.slapF ?? 2600, 0.8], ['lp', 10000]], vf) });
      onset(d, sr, 0.0003);
      return finish(d, sr, -56, 0.01);
    },
  };
}

// ── the 70s funk kit ────────────────────────────────────────────────────────────────────────
/**
 * The funk kit's 14" hats, 20" ride and 16" crash: sine partials for the low, tonal modes (in beating pairs), noise
 * bands for the dense upper ones, and a ring each. Their seeds fix them: every take is the same cymbal, struck a little
 * differently.
 */
const HAT14: MetalO = { seed: 1414, n: 16, lo: 450, hi: 9000, tilt: 0.6, tau: 0.5, slope: 0.8, split: 7, bloom: 0.003 };
const HAT14_WASH: WashO = { seed: 1415, n: 32, lo: 1400, hi: 14000, q: 4.5, tau: 0.42, slope: 0.7, bloom: 0.004, gain: 1 };
const HAT14_RING: LoopO = { key: 'funk/hat-ring', bits: 15, seed: 1416, parts: bands(HAT14, 28, 0.2), floor: shape(2600, 13000, 0.3), share: 0.55, width: 0.6 };
const RIDE20: MetalO = { seed: 2020, n: 26, lo: 700, hi: 6500, tilt: 0.35, peak: [3600, 1.2, 1.8], tau: 0.16, slope: 0.33, split: 2.4, bloom: 0.005, spread: 0.35 };
const RIDE20_WASH: WashO = { seed: 2021, n: 32, lo: 1800, hi: 14000, q: 4.5, tau: 0.1, slope: 0.35, bloom: 0.008, gain: 1 };
const RIDE20_RING: LoopO = { key: 'funk/ride-ring', bits: 16, seed: 2023, parts: bands(RIDE20, 45, 0.35), floor: shape(2500, 14000, 0.6), share: 0.5, width: 0.75 };
const CRASH16: MetalO = { seed: 1616, n: 30, lo: 450, hi: 6000, tilt: 0.25, peak: [3000, 1.4, 1.6], tau: 0.13, slope: 0.33, split: 4.5, bloom: 0.02, spread: 0.3 };
const CRASH16_WASH: WashO = { seed: 1617, n: 36, lo: 1200, hi: 15500, q: 4.5, tau: 0.16, slope: 0.33, bloom: 0.035, gain: 1 };
const CRASH16_RING: LoopO = { key: 'funk/crash-ring', bits: 16, seed: 1618, parts: bands(CRASH16, 35, 0.15), floor: shape(1100, 14000, 0.4), share: 0.6, width: 0.85 };
/** The ride's bell: its modes, the long ones kept in a ring of pure tones. */
const RIDE_BELL: ModeList = [[1, 1, 1.5], [2.06, 0.6, 1.1], [2.73, 0.45, 0.9], [3.52, 0.4, 0.7], [4.43, 0.28, 0.55], [5.4, 0.2, 0.4], [6.6, 0.12, 0.3]];
const RIDE_BELL_F = 1180;
const RIDE_BELL_RING: LoopO = { key: 'funk/bell-ring', bits: 16, seed: 4111, parts: bellTones(RIDE_BELL_F, RIDE_BELL.slice(0, 4).map(([r, a]) => [r, a]), 2.2, 4112), floor: shape(2500, 11000, 0.3), share: 0.12, width: 0.35 };
const FUNK_SNARE_F0 = 230;

const FUNK = {
  kick: {
    key: 'funk/kick',
    secs: 0.62,
    fill(d, sr, k) {
      const take = noiseGen(1001 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, skin({ f0: 58 * det(k, take), at: 0.2 + 0.04 * take(), tau: 0.075, slope: 0.75, n: 14, contact: 0.0016 }, take), bendCurve(sr, 0.22, 0.018));
      // the shell's box, the felt knocking the head, the snare across the stage buzzing along
      ring(d, sr, [{ f: 392 + 12 * take(), a: 0.1, tau: 0.03 }, { f: 655, a: 0.06, tau: 0.02 }, { f: 1010, a: 0.03, tau: 0.012 }]);
      hiss(d, sr, 1100 + k, { a: 0.3 * va, tau: 0.008, rise: 0.0008, f: shift([['lp', 3500], ['peak', 1400, 0.8, 4]], vf) });
      hiss(d, sr, 1150 + k, { a: 0.06 * va, tau: 0.003, rise: 0.0005, f: shift([['bp', 2800, 0.9], ['lp', 8000]], vf) });
      wires(d, sr, { seed: 1200 + k, f0: 56, tau: 0.07, a: 0.014, at: 0.004, th: 0.1 });
      onset(d, sr, 0.0012);
      room(d, sr, { size: 0.5, t60: 0.28, mix: 0.04, damp: 0.5 });
      saturate(d, 1.5);
      bq(d, sr, 'lp', 14000, 0.6);
      return finish(d, sr, -58, 0.02);
    },
  } as Hit,
  snare: {
    key: 'funk/snare',
    secs: 0.6,
    fill(d, sr, k) {
      const take = noiseGen(1301 + k * 7919);
      const [va, vf] = vary(take);
      // a 14" metal snare, tuned up for funk: the head's modes up to 2.4 kHz, the shell and the stick's snap above
      ring(d, sr, skin({ f0: FUNK_SNARE_F0 * det(k, take), at: 0.3 + 0.05 * take(), tau: 0.11, slope: 0.8, t01: 0.7, n: 72, contact: 0.0006 }, take), bendCurve(sr, 0.05, 0.016));
      ring(d, sr, [{ f: 1140, a: 0.06, tau: 0.05 }, { f: 1890, a: 0.045, tau: 0.04 }, { f: 2960, a: 0.03, tau: 0.03 }]);
      hiss(d, sr, 1550 + k, { a: 0.35 * va, tau: 0.018, rise: 0.0004, f: shift([['bp', 1900, 0.9]], vf) });
      wires(d, sr, { seed: 1400 + k, f0: FUNK_SNARE_F0 * 1.42, tau: 0.09, a: 0.6, low: 0.4, tone: 4200 });
      hiss(d, sr, 1500 + k, { a: 0.6 * va, tau: 0.0042, rise: 0.0003, f: shift([['hp', 800], ['peak', 2500, 0.7, 4], ['lp', 10000]], vf) });
      onset(d, sr, 0.0004);
      room(d, sr, { size: 0.45, t60: 0.3, mix: 0.07 });
      saturate(d, 1.3);
      bq(d, sr, 'lp', 15000, 0.6);
      return finish(d, sr, -60, 0.02);
    },
  } as Hit,
  rim: {
    key: 'funk/rim',
    secs: 0.65,
    fill(d, sr, k) {
      const take = noiseGen(1601 + k * 7919);
      const [va, vf] = vary(take);
      const head = skin({ f0: FUNK_SNARE_F0 * det(k, take), at: 0.92, tau: 0.14, slope: 0.7, t01: 0.7, n: 48, contact: 0.0004 }, take);
      ring(d, sr, head, bendCurve(sr, 0.08, 0.016));
      // the hoop rings, the stick cracks across it
      ring(d, sr, twins([{ f: 1380, a: 0.16, tau: 0.032 }, { f: 2240, a: 0.15, tau: 0.028 }, { f: 3150, a: 0.12, tau: 0.024 }, { f: 4520, a: 0.09, tau: 0.02 }, { f: 6100, a: 0.06, tau: 0.015 }], 6, take));
      hiss(d, sr, 1700 + k, { a: 0.9 * va, tau: 0.0035, rise: 0.00015, f: shift([['hp', 1500], ['peak', 3600, 0.8, 5]], vf) });
      wires(d, sr, { seed: 1800 + k, f0: FUNK_SNARE_F0 * 1.42, tau: 0.12, a: 0.6 });
      onset(d, sr, 0.0002);
      room(d, sr, { size: 0.45, t60: 0.32, mix: 0.09 });
      saturate(d, 1.5);
      bq(d, sr, 'lp', 15500, 0.6);
      return finish(d, sr, -60, 0.02);
    },
  } as Hit,
  ghost: {
    key: 'funk/ghost',
    secs: 0.35,
    fill(d, sr, k) {
      const take = noiseGen(1901 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, skin({ f0: FUNK_SNARE_F0 * det(k, take), at: 0.4 + 0.06 * take(), tau: 0.1, slope: 0.95, t01: 0.7, n: 30, contact: 0.0016 }, take));
      wires(d, sr, { seed: 2000 + k, f0: FUNK_SNARE_F0 * 1.42, tau: 0.075, a: 0.5, th: 0.08 });
      hiss(d, sr, 2100 + k, { a: 0.18 * va, tau: 0.0018, rise: 0.0003, f: shift([['hp', 1800], ['peak', 4000, 0.8, 3]], vf) });
      onset(d, sr, 0.0007);
      room(d, sr, { size: 0.45, t60: 0.3, mix: 0.05 });
      bq(d, sr, 'lp', 13000, 0.6);
      return finish(d, sr, -58, 0.015);
    },
  } as Hit,
  cross: {
    key: 'funk/cross',
    secs: 0.25,
    fill(d, sr, k) {
      const take = noiseGen(2201 + k * 7919);
      const [va, vf] = vary(take);
      // the stick lies on the head: its modes are short; the shell and the stick's own knock carry the "tock"
      const head = skin({ f0: FUNK_SNARE_F0 * det(k, take), at: 0.85, tau: 0.045, slope: 0.6, n: 12, contact: 0.0005, gain: 0.6 }, take);
      ring(d, sr, head);
      ring(d, sr, [{ f: (470 + 15 * take()) * det(k, take), a: 0.55, tau: 0.024 }, { f: 1650 + 40 * take(), a: 0.35, tau: 0.018 }, { f: 2680, a: 0.16, tau: 0.012 }, { f: 3900, a: 0.07, tau: 0.008 }]);
      hiss(d, sr, 2300 + k, { a: 0.4 * va, tau: 0.0018, rise: 0.0003, f: shift([['bp', 2300, 1.2], ['hp', 900], ['lp', 10000]], vf) });
      wires(d, sr, { seed: 2400 + k, f0: FUNK_SNARE_F0 * 1.42, tau: 0.05, a: 0.1, th: 0.1 });
      onset(d, sr, 0.00035);
      room(d, sr, { size: 0.45, t60: 0.3, mix: 0.07 });
      return finish(d, sr, -58, 0.01);
    },
  } as Hit,
  hatClosed: {
    key: 'funk/hat-closed',
    secs: 0.2,
    fill(d, sr, k) {
      const take = noiseGen(2501 + k * 7919);
      const [va, vf] = vary(take);
      // pressed together: the modes barely ring (the low ones a short "chick"), mostly a bright, short hiss
      ring(d, sr, metal({ ...HAT14, tauMul: 0.06, gain: 0.2, bloom: 0 }, take));
      wash(d, sr, { ...HAT14_WASH, tau: 0.03, slope: 0.4, bloom: 0.001, gain: 0.45 }, k);
      hiss(d, sr, 2600 + k, { a: 0.35 * va, tau: 0.018, rise: 0.0003, f: shift([['hp', 6200, 0.7], ['peak', 9000, 1, 4], ['lp', 12000]], vf) });
      hiss(d, sr, 2700 + k, { a: 0.13 * va, tau: 0.008, rise: 0.0004, f: shift([['bp', 3400, 1.4]], vf) });
      onset(d, sr, 0.0003);
      bq(d, sr, 'lp', 12500, 0.6);
      return finish(d, sr, -58, 0.006);
    },
  } as Hit,
  hatShank: {
    key: 'funk/hat-shank',
    secs: 0.26,
    fill(d, sr, k) {
      const take = noiseGen(2551 + k * 7919);
      const [va, vf] = vary(take);
      // an accent: the stick's shoulder on the edge, the closed hats still give a little: a fuller, washier "chk"
      ring(d, sr, metal({ ...HAT14, tauMul: 0.1, gain: 0.24, bloom: 0 }, take));
      wash(d, sr, { ...HAT14_WASH, tau: 0.055, slope: 0.45, bloom: 0.0015, gain: 0.5 }, k + 3);
      hiss(d, sr, 2650 + k, { a: 0.3 * va, tau: 0.03, rise: 0.0004, f: shift([['hp', 5200, 0.7], ['peak', 8000, 1, 3], ['lp', 12000]], vf) });
      hiss(d, sr, 2750 + k, { a: 0.22 * va, tau: 0.012, rise: 0.0005, f: shift([['bp', 3200, 1.2]], vf) });
      onset(d, sr, 0.0004);
      bq(d, sr, 'lp', 12500, 0.6);
      return finish(d, sr, -58, 0.01);
    },
  } as Hit,
  hatHalf: {
    key: 'funk/hat-half',
    secs: 0.85,
    fill(d, sr, k) {
      const take = noiseGen(2801 + k * 7919);
      const [va, vf] = vary(take);
      // loose: the two cymbals chatter against each other
      ring(d, sr, metal({ ...HAT14, tauMul: 0.3, gain: 0.2 }, take));
      wash(d, sr, { ...HAT14_WASH, n: 18, q: 3, tau: 0.12, bloom: 0.003, gain: 0.3 }, k);
      sizzle(d, sr, 2900 + k, { a: 0.5, tau: 0.12, gap: [0.0022, 0.0065], f: [['hp', 5200, 0.7], ['peak', 8500, 1, 3], ['lp', 12000]] });
      hiss(d, sr, 3000 + k, { a: 0.3 * va, tau: 0.012, rise: 0.0003, f: shift([['hp', 5000], ['lp', 12000]], vf) });
      onset(d, sr, 0.0003);
      bq(d, sr, 'lp', 12500, 0.6);
      return finish(d, sr, -58, 0.03);
    },
  } as Hit,
  hatOpen: {
    key: 'funk/hat-open',
    secs: 0.34,
    fill(d, sr, k) {
      const take = noiseGen(3101 + k * 7919);
      const [va, vf] = vary(take);
      // the stroke; the ring carries the shimmer on
      ring(d, sr, metal({ ...HAT14, tauMul: 0.16, gain: 0.26 }, take));
      wash(d, sr, { ...HAT14_WASH, tau: 0.07, slope: 0.5, gain: 0.5 }, k);
      hiss(d, sr, 3400 + k, { a: 0.5 * va, tau: 0.004, rise: 0.0002, f: shift([['hp', 4000], ['lp', 12000]], vf) });
      onset(d, sr, 0.0003);
      bq(d, sr, 'lp', 12500, 0.6);
      return finish(d, sr, -70, 0.02);
    },
    ring: { loop: HAT14_RING, level: 0.45, curve: 2, bloom: 0.012, hold: 0.03, tau: 0.55, lp: [15000, 6000, 6000, 0.55] },
  } as Hit,
  hatPedal: {
    key: 'funk/hat-pedal',
    secs: 0.16,
    fill(d, sr, k) {
      const take = noiseGen(3601 + k * 7919);
      const [va, vf] = vary(take);
      // the two cymbals clap shut: a dull "chick" with a body, no stick
      hiss(d, sr, 3600 + k, { a: 0.5 * va, tau: 0.012, rise: 0.0015, f: shift([['bp', 4600, 1.1], ['lp', 9000]], vf) });
      hiss(d, sr, 3700 + k, { a: 0.25 * va, tau: 0.007, rise: 0.0012, f: shift([['bp', 8200, 1]], vf) });
      hiss(d, sr, 3800 + k, { a: 0.35 * va, tau: 0.014, rise: 0.0015, f: shift([['bp', 600, 1.3]], vf) });
      wash(d, sr, { ...HAT14_WASH, tau: 0.02, slope: 0.3, bloom: 0.001, gain: 0.2 }, k);
      ring(d, sr, [{ f: 240, a: 0.05, tau: 0.01 }]);
      onset(d, sr, 0.001);
      return finish(d, sr, -56, 0.006);
    },
  } as Hit,
  rideBow: {
    key: 'funk/ride-bow',
    secs: 0.42,
    fill(d, sr, k) {
      const take = noiseGen(3801 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, metal({ ...RIDE20, gain: 0.2 }, take));
      // the ping: the partials round the stick, short and clear
      ring(d, sr, metal({ seed: 2022, n: 6, lo: 2500, hi: 5800, tau: 0.1, slope: 0.4, split: 3, gain: 0.5, spread: 0.3 }, take));
      wash(d, sr, { ...RIDE20_WASH, gain: 0.35 }, k);
      hiss(d, sr, 3900 + k, { a: 0.4 * va, tau: 0.0014, rise: 0.0001, f: shift([['hp', 3000], ['peak', 6000, 1, 3], ['lp', 12000]], vf) });
      onset(d, sr, 0.0002);
      bq(d, sr, 'lp', 14000, 0.6);
      return finish(d, sr, -70, 0.02);
    },
    ring: { loop: RIDE20_RING, level: 0.32, curve: 2, bloom: 0.04, hold: 0.06, tau: 2.5, lp: [16000, 5500, 5000, 1.5] },
  } as Hit,
  rideBell: {
    key: 'funk/ride-bell',
    secs: 0.4,
    fill(d, sr, k) {
      const take = noiseGen(4101 + k * 7919);
      const [va, vf] = vary(take);
      // the short modes here; the long ones ring on in the ring
      ring(d, sr, twins(modesOf(RIDE_BELL_F * det(k, take, 4), RIDE_BELL.slice(4), take, 0.2, 0.5), 2.2, take));
      ring(d, sr, metal({ ...RIDE20, gain: 0.14 }, take));
      wash(d, sr, { ...RIDE20_WASH, gain: 0.1 }, k);
      hiss(d, sr, 4200 + k, { a: 0.45 * va, tau: 0.001, rise: 0.0001, f: shift([['hp', 4000], ['lp', 12000]], vf) });
      onset(d, sr, 0.0002);
      bq(d, sr, 'lp', 13500, 0.6);
      return finish(d, sr, -70, 0.02);
    },
    ring: { loop: RIDE_BELL_RING, level: 2.2, curve: 1.5, bloom: 0.0006, hold: 0, tau: 1.5, lp: [12000, 6500, 2600, 0.9] },
  } as Hit,
  crash: {
    key: 'funk/crash',
    secs: 0.5,
    fill(d, sr, k) {
      const take = noiseGen(4301 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, metal({ ...CRASH16, gain: 0.22 }, take));
      wash(d, sr, { ...CRASH16_WASH, gain: 0.6 }, k);
      // the first instant: the edge flexing, a burst of everything
      hiss(d, sr, 4400 + k, { a: 0.6 * va, tau: 0.028, rise: 0.0002, f: shift([['hp', 1500], ['peak', 4500, 0.7, 3], ['lp', 13000]], vf) });
      onset(d, sr, 0.0003);
      bq(d, sr, 'lp', 14000, 0.6);
      return finish(d, sr, -70, 0.02);
    },
    ring: { loop: CRASH16_RING, level: 0.62, curve: 1.8, bloom: 0.03, hold: 0.05, tau: 1.8, lp: [16000, 6500, 4500, 1.1] },
  } as Hit,
  tom: (name: string, f0: number, len: number): Hit => ({
    key: `funk/tom-${name}`,
    secs: len,
    fill(d, sr, k) {
      const take = noiseGen(4701 + k * 7919 + f0);
      const [va, vf] = vary(take);
      const sustain = 1 + (172 - f0) / 160;
      ring(d, sr, skin({ f0: f0 * det(k, take), at: 0.32 + 0.05 * take(), tau: 0.11 * sustain, slope: 0.7, t01: 0.8, n: 24, contact: 0.0007, spread: 0.3 }, take), bendCurve(sr, 0.1, 0.035 * sustain));
      ring(d, sr, [{ f: 620, a: 0.05, tau: 0.04 }, { f: 1100, a: 0.035, tau: 0.03 }, { f: 1830, a: 0.02, tau: 0.02 }]);
      hiss(d, sr, 4800 + k + f0, { a: 0.5 * va, tau: 0.004, rise: 0.0003, f: shift([['hp', 700], ['peak', 2500, 0.7, 3], ['lp', 10000]], vf) });
      onset(d, sr, 0.0005);
      room(d, sr, { size: 0.5, t60: 0.35, mix: 0.07 });
      saturate(d, 1.3);
      bq(d, sr, 'lp', 14000, 0.6);
      return finish(d, sr, -56, 0.04);
    },
    edge: edge(`funk/tom-${name}-edge`, f0, { at: 0.36, tau: 0.035 * (1 + (172 - f0) / 160), seed: 4901 + f0, slap: 0.5, slapF: 2200, n: 30, contact: 0.0004 }),
  }),
};

/** The half-open hats' sizzle: the cymbals chattering, a train of collisions at an uneven `gap`, dying with `tau`. */
function sizzle(d: Float32Array, sr: number, seed: number, o: { a: number; tau: number; gap: [number, number]; f: Chain }): void {
  const n = Math.min(d.length, Math.ceil(o.tau * sr * 7));
  const x = noise(n, sr, seed, o.f);
  const g = noiseGen(seed + 7);
  const env = new Float32Array(n);
  const grain = Math.exp(-1 / (0.0016 * sr));
  let next = 0, lvl = 0;
  for (let i = 0; i < n; i++) {
    if (i >= next) {
      lvl += (0.5 + 0.5 * Math.abs(g())) * Math.exp(-i / (o.tau * sr));
      next = i + Math.round((o.gap[0] + (o.gap[1] - o.gap[0]) * Math.abs(g())) * sr);
    }
    env[i] = lvl;
    lvl *= grain;
  }
  let e = 0;
  for (let i = 0; i < n; i++) e = Math.max(e, env[i]);
  for (let i = 0; i < n; i++) d[i] += (o.a * x[i] * (0.25 * Math.exp(-i / (o.tau * sr)) + env[i])) / e;
}

const FUNK_TOMS = { high: FUNK.tom('high', 172, 0.75), mid: FUNK.tom('mid', 128, 0.9), floor: FUNK.tom('floor', 88, 1.1) };

const FUNK_FEEL: Record<string, Feel> = {
  kick: { gain: 0.82, curve: 1.5, dark: 500, open: 12000, bend: 0.12, bendTau: 0.02, crack: BEATER, crackGain: 0.16, pan: 0, detune: 0.005 },
  snare: { gain: 0.85, curve: 1.55, dark: 1600, open: 19000, bend: 0.06, bendTau: 0.018, crack: STICK, crackGain: 0.3, pan: -0.05, detune: 0.005 },
  rim: { gain: 0.9, curve: 1.5, dark: 1500, open: 20000, bend: 0.06, bendTau: 0.018, crack: STICK, crackGain: 0.35, pan: -0.05, detune: 0.005 },
  ghost: { gain: 0.6, curve: 1.25, dark: 1200, open: 13000, pan: -0.05, detune: 0.005 },
  cross: { gain: 0.6, curve: 1.4, dark: 1200, open: 17000, crack: STICK, crackGain: 0.2, pan: -0.05, detune: 0.005 },
  hat: { gain: 0.44, curve: 1.35, dark: 2800, open: 20000, crack: TIP, crackGain: 0.12, pan: -0.35 },
  pedal: { gain: 0.3, curve: 1.3, dark: 2200, open: 17000, pan: -0.35 },
  ride: { gain: 0.34, curve: 1.3, dark: 3500, open: 19000, crack: TIP, crackGain: 0.2, pan: 0.4 },
  bell: { gain: 0.36, curve: 1.35, dark: 3500, open: 20000, crack: TIP, crackGain: 0.12, pan: 0.4 },
  crash: { gain: 0.5, curve: 1.3, dark: 2000, open: 20000, pan: -0.45 },
  tom: { gain: 0.76, curve: 1.5, dark: 600, open: 15000, bend: 0.08, bendTau: 0.04, crackGain: 0.4, detune: 0.005 },
};

export type SnareStroke = 'center' | 'rim' | 'ghost' | 'cross';
export type HatStroke = 'closed' | 'half' | 'open' | 'pedal';

/**
 * A tight, dry, warm 70s soul kit: a blanketed 22" kick, a 14" metal snare (centre, rim shot, ghost, cross-stick), 14"
 * hats (closed, half-open, open, the foot), a dry 20" ride (bow, bell), a thin 16" crash, three deadened toms. A
 * centre stroke under velocity 0.45 turns into a ghost (all ghost below 0.32). An open or half-open hat rings until
 * the next closed or foot hat chokes it (in time order, whatever order they were scheduled in); closed strokes from
 * velocity 0.5 up are more and more often played with the stick's shank on the edge (the fuller "chk" of an accent:
 * all of them from 0.8). `tune` moves the drums (semitones; the cymbals stay); `width` scales the stereo spread
 * (drummer's view: hats left, ride and floor tom right).
 */
const FUNK_ALL: Hit[] = [
  FUNK.kick, FUNK.snare, FUNK.hatClosed, FUNK.ghost, FUNK.hatShank, FUNK.hatOpen, FUNK.rim, FUNK.cross, FUNK.hatHalf, FUNK.hatPedal,
  FUNK.rideBow, FUNK.rideBell, FUNK.crash, ...Object.values(FUNK_TOMS), STICK, TIP, BEATER,
];

export function makeFunkKit(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { tune?: number; width?: number } = {}) {
  const bank = new Bank(ctx, s, r, o.width ?? 1);
  const drum = Math.pow(2, (o.tune ?? 0) / 12);
  const hats = new Ringer(), ride = new Ringer(), bell = new Ringer(), crash = new Ringer();
  const SN = { center: FUNK.snare, rim: FUNK.rim, ghost: FUNK.ghost, cross: FUNK.cross };
  const SF = { center: FUNK_FEEL.snare, rim: FUNK_FEEL.rim, ghost: FUNK_FEEL.ghost, cross: FUNK_FEEL.cross };
  const all = FUNK_ALL;
  bank.prepare(all);
  return {
    /** Build every take now, in the background between frames (offline: at once); resolves when they're in hand. */
    warm: () => bank.warm(all),
    kick(t: number, vel: number) {
      bank.play(FUNK.kick, FUNK_FEEL.kick, t, vel, { rate: drum });
    },
    snare(t: number, vel: number, how: SnareStroke = 'center') {
      if (how === 'center' && vel < 0.45) {
        // a soft centre stroke is a ghost: the two crossfade between 0.32 and 0.45 (equal power)
        const x = clamp((vel - 0.32) / 0.13, 0, 1);
        if (x < 1) bank.play(FUNK.ghost, FUNK_FEEL.ghost, t, vel, { rate: drum, gain: Math.cos((x * Math.PI) / 2) });
        if (x > 0) bank.play(FUNK.snare, FUNK_FEEL.snare, t, vel, { rate: drum, gain: Math.sin((x * Math.PI) / 2) });
        return;
      }
      bank.play(SN[how], SF[how], t, vel, { rate: drum });
    },
    hat(t: number, vel: number, how: HatStroke = 'closed') {
      if (how === 'closed' || how === 'pedal') {
        const shank = how === 'closed' && r() < clamp((vel - 0.5) / 0.3, 0, 1);
        hatStroke(bank, hats, how === 'pedal' ? FUNK.hatPedal : shank ? FUNK.hatShank : FUNK.hatClosed, how === 'pedal' ? FUNK_FEEL.pedal : FUNK_FEEL.hat, t, vel, true, [0.028, 0.05]);
        return;
      }
      hatStroke(bank, hats, how === 'open' ? FUNK.hatOpen : FUNK.hatHalf, FUNK_FEEL.hat, t, vel, false, [0.028, 0.05]);
    },
    ride(t: number, vel: number, how: 'bow' | 'bell' = 'bow') {
      if (how === 'bell') ringOn(bank, bell, FUNK.rideBell, FUNK_FEEL.bell, t, vel);
      else ringOn(bank, ride, FUNK.rideBow, FUNK_FEEL.ride, t, vel);
    },
    /** `grab`: seconds until a hand catches it (a choked crash on a stop). */
    crash(t: number, vel: number, grab?: number) {
      const v = ringOn(bank, crash, FUNK.crash, FUNK_FEEL.crash, t, vel);
      if (grab) bank.choke(v, t + grab, 0.09);
    },
    tom(t: number, vel: number, which: 'high' | 'mid' | 'floor' = 'mid') {
      bank.play(FUNK_TOMS[which], FUNK_FEEL.tom, t, vel, { rate: drum, pan: { high: -0.2, mid: 0.05, floor: 0.35 }[which] });
    },
  };
}

export type FunkKit = ReturnType<typeof makeFunkKit>;

// ── brushes ─────────────────────────────────────────────────────────────────────────────────
/** A jazz snare tuned up a little, under a fan of wire bristles. */
const BRUSH_SNARE_F0 = 212;
const RIDE22: MetalO = { seed: 2222, n: 28, lo: 600, hi: 5500, tilt: 0.3, peak: [2800, 1.4, 1.9], tau: 0.14, slope: 0.33, split: 2.2, bloom: 0.01, spread: 0.35 };
const RIDE22_WASH: WashO = { seed: 2224, n: 32, lo: 1500, hi: 12000, q: 4.5, tau: 0.1, slope: 0.35, bloom: 0.012, gain: 1 };
const RIDE22_RING: LoopO = { key: 'brush/ride-ring', bits: 16, seed: 2225, parts: bands(RIDE22, 40, 0.35), floor: shape(2200, 12000, 0.55), share: 0.5, width: 0.75 };

const BRUSH = {
  tap: {
    key: 'brush/tap',
    secs: 0.22,
    fill(d, sr, k) {
      const take = noiseGen(5001 + k * 7919);
      const [va, vf] = vary(take);
      // the bristles land over a few milliseconds: a spread, soft-edged burst, not a click
      hiss(d, sr, 5100 + k, { a: 0.7 * va, tau: 0.012, rise: 0.0022, f: shift([['hp', 1200, 0.6], ['peak', 3600, 0.7, 4], ['lp', 10000]], vf) });
      ring(d, sr, skin({ f0: BRUSH_SNARE_F0 * det(k, take), at: 0.45, tau: 0.05, slope: 1, n: 12, contact: 0.003, gain: 0.1 }, take));
      wires(d, sr, { seed: 5200 + k, f0: 300, tau: 0.06, a: 0.32, th: 0.06, tone: 5600 });
      onset(d, sr, 0.0015);
      room(d, sr, { size: 0.55, t60: 0.4, mix: 0.06 });
      return finish(d, sr, -56, 0.012);
    },
  } as Hit,
  snare: {
    key: 'brush/snare',
    secs: 0.42,
    fill(d, sr, k) {
      const take = noiseGen(5301 + k * 7919);
      const [va, vf] = vary(take);
      // a brush slapped flat into the head: more of the drum, and the wires answer
      hiss(d, sr, 5400 + k, { a: 0.75 * va, tau: 0.022, rise: 0.0018, f: shift([['hp', 700, 0.6], ['peak', 2800, 0.7, 4], ['lp', 9500]], vf) });
      ring(d, sr, skin({ f0: BRUSH_SNARE_F0 * det(k, take), at: 0.35, tau: 0.11, slope: 0.95, t01: 0.75, n: 16, contact: 0.0022, gain: 0.45 }, take));
      wires(d, sr, { seed: 5500 + k, f0: 300, tau: 0.11, a: 0.55, tone: 5400 });
      onset(d, sr, 0.0012);
      room(d, sr, { size: 0.55, t60: 0.42, mix: 0.07 });
      return finish(d, sr, -58, 0.02);
    },
  } as Hit,
  kick: {
    key: 'brush/kick',
    secs: 0.45,
    fill(d, sr, k) {
      const take = noiseGen(5601 + k * 7919);
      const [va, vf] = vary(take);
      // an open 18", felt beater, feathered: a soft, short, round thump under the bass, no click, no boom
      ring(d, sr, skin({ f0: 63 * det(k, take), at: 0.22 + 0.04 * take(), tau: 0.085, slope: 0.7, n: 14, contact: 0.0035 }, take), bendCurve(sr, 0.05, 0.03));
      hiss(d, sr, 5700 + k, { a: 0.14 * va, tau: 0.01, rise: 0.0015, f: shift([['lp', 2500], ['peak', 900, 0.8, 3]], vf) });
      onset(d, sr, 0.002);
      room(d, sr, { size: 0.6, t60: 0.4, mix: 0.05, damp: 0.55 });
      return finish(d, sr, -58, 0.03);
    },
  } as Hit,
  ride: {
    key: 'brush/ride',
    secs: 0.42,
    fill(d, sr, k) {
      const take = noiseGen(5801 + k * 7919);
      const [va, vf] = vary(take);
      // a dark, dry 22" played lightly with a stick's tip: a soft "ting" over a warm wash, carried on by its ring
      ring(d, sr, metal({ ...RIDE22, gain: 0.22 }, take));
      ring(d, sr, metal({ seed: 2223, n: 5, lo: 1800, hi: 4200, tau: 0.12, slope: 0.4, split: 2.5, gain: 0.3, spread: 0.3 }, take));
      wash(d, sr, { ...RIDE22_WASH, gain: 0.32 }, k);
      hiss(d, sr, 5900 + k, { a: 0.22 * va, tau: 0.0012, rise: 0.0002, f: shift([['hp', 2500], ['peak', 5000, 1, 3], ['lp', 11000]], vf) });
      onset(d, sr, 0.0003);
      bq(d, sr, 'lp', 14000, 0.6);
      return finish(d, sr, -70, 0.02);
    },
    ring: { loop: RIDE22_RING, level: 0.34, curve: 2, bloom: 0.045, hold: 0.06, tau: 2.6, lp: [14000, 5000, 4200, 1.6] },
  } as Hit,
  /** Two seconds of the coated head under the bristles, looping: noise with a slow, uneven grain and catches. */
  scrape: {
    key: 'brush/scrape',
    secs: 2.08,
    fill(d, sr) {
      const n = Math.round(2 * sr), fold = Math.round(0.06 * sr), all = n + fold;
      const am = noise(all, sr, 6101, [['lp', 30, 0.5]]);
      const x = noise(all, sr, 6102);
      const g = noiseGen(6103);
      for (let i = 0; i < all; i++) {
        x[i] *= clamp(1 + 0.5 * am[i], 0.25, 2);
        // a bristle catching the coating now and then
        if (g() > 0.985) x[i] += g() * 3;
      }
      bq(x, sr, 'hp', 800, 0.6);
      bq(x, sr, 'peak', 3000, 0.7, 3);
      bq(x, sr, 'lp', 9000, 0.6);
      for (let i = 0; i < fold; i++) {
        const k = i / fold;
        x[i] = x[i] * Math.sqrt(k) + x[n + i] * Math.sqrt(1 - k);
      }
      d.set(x.subarray(0, n));
      unitRms(d.subarray(0, n));
      for (let i = 0; i < n; i++) d[i] *= 0.25;
      return n;
    },
  } as Hit,
};

const BRUSH_FEEL: Record<string, Feel> = {
  tap: { gain: 0.42, curve: 1.3, dark: 2200, open: 14000, pan: -0.05 },
  snare: { gain: 0.62, curve: 1.4, dark: 1800, open: 16000, pan: -0.05, detune: 0.005 },
  kick: { gain: 0.32, curve: 1.5, dark: 250, open: 6000, bend: 0.06, bendTau: 0.03, crack: BEATER, crackGain: 0.05, pan: 0, detune: 0.005 },
  ride: { gain: 0.38, curve: 1.3, dark: 4000, open: 14000, crack: TIP, crackGain: 0.2, pan: 0.4 },
};

/**
 * Jazz and bossa brushes on a snare, a feathered 18" kick and a dark 22" ride (played lightly with a stick's tip).
 * `tap` = the bristles landing (the right hand's pattern), `swish` = a sweep across the head held for `dur` seconds
 * (the left hand's circles: the band moves out and back, the sound drifts a little left to right), `snare` = a
 * brush slapped flat (the accents).
 */
const BRUSH_ALL: Hit[] = [BRUSH.tap, BRUSH.scrape, BRUSH.kick, BRUSH.snare, BRUSH.ride, TIP];

export function makeBrushKit(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { width?: number } = {}) {
  const width = o.width ?? 1;
  const bank = new Bank(ctx, s, r, width);
  const ride = new Ringer();
  const all = BRUSH_ALL;
  bank.prepare(all);
  return {
    /** Build every take now, in the background between frames (offline: at once); resolves when they're in hand. */
    warm: () => bank.warm(all),
    tap(t: number, vel: number) {
      bank.play(BRUSH.tap, BRUSH_FEEL.tap, t, vel);
    },
    /** A sweep held `dur` seconds (five nodes: the looping scrape, a moving band-pass, a high-pass, its gain, its pan). */
    swish(t: number, dur: number, vel: number) {
      const v = clamp(vel, 0.02, 1);
      const len = Math.max(0.08, dur);
      const buf = workerMade(ctx.sampleRate, drumKey(BRUSH.scrape.key, 0)) ?? cachedBuffer(ctx, `drums/${BRUSH.scrape.key}/0`, BRUSH.scrape.secs, (d, sr) => BRUSH.scrape.fill(d, sr, 0));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.92 + r() * 0.16;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      // the brush travels out from the centre and back: the band rises and falls; harder sweeps are brighter
      const lo = 900 + 1400 * v, hi = (1900 + 2600 * v) * (0.9 + r() * 0.2);
      bp.frequency.setValueAtTime(lo, t);
      bp.frequency.linearRampToValueAtTime(hi, t + len * 0.55);
      bp.frequency.linearRampToValueAtTime(lo * 1.1, t + len);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      hp.Q.value = 0.5;
      const g = ctx.createGain();
      const peak = 0.55 * Math.pow(v, 1.4) * (1 + (r() - 0.5) * 0.12);
      const a = Math.min(0.09, len * 0.3);
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * 0.75, t + a);
      g.gain.linearRampToValueAtTime(peak, t + len * 0.55);
      g.gain.linearRampToValueAtTime(peak * 0.55, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + 0.09);
      const nodes: AudioNode[] = [bp, hp, g];
      src.connect(bp);
      bp.connect(hp);
      hp.connect(g);
      let out: AudioNode = g;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(clamp(-0.18 * width), t);
        p.pan.linearRampToValueAtTime(clamp(0.1 * width), t + len);
        g.connect(p);
        out = p;
        nodes.push(p);
      }
      out.connect(s.in);
      src.start(t, r() * (buf.duration - 0.1));
      src.stop(t + len + 0.12);
      freeWhenDone(src, ...nodes);
    },
    snare(t: number, vel: number) {
      bank.play(BRUSH.snare, BRUSH_FEEL.snare, t, vel);
    },
    kick(t: number, vel: number) {
      bank.play(BRUSH.kick, BRUSH_FEEL.kick, t, vel);
    },
    ride(t: number, vel: number) {
      ringOn(bank, ride, BRUSH.ride, BRUSH_FEEL.ride, t, vel);
    },
  };
}

export type BrushKit = ReturnType<typeof makeBrushKit>;

// ── the 80s machine ─────────────────────────────────────────────────────────────────────────
// A LinnDrum / DMX: recordings of real drums, cut short, played from a sampler (its top rolled off at ~13 kHz), the
// snare and toms with a big room gated shut. Every sound is one voice: struck again, it cuts itself off.
const HAT_LINN: MetalO = { seed: 1980, n: 14, lo: 600, hi: 9000, tilt: 0.6, tau: 0.4, slope: 0.8, split: 8, bloom: 0.003 };
const HAT_LINN_WASH: WashO = { seed: 1981, n: 28, lo: 1600, hi: 13000, q: 4.5, tau: 0.35, slope: 0.7, bloom: 0.003, gain: 1 };
const HAT_LINN_RING: LoopO = { key: '80s/hat-ring', bits: 15, seed: 1982, parts: bands(HAT_LINN, 26, 0.2), floor: shape(3000, 12000, 0.3), share: 0.55, width: 0.55 };
/** The machine's cowbell, as it left the factory (its tuning knob moves it: `tune`). */
const LINN_BELL_F = 587;

/** The sampler's anti-alias filter and a little of its punch; returns the gain small signals got. */
function sampled(d: Float32Array, sr: number, drive = 1.6): number {
  const k = saturate(d, drive);
  bq(d, sr, 'lp', 13000, 0.7);
  bq(d, sr, 'lp', 13000, 0.7);
  return k;
}

/** A drum and its gated room as two buffers: the drum (gated, mono) and the room round it (two channels). */
function gated(key: string, secs: number, roomSecs: number, model: (d: Float32Array, sr: number, k: number) => void, o: RoomO, drive: number, hard?: Hit): Hit {
  const dry = (d: Float32Array, sr: number, k: number) => {
    model(d, sr, k);
    const g0 = Math.round((o.gate ?? 1) * sr), gr = Math.max(1, Math.round((o.release ?? 0.03) * sr));
    for (let i = g0; i < d.length; i++) d[i] *= i < g0 + gr ? 0.5 + 0.5 * Math.cos((Math.PI * (i - g0)) / gr) : 0;
  };
  return {
    key,
    secs,
    edge: hard,
    fill(d, sr, k) {
      dry(d, sr, k);
      sampled(d, sr, drive);
      return finish(d, sr, -56, 0.01);
    },
    room: {
      key: `${key}-room`,
      secs: roomSecs,
      level: 1,
      fill(L, R, sr, k) {
        // the room from the drum as it was struck, at the level the dry take ended up at
        const d = new Float32Array(L.length);
        model(d, sr, k);
        const raw = d.slice();
        room(d, sr, o, [L, R]);
        const g = new Float32Array(Math.round(secs * sr));
        g.set(raw.subarray(0, g.length));
        dry(g, sr, k);
        const small = sampled(g, sr, drive);
        const k2 = small * levelOf(g, sr);
        for (const c of [L, R]) {
          for (let i = 0; i < c.length; i++) c[i] *= k2;
          bq(c, sr, 'lp', 13000, 0.7);
        }
        const end = Math.min(L.length, Math.round(((o.gate ?? 0) + (o.release ?? 0.03) + (o.pre ?? 0.004)) * sr) + 64);
        for (const c of [L, R]) damp(c.subarray(0, end), sr, 0.06);
        return end;
      },
    },
  };
}

const LINN = {
  kick: {
    key: '80s/kick',
    secs: 0.5,
    fill(d, sr, k) {
      const take = noiseGen(7001 + k * 7919);
      const [va, vf] = vary(take);
      // a hard beater on a tight, muffled head: a fast fall from high (the punch), a short round body
      ring(d, sr, skin({ f0: 58 * det(k, take), at: 0.16 + 0.03 * take(), tau: 0.13, slope: 0.85, n: 12, contact: 0.0009 }, take), bendCurve(sr, 0.9, 0.012));
      hiss(d, sr, 7100 + k, { a: 0.65 * va, tau: 0.003, rise: 0.0002, f: shift([['bp', 3200, 0.8], ['hp', 900], ['lp', 9000]], vf) });
      ring(d, sr, [{ f: 1750 * vf, a: 0.16, tau: 0.005 }, { f: 3900, a: 0.06, tau: 0.003 }]);
      onset(d, sr, 0.0004);
      sampled(d, sr, 1.9);
      return finish(d, sr, -56, 0.02);
    },
  } as Hit,
  snare: gated(
    '80s/snare',
    0.3,
    0.32,
    (d, sr, k) => {
      const take = noiseGen(7201 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, skin({ f0: 182 * det(k, take), at: 0.3 + 0.04 * take(), tau: 0.16, slope: 0.8, t01: 0.8, n: 40, contact: 0.0007 }, take), bendCurve(sr, 0.07, 0.02));
      wires(d, sr, { seed: 7300 + k, f0: 252, tau: 0.15, a: 0.7, tone: 4600, low: 0.35 });
      hiss(d, sr, 7400 + k, { a: 0.65 * va, tau: 0.0045, rise: 0.0003, f: shift([['hp', 900], ['peak', 2600, 0.7, 4], ['lp', 10000]], vf) });
      onset(d, sr, 0.0004);
    },
    { size: 1, t60: 1.8, mix: 0.9, damp: 0.25, gate: 0.25, release: 0.04, pre: 0.006, all: true },
    1.7,
  ),
  clap: {
    key: '80s/clap',
    secs: 0.45,
    fill(d, sr, k) {
      const take = noiseGen(7501 + k * 7919);
      // a few people clapping, not quite together, then the room
      const hands = [0, 0.0085, 0.0152, 0.0221, 0.0298];
      hands.forEach((at, i) => {
        const f = 1050 + 500 * Math.abs(take());
        hiss(d, sr, 7600 + k * 10 + i, { a: 0.6 + 0.12 * i, tau: 0.0042 + 0.002 * Math.abs(take()), rise: 0.0003, at: at + 0.0012 * take(), f: [['bp', f, 1.3], ['hp', 500]] });
      });
      hiss(d, sr, 7700 + k, { a: 0.3, tau: 0.075, rise: 0.003, at: 0.03, f: [['bp', 1250, 0.8], ['hp', 600]] });
      onset(d, sr, 0.0003);
      room(d, sr, { size: 0.8, t60: 0.9, mix: 0.25, gate: 0.24, release: 0.05 });
      sampled(d, sr, 1.4);
      return finish(d, sr, -56, 0.02);
    },
  } as Hit,
  hatClosed: {
    key: '80s/hat-closed',
    secs: 0.14,
    fill(d, sr, k) {
      const take = noiseGen(7801 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, metal({ ...HAT_LINN, tauMul: 0.07, gain: 0.22, bloom: 0 }, take));
      wash(d, sr, { ...HAT_LINN_WASH, tau: 0.028, slope: 0.4, bloom: 0.001, gain: 0.4 }, k);
      hiss(d, sr, 7900 + k, { a: 0.4 * va, tau: 0.016, rise: 0.0002, f: shift([['hp', 7000, 0.7], ['peak', 10000, 1, 3]], vf) });
      onset(d, sr, 0.0002);
      sampled(d, sr, 1.2);
      return finish(d, sr, -56, 0.005);
    },
  } as Hit,
  hatOpen: {
    key: '80s/hat-open',
    secs: 0.3,
    fill(d, sr, k) {
      const take = noiseGen(8001 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, metal({ ...HAT_LINN, tauMul: 0.16, gain: 0.26 }, take));
      wash(d, sr, { ...HAT_LINN_WASH, tau: 0.07, slope: 0.5, gain: 0.5 }, k);
      hiss(d, sr, 8200 + k, { a: 0.45 * va, tau: 0.004, rise: 0.0002, f: shift([['hp', 4500]], vf) });
      onset(d, sr, 0.0002);
      sampled(d, sr, 1.2);
      return finish(d, sr, -70, 0.02);
    },
    ring: { loop: HAT_LINN_RING, level: 0.42, curve: 2, bloom: 0.01, hold: 0.03, tau: 0.42, lp: [12500, 6000, 6000, 0.45] },
  } as Hit,
  tom: gated(
    '80s/tom',
    0.5,
    0.52,
    (d, sr, k) => {
      const take = noiseGen(8301 + k * 7919);
      const [va, vf] = vary(take);
      // recorded at 110 Hz and tuned by playback rate, the way the machine's knobs did it
      ring(d, sr, skin({ f0: 110 * det(k, take), at: 0.3 + 0.04 * take(), tau: 0.36, slope: 0.7, n: 24, contact: 0.0007, spread: 0.35 }, take), bendCurve(sr, 0.22, 0.05));
      hiss(d, sr, 8400 + k, { a: 0.55 * va, tau: 0.0045, rise: 0.0003, f: shift([['hp', 700], ['peak', 2400, 0.7, 3], ['lp', 10000]], vf) });
      onset(d, sr, 0.0005);
    },
    { size: 1, t60: 1.5, mix: 0.6, damp: 0.3, gate: 0.42, release: 0.07, pre: 0.006, all: true },
    1.6,
    edge('80s/tom-edge', 110, { at: 0.34, tau: 0.06, seed: 8351, slap: 0.5, slapF: 2400, n: 30, contact: 0.0004 }),
  ),
  cowbell: {
    key: '80s/cowbell',
    secs: 0.4,
    fill(d, sr, k) {
      const take = noiseGen(8501 + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, twins(modesOf(LINN_BELL_F * det(k, take), [[1, 1, 0.1], [1.504, 0.85, 0.075], [2.47, 0.42, 0.05], [3.0, 0.4, 0.045], [3.93, 0.3, 0.032], [5.25, 0.22, 0.024], [6.8, 0.13, 0.016], [8.9, 0.07, 0.01]], take), 3, take));
      hiss(d, sr, 8600 + k, { a: 0.45 * va, tau: 0.0014, rise: 0.00015, f: shift([['hp', 1800], ['peak', 3800, 1, 3], ['lp', 11000]], vf) });
      onset(d, sr, 0.0002);
      sampled(d, sr, 1.8);
      return finish(d, sr, -56, 0.02);
    },
  } as Hit,
  rim: {
    key: '80s/rim',
    secs: 0.18,
    fill(d, sr, k) {
      const take = noiseGen(8701 + k * 7919);
      const [va, vf] = vary(take);
      const f = det(k, take);
      ring(d, sr, [{ f: (520 + 10 * take()) * f, a: 0.6, tau: 0.02 }, { f: 1080 * f, a: 0.25, tau: 0.014 }, { f: (1720 + 30 * take()) * f, a: 0.5, tau: 0.025 }, { f: 2700, a: 0.2, tau: 0.012 }, { f: 4150, a: 0.08, tau: 0.008 }]);
      hiss(d, sr, 8800 + k, { a: 0.5 * va, tau: 0.0015, rise: 0.00012, f: shift([['bp', 2500, 1.1], ['hp', 1000]], vf) });
      onset(d, sr, 0.00015);
      room(d, sr, { size: 0.7, t60: 0.5, mix: 0.12, gate: 0.1, release: 0.03 });
      sampled(d, sr, 1.5);
      return finish(d, sr, -56, 0.01);
    },
  } as Hit,
};

const LINN_FEEL: Record<string, Feel> = {
  kick: { gain: 0.75, curve: 1.4, dark: 600, open: 12000, crack: BEATER, crackGain: 0.18, pan: 0 },
  snare: { gain: 0.66, curve: 1.45, dark: 1400, open: 16000, crack: STICK, crackGain: 0.18, pan: 0 },
  clap: { gain: 0.62, curve: 1.4, dark: 1300, open: 15000, pan: 0.05 },
  hat: { gain: 0.36, curve: 1.35, dark: 2800, open: 16000, pan: -0.3 },
  tom: { gain: 0.85, curve: 1.45, dark: 600, open: 14000, bend: 0.05, bendTau: 0.04, crackGain: 0.4 },
  cowbell: { gain: 0.42, curve: 1.4, dark: 700, open: 14000, crack: STICK, crackGain: 0.3, pan: 0.35 },
  rim: { gain: 0.55, curve: 1.4, dark: 1300, open: 16000, crack: STICK, crackGain: 0.25, pan: -0.1 },
};

/**
 * A LinnDrum-era city-pop machine: a punchy kick, a fat snare in a gated room (the room wide round it), claps, closed
 * and open hats (the closed one chokes the open), toms in a gated room tuned by `pitch` (a MIDI note: 38 deep … 57
 * high, as the machine's knobs did it, by playback rate), a cowbell (D5, moved by `tune` semitones) and a side-stick
 * rim. Each sound is one voice that cuts itself off when struck again (each tom pitch its own); machines don't rush:
 * no timing jitter.
 */
const LINN_ALL: Hit[] = [LINN.kick, LINN.snare, LINN.hatClosed, LINN.clap, LINN.hatOpen, LINN.tom, LINN.cowbell, LINN.rim, STICK, BEATER];

export function makeEightiesKit(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { width?: number; tune?: number } = {}) {
  const bank = new Bank(ctx, s, r, o.width ?? 1);
  const bellRate = Math.pow(2, (o.tune ?? 0) / 12);
  const hats = new Ringer();
  const voices = new Map<string, Ringer>();
  const voice = (name: string) => voices.get(name) ?? voices.set(name, new Ringer()).get(name)!;
  const all = LINN_ALL;
  bank.prepare(all);
  return {
    /** Build every take now, in the background between frames (offline: at once); resolves when they're in hand. */
    warm: () => bank.warm(all),
    kick(t: number, vel: number) {
      onHead(bank, voice('kick'), LINN.kick, LINN_FEEL.kick, t, vel, 0.006);
    },
    snare(t: number, vel: number) {
      onHead(bank, voice('snare'), LINN.snare, LINN_FEEL.snare, t, vel, 0.006);
    },
    clap(t: number, vel: number) {
      onHead(bank, voice('clap'), LINN.clap, LINN_FEEL.clap, t, vel, 0.006);
    },
    hat(t: number, vel: number, open = false) {
      hatStroke(bank, hats, open ? LINN.hatOpen : LINN.hatClosed, LINN_FEEL.hat, t, vel, !open, [0.025, 0.05]);
    },
    tom(t: number, vel: number, pitch = 45) {
      const p = clamp(pitch, 33, 64);
      onHead(bank, voice(`tom${Math.round(p)}`), LINN.tom, LINN_FEEL.tom, t, vel, 0.006, { rate: mtof(p) / 110, pan: clamp((50 - p) / 12, -1, 1) * 0.35 });
    },
    cowbell(t: number, vel: number) {
      onHead(bank, voice('cowbell'), LINN.cowbell, LINN_FEEL.cowbell, t, vel, 0.006, { rate: bellRate });
    },
    rim(t: number, vel: number) {
      onHead(bank, voice('rim'), LINN.rim, LINN_FEEL.rim, t, vel, 0.006, { rate: bellRate });
    },
  };
}

export type EightiesKit = ReturnType<typeof makeEightiesKit>;

// ── hand percussion ─────────────────────────────────────────────────────────────────────────
// Tuned to C major as they stand (`tune` moves every drum and bell): the congas on C4 and G3, the bongos C5 and G4,
// the timbales G4 and D4, the djembe's tone E4, the surdos G1 and C2, the agogô C6 and G5, the tamborim G5.
/** A tubed shell's air on its head: the (0,1) mode 8% down, the (1,1) 4%. */
const AIR: [number, number] = [0.92, 0.96];

function conga(stroke: 'open' | 'slap' | 'mute' | 'heel', drum: 'high' | 'low'): Hit {
  const f0 = drum === 'high' ? mtof(60) : mtof(55), tau = drum === 'high' ? 0.17 : 0.2;
  const secs = { open: drum === 'high' ? 1.1 : 1.25, slap: 0.4, mute: 0.32, heel: 0.32 }[stroke];
  return {
    key: `perc/conga-${stroke}-${drum}`,
    secs,
    edge: stroke === 'open' || stroke === 'slap' ? edge(`perc/conga-edge-${drum}`, f0, { at: 0.8, tau: tau * 0.22, seed: 10701 + Math.round(f0), slap: 0.7, air: AIR }) : undefined,
    fill(d, sr, k) {
      const take = noiseGen(10001 + k * 7919 + Math.round(f0) + stroke.length * 101);
      const [va, vf] = vary(take);
      const f = f0 * det(k, take);
      const bend = bendCurve(sr, 0.035, 0.04);
      if (stroke === 'open') {
        // the fingers near the rim, off at once: the head sings at its own pitch, the overtones answering
        ring(d, sr, skin({ f0: f, at: 0.68 + 0.04 * take(), tau, slope: 0.9, n: 18, contact: 0.0014 + 0.0002 * take(), air: AIR }, take), bend);
        hiss(d, sr, 10100 + k, { a: 0.2 * va, tau: 0.005, rise: 0.0006, f: shift([['bp', 1800, 0.7]], vf) });
        hiss(d, sr, 10200 + k, { a: 0.1 * va, tau: 0.002, rise: 0.0004, f: shift([['hp', 3000], ['lp', 9000]], vf) });
        onset(d, sr, 0.0014);
      } else if (stroke === 'slap') {
        // cupped fingers slapping the edge and held there: the high modes crack, the low ones are choked
        ring(d, sr, skin({ f0: f, at: 0.87 + 0.02 * take(), tau: tau * 0.4, slope: 0.6, t01: 0.35, n: 30, contact: 0.0005, air: AIR }, take), bend);
        hiss(d, sr, 10300 + k, { a: 0.9 * va, tau: 0.009, rise: 0.0003, f: shift([['bp', 2400, 0.7], ['lp', 9000]], vf) });
        hiss(d, sr, 10400 + k, { a: 0.5 * va, tau: 0.003, rise: 0.0003, f: shift([['hp', 1000], ['lp', 10000]], vf) });
        onset(d, sr, 0.0004);
      } else if (stroke === 'mute') {
        // the fingers stay on the head: the tone, short and covered
        ring(d, sr, skin({ f0: f * 1.01, at: 0.68, tau: 0.02, slope: 0.6, n: 12, contact: 0.0018, air: AIR }, take));
        hiss(d, sr, 10500 + k, { a: 0.08 * va, tau: 0.004, rise: 0.0006, f: shift([['bp', 1000, 0.8]], vf) });
        onset(d, sr, 0.0012);
      } else {
        // the heel of the hand in the middle: a low, dull thud
        ring(d, sr, modesOf(f * 0.97, [[1, 1, 0.035], [1.66, 0.25, 0.025]], take, 0.2));
        hiss(d, sr, 10600 + k, { a: 0.12 * va, tau: 0.012, rise: 0.0025, f: shift([['lp', 500]], vf) });
        onset(d, sr, 0.003);
      }
      room(d, sr, { size: 0.55, t60: 0.4, mix: 0.05 });
      return finish(d, sr, -58, 0.02);
    },
  };
}

function bongo(drum: 'high' | 'low'): Hit {
  const f0 = drum === 'high' ? mtof(72) : mtof(67);
  return {
    key: `perc/bongo-${drum}`,
    secs: 0.45,
    edge: edge(`perc/bongo-edge-${drum}`, f0, { at: 0.8, tau: 0.025, seed: 11701 + Math.round(f0), slap: 0.7, slapF: 3000 }),
    fill(d, sr, k) {
      const take = noiseGen(11001 + k * 7919 + Math.round(f0));
      const [va, vf] = vary(take);
      ring(d, sr, skin({ f0: f0 * det(k, take), at: 0.72 + 0.04 * take(), tau: 0.07, slope: 0.6, n: 18, contact: 0.0007 }, take), bendCurve(sr, 0.05, 0.02));
      hiss(d, sr, 11100 + k + Math.round(f0), { a: 0.35 * va, tau: 0.004, rise: 0.0004, f: shift([['bp', 2600, 0.7], ['lp', 9000]], vf) });
      onset(d, sr, 0.0008);
      room(d, sr, { size: 0.5, t60: 0.35, mix: 0.05 });
      return finish(d, sr, -58, 0.02);
    },
  };
}

const TIMBALE_SHELL: ModeList = [[1620, 1, 0.2], [2710, 0.85, 0.16], [3930, 0.65, 0.13], [5230, 0.5, 0.1], [6800, 0.32, 0.08], [9100, 0.18, 0.06]];

function timbale(which: 'high' | 'low' | 'shell'): Hit {
  return {
    key: `perc/timbale-${which}`,
    secs: which === 'shell' ? 0.3 : 1.3,
    edge: which === 'shell' ? undefined : edge(`perc/timbale-edge-${which}`, which === 'high' ? mtof(67) : mtof(62), { at: 0.78, tau: 0.05, seed: 12701 + which.length, slap: 0.8, slapF: 3400, n: 30 }),
    fill(d, sr, k) {
      const take = noiseGen(12001 + k * 7919 + which.length * 37);
      const [va, vf] = vary(take);
      if (which === 'shell') {
        // the stick on the steel shell (the cascara): bright, short, the head humming faintly
        ring(d, sr, twins(modesOf(det(k, take), TIMBALE_SHELL.map(([f, a, t]) => [f, a, t * 0.3]), take), 5, take));
        ring(d, sr, skin({ f0: mtof(67) * det(k, take), at: 0.8, tau: 0.08, slope: 0.5, n: 8, contact: 0.0008, gain: 0.12 }, take));
        hiss(d, sr, 12100 + k, { a: 0.45 * va, tau: 0.0012, rise: 0.0001, f: shift([['bp', 3200, 0.9], ['hp', 1500]], vf) });
        onset(d, sr, 0.00015);
      } else {
        const f0 = (which === 'high' ? mtof(67) : mtof(62)) * det(k, take);
        // a thin head on a metal shell, struck near the rim: bright, ringing, with the shell singing under it
        ring(d, sr, skin({ f0, at: 0.75 + 0.03 * take(), tau: 0.22, slope: 0.5, n: 22, contact: 0.0005 }, take), bendCurve(sr, 0.03, 0.03));
        ring(d, sr, twins(modesOf((which === 'high' ? 1 : 0.87) * det(k, take, 6), TIMBALE_SHELL, take, 0.35, 0.38), 4, take));
        hiss(d, sr, 12200 + k, { a: 0.55 * va, tau: 0.0025, rise: 0.00015, f: shift([['hp', 1500], ['peak', 3500, 0.8, 3], ['lp', 12000]], vf) });
        onset(d, sr, 0.0003);
      }
      room(d, sr, { size: 0.55, t60: 0.45, mix: 0.06 });
      return finish(d, sr, -56, 0.04);
    },
  };
}

/** A bell or a bar: its modes in pairs, a stick's click, a little room. */
function bell(key: string, f0: number, list: ModeList, o: { split: number; secs: number; click: number; clickF: number; seed: number; damp?: number }): Hit {
  return {
    key,
    secs: o.secs,
    fill(d, sr, k) {
      const take = noiseGen(o.seed + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, twins(modesOf(f0 * det(k, take), list.map(([r, a, t]) => [r, a, t * (o.damp ?? 1)]), take), o.split, take));
      hiss(d, sr, o.seed + 500 + k, { a: o.click * va, tau: 0.0011, rise: 0.0003, f: shift([['hp', o.clickF], ['peak', o.clickF * 2, 1, 3], ['lp', 10000]], vf) });
      onset(d, sr, 0.00035);
      room(d, sr, { size: 0.55, t60: 0.5, mix: 0.04 });
      return finish(d, sr, -56, 0.02);
    },
  };
}

const COWBELL = bell('perc/cowbell', 587, [[1, 1, 0.11], [1.44, 0.75, 0.085], [2.2, 0.42, 0.06], [2.88, 0.48, 0.05], [4.0, 0.36, 0.04], [5.15, 0.28, 0.032], [7.15, 0.17, 0.024], [9.5, 0.1, 0.016]], { split: 3, secs: 0.75, click: 0.5, clickF: 2000, seed: 13001 });
/** The agogô's modes: the first four ring on in a ring (pure tones), the rest are the strike's. */
const AGOGO_MODES: ModeList = [[1, 1, 0.35], [1.51, 0.18, 0.24], [2.42, 0.4, 0.18], [3.27, 0.15, 0.13], [4.15, 0.22, 0.09], [5.6, 0.1, 0.06], [7.3, 0.06, 0.04]];

function agogo(which: 'high' | 'low'): Hit {
  const f0 = which === 'high' ? mtof(84) : mtof(79), seed = which === 'high' ? 13101 : 13201;
  return {
    key: `perc/agogo-${which}`,
    secs: 0.3,
    fill(d, sr, k) {
      const take = noiseGen(seed + k * 7919);
      const [va, vf] = vary(take);
      ring(d, sr, twins(modesOf(f0 * det(k, take, 4), AGOGO_MODES.slice(4), take, 0.35, 0.6), 3, take));
      hiss(d, sr, seed + 500 + k, { a: 0.5 * va, tau: 0.0011, rise: 0.0003, f: shift([['hp', 2800], ['peak', 5600, 1, 3], ['lp', 10000]], vf) });
      onset(d, sr, 0.00035);
      room(d, sr, { size: 0.55, t60: 0.5, mix: 0.04 });
      return finish(d, sr, -70, 0.02);
    },
    ring: {
      loop: { key: `perc/agogo-${which}-ring`, bits: 15, seed: seed + 7, parts: bellTones(f0, AGOGO_MODES.slice(0, 4).map(([r, a]) => [r, a]), 3.2, seed + 8), width: 0.3 },
      level: 3.2,
      curve: 1.45,
      bloom: 0.0006,
      hold: 0,
      tau: which === 'high' ? 0.35 : 0.4,
      lp: [10000, 3000, 1800, 0.35],
    },
  };
}

const AGOGO = { high: agogo('high'), low: agogo('low') };
const CLAVES = bell('perc/claves', mtof(98), [[1, 1, 0.07], [2.76, 0.14, 0.015], [0.52, 0.12, 0.03]], { split: 1.5, secs: 0.28, click: 0.25, clickF: 3500, seed: 13301 });
const WOODBLOCK = {
  high: bell('perc/wood-high', mtof(88), [[1, 1, 0.06], [2.4, 0.25, 0.02], [3.9, 0.1, 0.01], [0.48, 0.15, 0.03]], { split: 2, secs: 0.22, click: 0.3, clickF: 3000, seed: 13401 }),
  low: bell('perc/wood-low', mtof(81), [[1, 1, 0.07], [2.4, 0.25, 0.022], [3.9, 0.1, 0.012], [0.48, 0.15, 0.035]], { split: 2, secs: 0.24, click: 0.3, clickF: 2500, seed: 13501 }),
};

/**
 * A triangle: a bent steel rod's bending modes (free-bar ratios from 70 Hz), in and out of plane a few per cent apart,
 * each split again by the bends (the shimmer); they rise as (f / 4 kHz) to 6 kHz. Gripped, it rings 55 ms.
 */
const TRI_MODES: [number, number][] = (() => {
  const g = noiseGen(14007);
  const out: [number, number][] = [];
  for (let n = 0; n < 24; n++) {
    const beta = n === 0 ? 4.73 : n === 1 ? 7.8532 : ((2 * n + 1) * Math.PI) / 2;
    const f = 70 * Math.pow(beta / 4.73, 2);
    if (f > 15000) break;
    const a = Math.min(f, 6000) / 4000;
    out.push([f, a], [f * (1.03 + 0.05 * Math.abs(g())), a * (0.6 + 0.3 * Math.abs(g()))]);
  }
  return out;
})();

function triangle(open: boolean): Hit {
  return {
    key: `perc/triangle-${open ? 'open' : 'mute'}`,
    secs: open ? 0.25 : 0.18,
    fill(d, sr, k) {
      const take = noiseGen(14001 + k * 7919 + (open ? 0 : 500));
      const [va, vf] = vary(take);
      if (!open) ring(d, sr, twins(modesOf(1, TRI_MODES.map(([f, a]) => [f, a, 0.055 * Math.pow(f / 4000, -0.2)]), take), 4, take));
      // the beater's tick (open, the rod's modes are the ring's)
      hiss(d, sr, 14100 + k, { a: 0.18 * va, tau: 0.0006, rise: 0.0001, f: shift([['hp', 5000]], vf) });
      hiss(d, sr, 14200 + k, { a: open ? 0.08 * va : 0.02, tau: 0.02, rise: 0.0003, f: shift([['bp', 6500, 2]], vf) });
      onset(d, sr, 0.00015);
      return finish(d, sr, open ? -70 : -54, 0.02);
    },
    ring: open
      ? {
          loop: { key: 'perc/triangle-ring', bits: 16, seed: 14011, parts: TRI_MODES.flatMap(([f, a], i): [number, number, number][] => [[f, a, 0], [f + 1.5 + (i % 3), a * 0.5, 0]]), width: 0.45 },
          level: 2.4,
          curve: 1.4,
          bloom: 0.0006,
          hold: 0,
          tau: 2.5,
          lp: [16000, 6000, 6000, 2],
        }
      : undefined,
  };
}

/** The surdos' head as recorded (B♭1); the calls tune it to the primeira's or the segunda's note by playback rate. */
const SURDO_F = mtof(34);

function surdo(how: 'open' | 'mute'): Hit {
  return {
    key: `perc/surdo-${how}`,
    secs: how === 'open' ? 1.9 : 0.45,
    edge: edge('perc/surdo-edge', SURDO_F, { at: 0.4, tau: 0.06, seed: 15701, slap: 0.6, slapF: 900, n: 24, contact: 0.0012 }),
    fill(d, sr, k) {
      const take = noiseGen(15001 + k * 7919 + how.length);
      const [va, vf] = vary(take);
      const damping = how === 'open' ? 1 : 0.2;
      // a 22" bass drum and a soft mallet: a round boom that sings on
      ring(d, sr, skin({ f0: SURDO_F * det(k, take), at: 0.35 + 0.05 * take(), tau: 0.3 * damping, slope: 0.6, n: 16, contact: 0.0028 }, take), bendCurve(sr, 0.05, 0.06));
      hiss(d, sr, 15100 + k, { a: 0.22 * va, tau: 0.012, rise: 0.0018, f: shift([['lp', 1400], ['peak', 600, 0.8, 3]], vf) });
      if (how === 'mute') hiss(d, sr, 15200 + k, { a: 0.08 * va, tau: 0.008, rise: 0.002, at: 0.012, f: shift([['bp', 800, 0.9]], vf) });
      onset(d, sr, 0.0025);
      room(d, sr, { size: 0.7, t60: 0.5, mix: 0.04, damp: 0.5 });
      return finish(d, sr, -58, 0.03);
    },
  };
}

function djembe(stroke: 'bass' | 'tone' | 'slap'): Hit {
  return {
    key: `perc/djembe-${stroke}`,
    secs: { bass: 0.55, tone: 0.55, slap: 0.32 }[stroke],
    edge: stroke === 'bass' ? undefined : edge('perc/djembe-edge', mtof(64), { at: 0.82, tau: 0.02, seed: 16701, slap: 0.8, slapF: 2800, air: AIR }),
    fill(d, sr, k) {
      const take = noiseGen(16001 + k * 7919 + stroke.length * 53);
      const [va, vf] = vary(take);
      const f0 = mtof(64) * det(k, take);
      if (stroke === 'bass') {
        // the palm in the middle: the goblet's air (a Helmholtz boom) and the head's low modes, softly
        ring(d, sr, [{ f: 76 * det(k, take), a: 1, tau: 0.11 }]);
        ring(d, sr, skin({ f0: f0 * 1.09, at: 0.12, tau: 0.08, slope: 0.9, n: 6, contact: 0.003, gain: 0.35 }, take));
        hiss(d, sr, 16100 + k, { a: 0.12 * va, tau: 0.008, rise: 0.002, f: shift([['lp', 900]], vf) });
        onset(d, sr, 0.002);
      } else if (stroke === 'tone') {
        // the fingers flat near the edge, off at once: the head's own note, the goblet humming under it
        ring(d, sr, skin({ f0, at: 0.68 + 0.04 * take(), tau: 0.08, slope: 0.85, n: 18, contact: 0.0014, air: AIR }, take), bendCurve(sr, 0.03, 0.03));
        ring(d, sr, [{ f: 76, a: 0.2, tau: 0.08 }]);
        hiss(d, sr, 16200 + k, { a: 0.25 * va, tau: 0.004, rise: 0.0006, f: shift([['bp', 2000, 0.8], ['lp', 9000]], vf) });
        onset(d, sr, 0.0012);
      } else {
        // the fingertips cracking on the edge: the high modes, the low ones choked
        ring(d, sr, skin({ f0, at: 0.87 + 0.02 * take(), tau: 0.04, slope: 0.6, t01: 0.35, n: 30, contact: 0.0005, air: AIR }, take), bendCurve(sr, 0.04, 0.02));
        hiss(d, sr, 16300 + k, { a: 0.7 * va, tau: 0.008, rise: 0.0003, f: shift([['bp', 2600, 0.6]], vf) });
        hiss(d, sr, 16400 + k, { a: 0.5 * va, tau: 0.003, rise: 0.0002, f: shift([['hp', 1500]], vf) });
        onset(d, sr, 0.0003);
      }
      room(d, sr, { size: 0.6, t60: 0.45, mix: 0.05 });
      return finish(d, sr, -58, 0.02);
    },
  };
}

function tamborim(muted: boolean): Hit {
  return {
    key: `perc/tamborim-${muted ? 'muted' : 'open'}`,
    secs: muted ? 0.14 : 0.32,
    fill(d, sr, k) {
      const take = noiseGen(17501 + k * 7919 + (muted ? 300 : 0));
      const [va, vf] = vary(take);
      // a 6" frame drum at a high tension under a stick (a finger behind the head mutes it)
      ring(d, sr, skin({ f0: mtof(79) * det(k, take), at: 0.5 + 0.05 * take(), tau: muted ? 0.015 : 0.045, slope: 0.7, n: 10, contact: 0.0004 }, take), bendCurve(sr, 0.03, 0.01));
      hiss(d, sr, 17600 + k, { a: 0.5 * va, tau: 0.0016, rise: 0.0001, f: shift([['hp', 1500], ['peak', 4000, 0.8, 4], ['lp', 11000]], vf) });
      onset(d, sr, 0.0002);
      room(d, sr, { size: 0.5, t60: 0.35, mix: 0.04 });
      return finish(d, sr, -58, 0.015);
    },
  };
}

/** The shaker's gestures, by length (s): a call picks the nearest. */
const SHAKES = [0.05, 0.09, 0.15, 0.24];

function shaker(len: number): Hit {
  return {
    key: `perc/shaker-${len}`,
    secs: len + 0.16,
    fill(d, sr, k) {
      // a ganzá: metal beads in a tube; they roll, then hit the end
      beads(d, sr, { seed: 17001 + k * 7919 + Math.round(len * 1000), rate: 2600, len, jolt: 0.75, settle: 0.018, grain: 0.0012, res: [[5400, 1.1, 1], [9000, 1.5, 0.45], [2700, 1.2, 0.12]] });
      onset(d, sr, 0.001);
      bq(d, sr, 'lp', 12000, 0.6);
      return finish(d, sr, -54, 0.02);
    },
  };
}

const CABASA: Hit = {
  key: 'perc/cabasa',
  secs: 0.22,
  fill(d, sr, k) {
    beads(d, sr, { seed: 18001 + k * 7919, rate: 9000, len: 0.035, jolt: 0.5, settle: 0.028, grain: 0.0005, res: [[6800, 0.8, 1], [11000, 1.2, 0.5], [3400, 1, 0.15]] });
    onset(d, sr, 0.0008);
    bq(d, sr, 'lp', 12500, 0.6);
    return finish(d, sr, -54, 0.02);
  },
};

/** Nine pairs of jingles, each a tiny cymbal: four inharmonic modes, damped short by its neighbour. */
const JINGLES: [number, number, number][] = (() => {
  const g = noiseGen(777);
  const out: [number, number, number][] = [];
  for (let j = 0; j < 9; j++) {
    const f0 = 2300 * Math.pow(2, (1.15 * (j + 0.45 * g())) / 9);
    for (const [r, a] of [[1, 1], [1.62, 0.75], [2.38, 0.55], [3.1, 0.38]]) out.push([f0 * r * (1 + 0.012 * g()), 0.014 * Math.pow(r, -0.3), a * 0.22]);
  }
  return out;
})();

function tambourine(how: 'shake' | 'hit'): Hit {
  return {
    key: `perc/tambourine-${how}`,
    secs: how === 'hit' ? 0.5 : 0.36,
    fill(d, sr, k) {
      const take = noiseGen(19001 + k * 7919 + how.length);
      const seed = 19100 + k * 7 + how.length;
      if (how === 'hit') {
        // a hand on the head: the skin's thump, and every jingle at once, then their rattle
        ring(d, sr, skin({ f0: 240 * det(k, take), at: 0.5, tau: 0.035, slope: 0.8, n: 8, contact: 0.0012, gain: 0.35 }, take));
        hiss(d, sr, seed + 1, { a: 0.25, tau: 0.005, rise: 0.0005, f: [['bp', 1200, 0.8]] });
        beads(d, sr, { seed, rate: 1800, len: 0.004, jolt: 1, settle: 0.07, grain: 0.0008, res: [[8000, 1.2, 0.25]], jingles: JINGLES });
      } else beads(d, sr, { seed, rate: 1500, len: 0.07, jolt: 0.7, settle: 0.05, grain: 0.0008, res: [[8000, 1.2, 0.25]], jingles: JINGLES });
      onset(d, sr, 0.0006);
      return finish(d, sr, -54, 0.03);
    },
  };
}

const PERC = {
  conga: {} as Record<string, Hit>,
  bongo: { high: bongo('high'), low: bongo('low') },
  timbale: { high: timbale('high'), low: timbale('low'), shell: timbale('shell') },
  triangle: { open: triangle(true), mute: triangle(false) },
  surdo: { open: surdo('open'), mute: surdo('mute') },
  djembe: { bass: djembe('bass'), tone: djembe('tone'), slap: djembe('slap') },
  tambourine: { shake: tambourine('shake'), hit: tambourine('hit') },
  tamborim: { open: tamborim(false), muted: tamborim(true) },
  shaker: SHAKES.map(shaker),
};
for (const st of ['open', 'slap', 'mute', 'heel'] as const) for (const dr of ['high', 'low'] as const) PERC.conga[`${st}-${dr}`] = conga(st, dr);

const PERC_FEEL = {
  congaOpen: { gain: 0.8, curve: 1.4, dark: 200, open: 12000, bend: 0.03, bendTau: 0.04, crackGain: 0.5, detune: 0.005 },
  congaSlap: { gain: 0.8, curve: 1.4, dark: 500, open: 16000, bend: 0.03, bendTau: 0.02, crackGain: 0.5, detune: 0.005 },
  congaMute: { gain: 0.7, curve: 1.4, dark: 180, open: 9000, crack: HAND, crackGain: 0.3, detune: 0.005 },
  congaHeel: { gain: 0.65, curve: 1.4, dark: 150, open: 5000, crack: HAND, crackGain: 0.15, detune: 0.005 },
  bongo: { gain: 0.65, curve: 1.4, dark: 300, open: 14000, bend: 0.04, bendTau: 0.02, crackGain: 0.5, detune: 0.005 },
  timbale: { gain: 0.65, curve: 1.4, dark: 500, open: 18000, bend: 0.03, bendTau: 0.03, crackGain: 0.45, detune: 0.005 },
  shell: { gain: 0.55, curve: 1.4, dark: 900, open: 18000, crack: STICK, crackGain: 0.35 },
  cowbell: { gain: 0.45, curve: 1.4, dark: 500, open: 15000, crack: STICK, crackGain: 0.35 },
  agogo: { gain: 0.42, curve: 1.4, dark: 700, open: 16000, crack: TICK, crackGain: 0.35 },
  claves: { gain: 0.48, curve: 1.4, dark: 900, open: 16000, crack: TICK, crackGain: 0.4 },
  shaker: { gain: 0.3, curve: 1.3, dark: 3000, open: 16000 },
  cabasa: { gain: 0.3, curve: 1.3, dark: 3500, open: 18000 },
  tambourine: { gain: 0.36, curve: 1.35, dark: 2200, open: 18000 },
  triangle: { gain: 0.28, curve: 1.3, dark: 2500, open: 20000, crack: TICK, crackGain: 0.2 },
  surdo: { gain: 0.72, curve: 1.5, dark: 250, open: 6000, bend: 0.04, bendTau: 0.06, crackGain: 0.45, detune: 0.005 },
  djembeBass: { gain: 0.82, curve: 1.45, dark: 300, open: 6000, crack: HAND, crackGain: 0.2, detune: 0.005 },
  djembe: { gain: 0.75, curve: 1.4, dark: 250, open: 14000, bend: 0.03, bendTau: 0.025, crackGain: 0.5, detune: 0.005 },
  woodblock: { gain: 0.5, curve: 1.4, dark: 600, open: 16000, crack: TICK, crackGain: 0.4 },
  tamborim: { gain: 0.5, curve: 1.4, dark: 600, open: 16000, crack: STICK, crackGain: 0.35, detune: 0.005 },
} satisfies Record<string, Feel>;

/** Where each instrument stands (left −1 … right 1) before `width`; `o.pan` moves any of them. */
const PERC_PAN = {
  conga: -0.35, bongo: 0.35, timbale: 0.15, cowbell: 0.3, agogo: -0.3, claves: 0.1, shaker: 0.45, cabasa: -0.45,
  tambourine: 0.25, triangle: -0.2, surdo: 0, djembe: -0.15, woodblock: 0.2, tamborim: 0.2,
};
export type PercName = keyof typeof PERC_PAN;

/**
 * Hand percussion, tuned to C major as it stands: congas (open, slap, mute, heel; the conga on C4, the tumba on G3),
 * bongos (C5 / G4), timbales (G4 / D4, and the shell's cascara), a mambo cowbell, an agogô (C6 / G5), claves, a ganzá
 * shaker (`len` = the gesture's length in seconds), a cabasa, a tambourine (shaken or struck), a triangle (open, or
 * gripped: that damps the open one), two surdos (the primeira on G1, the segunda a fourth up on C2: play the segunda on
 * the one and the primeira, accented, on the two; a muted stroke is the hand on the head and damps the boom), a djembe
 * (bass, tone on E4, slap), woodblocks and a tamborim (open or muted). A hand on a drum damps what it still rang
 * with. `tune` moves every drum and bell by semitones (a G major track: −5 or +7); `surdo` puts the two surdos on other
 * MIDI notes, [primeira, segunda] (G major: [31, 38], the tonic and the fifth); `width` scales the spread, `pan`
 * places any instrument.
 */
const PERC_ALL: Hit[] = [
  ...PERC.shaker, PERC.surdo.open, PERC.surdo.mute, PERC.conga['open-high'], PERC.conga['open-low'], PERC.djembe.tone, PERC.djembe.bass,
  PERC.djembe.slap, AGOGO.high, AGOGO.low, PERC.tamborim.open, PERC.tamborim.muted, PERC.triangle.open, PERC.triangle.mute, CABASA,
  ...Object.values(PERC.conga), ...Object.values(PERC.bongo), ...Object.values(PERC.timbale), ...Object.values(PERC.tambourine),
  COWBELL, CLAVES, WOODBLOCK.high, WOODBLOCK.low, STICK, HAND, TICK,
].filter((h, i, list) => list.indexOf(h) === i);

export function makePercussion(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { width?: number; pan?: Partial<Record<PercName, number>>; tune?: number; surdo?: [number, number] } = {}) {
  const bank = new Bank(ctx, s, r, o.width ?? 1);
  const at = (name: PercName) => o.pan?.[name] ?? PERC_PAN[name];
  const tune = Math.pow(2, (o.tune ?? 0) / 12);
  const surdos = o.surdo ?? [31 + (o.tune ?? 0), 36 + (o.tune ?? 0)];
  const heads = new Map<string, Ringer>();
  const head = (name: string) => heads.get(name) ?? heads.set(name, new Ringer()).get(name)!;
  const tri = new Ringer();
  const bells = { high: new Ringer(), low: new Ringer() };
  const all = PERC_ALL;
  bank.prepare(all);
  return {
    /** Build every take now, in the background between frames (offline: at once); resolves when they're in hand. */
    warm: () => bank.warm(all),
    conga(t: number, vel: number, stroke: 'open' | 'slap' | 'mute' | 'heel' = 'open', drum: 'high' | 'low' = 'high') {
      const feel = { open: PERC_FEEL.congaOpen, slap: PERC_FEEL.congaSlap, mute: PERC_FEEL.congaMute, heel: PERC_FEEL.congaHeel }[stroke];
      const fade = { open: 0.03, slap: 0.012, mute: 0.008, heel: 0.015 }[stroke];
      onHead(bank, head(`conga-${drum}`), PERC.conga[`${stroke}-${drum}`], feel, t, vel, fade, { rate: tune, pan: at('conga') + (drum === 'low' ? -0.12 : 0.05) });
    },
    bongo(t: number, vel: number, drum: 'high' | 'low' = 'high') {
      onHead(bank, head(`bongo-${drum}`), PERC.bongo[drum], PERC_FEEL.bongo, t, vel, 0.02, { rate: tune, pan: at('bongo') + (drum === 'low' ? 0.1 : 0) });
    },
    timbale(t: number, vel: number, which: 'high' | 'low' | 'shell' = 'high') {
      const o2 = { rate: tune, pan: at('timbale') + (which === 'low' ? 0.1 : 0) };
      if (which === 'shell') bank.play(PERC.timbale.shell, PERC_FEEL.shell, t, vel, o2);
      else bank.play(PERC.timbale[which], PERC_FEEL.timbale, t, vel, o2);
    },
    cowbell(t: number, vel: number) {
      onHead(bank, head('cowbell'), COWBELL, PERC_FEEL.cowbell, t, vel, 0.05, { rate: tune, pan: at('cowbell') });
    },
    agogo(t: number, vel: number, bellNo: 'high' | 'low' = 'high') {
      ringOn(bank, bells[bellNo], AGOGO[bellNo], PERC_FEEL.agogo, t, vel, { rate: tune, pan: at('agogo') + (bellNo === 'low' ? -0.06 : 0.06) });
    },
    claves(t: number, vel: number) {
      bank.play(CLAVES, PERC_FEEL.claves, t, vel, { rate: tune, pan: at('claves') });
    },
    shaker(t: number, vel: number, len = 0.09) {
      let best = 0;
      SHAKES.forEach((x, i) => (Math.abs(x - len) < Math.abs(SHAKES[best] - len) ? (best = i) : 0));
      bank.play(PERC.shaker[best], PERC_FEEL.shaker, t, vel, { pan: at('shaker') });
    },
    cabasa(t: number, vel: number) {
      bank.play(CABASA, PERC_FEEL.cabasa, t, vel, { pan: at('cabasa') });
    },
    tambourine(t: number, vel: number, how: 'shake' | 'hit' = 'shake') {
      bank.play(PERC.tambourine[how], PERC_FEEL.tambourine, t, vel, { pan: at('tambourine') });
    },
    triangle(t: number, vel: number, open = true) {
      hatStroke(bank, tri, PERC.triangle[open ? 'open' : 'mute'], PERC_FEEL.triangle, t, vel, !open, [0.03, 0.05]);
    },
    /** `drum`: the primeira (low, the accent on the two) or the segunda (a fourth up, the one). */
    surdo(t: number, vel: number, how: 'open' | 'mute' = 'open', drum: 'primeira' | 'segunda' = 'primeira') {
      const note = surdos[drum === 'primeira' ? 0 : 1];
      onHead(bank, head(`surdo-${drum}`), PERC.surdo[how], PERC_FEEL.surdo, t, vel, how === 'mute' ? 0.04 : 0.08, { rate: mtof(note) / SURDO_F, pan: at('surdo') + (drum === 'segunda' ? 0.12 : -0.05) });
    },
    djembe(t: number, vel: number, stroke: 'bass' | 'tone' | 'slap' = 'tone') {
      onHead(bank, head('djembe'), PERC.djembe[stroke], stroke === 'bass' ? PERC_FEEL.djembeBass : PERC_FEEL.djembe, t, vel, stroke === 'slap' ? 0.012 : 0.025, { rate: tune, pan: at('djembe') });
    },
    woodblock(t: number, vel: number, which: 'high' | 'low' = 'high') {
      bank.play(WOODBLOCK[which], PERC_FEEL.woodblock, t, vel, { rate: tune, pan: at('woodblock') + (which === 'low' ? -0.08 : 0) });
    },
    /** The samba's tamborim: `muted` = a finger behind the head (the short "tek" between the open strokes). */
    tamborim(t: number, vel: number, muted = false) {
      onHead(bank, head('tamborim'), PERC.tamborim[muted ? 'muted' : 'open'], PERC_FEEL.tamborim, t, vel, 0.01, { rate: tune, pan: at('tamborim') });
    },
  };
}

export type Percussion = ReturnType<typeof makePercussion>;

// ── demos (tools/audio/render.mjs fn …; dev only) ───────────────────────────────────────────
/** Steps of a groove: `step` seconds each, odd steps late by `swing` of a step, a few milliseconds of hands. */
function grid(lab: Lab, bpm: number, per: number, swing = 0, human = 0.004) {
  const step = 60 / bpm / per;
  return (bar: number, s: number, steps = 16) => lab.t0 + (bar * steps + s) * step + (s % 2 ? swing * step : 0) + (lab.r() - 0.5) * human;
}

/** Hits from a string, one character a step: a digit = velocity in tenths, `x` = 1, `.` or space-less rest. */
function hits(p: string, fn: (step: number, vel: number) => void): void {
  const s = p.replace(/\s/g, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '.') continue;
    fn(i, c === 'x' ? 1 : Number(c) / 10);
  }
}

/** Every hit in the family, as `demoDrumHits` plays them: [the gap after each (s), what it is, how to play it]. */
const HIT_LIST = (kits: { funk: FunkKit; brush: BrushKit; linn: EightiesKit; perc: Percussion }): [number, string, (t: number, v: number) => void][] => {
  const { funk, brush, linn, perc } = kits;
  return [
    [0.7, 'funk kick', (t, v) => funk.kick(t, v)], [0.7, 'funk snare', (t, v) => funk.snare(t, v)], [0.7, 'funk rim', (t, v) => funk.snare(t, v, 'rim')],
    [0.7, 'funk ghost', (t, v) => funk.snare(t, v, 'ghost')], [0.7, 'funk cross', (t, v) => funk.snare(t, v, 'cross')], [0.7, 'funk hat', (t, v) => funk.hat(t, v)],
    [0.9, 'funk hat half', (t, v) => funk.hat(t, v, 'half')], [2.5, 'funk hat open', (t, v) => funk.hat(t, v, 'open')], [0.7, 'funk pedal', (t, v) => funk.hat(t, v, 'pedal')],
    [3.2, 'funk ride', (t, v) => funk.ride(t, v)], [3.2, 'funk bell', (t, v) => funk.ride(t, v, 'bell')], [3.2, 'funk crash', (t, v) => funk.crash(t, v)],
    [0.9, 'funk tom high', (t, v) => funk.tom(t, v, 'high')], [1, 'funk tom mid', (t, v) => funk.tom(t, v, 'mid')], [1.2, 'funk tom floor', (t, v) => funk.tom(t, v, 'floor')],
    [0.7, 'brush tap', (t, v) => brush.tap(t, v)], [1, 'brush swish', (t, v) => brush.swish(t, 0.8, v)], [0.7, 'brush snare', (t, v) => brush.snare(t, v)],
    [0.7, 'brush kick', (t, v) => brush.kick(t, v)], [3.2, 'brush ride', (t, v) => brush.ride(t, v)],
    [0.7, '80s kick', (t, v) => linn.kick(t, v)], [0.7, '80s snare', (t, v) => linn.snare(t, v)], [0.7, '80s clap', (t, v) => linn.clap(t, v)],
    [0.7, '80s hat', (t, v) => linn.hat(t, v)], [2, '80s hat open', (t, v) => linn.hat(t, v, true)], [0.8, '80s tom', (t, v) => linn.tom(t, v, 45)],
    [0.7, '80s cowbell', (t, v) => linn.cowbell(t, v)], [0.7, '80s rim', (t, v) => linn.rim(t, v)],
    [1.2, 'conga open', (t, v) => perc.conga(t, v, 'open')], [1.3, 'conga open low', (t, v) => perc.conga(t, v, 'open', 'low')], [0.6, 'conga slap', (t, v) => perc.conga(t, v, 'slap')],
    [0.6, 'conga mute', (t, v) => perc.conga(t, v, 'mute')], [0.6, 'conga heel', (t, v) => perc.conga(t, v, 'heel')], [0.6, 'bongo', (t, v) => perc.bongo(t, v)],
    [0.6, 'bongo low', (t, v) => perc.bongo(t, v, 'low')], [1.4, 'timbale', (t, v) => perc.timbale(t, v)], [1.4, 'timbale low', (t, v) => perc.timbale(t, v, 'low')],
    [0.6, 'timbale shell', (t, v) => perc.timbale(t, v, 'shell')], [0.9, 'cowbell', (t, v) => perc.cowbell(t, v)], [1.6, 'agogo', (t, v) => perc.agogo(t, v)],
    [1.6, 'agogo low', (t, v) => perc.agogo(t, v, 'low')], [0.5, 'claves', (t, v) => perc.claves(t, v)], [0.5, 'shaker', (t, v) => perc.shaker(t, v)],
    [0.6, 'shaker long', (t, v) => perc.shaker(t, v, 0.24)], [0.5, 'cabasa', (t, v) => perc.cabasa(t, v)], [0.6, 'tambourine', (t, v) => perc.tambourine(t, v)],
    [0.7, 'tambourine hit', (t, v) => perc.tambourine(t, v, 'hit')], [3.2, 'triangle', (t, v) => perc.triangle(t, v)], [0.5, 'triangle mute', (t, v) => perc.triangle(t, v, false)],
    [2, 'surdo', (t, v) => perc.surdo(t, v)], [1.8, 'surdo segunda', (t, v) => perc.surdo(t, v, 'open', 'segunda')], [0.6, 'surdo mute', (t, v) => perc.surdo(t, v, 'mute')],
    [0.6, 'djembe bass', (t, v) => perc.djembe(t, v, 'bass')], [0.6, 'djembe tone', (t, v) => perc.djembe(t, v, 'tone')], [0.5, 'djembe slap', (t, v) => perc.djembe(t, v, 'slap')],
    [0.4, 'woodblock', (t, v) => perc.woodblock(t, v)], [0.4, 'woodblock low', (t, v) => perc.woodblock(t, v, 'low')], [0.5, 'tamborim', (t, v) => perc.tamborim(t, v)],
    [0.4, 'tamborim muted', (t, v) => perc.tamborim(t, v, true)],
  ];
};

/** Every hit alone, loud (0.8) then soft (0.35), a gap apart (longer for what rings): for measuring. */
export function demoDrumHits(lab: Lab): void {
  const { ctx, r } = lab;
  const kits = {
    funk: makeFunkKit(ctx, lab.strip('funk', { gain: 1 }), r),
    brush: makeBrushKit(ctx, lab.strip('brush', { gain: 1 }), r),
    linn: makeEightiesKit(ctx, lab.strip('linn', { gain: 1 }), r),
    perc: makePercussion(ctx, lab.strip('perc', { gain: 1 }), r),
  };
  let t = lab.t0;
  for (const [gap, , fn] of HIT_LIST(kits)) {
    fn(t, 0.8);
    fn(t + gap, 0.35);
    t += gap * 2;
  }
}

type Line = [string, (t: number, v: number) => void];

/** A bar of lines (pattern, instrument), velocities scaled by `k`. */
function bar(at: (bar: number, s: number) => number, b: number, lines: Line[], k = 1): void {
  for (const [p, fn] of lines) hits(p, (s, v) => fn(at(b, s), Math.min(1, v * k)));
}

/** A 94 bpm garage-funk groove: ghost notes, an open hat, sloshy hats with cross-stick, a ride with rim shots and bell, a soft bar, tom fills, a roll into the crash. */
export function demoFunkKit(lab: Lab): void {
  const kit = makeFunkKit(lab.ctx, lab.strip('kit', { gain: 0.48, rev: 0.06 }), lab.r);
  const at = grid(lab, 94, 4, 0.1, 0.005);
  const K: Line[1] = (t, v) => kit.kick(t, v), S: Line[1] = (t, v) => kit.snare(t, v), G: Line[1] = (t, v) => kit.snare(t, v, 'ghost');
  const X: Line[1] = (t, v) => kit.snare(t, v, 'cross'), R: Line[1] = (t, v) => kit.snare(t, v, 'rim');
  const H: Line[1] = (t, v) => kit.hat(t, v), O: Line[1] = (t, v) => kit.hat(t, v, 'open'), F: Line[1] = (t, v) => kit.hat(t, v, 'half');
  const P: Line[1] = (t, v) => kit.hat(t, v, 'pedal'), B: Line[1] = (t, v) => kit.ride(t, v), L: Line[1] = (t, v) => kit.ride(t, v, 'bell');
  const T1: Line[1] = (t, v) => kit.tom(t, v, 'high'), T2: Line[1] = (t, v) => kit.tom(t, v, 'mid'), T3: Line[1] = (t, v) => kit.tom(t, v, 'floor');
  const C: Line[1] = (t, v) => kit.crash(t, v);
  // A
  bar(at, 0, [['6242 6242 6242 6242', H], ['9..7 ..8. ..9. ....', K], ['.... 9... .... 9...', S], ['...2 ...2 .2.3 ...2', G]]);
  // A': the open hat on the "and" of four, choked by the next bar's first hat
  bar(at, 1, [['6242 6242 6242 62..', H], ['.... .... .... ..6.', O], ['9..7 ..8. ..9. ..7.', K], ['.... 9... .... 9...', S], ['..2. ...2 .2.3 .3.2', G]]);
  // B: sloshy half-open eighths, cross-stick backbeats
  bar(at, 2, [['6.4. 6.4. 6.4. 6.4.', F], ['9..7 ..8. .69. ....', K], ['.... 8... .... 8...', X], ['...2 ...2 ...2 ..2.', G]]);
  // A, then a fill round the toms
  bar(at, 3, [['6242 6242 .... ....', H], ['9..7 ..8. .... ..8.', K], ['.... 9... 85.. ....', S], ['...2 ...2 .... ....', G], ['.... .... ..86 ....', T1], ['.... .... .... 96..', T2], ['.... .... .... ..97', T3]]);
  // C: crash, ride with the bell on the "ands", rim shots, the foot on 2 and 4
  bar(at, 4, [['x... .... .... ....', C], ['7.5. 7... 7.5. 7...', B], ['.... ..7. .... ..7.', L], ['.... 6... .... 6...', P], ['9..7 ..8. ..9. .7..', K], ['.... x... .... x...', R], ['...3 ...2 .3.. ...3', G]]);
  // soft: the same groove at half strength, cross-stick
  bar(at, 5, [['6242 6242 6242 6242', H], ['9..7 ..8. ..9. ....', K], ['.... 9... .... 9...', X], ['...3 ..3. .3.3 ..3.', G]], 0.5);
  // a roll from ghosts to full, round the toms, four on the floor under it
  bar(at, 6, [['2233 44.. .... ....', G], ['.... ..56 6789 ....', S], ['.... .... .... 9...', T1], ['.... .... .... .9..', T2], ['.... .... .... ..99', T3], ['9... 9... 9... 9...', K], ['.... 5... .... 5...', P]]);
  bar(at, 7, [['x...', C], ['x...', K], ['9...', S]]);
}

/** A 132 bpm bossa nova on brushes: sweeps and taps, the bossa kick, the clave on the snare, a samba-jazz ride, a soft passage. */
export function demoBrushes(lab: Lab): void {
  const kit = makeBrushKit(lab.ctx, lab.strip('brushes', { gain: 0.85, rev: 0.12 }), lab.r);
  const at = grid(lab, 132, 4, 0.04, 0.006);
  const half = (60 / 132) * 2;
  const W: Line[1] = (t, v) => kit.swish(t, half * 0.94, v), T: Line[1] = (t, v) => kit.tap(t, v), S: Line[1] = (t, v) => kit.snare(t, v);
  const K: Line[1] = (t, v) => kit.kick(t, v), R: Line[1] = (t, v) => kit.ride(t, v);
  const kick = '4... ..3. 4... ..3.';
  const clave = ['5... ..5. .... 5...', '.... 5... ..5. ....'];
  for (let b = 0; b < 4; b++) bar(at, b, [['6... .... 6... ....', W], ['5.3. 4.3. 5.3. 4.33', T], [kick, K], [clave[b % 2], S]]);
  for (let b = 4; b < 8; b++) bar(at, b, [['7.45 7.45 7.45 7.45', R], [kick, K], [clave[b % 2], S], ['.... 4... .... 4...', T]], 0.6 + 0.12 * (b - 4));
  for (let b = 8; b < 10; b++) bar(at, b, [['5... .... 5... ....', W], ['3.2. 3.2. 3.2. 3.2.', T], [kick, K]], 0.55);
  bar(at, 10, [['8...', R], ['4...', K], ['7...', S], ['5...', W]]);
}

/** A 114 bpm city-pop beat on the machine: open hats on the offbeat, gated snare and claps, cowbell, rim, gated tom fills, a clap break. */
export function demoEighties(lab: Lab): void {
  const kit = makeEightiesKit(lab.ctx, lab.strip('machine', { gain: 0.34, rev: 0.1 }), lab.r);
  const at = grid(lab, 114, 4, 0, 0);
  const K: Line[1] = (t, v) => kit.kick(t, v), S: Line[1] = (t, v) => kit.snare(t, v), C: Line[1] = (t, v) => kit.clap(t, v);
  const H: Line[1] = (t, v) => kit.hat(t, v), O: Line[1] = (t, v) => kit.hat(t, v, true), B: Line[1] = (t, v) => kit.cowbell(t, v);
  const M: Line[1] = (t, v) => kit.rim(t, v);
  const tom = (p: number): Line[1] => (t, v) => kit.tom(t, v, p);
  const hats: Line[] = [['6343 63.3 6343 63.3', H], ['.... ..6. .... ..6.', O]];
  const kick = 'x... ..7. x..6 ....';
  bar(at, 0, [...hats, [kick, K]], 0.8);
  bar(at, 1, [...hats, [kick, K], ['.... x... .... x...', S]]);
  bar(at, 2, [...hats, [kick, K], ['.... x... .... x...', S], ['.... .... .... x...', C], ['x..6 ..7. .6.. 7.6.', B]]);
  bar(at, 3, [['6343 63.3 6343 ....', H], ['.... ..6. .... ....', O], [kick, K], ['.... x... .... ....', S], ['x..6 ..7. .6.. ....', B], ['.... .... .... 9...', tom(55)], ['.... .... .... .9..', tom(52)], ['.... .... .... ..9.', tom(48)], ['.... .... .... ...x', tom(43)]]);
  for (let b = 4; b < 6; b++) bar(at, b, [...hats, ['x..7 ..x. ..7. x...', K], ['.... x... .... x...', S], ['.... x... .... x...', C], ['..5. .... ..5. ..5.', M], ['x..6 ..7. .6.. 7.6.', B]]);
  // the break: claps and the kick alone
  bar(at, 6, [['x..x ..x. ..x. x...', C], ['x... .... x... ....', K]]);
  bar(at, 7, [...hats, [kick, K], ['.... x... 5566 78xx', S], ['.... x... .... ....', C]]);
  bar(at, 8, [['x...', K], ['x...', S], ['x...', C], ['8...', O], ['8...', B]]);
}

/** A samba batucada (the surdos' call and answer, ganzá, tamborim, agogô, tambourine, cabasa, a timbale call), then a West African 12/8 with the standard bell, djembe, congas, shaker, bongos, claves and triangle. */
export function demoPercussion(lab: Lab): void {
  const p = makePercussion(lab.ctx, lab.strip('perc', { gain: 0.42, rev: 0.12 }), lab.r);
  // samba: 2/4 bars of sixteenths at 104
  const g16 = grid(lab, 104, 4, 0.06, 0.005);
  const sam = (b: number, s: number) => g16(b, s, 8);
  const S1: Line[1] = (t, v) => p.surdo(t, v, 'open', 'segunda'), S2: Line[1] = (t, v) => p.surdo(t, v), SM: Line[1] = (t, v) => p.surdo(t, v, 'mute');
  const SM2: Line[1] = (t, v) => p.surdo(t, v, 'mute', 'segunda');
  const GZ: Line[1] = (t, v) => p.shaker(t, v, v > 0.6 ? 0.09 : 0.05), AH: Line[1] = (t, v) => p.agogo(t, v), AL: Line[1] = (t, v) => p.agogo(t, v, 'low');
  const TS: Line[1] = (t, v) => p.tambourine(t, v), TH: Line[1] = (t, v) => p.tambourine(t, v, 'hit'), CB: Line[1] = (t, v) => p.cabasa(t, v);
  const TO: Line[1] = (t, v) => p.tamborim(t, v), TM: Line[1] = (t, v) => p.tamborim(t, v, true);
  const TB: Line[1] = (t, v) => p.timbale(t, v), TL: Line[1] = (t, v) => p.timbale(t, v, 'low');
  for (let b = 0; b < 8; b++) {
    // the segunda opens on the one, the primeira answers on the two; each hand-mutes its drum on the other beat
    const lines: Line[] = [['7... ..3.', S1], ['.... 4...', SM2], ['.... 9...', S2], ['4... ....', SM], ['4348 4348', GZ], ['5.4. 7.4.', TH], ['.3.. .3..', TS], ['..5. ..5.', CB]];
    if (b % 2) lines.push(['...4 ..5.', SM]);
    lines.push(b % 2 ? ['x.x. x.x.', TO] : ['x.xx .x.x', TO], b % 2 ? ['.4.4 .4.4', TM] : ['.4.. 4.4.', TM]);
    lines.push(b % 2 ? ['.x.. x.x.', AH] : ['x..x ..x.', AH], b % 2 ? ['x.x. ...x', AL] : ['.x.. x..x', AL]);
    if (b === 7) lines.push(['.... 8877', TB], ['.... ..x.', TL]);
    bar(sam, b, lines, b < 2 ? 0.75 : 1);
  }
  // 12/8: eighths at 112 dotted-quarter beats, starting after the samba's eight bars
  const start = lab.t0 + 64 * (60 / 104 / 4) + 0.15;
  const step = 60 / 112 / 3;
  const ab = (b: number, s: number) => start + (b * 12 + s) * step + (lab.r() - 0.5) * 0.006;
  const D: (k: 'bass' | 'tone' | 'slap') => Line[1] = (k) => (t, v) => p.djembe(t, v, k);
  const BELL: Line[1] = (t, v) => p.agogo(t, v, 'low'), SH: Line[1] = (t, v) => p.shaker(t, v, v > 0.5 ? 0.09 : 0.05);
  const CO: Line[1] = (t, v) => p.conga(t, v, 'open'), CL: Line[1] = (t, v) => p.conga(t, v, 'open', 'low'), CS: Line[1] = (t, v) => p.conga(t, v, 'slap');
  const CM: Line[1] = (t, v) => p.conga(t, v, 'mute'), CH: Line[1] = (t, v) => p.conga(t, v, 'heel', 'low');
  const BH: Line[1] = (t, v) => p.bongo(t, v), BL: Line[1] = (t, v) => p.bongo(t, v, 'low'), CV: Line[1] = (t, v) => p.claves(t, v);
  const TR: Line[1] = (t, v) => p.triangle(t, v), TRM: Line[1] = (t, v) => p.triangle(t, v, false);
  for (let b = 0; b < 4; b++) {
    const lines: Line[] = [
      ['7.6.67.6.6.6', BELL], ['623623623623', SH],
      ['9.....8.....', D('bass')], ['..76.....76.', D('slap')], ['.....67....6', D('tone')],
      ['...7.....7..', CL], ['....8.....6.', CO], ['......7.....', CS], ['.4........4.', CM], ['3.....3.....', CH],
    ];
    if (b >= 1) lines.push(['5..4..5..4..', BH], ['.3..3..3..3.', BL]);
    if (b >= 2) lines.push(['5.4.45.4.4.4', CV]);
    lines.push(b % 2 ? ['..5..5..5..5', TRM] : ['6...........', TR]);
    bar(ab, b, lines, b === 0 ? 0.8 : 1);
  }
  bar(ab, 4, [['x', D('bass')], ['8', BELL], ['8', S2], ['6', TR], ['7', CL]]);
}
