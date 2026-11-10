/**
 * The cinematic soundtrack, written out: seven pieces that share one theme.
 *
 * The theme is a four-note rise, so–do–re–mi (5 1' 2' 3'), answered by a fall; eight bars, then an eight-bar bridge.
 * The menu states it plainly in D; each era hides it in its own colours and brings it back every few sections;
 * the ending plays it at full bloom and lifts it a whole tone. The stings in sfx.ts quote the same four notes.
 *
 *   menu    "First Light"      D major, 76 bpm          felt piano, bells, strings
 *   era0    "Smog & Silicon"   C major / A minor, 72    dusty electric piano, tape wow, boom-bap, a reed
 *   era1    "Grid Rush"        G major, 112             a pumping pad, sixteenth plucks, four on the floor
 *   era2    "Solarpunk Bloom"  F major, 12/8 at 66      marimba, kalimba, hand drums
 *   era3    "Orbital Dawn"     E Lydian, 54             wide pads, glass bells, long echoes, no drums
 *   era4    "Swarmlight"       B major, 60              a choir, shimmering high plucks, bells
 *   ending  "Type I"           D major → E major, 72    everything
 */
import type { Bar, Setup, TrackDef } from './cinematic';
import { crackle, makeBass, makeBell, makeChoir, makeKit, makeLead, makeMallet, makePad, makePiano, makePluck, makeRhodes, type Kit } from './synth';

// ── the theme (sixteen steps a bar) ─────────────────────────────────────────────────────────
const THEME = "5:6 1':4 2':2 3':4 | 2':12 -:4 | 1':6 3':4 2':2 1':4 | 6:12 -:4 | 5:6 1':4 2':2 3':4 | 5':8 4':4 3':4 | 2':6 4':4 3':2 2':4 | ";
/** Ends on the dominant: more to come. */
const THEME_OPEN = THEME + "2':12 -:4";
/** Comes home. */
const THEME_HOME = THEME + "1':16";
const BRIDGE = "6:4 1':4 3':8 | 7:4 2':4 4':6 3':2 | 3':8 2':4 1':4 | 7:12 -:4 | 6:4 1':4 3':8 | 7:4 2':4 5':8 | 5':4 4':4 3':4 2':4 | 2':12 -:4";
/** The same tune lilting in 12/8 (twelve steps a bar). */
const THEME12 = "5:4 1':3 2':2 3':3 | 2':9 -:3 | 1':4 3':3 2':2 1':3 | 6:9 -:3 | 5:4 1':3 2':2 3':3 | 5':6 4':3 3':3 | 2':4 4':3 3':2 2':3 | ";

type Note = (t: number, m: number, dur: number, vel: number) => void;

/** The bar's tune on an instrument, the downbeat leaning in a little. */
function sing(c: Bar, play: Note, vel: number, oct = 0, legato = 0.96) {
  for (const n of c.mel) c.at(n.at, (t) => play(t, c.tonic + n.semi + oct, c.dur(n.len) * legato, vel * (n.at === 0 ? 1 : 0.9) * (0.94 + c.r() * 0.12)), true);
}

/** Strike the bar's chord (or its two chords) on a sustaining instrument. */
function chordsOn(c: Bar, play: (t: number, notes: number[], dur: number) => void) {
  if (c.fresh) c.at(0, (t) => play(t, c.v, c.dur(c.v2 ? c.steps / 2 : c.steps * c.hold)));
  if (c.v2) c.at(c.steps / 2, (t) => play(t, c.v2!, c.dur(c.steps / 2)));
}

/** The voicing sounding at a step (the bar's second chord takes over from the middle). */
const at = (c: Bar, step: number) => (c.v2 && step >= c.steps / 2 ? c.v2 : c.v);
const bassAt = (c: Bar, step: number) => (c.v2 && step >= c.steps / 2 ? c.bass2 : c.bass);

/** A tom run into the next section. */
function fill(c: Bar, kit: Kit, from: number, vel = 0.5) {
  for (let s = from; s < c.steps; s++) c.at(s, (t) => kit.tom(t, vel * (0.5 + (0.5 * (s - from)) / (c.steps - from)), 150 - (s - from) * 9, 0.22));
}

