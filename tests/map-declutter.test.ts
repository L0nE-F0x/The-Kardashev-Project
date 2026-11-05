/**
 * Map readability: the real MapScene, headless, in a dense world for every act. Checks that
 * markers in dense spots are spread so every site stays hit-testable at the closest zoom, that
 * the tutorial locator and the selection follow a moved marker, and that labels never overlap.
 * With PREVIEW_DIR set it also snapshots the live scene (sprites + graphics, exactly as drawn):
 *   PREVIEW_DIR=/some/dir npx vitest run tests/map-declutter.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { setEra, type Era } from '../src/render/palette';
import { cropShot, fakeDom, liveMap, shotPng, snapshot } from './helpers/mapshot';
import type { Facility, GameState } from '../src/sim/types';

fakeDom();
const dir = process.env.PREVIEW_DIR;

/** A busy Act II world: your campuses on both coasts, rivals, cables, mines and landing stations. */
async function act2State(): Promise<GameState> {
  const { newGame } = await import('../src/sim/state');
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
  fac('niigata', 'solar', 'online');
  fac('johor', 'datacenter', 'building');
  fac('kyushu', 'geothermal', 'online');
  fac('mumbai', 'datacenter', 'online');
  fac('gulf-coast', 'gas', 'online');
  fac('empty-quarter', 'solar', 'building');
  s.links = [{ id: 'l1', a: 'n-virginia', b: 'appalachia', km: 250, status: 'online', progress: 1, buildDays: 1, capacityMW: 500, lossPct: 2 }];
  s.network = {
    fiber: [
      { id: 'f1', a: 'n-virginia', b: 'appalachia', km: 250, status: 'online', progress: 1, buildDays: 1 },
      { id: 'f3', a: 'london', b: 'rhone', km: 800, status: 'online', progress: 1, buildDays: 1 },
      { id: 'f4', a: 'chiba', b: 'kyushu', km: 900, status: 'online', progress: 1, buildDays: 1 },
    ],
    leases: ['c-atlantic', 'c-pacific', 'c-redsea', 'c-indian'],
    own: [{ id: 'own2', a: 'cls-mumbai', b: 'cls-sydney', status: 'online', progress: 720, buildDays: 720 }],
    cuts: {},
  };
  s.rivalBuilds = [
    { id: 'r1', owner: 'meridian', siteId: 'west-texas', slots: 2, itMW: 300, status: 'online', startDay: 0, readyDay: 100 },
    { id: 'r2', owner: 'lattice', siteId: 'n-virginia', slots: 1, itMW: 100, status: 'online', startDay: 0, readyDay: 100 },
    { id: 'r3', owner: 'orchard', siteId: 'iberia', slots: 1, itMW: 80, status: 'building', startDay: 300, readyDay: 500 },
    { id: 'r5', owner: 'orchard', siteId: 'n-virginia', slots: 1, itMW: 60, status: 'online', startDay: 0, readyDay: 100 },
    { id: 'r6', owner: 'lattice', siteId: 'chiba', slots: 2, itMW: 200, status: 'online', startDay: 0, readyDay: 100 },
  ];
  s.stack = { ...(s.stack ?? { deals: [] }), stakes: { 'mine-atacama': 0.1, 'mine-helium': 0.2 } } as GameState['stack'];
  return s;
}

const ACTS: { name: string; era: Era; state: () => Promise<GameState> }[] = [
  { name: 'act2', era: 1, state: act2State },
  { name: 'act3', era: 2, state: async () => (await import('./helpers/act3fixture')).act3Fixture(3) },
  { name: 'act4', era: 3, state: async () => (await import('../src/sim/planetPreview')).act4PreviewState({ stage: 3 }) },
  { name: 'act5', era: 4, state: async () => (await import('../src/sim/systemPreview')).act5PreviewState() },
];

/** Dense spots worth eyeballing: [name, lon, lat]. */
const SPOTS: [string, number, number][] = [
  ['useast', -80, 39],
  ['gulf', -93, 30],
  ['persian', 50, 25],
  ['europe', 6, 48],
  ['japan', 137, 36],
  ['india', 74, 21],
  ['seasia', 108, 3],
];

const makeScene = (s: GameState, opts: { hover?: string; selection?: string } = {}) => liveMap(s, opts);

/** Crop a live snapshot around a lon/lat, wherever the clamped camera put it. */
const cropAt = (sc: any, lon: number, lat: number, w: number, h: number) => {
  const res = sc.lod.res;
  const x = Math.floor(sc.wrapX((lon + 180) / res) - Math.floor(sc.camX));
  const y = Math.floor((90 - lat) / res - Math.floor(sc.camY));
  return cropShot(snapshot(sc.root, sc.vw, sc.vh), x - Math.floor(w / 2), y - Math.floor(h / 2), w, h);
};

