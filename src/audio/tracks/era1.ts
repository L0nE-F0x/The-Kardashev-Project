/**
 * Act II · The Scale-Up: "Gigawatts". Sunny 1980s city pop / jazz-funk fusion: money and momentum. D major, 116 bpm,
 * straight sixteenths, the last chorus lifted a semitone to E♭ (the truck driver's change, set up by its own V7sus4).
 *
 * The band: a LinnDrum-era machine (kick on 1 and 3 with pushes, a gated snare and a clap on the backbeat, eighth hats
 * opening on the off-beats, gated tom fills into the big sections), a DX slap bass (the root slapped on the one, the
 * octave popped on the off-beats, sixteenth ghosts, a chromatic approach into every change), the DX7's E.PIANO
 * (held chords, bright pushes, little answers in the tune's gaps), a DX brass section (the hook riff in four-part
 * soli, swells through the pre-chorus, stabs answering the theme), a clean funk guitar (chops on the backbeat in the
 * verses, sixteenth cutting on the tresillo's off-beats in the big sections), a string machine under the choruses and
 * the bridge, the Lyricon singing the theme, the glockenspiel doubling it in the last chorus.
 *
 *   intro   4   the brass hook riff (the theme's 3+3+2 rise) over the groove
 *   verse   8   the royal road (IVmaj7 V iii7 vi7): the Lyricon's hook fragments, the DX answering
 *   pre     4   ii7 iii7 IVmaj7 V7sus4, a rising sequence: brass swells, a riser, a tom fill
 *   chorus  8   the theme, open, on its own chords; brass stabs in its gaps; strings
 *   inter   4   the hook riff again, the whole band
 *   bridge  8   the bridge tune in half time, strings and held chords
 *   pre2    4   the pre-chorus, its last bar on B♭7sus4 (V of E♭)
 *   lift    8   the theme comes home in E♭: everything, the glock doubling
 *   outro   4   the hook riff in E♭, a last hit and a breath
 *
 * Later passes rotate five forms (never the same twice running) that add a written-out Lyricon solo over the royal
 * road (now and then trading bars with the brass section) and a slap-bass break, and vary comping, answers, fills.
 *
 * Paused: the Lyricon, the strings and the DX's held chords (the riffs go to the Lyricon). Fast: sixteenth hats and a
 * second guitar's sixteenth chicks on the right.
 */
import type { Bar, Setup, TrackDef } from '../cinematic';
import { freeWhenDone } from '../engine';
import { chords as parseChords, type Chord } from '../score';
import type { Strip } from '../synth';
import { BRIDGE, BRIDGE_CHORDS, HOOK, THEME_CHORDS, THEME_CHORDS_OPEN, THEME_HOME, THEME_OPEN, roman } from '../theme';
import { bassAt, hum, last, through, voicingAt } from '../arrange';
import { cachedBuffer, noiseGen } from '../voices/buffers';
import { makeEightiesKit, makeFunkKit, makePercussion, type EightiesKit } from '../voices/drums';
import { keysChord, makeEPiano } from '../voices/keys';
import { makeGlock } from '../voices/mallets';
import { makeStringMachine } from '../voices/pads';
import { makeFunkGuitar } from '../voices/plucked';
import { makeFMBass, makeFMBrass, type BassArticulation } from '../voices/synths';
import { makeLyricon, type Wind } from '../voices/winds';

const D = (s: string) => roman(s, 'D');
const Eb = (s: string) => roman(s, 'Eb');

// ── the tunes (scale degrees; the band plays them an octave up: A4–D6) ──────────────────────
/** The hook riff: the theme's rise, a stabbed answer, the rise again to the sixth, a run down into the next. */
const RIFF = `${HOOK} | -:2 3':1 5':1 -:2 6':2 5':3 3':3 2':2 | 5:3 1':3 2':2 3':4 6':4 | 5':3 4':3 3':2 2':4 1':2 2':2`;
/** The outro: the riff once more, home on the last bar. */
const OUTRO = `${HOOK} | -:2 3':1 5':1 -:2 6':2 5':3 3':3 2':2 | 5':3 4':3 3':2 2':4 1':2 2':2 | 1':4 -:12`;
/** The verse: hook fragments on the 3+3+2, a bar each, the next bar's gap left for the DX's answer. */
const VERSE = "5:3 1':3 2':2 3':8 | -:10 3':2 2':2 1':2 | 2':3 3':3 5':2 3':8 | -:8 6:2 7:2 1':2 2':2 | 3':3 5':3 6':2 5':8 | -:8 5':2 6':2 5':2 3':2 | 2':3 3':3 5':2 6':4 5':4 | 3':12 -:4";
/** The pre-chorus: the 3+3+2 climbing a step a bar. */
const PRE = "5:3 6:3 1':2 2':8 | 6:3 1':3 2':2 3':8 | 1':3 2':3 3':2 5':8 | 4':4 5':12";
/** The second pre-chorus: the top note rises a semitone into the new key's dominant. */
const PRE2 = "5:3 6:3 1':2 2':8 | 6:3 1':3 2':2 3':8 | 1':3 2':3 3':2 5':8 | b6':16";
/**
 * The Lyricon's solo (later passes) over the royal road: a pickup into the ninth, the hook's 3+3+2 answered, a turn
 * through the chord, a sixteenth run up to the high E, the peak on the high F♯ at bar seven, a run down into what comes.
 * Written out (and linted), so it is a composition every time it comes round.
 */
