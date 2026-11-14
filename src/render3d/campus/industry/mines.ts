/**
 * Mines and gas works: lithium brine evaporation ponds (sunk into the salt flat, fresh brine pale
 * blue → concentrated yellow-green), the lithium carbonate plant beside them, the crusher and
 * conveyor next to an open pit, and an industrial gas works (helium from natural gas, or neon from
 * a steel mill's air separation) with Horton spheres, cold boxes, pipe racks and a flare.
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, mix, noise, poolMat, rng, withClouds, type Paint } from '../../kit';
import { Plume } from '../../fx';
import type { Env } from '../../pieces';
import type { SetPieceFactory } from '../registry';
import {
  airHandler, beacon, block, brandOf, curtain, Fans, G, lamps, Lit, P, parkVehicle, pipeRun, putSign, stack, tube, V, wallLights, wheel, MINE_YELLOW,
} from './common';
import { haulTruck, ROCKS, truckLights } from './pit';

// ── shared: conveyors with ore moving along them ─────────────────────────────────────────────
/** A belt conveyor on a truss from a to b (a covered gallery), with trestles; returns its lumps. */
class Conveyor {
  private lumps: THREE.InstancedMesh;
  private a: THREE.Vector3;
  private b: THREE.Vector3;
  private n: number;
  private m = new THREE.Matrix4();
  speed = 1.6;
  constructor(parent: THREE.Object3D, k: Kit, a: THREE.Vector3, b: THREE.Vector3, ore: Paint, o: { w?: number; trestle?: number; cover?: boolean; n?: number } = {}) {
    this.a = a; this.b = b;
    const w = o.w ?? 1.2;
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = Math.asin(dir.y);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
    const place = (geo: THREE.BufferGeometry, paint: Paint, ox: number, oy: number) => {
      geo.translate(ox, oy, len / 2);
      geo.applyQuaternion(q);
      geo.translate(a.x, a.y, a.z);
      k.geo(geo, paint, 0.03, 0);
    };
    // truss chords, the belt, a hood
    for (const sx of [-w / 2, w / 2]) {
      place(new THREE.BoxGeometry(0.12, 0.12, len), '#8a8490', sx, -0.5);
      place(new THREE.BoxGeometry(0.1, 0.1, len), '#8a8490', sx, 0.15);
    }
    for (let d = 0.6; d < len; d += 1.4) {
      for (const sx of [-w / 2, w / 2]) {
        const g = new THREE.BoxGeometry(0.07, 0.75, 0.07).rotateX(0.7);
        place(g, '#9d95a6', sx, -0.18);
        g.translate(0, 0, 0);
      }
      const gg = new THREE.BoxGeometry(w, 0.06, 0.06);
      place(gg.translate(0, 0, d - len / 2), '#9d95a6', 0, -0.5);
    }
    place(new THREE.BoxGeometry(w - 0.3, 0.08, len), '#433c52', 0, 0.05);
    if (o.cover !== false) {
      const sh = new THREE.CylinderGeometry(w * 0.55, w * 0.55, len, 10, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
      place(sh, '#c3bcc7', 0, 0.12);
    }
    // trestles down to the ground
    const step = o.trestle ?? 6;
    for (let d = step * 0.7; d < len - 1; d += step) {
      const p = a.clone().addScaledVector(dir, d);
      const h = p.y - 0.5;
      if (h < 1) continue;
      for (const sx of [-0.7, 0.7]) {
        const px = p.x + Math.cos(yaw) * sx, pz = p.z - Math.sin(yaw) * sx;
        k.box(0.2, h, 0.2, '#8a8490', px, 0, pz, { r: 0, jitter: 0 });
      }
      k.box(1.8, 0.2, 0.3, '#8a8490', p.x, h - 0.2, p.z, { r: 0, jitter: 0, ry: yaw + Math.PI / 2 });
    }
    this.n = o.n ?? Math.max(4, Math.floor(len / 1.1));
    const lg = new THREE.DodecahedronGeometry(0.22, 0).scale(1.2, 0.7, 1);
    this.lumps = new THREE.InstancedMesh(lg, withClouds(new THREE.MeshStandardMaterial({ color: col(ore), roughness: 0.95, flatShading: true })), this.n);
    this.lumps.castShadow = false;
    parent.add(this.lumps);
    this.update({ t: 0, dt: 0, night: 0 });
  }
  update(e: Env) {
    const len = this.a.distanceTo(this.b);
    const p = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const u = ((e.t * this.speed) / len + i / this.n) % 1;
      p.lerpVectors(this.a, this.b, u);
      p.y += 0.25;
      this.m.makeRotationY(i * 1.7);
      this.m.setPosition(p);
      this.lumps.setMatrixAt(i, this.m);
    }
    this.lumps.instanceMatrix.needsUpdate = true;
  }
}

