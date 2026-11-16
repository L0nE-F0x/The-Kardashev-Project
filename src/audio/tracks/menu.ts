/**
 * "Kardashev", the title screen's anthem (score v3): the game's theme as a warm, confident anthem in B♭ major at 104
 * that previews the whole journey, each section borrowing an era's colours.
 *
 *   intro  4 bars   the four-note signal on the celesta over a held B♭maj7 → E♭maj7 (a warm pad, the harp rolling the
 *                   chords), a harp sweep up into the tune
 *   a1     8 bars   the theme on the vibraphone (left open on V), over the garage: a Rhodes on the off-beats, a
 *                   fingered bass, the funk kit at half strength (kick, cross-stick, eighth hats), all held back so
 *                   the next A can step up
 *   a2     8 bars   the theme in octaves, flute over vibes, the full groove (the kick on the theme's 3+3+2, the drums
 *                   and the bass tight, a few milliseconds of life), a DX brass section answering in the tune's gaps,
 *                   a shaker joining halfway
 *   b      8 bars   the bridge sung by the strings an octave up, brass swelling softly under them (its upper notes:
 *                   the low mids stay clear), the harp's eighths, the kit to the ride, then floor toms, a shaker and an
 *                   eighth-note bass driving; a fill, a riser and a harp sweep lift it through G9sus4 into...
 *   a3     8 bars   ...the theme a whole tone up in C: the strings bowing the tune at pitch with the vibes, the flute
 *                   an octave over, the glockenspiel two up, the choir on 'ah', brass stabs answering, the
 *                   tambourine, the crash: the biggest moment
 *   out    5 bars   a crash to land on, the hook on the vibes, echoed by the celesta, the groove thinning to a kick,
 *                   a held C6/9; the band counts the next pass back into B♭
 *
 * Later passes vary: the intro skipped or kept (its signal now and then on the glockenspiel), the tune traded between
 * vibes, flute and celesta, a DX comp in place of the Rhodes, and `riff`, an instrumental A where bass and brass play
 * the hook as a riff on every chord and the vibes answer with the theme's own replies.
 */
import { bassAt, hum, sing, through, voicingAt } from '../arrange';
import type { Bar, Setup, TrackDef } from '../cinematic';
import { bassNote, chords, type Chord } from '../score';
import { makeKit } from '../synth';
import { BRIDGE, HOOK, SIGNAL, THEME_CHORDS, THEME_CHORDS_OPEN, THEME_HOME, THEME_OPEN, roman } from '../theme';
import { makeFunkKit, makePercussion, type HatStroke, type SnareStroke } from '../voices/drums';
import { keysChord, makeEPiano, type EPNote } from '../voices/keys';
import { makeCelesta, makeGlock, makeVibes } from '../voices/mallets';
import { makeChoir, makeStrings, makeWarmPad } from '../voices/pads';
import { makeElectricBass, makeHarp } from '../voices/plucked';
import { makeFMBrass, type BrassShape } from '../voices/synths';
import { makeFlute, type Wind } from '../voices/winds';

const BASS_LO = 33;

const SECS = {
  intro: { ch: 'Bbmaj7 | . | Ebmaj7 | .', mel: SIGNAL },
  a1: { ch: roman(THEME_CHORDS_OPEN, 'Bb'), mel: THEME_OPEN },
  a2: { ch: roman(THEME_CHORDS, 'Bb'), mel: THEME_HOME },
  // the bridge's last bar turns to G (V of C) for the lift
  b: { ch: 'Ebmaj7 | F | Dm7 | Gm7 | Cm7 | Bb/D | Ebmaj7 | F G9sus4', mel: BRIDGE },
  a3: { ch: roman(THEME_CHORDS, 'C'), mel: THEME_HOME, tonic: 60 },
  out: { ch: 'Fmaj7 | C | Fmaj7 | C69 | .', mel: `${HOOK} | -:16 | ${HOOK} | 1'':16`, tonic: 60 },
  // an instrumental A: the tune's answering bars only (the hook bars are the riff's)
  riff: { ch: roman(THEME_CHORDS_OPEN, 'Bb'), mel: THEME_OPEN },
};
type SecName = keyof typeof SECS;

