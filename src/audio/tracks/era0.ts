/**
 * era0 "Garage Days" (Act I: the garage, 2027): feel-good garage funk and neo-soul in F major, 94 bpm, swung
 * sixteenths, laid back. Three friends, a rented rack, a dream.
 *
 * The band: a Rhodes through its Suitcase tremolo (rootless maj9, m9 and 9sus4 voicings, comped around the tune), a
 * clavinet riff locked with a fingered P-bass (ghost notes, octave pops, chromatic approaches into every change), a
 * dry 70s funk kit (kick on 1 and the "a" of 2, the backbeat a hair late, ghost notes round it, sixteenth hats, an
 * open hat on the "and" of 4), the whistle singing the theme an octave up, vibes answering it in the gaps and
 * doubling it in octaves later, the vinyl's dust under everything.
 *
 *   intro  Rhodes alone, then the bass and a kick-snare pickup      vamp   the clav and bass riff, Rhodes stabs
 *   a      the theme (open) on the whistle, vibes answering         a2     whistle and vibes in octaves, fuller
 *   b      the bridge: kick and cross-stick, the bass walks          brk    drums out, Rhodes and bass fills, a fill
 *   a3     the theme, everything, a tambourine on the backbeat     out    the vamp thinning to the Rhodes
 *   solo   (later passes) the vibes and the whistle trade two-bar phrases over the groove; brk4 a longer breath
 *
 * The first pass is built for the two-minute preview: the last theme comes home at 1:57.
 * Paused (core only): the Rhodes holds its chords with the root under them and the whistle and vibes still sing.
 * Fast clock (drive): a tambourine on the sixteenths and a second clav through a wah.
 */
import { hum, last, voicingAt, type Note } from '../arrange';
import type { Bar, SecDef, Setup, TrackDef } from '../cinematic';
import { chords, melody, type Chord, type MelNote } from '../score';
import { crackle } from '../synth';
import { BRIDGE, HOOK, roman, THEME_HOME, THEME_OPEN } from '../theme';
import { makeFunkKit, makePercussion, type FunkKit } from '../voices/drums';
import { keysChord, makeClav, makeEPiano, type ClavNote, type EPNote } from '../voices/keys';
import { makeVibes, type Mallet } from '../voices/mallets';
import { makeElectricBass } from '../voices/plucked';
import { makeWhistle, type Wind } from '../voices/winds';

const F = (line: string) => roman(line, 'F');
/** The hook's notes, for the vibes' last word in the outro. */
const HOOK_NOTES = melody(HOOK, 16);

const SECS: Record<string, SecDef> = {
  intro: { ch: F('Imaj9 | IVmaj9 | Imaj9 | ii9 V9sus4') },
  vamp: { ch: F('Imaj9 | IVmaj9 | Imaj9 | ii9 V9sus4') },
  a: { ch: F('Imaj9 | IVmaj9 | vi9 | V9sus4 | IVmaj9 | vi9 | ii9 | V9sus4'), mel: THEME_OPEN },
  a2: { ch: F('Imaj9 | IVmaj9 | vi9 | V9sus4 | IVmaj9 | vi9 | ii9 V9sus4 | Imaj9'), mel: THEME_HOME },
  b: { ch: F('IVmaj9 | V9 | iii7 | vi9 | ii9 | Imaj7/3 | IVmaj9 | V7sus4 V9'), mel: BRIDGE },
  brk: { ch: F('IVmaj9 | ii9 V9sus4') },
  brk4: { ch: F('IVmaj9 | Imaj7/3 | ii9 | V9sus4') },
  a3: { ch: F('Imaj9 | IVmaj9 | vi9 | V9sus4 | IVmaj9 | vi9 | ii9 V9sus4 | Imaj9'), mel: THEME_HOME },
  out: { ch: F('Imaj9 | IVmaj9 | Imaj9 | IVmaj9 | Imaj9'), mel: HOOK },
  solo: { ch: F('Imaj9 | IVmaj9 | Imaj9 | IVmaj9 | vi9 | V9sus4 | IVmaj9 | ii9 V9sus4') },
};

/** Every section's chords, bar by bar (the arranger needs the second chord of a bar and the next bar's root). */
const BARS: Record<string, Chord[][]> = Object.fromEntries(Object.entries(SECS).map(([k, s]) => [k, chords(s.ch)]));

// ── small helpers ───────────────────────────────────────────────────────────────────────────
type Bass = (t: number, m: number, dur: number, vel: number, mute?: boolean) => void;

/** The chord sounding at a step. */
const chAt = (c: Bar, step: number): Chord => {
  const bar = BARS[c.sec][c.i];
  return bar[1] && step >= c.steps / 2 ? bar[1] : bar[0];
};
/** The next bar's first chord (into the next section at the end of this one). */
const nextCh = (c: Bar): Chord => {
  const bars = BARS[c.sec];
  return c.i + 1 < bars.length ? bars[c.i + 1][0] : (BARS[c.next] ?? bars)[0][0];
};
/** A pitch class in the octave from `lo`. */
const inOct = (pc: number, lo: number) => lo + (((pc - lo) % 12) + 12) % 12;

