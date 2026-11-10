/**
 * The asteroid pieces: open rock, the claim beacon (a survey lander tethered down, a lattice mast
 * blinking in the claimant's colours, a hopping rover), a staked claim (the owner's stiff flag and
 * board, a crew pod strapped to the rock, a lander, survey kit, stake lights), a mining rig working
 * an outcrop (anchored legs and tethers, a cutter wheel or a laser, dust flying in slow arcs, a
 * conveyor to a hauler) and the mass catapult (a coil rail tilted up, flinging ore capsules off
 * toward the yards). `variant` = `${type}|${flags}` (h halted, q quarantine level).
 */
import * as THREE from 'three';
import { col, Kit, mix, rng, type Paint } from '../../../kit';
import { Plume } from '../../../fx';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { builderSign } from '../../planKit';
import {
  Ast, canvasTex, coldPortMat, cyanDark, cyanLit, faceUp, flagsOf, FONT, gy, hexOf, metalRockMat, moltenMat, rockMat, ROCK, Spray, TAU, truss,
  typeOf, V,
} from './common';

const WHITE = '#e6e0e3', HULL = '#d8d2cc', DARK = '#433c52', STEEL = '#9d95a6', FOIL = '#d4a862', PANEL = '#2c3f6e';

// ── open rock ────────────────────────────────────────────────────────────────────────────────
export function astRocks(o: Act3SetOpts): Piece {
  const t = typeOf(o.variant);
  const seed = o.seed + (o.vseed ?? 0) * 101;
  const a = new Ast(seed, t, o.w, o.d);
  const hw = o.w / 2 - 1, hd = o.d / 2 - 1, area = (o.w * o.d) / 720;
  const r = a.r;
  // a couple of craters, then boulders of every size: a rubble pile's surface
  const nc = 2 + Math.floor(r() * 2);
  const holes: [number, number, number][] = [];
  for (let i = 0; i < nc; i++) {
    const rad = 1.6 + r() * 3.0, x = (r() - 0.5) * (o.w - rad * 2 - 4), z = (r() - 0.5) * (o.d - rad * 2 - 4);
    if (holes.some(([hx, hz, hr]) => Math.hypot(hx - x, hz - z) < hr + rad + 1)) continue;
    holes.push([x, z, rad]);
    a.crater(x, z, rad);
  }
  const keep = holes.map(([x, z, rad]) => [x - rad * 0.8, z - rad * 0.8, x + rad * 0.8, z + rad * 0.8] as [number, number, number, number]);
  const big = 1 + Math.floor(r() * 2 * area + 0.5);
  for (let i = 0; i < big; i++) a.boulder((r() - 0.5) * hw * 1.6, (r() - 0.5) * hd * 1.4, 2.2 + r() * 1.6, 0.35);
  a.scatter(Math.round(10 * area), 0.7, 1.7, -hw, -hd, hw, hd, keep);
  a.scatter(Math.round(38 * area), 0.2, 0.6, -hw, -hd, hw, hd, keep);
  a.grit(Math.round(260 * area), -hw - 0.5, -hd - 0.5, hw + 0.5, hd + 0.5, keep);
  // dust drifts (bluish fines on the carbon worlds, tan on the stony ones), glints on metal
  for (let i = 0; i < (t === 'C' ? 4 : 2); i++) a.dust((r() - 0.5) * hw * 1.4, (r() - 0.5) * hd * 1.4, 2 + r() * 3, 1.4 + r() * 2);
  if (t === 'M') glints(a, 26 * area, hw, hd);
  return a.finish(4);
}

/** Bright flecks of metal in the regolith. */
function glints(a: Ast, n: number, hw: number, hd: number) {
  const k = new Kit(rng(3));
  for (let i = 0; i < n; i++) {
    const x = (a.r() - 0.5) * hw * 2, z = (a.r() - 0.5) * hd * 2;
    k.geo(new THREE.OctahedronGeometry(0.1 + a.r() * 0.12, 0).translate(x, gy(x, z) + 0.05, z), '#e0dce8', 0.05, 0);
  }
  a.g.add(k.build(metalRockMat));
}

// ── kit pieces shared by the claim, the beacon and the rig ───────────────────────────────────
/** A survey lander: a foil-wrapped body on four legs, solar wings, an antenna. */
function scoutLander(a: Ast, x: number, z: number, ry: number) {
  const k = a.k, y = gy(x, z);
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  const geo = (g: THREE.BufferGeometry, p: Paint, j = 0.04) => k.geo(g.applyMatrix4(m), p, j, 0);
  geo(new THREE.CylinderGeometry(0.85, 0.95, 1.1, 8).translate(0, 1.25, 0), FOIL, 0.12);
  geo(new THREE.CylinderGeometry(0.9, 0.9, 0.14, 8).translate(0, 1.86, 0), WHITE);
  geo(new THREE.CylinderGeometry(0.35, 0.5, 0.4, 8).translate(0, 0.55, 0), '#5b5562');
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU + Math.PI / 4;
    const top = V(Math.cos(t) * 0.75, 1.0, Math.sin(t) * 0.75).applyMatrix4(m), foot = V(Math.cos(t) * 1.6, 0.05, Math.sin(t) * 1.6).applyMatrix4(m);
    k.beam(top, foot, 0.08, STEEL);
    k.cyl(0.22, 0.26, 0.08, STEEL, foot.x, foot.y - 0.03, foot.z, 8, { shade: 0 });
  }
  for (const s of [-1, 1]) {
    geo(new THREE.BoxGeometry(2.0, 0.05, 0.9).translate(s * 1.95, 1.55, 0), PANEL, 0.02);
    geo(new THREE.BoxGeometry(0.5, 0.06, 0.08).translate(s * 0.95, 1.55, 0), STEEL);
  }
  geo(new THREE.CylinderGeometry(0.02, 0.02, 1.2).translate(0.3, 2.5, 0.2), WHITE);
  geo(new THREE.SphereGeometry(0.28, 10, 6, 0, TAU, 0, Math.PI / 2.4).rotateX(-0.6).translate(-0.3, 2.0, 0), WHITE);
  return V(x, y + 1.6, z);
}

/** A board on two posts: two lines of text in the owner's colours. Faces +z. */
function board(a: Ast, x: number, z: number, w: number, top: string, bottom: string, accent: Paint, hi: Paint) {
  const y = gy(x, z);
  const bh = w * 0.42;
  for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) a.k.box(0.16, 1.4 + bh, 0.16, '#7a7186', x + sx, y - 0.2, z - 0.06, { r: 0.02 });
  a.k.box(w + 0.2, bh + 0.2, 0.14, mix(accent, '#2f2a3d', 0.45), x, y + 1.15, z - 0.12, { r: 0.04 });
  const tex = canvasTex(`astboard:${top}:${bottom}:${hexOf(accent)}:${hexOf(hi)}`, 640, 270, (g) => {
    g.fillStyle = hexOf(mix(accent, '#2f2a3d', 0.55)); g.fillRect(0, 0, 640, 270);
    g.strokeStyle = hexOf(hi); g.lineWidth = 10; g.strokeRect(8, 8, 624, 254);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fbf7f0'; g.font = FONT(top.length > 16 ? 56 : 70); g.fillText(top, 320, 96, 590);
    g.fillStyle = hexOf(hi); g.font = FONT(bottom.length > 12 ? 54 : 66); g.fillText(bottom, 320, 190, 590);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, bh), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y + 1.25 + bh / 2, z - 0.04);
  a.g.add(m);
}

