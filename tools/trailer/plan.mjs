// The cuts: which shot plays when, and what is written over it. Times are seconds on the music's grid
// (music-map.mjs: 120 BPM, a bar = 2 s), so B(n) = bar n.
//   clips:  [shot, from, to, in]  (+ { x: seconds of dissolve into it, speed })   `in` = seconds into the recorded clip
//   titles: things drawn over the picture (titles.mjs): line / chip / big / logo / flash / fade / dim / clock
//   k:      the Kardashev read-out, top right: [time, value] keys (hidden over interface shots, which show their own)
const B = (n) => n * 2;

const LOGO = { tag: 'FROM A GARAGE TO A STAR', cta: 'COMING TO STEAM', sub: 'Free while it’s in development · Windows · macOS · Linux', url: 'thekardashevproject.netlify.app' };

export const EDITS = {
  // ── the trailer: 1:32 ───────────────────────────────────────────────────────────────────────────────────────────
  trailer: {
    music: 'trailer', length: 92, view: 'wide',
    clips: [
      ['earth-night', B(0), B(4), 1.2],
      ['garage', B(4), B(6), 0.9, { x: 1.0 }],
      ['hud-build', B(6), B(8), 0.3, { x: 0.4 }],
      // Act II
      ['timelapse', B(8), B(10), 0.9],
      ['lulea-night', B(10), B(11), 1.5],
      ['lakeshore', B(11), B(11.5), 2.2],
      ['wind', B(11.5), B(12), 0.6],
      ['hud-map', B(12), B(13), 1.6],
      ['fab', B(13), B(13.5), 2.0],
      ['mine', B(13.5), B(14), 1.4],
      ['hud-event', B(14), B(15), 1.7],
      ['globe-cables', B(15), B(16), 2.2],
      // Act III
      ['geneva', B(16), B(18), 1.6, { x: 0.5 }],
      ['sahara', B(18), B(18.5), 1.3],
      ['northsea', B(18.5), B(19), 2.2],
      // the Charter's own interface (every act's look is in the cut: I hud-build, II hud-map + hud-event, III here, IV hud-planet, V hud-system)
      ['hud-charter', B(19), B(20), 0.3],
      // Act IV
      ['fusion', B(20), B(21), 1.6],
      ['supergrid', B(21), B(22), 2.6],
      ['liftoff', B(22), B(24), 2.45, { speed: 1.5 }],
      ['orbit', B(24), B(25), 2.6],
      ['hud-planet', B(25), B(26), 1.0],
      ['moon', B(26), B(28), 1.2, { x: 0.3 }],
      // Act V
      ['yards', B(28), B(29), 1.4],
      ['eros', B(29), B(30), 1.8],
      ['ring', B(30), B(31), 2.6],
      ['habitat', B(31), B(32), 2.4],
      ['hud-system', B(32), B(33), 1.4],
      ['swarm', B(33), B(35.5), 0.9, { speed: 1.2 }],
      // the pull-back: the two fronts of light meet (11.3 s into the clip) on bar 38
      ['type1', B(35.5), 92, 11.3 - (B(38) - B(35.5))],
    ],
    titles: [
      { kind: 'fade', t0: 0, t1: 1.6, from: 1, to: 0 },
      { kind: 'line', t0: 0.9, t1: 3.7, kicker: 'HUMANITY RUNS ON', head: '19.6 TERAWATTS' },
      { kind: 'line', t0: 4.3, t1: 7.7, kicker: 'A TYPE I CIVILIZATION COMMANDS', head: '10,000 TERAWATTS' },
      { kind: 'chip', t0: 8.4, t1: 11.7, text: 'ACT I', name: 'THE GARAGE', year: '2026' },
      { kind: 'line', t0: 8.7, t1: 11.7, kicker: 'IT STARTS WITH', head: 'ONE GARAGE' },
      { kind: 'flash', t: B(8), a: 0.55 },
      { kind: 'chip', t0: 16.3, t1: 19.8, text: 'ACT II', name: 'THE SCALE-UP', year: '2029' },
      { kind: 'line', t0: 16.35, t1: 19.7, head: 'BUILD THE COMPUTE' },
      { kind: 'line', t0: 20.3, t1: 23.7, head: 'FIND THE POWER' },
      { kind: 'line', t0: 26.25, t1: 27.8, head: 'SHIP THE CHIPS' },
      { kind: 'line', t0: 30.25, t1: 31.8, head: 'WIRE THE WORLD' },
      { kind: 'chip', t0: 32.4, t1: 35.8, text: 'ACT III', name: 'THE CHARTER', year: '2035' },
      { kind: 'line', t0: 32.6, t1: 35.7, kicker: 'THEN THE WORLD HANDS YOU', head: 'THE PLANET' },
      { kind: 'flash', t: B(18), a: 0.5 },
      { kind: 'line', t0: 36.25, t1: 37.85, head: 'BUILD AT PLANET SCALE' },
      { kind: 'chip', t0: 40.2, t1: 43.8, text: 'ACT IV', name: 'PLANETARY', year: '2045' },
      { kind: 'line', t0: 40.25, t1: 41.8, head: 'IGNITE FUSION' },
      { kind: 'flash', t: B(22), a: 0.45 },
      { kind: 'line', t0: 45.6, t1: 47.8, head: 'LEAVE THE CRADLE' },
      { kind: 'line', t0: 52.6, t1: 55.7, kicker: 'AND THEN', head: 'REACH FOR THE SUN' },
      { kind: 'flash', t: B(28), a: 0.5 },
      { kind: 'chip', t0: 56.2, t1: 59.8, text: 'ACT V', name: 'TYPE I', year: '2068' },
      { kind: 'line', t0: 56.3, t1: 59.7, head: 'MINE THE SKY' },
      { kind: 'line', t0: 60.3, t1: 63.7, head: 'SETTLE THE SYSTEM' },
      { kind: 'line', t0: 66.3, t1: 70.4, head: 'BUILD THE SWARM' },
      { kind: 'flash', t: B(38), a: 0.9 },
      { kind: 'big', t0: B(38) + 0.05, t1: B(40) - 0.15, kicker: 'THE KARDASHEV SCALE', head: 'K 1.0000' },
      { kind: 'dim', t0: B(40) - 0.3, t1: 92, a: 0.5, ramp: 0.8 },
      { kind: 'logo', t0: B(40), t1: 92, ...LOGO },
      { kind: 'fade', t0: 90, t1: 92, from: 0, to: 1 },
    ],
    k: { keys: [[0, 0.729], [8, 0.729], [16, 0.7296], [32, 0.7334], [36, 0.7412], [44, 0.7603], [52, 0.8002], [56, 0.8002], [66, 0.842], [71, 0.94], [B(38) - 0.05, 0.9998], [B(38), 1]], from: 1.2, to: B(38) - 0.02 },
    blurFrom: B(40) - 0.3,
  },

  // ── the teaser: 0:27 ────────────────────────────────────────────────────────────────────────────────────────────
  teaser: {
    music: 'teaser', length: 27, view: 'wide',
    clips: [
      ['earth-night', B(0), B(1), 7.4],
      ['garage', B(1), B(2), 2.2, { x: 0.5 }],
      ['timelapse', B(2), B(2.5), 3.4],
      ['lulea-night', B(2.5), B(3), 2.0],
      ['hud-map', B(3), B(3.5), 2.0],
      ['fusion', B(3.5), B(4), 2.0],
      ['northsea', B(4), B(4.5), 2.2],
      ['supergrid', B(4.5), B(5), 3.0],
      ['liftoff', B(5), B(6), 2.45, { speed: 1.6 }],
      ['moon', B(6), B(6.5), 2.6],
      ['yards', B(6.5), B(7), 2.0],
      ['habitat', B(7), B(7.5), 3.0],
      ['swarm', B(7.5), B(8), 4.6, { speed: 1.4 }],
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

/** The vertical teaser: the same cut, the two interface shots swapped for clean ones (the game has no portrait layout). */
EDITS['teaser-tall'] = { ...EDITS.teaser, view: 'tall', clips: EDITS.teaser.clips.map((c) => (c[0] === 'hud-map' ? ['wind', c[1], c[2], 1.2] : c)) };
for (const id of ['day', 'liftoff', 'type1']) {
  EDITS[id + '-tall'] = { ...EDITS[id], view: 'tall' };
  EDITS[id] = { ...EDITS[id], view: 'wide' };
}
