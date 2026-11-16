/**
 * The synth family (score v3): the voices of the 1980s FM and analogue-polysynth era, for Act II's city pop (a DX7
 * brass section, a Juno/Jupiter polysynth, the DX slap bass, a Moog bass) and Act V's light (a glassy arpeggio
 * pluck, a shimmering FM bell).
 *
 * Two kinds of FM. The brass, the pluck's glass and the sparkle drive a carrier's frequency with a cosine (or a saw of
 * cosines): its phase then moves by a sine, which keeps a 1:1 pair centred while the index moves slowly against the
 * carrier's cycle. The bass, whose index falls within a few cycles of a low note, does true phase modulation the DX7's
 * way, through a delay line whose length swings, so no offset can build up however fast the index moves; its carrier
 * runs whole periods ahead of the note, so the line never reads from before it began. Indices are scaled by key and
 * velocity, so a voice is as bright at the bottom of its range as at the top, and kept below where sidebands would
 * fold back past Nyquist.
 *
 * Standard nodes only. Every voice starts and ends at exact zero gain, schedules its own stop and frees its nodes
 * when it ends; the shared stages (EQ, drive, chorus) are made once per instrument and put on the strip, so the
 * track's teardown disconnects them. Velocity changes the sound, not only its level: harder is brighter and bites.
 */
import { freeWhenDone, voiceFilter } from '../engine';
import { mtof, pan, type Rnd, type Strip } from '../synth';
import { cachedBuffer, fadeTail, noiseGen, normalise } from './buffers';
import { askWorker } from './offthread';
import { chorus } from './fx';
import type { Lab } from './lab';

type OnStop = (fn: () => void) => void;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ── wave tables ─────────────────────────────────────────────────────────────────────────────
const tables = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/** A PeriodicWave from cosine (`re`) and sine (`im`) amplitudes of partials 1…n, made once per context. */
function table(ctx: BaseAudioContext, name: string, re: readonly number[], im: readonly number[] = []): PeriodicWave {
  let m = tables.get(ctx);
  if (!m) tables.set(ctx, (m = new Map()));
  let w = m.get(name);
  if (!w) {
    const n = Math.max(re.length, im.length) + 1;
    const a = new Float32Array(n), b = new Float32Array(n);
    re.forEach((v, i) => (a[i + 1] = v));
    im.forEach((v, i) => (b[i + 1] = v));
    w = ctx.createPeriodicWave(a, b);
    m.set(name, w);
  }
  return w;
}

/** A cosine: into a carrier's frequency it moves the phase by a sine (the frequency-driven pairs' modulator). */
const COS = [1];
/**
 * A DX operator fed back on itself: a saw (partials at 1/k). Into a carrier's frequency it moves the phase by 1/k², so
 * a 1:1 pair rolls off smoothly like a brass instrument (0, −3, −9, −14, −18 dB … at a fundamental index of 1.2)
 * instead of a sine pair's hollow octave.
 */
const RICH = Array.from({ length: 8 }, (_, i) => 1 / (i + 1));
/** The browser normalises a table to a peak of 1: the saw's fundamental is this much of its peak (all cosines). */
const RICH_FUND = 1 / RICH.reduce((a, b) => a + b, 0);
/** A 28% pulse: hollow and bright, the glassy pluck's body (the browser band-limits it per octave). */
const PULSE28 = Array.from({ length: 56 }, (_, i) => (2 / (Math.PI * (i + 1))) * Math.sin(Math.PI * (i + 1) * 0.28));

/** An oscillator on a table (or a sine), its detune read once a block (pitch bends and vibrato are slow). */
function voice(ctx: BaseAudioContext, f: number, w: PeriodicWave | null, type: OscillatorType = 'sine'): OscillatorNode {
  const o = ctx.createOscillator();
  if (w) o.setPeriodicWave(w);
  else o.type = type;
  o.frequency.value = f;
  o.detune.automationRate = 'k-rate';
  return o;
}

// ── envelopes ───────────────────────────────────────────────────────────────────────────────
/** A breakpoint: `dt` seconds after the last one, a linear ramp to `v` (or an exponential one with `exp`). */
type Pt = readonly [dt: number, v: number, exp?: boolean];

interface Env {
  /** When it is back at rest (exact zero, for a gain). */
  end: number;
  /** Its value at a time, as scheduled. */
  at(time: number): number;
  /**
   * Fade it out from `time` over `fade` seconds (a new note on the same string). It may be called again: an earlier
   * time replaces the later fade, a later one is ignored.
   */
  choke(time: number, fade: number): void;
  /**
   * Stop it at `time` where it has got to: everything after is cancelled, the ramp running then is put back up to
   * `time`, and the value there is returned, for a new envelope to carry on from (a legato note).
   */
  hold(time: number): number;
  /** When it was choked or held (Infinity if never). */
  readonly cut: number;
}

/**
 * A breakpoint envelope on `p`: from `v0` at `t` through the points, held at the last value until `off` (a note
 * released early is cut where it has got to, the value there computed, so nothing jumps), then a release of `rel`
 * seconds: for a gain (no `rest`) a fall to −60 dB and a last 5 ms to exact zero; otherwise an exponential glide to
 * `rest`. Exponential ramps never touch zero. `fresh` = false carries on a param already automated (after `hold`):
 * its value is left alone (setting it would insert an event at the context's current time).
 */
function envelope(p: AudioParam, t: number, v0: number, pts: readonly Pt[], off: number, rel: number, rest?: number, fresh = true): Env {
  const gain = rest === undefined;
  const segs: { t0: number; v0: number; t1: number; v1: number; exp: boolean }[] = [];
  let tc = t, vc = v0;
  if (fresh) p.value = v0;
  p.setValueAtTime(v0, t);
  const go = (t1: number, v1: number, exp = false) => {
    const e = exp && vc > 0 && v1 > 0 && vc !== v1;
    if (e) p.exponentialRampToValueAtTime(v1, t1);
    else p.linearRampToValueAtTime(v1, t1);
    segs.push({ t0: tc, v0: vc, t1, v1, exp: e });
    tc = t1;
    vc = v1;
  };
  off = Math.max(off, t + 0.002);
  for (const [dt, v, exp] of pts) {
    const t1 = tc + Math.max(1e-4, dt);
    if (t1 <= off) {
      go(t1, v, exp);
      continue;
    }
    if (off > tc + 1e-5) {
      const k = (off - tc) / (t1 - tc);
      const e = !!exp && vc > 0 && v > 0;
      go(off, e ? vc * Math.pow(v / vc, k) : vc + (v - vc) * k, e);
    }
    break;
  }
  if (tc < off) go(off, vc);
  if (gain) {
    if (vc > 1e-6) go(off + rel, vc * 1e-3, true);
    go(tc + 0.005, 0);
  } else go(off + rel, rest, true);
  const end = tc, last = vc;
  const at = (time: number): number => {
    if (time <= t) return v0;
    for (const s of segs)
      if (time <= s.t1) {
        const k = (time - s.t0) / Math.max(1e-9, s.t1 - s.t0);
        return s.exp ? s.v0 * Math.pow(s.v1 / s.v0, k) : s.v0 + (s.v1 - s.v0) * k;
      }
    return last;
  };
  let cut = Infinity;
  const hold = (time: number): number => {
    const v = at(time);
    // cancelling removes the ramp that was running (it ends after `time`) and anything later (an earlier fade
    // included): put the ramp back up to `time`
    p.cancelScheduledValues(time);
    if (time > t) {
      const s = segs.find((x) => x.t0 < time && time <= x.t1);
      if (s?.exp && v > 0) p.exponentialRampToValueAtTime(v, time);
      else p.linearRampToValueAtTime(v, time);
    }
    cut = Math.min(cut, time);
    return v;
  };
  return {
    end,
    at,
    hold,
    get cut() {
      return cut;
    },
    choke(time, fade) {
      if (time >= end || time >= cut) return;
      hold(time);
      p.linearRampToValueAtTime(gain ? 0 : (rest as number), time + fade);
    },
  };
}

/**
 * Start every source at its time (a buffer from `offset` seconds in, when given), stop them all after `end`, and free
 * the voice when the first one has ended (it must be one that lasts: an oscillator).
 */
function launch(srcs: [AudioScheduledSourceNode, number, number?][], end: number, nodes: AudioNode[]): void {
  for (const [x, at, offset] of srcs) {
    if (offset !== undefined && x instanceof AudioBufferSourceNode) x.start(at, offset);
    else x.start(at);
    x.stop(end + 0.02);
  }
  freeWhenDone(srcs[0][0], ...srcs.slice(1).map(([x]) => x), ...nodes);
}

/** Stop a voice's sources early (it was choked). A source that has already been told to stop is told again. */
function stopEarly(srcs: AudioScheduledSourceNode[], when: number): void {
  for (const x of srcs)
    try {
      x.stop(when);
    } catch {
      // already ended
    }
}

// ── shared stages ───────────────────────────────────────────────────────────────────────────
/** A tanh curve with unity slope at zero (it only bends the peaks), odd-sized so zero maps to exact zero. */
function tanhCurve(h: number): Float32Array<ArrayBuffer> {
  const n = 4097, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(h * x) / h;
  }
  return c;
}

/**
 * Gentle drive: `input` (gain = how hard the shaper is hit) → a 4× oversampled tanh → `1 / gain`, so quiet notes
 * pass clean and loud ones round off and thicken. Returns the node voices connect to and the stage's last node.
 */
function drive(ctx: BaseAudioContext, s: Strip, amount: number): { input: GainNode; out: AudioNode } {
  const input = ctx.createGain();
  const hit = 0.12 + 0.65 * clamp(amount, 0, 1.5);
  input.gain.value = hit;
  const ws = ctx.createWaveShaper();
  ws.curve = tanhCurve(3);
  ws.oversample = '4x';
  const trim = ctx.createGain();
  trim.gain.value = 1 / hit;
  input.connect(ws);
  ws.connect(trim);
  s.nodes.push(input, ws, trim);
  return { input, out: trim };
}

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number, gain = 0): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = gain;
  return b;
}

