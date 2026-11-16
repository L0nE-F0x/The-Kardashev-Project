/**
 * era4 "Swarmlight" (Act V: the Dyson swarm, Type I in reach): a cosmic waltz in E major, 3/4 at 138. Space has
 * belonged to the waltz since 2001's Blue Danube: luminous, joyous, turning.
 *
 * The theme stretched to waltz time: every 4/4 bar of THEME becomes two 3/4 bars, so the 3+3+2 rise (so–do–re–mi)
 * fills one and the long note rings through the next, where the harp, the glockenspiel or the ondes answer. The
 * waltz itself: an upright bass plucks the one (the root, then the fifth on a chord's second bar), the harp doubles
 * it an octave up, the celesta plays the pah-pah, the second beat a shade early and the third a shade late (the
 * Viennese lilt). The bass steps up into every four-bar phrase on beat three, and the cadences of a2 and a3 turn into
 * a hemiola (bars 13–14 felt as three bars of two: the V lands a beat late), Strauss's way home. Glass and strings
 * hold the light; the sparkle synth and the glockenspiel glitter above; a choir sings 'oo' in the bridge and 'ah' at
 * the peak, where the harp joins the pah-pah; a triangle marks the phrases. No drum kit.
 *
 *   intro  the music box (the celesta, high): the four notes, then the harp and the bass, a glissando into
 *   a      the theme on the ondes Martenot, left open; the harp answers in the long notes
 *   a2     the theme on the strings, the ondes singing a counter-melody in its long notes, the glockenspiel
 *   b      the bridge on the harp in octaves (the ondes softly under it), the choir 'oo', turning to C♯7
 *   a3     the theme lifted to F♯: everything, the choir 'ah', the glockenspiel doubling, sparkle arpeggios
 *   out    the music box again, winding down, home to E (through A major: the lift's F♯ falls a third to IV)
 *
 * Paused: the ondes (or the strings with it), the glass and the music box keeping a soft oom-pah-pah. Fast: sparkle
 * arpeggios in sixteenths over everything.
 */
import type { Bar, SecDef, Setup, TrackDef } from '../cinematic';
import { bassIn, hum, last } from '../arrange';
import { chords, melody, MAJOR } from '../score';
import { roman } from '../theme';
import { makePercussion } from '../voices/drums';
import { makeCelesta, makeGlock } from '../voices/mallets';
import { makeChoir, makeGlassPad, makeStrings } from '../voices/pads';
import { makeHarp, makeUprightBass } from '../voices/plucked';
import { makeSparkle } from '../voices/synths';
import { makeOndes } from '../voices/winds';

const STEPS = 12;
/** The waltz's lilt, in steps: the second beat a shade early, the third a shade late. */
const TWO = 3.7, THREE = 8.12;

// ── the tunes (12 steps a bar, scale degrees; the lead plays them an octave up) ───────────────────
/** THEME in waltz time: each 4/4 bar becomes two 3/4 bars (the rise, then the long note). */
const THEME_WALTZ =
  "5:3 1':3 2':2 3':4 | 5':12 | 4':3 3':3 2':2 1':16 | 5:3 1':3 2':2 3':4 | 6':12 | 5':3 4':3 3':2 2':16 | " +
  "3':3 4':3 5':2 6':4 | 5':12 | 1'':3 7':3 6':2 5':16 | 4':3 3':3 2':2 3':4 | 5':12 | ";
const HOME_WALTZ = THEME_WALTZ + "1':24";
const OPEN_WALTZ = THEME_WALTZ + "2':18 -:6";
/** The bridge in waltz time: longer notes, a turn through iii and vi, on to C♯7 (the lift to F♯). */
const BRIDGE_WALTZ =
  "6:4 1':8 | 3':8 2':4 | 2':4 7:8 | 5:12 | 5:4 7:8 | 2':10 1':2 | 6:18 -:6 | " +
  "4:4 6:8 | 1':8 7:4 | 6:4 5:8 | 3':12 | 4':4 3':4 2':4 | 1':12 | 2':4 5:4 7:16";
