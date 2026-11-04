/**
 * A ready-made Act IV world for renderer previews and tests: the "Start at Act III" company moved on
 * to ~2062 with a planet in progress — supergrid links built and building, fusion fleets of several
 * designs, carbon capture, rectennas, orbital data centres, a spaceport, a Moon base and AI provinces.
 * Not a balanced game state: just enough of everything to draw.
 */
import { CONTRACT_KINDS } from '../content/charter';
import type { ContractKind, ContractSize, FusionDesignId, GameState, Project } from './types';
import { newAct3Game } from './act3';
import { createPlanet } from './planetInit';
import { refreshStats } from './tick';
import { SITE_BY_ID } from '../content/sites';

export function act4PreviewState(opts: { stage?: number; moon?: number } = {}): GameState {
  const s = newAct3Game({ name: 'Preview Labs', homeSite: 'bay-area', seed: 7 });
  s.events.active = null;
  s.events.queue = [];
  s.events.scheduled = [];
  const c = s.charter!;
  c.phase = 6;
  c.renewal = { day: s.day, yes: 80, no: 20, outcome: 'planetary' };
  c.threshold = { startDay: s.day, endDay: s.day, fronts: { grid: { pressure: 0, lost: false }, frontier: { pressure: 0, lost: false }, council: { pressure: 0, lost: false } }, lab: 'meridian', faction: 'eastern', done: true, held: 3 };
  s.day = 12_800; // ~2062
  s.act = 4;
  s.flags.act3Complete = s.day - 6000;
  s.flags.launchSite = 'launch-guiana';
  s.flags.orbitalTest = s.day - 5000;
  s.flags.spaceSolar = s.day - 4800;
  s.planet = createPlanet(s);
  const pl = s.planet;
  pl.stage = opts.stage ?? 3;
  let n = 0;
  const add = (kind: ContractKind, where: string, size: ContractSize, progress = 1, opt?: string, builder?: string): Project => {
    const def = CONTRACT_KINDS[kind];
    const region = SITE_BY_ID[where]?.region ?? (where.length === 3 ? (where as Project['region']) : 'eur');
    const days = def.days[size - 1];
    const p: Project = {
      id: `pv${n++}`, kind, size, where, region, builder: builder ?? def.bidders[0] ?? 'halcyon', value: 1e9, price: 1e8, paid: 1e8, arrears: 0,
      startDay: s.day - days, days, promised: days, progress: progress * days, status: progress >= 1 ? 'done' : 'building', troubles: 0,
      gw: def.cat === 'energy' || kind === 'ffleet' || kind === 'sps' ? def.sizes[size - 1] * (kind === 'ffleet' ? 0.85 : 1) : undefined, opt,
    };
    if (p.status === 'done') p.doneDay = s.day - 30;
    c.projects.push(p);
    return p;
  };
  // Act III foundations
  add('launch', 'launch-guiana', 1, 1, undefined, 'parabola');
  add('solar', 'mega-sahara', 3);
  add('solar', 'mega-outback', 3);
  add('wind', 'mega-northsea', 3, 1, undefined, 'tidewater');
  add('hvdc', 'hvdc-sahara', 3, 1, undefined, 'spanwire');
  add('hvdc', 'hvdc-gulf', 2, 1, undefined, 'spanwire');
  // the supergrid
  add('link', 'sg-atlantic', 3, 1, undefined, 'spanwire');
  add('link', 'sg-steppe', 2, 1, undefined, 'halcyon');
  add('link', 'sg-silk', 2, 1, undefined, 'spanwire');
  add('link', 'sg-sahel', 2, 1, undefined, 'halcyon');
  add('link', 'sg-scs', 2, 0.55, undefined, 'tidewater');
  add('link', 'sg-bering', 1, 0.2, undefined, 'spanwire');
  // fusion fleets of every design that won
  const fleets: [string, FusionDesignId, ContractSize, number][] = [
    ['mega-plains', 'tokamak', 3, 1], ['mega-pacific', 'tokamak', 2, 1], ['mega-siberia', 'stellarator', 2, 1],
    ['mega-deccan', 'laser', 2, 1], ['mega-gobi', 'pinch', 2, 0.6], ['mega-kalahari', 'stellarator', 1, 0.3],
  ];
  for (const [site, d, size, prog] of fleets) {
    add('ffleet', site, size, prog, d, d === 'stellarator' ? 'twistfield' : d === 'laser' ? 'kindle' : d === 'pinch' ? 'quickpinch' : 'sunforge');
    pl.fusion[d] = { status: 'won', tries: 1, resolvedDay: s.day - 2000 };
  }
  // climate repair, water, space
  add('dac', 'mega-sahara', 2, 1, undefined, 'carbonfold');
  add('dac', 'mega-outback', 1, 0.5, undefined, 'carbonfold');
  add('desal', 'mena', 2, 1);
  add('spaceport', 'launch-guiana', 2, 1, undefined, 'parabola');
  add('odc', 'global', 2, 1, undefined, 'parabola');
  add('odc', 'global', 1, 0.4, undefined, 'karman');
  add('sps', 'sas', 2, 1, undefined, 'karman');
  add('sps', 'ssa', 1, 0.5, undefined, 'parabola');
  const moon = opts.moon ?? 2;
  if (moon >= 1) add('moonbase', 'global', 1, 1, undefined, 'parabola');
  if (moon >= 2) add('moonmine', 'global', 1, 1, undefined, 'deepvein');
  if (moon >= 3) add('massdriver', 'global', 1, 1, undefined, 'karman');
  else add(moon === 2 ? 'massdriver' : moon === 1 ? 'moonmine' : 'moonbase', 'global', 1, 0.45, undefined, 'karman');
  // AIs run some provinces; the hot ones are struggling
  pl.provinces.mena.ai = 'apex';
  pl.provinces.eur.ai = 'weft';
  pl.provinces.ssa.ai = 'sapling';
  pl.provinces.sas.ai = 'bit';
  pl.provinces.sas.heat = 88;
  pl.provinces.mena.heat = 92;
  pl.provinces.seo.wellbeing = 38;
  pl.debris = { leo: 46, geo: 18, cis: 6 };
  c.world.tw = 70;
  refreshStats(s);
  return s;
}
