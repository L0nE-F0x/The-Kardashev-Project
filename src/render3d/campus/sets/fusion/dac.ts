/**
 * Direct air capture (Carbonfold by default): two long walls of fan modules — containers stacked
 * two high, six big fans on every face, spinning — pulling air through sorbent filters, a manifold
 * along their tops to the CO₂ compressor house and its bullet tanks, then a pipe rack out to the
 * stone-injection wellheads (the gas goes down into basalt and turns to rock), the newest well
 * under a slim derrick. The builder's colours on the module ends, the sign and the trims.
 */
import * as THREE from 'three';
import { glowMat, col } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { fanRotor, pipeStands, wallLamp, warmPool, windowRow } from '../../plants2/parts';
import { lightPool } from '../../../kit';
import { beacon, Ctx, fenceRect, figure, hcyl, lampsAt, mixHex, P, pipeRun, placard, shed, V } from './common';
import { model } from '../../../models';

const ledGreen = glowMat('grn6', 0);
ledGreen.color.copy(col('#3f5a3a'));
ledGreen.userData.nightOnly = 2.4;

/** One Christmas tree on its pad: a spool stack with red handwheels and a little rail. */
function wellhead(c: Ctx, x: number, z: number) {
  const { k } = c;
  k.box(2.4, 0.2, 2.4, P.concrete2, x, 0, z, { r: 0.05 });
  k.cyl(0.42, 0.48, 0.5, '#7a7186', x, 0.2, z, 10);
  k.cyl(0.26, 0.26, 2.2, '#9aa0a8', x, 0.6, z, 10);
  for (const y of [1.0, 1.7]) {
    k.box(0.9, 0.42, 0.42, '#8a8f98', x, y, z, { r: 0.05 });
    for (const s of [-1, 1]) k.geo(new THREE.TorusGeometry(0.22, 0.05, 4, 10).rotateY(Math.PI / 2).translate(x + s * 0.55, y + 0.22, z), 'red3', 0, 0);
  }
  k.cyl(0.36, 0.36, 0.2, 'red3', x, 2.8, z, 10);
  hcyl(k, 0.14, 1.0, '#9aa0a8', x, 1.2, z - 0.7, 'z', 8);
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) k.box(0.06, 1.0, 0.06, P.safety, x + dx, 0.2, z + dz, { r: 0, jitter: 0 });
  for (const [ax, az, bx, bz] of [[-1.1, -1.1, 1.1, -1.1], [1.1, -1.1, 1.1, 1.1], [-1.1, -1.1, -1.1, 1.1], [-1.1, 1.1, -0.3, 1.1]]) k.beam(V(x + ax, 1.15, z + az), V(x + bx, 1.15, z + bz), 0.05, P.safety);
}

