// The cuts: which shot plays when, and what is written over it. Times are seconds on the music's grid
// (music-map.mjs: 120 BPM, a bar = 2 s), so B(n) = bar n.
//   clips:  [shot, from, to, in]  (+ { x: seconds of dissolve into it, speed })   `in` = seconds into the recorded clip
//   titles: things drawn over the picture (titles.mjs): line / chip / big / logo / flash / fade / dim / clock
//   k:      the Kardashev read-out, top right: [time, value] keys (hidden over interface shots, which show their own)
const B = (n) => n * 2;

const LOGO = { tag: 'FROM A GARAGE TO A STAR', cta: 'WISHLIST ON STEAM', sub: 'A management sim about the AI boom', url: '' };

export const EDITS = {
  // ── the trailer: 1:28 ───────────────────────────────────────────────────────────────────────────────────────────
  // The third cut (2026-11-17). What the second one got wrong: the long holds were on the opening and the logo while
  // the game itself went by in one- and two-second flashes; the time-lapses and a sped-up rocket were the only fast
  // things and they were too fast. Here every clean shot gets at least a bar, every interface shot three seconds
  // (long enough to read a panel and see one click), the rocket goes in real time, and the long takes are the ones
  // that earn them: the first build, the liftoff, the swarm, the pull-back.
  trailer: {
    music: 'trailer', length: 88, view: 'wide',
    clips: [
      ['earth-night', B(0), B(2), 1.0],
      // where it is going, for one bar: the star with its swarm
      ['star', B(2), B(3), 0.8],
      // Act I: the garage in the quiet of the count-in (the band comes in at bar 4), then the first build
      ['garage', B(3), B(5), 0.6],
      ['hud-build', B(5), B(8), 0.25],
      // Act II: the same view four years on (the interface lifts away on the drop), the power, the map, a decision
      ['timelapse', B(8), B(10), 0.2],
      ['lulea-night', B(10), B(11), 1.5],
      ['lakeshore', B(11), B(12), 2.2],
      ['hud-map', B(12), B(13.5), 1.0],
      ['hud-event', B(13.5), B(15), 0],
      ['globe-cables', B(15), B(16), 2.2],
      // Act III: Geneva, the Charter's desk, the megaprojects
      ['geneva', B(16), B(17.5), 1.6, { x: 0.5 }],
      ['hud-charter', B(17.5), B(19), 0.15],
      ['sahara', B(19), B(20), 1.3],
      // Act IV
      ['northsea', B(20), B(21), 2.2],
      ['fusion', B(21), B(22), 1.6],
      ['hud-planet', B(22), B(23.5), 0.5],
      // the rocket in real time: a second on the pad, ignition on bar 24
      ['liftoff', B(23.5), B(26), 0],
      ['moon', B(26), B(28), 1.2, { x: 0.3 }],
      // Act V
      ['yards', B(28), B(29), 1.4],
      ['eros', B(29), B(30), 1.8],
      ['ring', B(30), B(31), 2.6],
      ['habitat', B(31), B(32), 2.4],
      ['hud-system', B(32), B(33.5), 1.0],
      ['swarm', B(33.5), B(36), 1.6],
      // the pull-back: the two fronts of light meet (11.3 s into the clip) on bar 38
      ['type1', B(36), 88, 11.3 - (B(38) - B(36))],
    ],
    titles: [
      { kind: 'fade', t0: 0, t1: 1.4, from: 1, to: 0 },
      { kind: 'line', t0: 0.8, t1: 3.8, kicker: 'TODAY, HUMANITY RUNS ON', head: '19.6 TERAWATTS' },
      { kind: 'flash', t: B(2), a: 0.5 },
      { kind: 'line', t0: 4.08, t1: 5.9, kicker: 'A TYPE I CIVILIZATION COMMANDS', head: '10,000 TERAWATTS', quick: true },
      { kind: 'chip', t0: 6.4, t1: 9.8, text: 'ACT I', name: 'THE GARAGE', year: '2026' },
      { kind: 'line', t0: 6.6, t1: 9.8, kicker: 'IT STARTS WITH', head: 'ONE GARAGE' },
      { kind: 'flash', t: B(8), a: 0.55 },
      { kind: 'chip', t0: 16.3, t1: 19.8, text: 'ACT II', name: 'THE SCALE-UP', year: '2029' },
      { kind: 'line', t0: 16.4, t1: 19.7, head: 'BUILD THE COMPUTE' },
      { kind: 'line', t0: 20.3, t1: 23.7, head: 'FIND THE POWER' },
      { kind: 'line', t0: 30.25, t1: 31.85, head: 'WIRE THE WORLD' },
      { kind: 'chip', t0: 32.4, t1: 34.8, text: 'ACT III', name: 'THE CHARTER', year: '2035' },
      { kind: 'line', t0: 32.5, t1: 34.8, kicker: 'THEN THE WORLD HANDS YOU', head: 'THE PLANET' },
      { kind: 'line', t0: 38.25, t1: 41.7, head: 'BUILD AT PLANET SCALE' },
      { kind: 'flash', t: B(20), a: 0.4 },
      { kind: 'chip', t0: 40.2, t1: 43.8, text: 'ACT IV', name: 'PLANETARY', year: '2045' },
      { kind: 'line', t0: 42.25, t1: 43.85, head: 'IGNITE FUSION' },
      { kind: 'flash', t: B(24), a: 0.4 },
      { kind: 'line', t0: 48.5, t1: 51.7, head: 'LEAVE THE CRADLE' },
      { kind: 'line', t0: 52.6, t1: 55.7, kicker: 'AND THEN', head: 'REACH FOR THE SUN' },
      { kind: 'flash', t: B(28), a: 0.5 },
      { kind: 'chip', t0: 56.2, t1: 59.8, text: 'ACT V', name: 'TYPE I', year: '2068' },
      { kind: 'line', t0: 56.3, t1: 59.7, head: 'MINE THE SKY' },
      { kind: 'line', t0: 60.3, t1: 63.7, head: 'SETTLE THE SYSTEM' },
      { kind: 'line', t0: 67.4, t1: 71.6, head: 'BUILD THE SWARM' },
      { kind: 'flash', t: B(38), a: 0.9 },
      { kind: 'big', t0: B(38) + 0.05, t1: B(40) - 0.15, kicker: 'THE KARDASHEV SCALE', head: 'K 1.0000' },
      { kind: 'dim', t0: B(40) - 0.3, t1: 88, a: 0.5, ramp: 0.8 },
      { kind: 'logo', t0: B(40), t1: 88, ...LOGO },
      { kind: 'fade', t0: 86.4, t1: 88, from: 0, to: 1 },
    ],
    // (for the bar the star is on screen the read-out shows where it stands: 1.0000; then back to today)
    k: { keys: [[0, 0.729], [3.98, 0.729], [4, 1], [5.98, 1], [6, 0.729], [16, 0.7297], [32, 0.7334], [40, 0.7412], [47, 0.76], [52, 0.8002], [56, 0.8002], [67, 0.842], [72, 0.94], [B(38) - 0.05, 0.9998], [B(38), 1]], from: 1.0, to: B(38) - 0.02 },
    blurFrom: B(40) - 0.3,
  },

  // ── the teaser: 0:27 ────────────────────────────────────────────────────────────────────────────────────────────
  // (the same lesson: six shots of a bar each between the garage and the pull-back, where there were twelve)
  teaser: {
    music: 'teaser', length: 27, view: 'wide',
    clips: [
      ['earth-night', B(0), B(1), 2.0],
      ['garage', B(1), B(2), 1.6, { x: 0.4 }],
      ['timelapse', B(2), B(3), 2.2],
      ['lulea-night', B(3), B(4), 1.5],
      ['hud-build', B(4), B(5), 3.6],
      // ignition on bar 5
      ['liftoff', B(5), B(6), 1.0],
      ['habitat', B(6), B(7), 2.4],
      ['swarm', B(7), B(8), 4.4],
      ['type1', B(8), 27, 11.3 - 4],
    ],
    titles: [
      { kind: 'fade', t0: 0, t1: 0.8, from: 1, to: 0 },
      { kind: 'line', t0: 2.25, t1: 3.85, head: 'FROM A GARAGE' },
      { kind: 'flash', t: B(2), a: 0.5 },
      { kind: 'flash', t: B(5), a: 0.4 },
      { kind: 'line', t0: 16.4, t1: 19.7, head: 'TO A STAR' },
      { kind: 'flash', t: B(10), a: 0.9 },
      { kind: 'dim', t0: B(10) + 0.2, t1: 27, a: 0.5, ramp: 0.8 },
      { kind: 'logo', t0: B(10) + 0.25, t1: 27, ...LOGO },
      { kind: 'fade', t0: 25.6, t1: 27, from: 0, to: 1 },
    ],
    k: { keys: [[0, 0.729], [4, 0.729], [8, 0.7412], [12, 0.8002], [15.5, 0.93], [B(10) - 0.05, 0.9998], [B(10), 1]], from: 0.6, to: B(10) + 0.2 },
    blurFrom: B(10) + 0.2,
  },

  // ── three short clips (each cut twice: wide for X, tall for Shorts / Reels / TikTok) ───────────────────────────
  // one campus, one day
  day: {
    music: 'calm', length: 18,
    clips: [['day', 0, 18, 0]],
    titles: [
      { kind: 'fade', t0: 0, t1: 1.0, from: 1, to: 0 },
      { kind: 'line', t0: 0.8, t1: 4.6, kicker: 'ONE CAMPUS', head: 'ONE DAY' },
      { kind: 'clock', t0: 1.2, t1: 14.9, keys: [[0, 4.8], [12, 20.9], [18, 22.6]], place: 'WYOMING HIGH PLAINS' },
      { kind: 'dim', t0: 14.9, t1: 18, a: 0.45, ramp: 0.7 },
      { kind: 'logo', t0: 15.0, t1: 18, ...LOGO, small: true },
      { kind: 'fade', t0: 17.2, t1: 18, from: 0, to: 1 },
    ],
    blurFrom: 14.9,
  },
  // the liftoff lands on bar 4 (8 s)
  liftoff: {
    music: 'rise', length: 15,
    clips: [['liftoff-long', 0, 15, 0]],
    titles: [
      { kind: 'fade', t0: 0, t1: 0.8, from: 1, to: 0 },
      { kind: 'line', t0: 0.7, t1: 4.2, kicker: 'ACT IV · PLANETARY', head: 'LEAVE THE CRADLE' },
      { kind: 'flash', t: 6.5, a: 0.25 },
      { kind: 'dim', t0: 11.2, t1: 15, a: 0.4, ramp: 0.7 },
      { kind: 'logo', t0: 11.4, t1: 15, ...LOGO, small: true },
      { kind: 'fade', t0: 14.2, t1: 15, from: 0, to: 1 },
    ],
    blurFrom: 11.2,
  },
  // the swarm closes round the Sun on bar 4 (8 s)
  type1: {
    music: 'rise', length: 15,
    clips: [['type1', 0, 15, 11.3 - 8]],
    titles: [
      { kind: 'fade', t0: 0, t1: 0.8, from: 1, to: 0 },
      { kind: 'line', t0: 0.9, t1: 4.4, kicker: 'EVERY WATT OF A WORLD', head: 'TYPE I' },
      { kind: 'flash', t: 8, a: 0.85 },
      { kind: 'big', t0: 8.05, t1: 10.9, kicker: 'THE KARDASHEV SCALE', head: 'K 1.0000' },
      { kind: 'dim', t0: 10.9, t1: 15, a: 0.5, ramp: 0.7 },
      { kind: 'logo', t0: 11.1, t1: 15, ...LOGO, small: true },
      { kind: 'fade', t0: 14.2, t1: 15, from: 0, to: 1 },
    ],
    k: { keys: [[0, 0.93], [5, 0.97], [7.95, 0.9998], [8, 1]], from: 0.8, to: 8 },
    blurFrom: 10.9,
  },
};

