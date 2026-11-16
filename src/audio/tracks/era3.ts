/**
 * "One Planet", Act IV (score v3): the supergrid, fusion, the whole Earth at work. Interlocking mallets and hand
 * drums, Steve Reich's Music for 18 Musicians meeting West African polyrhythm and a touch of Afrobeat: billions of
 * hands building one planet. A major, 112 bpm, straight sixteenths.
 *
 * The ensemble is a process as much as a band:
 *  - two marimbas (hard yarn, G3 to C#5, under the tune) play one cell of the chord's tones on the theme's 3+3+2, the
 *    second three sixteenths behind the first (a canon, panned well apart): together they shimmer, the resultant
 *    leaves the backbeats to the djembe, and each swells and fades over four bars against the other (Reich's breath);
 *  - a kalimba runs a three-note figure in eighths straight across the bar line (three against two: it comes round
 *    every three bars), bright in the intro, under the tune once it sings;
 *  - the steel pan sings the theme, the glockenspiel catches its accents, the vibraphone (Reich's signal
 *    instrument) cues the changes and sings the bridge;
 *  - an upright bass on a syncopated line (the tresillo, octave pops, a step into every chord), a soft kick on one;
 *  - djembe (bass, tone, slap), congas, a shaker, the bell (x.x..x.x.x..x.x.); a choir swells under it all.
 *
 *   intro  10 bars  one layer every two bars: marimba, the second marimba, kalimba, bass and kick, the drums
 *   A       8 bars  the theme on the steel pan (left open on V), the glockenspiel on its accents
 *   A2      8 bars  the theme sung by the choir with the glockenspiel an octave up, the marimbas thicken, the pan
 *                   answers in the long notes
 *   B       8 bars  the bridge on the vibraphone (an octave up, over the marimbas) and a held choir, the drums down
 *                   to djembe and shaker, the kalimba back for the second half; a build
 *   A3      8 bars  everything: the marimbas at full density, the choir on 'ah', the vibes answering
 *   outro   8 bars  the layers leave one by one, down to the first marimba
 *
 * Later passes add `pulse` (Reich's chord pulse, two bars a chord, the hook as a riff traded with the
 * glockenspiel), move the canon (three or five sixteenths), swap the bass and djembe patterns and the kalimba's
 * figure, now and then hand the first statement to the vibraphone, and reorder the sections.
 */
import { bassAt, hum, last, sing, through, voicingAt } from '../arrange';
import type { Bar, Setup, TrackDef } from '../cinematic';
import { chords, melody } from '../score';
import { BRIDGE, BRIDGE_CHORDS, HOOK, roman, THEME_CHORDS, THEME_CHORDS_OPEN, THEME_HOME, THEME_OPEN } from '../theme';
import { makeFunkKit, makePercussion, type Percussion } from '../voices/drums';
import { makeGlock, makeKalimba, makeMarimba, makeSteelPan, makeVibes, type Mallet } from '../voices/mallets';
import { makeChoir } from '../voices/pads';
import { makeUprightBass } from '../voices/plucked';

const KEY = 'A';
const TONIC = 57;
const BASS_LO = 33;
/** A major's pitch classes. */
const SCALE = [0, 2, 4, 5, 7, 9, 11].map((x) => (x + TONIC) % 12);

const SECS = {
  intro: { ch: roman('I | . | IV/1 | . | V/1 | . | I | . | IV/1 | V/1', KEY) },
  A: { ch: roman(THEME_CHORDS_OPEN, KEY), mel: THEME_OPEN },
  A2: { ch: roman(THEME_CHORDS, KEY), mel: THEME_HOME },
  B: { ch: roman(BRIDGE_CHORDS, KEY), mel: BRIDGE },
  A3: { ch: roman(THEME_CHORDS, KEY), mel: THEME_HOME },
  pulse: { ch: roman('Imaj7 | . | IV | . | vi7 | . | V | .', KEY), mel: `${HOOK} | -:16 | ${HOOK} | -:16 | ${HOOK} | -:16 | ${HOOK} | -:16` },
  outro: { ch: roman('I | . | IV/1 | . | V/1 | . | I | .', KEY) },
};
type SecName = keyof typeof SECS;

/** Each section's bass, bar by bar (pitch classes), so a line can step into the next bar's chord. */
const BASS_PC = Object.fromEntries(Object.entries(SECS).map(([k, s]) => [k, chords(s.ch).map((b) => b[0].bass)])) as Record<SecName, number[]>;
const HOOK_NOTES = melody(HOOK, 16);

