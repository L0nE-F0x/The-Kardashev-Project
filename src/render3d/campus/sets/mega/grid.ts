/**
 * A megaproject's ground work and grid: surveyed land (stage 0, on land and at sea), the site
 * office, the big HV substation and the HVDC converter station (built in the builder's colours).
 */
import * as THREE from 'three';
import { Kit, mix, paintMat, rng } from '../../../kit';
import { fenceMesh, type Piece } from '../../../pieces';
import { parkedCars } from '../../life';
import { plantOn } from '../../trees';
import type { Act3SetOpts } from '../../act3sets';
import {
  Anim, beacon, buoyLight, buoyUnit, cabin, CHARTER, charterBoard, cyanMat, drone, fieldOf, flag, floodMast, gantry, hcyl, hoarding, instances,
  insulatorUnit, lamp, latticeTower, laydown, P, placard, SEA, sagWires, stake, standing, strollers, towerCrane, track,
  transformer, V, vehicle, wake, warmPool, winBig, windows, workCrane, xf, yard,
} from './common';

type Win = [number, number, number, number, number, number?][];

/** A theodolite on its tripod (yellow instrument), at (x, z). */
function theodolite(k: Kit, x: number, z: number) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    k.beam(V(x + Math.cos(a) * 0.45, 0, z + Math.sin(a) * 0.45), V(x, 1.35, z), 0.04, '#c08850');
  }
  k.box(0.22, 0.1, 0.22, P.dark, x, 1.33, z, { r: 0 });
  k.box(0.2, 0.28, 0.18, P.yellow, x, 1.42, z, { r: 0.03 });
  hcyl(k, 0.05, 0.3, P.dark, x, 1.62, z, 'z', 6);
}
/** A surveyor's range pole, red and white. */
function rangePole(k: Kit, x: number, z: number) {
  for (let i = 0; i < 5; i++) k.cyl(0.035, 0.035, 0.45, i % 2 ? '#fbf7f0' : P.red, x, i * 0.45, z, 6, { shade: 0 });
}

// ── stage 0 on land ──────────────────────────────────────────────────────────────────────────
/** Surveyed open land: stakes with flagging tape, string lines, a theodolite; 'board' adds the site board, a cabin and a pickup. */
export function survey(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const r = rng(o.seed);
  const f = fieldOf(o.backdrop);
  const k = new Kit(rng(o.seed + 1));
  const board = o.variant === 'board';
  // the grid of plots, pegged out with string lines between the stakes
  const xs: number[] = [], zs: number[] = [];
  for (let x = -W / 2 + 2; x <= W / 2 - 2 + 0.01; x += (W - 4) / 5) xs.push(x);
  for (let z = -D / 2 + 2; z <= D / 2 - (board ? 8 : 3) + 0.01; z += (D - (board ? 10 : 5)) / 3) zs.push(z);
  const jx = () => (r() - 0.5) * 0.3;
  const pts = zs.map((z) => xs.map((x) => [x + jx(), z + jx()] as [number, number]));
  for (const row of pts) for (const [x, z] of row) stake(k, x, z, r() < 0.5 ? '#f0508a' : '#f08a46');
  for (let j = 0; j < pts.length; j++)
    for (let i = 0; i < pts[j].length; i++) {
      const [x, z] = pts[j][i];
      if (i + 1 < pts[j].length) k.beam(V(x, 0.45, z), V(pts[j][i + 1][0], 0.45, pts[j][i + 1][1]), 0.025, '#f4efe4');
      if (j + 1 < pts.length && (i === 0 || i === pts[j].length - 1 || i % 2 === 0)) k.beam(V(x, 0.45, z), V(pts[j + 1][i][0], 0.45, pts[j + 1][i][1]), 0.025, '#f4efe4');
    }
  // painted marks and a few marker posts in the plots
  for (let i = 0; i < 10; i++) {
    const x = (r() - 0.5) * (W - 6), z = (r() - 0.5) * (D - 8) - (board ? 3 : 0);
    k.box(0.5, 0.02, 0.5, i % 2 ? '#f0508a' : '#fbf7f0', x, 0.02, z, { r: 0, ry: r() * 3, jitter: 0, shade: 0 });
  }
  // a soil test pit with its spoil heap
  k.box(2.2, 0.06, 1.6, '#5f3b28', W / 2 - 7, 0.0, -D / 2 + 6, { r: 0.02, shade: 0 });
  k.geo(new THREE.SphereGeometry(1.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.45, 0.8).translate(W / 2 - 4.6, 0, -D / 2 + 6), f.worn, 0.05);
  // a geotech rig boring a test hole, a drone mapping the plots
  const gx = -W / 2 + 8, gz = -D / 2 + 7;
  k.box(5.2, 1.0, 2.2, '#5b5562', gx, 0.5, gz, { r: 0.12 });
  for (const sx of [-1.6, 1.6]) for (const sz of [-1.1, 1.1]) k.cyl(0.45, 0.45, 0.35, '#2f2a3d', gx + sx, 0.45, gz + sz - 0.17, 10, { rx: Math.PI / 2, shade: 0 });
  k.box(1.6, 1.4, 2.0, P.white, gx + 2.0, 1.4, gz, { r: 0.12 });
  k.box(1.62, 0.6, 2.02, P.glassD, gx + 2.3, 2.0, gz, { r: 0.04, shade: 0 });
  k.box(0.36, 5.4, 0.36, P.orange, gx - 2.0, 1.4, gz, { r: 0.03 });
  k.box(0.6, 0.7, 0.6, P.yellow, gx - 2.0, 4.4, gz, { r: 0.06 });
  k.cyl(0.08, 0.08, 2.0, P.steelD, gx - 2.0, -0.4, gz, 6);
  standing(g, gx - 1.2, gz + 1.8, 0.2, o.seed + 6, 'worker');
  drone(g, anim, 2, -2, 11, 9, o.seed);
  // the surveyor at work
  const tx = board ? 4 : -2, tz = board ? -2 : 2;
  theodolite(k, tx, tz);
  standing(g, tx - 0.3, tz + 0.55, Math.PI + 0.2, o.seed + 3, 'engineer');
  rangePole(k, tx + 13, tz - 6);
  standing(g, tx + 13.5, tz - 5.6, -2.5, o.seed + 4, 'worker');
  // tyre tracks across the land
  const rut = mix(f.track, '#7d5232', 0.35);
  track(k, -W / 2, D / 2 - 3.2, W / 2, D / 2 - 2.6, 0.45, rut, 0);
  track(k, -W / 2, D / 2 - 4.6, W / 2, D / 2 - 4.0, 0.45, rut, 0);
  const glow: Win = [];
  if (board) {
    // the Charter's board on its posts, the site cabin and the survey pickup
    const bx = -W / 2 + 9, bz = D / 2 - 4.5;
    for (const sx of [-3.2, 3.2]) k.box(0.28, 4.2, 0.28, P.timberD, bx + sx, 0, bz, { r: 0.03 });
    k.box(10.6, 3.3, 0.24, CHARTER.dark, bx, 1.15, bz - 0.12, { r: 0.05, shade: 0 });
    k.box(10.8, 0.22, 0.5, P.dark, bx, 4.45, bz - 0.05, { r: 0.04 });
    const bd = charterBoard(o.label, 10.2);
    bd.position.set(bx, 1.15 + 1.65, bz + 0.02);
    g.add(bd);
    lamp(g, k, bx - 4.6, bz + 0.6, 4.6, 1, warmPool, 0, 4);
    cabin(k, glow, bx + 12, bz - 0.4, 6.2, 2.6);
    k.box(1.4, 1.4, 1.4, '#2f7a8c', bx + 16.6, 0, bz - 0.4, { r: 0.12 });
    vehicle(g, 'pickup', bx + 20.5, bz + 0.8, Math.PI / 2 + 0.15);
    standing(g, bx + 3.8, bz + 1.4, 0.3, o.seed + 5, 'engineer');
  }
  g.add(k.build());
  if (glow.length) windows(g, glow);
  return { obj: g, w: W, d: D, h: board ? 5 : 2, update: anim.update, ground: () => null };
}

