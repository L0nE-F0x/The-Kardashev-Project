// The one clock picture and sound share: 120 BPM, 4/4, so a bar is exactly 2 s and a beat 30 frames at 60 fps.
// Every cut in edit-plan.mjs sits on these bar lines; the score (tools/trailer/score/) is written to the same map.
export const BPM = 120, BEAT = 0.5, BAR = 2;

/**
 * cues: [name, fromBar, toBar, what the picture does, what the music should do]
 * hits: [bar, kind, note]  — moments the picture lands hard on (the score marks them: an impact, a cut-out, a swell's top)
 * tail: seconds of ring-out after the last bar (the logo holds; the music fades to silence by the end)
 */
export const MAP = {
  // The score follows the game's (v0.15.4 "Five Ages"): the music changes genre where the picture changes act,
  // a key higher each time. tools/trailer/score/pieces.ts is written to these bars.
  // ── the trailer: 44 bars = 88 s, + 4 s tail = 92 s ──────────────────────────────────────────────────────────────
  trailer: {
    bars: 43, tail: 2,
    cues: [
      ['intro', 0, 2, 'Earth at night from space, slow. "Today, humanity runs on 19.6 terawatts."',
        'Almost nothing: two of the four theme notes (5 1\') a bar each on a celesta, a glass pad blooming under them. Vast and quiet. C major.'],
      ['star', 2, 4, 'Two seconds of the star with its swarm: where this is going. Then a garage at dawn, in the quiet.',
        'Bar 2 opens out: a soft deep hit, strings, a choir and a harp on the subdominant, the other two notes (2\' 3\') over it. Bar 3 is the count-in: the ring dying away, the drummer\'s pickup, the bass walking up.'],
      ['garage', 4, 8, 'The garage, three people, the first server; then the interface: the first data hall goes up.',
        'Act I, garage funk: the theme whistled over a Rhodes, a fingered bass and a light funk kit. Small and warm. The LinnDrum\'s toms announce what is next.'],
      ['citypop', 8, 16, 'Act II: the campus growing, the power (an aurora, a reactor), the map with its ships, a decision card, cables on the night globe.',
        'Act II, city pop in D: the beat drops in on bar 8. Lyricon lead, FM brass answers, DX piano, slap bass, the LinnDrum; the cowbell joins at bar 12. The last bar (the night globe) breaks down to the DX alone.'],
      ['geneva', 16, 20, 'Act III: Geneva at dusk. "Then the world hands you the planet." The Charter\'s desk, solar to the horizon.',
        'Act III, bossa nova in E: flute over a nylon guitar and an upright bass, alone for two bars; the brushes and the shaker come in on bar 18. A djembe calls the next act in.'],
      ['planet', 20, 26, 'Act IV: wind at sea, fusion, the Planet panel, then a rocket: ignition on bar 24, in real time.',
        'Act IV, interlocking marimbas and hand drums in F, a steel pan on the theme, the choir joining at bar 24 with the liftoff hit and the rocket\'s rumble.'],
      ['moon', 26, 28, 'The Moon, silent. "And then: reach for the Sun."',
        'Sudden hush at bar 26 (the tails, the glass pad, two celesta notes). A harp glissando and the strings swell through bar 27.'],
      ['light', 28, 36, 'Act V: foundries, an asteroid, the ring, a habitat, the System panel, the swarm growing; the K number races up.',
        'Act V, everything, in G: strings in octaves on the theme, celesta and glockenspiel, a choir, brass hits, a harp, the full kit four on the floor. The theme at full bloom, left open on the dominant.'],
      ['swell', 36, 38, 'The pull-back from the Sun: the whole swarm.',
        'The band drops to a roll (toms, then the snare); the four notes climb a beat each and on up to the leading note; a riser that peaks exactly on bar 38.'],
      ['resolve', 38, 43, 'Bar 38: "K 1.0000" lands; from bar 40 the logo, the tagline "From a garage to a star", the wishlist line.',
        'Bar 38: the biggest impact, the whole band on the home chord for two bars, then the four notes a bar each on celesta and choir. Ring out through the tail.'],
    ],
    hits: [
      [0, 'soft', 'a soft sub boom as the picture fades in'],
      [2, 'accent', 'the star: a soft deep hit and a bloom'],
      [8, 'impact', 'the drop: city pop enters'],
      [12, 'accent', 'the cowbell joins'],
      [15, 'cutout', 'the band stops; the DX holds the next key\'s dominant'],
      [18, 'accent', 'the brushes come in'],
      [20, 'impact', 'the marimbas and drums enter'],
      [24, 'impact', 'liftoff: an impact plus the rocket\'s rumble for two bars under the music'],
      [26, 'cutout', 'everything stops but the tails'],
      [28, 'impact', 'the light enters, the biggest so far'],
      [36, 'accent', 'the climb begins'],
      [38, 'impact', 'K 1.0000: the biggest hit of the piece'],
      [40, 'soft', 'the logo arrives: a harp chord and a glockenspiel glint'],
    ],
  },
  // ── the teaser: 12 bars = 24 s, + 3 s tail = 27 s ───────────────────────────────────────────────────────────────
  teaser: {
    bars: 12, tail: 3,
    cues: [
      ['intro', 0, 2, 'Earth at night; then a garage. "From a garage"',
        'The four theme notes, two to a bar, on the celesta over glass; a harp glissando and a riser through bar 1.'],
      ['light', 2, 8, 'The whole game in twelve seconds, a cut every half bar: campus, globe, liftoff (bar 5), Moon, asteroid, habitat, swarm.',
        'Straight into the light (as bars 28–36 of the trailer): the theme\'s first six bars at full bloom.'],
      ['swell', 8, 10, 'The pull-back from the Sun. "to a star"', 'The climb and the riser, peaking on bar 10.'],
      ['resolve', 10, 12, 'The logo.', 'The impact on bar 10, the home chord and the four notes, ringing out through the tail.'],
    ],
    hits: [[0, 'soft', ''], [2, 'impact', 'the drop'], [5, 'accent', 'liftoff'], [8, 'accent', 'the climb begins'], [10, 'impact', 'the logo: biggest hit']],
  },
  // ── two beds for the short vertical clips ───────────────────────────────────────────────────────────────────────
  // calm: a day passing over a campus (a time-lapse, dawn to night). 8 bars = 16 s + 2 s tail.
  calm: {
    bars: 8, tail: 2,
    cues: [['calm', 0, 8, 'One campus, dawn to night in sixteen seconds.',
      'The theme\'s eight bars as a bossa nova, unhurried: flute over a nylon guitar, an upright bass and brushes; the lights come on at bar 6 (a glass chord, the celesta doubling the tune); it closes on the home chord.']],
    hits: [[0, 'soft', ''], [6, 'soft', 'night falls: the lights come on (the celesta and the glass)']],
  },
  // rise: one big moment (a liftoff; the swarm closing round the Sun). 6 bars = 12 s + 3 s tail.
  rise: {
    bars: 6, tail: 3,
    cues: [
      ['build', 0, 4, 'The wait: a rocket on the pad at sunset / the swarm half built.', 'Marimbas gathering under the four notes on a steel pan, a djembe, a bell and a choir joining bar by bar, a riser; a harp glissando into the hit.'],
      ['land', 4, 6, 'Liftoff / the swarm complete; then the logo.', 'The impact on bar 4 with a low rumble, the home chord, the theme\'s first bar as a quote, ring out.'],
    ],
    hits: [[0, 'soft', ''], [4, 'impact', 'the moment']],
  },
};
