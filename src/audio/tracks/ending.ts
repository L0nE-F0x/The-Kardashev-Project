/**
 * "Type I" (the finale: Kardashev 1.0000 reached). A medley that walks the theme through every era's colours, each
 * era a step higher than the last, to a radiant climax and a quiet close. 108 bpm, straight sixteenths.
 *
 *   intro    C   out of near-silence: the four notes on a celesta over glass, the drummer's pickup
 *   garage   C   THEME_OPEN, Act I: a whistle over Rhodes, a fingered bass, a light funk kit
 *   citypop  D   THEME_HOME, Act II: Lyricon, FM brass answers, DX piano, slap bass, the LinnDrum and its cowbell
 *   bossa    E   BRIDGE, Act III: flute over a nylon guitar on the clave, upright bass, brushes, a ganzá
 *   planet   F   THEME_OPEN, Act IV: two marimbas interlocking, a steel pan lead, djembe, the bell on the theme's 3+3+2
 *   light    G   THEME_HOME, Act V, the biggest: strings in octaves, celesta and glock doubling, a choir on "ah",
 *                FM brass, a harp, the full kit four on the floor with disco octaves under it
 *   coda     G   the four notes again, slowly, on celesta and choir over a held G6/9, then silence
 *
 * Every era ends by turning to the next key's dominant (a sus4 chord on its last two beats) under a fill: the
 * LinnDrum's toms out of the garage, a breakdown and a flute pickup into the bossa, the djembe's call and the
 * marimbas fading in out of it, a harp glissando and a string swell into the light, the toms into the coda.
 * Later passes loop gently: a quiet intro in G (the hush), the light, the coda.
 */
import { bassIn, chordsOn, hum, last, voicingAt } from '../arrange';
import type { Bar, SecDef, Setup, TrackDef } from '../cinematic';
import { bassNote, chords, type Chord, type MelNote } from '../score';
import { BRIDGE, SIGNAL, THEME, roman } from '../theme';
import { makeBrushKit, makeEightiesKit, makeFunkKit, makePercussion } from '../voices/drums';
import { keysChord, makeEPiano } from '../voices/keys';
import { makeCelesta, makeGlock, makeMarimba, makeSteelPan } from '../voices/mallets';
import { makeChoir, makeGlassPad, makeStrings } from '../voices/pads';
import { makeElectricBass, makeHarp, makeNylon, makeUprightBass } from '../voices/plucked';
import { makeFMBass, makeFMBrass } from '../voices/synths';
import { makeFlute, makeLyricon, makeWhistle, type Wind } from '../voices/winds';

// ── the sections ────────────────────────────────────────────────────────────────────────────
/** The bridge with its last bar turned towards F: F♯ and B over B, then A (C7sus4's thirteenth) as the key moves. */
const BOSSA = BRIDGE.slice(0, BRIDGE.lastIndexOf('|')) + "| 2':4 5:4 4':8";

const secs: Record<string, SecDef> = {
  intro: { tonic: 48, ch: roman('Imaj9 | IVmaj9 | vi9 | V9sus4', 'C'), mel: SIGNAL },
  // the theme left open, its last half bar on A7sus4: D major's dominant
  garage: { tonic: 48, ch: roman('Imaj9 | IVmaj9 | vi9 | V9sus4 V | IVmaj9 | vi9 | ii9 V | V VI7sus4', 'C'), mel: THEME + "2':12 -:4" },
  // the theme home on D, then B9sus4 (E's dominant) while the band drops out
  citypop: { tonic: 50, ch: roman('Imaj9 | IVmaj9 | vi9 | V9sus4 V | IVmaj9 | vi9 | ii9 V | Imaj9 VI9sus4', 'D'), mel: THEME + "1':8 -:8" },
  // the bridge in E, a Jobim major seventh under its first note; the last half bar on C7sus4 (F's dominant)
  bossa: { tonic: 52, ch: roman('Imaj7 | V7 | iii7 | vi7 | ii7 | I/3 | IVmaj7 | V bVI7sus4', 'E'), mel: BOSSA },
  // the theme left open in F, its last half bar on D7sus4 (G's dominant) under the harp
  planet: { tonic: 53, ch: roman('I | IVmaj7 | vi7 | V | IVmaj7 | vi9 | ii7 V | V VI7sus4', 'F'), mel: THEME + "2':12 -:4" },
  light: { tonic: 55, ch: roman('I | IVmaj7 | vi7 | V | IVmaj7 | vi9 | ii7 V | I', 'G'), mel: THEME + "1':16" },
  coda: { tonic: 55, ch: roman('I69 | . | . | . | . | .', 'G'), mel: SIGNAL },
  // later passes: the four notes in G, quietly, into the light
  hush: { tonic: 55, ch: roman('Imaj9 | IVmaj9 | vi9 | V9sus4', 'G'), mel: SIGNAL },
};

/** Every section's chords, parsed once: an arranger looks a bar ahead (a bass line leaning into the next root). */
const SEC_CHORDS: Record<string, Chord[][]> = Object.fromEntries(Object.entries(secs).map(([k, s]) => [k, chords(s.ch)]));

