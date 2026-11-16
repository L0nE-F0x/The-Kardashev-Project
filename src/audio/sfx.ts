/**
 * Sound effects, synthesised: every sound is a few layers (a transient, a body, a tail) on its own channel strip, with
 * its own level and its own share of the hall and the echo. Tonal sounds are written in scale degrees and played in
 * the key of whatever music is on, so a chime never clashes with the score; the stings quote the theme's hook
 * (so–do–re–mi on its 3+3+2 beat: theme.ts `HOOK`). Repeats vary a little in pitch and timing so nothing machine-guns.
 * Since v0.15.5 the tonal sounds play the score's own instruments (voices/), so a chime belongs to the same world as
 * the music under it: pings and confirmations on vibraphone, kalimba and celesta, building on marimba over a light
 * kit, discoveries on celesta, glockenspiel and harp, the stings on vibes and celesta with the DX brass, strings and
 * the choir. A sound makes its instruments once, on its own strip, and never one that needs an LFO left running (no
 * vibes motor, no chorus); they are made ready while the page is idle (`warmUp`). The drums under them are the light
 * kit's (a sine kick, a noise snare and rim, a hiss for the crash): the score's modelled kits build every hit they
 * have when made, a crash alone 0.1–0.3 s on the main thread. The interface's clicks and whooshes and the big
 * machines are noise and tone, as before.
 */
import { audioCtx, audioRunning, duckMusic, freeWhenDone, mixBus, noiseBuffer, voiceFilter } from './engine';
import { musicKey } from './music';
import { MAJOR } from './score';
import { makeBell, makeKit, strip, wave, type Rnd, type Strip, type Wave } from './synth';
import { makeCelesta, makeGlock, makeKalimba, makeMarimba, makeVibes } from './voices/mallets';
import { makeChoir, makeStrings } from './voices/pads';
import { makeHarp } from './voices/plucked';
import { makeFMBrass, makeSparkle } from './voices/synths';

export type SoundId =
  | 'click'
  | 'hover'
  | 'select'
  | 'confirm'
  | 'error'
  | 'build'
  | 'built'
  | 'cash'
  | 'alert'
  | 'objective'
  | 'research'
  | 'trained'
  | 'fanfare'
  | 'achievement'
  | 'act'
  | 'whoosh'
  | 'open'
  | 'close'
  | 'start'
  | 'page'
  // ── the newer systems ──
  | 'launch'
  | 'thump'
  | 'jump'
  | 'decision'
  | 'arc'
  | 'storm'
  | 'bubble'
  | 'hello';

/** What a recipe gets: where and when to play, a random source, and the key. */
interface Voice {
  ctx: BaseAudioContext;
  s: Strip;
  t: number;
  r: () => number;
  /** MIDI note of a scale degree in the music's key (`oct` 0 = around middle C). */
  deg(n: number, oct?: number): number;
}

interface Sound {
  /** Strip level, hall send, echo send. */
  gain: number;
  rev?: number;
  del?: number;
  /** Seconds before the same sound may play again (many of one event in a tick is one sound). */
  gap?: number;
  /** Dip the music by this much, for this long. */
  duck?: [number, number];
  play(v: Voice): void;
}

/**
 * A rehearsal (see `warmUp`): the sounds are played without a sound, their instruments noting what they are asked for
 * instead of playing it; `air` and `tone` make nothing.
 */
let rehearsal: Map<string, { s: Strip; name: string; make: (ctx: BaseAudioContext, s: Strip, r: Rnd) => unknown; notes: Set<number> }> | null = null;

/** Filtered noise: the filter glides from `f0` to `f1`, the level rises for `a` seconds and falls for the rest. */
function air(v: Voice, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, f0: number, f1: number, dur: number, peak: number, a = dur * 0.3, q = 1, pan = 0) {
  if (rehearsal) return;
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(kind);
  src.loop = true;
  const f = voiceFilter(ctx);
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(peak * 0.001, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
  src.connect(f);
  f.connect(g);
  const nodes: AudioNode[] = [f, g];
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan, t);
    p.pan.linearRampToValueAtTime(-pan, t + dur);
    g.connect(p);
    p.connect(v.s.in);
    nodes.push(p);
  } else g.connect(v.s.in);
  src.start(t, v.r() * 4);
  src.stop(t + dur + 0.03);
  freeWhenDone(src, ...nodes);
}