/** A stockpile cone with a lumpy surface. */
function pile(k: Kit, x: number, z: number, r: number, h: number, paint: Paint, seed: number) {
  // a lathe profile: a slumped cone with a rounded top, lumpy all over
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const rad = r * (1 - t) * (1 + 0.08 * Math.sin(t * Math.PI));
    prof.push(new THREE.Vector2(Math.max(0.001, rad), h * (1 - Math.pow(1 - t, 1.15)) * (t > 0.85 ? 0.98 : 1)));
  }
  const g = new THREE.LatheGeometry(prof, 22);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    if (py < 0.05) continue;
    const a = Math.atan2(pz, px);
    const n = 1 + (noise(a * 3 + seed, py * 0.8, seed) - 0.5) * 0.22;
    pos.setXYZ(i, px * n, py + (noise(a * 5, py, seed + 2) - 0.5) * 0.25, pz * n);
  }
  g.computeVertexNormals();
  g.translate(x, -0.05, z);
  k.geo(g, paint, 0.08, 0.18);
}

// ── brinePonds: lithium evaporation ponds ────────────────────────────────────────────────────
const waterMat = () => withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 }));

const brinePonds: SetPieceFactory = (o) => {
  const g = new THREE.Group();
  const r = rng(o.seed);
  const k = new Kit(r);
  const wk = new Kit(rng(o.seed + 1));
  const W = 70, D = 40, outer = 2.4, inner = 1.4, COLS = 5, ROWS = 3;
  const x0 = -W / 2 + 1 + outer, x1 = W / 2 - 1 - outer, z0 = -D / 2 + 1 + outer, z1 = D / 2 - 1 - outer;
  const pw = (x1 - x0 - inner * (COLS - 1)) / COLS, pd = (z1 - z0 - inner * (ROWS - 1)) / ROWS;
  const salt: Paint = '#efe8dc', salt2: Paint = '#e2d7c4';
  const BY = -0.8;
  // berms: the outer bund and the walls between the ponds (salt-crusted)
  const bermH = 1.25;
  k.box(W - 2, bermH, outer, salt, 0, BY, -D / 2 + 1 + outer / 2, { r: 0.3, jitter: 0.03, shade: 0.2 });
  k.box(W - 2, bermH, outer, salt, 0, BY, D / 2 - 1 - outer / 2, { r: 0.3, jitter: 0.03, shade: 0.2 });
  k.box(outer, bermH, D - 2, salt, -W / 2 + 1 + outer / 2, BY, 0, { r: 0.3, jitter: 0.03, shade: 0.2 });
  k.box(outer, bermH, D - 2, salt, W / 2 - 1 - outer / 2, BY, 0, { r: 0.3, jitter: 0.03, shade: 0.2 });
  for (let c = 1; c < COLS; c++) k.box(inner, bermH - 0.15, z1 - z0, salt2, x0 + c * (pw + inner) - inner / 2, BY, 0, { r: 0.25, jitter: 0.04, shade: 0.2 });
  for (let rr = 1; rr < ROWS; rr++) k.box(x1 - x0, bermH - 0.2, inner, salt2, 0, BY, z0 + rr * (pd + inner) - inner / 2, { r: 0.25, jitter: 0.04, shade: 0.2 });
  // the ponds: concentrating from right (fresh, pale blue) to left (yellow-green)
  const stages: Paint[] = ['#c9cf6a', '#7fbf8a', '#2fa597', '#45b9c4', '#a3dbe4'];
  const harvest = { c: 1, r: 0 };
  for (let c = 0; c < COLS; c++)
    for (let rr = 0; rr < ROWS; rr++) {
      const cx = x0 + c * (pw + inner) + pw / 2, cz = z0 + rr * (pd + inner) + pd / 2;
      if (c === harvest.c && rr === harvest.r) {
        // a drained pond: salt crust being scraped up
        k.box(pw + 0.2, 0.5, pd + 0.2, '#f2ede4', cx, BY, cz, { r: 0.05, jitter: 0.02, shade: 0 });
        for (let i = 0; i < 6; i++) k.box(pw * 0.8, 0.08, 0.5, '#e4dccd', cx, BY + 0.5, cz - pd / 2 + 1.4 + i * 1.5, { r: 0.03, jitter: 0.04, shade: 0 });
        pile(k, cx - pw * 0.25, cz + 1, 2.2, 1.8, '#f6f2ea', o.seed + 3);
        continue;
      }
      const tone = mix(stages[c], stages[Math.min(COLS - 1, c + 1)], rr * 0.18);
      tone.multiplyScalar(0.96 + r() * 0.08);
      wk.box(pw + 0.25, 0.3, pd + 0.25, tone.clone().lerp(col('#f3f0e6'), 0.2), cx, BY + 0.2, cz, { r: 0, jitter: 0.015, shade: 0 });
      wk.box(pw - 2.2, 0.06, pd - 2.2, tone.clone().multiplyScalar(0.95), cx, BY + 0.47, cz, { r: 0.6, jitter: 0.015, shade: 0 });
      // a crust rim where the brine meets the wall
      k.box(pw + 0.3, 0.06, 0.35, '#f7f3ec', cx, BY + 0.5, cz - pd / 2 + 0.05, { r: 0, jitter: 0.02, shade: 0 });
      k.box(pw + 0.3, 0.06, 0.35, '#f7f3ec', cx, BY + 0.5, cz + pd / 2 - 0.05, { r: 0, jitter: 0.02, shade: 0 });
    }
  // a little loader at work in the drained pond
  const hx = x0 + harvest.c * (pw + inner) + pw / 2, hz = z0 + harvest.r * (pd + inner) + pd / 2;
  const ldr = new Kit(rng(o.seed + 5));
  ldr.box(1.8, 1.0, 3.2, MINE_YELLOW, 0, 0.6, 0, { r: 0.12 });
  ldr.box(1.3, 1.2, 1.2, MINE_YELLOW, 0, 1.6, -0.5, { r: 0.1 });
  ldr.box(1.1, 0.6, 0.06, '#34506b', 0, 2.1, 0.12, { r: 0, jitter: 0 });
  ldr.box(2.4, 0.9, 0.9, '#8a8490', 0, 0.3, 2.2, { r: 0.08 });
  for (const sx of [-1.0, 1.0]) for (const sz of [-1.0, 1.0]) wheel(ldr, sx, 0.6, sz, 0.6, 0.5);
  const loader = ldr.build();
  loader.position.set(hx + pw * 0.15, BY + 0.5, hz - 0.5);
  g.add(loader);
  // pump houses on the berms, pipes along them and siphons over the walls
  const pipeY = BY + bermH + 0.25;
  for (let c = 0; c < COLS; c++) {
    const x = x0 + c * (pw + inner) + pw / 2;
    k.box(2.0, 1.6, 1.7, '#e6dccb', x + pw / 2 - 1.2, BY + bermH - 0.05, z1 + outer / 2, { r: 0.1 });
    k.box(2.2, 0.16, 1.9, '#5a9fa0', x + pw / 2 - 1.2, BY + bermH + 1.55, z1 + outer / 2, { r: 0.04 });
  }
  tube(k, V(x0 - 0.5, pipeY + 0.1, z1 + outer / 2 + 0.6), V(x1 + 0.5, pipeY + 0.1, z1 + outer / 2 + 0.6), 0.16, '#9d95a6');
  for (let c = 1; c < COLS; c++) for (let rr = 0; rr < ROWS; rr++) {
    const x = x0 + c * (pw + inner) - inner / 2, z = z0 + rr * (pd + inner) + pd * 0.3;
    pipeRun(k, [V(x - 1.4, BY + 0.5, z), V(x - 1.0, BY + bermH + 0.4, z), V(x + 1.0, BY + bermH + 0.4, z), V(x + 1.4, BY + 0.5, z)], 0.1, '#c3bcc7');
  }
  // brine wells at the fresh end
  for (const z of [-10, 4]) {
    k.box(1.6, 1.3, 1.6, '#e6dccb', W / 2 - 2.2, BY + bermH - 0.05, z, { r: 0.08 });
    k.cyl(0.18, 0.18, 0.9, '#5b5562', W / 2 - 2.2, BY + bermH + 1.2, z, 8);
  }
  g.add(k.build());
  const water = wk.build(waterMat());
  water.castShadow = false;
  g.add(water);
  const pool = poolMat('#ffe2b0', 0.45);
  for (let c = 0; c < COLS; c++) lightPool(g, x0 + c * (pw + inner) + pw - 1.2, BY + bermH, z1 + outer / 2 + 1.5, 2.8, pool);
  return {
    obj: g, w: 70, d: 40, h: 3,
    ground(x, z) {
      if (Math.abs(x) > W / 2 - 1.9 || Math.abs(z) > D / 2 - 1.9) return null;
      return BY - 0.15;
    },
    update(e) {
      // the loader shuffles back and forth scraping salt
      const s = Math.sin(e.t * 0.35);
      loader.position.z = hz - 0.5 + s * pd * 0.28;
      loader.rotation.y = s > 0 ? 0 : Math.PI;
    },
  };
};

