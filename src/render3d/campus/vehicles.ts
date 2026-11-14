/**
 * Traffic on a 3D campus, driven like traffic: every vehicle follows a smooth route (corners rounded into real
 * turning arcs), slows for bends, keeps its distance from whatever is ahead of it in its lane (an intelligent-driver
 * model, so cars queue behind a slow truck instead of passing through it), stops at stop lines and waits for a gap,
 * yields to oncoming traffic before turning across it, and a delivery pulls up outside the buildings to unload.
 * Right-hand traffic. Wheels stay on the ground, nose pitched with the slope.
 */
import * as THREE from 'three';
import { drivenCar, model, paintCar, type ModelName } from '../models';
import { glowMat, lightPool, poolMat, rng } from '../kit';
import type { Env } from '../pieces';

type H = (x: number, z: number) => number;

const LEN: Partial<Record<ModelName, number>> = { semitruck: 11, mixer: 7.5, flatbed: 7.5, van: 5.2, pickup: 4.6, sedan: 4.3, hatchback: 3.8, suv: 4.6 };

/** A stop on a route: wait `wait` s, then until `clear()` says the way is free. */
interface Stop { s: number; wait: number; clear?: () => boolean }

/** A route: points every ~0.5 m along a smoothed polyline, each with its distance and a safe speed for its bend. */
interface Route { pts: THREE.Vector2[]; dist: number[]; vmax: number[]; total: number; stops: Stop[]; wrap: boolean }

interface Car {
  obj: THREE.Object3D;
  len: number;
  route: Route;
  s: number;
  v: number;
  v0: number;
  /** Stop index we're held at, and for how long so far. */
  held: number;
  heldT: number;
  /** Stops already served this lap. */
  served: Set<number>;
  /** How long it has stood for someone on foot, and (after far too long) how long it may edge on regardless. */
  yieldT: number;
  pushT: number;
  pos: THREE.Vector2;
  dir: THREE.Vector2;
  /** Its wheels: the angle they have turned through (the material reads it) and their radius. */
  wheels: { spin: { value: number }; r: number } | null;
}

/** Round a polyline's corners (radius per corner, 0 = sharp) and resample it every ~0.5 m. */
function smoothRoute(pts: [number, number][], radii: number[], closed: boolean, vCruise: number): Omit<Route, 'stops' | 'wrap'> {
  const P = pts.map(([x, z]) => new THREE.Vector2(x, z));
  const out: THREE.Vector2[] = [];
  const n = P.length;
  const push = (v: THREE.Vector2) => { if (!out.length || out[out.length - 1].distanceTo(v) > 0.05) out.push(v.clone()); };
  const lineTo = (a: THREE.Vector2, b: THREE.Vector2) => {
    const d = a.distanceTo(b), k = Math.max(1, Math.ceil(d / 0.5));
    for (let i = 1; i <= k; i++) push(a.clone().lerp(b, i / k));
  };
  let cur = P[0].clone();
  push(cur);
  const last = closed ? n : n - 1;
  for (let i = 1; i <= last; i++) {
    const b = P[i % n];
    const c = P[(i + 1) % n];
    const r = radii[i % n] ?? 0;
    const isCorner = closed || i < n - 1;
    if (!isCorner || r <= 0) { lineTo(cur, b); cur = b.clone(); continue; }
    const d1 = b.clone().sub(cur).normalize(), d2 = c.clone().sub(b).normalize();
    const turn = Math.acos(Math.max(-1, Math.min(1, d1.dot(d2))));
    if (turn < 0.02) { lineTo(cur, b); cur = b.clone(); continue; }
    // tangent length for this radius, kept inside both legs
    const t = Math.min(r * Math.tan(turn / 2), cur.distanceTo(b) * 0.95, b.distanceTo(c) * 0.48);
    const rr = t / Math.tan(turn / 2);
    const p1 = b.clone().addScaledVector(d1, -t), p2 = b.clone().addScaledVector(d2, t);
    lineTo(cur, p1);
    const side = d1.x * d2.y - d1.y * d2.x > 0 ? 1 : -1;
    const nrm = new THREE.Vector2(-d1.y, d1.x).multiplyScalar(side);
    const centre = p1.clone().addScaledVector(nrm, rr);
    const a0 = Math.atan2(p1.y - centre.y, p1.x - centre.x), a1 = Math.atan2(p2.y - centre.y, p2.x - centre.x);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const k = Math.max(2, Math.ceil(Math.abs(da) * rr / 0.5));
    for (let j = 1; j <= k; j++) { const a = a0 + (da * j) / k; push(new THREE.Vector2(centre.x + Math.cos(a) * rr, centre.y + Math.sin(a) * rr)); }
    cur = p2;
  }
  if (closed) lineTo(cur, P[0]);
  const dist = [0];
  for (let i = 1; i < out.length; i++) dist.push(dist[i - 1] + out[i].distanceTo(out[i - 1]));
  // the speed a bend allows (lateral ~2.2 m/s²), from the turn over the next few metres
  const vmax = out.map((p, i) => {
    const a = out[Math.max(0, i - 3)], b = out[Math.min(out.length - 1, i + 3)];
    const d1 = p.clone().sub(a), d2 = b.clone().sub(p);
    const l = d1.length() + d2.length();
    if (l < 0.1) return vCruise;
    const ang = Math.acos(Math.max(-1, Math.min(1, d1.normalize().dot(d2.normalize()))));
    const radius = ang > 1e-3 ? l / ang : 1e9;
    return Math.min(vCruise, Math.sqrt(2.2 * radius));
  });
  return { pts: out, dist, vmax, total: dist[dist.length - 1] };
}

