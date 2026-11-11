/**
 * The marketing score: four cues on the game's theme (so–do–re–mi and its answer), written to the bar map in
 * tools/trailer/music-map.mjs (120 BPM, a bar = 2 s).
 *
 *   trailer  92 s   D major → E major (the lift the game's ending makes), intro · garage · three grooves · resolve
 *   teaser   27 s   E major: the four notes, the full groove, the swell, home
 *   calm     18 s   D major: the theme's eight bars on felt piano and bells
 *   rise     15 s   E major: four bars of build on the four notes, one impact, home
 *
 * Every tonal sound is one of the game's instruments (src/audio/synth.ts) playing the game's tune and chords
 * (src/audio/tracks.ts: THEME, BRIDGE and the `ending` piece's progression); the hits, risers and rumbles are fx.ts.
 */
import { makeBass, makeBell, makeChoir, makeKit, makeLead, makePad, makePiano, makePluck, mtof } from '../../../src/audio/synth';
import { makeBraam, makeFx, makeSnare } from './fx';
import { BAR, STEP, bassAt, harmony, sing, tune, vAt, type HBar, type Note, type PieceDef, type Session } from './kit';

// ── the theme (as in src/audio/tracks.ts; sixteen steps a bar) ──────────────────────────────
const THEME = "5:6 1':4 2':2 3':4 | 2':12 -:4 | 1':6 3':4 2':2 1':4 | 6:12 -:4 | 5:6 1':4 2':2 3':4 | 5':8 4':4 3':4 | 2':6 4':4 3':2 2':4 | ";
const THEME_OPEN = THEME + "2':12 -:4";
const THEME_HOME = THEME + "1':16";
const BRIDGE = "6:4 1':4 3':8 | 7:4 2':4 4':6 3':2 | 3':8 2':4 1':4 | 7:12 -:4 | 6:4 1':4 3':8 | 7:4 2':4 5':8 | 5':4 4':4 3':4 2':4 | 2':12 -:4";
/** The climb into the last hit: the four notes, then on up to the leading note. */
const CLIMB = "5:4 1':4 2':4 3':4 | 5':4 6':4 7':8";

const D = 62, E = 64;

export interface Sec {
  /** MIDI note of degree 1. */
  key: number;
  ch: string;
  mel: string;
}

/** What each piece plays, section by section (also what `sanity` checks on paper). */
export const SECTIONS: Record<string, Record<string, Sec>> = {
  trailer: {
    intro: { key: D, ch: 'Dadd9 | . | Gmaj7/D | .', mel: "5:16 | 1':16 | 2':16 | 3':16" },
    garage: { key: D, ch: 'D | A/C# | Bm7 | G Asus4', mel: "5:6 1':4 2':2 3':4 | 2':12 -:4 | 1':6 3':4 2':2 1':4 | 6:12 -:4" },
    groove1: { key: D, ch: 'D | A/C# | Bm7 | G | D/F# | Gmaj7 | Em7 | Asus4 A', mel: THEME_OPEN },
    // vi, then iii stepping up into the bridge's IV (the bridge's own Bm–F#m–G, ahead of time)
    break1: { key: D, ch: 'Bm9 | F#m7', mel: "3':16 | 2':16" },
    groove2: { key: D, ch: 'Gmaj7 | A | Bm7 | F#m7 | Gmaj7 | A | Em7 | A', mel: BRIDGE },
    // the bridge's last held note (E) becomes the new key: its dominant hangs in the air over the Moon
    break2: { key: E, ch: 'Bsus4 | B', mel: "1'':16 | 5':16" },
    groove3: { key: E, ch: 'E | B/D# | C#m7 | A | E/G# | Amaj7 | F#m7 | Bsus4 B', mel: THEME_OPEN },
    swell: { key: E, ch: 'C#m7 | A B', mel: CLIMB },
    resolve: { key: E, ch: 'Eadd9 | . | Amaj7/E | . | Eadd9 | .', mel: "5:16 | 1':16 | 2':16 | 3':16 | 5:6 1':4 2':2 3':20" },
  },
  teaser: {
    intro: { key: E, ch: 'Eadd9 | .', mel: "5:8 1':8 | 2':8 3':8" },
    // the theme without its two resting bars: six bars that never stop climbing
    groove: { key: E, ch: 'E | B/D# | C#m7 | E/G# | Amaj7 | F#m7 B', mel: "5:6 1':4 2':2 3':4 | 2':12 -:4 | 1':6 3':4 2':2 1':4 | 5:6 1':4 2':2 3':4 | 5':8 4':4 3':4 | 2':6 4':4 3':2 2':4" },
    swell: { key: E, ch: 'C#m7 | A B', mel: CLIMB },
    resolve: { key: E, ch: 'Eadd9 | .', mel: "5:8 1':8 | 2':8 3':24" },
  },
  calm: {
    calm: { key: D, ch: 'D | A/C# | Bm7 | G | D/F# | Gmaj7 | Em7 A7 | Dadd9', mel: THEME_HOME },
  },
  rise: {
    build: { key: E, ch: 'C#m7 | Amaj7 | F#m7/B | E/B', mel: "5:16 | 1':16 | 2':16 | 3':16" },
    land: { key: E, ch: 'Eadd9 | .', mel: "5:6 1':4 2':2 3':20" },
  },
};

