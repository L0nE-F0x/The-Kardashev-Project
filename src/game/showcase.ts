import { newGame } from '../sim/state';
import { refreshStats } from '../sim/tick';
import { nextId } from '../sim/core';
import { planShipment, type SimContext } from '../sim/supply';
import type { FacilityType, GameState } from '../sim/types';

/** Campuses shown off behind the main menu (Act II, phase 3: tiers, firm power, a gigawatt campus). */
const CAMPUSES: Record<string, (FacilityType | [FacilityType, number])[]> = {
  'west-texas': [['datacenter', 2], ['solar', 2], ['battery', 2], 'wind', 'gas', ['datacenter', 2]],
  'columbia-gorge': [['datacenter', 2], 'wind', 'lab', 'battery', 'hydro'],
  mojave: [['solar', 3], ['solar', 2], ['battery', 3], ['datacenter', 3]],
  'gulf-coast': [['datacenter', 2], ['solar', 2], 'battery', 'gas', 'datacenter'],
  lulea: [['datacenter', 3], 'wind', 'hydro', 'datacenter'],
  kyushu: ['datacenter', 'lab', 'battery', 'geothermal'],
  atacama: [['solar', 2], 'battery', 'datacenter', 'solar'],
  'kenyan-rift': [['datacenter', 2], 'solar', 'lab', ['geothermal', 2]],
  iberia: ['solar', 'wind', 'datacenter', 'battery'],
  hokkaido: ['wind', 'datacenter', 'battery'],
  lakeshore: ['restart', ['datacenter', 2], 'battery'],
  wyoming: ['campus', ['wind', 3], ['solar', 2], ['battery', 2], 'smr', 'packaging'],
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
  s.day = 1900;
  s.events.active = null;
  s.act = 2;
  s.phase = 3;
  for (const [site, list] of Object.entries(CAMPUSES)) {
    for (const entry of list) {
      const [type, tier] = Array.isArray(entry) ? entry : [entry, 1];
      const hall = type === 'datacenter' || type === 'campus';
      const units = type === 'campus' ? 600_000 : 7600 * (tier === 3 ? 20 : tier === 2 ? 5 : 1);
      s.facilities.push({
        id: nextId(s, 'f'),
        type,
        siteId: site,
        status: 'online',
        progress: 1,
        buildDays: 1,
        startedDay: 0,
        onlineDay: 0,
        tier,
        racks: hall ? [{ qty: Math.round(units * 0.9), perf: 3.4, kw: 1.25, supplier: 'lumen' }] : undefined,
      });
    }
    s.sites[site].grid.mw = 20;
  }
  s.sites.wyoming.extraSlots = 2;
  // the networks: leased cables, one of your own being laid, fiber across the continent
  s.network.leases = ['c-pacific', 'c-atlantic', 'c-ella', 'c-asiapac'];
  s.network.own.push({ id: 'oc-demo', a: 'cls-mumbai', b: 'cls-singapore', status: 'building', progress: 300, buildDays: 730 });
  s.network.fiber.push(
    { id: 'fb-demo1', a: 'mojave', b: 'west-texas', km: 1429, status: 'online', progress: 1, buildDays: 1 },
    { id: 'fb-demo2', a: 'west-texas', b: 'wyoming', km: 1250, status: 'online', progress: 1, buildDays: 1 },
    { id: 'fb-demo3', a: 'columbia-gorge', b: 'wyoming', km: 1300, status: 'online', progress: 1, buildDays: 1 },
  );
  // the competition next door
  s.rivalBuilds.push(
    { id: 'rb-demo1', owner: 'meridian', siteId: 'wyoming', slots: 2, itMW: 300, status: 'online', startDay: 0, readyDay: 0 },
    { id: 'rb-demo2', owner: 'lattice', siteId: 'n-virginia', slots: 1, itMW: 150, status: 'online', startDay: 0, readyDay: 0 },
    { id: 'rb-demo3', owner: 'orchard', siteId: 'iberia', slots: 1, itMW: 100, status: 'building', startDay: 0, readyDay: 2400 },
    { id: 'rb-demo4', owner: 'meridian', siteId: 'gulf-coast', slots: 1, itMW: 200, status: 'online', startDay: 0, readyDay: 0 },
  );
  // one construction site for the cranes
  s.facilities.push({ id: nextId(s, 'f'), type: 'datacenter', siteId: 'hokkaido', status: 'building', progress: 120, buildDays: 400, startedDay: 0 });
  s.facilities.push({ id: nextId(s, 'f'), type: 'gas', siteId: 'columbia-gorge', status: 'building', progress: 300, buildDays: 700, startedDay: 0 });
  s.links.push({ id: nextId(s, 'l'), a: 'west-texas', b: 'mojave', km: 1429, status: 'online', progress: 1, buildDays: 1, capacityMW: 1000, lossPct: 8.6 });
  s.models.push(
    { name: 'Bit-1', gen: 1, flop: 1e24, capability: 1, day: 20 },
    { name: 'Bit-2', gen: 2, flop: 2e26, capability: 3.6, day: 600 },
    { name: 'Bit-3', gen: 3, flop: 1e27, capability: 4.6, day: 1300 },
  );
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
