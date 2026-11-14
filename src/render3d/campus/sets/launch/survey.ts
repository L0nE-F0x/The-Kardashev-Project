/**
 * A candidate launch site before anything's contracted: survey stakes and string lines pegging out
 * the future pad, a survey trailer, a weather mast with spinning cups, the Charter's marker board,
 * a theodolite and a rod, a soil drill, a windsock, tyre tracks in the scrub — and Kip's little
 * sounding rocket on its rail.
 */
import * as THREE from 'three';
import { Kit, lightPool, mix, poolMat, rng, type Paint } from '../../../kit';
import type { Env, Piece } from '../../../pieces';
import { model } from '../../../models';
import type { Act3SetOpts } from '../../act3sets';
import { BACKDROPS, type Backdrop } from '../../ground';
import { CH, emblemDisc, lampMat, litGlass, litSign, People } from '../geneva/common';
import { beacon, fit } from '../geneva/secretariat';
import { latticeMast, V } from './common';

export function launchSurvey(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  g.name = 'set:launchSurvey';
  const k = new Kit(rng(o.seed));
  const r = rng(o.seed + 1);
  const bd = BACKDROPS[(o.backdrop as Backdrop) in BACKDROPS ? (o.backdrop as Backdrop) : 'coast'];
  const track = mix(bd.ground[2], '#3a3436', 0.12);
  // tyre tracks in from the road to the trailer and on to the mast
  const path: [number, number][] = [[-4, 21], [-6, 12], [-11, 4], [-16, -1], [-10, -8], [-2, -10]];
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    for (const s of [-0.85, 0.85]) {
      const ox = Math.cos(ry) * s, oz = -Math.sin(ry) * s;
      k.box(0.42, 0.025, len + 0.6, track, (ax + bx) / 2 + ox, 0.0, (az + bz) / 2 + oz, { r: 0, jitter: 0.04, shade: 0, ry });
    }
  }
  // the pegged-out pad: stakes with flagging tape and string lines
  const PX0 = -4, PX1 = 24, PZ0 = -15, PZ1 = 7;
  const stakes: THREE.Vector3[] = [];
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 3.5));
    for (let i = 0; i < n; i++) stakes.push(V(x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n));
  };
  edge(PX0, PZ1, PX1, PZ1); edge(PX1, PZ1, PX1, PZ0); edge(PX1, PZ0, PX0, PZ0); edge(PX0, PZ0, PX0, PZ1);
  const tape: Paint[] = ['pnk0', 'org1', 'pnk0', 'yel0'];
  stakes.forEach((s, i) => {
    k.box(0.08, 0.85, 0.08, '#9c6c3d', s.x, 0, s.z, { r: 0, jitter: 0.06, ry: r() });
    k.box(0.14, 0.14, 0.03, tape[i % 4], s.x + 0.06, 0.66, s.z, { r: 0, jitter: 0 });
  });
  for (let i = 0; i < stakes.length; i++) {
    const a = stakes[i], b = stakes[(i + 1) % stakes.length];
    k.beam(V(a.x, 0.5, a.z), V(b.x, 0.5, b.z), 0.02, '#fbf7f0');
  }
  // the centre lines and the future rocket's spot, sprayed on the ground
  const CXp = (PX0 + PX1) / 2, CZp = (PZ0 + PZ1) / 2;
  k.beam(V(PX0, 0.35, CZp), V(PX1, 0.35, CZp), 0.02, 'pnk1');
  k.beam(V(CXp, 0.35, PZ0), V(CXp, 0.35, PZ1), 0.02, 'pnk1');
  k.geo(new THREE.RingGeometry(1.6, 1.85, 28).rotateX(-Math.PI / 2).translate(CXp, 0.04, CZp), '#fbf7f0', 0);
  for (const [x, z] of [[CXp, CZp - 4], [CXp + 6, CZp], [CXp - 6, CZp], [CXp, CZp + 4]] as const) {
    k.box(0.08, 1.0, 0.08, '#9c6c3d', x, 0, z, { r: 0 });
    k.box(0.16, 0.16, 0.03, 'org1', x + 0.07, 0.8, z, { r: 0, jitter: 0 });
  }
  // the survey trailer on blocks, steps up to the door
  const TX = -20, TZ = -6;
  const win = new Kit(rng(o.seed + 2));
  for (const dx of [-3.4, -1.1, 1.1, 3.4]) k.box(0.6, 0.6, 2.4, '#5b5562', TX + dx, 0, TZ, { r: 0.04 });
  k.box(8.6, 2.7, 2.9, '#f1ece4', TX, 0.6, TZ, { r: 0.14, shade: 0.1 });
  k.box(8.64, 0.38, 2.94, CH.field, TX, 1.55, TZ, { r: 0.03, shade: 0 });
  k.box(8.8, 0.18, 3.1, '#c3bcc7', TX, 3.3, TZ, { r: 0.04 });
  for (const x of [TX - 2.6, TX + 0.2, TX + 3.0]) win.box(1.3, 0.75, 0.08, '#3c5f86', x, 2.05, TZ + 1.47, { r: 0, jitter: 0.04 });
  k.box(0.95, 2.0, 0.08, '#7a7186', TX - 1.3, 0.62, TZ + 1.47, { r: 0.02 });
  for (let i = 0; i < 3; i++) k.box(1.3, 0.2 * (3 - i), 0.42, '#8a8490', TX - 1.3, 0, TZ + 1.7 + i * 0.42, { r: 0.02 });
  k.box(0.9, 0.9, 0.7, '#b9c2c4', TX + 4.6, 1.3, TZ, { r: 0.06 });
  k.geo(new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-0.9).translate(TX + 2.8, 3.8, TZ - 0.6), '#e6e0e3', 0.02);
  k.cyl(0.04, 0.05, 3.2, '#9d95a6', TX - 3.6, 3.4, TZ - 0.8, 6);
  const ts = fit(litSign('SITE SURVEY', 6, '#264276', null, 0.2), 3.0, 0.4);
  ts.position.set(TX + 2.2, 1.0, TZ + 1.47);
  g.add(ts);
  g.add(win.build(litGlass('yel1', 1.1)));
  const porch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.25), lampMat('yel1', 2.6));
  porch.position.set(TX - 1.3, 2.85, TZ + 1.6);
  g.add(porch);
  lightPool(g, TX - 1.3, 0, TZ + 3.4, 4.2, poolMat('#ffe2b0', 0.55));
  // core samples in boxes by the trailer
  for (let i = 0; i < 4; i++) k.box(1.4, 0.3, 0.6, '#bb8a4c', TX + 2 + (i % 2) * 1.5, 0.3 * Math.floor(i / 2), TZ + 3.2, { r: 0.03 });
  const truck = model('pickup', 4.4);
  truck.rotation.y = 0.9;
  truck.position.set(-12.5, 0.05, 2.4);
  g.add(truck);
  // the weather mast: guys, a vane, cups that spin
  const MX = -7, MZ = -13, MH = 13;
  latticeMast(k, MX, 0, MZ, MH, 0.7, '#9d95a6', 1.4);
  k.box(1.2, 0.3, 1.2, '#a39a91', MX, 0, MZ, { r: 0.04 });
  for (const t of [0.4, 2.5, 4.6]) k.beam(V(MX, MH * 0.75, MZ), V(MX + Math.sin(t) * 6, 0.1, MZ + Math.cos(t) * 6), 0.025, '#5b5562');
  k.box(1.6, 0.06, 0.06, '#9d95a6', MX, MH - 1.2, MZ, { r: 0 });
  k.box(0.5, 0.4, 0.3, '#e6e0e3', MX + 0.8, MH - 1.6, MZ, { r: 0.04 });
  const cups = new THREE.Group();
  const ck = new Kit(rng(o.seed + 3));
  ck.cyl(0.04, 0.04, 0.5, '#9d95a6', 0, 0, 0, 6);
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI * 2;
    ck.beam(V(0, 0.45, 0), V(Math.sin(t) * 0.55, 0.45, Math.cos(t) * 0.55), 0.03, '#9d95a6');
    ck.geo(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2).rotateY(t).translate(Math.sin(t) * 0.55, 0.45, Math.cos(t) * 0.55), '#e6e0e3', 0);
  }
  cups.add(ck.build());
  cups.position.set(MX, MH, MZ);
  const vane = new THREE.Group();
  const vk = new Kit(rng(o.seed + 4));
  vk.box(0.05, 0.05, 1.4, '#5b5562', 0, 0, 0.2, { r: 0 });
  vk.box(0.03, 0.5, 0.5, 'red3', 0, -0.1, 0.8, { r: 0 });
  vane.add(vk.build());
  vane.position.set(MX - 0.75, MH - 1.0, MZ);
  g.add(cups, vane);
  beacon(g, MX, MH + 0.9, MZ, 0.8);
  // the Charter's marker board
  const BX = -15, BZ = 12.5, ry = 0.28;
  const bg = new THREE.Group();
  const bk = new Kit(rng(o.seed + 5));
  for (const x of [-2.4, 2.4]) bk.box(0.18, 3.6, 0.18, '#5b5562', x, 0, -0.1, { r: 0 });
  bk.box(6.2, 2.9, 0.12, CH.field, 0, 1.3, 0, { r: 0.05 });
  bk.box(5.8, 2.5, 0.1, '#fbf7f0', 0, 1.5, 0.07, { r: 0.03 });
  bg.add(bk.build());
  const t1 = fit(litSign('CANDIDATE', 6, '#345c96', null, 0.5), 3.8, 0.75);
  t1.position.set(0.8, 3.25, 0.14);
  const t2 = fit(litSign('LAUNCH SITE', 6, '#264276', null, 0.5), 3.8, 0.75);
  t2.position.set(0.8, 2.3, 0.14);
  const em = emblemDisc(1.7, 0.5);
  em.position.set(-1.95, 2.75, 0.14);
  bg.add(t1, t2, em);
  bg.position.set(BX, 0, BZ);
  bg.rotation.y = ry;
  g.add(bg);
  // a theodolite on its tripod, the rod far off on the pad's corner
  const QX = 3, QZ = 11;
  for (const t of [0.3, 2.4, 4.5]) k.beam(V(QX + Math.sin(t) * 0.55, 0, QZ + Math.cos(t) * 0.55), V(QX, 1.35, QZ), 0.05, '#bb8a4c');
  k.box(0.32, 0.36, 0.26, 'yel0', QX, 1.36, QZ, { r: 0.05 });
  k.geo(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 8).rotateX(Math.PI / 2).rotateY(-0.65).translate(QX, 1.6, QZ), '#2f2a3d', 0);
  const RX = 18.5, RZ = -6.5;
  for (let i = 0; i < 8; i++) k.box(0.1, 0.5, 0.1, i % 2 ? '#fbf7f0' : 'red3', RX + 0.35, i * 0.5, RZ, { r: 0, jitter: 0 });
  // a soil drill on tracks
  const DX = 4, DZ = -17;
  k.box(3.4, 0.8, 2.2, '#433c52', DX, 0, DZ, { r: 0.15 });
  k.box(2.4, 1.0, 2.0, o.accent ?? '#f7b258', DX - 0.3, 0.8, DZ, { r: 0.1 });
  latticeMast(k, DX + 1.2, 0.8, DZ, 6.5, 0.5, '#7a7186', 1.1);
  k.cyl(0.08, 0.08, 6.5, '#5b5562', DX + 1.2, 0.3, DZ, 6);
  for (let i = 0; i < 5; i++) k.cyl(0.08, 0.08, 3, '#7a7186', DX - 1.4, 0.08 + i * 0.17, DZ + 1.6 - i * 0.17, 6, { rz: Math.PI / 2 });
  // a windsock
  const WX = 26, WZ = -17;
  k.cyl(0.07, 0.09, 6, '#e6e0e3', WX, 0, WZ, 6);
  const sock = new THREE.Group();
  const sk = new Kit(rng(o.seed + 6));
  for (let i = 0; i < 5; i++) sk.geo(new THREE.CylinderGeometry(0.42 - i * 0.05, 0.42 - (i + 1) * 0.05, 0.5, 10, 1, true).rotateZ(-Math.PI / 2).translate(0.25 + i * 0.5, 0, 0), i % 2 ? '#fbf7f0' : 'org0', 0.02);
  sock.add(sk.build());
  sock.position.set(WX, 5.6, WZ);
  g.add(sock);
  // Kip's little sounding rocket on its rail
  const KX = 13, KZ = 13;
  k.box(1.0, 0.25, 1.0, '#5b5562', KX, 0, KZ, { r: 0.03 });
  k.beam(V(KX, 0.25, KZ), V(KX + 0.5, 2.8, KZ - 0.35), 0.06, '#9d95a6');
  const rk = new Kit(rng(o.seed + 7));
  rk.cyl(0.09, 0.09, 1.3, '#fbf7f0', 0, 0, 0, 10);
  rk.cyl(0.0, 0.09, 0.35, 'org0', 0, 1.3, 0, 10);
  for (let i = 0; i < 3; i++) rk.box(0.03, 0.3, 0.22, 'org0', Math.sin((i / 3) * Math.PI * 2) * 0.12, 0, Math.cos((i / 3) * Math.PI * 2) * 0.12, { r: 0, ry: (i / 3) * Math.PI * 2 });
  const mini = rk.build();
  mini.position.set(KX + 0.15, 0.9, KZ - 0.05);
  mini.rotation.set(-0.13, 0, -0.19);
  g.add(mini);
  k.box(0.4, 0.3, 0.3, 'yel0', KX + 1.6, 0, KZ + 0.8, { r: 0.04 });
  k.beam(V(KX + 1.4, 0.15, KZ + 0.7), V(KX + 0.4, 0.15, KZ + 0.3), 0.025, '#2f2a3d');
  // scrub the trucks haven't flattened: a few clumps
  for (let i = 0; i < 14; i++) {
    const x = -28 + r() * 56, z = -18 + r() * 36;
    if (x > PX0 - 1 && x < PX1 + 1 && z > PZ0 - 1 && z < PZ1 + 1) continue;
    k.geo(new THREE.IcosahedronGeometry(0.5 + r() * 0.5, 0).scale(1, 0.6, 1).translate(x, 0.2, z), (['#6f7a3c', '#7d8a45', '#5e6b38'] as Paint[])[i % 3], 0.2);
  }
  g.add(k.build());
  const ppl = new People(0);
  ppl.stand(QX - 0.4, QZ + 0.9, Math.PI - 0.6, 'engineer');
  ppl.stand(RX, RZ + 0.4, 2.2, 'worker');
  ppl.stand(KX + 1.3, KZ - 0.6, -1.2, 'scientist');
  ppl.walk([[TX - 1.3, TZ + 3.4], [-12, -6], [-8.6, -11], [-12, -6]], 'researcher');
  ppl.walk([[PX0 + 1, PZ1 + 1.4], [PX1 - 1, PZ1 + 1.4]], 'worker', 0.8);
  g.add(ppl.group);
  return {
    obj: g, w: 60, d: 40, h: 15,
    // the trailer's door, from its top step
    doors: [{ x: TX - 1.3, z: TZ + 1.9 }],
    ground: () => null,
    update(e: Env) {
      cups.rotation.y -= e.dt * (4 + Math.sin(e.t * 0.5) * 1.5);
      vane.rotation.y = Math.sin(e.t * 0.4) * 0.25 + Math.sin(e.t * 1.7) * 0.06;
      sock.rotation.y = -0.15 + Math.sin(e.t * 0.35) * 0.3;
      sock.rotation.z = -0.15 + Math.sin(e.t * 1.9) * 0.05;
      ppl.update(e);
    },
  };
}
