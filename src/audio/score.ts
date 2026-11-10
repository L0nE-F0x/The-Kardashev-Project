/**
 * The score's notation: chord symbols voiced with real voice-leading, melodies written in scale degrees (so the main
 * theme can be played in any key), and step patterns. Pure functions, no audio.
 */

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];

export interface Chord {
  /** Root and bass as pitch classes (0 = C). */
  root: number;
  bass: number;
  /** Chord tones as semitones above the root, most essential first (third, seventh, colour, fifth, root). */
  tones: number[];
}

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '69': [0, 4, 7, 9, 14],
  maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], 'maj7#11': [0, 4, 7, 11, 18],
  m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17],
  '7': [0, 4, 7, 10], '9': [0, 4, 7, 10, 14], '7sus4': [0, 5, 7, 10], '9sus4': [0, 5, 7, 10, 14],
};

function pc(name: string): number {
  return (NOTE[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;
}

export function chord(sym: string, transpose = 0): Chord {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !QUALITY[m[2]]) throw new Error(`chord? ${sym}`);
  const root = (pc(m[1]) + transpose + 120) % 12;
  const iv = QUALITY[m[2]];
  // what a chord can least do without comes first: its third (or suspension), its seventh or sixth, its colour;
  // the root goes last (the bass has it), so a ninth chord is voiced rootless instead of as a cluster round its root
  const rank = (i: number) => (i === 0 ? 4 : i === 7 ? 3 : i <= 5 ? 0 : i <= 11 ? 1 : 2);
  return { root, bass: m[3] ? (pc(m[3]) + transpose + 120) % 12 : root, tones: [...iv].sort((a, b) => rank(a) - rank(b)) };
}

/** A section's chords: bars split by `|`, one or two chords a bar, `.` repeats the bar before. */
export function chords(line: string, transpose = 0): Chord[][] {
  const out: Chord[][] = [];
  for (const bar of line.split('|').map((b) => b.trim())) out.push(bar === '.' ? out[out.length - 1] : bar.split(/\s+/).map((c) => chord(c, transpose)));
  return out;
}

/**
 * Voice a chord as `size` notes between `lo` and `hi`, moving as little as possible from the voicing before
 * (common tones stay, the rest step): what a pianist's hands do. Close position; a five-note chord drops its root.
 */
export function voice(c: Chord, prev: number[] | null, lo: number, hi: number, size = 4): number[] {
  const pcs = c.tones.slice(0, size).map((i) => (c.root + i) % 12);
  let best: number[] = [], bestCost = Infinity;
  for (let start = lo; start < lo + 12; start++) {
    if (!pcs.includes(start % 12)) continue;
    const v = [start];
    const rest = pcs.filter((p) => p !== start % 12).map((p) => start + ((p - start) % 12 + 12) % 12).sort((a, b) => a - b);
    v.push(...rest);
    // a triad asked for four voices doubles its lowest note on top
    while (v.length < size) v.push(v[v.length - pcs.length] + 12);
    const top = v[v.length - 1];
    let cost = 0;
    if (prev && prev.length === v.length) {
      for (let i = 0; i < v.length; i++) cost += Math.abs(v[i] - prev[i]);
      cost += 2 * Math.abs(top - prev[prev.length - 1]);
    } else cost = Math.abs((v[0] + top) / 2 - (lo + hi) / 2) * 2;
    if (top > hi) cost += 12 * (top - hi);
    // a semitone at the very top grates; a muddy second at the bottom of a low voicing too
    if (top - v[v.length - 2] === 1) cost += 7;
    if (v[1] - v[0] < 3 && v[0] < 55) cost += 6;
    if (cost < bestCost) { bestCost = cost; best = v; }
  }
  return best;
}

/** Open the voicing up: the second voice from the top drops an octave (the arranger's "drop 2"). */
export function drop2(v: number[]): number[] {
  if (v.length < 3) return v;
  const out = [...v];
  out[out.length - 2] -= 12;
  return out.sort((a, b) => a - b);
}

/** The bass note for a chord: its pitch class in the octave from `lo` up. */
export function bassNote(c: Chord, lo: number): number {
  return lo + ((c.bass - lo) % 12 + 12) % 12;
}

export interface MelNote {
  /** Step in the section where the note starts, and its length in steps. */
  at: number;
  len: number;
  /** Semitones above the tonic. */
  semi: number;
}

/**
 * A melody in scale degrees: `5:6 1':4 2':2 3':4 | 2':12 -:4`. Degree 1–7 of the mode, `'` an octave up, `,` an octave
 * down, a leading `#` or `b` bends it, `:n` is its length in steps, `-` a rest; `|` moves to the next bar line.
 */
export function melody(line: string, stepsPerBar: number, mode = MAJOR): MelNote[] {
  const out: MelNote[] = [];
  let at = 0;
  for (const tok of line.split(/\s+/).filter(Boolean)) {
    if (tok === '|') { at = Math.ceil(at / stepsPerBar) * stepsPerBar; continue; }
    const m = /^([#b]?)([1-7-])([',]*):(\d+)$/.exec(tok);
    if (!m) throw new Error(`note? ${tok}`);
    const len = Number(m[4]);
    if (m[2] !== '-') {
      let semi = mode[Number(m[2]) - 1] + (m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0);
      for (const ch of m[3]) semi += ch === "'" ? 12 : -12;
      out.push({ at, len, semi });
    }
    at += len;
  }
  return out;
}

/** A step pattern: `x` a full hit, `o` a medium one, `-` a ghost, `.` a rest. Returns [step, velocity] pairs. */
export function hits(pattern: string): [number, number][] {
  const out: [number, number][] = [];
  const p = pattern.replace(/\s/g, '');
  for (let i = 0; i < p.length; i++) {
    const v = p[i] === 'x' ? 1 : p[i] === 'o' ? 0.62 : p[i] === '-' ? 0.32 : 0;
    if (v) out.push([i, v]);
  }
  return out;
}

/** A small seeded generator (mulberry32): the score varies the same way every time, so a track is a composition. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
