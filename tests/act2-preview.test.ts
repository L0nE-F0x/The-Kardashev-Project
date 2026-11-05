/**
 * Act II art previews: icon sheets, portraits (Bit-0…5, CEOs) and map crops of a fake Act II world
 * (rival campuses, cables, fiber, landing stations, mines, megasites), rendered to PNG headless.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act2-preview.test.ts
 * Skipped unless PREVIEW_DIR is set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { C } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { pixelCanvasToPng } from '../tools/lib/png';
import { loadWorld } from './helpers/world';
import type { GameState, Facility } from '../src/sim/types';

const dir = process.env.PREVIEW_DIR;
const out = (name: string, layers: PixelCanvas[], scale: number) => {
  fs.mkdirSync(dir!, { recursive: true });
  fs.writeFileSync(path.join(dir!, name), pixelCanvasToPng(layers, scale));
};

describe.skipIf(!dir)('act II previews', () => {
  it('ui icons', async () => {
    const { ICON_NAMES, iconCanvas } = await import('../src/ui/icons');
    const cols = 12;
    const cell = 12;
    const rows = Math.ceil(ICON_NAMES.length / cols);
    const sheet = new PixelCanvas(cols * cell + 2, rows * cell + 2);
    sheet.rect(0, 0, sheet.w, sheet.h, C.ink2);
    ICON_NAMES.forEach((n, i) => {
      const x = 2 + (i % cols) * cell;
      const y = 2 + Math.floor(i / cols) * cell;
      if (i % 2) sheet.rect(x - 1, y - 1, 11, 11, C.ink3);
      sheet.blit(iconCanvas(n), x, y);
    });
    out('ui-icons.png', [sheet], 5);
  });

  it('portraits', async () => {
    const { portraitCanvas, ceoPortraitCanvas, CEO_IDS } = await import('../src/render/sprites/portraits');
    const moods = ['neutral', 'happy', 'worried', 'angry', 'excited'] as const;
    const rows = 6 + CEO_IDS.length;
    const sheet = new PixelCanvas(34 * moods.length, 34 * rows);
    for (let g = 0; g <= 5; g++) moods.forEach((m, col) => sheet.blit(portraitCanvas('bit', m, g), col * 34, g * 34));
    CEO_IDS.forEach((id, i) => moods.forEach((m, col) => sheet.blit(ceoPortraitCanvas(id, m), col * 34, (6 + i) * 34)));
    out('portraits-act2.png', [sheet], 3);
    // close-up: Bit-3/4/5 and every CEO, neutral
    const ids = [...CEO_IDS];
    const zoom = new PixelCanvas(34 * 5, 34 * 2);
    [3, 4, 5].forEach((g, i) => zoom.blit(portraitCanvas('bit', 'neutral', g), i * 34, 0));
    zoom.blit(portraitCanvas('bit', 'happy', 5), 3 * 34, 0);
    zoom.blit(portraitCanvas('bit', 'worried', 4), 4 * 34, 0);
    ids.slice(0, 5).forEach((id, i) => zoom.blit(ceoPortraitCanvas(id, 'neutral'), i * 34, 34));
    out('portraits-zoom-a.png', [zoom], 6);
    const zoom2 = new PixelCanvas(34 * 5, 34);
    ids.slice(5).forEach((id, i) => zoom2.blit(ceoPortraitCanvas(id, 'happy'), i * 34, 0));
    zoom2.blit(ceoPortraitCanvas('nobody', 'neutral'), 2 * 34, 0);
    zoom2.blit(ceoPortraitCanvas('meridian', 'angry'), 3 * 34, 0);
    zoom2.blit(ceoPortraitCanvas('kestrel', 'happy'), 4 * 34, 0);
    out('portraits-zoom-b.png', [zoom2], 6);
  });

  it('map icons', async () => {
    const M = await import('../src/render/sprites/mapIcons');
    const types = ['datacenter', 'solar', 'wind', 'battery', 'gas', 'lab', 'hydro', 'geothermal', 'restart', 'smr', 'reactor', 'packaging', 'fab', 'campus'] as const;
    const sheet = new PixelCanvas(16 * 14 + 4, 16 * 6 + 4);
    sheet.rect(0, 0, sheet.w, sheet.h, C.grn4);
    sheet.rect(0, 50, sheet.w, 50, C.snd5);
    types.forEach((t, i) => {
      const x = 2 + i * 16;
      sheet.blit(M.facilityIconCanvas(t, 'online', 1), x, 2);
      sheet.blit(M.facilityIconCanvas(t, 'building', 1), x, 14);
      sheet.blit(M.facilityIconCanvas(t, 'upgrade', 2), x, 28);
      sheet.blit(M.facilityIconCanvas(t, 'online', 3), x, 42);
      sheet.blit(M.facilityIconCanvas(t, 'building', 1, false), x, 54);
    });
    // markers row
    const marks: PixelCanvas[] = [
      M.landingCanvas(false), M.landingCanvas(true), M.landingCanvas(false, true),
      M.mineCanvas('lithium', false), M.mineCanvas('copper', true), M.mineCanvas('helium', false), M.mineCanvas('neon', false),
      M.rivalCampusCanvas('meridian', false), M.rivalCampusCanvas('lattice', false), M.rivalCampusCanvas('orchard', false), M.rivalCampusCanvas('meridian', true),
      M.restartSiteCanvas(false), M.restartSiteCanvas(true), M.megasiteCanvas(false), M.megasiteCanvas(true),
      M.cutMarkCanvas(), M.cableShipCanvas(), M.cargoShipCanvas('cyn4'), M.cargoShipCanvas('red3', 'blu2'), M.shipCanvas(),
      M.sitePinCanvas('cyn4'), M.candidateCanvas(false), M.supplierCanvas('org1'),
    ];
    let x = 2;
    for (const m of marks) {
      sheet.blit(m, x, 70);
      x += m.w + 3;
    }
    out('map-icons.png', [sheet], 5);
  });

  it('act II map', async () => {
    const { newGame } = await import('../src/sim/state');
    const { SITES } = await import('../src/content/sites');
    const { renderTerrain } = await import('../src/render/worldMap/terrain');
    const L = await import('../src/render/worldMap/act2Layers');
    const M = await import('../src/render/sprites/mapIcons');
    const { CHOKEPOINTS } = await import('../src/world/routing');
    const { drawText, measureText } = await import('../src/render/font');
    const { lods, router } = loadWorld();

    const s = newGame({ name: 'Preview', homeSite: 'n-virginia', seed: 7 }) as GameState;
    s.act = 2;
    s.phase = 3;
    s.day = 400;
    let n = 0;
    const fac = (siteId: string, type: Facility['type'], status: 'online' | 'building', extra: Partial<Facility> = {}) =>
      s.facilities.push({ id: `p${n++}`, type, siteId, status, progress: 10, buildDays: 100, startedDay: 0, ...extra });
    fac('n-virginia', 'datacenter', 'online', { tier: 2 });
    fac('n-virginia', 'solar', 'online');
    fac('n-virginia', 'battery', 'building');
    fac('appalachia', 'smr', 'building');
    fac('appalachia', 'gas', 'online', { upgrade: { to: 2, progress: 5, buildDays: 90 } });
    fac('lakeshore', 'restart', 'building');
    fac('west-texas', 'campus', 'building');
    fac('west-texas', 'wind', 'online', { tier: 3 });
    fac('columbia-gorge', 'hydro', 'online');
    fac('reykjanes', 'geothermal', 'online', { tier: 3 });
    fac('rhone', 'reactor', 'building');
    fac('iberia', 'packaging', 'online');
    fac('london', 'lab', 'online', { tier: 2 });
    fac('lower-elbe', 'fab', 'building');
    fac('wyoming', 'campus', 'online');
    fac('chiba', 'datacenter', 'online', { tier: 3 });
    fac('johor', 'datacenter', 'building');
    fac('kyushu', 'geothermal', 'online');
    s.links = [{ id: 'l1', a: 'n-virginia', b: 'appalachia', km: 250, status: 'online', progress: 1, buildDays: 1, capacityMW: 500, lossPct: 2 }];
    s.network = {
      fiber: [
        { id: 'f1', a: 'n-virginia', b: 'appalachia', km: 250, status: 'online', progress: 1, buildDays: 1 },
        { id: 'f2', a: 'n-virginia', b: 'west-texas', km: 2200, status: 'building', progress: 10, buildDays: 60 },
        { id: 'f3', a: 'london', b: 'rhone', km: 800, status: 'online', progress: 1, buildDays: 1 },
        { id: 'f4', a: 'chiba', b: 'kyushu', km: 900, status: 'online', progress: 1, buildDays: 1 },
      ],
      leases: ['c-atlantic', 'c-pacific', 'c-redsea', 'c-indian'],
      own: [
        { id: 'own1', a: 'cls-cornwall', b: 'cls-fortaleza', status: 'building', progress: 430, buildDays: 720 },
        { id: 'own2', a: 'cls-mumbai', b: 'cls-sydney', status: 'online', progress: 720, buildDays: 720 },
      ],
      cuts: { 'c-redsea': 430, 'c-asiapac': 410 },
    };
    s.rivalBuilds = [
      { id: 'r1', owner: 'meridian', siteId: 'west-texas', slots: 2, itMW: 300, status: 'online', startDay: 0, readyDay: 100 },
      { id: 'r2', owner: 'lattice', siteId: 'n-virginia', slots: 1, itMW: 100, status: 'online', startDay: 0, readyDay: 100 },
      { id: 'r3', owner: 'orchard', siteId: 'iberia', slots: 1, itMW: 80, status: 'building', startDay: 300, readyDay: 500 },
      { id: 'r4', owner: 'meridian', siteId: 'wyoming', slots: 3, itMW: 400, status: 'building', startDay: 300, readyDay: 700 },
      { id: 'r5', owner: 'orchard', siteId: 'n-virginia', slots: 1, itMW: 60, status: 'online', startDay: 0, readyDay: 100 },
      { id: 'r6', owner: 'lattice', siteId: 'kutch', slots: 2, itMW: 200, status: 'online', startDay: 0, readyDay: 100 },
    ];
    s.stack = { ...(s.stack ?? { deals: [] }), stakes: { 'mine-atacama': 0.1 } } as GameState['stack'];

    const label = (text: string) => {
      const pc = new PixelCanvas(measureText(text) + 2, 7);
      drawText(pc, text, 1, 1, C.white);
      pc.outline(C.ink0, true);
      return pc;
    };

    /** Everything the MapScene draws, composited into full-map canvases for one LOD. */
    const render = (lodIndex: number, state: GameState) => {
      const lod = lods[lodIndex];
      const fine = lodIndex >= 1;
      const act2 = (state.act ?? 1) >= 2;
      const terrain = renderTerrain(lod);
      const net = new PixelCanvas(lod.W, lod.H);
      const top = new PixelCanvas(lod.W, lod.H);
      const wrapBlit = (src: PixelCanvas, x: number, y: number, flip = false) => {
        top.blit(src, x, y, flip);
        if (x + src.w > lod.W) top.blit(src, x - lod.W, y, flip);
        if (x < 0) top.blit(src, x + lod.W, y, flip);
      };
      const track = (c: { a: string; b: string }) => L.trackPixels(L.seaPath(router, c.a, c.b)!, lod);
      if (act2) {
        L.paintNetwork(net, lod, state, track);
        for (const c of L.cableDraws(state)) if (c.cut) L.paintCut(net, lod, track(c));
      }
      // power lines: yellow over a drop shadow
      for (const l of state.links) {
        const t = L.siteTrack(l.a, l.b, lod);
        for (const p of t) top.set(p.x + 1, p.y + 1, C.ink0);
        for (const p of t) top.set(p.x, p.y, C.yel0);
      }
      for (const c of CHOKEPOINTS) {
        const x = Math.floor((c.lon + 180) / lod.res);
        const y = Math.floor((90 - c.lat) / lod.res);
        wrapBlit(M.chokepointCanvas(false), x - 3, y - 3);
      }
      const labels: [PixelCanvas, number, number][] = [];
      for (const site of SITES) {
        if (!L.siteVisible(site, state)) continue;
        const x = Math.floor((site.lon + 180) / lod.res);
        const y = Math.floor((90 - site.lat) / lod.res);
        const m = L.siteMarker(site, state, false, false);
        const pc = m.make();
        const my = y - (m.lift ? pc.h - 1 : Math.floor(pc.h / 2));
        wrapBlit(pc, x - Math.floor(pc.w / 2), my);
        const glyphs = L.siteGlyphs(state, site.id);
        if (fine) {
          const icons = glyphs.map((g) => M.facilityIconCanvas(g.type, g.building ? 'building' : g.upgrade ? 'upgrade' : 'online', g.tier, act2));
          const total = icons.reduce((a, ic) => a + ic.w + 1, 0);
          let ix = x - Math.floor(total / 2);
          for (const ic of icons) {
            wrapBlit(ic, ix, y + 10 - ic.h);
            ix += ic.w + 1;
          }
          if (glyphs.length) {
            const lb = label(site.kind === 'build' ? site.name.toUpperCase() : site.name.split('·')[0].trim().toUpperCase());
            labels.push([lb, x - Math.floor(lb.w / 2), my - lb.h - 1]);
          }
        }
        if (act2) {
          let rx = x + (m.lift ? 5 : 3);
          for (const r of L.rivalsAt(state, site.id)) {
            const rc = M.rivalCampusCanvas(r.owner, r.building);
            wrapBlit(rc, rx, y - (m.lift ? 10 : 7));
            rx += rc.w - 1;
          }
        }
      }
      if (act2) {
        for (const c of L.cableDraws(state)) {
          const t = track(c);
          if (c.cut) {
            const p = L.trackAt(t, 0.5);
            wrapBlit(M.cableShipCanvas(), p.x + 4, p.y - 2);
            wrapBlit(M.cutMarkCanvas(), p.x - 3, p.y - 3);
          } else if (c.kind === 'own' && c.built < 1) {
            const p = L.trackAt(t, c.built);
            wrapBlit(M.cableShipCanvas(), p.x - 3, p.y - 3);
          }
        }
        for (const lane of L.LANES) {
          const path = L.lanePath(router, lane, new Set());
          if (!path) continue;
          const t = L.trackPixels(path, lod);
          const pos = L.laneShip(t, state.day, lane, lod.res * 111);
          if (pos) wrapBlit(M.cargoShipCanvas(lane.cargo, lane.hull), pos.p.x - 3, pos.p.y - 2, pos.dir < 0);
        }
      }
      for (const [lb, x, y] of labels) wrapBlit(lb, x, y);
      return [terrain, net, top];
    };
    const crop = (layers: PixelCanvas[], x: number, y: number, w: number, h: number) =>
      layers.map((pc) => {
        const o = new PixelCanvas(w, h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set(i, j, pc.get((((x + i) % pc.w) + pc.w) % pc.w, y + j));
        return o;
      });

    const t0 = performance.now();
    const fineLayers = render(1, s);
    console.log(`act II map render ${(performance.now() - t0).toFixed(0)} ms`);
    out('act2-atlantic.png', crop(fineLayers, 280, 90, 520, 230), 3);
    out('act2-asia.png', crop(fineLayers, 1060, 150, 400, 360), 3);
    out('act2-europe-india.png', crop(fineLayers, 660, 110, 460, 260), 3);
    out('act2-world-lod0.png', render(0, s), 2);
    // close-ups at 6×: the US east (home, rivals, cranes), the Gulf (megasite, helium works), Japan,
    // from the live MapScene so they show the decluttered markers and laid-out labels as played
    const { liveMap, shotPng } = await import('./helpers/mapshot');
    const live = await liveMap(s, { lod: 1 });
    fs.writeFileSync(path.join(dir!, 'act2-zoom-useast.png'), shotPng(live.crop(330, 165, 140, 80), 6));
    fs.writeFileSync(path.join(dir!, 'act2-zoom-gulf.png'), shotPng(live.crop(880, 220, 140, 80), 6));
    fs.writeFileSync(path.join(dir!, 'act2-zoom-japan.png'), shotPng(live.crop(1220, 190, 140, 80), 6));
    live.scene.destroy();
    // the same Atlantic view in Act I: none of the Act II layers or sites
    const s1 = structuredClone(s);
    s1.act = 1;
    s1.phase = 0;
    s1.facilities = s1.facilities.filter((f) => ['hq', 'datacenter', 'solar', 'battery', 'gas', 'wind', 'lab'].includes(f.type) && f.siteId !== 'lakeshore');
    for (const f of s1.facilities) {
      delete f.tier;
      delete f.upgrade;
    }
    out('act1-atlantic.png', crop(render(1, s1), 280, 90, 520, 230), 3);
  });
});
