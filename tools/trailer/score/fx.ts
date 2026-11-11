/**
 * Trailer-only sounds the game has no use for: the boom under a drop, risers, a whoosh, a low brass "braam", a
 * rocket's rumble, a bigger snare. All from standard WebAudio nodes, in the style of src/audio/synth.ts (every voice
 * starts and ends at zero gain and frees its nodes when its source ends).
 */
import { freeWhenDone, noiseBuffer, voiceFilter } from '../../../src/audio/engine';
import { mtof, wave, type Strip } from '../../../src/audio/synth';

type Rnd = () => number;

/** Struck: up in `a`, an exponential fall over `d`, then to exact zero. Returns the end time. */
function struck(g: AudioParam, t: number, a: number, peak: number, d: number): number {
  g.value = 0;
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.exponentialRampToValueAtTime(Math.max(1e-5, peak * 0.001), t + a + d);
  g.linearRampToValueAtTime(0, t + a + d + 0.01);
  return t + a + d + 0.01;
}

/** A level that climbs as (time)^pow to `peak` at `end`, then shuts in a few milliseconds (a riser's cut). */
function climb(g: AudioParam, t: number, end: number, peak: number, pow: number): number {
  const N = 96, curve = new Float32Array(N);
  for (let i = 0; i < N; i++) curve[i] = peak * Math.pow(i / (N - 1), pow);
  g.value = 0;
  g.setValueAtTime(0, t);
  g.setValueCurveAtTime(curve, t, Math.max(0.01, end - t - 0.002));
  g.setValueAtTime(peak, end);
  g.linearRampToValueAtTime(0, end + 0.014);
  return end + 0.014;
}

/** A soft saturation: adds the harmonics that let a small speaker hear a low sound. */
function saturate(ctx: BaseAudioContext, drive: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const c = new Float32Array(1025);
  for (let i = 0; i < c.length; i++) c[i] = Math.tanh(((i / 512) - 1) * drive) / Math.tanh(drive);
  ws.curve = c;
  ws.oversample = '2x';
  return ws;
}

export interface FxStrips {
  /** Low and dry: booms, sub drops, the rumble. */
  low: Strip;
  /** Bright, with hall: risers, whooshes, cymbal washes, the crack on top of a boom. */
  air: Strip;
}

