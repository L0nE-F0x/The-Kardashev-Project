/**
 * Act III art previews (Solarpunk Bloom): map crops of the Charter fixture at stages 0–3
 * (megaprojects, HVDC links, launch complex, anchors, orbit, the liftoff), the Act III map
 * sprites, terrain in every era (with the Bloom overlay), the UI icon sheet and the portraits
 * (every CEO and delegate in five moods, Bit-0…7, Kip), rendered to PNG headless.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act3-map-preview.test.ts
 * The previews are skipped unless PREVIEW_DIR is set; the MapScene smoke test, the layer checks
 * and the portrait coverage check always run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { C, setEra } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { pixelCanvasToPng } from '../tools/lib/png';
import { loadWorld } from './helpers/world';
import type { GameState } from '../src/sim/types';

const dir = process.env.PREVIEW_DIR;
const out = (name: string, layers: PixelCanvas[], scale: number) => {
  fs.mkdirSync(dir!, { recursive: true });
  fs.writeFileSync(path.join(dir!, name), pixelCanvasToPng(layers, scale));
};

describe.skipIf(!dir)('act III previews', () => {
  beforeAll(() => setEra(2));
  afterAll(() => setEra(0));

  it('map sprites', async () => {
    const I = await import('../src/render/sprites/charterIcons');
    /** A sheet of rows of sprites on a few ground colours. */
    const sheet = (name: string, rows: PixelCanvas[][], grounds: number[], scale = 8) => {
      const w = Math.max(...rows.map((r) => r.reduce((a, pc) => a + pc.w + 3, 3)));
      const hs = rows.map((r) => Math.max(...r.map((pc) => pc.h)) + 4);
      const pc = new PixelCanvas(w, hs.reduce((a, b) => a + b, 0));
      let y = 0;
      rows.forEach((r, i) => {
        pc.rect(0, y, w, hs[i], grounds[i % grounds.length]);
        let x = 3;
        for (const c of r) {
          pc.blit(c, x, y + 2 + (hs[i] - 4 - c.h));
          x += c.w + 3;
        }
        y += hs[i];
      });
      out(name, [pc], scale);
    };
    const kinds = ['solar', 'wind', 'nuclear', 'hydro', 'geo'] as const;
    sheet('act3-sprites-megas.png', [
      [I.charterHqCanvas(false), I.charterHqCanvas(true), I.megaSurveyCanvas(false), I.megaSurveyCanvas(true)],
      ...kinds.map((k) => [1, 2, 3].map((st) => I.megaMarkerCanvas(k, st, false))),
    ], [C.snd6, C.grn4, C.snd5, C.grn5, C.rck3, C.snd4]);
    const builders = ['org1', 'sea6', 'yel0', 'blu5', 'cyn4', 'snd4', 'ice1', 'pnk0', 'grn6', 'org0', 'blu4', 'vio4', 'sky4', 'red3', 'org2'] as const;
    const anchorKinds = ['compute', 'cable', 'fab', 'hbm', 'pkg', 'euv'] as const;
    sheet('act3-sprites-misc.png', [
      [I.launchCandidateCanvas(false), I.launchCandidateCanvas(true), I.launchPadCanvas({ building: true, rocket: false, builder: 'org0' }), I.launchPadCanvas({ building: true, rocket: false, builder: 'blu4' }), I.launchPadCanvas({ building: false, rocket: true }), I.launchPadCanvas({ building: false, rocket: false }), I.launchPadCanvas({ building: false, rocket: true, hover: true }), I.rocketCanvas(0), I.rocketCanvas(1)],
      [I.satelliteCanvas(), I.spaceSolarCanvas(), I.beamCanvas(14), I.converterCanvas(true), I.converterCanvas(false)],
      builders.slice(0, 10).map((b) => I.craneCanvas(b)),
      [...builders.slice(0, 5).map((b) => I.craneCanvas(b, true))],
      anchorKinds.map((k, i) => I.anchorGlyphCanvas(k, builders[i + 5], false)),
      anchorKinds.map((k, i) => I.anchorGlyphCanvas(k, builders[i], true)),
    ], [C.grn4, C.sea3, C.snd6, C.grn5, C.snd6, C.grn4]);
  });

  it('act III maps', async () => {
    const { SITES } = await import('../src/content/sites');
    const { renderTerrain, renderBloom } = await import('../src/render/worldMap/terrain');
    const L2 = await import('../src/render/worldMap/act2Layers');
    const L3 = await import('../src/render/worldMap/act3Layers');
    const M = await import('../src/render/sprites/mapIcons');
    const I = await import('../src/render/sprites/charterIcons');
    const { drawText, measureText } = await import('../src/render/font');
    const { act3Fixture } = await import('./helpers/act3fixture');
    const { lods, router } = loadWorld();

    const label = (text: string) => {
      const pc = new PixelCanvas(measureText(text) + 2, 7);
      drawText(pc, text, 1, 1, C.white);
      pc.outline(C.ink0, true);
      return pc;
    };
    const terrains = lods.map((lod) => renderTerrain(lod));
    const blooms = lods.map((lod) => renderBloom(lod));

    /** Everything the MapScene draws in Act III, composited into full-map canvases for one LOD. */
    const render = (lodIndex: number, state: GameState, t = 1.6) => {
      const lod = lods[lodIndex];
      const fine = lodIndex >= 1;
      const v = L3.charterView(state);
      const ground = new PixelCanvas(lod.W, lod.H);
      const net = new PixelCanvas(lod.W, lod.H);
      const top = new PixelCanvas(lod.W, lod.H);
      const blitWrap = (dst: PixelCanvas, src: PixelCanvas, x: number, y: number) => {
        dst.blit(src, x, y);
        if (x + src.w > lod.W) dst.blit(src, x - lod.W, y);
        if (x < 0) dst.blit(src, x + lod.W, y);
      };
      const put = (src: PixelCanvas, x: number, y: number) => blitWrap(top, src, x, y);
      const px = (lat: number, lon: number) => ({ x: Math.floor((lon + 180) / lod.res), y: Math.floor((90 - lat) / lod.res) });
      // megaproject ground
      for (const mv of v.megas) {
        const site = SITES.find((x) => x.id === mv.siteId)!;
        const patch = L3.megaPatchCanvas(site, mv, lod);
        if (!patch) continue;
        const p = px(site.lat, site.lon);
        blitWrap(ground, patch.pc, p.x + patch.ox, p.y + patch.oy);
      }
      // cables, fiber, HVDC, the orbit track
      const track = (c: { a: string; b: string }) => L2.trackPixels(L2.seaPath(router, c.a, c.b)!, lod);
      L2.paintNetwork(net, lod, state, track);
      const draws = L3.hvdcDraws(v, lod);
      L3.paintHvdc(net, lod, draws);
      if (v.orbitalTest) L3.paintOrbit(net, lod);
      // converter stations and build heads
      for (const d of draws) {
        const pts = d.track.pts;
        for (const end of [pts[0], pts[pts.length - 1]]) {
          const cv = I.converterCanvas(d.online);
          put(cv, end.x - 3, end.y - 4);
        }
        if (!d.online) {
          const i = Math.floor(d.progress * (pts.length - 1));
          const p = pts[i];
          if (d.track.sea[i]) put(M.cableShipCanvas(), p.x - 3, p.y - 3);
          else {
            const cr = I.craneCanvas(d.builder, true);
            put(cr, p.x - 2, p.y - cr.h + 1);
          }
        }
      }
      const labels: [PixelCanvas, number, number][] = [];
      const flying = L3.liftoffActive(v, state.day);
      for (const site of SITES) {
        if (!L2.siteVisible(site, state)) continue;
        const p = px(site.lat, site.lon);
        const m = L2.siteMarker(site, state, false, false, { flying });
        const pc = m.make();
        const o = L3.markerOrigin(p.x, p.y, pc.w, pc.h, m.lift);
        put(pc, o.x, o.y);
        const glyphs = L2.siteGlyphs(state, site.id);
        if (fine) {
          const icons = glyphs.map((g) => M.facilityIconCanvas(g.type, g.building ? 'building' : g.upgrade ? 'upgrade' : 'online', g.tier, true));
          const total = icons.reduce((a, ic) => a + ic.w + 1, 0);
          let ix = p.x - Math.floor(total / 2);
          for (const ic of icons) {
            put(ic, ix, p.y + 10 - ic.h);
            ix += ic.w + 1;
          }
          if (glyphs.length || L3.act3Label(site, state)) {
            const lb = label(site.kind === 'build' ? site.name.toUpperCase() : site.name.split('·')[0].trim().toUpperCase());
            labels.push([lb, p.x - Math.floor(lb.w / 2), o.y - lb.h - 1]);
          }
        }
        if (site.kind === 'mega') {
          const mv = v.megas.find((x) => x.siteId === site.id)!;
          const cranes = L3.megaCranes(mv).map((col) => I.craneCanvas(col));
          L3.craneSpots(p.x, p.y, pc.w, pc.h, cranes).forEach((s, i) => put(cranes[i], s.x, s.y));
        }
        let rx = p.x + (m.lift ? 5 : 3);
        for (const r of L2.rivalsAt(state, site.id)) {
          const rc = M.rivalCampusCanvas(r.owner, r.building);
          put(rc, rx, p.y - (m.lift ? 10 : 7));
          rx += rc.w - 1;
        }
      }
      for (const a of v.anchors) {
        const p = px(a.lat, a.lon);
        const glyphs = L3.anchorGlyphs(a).map((g) => I.anchorGlyphCanvas(g.kind, g.builder, g.building));
        L3.rowSpots(p.x, p.y, glyphs).forEach((s, i) => put(glyphs[i], s.x, s.y));
      }
      // sky: the satellite, the space-solar craft and its beam, the rocket mid-climb
      const sky = new PixelCanvas(lod.W, lod.H);
      if (v.orbitalTest) {
        const g = L3.orbitPoint(L3.orbitAngle(t * 7));
        const p = px(g.lat, g.lon);
        const sat = I.satelliteCanvas();
        blitWrap(sky, sat, p.x - Math.floor(sat.w / 2), p.y - Math.floor(sat.h / 2));
      }
      const launchSite = v.launch ? SITES.find((x) => x.id === v.launch!.siteId) : null;
      if (v.spaceSolar && launchSite) {
        const p = px(launchSite.lat, launchSite.lon);
        const craft = I.spaceSolarCanvas();
        const spot = L3.spaceSolarSpot(p.x, p.y, craft.w, craft.h, 0);
        const beam = I.beamCanvas(spot.beam.len);
        for (let y = 0; y < beam.h; y++) for (let x = 0; x < beam.w; x++) if (beam.get(x, y) && (x + y) % 2 === 0) sky.set(spot.beam.x + x, spot.beam.y + y, beam.get(x, y));
        blitWrap(sky, craft, spot.craft.x, spot.craft.y);
      }
      if (flying && launchSite) {
        const p = px(launchSite.lat, launchSite.lon);
        const f = L3.launchFrame(t);
        const pad = I.launchPadCanvas({ building: false, rocket: false });
        const o = L3.markerOrigin(p.x, p.y, pad.w, pad.h, true);
        const baseX = o.x + 5;
        const baseY = o.y + 4;
        for (const pf of f.puffs) sky.set(baseX + 1 + pf.dx, baseY + 9 + pf.dy, pf.c);
        if (f.rise !== null) blitWrap(sky, I.rocketCanvas(f.flame), baseX - 1, baseY - 1 - f.rise);
      }
      for (const [lb, x, y] of labels) put(lb, x, y);
      return [terrains[lodIndex], blooms[lodIndex], ground, net, top, sky];
    };
    const crop = (layers: PixelCanvas[], x: number, y: number, w: number, h: number) =>
      layers.map((pc) => {
        const o = new PixelCanvas(w, h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set(i, j, pc.get((((x + i) % pc.w) + pc.w) % pc.w, y + j));
        return o;
      });

    for (const stage of [0, 1, 2, 3] as const) {
      const s = act3Fixture(stage);
      const t0 = performance.now();
      const fine = render(1, s);
      if (stage === 3) console.log(`act III map render ${(performance.now() - t0).toFixed(0)} ms`);
      out(`act3-s${stage}-europe-africa.png`, crop(fine, 600, 100, 400, 380), 3);
      out(`act3-s${stage}-asia-australia.png`, crop(fine, 1020, 120, 420, 380), 3);
      out(`act3-s${stage}-americas.png`, crop(fine, 180, 110, 420, 360), 3);
      if (stage === 3 || stage === 1) out(`act3-s${stage}-world-lod0.png`, render(0, s), 2);
    }
    // close-ups at 6×: the Sahara–Europe link and Geneva, the Gulf launch pad, the Gobi
    const s3 = act3Fixture(3);
    const fine3 = render(1, s3);
    out('act3-zoom-sahara-europe.png', crop(fine3, 700, 150, 130, 120), 6);
    out('act3-zoom-gulf.png', crop(fine3, 290, 190, 140, 100), 6);
    out('act3-zoom-gobi.png', crop(fine3, 1060, 160, 160, 100), 6);
    out('act3-zoom-northsea.png', crop(fine3, 700, 80, 120, 80), 6);
    const s1 = act3Fixture(1);
    const fine1 = render(1, s1);
    out('act3-zoom-s1-sahara.png', crop(fine1, 700, 150, 130, 120), 6);
    out('act3-zoom-s1-guiana.png', crop(fine1, 470, 300, 80, 60), 6);
    // Charter phase 2 with no launch contract yet: every candidate pad shows, faintly
    const sc = act3Fixture(1);
    sc.charter!.projects = sc.charter!.projects.filter((p) => p.kind !== 'launch');
    out('act3-launch-candidates-lod0.png', render(0, sc), 2);
    // liftoff frames along the loop (the Guiana pad)
    const frames = [0.3, 1.4, 2.2, 3.0, 3.8, 5.2].map((t) => crop(render(1, s3, t), 474, 255, 70, 100));
    const strip = frames[0].map((_, li) => {
      const o = new PixelCanvas(70 * frames.length, 100);
      frames.forEach((f, i) => o.blit(f[li], i * 70, 0));
      return o;
    });
    out('act3-liftoff.png', strip, 4);
  });
});

