/**
 * The winds (score v3): melody voices that breathe. A flute, a pan flute, a chromatic harmonica, a human whistle,
 * the ondes Martenot and the 80s wind synth (Lyricon / EWI).
 *
 * Every factory is `makeX(ctx, strip, rnd, opts?)` → `(t, m, dur, vel, slur?) => void` (the `Wind` type): t in context
 * seconds, m a MIDI note (fractional allowed) or several at once (a chord on one breath: they share the level, 1/√n
 * each), dur the held length, vel 0..1 (it moves the timbre as well as the level), slur how the note joins the last.
 *
 * How notes connect is the music's call. `slur: true` joins the sounding note: the same breath, new fingers, so there
 * is no attack, only a quick change of pitch with a small dip and a puff of air (it may join a note that is still
 * dying away, too). `slur: false` tongues: a fresh attack, and a note still sounding is cut off (a wind player has one
 * mouth). Left out, a note slurs only if it starts before the last one has ended (or within 12 ms of it; the ondes
 * 20 ms): written legato (≥ 1, overlapping) slurs, anything detached tongues. The arranger's `sing()` (legato 0.94,
 * a few ms of human timing) therefore tongues, except where the timing happens to close a short note's gap: pass the
 * flag for deliberate phrasing.
 *
 * Several lines on one instrument (a tune doubled in thirds or octaves): notes starting within 30 ms of each other
 * are one chord, and each takes over the previous chord's voice nearest in pitch, without crossing (the lowest from
 * the lowest). The match is made again as each chord tone arrives, so a doubled line moves as written in whatever
 * order its notes are called. A voice nobody takes over sounds to its own end.
 *
 * The breath voices (flute, pan flute, harmonica, whistle, ondes) share one design:
 *
 *   pitch osc (a few partials) → pressure ─────────┐
 *   noise → band-pass that follows the pitch → air ┴(¼)→ waveshaper → DC cut (→ mouth formant) → level → mix → out
 *                                              └─(¾, untouched by the shaper)─┘
 *   vibrato LFO → pitch (cents) and pressure;  a slow random drift → pitch and the vibrato's rate
 *
 * The waveshaper is a polynomial, x + a₂x² + a₃x³ …, rising everywhere on its span (checked when it is made): blown
 * harder, the upper harmonics grow faster than the fundamental (for small x the k-th as the k-th power of the
 * pressure, Benade's rule for wind instruments). So loud notes are brighter, the harmonics come in after the
 * fundamental in an attack and leave before it in a release, and the vibrato, a pressure pulse as well as a pitch
 * one, shimmers in the upper partials. A quarter of the air goes through the shaper with the tone, so the breath is
 * heard inside the note; the rest stays air (through the shaper it would grind into a noise floor under the pitch).
 *
 * The Lyricon is subtractive, as the real one was: a saw and a pulse through a resonant 24 dB low-pass whose cutoff
 * rides the breath (loud = bright), a post-filter drive that growls when pushed, an ensemble chorus.
 *
 * A slur keeps one voice alive: its sources' stop time is moved on (AudioScheduledSourceNode.stop may be called
 * again) and every automated parameter is picked up where it is at that moment, mid-ramp included (see `Line`). If
 * the engine will not move a stop time, or the clock is too close, the note starts a fresh voice that slides on from
 * the last note's pitch without a tongued attack instead.
 */
import { voiceFilter } from '../engine';
import { mtof, type Rnd, type Strip } from '../synth';
import { cachedBuffer, noiseGen, normalise } from './buffers';
import { askWorker } from './offthread';
import { chorus } from './fx';
import type { Lab } from './lab';

/** A wind instrument's note: start, MIDI note (or a chord), held length, velocity, and slurred (true) or tongued (false). */
export type Wind = (t: number, m: number | number[], dur: number, vel: number, slur?: boolean) => void;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const cents = (c: number) => Math.pow(2, c / 1200);

// ── automation that a slur can pick up ──────────────────────────────────────────────────────────
/** One event of a Line: a jump to v1 at t1 (k 0), or a linear (1) / exponential (2) ramp from (t0, v0) to (t1, v1). */
interface Seg {
  k: 0 | 1 | 2;
  t0: number;
  v0: number;
  t1: number;
  v1: number;
}

interface LineSnap {
  v: number;
  t: number;
  segs: Seg[];
}

function issue(q: AudioParam, k: 0 | 1 | 2, v: number, t: number): void {
  if (k === 0) q.setValueAtTime(v, t);
  else if (k === 1) q.linearRampToValueAtTime(v, t);
  else q.exponentialRampToValueAtTime(v, t);
}

/**
 * One automated parameter of a voice (or several moved together, each scaled by its factor). It keeps its own events
 * since it was last joined, so a slur can pick it up at any moment: the value there is computed, a ramp in progress
 * is issued again to end at that value (the same curve, cut short: a linear or exponential ramp starts from the
 * event before it, whatever has played of it), and everything later goes. A join can be undone the same way (the
 * events from that moment on are issued again). Only set, linear and exponential events, which cut short exactly in
 * every engine: a glide is a chain of exponential ramps, never a value curve.
 */
class Line {
  /** The value and time of the latest event: where the next ramp starts. */
  v: number;
  t: number;
  private segs: Seg[];
  private readonly ps: [AudioParam, number][];
  constructor(p: AudioParam | [AudioParam, number][], v: number, t: number) {
    this.ps = Array.isArray(p) ? p : [[p, 1]];
    for (const [q, k] of this.ps) {
      q.value = v * k;
      q.setValueAtTime(v * k, t);
    }
    this.v = v;
    this.t = t;
    this.segs = [{ k: 0, t0: t, v0: v, t1: t, v1: v }];
  }

  private push(k: 0 | 1 | 2, v: number, t: number): void {
    for (const [q, c] of this.ps) issue(q, k, v * c, t);
    this.segs.push({ k, t0: this.t, v0: this.v, t1: t, v1: v });
    this.v = v;
    this.t = t;
  }

  set(v: number, t: number): void {
    this.push(0, v, Math.max(t, this.t));
  }

  /** A straight ramp to `v` at `t`; past `cap` (the note's end) it stops at `cap` with the value it has reached. */
  lin(v: number, t: number, cap = Infinity): void {
    t = Math.max(t, this.t + 1e-4);
    if (t > cap) {
      if (cap <= this.t + 1e-4) return;
      v = this.v + ((v - this.v) * (cap - this.t)) / (t - this.t);
      t = cap;
    }
    this.push(1, v, t);
  }

  /** An exponential ramp (pitch, cutoff): the same cap rule, in the log domain. From or to (near) zero it is linear. */
  exp(v: number, t: number, cap = Infinity): void {
    if (this.v <= 1e-6 || v <= 1e-6) return this.lin(v, t, cap);
    t = Math.max(t, this.t + 1e-4);
    if (t > cap) {
      if (cap <= this.t + 1e-4) return;
      v = this.v * Math.pow(v / this.v, (cap - this.t) / (t - this.t));
      t = cap;
    }
    this.push(2, v, t);
  }

  /**
   * A glide in pitch to `b` over `d` seconds from `t`: an S (eased in and out, the way a lip or a hand moves), with an
   * optional overshoot of `over` semitones that has settled by the end. A chain of exponential ramps (straight lines
   * in pitch), one per ~10 ms.
   */
  glide(b: number, t: number, d: number, over = 0, cap = Infinity): void {
    t = Math.max(t, this.t + 1e-4);
    if (t >= cap || this.v <= 1e-6) return;
    const la = Math.log2(this.v), lb = Math.log2(b);
    this.set(this.v, t);
    const n = clamp(Math.round(d / 0.01), 4, 12);
    for (let i = 1; i <= n; i++) {
      const x = i / n, at = t + d * x;
      this.exp(i === n ? b : Math.pow(2, la + (lb - la) * x * x * (3 - 2 * x) + (over * 6.75 * x * x * (1 - x)) / 12), at, cap);
      if (at >= cap) break;
    }
  }

  /** The release: from `t` an exponential fall to `frac` of the value over `d`, then (with `zero`) a line to 0. */
  release(t: number, d: number, frac = 1e-3, zero = true): void {
    const v = this.v;
    this.set(v, t);
    if (v > 1e-5) this.exp(v * frac, t + d);
    if (zero) this.lin(0, t + d + 0.008);
  }

  /** The last gate: hold to `t`, then a short line to zero. */
  close(t: number, d = 0.012): void {
    this.set(this.v, t);
    this.lin(0, t + d);
  }

  /** The value the parameter has at `x` (from the events since the last join). */
  at(x: number): number {
    let v = this.segs[0].v0;
    for (const s of this.segs) {
      if (s.t1 <= x) {
        v = s.v1;
        continue;
      }
      if (s.k && x > s.t0) {
        const u = (x - s.t0) / (s.t1 - s.t0);
        return s.k === 1 ? s.v0 + (s.v1 - s.v0) * u : s.v0 * Math.pow(s.v1 / s.v0, u);
      }
      break;
    }
    return v;
  }

  /** Pick the line up at `x`: the value it has there holds, and everything scheduled after `x` goes. */
  join(x: number): void {
    const v = this.at(x);
    let c: Seg | null = null;
    for (const s of this.segs) if (s.k && s.t0 < x && s.t1 >= x) c = s;
    for (const [q, k] of this.ps) {
      q.cancelScheduledValues(x);
      if (c) issue(q, c.k, v * k, x);
      q.setValueAtTime(v * k, x);
    }
    const hold: Seg = { k: 0, t0: x, v0: v, t1: x, v1: v };
    this.segs = c ? [{ ...c, t1: x, v1: v }, hold] : [hold];
    this.v = v;
    this.t = x;
  }

  snap(): LineSnap {
    return { v: this.v, t: this.t, segs: this.segs.slice() };
  }

  /** Nothing has been scheduled since `s` was taken. */
  same(s: LineSnap): boolean {
    return this.segs.length === s.segs.length && this.segs[this.segs.length - 1] === s.segs[s.segs.length - 1];
  }

  /** Undo what was done from `x` on (a join there and everything after it): the line is as it was at `s` again. */
  restore(s: LineSnap, x: number): void {
    for (const [q, k] of this.ps) {
      q.cancelScheduledValues(x);
      for (const g of s.segs) if (g.t1 >= x) issue(q, g.k, g.v1 * k, g.t1);
    }
    this.v = s.v;
    this.t = s.t;
    this.segs = s.segs;
  }
}

// ── voices and the line they play: slur, tongue, cut off, share ─────────────────────────────────
interface Voice {
  /** The sounding note: its start, its end (its release starts there), its pitch (Hz, MIDI); when the sources stop. */
  at: number;
  off: number;
  f: number;
  m: number;
  end: number;
  srcs: AudioScheduledSourceNode[];
  /** Every articulation line (a slur picks them all up). */
  lines: Line[];
  /** The voice's share of the level, on its last gain: 1/√n in a chord, 0 once cut off. */
  mix: Line;
  /** When it was cut off (by a tongued note, or as a voice made and then not needed); Infinity while it plays. */
  cut: number;
  dead?: boolean;
}

interface VoiceSnap {
  lines: LineSnap[];
  at: number;
  off: number;
  f: number;
  m: number;
  end: number;
}

