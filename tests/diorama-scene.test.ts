/**
 * Smoke test for the Pixi campus scene without a browser: a stub canvas lets textures "bake",
 * then the real DioramaScene runs frames, pans, flings and hovers on build and view-only sites.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import type { Facility, FacilityType, GameState } from '../src/sim/types';
import { SITES } from '../src/content/sites';

function stubCanvas() {
  return {
    width: 1,
    height: 1,
    style: {},
    getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} }),
    addEventListener() {},
    removeEventListener() {},
  };
}

let DioramaScene: typeof import('../src/render/diorama/dioramaScene').DioramaScene;

beforeAll(async () => {
  (globalThis as unknown as { document: unknown }).document = { createElement: () => stubCanvas() };
  ({ DioramaScene } = await import('../src/render/diorama/dioramaScene'));
});

function world(): GameState {
  const s = newGame({ name: 'Little Sun Labs', homeSite: 'west-texas', seed: 3 });
  s.day = 1200;
  s.rivalBuilds ??= [];
  let n = 0;
  const fac = (siteId: string, type: FacilityType, extra: Partial<Facility> = {}) =>
    s.facilities.push({ id: `t${n++}`, type, siteId, status: 'online', progress: 1, buildDays: 1, startedDay: 0, tier: 1, ...extra });
  s.sites['wyoming'].extraSlots = 3;
  s.sites['wyoming'].grid.mw = 100;
  fac('wyoming', 'campus');
  fac('wyoming', 'reactor');
  fac('wyoming', 'datacenter', { tier: 2, upgrade: { to: 3, progress: 100, buildDays: 300 } });
  fac('wyoming', 'wind', { tier: 3 });
  fac('wyoming', 'smr', { status: 'building', progress: 30, buildDays: 1600, blocked: 'queue' });
  s.rivalBuilds.push({ id: 'rb1', owner: 'meridian', siteId: 'wyoming', slots: 2, itMW: 300, status: 'online', startDay: 0, readyDay: 400 });
  s.rivalBuilds.push({ id: 'rb2', owner: 'orchard', siteId: 'wyoming', slots: 1, itMW: 80, status: 'building', startDay: 1000, readyDay: 1500 });
  fac('columbia-gorge', 'hydro', { tier: 2 });
  fac('reykjanes', 'geothermal', { tier: 3 });
  return s;
}

function fakeGame(s: GameState) {
  const calls = { hover: 0, select: 0, toast: 0 };
  const game = {
    view: s,
    state: s,
    settings: { weather: true, dayNight: true, batterySaver: false, reducedMotion: false },
    dioramaTimelapse: true,
    stage: { canvas: stubCanvas() },
    setHover: () => calls.hover++,
    select: () => calls.select++,
    toast: () => calls.toast++,
  };
  return { game, calls };
}

const ptr = (x: number, y: number) => ({ x, y, clientX: x * 4, clientY: y * 4, id: 1, button: 0, pointerType: 'mouse' });

describe('campus diorama scene', () => {
  it('runs a gigawatt megasite: plots, particles, movers, panning and fling', () => {
    const s = world();
    const { game, calls } = fakeGame(s);
    const scene = new DioramaScene(game as never, 'wyoming');
    scene.resize(320, 180);
    for (let i = 0; i < 120; i++) scene.update(1 / 30);
    const info = scene.scrollInfo();
    expect(info.width).toBeGreaterThan(1200);
    expect(info.max).toBe(info.width - 320);
    expect(scene.viewOnly).toBe(false);
    const fx = (scene as unknown as { particles: unknown[] }).particles.length;
    expect(fx).toBeGreaterThan(20);
    // keyboard pan eases toward the target in whole pixels
    scene.pan(12, 0);
    for (let i = 0; i < 30; i++) scene.update(1 / 30);
    expect(scene.scrollInfo().x).toBe(24);
    // wheel
    scene.wheel(ptr(100, 100), 100);
    for (let i = 0; i < 30; i++) scene.update(1 / 30);
    expect(scene.scrollInfo().x).toBe(60);
    // drag then release: the camera follows the pointer
    scene.pointerDown(ptr(200, 100));
    scene.pointerMove(ptr(150, 100));
    scene.pointerMove(ptr(100, 100));
    scene.pointerUp(ptr(100, 100));
    for (let i = 0; i < 60; i++) scene.update(1 / 30);
    expect(scene.scrollInfo().x).toBeGreaterThanOrEqual(160);
    // hover and click a plot
    scene.pointerMove(ptr(40, 140));
    scene.pointerDown(ptr(40, 140));
    scene.pointerUp(ptr(40, 140));
    expect(calls.hover).toBeGreaterThan(0);
    expect(calls.select).toBe(1);
    // focus a facility and scroll to the end
    scene.focusFacility('t1', true);
    expect(scene.scrollInfo().x).toBeGreaterThan(0);
    scene.scrollTo(1, true);
    scene.update(1 / 30);
    expect(scene.scrollInfo().x).toBe(scene.scrollInfo().max);
    // the campus changes (upgrade finishes) → plots rebuild without errors
    const dc = s.facilities.find((f) => f.id === 't2')!;
    dc.tier = 3;
    delete dc.upgrade;
    for (let i = 0; i < 10; i++) scene.update(1 / 30);
    scene.resize(400, 200);
    for (let i = 0; i < 10; i++) scene.update(1 / 30);
    scene.destroy();
  });

  it('opens every site without errors (build sites, suppliers, mines, landing stations)', () => {
    const s = world();
    const { game } = fakeGame(s);
    for (const site of SITES) {
      const scene = new DioramaScene(game as never, site.id);
      scene.resize(320, 180);
      for (let i = 0; i < 20; i++) scene.update(1 / 20);
      expect(scene.viewOnly).toBe(site.kind !== 'build');
      scene.pointerMove(ptr(160, 130));
      scene.autoPan = true;
      for (let i = 0; i < 5; i++) scene.update(1 / 20);
      scene.destroy();
    }
  });
});