describe.skipIf(!dir)('eras', () => {
  afterAll(() => setEra(0));
  it('terrain and night lights in every era', async () => {
    const { renderTerrain, renderBloom } = await import('../src/render/worldMap/terrain');
    const { renderNight, lightPoints, renderLights } = await import('../src/render/worldMap/night');
    const { lods } = loadWorld();
    const lod = lods[1];
    const terrain = renderTerrain(lod);
    // a dusk terminator across Europe and Africa
    const night = renderNight(lod, new Date(Date.UTC(2035, 5, 21, 19, 30)));
    const lights = renderLights(lod, night, lightPoints(lod));
    const crop = (pc: PixelCanvas, x: number, y: number, w: number, h: number) => {
      const o = new PixelCanvas(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set(i, j, pc.get(x + i, y + j));
      return o;
    };
    for (const era of [0, 1, 2, 3] as const) {
      setEra(era);
      out(`era${era}-europe.png`, [crop(terrain, 660, 110, 360, 200)], 3);
      if (era === 2) {
        const bloom = renderBloom(lod);
        out('era2-bloom-africa.png', [crop(terrain, 640, 250, 420, 200), crop(bloom, 640, 250, 420, 200)], 3);
        out('era2-nobloom-africa.png', [crop(terrain, 640, 250, 420, 200)], 3);
        out('era2-bloom-china.png', [crop(terrain, 1060, 150, 300, 160), crop(bloom, 1060, 150, 300, 160)], 3);
      }
      // night: multiply isn't available headless, so show the shade and the lights over the terrain
      const shade = crop(night, 660, 110, 360, 200);
      const dim = crop(terrain, 660, 110, 360, 200);
      for (let i = 0; i < dim.data.length; i++) if (shade.data[i] === C.blu3 || shade.data[i] === C.blu4) dim.data[i] = (i + Math.floor(i / 360)) % 2 ? C.night2 : C.night3;
      out(`era${era}-europe-night.png`, [dim, crop(lights, 660, 110, 360, 200)], 3);
    }
  });
});

// ── the real MapScene, headless, with an Act III state ─────────────────────────────────────────
const fakeCanvas = () => ({
  width: 0, height: 0, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} }),
  toDataURL: () => 'data:',
});