// ── saltPlant: the lithium carbonate plant ───────────────────────────────────────────────────
const saltPlant: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const fans = new Fans();
  const lit = new Lit('#ffe6b8', 1.0);
  const accent = b.accent;
  // the process hall, stepped, with the name on it
  block(k, -5.4, -3.2, 12, 9, 7.5, { wall: '#e6e0d8', band: accent, bandH: 0.45, ribs: 1.0, r: 0.22, faces: ['f', 'l'] });
  block(k, -7.4, -4.6, 6, 5.6, 4.0, { wall: '#d8d0c4', joints: 1.2, plinth: false, r: 0.2 }, 7.5);
  putSign(g, b.name, 7.5, -4.4, 5.8, -3.2 + 4.5 + 0.16, '#fbf7f0', null, 0, true, 1.0);
  k.box(8.6, 1.3, 0.1, accent, -4.4, 5.15, -3.2 + 4.5 + 0.03, { r: 0.04, shade: 0 });
  curtain(k, lit, -8.6, 0.7, -3.2 + 4.5, 4.4, 3.4, { bay: 1.1, floor: 1.7, seed: o.seed });
  k.box(3.4, 3.6, 0.15, '#9d95a6', -1.8, 0.45, -3.2 + 4.56, { r: 0.03 });
  for (let y = 0.8; y < 4; y += 0.32) k.box(3.3, 0.04, 0.06, '#7a7186', -1.8, y, -3.2 + 4.66, { r: 0, jitter: 0 });
  airHandler(k, fans, -7.4, 11.5, -4.6, 4.0, 2.0, 1.2, 2);
  // product silos with cone roofs
  for (let i = 0; i < 3; i++) {
    const x = 3.0 + i * 3.1, z = -6.4;
    k.cyl(1.35, 1.35, 8.4, '#ece6dc', x, 1.4, z, 18, { shade: 0.1 });
    k.geo(new THREE.ConeGeometry(1.4, 1.1, 18).translate(x, 1.4 + 8.4 + 0.55, z), '#d8d0c4', 0.02);
    k.geo(new THREE.ConeGeometry(1.35, 1.2, 18).rotateX(Math.PI).translate(x, 1.4 - 0.6 + 0.6, z), '#cfc7bb', 0.02);
    for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2 + 0.4; k.box(0.18, 1.6, 0.18, P.trim, x + Math.cos(a) * 1.15, 0, z + Math.sin(a) * 1.15, { r: 0, jitter: 0 }); }
    k.cyl(1.38, 1.38, 0.3, accent, x, 7.6, z, 18, { shade: 0 });
  }
  k.box(9.6, 0.25, 1.0, P.trim, 6.1, 10.9, -6.4, { r: 0.03 }); // walkway over the silos
  // reaction tanks with agitators, a rotary dryer and its stack
  for (let i = 0; i < 3; i++) {
    const x = 2.6 + i * 3.4, z = -1.2;
    k.cyl(1.4, 1.4, 3.0, '#d8d2d6', x, 0, z, 18, { shade: 0.12 });
    k.box(0.6, 0.7, 0.6, '#5b5562', x, 3.0, z, { r: 0.06 });
    k.cyl(0.18, 0.18, 0.6, '#7a7186', x, 3.6, z, 8);
  }
  k.box(11, 0.3, 0.9, P.trim, 6, 3.2, -1.2, { r: 0.03 });
  const dryer = new THREE.CylinderGeometry(0.85, 0.85, 6.2, 16, 1).rotateZ(Math.PI / 2 - 0.08).translate(6.4, 1.8, 2.6);
  k.geo(dryer, '#9d95a6', 0.03, 0);
  for (const x of [4.2, 8.6]) { k.box(0.5, 1.1 + (x - 4.2) * 0.02, 1.6, P.concrete, x, 0, 2.6, { r: 0.05 }); k.cyl(0.95, 0.95, 0.3, '#5b5562', x, 1.8 - 0.15, 2.6, 16, { rz: Math.PI / 2 }); }
  stack(k, 10.2, 0, 2.6, 0.38, 9.5, '#d8d2d6', accent);
  beacon(g, 10.2, 9.75, 2.6, 1.4);
  const plume = new Plume({ count: 14, life: 5, rise: 1.8, size0: 1.0, size1: 3.8, opacity: 0.35, radius: 0.35, wind: 0.6 }, o.seed);
  plume.obj.position.set(10.2, 9.6, 2.6);
  g.add(plume.obj);
  // the conveyor to the product stockpile at the front, and the pile
  pile(k, 8.4, 6.8, 3.0, 3.6, '#f6f2ea', o.seed + 2);
  const conv = new Conveyor(g, k, V(2.0, 1.0, 1.6), V(7.4, 4.0, 6.4), '#f6f2ea', { w: 0.9, trestle: 3.5 });
  // pipes in from the ponds (they're to the right, +x)
  pipeRun(k, [V(12.8, 1.6, -3.2), V(9.4, 1.6, -3.2), V(9.4, 2.4, -1.2), V(4.0, 2.4, -1.2)], 0.14, '#c3bcc7');
  for (const x of [11.2, 12.6]) k.box(0.2, 1.6, 0.2, P.trim, x, 0, -3.2, { r: 0, jitter: 0 });
  // a truck at the bagging door, lamps
  parkVehicle(g, 'semitruck', 10, -6.0, 6.8, 0);
  lamps(g, k, [[-12, 4.4], [1.6, 8.6]], [1, 0]);
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, [[-1.8, 4.3, -3.2 + 4.6]], 2.4, 3.2);
  return {
    obj: g, w: 26, d: 20, h: 12.6,
    update(e) { fans.update(e); plume.update(e); conv.update(e); },
  };
};

