/**
 * Keys (score v3): the electric pianos (a Rhodes, a Wurlitzer and the DX7's "E.PIANO 1"), the clavinet and the
 * tonewheel organ.
 *
 * The electric pianos are FM laid out the way the instruments work. The tine is a sine whose swing decays, with a
 * 1:1 partner (a cosine: no DC) whose index fades faster than the note, so the tone mellows as it rings; a second
 * carrier, a few cents off, carries the bell of the strike (a high modulator that dies within a tenth of a second)
 * and the faster first stage of the decay, beating slowly against the first. The Wurlitzer's reed plays the odd
 * overtones of a 1:2 pair (the third on one envelope, the fifth and up on a faster one) and its own second mode at
 * 6.27×. The Rhodes and the Wurli then go through their pickup: a WaveShaper with the pickup's own curve (the magnetic
 * flux bell 1/(1 + u²) of a tine resting off-centre for the Rhodes, the capacitance 1/(d − x) of a reed swinging at a
 * charged plate for the Wurli), fed with the tine's swing — a hard note barks, a soft one is round, and the bark fades
 * with the note, as on the real ones. The DX's tine is 14:1 on every key, its index scaled down the keyboard the way
 * the DX7's level scaling does it, so the glass rises with the note and never folds back. Low notes ring for a
 * quarter of a minute, the top for a second or two; a damper stops them with a thump as loud as the tine still is.
 * Each key has one tine (with its own small mistuning, the same at every strike): striking a key that still rings
 * takes the old voice over. Oscillators that only serve the strike stop when it has died.
 *
 * The clavinet is a waveguide string computed once per string and take (a stiff steel string struck by a tangent,
 * its loss rising with frequency) seen through two pickups (two comb filters, in or out of phase): three takes a
 * string, taken in turn per string. A buffer holds the hardest strike: the string is linear, so a softer blow is the
 * same string fed a rounder pulse, which a filter on each note gives it (velocity opens it), together with the few
 * cents a hard blow stretches the string by. The buffer ends on a loop (whole periods, matched and crossfaded, its
 * decay flattened) and the note's envelope carries the decay on from there, so a held note dies away for as long as
 * it is held, never stopping dead. The key's knock and the muted note's "chick" are noise of their own, never the same
 * twice; letting the key up stops the string on its yarn with a thup.
 *
 * The organ is additive: three oscillators a key (the drawbars' octaves, their tempered fifths, the tempered third,
 * as the tonewheels give them, folding back at the top onto the same wheels), key click, single-triggered percussion,
 * an amp that growls when pushed and a Leslie: a horn and a drum that spin up and down at their own pace, each heard
 * by two mics on either side of the cabinet (the Doppler, the swell and the horn's beam of treble). A key held from
 * one chord into the next keeps sounding, as on the real one.
 *
 * Web Audio gives lowpass and highpass biquads their Q in dB; `biquad()` here takes the plain Q and converts it.
 */
import { freeWhenDone } from '../engine';
import { mtof, pan, type Rnd, type Strip } from '../synth';
import { cachedBuffer, fadeTail, noiseGen } from './buffers';
import { chorus, tremolo, type Fx } from './fx';
import type { Lab } from './lab';

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const cents = (c: number) => Math.pow(2, c / 1200);
const dB = (x: number) => Math.pow(10, x / 20);

const warned = new Set<string>();
/** Say it once: an effect is left out (no `onStop` to stop its LFOs with) rather than an oscillator left running. */
function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg);
}

/** A fixed value in −1..1 for key `k` of the instrument seeded `seed`: the same every time that key is played. */
function keyNoise(seed: number, k: number): number {
  const g = noiseGen(seed * 131 + k * 7919 + 17);
  g();
  return g();
}

// ── shared pieces ───────────────────────────────────────────────────────────────────────────
const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/** A PeriodicWave made once per context from [harmonic, amplitude, phase] parts, at the amplitudes given. */
function periodic(ctx: BaseAudioContext, key: string, parts: [number, number, number][]): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) waveCache.set(ctx, (m = new Map()));
  let w = m.get(key);
  if (!w) {
    const n = Math.max(1, ...parts.map((p) => p[0])) + 1;
    const real = new Float32Array(n), imag = new Float32Array(n);
    // a·sin(hθ + φ) = a·sin φ·cos hθ + a·cos φ·sin hθ
    for (const [h, a, ph] of parts) {
      real[h] += a * Math.sin(ph);
      imag[h] += a * Math.cos(ph);
    }
    w = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    m.set(key, w);
  }
  return w;
}

/**
 * A cosine: a modulator that starts at its crest turns frequency modulation into phase modulation, so a 1:1 pair has
 * no DC in it (a sine modulator leaves −J₁(I) of offset, a thump at every note).
 */
const cosWave = (ctx: BaseAudioContext) => periodic(ctx, 'cos', [[1, 1, Math.PI / 2]]);

const curveCache = new Map<string, Float32Array<ArrayBuffer>>();
function curve(key: string, fn: (x: number) => number, n = 4097): Float32Array<ArrayBuffer> {
  let c = curveCache.get(key);
  if (!c) {
    c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
    curveCache.set(key, c);
  }
  return c;
}

/**
 * The Rhodes pickup: the flux bell 1/(1 + u²) of the pole piece, seen by a tine resting `x0` off its centre and
 * swinging ±`s` (in the bell's widths); slope 1 at rest. Small swings are clean, big ones bark.
 */
function rhodesPickup(x0: number, s: number) {
  const phi = (u: number) => 1 / (1 + u * u);
  const slope = (2 * x0) / (1 + x0 * x0) ** 2;
  return (x: number) => (phi(x0) - phi(x0 + s * x)) / (slope * s);
}

/** The Wurlitzer's electrostatic pickup: the reed's capacitance to the plate, 1/(d − x); slope 1 at rest. */
const wurliPickup = (d0: number) => (x: number) => (1 / (d0 - x) - 1 / d0) * d0 * d0;

/** A valve stage: a tanh, offset by `b` (a trace of even harmonics, and of DC: keep `b` small); slope 1 at rest. */
const valve = (k: number, b: number) => (x: number) => (Math.tanh(k * (x + b)) - Math.tanh(k * b)) / (k * (1 - Math.tanh(k * b) ** 2));

/**
 * The Wurlitzer reed's odd overtones: the spectrum of sin(θ + I·sin 2θ) (a 1:2 FM pair at index I) without its
 * fundamental, relative to it, as two waves: the third alone, and the fifth to the eleventh. Each is played by its
 * own oscillator on its own envelope (the third follows the fading index, the rest fall faster), so the overtones fade
 * before the fundamental, the high ones first, without an audio-rate modulator (cached per index step).
 */
function wurliOvertones(ctx: BaseAudioContext, index: number): [PeriodicWave, PeriodicWave] {
  const I = Math.round(index * 20) / 20;
  const N = 64, H = 11;
  const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N, y = Math.sin(th + I * Math.sin(2 * th));
    for (let h = 1; h <= H; h++) {
      re[h] += (2 / N) * y * Math.cos(h * th);
      im[h] += (2 / N) * y * Math.sin(h * th);
    }
  }
  const a1 = Math.hypot(re[1], im[1]) || 1;
  const part = (h: number): [number, number, number] => [h, Math.hypot(re[h], im[h]) / a1, Math.atan2(re[h], im[h])];
  const high: [number, number, number][] = [];
  for (let h = 5; h <= H; h += 2) high.push(part(h));
  return [periodic(ctx, `wurli-ov3-${I}`, [part(3)]), periodic(ctx, `wurli-ov5-${I}`, high)];
}

/** A shaper with a cached curve. */
function shaper(ctx: BaseAudioContext, key: string, fn: (x: number) => number, oversample: OverSampleType, n = 4097): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  ws.curve = curve(key, fn, n);
  ws.oversample = oversample;
  return ws;
}

/** A biquad; `q` is the plain Q for every type (a lowpass's and a highpass's are given to Web Audio in dB). */
function biquad(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = Math.SQRT1_2, gain = 0): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = freq;
  b.Q.value = type === 'lowpass' || type === 'highpass' ? 20 * Math.log10(q) : q;
  b.gain.value = gain;
  return b;
}

function gainNode(ctx: BaseAudioContext, g: number): GainNode {
  const n = ctx.createGain();
  n.gain.value = g;
  return n;
}

/**
 * A chorus that leaves the bass alone: below ~260 Hz the signal goes straight on, above it through fx.ts's chorus. (A
 * chorus's delay against the dry signal combs the bass — at 12 ms a note at 125 Hz sits in a notch while one at 83 Hz
 * is doubled — so the low notes of a keyboard would come and go.) The split is an LR2 pair (Q 0.5 each), the high side
 * inverted: low − high sums to an all-pass, flat.
 */
function bassBypassChorus(ctx: BaseAudioContext, s: Strip, dest: AudioNode, o: Parameters<typeof chorus>[2]): Fx {
  const fx = chorus(ctx, dest, o);
  const input = ctx.createGain();
  const lo = biquad(ctx, 'lowpass', 260, 0.5), hi = biquad(ctx, 'highpass', 260, 0.5);
  const loG = gainNode(ctx, 0.92), inv = gainNode(ctx, -1);
  input.connect(lo);
  lo.connect(loG);
  loG.connect(dest);
  input.connect(hi);
  hi.connect(inv);
  inv.connect(fx.input);
  s.nodes.push(input, lo, hi, loG, inv);
  return { input, stop: fx.stop };
}

/**
 * Nine pans from −0.8 to 0.8, made once per instrument: a note joins the nearest instead of bringing its own panner
 * (one node fewer for every voice).
 */
function panRack(ctx: BaseAudioContext, s: Strip, dest: AudioNode): (p: number) => AudioNode {
  const rack: AudioNode[] = [];
  return (p) => {
    const k = Math.round(clamp((p + 0.8) / 0.2, 0, 8));
    if (!rack[k]) {
      rack[k] = pan(ctx, k * 0.2 - 0.8);
      rack[k].connect(dest);
      s.nodes.push(rack[k]);
    }
    return rack[k];
  };
}

/** A chain of nodes made once per instrument, into the strip (they are torn down with it). */
function chain(s: Strip, nodes: AudioNode[], dest: AudioNode = s.in): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  nodes[nodes.length - 1].connect(dest);
  s.nodes.push(...nodes);
  return nodes[0];
}

// ── envelopes ───────────────────────────────────────────────────────────────────────────────
type Pts = [number, number][];

