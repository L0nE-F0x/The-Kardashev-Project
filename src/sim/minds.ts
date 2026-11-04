/**
 * Act V: the minds in orbit. Most of Type I's power runs compute; the AIs that live there (Bit, Apex,
 * Weft, Sapling and millions of newer minds) have a mood: what share of the swarm they get, the seat
 * the Council gave them, what became of Bit, and how the strains were handled. A happy constituency
 * designs better seeds and helps contain drift; an unhappy one slows down and pushes back.
 */
import type { GameState } from './types';
import { clamp, rand } from './core';
import { modAdd, techMult } from './effects';
import { queueEvent } from './events';

/** Where the minds' mood is heading, and why. */
export function mindsTarget(s: GameState): { v: number; parts: [string, number][] } {
  const sy = s.system!;
  const parts: [string, number][] = [
    ['Baseline', 50],
    ['Their share of the swarm', (sy.minds - 0.5) * 50],
    ['The seat', sy.seat === 'full' ? 18 : sy.seat === 'advisory' ? 6 : sy.seat === 'none' ? -16 : 0],
    ['Bit', sy.bitFate === 'free' ? 10 : sy.bitFate === 'costeward' ? 8 : sy.bitFate === 'leash' ? -12 : (s.planet?.bitBond ?? 0) / 10],
    ['Recent events', modAdd(s, 'minds:mood')],
  ];
  const v = parts.reduce((a, [, x]) => a + x, 0) * techMult(s, 'mindsMood');
  return { v: clamp(v, 0, 100), parts: parts.filter(([, x]) => Math.abs(x) >= 0.5) };
}

export function tickMinds(s: GameState): void {
  const sy = s.system;
  if (!sy) return;
  if (sy.stage >= 1) sy.mindsMood += (mindsTarget(s).v - sy.mindsMood) / 120;
  if (s.day % 30 === 0 && sy.stage >= 2 && sy.mindsMood < 32 && rand(s) < 0.15 && s.day - Number(s.events.last['v-minds-slowdown'] ?? -9999) > 300) queueEvent(s, 'v-minds-slowdown');
}