/** A shared chorus at the end of an instrument, when the caller can stop its LFOs (`onStop`); else straight on. */
function ending(ctx: BaseAudioContext, s: Strip, from: AudioNode, mix: number, onStop: OnStop | undefined, o: { rate: number; depth: number; delay: number }): void {
  if (mix > 0 && onStop) {
    const fx = chorus(ctx, s.in, { mix, ...o });
    onStop(fx.stop);
    from.connect(fx.input);
    s.nodes.push(fx.input);
  } else from.connect(s.in);
}

/** White noise, a second of it, for breath and clicks (made once). */
function noise(ctx: BaseAudioContext): AudioBuffer {
  return cachedBuffer(ctx, 'synths:noise', 1, (d) => {
    const g = noiseGen(4242);
    for (let i = 0; i < d.length; i++) d[i] = g() * 0.7;
  });
}

// ── FM brass ────────────────────────────────────────────────────────────────────────────────
/**
 * `auto` is a stab for a note under a second and a held note (the stab's attack and blat, then a steady sustain) for a
 * longer one; `swell` crescendos into the note (only when asked for); `fall` drops off the end of the note (the horn
 * section's fall), `doit` scoops up off it.
 */
export type BrassShape = 'auto' | 'stab' | 'hold' | 'swell' | 'fall' | 'doit';

export interface FMBrassOpts {
  /** Brightness: 0.6 mellow horns … 1 a section … 1.5 biting. */
  bite?: number;
  /** Cents between the two players on the top note (the section's width in pitch). */
  detune?: number;
  /** How far apart the players sit, 0..1. */
  width?: number;
  /** Seconds a stab takes to stop speaking (held notes and swells take twice as long). */
  release?: number;
  /** Vibrato on the top note of long notes, cents; it arrives once the note has settled. */
  vibrato?: number;
  /** Breath on the attack, 0..1. */
  breath?: number;
  /** An ensemble chorus over the section (its wet share; 0.25 by default), when `onStop` is given. */
  chorus?: number;
  onStop?: OnStop;
}

const BRASS_LEVEL = 0.31;

/**
 * A DX7 brass section. The top note of a chord is two players a few cents and milliseconds apart, panned apart: one a
 * 1:1 FM pair on a saw modulator (the DX's operator with feedback: a brass roll-off, the fundamental strongest), one
 * on a sine (a rounder pair, more body); each inner note is one saw player, a moment late, and the chorus spreads them.
 * The index grows with velocity (bright when loud) and blats past where it settles on the attack; the top note scoops
 * a few cents up into the note and carries the vibrato; the sound darkens as it stops. Through a bell resonance and
 * the DX's soft top. Chords: `(t, notes, dur, vel, shape?)`.
 */
export function makeFMBrass(ctx: BaseAudioContext, s: Strip, r: Rnd, o: FMBrassOpts = {}) {
  const { bite = 1, detune = 9, width = 0.42, release = 0.13, vibrato = 11, breath = 0.5 } = o;
  const input = ctx.createGain();
  // thinned under the horns, the bell's ring, the DAC's soft top
  const hp = biquad(ctx, 'highpass', 85, -3);
  const bell = biquad(ctx, 'peaking', 1250, 0.8, 2.5);
  const top = biquad(ctx, 'lowpass', 9500, -3);
  input.connect(hp);
  hp.connect(bell);
  bell.connect(top);
  s.nodes.push(input, hp, bell, top);
  ending(ctx, s, top, o.chorus ?? 0.25, o.onStop, { rate: 0.37, depth: 0.0016, delay: 0.009 });
  const cosW = table(ctx, 'cos', COS), richW = table(ctx, 'rich', RICH);
  // which side the top note's saw player takes when the inner notes don't decide it (alternating)
  let side = 0;

  return (t: number, notes: number[], dur: number, vel: number, shape: BrassShape = 'auto') => {
    if (!notes.length) return;
    const v = clamp(vel, 0.02, 1);
    const sh = shape === 'auto' ? (dur >= 1 ? 'hold' : 'stab') : shape;
    const bend = sh === 'fall' ? -1 : sh === 'doit' ? 1 : 0;
    // a fall or a doit speaks like a stab or a held note, by its length
    const kind = sh === 'swell' ? 'swell' : sh === 'stab' || (bend && dur < 1) ? 'stab' : 'hold';
    const long = kind !== 'stab';
    const norm = 1 / Math.sqrt(notes.length);
    const off = t + Math.max(0.03, dur);
    const rel = release * (long ? 1.9 : 1) * (bend ? 2.3 : 1);
    const banks = [pan(ctx, -width), pan(ctx, width)];
    for (const b of banks) b.connect(input);
    const srcs: [AudioScheduledSourceNode, number, number?][] = [];
    const nodes: AudioNode[] = [...banks];
    let end = off + rel;
    // the vibrato, for the top note: none at the onset, growing in once the note has settled
    let vib: GainNode | null = null;
    if (long && dur > 0.6 && vibrato > 0) {
      const lfo = voice(ctx, 5.1 + r() * 0.8, null);
      vib = ctx.createGain();
      const depth = vibrato * (0.7 + 0.5 * v);
      vib.gain.value = 0;
      vib.gain.setValueAtTime(0, t + 0.3);
      vib.gain.linearRampToValueAtTime(depth, t + Math.min(dur, 1.1));
      vib.gain.setValueAtTime(depth, off);
      vib.gain.linearRampToValueAtTime(0, off + rel);
      lfo.connect(vib);
      srcs.push([lfo, t]);
      nodes.push(vib);
    }
    const lead = notes.indexOf(Math.max(...notes));
    // the inner notes alternate sides; the top note's saw player sits on the side with fewer of them
    const inner = [0, 0];
    notes.forEach((_, i) => i !== lead && inner[i % 2]++);
    const leadSide = inner[0] > inner[1] ? 1 : inner[1] > inner[0] ? 0 : (side ^= 1);
    // a section doesn't bend into every hit: about a third of the stabs go straight in
    const scoops = long || r() >= 0.3;
    notes.forEach((m, i) => {
      const f = mtof(m);
      const isLead = i === lead;
      // key scaling: the low notes take more index (they need it to sound), the high ones less (to stay sweet); capped
      // at the bottom, where more would hollow out the fundamental of a loud low note
      const ks = clamp(Math.pow(330 / f, 0.32), 0.6, 1.2);
      // an inner note's player comes in a moment after the lead (a section is never exactly together)
      const late = isLead ? 0 : r() * (long ? 0.015 : 0.007);
      for (let k = 0; k < (isLead ? 2 : 1); k++) {
        const saw = k === 0;
        const at = t + late + (k ? 0.0035 + r() * 0.006 : r() * 0.003);
        const det = (isLead ? (k ? 0.5 : -0.5) * detune * (0.7 + r() * 0.6) : (r() - 0.5) * detune * 0.8) + (r() - 0.5) * 2.5;
        const mod = voice(ctx, f, saw ? richW : cosW);
        const car = voice(ctx, f, null);
        const mg = ctx.createGain();
        const vca = ctx.createGain();
        mod.connect(mg);
        mg.connect(car.frequency);
        car.connect(vca);
        vca.connect(banks[isLead ? (k ? 1 - leadSide : leadSide) : i % 2]);
        // the pitch: the top note scoops a few cents up into the note, an inner one barely; off the end of it for a
        // fall or a doit; and while it is held each player's pitch wanders a little, so none beat like a machine
        const scoop = !scoops ? 0 : isLead ? (long ? 8 + 7 * (1 - v) : 5 + 5 * (1 - v)) * (0.85 + r() * 0.3) : r() * 5;
        const sT = long ? 0.075 : 0.032;
        const drift = det + (r() - 0.5) * 5;
        for (const x of [car, mod]) {
          const p = x.detune;
          p.value = det - scoop;
          p.setValueAtTime(det - scoop, at);
          p.linearRampToValueAtTime(det, at + sT);
          const b0 = Math.max(at + sT + 0.01, off - 0.04);
          const wander = b0 > at + sT + 0.05;
          if (wander) p.linearRampToValueAtTime(drift, b0);
          const held = wander ? drift : det;
          if (bend) {
            p.setValueAtTime(held, b0);
            p.linearRampToValueAtTime(held + bend * 90, b0 + 0.1);
            p.linearRampToValueAtTime(held + bend * (bend < 0 ? 620 : 340), off + rel);
          }
          if (vib && isLead) vib.connect(p);
        }
        // the fundamental's index: the saw player's gives the note its brass (h1 strongest, then a smooth roll-off),
        // the sine player's its body; both grow with velocity. `hz` turns an index into Hz of deviation (a cosine
        // into the frequency is a sine on the phase, so a 1:1 pair stays centred; the saw's fundamental is only part
        // of its peak). A stab or a held note blats past its index on the attack and is back within ~70 ms (higher,
        // and the fundamental would collapse again); a swell brightens as it grows; all fall away faster than the
        // sound when released
        const base = bite * ks;
        const sus = saw ? base * (0.51 + 0.79 * v) * (isLead ? 1 : 0.92) : base * 0.82 * (0.75 + 0.75 * v);
        const hz = saw ? f / RICH_FUND : f;
        const P = BRASS_LEVEL * norm * (0.42 + 0.58 * v) * (isLead ? (k ? 0.6 : 1) : 1.2);
        const a = 0.006 + 0.014 * (1 - v);
        const pk = sus * (1.2 + 0.5 * v);
        let amp: Env;
        if (kind === 'stab') {
          amp = envelope(vca.gain, at, 0, [[a, P], [0.075, 0.64 * P, true], [0.6, 0.5 * P, true]], off, rel);
          envelope(mg.gain, at, 0.25 * sus * hz, [[a * 1.35, pk * hz], [0.07, sus * hz, true], [0.6, 0.85 * sus * hz, true]], off, rel * 0.75);
        } else if (kind === 'hold') {
          amp = envelope(vca.gain, at, 0, [[a, P], [0.09, 0.76 * P, true], [0.7, 0.7 * P, true]], off, rel);
          envelope(mg.gain, at, 0.25 * sus * hz, [[a * 1.35, pk * hz], [0.075, 1.04 * sus * hz, true], [0.7, sus * hz, true]], off, rel * 0.7);
        } else {
          // the swell speaks within a third of the note, however short
          const sw = clamp(Math.min(0.16 + dur * 0.22, 0.35 * dur), 0.05, 0.85);
          amp = envelope(vca.gain, at, 0, [[0.03, 0.32 * P], [sw, P], [1.2, 0.84 * P, true]], off, rel);
          envelope(mg.gain, at, 0.2 * sus * hz, [[0.03, 0.3 * sus * hz], [sw, 1.12 * sus * hz], [0.8, sus * hz, true]], off, rel * 0.7);
        }
        end = Math.max(end, amp.end);
        srcs.push([mod, at], [car, at]);
        nodes.push(mg, vca);
      }
    });
    // breath: a puff of noise through the mouthpiece as the section speaks
    if (breath > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      const bp = biquad(ctx, 'bandpass', 900 + 1500 * v + r() * 200, 0.8);
      const g = ctx.createGain();
      const lvl = BRASS_LEVEL * breath * 0.09 * v;
      envelope(g.gain, t, 0, [[0.005, lvl], [0.07, lvl * 0.08, true]], t + 0.075, 0.03);
      src.connect(bp);
      bp.connect(g);
      g.connect(input);
      // from a different place in the noise each time: no two breaths alike
      srcs.push([src, t, r() * 0.85]);
      nodes.push(bp, g);
    }
    launch(srcs, end, nodes);
  };
}

