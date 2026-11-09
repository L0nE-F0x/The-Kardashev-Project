/**
 * What the yards make, in 3D: thin-film collector sheets (gold, glinting), radiator rings for the
 * compute rings (twelve sectors), and curved hull plates for the habitats (five welded courses).
 * Each comes in two forms: a `Build` that grows on its jig in a foundry's bay (`set(u)` 0..1, with
 * the points the arms should work at), and a finished piece for the outbound's stacks and lanes.
 * Product space: x along the rail, y up from the jig's deck (y = 0), the face toward +z.
 */
import * as THREE from 'three';
import { Kit, rng, type Paint } from '../../../kit';
import { blueprint, filmMat, paint, S, TAU, V, type Product } from './common';

export const PRODUCT = { w: 6.4, h: 7.6, ringR: 3.55, ringW: 0.75, plateR: 6.2, plateA: 0.43 };

/** Gold film cells (a sheet `w` × `h`, its bottom at y0), into a Kit. */
function filmCells(k: Kit, w: number, h: number, y0: number, seed: number, z = 0) {
  const r = rng(seed);
  const cols = 5, rows = 6;
  const cw = w / cols, ch = h / rows;
  const golds: Paint[] = ['#f2c45a', '#eab650', '#f6cf6a', '#e4ad4a'];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      k.box(cw - 0.07, ch - 0.07, 0.04, golds[Math.floor(r() * golds.length)], -w / 2 + cw * (i + 0.5), y0 + ch * j + 0.035, z, { r: 0, jitter: 0.04, shade: 0.12 });
  // the frame: thin dark rods round and across
  for (let i = 0; i <= cols; i++) k.box(0.07, h, 0.08, '#8a6a3a', -w / 2 + cw * i, y0, z, { r: 0, jitter: 0, shade: 0 });
  for (let j = 0; j <= rows; j++) k.box(w + 0.07, 0.07, 0.08, '#8a6a3a', 0, y0 + ch * j - 0.035, z, { r: 0, jitter: 0, shade: 0 });
}

/** The jig carriage that rides the product rail (7 long, 0.6 tall): rollers, a deck, hazard ends. */
function jig(k: Kit, kind: Product) {
  k.box(7.0, 0.42, 1.7, S.dark, 0, 0.12, 0, { r: 0.08, shade: 0.2 });
  for (const x of [-3.2, -1.1, 1.1, 3.2]) k.cyl(0.22, 0.22, 1.9, S.black, x, 0.1, -0.95, 10, { rx: Math.PI / 2, shade: 0 });
  for (const sx of [-1, 1]) {
    k.box(0.5, 0.46, 1.74, S.hazard, sx * 3.28, 0.1, 0, { r: 0.05, shade: 0 });
    k.box(0.5, 0.1, 1.76, S.black, sx * 3.28, 0.3, 0, { r: 0, jitter: 0, shade: 0 });
  }
  k.box(6.0, 0.08, 1.2, S.grey, 0, 0.54, 0, { r: 0, jitter: 0.02, shade: 0 });
  if (kind === 'c') {
    // end brackets carrying the roll
    for (const sx of [-1, 1]) k.box(0.3, 0.9, 0.5, S.mid, sx * 3.35, 0.5, 0, { r: 0.05 });
  } else if (kind === 'r') {
    // a V cradle for the ring
    for (const sx of [-1, 1]) k.beam(V(sx * 0.4, 0.55, 0), V(sx * 1.6, 1.25, 0), 0.22, S.mid);
  } else {
    for (const sx of [-1, 1]) k.box(0.36, 0.7, 1.1, S.mid, sx * 2.7, 0.55, 0, { r: 0.05 });
  }
}

/** One radiator-ring sector (annulus piece in the x-y plane, `thick` in z), centred on the ring's middle. */
function sectorGeo(R: number, w: number, a0: number, a1: number, thick: number) {
  const s = new THREE.Shape();
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const p = [Math.cos(a) * R, Math.sin(a) * R];
    if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    s.lineTo(Math.cos(a) * (R - w), Math.sin(a) * (R - w));
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** A curved hull plate course (part of a cylinder of radius R round y, bowed toward +z), from y0 to y1. */
function plateGeo(R: number, a: number, thick: number, y0: number, y1: number) {
  const s = new THREE.Shape();
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = -a + (2 * a * i) / n;
    const p = [Math.sin(t) * R, Math.cos(t) * R];
    if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const t = -a + (2 * a * i) / n;
    s.lineTo(Math.sin(t) * (R - thick), Math.cos(t) * (R - thick));
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 1 });
  // shape y → +z (bowed toward the front), the extrusion runs down from y1 to y0
  g.rotateX(Math.PI / 2);
  g.translate(0, y1, -R + 0.32);
  return g;
}