describe('act III map scene', () => {
  it('runs Act III frames: megaprojects, HVDC, launch, anchors, orbit', async () => {
    (globalThis as any).document ??= { createElement: fakeCanvas, documentElement: { style: { setProperty() {} } } };
    (globalThis as any).window ??= globalThis;
    const { MapScene } = await import('../src/render/worldMap/mapScene');
    const { act3Fixture } = await import('./helpers/act3fixture');
    const world = loadWorld();
    const s = act3Fixture(3);
    const game: any = {
      world, state: s, view: s, mode: 'map', hover: null, selection: { kind: 'site', id: 'charter-hq' }, tool: null,
      settings: { clouds: true, dayNight: true, reducedMotion: false, wheel: 'zoom' },
      dayFraction: () => 0.5, setHover() {}, select() {}, linkClick() {}, enterDiorama() {},
    };
    setEra(2);
    const scene = new MapScene(game);
    const sc = scene as any;
    for (let i = 0; i < 40; i++) scene.update(1 / 60, i * 16);
    expect(sc.bloom?.sprites[0].visible).toBe(true);
    expect(sc.megaSprites.size).toBeGreaterThan(0);
    expect(sc.hvdcPulses.length).toBeGreaterThan(0);
    expect(sc.anchorSprites.length).toBeGreaterThan(0);
    expect(sc.satSprite?.visible).toBe(true);
    expect(sc.solarSprite?.visible).toBe(true);
    expect(sc.rocketSprite?.visible).toBe(true);
    // every Act III site kind is visible and hit-testable
    expect(sc.markers.get('charter-hq')?.sprite.visible).toBe(true);
    expect(sc.markers.get('mega-sahara')?.sprite.visible).toBe(true);
    expect(sc.markers.get('launch-guiana')?.sprite.visible).toBe(true);
    const { siteDef } = await import('../src/content/sites');
    const hq = siteDef('charter-hq');
    const res = world.lods[sc.lodIndex].res;
    const hx = sc.wrapX((hq.lon + 180) / res) - sc.camX;
    const hy = (90 - hq.lat) / res - sc.camY;
    expect(sc.hitSite(hx, hy)).toBe('charter-hq');
    scene.zoomIn();
    for (let i = 0; i < 30; i++) scene.update(1 / 60, 800 + i * 16);
    expect(sc.megaSprites.size).toBeGreaterThan(0);
    // earlier stages, reduced motion, then back to Act II: the Act III layers go away
    game.view = game.state = act3Fixture(1);
    game.settings.reducedMotion = true;
    for (let i = 0; i < 10; i++) scene.update(1 / 60, 1400 + i * 16);
    expect(sc.satSprite?.visible ?? false).toBe(false);
    const s2 = act3Fixture(0);
    s2.act = 2;
    s2.charter = null;
    game.view = game.state = s2;
    for (let i = 0; i < 5; i++) scene.update(1 / 60, 1600 + i * 16);
    expect(sc.megaSprites.size).toBe(0);
    expect(sc.anchorSprites.length).toBe(0);
    expect(sc.hvdcPulses.length).toBe(0);
    expect(sc.markers.get('charter-hq')?.sprite.visible ?? false).toBe(false);
    setEra(0);
    scene.update(1 / 60, 2000);
    expect(sc.bloom?.sprites[0].visible).toBe(false);
  });
});