/** The chord's pentatonic, semitones above its root: what the riffs and fills are made of. */
function penta(ch: Chord): number[] {
  const t = ch.tones.map((x) => x % 12);
  if (t.includes(3)) return [0, 3, 5, 7, 10];
  if (t.includes(4)) return t.includes(10) ? [0, 2, 4, 7, 10] : [0, 2, 4, 7, 9];
  return [0, 2, 5, 7, 10];
}
/** Pentatonic degree `k` (5 = the octave) of the chord, from its root in the octave above `lo`. */
const pn = (ch: Chord, k: number, lo: number) => {
  const p = penta(ch);
  return inOct(ch.root, lo) + p[((k % 5) + 5) % 5] + 12 * Math.floor(k / 5);
};

/** No semitone at the top of a voicing (a 9 rubbing on the b3 up top grates): the top note drops an octave. */
function tidy(v: number[]): number[] {
  const out = [...v].sort((a, b) => a - b);
  for (let k = 0; k < 3 && out.length > 2 && out[out.length - 1] - out[out.length - 2] === 1; k++) {
    out.unshift(out.pop()! - 12);
    out.sort((a, b) => a - b);
  }
  return out;
}

/** Hits from a string, one character a step: a digit is the velocity in tenths, `x` full, `.` a rest. */
function hits(p: string, fn: (step: number, vel: number) => void): void {
  const s = p.replace(/\s/g, '');
  for (let i = 0; i < s.length; i++) if (s[i] !== '.') fn(i, s[i] === 'x' ? 1 : Number(s[i]) / 10);
}

// ── the drums ───────────────────────────────────────────────────────────────────────────────
const KICKS = ['9... ...8 ..7. ....', '9... ...8 ..7. ..5.', '9..5 ...8 ..6. ....', '9... ...8 .... ..6.'];
const GHOSTS = ['...2 ..2. .2.3 ...2', '..2. ...2 .3.2 .2..', '...2 .2.. .2.3 ..2.'];
/** The backbeat sits a few milliseconds behind: the garage leans back. */
const LATE = 0.009;

type Groove = 'full' | 'light' | 'rim' | 'hats';

function drums(c: Bar, kit: FunkKit, g: Groove, o: { vel?: number; open?: boolean; fill?: 0 | 1 | 2; kick?: number; crash?: boolean } = {}) {
  const v = o.vel ?? 1, fill = o.fill ?? 0;
  const stop = fill === 2 ? 8 : fill === 1 ? 12 : 16;
  if (o.crash) c.at(0, (t) => kit.crash(t, 0.78 * v));
  // hats: sixteenths with the beat leaning in (light: eighths), an open one on the "and" of 4
  if (g === 'full' || g === 'hats' || g === 'light') {
    const open = o.open && fill < 2;
    const pat = g === 'light' ? '5.3. 5.3. 5.3. 5.3.' : '6343 6343 6343 6343';
    hits(pat, (s, h) => {
      if (s >= stop && !(fill === 1 && s < 14)) return;
      if (open && s === 14) return c.at(14, (t) => kit.hat(t, 0.52 * v, 'open'), true);
      if (open && s === 15) return;
      c.at(s, (t) => kit.hat(t, hum(c, (s === 0 && !o.crash ? 0.66 : h) * v, 0.1)), true);
    });
  }
  if (g === 'rim') {
    // the bridge: kick, cross-stick, the foot keeping time
    hits('9... ...6 ..5. ....', (s, k) => s < stop && c.at(s, (t) => kit.kick(t, k * v)));
    for (const s of [4, 12]) if (s < stop) c.at(s, (t) => kit.snare(t + LATE, hum(c, 0.62 * v), 'cross'), true);
    for (const s of [4, 12]) c.at(s, (t) => kit.hat(t, 0.32 * v, 'pedal'));
    hits('.... .... ..2. ...2', (s, gv) => s < stop && c.at(s, (t) => kit.snare(t + LATE, gv * v, 'ghost'), true));
  } else if (g !== 'hats') {
    hits(KICKS[o.kick ?? 0], (s, k) => s < stop && c.at(s, (t) => kit.kick(t, k * v)));
    for (const s of [4, 12]) if (s < stop) c.at(s, (t) => kit.snare(t + LATE, hum(c, (g === 'light' ? 0.7 : 0.88) * v, 0.06)), true);
    if (g === 'full') hits(GHOSTS[(c.n + (o.kick ?? 0)) % GHOSTS.length], (s, gv) => s < stop && c.at(s, (t) => kit.snare(t + LATE, hum(c, gv * v * 1.1, 0.2), 'ghost'), true));
  }
  if (fill === 1) {
    // a small one: ghosts rising into the bar line
    hits('.... .... .... 2468', (s, f) => c.at(s, (t) => kit.snare(t + LATE, f * v, f < 0.5 ? 'ghost' : 'center'), true));
  } else if (fill === 2) {
    // round the toms and back to the snare, the kick under the last beat
    c.at(8, (t) => kit.snare(t + LATE, 0.8 * v), true);
    c.at(9, (t) => kit.snare(t + LATE, 0.36 * v, 'ghost'), true);
    c.at(10, (t) => kit.tom(t, 0.82 * v, 'high'), true);
    c.at(11, (t) => kit.tom(t, 0.62 * v, 'high'), true);
    c.at(12, (t) => kit.tom(t, 0.84 * v, 'mid'), true);
    c.at(13, (t) => kit.snare(t + LATE, 0.5 * v, 'ghost'), true);
    c.at(14, (t) => kit.tom(t, 0.9 * v, 'floor'), true);
    c.at(15, (t) => kit.snare(t + LATE, 0.86 * v), true);
    c.at(14, (t) => kit.kick(t, 0.8 * v));
  }
}

