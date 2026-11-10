/**
 * The cinematic score's instruments: warm pads, a formant choir, electric and felt pianos, bells, mallets, plucks,
 * bass and a soft kit, all from standard WebAudio nodes (oscillators with band-limited wave tables, biquads, gains).
 * Every voice starts and ends at zero gain (no clicks) and frees its nodes when its last source ends.
 */
import { freeWhenDone, noiseBuffer } from './engine';

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Where a strip's sound goes: the dry mix and the two shared sends (reverb, tempo delay). */
export interface Outs {
  dry: AudioNode;
  rev: AudioNode;
  del: AudioNode;
}

/** The mood layers: `core` always plays, `rhythm` rests while paused, `drive` joins at speed, `tension` in a finale. */
export type Group = 'core' | 'rhythm' | 'drive' | 'tension';

export interface Strip {
  in: GainNode;
  fader: GainNode;
  /** The fader's level with the mood at rest. */
  level: number;
  group: Group;
  nodes: AudioNode[];
}

/** A channel strip: voices → fader → pan → dry, with post-fader sends to the reverb and the delay. */
export function strip(ctx: BaseAudioContext, outs: Outs, o: { gain: number; group?: Group; pan?: number; rev?: number; del?: number; lp?: number; hp?: number }): Strip {
  const input = ctx.createGain();
  const fader = ctx.createGain();
  fader.gain.value = o.gain;
  const nodes: AudioNode[] = [input, fader];
  let tail: AudioNode = input;
  for (const [type, freq] of [['highpass', o.hp], ['lowpass', o.lp]] as const) {
    if (!freq) continue;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 0.5;
    tail.connect(f);
    tail = f;
    nodes.push(f);
  }
  tail.connect(fader);
  tail = fader;
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    tail.connect(p);
    tail = p;
    nodes.push(p);
  }
  tail.connect(outs.dry);
  for (const [amount, to] of [[o.rev, outs.rev], [o.del, outs.del]] as const) {
    if (!amount) continue;
    const s = ctx.createGain();
    s.gain.value = amount;
    tail.connect(s);
    s.connect(to);
    nodes.push(s);
  }
  return { in: input, fader, level: o.gain, group: o.group ?? 'core', nodes };
}

// ── wave tables ─────────────────────────────────────────────────────────────────────────────
export type Wave = 'warm' | 'soft' | 'hollow' | 'voice' | 'piano' | 'glass';

/** Harmonic recipes: amplitude of the n-th partial. Band-limited, so nothing aliases and little needs filtering. */
const RECIPES: Record<Wave, (n: number) => number> = {
  // a saw with its top rolled off: the analogue string-machine staple
  warm: (n) => 1 / n / (1 + (n / 14) ** 2),
  // between a triangle and a saw: keys, bass
  soft: (n) => 1 / n ** 1.8,
  // odd partials only, rolled off: a clarinet-like reed for the dusty lead
  hollow: (n) => (n % 2 ? 1 / n / (1 + (n / 9) ** 2) : 0.04 / n),
  // rich and buzzy: what the choir's formant filters carve their vowels from
  voice: (n) => 1 / n ** 1.05,
  // a struck string: strong low partials, a quick fall-off
  piano: (n) => [1, 0.62, 0.34, 0.2, 0.13, 0.08, 0.05, 0.035, 0.022, 0.015, 0.01, 0.007][n - 1] ?? 0,
  // a few clean partials: a glass harmonica
  glass: (n) => [1, 0.0, 0.28, 0.0, 0.1, 0, 0.04][n - 1] ?? 0,
};

const waves = new WeakMap<BaseAudioContext, Map<Wave, PeriodicWave>>();

export function wave(ctx: BaseAudioContext, name: Wave): PeriodicWave {
  let m = waves.get(ctx);
  if (!m) waves.set(ctx, (m = new Map()));
  let w = m.get(name);
  if (!w) {
    const N = 40;
    const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) imag[n] = RECIPES[name](n);
    w = ctx.createPeriodicWave(real, imag);
    m.set(name, w);
  }
  return w;
}

function osc(ctx: BaseAudioContext, w: Wave | 'sine', freq: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  if (w !== 'sine') o.setPeriodicWave(wave(ctx, w));
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  return o;
}

