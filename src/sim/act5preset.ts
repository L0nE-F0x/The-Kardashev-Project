/**
 * "Start at Act V": the Act IV preset with a quarter-century of the planet compressed into it — January
 * 2068, the Heat Wall held on every front, a Planetary Charter, the supergrid joining every province,
 * fusion fleets of three designs, Shackleton Base with its mass driver, four AI provinces and Bit-9.
 * Set up directly (no fast-forward), so it opens instantly.
 */
import { CONTRACT_KINDS } from '../content/charter';
import { FUSION_DESIGNS, PROVINCE0, SUPERGRID_ROUTES } from '../content/planet';
import { CHARTER } from '../content/charter';
import { OBJECTIVES } from '../content/objectives';
import { SITE_BY_ID, MEGA_SITES, LAUNCH_SITES } from '../content/sites';
import { TECHS } from '../content/techs';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { ContractKind, ContractSize, FusionDesignId, GameState } from './types';
import { newAct4Game } from './act4preset';
import { beginAct5 } from './act5';
import { refreshStats } from './tick';
import { nextModelPlan } from './ai';
import { algoEff, capabilityOf } from './model';
import { techMult } from './effects';
import { charterTW } from './world';
import type { NewGameOptions } from './state';
import type { SimContext } from './supply';

export const ACT5_START_DAY = Math.round((Date.UTC(2068, 0, 1) - Date.UTC(2027, 0, 1)) / 86_400_000);