// ── the band ────────────────────────────────────────────────────────────────────────────────
function band(k: Session) {
  const { ctx, r } = k;
  const bell = makeBell(ctx, k.strip('bell', { gain: 1, rev: 0.6, del: 0.3 }), { ratio: 4, index: 1.2, decay: 3 });
  return {
    /** The groove's pad (it pumps with the kick), a slow soft one for the quiet sections, a glassy one for the Moon. */
    pad: makePad(ctx, k.strip('pad', { gain: 0.42, rev: 0.45 }), r, { cut: 2600, attack: 0.4, release: 1.1 }),
    soft: makePad(ctx, k.strip('soft', { gain: 0.3, rev: 0.5 }), r, { cut: 1900, attack: 1.2, release: 2.4 }),
    glass: makePad(ctx, k.strip('glass', { gain: 0.3, rev: 0.65 }), r, { wave: 'glass', cut: 2800, attack: 0.9, release: 2.6, detune: 12, width: 0.8 }),
    choir: makeChoir(ctx, k.strip('choir', { gain: 0.38, rev: 0.65 }), r, { attack: 0.45, release: 2.0 }),
    soprano: makeChoir(ctx, k.strip('soprano', { gain: 0.36, rev: 0.65, del: 0.12 }), r, { attack: 0.1, release: 0.6, width: 0.2 }),
    piano: makePiano(ctx, k.strip('piano', { gain: 0.6, rev: 0.4, del: 0.08 }), r, { bright: 1.25 }),
    bell,
    ring: ((t, m, _d, vel) => bell(t, m, vel)) as Note,
    lead: makeLead(ctx, k.strip('lead', { gain: 0.44, rev: 0.4, del: 0.3 }), r, { cut: 5000, attack: 0.02, release: 0.3 }),
    strings: makeLead(ctx, k.strip('strings', { gain: 0.24, rev: 0.6 }), r, { cut: 3000, attack: 0.16, release: 0.8, detune: 10 }),
    arp: makePluck(ctx, k.strip('arp', { gain: 1.15, rev: 0.25, del: 0.4 }), { cut: 5200, q: 2.2, decay: 0.2 }),
    pulse: makePluck(ctx, k.strip('pulse', { gain: 1.6, rev: 0.3, del: 0.25 }), { cut: 1500, q: 1.4, decay: 0.26 }),
    shimmer: makePluck(ctx, k.strip('shimmer', { gain: 0.8, rev: 0.5, del: 0.5 }), { wave: 'glass', cut: 6000, decay: 0.3 }),
    bass: makeBass(ctx, k.strip('bass', { gain: 0.44 }), { cut: 600, grit: 0.75, release: 0.06 }),
    sub: makeBass(ctx, k.strip('sub', { gain: 0.46 }), { cut: 260, grit: 0.25, release: 0.4 }),
    kit: makeKit(ctx, k.strip('kit', { gain: 0.75, rev: 0.14 }), r),
    /** Hats and shakers on their own strip, well above where the game keeps them: a trailer needs the air. */
    hats: makeKit(ctx, k.strip('hats', { gain: 2.6, rev: 0.1, hp: 3500 }), r),
    snare: makeSnare(ctx, k.strip('snare', { gain: 1.5, rev: 0.22 }), r),
    crash: makeKit(ctx, k.strip('crash', { gain: 0.5, rev: 0.5 }), r),
    brass: makeBraam(ctx, k.strip('brass', { gain: 0.75, rev: 0.35 }), r),
    fx: makeFx(ctx, { low: k.strip('fx-low', { gain: 0.8, rev: 0.12 }, 'fx'), air: k.strip('fx-air', { gain: 0.6, rev: 0.4 }, 'fx') }, r),
  };
}
type Band = ReturnType<typeof band>;

const KICK = { f0: 108, f1: 45, decay: 0.3, click: 0.16 };
const BIGKICK = { f0: 124, f1: 44, decay: 0.34, click: 0.24 };
/** The sub's note for a bass note: always between F1 and E2 (44–82 Hz), where a sub is felt and not heard as mud. */
const low = (m: number) => (m > 40 ? m - 12 : m);

/** A boom's resting pitch: the chord's root, down in the octave from D1 (37 Hz) to C#2. */
const boomHz = (root: number) => mtof(26 + ((((root - 26) % 12) + 12) % 12));

/** A drop: the boom (tuned to the chord's root), its crack and a cymbal, after a held breath so it lands alone. */
function impact(k: Session, B: Band, bar: number, power: number, root: number): void {
  if (bar > 0) k.gap(bar * BAR);
  k.at(bar, 0, (t) => {
    B.fx.boom(t, power, { decay: 1.3 + power, f1: Math.min(52, boomHz(root)) });
    B.fx.crash(t, power * 0.9, 1.2 + power);
    B.kit.kick(t, Math.min(1, power), BIGKICK);
  });
}

/** A run on the drums into the next bar line: `div` hits a step, growing from `v0` to `v1`. */
function roll(k: Session, bar: number, from: number, to: number, div: number, v0: number, v1: number, hit: (t: number, vel: number, x: number) => void): void {
  const n = Math.round((to - from) * div);
  for (let j = 0; j < n; j++) {
    const x = j / Math.max(1, n - 1);
    k.at(bar, from + j / div, (t) => hit(t, v0 + (v1 - v0) * x, x));
  }
}

/** A whoosh that peaks on a bar line (the picture cuts there). */
function sweep(k: Session, B: Band, bar: number, vel: number, side = 0.5): void {
  k.atT(bar * BAR - 0.5, (t) => B.fx.whoosh(t, 0.8, vel, side));
}

/** Strike the bar's chord (or its two) on a sustaining instrument. */
function chordsOn(k: Session, bar: number, h: HBar, play: (t: number, notes: number[], dur: number) => void): void {
  if (h.fresh) k.at(bar, 0, (t) => play(t, h.v, (h.v2 ? 8 : 16 * h.hold) * STEP));
  if (h.v2) k.at(bar, 8, (t) => play(t, h.v2!, 8 * STEP));
}

// ── sections ────────────────────────────────────────────────────────────────────────────────
/** Almost nothing: a low drone, air, and the four notes on a bell with the felt piano under it. */
function intro(k: Session, B: Band, bar0: number, sec: Sec): void {
  const H = harmony(sec.ch), T = tune(sec.mel, sec.key), len = H.length * BAR;
  const root = H[0].bass;
  k.at(bar0, 0, (t) => {
    B.fx.boom(t, 0.3, { f0: 72, f1: boomHz(root), drop: 0.5, decay: 3.2, bright: 0 });
    B.soft(t, [root + 12, root + 19], len - 0.4, 0.5, 0.42);
    B.sub(t, root, len - 0.5, 0.42);
    B.fx.air(t, len + 1, 0.035);
  });
  H.forEach((h, i) => chordsOn(k, bar0 + i, h, (t, notes, dur) => B.soft(t, notes, dur, 0.36, 0.85)));
  T.forEach((n, j) => {
    k.at(bar0, n.at, (t) => B.bell(t, n.m + 12, 0.6, j % 2 ? 0.25 : -0.25));
    k.at(bar0, n.at, (t) => B.piano(t, n.m, n.len * STEP, 0.6));
  });
}

