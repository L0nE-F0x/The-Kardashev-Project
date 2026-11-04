/**
 * Act IV art previews (Orbital Dawn): the UI icons, the Act IV map sprites, and the world map
 * with the planet layer (supergrid links in every state, fusion fleets, air capture, rectennas,
 * heat haze, AI banners, greening) at both zoom levels, by day and by night.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act4-map-preview.test.ts
 * The previews are skipped unless PREVIEW_DIR is set; the layer checks and the MapScene smoke
 * test always run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { C, paletteTable, setEra } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { encodePngRgba, pixelCanvasToPng } from '../tools/lib/png';
import { loadWorld } from './helpers/world';
import type { GameState } from '../src/sim/types';

const dir = process.env.PREVIEW_DIR;
const out = (name: string, layers: PixelCanvas[], scale: number) => {
  fs.mkdirSync(dir!, { recursive: true });
  fs.writeFileSync(path.join(dir!, name), pixelCanvasToPng(layers, scale));
};

describe.skipIf(!dir)('act IV icons', () => {
  beforeAll(() => setEra(3));
  afterAll(() => setEra(0));

  it('ui icons', async () => {
    const { iconCanvas } = await import('../src/ui/icons');
    const act4 = ['supergrid', 'fusionfleet', 'dac', 'desal', 'spaceport', 'odc', 'sps', 'debris', 'moon', 'massdriver', 'plan', 'jump', 'heat', 'warming', 'wellbeing', 'ai', 'province', 'orbit'] as const;
    // with a few Act III icons alongside for style
    const row = [...act4, 'fusion', 'hvdc', 'launch', 'satellite', 'world'] as const;
    const big = new PixelCanvas(row.length * 12 + 2, 26);
    big.rect(0, 0, big.w, 13, C.ink2);
    big.rect(0, 13, big.w, 13, C.ink8);
    row.forEach((n, i) => {
      big.blit(iconCanvas(n), 2 + i * 12, 2);
      big.blit(iconCanvas(n), 2 + i * 12, 15);
    });
    out('act4-ui-icons.png', [big], 8);
  });
});

/**
 * Flatten layers like the MapScene does: `under` (terrain and ground), multiplied by the night
 * overlay where it's set, then `over` (lights, lines, markers) on top, upscaled by `scale`.
 */
function composite(under: PixelCanvas[], night: PixelCanvas | null, over: PixelCanvas[], scale: number): Buffer {
  const base = under[0];
  const w = base.w * scale;
  const h = base.h * scale;
  const rgba = new Uint8Array(w * h * 4);
  const pal = paletteTable();
  for (let y = 0; y < base.h; y++) {
    for (let x = 0; x < base.w; x++) {
      const i = y * base.w + x;
      let r = 11, g = 10, b = 18;
      for (const L of under) {
        const c = L.data[i];
        if (c) [r, g, b] = [pal[c * 4], pal[c * 4 + 1], pal[c * 4 + 2]];
      }
      const n = night?.data[i];
      if (n) [r, g, b] = [(r * pal[n * 4]) / 255, (g * pal[n * 4 + 1]) / 255, (b * pal[n * 4 + 2]) / 255];
      for (const L of over) {
        const c = L.data[i];
        if (c) [r, g, b] = [pal[c * 4], pal[c * 4 + 1], pal[c * 4 + 2]];
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const o = ((y * scale + dy) * w + x * scale + dx) * 4;
          rgba[o] = r;
          rgba[o + 1] = g;
          rgba[o + 2] = b;
          rgba[o + 3] = 255;
        }
      }
    }
  }
  return encodePngRgba(w, h, rgba);
}

/** The preview world, with one supergrid link knocked out so every link state shows. */
async function previewState(stage = 3): Promise<GameState> {
  const { act4PreviewState } = await import('../src/sim/planetPreview');
  const s = act4PreviewState({ stage });
  const sahel = s.charter!.projects.find((p) => p.kind === 'link' && p.where === 'sg-sahel');
  if (sahel) sahel.downUntil = s.day + 20;
  // a few provinces doing well, so the greening shows
  s.planet!.provinces.eur.wellbeing = 82;
  s.planet!.provinces.lat.wellbeing = 78;
  s.planet!.provinces.ssa.wellbeing = 70;
  s.planet!.provinces.nor.wellbeing = 90;
  return s;
}