/** The vertical teaser: the same cut, the interface shot swapped for a clean one (the game has no portrait layout). */
EDITS['teaser-tall'] = { ...EDITS.teaser, view: 'tall', clips: EDITS.teaser.clips.map((c) => (c[0] === 'hud-build' ? ['fusion', c[1], c[2], 1.6] : c)) };
for (const id of ['day', 'liftoff', 'type1']) {
  EDITS[id + '-tall'] = { ...EDITS[id], view: 'tall' };
  EDITS[id] = { ...EDITS[id], view: 'wide' };
}

/** Where each cut lives in the kit folder: edit → [the file, its 1080p copy if it has one] (kit.mjs, resound.mjs). */
export const VIDEOS = {
  trailer: ['Trailer/TheKardashevProject-Trailer-1440p60.mp4', 'Trailer/TheKardashevProject-Trailer-1080p60.mp4'],
  teaser: ['Teaser/TheKardashevProject-Teaser-1440p60.mp4', 'Teaser/TheKardashevProject-Teaser-1080p60.mp4'],
  'teaser-tall': ['Teaser/TheKardashevProject-Teaser-Vertical.mp4'],
  day: ['Shorts/OneDay-Wide.mp4'], 'day-tall': ['Shorts/OneDay-Vertical.mp4'],
  liftoff: ['Shorts/Liftoff-Wide.mp4'], 'liftoff-tall': ['Shorts/Liftoff-Vertical.mp4'],
  type1: ['Shorts/TypeI-Wide.mp4'], 'type1-tall': ['Shorts/TypeI-Vertical.mp4'],
};