/** Warm and small: the piano states the theme's first phrase; an eighth-note pulse starts under it and grows. */
function garage(k: Session, B: Band, bar0: number, sec: Sec): void {
  const H = harmony(sec.ch), T = tune(sec.mel, sec.key), n = H.length;
  sing(k, bar0, T, B.piano, 0.9);
  for (const nt of T) if (nt.len >= 4) k.at(bar0, nt.at, (t) => B.bell(t, nt.m + 12, 0.28));
  H.forEach((h, i) => {
    const bar = bar0 + i;
    chordsOn(k, bar, h, (t, notes, dur) => B.soft(t, notes, dur, 0.46, 0.9 + 0.1 * i));
    k.at(bar, 0, (t) => B.sub(t, low(h.bass), (h.v2 ? 7 : 14) * STEP, 0.6));
    if (h.v2) k.at(bar, 8, (t) => B.sub(t, low(h.bass2), 7 * STEP, 0.6));
    // the piano's left hand, in quarters
    for (let s = 0; s < 16; s += 4) {
      const v = vAt(h, s), k2 = (s / 4) % 4;
      const m = k2 === 0 || (h.v2 && s === 8) ? bassAt(h, s) + 12 : v[k2 === 2 ? 2 : 1];
      k.at(bar, s, (t) => B.piano(t, m, 6 * STEP, (k2 === 0 ? 0.44 : 0.3) * (0.9 + k.r() * 0.2)));
    }
    // the pulse: the chord's outer notes in eighths, opening as it goes
    for (let s = 0; s < 16; s += 2) {
      const q = (i * 16 + s) / (n * 16), v = vAt(h, s);
      k.at(bar, s, (t) => B.pulse(t, s % 4 === 0 ? v[0] : v[2], 0.14 + 0.3 * q, s % 4 ? 0.3 : -0.3, 0.6 + 1.1 * q));
    }
    // a heartbeat from the third bar, a shaker in the fourth
    if (i >= 2) for (const s of [0, 8]) k.at(bar, s, (t) => B.kit.kick(t, 0.42 + 0.14 * (i - 2), { f0: 92, f1: 44, decay: 0.26 }));
    if (i === n - 1) for (let s = 0; s < 16; s += 2) k.at(bar, s, (t) => B.hats.shaker(t, 0.2 + s * 0.02));
  });
  // into the drop: a riser and a snare run across the last bar
  const last = bar0 + n - 1;
  k.at(last, 0, (t) => {
    B.fx.riser(t, BAR, 0.6, { note: sec.key - 17, octs: 1, pow: 2.6 });
    B.crash.swell(t, BAR - 0.06, 0.5);
  });
  roll(k, last, 8, 15.5, 1, 0.12, 0.5, (t, vel) => B.kit.snare(t, vel));
}

interface GrooveOpts {
  tier: 1 | 2 | 3;
  /** Bar (in the section) where a layer joins or the music lifts. */
  lift?: number;
  /** What the last bar runs into: a cut-out (a fill, then silence) or the swell (no stop). */
  into: 'cut' | 'swell';
  /** The drums tighten over the last two bars (snare on every beat, then on every eighth). */
  accel?: boolean;
}

