/**
 * Sandbox mode: the campaign's world and rules with switches you can flip any time — money that
 * never runs out, research fast or all known, construction overnight — and scenario sliders for
 * how touchy politics is, how hard the climate and crises hit and what chips cost. A campaign game
 * has no `meta.sandbox`, so none of this touches it.
 */
import { TECHS } from '../content/techs';
import type { GameState, SandboxOpts } from './types';
import { techAvailable } from './actions';

export const SANDBOX_DEFAULT: SandboxOpts = { unlimited: true, research: 'fast', instant: false, politics: 1, climate: 1, shocks: 1, chips: 1 };

export const sandboxOf = (s: GameState | null | undefined): SandboxOpts | null => s?.meta?.sandbox ?? null;

/** Research speed multiplier (4× on "fast"). */
export function sandboxResearch(s: GameState): number {
  return s.meta?.sandbox?.research === 'fast' ? 4 : 1;
}

/** A slider's value (1 when it isn't a sandbox). */
export function slider(s: GameState, key: 'politics' | 'climate' | 'shocks' | 'chips'): number {
  return s.meta?.sandbox?.[key] ?? 1;
}

/** Cash floors for "money never runs out": the company by act, and the Charter's treasury. */
function companyFloor(s: GameState): number {
  return s.act >= 3 ? 200e9 : s.act >= 2 ? 20e9 : 2e9;
}
function treasuryFloor(s: GameState): number {
  return s.act >= 5 ? 5e12 : s.act >= 4 ? 2e12 : 200e9;
}

/** The daily sandbox pass (after the economy): top up money, learn what can be learned, finish hook-ups. */
export function tickSandbox(s: GameState): void {
  const sb = s.meta.sandbox;
  if (!sb) return;
  if (sb.unlimited) {
    const f = companyFloor(s);
    if (s.finance.cash < f * 0.5) s.finance.cash = f;
    if (s.charter) {
      const t = treasuryFloor(s);
      if (s.charter.budget < t * 0.5) s.charter.budget = t;
    }
  }
  if (sb.research === 'all' && s.day % 7 === 0) {
    for (const t of TECHS) if (!s.research.done.includes(t.id) && techAvailable(s, t.id)) s.research.done.push(t.id);
    if (s.research.current && s.research.done.includes(s.research.current)) {
      s.research.current = null;
      s.research.progress = 0;
    }
  }
  if (sb.instant) for (const site of Object.values(s.sites)) for (const p of site.grid.pending) p.readyDay = Math.min(p.readyDay, s.day + 1);
}
