/**
 * Smoke test for the Act V dioramas in the real Pixi scene, without a browser: a stub canvas lets
 * textures "bake", then DioramaScene runs the L4 and L5 yards, Ring One, the Aurora habitat, every
 * asteroid and the Moon with its foundry through frames, pans, hovers and clicks — and checks the
 * skies behave: space is always sunlit (lights on, no clouds or walkers), asteroids have suited
 * figures and flying grit, the habitat has a night when the mirrors close.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../src/sim/types';
import { MOON_SITE, SPACE_SITES } from '../src/content/sites';
import { act5PreviewState } from '../src/sim/systemPreview';

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

function fakeGame(s: GameState) {
  const calls = { hover: 0, select: 0, toast: 0 };
  const game = {
    view: s,
    state: s,
    settings: { weather: true, dayNight: true, batterySaver: false, reducedMotion: false },
    dioramaTimelapse: false,
    stage: { canvas: stubCanvas() },
    setHover: () => calls.hover++,
    select: () => calls.select++,
    toast: () => calls.toast++,
  };
  return { game, calls };
}

const ptr = (x: number, y: number) => ({ x, y, clientX: x * 4, clientY: y * 4, id: 1, button: 0, pointerType: 'mouse' });

type Inner = {
  particles: { kind: string }[];
  plots: { driver?: unknown; movers: unknown[]; item: { piece?: { kind: string } } }[];
  walkers: unknown[];
  clouds: unknown[];
  props: unknown[];
  rain: unknown[];
  truck: unknown;
  sun: { visible: boolean };
  earth: { visible: boolean };
  glowL: { visible: boolean; alpha: number };
  skyGlowL: { visible: boolean };
  world: { tint: number };
};
const inner = (scene: unknown) => scene as Inner;

/** Frames, a pan to the far end and back, a hover and a click; returns the scene for more checks. */
function exercise(s: GameState, siteId: string, frames = 60) {
  const { game, calls } = fakeGame(s);
  const scene = new DioramaScene(game as never, siteId);
  scene.resize(320, 180);
  for (let i = 0; i < frames; i++) scene.update(1 / 30);
  expect(scene.viewOnly).toBe(true);
  scene.scrollTo(1, true);
  for (let i = 0; i < 10; i++) scene.update(1 / 30);
  expect(scene.scrollInfo().x).toBe(scene.scrollInfo().max);
  scene.pan(-12, 0);
  scene.wheel(ptr(100, 100), -100);
  for (let i = 0; i < 20; i++) scene.update(1 / 30);
  scene.pointerDown(ptr(200, 100));
  scene.pointerMove(ptr(150, 100));
  scene.pointerUp(ptr(150, 100));
  scene.pointerMove(ptr(160, 120));
  scene.pointerDown(ptr(160, 120));
  scene.pointerUp(ptr(160, 120));
  scene.pointerLeave();
  for (let i = 0; i < 10; i++) scene.update(1 / 30);
  return { scene, calls, game };
}