const SOLO =
  "-:2 6:1 7:1 1':2 3':2 -:1 2':1 3':2 5':4 | 6':3 5':3 3':2 2':2 3':2 5':4 | 3':2 2':1 1':1 7:2 1':2 2':2 3':2 5':2 7':2 | " +
  "1'':4 7':2 6':2 5':2 6':2 3':4 | -:1 2':1 3':1 5':1 6':1 5':1 6':1 1'':1 2'':4 1'':2 6':2 | 2'':3 1'':3 7':2 2'':4 -:2 5':1 6':1 | " +
  "3'':6 2'':2 1'':4 7':2 6':2 | 5':2 4':1 3':1 2':2 1':2 2':4 -:4";

const SECS: TrackDef['secs'] = {
  intro: { ch: D('I | IVmaj7 | I | ii7 V7sus4'), mel: RIFF },
  groove: { ch: D('I | IVmaj7 | I | ii7 V7sus4') },
  verse: { ch: D('IVmaj7 | V | iii7 | vi7 | IVmaj7 | V | iii7 | vi7'), mel: VERSE },
  pre: { ch: D('ii7 | iii7 | IVmaj7 | V7sus4'), mel: PRE },
  chorus: { ch: D(THEME_CHORDS_OPEN), mel: THEME_OPEN },
  inter: { ch: D('I | IVmaj7 | I | ii7 V7sus4'), mel: RIFF },
  bridge: { ch: D(BRIDGE_CHORDS), mel: BRIDGE },
  pre2: { ch: D('ii7 | iii7 | IVmaj7 | bVI7sus4'), mel: PRE2 },
  lift: { ch: Eb(THEME_CHORDS), mel: THEME_HOME, tonic: 51 },
  outro: { ch: Eb('I | IVmaj7 | ii7 V7sus4 | I'), mel: OUTRO, tonic: 51 },
  // later passes only: a solo over the royal road, and a slap-bass break
  solo: { ch: D('IVmaj7 | V | iii7 | vi7 | IVmaj7 | V | iii7 vi7 | ii7 V7sus4'), mel: SOLO },
  brk: { ch: D('I | IVmaj7 | I | ii7 V7sus4') },
};

/** Every section's chords, parsed once: the bass looks a bar ahead for its approach notes. */
const BARS: Record<string, Chord[][]> = Object.fromEntries(Object.entries(SECS).map(([k, s]) => [k, parseChords(s.ch)]));

const pcOf = (m: number) => ((m % 12) + 12) % 12;

/** The bass pitch class of the bar after this one. */
function nextBass(c: Bar): number {
  const bars = BARS[c.sec];
  const b = c.i + 1 < bars.length ? bars[c.i + 1] : BARS[c.next]?.[0];
  return b ? b[0].bass : pcOf(c.bass);
}

/** The chord sounding at a step. */
const chordAt = (c: Bar, step: number): Chord => {
  const bar = BARS[c.sec][c.i];
  return bar.length > 1 && step >= c.steps / 2 ? bar[1] : bar[0];
};

/** Brass soli: the tune's note on top, chord tones close under it (none nearer than a minor third to the top). */
function soli(top: number, v: number[], voices = 3): number[] {
  const pcs = v.map(pcOf);
  const out = [top];
  for (let m = top - 3; m > top - 14 && out.length <= voices; m--) {
    if (!pcs.includes(pcOf(m))) continue;
    if (out.some((x) => Math.abs(x - m) < 2)) continue;
    out.push(m);
  }
  return out.sort((a, b) => a - b);
}

/** A voicing moved under a ceiling (octaves down), so a stab answers the tune instead of covering it. */
const under = (v: number[], ceil: number): number[] =>
  [...new Set(v.map((m) => { while (m > ceil - 2) m -= 12; return m; }))].sort((a, b) => a - b);

/** The tune note sounding at a step of this bar (or the one held over from the bar before). */
function tuneAt(c: Bar, step: number, held: number): number {
  let m = held;
  for (const n of c.mel) if (n.at <= step) m = c.tonic + n.semi + 12;
  return m;
}