// ── menu: First Light ───────────────────────────────────────────────────────────────────────
const menu: TrackDef = {
  bpm: 76, steps: 16, beat: 4, tonic: 62, delay: 3, lo: 55, hi: 74, bassLo: 33, gain: 1,
  secs: {
    // the four notes, one bell to a bar: the game's signature before anything else happens
    intro: { ch: 'Dadd9 | . | Gmaj7/D | .', mel: "5:16 | 1':16 | 2':16 | 3':16" },
    a1: { ch: 'D | A/C# | Bm7 | G | D/F# | Gmaj7 | Em7 | Asus4 A', mel: THEME_OPEN },
    a2: { ch: 'D | A/C# | Bm7 | G | D/F# | Gmaj7 | Em7 | Asus4 A', mel: THEME_OPEN },
    b: { ch: 'Gmaj7 | A | Bm7 | F#m7 | Gmaj7 | A | Em7 | Asus4 A', mel: BRIDGE },
    a3: { ch: 'D | A/C# | Bm7 | G | D/F# | Gmaj7 | Em7 A7 | Dadd9', mel: THEME_HOME },
    out: { ch: 'Gmaj7 | D/F# | Em7 | Asus4', mel: "3':8 2':8 | 1':16 | 6:8 1':8 | 2':16" },
  },
  form: (pass, r) => (pass === 0 ? ['intro', 'a1', 'a2', 'b', 'a3', 'out'] : [['a1', 'b', 'a3', 'out'], ['intro', 'a2', 'b', 'a3', 'out'], ['a1', 'a2', 'out'], ['intro', 'a1', 'b', 'a3']][Math.floor(r() * 4)]),
  setup(k: Setup) {
    const pad = makePad(k.ctx, k.strip('pad', { gain: 0.5, rev: 0.5 }), k.r, { cut: 1500, attack: 1.4, release: 2.6 });
    const piano = makePiano(k.ctx, k.strip('piano', { gain: 0.62, rev: 0.4, del: 0.1 }), k.r);
    const bell = makeBell(k.ctx, k.strip('bell', { gain: 0.3, rev: 0.6, del: 0.35 }), { ratio: 4, index: 1.1, decay: 3 });
    const strings = makeLead(k.ctx, k.strip('strings', { gain: 0.3, rev: 0.6 }), k.r, { cut: 2200, attack: 0.22, release: 0.9, detune: 9 });
    const arp = makePluck(k.ctx, k.strip('arp', { gain: 0.2, group: 'rhythm', rev: 0.35, del: 0.45 }), { cut: 2400, decay: 0.3 });
    const bass = makeBass(k.ctx, k.strip('bass', { gain: 0.5 }), { cut: 380, release: 0.3 });
    const kit = makeKit(k.ctx, k.strip('kit', { gain: 0.5, group: 'rhythm', rev: 0.3 }), k.r);
    const ring: Note = (t, m, _d, vel) => bell(t, m, vel);
    return (c) => {
      const { sec, i } = c;
      const full = sec === 'a3' || sec === 'b';
      chordsOn(c, (t, notes, dur) => pad(t, notes, dur, sec === 'intro' ? 0.5 : 0.62, 1 + 0.25 * Math.sin(c.n * 0.21)));
      // bass: long in the quiet sections, twice a bar under the tune
      if (sec === 'intro' || sec === 'out') {
        if (c.fresh) c.at(0, (t) => bass(t, c.bass, c.dur(c.steps * c.hold - 2), 0.6));
      } else {
        c.at(0, (t) => bass(t, c.bass, c.dur(7), 0.75));
        c.at(8, (t) => bass(t, bassAt(c, 8), c.dur(6), 0.6));
      }
      // the tune: bells in the intro and the coda, the piano for the theme, strings joining an octave up
      const bellsLead = c.x[0] > 0.6 && sec === 'a1';
      if (sec === 'intro' || sec === 'out' || bellsLead) sing(c, ring, 0.75, sec === 'out' ? 0 : 12);
      else sing(c, piano, 0.8);
      if (sec === 'b') sing(c, ring, 0.45, 12);
      if ((sec === 'a2' && i >= 4) || sec === 'a3') sing(c, strings, 0.6, 12);
      // the piano's left hand: a broken chord, quarters at first, eighths once the piece is moving
      if (sec !== 'intro' && sec !== 'out' && !bellsLead) {
        const every = sec === 'a1' ? 4 : 2;
        for (let s = 0; s < 16; s += every) {
          const v = at(c, s), k2 = (s / every) % 4;
          const m = k2 === 0 ? bassAt(c, s) + 12 : v[k2 === 2 ? 2 : 1];
          c.at(s, (t) => piano(t, m, c.dur(every * 1.5), (k2 === 0 ? 0.42 : 0.3) * (0.9 + c.r() * 0.2)), true);
        }
      }
      // plucks: eighths rising through the chord, sixteenths for the last statement
      if (sec === 'a2' || full) {
        const every = sec === 'a3' ? 1 : 2;
        const pat = [0, 1, 2, 3, 2, 1, 2, 3];
        if (c.x[1] < 0.8)
          for (let s = 0; s < 16; s += every) {
            const v = at(c, s);
            c.at(s, (t) => arp(t, v[pat[(s / every) % 8] % v.length] + 12, s % 4 === 0 ? 0.55 : 0.36, s % 2 ? 0.35 : -0.35, 1 + 0.3 * Math.sin(c.n * 0.3)));
          }
      }
      // a restrained kit: a heartbeat and a shaker, toms into the last statement
      if (sec === 'a2' || full) {
        c.at(0, (t) => kit.kick(t, 0.6));
        if (full) c.at(8, (t) => kit.kick(t, 0.45));
        for (let s = 2; s < 16; s += sec === 'a2' ? 4 : 2) c.at(s, (t) => kit.shaker(t, s % 4 === 2 ? 0.5 : 0.3));
        if (sec === 'a3') for (const s of [4, 12]) c.at(s, (t) => kit.rim(t, 0.4));
      }
      if (sec === 'b' && i === c.len - 1) {
        fill(c, kit, 8);
        c.at(0, (t) => kit.swell(t, c.dur(16), 0.5));
      }
      if (sec === 'a3' && i === 0) c.at(0, (t) => kit.boom(t, 0.7));
      // the last chord: bells climb it
      if (sec === 'a3' && i === c.len - 1) c.v.forEach((m, j) => c.at(4 + j * 2, (t) => bell(t, m + 12, 0.5, j % 2 ? 0.4 : -0.4)));
    };
  },
};