function pan(ctx: BaseAudioContext, p: number): AudioNode {
  if (!ctx.createStereoPanner) return ctx.createGain();
  const n = ctx.createStereoPanner();
  n.pan.value = Math.max(-1, Math.min(1, p));
  return n;
}

/**
 * Struck: up in `a` seconds, an exponential fall over `d`, then the last trace to exact zero. Returns the end time.
 * (Envelopes set the gain to zero at once, not only from `t`: a GainNode is born at 1, and a source that starts a
 * sample before its envelope would let one full-level sample through.)
 */
function struck(g: AudioParam, t: number, a: number, peak: number, d: number): number {
  g.value = 0;
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.exponentialRampToValueAtTime(Math.max(1e-5, peak * 0.001), t + a + d);
  g.linearRampToValueAtTime(0, t + a + d + 0.01);
  return t + a + d + 0.01;
}

/** Held: a linear swell in, held to the note's end, a linear fade out (pads cross-fade seamlessly). Returns the end time. */
function held(g: AudioParam, t: number, a: number, peak: number, dur: number, r: number): number {
  const off = t + Math.max(a, dur);
  g.value = 0;
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.setValueAtTime(peak, off);
  g.linearRampToValueAtTime(0, off + r);
  return off + r;
}

function run(end: number, sources: AudioScheduledSourceNode[], t: number, nodes: AudioNode[]) {
  for (const s of sources) {
    s.start(t);
    s.stop(end + 0.02);
  }
  freeWhenDone(sources[0], ...sources.slice(1), ...nodes);
}

type Rnd = () => number;

// ── sustained instruments ───────────────────────────────────────────────────────────────────
export interface PadOpts {
  wave?: Wave;
  /** Cents between the two oscillators of a note (the chorus). */
  detune?: number;
  cut?: number;
  q?: number;
  attack?: number;
  release?: number;
  /** How far left and right the two oscillator banks sit (0..1). */
  width?: number;
}

/**
 * A warm pad: two detuned oscillators a note, one bank left and one right, through one low-pass that opens as the
 * chord swells and closes as it leaves. `bright` scales the cutoff (the arranger drifts it over minutes); `pump`
 * dips the chord every `every` seconds and lets it swell back (the sound of a kick drum pushing a pad aside).
 */
export function makePad(ctx: BaseAudioContext, s: Strip, r: Rnd, o: PadOpts = {}) {
  const { detune = 9, cut = 1400, q = 0.6, attack = 1.2, release = 2.4, width = 0.6 } = o;
  return (t: number, notes: number[], dur: number, vel: number, bright = 1, pump?: { every: number; depth: number }) => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    const c = cut * bright;
    f.frequency.setValueAtTime(c * 0.5, t);
    f.frequency.linearRampToValueAtTime(c, t + attack + dur * 0.35);
    f.frequency.linearRampToValueAtTime(c * 0.6, t + Math.max(attack, dur) + release);
    const vca = ctx.createGain();
    const end = held(vca.gain, t, attack, (vel * 0.5) / Math.sqrt(notes.length), dur, release);
    const banks = [pan(ctx, -width), pan(ctx, width)];
    const oscs: OscillatorNode[] = [];
    for (const m of notes)
      for (let k = 0; k < 2; k++) {
        const x = osc(ctx, o.wave ?? 'warm', mtof(m), (k ? 1 : -1) * detune * (0.6 + r() * 0.8));
        x.connect(banks[k]);
        oscs.push(x);
      }
    banks[0].connect(f);
    banks[1].connect(f);
    f.connect(vca);
    const nodes = [...banks, f, vca];
    if (pump) {
      const pg = ctx.createGain();
      for (let tb = t; tb < end; tb += pump.every) {
        pg.gain.setValueAtTime(1, tb);
        pg.gain.linearRampToValueAtTime(1 - pump.depth, tb + 0.014);
        pg.gain.linearRampToValueAtTime(1, tb + pump.every * 0.8);
      }
      vca.connect(pg);
      pg.connect(s.in);
      nodes.push(pg);
    } else vca.connect(s.in);
    run(end, oscs, t, nodes);
  };
}

