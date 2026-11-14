/**
 * The 3D campus people: the walk map keeps every way in and every walk clear of buildings, fences and parked cars,
 * and a simulated day keeps everyone outside of them (and on the right schedule). Built from the real pieces.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame } from '../src/sim/state';
import { newAct2Game } from '../src/sim/act2';
import { refreshStats } from '../src/sim/tick';
import type { Facility, FacilityType, GameState } from '../src/sim/types';
import { campusLayout, FRONT_Z, HIGHWAY_Z, PD } from '../src/render3d/campus/layout';
import {
  campusWalkMap, FENCED, placeGate, placeKind, placeOf, segmentHitsRect, sitePlan,
  type P2, type Place, type Rect, type Roads, type WalkMap,
} from '../src/render3d/campus/paths';

// Node has no canvas: a few pieces paint textures (light pools, signs) — give them one that draws nothing
const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? {} : () => ({ addColorStop() {} })), set: () => true });
const g = globalThis as { document?: unknown };
g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };

/** An Act I campus with one of everything (and the hall in three sizes), optionally one still being built. */
function act1Campus(building: boolean): GameState {
  const s = newGame({ name: 'T', homeSite: 'bay-area', seed: 3 });
  const base = s.facilities.find((f) => f.siteId === 'bay-area')!;
  const add = (type: FacilityType, tier = 1, status: Facility['status'] = 'online') =>
    s.facilities.push({ ...base, id: `t-${type}-${s.facilities.length}`, type, tier, status, progress: status === 'online' ? 100 : 30, buildDays: 100, racks: [] });
  add('datacenter', 1); add('lab', 1); add('gas', 1); add('solar', 1); add('battery', 1); add('wind', 1);
  add('datacenter', 2); add('datacenter', 3); add('lab', 3); add('gas', 2, building ? 'building' : 'online');
  s.sites['bay-area'].extraSlots = 8;
  refreshStats(s);
  return s;
}

async function campus(s: GameState, siteId: string) {
  const { FACILITY_PIECES } = await import('../src/render3d/campus/registry');
  const { shapeOf } = await import('../src/render3d/campus/people');
  const L = campusLayout(s, siteId);
  const places: Place[] = [];
  const cars: { obj: THREE.Object3D; bay: Place['bays'][number]; place: string }[] = [];
  const extra: Rect[] = [];
  for (const item of L.items) {
    if (item.kind === 'empty') { extra.push({ x0: item.rect.x0 + 0.8, z0: item.rect.z0 + 0.8, x1: item.rect.x1 - 0.8, z1: item.rect.z1 - 0.8 }); continue; }
    if (item.kind !== 'facility') continue;
    const f = item.facility!;
    const w = item.rect.x1 - item.rect.x0, d = item.rect.z1 - item.rect.z0;
    const make = FACILITY_PIECES[f.type];
    const piece = make ? make({ seed: 7, w, d, tier: f.upgrade?.to ?? f.tier ?? 1, f }) : { obj: new THREE.Group(), w: w * 0.75, d: d * 0.6, h: 8 };
    const root = new THREE.Group();
    const cx = (item.rect.x0 + item.rect.x1) / 2, cz = (item.rect.z0 + item.rect.z1) / 2;
    root.position.set(cx, 0, cz);
    root.add(piece.obj);
    const { shape, cars: cs } = shapeOf(piece, root);
    const building = f.status !== 'online';
    const p = placeOf(f.id, placeKind(f.type), item.rect, shape, cx, cz, { fence: FENCED.has(f.type) ? 7 : undefined, building });
    if (building) {
      const clip = !['solar', 'battery', 'wind', 'hq'].includes(f.type);
      const plan = sitePlan(w, d, piece, { scaffold: clip, crane: clip || f.type === 'wind' });
      p.site = { door: { x: plan.door.x + cx, z: plan.door.z + cz, nx: 0, nz: 1 }, stack: { x: plan.stack.x + cx, z: plan.stack.z + cz }, solids: plan.solids.map((r) => ({ x0: r.x0 + cx, z0: r.z0 + cz, x1: r.x1 + cx, z1: r.z1 + cz })) };
    }
    places.push(p);
    for (const c of cs) cars.push({ ...c, place: f.id });
  }
  extra.push({ x0: L.substation.x - 8, z0: L.substation.z - 8, x1: L.substation.x + 8, z1: L.substation.z + 8 });
  const east = L.cells.reduce((a, c) => Math.max(a, c.x1), 0) + 6;
  const roads: Roads = { frontZ: FRONT_Z, accessX: L.accessX, highwayZ: HIGHWAY_Z, east, laneZ: -PD - 4, accessNorth: -PD - 4 };
  return { L, places, cars, extra, roads };
}

const cross = (a: P2, b: P2, c: P2, d: P2) => {
  const o = (p: P2, q: P2, r: P2) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

/** The first solid or fence a polyline passes through (null = clear). */
function blocked(map: WalkMap, route: P2[]): string | null {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    for (const s of map.solids) if (segmentHitsRect(a, b, s)) return `segment ${JSON.stringify([a, b])} through ${JSON.stringify(s)}`;
    for (const [c, d] of map.fences) if (cross(a, b, c, d)) return `segment ${JSON.stringify([a, b])} through the fence ${JSON.stringify([c, d])}`;
  }
  return null;
}