describe.skipIf(!dir)('act IV maps', () => {
  beforeAll(() => setEra(3));
  afterAll(() => setEra(0));

  it('map sprites', async () => {
    const I = await import('../src/render/sprites/act4Icons');
    const I3 = await import('../src/render/sprites/charterIcons');
    const designs = ['tokamak', 'stellarator', 'laser', 'pinch', 'dhe3'] as const;
    const ais = [['bit', 'cyn5'], ['apex', 'red3'], ['weft', 'vio4'], ['sapling', 'grn6']] as const;
    const rows: PixelCanvas[][] = [
      designs.map((d) => I.fusionCanvas(d)),
      designs.map((d, i) => I.fusionCanvas(d, true, 0.2 + i * 0.18)),
      [I.dacCanvas(), I.dacCanvas(false, 1, 1), I.dacCanvas(true, 0.4), I.terminalCanvas('online'), I.terminalCanvas('building'), I.terminalCanvas('down'), I.terminalCanvas('planned')],
      [...ais.map(([a, c]) => I.aiBannerCanvas(a, c, 0)), ...ais.map(([a, c]) => I.aiBannerCanvas(a, c, 1))],
      [I.rectennaCanvas(true), I.rectennaCanvas(true, true, 0.5), I.rectennaCanvas(false), I.rectennaCanvas(false, true, 0.3)],
      [1, 2, 3].map((st) => I3.megaMarkerCanvas('ffleet', st, false)),
    ];
    const grounds = [C.snd6, C.grn4, C.snd5, C.grn5, C.rck3, C.snd4];
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
    out('act4-sprites.png', [pc], 8);
  });

  it('act IV maps', async () => {
    const { SITES, siteDef } = await import('../src/content/sites');
    const { renderTerrain, renderBloom } = await import('../src/render/worldMap/terrain');
    const { renderNight, lightPoints, renderLights } = await import('../src/render/worldMap/night');
    const L2 = await import('../src/render/worldMap/act2Layers');
    const L3 = await import('../src/render/worldMap/act3Layers');
    const L4 = await import('../src/render/worldMap/act4Layers');
    const M = await import('../src/render/sprites/mapIcons');
    const I = await import('../src/render/sprites/charterIcons');
    const I4 = await import('../src/render/sprites/act4Icons');
    const { drawText, measureText } = await import('../src/render/font');
    const { lods, router } = loadWorld();
    const label = (text: string) => {
      const pc = new PixelCanvas(measureText(text) + 2, 7);
      drawText(pc, text, 1, 1, C.white);
      pc.outline(C.ink0, true);
      return pc;
    };
    const terrains = lods.map((lod) => renderTerrain(lod));
    const blooms = lods.map((lod) => renderBloom(lod));

    /** Everything the MapScene draws in Act IV for one LOD, as [under…], night, [over…]. */
    const render = (lodIndex: number, state: GameState, date: Date, opts: { phase?: number; t?: number } = {}) => {
      const lod = lods[lodIndex];
      const fine = lodIndex >= 1;
      const v3 = L3.charterView(state);
      const v4 = L4.planetView(state);
      const ground = new PixelCanvas(lod.W, lod.H);
      const net = new PixelCanvas(lod.W, lod.H);
      const top = new PixelCanvas(lod.W, lod.H);
      const fx = new PixelCanvas(lod.W, lod.H);
      const blitWrap = (dst: PixelCanvas, src: PixelCanvas, x: number, y: number) => {
        dst.blit(src, x, y);
        if (x + src.w > lod.W) dst.blit(src, x - lod.W, y);
        if (x < 0) dst.blit(src, x + lod.W, y);
      };
      const put = (src: PixelCanvas, x: number, y: number) => blitWrap(top, src, x, y);
      const px = (lat: number, lon: number) => ({ x: Math.floor((lon + 180) / lod.res), y: Math.floor((90 - lat) / lod.res) });
      // megaproject ground and its night lights
      const extraLights: { x: number; y: number; c: number }[] = [];
      for (const mv of v3.megas) {
        const site = SITES.find((x) => x.id === mv.siteId)!;
        const patch = L3.megaPatchCanvas(site, mv, lod);
        if (!patch) continue;
        const p = px(site.lat, site.lon);
        blitWrap(ground, patch.pc, p.x + patch.ox, p.y + patch.oy);
        for (const l of L3.megaPatchLights(patch.pc)) extraLights.push({ x: p.x + patch.ox + l.x, y: p.y + patch.oy + l.y, c: l.c });
      }
      // provinces, rectennas
      const prov = L4.paintProvinces(lod, v4, opts.phase ?? 0);
      for (const r of v4.rectennas) {
        const patch = L4.rectennaPatch(r, lod);
        const p = px(r.lat, r.lon);
        blitWrap(ground, patch.pc, p.x + patch.ox, p.y + patch.oy);
      }
      // cables, fiber, HVDC, the supergrid
      const track = (c: { a: string; b: string }) => L2.trackPixels(L2.seaPath(router, c.a, c.b)!, lod);
      L2.paintNetwork(net, lod, state, track);
      const draws = L3.hvdcDraws(v3, lod);
      L3.paintHvdc(net, lod, draws);
      if (v3.orbitalTest) L3.paintOrbit(net, lod);
      const sg = L4.sgDraws(v4, lod);
      L4.paintSupergrid(net, lod, sg);
      // the blink of a link that's down, on its "on" frame
      for (const p of L4.sgDownPixels(sg)) net.set(((p.x % lod.W) + lod.W) % lod.W, p.y, C.red3);
      for (const d of draws) {
        const pts = d.track.pts;
        for (const end of [pts[0], pts[pts.length - 1]]) put(I.converterCanvas(d.online), end.x - 3, end.y - 4);
      }
      for (const d of sg) {
        if (d.status === 'planned') continue;
        const pts = d.track.pts;
        for (const end of [pts[0], pts[pts.length - 1]]) {
          const tc = I4.terminalCanvas(d.status);
          put(tc, end.x - Math.floor(tc.w / 2), end.y - tc.h + 2);
        }
        if (d.status === 'building') {
          const i = Math.floor(d.progress * (pts.length - 1));
          const p = pts[i];
          if (d.track.sea[i]) put(M.cableShipCanvas(), p.x - 3, p.y - 3);
          else {
            const cr = I.craneCanvas(d.builder, true);
            put(cr, p.x - 2, p.y - cr.h + 1);
          }
        }
        // a few aurora pulses, flowing from the sunlit end
        if (d.status === 'online') {
          const flow = L4.sgFlow(v4.links.find((l) => l.route.id === d.id)!.route, date);
          const n = Math.max(2, Math.round(pts.length / 34));
          for (let k = 0; k < n; k++) {
            const tt = ((k + (opts.t ?? 0.3)) / n) % 1;
            const along = flow.dir > 0 ? tt : 1 - tt;
            const back = flow.dir > 0 ? Math.max(0, tt - 2.5 / pts.length) : Math.min(1, 1 - tt + 2.5 / pts.length);
            const q = L2.trackAt(pts, along);
            const r = L2.trackAt(pts, back);
            const sz = fine ? 2 : 1;
            fx.rect(((r.x % lod.W) + lod.W) % lod.W, r.y, sz, sz, C.cyn4);
            fx.rect(((q.x % lod.W) + lod.W) % lod.W, q.y, sz, sz, C.cyn6);
          }
        }
      }
      const labels: [PixelCanvas, number, number][] = [];
      for (const site of SITES) {
        if (!L2.siteVisible(site, state)) continue;
        const p = px(site.lat, site.lon);
        const m = L2.siteMarker(site, state, false, false, {});
        const pc = m.make();
        const o = L3.markerOrigin(p.x, p.y, pc.w, pc.h, m.lift);
        put(pc, o.x, o.y);
        if (fine && (L2.siteGlyphs(state, site.id).length || L3.act3Label(site, state))) {
          const lb = label(site.kind === 'build' ? site.name.toUpperCase() : site.name.split('·')[0].trim().toUpperCase());
          labels.push([lb, p.x - Math.floor(lb.w / 2), o.y - lb.h - 1]);
        }
        if (site.kind === 'mega') {
          const mv = v3.megas.find((x) => x.siteId === site.id)!;
          const cranes = L3.megaCranes(mv).map((col) => I.craneCanvas(col));
          L3.craneSpots(p.x, p.y, pc.w, pc.h, cranes).forEach((s, i) => put(cranes[i], s.x, s.y));
          const g4 = L4.siteGlyphs4(v4).get(site.id) ?? [];
          const glyphs = g4.map((g) => (g.kind === 'fusion' ? I4.fusionCanvas(g.design, g.building, g.progress) : I4.dacCanvas(g.building, g.progress)));
          L4.glyphRow4(p.x, p.y, pc.h, glyphs).forEach((s, i) => put(glyphs[i], s.x, s.y));
        }
      }
      for (const a of v3.anchors) {
        const p = px(a.lat, a.lon);
        const glyphs = L3.anchorGlyphs(a).map((g) => I.anchorGlyphCanvas(g.kind, g.builder, g.building));
        L3.rowSpots(p.x, p.y, glyphs).forEach((s, i) => put(glyphs[i], s.x, s.y));
      }
      for (const b of L4.aiBanners(v4)) {
        const p = px(b.lat, b.lon);
        const bc = I4.aiBannerCanvas(b.ai, b.color, 0);
        const spot = L4.bannerSpot(p.x, p.y, bc.w, bc.h);
        put(bc, spot.x, spot.y);
      }
      for (const [lb, x, y] of labels) put(lb, x, y);
      // night: the shade and the lights (cities, megaprojects, fusion plants, rectennas)
      const night = renderNight(lod, date);
      const lights = renderLights(lod, night, [...lightPoints(lod), ...extraLights, ...L4.act4Lights(v4, lod)]);
      void siteDef;
      return { under: [terrains[lodIndex], blooms[lodIndex], ground, prov], night, over: [lights, net, fx, top] };
    };
    const crop = (pc: PixelCanvas, x: number, y: number, w: number, h: number) => {
      const o = new PixelCanvas(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set(i, j, pc.get((((x + i) % pc.w) + pc.w) % pc.w, y + j));
      return o;
    };
    type R = ReturnType<typeof render>;
    const shot = (name: string, r: R, x: number, y: number, w: number, h: number, scale: number, nightOn: boolean) => {
      fs.mkdirSync(dir!, { recursive: true });
      fs.writeFileSync(path.join(dir!, name), composite(r.under.map((l) => crop(l, x, y, w, h)), nightOn ? crop(r.night, x, y, w, h) : null, r.over.map((l) => crop(l, x, y, w, h)), scale));
    };
    const s = await previewState(3);
    // noon over Africa, and midnight there (the Pacific in daylight)
    const noonAfrica = new Date(Date.UTC(2062, 5, 21, 11, 0));
    const midnightAfrica = new Date(Date.UTC(2062, 5, 21, 23, 0));
    const t0 = performance.now();
    const day = render(1, s, noonAfrica);
    console.log(`act IV map render ${(performance.now() - t0).toFixed(0)} ms`);
    const night = render(1, s, midnightAfrica, { phase: 1, t: 0.6 });
    shot('act4-day-europe-africa.png', day, 600, 100, 420, 380, 3, true);
    shot('act4-night-europe-africa.png', night, 600, 100, 420, 380, 3, true);
    shot('act4-day-asia.png', day, 1000, 110, 440, 340, 3, true);
    shot('act4-night-asia.png', night, 1000, 110, 440, 340, 3, true);
    shot('act4-day-americas.png', day, 160, 90, 440, 380, 3, true);
    shot('act4-night-pacific.png', night, 1240, 40, 520, 300, 3, true);
    // close-ups at 6×: the Sahara and the Gulf of Guinea, the Bay of Bengal, the Atlantic Bridge's end
    shot('act4-zoom-sahara.png', day, 680, 210, 150, 120, 6, false);
    shot('act4-zoom-india.png', day, 980, 200, 160, 110, 6, false);
    shot('act4-zoom-atlantic.png', night, 600, 130, 150, 90, 6, true);
    // the second shimmer phase over the hot provinces
    shot('act4-zoom-sahara-phase1.png', render(1, s, noonAfrica, { phase: 1 }), 680, 210, 150, 120, 6, false);
    // the whole world at the zoomed-out level, day and night
    const w0 = render(0, s, noonAfrica);
    shot('act4-world-lod0-day.png', w0, 0, 0, lods[0].W, lods[0].H, 2, true);
    shot('act4-world-lod0-night.png', render(0, s, midnightAfrica), 0, 0, lods[0].W, lods[0].H, 2, true);
    // stage 1: no heat haze yet, planned links show
    const s1 = await previewState(1);
    shot('act4-s1-europe-africa.png', render(1, s1, noonAfrica), 600, 100, 420, 380, 3, true);
  });
});

// ── the real MapScene, headless, with an Act IV state ─────────────────────────────────────────
const fakeCanvas = () => ({
  width: 0, height: 0, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} }),
  toDataURL: () => 'data:',
});