/** Claim stakes round a rectangle, their lights in the owner's colour blinking in turn. */
function stakes(a: Ast, x0: number, z0: number, x1: number, z1: number, step: number, accent: Paint, skip: (x: number, z: number) => boolean = () => false) {
  const pts: [number, number][] = [];
  const side = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  };
  side(x0, z0, x1, z0); side(x1, z0, x1, z1); side(x1, z1, x0, z1); side(x0, z1, x0, z0);
  pts.forEach(([x, z], i) => {
    if (skip(x, z)) return;
    const y = gy(x, z);
    a.k.box(0.12, 1.2, 0.12, '#c3bcc7', x, y - 0.2, z, { r: 0 });
    a.k.box(0.16, 0.1, 0.16, '#5b5562', x, y + 0.95, z, { r: 0 });
    a.beacon(x, y + 1.12, z, accent, i * 0.9, 0.55);
  });
}

// ── the claim beacon ─────────────────────────────────────────────────────────────────────────
export function astBeacon(o: Act3SetOpts): Piece {
  const t = typeOf(o.variant);
  const seed = o.seed + (o.vseed ?? 0) * 7;
  const a = new Ast(seed, t, o.w, o.d);
  const acc: Paint = o.accent ?? '#2fae9b', hi: Paint = o.hi ?? '#5fd3b5';
  const k = a.k;
  // the lander, tethered down
  const lp = scoutLander(a, -3.6, 0.6, 0.4);
  a.tether(lp, -6.4, -1.4);
  a.tether(lp, -1.2, 3.4);
  // the beacon mast: a three-legged lattice, guyed, the light in the claimant's colour on top
  const mx = 2.2, mz = -2.0, my = gy(mx, mz), H = 8.6;
  k.box(1.6, 0.2, 1.6, '#5b536a', mx, my - 0.05, mz, { r: 0.04 });
  const legs = [0, 1, 2].map((i) => { const tt = (i / 3) * TAU + 0.3; return [Math.cos(tt) * 0.42, Math.sin(tt) * 0.42]; });
  for (const [lx, lz] of legs) k.beam(V(mx + lx, my, mz + lz), V(mx + lx * 0.5, my + H, mz + lz * 0.5), 0.07, WHITE);
  for (let y = 0.6; y < H - 0.4; y += 0.8)
    for (let i = 0; i < 3; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 3];
      const s0 = 1 - (y / H) * 0.5, s1 = 1 - ((y + 0.8) / H) * 0.5;
      k.beam(V(mx + ax * s0, my + y, mz + az * s0), V(mx + bx * s1, my + y + 0.8, mz + bz * s1), 0.035, acc);
    }
  for (const [gx, gz] of [[mx - 3.4, mz - 2.6], [mx + 4.0, mz - 1.0], [mx + 0.4, mz + 4.2]] as [number, number][]) a.tether(V(mx, my + H * 0.62, mz), gx, gz, '#c3bcc7');
  k.cyl(0.36, 0.3, 0.3, DARK, mx, my + H, mz, 10);
  a.beacon(mx, my + H + 0.55, mz, hi, 0, 1.7);
  k.cyl(0.1, 0.1, 0.5, STEEL, mx, my + H + 0.1, mz, 6);
  // the dish, aimed at the Earth
  const dish = new THREE.SphereGeometry(0.9, 14, 6, 0, TAU, 0, Math.PI / 3.2).scale(1, 0.5, 1).rotateX(-1.0).rotateY(0.7).translate(mx + 0.5, my + 5.6, mz + 0.5);
  k.geo(dish, WHITE, 0.02, 0);
  k.beam(V(mx, my + 5.4, mz), V(mx + 0.45, my + 5.55, mz + 0.45), 0.06, STEEL);
  // the claimant's pennant on an arm
  k.beam(V(mx, my + 7.2, mz), V(mx - 1.8, my + 7.2, mz), 0.05, WHITE);
  pennant(a, mx - 1.8, my + 7.2, mz, 1.7, 0.9, acc, hi);
  // the plate: the rock's name, SURVEYED
  board(a, 4.6, 2.4, 3.2, (o.label || 'ASTEROID').toUpperCase(), 'SURVEYED', acc, hi);
  // sample pins on a grid
  const tips: Paint[] = ['#c23a3f', '#fbd46e', '#2fae9b'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const x = -5.6 + i * 1.3, z = 4.2 + j * 1.1, y = gy(x, z);
    k.box(0.05, 0.55, 0.05, '#c3bcc7', x, y - 0.1, z, { r: 0, jitter: 0 });
    k.geo(new THREE.SphereGeometry(0.08, 6, 4).translate(x, y + 0.48, z), tips[(i + j) % 3], 0);
  }
  // the hopping rover: low gravity turns a drive into a run of slow hops
  const rover = new THREE.Group();
  const rk = new Kit(rng(seed + 4));
  rk.box(0.9, 0.36, 0.6, WHITE, 0, 0.22, 0, { r: 0.06 });
  rk.box(0.92, 0.08, 0.62, acc, 0, 0.5, 0, { r: 0.02 });
  for (const dx of [-0.32, 0.32]) for (const dz of [-0.36, 0.36]) rk.cyl(0.16, 0.16, 0.1, '#2f2a3d', dx, 0.18, dz, 8, { rx: Math.PI / 2, shade: 0 });
  rk.box(0.04, 0.5, 0.04, STEEL, 0.3, 0.55, 0, { r: 0 });
  rk.box(0.3, 0.06, 0.3, PANEL, -0.15, 0.6, 0, { r: 0 });
  rover.add(rk.build());
  a.g.add(rover);
  a.anim.add((e) => {
    const T = 12, u = (e.t % T) / T, dirn = u < 0.5 ? 1 : -1;
    const s = u < 0.5 ? u * 2 : 2 - u * 2;
    const x = -5.8 + s * 11.6, z = 6.9;
    const hop = (s * 8) % 1;
    rover.position.set(x, gy(x, z) + Math.sin(hop * Math.PI) * 1.1, z);
    rover.rotation.y = dirn > 0 ? 0 : Math.PI;
    rover.rotation.z = Math.sin(hop * Math.PI * 2) * 0.12 * dirn;
  });
  a.scatter(5, 0.3, 1.1, -7, -7, 7, 7, [[-6, -2, 0, 3], [0, -4.5, 6, 0.5], [-6.5, 3.6, 5.5, 7.6]]);
  a.boulder(-6.0, -5.6, 1.4);
  a.grit(70, -7.5, -7.5, 7.5, 7.5);
  a.track(-5.8, 6.9, 5.8, 6.9, 0.7);
  return a.finish(H + 1);
}

/** A stiff pennant on a rod (no air to fly it), hung from (x, y, z) towards −x. */
function pennant(a: Ast, x: number, y: number, z: number, w: number, h: number, acc: Paint, hi: Paint) {
  const k = a.k;
  k.box(w, h * 0.7, 0.04, acc, x + w / 2 - 0.02, y - h * 0.7, z, { r: 0, jitter: 0.02, shade: 0 });
  k.box(w, h * 0.3, 0.05, hi, x + w / 2 - 0.02, y - h, z, { r: 0, jitter: 0.02, shade: 0 });
}

