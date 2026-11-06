import type { GameState } from './types';
import { FACILITIES } from '../content/facilities';
import { TECH_BY_ID } from '../content/techs';
import { SITE_BY_ID } from '../content/sites';
import { CONTRACT_KINDS, HVDC_ROUTES } from '../content/charter';
import { REGIONS } from '../content/regions';

/**
 * What the player is waiting for, soonest first: builds, upgrades, chips at sea, grid connections, the training run,
 * research, and (Act III) Charter projects, bids and the next Council session. Read-only — the goal card's "Coming up"
 * strip and the skip-ahead buttons use it. Acts IV–V move in jumps instead, so they list nothing.
 */
export interface UpcomingItem {
  key: string;
  /** Icon name (ui/icons.ts), or `fac:<type>` for a facility. */
  icon: string;
  text: string;
  /** Game day it lands. */
  day: number;
}

export function upcoming(s: GameState): UpcomingItem[] {
  if ((s.act ?? 1) >= 4) return [];
  const out: UpcomingItem[] = [];
  // Charter work can sit at a region, an HVDC route or 'global' rather than a site
  const name = (id: string) => SITE_BY_ID[id]?.name ?? REGIONS[id as keyof typeof REGIONS]?.name ?? HVDC_ROUTES.find((r) => r.id === id)?.name ?? (id === 'global' ? 'worldwide' : id);
  for (const f of s.facilities) {
    if (f.status === 'building' && !f.blocked) out.push({ key: `f:${f.id}`, icon: `fac:${f.type}`, text: `${FACILITIES[f.type].name} at ${name(f.siteId)}`, day: s.day + Math.max(1, Math.ceil(f.buildDays - f.progress)) });
    if (f.upgrade) out.push({ key: `u:${f.id}`, icon: 'upgrade', text: `${FACILITIES[f.type].name} upgrade at ${name(f.siteId)}`, day: s.day + Math.max(1, Math.ceil(f.upgrade.buildDays - f.upgrade.progress)) });
  }
  // chips: the next ship to land at each site
  const ships = new Map<string, { day: number; qty: number }>();
  for (const x of s.shipments) {
    const cur = ships.get(x.dest);
    if (!cur || x.arriveDay < cur.day) ships.set(x.dest, { day: x.arriveDay, qty: x.batch.qty });
  }
  for (const [dest, v] of ships) out.push({ key: `s:${dest}`, icon: 'ship', text: `${v.qty.toLocaleString()} chips land at ${name(dest)}`, day: Math.max(s.day + 1, Math.ceil(v.day)) });
  for (const [id, site] of Object.entries(s.sites)) {
    const next = site.grid.pending.reduce<number | null>((a, p) => (a === null || p.readyDay < a ? p.readyDay : a), null);
    if (next !== null) out.push({ key: `g:${id}`, icon: 'grid', text: `Grid connection at ${name(id)}`, day: Math.max(s.day + 1, Math.ceil(next)) });
  }
  const run = s.training;
  if (run && s.stats.trainPFd > 0) out.push({ key: 'train', icon: 'train', text: `${run.name} finishes training`, day: s.day + Math.max(1, Math.ceil((run.target - run.done) / s.stats.trainPFd)) });
  const tech = s.research.current ? TECH_BY_ID[s.research.current] : null;
  if (tech && s.stats.rpPerDay > 0) out.push({ key: 'research', icon: 'research', text: `Research: ${tech.name}`, day: s.day + Math.max(1, Math.ceil((tech.cost - s.research.progress - s.research.pool) / s.stats.rpPerDay)) });
  const ch = s.charter;
  if (ch) {
    for (const p of ch.projects) {
      if (p.status !== 'building') continue;
      out.push({ key: `p:${p.id}`, icon: CONTRACT_KINDS[p.kind]?.icon ?? 'contract', text: `${CONTRACT_KINDS[p.kind]?.name ?? p.kind} · ${name(p.where)}`, day: s.day + Math.max(1, Math.ceil(p.days - p.progress)) });
    }
    for (const t of ch.tenders) if (t.closesDay > s.day) out.push({ key: `t:${t.id}`, icon: 'tender', text: `Bids close: ${CONTRACT_KINDS[t.kind]?.name ?? t.kind}`, day: t.closesDay });
    if (ch.council.nextSession > s.day) out.push({ key: 'council', icon: 'council', text: 'Council session', day: ch.council.nextSession });
  }
  return out.sort((a, b) => a.day - b.day);
}
