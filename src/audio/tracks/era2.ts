/**
 * Act III, the Charter: "Geneva". The whole world at one table, a lake, the sun on it: bossa nova and samba-jazz in
 * G major at 132, felt in two (score v3, SPEC §40).
 *
 * The band: a nylon-string guitar comping the bossa way (the thumb on 1 and 3, root then fifth; the fingers on the
 * classic two-bar pattern, 0 3 6 10 12 | 2 6 8 11 14, which answers the theme's own 3+3+2; a hit on the "and" of 4
 * pushes the next chord, together with the bass), an upright bass (root on 1, fifth on 3, the next chord anticipated
 * on the "and" of 4, a chromatic step into a mid-bar change), brushes (a sweep across each half bar, sixteenth
 * taps, a feathered kick on 1 and 3), a cross-stick on the bossa clave, a shaker; the theme on flute and vibraphone,
 * traded, answered and at last in octaves; soft strings in the bridge, where the band lifts into samba-jazz (a busier
 * guitar, a surdo on 3, tamborim and agogô, the brushes on the ride).
 *
 * The harmony is the theme's, re-harmonised as Jobim would: maj7, m7, 9 and 6/9 chords, ii–V pairs into each
 * arrival, a secondary dominant (E7 into Am) and tritone substitutes (A♭7 into G, the "Ipanema" turnaround; B♭7
 * into Am in the bridge).
 *
 *   intro  the guitar alone, then the bass and the theme's four notes on vibes     8 bars
 *   a      the theme (left open) on flute                                           8
 *   a2     the theme (home) on vibes, the flute answering in its long notes         8
 *   b      the bridge on flute over strings: the samba-jazz lift                    8
 *   solo   the vibes improvise on the hook's 3+3+2                                  8
 *   a3     the theme in octaves, flute over vibes, everyone in                      8
 *   out    guitar and bass, the theme's opening once more, a last 6/9 left to ring  5
 *
 * Later passes trade the tune, swap the comping, take the drums out for a chorus's first half, give the bridge to the
 * vibes and play a second solo (the flute's, or the vibes' other chorus). Paused, the rhythm section rests: the tune,
 * a soft string pad and a held guitar chord on each change carry on. At speed a ganzá in sixteenths and an agogô join.
 */
import { bassAt, hum, last, sing, through, voicingAt, type Note } from '../arrange';
import type { Bar, Setup, TrackDef } from '../cinematic';
import { chords, drop2, voice, type Chord, type MelNote } from '../score';
import { BRIDGE, SIGNAL, THEME_HOME, THEME_OPEN } from '../theme';
import { makeBrushKit, makeFunkKit, makePercussion } from '../voices/drums';
import { makeVibes } from '../voices/mallets';
import { makeStrings } from '../voices/pads';
import { makeNylon, makeUprightBass } from '../voices/plucked';
import { makeFlute, type Wind } from '../voices/winds';

/**
 * The vibes' chorus: eight bars over the A changes, built from the hook (3+3+2, then two quarters) on chord tones,
 * question and answer in two-bar phrases, a secondary dominant's G♯ leaning into A, a climb, and a landing on the
 * fifth for the theme to come back in.
 */
const SOLO =
  "3':3 5':3 7':2 5':4 3':2 2':2 | 6':3 4':3 3':2 5':8 | -:2 2':2 3':2 5':2 6':3 3':3 #1'':2 | 2'':4 1'':2 6':2 4':2 2':2 7':2 2'':2 | " +
  "5':3 5':3 5':2 6':4 1'':4 | 3'':3 2'':3 1'':2 7':4 5':4 | 4':2 6':2 1'':2 2'':2 7':3 6':1 5':2 4':2 | 2'':3 1'':3 5':2 4':4 2':4";

/**
 * The second chorus (later passes): a riff that starts off the beat and climbs a step a bar (D D E D B | E E G E D),
 * the hook's 3+3+2 twice into the secondary dominant, a C lydian arpeggio (the F♯ over Cmaj9), the theme's sixth bar
 * echoed, and a landing on D.
 */