/** [seconds after t, value] points: a linear rise to the first, exponential segments through the rest; holds the last. */
function shape(p: AudioParam, t: number, pts: Pts): void {
  p.value = 0;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(Math.max(1e-6, pts[0][1]), t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.exponentialRampToValueAtTime(Math.max(1e-6, pts[i][1]), t + pts[i][0]);
}

/**
 * An amplitude envelope that knows when the key comes up: `pts` as in `shape` (the last point small: where the note
 * dies by itself); at `off`, if it still sounds, it falls with time constant `rel` to −50 dB, then a linear step to
 * exact zero. Returns when it reaches zero.
 */
function env(p: AudioParam, t: number, pts: Pts, off: number, rel: number): number {
  p.value = 0;
  p.setValueAtTime(0, t);
  let pt = t + pts[0][0], pv = Math.max(1e-6, pts[0][1]);
  p.linearRampToValueAtTime(pv, pt);
  const cut = Math.max(off, pt);
  for (let i = 1; i < pts.length; i++) {
    const nt = t + pts[i][0], nv = Math.max(1e-7, pts[i][1]);
    if (cut < nt) {
      if (cut > pt + 1e-5) {
        // the value the segment has when the key comes up, on the same exponential
        const v = pv * Math.pow(nv / pv, (cut - pt) / (nt - pt));
        p.exponentialRampToValueAtTime(v, cut);
        pv = v;
        pt = cut;
      }
      const stop = pt + rel * 5.76;
      p.exponentialRampToValueAtTime(Math.max(1e-8, pv * 3.16e-3), stop);
      p.linearRampToValueAtTime(0, stop + 0.004);
      return stop + 0.004;
    }
    p.exponentialRampToValueAtTime(nv, nt);
    pt = nt;
    pv = nv;
  }
  p.linearRampToValueAtTime(0, pt + 0.004);
  return pt + 0.004;
}

/** The value `env` gives `pts` at `dt` seconds after its start (0 once it has died by itself). */
function envAt(pts: Pts, dt: number): number {
  if (dt <= 0) return 0;
  const a = pts[0][0], v0 = Math.max(1e-6, pts[0][1]);
  if (dt < a) return (v0 * dt) / a;
  let pt = a, pv = v0;
  for (let i = 1; i < pts.length; i++) {
    const nt = pts[i][0], nv = Math.max(1e-7, pts[i][1]);
    if (dt < nt) return pv * Math.pow(nv / pv, (dt - pt) / (nt - pt));
    pt = nt;
    pv = nv;
  }
  return 0;
}

/**
 * An `env` scheduled again from `from` on (its events from `from` on already cancelled): the value it has there on
 * the same curve, then the rest of its points, the key now coming up at `off`. Returns when it reaches zero.
 */
function envFrom(p: AudioParam, t: number, pts: Pts, from: number, off: number, rel: number): number {
  const v = envAt(pts, from - t);
  if (v < 1e-7) {
    p.setValueAtTime(0, from);
    return from;
  }
  p.setValueAtTime(v, from);
  let pt = from, pv = v;
  if (from < t + pts[0][0]) {
    pt = t + pts[0][0];
    pv = Math.max(1e-6, pts[0][1]);
    p.linearRampToValueAtTime(pv, pt);
  }
  const cut = Math.max(off, pt);
  for (let i = 1; i < pts.length; i++) {
    const nt = t + pts[i][0], nv = Math.max(1e-7, pts[i][1]);
    if (nt <= pt) continue;
    if (cut < nt) {
      if (cut > pt + 1e-5) {
        const vc = pv * Math.pow(nv / pv, (cut - pt) / (nt - pt));
        p.exponentialRampToValueAtTime(vc, cut);
        pv = vc;
        pt = cut;
      }
      const stop = pt + rel * 5.76;
      p.exponentialRampToValueAtTime(Math.max(1e-8, pv * 3.16e-3), stop);
      p.linearRampToValueAtTime(0, stop + 0.004);
      return stop + 0.004;
    }
    p.exponentialRampToValueAtTime(nv, nt);
    pt = nt;
    pv = nv;
  }
  p.linearRampToValueAtTime(0, pt + 0.004);
  return pt + 0.004;
}

// ── small DSP for the buffer models ─────────────────────────────────────────────────────────
/** An RBJ band-pass (0 dB at the centre), as a sample-by-sample function. */
function bandpass(f: number, q: number, sr: number): (x: number) => number {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  const a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Phase delay (samples) of the first-order all-pass (a + z⁻¹)/(1 + a·z⁻¹) at ω. */
function apDelay(a: number, w: number): number {
  return 1 - (2 / w) * Math.atan((a * Math.sin(w)) / (1 + a * Math.cos(w)));
}

/** Phase delay (samples) of the one-zero loop filter (1 − S) + S·z⁻¹ at ω. */
function lpDelay(S: number, w: number): number {
  return Math.atan((S * Math.sin(w)) / (1 - S + S * Math.cos(w))) / w;
}

/** The all-pass coefficient whose phase delay at ω is `d` samples (bisection; the delay falls as a rises). */
function apFor(d: number, w: number): number {
  let lo = -0.95, hi = 0.95;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (apDelay(mid, w) > d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Trim a decayed buffer: the last sample above −66 dB of its peak, a short fade after it. Returns the length used. */
function trimTail(d: Float32Array, sr: number): number {
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const floor = peak * 5e-4;
  let last = d.length - 1;
  while (last > 0 && Math.abs(d[last]) < floor) last--;
  const used = Math.min(d.length, last + Math.round(sr * 0.012));
  fadeTail(d, sr, 12, used);
  return used;
}

// ── the electric pianos ─────────────────────────────────────────────────────────────────────
export type EPModel = 'rhodes' | 'wurli' | 'dx';

export interface EPOpts {
  model: EPModel;
  /** A stereo chorus after the amp: true, or its wet mix (0..1). The DX has one unless this is false. */
  chorus?: boolean | number;
  /** The amp's tremolo: true, or its rate in Hz. The Rhodes' is the Suitcase's stereo pan; the Wurli's is in place. */
  tremolo?: boolean | number;
  /** The amp's treble, 0.6..1.4 (1 = as voiced). */
  tone?: number;
  /** Where the chorus and the tremolo register their LFOs' stop (tracks: `k.onStop`). Without it they are left out. */
  onStop?: (fn: () => void) => void;
}

/** The damper's felt landing on a ringing tine or reed, as the pickup hears it: a soft, low thump. */
function damperBuffer(ctx: BaseAudioContext, v: number): AudioBuffer {
  return cachedBuffer(ctx, `keys-damper-${v}`, 0.11, (d, sr) => {
    const rnd = noiseGen(7734 + v * 101);
    const parts: [(x: number) => number, number][] = [[bandpass(700 + v * 60, 0.8, sr), 0.4], [bandpass(115 + v * 9, 5, sr), 1], [bandpass(240, 2, sr), 0.35]];
    const att = sr * 0.002, dec = sr * 0.016;
    let peak = 0;
    for (let i = 0; i < d.length; i++) {
      const e = i < att ? i / att : Math.exp(-(i - att) / dec);
      const x = rnd() * e;
      let y = 0;
      for (const [f, g] of parts) y += f(x) * g;
      d[i] = y;
      peak = Math.max(peak, Math.abs(y));
    }
    for (let i = 0; i < d.length; i++) d[i] /= peak || 1;
    fadeTail(d, sr, 10);
  });
}

/** An electric piano's note: `p` = pan (-1..1), `gain` = level only (a chord's notes at 1/√n: see `keysChord`). */
export type EPNote = (t: number, m: number, dur: number, vel: number, p?: number, gain?: number) => void;

/** A sounding electric-piano voice: when it started and ends, its output gain (and level), its sources' stops. */
interface EPVoice {
  t: number;
  end: number;
  out: GainNode;
  g: number;
  stops: [AudioScheduledSourceNode, number][];
}

/** One tine per key: the voice that sounds a pitch fades out over 8 ms at `at`, when that pitch is struck again. */
function takeOver(v: EPVoice, at: number): void {
  if (v.end <= at) return;
  v.out.gain.setValueAtTime(v.g, at);
  v.out.gain.linearRampToValueAtTime(0, at + 0.008);
  for (const e of v.stops) {
    if (e[1] <= at + 0.012) continue;
    try {
      e[0].stop(at + 0.012);
      e[1] = at + 0.012;
    } catch {
      // an engine that keeps the first stop: the voice plays on, silent, to its own end
    }
  }
  v.end = at + 0.012;
}

/**
 * An electric piano. `model`: 'rhodes' (tine and tonebar, magnetic pickup: round when soft, barking when hard),
 * 'wurli' (a steel reed and an electrostatic pickup: reedy, nasal, a growl when hard, shorter) or 'dx' (the DX7's
 * E.PIANO 1: a glassy tine, clean, chorused). Returns `(t, m, dur, vel, pan?, gain?)`: `dur` is how long the key is
 * held (the damper falls then); velocity drives the tine's swing (the bark), the FM indices and the strike's bell.
 */
export function makeEPiano(ctx: BaseAudioContext, s: Strip, r: Rnd, o: EPOpts): EPNote {
  const { model, tone = 1 } = o;
  // the amp and its speaker, then the effects, made once
  const eq: AudioNode[] =
    model === 'rhodes'
      ? [ctx.createGain(), biquad(ctx, 'highpass', 32, 0.7), biquad(ctx, 'peaking', 210, 0.8, 1.5), biquad(ctx, 'peaking', 2300, 0.9, 2.5 * tone), biquad(ctx, 'lowpass', 7200 * tone, 0.8)]
      : model === 'wurli'
        ? [ctx.createGain(), biquad(ctx, 'highpass', 70, 0.7), biquad(ctx, 'peaking', 1150, 0.9, 4.5), biquad(ctx, 'peaking', 2900, 1.4, 1.5 * tone), biquad(ctx, 'lowpass', 5600 * tone, 0.8)]
        : [ctx.createGain(), biquad(ctx, 'highpass', 38, 0.7), biquad(ctx, 'peaking', 380, 0.7, -1.5), biquad(ctx, 'highshelf', 4200, 0.7, 1.5 * tone), biquad(ctx, 'lowpass', 16000, 0.6)];
  let trem = o.tremolo === true ? (model === 'rhodes' ? 4.4 : 5.6) : typeof o.tremolo === 'number' ? o.tremolo : 0;
  let mix = o.chorus === false ? 0 : o.chorus === true ? 0.3 : typeof o.chorus === 'number' ? o.chorus : model === 'dx' ? 0.3 : 0;
  if ((trem > 0 || mix > 0) && !o.onStop) {
    warnOnce(`keys: makeEPiano({ model: '${model}' }) has a chorus or a tremolo but no onStop to stop their LFOs with, so it plays without them (pass onStop: k.onStop)`);
    trem = mix = 0;
  }
  let dest: AudioNode = s.in;
  const fxs: Fx[] = [];
  if (trem > 0) {
    const fx = tremolo(ctx, dest, { rate: trem, depth: model === 'rhodes' ? 0.3 : 0.4, stereo: model === 'rhodes' });
    fxs.push(fx);
    dest = fx.input;
  }
  if (mix > 0) {
    const fx = bassBypassChorus(ctx, s, dest, { mix, rate: model === 'dx' ? 0.6 : 0.45, depth: 0.0014, delay: 0.0072 });
    fxs.push(fx);
    dest = fx.input;
  }
  for (const fx of fxs) o.onStop?.(fx.stop);
  const amp = chain(s, eq, dest);
  const pans = panRack(ctx, s, amp);
  // each key's own small mistuning, the same at every strike (a real one is a cent or so out here and there)
  const seed = Math.floor(r() * 1e6);
  const voices = new Map<number, EPVoice>();

  return (t, m, dur, vel, p = 0, level = 1) => {
    vel = clamp(vel, 0.02, 1);
    const u = clamp((m - 33) / 63);
    const f = mtof(m) * cents(keyNoise(seed, Math.round(m)) * 1.5);
    const off = t + Math.max(0.02, dur);
    // no two strikes alike: the blow and the tine's bell vary a little
    const jit = 1 + (r() - 0.5) * 0.08;
    // above ~2.5 kHz the bell's sidebands would fold back past Nyquist: it fades out up there
    const top = clamp((4200 - f) / 1700);
    // every oscillator stops when what it feeds has died: the strike's partners long before the note
    const oscs: [OscillatorNode, number][] = [];
    const nodes: AudioNode[] = [];
    const sine = (freq: number, wave?: PeriodicWave) => {
      const x = ctx.createOscillator();
      if (wave) x.setPeriodicWave(wave);
      x.frequency.value = freq;
      oscs.push([x, Infinity]);
      return x;
    };
    const until = (x: OscillatorNode, at: number) => {
      for (const e of oscs) if (e[0] === x) e[1] = at;
    };
    const gain = () => {
      const g = ctx.createGain();
      nodes.push(g);
      return g;
    };
    /** A modulator → index gain → carrier frequency; `pts` in index units (radians), scaled to Hz of deviation. */
    const modulate = (car: OscillatorNode, fm: number, pts: Pts, wave?: PeriodicWave, stopAt?: number) => {
      const mod = sine(fm, wave);
      const ig = gain();
      shape(ig.gain, t, pts.map(([s2, v]) => [s2, v * fm] as [number, number]));
      if (stopAt !== undefined) {
        // after its last point the index comes down to nothing, then the modulator stops
        if (stopAt > t + pts[pts.length - 1][0] + 0.004) ig.gain.linearRampToValueAtTime(0, stopAt - 0.002);
        until(mod, stopAt);
      }
      mod.connect(ig);
      ig.connect(car.frequency);
      return mod;
    };
    const out = gain();
    out.connect(pans(p));
    let end: number;
    let damper: AudioBufferSourceNode | null = null;

    if (model === 'dx') {
      // E.PIANO 1: a 1:1 body and a 1:14 tine on a second carrier a few cents up (the slow shimmer), no pickup
      const ring = 9 * Math.pow(2, -(m - 36) / 13);
      const rel = 0.045 + 0.05 * (1 - u);
      const fb = f * cents(-3);
      const c1 = sine(fb);
      const ib = (0.3 + 0.7 * vel) * (1 - 0.35 * u);
      const fade = Math.min(ring * 0.6, 1.8);
      modulate(c1, fb, [[0.0015, ib], [0.9, ib * 0.45], [Math.max(1, fade), ib * 0.3]], cosWave(ctx), t + Math.max(1, fade) + 0.15);
      const a1 = gain();
      end = env(a1.gain, t, [[0.0012, 1], [Math.min(0.35, ring * 0.5), 0.78], [ring, 1e-3]], off, rel);
      // the tine: 14:1 on every key, as on the DX7, its index scaled down the keyboard as the DX7's level scaling
      // does it, so its strong sidebands ((I + 1)·14f) stay under ~16 kHz: the glass rises with the note and never
      // folds back. Past ~1 kHz, where 14:1 has nothing left to give, a light 5:1 keeps an edge on the strike.
      const ft = f * cents(3.5);
      const glass = f < 1000;
      const rt = glass ? 14 : 5;
      const scale = glass ? clamp((15500 / (14 * f) - 1) / 2.4) : 0.16 * clamp((f - 900) / 400);
      const c2 = sine(ft);
      const it = (0.35 + 2 * Math.pow(vel, 1.6)) * (0.55 + 0.45 * Math.sin(Math.PI * clamp((m - 24) / 80))) * jit * top * scale;
      const td = 0.05 + 0.09 * (1 - u);
      const a2 = gain();
      // the tine's carrier stops 45 dB down: by then the body has long covered it
      const end2 = env(a2.gain, t, [[0.001, 0.55], [ring * 0.41, 0.55 * 5.6e-3]], off, rel);
      if (it > 1e-3) modulate(c2, ft * rt, [[0.001, it], [td * 2.2, it * 0.12], [td * 9, it * 0.004]], undefined, Math.min(end2, t + td * 9 + 0.02));
      until(c2, end2);
      c1.connect(a1);
      c2.connect(a2);
      a1.connect(out);
      a2.connect(out);
      out.gain.value = level * 0.44 * Math.pow(vel, 1.3) * (1 - 0.2 * clamp((m - 76) / 20));
    } else {
      const rhodes = model === 'rhodes';
      // the tine's swing: what the pickup turns into bark (the top of the range leans into it)
      const bark = Math.pow(clamp((vel - 0.55) / 0.45), 2);
      const sw0 = rhodes ? 0.05 + 0.8 * Math.pow(vel, 1.25) : 0.05 + 0.6 * Math.pow(vel, 1.35);
      const sw = sw0 + (rhodes ? 0.34 : 0.34) * bark;
      const swing = sw * (rhodes ? 1 - 0.3 * u : 1 - 0.25 * u) * (1 + (jit - 1) * 0.4);
      // low notes ring for a quarter of a minute, the middle for six or seven seconds, the top for one or two
      const ring = rhodes ? 20 * Math.pow(2, -(m - 33) / 17) : 7 * Math.pow(2, -(m - 36) / 15);
      const rel = rhodes ? 0.026 + 0.06 * (1 - u) : 0.02 + 0.04 * (1 - u);
      const k2 = rhodes ? 0.22 + 0.18 * vel : 0.12 + 0.1 * vel;
      // a low reed speaks more slowly: on a short attack its corner is heard as a tick
      const att = rhodes ? 0.0016 : 0.0012 + 0.0016 * clamp((45 - m) / 12);
      // the body: the tine's fundamental and its FM partner (1:1 Rhodes, 1:2 Wurli: odd harmonics)
      const c1 = sine(f);
      let ov: [OscillatorNode, number][] = [];
      if (rhodes) {
        // the body's index matters for the first second or two; after that the pickup alone shapes the tone
        const i0 = (0.1 + 0.42 * Math.pow(vel, 1.4)) * (1 - 0.4 * u);
        const fade = Math.max(0.25, Math.min(ring * 0.6, 2.4));
        modulate(c1, f, [[0.002, i0], [0.18, i0 * 0.5], [fade, i0 * 0.12]], cosWave(ctx), t + fade + 0.05);
      } else {
        // the reed's odd overtones (the 1:2 spectrum at the strike's index): the third follows the fading index, the
        // fifth and up its 2.5th power
        const [w3, w5] = wurliOvertones(ctx, (0.34 + 0.42 * vel) * (1 - 0.3 * u));
        ov = [[sine(f, w3), 1], [sine(f, w5), 2.5]];
      }
      const a1 = gain();
      const knee = Math.min(ring * 0.5, rhodes ? 0.12 + 0.3 * (1 - u) : 0.08 + 0.15 * (1 - u));
      const p1 = swing / (1 + k2);
      const bodyPts: Pts = [[att, p1], [knee, p1 * (rhodes ? 0.72 : 0.6)], [ring, p1 * 1e-3]];
      end = env(a1.gain, t, bodyPts, off, rel);
      const ovOuts: GainNode[] = [];
      if (ov.length) {
        // the body's envelope times the fading index (1 → 0.62 at 0.4 s → 0.4 at the end), to the overtone's power
        const body = (at: number) => p1 * 0.6 * Math.pow(1e-3 / 0.6, (at - knee) / (ring - knee));
        const idx = (at: number) => (at < 0.4 ? 1 - (0.38 * at) / 0.4 : 0.62 - (0.22 * (at - 0.4)) / Math.max(0.01, ring - 0.4));
        for (const [x, e] of ov) {
          const g = gain();
          const pts: Pts = [[att, p1], [knee, p1 * 0.6 * Math.pow(idx(knee), e)]];
          for (const at of [0.4, 1.2]) if (at > knee + 0.02 && at < ring - 0.05) pts.push([at, body(at) * Math.pow(idx(at), e)]);
          pts.push([ring, body(ring) * Math.pow(idx(ring), e)]);
          env(g.gain, t, pts, off, rel);
          x.connect(g);
          ovOuts.push(g);
        }
      }
      // the strike: a second carrier a few cents off (the faster first stage, a slow beat with the body) with the
      // bell on it (Rhodes: a high modulator dying in a tenth of a second; Wurli: the reed's second mode, 6.27×)
      const p2 = (swing * k2) / (1 + k2);
      const a2 = gain();
      let c2: OscillatorNode;
      if (rhodes) {
        c2 = sine(f * cents(3 + r() * 3));
        // its carrier stops 45 dB down: the body has long covered it
        const end2 = env(a2.gain, t, [[0.0012, p2], [ring * 0.21, p2 * 5.6e-3]], off, rel);
        const rt = f < 330 ? 14 : Math.max(3, Math.round(4600 / f));
        const it = (0.25 + 0.95 * Math.pow(vel, 1.6)) * (0.6 + 0.4 * Math.sin(Math.PI * clamp((m - 24) / 84))) * jit * top;
        const td = 0.03 + 0.05 * (1 - u);
        modulate(c2, f * rt * (1.001 + r() * 0.004), [[0.001, it], [td * 2.5, it * 0.08], [td * 8, it * 0.004]], undefined, Math.min(end2, t + td * 8 + 0.02));
        until(c2, end2);
      } else {
        c2 = sine(Math.min(f * 6.27, 9000));
        const pd = p2 * (0.6 + 0.4 * vel) * clamp((9000 - f * 6.27) / 4000);
        const att2 = 0.0008 + 0.0017 * clamp((45 - m) / 12);
        until(c2, env(a2.gain, t, [[att2, pd], [0.06 + 0.06 * (1 - u), pd * 0.03], [0.24, pd * 1e-3]], off, 0.02));
      }
      c1.connect(a1);
      c2.connect(a2);
      // the pickup, then a high-pass under the fundamental (the pickup's even harmonics come with an offset)
      const pk = shaper(ctx, rhodes ? 'rhodes-pickup' : 'wurli-pickup', rhodes ? rhodesPickup(0.28, 1.15) : wurliPickup(1.15), f > 900 ? '2x' : 'none');
      const hp = biquad(ctx, 'highpass', f * 0.5, 0.6);
      nodes.push(pk, hp);
      a1.connect(pk);
      a2.connect(pk);
      for (const g of ovOuts) g.connect(pk);
      pk.connect(hp);
      hp.connect(out);
      // the bark's extra swing is heard as colour more than level: most of it is taken back here
      const lvl = (rhodes ? 1.16 * Math.pow(vel, 0.55) * (1 + 0.12 * clamp((60 - m) / 24) - 0.22 * clamp((m - 76) / 20)) : 1.0 * Math.pow(vel, 0.25) * (1 + 0.15 * clamp((60 - m) / 24) - 0.22 * clamp((m - 76) / 20))) * Math.pow(sw0 / sw, 0.85);
      out.gain.value = lvl * level;
      // the damper's felt on a tine that still rings: a soft thump in the pickup, as loud as the tine still is (the
      // hammer's knock is acoustic, and masked by the strike anyway)
      if (off + 0.12 < end) {
        const still = envAt(bodyPts, off - t) / p1;
        if (still > 0.01) {
          const mg = gain();
          damper = ctx.createBufferSource();
          damper.buffer = damperBuffer(ctx, Math.floor(r() * 4));
          damper.playbackRate.value = 0.9 + 0.2 * r();
          mg.gain.value = (rhodes ? 0.05 : 0.035) * lvl * level * (0.5 + 0.5 * vel) * Math.min(1, 1.4 * still);
          damper.connect(mg);
          mg.connect(out);
          damper.start(off);
          damper.stop(off + 0.12);
          nodes.push(damper);
        }
      }
    }
    const stops: [AudioScheduledSourceNode, number][] = [];
    for (const [x, at] of oscs) {
      const st = Math.min(at, end) + 0.01;
      x.start(t);
      x.stop(st);
      stops.push([x, st]);
    }
    if (damper) stops.push([damper, off + 0.12]);
    // the body's carrier lasts longest: when it ends, the whole voice is freed
    freeWhenDone(oscs[0][0], ...oscs.slice(1).map((e) => e[0]), ...nodes);
    // one tine per key: a pitch struck again takes its voice over (an earlier strike arriving late gives way)
    const id = Math.round(m * 100);
    const v: EPVoice = { t, end, out, g: out.gain.value, stops };
    const prev = voices.get(id);
    if (prev && prev.t > t + 0.001) takeOver(v, prev.t);
    else {
      if (prev && prev.t < t - 0.001) takeOver(prev, t);
      voices.set(id, v);
    }
  };
}

/**
 * A chord on an electric piano: rolled from the bottom by `spread` seconds a note (a hand is never quite together),
 * the bass a touch firmer, each note at 1/√n so the chord is about as loud as one note, and panned a little by pitch.
 * (The clavinet takes the same 1/√n as its `gain` argument.)
 */
export function keysChord(play: EPNote, r: Rnd, t: number, notes: number[], dur: number, vel: number, spread = 0.012): void {
  const n = Math.max(1, notes.length);
  const sorted = [...notes].sort((a, b) => a - b);
  sorted.forEach((m, i) => {
    const dt = i * spread * (0.6 + r() * 0.8);
    play(t + dt, m, Math.max(0.02, dur - dt), vel * (i === 0 ? 1 : 0.94 + r() * 0.08), clamp((m - 62) / 48, -0.5, 0.5), 1 / Math.sqrt(n));
  });
}

// ── the clavinet ────────────────────────────────────────────────────────────────────────────
export type ClavPickup = 'bright' | 'warm' | 'both' | 'thin';

export interface ClavOpts {
  /** The pickup switch: the bridge pickup alone ('bright'), the other alone ('warm'), both ('both'), both out of phase ('thin'). */
  pickup?: ClavPickup;
  /** An envelope filter on every note (0 off … 1 a full "wah"): it opens with the strike, harder notes further. */
  wah?: number;
  /** Treble, 0.6..1.4. */
  tone?: number;
  /** Compute the strings of this register (MIDI lo, hi) ahead, a few at a time while the game idles (`warmClav`). */
  warm?: [number, number];
}

type ClavLayer = 'open' | 'mute' | 'rel';
/** Takes a string, taken in turn per string: a repeated note is never the same strike twice running. */
const CLAV_TAKES: Record<ClavLayer, number> = { open: 3, mute: 3, rel: 2 };

/** Where an open string's buffer loops (samples), how fast it was dying there (seconds of buffer), its level there re the strike. */
interface ClavLoop {
  ls: number;
  le: number;
  tau: number;
  lvl: number;
}
const clavLoops = new Map<string, ClavLoop>();

/** The string a note is played on: one every major third (each note within two semitones of its own). */
const clavRoot = (m: number) => clamp(Math.round(m / 4) * 4, 24, 96);

/**
 * Cut a loop at the end of a dying string's buffer (`n` samples): whole periods, 30–60 ms of them, the length whose
 * waveform matches best; the decay flattened from the loop's start on (the note's envelope carries it on, at the rate
 * measured here) and the loop's end crossfaded into what comes before its start, so it wraps without a seam.
 */
function cutLoop(d: Float32Array, n: number, sr: number, f: number, t60: number): ClavLoop {
  const N0 = sr / f;
  const GUARD = 4;
  const le = n - GUARD - 2;
  const rms = (a: number, b: number) => {
    let e = 0;
    for (let i = a; i < b; i++) e += d[i] * d[i];
    return Math.sqrt(e / Math.max(1, b - a));
  };
  // how fast it is dying at the end: the RMS of the last 150 ms, in two halves
  const w = Math.round(0.075 * sr);
  const r1 = rms(le - 2 * w, le - w), r2 = rms(le - w, le);
  const tau0 = t60 / 6.91;
  const tau = clamp(r1 > r2 && r2 > 0 ? w / sr / Math.log(r1 / r2) : tau0, tau0 * 0.5, tau0 * 1.6);
  // the loop's length: k whole periods (30–60 ms), nudged by a sample or two, whichever matches best
  const W = Math.max(Math.round(0.008 * sr), Math.round(2 * N0));
  const kLo = Math.max(2, Math.round((0.03 * sr) / N0)), kHi = Math.max(kLo + 1, Math.round((0.06 * sr) / N0));
  let best = -2, P = Math.round(kLo * N0);
  for (let k = kLo; k <= kHi; k++) {
    for (let dp = -2; dp <= 2; dp++) {
      const q = Math.round(k * N0) + dp;
      if (le - q - W < 0) continue;
      let sxy = 0, sxx = 0, syy = 0;
      for (let j = 0, a = le - W, b = le - q - W; j < W; j++) {
        const x = d[a + j], y = d[b + j];
        sxy += x * y;
        sxx += x * x;
        syy += y * y;
      }
      const c = sxy / Math.sqrt(sxx * syy + 1e-30);
      if (c > best) {
        best = c;
        P = q;
      }
    }
  }
  const ls = le - P;
  const kd = 1 / (tau * sr);
  for (let i = ls; i < n; i++) d[i] *= Math.exp((i - ls) * kd);
  // the crossfade: the loop's end into what comes before its start (brought to the loop's level); linear, the two match
  const X = Math.min(Math.round(0.004 * sr), Math.floor(P / 3));
  for (let j = 0; j <= X; j++) {
    const a = le - X + j, b = ls - X + j, x = j / X;
    d[a] = d[a] * (1 - x) + d[b] * Math.exp(-(X - j) * kd) * x;
  }
  for (let j = 1; j <= GUARD; j++) d[le + j] = d[ls + j];
  return { ls, le, tau, lvl: rms(ls, le) / 0.2 };
}

/**
 * One clavinet string, computed once: a waveguide loop (an all-pass for the fractional length, two for the steel's
 * stiffness, a one-zero loss filter) struck by a pulse, read through the pickups' combs and as a magnetic pickup
 * reads it (velocity). 'open' = the hardest strike (narrow, with a little grit), ending on a loop; 'mute' = the same
 * string under felt; 'rel' = the dull thup of the tangent leaving the string. Each take strikes a little differently.
 */
function clavString(ctx: BaseAudioContext, root: number, layer: ClavLayer, rr: number, pickup: ClavPickup): { buf: AudioBuffer; loop: ClavLoop | null } {
  const f = mtof(root);
  const u = clamp((root - 36) / 60);
  const open = layer === 'open';
  const t60 = open ? 3.4 * Math.pow(2, -(root - 36) / 22) : layer === 'mute' ? 0.075 + 0.05 * (1 - u) : 0.04;
  const secs = open ? clamp(t60 * 0.42, 0.55, 1.1) : layer === 'mute' ? 0.22 : 0.12;
  const key = `clav-${pickup}-${root}-${layer}-${rr}`;
  const lk = `${ctx.sampleRate}|${key}`;
  const take = rr % 3;
  const buf = cachedBuffer(ctx, key, secs, (d, sr) => {
    const n = d.length;
    const N0 = sr / f, w0 = (2 * Math.PI * f) / sr;
    // the loss (a little different every take: the blow leaves the string a little differently)
    const S = open ? clamp(0.3 - 0.14 * u, 0.12, 0.32) * [1, 1.05, 0.95][take] : 0.44;
    const nDisp = open ? 2 : 0, aDisp = -0.5 * (1 - 0.7 * u);
    const fixed = lpDelay(S, w0) + nDisp * apDelay(aDisp, w0);
    const D = Math.max(2, Math.floor(N0 - fixed - 0.6));
    const c = apFor(N0 - fixed - D, w0);
    // per-trip loss for the fundamental's T60, the loss filter's own share taken out
    const hMag = Math.sqrt((1 - S) ** 2 + S * S + 2 * S * (1 - S) * Math.cos(w0));
    const rho = Math.min(0.99995, Math.pow(10, -3 / (t60 * f)) / hMag);
    // the strike: a short pulse through a one-pole low-pass a few harmonics up (a struck string's displacement falls
    // as 1/n above it), and a second corner fixed in Hz (the wound low strings are thick and thuddy)
    const sc = sr / 48000;
    // (the takes differ in the strike's shape, not its brightness: the tangent bounces a little differently each time)
    const width = (open ? [2.6, 2.8, 2.5] : layer === 'mute' ? [7.5, 8, 8.8] : [22, 26, 24])[take] * sc;
    const corner = f * (open ? [15, 14.2, 15.6] : layer === 'mute' ? [5.8, 6, 6.3] : [2, 2.2, 2])[take];
    const pole = Math.exp((-2 * Math.PI * Math.min(corner, sr * 0.2)) / sr);
    const corner2 = Math.max(open ? 2600 : layer === 'mute' ? 1500 : 600, f * (open ? 20 : 8)) * (open ? [1, 0.96, 1.04][take] : 1);
    const pole2 = Math.exp((-2 * Math.PI * Math.min(corner2, sr * 0.3)) / sr);
    const grit = open ? [0.34, 0.3, 0.38][take] : 0;
    const bounceAt = [7, 12, 9][take] * sc, bounce = open ? [0.2, 0.28, 0.15][take] : layer === 'mute' ? [0.1, 0.16, 0.06][take] : 0;
    const exc = new Float32Array(Math.round(sr * 0.006) + Math.ceil(width + bounceAt));
    // the grit: the tangent's metal on the string, a millisecond's sweep through the treble that each take makes its
    // own way. It goes round the string with the pulse, so it sets the treble partials for the whole note: noise would
    // give every take its own brightness (up to 8 dB apart); a sweep has the same spectrum every time, only the
    // phases differ, so takes sound alike and never repeat a waveform. Its energy is a fixed share of the pulse's
    // (24/w for a hump of width w).
    const gr = new Float32Array(exc.length);
    if (grit) {
      const [fa, fz, T] = ([[9000, 2600, 0.0012], [2600, 9000, 0.001], [7200, 3200, 0.0016]] as const)[take];
      const ng = Math.min(gr.length, Math.round(T * sr));
      let ph = 0, eg = 0;
      for (let i = 0; i < ng; i++) {
        const x = i / ng;
        ph += (2 * Math.PI * Math.min(fa + (fz - fa) * x, sr * 0.45)) / sr;
        gr[i] = Math.sin(ph) * Math.sin(Math.PI * x) ** 2;
        eg += gr[i] * gr[i];
      }
      const k = Math.sqrt((grit * 24) / width / (eg || 1));
      for (let i = 0; i < ng; i++) gr[i] *= k;
    }
    let ep = 0, ep2 = 0;
    const hump = (x: number) => (x >= 0 && x < width ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (x + 0.5)) / width) : 0);
    for (let i = 0; i < exc.length; i++) {
      const pulse = hump(i) + bounce * hump(i - bounceAt);
      ep = pole * ep + (1 - pole) * (pulse * (8 / width) + gr[i]);
      ep2 = pole2 * ep2 + (1 - pole2) * ep;
      exc[i] = ep2;
    }
    // and each take's blow smeared its own way (all-passes: the same spectrum, a strike of its own)
    if (layer !== 'rel')
      for (const a of ([[], [-0.6], [-0.7, -0.7]] as number[][])[take]) {
        let x1 = 0, y1 = 0;
        for (let i = 0; i < exc.length; i++) {
          const y = a * exc[i] + x1 - a * y1;
          x1 = exc[i];
          y1 = y;
          exc[i] = y;
        }
      }
    const L = D + 4;
    const line = new Float32Array(L);
    let wi = 0, ax = 0, ay = 0, lp = 0, dx0 = 0, dy0 = 0, dx1 = 0, dy1 = 0;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const xin = line[(wi - D + L) % L];
      const ap = c * xin + ax - c * ay;
      ax = xin;
      ay = ap;
      let z = ap;
      if (nDisp) {
        const o1 = aDisp * z + dx0 - aDisp * dy0;
        dx0 = z;
        dy0 = o1;
        const o2 = aDisp * o1 + dx1 - aDisp * dy1;
        dx1 = o1;
        dy1 = o2;
        z = o2;
      }
      const lo = (1 - S) * z + S * lp;
      lp = z;
      const y = rho * lo + (i < exc.length ? exc[i] : 0);
      line[wi] = y;
      wi = (wi + 1) % L;
      raw[i] = y;
    }
    // the pickups: a comb each (a pickup at p along the string misses the harmonics with a node there), then a
    // magnetic pickup reads the string's velocity: part of a differentiator (the coil's inductance takes the top off)
    const P1 = 0.075 * N0, P2 = 0.2 * N0;
    const i1 = Math.floor(P1), f1 = P1 - i1, i2 = Math.floor(P2), f2 = P2 - i2;
    const [g1, g2] = pickup === 'bright' ? [1, 0] : pickup === 'warm' ? [0, 1] : pickup === 'both' ? [0.6, 0.9] : [1, -0.95];
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t1 = (i - i1 - 1 >= 0 ? raw[i - i1 - 1] * f1 : 0) + (i - i1 >= 0 ? raw[i - i1] * (1 - f1) : 0);
      const t2 = (i - i2 - 1 >= 0 ? raw[i - i2 - 1] * f2 : 0) + (i - i2 >= 0 ? raw[i - i2] * (1 - f2) : 0);
      const y = g1 * (raw[i] - t1) + g2 * (raw[i] - t2);
      d[i] = y - 0.4 * prev;
      prev = y;
    }
    // a level the velocities can count on: the RMS of the first 60 ms
    let e2 = 0;
    const win = Math.min(n, Math.round(sr * 0.06));
    for (let i = 0; i < win; i++) e2 += d[i] * d[i];
    const k = 0.2 / Math.sqrt(e2 / win || 1e-12);
    for (let i = 0; i < n; i++) d[i] *= k;
    for (let i = 0; i < 12; i++) d[i] *= i / 12;
    if (open) {
      clavLoops.set(lk, cutLoop(d, n, sr, f, t60));
      return n;
    }
    return trimTail(d, sr);
  });
  return { buf, loop: open ? (clavLoops.get(lk) ?? null) : null };
}

