/**
 * Life on a 3D campus: Bit hovering about, cars in their bays (the traffic that drives is vehicles.ts), and `Crowd`: people on fixed loops for the set pieces that script their own (Geneva's
 * plaza, Aurora's town, the Moon). A campus's working day (staff, crews, the guard, the advisors) is people.ts.
 */
import * as THREE from 'three';
import { CARS, model, paintCar, person, PEOPLE, type Act, type Figure, type ModelName, type PersonName } from '../models';
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
  /** Low gravity: how high each loping stride carries them (m), and where in the stride they are. */
  lope?: number;
  hop: number;
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
  add(kind: PersonName | null, pts: [number, number][], h: (x: number, z: number) => number, opts: { advisor?: string; pause?: [number, number]; speed?: number; height?: number; lope?: number } = {}) {
    const k = kind ?? PEOPLE[Math.floor(this.r() * PEOPLE.length)];
    const p = person(k, opts.height ?? 1.75 * (0.94 + this.r() * 0.12));
    const obj = p?.obj ?? boxPerson(Math.floor(this.r() * 1e6), k === 'worker');
    const path = pts.map(([x, z]) => new THREE.Vector3(x, h(x, z), z));
    obj.position.copy(path[0]);
    this.group.add(obj);
    const w: Walker = {
      obj, fig: p, mixer: p?.mixer ?? null, walk: p?.walk ?? null, path, i: Math.floor(this.r() * path.length), t: this.r(),
      speed: opts.speed ?? 1.15 + this.r() * 0.35, wait: this.r() * 2, pause: opts.pause ?? [0.5, 4], advisor: opts.advisor, poseFor: 0, lope: opts.lope, hop: 0,
    };
    if (opts.lope) obj.rotation.order = 'YXZ';
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
        // (a loper comes down from its last stride and straightens up)
        if (w.lope) {
          const p = w.path[w.i % w.path.length];
          w.obj.position.y += (p.y - w.obj.position.y) * Math.min(1, e.dt * 5);
          w.obj.rotation.x *= 1 - Math.min(1, e.dt * 4);
          w.hop = 0;
        }
        this.stand(w, e.dt);
        w.fig?.update(e.dt);
        continue;
      }
      if (w.pose) { w.pose = undefined; w.fig?.play('walk', 0.25); }
      // (one sixth of the weight: each push-off carries a long way, so the legs swing at half the pace)
      w.fig?.pace(w.lope ? 0.58 : w.speed);
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
      if (w.lope) {
        // a stride is a throw: up and down on a parabola, a little over a second in the air, leaning into it
        w.hop = (w.hop + e.dt / 1.05) % 1;
        w.obj.position.y += w.lope * 4 * w.hop * (1 - w.hop);
        w.obj.rotation.x += (0.16 - w.obj.rotation.x) * Math.min(1, e.dt * 4);
      }
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
const WID: Partial<Record<ModelName, number>> = { sedan: 0.518, hatchback: 0.474, suv: 0.487, pickup: 0.439, van: 0.551 };

const LEN: Partial<Record<ModelName, number>> = { semitruck: 11, mixer: 7.5, flatbed: 7.5, van: 5.2, pickup: 4.6, sedan: 4.3, hatchback: 3.8, suv: 4.6 };

/**
 * Stand every parked car under `root` on the surface below it: the plot's pad, a car park's asphalt, a yard's
 * slab (each piece lays its own at its own height, and a car at one fixed height sank into some and floated over
 * others). Call once the piece and its pad are both under `root`.
 */
export function settleCars(root: THREE.Object3D) {
  const cars: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.userData.bay) cars.push(o); });
  if (!cars.length) return;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const spots = cars.map((car) => ({ car, p: car.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), top: -1 }));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const scan = (o: THREE.Object3D) => {
    // not the cars themselves, nor the models (buildings, trees, people)
    if (o.userData.bay || o.userData.model) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && o.visible && !(o as THREE.InstancedMesh).isInstancedMesh && mesh.geometry.attributes.position) {
      const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index;
      m4.multiplyMatrices(inv, o.matrixWorld);
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m4);
        b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m4);
        c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m4);
        // flat and facing up (the cross product's y against its length)
        const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y), ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z), nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (ny <= 0 || ny * ny < 0.9 * (nx * nx + ny * ny + nz * nz)) continue;
        const y = Math.max(a.y, b.y, c.y);
        for (const s of spots) {
          if (y <= s.top || y > s.p.y + 0.5) continue;
          const d1 = (s.p.x - b.x) * (a.z - b.z) - (a.x - b.x) * (s.p.z - b.z), d2 = (s.p.x - c.x) * (b.z - c.z) - (b.x - c.x) * (s.p.z - c.z), d3 = (s.p.x - a.x) * (c.z - a.z) - (c.x - a.x) * (s.p.z - a.z);
          if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) s.top = y;
        }
      }
    }
    for (const ch of o.children) scan(ch);
  };
  scan(root);
  for (const s of spots) if (s.top >= 0) s.car.position.y += s.top + 0.005 - s.p.y;
}

/**
 * A few cars parked in a row of bays (varied makes). Each car carries `userData.bay` ({ len, wid }), so the people
 * walk round it and whoever drives it arrives and leaves by it (people.ts finds them).
 */
export function parkedCars(parent: THREE.Object3D, x0: number, z: number, n: number, gap: number, seed: number, facing = 0, kinds: ModelName[] = CARS) {
  const r = rng(seed);
  // (the paints have their own dice, so which bays are taken stays as it was)
  const pr = rng(seed + 991);
  let lastPaint = -1;
  const widthOf = (k: ModelName) => (LEN[k] ?? 4.3) * (WID[k] ?? 0.52);
  // the far side of the last car parked, along the row: the models are broad (mirrors and all, up to 2.4 m), so a
  // car only takes a bay when it clears its neighbour by a door's opening, a narrower make if that one fits
  let taken = -Infinity;
  for (let i = 0; i < n; i++) {
    if (n > 2 && r() < 0.25) continue;
    let kind = kinds[Math.floor(r() * kinds.length)];
    const room = (k: ModelName) => x0 + i * gap - widthOf(k) / 2 - taken >= 0.3;
    if (!room(kind)) {
      const fits = kinds.filter(room);
      if (!fits.length) continue;
      kind = fits[Math.floor(r() * fits.length)];
    }
    taken = x0 + i * gap + widthOf(kind) / 2;
    const len = LEN[kind] ?? 4.3;
    const c = model(kind, len);
    // no two cars side by side in the same colour
    for (let tries = 0; tries < 4; tries++) { paintCar(c, pr()); if (c.userData.paint !== lastPaint) break; }
    lastPaint = c.userData.paint ?? -1;
    c.rotation.y = facing + (r() - 0.5) * 0.06;
    // on the plot's pad (its top is 0.12 above the ground the piece stands on); `settleCars` then stands it on
    // whatever the piece laid there
    c.position.set(x0 + i * gap, 0.125, z);
    c.userData.bay = { len, wid: len * (WID[kind] ?? 0.52) };
    // (a car park fills when the building opens: `clipAbove`)
    c.userData.late = true;
    parent.add(c);
  }
  // a real car park (a row of bays side by side) says how far it reaches, empty bays and all: paved paths are
  // laid round it (people.ts `layPaths`)
  if (n >= 3 && Math.abs(Math.sin(facing)) > 0.7) {
    const lot = new THREE.Object3D();
    lot.position.set(x0 + ((n - 1) * gap) / 2, 0, z);
    lot.rotation.y = facing;
    lot.userData.lot = { len: 4.4, wid: n * gap };
    parent.add(lot);
  }
}