// ── the claim ────────────────────────────────────────────────────────────────────────────────
/** A crew pod strapped to the rock: a white hull with the owner's band, ports, an airlock. */
function crewPod(a: Ast, x: number, z: number, len: number, acc: Paint) {
  const k = a.k, y = gy(x, z), r = 1.45;
  for (const sx of [-len * 0.3, len * 0.3]) k.box(1.0, 0.9, 2.4, '#7a7186', x + sx, y - 0.2, z, { r: 0.08 });
  const hull = new THREE.CapsuleGeometry(r, len - r * 2, 6, 16).rotateZ(Math.PI / 2).translate(x, y + r + 0.55, z);
  k.geo(hull, HULL, 0.03, 0);
  k.geo(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.5, 16, 1, true).rotateZ(Math.PI / 2).translate(x - len * 0.12, y + r + 0.55, z), acc, 0.02, 0);
  k.geo(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.18, 16, 1, true).rotateZ(Math.PI / 2).translate(x - len * 0.12 + 0.45, y + r + 0.55, z), mix(acc, '#fbf7f0', 0.4), 0.02, 0);
  for (let i = 0; i < 4; i++) {
    const px = x - len / 2 + 1.6 + i * ((len - 3) / 3);
    if (Math.abs(px - (x - len * 0.12)) < 0.6) continue;
    a.port.geo(new THREE.CircleGeometry(0.24, 10).translate(px, y + r + 0.85, z + r + 0.005), '#ffffff', 0, 0);
    k.geo(new THREE.TorusGeometry(0.27, 0.05, 4, 12).translate(px, y + r + 0.85, z + r - 0.02), '#7a7186', 0);
  }
  // the airlock on the end
  k.geo(new THREE.CylinderGeometry(0.8, 0.8, 1.0, 12).rotateZ(Math.PI / 2).translate(x + len / 2 + 0.3, y + r + 0.4, z), WHITE, 0.03, 0);
  k.box(0.1, 1.3, 1.0, '#5b5562', x + len / 2 + 0.84, y + r - 0.25, z, { r: 0.03 });
  a.port.box(0.06, 0.32, 0.5, '#ffffff', x + len / 2 + 0.9, y + r + 0.1, z, { r: 0, jitter: 0 });
  // straps over the hull to anchors either side
  for (const sx of [-len * 0.32, 0.4, len * 0.34]) {
    const top = V(x + sx, y + 2 * r + 0.58, z);
    for (const s of [-1, 1]) {
      const side = V(x + sx, y + r + 0.55, z + s * (r + 0.04));
      k.beam(top, side, 0.08, '#fbd46e');
      a.tether(side, x + sx, z + s * (r + 1.3), '#fbd46e');
    }
  }
  // a radiator and a little dish on top
  k.box(0.06, 1.2, 2.2, WHITE, x + len * 0.2, y + 2 * r + 0.55, z, { r: 0 });
  k.geo(new THREE.SphereGeometry(0.4, 10, 5, 0, TAU, 0, Math.PI / 3).rotateX(-0.5).translate(x - len * 0.35, y + 2 * r + 0.9, z), WHITE, 0.02, 0);
  return V(x, y, z);
}
/** The crew's lander: a stubby body on splayed legs, a window, a beacon on top. */
function crewLander(a: Ast, x: number, z: number, acc: Paint) {
  const k = a.k, y = gy(x, z);
  k.geo(new THREE.CylinderGeometry(0.95, 1.7, 2.4, 8).translate(x, y + 2.3, z), HULL, 0.03, 0);
  k.geo(new THREE.CylinderGeometry(1.72, 1.72, 0.3, 8).translate(x, y + 1.3, z), acc, 0.02, 0);
  k.geo(new THREE.CylinderGeometry(0.55, 0.95, 0.5, 8).translate(x, y + 3.75, z), WHITE, 0.02, 0);
  k.geo(new THREE.CylinderGeometry(0.5, 0.75, 0.7, 10).translate(x, y + 0.75, z), '#5b5562', 0.02, 0);
  a.port.box(0.8, 0.45, 0.06, '#ffffff', x, y + 2.7, z + 1.28, { r: 0, jitter: 0, ry: 0 });
  k.box(1.0, 0.6, 0.08, '#5b5562', x, y + 2.62, z + 1.25, { r: 0.03 });
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU + Math.PI / 4;
    const top = V(x + Math.cos(t) * 1.4, y + 1.4, z + Math.sin(t) * 1.4), foot = V(x + Math.cos(t) * 2.5, y + 0.05, z + Math.sin(t) * 2.5);
    k.beam(top, foot, 0.12, STEEL);
    k.beam(V(x + Math.cos(t) * 1.2, y + 1.0, z + Math.sin(t) * 1.2), foot.clone().lerp(top, 0.4), 0.07, STEEL);
    k.cyl(0.34, 0.4, 0.1, STEEL, foot.x, gy(foot.x, foot.z) - 0.04, foot.z, 8, { shade: 0 });
  }
  k.box(0.08, 0.9, 0.7, STEEL, x - 0.9, y + 0.1, z + 1.3, { r: 0 });
  for (let s = 0; s < 4; s++) k.box(0.6, 0.06, 0.25, STEEL, x - 0.9, y + 0.2 + s * 0.28, z + 1.6 + s * 0.05, { r: 0 });
  a.beacon(x, y + 4.15, z, '#c23a3f', 1.3, 1.1);
}
/** Survey kit: a scanner on a tripod, a radar cart, sample cases, a core drill. */
function surveyKit(a: Ast, x: number, z: number, acc: Paint) {
  const k = a.k, y = gy(x, z);
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * TAU;
    k.beam(V(x, y + 1.4, z), V(x + Math.cos(t) * 0.6, gy(x, z) - 0.05, z + Math.sin(t) * 0.6), 0.05, '#e6e0e3');
  }
  k.box(0.5, 0.36, 0.36, '#fbd46e', x, y + 1.4, z, { r: 0.05 });
  k.geo(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8).rotateX(Math.PI / 2).translate(x, y + 1.6, z + 0.3), DARK, 0);
  a.lamp(x, y + 1.6, z + 0.46, cyanLit, 0.06);
  // the ground radar cart
  const cx = x + 2.8, cz = z + 1.2, cy = gy(cx, cz);
  k.box(1.2, 0.3, 0.7, '#f08a46', cx, cy + 0.2, cz, { r: 0.05 });
  for (const s of [-0.42, 0.42]) k.cyl(0.25, 0.25, 0.08, '#2f2a3d', cx - 0.4, cy + 0.25, cz + s, 10, { rx: Math.PI / 2, shade: 0 });
  k.beam(V(cx + 0.55, cy + 0.4, cz), V(cx + 1.4, cy + 1.1, cz), 0.05, STEEL);
  // sample cases and a core drill
  for (let i = 0; i < 3; i++) k.box(0.7, 0.4, 0.45, i === 1 ? WHITE : acc, x - 1.6 + i * 0.1, gy(x - 1.6, z + 1.2) - 0.02 + (i === 2 ? 0.4 : 0), z + 1.2 + (i === 1 ? 0.55 : 0), { r: 0.05 });
  const dx = x - 2.4, dz = z - 2.2, dy = gy(dx, dz);
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * TAU + 0.5;
    k.beam(V(dx, dy + 2.0, dz), V(dx + Math.cos(t) * 0.9, dy - 0.05, dz + Math.sin(t) * 0.9), 0.06, STEEL);
  }
  k.box(0.34, 0.5, 0.34, '#f08a46', dx, dy + 1.4, dz, { r: 0.05 });
  k.cyl(0.06, 0.06, 1.6, '#c3bcc7', dx, dy - 0.2, dz, 6);
  for (let i = 0; i < 4; i++) k.geo(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6).rotateZ(Math.PI / 2).translate(dx + 1.2, dy + 0.1 + i * 0.18, dz + 0.6), i % 2 ? ROCK.S.base : '#6a6378', 0.05, 0);
}

