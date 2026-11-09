/**
 * A Moon contract under way, in the builder's colours (`variant` = the contract: moonbase,
 * moonmine, massdriver; `p` = progress): the piece rising — a regolith dome printed layer by
 * layer under a gantry printer, a kiln being assembled on its rollers, the mass driver's rail laid
 * from the breech outwards — with a crawler crane slewing a load, stacked cargo modules, the
 * supply lander parked alongside, the builder's board, floodlights and survey stakes. No hoarding
 * and no flags flapping out here.
 */
import * as THREE from 'three';
import { Kit, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  astro, beacon, builderBoard, crewLander, Ctx, Dust, floodMast, habModule, hcyl, M, mixHex, pressRover, printedDome, radiator, roverTracks, stakes, V, LiteKit, } from './common';
import { halo, plasmaMat } from '../fusion/common';

/** A crawler crane in the livery: tracks below, the house and lattice boom on a slewing top. */
function crawlerCrane(acc: string, hi: string, boom: number, angle: number, seed: number, load?: (k: Kit) => void) {
  const g = new THREE.Group();
  const k = new LiteKit(rng(seed));
  for (const s of [-1.4, 1.4]) k.box(6.0, 1.0, 1.1, M.dark, 0, 0, s, { r: 0.3 });
  k.box(2.8, 0.5, 3.2, M.steelD, 0, 0.9, 0, { r: 0.06 });
  g.add(k.build());
  const top = new THREE.Group();
  top.position.y = 1.4;
  const tk = new LiteKit(rng(seed + 1));
  tk.box(3.8, 1.8, 2.6, acc, -0.5, 0, 0, { r: 0.14 });
  tk.box(3.82, 0.24, 2.62, hi, -0.5, 1.5, 0, { r: 0.03, shade: 0 });
  tk.box(1.3, 1.3, 1.0, M.white, 1.2, 0, 1.2, { r: 0.08 });
  tk.box(1.32, 0.6, 1.02, M.glass, 1.2, 0.6, 1.2, { r: 0.04, shade: 0 });
  tk.box(1.8, 1.8, 2.6, mixHex(acc, '#2f2a3d', 0.35), -3.0, 0, 0, { r: 0.1 });
  tk.box(3.0, 0.06, 2.0, M.panel, -0.8, 1.82, 0, { r: 0, shade: 0 });
  const foot = V(1.0, 1.4, 0);
  const tip = foot.clone().add(V(Math.cos(angle) * boom, Math.sin(angle) * boom, 0));
  const side = V(0, 0, 0.5);
  for (const s of [-1, 1]) {
    tk.beam(foot.clone().addScaledVector(side, s), tip.clone().addScaledVector(side, s * 0.4), 0.12, hi);
    tk.beam(foot.clone().addScaledVector(side, s).add(V(0, 0.7, 0)), tip.clone().addScaledVector(side, s * 0.4).add(V(0, 0.25, 0)), 0.12, hi);
  }
  for (let i = 0; i < 10; i++) {
    const a = foot.clone().lerp(tip, i / 10), b = foot.clone().lerp(tip, (i + 1) / 10);
    tk.beam(a.clone().add(V(0, 0.35, -0.45)), b.clone().add(V(0, 0.3, 0.45)), 0.06, acc);
  }
  tk.beam(V(-1.8, 1.8, 0), V(-0.6, 6.5, 0), 0.14, acc);
  tk.beam(V(-0.6, 6.5, 0), tip.clone().add(V(0, 0.4, 0)), 0.05, M.ink);
  tk.beam(V(-0.6, 6.5, 0), V(-3.4, 1.8, 0), 0.05, M.ink);
  top.add(tk.build());
  beacon(top, tip.x, tip.y + 0.5, 0, seed);
  const hook = new THREE.Group();
  hook.position.copy(tip);
  const hk = new LiteKit(rng(seed + 2));
  const drop = tip.y - 3.2;
  hk.beam(V(0, 0, 0), V(0, -drop, 0), 0.05, M.ink);
  hk.box(0.5, 0.5, 0.4, 'yel0', 0, -drop - 0.5, 0, { r: 0.05 });
  if (load) {
    const lk = new LiteKit(rng(seed + 3));
    load(lk);
    const lm = lk.build();
    lm.position.y = -drop - 0.6;
    hook.add(lm);
  }
  hook.add(hk.build());
  top.add(hook);
  g.add(top);
  return { obj: g, top };
}