/** The beat: drums, bass, sixteenth plucks, a pumping pad, the tune in the lead. Three sizes. */
function groove(k: Session, B: Band, bar0: number, sec: Sec, o: GrooveOpts): void {
  const H = harmony(sec.ch), T = tune(sec.mel, sec.key), n = H.length;
  const { tier } = o;
  const lift = o.lift ?? n;
  // the tune: the lead; in the bigger grooves an octave of strings; at full bloom sopranos, bells and the piano too
  sing(k, bar0, T, B.lead, 0.8 + 0.04 * tier);
  if (tier >= 2) {
    // strings in octaves round the lead: violins above, cellos below (the body of the tune)
    sing(k, bar0, T, B.strings, 0.62, 12);
    sing(k, bar0, T, B.strings, 0.7, -12);
  }
  if (tier === 3) {
    sing(k, bar0, T, B.piano, 0.66, 0);
    sing(k, bar0, T, B.piano, 0.5, -12);
    sing(k, bar0, T, B.ring, 0.46, 12);
    for (const nt of T) k.at(bar0, nt.at, (t) => B.soprano(t, [nt.m], nt.len * STEP * 0.95, 0.5, 'ah', 'ah'));
  }
  for (const nt of T) {
    const i = Math.floor(nt.at / 16);
    if (tier === 1) k.at(bar0, nt.at, (t) => B.piano(t, nt.m, nt.len * STEP, 0.62));
    if (tier === 1 && i >= lift) k.at(bar0, nt.at, (t) => B.strings(t, nt.m + 12, nt.len * STEP * 0.96, 0.58));
    if (tier < 3 && nt.len >= 4 && (tier === 2 || i >= lift)) k.at(bar0, nt.at, (t) => B.bell(t, nt.m + 12, 0.42));
  }
  // the answer: where the tune holds a long note, bells climb the chord under it
  for (const nt of T) {
    const i = Math.floor(nt.at / 16);
    if (nt.len < 12 || nt.at % 16 !== 0 || i === n - 1) continue;
    const v = H[i].v, loud = tier > 1 || i >= lift ? 0.4 : 0.28;
    [v[0], v[1], v[2], v[3], v[0] + 12].forEach((m, j) => k.at(bar0 + i, 6 + j * 2, (t) => B.bell(t, m + 12, loud + 0.02 * j, j % 2 ? 0.45 : -0.45, 0.7)));
  }
  H.forEach((h, i) => {
    const bar = bar0 + i, p = i / n, up = i >= lift, last = i === n - 1;
    const bright = 1 + 0.35 * p + 0.15 * (tier - 1);
    chordsOn(k, bar, h, (t, notes, dur) => B.pad(t, notes, dur, 0.6 + 0.05 * tier, bright, { every: 4 * STEP, depth: 0.5 }));
    if (tier === 3) chordsOn(k, bar, h, (t, notes, dur) => B.choir(t, notes, dur, 0.56 + 0.14 * p, 'oh', 'ah'));
    if (tier === 2 && up) chordsOn(k, bar, h, (t, notes, dur) => B.choir(t, notes, dur, 0.45, 'oo', 'oh'));
    // bass: driving eighths with an octave skip, a long sub under them
    for (let s = 0; s < 16; s += 2) k.at(bar, s, (t) => B.bass(t, bassAt(h, s) + 12 + (s % 8 === 6 ? 12 : 0), 1.5 * STEP, s % 4 === 0 ? 0.85 : 0.6));
    k.at(bar, 0, (t) => B.sub(t, low(h.bass), (h.v2 ? 7 : 14) * STEP, 0.62 + 0.06 * tier));
    if (h.v2) k.at(bar, 8, (t) => B.sub(t, low(h.bass2), 7 * STEP, 0.62 + 0.06 * tier));
    // low brass: every bar in the second groove, every other in the third
    if (tier === 2) k.at(bar, 0, (t) => B.brass(t, h.bass, 11 * STEP, i % 4 === 0 ? 0.8 : 0.55, 1 + 0.3 * p));
    if (tier === 3 && i % 2 === 0) k.at(bar, 0, (t) => B.brass(t, h.bass, 12 * STEP, i % 4 === 0 ? 0.8 : 0.6, 1.2));
    // sixteenth plucks up and down the chord, the filter opening through the section
    const pat = [0, 1, 2, 3, 1, 2, 3, 2];
    for (let s = 0; s < 16; s++) {
      const v = vAt(h, s), notes = [...v, v[0] + 12];
      k.at(bar, s, (t) => B.arp(t, notes[pat[s % 8] % notes.length] + 12, s % 4 === 0 ? 0.66 : 0.46, s % 2 ? 0.4 : -0.4, 0.8 + 0.5 * p + 0.15 * (tier - 1)));
    }
    // lights: high glass plucks from the lift on (always, at full bloom)
    if (tier === 3 || (tier === 2 && up)) for (let s = 0; s < 16; s += tier === 3 && p >= 0.5 ? 1 : 2) {
      const v = vAt(h, s);
      k.at(bar, s, (t) => B.shimmer(t, v[(s * 3 + i) % v.length] + 24, 0.26 + k.r() * 0.2, s % 2 ? 0.6 : -0.6));
    }
    // drums
    const kick = tier === 1 ? KICK : BIGKICK;
    for (const s of [0, 4, 8, 12]) k.at(bar, s, (t) => B.kit.kick(t, tier === 1 ? 0.88 : 0.96, kick));
    if (tier >= 2 && i % 2 === 1) k.at(bar, 14, (t) => B.kit.kick(t, 0.55, kick));
    if (tier === 3) k.at(bar, 7, (t) => B.kit.kick(t, 0.5, kick));
    const tight = o.accel && i >= n - 2;
    for (const s of tight ? [0, 4, 8, 12] : [4, 12]) {
      k.at(bar, s, (t) => B.kit.clap(t, tier === 1 ? 0.45 : 0.4));
      if (tier === 1) k.at(bar, s, (t) => B.kit.snare(t, 0.45));
      else k.at(bar, s, (t) => B.snare(t, tier === 2 ? 0.62 : 0.72));
    }
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 2) k.at(bar, s, (t) => B.hats.hat(t, 0.5, tier >= 2 || up));
      else if (s % 2 === 1 || tier >= 2) k.at(bar, s, (t) => B.hats.hat(t, (s % 2 ? 0.17 : 0.3) + k.r() * 0.08));
      k.at(bar, s, (t) => B.hats.shaker(t, (s % 2 ? 0.26 : 0.44) * (up || tier === 3 ? 1 : 0.6)));
    }
    if (tier >= 2 && (up || tier === 3)) for (const s of [6, 14]) k.at(bar, s, (t) => B.kit.tom(t, 0.42, s === 6 ? 128 : 104, 0.24));
    if (tier === 3 && !tight) k.at(bar, 15, (t) => B.snare(t, 0.14));
    // cymbals: on the lift, and every other bar once things are big
    if (i > 0 && (i === lift || (tier === 3 && i % 2 === 0))) k.at(bar, 0, (t) => B.fx.crash(t, i === lift ? 0.6 : 0.42, 1.4));
    // fills
    if (tier >= 2 && i % 4 === 3 && !last) roll(k, bar, 12, 16, 1, 0.3, 0.6, (t, vel, x) => B.kit.tom(t, vel, 150 - x * 50, 0.22));
    if (last) {
      if (o.into === 'cut' && tier === 1) roll(k, bar, 12, 16, 1, 0.3, 0.7, (t, vel) => B.kit.snare(t, vel));
      else if (o.into === 'cut') roll(k, bar, 8, 16, 1, 0.3, 0.7, (t, vel, x) => (B.snare(t, vel * 0.5), x > 0.5 && B.kit.tom(t, vel * 0.7, 140 - x * 40, 0.2)));
      else roll(k, bar, o.accel ? 2 : 8, 16, o.accel ? 0.5 : 1, 0.25, 0.6, (t, vel) => B.snare(t, vel * 0.6));
    }
  });
}