// ── crusher: the primary crusher and the conveyor to the stockpile ───────────────────────────
const crusher: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const rock = ROCKS[o.variant === 'copper' ? 'copper' : o.variant === 'lithium' ? 'lithium' : 'red'] ?? ROCKS.red;
  const ore: Paint = o.variant === 'copper' ? '#76786a' : o.variant === 'lithium' ? '#c4aca2' : rock.ore;
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const accent = b.accent;
  // the tipping platform on the right (towards the pit): a raised pad, a retaining wall, a ramp down to the front
  const PH = 3.2, px0 = 2.6, px1 = 12.6, pz0 = -9.2, pz1 = 2.0;
  k.box(px1 - px0, PH, pz1 - pz0, '#b7aea3', (px0 + px1) / 2, 0, (pz0 + pz1) / 2, { r: 0.2, shade: 0.2 });
  for (let x = px0 + 0.6; x < px1 - 0.3; x += 1.15) k.box(0.08, PH - 0.3, 0.12, '#9d95a6', x, 0.1, pz1 + 0.02, { r: 0, jitter: 0 });
  k.box(px1 - px0, 0.08, pz1 - pz0, mix(rock.road, '#b7aea3', 0.4), (px0 + px1) / 2, PH, (pz0 + pz1) / 2, { r: 0, jitter: 0.03, shade: 0 });
  const ramp = new THREE.Shape();
  ramp.moveTo(0, 0); ramp.lineTo(6.4, 0); ramp.lineTo(0, PH); ramp.lineTo(0, 0);
  const rg = new THREE.ExtrudeGeometry(ramp, { depth: 5.0, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 });
  rg.rotateY(-Math.PI / 2).translate(12.2, 0, pz1);
  k.geo(rg, '#b0a698', 0.03, 0.12);
  for (const x of [7.0, 12.4]) k.box(0.3, 0.5, 0.3, '#fbd46e', x, PH, pz1 - 0.3, { r: 0.04 });
  // the dump hopper (a dark mouth) against the crusher house
  const hx = px0 + 1.8, hz = -4.4;
  k.box(3.6, 0.3, 4.0, '#433c52', hx, PH - 0.22, hz, { r: 0.05 });
  for (const sz of [-1, 1]) k.box(3.8, 0.9, 0.35, '#8a8490', hx, PH, hz + sz * 2.15, { r: 0.05 });
  // the crusher house: concrete base, steel-clad top, a crane rail, the name
  const cx = -1.0, cz = -4.6;
  block(k, cx, cz, 6.4, 8, 13, { wall: '#d9d2c8', band: accent, bandH: 0.6, joints: 1.6, r: 0.22, louvre: [3.2, 4.4] });
  block(k, cx + 0.6, cz - 1.4, 4.2, 4.2, 2.4, { wall: '#cfc7bb', plinth: false, r: 0.18 }, 13);
  k.box(5.8, 0.5, 0.5, MINE_YELLOW, cx, 12.2, cz + 4.1, { r: 0.04 });
  k.box(6.0, 1.3, 0.1, accent, cx, 10.15, cz + 4.03, { r: 0.04, shade: 0 });
  putSign(g, b.name, 5.6, cx, 10.8, cz + 4.1, '#fbf7f0', null, 0, true, 1.0);
  // the stockpile and the long conveyor up to it, the reclaim conveyor out the back
  pile(k, -8.4, 3.2, 4.6, 7.0, ore, o.seed + 1);
  const conv = new Conveyor(g, k, V(cx - 1.4, 2.0, cz + 4.4), V(-8.0, 7.4, 2.9), ore, { w: 1.4, trestle: 4 });
  const conv2 = new Conveyor(g, k, V(-8.6, 0.6, -2.0), V(-12.4, 2.4, -8.6), ore, { w: 1.0, trestle: 3 });
  // a little control room on the platform
  k.box(3.0, 2.4, 2.4, '#ece6dc', 10.8, PH, -7.6, { r: 0.12 });
  k.box(3.2, 0.16, 2.6, accent, 10.8, PH + 2.4, -7.6, { r: 0.04, shade: 0 });
  k.box(2.0, 0.8, 0.06, '#34506b', 10.8, PH + 1.3, -6.38, { r: 0, jitter: 0 });
  const dust = new Plume({ count: 12, life: 3.5, rise: 1.2, spread: 1.4, size0: 1.6, size1: 4.8, color: mix(rock.berm, '#e6d4a4', 0.5), opacity: 0.32, radius: 1.4, wind: 0.5 }, o.seed + 4);
  dust.obj.position.set(hx, PH + 0.4, hz);
  g.add(dust.obj);
  // a haul truck that backs up to the hopper and tips
  const truck = haulTruck(rock, o.seed + 7, truckLights());
  truck.obj.scale.setScalar(0.84);
  truck.obj.rotation.y = Math.PI / 2;
  g.add(truck.obj);
  const tipX = hx + 1.8 + 2.7;
  lamps(g, k, [[12.6, -9.6], [-5.6, 9.2]], [-1, 0]);
  // floods on the crusher house over the conveyor's foot and the hopper
  wallLights(g, [[cx - 1.4, 5.6, cz + 4.0], [cx + 3.25, 6.4, cz - 0.2]], 2.6, 4.2);
  g.add(k.build());
  const pool = poolMat('#ffe2b0', 0.5);
  lightPool(g, 8, PH, -3.6, 5.4, pool);
  const lm = glowMat('yel1', 0);
  lm.userData.nightOnly = 1.2;
  const lw = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.04), lm);
  lw.position.set(10.8, PH + 1.3, -6.34);
  g.add(lw);
  return {
    obj: g, w: 26, d: 20, h: 15.6,
    update(e) {
      conv.update(e);
      conv2.update(e);
      // a 20 s cycle: back up, tip, lower, pull forward, wait for the next load
      const T = 20, t = (e.t % T) / T;
      const back = t < 0.18 ? smooth(t / 0.18) : t < 0.62 ? 1 : t < 0.78 ? 1 - smooth((t - 0.62) / 0.16) : 0;
      truck.obj.position.set(tipX + (1 - back) * 1.3, PH + 0.05, hz);
      const tip = t > 0.22 && t < 0.6 ? Math.sin(((t - 0.22) / 0.38) * Math.PI) * 0.85 : 0;
      truck.bed.rotation.x = -tip;
      truck.load.visible = t < 0.38 || t > 0.9;
      dust.strength = tip > 0.3 ? 1 : 0.15;
      dust.update(e);
    },
  };
};
const smooth = (t: number) => t * t * (3 - 2 * t);

