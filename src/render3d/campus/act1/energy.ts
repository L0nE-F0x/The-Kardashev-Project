/**
 * Act I's power yards: the solar farm (tracker tables either side of a service lane, combiner boxes, an
 * inverter station), the battery yard (cabinets in rows on plinths, a power-conversion skid per row, an
 * e-house, lamps) and the wind farm (towers in flanged sections with a door at the foot, a kiosk
 * transformer and a crane pad each, a met mast, the switchgear). Each builds in the order a crew would:
 * foundations and frames first, then what stands on them.
 */
import * as THREE from 'three';
import { glowMat, Kit, rng, type Paint } from '../../kit';
import type { Piece } from '../../pieces';
import { At, beacon, glassMat, lampHeadMat, P, poleLamp, transformer, V, wallLamp, warmPool } from '../plants2/parts';

// ── solar ────────────────────────────────────────────────────────────────────────────────────
/** Louvres on a cabinet face (+z): a few dark slots. */
function slots(k: Kit, x: number, y: number, z: number, w: number, h: number, n = 4) {
  for (let i = 0; i < n; i++) k.box(w, 0.05, 0.03, '#6a6474', x, y + (i * h) / n, z, { r: 0, jitter: 0, shade: 0 });
}

/** An inverter station on its slab: two inverter cabinets, the step-up transformer, a marshalling kiosk. `x` is its centre, facing +z. */
function inverterStation(k: Kit, x: number, z: number) {
  k.box(8.2, 0.12, 2.6, P.concrete2, x, 0.08, z, { r: 0.03, shade: 0, jitter: 0.02 });
  for (const dx of [-2.9, -1.0]) {
    k.box(1.7, 2.0, 1.3, '#e7dfd2', x + dx, 0.2, z, { r: 0.08 });
    k.box(1.74, 0.12, 1.34, '#b9b1a6', x + dx, 2.2, z, { r: 0.03, shade: 0 });
    for (const sx of [-0.42, 0.42]) {
      k.box(0.74, 1.7, 0.04, '#d8cfc3', x + dx + sx, 0.36, z + 0.66, { r: 0.01, jitter: 0.02, shade: 0 });
      slots(k, x + dx + sx, 0.5, z + 0.69, 0.56, 0.5, 4);
      k.box(0.04, 0.2, 0.05, '#5b5562', x + dx + sx * 0.25, 1.2, z + 0.69, { r: 0, jitter: 0 });
    }
    k.box(0.3, 0.2, 0.04, 'yel0', x + dx, 1.75, z + 0.68, { r: 0, jitter: 0, shade: 0 });
  }
  transformer(new At(k, x + 1.9, 0.14, z), 0, 0, 0.62);
  k.box(0.9, 1.5, 0.7, '#8a959a', x + 3.55, 0.2, z, { r: 0.05 });
  k.box(0.7, 1.1, 0.04, '#7b868b', x + 3.55, 0.4, z + 0.36, { r: 0.01, jitter: 0, shade: 0 });
  // bus between the cabinets and the transformer, in a covered trench
  k.box(7.4, 0.04, 0.5, '#8f877c', x, 0.2, z - 1.0, { r: 0, jitter: 0.03, shade: 0 });
}