/** Drums out: a held chord, one bell, and a riser across the section into the next drop. */
function hush(k: Session, B: Band, bar0: number, sec: Sec, o: { glassy: boolean; riserFrom: number; riser: number; drums: boolean }): void {
  const H = harmony(sec.ch), T = tune(sec.mel, sec.key), n = H.length;
  k.at(bar0, 0, (t) => B.fx.subdrop(t, 1.5, 0.4));
  H.forEach((h, i) => {
    const bar = bar0 + i;
    if (o.glassy) {
      // high and cold: the chord an octave up on glass, the faintest warmth under it
      k.at(bar, 0, (t) => B.glass(t, h.v.map((m) => m + 12), 16 * STEP, 0.5, 1 + 0.4 * i));
      k.at(bar, 0, (t) => B.soft(t, h.v, 16 * STEP, 0.22, 0.7));
    } else {
      k.at(bar, 0, (t) => B.pad(t, h.v, 16 * STEP, 0.4, 0.8 + 0.5 * i));
      k.at(bar, 0, (t) => B.choir(t, h.v, 15 * STEP, 0.26 + 0.14 * i, 'oo', i ? 'ah' : 'oh'));
      k.at(bar, 0, (t) => B.sub(t, low(h.bass), 15 * STEP, 0.5));
      // the piano lets the chord fall
      [h.bass + 12, ...h.v].forEach((m, j) => k.at(bar, 0, (t) => B.piano(t + j * 0.02, m, 12 * STEP, 0.4 - j * 0.04)));
    }
  });
  T.forEach((nt, j) => k.at(bar0, nt.at, (t) => B.bell(t, nt.m, o.glassy ? 0.6 : 0.5, j % 2 ? 0.3 : -0.3, 1.3)));
  const from = bar0 + o.riserFrom, dur = (n - o.riserFrom) * BAR;
  k.at(from, 0, (t) => {
    B.fx.riser(t, dur, o.riser, { note: sec.key - 17 + (o.glassy ? 12 : 0), octs: o.glassy ? 1 : 2, pow: 3.2 });
    B.crash.swell(t, dur - 0.06, 0.5);
  });
  if (o.drums) {
    // the roll: toms in eighths, snare in sixteenths, then thirty-seconds to the bar line
    const b = bar0 + n - 1;
    roll(k, b, 0, 8, 0.5, 0.14, 0.3, (t, vel) => B.kit.tom(t, vel, 98, 0.3));
    roll(k, b, 8, 14, 1, 0.1, 0.24, (t, vel) => B.snare(t, vel));
    roll(k, b, 14, 15.5, 2, 0.22, 0.4, (t, vel) => B.snare(t, vel));
  }
}

/** The rhythm drops to a roll; everything else swells for two bars and stops a breath before the hit. */
function swell(k: Session, B: Band, bar0: number, sec: Sec): void {
  const H = harmony(sec.ch), T = tune(sec.mel, sec.key);
  k.at(bar0, 0, (t) => {
    B.fx.boom(t, 0.55, { bright: 0.6, decay: 1.6, f1: boomHz(sec.key) });
    B.fx.crash(t, 0.6, 1.6);
    B.fx.riser(t, 2 * BAR, 1, { note: sec.key - 17, octs: 2, trem: [3, 15] });
    B.crash.swell(t, 2 * BAR - 0.06, 0.75);
  });
  sing(k, bar0, T, B.lead, 0.85);
  sing(k, bar0, T, B.strings, 0.75, 12);
  sing(k, bar0, T, B.ring, 0.5, 12);
  sing(k, bar0, T, B.piano, 0.8);
  for (const nt of T) k.at(bar0, nt.at, (t) => B.soprano(t, [nt.m], nt.len * STEP * 0.95, 0.7, 'oh', 'ah'));
  H.forEach((h, i) => {
    const bar = bar0 + i;
    chordsOn(k, bar, h, (t, notes, dur) => B.pad(t, notes, dur, 0.66, 1.2 + 0.3 * i));
    chordsOn(k, bar, h, (t, notes, dur) => B.choir(t, notes, dur, 0.5 + 0.2 * i, 'oo', 'ah'));
    k.at(bar, 0, (t) => B.sub(t, low(h.bass), (h.v2 ? 7 : 15) * STEP, 0.7));
    k.at(bar, 0, (t) => B.brass(t, h.bass, (h.v2 ? 7 : 15) * STEP, 0.5 + 0.1 * i, 1 + 0.3 * i));
    if (h.v2) {
      k.at(bar, 8, (t) => B.sub(t, low(h.bass2), 7 * STEP, 0.75));
      k.at(bar, 8, (t) => B.brass(t, h.bass2, 7 * STEP, 0.7, 1.5));
    }
    // the pulse: eighths, then sixteenths
    for (let s = 0; s < 16; s += i ? 1 : 2) {
      const v = vAt(h, s), q = (i * 16 + s) / 32;
      k.at(bar, s, (t) => B.arp(t, v[(s >> (i ? 0 : 1)) % v.length] + 12, 0.36 + 0.3 * q, s % 2 ? 0.4 : -0.4, 0.9 + 0.7 * q));
      k.at(bar, s, (t) => B.hats.shaker(t, 0.16 + 0.3 * q));
    }
    k.at(bar, 0, (t) => B.kit.kick(t, 0.9, BIGKICK));
    if (i) for (const s of [4, 8, 12]) k.at(bar, s, (t) => B.kit.kick(t, 0.7 + s * 0.02, BIGKICK));
  });
  // the roll, tuned to the bass: eighths, sixteenths, and thirty-seconds on the snare for the last beat
  roll(k, bar0, 0, 16, 0.5, 0.3, 0.5, (t, vel) => B.kit.tom(t, vel, 104, 0.3));
  roll(k, bar0 + 1, 0, 12, 1, 0.4, 0.75, (t, vel, x) => (B.kit.tom(t, vel, 104 + x * 30, 0.22), B.snare(t, vel * 0.3)));
  roll(k, bar0 + 1, 12, 15.5, 2, 0.3, 0.55, (t, vel) => B.snare(t, vel));
}

/**
 * Home: the biggest hit, the tonic chord ringing under choir, brass and bells, and the tune in `sec.mel` on bells,
 * piano and sopranos, a far drum under each of its notes. `thin` = the tune note (by index) from which only the
 * piano and a bell are left.
 */