function sample(r: Route, s: number, pos: THREE.Vector2, dir: THREE.Vector2) {
  const d = r.dist;
  let lo = 0, hi = d.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (d[m] <= s) lo = m; else hi = m; }
  const a = r.pts[lo], b = r.pts[hi];
  const t = d[hi] > d[lo] ? (s - d[lo]) / (d[hi] - d[lo]) : 0;
  pos.copy(a).lerp(b, Math.max(0, Math.min(1, t)));
  // heading from a short stretch round the point (smooth through the arcs)
  const ia = Math.max(0, lo - 2), ib = Math.min(r.pts.length - 1, hi + 2);
  dir.copy(r.pts[ib]).sub(r.pts[ia]).normalize();
  return lo;
}

/** Where each model's lamps sit (x, y, z per lamp, the vehicle's own space), found once by probing its bodywork. */
const lampSpots = new Map<string, { head: THREE.Vector3[]; tail: THREE.Vector3[] }>();
/**
 * The lamps go on the bodywork itself: a ray from dead ahead (and from behind) at lamp height finds the front (rear)
 * face on each side, whatever the model's shape, so no lamp hangs in the air behind a mixer's chute or a flatbed's
 * deck.
 */
function lampsFor(n: ModelName, body: THREE.Object3D, len: number) {
  const hit0 = lampSpots.get(n);
  if (hit0) return hit0;
  const out = { head: [] as THREE.Vector3[], tail: [] as THREE.Vector3[] };
  const size = body.userData.size as THREE.Vector3 | undefined;
  if (!size || !body.userData.model) return out;
  body.updateMatrixWorld(true);
  const truck = len > 6;
  const w = size.z, h = size.y;
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3(), dir = new THREE.Vector3();
  const probe = (sx: number, front: boolean, y0: number, y1: number) => {
    let best: THREE.Vector3 | null = null;
    for (let i = 0; i <= 4; i++) {
      from.set(sx, y0 + ((y1 - y0) * i) / 4, front ? len : -len);
      dir.set(0, 0, front ? -1 : 1);
      ray.set(from, dir);
      const hit = ray.intersectObject(body, true)[0];
      // the face that sticks out furthest at this height band (the lamp's housing, the bumper's corner)
      if (hit && (!best || (front ? hit.point.z > best.z : hit.point.z < best.z))) best = hit.point.clone();
    }
    return best;
  };
  for (const sx of [-w * 0.33, w * 0.33]) {
    const hd = truck ? probe(sx, true, 0.7, 1.15) : probe(sx, true, h * 0.36, h * 0.52);
    const tl = truck ? probe(sx, false, 0.75, 1.2) : probe(sx, false, h * 0.42, h * 0.62);
    if (hd) out.head.push(hd);
    if (tl) out.tail.push(tl);
  }
  lampSpots.set(n, out);
  return out;
}

