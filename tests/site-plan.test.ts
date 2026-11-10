/**
 * The site planner (render3d/campus/plan.ts, plan5.ts): which set pieces a view-only place shows for a given
 * world. Pure, so it runs without a browser; tests/render3d-layout.test.ts checks the places built from it.
 */
import { describe, expect, it } from 'vitest';
import { act3Key, act3Plan } from '../src/render3d/campus/plan';
import { driftLevel, ringRacks, stormLevel, yardModules } from '../src/render3d/campus/plan5';
import { BLOC_ORDER, blocBannerAt, dacBlocks } from '../src/render3d/campus/planKit';
import { LAUNCH_SITES, MEGA_SITES, MOON_SITE, SPACE_SITES, siteDef } from '../src/content/sites';
import { ASTEROIDS } from '../src/content/system';
import { megaView } from '../src/sim/charterView';
import { orbitView } from '../src/sim/planetView';
import { act4PreviewState } from '../src/sim/planetPreview';
import { act5PreviewState, type Act5PreviewOpts } from '../src/sim/systemPreview';
import type { AsteroidType, GameState } from '../src/sim/types';
import { act3Fixture } from './helpers/act3fixture';

const world = (o: Act5PreviewOpts = {}, edit?: (s: GameState) => void) => {
  const s = act5PreviewState(o);
  edit?.(s);
  return s;
};
const capAt = (site: string, cap: number) => (s: GameState) => {
  const f = s.system!.foundries.find((x) => x.site === site);
  if (f) f.cap = cap;
  else s.system!.foundries.push({ id: `t5-${site}`, site, cap, founded: s.day - 100, owner: 'charter', drift: 0, haltedUntil: 0 });
};
/** An asteroid at a status (3 adds a foundry of `cap`). */
const rock = (id: string, status: 0 | 1 | 2 | 3, cap = 4, owner = 'lodestar') => (s: GameState) => {
  s.system!.asteroids[id] = { status, owner: status >= 2 ? owner : null };
  s.system!.foundries = s.system!.foundries.filter((f) => f.site !== id);
  if (status === 3) s.system!.foundries.push({ id: `t5-${id}`, site: id, cap, founded: s.day - 300, owner, drift: 0, haltedUntil: 0 });
};

describe('site plans: Act III', () => {
  it('Geneva is the secretariat, the council hall, the plaza and the jetty on the lake', () => {
    const plan = act3Plan(null, siteDef('charter-hq'));
    expect(plan.pieces.map((p) => p.kind)).toEqual(['secretariat', 'council', 'plaza', 'jetty']);
    expect(plan.lakeAt).toBe(3);
  });

  it('megaprojects and the launch site rebuild as the Charter builds', () => {
    const worlds = ([0, 1, 2, 3] as const).map((st) => act3Fixture(st));
    for (const site of MEGA_SITES) {
      const counts = worlds.map((s) => act3Plan(s, site).pieces.length);
      expect(counts[3]).toBeGreaterThanOrEqual(counts[1]);
      expect(new Set(worlds.map((s) => act3Key(s, site))).size).toBeGreaterThan(1);
    }
    expect(new Set(worlds.map((s) => act3Key(s, LAUNCH_SITES[0]))).size).toBeGreaterThan(1);
    // the North Sea is built at sea
    expect(act3Plan(worlds[3], siteDef('mega-northsea')).offshore).toBe(true);
  });

  it('nothing of Act IV shows in an Act III world', () => {
    for (const st of [0, 1, 2, 3] as const) {
      const s = act3Fixture(st);
      for (const site of [...MEGA_SITES, ...LAUNCH_SITES]) {
        for (const p of act3Plan(s, site).pieces) {
          expect(['fusionPlant', 'dacFarm']).not.toContain(p.kind);
          expect(p.variant ?? '').not.toMatch(/^cycle:|ffleet|dac/);
        }
      }
    }
  });

  it('the twelve bloc banners are all different, with a swallowtail fly', () => {
    const grids = BLOC_ORDER.map((id) => Array.from({ length: 40 }, (_, k) => blocBannerAt(id, k % 8, Math.floor(k / 8))).join(','));
    expect(new Set(grids).size).toBe(12);
    for (const id of BLOC_ORDER) expect(blocBannerAt(id, 7, 2)).toBe(0);
  });
});