/** The breakdown's way back in: a roll from ghosts to full, round the toms, four on the floor under it. */
function bigFill(c: Bar, kit: FunkKit) {
  hits('2233 4455 6677 ....', (s, f) => c.at(s, (t) => kit.snare(t + LATE, f, f < 0.5 ? 'ghost' : 'center'), true));
  c.at(12, (t) => kit.tom(t, 0.9, 'high'), true);
  c.at(13, (t) => kit.tom(t, 0.86, 'mid'), true);
  c.at(14, (t) => kit.tom(t, 0.92, 'floor'), true);
  c.at(15, (t) => kit.tom(t, 0.95, 'floor'), true);
  for (const s of [0, 4, 8, 12]) c.at(s, (t) => kit.kick(t, 0.62 + s * 0.02));
  for (const s of [2, 6, 10]) c.at(s, (t) => kit.hat(t, 0.3, 'pedal'));
}

/** The intro's count-in: soft eighths on the hats, and on the last bar a kick-and-snare pickup into the groove. */
function countIn(c: Bar, kit: FunkKit, pickup: boolean) {
  hits('4.3. 4.3. 4.3. 4.3.', (s, h) => (!pickup || s < 12) && c.at(s, (t) => kit.hat(t, hum(c, h * 0.9, 0.1)), true));
  if (!pickup) return;
  c.at(8, (t) => kit.kick(t, 0.72));
  c.at(11, (t) => kit.snare(t + LATE, 0.3, 'ghost'), true);
  c.at(12, (t) => kit.snare(t + LATE, 0.78), true);
  c.at(13, (t) => kit.snare(t + LATE, 0.34, 'ghost'), true);
  c.at(14, (t) => kit.kick(t, 0.8));
  c.at(14, (t) => kit.snare(t + LATE, 0.6), true);
  c.at(15, (t) => kit.snare(t + LATE, 0.92), true);
}

// ── the bass ────────────────────────────────────────────────────────────────────────────────
const LOW = 29; // F1: the tonic is the bass's lowest home

/**
 * The funk line, a half-bar figure for each chord: the root long on its downbeat, a ghost, the octave popped, the
 * root again with the kick on the "a" of 2, and into the next chord by a semitone from below.
 */
function funkBass(c: Bar, play: Bass, vel = 1, alt = 0) {
  const two = !!c.v2;
  const N = inOct(nextCh(c).bass, LOW);
  if (!two) {
    const ch = chAt(c, 0), R = inOct(ch.bass, LOW), p = penta(ch);
    const line: [number, number, number, number, boolean][] = alt
      ? [[0, R, 2.6, 0.92, false], [3, R, 0.5, 0.3, true], [4, R + 12, 0.8, 0.7, false], [6, R + 12, 0.8, 0.78, false], [7, R, 1.6, 0.84, false], [10, R + p[3], 1.6, 0.76, false], [12, R, 0.5, 0.3, true], [13, R + p[4], 0.9, 0.7, false]]
      : [[0, R, 2.6, 0.92, false], [3, R, 0.5, 0.32, true], [6, R + 12, 0.8, 0.78, false], [7, R, 1.6, 0.84, false], [10, R, 1.8, 0.8, false], [12, R, 0.5, 0.3, true], [13, R + p[3], 0.9, 0.7, false]];
    if (N !== R) line.push([14, R + p[3] + (alt ? 5 : 0), 0.9, 0.66, false], [15, N - 1, 0.9, 0.74, false]);
    else line.push([14, R + 12, 0.9, 0.72, false], [15, R + p[4], 0.9, 0.64, false]);
    for (const [s, m, l, v, g] of line) c.at(s, (t) => play(t, m, c.dur(l) * 0.92, hum(c, v * vel, 0.06), g), true);
    return;
  }
  // two chords: the figure in half the time
  const A = chAt(c, 0), B = chAt(c, 8), RA = inOct(A.bass, LOW), RB = inOct(B.bass, LOW);
  const line: [number, number, number, number, boolean][] = [
    [0, RA, 2.6, 0.9, false], [3, RA, 0.5, 0.3, true], [5, RA + 12, 0.8, 0.74, false], [6, RA + 12, 0.8, 0.6, true], [7, RB - 1, 0.9, 0.7, false],
    [8, RB, 2.6, 0.88, false], [11, RB, 0.5, 0.3, true], [12, RB + 12, 0.8, 0.76, false], [13, RB + penta(B)[3], 0.9, 0.68, false],
    [14, RB + 12, 0.8, 0.64, true], [15, N - 1, 0.9, 0.74, false],
  ];
  for (const [s, m, l, v, g] of line) c.at(s, (t) => play(t, m, c.dur(l) * 0.92, hum(c, v * vel, 0.06), g), true);
}

