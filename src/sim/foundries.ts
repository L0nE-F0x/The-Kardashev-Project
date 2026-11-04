/**
 * Act V: self-replicating foundries. A seed planted at the Moon, a Lagrange yard or a claimed asteroid
 * grows on its own: its doubling time is set by the growth dial and the share of output reinvested,
 * slowed when the yards run short of feed and when a strain drifts off-spec. Each doubling rolls for
 * drift (sentinels cut the odds); a drifting strain grows until it is contained or sterilised, and a
 * strain left alone at 100 eats its foundry.
 */
import { ASTEROID_BY_ID, SEED_PLACES, SYSTEM, TYPE_INFO } from '../content/system';
import type { Foundry, GameState } from './types';
import { clamp, news, nextId, rand } from './core';
import { modMult, techMult } from './effects';
import { queueEvent } from './events';
import { moonStage } from './orbit';
import { addLegitimacy } from './charter';
import { placeOf } from './systemView';

// ════════════════════════════════════════ WHERE ════════════════════════════════════════
/** Where a seed can be planted right now (the Moon, the yards, claimed asteroids the Charter may use). */
export function seedPlaces(s: GameState): { id: string; name: string; note?: string }[] {
  const sy = s.system;
  if (!sy) return [];
  const here = (id: string) => sy.foundries.filter((f) => f.site === id).length;
  const count = (id: string) => (here(id) ? ` · ${here(id)} foundr${here(id) > 1 ? 'ies' : 'y'}` : '');
  const out: { id: string; name: string; note?: string }[] = SEED_PLACES.map((p) => ({ id: p.id, name: p.name, note: `${p.id === 'moon' ? (moonStage(s) >= 3 ? 'regolith + mass driver' : 'regolith, slow to export') : `feed ${Math.round(feedFactor(s) * 100)}%`}${count(p.id)}` }));
  for (const [id, st] of Object.entries(sy.asteroids)) {
    if (st.status < 2 || !seedAllowed(s, id)) continue;
    const a = ASTEROID_BY_ID[id];
    out.push({ id, name: a.name, note: `${a.type}-type · best for ${TYPE_INFO[a.type].good === 'rings' ? 'compute rings' : TYPE_INFO[a.type].good === 'habitat' ? 'habitats' : 'collectors'}${count(id)}` });
  }
  return out;
}

/** Whether the Charter may plant on this asteroid: its own claim, or any claim under the Commons or Concessions. */
export function seedAllowed(s: GameState, id: string): boolean {
  const st = s.system?.asteroids[id];
  if (!st || st.status < 2) return false;
  return st.owner === 'charter' || s.system?.ownership === 'commons' || s.system?.ownership === 'concessions';
}

// ════════════════════════════════════════ CAPACITY ════════════════════════════════════════
export const foundryMt = (s: GameState) => (s.system?.foundries ?? []).reduce((a, f) => a + f.cap, 0);
const capAt = (s: GameState, pred: (f: Foundry) => boolean) => (s.system?.foundries ?? []).filter(pred).reduce((a, f) => a + f.cap, 0);

/** How well the Lagrange yards are fed (0.3..1): rock from the Moon (with the mass driver) and the worked asteroids. */
export function feedFactor(s: GameState): number {
  const yards = capAt(s, (f) => f.site === 'l4' || f.site === 'l5');
  if (yards <= 0) return 1;
  const sources = capAt(s, (f) => placeOf(f.site) === 'asteroid') + capAt(s, (f) => f.site === 'moon') * (moonStage(s) >= 3 ? 1 : 0.4);
  return clamp(((sources + 0.05) / yards) * techMult(s, 'feed'), 0.3, 1);
}

/** Output efficiency of a foundry where it stands (the yards build best when fed; the Moon needs its driver). */
export function siteEff(s: GameState, f: Foundry): number {
  switch (placeOf(f.site)) {
    case 'moon':
      return moonStage(s) >= 3 ? 1 : 0.6;
    case 'l4':
    case 'l5':
      return 1.25 * feedFactor(s);
    default:
      return ASTEROID_BY_ID[f.site]?.belt === 'main' ? 0.95 : 1;
  }
}

/** Months a foundry takes to double at today's dial and reinvestment. */
export function doublingMonths(s: GameState): number {
  const sy = s.system!;
  const base = SYSTEM.doubling[clamp(Math.round(sy.dial), 1, 5) - 1];
  return base / ((sy.reinvest / 0.4) * growthMult(s));
}