// ── the polysynth ───────────────────────────────────────────────────────────────────────────
export interface PolySynthOpts {
  /** keys: a city-pop chord synth · pad: slow and wide · stab: a short, snappy comp · brass: Jupiter brass. */
  preset?: 'keys' | 'pad' | 'stab' | 'brass';
  attack?: number;
  decay?: number;
  /** Amp sustain, 0..1 of the peak. */
  sustain?: number;
  release?: number;
  /** The filter's cutoff at full velocity (Hz, at middle C; it follows the key by `track`). */
  cut?: number;
  /** The filter envelope's reach, in octaves above the cutoff. */
  env?: number;
  fattack?: number;
  fdecay?: number;
  /** Where the filter settles, as a share of the envelope's reach. */
  fsustain?: number;
  /** Resonance, 0..1. */
  res?: number;
  /** Key tracking, 0..1. */
  track?: number;
  /** The pulse's share in the saw + pulse mix (0 = saw only); its width sweeps at `pwmRate` Hz. */
  pwm?: number;
  pwmRate?: number;
  /** Cents between the two saws (0 = one oscillator). */
  detune?: number;
  /** The square an octave below, 0..1. */
  sub?: number;
  /** The output stage's drive, 0..1. */
  drive?: number;
  /** The Juno's chorus: 0 off, 1 (slow), 2 (faster, deeper). Needs `onStop`. */
  chorus?: 0 | 1 | 2;
  /** The Juno's high-pass, Hz (keeps a chord's low end for the bass). */
  hp?: number;
  onStop?: OnStop;
}

type PolyPreset = Required<Omit<PolySynthOpts, 'preset' | 'onStop'>>;

const POLY_PRESETS: Record<NonNullable<PolySynthOpts['preset']>, PolyPreset> = {
  keys: { attack: 0.005, decay: 1.1, sustain: 0.55, release: 0.42, cut: 520, env: 2.6, fattack: 0.004, fdecay: 0.55, fsustain: 0.3, res: 0.22, track: 0.8, pwm: 0.55, pwmRate: 0.55, detune: 6, sub: 0.15, drive: 0.35, chorus: 1, hp: 90 },
  pad: { attack: 0.55, decay: 2.8, sustain: 0.8, release: 1.6, cut: 480, env: 1.7, fattack: 1.1, fdecay: 2.4, fsustain: 0.45, res: 0.12, track: 0.7, pwm: 0.75, pwmRate: 0.35, detune: 9, sub: 0.12, drive: 0.25, chorus: 2, hp: 70 },
  stab: { attack: 0.003, decay: 0.35, sustain: 0.22, release: 0.16, cut: 480, env: 3.3, fattack: 0.004, fdecay: 0.22, fsustain: 0.12, res: 0.32, track: 0.7, pwm: 0.4, pwmRate: 0.8, detune: 8, sub: 0, drive: 0.5, chorus: 1, hp: 110 },
  brass: { attack: 0.04, decay: 0.7, sustain: 0.8, release: 0.3, cut: 380, env: 2.7, fattack: 0.085, fdecay: 0.6, fsustain: 0.5, res: 0.18, track: 0.7, pwm: 0, pwmRate: 0.5, detune: 10, sub: 0.1, drive: 0.45, chorus: 1, hp: 80 },
};

const POLY_LEVEL = 0.19;
/** Each preset's level, so a mid-register note at vel 0.8 peaks about the same (the keys' bright attack peaks high). */
const POLY_TRIM: Record<NonNullable<PolySynthOpts['preset']>, number> = { keys: 0.8, pad: 1.12, stab: 1, brass: 1.12 };

/**
 * A Juno/Jupiter polysynth: per note a saw, the same saw turned into a pulse whose width sweeps (a copy of it
 * inverted and delayed by a share of the period: real PWM) and a second saw a few cents away (under the chord's
 * lowest note, a square an octave down too), through a 24 dB low-pass (two biquads) with its own envelope and key
 * tracking, never closing below a note's second harmonic; then a gentle drive and the Juno's chorus, made once. Chords:
 * `(t, notes, dur, vel, bright?)`; `bright` scales the cutoff (an arranger's sweep).
 */
export function makePolySynth(ctx: BaseAudioContext, s: Strip, r: Rnd, o: PolySynthOpts = {}) {
  const P0 = POLY_PRESETS[o.preset ?? 'keys'];
  const level = POLY_LEVEL * POLY_TRIM[o.preset ?? 'keys'];
  const attack = o.attack ?? P0.attack, decay = o.decay ?? P0.decay, sustain = o.sustain ?? P0.sustain, release = o.release ?? P0.release;
  const cut = o.cut ?? P0.cut, envOct = o.env ?? P0.env, fattack = o.fattack ?? P0.fattack, fdecay = o.fdecay ?? P0.fdecay;
  const fsustain = o.fsustain ?? P0.fsustain, res = o.res ?? P0.res, track = o.track ?? P0.track;
  const pwm = o.pwm ?? P0.pwm, detune = o.detune ?? P0.detune, sub = o.sub ?? P0.sub;
  // a PWM sweep is slow: past ~20 Hz it is a buzz, not a sweep (and its scheduling would never end)
  const pwmRate = clamp(o.pwmRate ?? P0.pwmRate, 0.05, 20);
  const mode = o.chorus ?? P0.chorus;
  const stage = drive(ctx, s, o.drive ?? P0.drive);
  const hpf = biquad(ctx, 'highpass', o.hp ?? P0.hp, -3);
  stage.out.connect(hpf);
  s.nodes.push(hpf);
  // Juno chorus I: a 0.5 Hz sweep of a 1.7–5.3 ms delay; II: faster and a little deeper
  ending(ctx, s, hpf, mode ? 0.62 : 0, o.onStop, mode === 2 ? { rate: 0.83, depth: 0.0021, delay: 0.0036 } : { rate: 0.513, depth: 0.0018, delay: 0.0035 });
  const q2 = 2.3 + res * 11;
  // the lowest note's second oscillator carries the sub: one table at f/2 holding a saw at f (its even partials) and a
  // square at f/2 (its odd ones), so the sub costs no node and the PWM never touches it. Only under the lowest note:
  // a sub-octave under every note of a chord would muddy the bass's register
  const subW =
    sub > 0
      ? table(ctx, `poly-sub:${sub.toFixed(3)}:${detune > 0 ? 1 : 0}`, [], Array.from({ length: 96 }, (_, i) => {
          const n = i + 1;
          if (n % 2) return (sub * 0.8 * 4) / (Math.PI * n);
          return detune > 0 ? ((n % 4 ? 1 : -1) * 4) / (Math.PI * n) : 0;
        }))
      : null;

  return (t: number, notes: number[], dur: number, vel: number, bright = 1) => {
    if (!notes.length) return;
    const v = clamp(vel, 0.02, 1);
    const off = t + Math.max(0.02, dur);
    // one amplifier for the chord (its notes share the envelope); a filter for each note
    const P = (level / Math.sqrt(notes.length)) * (0.55 + 0.45 * v);
    const vca = ctx.createGain();
    const amp = envelope(vca.gain, t, 0, [[attack, P], [decay, P * sustain, true]], off, release);
    const end = amp.end;
    vca.connect(stage.input);
    const srcs: [AudioScheduledSourceNode, number][] = [];
    const nodes: AudioNode[] = [vca];
    // the oscillators run free, as an analogue synth's do: each note's start a random part of its cycle before the
    // envelope opens, so no two chords begin alike and a chord's saw edges never line up into a spike (a note's own
    // two saws start in phase and drift apart: none loses its fundamental)
    const lowest = notes.indexOf(Math.min(...notes));
    notes.forEach((m, i) => {
      const f = mtof(m);
      const early = t - ((0.05 + 0.95 * r()) * 2) / f;
      const o1 = voice(ctx, f, null, 'sawtooth');
      o1.detune.value = (detune > 0 ? -detune / 2 : 0) + (r() - 0.5) * 3;
      const lp1 = voiceFilter(ctx), lp2 = voiceFilter(ctx);
      lp1.type = lp2.type = 'lowpass';
      lp1.Q.value = -5.3;
      lp2.Q.value = q2;
      o1.connect(lp1);
      srcs.push([o1, early]);
      nodes.push(lp1, lp2);
      if (pwm > 0) {
        // the pulse: the saw minus itself a width later; the width sweeps as a triangle from a random place
        const dl = ctx.createDelay(0.05);
        // the width moves a thousandth of a sample per block: read it once a block (a third of the delay's cost)
        dl.delayTime.automationRate = 'k-rate';
        const inv = ctx.createGain();
        inv.gain.value = -pwm;
        o1.connect(dl);
        dl.connect(inv);
        inv.connect(lp1);
        const T = 1 / f, lo = 0.1 * T, hi = 0.46 * T;
        const half = (0.5 / pwmRate) * (0.85 + 0.3 * r());
        let w = lo + (hi - lo) * r(), up = r() < 0.5, tc = t;
        dl.delayTime.value = w;
        dl.delayTime.setValueAtTime(w, t);
        while (tc < end) {
          const target = up ? hi : lo;
          const dt = (half * Math.abs(target - w)) / (hi - lo);
          up = !up;
          if (dt < 1e-3 && w === target) continue;
          tc += Math.max(dt, 1e-3);
          dl.delayTime.linearRampToValueAtTime(target, tc);
          w = target;
        }
        nodes.push(dl, inv);
      }
      const withSub = subW && i === lowest;
      if (detune > 0 || withSub) {
        // the second saw a few cents up (with the sub under it on the lowest note), or the sub alone
        const o2 = withSub ? voice(ctx, f / 2, subW) : voice(ctx, f, null, 'sawtooth');
        o2.detune.value = detune / 2 + (r() - 0.5) * 3;
        o2.connect(lp1);
        srcs.push([o2, early]);
      }
      // the filter: from the cutoff up the envelope's reach and down to where it settles, following the key
      const kt = Math.pow(f / 261.6, track);
      // never under the second harmonic: a soft high note is still a synth, not a flute
      const base = clamp(Math.max(cut * bright * kt * (0.62 + 0.55 * v), 2.2 * f * Math.min(1, bright)) * (0.97 + r() * 0.06), 40, 15000);
      // the sweep tops out near the 16th harmonic (2.5–10 kHz): bright, the same at every pitch, never fizzing
      const peak = clamp(base * Math.pow(2, envOct * (0.45 + 0.75 * v)), base * 1.01, Math.max(base * 1.01, clamp(f * 16, 2500, 10000)));
      const settle = base * Math.pow(peak / base, fsustain);
      for (const [lp, mul] of [[lp1, 1], [lp2, 1.08]] as const)
        envelope(lp.frequency, t, base * mul, [[fattack, peak * mul, true], [fdecay, settle * mul, true]], off, release, base * 0.7 * mul);
      lp1.connect(lp2);
      lp2.connect(vca);
    });
    launch(srcs, end, nodes);
  };
}