// ── stage 0 at sea ───────────────────────────────────────────────────────────────────────────
/** A survey vessel (hull ~15 long along x), its waterline at y = 0. */
function surveyVessel(seed: number) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const L = 15, B = 4.2;
  // hull: a box with a raised, tapered bow
  k.box(L - 2.6, 1.6, B, '#e9e4dc', -1.3, -0.9, 0, { r: 0.3 });
  k.geo(new THREE.CylinderGeometry(B / 2, B / 2, 2.6, 3, 1).rotateX(Math.PI / 2).rotateY(Math.PI / 2).scale(1.3, 0.62, 1).translate(L / 2 - 2.2, -0.1, 0), '#e9e4dc', 0.03);
  k.box(L - 2.56, 0.7, B + 0.04, P.blue, -1.3, -0.75, 0, { r: 0.05, shade: 0 });
  k.box(L - 2.4, 0.2, B + 0.06, P.blue, -1.2, 0.6, 0, { r: 0.06, shade: 0 });
  k.box(L - 2.6, 0.2, B + 0.06, P.red, -1.3, -0.95, 0, { r: 0.05, shade: 0 });
  // deck, superstructure, bridge, mast
  k.box(L - 2.8, 0.12, B - 0.2, '#8a8490', -1.2, 0.7, 0, { r: 0 });
  k.box(5.6, 2.0, B - 0.6, '#f4efe6', 2.0, 0.8, 0, { r: 0.16 });
  k.box(3.8, 1.5, B - 1.0, '#f4efe6', 2.6, 2.8, 0, { r: 0.14 });
  k.box(3.86, 0.6, B - 0.94, P.glassD, 2.6, 3.5, 0, { r: 0.05, shade: 0 });
  k.box(4.0, 0.14, B - 0.8, P.dark, 2.6, 4.3, 0, { r: 0.04 });
  k.box(0.16, 3.2, 0.16, '#d8d2cc', 2.2, 4.4, 0, { r: 0 });
  k.box(1.6, 0.12, 0.3, P.dark, 2.2, 6.4, 0, { r: 0 });
  k.box(0.6, 0.5, 0.6, '#fbf7f0', 3.4, 4.4, 0, { r: 0.1 });
  // the A-frame and winch on the aft deck
  for (const sz of [-1.6, 1.6]) k.beam(V(-L / 2 + 1.6, 0.8, sz), V(-L / 2 + 0.4, 4.0, sz * 0.8), 0.22, P.orange);
  k.beam(V(-L / 2 + 0.4, 4.0, -1.3), V(-L / 2 + 0.4, 4.0, 1.3), 0.24, P.orange);
  hcyl(k, 0.55, 1.6, '#8a8490', -L / 2 + 4.6, 1.4, 0, 'z', 12);
  k.box(1.6, 0.8, 1.6, P.yellow, -L / 2 + 4.6, 0.8, -1.2, { r: 0.08 });
  g.add(k.build());
  const win: Win = [];
  for (let i = 0; i < 4; i++) win.push([0.2 + i * 1.2, 1.9, (B - 0.6) / 2 + 0.03, 0.7, 0.5]);
  win.push([2.6, 3.8, (B - 1.0) / 2 + 0.03, 3.4, 0.45]);
  windows(g, win);
  placard(g, 'SURVEY', 4.2, -2.6, 0.05, B / 2 + 0.03, CHARTER.dark, null);
  return g;
}