const frames = (scene: { update(dt: number, now: number): void }, n = 3) => {
  for (let i = 0; i < n; i++) scene.update(1 / 60, i * 16);
};

describe.skipIf(!dir)('map readability previews (live MapScene)', () => {
  afterAll(() => setEra(0));
  for (const act of ACTS) {
    it(`${act.name}`, async () => {
      setEra(act.era);
      fs.mkdirSync(dir!, { recursive: true });
      const s = await act.state();
      const { scene, sc } = await makeScene(s);
      // the zoomed-out world, as a 640×360 view
      scene.resize(640, 360);
      scene.centreOn(10, 25);
      frames(scene);
      fs.writeFileSync(path.join(dir!, `live-${act.name}-lod0-world.png`), shotPng(snapshot(sc.root, 640, 360), 2));
      for (const [name, lon, lat] of [SPOTS[0], SPOTS[3]]) {
        scene.centreOn(lon, lat);
        frames(scene);
        fs.writeFileSync(path.join(dir!, `live-${act.name}-lod0-${name}.png`), shotPng(cropAt(sc, lon, lat, 120, 68), 6));
      }
      // the closest zoom: dense spots at 5×
      scene.zoomIn();
      for (const [name, lon, lat] of SPOTS) {
        scene.centreOn(lon, lat);
        frames(scene);
        fs.writeFileSync(path.join(dir!, `live-${act.name}-lod1-${name}.png`), shotPng(cropAt(sc, lon, lat, 180, 100), 5));
      }
      scene.destroy();
    });
  }
  it('hover and selection in a crowd', async () => {
    setEra(1);
    const s = await act2State();
    const { scene, sc, game } = await makeScene(s, { hover: 'appalachia', selection: 'cls-virginia' });
    scene.resize(640, 360);
    scene.zoomIn();
    const [lon, lat] = [-80, 39];
    scene.centreOn(lon, lat);
    frames(scene);
    fs.writeFileSync(path.join(dir!, 'live-act2-lod1-useast-hover.png'), shotPng(cropAt(sc, lon, lat, 180, 100), 5));
    game.hover = { kind: 'site', id: 'kestrel-ohio', clientX: 0, clientY: 0 };
    game.selection = { kind: 'site', id: 'n-virginia' };
    frames(scene);
    fs.writeFileSync(path.join(dir!, 'live-act2-lod1-useast-hover2.png'), shotPng(cropAt(sc, lon, lat, 180, 100), 5));
    scene.zoomOut();
    scene.centreOn(lon, lat);
    frames(scene);
    fs.writeFileSync(path.join(dir!, 'live-act2-lod0-useast-hover.png'), shotPng(cropAt(sc, lon, lat, 120, 68), 6));
    scene.destroy();
  });
});

// ── always on ────────────────────────────────────────────────────────────────────────────────
type Box = { x: number; y: number; w: number; h: number };
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const boxOf = (sp: any): Box => ({ x: sp.x, y: sp.y, w: sp.texture.width, h: sp.texture.height });