// ── era 0: Smog & Silicon ───────────────────────────────────────────────────────────────────
const era0: TrackDef = {
  bpm: 72, steps: 16, beat: 4, swing: 0.22, tonic: 60, delay: 3, lo: 52, hi: 69, bassLo: 33, gain: 1,
  secs: {
    in: { ch: 'Am9 | Fmaj7 | Am9 | Fmaj7' },
    a: {
      ch: 'Am9 | Fmaj7 | Cmaj7 | G6 | Am9 | Fmaj7 | Cmaj7 | Gsus4 G',
      mel: "5':2 -:2 3':2 5':2 6':4 -:4 | 3':2 2':2 1':6 -:6 | 5:2 1':2 3':6 2':2 1':4 | 2':8 -:8 | 5':2 -:2 3':2 5':2 6':4 -:4 | 3':2 2':2 1':6 -:6 | 3':2 5':2 1'':6 7':2 5':4 | 2':12 -:4",
    },
    b: {
      ch: 'Fmaj7 | Em7 | Dm9 | G7sus4 | Fmaj7 | Em7 | Dm9 | G7sus4 G7',
      mel: "6':4 5':2 3':2 -:8 | 5':4 3':2 2':2 -:8 | 4':4 3':2 1':2 -:8 | 2':6 3':2 2':8 | 6':4 5':2 3':2 1'':4 -:4 | 7':4 5':2 3':2 -:8 | 4':4 3':2 1':2 6:4 -:4 | 2':6 1':2 7:8",
    },
    // the theme, half-formed: four bars and the first four notes again, then the piano trails off
    t: {
      ch: 'Cmaj7 | G/B | Am7 | Fmaj7 | Cmaj9/E | Fmaj9 | Dm7 | G7sus4',
      mel: "5:6 1':4 2':2 3':4 | 2':12 -:4 | 1':6 3':4 2':2 1':4 | 6:12 -:4 | 5:6 1':4 2':2 3':4 | -:16 | -:8 3':2 2':2 1':2 6:2 | 5:12 -:4",
    },
  },
  form: (pass, r) => (pass === 0 ? ['in', 'a', 'a', 'b', 't', 'a', 'b'] : [['a', 'b', 't', 'a'], ['b', 'a', 't', 'b'], ['a', 'a', 'b', 't'], ['in', 'a', 'b', 'a']][Math.floor(r() * 4)]),
  setup(k: Setup) {
    const keys = makeRhodes(k.ctx, k.strip('keys', { gain: 0.55, rev: 0.3, del: 0.14, lp: 4200 }), k.r, { wow: 7, decay: 1.2 });
    const pad = makePad(k.ctx, k.strip('pad', { gain: 0.32, rev: 0.4 }), k.r, { cut: 900, attack: 0.9, release: 1.8, detune: 12 });
    const reed = makeLead(k.ctx, k.strip('reed', { gain: 0.34, rev: 0.45, del: 0.25, lp: 3200 }), k.r, { wave: 'hollow', cut: 1900, attack: 0.05, release: 0.3, detune: 8 });
    const bell = makeBell(k.ctx, k.strip('bell', { gain: 0.22, rev: 0.5, del: 0.3 }), { ratio: 4, index: 0.8, decay: 1.8 });
    const bass = makeBass(k.ctx, k.strip('bass', { gain: 0.6 }), { cut: 300, grit: 0.35 });
    const kit = makeKit(k.ctx, k.strip('kit', { gain: 0.5, group: 'rhythm', rev: 0.12, lp: 7000 }), k.r);
    const fast = makeKit(k.ctx, k.strip('drive', { gain: 0.3, group: 'drive', rev: 0.1, pan: 0.25, lp: 8000 }), k.r);
    const dust = crackle(k.ctx, k.strip('dust', { gain: 0.1 }), k.r);
    k.onStop(() => dust.stop());
    return (c) => {
      const { sec, i } = c;
      chordsOn(c, (t, notes, dur) => pad(t, notes, dur, 0.5, 1 + 0.2 * Math.sin(c.n * 0.17)));
      // comping: the chord rolled on one, a lighter answer on the "and" of two
      const comp = (step: number, notes: number[], vel: number) => notes.forEach((m, j) => c.at(step, (t) => keys(t + j * 0.014, m, c.dur(5), vel * (0.85 + c.r() * 0.3), (j - 1.5) * 0.12), true));
      comp(0, c.v, 0.5);
      if (c.v2) comp(8, c.v2, 0.45);
      else if (c.r() < 0.75) comp(sec === 'in' ? 8 : 6, c.v.slice(1), 0.32);
      // the tune: the electric piano's right hand for the riffs, a reed for the theme
      const lead: Note = sec === 't' ? reed : c.x[1] > 0.65 ? (t, m, _d, vel) => bell(t, m, vel * 0.9) : (t, m, d, vel) => keys(t, m, d, vel);
      if (c.x[2] < 0.82 || sec === 't') sing(c, lead, sec === 't' ? 0.75 : 0.7);
      c.at(0, (t) => bass(t, c.bass, c.dur(6), 0.8));
      if (sec !== 'in') c.at(10, (t) => bass(t, bassAt(c, 10), c.dur(3), 0.6));
      // boom-bap, late and lazy: the drums sit out the intro and, some passes, the top of a section
      const drums = sec === 'in' ? i >= 2 : !(c.x[0] > 0.72 && i < 4);
      if (drums) {
        for (let s = 0; s < 16; s += 2) c.at(s, (t) => kit.hat(t, s % 4 === 0 ? 0.55 : 0.32));
        if (c.r() < 0.5) c.at(15, (t) => kit.hat(t, 0.2));
        if (sec !== 'in') {
          c.at(0, (t) => kit.kick(t, 0.9, { f0: 100, f1: 44, decay: 0.34 }));
          c.at(10, (t) => kit.kick(t, 0.7, { f0: 100, f1: 44, decay: 0.3 }));
          if (c.r() < 0.45) c.at(7, (t) => kit.kick(t, 0.4, { f0: 100, f1: 44, decay: 0.22 }));
          for (const s of [4, 12]) c.at(s, (t) => kit.rim(t, 0.75));
        }
      }
      if (c.mood.drive > 0) for (let s = 1; s < 16; s += 2) c.at(s, (t) => fast.hat(t, 0.4));
    };
  },
};