let lens: THREE.BufferGeometry | null = null;
function vehicle(n: ModelName, headMat: THREE.Material, tailMat: THREE.Material, beam: THREE.MeshBasicMaterial, paint: number) {
  const len = LEN[n] ?? 4.4;
  const o = new THREE.Group();
  const body = paintCar(model(n, len), paint);
  // the Meshy vehicles' fronts are at -x; turn them so +z is forward
  body.rotation.y = Math.PI / 2;
  const spots = lampsFor(n, body, len);
  const wheels = drivenCar(body);
  o.add(body);
  // lamps as lenses set into the bodywork (a flattened ball, half sunk)
  lens ??= new THREE.SphereGeometry(1, 10, 6).scale(1, 0.8, 0.35);
  lens.userData.shared = true;
  const r = len > 6 ? 0.14 : 0.105;
  for (const p of spots.head) { const hl = new THREE.Mesh(lens, headMat); hl.scale.setScalar(r); hl.position.copy(p); o.add(hl); }
  for (const p of spots.tail) { const tl = new THREE.Mesh(lens, tailMat); tl.scale.setScalar(r * 0.9); tl.position.copy(p); o.add(tl); }
  lightPool(o, 0, 0, len / 2 + 4.5, 3.2, beam, 0.55);
  o.rotation.order = 'YXZ';
  return { o, len, wheels };
}

export interface RoadNet {
  /** The highway's centre line z and the access road's centre line x. */
  highwayZ: number;
  accessX: number;
  /** The frontage road's centre line z, where it ends (the turning circle) and the back lane's z. */
  frontZ: number;
  east: number;
  /** Where deliveries pull up to unload (x on the frontage road), if anywhere. */
  docks: number[];
  /** The turning circle at the frontage road's end: its centre's x and where the road begins to flare. */
  turn?: { x: number; throat: number };
}

