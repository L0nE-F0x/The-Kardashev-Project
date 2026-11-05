/**
 * Act V map previews (Swarmlight): what Earth becomes. The garden ↔ forge tint over every
 * province (woods of tiny trees, wildflowers and ponds in the gardens; grey-orange haze and
 * factories in the forges, their chimneys glowing at night) and the rectenna fields where the
 * swarm's beams come down, on top of the Act III–IV map layers, at both zoom levels, by day and
 * by night.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act5-map-preview.test.ts
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

/** Flatten layers like the MapScene: `under`, multiplied by the night shade where set, then `over`, upscaled. */
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

async function act5State(): Promise<GameState> {
  const { act5PreviewState } = await import('../src/sim/systemPreview');
  return act5PreviewState();
}

describe.skipIf(!dir)('act V maps', () => {
  beforeAll(() => setEra(4));
  afterAll(() => setEra(0));

  it('map sprites', async () => {
    const I5 = await import('../src/render/sprites/act5Icons');
    const I4 = await import('../src/render/sprites/act4Icons');
    const L5 = await import('../src/render/worldMap/act5Layers');
    const rows: PixelCanvas[][] = [
      [I5.beamFieldCanvas(true), I5.beamFieldCanvas(true, true, 0.25), I5.beamFieldCanvas(true, true, 0.625), I4.rectennaCanvas(true), I4.rectennaCanvas(false)],
      [I5.beamFieldCanvas(false), I5.beamFieldCanvas(false, true, 0.5)],
      [1, 2, 3, 5].map((n) => L5.beamPatch({ region: 'mena', lat: 0, lon: 0, fields: n, building: n === 2 ? [0.5] : [] }, { res: 0.25 }).pc),
    ];
    const grounds = [C.snd6, C.grn4, C.snd5];
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
    fs.mkdirSync(dir!, { recursive: true });
    fs.writeFileSync(path.join(dir!, 'act5-sprites.png'), pixelCanvasToPng([pc], 8));
  });

  it('act V maps', async () => {
    const { SITES } = await import('../src/content/sites');
    const { renderTerrain, renderBloom } = await import('../src/render/worldMap/terrain');
    const { renderNight, lightPoints, renderLights } = await import('../src/render/worldMap/night');
    const L2 = await import('../src/render/worldMap/act2Layers');
    const L3 = await import('../src/render/worldMap/act3Layers');
    const L4 = await import('../src/render/worldMap/act4Layers');
    const L5 = await import('../src/render/worldMap/act5Layers');
    const I = await import('../src/render/sprites/charterIcons');
    const I4 = await import('../src/render/sprites/act4Icons');
    const { lods, router } = loadWorld();
    const terrains = lods.map((lod) => renderTerrain(lod));
    const blooms = lods.map((lod) => renderBloom(lod));
    /** Everything the MapScene draws in Act V for one LOD, as [under…], night, [over…]. */
    const render = (lodIndex: number, state: GameState, date: Date, opts: { act5?: boolean } = {}) => {
      const lod = lods[lodIndex];
      const v3 = L3.charterView(state);
      const v4 = L4.planetView(state);
      const v5 = L5.earthMapView(state);
      const on5 = opts.act5 !== false;
      const mega = new PixelCanvas(lod.W, lod.H);
      const ground4 = new PixelCanvas(lod.W, lod.H);
      const ground5 = new PixelCanvas(lod.W, lod.H);
      const net = new PixelCanvas(lod.W, lod.H);
      const top = new PixelCanvas(lod.W, lod.H);
      const blitWrap = (dst: PixelCanvas, src: PixelCanvas, x: number, y: number) => {
        dst.blit(src, x, y);
        if (x + src.w > lod.W) dst.blit(src, x - lod.W, y);
        if (x < 0) dst.blit(src, x + lod.W, y);
      };
      const put = (src: PixelCanvas, x: number, y: number) => blitWrap(top, src, x, y);
      const px = (lat: number, lon: number) => ({ x: Math.floor((lon + 180) / lod.res), y: Math.floor((90 - lat) / lod.res) });
      const extraLights: { x: number; y: number; c: number }[] = [];
      for (const mv of v3.megas) {
        const site = SITES.find((x) => x.id === mv.siteId)!;
        const patch = L3.megaPatchCanvas(site, mv, lod);
        if (!patch) continue;
        const p = px(site.lat, site.lon);
        blitWrap(mega, patch.pc, p.x + patch.ox, p.y + patch.oy);
        for (const l of L3.megaPatchLights(patch.pc)) extraLights.push({ x: p.x + patch.ox + l.x, y: p.y + patch.oy + l.y, c: l.c });
      }
      // Act V: the garden ↔ forge ground and the beam fields (under the Act IV province overlay)
      const earth = on5 ? L5.paintEarth(lod, v5) : new PixelCanvas(lod.W, lod.H);
      if (on5) {
        for (const c of L5.beamClusters(v5)) {
          const patch = L5.beamPatch(c, lod);
          const p = px(c.lat, c.lon);
          blitWrap(ground5, patch.pc, p.x + patch.ox, p.y + patch.oy);
        }
      }
      // Act IV: provinces, rectennas
      const prov = L4.paintProvinces(lod, v4, 0);
      for (const r of v4.rectennas) {
        const patch = L4.rectennaPatch(r, lod);
        const p = px(r.lat, r.lon);
        blitWrap(ground4, patch.pc, p.x + patch.ox, p.y + patch.oy);
      }
      const track = (c: { a: string; b: string }) => L2.trackPixels(L2.seaPath(router, c.a, c.b)!, lod);
      L2.paintNetwork(net, lod, state, track);
      const draws = L3.hvdcDraws(v3, lod);
      L3.paintHvdc(net, lod, draws);
      const sg = L4.sgDraws(v4, lod);
      L4.paintSupergrid(net, lod, sg);
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
      }
      for (const site of SITES) {
        if (!L2.siteVisible(site, state)) continue;
        const p = px(site.lat, site.lon);
        const m = L2.siteMarker(site, state, false, false, {});
        const pc = m.make();
        const o = L3.markerOrigin(p.x, p.y, pc.w, pc.h, m.lift);
        put(pc, o.x, o.y);
        if (site.kind === 'mega') {
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
      const night = renderNight(lod, date);
      const lights = renderLights(lod, night, [...lightPoints(lod), ...extraLights, ...L4.act4Lights(v4, lod), ...(on5 ? L5.act5Lights(v5, lod) : [])]);
      return { under: [terrains[lodIndex], blooms[lodIndex], mega, earth, ground5, prov, ground4], night, over: [lights, net, top] };
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
    const s = await act5State();
    const noonAfrica = new Date(Date.UTC(2084, 5, 21, 11, 0));
    const midnightAfrica = new Date(Date.UTC(2084, 5, 21, 23, 0));
    const t0 = performance.now();
    const day = render(1, s, noonAfrica);
    console.log(`act V map render ${(performance.now() - t0).toFixed(0)} ms`);
    const night = render(1, s, midnightAfrica);
    // Europe (garden) and North Africa / the Middle East (forge)
    shot('act5-day-europe-africa.png', day, 600, 100, 420, 380, 3, true);
    shot('act5-night-europe-africa.png', night, 600, 100, 420, 380, 3, true);
    shot('act5-day-asia.png', day, 1000, 110, 440, 340, 3, true);
    shot('act5-night-asia.png', night, 1000, 110, 440, 340, 3, true);
    shot('act5-day-americas.png', day, 160, 90, 440, 380, 3, true);
    // close-ups at 6×: the Nordics (garden 85) and France (70), Egypt (forge −60) with its beam fields,
    // Korea and China (fab −45, eam −20, a field going up), the Thar's field (sas)
    shot('act5-zoom-nordics.png', day, 700, 90, 160, 110, 6, false);
    shot('act5-zoom-france.png', day, 690, 150, 110, 80, 6, false);
    shot('act5-zoom-egypt.png', day, 800, 220, 150, 110, 6, false);
    shot('act5-zoom-egypt-night.png', night, 800, 220, 150, 110, 6, true);
    shot('act5-zoom-korea-china.png', day, 1160, 170, 160, 110, 6, false);
    shot('act5-zoom-thar.png', day, 970, 220, 110, 80, 6, false);
    // the same Europe/Africa crop without the Act V layers, for comparison
    shot('act5-off-europe-africa.png', render(1, s, noonAfrica, { act5: false }), 600, 100, 420, 380, 3, true);
    // the whole world at the zoomed-out level, day and night
    shot('act5-world-lod0-day.png', render(0, s, noonAfrica), 0, 0, lods[0].W, lods[0].H, 2, true);
    shot('act5-world-lod0-night.png', render(0, s, midnightAfrica), 0, 0, lods[0].W, lods[0].H, 2, true);
  });
});

// ── the real MapScene, headless, with an Act V state ──────────────────────────────────────────
const fakeCanvas = () => ({
  width: 0, height: 0, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} }),
  toDataURL: () => 'data:',
});