// ── gasWorks: helium (blue) or neon (pink) ───────────────────────────────────────────────────
/** A Horton sphere: legs round the equator, a walkway ring, a stair up the side to a top platform. */
function sphereTank(k: Kit, x: number, z: number, r: number, accent: Paint, seed: number) {
  const cy = r + 2.4;
  k.geo(new THREE.SphereGeometry(r, 28, 18).translate(x, cy, z), '#f1ece4', 0.015);
  k.geo(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.55, 28, 1, true).translate(x, cy + r * 0.42, z), accent, 0.01);
  const legs = 8;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + seed;
    const lx = x + Math.cos(a) * r * 0.99, lz = z + Math.sin(a) * r * 0.99;
    k.cyl(0.24, 0.26, cy, '#cfc7bb', lx, 0, lz, 8);
    k.cyl(0.42, 0.45, 0.3, P.concrete, lx, 0, lz, 8, { shade: 0 });
    const b2 = (((i + 1) % legs) / legs) * Math.PI * 2 + seed;
    const nx = x + Math.cos(b2) * r * 0.99, nz = z + Math.sin(b2) * r * 0.99;
    k.beam(V(lx, 0.4, lz), V(nx, cy * 0.7, nz), 0.08, '#9d95a6');
    k.beam(V(nx, 0.4, nz), V(lx, cy * 0.7, lz), 0.08, '#9d95a6');
  }
  // the equator walkway
  k.geo(new THREE.TorusGeometry(r + 0.25, 0.1, 4, 36).rotateX(Math.PI / 2).translate(x, cy, z), '#9d95a6', 0);
  k.geo(new THREE.TorusGeometry(r + 0.4, 0.05, 4, 36).rotateX(Math.PI / 2).translate(x, cy + 0.9, z), '#9d95a6', 0);
  // a stair up the outside of the upper half, a platform on top
  const steps = 18;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = t * 1.32, lon = 0.9 + t * 1.25 + seed;
    const rr = r + 0.3;
    const p = V(x + Math.cos(lon) * Math.cos(lat) * rr, cy + Math.sin(lat) * rr, z + Math.sin(lon) * Math.cos(lat) * rr);
    if (prev) {
      k.beam(prev, p, 0.12, '#8a8490');
      k.beam(prev.clone().setY(prev.y + 0.8), p.clone().setY(p.y + 0.8), 0.05, '#c23a3f');
    }
    prev = p;
  }
  k.cyl(1.0, 1.0, 0.16, '#8a8490', x, cy + r - 0.05, z, 14, { shade: 0 });
  k.geo(new THREE.TorusGeometry(1.0, 0.05, 4, 16).rotateX(Math.PI / 2).translate(x, cy + r + 0.9, z), '#c23a3f', 0);
  return cy + r;
}