export function moonBuild(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'KARMAN');
  const { k, g, L, W, D } = c;
  const kind = (o.variant || 'moonbase').split(':')[0];
  const p = Math.max(0.12, Math.min(0.97, o.p ?? 0.5));
  const anim = c.anim;
  // the graded yard
  k.box(W - 3, 0.06, D - 4, '#a39ba8', 0, -0.02, -0.5, { r: 0.04, shade: 0, jitter: 0.02 });
  // the builder's board, cargo modules, the supply lander, a rover, lights
  const bb = builderBoard(L.name, 5.6, L.acc, L.hi, L.ink);
  bb.position.set(-11.2, 2.6, D / 2 - 1.6);
  g.add(bb);
  for (const s of [-1, 1]) k.box(0.18, 3.4, 0.18, M.steel, -11.2 + s * 2.4, 0, D / 2 - 1.7, { r: 0.02 });
  const cargo: [number, number, number, string][] = [[10.0, 9.6, 0, L.acc], [12.6, 9.6, 0, M.white], [11.3, 9.6, 1, L.hi], [10.0, 7.2, 0, M.white]];
  for (const [x, z, lvl, paint] of cargo) {
    k.box(2.4, 1.3, 2.0, paint, x, lvl * 1.32, z, { r: 0.1 });
    k.box(2.42, 0.16, 2.02, mixHex(paint, '#2f2a3d', 0.3), x, lvl * 1.32 + 1.0, z, { r: 0.02, shade: 0 });
  }
  const lander = crewLander(L.acc, L.hi, o.seed + 7);
  lander.obj.scale.setScalar(0.72);
  lander.obj.position.set(12.0, 0, -8.6);
  g.add(lander.obj);
  pressRover(k, c.lit, -4.0, 10.8, 0.15, L.acc);
  roverTracks(k, [[-W / 2 + 1, 11.6], [-4, 10.8], [8, 9.0]], 1.9);
  floodMast(c, -15.0, -11.0, 7, Math.PI * 0.25, 7, 0, 9);
  floodMast(c, 15.0, 3.0, 7, -Math.PI * 0.45, 7, 0, 9);
  astro(g, -1.2, 8.0, 0.4, o.seed + 1);
  astro(g, 6.0, 6.4, -0.9, o.seed + 2);
  const dust = new Dust(80);
  g.add(dust.obj);
  const rand = rng(o.seed + 9);
  let h = 8;
  if (kind === 'massdriver') {
    // the breech walls rising, the rail laid from it outwards, stakes where it will run
    const bx = -12.6, bz = -3.0;
    const wh = 0.6 + 5 * Math.min(1, p * 1.4);
    k.box(7.4, wh, 7.4, M.printed, bx, 0, bz, { r: 0.16, shade: 0.12 });
    for (let y = 0.45; y < wh; y += 0.45) k.box(7.44, 0.05, 7.44, M.printed2, bx, y, bz, { r: 0, jitter: 0, shade: 0 });
    const x0 = bx + 4.2, x1 = W / 2 - 1.5, built = x0 + (x1 - x0) * p;
    const y0 = 1.8, slope = 0.12;
    const railY = (x: number) => y0 + (x - x0) * slope;
    for (let x = x0 + 1.5; x < built; x += 4.4) {
      for (const sz of [-1, 1]) k.beam(V(x, 0.2, bz + sz * 1.4), V(x, railY(x) - 0.8, bz + sz * 0.4), 0.26, M.steel);
      k.box(0.5, 0.3, 3.4, M.reg3, x, 0, bz, { r: 0.05 });
    }
    const len = built - x0;
    const mid = (x0 + built) / 2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan(slope)));
    k.geo(new THREE.BoxGeometry(len / Math.cos(Math.atan(slope)), 0.6, 1.0).applyQuaternion(q).translate(mid, railY(mid) - 0.4, bz), M.white2, 0.03, 0);
    for (let x = x0 + 1; x < built - 0.5; x += 1.6) k.geo(new THREE.TorusGeometry(0.75, 0.14, 6, 16).rotateY(Math.PI / 2).applyQuaternion(q).translate(x, railY(x), bz), (x | 0) % 5 === 0 ? L.acc : '#8a8f98', 0.02, 0);
    stakes(c, (built + x1) / 2 + 1, bz, Math.max(2, x1 - built - 2), 2, 3, o.seed);
    const cr = crawlerCrane(L.acc, L.hi, 11, 0.95, o.seed + 4, (lk) => { lk.box(4.6, 0.5, 0.8, M.white2, 0, -0.5, 0, { r: 0.05 }); lk.box(4.6, 0.12, 0.84, L.acc, 0, -0.2, 0, { r: 0.02 }); });
    cr.obj.position.set(Math.min(built - 2, x1 - 8), 0, bz + 5.6);
    g.add(cr.obj);
    anim.extra.push((e) => { cr.top.rotation.y = -1.2 + Math.sin(e.t * 0.25) * 0.5; });
    h = railY(built) + 2;
  } else if (kind === 'moonmine') {
    // the kiln going up on its rollers, radiator frames, an excavator opening a cut
    const k0 = V(-11.0, 4.4, -4.6), k1 = V(3.6, 2.8, -4.6);
    for (const t of [0.2, 0.8]) {
      const q2 = k0.clone().lerp(k1, t);
      k.box(2.4, q2.y - 1.4, 2.2, M.printed, q2.x, 0, q2.z, { r: 0.12 });
    }
    const segs = Math.max(1, Math.round(6 * p));
    for (let i = 0; i < segs; i++) {
      const a = k0.clone().lerp(k1, i / 6), b = k0.clone().lerp(k1, (i + 0.92) / 6);
      const m = a.clone().lerp(b, 0.5);
      const len = a.distanceTo(b);
      k.geo(new THREE.CylinderGeometry(1.25, 1.25, len, 18).rotateZ(Math.PI / 2 + Math.atan2(k1.y - k0.y, k1.x - k0.x)).translate(m.x, m.y, m.z), i % 2 ? '#8f8a90' : '#9a959c', 0.02, 0);
    }
    for (let i = 0; i < 4; i++) {
      const x = -6 + i * 2.6;
      k.box(0.2, 7.0, 0.2, M.steel, x, 0, -11.2, { r: 0 });
      if (i < Math.round(4 * p)) k.box(0.1, 6.6, 2.2, M.rad, x, 0.4, -11.2, { r: 0.02 });
    }
    radiator(k, 8, -10.6, 3, 2.0, 2.4, 0);
    // a small cut with a digger and its spoil
    k.box(5.0, 0.4, 3.6, M.reg3, -9.0, -0.3, 5.4, { r: 0.4 });
    k.geo(new THREE.ConeGeometry(2.4, 1.8, 10).translate(-13.4, 0.9, 6.8), M.reg2, 0.05, 0.1);
    const dg = new LiteKit(rng(o.seed + 5));
    dg.box(2.4, 0.8, 1.8, M.dark, 0, 0, 0, { r: 0.25 });
    dg.box(1.8, 1.2, 1.6, L.acc, 0, 0.8, 0, { r: 0.12 });
    dg.beam(V(0.6, 1.6, 0), V(2.6, 2.8, 0), 0.28, L.acc);
    dg.beam(V(2.6, 2.8, 0), V(3.2, 0.6, 0), 0.24, L.acc);
    dg.box(0.8, 0.6, 1.0, M.steelD, 3.2, 0.1, 0, { r: 0.05 });
    const digger = dg.build();
    digger.position.set(-11.6, 0, 5.4);
    g.add(digger);
    const cr = crawlerCrane(L.acc, L.hi, 10, 1.0, o.seed + 4, (lk) => hcyl(lk, 1.2, 2.2, '#9a959c', 0, -1.4, 0, 'x', 16));
    cr.obj.position.set(-1.0, 0, 3.2);
    g.add(cr.obj);
    anim.extra.push((e) => {
      cr.top.rotation.y = 1.9 + Math.sin(e.t * 0.22) * 0.45;
      digger.rotation.y = Math.sin(e.t * 0.6) * 0.25;
      if (Math.floor(e.t * 5) % 4 === 0) dust.emit(-8.4, 0.6, 5.4, 1, 1.5, 1.8, rand, Math.PI / 2, 2, 1.6);
    });
    h = 8;
  } else {
    // the dome printed layer by layer under a gantry printer, a module going together beside it
    const dx = -4.4, dz = -3.4, rx = 6.0, dh = 5.4;
    const done = printedDome(k, dx, dz, rx, dh, { upTo: p });
    k.cyl(rx + 0.3, rx + 0.5, 0.25, M.reg3, dx, 0, dz, 40, { shade: 0 });
    const gw = rx + 1.6, gH = dh + 2.6;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.box(0.4, gH, 0.4, L.acc, dx + sx * gw, 0, dz + sz * 2.2, { r: 0.04 });
      k.box(0.5, 0.4, 4.8, L.dark, dx + sx * gw, gH - 0.2, dz, { r: 0.04 });
      k.box(0.8, 0.5, 5.2, M.dark, dx + sx * gw, 0, dz, { r: 0.12 });
    }
    const bridge = new THREE.Group();
    const bk = new LiteKit(rng(o.seed + 6));
    bk.box(2 * gw + 0.6, 0.55, 0.7, L.acc, 0, 0, 0, { r: 0.05 });
    bk.box(2 * gw + 0.62, 0.12, 0.72, L.hi, 0, 0.55, 0, { r: 0.02 });
    bridge.add(bk.build());
    bridge.position.set(dx, gH, dz);
    g.add(bridge);
    const head = new THREE.Group();
    const hk = new LiteKit(rng(o.seed + 7));
    hk.box(1.0, 0.8, 1.1, M.white, 0, -0.4, 0, { r: 0.08 });
    const arm = gH - done.top - 0.6;
    hk.box(0.24, arm, 0.24, M.steel, 0, -0.4 - arm, 0, { r: 0 });
    hk.cyl(0.24, 0.08, 0.4, M.steelD, 0, -0.8 - arm, 0, 8);
    head.add(hk.build());
    const nozzle = plasmaMat('#f7b258', 2.4);
    const nz = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), nozzle);
    nz.position.y = -0.85 - arm;
    head.add(nz);
    const nh = halo([V(0, -0.9 - arm, 0)], [2.2], '#f7b258', 0.8);
    head.add(nh.obj);
    bridge.add(head);
    // the module going together on blocks
    habModule(k, 8.0, 1.6, 0.6, 6.4 * Math.min(1, 0.4 + p), 1.3, L.acc);
    for (const x of [6.0, 10.0]) k.box(0.9, 0.5, 2.4, M.reg3, x, 0, 0.6, { r: 0.06 });
    for (let i = 0; i < 5; i++) k.beam(V(5.0 + i * 1.4, 0.4, -0.9), V(5.0 + i * 1.4, 2.8, -0.9), 0.1, M.steel);
    const cr = crawlerCrane(L.acc, L.hi, 10, 1.0, o.seed + 4, (lk) => { lk.box(2.0, 1.2, 1.6, M.white, 0, -1.2, 0, { r: 0.12 }); lk.box(2.02, 0.2, 1.62, L.acc, 0, -0.5, 0, { r: 0.02 }); });
    cr.obj.position.set(7.0, 0, 6.2);
    g.add(cr.obj);
    const r0 = rx * Math.sqrt(Math.max(0.05, 1 - (done.top / dh) ** 2));
    anim.extra.push((e) => {
      cr.top.rotation.y = 2.4 + Math.sin(e.t * 0.2) * 0.5;
      // the head runs round the layer it's printing: across the bridge, the bridge along z
      const a = e.t * 0.6;
      head.position.x = Math.cos(a) * r0 * 0.95;
      bridge.position.z = dz + Math.sin(a) * Math.min(2.0, r0 * 0.4);
      nozzle.emissiveIntensity = 2.0 + Math.sin(e.t * 9) * 0.4;
    });
    h = gH + 1;
  }
  anim.extra.push((e) => dust.update(e));
  c.finish();
  return { obj: g, w: W, d: D, h, update: c.update };
}