/** The chord at the top of the next bar (the next section's first at a section's end). */
function nextChord(c: Bar): Chord {
  const bars = SEC_CHORDS[c.sec];
  return c.i + 1 < bars.length ? bars[c.i + 1][0] : SEC_CHORDS[c.next][0][0];
}

/** Hits from a pattern of velocities, one character a step: 1–9 (ninths of full), x full, . rest (spaces ignored). */
function beats(p: string, fn: (step: number, vel: number) => void): void {
  const s = p.replace(/\s/g, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const v = ch === 'x' ? 1 : ch >= '1' && ch <= '9' ? Number(ch) / 9 : 0;
    if (v) fn(i, v);
  }
}

/**
 * The bar's tune on a wind, phrased: a note on a beat or after a rest is tongued; an off-beat note that follows the
 * one before is slurred on from it (`slurs`), so the theme's quick 3+3+2 rise speaks as one gesture.
 */
function phrase(c: Bar, play: Wind, vel: number, oct: number, slurs: (n: MelNote, prev: MelNote) => boolean, at: Bar['at'] = c.at): void {
  const mel = c.mel;
  mel.forEach((n, j) => {
    const prev = mel[j - 1], next = mel[j + 1];
    const joins = (a: MelNote | undefined, b: MelNote | undefined) => !!a && !!b && a.at + a.len === b.at && a.semi !== b.semi && slurs(b, a);
    const slur = joins(prev, n);
    const held = joins(n, next);
    const len = c.dur(n.len) * (held ? 1.05 : 0.9);
    const v = vel * (n.at === 0 ? 1 : n.at % 4 === 0 ? 0.95 : 0.88) * (0.95 + c.r() * 0.1);
    at(n.at, (t) => play(t, c.tonic + n.semi + oct, len, v, slur), !slur);
  });
}

/** A bar's `at` with its odd sixteenths laid back by `late` of a step (the garage's lazy funk; the track is straight). */
const swung = (c: Bar, late: number): Bar['at'] => (step, fn, human) => c.at(step % 2 === 1 ? step + late : step, fn, human);

/** The notes of a major scale in the section's key from `lo` to `hi` (a harp's glissando). */
function scale(tonic: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if ([0, 2, 4, 5, 7, 9, 11].includes((((m - tonic) % 12) + 12) % 12)) out.push(m);
  return out;
}