// ── era 1: Grid Rush ────────────────────────────────────────────────────────────────────────
const era1: TrackDef = {
  bpm: 112, steps: 16, beat: 4, tonic: 67, delay: 3, lo: 55, hi: 74, bassLo: 31, gain: 1,
  secs: {
    in: { ch: 'Gadd9 | . | Em7 | .' },
    a: {
      ch: 'G | D/F# | Em7 | Cadd9 | G | D/F# | Em7 | Cadd9',
      mel: '3:4 2:4 1:4 5,:4 | 2:6 1:2 7,:8 | 1:4 7,:4 5,:4 3,:4 | 5:8 3:8 | 3:4 2:4 1:4 5,:4 | 2:6 1:2 7,:4 2:4 | 5:8 3:8 | 2:12 -:4',
    },
    b: { ch: 'Cmaj7 | D | Em7 | Bm7 | Cmaj7 | D | Em7 | Dsus4 D', mel: BRIDGE },
    t: { ch: 'G | D/F# | Em7 | C | G/B | Cmaj7 | Am7 | Dsus4 D', mel: THEME_OPEN },
    t2: { ch: 'G | D/F# | Em7 | C | G/B | Cmaj7 | Am7 D7 | Gadd9', mel: THEME_HOME },
    // the breakdown: the floor drops out and the pad breathes
    br: { ch: 'Em7 | Cmaj7 | G/B | Dsus4' },
  },
  form: (pass, r) => (pass === 0 ? ['in', 'a', 't', 'b', 'br', 't2', 'a'] : [['a', 'b', 't', 'br', 't2'], ['a', 't', 'a', 'b', 't2'], ['br', 'a', 'b', 't2', 'a'], ['a', 'a', 'br', 't', 'b']][Math.floor(r() * 4)]),
  setup(k: Setup) {
    const pad = makePad(k.ctx, k.strip('pad', { gain: 0.44, rev: 0.45 }), k.r, { cut: 1900, attack: 0.5, release: 1.2 });
    const arp = makePluck(k.ctx, k.strip('arp', { gain: 0.26, group: 'rhythm', rev: 0.25, del: 0.45 }), { cut: 3000, q: 2.2, decay: 0.2 });
    const lead = makeLead(k.ctx, k.strip('lead', { gain: 0.36, rev: 0.4, del: 0.3 }), k.r, { cut: 2800, attack: 0.02, release: 0.3 });
    const bell = makeBell(k.ctx, k.strip('bell', { gain: 0.26, rev: 0.5, del: 0.35 }), { ratio: 4, index: 1.3, decay: 1.6 });
    const bass = makeBass(k.ctx, k.strip('bass', { gain: 0.52, group: 'rhythm' }), { cut: 520, grit: 0.6, release: 0.06 });
    const sub = makeBass(k.ctx, k.strip('sub', { gain: 0.45 }), { cut: 260, grit: 0.2, release: 0.4 });
    const kit = makeKit(k.ctx, k.strip('kit', { gain: 0.5, group: 'rhythm', rev: 0.16 }), k.r);
    const fast = makeKit(k.ctx, k.strip('drive', { gain: 0.3, group: 'drive', rev: 0.1, pan: -0.25 }), k.r);
    const ring: Note = (t, m, _d, vel) => bell(t, m, vel);
    return (c) => {
      const { sec, i } = c;
      const quiet = sec === 'in' || sec === 'br';
      const beat = c.dur(4);
      // the pad ducks on every beat, as if the kick were pushing it aside
      chordsOn(c, (t, notes, dur) => pad(t, notes, dur, 0.62, 1 + 0.3 * Math.sin(c.n * 0.13), quiet || c.mood.calm ? undefined : { every: beat, depth: 0.55 }));
      // while the rhythm rests (paused, the breakdown), a long sub holds the floor
      if (quiet || c.mood.calm) {
        if (c.fresh && (sec !== 'in' || i >= 2)) c.at(0, (t) => sub(t, c.bass + 12, c.dur(c.steps * c.hold - 2), 0.6));
      }
      if (!quiet) for (let s = 0; s < 16; s += 2) c.at(s, (t) => bass(t, bassAt(c, s) + 12 + (s % 8 === 6 ? 12 : 0), c.dur(1.5), s % 4 === 0 ? 0.8 : 0.55));
      // sixteenth plucks, the filter opening and closing over a couple of dozen bars
      const pat = [0, 1, 2, 3, 1, 2, 3, 2];
      const open = sec === 'in' ? 0.45 + (i / c.len) * 0.6 : 0.8 + 0.4 * Math.sin(c.n * 0.17);
      for (let s = 0; s < 16; s += sec === 'br' ? 2 : 1) {
        const v = at(c, s);
        const notes = [...v, v[0] + 12];
        c.at(s, (t) => arp(t, notes[pat[s % 8] % notes.length] + 12, s % 4 === 0 ? 0.6 : 0.4, s % 2 ? 0.4 : -0.4, open));
      }
      // the hook on bells, the theme on the lead
      if (sec === 'a' && c.x[2] < 0.7) sing(c, ring, 0.6, 12);
      if (sec === 't' || sec === 't2' || sec === 'b') sing(c, lead, 0.72);
      if (sec === 't2') for (const n of c.mel) if (n.len >= 4) c.at(n.at, (t) => bell(t, c.tonic + n.semi + 12, 0.4));
      if (!quiet || (sec === 'in' && i >= 2)) {
        for (const s of quiet ? [0, 8] : [0, 4, 8, 12]) c.at(s, (t) => kit.kick(t, 0.8, { f0: 105, f1: 45, decay: 0.24, click: 0.1 }));
        for (const s of [2, 6, 10, 14]) c.at(s, (t) => kit.hat(t, 0.5));
        if (!quiet) {
          for (const s of [4, 12]) c.at(s, (t) => kit.clap(t, 0.42));
          for (let s = 1; s < 16; s += 2) c.at(s, (t) => kit.hat(t, 0.16 + c.r() * 0.08));
        }
      }
      if (i === c.len - 1 && c.next !== sec) {
        // into the next section: a snare run, and a riser if the theme is coming
        if (!quiet) for (let s = 12; s < 16; s++) c.at(s, (t) => kit.snare(t, 0.3 + (s - 12) * 0.1));
        if (c.next === 't' || c.next === 't2') {
          c.at(0, (t) => kit.riser(t, c.dur(16), 0.5));
          c.at(8, (t) => kit.swell(t, c.dur(8), 0.4));
        }
      }
      if (i === 0 && (sec === 't' || sec === 't2')) c.at(0, (t) => (kit.boom(t, 0.5), bell(t, c.v[c.v.length - 1] + 12, 0.6)));
      if (c.mood.drive > 0) for (let s = 0; s < 16; s++) c.at(s, (t) => fast.shaker(t, s % 2 ? 0.3 : 0.5));
    };
  },
};