/** Start the voice's sources ([node, start time, buffer offset]), stop them at `end`, free it all when done. */
function begin(v: Voice, srcs: [AudioScheduledSourceNode, number, number][], nodes: AudioNode[], end: number): void {
  for (const [s, at, off] of srcs) {
    if (off > 0) (s as AudioBufferSourceNode).start(at, off);
    else s.start(at);
    s.stop(end);
  }
  v.srcs = srcs.map(([s]) => s);
  v.end = end;
  const first = v.srcs[0];
  first.onended = () => {
    first.onended = null;
    for (const s of v.srcs) s.disconnect();
    for (const n of nodes) n.disconnect();
  };
}

/** Keep the voice's sources running to `end`; false if this engine will not move a stop time. */
function extend(v: Voice, end: number): boolean {
  try {
    for (const s of v.srcs) s.stop(end);
  } catch {
    return false;
  }
  v.end = end;
  return true;
}

/**
 * Notes that start within this of each other are a chord (an arranger doubling the line on one instrument): they
 * sound side by side, each carrying on one voice of the chord before.
 */
const CHORD = 0.03;
/** When the music does not say, a note slurs if it starts at most this long after the last one ended. */
const SLUR_GAP = 0.012;

/** A note as the instrument prepared it: the request, its pitch with its own detune, and the times it lives by. */
interface Req {
  t: number;
  m: number;
  dur: number;
  vel: number;
  f: number;
  /** Its end (the release starts there), the last moment its own events may take, when its sources may stop. */
  off: number;
  cap: number;
  end: number;
  slur?: boolean;
  /** The note before it on its line (MIDI; 0 for none). */
  prev: number;
}

/** What an instrument does; the line (`Lead`) decides which of it happens. */
interface Part<V extends Voice, N extends Req> {
  /** See SLUR_GAP. */
  gap: number;
  /** A new voice for `n`, its sources starting at n.t at pitch `f0` and stopping at n.end, every level at 0. */
  make(n: N, f0: number): V;
  /** The slur's own events, once the voice's lines have been picked up at n.t (v.m and v.f are still the last note's). */
  slur(v: V, n: N): void;
  /** A fresh voice's attack: tongued, or (from > 0, a slur the engine refused) untongued, sliding on from `from` Hz. */
  tongue(v: V, n: N, from: number): void;
  /** What every note does after either: the vibrato, a long note's swell, the release at n.off. */
  tail(v: V, n: N): void;
}

type Done<V> = { slur: true; v: V; snap: VoiceSnap } | { slur: false; v: V; stole: V | null };
interface Slot<V, N> {
  n: N;
  to: V | null;
  done: Done<V> | null;
  /** A fresh voice made for this note before a re-pairing (kept for reuse), and any made and then not needed. */
  own: V | null;
  dead: V[];
}

/**
 * Order-preserving pairs of sorted pitches `a` (the new chord) and `b` (the voices of the last one): as many pairs as
 * the smaller side has, never crossing, the least total distance (octaves). Each `a` gets its `b` index or -1.
 */
function pairUp(a: number[], b: number[]): number[] {
  const n = a.length, m = b.length;
  const out: number[] = new Array(n).fill(-1);
  if (!n || !m) return out;
  if (n > m) {
    pairUp(b, a).forEach((i, j) => {
      if (i >= 0) out[i] = j;
    });
    return out;
  }
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  for (let j = 0; j <= m; j++) dp[0][j] = 0;
  for (let i = 1; i <= n; i++)
    for (let j = i; j <= m; j++) dp[i][j] = Math.min(dp[i][j - 1], dp[i - 1][j - 1] + Math.abs(Math.log2(a[i - 1] / b[j - 1])));
  for (let i = n, j = m; i > 0; ) {
    if (j > i && dp[i][j] === dp[i][j - 1]) j--;
    else {
      out[i - 1] = j - 1;
      i--;
      j--;
    }
  }
  return out;
}

const mark = (v: Voice, n: Req) => {
  v.at = n.t;
  v.off = n.off;
  v.f = n.f;
  v.m = n.m;
};

/**
 * The line an instrument plays: which voice each note goes to, slurred or tongued, who is cut off, how a chord
 * shares the level. Notes must come in time order (a chord's in any order).
 */
class Lead<V extends Voice, N extends Req> {
  private prev: V[] = [];
  private prevF: number[] = [];
  private cur: Slot<V, N>[] = [];
  private g0 = -Infinity;
  /** The mix lines touched by this chord, as they were before it. */
  private readonly touched = new Map<V, LineSnap>();
  private lastM = 0;
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly part: Part<V, N>,
  ) {}

  play(ns: N[]): void {
    const t = ns[0].t;
    if (t < this.g0 - 1e-3) {
      // out of time order: voices of their own, outside the line
      for (const n of ns) {
        n.prev = this.lastM;
        const v = this.part.make(n, n.f);
        this.part.tongue(v, n, 0);
        this.part.tail(v, n);
        mark(v, n);
      }
      return;
    }
    if (t > this.g0 + CHORD) {
      this.prev = this.cur.map((s) => s.done!.v).filter((v) => v.cut === Infinity);
      this.prevF = this.prev.map((v) => v.f);
      this.cur = [];
      this.g0 = t;
      this.touched.clear();
    }
    for (const n of ns) this.cur.push({ n, to: null, done: null, own: null, dead: [] });
    this.assign();
    this.mixdown();
    this.lastM = ns[ns.length - 1].m;
  }

  /** Match the chord so far with the last chord's voices; notes whose voice changed are undone and done again. */
  private assign(): void {
    const order = this.prev.map((_, i) => i).sort((a, b) => this.prevF[a] - this.prevF[b]);
    const notes = [...this.cur].sort((a, b) => a.n.f - b.n.f);
    const pick = pairUp(notes.map((s) => s.n.f), order.map((i) => this.prevF[i]));
    const want = new Map<Slot<V, N>, V | null>();
    notes.forEach((s, i) => want.set(s, pick[i] >= 0 ? this.prev[order[pick[i]]] : null));
    const redo = this.cur.filter((s) => s.done && s.to !== want.get(s));
    for (let i = redo.length - 1; i >= 0; i--) this.undo(redo[i]);
    for (const s of this.cur)
      if (!s.done) {
        s.to = want.get(s) ?? null;
        this.do(s);
      }
  }

  private slurs(v: V, n: N): boolean {
    if (v.cut < Infinity || n.slur === false || n.t >= v.end - 0.006 || n.t < v.at + 0.01) return false;
    return n.slur === true || n.t <= v.off + this.part.gap;
  }

  private do(s: Slot<V, N>): void {
    const { n } = s, v = s.to;
    n.prev = v ? v.m : this.lastM;
    const slur = !!v && this.slurs(v, n);
    if (v && slur && this.ctx.currentTime < n.t - 0.004) {
      const snap: VoiceSnap = { lines: v.lines.map((l) => l.snap()), at: v.at, off: v.off, f: v.f, m: v.m, end: v.end };
      if (extend(v, n.end)) {
        for (const l of v.lines) l.join(n.t);
        this.part.slur(v, n);
        this.part.tail(v, n);
        mark(v, n);
        if (s.own) {
          this.kill(s.own);
          s.dead.push(s.own);
          s.own = null;
        }
        s.done = { slur: true, v, snap };
        return;
      }
    }
    let own = s.own;
    if (!own) {
      const from = v && slur ? v.f : 0;
      own = this.part.make(n, from || n.f);
      this.part.tongue(own, n, from);
      this.part.tail(own, n);
      mark(own, n);
    }
    s.own = null;
    // one mouth: a note still sounding on this line is cut off
    const stole = v && v.cut === Infinity && n.t < v.off ? v : null;
    if (stole) {
      stole.cut = n.t;
      try {
        for (const x of stole.srcs) x.stop(n.t + 0.04);
      } catch {
        // it stops at its own time instead
      }
    }
    s.done = { slur: false, v: own, stole };
  }

  private undo(s: Slot<V, N>): void {
    const d = s.done!;
    if (d.slur) {
      const { v, snap } = d;
      v.lines.forEach((l, i) => l.restore(snap.lines[i], s.n.t));
      v.at = snap.at;
      v.off = snap.off;
      v.f = snap.f;
      v.m = snap.m;
      extend(v, snap.end);
    } else {
      if (d.stole) {
        d.stole.cut = Infinity;
        extend(d.stole, d.stole.end);
      }
      s.own = d.v;
    }
    s.done = null;
  }

  /** A voice made for a note that has since gone to another voice: silent from its first moment, gone at once. */
  private kill(v: V): void {
    v.cut = v.at;
    v.dead = true;
    try {
      for (const x of v.srcs) x.stop(v.at + 0.004);
    } catch {
      // it stops at its own time, silent
    }
  }

  /** Every voice this chord touched gets its share again: 1/√n for the chord's, 0 for those cut off, as before for the rest. */
  private mixdown(): void {
    const g = Math.max(this.g0, this.ctx.currentTime + 0.003);
    const on = this.cur.map((s) => s.done!.v);
    const k = 1 / Math.sqrt(on.length);
    for (const s of this.cur) {
      const d = s.done!;
      for (const v of [d.v, ...(!d.slur && d.stole ? [d.stole] : []), ...s.dead]) if (!this.touched.has(v)) this.touched.set(v, v.mix.snap());
    }
    for (const [v, sn] of this.touched) {
      if (!v.mix.same(sn)) v.mix.restore(sn, g);
      if (on.includes(v)) {
        if (Math.abs(v.mix.at(g) - k) > 1e-4) {
          v.mix.join(g);
          v.mix.lin(k, g + 0.01);
        }
      } else if (v.dead) {
        const c = Math.max(v.at, g);
        v.mix.join(c);
        v.mix.set(0, c);
      } else if (v.cut < Infinity) {
        // the tongue stops the old note: a quick fade, the sources stop soon after
        const c = Math.max(v.cut, g);
        v.mix.join(c);
        v.mix.lin(0, c + 0.02);
      }
    }
  }
}

/** The instrument's output: one gain (and a panner if asked) into the strip, torn down with it. */
function outFor(ctx: BaseAudioContext, s: Strip, p = 0): GainNode {
  const g = ctx.createGain();
  if (p && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = clamp(p, -1, 1);
    g.connect(pn);
    pn.connect(s.in);
    s.nodes.push(g, pn);
  } else {
    g.connect(s.in);
    s.nodes.push(g);
  }
  return g;
}

// ── shared tables and buffers ───────────────────────────────────────────────────────────────────
/** The base wave's samples (sine-phase partials, signed), scaled to a peak of exactly 1. */
function waveSamples(amps: number[], n = 2048): Float32Array {
  const w = new Float32Array(n);
  let pk = 0;
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    let y = 0;
    for (let k = 0; k < amps.length; k++) y += amps[k] * Math.sin((k + 1) * th);
    w[i] = y;
    pk = Math.max(pk, Math.abs(y));
  }
  for (let i = 0; i < n; i++) w[i] /= pk;
  return w;
}

const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
/**
 * A PeriodicWave from partial amplitudes, pre-scaled to a peak of 1 so it comes out the same whether or not the
 * engine normalises it (the shaper's tables assume exactly that peak).
 */
function partialWave(ctx: BaseAudioContext, key: string, amps: number[], real = false): PeriodicWave {
  let m = waves.get(ctx);
  if (!m) waves.set(ctx, (m = new Map()));
  let w = m.get(key);
  if (!w) {
    let pk = 0;
    for (let i = 0; i < 2048; i++) {
      const th = (2 * Math.PI * i) / 2048;
      let y = 0;
      for (let k = 0; k < amps.length; k++) y += amps[k] * (real ? Math.cos((k + 1) * th) : Math.sin((k + 1) * th));
      pk = Math.max(pk, Math.abs(y));
    }
    const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    for (let k = 0; k < amps.length; k++) (real ? re : im)[k + 1] = amps[k] / pk;
    w = ctx.createPeriodicWave(re, im);
    m.set(key, w);
  }
  return w;
}