export function astClaim(o: Act3SetOpts): Piece {
  const t = typeOf(o.variant);
  const post = (o.variant ?? '').endsWith('post');
  const seed = o.seed + (o.vseed ?? 0) * 11;
  const a = new Ast(seed, t, o.w, o.d);
  const acc: Paint = o.accent ?? '#2fae9b', hi: Paint = o.hi ?? '#5fd3b5';
  const owner = builderSign(o.builder ?? 'charter');
  const name = (o.label || 'ASTEROID').toUpperCase();
  // the claim's corner: the owner's flag and board
  a.flag(-9.6, -1.2, 6.4, acc, hi, owner.length <= 8 ? owner : '', 2.8);
  board(a, -4.6, -3.6, 4.6, `${name} CLAIM`, owner, acc, hi);
  stakes(a, -12, -9.4, 12, 9.4, post ? 3.2 : 4.0, acc);
  if (!post) {
    crewPod(a, 3.6, -4.6, 8.0, acc);
    crewLander(a, 8.4, 3.6, acc);
    surveyKit(a, -3.0, 3.4, acc);
    a.track(-1.4, -2.4, 7.2, 1.4, 0.9);
    a.track(-8.6, -0.4, -1.4, -2.4, 0.8);
    a.track(-3.0, 4.2, 6.0, 4.4, 0.7);
    a.suit(-2.6, 4.6, 2.6);
    a.bound([[-1.0, -2.2], [6.2, 0.6], [5.0, 4.8], [-1.4, 2.4]], seed);
    a.scatter(7, 0.3, 1.3, -11, -8.5, 11, 8.5, [[-11, -3.2, 2, 1], [-1.5, -8, 10, -1.5], [5, 0, 11.5, 7.5], [-6.5, 1, 1.5, 6.5]]);
    a.boulder(-9.8, 6.4, 1.8);
    a.boulder(10.6, -7.8, 1.4);
  } else {
    // the claim post at an active mine: a cache strapped down, a marker cairn
    for (let i = 0; i < 3; i++) a.k.box(1.0, 0.7, 0.8, i === 1 ? WHITE : acc, 2.4 + i * 1.1, gy(3, 1) - 0.05, 1.0, { r: 0.06 });
    a.k.beam(V(1.8, gy(1.8, 1) + 0.72, 1.0), V(5.6, gy(5.6, 1) + 0.72, 1.0), 0.06, '#fbd46e');
    for (let i = 0; i < 5; i++) a.boulderAt(-1.0 + (i % 2) * 0.12, gy(-1, 3.4) + 0.1 + i * 0.5, 3.4, 0.55 - i * 0.07);
    // a comms mast: a pole, a dish towards the yards, a light in the owner's colour
    const mx = 6.4, mz = -4.6, my = gy(mx, mz);
    a.k.box(1.2, 0.2, 1.2, '#5b536a', mx, my - 0.05, mz, { r: 0.04 });
    a.k.cyl(0.09, 0.12, 5.2, WHITE, mx, my, mz, 8);
    a.k.geo(new THREE.SphereGeometry(0.8, 14, 6, 0, TAU, 0, Math.PI / 3.2).scale(1, 0.5, 1).rotateX(-1.1).rotateY(-0.6).translate(mx + 0.3, my + 3.8, mz + 0.4), WHITE, 0.02, 0);
    for (const [gx, gz] of [[mx - 2.4, mz - 1.6], [mx + 2.6, mz - 1.2], [mx + 0.2, mz + 2.6]] as [number, number][]) a.tether(V(mx, my + 3.2, mz), gx, gz, '#c3bcc7');
    a.beacon(mx, my + 5.45, mz, acc, 0.7, 1.2);
    a.scatter(12, 0.3, 1.6, -11, -8.5, 11, 8.5, [[-11, -3.2, 2, 1], [1.5, 0, 7, 2]]);
  }
  a.grit(180, -12.5, -10.5, 12.5, 10.5, [[-11, -3, 2, 0.5]]);
  a.dust(1.0, 6.0, 4, 2);
  return a.finish(7.2);
}

// ── the mining rig ───────────────────────────────────────────────────────────────────────────
/** The outcrop: a lumpy mound of the asteroid's rock with a flat, fresh cut face (facing +z) where the rig bites. */
function outcrop(a: Ast, cx: number, cz: number, rx: number, ht: number, rz: number, cut: { z: number; y0: number; y1: number; x0: number; x1: number }, fresh: Paint) {
  const L = a.L;
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position;
  const r = a.r;
  const ph = r() * 10;
  // lumps: a few big bulges and many small facets, the same at shared corners (a function of position)
  const lump = (x: number, y: number, z: number) => 0.82 + 0.16 * Math.sin(x * 2.3 + ph) * Math.cos(z * 1.9 + ph * 0.5) + 0.1 * Math.sin(y * 4.1 + x * 3.3 + z * 2.7) + 0.05 * Math.sin(x * 9.1 + y * 7.3 - z * 8.2);
  for (let i = 0; i < p.count; i++) {
    const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
    const n = lump(x0, y0, z0);
    let x = x0 * rx * n + cx, z = z0 * rz * n + cz;
    const y = y0 * ht * n * (y0 > 0 ? 1 : 0.4) - ht * 0.12;
    // the cut: rock in front of the face is gone
    if (y > cut.y0 && y < cut.y1 && x > cut.x0 && x < cut.x1 && z > cut.z) z = cut.z + (Math.sin(x * 5 + y * 3) * 0.05);
    p.setXYZ(i, x, y, z);
  }
  const up = faceUp(p);
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    let onCut = true;
    for (let j = 0; j < 3; j++) if (Math.abs(p.getZ(i + j) - cut.z) > 0.08) onCut = false;
    const yc = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const nn = r();
    c.copy(col(nn < 0.25 ? L.dark : nn > 0.78 ? L.lit : L.base));
    if (nn > 0.95) c.copy(col(L.tint));
    c.lerp(col(L.hi), Math.max(0, up[i / 3] - 0.5) * 0.9);
    c.multiplyScalar(0.8 + Math.min(1, Math.max(0, yc / ht)) * 0.3);
    if (onCut) c.copy(col(fresh)).multiplyScalar(0.9 + r() * 0.2);
    for (let j = 0; j < 3; j++) cols.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, rockMat);
  m.castShadow = true;
  m.receiveShadow = true;
  a.g.add(m);
}

