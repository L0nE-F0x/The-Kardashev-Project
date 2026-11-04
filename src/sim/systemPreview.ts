/**
 * A ready-made Act V world for renderer previews and tests: the Act IV preview moved on to ~2085
 * with the system in progress — foundries at the Moon, the yards and the asteroids, claims, the swarm
 * half lit, compute rings and habitats, beams to Earth, gardened and forged provinces, a habitat at L5.
 * Not a balanced game state: just enough of everything to draw.
 */
import { CONTRACT_KINDS } from '../content/charter';
import type { ContractKind, ContractSize, GameState, Project } from './types';
import { act4PreviewState } from './planetPreview';
import { createSystem } from './systemInit';
import { refreshStats } from './tick';

export interface Act5PreviewOpts {
  /** System stage (default 2). */
  stage?: number;
  /** Swarm collectors, TW (default 1,200: about seven arcs lit). */
  collectors?: number;
  /** Run Solar Maximum with this storm pressure (0..100). */
  storm?: number;
  /** A strain drifting at the L4 yards (0..100). */
  drift?: number;
  /** K has reached 1.0000. */
  typeI?: boolean;
}

export function act5PreviewState(opts: Act5PreviewOpts = {}): GameState {
  const s = act4PreviewState({ stage: 3, moon: 3 });
  const c = s.charter!;
  s.day = 21_000; // ~2084
  s.act = 5;
  s.flags.act4Complete = s.day - 5000;
  s.planet!.stage = 5;
  s.planet!.heatwall = { startDay: s.day - 5200, endDay: s.day - 5080, fronts: { heat: { pressure: 30, lost: false }, cascade: { pressure: 20, lost: false }, controls: { pressure: 40, lost: false } }, ai: 'apex', regions: ['mena', 'sas'], done: true, held: 3 };
  s.system = createSystem(s);
  const sy = s.system;
  sy.stage = opts.stage ?? 2;
  sy.thermalLine = 1.0;
  sy.ownership = 'concessions';
  sy.earth = 'provinces';
  sy.longevity = 'everyone';
  sy.seat = sy.stage >= 2 ? 'advisory' : null;
  sy.settlement = sy.stage >= 3 ? 'settle' : null;
  sy.minds = 0.55;
  let n = 0;
  const found = (site: string, cap: number, owner = 'charter', drift = 0) => sy.foundries.push({ id: `fd${n++}`, site, cap, founded: s.day - 2000, owner, drift, haltedUntil: 0 });
  found('moon', 6);
  found('l4', 14, 'vonn', opts.drift ?? 0);
  found('l5', 9);
  found('bennu', 3, 'lodestar');
  found('eros', 7);
  found('da1986', 4, 'vonn');
  for (const id of ['bennu', 'eros', 'da1986']) sy.asteroids[id] = { status: 3, owner: id === 'eros' ? 'charter' : id === 'bennu' ? 'lodestar' : 'vonn' };
  for (const id of ['ryugu', 'itokawa']) sy.asteroids[id] = { status: 2, owner: id === 'ryugu' ? 'eam' : 'charter' };
  for (const id of ['apophis', 'didymos', 'psyche']) sy.asteroids[id] = { status: 1, owner: null };
  sy.collectors = opts.collectors ?? 1200;
  sy.rings = sy.collectors * 0.5;
  sy.habitat = sy.collectors * 0.35;
  sy.beams = 140;
  sy.spacePop = 42;
  sy.lifeExp = 96;
  sy.lifeRate = 1.1;
  sy.escape = s.day - 300;
  sy.mindsMood = 64;
  const garden: Record<string, number> = { eur: 70, nor: 85, lat: 55, atl: 30, pac: 40, stp: 10, eam: -20, fab: -45, sas: -10, seo: 20, mena: -60, ssa: 35 };
  for (const r of Object.keys(garden)) sy.garden[r as keyof typeof sy.garden] = garden[r];
  for (const r of Object.keys(sy.treated)) sy.treated[r as keyof typeof sy.treated] = 40 + ((r.charCodeAt(0) * 7) % 50);
  const add = (kind: ContractKind, where: string, size: ContractSize, progress = 1, builder?: string): Project => {
    const def = CONTRACT_KINDS[kind];
    const days = def.days[size - 1];
    const p: Project = {
      id: `pv5${n++}`, kind, size, where, region: where.length === 3 ? (where as Project['region']) : 'eur', builder: builder ?? def.bidders[0] ?? 'halcyon', value: 1e9, price: 1e8, paid: 1e8, arrears: 0,
      startDay: s.day - days, days, promised: days, progress: progress * days, status: progress >= 1 ? 'done' : 'building', troubles: 0,
    };
    if (p.status === 'done') p.doneDay = s.day - 30;
    c.projects.push(p);
    return p;
  };
  add('beam', 'mena', 2);
  add('beam', 'sas', 1);
  add('beam', 'eam', 2, 0.6);
  add('rewild', 'eur', 2);
  add('clinic', 'ssa', 2);
  add('habitat', 'global', 2, 1, 'halcyon');
  add('habitat', 'global', 1, 0.5, 'karman');
  if (sy.stage >= 3) {
    add('mercury', 'global', 1, 0.6, 'karman');
    sy.mercury = 1;
  }
  if (opts.storm !== undefined) {
    sy.stage = 4;
    sy.damage = 0.25;
    sy.solarmax = { startDay: s.day - 40, endDay: s.day + 80, fronts: { storm: { pressure: opts.storm, lost: false }, thermal: { pressure: 35, lost: false }, minds: { pressure: 50, lost: false } }, ai: 'bit', foundry: 'fd1', done: false };
  }
  if (opts.typeI) {
    sy.stage = 5;
    sy.collectors = 9500;
    sy.rings = 5000;
    sy.habitat = 3500;
    sy.typeI = s.day;
    sy.bitFate = 'costeward';
  }
  refreshStats(s);
  return s;
}