describe('act III map layers', () => {
  it('megaproject patches, HVDC tracks and markers stay well-formed', async () => {
    const { act3Fixture } = await import('./helpers/act3fixture');
    const { megaView } = await import('../src/sim/charterView');
    const { SITES, siteDef } = await import('../src/content/sites');
    const { HVDC_ROUTES } = await import('../src/content/charter');
    const L2 = await import('../src/render/worldMap/act2Layers');
    const L3 = await import('../src/render/worldMap/act3Layers');
    const { lods } = loadWorld();
    // several kinds planned at one site before anything is online
    const s = act3Fixture(0);
    const base = s.charter!.projects.find((p) => p.where === 'mega-plains') ?? s.charter!.projects[0];
    for (const kind of ['wind', 'nuclear', 'solar'] as const) s.charter!.projects.push({ ...base, id: `t-${kind}`, kind, where: 'mega-plains', status: 'building', progress: 10 });
    for (const lod of lods) {
      const mv = megaView(s, 'mega-plains');
      expect(L3.megaPatchKey(mv, lod.res)).not.toMatch(/NaN/);
      const patch = L3.megaPatchCanvas(siteDef('mega-plains'), mv, lod)!;
      expect(Number.isFinite(patch.ox) && patch.pc.w > 0).toBe(true);
      expect(patch.pc.data.some((c) => c > 0)).toBe(true);
    }
    // every HVDC route has a continuous track that mixes land and sea where it should
    for (const r of HVDC_ROUTES) {
      const t = L3.hvdcTrack(r, lods[1]);
      expect(t.pts.length).toBeGreaterThan(10);
      for (let i = 1; i < t.pts.length; i++) expect(Math.abs(t.pts[i].x - t.pts[i - 1].x) + Math.abs(t.pts[i].y - t.pts[i - 1].y)).toBeLessThanOrEqual(2);
      if (r.subsea) expect(t.sea.some(Boolean)).toBe(true);
    }
    // visibility: Act III sites only in Act III; launch candidates from Charter phase 2 until one is chosen
    const s3 = act3Fixture(3);
    const launch = SITES.filter((x) => x.kind === 'launch');
    expect(launch.filter((x) => L2.siteVisible(x, s3)).map((x) => x.id)).toEqual(['launch-guiana']);
    const s1 = act3Fixture(0);
    expect(launch.some((x) => L2.siteVisible(x, s1))).toBe(false);
    s1.charter!.phase = 2;
    expect(launch.every((x) => L2.siteVisible(x, s1))).toBe(true);
    s1.act = 2;
    expect(SITES.filter((x) => x.kind === 'charter' || x.kind === 'mega' || x.kind === 'launch').some((x) => L2.siteVisible(x, s1))).toBe(false);
    // the liftoff loop always yields a position (or none, off the top) and a few puffs
    for (let t = 0; t < 6; t += 0.25) {
      const f = L3.launchFrame(t);
      expect(f.rise === null || Number.isFinite(f.rise)).toBe(true);
    }
  });
});

