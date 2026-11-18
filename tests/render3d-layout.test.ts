import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { newAct2Game } from '../src/sim/act2';
import { newAct3Game } from '../src/sim/act3';
import { refreshStats } from '../src/sim/tick';
import { SITES, SITE_BY_ID, SPACE_SITES, MOON_SITE } from '../src/content/sites';
import { campusLayout } from '../src/render3d/campus/layout';
import { FACILITIES } from '../src/content/facilities';
import { isPlanSite, planLayout, planSpecs, setLayout, setPiecesFor } from '../src/render3d/campus/viewOnly';
import { act4PreviewState } from '../src/sim/planetPreview';
import { act5PreviewState } from '../src/sim/systemPreview';
import type { GameState } from '../src/sim/types';

const overlaps = (a: { x0: number; z0: number; x1: number; z1: number }, b: typeof a) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.z0 < b.z1 - 0.01 && b.z0 < a.z1 - 0.01;

function checkCampus(s: GameState) {
  for (const site of SITES.filter((x) => x.kind === 'build')) {
    const L = campusLayout(s, site.id);
    // every facility here has a plot, and no two plots overlap
    const here = s.facilities.filter((f) => f.siteId === site.id);
    expect(L.items.filter((i) => i.kind === 'facility').length).toBe(here.length);
    for (let i = 0; i < L.items.length; i++) for (let j = i + 1; j < L.items.length; j++) expect(overlaps(L.items[i].rect, L.items[j].rect)).toBe(false);
  }
}

function checkPlaces(s: GameState) {
  for (const site of [...SITES, MOON_SITE, ...SPACE_SITES]) {
    if (site.kind === 'build') continue;
    const L = isPlanSite(site) ? planLayout(planSpecs(s, site).specs) : setLayout(setPiecesFor(site));
    for (const it of L.items) expect(Number.isFinite(it.rect.x0 + it.rect.z0 + it.rect.x1 + it.rect.z1)).toBe(true);
    for (let i = 0; i < L.items.length; i++) for (let j = i + 1; j < L.items.length; j++) expect(overlaps(L.items[i].rect, L.items[j].rect)).toBe(false);
  }
}

describe('3D edition layouts', () => {
  it('lays out Act I campuses', () => {
    const s = newGame({ name: 'T', homeSite: 'bay-area', seed: 3 });
    refreshStats(s);
    checkCampus(s);
    expect(campusLayout(s, 'bay-area').items.some((i) => i.facility?.type === 'hq')).toBe(true);
  });

  it('gives a big facility whole columns whatever was built before it', () => {
    // the sim counts plots, not columns: every order of builds it allows must still stand each facility on all its plots
    const types = ['datacenter', 'solar', 'battery', 'reactor', 'fab', 'campus', 'smr'] as const;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let run = 0; run < 400; run++) {
      const s = newAct2Game({ name: 'T', homeSite: 'bay-area', seed: 3 });
      const site = run % 2 ? 'bay-area' : 'columbia-gorge';
      s.facilities = s.facilities.filter((f) => f.siteId !== site || f.type === 'hq');
      const plots = 3 + Math.floor(rnd() * 8);
      s.sites[site].extraSlots = Math.max(0, plots - SITE_BY_ID[site].slots!);
      const n = Math.max(plots, SITE_BY_ID[site].slots!);
      let used = s.facilities.filter((f) => f.siteId === site).length;
      for (let i = 0; i < 12; i++) {
        const type = types[Math.floor(rnd() * types.length)];
        const need = FACILITIES[type].slots ?? 1;
        if (used + need > n) continue;
        used += need;
        s.facilities.push({ id: `t${run}-${i}`, type, siteId: site, status: 'online', progress: 0, buildDays: 1, startedDay: 0 });
      }
      const L = campusLayout(s, site);
      for (const it of L.items) if (it.facility) expect(it.cells.length, `${it.facility.type} at ${site}, run ${run}`).toBe(FACILITIES[it.facility.type].slots ?? 1);
      expect(L.items.filter((i) => i.kind === 'facility').length).toBe(s.facilities.filter((f) => f.siteId === site).length);
      for (let i = 0; i < L.items.length; i++) for (let j = i + 1; j < L.items.length; j++) expect(overlaps(L.items[i].rect, L.items[j].rect)).toBe(false);
      // every plot the company has is a building's or an empty one's
      expect(L.items.reduce((a, it) => a + it.cells.length, 0)).toBe(n);
    }
  });

  it('lays out the Act II–V places without overlaps', () => {
    for (const s of [newAct2Game({ name: 'T', homeSite: 'bay-area', seed: 3 }), newAct3Game({ name: 'T', homeSite: 'bay-area', seed: 3 }), act4PreviewState({ stage: 3, moon: 3 }), act5PreviewState({ stage: 3 })]) {
      refreshStats(s);
      checkCampus(s);
      checkPlaces(s);
    }
    expect(SITE_BY_ID['charter-hq']).toBeTruthy();
  });
});