export type Vowel = 'oo' | 'oh' | 'ah';
/** Formant centres (Hz) and levels for a mixed choir. */
const VOWELS: Record<Vowel, [number, number][]> = {
  oo: [[340, 1], [780, 0.3], [2500, 0.05]],
  oh: [[520, 1], [900, 0.45], [2600, 0.08]],
  ah: [[760, 1], [1150, 0.6], [2800, 0.14]],
};

/**
 * A choir: buzzy detuned voices with a shared slow vibrato, carved into a vowel by three band-passes; the vowel
 * opens from `from` to `to` across the chord (oo → ah is a choir taking a breath and singing out).
 */
export function makeChoir(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { attack?: number; release?: number; width?: number } = {}) {
  const { attack = 0.9, release = 2.2, width = 0.5 } = o;
  return (t: number, notes: number[], dur: number, vel: number, from: Vowel = 'oo', to: Vowel = 'ah') => {
    const vca = ctx.createGain();
    const end = held(vca.gain, t, attack, (vel * 1.6) / Math.sqrt(notes.length), dur, release);
    const mix = ctx.createGain();
    const nodes: AudioNode[] = [vca, mix];
    const a = VOWELS[from], b = VOWELS[to];
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 4.5 + i * 2;
      bp.frequency.setValueAtTime(a[i][0], t);
      bp.frequency.linearRampToValueAtTime(b[i][0], t + attack + dur * 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(a[i][1], t);
      g.gain.linearRampToValueAtTime(b[i][1], t + attack + dur * 0.5);
      mix.connect(bp);
      bp.connect(g);
      g.connect(vca);
      nodes.push(bp, g);
    }
    // vibrato: nothing at the onset, then a human 5 Hz wobble of a few cents
    const lfo = osc(ctx, 'sine', 4.6 + r() * 0.8);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(9, t + attack + 0.6);
    lfo.connect(depth);
    const banks = [pan(ctx, -width), pan(ctx, width)];
    const oscs: OscillatorNode[] = [lfo];
    for (const m of notes)
      for (let k = 0; k < 2; k++) {
        const x = osc(ctx, 'voice', mtof(m), (k ? 1 : -1) * (7 + r() * 9));
        depth.connect(x.detune);
        x.connect(banks[k]);
        oscs.push(x);
      }
    banks[0].connect(mix);
    banks[1].connect(mix);
    vca.connect(s.in);
    run(end, oscs, t, [...nodes, ...banks, depth]);
  };
}

// ── struck and plucked instruments ──────────────────────────────────────────────────────────
/**
 * An electric piano (two-operator FM): a sine carrier whose modulator bites at the strike and dies away, so loud notes
 * bark and soft ones are round. `wow` detunes each note a few cents (a tired tape, for the garage).
 */
export function makeRhodes(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { index?: number; decay?: number; wow?: number } = {}) {
  const { index = 1.1, decay = 1.3, wow = 0 } = o;
  return (t: number, m: number, dur: number, vel: number, p = 0) => {
    const f = mtof(m);
    const car = osc(ctx, 'sine', f, wow ? (r() - 0.5) * 2 * wow : 0);
    const mod = osc(ctx, 'sine', f);
    const mg = ctx.createGain();
    const idx = f * index * (0.35 + vel * 1.3) * Math.min(1, 300 / f + 0.35);
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(idx * 0.07, t + 0.45);
    mod.connect(mg);
    mg.connect(car.frequency);
    const vca = ctx.createGain();
    // high notes ring shorter, like the real thing
    const ring = decay * Math.max(0.35, 1.5 - (m - 48) / 36);
    vca.gain.value = 0;
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(vel * 0.5, t + 0.004);
    vca.gain.setTargetAtTime(0, t + 0.004, ring);
    vca.gain.setTargetAtTime(0, t + dur, 0.09);
    const out = pan(ctx, p);
    car.connect(vca);
    vca.connect(out);
    out.connect(s.in);
    run(t + dur + 0.7, [car, mod], t, [mg, vca, out]);
  };
}