// ── era 2: Solarpunk Bloom ──────────────────────────────────────────────────────────────────
const era2: TrackDef = {
  bpm: 66, steps: 12, beat: 3, tonic: 65, delay: 2, lo: 53, hi: 72, bassLo: 34, gain: 1,
  secs: {
    in: { ch: 'Fadd9 | . | Bbmaj7 | .' },
    a: { ch: 'Fmaj9 | Am7 | Bbmaj7 | C6 | Fmaj9 | Am7 | Bbmaj7 | Csus4 C', mel: "3:3 5:3 6:6 | 5:3 3:3 2:6 | 1:3 3:3 5:4 4:2 | 3:6 2:6 | 3:3 5:3 1':6 | 7:3 5:3 3:6 | 4:3 3:3 1:4 2:2 | 2:9 -:3" },
    b: { ch: 'Dm9 | Bbmaj7 | Gm9 | C7sus4 | Dm9 | Bbmaj7 | Gm9 | C7sus4 C', mel: '5:6 4:3 3:3 | 3:6 2:3 1:3 | 2:6 1:3 6,:3 | 5,:9 -:3 | 5:6 4:3 3:3 | 3:6 5:6 | 4:6 3:3 2:3 | 2:9 -:3' },
    t: { ch: 'F | C/E | Dm7 | Bb | F/A | Bbmaj7 | Gm7 | Csus4 C', mel: THEME12 + "2':9 -:3" },
    t2: { ch: 'F | C/E | Dm7 | Bb | F/A | Bbmaj7 | Gm7 C7 | Fadd9', mel: THEME12 + "1':12" },
  },
  form: (pass, r) => (pass === 0 ? ['in', 'a', 'b', 't', 'a', 't2'] : [['a', 'b', 't2'], ['b', 'a', 't', 'a'], ['in', 'a', 't', 'b', 't2'], ['a', 'a', 'b', 't']][Math.floor(r() * 4)]),
  setup(k: Setup) {
    const pad = makePad(k.ctx, k.strip('pad', { gain: 0.4, rev: 0.5 }), k.r, { cut: 1700, attack: 1.1, release: 2.2 });
    const marimba = makeMallet(k.ctx, k.strip('marimba', { gain: 0.5, group: 'rhythm', rev: 0.3, del: 0.12 }), { ratio: 4, tone: 0.2, decay: 0.5 });
    const kalimba = makeMallet(k.ctx, k.strip('kalimba', { gain: 0.6, rev: 0.45, del: 0.3 }), { ratio: 5.4, tone: 0.3, decay: 1.1 });
    const strings = makeLead(k.ctx, k.strip('strings', { gain: 0.26, rev: 0.6 }), k.r, { cut: 2000, attack: 0.3, release: 0.9, detune: 9 });
    const bell = makeBell(k.ctx, k.strip('bell', { gain: 0.2, rev: 0.6, del: 0.4 }), { ratio: 4, index: 0.9, decay: 2 });
    const bass = makeBass(k.ctx, k.strip('bass', { gain: 0.5 }), { cut: 340, grit: 0.4, release: 0.2 });
    const kit = makeKit(k.ctx, k.strip('kit', { gain: 0.42, group: 'rhythm', rev: 0.22, pan: 0.15 }), k.r);
    const fast = makeKit(k.ctx, k.strip('drive', { gain: 0.3, group: 'drive', rev: 0.2, pan: -0.3 }), k.r);
    const tine: Note = (t, m, _d, vel) => kalimba(t, m, vel);
    // two ways through the chord, three eighths to a beat
    const WEAVE = [[0, 2, 3, 1, 2, 3, 0, 2, 3, 1, 3, 2], [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1]];
    return (c) => {
      const { sec, i } = c;
      const theme = sec === 't' || sec === 't2';
      chordsOn(c, (t, notes, dur) => pad(t, notes, dur, 0.58, 1 + 0.25 * Math.sin(c.n * 0.19)));
      const weave = WEAVE[(i % 4 === 3 ? 1 : 0) ^ (c.x[3] > 0.5 ? 1 : 0)];
      for (let s = 0; s < 12; s++) {
        const v = at(c, s), idx = weave[s];
        c.at(s, (t) => marimba(t, v[idx % v.length] + (idx === 3 && s > 5 ? 12 : 0), (s % 3 === 0 ? 0.7 : 0.42) * (0.88 + c.r() * 0.24), (idx - 1.5) * 0.22), true);
      }
      if (c.x[2] < 0.85 || theme) sing(c, tine, 0.78);
      if (theme) sing(c, strings, 0.5, -12);
      if (sec !== 'in' || i >= 2) {
        c.at(0, (t) => bass(t, c.bass, c.dur(5), 0.8));
        c.at(6, (t) => bass(t, bassAt(c, 6), c.dur(3), 0.55));
        c.at(9, (t) => bass(t, bassAt(c, 9) + (bassAt(c, 9) < 41 ? 7 : 0), c.dur(2.5), 0.5));
      }
      // hands and seeds: a shaker on every eighth, the old 12/8 bell pattern on a rim, a low drum under them
      if (sec !== 'in' || i >= 2) for (let s = 0; s < 12; s++) c.at(s, (t) => kit.shaker(t, s % 3 === 0 ? 0.55 : 0.24), true);
      if (sec !== 'in' && !(c.x[0] > 0.75 && i < 4)) {
        for (const s of [0, 2, 4, 5, 7, 9, 11]) c.at(s, (t) => kit.rim(t, 0.3), true);
        c.at(0, (t) => kit.tom(t, 0.6, 92, 0.34));
        c.at(6, (t) => kit.tom(t, 0.36, 92, 0.3));
        for (const s of [4, 10]) c.at(s, (t) => kit.tom(t, 0.3, 205, 0.14), true);
      }
      // light on leaves: a bell on a chord tone now and then
      for (let n = 0; n < 2; n++) if (c.r() < 0.5) {
        const s = Math.floor(c.r() * 12), m = c.v[Math.floor(c.r() * c.v.length)] + 24;
        c.at(s, (t) => bell(t, m, 0.3 + c.r() * 0.2, c.r() * 1.4 - 0.7));
      }
      if (i === c.len - 1 && (c.next === 't' || c.next === 't2')) c.at(0, (t) => kit.swell(t, c.dur(12), 0.35));
      if (c.mood.drive > 0) for (const s of [1, 2, 4, 5, 7, 8, 10, 11]) c.at(s, (t) => fast.tom(t, 0.35, 240, 0.1), true);
    };
  },
};