const SOLO2 =
  "-:2 5':2 5':1 6':1 5':2 3':4 2':2 3':2 | -:2 6':2 6':1 1'':1 6':2 5':4 3':4 | 5':3 3':3 2':2 #1'':3 7':3 6':2 | 1'':4 6':2 4':2 7':3 6':3 4':2 | " +
  "3':2 5':2 7':2 2'':2 3'':4 2'':4 | 1'':3 7':3 5':2 6':4 3':4 | 4':3 6':3 1'':2 7':3 6':3 4':2 | 2':3 5':3 6':2 5':8";

/** The coda: the theme's first two bars, the hook once more over the A♭7, home on the ninth. */
const CODA = "5:3 1':3 2':2 3':4 5':4 | 4':3 3':3 2':2 1':8 | 5:3 1':3 2':2 3':8 | 2':16 | -:16";

const A_OPEN = 'Gmaj7 | Cmaj9 | Bm7 E9 | Am9 D9 | Cmaj9 | Em9 | Am9 | D9sus4 D9';
const SECS = {
  intro: { ch: 'Gmaj7 | Cmaj9 | Bm7 E7 | Am7 Ab7 | Gmaj7 | Cmaj9 | Am7 D9 | Em9 D9sus4', mel: '-:16 | -:16 | -:16 | -:16 | ' + SIGNAL },
  a: { ch: A_OPEN, mel: THEME_OPEN },
  a2: { ch: 'G69 | Cmaj9 | Bm7 E7 | Am9 D9 | Cmaj9 | Em9 | Am7 D9 | G69', mel: THEME_HOME },
  b: { ch: 'Cmaj9 | D9 | Bm11 | Em9 Bb7 | Am9 | G6/B | Cmaj9 F9 | D9sus4 D9', mel: BRIDGE },
  solo: { ch: 'Gmaj7 | Cmaj9 | Bm7 E7 | Am9 D9 | Cmaj9 | Em9 | Am7 D9 | D9sus4', mel: SOLO },
  solo2: { ch: 'Gmaj7 | Cmaj9 | Bm7 E7 | Am9 D9 | Cmaj9 | Em9 | Am7 D9 | D9sus4', mel: SOLO2 },
  a3: { ch: 'G69 | Cmaj9 | Bm7 E7 | Am9 D9 | Cmaj9 | Em9 | Am7 Ab7 | G69', mel: THEME_HOME },
  out: { ch: 'Gmaj7 | Cmaj9 | Am7 Ab7 | G69 | .', mel: CODA },
};
type Sec = keyof typeof SECS;

/** Every section's chords, so a bar can see the next bar's (the bass anticipates it). */
const TABLE = Object.fromEntries(Object.entries(SECS).map(([k, s]) => [k, chords(s.ch)])) as Record<Sec, Chord[][]>;
const nextChord = (c: Bar): Chord => (c.i + 1 < c.len ? TABLE[c.sec as Sec][c.i + 1][0] : TABLE[c.next as Sec][0][0]);

/** A pitch (class) in the octave from `lo` up. */
const inOct = (m: number, lo: number) => lo + ((((m - lo) % 12) + 12) % 12);
/** A pitch class nearest `ref`. */
const near = (pc: number, ref: number) => ref + ((((pc - ref) % 12) + 18) % 12) - 6;
/** The fifth over a bass note, or the fourth under it when the fifth climbs past `top`. */
const fifth = (m: number, top: number) => (m + 7 <= top ? m + 7 : m - 5);

type Nylon = ReturnType<typeof makeNylon>;
type Strings = ReturnType<typeof makeStrings>;

/**
 * The fingers' two-bar patterns, in sixteenths ([bar A, bar B]): the classic bossa comping (bar A echoes the theme's
 * 3+3+2; bar B pushes the off-beats), the sparser clave as João Gilberto's fingers often thin it, a lilting variant
 * that anticipates on the "and" of 4, and the samba-jazz pattern, busier, for the lift.
 */
const COMP = {
  bossa: [[0, 3, 6, 10, 12], [2, 6, 8, 11, 14]],
  clave: [[0, 6, 12], [4, 10]],
  lilt: [[0, 3, 6, 10, 14], [2, 6, 10, 12]],
  samba: [[0, 3, 6, 8, 10, 13], [2, 4, 6, 9, 11, 14]],
} satisfies Record<string, [number[], number[]]>;
type Comp = keyof typeof COMP;

