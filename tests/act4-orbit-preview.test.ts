/**
 * The orbit view (Orbital Dawn): the Earth with the real sun, the Moon and its base, the three
 * shells, data centres, space-solar stations beaming down, launches, debris and the cascade,
 * drawn headless at a desktop size, a phone's 800×360 and a tall portrait screen.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act4-orbit-preview.test.ts
 * The previews are skipped unless PREVIEW_DIR is set; the layout checks and the OrbitScene smoke
 * test always run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setEra } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { pixelCanvasToPng } from '../tools/lib/png';
import { loadWorld } from './helpers/world';

const dir = process.env.PREVIEW_DIR;
const out = (name: string, pc: PixelCanvas, scale: number) => {
  fs.mkdirSync(dir!, { recursive: true });
  fs.writeFileSync(path.join(dir!, name), pixelCanvasToPng([pc], scale));
};

describe.skipIf(!dir)('orbit view previews', () => {
  beforeAll(() => setEra(3));
  afterAll(() => setEra(0));

  it('frames at three sizes, with and without the cascade', async () => {
    const A = await import('../src/render/orbit/orbitArt');
    const { act4PreviewState } = await import('../src/sim/planetPreview');
    const { orbitView, planetMapView } = await import('../src/sim/planetView');
    const { lods } = loadWorld();
    const s = act4PreviewState({ stage: 3, moon: 3 });
    const ov = orbitView(s);
    const pv = planetMapView(s);
    // an evening over the Atlantic: Europe and Africa at dusk, the Americas in the afternoon
    const sun = { lat: 18, lon: -35 };
    const frame = (w: number, h: number, opts: { cascade?: number | null; t?: number; lon0?: number; lat0?: number; still?: boolean; moonHover?: boolean } = {}) => {
      const L = A.orbitLayout(w, h);
      const lod = L.r >= 60 ? lods[1] : lods[0];
      const pc = new PixelCanvas(w, h);
      const t0 = performance.now();
      A.renderOrbitFrame(pc, L, {
        terrain: A.orbitTerrain(lod, true), res: lod.res, smooth: L.r < 60,
        cam: { lon0: opts.lon0 ?? 10, lat0: opts.lat0 ?? 22 }, sun, planet: pv,
        orbit: { ...ov, cascade: opts.cascade ?? null }, t: opts.t ?? 3.2, opts: { still: opts.still, moonHover: opts.moonHover },
      });
      if (w === 800) console.log(`orbit frame ${w}×${h}: ${(performance.now() - t0).toFixed(0)} ms`);
      return pc;
    };
    out('act4-orbit-640x360.png', frame(640, 360), 3);
    out('act4-orbit-800x360.png', frame(800, 360, { t: 5.1 }), 2);
    out('act4-orbit-800x360-cascade.png', frame(800, 360, { cascade: 72, t: 5.4 }), 2);
    out('act4-orbit-360x780.png', frame(360, 780, { t: 2.2 }), 2);
    // close-ups at 4×: the cascade over low orbit, the space-solar beam, the Moon base
    const crop = (pc: PixelCanvas, x: number, y: number, w: number, h: number) => {
      const o = new PixelCanvas(w, h);
      o.blit(pc, -x, -y);
      return o;
    };
    const c640 = frame(640, 360, { cascade: 80, t: 6.3 });
    out('act4-orbit-zoom-cascade.png', crop(c640, 120, 100, 320, 200), 4);
    const n640 = frame(640, 360, { lon0: 60, t: 4.4 });
    out('act4-orbit-zoom-beams.png', crop(n640, 250, 60, 260, 200), 4);
    out('act4-orbit-zoom-moon.png', crop(n640, 540, 70, 90, 90), 8);
    // launches climbing out of Guiana, at a few moments
    const shots = [1.0, 2.3, 3.9].map((t) => crop(frame(640, 360, { lon0: -30, lat0: 12, t }), 110, 70, 200, 220));
    const strip = new PixelCanvas(600, 220);
    shots.forEach((c, i) => strip.blit(c, i * 200, 0));
    out('act4-orbit-zoom-launches.png', strip, 3);
    out('act4-orbit-640x360-night.png', frame(640, 360, { lon0: 120, t: 8.8 }), 3);
    out('act4-orbit-640x360-still.png', frame(640, 360, { still: true, moonHover: true, lat0: 35 }), 3);
    // early on: an outpost on the Moon, no stations yet
    const e = act4PreviewState({ stage: 3, moon: 1 });
    e.charter!.projects = e.charter!.projects.filter((p) => p.kind !== 'sps' && p.kind !== 'odc');
    const ev = orbitView(e);
    const L = A.orbitLayout(640, 360);
    const pc = new PixelCanvas(640, 360);
    A.renderOrbitFrame(pc, L, { terrain: A.orbitTerrain(lods[1], true), res: lods[1].res, cam: { lon0: -50, lat0: 20 }, sun, planet: planetMapView(e), orbit: ev, t: 1.5 });
    out('act4-orbit-early.png', pc, 3);
    // the Moon close up at each stage
    const moons = new PixelCanvas(4 * 44, 44);
    for (let st = 0; st <= 3; st++) {
      const m = new PixelCanvas(A.moonSize(18), A.moonSize(18));
      A.paintMoon(m, 18, A.sunView(sun, { lon0: 10, lat0: 22 }), { stage: st, building: null, he3: st >= 2 });
      moons.blit(m, st * 44, 0);
    }
    out('act4-orbit-moons.png', moons, 6);
  });
});

describe('orbit layout', () => {
  it('fits every size, keeps the rings on screen and projects sanely', async () => {
    const A = await import('../src/render/orbit/orbitArt');
    for (const [w, h] of [[640, 360], [800, 360], [480, 270], [360, 780], [1280, 720], [320, 640]]) {
      const L = A.orbitLayout(w, h);
      expect(L.r).toBeGreaterThan(20);
      // the Moon is on screen and clear of the Earth
      expect(L.moon.x - L.moon.r).toBeGreaterThanOrEqual(0);
      expect(L.moon.x + L.moon.r).toBeLessThanOrEqual(w);
      expect(L.moon.y - L.moon.r).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(L.moon.x - L.cx, L.moon.y - L.cy)).toBeGreaterThan(L.r * 1.5 + L.moon.r);
      // the geostationary belt's ends fit across the screen
      const cam = { lon0: 0, lat0: 22 };
      for (const lon of [90, -90]) {
        const p = A.screen(L, A.geoPoint(L, cam, lon));
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w);
      }
    }
    const L = A.orbitLayout(640, 360);
    const cam = { lon0: 30, lat0: 20 };
    // the point under the camera is the disc's centre, in front
    const c = A.toView(20, 30, cam);
    expect(c[0]).toBeCloseTo(0);
    expect(c[1]).toBeCloseTo(0);
    expect(c[2]).toBeCloseTo(1);
    expect(A.depth(L, c)).toBe('front');
    // the far side is hidden, a far point beside the disc shows behind it
    expect(A.depth(L, A.toView(-20, -150, cam))).toBe('hidden');
    expect(A.depth(L, A.ringPoint(L.leo, -Math.PI / 2 + 0.05))).not.toBe('front');
    expect(A.depth(L, A.ringPoint(L.leo, 0))).not.toBe('hidden');
  });
});

// ── the real OrbitScene, headless ──────────────────────────────────────────────────────────────
const fakeCanvas = () => ({
  width: 0, height: 0, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} }),
  toDataURL: () => 'data:',
});

describe('orbit scene', () => {
  it('runs frames, turns under a drag, opens the Moon on a tap, survives resizes, settings and the cascade', async () => {
    (globalThis as any).document ??= { createElement: fakeCanvas, documentElement: { style: { setProperty() {} } } };
    (globalThis as any).window ??= globalThis;
    const { OrbitScene } = await import('../src/render/orbit/orbitScene');
    const { act4PreviewState } = await import('../src/sim/planetPreview');
    const world = loadWorld();
    const s = act4PreviewState({ stage: 3, moon: 3 });
    const calls: string[] = [];
    const game: any = {
      world, state: s, view: s, mode: 'map',
      settings: { reducedMotion: false, batterySaver: false },
      enterDiorama: (id: string) => calls.push(`diorama:${id}`),
      enterMap: () => calls.push('map'),
    };
    setEra(3);
    const scene = new OrbitScene(game);
    const sc = scene as any;
    scene.resize(640, 360);
    for (let i = 0; i < 60; i++) scene.update(1 / 60, i * 16);
    expect(sc.globe.pc.data.some((c: number) => c > 0)).toBe(true);
    expect(sc.frontPool.size + sc.backPool.size).toBeGreaterThan(20);
    expect(sc.labels.length).toBe(4);
    // the camera drifts on its own
    const lon = sc.cam.lon0;
    for (let i = 0; i < 30; i++) scene.update(1 / 30, 1000 + i * 33);
    expect(sc.cam.lon0).not.toBe(lon);
    // drag: the globe turns with the pointer and stays in its tilt range
    const P = (x: number, y: number) => ({ x, y, clientX: x, clientY: y, id: 1, button: 0, pointerType: 'mouse' });
    const before = sc.cam.lon0;
    scene.pointerDown(P(200, 200));
    scene.pointerMove(P(260, 400));
    scene.update(1 / 60, 2000);
    expect(sc.cam.lon0).toBeLessThan(before);
    expect(sc.cam.lat0).toBeLessThanOrEqual(45);
    scene.pointerUp(P(260, 400));
    expect(calls).toEqual([]);
    // a tap on the Moon opens its diorama
    const m = sc.L.moon;
    scene.pointerMove(P(m.x, m.y));
    expect(sc.moonHover).toBe(true);
    scene.pointerDown(P(m.x, m.y));
    scene.pointerUp(P(m.x, m.y));
    expect(calls).toEqual(['diorama:moon']);
    expect(scene.locate('moon')).toBeTruthy();
    // a phone, then portrait, reduced motion, battery saver, the cascade
    scene.resize(800, 360);
    game.settings.batterySaver = true;
    for (let i = 0; i < 20; i++) scene.update(1 / 30, 3000 + i * 33);
    expect(sc.L.w).toBe(800);
    scene.resize(360, 780);
    game.settings.reducedMotion = true;
    const still = sc.cam.lon0;
    for (let i = 0; i < 20; i++) scene.update(1 / 60, 4000 + i * 16);
    expect(sc.cam.lon0).toBe(still);
    s.planet!.heatwall = { done: false, fronts: { cascade: { pressure: 70 } } } as any;
    game.settings.reducedMotion = false;
    for (let i = 0; i < 20; i++) scene.update(1 / 60, 5000 + i * 16);
    expect(sc.frontPool.size + sc.backPool.size).toBeGreaterThan(20);
    // keyboard and wheel
    scene.pan(12, 0);
    scene.wheel(P(0, 0), -1);
    expect(calls).toContain('map');
    // a title-screen world without a planet still draws the Earth and Moon
    game.view = game.state = null;
    for (let i = 0; i < 5; i++) scene.update(1 / 60, 6000 + i * 16);
    scene.destroy();
    setEra(0);
  });
});