/**
 * Stationary noise, RMS 1, for the key's knock (a low thud with a little click in it) or a muted note's chick (the
 * felt on the strings: bright): a note plays a stretch of it from anywhere, at its own rate, under its own envelope.
 */
function clavNoise(ctx: BaseAudioContext, kind: 'knock' | 'chick'): AudioBuffer {
  return cachedBuffer(ctx, `clav-noise-${kind}`, 0.5, (d, sr) => {
    const rnd = noiseGen(kind === 'knock' ? 5521 : 6637);
    const lo = bandpass(150, 3, sr), lo2 = bandpass(240, 2, sr), mid = bandpass(900, 1.2, sr), hi = bandpass(3200, 1.4, sr);
    const skip = Math.round(sr * 0.05);
    let e = 0;
    for (let i = 0; i < d.length; i++) {
      const x = rnd();
      const y = kind === 'knock' ? 3 * lo(x) + 1.2 * lo2(x) + 0.35 * mid(x) + 0.12 * hi(x) : hi(x) + 0.5 * mid(x) + 1.2 * lo(x);
      d[i] = y;
      if (i >= skip) e += y * y;
    }
    const k = 1 / Math.sqrt(e / (d.length - skip) || 1);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  });
}

/**
 * Compute a register's clavinet strings ahead (MIDI `lo`..`hi`, every take), so no note has to while the game draws:
 * a few milliseconds of work at a time, every couple of frames. In an offline render it does nothing unless `now`
 * (strings are made when first played, which costs a render the same).
 */