/** A felt piano: two slightly detuned struck-string oscillators through a low-pass that closes as the note rings. */
export function makePiano(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { decay?: number; bright?: number } = {}) {
  const { decay = 1.5, bright = 1 } = o;
  return (t: number, m: number, dur: number, vel: number, p = 0) => {
    const f = mtof(m);
    const a = osc(ctx, 'piano', f, -2.5 - r() * 2), b = osc(ctx, 'piano', f, 2.5 + r() * 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    const open = Math.min(9000, f * (3 + 9 * vel) * bright);
    lp.frequency.setValueAtTime(open, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), t + 0.9);
    const vca = ctx.createGain();
    const ring = decay * Math.max(0.3, 1.6 - (m - 45) / 34);
    vca.gain.value = 0;
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(vel * 0.42, t + 0.006);
    vca.gain.setTargetAtTime(0, t + 0.006, ring);
    vca.gain.setTargetAtTime(0, t + dur, 0.14);
    const out = pan(ctx, p);
    a.connect(lp);
    b.connect(lp);
    lp.connect(vca);
    vca.connect(out);
    out.connect(s.in);
    run(t + dur + 1.1, [a, b], t, [lp, vca, out]);
  };
}

/** An FM bell: an inharmonic modulator (ratio 3.5 = a bell, 4 = a celesta, 2 = glass) whose bite fades into a pure ring. */
export function makeBell(ctx: BaseAudioContext, s: Strip, o: { ratio?: number; index?: number; decay?: number } = {}) {
  const { ratio = 3.5, index = 1.4, decay = 2.6 } = o;
  return (t: number, m: number, vel: number, p = 0, ringMul = 1) => {
    const f = mtof(m);
    const car = osc(ctx, 'sine', f);
    const mod = osc(ctx, 'sine', f * ratio);
    const mg = ctx.createGain();
    const d = decay * ringMul * Math.max(0.4, 1.4 - (m - 60) / 40);
    const idx = f * index * (0.4 + vel);
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(idx * 0.02, t + d * 0.6);
    mod.connect(mg);
    mg.connect(car.frequency);
    const vca = ctx.createGain();
    const end = struck(vca.gain, t, 0.003, vel * 0.4, d);
    const out = pan(ctx, p);
    car.connect(vca);
    vca.connect(out);
    out.connect(s.in);
    run(end, [car, mod], t, [mg, vca, out]);
  };
}

/** A mallet on a wooden bar (marimba: the overtone two octaves up; kalimba: an inharmonic tine at 5.4×). */
export function makeMallet(ctx: BaseAudioContext, s: Strip, o: { ratio?: number; tone?: number; decay?: number } = {}) {
  const { ratio = 4, tone = 0.22, decay = 0.55 } = o;
  return (t: number, m: number, vel: number, p = 0) => {
    const f = mtof(m);
    const body = osc(ctx, 'sine', f), over = osc(ctx, 'sine', f * ratio);
    const gb = ctx.createGain(), go = ctx.createGain();
    // low bars ring longer
    const d = decay * Math.max(0.45, 1.5 - (m - 48) / 30);
    const end = struck(gb.gain, t, 0.003, vel * 0.5, d);
    struck(go.gain, t, 0.002, vel * tone * (0.5 + vel), d * 0.22);
    const out = pan(ctx, p);
    body.connect(gb);
    over.connect(go);
    gb.connect(out);
    go.connect(out);
    out.connect(s.in);
    run(end, [body, over], t, [gb, go, out]);
  };
}

/** A soft synth pluck: one oscillator through a low-pass that snaps shut (the arp's voice). */
export function makePluck(ctx: BaseAudioContext, s: Strip, o: { wave?: Wave; cut?: number; q?: number; decay?: number } = {}) {
  const { cut = 2600, q = 1.6, decay = 0.32 } = o;
  return (t: number, m: number, vel: number, p = 0, bright = 1, len = 1) => {
    const f = mtof(m);
    const x = osc(ctx, o.wave ?? 'warm', f);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = q;
    const top = Math.min(11000, cut * bright * (0.6 + vel * 0.8));
    lp.frequency.setValueAtTime(top, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(260, Math.min(top, f * 1.2)), t + decay * len * 0.7);
    const vca = ctx.createGain();
    const end = struck(vca.gain, t, 0.004, vel * 0.5, decay * len);
    const out = pan(ctx, p);
    x.connect(lp);
    lp.connect(vca);
    vca.connect(out);
    out.connect(s.in);
    run(end, [x], t, [lp, vca, out]);
  };
}

