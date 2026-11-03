/**
 * Act II rivals on the map: Meridian, Lattice and Orchard build campuses at real sites (taking
 * plots and grid headroom), drain regional talent pools, and startups come up for sale.
 */
import { RIVAL_PREFS, STARTUP_BY_ID, STARTUPS } from '../content/rivals';
import { BUILD_SITES, siteOpen } from '../content/sites';
import { REGIONS } from '../content/regions';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { GameState } from './types';
import { clamp, fmtMW, fmtMoney, news, nextId, pick, rand, randInt, yearsElapsed } from './core';
import { gridHeadroomLeft, siteSlots } from './model';
import { slotsUsed } from './actions';
import { queueEvent } from './events';

const MAX_BUILDS = 8;

export function rivalSlotsAt(s: GameState, siteId: string): number {
  return s.rivalBuilds.filter((b) => b.siteId === siteId).reduce((a, b) => a + b.slots, 0);
}

export function tickRivalBuilds(s: GameState): void {
  if ((s.act ?? 1) < 2) return;
  for (const r of s.market.rivals) {
    const prefs = RIVAL_PREFS[r.id];
    if (!prefs) continue;
    r.nextBuild ??= s.day + randInt(s, 30, 120);
    if (s.day < r.nextBuild) continue;
    r.nextBuild = s.day + randInt(s, prefs.every[0], prefs.every[1]);
    if (s.rivalBuilds.filter((b) => b.owner === r.id).length >= MAX_BUILDS) continue;
    const itMW = Math.round((prefs.size[0] + rand(s) * (prefs.size[1] - prefs.size[0])) * (1 + yearsElapsed(s.day) * 0.08) / 10) * 10;
    const slots = itMW <= 150 ? 1 : itMW <= 300 ? 2 : 3;
    let best: { id: string; score: number } | null = null;
    for (const site of BUILD_SITES) {
      if (!siteOpen(site, s.act, s.phase)) continue;
      if (site.id === s.company.homeSite) continue;
      const free = siteSlots(s, site.id) - slotsUsed(s, site.id);
      if (free < slots) continue;
      const score =
        prefs.headroom * Math.min(1, gridHeadroomLeft(s, site.id) / 100) +
        prefs.cheap * (1 / site.priceMult - 0.8) +
        prefs.talent * (site.talent - 0.8) * (s.talent[site.region] ?? 1) +
        prefs.clean * (site.solarCF + site.windCF) +
        (REGIONS[site.region].stance === 'accelerate' ? 0.2 : 0) +
        rand(s) * 0.6;
      if (!best || score > best.score) best = { id: site.id, score };
    }
    if (!best) continue;
    s.rivalBuilds.push({ id: nextId(s, 'rb'), owner: r.id, siteId: best.id, slots, itMW, status: 'building', startDay: s.day, readyDay: s.day + randInt(s, 420, 640) });
    const site = BUILD_SITES.find((x) => x.id === best!.id)!;
    news(s, `🏗 ${r.name} breaks ground on a ${fmtMW(itMW)} campus at ${site.name}.`, 'info');
  }
  for (const b of s.rivalBuilds) {
    if (b.status !== 'building' || s.day < b.readyDay) continue;
    b.status = 'online';
    const r = s.market.rivals.find((x) => x.id === b.owner);
    news(s, `📣 ${r?.name ?? b.owner}'s ${fmtMW(b.itMW)} campus at ${BUILD_SITES.find((x) => x.id === b.siteId)?.name} is online.`, 'info');
  }

  // talent: rival labs drain regional pools, your labs too; pools slowly refill
  if (s.day % 30 === 0) {
    const drain: Partial<Record<RegionId, number>> = {};
    for (const b of s.rivalBuilds) {
      if (b.status !== 'online') continue;
      const reg = BUILD_SITES.find((x) => x.id === b.siteId)!.region;
      drain[reg] = (drain[reg] ?? 0) + (b.owner === 'lattice' ? 0.018 : 0.008);
    }
    for (const f of s.facilities) {
      if (f.type !== 'lab' || f.status !== 'online') continue;
      const reg = BUILD_SITES.find((x) => x.id === f.siteId)?.region;
      if (reg) drain[reg] = (drain[reg] ?? 0) + 0.004 * (f.tier ?? 1);
    }
    for (const reg of REGION_IDS) {
      const t = s.talent[reg] ?? 1;
      s.talent[reg] = clamp(t - (drain[reg] ?? 0) + (1 - t) * 0.03, 0.2, 1);
    }
    // poaching: when a pool runs low where you have labs
    const poachable = REGION_IDS.filter((reg) => (s.talent[reg] ?? 1) < 0.6 && s.facilities.some((f) => f.type === 'lab' && f.status === 'online' && BUILD_SITES.find((x) => x.id === f.siteId)?.region === reg));
    if (poachable.length && rand(s) < 0.25 && s.day - (s.events.last['poaching'] ?? -999) > 240) {
      const reg = pick(s, poachable);
      const lab = s.facilities.find((f) => f.type === 'lab' && BUILD_SITES.find((x) => x.id === f.siteId)?.region === reg)!;
      queueEvent(s, 'poaching', { region: reg, site: lab.siteId, rival: pick(s, ['meridian', 'lattice', 'orchard']) });
    }
  }

  // startups for sale
  s.startups.offers = s.startups.offers.filter((o) => o.expires >= s.day);
  if (s.day >= s.startups.nextOffer) {
    s.startups.nextOffer = s.day + randInt(s, 150, 260);
    const taken = new Set([...s.startups.bought, ...s.startups.offers.map((o) => o.def)]);
    const options = STARTUPS.filter((x) => !taken.has(x.id) && x.phase <= Math.max(1, s.phase));
    if (options.length && s.startups.offers.length < 2) {
      const def = pick(s, options);
      const price = def.price * (0.85 + rand(s) * 0.3) * Math.pow(1.1, Math.max(0, yearsElapsed(s.day) - 2.2));
      s.startups.offers.push({ id: nextId(s, 'su'), def: def.id, price, expires: s.day + 150 });
      news(s, `🦄 ${def.name} is for sale (${fmtMoney(price)}): ${STARTUP_BY_ID[def.id].gives}.`, 'event');
    }
  }
}