/** Stage 0 out at sea: special-mark buoys bobbing in a grid and the Charter's survey vessel running lines. */
export function seaSurvey(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const r = rng(o.seed);
  const bgeo = buoyUnit().build().geometry;
  const lightGeo = new THREE.SphereGeometry(0.16, 8, 6);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) {
      const x = -W / 2 + 4 + i * ((W - 8) / 3) + (j ? 4 : 0), z = -D / 2 + 4 + j * (D - 10);
      const b = new THREE.Group();
      const m = new THREE.Mesh(bgeo, paintMat);
      m.castShadow = true;
      b.add(m);
      const lm = buoyLight.clone();
      const l = new THREE.Mesh(lightGeo, lm);
      l.position.y = 2.95;
      b.add(l);
      b.position.set(x, SEA, z);
      g.add(b);
      const ph = r() * 6.28, fl = r() * 6.28;
      anim.add((e) => {
        b.position.y = SEA + Math.sin(e.t * 1.3 + ph) * 0.12;
        b.rotation.z = Math.sin(e.t * 0.9 + ph) * 0.06;
        b.rotation.x = Math.cos(e.t * 1.1 + ph) * 0.05;
        lm.emissiveIntensity = (Math.sin(e.t * 1.6 + fl) > 0.75 ? 1 : 0) * (0.8 + e.night * 4);
      });
    }
  // the vessel runs survey lines, towing its sensor
  const boat = new THREE.Group();
  const v = surveyVessel(o.seed + 1);
  v.scale.setScalar(1.3);
  boat.add(v);
  const fk = new Kit(rng(2));
  fk.beam(V(-9.2, 4.6, 0), V(-16, -0.05, 0), 0.04, P.ink);
  fk.box(0.8, 0.3, 0.5, P.yellow, -16.2, -0.15, 0, { r: 0.08 });
  boat.add(fk.build());
  const w = wake(8, 2.2);
  w.position.set(-12, 0.04, 0);
  boat.add(w);
  flag(boat, anim, 2.8, 0, 3.4, 'charter', o.seed + 3, 8.2, 1.8);
  g.add(boat);
  const lane = [D / 2 - 7, -2];
  anim.add((e) => {
    const t = (e.t * 0.012) % 2;
    const leg = t < 1 ? t : 2 - t;
    const dir = t < 1 ? 1 : -1;
    boat.position.set(-W / 2 + 6 + leg * (W - 12), SEA + Math.sin(e.t * 0.8) * 0.06, t < 1 ? lane[0] : lane[1]);
    boat.rotation.y = dir > 0 ? 0 : Math.PI;
    boat.rotation.z = Math.sin(e.t * 0.7) * 0.025;
    boat.rotation.x = Math.sin(e.t * 0.9 + 1) * 0.02;
  });
  return { obj: g, w: W, d: D, h: 8, update: anim.update };
}