export function solar(o: { seed: number; w: number; d: number; tier: number }): Piece {
  const g = new THREE.Group();
  const n = o.tier >= 3 ? 14 : o.tier === 2 ? 11 : 8;
  const H = o.tier >= 2 ? 1.3 : 0.9;
  const W = o.w - 3, lane = 2.6, len = (W - lane) / 2;
  // rows fill the plot from the back to the station's strip along the front
  const z0 = -o.d / 2 + 2.0, z1 = o.d / 2 - 5.6;
  const frames: THREE.Object3D[] = [], tables: THREE.Object3D[] = [];
  const mod = 1.07, nm = Math.floor(len / mod), tl = nm * mod;
  for (let i = 0; i < n; i++) {
    const z = z0 + (i * (z1 - z0)) / (n - 1);
    const fk = new Kit(rng(o.seed + i));
    const pk = new Kit(rng(o.seed * 7 + i));
    for (const side of [-1, 1]) {
      const cx = side * (lane / 2 + len / 2);
      // posts on footings, the torque tube, the drive in the middle, a combiner box at the lane end
      for (let j = 0; j <= 4; j++) {
        const x = cx - tl / 2 + 0.5 + (j * (tl - 1.0)) / 4;
        fk.box(0.13, H, 0.13, '#8a8490', x, 0.1, z, { r: 0, jitter: 0.02 });
        fk.box(0.34, 0.1, 0.34, P.concrete2, x, 0.08, z, { r: 0.02, shade: 0 });
      }
      fk.geo(new THREE.CylinderGeometry(0.07, 0.07, tl, 6).rotateZ(Math.PI / 2).translate(cx, H + 0.08, z), '#7a7186', 0.02, 0);
      fk.box(0.36, 0.3, 0.3, '#5e6670', cx, H - 0.2, z, { r: 0.04 });
      const bx = side * (lane / 2 + 0.28);
      fk.box(0.36, 0.5, 0.2, '#c9c7c0', bx, H - 0.62, z - 0.22, { r: 0.02 });
      fk.box(0.05, H - 0.62, 0.05, '#8a8490', bx, 0.1, z - 0.22, { r: 0, jitter: 0 });
      // modules: glass over a light frame, a busbar line across each
      for (let j = 0; j < nm; j++) {
        const x = cx - tl / 2 + (j + 0.5) * mod;
        pk.box(mod - 0.02, 0.03, 1.94, '#9cb0c8', x, -0.03, 0, { r: 0, jitter: 0, shade: 0 });
        pk.box(mod - 0.07, 0.06, 1.88, '#2a3c6c', x, 0, 0, { r: 0.012, jitter: 0.09, shade: 0, seg: 1 });
        pk.box(mod - 0.09, 0.006, 0.02, '#7f93b8', x, 0.06, 0, { r: 0, jitter: 0, shade: 0 });
      }
    }
    const frame = fk.build();
    const panels = pk.build(glassMat);
    panels.rotation.x = 0.42;
    panels.position.set(0, H + 0.2, z);
    g.add(frame, panels);
    frames.push(frame);
    tables.push(panels);
  }
  const k = new Kit(rng(o.seed + 50));
  const lamps = new Kit(rng(o.seed + 51));
  // the service lane: compacted gravel with two wheel tracks, cable-trench covers along one side
  const lz0 = z0 - 1.4, lz1 = o.d / 2 - 0.6;
  k.box(lane - 0.3, 0.05, lz1 - lz0, '#b3a58a', 0, 0.1, (lz0 + lz1) / 2, { r: 0.02, shade: 0, jitter: 0.02 });
  for (const sx of [-0.62, 0.62]) k.box(0.36, 0.012, lz1 - lz0 - 0.4, '#a09276', sx, 0.15, (lz0 + lz1) / 2, { r: 0, jitter: 0.02, shade: 0 });
  for (let z = lz0 + 0.6; z < z1 + 1.2; z += 1.25) k.box(0.34, 0.03, 1.18, '#8f877c', -lane / 2 + 0.02, 0.13, z, { r: 0, jitter: 0.05, shade: 0 });
  // the inverter station and a lamp in the front strip, a weather mast with its pyranometer
  const sx0 = lane / 2 + 5.2, sz = o.d / 2 - 2.5;
  inverterStation(k, sx0, sz);
  poleLamp(k, lamps, g, lane / 2 + 0.5, sz + 0.4, 4.4, 1, 0.1);
  const mx = -lane / 2 - 2.0;
  k.box(0.5, 0.1, 0.5, P.concrete2, mx, 0.08, sz, { r: 0.02, shade: 0 });
  k.cyl(0.04, 0.06, 4.2, P.galv, mx, 0.15, sz, 6);
  k.box(0.7, 0.04, 0.04, P.galv, mx, 3.7, sz, { r: 0, jitter: 0 });
  k.cyl(0.07, 0.07, 0.07, '#e9e1d2', mx - 0.3, 3.74, sz, 8, { shade: 0 });
  k.box(0.2, 0.28, 0.14, '#e9e1d2', mx + 0.08, 1.4, sz, { r: 0.02 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.geo(new THREE.SphereGeometry(0.05, 6, 4).translate(mx + 0.3 + Math.cos(a) * 0.14, 3.86, sz + Math.sin(a) * 0.14), '#3a3442', 0, 0);
    k.beam(V(mx + 0.3, 3.86, sz), V(mx + 0.3 + Math.cos(a) * 0.14, 3.86, sz + Math.sin(a) * 0.14), 0.015, '#3a3442');
  }
  k.cyl(0.012, 0.012, 0.14, '#3a3442', mx + 0.3, 3.72, sz, 4);
  // a pallet of spare modules by the mast
  k.box(1.2, 0.14, 2.1, '#b08f6e', mx - 2.6, 0.12, sz, { r: 0.01, jitter: 0.04 });
  k.box(1.1, 0.5, 2.0, '#33466f', mx - 2.6, 0.26, sz, { r: 0.02, jitter: 0.04 });
  k.box(1.14, 0.03, 2.04, '#e9e1d2', mx - 2.6, 0.76, sz, { r: 0, jitter: 0, shade: 0 });
  const yard = k.build();
  g.add(yard, lamps.build(lampHeadMat));
  return {
    obj: g, w: o.w - 2, d: o.d - 1, h: 4,
    // (nobody works here by day: the only way in is the lane)
    doors: [{ x: 0, z: o.d / 2 - 0.4 }],
    blockers: [
      { x0: -W / 2 - 0.2, z0: z0 - 1.1, x1: -lane / 2 + 0.25, z1: z1 + 1.1 },
      { x0: lane / 2 - 0.05, z0: z0 - 1.1, x1: W / 2 + 0.2, z1: z1 + 1.1 },
      { x0: sx0 - 4.2, z0: sz - 1.4, x1: sx0 + 4.2, z1: sz + 1.4 },
      { x0: mx - 3.3, z0: sz - 1.15, x1: mx + 0.5, z1: sz + 1.15 },
    ],
    // frames go up ahead of the modules
    progress(p) {
      frames.forEach((f, i) => { f.visible = p >= 1 || i < Math.ceil(Math.min(1, p * 1.7 + 0.08) * n); });
      tables.forEach((t, i) => { t.visible = p >= 1 || i < Math.floor(Math.max(0, p * 1.25 - 0.2) * n); });
    },
  };
}

// ── battery yard ─────────────────────────────────────────────────────────────────────────────
const ledMat = glowMat('#7dff9a', 0.9);
ledMat.userData.scope = 0;

/** One battery cabinet, 5.5 long: doors with vents along the front, the cooling on the roof, a status light. */
function cabinet(seed: number, band: Paint) {
  const k = new Kit(rng(seed));
  const L = 5.5, D = 1.65, Hh = 2.3;
  k.box(L, Hh, D, '#ece6dc', 0, 0.3, 0, { r: 0.07, shade: 0.12, jitter: 0.02 });
  k.box(L + 0.04, 0.24, D + 0.04, band, 0, 0.3 + Hh - 0.42, 0, { r: 0.03, shade: 0, jitter: 0.02 });
  k.box(L + 0.02, 0.14, D + 0.02, '#a39a91', 0, 0.3, 0, { r: 0.02, shade: 0, jitter: 0 });
  // eight door leaves with a vent and a handle each, both long sides
  for (const sz of [-1, 1])
    for (let i = 0; i < 8; i++) {
      const x = -L / 2 + 0.36 + i * ((L - 0.72) / 7);
      k.box(0.58, 1.55, 0.03, '#ded7cb', x, 0.5, sz * (D / 2 + 0.012), { r: 0.01, jitter: 0.03, shade: 0 });
      for (let j = 0; j < 3; j++) k.box(0.42, 0.04, 0.03, '#8f877c', x, 0.62 + j * 0.1, sz * (D / 2 + 0.03), { r: 0, jitter: 0, shade: 0 });
      k.box(0.03, 0.18, 0.03, '#5b5562', x + 0.2, 1.3, sz * (D / 2 + 0.035), { r: 0, jitter: 0 });
    }
  // the thermal unit on the roof: a low housing, two fan grilles
  k.box(2.4, 0.3, 1.2, P.hvac, -1.1, 0.3 + Hh, 0, { r: 0.05 });
  for (const fx of [-1.7, -0.5]) {
    k.cyl(0.42, 0.42, 0.04, '#5e6670', fx, 0.6 + Hh, 0, 14, { shade: 0 });
    k.cyl(0.1, 0.1, 0.06, '#433c52', fx, 0.6 + Hh, 0, 8, { shade: 0 });
  }
  k.box(1.4, 0.1, 1.0, '#cfc9c0', 1.5, 0.3 + Hh, 0, { r: 0.02, shade: 0 });
  // the customer cubicle at the end, a hazard label
  k.box(0.05, 1.7, 1.2, '#d3ccc0', L / 2 + 0.02, 0.5, 0, { r: 0.01, jitter: 0.02, shade: 0 });
  k.box(0.03, 0.26, 0.26, 'yel0', L / 2 + 0.05, 1.5, -0.3, { r: 0, jitter: 0, shade: 0 });
  const g = new THREE.Group();
  g.add(k.build());
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.16), ledMat);
  led.position.set(L / 2 + 0.06, 1.95, 0.32);
  g.add(led);
  return g;
}

