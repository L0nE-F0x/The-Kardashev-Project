/**
 * Act V: the swarm and the things that use its power. Every day the foundries' output (after what they
 * reinvest in more foundries) becomes collectors and users: compute rings for the minds, habitats and
 * industry for people, in the share the plan sets. Collectors keep pace with the users, because power
 * only counts when something uses it. Beams carry swarm power down to Earth, but only up to the
 * Thermal Line. The Charter takes a dividend from the space economy (more under the Commons).
 *
 * The Thermal Line: waste heat over the whole Earth (W/m²) warms the planet like any other forcing,
 * with a lag. Over the line, the provinces suffer and the Charter loses Legitimacy.
 */
import { SYSTEM, ASTEROID_BY_ID } from '../content/system';
import { REGION_IDS } from '../content/mapcodes';
import type { GameState } from './types';
import { clamp, news } from './core';
import { techMult } from './effects';
import { addLegitimacy, chEarn } from './charter';
import { foundryMt, siteEff } from './foundries';
import { beamsUsed, earthOwnTW, lineTW, placeOf } from './systemView';

// ════════════════════════════════════════ POWER ════════════════════════════════════════
/** What the foundries draw, TW. */
export const foundryDrawTW = (s: GameState) => foundryMt(s) * SYSTEM.foundryDraw;

/** Collectors that are lit right now (storms knock some out), TW. */
export const collectedTW = (s: GameState) => (s.system ? s.system.collectors * (1 - s.system.damage) : 0);

/** Everything that wants swarm power, TW. */
export function usersTW(s: GameState): number {
  const sy = s.system;
  if (!sy) return 0;
  return sy.rings + sy.habitat + foundryDrawTW(s) + beamsUsed(s);
}

/** Power collected and used in space (and beamed down): counts for K, TW. */
export function spaceTW(s: GameState): number {
  return s.system ? Math.min(collectedTW(s), usersTW(s)) : 0;
}

/** Collected but unused (nothing to plug it into), TW. */
export const idleTW = (s: GameState) => Math.max(0, collectedTW(s) - usersTW(s));

/** Power used on Earth's surface: what Earth makes plus what is beamed down, TW. */
export const surfaceTW = (s: GameState) => earthOwnTW(s) + beamsUsed(s);
export const surfaceWm2 = (s: GameState) => surfaceTW(s) / SYSTEM.twPerWm2;

/** How far over the Thermal Line the surface runs (0 = at or under it; 0.1 = 10% over). */
export function overLine(s: GameState): number {
  if (!s.system?.thermalLine) return 0;
  return Math.max(0, surfaceTW(s) / lineTW(s) - 1);
}

/** Headroom under the line, TW (negative when over). */
export const headroomTW = (s: GameState) => lineTW(s) - surfaceTW(s);

/** Mass per TW of each product, after research and the asteroid types feeding the foundries. */
export function massPerTW(s: GameState): { collectors: number; rings: number; habitat: number } {
  const sy = s.system!;
  // the share of capacity on each asteroid type gives up to +25% on what that type is good for
  const total = Math.max(1e-9, foundryMt(s));
  const onType = (t: 'C' | 'S' | 'M') => sy.foundries.filter((f) => placeOf(f.site) === 'asteroid' && ASTEROID_BY_ID[f.site]?.type === t).reduce((a, f) => a + f.cap, 0) / total;
  return {
    collectors: (SYSTEM.mtPerTW.collectors * techMult(s, 'collectorMass')) / (1 + 0.25 * onType('S')),
    rings: (SYSTEM.mtPerTW.rings * techMult(s, 'ringMass')) / (1 + 0.25 * onType('M')),
    habitat: SYSTEM.mtPerTW.habitat / (1 + 0.25 * onType('C')),
  };
}

/** What the foundries put out today for building (after reinvestment), Mt a year. */
export function buildMt(s: GameState): number {
  const sy = s.system;
  if (!sy) return 0;
  let out = 0;
  for (const f of sy.foundries) if (f.haltedUntil <= s.day) out += f.cap * siteEff(s, f) * (1 - f.drift / 150);
  return out * (1 - sy.reinvest);
}

// ════════════════════════════════════════ THE DAILY TICK ════════════════════════════════════════
export function tickSwarm(s: GameState): void {
  const sy = s.system;
  if (!sy) return;
  // 1. build: collectors first if they lag the users, then both together in step
  let mass = buildMt(s) / 365;
  if (mass > 0) {
    const m = massPerTW(s);
    const users = sy.rings + sy.habitat + foundryDrawTW(s) + Math.min(sy.beams, Math.max(0, headroomTW(s) + beamsUsed(s)));
    const gap = users * 1.04 - sy.collectors;
    if (gap > 0) {
      const tw = Math.min(gap, mass / m.collectors);
      sy.collectors += tw;
      mass -= tw * m.collectors;
    }
    const share = clamp(sy.minds, 0, 1);
    const perTW = 1.04 * m.collectors + share * m.rings + (1 - share) * m.habitat;
    const grow = mass / perTW;
    sy.collectors += 1.04 * grow;
    sy.rings += share * grow;
    sy.habitat += (1 - share) * grow;
  }
  // 2. storm damage is repaired
  if (sy.damage > 0) sy.damage = Math.max(0, sy.damage - 0.004);
  // 3. people move up into the habitats
  const perTW = SYSTEM.popPerTW[sy.settlement ?? 'stations'];
  sy.spacePop += (sy.habitat * perTW + 0.4 * habitatsBuilt(s) - sy.spacePop) / 730;
  // 4. the Charter's dividend from the space economy
  const used = spaceTW(s);
  if (used > 0) chEarn(s, 'income', (used * SYSTEM.dividend[sy.ownership ?? 'commons']) / 365);
  // 5. the Thermal Line: waste-heat warming follows the heat with a lag
  const target = SYSTEM.warmPerWm2 * Math.max(0, surfaceWm2(s) - SYSTEM.heat0Wm2);
  sy.heatWarming += (target - sy.heatWarming) / (SYSTEM.heatLagYears * 365);
  if (s.day % 30 === 0) {
    const over = overLine(s);
    if (over > 0) {
      addLegitimacy(s, -Math.min(3, 1 + over * 10));
      if (!s.flags.offline && s.day - Number(s.flags.lineWarned ?? -9999) > 365) {
        s.flags.lineWarned = s.day;
        news(s, `🌡 Earth is running ${Math.round(over * 100)}% over the Thermal Line. The provinces feel it.`, 'bad');
      }
    }
  }
}

/** Habitat cylinders finished (each adds a town of its own). */
function habitatsBuilt(s: GameState): number {
  return (s.charter?.projects ?? []).filter((p) => p.kind === 'habitat' && p.status === 'done').reduce((a, p) => a + [1, 2, 4][p.size - 1], 0);
}

/** Average garden value across the provinces (−100..100). */
export function avgGarden(s: GameState): number {
  const sy = s.system;
  if (!sy) return 0;
  return REGION_IDS.reduce((a, r) => a + sy.garden[r], 0) / REGION_IDS.length;
}