// ── the site office ──────────────────────────────────────────────────────────────────────────
/** The control centre (timber and glass under a meadow roof and a solar pergola), prefab site offices, the flag and the board. */
export function megaOffice(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const glow: Win = [];
  const bx = -W / 2 + 6.8, bz = -D / 2 + 4.4, bw = 12, bd = 6.4, fl = 3.1;
  const facade: Win = [];
  // a paved forecourt, the car park and paths
  k.box(W - 1.4, 0.08, 5.6, P.asphalt, 0, 0.0, D / 2 - 3.4, { r: 0.03, shade: 0 });
  for (let i = 0; i < 6; i++) k.box(0.1, 0.02, 2.2, '#e9e1d2', -W / 2 + 2.2 + i * 2.6, 0.09, D / 2 - 3.9, { r: 0, jitter: 0 });
  k.box(bw + 2, 0.1, 2.0, P.concrete, bx, 0, bz + bd / 2 + 1.0, { r: 0.04, shade: 0 });
  // the control centre: two storeys of timber and glass
  k.box(bw + 0.4, 0.4, bd + 0.4, P.concreteD, bx, 0, bz, { r: 0.06 });
  for (let s = 0; s < 2; s++) {
    const y = 0.35 + s * fl;
    k.box(bw, fl - 0.25, bd, P.timber, bx, y, bz, { r: 0.08, jitter: 0.04, shade: 0.1 });
    k.box(bw + 0.08, 0.25, bd + 0.08, '#e9e1d2', bx, y + fl - 0.25, bz, { r: 0.04, shade: 0 });
    // glazing on the front with timber fins
    k.box(bw - 1.2, fl - 0.9, 0.08, P.glass, bx, y + 0.3, bz + bd / 2 + 0.02, { r: 0.02, shade: 0 });
    for (let x = bx - bw / 2 + 0.6; x <= bx + bw / 2 - 0.6 + 0.01; x += 1.1) k.box(0.16, fl - 0.7, 0.36, P.timberD, x, y + 0.2, bz + bd / 2 + 0.18, { r: 0.02, jitter: 0.04 });
    facade.push([bx, y + 0.3 + (fl - 0.9) / 2, bz + bd / 2 + 0.08, bw - 1.3, fl - 1.0]);
    // vertical battens on the end walls
    for (let z = bz - bd / 2 + 0.4; z < bz + bd / 2; z += 0.5) {
      k.box(0.1, fl - 0.4, 0.14, P.timberD, bx - bw / 2 - 0.04, y + 0.05, z, { r: 0, jitter: 0.05 });
      k.box(0.1, fl - 0.4, 0.14, P.timberD, bx + bw / 2 + 0.04, y + 0.05, z, { r: 0, jitter: 0.05 });
    }
  }
  // the meadow roof and the solar pergola over it
  const ry = 0.35 + fl * 2;
  k.box(bw + 0.5, 0.35, bd + 0.5, '#5b5562', bx, ry, bz, { r: 0.06 });
  // (a gravel margin inside the kerb, a bed of substrate, then the meadow itself: grass in tufts, low shrubs,
  // a scatter of flowers: the shared plants, trees.ts)
  k.box(bw, 0.2, bd, '#a39a8c', bx, ry + 0.3, bz, { r: 0.05, jitter: 0.03 });
  k.box(bw - 0.7, 0.06, bd - 0.7, '#75803f', bx, ry + 0.48, bz, { r: 0.02, jitter: 0.05, shade: 0 });
  const rr = rng(o.seed + 7);
  const my = ry + 0.53, mw = bw - 1.1, md = bd - 1.1;
  for (let ix = 0; ix < 22; ix++) for (let iz = 0; iz < 11; iz++) {
    if (rr() < 0.1) continue;
    const x = bx - mw / 2 + ((ix + 0.1 + rr() * 0.8) / 22) * mw, z = bz - md / 2 + ((iz + 0.1 + rr() * 0.8) / 11) * md;
    plantOn(k, 'tuft', { x, y: my, z, s: 0.6 + rr() * 0.55, ry: rr() * 6.3, tint: 0.8 + rr() * 0.3 }, false);
    // flowers standing in the grass
    if (rr() < 0.16) k.geo(new THREE.IcosahedronGeometry(0.055 + rr() * 0.03, 0).translate(x + (rr() - 0.5) * 0.3, my + 0.3 + rr() * 0.14, z + (rr() - 0.5) * 0.3), rr() < 0.45 ? '#fbd46e' : rr() < 0.6 ? '#fbf7f0' : '#d08fdc', 0.06);
  }
  for (let i = 0; i < 6; i++) plantOn(k, 'shrub', { x: bx + (rr() - 0.5) * (mw - 1), y: my - 0.02, z: bz + (rr() - 0.5) * (md - 1), s: 0.34 + rr() * 0.2, ry: rr() * 6.3, tint: 0.9 + rr() * 0.2 }, false);
  for (const x of [bx - bw / 2 + 1, bx, bx + bw / 2 - 1]) for (const z of [bz - bd / 2 + 0.8, bz + bd / 2 - 0.8]) k.box(0.14, 1.9, 0.14, P.steel, x, ry + 0.5, z, { r: 0 });
  const canopy = new Kit(rng(o.seed + 8));
  for (let i = 0; i < 6; i++) canopy.box(bw / 6 - 0.08, 0.08, bd - 0.6, P.panel, bx - bw / 2 + bw / 12 + (i * bw) / 6, 0, 0, { r: 0, jitter: 0.08, shade: 0 });
  canopy.box(bw, 0.06, bd - 0.5, P.frame, bx, -0.05, 0, { r: 0, jitter: 0, shade: 0 });
  const cm = canopy.build();
  cm.position.set(0, ry + 2.5, bz);
  cm.rotation.x = 0.16;
  g.add(cm);
  // an entrance canopy and a door
  k.box(3.6, 0.22, 2.2, '#e9e1d2', bx - 2.5, 2.7, bz + bd / 2 + 1.1, { r: 0.05 });
  for (const sx of [-1.6, 1.6]) k.box(0.12, 2.6, 0.12, P.steel, bx - 2.5 + sx, 0.1, bz + bd / 2 + 2.0, { r: 0 });
  // prefab site offices stacked two high, with a stair
  const px = W / 2 - 3.6, pz = -D / 2 + 3.2;
  cabin(k, glow, px, pz, 6, 2.6);
  cabin(k, glow, px, pz, 6, 2.6, P.cream, CHARTER.field, 2.95);
  const sz = pz + 1.3 + 0.55; // the stair's centre line, in front of the cabins
  for (let i = 0; i < 9; i++) k.box(0.4, 0.1, 1.0, P.steel, px - 1.5 + i * 0.4, 0.3 + i * 0.32, sz, { r: 0 });
  k.box(1.5, 0.1, 1.1, P.steel, px + 2.75, 3.1, sz, { r: 0 });
  for (const dz of [-0.5, 0.5]) k.beam(V(px - 1.7, 0.1, sz + dz), V(px + 2.0, 3.06, sz + dz), 0.07, P.steel);
  // the handrail on the open side, the landing's posts and rail
  k.beam(V(px - 1.7, 1.1, sz + 0.5), V(px + 2.0, 4.06, sz + 0.5), 0.05, P.steel);
  for (let i = 0; i <= 3; i++) k.box(0.05, 1.0, 0.05, P.steel, px - 1.7 + i * 1.23, 0.1 + i * 0.987, sz + 0.5, { r: 0 });
  for (const x of [px + 2.05, px + 3.45]) {
    k.box(0.08, 3.1, 0.08, P.steel, x, 0, sz + 0.5, { r: 0 });
    k.box(0.05, 1.0, 0.05, P.steel, x, 3.15, sz + 0.5, { r: 0 });
  }
  k.beam(V(px + 2.05, 4.12, sz + 0.5), V(px + 3.45, 4.12, sz + 0.5), 0.05, P.steel);
  k.beam(V(px + 3.45, 4.12, sz + 0.5), V(px + 3.45, 4.12, sz - 0.5), 0.05, P.steel);
  // the flag, the board, lamps
  flag(g, anim, W / 2 - 2.4, D / 2 - 7.4, 7.5, 'charter', o.seed);
  for (const sx of [-2.6, 2.6]) k.box(0.22, 3.9, 0.22, P.timberD, 2.8 + sx, 0, D / 2 - 7.2, { r: 0.03 });
  k.box(6.4, 2.0, 0.2, CHARTER.dark, 2.8, 1.9, D / 2 - 7.3, { r: 0.04, shade: 0 });
  const board = charterBoard(o.label, 6.2);
  board.position.set(2.8, 2.9, D / 2 - 7.17);
  g.add(board);
  lamp(g, k, -W / 2 + 1.2, D / 2 - 6.6, 5, 1);
  lamp(g, k, W / 2 - 1.2, D / 2 - 1.2, 5, -1);
  g.add(k.build());
  windows(g, glow);
  windows(g, facade, winBig);
  parkedCars(g, -W / 2 + 3.5, D / 2 - 3.9, 6, 2.6, o.seed + 9, Math.PI / 2);
  // (everyone keeps north of the parked cars' noses at z = D / 2 - 6.1, and clear of the board's posts)
  strollers(g, anim, [[[bx - 2.5, bz + bd / 2 + 0.7], [bx - 2.5, bz + bd / 2 + 1.25], [bx + 2.2, bz + bd / 2 + 1.25]], [[px - 2.3, sz + 0.1], [px - 2.4, sz + 1.5], [W / 2 - 3.1, D / 2 - 8.6], [W / 2 - 3.1, D / 2 - 6.75], [4.4, D / 2 - 6.7]]], o.seed + 11);
  standing(g, 2.2, D / 2 - 6.65, 2.9, o.seed + 12, 'engineer');
  return { obj: g, w: W, d: D, h: ry + 3.4, update: anim.update, ground: () => null };
}

