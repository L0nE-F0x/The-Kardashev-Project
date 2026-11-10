/**
 * The globe's Act II layers: subsea cable systems (faint), the ones you lease (bright) and the ones
 * you lay (bright as far as they're laid), cut cables (blinking red, a repair ship on station),
 * your overland fiber, light running along every working link of yours, and cargo ships on the busy lanes.
 */
import * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { OVER_CLOUDS, softLine, type LineLook } from './soft';
import type { Router } from '../../world/routing';
import type { GameState } from '../../sim/types';
import { siteDef } from '../../content/sites';
import { actOf, cableDraws, LANES, lanePath, seaPath, type CableDraw } from '../../render/worldMap/act2Layers';
import { dir, R } from './earth';
import { model } from './markers';
import { Kit, rng } from '../kit';
import { PALETTE } from '../../render/palette';

const RAD = Math.PI / 180;
type LonLat = [number, number];

/** Data on a working link: a comet of light every 16 units, quick. */
export const DATA_PULSE = { gap: 16, speed: 7 };
/** Power on a line: slower, closer together. */
export const POWER_PULSE = { gap: 11, speed: 3.6 };

/** Points on the globe along a lon/lat path, with great-circle steps between them. */
export function globePath(path: LonLat[], lift = 1.004, stepDeg = 1.2): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = dir(path[i][0], path[i][1]);
    if (i > 0) {
      const b0 = dir(path[i - 1][0], path[i - 1][1]);
      const steps = Math.ceil(b0.angleTo(a) / (stepDeg * RAD));
      for (let k = 1; k < steps; k++) out.push(b0.clone().lerp(a, k / steps).normalize().multiplyScalar(R * lift));
    }
    out.push(a.multiplyScalar(R * lift));
  }
  return out;
}