/** The shaper's input headroom: the curve spans ±HEAD of design pressure, so vibrato and air never clip it. */
const HEAD = 1.3;

interface Shaped {
  key: string;
  wave: number[];
  curve: Float32Array<ArrayBuffer>;
  /** RMS of the shaper's output (DC removed) for a design pressure: notes are levelled by it. */
  rms(a: number): number;
  /** The curve's gain for a small signal (the air) at rest, per unit of the shaper's input. */
  slope: number;
}

const shapedCache = new Map<string, Shaped>();
/**
 * The polynomial's curve and its loudness table, made once per wave. The curve must rise everywhere on its span (a
 * fold turns a loud note's troughs back on themselves: a buzz and DC): every kind here does, and should one not, its
 * slope is held at 5% of the curve's (it is integrated from max(P′, 0.05)) instead.
 */
function shaped(key: string, wave: number[], poly: number[]): Shaped {
  const hit = shapedCache.get(key);
  if (hit) return hit;
  const P = (x: number) => {
    let y = 0, p = 1;
    for (const a of poly) y += a * (p *= x);
    return y;
  };
  const dP = (x: number) => {
    let y = 0, p = 1;
    for (let i = 0; i < poly.length; i++) {
      y += (i + 1) * poly[i] * p;
      p *= x;
    }
    return y;
  };
  const norm = P(1);
  let lo = Infinity;
  for (let x = -HEAD; x <= HEAD; x += 0.002) lo = Math.min(lo, dP(x) / norm);
  let fn = (x: number) => P(x) / norm;
  if (lo < 0.05) {
    const N = 2600, h = HEAD / N, up = [0], dn = [0];
    const g = (x: number) => Math.max(dP(x) / norm, 0.05);
    for (let i = 1; i <= N; i++) {
      up.push(up[i - 1] + ((g((i - 1) * h) + g(i * h)) * h) / 2);
      dn.push(dn[i - 1] - ((g(-(i - 1) * h) + g(-i * h)) * h) / 2);
    }
    const one = up[Math.round(1 / h)];
    fn = (x) => {
      const u = Math.min(N, Math.abs(x) / h), i = Math.min(N - 1, Math.floor(u)), tab = x >= 0 ? up : dn;
      return lerp(tab[i], tab[i + 1], u - i) / one;
    };
  }
  const n = 4096;
  const curve = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) curve[i] = fn(((i / n) * 2 - 1) * HEAD);
  const w = waveSamples(wave, 512);
  const tab: number[] = [];
  for (let j = 0; j <= 52; j++) {
    const a = j / 40;
    let s = 0, s2 = 0;
    for (const x of w) {
      const y = fn(a * x);
      s += y;
      s2 += y * y;
    }
    const mean = s / w.length;
    tab.push(Math.sqrt(Math.max(1e-10, s2 / w.length - mean * mean)));
  }
  const rms = (a: number) => {
    const x = clamp(a, 0.01, 1.29) * 40, j = Math.floor(x);
    return lerp(tab[j], tab[j + 1], x - j);
  };
  const out = { key, wave, curve, rms, slope: (HEAD * dP(0)) / norm };
  shapedCache.set(key, out);
  return out;
}

/** Make the breath voices' air, drift and growl in the worker at `sr` while the game loads (audioWorker.ts). */
export function prewarmWinds(sr: number): void {
  for (const key of ['winds:air', 'winds:drift2', 'winds:growl']) askWorker(sr, key);
}

/**
 * Two seconds of mono noise (the air), looped from a different place by every voice. Rolled off above ~6 kHz (two
 * one-pole low-passes, run round the loop twice so it joins without a seam): a band-pass alone has gentle skirts,
 * and breath that reaches 18 kHz is hiss, not air.
 */
export function airBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cachedBuffer(ctx, 'winds:air', 2, (d, sr) => {
    const g = noiseGen(7717), n = d.length;
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = g();
    const a = Math.exp((-2 * Math.PI * 6000) / sr);
    let y1 = 0, y2 = 0;
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++) {
        y1 = a * y1 + (1 - a) * w[i];
        y2 = a * y2 + (1 - a) * y1;
        if (pass) d[i] = y2;
      }
    normalise(d, 1);
  });
}

/**
 * The drift buffer's peak. It moves the vibrato's rate directly (±0.35 Hz, about ±6%) and the pitch through a gain
 * of cents / DRIFT.
 */
const DRIFT = 0.35;
/**
 * A slow wander, as a player's pitch and vibrato never hold still: a second of a few low sines with whole cycles
 * (so it loops without a seam), played slowly (0.25× = a four-second cycle of 0.25–2.3 Hz movements).
 */
export function driftBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cachedBuffer(ctx, 'winds:drift2', 1, (d) => {
    const g = noiseGen(4421), n = d.length;
    const parts = Array.from({ length: 9 }, (_, k) => ({ k: k + 1, ph: (g() + 1) * Math.PI, a: 1 / Math.sqrt(k + 1) }));
    for (let i = 0; i < n; i++) {
      let y = 0;
      for (const p of parts) y += p.a * Math.sin((2 * Math.PI * p.k * i) / n + p.ph);
      d[i] = y;
    }
    normalise(d, DRIFT);
  });
}

/** The growl: a rough 18–44 Hz flutter (whole cycles in a second, so it loops), for a loud wind-synth note. */
export function growlBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cachedBuffer(ctx, 'winds:growl', 1, (d) => {
    const g = noiseGen(9091), n = d.length;
    const parts = Array.from({ length: 14 }, (_, k) => ({ k: 18 + k * 2, ph: (g() + 1) * Math.PI, a: 0.6 + 0.4 * Math.abs(g()) }));
    for (let i = 0; i < n; i++) {
      let y = 0;
      for (const p of parts) y += p.a * Math.sin((2 * Math.PI * p.k * i) / n + p.ph);
      d[i] = y;
    }
    normalise(d, 1);
  });
}

// ── the breath voice (flute, pan flute, harmonica, whistle, ondes) ──────────────────────────────
interface BreathSpec {
  key: string;
  /** The shaper's polynomial (x, x², x³ …). */
  poly: number[];
  /** The DC cut after the shaper (Hz). */
  hp: number;
  /** The air's band-pass Q, or 0 for no air at all (the ondes). */
  noiseQ: number;
  /** Vibrato rate range (Hz) and the slow pitch wander (cents). */
  rate: [number, number];
  drift: number;
  /** A fixed resonance after the shaper (centre Hz, gain dB, Q): the harmonica's mouth. */
  formant?: [number, number, number];
}

interface BreathVoice extends Voice {
  /** pitch, pressure, level, vibrato depth (cents), vibrato's pressure depth, air band and its Q, air level */
  L: { f: Line; p: Line; lvl: Line; vib: Line; vibA: Line; nf: Line; q: Line; air: Line };
}

/** The air's share that goes through the shaper with the tone; the rest goes round it, the same in level. */
const AIR_IN = 0.25;

function breathVoice(ctx: BaseAudioContext, spec: BreathSpec, sh: Shaped, out: AudioNode, r: Rnd, t: number, end: number, f0: number): BreathVoice {
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(partialWave(ctx, sh.key, sh.wave));
  const press = ctx.createGain();
  const ws = ctx.createWaveShaper();
  ws.curve = sh.curve;
  ws.oversample = 'none';
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = spec.hp;
  // (a low- or high-pass biquad's Q is a resonance in dB: −3 is flat, no bump)
  hp.Q.value = -3;
  const lvl = ctx.createGain(), chk = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = lerp(spec.rate[0], spec.rate[1], r());
  const vibP = ctx.createGain(), vibA = ctx.createGain();
  const dr = ctx.createBufferSource();
  dr.buffer = driftBuffer(ctx);
  dr.loop = true;
  dr.playbackRate.value = 0.21 + r() * 0.08;
  const drP = ctx.createGain();
  drP.gain.value = spec.drift / DRIFT;
  osc.connect(press);
  press.connect(ws);
  ws.connect(hp);
  let body: AudioNode = hp;
  if (spec.formant) {
    const fm = ctx.createBiquadFilter();
    fm.type = 'peaking';
    [fm.frequency.value, fm.gain.value, fm.Q.value] = spec.formant;
    hp.connect(fm);
    body = fm;
  }
  body.connect(lvl);
  lvl.connect(chk);
  chk.connect(out);
  lfo.connect(vibP);
  vibP.connect(osc.detune);
  lfo.connect(vibA);
  vibA.connect(press.gain);
  dr.connect(drP);
  drP.connect(osc.detune);
  // the same wander moves the vibrato's rate a little (the buffer is scaled for it)
  dr.connect(lfo.frequency);
  const nodes: AudioNode[] = [press, ws, hp, lvl, chk, vibP, vibA, drP];
  if (body !== hp) nodes.push(body);
  // the pitch oscillator starts a moment early, at a random point of its cycle (silent: the pressure is 0 until t), so
  // no two notes start on the same waveform
  const srcs: [AudioScheduledSourceNode, number, number][] = [[osc, t - r() / f0, 0], [lfo, t, 0], [dr, t, 0.01 + r() * 0.9]];
  let nf = new Line([], 1000, t), q = new Line([], 1, t), air = new Line([], 0, t);
  if (spec.noiseQ > 0) {
    const ns = ctx.createBufferSource();
    ns.buffer = airBuffer(ctx);
    ns.loop = true;
    const bp = voiceFilter(ctx);
    bp.type = 'bandpass';
    bp.Q.automationRate = 'k-rate';
    const ng = ctx.createGain(), round = ctx.createGain();
    // a quarter into the shaper (the tone modulates it), three quarters round it at the shaper's own small-signal gain
    round.gain.value = ((1 - AIR_IN) / AIR_IN) * sh.slope;
    ns.connect(bp);
    bp.connect(ng);
    ng.connect(ws);
    ng.connect(round);
    round.connect(hp);
    nodes.push(bp, ng, round);
    srcs.push([ns, t, 0.01 + r() * 1.7]);
    nf = new Line(bp.frequency, 1000, t);
    q = new Line(bp.Q, spec.noiseQ, t);
    air = new Line([[ng.gain, AIR_IN]], 0, t);
  }
  const L = {
    f: new Line(osc.frequency, f0, t),
    p: new Line(press.gain, 0, t),
    lvl: new Line(lvl.gain, 0, t),
    vib: new Line(vibP.gain, 0, t),
    vibA: new Line(vibA.gain, 0, t),
    nf,
    q,
    air,
  };
  const v: BreathVoice = { at: t, off: t, f: f0, m: 0, end, srcs: [], lines: Object.values(L), mix: new Line(chk.gain, 1, t), cut: Infinity, L };
  begin(v, srcs, nodes, end);
  return v;
}

/** A breath note: what the instrument worked out for it (design pressure, level, air band, air, its shaper table). */
interface BreathNote extends Req {
  A: number;
  lvl: number;
  band: number;
  airS: number;
  sh: Shaped;
  /** The attack time the swell waits for (ondes). */
  ta: number;
}

