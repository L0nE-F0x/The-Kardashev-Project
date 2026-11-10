/**
 * Sound effects, synthesised: every sound is a few layers (a transient, a body, a tail) on its own channel strip, with
 * its own level and its own share of the hall and the echo. Tonal sounds are written in scale degrees and played in
 * the key of whatever music is on, so a chime never clashes with the score; the big stings quote the main theme's four
 * notes (so–do–re–mi). Repeats vary a little in pitch and timing so nothing machine-guns.
 */
import { audioCtx, audioRunning, duckMusic, freeWhenDone, mixBus, noiseBuffer } from './engine';
import { musicKey } from './music';
import { MAJOR } from './score';
import { makeBell, makeChoir, makeKit, makeMallet, makePad, makePiano, makePluck, strip, wave, type Strip, type Wave } from './synth';

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

/** Filtered noise: the filter glides from `f0` to `f1`, the level rises for `a` seconds and falls for the rest. */
function air(v: Voice, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, f0: number, f1: number, dur: number, peak: number, a = dur * 0.3, q = 1, pan = 0) {
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(kind);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
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
  const { ctx } = v;
  const o = ctx.createOscillator();
  if (w !== 'sine') o.setPeriodicWave(wave(ctx, w));
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
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
    gain: 0.5, rev: 0.14,
    play(v) {
      const p = vary(v, 40);
      tone(v, v.t, 'sine', 540 * p, 830 * p, 0.075, 0.45);
      makeMallet(v.ctx, v.s, { ratio: 4, tone: 0.18, decay: 0.4 })(v.t + 0.012, v.deg(5, 1), 0.4);
    },
  },
  confirm: {
    gain: 0.5, rev: 0.22, del: 0.1,
    play(v) {
      const m = makeMallet(v.ctx, v.s, { ratio: 5.4, tone: 0.3, decay: 0.7 });
      m(v.t, v.deg(1, 1), 0.6, -0.15);
      m(v.t + 0.072 + v.r() * 0.01, v.deg(5, 1), 0.78, 0.15);
      makeBell(v.ctx, v.s, { ratio: 4, index: 0.8, decay: 0.9 })(v.t + 0.075, v.deg(5, 2), 0.16);
    },
  },
  error: {
    gain: 0.55, rev: 0.1, gap: 0.12,
    play(v) {
      // a minor third falling, dull and low: "uh-uh", never a buzzer
      const p = makePluck(v.ctx, v.s, { wave: 'hollow', cut: 900, q: 1, decay: 0.2 });
      p(v.t, v.deg(1, -1) + 3, 0.8);
      p(v.t + 0.115, v.deg(1, -1), 0.75);
      makeKit(v.ctx, v.s, v.r).tom(v.t, 0.3, 82, 0.16);
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
    gain: 0.5, rev: 0.35, gap: 0.2,
    play(v) {
      const side = v.r() < 0.5 ? -0.6 : 0.6;
      air(v, v.t, 'pink', 'bandpass', 240, 2900, 0.42, 0.9, 0.3, 0.8, side);
      air(v, v.t + 0.26, 'pink', 'bandpass', 2600, 420, 0.5, 0.5, 0.06, 0.8, -side);
      tone(v, v.t, 'sine', 78, 48, 0.4, 0.22, 0.05);
    },
  },
  bubble: {
    gain: 0.3, rev: 0.1, gap: 0.08,
    play(v) {
      const p = vary(v, 260);
      tone(v, v.t, 'sine', 920 * p, 1480 * p, 0.05, 0.5, 0.003);
    },
  },
  hello: {
    gain: 0.45, rev: 0.26, del: 0.12,
    play(v) {
      const [a, b] = [[3, 5], [5, 8], [1, 3]][Math.floor(v.r() * 3)];
      const m = makeMallet(v.ctx, v.s, { ratio: 5.4, tone: 0.28, decay: 0.8 });
      m(v.t, v.deg(a, 1), 0.6, -0.1);
      m(v.t + 0.085, v.deg(b, 1), 0.78, 0.1);
    },
  },

  // ── the company: building, money, science ──
  build: {
    gain: 0.62, rev: 0.16, gap: 0.1,
    play(v) {
      // ground broken: a thunk, a ratchet, a wooden note
      const kit = makeKit(v.ctx, v.s, v.r);
      kit.kick(v.t, 0.7, { f0: 140, f1: 52, decay: 0.18, click: 0.35 });
      for (let k = 0; k < 3; k++) kit.rim(v.t + 0.055 + k * 0.042, 0.3 + k * 0.1);
      makeMallet(v.ctx, v.s, { ratio: 4, tone: 0.2, decay: 0.45 })(v.t + 0.01, v.deg(1), 0.5);
    },
  },
  built: {
    gain: 0.5, rev: 0.32, del: 0.14, gap: 0.25,
    play(v) {
      // it's online: weight landing, a triad climbing, a breath of air out
      const kit = makeKit(v.ctx, v.s, v.r);
      kit.kick(v.t, 0.6, { f0: 92, f1: 43, decay: 0.42 });
      const m = makeMallet(v.ctx, v.s, { ratio: 4, tone: 0.22, decay: 0.6 });
      [1, 3, 5].forEach((d, k) => m(v.t + k * 0.08, v.deg(d, 1), 0.55 + k * 0.1, (k - 1) * 0.25));
      makeBell(v.ctx, v.s, { ratio: 4, index: 1, decay: 1.4 })(v.t + 0.24, v.deg(1, 2), 0.42);
      air(v, v.t + 0.04, 'white', 'highpass', 5200, 3800, 0.38, 0.16, 0.03);
    },
  },
  cash: {
    gain: 0.8, rev: 0.2, del: 0.08, gap: 0.1,
    play(v) {
      // two coins: bright, brief
      air(v, v.t, 'white', 'highpass', 6500, 6500, 0.02, 0.25, 0.001);
      const b = makeBell(v.ctx, v.s, { ratio: 5.1, index: 0.9, decay: 0.5 });
      b(v.t, v.deg(5, 2), 0.5, -0.2);
      b(v.t + 0.058 + v.r() * 0.012, v.deg(1, 3), 0.6, 0.2);
    },
  },
  research: {
    gain: 0.62, rev: 0.4, del: 0.3, gap: 0.25,
    play(v) {
      // a discovery: glass climbing to a note that doesn't close (the ninth)
      const b = makeBell(v.ctx, v.s, { ratio: 2, index: 0.8, decay: 1.5 });
      [[5, 1], [6, 1], [7, 1], [2, 2]].forEach(([d, o], k) => b(v.t + k * 0.062, v.deg(d, o), 0.4 + k * 0.06, k % 2 ? 0.3 : -0.3));
      air(v, v.t, 'white', 'bandpass', 1500, 6500, 0.36, 0.14, 0.26, 1.4);
    },
  },
  trained: {
    gain: 0.45, rev: 0.4, del: 0.3, gap: 0.5,
    play(v) {
      // a mind switching on: a flurry of small lights, then one held tone over a fifth
      const p = makePluck(v.ctx, v.s, { wave: 'glass', cut: 5200, decay: 0.16 });
      const tones = [1, 5, 3, 5, 2, 5, 3].map((d, k) => v.deg(d, k % 3 === 2 ? 3 : 2));
      tones.forEach((m, k) => p(v.t + k * 0.045, m, 0.4 + v.r() * 0.2, k % 2 ? 0.5 : -0.5));
      makeBell(v.ctx, v.s, { ratio: 2, index: 0.6, decay: 2 })(v.t + 0.34, v.deg(2, 2), 0.5);
      makePad(v.ctx, v.s, v.r, { cut: 1800, attack: 0.3, release: 0.9 })(v.t + 0.3, [v.deg(1, 1), v.deg(5, 1)], 0.5, 0.5);
    },
  },
  objective: {
    gain: 0.55, rev: 0.32, del: 0.2, gap: 0.25,
    play(v) {
      const m = makeMallet(v.ctx, v.s, { ratio: 5.4, tone: 0.3, decay: 0.8 });
      [[1, 1], [3, 1], [5, 1], [1, 2]].forEach(([d, o], k) => m(v.t + k * 0.07, v.deg(d, o), 0.55 + k * 0.08, (k - 1.5) * 0.2));
      makeBell(v.ctx, v.s, { ratio: 4, index: 1, decay: 1.2 })(v.t + 0.21, v.deg(1, 2), 0.35);
      air(v, v.t + 0.15, 'white', 'highpass', 6000, 9000, 0.3, 0.07, 0.05);
    },
  },
  alert: {
    gain: 0.85, rev: 0.3, del: 0.1, gap: 0.3,
    play(v) {
      // "a word, please": a falling fourth on a bell, a soft knock under it
      const b = makeBell(v.ctx, v.s, { ratio: 3.5, index: 0.7, decay: 0.9 });
      b(v.t, v.deg(6, 1), 0.6);
      b(v.t + 0.16, v.deg(3, 1), 0.55);
      makeKit(v.ctx, v.s, v.r).tom(v.t, 0.28, 74, 0.2);
    },
  },

  // ── the stings: the theme's four notes ──
  achievement: {
    gain: 0.75, rev: 0.42, del: 0.25, gap: 0.8, duck: [0.25, 0.7],
    play(v) {
      const b = makeBell(v.ctx, v.s, { ratio: 4, index: 1.1, decay: 1.6 });
      [[5, 1], [1, 2], [3, 2]].forEach(([d, o], k) => b(v.t + k * 0.075, v.deg(d, o), 0.5 + k * 0.08, (k - 1) * 0.3));
      makeKit(v.ctx, v.s, v.r).swell(v.t, 0.16, 0.25, 6000);
    },
  },
  fanfare: {
    gain: 0.42, rev: 0.45, del: 0.2, gap: 1.5, duck: [0.5, 1.9],
    play(v) {
      // so–do–re–mi on bells and piano, the tonic chord swelling under the last note
      const motif = [v.deg(5), v.deg(1, 1), v.deg(2, 1), v.deg(3, 1)];
      const b = makeBell(v.ctx, v.s, { ratio: 4, index: 1.2, decay: 2.2 });
      const p = makePiano(v.ctx, v.s, v.r, { bright: 1.2 });
      motif.forEach((m, k) => {
        b(v.t + k * 0.16, m + 12, 0.5 + k * 0.07, (k - 1.5) * 0.25);
        p(v.t + k * 0.16, m, k === 3 ? 1.6 : 0.3, 0.7);
      });
      makePad(v.ctx, v.s, v.r, { cut: 2000, attack: 0.5, release: 1.6 })(v.t, [v.deg(1), v.deg(5), v.deg(2, 1), v.deg(3, 1)], 1.3, 0.7, 1.2);
      const kit = makeKit(v.ctx, v.s, v.r);
      kit.swell(v.t, 0.48, 0.45);
      kit.boom(v.t + 0.48, 0.55);
    },
  },
  act: {
    gain: 0.46, rev: 0.5, del: 0.2, gap: 4, duck: [0.65, 4.4],
    play(v) {
      // an act ends: the four notes, the leap above them, and a choir on the home chord (I – IV – I)
      const motif = [v.deg(5), v.deg(1, 1), v.deg(2, 1), v.deg(3, 1)];
      const b = makeBell(v.ctx, v.s, { ratio: 4, index: 1.2, decay: 2.6 });
      const p = makePiano(v.ctx, v.s, v.r, { bright: 1.2 });
      motif.forEach((m, k) => {
        b(v.t + k * 0.22, m + 12, 0.5 + k * 0.06, (k - 1.5) * 0.25);
        p(v.t + k * 0.22, m, 0.4, 0.75);
        p(v.t + k * 0.22, m - 12, 0.4, 0.5);
      });
      p(v.t + 1.1, v.deg(5, 1), 2.4, 0.85);
      b(v.t + 1.1, v.deg(5, 2), 0.6);
      const pad = makePad(v.ctx, v.s, v.r, { cut: 2100, attack: 0.5, release: 1.4 });
      pad(v.t, [v.deg(1), v.deg(5), v.deg(3, 1)], 1.0, 0.7);
      pad(v.t + 1.1, [v.deg(4), v.deg(1, 1), v.deg(6, 1)], 0.75, 0.7, 1.2);
      pad(v.t + 1.9, [v.deg(1), v.deg(5), v.deg(1, 1), v.deg(3, 1)], 2.2, 0.8, 1.3);
      makeChoir(v.ctx, v.s, v.r, { attack: 0.5, release: 2 })(v.t + 1.9, [v.deg(5), v.deg(1, 1), v.deg(3, 1), v.deg(5, 1)], 1.9, 0.6, 'oh', 'ah');
      const kit = makeKit(v.ctx, v.s, v.r);
      kit.boom(v.t, 0.6);
      kit.swell(v.t + 1.1, 0.8, 0.6);
      kit.boom(v.t + 1.9, 0.8);
      [v.deg(1, 1), v.deg(3, 1), v.deg(5, 1), v.deg(1, 2), v.deg(3, 2)].forEach((m, k) => b(v.t + 1.9 + k * 0.09, m + 12, 0.42, k % 2 ? 0.5 : -0.5));
    },
  },
  start: {
    gain: 0.4, rev: 0.45, del: 0.15, gap: 1, duck: [0.3, 1.2],
    play(v) {
      // a company opens its doors: a warm chord rising, two notes of the theme
      makePad(v.ctx, v.s, v.r, { cut: 1700, attack: 0.6, release: 1.4 })(v.t, [v.deg(1), v.deg(5), v.deg(2, 1)], 1.1, 0.8, 1.2);
      const p = makePiano(v.ctx, v.s, v.r);
      p(v.t + 0.05, v.deg(5), 0.4, 0.7);
      p(v.t + 0.25, v.deg(1, 1), 1.4, 0.8);
      makeBell(v.ctx, v.s, { ratio: 4, index: 1, decay: 2 })(v.t + 0.45, v.deg(5, 1), 0.4);
      air(v, v.t, 'pink', 'bandpass', 300, 2400, 0.5, 0.3, 0.4, 0.8);
      makeKit(v.ctx, v.s, v.r).boom(v.t + 0.25, 0.4);
    },
  },
  decision: {
    gain: 0.44, rev: 0.5, del: 0.1, gap: 1.5, duck: [0.55, 2.4],
    play(v) {
      // the room goes quiet: two low notes, a chord that asks instead of answers
      const p = makePiano(v.ctx, v.s, v.r, { decay: 2.2 });
      p(v.t, v.deg(1, -1), 1.8, 0.85);
      p(v.t + 0.36, v.deg(5, -1), 1.8, 0.75);
      makePad(v.ctx, v.s, v.r, { cut: 1500, attack: 0.45, release: 1.8 })(v.t + 0.3, [v.deg(1), v.deg(4), v.deg(5), v.deg(1, 1)], 1.6, 0.8);
      makeBell(v.ctx, v.s, { ratio: 3.5, index: 0.8, decay: 2.2 })(v.t + 0.72, v.deg(5, 1), 0.38);
      makeKit(v.ctx, v.s, v.r).boom(v.t, 0.6);
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
      const slow = ctx.createBiquadFilter();
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
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.Q.value = 0.6;
        f.frequency.setValueAtTime(f0, t);
        f.frequency.linearRampToValueAtTime(f1, t + 1.6);
        f.frequency.linearRampToValueAtTime(f0 * 1.2, t + 5);
        const crackle = ctx.createGain();
        crackle.gain.value = 0.55;
        depth.connect(crackle.gain);
        const g = ctx.createGain();
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
    gain: 0.7, rev: 0.5, del: 0.4, gap: 1.5, duck: [0.3, 1.4],
    play(v) {
      // years pass: the air rises, lights run up two octaves faster and faster, and it lands
      air(v, v.t, 'pink', 'bandpass', 300, 5200, 1.35, 0.55, 1.15, 0.9);
      const b = makeBell(v.ctx, v.s, { ratio: 4, index: 1, decay: 1.2 });
      let at = 0.1;
      [[1, 0], [5, 0], [1, 1], [2, 1], [5, 1], [1, 2], [2, 2], [5, 2]].forEach(([d, o], k) => {
        b(v.t + at, v.deg(d, o), 0.3 + k * 0.04, k % 2 ? 0.5 : -0.5);
        at += 0.2 * Math.pow(0.86, k);
      });
      const kit = makeKit(v.ctx, v.s, v.r);
      kit.swell(v.t + 0.85, 0.5, 0.5);
      kit.boom(v.t + 1.35, 0.55);
    },
  },
  arc: {
    gain: 0.75, rev: 0.5, del: 0.4, gap: 0.6,
    play(v) {
      // an arc of the swarm lights: the theme's four notes as sparks, a zap, a glow
      const b = makeBell(v.ctx, v.s, { ratio: 4, index: 1.2, decay: 1.6 });
      [v.deg(5, 1), v.deg(1, 2), v.deg(2, 2), v.deg(3, 2)].forEach((m, k) => b(v.t + k * 0.06, m, 0.42 + k * 0.05, k % 2 ? 0.5 : -0.5));
      tone(v, v.t, 'sine', 220, 2600, 0.13, 0.22, 0.01);
      air(v, v.t, 'white', 'highpass', 5000, 9000, 0.5, 0.14, 0.02);
      makeKit(v.ctx, v.s, v.r).swell(v.t + 0.1, 0.3, 0.3, 5500);
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

export function sfx(id: SoundId): void {
  try {
    const ctx = audioCtx();
    const bus = mixBus('sfx');
    const def = SOUNDS[id];
    if (!ctx || !bus || !def || !audioRunning()) return;
    const now = ctx.currentTime;
    if (now - (last.get(id) ?? -99) < (def.gap ?? 0.03)) return;
    last.set(id, now);
    if (id !== 'hover') lastAt = performance.now();
    let mine = strips.get(ctx);
    if (!mine) strips.set(ctx, (mine = new Map()));
    let s = mine.get(id);
    if (!s) mine.set(id, (s = strip(ctx, bus, { gain: def.gain, rev: def.rev, del: def.del })));
    // the key of the music, kept within a fourth of D so sounds stay in their register
    const key = 62 + ((musicKey() - 62 + 5) % 12 + 12) % 12 - 5;
    def.play({ ctx, s, t: now + 0.008, r: rnd, deg: (n, oct = 0) => key + MAJOR[(n - 1) % 7] + 12 * (oct + Math.floor((n - 1) / 7)) });
    if (def.duck) duckMusic(def.duck[0], def.duck[1]);
  } catch {
    // a sound must never break the game
  }
}
