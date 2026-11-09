/**
 * Act V: the Moon's own foundry making swarm collectors. `n` blocks (1..4) of printed regolith —
 * each with a smelter glowing through its port, a hopper, radiator fins, a robot arm passing parts
 * along — and one more always being printed under the gantry at the end; then the press line
 * stamping gold collector panels, stacks of them on pallets, and a conveyor feeding loaded
 * capsules out to the mass driver. `variant` flags: 'h' halted (cold, red lights, a HALT plate),
 * 'q1'..'q3' quarantine (a warning net over the drifting blocks).
 */
import * as THREE from 'three';
import { col, paintMat, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { astro, beacon, Ctx, floodMast, hcyl, M, printedDome, radiator, TAU, V, LiteKit } from './common';
import { halo, placard, plasmaMat, tintPool } from '../fusion/common';
import { lightPool } from '../../../kit';

const GOLD = '#fbd46e', GOLD2 = '#e8b84a';

/** A hexagonal collector panel (thin gold plate), flat, at the origin. */
function panelGeo(r = 0.62) {
  return new THREE.CylinderGeometry(r, r, 0.06, 6);
}

export function moonFoundry(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const hw = W / 2;
  const flags = o.variant ?? '';
  const halted = flags.includes('h');
  const q = Number(/q(\d)/.exec(flags)?.[1] ?? 0);
  const n = Math.max(1, Math.min(4, Math.round(o.n ?? 1)));
  const live = !halted;
  // layout: the blocks and the printer over x −19..9, the press line to the right
  const x0 = -hw + 1.4, span = 28;
  const slot = span / (n + 1);
  const bw = Math.min(7.4, slot - 0.9), bd = 8.0, bh = 5.2, bz = -3.2;
  const smelt = plasmaMat('#f7b258', live ? 1.8 : 0.0);
  if (!live) smelt.color.set('#4a4452');
  const sk = new LiteKit(rng(o.seed + 5));
  const hot: THREE.Vector3[] = [];
  // the regolith feed from the left, under a cover
  hcyl(k, 0.7, slot * 0.6, M.white2, x0 + slot * 0.3 - 1.2, 1.0, bz + 2.6, 'x', 12);
  for (let i = 0; i < n; i++) {
    const cx = x0 + slot * (i + 0.5);
    k.box(bw, bh, bd, M.printed, cx, 0, bz, { r: 0.22, shade: 0.12 });
    for (let y = 0.45; y < bh; y += 0.45) k.box(bw + 0.04, 0.05, bd + 0.04, M.printed2, cx, y, bz, { r: 0, jitter: 0, shade: 0 });
    k.box(bw + 0.08, 0.36, bd + 0.08, L.acc, cx, bh - 0.75, bz, { r: 0.03, shade: 0 });
    // the smelter's port on the front, its glow
    k.box(Math.min(2.6, bw * 0.4), 2.0, 0.3, M.steelD, cx - bw * 0.2, 0.6, bz + bd / 2 + 0.1, { r: 0.06 });
    sk.box(Math.min(2.2, bw * 0.34), 1.5, 0.1, '#ffffff', cx - bw * 0.2, 0.85, bz + bd / 2 + 0.27, { r: 0, jitter: 0, shade: 0 });
    hot.push(V(cx - bw * 0.2, 1.6, bz + bd / 2 + 0.6));
    // windows, the block number
    for (let j = 0; j < 3; j++) c.lit.box(0.6, 0.5, 0.1, M.glass, cx + bw * 0.12 + j * 0.8 - 0.4, 3.2, bz + bd / 2 + 0.02, { r: 0.03, jitter: 0 });
    placard(g, `M${i + 1}`, 1.2, cx + bw * 0.25, 1.6, bz + bd / 2 + 0.04, '#5fd3b5', M.dark);
    // a hopper and radiator fins on the roof, a stack
    k.geo(new THREE.CylinderGeometry(1.2, 0.4, 1.4, 4).rotateY(Math.PI / 4).translate(cx - bw * 0.2, bh + 0.7, bz - 1.4), M.steel, 0.03, 0);
    radiator(k, cx + bw * 0.22, bz - 1.0, 3, 2.2, 2.6, Math.PI / 2, bh);
    k.cyl(0.26, 0.3, 2.0, M.white2, cx - bw * 0.35, bh, bz + 2.4, 10);
  }
  g.add(sk.build(smelt));
  const hh = halo(hot, hot.map(() => 3), '#f7b258', live ? 0.5 : 0);
  g.add(hh.obj);
  if (live) for (const p of hot) lightPool(g, p.x, 0, p.z + 2.2, 3.4, tintPool('#f7b258', 0.42));
  // robot arms passing parts between the blocks (one per gap)
  const arms: { base: THREE.Group; ph: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ax = x0 + slot * (i + 1), az = bz + bd / 2 + 1.4;
    k.cyl(0.5, 0.6, 0.6, M.steelD, ax, 0, az, 12);
    const base = new THREE.Group();
    base.position.set(ax, 0.6, az);
    const ak = new LiteKit(rng(o.seed + 20 + i));
    ak.cyl(0.32, 0.36, 0.5, L.acc, 0, 0, 0, 12);
    ak.beam(V(0, 0.4, 0), V(0.4, 2.4, 0.3), 0.3, L.acc);
    ak.beam(V(0.4, 2.4, 0.3), V(1.6, 2.0, 0.6), 0.24, M.white);
    ak.box(0.4, 0.3, 0.4, M.steelD, 1.6, 1.7, 0.6, { r: 0.04 });
    ak.geo(panelGeo(0.45).translate(1.6, 1.55, 0.6), GOLD, 0.02, 0);
    base.add(ak.build());
    g.add(base);
    arms.push({ base, ph: i * 1.7 });
  }
  // the next block printing under its gantry (the print loops: it's always building itself)
  const px = x0 + slot * (n + 0.5);
  const pr = Math.min(3.6, slot * 0.42);
  const gH = 7.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.36, gH, 0.36, L.acc, px + sx * (pr + 1.0), 0, bz + sz * 3.6, { r: 0.04 });
  for (const sz of [-1, 1]) k.box(2 * pr + 2.4, 0.4, 0.5, L.dark, px, gH - 0.2, bz + sz * 3.6, { r: 0.04 });
  const printed = new THREE.Group();
  const pk = new LiteKit(rng(o.seed + 7));
  printedDome(pk, 0, 0, pr, 5.0, { rz: 3.4 });
  printed.add(pk.build());
  printed.position.set(px, 0, bz);
  g.add(printed);
  const clipPlane = new THREE.Plane(V(0, -1, 0), 2.5);
  const clipMat = (paintMat as THREE.MeshStandardMaterial).clone();
  clipMat.onBeforeCompile = paintMat.onBeforeCompile;
  clipMat.customProgramCacheKey = paintMat.customProgramCacheKey;
  clipMat.clippingPlanes = [clipPlane];
  clipMat.clipShadows = true;
  clipMat.side = THREE.DoubleSide;
  (printed.children[0] as THREE.Mesh).material = clipMat;
  const bridge = new THREE.Group();
  const bk = new LiteKit(rng(o.seed + 8));
  bk.box(0.6, 0.5, 7.6, L.acc, 0, 0, 0, { r: 0.05 });
  bk.box(0.9, 0.7, 1.0, M.white, 0, -0.7, 0, { r: 0.06 });
  bk.box(0.16, 1.0, 0.16, M.steel, 0, -1.7, 0, { r: 0 });
  bridge.add(bk.build());
  const noz = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), plasmaMat('#fff6d8', live ? 2.6 : 0));
  bridge.add(noz);
  g.add(bridge);
  // ── the press line: a stamping press, gold panels in stacks, a conveyor of capsules out ──
  const lx = 12.6, lz = -1.0;
  k.box(4.2, 0.5, 3.4, M.steelD, lx, 0, lz, { r: 0.06 });
  for (const sx of [-1, 1]) k.box(0.6, 5.4, 0.6, L.acc, lx + sx * 1.6, 0.5, lz, { r: 0.05 });
  k.box(4.0, 1.0, 1.4, L.dark, lx, 5.4, lz, { r: 0.08 });
  const ram = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.2).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: col(M.steel), roughness: 0.8 }));
  ram.position.set(lx, 3.0, lz);
  ram.castShadow = true;
  g.add(ram);
  k.box(2.8, 0.4, 1.6, M.dark, lx, 0.5, lz, { r: 0.04 });
  const flash = halo([V(lx, 1.2, lz + 0.9)], [3.5], '#fff1d0', 0);
  g.add(flash.obj);
  // stacks of finished panels on pallets
  const stackK = new LiteKit(rng(o.seed + 9));
  const stacks: [number, number, number][] = [[7.8, 4.6, 14], [10.2, 4.8, 9], [9.0, 7.0, 18], [16.4, -6.0, 16], [18.6, -6.0, 10], [17.5, -3.6, 20]];
  for (const [x, z, cnt] of stacks) {
    stackK.box(2.3, 0.22, 2.3, '#8c5a3c', x, 0, z, { r: 0.03 });
    for (let i = 0; i < cnt; i++) stackK.geo(panelGeo(0.98).rotateY(i * 0.08).translate(x, 0.3 + i * 0.09, z), i % 3 ? GOLD : GOLD2, 0.02, 0);
  }
  g.add(stackK.build());
  // the conveyor to the right edge: panels into capsules, capsules away to the driver
  const cz = 4.0, cy = 1.0;
  k.box(hw - 0.6 - (lx - 1.2), 0.3, 1.4, M.steelD, (lx - 1.2 + hw - 0.6) / 2, cy - 0.3, cz, { r: 0.04 });
  for (let x = lx - 1; x < hw - 0.6; x += 2.4) k.box(0.2, cy - 0.3, 1.2, M.steel, x, 0, cz, { r: 0 });
  k.beam(V(lx, 1.0, lz + 1.6), V(lx, 1.0, cz - 0.6), 0.5, M.steelD);
  const capK = new LiteKit(rng(o.seed + 10));
  hcyl(capK, 0.42, 1.4, M.foil, 0, 0.42, 0, 'x', 12, 0);
  capK.geo(new THREE.ConeGeometry(0.42, 0.5, 12).rotateZ(-Math.PI / 2).translate(0.95, 0.42, 0), M.white, 0.02, 0);
  const capsules = new THREE.InstancedMesh(capK.build().geometry, paintMat, 4);
  capsules.castShadow = true;
  g.add(capsules);
  // halted: a plate and red lights; quarantine: a warning net over the drifting blocks
  if (halted) {
    placard(g, 'HALT', 2.4, x0 + slot * 0.5, bh + 1.3, bz + bd / 2 + 0.1, '#fbf7f0', '#c23a3f');
    for (let i = 0; i < n; i++) beacon(g, x0 + slot * (i + 0.5) + bw * 0.4, bh + 0.4, bz + bd / 2, 0.5);
  }
  if (q > 0) {
    const net = new THREE.MeshStandardMaterial({ color: col('#f7a6c4'), emissive: col('#e86aa0'), emissiveIntensity: 0.25, transparent: true, opacity: 0.18 + q * 0.05, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 });
    const count = Math.min(n, q);
    for (let i = n - count; i < n + 1; i++) {
      const cx = x0 + slot * (i + 0.5);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2).scale(slot * 0.55, bh + 2.2, bd * 0.7).translate(cx, 0, bz), net);
      shell.renderOrder = 3;
      g.add(shell);
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * TAU;
        k.box(0.12, 0.8, 0.12, '#c23a3f', cx + Math.cos(t) * slot * 0.55, 0, bz + Math.sin(t) * bd * 0.7, { r: 0, jitter: 0 });
      }
      beacon(g, cx, bh + 2.4, bz, i);
    }
  }
  floodMast(c, -hw + 1.4, 10.4, 7, Math.PI * 0.85, 7, 0, 8);
  floodMast(c, hw - 1.6, 10.6, 7, -Math.PI * 0.8, 7, 0, 8);
  astro(g, 6.8, 6.6, -0.5, o.seed + 1);
  astro(g, -8.0, 4.8, 0.3, o.seed + 2);
  const m4 = new THREE.Matrix4();
  c.anim.extra.push((e) => {
    const t = live ? e.t : 0;
    // the print: rises over 24 s, then a new block starts
    const pu = live ? ((t * 0.042) % 1) : 0.5;
    const ph = 0.3 + pu * 5.0;
    clipPlane.constant = ph;
    bridge.position.set(px + Math.cos(t * 1.1) * pr * 0.85, ph + 1.9, bz + Math.sin(t * 0.7) * 1.8);
    noz.position.y = -2.0;
    // the press: up, slam, up
    const pp = (t * 0.6) % 1;
    const down = pp < 0.12 ? pp / 0.12 : pp < 0.3 ? 1 - (pp - 0.12) / 0.18 : 0;
    ram.position.y = 3.0 - down * 1.9;
    flash.set(live && pp > 0.1 && pp < 0.2 ? 0.9 : 0);
    // arms swing parts along
    for (const a of arms) a.base.rotation.y = live ? Math.sin(t * 0.9 + a.ph) * 1.1 - 0.4 : -0.4;
    // capsules ride out to the right
    for (let i = 0; i < 4; i++) {
      const u = ((t * 0.08 + i / 4) % 1 + 1) % 1;
      m4.makeTranslation(lx + 0.5 + u * (hw - lx - 2.6), cy, cz);
      capsules.setMatrixAt(i, m4);
    }
    capsules.instanceMatrix.needsUpdate = true;
    const f = live ? 1 + Math.sin(e.t * 4.3) * 0.08 : 0;
    smelt.emissiveIntensity = 1.8 * f;
    hh.set(0.45 * f);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: Math.max(gH + 0.6, bh + 3.5), update: c.update };
}