// ── the parts ───────────────────────────────────────────────────────────────────────────────
type Kit = EightiesKit;
type Fill = [step: number, tom: number, vel: number][];
/** Gated tom fills (a tom's pitch, 0 = the snare): down the toms in sixteenths, snare-and-toms, a short push. */
const FILLS: Fill[] = [
  [[8, 57, 0.78], [9, 55, 0.66], [10, 52, 0.8], [11, 52, 0.68], [12, 48, 0.86], [13, 48, 0.74], [14, 45, 0.92], [15, 43, 0.98]],
  [[8, 0, 0.72], [10, 55, 0.82], [11, 52, 0.74], [12, 0, 0.86], [13, 48, 0.8], [14, 45, 0.9], [15, 41, 1]],
  [[12, 0, 0.62], [13, 0, 0.72], [14, 52, 0.86], [15, 45, 0.94]],
];

type Style = 'main' | 'big' | 'pre' | 'half' | 'light' | 'brk';

/** The machine: kick on 1 and 3 with a push on the and of 2, backbeat snare (and clap), eighth hats. */
function drums(c: Bar, kit: Kit, hatKit: Kit, style: Style, fill: Fill | null, roll: boolean) {
  const from = fill ? fill[0][0] : roll ? 8 : 16;
  const K = (s: number, v: number) => s < from && c.at(s, (t) => kit.kick(t, v));
  const S = (s: number, v: number) => s < from && c.at(s, (t) => kit.snare(t, v));
  const C = (s: number, v: number) => s < from && c.at(s, (t) => kit.clap(t, v));
  const H = (s: number, v: number, open = false) => s < from && c.at(s, (t) => hatKit.hat(t, v, open));
  const push = c.i % 4 === 3 && !fill;
  if (style === 'half') {
    K(0, 0.95);
    K(11, 0.6);
    if (c.i % 2 === 1) K(14, 0.5);
    S(8, 0.92);
    C(8, 0.6);
    for (let s = 0; s < 16; s += 2) H(s, s === 14 ? 0.4 : s % 4 === 0 ? 0.42 : 0.3, s === 14);
    c.at(4, (t) => kit.rim(t, 0.32));
  } else if (style === 'brk') {
    // the break: no snare, the claps alone on the backbeat, the kick dancing with the bass
    K(0, 0.95);
    K(7, 0.5);
    K(8, 0.86);
    if (c.i % 2 === 1) K(10, 0.55);
    C(4, 0.74);
    C(12, 0.78);
    for (let s = 0; s < 16; s += 2) H(s, s % 4 === 0 ? 0.46 : 0.34, s === 14 && c.i % 2 === 1);
  } else if (style === 'pre') {
    for (const s of [0, 4, 8, 12]) K(s, s === 0 ? 0.95 : 0.82);
    if (push) K(14, 0.6);
    S(4, 0.9);
    S(12, 0.94);
    C(4, 0.62);
    C(12, 0.66);
    for (let s = 0; s < 16; s += 2) H(s, s % 4 === 0 ? 0.5 : 0.42 + 0.12 * through(c), s % 4 === 2 && c.i >= 2);
  } else {
    const light = style === 'light';
    K(0, 0.98);
    K(6, 0.62);
    K(8, 0.9);
    if (push || (style === 'big' && c.i % 2 === 1)) K(14, 0.58);
    if (style === 'big' && c.i % 4 === 1) K(11, 0.45);
    S(4, light ? 0.82 : 0.9);
    S(12, light ? 0.86 : 0.95);
    if (!light) {
      C(4, style === 'big' ? 0.7 : 0.5);
      C(12, style === 'big' ? 0.74 : 0.56);
    }
    // the off-beat hats open on the and of 2 and 4 (and in the big sections on the and of 1 and 3 every other bar)
    for (let s = 0; s < 16; s += 2) {
      const open = s === 6 || s === 14 ? style !== 'light' || s === 14 : style === 'big' && c.i % 2 === 1 && s === 10;
      H(s, open ? 0.46 : s % 4 === 0 ? 0.5 : 0.36, open);
    }
    if (style === 'big') c.at(15, (t) => kit.rim(t, 0.26));
  }
  if (fill) {
    if (fill[0][0] <= 8) c.at(8, (t) => kit.kick(t, 0.9));
    for (const [s, tom, v] of fill) c.at(s, (t) => (tom ? kit.tom(t, v, tom) : kit.snare(t, v)));
  }
  if (roll) for (let s = 8; s < 16; s++) c.at(s, (t) => kit.snare(t, 0.3 + 0.62 * ((s - 8) / 7)));
}