describe('site plans: Act IV', () => {
  it('fusion fleets and air capture join the megaprojects', () => {
    const s = act4PreviewState({ stage: 3, moon: 3 });
    const fleets = MEGA_SITES.flatMap((site) => act3Plan(s, site).pieces.filter((p) => p.kind === 'fusionPlant'));
    expect(fleets.length).toBeGreaterThan(0);
    for (const p of fleets) expect(['tokamak', 'stellarator', 'laser', 'pinch', 'dhe3']).toContain(p.variant);
    for (const site of MEGA_SITES) {
      const gt = megaView(s, site.id).dacGt;
      expect(act3Plan(s, site).pieces.filter((p) => p.kind === 'dacFarm').length).toBe(dacBlocks(gt));
    }
  });

  it('the spaceport grows pads that launch in turn', () => {
    const s = act4PreviewState();
    const pads = act3Plan(s, siteDef('launch-guiana')).pieces.filter((p) => p.kind === 'launchPad');
    expect(pads.length).toBe(1 + orbitView(s).pads);
    // every pad has its own slot in the launch cycle
    const cycles = pads.map((p) => p.variant ?? '');
    for (const c of cycles) expect(c).toMatch(/^cycle:\d+:\d+$/);
    expect(new Set(cycles).size).toBe(pads.length);
  });

  it('the Moon base grows by stage', () => {
    const kinds = (moon: 0 | 1 | 2 | 3) => act3Plan(act4PreviewState({ stage: 3, moon }), MOON_SITE).pieces.map((p) => p.kind);
    expect(kinds(1)).toEqual(expect.arrayContaining(['moonHab', 'moonPad', 'rimSolar', 'iceRig']));
    expect(kinds(2)).toEqual(expect.arrayContaining(['regolithMine', 'he3Plant', 'he3Tanks']));
    expect(kinds(2)).not.toContain('massDriver');
    expect(kinds(3)).toContain('massDriver');
  });
});

describe('site plans: Act V', () => {
  it('the yards and the ring grow with capacity, on a log scale', () => {
    expect([0, 0.1, 1, 14, 100, 1000].map(yardModules)).toEqual([0, 1, 3, 6, 8, 8]);
    expect([0, 10, 600, 5000, 1e5].map(ringRacks)).toEqual([0, 2, 6, 8, 9]);
    expect([null, 0, 0.5, 1].map(stormLevel)).toEqual([0, 1, 2, 3]);
    expect([0, 10, 50, 90].map(driftLevel)).toEqual([0, 1, 2, 3]);
    const mods = (s: GameState, id: string) => act3Plan(s, siteDef(id)).pieces.filter((p) => p.kind === 'yardsModule');
    expect(mods(world({}, capAt('l4', 150)), 'l4').length).toBeGreaterThan(mods(world({}, capAt('l4', 0.3)), 'l4').length);
    // L4 leans to collectors, L5 to hulls; one module is always being copied
    const s = world();
    expect(mods(s, 'l4')[0].variant?.[0]).toBe('c');
    expect(mods(s, 'l5')[0].variant?.[0]).toBe('h');
    expect(act3Plan(s, siteDef('l4')).pieces.filter((p) => p.kind === 'yardsCopy')).toHaveLength(1);
    // a strain drifting at L4: one module under a quarantine net
    expect(mods(world({ drift: 70 }), 'l4').filter((p) => p.variant?.includes('q3'))).toHaveLength(1);
    expect(mods(s, 'l4').some((p) => p.variant?.includes('q'))).toBe(false);
    // L5 hangs its habitats in the sky
    const l5 = act3Plan(s, siteDef('l5')).scenery;
    expect(l5.kind === 'space' && l5.habitats).toBeGreaterThan(0);
  });

  it('the asteroid plans follow the status, the Moon gets its foundry only in Act V', () => {
    for (const a of ASTEROIDS) {
      for (const st of [0, 1, 2, 3] as const) {
        const s = world({}, rock(a.id, st));
        const plan = act3Plan(s, siteDef(a.id));
        const kinds = plan.pieces.map((p) => p.kind);
        expect(kinds.includes('astBeacon')).toBe(st === 1);
        expect(kinds.includes('astClaim')).toBe(st >= 2);
        expect(kinds.includes('astRig')).toBe(st === 3);
        expect(kinds.includes('astCatapult')).toBe(st === 3);
        expect(plan.scenery.kind === 'asteroid' && plan.scenery.type).toBe(a.type as AsteroidType);
      }
    }
    expect(act3Plan(world(), MOON_SITE).pieces.some((p) => p.kind === 'moonFoundry')).toBe(true);
    const noFoundry = world({}, (x) => (x.system!.foundries = x.system!.foundries.filter((f) => f.site !== 'moon')));
    expect(act3Plan(noFoundry, MOON_SITE).pieces.some((p) => p.kind === 'moonFoundry')).toBe(false);
  });

  it('the scene key changes with what the sky shows (the storm, the swarm)', () => {
    const a = act3Key(world(), siteDef('l5'));
    const b = act3Key(world({ storm: 50 }), siteDef('l5'));
    const c = act3Key(world({ collectors: 4000 }), siteDef('l5'));
    expect(new Set([a, b, c]).size).toBe(3);
    for (const id of SPACE_SITES.map((x) => x.id)) expect(act3Key(world(), siteDef(id)).length).toBeGreaterThan(0);
  });
});
