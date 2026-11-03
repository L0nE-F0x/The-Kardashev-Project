/**
 * Smoke test for the Act III dioramas in the real Pixi scene, without a browser: a stub canvas
 * lets textures "bake", then DioramaScene runs the Charter HQ, megaprojects (stage 0 and 3, on land
 * and offshore) and a launch site through frames, pans, hovers and a liftoff.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../src/sim/types';
import { CHARTER_HQ, LAUNCH_SITES, MEGA_SITES } from '../src/content/sites';
import { act3Fixture } from './helpers/act3fixture';

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
    dioramaTimelapse: true,
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
  plots: { rocket?: { sprite: { y: number; visible: boolean } } }[];
  walkers: unknown[];
  backRotors: unknown[];
  props: unknown[];
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
  return { scene, calls };
}

describe('act III diorama scenes', () => {
  it('runs the Charter HQ: lake, Jet d’Eau, sailboats, walkers kept off the water', () => {
    const s = act3Fixture(2);
    const { scene, calls } = exercise(s, CHARTER_HQ, 90);
    expect(scene.scrollInfo().width).toBeGreaterThan(600);
    expect(inner(scene).props.length).toBeGreaterThanOrEqual(3);
    expect(inner(scene).walkers.length).toBeGreaterThan(0);
    expect(calls.hover).toBeGreaterThan(0);
    expect(calls.select).toBeGreaterThan(0);
    scene.resize(400, 200);
    for (let i = 0; i < 10; i++) scene.update(1 / 30);
    scene.destroy();
    // at noon (day/night off) the lake's lights and the floodlit jet stay dark
    const noon = fakeGame(s);
    noon.game.settings.dayNight = false;
    const day = new DioramaScene(noon.game as never, CHARTER_HQ);
    day.resize(320, 180);
    for (let i = 0; i < 30; i++) day.update(1 / 30);
    const layers = day as unknown as { midGlowL: { visible: boolean }; glowL: { visible: boolean } };
    expect(layers.midGlowL.visible).toBe(false);
    expect(layers.glowL.visible).toBe(false);
    day.destroy();
  });

  it('runs a megaproject at stage 0 and 3, and rebuilds as it grows', () => {
    const s0 = act3Fixture(0);
    const s3 = act3Fixture(3);
    for (const id of ['mega-sahara', 'mega-plains', 'mega-nordic', 'mega-cascadia', 'mega-pacific']) {
      const a = exercise(s0, id).scene;
      const w0 = a.scrollInfo().width;
      a.destroy();
      const b = exercise(s3, id, 120).scene;
      expect(b.scrollInfo().width).toBeGreaterThan(w0);
      if (id === 'mega-plains') expect(inner(b).backRotors.length).toBeGreaterThan(4);
      b.destroy();
    }
    // the same scene, while the state changes underneath it (a stage completes)
    const s = act3Fixture(1);
    const { game } = fakeGame(s);
    const scene = new DioramaScene(game as never, 'mega-gobi');
    scene.resize(320, 180);
    for (let i = 0; i < 10; i++) scene.update(1 / 30);
    const before = inner(scene).plots.length;
    game.view = act3Fixture(3);
    for (let i = 0; i < 10; i++) scene.update(1 / 30);
    expect(inner(scene).plots.length).toBeGreaterThan(before);
    scene.destroy();
  });

  it('runs the North Sea offshore: no walkers, turbines turning, waves rolling', () => {
    const { scene } = exercise(act3Fixture(3), 'mega-northsea', 90);
    expect(inner(scene).walkers.length).toBe(0);
    expect(inner(scene).backRotors.length).toBeGreaterThan(4);
    scene.destroy();
  });

  it('lifts off: the rocket climbs, the pad fills with exhaust, a new one stands ready', () => {
    const s = act3Fixture(3);
    const id = LAUNCH_SITES[0].id;
    const { game } = fakeGame(s);
    const scene = new DioramaScene(game as never, id);
    scene.resize(320, 180);
    const rocketPlot = () => inner(scene).plots.find((p) => p.rocket)!;
    scene.update(1 / 30);
    expect(rocketPlot()).toBeDefined();
    const y0 = rocketPlot().rocket!.sprite.y;
    // scene time + 6 s = the cycle: ignition at ~2.5 s, off the pad at 4 s, well up by 6 s
    for (let i = 0; i < 30 * 6; i++) scene.update(1 / 30);
    expect(rocketPlot().rocket!.sprite.y).toBeLessThan(y0 - 20);
    expect(inner(scene).particles.some((p) => p.kind === 'exhaust')).toBe(true);
    for (let i = 0; i < 30 * 14; i++) scene.update(1 / 30);
    // ~20 s later the cycle has wrapped: back on the pad
    expect(rocketPlot().rocket!.sprite.visible).toBe(true);
    expect(Math.abs(rocketPlot().rocket!.sprite.y - y0)).toBeLessThan(2);
    scene.destroy();
    // without the cliffhanger the rocket just stands there; other candidates are survey land
    const still = new DioramaScene(fakeGame(act3Fixture(2)).game as never, id);
    still.resize(320, 180);
    for (let i = 0; i < 200; i++) still.update(1 / 30);
    expect(inner(still).particles.some((p) => p.kind === 'exhaust')).toBe(false);
    still.destroy();
    for (const site of LAUNCH_SITES.slice(1)) exercise(s, site.id, 20).scene.destroy();
  });

  it('opens every Act III site at every stage without errors', () => {
    for (const st of [0, 1, 2, 3] as const) {
      const s = act3Fixture(st);
      for (const site of [...MEGA_SITES, ...LAUNCH_SITES]) {
        const { game } = fakeGame(s);
        const scene = new DioramaScene(game as never, site.id);
        scene.resize(320, 180);
        for (let i = 0; i < 8; i++) scene.update(1 / 20);
        scene.autoPan = true;
        for (let i = 0; i < 5; i++) scene.update(1 / 20);
        scene.destroy();
      }
    }
  });
});