type BassHit = [step: number, semi: number | 'A', art: BassArticulation, vel: number, len: number];
/** The slap: root on the one, octave pops on the off-beats, ghosts between, the fifth, a chromatic approach. */
const SLAP: BassHit[] = [
  [0, 0, 'slap', 1, 1.8], [2, 12, 'pop', 0.78, 0.8], [3, 0, 'ghost', 0.42, 0.4], [4, 0, 'slap', 0.7, 0.9], [6, 12, 'pop', 0.88, 0.8],
  [7, 0, 'slap', 0.6, 0.7], [8, 0, 'slap', 0.92, 1.6], [10, 12, 'pop', 0.8, 0.8], [11, 0, 'ghost', 0.4, 0.4], [12, 7, 'slap', 0.74, 1],
  [14, 12, 'pop', 0.86, 0.8], [15, 'A', 'slap', 0.66, 0.8],
];
/** The verse: fingered, the octave popped twice, room for the tune. */
const FINGER: BassHit[] = [
  [0, 0, 'finger', 0.95, 2.6], [3, 12, 'pop', 0.56, 0.8], [4, 0, 'ghost', 0.38, 0.4], [6, 0, 'finger', 0.72, 1.4], [8, 0, 'finger', 0.85, 1.8],
  [10, 12, 'pop', 0.64, 0.8], [12, 7, 'finger', 0.7, 1.4], [14, 12, 'finger', 0.6, 0.9], [15, 'A', 'finger', 0.6, 0.9],
];
/** The pre-chorus: disco octaves on the eighths, pushing. */
const PUMP: BassHit[] = [
  [0, 0, 'finger', 0.95, 1.6], [2, 12, 'pop', 0.7, 0.8], [4, 0, 'finger', 0.8, 1.6], [6, 12, 'pop', 0.75, 0.8], [8, 0, 'finger', 0.88, 1.6],
  [10, 12, 'pop', 0.78, 0.8], [12, 0, 'finger', 0.84, 1.6], [14, 12, 'pop', 0.82, 0.8], [15, 'A', 'finger', 0.62, 0.7],
];
/** The bridge, in half time: a long root, a pickup, the fifth and the octave. */
const HALF: BassHit[] = [
  [0, 0, 'finger', 0.92, 5.5], [6, 0, 'ghost', 0.38, 0.4], [7, 0, 'finger', 0.62, 0.9], [10, 7, 'finger', 0.62, 1.8], [13, 12, 'finger', 0.56, 1],
  [15, 'A', 'finger', 0.55, 0.9],
];
/** The break: the slap on its own, busier (thumb, pop, ghost, the fifth and the octave in sixteenths). */
const BREAK: BassHit[] = [
  [0, 0, 'slap', 1, 1.2], [2, 12, 'pop', 0.86, 0.5], [3, 0, 'ghost', 0.42, 0.3], [4, 0, 'slap', 0.74, 0.6], [5, 12, 'pop', 0.7, 0.5],
  [6, 7, 'slap', 0.78, 0.6], [7, 12, 'pop', 0.9, 0.5], [8, 0, 'slap', 0.94, 1], [9, 0, 'ghost', 0.4, 0.3], [10, 12, 'pop', 0.84, 0.5],
  [11, 7, 'slap', 0.62, 0.5], [12, 12, 'pop', 0.9, 0.5], [13, 7, 'slap', 0.66, 0.5], [14, 0, 'slap', 0.72, 0.5], [15, 'A', 'pop', 0.78, 0.5],
];

type BassNote = (t: number, m: number, dur: number, vel: number, art?: BassArticulation) => void;
const BASS_LO = 33;

function bassLine(c: Bar, play: BassNote, line: BassHit[], soft = 1) {
  for (const [s, semi, art, vel, len] of line) {
    const root = BASS_LO + pcOf(bassAt(c, s) - BASS_LO);
    let m: number;
    if (semi === 'A') {
      // into the next bar's root: a semitone from the side we come from (the octave pop if it doesn't move)
      const to = nextBass(c);
      let target = root + pcOf(to - root);
      if (target - root > 6) target -= 12;
      if (target === root) m = root + 12;
      else m = target + (target > root ? -1 : 1);
      if (m < BASS_LO - 2) m += 12;
    } else {
      // a slash chord's bass takes the octave where the fifth would be
      const ch = chordAt(c, s);
      m = root + (semi === 7 && ch.bass !== ch.root ? 12 : semi);
    }
    const v = hum(c, vel * soft, 0.06);
    c.at(s, (t) => play(t, m, c.dur(len) * 0.92, v, art), true);
  }
}