// ── the substation ───────────────────────────────────────────────────────────────────────────
function fencePosts(k: Kit, W: number, D: number, gate = 6) {
  const sides: [number, number, number, number][] = [[-W / 2, -D / 2, W / 2, -D / 2], [-W / 2, -D / 2, -W / 2, D / 2], [W / 2, -D / 2, W / 2, D / 2], [-W / 2, D / 2, -gate / 2, D / 2], [gate / 2, D / 2, W / 2, D / 2]];
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= m; i++) k.box(0.1, 1.3, 0.1, '#8a8490', x0 + ((x1 - x0) * i) / m, 0, z0 + ((z1 - z0) * i) / m, { r: 0, jitter: 0 });
    k.beam(V(x0, 1.28, z0), V(x1, 1.28, z1), 0.05, '#8a8490');
  }
}

/** A dead-tank circuit breaker (a tank on legs with two bushings), x along the bay. */
function breaker(k: Kit, x: number, z: number) {
  for (const sx of [-0.5, 0.5]) k.box(0.1, 1.6, 0.1, P.steelD, x + sx, 0, z, { r: 0 });
  hcyl(k, 0.38, 1.5, '#8a8f80', x, 1.95, z);
  for (const sx of [-0.45, 0.45]) k.cyl(0.07, 0.14, 1.3, P.porcelain, x + sx, 2.1, z, 7, { shade: 0 });
}