export function newAct5Game(opts: NewGameOptions, ctx: SimContext): GameState {
  const s = newAct4Game(opts, ctx);
  const c = s.charter!;
  const pl = s.planet!;
  s.events.active = null;
  s.events.queue = [];
  s.events.scheduled = [];
  s.news = [];
  s.modifiers = s.modifiers.filter((m) => m.until > 99_000);
  const add = (kind: ContractKind, where: string, size: ContractSize, builder: string, opt?: string) => {
    const def = CONTRACT_KINDS[kind];
    const region = (SITE_BY_ID[where]?.region ?? (REGION_IDS.includes(where as RegionId) ? where : SUPERGRID_ROUTES.find((r) => r.id === where)?.from ?? 'eur')) as RegionId;
    const days = def.days[size - 1];
    const cf = kind === 'ffleet' ? FUSION_DESIGNS[(opt ?? 'tokamak') as FusionDesignId].cf : 1;
    c.projects.push({
      id: `p5${c.projects.length}`, kind, size, where, region, builder, value: 1e9, price: 0, paid: 0, arrears: 0,
      startDay: ACT5_START_DAY - 2000, days, promised: days, progress: days, status: 'done', doneDay: ACT5_START_DAY - 1000, troubles: 0,
      gw: def.cat === 'energy' || kind === 'ffleet' || kind === 'sps' ? def.sizes[size - 1] * cf : undefined, opt,
    });
  };
  // a quarter-century of the planet, compressed: the big Act IV results without playing them
  s.day = ACT5_START_DAY;
  for (const r of SUPERGRID_ROUTES) add('link', r.id, 2, r.subsea ? 'tidewater' : 'spanwire');
  const fleets: [string, FusionDesignId, ContractSize][] = [
    ['mega-plains', 'tokamak', 3], ['mega-pacific', 'tokamak', 3], ['mega-sahara', 'tokamak', 3], ['mega-siberia', 'stellarator', 3], ['mega-deccan', 'stellarator', 3],
    ['mega-gobi', 'tokamak', 3], ['mega-kalahari', 'stellarator', 3], ['mega-outback', 'dhe3', 3], ['mega-nordic', 'dhe3', 2], ['mega-northsea', 'stellarator', 3],
    ['mega-plains', 'stellarator', 3], ['mega-pacific', 'tokamak', 3], ['mega-sahara', 'stellarator', 3], ['mega-deccan', 'tokamak', 3], ['mega-gobi', 'stellarator', 3],
    ['mega-siberia', 'tokamak', 3], ['mega-kalahari', 'tokamak', 3], ['mega-outback', 'tokamak', 3], ['mega-cascadia', 'stellarator', 3], ['mega-patagonia', 'tokamak', 3],
    ['mega-plains', 'dhe3', 3], ['mega-sahara', 'dhe3', 3], ['mega-deccan', 'dhe3', 3], ['mega-gobi', 'tokamak', 3], ['mega-pacific', 'stellarator', 3],
  ];
  const megaIds = new Set(MEGA_SITES.map((m) => m.id));
  for (const [site, d, size] of fleets) add('ffleet', megaIds.has(site) ? site : MEGA_SITES[0].id, size, FUSION_DESIGNS[d].partner, d);
  pl.fusion.tokamak = { status: 'won', tries: 1, resolvedDay: ACT5_START_DAY - 7000 };
  pl.fusion.stellarator = { status: 'won', tries: 1, resolvedDay: ACT5_START_DAY - 6000 };
  pl.fusion.laser = { status: 'partial', tries: 2, resolvedDay: ACT5_START_DAY - 5000 };
  pl.fusion.pinch = { status: 'failed', tries: 1, resolvedDay: ACT5_START_DAY - 6500 };
  pl.fusion.dhe3 = { status: 'won', tries: 1, resolvedDay: ACT5_START_DAY - 2500 };
  pl.tritium = 4000;
  for (const m of ['mega-sahara', 'mega-outback', 'mega-kalahari', 'mega-gobi', 'mega-deccan']) if (megaIds.has(m)) add('dac', m, 3, 'carbonfold');
  for (const r of ['mena', 'sas', 'ssa', 'seo', 'eam'] as RegionId[]) add('desal', r, 2, 'brightwater');
  const port = String(s.flags.launchSite ?? LAUNCH_SITES[0].id);
  add('spaceport', port, 2, 'parabola');
  add('spaceport', port, 2, 'parabola');
  for (let i = 0; i < 3; i++) add('odc', 'global', 2, i ? 'karman' : 'parabola');
  for (const r of ['sas', 'ssa', 'eam'] as RegionId[]) add('sps', r, 2, 'karman');
  add('moonbase', 'global', 1, 'parabola');
  add('moonmine', 'global', 1, 'deepvein');
  add('massdriver', 'global', 1, 'karman');
  add('cleanup', 'global', 2, 'karman');
  add('evals', 'global', 3, 'lattice');
  add('interp', 'global', 3, 'lattice');
  c.regime.alignment += 1.2;
  // the world: ~100 TW, warming held near 1.85 °C, every province doing all right
  const own = charterTW(s);
  const total = REGION_IDS.reduce((a, r) => a + c.world.blocs[r].tw, 0);
  const target = 100 - own;
  for (const r of REGION_IDS) {
    const b = c.world.blocs[r];
    b.tw *= target / Math.max(1, total);
    b.clean = Math.max(b.clean, 0.88);
  }
  c.world.tw = REGION_IDS.reduce((a, r) => a + c.world.blocs[r].tw, 0);
  c.world.charterTW = own;
  c.world.carbonGt = CHARTER.carbon0 - (1.85 - 1.45) / 0.0011;
  for (const r of REGION_IDS) {
    const p = pl.provinces[r];
    p.pop = PROVINCE0[r].pop * 1.12;
    p.wellbeing = Math.max(62, p.wellbeing + 14);
  }
  pl.provinces.sas.ai = 'bit';
  pl.provinces.eur.ai = 'weft';
  pl.provinces.ssa.ai = 'sapling';
  pl.provinces.mena.ai = 'apex';
  for (const r of ['sas', 'eur', 'ssa', 'mena'] as RegionId[]) pl.provinces[r].aiSince = ACT5_START_DAY - 3000;
  pl.ais.bit.trust = 72;
  pl.ais.weft.trust = 68;
  pl.ais.sapling.trust = 56;
  pl.ais.apex.trust = 52;
  pl.bitBond = 30;
  pl.bitArc = 3;
  pl.debris = { leo: 26, geo: 12, cis: 8 };
  pl.powers = 'planetary';
  pl.company = 'utility';
  pl.stage = 5;
  pl.planOpen = false;
  pl.heatwall = { startDay: ACT5_START_DAY - 900, endDay: ACT5_START_DAY - 780, fronts: { heat: { pressure: 60, lost: false }, cascade: { pressure: 45, lost: false }, controls: { pressure: 55, lost: false } }, ai: 'apex', regions: ['mena', 'sas', 'seo'], done: true, held: 3 };
  // the company became the public AI utility at the Mandate: it runs like a permanent blind trust
  c.blindTrust = true;
  c.trustDay = ACT5_START_DAY - 8000;
  s.capital.board = null;
  c.council.passed = [...new Set([...c.council.passed, 'ai-charters', 'planetary-powers', 'debris-rules', 'he3-sharing'])];
  c.council.walkouts = {};
  c.council.late = {};
  c.legitimacy = 72;
  c.capital = 50;
  c.budget = 2.5e12;
  s.research.done = TECHS.filter((t) => (t.act ?? 1) <= 4).map((t) => t.id);
  s.objectives.done = OBJECTIVES.filter((o) => (o.act ?? 1) <= 4 && !o.live).map((o) => o.id);
  // the utility kept training: Bit-8 and Bit-9
  s.training = null;
  const eff = algoEff(s);
  for (const day of [ACT5_START_DAY - 5000, ACT5_START_DAY - 1500]) {
    if (s.models.length >= 9) break;
    const plan = nextModelPlan(s);
    s.models.push({ name: plan.name, gen: plan.gen, flop: plan.flop, capability: capabilityOf(plan.flop, eff), day });
  }
  while (s.models.length < 9) {
    const plan = nextModelPlan(s);
    s.models.push({ name: plan.name, gen: plan.gen, flop: plan.flop, capability: capabilityOf(plan.flop, eff), day: ACT5_START_DAY - 400 });
  }
  const cap = s.models[s.models.length - 1].capability;
  s.safety.cumFlop = Math.max(s.safety.cumFlop, Math.pow(10, cap + 22 + 0.1) / techMult(s, 'safetyEff'));
  for (let n = 0; n <= 4; n++) s.flags[`stage${n}Day`] ??= ACT5_START_DAY - 6000 + n * 1000;
  Object.assign(s.flags, { act4Complete: s.day, act4Shown: true, act4EndQueued: true });
  s.meta.act5Start = true;
  refreshStats(s);
  beginAct5(s);
  s.events.active = s.events.queue.shift() ?? null;
  if (s.events.active) s.events.last[s.events.active.id] = s.day;
  return s;
}