describe('act V map scene', () => {
  it('runs Act V frames: garden and forge ground, beam fields, chimney lights — and clears them after', async () => {
    (globalThis as any).document ??= { createElement: fakeCanvas, documentElement: { style: { setProperty() {} } } };
    (globalThis as any).window ??= globalThis;
    const { MapScene } = await import('../src/render/worldMap/mapScene');
    const { act4PreviewState } = await import('../src/sim/planetPreview');
    const world = loadWorld();
    const s = await act5State();
    const game: any = {
      world, state: s, view: s, mode: 'map', hover: null, selection: null, tool: null,
      settings: { clouds: true, dayNight: true, reducedMotion: false, wheel: 'zoom' },
      dayFraction: () => 0.5, setHover() {}, select() {}, linkClick() {}, enterDiorama() {},
    };
    setEra(4);
    const scene = new MapScene(game);
    const sc = scene as any;
    for (let i = 0; i < 20; i++) scene.update(1 / 60, i * 16);
    expect(sc.earthGround).toBeTruthy();
    expect(sc.earthGround.pc.data.some((c: number) => c > 0)).toBe(true);
    expect(sc.beamSprites.length).toBe(3);
    expect(sc.earthLights.pts.length).toBeGreaterThan(0);
    // the Act IV layers keep running underneath
    expect(sc.province).toBeTruthy();
    scene.zoomIn();
    for (let i = 0; i < 10; i++) scene.update(1 / 60, 800 + i * 16);
    expect(sc.earthGround.lod).toBe(1);
    expect(sc.beamSprites.length).toBe(3);
    for (const b of sc.beamSprites) expect(Number.isFinite(b.sprite.x) && Number.isFinite(b.sprite.y)).toBe(true);
    // a province turns from forge to garden: the ground repaints (after its throttle; the ground is a per-LOD cache shared by scenes)
    s.system!.garden.mena = 60;
    sc.earthGround.layer.built -= 5000;
    for (let i = 0; i < 3; i++) scene.update(1 / 60, 1200 + i * 16);
    expect(sc.earthGround.layer.key).toContain('mena6');
    // back to Act IV: the Act V layers go away, the planet's stay
    const s4 = act4PreviewState({ stage: 3 });
    game.view = game.state = s4;
    for (let i = 0; i < 5; i++) scene.update(1 / 60, 1600 + i * 16);
    expect(sc.earthGround).toBe(null);
    expect(sc.beamSprites.length).toBe(0);
    expect(sc.earthLights.pts.length).toBe(0);
    expect(sc.province).toBeTruthy();
    scene.destroy();
    setEra(0);
  });
});