export function warmClav(ctx: BaseAudioContext, lo: number, hi: number, o: { pickup?: ClavPickup; now?: boolean } = {}): void {
  const pickup = o.pickup ?? 'both';
  const jobs: [number, ClavLayer, number][] = [];
  for (let root = clavRoot(lo); root <= clavRoot(hi); root += 4)
    for (const layer of ['open', 'mute', 'rel'] as ClavLayer[]) for (let rr = 0; rr < CLAV_TAKES[layer]; rr++) jobs.push([root, layer, rr]);
  const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
  if (o.now || offline || typeof setTimeout !== 'function') {
    if (o.now) for (const [root, layer, rr] of jobs) clavString(ctx, root, layer, rr, pickup);
    return;
  }
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let i = 0;
  const step = () => {
    const t0 = clock();
    while (i < jobs.length && clock() - t0 < 3) {
      const [root, layer, rr] = jobs[i++];
      clavString(ctx, root, layer, rr, pickup);
    }
    if (i < jobs.length) setTimeout(step, 30);
  };
  setTimeout(step, 30);
}

/** A clavinet's note: `mute` = the felt-damped chick, `gain` = level only (chords at 1/√n). */
export type ClavNote = (t: number, m: number, dur: number, vel: number, mute?: boolean, gain?: number) => void;

