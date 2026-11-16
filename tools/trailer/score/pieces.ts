/**
 * The marketing score (second version, for the game's v0.15.4 soundtrack "Five Ages"): four cues on the game's theme
 * (so–do–re–mi rising on a 3+3+2 beat: src/audio/theme.ts), written to the bar map in tools/trailer/music-map.mjs
 * (120 BPM, a bar = 2 s). The music grows with the civilisation as it does in the game, so the trailer changes
 * genre where the picture changes act:
 *
 *   trailer  92 s   the game's Type I medley (src/audio/tracks/ending.ts) cut to the picture, a key higher each act:
 *                   the four notes (C) · garage funk (C) · city pop (D) · bossa nova (E) · mallets and hand drums (F)
 *                   · the Moon's hush (G) · the light (G) · the climb · home
 *   teaser   27 s   G major: the four notes, the light at full bloom, the climb, home
 *   calm     18 s   E major: the theme's eight bars as a bossa nova (one campus, one day)
 *   rise     15 s   G major: four bars of marimbas and drums gathering under the four notes, one impact, home
 *
 * The band and its arranging are the medley's own (the same instruments from src/audio/voices/ at the same levels,
 * the same lines bar for bar where a section is the medley's length); what is new is each section's length, the way
 * out of it, the climb into the last hit and the trailer's own hits, risers and rumbles (fx.ts).
 */
import { bassIn, chordsOn, hum, last, voicingAt } from '../../../src/audio/arrange';
import { bassNote, type MelNote } from '../../../src/audio/score';
import { mtof } from '../../../src/audio/synth';
import { BRIDGE, SIGNAL, THEME, roman } from '../../../src/audio/theme';
import { makeBrushKit, makeEightiesKit, makeFunkKit, makePercussion } from '../../../src/audio/voices/drums';
import { keysChord, makeEPiano } from '../../../src/audio/voices/keys';
import { makeCelesta, makeGlock, makeMarimba, makeSteelPan } from '../../../src/audio/voices/mallets';
import { makeChoir, makeGlassPad, makeStrings } from '../../../src/audio/voices/pads';
import { makeElectricBass, makeHarp, makeNylon, makeUprightBass } from '../../../src/audio/voices/plucked';
import { makeFMBass, makeFMBrass } from '../../../src/audio/voices/synths';
import { makeFlute, makeLyricon, makeWhistle, type Wind } from '../../../src/audio/voices/winds';
import { makeFx } from './fx';
import { BAR, type PieceDef, type SecDef, type Session, type TBar, type Voicing } from './kit';

// ── the tunes, a bar at a time ──────────────────────────────────────────────────────────────
/** The theme's seven written bars and the bridge's eight (theme.ts), so a section can take as many as it has room for. */
const TH = THEME.split('|').map((b) => b.trim()).filter(Boolean);
const BR = BRIDGE.split('|').map((b) => b.trim());
const bars = (...b: string[]) => b.join(' | ');
/** The climb into the last hit: the four notes a beat each, then on up to the leading note. */
const CLIMB = "5:4 1':4 2':4 3':4 | 5':4 6':4 7':8";

const C = 48, D = 50, E = 52, F = 53, G = 55;

/** What each piece plays, section by section (also what `sanity` checks on paper). */
export const FORMS: Record<string, SecDef[]> = {
  trailer: [
    // 0–4 Earth at night: the four notes
    { sec: 'intro', tonic: C, ch: roman('Imaj9 | IVmaj9 | vi9 | V9sus4', 'C'), mel: SIGNAL },
    // 4–8 Act I: the theme's first four bars, the last half bar on A7sus4 (D major's dominant)
    { sec: 'garage', tonic: C, ch: roman('Imaj9 | IVmaj9 | vi9 | V VI7sus4', 'C'), mel: bars(...TH.slice(0, 4)) },
    // 8–16 Act II: the whole theme, home on D, then B9sus4 (E's dominant) while the band drops out
    { sec: 'citypop', tonic: D, ch: roman('Imaj9 | IVmaj9 | vi9 | V9sus4 V | IVmaj9 | vi9 | ii9 V | Imaj9 VI9sus4', 'D'), mel: THEME + "1':8 -:8" },
    // 16–20 Act III: the bridge's first three bars, the last turned to C7sus4 (F's dominant)
    { sec: 'bossa', tonic: E, ch: roman('Imaj7 | V7 | iii7 | V bVI7sus4', 'E'), mel: bars(BR[0], BR[1], BR[2], "2':4 5:4 4':8") },
    // 20–26 Act IV: the theme's first six bars (its climb to the top), the last half bar on D7sus4 (G's dominant)
    { sec: 'planet', tonic: F, ch: roman('I | IVmaj7 | vi7 | V | IVmaj7 | vi9 VI7sus4', 'F'), mel: bars(...TH.slice(0, 6)) },
    // 26–28 the Moon: two of the four notes, held
    { sec: 'hush', tonic: G, ch: roman('Imaj9 | V9sus4', 'G'), mel: "5:16 | 1':16" },
    // 28–36 Act V: the whole theme, left open on the dominant
    { sec: 'light', tonic: G, ch: roman('I | IVmaj7 | vi7 | V | IVmaj7 | vi9 | ii7 V | V', 'G'), mel: THEME + "2':12 -:4" },
    // 36–38 the pull-back from the Sun
    { sec: 'swell', tonic: G, ch: roman('IVmaj7 | V9sus4 V', 'G'), mel: CLIMB },
    // 38–44 K 1.0000, then the logo: home, the four notes a bar each
    { sec: 'coda', tonic: G, ch: roman('I69 | . | . | . | . | .', 'G'), mel: SIGNAL },
  ],
  teaser: [
    // (a 6/9 chord under the first two: the tonic would rub against a major seventh)
    { sec: 'intro', tonic: G, ch: roman('I69 | IVmaj9 V', 'G'), mel: "5:8 1':8 | 2':8 3':8" },
    { sec: 'light', tonic: G, ch: roman('I | IVmaj7 | vi7 | V | IVmaj7 | vi9', 'G'), mel: bars(...TH.slice(0, 6)) },
    { sec: 'swell', tonic: G, ch: roman('IVmaj7 | V9sus4 V', 'G'), mel: CLIMB },
    { sec: 'coda', tonic: G, ch: roman('I69 | .', 'G'), mel: "5:8 1':8 | 2':8 3':16" },
  ],
  calm: [{ sec: 'bossa', tonic: E, ch: roman('Imaj9 | IVmaj9 | vi9 | V9sus4 V | IVmaj9 | vi9 | ii9 V | I69', 'E'), mel: THEME + "1':16" }],
  rise: [
    { sec: 'planet', tonic: G, ch: roman('I | IVmaj7 | vi7 | V', 'G'), mel: SIGNAL },
    { sec: 'coda', tonic: G, ch: roman('I69 | .', 'G'), mel: "5:3 1':3 2':2 3':24" },
  ],
};