export interface Build {
  obj: THREE.Group;
  /** Assembly progress 0..1 (what's built). */
  set(u: number): void;
  /** Where arm A holds / places and where arm B's torch works (product space), at progress u. */
  work(u: number, t: number): { a: THREE.Vector3; b: THREE.Vector3; weld: boolean };
  /** A finished product leaves the jig: hide it (the jig stays). */
  showProduct(on: boolean): void;
  /** Re-express product-space clip planes in world space (call after moving the jig). */
  sync(): void;
}

/**
 * A product being built on its jig (the jig included). `clip` = planes every material takes (the
 * hull wall the finished product slides through).
 */
export function productBuild(kind: Product, seed: number, clip: THREE.Plane[]): Build {
  const g = new THREE.Group();
  const jk = new Kit(rng(seed));
  jig(jk, kind);
  const mat = paint(clip);
  g.add(jk.build(mat));
  const prod = new THREE.Group();
  g.add(prod);
  const Y0 = 0.62;
  if (kind === 'c') {
    const { w, h } = PRODUCT;
    // the roll the film is drawn out of, on the jig's brackets
    const rk = new Kit(rng(seed + 3));
    rk.cyl(0.46, 0.46, w + 0.2, '#d9a648', -(w + 0.2) / 2, Y0 + 0.55, 0, 16, { rz: -Math.PI / 2, shade: 0 });
    rk.cyl(0.52, 0.52, 0.12, S.grey, -(w + 0.36) / 2, Y0 + 0.55, 0, 16, { rz: -Math.PI / 2, shade: 0 });
    rk.cyl(0.52, 0.52, 0.12, S.grey, (w + 0.12) / 2, Y0 + 0.55, 0, 16, { rz: -Math.PI / 2, shade: 0 });
    g.add(rk.build(mat));
    // the sheet, drawn upward off the roll: a clip plane at its top edge reveals it
    const topLocal = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const top = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const fk = new Kit(rng(seed + 4));
    filmCells(fk, w, h, Y0 + 0.95, seed, 0.05);
    // the leading edge bar the arm pulls (moves with the top)
    const sheet = fk.build(filmMat({ clip: [...clip, top] }));
    prod.add(sheet);
    const bar = new THREE.Group();
    const bk = new Kit(rng(seed + 5));
    bk.box(w + 0.3, 0.22, 0.26, S.mid, 0, -0.11, 0.05, { r: 0.05, shade: 0 });
    bar.add(bk.build(mat));
    prod.add(bar);
    let topY = Y0 + 1;
    const b: Build = {
      obj: g,
      sync() {
        g.updateWorldMatrix(true, false);
        top.copy(topLocal).applyMatrix4(g.matrixWorld);
      },
      set(u) {
        topY = Y0 + 0.95 + Math.max(0.02, u) * h;
        topLocal.constant = topY;
        bar.position.y = topY;
      },
      work(u, t) {
        const y = Y0 + 0.95 + Math.max(0.02, u) * h;
        // A pulls the leading bar; B trims the right edge, running up and down behind it
        const by = Y0 + 1.2 + (0.5 + 0.5 * Math.sin(t * 1.3)) * Math.max(0.2, y - Y0 - 1.6);
        return { a: V(-w * 0.18, y + 0.15, 0.45), b: V(w / 2 + 0.05, by, 0.35), weld: u < 0.995 };
      },
      showProduct(on) { prod.visible = on; },
    };
    b.set(0);
    return b;
  }
  if (kind === 'r') {
    const { ringR: R, ringW: W } = PRODUCT;
    const cy = Y0 + 0.6 + R;
    const secs: THREE.Mesh[] = [];
    const sm = paint(clip);
    const ghost: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a0 = -Math.PI / 2 + (i / 12) * TAU, a1 = a0 + TAU / 12;
      const k = new Kit(rng(seed + 10 + i));
      k.geo(sectorGeo(R, W, a0 + 0.004, a1 - 0.004, 0.55).translate(0, cy, 0), i % 2 ? S.pale : S.white, 0.04, 0);
      // little cooling fins on the outer rim
      for (let f = 0; f < 3; f++) {
        const a = a0 + ((f + 0.5) / 3) * (a1 - a0);
        const gg = new THREE.BoxGeometry(0.42, 0.08, 0.5).rotateZ(a).translate(Math.cos(a) * (R + 0.18), cy + Math.sin(a) * (R + 0.18), 0);
        k.geo(gg, S.light, 0.03, 0);
      }
      // the joint plate at the sector's start
      k.geo(new THREE.BoxGeometry(W + 0.1, 0.14, 0.62).translate(R - W / 2, 0, 0).rotateZ(a0).translate(0, cy, 0), S.grey, 0.03, 0);
      const m = k.build(sm);
      secs.push(m);
      prod.add(m);
      for (let s = 0; s < 6; s++) {
        const aa = a0 + (s / 6) * (a1 - a0), ab = a0 + ((s + 1) / 6) * (a1 - a0);
        for (const rr of [R, R - W]) ghost.push(V(Math.cos(aa) * rr, cy + Math.sin(aa) * rr, 0.3), V(Math.cos(ab) * rr, cy + Math.sin(ab) * rr, 0.3));
      }
    }
    const gg = new THREE.BufferGeometry().setFromPoints(ghost);
    const gm = new THREE.LineBasicMaterial({ color: '#5fd3b5', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: clip });
    const ghostLines = new THREE.LineSegments(gg, gm);
    prod.add(ghostLines);
    let built = 0;
    const b: Build = {
      obj: g,
      sync() {},
      set(u) {
        built = Math.min(12, Math.floor(u * 12.999));
        secs.forEach((m, i) => { m.visible = i < built; });
        ghostLines.visible = built < 12;
      },
      work(u, t) {
        const k = Math.min(11, Math.floor(u * 12));
        const frac = u * 12 - k;
        const an = -Math.PI / 2 + ((k + 0.5) / 12) * TAU;
        const aj = -Math.PI / 2 + (k / 12) * TAU;
        // A carries the next sector in from outside and sets it; B welds the joint
        const out = 1.8 * (1 - Math.min(1, frac * 2));
        return {
          a: V(Math.cos(an) * (R - W / 2 + out), cy + Math.sin(an) * (R - W / 2 + out), 0.5),
          b: V(Math.cos(aj) * (R - W / 2), cy + Math.sin(aj) * (R - W / 2) + Math.sin(t * 5) * 0.08, 0.45),
          weld: frac > 0.45 && u < 0.995,
        };
      },
      showProduct(on) { prod.visible = on; },
    };
    b.set(0);
    return b;
  }
  // h: a hull plate in five welded courses
  const { plateR: R, plateA: A, h } = PRODUCT;
  const n = 5, ch = h / n;
  const pm = paint(clip);
  const courses: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const k = new Kit(rng(seed + 20 + i));
    const y0 = Y0 + 0.2 + i * ch, y1 = y0 + ch - 0.03;
    k.geo(plateGeo(R, A, 0.36, y0, y1), i % 2 ? '#d8d1d6' : S.pale, 0.03, 0.05);
    // ribs on the inside (back): a horizontal frame and three stringers
    k.geo(plateGeo(R - 0.36, A * 0.96, 0.22, y0 + ch * 0.45, y0 + ch * 0.55), S.mid, 0.02, 0);
    for (const t of [-A * 0.7, 0, A * 0.7]) {
      const x = Math.sin(t) * (R - 0.5), z = Math.cos(t) * (R - 0.5) - R + 0.32;
      k.box(0.18, ch - 0.06, 0.26, S.mid, x, y0, z - 0.05, { r: 0.02, shade: 0 });
    }
    // rivets along the top edge
    for (let j = 0; j < 9; j++) {
      const t = -A * 0.9 + (j / 8) * A * 1.8;
      k.box(0.1, 0.1, 0.06, S.grey, Math.sin(t) * R, y1 - 0.16, Math.cos(t) * R - R + 0.33, { r: 0, jitter: 0, shade: 0 });
    }
    const m = k.build(pm);
    courses.push(m);
    prod.add(m);
  }
  // the fresh weld bead (glows while hot) along the newest seam
  const beadMat = new THREE.MeshStandardMaterial({ color: '#7a4a2a', emissive: '#ff8a3a', emissiveIntensity: 2.2, roughness: 0.6, clippingPlanes: clip });
  const bead = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.06, 4, 24, 2 * A).rotateX(Math.PI / 2).rotateY(A - Math.PI / 2), beadMat);
  bead.position.z = -R + 0.32;
  prod.add(bead);
  const blue = blueprint([[0, Y0 + 0.2, 0, Math.sin(A) * R * 2, h, 0.6]], '#5fd3b5', 0.6, clip);
  prod.add(blue);
  let done = 0;
  const b: Build = {
    obj: g,
    sync() {},
    set(u) {
      done = Math.min(n, Math.floor(u * (n + 0.999)));
      courses.forEach((m, i) => { m.visible = i < done; });
      bead.visible = done > 0 && done <= n && u < 0.999;
      bead.position.y = Y0 + 0.2 + Math.max(1, done) * ch - 0.03;
      blue.visible = done < n;
    },
    work(u, t) {
      const k = Math.min(n - 1, Math.floor(u * n));
      const frac = u * n - k;
      const yc = Y0 + 0.2 + (k + 0.5) * ch;
      const seamY = Y0 + 0.2 + k * ch;
      // A brings the next course in; B runs the torch along the seam below it
      const sx = Math.sin(-A * 0.85 + frac * A * 1.7) * R;
      const sz = Math.cos(-A * 0.85 + frac * A * 1.7) * R - R + 0.32 + 0.35;
      return { a: V(-0.4, yc + (1 - Math.min(1, frac * 3)) * 1.6, 0.9), b: V(sx, seamY + Math.sin(t * 7) * 0.05, sz), weld: k > 0 && u < 0.995 };
    },
    showProduct(on) { prod.visible = on; },
  };
  b.set(0);
  return b;
}

