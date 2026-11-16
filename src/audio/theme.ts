/**
 * The game's theme and the shared language of its score (v0.15.5): the melodies every piece and the stings share,
 * written in scale degrees (score.ts `melody`), and `roman()`, which writes a progression in any major key.
 *
 * The theme: so–do–re–mi rising on a 3+3+2 beat (the tresillo: notes on steps 0, 3 and 6 of the bar), up to the
 * high so, and down again home; again, higher; a climb to the top at bar six; home. Eight bars, then an eight-bar
 * bridge. Its chords: I | IVmaj7 | vi7 | V | IVmaj7 | vi9 | ii7 V | I.
 *
 * Every era plays the same tune in its own clothes (SPEC §40): garage funk, city pop, bossa nova, interlocking
 * mallets and hand drums, light. The stings in sfx.ts quote its first four notes.
 */

/** Bars 1–7 of the theme (16 steps a bar). */
export const THEME = "5:3 1':3 2':2 3':4 5':4 | 4':3 3':3 2':2 1':8 | 5:3 1':3 2':2 3':4 6':4 | 5':3 4':3 3':2 2':8 | 3':3 4':3 5':2 6':4 5':4 | 1'':3 7':3 6':2 5':8 | 4':3 3':3 2':2 3':4 5':4 | ";
/** The theme, coming home (bar 8 on the tonic). */
export const THEME_HOME = THEME + "1':16";
/** The theme left open (bar 8 on the second degree, over V): more to come. */
export const THEME_OPEN = THEME + "2':12 -:4";
/** The theme's chords in roman numerals (with `THEME_HOME`; for `THEME_OPEN` end on `V`). */
export const THEME_CHORDS = 'I | IVmaj7 | vi7 | V | IVmaj7 | vi9 | ii7 V | I';
export const THEME_CHORDS_OPEN = 'I | IVmaj7 | vi7 | V | IVmaj7 | vi9 | ii7 | V';

/** The bridge: longer notes, a turn through iii and vi, back to V. */
export const BRIDGE = "6:4 1':4 3':6 2':2 | 2':4 7:4 5:8 | 5:4 7:4 2':6 1':2 | 6:12 -:4 | 4:4 6:4 1':6 7:2 | 6:4 5:4 3':8 | 4':4 3':4 2':4 1':4 | 2':4 5:4 7:8";
export const BRIDGE_CHORDS = 'IVmaj7 | V | iii7 | vi7 | ii7 | I/3 | IVmaj7 | V';

/** The four notes alone, one to a bar (an intro, a coda). */
export const SIGNAL = "5:16 | 1':16 | 2':16 | 3':16";
/** The theme's first bar as a hook (the 3+3+2 rise), for riffs and answers. */
export const HOOK = "5:3 1':3 2':2 3':4 5':4";

// ── roman numerals ──────────────────────────────────────────────────────────────────────────
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pcOf(name: string): number {
  return (NOTE[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;
}

/**
 * A progression in roman numerals, written out in a major key: `roman('I | IVmaj7 | vi7 | V7sus4 V', 'F')` →
 * `'F | Bbmaj7 | Dm7 | C7sus4 C'`. Upper case = the chord as written (I, IV7, V9, bVIImaj7, II7); lower case = minor
 * (vi → m, vi7 → m7, ii9 → m9, iii11 → m11, iv6 → m6); a leading b or # moves the root; `/3` puts a scale degree in
 * the bass (I/3 = first inversion), `/b7` too. Bar lines and `.` pass through.
 */
export function roman(line: string, key: string): string {
  const tonic = pcOf(key);
  const names = /b|F$/.test(key) && key !== 'B' ? FLAT : SHARP;
  const degree = (acc: string, n: number) => (tonic + MAJOR_STEPS[n] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0) + 24) % 12;
  return line
    .split(/(\s+|\|)/)
    .map((tok) => {
      const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^/]*)(?:\/([b#]?)([1-7]))?$/.exec(tok);
      if (!m) return tok;
      const [, acc, num, rest, bacc, bdeg] = m;
      const n = NUMERALS.indexOf(num.toUpperCase());
      const root = names[degree(acc, n)];
      const minor = num === num.toLowerCase();
      let quality = rest;
      if (minor && !/^(m|dim|ø)/.test(rest)) quality = 'm' + (rest === '' ? '' : rest);
      const bass = bdeg ? '/' + names[degree(bacc, Number(bdeg) - 1)] : '';
      return root + quality + bass;
    })
    .join('');
}