/** The ondes' counter-melody under the strings' theme (a2): it rests while the theme moves and answers its long notes. */
const COUNTER =
  "-:12 | -:4 1':4 7:4 | 6:12 | -:4 5:4 4:4 | 3:12 | -:4 5:4 1':4 | 7:12 | -:4 6:4 7:4 | " +
  "1':12 | -:4 6:4 4:4 | 3:12 | -:4 5:4 7:4 | 1':12 | -:4 7:4 5:4 | 3:24";

const A_CHORDS = 'I | . | IVmaj7 | . | vi7 | . | V | . | IVmaj7 | . | vi9 | . | ii7 | V7sus4 | V | V7';
const HOME_CHORDS = 'I | . | IVmaj7 | . | vi7 | . | V | . | IVmaj7 | . | vi9 | . | ii7 | V | I | .';

const SECS: Record<string, SecDef> = {
  intro: { ch: roman('I | IVmaj7 | ii7 | V | I | IVmaj7 | ii7 | V7sus4 V', 'E'), mel: "5:12 | 1':12 | 2':12 | 3':12 | 5:12 | 1':12 | 2':12 | 3':12" },
  a: { ch: roman(A_CHORDS, 'E'), mel: OPEN_WALTZ },
  a2: { ch: roman(HOME_CHORDS, 'E'), mel: HOME_WALTZ },
  b: { ch: roman('IVmaj7 | . | V | . | iii7 | . | vi7 | . | ii7 | . | I/3 | . | IVmaj7 | . | V | VI7sus4 VI7', 'E'), mel: BRIDGE_WALTZ },
  a3: { tonic: 54, ch: roman('I | . | IVmaj7 | . | vi7 | . | V | . | IVmaj7 | . | vi9 | . | ii7 | V7 | I | .', 'F#'), mel: HOME_WALTZ },
  out: { ch: roman('IVmaj7 | . | I/3 | . | ii7 | V7sus4 | I | .', 'E'), mel: "3':8 2':4 | 1':12 | 3':8 2':4 | 1':12 | 6:12 | 2':12 | 1':24" },
};

/** A tune's phrasing: tongued at the top of every two-bar unit (and after a rest), slurred inside it. */
interface Phrased { slur: boolean; legato: boolean }
function phrasing(mel: string): Map<number, Phrased> {
  const out = new Map<number, Phrased>();
  const ns = melody(mel, STEPS, MAJOR);
  ns.forEach((n, j) => {
    const prev = ns[j - 1], next = ns[j + 1];
    const slur = !!prev && prev.at + prev.len === n.at && n.at % 24 !== 0;
    const legato = !!next && n.at + n.len === next.at && next.at % 24 !== 0;
    out.set(n.at, { slur, legato });
  });
  return out;
}
const PHRASES = new Map(Object.entries(SECS).map(([k, s]) => [k, phrasing(s.mel ?? '')]));
const COUNTER_NOTES = melody(COUNTER, STEPS, MAJOR);
const COUNTER_PH = phrasing(COUNTER);

/** The notes of the major scale on `tonic` from `lo` to `hi` (a harp glissando's strings). */
function scale(lo: number, hi: number, tonic: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (MAJOR.includes((((m - tonic) % 12) + 12) % 12)) out.push(m);
  return out;
}
/** A pitch class in the octave from `lo` up. */
const inOct = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);
/** Every section's chords, bar by bar (a held bar is the same array as the bar before), to look a bar ahead. */
const CHARTS = new Map(Object.entries(SECS).map(([k, s]) => [k, chords(s.ch)]));
/** The bass's pitch class of the next bar's chord, when the chord changes there (null: held, or the section ends). */
function nextBass(sec: string, i: number): number | null {
  const ch = CHARTS.get(sec);
  if (!ch || i + 1 >= ch.length || ch[i + 1] === ch[i]) return null;
  return ch[i + 1][0].bass;
}
/** The scale note just under `m` (a bass's step up into the next root). */
function stepBelow(m: number, tonic: number): number {
  let x = m - 1;
  while (!MAJOR.includes((((x - tonic) % 12) + 12) % 12)) x--;
  return x;
}