export class Traffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private head = glowMat('yel2', 0);
  private tail = glowMat('#d8241a', 0);
  private beam = poolMat('#ffe9c0', 0.7);
  private h: H = () => 0;
  /** People on foot (the campus fills it each frame): a vehicle waits for anyone in its way. */
  walkers: { x: number; z: number }[] = [];
  private tmpP = new THREE.Vector2();
  private tmpD = new THREE.Vector2();

  constructor() {
    this.head.userData.nightOnly = 4;
    // (red, not bloomed out to pink)
    this.tail.userData.nightOnly = 1.5;
  }

  private add(n: ModelName, route: Route, s: number, v0: number, paint: number) {
    const { o, len, wheels } = vehicle(n, this.head, this.tail, this.beam, paint);
    this.group.add(o);
    const c: Car = { obj: o, len, route, s, v: v0 * 0.8, v0, held: -1, heldT: 0, served: new Set(), yieldT: 0, pushT: 0, pos: new THREE.Vector2(), dir: new THREE.Vector2(1, 0), wheels };
    sample(route, s, c.pos, c.dir);
    this.cars.push(c);
    return c;
  }

  /** Both carriageways of the highway along x at z, from x0 to x1 (cars wrap round out of sight). */
  highway(z: number, x0: number, x1: number, h: H, seed: number) {
    this.h = h;
    const r = rng(seed);
    const pool: ModelName[] = ['semitruck', 'semitruck', 'pickup', 'sedan', 'hatchback', 'suv', 'van', 'flatbed', 'mixer', 'semitruck', 'sedan', 'suv'];
    for (const lane of [-1, 1]) {
      // right-hand traffic: eastbound (+x) on the south side (+z)
      const zz = z + lane * 2;
      const a: [number, number] = lane > 0 ? [x0, zz] : [x1, zz], b: [number, number] = lane > 0 ? [x1, zz] : [x0, zz];
      const route: Route = { ...smoothRoute([a, b], [], false, 19), stops: [], wrap: true };
      const n = 10;
      for (let i = 0; i < n; i++) {
        const kind = pool[Math.floor(r() * pool.length)];
        const heavy = kind === 'semitruck' || kind === 'mixer' || kind === 'flatbed';
        this.add(kind, route, (i + r() * 0.6) * (route.total / n), (heavy ? 13.5 : 16.5) + (r() - 0.5) * 3, r());
      }
    }
  }

  /**
   * Deliveries: in along the highway's eastbound lane, a left turn across the westbound lane (yielding), up the
   * access road, right onto the frontage road, round the turning circle, back along the front to unload outside a
   * building, a stop at the junction, down to the highway's stop line, a gap, and away west. Out of sight, round again.
   */
  deliveries(net: RoadNet, kinds: ModelName[], h: H) {
    this.h = h;
    const { highwayZ: HZ, accessX: ax, frontZ: FZ, east } = net;
    const far = -1450;
    const C = { x: net.turn?.x ?? east + 0.5, z: FZ };
    // (round the island: 5 m out, so a truck's inner side clears its kerb and its nose stays inside the edge line)
    const R = net.turn ? 5 : 4, lead = net.turn ? net.turn.throat + 1 : east - 7;
    const loop: [number, number][] = [];
    // the circle at the dead end, from the south side round by the east to the north side
    for (let i = 0; i <= 12; i++) { const a = (112 - (224 * i) / 12) * Math.PI / 180; loop.push([C.x + Math.cos(a) * R, C.z + Math.sin(a) * R]); }
    const pts: [number, number][] = [
      [far, HZ + 2], [ax + 1.5, HZ + 2], [ax + 1.5, FZ + 1.5], [lead, FZ + 1.5], ...loop, [lead, FZ - 1.5], [ax - 1.5, FZ - 1.5], [ax - 1.5, HZ - 2], [far, HZ - 2],
    ];
    const radii = pts.map(() => 0);
    radii[1] = 7; radii[2] = 4.5; radii[3] = net.turn ? 4 : 2.5; radii[3 + loop.length + 1] = net.turn ? 4 : 2.5; radii[3 + loop.length + 2] = 4.5; radii[3 + loop.length + 3] = 4;
    const sm = smoothRoute(pts, radii, false, 15);
    const at = (x: number, z: number) => {
      let best = 0, bd = 1e9;
      sm.pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - z) ** 2; if (d < bd) { bd = d; best = i; } });
      return sm.dist[best];
    };
    // is the way clear: no other vehicle within r of (x, z) heading towards it
    const near = (x: number, z: number, r: number) => () => !this.cars.some((c) => {
      const dx = x - c.pos.x, dz = z - c.pos.y;
      if (Math.hypot(dx, dz) > r) return false;
      return c.v > 0.3 && (c.dir.x * dx + c.dir.y * dz) > -2;
    });
    const stops: Stop[] = [];
    // yield to westbound traffic before the left turn; unload at the docks; stop at the junction and the highway
    stops.push({ s: at(ax - 9, HZ + 2), wait: 0, clear: near(ax, HZ - 2, 38) });
    for (const x of net.docks.filter((d) => d > ax + 12 && d < east - 8).sort((a, b) => b - a).slice(0, 2)) stops.push({ s: at(x, FZ - 1.5), wait: 14 });
    stops.push({ s: at(ax + 3.9, FZ - 1.5), wait: 1.2, clear: near(ax, FZ, 9) });
    stops.push({ s: at(ax - 1.5, HZ - 5.9), wait: 1.5, clear: near(ax, HZ, 34) });
    stops.sort((a, b) => a.s - b.s);
    const route: Route = { ...sm, stops, wrap: true };
    kinds.forEach((k, i) => {
      const c = this.add(k, route, (i / kinds.length) * route.total * 0.9 + 30, k === 'van' ? 12 : 10.5, ((i * 0.37 + 0.11) % 1));
      // each one checks the way is clear of everyone but itself
      c.route = { ...route, stops: stops.map((st) => ({ ...st, clear: st.clear ? this.clearFor(c, st) : undefined })) };
    });
  }

  /** A stop's "is it clear" check that ignores the car asking. */
  private clearFor(self: Car, st: Stop) {
    const f = st.clear!;
    return () => {
      const was = this.cars.indexOf(self);
      if (was < 0) return f();
      this.cars.splice(was, 1);
      try { return f(); } finally { this.cars.splice(was, 0, self); }
    };
  }

  update(e: Env) {
    const dt = Math.min(0.1, e.dt);
    if (dt <= 0) return;
    for (const c of this.cars) {
      const r = c.route;
      // the speed the road ahead allows (bends coming up, braking at ~2.5 m/s²)
      let vAllowed = c.v0;
      const i0 = sample(r, c.s, this.tmpP, this.tmpD);
      for (let i = i0; i < r.pts.length && r.dist[i] - c.s < 40; i += 2) vAllowed = Math.min(vAllowed, Math.sqrt(r.vmax[i] ** 2 + 2 * 2.5 * Math.max(0, r.dist[i] - c.s)));
      // what's ahead: a car in our path, or a stop we haven't served
      let gap = 1e9, vLead = 0;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.y - c.pos.y;
        const ahead = dx * c.dir.x + dz * c.dir.y;
        if (ahead <= 0 || ahead > 45) continue;
        const lat = Math.abs(dx * c.dir.y - dz * c.dir.x);
        if (lat > 1.7) continue;
        const g = ahead - (o.len + c.len) / 2;
        if (g < gap) { gap = g; vLead = o.v * Math.max(0, o.dir.dot(c.dir)); }
      }
      // someone on foot in the way (on the campus roads; nobody walks the highway): stop short and let them cross
      let yielding = false;
      if (c.v0 < 13 && c.pushT <= 0) {
        for (const w of this.walkers) {
          const dx = w.x - c.pos.x, dz = w.z - c.pos.y;
          const ahead = dx * c.dir.x + dz * c.dir.y;
          if (ahead <= c.len / 2 - 0.3 || ahead > 26) continue;
          if (Math.abs(dx * c.dir.y - dz * c.dir.x) > 1.45) continue;
          const g = ahead - c.len / 2 - 1.2;
          if (g < gap) { gap = Math.max(0, g); vLead = 0; yielding = true; }
        }
      }
      // (a guard against a stand-off: someone who never moves out of the way is edged round after a long wait)
      if (yielding && c.v < 0.2) { c.yieldT += dt; if (c.yieldT > 25) { c.pushT = 6; c.yieldT = 0; } } else if (!yielding) c.yieldT = 0;
      if (c.pushT > 0) c.pushT -= dt;
      const s0 = 2.2;
      for (let k = 0; k < r.stops.length; k++) {
        const st = r.stops[k];
        if (c.served.has(k)) continue;
        if (st.s - c.s < -1 || st.s - c.s > 70) continue;
        // the gap from our front bumper to the line
        const front = st.s - (c.s + c.len / 2);
        // a give-way that's clear as we come up to it: no need to stop
        if (st.wait === 0 && c.held !== k && front < 25 && (!st.clear || st.clear())) { c.served.add(k); continue; }
        if (c.held === k || (front < s0 + 0.8 && c.v < 0.6)) {
          // at the line: hold, then go when it's clear
          c.held = k;
          c.heldT += dt;
          if (c.heldT >= st.wait && (!st.clear || st.clear())) { c.served.add(k); c.held = -1; c.heldT = 0; continue; }
          gap = 0; vLead = 0;
        } else if (front < gap) { gap = Math.max(0, front); vLead = 0; }
        break;
      }
      // intelligent-driver model
      const a = 1.6, b = 2.6, T = 1.3;
      const v0 = Math.max(0.5, vAllowed);
      const sStar = s0 + Math.max(0, c.v * T + (c.v * (c.v - vLead)) / (2 * Math.sqrt(a * b)));
      let acc = a * (1 - Math.pow(c.v / v0, 4) - (gap < 1e8 ? Math.pow(sStar / Math.max(0.1, gap), 2) : 0));
      if (c.held >= 0) { c.v = 0; acc = 0; }
      c.v = Math.max(0, c.v + Math.max(-9, acc) * dt);
      c.s += c.v * dt;
      if (c.wheels) c.wheels.spin.value = (c.wheels.spin.value + (c.v * dt) / c.wheels.r) % (Math.PI * 2);
      if (c.s >= r.total) {
        if (r.wrap) { c.s -= r.total; c.served.clear(); } else c.s = r.total;
      }
      sample(r, c.s, c.pos, c.dir);
      const p = c.obj.position;
      p.set(c.pos.x, 0, c.pos.y);
      const h = this.h;
      // on the road's surface (roads.ts lifts the ribbon 0.035 off the ground), not in it
      p.y = h(p.x, p.z) + 0.035;
      c.obj.rotation.y = Math.atan2(c.dir.x, c.dir.y);
      c.obj.rotation.x = -Math.atan((h(p.x + c.dir.x * 2, p.z + c.dir.y * 2) - h(p.x - c.dir.x * 2, p.z - c.dir.y * 2)) / 4);
    }
  }
}