function home(k: Session, B: Band, bar0: number, sec: Sec, o: { power: number; thin?: number; shimmerAt?: number; rumble?: number }): void {
  const H = harmony(sec.ch), T = tune(sec.mel, sec.key), n = H.length;
  const thin = o.thin ?? T.length;
  const thinBar = T.length > thin ? Math.floor(T[thin].at / 16) : n;
  const root = H[0].bass;
  impact(k, B, bar0, o.power, root);
  k.at(bar0, 0, (t) => {
    B.kit.boom(t, 0.9);
    B.fx.crash(t, 0.7, 3.4);
    B.brass(t, root, 3.6, 1, 1.6);
    B.brass(t, root + 12, 3, 0.6, 1.8);
    if (o.rumble) B.fx.rumble(t, o.rumble, 0.8);
  });
  H.forEach((h, i) => {
    const bar = bar0 + i, q = Math.min(1, i / Math.max(1, thinBar));
    if (!h.fresh) return;
    const dur = 16 * h.hold * STEP, tailing = i >= thinBar;
    k.at(bar, 0, (t) => B.pad(t, h.v, dur, tailing ? 0.42 : 0.8 - 0.25 * q, 1.7 - 0.6 * q));
    if (!tailing) {
      k.at(bar, 0, (t) => B.choir(t, h.v, dur - 0.3, 1 - 0.4 * q, 'oh', 'ah'));
      k.at(bar, 0, (t) => B.choir(t, [h.v[2] + 12, h.v[3] + 12], dur - 0.3, 0.5 - 0.2 * q, 'ah', 'ah'));
      for (const m of h.v) k.at(bar, 0, (t) => B.strings(t, m + 12, dur - 0.2, 0.5 - 0.2 * q));
    }
    k.at(bar, 0, (t) => B.sub(t, low(h.bass), dur - 0.4, tailing ? 0.45 : 0.85 - 0.2 * q));
    // the piano: a low octave and the chord, rolled
    [h.bass, h.bass + 12, ...h.v].forEach((m, j) => k.at(bar, 0, (t) => B.piano(t + (j > 1 ? (j - 1) * 0.018 : 0), m, dur, (tailing ? 0.42 : 0.75) - j * 0.03)));
  });
  T.forEach((nt, j) => {
    const dur = nt.len * STEP, late = j >= thin;
    k.at(bar0, nt.at, (t) => B.bell(t, nt.m + 12, late ? 0.5 : 0.78, j % 2 ? 0.3 : -0.3, 1.2));
    k.at(bar0, nt.at, (t) => B.piano(t, nt.m, dur, late ? 0.7 : 0.95));
    if (late) return;
    k.at(bar0, nt.at, (t) => B.bell(t, nt.m, 0.55, 0, 1.2));
    k.at(bar0, nt.at, (t) => B.piano(t, nt.m + 12, dur, 0.6));
    k.at(bar0, nt.at, (t) => B.lead(t, nt.m, Math.min(dur, 3) * 0.95, 0.7));
    k.at(bar0, nt.at, (t) => B.soprano(t, [nt.m], Math.min(dur, 3) * 0.95, 0.8, 'ah', 'ah'));
    k.at(bar0, nt.at, (t) => B.strings(t, nt.m + 12, Math.min(dur, 3), 0.7));
    // a far drum under every note after the first (the hit itself is the first)
    if (j > 0) k.at(bar0, nt.at, (t) => (B.kit.boom(t, 0.5 - 0.08 * j), B.fx.crash(t, 0.3 - 0.05 * j, 1.6)));
  });
  // the groove's plucks keep going, thinning: the machine winding down
  const fadeBars = Math.min(n, thinBar, 4);
  for (let i = 0; i < fadeBars; i++) {
    const h = H[i];
    for (let s = 0; s < 16; s++) {
      const q = (i * 16 + s) / (fadeBars * 16);
      if (s % 2 && q > 0.45) continue;
      k.at(bar0 + i, s, (t) => B.arp(t, h.v[s % h.v.length] + 12, (s % 4 === 0 ? 0.6 : 0.42) * (1 - q) ** 0.7, s % 2 ? 0.4 : -0.4, 1.5 - 0.8 * q));
      if (q < 0.5) k.at(bar0 + i, s, (t) => B.hats.shaker(t, 0.3 * (1 - 2 * q)));
      k.at(bar0 + i, s, (t) => B.shimmer(t, h.v[(s * 3 + i) % h.v.length] + 24, (0.42 + k.r() * 0.15) * (1 - q) ** 0.6, s % 2 ? 0.6 : -0.6, 1.2));
    }
  }
  if (o.shimmerAt !== undefined) {
    // the logo: a warm bell and light climbing the chord
    const h = H[o.shimmerAt], bar = bar0 + o.shimmerAt;
    k.at(bar, 0, (t) => B.crash.swell(t, 0.06, 0.3));
    [...h.v, h.v[0] + 12, h.v[1] + 12, h.v[2] + 12].forEach((m, j) => k.at(bar, j, (t) => B.shimmer(t, m + 12, 0.5 - j * 0.03, j % 2 ? 0.5 : -0.5, 1.2)));
    [...h.v, h.v[0] + 12].forEach((m, j) => k.at(bar, j * 2, (t) => B.bell(t, m + 12, 0.3, j % 2 ? 0.45 : -0.45)));
  }
}

// ── the four pieces ─────────────────────────────────────────────────────────────────────────
const S = SECTIONS;

