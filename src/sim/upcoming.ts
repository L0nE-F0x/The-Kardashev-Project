import type { GameState } from './types';
import { FACILITIES } from '../content/facilities';
import { TECH_BY_ID } from '../content/techs';
import { SITE_BY_ID } from '../content/sites';
import { CONTRACT_KINDS, HVDC_ROUTES } from '../content/charter';
import { REGIONS } from '../content/regions';
import { PLANET, STAGE_NAMES } from '../content/planet';
import { STAGE5_NAMES, SYSTEM } from '../content/system';

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
  // chips: one line per site for everything ordered — at sea, or still being made (estimated from the order's pace so
  // far plus the sailing time), landing with the last ship
  const chips = new Map<string, { day: number; sea: number; making: number }>();
  const add = (dest: string, day: number, sea: number, making: number) => {
    const cur = chips.get(dest) ?? { day: 0, sea: 0, making: 0 };
    chips.set(dest, { day: Math.max(cur.day, day), sea: cur.sea + sea, making: cur.making + making });
  };
  for (const x of s.shipments) add(x.dest, x.arriveDay, x.batch.qty, 0);
  for (const o of s.orders) {
    if (o.done) continue;
    const left = Math.max(0, o.qty - o.shipped);
    if (!left) continue;
    const pace = o.shipped / Math.max(1, s.day - o.placedDay);
    const legs = s.shipments.filter((x) => x.orderId === o.id);
    const sail = legs.length ? Math.max(...legs.map((x) => x.arriveDay - x.departDay)) : 30;
    add(o.dest, pace > 0 ? s.day + left / pace + sail : s.day + 60 + sail, 0, left);
  }
  for (const [dest, v] of chips) {
    const text = v.making > 0 ? `Chips for ${name(dest)}: ${v.making.toLocaleString()} being made${v.sea ? `, ${v.sea.toLocaleString()} at sea` : ''}` : `The last of ${v.sea.toLocaleString()} chips lands at ${name(dest)}`;
    out.push({ key: `s:${dest}`, icon: 'ship', text, day: Math.max(s.day + 1, Math.ceil(v.day)) });
  }
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

/**
 * Acts IV–V, where time moves in plans and eras: what stands on the horizon, soonest first (the plan or era under
 * way, Charter projects being built, the next Council session, the latest day the next stage can open). For the
 * foot strip only: nothing here can be skipped to, and `upcoming` still lists nothing in these acts.
 */
export function horizon(s: GameState): UpcomingItem[] {
  if ((s.act ?? 1) < 4) return [];
  const out: UpcomingItem[] = [];
  const pl = s.planet;
  const sy = s.system;
  const jump = sy?.jump ?? pl?.jump;
  if (jump && jump.to > s.day) out.push({ key: 'jump', icon: 'plan', text: sy ? 'The era plan ends' : 'The five-year plan ends', day: jump.to });
  if (sy) {
    const max = SYSTEM.stageMaxDays[sy.stage];
    if (max && sy.stage < 4) out.push({ key: 'stage', icon: 'goals', text: `${STAGE5_NAMES[sy.stage + 1]}, at the latest`, day: sy.stageDay + max });
  } else if (pl) {
    const max = PLANET.stageMaxDays[pl.stage];
    if (max && pl.stage < 4) out.push({ key: 'stage', icon: 'goals', text: `${STAGE_NAMES[pl.stage + 1]}, at the latest`, day: pl.stageDay + max });
  }
  const ch = s.charter;
  if (ch) {
    const building = ch.projects.filter((p) => p.status === 'building').map((p) => ({ p, day: s.day + Math.max(1, Math.ceil(p.days - p.progress)) }));
    building.sort((a, b) => a.day - b.day);
    for (const { p, day } of building.slice(0, 3)) out.push({ key: `p:${p.id}`, icon: CONTRACT_KINDS[p.kind]?.icon ?? 'contract', text: CONTRACT_KINDS[p.kind]?.name ?? p.kind, day });
    if (ch.council.nextSession > s.day) out.push({ key: 'council', icon: 'council', text: 'Council session', day: ch.council.nextSession });
  }
  return out.filter((it) => it.day > s.day).sort((a, b) => a.day - b.day);
}