/** Cumulative arc lengths, for walking along a path. */
export function lengths(pts: THREE.Vector3[]) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return acc;
}
export function along(pts: THREE.Vector3[], acc: number[], f: number): { p: THREE.Vector3; fwd: THREE.Vector3 } {
  const want = Math.max(0, Math.min(1, f)) * acc[acc.length - 1];
  let i = 1;
  while (i < acc.length - 1 && acc[i] < want) i++;
  const k = (want - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
  const p = pts[i - 1].clone().lerp(pts[i], k);
  return { p, fwd: pts[i].clone().sub(pts[i - 1]).normalize() };
}

/** Take a line off the globe and free it. */
export function dropLine(group: THREE.Object3D, l: Line2) {
  group.remove(l);
  l.geometry.dispose();
  l.material.dispose();
}

function fatLine(pts: THREE.Vector3[], color: string, width: number, o: Partial<LineLook> = {}) {
  return softLine(pts, { color, width, dashSize: 0.8, gapSize: 0.6, ...o });
}

/** A small code-built cargo ship (deck containers in the lane's colours), bow towards +x. */
function cargoShip(hull: string, cargo: string, seed: number) {
  const k = new Kit(rng(seed));
  k.box(1.9, 0.3, 0.55, hull, 0, 0, 0, { r: 0.08 });
  k.box(1.85, 0.1, 0.5, '#efe8de', 0, 0.3, 0, { r: 0.02 });
  for (let i = 0; i < 4; i++) k.box(0.32, 0.24 + (i % 2) * 0.08, 0.44, i % 2 ? cargo : '#e6e0e3', -0.55 + i * 0.33, 0.4, 0, { r: 0.02 });
  k.box(0.28, 0.5, 0.45, '#efe8de', 0.78, 0.4, 0, { r: 0.04 });
  const g = new THREE.Group();
  g.add(model(k));
  return g;
}

interface CableObj { draw: CableDraw; pts: THREE.Vector3[]; acc: number[]; lines: Line2[]; key: string }

export class NetworkLayer {
  readonly group = new THREE.Group();
  private cables = new Map<string, CableObj>();
  private fiber = new Map<string, { line: Line2; key: string }>();
  private cuts = new Map<string, { mark: THREE.Mesh; ship: THREE.Object3D }>();
  private lanes: { obj: THREE.Object3D; pts: THREE.Vector3[]; acc: number[]; phase: number; days: number }[] | null = null;
  private time = 0;

  constructor(private router: Router) {}

  /** Sea routes are worked out a couple per frame, so the first look at the globe doesn't hitch. */
  private budget = 0;
  private track(a: string, b: string) {
    let path = seaPath(this.router, a, b, undefined, false);
    if (!path && this.budget-- > 0) path = seaPath(this.router, a, b);
    return path ? globePath(path, 1.0035) : [];
  }

  update(s: GameState | null, day: number, dt: number, scale: (p: THREE.Vector3, px: number) => number, facing: (n: THREE.Vector3) => number) {
    this.time += dt;
    const on = !!s && actOf(s).act >= 2;
    this.group.visible = on;
    if (!on || !s) return;
    this.budget = 2;
    // cables
    const draws = cableDraws(s);
    const alive = new Set<string>();
    for (const c of draws) {
      alive.add(c.id);
      const key = `${c.kind}|${c.cut}|${Math.round(c.built * 40)}`;
      let o = this.cables.get(c.id);
      if (o && o.key === key) continue;
      if (o) for (const l of o.lines) dropLine(this.group, l);
      const pts = o?.pts ?? this.track(c.a, c.b);
      if (pts.length < 2) continue;
      const acc = o?.acc ?? lengths(pts);
      const lines: Line2[] = [];
      const add = (l: Line2) => { lines.push(l); this.group.add(l); };
      if (c.cut) add(fatLine(pts, PALETTE.red3, 2.2, { glow: 0.5 }));
      else if (c.kind === 'system') add(fatLine(pts, PALETTE.sea7, 1.1, { opacity: 0.5, glow: 0.18 }));
      else if (c.kind === 'leased') add(fatLine(pts, PALETTE.cyn5, 2.2, { pulse: DATA_PULSE }));
      else {
        const n = Math.max(2, Math.round(c.built * (pts.length - 1)) + 1);
        add(fatLine(pts.slice(0, n), PALETTE.cyn6, 2.6, c.built >= 1 ? { pulse: DATA_PULSE } : {}));
        if (n < pts.length) add(fatLine(pts.slice(n - 1), PALETTE.ink8, 1.5, { opacity: 0.8, dashed: true, glow: 0 }));
      }
      o = { draw: c, pts, acc, lines, key };
      this.cables.set(c.id, o);
    }
    for (const [id, o] of this.cables) if (!alive.has(id)) { for (const l of o.lines) dropLine(this.group, l); this.cables.delete(id); }
    // cut cables blink, and a repair ship sits over the break
    const blink = Math.sin(this.time * 6) > 0;
    for (const o of this.cables.values()) {
      if (!o.draw.cut) continue;
      (o.lines[0].material as LineMaterial).color.set(blink ? PALETTE.red3 : PALETTE.red1);
    }
    const cutIds = new Set([...this.cables.values()].filter((o) => o.draw.cut).map((o) => o.draw.id));
    for (const id of cutIds) {
      if (this.cuts.has(id)) continue;
      const o = this.cables.get(id)!;
      const { p } = along(o.pts, o.acc, 0.5);
      // (drawn with the markers, over the clouds)
      const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.red3).multiplyScalar(1.8), transparent: true }));
      mark.renderOrder = OVER_CLOUDS + 2;
      mark.position.copy(p).normalize().multiplyScalar(R * 1.01);
      const ship = cargoShip(PALETTE.org1, PALETTE.yel0, 9);
      ship.position.copy(p).normalize().multiplyScalar(R * 1.002);
      this.group.add(mark, ship);
      this.cuts.set(id, { mark, ship });
    }
    for (const [id, c] of this.cuts) {
      if (cutIds.has(id)) continue;
      this.group.remove(c.mark, c.ship);
      c.mark.geometry.dispose();
      (c.mark.material as THREE.Material).dispose();
      c.ship.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.cuts.delete(id);
    }
    for (const c of this.cuts.values()) {
      const n = c.mark.position.clone().normalize();
      c.mark.visible = facing(n) > 0.05;
      c.ship.visible = c.mark.visible;
      c.mark.scale.setScalar(scale(c.mark.position, 6) * (1 + Math.sin(this.time * 6) * 0.2));
      c.mark.rotation.y = this.time * 2;
      c.ship.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      c.ship.scale.setScalar(scale(c.ship.position, 7));
    }
    // fiber
    const fseen = new Set<string>();
    for (const f of s.network?.fiber ?? []) {
      fseen.add(f.id);
      const key = f.status;
      const o = this.fiber.get(f.id);
      if (o && o.key === key) continue;
      if (o) dropLine(this.group, o.line);
      const A = siteDef(f.a), B = siteDef(f.b);
      const pts = globePath([[A.lon, A.lat], [B.lon, B.lat]], 1.003, 0.5);
      const line = f.status === 'online' ? fatLine(pts, PALETTE.yel0, 2.2, { pulse: DATA_PULSE }) : fatLine(pts, PALETTE.org2, 1.6, { dashed: true });
      this.group.add(line);
      this.fiber.set(f.id, { line, key });
    }
    for (const [id, o] of this.fiber) if (!fseen.has(id)) { dropLine(this.group, o.line); this.fiber.delete(id); }
    // cargo on the busy lanes (out and back at ~700 km/day)
    if (!this.lanes || this.lanes.length < LANES.length) {
      this.lanes ??= [];
      for (const [i, lane] of LANES.entries()) {
        if (this.lanes.some((l) => l.phase === lane.phase)) continue;
        let path = lanePath(this.router, lane, new Set(), false);
        if (!path && this.budget-- > 0) path = lanePath(this.router, lane, new Set());
        if (!path) continue;
        const pts = globePath(path, 1.0015);
        const acc = lengths(pts);
        const km = (acc[acc.length - 1] / R) * 6371;
        const obj = cargoShip(PALETTE[lane.hull], PALETTE[lane.cargo], i + 20);
        this.group.add(obj);
        this.lanes.push({ obj, pts, acc, phase: lane.phase, days: Math.max(8, km / 700) });
      }
    }
    for (const l of this.lanes) {
      let f = (day / l.days + l.phase * 2) % 2;
      let back = false;
      if (f > 1) { f = 2 - f; back = true; }
      const { p, fwd } = along(l.pts, l.acc, f);
      const n = p.clone().normalize();
      l.obj.visible = facing(n) > 0.05;
      if (!l.obj.visible) continue;
      const head = (back ? fwd.clone().negate() : fwd).sub(n.clone().multiplyScalar(fwd.dot(n))).normalize();
      const side = new THREE.Vector3().crossVectors(n, head);
      const pos = n.clone().multiplyScalar(R * 1.0015);
      const sc = scale(pos, 6);
      l.obj.matrixAutoUpdate = false;
      l.obj.matrix.makeBasis(head, n, side.negate()).scale(new THREE.Vector3(sc, sc, sc)).setPosition(pos);
      l.obj.matrixWorldNeedsUpdate = true;
    }
  }
}