const breathNote = (t: number, m: number, dur: number, vel: number, f: number, rel: number, slur: boolean | undefined, sh: Shaped): BreathNote => ({
  t, m, dur, vel, f, off: t + dur, cap: t + dur - 0.001, end: t + dur + rel + 0.05, slur, prev: 0, A: 0, lvl: 0, band: 1000, airS: 0, sh, ta: 0,
});

/** Play a chord (or one note): every note prepared, then the line places them. */
const chordOf = <N extends Req>(lead: { play(ns: N[]): void }, prep: (m: number) => N, m: number | number[]) =>
  lead.play((Array.isArray(m) ? m : [m]).map(prep));

/** What a woodwind (flute, pan flute, harmonica) does with its breath: the numbers that make one a flute and one a reed. */
interface Woodwind {
  spec: BreathSpec;
  /**
   * The oscillator's partials at a few dynamics (soft → loud), and where between them a note sits (0 … waves − 1, by
   * pressure and register): the partials are interpolated, in quarter steps.
   */
  waves: number[][];
  pick?(A: number, m: number): number;
  /** Design pressure for a note: velocity and register (low notes are blown richer). */
  press(m: number, vel: number): number;
  /** Loudness for a note before levelling. */
  loud(m: number, vel: number): number;
  /** Air: level, band centre (× pitch) and clamp. */
  air(m: number, vel: number): number;
  band: number;
  bandLo: number;
  bandHi: number;
  /**
   * The chiff: its strength, and its kind. chiffQ 0: a wide puff high up (from chiffUp × the pitch) falling onto the
   * note. chiffQ > 0: a narrow one at the octave that opens into the breath (a flue pipe's jet finding its note).
   */
  chiff: number;
  chiffUp: number;
  chiffQ: number;
  /** Attack time at soft and loud, the flat start (cents), the pressure dip of a slur, its air puff. */
  attack: [number, number];
  flat: number;
  dip: number;
  puff: number;
  /** Vibrato: pitch depth (cents) at the bottom and top of the range, pressure depth, delay, bloom. */
  vib: [number, number];
  vibAmp: number;
  vibDelay: number;
  vibBloom: number;
  rel: number;
  airRel: number;
  /** A slur's change of pitch (seconds): a flute's keys are near-instant, a pan flute's move from pipe to pipe bends. */
  glide: number;
}

function makeWoodwind(ctx: BaseAudioContext, s: Strip, r: Rnd, w: Woodwind, o: WoodwindOpts): Wind {
  const { breath = 1, vibrato = 1, glide = w.glide, chiff = 1, bright = 1 } = o;
  const shFor = (x: number): Shaped => {
    const q = Math.round(clamp(x, 0, w.waves.length - 1) * 4) / 4, i = Math.min(w.waves.length - 2, Math.floor(q)), k = q - Math.max(0, i);
    const a = w.waves[Math.max(0, i)], b = w.waves[Math.min(w.waves.length - 1, i + 1)];
    const amps = Array.from({ length: Math.max(a.length, b.length) }, (_, j) => lerp(a[j] ?? 0, b[j] ?? 0, w.waves.length > 1 ? k : 0));
    return shaped(`${w.spec.key}:${q}`, amps, w.spec.poly);
  };
  const out = outFor(ctx, s, o.pan);
  // the attack's bloom, a long note's lean and the vibrato's pressure pulse all ride on A: keep their sum inside the
  // shaper's curve (past its end the tone would clip)
  const top = (HEAD * 0.85) / (1.08 * (1 + w.vibAmp * vibrato));
  const lead = new Lead<BreathVoice, BreathNote>(ctx, {
    gap: SLUR_GAP,
    make: (n, f0) => breathVoice(ctx, w.spec, n.sh, out, r, n.t, n.end, f0),
    slur: (v, n) => {
      // the same breath, new fingers: the pitch changes at once (a key's travel), the pressure stumbles for a moment
      // and a little air escapes. That dip and puff are what a slur sounds like, not a slide
      const L = v.L, { t, cap } = n;
      L.f.exp(n.f, t + clamp(glide * (0.8 + 0.4 * r()), 0.003, n.dur * 0.4), cap);
      L.p.lin(L.p.v * w.dip, t + 0.012, cap);
      L.p.lin(n.A / HEAD, t + 0.055, cap);
      L.lvl.lin(n.lvl, t + 0.04, cap);
      L.nf.exp(n.band, t + 0.03, cap);
      L.q.exp(w.spec.noiseQ, t + 0.03, cap);
      L.air.lin(Math.max(L.air.v, n.airS) * w.puff, t + 0.01, cap);
      L.air.exp(n.airS, t + 0.07, cap);
      L.vib.lin(L.vib.v * 0.5, t + 0.07, cap);
      L.vibA.lin(L.vibA.v * 0.5, t + 0.07, cap);
    },
    tongue: (v, n, from) => {
      const L = v.L, { t, cap, m, vel } = n;
      if (from) {
        // a slur this engine would not join: no tongue, the pitch moves on from the last note, the breath is up at once
        L.f.exp(n.f, t + clamp(glide, 0.003, n.dur * 0.4), cap);
        L.p.lin(n.A / HEAD, t + 0.015, cap);
        L.lvl.lin(n.lvl, t + 0.003, cap);
        L.nf.set(n.band, t);
        L.air.lin(n.airS, t + 0.015, cap);
        return;
      }
      // tongued: the pressure comes up in `ta` and blooms a little past it; the pitch starts a shade flat and settles
      // as the jet steadies
      const ta = clamp(lerp(w.attack[0], w.attack[1], vel) * (m < 67 ? 1.2 : 1) * (0.88 + 0.24 * r()), 0.012, n.dur * 0.6);
      L.f.set(n.f * cents(-w.flat * lerp(1.2, 0.6, vel) - 5 * r()), t);
      L.f.exp(n.f, t + 0.055, cap);
      L.p.lin((n.A * 1.08) / HEAD, t + ta, cap);
      L.p.lin(n.A / HEAD, t + ta + 0.1, cap);
      L.lvl.lin(n.lvl, t + 0.003, cap);
      const ck = Math.min(3, chiff * w.chiff * lerp(0.7, 1.4, vel) * clamp(1.3 - 0.014 * (m - 60), 0.6, 1.3) * (0.75 + 0.5 * r()));
      const hi = clamp(n.f * w.chiffUp, 2200, 9500);
      if (w.chiffQ) {
        // the chiff: the tongue's "t" (a wide puff high up), then the jet speaking at the octave for a moment (narrow),
        // then it opens into the breath
        const c0 = clamp(n.f * 2, 800, 6000);
        L.nf.set(hi, t);
        L.q.set(0.8, t);
        L.nf.set(c0, t + 0.01);
        L.q.set(w.chiffQ, t + 0.01);
        L.nf.set(c0, t + 0.034);
        L.q.set(w.chiffQ, t + 0.034);
        L.nf.exp(n.band, t + 0.064, cap);
        L.q.exp(w.spec.noiseQ, t + 0.068, cap);
      } else {
        // a puff of air high up, falling onto the pitch as the tone takes over
        L.nf.set(hi, t);
        L.nf.exp(n.band, t + 0.05, cap);
      }
      L.air.lin(n.airS * ck, t + 0.004, cap);
      L.air.exp(n.airS, t + 0.065, cap);
    },
    tail: (v, n) => {
      const L = v.L, { t, cap, off, A, m, vel } = n;
      // a long note leans in a little
      if (n.dur > 0.7) L.p.lin((A * (1.03 + 0.05 * vel)) / HEAD, cap - 0.01, cap);
      // the vibrato arrives after a moment and blooms
      const depth = vibrato * lerp(w.vib[0], w.vib[1], clamp((m - 60) / 36, 0, 1)) * (0.85 + 0.3 * r());
      L.vib.lin(depth * 0.15, t + w.vibDelay, cap);
      L.vib.lin(depth, t + w.vibDelay + w.vibBloom, cap);
      L.vibA.lin(((A * w.vibAmp * 0.15) / HEAD) * vibrato, t + w.vibDelay, cap);
      L.vibA.lin(((A * w.vibAmp) / HEAD) * vibrato, t + w.vibDelay + w.vibBloom, cap);
      // the release: the pressure falls (the harmonics first, by the shaper's law), the air trails, the gate closes
      L.p.release(off, w.rel);
      L.vibA.release(off, w.rel);
      L.air.release(off, w.rel * w.airRel);
      L.lvl.close(off + w.rel * w.airRel + 0.004);
    },
  });
  return (t, m, dur, vel, slur) => {
    vel = clamp(vel, 0.04, 1);
    dur = Math.max(0.05, dur);
    chordOf(lead, (mm) => {
      const f = mtof(mm) * cents((r() - 0.5) * 6);
      const A = clamp(w.press(mm, vel) * bright, 0.06, top);
      const n = breathNote(t, mm, dur, vel, f, w.rel * w.airRel, slur, shFor(w.pick ? w.pick(A, mm) : 0));
      n.A = A;
      n.lvl = w.loud(mm, vel) / n.sh.rms(A);
      n.band = clamp(f * w.band, w.bandLo, w.bandHi);
      n.airS = breath * w.air(mm, vel) * (0.85 + 0.3 * r());
      return n;
    }, m);
  };
}

export interface WoodwindOpts {
  /** Air in the tone (1 = natural, 0 = none, 2 = very breathy). */
  breath?: number;
  /** Vibrato depth (1 = natural). */
  vibrato?: number;
  /** How long a slurred note takes to reach its pitch (seconds; a deliberate slide is 0.05–0.15). */
  glide?: number;
  /** The chiff of a tongued attack (1 = natural). */
  chiff?: number;
  /** Pressure scale: above 1 the tone gets richer at every dynamic, below 1 purer. */
  bright?: number;
  pan?: number;
}

const FLUTE: Woodwind = {
  spec: { key: 'flute', poly: [1, 0.55, 0.3, 0.12, 0.05], hp: 110, noiseQ: 1.6, rate: [4.8, 5.6], drift: 2.2 },
  // pp, mf, f, ff (the low octave only): a real flute's harmonics come within 5–12 dB of the fundamental when blown
  // hard, and low down at ff the octave can outweigh it; its top octave stays near mf, its clearest
  waves: [[1, 0.1, 0.03], [1, 0.3, 0.12, 0.05], [1, 0.45, 0.22, 0.1, 0.045], [1, 0.7, 0.45, 0.25, 0.12]],
  pick: (A, m) => Math.min((A - 0.25) / 0.25, m >= 84 ? 1 : m >= 72 ? 2 : 3),
  press: (m, vel) => (0.14 + 0.72 * vel ** 1.1) * clamp(1.25 - 0.02 * (m - 60), 0.45, 1.25),
  loud: (m, vel) => 0.165 * (0.2 + 0.8 * vel ** 1.4) * clamp(1.08 - 0.004 * (m - 60), 0.9, 1.08),
  // breathier low down, purer at the top (as a real flute: its third octave is its clearest)
  air: (m, vel) => (0.1 + 0.08 * vel) * clamp(1.3 - 0.02 * (m - 60), 0.45, 1.3),
  band: 2.4,
  bandLo: 900,
  bandHi: 5200,
  chiff: 2.4,
  chiffUp: 6,
  chiffQ: 5,
  attack: [0.085, 0.03],
  flat: 12,
  dip: 0.86,
  puff: 1.7,
  vib: [13, 9],
  vibAmp: 0.09,
  vibDelay: 0.22,
  vibBloom: 0.45,
  rel: 0.11,
  airRel: 1.2,
  glide: 0.005,
};