describe('act V map layers', () => {
  it('paints gardens green and forges grey on land only, beam fields on land in their province', async () => {
    const L5 = await import('../src/render/worldMap/act5Layers');
    const { BIOME, CODE_BY_REGION, REGION_IDS } = await import('../src/content/mapcodes');
    const { lods } = loadWorld();
    const s = await act5State();
    const v = L5.earthMapView(s);
    expect(v.active).toBe(true);
    expect(L5.earthMapView(s)).toBe(v);
    for (const lod of lods) {
      const pc = L5.paintEarth(lod, v);
      const count = (region: string, cols: number[]) => {
        const code = CODE_BY_REGION[region as keyof typeof CODE_BY_REGION];
        let n = 0;
        for (let i = 0; i < pc.data.length; i++) if (lod.region[i] === code && cols.includes(pc.data[i])) n++;
        return n;
      };
      // Nordics (garden 85) green, MENA (forge −60) grey
      expect(count('nor', [C.grn2, C.grn3, C.grn5, C.grn6, C.grn7])).toBeGreaterThan(50);
      expect(count('mena', [C.rck3, C.rck4, C.snd3])).toBeGreaterThan(50);
      expect(count('mena', [C.grn2, C.grn3, C.grn6, C.grn7])).toBe(0);
      // nothing on the open sea
      for (let i = 0; i < pc.data.length; i++) if (pc.data[i]) expect(lod.biome[i] === BIOME.OCEAN).toBe(false);
      // factories only in forge provinces
      for (const p of L5.factorySpots(lod, v)) {
        const r = REGION_IDS.find((id) => CODE_BY_REGION[id] === lod.region[p.y * lod.W + p.x])!;
        expect(v.provinces.find((q) => q.region === r)!.garden).toBeLessThan(0);
      }
    }
    // every beam spot sits on land inside its own province
    const lod = lods[1];
    for (const r of REGION_IDS) {
      const [lat, lon] = L5.BEAM_AT[r];
      const i = Math.floor((90 - lat) / lod.res) * lod.W + Math.floor((lon + 180) / lod.res);
      expect(lod.biome[i]).not.toBe(BIOME.OCEAN);
      expect(lod.region[i]).toBe(CODE_BY_REGION[r]);
    }
    // the preview's beams: Egypt (60 TW: two fields), the Thar (20 TW: one), East Asia going up
    const clusters = L5.beamClusters(v);
    expect(clusters.map((c) => [c.region, c.fields, c.building.length])).toEqual([['mena', 2, 0], ['sas', 1, 0], ['eam', 0, 1]]);
    for (const c of clusters) {
      const patch = L5.beamPatch(c, lod);
      expect(patch.pc.data.some((x) => x > 0)).toBe(true);
      expect(patch.masts.length).toBe(c.fields);
    }
    expect(L5.beamKey(v)).toBe('mena:2:,sas:1:,eam:0:0.625');
    expect(L5.act5Lights(v, lod).length).toBeGreaterThan(c3(clusters));
    // a neutral province stays as it is; no system, no layer
    expect(L5.gardenLevel({ garden: 4 })).toBe(0);
    const { act4PreviewState } = await import('../src/sim/planetPreview');
    const s4 = act4PreviewState({ stage: 3 });
    expect(L5.act5On(s4)).toBe(false);
    expect(L5.earthMapView(s4).active).toBe(false);
    expect(L5.paintEarth(lods[0], L5.earthMapView(s4)).data.some((c) => c > 0)).toBe(false);
  });
});

/** Finished fields across the clusters (each adds a mast light). */
function c3(clusters: { fields: number }[]): number {
  return clusters.reduce((a, c) => a + c.fields, 0);
}