/** The bridge's walk: quarters through the chord tones, a chromatic step into the next bar, a ghosted skip. */
function walkBass(c: Bar, play: Bass) {
  const N = inOct(nextCh(c).bass, LOW);
  const A = chAt(c, 0), RA = inOct(A.bass, LOW);
  const third = (ch: Chord) => (ch.tones.includes(4) ? 4 : ch.tones.includes(3) ? 3 : 5);
  const notes: [number, number][] = c.v2
    ? [[0, RA], [4, RA + 7], [8, inOct(chAt(c, 8).bass, LOW)], [12, N + (N > 40 ? -1 : 1)]]
    : [[0, RA], [4, RA + third(A)], [8, RA + 7], [12, N + (c.i % 2 ? 1 : -1)]];
  // a slash chord walks from its own bass
  for (const [s, m] of notes) c.at(s, (t) => play(t, m, c.dur(3.5), hum(c, s === 0 ? 0.86 : 0.74, 0.06)), true);
  if (c.i % 2 === 0) c.at(14, (t) => play(t, notes[3][1], c.dur(0.5), 0.28, true), true);
}

/** The breakdown: the bass sings, the root long and a climb through the chord's pentatonic. */
function fillBass(c: Bar, play: Bass) {
  const ch = chAt(c, 0), R = inOct(ch.bass, LOW);
  if (!last(c)) {
    c.at(0, (t) => play(t, R, c.dur(6), 0.88), true);
    c.at(6, (t) => play(t, R + 12, c.dur(1.5), 0.7), true);
    const climb = c.i % 2 ? [3, 4, 5, 6] : [1, 2, 3, 5];
    climb.forEach((k, j) => c.at(8 + j * 2, (t) => play(t, pn(ch, k, R), c.dur(j === 3 ? 2 : 1.6), hum(c, 0.66 + j * 0.04)), true));
    return;
  }
  // the last bar: the root, then down the scale with the drums' roll into the tonic
  c.at(0, (t) => play(t, R, c.dur(3), 0.9), true);
  c.at(3, (t) => play(t, R, c.dur(0.5), 0.3, true), true);
  c.at(6, (t) => play(t, R + 12, c.dur(1.5), 0.74), true);
  [48, 46, 43, 41, 38, 36, 31, 30].forEach((m, j) => c.at(8 + j, (t) => play(t, m, c.dur(0.9), hum(c, 0.62 + j * 0.035)), true));
}

// ── the clavinet ────────────────────────────────────────────────────────────────────────────
/** One bar of the riff: [step, pentatonic degree (null = a muted chick), velocity]. Off the bass's notes, on the backbeat. */
const RIFFS: [number, number | null, number][][] = [
  [[1, null, 0.6], [2, 3, 0.7], [3, 4, 0.42], [4, 5, 0.92], [5, null, 0.62], [7, null, 0.58], [8, 3, 0.68], [9, null, 0.5], [11, 4, 0.62], [12, 5, 0.9], [13, null, 0.6], [14, 3, 0.66], [15, null, 0.55]],
  [[1, null, 0.6], [2, 3, 0.7], [3, 4, 0.42], [4, 5, 0.92], [5, null, 0.62], [6, 6, 0.7], [7, 5, 0.48], [9, null, 0.55], [10, 4, 0.68], [11, 3, 0.55], [12, 2, 0.84], [13, null, 0.6], [14, 1, 0.62], [15, 2, 0.6]],
];
/** Under the tune the clav keeps out of the way: chicks on the backbeat and a double stop on the "a" of 2. */
const SPARSE: [number, number | null, number][] = [[3, null, 0.5], [4, null, 0.72], [7, 5, 0.6], [11, null, 0.5], [12, null, 0.72], [15, 3, 0.5]];
/** The clav's break: up the scale and back, everything accented. */
const BREAK: [number, number | null, number][][] = [
  [[0, 0, 0.9], [1, null, 0.6], [2, 1, 0.7], [3, 2, 0.8], [4, 3, 0.95], [5, null, 0.6], [6, 3, 0.62], [7, 4, 0.82], [8, 5, 0.95], [9, null, 0.62], [10, 4, 0.7], [11, 3, 0.66], [12, 5, 0.92], [13, 6, 0.72], [14, 7, 0.9], [15, null, 0.6]],
  [[0, 8, 0.95], [1, null, 0.6], [2, 7, 0.72], [3, 5, 0.7], [4, 6, 0.88], [5, null, 0.6], [6, 5, 0.7], [7, 3, 0.8], [8, 4, 0.92], [9, null, 0.58], [10, 3, 0.66], [11, 2, 0.6], [12, 3, 0.86], [13, null, 0.6], [14, 0, 0.72], [15, null, 0.62]],
];
const CLAV_LO = 50;

function clavRiff(c: Bar, play: ClavNote, riff: [number, number | null, number][], vel = 1) {
  for (const [s, k, v] of riff) {
    const ch = chAt(c, s);
    if (k === null) c.at(s, (t) => play(t, pn(ch, 3, CLAV_LO), c.dur(0.6), hum(c, v * vel), true), true);
    else c.at(s, (t) => play(t, pn(ch, k, CLAV_LO), c.dur(v > 0.8 ? 1.4 : 0.8), hum(c, v * vel)), true);
  }
}

/** The second clav (drive), through the wah: a sixteenth scratch with double stops off the Rhodes' top notes. */
function wahClav(c: Bar, play: ClavNote) {
  hits('.4.6 .4.8 .4.6 .48.', (s, v) => {
    const top = tidy(voicingAt(c, s)).slice(-2);
    if (v >= 0.6) top.forEach((m) => c.at(s, (t) => play(t, m, c.dur(1), v, false, 0.7), true));
    else c.at(s, (t) => play(t, top[0], c.dur(0.5), v, true), true);
  });
}