/**
 * The flute: a near-sine that gets richer the harder it is blown (its partials chosen per note by dynamic and
 * register, then grown by the shaper inside the note), breath in the tone, a chiff on every tongued note that speaks
 * at the octave first, a vibrato that arrives after a fifth of a second. Slurred notes are one breath, the pitch
 * changing at once. Range C4–C7 (m 60–96), sweetest m 67–91; strip gain ~0.5–0.8 for a lead; velocity 0.3–0.95.
 */
export function makeFlute(ctx: BaseAudioContext, s: Strip, r: Rnd, o: WoodwindOpts = {}): Wind {
  return makeWoodwind(ctx, s, r, FLUTE, o);
}

const PAN_FLUTE: Woodwind = {
  // a stopped pipe: odd harmonics, a hollow tone, a lot of air. The odd partials are in the phases the shaper's odd
  // terms add (sin³ gives −sin 3θ, sin⁵ +sin 5θ, sin⁷ −sin 7θ), so harder blowing makes it hollower, as a stopped pipe does
  spec: { key: 'panflute', poly: [1, 0.14, 0.62, 0.04, 0.22], hp: 140, noiseQ: 1.2, rate: [4.6, 5.3], drift: 3 },
  waves: [[1, 0.025, -0.17, 0.01, 0.05, 0.004, -0.015]],
  press: (m, vel) => (0.18 + 0.7 * vel) * clamp(1.2 - 0.014 * (m - 60), 0.6, 1.2),
  loud: (m, vel) => 0.18 * (0.2 + 0.8 * vel ** 1.3) * clamp(1.08 - 0.005 * (m - 60), 0.84, 1.08),
  air: (m, vel) => (0.2 + 0.14 * vel) * clamp(1.25 - 0.016 * (m - 60), 0.6, 1.25),
  band: 2.2,
  bandLo: 800,
  bandHi: 5600,
  chiff: 2.2,
  chiffUp: 5,
  chiffQ: 0,
  attack: [0.07, 0.022],
  flat: 22,
  dip: 0.66,
  puff: 2.4,
  vib: [10, 8],
  vibAmp: 0.13,
  vibDelay: 0.32,
  vibBloom: 0.5,
  rel: 0.14,
  airRel: 1.7,
  glide: 0.012,
};

/**
 * The pan flute: stopped pipes (odd harmonics, hollow, hollower when blown hard), a lot of air, a breathy attack that
 * rises into the note, a slow amplitude-led vibrato, air that trails after the tone. A slur is a breath carried to the
 * next pipe, with a deeper dip and a little bend. Range m 62–98, best m 67–93; strip gain ~0.5–0.8; velocity 0.3–0.95.
 */
export function makePanFlute(ctx: BaseAudioContext, s: Strip, r: Rnd, o: WoodwindOpts = {}): Wind {
  return makeWoodwind(ctx, s, r, PAN_FLUTE, o);
}

const HARMONICA: Woodwind = {
  // free reeds: a buzzy pulse-like spectrum, every harmonic (mostly from the wave, so the shaper stays near symmetric
  // and the sustain is as loud as its peaks suggest), shaped by the player's mouth (a nasal formant)
  spec: { key: 'harmonica', poly: [1, 0.4, 0.7, 0.2, 0.17], hp: 160, noiseQ: 1.4, rate: [5.6, 6.4], drift: 2.5, formant: [1150, 4, 1.1] },
  waves: [[1, 0.5, 0.3, 0.18, 0.1, 0.06, 0.035, 0.02]],
  press: (m, vel) => (0.1 + 0.85 * vel) * clamp(1.12 - 0.009 * (m - 60), 0.75, 1.15),
  loud: (m, vel) => 0.12 * (0.25 + 0.75 * vel ** 1.3) * clamp(1.08 - 0.006 * (m - 60), 0.82, 1.1),
  air: (m, vel) => (0.035 + 0.03 * vel) * clamp(1.2 - 0.01 * (m - 60), 0.7, 1.2),
  band: 3,
  bandLo: 1500,
  bandHi: 6000,
  chiff: 1.6,
  chiffUp: 4,
  chiffQ: 0,
  attack: [0.045, 0.014],
  flat: 18,
  dip: 0.78,
  puff: 1.3,
  vib: [9, 7],
  vibAmp: 0.24,
  vibDelay: 0.24,
  vibBloom: 0.32,
  rel: 0.07,
  airRel: 1.1,
  glide: 0.006,
};

/**
 * A chromatic harmonica (the soul and bossa lead: Stevie Wonder, Toots Thielemans): free reeds, buzzy and warm, a
 * nasal mouth formant, a reed that speaks a shade flat and quickly, a throat vibrato that pulses the level more than
 * the pitch, louder = brighter and reedier. Slurs change hole at once. A chord (m as an array) is a diatonic harp's
 * breath across several holes. Range m 60–96, best m 64–88; strip gain ~0.5–0.8; velocity 0.35–0.95.
 */
export function makeHarmonica(ctx: BaseAudioContext, s: Strip, r: Rnd, o: WoodwindOpts = {}): Wind {
  return makeWoodwind(ctx, s, r, HARMONICA, o);
}

// ── the whistle ─────────────────────────────────────────────────────────────────────────────────
const WHISTLE: BreathSpec = { key: 'whistle', poly: [1, 0.22, 0.05], hp: 260, noiseQ: 1.6, rate: [6.2, 7.2], drift: 3.5 };
const WHISTLE_WAVE = [1, 0.02, 0.006];

export interface WhistleOpts {
  /** Air around the tone (1 = natural). */
  breath?: number;
  /** Vibrato depth (1 = natural: a quick, lively one). */
  vibrato?: number;
  /** How far a fresh note now and then scoops up into its pitch (1 = natural, up to about half a semitone). */
  scoop?: number;
  pan?: number;
}

/**
 * A human whistle: an almost pure tone, airy when soft and clean (with a little edge) when loud, now and then a
 * scoop up into a note after a leap (never on a repeat, never on a short note), quick slides between slurred notes, a
 * lively vibrato on held notes, a little fall at the end of a long one. The garage's lead: bright and cheeky. Range
 * m 72–100 (a real whistle's), best m 76–96; strip gain ~0.5–0.7; velocity 0.35–0.95.
 */
export function makeWhistle(ctx: BaseAudioContext, s: Strip, r: Rnd, o: WhistleOpts = {}): Wind {
  const { breath = 1, vibrato = 1, scoop = 1 } = o;
  const sh = shaped(WHISTLE.key, WHISTLE_WAVE, WHISTLE.poly);
  const out = outFor(ctx, s, o.pan);
  const REL = 0.075, AIR = 1.4;
  const lead = new Lead<BreathVoice, BreathNote>(ctx, {
    gap: SLUR_GAP,
    make: (n, f0) => breathVoice(ctx, WHISTLE, sh, out, r, n.t, n.end, f0),
    slur: (v, n) => {
      // a quick slide to the next note: an S in pitch (a hair past the target on a leap), the lips tightening for a moment
      const L = v.L, { t, cap } = n, step = n.m - v.m;
      const d = clamp(0.012 + 0.004 * Math.abs(step), 0.01, Math.min(0.05, n.dur * 0.3));
      L.f.glide(n.f, t, d, step >= 3 ? 0.1 : step <= -3 ? -0.06 : 0, cap);
      L.p.lin(L.p.v * 0.8, t + 0.016, cap);
      L.p.lin(n.A / HEAD, t + 0.055, cap);
      L.lvl.lin(n.lvl, t + 0.03, cap);
      L.nf.exp(n.band, t + 0.03, cap);
      L.air.lin(Math.max(L.air.v, n.airS) * 1.4, t + 0.012, cap);
      L.air.exp(n.airS, t + 0.06, cap);
      L.vib.lin(L.vib.v * 0.4, t + 0.05, cap);
      L.vibA.lin(L.vibA.v * 0.4, t + 0.05, cap);
    },
    tongue: (v, n, from) => {
      const L = v.L, { t, cap } = n;
      if (from) {
        L.f.glide(n.f, t, clamp(0.012 + 0.004 * Math.abs(n.m - n.prev), 0.01, Math.min(0.05, n.dur * 0.3)), 0, cap);
        L.p.lin(n.A / HEAD, t + 0.015, cap);
        L.lvl.lin(n.lvl, t + 0.003, cap);
        L.nf.set(n.band, t);
        L.air.lin(n.airS, t + 0.015, cap);
        return;
      }
      // now and then a scoop up from below, more after a leap, never on a repeated note nor on a short one (half of
      // a short note would be out of tune), overshooting a hair and settling
      const leap = n.prev ? Math.abs(n.m - n.prev) : 4;
      const sc = r() < 0.4 || n.m === n.prev ? 0 : scoop * (0.3 + 0.5 * r()) * (0.6 + 0.5 * n.vel) * clamp((n.dur - 0.1) / 0.35, 0, 1) * clamp(0.35 + leap / 8, 0.35, 1);
      if (sc > 0.03) {
        L.f.set(n.f * Math.pow(2, -sc / 12), t);
        L.f.glide(n.f, t + 0.006, clamp(0.03 + 0.03 * r(), 0.02, Math.min(0.06, n.dur * 0.25)), 0.04 + 0.05 * r(), cap);
      }
      // the air comes a moment before the tone
      L.p.lin((n.A * 1.06) / HEAD, t + 0.035, cap);
      L.p.lin(n.A / HEAD, t + 0.09, cap);
      L.lvl.lin(n.lvl, t + 0.003, cap);
      L.nf.set(n.band * 1.6, t);
      L.nf.exp(n.band, t + 0.05, cap);
      L.air.lin(n.airS * 2.2, t + 0.008, cap);
      L.air.exp(n.airS, t + 0.06, cap);
    },
    tail: (v, n) => {
      const L = v.L, { t, cap, off, A } = n;
      const depth = vibrato * 15 * (0.85 + 0.3 * r());
      L.vib.lin(depth * 0.2, t + 0.18, cap);
      L.vib.lin(depth, t + 0.45, cap);
      L.vibA.lin(((A * 0.02) / HEAD) * vibrato, t + 0.18, cap);
      L.vibA.lin(((A * 0.11) / HEAD) * vibrato, t + 0.45, cap);
      // the end of a long note: the pitch falls away a little as the lips let go
      if (n.dur >= 0.35) L.f.release(off, REL, cents(-15 - 20 * r()), false);
      L.p.release(off, REL);
      L.vibA.release(off, REL);
      L.air.release(off, REL * AIR);
      L.lvl.close(off + REL * AIR + 0.004);
    },
  });
  return (t, m, dur, vel, slur) => {
    vel = clamp(vel, 0.04, 1);
    dur = Math.max(0.05, dur);
    chordOf(lead, (mm) => {
      // a whistle drifts sharp when blown hard
      const f = mtof(mm) * cents((r() - 0.5) * 9 + 6 * vel);
      const A = clamp((0.35 + 0.75 * vel) * clamp(1.12 - 0.01 * (mm - 76), 0.75, 1.2), 0.06, 1.05);
      const n = breathNote(t, mm, dur, vel, f, REL * AIR, slur, sh);
      n.A = A;
      n.lvl = (0.23 * (0.25 + 0.75 * vel ** 1.3) * clamp(1.1 - 0.008 * (mm - 76), 0.85, 1.15)) / sh.rms(A);
      n.band = clamp(f * 1.3, 1200, 7000);
      // airy when soft, clean when loud
      n.airS = breath * (0.3 - 0.12 * vel) * (0.8 + 0.4 * r());
      return n;
    }, m);
  };
}