export function battery(o: { seed: number; tier: number }): Piece {
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed + 9));
  const lamps = new Kit(rng(o.seed + 10));
  // rows of four; tier 3 packs them back to back in pairs
  const rows: number[] = o.tier >= 3 ? [-10.3, -8.55, -4.5, -2.75, 1.3, 3.05] : o.tier === 2 ? [-10.0, -5.9, -1.8, 2.3] : [-9.2, -4.2, 0.8];
  const xs = [-8.85, -2.95, 2.95, 8.85];
  const band: Paint = 'cyn3';
  const units: THREE.Object3D[] = [];
  rows.forEach((z, ri) => {
    // two plinth beams the length of the row, a cable trench cover in front
    for (const dz of [-0.55, 0.55]) k.box(24.2, 0.3, 0.4, P.concrete2, 0, 0.06, z + dz, { r: 0.03, shade: 0.1 });
    const front = o.tier >= 3 ? (ri % 2 ? 1 : -1) : 1;
    for (let x = -11.8; x < 11.9; x += 1.2) k.box(1.14, 0.04, 0.5, '#8f877c', x + 0.6, 0.13, z + front * 1.3, { r: 0, jitter: 0.05, shade: 0 });
    xs.forEach((x, ci) => {
      const u = cabinet(o.seed + ri * 7 + ci, band);
      u.position.set(x, 0.06, z);
      if (front < 0) u.rotation.y = Math.PI;
      g.add(u);
      units.push(u);
    });
  });
  // the main trench across the front of the rows, to the power-conversion skids: one per row (pair)
  const tz = 6.0;
  for (let x = -11.8; x < 11.9; x += 1.2) k.box(1.14, 0.04, 0.6, '#8f877c', x + 0.6, 0.13, tz, { r: 0, jitter: 0.05, shade: 0 });
  const nSkid = o.tier >= 2 ? 3 : 2;
  const skidX = nSkid === 3 ? [-7.6, -0.4, 6.8] : [-5.4, 3.4];
  const sz = 8.6;
  for (const x of skidX) {
    k.box(6.0, 0.12, 2.5, P.concrete2, x, 0.08, sz, { r: 0.03, shade: 0, jitter: 0.02 });
    // the inverter: a cabinet with doors and louvres, a hood on top
    k.box(2.6, 2.1, 1.4, '#e7dfd2', x - 1.5, 0.2, sz, { r: 0.08 });
    k.box(2.66, 0.12, 1.46, '#b9b1a6', x - 1.5, 2.3, sz, { r: 0.03, shade: 0 });
    k.box(2.62, 0.22, 1.42, band, x - 1.5, 1.86, sz, { r: 0.02, shade: 0 });
    for (let i = 0; i < 3; i++) {
      k.box(0.76, 1.5, 0.04, '#d8cfc3', x - 2.32 + i * 0.82, 0.32, sz + 0.71, { r: 0.01, jitter: 0.02, shade: 0 });
      slots(k, x - 2.32 + i * 0.82, 0.46, sz + 0.735, 0.56, 0.42, 4);
      k.box(0.04, 0.2, 0.05, '#5b5562', x - 2.32 + i * 0.82 + 0.26, 1.2, sz + 0.74, { r: 0, jitter: 0 });
    }
    transformer(new At(k, x + 1.5, 0.14, sz), 0, 0, 0.66);
    // bollards on the road side
    for (const dx of [-2.8, 0, 2.8]) k.cyl(0.08, 0.08, 0.85, 'yel0', x + dx, 0.12, sz + 1.55, 8, { shade: 0 });
  }
  // the e-house (switchgear and controls) in the front corner, its door and lamp; a fire cabinet beside it
  const ex = nSkid === 3 ? 11.3 : 10.6, ez = 9.4;
  k.box(2.6, 0.2, 3.6, P.concrete2, ex, 0.06, ez, { r: 0.03, shade: 0 });
  k.box(2.3, 2.5, 3.3, '#e9e1d2', ex, 0.24, ez, { r: 0.08, shade: 0.12 });
  k.box(2.4, 0.16, 3.4, P.roof, ex, 2.74, ez, { r: 0.04, shade: 0 });
  k.box(2.32, 0.26, 3.32, band, ex, 2.3, ez, { r: 0.02, shade: 0 });
  k.box(0.06, 2.0, 0.95, '#5b6a74', ex - 1.16, 0.3, ez + 0.6, { r: 0, jitter: 0 });
  k.box(0.05, 0.5, 0.7, '#8f877c', ex - 1.16, 1.2, ez - 0.9, { r: 0, jitter: 0, shade: 0 });
  k.box(0.9, 0.7, 0.8, P.hvac, ex, 2.9, ez - 0.8, { r: 0.06 });
  lamps.box(0.16, 0.16, 0.42, '#e9e1d2', ex - 1.22, 2.42, ez + 0.6, { r: 0, jitter: 0 });
  k.box(0.5, 1.3, 0.4, 'red3', ex - 1.0, 0.14, ez - 2.3, { r: 0.03 });
  // lamps on masts at the yard's corners and by the skids
  for (const [x, z, dir] of [[-12.2, -11.3, 1], [12.2, -11.3, -1], [-12.2, 4.6, 1], [12.2, 4.6, -1]] as [number, number, number][]) poleLamp(k, lamps, g, x, z, 5.4, dir, 0.1);
  wallLamp(lamps, g, skidX[0] - 1.5, 2.46, sz + 0.75, 0, warmPool, 3);
  g.add(k.build(), lamps.build(lampHeadMat));
  const h = 3.4;
  return {
    obj: g, w: 26, d: 24, h,
    // the operator comes in at the gate and to the e-house's door
    doors: [{ x: ex - 1.9, z: ez + 0.6, nx: -1, nz: 0 }],
    blockers: [
      ...rows.map((z) => ({ x0: -12.2, z0: z - 0.95, x1: 12.2, z1: z + 0.95 })),
      ...skidX.map((x) => ({ x0: x - 3.05, z0: sz - 1.3, x1: x + 3.05, z1: sz + 1.7 })),
      { x0: ex - 1.3, z0: ez - 2.6, x1: ex + 1.3, z1: ez + 1.8 },
    ],
    // the cabinets are craned on one at a time
    progress(p) { units.forEach((u, i) => { u.visible = p >= 1 || i < Math.floor(p * units.length); }); },
  };
}