// ── the Rhodes ──────────────────────────────────────────────────────────────────────────────
/** Comping: [step, length in steps, velocity, top notes only]. */
type Comp = [number, number, number, boolean][];
const COMP: Record<string, Comp> = {
  // the vamp: a short one on the 1, stabs on the off-beats
  stabs: [[0, 2.5, 0.56, false], [3, 1, 0.32, true], [6, 1.5, 0.5, false], [10, 1.5, 0.46, false], [14, 1.6, 0.52, false]],
  stabs2: [[0, 2.5, 0.56, false], [6, 1.2, 0.48, false], [7, 0.8, 0.3, true], [10, 1.5, 0.48, false], [13, 1, 0.34, true], [14, 1.6, 0.54, false]],
  // under the tune: the chord laid on the 1 and let ring, a ghosted top on the "and" of 2, a push on the "a" of 3
  push: [[0, 5.5, 0.5, false], [6, 1.2, 0.32, true], [11, 2.6, 0.44, false], [14, 1.6, 0.38, true]],
  push2: [[0, 3, 0.5, false], [3, 2.5, 0.4, false], [8, 2, 0.34, true], [11, 4.5, 0.44, false]],
};

function comp(c: Bar, ep: EPNote, r: () => number, p: Comp, vel = 1) {
  for (const [s, l, v, top] of p) {
    const v0 = tidy(voicingAt(c, s));
    const notes = top ? v0.slice(-3) : v0;
    // a stab never rings across the chord change
    const len = c.v2 && s < 8 ? Math.min(l, 8 - s) : l;
    c.at(s, (t) => keysChord(ep, r, t, notes, c.dur(len) * 0.95, hum(c, v * vel, 0.08), top ? 0.004 : 0.009), true);
  }
}

/** The chord held (paused, the bridge, the breakdown, the ends), the root under it from the left hand. */
function hold(c: Bar, ep: EPNote, r: () => number, vel: number, root = true) {
  const play = (s: number, len: number) => {
    const v = tidy(voicingAt(c, s));
    const lh = inOct(chAt(c, s).bass, 41);
    c.at(s, (t) => {
      // held legato: the dampers fall just after the next chord is struck, so the harmony never gaps
      if (root) ep(t, lh, c.dur(len) * 1.02, vel * 0.9, -0.15, 0.7);
      keysChord(ep, r, t + 0.012, v, c.dur(len) * 1.02, vel, 0.022);
    }, true);
  };
  if (c.v2) {
    play(0, 8);
    play(8, 8);
  } else if (c.fresh) play(0, 16 * c.hold);
  else {
    // a chord held over the bar line: the top re-struck softly on the 3 so it doesn't fade to nothing
    const v = tidy(c.v).slice(-2);
    c.at(8, (t) => keysChord(ep, r, t, v, c.dur(8), vel * 0.6, 0.01), true);
  }
}

/** A run up top on the Rhodes (the right hand between the chords): notes from the chord's pentatonic. */
function lick(c: Bar, ep: EPNote, from: number, ks: number[], vel: number, every = 1) {
  ks.forEach((k, j) => {
    const s = from + j * every;
    c.at(s, (t) => ep(t, pn(chAt(c, s), k, 65), c.dur(every * 1.4), hum(c, vel), 0.25), true);
  });
}

// ── the tune ────────────────────────────────────────────────────────────────────────────────
/**
 * The whistle's phrasing: tongued on the beat and after a rest, the quick notes of the 3+3+2 slurred, the long ones
 * leaning in a little.
 */
function whistle(c: Bar, play: Wind, vel: number, oct = 12) {
  const mel = c.mel;
  mel.forEach((n, j) => {
    const prev = j > 0 ? mel[j - 1] : null, next = mel[j + 1];
    const slurs = (a: MelNote | null | undefined, b: MelNote | undefined) => !!a && !!b && a.at + a.len === b.at && b.at % 4 !== 0 && b.len <= 3;
    const slur = slurs(prev, n);
    const legato = slurs(n, next) ? 1.04 : n.len >= 8 ? 0.93 : 0.88;
    const v = vel * (n.at === 0 ? 1.04 : 0.95) * (n.len >= 4 ? 1 : 0.92) * (0.95 + c.r() * 0.1);
    c.at(n.at, (t) => play(t, c.tonic + n.semi + oct, c.dur(n.len) * legato, Math.min(0.95, v), slur), true);
  });
}

/** The bar's tune on the vibes (a fresh stroke a note, the motor turning). */
function vibesTune(c: Bar, vib: Mallet, vel: number, oct = 0) {
  for (const n of c.mel) c.at(n.at, (t) => vib(t, c.tonic + n.semi + oct, c.dur(Math.max(2, n.len)), hum(c, vel * (n.at === 0 ? 1 : 0.9), 0.08)), true);
}

/**
 * The vibes answer the whistle while it holds a note: three strokes on the 3+3+2, from the chord's tones below the
 * held note, rising or falling.
 */
