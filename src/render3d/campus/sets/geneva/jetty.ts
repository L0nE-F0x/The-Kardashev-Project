/**
 * The lakeside: a stone quay with a promenade (lamps, benches, a railing, trees) and a timber jetty
 * on piles running out over Lake Geneva to a T-head, with the Charter's solar ferry LÉMAN moored
 * alongside, two sailboats and a rowing boat bobbing, swans gliding past and a fisher at the end.
 * The lake is the scene's (the land drops away east of the quay; water at y ≈ −1.2).
 */
import * as THREE from 'three';
import { Kit, lightPool, poolMat, rng, type Paint } from '../../../kit';
import type { Env, Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { bench, CHARTER_FLAG, Flags, greenery, lampMat, litGlass, litSign, People, plantedTree, V } from './common';
import { fit } from './secretariat';

const WATER = -1.2;
const DECK = 0.35;
const QUAY = -6.6; // the quay's edge (local x)
const BED = -5.6;
const TIMBER: Paint = '#9c6c3d';
const PILE: Paint = '#5f3b28';

/** A boat hull's outline from above (bow towards −z), extruded from y0 to y1, `k` = beam scale. */
function hull(L: number, beam: number, y0: number, y1: number, k = 1, transom = 0.85) {
  const hl = L / 2, hb = (beam / 2) * k;
  const s = new THREE.Shape();
  s.moveTo(-hb * transom, -hl);
  s.lineTo(hb * transom, -hl);
  s.quadraticCurveTo(hb, -hl + 0.2, hb, -hl + L * 0.3);
  s.lineTo(hb, hl - L * 0.3);
  s.quadraticCurveTo(hb, hl - L * 0.04, 0, hl);
  s.quadraticCurveTo(-hb, hl - L * 0.04, -hb, hl - L * 0.3);
  s.lineTo(-hb, -hl + L * 0.3);
  s.quadraticCurveTo(-hb, -hl + 0.2, -hb * transom, -hl);
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

interface Boat { obj: THREE.Group; ph: number; roll: number; heave: number }

/** The Charter's solar ferry: white over a blue boot-top, a glazed cabin, solar roof, pennant. */
function ferry(seed: number, flagsOut: Flags[]): Boat {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const L = 14.4, BM = 4.3;
  k.geo(hull(L, BM, -0.7, 0.25, 0.9), '#264276', 0.02);
  k.geo(hull(L, BM, 0.25, 0.48, 0.97), '#2fae9b', 0.02);
  k.geo(hull(L, BM, 0.48, 1.05, 1.0), '#f3eee6', 0.02);
  k.geo(hull(L - 0.5, BM - 0.5, 1.05, 1.12, 1.0), '#b98a52', 0.04);
  k.geo(hull(L, BM, 1.05, 1.5, 1.0).scale(1, 1, 1), '#f3eee6', 0.02);
  // keep the bulwark hollow: a deck inset on top of it
  k.geo(hull(L - 0.7, BM - 0.7, 1.45, 1.52, 1.0), '#b98a52', 0.04);
  // the cabin
  k.box(3.4, 2.1, 8.0, '#f3eee6', 0, 1.5, 1.6, { r: 0.18, shade: 0.1 });
  k.box(3.8, 0.22, 8.8, '#e6e0e3', 0, 3.6, 1.5, { r: 0.08 });
  const panels = new Kit(rng(seed + 1));
  for (let i = 0; i < 6; i++) for (const x of [-0.92, 0.92]) panels.box(1.7, 0.08, 1.32, '#2c3f6e', x, 3.82, -1.6 + i * 1.42, { r: 0, jitter: 0.06, shade: 0 });
  // the wheelhouse up front, a mast with the Charter's pennant and running lights
  k.box(2.4, 1.4, 1.8, '#f3eee6', 0, 3.82, -2.0, { r: 0.12 });
  k.box(2.7, 0.14, 2.1, '#264276', 0, 5.22, -2.0, { r: 0.04 });
  k.cyl(0.07, 0.09, 4.2, '#e6e0e3', 0, 5.3, -1.6, 6);
  const win = new Kit(rng(seed + 2));
  for (const x of [-1.72, 1.72]) for (let i = 0; i < 6; i++) win.box(0.08, 0.95, 0.95, '#3c5f86', x, 2.4, -1.5 + i * 1.25, { r: 0, jitter: 0.04 });
  win.box(2.6, 0.95, 0.08, '#3c5f86', 0, 2.4, -2.42, { r: 0, jitter: 0.03 });
  win.box(2.0, 0.6, 0.08, '#3c5f86', 0, 4.4, -2.92, { r: 0, jitter: 0.03 });
  for (const x of [-1.22, 1.22]) win.box(0.08, 0.6, 1.3, '#3c5f86', x, 4.4, -2.0, { r: 0, jitter: 0.03 });
  // rails on the bow deck, a life ring, bollards
  for (let z = -6.2; z <= -3.0; z += 0.8) for (const x of [-1.85, 1.85]) k.box(0.06, 0.6, 0.06, '#e6e0e3', x * (1 - Math.max(0, -4.6 - z) * 0.12), 1.5, z, { r: 0 });
  k.geo(new THREE.TorusGeometry(0.34, 0.08, 6, 14).translate(1.74, 2.3, 4.6).rotateY(0), '#c23a3f', 0.02);
  const g1 = k.build();
  g.add(g1, panels.build(), win.build(litGlass('yel1', 1.1)));
  const name = fit(litSign('LÉMAN', 4, '#264276', null, 0.2), 2.8, 0.5);
  name.position.set(0, 0.85, L / 2 + 0.01);
  const side = fit(litSign('LÉMAN', 4, '#264276', null, 0.2), 2.6, 0.48);
  side.rotation.y = -Math.PI / 2;
  side.position.set(-BM / 2 - 0.01, 0.78, -3.6);
  g.add(name, side);
  const nav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), lampMat('#5fd3b5', 2.4));
  nav.position.set(0, 9.55, -1.6);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), lampMat('red3', 2.4));
  red.position.set(-1.4, 5.4, -2.0);
  const grn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), lampMat('grn6', 2.4));
  grn.position.set(1.4, 5.4, -2.0);
  g.add(nav, red, grn);
  const fl = new Flags([{ x: 0.08, y: 9.4, z: -1.6, banner: CHARTER_FLAG, w: 1.5, h: 0.95 }]);
  g.add(fl.mesh);
  flagsOut.push(fl);
  return { obj: g, ph: 0, roll: 0.012, heave: 0.06 };
}

