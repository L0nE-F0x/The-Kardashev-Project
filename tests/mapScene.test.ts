/**
 * Drives the real MapScene for a few frames in Node (canvas stubbed): Act I, then the Act II
 * layers (cables, cuts, fiber, rivals, traffic, cranes), a zoom, reduced motion, and back.
 */
import { it, expect } from 'vitest';
import { loadWorld } from './helpers/world';
import type { GameState } from '../src/sim/types';

const fakeCanvas = () => ({
  width: 0, height: 0, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} }),
  toDataURL: () => 'data:',
});
(globalThis as any).document = { createElement: fakeCanvas, documentElement: { style: { setProperty() {} } } };
(globalThis as any).window = globalThis;

it('MapScene runs Act I and Act II frames', async () => {
  const { MapScene } = await import('../src/render/worldMap/mapScene');
  const { newGame } = await import('../src/sim/state');
  const world = loadWorld();
  const s = newGame({ name: 'Smoke', homeSite: 'n-virginia', seed: 3 }) as GameState;
  s.facilities.push({ id: 'x1', type: 'datacenter', siteId: 'n-virginia', status: 'online', progress: 1, buildDays: 1, startedDay: 0 });
  s.facilities.push({ id: 'x2', type: 'solar', siteId: 'n-virginia', status: 'building', progress: 1, buildDays: 10, startedDay: 0 });
  s.links = [{ id: 'l1', a: 'n-virginia', b: 'appalachia', km: 250, status: 'online', progress: 1, buildDays: 1, capacityMW: 500, lossPct: 2 }];
  const game: any = {
    world, state: s, view: s, mode: 'map', hover: null, selection: { kind: 'site', id: 'cls-virginia' }, tool: { kind: 'fiber', from: 'n-virginia' },
    settings: { clouds: true, dayNight: true, reducedMotion: false, wheel: 'zoom' },
    dayFraction: () => 0.5, setHover() {}, select() {}, linkClick() {}, enterDiorama() {},
  };
  const scene = new MapScene(game);
  const sprites = () => (scene as any).markerL.children.length;
  for (let i = 0; i < 5; i++) scene.update(1 / 60, i * 16);
  const act1Markers = sprites();
  // Act II
  s.act = 2; s.phase = 3; s.day = 300;
  s.facilities.push({ id: 'x3', type: 'campus', siteId: 'wyoming', status: 'building', progress: 1, buildDays: 10, startedDay: 0 });
  s.facilities.push({ id: 'x4', type: 'gas', siteId: 'appalachia', status: 'online', progress: 1, buildDays: 10, startedDay: 0, tier: 2, upgrade: { to: 3, progress: 1, buildDays: 30 } });
  s.network = { fiber: [{ id: 'f1', a: 'n-virginia', b: 'appalachia', km: 250, status: 'online', progress: 1, buildDays: 1 }], leases: ['c-atlantic'], own: [{ id: 'o1', a: 'cls-cornwall', b: 'cls-fortaleza', status: 'building', progress: 100, buildDays: 400 }], cuts: { 'c-redsea': 400 } };
  s.rivalBuilds = [{ id: 'r1', owner: 'meridian', siteId: 'n-virginia', slots: 1, itMW: 100, status: 'online', startDay: 0, readyDay: 10 }];
  game.tool = { kind: 'link', from: null };
  for (let i = 0; i < 40; i++) scene.update(1 / 60, 100 + i * 16);
  const sc = scene as any;
  expect(sc.net).toBeTruthy();
  expect(sc.traffic.length).toBeGreaterThan(0);
  expect(sc.rivalSprites.size).toBe(1);
  expect(sc.cutSprites.size).toBe(1);
  expect(sc.layShips.size).toBe(1);
  expect(sc.netPulses.length).toBeGreaterThan(0);
  expect(sprites()).toBeGreaterThan(act1Markers);
  scene.zoomIn();
  for (let i = 0; i < 30; i++) scene.update(1 / 60, 800 + i * 16);
  game.settings.reducedMotion = true;
  for (let i = 0; i < 5; i++) scene.update(1 / 60, 1400 + i * 16);
  // back to Act I: Act II layers go away
  s.act = 1;
  for (let i = 0; i < 5; i++) scene.update(1 / 60, 1600 + i * 16);
  expect(sc.traffic.length).toBe(0);
  expect(sc.rivalSprites.size).toBe(0);
  expect(sc.cutSprites.size).toBe(0);
  expect(sc.netL.visible).toBe(false);
  // hit-testing skips hidden Act II sites
  expect(['cls-virginia', 'wyoming'].includes(sc.hitSite(0, 0) ?? '')).toBe(false);
});