// ── the piece ───────────────────────────────────────────────────────────────────────────────
export const track: TrackDef = {
  bpm: 108,
  steps: 16,
  beat: 4,
  tonic: 48,
  delay: 3,
  lo: 53,
  hi: 72,
  size: 4,
  bassLo: 33,
  gain: 0.87,
  secs,
  form: (pass) => (pass === 0 ? ['intro', 'garage', 'citypop', 'bossa', 'planet', 'light', 'coda'] : ['hush', 'light', 'coda']),
  setup(k: Setup) {
    const { ctx, r } = k;
    // the light and the frame round it
    const cel = makeCelesta(ctx, k.strip('celesta', { gain: 0.5, rev: 0.34, del: 0.16 }), r);
    const glass = makeGlassPad(ctx, k.strip('glass', { gain: 0.42, rev: 0.45, del: 0.08 }), r, { attack: 1.4, release: 2.6 });
    // Act I: the garage
    const whistle = makeWhistle(ctx, k.strip('whistle', { gain: 0.62, rev: 0.2, del: 0.1 }), r);
    const rhodes = makeEPiano(ctx, k.strip('rhodes', { gain: 0.42, group: 'rhythm', rev: 0.16, del: 0.03 }), r, { model: 'rhodes', tremolo: 3.6, onStop: k.onStop });
    const bass = makeElectricBass(ctx, k.strip('bass', { gain: 0.8, group: 'rhythm', rev: 0.03 }), r, { warm: [28, 52] });
    const funk = makeFunkKit(ctx, k.strip('funk', { gain: 0.42, group: 'rhythm', rev: 0.07 }), r);
    // Act II: city pop
    const lyricon = makeLyricon(ctx, k.strip('lyricon', { gain: 0.52, rev: 0.2, del: 0.14 }), r, { onStop: k.onStop });
    const brass = makeFMBrass(ctx, k.strip('brass', { gain: 0.5, group: 'rhythm', rev: 0.2, del: 0.04 }), r, { onStop: k.onStop });
    const dx = makeEPiano(ctx, k.strip('dx', { gain: 0.5, group: 'rhythm', rev: 0.18, del: 0.06 }), r, { model: 'dx', onStop: k.onStop });
    const slap = makeFMBass(ctx, k.strip('slap', { gain: 0.72, group: 'rhythm', rev: 0.04 }), r);
    const linn = makeEightiesKit(ctx, k.strip('linn', { gain: 0.32, group: 'rhythm', rev: 0.08 }), r);
    // Act III: bossa nova
    const flute = makeFlute(ctx, k.strip('flute', { gain: 0.72, rev: 0.26, del: 0.08 }), r);
    const nylon = makeNylon(ctx, k.strip('nylon', { gain: 0.75, group: 'rhythm', rev: 0.15 }), r, { warm: [40, 76] });
    const upright = makeUprightBass(ctx, k.strip('upright', { gain: 0.85, group: 'rhythm', rev: 0.08 }), r, { warm: [33, 52] });
    const brush = makeBrushKit(ctx, k.strip('brushes', { gain: 0.7, group: 'rhythm', rev: 0.12 }), r);
    const perc = makePercussion(ctx, k.strip('perc', { gain: 0.36, group: 'rhythm', rev: 0.12 }), r);
    // Act IV: the planet
    const marimba = makeMarimba(ctx, k.strip('marimba', { gain: 0.38, group: 'rhythm', rev: 0.16 }), r);
    const pan = makeSteelPan(ctx, k.strip('pan', { gain: 0.6, rev: 0.18, del: 0.06 }), r, { roll: 12 });
    // Act V: the light
    const choir = makeChoir(ctx, k.strip('choir', { gain: 0.45, rev: 0.42 }), r, { voices: 3, attack: 0.6, release: 1.8 });
    const strings = makeStrings(ctx, k.strip('strings', { gain: 0.62, rev: 0.32, del: 0.03 }), r, { players: 3 });
    const glock = makeGlock(ctx, k.strip('glock', { gain: 0.3, rev: 0.28, del: 0.08 }), r);
    const harp = makeHarp(ctx, k.strip('harp', { gain: 0.6, rev: 0.3 }), r, { warm: [43, 91] });
    const kit = makeFunkKit(ctx, k.strip('kit', { gain: 0.42, group: 'rhythm', rev: 0.16 }), r);
    for (const d of [funk, linn, brush, perc, kit]) d.warm();
    cel.warm(74, 107);
    glock.warm(84, 104);
    marimba.warm(36, 84);
    pan.warm(70, 90);

    /** Into the light: a harp glissando up the new key and the strings swelling on its dominant. */
    const lift = (c: Bar) => {
      const notes = scale(55, 55, 91);
      c.at(8, (t) => harp.gliss(t, notes, c.dur(8) / notes.length, 0.55));
      c.at(8, (t) => strings(t, voicingAt(c, 8), c.dur(8.4), 0.6, 1));
    };

    // ── intro and hush: the four notes on the celesta, the glass blooming under them ─────────
    const intro = (c: Bar) => {
      const up = c.tonic >= 53 ? 12 : 24;
      chordsOn(c, (t, v, d) => glass(t, v.map((m) => m + 12), d * 1.08, 0.3 + 0.1 * c.i));
      for (const n of c.mel) {
        const m = c.tonic + n.semi + up;
        c.at(0, (t) => cel(t, m, c.dur(12), 0.6 + 0.04 * c.i));
        c.at(10, (t) => cel(t, m + 12, c.dur(6), 0.26));
      }
      if (!last(c)) return;
      if (c.sec === 'intro') {
        // the drummer's pickup and the bass walking up into the garage
        c.at(8, (t) => funk.hat(t, 0.3, 'pedal'));
        c.at(12, (t) => funk.hat(t, 0.34, 'pedal'));
        beats('.... .... .... 2.34', (s, v) => c.at(s, (t) => funk.snare(t, v * 0.8, 'ghost'), true));
        c.at(14, (t) => funk.kick(t, 0.5));
        [[12, 31], [14, 33], [15, 35]].forEach(([s, m]) => c.at(s, (t) => bass(t, m, c.dur(1.6), 0.62 + s * 0.01), true));
      } else lift(c);
    };

    // ── the garage (C): a whistle over Rhodes, a fingered bass, a light funk kit ────────────
    const RH: [number, number, number, boolean][][] = [
      [[0, 6, 0.58, false], [6, 1.5, 0.38, true], [10, 3, 0.5, false], [14, 1.5, 0.36, true]],
      [[0, 3, 0.56, false], [3, 3, 0.42, true], [8, 6, 0.54, false], [14, 1.5, 0.38, true]],
    ];
    const garage = (c: Bar) => {
      const { i } = c;
      // the band leans back on the sixteenths (era0 swings them); the LinnDrum at the end stays on the grid
      const at = swung(c, 0.13);
      phrase(c, whistle, i < 4 ? 0.72 : 0.8, 24, (n) => n.len <= 2 || n.at % 4 === 2, at);
      for (const [s, len, v, top] of RH[i % 2]) {
        const vo = voicingAt(c, s);
        at(s, (t) => keysChord(rhodes, r, t, top ? vo.slice(-3) : vo, c.dur(len), hum(c, v), 0.012), true);
      }
      // the bass locks with the kick, the octave on the and of two, a chromatic step into the next root
      const R = (s: number) => bassIn(c, s, 33);
      const n = bassNote(nextChord(c), 33);
      const line: [number, number, number, number, boolean][] = [
        [0, R(0), 2.5, 0.95, false], [2, R(0), 0.6, 0.3, true], [3, R(0), 1.2, 0.62, false], [6, R(0) + 12, 1, 0.8, false],
        c.v2 ? [7, R(8) - 1, 0.9, 0.6, false] : [7, R(0) + 12, 0.6, 0.3, true],
        c.v2 ? [8, R(8), 2, 0.86, false] : [8, R(8) + 7, 1.5, 0.7, false],
        [10, R(10), 1.8, 0.76, false], [11, R(10), 0.6, 0.28, true], [12, R(12) + (i % 2 ? 12 : 7), 1, 0.66, false],
        [14, R(14) + 12, 0.9, 0.6, false], n !== R(14) ? [15, n - 1, 0.9, 0.62, false] : [15, R(14), 0.6, 0.3, true],
      ];
      if (last(c)) line.splice(line.length - 4);
      for (const [s, m, len, v, ghost] of line) at(s, (t) => bass(t, m, c.dur(len), hum(c, v, 0.06), ghost), true);
      // the kit: a 70s soul groove, ghost notes round the backbeat, the hat opening on the and of four every fourth bar
      const soft = 0.82;
      if (!last(c)) {
        beats(i % 4 === 3 ? '6242 6242 6242 62..' : '6242 6242 6242 6242', (s, v) => at(s, (t) => funk.hat(t, v * soft * 0.9), true));
        if (i % 4 === 3) at(14, (t) => funk.hat(t, 0.55, 'open'), true);
        beats('9..7 ..8. ..9. ....', (s, v) => at(s, (t) => funk.kick(t, v * soft), true));
        beats('.... 9... .... 9...', (s, v) => at(s, (t) => funk.snare(t, v * soft), true));
        beats('...2 ...2 .2.3 ...2', (s, v) => at(s, (t) => funk.snare(t, v * soft, 'ghost'), true));
      } else {
        // out of the garage: the last hits, then the LinnDrum's gated toms announce the eighties
        beats('6242 6242 6...', (s, v) => at(s, (t) => funk.hat(t, v * soft * 0.9), true));
        beats('9..7 ..8. x...', (s, v) => at(s, (t) => funk.kick(t, v * soft), true));
        beats('.... 9... x...', (s, v) => at(s, (t) => funk.snare(t, v * soft), true));
        [[12, 55], [13, 52], [14, 48], [15, 43]].forEach(([s, p]) => c.at(s, (t) => linn.tom(t, 0.7 + s * 0.015, p)));
        c.at(8, (t) => brass(t, voicingAt(c, 8), c.dur(8), 0.72, 'swell'));
      }
    };

    // ── city pop (D): Lyricon, FM brass answers, DX, slap bass, the LinnDrum ─────────────────
    /** The DX comps round the tune, not with it: the downbeat, then the a of two and the ands of three and four. */
    const DX_HITS: [number, number, number][] = [[0, 3, 0.56], [7, 1.5, 0.42], [10, 2, 0.48], [14, 2, 0.46]];
    /** The horns per bar: [step, length, velocity, shape]; they answer where the tune holds a long note. */
    const HORNS: [number, number, number][][] = [
      [[0, 2, 0.82]],
      [[11, 1, 0.62], [12, 1.5, 0.7], [14, 2, 0.82]],
      [],
      [[10, 1, 0.62], [11, 1, 0.66], [14, 2, 0.84]],
      [[0, 2, 0.86]],
      [[11, 1, 0.64], [12, 1.5, 0.72], [14, 2, 0.86]],
      [[8, 2, 0.78], [11, 1, 0.66]],
      [[0, 5, 0.92]],
    ];
    const citypop = (c: Bar) => {
      const { i } = c;
      const end = last(c);
      // the tune: the Lyricon gliding through the slurs, brighter in the second half
      phrase(c, lyricon, i < 4 ? 0.76 : 0.84, 12, (n) => n.at % 4 !== 0);
      for (const [s, len, v] of HORNS[i]) c.at(s, (t) => brass(t, voicingAt(c, s), c.dur(len) * 0.9, v, len > 3 ? 'hold' : 'stab'));
      // the DX in pushed sixteenths; at the end it holds E's dominant alone
      if (!end) for (const [s, len, v] of DX_HITS) c.at(s, (t) => keysChord(dx, r, t, voicingAt(c, s), c.dur(len) * 0.92, hum(c, v), 0.003));
      else {
        c.at(0, (t) => keysChord(dx, r, t, c.v, c.dur(6), 0.6, 0.004));
        c.at(8, (t) => keysChord(dx, r, t, voicingAt(c, 8), c.dur(8.5), 0.5, 0.02));
      }
      // the slap line: thumb, pops on the octave, ghosts, an approach into the next root
      const R = (s: number) => bassIn(c, s, 33);
      const n = bassNote(nextChord(c), 33);
      type Art = 'finger' | 'slap' | 'pop' | 'ghost';
      const line: [number, number, Art, number, number][] = end
        ? [[0, R(0), 'slap', 1, 4], [8, R(8), 'finger', 0.8, 7]]
        : [
            [0, R(0), 'slap', 1, 1.6], [2, R(0), 'ghost', 0.55, 0.5], [3, R(0) + 12, 'pop', 0.82, 1], [5, R(0), 'slap', 0.68, 0.8],
            [6, R(0), 'slap', 0.78, 0.5], [7, R(0) + 12, 'pop', 0.68, 0.7],
            c.v2 ? [8, R(8), 'slap', 0.9, 1.4] : [8, R(8), 'ghost', 0.5, 0.5],
            [10, R(10) + 7, 'slap', 0.74, 1], [11, R(10) + 12, 'pop', 0.8, 0.8], [12, R(12), 'slap', 0.88, 1], [13, R(12), 'ghost', 0.45, 0.5],
            [14, R(14) + 12, 'pop', 0.86, 0.7], [15, n !== R(14) ? n - 1 : R(14) + 7, 'slap', 0.62, 0.8],
          ];
      for (const [s, m, art, v, len] of line) c.at(s, (t) => slap(t, m, c.dur(len) * 0.9, v, art));
      // the machine: open hats on the off-beat, the backbeat with claps from bar two, the cowbell in the second half
      if (!end) {
        beats('6343 63.3 6343 63.3', (s, v) => c.at(s, (t) => linn.hat(t, v)));
        beats('.... ..6. .... ..6.', (s, v) => c.at(s, (t) => linn.hat(t, v, true)));
        beats(i % 2 ? 'x..7 ..x. ..7. x...' : 'x... ..7. x..6 ....', (s, v) => c.at(s, (t) => linn.kick(t, v)));
        beats('.... x... .... x...', (s, v) => c.at(s, (t) => linn.snare(t, v)));
        if (i >= 1) beats('.... 8... .... x...', (s, v) => c.at(s, (t) => linn.clap(t, v)));
        if (i >= 4 && i < 7) beats('x..6 ..7. .6.. 7.6.', (s, v) => c.at(s, (t) => linn.cowbell(t, v * 0.55)));
        if (i === 3) beats('.... .... ..5. ..5.', (s, v) => c.at(s, (t) => linn.rim(t, v)));
        if (i === 6) [[12, 52], [13, 48], [14, 45], [15, 43]].forEach(([s, p]) => c.at(s, (t) => linn.tom(t, 0.62, p)));
      } else {
        // the band's last hit on D, then the breakdown: B9sus4 alone, the brushes and the flute coming in
        c.at(0, (t) => (linn.kick(t, 1), linn.snare(t, 0.9), linn.clap(t, 0.9), linn.hat(t, 0.8, true)));
        c.at(8, (t) => brush.swish(t, c.dur(8), 0.45));
        [[12, 2], [13, 4], [14, 5], [15, 7]].forEach(([s, semi]) => c.at(s, (t) => flute(t, 64 + semi, c.dur(1.1), 0.52 + s * 0.01, s > 12), s === 12));
      }
    };

    const P1 = [0, -1, 2, 1, -1, 3, 2, -1, 0, -1, 2, 1, -1, 3, 2, -1];
    const P1B = [2, -1, 0, 3, -1, 1, 0, -1, 2, -1, 3, 1, -1, 0, 1, -1];
    const P2 = [-1, 2, -1, -1, 1, -1, -1, 3, -1, 2, -1, -1, 1, -1, -1, 0];
    /** Two marimba players, panned apart, each playing ten or six of the sixteen sixteenths: one continuous line. */
    const mallets = (c: Bar, dyn: number, from = 0) => {
      for (let s = from; s < 16; s++) {
        const v = voicingAt(c, s);
        const hi = [...v.slice(1), v[0] + 12];
        const acc = s === 0 ? 1.1 : s === 6 || s === 12 ? 1.04 : 0.9 + c.r() * 0.08;
        const a = (c.i % 4 < 2 ? P1 : P1B)[s], b = P2[s];
        if (a >= 0) c.at(s, (t) => marimba(t, v[a], c.dur(1), Math.min(1, dyn * acc), -0.55));
        if (b >= 0) c.at(s, (t) => marimba(t, hi[b], c.dur(1), Math.min(1, dyn * acc * 0.95), 0.55));
      }
    };
    // ── bossa (E): flute over a nylon guitar, upright bass, brushes, a ganzá ────────────────
    /** The guitar's two-bar clave: [step, length] in this bar, alternating. */
    const CLAVE: [number, number][][] = [[[0, 5], [6, 5], [12, 4]], [[4, 5], [10, 5]]];
    const bossa = (c: Bar) => {
      const { i } = c;
      const end = last(c);
      phrase(c, flute, i < 4 ? 0.68 : 0.74, 12, (n) => n.at % 4 !== 0);
      // the guitar: the chord on the clave, pinched; the thumb softly on one and three
      for (const [s, len] of CLAVE[i % 2]) {
        if (end && s >= 8) continue;
        c.at(s, (t) => nylon.strum(t, voicingAt(c, s), c.dur(len) * 0.85, hum(c, s === 0 ? 0.5 : 0.44), 'down', 0.006), true);
      }
      if (end) c.at(8, (t) => nylon.strum(t, voicingAt(c, 8), c.dur(8), 0.5, 'down', 0.018), true);
      for (const s of [0, 8]) c.at(s, (t) => nylon.note(t, bassIn(c, s, 40), c.dur(6), 0.36), true);
      // the bass: the surdo's dotted rhythm, root and fifth, the next root approached from a step below
      const R = (s: number) => bassIn(c, s, 33);
      const n = bassNote(nextChord(c), 33);
      // the fifth of the chord (over a first inversion, a minor third above the bass)
      const F = (s: number) => R(s) + (c.ch.bass !== c.ch.root ? 3 : 7);
      const line: [number, number, number, number][] = [
        [0, R(0), 5.5, 0.8], [6, F(6), 1.8, 0.55], [8, c.v2 ? R(8) : F(8), 5.5, 0.72], [14, n !== R(14) ? n - (n > R(14) ? 1 : -2) : R(14), 1.8, 0.56],
      ];
      for (const [s, m, len, v] of line) c.at(s, (t) => upright(t, m, c.dur(len), hum(c, v, 0.05)), true);
      // brushes: the left hand's half-note circles, the right hand's taps, the bossa kick, the clave on the snare
      if (!end) {
        for (const s of [0, 8]) c.at(s, (t) => brush.swish(t, c.dur(8) * 0.94, 0.5), true);
        beats('5.3. 4.3. 5.3. 4.33', (s, v) => c.at(s, (t) => brush.tap(t, v * 0.9), true));
        beats('4... ..3. 4... ..3.', (s, v) => c.at(s, (t) => brush.kick(t, v), true));
        beats(i % 2 ? '.... 5... ..5. ....' : '5... ..5. .... 5...', (s, v) => c.at(s, (t) => brush.snare(t, v * 0.8), true));
        if (i >= 2) beats('3235 3235 3235 3235', (s, v) => c.at(s, (t) => perc.shaker(t, v * 0.7, v > 0.5 ? 0.08 : 0.05), true));
      } else {
        c.at(0, (t) => brush.swish(t, c.dur(8), 0.5), true);
        beats('5.3. 4.3.', (s, v) => c.at(s, (t) => brush.tap(t, v * 0.9), true));
        c.at(0, (t) => brush.kick(t, 0.5));
        // out of it: the djembe calls, the marimbas fade in on C7sus4
        beats('.... .... 7.6. 7799', (s, v) => c.at(s, (t) => perc.djembe(t, v * 0.9, s >= 14 ? 'bass' : s % 2 ? 'tone' : 'slap'), true));
        mallets(c, 0.34, 8);
      }
    };

    // ── the planet (F): marimbas interlocking, a steel pan lead, djembe, the bell ───────────
    const planet = (c: Bar) => {
      const { i } = c;
      const end = last(c);
      // the tune on the steel pan, its long notes rolled
      for (const n of c.mel) c.at(n.at, (t) => pan(t, c.tonic + n.semi + 12, c.dur(n.len) * 0.96, hum(c, n.at === 0 ? 0.86 : 0.78, 0.05), 0.1), true);
      mallets(c, 0.5 + 0.03 * i);
      // the bass marimba on the 3+3+2, the octave on the last in every other bar
      for (const s of [0, 6, 12]) c.at(s, (t) => marimba(t, bassIn(c, s, 36) + (s === 12 && i % 2 ? 12 : 0), c.dur(s === 12 ? 4 : 6), 0.72));
      // the bell on the son clave (the theme's tresillo, answered), djembe, shaker
      beats('7..6 ..7. ..6. 6...', (s, v) => c.at(s, (t) => perc.agogo(t, v * 0.6, s === 0 || s === 6 ? 'low' : 'high'), true));
      const dj: [number, 'bass' | 'tone' | 'slap', number][] = end
        ? [[0, 'bass', 0.9], [3, 'tone', 0.6], [4, 'slap', 0.75], [8, 'slap', 0.8], [9, 'slap', 0.7], [10, 'tone', 0.75], [11, 'tone', 0.7], [12, 'slap', 0.85], [13, 'slap', 0.8], [14, 'tone', 0.85], [15, 'bass', 0.9]]
        : [[0, 'bass', 0.9], [3, 'tone', 0.6], [4, 'slap', 0.75], [7, 'tone', 0.5], [8, 'bass', 0.8], [10, 'tone', 0.55], [12, 'slap', 0.8], [14, 'tone', 0.5], [15, 'tone', 0.45]];
      for (const [s, how, v] of dj) c.at(s, (t) => perc.djembe(t, hum(c, v, 0.06), how), true);
      beats('4232 4232 4232 4232', (s, v) => c.at(s, (t) => perc.shaker(t, v * 0.6, 0.05), true));
      // the choir's "ooh" swelling in over the second half
      if (i >= 4) chordsOn(c, (t, v, d) => choir(t, v, d, 0.34 + 0.05 * (i - 4), 'oo'));
      if (end) lift(c);
    };

    // ── the light (G): strings in octaves, celesta and glock, choir, brass, harp, the full kit ─
    type Tom = [number, 'high' | 'mid' | 'floor', number];
    const TOMS_SHORT: Tom[] = [[12, 'high', 0.66], [13, 'high', 0.7], [14, 'mid', 0.74], [15, 'floor', 0.8]];
    const TOMS_LONG: Tom[] = [[9, 'high', 0.7], [10, 'high', 0.74], [11, 'mid', 0.76], [12, 'mid', 0.8], [13, 'floor', 0.82], [14, 'floor', 0.86], [15, 'floor', 0.9]];
    /** The harp rolling eighths up and down through the chord. */
    const harpRoll = (c: Bar, dyn: number) => {
      const order = [0, 1, 2, 3, 4, 5, 4, 2];
      for (let s = 0; s < 16; s += 2) {
        const v = voicingAt(c, s);
        const up = [...v, v[0] + 12, v[1] + 12];
        c.at(s, (t) => harp.note(t, up[order[s / 2]], c.dur(4), hum(c, (s % 4 === 0 ? 0.46 : 0.38) * dyn, 0.08)), true);
      }
    };
    /** The light on later passes, under the epilogues and the credits: the same tune and colours, at rest. */
    const lightGently = (c: Bar) => {
      const { i } = c;
      const end = last(c);
      if (i < 4) {
        // the first half on one of the medley's leads in turn, the flute (Act III) or the steel pan (Act IV); the
        // celesta two octaves up like a music box
        if (c.pass % 2) phrase(c, flute, 0.7, 12, (n) => n.at % 4 !== 0);
        else for (const n of c.mel) c.at(n.at, (t) => pan(t, c.tonic + n.semi + 12, c.dur(n.len) * 0.96, hum(c, n.at === 0 ? 0.8 : 0.72, 0.05), 0.1), true);
        for (const n of c.mel) c.at(n.at, (t) => cel(t, c.tonic + n.semi + 24, c.dur(n.len), hum(c, n.at === 0 ? 0.4 : 0.34, 0.06)), true);
      } else {
        c.mel.forEach((n, j) => {
          const prev = c.mel[j - 1];
          const legato = !!prev && prev.at + prev.len === n.at && n.at % 4 !== 0;
          const m = c.tonic + n.semi + 12;
          c.at(n.at, (t) => strings(t, [m - 12, m], c.dur(n.len) * 1.02, hum(c, n.at === 0 ? 0.72 : 0.64, 0.05), 0, legato), !legato);
          c.at(n.at, (t) => cel(t, m + 12, c.dur(n.len), hum(c, n.at === 0 ? 0.46 : 0.4, 0.06)), true);
        });
      }
      chordsOn(c, (t, v, d) => choir(t, v, d, i < 4 ? 0.42 : 0.52, i < 4 ? 'oo' : 'ah'));
      if (i % 2 === 1 && !end) c.at(8, (t) => brass(t, voicingAt(c, 8), c.dur(7.5), 0.42, 'swell'));
      harpRoll(c, 0.85);
      // the bass: roots and fifths on the dotted rhythm, the next root approached by a half step
      const R = (s: number) => bassIn(c, s, 28);
      const n = bassNote(nextChord(c), 28);
      const line: [number, number, number, number][] = end
        ? [[0, R(0), 7, 0.78], [8, R(8), 7, 0.68]]
        : [[0, R(0), 5.5, 0.8], [6, R(0) + 7, 1.6, 0.54], [8, c.v2 ? R(8) : R(8) + 7, 5.5, 0.7], [14, n !== R(14) ? n + (n > R(14) ? -1 : 1) : R(14) + 12, 1.6, 0.56]];
      for (const [s, m, len, v] of line) c.at(s, (t) => bass(t, m, c.dur(len), hum(c, v, 0.05)), true);
      // a soft half-time kit: the foot on one, a cross-stick on three, eighth hats
      if (i === 0) c.at(0, (t) => kit.crash(t, 0.5));
      if (!end) {
        beats('7... .... ..5. ....', (s, v) => c.at(s, (t) => kit.kick(t, v * 0.8), true));
        beats('.... .... 7... ....', (s, v) => c.at(s, (t) => kit.snare(t, v * 0.75, 'cross'), true));
        beats('5.3. 4.3. 5.3. 4.3.', (s, v) => c.at(s, (t) => kit.hat(t, v * 0.6), true));
        if (i % 4 === 3) c.at(14, (t) => kit.hat(t, 0.34, 'half'), true);
      } else {
        beats('7... .... 6...', (s, v) => c.at(s, (t) => kit.kick(t, v * 0.8), true));
        TOMS_LONG.forEach(([s, w, v]) => c.at(s, (t) => kit.tom(t, v * 0.62, w), true));
      }
    };
    const light = (c: Bar) => {
      const { i } = c;
      const end = last(c);
      // later passes (the epilogues and the credits): the light, gently. The flute (Act III's voice) sings the first
      // half, the strings take the climb; no brass hits, a soft half-time kit, the bass on roots and fifths
      if (c.pass > 0) return lightGently(c);
      // the tune: violins with the violas an octave under, slurred on the off-beats; the celesta and glock above
      c.mel.forEach((n, j) => {
        const prev = c.mel[j - 1];
        const legato = !!prev && prev.at + prev.len === n.at && n.at % 4 !== 0;
        const m = c.tonic + n.semi + 12;
        c.at(n.at, (t) => strings(t, [m - 12, m], c.dur(n.len) * (end ? 1 : 1.02), hum(c, n.at === 0 ? 0.84 : 0.76, 0.05), 0, legato), !legato);
        c.at(n.at, (t) => cel(t, m + 12, c.dur(n.len), hum(c, n.at === 0 ? 0.62 : 0.54, 0.06)), true);
        c.at(n.at, (t) => glock(t, m + 12, c.dur(n.len), hum(c, n.at === 0 ? 0.5 : 0.42, 0.06)), true);
      });
      // the choir on "ah", the chords held
      chordsOn(c, (t, v, d) => choir(t, v, d, 0.62, 'ah'));
      // the brass: the theme's 3+3+2 hit as chords where it rises, held answers where it rests
      if (i % 2 === 0 && i < 6) for (const s of [0, 3, 6]) c.at(s, (t) => brass(t, voicingAt(c, s), c.dur(2.2), s ? 0.66 : 0.8, 'stab'));
      else if (i < 6) c.at(8, (t) => brass(t, voicingAt(c, 8), c.dur(7.5), 0.6, 'swell'));
      else if (i === 6) for (const s of [0, 8]) c.at(s, (t) => brass(t, voicingAt(c, s), c.dur(6), 0.72, 'hold'));
      else c.at(0, (t) => brass(t, c.v, c.dur(14), 0.8, 'hold'));
      harpRoll(c, 1);
      // the bass: disco octaves
      for (let s = 0; s < 16; s += 2) {
        if (end && s >= 8) break;
        const root = bassIn(c, s, 28);
        c.at(s, (t) => bass(t, root + (s % 4 === 2 ? 12 : 0), c.dur(1.7), hum(c, s % 4 === 0 ? 0.9 : 0.72, 0.05)), true);
      }
      // the full kit, four on the floor: the foot on the beats, the hat open on the ands, the crash on the arrivals
      if (i === 0 || i === 4) c.at(0, (t) => kit.crash(t, 0.9));
      if (!end) {
        beats('x... x... x... x...', (s, v) => c.at(s, (t) => kit.kick(t, v * 0.92), true));
        beats('.... x... .... x...', (s, v) => c.at(s, (t) => kit.snare(t, v * 0.9, i % 4 === 3 ? 'rim' : 'center'), true));
        beats('5... 5... 5... 5...', (s, v) => c.at(s, (t) => kit.hat(t, v, 'pedal'), true));
        beats('..7. ..7. ..7. ..7.', (s, v) => c.at(s, (t) => kit.hat(t, v * 0.8, 'open'), true));
        beats('...3 ...3 ...3 ..33', (s, v) => c.at(s, (t) => kit.snare(t, v, 'ghost'), true));
        beats('.4.6 .4.6 .4.6 .4.6', (s, v) => c.at(s, (t) => perc.tambourine(t, v * 0.6), true));
        if (i === 3) TOMS_SHORT.forEach(([s, w, v]) => c.at(s, (t) => kit.tom(t, v, w), true));
      } else {
        // into the coda: the band's last bar broadens, the toms roll down
        beats('x... x... x...', (s, v) => c.at(s, (t) => kit.kick(t, v * 0.92), true));
        beats('.... x... x...', (s, v) => c.at(s, (t) => kit.snare(t, v * 0.9), true));
        beats('5... 5...', (s, v) => c.at(s, (t) => kit.hat(t, v, 'pedal'), true));
        TOMS_LONG.forEach(([s, w, v]) => c.at(s, (t) => kit.tom(t, v, w), true));
      }
    };

    // ── the coda (G): the four notes, slowly, over a held G6/9 ───────────────────────────────
    const coda = (c: Bar) => {
      const { i } = c;
      if (i === 0) {
        // the landing: the last crash and the low G, the harp's chord, the strings and glass holding on
        c.at(0, (t) => (kit.crash(t, 0.95), kit.kick(t, 0.9)));
        c.at(0, (t) => bass(t, 31, c.dur(28), 0.9));
        c.at(0, (t) => harp.chord(t, [43, 50, ...c.v, c.v[c.v.length - 1] + 5], c.dur(40), 0.6, 0.05));
        c.at(0, (t) => strings(t, [43, ...c.v], c.dur(16 * 4.5), 0.5, -0.7));
        c.at(0, (t) => glass(t, c.v.map((m) => m + 12), c.dur(16 * 5.5), 0.42));
      }
      // the four notes: the celesta, each answered an octave up; the choir singing them on "ah" closing to "oo"
      for (const n of c.mel) {
        const m = c.tonic + n.semi + 12;
        c.at(0, (t) => cel(t, m + 12, c.dur(14), 0.58 - 0.03 * i));
        c.at(8, (t) => cel(t, m + 24, c.dur(8), 0.24));
        c.at(0, (t) => choir(t, [m], c.dur(15), 0.5 - 0.03 * i, 'ah', 'oo'));
      }
    };

    const ERA: Record<string, (c: Bar) => void> = { intro, hush: intro, garage, citypop, bossa, planet, light, coda };
    return (c) => ERA[c.sec](c);
  },
};