// ── the ondes Martenot ──────────────────────────────────────────────────────────────────────────
const ONDES: BreathSpec = { key: 'ondes', poly: [1, 0.42, 0.15, 0.05], hp: 55, noiseQ: 0, rate: [5.9, 6.6], drift: 3 };
const ONDES_WAVE = [1, 0.06, 0.02];

export interface OndesOpts {
  /** Glide time scale for slurred notes (1 = natural: quick for a step, longer for a leap; 2 = a deliberate swoop). */
  glide?: number;
  /** Vibrato depth (1 = a singer's, about a sixth of a tone). */
  vibrato?: number;
  /** Warmth: the second harmonic's share (1 = natural, up to 1.3). */
  warm?: number;
  /**
   * The palme diffuser: a lyre of twelve sympathetic strings (one per pitch class) that ring along with the notes and
   * shimmer as a glide sweeps across them. 0 = the plain loudspeaker (the default: nothing is built); 0.4 = a halo for
   * a featured lead (in the middle register a held note changes by ±2 dB and rings on at −18 to −24 dB 0.3 s after
   * it ends; above m72 much less, as its partials meet the strings' upper modes); 1 = strong. It costs 39 nodes that
   * run for the strip's whole life.
   */
  palme?: number;
  pan?: number;
}

/** The ring-and-string resonance of the palme diffuser: twelve tuned combs, C3–B3, damped like strings. */
function palme(ctx: BaseAudioContext, from: AudioNode, to: AudioNode, amount: number, keep: AudioNode[]): void {
  const send = ctx.createGain();
  send.gain.value = 0.12 * amount;
  const ret = ctx.createGain();
  ret.gain.value = 1;
  from.connect(send);
  const sr = ctx.sampleRate;
  // the strings' damping: a low-pass with no peak at all (its Q is in dB, and anything above unity gain in a
  // feedback loop rings up without end). −8 dB stays below unity in every engine's formula
  const damp = 3400, qDb = -8;
  for (let k = 0; k < 12; k++) {
    const f = mtof(48 + k);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = damp;
    lp.Q.value = qDb;
    // the loop's period is the delay plus the damping filter's own delay at the string's pitch: take that off
    const d = ctx.createDelay(0.05);
    d.delayTime.value = 1 / f - lowpassDelay(f, damp, Math.pow(10, qDb / 20), sr);
    const fb = ctx.createGain();
    // every string rings for about 1.4 s (a comb loses its feedback once a pass, and a high string passes more often,
    // so its feedback is higher); its modes are ~1.6 Hz wide, and a note's vibrato sweeps through them
    fb.gain.value = Math.pow(10, (-3 * (1 / f)) / 1.4);
    send.connect(d);
    d.connect(lp);
    lp.connect(fb);
    fb.connect(d);
    lp.connect(ret);
    keep.push(d, lp, fb);
  }
  ret.connect(to);
  keep.push(send, ret);
}

/** The phase delay (seconds) of an RBJ low-pass biquad at `f`. */
function lowpassDelay(f: number, f0: number, q: number, sr: number): number {
  const w0 = (2 * Math.PI * f0) / sr, al = Math.sin(w0) / (2 * q), c = Math.cos(w0);
  const b = [(1 - c) / 2, 1 - c, (1 - c) / 2], a = [1 + al, -2 * c, 1 - al];
  const w = (2 * Math.PI * f) / sr;
  const re = (k: number[]) => k[0] + k[1] * Math.cos(w) + k[2] * Math.cos(2 * w);
  const im = (k: number[]) => -k[1] * Math.sin(w) - k[2] * Math.sin(2 * w);
  const ph = Math.atan2(im(b), re(b)) - Math.atan2(im(a), re(a));
  return -ph / w / sr;
}

/**
 * The ondes Martenot (or a theremin's cousin): a round, singing tone with a little second harmonic that opens up
 * when played harder, no attack transient (the intensity key swells every note in, quickly when firm), glides between
 * slurred notes that are quick for a step and longer for a leap (an S in pitch, the hand moving the ring), a singer's
 * vibrato, optionally the palme diffuser's sympathetic strings. The Act V wonder: luminous, not mournful. Range
 * m 48–96, best m 60–88; strip gain ~0.5–0.8; velocity 0.3–0.95 (a soft note swells in a little slower).
 */
export function makeOndes(ctx: BaseAudioContext, s: Strip, r: Rnd, o: OndesOpts = {}): Wind {
  const { glide = 1, vibrato = 1, warm = 1, palme: pal = 0 } = o;
  const sh = shaped(ONDES.key, ONDES_WAVE, ONDES.poly);
  const out = outFor(ctx, s, o.pan);
  if (pal > 0) palme(ctx, out, s.in, pal, s.nodes);
  const REL = 0.3;
  const lead = new Lead<BreathVoice, BreathNote>(ctx, {
    gap: 0.02,
    make: (n, f0) => breathVoice(ctx, ONDES, sh, out, r, n.t, n.end, f0),
    slur: (v, n) => {
      // the ring slides, eased in and out; the vibrato steadies while it moves
      const L = v.L, { t, cap } = n;
      const d = clamp((0.04 + 0.009 * Math.abs(n.m - v.m)) * glide, 0.03, Math.min(0.18 * glide, n.dur * 0.5));
      L.f.glide(n.f, t, d, 0, cap);
      L.lvl.lin(n.lvl, t + 0.05, cap);
      L.vib.lin(L.vib.v * 0.35, t + Math.min(0.05, d), cap);
      L.vibA.lin(L.vibA.v * 0.35, t + Math.min(0.05, d), cap);
      n.ta = Math.max(0.05, d * 0.8);
      L.p.lin((n.A * 0.85) / HEAD, t + n.ta, cap);
    },
    tongue: (v, n, from) => {
      const L = v.L, { t, cap, vel } = n;
      if (from) L.f.glide(n.f, t, clamp(0.04 + 0.009 * Math.abs(n.m - n.prev), 0.03, Math.min(0.18, n.dur * 0.5)), 0, cap);
      else {
        L.f.set(n.f * cents(-6), t);
        L.f.exp(n.f, t + 0.08, cap);
      }
      // the intensity key: no transient, a swell, quicker for a firmer note
      n.ta = from ? 0.03 : clamp(lerp(0.12, 0.03, vel), 0.03, n.dur * 0.5);
      L.p.lin((n.A * 0.8) / HEAD, t + n.ta, cap);
      L.lvl.lin(n.lvl, t + 0.004, cap);
    },
    tail: (v, n) => {
      const L = v.L, { t, cap, off, A, dur } = n;
      // the swell of a held note: up to its fullest a little before the middle, easing off towards the end
      L.p.lin(A / HEAD, t + clamp(dur * 0.42, n.ta + 0.04, 1.8), cap);
      if (dur > 0.8) L.p.lin((A * 0.92) / HEAD, cap - 0.01, cap);
      const depth = vibrato * 16 * (0.85 + 0.3 * r());
      L.vib.lin(depth * 0.15, t + 0.18, cap);
      L.vib.lin(depth, t + 0.55, cap);
      L.vibA.lin(((A * 0.01) / HEAD) * vibrato, t + 0.18, cap);
      L.vibA.lin(((A * 0.05) / HEAD) * vibrato, t + 0.55, cap);
      L.p.release(off, REL);
      L.vibA.release(off, REL);
      L.lvl.close(off + REL + 0.004);
    },
  });
  return (t, m, dur, vel, slur) => {
    vel = clamp(vel, 0.04, 1);
    dur = Math.max(0.06, dur);
    chordOf(lead, (mm) => {
      const f = mtof(mm) * cents((r() - 0.5) * 4);
      const n = breathNote(t, mm, dur, vel, f, REL, slur, sh);
      n.A = clamp((0.2 + 0.8 * vel) * warm * clamp(1.15 - 0.008 * (mm - 60), 0.75, 1.3), 0.06, 1.15);
      n.lvl = (0.255 * (0.22 + 0.78 * vel ** 1.3) * clamp(1.06 - 0.005 * (mm - 60), 0.85, 1.12)) / sh.rms(n.A);
      return n;
    }, m);
  };
}

// ── the Lyricon / EWI ───────────────────────────────────────────────────────────────────────────
interface LyrVoice extends Voice {
  /** pitch (both oscillators), cutoff (both filters), level, vibrato depth, drive, growl depth */
  L: { f: Line; fc: Line; lvl: Line; vib: Line; drv: Line; growl: Line };
}

interface LyrNote extends Req {
  /** Breath, and the level per unit of it (the saw is louder low down, where more of it gets through the filter). */
  B: number;
  k: number;
}

let lyrCurve: Float32Array<ArrayBuffer> | null = null;
/** The post-filter drive: a symmetric soft clip, clean when soft and gritty when pushed. */
function lyriconCurve(): Float32Array<ArrayBuffer> {
  if (lyrCurve) return lyrCurve;
  const n = 2048;
  const c = new Float32Array(n + 1);
  const top = Math.tanh(1.7);
  for (let i = 0; i <= n; i++) c[i] = Math.tanh(1.7 * ((i / n) * 2 - 1)) / top;
  return (lyrCurve = c);
}

/** A band-limited pulse of the given duty (cosine series), for the PeriodicWave. */
function pulseAmps(duty: number, n = 96): number[] {
  return Array.from({ length: n }, (_, i) => (2 / ((i + 1) * Math.PI)) * Math.sin((i + 1) * Math.PI * duty));
}

/** A saw with a sine under it: the fundamental sings through however bright the filter is (sine series). */
function sawSineAmps(sine: number, n = 96): number[] {
  return Array.from({ length: n }, (_, i) => (2 / ((i + 1) * Math.PI)) * (i % 2 ? -1 : 1) + (i === 0 ? sine : 0));
}

export interface LyriconOpts {
  /** Portamento of a slurred note (seconds). Left out: by the interval, 6 ms + 2.5 ms a semitone, at most 40 ms. */
  glide?: number;
  vibrato?: number;
  /** How far the breath opens the filter (1 = natural). */
  bright?: number;
  /** The filter's resonance: its second stage's peak in dB (3.5 = natural, 0 = none). */
  reso?: number;
  /** Growl on loud notes (1 = natural, 0 = none). */
  growl?: number;
  /** The post-filter drive (1 = natural: clean when soft, gritty when loud; 0.3 = clean). */
  drive?: number;
  /** Ensemble chorus mix (0 = none). Needs `onStop`: its LFOs run until the track ends. */
  chorus?: number;
  pan?: number;
  onStop?: (fn: () => void) => void;
}

/**
 * The 80s wind-synth lead (Lyricon / EWI, the jazz-fusion and city-pop sound): a saw and a narrow pulse, slightly
 * detuned and free-running, through a resonant 24 dB low-pass that opens with the breath (following the key, topping
 * out near 7 kHz), so a note swells in brightness as it swells in level; a small lip bend into tongued notes, a quick
 * portamento on slurs (longer for a leap), a vibrato that arrives late, a growl when pushed, an ensemble chorus.
 * Range m 52–98, best m 62–90; strip gain ~0.4–0.7; velocity 0.35–1 (above ~0.7 it bites).
 */