/** A small sailboat (sail furled on the boom; `jib` hoisted in a colour), bow towards −z. */
function sailboat(seed: number, hullC: Paint, jib: Paint | null): Boat {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const L = 5.6, BM = 1.9;
  k.geo(hull(L, BM, -0.45, 0.2, 0.86), hullC, 0.03);
  k.geo(hull(L, BM, 0.2, 0.62, 1.0), '#fbf7f0', 0.02);
  k.geo(hull(L - 0.3, BM - 0.3, 0.62, 0.66, 1.0), '#b98a52', 0.04);
  k.box(1.1, 0.4, 1.6, '#fbf7f0', 0, 0.62, 0.4, { r: 0.12 });
  k.cyl(0.05, 0.06, 7.4, '#e6e0e3', 0, 0.66, -0.6, 6);
  k.beam(V(0, 1.7, -0.6), V(0, 1.6, 2.3), 0.07, '#9d95a6');
  k.geo(new THREE.CylinderGeometry(0.13, 0.13, 2.7, 6).rotateX(Math.PI / 2).translate(0, 1.82, 0.85), '#345c96', 0.03);
  k.beam(V(0, 8.0, -0.6), V(0, 0.7, -2.6), 0.02, '#5b5562');
  k.beam(V(0, 8.0, -0.6), V(0, 0.7, 2.6), 0.02, '#5b5562');
  if (jib) {
    const sh = new THREE.BufferGeometry().setFromPoints([V(0, 7.6, -0.65), V(0, 0.9, -0.7), V(0, 0.95, -2.5)]);
    sh.computeVertexNormals();
    const back = sh.clone();
    back.setIndex([0, 2, 1]);
    back.computeVertexNormals();
    k.geo(sh, jib, 0.02);
    k.geo(back.toNonIndexed(), jib, 0.02);
  }
  g.add(k.build());
  return { obj: g, ph: 0, roll: 0.045, heave: 0.08 };
}

function rowboat(seed: number): Boat {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  k.geo(hull(3.0, 1.2, -0.25, 0.3, 0.9, 0.7), '#9c6c3d', 0.05);
  k.geo(hull(2.8, 1.05, 0.25, 0.31, 0.9, 0.7), '#5f3b28', 0.03);
  for (const z of [-0.5, 0.5]) k.box(1.0, 0.06, 0.26, '#bb8a4c', 0, 0.28, z, { r: 0 });
  k.beam(V(-0.5, 0.35, 0.2), V(0.8, 0.32, -0.9), 0.05, '#d4a862');
  g.add(k.build());
  return { obj: g, ph: 0, roll: 0.05, heave: 0.05 };
}

