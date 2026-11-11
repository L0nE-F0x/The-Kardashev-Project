/**
 * The check on paper: every chord tone and tune note of every section against its key, and every tune note against
 * the chord under it (a semitone between the tune and a chord tone is listed; a held one would be a wrong note).
 */
import { MAJOR } from '../../../src/audio/score';
import { harmony, tune } from './kit';
import { SECTIONS } from './pieces';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m: number) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function sanity(): string[] {
  const out: string[] = [];
  for (const [piece, secs] of Object.entries(SECTIONS))
    for (const [sec, s] of Object.entries(secs)) {
      const scale = new Set(MAJOR.map((d) => (s.key + d) % 12));
      const H = harmony(s.ch), T = tune(s.mel, s.key);
      const line: string[] = [];
      H.forEach((h, i) => {
        for (const [v, b, half] of [[h.v, h.bass, 0], [h.v2, h.bass2, 1]] as const) {
          if (!v) continue;
          const off = [...v, b].filter((m) => !scale.has(m % 12));
          line.push(`${i}${half ? 'b' : ''}:[${name(b)}|${v.map(name).join(' ')}]${off.length ? ` OUT-OF-KEY ${off.map(name).join(',')}` : ''}`);
        }
      });
      out.push(`${piece}.${sec} (key ${NAMES[s.key % 12]}) chords ${line.join(' ')}`);
      const notes: string[] = [];
      for (const n of T) {
        let flag = scale.has(n.m % 12) ? '' : ' OUT-OF-KEY';
        // every chord that sounds while the note does
        for (let st = n.at; st < n.at + n.len; st += 8) {
          const h = H[Math.min(H.length - 1, Math.floor(st / 16))];
          const second = h.v2 && st % 16 >= 8;
          const v = second ? h.v2! : h.v, b = second ? h.bass2 : h.bass;
          const clash = [...v, b].filter((m) => [1, 11].includes((((m - n.m) % 12) + 12) % 12));
          const tone = [...v, b].some((m) => (m - n.m) % 12 === 0);
          if (clash.length) flag += ` semitone-vs-${[...new Set(clash.map((m) => NAMES[m % 12]))].join(',')}${tone ? '(chord tone)' : ''}@${st}/len${n.len}`;
        }
        notes.push(`${name(n.m)}:${n.len}${flag}`);
      }
      out.push(`   tune ${notes.join(' ')}`);
    }
  return out;
}