describe('act V diorama scenes', () => {
  it('opens every place in space without errors', () => {
    for (const s of [act5PreviewState(), act5PreviewState({ storm: 80, drift: 70 }), act5PreviewState({ typeI: true, stage: 3 })]) {
      for (const site of SPACE_SITES) {
        const { scene, calls } = exercise(s, site.id, 30);
        expect(scene.scrollInfo().width).toBeGreaterThanOrEqual(320);
        expect(inner(scene).plots.length).toBeGreaterThan(0);
        expect(calls.select).toBeGreaterThan(0);
        scene.autoPan = true;
        for (let i = 0; i < 5; i++) scene.update(1 / 20);
        scene.resize(422, 195);
        for (let i = 0; i < 5; i++) scene.update(1 / 20);
        scene.destroy();
      }
    }
  });

  it('opens them with no Act V state at all (an empty yard, the ring not begun, raw rock)', () => {
    const s = act5PreviewState();
    s.system = null;
    for (const site of SPACE_SITES) {
      const { scene } = exercise(s, site.id, 10);
      expect(inner(scene).plots.length).toBeGreaterThan(0);
      scene.destroy();
    }
    const moon = exercise(s, MOON_SITE.id, 10).scene;
    expect(inner(moon).plots.some((p) => p.item.piece?.kind === 'moonFoundry')).toBe(false);
    moon.destroy();
  });

  it('open space is always sunlit: the sun up, lights on, no clouds, rain, walkers or trucks', () => {
    for (const id of ['l4', 'l5', 'ring']) {
      const { scene } = exercise(act5PreviewState(), id, 400);
      const I = inner(scene);
      expect(I.sun.visible).toBe(true);
      expect(I.earth.visible).toBe(true);
      expect(I.glowL.visible).toBe(true);
      expect(I.glowL.alpha).toBeGreaterThan(0.4);
      expect(I.clouds.length).toBe(0);
      expect(I.rain.length).toBe(0);
      expect(I.walkers.length).toBe(0);
      expect(I.truck).toBeNull();
      // products drifting off at the yards, drones along the ring
      if (id !== 'ring') expect(I.props.length).toBeGreaterThan(3);
      else expect(I.plots.some((p) => p.movers.length > 0)).toBe(true);
      scene.destroy();
    }
    // L5 hangs its habitats in the sky; a storm adds its curtains
    const calm = exercise(act5PreviewState(), 'l5', 5).scene;
    const stormy = exercise(act5PreviewState({ storm: 90 }), 'l5', 5).scene;
    expect(inner(stormy).props.length).toBe(inner(calm).props.length + 1);
    calm.destroy();
    stormy.destroy();
  });

  it('works an asteroid: astronauts, grit off the cutters, the catapult firing', () => {
    const s = act5PreviewState();
    const { scene } = exercise(s, 'eros', 30);
    const I = inner(scene);
    expect(I.walkers.length).toBeGreaterThan(0);
    expect(I.clouds.length).toBe(0);
    expect(I.plots.some((p) => p.driver)).toBe(true);
    scene.scrollTo(0, true);
    for (let i = 0; i < 90; i++) scene.update(1 / 30);
    expect(I.particles.some((p) => p.kind === 'grit')).toBe(true);
    scene.destroy();
    // metal: sparks off the lasers
    const m = exercise(s, 'da1986', 5).scene;
    m.scrollTo(0, true);
    for (let i = 0; i < 60; i++) m.update(1 / 30);
    expect(inner(m).particles.some((p) => p.kind === 'spark')).toBe(true);
    m.destroy();
  });

  it('Aurora has a day and a night: lights come on when the mirrors close', () => {
    const s = act5PreviewState({ stage: 3 });
    const noon = fakeGame(s);
    noon.game.settings.dayNight = false;
    const day = new DioramaScene(noon.game as never, 'aurora');
    day.resize(320, 180);
    for (let i = 0; i < 60; i++) day.update(1 / 30);
    expect(inner(day).glowL.visible).toBe(false);
    expect(inner(day).skyGlowL.visible).toBe(false);
    expect(inner(day).walkers.length).toBeGreaterThan(0);
    day.destroy();
    // jump the clock to 23:00 at Aurora's meridian
    const { game } = fakeGame(s);
    const scene = new DioramaScene(game as never, 'aurora');
    const now = new Date();
    (scene as unknown as { timeOffset: number }).timeOffset = (((23 - now.getUTCHours() - now.getUTCMinutes() / 60 + 24) % 24) * 3_600_000);
    scene.resize(320, 180);
    for (let i = 0; i < 120; i++) scene.update(1 / 30);
    expect(inner(scene).glowL.visible).toBe(true);
    expect(inner(scene).skyGlowL.visible).toBe(true);
    expect(inner(scene).world.tint).not.toBe(0xffffff);
    scene.destroy();
  });

  it('rebuilds as the system grows underneath it', () => {
    const s = act5PreviewState();
    const { game } = fakeGame(s);
    const scene = new DioramaScene(game as never, 'l4');
    scene.resize(320, 180);
    for (let i = 0; i < 10; i++) scene.update(1 / 30);
    const before = inner(scene).plots.length;
    const w0 = scene.scrollInfo().width;
    const big = act5PreviewState();
    big.system!.foundries.find((f) => f.site === 'l4')!.cap = 200;
    game.view = big;
    for (let i = 0; i < 10; i++) scene.update(1 / 30);
    expect(inner(scene).plots.length).toBeGreaterThan(before);
    expect(scene.scrollInfo().width).toBeGreaterThan(w0);
    scene.destroy();
  });

  it('the Moon gets its foundry in Act V, beside the mass driver', () => {
    const { scene } = exercise(act5PreviewState(), MOON_SITE.id, 60);
    const kinds = inner(scene).plots.map((p) => p.item.piece?.kind);
    expect(kinds).toContain('moonFoundry');
    expect(kinds.indexOf('moonFoundry')).toBe(kinds.indexOf('massDriver') - 1);
    expect(inner(scene).walkers.length).toBeGreaterThan(0);
    scene.destroy();
  });
});