export function astRig(o: Act3SetOpts): Piece {
  const t = typeOf(o.variant), f = flagsOf(o.variant);
  const live = !f.halted;
  const seed = o.seed + (o.vseed ?? 0) * 17;
  const a = new Ast(seed, t, o.w, o.d);
  const acc: Paint = o.accent ?? '#2fae9b', hi: Paint = o.hi ?? '#5fd3b5';
  const k = a.k, L = a.L;
  // the outcrop at the back left, a fresh face cut into its front
  const cutZ = -2.4, faceX = -6.8, faceY = 3.0;
  outcrop(a, -7.4, -5.4, 7.0, 9.0 + (seed % 3) * 0.7, 6.4, { z: cutZ, y0: 0.3, y1: 6.0, x0: -10.4, x1: -3.2 }, mix(L.fresh, '#e6e0e3', t === 'C' ? 0.25 : 0.1));
  if (t === 'M' && live) {
    // where the laser bites: a white-hot spot in a ragged pool of molten metal, a glowing seam
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 14; i++) { const an = (i / 14) * TAU; const rr = 0.9 + Math.sin(an * 3 + seed) * 0.2 + a.r() * 0.25; pts.push(new THREE.Vector2(Math.cos(an) * rr, Math.sin(an) * rr * 0.8)); }
    const pool = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)).translate(faceX, faceY, cutZ + 0.05), moltenMat);
    a.g.add(pool);
    const hot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10).translate(faceX, faceY, cutZ + 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.8) }));
    a.g.add(hot);
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.12).translate(faceX - 1.2, faceY - 0.4, cutZ + 0.05), moltenMat);
    a.g.add(seam);
  }
  // rubble at the foot of the cut, rocks round the edge
  a.scatter(18, 0.2, 0.75, -10.5, cutZ + 0.3, -3.0, 1.6, []);
  a.scatter(7, 0.6, 1.7, -15, -13, 15, 13, [[-15, -13, -1, 1], [-1, -8, 15, 9], [-15, 1, 15, 8]]);
  // the rig: a deck on four splayed, anchored legs, the body in the owner's colours
  const bx = 6.4, bz = -3.6, by = gy(bx, bz);
  const deckY = by + 2.6, bw = 8.4, bd = 4.6, bh = 3.0;
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const top = V(bx + lx * (bw / 2 - 0.6), deckY, bz + lz * (bd / 2 - 0.5));
    const fx = bx + lx * (bw / 2 + 0.8), fz = bz + lz * (bd / 2 + 1.0);
    const foot = V(fx, gy(fx, fz) + 0.1, fz);
    k.beam(top, foot, 0.3, '#7a7186');
    k.beam(top.clone().lerp(foot, 0.5), V(bx + lx * (bw / 2 - 1.6), deckY, bz + lz * (bd / 2 - 0.5)), 0.14, '#7a7186');
    k.cyl(0.55, 0.65, 0.2, '#5b536a', fx, foot.y - 0.12, fz, 8, { shade: 0 });
    a.tether(V(bx + lx * (bw / 2), deckY + bh, bz + lz * (bd / 2)), fx + lx * 1.2, fz + lz * 1.0, '#c3bcc7');
  }
  k.box(bw + 0.4, 0.4, bd + 0.4, '#5b5562', bx, deckY - 0.2, bz, { r: 0.06 });
  k.box(bw, bh, bd, '#d8d2cc', bx, deckY + 0.2, bz, { r: 0.18, jitter: 0.03, shade: 0.15 });
  k.box(bw + 0.06, 0.4, bd + 0.06, acc, bx, deckY + bh - 0.6, bz, { r: 0.04, shade: 0 });
  k.box(bw + 0.07, 0.14, bd + 0.07, hi, bx, deckY + bh - 0.75, bz, { r: 0.02, shade: 0 });
  for (let i = 0; i < 5; i++) {
    a.port.box(0.7, 0.55, 0.05, '#ffffff', bx - 1.0 + i * 1.05, deckY + 1.4, bz + bd / 2 + 0.03, { r: 0, jitter: 0 });
    k.box(0.85, 0.7, 0.06, '#5b5562', bx - 1.0 + i * 1.05, deckY + 1.33, bz + bd / 2 + 0.01, { r: 0.02 });
  }
  if (f.q >= 2) for (let i = 0; i < 3; i++) a.lamp(bx - 1.0 + i * 2.1, deckY + 1.68, bz + bd / 2 + 0.08, quarantineMat, 0.22);
  // the smelter's port, glowing
  const port = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), live ? moltenMat : coldPortMat);
  port.position.set(bx - 2.7, deckY + 0.95, bz + bd / 2 + 0.04);
  a.g.add(port);
  k.box(1.6, 1.4, 0.1, '#433c52', bx - 2.7, deckY + 0.25, bz + bd / 2, { r: 0.03 });
  // a radiator mast and a pennant on the roof
  for (let i = 0; i < 3; i++) k.box(0.08, 3.4, 1.4, WHITE, bx + 2.0 + i * 0.6, deckY + bh + 0.2, bz - 0.8, { r: 0 });
  k.box(2.2, 0.16, 0.2, STEEL, bx + 2.6, deckY + bh + 0.3, bz - 0.8, { r: 0 });
  k.cyl(0.05, 0.05, 1.8, WHITE, bx + 3.6, deckY + bh + 0.2, bz + 1.4, 6);
  pennant(a, bx + 3.62, deckY + bh + 1.95, bz + 1.4, 1.2, 0.7, acc, hi);
  a.plate(`R${o.n ?? 1}`, 1.1, bx + 3.0, deckY + 0.85, bz + bd / 2 + 0.06, '#fbf7f0', mix(acc, '#2f2a3d', 0.4));
  // the boom: shoulder, elbow, the cutter at the face
  const shoulder = V(bx - bw / 2 + 0.4, deckY + 2.2, bz + 0.8), elbow = V(-0.6, deckY + 5.0, -1.4), tip = V(faceX, faceY, cutZ + 1.15);
  k.box(1.2, 1.2, 1.2, '#5b5562', shoulder.x, shoulder.y - 0.6, shoulder.z, { r: 0.1 });
  truss(k, shoulder, elbow, 0.7, acc, '#7a7186', 0.14);
  truss(k, elbow, tip.clone().add(V(0.9, 0.5, 0)), 0.6, acc, '#7a7186', 0.12);
  k.geo(new THREE.SphereGeometry(0.45, 10, 8).translate(elbow.x, elbow.y, elbow.z), '#5b5562', 0.02, 0);
  k.beam(shoulder.clone().add(V(0, -0.5, 0.4)), elbow.clone().lerp(tip, 0.3).add(V(0, -0.2, 0.4)), 0.16, '#c3bcc7');
  k.box(1.0, 0.6, 1.6, '#5b5562', tip.x + 1.1, tip.y + 0.25, tip.z, { r: 0.08 });
  const cutter = new THREE.Group();
  cutter.position.copy(tip);
  a.g.add(cutter);
  const contact = V(faceX, faceY - 0.2, cutZ + 0.2);
  if (t === 'M') {
    // a laser head and its beam into the metal, sparks
    const ck = new Kit(rng(seed + 9));
    ck.box(0.8, 0.8, 0.9, '#5b5562', 0, -0.4, 0.1, { r: 0.08 });
    ck.geo(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, -0.5), DARK, 0);
    cutter.add(ck.build());
    if (live) {
      const len = tip.z - 0.7 - cutZ;
      const beamM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.2) }));
      beamM.position.set(tip.x, tip.y, cutZ + len / 2);
      a.g.add(beamM);
      a.anim.add((e) => { beamM.scale.set(0.8 + Math.abs(Math.sin(e.t * 23)) * 0.5, 0.8 + Math.abs(Math.sin(e.t * 19)) * 0.5, 1); });
    }
  } else {
    // a toothed cutting drum on an arm, turning against the face
    const ck = new Kit(rng(seed + 9));
    ck.geo(new THREE.CylinderGeometry(1.0, 1.0, 1.4, 14).rotateZ(Math.PI / 2), '#7a7186', 0.03, 0);
    ck.geo(new THREE.CylinderGeometry(0.4, 0.4, 1.7, 10).rotateZ(Math.PI / 2), DARK, 0);
    for (let i = 0; i < 12; i++) {
      const tt = (i / 12) * TAU;
      for (const dx of [-0.42, 0.0, 0.42]) ck.box(0.22, 0.28, 0.3, '#c3bcc7', dx + (i % 2 ? 0.1 : -0.1), Math.sin(tt) * 1.08 - 0.14, Math.cos(tt) * 1.08, { r: 0.02 });
    }
    const drum = ck.build();
    cutter.add(drum);
    if (live) a.anim.add((e) => { drum.rotation.x -= e.dt * 2.2; cutter.position.x = tip.x + Math.sin(e.t * 0.4) * 0.6; });
  }
  // dust thrown off the face in slow arcs (sparks off metal), vapour baking off carbon-rich rock
  if (live) {
    const dust = new Spray({ count: 90, life: 6, dir: V(0.35, 0.7, 0.62).normalize(), spread: 0.6, speed: [0.9, 2.6], g: 0.2, size: [0.4, 1.8], color: mix(L.hi, '#d8d2cc', 0.55), opacity: 0.7, floor: -contact.y }, seed);
    dust.obj.position.copy(contact);
    a.g.add(dust.obj);
    a.anim.add((e) => dust.update(e));
    if (t === 'M') {
      const sparks = new Spray({ count: 60, life: 1.6, dir: V(0.3, 0.55, 0.8).normalize(), spread: 0.9, speed: [2, 5], g: 0.4, size: [0.14, 0.05], color: '#ffd27a', opacity: 1, additive: true }, seed + 1);
      sparks.obj.position.copy(contact);
      a.g.add(sparks.obj);
      a.anim.add((e) => sparks.update(e));
    }
    if (t === 'C') {
      const vap = new Plume({ count: 14, life: 8, rise: 0.9, spread: 1.2, size0: 1.2, size1: 5, opacity: 0.3, radius: 0.5, wind: 0.0, color: '#e6e0e3' }, seed + 2);
      vap.obj.position.set(bx + 0.6, deckY + bh + 0.6, bz - 0.4);
      a.g.add(vap.obj);
      a.anim.add((e) => vap.update(e));
      k.cyl(0.35, 0.4, 0.7, STEEL, bx + 0.6, deckY + bh, bz - 0.4, 10);
    }
  }
  // the floodlight on the face, the warning light
  k.box(0.14, 2.4, 0.14, STEEL, bx - bw / 2 + 0.6, deckY + bh, bz + 1.6, { r: 0 });
  k.box(0.8, 0.5, 0.4, DARK, bx - bw / 2 + 0.3, deckY + bh + 2.3, bz + 1.6, { r: 0.05 });
  if (live) a.lamp(bx - bw / 2 - 0.1, deckY + bh + 2.55, bz + 1.6, floodMat, 0.2);
  a.beacon(bx + 0.4, deckY + bh + 0.7, bz + 1.3, live ? '#f7b258' : '#c23a3f', seed * 0.3, 1.2);
  // the conveyor: from a hopper under the face, along the front, up to the hauler
  const cz = 3.8;
  const hop = V(-6.2, gy(-6.2, 2.4), 2.4);
  k.box(2.4, 1.0, 1.8, '#5b5562', hop.x, hop.y, hop.z, { r: 0.08 });
  k.geo(new THREE.CylinderGeometry(1.5, 0.8, 0.9, 4, 1, true).rotateY(Math.PI / 4).translate(hop.x, hop.y + 1.45, hop.z), acc, 0.03, 0);
  const c0 = V(-5.4, gy(-5.4, cz) + 1.1, cz), c1 = V(11.2, gy(11.2, cz) + 2.9, cz);
  const dir = c1.clone().sub(c0);
  const clen = dir.length();
  dir.normalize();
  const belt = new THREE.BoxGeometry(clen, 0.16, 1.0).rotateZ(Math.atan2(dir.y, dir.x)).translate((c0.x + c1.x) / 2, (c0.y + c1.y) / 2, cz);
  k.geo(belt, '#2f2a3d', 0.02, 0);
  for (const sd of [-0.55, 0.55]) k.beam(c0.clone().add(V(0, 0.12, sd)), c1.clone().add(V(0, 0.12, sd)), 0.1, STEEL);
  for (let i = 1; i < 7; i++) {
    const q = c0.clone().lerp(c1, i / 7);
    for (const sd of [-0.5, 0.5]) k.beam(q.clone().add(V(0, -0.05, sd)), V(q.x, gy(q.x, cz + sd) - 0.1, cz + sd * 1.4), 0.08, '#7a7186');
  }
  const lumps = new THREE.InstancedMesh(boulderUnit(t), rockMat, 18);
  lumps.castShadow = true;
  a.g.add(lumps);
  const lm = new THREE.Matrix4(), lq = new THREE.Quaternion();
  const hx = 12.8, hz = cz + 0.4;
  const binY = gy(hx, hz) + 2.1;
  const placeLumps = (time: number) => {
    for (let i = 0; i < 18; i++) {
      const u = ((time * 0.05 + i / 18) % 1);
      let p: THREE.Vector3;
      if (u < 0.9) p = c0.clone().lerp(c1, u / 0.9).add(V(0, 0.3, ((i % 3) - 1) * 0.25));
      else {
        const fall = (u - 0.9) / 0.1;
        p = c1.clone().add(V(fall * 1.2, 0.3 - fall * fall * (c1.y + 0.3 - binY), 0));
      }
      lq.setFromAxisAngle(V(0, 1, 0), i * 1.3);
      lm.compose(p, lq, V(0.28, 0.24, 0.28).multiplyScalar(0.8 + (i % 4) * 0.12));
      lumps.setMatrixAt(i, lm);
    }
    lumps.instanceMatrix.needsUpdate = true;
  };
  placeLumps(0);
  if (live) a.anim.add((e) => placeLumps(e.t));
  // the hauler under the conveyor's end: six wheels, an open bin heaped with ore
  hauler(a, hx, hz, acc, hi);
  // quarantine: a net of cables round the rig, pink lights on its poles
  if (f.q) quarantine(a, bx, bz, bw + 4, bd + 4.6, deckY + bh + 1.5, f.q, seed);
  if (!live) {
    a.plate('HALT', 1.8, bx - 1.0, deckY + bh + 0.8, bz + bd / 2 + 0.3, '#fde9a4', '#93243a');
    for (const sd of [-1.6, 0.6]) k.box(0.1, 0.9, 0.1, STEEL, bx - 1.0 + sd * 0.6, deckY + bh, bz + bd / 2 + 0.25, { r: 0 });
  }
  // a crew on the ground by the hauler
  a.bound([[9.0, 8.4], [0.6, 8.6], [-2.4, 6.6]], seed);
  a.grit(220, -15.5, -13.5, 15.5, 13.5, [[-15, -12, -1.5, -0.6]]);
  a.dust(-4.0, 1.8, 5.0, 1.6);
  a.track(-3, 9.4, 14, 9.4, 1.6);
  return a.finish(Math.max(deckY + bh + 3.6, 10));
}
const floodMat = new THREE.MeshStandardMaterial({ color: col('#fff6d8'), emissive: col('#fff6d8'), emissiveIntensity: 2.2 });
const quarantineMat = new THREE.MeshStandardMaterial({ color: col('#f7a6c4'), emissive: col('#e86aa0'), emissiveIntensity: 1.6 });
const unitCache = new Map<string, THREE.BufferGeometry>();
function boulderUnit(t: string) {
  let g = unitCache.get(t);
  if (!g) {
    const k = new Kit(rng(3));
    k.geo(new THREE.DodecahedronGeometry(1, 0), ROCK[t as 'C'].lit, 0.15, 0);
    unitCache.set(t, (g = k.build().geometry));
  }
  return g;
}

