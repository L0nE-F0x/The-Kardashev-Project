/**
 * The Moon's mine (stage 2): the regolith cut (a terraced pit with a haul ramp, spoil heaps, a
 * bucket-wheel excavator working the face, haulers on the ramp, a conveyor up to the sintering
 * plant and a stacker onto the spoil), the helium-3 plant (a hopper, a slowly turning rotary kiln
 * glowing through its seams, cold columns, tall radiator wings, the control module, and a
 * harvester crawling the plain with its belly glowing as it bakes the regolith) and the tank farm
 * (frosty spheres of helium-3, water and oxygen, a loading arm, a tanker rover).
 */
import * as THREE from 'three';
import { fbm, Kit, paintMat, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  airlock, astro, beacon, boulder, Ctx, Dust, floodMast, habModule, hcyl, lightPool, M, mixHex, pipeRun, pressRover, radiator, roverTracks, TAU, V, LiteKit, } from './common';
import { halo, placard, plasmaMat, tintPool } from '../fusion/common';

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A bucket-wheel excavator (wheel on a boom towards −z), its wheel a separate group to spin. */
function excavator(acc: string, seed: number) {
  const g = new THREE.Group();
  const k = new LiteKit(rng(seed));
  for (const s of [-1, 1]) k.box(1.2, 1.0, 5.2, M.dark, s * 1.5, 0, 0, { r: 0.3 });
  k.box(3.6, 0.6, 3.6, M.steelD, 0, 0.9, 0, { r: 0.08 });
  k.box(3.4, 2.4, 3.0, acc, 0, 1.5, 0.4, { r: 0.18 });
  k.box(3.5, 0.08, 3.1, M.panel, 0, 3.92, 0.4, { r: 0, shade: 0 });
  k.box(1.2, 1.0, 1.0, M.white, 1.0, 2.3, 1.7, { r: 0.08 });
  k.box(1.22, 0.5, 1.02, M.glass, 1.0, 2.6, 1.72, { r: 0.04, shade: 0 });
  // the boom out to the wheel, a counterweight arm behind
  k.beam(V(0, 2.8, -1.0), V(0, 3.6, -6.0), 0.8, acc);
  k.beam(V(0, 2.8, 1.8), V(0, 3.4, 5.2), 0.6, mixHex(acc, '#2f2a3d', 0.3));
  k.box(1.8, 1.4, 1.4, M.steelD, 0, 2.7, 5.2, { r: 0.1 });
  k.beam(V(0, 5.6, 0.4), V(0, 3.8, -6.0), 0.08, M.dark);
  k.beam(V(0, 5.6, 0.4), V(0, 3.4, 5.2), 0.08, M.dark);
  k.box(0.4, 1.8, 0.4, M.steel, 0, 3.9, 0.4, { r: 0.02 });
  g.add(k.build());
  const wheel = new THREE.Group();
  wheel.position.set(0, 3.6, -6.6);
  const wk = new LiteKit(rng(seed + 1));
  wk.geo(new THREE.TorusGeometry(2.0, 0.18, 6, 28).rotateY(Math.PI / 2), M.steel, 0.02, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    wk.box(0.9, 0.7, 0.8, M.steelD, 0, Math.cos(a) * 2.1 - 0.35, Math.sin(a) * 2.1, { r: 0.06 });
    wk.beam(V(0, 0, 0), V(0, Math.cos(a) * 2.0, Math.sin(a) * 2.0), 0.12, M.steel);
  }
  wk.cyl(0.4, 0.4, 1.0, M.dark, -0.5, 0, 0, 10, { rz: Math.PI / 2 });
  wheel.add(wk.build());
  g.add(wheel);
  return { obj: g, wheel };
}
/** A haul truck (3.6 long, nose +x) with a bed of regolith. */
function hauler(acc: string, seed: number) {
  const k = new LiteKit(rng(seed));
  for (const wx of [-1.1, 0, 1.1]) for (const s of [-1, 1]) k.cyl(0.42, 0.42, 0.34, M.dark, wx, 0.42, s * 0.9 - (s > 0 ? 0 : 0.34), 10, { rx: Math.PI / 2, shade: 0 });
  k.box(3.6, 0.4, 1.6, M.steelD, 0, 0.6, 0, { r: 0.06 });
  k.box(1.0, 1.1, 1.5, acc, 1.3, 1.0, 0, { r: 0.12 });
  k.box(0.6, 0.4, 1.3, M.glass, 1.6, 1.5, 0, { r: 0.04, shade: 0 });
  k.box(2.4, 0.9, 1.7, M.white2, -0.5, 1.0, 0, { r: 0.08 });
  k.box(2.2, 0.4, 1.5, M.reg2, -0.5, 1.7, 0, { r: 0.2, jitter: 0.08 });
  k.box(1.0, 0.05, 1.4, M.panel, 1.3, 2.12, 0, { r: 0, shade: 0 });
  const m = k.build();
  return m;
}
/** An inclined conveyor on trestles from a to b (belt into k); returns a sampler for riders. */
function conveyor(k: Kit, a: THREE.Vector3, b: THREE.Vector3, w = 1.0, ground: (x: number, z: number) => number) {
  const d = b.clone().sub(a), len = d.length();
  const yaw = Math.atan2(d.x, d.z), pitch = Math.asin(d.y / len);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
  const seg = (g: THREE.BufferGeometry, p: string) => k.geo(g.applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), p, 0.03, 0);
  seg(new THREE.BoxGeometry(w + 0.3, 0.3, len), M.steelD);
  seg(new THREE.BoxGeometry(w, 0.08, len).translate(0, 0.19, 0), '#433c52');
  for (const s of [-1, 1]) seg(new THREE.BoxGeometry(0.08, 0.5, len).translate(s * (w / 2 + 0.15), 0.3, 0), M.steel);
  // a cover over the belt (dust)
  seg(new THREE.CylinderGeometry(w * 0.62, w * 0.62, len, 10, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 0.25, 0), M.white2);
  const n = Math.max(2, Math.round(len / 4));
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    const gy = ground(p.x, p.z);
    if (p.y - gy < 0.4) continue;
    for (const s of [-1, 1]) {
      const ox = Math.cos(yaw) * s * (w / 2 + 0.1), oz = -Math.sin(yaw) * s * (w / 2 + 0.1);
      k.box(0.16, p.y - gy - 0.15, 0.16, M.steel, p.x + ox, gy, p.z + oz, { r: 0, jitter: 0 });
    }
  }
  return (t: number) => a.clone().lerp(b, t).add(V(0, 0.45, 0));
}
/** Lumps riding a conveyor (instanced), moved by `update`. */
function riders(g: THREE.Group, at: (t: number) => THREE.Vector3, n: number, paint: string, seed: number, speed = 0.08) {
  const k = new LiteKit(rng(seed));
  k.box(0.5, 0.32, 0.5, paint, 0, -0.16, 0, { r: 0.12, jitter: 0.1 });
  const im = new THREE.InstancedMesh(k.build().geometry, paintMat, n);
  im.castShadow = true;
  g.add(im);
  const m = new THREE.Matrix4();
  return (t: number, run = true) => {
    for (let i = 0; i < n; i++) {
      const u = (((run ? t * speed : 0) + i / n) % 1 + 1) % 1;
      m.makeRotationY(i * 1.3).setPosition(at(u));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  };
}

// ── the regolith mine ────────────────────────────────────────────────────────────────────────
export function regolithMine(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const hw = W / 2, hd = D / 2;
  const px = -5, pz = -2.5, prx = 12.5, prz = 9.0, FLOOR = -3.6;
  const heaps = [{ x: 13.0, z: -8.2, r: 5.6, h: 4.4 }, { x: 15.0, z: 7.6, r: 4.4, h: 3.2 }];
  const ramp = { a: V(7.5, 0, 5.8), b: V(-1.0, FLOOR, 0.6), w: 3.2 };
  const pitY = (x: number, z: number) => {
    const rho = Math.hypot((x - px) / prx, (z - pz) / prz);
    if (rho >= 1) return 0;
    if (rho < 0.4) return FLOOR;
    // two broad benches stepping up to the rim
    const t = (rho - 0.4) / 0.6;
    const steps = 2, s = t * steps, i = Math.floor(s), f = s - i;
    const riser = sm(0.0, 0.62, f);
    return FLOOR + (-FLOOR) * ((i + riser) / steps);
  };
  const ground = (x: number, z: number) => {
    if (Math.abs(x) > hw || Math.abs(z) > hd) return null;
    let y = pitY(x, z);
    // the haul ramp: a straight lane graded down into the pit
    const ab = ramp.b.clone().sub(ramp.a), l2 = ab.x * ab.x + ab.z * ab.z;
    const t = Math.min(1, Math.max(0, ((x - ramp.a.x) * ab.x + (z - ramp.a.z) * ab.z) / l2));
    const dl = Math.hypot(x - (ramp.a.x + ab.x * t), z - (ramp.a.z + ab.z * t));
    if (dl < ramp.w) {
      const ry = ramp.a.y + (ramp.b.y - ramp.a.y) * t;
      const k2 = sm(ramp.w, ramp.w * 0.6, dl);
      y = y * (1 - k2) + Math.min(0, ry) * k2;
    }
    for (const hp of heaps) {
      const d = Math.hypot(x - hp.x, z - hp.z) / hp.r;
      if (d < 1) y = Math.max(y, hp.h * Math.min(1, Math.pow(1 - d * d, 1.3) * 1.15));
    }
    const edge = Math.min(1, (hw - Math.abs(x)) / 1.5, (hd - Math.abs(z)) / 1.5);
    return (y + (fbm(x * 0.25, z * 0.25, 51, 2) - 0.5) * 0.3) * Math.max(0, edge);
  };
  const h = (x: number, z: number) => ground(x, z) ?? 0;
  // the excavator on the pit floor, working the back face; it traverses as it digs
  const ex = excavator(L.acc, o.seed + 3);
  g.add(ex.obj);
  // haulers on the loop up the ramp to the hopper
  const hopper = V(8.6, 0, 4.0);
  k.geo(new THREE.CylinderGeometry(1.6, 0.5, 1.8, 4).rotateY(Math.PI / 4).translate(hopper.x, 2.6, hopper.z), M.steel, 0.03, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.18, 2.0, 0.18, M.steelD, hopper.x + sx * 0.9, 0, hopper.z + sz * 0.9, { r: 0 });
  const path = [V(-3.0, 0, -1.4), ramp.b.clone(), ramp.a.clone(), V(hopper.x - 1.0, 0, hopper.z + 2.2), V(hopper.x - 3.2, 0, hopper.z + 3.2), V(4.0, 0, 6.6), ramp.a.clone().add(V(-0.8, 0, -1.6)), ramp.b.clone().add(V(-0.6, 0, -1.4)), V(-3.0, 0, -1.4)];
  const segL = path.slice(1).map((p, i) => p.distanceTo(path[i]));
  const total = segL.reduce((a, b) => a + b, 0);
  const trucks = [0, 0.5].map((ph, i) => {
    const m = hauler(L.acc, o.seed + 10 + i);
    g.add(m);
    return { m, ph };
  });
  const at = (u: number) => {
    let d = ((u % 1) + 1) % 1 * total;
    for (let i = 0; i < segL.length; i++) {
      if (d <= segL[i]) {
        const p = path[i].clone().lerp(path[i + 1], d / segL[i]);
        return { p: p.setY(h(p.x, p.z)), dir: path[i + 1].clone().sub(path[i]) };
      }
      d -= segL[i];
    }
    return { p: path[0].clone(), dir: V(1, 0, 0) };
  };
  roverTracks(k, path.map((p) => [p.x, p.z] as [number, number]).slice(2, 7), 1.8);
  // the conveyor from the hopper to the sintering plant, a stacker onto the spoil heap
  const sx = 15.8, sz = -0.6;
  const belt = conveyor(k, V(hopper.x + 0.8, 1.6, hopper.z - 0.6), V(sx - 2.8, 4.6, sz + 0.6), 1.0, h);
  const stack = conveyor(k, V(sx - 1.0, 3.6, sz - 2.4), V(heaps[0].x + 0.6, heaps[0].h + 1.6, heaps[0].z + 1.4), 0.8, h);
  const ore = riders(g, belt, 9, M.reg2, o.seed + 20, 0.07);
  const spoil = riders(g, stack, 6, M.reg3, o.seed + 21, 0.09);
  // the sintering plant: printed walls, a glowing kiln slot, radiators, sintered bricks
  const gy = h(sx, sz) - 0.2;
  k.box(6.0, 4.4, 5.0, M.printed, sx, gy, sz, { r: 0.18, shade: 0.12 });
  for (let y = 0.5; y < 4.4; y += 0.45) k.box(6.04, 0.05, 5.04, M.printed2, sx, gy + y, sz, { r: 0, jitter: 0, shade: 0 });
  k.box(6.1, 0.4, 5.1, L.acc, sx, gy + 4.0, sz, { r: 0.03, shade: 0 });
  k.box(2.6, 1.2, 2.4, M.white, sx + 0.6, gy + 4.4, sz - 0.6, { r: 0.1 });
  const slot = plasmaMat('#f7b258', 1.8);
  const sk = new LiteKit(rng(o.seed + 6));
  sk.box(3.6, 0.5, 0.1, '#ffffff', sx - 0.6, gy + 1.4, sz + 2.52, { r: 0, jitter: 0, shade: 0 });
  g.add(sk.build(slot));
  const sh = halo([V(sx - 0.6, gy + 1.65, sz + 2.8)], [5], '#f7b258', 0.5);
  g.add(sh.obj);
  lightPool(g, sx - 0.6, gy + 0.2, sz + 4.2, 4, tintPool('#f7b258', 0.45));
  radiator(k, sx + 1.4, sz - 4.2, 4, 1.6, 2.6, Math.PI / 2, h(sx + 1.4, sz - 4.2) - 0.1);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) k.box(1.0, 0.5, 0.6, '#5b5562', sx - 4.4 + i * 1.1, gy + j * 0.52, sz + 3.6, { r: 0.06 });
  // the rim: marker posts with lights, floodlights, boulders
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const x = px + Math.sin(a) * prx * 1.04, z = pz + Math.cos(a) * prz * 1.04;
    if (Math.abs(x) > hw - 1 || Math.abs(z) > hd - 1) continue;
    k.box(0.12, 1.4, 0.12, '#d9d6d2', x, h(x, z) - 0.1, z, { r: 0, jitter: 0 });
    beacon(g, x, h(x, z) + 1.45, z, i * 0.4);
  }
  floodMast(c, -18.0, 9.6, 7, Math.PI * 0.85, 7, h(-18, 9.6) - 0.1, 9);
  floodMast(c, 4.0, -13.6, 7, Math.PI * 0.1, 7, h(4, -13.6) - 0.1, 9);
  const rr = rng(o.seed + 8);
  for (let i = 0; i < 7; i++) {
    const x = -hw + 2 + rr() * (W - 4), z = hd - 2 - rr() * 3;
    boulder(k, x, z, 0.3 + rr() * 0.5, o.seed + 30 + i);
  }
  astro(g, 6.4, 8.8, -0.6, o.seed + 1, h(6.4, 8.8));
  const dust = new Dust(160, '#cfc8d2', 0.8);
  g.add(dust.obj);
  const rand = rng(o.seed + 9);
  let acc = 0;
  c.anim.extra.push((e) => {
    // the excavator: back and forth along the face, its wheel turning
    const s = Math.sin(e.t * 0.05) * 0.5 + 0.5;
    const exX = px - 3.4 + s * 6.4, exZ = pz + 0.6;
    ex.obj.position.set(exX, FLOOR, exZ);
    ex.wheel.rotation.x -= e.dt * 1.2;
    acc += e.dt * 14;
    const n = Math.floor(acc);
    acc -= n;
    if (n) dust.emit(exX, FLOOR + 1.6, exZ - 6.8, n, 1.6, 2.0, rand, Math.PI, 1.6, 1.8);
    for (const tr of trucks) {
      const a = at(e.t * 0.012 + tr.ph);
      tr.m.position.copy(a.p);
      tr.m.rotation.y = Math.atan2(-a.dir.z, a.dir.x);
    }
    ore(e.t);
    spoil(e.t);
    if (Math.floor(e.t * 3) % 2 === 0) dust.emit(heaps[0].x + 0.6, heaps[0].h + 1.4, heaps[0].z + 1.4, 1, 1.0, 0.6, rand, 0, TAU, 1.4);
    const f = 1 + Math.sin(e.t * 4.1) * 0.06;
    slot.emissiveIntensity = 1.8 * f;
    sh.set(0.45 * f);
    dust.update(e);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: 10, update: c.update, ground };
}