export function makeLyricon(ctx: BaseAudioContext, s: Strip, r: Rnd, o: LyriconOpts = {}): Wind {
  const { glide, vibrato = 1, bright = 1, reso = 3.5, growl = 1, drive = 1 } = o;
  const base = outFor(ctx, s, o.pan);
  let out: AudioNode = base;
  if ((o.chorus ?? 0.32) > 0 && o.onStop) {
    const fx = chorus(ctx, base, { mix: o.chorus ?? 0.32, rate: 0.55, depth: 0.0021, delay: 0.011 });
    o.onStop(fx.stop);
    out = fx.input;
  }
  // the voices' DC cut, one for them all: the drive's clip is symmetric but what it is fed (a pulse and a saw with a
  // sine under it) is not, so its output carries a little DC that follows the breath, the swells and the growl (a
  // thump at every attack, a rumble under a loud note). The range starts at 165 Hz: the fundamental is untouched
  const dc = ctx.createBiquadFilter();
  dc.type = 'highpass';
  dc.frequency.value = 90;
  dc.Q.value = -3;
  dc.connect(out);
  s.nodes.push(dc);
  const curve = lyriconCurve();
  const pw = partialWave(ctx, 'lyr-pulse', pulseAmps(0.3), true);
  const sw = partialWave(ctx, 'lyr-saw', sawSineAmps(0.45));
  const REL = 0.075;
  const fc = (n: LyrNote, b: number) => clamp(250 + n.f * (0.8 + 5 * bright * Math.pow(b, 1.8)), 160, 7000);
  const lv = (n: LyrNote, b: number) => n.k * b;
  const lead = new Lead<LyrVoice, LyrNote>(ctx, {
    gap: SLUR_GAP,
    make: (n, f0) => {
      const t = n.t;
      const saw = ctx.createOscillator();
      saw.setPeriodicWave(sw);
      saw.detune.value = -1.5 - r() * 1.5;
      const pul = ctx.createOscillator();
      pul.setPeriodicWave(pw);
      pul.detune.value = 1.5 + r() * 1.5;
      const pg = ctx.createGain();
      pg.gain.value = 0.5;
      const lp1 = voiceFilter(ctx), lp2 = voiceFilter(ctx);
      lp1.type = lp2.type = 'lowpass';
      // Q in dB here: a gentle first stage, a resonant second (the 24 dB lead filter)
      lp1.Q.value = -2;
      lp2.Q.value = reso;
      const drv = ctx.createGain();
      const ws = ctx.createWaveShaper();
      ws.curve = curve;
      ws.oversample = '2x';
      // the output stage: a gentle low-pass after the drive, so the grit it adds never turns to fizz
      const top = ctx.createBiquadFilter();
      top.type = 'lowpass';
      top.frequency.value = 6000;
      top.Q.value = -3;
      const lvl = ctx.createGain(), chk = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.6 + r() * 0.8;
      const vibP = ctx.createGain();
      const dr = ctx.createBufferSource();
      dr.buffer = driftBuffer(ctx);
      dr.loop = true;
      dr.playbackRate.value = 0.24 + r() * 0.1;
      const drP = ctx.createGain();
      drP.gain.value = 2.5 / DRIFT;
      const gr = ctx.createBufferSource();
      gr.buffer = growlBuffer(ctx);
      gr.loop = true;
      gr.playbackRate.value = 0.9 + r() * 0.25;
      const grG = ctx.createGain();
      saw.connect(lp1);
      pul.connect(pg);
      pg.connect(lp1);
      lp1.connect(lp2);
      lp2.connect(drv);
      drv.connect(ws);
      ws.connect(top);
      top.connect(lvl);
      lvl.connect(chk);
      chk.connect(dc);
      lfo.connect(vibP);
      vibP.connect(saw.detune);
      vibP.connect(pul.detune);
      dr.connect(drP);
      drP.connect(saw.detune);
      drP.connect(pul.detune);
      gr.connect(grG);
      grG.connect(drv.gain);
      const L = {
        f: new Line([[saw.frequency, 1], [pul.frequency, 1]], f0, t),
        fc: new Line([[lp1.frequency, 1.45], [lp2.frequency, 1]], 200, t),
        lvl: new Line(lvl.gain, 0, t),
        vib: new Line(vibP.gain, 0, t),
        drv: new Line(drv.gain, 0.3, t),
        growl: new Line(grG.gain, 0, t),
      };
      const v: LyrVoice = { at: t, off: t, f: f0, m: 0, end: n.end, srcs: [], lines: Object.values(L), mix: new Line(chk.gain, 1, t), cut: Infinity, L };
      // the oscillators run free, as analogue ones do: they start a moment early at a random point (silent until the
      // level opens), so no two notes start on the same waveform. Together, though: started apart, the two would meet
      // in or out of phase at random and one note in a run would come out 2 dB louder than the next
      const ph = t - r() / f0;
      begin(
        v,
        [[saw, ph, 0], [pul, ph, 0], [lfo, t, 0], [dr, t, 0.01 + r() * 0.9], [gr, t, 0.01 + r() * 0.9]],
        [pg, lp1, lp2, drv, ws, top, lvl, chk, vibP, drP, grG],
        n.end,
      );
      return v;
    },
    slur: (v, n) => {
      // a slur: a quick portamento (longer for a leap), the breath held (a slight dip as the fingers change)
      const L = v.L, { t, cap } = n;
      const d = glide !== undefined ? clamp(glide * (0.9 + 0.2 * r()), 0.003, n.dur * 0.5) : clamp(0.006 + 0.0025 * Math.abs(n.m - v.m), 0.006, Math.min(0.04, n.dur * 0.4));
      L.f.exp(n.f, t + d, cap);
      L.lvl.lin(L.lvl.v * 0.95, t + 0.012, cap);
      L.lvl.lin(lv(n, n.B), t + 0.05, cap);
      L.fc.exp(L.fc.v * 0.92, t + 0.012, cap);
      L.fc.exp(fc(n, n.B), t + 0.05, cap);
      L.vib.lin(L.vib.v * 0.5, t + 0.06, cap);
    },
    tongue: (v, n, from) => {
      const L = v.L, { t, cap, vel } = n;
      if (from) {
        L.f.exp(n.f, t + clamp(0.006 + 0.0025 * Math.abs(n.m - n.prev), 0.006, 0.04), cap);
        L.lvl.lin(lv(n, n.B), t + 0.012, cap);
        L.fc.exp(fc(n, n.B), t + 0.012, cap);
        return;
      }
      // tongued: the lip bends up into the note (a little more when attacked hard), the breath spikes and settles
      L.f.set(n.f * cents(-(4 + 18 * vel * r())), t);
      L.f.exp(n.f, t + 0.04, cap);
      const ta = clamp(lerp(0.05, 0.012, vel) * (0.85 + 0.3 * r()), 0.008, n.dur * 0.5);
      L.lvl.lin(lv(n, n.B * 1.1), t + ta, cap);
      L.lvl.lin(lv(n, n.B), t + ta + 0.07, cap);
      L.fc.exp(fc(n, n.B * 1.15), t + ta, cap);
      L.fc.exp(fc(n, n.B), t + ta + 0.07, cap);
    },
    tail: (v, n) => {
      const L = v.L, { t, cap, off, vel, dur } = n;
      // the drive: clean when soft, gritty when loud; the growl flutters only in the loudest notes
      L.drv.lin(drive * (0.22 + 0.55 * vel ** 3), t + 0.02, cap);
      L.growl.lin(growl * 0.32 * Math.max(0, (vel - 0.62) / 0.38) ** 1.5, t + 0.05, cap);
      // a held note swells: brighter and louder towards its last third, easing off at the very end
      if (dur > 0.32) {
        const b = n.B * (1.08 + 0.12 * vel + 0.06 * r());
        L.lvl.lin(lv(n, b), t + dur * 0.72, cap);
        L.fc.exp(fc(n, b), t + dur * 0.72, cap);
        L.lvl.lin(lv(n, b * 0.95), cap - 0.004, cap);
        L.fc.exp(fc(n, b * 0.95), cap - 0.004, cap);
      }
      const depth = vibrato * 12 * (0.85 + 0.3 * r());
      L.vib.lin(depth * 0.12, t + 0.2, cap);
      L.vib.lin(depth, t + 0.52, cap);
      // the release: breath off, so the filter closes with the level
      L.lvl.release(off, REL);
      L.fc.release(off, REL, 0.25, false);
    },
  });
  return (t, m, dur, vel, slur) => {
    vel = clamp(vel, 0.04, 1);
    dur = Math.max(0.04, dur);
    chordOf(lead, (mm): LyrNote => {
      const f = mtof(mm) * cents((r() - 0.5) * 5);
      return {
        t, m: mm, dur, vel, f, off: t + dur, cap: t + dur - 0.001, end: t + dur + REL + 0.05, slur, prev: 0,
        B: clamp(0.25 + 0.7 * vel, 0.1, 1),
        k: 0.3 * clamp(1.06 - 0.005 * (mm - 60), 0.9, 1.15),
      };
    }, m);
  };
}

// ── demos (dev only: tools/audio/render.mjs fn /src/audio/voices/winds.ts demoX) ───────────────
/**
 * [beat, MIDI (or a chord), length in beats, velocity, slurred into from the note before]. A note that the next one
 * slurs from is held right up to it; the others are shortened by `gate` (detached: tongued).
 */
type Ev = [number, number | number[], number, number, boolean?];
function play(lab: Lab, fn: Wind, bpm: number, at: number, evs: Ev[], gate = 0.85): number {
  const b = 60 / bpm;
  let endBeat = 0;
  evs.forEach(([beat, m, len, vel, slur], i) => {
    const next = evs[i + 1];
    const held = next && next[4] && next[0] > beat ? (next[0] - beat) * b + 0.004 : len * b * gate;
    fn(lab.t0 + at + beat * b, m, held, vel, slur ?? false);
    endBeat = Math.max(endBeat, beat + len);
  });
  return at + endBeat * b;
}
/** A run of notes, one every `step` beats, all the same length, slurred after the first (or each `slur(i)` says). */
const run = (from: number, notes: number[], step: number, vel: number | ((i: number) => number), slur: boolean | ((i: number) => boolean) = true): Ev[] =>
  notes.map((m, i) => [from + i * step, m, step, typeof vel === 'number' ? vel : vel(i), i > 0 && (typeof slur === 'boolean' ? slur : slur(i))]);

/**
 * The flute: a bossa phrase in G (132 bpm), lightly tongued with pairs slurred, soft in the low register, then loud
 * to the top; a slurred scale run, crisp tongued repeats and a long held note whose vibrato blooms.
 */