/** A cold box: a tall steel-clad box with distillation columns beside it and platforms. */
function coldBox(k: Kit, g: THREE.Object3D, x: number, z: number, h: number, accent: Paint, phase: number) {
  k.box(4.2, h, 4.2, '#c9c4cc', x, 0, z, { r: 0.2, jitter: 0.02, shade: 0.15 });
  for (let y = 2.4; y < h; y += 2.4) k.box(4.26, 0.08, 4.26, '#aaa4b0', x, y, z, { r: 0, jitter: 0 });
  k.box(4.28, 0.5, 4.28, accent, x, h - 1.6, z, { r: 0.04, shade: 0 });
  for (const [dx, dz, cr, ch] of [[3.4, 0.6, 0.85, h + 2.5], [3.2, -1.9, 0.6, h - 3]] as [number, number, number, number][]) {
    k.cyl(cr, cr, ch, '#e6e0e3', x + dx, 0, z + dz, 14, { shade: 0.08 });
    k.geo(new THREE.SphereGeometry(cr, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x + dx, ch, z + dz), '#e6e0e3', 0);
    for (let y = 4; y < ch - 1; y += 4) k.cyl(cr + 0.55, cr + 0.55, 0.12, '#8a8490', x + dx, y, z + dz, 14, { shade: 0 });
    k.box(0.4, ch, 0.08, '#8a8490', x + dx + cr + 0.15, 0, z + dz, { r: 0, jitter: 0 });
  }
  beacon(g, x + 3.4, h + 2.9, z + 0.6, phase);
}