const pcOf = (m: number) => ((m % 12) + 12) % 12;

/** The pitch classes of the voicing sounding at a step. */
const pcsAt = (c: Bar, s: number) => [...new Set(voicingAt(c, s).map(pcOf))];

/** The chord's notes from `lo` up to (not including) `hi`, low to high. */
function tonesIn(c: Bar, s: number, lo: number, hi: number): number[] {
  const pcs = pcsAt(c, s);
  const out: number[] = [];
  for (let m = lo; m < hi; m++) if (pcs.includes(pcOf(m))) out.push(m);
  return out;
}

/** The next bar's bass (pitch class): this section's next bar, or the next section's first. */
function nextBassPc(c: Bar): number {
  const here = BASS_PC[c.sec as SecName];
  if (c.i + 1 < c.len && here) return here[c.i + 1];
  return (BASS_PC[c.next as SecName] ?? here)[0];
}

// ── the marimbas ────────────────────────────────────────────────────────────────────────────
/**
 * The cell: an index into the chord's notes from G3 up (0 the lowest), −1 a rest. Two 3+3+2 groups a bar, like the
 * theme's hook. Played against itself three sixteenths late, the two leave rests on 2 and 4 (the djembe's slaps).
 */
const CELL = [0, -1, 2, 1, -1, 3, 2, -1, 4, -1, 2, 3, -1, 1, 2, -1];
/** Where the cell rests, the thicker sections fill in, softer: the other hand. */
const FILL = [-1, 3, -1, -1, 0, -1, -1, 5, -1, 1, -1, -1, 3, -1, -1, 4];
/** The cell's group starts (its accents). */
const GROUP = new Set([0, 3, 6, 8, 11, 14]);

/** The marimbas' register: the chord's notes from G3 up (bright, under the pan's theme, clear of the bass). */
const MAR_LO = 55, MAR_HI = 80;

/**
 * A bar of the cell on a marimba, `shift` sixteenths late (the canon), `dense` 0..1 = how much of the fill joins.
 * Each marimba breathes (Reich's swells): its level rises and falls over four bars, `phase` apart, so the two lean
 * in and out against each other and the canon never sits still. Steps `from`..`to` only (an entry or an exit).
 */
function marimbaBar(c: Bar, play: Mallet, vel: number, shift: number, dense: number, phase = 0, from = 0, to = 16): void {
  for (let s = from; s < to; s++) {
    const k = (s - shift + 16) % 16;
    let idx = CELL[k], level = GROUP.has(k) ? 1 : 0.76;
    if (idx < 0 && dense > 0) {
      idx = FILL[k];
      level = 0.56 * dense;
    }
    if (idx < 0) continue;
    const tones = tonesIn(c, s, MAR_LO, MAR_HI);
    if (!tones.length) continue;
    const m = tones[Math.min(idx, tones.length - 1)];
    const swell = 1 + 0.14 * Math.sin((2 * Math.PI * ((c.n % 4) * 16 + s)) / 64 + phase);
    c.at(s, (t) => play(t + c.r() * 0.005, m, c.dur(2), hum(c, vel * level * swell, 0.07)));
  }
}

// ── the kalimba ─────────────────────────────────────────────────────────────────────────────
/**
 * Eighths in groups of three that run on across the bar lines (bars since the track began keep the count): low,
 * high, middle (or as `order` says), from the chord's notes between `lo` and `hi`.
 */
function kalimbaBar(c: Bar, play: Mallet, vel: number, lo: number, hi: number, order: readonly number[], from = 0): void {
  for (let s = from; s < 16; s += 2) {
    const pos = (c.n * 8 + s / 2) % 3;
    const t = tonesIn(c, s, lo, hi);
    if (t.length < 3) continue;
    const fig = [t[0], t[t.length - 1], t[Math.floor(t.length / 2)]];
    const m = fig[order[pos]];
    // the thumb lets each tine ring through its group of three, then the next group takes over
    c.at(s, (u) => play(u + c.r() * 0.008, m, c.dur(pos === 0 ? 6 : 4), hum(c, vel * (pos === 0 ? 1 : 0.7), 0.08)));
  }
}