/**
 * A clavinet: `(t, m, dur, vel, mute = false, gain = 1)`. A held note rings and dies away for as long as the key is
 * down (harder = brighter, a few cents sharp on the strike, settling); the release lets the yarn stop the string with
 * a soft thup; `mute` plays the felt-damped "chick". Strings are computed every major third (each note played within
 * two semitones of its own), three takes each, taken in turn per key; `warm: [lo, hi]` computes a register's ahead
 * (otherwise a string's first note computes the take it needs, and its other takes follow while the game idles).
 */
export function makeClav(ctx: BaseAudioContext, s: Strip, r: Rnd, o: ClavOpts = {}): ClavNote {
  const { pickup = 'both', wah = 0, tone = 1 } = o;
  // the pickups' coils resonate and roll off the top (as a guitar's do), then the amp's presence
  const amp = chain(s, [ctx.createGain(), biquad(ctx, 'highpass', 70, 0.7), biquad(ctx, 'lowpass', 5400 * tone, 1.3), biquad(ctx, 'peaking', 1500, 0.9, 1.5), biquad(ctx, 'lowpass', 9500, 0.7)]);
  if (o.warm) warmClav(ctx, o.warm[0], o.warm[1], { pickup });
  const sr = ctx.sampleRate;
  const seed = Math.floor(r() * 1e6);
  const turns = new Map<string, number>();
  // once a string has been played, its other takes and layers are made while the game idles (the note call makes
  // only the take it needs): a riff's first bars cost one string each, not eight (`warm` makes a register ahead)
  const seen = new Set<number>();
  /** The take for this note: in turn per key (two keys on one string keep their own turns), now and then one passed over. */
  const take = (layer: ClavLayer, m: number) => {
    const n = CLAV_TAKES[layer], k = layer + Math.round(m);
    let i = (turns.get(k) ?? Math.floor(r() * n)) + 1;
    // never the same take twice running, and the order never settles into a pattern
    if (n > 2 && r() < 0.25) i++;
    turns.set(k, i);
    return i % n;
  };
  return (t, m, dur, vel, mute = false, level = 1) => {
    vel = clamp(vel, 0.02, 1);
    const root = clavRoot(m);
    if (!seen.has(root)) {
      seen.add(root);
      warmClav(ctx, root, root, { pickup });
    }
    const f = mtof(m);
    // the key's own tuning, and a hair of the blow's
    const rate = Math.pow(2, (m - root) / 12) * cents(keyNoise(seed, Math.round(m)) * 1.5 + (r() - 0.5) * 4);
    const u = clamp((m - 36) / 60);
    const lvl = level * 0.53 * Math.pow(vel, 1.15) * (1 + 0.2 * clamp((52 - m) / 16) - 0.25 * clamp((m - 72) / 24)) * dB((r() - 0.5) * 1);
    const nodes: AudioNode[] = [];
    let into: AudioNode = amp;
    if (wah > 0) {
      const lo = 380 + 200 * u, top = lo * (1.6 + 9 * wah * vel);
      const wf = biquad(ctx, 'lowpass', lo, 1.2 + 1.6 * wah);
      wf.frequency.setValueAtTime(lo, t);
      wf.frequency.exponentialRampToValueAtTime(top, t + 0.014);
      wf.frequency.exponentialRampToValueAtTime(lo * 1.3, t + 0.09 + 0.25 * vel);
      wf.connect(amp);
      into = wf;
      nodes.push(wf);
    }
    // how hard the blow is: a softer one feeds the string a rounder pulse, which is this filter on the hardest strike:
    // a slope from `pole` Hz up (a soft blow keeps a harmonic or two, a hard one a dozen and more, the hardest all of
    // them), a little different every time. (Q 0.32: the biquad's lower pole sits at 0.362·fc; fc is set in the
    // bilinear transform's warped frequency, so the pole lands where it is meant to near the top too.)
    const keep = (f * (1.4 + 14 * Math.pow(vel, 2.2)) + 1500 * vel * vel * vel) * (1 + 4 * Math.pow(vel, 8));
    // and a ceiling in Hz, the same at every pitch (the amp hears to ~5 kHz: without it the middle and top of the
    // keyboard would be as bright at 0.8 as at 1), which the hardest blows lift off altogether
    const ceil = (1400 * (1 + 1.2 * vel * vel)) / (1 - 0.94 * Math.pow(vel, 8));
    const pole = Math.pow(keep ** -2 + ceil ** -2, -0.5) * (1 + (r() - 0.5) * 0.08);
    const fc = clamp((sr / Math.PI) * Math.atan(Math.tan((Math.PI * Math.min(pole, sr * 0.45)) / sr) / 0.362), 120, sr * 0.499);
    const lp = biquad(ctx, 'lowpass', fc, 0.32);
    // the filter takes level with the treble, the more harmonics it takes the more: given back as the share of a
    // dozen equal harmonics it lets through (so a soft note is quieter by its velocity, not by its pitch)
    const kept = pole / f;
    const comp = clamp(Math.sqrt(12 / (kept * Math.atan(12 / kept))), 1, 3);
    // the knock of the key (muted: the chick of the felt on the strings), noise of its own, never the same twice
    const kn = ctx.createBufferSource();
    kn.buffer = clavNoise(ctx, mute ? 'chick' : 'knock');
    kn.playbackRate.value = 0.9 + 0.2 * r();
    const kg = ctx.createGain();
    const kd = mute ? 0.0045 : 0.007;
    const kl = lvl * (mute ? 0.2 * (0.5 + 0.5 * vel) : 0.045 * (0.35 + 0.65 * vel)) * dB((r() - 0.5) * 3);
    kg.gain.value = 0;
    kg.gain.setValueAtTime(0, t);
    kg.gain.linearRampToValueAtTime(kl, t + 0.0006);
    kg.gain.exponentialRampToValueAtTime(kl * 1e-3, t + 0.0006 + kd * 6.9);
    kg.gain.linearRampToValueAtTime(0, t + 0.0046 + kd * 6.9);
    kn.connect(kg);
    kg.connect(into);
    kn.start(t, 0.05 + r() * 0.4);
    kn.stop(t + 0.01 + kd * 6.9);

    if (mute) {
      const { buf } = clavString(ctx, root, 'mute', take('mute', m), pickup);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const gn = gainNode(ctx, lvl * 0.55 * comp);
      src.connect(lp);
      lp.connect(gn);
      gn.connect(into);
      src.start(t);
      src.stop(t + buf.duration / rate + 0.01);
      freeWhenDone(src, lp, gn, kn, kg, ...nodes);
      return;
    }
    const { buf, loop } = clavString(ctx, root, 'open', take('open', m), pickup);
    const lpt = loop!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = lpt.ls / sr;
    src.loopEnd = lpt.le / sr;
    // a hard blow stretches the string a few cents sharp; it settles within a few tens of milliseconds
    const gl = (0.0004 + 0.0024 * vel * vel) * (0.8 + 0.4 * r());
    src.playbackRate.setValueAtTime(rate * (1 + gl), t);
    src.playbackRate.setTargetAtTime(rate, t + 0.002, 0.045);
    // the string's life: the buffer to its loop, then the envelope carries the decay on at the rate it had; the key
    // coming up damps it on the yarn
    const off = t + Math.max(0.03, dur);
    const Tls = t + lpt.ls / sr / rate, tauR = lpt.tau / rate;
    const DIE = 3e-4; // −70 dB re the strike: from there it fades out over 40 ms
    const Tdie = Tls + tauR * Math.max(0, Math.log(lpt.lvl / DIE));
    const relT = 0.016 + 0.012 * (1 - u);
    const g = lvl * comp;
    const vca = ctx.createGain();
    vca.gain.value = 0;
    vca.gain.setValueAtTime(g, t);
    let stop: number, ringing: number;
    if (off >= Tdie) {
      vca.gain.setValueAtTime(g, Tls);
      vca.gain.exponentialRampToValueAtTime(g * Math.min(1, DIE / lpt.lvl), Tdie);
      vca.gain.linearRampToValueAtTime(0, Tdie + 0.04);
      stop = Tdie + 0.04;
      ringing = 0;
    } else {
      let v = g;
      if (off > Tls) {
        vca.gain.setValueAtTime(g, Tls);
        v = g * Math.exp(-(off - Tls) / tauR);
        vca.gain.exponentialRampToValueAtTime(v, off);
        ringing = lpt.lvl * (v / g);
      } else {
        vca.gain.setValueAtTime(g, off);
        ringing = Math.pow(lpt.lvl, (off - t) / Math.max(1e-3, Tls - t));
      }
      vca.gain.exponentialRampToValueAtTime(Math.max(1e-9, v * 1e-3), off + relT * 6.9);
      vca.gain.linearRampToValueAtTime(0, off + relT * 6.9 + 0.004);
      stop = off + relT * 6.9 + 0.004;
    }
    // while the loop sustains, the treble goes on dying faster than the fundamental
    const fEnd = Math.max(3.5 * f, 450);
    lp.frequency.setValueAtTime(fc, t);
    if (stop > Tls + 0.05 && fc > fEnd) {
      lp.frequency.setValueAtTime(fc, Tls);
      lp.frequency.exponentialRampToValueAtTime(fEnd, Tls + 5 * tauR);
    }
    src.connect(lp);
    lp.connect(vca);
    vca.connect(into);
    src.start(t);
    src.stop(stop + 0.01);
    let last: AudioScheduledSourceNode = src;
    const others: AudioNode[] = [kn];
    // the tangent leaving the string, if it still rings: softer the more it has died away
    if (off < stop - 0.03 && ringing > 3e-3) {
      const { buf: rb } = clavString(ctx, root, 'rel', take('rel', m), pickup);
      const rs = ctx.createBufferSource();
      rs.buffer = rb;
      rs.playbackRate.value = rate;
      const rg = gainNode(ctx, lvl * 0.16 * Math.pow(0.03 + 0.97 * clamp(ringing / 0.25), 0.8));
      rs.connect(rg);
      rg.connect(amp);
      rs.start(off);
      const rEnd = off + rb.duration / rate + 0.01;
      rs.stop(rEnd);
      nodes.push(rg);
      if (rEnd > stop + 0.01) {
        others.push(src);
        last = rs;
      } else others.push(rs);
    }
    freeWhenDone(last, ...others, lp, vca, kg, ...nodes);
  };
}