/** The guitar: the thumb on 1 and 3 (root, then the fifth or the bar's second root), the fingers on the pattern. */
function guitar(c: Bar, g: Nylon, kind: Comp, vel: number, thumb = true): void {
  if (c.mood.calm) return; // paused: the rhythm section rests (its strip is silent; spare the work)
  if (thumb) {
    const r1 = inOct(bassAt(c, 0), 40);
    const r2 = c.v2 ? inOct(bassAt(c, 8), 40) : fifth(r1, 52);
    c.at(0, (t) => g.note(t, r1, c.dur(7.2), hum(c, vel * 1.05, 0.06)), true);
    c.at(8, (t) => g.note(t, r2, c.dur(7.2), hum(c, vel * 0.9, 0.06)), true);
  }
  const [a, b] = COMP[kind];
  const hits = c.i % 2 ? b : a;
  const after = c.i % 2 ? a : b;
  // the push: a hit on the "and" of 4 already plays the next bar's chord (with the bass's anticipation), and when
  // the harmony moves, the chords before it lift off in time for it
  const push = pushVoicing(c);
  const moves = push.join() !== voicingAt(c, 15).join();
  hits.forEach((s, k) => {
    const nextAt = k + 1 < hits.length ? hits[k + 1] : 16 + after[0];
    let len = Math.max(1.6, Math.min(4.5, nextAt - s - 0.8));
    if (moves && s < 14) len = Math.min(len, Math.max(1.2, 14 - s - 0.3));
    // the beat leans in a little; the off-beat pushes are lighter, as a thumb-and-fingers player's are
    const accent = s === 0 ? 1 : s % 4 === 0 ? 0.92 : s % 2 === 0 ? 0.86 : 0.8;
    const v = s >= 14 ? push : voicingAt(c, s);
    c.at(s, (t) => g.strum(t, v, c.dur(len), hum(c, vel * accent, 0.07), 'down', 0.006 + c.r() * 0.005), true);
  });
}

/** Undo the engine's drop 2 (the lowest note back up an octave): the close voicing it voice-leads from. */
const closed = (v: number[]) => [...v.slice(1), v[0] + 12].sort((x, y) => x - y);
/** The next bar's chord voiced as the engine will voice it (same range, same voice-leading, drop 2). */
const pushVoicing = (c: Bar): number[] => drop2(voice(nextChord(c), closed(c.v2 ?? c.v), track.lo, track.hi, track.size ?? 4));

/**
 * The upright: root on 1, the fifth (or a chromatic step into the bar's second chord) on the "and" of 2, the fifth or
 * the second root on 3, and the next bar's root anticipated on the "and" of 4. `busy` adds the samba's pickup into 3.
 */
function bassLine(c: Bar, b: Note, vel: number, busy = false): void {
  if (c.mood.calm) return;
  const lo = 35, top = 47;
  const r1 = inOct(bassAt(c, 0), lo);
  const r2 = c.v2 ? near(bassAt(c, 8), r1) : fifth(r1, top);
  const into = c.v2 ? r2 + (r2 > r1 ? -1 : 1) : fifth(r1, top);
  const nx = nextChord(c);
  const nextRoot = Math.max(31, Math.min(50, near(nx.bass, r2)));
  const moves = nx.bass !== ((bassAt(c, 8) % 12) + 12) % 12;
  // the step on the "and" of 2 only when it leads somewhere (into a second chord) or the band is busy
  const walk = !!c.v2 || busy;
  c.at(0, (t) => b(t, r1, c.dur(walk ? 5.5 : 7.4), hum(c, vel, 0.06)), true);
  if (walk) c.at(6, (t) => b(t, into, c.dur(1.7), hum(c, vel * 0.55, 0.08)), true);
  if (busy) c.at(7, (t) => b(t, r2, c.dur(0.8), hum(c, vel * 0.4, 0.1)), true);
  c.at(8, (t) => b(t, r2, c.dur(5.5), hum(c, vel * 0.86, 0.06)), true);
  c.at(14, (t) => b(t, moves ? nextRoot : r1, c.dur(1.7), hum(c, vel * 0.6, 0.08)), true);
}

