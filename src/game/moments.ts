import type { Game } from './game';
import type { AdvisorId, FacilityType, GameState } from '../sim/types';
import type { ActiveTip } from './tips';
import { FACILITIES } from '../content/facilities';
import { SITE_BY_ID, MEGA_SITES } from '../content/sites';
import { megaStage } from '../content/charter';

/**
 * Campus moments: when something big finishes, a small card offers "take a look" (never moves the camera by itself).
 * Acts I–III, at most one every 45 game days, never over a tip. The memo starts from what already exists, so loading
 * a save or skipping ahead doesn't replay old builds.
 */
export interface MomentMemo {
  /** facility id → tier seen online (megaprojects: `mega:<id>` → stage). */
  built: Map<string, number>;
  lastDay: number;
}

const BIG: Partial<Record<FacilityType, AdvisorId>> = {
  datacenter: 'juno',
  lab: 'iris',
  gas: 'juno',
  hydro: 'juno',
  geothermal: 'juno',
  restart: 'juno',
  smr: 'juno',
  reactor: 'juno',
  fab: 'mira',
  packaging: 'mira',
};

const GAP = 45;

export function campusMoment(s: GameState, memo: MomentMemo, g: Game): ActiveTip | null {
  const first = memo.built.size === 0 && memo.lastDay === -9999;
  let found: { key: string; siteId: string; text: string; advisor: AdvisorId } | null = null;
  for (const f of s.facilities) {
    if (f.status !== 'online') continue;
    const tier = f.tier ?? 1;
    const seen = memo.built.get(f.id);
    if (seen === tier) continue;
    memo.built.set(f.id, tier);
    const adv = BIG[f.type];
    if (first || !adv || found) continue;
    const site = SITE_BY_ID[f.siteId]?.name ?? f.siteId;
    found = {
      key: f.id,
      siteId: f.siteId,
      advisor: adv,
      text: seen === undefined ? `The ${FACILITIES[f.type].name} at ${site} is online. Want to see it?` : `The ${FACILITIES[f.type].name} at ${site} is bigger now. Want a look?`,
    };
  }
  if (s.charter) {
    for (const m of MEGA_SITES) {
      const st = megaStage(s, m.id);
      const key = `mega:${m.id}`;
      const seen = memo.built.get(key) ?? 0;
      if (st <= seen) continue;
      memo.built.set(key, st);
      if (first || found) continue;
      found = { key, siteId: m.id, advisor: 'juno', text: `${m.name} reached stage ${st}. The crews would love a visit.` };
    }
  }
  if (first) memo.lastDay = s.day - GAP;
  if (!found || (s.act ?? 1) >= 4 || s.day - memo.lastDay < GAP || s.meta.tutorialStep >= 0) return null;
  if (g.mode === 'diorama' && g.dioramaSite === found.siteId) return null;
  memo.lastDay = s.day;
  const siteId = found.siteId;
  return { id: `moment:${found.key}`, kind: 'moment', until: s.day + 40, advisor: found.advisor, text: found.text, action: { label: 'Take a look', run: (game) => game.enterDiorama(siteId) } };
}