/** A big HV substation yard: three power transformers between firewalls, breakers, gantries, busbars, the relay house and a line tower. */
export function megaSub(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const glow: Win = [];
  yard(k, W - 0.8, D - 0.8);
  fencePosts(k, W - 0.8, D - 0.8, 6);
  fenceMesh(g, W - 0.8, D - 0.8, 6);
  // transformers in a row with firewalls between
  const tz = D / 2 - 6.2;
  for (let i = 0; i < 3; i++) {
    const x = -6 + i * 7;
    transformer(k, x, tz, 1.25, CHARTER.field);
    if (i < 2) k.box(0.4, 4.4, 4.2, P.concrete, x + 3.5, 0, tz, { r: 0.05 });
  }
  // the bays: breakers, insulator posts carrying busbars, gantries over them
  const ins: THREE.Matrix4[] = [];
  for (let b = 0; b < 4; b++) {
    const x = -9 + b * 6;
    breaker(k, x, -1.6);
    for (const z of [-4.8, 1.4]) ins.push(xf(x, 0, z, 0, 0, 1.1, 0, 3.6));
  }
  g.add(instances(insulatorUnit(), ins));
  for (const z of [-4.8, 1.4]) hcyl(k, 0.11, 19, P.silver, -0.5, 3.62, z, 'x', 8);
  gantry(k, -0.5, -7.6, 20, 9);
  gantry(k, -0.5, 4.2, 20, 7.5);
  // the relay house
  const hx = -W / 2 + 4.6, hz = D / 2 - 4.4;
  k.box(6.4, 3.0, 4.0, P.wall, hx, 0, hz, { r: 0.12 });
  k.box(6.5, 0.32, 4.1, CHARTER.field, hx, 2.7, hz, { r: 0.04, shade: 0 });
  k.box(6.7, 0.2, 4.3, P.roof, hx, 3.0, hz, { r: 0.04, shade: 0 });
  for (let i = 0; i < 3; i++) {
    k.box(1.0, 0.8, 0.06, P.glassD, hx - 2 + i * 2, 1.4, hz + 2.01, { r: 0.02, shade: 0 });
    glow.push([hx - 2 + i * 2, 1.8, hz + 2.06, 0.9, 0.7]);
  }
  // the line tower at the back, wires to the gantry and away
  const tw = latticeTower(k, W / 2 - 4, -D / 2 + 3, 18, 3.6);
  for (const [y, a] of tw.arms) for (const s of [-1, 1]) {
    sagWires(k, V(W / 2 - 4 + s * a, y, -D / 2 + 3), V(-0.5 + s * 6, 8.7, -7.6), 0.6);
    sagWires(k, V(W / 2 - 4 + s * a, y, -D / 2 + 3), V(W / 2 - 4 + s * a, y - 3, -D / 2 - 2), 0.3, 0.05, '#3a3442', 3);
  }
  beacon(g, W / 2 - 4, 18.5, -D / 2 + 3, 0.8);
  floodMast(g, k, -W / 2 + 1.2, -D / 2 + 1.2, 10, Math.PI * 0.25);
  floodMast(g, k, W / 2 - 1.2, D / 2 - 1.4, 10, -Math.PI * 0.75);
  vehicle(g, 'pickup', 3, D / 2 - 1.8, 0);
  standing(g, -3, D / 2 - 2.6, 0.5, o.seed + 2, 'engineer');
  g.add(k.build());
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 19, ground: () => null };
}

// ── the HVDC converter station ───────────────────────────────────────────────────────────────
/** A valve hall (x0..x1, z0..z1), clad up to `clad` (0..1) of its height, roofed if `roof`. */
function valveHall(k: Kit, x0: number, x1: number, z0: number, z1: number, H: number, clad: number, roof: boolean, frame: boolean) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  k.box(w + 0.6, 0.45, d + 0.6, P.concreteD, cx, 0, cz, { r: 0.06 });
  if (frame) {
    for (let x = x0; x <= x1 + 0.01; x += w / 4) for (const z of [z0, z1]) k.box(0.3, H, 0.3, '#8a8490', x, 0.4, z, { r: 0 });
    for (const z of [z0, z1]) for (let y = 3; y < H; y += 3.2) k.box(w, 0.2, 0.2, '#8a8490', cx, 0.4 + y, z, { r: 0 });
    for (let x = x0; x <= x1 + 0.01; x += w / 4) k.box(0.24, 0.5, d, '#7a7186', x, H + 0.1, cz, { r: 0 });
  }
  const ch = Math.max(0.6, clad * H);
  k.box(w, ch, d, '#e0dbd2', cx, 0.4, cz, { r: 0.14, jitter: 0.02, shade: 0.15 });
  const ribs = Math.floor(w / 0.9);
  for (let i = 0; i <= ribs; i++) {
    const x = x0 + 0.3 + (i * (w - 0.6)) / ribs;
    k.box(0.16, ch - 0.6, 0.1, '#cbc4b9', x, 0.7, z1 + 0.02, { r: 0, jitter: 0.01, shade: 0 });
    k.box(0.16, ch - 0.6, 0.1, '#cbc4b9', x, 0.7, z0 - 0.02, { r: 0, jitter: 0.01, shade: 0 });
  }
  if (roof) {
    k.box(w + 0.3, 0.6, d + 0.3, '#5b5562', cx, H + 0.4, cz, { r: 0.08, shade: 0 });
    k.box(w + 0.06, 0.6, d + 0.06, CHARTER.field, cx, H - 0.8, cz, { r: 0.04, shade: 0 });
  }
}