const BARS = Object.fromEntries(Object.entries(SECS).map(([k, s]) => [k, chords(s.ch)])) as Record<string, Chord[][]>;

/** The bass note the next bar starts on (the next section's first, at a section's end). */
function nextBass(c: Bar): number {
  const nb = c.i < c.len - 1 ? BARS[c.sec]?.[c.i + 1] : BARS[c.next]?.[0];
  return nb ? bassNote(nb[0], BASS_LO) : c.bass;
}

/** Hits from a digit pattern, one character a step: 1–9 the velocity in tenths, `.` a rest (spaces ignored). */
function dig(p: string, fn: (step: number, vel: number) => void): void {
  const s = p.replace(/\s/g, '');
  for (let i = 0; i < s.length; i++) if (s[i] >= '1' && s[i] <= '9') fn(i, Number(s[i]) / 10);
}

/** The scale of the bar's key (major), as pitches from `lo` to `hi`. */
function scale(tonic: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if ([0, 2, 4, 5, 7, 9, 11].includes((((m - tonic) % 12) + 12) % 12)) out.push(m);
  return out;
}

type Kit = ReturnType<typeof makeFunkKit>;
type Bass = (t: number, m: number, dur: number, vel: number, mute?: boolean) => void;
type Brass = (t: number, notes: number[], dur: number, vel: number, shape?: BrassShape) => void;
type Strings = (t: number, notes: number[], dur: number, vel: number, swell?: number, legato?: boolean) => void;