// ── era 3: Orbital Dawn ─────────────────────────────────────────────────────────────────────
const era3: TrackDef = {
  bpm: 54, steps: 16, beat: 4, tonic: 64, delay: 3, lo: 54, hi: 73, open: true, bassLo: 28, gain: 1,
  secs: {
    // E Lydian: the raised fourth (A#) is the sound of somewhere with no ground under it
    a: { ch: 'Emaj9 | . | F#/E | . | Emaj9 | . | F#/E | .', mel: "5:8 1':8 | 2':16 | 3':8 #4':8 | 6':16 | -:8 5:4 1':4 | 2':8 3':8 | #4':16 | 3':16" },
    b: { ch: 'C#m9 | . | Amaj7#11 | . | E/G# | . | F#sus4 | F#', mel: "3':12 2':4 | 1':16 | 7:8 1':4 3':4 | 5':16 | 3':12 2':4 | 1':8 7:8 | 2':16 | #4':8 3':8" },
    t: { ch: 'E | B/D# | C#m7 | Amaj7 | E/G# | Amaj7 | F#m7 | Bsus4 B', mel: THEME_OPEN },
    t2: { ch: 'E | B/D# | C#m7 | Amaj7 | E/G# | Amaj7 | F#m7 B7 | Eadd9', mel: THEME_HOME },
  },
  form: (pass, r) => (pass === 0 ? ['a', 'b', 't', 'a', 'b', 't2'] : [['a', 'b', 't2'], ['b', 'a', 't'], ['a', 't', 'b', 't2'], ['a', 'a', 'b']][Math.floor(r() * 4)]),
  setup(k: Setup) {
    const pad = makePad(k.ctx, k.strip('pad', { gain: 0.55, rev: 0.6 }), k.r, { cut: 1300, attack: 2.4, release: 4, detune: 11, width: 0.8 });
    const glass = makeBell(k.ctx, k.strip('glass', { gain: 0.36, rev: 0.6, del: 0.5 }), { ratio: 2, index: 0.7, decay: 4 });
    const celesta = makeBell(k.ctx, k.strip('celesta', { gain: 0.36, rev: 0.55, del: 0.35 }), { ratio: 4, index: 1, decay: 3 });
    const shimmer = makePluck(k.ctx, k.strip('shimmer', { gain: 0.14, group: 'rhythm', rev: 0.5, del: 0.6 }), { wave: 'glass', cut: 5200, decay: 0.5 });
    const sub = makeBass(k.ctx, k.strip('sub', { gain: 0.55 }), { cut: 220, grit: 0.25, release: 1.2 });
    const kit = makeKit(k.ctx, k.strip('air', { gain: 0.45, rev: 0.6 }), k.r);
    const ping = makePluck(k.ctx, k.strip('drive', { gain: 0.16, group: 'drive', rev: 0.4, del: 0.5 }), { wave: 'glass', cut: 3000, decay: 0.35 });
    return (c) => {
      const { sec, i } = c;
      const theme = sec === 't' || sec === 't2';
      chordsOn(c, (t, notes, dur) => pad(t, notes, dur, 0.62, 1 + 0.3 * Math.sin(c.n * 0.11)));
      if (c.fresh) c.at(0, (t) => sub(t, c.bass, c.dur(c.v2 ? 7 : c.steps * c.hold - 3), 0.7));
      if (c.v2) c.at(8, (t) => sub(t, c.bass2, c.dur(6), 0.6));
      // the tune: glass for the drifting sections, a celesta (with the glass an octave under) for the theme
      for (const n of c.mel) {
        const m = c.tonic + n.semi, p = c.r() * 0.8 - 0.4;
        if (theme) {
          c.at(n.at, (t) => celesta(t, m, 0.7, p), true);
          if (n.len >= 4) c.at(n.at, (t) => glass(t, m - 12, 0.4, -p));
        } else if (c.x[2] < 0.85) c.at(n.at, (t) => glass(t, m, 0.65, p, 1.3), true);
      }
      // far lights: a few high plucks a bar, never in the same place twice, thrown into the echo
      const stars = 2 + Math.floor(c.r() * 3);
      for (let n = 0; n < stars; n++) {
        const s = Math.floor(c.r() * 8) * 2, m = c.v[Math.floor(c.r() * c.v.length)] + 24;
        c.at(s, (t) => shimmer(t, m, 0.3 + c.r() * 0.3, c.r() * 1.6 - 0.8, 0.8 + c.r() * 0.4));
      }
      // a breath of air into each new section, a far drum when the theme arrives
      if (i === c.len - 1) c.at(0, (t) => kit.swell(t, c.dur(16), 0.3, 2500));
      if (i === 0 && (theme || sec === 'b')) c.at(0, (t) => kit.boom(t, theme ? 0.6 : 0.4));
      if (c.mood.drive > 0) for (let s = 0; s < 16; s += 2) c.at(s, (t) => ping(t, c.tonic + (s % 4 ? 19 : 12), s % 8 === 0 ? 0.6 : 0.35, s % 4 ? 0.5 : -0.5));
    };
  },
};