/** The tune on a wind, phrased: a note that follows on a step away, off the beat, is slurred; the rest tongued. */
function blow(c: Bar, w: Wind, vel: number, oct: number): void {
  let prev: MelNote | null = null;
  for (const n of c.mel) {
    const slur = prev !== null && prev.at + prev.len === n.at && Math.abs(n.semi - prev.semi) <= 2 && n.at % 4 !== 0;
    const lean = n.at === 0 ? 1 : n.len >= 4 ? 0.95 : 0.88;
    c.at(n.at, (t) => w(t, c.tonic + n.semi + oct, c.dur(n.len) * (slur ? 0.98 : 0.9), hum(c, vel * lean, 0.05), slur), true);
    prev = n;
  }
}

/**
 * An answer in the gap of a held note: chord tones of the moment, high up, on eighth notes from `from`; falling, or
 * rising when `up`; `count` notes, the last one longer.
 */
function answer(c: Bar, w: Wind, from: number, vel: number, o: { up?: boolean; count?: number; lo?: number; hi?: number } = {}): void {
  const { up = false, count = 3, lo = 74, hi = 86 } = o;
  const pcs = new Set(voicingAt(c, from).map((m) => m % 12));
  const tones: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) tones.push(m);
  const line = up ? tones.slice(0, count) : tones.slice(-count).reverse();
  line.forEach((m, k) => {
    const lastOne = k === line.length - 1;
    c.at(from + 2 * k, (t) => w(t, m, c.dur(lastOne ? 3.2 : 1.9), hum(c, vel * (k === 0 ? 1 : 0.9), 0.05), k > 0), true);
  });
}