/** Everything else that speeds the foundries: research, the minds' designs, ownership, setbacks. */
export function growthMult(s: GameState): number {
  const sy = s.system!;
  const own = sy.ownership === 'claims' ? 1.12 : sy.ownership === 'commons' ? 0.92 : 1;
  const minds = 1 + 0.05 * Math.log10(1 + sy.rings / 10) * (sy.mindsMood / 60);
  // the nearest, easiest rock goes first: the bigger the industry, the longer its supply lines
  const reach = 1 / (1 + 0.35 * Math.log10(1 + foundryMt(s) / 2));
  return techMult(s, 'foundryGrowth') * own * minds * reach * modMult(s, 'foundry:growth');
}

/** The chance a doubling sets off a drift. */
export function driftChance(s: GameState): number {
  const sy = s.system!;
  const own = sy.ownership === 'claims' ? 1.25 : 1;
  return SYSTEM.driftPerDoubling[clamp(Math.round(sy.dial), 1, 5) - 1] * (1 - 0.7 * sy.sentinels) * own * techMult(s, 'driftRisk') * modMult(s, 'foundry:drift');
}

/** Plant a seed (a finished 'seed' contract, an event or a partner's own seed). */
export function plantSeed(s: GameState, site: string, owner: string, mult = 1): Foundry {
  const sy = s.system!;
  const f: Foundry = { id: nextId(s, 'fd'), site, cap: SYSTEM.seedMt * mult * techMult(s, 'foundryGrowth'), founded: s.day, owner, drift: 0, haltedUntil: 0 };
  sy.foundries.push(f);
  const ast = sy.asteroids[site];
  if (ast) {
    ast.status = 3;
    ast.owner ??= owner;
  }
  return f;
}

/** Who owns a new Charter seed's output under the ownership rule. */
export function seedOwner(s: GameState, site: string, builder: string): string {
  const own = s.system?.ownership ?? 'commons';
  if (own === 'commons') return 'charter';
  const claim = s.system?.asteroids[site]?.owner;
  if (own === 'claims' && claim) return claim;
  return own === 'concessions' && builder !== 'you' ? builder : 'charter';
}

// ════════════════════════════════════════ THE DAILY TICK ════════════════════════════════════════
export function tickFoundries(s: GameState): void {
  const sy = s.system;
  if (!sy || !sy.foundries.length) return;
  const g = (Math.LN2 / (doublingMonths(s) / 12)) / 365;
  const pDrift = driftChance(s);
  for (const f of [...sy.foundries]) {
    if (f.haltedUntil > s.day) continue;
    const eff = siteEff(s, f);
    const strain = 1 - f.drift / 150;
    const step = g * eff * strain;
    f.cap *= Math.exp(step);
    // each doubling rolls for drift: per day that is the doubling rate times the chance
    if (f.drift <= 0 && rand(s) < (step / Math.LN2) * pDrift) startDrift(s, f);
    if (f.drift > 0) {
      f.drift = clamp(f.drift + (0.12 + 0.05 * sy.dial) * (1 - 0.6 * sy.sentinels) - (sy.mindsMood > 70 && sy.seat === 'full' ? 0.1 : 0), 0, 100);
      if (f.drift >= 100) loseFoundry(s, f);
    }
  }
}

export function startDrift(s: GameState, f: Foundry): void {
  f.drift = 8;
  news(s, `⚠ A strain at ${placeName(f.site)} is building copies that don’t match the signed design.`, 'bad');
  queueEvent(s, 'v-drift', { foundry: f.id });
}

/** A strain left alone eats its foundry. */
function loseFoundry(s: GameState, f: Foundry): void {
  const sy = s.system!;
  sy.foundries = sy.foundries.filter((x) => x !== f);
  sy.mindsMood = clamp(sy.mindsMood - 4, 0, 100);
  addLegitimacy(s, -5);
  news(s, `⚫ The strain at ${placeName(f.site)} ran wild: the foundry had to be blown apart. ${f.cap.toFixed(1)} Mt a year of capacity lost.`, 'bad');
}

/** Contain a strain: halt the foundry to verify every copy (days), losing some capacity. */
export function containDrift(s: GameState, f: Foundry, days: number, keep: number): void {
  f.drift = 0;
  f.cap *= keep;
  f.haltedUntil = Math.max(f.haltedUntil, s.day + days);
}

export function foundryById(s: GameState, id: string | number | undefined): Foundry | undefined {
  return s.system?.foundries.find((f) => f.id === String(id));
}

export function placeName(site: string): string {
  return SEED_PLACES.find((p) => p.id === site)?.name ?? ASTEROID_BY_ID[site]?.name ?? site;
}