// ── the DX slap bass ────────────────────────────────────────────────────────────────────────
/** finger: round and plucked · slap: the thumb, a bright clank · pop: the snapped string's crack · ghost: a dead note. */
export type BassArticulation = 'finger' | 'slap' | 'pop' | 'ghost';

export interface FMBassOpts {
  /** Brightness of the attack, 0.6 … 1.4. */
  bright?: number;
  /** How long notes ring, × (1 = a real string). */
  decay?: number;
  /** The sine under it, 0..1.5. */
  sub?: number;
}

const FMBASS_LEVEL = 0.31;

/**
 * The bass's modulators. Through the delay line a modulator's own partials become the phase's, so its shape is the
 * articulation. Round: a sine with a little of its overtones (1/k², alternating in sign, which gives a plain falling
 * series: 0, −4, −9, −14 dB at E2; with one sign the third harmonic drops out), for fingers and ghosts. Saw: a sine
 * and sixteen partials at 1/k tapering to nothing at the sixteenth (the DX operator with some feedback), whose sidebands
 * reach far further for the same index: the slap's and the pop's brightness at the bottom of the bass, a sustain that
 * rolls off smoothly instead of stopping at a hard edge. Its fundamental is doubled: a plain saw's phase is a ramp, so
 * a 1:1 pair turns into a synced oscillator (one strong formant, a hollow above it, a flat buzz); the sine fills the
 * thump and the snap in (strong harmonics to the sixth or eighth, then the clank's plateau).
 */
const BASS_ROUND = Array.from({ length: 6 }, (_, i) => (i % 2 ? -1 : 1) / ((i + 1) * (i + 1)));
const BASS_SAW = Array.from({ length: 16 }, (_, i) => (i ? 1 / (i + 1) : 2) * (1 - i / 16));

/**
 * How far a sine table's index reaches: its steepest slope once normalised to a peak of 1 (the browser normalises a
 * table that way). A note's highest instantaneous frequency is about f × (1 + index × reach).
 */
function reach(im: readonly number[]): number {
  const n = 2048;
  let peak = 0, slope = 0;
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    let x = 0, dx = 0;
    im.forEach((b, k) => {
      x += b * Math.sin((k + 1) * th);
      dx += b * (k + 1) * Math.cos((k + 1) * th);
    });
    peak = Math.max(peak, Math.abs(x));
    slope = Math.max(slope, Math.abs(dx));
  }
  return slope / peak;
}
const REACH = { round: reach(BASS_ROUND), saw: reach(BASS_SAW) };

interface Art {
  /** The modulator's shape. */
  shape: 'round' | 'saw';
  /**
   * The index (radians, the modulator's peak) at E2 and vel ~0.85: the attack's peak, held for `hold` seconds, then
   * falling over `fall` to `mid` and, as the note rings on, to `late`. The peak follows the key by (82.4 / f) ^ `ks`
   * (a higher note needs less to be as bright), `mid` and `late` by its 0.3 power.
   */
  pk: number;
  ks: number;
  hold: number;
  fall: number;
  mid: number;
  late: number;
  /** The amplitude: attack time, then (time, level) breakpoints. */
  amp: [number, ...[number, number][]];
  rel: number;
  click: 'slap' | 'pop' | 'finger' | 'ghost';
  clickLvl: number;
  sub: number;
  /** Cents the pitch starts sharp at vel 1 (a hard-hit string is stretched) and how long it takes to settle. */
  bend: [number, number];
  level: number;
}

const ARTS: Record<BassArticulation, Art> = {
  finger: { shape: 'round', pk: 3, ks: 0.7, hold: 0.004, fall: 0.07, mid: 1.25, late: 0.8, amp: [0.004, [0.09, 0.8], [1.4, 0.42], [3.2, 0.1]], rel: 0.07, click: 'finger', clickLvl: 0.16, sub: 0.55, bend: [8, 0.04], level: 1 },
  slap: { shape: 'saw', pk: 5.3, ks: 0.8, hold: 0.07, fall: 0.12, mid: 0.75, late: 0.55, amp: [0.0025, [0.05, 0.6], [1.1, 0.32], [3, 0.07]], rel: 0.06, click: 'slap', clickLvl: 0.5, sub: 0.5, bend: [20, 0.035], level: 1.1 },
  pop: { shape: 'saw', pk: 6.7, ks: 0.8, hold: 0.012, fall: 0.09, mid: 0.65, late: 0.45, amp: [0.002, [0.07, 0.5], [0.9, 0.22], [2.5, 0.05]], rel: 0.06, click: 'pop', clickLvl: 0.58, sub: 0.3, bend: [26, 0.03], level: 1.05 },
  ghost: { shape: 'round', pk: 1.8, ks: 0.4, hold: 0, fall: 0.02, mid: 0.8, late: 0.6, amp: [0.0018, [0.032, 0.14]], rel: 0.025, click: 'ghost', clickLvl: 0.5, sub: 0.3, bend: [0, 0.02], level: 0.42 },
};

/** Make the bass's attack noises in the worker at `sr` while the game loads (audioWorker.ts makes them with `bassClick`). */
export function prewarmSynths(sr: number): void {
  for (const kind of ['slap', 'pop', 'finger', 'ghost']) for (let k = 0; k < 3; k++) askWorker(sr, `synths:click2:${kind}:${k}`);
}

/** How long each attack noise lasts (the slap's and the pop's clank rings on a while). */
const CLICK_LEN: Record<Art['click'], number> = { slap: 0.16, pop: 0.18, finger: 0.065, ghost: 0.065 };

/**
 * The attack noises, rendered once each in three takes (round robin: no two slaps alike): the thumb's thud and the
 * string on the frets (a rattle through the fret and body resonances, and a few metallic partials ringing on: the
 * clank), the snapped string's crack, a fingertip, a muted thud.
 */