/** Where the chords sit: the medley's own ranges. */
const VOICING: Voicing = { lo: 53, hi: 72, size: 4, bassLo: 33 };

// ── small tools (the medley's) ──────────────────────────────────────────────────────────────
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
function phrase(c: TBar, play: Wind, vel: number, oct: number, slurs: (n: MelNote, prev: MelNote) => boolean, at: TBar['at'] = c.at): void {
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

/** A bar's `at` with its odd sixteenths laid back by `late` of a step (the garage's lazy funk). */
const swung = (c: TBar, late: number): TBar['at'] => (step, fn, human) => c.at(step % 2 === 1 ? step + late : step, fn, human);

/** The notes of a major scale from `lo` to `hi` (a harp's glissando). */
function scale(tonic: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if ([0, 2, 4, 5, 7, 9, 11].includes((((m - tonic) % 12) + 12) % 12)) out.push(m);
  return out;
}

/** A boom's resting pitch: the chord's root, down in the octave from D1 (37 Hz) to C#2. */
const boomHz = (root: number) => mtof(26 + ((((root - 26) % 12) + 12) % 12));

// ── the band ────────────────────────────────────────────────────────────────────────────────
interface BossaOpts {
  /** The bar the brushes come in on, and the shaker. */
  drums?: number;
  shaker?: number;
  /** The last bar: the djembe calling the marimbas in (the medley's way out), or a close on the home chord. */
  out?: 'planet' | 'close';
  /** From this bar on the lights come on: a glass chord, the celesta doubling the tune. */
  night?: number;
}
interface PlanetOpts {
  /** The bars the djembe, the bell and the choir come in on. */
  djembe?: number;
  bell?: number;
  choir?: number;
  /** The marimbas' level by bar. */
  dyn?: (i: number) => number;
  /** The last bar swells into the light (a harp glissando, the strings). */
  lift?: boolean;
  /**
   * From this bar on, the weight a trailer wants under the mallets (as the game's Act IV piece has it): an upright
   * bass and a kick on the bass marimba's 3+3+2, a cabasa on the off-beats.
   */
  low?: number;
}

function band(k: Session) {
  const { ctx, r } = k;
  const s = k.setup;
  // The medley's instruments. Its levels are an end-credits mix, the rhythm sections tucked under the tunes; a
  // trailer wants the band forward, so drums, basses and the comping instruments sit where the acts' own pieces
  // (era0–era4) have them: the kits 3–5 dB up, the Rhodes and the guitar up, the whistle down.
  // the light and the frame round it
  const cel = makeCelesta(ctx, s.strip('celesta', { gain: 0.5, rev: 0.34, del: 0.16 }), r);
  const glass = makeGlassPad(ctx, s.strip('glass', { gain: 0.42, rev: 0.45, del: 0.08 }), r, { attack: 1.4, release: 2.6 });
  // Act I: the garage
  const whistle = makeWhistle(ctx, s.strip('whistle', { gain: 0.5, rev: 0.2, del: 0.1 }), r);
  const rhodes = makeEPiano(ctx, s.strip('rhodes', { gain: 0.6, rev: 0.16, del: 0.03 }), r, { model: 'rhodes', tremolo: 3.6, onStop: s.onStop });
  const bass = makeElectricBass(ctx, s.strip('bass', { gain: 0.95, rev: 0.03 }), r, { warm: [28, 52] });
  const funk = makeFunkKit(ctx, s.strip('funk', { gain: 0.72, rev: 0.07 }), r);
  // Act II: city pop
  const lyricon = makeLyricon(ctx, s.strip('lyricon', { gain: 0.52, rev: 0.2, del: 0.14 }), r, { onStop: s.onStop });
  const brass = makeFMBrass(ctx, s.strip('brass', { gain: 0.58, rev: 0.2, del: 0.04 }), r, { onStop: s.onStop });
  const dx = makeEPiano(ctx, s.strip('dx', { gain: 0.5, rev: 0.18, del: 0.06 }), r, { model: 'dx', onStop: s.onStop });
  const slap = makeFMBass(ctx, s.strip('slap', { gain: 0.72, rev: 0.04 }), r);
  const linn = makeEightiesKit(ctx, s.strip('linn', { gain: 0.46, rev: 0.08 }), r);
  // Act III: bossa nova
  const flute = makeFlute(ctx, s.strip('flute', { gain: 0.72, rev: 0.26, del: 0.08 }), r);
  const nylon = makeNylon(ctx, s.strip('nylon', { gain: 1, rev: 0.15 }), r, { warm: [40, 76] });
  const upright = makeUprightBass(ctx, s.strip('upright', { gain: 0.85, rev: 0.08 }), r, { warm: [33, 52] });
  const brush = makeBrushKit(ctx, s.strip('brushes', { gain: 0.9, rev: 0.12 }), r);
  const perc = makePercussion(ctx, s.strip('perc', { gain: 0.5, rev: 0.12 }), r);
  // Act IV: the planet
  const marimba = makeMarimba(ctx, s.strip('marimba', { gain: 0.38, rev: 0.16 }), r);
  const pan = makeSteelPan(ctx, s.strip('pan', { gain: 0.6, rev: 0.18, del: 0.06 }), r, { roll: 12 });
  // Act V: the light
  const choir = makeChoir(ctx, s.strip('choir', { gain: 0.45, rev: 0.42 }), r, { voices: 3, attack: 0.6, release: 1.8 });
  const strings = makeStrings(ctx, s.strip('strings', { gain: 0.62, rev: 0.32, del: 0.03 }), r, { players: 3 });
  const glock = makeGlock(ctx, s.strip('glock', { gain: 0.3, rev: 0.28, del: 0.08 }), r);
  const harp = makeHarp(ctx, s.strip('harp', { gain: 0.6, rev: 0.3 }), r, { warm: [43, 91] });
  const kit = makeFunkKit(ctx, s.strip('kit', { gain: 0.62, rev: 0.16 }), r);
  // the trailer's own: hits, risers, the rocket (their own group, so they can be rebalanced against the music)
  const fx = makeFx(ctx, { low: k.strip('fx-low', { gain: 0.8, rev: 0.12 }, 'fx'), air: k.strip('fx-air', { gain: 0.6, rev: 0.4 }, 'fx') }, r);
  for (const d of [funk, linn, brush, perc, kit]) d.warm();
  cel.warm(74, 107);
  glock.warm(84, 104);
  marimba.warm(36, 84);
  pan.warm(70, 90);

  /** Into the light: a harp glissando up G major and the strings swelling on its dominant. */
  const lift = (c: TBar) => {
    const notes = scale(G, 55, 91);
    c.at(8, (t) => harp.gliss(t, notes, c.dur(8) / notes.length, 0.55));
    c.at(8, (t) => strings(t, voicingAt(c, 8), c.dur(8.4), 0.6, 1));
  };

  // ── the four notes on the celesta, the glass blooming under them ─────────────────────────
  const intro = (c: TBar) => {
    const up = c.tonic >= 53 ? 12 : 24;
    chordsOn(c, (t, v, d) => glass(t, v.map((m) => m + 12), d * 1.08, 0.3 + 0.1 * c.i));
    for (const n of c.mel) {
      const m = c.tonic + n.semi + up;
      // each note answered an octave up, five eighths of the way through it
      c.at(n.at, (t) => cel(t, m, c.dur(n.len * 0.75), 0.6 + 0.04 * c.i));
      c.at(n.at + n.len * 0.625, (t) => cel(t, m + 12, c.dur(n.len * 0.375), 0.26));
    }
    if (!last(c)) return;
    if (c.next === 'garage') {
      // the drummer's pickup and the bass walking up into the garage
      c.at(8, (t) => funk.hat(t, 0.3, 'pedal'));
      c.at(12, (t) => funk.hat(t, 0.34, 'pedal'));
      beats('.... .... .... 2.34', (st, v) => c.at(st, (t) => funk.snare(t, v * 0.8, 'ghost'), true));
      c.at(14, (t) => funk.kick(t, 0.5));
      [[12, 31], [14, 33], [15, 35]].forEach(([st, m]) => c.at(st, (t) => bass(t, m, c.dur(1.6), 0.62 + st * 0.01), true));
    } else lift(c);
  };

  // ── the garage (Act I): a whistle over Rhodes, a fingered bass, a light funk kit ────────
  const RH: [number, number, number, boolean][][] = [
    [[0, 6, 0.58, false], [6, 1.5, 0.38, true], [10, 3, 0.5, false], [14, 1.5, 0.36, true]],
    [[0, 3, 0.56, false], [3, 3, 0.42, true], [8, 6, 0.54, false], [14, 1.5, 0.38, true]],
  ];
  const garage = (c: TBar) => {
    const { i } = c;
    // the band leans back on the sixteenths; the LinnDrum at the end stays on the grid
    const at = swung(c, 0.13);
    phrase(c, whistle, i < 4 ? 0.72 : 0.8, 24, (n) => n.len <= 2 || n.at % 4 === 2, at);
    for (const [st, len, v, top] of RH[i % 2]) {
      const vo = voicingAt(c, st);
      at(st, (t) => keysChord(rhodes, r, t, top ? vo.slice(-3) : vo, c.dur(len), hum(c, v), 0.012), true);
    }
    // the bass locks with the kick, the octave on the and of two, a chromatic step into the next root
    const R = (st: number) => bassIn(c, st, 33);
    const n = bassNote(c.nextCh, 33);
    const line: [number, number, number, number, boolean][] = [
      [0, R(0), 2.5, 0.95, false], [2, R(0), 0.6, 0.3, true], [3, R(0), 1.2, 0.62, false], [6, R(0) + 12, 1, 0.8, false],
      c.v2 ? [7, R(8) - 1, 0.9, 0.6, false] : [7, R(0) + 12, 0.6, 0.3, true],
      c.v2 ? [8, R(8), 2, 0.86, false] : [8, R(8) + 7, 1.5, 0.7, false],
      [10, R(10), 1.8, 0.76, false], [11, R(10), 0.6, 0.28, true], [12, R(12) + (i % 2 ? 12 : 7), 1, 0.66, false],
      [14, R(14) + 12, 0.9, 0.6, false], n !== R(14) ? [15, n - 1, 0.9, 0.62, false] : [15, R(14), 0.6, 0.3, true],
    ];
    if (last(c)) line.splice(line.length - 4);
    for (const [st, m, len, v, ghost] of line) at(st, (t) => bass(t, m, c.dur(len), hum(c, v, 0.06), ghost), true);
    // the kit: a 70s soul groove, ghost notes round the backbeat
    const soft = 0.82;
    if (!last(c)) {
      beats(i % 4 === 3 ? '6242 6242 6242 62..' : '6242 6242 6242 6242', (st, v) => at(st, (t) => funk.hat(t, v * soft * 0.9), true));
      if (i % 4 === 3) at(14, (t) => funk.hat(t, 0.55, 'open'), true);
      beats('9..7 ..8. ..9. ....', (st, v) => at(st, (t) => funk.kick(t, v * soft), true));
      beats('.... 9... .... 9...', (st, v) => at(st, (t) => funk.snare(t, v * soft), true));
      beats('...2 ...2 .2.3 ...2', (st, v) => at(st, (t) => funk.snare(t, v * soft, 'ghost'), true));
    } else {
      // out of the garage: the last hits, then the LinnDrum's gated toms announce the eighties
      beats('6242 6242 6...', (st, v) => at(st, (t) => funk.hat(t, v * soft * 0.9), true));
      beats('9..7 ..8. x...', (st, v) => at(st, (t) => funk.kick(t, v * soft), true));
      beats('.... 9... x...', (st, v) => at(st, (t) => funk.snare(t, v * soft), true));
      [[12, 55], [13, 52], [14, 48], [15, 43]].forEach(([st, p]) => c.at(st, (t) => linn.tom(t, 0.7 + st * 0.015, p)));
      c.at(8, (t) => brass(t, voicingAt(c, 8), c.dur(8), 0.72, 'swell'));
    }
  };

  // ── city pop (Act II): Lyricon, FM brass answers, DX, slap bass, the LinnDrum ────────────
  /** The DX comps round the tune, not with it: the downbeat, then the a of two and the ands of three and four. */
  const DX_HITS: [number, number, number][] = [[0, 3, 0.56], [7, 1.5, 0.42], [10, 2, 0.48], [14, 2, 0.46]];
  /** The horns per bar: [step, length, velocity]; they answer where the tune holds a long note. */
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
  const citypop = (c: TBar) => {
    const { i } = c;
    const end = last(c);
    // the tune: the Lyricon gliding through the slurs, brighter in the second half
    phrase(c, lyricon, i < 4 ? 0.76 : 0.84, 12, (n) => n.at % 4 !== 0);
    for (const [st, len, v] of HORNS[i] ?? []) c.at(st, (t) => brass(t, voicingAt(c, st), c.dur(len) * 0.9, v, len > 3 ? 'hold' : 'stab'));
    // the DX in pushed sixteenths; at the end it holds the next key's dominant alone
    if (!end) for (const [st, len, v] of DX_HITS) c.at(st, (t) => keysChord(dx, r, t, voicingAt(c, st), c.dur(len) * 0.92, hum(c, v), 0.003));
    else {
      c.at(0, (t) => keysChord(dx, r, t, c.v, c.dur(6), 0.6, 0.004));
      c.at(8, (t) => keysChord(dx, r, t, voicingAt(c, 8), c.dur(8.5), 0.5, 0.02));
    }
    // the slap line: thumb, pops on the octave, ghosts, an approach into the next root
    const R = (st: number) => bassIn(c, st, 33);
    const n = bassNote(c.nextCh, 33);
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
    for (const [st, m, art, v, len] of line) c.at(st, (t) => slap(t, m, c.dur(len) * 0.9, v, art));
    // the machine: open hats on the off-beat, the backbeat with claps from bar two, the cowbell in the second half
    if (!end) {
      beats('6343 63.3 6343 63.3', (st, v) => c.at(st, (t) => linn.hat(t, v)));
      beats('.... ..6. .... ..6.', (st, v) => c.at(st, (t) => linn.hat(t, v, true)));
      beats(i % 2 ? 'x..7 ..x. ..7. x...' : 'x... ..7. x..6 ....', (st, v) => c.at(st, (t) => linn.kick(t, v)));
      beats('.... x... .... x...', (st, v) => c.at(st, (t) => linn.snare(t, v)));
      if (i >= 1) beats('.... 8... .... x...', (st, v) => c.at(st, (t) => linn.clap(t, v)));
      if (i >= 4 && i < 7) beats('x..6 ..7. .6.. 7.6.', (st, v) => c.at(st, (t) => linn.cowbell(t, v * 0.55)));
      if (i === 3) beats('.... .... ..5. ..5.', (st, v) => c.at(st, (t) => linn.rim(t, v)));
      if (i === 6) [[12, 52], [13, 48], [14, 45], [15, 43]].forEach(([st, p]) => c.at(st, (t) => linn.tom(t, 0.62, p)));
    } else {
      // the band's last hit, then the breakdown: the dominant alone, the brushes and the flute coming in
      c.at(0, (t) => (linn.kick(t, 1), linn.snare(t, 0.9), linn.clap(t, 0.9), linn.hat(t, 0.8, true)));
      c.at(8, (t) => brush.swish(t, c.dur(8), 0.45));
      [[12, 2], [13, 4], [14, 5], [15, 7]].forEach(([st, semi]) => c.at(st, (t) => flute(t, 64 + semi, c.dur(1.1), 0.52 + st * 0.01, st > 12), st === 12));
    }
  };

  const P1 = [0, -1, 2, 1, -1, 3, 2, -1, 0, -1, 2, 1, -1, 3, 2, -1];
  const P1B = [2, -1, 0, 3, -1, 1, 0, -1, 2, -1, 3, 1, -1, 0, 1, -1];
  const P2 = [-1, 2, -1, -1, 1, -1, -1, 3, -1, 2, -1, -1, 1, -1, -1, 0];
  /** Two marimba players, panned apart, each playing ten or six of the sixteen sixteenths: one continuous line. */
  const mallets = (c: TBar, dyn: number, from = 0) => {
    for (let st = from; st < 16; st++) {
      const v = voicingAt(c, st);
      const hi = [...v.slice(1), v[0] + 12];
      const acc = st === 0 ? 1.1 : st === 6 || st === 12 ? 1.04 : 0.9 + c.r() * 0.08;
      const a = (c.i % 4 < 2 ? P1 : P1B)[st], b = P2[st];
      if (a >= 0) c.at(st, (t) => marimba(t, v[a], c.dur(1), Math.min(1, dyn * acc), -0.55));
      if (b >= 0) c.at(st, (t) => marimba(t, hi[b], c.dur(1), Math.min(1, dyn * acc * 0.95), 0.55));
    }
  };

  // ── bossa nova (Act III): flute over a nylon guitar, upright bass, brushes, a ganzá ─────
  /** The guitar's two-bar clave: [step, length] in this bar, alternating. */
  const CLAVE: [number, number][][] = [[[0, 5], [6, 5], [12, 4]], [[4, 5], [10, 5]]];
  const bossa = (c: TBar, o: BossaOpts = {}) => {
    const { i } = c;
    const end = last(c), close = end && o.out === 'close';
    const drums = i >= (o.drums ?? 0), lit = o.night !== undefined && i >= o.night;
    phrase(c, flute, i < 4 ? 0.68 : 0.74, 12, (n) => n.at % 4 !== 0);
    // the guitar: the chord on the clave, pinched; the thumb softly on one and three
    if (close) c.at(0, (t) => nylon.strum(t, c.v, c.dur(16), 0.52, 'down', 0.03), true);
    else {
      for (const [st, len] of CLAVE[i % 2]) {
        if (end && st >= 8) continue;
        c.at(st, (t) => nylon.strum(t, voicingAt(c, st), c.dur(len) * 0.85, hum(c, st === 0 ? 0.5 : 0.44), 'down', 0.006), true);
      }
      if (end) c.at(8, (t) => nylon.strum(t, voicingAt(c, 8), c.dur(8), 0.5, 'down', 0.018), true);
    }
    for (const st of close ? [0] : [0, 8]) c.at(st, (t) => nylon.note(t, bassIn(c, st, 40), c.dur(close ? 14 : 6), 0.36), true);
    // the bass: the surdo's dotted rhythm, root and fifth, the next root approached from a step below
    const R = (st: number) => bassIn(c, st, 33);
    const n = bassNote(c.nextCh, 33);
    // the fifth of the chord (over a first inversion, a minor third above the bass)
    const F5 = (st: number) => R(st) + (c.ch.bass !== c.ch.root ? 3 : 7);
    const line: [number, number, number, number][] = close
      ? [[0, R(0), 14, 0.8]]
      : [[0, R(0), 5.5, 0.8], [6, F5(6), 1.8, 0.55], [8, c.v2 ? R(8) : F5(8), 5.5, 0.72], [14, n !== R(14) ? n - (n > R(14) ? 1 : -2) : R(14), 1.8, 0.56]];
    for (const [st, m, len, v] of line) c.at(st, (t) => upright(t, m, c.dur(len), hum(c, v, 0.05)), true);
    // the lights coming on: a glass chord under it all, the celesta doubling the tune two octaves up
    if (lit) {
      chordsOn(c, (t, v, d) => glass(t, v.map((m) => m + 12), d * 1.05, 0.3));
      for (const nt of c.mel) c.at(nt.at, (t) => cel(t, c.tonic + nt.semi + 24, c.dur(nt.len), hum(c, nt.at === 0 ? 0.34 : 0.28, 0.06)), true);
    }
    // brushes: the left hand's half-note circles, the right hand's taps, the bossa kick, the clave on the snare
    if (close) {
      c.at(0, (t) => brush.swish(t, c.dur(8), 0.5), true);
      beats('5.3. 4...', (st, v) => c.at(st, (t) => brush.tap(t, v * 0.9), true));
      c.at(0, (t) => brush.kick(t, 0.5));
      // the home chord climbing away on the celesta
      [...c.v, c.v[0] + 12].forEach((m, j) => c.at(4 + j * 2, (t) => cel(t, m + 24, c.dur(10 - j), 0.34 - 0.025 * j), true));
    } else if (!end) {
      if (drums) {
        for (const st of [0, 8]) c.at(st, (t) => brush.swish(t, c.dur(8) * 0.94, 0.5), true);
        beats('5.3. 4.3. 5.3. 4.33', (st, v) => c.at(st, (t) => brush.tap(t, v * 0.9), true));
        beats('4... ..3. 4... ..3.', (st, v) => c.at(st, (t) => brush.kick(t, v), true));
        beats(i % 2 ? '.... 5... ..5. ....' : '5... ..5. .... 5...', (st, v) => c.at(st, (t) => brush.snare(t, v * 0.8), true));
      }
      if (i >= (o.shaker ?? 2)) beats('3235 3235 3235 3235', (st, v) => c.at(st, (t) => perc.shaker(t, v * 0.7, v > 0.5 ? 0.08 : 0.05), true));
    } else {
      c.at(0, (t) => brush.swish(t, c.dur(8), 0.5), true);
      beats('5.3. 4.3.', (st, v) => c.at(st, (t) => brush.tap(t, v * 0.9), true));
      c.at(0, (t) => brush.kick(t, 0.5));
      // out of it: the djembe calls, the marimbas fade in on the next key's dominant
      beats('.... .... 7.6. 7799', (st, v) => c.at(st, (t) => perc.djembe(t, v * 0.9, st >= 14 ? 'bass' : st % 2 ? 'tone' : 'slap'), true));
      mallets(c, 0.34, 8);
    }
  };

  // ── the planet (Act IV): marimbas interlocking, a steel pan lead, djembe, the bell ──────
  const planet = (c: TBar, o: PlanetOpts = {}) => {
    const { i } = c;
    const end = last(c);
    // the tune on the steel pan, its long notes rolled
    for (const n of c.mel) c.at(n.at, (t) => pan(t, c.tonic + n.semi + 12, c.dur(n.len) * 0.96, hum(c, n.at === 0 ? 0.86 : 0.78, 0.05), 0.1), true);
    mallets(c, o.dyn ? o.dyn(i) : 0.5 + 0.03 * i);
    // the bass marimba on the 3+3+2, the octave on the last in every other bar
    for (const st of [0, 6, 12]) c.at(st, (t) => marimba(t, bassIn(c, st, 36) + (st === 12 && i % 2 ? 12 : 0), c.dur(st === 12 ? 4 : 6), 0.72));
    // the bell on the son clave (the theme's tresillo, answered), djembe, shaker
    if (i >= (o.bell ?? 0)) beats('7..6 ..7. ..6. 6...', (st, v) => c.at(st, (t) => perc.agogo(t, v * 0.6, st === 0 || st === 6 ? 'low' : 'high'), true));
    const dj: [number, 'bass' | 'tone' | 'slap', number][] = end
      ? [[0, 'bass', 0.9], [3, 'tone', 0.6], [4, 'slap', 0.75], [8, 'slap', 0.8], [9, 'slap', 0.7], [10, 'tone', 0.75], [11, 'tone', 0.7], [12, 'slap', 0.85], [13, 'slap', 0.8], [14, 'tone', 0.85], [15, 'bass', 0.9]]
      : [[0, 'bass', 0.9], [3, 'tone', 0.6], [4, 'slap', 0.75], [7, 'tone', 0.5], [8, 'bass', 0.8], [10, 'tone', 0.55], [12, 'slap', 0.8], [14, 'tone', 0.5], [15, 'tone', 0.45]];
    if (i >= (o.djembe ?? 0)) for (const [st, how, v] of dj) c.at(st, (t) => perc.djembe(t, hum(c, v, 0.06), how), true);
    beats('4232 4232 4232 4232', (st, v) => c.at(st, (t) => perc.shaker(t, v * 0.6, 0.05), true));
    if (o.low !== undefined && i >= o.low) {
      for (const [st, v] of [[0, 0.86], [6, 0.66], [12, 0.74]]) {
        c.at(st, (t) => upright(t, bassIn(c, st, 31), c.dur(st === 12 ? 3.6 : 5.4), hum(c, v, 0.05)), true);
        c.at(st, (t) => kit.kick(t, v * 0.8), true);
      }
      beats('..6. ..8. ..6. ..8.', (st, v) => c.at(st, (t) => perc.cabasa(t, v), true));
    }
    // the choir's "ooh" swelling in
    const from = o.choir ?? 4;
    if (i >= from) chordsOn(c, (t, v, d) => choir(t, v, d, 0.34 + 0.05 * (i - from), 'oo'));
    if (end && o.lift) lift(c);
  };

  // ── the light (Act V): strings in octaves, celesta and glock, choir, brass, harp, the full kit ─
  type Tom = [number, 'high' | 'mid' | 'floor', number];
  const TOMS_SHORT: Tom[] = [[12, 'high', 0.66], [13, 'high', 0.7], [14, 'mid', 0.74], [15, 'floor', 0.8]];
  const TOMS_LONG: Tom[] = [[9, 'high', 0.7], [10, 'high', 0.74], [11, 'mid', 0.76], [12, 'mid', 0.8], [13, 'floor', 0.82], [14, 'floor', 0.86], [15, 'floor', 0.9]];
  /** The harp rolling eighths up and down through the chord. */
  const harpRoll = (c: TBar, dyn: number, to = 16) => {
    const order = [0, 1, 2, 3, 4, 5, 4, 2];
    for (let st = 0; st < to; st += 2) {
      const v = voicingAt(c, st);
      const up = [...v, v[0] + 12, v[1] + 12];
      c.at(st, (t) => harp.note(t, up[order[st / 2]], c.dur(4), hum(c, (st % 4 === 0 ? 0.46 : 0.38) * dyn, 0.08)), true);
    }
  };
  const light = (c: TBar) => {
    const { i } = c;
    const end = last(c);
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
    if (end) c.at(0, (t) => brass(t, c.v, c.dur(14), 0.8, 'hold'));
    else if (i % 2 === 0 && i < 6) for (const st of [0, 3, 6]) c.at(st, (t) => brass(t, voicingAt(c, st), c.dur(2.2), st ? 0.66 : 0.8, 'stab'));
    else if (i < 6) c.at(8, (t) => brass(t, voicingAt(c, 8), c.dur(7.5), 0.6, 'swell'));
    else for (const st of [0, 8]) c.at(st, (t) => brass(t, voicingAt(c, st), c.dur(6), 0.72, 'hold'));
    harpRoll(c, 1);
    // the bass: disco octaves
    for (let st = 0; st < 16; st += 2) {
      if (end && st >= 8) break;
      const root = bassIn(c, st, 28);
      c.at(st, (t) => bass(t, root + (st % 4 === 2 ? 12 : 0), c.dur(1.7), hum(c, st % 4 === 0 ? 0.9 : 0.72, 0.05)), true);
    }
    // the full kit, four on the floor: the foot on the beats, the hat open on the ands, the crash on the arrivals
    if (i === 0 || i === 4) c.at(0, (t) => kit.crash(t, 0.9));
    if (!end) {
      beats('x... x... x... x...', (st, v) => c.at(st, (t) => kit.kick(t, v * 0.92), true));
      beats('.... x... .... x...', (st, v) => c.at(st, (t) => kit.snare(t, v * 0.9, i % 4 === 3 ? 'rim' : 'center'), true));
      beats('5... 5... 5... 5...', (st, v) => c.at(st, (t) => kit.hat(t, v, 'pedal'), true));
      beats('..7. ..7. ..7. ..7.', (st, v) => c.at(st, (t) => kit.hat(t, v * 0.8, 'open'), true));
      beats('...3 ...3 ...3 ..33', (st, v) => c.at(st, (t) => kit.snare(t, v, 'ghost'), true));
      beats('.4.6 .4.6 .4.6 .4.6', (st, v) => c.at(st, (t) => perc.tambourine(t, v * 0.6), true));
      if (i === 3) TOMS_SHORT.forEach(([st, w, v]) => c.at(st, (t) => kit.tom(t, v, w), true));
    } else {
      // out of it: the band's last bar broadens, the toms roll down into the climb
      beats('x... x... x...', (st, v) => c.at(st, (t) => kit.kick(t, v * 0.92), true));
      beats('.... x... x...', (st, v) => c.at(st, (t) => kit.snare(t, v * 0.9), true));
      beats('5... 5...', (st, v) => c.at(st, (t) => kit.hat(t, v, 'pedal'), true));
      TOMS_LONG.forEach(([st, w, v]) => c.at(st, (t) => kit.tom(t, v, w), true));
    }
  };

  // ── the climb (two bars into the last hit): the band drops to a roll, everything rises ───
  const swell = (c: TBar) => {
    const { i } = c;
    // the four notes and on up, a beat each: strings in octaves, the celesta and glock above, every note stronger
    c.mel.forEach((n, j) => {
      const m = c.tonic + n.semi + 12;
      const x = (i * 4 + j) / 7;
      c.at(n.at, (t) => strings(t, [m - 12, m], c.dur(n.len) * 1.02, 0.72 + 0.24 * x, 0, j > 0));
      c.at(n.at, (t) => cel(t, m + 12, c.dur(n.len), 0.54 + 0.2 * x));
      c.at(n.at, (t) => glock(t, m + 12, c.dur(n.len), 0.42 + 0.2 * x));
    });
    chordsOn(c, (t, v, d) => choir(t, v, d, 0.58 + 0.12 * i, 'ah'));
    // the bass under each chord, held; the brass swelling through each bar
    for (const st of c.v2 ? [0, 8] : [0]) c.at(st, (t) => bass(t, bassIn(c, st, 28), c.dur(c.v2 ? 7.6 : 15.6), 0.88));
    c.at(i ? 8 : 0, (t) => brass(t, voicingAt(c, i ? 8 : 0), c.dur(i ? 7.7 : 15.5), 0.7 + 0.16 * i, 'swell'));
    // the harp: rolling on, then a glissando up the last half bar
    if (i === 0) harpRoll(c, 1);
    else {
      harpRoll(c, 1, 8);
      const notes = scale(c.tonic, 50, 93);
      c.at(8, (t) => harp.gliss(t, notes, c.dur(7.6) / notes.length, 0.62));
    }
    // the drums: the foot on the beats, the toms rolling and growing, the snare's roll through the last bar
    if (i === 0) c.at(0, (t) => kit.crash(t, 0.85));
    beats('x... x... x... x...', (st, v) => c.at(st, (t) => kit.kick(t, v * 0.86), true));
    for (let st = 0; st < 16; st++) {
      const x = (i * 16 + st) / 31;
      c.at(st, (t) => kit.tom(t, 0.3 + 0.5 * x, st % 4 < 2 ? 'floor' : 'mid'), true);
    }
    if (i === 1) for (let st = 0; st < 16; st += st < 8 ? 1 : 0.5) c.at(st, (t) => kit.snare(t, 0.2 + 0.5 * (st / 15.5), 'center'), true);
  };

  // ── home: the landing and the four notes over a held G6/9 ────────────────────────────────
  /**
   * `ring` = how many bars the held chord has to itself before the piece is over. `tutti` = the landing is the
   * picture's biggest moment, so the whole band holds the home chord for two bars before it thins to the celesta
   * (the medley's own coda lands quietly).
   */
  const coda = (c: TBar, ring = 6, tutti = true) => {
    const { i } = c;
    if (i === 0 && tutti) {
      c.at(0, (t) => brass(t, c.v, c.dur(22), 0.86, 'hold'));
      c.at(0, (t) => choir(t, [c.v[0] - 12, ...c.v], c.dur(30), 0.62, 'ah'));
      c.at(0, (t) => strings(t, [c.v[c.v.length - 1] + 12, c.v[c.v.length - 1] + 24], c.dur(26), 0.7, -0.4));
      c.at(0, (t) => (kit.tom(t, 0.9, 'floor'), glock(t, c.tonic + 36, c.dur(8), 0.5)));
    }
    if (i === 0) {
      // the landing: the last crash and the low G, the harp's chord, the strings and glass holding on
      c.at(0, (t) => (kit.crash(t, 0.95), kit.kick(t, 0.9)));
      c.at(0, (t) => bass(t, 31, c.dur(28), 0.9));
      c.at(0, (t) => harp.chord(t, [43, 50, ...c.v, c.v[c.v.length - 1] + 5], c.dur(40), 0.6, 0.05));
      c.at(0, (t) => strings(t, [43, ...c.v], c.dur(16 * (ring - 1.5)), 0.5, -0.7));
      c.at(0, (t) => glass(t, c.v.map((m) => m + 12), c.dur(16 * (ring - 0.5)), 0.42));
    }
    // the notes: the celesta, the long ones answered an octave up and sung by the choir, "ah" closing to "oo"
    for (const n of c.mel) {
      const m = c.tonic + n.semi + 12;
      const long = n.len >= 12;
      c.at(n.at, (t) => cel(t, m + 12, c.dur(long ? n.len * 0.875 : n.len + 3), 0.58 - 0.03 * i));
      if (n.len >= 8) c.at(n.at + n.len / 2, (t) => cel(t, m + 24, c.dur(n.len / 2), 0.24));
      if (long) c.at(n.at, (t) => choir(t, [m], c.dur(n.len * 0.94), 0.5 - 0.03 * i, 'ah', 'oo'));
    }
  };

  return { intro, garage, citypop, bossa, planet, light, swell, coda, fx, harp, glock, cel, kit };
}
type Band = ReturnType<typeof band>;

// ── the trailer's own sounds ────────────────────────────────────────────────────────────────
/** A drop: the boom (tuned to the key), its crack and a cymbal. `breath` holds the music's dry sound just before it. */
function impact(k: Session, B: Band, bar: number, power: number, root: number, breath = false): void {
  if (breath) k.gap(bar * BAR);
  k.at(bar, 0, (t) => {
    B.fx.boom(t, power, { decay: 1.3 + power, f1: Math.min(52, boomHz(root)) });
    B.fx.crash(t, power * 0.9, 1.2 + power);
  });
}

/** A whoosh that peaks on a bar line (the picture cuts there). */
function sweep(k: Session, B: Band, bar: number, vel: number, side = 0.5): void {
  k.atT(bar * BAR - 0.5, (t) => B.fx.whoosh(t, 0.8, vel, side));
}

// ── the pieces ──────────────────────────────────────────────────────────────────────────────
const trailer: PieceDef = {
  bars: 44, tail: 4, seed: 2026, level: { music: 0.87, fx: 0.5 },
  build(k) {
    const B = band(k);
    const ARR: Record<string, (c: TBar) => void> = {
      intro: B.intro, hush: B.intro, garage: B.garage, citypop: B.citypop,
      // Geneva at dusk: flute, guitar and bass alone for two bars, the brushes and the shaker in on bar 18
      bossa: (c) => B.bossa(c, { drums: 2, shaker: 2, out: 'planet' }),
      // the marimbas stop dead on the Moon: no lift out of Act IV
      planet: (c) => B.planet(c, { low: 0 }),
      light: B.light, swell: B.swell, coda: (c) => B.coda(c, 6),
    };
    k.play(FORMS.trailer, VOICING, (c) => ARR[c.sec](c));

    // the shape of the whole: small in the garage, a step up with every act, the last hit the top
    k.ride(0, 0.85, 0.01);
    k.ride(4 * BAR - 0.05, 0.7, 0.05);
    k.ride(8 * BAR - 0.04, 1.12, 0.03);
    k.ride(16 * BAR - 0.04, 0.85, 0.03);
    k.ride(18 * BAR - 0.04, 1, 0.03);
    k.ride(20 * BAR - 0.04, 1.1, 0.03);
    k.ride(26 * BAR, 0.75, 0.05);
    k.ride(28 * BAR - 0.04, 0.95, 0.03);
    k.ride(28 * BAR + 0.1, 1.04, 8 * BAR - 0.3);
    k.ride(36 * BAR, 0.96, 0.3);
    k.ride(38 * BAR - 0.04, 1.6, 0.03);
    k.ride(38 * BAR + 1, 1.15, 3);
    k.ride(40 * BAR, 1, 2 * BAR);

    // the picture's hits
    k.at(0, 0, (t) => {
      B.fx.boom(t, 0.3, { f0: 72, f1: boomHz(C), drop: 0.5, decay: 3.2, bright: 0 });
      B.fx.air(t, 9, 0.035);
    });
    impact(k, B, 8, 0.75, D);
    k.at(12, 0, (t) => B.fx.boom(t, 0.4, { bright: 0.5, decay: 1.2, f1: boomHz(D) }));
    sweep(k, B, 16, 0.3, -0.5);
    sweep(k, B, 18, 0.3, 0.5);
    k.at(18, 0, (t) => (B.fx.boom(t, 0.4, { bright: 0.3, decay: 1.4, f1: boomHz(E) }), B.fx.crash(t, 0.3, 1.6)));
    impact(k, B, 20, 0.8, F);
    // liftoff: the hit and the rocket under two bars of music
    sweep(k, B, 22, 0.5, 0.6);
    impact(k, B, 22, 0.95, F);
    k.at(22, 0, (t) => B.fx.rumble(t, 2.4 * BAR, 0.9));
    sweep(k, B, 24, 0.3, -0.5);
    // the Moon: the floor drops away
    k.at(26, 0, (t) => (B.fx.subdrop(t, 1.5, 0.4), B.fx.air(t, 4.5, 0.05)));
    k.at(27, 0, (t) => B.fx.riser(t, BAR, 0.6, { note: G - 17 + 12, octs: 1, pow: 3.2 }));
    impact(k, B, 28, 1.05, G);
    for (const b of [30, 32, 34]) sweep(k, B, b, 0.3, b % 4 ? 0.5 : -0.5);
    k.at(32, 0, (t) => B.fx.boom(t, 0.5, { bright: 0.6, decay: 1.2, f1: boomHz(G) }));
    // the pull-back: a riser through both bars, then the biggest hit on K 1.0000
    k.at(36, 0, (t) => {
      B.fx.boom(t, 0.55, { bright: 0.6, decay: 1.6, f1: boomHz(G) });
      B.fx.riser(t, 2 * BAR, 0.75, { note: G - 17, octs: 2, trem: [3, 15] });
    });
    impact(k, B, 38, 1.2, G, true);
    k.at(38, 0, (t) => B.fx.crash(t, 1, 3.4));
    // the logo: a glint
    k.at(40, 0, (t) => (B.glock(t, 91, 2, 0.4), B.harp.chord(t, [67, 71, 74, 79, 83], 4, 0.4, 0.04)));
  },
};

const teaser: PieceDef = {
  bars: 12, tail: 3, seed: 2027, level: { music: 0.87, fx: 0.5 },
  build(k) {
    const B = band(k);
    const ARR: Record<string, (c: TBar) => void> = { intro: B.intro, light: B.light, swell: B.swell, coda: (c) => B.coda(c, 3.5) };
    k.play(FORMS.teaser, VOICING, (c) => ARR[c.sec](c));
    k.ride(0, 0.8, 0.01);
    k.ride(2 * BAR - 0.04, 0.95, 0.03);
    k.ride(2 * BAR + 0.1, 1.04, 6 * BAR - 0.3);
    k.ride(8 * BAR, 0.96, 0.3);
    k.ride(10 * BAR - 0.04, 1.6, 0.03);
    k.ride(10 * BAR + 1, 1.1, 3);
    k.at(0, 0, (t) => {
      B.fx.boom(t, 0.3, { f0: 72, f1: boomHz(G), drop: 0.5, decay: 3, bright: 0 });
      B.fx.air(t, 4.5, 0.035);
    });
    k.at(1, 0, (t) => B.fx.riser(t, BAR, 0.7, { note: G - 17 + 12, octs: 1, pow: 3.2 }));
    impact(k, B, 2, 1, G);
    sweep(k, B, 4, 0.3, -0.5);
    // liftoff
    sweep(k, B, 5, 0.5, 0.6);
    k.at(5, 0, (t) => {
      B.fx.boom(t, 0.7, { decay: 1.6, f1: boomHz(G) });
      B.fx.rumble(t, 1.5 * BAR, 0.7);
    });
    sweep(k, B, 7, 0.3, 0.5);
    k.at(8, 0, (t) => {
      B.fx.boom(t, 0.55, { bright: 0.6, decay: 1.6, f1: boomHz(G) });
      B.fx.riser(t, 2 * BAR, 0.75, { note: G - 17, octs: 2, trem: [3, 15] });
    });
    impact(k, B, 10, 1.2, G, true);
    k.at(10, 0, (t) => B.fx.crash(t, 1, 3.4));
  },
};

const calm: PieceDef = {
  bars: 8, tail: 2, seed: 2028, level: { music: 0.87, fx: 0.6 },
  build(k) {
    const B = band(k);
    // one day on a campus: the brushes from the top, the shaker from bar 2, the lights on at bar 6, a close at home
    k.play(FORMS.calm, VOICING, (c) => B.bossa(c, { drums: 0, shaker: 2, out: 'close', night: 6 }));
    k.at(0, 0, (t) => B.fx.air(t, 17, 0.06));
  },
};

const rise: PieceDef = {
  bars: 6, tail: 3, seed: 2029, level: { music: 0.87, fx: 0.5 },
  build(k) {
    const B = band(k);
    const ARR: Record<string, (c: TBar) => void> = {
      // the wait: the marimbas gathering, the djembe from bar 1, the bell and the choir from bar 2, the lift into the hit
      planet: (c) => B.planet(c, { djembe: 1, bell: 2, choir: 2, low: 2, dyn: (i) => 0.3 + 0.09 * i, lift: true }),
      coda: (c) => B.coda(c, 3.5),
    };
    k.play(FORMS.rise, VOICING, (c) => ARR[c.sec](c));
    // the wait grows; the hit is the top
    k.ride(0, 0.55, 0.01);
    k.ride(0.1, 0.9, 4 * BAR - 0.3);
    k.ride(4 * BAR - 0.05, 1.3, 0.04);
    k.ride(4 * BAR + 1, 1, 3);
    k.at(0, 0, (t) => {
      B.fx.boom(t, 0.4, { f0: 72, f1: boomHz(G), drop: 0.5, decay: 3, bright: 0 });
      B.fx.riser(t, 4 * BAR, 0.7, { note: G - 17, octs: 2, trem: [2, 16], pow: 2.6 });
    });
    impact(k, B, 4, 1.2, G, true);
    k.at(4, 0, (t) => {
      B.fx.crash(t, 0.7, 3.4);
      B.fx.rumble(t, 2 * BAR, 0.55);
    });
  },
};

export const PIECES: Record<string, PieceDef> = { trailer, teaser, calm, rise };