/** A noise riser into the next downbeat: a band of noise sweeping up, cut a moment before the one. */
function makeRiser(ctx: BaseAudioContext, s: Strip) {
  return (t: number, dur: number, vel: number) => {
    const buf = cachedBuffer(ctx, 'era1-riser', 2.6, (d) => {
      const n = noiseGen(4111);
      for (let i = 0; i < d.length; i++) d[i] = n() * 0.7;
    });
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(7500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(vel, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(s.in);
    src.start(t);
    src.stop(t + Math.min(dur + 0.02, 2.55));
    freeWhenDone(src, bp, g);
  };
}

/** The tune on the Lyricon: tongued on the long notes and the beats, quick notes straight after another slurred. */
function lyr(c: Bar, play: Wind, vel: number, oct = 12) {
  let end = -99;
  for (const n of c.mel) {
    const slur = n.at === end && n.len <= 2 && n.at % 4 !== 0;
    end = n.at + n.len;
    const v = hum(c, vel * (n.at % 4 === 0 ? 1 : 0.9) * (n.len >= 8 ? 1.04 : 1), 0.05);
    const m = c.tonic + n.semi + oct;
    c.at(n.at, (t) => play(t, m, c.dur(n.len) * (n.len <= 2 ? 0.84 : 0.95), Math.min(1, v), slur), true);
  }
}

const isRiff = (sec: string) => sec === 'intro' || sec === 'inter' || sec === 'outro';

// ── the piece ───────────────────────────────────────────────────────────────────────────────
export const track: TrackDef = {
  bpm: 116,
  steps: 16,
  beat: 4,
  tonic: 50,
  delay: 3,
  // the keys, strings and guitar sit F♯3–C5: out of the bass's low mids, under the tune
  lo: 54,
  hi: 72,
  size: 4,
  bassLo: BASS_LO,
  gain: 0.8,
  secs: SECS,
  form: (pass, r) => {
    if (pass === 0) return ['intro', 'verse', 'pre', 'chorus', 'inter', 'bridge', 'pre2', 'lift', 'outro'];
    // later passes: the same song told differently (a solo, a slap break, a second verse), never the same twice running
    const forms = [
      ['groove', 'verse', 'pre', 'chorus', 'solo', 'bridge', 'pre2', 'lift', 'outro'],
      ['intro', 'verse', 'pre', 'chorus', 'brk', 'inter', 'bridge', 'pre2', 'lift', 'outro'],
      ['groove', 'inter', 'verse', 'pre', 'chorus', 'bridge', 'pre2', 'lift', 'outro'],
      ['intro', 'verse', 'pre', 'chorus', 'solo', 'pre', 'chorus', 'brk', 'pre2', 'lift', 'outro'],
      ['brk', 'inter', 'verse', 'pre', 'chorus', 'bridge', 'pre', 'chorus', 'solo', 'pre2', 'lift', 'outro'],
    ];
    return forms[(pass - 1 + Math.floor(r() * 2) * 2) % forms.length];
  },
  setup(k: Setup) {
    const { ctx, r } = k;
    const lead = makeLyricon(ctx, k.strip('lead', { gain: 0.55, rev: 0.24, del: 0.2 }), r, { chorus: 0.3, onStop: k.onStop });
    // high-passed keys, strings and brass: the low mids belong to the bass and the kick
    const ep = makeEPiano(ctx, k.strip('dx', { gain: 0.52, rev: 0.18, del: 0.07, hp: 150 }), r, { model: 'dx', onStop: k.onStop });
    const strings = makeStringMachine(ctx, k.strip('strings', { gain: 0.34, rev: 0.4, del: 0.04, hp: 220 }), r, { attack: 0.35, release: 0.9, onStop: k.onStop });
    const glock = makeGlock(ctx, k.strip('glock', { gain: 0.28, rev: 0.3, del: 0.1, pan: 0.2 }), r, { mallet: 0.7 });
    const brass = makeFMBrass(ctx, k.strip('brass', { gain: 0.6, group: 'rhythm', rev: 0.2, del: 0.05, hp: 170 }), r, { bite: 1.05, onStop: k.onStop });
    const bass = makeFMBass(ctx, k.strip('bass', { gain: 0.8, group: 'rhythm', rev: 0.03 }), r);
    const kit = makeEightiesKit(ctx, k.strip('kit', { gain: 0.36, group: 'rhythm', rev: 0.1 }), r);
    // the eighth hats on a strip of their own, a little right (the guitar is left): crisp, and placed
    const hatKit = makeEightiesKit(ctx, k.strip('hats', { gain: 0.4, group: 'rhythm', rev: 0.06, pan: 0.24, hp: 400 }), r);
    const cym = makeFunkKit(ctx, k.strip('cymbal', { gain: 0.3, group: 'rhythm', rev: 0.18 }), r);
    const perc = makePercussion(ctx, k.strip('tambourine', { gain: 0.28, group: 'rhythm', rev: 0.12, pan: 0.45 }), r);
    const gtr = makeFunkGuitar(ctx, k.strip('guitar', { gain: 0.52, group: 'rhythm', rev: 0.1, pan: -0.5, hp: 200 }), r, { chorus: 0.2, onStop: k.onStop });
    const riser = makeRiser(ctx, k.strip('riser', { gain: 0.22, group: 'rhythm', rev: 0.35, del: 0.1 }));
    const hats = makeEightiesKit(ctx, k.strip('hats16', { gain: 0.3, group: 'drive', rev: 0.06, pan: 0.3, hp: 400 }), r);
    const gtr16 = makeFunkGuitar(ctx, k.strip('guitar16', { gain: 0.42, group: 'drive', rev: 0.08, pan: 0.55, hp: 200 }), r);
    kit.warm();
    hatKit.warm();
    glock.warm(79, 100);

    const keys = (t: number, notes: number[], dur: number, vel: number) => keysChord(ep, r, t, notes, dur, vel, 0.005);
    /** The guitar's chord: the voicing's top three, kept up where a funk guitar chops (C4–A5). */
    const gtrChord = (v: number[]) => { const top = v.slice(-3); return top[0] < 58 ? top.map((m) => m + 12) : top; };
    let held = 74; // the tune's note sounding at the end of the bar before

    return (c) => {
      const { sec, i } = c;
      const calm = c.mood.calm;
      const drive = !calm && c.mood.drive > 0.02;
      const riff = isRiff(sec);
      const big = sec === 'chorus' || sec === 'lift';
      const end = sec === 'outro' && last(c);
      const nextBig = last(c) && (c.next === 'chorus' || c.next === 'lift');

      // ── the tune ──
      const LEAD: Record<string, number> = {
        verse: 0.66, pre: 0.68 + 0.1 * through(c), chorus: 0.8, bridge: 0.62, pre2: 0.7 + 0.12 * through(c), lift: 0.9,
        solo: 0.76 + 0.16 * through(c),
      };
      // the solo now and then trades bars three and four with the brass section (and they play bar seven together)
      const traded = sec === 'solo' && !calm && c.x[0] > 0.5 && (i === 2 || i === 3);
      const tutti = sec === 'solo' && !calm && c.x[0] > 0.5 && i === 6;
      if (riff) {
        if (calm) lyr(c, lead, 0.58);
      } else if (c.mel.length && !traded) lyr(c, lead, LEAD[sec] ?? 0.7);
      // the glock doubles the theme an octave up in the last chorus (and now and then in a later chorus)
      if (sec === 'lift' || (sec === 'chorus' && c.x[3] > 0.6)) {
        for (const n of c.mel) {
          const m = c.tonic + n.semi + 24;
          const v = hum(c, sec === 'lift' ? 0.6 : 0.48, 0.06);
          c.at(n.at, (t) => glock(t, m, c.dur(Math.min(n.len, 6)), v), true);
        }
      }

      // ── the DX: held chords when paused; otherwise pushes, stabs and answers ──
      if (calm) {
        if (c.fresh) c.at(0, (t) => keys(t, c.v, c.dur(c.v2 ? 8 : 16 * c.hold) * 0.98, 0.42), true);
        if (c.v2) c.at(8, (t) => keys(t, c.v2!, c.dur(8) * 0.98, 0.42), true);
      } else if (end) {
        c.at(0, (t) => keys(t, c.v, c.dur(12), 0.62), true);
      } else if (sec === 'brk') {
        // the break: the keys sit out two bars, then push the band back in
        if (i >= 2) for (const [s, l, v] of [[0, 2, 0.5], [3, 1, 0.44], [6, 2, 0.52], [10, 1, 0.46], [12, 3, 0.54]] as const) {
          c.at(s, (t) => keys(t, voicingAt(c, s), c.dur(l) * 0.9, hum(c, v, 0.05)), true);
        }
      } else {
        let comp: [number, number, number][];
        if (sec === 'bridge') comp = [[0, 7.6, 0.44], [8, 7.6, 0.34]];
        else if (sec === 'solo') comp = c.x[1] > 0.5 ? [[0, 2, 0.48], [6, 2, 0.44], [12, 3, 0.46]] : [[0, 3, 0.5], [6, 2, 0.44], [10, 1, 0.4], [12, 3, 0.46]];
        else if (sec === 'pre' || sec === 'pre2') comp = [[0, 3, 0.5], [4, 3, 0.46], [8, 3, 0.5], [12, 3, 0.48]].map(([s, l, v]) => [s, l, v + 0.12 * through(c)] as [number, number, number]);
        else if (big) comp = c.x[1] > 0.5 ? [[0, 2, 0.54], [3, 1, 0.42], [6, 2, 0.5], [10, 1, 0.44], [12, 3, 0.5]] : [[0, 3, 0.56], [6, 2, 0.48], [10, 1, 0.44], [12, 3, 0.5]];
        else if (riff || sec === 'groove') comp = [[0, 6, 0.5], [10, 2, 0.45], [14, 2, 0.42]];
        else if (c.mel.length && c.mel[0].at === 0) comp = [[0, 13, 0.46], [14, 2, 0.4]];
        else comp = [[0, 2, 0.48], [10, 2, 0.44]];
        for (const [s, l, v] of comp) c.at(s, (t) => keys(t, voicingAt(c, s), c.dur(l) * 0.9, hum(c, v, 0.05)), true);
        // the answer: in the verse's gaps a quick climb through the chord an octave up
        if (sec === 'verse' && (!c.mel.length || c.mel[0].at >= 8) && !(c.x[2] > 0.5)) {
          const v = voicingAt(c, 2);
          const run = [v[1], v[2], v[3], v[1] + 12, v[2] + 12];
          run.forEach((m, k2) => c.at(2 + k2, (t) => ep(t, m + 12, c.dur(k2 === 4 ? 3 : 1) * 0.9, 0.5 + k2 * 0.06, 0.2), true));
        }
      }

      // ── strings: the choruses and the bridge (and everything when paused) ──
      if (calm || big || sec === 'bridge' || ((sec === 'pre' || sec === 'pre2' || sec === 'solo') && i >= (sec === 'solo' ? 4 : 2))) {
        const vel = calm ? 0.45 : sec === 'lift' ? 0.62 : big ? 0.55 : sec === 'bridge' ? 0.5 : 0.4;
        // (no doubling above the voicing: the octave over C5 is the tune's)
        const play = (t: number, v: number[], dur: number) => strings(t, v, dur, vel);
        if (c.fresh) c.at(0, (t) => play(t, c.v, c.dur(c.v2 ? 8 : 16 * c.hold) * 0.98));
        if (c.v2) c.at(8, (t) => play(t, c.v2!, c.dur(8) * 0.98));
      }

      const tuneEnd = tuneAt(c, 15, held);
      if (calm) {
        held = tuneEnd;
        return;
      }

      // ── brass ──
      if (riff || traded || tutti) {
        for (const n of c.mel) {
          // in the solo's tutti the section plays an octave under the Lyricon (the peak is above a trumpet's)
          const top = c.tonic + n.semi + (tutti ? 0 : 12);
          // a section plays the solo's sixteenth runs in unison, its longer notes in harmony
          const notes = sec === 'solo' && n.len <= 1 ? [top] : soli(top, voicingAt(c, n.at), 3);
          const v = hum(c, (n.at % 4 === 0 ? 0.88 : 0.8) * (sec === 'intro' ? 0.92 : tutti ? 0.86 : 1), 0.05);
          const long = n.len >= 4;
          c.at(n.at, (t) => brass(t, notes, c.dur(end ? 8 : n.len) * (long ? 0.9 : 0.7), v, end ? 'hold' : long ? 'hold' : 'stab'));
        }
      } else if (sec === 'pre' || sec === 'pre2') {
        // swells: each bar's chord breathing in under the climb
        c.at(0, (t) => brass(t, voicingAt(c, 0), c.dur(16) * 0.96, 0.5 + 0.3 * through(c), 'swell'));
      } else if ((big || sec === 'solo') && i % 2 === 1) {
        // stabs in the theme's gaps, voiced under the held note
        const hits: [number, number, number][] = i === 7 && sec === 'chorus' ? [[12, 1, 0.8], [14, 2, 0.95]] : i % 4 === 1 ? [[10, 1.2, 0.8], [12, 2.4, 0.96]] : [[9, 1, 0.72], [10, 1, 0.82], [14, 2, 0.95]];
        for (const [s, l, v] of hits) {
          const notes = under(voicingAt(c, s).map((m) => m + 12), tuneAt(c, s, held));
          c.at(s, (t) => brass(t, notes, c.dur(l) * 0.75, v * (sec === 'lift' ? 1 : sec === 'solo' ? 0.8 : 0.92), 'stab'));
        }
      } else if (sec === 'brk' && i === 3) {
        // the band's way back in: three hits over the fill
        for (const [s, l, v] of [[10, 1, 0.8], [12, 1, 0.86], [14, 2, 1]] as const) {
          c.at(s, (t) => brass(t, under(voicingAt(c, s).map((m) => m + 12), 80), c.dur(l) * 0.75, v, 'stab'));
        }
      } else if (sec === 'verse' && (i === 7 || (c.x[2] > 0.5 && i % 2 === 1))) {
        // a push into the pre-chorus (later verses: the brass answers instead of the DX)
        const hits: [number, number, number][] = i === 7 ? [[14, 2, 0.8]] : [[2, 1, 0.7], [3, 1, 0.75], [6, 2, 0.85]];
        for (const [s, l, v] of hits) c.at(s, (t) => brass(t, under(voicingAt(c, s).map((m) => m + 12), 80), c.dur(l) * 0.75, v, 'stab'));
      }
      if (big && i === 0) c.at(0, (t) => brass(t, under(c.v.map((m) => m + 12), tuneAt(c, 0, held)), c.dur(2) * 0.8, 0.9, 'stab'));
      held = tuneEnd;

      // ── drums ──
      const style: Style =
        sec === 'brk' ? 'brk'
        : sec === 'bridge' ? 'half'
        : sec === 'pre' || sec === 'pre2' ? 'pre'
        : big || sec === 'inter' || sec === 'outro' || (sec === 'solo' && i >= 4) ? 'big'
        : sec === 'verse' && c.pass === 0 && c.turn === 0 && i < 4 ? 'light' : 'main';
      let fill: Fill | null = null;
      let roll = false;
      if (last(c) && !end) {
        if (sec === 'bridge') roll = true;
        else if (nextBig || sec === 'brk') fill = FILLS[sec === 'pre2' || sec === 'brk' ? 1 : Math.floor(c.x[4] * 2)];
        else fill = FILLS[2];
      }
      if (end) {
        c.at(0, (t) => (kit.kick(t, 1), kit.snare(t, 0.9), kit.clap(t, 0.7)));
        c.at(0, (t) => cym.crash(t, 0.9));
      } else drums(c, kit, hatKit, style, fill, roll);
      if (!end && i === 0 && sec !== 'groove') c.at(0, (t) => cym.crash(t, big ? 0.85 : sec === 'verse' || sec === 'bridge' ? 0.55 : 0.75));
      if ((big || sec === 'solo') && i === 4) c.at(0, (t) => cym.crash(t, 0.7));
      if (big || sec === 'inter' || (sec === 'solo' && i >= 4)) {
        c.at(4, (t) => perc.tambourine(t, 0.6, 'hit'));
        c.at(12, (t) => perc.tambourine(t, 0.64, 'hit'));
        for (const s of [2, 6, 10, 14]) c.at(s, (t) => perc.tambourine(t, 0.32, 'shake'));
      }
      if (last(c) && (sec === 'pre' || sec === 'pre2')) c.at(0, (t) => riser(t, c.dur(16), sec === 'pre2' ? 1 : 0.8));

      // ── bass ──
      if (end) c.at(0, (t) => bass(t, BASS_LO + pcOf(c.bass - BASS_LO), c.dur(10), 1, 'slap'));
      else bassLine(c, bass, sec === 'brk' ? BREAK : sec === 'bridge' ? HALF : sec === 'pre' || sec === 'pre2' ? PUMP : sec === 'verse' && !(c.x[5] > 0.6) ? FINGER : SLAP, sec === 'intro' && i < 2 ? 0.9 : 1);

      // ── guitar: chops on the backbeat, chicks between ──
      if (!end) {
        if (sec === 'bridge') {
          if (i % 2 === 0) c.at(0, (t) => gtr.strum(t, gtrChord(c.v), c.dur(14), 0.42, 'down', 0.012), true);
        } else {
          // verses: chops on the backbeat; the big sections: the cutting, accents on the tresillo's off-beats (3, 6, 11, 14)
          const cutting = big || sec === 'inter' || sec === 'solo' || sec === 'outro';
          const pat = sec === 'pre' || sec === 'pre2' ? '..x...x...x...x.'
            : sec === 'brk' ? '-.-.o.-.-.-.o.-.'
            : cutting ? (c.x[6] > 0.5 ? '-.-xo.x.-.-xo.x-' : '-.-xo.x.-.-.o.x.')
            : c.x[6] > 0.5 ? '.-..x..-.-..x.o.' : '..-.x.-...-.x.-.';
          for (let s = 0; s < 16; s++) {
            const ch = pat[s];
            if (ch === '.') continue;
            const v = gtrChord(voicingAt(c, s));
            if (ch === 'x') c.at(s, (t) => gtr.strum(t, v, c.dur(1) * 0.7, 0.72, s % 2 ? 'up' : 'down', 0.004), true);
            else c.at(s, (t) => gtr.chick(t, v, ch === 'o' ? 0.5 : 0.34), true);
          }
        }
      }

      // ── the drive layer: sixteenth hats and a second guitar's chicks ──
      if (drive && !end) {
        for (let s = 0; s < 16; s++) c.at(s, (t) => hats.hat(t, s % 4 === 2 ? 0.46 : s % 2 === 0 ? 0.34 : 0.24));
        if (sec !== 'bridge') for (let s = 0; s < 16; s++) {
          const v = gtrChord(voicingAt(c, s));
          c.at(s, (t) => gtr16.chick(t, v, s % 4 === 2 ? 0.5 : s % 2 === 0 ? 0.3 : 0.22), true);
        }
      }
    };
  },
};

