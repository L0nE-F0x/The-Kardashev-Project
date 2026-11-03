/**
 * Act III fixtures for headless previews: a company in the Charter era with megaprojects at a
 * chosen stage, HVDC links, a launch complex and public compute campuses. Built directly (no sim
 * ticks), so render previews don't depend on game balance.
 */
import { newAct2Game } from '../../src/sim/act2';
import { createCharter } from '../../src/sim/charterInit';
import { CONTRACT_KINDS, HVDC_ROUTES } from '../../src/content/charter';
import { LAUNCH_SITES, MEGA_SITES } from '../../src/content/sites';
import type { ContractKind, ContractSize, GameState, Project } from '../../src/sim/types';
import type { RegionId } from '../../src/content/mapcodes';

let n = 0;
function project(kind: ContractKind, where: string, region: RegionId, builder: string, status: 'building' | 'done', size: ContractSize = 2, progress = 0.5): Project {
  const def = CONTRACT_KINDS[kind];
  const days = def.days[size - 1];
  return {
    id: `fx${++n}`, kind, size, where, region, builder, value: 1e10, price: 2e9, paid: 0, arrears: 0, startDay: 3000, days, promised: days,
    progress: status === 'done' ? days : Math.round(days * progress), status, troubles: 0,
    gw: def.cat === 'energy' ? def.sizes[size - 1] : undefined,
  };
}

/**
 * stage 0: the Charter just founded (nothing built) · 1: early build-out · 2: mid-act · 3: everything at full scale.
 */
export function act3Fixture(stage: 0 | 1 | 2 | 3 = 2): GameState {
  const s = newAct2Game({ name: 'Fixture Labs', homeSite: 'n-virginia', seed: 5 });
  s.day = 3100 + stage * 700;
  s.act = 3;
  s.phase = 5;
  s.flags.act2Complete = 2900;
  s.flags.act2Shown = true;
  s.charter = createCharter(s);
  const c = s.charter;
  c.phase = stage === 0 ? 1 : stage === 1 ? 2 : 3;
  const builders = ['halcyon', 'brightwater', 'littlesun', 'saltflat', 'tidewater', 'deepvein', 'you'];
  MEGA_SITES.forEach((m, i) => {
    const kinds = m.mega ?? ['solar'];
    if (stage === 0) {
      if (i < 3) c.projects.push(project(kinds[0], m.id, m.region, builders[i % builders.length], 'building', 1, 0.3));
      return;
    }
    // stage 1: ~25 GW, stage 2: ~100 GW, stage 3: 200+ GW of each site's main kind, plus a second kind building
    const sizes: ContractSize[] = stage === 1 ? [1] : stage === 2 ? [3] : [3, 3];
    for (const sz of sizes) c.projects.push(project(kinds[0], m.id, m.region, builders[i % builders.length], 'done', sz));
    if (kinds[1]) c.projects.push(project(kinds[1], m.id, m.region, builders[(i + 2) % builders.length], stage === 3 ? 'done' : 'building', 2, 0.6));
  });
  if (stage >= 1) {
    HVDC_ROUTES.forEach((r, i) => {
      if (stage === 1 && i > 1) return;
      c.projects.push(project('hvdc', r.id, r.from, i % 2 ? 'halcyon' : 'spanwire', stage >= 2 && i < 4 ? 'done' : 'building', 2, 0.4 + i * 0.1));
    });
    c.projects.push(project('launch', LAUNCH_SITES[0].id, LAUNCH_SITES[0].region, 'parabola', stage >= 2 ? 'done' : 'building', 1, 0.6));
    const anchorsAt: RegionId[] = ['ssa', 'sas', 'lat', 'seo', 'mena'];
    anchorsAt.forEach((r, i) => c.projects.push(project(i % 2 ? 'cable' : 'compute', r, r, ['cumulus', 'stratum', 'orchard', 'tidewater', 'you'][i], stage >= 2 ? 'done' : 'building', 2, 0.5)));
    c.projects.push(project('fab', 'sas', 'sas', 'kestrel', stage >= 2 ? 'done' : 'building', 1));
    c.projects.push(project('hbm', 'eam', 'eam', 'hanbit', 'building', 1, 0.7));
  }
  if (stage >= 2) c.projects.push(project('orbital', 'global', 'atl', 'parabola', 'done', 1));
  if (stage >= 3) {
    c.projects.push(project('spacesolar', 'global', 'atl', 'karman', 'done', 1));
    s.flags.liftoff = s.day - 2;
  }
  c.world.charterTW = c.projects.filter((p) => p.status === 'done').reduce((a, p) => a + (p.gw ?? 0), 0) / 1000;
  return s;
}