/** A pipe rack along x: portal frames carrying pipes on two levels. */
function pipeRack(k: Kit, x0: number, x1: number, z: number, accent: Paint) {
  for (let x = x0; x <= x1 + 0.01; x += 4) {
    for (const sz of [-1.6, 1.6]) k.box(0.3, 6.2, 0.3, '#8a8490', x, 0, z + sz, { r: 0.02, jitter: 0 });
    for (const y of [3.8, 5.9]) k.box(0.3, 0.3, 3.8, '#8a8490', x, y, z, { r: 0.02, jitter: 0 });
  }
  const pipes: [number, number, number, Paint][] = [[4.3, -1.0, 0.3, '#e6e0e3'], [4.3, -0.2, 0.22, '#9d95a6'], [4.3, 0.6, 0.26, accent], [4.3, 1.3, 0.18, '#c3bcc7'], [6.4, -0.8, 0.35, '#f1ece4'], [6.4, 0.4, 0.24, '#8a8490']];
  for (const [y, dz, r, c] of pipes) tube(k, V(x0 - 1, y, z + dz), V(x1 + 1, y, z + dz), r, c, 10);
}

const gasWorks: SetPieceFactory = (o) => {
  const neon = o.variant === 'neon';
  const b = brandOf(o);
  const accent: Paint = neon ? '#e86aa0' : '#4a7cb6';
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const fans = new Fans();
  const lit = new Lit('#ffe6b8', 1.1);
  // storage spheres at the back (helium: three; neon: two, the steel mill behind them)
  if (neon) {
    sphereTank(k, -18, -9.5, 4.2, accent, 0.3);
    sphereTank(k, -8, -10.5, 3.6, accent, 1.1);
    // the steel mill's sheds and a blast furnace beyond the fence
    block(k, 14, -14, 20, 7, 9, { wall: '#9d95a6', roof: '#6f6878', ribs: 1.2, faces: ['f'], r: 0.2 });
    k.cyl(2.6, 3.0, 15, '#7a7186', 6.5, 0, -14.5, 16, { shade: 0.2 });
    k.cyl(1.8, 2.6, 2.4, '#5b5562', 6.5, 15, -14.5, 16);
    pipeRun(k, [V(6.5, 17, -14.5), V(6.5, 19, -14.5), V(2.5, 19, -14.5), V(2.5, 6, -14.5)], 0.7, '#8a8490');
    stack(k, 22, 9, -15, 0.8, 9, '#9d95a6', '#c23a3f');
    beacon(g, 22, 18.3, -15, 0.8);
  } else {
    sphereTank(k, -19, -9.5, 4.6, accent, 0.3);
    sphereTank(k, -7.5, -10.5, 4.2, accent, 1.1);
    sphereTank(k, 3.0, -11.5, 3.6, accent, 2.0);
  }
  // cold boxes and columns
  coldBox(k, g, neon ? -0.5 : 11.5, -8.5, neon ? 17 : 19, accent, 1.7);
  if (neon) coldBox(k, g, 6.0, -5.5, 13, accent, 0.2);
  // the pipe rack across the site
  pipeRack(k, -22, 22, -1.2, accent);
  // compressor house and its coolers
  block(k, 14.5, 7.5, 13, 6, 5.2, { wall: '#ddd6cc', band: accent, bandH: 0.4, ribs: 1.0, r: 0.2, faces: ['f', 'l'] });
  for (let i = 0; i < 4; i++) k.cyl(0.4, 0.4, 1.2, '#c3bcc7', 10 + i * 3, 5.2, 7.5, 10);
  for (let i = 0; i < 3; i++) {
    const x = 9.5 + i * 4.6;
    k.box(3.8, 2.0, 2.4, P.plant, x, 0, 12.6, { r: 0.12 });
    fans.add(x - 0.9, 2.15, 12.6, 0.7);
    fans.add(x + 0.9, 2.15, 12.6, 0.7);
  }
  // the control building with the name
  const cbx = -15, cbz = 9.5;
  block(k, cbx, cbz, 10, 6, 5.6, { wall: '#ece6dc', r: 0.2 });
  k.box(10.08, 1.3, 6.08, accent, cbx, 3.75, cbz, { r: 0.05, shade: 0 });
  curtain(k, lit, cbx - 1.2, 0.8, cbz + 3, 6.8, 2.7, { bay: 1.2, floor: 2.7, seed: o.seed });
  putSign(g, b.name, 7.4, cbx, 4.4, cbz + 3.1, '#fbf7f0', null, 0, true, 1.0);
  k.box(1.4, 2.4, 0.1, '#2f3f4a', cbx + 3.6, 0.45, cbz + 3.02, { r: 0, jitter: 0 });
  k.box(2.6, 0.3, 1.8, accent, cbx + 3.6, 3.0, cbz + 3.8, { r: 0.06, shade: 0 });
  // product: tube trailers waiting at the front
  for (let t = 0; t < 2; t++) {
    const tx = -2 + t * 8.6, tz = 13.2;
    k.box(6.8, 0.25, 1.6, '#5b5562', tx, 0.9, tz, { r: 0.04 });
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) k.geo(new THREE.CapsuleGeometry(0.27, 5.8, 4, 10).rotateZ(Math.PI / 2).translate(tx, 1.45 + i * 0.56, tz - 0.56 + j * 0.56), j === 1 && i === 1 ? accent : '#d8d2d6', 0.03, 0);
    for (const sx of [1.6, 2.6]) for (const sz of [-0.75, 0.75]) wheel(k, tx + sx, 0.45, tz + sz, 0.45, 0.35);
    k.box(0.18, 0.9, 0.18, P.trim, tx - 2.6, 0, tz, { r: 0, jitter: 0 });
  }
  // the flare stack with its flame (helium) or a vent stack (neon)
  const fx = 21.5, fz = -14;
  let flame: THREE.Mesh | null = null;
  if (!neon) {
    k.cyl(0.4, 0.55, 21, '#c3bcc7', fx, 0, fz, 10, { shade: 0.1 });
    k.cyl(0.6, 0.6, 0.6, '#5b5562', fx, 21, fz, 10);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 2.4; k.beam(V(fx, 14, fz), V(fx + Math.cos(a) * 3.2, 0, fz + Math.sin(a) * 3.2), 0.04, '#5b5562'); }
    beacon(g, fx + 0.7, 20.5, fz, 2.2);
    const fm = new THREE.MeshBasicMaterial({ color: col('#f7b258'), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    flame = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8).translate(0, 0.7, 0).scale(1, 2.2, 1), fm);
    flame.position.set(fx, 21.6, fz);
    g.add(flame);
  }
  // work lights dotted over the plant (a gas works at night is a Christmas tree)
  const dots = new Kit();
  const dot = (x: number, y: number, z: number) => dots.box(0.22, 0.22, 0.22, '#ffffff', x, y, z, { r: 0, jitter: 0, shade: 0 });
  for (let x = -22; x <= 22; x += 8) { dot(x, 6.3, -2.9); dot(x + 4, 4.0, 0.5); }
  const cbX = neon ? -0.5 : 11.5;
  for (let y = 4; y < (neon ? 17 : 19); y += 4) { dot(cbX + 3.4 + 1.4, y + 0.3, -8.5 + 0.6); dot(cbX - 2.2, y, -8.5 + 2.2); }
  for (const [sx, sz, sr] of (neon ? [[-18, -9.5, 4.2], [-8, -10.5, 3.6]] : [[-19, -9.5, 4.6], [-7.5, -10.5, 4.2], [3.0, -11.5, 3.6]]) as [number, number, number][])
    for (let a = 0; a < 4; a++) dot(sx + Math.cos(a * 1.57 + 0.8) * (sr + 0.45), sr + 2.4 + 0.3, sz + Math.sin(a * 1.57 + 0.8) * (sr + 0.45));
  const dotMat = glowMat('#ffe9b8', 0);
  dotMat.userData.nightOnly = 4;
  const dm = dots.build(dotMat);
  dm.castShadow = false;
  g.add(dm);
  // lamps and a gate
  lamps(g, k, [[-22, 4.2], [-4, 4.2], [8, 4.2], [-22, -14]], [1, 0], 6);
  k.box(48, 0.07, 3.6, '#c8bfb2', 0, G, 16.2, { r: 0.03, shade: 0, jitter: 0.02 });
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, [[cbx + 3.6, 3.4, cbz + 3.05], [14.5, 4.5, 10.55]], 2.4, 3.4);
  return {
    obj: g, w: 50, d: 36, h: neon ? 20 : 24,
    update(e) {
      fans.update(e);
      if (flame) {
        const f = 0.85 + Math.sin(e.t * 13) * 0.08 + Math.sin(e.t * 7.3) * 0.1;
        flame.scale.set(1 + Math.sin(e.t * 9) * 0.08, f, 1);
        flame.rotation.z = Math.sin(e.t * 1.3) * 0.15;
      }
    },
  };
};

export const MINE_PIECES = { brinePonds, saltPlant, crusher, gasWorks };
