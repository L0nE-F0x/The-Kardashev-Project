// The one clock picture and sound share: 120 BPM, 4/4, so a bar is exactly 2 s and a beat 30 frames at 60 fps.
// Every cut in edit-plan.mjs sits on these bar lines; the score (tools/trailer/score/) is written to the same map.
export const BPM = 120, BEAT = 0.5, BAR = 2;

/**
 * cues: [name, fromBar, toBar, what the picture does, what the music should do]
 * hits: [bar, kind, note]  — moments the picture lands hard on (the score marks them: an impact, a cut-out, a swell's top)
 * tail: seconds of ring-out after the last bar (the logo holds; the music fades to silence by the end)
 */
export const MAP = {
  // ── the trailer: 44 bars = 88 s, + 4 s tail = 92 s ──────────────────────────────────────────────────────────────
  trailer: {
    bars: 44, tail: 4,
    cues: [
      ['intro', 0, 4, 'Earth at night from space, slow. "Humanity runs on 19.6 terawatts."',
        'Almost nothing: a low drone, air, and the four-note theme (5 1\' 2\' 3\') one note to a bar on a bell or felt piano. Vast and quiet.'],
      ['garage', 4, 8, 'A garage at dawn, three people, the first server. "It starts in a garage."',
        'Warm and small: the piano states the theme\'s first phrase; a soft pulse (eighth notes) starts under it and grows. Hopeful.'],
      ['groove1', 8, 16, 'Act II montage, a cut every bar then every half bar: data halls, power plants, cables on the globe, the HUD.',
        'The beat drops in on bar 8: drums, bass, sixteenth plucks, the theme in the lead. Driving, optimistic, building through the 8 bars (add a layer at bar 12).'],
      ['break1', 16, 18, 'Geneva at dusk. "Then the world hands you the planet."',
        'Drums out. A held chord and a riser across both bars into bar 18.'],
      ['groove2', 18, 26, 'Acts III–IV: solar to the horizon, fusion, the supergrid, a rocket lifts off at bar 22, orbit.',
        'Bigger than groove1: fuller drums, low brass/pad weight, the bridge of the theme. A lift at bar 22 (liftoff).'],
      ['break2', 26, 28, 'The Moon, silent. "And then: reach for the Sun."',
        'Sudden hush at bar 26 (reverb tails, a high glassy pad, one bell). A riser through bar 27.'],
      ['groove3', 28, 36, 'Act V: asteroids, a habitat, the Dyson swarm growing; the K number races up.',
        'Everything, a whole tone up if it suits (the game\'s ending lifts D→E): choir, bells, full drums. The theme at full bloom. Keeps climbing.'],
      ['swell', 36, 38, 'The pull-back from the Sun: the whole swarm.',
        'Rhythm drops to a roll/pulse, a big swell and riser that peaks exactly on bar 38.'],
      ['resolve', 38, 44, 'Bar 38: "K 1.0000" lands; from bar 40 the logo, the tagline "From a garage to a star", where to get it.',
        'Bar 38: the biggest impact, then the home chord ringing, the theme coming home (broad, slow, bells and choir) over bars 38–42, thinning to the last four-note quote at 42–44. Ring out through the tail.'],
    ],
    hits: [
      [0, 'soft', 'a soft sub boom as the picture fades in'],
      [8, 'impact', 'the drop: beat enters'],
      [12, 'accent', 'a layer joins'],
      [16, 'cutout', 'drums stop; riser starts'],
      [18, 'impact', 'groove2 enters'],
      [22, 'impact', 'liftoff: an impact plus a low rocket rumble that lasts ~2 bars (22–24) under the music'],
      [26, 'cutout', 'everything stops but the tails'],
      [28, 'impact', 'groove3 enters, the biggest so far'],
      [36, 'accent', 'swell begins'],
      [38, 'impact', 'K 1.0000: the biggest hit of the piece'],
      [40, 'soft', 'the logo arrives: a warm bell/shimmer accent'],
    ],
  },
  // ── the teaser: 12 bars = 24 s, + 3 s tail = 27 s ───────────────────────────────────────────────────────────────
  teaser: {
    bars: 12, tail: 3,
    cues: [
      ['intro', 0, 2, 'Earth at night; then a garage. "From a garage"',
        'The four theme notes, two to a bar, bell over a drone; a riser begins late in bar 1.'],
      ['groove', 2, 8, 'The whole game in twelve seconds, a cut every half bar: campus, globe, liftoff (bar 5), Moon, asteroid, habitat, swarm.',
        'Straight into the full groove (as groove3 of the trailer), climbing all the way; it must feel like acceleration.'],
      ['swell', 8, 10, 'The pull-back from the Sun. "to a star"', 'Swell and riser, peaking on bar 10.'],
      ['resolve', 10, 12, 'The logo.', 'The impact on bar 10, the home chord and the four-note quote, ringing out through the tail.'],
    ],
    hits: [[0, 'soft', ''], [2, 'impact', 'the drop'], [5, 'accent', 'liftoff'], [8, 'accent', 'swell begins'], [10, 'impact', 'the logo: biggest hit']],
  },
  // ── two beds for the short vertical clips ───────────────────────────────────────────────────────────────────────
  // calm: a day passing over a campus (a time-lapse, dawn to night). 8 bars = 16 s + 2 s tail.
  calm: {
    bars: 8, tail: 2,
    cues: [['calm', 0, 8, 'One campus, dawn to night in sixteen seconds.',
      'The theme\'s first eight bars, unhurried: felt piano and bell over a pad, a light pulse; ends resolved (it may loop on social, so the last bar should lead back to the first).']],
    hits: [[0, 'soft', ''], [6, 'soft', 'night falls: the lights come on (a gentle shimmer)']],
  },
  // rise: one big moment (a liftoff; the swarm closing round the Sun). 6 bars = 12 s + 3 s tail.
  rise: {
    bars: 6, tail: 3,
    cues: [
      ['build', 0, 4, 'The wait: a rocket on the pad at sunset / the swarm half built.', 'A pulse and a riser that tighten over four bars; the theme\'s four notes climbing.'],
      ['land', 4, 6, 'Liftoff / the swarm complete; then the logo.', 'The impact on bar 4 with a low rumble, the home chord, the four-note quote, ring out.'],
    ],
    hits: [[0, 'soft', ''], [4, 'impact', 'the moment']],
  },
};