export function bassClick(ctx: BaseAudioContext, kind: Art['click'], take: number): AudioBuffer {
  return cachedBuffer(ctx, `synths:click2:${kind}:${take}`, CLICK_LEN[kind], (d, sr) => {
    const g = noiseGen(kind.length * 977 + 13 + take * 7919);
    // each take strikes a slightly different place on the string: its resonances move a few per cent
    const at = (hz: number) => hz * (1 + (take - 1) * 0.06 + g() * 0.025);
    // two-pole resonators over decaying noise (a sharp burst and a softer rattle), and metallic partials ringing on
    const spec = {
      slap: { tau: 0.0035, rattle: [0.35, 0.012], res: [[1900, 4, 1], [3400, 5, 0.8], [5600, 3, 0.3]], ring: [[1270, 0.032], [2210, 0.027], [3530, 0.021], [4810, 0.015]], ringLvl: 0.3, lp: 7000 },
      pop: { tau: 0.0022, rattle: [0.3, 0.008], res: [[2600, 6, 1], [4800, 6, 0.8], [7000, 3, 0.35]], ring: [[1830, 0.038], [3210, 0.031], [5120, 0.023], [6930, 0.016]], ringLvl: 0.42, lp: 8500 },
      finger: { tau: 0.0045, rattle: [0, 0.01], res: [[700, 1.2, 1], [1500, 2, 0.35]], ring: [], ringLvl: 0, lp: 1800 },
      ghost: { tau: 0.006, rattle: [0, 0.01], res: [[650, 1.5, 1], [1250, 2.5, 0.6], [180, 3, 0.9]], ring: [], ringLvl: 0, lp: 2600 },
    }[kind];
    const n = d.length;
    const ex = new Float32Array(n);
    const [rl, rt] = spec.rattle;
    for (let i = 0; i < n; i++) ex[i] = g() * (Math.exp(-i / (spec.tau * sr)) + rl * Math.exp(-i / (rt * sr)));
    for (const [hz, q, lvl] of spec.res) {
      // RBJ band-pass (constant peak)
      const fc = at(hz);
      const w = (2 * Math.PI * fc) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
      const a0 = 1 + al, b0 = al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        const y = b0 * ex[i] - b0 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = ex[i];
        y2 = y1;
        y1 = y;
        d[i] += y * lvl;
      }
    }
    for (const [hz, tau] of spec.ring) {
      const fr = at(hz), ph = (g() + 1) * Math.PI;
      for (let i = 0; i < n; i++) d[i] += spec.ringLvl * Math.sin((2 * Math.PI * fr * i) / sr + ph) * Math.exp(-i / (tau * sr));
    }
    const a = Math.exp((-2 * Math.PI * spec.lp) / sr);
    let y = 0;
    for (let i = 0; i < n; i++) d[i] = y = y * a + d[i] * (1 - a);
    // a millisecond in (no step at the start), the tail to zero
    const rise = Math.round(sr * 0.0012);
    for (let i = 0; i < rise; i++) d[i] *= i / rise;
    normalise(d, 0.9, n);
    fadeTail(d, sr, 6, n);
  });
}

/**
 * The DX "slap bass" of city pop: a sine carrier phase-modulated 1:1 (the DX7's way: through a delay line whose
 * length swings, so however fast the index moves the carrier never drifts off centre), the index falling from the
 * attack (scaled by key and velocity), a sine under it for weight, a rendered click for the thumb or the snapped
 * string on the frets (three takes each), and the pitch settling from a hair sharp. The articulation picks the
 * modulator: a round one for fingers, a saw (the DX's feedback) for the slap and the pop, so a slap is bright to the
 * bottom of the bass and stays bright a moment. Two strings: a new note within a fifth of the ringing one chokes it at
 * once (the same string); a wider jump (the popped octave over the thumbed root) lets it ring on a moment under the
 * new note before the hand damps it. `(t, m, dur, vel, articulation?)`.
 */
export function makeFMBass(ctx: BaseAudioContext, s: Strip, r: Rnd, o: FMBassOpts = {}) {
  const { bright = 1, decay = 1, sub = 1 } = o;
  const input = ctx.createGain();
  const hp = biquad(ctx, 'highpass', 30, -3);
  input.connect(hp);
  hp.connect(s.in);
  s.nodes.push(input, hp);
  const cosW = table(ctx, 'cos', COS);
  const waves = { round: table(ctx, 'bass-round', [], BASS_ROUND), saw: table(ctx, 'bass-saw2', [], BASS_SAW) };
  type Ringing = { envs: Env[]; srcs: AudioScheduledSourceNode[]; t: number; m: number };
  let ringing: Ringing[] = [];

  return (t: number, m: number, dur: number, vel: number, articulation: BassArticulation = 'finger') => {
    const A = ARTS[articulation];
    const v = clamp(vel, 0.02, 1);
    const f = mtof(m) * Math.pow(2, ((r() - 0.5) * 3) / 1200);
    const w = 2 * Math.PI * f;
    const ghost = articulation === 'ghost';
    const off = t + (ghost ? Math.min(dur, 0.05) : Math.max(0.03, dur));
    // the ringing notes: one on this string is choked at once, one on another string a moment later
    for (const n of ringing) {
      if (n.t >= t || n.envs[0].end <= t) continue;
      const same = Math.abs(m - n.m) <= 7;
      const at = same ? t : t + 0.08 + r() * 0.04;
      if (at >= n.envs[0].cut) continue;
      for (const e of n.envs) e.choke(at, same ? 0.008 : 0.03);
      stopEarly(n.srcs, at + (same ? 0.03 : 0.05));
    }
    ringing = ringing.filter((n) => Math.min(n.envs[0].end, n.envs[0].cut) > t);
    // low notes ring longer
    const ring = decay * clamp(Math.pow(82.4 / f, 0.25), 0.8, 1.3);
    const P = FMBASS_LEVEL * A.level * (0.5 + 0.5 * v);
    // the index (radians): by key and velocity, and never so far that the top of the sound passes ~13 kHz
    const kf = 82.4 / f;
    const cap = Math.max(0.3, (13000 / f - 1) / REACH[A.shape]);
    let iPk = Math.min(cap, A.pk * Math.pow(kf, A.ks) * (0.5 + 0.6 * v) * bright * (0.93 + r() * 0.14));
    // phase modulation: y = sin(ω(t − τ)), τ = τ0 + (index / ω)·M(ωt), M the modulator (peak 1). The line waits τ0,
    // the widest swing. The carrier starts early by τ0 and whole periods more (at least τ0), so the line never reads
    // from before it started (a swing past τ0 would read silence and cut the body in late), and its phase is 0 at
    // t − τ0: at `t` carrier and modulator both start their cycle (the DX's key sync). A note asked for at the very
    // start of the timeline swings less, so its lead still fits
    const leadFor = (i: number) => {
      const tau = (i / w) * 1.02 + 0.0004;
      return tau + Math.ceil(tau * f) / f;
    };
    while (iPk > 0.05 && leadFor(iPk) > t - ctx.currentTime) iPk *= 0.8;
    const iMid = Math.min(iPk, A.mid * Math.pow(kf, 0.3) * (0.75 + 0.35 * v) * (0.5 + 0.5 * bright));
    const iLate = Math.min(iMid, A.late * Math.pow(kf, 0.3));
    const tau0 = (iPk / w) * 1.02 + 0.0004;
    const lead = leadFor(iPk);
    const dl = ctx.createDelay(2 * tau0 + 0.01);
    dl.delayTime.value = tau0;
    const car = voice(ctx, f, null);
    const m1 = voice(ctx, f, waves[A.shape]);
    const g1 = ctx.createGain();
    const vca = ctx.createGain();
    m1.connect(g1);
    g1.connect(dl.delayTime);
    car.connect(dl);
    dl.connect(vca);
    vca.connect(input);
    const [att, ...pts] = A.amp;
    const amp = envelope(vca.gain, t, 0, [[att, P], ...pts.map(([tt, lv], i) => [(tt - (i ? pts[i - 1][0] : att)) * ring, lv * P, true] as const)], off, A.rel);
    envelope(g1.gain, t, (iPk * 0.4) / w, [[att * 0.8, iPk / w], [A.hold, (iPk * 0.85) / w, true], [A.fall, iMid / w, true], [1.2 * ring, iLate / w, true]], off, A.rel * 0.8);
    // the hard-hit string starts a little sharp and settles (the carrier is heard τ0 after it is made; it runs true
    // before that, so its phase is still whole periods at t − τ0)
    const bend = A.bend[0] * v * (0.8 + r() * 0.4);
    for (const [x, at] of [[car, t - tau0], [m1, t]] as const) {
      x.detune.value = x === car ? 0 : bend;
      x.detune.setValueAtTime(bend, at);
      x.detune.linearRampToValueAtTime(0, at + A.bend[1]);
    }
    // the sine underneath, for weight. In quadrature (a cosine): the FM's own fundamental turns negative at some
    // indices, and a sine in phase would cancel it; a cosine only ever adds power
    const so = voice(ctx, f, cosW);
    const sg = ctx.createGain();
    envelope(sg.gain, t, 0, [[att * 2, A.sub * sub], [2.5 * ring, A.sub * sub * 0.5, true]], off, A.rel);
    so.connect(sg);
    sg.connect(vca);
    // the string on the frets, choked with the note
    const click = ctx.createBufferSource();
    click.buffer = bassClick(ctx, A.click, Math.floor(r() * 3));
    click.playbackRate.value = 0.96 + r() * 0.08;
    const cg = ctx.createGain();
    const cl = A.clickLvl * FMBASS_LEVEL * (0.35 + 0.65 * v) * (0.4 + 0.6 * bright);
    const ce = envelope(cg.gain, t, 0, [[0.0005, cl]], t + CLICK_LEN[A.click] * 1.1, 0.005);
    click.connect(cg);
    cg.connect(input);
    const srcs: [AudioScheduledSourceNode, number][] = [[car, Math.max(0, t - lead)], [m1, t], [so, t], [click, t]];
    launch(srcs, Math.max(amp.end, ce.end), [g1, dl, vca, sg, cg]);
    ringing.push({ envs: [amp, ce], srcs: srcs.map(([x]) => x), t, m });
  };
}

// ── the Moog bass ───────────────────────────────────────────────────────────────────────────
export interface SynthBassOpts {
  /** The filter's cutoff at full velocity, Hz at C2 (it follows the key halfway). */
  cut?: number;
  /** The filter envelope's reach, octaves. */
  env?: number;
  /** Resonance, 0..1. */
  res?: number;
  /** How fast the filter closes, seconds. */
  decay?: number;
  /** Amp sustain while held, 0..1. */
  sustain?: number;
  release?: number;
  /** Cents between the two saws. */
  detune?: number;
  /** The square an octave down, 0..1. */
  sub?: number;
  /** The output stage's drive, 0..1. */
  drive?: number;
  /** Portamento between overlapping (legato) notes, seconds; 0 = none. */
  glide?: number;
}

const SYNTHBASS_LEVEL = 0.153;

