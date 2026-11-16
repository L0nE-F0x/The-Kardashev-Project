/**
 * The check on paper: every chord tone and tune note of every section against its key, and every tune note against
 * the chord under it (a semitone between the tune and a chord tone is listed; a held one would be a wrong note).
 * A section's last half bar may sit on the next key's dominant: its notes are then out of the old key on purpose.
 */
import { bassNote, chords, melody, voice, MAJOR } from '../../../src/audio/score';
import { FORMS } from './pieces';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m: number) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function sanity(): string[] {
  const out: string[] = [];
  for (const [piece, form] of Object.entries(FORMS)) {
    let prev: number[] | null = null;
    form.forEach((s, k) => {
      const scale = new Set(MAJOR.map((d) => (s.tonic + d) % 12));
      const H = chords(s.ch).map((bar) => bar.map((c) => ({ v: (prev = voice(c, prev, 53, 72, 4)), b: bassNote(c, 33) })));
      const line: string[] = [];
      H.forEach((bar, i) =>
        bar.forEach(({ v, b }, half) => {
          const off = [...v, b].filter((m) => !scale.has(m % 12));
          line.push(`${i}${half ? 'b' : ''}:[${name(b)}|${v.map(name).join(' ')}]${off.length ? ` OUT-OF-KEY ${off.map(name).join(',')}` : ''}`);
        }),
      );
      out.push(`${piece}.${k} ${s.sec} (key ${NAMES[s.tonic % 12]}, ${H.length} bars) chords ${line.join(' ')}`);
      const notes: string[] = [];
      for (const n of s.mel ? melody(s.mel, 16, MAJOR) : []) {
        const m = s.tonic + n.semi;
        let flag = scale.has(m % 12) ? '' : ' OUT-OF-KEY';
        // every chord that sounds while the note does
        for (let st = n.at; st < n.at + n.len; st += 8) {
          const bar = H[Math.min(H.length - 1, Math.floor(st / 16))];
          const { v, b } = bar[1] && st % 16 >= 8 ? bar[1] : bar[0];
          const clash = [...v, b].filter((x) => [1, 11].includes((((x - m) % 12) + 12) % 12));
          const tone = [...v, b].some((x) => (x - m) % 12 === 0);
          if (clash.length) flag += ` semitone-vs-${[...new Set(clash.map((x) => NAMES[x % 12]))].join(',')}${tone ? '(chord tone)' : ''}@${st}/len${n.len}`;
        }
        notes.push(`${name(m)}:${n.len}${flag}`);
      }
      out.push(`   tune ${notes.join(' ')}`);
    });
  }
  return out;
}