function checkWays(map: WalkMap, places: Place[], roads: Roads) {
  let n = 0;
  const staffed = places.filter((p) => p.kind !== 'field' && p.kind !== 'yard' && p.kind !== 'rival');
  for (const p of staffed) {
    for (const d of p.doors) {
      expect(map.free(d.x, d.z), `door of ${p.id} is open ground`).toBe(true);
      const r = map.route(placeGate(p, roads), d);
      expect(r, `a way in to ${p.id}`).not.toBeNull();
      expect(blocked(map, r!), `the way in to ${p.id}`).toBeNull();
      n++;
      // errands: door to door
      for (const q of staffed) if (q !== p) {
        const e = map.route(d, q.doors[0]);
        expect(e, `${p.id} → ${q.id}`).not.toBeNull();
        expect(blocked(map, e!), `${p.id} → ${q.id}`).toBeNull();
      }
    }
  }
  return n;
}

describe('3D campus people', () => {
  it('reaches every door by a clear way, on an Act I campus and the Act II preset', async () => {
    for (const s of [act1Campus(false), newAct2Game({ name: 'T', homeSite: 'bay-area', seed: 3 })]) {
      refreshStats(s);
      const { L, places, extra, roads } = await campus(s, s.company.homeSite);
      const map = campusWalkMap(L.bounds, roads, places, extra);
      // (at least two doors to walk between: the garage has one way in since v0.15.1, its open bay is not a door)
      expect(checkWays(map, places, roads)).toBeGreaterThan(1);
      // the hall's own car park and transformers stay inside its fence
      for (const p of places) if (p.fence) for (const sld of [...p.solids, ...p.bays.map((b) => ({ x0: b.x - 0.5, z0: b.z - 0.5, x1: b.x + 0.5, z1: b.z + 0.5 }))]) {
        expect(sld.z1 <= p.fence.rect.z1 + 0.05 && sld.z0 >= p.fence.rect.z0 - 0.05, `${p.id}: ${JSON.stringify(sld)} inside the fence`).toBe(true);
      }
    }
  });

  it('keeps everyone out of buildings, fences and cars through a whole day', async () => {
    const { CampusPeople } = await import('../src/render3d/campus/people');
    for (const s of [act1Campus(true), newAct2Game({ name: 'T', homeSite: 'bay-area', seed: 3 })]) {
      const { L, places, cars, extra, roads } = await campus(s, s.company.homeSite);
      const people = new CampusPeople(() => 0);
      people.setPlaces(L.bounds, roads, places, cars, extra, 0);
      people.setAdvisors([{ id: 'juno', kind: 'engineer' }, { id: 'penny', kind: 'office' }]);
      const map = people.map;
      const cam = new THREE.PerspectiveCamera(30, 1.6, 1, 4000);
      cam.position.set(0, 200, 200);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      const seen = new Set<P2[]>();
      const last = new Map<string, P2>();
      const at: Record<string, { roles: string[]; crews: number; staff: number }> = {};
      let t = 0;
      for (let hour = 0; hour < 24; hour += 0.05) {
        for (let i = 0; i < 12; i++) {
          t += 0.5;
          people.update({ t, dt: 0.5, night: hour < 6 || hour > 20 ? 1 : 0 }, hour, cam);
          for (const r of people.routes) {
            if (seen.has(r)) continue;
            seen.add(r);
            expect(blocked(map, r)).toBeNull();
          }
          for (const o of people.outside) {
            const prev = last.get(o.key);
            last.set(o.key, { x: o.x, z: o.z });
            if (o.door) continue;
            const inside = map.solids.find((r) => o.x > r.x0 + 0.02 && o.x < r.x1 - 0.02 && o.z > r.z0 + 0.02 && o.z < r.z1 - 0.02);
            expect(inside, `${o.key} (${o.task}) at ${o.x.toFixed(2)},${o.z.toFixed(2)} ${hour.toFixed(2)}h`).toBeUndefined();
            if (prev && Math.hypot(prev.x - o.x, prev.z - o.z) < 3) for (const [c, d] of map.fences) expect(cross(prev, o, c, d), `${o.key} through a fence`).toBe(false);
          }
        }
        const key = hour.toFixed(2);
        if (['3.00', '10.50', '12.50', '15.00', '22.50'].includes(key)) {
          const out = people.outside;
          at[key] = { roles: [...new Set(out.map((o) => o.role))], crews: out.filter((o) => o.role === 'crew').length, staff: out.filter((o) => o.role === 'staff').length };        }
      }
      // the small hours: only the guard and the night shift; the day: staff about (and the crew at work)
      expect(at['3.00'].roles.every((r) => r === 'guard' || r === 'night')).toBe(true);
      expect(at['3.00'].roles).toContain('guard');
      expect(at['10.50'].staff + at['15.00'].staff).toBeGreaterThan(2);
      expect(at['12.50'].staff).toBeGreaterThan(0);
      if (places.some((p) => p.building)) expect(at['10.50'].crews).toBeGreaterThan(1);
      expect(at['22.50'].crews).toBe(0);
    }
  });
});