/** A gliding tone, struck: `f0` to `f1` across `dur`. */
function tone(v: Voice, t: number, w: Wave | 'sine', f0: number, f1: number, dur: number, peak: number, a = 0.004) {
  if (rehearsal) return;
  const { ctx } = v;
  const o = ctx.createOscillator();
  if (w !== 'sine') o.setPeriodicWave(wave(ctx, w));
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(peak * 0.001, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
  o.connect(g);
  g.connect(v.s.in);
  o.start(t);
  o.stop(t + dur + 0.03);
  freeWhenDone(o, g);
}

/** A touch of pitch variation: ±`cents`. */
const vary = (v: Voice, cents: number) => Math.pow(2, ((v.r() * 2 - 1) * cents) / 1200);

/** A sound's instruments, made once on its strip (a mallet's room, the brass's filters, a kit's lanes) and kept. */
const made = new WeakMap<Strip, Map<string, unknown>>();
function inst<T>(v: Voice, name: string, make: (ctx: BaseAudioContext, s: Strip, r: Rnd) => T): T {
  if (rehearsal) {
    // a stand-in that notes the pitches it is given (a note's or a chord's) under any of its methods
    const key = `${rehearsal.size}:${name}`;
    let part = [...rehearsal.values()].find((p) => p.s === v.s && p.name === name);
    if (!part) rehearsal.set(key, (part = { s: v.s, name, make, notes: new Set() }));
    const notes = part.notes;
    const note = (...a: unknown[]) => {
      const m = a[1];
      if (typeof m === 'number') notes.add(m);
      else if (Array.isArray(m)) for (const x of m) if (typeof x === 'number') notes.add(x);
    };
    return new Proxy(note, { get: () => note }) as unknown as T;
  }
  let m = made.get(v.s);
  if (!m) made.set(v.s, (m = new Map()));
  let x = m.get(name) as T | undefined;
  if (x === undefined) m.set(name, (x = make(v.ctx, v.s, v.r)));
  return x;
}
// the instruments, by mallet or by envelope; none of them with a motor or a chorus
const vibes = (v: Voice, mallet = 0.5) => inst(v, `vibes${mallet}`, (c, s, r) => makeVibes(c, s, r, { mallet, spread: 0.25, room: 0.15 }));
const marimba = (v: Voice, mallet = 0.5) => inst(v, `marimba${mallet}`, (c, s, r) => makeMarimba(c, s, r, { mallet, room: 0.15 }));
const kalimba = (v: Voice, damp = false) => inst(v, `kalimba${damp}`, (c, s, r) => makeKalimba(c, s, r, { damp, buzz: 0.1, room: 0.15 }));
const celesta = (v: Voice) => inst(v, 'celesta', (c, s, r) => makeCelesta(c, s, r, { room: 0.15 }));
const glock = (v: Voice, damp = false) => inst(v, `glock${damp}`, (c, s, r) => makeGlock(c, s, r, { damp, room: 0.15 }));
// (its strings are made ahead while the page is idle: the notes research and jump play in any key)
const harp = (v: Voice) => inst(v, 'harp', (c, s, r) => makeHarp(c, s, r, { warm: [52, 84] }));
const brass = (v: Voice) => inst(v, 'brass', (c, s, r) => makeFMBrass(c, s, r));
const strings = (v: Voice, attack = 0.3, release = 0.6) => inst(v, `strings${attack}/${release}`, (c, s, r) => makeStrings(c, s, r, { attack, release }));
const choir = (v: Voice) => inst(v, 'choir', (c, s, r) => makeChoir(c, s, r, { attack: 0.3, release: 1.2 }));
const sparkle = (v: Voice) => inst(v, 'sparkle', (c, s, r) => makeSparkle(c, s, r, { decay: 1.6 }));
const kit = (v: Voice) => inst(v, 'kit', makeKit);
/** A crash: the stick's crack and a bright wash dying away (noise only: nothing to make ahead). */
function crash(v: Voice, t: number, vel: number) {
  air(v, t, 'white', 'bandpass', 3600, 2900, 0.2, 0.3 * vel, 0.002, 1.1);
  air(v, t, 'white', 'highpass', 7400, 4300, 1.2 + 1.2 * vel, 0.55 * vel, 0.004, 0.7);
}

/** The theme's hook (theme.ts `HOOK`): so–do–re–mi on its 3+3+2 beat, as steps; the notes from octave `oct`. */
const HOOK_AT = [0, 3, 6, 8];
const hook = (v: Voice, oct = 0) => [v.deg(5, oct), v.deg(1, oct + 1), v.deg(2, oct + 1), v.deg(3, oct + 1)];

const SOUNDS: Record<SoundId, Sound> = {
  // ── the interface: small, dry, tactile ──
  click: {
    gain: 0.5, rev: 0.04,
    play(v) {
      const p = vary(v, 90);
      air(v, v.t, 'white', 'bandpass', 3400 * p, 3400 * p, 0.014, 0.6, 0.001, 1.5);
      tone(v, v.t, 'sine', 1250 * p, 820 * p, 0.035, 0.4, 0.002);
    },
  },
  hover: {
    gain: 0.22, rev: 0.04, gap: 0.05,
    play(v) {
      const p = vary(v, 120);
      tone(v, v.t, 'sine', 2050 * p, 2350 * p, 0.022, 0.35, 0.005);
    },
  },
  select: {
    gain: 0.33, rev: 0.14,
    play(v) {
      // a fingertip on the glass, then a kalimba tine, stopped by the thumb
      const p = vary(v, 40);
      tone(v, v.t, 'sine', 540 * p, 830 * p, 0.05, 0.4);
      kalimba(v, true)(v.t + 0.01, v.deg(5, 1), 0.22, 0.62);
    },
  },
  confirm: {
    gain: 0.175, rev: 0.22, del: 0.1,
    play(v) {
      // a fifth up on the vibes, a celesta glint on top
      const vb = vibes(v);
      vb(v.t, v.deg(1, 1), 0.5, 0.62, -0.15);
      vb(v.t + 0.072 + v.r() * 0.01, v.deg(5, 1), 0.7, 0.75, 0.15);
      celesta(v)(v.t + 0.075, v.deg(5, 2), 0.4, 0.32);
    },
  },
  error: {
    gain: 0.325, rev: 0.1, gap: 0.12,
    play(v) {
      // "uh-oh": a minor third falling on a soft marimba, a soft hand drum under it; never a buzzer
      const mb = marimba(v, 0.25);
      mb(v.t, v.deg(1), 0.3, 0.72);
      mb(v.t + 0.115, v.deg(6, -1), 0.4, 0.66);
      kit(v).tom(v.t, 0.3, 82, 0.16);
    },
  },
  page: {
    gain: 0.9, rev: 0.06,
    play(v) {
      const p = vary(v, 150);
      air(v, v.t, 'white', 'bandpass', 2500 * p, 3500 * p, 0.06, 0.4, 0.018, 0.9);
      air(v, v.t + 0.034, 'white', 'bandpass', 3000 * p, 2300 * p, 0.05, 0.22, 0.012, 0.9);
    },
  },
  open: {
    gain: 0.62, rev: 0.1,
    play(v) {
      const p = vary(v, 80);
      air(v, v.t, 'white', 'bandpass', 1500 * p, 4400 * p, 0.11, 0.42, 0.06, 1.1);
      tone(v, v.t + 0.02, 'sine', 880 * p, 1320 * p, 0.05, 0.22);
    },
  },
  close: {
    gain: 0.62, rev: 0.1,
    play(v) {
      const p = vary(v, 80);
      air(v, v.t, 'white', 'bandpass', 3800 * p, 1300 * p, 0.1, 0.36, 0.02, 1.1);
      tone(v, v.t, 'sine', 1150 * p, 760 * p, 0.05, 0.2);
    },
  },
  whoosh: {
    gain: 0.9, rev: 0.35, gap: 0.2,
    play(v) {
      const side = v.r() < 0.5 ? -0.6 : 0.6;
      air(v, v.t, 'pink', 'bandpass', 240, 2900, 0.42, 0.9, 0.3, 0.8, side);
      air(v, v.t + 0.26, 'pink', 'bandpass', 2600, 420, 0.5, 0.5, 0.06, 0.8, -side);
      tone(v, v.t, 'sine', 78, 48, 0.4, 0.22, 0.05);
    },
  },
  bubble: {
    gain: 0.22, rev: 0.1, gap: 0.08,
    play(v) {
      // a bubble popping up: a quick rise into a high kalimba tine, stopped at once
      const p = vary(v, 120);
      tone(v, v.t, 'sine', 920 * p, 1480 * p, 0.045, 0.5, 0.003);
      kalimba(v, true)(v.t + 0.012, v.deg(1, 2), 0.12, 0.45);
    },
  },
  hello: {
    gain: 0.26, rev: 0.26, del: 0.12,
    play(v) {
      // an advisor says hello: two kalimba tines, a friendly interval
      const [a, b] = [[3, 5], [5, 8], [1, 3]][Math.floor(v.r() * 3)];
      const k = kalimba(v);
      k(v.t, v.deg(a, 1), 0.5, 0.62, -0.1);
      k(v.t + 0.085, v.deg(b, 1), 0.8, 0.75, 0.1);
    },
  },

  // ── the company: building, money, science ──
  build: {
    gain: 0.417, rev: 0.16, gap: 0.1,
    play(v) {
      // ground broken: the kick's thud, a ratchet of rim clicks, a marimba bar struck hard
      const k1 = kit(v);
      k1.kick(v.t, 0.75, { click: 0.4 });
      for (let k = 0; k < 3; k++) k1.rim(v.t + 0.055 + k * 0.042, 0.35 + k * 0.12);
      marimba(v, 0.65)(v.t + 0.01, v.deg(1), 0.35, 0.8);
    },
  },
  built: {
    gain: 0.26, rev: 0.32, del: 0.14, gap: 0.25,
    play(v) {
      // it's online: the kick lands, a triad climbs the marimba, the brass and the snare hit the octave, a breath of air
      const k1 = kit(v);
      k1.kick(v.t, 0.7);
      const mb = marimba(v, 0.6);
      [1, 3, 5].forEach((d, k) => mb(v.t + k * 0.08, v.deg(d, 1), 0.4, 0.62 + k * 0.1, (k - 1) * 0.25));
      brass(v)(v.t + 0.24, [v.deg(1, 1), v.deg(5, 1), v.deg(1, 2)], 0.22, 0.7, 'stab');
      k1.snare(v.t + 0.24, 0.55);
      air(v, v.t + 0.04, 'white', 'highpass', 5200, 3800, 0.38, 0.12, 0.03);
    },
  },
  cash: {
    gain: 0.27, rev: 0.2, del: 0.08, gap: 0.1,
    play(v) {
      // two coins on the glockenspiel: bright, brief
      air(v, v.t, 'white', 'highpass', 6500, 6500, 0.02, 0.25, 0.001);
      const g = glock(v, true);
      g(v.t, v.deg(5, 1), 0.3, 0.6, -0.2);
      g(v.t + 0.058 + v.r() * 0.012, v.deg(1, 2), 0.45, 0.7, 0.2);
    },
  },
  research: {
    gain: 0.19, rev: 0.4, del: 0.3, gap: 0.25,
    play(v) {
      // a discovery: celesta over harp climbing to a note that doesn't close (the ninth), the glockenspiel on it
      const notes = [[5, 1], [6, 1], [7, 1], [2, 2]].map(([d, o]) => v.deg(d, o));
      const ce = celesta(v), hp = harp(v);
      notes.forEach((m, k) => {
        ce(v.t + k * 0.062, m, k === 3 ? 1.2 : 0.3, 0.5 + k * 0.08, k % 2 ? 0.3 : -0.3);
        hp.note(v.t + k * 0.062 + 0.004, m - 12, k === 3 ? 1.4 : 0.6, 0.45 + k * 0.06);
      });
      glock(v)(v.t + 0.19, v.deg(2, 2), 1.5, 0.42);
      air(v, v.t, 'white', 'bandpass', 1500, 6500, 0.36, 0.1, 0.26, 1.4);
    },
  },
  trained: {
    gain: 0.25, rev: 0.4, del: 0.3, gap: 0.5,
    play(v) {
      // a mind switching on: the hook as a flurry of small lights high up, then one chord blooming over a fifth, the
      // choir lifting it, a light on top
      const ce = celesta(v);
      const lights = [...hook(v, 1), v.deg(5, 2)];
      [...HOOK_AT, 12].forEach((s, k) => ce(v.t + s * 0.03, lights[k], 0.5, 0.5 + k * 0.06, k % 2 ? 0.45 : -0.45));
      strings(v, 0.25, 0.9)(v.t + 0.3, [v.deg(1), v.deg(5), v.deg(2, 1)], 0.6, 0.55, 0.6);
      choir(v)(v.t + 0.32, [v.deg(5), v.deg(1, 1), v.deg(2, 1)], 0.6, 0.5, 'oo', 'ah');
      glock(v)(v.t + 0.36, v.deg(2, 2), 1.6, 0.4);
    },
  },
  objective: {
    gain: 0.28, rev: 0.32, del: 0.2, gap: 0.25,
    play(v) {
      // a goal met: the hook on the vibes, the brass and a celesta on its last note
      const vb = vibes(v, 0.55);
      hook(v).forEach((m, k) => vb(v.t + HOOK_AT[k] * 0.045, m, k === 3 ? 0.9 : 0.3, 0.6 + k * 0.08, (k - 1.5) * 0.2));
      brass(v)(v.t + 0.36, [v.deg(1, 1), v.deg(3, 1), v.deg(5, 1)], 0.2, 0.6, 'stab');
      celesta(v)(v.t + 0.36, v.deg(3, 2), 0.8, 0.4);
      air(v, v.t + 0.3, 'white', 'highpass', 6000, 9000, 0.3, 0.06, 0.05);
    },
  },
  alert: {
    gain: 0.42, rev: 0.3, del: 0.1, gap: 0.3,
    play(v) {
      // "a word, please": a falling fourth on soft vibes, a low hand drum under it
      const vb = vibes(v, 0.3);
      vb(v.t, v.deg(6, 1), 0.5, 0.7);
      vb(v.t + 0.16, v.deg(3, 1), 0.8, 0.65);
      kit(v).tom(v.t, 0.28, 74, 0.2);
    },
  },

  // ── the stings: the theme's hook ──
  achievement: {
    gain: 0.268, rev: 0.42, del: 0.25, gap: 0.8, duck: [0.25, 0.7],
    play(v) {
      // a medal: the hook on celesta over vibes, the brass and the strings on its last note, a cymbal under it
      const ce = celesta(v), vb = vibes(v, 0.5);
      hook(v, 1).forEach((m, k) => {
        const at = v.t + HOOK_AT[k] * 0.05;
        ce(at, m, k === 3 ? 1.2 : 0.3, 0.55 + k * 0.08, (k - 1.5) * 0.3);
        vb(at, m - 12, k === 3 ? 1 : 0.3, 0.45 + k * 0.06);
      });
      const end = v.t + HOOK_AT[3] * 0.05;
      brass(v)(end, [v.deg(1, 1), v.deg(3, 1), v.deg(5, 1)], 0.3, 0.65, 'stab');
      strings(v, 0.08, 0.6)(end, [v.deg(1), v.deg(5), v.deg(3, 1)], 0.45, 0.5);
      crash(v, end, 0.35);
    },
  },
  fanfare: {
    gain: 0.397, rev: 0.45, del: 0.2, gap: 1.5, duck: [0.5, 1.9],
    play(v) {
      // so–do–re–mi on the brass in the hook's beat, vibes and celesta above it, a snare roll into the last note and
      // strings, brass and a crash on it
      const step = 0.07, b = brass(v), vb = vibes(v, 0.55), ce = celesta(v);
      hook(v).forEach((m, k) => {
        const at = v.t + HOOK_AT[k] * step, held = k === 3;
        b(at, [m], held ? 1.2 : 0.17, 0.8 + k * 0.05, held ? 'hold' : 'stab');
        vb(at, m + 12, held ? 1.4 : 0.3, 0.6 + k * 0.08, (k - 1.5) * 0.25);
        ce(at, m + 24, held ? 1.2 : 0.3, 0.35 + k * 0.05);
      });
      const end = v.t + HOOK_AT[3] * step;
      strings(v, 0.2, 1.2)(end - 0.04, [v.deg(1), v.deg(5), v.deg(2, 1), v.deg(3, 1)], 1.1, 0.7, 0.5);
      b(end, [v.deg(1), v.deg(5), v.deg(1, 1)], 1.1, 0.55, 'swell');
      const k1 = kit(v);
      for (let k = 0; k < 6; k++) k1.snare(v.t + 0.26 + k * 0.05, 0.15 + k * 0.05);
      k1.kick(end, 0.8);
      crash(v, end, 0.55);
    },
  },
  act: {
    gain: 0.63, rev: 0.5, del: 0.2, gap: 4, duck: [0.65, 4.4],
    play(v) {
      // an act ends: the hook on the brass with vibes and celesta above, the leap to the high so, the IV chord, and
      // home: strings, brass and the choir, a snare roll and a crash, the glockenspiel climbing the home chord
      const step = 0.09, b = brass(v), vb = vibes(v, 0.55), ce = celesta(v), k1 = kit(v);
      hook(v).forEach((m, k) => {
        const at = v.t + HOOK_AT[k] * step;
        b(at, [m], 0.2, 0.75 + k * 0.05, 'stab');
        vb(at, m + 12, 0.4, 0.6 + k * 0.06, (k - 1.5) * 0.25);
        ce(at, m + 24, 0.3, 0.35 + k * 0.05);
      });
      b(v.t + 1.1, [v.deg(5, 1)], 0.75, 0.9, 'hold');
      vb(v.t + 1.1, v.deg(5, 2), 0.8, 0.75);
      const st = strings(v, 0.25, 1.4);
      st(v.t, [v.deg(1, -1), v.deg(5, -1), v.deg(3)], 1.0, 0.6, 0.4);
      st(v.t + 1.1, [v.deg(4, -1), v.deg(1), v.deg(6)], 0.75, 0.65, 0, true);
      const home = v.t + 1.9;
      st(home, [v.deg(1, -1), v.deg(5, -1), v.deg(1), v.deg(3)], 2.2, 0.8, 0, true);
      b(home, [v.deg(1), v.deg(5), v.deg(1, 1), v.deg(3, 1)], 2.0, 0.75, 'swell');
      choir(v)(home, [v.deg(5), v.deg(1, 1), v.deg(3, 1), v.deg(5, 1)], 1.9, 0.6, 'oh', 'ah');
      k1.kick(v.t, 0.7);
      crash(v, v.t, 0.4);
      for (let k = 0; k < 8; k++) k1.snare(home - 0.4 + k * 0.05, 0.12 + k * 0.045);
      k1.kick(home, 0.85);
      crash(v, home, 0.6);
      const gl = glock(v);
      [v.deg(1, 1), v.deg(3, 1), v.deg(5, 1), v.deg(1, 2), v.deg(3, 2)].forEach((m, k) => gl(home + 0.05 + k * 0.09, m, 1.2, 0.4, k % 2 ? 0.5 : -0.5));
    },
  },
  start: {
    gain: 0.56, rev: 0.45, del: 0.15, gap: 1, duck: [0.3, 1.2],
    play(v) {
      // a company opens its doors: strings and brass rising, the hook's first two notes on the vibes, a celesta bell
      strings(v, 0.6, 1.2)(v.t, [v.deg(1), v.deg(5), v.deg(2, 1)], 1.1, 0.7, 1);
      brass(v)(v.t + 0.1, [v.deg(1), v.deg(5), v.deg(2, 1)], 1.0, 0.45, 'swell');
      const vb = vibes(v, 0.5);
      vb(v.t + 0.05, v.deg(5), 0.25, 0.7);
      vb(v.t + 0.25, v.deg(1, 1), 1.2, 0.8);
      celesta(v)(v.t + 0.45, v.deg(5, 1), 1.5, 0.45);
      air(v, v.t, 'pink', 'bandpass', 300, 2400, 0.5, 0.25, 0.4, 0.8);
      kit(v).kick(v.t + 0.25, 0.6);
      crash(v, v.t + 0.25, 0.3);
    },
  },
  decision: {
    gain: 0.82, rev: 0.5, del: 0.1, gap: 1.5, duck: [0.55, 2.4],
    play(v) {
      // the room goes quiet: low brass on the root, then on the fifth, strings on a chord that asks (a sus4), and the
      // hook on the vibes stopping on re, a question; a deep drum under the first note
      const b = brass(v);
      b(v.t, [v.deg(1, -2), v.deg(1, -1)], 1.4, 0.85, 'hold');
      b(v.t + 0.36, [v.deg(5, -2), v.deg(5, -1)], 1.4, 0.75, 'hold');
      strings(v, 0.45, 1.8)(v.t + 0.3, [v.deg(1), v.deg(4), v.deg(5), v.deg(1, 1)], 1.6, 0.6, 1);
      const vb = vibes(v, 0.4);
      hook(v)
        .slice(0, 3)
        .forEach((m, k) => vb(v.t + 0.72 + HOOK_AT[k] * 0.09, m + 12, k === 2 ? 1.6 : 0.4, 0.5 + k * 0.05));
      kit(v).tom(v.t, 0.75, 55, 0.7);
    },
  },

  // ── the big machines and the sky ──
  launch: {
    gain: 0.8, rev: 0.4, gap: 2, duck: [0.3, 3],
    play(v) {
      const { ctx, t } = v;
      // ignition: a bark and a hiss
      makeKit(ctx, v.s, v.r).boom(t, 0.9);
      air(v, t, 'white', 'lowpass', 7000, 900, 0.7, 0.4, 0.03, 0.5);
      // the rumble (felt) and the roar (heard), both crackling: their level shakes with slow noise
      const shake = ctx.createBufferSource();
      shake.buffer = noiseBuffer('white');
      shake.loop = true;
      const slow = voiceFilter(ctx);
      slow.type = 'lowpass';
      slow.frequency.value = 38;
      const depth = ctx.createGain();
      depth.gain.value = 20;
      shake.connect(slow);
      slow.connect(depth);
      const nodes: AudioNode[] = [slow, depth];
      for (const [kind, type, f0, f1, peak] of [['brown', 'lowpass', 95, 240, 1.3], ['pink', 'bandpass', 380, 900, 0.36]] as const) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(kind);
        src.loop = true;
        const f = voiceFilter(ctx);
        f.type = type;
        f.Q.value = 0.6;
        f.frequency.setValueAtTime(f0, t);
        f.frequency.linearRampToValueAtTime(f1, t + 1.6);
        f.frequency.linearRampToValueAtTime(f0 * 1.2, t + 5);
        const crackle = ctx.createGain();
        crackle.gain.value = 0.55;
        depth.connect(crackle.gain);
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.8);
        g.gain.setValueAtTime(peak, t + 2);
        g.gain.exponentialRampToValueAtTime(peak * 0.002, t + 5.4);
        g.gain.linearRampToValueAtTime(0, t + 5.45);
        src.connect(f);
        f.connect(crackle);
        crackle.connect(g);
        g.connect(v.s.in);
        src.start(t, v.r() * 4);
        src.stop(t + 5.5);
        nodes.push(src, f, crackle, g);
      }
      shake.start(t);
      shake.stop(t + 5.5);
      freeWhenDone(shake, ...nodes);
      tone(v, t, 'sine', 60, 44, 4.6, 0.4, 0.5);
    },
  },
  thump: {
    gain: 0.6, rev: 0.36, del: 0.25, gap: 0.5,
    play(v) {
      // the mass driver: a clack, the slug leaving (felt in the chest), the rails singing after it
      const kit = makeKit(v.ctx, v.s, v.r);
      kit.rim(v.t, 0.7);
      makeBell(v.ctx, v.s, { ratio: 3.5, index: 2, decay: 0.25 })(v.t, 50, 0.4);
      tone(v, v.t + 0.03, 'sine', 96, 36, 0.62, 1, 0.004);
      tone(v, v.t + 0.05, 'warm', 320, 2600, 0.7, 0.1, 0.06);
      air(v, v.t + 0.05, 'pink', 'bandpass', 900, 220, 0.9, 0.2, 0.04, 0.8);
    },
  },
  jump: {
    gain: 0.335, rev: 0.5, del: 0.4, gap: 1.5, duck: [0.3, 1.4],
    play(v) {
      // years pass: the air rises, the hook runs up two octaves on celesta over harp, faster and faster, and lands on
      // the vibes, the brass and a crash
      air(v, v.t, 'pink', 'bandpass', 300, 5200, 1.35, 0.5, 1.15, 0.9);
      const ce = celesta(v), hp = harp(v);
      let at = 0.1;
      [...hook(v), ...hook(v, 1)].forEach((m, k) => {
        ce(v.t + at, m, 0.4, 0.45 + k * 0.05, k % 2 ? 0.5 : -0.5);
        hp.note(v.t + at + 0.003, m - 12, 0.6, 0.4 + k * 0.04);
        at += 0.2 * Math.pow(0.86, k);
      });
      const land = v.t + 1.35;
      vibes(v, 0.55)(land, v.deg(3, 2), 1.2, 0.7);
      brass(v)(land, [v.deg(1), v.deg(5), v.deg(1, 1), v.deg(3, 1)], 0.35, 0.7, 'stab');
      kit(v).kick(land, 0.7);
      crash(v, land, 0.45);
    },
  },
  arc: {
    gain: 0.405, rev: 0.5, del: 0.4, gap: 0.6,
    play(v) {
      // an arc of the swarm lights: the hook as sparks (Act V's sparkle, the glockenspiel), a zap, a glow
      const sp = sparkle(v), gl = glock(v);
      hook(v, 1).forEach((m, k) => {
        const at = v.t + HOOK_AT[k] * 0.025;
        sp(at, m, 0.3, 0.55 + k * 0.08, k % 2 ? 0.5 : -0.5);
        gl(at + 0.004, m + 12, 0.4, 0.25 + k * 0.05);
      });
      tone(v, v.t, 'sine', 220, 2600, 0.13, 0.22, 0.01);
      air(v, v.t, 'white', 'highpass', 5000, 9000, 0.5, 0.14, 0.02);
      kit(v).swell(v.t + 0.1, 0.3, 0.3, 5500);
    },
  },
  storm: {
    gain: 0.6, rev: 0.5, gap: 3, duck: [0.45, 2.6],
    play(v) {
      // the solar storm arrives: static howling down, a growl under it, sparks
      air(v, v.t, 'pink', 'bandpass', 3400, 170, 2.7, 0.9, 0.3, 1.3, 0.5);
      tone(v, v.t, 'warm', 190, 66, 2.5, 0.3, 0.35);
      for (let k = 0; k < 7; k++) air(v, v.t + 0.2 + v.r() * 2, 'white', 'highpass', 4500 + v.r() * 3000, 7000, 0.04 + v.r() * 0.05, 0.3, 0.002);
      makeKit(v.ctx, v.s, v.r).boom(v.t + 0.2, 0.75);
    },
  },
};