export function dacFarm(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'CARBONFOLD');
  const { k, g, L, W, D, r } = c;
  const vs = o.vseed ?? o.seed % 3;
  // the yard: gravel, a fence, a gate at the front right
  k.box(W - 0.8, 0.1, D - 0.8, '#c9bfae', 0, -0.05, 0, { r: 0.06, jitter: 0.015, shade: 0 });
  fenceRect(c, W - 1.6, D - 1.6, -4.5, 6.0, 1.5);
  k.box(5.4, 0.05, 6.0, P.asphalt, -4.5, 0.02, D / 2 - 3.8, { r: 0.03, shade: 0 });
  // ── the fan walls ──
  const MW = 3.6, MD = 2.4, MH = 2.5, NMOD = 6, x0 = -W / 2 + 1.6 + MW / 2;
  const rows = [-6.4, 0.2];
  const fanAt: THREE.Vector3[] = [];
  const body = '#b9bcbf', frame = '#5b5562', face = '#4a4452';
  rows.forEach((rz, ri) => {
    k.box(NMOD * MW + 0.6, 0.3, MD + 0.6, P.concrete2, x0 + ((NMOD - 1) * MW) / 2, 0, rz, { r: 0.05 });
    for (let m = 0; m < NMOD; m++) {
      const mx = x0 + m * MW;
      for (let t = 0; t < 2; t++) {
        const y = 0.3 + t * (MH + 0.06);
        const tint = mixHex(body, m % 2 ? '#ffffff' : '#7a7186', 0.06 + 0.04 * ((m + t + ri) % 3));
        k.box(MW - 0.06, MH, MD, tint, mx, y, rz, { r: 0.08, shade: 0.06 });
        // frame posts at the corners, the builder's colour on the end panels
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.16, MH, 0.16, frame, mx + sx * (MW / 2 - 0.1), y, rz + sz * (MD / 2 - 0.05), { r: 0.02, jitter: 0 });
        if (m === 0 || m === NMOD - 1) k.box(0.08, MH - 0.3, MD - 0.4, L.acc, mx + (m === 0 ? -1 : 1) * (MW / 2 - 0.01), y + 0.15, rz, { r: 0.02, shade: 0.05 });
        // the fan face: a dark recess, six shrouds
        k.box(MW - 0.4, MH - 0.3, 0.1, face, mx, y + 0.15, rz + MD / 2 + 0.01, { r: 0.02, jitter: 0, shade: 0 });
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) {
            const fx = mx + (i - 1) * 1.08, fy = y + 0.72 + j * 1.08, fz = rz + MD / 2 + 0.06;
            k.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.24, 14, 1, true).rotateX(Math.PI / 2).translate(fx, fy, fz + 0.06), '#cfcbc6', 0.02, 0);
            fanAt.push(V(fx, fy, fz + 0.12));
          }
        // the back: louvres over the sorbent beds
        for (let yy = y + 0.3; yy < y + MH - 0.2; yy += 0.26) k.box(MW - 0.5, 0.06, 0.12, '#8e8a92', mx, yy, rz - MD / 2 - 0.04, { r: 0, jitter: 0, shade: 0 });
      }
      // the roof: regeneration vents
      k.box(1.0, 0.4, 0.8, P.hvac, mx - 0.8, 0.3 + 2 * MH + 0.06, rz - 0.4, { r: 0.05 });
    }
    // the manifold along the tops, dropping to the compressor house
    const ty = 0.3 + 2 * (MH + 0.06) + 0.6;
    const xr = x0 + (NMOD - 1) * MW + MW / 2;
    pipeRun(k, [V(x0 - MW / 2 + 0.4, ty, rz + 0.5), V(xr + 1.0, ty, rz + 0.5), V(xr + 1.0, 3.2, rz + 0.5), V(10.4, 3.2, rz + 0.5)], 0.26, L.acc, { seg: 10, band: 2.4, bandPaint: mixHex(L.acc, '#2f2a3d', 0.3) });
    for (let m = 0; m < NMOD; m++) k.box(0.16, 0.6, 0.16, P.steelDark, x0 + m * MW, ty - 0.6, rz + 0.5, { r: 0, jitter: 0 });
    pipeStands(k, [V(xr + 1.0, 3.2, rz + 0.5), V(10.4, 3.2, rz + 0.5)], 0.26, 2.2);
  });
  // the fans (instanced, spinning about their own axes)
  const proto = fanRotor(0.42);
  const fans = new THREE.InstancedMesh(proto.geometry, proto.material, fanAt.length);
  fans.castShadow = true;
  const rx = new THREE.Matrix4().makeRotationX(Math.PI / 2), m4 = new THREE.Matrix4();
  const ang = fanAt.map(() => r() * Math.PI * 2), spd = fanAt.map(() => 5 + r() * 2.5);
  const place = () => fanAt.forEach((p, i) => { m4.makeRotationZ(ang[i]).multiply(rx).setPosition(p); fans.setMatrixAt(i, m4); });
  place();
  g.add(fans);
  c.anim.extra.push((e) => {
    for (let i = 0; i < ang.length; i++) ang[i] += e.dt * spd[i];
    place();
    fans.instanceMatrix.needsUpdate = true;
  });
  // green LEDs on the module ends
  const leds = new THREE.Group();
  rows.forEach((rz) => {
    for (let m = 0; m < NMOD; m++)
      for (let t = 0; t < 2; t++) {
        if ((m + t + vs) % 3 === 0) continue;
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.04), ledGreen);
        l.position.set(x0 + m * MW + MW / 2 - 0.45, 0.3 + t * (MH + 0.06) + MH - 0.35, rz + MD / 2 + 0.08);
        leds.add(l);
      }
  });
  g.add(leds);
  // ── CO₂: the compressor house, a heat unit, the bullet tanks ──
  const hx = 14.6, hz = -5.4;
  const top = shed(k, hx, hz, 8.4, 6.0, 5.2, { wall: '#e3dfd8', band: L.acc, ribs: 1.1 });
  for (let x = hx - 3; x <= hx + 3; x += 2) k.box(1.2, 0.8, 1.4, P.hvac, x, top, hz - 1.0, { r: 0.08 });
  k.cyl(0.3, 0.34, 2.4, '#c9c3ba', hx + 3.2, top, hz + 1.6, 10);
  placard(g, 'CO₂', 2.0, hx - 2.2, 3.7, hz + 3.06, L.ink, L.acc);
  windowRow(k, c.lit, 'z+', hz + 3.03, hx - 3.8, hx - 0.6, 2.0, 0.8, 0.7, 0.3, r, 0.9);
  windowRow(k, c.lit, 'x-', hx - 4.23, hz - 2.4, hz + 2.4, 2.6, 0.9, 0.8, 0.5, r, 0.8);
  wallLamp(c.lamps, g, hx + 1.6, 4.2, hz + 3.2);
  lightPool(g, -7.0, 0, -3.1, 7, warmPool, 2.2);
  k.box(3.0, 3.6, 0.12, P.steel, hx + 1.6, 0.3, hz + 3.03, { r: 0.02 });
  for (let i = 0; i < 2; i++) {
    const tz = 1.6 + i * 2.3;
    hcyl(k, 0.95, 6.4, '#eeeae4', hx, 1.5, tz, 'x', 18);
    for (const s of [-1, 1]) k.geo(new THREE.SphereGeometry(0.95, 14, 8).scale(0.45, 1, 1).translate(hx + s * 3.2, 1.5, tz), '#eeeae4', 0.02, 0);
    for (const s of [-2.2, 2.2]) k.box(0.5, 0.75, 1.6, P.concrete2, hx + s, 0, tz, { r: 0.05 });
    k.box(6.4, 0.2, 0.2, L.acc, hx, 2.0, tz + 0.93, { r: 0.02, shade: 0 });
  }
  // ── out to the wells ──
  const wells = vs === 1 ? [2.0, 6.6, 11.2, 15.8] : [3.4, 9.6, 15.8];
  const wz = 8.8;
  pipeRun(k, [V(hx - 4.2, 1.2, hz + 3.2), V(hx - 4.2, 1.2, wz - 2.2), V(wells[0], 1.2, wz - 2.2)], 0.22, '#8a8f98', { seg: 8 });
  pipeStands(k, [V(hx - 4.2, 1.2, wz - 2.2), V(wells[0], 1.2, wz - 2.2)], 0.22, 2.4);
  for (const x of wells) {
    wellhead(c, x, wz);
    pipeRun(k, [V(x, 1.2, wz - 2.2), V(x, 1.2, wz - 0.9)], 0.18, '#8a8f98', { seg: 8 });
  }
  if (vs !== 1) {
    // a slim derrick over the newest well
    const dx = wells[wells.length - 1], H = 13;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.beam(V(dx + sx * 1.3, 0.2, wz + sz * 1.3), V(dx + sx * 0.3, H, wz + sz * 0.3), 0.16, L.dark);
    for (let y = 2; y < H; y += 2.2) {
      const h = 1.3 - (y / H) * 1.0;
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) k.beam(V(dx + ax * h, y, wz + az * h), V(dx + bx * h, y, wz + bz * h), 0.08, L.acc);
    }
    k.box(1.0, 0.4, 1.0, P.steelDark, dx, H, wz, { r: 0.04 });
    beacon(g, dx, H + 0.7, wz, 0.7);
  }
  // the builder's board, a truck, a worker, lamps
  const sw = Math.min(9, 0.62 * L.name.length + 1.6);
  for (const s of [-1, 1]) k.box(0.2, 2.6, 0.2, P.steelDark, -14 + (s * sw) / 2.5, 0, D / 2 - 2.4, { r: 0.02 });
  placard(g, L.name, sw, -14, 2.9, D / 2 - 2.28, L.ink, L.acc, 0, true);
  placard(g, 'DIRECT AIR CAPTURE', sw * 0.9, -14, 1.9, D / 2 - 2.28, '#fbf7f0', '#2f2a3d');
  const truck = model('pickup', 4.6);
  truck.position.set(-4.5, 0.04, D / 2 - 4.2);
  truck.rotation.y = Math.PI / 2;
  g.add(truck);
  figure(g, 'worker', 6.4, wz - 1.4, 0.4, o.seed + 3);
  figure(g, 'engineer', -4.0, 3.8, -0.6, o.seed + 5);
  lampsAt(c, [[-19.0, -10.4, 1], [19.0, 10.4, -1], [-1.6, 5.4, 1]], 5.0);
  c.finish();
  return { obj: g, w: W, d: D, h: vs !== 1 ? 14 : 7.4, update: c.update, ground: () => null };
}