describe('act III portraits', () => {
  it('every partner and faction delegate has a portrait of their own; Bit grows to gen 7', async () => {
    const { ceoPortraitCanvas, portraitCanvas, CEO_IDS } = await import('../src/render/sprites/portraits');
    const { PARTNERS, DELEGATES } = await import('../src/content/charter');
    const generic = ceoPortraitCanvas('nobody').data.join();
    const seen = new Set<string>();
    for (const id of [...Object.keys(PARTNERS), ...Object.keys(DELEGATES)]) {
      expect(CEO_IDS).toContain(id);
      const data = ceoPortraitCanvas(id, 'neutral').data.join();
      expect(data).not.toBe(generic);
      seen.add(data);
    }
    expect(seen.size).toBe(Object.keys(PARTNERS).length + Object.keys(DELEGATES).length);
    const gens = [5, 6, 7].map((g) => portraitCanvas('bit', 'neutral', g).data.join());
    expect(new Set(gens).size).toBe(3);
  });
});

describe.skipIf(!dir)('act III icons and portraits', () => {
  beforeAll(() => setEra(2));
  afterAll(() => setEra(0));

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
    out('act3-ui-icons.png', [sheet], 5);
    // the Act III set alone, bigger, on dark and light panels
    const act3 = ['charter', 'council', 'mission', 'partner', 'world', 'legit', 'capital', 'access', 'vote', 'hvdc', 'launch', 'satellite', 'fusion', 'lock', 'threshold', 'mega', 'evals', 'tender', 'desk', 'faction'] as const;
    const big = new PixelCanvas(act3.length * 12 + 2, 26);
    big.rect(0, 0, big.w, 13, C.ink2);
    big.rect(0, 13, big.w, 13, C.ink8);
    act3.forEach((n, i) => {
      big.blit(iconCanvas(n), 2 + i * 12, 2);
      big.blit(iconCanvas(n), 2 + i * 12, 15);
    });
    out('act3-ui-icons-new.png', [big], 8);
  });

  it('portraits', async () => {
    const { portraitCanvas, ceoPortraitCanvas, CEO_IDS } = await import('../src/render/sprites/portraits');
    const moods = ['neutral', 'happy', 'worried', 'angry', 'excited'] as const;
    const ids = [...CEO_IDS];
    const perCol = Math.ceil(ids.length / 2);
    const sheet = new PixelCanvas(34 * moods.length * 2 + 8, 34 * perCol);
    ids.forEach((id, i) => {
      const col0 = i < perCol ? 0 : 34 * moods.length + 8;
      const row = i % perCol;
      moods.forEach((m, c) => sheet.blit(ceoPortraitCanvas(id, m), col0 + c * 34, row * 34));
    });
    out('act3-portraits-ceos.png', [sheet], 3);
    // neutral close-ups, eight to a row
    const zoom = new PixelCanvas(34 * 8, 34 * Math.ceil(ids.length / 8));
    ids.forEach((id, i) => zoom.blit(ceoPortraitCanvas(id, 'neutral'), (i % 8) * 34, Math.floor(i / 8) * 34));
    out('act3-portraits-zoom.png', [zoom], 5);
    // Bit-0…7 across the moods, and Kip
    const bits = new PixelCanvas(34 * moods.length, 34 * 9);
    for (let g = 0; g <= 7; g++) moods.forEach((m, c) => bits.blit(portraitCanvas('bit', m, g), c * 34, g * 34));
    moods.forEach((m, c) => bits.blit(portraitCanvas('kip', m), c * 34, 8 * 34));
    out('act3-portraits-bit.png', [bits], 3);
    const bz = new PixelCanvas(34 * 4, 34);
    [5, 6, 7].forEach((g, i) => bz.blit(portraitCanvas('bit', 'neutral', g), i * 34, 0));
    bz.blit(portraitCanvas('kip', 'excited'), 3 * 34, 0);
    out('act3-portraits-bit-zoom.png', [bz], 6);
  });
});
