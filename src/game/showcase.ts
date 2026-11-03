import { newGame } from '../sim/state';
import { refreshStats } from '../sim/tick';
import { nextId } from '../sim/core';
import { planShipment, type SimContext } from '../sim/supply';
import type { FacilityType, GameState } from '../sim/types';

/** Campuses shown off behind the main menu. */
const CAMPUSES: Record<string, FacilityType[]> = {
  'west-texas': ['datacenter', 'solar', 'battery', 'wind', 'gas'],
  'columbia-gorge': ['datacenter', 'wind', 'lab', 'battery'],
  mojave: ['solar', 'solar', 'battery', 'datacenter'],
  'gulf-coast': ['datacenter', 'solar', 'battery', 'gas', 'datacenter'],
  lulea: ['datacenter', 'wind', 'datacenter'],
  kyushu: ['datacenter', 'lab', 'battery'],
  atacama: ['solar', 'battery', 'datacenter', 'solar'],
  'kenyan-rift': ['datacenter', 'solar', 'lab'],
  iberia: ['solar', 'wind', 'datacenter', 'battery'],
  hokkaido: ['wind', 'datacenter', 'battery'],
};

const SHIPMENTS: [string, string, 'sea' | 'air'][] = [
  ['lumen-hsinchu', 'west-texas', 'sea'],
  ['lumen-hsinchu', 'gulf-coast', 'sea'],
  ['kestrel-magdeburg', 'lulea', 'sea'],
  ['lumen-phoenix', 'iberia', 'sea'],
  ['kestrel-ohio', 'atacama', 'sea'],
  ['lumen-hsinchu', 'kenyan-rift', 'sea'],
  ['lumen-hsinchu', 'mojave', 'air'],
  ['kestrel-ohio', 'kyushu', 'sea'],
];

/** A thriving demo company for the menu's cinematic tour. Never saved. */
export function makeShowcase(ctx: SimContext): GameState {
  const s = newGame({ name: 'The Kardashev Project', homeSite: 'bay-area', seed: 2027 });
  s.day = 900;
  s.events.active = null;
  for (const [site, types] of Object.entries(CAMPUSES)) {
    for (const type of types) {
      s.facilities.push({
        id: nextId(s, 'f'),
        type,
        siteId: site,
        status: 'online',
        progress: 1,
        buildDays: 1,
        startedDay: 0,
        onlineDay: 0,
        racks: type === 'datacenter' ? [{ qty: 7600, perf: 3.4, kw: 1.25, supplier: 'lumen' }] : undefined,
      });
    }
    s.sites[site].grid.mw = 20;
  }
  // one construction site for the cranes
  s.facilities.push({ id: nextId(s, 'f'), type: 'datacenter', siteId: 'hokkaido', status: 'building', progress: 120, buildDays: 400, startedDay: 0 });
  s.facilities.push({ id: nextId(s, 'f'), type: 'gas', siteId: 'columbia-gorge', status: 'building', progress: 300, buildDays: 700, startedDay: 0 });
  s.links.push({ id: nextId(s, 'l'), a: 'west-texas', b: 'mojave', km: 1429, status: 'online', progress: 1, buildDays: 1, capacityMW: 1000, lossPct: 8.6 });
  s.models.push({ name: 'Bit-1', gen: 1, flop: 1e24, capability: 1, day: 20 }, { name: 'Bit-2', gen: 2, flop: 2e26, capability: 3.6, day: 600 });
  SHIPMENTS.forEach(([from, dest, mode], i) => {
    const plan = planShipment(s, ctx, from, dest, mode);
    const sea = Math.max(4, Math.round(plan.seaDays));
    const land = Math.max(1, Math.round(plan.landDays));
    const start = s.day - Math.round((i / SHIPMENTS.length) * sea);
    s.shipments.push({
      id: nextId(s, 'sh'),
      orderId: 'demo',
      batch: { qty: 2000, perf: 3.4, kw: 1.25, supplier: 'lumen' },
      from,
      dest,
      mode,
      departDay: start,
      portDay: start + sea,
      arriveDay: start + sea + land,
      route: plan.route,
      overland: plan.overland,
      chokepoints: plan.chokepoints,
      delayed: false,
    });
  });
  refreshStats(s);
  return s;
}

/** Keep demo ships sailing forever: when one arrives, send it out again. */
export function loopShowcaseShips(s: GameState): void {
  for (const sh of s.shipments) {
    if (s.day < sh.arriveDay) continue;
    const span = sh.arriveDay - sh.departDay;
    sh.departDay = s.day;
    sh.portDay = s.day + (sh.portDay - (sh.arriveDay - span));
    sh.arriveDay = s.day + span;
  }
}