type Line = (t: number, m: number, dur: number, vel: number, slur: boolean) => void;

export const track: TrackDef = {
  bpm: 138, steps: 12, beat: 4, tonic: 52, mode: MAJOR, delay: 6, lo: 56, hi: 71, size: 3, bassLo: 35, gain: 0.8,
  secs: SECS,
  form: (pass, r) => {
    if (pass === 0) return ['intro', 'a', 'a2', 'b', 'a3', 'out'];
    const forms = [
      ['a', 'a2', 'b', 'a3', 'out'],
      ['intro', 'a2', 'b', 'a3', 'out'],
      ['a', 'b', 'a3', 'out'],
      ['intro', 'a', 'a2', 'b', 'a3', 'out'],
      ['a2', 'a', 'b', 'a3', 'out'],
    ];
    return forms[Math.floor(r() * forms.length)];
  },
  setup(k: Setup) {
    const { ctx, r } = k;
    // the core: the tune, the glass, the music box (all keep playing when the game is paused)
    const lead = makeOndes(ctx, k.strip('lead', { gain: 0.62, rev: 0.42, del: 0.14 }), r, { palme: 0.35, glide: 1.1 });
    const violins = makeStrings(ctx, k.strip('violins', { gain: 0.5, pan: -0.1, rev: 0.45, del: 0.05 }), r, { players: 4, attack: 0.16, release: 0.6, bright: 1.05 });
    const glass = makeGlassPad(ctx, k.strip('glass', { gain: 0.26, rev: 0.6, del: 0.1 }), r, { attack: 1.2, release: 2.4, bright: 1.2 });
    const box = makeCelesta(ctx, k.strip('box', { gain: 0.5, pan: 0.1, rev: 0.42, del: 0.12 }), r, { mallet: 0.65, spread: 0.25 });
    const harpTune = makeHarp(ctx, k.strip('harptune', { gain: 0.72, pan: -0.2, rev: 0.42, del: 0.08 }), r, { bright: 1.1, warm: [57, 84] });
    // the waltz: bass, harp, celesta pah-pah (rest while paused)
    const pahs = makeCelesta(ctx, k.strip('pahs', { gain: 0.42, group: 'rhythm', rev: 0.3, del: 0.04, pan: 0.28 }), r, { mallet: 0.35, spread: 0.2 });
    const harp = makeHarp(ctx, k.strip('harp', { gain: 0.6, group: 'rhythm', pan: -0.3, rev: 0.36, del: 0.04 }), r, { width: 0.8, warm: [45, 80] });
    const bass = makeUprightBass(ctx, k.strip('bass', { gain: 0.85, group: 'rhythm', rev: 0.1 }), r, { warm: [35, 47] });
    const strings = makeStrings(ctx, k.strip('strings', { gain: 0.3, group: 'rhythm', rev: 0.55 }), r, { players: 2, attack: 0.6, release: 1.2, vibrato: 0.8 });
    const choir = makeChoir(ctx, k.strip('choir', { gain: 0.42, group: 'rhythm', rev: 0.65 }), r, { voices: 3, attack: 0.8, release: 2 });
    const glock = makeGlock(ctx, k.strip('glock', { gain: 0.36, group: 'rhythm', pan: 0.32, rev: 0.4, del: 0.16 }), r, { mallet: 0.5 });
    const sparkle = makeSparkle(ctx, k.strip('sparkle', { gain: 0.34, group: 'rhythm', rev: 0.4, del: 0.3, hp: 500 }), r, { voices: 10 });
    const tri = makePercussion(ctx, k.strip('tri', { gain: 0.35, group: 'rhythm', pan: 0.4, rev: 0.45 }), r);
    // the clock running fast: sixteenth arpeggios high up
    const drive = makeSparkle(ctx, k.strip('drive', { gain: 0.26, group: 'drive', rev: 0.3, del: 0.25, hp: 700 }), r, { decay: 0.7 });
    box.warm(64, 96);
    pahs.warm(55, 72);
    glock.warm(80, 104);

    const ondes: Line = (t, m, d, v, slur) => lead(t, m, d, v, slur);
    const bowed: Line = (t, m, d, v, slur) => violins(t, [m], d, v, d > 1.2 && !slur ? 0.25 : 0, slur);

    /** The bar's tune on a singing voice, phrased (slurred inside a two-bar unit). */
    const sing = (c: Bar, play: Line, vel: number, oct: number) => {
      const ph = PHRASES.get(c.sec);
      for (const n of c.mel) {
        const p = ph?.get(c.i * STEPS + n.at);
        const m = c.tonic + n.semi + oct;
        const d = c.dur(n.len) + (p?.legato ? 0.06 : -0.05);
        const v = vel * (n.len >= 12 ? 1.04 : n.at === 0 ? 1 : 0.9);
        c.at(n.at, (t) => play(t, m, d, hum(c, v, 0.05), !!p?.slur), true);
      }
    };
    /** The counter-melody's notes in this bar. */
    const counter = (c: Bar, play: Line, vel: number, oct: number) => {
      const from = c.i * STEPS, to = from + STEPS;
      for (const n of COUNTER_NOTES) {
        if (n.at < from || n.at >= to) continue;
        const p = COUNTER_PH.get(n.at);
        const m = c.tonic + n.semi + oct;
        const d = c.dur(n.len) + (p?.legato ? 0.06 : -0.04);
        c.at(n.at - from, (t) => play(t, m, d, hum(c, vel * (p?.slur ? 0.92 : 1), 0.05), !!p?.slur), true);
      }
    };
    /** A held chord for as long as it lasts (a bar's second chord comes in on beat three). */
    const held = (c: Bar, play: (t: number, v: number[], d: number) => void, map: (v: number[], c: Bar) => number[] = (v) => v) => {
      if (c.fresh) c.at(0, (t) => play(t, map(c.v, c), c.dur(c.v2 ? 8 : STEPS * c.hold) + 0.1));
      if (c.v2) c.at(8, (t) => play(t, map(c.v2!, c), c.dur(4) + 0.1));
    };
    /** The waltz bass: the root on the one, the fifth below on a held chord's second bar (the root under a slash chord). */
    const oomNote = (c: Bar): number => {
      if (c.fresh) return bassIn(c, 0, 35);
      return inOct(c.ch.bass !== c.ch.root ? c.ch.root : (c.ch.root + 7) % 12, 35);
    };
    const oom = (c: Bar, vel: number, harpToo = true) => {
      const m = oomNote(c);
      c.at(0, (t) => bass(t, m, c.dur(9), hum(c, vel)), true);
      if (harpToo) c.at(0.15, (t) => harp.note(t, m + 12, c.dur(10), hum(c, vel * 0.7)), true);
    };
    /** Pah-pah: the chord on beats two and three, short. */
    const pahPah = (c: Bar, play: (t: number, v: number[], d: number, vel: number) => void, vel: number, map: (v: number[]) => number[] = (v) => v) => {
      c.at(TWO, (t) => play(t, map(c.v), c.dur(2.6), hum(c, vel)), true);
      c.at(THREE, (t) => play(t, map(c.v2 ?? c.v), c.dur(2.6), hum(c, vel * 0.84)), true);
    };
    /** The music box's own waltz: a low note on the one, a dyad on two and three. */
    const boxWaltz = (c: Bar, vel: number) => {
      const v = c.v.map((m) => m + 12), w = (c.v2 ?? c.v).map((m) => m + 12);
      c.at(0, (t) => box(t, v[0], c.dur(4), hum(c, vel)), true);
      c.at(TWO, (t) => box.chord(t, v.slice(1), c.dur(3), hum(c, vel * 0.8)), true);
      c.at(THREE, (t) => box.chord(t, w.slice(1), c.dur(3), hum(c, vel * 0.7)), true);
    };
    /** A rising harp arpeggio through the chord on beats two and three (an answer in the tune's long notes). */
    const harpAnswer = (c: Bar, vel: number) => {
      const v = c.v2 ?? c.v;
      [v[0], v[1], v[2], v[0] + 12].forEach((m, j) => c.at(4 + j * 2, (t) => harp.note(t, m, c.dur(10 - j * 2), hum(c, vel * (0.85 + j * 0.06))), true));
    };
    const gliss = (c: Bar, at: number, lo: number, hi: number, tonic: number, vel: number, down = false) => {
      const notes = scale(lo, hi, tonic);
      if (down) notes.reverse();
      const spacing = Math.min(0.055, c.dur(STEPS - at) / notes.length);
      c.at(at, (t) => harp.gliss(t, notes, spacing, vel));
    };
    /** A voicing with the notes under C4 moved up an octave (the celesta starts there). */
    const upFrom60 = (v: number[]) => v.map((m) => (m < 60 ? m + 12 : m)).sort((a, b) => a - b);
    /** The chord's tones climbing two octaves, for the arpeggios. */
    const ladder = (v: number[], up: number) => [...v, ...v.map((m) => m + 12)].map((m) => m + up);
    const triangle = (c: Bar, vel: number, open = true) => c.at(0, (t) => tri.triangle(t, hum(c, vel, 0.1), open));
    /** The bass steps up into a new chord on beat three (the turn of a four-bar phrase). */
    const pickup = (c: Bar, vel: number) => {
      const pc = nextBass(c.sec, c.i);
      if (pc === null) return;
      const m = stepBelow(inOct(pc, 35), c.tonic);
      c.at(8, (t) => bass(t, m, c.dur(3.6), hum(c, vel)), true);
    };
    /**
     * The Viennese cadence: bars 13–14 (ii, then V) felt as three bars of two beats, the hemiola. Bass, harp and
     * celesta strike together on the one and the three of the first bar and on the two of the second, so the V lands
     * a beat late and the next bar's tonic feels like an arrival. Returns whether it played the bar.
     */
    const hemiola = (c: Bar, vel: number, harpToo: boolean): boolean => {
      if (c.i !== 12 && c.i !== 13) return false;
      const steps = c.i === 12 ? [0, 8] : [4];
      steps.forEach((s, j) => {
        const m = c.i === 12 && j === 1 ? inOct(c.ch.root + 7, 35) : bassIn(c, 0, 35);
        const v = c.i === 13 ? vel * 1.06 : j ? vel * 0.9 : vel;
        c.at(s, (t) => bass(t, m, c.dur(7.6), hum(c, v)), true);
        c.at(s + 0.15, (t) => harp.note(t, m + 12, c.dur(8), hum(c, v * 0.7)), true);
        c.at(s + 0.1, (t) => pahs.chord(t, upFrom60(c.v), c.dur(6.5), hum(c, 0.36 + v * 0.18)), true);
        if (harpToo) c.at(s + 0.2, (t) => harp.chord(t, c.v, c.dur(7.5), hum(c, 0.34), 0.016), true);
      });
      return true;
    };

    return (c: Bar) => {
      const { sec, i } = c;
      const calm = c.mood.calm;
      const long = i % 2 === 1; // the second bar of a two-bar unit: the theme's long note
      const x = c.x;

      if (sec === 'intro') {
        // the music box alone, then the harp and the bass come in under it
        sing(c, (t, m, d, v) => box(t, m, d, v), 0.62, 24);
        boxWaltz(c, i < 4 ? 0.34 : 0.3);
        if (i >= 2) held(c, (t, v, d) => glass(t, v, d, i < 4 ? 0.28 : 0.36));
        if (i >= 4 && !calm) {
          oom(c, 0.55 + 0.04 * (i - 4));
          if (i === 4) triangle(c, 0.24);
        }
        if (last(c) && !calm) gliss(c, 5, 52, 83, 52, 0.36);
        return;
      }

      if (sec === 'out') {
        // the music box again, winding down
        if (i < 6) {
          sing(c, (t, m, d, v) => box(t, m, d, v), 0.56, 24);
          boxWaltz(c, 0.3 - i * 0.02);
        }
        if (i === 6) {
          // the box running down: each note a little later
          const v = c.v.map((m) => m + 12);
          sing(c, (t, m, d, vv) => box(t, m, d, vv), 0.5, 24);
          c.at(0, (t) => box(t, v[0], c.dur(5), 0.24));
          c.at(4.6, (t) => box.chord(t, v.slice(1), c.dur(4), 0.2));
          c.at(10.2, (t) => box.chord(t, v.slice(1), c.dur(4), 0.16));
        }
        if (i === 7) {
          c.at(0.8, (t) => box.chord(t, [c.tonic + 24, c.tonic + 28, c.tonic + 31, c.tonic + 36], c.dur(12) + 2, 0.42));
          c.at(0.4, (t) => lead(t, c.tonic + 24, c.dur(11), 0.34, false));
          if (!calm) c.at(0, (t) => harp.chord(t, [40, 47, 52, 56, 59, 64], c.dur(12) + 2.5, 0.42, 0.06));
        }
        held(c, (t, v, d) => glass(t, v, d, 0.3));
        if (!calm && i < 6 && i % 2 === 0) oom(c, 0.42 - i * 0.03);
        if (!calm && i === 0) triangle(c, 0.2);
        return;
      }

      // ── the waltz sections ──
      const lifted = sec === 'a3';
      const peak = lifted;
      // the glass under everything
      held(c, (t, v, d) => glass(t, v, d, sec === 'b' ? 0.32 : peak ? 0.42 : sec === 'a2' ? 0.4 : 0.36));

      // the tune
      if (sec === 'a') {
        const boxFirst = x[0] > 0.6 && i < 8; // later passes: the music box has the first half
        if (boxFirst) sing(c, (t, m, d, v) => box(t, m, d, v), 0.6, 12);
        else sing(c, ondes, 0.72, 12);
      } else if (sec === 'a2') {
        const swap = x[1] > 0.5; // later passes: the ondes sings, the strings answer
        if (swap) {
          sing(c, ondes, 0.72, 12);
          counter(c, bowed, 0.5, 12);
        } else {
          sing(c, bowed, 0.72, 12);
          counter(c, ondes, 0.5, 12);
        }
      } else if (sec === 'b') {
        // the harp leads in octaves; the ondes holds its long notes softly under it
        for (const n of c.mel) {
          const m = c.tonic + n.semi + 12;
          const v = n.at === 0 ? 0.72 : 0.64;
          c.at(n.at, (t) => {
            harpTune.note(t, m, c.dur(n.len) + 0.5, hum(c, v, 0.05));
            harpTune.note(t + 0.012, m + 12, c.dur(n.len) + 0.4, hum(c, v * 0.42, 0.05));
          }, true);
        }
        sing(c, ondes, 0.36, 12);
      } else if (lifted) {
        sing(c, ondes, 0.8, 12);
        sing(c, bowed, 0.56, 12);
        // the glockenspiel doubles two octaves up
        for (const n of c.mel) c.at(n.at, (t) => glock(t, c.tonic + n.semi + 24, c.dur(Math.min(n.len, 6)), hum(c, n.at === 0 ? 0.5 : 0.42)), true);
      }

      // paused: the music box keeps a soft waltz going under the tune
      if (calm) {
        boxWaltz(c, 0.24);
        return;
      }

      // the waltz: oom-pah-pah, the bass stepping into each new four-bar phrase; the cadence of a2 and a3 (and of a, on
      // some later passes) as a hemiola
      const harpPahs = sec === 'a' && x[2] > 0.5;
      const oomVel = sec === 'b' ? 0.55 : peak ? 0.72 : sec === 'a2' ? 0.68 : 0.64;
      const hemi = (sec === 'a2' || peak || (sec === 'a' && x[5] > 0.5)) && hemiola(c, oomVel, peak);
      if (!hemi) {
        oom(c, oomVel);
        if (harpPahs) pahPah(c, (t, v, d, vel) => harp.chord(t, v, d + 0.2, vel, 0.012), 0.42);
        else pahPah(c, (t, v, d, vel) => pahs.chord(t, v, d, vel), sec === 'b' ? 0.34 : peak ? 0.46 : sec === 'a2' ? 0.45 : 0.42, upFrom60);
        // at the peak the harp joins the pah-pah in the bars where the tune moves
        if (peak && !long) pahPah(c, (t, v, d, vel) => harp.chord(t, v, d + 0.15, vel, 0.012), 0.3);
        if (i % 4 === 3) pickup(c, sec === 'b' ? 0.4 : 0.48);
      }

      if (sec === 'a') {
        if (long && !last(c) && !hemi) {
          harpAnswer(c, 0.4);
          const v = c.v2 ?? c.v;
          c.at(THREE, (t) => sparkle(t, v[2] + 24, c.dur(4), hum(c, 0.3), 0.35), true);
        }
        if (i % 4 === 0) triangle(c, 0.2);
        if (last(c)) gliss(c, 4, 52, 88, 52, 0.4);
      } else if (sec === 'a2') {
        // the glockenspiel twinkles in the long notes; a triangle on every bar
        if (long && !hemi) {
          const v = c.v2 ?? c.v;
          c.at(TWO, (t) => glock(t, v[2] + 24, c.dur(3), hum(c, 0.3)), true);
          c.at(THREE, (t) => glock(t, v[1] + 24, c.dur(3), hum(c, 0.26)), true);
        }
        triangle(c, i % 4 === 0 ? 0.28 : 0.15, i % 4 === 0);
        if (x[3] > 0.6) for (let s = 0; s < STEPS; s += 2) {
          const l = ladder(c.v, 24), j = [0, 1, 2, 3, 2, 1][s / 2];
          c.at(s, (t) => sparkle(t, l[j], c.dur(2), hum(c, s === 0 ? 0.36 : 0.26), (j - 1.5) * 0.3));
        }
        if (last(c)) gliss(c, 3, 64, 91, 52, 0.3, true);
      } else if (sec === 'b') {
        held(c, (t, v, d) => (x[4] > 0.5 ? strings(t, [c.bass + 12, ...v], d, 0.42, 0.3) : choir(t, v, d, 0.48, 'oo')));
        if (i % 4 === 0) triangle(c, 0.18);
        if (last(c)) {
          // into the lift: the harp sweeps up F♯ major, the strings swell
          gliss(c, 2, 54, 90, 54, 0.46);
          const v7 = c.v2 ?? c.v;
          c.at(4, (t) => strings(t, [v7[0], v7[1], v7[2], v7[2] + 12], c.dur(8) + 0.1, 0.55, 1));
        }
      } else if (peak) {
        held(c, (t, v, d) => choir(t, [c.bass + 12, ...v], d, 0.55, 'ah'));
        held(c, (t, v, d) => strings(t, [c.bass + 12, ...v], d, 0.46, 0.25));
        // sparkle arpeggios in eighths, climbing and turning
        const pat = i % 2 ? [3, 2, 1, 2, 3, 2] : [0, 1, 2, 3, 2, 1];
        for (let s = 0; s < STEPS; s += 2) {
          const j = pat[s / 2];
          c.at(s, (t) => sparkle(t, ladder(s >= 8 && c.v2 ? c.v2 : c.v, 24)[j], c.dur(2), hum(c, s === 0 ? 0.4 : 0.3), (j - 2.5) * 0.25));
        }
        if (long && !last(c) && !hemi) harpAnswer(c, 0.42);
        triangle(c, i % 4 === 0 ? 0.36 : 0.2, i % 4 === 0);
        if (last(c)) c.at(0, (t) => harp.chord(t, [c.bass, c.bass + 7, ...c.v, c.v[2] + 12], c.dur(STEPS) + 2, 0.5, 0.05));
      }

      // the clock running fast: sixteenths through the chord, high up
      if (c.mood.drive > 0.01) {
        const pat = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1];
        for (let s = 0; s < STEPS; s++) {
          const l = ladder(s >= 8 && c.v2 ? c.v2 : c.v, 24);
          c.at(s, (t) => drive(t, l[pat[s]], c.dur(1), hum(c, s % 4 === 0 ? 0.34 : 0.24), Math.sin(s * 1.3) * 0.4));
        }
      }
    };
  },
};
