/**
 * The score's music-theory lint (nobody can listen in QA): for every piece (the game's TRACKS and any file in
 * src/audio/tracks/), every section's chords parse, its tune fits its bars, the form only names sections that exist,
 * and no held melody note grates against its chord (an "avoid note": a semitone above a chord tone, like the fourth
 * over a major third or the major seventh over a dominant). Short passing notes are free.
 */
import { describe, expect, it } from 'vitest';
import type { TrackDef } from '../src/audio/cinematic';
import { chords, melody, MAJOR, seeded } from '../src/audio/score';
import { TRACKS } from '../src/audio/tracks';

const files = import.meta.glob('../src/audio/tracks/*.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const pieces: [string, TrackDef][] = Object.entries(TRACKS).map(([k, v]) => [`TRACKS.${k}`, v as TrackDef]);
for (const [path, mod] of Object.entries(files)) if (mod.track) pieces.push([path.replace('../src/audio/', ''), mod.track as TrackDef]);

/** Held melody notes that grate: [section, bar, step, note, chord, why]. */
export function clashes(def: TrackDef): string[] {
  const out: string[] = [];
  const quarter = def.steps / 4;
  for (const [name, sec] of Object.entries(def.secs)) {
    if (!sec.mel) continue;
    const bars = chords(sec.ch);
    const tonic = sec.tonic ?? def.tonic;
    for (const n of melody(sec.mel, def.steps, def.mode ?? MAJOR)) {
      const b = Math.floor(n.at / def.steps), step = n.at % def.steps;
      const bar = bars[b];
      if (!bar) continue;
      // held: a quarter or longer, or an eighth landing on a beat
      const held = n.len >= quarter || (n.len >= quarter / 2 && step % quarter === 0);
      if (!held) continue;
      const ch = bar.length > 1 && step >= def.steps / 2 ? bar[1] : bar[0];
      const pc = (((tonic + n.semi) % 12) + 12) % 12;
      const iv = (pc - ch.root + 12) % 12;
      const tones = ch.tones.map((t) => t % 12);
      if (tones.includes(iv)) continue;
      const grates = tones.filter((t) => (iv - t + 12) % 12 === 1);
      if (grates.length) out.push(`${name} bar ${b + 1} step ${step}: note ${pc} a semitone above a chord tone of the chord on ${ch.root}`);
    }
  }
  return out;
}

describe('the score', () => {
  it('has pieces to check', () => {
    expect(pieces.length).toBeGreaterThan(0);
  });
  for (const [id, def] of pieces) {
    describe(id, () => {
      it('parses: chords, tunes, the form', () => {
        for (const [name, sec] of Object.entries(def.secs)) {
          const bars = chords(sec.ch);
          if (sec.mel) {
            const notes = melody(sec.mel, def.steps, def.mode ?? MAJOR);
            const end = Math.max(0, ...notes.map((n) => n.at + n.len));
            expect(end, `${name}'s tune runs past its ${bars.length} bars`).toBeLessThanOrEqual(bars.length * def.steps);
            for (const n of notes) expect(Math.abs(n.semi), `${name}: a note far from the tonic`).toBeLessThanOrEqual(31);
          }
        }
        for (let pass = 0; pass < 8; pass++) for (const s of def.form(pass, seeded(pass * 31 + 17))) expect(def.secs[s], `form names "${s}"`).toBeTruthy();
      });
      it('no held melody note grates against its chord', () => {
        expect(clashes(def)).toEqual([]);
      });
    });
  }
});
