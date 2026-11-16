/**
 * Shared effects for the instruments, made once per instrument (never per note): a stereo chorus / ensemble, a
 * rotary speaker, a tremolo. Each returns the node to feed and a `stop()` for its LFOs — call it when the track ends
 * (`k.onStop(fx.stop)` in a track's setup): a running oscillator keeps working even when nothing listens.
 */

export interface Fx {
  /** Connect voices here. */
  input: AudioNode;
  /** Stop the LFOs (the graph is torn down by the strip's owner). */
  stop(): void;
}

function lfo(ctx: BaseAudioContext, rate: number, depth: number, phase = 0): { osc: OscillatorNode; out: GainNode } {
  const osc = ctx.createOscillator();
  osc.frequency.value = rate;
  const out = ctx.createGain();
  out.gain.value = depth;
  osc.connect(out);
  // a phase offset: start the second LFO a fraction of a cycle later
  osc.start(ctx.currentTime + (phase / rate) * 0.999);
  return { osc, out };
}

/**
 * Stereo chorus / ensemble: the dry signal in the middle, two delay lines a few milliseconds long swept by slow LFOs
 * out of phase, one left and one right. `mix` = wet share; `rate` Hz; `depth` and `delay` in seconds.
 * The string machine's ensemble is this with three lines and a faster second LFO (`ensemble: true`).
 */
export function chorus(ctx: BaseAudioContext, dest: AudioNode, o: { mix?: number; rate?: number; depth?: number; delay?: number; ensemble?: boolean } = {}): Fx {
  const { mix = 0.5, rate = 0.45, depth = 0.0028, delay = 0.014, ensemble = false } = o;
  const input = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - mix * 0.5;
  input.connect(dry);
  dry.connect(dest);
  const oscs: OscillatorNode[] = [];
  const sides: [number, number][] = ensemble ? [[-1, 0], [1, 0.33], [0, 0.66]] : [[-1, 0], [1, 0.5]];
  for (const [side, phase] of sides) {
    const d = ctx.createDelay(0.1);
    d.delayTime.value = delay;
    const a = lfo(ctx, rate, depth, phase);
    a.out.connect(d.delayTime);
    oscs.push(a.osc);
    if (ensemble) {
      // the second, faster wobble that makes a string machine shimmer
      const b = lfo(ctx, rate * 9.5, depth * 0.18, phase);
      b.out.connect(d.delayTime);
      oscs.push(b.osc);
    }
    const g = ctx.createGain();
    g.gain.value = mix / (ensemble ? 1.4 : 1);
    input.connect(d);
    d.connect(g);
    if (ctx.createStereoPanner && side !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = side * 0.85;
      g.connect(p);
      p.connect(dest);
    } else g.connect(dest);
  }
  return { input, stop: () => oscs.forEach((x) => x.stop()) };
}

/**
 * A rotary speaker (the organ's Leslie): amplitude and pan swing and a little pitch wobble, `rate` Hz (0.8 slow
 * "chorale", 6.7 fast "tremolo"). `setRate(hz, t, seconds)` speeds it up or down the way the real one does.
 */
export function rotary(ctx: BaseAudioContext, dest: AudioNode, o: { rate?: number; depth?: number } = {}): Fx & { setRate(hz: number, t: number, seconds?: number): void } {
  const { rate = 0.8, depth = 1 } = o;
  const input = ctx.createGain();
  const d = ctx.createDelay(0.05);
  d.delayTime.value = 0.004;
  const am = ctx.createGain();
  am.gain.value = 1 - 0.18 * depth;
  input.connect(d);
  d.connect(am);
  const oscs: OscillatorNode[] = [];
  const pitch = lfo(ctx, rate, 0.0009 * depth);
  pitch.out.connect(d.delayTime);
  const amp = lfo(ctx, rate, 0.18 * depth, 0.25);
  amp.out.connect(am.gain);
  oscs.push(pitch.osc, amp.osc);
  let tail: AudioNode = am;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    const pl = lfo(ctx, rate, 0.55 * depth, 0.5);
    pl.out.connect(p.pan);
    oscs.push(pl.osc);
    am.connect(p);
    tail = p;
  }
  tail.connect(dest);
  return {
    input,
    stop: () => oscs.forEach((x) => x.stop()),
    setRate(hz, t, seconds = 1.2) {
      for (const x of oscs) {
        x.frequency.cancelScheduledValues(t);
        x.frequency.setValueAtTime(x.frequency.value, t);
        x.frequency.linearRampToValueAtTime(hz, t + seconds);
      }
    },
  };
}

/** Tremolo (the vibraphone's motor, a Rhodes' stereo trem): amplitude swing at `rate` Hz, optionally panned. */
export function tremolo(ctx: BaseAudioContext, dest: AudioNode, o: { rate?: number; depth?: number; stereo?: boolean } = {}): Fx {
  const { rate = 5.5, depth = 0.35, stereo = false } = o;
  const input = ctx.createGain();
  const am = ctx.createGain();
  am.gain.value = 1 - depth / 2;
  input.connect(am);
  const a = lfo(ctx, rate, depth / 2);
  a.out.connect(am.gain);
  const oscs = [a.osc];
  if (stereo && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    const b = lfo(ctx, rate, 0.6, 0.25);
    b.out.connect(p.pan);
    oscs.push(b.osc);
    am.connect(p);
    p.connect(dest);
  } else am.connect(dest);
  return { input, stop: () => oscs.forEach((x) => x.stop()) };
}