// ── era 4: Swarmlight ───────────────────────────────────────────────────────────────────────
const era4: TrackDef = {
  bpm: 60, steps: 16, beat: 4, tonic: 59, delay: 3, lo: 54, hi: 73, bassLo: 28, gain: 1,
  secs: {
    a: { ch: 'Bmaj9 | G#m9 | Emaj9 | F#sus4 F# | Bmaj9 | G#m9 | Emaj9 | F#sus4 F#', mel: "5':12 3':4 | 2':16 | 1':12 6:4 | 2':8 3':8 | 5':12 6':4 | 5':8 3':8 | 2':12 1':4 | 2':16" },
    b: { ch: 'Emaj7 | D#m7 | C#m9 | F#7sus4 | Emaj7 | D#m7 | G#m7 | F#sus4 F#', mel: "3':8 5':8 | 3':8 2':8 | 1':8 3':8 | 2':16 | 3':8 5':8 | 6':8 5':8 | 3':8 2':4 1':4 | 2':16" },
    t: { ch: 'Badd9 | F#/A# | G#m7 | Emaj9 | B/D# | Emaj9 | C#m9 | F#sus4 F#', mel: THEME_OPEN },
    t2: { ch: 'Badd9 | F#/A# | G#m7 | Emaj9 | B/D# | Emaj9 | C#m9 F#7 | Badd9', mel: THEME_HOME },
  },
  form: (pass, r) => (pass === 0 ? ['a', 't', 'b', 't2'] : [['a', 'b', 't2'], ['b', 't', 'a', 't2'], ['a', 't', 'b'], ['a', 'a', 't2']][Math.floor(r() * 4)]),
  setup(k: Setup) {
    const choir = makeChoir(k.ctx, k.strip('choir', { gain: 0.5, rev: 0.65 }), k.r, { attack: 1.1, release: 2.6 });
    const soprano = makeChoir(k.ctx, k.strip('soprano', { gain: 0.42, rev: 0.65, del: 0.15 }), k.r, { attack: 0.16, release: 0.7, width: 0.2 });
    const pad = makePad(k.ctx, k.strip('pad', { gain: 0.28, rev: 0.5 }), k.r, { wave: 'glass', cut: 2600, attack: 1.6, release: 3, detune: 12, width: 0.8 });
    const shimmer = makePluck(k.ctx, k.strip('shimmer', { gain: 0.13, group: 'rhythm', rev: 0.5, del: 0.5 }), { wave: 'glass', cut: 6000, decay: 0.26 });
    const bell = makeBell(k.ctx, k.strip('bell', { gain: 0.3, rev: 0.6, del: 0.4 }), { ratio: 3.5, index: 1, decay: 3.2 });
    const sub = makeBass(k.ctx, k.strip('sub', { gain: 0.55 }), { cut: 220, grit: 0.25, release: 1 });
    const kit = makeKit(k.ctx, k.strip('air', { gain: 0.45, rev: 0.6 }), k.r);
    const ping = makePluck(k.ctx, k.strip('drive', { gain: 0.16, group: 'drive', rev: 0.4, del: 0.5 }), { wave: 'glass', cut: 3200, decay: 0.3 });
    return (c) => {
      const { sec, i } = c;
      const theme = sec === 't' || sec === 't2';
      // the choir breathes: closed vowels drifting, opening to "ah" when the theme comes
      chordsOn(c, (t, notes, dur) => choir(t, notes, dur, theme ? 0.7 : 0.58, theme ? 'oh' : sec === 'a' ? 'oo' : 'oh', theme ? 'ah' : sec === 'a' ? 'oh' : 'oo'));
      chordsOn(c, (t, notes, dur) => pad(t, notes.map((m) => m + 12), dur, 0.5, 1 + 0.3 * Math.sin(c.n * 0.15)));
      if (c.fresh) c.at(0, (t) => sub(t, c.bass, c.dur(c.v2 ? 7 : c.steps * c.hold - 3), 0.7));
      if (c.v2) c.at(8, (t) => sub(t, c.bass2, c.dur(6), 0.6));
      // the theme is sung; elsewhere bells carry the line an octave up
      if (theme) {
        for (const n of c.mel) c.at(n.at, (t) => soprano(t, [c.tonic + n.semi + 12], c.dur(n.len) * 0.95, 0.7, 'ah', 'ah'));
        if (sec === 't2') for (const n of c.mel) c.at(n.at, (t) => bell(t, c.tonic + n.semi + 24, 0.36, c.r() - 0.5));
      } else if (c.x[2] < 0.85) for (const n of c.mel) c.at(n.at, (t) => bell(t, c.tonic + n.semi + 12, 0.6, c.r() * 0.8 - 0.4), true);
      // the swarm: sixteenths of light climbing the chord two octaves up, thinning and thickening over the minutes
      const density = 0.55 + 0.3 * Math.sin(c.n * 0.23);
      for (let s = 0; s < 16; s++) {
        if (c.r() > density) continue;
        const v = at(c, s);
        c.at(s, (t) => shimmer(t, v[(s * 3 + c.n) % v.length] + (s % 3 === 0 ? 36 : 24), 0.3 + c.r() * 0.25, s % 2 ? 0.6 : -0.6));
      }
      if (i === c.len - 1 && (c.next === 't' || c.next === 't2')) c.at(0, (t) => kit.swell(t, c.dur(16), 0.4, 3000));
      if (i === 0 && theme) c.at(0, (t) => kit.boom(t, 0.6));
      if (c.mood.drive > 0) for (let s = 0; s < 16; s += 2) c.at(s, (t) => ping(t, c.tonic + (s % 4 ? 31 : 24), s % 8 === 0 ? 0.6 : 0.35, s % 4 ? 0.5 : -0.5));
    };
  },
};