/**
 * A warm Moog-style bass: two saws a few cents apart and a square an octave down, through a 24 dB low-pass (two
 * biquads) whose envelope plucks every note open (wider the harder it is hit), into a shared drive that rounds the
 * loud ones. Monophonic like the real thing: a note chokes the last; with `glide`, a legato note (one that starts
 * before the last is let go) is played by the voice already sounding, as a mono synth plays it: its oscillators slide
 * to the new pitch, the amplifier carries on without a new attack and the filter is only nudged. `(t, m, dur, vel)`.
 */
export function makeSynthBass(ctx: BaseAudioContext, s: Strip, r: Rnd, o: SynthBassOpts = {}) {
  const { cut = 230, env: envOct = 3.4, res = 0.3, decay = 0.3, sustain = 0.82, release = 0.07, detune = 7, sub = 0.45, glide = 0 } = o;
  const stage = drive(ctx, s, o.drive ?? 0.55);
  const hp = biquad(ctx, 'highpass', 28, -3);
  stage.out.connect(hp);
  hp.connect(s.in);
  s.nodes.push(hp);
  const q2 = 2.3 + res * 11;
  /** An oscillator's last slide: from f0 at t0 to f1 at t1 (exponential). */
  type Slide = { f0: number; t0: number; f1: number; t1: number };
  interface Mono {
    gain: AudioParam;
    amp: Env;
    lps: BiquadFilterNode[];
    filt: Env[];
    oscs: OscillatorNode[];
    slides: Slide[];
    t: number;
    off: number;
  }
  let last: Mono | null = null;
  const freqAt = (sl: Slide, time: number) => (time >= sl.t1 ? sl.f1 : sl.f0 * Math.pow(sl.f1 / sl.f0, Math.max(0, time - sl.t0) / (sl.t1 - sl.t0)));
  // the contour: plucked open from the key's base and closing, wider for the hard notes
  const contour = (f: number, v: number) => {
    const base = clamp(cut * Math.pow(f / 65.4, 0.5) * (0.55 + 0.45 * v), 35, 6000);
    return { base, reach: envOct * (0.35 + 0.65 * v) };
  };

  /** A legato note on the sounding voice: false when the engine won't move its stop (then it is played afresh). */
  const slur = (L: Mono, t: number, m: number, dur: number, v: number): boolean => {
    const f = mtof(m);
    const off = t + Math.max(0.03, dur);
    // a gain envelope released at `off` is at zero `release` + 5 ms later
    const end = off + release + 0.005;
    try {
      for (const x of L.oscs) x.stop(end + 0.02);
    } catch {
      return false;
    }
    // the pitch slides from wherever it has got to
    L.oscs.forEach((x, i) => {
      const sl = L.slides[i];
      const now = freqAt(sl, t), to = i === 2 ? f / 2 : f;
      const p = x.frequency;
      p.cancelScheduledValues(t);
      if (t < sl.t1) p.exponentialRampToValueAtTime(now, t);
      else p.setValueAtTime(now, t);
      p.exponentialRampToValueAtTime(to, t + glide);
      L.slides[i] = { f0: now, t0: t, f1: to, t1: t + glide };
    });
    // the amplifier carries on (no new attack), easing to this note's level
    const P = SYNTHBASS_LEVEL * (0.5 + 0.5 * v);
    L.amp = envelope(L.gain, t, L.amp.hold(t), [[0.03, P * sustain, true], [3, P * sustain * 0.7, true]], off, release, undefined, false);
    // the filter: a small push up from where it is, then on to this note's contour
    const c = contour(f, v);
    L.lps.forEach((lp, k) => {
      const mul = k ? 1.1 : 1;
      const from = L.filt[k].hold(t);
      const settle = c.base * Math.pow(2, c.reach * 0.18) * mul;
      const bump = Math.min(Math.max(from, settle) * Math.pow(2, c.reach * 0.15), 14000);
      L.filt[k] = envelope(lp.frequency, t, from, [[0.004, bump, true], [decay * (0.8 + 0.4 * (1 - v)), settle, true]], off, release + 0.05, c.base * 0.8 * mul, false);
    });
    L.t = t;
    L.off = off;
    return true;
  };

  return (t: number, m: number, dur: number, vel: number) => {
    const v = clamp(vel, 0.02, 1);
    const f = mtof(m);
    const off = t + Math.max(0.03, dur);
    let from = 0;
    if (last && last.t < t && last.amp.end > t) {
      const legato = glide > 0 && last.off > t - 0.005;
      if (legato && slur(last, t, m, dur, v)) return;
      // a new note: the last one is choked (and, if it was legato after all, this one slides in from it)
      if (legato) from = freqAt(last.slides[0], t);
      last.amp.choke(t, 0.012);
      stopEarly(last.oscs, t + 0.04);
    }
    const P = SYNTHBASS_LEVEL * (0.5 + 0.5 * v);
    const vca = ctx.createGain();
    const amp = envelope(vca.gain, t, 0, [[0.003, P], [0.25, P * sustain, true], [3, P * sustain * 0.7, true]], off, release);
    const oscs = [voice(ctx, f, null, 'sawtooth'), voice(ctx, f, null, 'sawtooth'), voice(ctx, f / 2, null, 'square')];
    oscs[0].detune.value = -detune / 2 + (r() - 0.5) * 2.5;
    oscs[1].detune.value = detune / 2 + (r() - 0.5) * 2.5;
    oscs[2].detune.value = (r() - 0.5) * 2;
    const slides = oscs.map((x, i): Slide => {
      const f1 = i === 2 ? f / 2 : f;
      if (!from) return { f0: f1, t0: t, f1, t1: t };
      // slide in from the last note
      const f0 = i === 2 ? from / 2 : from;
      x.frequency.setValueAtTime(f0, t);
      x.frequency.exponentialRampToValueAtTime(f1, t + glide);
      return { f0, t0: t, f1, t1: t + glide };
    });
    const lp1 = voiceFilter(ctx), lp2 = voiceFilter(ctx);
    lp1.type = lp2.type = 'lowpass';
    lp1.Q.value = -5.3;
    lp2.Q.value = q2;
    const sg = ctx.createGain();
    sg.gain.value = sub;
    oscs[0].connect(lp1);
    oscs[1].connect(lp1);
    oscs[2].connect(sg);
    sg.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(vca);
    vca.connect(stage.input);
    // the contour: plucked open and closing, wider for the hard notes; a note slid into only nudged
    const c = contour(f, v);
    const peak = clamp(c.base * Math.pow(2, c.reach * (from ? 0.45 : 1)), c.base * 1.01, 14000);
    const settle = c.base * Math.pow(peak / c.base, 0.18);
    const filt = ([lp1, lp2] as const).map((lp, k) => {
      const mul = k ? 1.1 : 1;
      return envelope(lp.frequency, t, c.base * mul, [[0.0025, peak * mul, true], [decay * (0.8 + 0.4 * (1 - v)), settle * mul, true]], off, release + 0.05, c.base * 0.8 * mul);
    });
    // the oscillators start together a random part of a cycle early (silent until the envelope opens): no two notes
    // begin alike, yet the two saws start in phase and drift apart slowly, so no note loses its fundamental
    const early = t - ((0.05 + 0.95 * r()) * 2) / f;
    launch(oscs.map((x) => [x, early]), amp.end, [lp1, lp2, sg, vca]);
    last = { gain: vca.gain, amp, lps: [lp1, lp2], filt, oscs, slides, t, off };
  };
}

// ── the glassy pluck ────────────────────────────────────────────────────────────────────────
export interface PluckSynthOpts {
  /** How long a note rings, seconds at middle C (low notes ring longer). */
  decay?: number;
  /** Scales the filter's opening. */
  bright?: number;
  /** The glass on top (the octave's ring and its shimmer), 0..1. */
  glass?: number;
  /** The filter's ping, 0..1. */
  res?: number;
}

const PLUCK_LEVEL = 0.5;

/**
 * A bright, glassy synth pluck for arpeggios: a hollow 28% pulse through a resonant low-pass that snaps shut, and over
 * it the glass: a sine an octave up, lit at the strike by a short FM shimmer, ringing on after the body has darkened.
 * High partials die first; low notes ring longest, and letting go of the key doesn't stop a note dead: its release
 * follows its ring, as a pluck patch's does, so an arpeggio blooms. `(t, m, dur, vel, pan?)`.
 */