export const track: TrackDef = {
  bpm: 104, steps: 16, beat: 4, swing: 0.05, tonic: 58, delay: 3,
  lo: 50, hi: 66, size: 4, bassLo: BASS_LO, gain: 1.15,
  secs: SECS,
  form: (pass, r) => {
    if (pass === 0) return ['intro', 'a1', 'a2', 'b', 'a3', 'out'];
    const forms: SecName[][] = [
      ['a1', 'a2', 'b', 'a3', 'out'],
      ['intro', 'riff', 'a2', 'b', 'a3', 'out'],
      ['riff', 'a1', 'b', 'a3', 'out'],
      ['intro', 'a1', 'riff', 'b', 'a3', 'out'],
      ['a2', 'riff', 'b', 'a3', 'out'],
    ];
    return forms[Math.floor(r() * forms.length)];
  },
  setup(k: Setup) {
    const { ctx } = k;
    // ── the tune ──
    const vib = makeVibes(ctx, k.strip('vibes', { gain: 0.62, rev: 0.24, del: 0.12 }), k.r, { motor: 4.2, depth: 0.42, mallet: 0.55, spread: 0.35, onStop: k.onStop });
    const flute = makeFlute(ctx, k.strip('flute', { gain: 0.5, rev: 0.3, del: 0.12, pan: 0.12 }), k.r, { breath: 0.9 });
    const glock = makeGlock(ctx, k.strip('glock', { gain: 0.2, rev: 0.3, del: 0.12, pan: 0.3 }), k.r);
    const cel = makeCelesta(ctx, k.strip('celesta', { gain: 0.46, rev: 0.36, del: 0.26, pan: -0.25 }), k.r);
    // ── harmony ──
    const pad = makeWarmPad(ctx, k.strip('pad', { gain: 0.22, rev: 0.4, del: 0.04, hp: 170 }), k.r, { cut: 1500, onStop: k.onStop });
    const harp = makeHarp(ctx, k.strip('harp', { gain: 0.36, rev: 0.32, del: 0.08, hp: 110, pan: -0.15 }), k.r, { width: 0.6 });
    const strings: Strings = makeStrings(ctx, k.strip('strings', { gain: 0.42, rev: 0.36, del: 0.03, hp: 150 }), k.r, { attack: 0.35, release: 0.6, players: 3, width: 0.8 });
    const choir = makeChoir(ctx, k.strip('choir', { gain: 0.3, rev: 0.42, hp: 140 }), k.r, { voices: 3 });
    const brass: Brass = makeFMBrass(ctx, k.strip('brass', { gain: 0.36, rev: 0.22, del: 0.05, hp: 120, pan: 0.18 }), k.r, { bite: 0.95, onStop: k.onStop });
    // ── the band ──
    const rhodes: EPNote = makeEPiano(ctx, k.strip('keys', { gain: 0.3, group: 'rhythm', rev: 0.16, del: 0.04, hp: 110, pan: -0.2 }), k.r, { model: 'rhodes', tremolo: 3.4, onStop: k.onStop });
    const dx: EPNote = makeEPiano(ctx, k.strip('dx', { gain: 0.36, group: 'rhythm', rev: 0.18, del: 0.06, hp: 110, pan: -0.2 }), k.r, { model: 'dx', onStop: k.onStop });
    const bass: Bass = makeElectricBass(ctx, k.strip('bass', { gain: 0.62, group: 'rhythm', rev: 0.03 }), k.r);
    const kit: Kit = makeFunkKit(ctx, k.strip('kit', { gain: 0.44, group: 'rhythm', rev: 0.08 }), k.r);
    const fx = makeKit(ctx, k.strip('fx', { gain: 0.42, group: 'rhythm', rev: 0.45 }), k.r);
    const perc = makePercussion(ctx, k.strip('perc', { gain: 0.3, group: 'rhythm', rev: 0.14, pan: 0.32 }), k.r);
    void kit.warm();
    void perc.warm();
    vib.warm(53, 89);
    cel.warm(62, 98);
    glock.warm(88, 110);

    // ── small players ──
    // the rhythm section plays tight: a few milliseconds of life (the arranger's `human` is up to 14 ms late, which
    // smears a locked kick and bass), the snare a hair behind the beat for the weight
    const K = (c: Bar, s: number, v: number) => c.at(s, (t) => kit.kick(t, hum(c, v, 0.05)));
    const S = (c: Bar, s: number, v: number, how: SnareStroke = 'center') => {
      const d = 0.002 + c.r() * 0.005;
      c.at(s, (t) => kit.snare(t + d, hum(c, v, 0.08), how));
    };
    const H = (c: Bar, s: number, v: number, how: HatStroke = 'closed') => {
      const d = c.r() * 0.004;
      c.at(s, (t) => kit.hat(t + d, hum(c, v, 0.1), how));
    };
    const R = (c: Bar, s: number, v: number, how: 'bow' | 'bell' = 'bow') => {
      const d = c.r() * 0.005;
      c.at(s, (t) => kit.ride(t + d, hum(c, v, 0.08), how));
    };
    const TOM = (c: Bar, s: number, v: number, which: 'high' | 'mid' | 'floor') => {
      const d = c.r() * 0.006;
      c.at(s, (t) => kit.tom(t + d, hum(c, v, 0.06), which));
    };
    const CR = (c: Bar, s: number, v: number) => c.at(s, (t) => kit.crash(t, v));
    const B = (c: Bar, s: number, m: number, len: number, v: number, mute = false) => {
      const d = c.r() * 0.004;
      c.at(s, (t) => bass(t + d, m, c.dur(len) * 0.92, hum(c, v, 0.06), mute));
    };

    /** The approach note on the bar's last eighth into the next bar's bass note. */
    const approach = (c: Bar): number => {
      const cur = bassAt(c, 14), nb = nextBass(c);
      if (nb === cur) return cur + 12 <= 55 ? cur + 12 : cur - 5;
      return c.r() < 0.55 ? nb - 1 : nb + 2;
    };

    /** The tune on a mallet or a wind, an octave shift, a velocity. A wind's short notes slur into the next. */
    const singWind = (c: Bar, w: Wind, vel: number, oct: number) => {
      let prev = 0;
      for (const n of c.mel) {
        const slur = prev > 0 && prev <= 2;
        const len = c.dur(n.len) * (n.len <= 2 ? 1.08 : 0.92);
        const m = c.tonic + n.semi + oct;
        // the flute's top (above A6) is shrill when pushed: the peak notes are blown a little softer
        const v = vel * (n.at === 0 ? 1 : 0.92) * (0.95 + c.r() * 0.1) * (m > 93 ? 0.84 : 1);
        c.at(n.at, (t) => w(t, m, len, v, slur), true);
        prev = n.len;
      }
    };

    // the strings' line: slurred where a note starts as the last one ends
    let lineEnd = -1, lineLast = 0;
    /** `slurAfter`: slur only out of notes this short (steps): the bridge sings legato, the anthem bows each note. */
    const singStrings = (c: Bar, vel: number, oct: number, swell = 0.35, slurAfter = 99) => {
      for (const n of c.mel) {
        const at = c.n * c.steps + n.at;
        // a new section's first note is a fresh bow (never a slide from the last section's line)
        const legato = at === lineEnd && !(c.i === 0 && n.at === 0) && lineLast <= slurAfter;
        lineEnd = at + n.len;
        lineLast = n.len;
        const v = vel * (n.len >= 8 ? 1 : 0.9) * (0.96 + c.r() * 0.08);
        c.at(n.at, (t) => strings(t, [c.tonic + n.semi + oct], c.dur(n.len) + 0.03, v, legato ? 0 : swell, legato), true);
      }
    };

    /** The Rhodes (or the DX) comping: chords on the off-beats, or the city-pop pushes. */
    const OFF: [number, number, number][] = [[2, 1.5, 1], [6, 1.2, 0.82], [10, 1.5, 1], [14, 1.2, 0.86]];
    const PUSH: [number, number, number][] = [[0, 2.5, 1], [3, 2, 0.78], [6, 3, 0.9], [10, 1.5, 0.8], [12, 3, 0.92]];
    const comp = (c: Bar, ep: EPNote, vel: number, pat = OFF) => {
      for (const [s, len, v] of pat) c.at(s, (t) => keysChord(ep, c.r, t, voicingAt(c, s), c.dur(len), hum(c, vel * v, 0.06), 0.005), true);
    };

    /** Brass answers in the tune's gaps (the second half of bars 2, 4, 6; all of bar 8). */
    const ANSWER: [number, number, number, BrassShape][] = [[10, 1, 0.72, 'stab'], [11, 1, 0.82, 'stab'], [14, 1.6, 1, 'stab']];
    const ANSWER_HOME: [number, number, number, BrassShape][] = [[2, 1, 0.7, 'stab'], [3, 1, 0.8, 'stab'], [6, 1.5, 0.9, 'stab'], [10, 1, 0.74, 'stab'], [11, 1, 0.84, 'stab'], [12, 3.5, 1, 'hold']];
    const answer = (c: Bar, vel: number) => {
      if (c.i % 2 === 0) return;
      const fig = c.i === c.len - 1 && c.sec !== 'a1' && c.sec !== 'riff' ? ANSWER_HOME : ANSWER;
      for (const [s, len, v, shape] of fig) c.at(s, (t) => brass(t, voicingAt(c, s).slice(-3).map((m) => m + 12), c.dur(len), vel * v, shape), true);
    };

    /** The hook on this bar's chord: so–do–re–mi–so from its root (the chord's own third), for the riff. */
    const hookOn = (c: Bar): [number, number, number][] => {
      const third = c.ch.tones.includes(3) ? 3 : 4;
      return [[0, -5, 3], [3, 0, 3], [6, 2, 2], [8, third, 4], [12, 7, 4]];
    };

    /** Something held for each of the bar's chords: (step, voicing, steps it lasts). */
    const held = (c: Bar, fn: (s: number, v: number[], n: number) => void) => {
      if (c.fresh) fn(0, c.v, c.v2 ? 8 : 16 * c.hold);
      if (c.v2) fn(8, c.v2, 8);
    };

    // ── the sections ──
    const intro = (c: Bar) => {
      const { i } = c;
      if (c.fresh) c.at(0, (t) => pad(t, c.v, c.dur(c.steps * c.hold), 0.42 + 0.06 * i, 0.75 + 0.1 * i));
      // the signal: the note an octave up, its lower octave under it, softly (later passes: now and then the
      // glockenspiel rings it two octaves up instead)
      if (c.pass > 0 && c.x[2] > 0.5) sing(c, glock, 0.5 + 0.04 * i, 24, 1);
      else sing(c, cel, 0.62 + 0.04 * i, 12, 1);
      sing(c, cel, 0.3, 0, 1);
      if (i === 0 || i === 2) c.at(0, (t) => harp.chord(t, [c.bass + 12, ...c.v], c.dur(24), 0.34, 0.06));
      if (i === 1) [0, 4, 8, 12].forEach((s, j) => c.at(s + 2, (t) => harp.note(t, c.v[j % 4] + 12, c.dur(10), 0.24 + 0.02 * j)));
      if (i === 3) {
        const up = scale(58, 58, 89);
        c.at(8, (t) => harp.gliss(t, up, c.dur(8) / up.length, 0.42));
        // the band counts itself in: hats, a soft pickup on the snare and toms, the bass's pickup
        [8, 10, 12].forEach((s, j) => H(c, s, 0.22 + 0.06 * j, 'pedal'));
        S(c, 12, 0.22, 'ghost');
        S(c, 13, 0.3, 'ghost');
        TOM(c, 14, 0.42, 'mid');
        TOM(c, 15, 0.5, 'floor');
        B(c, 14, 41, 1.6, 0.6);
      }
    };

    const theme = (c: Bar) => {
      const { sec, i } = c;
      const lastBar = i === c.len - 1;
      const alt = c.pass > 0;
      const x0 = c.x[0], x1 = c.x[1];
      const useDx = alt && x1 > 0.55;
      const ep = useDx ? dx : rhodes;
      if (sec === 'a1') {
        // the tune: the vibes (later passes trade it)
        if (!alt || x0 < 0.4) sing(c, vib, 0.8);
        else if (x0 < 0.72) singWind(c, flute, 0.74, 12);
        else {
          sing(c, vib, 0.7);
          sing(c, cel, 0.5, 12);
        }
        if (c.fresh && i === 0 && c.n > 0) CR(c, 0, 0.5);
        // half strength: the keys and the pad stay back, so the second A can step up
        comp(c, ep, 0.44, useDx ? PUSH : OFF);
        held(c, (s, v, n) => c.at(s, (t) => pad(t, v, c.dur(n), 0.25, 0.75)));
        // the bass: long roots, the octave, the fifth's kick, the approach
        B(c, 0, c.bass, 5, 0.8);
        B(c, 6, c.bass + 12, 1, 0.52);
        B(c, 10, bassAt(c, 10), 2.5, 0.72);
        if (!lastBar) B(c, 14, approach(c), 1.5, 0.6);
        // the kit at half strength
        dig(lastBar ? '5.3. 5.3. 5.3. ....' : '5.3. 5.3. 5.3. 5.32', (s, v) => H(c, s, v));
        dig('8... .... ..6. ....', (s, v) => K(c, s, v));
        dig('.... 5... .... 5...', (s, v) => S(c, s, v, 'cross'));
        if (lastBar) {
          dig('.... .... .... 3456', (s, v) => S(c, s, v, s < 14 ? 'ghost' : 'center'));
          B(c, 14, approach(c), 1.5, 0.66);
        }
        return;
      }
      const big = sec === 'a3';
      const riff = sec === 'riff';
      // ── the tune ──
      if (riff) {
        if (i % 2 === 1) sing(c, vib, 0.76);
        else {
          // the hook as a riff: bass and the brass in octaves
          const root = c.bass;
          const top = root + 24 > 62 ? root + 12 : root + 24;
          for (const [s, iv, len] of hookOn(c)) {
            B(c, s, root + iv, len, s === 0 ? 0.9 : 0.74);
            c.at(s, (t) => brass(t, [top + iv, top + iv + 12], c.dur(len) * 0.86, s === 0 ? 0.78 : 0.66, len <= 2 ? 'stab' : 'auto'), true);
          }
        }
      } else if (big) {
        // the anthem: the strings take the tune at pitch (their sweet G4–C6), the vibes with them, the flute an
        // octave over, the glockenspiel two up
        singStrings(c, 0.74, 0, 0.1, 2);
        sing(c, vib, 0.72);
        singWind(c, flute, 0.74, 12);
        sing(c, glock, 0.46, 24);
      } else {
        // a2: flute and vibes in octaves (later: vibes and glockenspiel)
        if (!alt || x0 < 0.6) {
          singWind(c, flute, 0.8, 12);
          sing(c, vib, 0.64);
        } else {
          sing(c, vib, 0.8);
          sing(c, glock, 0.42, 24);
        }
      }
      // ── answers and harmony ──
      if (!riff) answer(c, big ? 0.86 : 0.78);
      if (big) {
        // the choir under the tune on 'ah' (the strings are singing the tune now: no chord of theirs in its register)
        if (c.fresh) c.at(0, (t) => choir(t, c.v, c.dur(c.v2 ? 8 : 16 * c.hold), 0.6, 'ah'));
        if (c.v2) c.at(8, (t) => choir(t, c.v2!, c.dur(8), 0.6, 'ah'));
        if (i === 0 || i === 4) c.at(0, (t) => brass(t, c.v.slice(-3).map((m) => m + 12), c.dur(2), 0.9, 'stab'));
      }
      held(c, (s, v, n) => c.at(s, (t) => pad(t, v, c.dur(n), big ? 0.3 : 0.34, big ? 1 : 0.85)));
      comp(c, ep, big ? 0.58 : 0.56, useDx ? PUSH : OFF);
      // ── the bass ──
      if (!(riff && i % 2 === 0)) {
        const r2 = bassAt(c, 10);
        B(c, 0, c.bass, 2.5, 0.92);
        B(c, 3, c.bass, 1, 0.56);
        B(c, 4, c.bass, 0.5, 0.3, true);
        B(c, 6, c.bass + 12, 1, 0.7);
        B(c, 7, c.bass + 12, 0.5, 0.28, true);
        B(c, 10, r2, 1.5, 0.8);
        B(c, 12, r2 + 12, 1, 0.5);
        B(c, 14, approach(c), 1, 0.68);
        B(c, 15, approach(c), 0.5, 0.3, true);
      }
      // ── the percussion: a shaker through the second half of A2, the tambourine lifting the last chorus ──
      if (big) {
        dig('4.3. 4.3. 4.3. 4.3.', (s, v) => c.at(s, (t) => perc.tambourine(t, hum(c, v, 0.12)), true));
        if (!lastBar) for (const s of [4, 12]) c.at(s, (t) => perc.tambourine(t, 0.6, 'hit'), true);
      } else if (sec === 'a2' && i >= 4) dig('4232 4232 4232 4232', (s, v) => c.at(s, (t) => perc.shaker(t, v * 0.8, v > 0.35 ? 0.08 : 0.05), true));
      // ── the kit ──
      if (big && (i === 0 || i === 4)) CR(c, 0, i === 0 ? 0.95 : 0.75);
      else if (i === 0 && c.n > 0) CR(c, 0, 0.62);
      const open = big ? i % 2 === 1 : i % 4 === 3;
      if (lastBar) {
        dig('6242 6242 .... ....', (s, v) => H(c, s, v));
        dig('9..6 ..7. 8... ....', (s, v) => K(c, s, v));
        S(c, 4, 0.85);
        S(c, 8, 0.6);
        S(c, 10, 0.5);
        TOM(c, 12, 0.7, 'high');
        TOM(c, 13, 0.62, 'high');
        TOM(c, 14, 0.75, 'mid');
        TOM(c, 15, 0.85, 'floor');
        return;
      }
      if (big) dig(open ? '7353 7353 7353 73..' : '7353 7353 7353 7353', (s, v) => H(c, s, v));
      else dig(open ? '6242 6242 6242 62..' : '6242 6242 6242 6242', (s, v) => H(c, s, v));
      if (open) H(c, 14, big ? 0.62 : 0.52, 'open');
      dig(big ? '9..6 ..8. ..8. ...5' : '9..6 ..7. ..8. ....', (s, v) => K(c, s, v));
      S(c, 4, big ? 0.95 : 0.82);
      S(c, 12, big ? 0.95 : 0.84);
      dig('.... ...2 .2.. ...2', (s, v) => S(c, s, v, 'ghost'));
    };

    const bridge = (c: Bar) => {
      const { i } = c;
      const k2 = through(c);
      const alt = c.pass > 0 && c.x[0] > 0.6;
      // the bridge's tune: the strings an octave up (later: the flute, the strings holding the chords)
      if (alt) {
        singWind(c, flute, 0.74, 12);
        if (c.fresh) c.at(0, (t) => strings(t, c.v.map((m) => m + 12), c.dur(c.v2 ? 8 : 16), 0.42, 0.5));
        if (c.v2) c.at(8, (t) => strings(t, c.v2!.map((m) => m + 12), c.dur(8), 0.42, 0.3));
      } else singStrings(c, 0.76 + 0.22 * k2, 12);
      // brass swelling under it (its upper three notes: the low mids stay clear for the bass and the toms), the choir
      // joining for the second half
      if (c.fresh) c.at(0, (t) => brass(t, c.v.slice(1), c.dur(c.v2 ? 8 : 16) * 0.98, 0.3 + 0.16 * k2, 'swell'));
      if (c.v2) c.at(8, (t) => brass(t, c.v2!.slice(1), c.dur(8) * 0.98, 0.5, 'swell'));
      if (i >= 4 && c.fresh) c.at(0, (t) => choir(t, c.v, c.dur(c.v2 ? 8 : 16), 0.27 + 0.1 * k2, 'oo'));
      if (i >= 4 && c.v2) c.at(8, (t) => choir(t, c.v2!, c.dur(8), 0.36, 'oo', 'ah'));
      // the harp's eighths through the chord
      const ord = [0, 1, 2, 3, 4, 3, 2, 1];
      if (i < 7) ord.forEach((j, e) => {
        const s = e * 2;
        const v = voicingAt(c, s);
        c.at(s, (t) => harp.note(t, v[j % 4] + 12 * Math.floor(j / 4) + 12, c.dur(5), 0.26 + 0.08 * k2 + (e % 2 ? 0 : 0.04)), true);
      });
      // a shaker joins the drive of the second half
      if (i >= 4 && i < 7) dig('4.2. 3.2. 4.2. 3.2.', (s, v) => c.at(s, (t) => perc.shaker(t, v, 0.07), true));
      // the bass: long notes, then driving eighths
      if (i < 4) {
        B(c, 0, c.bass, 7, 0.82);
        B(c, 8, bassAt(c, 8), 5.5, 0.66);
        B(c, 14, approach(c), 2, 0.6);
      } else for (let s = 0; s < 16; s += 2) B(c, s, s === 14 && i < 7 ? approach(c) : bassAt(c, s), 1.7, (s % 4 === 0 ? 0.8 : 0.6) + 0.1 * k2);
      // the kit: the ride, the cross-stick, then the snare and floor toms
      if (i === 0) CR(c, 0, 0.7);
      if (i < 7) {
        dig('6.4. 6.4. 6.4. 6.4.', (s, v) => R(c, s, v));
        R(c, 6, 0.42, 'bell');
        R(c, 14, 0.42, 'bell');
        dig('8... .... ..7. ....', (s, v) => K(c, s, v));
        H(c, 4, 0.36, 'pedal');
        H(c, 12, 0.36, 'pedal');
        if (i < 4) {
          S(c, 4, 0.58, 'cross');
          S(c, 12, 0.6, 'cross');
        } else {
          S(c, 4, 0.76);
          S(c, 12, 0.8);
          TOM(c, 6, 0.42, 'floor');
          TOM(c, 14, 0.46, 'floor');
        }
        if (i === 3) {
          TOM(c, 13, 0.5, 'mid');
          TOM(c, 15, 0.58, 'floor');
        }
        return;
      }
      // the last bar: the lift. A fill round the kit, a riser, a cymbal swell, the harp up into C
      dig('9... .... 8... ....', (s, v) => K(c, s, v));
      dig('.... 7... 4567 ....', (s, v) => S(c, s, v));
      TOM(c, 12, 0.72, 'high');
      TOM(c, 13, 0.7, 'high');
      TOM(c, 14, 0.8, 'mid');
      TOM(c, 15, 0.9, 'floor');
      c.at(0, (t) => fx.riser(t, c.dur(16), 0.55));
      c.at(4, (t) => fx.swell(t, c.dur(12), 0.42));
      const up = scale(60, 55, 91);
      c.at(8, (t) => harp.gliss(t, up, c.dur(8) / up.length, 0.46));
      c.at(8, (t) => brass(t, c.v2 ?? c.v, c.dur(8) * 0.95, 0.72, 'swell'));
    };

    const outro = (c: Bar) => {
      const { i } = c;
      // the hook on the vibes (and flute the first time), echoed by the celesta an octave up
      if (i === 0) {
        sing(c, vib, 0.76);
        singWind(c, flute, 0.62, 12);
      }
      if (i === 2) sing(c, vib, 0.66);
      if (i === 3) c.at(0, (t) => vib(t, c.tonic + 24, c.dur(28), 0.72));
      if (i === 1 || i === 3) for (const [s, iv, len] of [[0, 7, 3], [3, 12, 3], [6, 14, 2], [8, 16, 4], [12, 19, 4]] as const) c.at(s, (t) => cel(t, c.tonic + iv + 12, c.dur(len) * 1.2, (i === 1 ? 0.56 : 0.42) * (s ? 0.9 : 1)), true);
      if (c.fresh) {
        const held = c.dur(16 * c.hold);
        c.at(0, (t) => pad(t, c.v.map((m) => m + 12), held, i === 3 ? 0.5 : 0.38, 0.8));
        if (i === 3) {
          c.at(0, (t) => strings(t, [...c.v, c.v[c.v.length - 1] + 12], held * 0.9, 0.46, 0.3));
          c.at(0, (t) => choir(t, c.v, held * 0.9, 0.42, 'ah', 'oo'));
          c.at(0, (t) => harp.chord(t, [c.bass, c.bass + 12, ...c.v.map((m) => m + 12)], held, 0.5, 0.07));
          c.at(0, (t) => keysChord(rhodes, c.r, t, c.v, held * 0.8, 0.5, 0.012));
          c.at(0, (t) => brass(t, c.v, c.dur(8), 0.5, 'swell'));
        } else c.at(0, (t) => keysChord(rhodes, c.r, t, c.v, c.dur(14), 0.42, 0.01));
      }
      // the groove thinning out
      if (i === 0) {
        // the landing after A3's fill
        CR(c, 0, 0.6);
        dig('4.3. 4.3. 4.3. 4.3.', (s, v) => H(c, s, v));
        dig('8... .... ..6. ....', (s, v) => K(c, s, v));
        dig('.... 6... .... 6...', (s, v) => S(c, s, v, 'cross'));
        B(c, 0, c.bass, 8, 0.82);
        B(c, 10, c.bass, 5, 0.66);
      } else if (i === 1) {
        dig('3.2. 3.2. 3.2. ....', (s, v) => H(c, s, v));
        K(c, 0, 0.7);
        S(c, 12, 0.5, 'cross');
        B(c, 0, c.bass, 14, 0.72);
      } else if (i === 2) {
        K(c, 0, 0.6);
        R(c, 0, 0.32, 'bell');
        R(c, 8, 0.28, 'bell');
        B(c, 0, c.bass, 14, 0.66);
      } else if (i === 3) {
        K(c, 0, 0.72);
        CR(c, 0, 0.5);
        B(c, 0, c.bass, 28, 0.7);
      } else if (i === c.len - 1 && c.next !== 'intro') {
        // the band counts the next pass in (back in B♭: the bass's F leads home)
        [8, 10, 12].forEach((s, j) => H(c, s, 0.2 + 0.06 * j, 'pedal'));
        S(c, 12, 0.2, 'ghost');
        S(c, 13, 0.28, 'ghost');
        TOM(c, 14, 0.4, 'mid');
        TOM(c, 15, 0.48, 'floor');
        B(c, 14, 41, 1.6, 0.58);
      }
    };

    return (c: Bar) => {
      if (c.sec === 'intro') intro(c);
      else if (c.sec === 'b') bridge(c);
      else if (c.sec === 'out') outro(c);
      else theme(c);
    };
  },
};