const trailer: PieceDef = {
  bars: 44, tail: 4, seed: 2026, level: { music: 0.36, fx: 0.5 },
  build(k) {
    const B = band(k), s = S.trailer;
    // the rides: how loud the band is, section by section (the story the loudness curve has to tell)
    k.ride(0, 0.9, 0.01);
    k.ride(4 * BAR, 0.88, 0.4);
    k.ride(6 * BAR, 0.95, 2 * BAR - 0.2);
    k.ride(8 * BAR - 0.05, 1.22, 0.04);
    k.ride(16 * BAR, 0.52, 0.05);
    k.ride(18 * BAR - 0.05, 1.14, 0.04);
    k.ride(26 * BAR, 0.6, 0.05);
    k.ride(28 * BAR - 0.05, 1.15, 0.04);
    k.ride(28 * BAR + 0.1, 1.32, 8 * BAR - 0.2);
    k.ride(36 * BAR + 0.1, 1.4, 2 * BAR - 0.3);
    k.ride(38 * BAR - 0.05, 1.55, 0.04);
    k.ride(38 * BAR + 1, 1.15, 3);
    k.ride(40 * BAR, 0.95, 2 * BAR);

    intro(k, B, 0, s.intro);
    k.at(3, 0, (t) => B.crash.swell(t, BAR, 0.2, 3200));
    garage(k, B, 4, s.garage);
    impact(k, B, 8, 0.8, D);
    groove(k, B, 8, s.groove1, { tier: 1, lift: 4, into: 'cut' });
    k.at(12, 0, (t) => B.fx.boom(t, 0.4, { bright: 0.5, decay: 1.2, f1: boomHz(D) }));
    hush(k, B, 16, s.break1, { glassy: false, riserFrom: 0, riser: 0.7, drums: true });
    impact(k, B, 18, 0.9, 31);
    groove(k, B, 18, s.groove2, { tier: 2, lift: 4, into: 'cut' });
    sweep(k, B, 20, 0.3, -0.5);
    // liftoff: the impact and a rumble that lasts two bars under the music
    sweep(k, B, 22, 0.5, 0.6);
    impact(k, B, 22, 0.95, 31);
    k.at(22, 0, (t) => B.fx.rumble(t, 2.4 * BAR, 0.9));
    sweep(k, B, 24, 0.3, -0.5);
    hush(k, B, 26, s.break2, { glassy: true, riserFrom: 1, riser: 0.85, drums: false });
    impact(k, B, 28, 1.05, E);
    k.at(28, 0, (t) => B.brass(t, 40, 14 * STEP, 0.9, 1.4));
    groove(k, B, 28, s.groove3, { tier: 3, lift: 4, into: 'swell', accel: true });
    for (const b of [30, 32, 34]) sweep(k, B, b, 0.3, b % 4 ? 0.5 : -0.5);
    k.at(32, 0, (t) => B.fx.boom(t, 0.5, { bright: 0.6, decay: 1.2, f1: boomHz(E) }));
    swell(k, B, 36, s.swell);
    home(k, B, 38, s.resolve, { power: 1.3, thin: 4, shimmerAt: 2 });
    // the last word: the tonic low on the piano and one high bell
    k.at(43, 0, (t) => {
      B.piano(t, 28, 3, 0.5);
      B.piano(t, 40, 3, 0.5);
      B.bell(t, 88, 0.36, 0, 1.3);
    });
  },
};

const teaser: PieceDef = {
  bars: 12, tail: 3, seed: 2027, level: { music: 0.36, fx: 0.5 },
  build(k) {
    const B = band(k), s = S.teaser;
    k.ride(0, 0.7, 0.01);
    k.ride(2 * BAR - 0.05, 0.9, 0.04);
    // the groove never stops growing, and the swell carries on from it
    k.ride(2 * BAR + 0.1, 1.15, 6 * BAR - 0.3);
    k.ride(8 * BAR + 0.1, 1.28, 2 * BAR - 0.3);
    k.ride(10 * BAR - 0.05, 1.42, 0.04);
    k.ride(10 * BAR + 1, 1.1, 3);
    intro(k, B, 0, s.intro);
    k.at(1, 8, (t) => {
      B.fx.riser(t, 8 * STEP, 0.7, { note: 47, octs: 1 });
      B.crash.swell(t, 8 * STEP - 0.06, 0.5);
    });
    roll(k, 1, 12, 15.5, 1, 0.2, 0.5, (t, vel) => B.kit.snare(t, vel));
    impact(k, B, 2, 1, E);
    k.at(2, 0, (t) => B.brass(t, 40, 14 * STEP, 0.9, 1.4));
    groove(k, B, 2, s.groove, { tier: 3, lift: 3, into: 'swell', accel: true });
    // liftoff
    sweep(k, B, 5, 0.5, 0.6);
    k.at(5, 0, (t) => {
      B.fx.boom(t, 0.7, { decay: 1.6, f1: boomHz(E) });
      B.fx.rumble(t, 1.5 * BAR, 0.7);
    });
    swell(k, B, 8, s.swell);
    home(k, B, 10, s.resolve, { power: 1.3, shimmerAt: 1 });
  },
};