/** A finished product (no jig): for the outbound's stacks and the lanes drifting off. Centred on its middle. */
export function finishedProduct(kind: Product, seed: number, mat?: THREE.Material, film?: THREE.Material) {
  const k = new Kit(rng(seed));
  const { w, h } = PRODUCT;
  if (kind === 'c') {
    const fk = new Kit(rng(seed + 1));
    filmCells(fk, w, h, -h / 2, seed, 0);
    // a stiffening frame round the edge, corner fittings
    k.box(w + 0.3, 0.16, 0.18, S.mid, 0, h / 2 - 0.02, 0, { r: 0.04, shade: 0 });
    k.box(w + 0.3, 0.16, 0.18, S.mid, 0, -h / 2 - 0.14, 0, { r: 0.04, shade: 0 });
    for (const sx of [-1, 1]) k.box(0.16, h, 0.18, S.mid, sx * (w / 2 + 0.07), -h / 2, 0, { r: 0.04, shade: 0 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.box(0.34, 0.34, 0.26, S.dark, sx * (w / 2 + 0.07), sy * h / 2 - 0.17, 0, { r: 0.05, shade: 0 });
    const g = new THREE.Group();
    g.add(k.build(mat ?? paint()), fk.build(film ?? filmMat()));
    return g;
  }
  if (kind === 'r') {
    const { ringR: R, ringW: W } = PRODUCT;
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU, a1 = a0 + TAU / 12;
      k.geo(sectorGeo(R, W, a0 + 0.004, a1 - 0.004, 0.55), i % 2 ? S.pale : S.white, 0.04, 0);
      k.geo(new THREE.BoxGeometry(W + 0.1, 0.14, 0.62).translate(R - W / 2, 0, 0).rotateZ(a0), S.grey, 0.03, 0);
      for (let f = 0; f < 3; f++) {
        const a = a0 + ((f + 0.5) / 3) * (a1 - a0);
        k.geo(new THREE.BoxGeometry(0.42, 0.08, 0.5).rotateZ(a).translate(Math.cos(a) * (R + 0.18), Math.sin(a) * (R + 0.18), 0), S.light, 0.03, 0);
      }
    }
    const g = new THREE.Group();
    g.add(k.build(mat ?? paint()));
    return g;
  }
  const { plateR: R, plateA: A } = PRODUCT;
  const n = 5, ch = h / n;
  for (let i = 0; i < n; i++) {
    const y0 = -h / 2 + i * ch;
    k.geo(plateGeo(R, A, 0.36, y0, y0 + ch - 0.03), i % 2 ? '#d8d1d6' : S.pale, 0.03, 0.05);
    k.geo(plateGeo(R - 0.36, A * 0.96, 0.22, y0 + ch * 0.45, y0 + ch * 0.55), S.mid, 0.02, 0);
  }
  for (const t of [-A * 0.7, 0, A * 0.7]) k.box(0.18, h, 0.26, S.mid, Math.sin(t) * (R - 0.5), -h / 2, Math.cos(t) * (R - 0.5) - R + 0.27, { r: 0.02, shade: 0 });
  const g = new THREE.Group();
  g.add(k.build(mat ?? paint()));
  return g;
}