describe('act IV map scene', () => {
  it('runs Act IV frames: supergrid, fusion, DAC, rectennas, provinces, banners — and clears them after', async () => {
    (globalThis as any).document ??= { createElement: fakeCanvas, documentElement: { style: { setProperty() {} } } };
    (globalThis as any).window ??= globalThis;
    const { MapScene } = await import('../src/render/worldMap/mapScene');
    const { act3Fixture } = await import('./helpers/act3fixture');
    const world = loadWorld();
    const s = await previewState(3);
    const game: any = {
      world, state: s, view: s, mode: 'map', hover: null, selection: null, tool: null,
      settings: { clouds: true, dayNight: true, reducedMotion: false, wheel: 'zoom' },
      dayFraction: () => 0.5, setHover() {}, select() {}, linkClick() {}, enterDiorama() {},
    };
    setEra(3);
    const scene = new MapScene(game);
    const sc = scene as any;
    for (let i = 0; i < 40; i++) scene.update(1 / 60, i * 16);
    expect(sc.province).toBeTruthy();
    expect(sc.rectennaSprites.length).toBeGreaterThan(0);
    expect(sc.glyph4Sprites.length).toBeGreaterThan(0);
    expect(sc.bannerSprites.length).toBe(4);
    expect(sc.sgSprites.length).toBeGreaterThan(0);
    expect(sc.sgPulses.length).toBeGreaterThan(0);
    expect(sc.planetLights.pts.length).toBeGreaterThan(0);
    for (const p of sc.sgPulses) expect(Number.isFinite(p.sprite.x) && Number.isFinite(p.sprite.y)).toBe(true);
    scene.zoomIn();
    for (let i = 0; i < 30; i++) scene.update(1 / 60, 800 + i * 16);
    expect(sc.province.lod).toBe(1);
    expect(sc.sgPulses.length).toBeGreaterThan(0);
    game.settings.reducedMotion = true;
    for (let i = 0; i < 5; i++) scene.update(1 / 60, 1400 + i * 16);
    // back to Act III: the Act IV layers go away, the Charter's stay
    const s3 = act3Fixture(3);
    game.view = game.state = s3;
    for (let i = 0; i < 5; i++) scene.update(1 / 60, 1600 + i * 16);
    expect(sc.province).toBe(null);
    expect(sc.rectennaSprites.length).toBe(0);
    expect(sc.glyph4Sprites.length).toBe(0);
    expect(sc.bannerSprites.length).toBe(0);
    expect(sc.sgSprites.length).toBe(0);
    expect(sc.sgPulses.length).toBe(0);
    expect(sc.megaSprites.size).toBeGreaterThan(0);
    setEra(0);
  });
});

