/**
 * Life on a 3D campus: rigged people walking their rounds (staff between car park and door, crews
 * round a build, advisors you can click), Bit hovering about, traffic on the highway both ways and
 * the odd delivery up the access road. Cars park in car parks, never on the road.
 */
import * as THREE from 'three';
import { CARS, model, person, PEOPLE, type ModelName, type PersonName } from '../models';
import { glowMat, lightPool, poolMat, rng, Kit } from '../kit';
import { person as boxPerson, type Env } from '../pieces';

export interface Walker {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
  path: THREE.Vector3[];
  i: number;
  t: number;
  speed: number;
  wait: number;
  /** Pause at each corner (s), as [min, max]. */
  pause: [number, number];
  advisor?: string;
  hit?: THREE.Mesh;
}

const hitGeo = new THREE.BoxGeometry(1.4, 2.2, 1.4).translate(0, 1.1, 0);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

export class Crowd {
  readonly group = new THREE.Group();
  readonly walkers: Walker[] = [];
  private r = rng(5);

  /** A person walking a loop of points (y from `h`). */
  add(kind: PersonName | null, pts: [number, number][], h: (x: number, z: number) => number, opts: { advisor?: string; pause?: [number, number]; speed?: number; height?: number } = {}) {
    const k = kind ?? PEOPLE[Math.floor(this.r() * PEOPLE.length)];
    const p = person(k, opts.height ?? 1.75 * (0.94 + this.r() * 0.12));
    const obj = p?.obj ?? boxPerson(Math.floor(this.r() * 1e6), k === 'worker');
    const path = pts.map(([x, z]) => new THREE.Vector3(x, h(x, z), z));
    obj.position.copy(path[0]);
    this.group.add(obj);
    const w: Walker = {
      obj, mixer: p?.mixer ?? null, walk: p?.walk ?? null, path, i: Math.floor(this.r() * path.length), t: this.r(),
      speed: opts.speed ?? 1.15 + this.r() * 0.35, wait: this.r() * 2, pause: opts.pause ?? [0.5, 4], advisor: opts.advisor,
    };
    if (p?.walk) p.walk.time = this.r() * p.walk.getClip().duration;
    if (opts.advisor) {
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.userData.walker = w;
      obj.add(hit);
      hit.scale.setScalar(1 / obj.scale.x);
      w.hit = hit;
    }
    this.walkers.push(w);
    return w;
  }

  /** Swap a walker's figure for another (an advisor's own model once it has loaded). */
  reskin(w: Walker, kind: PersonName, height = 1.75) {
    const p = person(kind, height);
    if (!p) return;
    p.obj.position.copy(w.obj.position);
    p.obj.rotation.copy(w.obj.rotation);
    if (w.hit) { w.obj.remove(w.hit); p.obj.add(w.hit); w.hit.scale.setScalar(1 / p.obj.scale.x); }
    this.group.remove(w.obj);
    this.group.add(p.obj);
    w.obj = p.obj;
    w.mixer = p.mixer;
    w.walk = p.walk;
  }

  update(e: Env) {
    for (const w of this.walkers) {
      if (w.path.length < 2) { w.mixer?.update(0); continue; }
      if (w.wait > 0) {
        w.wait -= e.dt;
        // standing: the walk held on its feet-together frame
        if (w.walk) { w.walk.paused = true; w.walk.time = 0; }
        w.mixer?.update(0);
        continue;
      }
      if (w.walk) { w.walk.paused = false; w.walk.timeScale = w.speed / 1.2; }
      const a = w.path[w.i], b = w.path[(w.i + 1) % w.path.length];
      const len = a.distanceTo(b) || 1;
      w.t += (e.dt * w.speed) / len;
      if (w.t >= 1) {
        w.t = 0;
        w.i = (w.i + 1) % w.path.length;
        if (this.r() < 0.45) w.wait = w.pause[0] + this.r() * (w.pause[1] - w.pause[0]);
        continue;
      }
      w.obj.position.lerpVectors(a, b, w.t);
      if (!w.mixer) w.obj.position.y += Math.abs(Math.sin(e.t * 9 * w.speed)) * 0.08;
      const target = Math.atan2(b.x - a.x, b.z - a.z);
      let d = target - w.obj.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      w.obj.rotation.y += d * Math.min(1, e.dt * 8);
      w.mixer?.update(e.dt);
    }
  }

  hitTargets() {
    return this.walkers.filter((w) => w.hit).map((w) => w.hit!);
  }
}

/** Bit out on campus: a small hovering orb with a face, bobbing after people. */
export function makeBit() {
  const g = new THREE.Group();
  const k = new Kit(rng(2));
  k.geo(new THREE.SphereGeometry(0.42, 18, 14), '#e6e0e3', 0.01);
  k.geo(new THREE.TorusGeometry(0.43, 0.05, 6, 24).rotateX(Math.PI / 2), '#5b5562', 0);
  g.add(k.build());
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.27, 20), glowMat('cyn5', 0.8));
  face.position.set(0, 0.03, 0.4);
  g.add(face);
  for (const x of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), new THREE.MeshBasicMaterial({ color: 0x0b0a12 }));
    eye.position.set(x, 0.07, 0.405);
    g.add(eye);
  }
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), hitMat);
  g.add(hit);
  return { obj: g, hit };
}