// ── the ending: Type I ──────────────────────────────────────────────────────────────────────
const ending: TrackDef = {
  bpm: 72, steps: 16, beat: 4, tonic: 62, delay: 3, lo: 55, hi: 74, bassLo: 33, gain: 1,
  secs: {
    e1: { ch: 'D | A/C# | Bm7 | G | D/F# | Gmaj7 | Em7 | Asus4 A', mel: THEME_OPEN },
    e2: { ch: 'D | A/C# | Bm7 | G | D/F# | Gmaj7 | Em7 | Asus4 A', mel: THEME_OPEN },
    // the bridge climbs, and its last held note (E) becomes the new key
    eb: { ch: 'Gmaj7 | A | Bm7 | F#m7 | Gmaj7 | A | Em7 | A Bsus4', mel: BRIDGE },
    e3: { tonic: 64, ch: 'E | B/D# | C#m7 | A | E/G# | Amaj7 | F#m7 B7 | Eadd9', mel: THEME_HOME },
    // the coda winds down and turns back toward D, the piano already humming the four notes
    ec: { tonic: 64, ch: 'Amaj7 | E/G# | F#m7 | Bsus4 | Amaj7 | E/G# | Em7 | A7sus4 A7', mel: "3':8 2':8 | 1':8 7:8 | 6:8 1':8 | 2':16 | 3':8 2':8 | 1':8 7:8 | -:16 | 4:6 b7:4 1':2 2':4" },
  },
  form: (pass) => (pass === 0 ? ['e1', 'eb', 'e3', 'ec'] : ['e2', 'eb', 'e3', 'ec']),
  setup(k: Setup) {
    const pad = makePad(k.ctx, k.strip('pad', { gain: 0.42, rev: 0.5 }), k.r, { cut: 1700, attack: 1.2, release: 2.6 });
    const choir = makeChoir(k.ctx, k.strip('choir', { gain: 0.44, rev: 0.65 }), k.r, { attack: 0.9, release: 2.4 });
    const soprano = makeChoir(k.ctx, k.strip('soprano', { gain: 0.36, rev: 0.65, del: 0.12 }), k.r, { attack: 0.14, release: 0.7, width: 0.2 });
    const piano = makePiano(k.ctx, k.strip('piano', { gain: 0.6, rev: 0.4, del: 0.08 }), k.r, { bright: 1.15 });
    const strings = makeLead(k.ctx, k.strip('strings', { gain: 0.3, rev: 0.6 }), k.r, { cut: 2400, attack: 0.2, release: 0.9, detune: 10 });
    const bell = makeBell(k.ctx, k.strip('bell', { gain: 0.28, rev: 0.6, del: 0.3 }), { ratio: 4, index: 1.2, decay: 3 });
    const arp = makePluck(k.ctx, k.strip('arp', { gain: 0.17, group: 'rhythm', rev: 0.35, del: 0.45 }), { cut: 2800, decay: 0.26 });
    const bass = makeBass(k.ctx, k.strip('bass', { gain: 0.5 }), { cut: 400, release: 0.3 });
    const kit = makeKit(k.ctx, k.strip('kit', { gain: 0.55, group: 'rhythm', rev: 0.35 }), k.r);
    const crash = makeKit(k.ctx, k.strip('crash', { gain: 0.5, rev: 0.5 }), k.r);
    const ring: Note = (t, m, _d, vel) => bell(t, m, vel);
    return (c) => {
      const { sec, i } = c;
      const bloom = sec === 'e3';
      const quiet = sec === 'e1' || sec === 'ec';
      chordsOn(c, (t, notes, dur) => pad(t, notes, dur, bloom ? 0.7 : 0.58, bloom ? 1.4 : 1 + 0.2 * Math.sin(c.n * 0.2)));
      chordsOn(c, (t, notes, dur) => choir(t, notes, dur, bloom ? 0.8 : sec === 'eb' ? 0.62 : 0.5, quiet ? 'oo' : 'oh', bloom || sec === 'eb' ? 'ah' : 'oh'));
      // the moment itself, and the bloom: a far drum and a wash of cymbal
      if (i === 0 && (sec === 'e1' || bloom)) c.at(0, (t) => (crash.boom(t, bloom ? 0.8 : 0.7), crash.swell(t, 0.06, bloom ? 0.6 : 0.4)));
      if (bloom && i === 4) c.at(0, (t) => (crash.boom(t, 0.6), crash.swell(t, 0.06, 0.4)));
      // the tune: the piano alone, then strings above it, then everyone
      if (sec === 'ec') sing(c, i >= 6 ? piano : ring, 0.6);
      else sing(c, piano, bloom ? 0.9 : 0.8);
      if (bloom) {
        sing(c, piano, 0.6, 12);
        sing(c, ring, 0.45, 12);
        for (const n of c.mel) c.at(n.at, (t) => soprano(t, [c.tonic + n.semi], c.dur(n.len) * 0.95, 0.75, 'ah', 'ah'));
      }
      if (sec === 'eb') sing(c, ring, 0.45, 12);
      if (sec === 'e2' || sec === 'eb' || bloom) sing(c, strings, bloom ? 0.7 : 0.55, 12);
      // left hand and bass
      const every = quiet ? 4 : 2;
      for (let s = 0; s < 16; s += every) {
        const v = at(c, s), k2 = (s / every) % 4;
        const m = k2 === 0 ? bassAt(c, s) + 12 : v[k2 === 2 ? 2 : 1];
        c.at(s, (t) => piano(t, m, c.dur(every * 1.5), (k2 === 0 ? 0.42 : 0.3) * (0.9 + c.r() * 0.2)), true);
      }
      if (sec !== 'e1' || i >= 4) {
        c.at(0, (t) => bass(t, c.bass, c.dur(quiet ? 14 : 7), 0.75));
        if (!quiet) c.at(8, (t) => bass(t, bassAt(c, 8), c.dur(6), 0.62));
      }
      if (!quiet) {
        const pat = [0, 1, 2, 3, 2, 1, 2, 3];
        const everyA = bloom ? 1 : 2;
        for (let s = 0; s < 16; s += everyA) {
          const v = at(c, s);
          c.at(s, (t) => arp(t, v[pat[(s / everyA) % 8] % v.length] + 12, s % 4 === 0 ? 0.55 : 0.36, s % 2 ? 0.35 : -0.35, bloom ? 1.3 : 1));
        }
        // drums: a heartbeat that grows into toms, never a rock kit
        c.at(0, (t) => kit.kick(t, bloom ? 0.8 : 0.6));
        c.at(8, (t) => kit.kick(t, bloom ? 0.6 : 0.42));
        if (bloom) {
          for (const s of [4, 12]) c.at(s, (t) => kit.tom(t, 0.4, 120, 0.3));
          for (let s = 2; s < 16; s += 2) c.at(s, (t) => kit.shaker(t, s % 4 === 2 ? 0.5 : 0.3));
        }
        if (sec === 'eb' && i >= 6) for (let s = 0; s < 16; s += i === 7 ? 1 : 2) c.at(s, (t) => kit.tom(t, 0.25 + (((i - 6) * 16 + s) / 32) * 0.5, 100 + ((s >> 1) % 3) * 24, 0.26));
      }
      if (sec === 'eb' && i === c.len - 1) c.at(0, (t) => (crash.swell(t, c.dur(16), 0.6), crash.riser(t, c.dur(16), 0.45)));
      // the last chord of the bloom: bells climb it and let it ring
      if (bloom && i === c.len - 1) [...c.v, c.v[0] + 12, c.v[1] + 12].forEach((m, j) => c.at(2 + j * 2, (t) => bell(t, m + 12, 0.55, j % 2 ? 0.45 : -0.45)));
    };
  },
};

export type CinematicId = 'menu' | 'era0' | 'era1' | 'era2' | 'era3' | 'era4' | 'ending';
export const TRACKS: Record<CinematicId, TrackDef> = { menu, era0, era1, era2, era3, era4, ending };