export function makeFx(ctx: BaseAudioContext, s: FxStrips, r: Rnd) {
  const noise = (kind: 'white' | 'pink' | 'brown') => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(kind);
    src.loop = true;
    return src;
  };
  const go = (src: AudioBufferSourceNode, t: number, end: number, ...nodes: AudioNode[]) => {
    src.start(t, r() * 4);
    src.stop(end + 0.03);
    freeWhenDone(src, ...nodes);
  };
  /** A burst of filtered noise. */
  const burst = (to: Strip, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, f0: number, f1: number, q: number, a: number, peak: number, d: number) => {
    const src = noise(kind);
    const f = voiceFilter(ctx);
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    const g = ctx.createGain();
    const end = struck(g.gain, t, a, peak, d);
    src.connect(f);
    f.connect(g);
    g.connect(to.in);
    go(src, t, end, f, g);
  };

  const fx = {
    /**
     * The boom under a drop: a sine falling into the sub, a saturated body an octave up (what a phone hears), a thud
     * of low noise and, with `bright`, a crack and a splash on top.
     */
    boom(t: number, vel: number, o: { f0?: number; f1?: number; drop?: number; decay?: number; bright?: number } = {}) {
      const { f0 = 120, f1 = 39, drop = 0.2, decay = 2.0, bright = 1 } = o;
      const sub = ctx.createOscillator();
      sub.frequency.setValueAtTime(f0, t);
      sub.frequency.exponentialRampToValueAtTime(f1, t + drop);
      const body = ctx.createOscillator();
      body.setPeriodicWave(wave(ctx, 'soft'));
      body.frequency.setValueAtTime(f0 * 2.4, t);
      body.frequency.exponentialRampToValueAtTime(f1 * 3, t + drop * 0.8);
      const gs = ctx.createGain(), gb = ctx.createGain();
      const end = struck(gs.gain, t, 0.004, vel * 0.9, decay);
      struck(gb.gain, t, 0.003, vel * 0.42, Math.min(0.7, decay * 0.35));
      const lp = voiceFilter(ctx);
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      lp.Q.value = 0.5;
      const sat = saturate(ctx, 1.7);
      sub.connect(gs);
      body.connect(lp);
      lp.connect(gb);
      gs.connect(sat);
      gb.connect(sat);
      sat.connect(s.low.in);
      for (const o2 of [sub, body]) {
        o2.start(t);
        o2.stop(end + 0.02);
      }
      freeWhenDone(sub, body, gs, gb, lp, sat);
      burst(s.low, t, 'pink', 'lowpass', 1300, 170, 0.5, 0.003, vel * 0.8, 0.32);
      if (bright > 0) {
        burst(s.air, t, 'white', 'bandpass', 2400, 2400, 0.8, 0.001, vel * 0.55 * bright, 0.07);
        burst(s.air, t, 'white', 'highpass', 6000, 6000, 0.6, 0.001, vel * 0.4 * bright, 0.13);
      }
    },
    /** A cymbal splash and its wash. */
    crash(t: number, vel: number, decay = 1.8) {
      burst(s.air, t, 'white', 'highpass', 5200, 5200, 0.5, 0.002, vel * 0.4, decay);
      burst(s.air, t, 'white', 'bandpass', 3300, 3300, 0.6, 0.002, vel * 0.22, decay * 0.45);
    },
    /**
     * A riser into `t + dur`: a band of noise sweeping up, a pitch climbing `octs` octaves from `note`, a tremolo
     * that tightens from `trem[0]` to `trem[1]` Hz. It shuts `gap` seconds before the end, so the hit lands on silence.
     */
    riser(t: number, dur: number, vel: number, o: { note?: number; octs?: number; f0?: number; f1?: number; trem?: [number, number]; gap?: number; pow?: number } = {}) {
      const { octs = 2, f0 = 380, f1 = 9000, gap = 0.06, pow = 2.2 } = o;
      const end = t + dur - gap;
      const out = ctx.createGain();
      out.connect(s.air.in);
      const nodes: AudioNode[] = [out];
      const src = noise('white');
      const bp = voiceFilter(ctx);
      bp.type = 'bandpass';
      bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, end);
      const gn = ctx.createGain();
      const stop = climb(gn.gain, t, end, vel * 0.55, pow);
      src.connect(bp);
      bp.connect(gn);
      gn.connect(out);
      nodes.push(bp, gn);
      const oscs: OscillatorNode[] = [];
      if (o.note !== undefined) {
        const lp = voiceFilter(ctx);
        lp.type = 'lowpass';
        lp.Q.value = 1.2;
        lp.frequency.setValueAtTime(500, t);
        lp.frequency.exponentialRampToValueAtTime(5200, end);
        const gp = ctx.createGain();
        climb(gp.gain, t, end, vel * 0.2, pow * 0.7);
        for (const cents of [-10, 10]) {
          const x = ctx.createOscillator();
          x.setPeriodicWave(wave(ctx, 'warm'));
          x.detune.value = cents;
          x.frequency.setValueAtTime(mtof(o.note), t);
          x.frequency.exponentialRampToValueAtTime(mtof(o.note + 12 * octs), end);
          x.connect(lp);
          oscs.push(x);
        }
        lp.connect(gp);
        gp.connect(out);
        nodes.push(lp, gp);
      }
      if (o.trem) {
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(o.trem[0], t);
        lfo.frequency.exponentialRampToValueAtTime(o.trem[1], end);
        const depth = ctx.createGain();
        depth.gain.value = 0.38;
        out.gain.value = 0.62;
        lfo.connect(depth);
        depth.connect(out.gain);
        oscs.push(lfo);
        nodes.push(depth);
      }
      for (const x of oscs) {
        x.start(t);
        x.stop(stop + 0.02);
      }
      go(src, t, stop, ...oscs, ...nodes);
    },
    /** Open air: a breath of high noise that comes and goes over `dur` seconds (the quiet of a big place). */
    air(t: number, dur: number, vel: number) {
      const src = noise('pink');
      const hp = voiceFilter(ctx);
      hp.type = 'highpass';
      hp.frequency.value = 2400;
      hp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + dur * 0.45);
      g.gain.linearRampToValueAtTime(vel * 0.7, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.connect(hp);
      hp.connect(g);
      g.connect(s.air.in);
      go(src, t, t + dur, hp, g);
    },
    /** Air going past: a band of noise up and back down, crossing from one side to the other. */
    whoosh(t: number, dur: number, vel: number, side = 0.5) {
      const src = noise('pink');
      const bp = voiceFilter(ctx);
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(280, t);
      bp.frequency.exponentialRampToValueAtTime(3400, t + dur * 0.62);
      bp.frequency.exponentialRampToValueAtTime(500, t + dur);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * 0.9, t + dur * 0.62);
      g.gain.exponentialRampToValueAtTime(vel * 0.001, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(side, t);
      p.pan.linearRampToValueAtTime(-side, t + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(p);
      p.connect(s.air.in);
      go(src, t, t + dur + 0.01, bp, g, p);
    },
    /** The floor dropping away at a cut-out: a sine sliding down into the sub, air falling with it. */
    subdrop(t: number, dur: number, vel: number) {
      const x = ctx.createOscillator();
      x.frequency.setValueAtTime(130, t);
      x.frequency.exponentialRampToValueAtTime(33, t + dur * 0.7);
      const g = ctx.createGain();
      const end = struck(g.gain, t, 0.02, vel * 0.7, dur);
      const sat = saturate(ctx, 1.5);
      x.connect(g);
      g.connect(sat);
      sat.connect(s.low.in);
      x.start(t);
      x.stop(end + 0.02);
      freeWhenDone(x, g, sat);
      burst(s.air, t, 'pink', 'bandpass', 2600, 260, 0.8, 0.03, vel * 0.5, dur * 0.8);
    },
    /**
     * A rocket's rumble: brown noise you feel and a roar you hear, both shaking with slow noise; full for the first
     * 55% of `dur`, then falling away as the rocket leaves.
     */
    rumble(t: number, dur: number, vel: number) {
      const shake = noise('white');
      const slow = voiceFilter(ctx);
      slow.type = 'lowpass';
      slow.frequency.value = 34;
      const depth = ctx.createGain();
      depth.gain.value = 16;
      shake.connect(slow);
      slow.connect(depth);
      const nodes: AudioNode[] = [slow, depth];
      const srcs: AudioBufferSourceNode[] = [];
      for (const [kind, type, f0, f1, peak, to] of [['brown', 'lowpass', 85, 170, 1.5, s.low], ['pink', 'bandpass', 340, 760, 0.42, s.low], ['white', 'bandpass', 1800, 3200, 0.07, s.air]] as const) {
        const src = noise(kind);
        const f = voiceFilter(ctx);
        f.type = type;
        f.Q.value = 0.6;
        f.frequency.setValueAtTime(f0, t);
        f.frequency.linearRampToValueAtTime(f1, t + dur * 0.5);
        f.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
        const flutter = ctx.createGain();
        flutter.gain.value = 0.72;
        depth.connect(flutter.gain);
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel * peak, t + 0.1);
        g.gain.setValueAtTime(vel * peak, t + dur * 0.55);
        g.gain.exponentialRampToValueAtTime(vel * peak * 0.002, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
        src.connect(f);
        f.connect(flutter);
        flutter.connect(g);
        g.connect(to.in);
        nodes.push(f, flutter, g);
        srcs.push(src);
      }
      for (const x of [shake, ...srcs.slice(1)]) {
        x.start(t, r() * 4);
        x.stop(t + dur + 0.05);
      }
      go(srcs[0], t, t + dur + 0.02, shake, ...srcs.slice(1), ...nodes);
    },
  };
  return fx;
}