// ── the bass ────────────────────────────────────────────────────────────────────────────────
/** A bass hit: step, what (root, fifth, octave, the chord's third, a step into the next bar's root), length, velocity. */
type BassHit = [step: number, what: 'R' | '5' | '8' | '3' | 'a', len: number, vel: number];
/** The tresillo under the hook, an octave pop, the third, a step into the next chord. */
const GROOVE: BassHit[] = [[0, 'R', 3, 0.95], [3, 'R', 1, 0.42], [6, '5', 2, 0.8], [10, '8', 1, 0.72], [11, '5', 1, 0.5], [12, '3', 2, 0.7], [14, 'a', 2, 0.74]];
/** The same feel, pushed: an octave on the "a" of one, a pickup into three. */
const GROOVE2: BassHit[] = [[0, 'R', 2, 0.95], [3, '8', 1, 0.62], [4, 'R', 1, 0.42], [6, '5', 2, 0.8], [9, 'R', 1, 0.5], [10, '8', 2, 0.74], [13, '5', 1, 0.55], [14, 'a', 2, 0.74]];
/** The bridge: long notes, still on the tresillo. */
const SPARSE: BassHit[] = [[0, 'R', 6, 0.85], [6, '5', 3, 0.62], [10, 'R', 4, 0.7], [14, 'a', 2, 0.58]];
/** The bass coming in: the downbeat, the tresillo, an octave. */
const ENTRY: BassHit[] = [[0, 'R', 3, 0.85], [3, 'R', 1, 0.38], [6, '5', 2, 0.7], [10, 'R', 3, 0.72], [14, '8', 2, 0.55]];

function bassBar(c: Bar, play: (t: number, m: number, dur: number, vel: number) => void, pat: BassHit[], vel: number): void {
  const next = nextBassPc(c);
  for (const [s, what, len, v] of pat) {
    const root = bassAt(c, s);
    let m = root;
    if (what === '5') m = root + 7;
    else if (what === '8') m = root + 12;
    else if (what === '3') {
      const third = pcsAt(c, s).map((p) => (p - pcOf(root) + 12) % 12).find((iv) => iv === 3 || iv === 4);
      m = third === undefined ? root + 12 : root + third;
    } else if (what === 'a') {
      const target = BASS_LO + ((next - BASS_LO) % 12 + 12) % 12;
      if (pcOf(target) === pcOf(root)) m = root + 12;
      else {
        m = target - 1;
        while (!SCALE.includes(pcOf(m))) m--;
      }
    }
    c.at(s, (t) => play(t, m, c.dur(len) * 0.9, hum(c, v * vel, 0.06)), true);
  }
}

// ── the hand drums ──────────────────────────────────────────────────────────────────────────
const DJ_BASS = 'x... .... x... ....';
const DJ_SLAP = '.... x... .... x...';
const DJ_TONE = ['..oo ..o. ..oo ....', '..oo ..oo ..o. ..o-'];
const CONGA = { heel: '-... .... -... ....', hi: '.... ...o .... ....', mute: '.... .... .-.. ....', slap: '.... .... .... .o..', lo: '.... .... .... ..xo' };
/** The bell: x.x..x.x.x..x.x., the low bell on one and on the "e" of three. */
const BELL = { lo: 'x... .... .x.. ....', hi: '..x. .x.x .... x.x.' };
const SHAKE8 = [0.55, 0.85];
/** The drive layer's conga: slaps and open tones between the others. */
const DRIVE_CONGA = { slap: '..x. .... .... x...', open: '...o .... ...o ....', mute: '.... ..-. .... ..-.' };

type Drums = { djembe: number; conga: number; bell: number; shaker: number; tone: number; fill?: 'fill' | 'build' | 'none' };

function pat(c: Bar, p: string, fn: (t: number, v: number) => void, k: number, human = true): void {
  const s = p.replace(/\s/g, '');
  for (let i = 0; i < s.length; i++) {
    const v = s[i] === 'x' ? 1 : s[i] === 'o' ? 0.62 : s[i] === '-' ? 0.3 : 0;
    if (v && k > 0) c.at(i, (t) => fn(t, hum(c, Math.min(1, v * k), 0.08)), human);
  }
}