// ── the helium-3 plant ───────────────────────────────────────────────────────────────────────
export function he3Plant(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const hw = W / 2;
  // the hopper fed by a conveyor from the mine
  const hx = -11.0, hz = -4.2;
  k.geo(new THREE.CylinderGeometry(2.1, 0.6, 2.4, 4).rotateY(Math.PI / 4).translate(hx, 5.2, hz), M.steel, 0.03, 0);
  k.box(3.2, 0.2, 3.2, M.steelD, hx, 6.4, hz, { r: 0.02 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.22, 4.0, 0.22, M.steelD, hx + sx * 1.1, 0, hz + sz * 1.1, { r: 0 });
  k.beam(V(-hw + 0.4, 1.2, hz - 2.8), V(hx - 1.2, 6.6, hz - 0.4), 0.8, M.white2);
  for (const t of [0.3, 0.65]) k.box(0.16, 1.2 + t * 5.4, 0.16, M.steel, -hw + 0.4 + t * (hx - 1.2 + hw - 0.4), 0, hz - 2.8 + t * 2.4, { r: 0 });
  // the rotary kiln: a drum sloping down to the right, turning, glowing through its seams
  const k0 = V(-8.6, 4.6, hz), k1 = V(4.4, 2.9, hz);
  const len = k0.distanceTo(k1), mid = k0.clone().lerp(k1, 0.5);
  const slope = Math.atan2(k1.y - k0.y, k1.x - k0.x);
  const drumG = new THREE.Group();
  drumG.position.copy(mid);
  drumG.rotation.z = slope;
  const drum = new THREE.Group();
  drumG.add(drum);
  const dk = new LiteKit(rng(o.seed + 5));
  hcyl(dk, 1.3, len, '#8f8a90', 0, 0, 0, 'x', 20, 0);
  for (let i = 0; i < 8; i++) dk.box(len - 0.6, 0.08, 0.2, '#6f6878', 0, Math.cos((i / 8) * TAU) * 1.31 - 0.04, Math.sin((i / 8) * TAU) * 1.31, { r: 0, jitter: 0, shade: 0 });
  for (const x of [-len * 0.3, len * 0.3]) dk.geo(new THREE.TorusGeometry(1.42, 0.16, 6, 28).rotateY(Math.PI / 2).translate(x, 0, 0), M.steelD, 0, 0);
  drum.add(dk.build());
  const seam = plasmaMat('#f7b258', 1.6);
  const sk = new LiteKit(rng(o.seed + 6));
  for (let x = -len / 2 + 1.6; x < len / 2 - 1; x += 1.4) sk.geo(new THREE.CylinderGeometry(1.32, 1.32, 0.12, 24, 1, true).rotateZ(Math.PI / 2).translate(x, 0, 0), '#ffffff', 0, 0);
  drum.add(sk.build(seam));
  g.add(drumG);
  // roller stations and the heater housing
  for (const t of [0.2, 0.8]) {
    const p = k0.clone().lerp(k1, t);
    k.box(2.6, p.y - 1.4, 2.4, M.printed, p.x, 0, p.z, { r: 0.12 });
    for (const s of [-1, 1]) k.cyl(0.4, 0.4, 0.6, M.steelD, p.x, p.y - 1.55, p.z + s * 0.9, 10, { rx: Math.PI / 2 });
  }
  const hp = k0.clone().lerp(k1, 0.5);
  k.box(4.4, 1.2, 3.4, M.white2, hp.x, hp.y + 1.0, hp.z, { r: 0.12 });
  k.box(4.42, 0.3, 3.42, L.acc, hp.x, hp.y + 1.9, hp.z, { r: 0.02, shade: 0 });
  placard(g, 'HE-3', 1.8, hp.x - 1.0, hp.y + 1.55, hp.z + 1.72, L.ink, L.acc);
  const kh = halo([0.25, 0.5, 0.75].map((t) => k0.clone().lerp(k1, t).add(V(0, 0, 1.4))), [5, 5, 5], '#f7b258', 0.4);
  g.add(kh.obj);
  // the discharge: a pipe to the cold columns (frost at their feet)
  const cols = [V(7.4, 0, -8.8), V(9.2, 0, -8.8), V(11.0, 0, -8.8)];
  cols.forEach((p, i) => {
    const hh = 7.6 - i * 0.8;
    k.cyl(0.95, 1.0, 0.3, M.reg3, p.x, 0, p.z, 14, { shade: 0 });
    k.cyl(0.72, 0.72, hh, M.white, p.x, 0.25, p.z, 16, { shade: 0.08 });
    k.cyl(0.75, 0.78, 1.0, M.frost, p.x, 0.25, p.z, 16, { shade: 0, jitter: 0.02 });
    k.geo(new THREE.SphereGeometry(0.72, 16, 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.4, 1).translate(p.x, 0.25 + hh, p.z), M.white2, 0.02, 0);
    k.cyl(0.74, 0.74, 0.22, L.acc, p.x, hh * 0.8, p.z, 16, { shade: 0 });
  });
  pipeRun(k, [k1.clone().add(V(0.8, -0.6, 0)), V(6.0, 2.3, hz), V(6.0, 2.3, -8.8), V(11.0, 2.3, -8.8)], 0.22, M.steel, { seg: 8 });
  // the radiator wings, tall and white, edge-on to the sun
  for (let i = 0; i < 4; i++) {
    const x = -4.0 + i * 2.6, z = -11.2;
    k.box(0.12, 8.0, 2.4, M.rad, x, 0.8, z, { r: 0.02, shade: 0.03 });
    k.box(0.5, 0.8, 0.5, M.steelD, x, 0, z, { r: 0.05 });
    for (let y = 2; y < 8.6; y += 2.2) k.box(0.16, 0.08, 2.44, M.steel, x, y, z, { r: 0, jitter: 0 });
  }
  pipeRun(k, [V(-4.0, 1.0, -9.4), V(-4.0, 1.0, -7.0), V(hp.x, 1.0, -7.0), V(hp.x, 1.0, hz - 1.6)], 0.16, M.steel, { seg: 8 });
  // the control module and its airlock, the builder's name
  habModule(k, 8.6, 1.5, 2.2, 6.4, 1.4, L.acc);
  for (const x of [6.6, 7.4, 8.2, 9.0, 9.8]) k.box(0.6, 1.4, 1.0, M.reg3, x, 0, 2.2, { r: 0.08 });
  for (let i = 0; i < 5; i++) c.lit.box(0.42, 0.38, 0.1, M.glass, 6.6 + i * 0.85, 1.9, 3.6, { r: 0.04, jitter: 0 });
  airlock(k, 12.6, 2.2, Math.PI / 2, L.acc);
  placard(g, L.name, Math.min(4.8, 0.5 * L.name.length + 1), 8.6, 3.3, 3.68, L.ink, L.acc);
  // the harvester crawling the plain, its belly hot
  const crawl = new THREE.Group();
  const ck = new LiteKit(rng(o.seed + 7));
  for (const s of [-1, 1]) ck.box(7.4, 1.1, 1.0, M.dark, 0, 0, s * 1.6, { r: 0.35 });
  ck.box(6.6, 1.2, 3.4, L.acc, 0, 1.0, 0, { r: 0.18 });
  ck.box(4.6, 1.6, 2.8, M.white, -0.6, 2.2, 0, { r: 0.25 });
  ck.box(4.0, 0.06, 2.6, M.panel, -0.6, 3.82, 0, { r: 0, shade: 0 });
  for (let i = 0; i < 4; i++) ck.box(0.1, 1.4, 1.8, M.rad, -2.4 + i * 0.6, 3.85, 0, { r: 0.01 });
  ck.box(1.2, 0.9, 3.2, M.steelD, 3.9, 0.3, 0, { r: 0.08 });
  ck.cyl(0.4, 0.4, 3.0, M.steel, 4.5, 0.4, -1.5, 10, { rx: Math.PI / 2 });
  ck.box(1.0, 0.8, 1.0, M.glass, 2.6, 2.2, 0.9, { r: 0.08 });
  crawl.add(ck.build());
  const belly = plasmaMat('#f7b258', 1.4);
  const bk = new LiteKit(rng(o.seed + 8));
  bk.box(4.4, 0.12, 2.2, '#ffffff', -0.4, 0.92, 0, { r: 0, jitter: 0, shade: 0 });
  bk.box(4.0, 0.3, 0.06, '#ffffff', -0.4, 1.3, 1.73, { r: 0, jitter: 0, shade: 0 });
  crawl.add(bk.build(belly));
  beacon(crawl, 1.8, 4.2, 0, 0.5);
  const ch = halo([V(-0.4, 0.8, 1.9)], [5], '#f7b258', 0.5);
  crawl.add(ch.obj);
  lightPool(crawl, -0.4, 0, 0, 4, tintPool('#f7b258', 0.4), 1.6);
  g.add(crawl);
  roverTracks(k, [[-hw + 1, 8.6], [hw - 1, 8.6]], 3.2);
  pressRover(k, c.lit, -9.6, 1.6, 0.3, L.acc);
  floodMast(c, -13.6, -11.4, 6.5, Math.PI * 0.2, 6);
  floodMast(c, 13.8, 10.8, 6.5, -Math.PI * 0.8, 6);
  astro(g, 3.6, 4.4, -0.4, o.seed + 1);
  const dust = new Dust(90);
  g.add(dust.obj);
  const rand = rng(o.seed + 9);
  c.anim.extra.push((e) => {
    drum.rotation.x += e.dt * 0.4;
    const f = 1 + Math.sin(e.t * 3.3) * 0.07;
    seam.emissiveIntensity = 1.6 * f;
    belly.emissiveIntensity = 1.5 * f;
    kh.set(0.35 * f);
    // the harvester: slowly along the plain and back
    const s = Math.sin(e.t * 0.035);
    crawl.position.set(-2 + s * 7.5, 0, 8.6);
    crawl.rotation.y = Math.cos(e.t * 0.035) >= 0 ? 0 : Math.PI;
    if (Math.floor(e.t * 4) % 3 === 0) dust.emit(crawl.position.x + (crawl.rotation.y ? -4.4 : 4.4), 0.6, 8.6, 1, 1.4, 1.4, rand, crawl.rotation.y ? -Math.PI / 2 : Math.PI / 2, 1.4, 1.6);
    dust.update(e);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: 9.5, update: c.update };
}

// ── the tank farm ────────────────────────────────────────────────────────────────────────────
export function he3Tanks(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const status = plasmaMat('#5fd3b5', 1.2);
  const sk = new LiteKit(rng(o.seed + 4));
  const tanks: [number, number, number, string, string][] = [[-5.6, -2.2, 3.0, 'HE-3', L.acc], [2.4, -4.6, 2.3, 'H₂O', '#4a7cb6'], [7.4, 0.4, 2.2, 'O₂', '#f08a46']];
  for (const [x, z, R, name, band] of tanks) {
    const cy = R * 1.35;
    k.cyl(R + 0.6, R + 0.7, 0.3, M.reg3, x, 0, z, 24, { shade: 0 });
    k.geo(new THREE.SphereGeometry(R, 24, 16, 0, TAU, 0, Math.PI * 0.62).translate(x, cy, z), M.white, 0.02, 0);
    k.geo(new THREE.SphereGeometry(R * 1.005, 24, 8, 0, TAU, Math.PI * 0.62, Math.PI * 0.38).translate(x, cy, z), M.frost, 0.02, 0);
    k.geo(new THREE.TorusGeometry(R * 1.01, 0.12, 4, 40).rotateX(Math.PI / 2).translate(x, cy + 0.2, z), band, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      k.box(0.24, cy, 0.24, M.steel, x + Math.cos(a) * R * 0.92, 0.2, z + Math.sin(a) * R * 0.92, { r: 0.03, jitter: 0 });
    }
    k.box(0.7, 0.1, 0.7, M.steel, x, cy + R - 0.02, z, { r: 0, jitter: 0 });
    k.beam(V(x + R * 0.95, 0.2, z + 0.7), V(x + R * 0.5, cy + R * 0.8, z + R * 0.3), 0.14, M.steelD);
    // the label on a plate at the legs, a status light
    const pz = z + R * 0.95;
    k.box(0.12, 1.8, 0.12, M.steelD, x - 0.7, 0.2, pz, { r: 0 });
    k.box(0.12, 1.8, 0.12, M.steelD, x + 0.7, 0.2, pz, { r: 0 });
    placard(g, name, 1.6, x, 1.7, pz + 0.08, '#fbf7f0', band);
    sk.box(0.22, 0.22, 0.22, '#ffffff', x + R * 0.7, cy - R * 0.5, z + R * 0.62, { r: 0.04, jitter: 0 });
  }
  g.add(sk.build(status));
  // pipework to the loading arm at the front right, a tanker rover at the arm
  pipeRun(k, [V(-5.6, 1.0, 1.0), V(-5.6, 1.0, 4.4), V(7.8, 1.0, 4.4)], 0.2, M.steel, { seg: 8 });
  pipeRun(k, [V(2.4, 1.0, -2.3), V(2.4, 1.0, 4.4)], 0.18, M.steel, { seg: 8 });
  pipeRun(k, [V(7.4, 1.0, 2.6), V(7.4, 1.0, 4.4)], 0.18, M.steel, { seg: 8 });
  const ax = 8.6, az = 5.4;
  k.box(1.2, 0.4, 1.2, M.steelD, ax, 0, az, { r: 0.05 });
  k.cyl(0.24, 0.28, 4.6, M.white2, ax, 0.4, az, 10);
  k.beam(V(ax, 4.8, az), V(ax - 3.0, 5.6, az + 1.8), 0.3, L.acc);
  k.beam(V(ax - 3.0, 5.6, az + 1.8), V(ax - 3.6, 2.6, az + 2.4), 0.24, L.acc);
  k.box(0.5, 0.4, 0.5, M.steelD, ax - 3.6, 2.2, az + 2.4, { r: 0.05 });
  for (let s = 0; s < 6; s++) k.beam(V(ax, 4.6 - s * 0.6, az), V(ax, 4.0 - s * 0.6, az), 0.18, s % 2 ? M.dark : M.steel);
  pressRover(k, c.lit, ax - 3.8, az + 3.6, 0, L.acc);
  hcyl(k, 0.7, 2.6, M.white, ax - 4.6, 3.6, az + 3.6, 'x', 14);
  // a fence of posts and a light
  for (let i = 0; i < 12; i++) {
    const x = -W / 2 + 1 + i * ((W - 2) / 11);
    k.box(0.1, 1.0, 0.1, M.steel, x, 0, -D / 2 + 0.8, { r: 0, jitter: 0 });
  }
  k.beam(V(-W / 2 + 1, 0.9, -D / 2 + 0.8), V(W / 2 - 1, 0.9, -D / 2 + 0.8), 0.04, 'yel0');
  floodMast(c, -10.6, 8.4, 6, Math.PI * 0.8, 6);
  astro(g, 4.4, 6.4, 0.5, o.seed + 1);
  roverTracks(k, [[-W / 2 + 1, 8.2], [ax - 6, az + 3.6]], 1.9);
  c.anim.extra.push((e) => { status.emissiveIntensity = Math.sin(e.t * 1.6) > 0 ? 1.8 : 0.6; });
  c.finish();
  return { obj: g, w: W, d: D, h: 9, update: c.update };
}