/** A singing lead: two detuned oscillators, a gentle filter, a soft attack and a tail that hangs on. */
export function makeLead(ctx: BaseAudioContext, s: Strip, r: Rnd, o: { wave?: Wave; cut?: number; attack?: number; release?: number; detune?: number } = {}) {
  const { cut = 2400, attack = 0.03, release = 0.35, detune = 6 } = o;
  return (t: number, m: number, dur: number, vel: number) => {
    const f = mtof(m);
    const a = osc(ctx, o.wave ?? 'warm', f, -detune * (0.7 + r() * 0.6)), b = osc(ctx, o.wave ?? 'warm', f, detune * (0.7 + r() * 0.6));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(9000, cut * (0.7 + vel * 0.6)), t);
    lp.frequency.linearRampToValueAtTime(Math.min(9000, cut * 0.6), t + dur + release);
    const vca = ctx.createGain();
    const end = held(vca.gain, t, attack, vel * 0.3, dur, release);
    a.connect(lp);
    b.connect(lp);
    lp.connect(vca);
    vca.connect(s.in);
    run(end, [a, b], t, [lp, vca]);
  };
}

/** Bass: a sine for the weight, a filtered soft saw on top so small speakers can still hear the note. */
export function makeBass(ctx: BaseAudioContext, s: Strip, o: { cut?: number; grit?: number; release?: number } = {}) {
  const { cut = 420, grit = 0.5, release = 0.12 } = o;
  return (t: number, m: number, dur: number, vel: number) => {
    const f = mtof(m);
    const sub = osc(ctx, 'sine', f), top = osc(ctx, 'soft', f);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(cut * (1 + vel), t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.6, t + Math.min(dur, 0.5));
    const tg = ctx.createGain();
    tg.gain.value = grit;
    const vca = ctx.createGain();
    const end = held(vca.gain, t, 0.012, vel * 0.24, dur, release);
    top.connect(lp);
    lp.connect(tg);
    tg.connect(vca);
    sub.connect(vca);
    vca.connect(s.in);
    run(end, [sub, top], t, [lp, tg, vca]);
  };
}

// ── the kit ─────────────────────────────────────────────────────────────────────────────────
function burst(ctx: BaseAudioContext, r: Rnd, kind: 'white' | 'pink' = 'white'): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  const buf = noiseBuffer(kind);
  src.buffer = buf;
  src.loop = true;
  src.loopStart = r() * (buf.duration - 0.5);
  src.loopEnd = buf.duration;
  return src;
}