export type Fx = ReturnType<typeof makeFx>;

/**
 * Low brass, trailer style: buzzy detuned voices on a root and its fifth, driven into a soft clip, a filter that
 * barks open and settles. Tonal (it plays the chord's root), so it belongs to the music.
 */
export function makeBraam(ctx: BaseAudioContext, s: Strip, r: Rnd) {
  return (t: number, m: number, dur: number, vel: number, bright = 1) => {
    const mix = ctx.createGain();
    mix.gain.value = 0.34;
    const oscs: OscillatorNode[] = [];
    for (const [semi, cents, level] of [[0, -11, 1], [0, 11, 1], [7, 4, 0.55], [12, -6, 0.5], [0, 0, 0.6]] as const) {
      const x = ctx.createOscillator();
      // the last voice is a plain sine on the root: the weight under the buzz
      if (cents !== 0) x.setPeriodicWave(wave(ctx, 'voice'));
      x.frequency.value = mtof(m + semi);
      x.detune.value = cents * (0.7 + r() * 0.6);
      const g = ctx.createGain();
      g.gain.value = level;
      x.connect(g);
      g.connect(mix);
      oscs.push(x);
    }
    const sat = saturate(ctx, 2.4);
    const lp = voiceFilter(ctx);
    lp.type = 'lowpass';
    lp.Q.value = 1;
    lp.frequency.setValueAtTime(240, t);
    lp.frequency.exponentialRampToValueAtTime(1700 * bright, t + 0.09);
    lp.frequency.exponentialRampToValueAtTime(640 * bright, t + Math.max(0.3, dur));
    const vca = ctx.createGain();
    const a = 0.035, rel = 0.5, off = t + Math.max(a, dur);
    vca.gain.value = 0;
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(vel * 0.5, t + a);
    vca.gain.linearRampToValueAtTime(vel * 0.36, off);
    vca.gain.linearRampToValueAtTime(0, off + rel);
    mix.connect(sat);
    sat.connect(lp);
    lp.connect(vca);
    vca.connect(s.in);
    for (const x of oscs) {
      x.start(t);
      x.stop(off + rel + 0.03);
    }
    freeWhenDone(oscs[0], ...oscs.slice(1), mix, sat, lp, vca);
  };
}

/** A bigger snare than the game's soft one: more crack, more body, a longer tail. */
export function makeSnare(ctx: BaseAudioContext, s: Strip, r: Rnd) {
  return (t: number, vel: number) => {
    for (const [type, freq, q, peak, d] of [['bandpass', 2300, 0.6, 0.5, 0.2], ['highpass', 4600, 0.6, 0.4, 0.16]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer('white');
      src.loop = true;
      const f = voiceFilter(ctx);
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      const end = struck(g.gain, t, 0.0015, vel * peak, d);
      src.connect(f);
      f.connect(g);
      g.connect(s.in);
      src.start(t, r() * 4);
      src.stop(end + 0.02);
      freeWhenDone(src, f, g);
    }
    const x = ctx.createOscillator();
    x.frequency.setValueAtTime(215, t);
    x.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    const g = ctx.createGain();
    const end = struck(g.gain, t, 0.002, vel * 0.4, 0.11);
    x.connect(g);
    g.connect(s.in);
    x.start(t);
    x.stop(end + 0.02);
    freeWhenDone(x, g);
  };
}
