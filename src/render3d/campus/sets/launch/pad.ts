/**
 * The launch pad: a raised concrete hardstand over a flame trench, the launch mount, a lattice
 * service tower with swing arms and a lift shaft in the builder's colours and a slewing crane on
 * top, the deluge water tower, three lightning masts with their catenary, floodlights, and the
 * heavy lifter in the builder's livery. 'liftoff' runs the launch cycle (`cycle:P:O` = every P s,
 * O s ahead): the booster comes back down on its engines and lands on the mount → a transporter
 * brings the next upper stack up the ramp → the tower's crane lifts it onto the booster → the
 * arms swing in, it vents → arms away → deluge → ignition (exhaust bursts from the trench, orange
 * light floods the pad) → liftoff (it climbs, accelerates and pitches out to sea on a long trail).
 * Nothing appears from nowhere. 'building' = the pad under construction (by `p`).
 */
import * as THREE from 'three';
import { Kit, lightPool, poolMat, poolMats, rng, type Paint } from '../../../kit';
import { Plume } from '../../../fx';
import { crane, siteClutter, scaffold, type Env, type Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { lampMat, litSign } from '../geneva/common';
import { beacon, fit } from '../geneva/secretariat';
import { Billow, flame, latticeMast, latticeTower, rocket, rocketMaterial, ROCKET, sag, V } from './common';

const CONCRETE: Paint = '#cfc8be';
const SOOT: Paint = '#4e4148';
const STEEL: Paint = '#8a8490';

/** Seconds into the cycle when the engines light (as the pixel game's igniteAt). */
export const igniteAt = (period: number) => Math.max(8.5, period - 11.5);

export function launchPad(o: Act3SetOpts): Piece {
  const variant = o.variant ?? '';
  const building = variant === 'building';
  const p = building ? Math.max(0, Math.min(1, o.p ?? 0)) : 1;
  let period = 0, offset = 0;
  if (variant === 'liftoff') period = 26;
  else if (variant.startsWith('cycle:')) {
    const [, P, O] = variant.split(':');
    period = Math.max(12, Number(P) || 20);
    offset = Number(O) || 0;
  }
  const g = new THREE.Group();
  g.name = 'set:launchPad';
  const k = new Kit(rng(o.seed));
  const accent = o.accent ?? '#df5f3e', hi = o.hi ?? '#f08a46';
  const label = o.label || 'LAUNCH';
  const RX = 2, RZ = -2; // the rocket
  const DECK = 1.4, MOUNT = 2.7;
  const TZ = -9.2, TS = 3.4, TH = 44; // the service tower: centre z, width, height
  // ── the hardstand: two slabs either side of the flame trench, a ramp up from the front ──
  const X0 = -13, X1 = 17;
  k.box(X1 - X0, DECK, 12, CONCRETE, (X0 + X1) / 2, 0, 6, { r: 0.35, jitter: 0.02, shade: 0.25 });
  k.box(X1 - X0, DECK, 12, CONCRETE, (X0 + X1) / 2, 0, -10, { r: 0.35, jitter: 0.02, shade: 0.25 });
  // (the plot's paving is 0.12 thick: what lies on the ground has its top above that, or it is buried in it)
  k.box(X1 - X0 + 2, 0.08, 4.2, '#2f2a3d', (X0 + X1) / 2, 0.06, -2, { r: 0, jitter: 0 });
  for (const z of [-3.92, -0.08]) k.box(X1 - X0 - 0.4, DECK - 0.1, 0.06, SOOT, (X0 + X1) / 2, 0.05, z, { r: 0, jitter: 0.03, shade: 0.5 });
  // soot fans in front of the trench mouths
  if (!building) for (const [x, w] of [[X0 - 2.6, 5.2], [X1 + 1.6, 3.2]] as const) k.box(w, 0.04, 6.4, '#6a6070', x, 0.135, -2, { r: 0, jitter: 0.05, shade: 0 });
  // the ramp from the crawlerway
  const ramp = new THREE.BoxGeometry(10, 0.5, Math.hypot(6, DECK)).rotateX(Math.atan2(DECK, 6)).translate(RX, DECK / 2 - 0.2, 15);
  k.geo(ramp, '#bdb3a6', 0.02);
  for (const x of [RX - 3.6, RX + 3.6]) k.box(1.2, 0.06, 6, '#a39a91', x, 0.09, 15, { r: 0, jitter: 0 });
  // expansion joints, soot round the mount, tie-down points
  for (let x = X0 + 3; x < X1 - 1; x += 3) for (const z of [6, -10]) k.box(0.06, 0.012, 11.8, '#b3aa9e', x, DECK, z, { r: 0, jitter: 0, shade: 0 });
  for (const z of [3, 9, -7, -13]) k.box(X1 - X0 - 0.4, 0.012, 0.06, '#b3aa9e', (X0 + X1) / 2, DECK, z, { r: 0, jitter: 0, shade: 0 });
  if (!building) for (const [z, t0] of [[0, Math.PI], [-4, 0]] as const) {
    k.geo(new THREE.CircleGeometry(7.2, 24, t0, Math.PI).rotateX(-Math.PI / 2).translate(RX, DECK + 0.016, z), '#9a929a', 0.03);
    k.geo(new THREE.CircleGeometry(4.6, 20, t0, Math.PI).rotateX(-Math.PI / 2).translate(RX, DECK + 0.022, z), '#6f6676', 0.03);
  }
  for (const [x, z] of [[-9, 9], [13, 9], [-9, -13], [13, -13]] as const) k.cyl(0.4, 0.4, 0.12, '#7a7186', x, DECK, z, 8);
  // deck markings: safety lines and the pad's number
  for (const z of [0.6, -4.6]) k.box(X1 - X0 - 2, 0.015, 0.18, 'yel0', (X0 + X1) / 2, DECK, z, { r: 0, jitter: 0, shade: 0 });
  const num = fit(litSign(`PAD ${o.n ?? 1}`, 6, '#433c52', null, 0), 6.4, 2.2);
  num.rotation.x = -Math.PI / 2;
  num.position.set(RX + 8.4, DECK + 0.03, 8.4);
  g.add(num);
  // ── the launch mount over the trench ──
  if (p >= 0.5) {
    k.box(6.6, MOUNT - DECK, 7.2, '#5b5562', RX, DECK, RZ, { r: 0.12, shade: 0.35 });
    k.box(7.0, 0.22, 7.6, '#433c52', RX, MOUNT - 0.22, RZ, { r: 0.05, shade: 0 });
    for (let i = 0; i < 4; i++) {
      const t = Math.PI / 4 + (i * Math.PI) / 2;
      k.box(0.5, 0.9, 0.5, '#2f2a3d', RX + Math.sin(t) * 1.75, MOUNT, RZ + Math.cos(t) * 1.75, { r: 0.05, ry: t });
    }
    // deluge pipes round the mount
    for (const x of [RX - 3.7, RX + 3.7]) k.cyl(0.22, 0.22, 7.0, '#9d95a6', x, MOUNT - 0.55, RZ - 3.5, 8, { rx: Math.PI / 2 });
  }
  // ── the service tower: lattice, lift shaft in the builder's colour, platforms, a rod on top ──
  const towerH = TH * Math.min(1, p / 0.75);
  const lv = Math.max(0, Math.floor(towerH / 3.5));
  if (lv > 0) {
    const h = lv * 3.5;
    latticeTower(k, RX, DECK, TZ, TS, h, 3.5, STEEL, 0.26, 0.09);
    k.box(1.3, h, 1.3, accent, RX - 0.4, DECK, TZ - 0.3, { r: 0.05, jitter: 0.02, shade: 0.15 });
    for (let y = 7; y < h; y += 7) k.box(TS + 0.5, 0.14, TS + 0.5, '#5b5562', RX, DECK + y, TZ, { r: 0, jitter: 0 });
    k.box(0.5, h, 0.5, '#d8cfc3', RX + 1.1, DECK, TZ - 1.0, { r: 0.04 }); // propellant risers
    if (p >= 1) {
      k.box(TS + 0.8, 0.5, TS + 0.8, '#5b5562', RX, DECK + h, TZ, { r: 0.05 });
      k.cyl(0.1, 0.16, 6.2, '#9d95a6', RX, DECK + h + 0.5, TZ, 6);
      beacon(g, RX, DECK + h + 6.9, TZ, 0.3);
      // the builder's name on a panel near the top
      k.box(TS + 0.2, 2.2, 0.2, accent, RX, DECK + h - 5.5, TZ + TS / 2 + 0.15, { r: 0.04 });
      const nm = fit(litSign(label, 6, '#fbf7f0', null, 0.6), TS - 0.2, 1.4);
      nm.position.set(RX, DECK + h - 4.4, TZ + TS / 2 + 0.27);
      g.add(nm);
    }
  }
  // ── the swing arms (crew/payload, upper and lower propellant) ──
  const arms: { pivot: THREE.Group; out: number; at: number }[] = [];
  if (!building) {
    const armKit = (len: number, room: boolean, seed: number) => {
      const ak = new Kit(rng(seed));
      for (const [x, y] of [[0.15, 0], [1.05, 0], [0.15, 0.9], [1.05, 0.9]] as const) ak.box(0.12, 0.12, len, STEEL, x, y, len / 2, { r: 0, jitter: 0 });
      for (let z = 0.5; z < len; z += 0.9) { ak.beam(V(0.15, 0, z), V(1.05, 0.9, z + 0.45), 0.06, STEEL); ak.beam(V(0.15, 0.9, z), V(1.05, 0, z + 0.45), 0.06, STEEL); }
      ak.box(1.1, 0.08, len, '#5b5562', 0.6, 0, len / 2, { r: 0, jitter: 0 });
      if (room) ak.box(1.7, 2.1, 1.3, '#f3eee6', 0.6, -0.1, len - 0.4, { r: 0.1 });
      else ak.cyl(0.16, 0.16, len, '#2f2a3d', 0.6, -0.25, 0, 6, { rx: Math.PI / 2 });
      return ak.build();
    };
    const L = (RZ - ROCKET.R) - (TZ + TS / 2) - 0.1;
    for (const [y, room, out] of [[MOUNT + 31.5, true, -1.7], [MOUNT + 25, false, -1.55], [MOUNT + 13, false, -1.55]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(RX - 0.6, y, TZ + TS / 2);
      pivot.add(armKit(L, room, o.seed + y));
      g.add(pivot);
      arms.push({ pivot, out, at: y });
    }
  }
  // ── the deluge water tower ──
  if (p >= 0.75) {
    const WX = 13.6, WZ = -12.4, WH = 15;
    for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [1.9, 1.9], [-1.9, 1.9]] as const) k.box(0.3, WH, 0.3, STEEL, WX + dx, DECK, WZ + dz, { r: 0, jitter: 0 });
    for (let y = 2.5; y < WH; y += 3.2) {
      k.box(4.1, 0.14, 0.14, STEEL, WX, DECK + y, WZ - 1.9, { r: 0 });
      k.box(4.1, 0.14, 0.14, STEEL, WX, DECK + y, WZ + 1.9, { r: 0 });
      k.box(0.14, 0.14, 4.1, STEEL, WX - 1.9, DECK + y, WZ, { r: 0 });
      k.box(0.14, 0.14, 4.1, STEEL, WX + 1.9, DECK + y, WZ, { r: 0 });
    }
    k.cyl(3.0, 3.0, 5.2, '#f3eee6', WX, DECK + WH, WZ, 24, { shade: 0.15 });
    k.cyl(3.02, 3.02, 0.8, '#345c96', WX, DECK + WH + 2.0, WZ, 24, { shade: 0 });
    k.cyl(0.4, 3.1, 1.3, '#e6e0e3', WX, DECK + WH + 5.2, WZ, 24);
    k.cyl(0.45, 0.45, WH, '#9d95a6', WX, DECK, WZ, 8);
    k.box(0.5, 0.5, 11, '#9d95a6', WX - 5.8, DECK + 0.4, WZ + 5.6, { r: 0.05, ry: 0.85 });
    beacon(g, WX, DECK + WH + 6.7, WZ, 1.9);
  }
  // ── lightning masts with the catenary up to the tower's rod ──
  const masts: [number, number][] = [[-17.2, -17.2], [18.6, -17.2], [18.6, 16.4]];
  const MH = 46;
  if (p >= 0.5) {
    const mh = p >= 1 ? MH : MH * (p - 0.5) * 2;
    for (const [i, [x, z]] of masts.entries()) {
      latticeMast(k, x, 0, z, mh, 1.0, '#9d95a6', 2.0);
      k.box(1.6, 0.4, 1.6, '#a39a91', x, 0, z, { r: 0.05 });
      if (p >= 1) beacon(g, x, mh + 0.3, z, i * 1.1);
    }
    if (p >= 1) {
      sag(k, V(masts[0][0], MH, masts[0][1]), V(masts[1][0], MH, masts[1][1]), 3, 0.05);
      sag(k, V(masts[1][0], MH, masts[1][1]), V(masts[2][0], MH, masts[2][1]), 3, 0.05);
    }
  }
  // ── floodlights, pipes off to the tank farm ──
  const flood = lampMat('yel2', 3);
  const fpool = poolMat('#ffe6c0', 0.6);
  for (const [x, z, h] of [[-11.5, 14.5, 15], [16.2, 6.5, 13]] as const) {
    k.box(0.3, h, 0.3, '#7a7186', x, 0, z, { r: 0 });
    k.box(2.6, 0.2, 0.6, '#5b5562', x, h, z, { r: 0 });
    for (const dx of [-0.8, 0, 0.8]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.25), flood);
      l.position.set(x + dx, h + 0.45, z);
      l.lookAt(RX, 18, RZ);
      g.add(l);
    }
  }
  lightPool(g, RX, DECK, RZ + 3, 9, fpool, 1.3);
  for (const y of [DECK + 1.0, DECK + 2.0]) k.cyl(0.24, 0.24, 13, '#d8cfc3', 19.8, y, -6.4, 8, { rz: Math.PI / 2 });
  for (let x = 6; x < 19; x += 3) k.box(0.2, 2.2, 0.6, STEEL, x, DECK, -6.4, { r: 0 });
  // tower lights
  const tl = lampMat('yel1', 2.2);
  if (lv > 0)
    for (let y = 7; y < lv * 3.5; y += 7)
      for (const dx of [-TS / 2 - 0.2, TS / 2 + 0.2]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), tl);
        m.position.set(RX + dx, DECK + y + 0.4, TZ + TS / 2);
        g.add(m);
      }
  // ── under construction: a crane, scaffold, a site board ──
  let craneTop: THREE.Object3D | null = null;
  if (building) {
    const c = crane(Math.max(14, towerH + 12), 20, o.seed + 3);
    c.position.set(-9.5, DECK, TZ - 1.5);
    g.add(c);
    craneTop = c.userData.top as THREE.Object3D;
    if (lv > 0) {
      const sc = scaffold(TS + 1.6, Math.min(towerH, lv * 3.5) * 0.6 + 1, TS + 1.6, o.seed + 4);
      sc.position.set(RX, DECK, TZ);
      g.add(sc);
    }
    const cl = siteClutter(38, 38, o.seed + 5);
    g.add(cl);
    k.box(7, 2.4, 0.16, accent, -12, 0.6, 18.4, { r: 0.04 });
    for (const x of [-15, -9]) k.box(0.14, 0.7, 0.14, '#5b5562', x, 0, 18.4, { r: 0 });
    const bd = fit(litSign(label, 6, '#fbf7f0', null, 0.3), 6.2, 1.2);
    bd.position.set(-12, 1.8, 18.5);
    g.add(bd);
    if (p < 0.25) for (const z of [6, -10]) for (let x = X0 + 1; x < X1; x += 2) k.box(0.06, 0.9, 0.06, '#7d5232', x, DECK, z + 5.8, { r: 0 });
  }
  g.add(k.build());
  // ── the tower's crane: a slewing jib with a trolley and a hook, parked clear of the flight path ──
  const JY = DECK + TH + 0.5; // the slew ring, on the tower's top platform
  const REACH = 15.6, PARK = -1.78;
  const slew = new THREE.Group();
  const trolley = new THREE.Group();
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 5).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0x2f2a3d, roughness: 0.8 }));
  const hook = new THREE.Group();
  if (!building) {
    const ck = new Kit(rng(o.seed + 21));
    ck.cyl(1.5, 1.7, 0.5, '#5b5562', 0, 0, 0, 16);
    ck.box(1.5, 1.5, 1.7, accent, -1.45, 0.5, 0.2, { r: 0.12 }); // the driver's cab
    ck.box(1.0, 0.5, 0.06, '#27304a', -1.45, 1.2, 1.06, { r: 0, jitter: 0, shade: 0 });
    // the jib: three chords and their lacing, the counter-jib with its ballast
    const J0 = -6.2, J1 = REACH + 1.6;
    for (const [x, y] of [[-0.55, 0.55], [0.55, 0.55], [0, 1.75]] as const) ck.beam(V(x, y, J0), V(x, y, J1), 0.16, '#e9c44a');
    for (let z = J0; z < J1 - 0.1; z += 1.3) {
      const z1 = Math.min(J1, z + 1.3);
      ck.beam(V(-0.55, 0.55, z), V(0, 1.75, z1), 0.07, '#e9c44a');
      ck.beam(V(0.55, 0.55, z), V(0, 1.75, z1), 0.07, '#e9c44a');
      ck.beam(V(-0.55, 0.55, z), V(0.55, 0.55, z1), 0.07, '#e9c44a');
    }
    ck.box(1.9, 1.5, 2.4, '#6f6676', 0, -0.15, J0 + 1.3, { r: 0.1, shade: 0.2 });
    // the tower head and the ties down to the jib and the counter-jib
    ck.box(0.5, 4.4, 0.5, '#e9c44a', 0, 0.5, 0, { r: 0.04 });
    ck.beam(V(0, 4.9, 0), V(0, 1.75, J1 - 4), 0.07, '#433c52');
    ck.beam(V(0, 4.9, 0), V(0, 1.75, J0 + 1), 0.07, '#433c52');
    slew.add(ck.build());
    slew.position.set(RX, JY, TZ);
    slew.rotation.y = PARK;
    const tk = new Kit(rng(o.seed + 22));
    tk.box(1.5, 0.4, 1.3, '#433c52', 0, 0.12, 0, { r: 0.06 });
    trolley.add(tk.build());
    trolley.add(cable);
    const hk = new Kit(rng(o.seed + 23));
    hk.box(0.7, 0.8, 0.5, '#f7b258', 0, 0, 0, { r: 0.1 });
    hk.cyl(0.12, 0.12, 0.5, '#2f2a3d', 0, -0.5, 0, 6);
    // the lifting frame that grips the fairing's nose
    hk.box(2.2, 0.16, 0.3, '#433c52', 0, -0.62, 0, { r: 0.03 });
    hk.box(0.3, 0.16, 2.2, '#433c52', 0, -0.62, 0, { r: 0.03 });
    hook.add(hk.build());
    trolley.add(hook);
    trolley.position.z = 7.2;
    slew.add(trolley);
    g.add(slew);
    beacon(g, RX, JY + 5.6, TZ, 0.9);
  }
  /** Hang the hook `len` under the trolley. */
  const reeve = (len: number) => { cable.scale.y = Math.max(0.3, len); hook.position.y = -Math.max(0.3, len); };
  reeve(2.6);
  // ── the transporter that brings the next upper stack up the ramp ──
  const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, transparent: true });
  const spmt = new THREE.Group();
  const CRADLE = 1.62; // where the stack's base rests, over the transporter's ground line
  if (!building && period > 0) {
    const sk = new Kit(rng(o.seed + 24));
    sk.box(3.4, 0.5, 6.0, '#e9c44a', 0, 0.55, 0, { r: 0.1, shade: 0.2 });
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) sk.box(0.5, 0.62, 0.72, '#2f2a3d', sx * 1.25, 0, -2.5 + i, { r: 0.2, jitter: 0.02 });
    sk.box(1.3, 0.8, 1.0, '#f3eee6', 0.9, 1.05, 2.3, { r: 0.1 }); // the power pack
    sk.box(1.0, 0.36, 0.06, '#27304a', 0.9, 1.4, 2.81, { r: 0, jitter: 0, shade: 0 });
    sk.cyl(1.75, 1.9, 0.3, '#5b5562', 0, 1.05, -0.4, 20);
    sk.cyl(1.55, 1.55, 0.27, '#433c52', 0, 1.35, -0.4, 20);
    for (let i = 0; i < 4; i++) {
      const t = Math.PI / 4 + (i * Math.PI) / 2;
      sk.beam(V(Math.sin(t) * 1.6, 1.3, -0.4 + Math.cos(t) * 1.6), V(Math.sin(t) * 1.48, 3.3, -0.4 + Math.cos(t) * 1.48), 0.12, '#9d95a6');
    }
    spmt.add(sk.build(tmat));
    spmt.visible = false;
    g.add(spmt);
  }
  // ── the rocket and its launch ──
  const rmat = rocketMaterial();
  const rk = rocket(o.seed + 9, accent, hi, label, rmat);
  rk.position.set(RX, MOUNT, RZ);
  rk.rotation.y = 0.2;
  const up = rk.userData.upper as THREE.Group;
  const SPLIT = rk.userData.split as number, TOP = rk.userData.top as number;
  const fl = flame();
  fl.obj.position.y = 0.1;
  rk.add(fl.obj);
  if (!building) g.add(rk);
  const fades = rk.userData.fadeMats as THREE.Material[];
  // (thin enough, and its puffs small enough, that the pad and the rocket show through the cloud)
  const billow = new Billow(1100, { drag: 0.9, rise: 0.55, wind: 1.6, opacity: 0.74 });
  g.add(billow.obj);
  const vents = [new Plume({ count: 12, life: 3.2, rise: 0.35, spread: 0.5, size0: 0.6, size1: 2.6, opacity: 0.6, radius: 0.2, wind: 1.1 }, o.seed + 11),
    new Plume({ count: 10, life: 2.6, rise: 0.3, spread: 0.4, size0: 0.5, size1: 2.0, opacity: 0.55, radius: 0.2, wind: 1.1 }, o.seed + 12)];
  vents[0].obj.position.set(RX + ROCKET.R + 0.1, MOUNT + 28.4, RZ);
  vents[1].obj.position.set(RX - ROCKET.R - 0.1, MOUNT + 21.2, RZ + 0.3);
  if (!building) for (const v of vents) g.add(v.obj);
  // the orange light of the burn: a real light on the first pad, a glow on the ground on every pad
  const light = !building && period > 0 && (o.n ?? 1) <= 1 ? new THREE.PointLight(0xff9a40, 0, 140, 1.7) : null;
  if (light) g.add(light);
  const flash = poolMat('#ff9a40', 1);
  poolMats.splice(poolMats.indexOf(flash), 1);
  const fp = lightPool(g, RX, DECK, RZ, 26, flash);
  fp.visible = false;
  const IGNITE = igniteAt(period || 20), LIFT = IGNITE + 1.5;
  // the turnaround before it, squeezed into the time there is: land, bring, lift, mate, arms in
  const c = Math.min(1, IGNITE / 16.5);
  const T = {
    land0: 0.3 * c, land1: 5.0 * c, // the booster's descent
    in0: 2.0 * c, in1: 6.0 * c, // the transporter up the ramp
    slew0: 5.0 * c, slew1: 6.6 * c, // the jib swings over the hardstand
    hook0: 6.4 * c, hook1: 7.2 * c, lift1: 9.4 * c, over1: 10.2 * c, mate: 10.8 * c,
    out0: 8.4 * c, out1: 11.6 * c, // the transporter leaves
    park0: 11.2 * c, park1: 12.9 * c,
  };
  const PICK_Z = 6.4; // where the transporter stops, in front of the mount
  const pickR = PICK_Z - 0.4 - TZ, mountR = RZ - TZ;
  const armIn = T.mate + 0.2 * c, crewAway = Math.min(IGNITE - 2.2, Math.max(T.mate + 2.2 * c, IGNITE - 4));
  /** The ground under the transporter: the plot, the ramp, the deck. */
  const rampY = (z: number) => (z >= 18 ? 0.14 : z <= 12 ? DECK : 0.14 + ((DECK - 0.14) * (18 - z)) / 6);
  /** The way up and the way down are one path: straight off the mount, then leaning out to sea. */
  const leanAt = (h: number) => Math.min(0.42, Math.max(0, h - 60) / 520);
  const fly = (h: number, shake: number) => {
    const lean = leanAt(h);
    rk.position.set(RX + shake, MOUNT + h, RZ - Math.max(0, h - 60) * lean * 0.55);
    rk.rotation.x = -lean;
  };
  let lastIgn = NaN, lastLift = NaN, acc = [0, 0, 0, 0], trailFrom = 0;
  const r = rng(o.seed + 13);
  const swing = (u: number, a: number, d: number) => Math.min(1, Math.max(0, (u - a) / d));
  const ease = (x: number) => x * x * (3 - 2 * x);
  const mated = () => {
    if (up.parent !== rk) rk.add(up);
    up.position.set(0, 0, 0);
    up.rotation.set(0, 0, 0);
  };
  return {
    obj: g, w: 40, d: 40, h: building ? Math.max(8, towerH + 14) : DECK + TH + 7,
    update(e: Env) {
      if (craneTop) craneTop.rotation.y = Math.sin(e.t * 0.22 + o.seed) * 1.2;
      if (building) return;
      for (const v of vents) v.update(e);
      if (!period) {
        rmat.emissiveIntensity = e.night * 0.1;
        billow.update(e);
        return;
      }
      const tt = e.t + offset;
      const ci = Math.floor(tt / period), u = tt - ci * period;
      if (Number.isNaN(lastIgn)) {
        lastIgn = u >= IGNITE ? ci : ci - 1;
        lastLift = u >= LIFT ? ci : ci - 1;
      }
      // ── the booster: back down the way it went up, engines first, onto the mount ──
      const burn = u < IGNITE ? 0 : Math.min(1, (u - IGNITE) / 0.5);
      const s = Math.max(0, u - LIFT);
      const climb = 0.5 * 7.2 * s * s + 0.8 * s;
      const down = 1 - swing(u, T.land0, T.land1 - T.land0);
      const drop = u < T.land1 ? 320 * Math.pow(down, 2.3) : 0;
      const h = u < T.land1 ? drop : climb;
      // the landing burn: lit for the last stretch, out at touchdown
      const landing = u >= T.land0 && u < T.land1 + 0.25;
      const landBurn = landing ? Math.min(1, Math.max(0, (190 - drop) / 60)) * (1 - swing(u, T.land1, 0.25)) : 0;
      fly(h, (burn > 0 && climb < 4) || (landBurn > 0 && drop < 3 && drop > 0) ? (r() - 0.5) * 0.06 : 0);
      rk.visible = u >= T.land0 && climb <= 340;
      // (far up it comes into sight, as it went out of it)
      const far = u < T.land1 ? swing(u, T.land0, 0.5 * c) : 1;
      for (const m of fades) (m as THREE.MeshStandardMaterial).opacity = far;
      // ── the transporter with the next upper stack ──
      const coming = ease(swing(u, T.in0, T.in1 - T.in0)), going = ease(swing(u, T.out0, T.out1 - T.out0));
      const sz = u < T.out0 ? 23.5 + (PICK_Z - 23.5) * coming : PICK_Z + (23.5 - PICK_Z) * going;
      spmt.visible = u >= T.in0 && u < T.out1;
      spmt.position.set(RX, rampY(sz), sz);
      tmat.opacity = Math.min(swing(u, T.in0, 0.5 * c), 1 - swing(u, T.out1 - 0.5 * c, 0.5 * c));
      // ── the crane: over the hardstand, down to the stack, up, in over the booster, down onto it ──
      const lifted = ease(swing(u, T.hook1 + 0.2 * c, T.lift1 - T.hook1 - 0.2 * c));
      const over = ease(swing(u, T.lift1, T.over1 - T.lift1));
      const set = ease(swing(u, T.over1, T.mate - T.over1));
      slew.rotation.y = u < T.park0 ? PARK * (1 - ease(swing(u, T.slew0, T.slew1 - T.slew0))) : PARK * ease(swing(u, T.park0, T.park1 - T.park0));
      const tr = pickR + (mountR - pickR) * over;
      trolley.position.z = u < T.park0 ? tr : mountR;
      const onPad = MOUNT + SPLIT; // the stack's base when it stands on the booster
      const baseY = rampY(sz) + CRADLE + (onPad + 1.3 - DECK - CRADLE) * lifted - 1.3 * set;
      const isMated = u >= T.mate;
      if (isMated || u < T.in0) mated();
      else {
        if (up.parent !== g) g.add(up);
        // on the transporter until the hook has it, then under the trolley
        up.position.set(RX, baseY - SPLIT, u >= T.hook1 ? TZ + tr : sz - 0.4);
        up.rotation.set(0, 0.2, 0);
      }
      up.visible = isMated ? true : u >= T.in0;
      // the hook: down to the nose, up with it, back up empty
      const noseY = (isMated ? onPad : baseY) + (TOP - SPLIT) + 0.7;
      const reach = u < T.hook0 ? 0 : u < T.hook1 ? ease(swing(u, T.hook0, T.hook1 - T.hook0)) : u < T.mate ? 1 : 1 - ease(swing(u, T.mate + 0.1 * c, 0.6 * c));
      reeve(2.6 + (JY - noseY - 2.6) * reach);
      // ── the arms: away while it lands and is stacked, in to the finished rocket, away to launch ──
      for (const a of arms) {
        const away = a.at > MOUNT + 30 ? ease(swing(u, crewAway, 1.4)) : ease(swing(u, IGNITE - 1.3, 0.9));
        const back = 1 - ease(swing(u, armIn, 1.6 * c));
        a.pivot.rotation.y = a.out * Math.max(away, back);
      }
      const venting = swing(u, armIn + 1.2 * c, 0.8) * (u < IGNITE - 0.4 ? 1 : 0);
      for (const v of vents) v.strength = venting;
      // burn and climb
      fl.set(Math.max(burn * (s > 0 ? 1.15 : 0.75), landBurn * 0.8), e.night, e.t);
      rmat.emissiveIntensity = e.night * 0.1 + burn * (light ? 0 : 0.06);
      if (u >= IGNITE && lastIgn !== ci) { lastIgn = ci; e.cue?.('launch'); }
      if (u >= LIFT && lastLift !== ci) {
        lastLift = ci;
        trailFrom = 0;
        if (e.night > 0.6) e.cue?.('night-launch');
      }
      // what billows: the deluge's steam, the exhaust out of the trench, the cloud round the base, the trail
      const dt = Math.min(0.1, e.dt);
      const rate = (i: number, per: number, fn: () => void) => { acc[i] += per * dt; while (acc[i] >= 1) { acc[i] -= 1; fn(); } };
      if (u > IGNITE - 1.4 && u < IGNITE + 3) rate(0, 26, () => {
        const a = r() * Math.PI * 2;
        billow.emit({ x: RX + Math.sin(a) * 3.6, y: DECK + 0.6, z: RZ + Math.cos(a) * 3.6, vx: Math.sin(a) * (2 + r() * 2), vy: 2.5 + r() * 2.5, vz: Math.cos(a) * (2 + r() * 2), life: 2.5 + r() * 1.5, s0: 1.2, s1: 4.6 });
      });
      if (u > IGNITE + 0.08 && u < LIFT + 4.5) {
        const k2 = Math.max(0.15, 1 - (u - IGNITE) / 6.5);
        rate(1, 64 * k2, () => {
          const dir = r() < 0.55 ? -1 : 1;
          billow.emit({ x: dir < 0 ? X0 + 0.5 : X1 - 0.5, y: 0.7 + r() * 1.4, z: RZ + (r() - 0.5) * 3.4, vx: dir * (11 + r() * 11), vy: 1.2 + r() * 3.4, vz: (r() - 0.5) * 8, life: 7 + r() * 4, s0: 3.2, s1: 11 + r() * 7, heat: 0.95 });
        });
      }
      if (u > LIFT - 0.4 && u < LIFT + 3.8) rate(2, 46, () => {
        const a = r() * Math.PI * 2;
        billow.emit({ x: RX + Math.sin(a) * 2.5, y: MOUNT + 0.4, z: RZ + Math.cos(a) * 2.5, vx: Math.sin(a) * (6 + r() * 6), vy: 1.5 + r() * 3.5, vz: Math.cos(a) * (6 + r() * 6), life: 6 + r() * 4, s0: 3.2, s1: 11 + r() * 7, heat: 0.85 });
      });
      // the landing burn's exhaust: down the trench and out of its mouths for the last seconds
      if (landBurn > 0.5 && drop < 30) rate(3, 14, () => {
        const dir = r() < 0.55 ? -1 : 1;
        billow.emit({ x: dir < 0 ? X0 + 0.5 : X1 - 0.5, y: 0.7 + r() * 1.2, z: RZ + (r() - 0.5) * 3.4, vx: dir * (7 + r() * 7), vy: 1 + r() * 2.4, vz: (r() - 0.5) * 4, life: 3 + r() * 2, s0: 2, s1: 5 + r() * 3, heat: 0.8 });
      });
      if (s > 0 && climb < 300) {
        while (trailFrom < climb - 1) {
          trailFrom += 0.8 + trailFrom * 0.009;
          const f = trailFrom / Math.max(1e-3, climb);
          const lz = RZ - Math.max(0, trailFrom - 60) * leanAt(trailFrom) * 0.55;
          billow.emit({ x: RX + (r() - 0.5) * 0.8, y: MOUNT + trailFrom - 3, z: lz + (r() - 0.5) * 0.8, vx: (r() - 0.5) * 1.6, vy: -1.5 * (1 - f) - r(), vz: (r() - 0.5) * 1.6, life: 8 + r() * 4, s0: 3.6, s1: 11 + r() * 5 + trailFrom * 0.035, heat: 1 });
        }
      }
      // light: the burn floods the pad, then climbs away with the rocket (and comes back down with it)
      const away = 1 / (1 + h / 22);
      const lit = Math.max(burn, landBurn * 0.7);
      const glow = lit * away;
      if (light) {
        light.position.set(RX, MOUNT + h - 2.5, rk.position.z);
        light.intensity = glow * (900 + e.night * 2600) * (0.92 + r() * 0.16);
      }
      fp.visible = glow > 0.01;
      flash.opacity = glow * (0.28 + e.night * 0.6);
      billow.update(e, lit > 0 ? { x: RX, y: MOUNT + h - 3, z: rk.position.z, k: lit * (0.25 + 0.75 * away) } : null);
      acc = acc.map((a) => Math.min(a, 4));
    },
  };
}