export function makeKit(ctx: BaseAudioContext, s: Strip, r: Rnd) {
  const noise = (t: number, type: BiquadFilterType, freq: number, q: number, a: number, peak: number, d: number, sweepTo = 0) => {
    const src = burst(ctx, r);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + a + d);
    f.Q.value = q;
    const g = ctx.createGain();
    const end = struck(g.gain, t, a, peak, d);
    src.connect(f);
    f.connect(g);
    g.connect(s.in);
    src.start(t, src.loopStart);
    src.stop(end + 0.02);
    freeWhenDone(src, f, g);
  };
  const tone = (t: number, f0: number, f1: number, drop: number, peak: number, d: number, a = 0.003) => {
    const x = osc(ctx, 'sine', f0);
    x.frequency.setValueAtTime(f0, t);
    x.frequency.exponentialRampToValueAtTime(f1, t + drop);
    const g = ctx.createGain();
    const end = struck(g.gain, t, a, peak, d);
    x.connect(g);
    g.connect(s.in);
    run(end, [x], t, [g]);
  };
  return {
    /** A round kick: a sine falling from `f0` to `f1`; `click` adds the beater. */
    kick(t: number, vel: number, o: { f0?: number; f1?: number; decay?: number; click?: number } = {}) {
      tone(t, o.f0 ?? 118, o.f1 ?? 46, 0.085, vel * 0.9, o.decay ?? 0.3);
      if (o.click) noise(t, 'lowpass', 2800, 0.5, 0.001, vel * o.click, 0.018);
    },
    /** A soft snare: a short noise body and a low knock. */
    snare(t: number, vel: number) {
      noise(t, 'bandpass', 1900, 0.7, 0.002, vel * 0.5, 0.16);
      tone(t, 210, 165, 0.05, vel * 0.3, 0.09);
    },
    /** A rim click: woody, dry, tiny. */
    rim(t: number, vel: number) {
      noise(t, 'bandpass', 1500, 4, 0.001, vel * 0.5, 0.035);
      tone(t, 520, 410, 0.02, vel * 0.22, 0.045, 0.001);
    },
    /** A clap: three quick slaps and a tail. */
    clap(t: number, vel: number) {
      for (let k = 0; k < 3; k++) noise(t + k * 0.011, 'bandpass', 1250, 1.4, 0.001, vel * (k === 2 ? 0.45 : 0.3), k === 2 ? 0.16 : 0.012);
    },
    hat(t: number, vel: number, open = false) {
      noise(t, 'highpass', 7800, 0.7, 0.002, vel * 0.3, open ? 0.24 : 0.04);
    },
    /** A shaker: a soft-edged hiss, so it brushes rather than ticks. */
    shaker(t: number, vel: number) {
      noise(t, 'bandpass', 5600, 1.1, 0.014, vel * 0.3, 0.07);
    },
    /** A hand drum or a far taiko, by pitch and length. */
    tom(t: number, vel: number, f = 110, decay = 0.5) {
      tone(t, f * 1.5, f, 0.1, vel * 0.8, decay);
      noise(t, 'lowpass', 900, 0.5, 0.002, vel * 0.25, 0.07);
    },
    /** A deep, slow boom with a long tail (the distant drum of the big moments). */
    boom(t: number, vel: number) {
      tone(t, 78, 41, 0.35, vel * 0.9, 2.4, 0.006);
      noise(t, 'lowpass', 320, 0.4, 0.004, vel * 0.5, 0.5);
    },
    /** A cymbal swell: bright noise rising for `dur`, then washing out. */
    swell(t: number, dur: number, vel: number, low = 4500) {
      const src = burst(ctx, r);
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = low;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * 0.05, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(vel * 0.4, t + dur);
      g.gain.exponentialRampToValueAtTime(vel * 0.0004, t + dur + 2.2);
      g.gain.linearRampToValueAtTime(0, t + dur + 2.21);
      src.connect(f);
      f.connect(g);
      g.connect(s.in);
      src.start(t, src.loopStart);
      src.stop(t + dur + 2.25);
      freeWhenDone(src, f, g);
    },
    /** A riser: a band of noise climbing into the next section. */
    riser(t: number, dur: number, vel: number) {
      noise(t, 'bandpass', 350, 1.2, dur * 0.96, vel * 0.3, dur * 0.04 + 0.25, 3600);
    },
  };
}

export type Kit = ReturnType<typeof makeKit>;

/**
 * Vinyl crackle and tape hiss for the garage: a looped bed made once (sparse ticks over a whisper of hiss).
 * Returns the source to stop when the track ends.
 */
export function crackle(ctx: BaseAudioContext, s: Strip, r: Rnd): AudioScheduledSourceNode {
  const len = ctx.sampleRate * 5;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * 0.012;
  }
  for (let k = 0; k < 85; k++) {
    // a tick: a tiny decaying spike, mostly in one channel
    const at = Math.floor(r() * (len - 400)), amp = 0.15 + r() ** 3 * 0.85, side = r();
    for (let i = 0; i < 90; i++) {
      const v = amp * Math.exp(-i / (4 + r() * 10)) * (r() * 2 - 1);
      buf.getChannelData(0)[at + i] += v * (0.3 + 0.7 * side);
      buf.getChannelData(1)[at + i] += v * (1 - 0.7 * side);
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 2600;
  hp.Q.value = 0.35;
  src.connect(hp);
  hp.connect(s.in);
  s.nodes.push(src, hp);
  src.start();
  return src;
}