/** An ore hauler: a low chassis on six big wheels, a cab, an open bin in the owner's colours. */
function hauler(a: Ast, x: number, z: number, acc: Paint, hi: Paint) {
  const k = a.k, y = gy(x, z);
  for (const dx of [-1.4, 0, 1.4]) for (const s of [-1, 1]) {
    k.geo(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 12).rotateX(Math.PI / 2).translate(x + dx, y + 0.6, z + s * 1.25), '#2f2a3d', 0.02, 0);
    k.geo(new THREE.CylinderGeometry(0.3, 0.3, 0.54, 8).rotateX(Math.PI / 2).translate(x + dx, y + 0.6, z + s * 1.25), STEEL, 0.02, 0);
  }
  k.box(4.4, 0.5, 2.2, '#5b5562', x, y + 0.75, z, { r: 0.06 });
  k.box(1.3, 1.4, 2.0, WHITE, x - 2.2, y + 1.2, z, { r: 0.12 });
  a.port.box(0.05, 0.6, 1.4, '#ffffff', x - 2.86, y + 1.8, z, { r: 0, jitter: 0 });
  // the bin: walls in the owner's colour, ore heaped inside
  const by = y + 1.25;
  k.box(3.2, 0.2, 2.3, acc, x + 0.6, by, z, { r: 0.03 });
  for (const s of [-1, 1]) k.box(3.2, 1.3, 0.14, acc, x + 0.6, by, z + s * 1.1, { r: 0.03 });
  k.box(0.14, 1.3, 2.3, acc, x - 1.0, by, z, { r: 0.03 });
  k.box(0.14, 1.0, 2.3, acc, x + 2.2, by, z, { r: 0.03 });
  k.box(3.3, 0.14, 2.42, hi, x + 0.6, by + 1.25, z, { r: 0.02 });
  for (let i = 0; i < 9; i++) a.boulderAt(x - 0.4 + a.r() * 2.0, by + 0.85 + a.r() * 0.3, z + (a.r() - 0.5) * 1.6, 0.35 + a.r() * 0.25);
  a.beacon(x - 2.2, y + 2.75, z, '#f7b258', 2, 0.8);
}