const strips = new WeakMap<BaseAudioContext, Map<SoundId, Strip>>();
const last = new Map<SoundId, number>();
let lastAt = -1;
let seed = 0x2f6e2b1;

/** A quick xorshift for the variations (no need for the score's determinism here, but renders should repeat). */
function rnd(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}

/** When a sound (hover ticks aside) last played, in `performance.now()` time: the UI's own clicks don't double the game's. */
export function lastSfxAt(): number {
  return lastAt;
}

/** A sound's strip on this context, made the first time. */
function stripOf(ctx: BaseAudioContext, bus: Parameters<typeof strip>[1], id: SoundId): Strip {
  let mine = strips.get(ctx);
  if (!mine) strips.set(ctx, (mine = new Map()));
  let s = mine.get(id);
  const def = SOUNDS[id];
  if (!s) mine.set(id, (s = strip(ctx, bus, { gain: def.gain, rev: def.rev, del: def.del })));
  return s;
}

/** Scale degrees in a key (MIDI note of the tonic). */
const degIn = (key: number) => (n: number, oct = 0) => key + MAJOR[(n - 1) % 7] + 12 * (oct + Math.floor((n - 1) / 7));

/** The machines play noise and tone of their own: nothing to rehearse. */
const MACHINES = new Set<SoundId>(['launch', 'thump', 'storm']);
/** The key each context's instruments were last made ready in. */
const ready = new WeakMap<BaseAudioContext, number>();
const jobs: (() => void)[] = [];