function drumsBar(c: Bar, hands: Percussion, bells: Percussion, d: Drums): void {
  const fill = d.fill ?? 'none';
  const half = fill === 'fill' ? 8 : fill === 'build' ? 0 : 16;
  const cut = (p: string) => p.replace(/\s/g, '').split('').map((ch, i) => (i < half ? ch : '.')).join('');
  if (d.djembe) {
    pat(c, cut(DJ_BASS), (t, v) => hands.djembe(t, v, 'bass'), d.djembe * 0.95);
    pat(c, cut(DJ_SLAP), (t, v) => hands.djembe(t, v, 'slap'), d.djembe * 0.85);
    pat(c, cut(DJ_TONE[d.tone]), (t, v) => hands.djembe(t, v, 'tone'), d.djembe * 0.85);
  }
  if (d.conga) {
    pat(c, cut(CONGA.heel), (t, v) => hands.conga(t, v, 'heel', 'low'), d.conga);
    pat(c, cut(CONGA.hi), (t, v) => hands.conga(t, v, 'open', 'high'), d.conga);
    pat(c, cut(CONGA.mute), (t, v) => hands.conga(t, v, 'mute', 'high'), d.conga);
    pat(c, cut(CONGA.slap), (t, v) => hands.conga(t, v, 'slap', 'high'), d.conga);
    pat(c, cut(CONGA.lo), (t, v) => hands.conga(t, v, 'open', 'low'), d.conga);
  }
  if (d.bell) {
    pat(c, BELL.lo, (t, v) => bells.agogo(t, v, 'low'), d.bell, false);
    pat(c, BELL.hi, (t, v) => bells.agogo(t, v * 0.85, 'high'), d.bell, false);
  }
  if (d.shaker) for (let s = 0; s < 16; s += 2) c.at(s, (t) => bells.shaker(t, hum(c, d.shaker * SHAKE8[(s / 2) % 2], 0.1), 0.08));
  if (fill === 'fill' && d.djembe) {
    // the second half of the bar: slaps and tones rolling into the next section
    const roll: ['slap' | 'tone', number][] = [['slap', 0.7], ['tone', 0.5], ['slap', 0.75], ['tone', 0.55], ['slap', 0.8], ['tone', 0.6], ['slap', 0.9], ['slap', 1]];
    roll.forEach(([how, v], k) => c.at(8 + k, (t) => hands.djembe(t, hum(c, v * d.djembe, 0.06), how), true));
    c.at(15, (t) => hands.conga(t, 0.7 * d.djembe, 'open', 'low'), true);
  }
  if (fill === 'build') {
    // a whole bar of sixteenths, tones into slaps, swelling; the bass drum on the last
    for (let s = 0; s < 16; s++) {
      const v = 0.3 + 0.7 * (s / 15);
      c.at(s, (t) => hands.djembe(t, hum(c, v, 0.05), s < 8 ? 'tone' : s % 2 ? 'tone' : 'slap'), true);
      if (s >= 8 && s % 2 === 0) c.at(s + 1, (t) => hands.conga(t, hum(c, v * 0.8, 0.05), 'open', s >= 12 ? 'low' : 'high'), true);
    }
    c.at(15, (t) => hands.djembe(t, 0.9, 'bass'));
  }
}