export function makePluckSynth(ctx: BaseAudioContext, s: Strip, r: Rnd, o: PluckSynthOpts = {}) {
  const { decay = 0.5, bright = 1, glass = 0.55, res = 0.35 } = o;
  const body = table(ctx, 'pulse28', PULSE28);
  const cosW = table(ctx, 'cos', COS);
  const nyquist = ctx.sampleRate / 2;
  return (t: number, m: number, dur: number, vel: number, p = 0) => {
    const v = clamp(vel, 0.02, 1);
    const f = mtof(m) * Math.pow(2, ((r() - 0.5) * 4) / 1200);
    const ring = decay * clamp(1.35 - (m - 60) / 40, 0.5, 1.7);
    const off = t + Math.max(0.03, dur);
    // the key-up release: most of the ring (0.6 s at C3, 0.17 s at C7)
    const rel = Math.max(0.12, 0.7 * ring);
    const P = PLUCK_LEVEL * (0.45 + 0.55 * v);
    const a = voice(ctx, f, body);
    const lp = voiceFilter(ctx);
    lp.type = 'lowpass';
    lp.Q.value = 2 + res * 9;
    const top = clamp(f * (4 + 12 * v) * bright * (0.92 + r() * 0.16), 900, 15000);
    const low = clamp(f * 1.25, 150, 5000);
    envelope(lp.frequency, t, top, [[ring * 0.14, Math.max(low, top * 0.28), true], [ring * 0.7, low, true]], off, rel, low * 0.8);
    const vca = ctx.createGain();
    const amp = envelope(vca.gain, t, 0, [[0.0025, P], [ring * 0.22, 0.45 * P, true], [ring, 0.06 * P, true], [ring * 1.5, 0.003 * P, true]], off, rel);
    // the glass: an octave up, a short shimmer of harmonics at the strike, then a pure ring
    const G = P * glass * (0.55 + 0.45 * v) * 0.5;
    const c = voice(ctx, 2 * f, null);
    const md = voice(ctx, 7 * f, cosW);
    const mg = ctx.createGain();
    // its sidebands (9f, 5f, 16f, 12f, 23f …) thinned above 1 kHz, and gone before the 16th's fold back past Nyquist
    const gi = (0.35 + 1.1 * v) * (0.85 + r() * 0.3) * clamp(Math.pow(1000 / f, 1.5), 0, 1) * clamp(Math.pow((0.9 * nyquist) / (16 * f), 2), 0, 1) * 7 * f;
    envelope(mg.gain, t, gi, [[0.09, gi * 0.03, true]], t + 0.09, 0.01);
    const gg = ctx.createGain();
    const ge = envelope(gg.gain, t, 0, [[0.002, G], [ring * 0.5, G * 0.3, true], [ring * 1.3, G * 0.01, true]], off, Math.max(0.16, 0.8 * ring));
    const out = pan(ctx, p);
    a.connect(lp);
    lp.connect(vca);
    vca.connect(out);
    md.connect(mg);
    mg.connect(c.frequency);
    c.connect(gg);
    gg.connect(out);
    out.connect(s.in);
    // the shimmer's modulator is silent after a tenth of a second: it stops there (the voice frees it with the rest)
    md.start(t);
    md.stop(t + 0.12);
    launch([[a, t], [c, t]], Math.max(amp.end, ge.end), [md, lp, vca, mg, gg, out]);
  };
}

// ── the sparkle ─────────────────────────────────────────────────────────────────────────────
export interface SparkleOpts {
  /** How long it rings, seconds at C5 (high notes ring shorter). */
  decay?: number;
  /** How far apart the bell and its octave sit, 0..1. */
  width?: number;
  /** The glassy ting at the strike, 0..1. */
  ting?: number;
  /** Damp the bell when the key is let go (a short release after `dur`). By default it rings out like a struck bell. */
  damp?: boolean;
  /** At most this many notes ring at once (16); a note beyond them fades out the oldest. */
  voices?: number;
}

const SPARKLE_LEVEL = 0.32;

/**
 * Act V's light: an FM bell-pluck in two voices. The body is a 1:1 pair whose harmonics fade into a sine; the octave
 * above it starts a little sharp and settles, beating slowly against the body's second harmonic (under a hertz at any
 * pitch: a real bell's warble, a slow chorus), lit at the strike by an inharmonic ting. Body and octave sit apart in
 * the stereo field. A soft attack and clean tails, for the echo; a note rings out like a struck bell, however short
 * the key, and the oldest gives way when too many ring. `(t, m, dur, vel, pan?)`.
 */
export function makeSparkle(ctx: BaseAudioContext, s: Strip, r: Rnd, o: SparkleOpts = {}) {
  const { decay = 2.4, width = 0.35, ting = 0.6, damp = false, voices = 16 } = o;
  const cosW = table(ctx, 'cos', COS);
  let ringing: { t: number; end: number; envs: Env[]; srcs: AudioScheduledSourceNode[] }[] = [];
  return (t: number, m: number, dur: number, vel: number, p = 0) => {
    const v = clamp(vel, 0.02, 1);
    const f = mtof(m) * Math.pow(2, ((r() - 0.5) * 2) / 1200);
    const ring = decay * clamp(1.3 - (m - 72) / 36, 0.45, 1.6);
    const off = t + (damp ? Math.max(0.05, dur) : Math.max(dur, ring * 1.4));
    // too many ringing: the oldest fades out (it is far down its tail by then)
    ringing = ringing.filter((n) => Math.min(n.end, n.envs[0].cut) > t);
    const before = ringing.filter((n) => n.t < t);
    if (before.length >= Math.max(1, voices)) {
      const old = before[0];
      for (const e of old.envs) e.choke(t, 0.06);
      stopEarly(old.srcs, t + 0.08);
      ringing.splice(ringing.indexOf(old), 1);
    }
    const P = SPARKLE_LEVEL * (0.4 + 0.6 * v);
    // the body (an index up to ~1.3 at the strike, so its second harmonic never towers over the fundamental)
    const c1 = voice(ctx, f, null), m1 = voice(ctx, f, cosW);
    const g1 = ctx.createGain(), a1 = ctx.createGain();
    const i1 = (0.5 + 0.9 * v) * (0.9 + r() * 0.2) * clamp(2400 / f, 0.25, 1) * f;
    envelope(g1.gain, t, i1, [[ring * 0.35, i1 * 0.3, true], [ring, i1 * 0.08, true]], off, 0.3);
    const e1 = envelope(a1.gain, t, 0, [[0.003, P], [ring, 0.05 * P, true], [ring, 0.002 * P, true]], off, 0.35);
    // the octave, settling from sharp; its ting an inharmonic ratio (sidebands at 7.19f, 3.19f, 12.4f …), thinned
    // at the top so nothing folds back past Nyquist
    const c2 = voice(ctx, 2 * f, null), m2 = voice(ctx, 5.19 * f, cosW);
    const g2 = ctx.createGain(), a2 = ctx.createGain();
    const i2 = ting * (0.5 + 1.6 * v) * clamp(Math.pow(1400 / f, 2), 0, 1) * 5.19 * f;
    envelope(g2.gain, t, i2, [[0.12, i2 * 0.02, true]], t + 0.12, 0.02);
    const e2 = envelope(a2.gain, t, 0, [[0.002, 0.62 * P], [ring * 0.6, 0.03 * P, true], [ring * 0.6, 0.001 * P, true]], off, 0.3);
    // how far sharp, set as the beat against the body's second harmonic, not in cents (a few cents beat fast up
    // high): 0.35–0.85 Hz at the strike, settling towards 0.15 Hz
    const d0 = 1200 * Math.log2(1 + (0.35 + 0.5 * r()) / (2 * f));
    const d1 = 1200 * Math.log2(1 + 0.15 / (2 * f));
    for (const x of [c2, m2]) {
      x.detune.value = d0;
      x.detune.setValueAtTime(d0, t);
      x.detune.linearRampToValueAtTime(d1, t + ring * 1.2);
    }
    const p1 = pan(ctx, p - width), p2 = pan(ctx, p + width);
    m1.connect(g1);
    g1.connect(c1.frequency);
    c1.connect(a1);
    a1.connect(p1);
    m2.connect(g2);
    g2.connect(c2.frequency);
    c2.connect(a2);
    a2.connect(p2);
    p1.connect(s.in);
    p2.connect(s.in);
    // the ting's modulator is silent after 0.15 s: it stops there (the voice frees it with the rest)
    m2.start(t);
    m2.stop(t + 0.16);
    const srcs = [c1, m1, c2];
    const end = Math.max(e1.end, e2.end);
    launch(srcs.map((x) => [x, t] as [AudioScheduledSourceNode, number]), end, [m2, g1, a1, g2, a2, p1, p2]);
    ringing.push({ t, end, envs: [e1, e2], srcs });
  };
}

// ── demos (dev only: tools/audio/render.mjs fn /src/audio/voices/synths.ts demoX) ───────────
const STEP = 60 / 114 / 4;
const BAR = 16 * STEP;

/**
 * City-pop stabs on IVmaj9 iii9 ii9 V13 in C (rootless: Fmaj9 Em9 Dm9 G13), mezzo then forte with the octave on top,
 * a held chord, a swell and a fall. Ends by 19 s.
 */
export function demoFMBrass(lab: Lab): void {
  const brass = makeFMBrass(lab.ctx, lab.strip('brass', { gain: 0.85, rev: 0.22, del: 0.04 }), lab.r, { onStop: lab.onStop });
  const chords = [[57, 64, 67, 72], [55, 62, 66, 71], [53, 60, 64, 69], [53, 59, 64, 69]];
  const hits: [number, number, number][] = [[0, 1, 1], [3, 1, 0.75], [6, 2, 0.95], [10, 1, 0.7], [12, 2, 0.85]];
  let t = lab.t0;
  // four bars mezzo, then two forte with the octave doubled on top
  for (const v of chords) {
    for (const [step, len, acc] of hits) brass(t + step * STEP, v, len * STEP * 0.85, 0.5 * acc);
    t += BAR;
  }
  for (const v of chords.slice(0, 2)) {
    for (const [step, len, acc] of hits) brass(t + step * STEP, [...v, v[3] + 12], len * STEP * 0.85, 0.94 * acc);
    t += BAR;
  }
  // a held chord (the stab's attack, then a sustain with the top note's vibrato), answered by two stabs
  brass(t, [53, 60, 64, 69, 72], 10 * STEP, 0.8);
  brass(t + 11 * STEP, [53, 59, 64, 69, 74], STEP * 0.8, 0.85);
  brass(t + 14 * STEP, [53, 59, 64, 69, 74], STEP * 1.6, 0.95);
  t += BAR;
  // a swell into the tonic, and a fall off the last hit
  brass(t, [57, 64, 67, 72, 76], BAR, 0.85, 'swell');
  brass(t + BAR + 3 * STEP, [60, 64, 67, 72], STEP * 2, 1, 'fall');
}

