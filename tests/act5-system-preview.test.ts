/**
 * The solar-system view (Swarmlight): the Sun, the inner planets, the belt, the swarm's arcs along
 * Earth's orbit, claims and foundries on the asteroids, hauls, the Mercury probe, Solar Maximum and
 * the near-Earth lens, drawn headless at a desktop size, a phone's 800×360 and a tall screen; the
 * ending's pull-back as a strip of frames.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act5-system-preview.test.ts
 * The previews are skipped unless PREVIEW_DIR is set; the layout checks and the SystemScene smoke
 * test always run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { C, setEra } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { pixelCanvasToPng } from '../tools/lib/png';
import { loadWorld } from './helpers/world';

const dir = process.env.PREVIEW_DIR;
const out = (name: string, pc: PixelCanvas, scale: number) => {
  fs.mkdirSync(dir!, { recursive: true });
  fs.writeFileSync(path.join(dir!, name), pixelCanvasToPng([pc], scale));
};

describe.skipIf(!dir)('system view previews', () => {
  beforeAll(() => setEra(4));
  afterAll(() => setEra(0));

  it('frames at three sizes: early, mid, storm, Type I, the pull-back', async () => {
    const A = await import('../src/render/system/systemArt');
    const { act5PreviewState } = await import('../src/sim/systemPreview');
    const { systemView, orbitExtras } = await import('../src/sim/systemView');
    const { orbitTerrain } = await import('../src/render/orbit/orbitArt');
    const { lods } = loadWorld();
    const terrain = { pc: orbitTerrain(lods[0], true), res: lods[0].res };
    const frame = (w: number, h: number, opts: { state?: Parameters<typeof act5PreviewState>[0]; t?: number; view?: number; rot?: number; tilt?: number; hover?: string | null; still?: boolean; cine?: number | null } = {}) => {
      const s = act5PreviewState(opts.state ?? {});
      const v = systemView(s);
      const L = A.systemLayout(w, h);
      const cam = A.sysCam(L, opts.view ?? A.VIEW_MIN, opts.rot ?? 0, opts.tilt ?? L.tilt);
      const pc = new PixelCanvas(w, h);
      const t0 = performance.now();
      A.renderSystemFrame(pc, L, { view: v, day: s.day, t: opts.t ?? 3.2, habitats: orbitExtras(s).habitats, cam, terrain, opts: { hover: opts.hover ?? null, still: opts.still }, cine: opts.cine ?? null, spin: 20 });
      if (w === 800 && !opts.cine) console.log(`system frame ${w}×${h}: ${(performance.now() - t0).toFixed(0)} ms`);
      return pc;
    };
    out('act5-system-640x360.png', frame(640, 360), 3);
    out('act5-system-800x360.png', frame(800, 360, { t: 5.1 }), 2);
    out('act5-system-360x780.png', frame(360, 780, { t: 2.2 }), 2);
    out('act5-system-early.png', frame(640, 360, { state: { stage: 1, collectors: 30 }, t: 1.4 }), 3);
    out('act5-system-storm.png', frame(640, 360, { state: { storm: 70 }, t: 4.4 }), 3);
    out('act5-system-storm-b.png', frame(640, 360, { state: { storm: 70 }, t: 6.1 }), 3);
    out('act5-system-typeI.png', frame(640, 360, { state: { typeI: true }, t: 8.0 }), 3);
    out('act5-system-stage3.png', frame(640, 360, { state: { stage: 3 }, t: 2.6, hover: 'eros' }), 3);
    out('act5-system-belt.png', frame(640, 360, { view: A.VIEW_MAX, t: 3.0, hover: 'da1986' }), 3);
    out('act5-system-turned.png', frame(640, 360, { rot: 1.2, tilt: 0.72, t: 9.3, hover: 'l4' }), 3);
    out('act5-system-still.png', frame(640, 360, { still: true, hover: 'aurora' }), 3);
    // close-ups: the lens, the swarm by Earth, the Sun in a storm
    const crop = (pc: PixelCanvas, x: number, y: number, w: number, h: number) => {
      const o = new PixelCanvas(w, h);
      o.blit(pc, -x, -y);
      return o;
    };
    const L = A.systemLayout(640, 360);
    const mid = frame(640, 360, { t: 3.2 });
    const lz = L.lens;
    out('act5-system-zoom-lens.png', crop(mid, lz.x - lz.r - 8, lz.y - lz.r - 12, lz.r * 2 + 16, lz.r * 2 + 20), 6);
    out('act5-system-zoom-centre.png', crop(mid, L.cx - 120, L.cy - 80, 240, 160), 4);
    {
      const s0 = act5PreviewState();
      const cam = A.sysCam(L);
      const [ex, ey] = A.makeProj(L, cam)(...A.polar(1, A.earthAngle(s0.day, 3.2)));
      out('act5-system-zoom-earth.png', crop(mid, Math.round(ex) - 50, Math.round(ey) - 35, 100, 70), 6);
    }
    out('act5-system-zoom-storm.png', crop(frame(640, 360, { state: { storm: 90 }, t: 5.0 }), L.cx - 120, L.cy - 80, 240, 160), 4);
    out('act5-system-zoom-typeI.png', crop(frame(640, 360, { state: { typeI: true }, t: 12.0 }), L.cx - 160, L.cy - 100, 320, 200), 3);
    // the ending: the pull-back from Earth to the inner system
    const us = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
    const strip = new PixelCanvas(320 * 4, 180 * 2);
    us.forEach((u, i) => {
      const f = frame(320, 180, { state: { typeI: true }, cine: u, t: 2 + u * 10 });
      strip.blit(f, (i % 4) * 320, Math.floor(i / 4) * 180);
    });
    out('act5-system-cinematic.png', strip, 2);
    for (const u of [0, 0.5, 1]) out(`act5-system-cine-${u}.png`, frame(640, 360, { state: { typeI: true }, cine: u, t: 2 + u * 10 }), 2);
    // sprites close up
    const sprites: PixelCanvas[] = [
      A.sunCanvas(7, 0), A.sunCanvas(7, 1, true), A.sunCanvas(4, 2),
      ...(['mercury', 'venus', 'earth', 'mars'] as const).map((p) => A.planetCanvas(p, 3)),
      ...(['C', 'S', 'M'] as const).flatMap((t) => [A.asteroidCanvas(t, 1, null), A.asteroidCanvas(t, 2, 'cyn5'), A.asteroidCanvas(t, 3, 'rck5', true)]),
      A.ringOneCanvas(), A.habitatCanvas(), A.yardCanvas('cyn4'), A.yardCanvas(null, true), A.moonCanvas(4, 2, true), A.moonCanvas(3, 10, false, true),
    ];
    const w = sprites.reduce((a, p) => a + p.w + 3, 3);
    const sh = new PixelCanvas(w, Math.max(...sprites.map((p) => p.h)) + 6);
    sh.rect(0, 0, sh.w, sh.h, C.night0);
    let x = 3;
    for (const p of sprites) {
      sh.blit(p, x, 3);
      x += p.w + 3;
    }
    out('act5-system-sprites.png', sh, 6);
  });
});

describe.skipIf(!dir)('orbit view in Act V', () => {
  beforeAll(() => setEra(4));
  afterAll(() => setEra(0));

  it('the yards at L4 and L5, habitats, beam relays, the lunar foundry, a drift, the storm', async () => {
    const A = await import('../src/render/orbit/orbitArt');
    const { act5PreviewState } = await import('../src/sim/systemPreview');
    const { orbitView, planetMapView } = await import('../src/sim/planetView');
    const { orbitExtras } = await import('../src/sim/systemView');
    const { lods } = loadWorld();
    const sun = { lat: 18, lon: -35 };
    const frame = (w: number, h: number, state: Parameters<typeof act5PreviewState>[0] = {}, o: { t?: number; lon0?: number; still?: boolean } = {}) => {
      const s = act5PreviewState(state);
      const L = A.orbitLayout(w, h);
      const lod = L.r >= 60 ? lods[1] : lods[0];
      const pc = new PixelCanvas(w, h);
      A.renderOrbitFrame(pc, L, {
        terrain: A.orbitTerrain(lod, true), res: lod.res, smooth: L.r < 60, cam: { lon0: o.lon0 ?? 10, lat0: 22 }, sun,
        planet: planetMapView(s), orbit: orbitView(s), t: o.t ?? 3.2, opts: { still: o.still }, extras: orbitExtras(s),
      });
      return pc;
    };
    out('act5-orbit-640x360.png', frame(640, 360), 3);
    out('act5-orbit-800x360.png', frame(800, 360, {}, { t: 5.5, lon0: 60 }), 2);
    out('act5-orbit-360x780.png', frame(360, 780, {}, { t: 2.1 }), 2);
    out('act5-orbit-drift.png', frame(640, 360, { drift: 70 }, { t: 4.1 }), 3);
    out('act5-orbit-storm.png', frame(640, 360, { storm: 80 }, { t: 6.2, lon0: 100 }), 3);
    out('act5-orbit-still.png', frame(640, 360, {}, { still: true }), 3);
    const crop = (pc: PixelCanvas, x: number, y: number, w: number, h: number) => {
      const o = new PixelCanvas(w, h);
      o.blit(pc, -x, -y);
      return o;
    };
    const L = A.orbitLayout(640, 360);
    const sp = A.lagrangeSpots(L);
    const f = frame(640, 360, { drift: 30 }, { t: 3.9 });
    out('act5-orbit-zoom-l5.png', crop(f, sp.l5[0] - 50, sp.l5[1] - 30, 100, 70), 6);
    out('act5-orbit-zoom-l4.png', crop(f, sp.l4[0] - 50, sp.l4[1] - 25, 100, 60), 6);
    out('act5-orbit-zoom-moon.png', crop(f, L.moon.x - 30, L.moon.y - 30, 60, 60), 8);
  });
});

describe('system layout', () => {
  it('fits every size and projects sanely', async () => {
    const A = await import('../src/render/system/systemArt');
    for (const [w, h] of [[640, 360], [800, 360], [480, 270], [360, 780], [1280, 720], [320, 640]]) {
      const L = A.systemLayout(w, h);
      // the inner system fits at the closest zoom, the belt at the farthest
      for (const [view, a] of [[A.VIEW_MIN, 1.524], [A.VIEW_MAX, 3.3]] as const) {
        const cam = A.sysCam(L, view);
        const P = A.makeProj(L, cam);
        for (const th of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const [x, y] = P(a * Math.cos(th), a * Math.sin(th));
          expect(x).toBeGreaterThanOrEqual(-2);
          expect(x).toBeLessThanOrEqual(w + 2);
          expect(y).toBeGreaterThanOrEqual(-2);
          expect(y).toBeLessThanOrEqual(h + 2);
        }
      }
      // the lens is on screen
      expect(L.lens.x - L.lens.r).toBeGreaterThanOrEqual(0);
      expect(L.lens.x + L.lens.r).toBeLessThanOrEqual(w);
      expect(L.lens.y - L.lens.r - 4).toBeGreaterThanOrEqual(0);
      expect(L.lens.y + L.lens.r).toBeLessThanOrEqual(h);
    }
    const L = A.systemLayout(640, 360);
    const cam = A.sysCam(L, 2, 0.7, 0.6);
    const P = A.makeProj(L, cam);
    // unproject undoes project
    for (const [wx, wy] of [[1, 0], [-0.4, 1.3], [2.2, -1.9]] as const) {
      const [x, y] = P(wx, wy);
      const [ux, uy] = A.unproject(L, cam, x, y);
      expect(ux).toBeCloseTo(wx, 6);
      expect(uy).toBeCloseTo(wy, 6);
    }
    // the Sun at the centre; Earth's angle follows the date (a year later it's back where it was)
    expect(P(0, 0)[0]).toBeCloseTo(L.cx);
    const a0 = A.earthAngle(0, 0);
    expect(Math.abs(Math.sin(A.earthAngle(365.25, 0) - a0))).toBeLessThan(0.01);
    expect(Math.abs(A.earthAngle(0, A.YEAR_SECS / 2) - a0)).toBeGreaterThan(3);
    // the pull-back starts close on Earth and ends on the inner system
    const e: [number, number] = [Math.cos(a0), Math.sin(a0)];
    const c0 = A.cinematicCam(L, e, 0);
    expect(c0.R).toBeGreaterThan(60);
    expect(Math.hypot(c0.cam.x - e[0], c0.cam.y - e[1])).toBeLessThan(1e-6);
    const c1 = A.cinematicCam(L, e, 1);
    expect(c1.R).toBe(0);
    expect(c1.cam.scale).toBeCloseTo(L.fit / A.VIEW_MIN);
    expect(Math.hypot(c1.cam.x, c1.cam.y)).toBeLessThan(1e-6);
    for (let u = 0; u <= 1; u += 0.05) {
      const c = A.cinematicCam(L, e, u);
      expect(Number.isFinite(c.cam.scale) && Number.isFinite(c.cam.x) && Number.isFinite(c.cam.y)).toBe(true);
    }
  });
});

// ── the real SystemScene, headless ───────────────────────────────────────────────────────────
const fakeCanvas = () => ({
  width: 0, height: 0, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} }),
  toDataURL: () => 'data:',
});

describe('system scene', () => {
  it('runs frames, turns under a drag, zooms, hovers and opens things, survives resizes, settings, the storm and the ending', async () => {
    (globalThis as any).document ??= { createElement: fakeCanvas, documentElement: { style: { setProperty() {} } } };
    (globalThis as any).window ??= globalThis;
    (globalThis as any).requestAnimationFrame ??= (fn: () => void) => setTimeout(fn, 0);
    const { SystemScene } = await import('../src/render/system/systemScene');
    const { act5PreviewState } = await import('../src/sim/systemPreview');
    const world = loadWorld();
    const s = act5PreviewState();
    const calls: string[] = [];
    let notes = 0;
    const game: any = {
      world, state: s, view: s, mode: 'map',
      settings: { reducedMotion: false, batterySaver: false },
      enterDiorama: (id: string) => calls.push(`diorama:${id}`),
      enterOrbit: () => calls.push('orbit'),
      enterMap: () => calls.push('map'),
      notify: () => notes++,
    };
    setEra(4);
    const scene = new SystemScene(game);
    const sc = scene as any;
    scene.resize(640, 360);
    for (let i = 0; i < 60; i++) scene.update(1 / 60, i * 16);
    expect(sc.frontPool.size + sc.backPool.size).toBeGreaterThan(300);
    expect(sc.lensPool.size).toBeGreaterThan(5);
    expect(sc.hits.length).toBeGreaterThan(8);
    // Earth moves round the Sun on its own
    const e0 = [...sc.earth];
    for (let i = 0; i < 30; i++) scene.update(1 / 30, 1000 + i * 33);
    expect(Math.hypot(sc.earth[0] - e0[0], sc.earth[1] - e0[1])).toBeGreaterThan(2);
    // a drag turns the view and tilts it within its range
    const P = (x: number, y: number, id = 1) => ({ x, y, clientX: x, clientY: y, id, button: 0, pointerType: 'mouse' });
    const rot = sc.rot;
    scene.pointerDown(P(200, 200));
    scene.pointerMove(P(260, 400));
    scene.update(1 / 60, 2000);
    expect(sc.rot).not.toBe(rot);
    expect(sc.tilt).toBeLessThanOrEqual(0.82);
    expect(sc.tilt).toBeGreaterThanOrEqual(0.36);
    scene.pointerUp(P(260, 400));
    expect(calls).toEqual([]);
    // hover then tap a target: the L4 yards in the lens, a worked asteroid in the main view
    scene.update(1 / 60, 2100);
    const lz = sc.L.lens;
    const rock = sc.hits.find((x: any) => ['bennu', 'eros', 'da1986'].includes(x.id) && Math.hypot(x.x - lz.x, x.y - lz.y) > lz.r + 4);
    expect(rock).toBeTruthy();
    for (const id of ['l4', rock.id]) {
      const h = sc.hits.find((x: any) => x.id === id);
      expect(h).toBeTruthy();
      scene.pointerMove(P(h.x, h.y));
      expect(scene.hovered?.id).toBe(id);
      scene.pointerDown(P(h.x, h.y));
      scene.pointerUp(P(h.x, h.y));
    }
    expect(calls).toEqual(['diorama:l4', `diorama:${rock.id}`]);
    expect(notes).toBeGreaterThan(0);
    expect(scene.locate('l5')).toBeTruthy();
    expect(scene.locate('moon')).toBeTruthy();
    // zoom out to the belt and back in; one more notch in opens the orbit view
    for (let i = 0; i < 12; i++) scene.wheel(P(320, 180), 1);
    for (let i = 0; i < 90; i++) scene.update(1 / 60, 3000 + i * 16);
    expect(sc.view).toBeGreaterThan(3);
    for (let i = 0; i < 12; i++) scene.wheel(P(320, 180), -1);
    for (let i = 0; i < 90; i++) scene.update(1 / 60, 4500 + i * 16);
    expect(sc.view).toBeLessThan(1.8);
    scene.wheel(P(320, 180), -1);
    expect(calls).toContain('orbit');
    // pinch
    scene.pointerDown(P(300, 180, 1));
    scene.pointerDown(P(340, 180, 2));
    scene.pointerMove(P(250, 180, 1));
    scene.pointerMove(P(390, 180, 2));
    scene.pointerUp(P(250, 180, 1));
    scene.pointerUp(P(390, 180, 2));
    // a phone, then portrait, reduced motion, battery saver, the storm
    scene.resize(800, 360);
    game.settings.batterySaver = true;
    for (let i = 0; i < 20; i++) scene.update(1 / 30, 6000 + i * 33);
    expect(sc.L.w).toBe(800);
    scene.resize(360, 780);
    game.settings.reducedMotion = true;
    for (let i = 0; i < 120; i++) scene.update(1 / 60, 7000 + i * 16);
    const still = [...sc.earth];
    for (let i = 0; i < 20; i++) scene.update(1 / 60, 9000 + i * 16);
    expect(sc.earth).toEqual(still);
    game.view = game.state = act5PreviewState({ storm: 80 });
    game.settings.reducedMotion = false;
    for (let i = 0; i < 20; i++) scene.update(1 / 60, 8000 + i * 16);
    expect(sc.frontPool.size + sc.backPool.size).toBeGreaterThan(300);
    // keyboard
    scene.pan(12, 4);
    scene.zoomOut();
    scene.zoomIn();
    // a world without the system still draws the planets and the lens
    game.view = game.state = null;
    for (let i = 0; i < 5; i++) scene.update(1 / 60, 9000 + i * 16);
    scene.destroy();

    // the ending: input off, the camera pulls back and reports when it's done
    game.view = game.state = act5PreviewState({ typeI: true });
    const cine = new SystemScene(game, { cinematic: true });
    const cc = cine as any;
    cine.resize(640, 360);
    cine.update(1 / 60, 0);
    const s0 = cc.cam.scale;
    expect(cine.cinematicDone).toBe(false);
    cine.pointerDown(P(100, 100));
    cine.pointerMove(P(300, 300));
    cine.pointerUp(P(300, 300));
    cine.wheel(P(0, 0), 1);
    for (let i = 0; i < 10 * 13; i++) cine.update(1 / 10, i * 100);
    expect(cine.cinematicDone).toBe(true);
    expect(cc.cam.scale).toBeLessThan(s0 / 50);
    const r0 = cc.rot;
    for (let i = 0; i < 20; i++) cine.update(1 / 20, 20000 + i * 50);
    expect(cc.rot).not.toBe(r0);
    cine.destroy();
    setEra(0);
  }, 30_000);
});