// ── vehicles ─────────────────────────────────────────────────────────────────────────────────
interface Mover {
  obj: THREE.Object3D;
  /** Polyline it drives; it loops. */
  path: THREE.Vector3[];
  dist: number;
  speed: number;
  total: number;
  /** The ground: the vehicle keeps its wheels on it (and pitches with the slope) the whole way, not just at the ends. */
  h?: (x: number, z: number) => number;
}

const LEN: Partial<Record<ModelName, number>> = { semitruck: 11, mixer: 7.5, flatbed: 7.5, van: 5.2, pickup: 4.6, sedan: 4.3, hatchback: 3.8, suv: 4.6 };

function vehicle(n: ModelName, headMat: THREE.Material, tailMat: THREE.Material, beam: THREE.MeshBasicMaterial) {
  const len = LEN[n] ?? 4.4;
  const o = new THREE.Group();
  const body = model(n, len);
  // the Meshy vehicles' fronts are at -x; turn them so +z is forward
  body.rotation.y = Math.PI / 2;
  o.add(body);
  const hy = len > 6 ? 0.9 : 0.6, hw = len > 6 ? 0.75 : 0.55;
  for (const sx of [-hw, hw]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), headMat);
    hl.position.set(sx, hy, len / 2 + 0.02);
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), tailMat);
    tl.position.set(sx, hy, -len / 2 - 0.02);
    o.add(hl, tl);
  }
  lightPool(o, 0, 0, len / 2 + 4.5, 3.2, beam, 0.55);
  return { o, len };
}

export class Traffic {
  readonly group = new THREE.Group();
  private movers: Mover[] = [];
  private head = glowMat('yel2', 0);
  private tail = glowMat('red3', 0);
  private beam = poolMat('#ffe9c0', 0.7);

  constructor() {
    this.head.userData.nightOnly = 4;
    this.tail.userData.nightOnly = 3;
  }

  /** Both carriageways of a straight road along x at z, from x0 to x1. */
  highway(z: number, x0: number, x1: number, h: (x: number, z: number) => number, seed: number) {
    const r = rng(seed);
    const pool: ModelName[] = ['semitruck', 'semitruck', 'pickup', 'sedan', 'hatchback', 'suv', 'van', 'flatbed', 'mixer', 'semitruck'];
    for (const lane of [-1, 1]) {
      const zz = z + lane * 2;
      const a = new THREE.Vector3(lane > 0 ? x0 : x1, 0, zz), b = new THREE.Vector3(lane > 0 ? x1 : x0, 0, zz);
      const n = 9;
      const total = Math.abs(x1 - x0);
      for (let i = 0; i < n; i++) {
        const { o } = vehicle(pool[Math.floor(r() * pool.length)], this.head, this.tail, this.beam);
        this.group.add(o);
        this.movers.push({ obj: o, path: [a, b], dist: (i + r() * 0.5) * (total / n), speed: (lane > 0 ? 17 : 15) + (r() - 0.5) * 2, total, h });
      }
    }
  }

  /** A vehicle driving a loop (in from the highway, along the campus road and out again). */
  loop(n: ModelName, pts: [number, number][], h: (x: number, z: number) => number, speed = 7, offset = 0) {
    const path = pts.map(([x, z]) => new THREE.Vector3(x, h(x, z), z));
    let total = 0;
    for (let i = 0; i < path.length; i++) total += path[i].distanceTo(path[(i + 1) % path.length]);
    const { o } = vehicle(n, this.head, this.tail, this.beam);
    this.group.add(o);
    this.movers.push({ obj: o, path, dist: offset * total, speed, total, h });
  }

  update(e: Env) {
    for (const m of this.movers) {
      m.dist = (m.dist + m.speed * e.dt) % m.total;
      // find the segment
      let d = m.dist;
      const closed = m.path.length > 2;
      const segs = closed ? m.path.length : 1;
      for (let i = 0; i < segs; i++) {
        const a = m.path[i], b = m.path[(i + 1) % m.path.length];
        const len = a.distanceTo(b);
        if (d <= len || i === segs - 1) {
          const t = len > 0 ? Math.min(1, d / len) : 0;
          m.obj.position.lerpVectors(a, b, t);
          if (m.h) {
            // on the ground under it, nose up or down with the road
            const p = m.obj.position, fx = (b.x - a.x) / (len || 1), fz = (b.z - a.z) / (len || 1);
            p.y = m.h(p.x, p.z);
            m.obj.rotation.order = 'YXZ';
            m.obj.rotation.x = -Math.atan((m.h(p.x + fx * 2, p.z + fz * 2) - m.h(p.x - fx * 2, p.z - fz * 2)) / 4);
          }
          const want = Math.atan2(b.x - a.x, b.z - a.z);
          let dd = want - m.obj.rotation.y;
          dd = Math.atan2(Math.sin(dd), Math.cos(dd));
          m.obj.rotation.y += closed ? dd * Math.min(1, e.dt * 4) : dd;
          break;
        }
        d -= len;
      }
    }
  }
}

/** A few cars parked in a row of bays (varied makes). */
export function parkedCars(parent: THREE.Object3D, x0: number, z: number, n: number, gap: number, seed: number, facing = 0) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    if (n > 2 && r() < 0.25) continue;
    const kind = CARS[Math.floor(r() * CARS.length)];
    const c = model(kind, LEN[kind] ?? 4.3);
    c.rotation.y = facing + (r() - 0.5) * 0.06;
    c.position.set(x0 + i * gap, 0.05, z);
    parent.add(c);
  }
}