const calm: PieceDef = {
  bars: 8, tail: 2, seed: 2028, level: { music: 0.7, fx: 0.6 },
  build(k) {
    const B = band(k), s = S.calm.calm;
    const H = harmony(s.ch), T = tune(s.mel, s.key), n = H.length;
    k.at(0, 0, (t) => {
      B.kit.boom(t, 0.4);
      B.fx.air(t, 17, 0.08);
    });
    sing(k, 0, T, B.piano, 0.82);
    for (const nt of T) if (nt.len >= 4) k.at(0, nt.at, (t) => B.bell(t, nt.m + 12, nt.at % 16 === 0 ? 0.55 : 0.42, k.r() * 0.6 - 0.3));
    H.forEach((h, i) => {
      chordsOn(k, i, h, (t, notes, dur) => B.soft(t, notes, dur, 0.56, 0.95 + 0.05 * i));
      k.at(i, 0, (t) => B.sub(t, h.bass, (h.v2 ? 7 : 14) * STEP, 0.4));
      if (h.v2) k.at(i, 8, (t) => B.sub(t, h.bass2, 7 * STEP, 0.4));
      const lastBar = i === n - 1;
      // the left hand in quarters; in the last bar it climbs back toward the tune's first note
      for (let st = 0; st < 16; st += 4) {
        const v = vAt(h, st), k2 = (st / 4) % 4;
        const m = lastBar ? [h.bass + 12, h.bass + 19, s.key + 2, s.key + 4][k2] : k2 === 0 || (h.v2 && st === 8) ? bassAt(h, st) + 12 : v[k2 === 2 ? 2 : 1];
        k.at(i, st, (t) => B.piano(t, m, 6 * STEP, (k2 === 0 ? 0.46 : 0.32) * (0.9 + k.r() * 0.2)));
      }
      // a light pulse: off-beat eighths on the chord
      if (!lastBar) for (let st = 2; st < 16; st += 4) {
        const v = vAt(h, st);
        k.at(i, st, (t) => B.pulse(t, v[(st >> 2) % 2 ? 3 : 2], 0.24, st % 8 === 2 ? -0.35 : 0.35, 1.2));
      }
      if (i >= 4 && !lastBar) for (let st = 0; st < 16; st += 2) k.at(i, st, (t) => B.hats.shaker(t, st % 4 === 2 ? 0.2 : 0.1));
    });
    // night falls: the lights come on
    const h6 = H[6];
    k.at(6, 0, (t) => B.crash.swell(t, 0.05, 0.16));
    for (let st = 0; st < 16; st++) {
      const v = vAt(h6, st);
      k.at(6, st, (t) => B.shimmer(t, v[st % v.length] + (st % 4 === 3 ? 36 : 24), 0.3 + 0.012 * st, st % 2 ? 0.6 : -0.6, 1.1));
    }
    // the last chord: bells climb it
    H[7].v.forEach((m, j) => k.at(7, 2 + j * 2, (t) => B.bell(t, m + 12, 0.34, j % 2 ? 0.4 : -0.4)));
  },
};

const rise: PieceDef = {
  bars: 6, tail: 3, seed: 2029, level: { music: 0.36, fx: 0.5 },
  build(k) {
    const B = band(k), s = S.rise;
    const H = harmony(s.build.ch), T = tune(s.build.mel, s.build.key);
    k.ride(0, 0.6, 0.01);
    k.ride(0.1, 1, 4 * BAR - 0.3);
    k.ride(4 * BAR - 0.05, 1.25, 0.04);
    k.ride(4 * BAR + 1, 1, 3);
    k.at(0, 0, (t) => {
      B.fx.boom(t, 0.4, { f0: 72, f1: boomHz(E), drop: 0.5, decay: 3, bright: 0 });
      // one riser for the whole wait, its tremolo tightening from a slow beat to a blur
      B.fx.riser(t, 4 * BAR, 1, { note: 47, octs: 2, trem: [2, 16], pow: 2.6 });
    });
    k.at(2, 0, (t) => B.crash.swell(t, 2 * BAR - 0.06, 0.7));
    // the four notes, one to a bar, each time with more behind them
    T.forEach((nt, j) => {
      k.at(0, nt.at, (t) => B.bell(t, nt.m + 12, 0.6 + 0.05 * j, j % 2 ? 0.3 : -0.3));
      k.at(0, nt.at, (t) => B.piano(t, nt.m, nt.len * STEP, 0.7 + 0.06 * j));
      k.at(0, nt.at, (t) => B.lead(t, nt.m, nt.len * STEP * 0.96, 0.5 + 0.1 * j));
      if (j >= 2) k.at(0, nt.at, (t) => B.strings(t, nt.m + 12, nt.len * STEP * 0.96, 0.5 + 0.1 * j));
      if (j >= 1) k.at(0, nt.at, (t) => B.soprano(t, [nt.m], nt.len * STEP * 0.95, 0.45 + 0.1 * j, 'oo', 'ah'));
    });
    H.forEach((h, i) => {
      k.at(i, 0, (t) => B.pad(t, h.v, 16 * STEP, 0.55 + 0.06 * i, 0.8 + 0.25 * i));
      if (i >= 1) k.at(i, 0, (t) => B.choir(t, h.v, 15.5 * STEP, 0.35 + 0.15 * i, 'oo', i === 3 ? 'ah' : 'oh'));
      k.at(i, 0, (t) => B.sub(t, low(h.bass), 15 * STEP, 0.6 + 0.05 * i));
      if (i >= 2) k.at(i, 0, (t) => B.brass(t, h.bass, 15 * STEP, 0.4 + 0.2 * (i - 2), 0.9 + 0.4 * (i - 2)));
      // the pulse tightens: quarters, eighths, sixteenths
      const every = [4, 2, 1, 1][i];
      for (let st = 0; st < 16; st += every) {
        const q = (i * 16 + st) / 64;
        k.at(i, st, (t) => B.arp(t, h.v[(st / every) % h.v.length] + 12, 0.34 + 0.34 * q, (st / every) % 2 ? 0.4 : -0.4, 0.7 + 0.9 * q));
        k.at(i, st, (t) => B.pulse(t, h.bass + 24, 0.14 + 0.16 * q, 0, 0.7 + 0.8 * q));
      }
      // a heartbeat that doubles, hats that fill in
      for (let st = 0; st < 16; st += [8, 4, 4, 2][i]) k.at(i, st, (t) => B.kit.kick(t, 0.6 + 0.08 * i, KICK));
      if (i >= 1) for (let st = i >= 3 ? 1 : 2; st < 16; st += i >= 3 ? 2 : 4) k.at(i, st, (t) => B.hats.hat(t, 0.24 + 0.08 * i));
    });
    roll(k, 2, 0, 16, 0.5, 0.25, 0.45, (t, vel) => B.kit.tom(t, vel, 104, 0.3));
    roll(k, 3, 0, 12, 1, 0.35, 0.7, (t, vel, x) => (B.kit.tom(t, vel, 104 + x * 30, 0.22), B.snare(t, vel * 0.3)));
    roll(k, 3, 12, 15.5, 2, 0.3, 0.55, (t, vel) => B.snare(t, vel));
    // the moment
    home(k, B, 4, s.land, { power: 1.3, rumble: 2.2 * BAR });
  },
};

export const PIECES: Record<string, PieceDef> = { trailer, teaser, calm, rise };