// ── wind ─────────────────────────────────────────────────────────────────────────────────────
interface Turbine { obj: THREE.Group; sections: THREE.Object3D[]; nacelle: THREE.Object3D; rotor: THREE.Group }

/** A turbine with hub height `H`: the tower in three flanged sections, the nacelle, the rotor (spins about z). */
function turbine(seed: number, H: number): Turbine {
  const g = new THREE.Group();
  const white = '#f1ece4';
  const r0 = 0.5 + H * 0.014, r1 = 0.3 + H * 0.006;
  const base = new Kit(rng(seed));
  // the foundation's pedestal, the door at the foot with its steps and lamp
  base.cyl(r0 + 1.2, r0 + 1.5, 0.3, '#a39a91', 0, 0.08, 0, 16, { shade: 0.1 });
  base.cyl(r0 + 0.25, r0 + 0.3, 0.3, '#b9b1a6', 0, 0.36, 0, 16, { shade: 0 });
  base.box(0.7, 1.9, 0.12, '#c9c7c0', 0, 0.75, r0 * 0.98, { r: 0.03 });
  base.box(0.5, 1.6, 0.05, '#8a959a', 0, 0.9, r0 * 0.98 + 0.07, { r: 0.02, jitter: 0, shade: 0 });
  base.box(1.0, 0.1, 0.8, P.steel2, 0, 0.66, r0 + 0.45, { r: 0, jitter: 0.02, shade: 0 });
  for (let i = 0; i < 3; i++) base.box(0.9, 0.05, 0.26, P.steel2, 0, 0.5 - i * 0.17, r0 + 0.98 + i * 0.26, { r: 0, jitter: 0.02, shade: 0 });
  for (const sx of [-0.48, 0.48]) {
    base.box(0.04, 0.95, 0.04, P.safety, sx, 0.7, r0 + 0.82, { r: 0, jitter: 0 });
    base.beam(V(sx, 1.65, r0 + 0.1), V(sx, 1.65, r0 + 0.82), 0.04, P.safety);
    base.beam(V(sx, 1.65, r0 + 0.82), V(sx, 1.05, r0 + 1.7), 0.04, P.safety);
    base.box(0.04, 0.9, 0.04, P.safety, sx, 0.16, r0 + 1.7, { r: 0, jitter: 0 });
  }
  g.add(base.build());
  const sections: THREE.Object3D[] = [];
  const y0 = 0.6;
  for (let s = 0; s < 3; s++) {
    const sk = new Kit(rng(seed + 3 + s));
    const a = s / 3, b = (s + 1) / 3;
    const ra = r0 + (r1 - r0) * a, rb = r0 + (r1 - r0) * b;
    sk.cyl(rb, ra, (H - y0) / 3, white, 0, y0 + (H - y0) * a, 0, 18, { shade: s === 0 ? 0.08 : 0, jitter: 0.012 });
    sk.cyl(rb * 1.05, rb * 1.05, 0.1, '#d8d2c8', 0, y0 + (H - y0) * b - 0.1, 0, 18, { shade: 0, jitter: 0 });
    const m = sk.build();
    g.add(m);
    sections.push(m);
  }
  // the nacelle: a rounded housing set back on the tower, the cooler on its roof, the hub's bearing at the front
  const nk = new Kit(rng(seed + 8));
  const nl = 2.3 + H * 0.045, nh = 0.85 + H * 0.012;
  nk.box(nh * 1.05, nh, nl, white, 0, H - 0.05, -nl * 0.14, { r: nh * 0.32 });
  nk.box(nh * 0.7, 0.2, nl * 0.3, '#d8d2c8', 0, H + nh - 0.08, -nl * 0.4, { r: 0.05, shade: 0 });
  nk.cyl(r1 * 1.1, r1 * 1.1, 0.25, '#d8d2c8', 0, H - 0.25, 0, 14, { shade: 0 });
  nk.geo(new THREE.CylinderGeometry(nh * 0.36, nh * 0.42, 0.3, 14).rotateX(Math.PI / 2).translate(0, H + nh * 0.5 - 0.05, nl * 0.36 + 0.12), '#d8d2c8', 0.01, 0);
  nk.box(0.03, 0.5, 0.03, '#8a8490', 0.15, H + nh, -nl * 0.5, { r: 0, jitter: 0 });
  nk.box(0.2, 0.03, 0.03, '#8a8490', 0.15, H + nh + 0.45, -nl * 0.5, { r: 0, jitter: 0 });
  const nacelle = new THREE.Group();
  nacelle.add(nk.build());
  beacon(nacelle, -0.15, H + nh + 0.22, -nl * 0.3, seed);
  g.add(nacelle);
  // the rotor: a spinner, three blades with a round root that flatten and taper to the tip
  const rotor = new THREE.Group();
  rotor.position.set(0, H + nh * 0.5 - 0.05, nl * 0.36 + 0.55);
  const bl = H * 0.46;
  const rk = new Kit(rng(seed + 1));
  rk.geo(new THREE.SphereGeometry(nh * 0.46, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.5), white, 0.01, 0);
  rk.geo(new THREE.CylinderGeometry(nh * 0.46, nh * 0.44, 0.3, 12).rotateX(Math.PI / 2).translate(0, 0, -0.15), white, 0.01, 0);
  for (let i = 0; i < 3; i++) {
    const blade = bladeGeometry(bl, nh * 0.2);
    blade.rotateZ((i * Math.PI * 2) / 3);
    rk.geo(blade, '#f6f2ea', 0.012, 0);
  }
  rotor.add(rk.build());
  g.add(rotor);
  return { obj: g, sections, nacelle, rotor };
}