// ── the tonewheel organ ─────────────────────────────────────────────────────────────────────
export interface OrganOpts {
  /** Nine drawbars, 0..8 each: 16' 5⅓' 8' 4' 2⅔' 2' 1⅗' 1⅓' 1'. */
  drawbars?: string;
  /** Percussion on detached chords (single-triggered): the 2nd harmonic (4') or the 3rd (2⅔'). It takes the 1' drawbar's place. */
  percussion?: boolean | 'second' | 'third';
  percDecay?: 'fast' | 'slow';
  /** The Leslie's speed at the start, or false for no Leslie (the amp alone). `rotor(speed, t)` changes it. */
  rotary?: 'slow' | 'fast' | false;
  /** How hard the Leslie's amp is driven: 0 clean … 1 growling; louder chords push it further. */
  drive?: number;
  /** Key click, 1 = as on the real one, 0 = none. */
  click?: number;
  /** Where the Leslie registers its rotors' stop (tracks: `k.onStop`). Without it the organ plays without a Leslie. */
  onStop?: (fn: () => void) => void;
}

export type Organ = ((t: number, notes: number[], dur: number, vel: number) => void) & {
  /**
   * Spin the Leslie up or down from `t` (the horn takes a second, the drum several), from whatever speed it has
   * reached by then. Call it in time order.
   */
  rotor(speed: 'slow' | 'fast', t: number): void;
};

/** Contact bounce: a few spikes over a few milliseconds, broadband, the key click of a tonewheel organ. */
function clickBuffer(ctx: BaseAudioContext, v: number, up: boolean): AudioBuffer {
  return cachedBuffer(ctx, `organ-click-${up ? 'up' : 'down'}-${v}`, 0.03, (d, sr) => {
    const rnd = noiseGen(9091 + v * 53 + (up ? 4000 : 0));
    const hi = bandpass(2700 + v * 350, 0.8, sr), mid = bandpass(1300 + v * 180, 1.2, sr);
    const spikes: number[] = [];
    for (let k = 0; k < 4 + (v % 3); k++) spikes.push(Math.round(sr * (k * 0.0011 + rnd() * 0.0012 + (k ? 0.0004 : 0))));
    let peak = 0;
    for (let i = 0; i < d.length; i++) {
      let x = rnd() * 0.25 * Math.exp(-i / (sr * 0.003));
      const w = up ? 16 : 8;
      for (const at of spikes) if (i >= at && i < at + w) x += Math.sin((Math.PI * (i - at + 0.5)) / w) * (at & 1 ? 0.8 : -0.8);
      const y = hi(x) + 0.6 * mid(x);
      d[i] = y;
      peak = Math.max(peak, Math.abs(y));
    }
    for (let i = 0; i < d.length; i++) d[i] /= peak || 1;
    fadeTail(d, sr, 6);
  });
}

/**
 * A Leslie rotor: how fast it turns (Hz) and how long it takes to get there (s), the swell a mic hears as its mouth
 * sweeps by (AM depth), the Doppler (s of delay swing) and the horn's beam of treble (dB at 3 kHz).
 */
interface RotorCfg {
  slow: number;
  fast: number;
  up: number;
  down: number;
  am: number;
  doppler: number;
  beam: number;
}
const HORN: RotorCfg = { slow: 0.82, fast: 6.8, up: 1.0, down: 1.7, am: 0.5, doppler: 0.0005, beam: 4 };
// the drum turns a scoop over the woofer: the low end throbs and moves as well (a 19 cm radius: ±0.5 ms)
const DRUM: RotorCfg = { slow: 0.68, fast: 5.9, up: 4.2, down: 5.6, am: 0.4, doppler: 0.00045, beam: 0 };
/** The two mics' angle apart round the cabinet (radians): nearly opposite, as a pair is set up on either side. */
const MICS = 3.0;

/**
 * A Leslie 122 after the amp: the crossover at 800 Hz (an LR2 pair, the horn's side inverted, so the two add up
 * flat), then each rotor heard by two mics, left and right: for each, the rotor's mouth comes closer (sooner: the
 * Doppler), louder and, from the horn, brighter as it faces the mic, all on one LFO per mic. The rotors' LFOs are
 * locked in pairs and spin up and down together.
 */
function leslie(ctx: BaseAudioContext, s: Strip, from: AudioNode, start: 'slow' | 'fast') {
  const t0 = ctx.currentTime;
  const rotors: { cfg: RotorCfg; lfos: OscillatorNode[]; v0: number; v1: number; at: number; tau: number }[] = [];
  const rotor = (cfg: RotorCfg, input: AudioNode) => {
    const rate = cfg[start];
    const lfos: OscillatorNode[] = [];
    // (each mic's mean level, with the other mic's bleed, about what one panned signal had)
    const g0 = 0.62 / Math.sqrt(1 + (cfg.am * cfg.am) / 2);
    for (const side of [-1, 1]) {
      const ph = Math.PI / 2 - (side > 0 ? MICS : 0);
      const lfo = ctx.createOscillator();
      lfo.setPeriodicWave(periodic(ctx, `leslie-${ph.toFixed(4)}`, [[1, 1, ph]]));
      lfo.frequency.value = rate;
      const dl = ctx.createDelay(0.02);
      dl.delayTime.value = 0.004;
      const dg = gainNode(ctx, -cfg.doppler);
      const am = gainNode(ctx, g0);
      const ag = gainNode(ctx, cfg.am * g0);
      lfo.connect(dg);
      dg.connect(dl.delayTime);
      lfo.connect(ag);
      ag.connect(am.gain);
      input.connect(dl);
      dl.connect(am);
      s.nodes.push(lfo, dl, dg, am, ag);
      let tail: AudioNode = am;
      if (cfg.beam) {
        const pk = biquad(ctx, 'peaking', 3000, 0.8, 0);
        // once per block is plenty for a beam turning at 7 Hz at most (a-rate would remake the filter every sample)
        try {
          pk.gain.automationRate = 'k-rate';
        } catch {
          // an engine without automationRate: the same sweep, a little more work
        }
        const bg = gainNode(ctx, cfg.beam);
        lfo.connect(bg);
        bg.connect(pk.gain);
        am.connect(pk);
        tail = pk;
        s.nodes.push(pk, bg);
      }
      const p = pan(ctx, side * 0.9);
      tail.connect(p);
      p.connect(s.in);
      s.nodes.push(p);
      lfo.start(t0);
      lfos.push(lfo);
    }
    rotors.push({ cfg, lfos, v0: rate, v1: rate, at: t0, tau: 1 });
  };
  const drumIn = ctx.createGain(), hornIn = ctx.createGain();
  s.nodes.push(drumIn, hornIn);
  from.connect(chain(s, [biquad(ctx, 'lowpass', 800, 0.5), biquad(ctx, 'lowpass', 3200, 0.5)], drumIn));
  from.connect(chain(s, [biquad(ctx, 'highpass', 800, 0.5), gainNode(ctx, -1), biquad(ctx, 'peaking', 2400, 1.1, 2.5), biquad(ctx, 'lowpass', 6500, 0.6)], hornIn));
  rotor(DRUM, drumIn);
  rotor(HORN, hornIn);
  return {
    stop: () => {
      for (const q of rotors) for (const x of q.lfos) x.stop();
    },
    /** Towards `speed` from `when`, starting from the speed the rotor has then (inertia: an exponential approach). */
    set(speed: 'slow' | 'fast', when: number) {
      for (const q of rotors) {
        const t = Math.max(when, q.at, ctx.currentTime);
        const v = q.v1 + (q.v0 - q.v1) * Math.exp(-(t - q.at) / q.tau);
        const target = q.cfg[speed];
        const tau = (target > v ? q.cfg.up : q.cfg.down) / 3;
        for (const x of q.lfos) {
          x.frequency.cancelScheduledValues(t);
          x.frequency.setValueAtTime(v, t);
          x.frequency.setTargetAtTime(target, t, tau);
        }
        q.v0 = v;
        q.v1 = target;
        q.at = t;
        q.tau = tau;
      }
    },
  };
}

/**
 * A tonewheel organ through a Leslie: `(t, notes, dur, vel)` plays a chord (its keys down at `t`, up after `dur`);
 * a key that is still down from the chord before (up within 5 ms of `t`) stays down and keeps sounding. Velocity is
 * the expression pedal: louder, more click, the amp pushed into growl. `organ.rotor('fast', t)` spins the Leslie up
 * (the classic gospel swell), `rotor('slow', t)` lets it coast down.
 */