/** Held chords opening up (I vi ii V in C), the same as a syncopated stab comp an octave up, then a pad. Ends by 19 s. */
export function demoPolySynth(lab: Lab): void {
  const keys = makePolySynth(lab.ctx, lab.strip('poly', { gain: 1, rev: 0.2, del: 0.05 }), lab.r, { onStop: lab.onStop });
  const stab = makePolySynth(lab.ctx, lab.strip('polystab', { gain: 1, rev: 0.16, del: 0.08 }), lab.r, { preset: 'stab', onStop: lab.onStop });
  const pad = makePolySynth(lab.ctx, lab.strip('polypad', { gain: 0.85, rev: 0.3 }), lab.r, { preset: 'pad', onStop: lab.onStop });
  const prog = [[52, 55, 59, 62], [48, 52, 55, 59], [53, 57, 60, 64], [53, 59, 64, 69]];
  let t = lab.t0;
  // two beats each, the filter opening wider chord by chord
  prog.forEach((v, i) => keys(t + i * BAR * 0.5, v, BAR * 0.46, 0.35 + i * 0.18, 0.8 + i * 0.15));
  t += 2 * BAR;
  const hits: [number, number, number][] = [[0, 1, 1], [3, 1, 0.7], [6, 1.5, 0.9], [8, 0.8, 0.6], [11, 1, 0.8], [14, 1.5, 0.95]];
  prog.forEach((v, i) => hits.forEach(([h, len, acc]) => stab(t + i * BAR + h * STEP, v.map((x) => x + 12), len * STEP, (0.5 + 0.12 * i) * acc + 0.1)));
  t += 4 * BAR;
  pad(t, [53, 57, 60, 64, 67], BAR, 0.55);
  pad(t + BAR, [48, 55, 59, 62, 64], BAR * 0.9, 0.75);
}

/**
 * A slap line over IV iii ii V in C: thumb, pops on the octave (the thumbed root rings on under them), ghost notes;
 * two fingered bars; a popped run up the octave and home. Ends by 19 s.
 */
export function demoFMBass(lab: Lab): void {
  const bass = makeFMBass(lab.ctx, lab.strip('fmbass', { gain: 0.85, rev: 0.05 }), lab.r);
  // the roots and each chord's seventh (Fmaj7's is major); `semi` 10 in the lines below means "the seventh"
  const roots = [29, 28, 38, 31], sevenths = [11, 10, 10, 10];
  type Hit = [step: number, semi: number, art: BassArticulation, vel: number, len: number];
  const slap: Hit[] = [
    [0, 0, 'slap', 1, 1.6], [2, 0, 'ghost', 0.6, 0.5], [3, 12, 'pop', 0.85, 1], [5, 0, 'slap', 0.7, 0.8], [6, 0, 'slap', 0.8, 0.5],
    [7, 12, 'pop', 0.7, 0.7], [8, 0, 'ghost', 0.5, 0.5], [10, 7, 'slap', 0.75, 1], [11, 12, 'pop', 0.8, 0.8], [12, 0, 'slap', 0.9, 1],
    [13, 0, 'ghost', 0.45, 0.5], [14, 12, 'pop', 0.9, 0.7], [15, 10, 'slap', 0.6, 0.8],
  ];
  const finger: Hit[] = [[0, 0, 'finger', 0.9, 3], [3, 0, 'finger', 0.55, 1], [4, 12, 'finger', 0.7, 2], [6, 7, 'finger', 0.65, 2], [8, 0, 'finger', 0.8, 2], [10, 10, 'finger', 0.6, 2], [12, 12, 'finger', 0.75, 2], [14, 7, 'finger', 0.6, 2]];
  let t = lab.t0;
  const play = (line: Hit[], root: number, soft = 1, seventh = 10) => {
    for (const [st, semi, art, vel, len] of line) bass(t + st * STEP + (lab.r() - 0.5) * 0.006, root + (semi === 10 ? seventh : semi), len * STEP * 0.9, vel * soft, art);
    t += BAR;
  };
  roots.forEach((rt, i) => play(slap, rt, i < 2 ? 0.75 : 1, sevenths[i]));
  // fingered, an octave up on the low roots: IV and iii
  roots.slice(0, 2).forEach((rt, i) => play(finger, rt + 12, 0.85, sevenths[i]));
  // the fill on ii–V: a run up the octave, popped, and home to C
  const run: Hit[] = [[0, 0, 'slap', 1, 1], [2, 12, 'pop', 0.9, 0.5], [3, 14, 'pop', 0.8, 0.5], [4, 16, 'pop', 0.85, 0.5], [5, 17, 'pop', 0.9, 0.5], [6, 19, 'pop', 1, 1], [8, 7, 'slap', 0.8, 1], [9, 12, 'pop', 0.85, 0.5], [10, 10, 'slap', 0.7, 0.5], [11, 9, 'slap', 0.7, 0.5], [12, 7, 'slap', 0.85, 1], [14, 5, 'slap', 0.8, 1]];
  play(run, roots[3]);
  bass(t, 36, 2.2, 1, 'slap');
}

/** A Moog line over I vi IV V in C: plucked eighths, staccato octaves, legato slides, a held note, soft to loud. */
export function demoSynthBass(lab: Lab): void {
  const bass = makeSynthBass(lab.ctx, lab.strip('moog', { gain: 1, rev: 0.04 }), lab.r, { glide: 0.06 });
  type Hit = [step: number, m: number, len: number, vel: number];
  const bars: Hit[][] = [
    [[0, 36, 3, 0.9], [3, 36, 1, 0.5], [4, 48, 1, 0.75], [6, 43, 2, 0.7], [8, 45, 1, 0.6], [10, 43, 2.4, 0.8], [12, 40, 3.2, 0.85], [15, 38, 1, 0.6]],
    [[0, 33, 3, 0.9], [3, 33, 1, 0.5], [4, 45, 1, 0.75], [6, 40, 2, 0.7], [8, 43, 1, 0.6], [10, 45, 2, 0.8], [12, 47, 1, 0.7], [13, 48, 1.4, 0.75], [14, 47, 2, 0.6]],
    [[0, 29, 6, 1], [6, 41, 1, 0.7], [7, 41, 1, 0.5], [8, 36, 2, 0.8], [10, 38, 2.3, 0.75], [12, 41, 2.3, 0.85], [14, 43, 2, 0.7]],
    [[0, 31, 2, 0.95], [2, 43, 1, 0.8], [3, 31, 1, 0.55], [4, 43, 1, 0.8], [6, 38, 1, 0.7], [7, 41, 1, 0.75], [8, 43, 2, 0.9], [10, 47, 2, 0.85], [12, 50, 1, 0.9], [13, 47, 1, 0.8], [14, 43, 1, 0.85], [15, 38, 1, 0.8]],
  ];
  let t = lab.t0;
  for (let pass = 0; pass < 2; pass++)
    for (const bar of bars) {
      for (const [st, m, len, vel] of bar) bass(t + st * STEP, m, len * STEP * 0.92, vel * (pass ? 1 : 0.6));
      t += BAR;
    }
  bass(t, 36, 1.5, 1);
}

/** Sixteenth arpeggios over I V vi IV I V in D, two octaves, soft to loud, then a fast run and a slow spread chord. */
export function demoPluck(lab: Lab): void {
  const pluck = makePluckSynth(lab.ctx, lab.strip('pluck', { gain: 0.5, rev: 0.2, del: 0.22 }), lab.r);
  const chords = [[62, 66, 69], [61, 64, 69], [59, 62, 66], [55, 59, 62]];
  let t = lab.t0;
  for (let b = 0; b < 6; b++) {
    const c = chords[b % 4];
    const tones = [c[0], c[1], c[2], c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24, c[2] + 12];
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 3, 4, 5];
    const lift = 0.35 + 0.6 * (b / 5);
    order.forEach((k, i) => pluck(t + i * STEP, tones[k], STEP * 0.85, lift * (i % 4 === 0 ? 1 : i % 2 ? 0.62 : 0.78), ((i % 4) - 1.5) * 0.22));
    t += BAR;
  }
  // a run up the D major pentatonic and back, in thirty-seconds
  const run = [74, 76, 78, 81, 83, 86, 88, 90, 93, 90, 88, 86, 83, 81, 78, 76];
  run.forEach((m, i) => pluck(t + i * STEP * 0.5, m, STEP * 0.5, 0.7 + 0.3 * (i / 15), i % 2 ? 0.3 : -0.3));
  t += BAR / 2;
  [50, 57, 62, 66, 69, 74].forEach((m, i) => pluck(t + i * 0.09, m, 2.2, 0.85 - i * 0.05, (i - 2.5) * 0.15));
}

/**
 * Act V's light at 96 bpm in E: high arpeggios over E C#m A B (each note rings on), the theme's four notes as bells, a
 * shower, a chord left to ring out. Ends by 19.5 s.
 */
export function demoSparkle(lab: Lab): void {
  const sp = makeSparkle(lab.ctx, lab.strip('sparkle', { gain: 0.55, rev: 0.3, del: 0.25 }), lab.r);
  const st = 60 / 96 / 4, bar = 16 * st;
  const chords = [[76, 80, 83, 87], [73, 76, 80, 83], [69, 73, 76, 80], [71, 75, 78, 81]];
  let t = lab.t0;
  for (let b = 0; b < 4; b++) {
    const c = chords[b];
    const tones = [...c, ...c.map((x) => x + 12)];
    for (let i = 0; i < 16; i += 2) sp(t + i * st, tones[(i / 2 + b) % 8], st * 1.6, 0.35 + 0.1 * b + (i % 8 === 0 ? 0.2 : 0), ((i / 2) % 4 - 1.5) * 0.25);
    t += bar;
  }
  // the theme's four notes (5 1 2 3), as bells
  [[83, 0], [88, 3], [90, 6], [92, 8]].forEach(([m, s]) => sp(t + s * st * 2, m, st * 6, 0.85, 0));
  t += bar;
  // a shower down the E major pentatonic and back up, in thirty-seconds
  const penta = [100, 97, 95, 92, 90, 88, 85, 83, 80, 78, 76, 73];
  for (let i = 0; i < 24; i++) sp(t + i * st * 0.5, penta[i < 12 ? i : 23 - i], st, 0.25 + 0.35 * (1 - i / 24), Math.sin(i * 1.7) * 0.5);
  t += bar * 0.8;
  [71, 76, 80, 83, 88].forEach((m, i) => sp(t + i * 0.05, m, 3, 0.75, (i - 2) * 0.15));
}