describe('map declutter', () => {
  afterAll(() => setEra(0));

  for (const act of ACTS) {
    it(`${act.name}: every site is clickable on its own marker at the closest zoom, and no labels overlap`, async () => {
      const s = await act.state();
      const { scene, sc } = await makeScene(s);
      scene.resize(640, 360);
      scene.zoomIn();
      const { SITES } = await import('../src/content/sites');
      const { siteVisible } = await import('../src/render/worldMap/act2Layers');
      const visible = SITES.filter((x) => siteVisible(x, s));
      // look all round the world, a view at a time
      const tested = new Set<string>();
      for (let lon = -180; lon < 180; lon += 120) {
        for (const lat of [50, 10, -30]) {
          scene.centreOn(lon, lat);
          frames(scene, 2);
          // markers: each one's middle picks that site, not a neighbour
          for (const site of visible) {
            const a = sc.anchorPx(site.id);
            const px = a.x + 0.5 - sc.camX;
            const py = a.y + 0.5 - sc.liftOf(site.id) - sc.camY;
            if (px < 0 || py < 0 || px > sc.vw || py > sc.vh) continue;
            expect(sc.hitSite(px, py), `${act.name}: ${site.id}`).toBe(site.id);
            tested.add(site.id);
          }
          // labels: none on top of another (site names and region names alike)
          const labels: Box[] = [];
          for (const m of sc.markers.values()) if (m.label?.visible) labels.push(boxOf(m.label));
          for (const r of sc.regionLabels) if (r.sprite.visible) labels.push(boxOf(r.sprite));
          for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(hits(labels[i], labels[j]), `${act.name}: labels ${i}/${j} overlap`).toBe(false);
          // whole pixels only
          for (const m of sc.markers.values()) {
            expect(Number.isInteger(m.sprite.x) && Number.isInteger(m.sprite.y)).toBe(true);
            if (m.label?.visible) expect(Number.isInteger(m.label.x) && Number.isInteger(m.label.y)).toBe(true);
          }
        }
      }
      expect(tested.size).toBe(visible.length);
      // nudges stay small
      for (const sh of sc.shifts.values()) {
        expect(Math.abs(sh.dx)).toBeLessThanOrEqual(12);
        expect(Math.abs(sh.dy)).toBeLessThanOrEqual(6);
      }
      // the zoomed-out world: labels still never overlap
      scene.zoomOut();
      scene.centreOn(10, 25);
      frames(scene, 2);
      const labels0: Box[] = [];
      for (const m of sc.markers.values()) if (m.label?.visible) labels0.push(boxOf(m.label));
      for (const r of sc.regionLabels) if (r.sprite.visible) labels0.push(boxOf(r.sprite));
      expect(labels0.length).toBeGreaterThan(8);
      for (let i = 0; i < labels0.length; i++) for (let j = i + 1; j < labels0.length; j++) expect(hits(labels0[i], labels0[j])).toBe(false);
      scene.destroy();
    });
  }

  it('hover never moves markers; selection, the tutorial spotlight and hit tests follow a nudged marker', async () => {
    const s = await act2State();
    const { scene, sc, game } = await makeScene(s);
    scene.resize(640, 360);
    scene.zoomIn();
    scene.centreOn(73, 19);
    frames(scene);
    // Mumbai's campus and its cable landing sit 0.4 px apart: the spread parts them
    const a = sc.anchorPx('mumbai');
    const b = sc.anchorPx('cls-mumbai');
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(6);
    const before = JSON.stringify([...sc.shifts]);
    game.hover = { kind: 'site', id: 'cls-mumbai', clientX: 0, clientY: 0 };
    game.selection = { kind: 'site', id: 'cls-mumbai' };
    frames(scene);
    expect(JSON.stringify([...sc.shifts])).toBe(before);
    // the hovered name shows, on top of everything else
    const m = sc.markers.get('cls-mumbai');
    expect(m.label?.visible).toBe(true);
    expect(m.sprite.zIndex).toBeGreaterThan(sc.markers.get('mumbai').sprite.zIndex);
    // the selection brackets frame the nudged marker, not the site's own pixel
    const sel = sc.selSprite;
    expect(sel.x + Math.floor(sel.texture.width / 2)).toBe(b.x);
    expect(sel.y + Math.floor(sel.texture.height / 2)).toBe(b.y - sc.liftOf('cls-mumbai'));
    // the tutorial spotlight (`site:<id>`) points at the marker too: stage scale 3, DPR 1
    const spot = scene.locate('site:cls-mumbai')!;
    expect(spot.x).toBeCloseTo((b.x + 0.5 - sc.camX) * 3, 5);
    expect(spot.y).toBeCloseTo((b.y + 0.5 - sc.liftOf('cls-mumbai') - sc.camY) * 3, 5);
    const home = scene.locate('site:mumbai')!;
    expect(home.x).toBeCloseTo((a.x + 0.5 - sc.camX) * 3, 5);
    expect(sc.hitSite(a.x + 0.5 - sc.camX, a.y + 0.5 - sc.liftOf('mumbai') - sc.camY)).toBe('mumbai');
    expect(sc.hitSite(b.x + 0.5 - sc.camX, b.y + 0.5 - sc.camY)).toBe('cls-mumbai');
    // a nudged marker gets a tether back to its true pixel
    expect(sc.leaderG.context.instructions.length).toBeGreaterThan(0);
    // the same layout every time
    const again = await makeScene(s);
    again.scene.resize(640, 360);
    again.scene.zoomIn();
    again.scene.centreOn(73, 19);
    frames(again.scene);
    expect(JSON.stringify([...again.sc.shifts])).toBe(before);
    scene.destroy();
    again.scene.destroy();
  });

  it('spreadMarkers and placeLabels', async () => {
    const { spreadMarkers, placeLabels } = await import('../src/render/worldMap/declutter');
    // two markers on one pixel part sideways; the heavier one moves less; whole pixels only
    const r = { x: -4, y: -4, w: 9, h: 9 };
    const sh = spreadMarkers([{ id: 'a', x: 100, y: 50, rects: [r], weight: 4 }, { id: 'b', x: 100, y: 50, rects: [r], weight: 1 }], { W: 720, maxX: 12, maxY: 6, gap: 2 });
    const da = sh.get('a') ?? { dx: 0, dy: 0 };
    const db = sh.get('b') ?? { dx: 0, dy: 0 };
    expect(Math.abs(da.dx - db.dx)).toBeGreaterThanOrEqual(10);
    expect(Math.abs(da.dx)).toBeLessThan(Math.abs(db.dx));
    expect(Number.isInteger(da.dx) && Number.isInteger(db.dx)).toBe(true);
    // across the date line the map wraps: x = 1 and x = 719 are neighbours
    const wrap = spreadMarkers([{ id: 'a', x: 1, y: 50, rects: [r], weight: 1 }, { id: 'b', x: 719, y: 50, rects: [r], weight: 1 }], { W: 720, maxX: 12, maxY: 6, gap: 2 });
    expect(wrap.size).toBe(2);
    // labels: the higher priority keeps the spot above, the other goes elsewhere or hides
    const marker = { x: 96, y: 46, w: 9, h: 9 };
    const placed = placeLabels(
      [
        { id: 'low', w: 40, h: 7, prio: 10, kind: 'site', marker, owner: 'low' },
        { id: 'high', w: 40, h: 7, prio: 50, kind: 'site', marker, owner: 'high' },
      ],
      [],
      720,
    );
    expect(placed.get('high')).toEqual({ x: 80, y: 39, i: 0 });
    const low = placed.get('low')!;
    expect(low).not.toBeNull();
    expect(low.i).not.toBe(0);
    // a hard obstacle (your own site) blocks a label; a forced one (hovered) may still cover it
    const wall = [{ id: 'mine', x: 0, y: 0, w: 400, h: 200, hard: true }];
    expect(placeLabels([{ id: 'x', w: 20, h: 7, prio: 10, kind: 'site', marker }], wall, 720).get('x')).toBeNull();
    expect(placeLabels([{ id: 'x', w: 20, h: 7, prio: 100, kind: 'site', marker, force: true }], wall, 720).get('x')).not.toBeNull();
  });

  it('map sprites get a dark rim where their edge is light, once, at the size the scene expects', async () => {
    const M = await import('../src/render/sprites/mapIcons');
    const { C } = await import('../src/render/palette');
    const { PixelCanvas } = await import('../src/render/pixels');
    /** No light pixel touches the empty space round the sprite (holes inside it may stay light). */
    const edgeOk = (pc: InstanceType<typeof PixelCanvas>) => {
      const outside = new Set<number>();
      const stack: [number, number][] = [];
      for (let x = -1; x <= pc.w; x++) stack.push([x, -1], [x, pc.h]);
      for (let y = 0; y < pc.h; y++) stack.push([-1, y], [pc.w, y]);
      const key = (x: number, y: number) => (y + 1) * (pc.w + 2) + x + 1;
      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (x < -1 || y < -1 || x > pc.w || y > pc.h || outside.has(key(x, y)) || pc.get(x, y)) continue;
        outside.add(key(x, y));
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      for (let y = 0; y < pc.h; y++) {
        for (let x = 0; x < pc.w; x++) {
          const c = pc.get(x, y);
          if (!c || c === C.ink0 || c === C.ink1) continue;
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) expect(outside.has(key(nx, ny)), `light edge at ${x},${y}`).toBe(false);
        }
      }
    };
    for (const pc of [M.candidateCanvas(false), M.candidateCanvas(true), M.megasiteCanvas(false), M.megasiteCanvas(true), M.supplierCanvas('org1')]) edgeOk(pc);
    // hover variants keep their size, so a hovered marker never shifts or re-spreads
    expect([M.candidateCanvas(true).w, M.candidateCanvas(true).h]).toEqual([M.candidateCanvas(false).w, M.candidateCanvas(false).h]);
    expect([M.megasiteCanvas(true).w, M.megasiteCanvas(true).h]).toEqual([M.megasiteCanvas(false).w, M.megasiteCanvas(false).h]);
    // an already-rimmed sprite only gains an empty border
    const pin = M.sitePinCanvas('cyn4');
    const rimmed = M.mapRim(pin);
    expect([rimmed.w, rimmed.h]).toEqual([pin.w + 2, pin.h + 2]);
    for (let y = 0; y < pin.h; y++) for (let x = 0; x < pin.w; x++) expect(rimmed.get(x + 1, y + 1)).toBe(pin.get(x, y));
    expect(rimmed.data.filter(Boolean).length).toBe(pin.data.filter(Boolean).length);
  });

  it('every site marker keeps its size when hovered', async () => {
    const { SITES } = await import('../src/content/sites');
    const { siteMarker } = await import('../src/render/worldMap/act2Layers');
    for (const act of ACTS) {
      const s = await act.state();
      for (const site of SITES) {
        const a = siteMarker(site, s, false, false).make();
        const b = siteMarker(site, s, true, false).make();
        expect([b.w, b.h], `${act.name}: ${site.id}`).toEqual([a.w, a.h]);
      }
    }
  });
});
