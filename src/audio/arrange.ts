/**
 * Arranging helpers the pieces share (tracks/*.ts): play the bar's tune or chords on an instrument, find the voicing
 * or the bass at a step, and small conveniences for patterns. A piece's own idioms (a bossa guitar's comping, a funk
 * bass line) live in the piece.
 */
import type { Bar } from './cinematic';

/** A note on an instrument: start time, MIDI note, length in seconds, velocity 0..1. */
export type Note = (t: number, m: number, dur: number, vel: number) => void;
/** A chord on an instrument. */
export type ChordNote = (t: number, notes: number[], dur: number, vel: number) => void;

/** The bar's tune on an instrument (`oct` in semitones), the downbeat leaning in, every note humanised a little. */
export function sing(c: Bar, play: Note, vel: number, oct = 0, legato = 0.94): void {
  for (const n of c.mel) c.at(n.at, (t) => play(t, c.tonic + n.semi + oct, c.dur(n.len) * legato, vel * (n.at === 0 ? 1 : 0.92) * (0.94 + c.r() * 0.12)), true);
}

/** Strike the bar's chord (or its two chords) and hold it for as long as it lasts. */
export function chordsOn(c: Bar, play: ChordNote, vel = 0.7): void {
  if (c.fresh) c.at(0, (t) => play(t, c.v, c.dur(c.v2 ? c.steps / 2 : c.steps * c.hold), vel));
  if (c.v2) c.at(c.steps / 2, (t) => play(t, c.v2!, c.dur(c.steps / 2), vel));
}

/** The voicing sounding at a step (the bar's second chord takes over from the middle). */
export const voicingAt = (c: Bar, step: number): number[] => (c.v2 && step >= c.steps / 2 ? c.v2 : c.v);
/** The bass note sounding at a step. */
export const bassAt = (c: Bar, step: number): number => (c.v2 && step >= c.steps / 2 ? c.bass2 : c.bass);
/** The bass note at a step, moved into the octave from `lo` (the root, unless the chord names another bass). */
export const bassIn = (c: Bar, step: number, lo: number): number => lo + (((bassAt(c, step) - lo) % 12) + 12) % 12;
/** The last bar of its section. */
export const last = (c: Bar): boolean => c.i === c.len - 1;
/** How far through its section the bar is: 0 at the first bar, 1 at the last. */
export const through = (c: Bar): number => (c.len > 1 ? c.i / (c.len - 1) : 1);
/** A velocity with a little life in it (±`spread`). */
export const hum = (c: Bar, v: number, spread = 0.08): number => Math.max(0.05, Math.min(1, v * (1 - spread + c.r() * spread * 2)));

/**
 * Hits from a pattern string, one character a step: `x` full, `o` medium, `-` a ghost, `.` rest (spaces ignored).
 * Calls `fn(step, velocity)` for each hit.
 */
export function pattern(p: string, fn: (step: number, vel: number) => void): void {
  const s = p.replace(/\s/g, '');
  for (let i = 0; i < s.length; i++) {
    const v = s[i] === 'x' ? 1 : s[i] === 'o' ? 0.62 : s[i] === '-' ? 0.3 : 0;
    if (v) fn(i, v);
  }
}