export function makeOrgan(ctx: BaseAudioContext, s: Strip, r: Rnd, o: OrganOpts = {}): Organ {
  const { drawbars = '888000000', percDecay = 'fast', drive = 0.35, click = 1 } = o;
  let spin = o.rotary === undefined ? 'slow' : o.rotary;
  if (spin && !o.onStop) {
    warnOnce('keys: makeOrgan has a Leslie but no onStop to stop its rotors with, so it plays without one (pass onStop: k.onStop, or rotary: false)');
    spin = false;
  }
  const percussion = o.percussion === true ? 'third' : o.percussion || false;
  const bars = drawbars.padEnd(9, '0').slice(0, 9).split('').map((c) => clamp(Number(c) || 0, 0, 8));
  if (percussion) bars[8] = 0;
  // pitch of each drawbar above the key's 8' (semitones), and its group: octaves, tempered fifths, the third
  const SEMI = [-12, 7, 0, 12, 19, 24, 28, 31, 36];
  const GROUP = [0, 1, 0, 0, 1, 0, 2, 1, 0];
  const level = (n: number) => (n ? Math.pow(10, (-3 * (8 - n)) / 20) : 0);
  const sum2 = bars.reduce((a, n) => a + level(n) ** 2, 0) || 1;
  const barNorm = 0.32 / Math.pow(sum2, 0.36);
  const TOP = 114; // the last tonewheel (F#8): higher drawbars fold back an octave
  const PHASE = [0, 2.1, 0.6, 1.4, 2.7, 0.3, 1.9, 1.1, 2.4];
  const foldTo = (p: number) => {
    while (p > TOP) p -= 12;
    return p;
  };

  // the amp: a valve stage, nearly symmetric (odd harmonics and a trace of even ones, so next to no DC to thump with
  // as chords come and go), its curve three times as wide as the signal it was voiced for, so full drawbars driven
  // hard still bend smoothly; a DC blocker; then the Leslie's horn and drum, made once
  const input = ctx.createGain();
  const span = 0.6 + 1.6 * drive;
  const pre = gainNode(ctx, span / 3);
  const valveNode = shaper(ctx, `organ-valve-${drive.toFixed(3)}-x3`, (x) => valve(1 + 2 * drive, 0.04)(3 * x), '4x', 8193);
  const post = gainNode(ctx, 1 / span);
  const dcb = biquad(ctx, 'highpass', 18, 0.5);
  input.connect(pre);
  pre.connect(valveNode);
  valveNode.connect(post);
  post.connect(dcb);
  s.nodes.push(input, pre, valveNode, post, dcb);
  let les: ReturnType<typeof leslie> | null = null;
  if (spin) {
    les = leslie(ctx, s, dcb, spin);
    o.onStop?.(les.stop);
  } else dcb.connect(chain(s, [biquad(ctx, 'peaking', 300, 0.8, 1.5), biquad(ctx, 'lowpass', 7000, 0.6)]));

  /** A key that is down: its wheels' oscillators and its gain, its percussion, when it went down and comes up. */
  interface Key {
    ng: GainNode;
    oscs: OscillatorNode[];
    perc: { x: OscillatorNode; g: GainNode; pts: Pts } | null;
    t: number;
    off: number;
    lvl: number;
    up: UpClick | null;
  }
  /** A chord's key-up click: its gain, when, and how many of its keys still come up then. */
  interface UpClick {
    g: GainNode | null;
    at: number;
    n: number;
    base: number;
  }
  const live = new Map<number, Key>();
  const seed = Math.floor(r() * 1e6);
  const percT60 = percDecay === 'fast' ? 0.6 : 1.7;
  let held = -1;
  let count = 0;
  const upLevel = (q: UpClick) => (q.n > 0 ? q.base * Math.pow(q.n, 0.25) : 0);
  /** One key fewer comes up with that chord's click (it stays down into the next chord). */
  const stayDown = (q: UpClick) => {
    q.n--;
    if (!q.g) return;
    q.g.gain.cancelScheduledValues(q.at);
    q.g.gain.setValueAtTime(upLevel(q), q.at);
  };

  /** A key held from one chord into the next keeps sounding: its level moves to the new chord's, its percussion goes on dying. */
  const hold = (k: Key, t: number, off: number, lvl: number): boolean => {
    const at = Math.min(k.off, t);
    const newOff = Math.max(k.off, off);
    const percOn = k.perc !== null && (k.oscs.length === 0 || envAt(k.perc.pts, at - k.t) > 1e-5);
    try {
      for (const x of k.oscs) x.stop(newOff + 0.04);
      if (percOn) k.perc!.x.stop(newOff + 0.04);
    } catch {
      // an engine that will not move a stop: the key is struck again instead
      return false;
    }
    const g = k.ng.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(k.lvl, at);
    if (Math.abs(lvl - k.lvl) > 1e-5) {
      g.setValueAtTime(k.lvl, t);
      g.linearRampToValueAtTime(lvl, t + 0.025);
    }
    g.setValueAtTime(lvl, newOff);
    g.linearRampToValueAtTime(0, newOff + 0.018);
    if (k.perc && percOn) {
      k.perc.g.gain.cancelScheduledValues(at);
      envFrom(k.perc.g.gain, k.t, k.perc.pts, at, newOff, 0.004);
    }
    k.off = newOff;
    k.lvl = lvl;
    return true;
  };

  /** A key going down: the three wheel groups as this key draws them, folded at the top, and the percussion. */
  const press = (m: number, t: number, off: number, lvl: number, perc: boolean): Key | null => {
    // a tonewheel's tuning is fixed by its gears: the same every time the key goes down
    const dt = cents(keyNoise(seed, Math.round(m)) * 0.3);
    // each group's base is its lowest wheel (octaves on the 16', the tempered fifths on the 5⅓', the tempered third
    // alone), the rest its harmonics
    const parts: [number, number, number][][] = [[], [], []];
    const base = [Infinity, Infinity, Infinity];
    for (let i = 0; i < 9; i++) if (bars[i]) base[GROUP[i]] = Math.min(base[GROUP[i]], foldTo(m + SEMI[i]));
    for (let i = 0; i < 9; i++) {
      if (!bars[i]) continue;
      const g = GROUP[i];
      const h = Math.max(1, Math.round(Math.pow(2, (foldTo(m + SEMI[i]) - base[g]) / 12)));
      const a = level(bars[i]) * barNorm;
      // a drawbar folded back onto another's wheel adds to it in phase (it is the same wheel)
      const same = parts[g].find((q) => q[0] === h);
      if (same) same[1] += a;
      else parts[g].push([h, a, PHASE[i]]);
    }
    const ng = ctx.createGain();
    ng.gain.value = 0;
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(lvl, t + 0.0035);
    ng.gain.setValueAtTime(lvl, off);
    ng.gain.linearRampToValueAtTime(0, off + 0.018);
    const oscs: OscillatorNode[] = [];
    parts.forEach((ps, g) => {
      if (!ps.length) return;
      const key = `organ-${g}-` + ps.map((q) => `${q[0]}:${q[1].toFixed(4)}:${q[2]}`).join(',');
      const x = ctx.createOscillator();
      x.setPeriodicWave(periodic(ctx, key, ps));
      x.frequency.value = mtof(base[g]) * dt;
      x.connect(ng);
      // the key's contacts close one after another, a millisecond or so apart: that is the click (none without it)
      x.start(t + (g ? (0.0004 + r() * 0.0011) * Math.min(1, click) : 0));
      x.stop(off + 0.04);
      oscs.push(x);
    });
    let pc: Key['perc'] = null;
    if (perc) {
      const x = ctx.createOscillator();
      x.frequency.value = mtof(foldTo(m + (percussion === 'second' ? 12 : 19))) * dt;
      const pg = ctx.createGain();
      const pts: Pts = [[0.001, barNorm * 0.95], [percT60, barNorm * 0.95e-3]];
      env(pg.gain, t, pts, off, 0.004);
      x.connect(pg);
      pg.connect(ng);
      x.start(t);
      x.stop(off + 0.04);
      pc = { x, g: pg, pts };
    }
    const srcs = pc ? [...oscs, pc.x] : oscs;
    // every drawbar in and no percussion to strike: nothing sounds
    if (!srcs.length) return null;
    ng.connect(input);
    // each key frees itself: a key held into the next chord outlives the chord it went down with
    freeWhenDone(srcs[0], ...srcs.slice(1), ng, ...(pc ? [pc.g] : []));
    return { ng, oscs, perc: pc, t, off, lvl, up: null };
  };

  const play = (t: number, notes: number[], dur: number, vel: number) => {
    const keys = [...new Set(notes.map((m) => Math.round(m * 100) / 100))];
    if (!keys.length) return;
    vel = clamp(vel, 0.02, 1);
    const off = t + Math.max(0.03, dur);
    // percussion only on a fresh touch: no key may still be down
    const perc = !!percussion && t >= held - 0.004;
    // tonewheel chords add up more than random voices would (shared pitches): more than 1/√n
    const chordLvl = (0.42 + 1.3 * vel) / Math.pow(keys.length, 0.75);
    for (const [id, k] of live) if (k.off + 0.1 < t) live.delete(id);
    const up: UpClick = { g: null, at: Math.max(off, t + 0.032), n: 0, base: 0 };
    let fresh = 0;
    for (const m of keys) {
      const id = Math.round(m * 100);
      // the generator's taper: the top wheels a little softer
      const lvl = (1 - 0.3 * clamp((m - 60) / 36)) * chordLvl;
      const k = live.get(id);
      if (k && k.off >= t - 0.005 && k.t < t - 0.002 && hold(k, t, off, lvl)) {
        if (k.up) stayDown(k.up);
        k.up = up;
        up.n++;
        continue;
      }
      const nk = press(m, t, off, lvl, perc);
      if (!nk) continue;
      nk.up = up;
      up.n++;
      fresh++;
      live.set(id, nk);
    }
    held = Math.max(held, off);
    // the click: contact bounce as keys go down (only those that do), a softer one as they come up
    if (click > 0 && up.n > 0) {
      const v = count++ % 6;
      const kg = ctx.createGain();
      kg.gain.value = 0;
      const base = 0.085 * click * (0.5 + 0.7 * vel);
      const nodes: AudioNode[] = [kg];
      if (fresh) {
        kg.gain.setValueAtTime(base * Math.pow(fresh, 0.25), t);
        const a = ctx.createBufferSource();
        a.buffer = clickBuffer(ctx, v, false);
        a.playbackRate.value = 0.9 + 0.2 * r();
        a.connect(kg);
        a.start(t);
        a.stop(t + 0.032);
        nodes.push(a);
      }
      up.g = kg;
      up.base = base * 0.3;
      kg.gain.setValueAtTime(upLevel(up), up.at);
      const b = ctx.createBufferSource();
      b.buffer = clickBuffer(ctx, v, true);
      b.connect(kg);
      b.start(up.at);
      b.stop(up.at + 0.032);
      kg.connect(input);
      freeWhenDone(b, ...nodes);
    }
  };
  return Object.assign(play, {
    rotor(speed: 'slow' | 'fast', t: number) {
      les?.set(speed, t);
    },
  });
}

// ── demos (dev: tools/audio/render.mjs fn /src/audio/voices/keys.ts demoX) ──────────────────
/** A clock for the demos: `at(bar, step)` on a 16-step bar, the off-16ths swung by `swing` of a step, a little loose. */
function grid(lab: Lab, bpm: number, swing = 0, loose = 0.006) {
  const step = 60 / bpm / 4;
  return {
    at: (bar: number, s: number) => lab.t0 + (bar * 16 + s) * step + (Math.floor(s) % 2 ? swing * step : 0) + (lab.r() - 0.5) * 2 * loose,
    len: (steps: number) => steps * step,
  };
}

/** Rhodes: neo-soul in F, soft then hard — Fmaj9 · Bbmaj9 · Am9 Dm9 · Gm9 C9sus4, then again leaning in, with a fill. */
export function demoRhodes(lab: Lab): void {
  const ep = makeEPiano(lab.ctx, lab.strip('rhodes', { gain: 0.5, rev: 0.2, del: 0.04 }), lab.r, { model: 'rhodes', tremolo: 3.6, onStop: lab.onStop });
  const g = grid(lab, 80, 0.16);
  const ch = (t: number, notes: number[], dur: number, vel: number, spread = 0.014) => keysChord(ep, lab.r, t, notes, dur, vel, spread);
  const FMAJ9 = [41, 48, 57, 64, 67], BBMAJ9 = [46, 53, 57, 60, 62], AM9 = [45, 55, 59, 60, 64], DM9 = [38, 48, 53, 57, 64];
  const GM9 = [43, 53, 58, 62, 69], C9SUS = [36, 46, 53, 58, 62, 67], BB_C = [36, 58, 62, 65, 69];
  const comp = (bar: number, a: number[], b: number[] | null, v: number) => {
    ch(g.at(bar, 0), a, g.len(b ? 7.5 : 11), v);
    // a ghosted re-strike of the top notes on the and of 2, then the next chord pushed a sixteenth early
    ch(g.at(bar, 6), a.slice(-3), g.len(1.4), v * 0.6, 0.006);
    if (b) ch(g.at(bar, 7.75), b, g.len(8), v * 0.95);
  };
  comp(0, FMAJ9, null, 0.46);
  comp(1, BBMAJ9, null, 0.5);
  comp(2, AM9, DM9, 0.52);
  comp(3, GM9, C9SUS, 0.56);
  // a quiet answer up top over the sus chord, a repeated note leaning into the next bar
  [[72, 12], [74, 13], [77, 14], [77, 15]].forEach(([m, s], i) => ep(g.at(3, s), m, g.len(1), 0.46 + i * 0.05, 0.2));
  // hard: the same changes with the bark in them, a pentatonic fill up and down
  ch(g.at(4, 0), FMAJ9, g.len(6), 0.86, 0.016);
  const fill: [number, number, number][] = [[72, 6, 0.72], [74, 7, 0.68], [77, 8, 0.86], [78, 9, 0.5], [79, 9.5, 0.82], [81, 10, 0.92], [79, 11, 0.74], [77, 12, 0.84], [74, 13, 0.72], [72, 14, 0.8], [69, 15, 0.7]];
  for (const [m, s, v] of fill) ep(g.at(4, s), m, g.len(m === 78 ? 0.4 : 0.9), v, 0.2);
  ch(g.at(5, 0), BBMAJ9, g.len(7.5), 0.94);
  ch(g.at(5, 6), [62, 65, 69], g.len(1.2), 0.62, 0.006);
  ch(g.at(5, 7.75), BB_C, g.len(8), 0.88);
  // home: a wide Fmaj9 from the bottom of the keyboard, let ring
  ch(g.at(6, 0), [29, 41, 48, 57, 64, 67, 72, 76], g.len(22), 1, 0.026);
}