// ── the piece ───────────────────────────────────────────────────────────────────────────────
export const track: TrackDef = {
  bpm: 112, steps: 16, beat: 4, swing: 0, tonic: TONIC, delay: 3,
  lo: 50, hi: 67, size: 4, bassLo: BASS_LO, gain: 0.78,
  secs: SECS,
  form: (pass, r) => {
    if (pass === 0) return ['intro', 'A', 'A2', 'B', 'A3', 'outro'];
    const forms: SecName[][] = [
      ['pulse', 'A', 'A2', 'B', 'A3', 'outro'],
      ['A', 'A2', 'pulse', 'B', 'A3'],
      ['intro', 'A2', 'B', 'pulse', 'A3', 'outro'],
      ['pulse', 'A3', 'B', 'A', 'A2', 'outro'],
    ];
    return forms[Math.floor(r() * forms.length)];
  },
  setup(k: Setup) {
    const { ctx, r } = k;
    // harder yarn than a ballad's: the canon has to ring bright and pulse, not hum
    const mar1 = makeMarimba(ctx, k.strip('marimba1', { gain: 0.34, group: 'core', pan: -0.58, rev: 0.16, del: 0.03 }), r, { mallet: 0.62, spread: 0.14 });
    const mar2 = makeMarimba(ctx, k.strip('marimba2', { gain: 0.32, group: 'rhythm', pan: 0.58, rev: 0.16, del: 0.03 }), r, { mallet: 0.62, spread: 0.14 });
    const kal = makeKalimba(ctx, k.strip('kalimba', { gain: 0.42, group: 'rhythm', pan: 0.2, rev: 0.22, del: 0.12 }), r, { buzz: 0.25, damp: true });
    const pan = makeSteelPan(ctx, k.strip('pan', { gain: 0.6, group: 'core', rev: 0.2, del: 0.07 }), r, { mallet: 0.55, spread: 0.12 });
    // a hand stops each bar at its note's end: the doubled tune stays a line instead of a wash (and costs less)
    const glock = makeGlock(ctx, k.strip('glock', { gain: 0.26, group: 'rhythm', pan: -0.18, rev: 0.3, del: 0.1 }), r, { mallet: 0.55, damp: true });
    const vibes = makeVibes(ctx, k.strip('vibes', { gain: 0.5, group: 'core', pan: 0.12, rev: 0.26, del: 0.06 }), r, { motor: 4.8, depth: 0.42, onStop: k.onStop });
    // the held chords on two singers a note, the tune on three: a section's sound at half the cost (the hall does
    // the rest)
    const choir = makeChoir(ctx, k.strip('choir', { gain: 0.36, group: 'core', rev: 0.45, del: 0.03 }), r, { attack: 0.7, release: 1.2, voices: 2 });
    const choirLead = makeChoir(ctx, k.strip('choir-lead', { gain: 0.58, group: 'core', rev: 0.35, del: 0.06 }), r, { attack: 0.07, release: 0.5, vibrato: 0.8, voices: 3 });
    const bass = makeUprightBass(ctx, k.strip('bass', { gain: 0.85, group: 'rhythm', rev: 0.06 }), r, { warm: [31, 50] });
    const kit = makeFunkKit(ctx, k.strip('kick', { gain: 0.42, group: 'rhythm', rev: 0.04 }), r);
    const hands = makePercussion(ctx, k.strip('hands', { gain: 0.42, group: 'rhythm', rev: 0.12 }), r, { pan: { djembe: -0.2, conga: 0.32 } });
    const bells = makePercussion(ctx, k.strip('bells', { gain: 0.3, group: 'rhythm', rev: 0.14 }), r, { pan: { agogo: -0.34, shaker: 0.4 } });
    const drive = makePercussion(ctx, k.strip('drive', { gain: 0.34, group: 'drive', rev: 0.1 }), r, { pan: { conga: -0.42, shaker: -0.3 } });
    mar1.warm(MAR_LO, MAR_HI);
    mar2.warm(MAR_LO, MAR_HI);
    kal.warm(55, 90);
    pan.warm(62, 84);
    glock.warm(76, 98);
    vibes.warm(62, 88);
    hands.warm();
    bells.warm();
    drive.warm();

    /** The choir's chord (once per chord), `up` adding the top an octave higher. */
    const pad = (c: Bar, vel: number, vowel: 'oo' | 'ah', to?: 'oo' | 'ah', up = false) => {
      const sing = (t: number, v: number[], dur: number) => choir(t, up ? [...v.slice(1), v[v.length - 1] + 12] : v, dur + c.dur(2), vel, vowel, to);
      if (c.fresh) c.at(0, (t) => sing(t, c.v, c.dur(c.v2 ? c.steps / 2 : c.steps * c.hold)));
      if (c.v2) c.at(c.steps / 2, (t) => sing(t, c.v2!, c.dur(c.steps / 2)));
    };
    /** Three chord tones falling in the theme's long notes (steps 10, 12, 14), from the top of `lo`..`hi`. */
    const answer = (c: Bar, play: Mallet, vel: number, lo = 74, hi = 86) => {
      const t = tonesIn(c, 10, lo, hi);
      if (t.length < 3) return;
      [t[t.length - 1], t[t.length - 2], t[t.length - 3]].forEach((m, j) => c.at(10 + 2 * j, (u) => play(u, m, c.dur(2), hum(c, vel * (j === 0 ? 1 : 0.85), 0.06)), true));
    };
    /** The glockenspiel's ding: the chord's highest note under `hi`. */
    const ding = (c: Bar, step: number, vel: number, hi = 96) => {
      const t = tonesIn(c, step, hi - 12, hi);
      if (t.length) c.at(step, (u) => glock(u, t[t.length - 1], c.dur(8), vel));
    };

    return (c: Bar) => {
      const S = c.sec as SecName, i = c.i;
      // later passes vary the canon, the bass, the djembe and the kalimba's figure (all as written on the first)
      const shift = c.pass === 0 || c.x[0] < 0.6 ? 3 : 5;
      const groove = c.x[1] < 0.5 ? GROOVE : GROOVE2;
      const tone = c.x[2] < 0.5 ? 0 : 1;
      const order = c.x[3] < 0.6 ? [0, 1, 2] : [0, 2, 1];
      const toNew = last(c) && c.next !== S;

      if (S === 'intro') {
        // one layer every two bars
        const p = through(c);
        marimbaBar(c, mar1, 0.5 + 0.14 * p, 0, 0);
        if (i >= 2) marimbaBar(c, mar2, 0.46 + 0.14 * p, shift, 0, Math.PI);
        if (i >= 4) kalimbaBar(c, kal, 0.44 + 0.06 * p, 64, 77, order);
        if (i >= 6) {
          bassBar(c, bass, i >= 8 ? groove : ENTRY, i >= 8 ? 0.95 : 0.85);
          c.at(0, (t) => kit.kick(t, 0.5));
          pad(c, 0.28 + 0.1 * p, 'oo');
        }
        if (i >= 8) {
          drumsBar(c, hands, bells, { djembe: i === 8 ? 0.6 : 0.8, conga: i === 8 ? 0 : 0.7, bell: 0.8, shaker: 0.7, tone, fill: i === 9 ? 'fill' : 'none' });
          if (i === 8) ding(c, 0, 0.55);
        }
        // the vibraphone's call into the tune
        if (i === 9) [[8, 71], [11, 76], [14, 80]].forEach(([s, m], j) => c.at(s, (t) => vibes(t, m, c.dur(3), 0.55 + 0.08 * j), true));
        return;
      }

      if (S === 'A' || S === 'A2' || S === 'A3' || S === 'pulse') {
        const a3 = S === 'A3', a2 = S === 'A2';
        const dense = a3 ? 1 : a2 ? 0.75 : 0;
        marimbaBar(c, mar1, a3 ? 0.68 : a2 ? 0.62 : 0.58, 0, dense);
        marimbaBar(c, mar2, a3 ? 0.64 : a2 ? 0.58 : 0.54, shift, dense, Math.PI);
        // the kalimba keeps out of the tune's octave: under it while a tune sings, up in the open in the pulse's
        // bars between the hooks
        if (S === 'pulse' && i % 2 === 1) kalimbaBar(c, kal, 0.46, 69, 82, order);
        else kalimbaBar(c, kal, a3 ? 0.4 : S === 'pulse' ? 0.42 : 0.36, 57, 70, order);
        bassBar(c, bass, a2 ? GROOVE2 : groove, a3 ? 1.04 : 0.98);
        c.at(0, (t) => kit.kick(t, a3 ? 0.56 : 0.5));
        if (a3) c.at(8, (t) => kit.kick(t, 0.3));
        drumsBar(c, hands, bells, { djembe: a3 ? 0.9 : 0.8, conga: a3 ? 0.8 : 0.7, bell: a3 ? 0.9 : 0.8, shaker: 0.75, tone: a3 ? 1 : tone, fill: toNew && c.next !== 'B' ? 'fill' : 'none' });

        if (S === 'A') {
          // later passes now and then hand the first statement to the vibraphone, the pan answering in the long notes
          const vibesLead = c.pass > 0 && c.x[4] > 0.65;
          if (vibesLead) {
            sing(c, vibes, 0.8);
            if (i === 1 || i === 3 || i === 5) answer(c, pan, 0.55);
          } else sing(c, pan, 0.86);
          pad(c, 0.36, 'oo');
          if (i === 0 || i === 2 || i === 4) ding(c, 0, 0.5);
          if (i === 5) c.at(0, (t) => glock(t, TONIC + 36, c.dur(8), 0.6));
        } else if (a2) {
          sing(c, (t, m, d, v) => choirLead(t, [m], d, v, 'oo'), 0.72, 0, 1);
          sing(c, glock, 0.5, 12);
          pad(c, 0.26, 'oo');
          if (i === 1 || i === 3 || i === 5) answer(c, pan, 0.6);
          // the vibraphone cues the bridge
          if (toNew) [[10, 76], [12, 73], [14, 71]].forEach(([s, m], j) => c.at(s, (t) => vibes(t, m, c.dur(2), 0.5 + 0.05 * j), true));
        } else if (a3) {
          sing(c, pan, 0.95);
          sing(c, glock, 0.4, 12);
          pad(c, 0.5, 'ah', undefined, true);
          if (i === 1 || i === 3 || i === 5) answer(c, vibes, 0.55);
        } else {
          // the pulse: the hook on the pan, the glockenspiel answering in the bars between
          sing(c, pan, 0.8);
          pad(c, 0.32, i % 4 < 2 ? 'oo' : 'ah');
          if (i % 2 === 1) {
            const t = tonesIn(c, 2, 84, 98);
            t.slice(-3).reverse().forEach((m, j) => c.at(2 + 3 * j, (u) => glock(u, m, c.dur(3), 0.45 - 0.06 * j), true));
          }
        }
        // the drive: sixteenths on a second shaker and another conga
        if (c.mood.drive > 0) {
          for (let s = 1; s < 16; s += 2) c.at(s, (t) => drive.shaker(t, hum(c, s % 4 === 3 ? 0.5 : 0.38, 0.1), 0.05));
          pat(c, DRIVE_CONGA.slap, (t, v) => drive.conga(t, v, 'slap', 'high'), 0.75);
          pat(c, DRIVE_CONGA.open, (t, v) => drive.conga(t, v, 'open', 'high'), 0.75);
          pat(c, DRIVE_CONGA.mute, (t, v) => drive.conga(t, v, 'mute', 'high'), 0.75);
        }
        return;
      }

      if (S === 'B') {
        // the bridge: the vibraphone over a held choir, the drums down to djembe and shaker
        // (an octave up, D5–D6: the bridge sings over the marimbas instead of inside them)
        const p = through(c);
        sing(c, vibes, 0.74, 12, 1);
        pad(c, 0.44 + 0.12 * p, i < 4 ? 'oo' : 'ah');
        marimbaBar(c, mar1, 0.48 + 0.08 * p, 0, 0);
        if (i >= 4) marimbaBar(c, mar2, 0.42 + 0.14 * p, shift, 0, Math.PI);
        // the kalimba sits the first half out (the breakdown) and comes back underneath for the build
        if (i >= 4) kalimbaBar(c, kal, 0.3 + 0.08 * p, 57, 70, order);
        bassBar(c, bass, SPARSE, 0.9);
        const build = last(c);
        drumsBar(c, hands, bells, { djembe: 0.55 + 0.15 * p, conga: 0, bell: 0, shaker: 0.6 + 0.15 * p, tone, fill: build ? 'build' : 'none' });
        if (build) {
          // a glockenspiel run up into the last statement
          [81, 83, 85, 86, 88, 90, 92, 93].forEach((m, j) => c.at(12 + j * 0.5, (t) => glock(t, m, c.dur(6), 0.4 + 0.05 * j)));
          c.at(14, (t) => kit.kick(t, 0.4));
        }
        if (c.mood.drive > 0) for (let s = 1; s < 16; s += 2) c.at(s, (t) => drive.shaker(t, hum(c, 0.34, 0.1), 0.05));
        return;
      }

      // the outro: the layers leave one by one, down to the first marimba
      if (i === 0) for (const n of HOOK_NOTES) c.at(n.at, (t) => pan(t, TONIC + n.semi, c.dur(n.len), n.at === 0 ? 0.8 : 0.72), true);
      marimbaBar(c, mar1, 0.58 - 0.12 * through(c), 0, 0);
      if (i < 7) marimbaBar(c, mar2, 0.54 - 0.12 * through(c), shift, 0, Math.PI);
      if (i < 6) kalimbaBar(c, kal, 0.4, 64, 77, order);
      if (i < 4) {
        bassBar(c, bass, i < 2 ? groove : ENTRY, 0.9);
        c.at(0, (t) => kit.kick(t, 0.48));
        drumsBar(c, hands, bells, { djembe: 0.75, conga: i < 2 ? 0.65 : 0, bell: i < 2 ? 0.75 : 0, shaker: 0.65, tone });
      }
      if (i < 3) pad(c, 0.34, 'oo');
      if (i === 2) ding(c, 0, 0.45);
    };
  },
};