function answer(c: Bar, vib: Note, vel: number, up: boolean, from = 8) {
  const held = c.mel.find((n) => n.at <= from && n.at + n.len > from);
  const cap = (held ? c.tonic + held.semi + 12 : 84) - 3;
  const v = voicingAt(c, from);
  const pool = [...new Set([...v, ...v.map((m) => m + 12)])].filter((m) => m >= 62 && m <= cap).sort((a, b) => a - b).slice(-3);
  if (pool.length < 2) return;
  const notes = up ? pool : [...pool].reverse();
  const at = from === 8 ? [8, 11, 14] : [12, 14];
  notes.slice(0, at.length).forEach((m, j) => c.at(at[j], (t) => vib(t, m, c.dur(j === notes.length - 1 ? 6 : 3), hum(c, vel * (j === 2 ? 1 : 0.88))), true));
}

// ── the solo (later passes): the vibes and the whistle trade two-bar phrases ─────────────────────
/** The key's pentatonic (F G A C D): it sits on every chord of the piece, so a phrase may cross any change. */
const KEY_PENTA = [0, 2, 4, 7, 9];
const pk = (base: number, k: number) => base + KEY_PENTA[((k % 5) + 5) % 5] + 12 * Math.floor(k / 5);
/** A phrase's bar: [step, length, pentatonic index from the base, velocity, a blue grace from a semitone below]. */
type Lick = [number, number, number, number, boolean?][];
/** First bars of a phrase: the hook's 3+3+2 grown into lines. */
const CALLS: Lick[] = [
  [[0, 3, 3, 0.8], [3, 3, 5, 0.72], [6, 2, 6, 0.74], [8, 5, 7, 0.86, true], [14, 2, 6, 0.6]],
  [[2, 2, 5, 0.7], [4, 2, 6, 0.8], [6, 1, 5, 0.6], [7, 3, 3, 0.74], [10, 2, 4, 0.7], [12, 4, 5, 0.84]],
  [[0, 2, 7, 0.84], [3, 1, 7, 0.6], [4, 2, 7, 0.78], [6, 2, 6, 0.66], [8, 2, 5, 0.8], [11, 3, 7, 0.8, true], [14, 2, 8, 0.7]],
  [[0, 2, 2, 0.72], [2, 2, 3, 0.7], [4, 2, 4, 0.76], [6, 2, 5, 0.72], [8, 6, 7, 0.88, true]],
];
/** Second bars: the line comes down and lands on a long note. */
const ANSWERS: Lick[] = [
  [[0, 2, 8, 0.82], [2, 2, 7, 0.7], [4, 1, 6, 0.64], [5, 1, 5, 0.6], [6, 2, 4, 0.7], [8, 8, 2, 0.8, true]],
  [[0, 3, 5, 0.78], [3, 3, 4, 0.7], [6, 2, 3, 0.72], [8, 8, 0, 0.8]],
  [[1, 1, 6, 0.6], [2, 2, 5, 0.76], [6, 1, 6, 0.6], [7, 3, 5, 0.78], [10, 6, 3, 0.76]],
  [[0, 1, 9, 0.8], [1, 1, 8, 0.6], [2, 1, 7, 0.66], [3, 1, 6, 0.6], [4, 2, 5, 0.74], [6, 2, 4, 0.7], [8, 8, 2, 0.82]],
];

/** One bar of the solo on the vibes, or on the whistle moved up the scale until it sits where it sang the theme (C5 up). */
function soloBar(c: Bar, lick: Lick, vib: Mallet, wh: Wind, onWhistle: boolean) {
  const low = Math.min(...lick.map((n) => n[2]));
  let shift = 0;
  while (onWhistle && pk(65, low + shift) < 72) shift++;
  lick.forEach(([s, len, k, v, grace], j) => {
    const m = pk(65, k + shift);
    const next = lick[j + 1];
    const slur = onWhistle && j > 0 && lick[j - 1][0] + lick[j - 1][1] === s && len <= 2;
    c.at(s, (t) => {
      const g = grace ? c.dur(0.5) : 0;
      if (onWhistle) {
        if (grace) wh(t, m - 1, g, v * 0.8, false);
        wh(t + g, m, c.dur(len) * (next && next[0] === s + len ? 1.02 : 0.9) - g, Math.min(0.95, v * 0.92), grace ? true : slur);
      } else {
        if (grace) vib(t, m - 1, g, v * 0.62);
        vib(t + g, m, c.dur(Math.max(2, len)), hum(c, v * 0.86, 0.06));
      }
    }, true);
  });
}