/** Wurlitzer: a pumping 70s figure in C (soft), a hard pentatonic riff with the growl in it, a C6/9 to finish. */
export function demoWurli(lab: Lab): void {
  const ep = makeEPiano(lab.ctx, lab.strip('wurli', { gain: 0.52, rev: 0.16, del: 0.03 }), lab.r, { model: 'wurli', onStop: lab.onStop });
  const g = grid(lab, 108, 0.04);
  const ch = (t: number, notes: number[], dur: number, vel: number, spread = 0.004) => keysChord(ep, lab.r, t, notes, dur, vel, spread);
  const rh = [[64, 67, 72], [65, 69, 72], [62, 67, 71], [64, 67, 69, 72]];
  const lh = [[48, 43], [41, 48], [47, 43], [45, 40]];
  for (let bar = 0; bar < 4; bar++) {
    // eighths, the off-beats pushed: the Supertramp pump
    for (let e = 0; e < 8; e++) ch(g.at(bar, e * 2), rh[bar], g.len(1.5), (e % 2 ? 0.52 : 0.42) + bar * 0.03 + (e === 7 ? 0.04 : 0));
    ep(g.at(bar, 0), lh[bar][0], g.len(7), 0.5, -0.2);
    ep(g.at(bar, 8), lh[bar][1], g.len(6), 0.45, -0.2);
  }
  // the riff, hard: up the C pentatonic and back with a blue grace note, the left hand stabbing under it
  const riff: [number, number, number, number][] = [[60, 0, 1.5, 0.84], [62, 2, 1.5, 0.8], [63, 3.6, 0.3, 0.7], [64, 4, 1.5, 0.9], [67, 6, 1.5, 0.86], [69, 8, 1.5, 0.92], [72, 10, 2.5, 1],
    [69, 14, 1.5, 0.86], [67, 16, 1.5, 0.84], [64, 18, 1.5, 0.88], [63, 19.6, 0.3, 0.7], [62, 20, 1.5, 0.84], [60, 22, 3, 0.95], [67, 26, 1, 0.8], [69, 27, 1, 0.82], [72, 28, 3, 0.98]];
  for (const [m, s, l, v] of riff) ep(g.at(4, s), m, g.len(l), v, 0.25);
  for (const s of [0, 6, 12, 16, 22, 28]) ch(g.at(4, s), [48, 52, 55], g.len(1.2), 0.86);
  // C6/9, hard, held
  ch(g.at(6, 0), [36, 48, 55, 62, 64, 69, 76], g.len(20), 0.96, 0.02);
}

/** DX7 E.PIANO 1: city-pop changes in D (Gmaj9 · F#m7 B7 · Em9 · A13 …) comped in pushed sixteenths, then a fast line over them. */
export function demoDX(lab: Lab): void {
  const ep = makeEPiano(lab.ctx, lab.strip('dx', { gain: 0.55, rev: 0.2, del: 0.1 }), lab.r, { model: 'dx', onStop: lab.onStop });
  const g = grid(lab, 112, 0.02, 0.004);
  // rootless four-note voicings in the right hand, the root once a chord in the left
  const CH: [number, number[]][][] = [
    [[43, [54, 57, 59, 62]]],
    [[42, [52, 57, 61, 64]], [47, [57, 61, 63, 66]]],
    [[40, [50, 55, 59, 66]]],
    [[33, [55, 59, 61, 66]]],
    [[38, [54, 57, 61, 64]]],
    [[47, [57, 61, 62, 66]]],
    [[40, [50, 55, 59, 66]], [45, [55, 59, 61, 66]]],
    [[38, [54, 57, 61, 64]]],
  ];
  // the comp: hits on 1, the a of 1, the and of 2, 3 and the a of 3 (two chords: the second from the middle)
  const hits: [number, number, number][] = [[0, 3, 0.62], [3, 3, 0.5], [6, 4, 0.56], [10, 2, 0.5], [12, 4, 0.58]];
  CH.forEach((chs, bar) => {
    chs.forEach(([root], k) => ep(g.at(bar, k * 8), 43 + ((((root - 43) % 12) + 12) % 12), g.len(chs.length > 1 ? 7.5 : 15), 0.62, -0.15));
    // under the line the comp leaves room: three hits a bar
    for (const [s2, l, v] of bar >= 4 ? hits.filter((h) => h[0] % 6 === 0) : hits) keysChord(ep, lab.r, g.at(bar, s2), (chs.length > 1 && s2 >= 8 ? chs[1] : chs[0])[1], g.len(l) * 0.92, v * (bar >= 4 ? 0.88 : 1), 0.003);
  });
  // the line: a city-pop hook with sixteenth runs (D major), loud enough to sparkle
  const line: [number, number, number, number][] = [
    [69, 0, 2, 0.72], [71, 2, 1, 0.66], [73, 3, 1, 0.7], [74, 4, 2, 0.84], [76, 6, 1, 0.74], [78, 7, 3, 0.88], [76, 10, 1, 0.7], [74, 11, 1, 0.72], [73, 12, 2, 0.8], [71, 14, 2, 0.7],
    [69, 16, 1, 0.74], [71, 17, 1, 0.7], [73, 18, 1, 0.74], [74, 19, 1, 0.78], [76, 20, 1, 0.8], [78, 21, 1, 0.84], [81, 22, 4, 0.92], [78, 26, 1, 0.74], [76, 27, 1, 0.72], [74, 28, 2, 0.8], [73, 30, 2, 0.74],
    [71, 32, 2, 0.76], [74, 34, 1, 0.72], [73, 35, 1, 0.7], [71, 36, 1, 0.72], [69, 37, 1, 0.74], [66, 38, 2, 0.78], [69, 40, 2, 0.8], [71, 42, 1, 0.74], [73, 43, 1, 0.78], [74, 44, 4, 0.86],
    [76, 48, 1, 0.8], [78, 49, 1, 0.82], [79, 50, 1, 0.84], [81, 51, 1, 0.88], [83, 52, 1, 0.9], [85, 53, 1, 0.92], [86, 54, 8, 0.96],
  ];
  for (const [m, s, l, v] of line) ep(g.at(4, s), m, g.len(l) * 0.95, v, 0.15);
}

/** Clavinet: a sixteenth-note riff in F with muted chicks, backbeat stabs over it, then the wah, a held chord to end. */
export function demoClav(lab: Lab): void {
  const clav = makeClav(lab.ctx, lab.strip('clav', { gain: 1, rev: 0.08, pan: -0.1 }), lab.r, { pickup: 'both' });
  const wah = makeClav(lab.ctx, lab.strip('clav-wah', { gain: 1, rev: 0.1, pan: 0.1 }), lab.r, { pickup: 'both', wah: 0.75 });
  const g = grid(lab, 100, 0.1, 0.004);
  // one bar of the riff: [pitch, kind] a step; X accent, o note, g ghost, m muted chick
  const RIFF: [number, string][][] = [
    [[53, 'X'], [53, 'm'], [53, 'g'], [51, 'o'], [51, 'm'], [48, 'o'], [50, 'X'], [50, 'm'], [53, 'o'], [53, 'g'], [53, 'm'], [57, 'o'], [57, 'm'], [60, 'X'], [57, 'g'], [51, 'o']],
    [[53, 'X'], [53, 'm'], [53, 'g'], [51, 'o'], [51, 'm'], [48, 'o'], [50, 'X'], [50, 'm'], [53, 'o'], [55, 'g'], [57, 'X'], [57, 'm'], [58, 'o'], [57, 'g'], [55, 'o'], [53, 'm']],
  ];
  const VEL: Record<string, number> = { X: 0.95, o: 0.7, g: 0.38, m: 0.75 };
  const riff = (play: ClavNote, bar: number, which: number, lift = 0) =>
    RIFF[which].forEach(([m, k], s) => play(g.at(bar, s), m, g.len(k === 'X' ? 1.6 : 0.8), Math.min(1, VEL[k] + lift + (lab.r() - 0.5) * 0.08), k === 'm'));
  riff(clav, 0, 0);
  riff(clav, 1, 1);
  riff(clav, 2, 0, 0.03);
  riff(clav, 3, 1, 0.03);
  // backbeat stabs up top: F6 and Bb/F dyads, short and hard
  for (const bar of [2, 3])
    for (const [s, ch] of [[4, [69, 74]], [12, [70, 74]], [14, [69, 72]]] as [number, number[]][]) ch.forEach((m) => clav(g.at(bar, s), m, g.len(0.9), 0.9, false, 0.75));
  // the wah takes it
  riff(wah, 4, 0, 0.02);
  riff(wah, 5, 1, 0.05);
  // the turnaround: a run up, a held F7 voicing that lets the tangents go (the release thup), one last chick
  [[48, 0], [50, 1], [51, 2], [53, 3], [55, 4], [57, 5], [58, 6], [60, 7]].forEach(([m, s], i) => clav(g.at(6, s), m, g.len(0.8), 0.6 + i * 0.05));
  [53, 57, 63, 65].forEach((m, i) => clav(g.at(6, 8) + i * 0.004, m, g.len(5), 0.92, false, 0.55));
  clav(g.at(6, 14), 53, g.len(1), 0.8, true);
  // and a chord held long, dying away on the loop
  clav(g.at(7, 0), 41, g.len(10), 1, false, 0.7);
  [53, 57, 60, 63].forEach((m, i) => clav(g.at(7, 0) + 0.004 * (i + 1), m, g.len(10), 0.85, false, 0.5));
}

/** Organ: gospel in Ab — stabs with the percussion on the slow Leslie, then held chords as it spins up, home on the fast one. */
export function demoOrgan(lab: Lab): void {
  const og = makeOrgan(lab.ctx, lab.strip('organ', { gain: 0.88, rev: 0.12 }), lab.r, { drawbars: '888800000', percussion: 'third', rotary: 'slow', drive: 0.4, onStop: lab.onStop });
  const beat = 60 / 76;
  const at = (b: number) => lab.t0 + b * beat + (lab.r() - 0.5) * 0.008;
  const AB = [44, 56, 60, 63, 68], AB_C = [48, 56, 60, 63, 68], DB = [49, 56, 61, 65, 68], DDIM = [50, 56, 59, 62, 65], AB_EB = [51, 56, 60, 63, 68];
  const F7 = [41, 57, 60, 63, 65], BBM7 = [46, 56, 61, 65], EB7SUS = [39, 56, 58, 61], EB7 = [39, 55, 58, 61];
  const AB7_GB = [42, 56, 60, 63, 66], DB_F = [41, 56, 61, 65, 68], DBM_E = [40, 56, 61, 64, 68], HOME = [44, 51, 56, 60, 63, 68, 72];
  // detached stabs (the percussion speaks on each), a gospel walk-up
  const seq: [number, number[], number, number][] = [
    [0, AB, 0.38, 0.66], [1.5, AB, 0.3, 0.6], [2, AB_C, 1.7, 0.68], [4, DB, 0.38, 0.7], [5.5, DB, 0.3, 0.62], [6, DDIM, 1.7, 0.72],
    [8, AB_EB, 0.9, 0.74], [9, F7, 0.9, 0.76], [10, BBM7, 0.9, 0.78], [11, EB7SUS, 0.48, 0.8], [11.5, EB7, 0.48, 0.82],
  ];
  // then legato (no percussion: a key is always down; the common tones stay down), louder, the Leslie spinning up
  const held: [number, number[], number, number][] = [
    [12, AB, 2.02, 0.86], [14, AB7_GB, 2.02, 0.9], [16, DB_F, 2.02, 0.93], [18, DBM_E, 2.02, 0.95], [20, AB_EB, 2.02, 0.97], [22, EB7SUS, 1.02, 0.98], [23, EB7, 1.02, 1],
  ];
  for (const [b, n, l, v] of [...seq, ...held]) og(at(b), n, l * beat, v);
  og.rotor('fast', lab.t0 + 11.8 * beat);
  og(at(24), HOME, 5 * beat, 1);
}