export const track: TrackDef = {
  bpm: 132, steps: 16, beat: 4, swing: 0, tonic: 55, delay: 3,
  lo: 55, hi: 69, size: 4, open: true, bassLo: 35, gain: 1.15,
  secs: SECS,
  form: (pass, r) => {
    if (pass === 0) return ['intro', 'a', 'a2', 'b', 'solo', 'a3', 'out'];
    // every pass is a tune of its own: counted in by the guitar, home on the 6/9 (the band's next number)
    const forms: Sec[][] = [
      ['intro', 'a', 'a2', 'b', 'solo2', 'a3', 'out'],
      ['intro', 'a2', 'b', 'solo', 'a3', 'out'],
      ['intro', 'a', 'solo2', 'b', 'a3', 'out'],
      ['intro', 'a2', 'a', 'b', 'solo', 'solo2', 'a3', 'out'],
    ];
    return forms[Math.floor(r() * forms.length)];
  },
  setup(k: Setup) {
    const { ctx, r } = k;
    // the tune
    const flute = makeFlute(ctx, k.strip('flute', { gain: 0.7, rev: 0.3, del: 0.1, pan: 0.06 }), r, { breath: 1.1 });
    const vib = makeVibes(ctx, k.strip('vibes', { gain: 0.38, rev: 0.28, del: 0.06, pan: 0.3 }), r, { motor: 3.4, depth: 0.3, onStop: k.onStop });
    vib.warm(60, 91);
    // the harmony that stays when the game pauses: soft strings, a held guitar chord on each change
    const strings: Strings = makeStrings(ctx, k.strip('strings', { gain: 0.3, rev: 0.45, del: 0.03 }), r, { attack: 0.5, release: 0.9, players: 4, vibrato: 0.8 });
    const still = makeNylon(ctx, k.strip('guitar-held', { gain: 0.42, rev: 0.22, pan: -0.3 }), r, { width: 0.3 });
    // the band
    const gtr = makeNylon(ctx, k.strip('guitar', { gain: 0.6, group: 'rhythm', rev: 0.16, pan: -0.32 }), r, { width: 0.26, warm: [40, 72] });
    const bass = makeUprightBass(ctx, k.strip('bass', { gain: 0.72, group: 'rhythm', rev: 0.06 }), r, { warm: [31, 52] });
    const brush = makeBrushKit(ctx, k.strip('brushes', { gain: 0.66, group: 'rhythm', rev: 0.14 }), r);
    brush.warm();
    const stick = makeFunkKit(ctx, k.strip('cross-stick', { gain: 0.3, group: 'rhythm', rev: 0.12, pan: -0.22 }), r);
    const perc = makePercussion(ctx, k.strip('perc', { gain: 0.4, group: 'rhythm', rev: 0.12 }), r, { tune: -5, surdo: [31, 38] });
    // at speed
    const fast = makePercussion(ctx, k.strip('drive', { gain: 0.32, group: 'drive', rev: 0.1, pan: 0.3 }), r, { tune: -5 });

    const pad = (c: Bar, vel: number, swell = 0.5) => {
      const play = (t: number, v: number[], d: number) => strings(t, v.slice(1), d, vel, swell);
      if (c.fresh) c.at(0, (t) => play(t, c.v, c.dur(c.v2 ? 8 : 16 * c.hold) + 0.05));
      if (c.v2) c.at(8, (t) => play(t, c.v2!, c.dur(8) + 0.05));
    };
    const held = (c: Bar, vel: number) => {
      if (c.fresh) c.at(0, (t) => still.strum(t, [inOct(bassAt(c, 0), 40), ...c.v], c.dur(c.v2 ? 8 : 16 * c.hold), vel, 'down', 0.03), true);
      if (c.v2) c.at(8, (t) => still.strum(t, [inOct(bassAt(c, 8), 40), ...c.v2!], c.dur(8), vel * 0.9, 'down', 0.03), true);
    };

    /**
     * Brushes: a sweep each half bar, the right hand's taps in sixteenths (the beat leaning in, the "e" a whisper), the
     * feathered kick on 1 and 3 (or the bossa's dotted figure, 1, the "and" of 2, 3, the "and" of 4).
     */
    const brushes = (c: Bar, o: { sweep: number; taps: number; kick: number; bossaKick?: boolean }) => {
      if (c.mood.calm) return;
      if (o.sweep) for (const s of [0, 8]) c.at(s, (t) => brush.swish(t, c.dur(7.5), hum(c, o.sweep, 0.1)));
      if (o.taps) {
        const acc = [1, 0.34, 0.6, 0.46];
        for (let s = 0; s < 16; s++) {
          const a = acc[s % 4] * (s % 8 === 0 ? 1 : 0.88);
          c.at(s, (t) => brush.tap(t, hum(c, o.taps * a, 0.12)), true);
        }
      }
      if (o.kick) {
        c.at(0, (t) => brush.kick(t, hum(c, o.kick, 0.06)));
        c.at(8, (t) => brush.kick(t, hum(c, o.kick * 0.9, 0.06)));
        if (o.bossaKick) for (const s of [6, 14]) c.at(s, (t) => brush.kick(t, hum(c, o.kick * 0.55, 0.1)));
      }
    };
    /** The samba-jazz ride: the brush's tip on the cymbal in sixteenths, the beat leaning in. */
    const ride = (c: Bar, vel: number) => {
      if (c.mood.calm) return;
      const acc = [1, 0, 0.55, 0.7];
      for (let s = 0; s < 16; s++) if (acc[s % 4]) c.at(s, (t) => brush.ride(t, hum(c, vel * acc[s % 4], 0.1)), true);
    };
    /** The cross-stick on the bossa clave (1, the "and" of 2, 4 | 2, the "and" of 3). */
    const clave = (c: Bar, vel: number) => {
      if (c.mood.calm) return;
      for (const s of COMP.clave[c.i % 2]) c.at(s, (t) => stick.snare(t, hum(c, vel, 0.08), 'cross'));
    };
    /** The shaker: sixteenths, the "a" of each beat pushed (the ganzá's forward lean), or eighths when it's light. */
    const shaker = (c: Bar, p: typeof perc, vel: number, sixteenths: boolean) => {
      if (c.mood.calm) return;
      const acc = sixteenths ? [0.7, 0.36, 0.5, 0.86] : [0.8, 0, 0.55, 0];
      for (let s = 0; s < 16; s++) if (acc[s % 4]) c.at(s, (t) => p.shaker(t, hum(c, vel * acc[s % 4], 0.1), acc[s % 4] > 0.6 ? 0.09 : 0.05), true);
    };
    /** The lift: a surdo (muted on 1, open on 3), the tamborim with the guitar's samba pattern, the agogô's call. */
    const samba = (c: Bar, vel: number) => {
      if (c.mood.calm) return;
      c.at(0, (t) => perc.surdo(t, hum(c, vel * 0.5, 0.08), 'mute', 'segunda'));
      c.at(8, (t) => perc.surdo(t, hum(c, vel, 0.06), 'open', 'primeira'));
      if (c.i % 2) c.at(15, (t) => perc.surdo(t, hum(c, vel * 0.35, 0.1), 'mute', 'primeira'));
      const hits = COMP.samba[c.i % 2];
      for (const s of hits) c.at(s, (t) => perc.tamborim(t, hum(c, vel * (s % 4 === 0 ? 0.8 : 0.62), 0.1), s % 4 === 2), true);
      // the agogô answers every other bar: low, high-high, low (the samba school's call)
      if (c.i % 2 === 1) for (const [s, w] of [[0, 'low'], [3, 'high'], [6, 'high'], [10, 'low']] as const) c.at(s, (t) => perc.agogo(t, hum(c, vel * 0.5, 0.1), w), true);
    };
    /** At speed: the ganzá in sixteenths and the agogô's two bells. */
    const drive = (c: Bar) => {
      shaker(c, fast, 0.5, true);
      const bells: [number, 'high' | 'low'][][] = [
        [[0, 'high'], [3, 'low'], [6, 'high'], [8, 'high'], [10, 'low'], [12, 'high'], [14, 'low']],
        [[0, 'low'], [2, 'high'], [4, 'high'], [6, 'low'], [8, 'high'], [11, 'low'], [14, 'high']],
      ];
      for (const [s, which] of bells[c.i % 2]) c.at(s, (t) => fast.agogo(t, hum(c, which === 'high' ? 0.42 : 0.36, 0.1), which), true);
    };

    return (c: Bar) => {
      const sec = c.sec as Sec;
      const calm = c.mood.calm;
      // later passes trade the tune, change the comping, thin the drums or give the bridge away (all 0 on the first
      // pass: the composed arrangement)
      const swap = c.x[0] > 0.6;
      const comp: Comp = c.x[1] > 0.55 ? 'lilt' : 'bossa';
      const thin = c.x[2] > 0.6 && c.i < 4;
      const vibesBridge = c.x[3] > 0.55;
      const fluteSolo = c.x[4] > 0.5;
      if (calm) {
        pad(c, 0.34, 0.6);
        held(c, 0.36);
      }
      switch (sec) {
        case 'intro': {
          // the guitar alone for four bars, then the bass, the brushes' sweep and the theme's four notes on vibes
          const band = c.i >= 4;
          guitar(c, gtr, c.i < 2 ? 'clave' : 'bossa', c.i < 4 ? 0.5 + 0.02 * c.i : 0.54);
          if (band) {
            bassLine(c, bass, 0.62);
            brushes(c, { sweep: 0.3, taps: 0, kick: 0.3 });
            // the four notes: on vibes, or (later passes, now and then) the flute's
            if (c.x[5] > 0.5) blow(c, flute, 0.56, 12);
            else sing(c, vib, 0.56, 12, 1.1);
          }
          if (last(c)) c.at(14, (t) => brush.snare(t, 0.32));
          break;
        }
        case 'a': {
          guitar(c, gtr, comp, 0.52);
          bassLine(c, bass, 0.72);
          if (!thin) {
            brushes(c, { sweep: 0.38, taps: 0.3, kick: 0.4 });
            clave(c, 0.42);
          } else brushes(c, { sweep: 0.3, taps: 0, kick: 0 });
          if (swap) {
            sing(c, vib, 0.8, 0, 1.15);
            if (c.i % 2 === 1 && c.i < 7) answer(c, flute, 10, 0.5, { up: c.i === 3 });
          } else {
            blow(c, flute, 0.74, 12);
            // on the open end, the vibes ring in the next player
            if (last(c)) c.at(4, (t) => vib.chord(t, c.v.map((m) => m + 12), c.dur(10), 0.5));
          }
          if (!calm && c.mood.drive > 0.02) drive(c);
          break;
        }
        case 'a2': {
          guitar(c, gtr, comp, 0.54);
          bassLine(c, bass, 0.74);
          if (!thin) {
            brushes(c, { sweep: 0.4, taps: 0.34, kick: 0.42, bossaKick: true });
            clave(c, 0.44);
            shaker(c, perc, 0.32, true);
          } else brushes(c, { sweep: 0.32, taps: 0, kick: 0 });
          if (swap) blow(c, flute, 0.74, 12);
          else {
            sing(c, vib, 0.82, 0, 1.15);
            // the flute answers in the theme's long notes, and leads into the bridge
            if (c.i === 7) answer(c, flute, 6, 0.56, { up: true, count: 4 });
            else if (c.i % 2 === 1) answer(c, flute, 10, 0.52, { up: c.i === 3 });
          }
          if (!calm && c.mood.drive > 0.02) drive(c);
          break;
        }
        case 'b': {
          // the lift: the guitar busier, surdo, tamborim and agogô, the ride; strings under the tune
          guitar(c, gtr, 'samba', 0.56);
          bassLine(c, bass, 0.8, true);
          ride(c, 0.5);
          brushes(c, { sweep: 0, taps: 0, kick: 0.44, bossaKick: true });
          samba(c, 0.74);
          shaker(c, perc, 0.44, true);
          // the lift lands with a slapped brush on the one
          if (c.i === 0) c.at(0, (t) => brush.snare(t, 0.5));
          if (!calm) pad(c, 0.5, 0.5);
          if (vibesBridge) {
            sing(c, vib, 0.86, 12, 1.15);
            // the flute answers in the bridge's long notes
            if (c.i === 3 || c.i === 7) answer(c, flute, 8, 0.52, { up: c.i === 7, count: 3 });
          } else blow(c, flute, 0.86, 12);
          if (last(c)) {
            c.at(12, (t) => brush.snare(t, 0.4));
            c.at(14, (t) => brush.snare(t, 0.52));
          }
          if (!calm && c.mood.drive > 0.02) drive(c);
          break;
        }
        case 'solo':
        case 'solo2': {
          guitar(c, gtr, comp === 'bossa' ? 'lilt' : 'bossa', 0.52);
          bassLine(c, bass, 0.76, c.i >= 4);
          brushes(c, { sweep: 0.34, taps: 0.38, kick: 0.42, bossaKick: true });
          clave(c, 0.4);
          shaker(c, perc, 0.34, c.i >= 4);
          // the solo builds through its chorus; on later passes the flute may take it
          const v = 0.66 + 0.16 * through(c);
          if (fluteSolo && sec === 'solo2') blow(c, flute, v, 0);
          else sing(c, vib, v, 0, 1.1);
          if (last(c)) c.at(14, (t) => brush.snare(t, 0.46));
          if (!calm && c.mood.drive > 0.02) drive(c);
          break;
        }
        case 'a3': {
          guitar(c, gtr, 'bossa', 0.56);
          bassLine(c, bass, 0.78);
          brushes(c, { sweep: 0.42, taps: 0.38, kick: 0.46, bossaKick: true });
          clave(c, 0.46);
          shaker(c, perc, 0.36, true);
          if (!calm) pad(c, 0.36, 0.4);
          // the theme in octaves: the flute on top, the vibes under it
          blow(c, flute, 0.8, 12);
          sing(c, vib, 0.74, 0, 1.15);
          if (!calm && c.mood.drive > 0.02) drive(c);
          break;
        }
        case 'out': {
          if (c.i < 3) {
            guitar(c, gtr, 'bossa', 0.5 - 0.04 * c.i);
            bassLine(c, bass, 0.68 - 0.05 * c.i);
            brushes(c, { sweep: 0.3 - 0.05 * c.i, taps: 0, kick: 0.3 });
            // the theme's opening on vibes, then the flute's hook over the A♭7
            if (c.i < 2) sing(c, vib, 0.62, 12, 1.15);
            else blow(c, flute, 0.66, 12);
          } else if (c.i === 3) {
            // the last chord: a slow strum of the 6/9 over the low G, the vibes ringing with it, the flute on the ninth
            c.at(0, (t) => gtr.note(t, 43, c.dur(30), 0.55));
            c.at(0, (t) => gtr.strum(t + 0.03, [52, 57, 62, 67], c.dur(30), 0.52, 'down', 0.035));
            c.at(0, (t) => bass(t, 31, c.dur(24), 0.66));
            c.at(0, (t) => vib.chord(t + 0.08, [71, 74, 76], c.dur(28), 0.42));
            c.at(0, (t) => brush.swish(t, c.dur(8), 0.22));
            blow(c, flute, 0.6, 12);
          }
          break;
        }
      }
    };
  },
};