function swan(seed: number) {
  const k = new Kit(rng(seed));
  k.geo(new THREE.SphereGeometry(0.42, 10, 8).scale(0.75, 0.55, 1.25).translate(0, 0.12, 0), '#fbf7f0', 0.02);
  k.geo(new THREE.SphereGeometry(0.22, 8, 6).scale(0.7, 0.6, 1.4).translate(0, 0.32, 0.38), '#f1ece4', 0.02);
  k.beam(V(0, 0.2, -0.35), V(0, 0.9, -0.42), 0.12, '#fbf7f0');
  k.beam(V(0, 0.9, -0.42), V(0, 1.02, -0.6), 0.1, '#fbf7f0');
  k.geo(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 1.02, -0.62), '#fbf7f0', 0);
  k.box(0.07, 0.07, 0.2, 'org0', 0, 0.97, -0.78, { r: 0.02 });
  const g = new THREE.Group();
  g.add(k.build());
  return g;
}

export function jetty(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  g.name = 'set:jetty';
  const k = new Kit(rng(o.seed));
  const r = rng(o.seed + 1);
  // ── the quay and its promenade ──
  k.box(1.0, 0.25 - BED, 33.4, '#b5aa9a', QUAY - 0.5, BED, 0, { r: 0.08, jitter: 0.02, shade: 0.35 });
  for (let y = -1.0; y > BED; y -= 0.55) k.box(1.04, 0.05, 33.44, '#a39788', QUAY - 0.5, y, 0, { r: 0, jitter: 0, shade: 0 });
  k.box(1.04, 0.5, 33.44, '#4f6a3a', QUAY - 0.5, WATER - 0.45, 0, { r: 0, jitter: 0.04, shade: 0 });
  k.box(4.4, 0.25, 33.4, '#ddd5c8', QUAY - 2.7, 0, 0, { r: 0.05, jitter: 0.015, shade: 0 });
  for (let z = -16; z < 16.5; z += 2.2) k.box(4.36, 0.012, 0.07, '#bdb3a6', QUAY - 2.7, 0.25, z, { r: 0, jitter: 0, shade: 0 });
  k.box(1.1, 0.3, 33.4, '#ece6dc', QUAY - 0.55, 0.0, 0, { r: 0.06, shade: 0 });
  // railing along the edge, open where the jetty starts
  for (let z = -16.4; z <= 16.41; z += 1.4) {
    if (z > 4.9 && z < 9.1) continue;
    k.box(0.08, 1.05, 0.08, '#433c52', QUAY - 0.35, 0.3, z, { r: 0, jitter: 0 });
  }
  for (const [z0, z1] of [[-16.4, 4.9], [9.1, 16.4]] as const) for (const y of [0.85, 1.32]) k.beam(V(QUAY - 0.35, y, z0), V(QUAY - 0.35, y, z1), 0.06, '#433c52');
  for (const z of [-12.5, -4.2, 13]) bench(k, QUAY - 1.6, 0.25, z, -Math.PI / 2);
  for (const z of [-15.2, -6.8, 2.6, 12]) plantedTree(k, -10.1, 0.25, z, 0.95, o.seed + 20 + z);
  for (let z = -16; z < 16.5; z += 3.1) greenery(k, -10.6, 0.25, z + 1.4, 0.55, o.seed + 40 + z, true);
  const lamp = lampMat('yel1', 3);
  const pool = poolMat('#ffd9a0', 0.55);
  const glint = poolMat('#ffc27a', 0.4);
  const lampAt = (x: number, y: number, z: number, h = 3.6) => {
    k.cyl(0.07, 0.1, h, '#433c52', x, y, z, 6);
    k.box(0.36, 0.08, 0.36, '#433c52', x, y + h + 0.42, z, { r: 0 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.26), lamp);
    m.position.set(x, y + h + 0.2, z);
    g.add(m);
    lightPool(g, x, y, z, 3.0, pool);
    lightPool(g, x + 1.6, WATER, z, 2.4, glint, 0.7);
  };
  for (const z of [-14.5, -1.5, 15]) lampAt(QUAY - 0.9, 0.25, z);
  // ── the jetty: planks on stringers on piles ──
  const arms: { x0: number; x1: number; z0: number; z1: number; along: 'x' | 'z' }[] = [
    { x0: QUAY, x1: 1.6, z0: 5.4, z1: 8.6, along: 'x' },
    { x0: -1.4, x1: 1.6, z0: -12.0, z1: 8.6, along: 'z' },
    { x0: -4.8, x1: 4.8, z0: -15.6, z1: -12.0, along: 'x' },
  ];
  for (const a of arms) {
    const w = a.x1 - a.x0, d = a.z1 - a.z0;
    const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
    // planks across the walkway
    if (a.along === 'x') for (let x = a.x0 + 0.24; x < a.x1 - 0.1; x += 0.46) k.box(0.42, 0.1, d - 0.08, r() < 0.15 ? '#8a5e34' : TIMBER, x, DECK - 0.1, cz, { r: 0, jitter: 0.07, shade: 0 });
    else for (let z = a.z0 + 0.24; z < a.z1 - 0.1; z += 0.46) k.box(w - 0.08, 0.1, 0.42, r() < 0.15 ? '#8a5e34' : TIMBER, cx, DECK - 0.1, z, { r: 0, jitter: 0.07, shade: 0 });
    // stringers and pile caps
    const len = a.along === 'x' ? w : d;
    for (const off of [0.25, a.along === 'x' ? d - 0.25 : w - 0.25]) {
      if (a.along === 'x') k.box(w, 0.32, 0.22, PILE, cx, DECK - 0.42, a.z0 + off, { r: 0, jitter: 0.03 });
      else k.box(0.22, 0.32, d, PILE, a.x0 + off, DECK - 0.42, cz, { r: 0, jitter: 0.03 });
    }
    const n = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p0 = a.along === 'x' ? [a.x0 + 0.3 + t * (w - 0.6), a.z0 + 0.25] : [a.x0 + 0.25, a.z0 + 0.3 + t * (d - 0.6)];
      const p1 = a.along === 'x' ? [p0[0], a.z1 - 0.25] : [a.x1 - 0.25, p0[1]];
      if (a.along === 'x' && p0[0] < QUAY + 0.6) continue;
      for (const [px, pz] of [p0, p1]) {
        k.cyl(0.17, 0.19, DECK - 0.4 - BED, PILE, px, BED, pz, 8, { shade: 0.3 });
        k.cyl(0.2, 0.2, 0.42, '#3f5a32', px, WATER - 0.3, pz, 8);
      }
      if (a.along === 'x') k.box(0.2, 0.26, d, PILE, p0[0], DECK - 0.68, (a.z0 + a.z1) / 2, { r: 0 });
      else k.box(w, 0.26, 0.2, PILE, (a.x0 + a.x1) / 2, DECK - 0.68, p0[1], { r: 0 });
    }
  }
  // railings: the west side of the long arm and round the T-head; bollards on the east
  const post = (x: number, z: number) => k.box(0.1, 0.95, 0.1, '#7d5232', x, DECK, z, { r: 0, jitter: 0.04 });
  for (let z = -11.6; z < 8.4; z += 1.5) post(-1.3, z);
  k.beam(V(-1.3, DECK + 0.95, -11.6), V(-1.3, DECK + 0.95, 8.4), 0.09, '#9c6c3d');
  for (let x = -4.7; x <= 4.71; x += 1.57) post(x, -15.5);
  k.beam(V(-4.7, DECK + 0.95, -15.5), V(4.7, DECK + 0.95, -15.5), 0.09, '#9c6c3d');
  for (const z of [-11, -4.2, 2.6]) {
    k.cyl(0.16, 0.2, 0.45, '#2f2a3d', 1.35, DECK, z, 8);
    k.cyl(0.24, 0.24, 0.08, '#2f2a3d', 1.35, DECK + 0.45, z, 8);
  }
  // a life ring on a post, a small shelter with a timetable, the ferry's sign
  k.box(0.12, 1.5, 0.12, '#e6e0e3', -4.2, DECK, -12.4, { r: 0 });
  k.geo(new THREE.TorusGeometry(0.36, 0.09, 6, 14).translate(-4.2, DECK + 1.2, -12.32), '#c23a3f', 0.02);
  for (let i = 0; i < 4; i++) k.geo(new THREE.TorusGeometry(0.36, 0.095, 6, 3, 0.35).rotateZ(i * Math.PI / 2 + 0.2).translate(-4.2, DECK + 1.2, -12.31), '#fbf7f0', 0);
  k.box(2.6, 0.12, 2.2, '#7d5232', -3.4, DECK + 2.4, -14.2, { r: 0.04 });
  for (const [x, z] of [[-4.5, -15.1], [-2.3, -15.1], [-4.5, -13.3], [-2.3, -13.3]] as const) k.box(0.1, 2.4, 0.1, '#5b5562', x, DECK, z, { r: 0 });
  bench(k, -3.4, DECK, -14.6, 0);
  k.box(1.6, 0.9, 0.08, '#264276', 3.0, DECK + 1.0, -15.45, { r: 0.02 });
  for (const x of [2.4, 3.6]) k.box(0.08, 1.9, 0.08, '#5b5562', x, DECK, -15.4, { r: 0 });
  const board = fit(litSign('LAKE FERRY', 3, '#fbf7f0', null, 0.6), 1.4, 0.3);
  board.position.set(3.0, DECK + 1.66, -15.4);
  board.rotation.y = Math.PI;
  g.add(board);
  lampAt(4.4, DECK, -12.3, 3.2);
  lampAt(-1.15, DECK, -3.0, 3.2);
  g.add(k.build());
  // ── the boats ──
  const flags: Flags[] = [];
  const boats: Boat[] = [];
  const add = (b: Boat, x: number, z: number, ry: number, ph: number) => {
    b.obj.position.set(x, WATER, z);
    b.obj.rotation.y = ry;
    b.ph = ph;
    b.obj.userData.base = { x, z, ry };
    g.add(b.obj);
    boats.push(b);
  };
  add(ferry(o.seed + 50, flags), 4.0, -4.0, 0, 0);
  add(sailboat(o.seed + 60, '#c23a3f', null), -4.0, -3.2, 0.05, 1.7);
  add(sailboat(o.seed + 61, '#264276', 'yel0'), -4.1, -9.2, -0.04, 3.1);
  add(rowboat(o.seed + 62), -6.0, -13.8, 1.3, 4.4);
  // mooring lines from the bollards to the ferry
  const ropes = new Kit(rng(o.seed + 70));
  for (const z of [-11, 2.6]) ropes.beam(V(1.4, DECK + 0.4, z), V(2.05, WATER + 1.4, z + (z < 0 ? 0.8 : -0.8)), 0.04, '#d8cfc3');
  const rm = ropes.build();
  rm.castShadow = false;
  g.add(rm);
  // swans gliding a slow loop off the end of the jetty
  const swans = [swan(o.seed + 80), swan(o.seed + 81)];
  for (const s of swans) g.add(s);
  // ── people ──
  const ppl = new People((x) => (x < QUAY ? 0.25 : DECK));
  ppl.walk([[-9.2, -16], [-9.2, 16]]);
  ppl.walk([[-8.0, 15.5], [-8.4, 7.0], [0.2, 7.0], [0.2, -13.6], [-3.2, -13.6], [0.0, -11], [0.0, 6.6], [-8.0, 6.2]], 'office');
  ppl.stand(1.0, -14.9, Math.PI, 'worker');
  ppl.stand(-2.0, -14.9, Math.PI + 0.2, 'researcher');
  ppl.stand(-1.4, -14.8, Math.PI - 0.3);
  ppl.stand(QUAY - 0.9, 10.6, Math.PI / 2, 'scientist');
  ppl.stand(QUAY - 0.95, 11.3, Math.PI / 2 + 0.4);
  g.add(ppl.group);
  // the fisher's rod and line
  const rod = new Kit(rng(o.seed + 90));
  rod.beam(V(1.25, DECK + 1.1, -15.1), V(2.6, DECK + 2.9, -17.2), 0.04, '#2f2a3d');
  rod.beam(V(2.6, DECK + 2.9, -17.2), V(2.8, WATER, -17.6), 0.012, '#e6e0e3');
  g.add(rod.build());
  return {
    obj: g, w: 22, d: 34, h: 10,
    ground(x, z) {
      if (Math.abs(z) > 22 || x < -15 || x > 40) return null;
      return x < QUAY ? 0 : BED;
    },
    update(e: Env) {
      for (const b of boats) {
        const t = e.t + b.ph;
        b.obj.position.y = WATER + Math.sin(t * 0.8) * b.heave;
        b.obj.rotation.z = Math.sin(t * 0.63) * b.roll;
        b.obj.rotation.x = Math.sin(t * 0.71 + 1) * b.roll * 0.5;
        b.obj.rotation.y = b.obj.userData.base.ry + Math.sin(t * 0.13) * 0.02;
      }
      swans.forEach((s, i) => {
        const a = e.t * 0.035 + i * 0.32;
        const x = 9.4 + Math.cos(a) * 1.0, z = -5 + Math.sin(a) * 10;
        s.position.set(x + i * 0.9, WATER - 0.02 + Math.sin(e.t * 1.1 + i) * 0.02, z);
        s.rotation.y = Math.atan2(Math.sin(a) * 1.0, -Math.cos(a) * 10);
      });
      for (const f of flags) f.update(e);
      ppl.update(e);
    },
  };
}