/** A quarantine net: poles round the rig, cables between them, a mesh across the front, pink lights. */
function quarantine(a: Ast, x: number, z: number, w: number, d: number, ht: number, q: number, seed: number) {
  const k = a.k;
  const cs: [number, number][] = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]];
  const tops = cs.map(([cx, cz]) => {
    const y = gy(cx, cz);
    k.box(0.2, ht - y, 0.2, '#e6e0e3', cx, y - 0.1, cz, { r: 0 });
    a.beacon(cx, ht + 0.3, cz, '#e86aa0', seed + cx, 1.1);
    return V(cx, ht, cz);
  });
  for (let i = 0; i < 4; i++) k.beam(tops[i], tops[(i + 1) % 4], 0.05, '#f7a6c4');
  if (q >= 2) for (let i = 0; i < 4; i++) k.beam(tops[i], tops[(i + 2) % 4], 0.04, '#f7a6c4');
  // a mesh down the front
  const n = 3 + q * 2;
  const [fx0, fz0] = cs[3], [fx1] = cs[2];
  for (let i = 0; i <= n; i++) {
    const xx = fx0 + ((fx1 - fx0) * i) / n;
    k.beam(V(xx, ht, fz0), V(xx, gy(xx, fz0) + 0.2, fz0), 0.03, '#f7a6c4');
  }
  for (let j = 1; j < 2 + q; j++) {
    const yy = gy(x, fz0) + ((ht - gy(x, fz0)) * j) / (2 + q);
    k.beam(V(fx0, yy, fz0), V(fx1, yy, fz0), 0.03, '#f7a6c4');
  }
  a.plate('QUARANTINE', 2.6, x, gy(x, fz0) + 2.0, fz0 + 0.1, '#fbf7f0', '#a8336a');
}