export function demoFlute(lab: Lab): void {
  const fl = makeFlute(lab.ctx, lab.strip('flute', { gain: 1, rev: 0.28, del: 0.08 }), lab.r);
  const bpm = 132;
  let t = play(lab, fl, bpm, 0, [
    [0, 74, 1.5, 0.72], [1.5, 71, 0.5, 0.62, true], [2, 69, 1, 0.66], [3, 67, 0.5, 0.6], [3.5, 71, 1.5, 0.74, true],
    [5, 69, 0.5, 0.6], [5.5, 67, 0.5, 0.58, true], [6, 64, 1.5, 0.66], [7.5, 66, 0.5, 0.62],
    [8, 67, 1, 0.7], [9, 71, 0.5, 0.68], [9.5, 74, 0.5, 0.72, true], [10, 79, 2, 0.82, true], [12, 78, 0.5, 0.7], [12.5, 76, 0.5, 0.68, true],
    [13, 74, 0.5, 0.66], [13.5, 72, 0.5, 0.64, true], [14, 71, 2, 0.7],
  ]);
  // soft, low and breathy, one breath
  t = play(lab, fl, bpm, t + 0.2, [[0, 62, 1, 0.3], [1, 64, 0.5, 0.28, true], [1.5, 66, 0.5, 0.3, true], [2, 67, 2.5, 0.34, true]]);
  // loud, to the top
  t = play(lab, fl, bpm, t + 0.25, [[0, 79, 0.5, 0.86], [0.5, 83, 0.5, 0.9], [1, 86, 1, 0.95, true], [2, 88, 0.5, 0.9], [2.5, 86, 0.5, 0.88, true], [3, 91, 2, 1]]);
  // a scale run, slurred, and tongued repeats
  const scale = [67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84, 86];
  t = play(lab, fl, bpm, t + 0.2, run(0, scale, 0.25, (i) => 0.55 + i * 0.03));
  t = play(lab, fl, bpm, t + 0.1, run(0, [86, 86, 86, 86, 84, 84, 83, 83], 0.25, (i) => (i % 2 ? 0.6 : 0.78), false), 0.55);
  // a long note, the vibrato blooming
  play(lab, fl, bpm, t + 0.1, [[0, 79, 5, 0.7]], 1);
}

/** The whistle: a sunny garage tune in C (94 bpm, swung), tongued with a few slurred turns, a quick run, repeats. */
export function demoWhistle(lab: Lab): void {
  const wh = makeWhistle(lab.ctx, lab.strip('whistle', { gain: 1, rev: 0.22, del: 0.1 }), lab.r);
  const bpm = 94;
  const sw = (b: number) => (b % 0.5 === 0.25 ? b + 0.06 : b);
  const tune: Ev[] = (
    [
      [0, 79, 0.75, 0.7], [0.75, 84, 0.75, 0.78], [1.5, 86, 0.5, 0.72], [2, 88, 1, 0.82], [3, 91, 1, 0.8],
      [4, 89, 0.75, 0.72], [4.75, 88, 0.75, 0.7, true], [5.5, 86, 0.5, 0.66], [6, 84, 2, 0.76, true],
      [8, 88, 0.5, 0.7], [8.5, 86, 0.25, 0.6], [8.75, 84, 0.25, 0.6, true], [9, 81, 0.5, 0.66, true], [9.5, 84, 0.5, 0.7], [10, 86, 1.5, 0.78],
      [11.5, 84, 0.25, 0.62], [11.75, 86, 0.25, 0.64, true], [12, 88, 0.75, 0.74], [12.75, 91, 0.75, 0.82], [13.5, 93, 0.5, 0.86], [14, 96, 2, 0.9, true],
    ] as Ev[]
  ).map(([b, m, l, v, s]) => [sw(b), m, l, v, s] as Ev);
  let t = play(lab, wh, bpm, 0, tune, 0.8);
  // soft and close
  t = play(lab, wh, bpm, t + 0.2, [[0, 81, 0.5, 0.36], [0.5, 79, 0.5, 0.34], [1, 76, 0.5, 0.36], [1.5, 79, 1.5, 0.4, true]], 0.8);
  // a quick slurred run and tongued repeats
  t = play(lab, wh, bpm, t + 0.15, run(0, [84, 86, 88, 89, 91, 93, 95, 96], 0.25, 0.7));
  t = play(lab, wh, bpm, t + 0.05, run(0, [91, 91, 91, 88, 91, 91, 93, 91], 0.25, (i) => (i % 2 ? 0.62 : 0.8), false), 0.5);
  play(lab, wh, bpm, t + 0.1, [[0, 88, 3, 0.75]], 1);
}

/**
 * The ondes: a luminous line in D (96 bpm), glides where it is slurred (quick steps, an octave leap), fresh swells
 * where it is not, soft and low, then bright detached notes up to a held top note.
 */
export function demoOndes(lab: Lab): void {
  const on = makeOndes(lab.ctx, lab.strip('ondes', { gain: 1, rev: 0.4, del: 0.12 }), lab.r);
  const bpm = 96;
  let t = play(lab, on, bpm, 0, [
    [0, 69, 1, 0.6], [1, 74, 1, 0.66, true], [2, 76, 0.5, 0.62], [2.5, 78, 0.5, 0.64, true], [3, 81, 2, 0.72, true],
    [5, 79, 0.5, 0.62], [5.5, 78, 0.5, 0.6, true], [6, 76, 1, 0.62], [7, 74, 1, 0.6, true],
  ]);
  t = play(lab, on, bpm, t, [
    [0, 74, 1, 0.64], [1, 86, 2, 0.8, true], [3, 85, 0.5, 0.7, true], [3.5, 83, 0.5, 0.68, true], [4, 81, 1, 0.7], [5, 78, 1, 0.66, true], [6, 81, 2, 0.74, true],
  ]);
  // soft and low
  t = play(lab, on, bpm, t + 0.2, [[0, 62, 1.5, 0.3], [1.5, 69, 1.5, 0.36, true], [3, 66, 2, 0.32]]);
  // bright detached notes, then a held one at the top
  play(lab, on, bpm, t + 0.2, [[0, 78, 0.5, 0.66], [0.75, 81, 0.5, 0.7], [1.5, 86, 0.5, 0.78], [2.25, 90, 2.5, 0.85]], 0.75);
}

/**
 * The Lyricon: a fast city-pop / fusion line in F (114 bpm): sixteenth runs slurred in groups, tongued stabs,
 * long notes that swell bright, a loud growling climax.
 */
export function demoLyricon(lab: Lab): void {
  const stops: (() => void)[] = [];
  const ly = makeLyricon(lab.ctx, lab.strip('lyricon', { gain: 1, rev: 0.22, del: 0.16 }), lab.r, { onStop: (f) => stops.push(f) });
  lab.onStop(() => stops.forEach((f) => f()));
  const bpm = 114;
  // the hook: up the F major pentatonic, a held note that swells
  let t = play(lab, ly, bpm, 0, [
    ...run(0, [65, 67, 69, 72, 74, 77], 0.25, 0.72), [1.5, 79, 0.5, 0.78], [2, 81, 2, 0.82, true],
    ...run(4, [79, 77, 74, 77], 0.25, 0.7), [5, 76, 0.5, 0.72], [5.5, 72, 0.5, 0.7, true], [6, 74, 2, 0.76, true],
  ]);
  // tongued stabs, syncopated
  t = play(lab, ly, bpm, t, [[0.5, 81, 0.25, 0.85], [1, 81, 0.25, 0.7], [1.75, 84, 0.5, 0.9], [2.5, 81, 0.25, 0.7], [3, 79, 1, 0.8]], 0.7);
  // a long fusion run up two octaves, slurred in fours
  const up = [65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84, 86, 88, 89, 91];
  t = play(lab, ly, bpm, t + 0.1, run(0, up, 0.25, (i) => 0.6 + i * 0.022, (i) => i % 4 !== 0));
  // the loud climax: a held top note that swells and growls, a fall
  t = play(lab, ly, bpm, t, [[0, 93, 3, 1], [3, 91, 0.5, 0.9, true], [3.5, 89, 0.5, 0.86, true], [4, 86, 2, 0.84, true]]);
  // soft and dark
  play(lab, ly, bpm, t + 0.2, [[0, 69, 1, 0.35], [1, 72, 1, 0.38, true], [2, 74, 3, 0.42, true]]);
}

/**
 * The harmonica: a soul tune in C (96 bpm, swung), the hook tongued with slurred turns, a bluesy fall, thirds moving
 * in parallel (slurred, called in either order, and as chords), fast repeats, a long note whose throat vibrato blooms.
 */
export function demoHarmonica(lab: Lab): void {
  const hm = makeHarmonica(lab.ctx, lab.strip('harmonica', { gain: 1, rev: 0.25, del: 0.1 }), lab.r);
  const bpm = 96;
  const sw = (b: number) => (b % 0.5 === 0.25 ? b + 0.05 : b);
  const tune: Ev[] = (
    [
      [0, 72, 0.75, 0.72], [0.75, 76, 0.75, 0.78], [1.5, 79, 0.5, 0.74], [2, 81, 1, 0.82, true], [3, 79, 0.5, 0.7], [3.5, 76, 0.5, 0.68, true],
      [4, 77, 0.5, 0.72], [4.5, 76, 0.25, 0.64], [4.75, 74, 0.25, 0.62, true], [5, 72, 1, 0.7, true], [6, 69, 0.5, 0.64], [6.5, 72, 1.5, 0.74, true],
      [8, 84, 0.5, 0.86], [8.5, 83, 0.25, 0.74, true], [8.75, 81, 0.25, 0.72, true], [9, 79, 0.5, 0.76], [9.5, 76, 0.5, 0.72], [10, 79, 2, 0.84, true],
    ] as Ev[]
  ).map(([b, m, l, v, s]) => [sw(b), m, l, v, s] as Ev);
  let t = play(lab, hm, bpm, 0, tune);
  // thirds moving together, slurred: top note called first, then bottom first (each voice must carry its own line)
  const b = 60 / bpm, thirds = [[76, 72], [77, 74], [79, 76], [81, 77], [79, 76]];
  t += 0.15;
  thirds.forEach((ch, i) => {
    const notes = i % 2 ? [...ch].reverse() : ch;
    for (const m of notes) hm(lab.t0 + t + i * 0.5 * b, m, 0.5 * b + 0.004, 0.66, i > 0);
  });
  t += thirds.length * 0.5 * b + 0.25 * b;
  // the same as chords on one breath, tongued
  t = play(lab, hm, bpm, t, [[0, [72, 76], 0.5, 0.7], [0.5, [74, 77], 0.5, 0.72], [1, [76, 79], 1.5, 0.8]], 0.85);
  // soft and low, then tongued repeats
  t = play(lab, hm, bpm, t + 0.15, [[0, 67, 0.5, 0.4], [0.5, 69, 0.5, 0.38, true], [1, 72, 1.5, 0.44, true]]);
  t = play(lab, hm, bpm, t + 0.1, run(0, [84, 84, 84, 81, 84, 84, 86, 84], 0.25, (i) => (i % 2 ? 0.62 : 0.8), false), 0.55);
  play(lab, hm, bpm, t + 0.1, [[0, 81, 3.5, 0.78]], 1);
}

/** The pan flute: a tune in C (100 bpm), breathy attacks, a slurred turn, a slurred run, a held note. */
export function demoPanFlute(lab: Lab): void {
  const pf = makePanFlute(lab.ctx, lab.strip('panflute', { gain: 1, rev: 0.35, del: 0.1 }), lab.r);
  const bpm = 100;
  let t = play(lab, pf, bpm, 0, [
    [0, 76, 1, 0.66], [1, 79, 1, 0.7], [2, 81, 1.5, 0.74], [3.5, 79, 0.5, 0.62, true], [4, 76, 1, 0.66], [5, 74, 1, 0.6], [6, 72, 2, 0.66, true],
    [8, 74, 0.5, 0.6], [8.5, 76, 0.5, 0.62, true], [9, 79, 1, 0.7, true], [10, 84, 2, 0.86], [12, 83, 0.5, 0.74], [12.5, 81, 0.5, 0.7, true], [13, 79, 3, 0.72, true],
  ], 0.92);
  t = play(lab, pf, bpm, t + 0.2, run(0, [72, 74, 76, 79, 81, 84, 86, 88], 0.25, 0.7));
  play(lab, pf, bpm, t + 0.1, [[0, 84, 4, 0.64]], 1);
}