/** HVDC converter station: two valve halls, converter transformers, AC filters and the DC yard (a forest of insulators), the DC line out. */
export function converter(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const building = o.variant === 'building';
  const p = building ? Math.max(0.2, o.p ?? 0.5) : 1;
  const k = new Kit(rng(o.seed));
  const glow: Win = [];
  const acc = o.accent || P.orange, hi = o.hi || P.yellow;
  yard(k, W - 0.8, D - 0.8);
  const H = 10.5;
  const halls: [number, number][] = [[-W / 2 + 1.5, -W / 2 + 12.5], [-W / 2 + 13.5, -W / 2 + 24.5]];
  const hz0 = -D / 2 + 1.5, hz1 = -D / 2 + 10.5;
  for (const [i, [x0, x1]] of halls.entries()) {
    const clad = building ? Math.min(1, Math.max(0.1, (p - i * 0.12) * 1.15)) : 1;
    valveHall(k, x0, x1, hz0, hz1, H, clad, !building || p >= 0.75, building);
    if (!building) {
      for (let j = 0; j < 5; j++) {
        const x = x0 + 1.5 + j * ((x1 - x0 - 3) / 4);
        k.box(1.2, 0.7, 0.06, '#16141f', x, 6.6, hz1 + 0.04, { r: 0.02, shade: 0 });
      }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 2.0, 0.5), cyanMat);
      m.position.set((x0 + x1) / 2, 6.95, hz1 + 0.09);
      g.add(m);
    }
    // converter transformers along the front, bushings into the hall
    if (!building || p >= 0.5) {
      for (let j = 0; j < 3; j++) {
        const x = x0 + 2 + j * 3.5;
        transformer(k, x, hz1 + 2.8, 0.9, CHARTER.field, 0);
        k.beam(V(x, 4.2, hz1 + 2.6), V(x, 5.6, hz1 + 0.1), 0.24, P.porcelain);
      }
      k.box(x1 - x0, 3.2, 0.4, P.concrete, (x0 + x1) / 2, 0, hz1 + 4.9, { r: 0.04 });
    }
  }
  if (!building) {
    placard(g, 'HVDC', 4.4, (halls[0][0] + halls[0][1]) / 2, 8.6, hz1 + 0.06, '#5fd3b5', '#16141f', 0, true);
    placard(g, o.label, Math.min(9, 1.0 * o.label.length + 1), (halls[1][0] + halls[1][1]) / 2, 8.6, hz1 + 0.06, P.yellow, '#16141f', 0, true);
  }
  // the AC filter yard (in front) and the DC yard (right): rows of insulator stacks under busbars
  const ins: THREE.Matrix4[] = [];
  const reach = (i: number, n: number) => !building || i / n < p * 0.9;
  const fz0 = hz1 + 6.6, cols = 9;
  let idx = 0;
  const total = cols * 3 + 24;
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < cols; i++) {
      const x = -W / 2 + 2.4 + i * 2.6, z = fz0 + j * 2.4;
      if (z > D / 2 - 1.5 || !reach(idx++, total)) continue;
      ins.push(xf(x, 0, z, 0, 0, 1.1, 0, 2.6));
      k.box(0.9, 0.9, 0.7, '#b9c2c4', x, 2.6, z, { r: 0.05 });
      k.box(0.9, 0.9, 0.7, '#a9b2b4', x, 3.55, z, { r: 0.05 });
      ins.push(xf(x, 4.45, z, 0, 0, 0.8, 0, 1.3));
    }
  const dx0 = W / 2 - 9.6;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 3; i++) {
      const x = dx0 + i * 2.6, z = -D / 2 + 3 + j * 3.2;
      if (!reach(idx++, total)) continue;
      ins.push(xf(x, 0, z, 0, 0, 1.25, 0, 4.2));
      if ((i + j) % 3 === 1) {
        // a smoothing reactor drum on top
        k.cyl(0.95, 0.95, 1.6, '#8a959a', x, 4.25, z, 14, { shade: 0.08 });
        k.cyl(1.0, 1.0, 0.16, '#5b5562', x, 5.8, z, 14, { shade: 0 });
      } else k.cyl(0.08, 0.08, 1.0, P.silver, x, 4.2, z, 6, { shade: 0 });
    }
  g.add(instances(insulatorUnit(), ins));
  if (!building || p >= 0.75) {
    for (let j = 0; j < 4; j++) hcyl(k, 0.09, 6.2, P.silver, dx0 + 2.6, 5.0, -D / 2 + 3 + j * 3.2, 'x', 8);
    for (let j = 0; j < 3; j++) hcyl(k, 0.08, cols * 2.6, P.silver, -W / 2 + 2.4 + (cols - 1) * 1.3, 4.9, fz0 + j * 2.4, 'x', 8);
  }
  // the DC line tower: two arms, two bundles, the line out over the back fence
  const px = W / 2 - 2.6, pz = -D / 2 + 2.2, ph = 20;
  if (!building) {
    const tw = latticeTower(k, px, pz, ph, 3.8, '#8a8490', 0, Math.PI / 2);
    for (const s of [-1, 1]) {
      const y = tw.arms[0][0];
      sagWires(k, V(px, y, pz + s * 3.5), V(dx0 + 5.2, 6.0, -D / 2 + 3 + (s + 1) * 1.6), 0.5);
      sagWires(k, V(px, y, pz + s * 3.5), V(px + 9, y - 4, pz + s * 3.5), 0.3, 0.06, '#3a3442', 4);
    }
    beacon(g, px, ph + 0.6, pz, 0.3);
  } else latticeTower(k, px, pz, ph * Math.min(1, p + 0.1), 3.8, '#8a8490', 0, Math.PI / 2);
  // control building
  const cx = W / 2 - 5.6, cz = D / 2 - 3.6;
  if (!building || p >= 0.5) {
    k.box(7.4, 3.4, 4.0, P.wall, cx, 0, cz, { r: 0.12 });
    k.box(7.5, 0.36, 4.1, CHARTER.field, cx, 3.0, cz, { r: 0.04, shade: 0 });
    k.box(7.7, 0.22, 4.3, P.roof, cx, 3.4, cz, { r: 0.04, shade: 0 });
    for (let i = 0; i < 3; i++) {
      k.box(1.2, 0.9, 0.06, P.glassD, cx - 2.3 + i * 2.3, 1.5, cz + 2.01, { r: 0.02, shade: 0 });
      if (!building) glow.push([cx - 2.3 + i * 2.3, 1.95, cz + 2.06, 1.1, 0.8]);
    }
  }
  if (building) {
    // the builder's site: hoarding, a tower crane, cabins, flags, laydown, a crew
    hoarding(k, -W / 2 + 0.4, W / 2 - 0.4, D / 2 - 0.3, acc, hi, [[-4, 4]]);
    const crane = towerCrane(26, 22, acc, hi, o.seed + 3);
    crane.position.set(-W / 2 + 13, 0, hz0 + 5);
    g.add(crane);
    const ph2 = o.seed % 6;
    anim.add((e) => workCrane(crane, e, ph2, 1.0, 12));
    cabin(k, glow, -W / 2 + 4.4, D / 2 - 2.6, 6, 2.4, P.cream, acc);
    cabin(k, glow, -W / 2 + 4.4, D / 2 - 2.6, 6, 2.4, P.cream, acc, 2.85);
    // (laydown, trucks and crew keep to ground that stays clear to the end: the filter yard, the transformers and
    // their fire wall, the DC yard and the control building all arrive where a truck could stand early on)
    laydown(k, 3, D / 2 - 2.3, 7, 2.2, o.seed + 4, ['rebar', 'crate', 'pipe']);
    flag(g, anim, -5.4, D / 2 - 0.8, 5.5, { a: acc, b: hi }, o.seed + 1, 0, 1.8);
    flag(g, anim, 5.4, D / 2 - 0.8, 5.5, { a: acc, b: hi }, o.seed + 2, 0, 1.8);
    vehicle(g, 'flatbed', W / 2 - 5.6, 2.5, 0);
    // the mixer pours the transformer plinths and the fire wall, then the control building's slab
    if (p < 0.5) vehicle(g, 'mixer', -1, hz1 + 3, Math.PI);
    else vehicle(g, 'mixer', W / 2 - 5.8, 5.5, Math.PI);
    standing(g, p < 0.5 ? -2 : 7.3, p < 0.5 ? hz1 + 5.2 : 4.4, 0.4, o.seed + 6);
    standing(g, 6.9, D / 2 - 5.6, -1.2, o.seed + 7);
    standing(g, -W / 2 + 8.6, D / 2 - 2.2, 2.2, o.seed + 8);
  } else {
    fencePosts(k, W - 0.8, D - 0.8, 6);
    fenceMesh(g, W - 0.8, D - 0.8, 6);
    floodMast(g, k, -W / 2 + 1.2, D / 2 - 1.2, 11, Math.PI * 0.75);
    floodMast(g, k, 1, -D / 2 + 12, 11, Math.PI);
    vehicle(g, 'pickup', cx - 6.5, cz + 0.5, 0);
    standing(g, cx - 3, cz + 2.6, 0.3, o.seed + 9, 'engineer');
  }
  g.add(k.build());
  if (glow.length) windows(g, glow);
  return { obj: g, w: W, d: D, h: building ? 29 : 21, update: anim.update, ground: () => null };
}