// ── the mass catapult ────────────────────────────────────────────────────────────────────────
export function astCatapult(o: Act3SetOpts): Piece {
  const t = typeOf(o.variant), f = flagsOf(o.variant);
  const live = !f.halted;
  const seed = o.seed + (o.vseed ?? 0) * 23;
  const a = new Ast(seed, t, o.w, o.d);
  const acc: Paint = o.accent ?? '#2fae9b', hi: Paint = o.hi ?? '#5fd3b5';
  const k = a.k;
  // the breech: an armoured loading house with capacitor drums on the roof
  const hx = -15.4, hz = -1.0, hy = gy(hx, hz), hw = 11.0, hd = 7.6, hh = 4.6;
  k.box(hw + 0.6, 0.5, hd + 0.6, '#5b536a', hx, hy - 0.35, hz, { r: 0.06 });
  k.box(hw, hh, hd, '#d8d2cc', hx, hy, hz, { r: 0.2, jitter: 0.03, shade: 0.15 });
  for (let i = 0; i < 7; i++) k.box(0.14, hh - 0.6, 0.08, '#c3bcc7', hx - hw / 2 + 0.9 + i * 1.55, hy + 0.3, hz + hd / 2 + 0.02, { r: 0, jitter: 0 });
  k.box(hw + 0.06, 0.45, hd + 0.06, acc, hx, hy + hh - 1.0, hz, { r: 0.04, shade: 0 });
  k.box(hw + 0.07, 0.14, hd + 0.07, hi, hx, hy + hh - 1.18, hz, { r: 0.02, shade: 0 });
  k.box(hw + 0.2, 0.3, hd + 0.2, '#7a7186', hx, hy + hh - 0.05, hz, { r: 0.04 });
  const caps: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = hx - hw / 2 + 1.4 + i * 2.05, cz = hz - 1.2;
    k.cyl(0.75, 0.75, 1.8, WHITE, cx, hy + hh + 0.2, cz, 14);
    k.cyl(0.78, 0.78, 0.18, '#7a7186', cx, hy + hh + 1.3, cz, 14, { shade: 0 });
    caps.push(a.lamp(cx, hy + hh + 2.08, cz, live ? cyanLit : cyanDark, 0.26));
    k.cyl(0.2, 0.2, 0.2, DARK, cx, hy + hh + 2.0, cz, 8);
  }
  for (let i = 0; i < 4; i++) a.port.box(0.9, 0.5, 0.05, '#ffffff', hx - 3.2 + i * 1.4, hy + 2.7, hz + hd / 2 + 0.04, { r: 0, jitter: 0 });
  a.plate('CATAPULT', 3.2, hx + 2.4, hy + 2.6, hz + hd / 2 + 0.06, '#5fd3b5', '#2f2a3d');
  // the loading door and the pods waiting outside
  k.box(3.0, 2.6, 0.12, '#7a7186', hx - 2.6, hy + 0.1, hz + hd / 2 + 0.04, { r: 0.03 });
  for (let yy = 0.4; yy < 2.6; yy += 0.32) k.box(2.9, 0.04, 0.05, '#5b5562', hx - 2.6, hy + yy, hz + hd / 2 + 0.11, { r: 0, jitter: 0 });
  for (let i = 0; i < 6; i++) {
    const px = hx - 4.4 + (i % 3) * 1.25, pz = hz + hd / 2 + 1.8 + Math.floor(i / 3) * 1.2;
    capsuleInto(k, px, gy(px, pz) + 0.45, pz, acc, Math.PI / 2);
  }
  // the rail: two rails through a run of coils, rising from the breech at ~20°, on anchored trestles
  const r0 = V(-9.4, gy(-9.4, 0) + 3.2, 0), ang = 0.36;
  const len = 30.4;
  const dir = V(Math.cos(ang), Math.sin(ang), 0);
  const r1 = r0.clone().addScaledVector(dir, len);
  k.box(1.4, 2.6, 2.4, '#5b5562', hx + hw / 2 + 0.4, hy + 1.0, 0, { r: 0.08 });
  for (const s of [-0.42, 0.42]) k.beam(r0.clone().add(V(0, -0.5, s)), r1.clone().add(V(0, -0.5, s)), 0.14, '#7a7186');
  k.beam(r0.clone().add(V(0, -0.85, 0)), r1.clone().add(V(0, -0.85, 0)), 0.22, '#5b5562');
  const coilGeo = new THREE.TorusGeometry(0.72, 0.16, 6, 16).rotateY(Math.PI / 2).rotateZ(ang);
  const coils: { m: THREE.Mesh; s: number }[] = [];
  const coilMats: THREE.MeshStandardMaterial[] = [];
  for (let s = 0.6; s < len - 0.2; s += 1.25) {
    const p = r0.clone().addScaledVector(dir, s);
    k.geo(coilGeo.clone().translate(p.x, p.y - 0.25, p.z), '#5b536a', 0.03, 0);
    const m = new THREE.MeshStandardMaterial({ color: col('#156466'), emissive: col('#5fd3b5'), emissiveIntensity: 0, roughness: 0.6 });
    coilMats.push(m);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.07, 4, 16).rotateY(Math.PI / 2).rotateZ(ang), m);
    band.position.set(p.x + 0.12, p.y - 0.25, p.z);
    a.g.add(band);
    coils.push({ m: band, s });
  }
  for (let s = 3.0; s < len; s += 5.2) {
    const p = r0.clone().addScaledVector(dir, s).add(V(0, -0.95, 0));
    for (const sz of [-1, 1]) {
      const fx = p.x, fz = sz * 2.4;
      const foot = V(fx, gy(fx, fz) + 0.05, fz);
      k.beam(p.clone().add(V(0, 0, sz * 0.35)), foot, 0.2, '#7a7186');
      k.cyl(0.42, 0.5, 0.18, '#5b536a', fx, foot.y - 0.1, fz, 8, { shade: 0 });
      a.tether(p.clone().add(V(0, 0, sz * 0.3)), fx + 1.6, sz * 4.6, '#c3bcc7');
    }
    k.beam(p.clone().add(V(0, 0, -0.4)), p.clone().add(V(0, 0, 0.4)), 0.16, '#7a7186');
    k.beam(V(p.x, gy(p.x, -2) + 0.8, -2.0), V(p.x, gy(p.x, 2) + 0.8, 2.0), 0.1, '#7a7186');
  }
  // the muzzle frame and its light
  const mp = r1.clone();
  k.geo(new THREE.TorusGeometry(1.1, 0.22, 6, 18).rotateY(Math.PI / 2).rotateZ(ang).translate(mp.x, mp.y - 0.25, mp.z), acc, 0.02, 0);
  for (const sz of [-1, 1]) {
    k.beam(V(mp.x, mp.y - 0.4, sz * 1.0), V(mp.x - 0.6, gy(mp.x, sz * 3) + 0.05, sz * 3.0), 0.22, '#7a7186');
    k.cyl(0.42, 0.5, 0.18, '#5b536a', mp.x - 0.6, gy(mp.x, sz * 3) - 0.08, sz * 3.0, 8, { shade: 0 });
  }
  a.beacon(mp.x, mp.y + 1.1, mp.z, live ? '#f7b258' : '#c23a3f', 0, 1.3);
  // the capsule in flight: loaded at the breech, flung up the rail, away toward the yards
  if (live) {
    const cap = new THREE.Group();
    const ck = new Kit(rng(seed + 7));
    capsuleInto(ck, 0, 0, 0, acc, 0);
    cap.add(ck.build());
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8).scale(1.6, 1, 1), haloMat);
    halo.renderOrder = 6;
    cap.add(halo);
    a.g.add(cap);
    const flash = a.lamp(r0.x - 0.6, r0.y - 0.2, 0, flashMat, 0.6);
    // the next capsule, loaded into the cradle while this one flies
    const next = new THREE.Group();
    const nk = new Kit(rng(seed + 8));
    capsuleInto(nk, 0, 0, 0, acc, 0);
    next.add(nk.build());
    next.position.set(r0.x, r0.y + 0.05, 0);
    next.rotation.z = ang;
    a.g.add(next);
    const P = 6.4, accelT = 2.0;
    const vExit = (2 * len) / accelT;
    a.anim.add((e) => {
      const tt = (e.t + seed * 0.37) % P;
      let s: number;
      if (tt < 0.8) s = 0;
      else if (tt < 0.8 + accelT) { const u = (tt - 0.8) / accelT; s = len * u * u; }
      else s = len + vExit * (tt - 0.8 - accelT);
      const p = r0.clone().addScaledVector(dir, s);
      cap.position.set(p.x, p.y + 0.05, p.z);
      cap.rotation.z = ang;
      const far = Math.max(0, s - len);
      cap.scale.setScalar(Math.max(0.0001, 1 - far / 130));
      cap.visible = far < 128;
      next.visible = tt > 3.6;
      flash.scale.setScalar(tt > 0.75 && tt < 1.05 ? 0.9 : 0.0001);
      halo.visible = s > 0;
      for (let i = 0; i < coils.length; i++) {
        const d = Math.abs(coils[i].s - s);
        coilMats[i].emissiveIntensity = s < len + 1 && tt > 0.8 ? Math.max(0, 2.4 - d * 0.9) : 0.08;
      }
    });
  } else {
    a.plate('HALT', 2.2, hx - 2.0, hy + hh + 3.0, hz + 1.0, '#fde9a4', '#93243a');
    k.box(0.1, 2.6, 0.1, STEEL, hx - 2.0, hy + hh, hz + 0.9, { r: 0 });
  }
  // ore feed from the rigs: a conveyor into the back of the breech
  const f0 = V(-21.4, gy(-21.4, -4) + 1.0, -4.2), f1 = V(hx - hw / 2 + 0.2, hy + 2.2, -4.2);
  k.beam(f0, f1, 0.5, '#2f2a3d');
  for (const s of [-0.4, 0.4]) k.beam(f0.clone().add(V(0, 0.15, s)), f1.clone().add(V(0, 0.15, s)), 0.08, STEEL);
  // a crew member by the pods, boulders round about
  a.suit(hx + 1.6, hz + hd / 2 + 2.6, 2.4);
  a.scatter(14, 0.3, 1.4, -21, -11, 21, 11, [[-21, -5.5, -9, 8.2], [-10, -3.5, 21.5, 3.8]]);
  a.boulder(9.4, -8.6, 1.9);
  a.boulder(-3.4, 8.6, 1.5);
  a.grit(260, -21.5, -11.5, 21.5, 11.5, [[-21, -5, -9.6, 3]]);
  a.dust(2, 7.2, 5, 2.4);
  a.track(-12, 7.4, 8, 7.8, 1.2);
  return a.finish(r1.y + 1.6);
}
const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 1.4), transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 3.4, 3.0), transparent: true, opacity: 0.8, depthWrite: false });

/** An ore capsule (into a kit): a white hull with the owner's band and a dark nose. */
function capsuleInto(k: Kit, x: number, y: number, z: number, acc: Paint, ry: number) {
  const g = new THREE.CapsuleGeometry(0.42, 1.0, 4, 12).rotateZ(Math.PI / 2);
  const band = new THREE.CylinderGeometry(0.44, 0.44, 0.24, 12, 1, true).rotateZ(Math.PI / 2);
  const nose = new THREE.SphereGeometry(0.3, 10, 6).scale(0.8, 1, 1).translate(0.82, 0, 0);
  for (const [geo, p] of [[g, WHITE], [band, acc], [nose, '#433c52']] as [THREE.BufferGeometry, Paint][]) {
    geo.rotateY(ry);
    geo.translate(x, y, z);
    k.geo(geo, p, 0.03, 0);
  }
}