// ── the piece ───────────────────────────────────────────────────────────────────────────────
export const track: TrackDef = {
  bpm: 94, steps: 16, beat: 4, swing: 0.16, tonic: 53, delay: 3, lo: 53, hi: 71, size: 4, bassLo: LOW, gain: 0.85,
  secs: SECS,
  form: (pass, r) => {
    if (pass === 0) return ['intro', 'vamp', 'a', 'vamp', 'a2', 'b', 'brk', 'a3', 'out'];
    const forms = [
      ['vamp', 'a', 'vamp', 'a2', 'solo', 'b', 'brk4', 'a3', 'out'],
      ['intro', 'a2', 'solo', 'b', 'brk', 'a3', 'out'],
      ['vamp', 'a', 'b', 'brk4', 'a2', 'vamp', 'solo', 'a3', 'out'],
      ['intro', 'vamp', 'a', 'solo', 'vamp', 'b', 'brk', 'a3', 'out'],
      ['vamp', 'solo', 'a2', 'b', 'brk4', 'a3', 'out'],
    ];
    return forms[Math.floor(r() * forms.length)];
  },
  setup(k: Setup) {
    const { ctx, r } = k;
    const dust = crackle(ctx, k.strip('dust', { gain: 0.2, lp: 6000, hp: 400 }), r);
    k.onStop(() => dust.stop());
    const ep = makeEPiano(ctx, k.strip('rhodes', { gain: 0.64, rev: 0.16, del: 0.05 }), r, { model: 'rhodes', tremolo: 3.6, chorus: 0.25, tone: 1.12, onStop: k.onStop });
    const wh = makeWhistle(ctx, k.strip('whistle', { gain: 0.48, rev: 0.24, del: 0.12 }), r);
    const vib = makeVibes(ctx, k.strip('vibes', { gain: 0.42, rev: 0.22, del: 0.08, pan: 0.26 }), r, { motor: 5.2, depth: 0.35, onStop: k.onStop });
    const clav = makeClav(ctx, k.strip('clav', { gain: 0.56, group: 'rhythm', rev: 0.05, pan: -0.42 }), r, { pickup: 'both', tone: 1.15 });
    const bass = makeElectricBass(ctx, k.strip('bass', { gain: 1.1, group: 'rhythm', rev: 0.02 }), r, { warm: [28, 53] });
    const kit = makeFunkKit(ctx, k.strip('kit', { gain: 0.72, group: 'rhythm', rev: 0.07 }), r);
    // the last theme's lift: a tambourine on the backbeat, someone in the garage joining in
    const tamb = makePercussion(ctx, k.strip('tamb', { gain: 0.36, group: 'rhythm', rev: 0.08, pan: 0.38 }), r);
    const perc = makePercussion(ctx, k.strip('tambourine', { gain: 0.4, group: 'drive', rev: 0.05 }), r, { pan: { tambourine: 0.45 } });
    const wah = makeClav(ctx, k.strip('clav-wah', { gain: 0.42, group: 'drive', rev: 0.07, pan: 0.5 }), r, { pickup: 'bright', wah: 0.75 });

    return (c) => {
      const { sec, i } = c;
      const band = !c.mood.calm;
      const drive = band && c.mood.drive > 0.04;
      const x = c.x;
      const phraseEnd = i % 4 === 3;
      const brkSec = sec === 'brk' || sec === 'brk4';

      // ── the Rhodes ──
      if (!band) hold(c, ep, r, 0.46);
      else if (sec === 'intro') {
        if (i < 2) hold(c, ep, r, 0.62);
        else comp(c, ep, r, COMP.push, 0.95);
        // the right hand teases the theme's first four notes on its 3+3+2, and answers it over the IV
        if (i === 0) {
          lick(c, ep, 8, [3, 5], 0.5, 3);
          lick(c, ep, 14, [6], 0.5, 2);
        }
        if (i === 1) {
          c.at(0, (t) => ep(t, 81, c.dur(6), hum(c, 0.54), 0.25), true);
          lick(c, ep, 8, [3, 5, 6], 0.46, 3);
        }
      } else if (sec === 'vamp') {
        const brk = c.turn % 2 === 1 && i >= 2;
        if (!brk) comp(c, ep, r, i % 2 ? COMP.stabs2 : COMP.stabs);
        else if (last(c)) comp(c, ep, r, [[8, 6, 0.5, false]]);
      } else if (sec === 'a' || sec === 'a2' || sec === 'a3') comp(c, ep, r, (i + (x[1] > 0.5 ? 1 : 0)) % 2 ? COMP.push2 : COMP.push, sec === 'a3' ? 1.05 : 1);
      else if (sec === 'solo') comp(c, ep, r, i % 2 ? COMP.push2 : COMP.push, 0.9);
      else if (sec === 'b') hold(c, ep, r, 0.44, false);
      else if (brkSec) {
        hold(c, ep, r, 0.5);
        if (!last(c)) lick(c, ep, 8, i % 2 ? [6, 5, 3, 2] : [2, 3, 5, 6], 0.44, 2);
      } else if (sec === 'out') {
        if (i < 3) comp(c, ep, r, i % 2 ? COMP.stabs2 : COMP.stabs, 1 - i * 0.1);
        else hold(c, ep, r, i === 4 ? 0.52 : 0.46);
      }

      // ── the tune ──
      if (sec === 'a') {
        const vibesLead = x[0] > 0.65;
        if (vibesLead) vibesTune(c, vib, 0.62, 12);
        else whistle(c, wh, 0.74);
        if (i % 2 === 1 && i < 7) answer(c, vibesLead ? (t, m, d, v) => wh(t, m + 12, d, v * 0.9) : vib, 0.55, i % 4 === 1);
        if (i === 7) answer(c, vib, 0.52, true, 12);
      } else if (sec === 'a2' || sec === 'a3') {
        whistle(c, wh, sec === 'a3' ? 0.84 : 0.78);
        vibesTune(c, vib, sec === 'a3' ? 0.6 : 0.54, 0);
      } else if (sec === 'b') {
        whistle(c, wh, 0.72);
        if (i === 3 || i === 7) answer(c, vib, 0.5, i === 3, 12);
      } else if (sec === 'solo') {
        // trading twos: a call and its answer on one instrument, then the other's turn
        const onWhistle = (Math.floor(i / 2) + (x[4] > 0.5 ? 1 : 0)) % 2 === 1;
        const pool = i % 2 ? ANSWERS : CALLS;
        soloBar(c, pool[Math.floor(c.r() * pool.length)], vib, wh, onWhistle);
      } else if (sec === 'out' && i === 0) whistle(c, wh, 0.66);
      else if (sec === 'out' && i === 2) {
        for (const n of HOOK_NOTES) c.at(n.at, (t) => vib(t, c.tonic + n.semi + 12, c.dur(Math.max(2, n.len)), hum(c, 0.5)), true);
      } else if (!band && (sec === 'vamp' || sec === 'intro') && i % 2 === 0) {
        // paused, the vamps keep a voice: the vibes hum the hook
        for (const n of HOOK_NOTES) c.at(n.at, (t) => vib(t, c.tonic + n.semi + 12, c.dur(Math.max(2, n.len)), hum(c, 0.42)), true);
      }

      if (!band) return;

      // ── the bass ──
      if (sec === 'intro') {
        if (i >= 2) funkBass(c, bass, 0.85);
      } else if (sec === 'b') walkBass(c, bass);
      else if (brkSec) fillBass(c, bass);
      else if (sec === 'vamp' && c.turn % 2 === 1 && i === 2) {
        // the clav's break: the bass only marks the one
        c.at(0, (t) => bass(t, inOct(c.ch.bass, LOW), c.dur(3), 0.9), true);
      } else if (sec === 'out' && i >= 3) {
        if (i === 3) c.at(0, (t) => bass(t, inOct(c.ch.bass, LOW), c.dur(12), 0.8), true);
      } else funkBass(c, bass, sec === 'a' ? 0.92 : 1, (i + (x[3] > 0.5 ? 1 : 0)) % 4 === 2 ? 1 : 0);

      // ── the clav ──
      const riff = RIFFS[(i + (x[2] > 0.5 ? 1 : 0)) % 2];
      if (sec === 'vamp') {
        if (c.turn % 2 === 1 && i >= 2) clavRiff(c, clav, BREAK[i - 2], 1);
        else clavRiff(c, clav, riff);
      } else if (sec === 'a' || sec === 'solo') clavRiff(c, clav, SPARSE, 0.9);
      else if (sec === 'a2' || sec === 'a3') clavRiff(c, clav, sec === 'a3' || i % 2 ? riff : SPARSE, 0.85);
      else if (sec === 'intro' && i === 3) clavRiff(c, clav, SPARSE.filter(([s]) => s >= 8), 0.8);
      else if (sec === 'out' && i < 2) clavRiff(c, clav, riff, 0.85 - i * 0.1);

      // ── the drums ──
      if (sec === 'intro') {
        if (i >= 2) countIn(c, kit, i === 3);
      } else if (sec === 'vamp') {
        const brk = c.turn % 2 === 1 && i >= 2;
        if (brk && i === 2) drums(c, kit, 'hats', { vel: 0.85 });
        else drums(c, kit, 'full', { open: i % 2 === 1, fill: last(c) ? (brk ? 2 : 1) : 0, kick: i % 2 ? 1 : 0, crash: i === 0 && c.turn % 2 === 0 });
      } else if (sec === 'a' || sec === 'a2' || sec === 'a3' || sec === 'solo') {
        const crash = (i === 0 && sec !== 'a') || (sec === 'a3' && i === 4);
        drums(c, kit, 'full', {
          vel: sec === 'a' ? 0.92 : 1,
          open: sec === 'a3' ? i % 2 === 1 || i === 6 : i % 2 === 1,
          fill: last(c) ? 2 : phraseEnd ? 1 : 0,
          kick: sec === 'a3' ? (i % 2 ? 1 : 2) : sec === 'solo' ? (i % 4 === 1 ? 3 : i % 2) : i % 2 ? 1 : 0,
          crash,
        });
        if (sec === 'a3') {
          // the backbeat doubled on a struck tambourine, eighths shaken between
          for (const s of [4, 12]) c.at(s, (t) => tamb.tambourine(t + LATE, hum(c, 0.7, 0.06), 'hit'), true);
          hits('..3. ..3. ..3. ..4.', (s, v) => c.at(s, (t) => tamb.tambourine(t, hum(c, v, 0.15)), true));
        }
      } else if (sec === 'b') {
        drums(c, kit, 'rim', { vel: 0.9, fill: last(c) ? 1 : 0 });
        if (i === 0) c.at(0, (t) => kit.crash(t, 0.5));
      } else if (brkSec) {
        if (last(c)) bigFill(c, kit);
      } else if (sec === 'out') {
        if (i < 3) drums(c, kit, i < 2 ? 'full' : 'hats', { vel: 1 - i * 0.12, open: i === 1, kick: 0 });
        if (i === 2) c.at(0, (t) => kit.kick(t, 0.7));
        if (i === 3) c.at(0, (t) => kit.crash(t, 0.38));
      }

      // ── the drive layer: a tambourine on the sixteenths, the wah clav ──
      if (drive && !brkSec && !(sec === 'intro' && i < 2) && !(sec === 'out' && i >= 3)) {
        if (sec === 'b') hits('6.3. 6.3. 6.3. 6.3.', (s, v) => c.at(s, (t) => perc.shaker(t, v * 0.8, 0.07), true));
        else {
          hits('5324 5324 5324 5326', (s, v) => c.at(s, (t) => perc.tambourine(t, hum(c, v, 0.12)), true));
          for (const s of [4, 12]) c.at(s, (t) => perc.tambourine(t, 0.62, 'hit'), true);
          wahClav(c, wah);
        }
      }
    };
  },
};