/** A blade along +y from the hub: round at the root, widest a fifth of the way out, thin and narrow at the tip, pitched a little. */
function bladeGeometry(len: number, root: number) {
  const seg = 10, ring = 8;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const y = root * 0.6 + t * len;
    // chord and thickness along the span
    const bulge = Math.max(0, 1 - Math.abs(t - 0.2) / 0.2);
    const chord = root * (1 + bulge * 1.5) * (t < 0.2 ? 1 : 1 - (t - 0.2) * 0.98);
    const thick = root * (t < 0.08 ? 1 : Math.max(0.1, 0.55 - t * 0.5));
    const twist = 0.5 * (1 - t);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      // the trailing edge sharpens out from the root
      const cx = Math.cos(a) * chord * (Math.cos(a) < 0 ? 1 + bulge * 0.5 : 1) - chord * 0.25 * Math.min(1, t * 5), cz = Math.sin(a) * thick;
      pos.push(cx * Math.cos(twist) - cz * Math.sin(twist), y, cx * Math.sin(twist) + cz * Math.cos(twist));
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + ((j + 1) % ring), c = a + ring, d = b + ring;
      idx.push(a, c, b, b, c, d);
    }
  // the tip cap
  const tip = pos.length / 3;
  pos.push(0, root * 0.6 + len + root * 0.15, 0);
  for (let j = 0; j < ring; j++) idx.push(seg * ring + j, tip, seg * ring + ((j + 1) % ring));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function wind(o: { seed: number; tier: number }): Piece {
  const g = new THREE.Group();
  const spots: [number, number][] = o.tier >= 3 ? [[-9, 6.5], [-3.5, -7], [4, 5.5], [10, -6]] : [[-8, 5.5], [1, -6.5], [9.5, 4.5]];
  const H = o.tier >= 3 ? 30 : o.tier >= 2 ? 24 : 18;
  const ts = spots.map(([x, z], i) => {
    const t = turbine(o.seed + i * 5, H + i * 1.2);
    t.obj.position.set(x, 0, z);
    t.obj.rotation.y = -0.35;
    g.add(t.obj);
    return t;
  });
  const k = new Kit(rng(o.seed + 20));
  const lamps = new Kit(rng(o.seed + 21));
  // a gravel crane pad and a kiosk transformer at each foot, the site track linking them to the gate
  const cs = Math.cos(0.35), sn = Math.sin(0.35);
  for (const [x, z] of spots) {
    k.box(5.2, 0.07, 4.2, '#b9ab90', x + 3.6, 0.1, z + 0.4, { r: 0.03, shade: 0, jitter: 0.02 });
    // (beside the door, which faces the way the turbine does)
    const kx = x + cs * 2.3 + sn * 1.2, kz = z - sn * 2.3 + cs * 1.2;
    k.box(1.5, 0.1, 1.3, P.concrete2, kx, 0.09, kz, { r: 0.02, shade: 0 });
    k.box(1.2, 1.25, 1.0, '#5f7a5e', kx, 0.18, kz, { r: 0.05, jitter: 0.03 });
    k.box(1.26, 0.08, 1.06, '#4f6a50', kx, 1.43, kz, { r: 0.02, shade: 0 });
    k.box(0.5, 0.9, 0.03, '#56705a', kx - 0.28, 0.32, kz + 0.51, { r: 0, jitter: 0, shade: 0 });
    k.box(0.5, 0.9, 0.03, '#56705a', kx + 0.28, 0.32, kz + 0.51, { r: 0, jitter: 0, shade: 0 });
    k.box(0.16, 0.16, 0.02, 'yel0', kx + 0.28, 0.95, kz + 0.53, { r: 0, jitter: 0, shade: 0 });
  }
  const track = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    k.box(len + 2.4, 0.06, 2.6, '#b3a58a', (x0 + x1) / 2, 0.095, (z0 + z1) / 2, { r: 0.03, shade: 0, jitter: 0.02, ry: -Math.atan2(z1 - z0, x1 - x0) });
  };
  for (let i = 0; i + 1 < spots.length; i++) track(spots[i][0] + 3.6, spots[i][1] + 0.4, spots[i + 1][0] + 3.6, spots[i + 1][1] + 0.4);
  track(spots[0][0] + 3.6, spots[0][1] + 0.4, spots[0][0] + 3.6, 11.8);
  // the switchgear at the back: an e-house with its door and lamp, the grid transformer behind a low wall
  const sx = -10.2, sz = -9.6;
  k.box(3.6, 0.16, 2.6, P.concrete2, sx, 0.07, sz, { r: 0.03, shade: 0 });
  k.box(3.2, 2.3, 2.2, '#e7dfd2', sx, 0.2, sz, { r: 0.08, shade: 0.12 });
  k.box(3.32, 0.16, 2.32, P.roof, sx, 2.5, sz, { r: 0.04, shade: 0 });
  k.box(3.22, 0.24, 2.22, 'cyn3', sx, 2.08, sz, { r: 0.02, shade: 0 });
  k.box(0.9, 1.9, 0.06, '#5b6a74', sx - 0.8, 0.26, sz + 1.11, { r: 0, jitter: 0 });
  slots(k, sx + 0.8, 0.6, sz + 1.12, 0.9, 0.5, 4);
  wallLamp(lamps, g, sx - 0.8, 2.3, sz + 1.2, 0, warmPool, 3);
  transformer(new At(k, sx + 4.0, 0.1, sz), 0, 0, 0.8);
  k.box(0.2, 1.9, 2.6, '#b9b1a6', sx + 2.25, 0.1, sz, { r: 0.03 });
  // a met mast: a guyed lattice with an anemometer and a vane
  const mx = 11.6, mz = 9.8, MH = Math.min(H * 0.8, 20);
  k.box(0.8, 0.14, 0.8, P.concrete2, mx, 0.07, mz, { r: 0.02, shade: 0 });
  const legs: [number, number][] = [[-0.18, -0.12], [0.18, -0.12], [0, 0.2]];
  for (const [lx, lz] of legs) k.beam(V(mx + lx, 0.2, mz + lz), V(mx + lx * 0.5, MH, mz + lz * 0.5), 0.045, P.galv);
  for (let y = 0.2; y < MH - 1; y += 1.1)
    for (let i = 0; i < 3; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 3];
      const ka = 1 - (0.5 * y) / MH, kb = 1 - (0.5 * (y + 1.1)) / MH;
      k.beam(V(mx + ax * ka, y, mz + az * ka), V(mx + bx * kb, y + 1.1, mz + bz * kb), 0.025, P.galv);
    }
  for (const [gx, gz] of [[-2.6, 1.2], [1.4, 2.4], [0.9, -2.6]]) {
    k.beam(V(mx, MH * 0.82, mz), V(mx + gx, 0.15, mz + gz), 0.018, '#6a6474');
    k.box(0.3, 0.12, 0.3, P.concrete2, mx + gx, 0.07, mz + gz, { r: 0.02, shade: 0 });
  }
  k.box(1.5, 0.035, 0.035, P.galv, mx, MH - 0.3, mz, { r: 0, jitter: 0 });
  k.cyl(0.02, 0.02, 0.35, P.galv, mx - 0.72, MH - 0.3, mz, 4);
  k.geo(new THREE.ConeGeometry(0.09, 0.12, 6).rotateZ(Math.PI / 2).translate(mx - 0.72, MH + 0.1, mz), '#3a3442', 0, 0);
  k.box(0.3, 0.14, 0.012, 'org0', mx + 0.72, MH - 0.18, mz, { r: 0, jitter: 0, shade: 0 });
  beacon(g, mx, MH + 0.25, mz, 2.2);
  const yard = k.build();
  g.add(yard, lamps.build(lampHeadMat));
  let done = 1;
  return {
    obj: g, w: 26, d: 24, h: H + 10,
    doors: [{ x: sx - 0.8, z: sz + 1.9 }],
    blockers: [
      ...spots.map(([x, z]) => ({ x0: x - 1.6, z0: z - 1.6, x1: x + 3.2, z1: z + 2.6 })),
      { x0: sx - 2.0, z0: sz - 1.5, x1: sx + 5.6, z1: sz + 1.3 },
      { x0: mx - 0.5, z0: mz - 0.5, x1: mx + 0.5, z1: mz + 0.5 },
    ],
    // one turbine after another: the tower goes up a section at a time, then the nacelle, then the rotor
    progress(p) {
      done = p;
      ts.forEach((t, i) => {
        const local = p >= 1 ? 1 : Math.min(1, Math.max(0, p * ts.length - i));
        t.sections.forEach((s, j) => { s.visible = local > (j + 0.4) * 0.22; });
        t.nacelle.visible = local > 0.8;
        t.rotor.visible = local >= 0.97;
      });
    },
    update(e) { for (const [i, t] of ts.entries()) if (done >= 1 || t.rotor.visible) t.rotor.rotation.z -= e.dt * (0.9 + i * 0.13); },
  };
}
