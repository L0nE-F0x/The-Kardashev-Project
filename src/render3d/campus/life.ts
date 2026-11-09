/**
 * Life on a 3D campus: Bit hovering about, cars in their bays (the traffic that drives is vehicles.ts), and `Crowd`: people on fixed loops for the set pieces that script their own (Geneva's
 * plaza, Aurora's town, the Moon). A campus's working day (staff, crews, the guard, the advisors) is people.ts.
 */
import * as THREE from 'three';
import { CARS, model, person, PEOPLE, type Act, type Figure, type ModelName, type PersonName } from '../models';
import { glowMat, rng, Kit } from '../kit';
import { person as boxPerson, type Env } from '../pieces';

export interface Walker {
  obj: THREE.Object3D;
  fig: Figure | null;
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
  /** Standing: what they're doing and until when (s) before they shift to something else. */
  pose?: Act;
  poseFor: number;
}

export const hitGeo = new THREE.BoxGeometry(1.4, 2.2, 1.4).translate(0, 1.1, 0);
export const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/** What someone standing about does next (a chat partner listens, someone alone checks their phone…). */
const STANDING: Act[] = ['idle', 'idle', 'listen', 'phone', 'drink', 'look', 'chat'];

export class Crowd {
  readonly group = new THREE.Group();
  readonly walkers: Walker[] = [];
  private r = rng(5);

  /** A person walking a loop of points (y from `h`); one point = standing there. */
  add(kind: PersonName | null, pts: [number, number][], h: (x: number, z: number) => number, opts: { advisor?: string; pause?: [number, number]; speed?: number; height?: number } = {}) {
    const k = kind ?? PEOPLE[Math.floor(this.r() * PEOPLE.length)];
    const p = person(k, opts.height ?? 1.75 * (0.94 + this.r() * 0.12));
    const obj = p?.obj ?? boxPerson(Math.floor(this.r() * 1e6), k === 'worker');
    const path = pts.map(([x, z]) => new THREE.Vector3(x, h(x, z), z));
    obj.position.copy(path[0]);
    this.group.add(obj);
    const w: Walker = {
      obj, fig: p, mixer: p?.mixer ?? null, walk: p?.walk ?? null, path, i: Math.floor(this.r() * path.length), t: this.r(),
      speed: opts.speed ?? 1.15 + this.r() * 0.35, wait: this.r() * 2, pause: opts.pause ?? [0.5, 4], advisor: opts.advisor, poseFor: 0,
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
    w.fig = p;
    w.mixer = p.mixer;
    w.walk = p.walk;
    w.pose = undefined;
  }

  /** Standing still: an idle, a chat, a look round (never a frozen step); every so often something else. */
  private stand(w: Walker, dt: number) {
    w.poseFor -= dt;
    if (!w.pose || w.poseFor <= 0) {
      w.pose = STANDING[Math.floor(this.r() * STANDING.length)];
      w.poseFor = 6 + this.r() * 10;
      w.fig?.play(w.pose, 0.5);
    }
  }

  update(e: Env) {
    for (const w of this.walkers) {
      if (w.path.length < 2 || w.wait > 0) {
        if (w.path.length >= 2) w.wait -= e.dt;
        this.stand(w, e.dt);
        w.fig?.update(e.dt);
        continue;
      }
      if (w.pose) { w.pose = undefined; w.fig?.play('walk', 0.25); }
      w.fig?.pace(w.speed);
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
      if (!w.fig) w.obj.position.y += Math.abs(Math.sin(e.t * 9 * w.speed)) * 0.08;
      const target = Math.atan2(b.x - a.x, b.z - a.z);
      let d = target - w.obj.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      w.obj.rotation.y += d * Math.min(1, e.dt * 8);
      w.fig?.update(e.dt);
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


/** Each car model's width as a share of its length (mirrors and all). */
const WID: Partial<Record<ModelName, number>> = { sedan: 0.518, hatchback: 0.567, suv: 0.487, pickup: 0.439, van: 0.551 };

const LEN: Partial<Record<ModelName, number>> = { semitruck: 11, mixer: 7.5, flatbed: 7.5, van: 5.2, pickup: 4.6, sedan: 4.3, hatchback: 3.8, suv: 4.6 };

/**
 * A few cars parked in a row of bays (varied makes). Each car carries `userData.bay` ({ len, wid }), so the people
 * walk round it and whoever drives it arrives and leaves by it (people.ts finds them).
 */
export function parkedCars(parent: THREE.Object3D, x0: number, z: number, n: number, gap: number, seed: number, facing = 0, kinds: ModelName[] = CARS) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    if (n > 2 && r() < 0.25) continue;
    const kind = kinds[Math.floor(r() * kinds.length)];
    const len = LEN[kind] ?? 4.3;
    const c = model(kind, len);
    c.rotation.y = facing + (r() - 0.5) * 0.06;
    c.position.set(x0 + i * gap, 0.05, z);
    c.userData.bay = { len, wid: len * (WID[kind] ?? 0.52) };
    parent.add(c);
  }
}
