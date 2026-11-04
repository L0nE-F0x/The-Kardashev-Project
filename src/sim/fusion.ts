/**
 * Act IV: the fusion race. Fund a design's pilot plant (an 'fpilot' contract); when it finishes it
 * works, half-works or fails by the design's odds. Designs that work can be built as fleets
 * ('ffleet' contracts at megaproject sites) that get cheaper with every plant. D-T designs need
 * tritium, which the fleets breed; the D-He3 design needs helium-3 from the Moon.
 */
import { CONTRACT_KINDS } from '../content/charter';
import { DESIGN_IDS, DT_DESIGNS, FUSION_DESIGNS, PLANET } from '../content/planet';
import type { FusionDesignId, GameState, Project } from './types';
import { clamp, news, rand } from './core';
import { queueEvent } from './events';
import { techMult } from './effects';

const fleets = (s: GameState) => (s.charter?.projects ?? []).filter((p) => p.kind === 'ffleet' && p.status !== 'cancelled');
const nameplate = (p: Project) => CONTRACT_KINDS.ffleet.sizes[p.size - 1];
const designOf = (p: Project) => (p.opt ?? 'tokamak') as FusionDesignId;

/** Fusion power delivered (TW, average). */
export function fusionTW(s: GameState): number {
  return fleets(s).filter((p) => p.status === 'done').reduce((a, p) => a + (p.gw ?? 0), 0) / 1000;
}

/** Designs with at least one fleet running. */
export function designsOnline(s: GameState): FusionDesignId[] {
  return [...new Set(fleets(s).filter((p) => p.status === 'done').map(designOf))];
}

/** Nameplate GW of a design's fleets, built and building. */
export function designGW(s: GameState, d: FusionDesignId, builtOnly = false): number {
  return fleets(s).filter((p) => designOf(p) === d && (!builtOnly || p.status === 'done')).reduce((a, p) => a + nameplate(p), 0);
}

/** D-T fleets (built and building), nameplate GW. */
export function dtGW(s: GameState, builtOnly = false): number {
  return DT_DESIGNS.reduce((a, d) => a + designGW(s, d, builtOnly), 0);
}

/** GW of D-He3 the Moon's helium-3 can fuel. */
export function he3Cap(s: GameState): number {
  const done = (k: string) => (s.charter?.projects ?? []).some((p) => p.kind === k && p.status === 'done');
  return done('massdriver') ? PLANET.he3Driver : done('moonmine') ? PLANET.he3Mine : 0;
}

/** Chance a design's next pilot works (shown as a range in the UI, not exactly). */
export function pilotOdds(s: GameState, d: FusionDesignId): number {
  const st = s.planet?.fusion[d];
  const tries = st?.tries ?? 0;
  return clamp((FUSION_DESIGNS[d].odds + 0.12 * tries) * techMult(s, 'fusionOdds'), 0.05, 0.95);
}

/** Why a pilot can't be funded for this design right now, or null. */
export function pilotBlocked(s: GameState, d: FusionDesignId): string | null {
  const st = s.planet?.fusion[d];
  if (!st) return 'Act IV only.';
  if (st.status === 'won') return 'This design already works.';
  if (st.status === 'pilot') return 'A pilot is already being built.';
  if (d === 'dhe3' && he3Cap(s) <= 0) return 'Needs helium-3: a lunar mine first.';
  return null;
}

/** Project value per GW of a fleet of this design today (learning curve applied). */
export function fleetValuePerGW(s: GameState, d: FusionDesignId): number {
  const def = FUSION_DESIGNS[d];
  const built = Math.max(20, designGW(s, d, true));
  const learning = Math.pow(built / 20, Math.log2(1 - PLANET.fusionLearning));
  const partial = s.planet?.fusion[d]?.status === 'partial' ? 1.25 : 1;
  return def.fleetCost * learning * partial * techMult(s, 'fusionCost');
}

/** Why a fleet of this design (at this size) can't be ordered right now, or null. */
export function fleetBlocked(s: GameState, d: FusionDesignId, gw = 0): string | null {
  const st = s.planet?.fusion[d];
  if (!st) return 'Act IV only.';
  if (st.status !== 'won' && st.status !== 'partial') return 'The design has to work in a pilot first.';
  if (FUSION_DESIGNS[d].fuel === 'dt' && dtGW(s) + gw > (s.planet?.tritium ?? 0)) return `Not enough tritium: D-T fleets are capped at ${Math.round(s.planet!.tritium)} GW until the running ones breed more.`;
  if (FUSION_DESIGNS[d].fuel === 'dhe3' && designGW(s, 'dhe3') + gw > he3Cap(s)) return `Helium-3 from the Moon fuels ${he3Cap(s)} GW of D-He3 for now.`;
  return null;
}

/** Capacity factor a fleet of this design delivers. */
export function fleetCF(s: GameState, d: FusionDesignId): number {
  return FUSION_DESIGNS[d].cf * (s.planet?.fusion[d]?.status === 'partial' ? 0.85 : 1);
}

/** A pilot plant was funded (award time). */
export function startPilot(s: GameState, d: FusionDesignId): void {
  const st = s.planet?.fusion[d];
  if (!st) return;
  st.status = 'pilot';
  st.tries += 1;
}

/** A pilot plant finished: did it work? */
export function resolvePilot(s: GameState, d: FusionDesignId): void {
  const st = s.planet?.fusion[d];
  if (!st) return;
  const odds = pilotOdds(s, d) - 0.12; // the try that just ran isn't counted twice
  const roll = rand(s);
  const outcome = roll < odds ? 'won' : roll < odds + (1 - odds) * 0.45 ? 'partial' : 'failed';
  st.status = outcome;
  st.resolvedDay = s.day;
  const name = FUSION_DESIGNS[d].name;
  news(
    s,
    outcome === 'won' ? `☀ ${name}: the pilot plant runs at net power. Fleets can be ordered.` : outcome === 'partial' ? `🌗 ${name}: the pilot works, just. Fleets possible, but dearer and less reliable.` : `💥 ${name}: the pilot plant falls short of net power.`,
    outcome === 'failed' ? 'bad' : 'good',
  );
  queueEvent(s, 'fusion-result', { design: d, outcome });
}

/** One day: running D-T fleets breed tritium for the next ones. */
export function tickFusion(s: GameState): void {
  const pl = s.planet;
  if (!pl) return;
  const running = dtGW(s, true);
  pl.tritium += (PLANET.breed * running * techMult(s, 'tritiumBreed')) / 365;
}

export { DESIGN_IDS };