function later(fn: (d?: IdleDeadline) => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 400 });
  else setTimeout(fn, 30);
}

/** Do the queued jobs while the page is idle, a few milliseconds at a time. */
function pump(d?: IdleDeadline): void {
  const until = performance.now() + (d && !d.didTimeout ? Math.min(8, d.timeRemaining()) : 4);
  do {
    try {
      jobs.shift()?.();
    } catch {
      // a sound must never break the game
    }
  } while (jobs.length && performance.now() < until);
  if (jobs.length) later(pump);
}

/**
 * Make the instruments ready before they are needed: a mallet computes a pitch zone's strike the first time it plays
 * there, a kit its hits, a harp its strings (5–150 ms on the main thread, a stutter in the frame a medal lands in). So
 * the first sound on a context (and the first after the music changes key) rehearses every tonal sound in that key
 * without a sound (`rehearsal`: their instruments note the pitches they are asked for), then, while the page is idle,
 * makes each instrument on its strip (a kit then builds its hits in the background, the harp its strings) and every
 * zone the mallets will play. Offline renders make theirs as they go, as before.
 */
function warmUp(ctx: BaseAudioContext, bus: Parameters<typeof strip>[1], key: number): void {
  if (ready.get(ctx) === key || (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext)) return;
  ready.set(ctx, key);
  later(() => {
    const parts: NonNullable<typeof rehearsal> = new Map();
    rehearsal = parts;
    try {
      for (const id of Object.keys(SOUNDS) as SoundId[]) {
        if (MACHINES.has(id)) continue;
        // three takes with fixed variations, so a sound that picks among intervals (hello) shows them all
        for (const x of [0.02, 0.5, 0.98])
          try {
            SOUNDS[id].play({ ctx, s: stripOf(ctx, bus, id), t: 0, r: () => x, deg: degIn(key) });
          } catch {
            // a sound that can't be rehearsed makes its own when it plays
          }
      }
    } finally {
      rehearsal = null;
    }
    for (const p of parts.values())
      jobs.push(() => {
        const x = inst({ ctx, s: p.s, t: 0, r: rnd, deg: degIn(key) }, p.name, p.make) as { warm?: (lo: number, hi: number) => void };
        // a mallet's `warm(lo, hi)` makes those zones now: one job a note (a kit's `warm()` would make every take)
        if (typeof x?.warm === 'function' && x.warm.length === 2) for (const m of p.notes) jobs.push(() => x.warm!(m, m));
      });
    pump();
  });
}

export function sfx(id: SoundId): void {
  try {
    const ctx = audioCtx();
    const bus = mixBus('sfx');
    const def = SOUNDS[id];
    if (!ctx || !bus || !def || !audioRunning()) return;
    // the key of the music, kept within a fourth of D so sounds stay in their register
    const key = 62 + ((musicKey() - 62 + 5) % 12 + 12) % 12 - 5;
    warmUp(ctx, bus, key);
    const now = ctx.currentTime;
    if (now - (last.get(id) ?? -99) < (def.gap ?? 0.03)) return;
    last.set(id, now);
    if (id !== 'hover') lastAt = performance.now();
    def.play({ ctx, s: stripOf(ctx, bus, id), t: now + 0.008, r: rnd, deg: degIn(key) });
    if (def.duck) duckMusic(def.duck[0], def.duck[1]);
  } catch {
    // a sound must never break the game
  }
}