describe('act IV map layers', () => {
  it('supergrid tracks, flows, province overlays and glyph rows stay well-formed', async () => {
    const { SUPERGRID_ROUTES } = await import('../src/content/planet');
    const L3 = await import('../src/render/worldMap/act3Layers');
    const L4 = await import('../src/render/worldMap/act4Layers');
    const { lods } = loadWorld();
    for (const r of SUPERGRID_ROUTES) {
      for (const lod of lods) {
        const t = L3.hvdcTrack(r, lod);
        expect(t.pts.length).toBeGreaterThan(4);
        for (let i = 1; i < t.pts.length; i++) expect(Math.abs(t.pts[i].x - t.pts[i - 1].x) + Math.abs(t.pts[i].y - t.pts[i - 1].y)).toBeLessThanOrEqual(2);
      }
      if (r.subsea) expect(L3.hvdcTrack(r, lods[1]).sea.some(Boolean)).toBe(true);
      const f = L4.sgFlow(r, new Date(Date.UTC(2062, 0, 1, 12)));
      expect([1, -1]).toContain(f.dir);
      expect(f.strength).toBeGreaterThanOrEqual(0);
      expect(f.strength).toBeLessThanOrEqual(1);
    }
    const s = await previewState(3);
    const v = L4.planetView(s);
    expect(new Set(v.links.map((l) => l.status))).toEqual(new Set(['planned', 'building', 'online', 'down']));
    // every province overlay paints something somewhere (green or haze), only on land
    const pc = L4.paintProvinces(lods[0], v, 0);
    expect(pc.data.some((c) => c > 0)).toBe(true);
    const sg = L4.sgDraws(v, lods[1]);
    const net = new PixelCanvas(lods[1].W, lods[1].H);
    L4.paintSupergrid(net, lods[1], sg);
    expect(net.data.some((c) => c === C.white)).toBe(true);
    expect(net.data.some((c) => c === C.red1)).toBe(true);
    // glyph rows: one spot per glyph, no NaNs
    const g = L4.siteGlyphs4(v);
    expect(g.size).toBeGreaterThan(0);
    for (const list of g.values()) {
      const spots = L4.glyphRow4(100, 100, 9, list.map(() => ({ w: 9, h: 7 })));
      expect(spots.length).toBe(list.length);
      for (const p of spots) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    // Act III states have no planet layer
    const { act3Fixture } = await import('./helpers/act3fixture');
    expect(L4.act4On(act3Fixture(3))).toBe(false);
    expect(L4.planetView(act3Fixture(3)).active).toBe(false);
  });
});
