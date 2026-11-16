/**
 * Physically modelled notes, rendered once in JavaScript and played back as buffers: plucked strings
 * (Karplus–Strong), membranes, cymbals, anything whose sound is cheaper to compute ahead than to build from nodes.
 *
 * A buffer is made the first time a (voice, note, variant) is asked for, at the context's sample rate, and kept: the
 * same AudioBuffer serves the live context and the offline renders of the same rate. Keep each voice's set small
 * (mono, a few seconds, a few variants) — every second of a 48 kHz mono buffer is 192 kB.
 */
import { freeWhenDone } from '../engine';
import { workerMade } from './offthread';

const cache = new Map<string, AudioBuffer>();
let bytes = 0;
/** Above this, the oldest buffers are dropped (they are made again if asked for). */
const LIMIT = 48 * 1024 * 1024;

/**
 * The buffer for `key` at this context's rate, made by `fill(data, sampleRate)` the first time (mono, `seconds` long).
 * `fill` writes the samples; it may return a shorter length to trim the tail.
 */
export function cachedBuffer(ctx: BaseAudioContext, key: string, seconds: number, fill: (data: Float32Array, sr: number) => number | void): AudioBuffer {
  const sr = ctx.sampleRate;
  const k = `${sr}|${key}`;
  const hit = cache.get(k);
  if (hit) {
    // most recently used goes to the end
    cache.delete(k);
    cache.set(k, hit);
    return hit;
  }
  let buf = workerMade(sr, key);
  if (!buf) {
    const t0 = performance.now();
    const data = fillSamples(seconds, sr, fill);
    // QA: `globalThis.__kpFills = []` collects every buffer made on this thread and how long it took
    (globalThis as { __kpFills?: [string, number][] }).__kpFills?.push([key, performance.now() - t0]);
    buf = ctx.createBuffer(1, data.length, sr);
    buf.copyToChannel(data, 0);
  }
  const len = buf.length;
  cache.set(k, buf);
  bytes += len * 4;
  while (bytes > LIMIT && cache.size > 1) {
    const [oldKey, old] = cache.entries().next().value as [string, AudioBuffer];
    cache.delete(oldKey);
    bytes -= old.length * 4;
  }
  return buf;
}

/** The samples `fill` writes into `seconds` at `sr`, trimmed to the length it returns: what `cachedBuffer` holds. */
export function fillSamples(seconds: number, sr: number, fill: (data: Float32Array, sr: number) => number | void): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.ceil(seconds * sr));
  const data = new Float32Array(n);
  const used = fill(data, sr);
  return typeof used === 'number' && used > 0 && used < n ? data.slice(0, used) : data;
}

export interface PlayOpts {
  /** Playback rate (pitch-shifts the buffer: 2 = an octave up). */
  rate?: number;
  gain?: number;
  pan?: number;
  /** A low-pass on the voice (Hz), for velocity: soft notes darker. */
  lp?: number;
  /** Stop after this many seconds with a short fade (a damped string, a choked cymbal). */
  dur?: number;
  /** The fade's length when `dur` cuts the note. */
  release?: number;
}

/** Play a buffer at `t` into `dest`, with gain, pan, an optional low-pass and an optional damped end. */
export function playBuffer(ctx: BaseAudioContext, buf: AudioBuffer, dest: AudioNode, t: number, o: PlayOpts = {}): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const rate = o.rate ?? 1;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  const peak = o.gain ?? 1;
  const natural = buf.duration / rate;
  const end = o.dur !== undefined ? Math.min(natural, o.dur + (o.release ?? 0.05)) : natural;
  g.gain.value = 0;
  g.gain.setValueAtTime(peak, t);
  if (o.dur !== undefined && o.dur < natural) {
    g.gain.setValueAtTime(peak, t + o.dur);
    g.gain.linearRampToValueAtTime(0, t + o.dur + (o.release ?? 0.05));
  }
  const nodes: AudioNode[] = [g];
  let tail: AudioNode = src;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    f.Q.value = 0.5;
    tail.connect(f);
    tail = f;
    nodes.push(f);
  }
  tail.connect(g);
  tail = g;
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    tail.connect(p);
    tail = p;
    nodes.push(p);
  }
  tail.connect(dest);
  src.start(t);
  src.stop(t + end + 0.02);
  freeWhenDone(src, ...nodes);
}

/** A small seeded generator for the models' noise (the same note sounds the same every time). */
export function noiseGen(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Peak-normalise a buffer's data to `to` (models differ wildly in raw level). */
export function normalise(data: Float32Array, to = 0.9, upTo = data.length): void {
  let peak = 0;
  for (let i = 0; i < upTo; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak <= 0) return;
  const k = to / peak;
  for (let i = 0; i < upTo; i++) data[i] *= k;
}

/** Fade the last `ms` milliseconds of the used part to zero (no click when the buffer ends). */
export function fadeTail(data: Float32Array, sr: number, ms = 8, upTo = data.length): void {
  const n = Math.min(upTo, Math.round((sr * ms) / 1000));
  for (let i = 0; i < n; i++) data[upTo - 1 - i] *= i / n;
}
