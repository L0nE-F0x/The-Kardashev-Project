/**
 * Code-built pieces: the things that repeat, grow with the sim or move. Each matches the Meshy
 * house style (bevelled boxes, matte hand-painted colour, the game's palette).
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, poolMat, rng, withClouds, type Paint } from './kit';
import { model } from './models';
import { parkedCars } from './campus/life';

export interface Env {
  t: number;
  dt: number;
  /** 0 = full day, 1 = deep night. */
  night: number;
}

export interface Piece {
  obj: THREE.Object3D;
  /** Footprint (local), for the plot pad. */
  w: number;
  d: number;
  /** Height the construction clip runs to. */
  h: number;
  update?(e: Env): void;
  /** 0..1 while building; 1 = done. */
  progress?(p: number): void;
  /**
   * Reshape the ground under the piece (an open pit, a reservoir basin): the height at a point in
   * the piece's own coordinates, or null to leave the ground as it is.
   */
  ground?(x: number, z: number): number | null;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const hallPool = poolMat('#ffe2b0', 0.5);

/** Panel glass: a touch of sheen so the rows catch the sun. */
const panelMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25 }));

// ── shared bits ──────────────────────────────────────────────────────────────────────────────
function beacon(parent: THREE.Object3D, x: number, y: number, z: number, phase = 0) {
  const m = glowMat('red3', 0.2);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), m.clone());
  (b.material as THREE.MeshStandardMaterial).userData.blink = phase;
  b.position.set(x, y, z);
  b.userData.beacon = phase;
  parent.add(b);
  return b;
}
/** Blink the red aviation lights (stronger at night). */
export function blinkBeacons(root: THREE.Object3D, e: Env) {
  root.traverse((o) => {
    if (o.userData.beacon === undefined) return;
    const on = Math.sin(e.t * 2.2 + o.userData.beacon) > 0.55 ? 1 : 0;
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = on * (0.6 + e.night * 5);
  });
}

export function fence(kit: Kit, w: number, d: number, gate = 6, post: Paint = '#8a8490') {
  const h = 1.3;
  const sides: [number, number, number, number][] = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2]];
  // front side with a gate gap in the middle
  sides.push([-w / 2, d / 2, -gate / 2, d / 2], [gate / 2, d / 2, w / 2, d / 2]);
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) kit.box(0.12, h, 0.12, post, x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, { r: 0, jitter: 0 });
    for (const y of [0.35, h - 0.05]) kit.beam(V(x0, y, z0), V(x1, y, z1), 0.06, post);
  }
}

/** A chain-link mesh panel that reads as see-through. */
const meshMat = new THREE.MeshStandardMaterial({ color: col('#9a94a0'), transparent: true, opacity: 0.28, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
export function fenceMesh(group: THREE.Group, w: number, d: number, gate = 6) {
  const h = 1.25;
  const add = (len: number, x: number, z: number, ry: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), meshMat);
    p.position.set(x, h / 2, z);
    p.rotation.y = ry;
    group.add(p);
  };
  add(w, 0, -d / 2, 0);
  add(d, w / 2, 0, Math.PI / 2);
  add(d, -w / 2, 0, Math.PI / 2);
  const seg = (w - gate) / 2;
  add(seg, -w / 2 + seg / 2, d / 2, 0);
  add(seg, w / 2 - seg / 2, d / 2, 0);
}

/** A gravel pad the size of the plot. */
export function pad(w: number, d: number, paint: Paint = '#c4b8a6', seed = 1, mat?: THREE.Material) {
  const kit = new Kit(rng(seed));
  kit.box(w, 0.16, d, paint, 0, -0.04, 0, { r: 0.08, jitter: 0.02, shade: 0 });
  const m = kit.build(mat);
  m.castShadow = false;
  return m;
}

// ── construction: crane + scaffold + clip ────────────────────────────────────────────────────
export function crane(h: number, jib: number, seed = 1) {
  const g = new THREE.Group();
  const kit = new Kit(rng(seed));
  const s = 0.9;
  kit.box(2.2, 0.6, 2.2, '#8a8490', 0, 0, 0, { r: 0.05 });
  for (const [x, z] of [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]]) kit.box(0.12, h, 0.12, 'yel0', x, 0, z, { r: 0, jitter: 0 });
  for (let y = 0; y < h - 0.5; y += 1.2) {
    kit.beam(V(-s / 2, y, -s / 2), V(s / 2, y + 1.2, -s / 2), 0.07, 'org2');
    kit.beam(V(s / 2, y, s / 2), V(-s / 2, y + 1.2, s / 2), 0.07, 'org2');
    kit.beam(V(s / 2, y, -s / 2), V(s / 2, y + 1.2, s / 2), 0.07, 'org2');
    kit.beam(V(-s / 2, y, s / 2), V(-s / 2, y + 1.2, -s / 2), 0.07, 'org2');
  }
  g.add(kit.build());
  const top = new THREE.Group();
  top.position.y = h;
  const k2 = new Kit(rng(seed + 1));
  k2.box(1.6, 1.1, 1.4, 'yel0', 0, 0, 0);
  k2.box(1.0, 0.8, 1.0, '#e9e1d2', 0.3, 0.1, 0.75, { r: 0.08 }); // cab
  k2.box(jib, 0.45, 0.45, 'yel0', jib / 2 - 1, 1.1, 0, { r: 0.04 });
  k2.box(jib * 0.35, 0.4, 0.45, 'yel0', -jib * 0.175 - 0.5, 1.1, 0, { r: 0.04 });
  k2.box(1.6, 1.2, 1.2, '#7a7186', -jib * 0.33, 0.2, 0, { r: 0.06 }); // counterweight
  k2.box(0.3, 2.2, 0.3, 'yel0', 0, 1.1, 0, { r: 0.02 });
  k2.beam(V(0, 3.3, 0), V(jib - 1, 1.5, 0), 0.05, 'ink5');
  k2.beam(V(0, 3.3, 0), V(-jib * 0.35, 1.5, 0), 0.05, 'ink5');
  // hook
  k2.beam(V(jib * 0.6, 1.1, 0), V(jib * 0.6, -h * 0.55, 0), 0.04, 'ink4');
  k2.box(0.35, 0.4, 0.35, 'org0', jib * 0.6, -h * 0.55 - 0.4, 0, { r: 0.05 });
  top.add(k2.build());
  g.add(top);
  beacon(g, jib - 1.2 + 0, h + 1.6, 0, seed);
  g.userData.top = top;
  return g;
}

export function scaffold(w: number, h: number, d: number, seed = 1) {
  const kit = new Kit(rng(seed));
  const bay = 2.2, lvl = 1.8;
  const ring = (y: number) => {
    kit.beam(V(-w / 2, y, -d / 2), V(w / 2, y, -d / 2), 0.07, '#c9a35a');
    kit.beam(V(-w / 2, y, d / 2), V(w / 2, y, d / 2), 0.07, '#c9a35a');
    kit.beam(V(-w / 2, y, -d / 2), V(-w / 2, y, d / 2), 0.07, '#c9a35a');
    kit.beam(V(w / 2, y, -d / 2), V(w / 2, y, d / 2), 0.07, '#c9a35a');
  };
  for (let y = lvl; y <= h + 0.1; y += lvl) ring(y);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += w / Math.max(1, Math.round(w / bay))) {
    kit.box(0.09, h, 0.09, '#9d95a6', x, 0, -d / 2, { r: 0, jitter: 0 });
    kit.box(0.09, h, 0.09, '#9d95a6', x, 0, d / 2, { r: 0, jitter: 0 });
  }
  for (let z = -d / 2; z <= d / 2 + 0.01; z += d / Math.max(1, Math.round(d / bay))) {
    kit.box(0.09, h, 0.09, '#9d95a6', -w / 2, 0, z, { r: 0, jitter: 0 });
    kit.box(0.09, h, 0.09, '#9d95a6', w / 2, 0, z, { r: 0, jitter: 0 });
  }
  return kit.build();
}

/** Material piles, a site office and a port-a-loo for a site under construction. */
export function siteClutter(w: number, d: number, seed = 1) {
  const r = rng(seed);
  const kit = new Kit(r);
  kit.box(4, 1.5, 1.6, '#e9e1d2', -w / 2 + 2.6, 0, d / 2 - 1.4, { r: 0.08 });
  kit.box(1.2, 0.5, 0.06, 'cyn2', -w / 2 + 2.6, 0.7, d / 2 - 0.58, { r: 0 });
  kit.box(0.8, 1.6, 0.8, 'cyn3', -w / 2 + 5.2, 0, d / 2 - 1.2, { r: 0.1 });
  for (let i = 0; i < 4; i++) {
    const x = w / 2 - 2 - r() * 4, z = d / 2 - 1.5 - i * 1.3;
    kit.box(2.6, 0.5 + r() * 0.4, 1, i % 2 ? '#c08850' : '#9d95a6', x, 0, z, { r: 0.05 });
  }
  return kit.build();
}

/** Clip everything in obj above world height y (null = no clip). Gives the meshes their own materials. */
export function clipAbove(obj: THREE.Object3D, y: number | null) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (y === null) {
      if (m.userData.ownMat) {
        m.material = m.userData.ownMat.orig;
        delete m.userData.ownMat;
      }
      return;
    }
    if (!m.userData.ownMat) {
      const orig = m.material as THREE.Material;
      const c = orig.clone();
      // keep the palette shader hooks on Meshy materials
      c.onBeforeCompile = orig.onBeforeCompile;
      c.customProgramCacheKey = orig.customProgramCacheKey;
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), y);
      c.clippingPlanes = [plane];
      c.clipShadows = true;
      c.side = THREE.DoubleSide;
      m.material = c;
      m.userData.ownMat = { orig, plane };
    }
    (m.userData.ownMat.plane as THREE.Plane).constant = y;
  });
}

// ── the data hall ────────────────────────────────────────────────────────────────────────────
export interface HallOpts {
  W?: number;
  D?: number;
  H?: number;
  /** Rows of rooftop chillers. */
  chRows?: number;
  /** 2 = a two-storey hall (a floor band half way up). */
  storeys?: number;
  /** Leave out the car park (big halls fill the plot). */
  noParking?: boolean;
}

export function dataHall(seed: number, o: HallOpts = {}): Piece & { setLoad(f: number): void } {
  const g = new THREE.Group();
  const kit = new Kit(rng(seed));
  const W = o.W ?? 21, D = o.D ?? 11, H = o.H ?? 5.2;
  const chRows = o.chRows ?? 2;
  const wall: Paint = '#ddd6cc';
  // body: a plinth, walls with ribbed cladding, a parapet roof
  kit.box(W + 0.6, 0.5, D + 0.6, '#a39a91', 0, 0, 0, { r: 0.08 });
  kit.box(W, H, D, wall, 0, 0.4, 0, { r: 0.18, jitter: 0.02, shade: 0.18 });
  for (let x = -W / 2 + 0.9; x < W / 2 - 0.5; x += 1.15) {
    kit.box(0.22, H - 1.2, 0.12, '#c9c1b6', x, 0.9, D / 2 + 0.02, { r: 0.04, jitter: 0.01, shade: 0 });
    kit.box(0.22, H - 1.2, 0.12, '#c9c1b6', x, 0.9, -D / 2 - 0.02, { r: 0.04, jitter: 0.01, shade: 0 });
  }
  kit.box(W + 0.3, 0.5, D + 0.3, '#5b5562', 0, H + 0.35, 0, { r: 0.1, shade: 0 }); // parapet
  kit.box(W - 0.4, 0.1, D - 0.4, '#6f6878', 0, H + 0.6, 0, { r: 0, shade: 0 }); // roof membrane
  // teal accent band + entrance block with canopy at the front-left
  kit.box(W + 0.02, 0.45, D + 0.02, 'cyn3', 0, H - 0.35, 0, { r: 0.05, shade: 0 });
  if ((o.storeys ?? 1) > 1) kit.box(W + 0.04, 0.3, D + 0.04, '#b9b1a6', 0, H / 2, 0, { r: 0.04, shade: 0 });
  kit.box(4.2, 3.6, 2.2, '#efe8de', -W / 2 + 3, 0.4, D / 2 + 1, { r: 0.15 });
  kit.box(4.8, 0.3, 3.2, 'cyn2', -W / 2 + 3, 3.4, D / 2 + 1.4, { r: 0.08 });
  kit.box(2, 2.4, 0.1, '#3b6f7a', -W / 2 + 3, 0.5, D / 2 + 2.12, { r: 0.02 });
  // loading dock + roll-up doors on the right
  for (const x of [W / 2 - 3, W / 2 - 6.2]) {
    kit.box(2.6, 2.9, 0.12, '#8a8490', x, 0.5, D / 2 + 0.08, { r: 0.02 });
    for (let y = 0.8; y < 3.3; y += 0.3) kit.box(2.5, 0.04, 0.05, '#7a7186', x, y, D / 2 + 0.16, { r: 0, jitter: 0 });
  }
  kit.box(7.5, 1.0, 2.2, '#a39a91', W / 2 - 4.6, 0, D / 2 + 1.1, { r: 0.06 });
  // generator row along the back
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + 2.4 + i * 4.1;
    kit.box(3.4, 1.7, 1.6, '#e7dfd2', x, 0, -D / 2 - 2.3, { r: 0.12 });
    kit.box(3.42, 0.35, 1.62, 'org0', x, 0, -D / 2 - 2.3, { r: 0.05, shade: 0 });
    kit.cyl(0.14, 0.14, 0.9, '#5b5562', x + 1.1, 1.7, -D / 2 - 2.6, 6);
  }
  // pipe rack from the gens to the hall
  kit.box(W - 2, 0.25, 0.5, '#8a8490', 0, 2.2, -D / 2 - 0.9, { r: 0.04 });
  for (let x = -W / 2 + 1.5; x < W / 2 - 1; x += 3.5) kit.box(0.18, 2.2, 0.18, '#7a7186', x, 0, -D / 2 - 0.9, { r: 0, jitter: 0 });
  g.add(kit.build());

  // rooftop chillers with spinning fans
  const fans: THREE.Object3D[] = [];
  const fanGeo = new THREE.BoxGeometry(1.0, 0.04, 0.16);
  const fanMat = new THREE.MeshStandardMaterial({ color: col('#433c52'), roughness: 0.7 });
  const roof = new Kit(rng(seed + 3));
  const chCols = Math.floor((W - 1.6) / 3.2);
  for (let r = 0; r < chRows; r++)
    for (let c = 0; c < chCols; c++) {
      const x = -W / 2 + 2.3 + c * 3.2, z = chRows > 1 ? -D / 2 + 3.1 + r * ((D - 6.2) / (chRows - 1)) : 0;
      roof.box(2.7, 1.1, 2.3, '#b9c2c4', x, H + 0.6, z, { r: 0.1, jitter: 0.03 });
      roof.box(2.76, 0.18, 2.36, '#8a959a', x, H + 0.62, z, { r: 0.04, shade: 0 });
      for (const fx of [-0.65, 0.65]) {
        roof.cyl(0.58, 0.58, 0.1, '#5e6670', x + fx, H + 1.7, z, 14);
        const f = new THREE.Group();
        const a = new THREE.Mesh(fanGeo, fanMat), b = new THREE.Mesh(fanGeo, fanMat);
        b.rotation.y = Math.PI / 2;
        f.add(a, b);
        f.position.set(x + fx, H + 1.83, z);
        f.userData.spin = 6 + (c * 7 + r * 3) % 5;
        fans.push(f);
        g.add(f);
      }
    }
  g.add(roof.build());

  // the lights inside: a clerestory band that glows cyan as the hall fills
  const band = glowMat('cyn5', 0);
  band.userData.manual = true;
  for (const z of [D / 2 + 0.07, -D / 2 - 0.07]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W - 1.4, 0.35, 0.05), band);
    m.position.set(0, H - 0.95, z);
    g.add(m);
  }
  const windows = glowMat('yel1', 0);
  windows.userData.nightOnly = 1.2;
  const win = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.05), windows);
  win.position.set(-W / 2 + 3, 2.2, D / 2 + 2.15);
  g.add(win);
  // wall packs over the doors
  for (const x of [W / 2 - 3, W / 2 - 6.2, -W / 2 + 3]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.2), glowMat('yel1', 0.05));
    l.position.set(x, 3.7, D / 2 + 0.15 + (x < 0 ? 2.2 : 0));
    g.add(l);
    lightPool(g, x, 0, D / 2 + 2.6 + (x < 0 ? 1.6 : 0), 3.6, hallPool);
  }
  for (let i = 0; i < 5; i++) lightPool(g, -W / 2 + 2.4 + i * 4.1, 0, -D / 2 - 3.6, 2.6, hallPool);
  // a car park and the hall's own transformers at the front
  const front = new Kit(rng(seed + 5));
  if (!o.noParking) {
    front.box(12, 0.05, 4.4, '#6f6878', -6.5, 0.04, D / 2 + 5.6, { r: 0.03, shade: 0 });
    for (let i = 0; i < 6; i++) front.box(0.1, 0.02, 2.2, 'ink9', -12 + i * 2.2, 0.1, D / 2 + 5.4, { r: 0, jitter: 0 });
  }
  for (const x of [5.5, 8.5]) {
    front.box(2.2, 2.0, 1.8, '#8a8f80', x, 0.15, D / 2 + 5.4, { r: 0.08 });
    for (let k = 0; k < 4; k++) front.box(0.08, 1.5, 1.9, '#727868', x - 0.9 + k * 0.6, 0.35, D / 2 + 5.4, { r: 0, jitter: 0 });
    for (const bx of [-0.6, 0, 0.6]) front.cyl(0.09, 0.12, 0.8, '#d8cfc3', x + bx, 2.15, D / 2 + 5.4, 6);
  }
  front.box(5.6, 0.12, 3, '#a39a91', 7, 0, D / 2 + 5.4, { r: 0.03, shade: 0 });
  const fm = front.build();
  g.add(fm);
  if (!o.noParking) parkedCars(g, -11.4, D / 2 + 5.6, 6, 2.2, seed + 9, Math.PI / 2);

  let load = 0;
  return {
    obj: g, w: W + 2, d: D + 7, h: H + 2.5,
    setLoad(f) { load = f; },
    update(e) {
      for (const f of fans) f.rotation.y += e.dt * f.userData.spin * (0.3 + load);
      band.emissiveIntensity = load * (0.45 + e.night * 1.3);
    },
  };
}

// ── solar ────────────────────────────────────────────────────────────────────────────────────
export function solarFarm(seed: number, W = 26, D = 23, n = 8, trackerH = 0.9): Piece {
  const g = new THREE.Group();
  const rows: THREE.Mesh[] = [];
  const len = W - 2;
  for (let i = 0; i < n; i++) {
    const kit = new Kit(rng(seed + i));
    const z = -D / 2 + 1.4 + i * ((D - 2.8) / (n - 1));
    // posts and a torque tube
    for (let x = -len / 2 + 0.6; x <= len / 2; x += 2.4) kit.box(0.12, trackerH, 0.12, '#8a8490', x, 0, z, { r: 0, jitter: 0 });
    kit.box(len, 0.1, 0.1, '#7a7186', 0, trackerH, z, { r: 0, jitter: 0 });
    const row = new THREE.Group();
    const pk = new Kit(rng(seed * 7 + i));
    // panels: modules with a light frame, tilted towards the camera (south)
    const m = 1.05;
    for (let x = -len / 2 + m / 2; x < len / 2; x += m) {
      pk.box(m - 0.06, 0.06, 1.9, '#2c3f6e', x, 0, 0, { r: 0.015, jitter: 0.08, shade: 0 });
      pk.box(m - 0.02, 0.03, 1.94, '#9cb0c8', x, -0.03, 0, { r: 0, jitter: 0, shade: 0 });
    }
    const panels = pk.build(panelMat);
    panels.rotation.x = 0.42;
    panels.position.set(0, trackerH + 0.15, z);
    row.add(panels);
    const posts = kit.build();
    row.add(posts);
    g.add(row);
    rows.push(panels);
    row.userData.row = true;
  }
  // inverter skid in the middle
  const inv = new Kit(rng(seed + 50));
  inv.box(2.4, 1.6, 1.4, '#e7dfd2', W / 2 - 1.5, 0, D / 2 + 0.6, { r: 0.1 });
  inv.box(1.2, 1.4, 1.2, '#8a959a', W / 2 - 3.6, 0, D / 2 + 0.6, { r: 0.08 });
  g.add(inv.build());
  const rowGroups = g.children.filter((c) => c.userData.row);
  return {
    obj: g, w: W, d: D + 2, h: 3,
    progress(p) { rowGroups.forEach((r, i) => { r.visible = p >= 1 || i < Math.floor(p * rowGroups.length + 0.3); }); },
  };
}

// ── battery yard ─────────────────────────────────────────────────────────────────────────────
export function batteryYard(seed: number, tier = 1): Piece {
  const g = new THREE.Group();
  const units: THREE.Object3D[] = [];
  const r = rng(seed);
  const rowsN = tier >= 2 ? 4 : 3, levels = tier >= 3 ? 2 : 1;
  for (let lv = 0; lv < levels; lv++)
  for (let row = 0; row < rowsN; row++)
    for (let c = 0; c < 5; c++) {
      const kit = new Kit(r);
      const x = -9.6 + c * 4.6, z = rowsN > 3 ? -8.4 + row * 4.4 : -7 + row * 5.6;
      kit.box(3.9, 1.6, 1.7, '#ece6dc', 0, 0.12, 0, { r: 0.12, shade: 0.15 });
      kit.box(3.94, 0.28, 1.74, 'cyn3', 0, 1.25, 0, { r: 0.05, shade: 0 });
      for (let k = 0; k < 4; k++) kit.box(0.6, 0.7, 0.06, '#9d95a6', -1.35 + k * 0.9, 0.4, 0.86, { r: 0.02, jitter: 0 });
      kit.box(1.2, 0.35, 0.9, '#b9c2c4', 1.1, 1.72, 0, { r: 0.06 }); // HVAC on top
      kit.box(1.2, 0.12, 1.9, '#8a8490', 0, 0, 0, { r: 0, jitter: 0 }); // sleepers
      const u = kit.build();
      u.position.set(x, lv * 2.05, z);
      g.add(u);
      units.push(u);
    }
  // inverters / transformer at the front
  const k = new Kit(rng(seed + 9));
  for (let i = 0; i < 3; i++) {
    k.box(1.6, 1.8, 1.4, '#c9c1b6', -6 + i * 6, 0, 9.4, { r: 0.08 });
    k.box(0.9, 0.9, 0.9, '#8a959a', -4.6 + i * 6, 0, 9.4, { r: 0.06 });
  }
  g.add(k.build());
  g.scale.setScalar(rowsN > 3 ? 1.0 : 1.12);
  return {
    obj: g, w: 25, d: 22, h: 3 + levels * 2,
    progress(p) { units.forEach((u, i) => { u.visible = p >= 1 || i < Math.floor(p * units.length); }); },
  };
}

// ── wind ─────────────────────────────────────────────────────────────────────────────────────
export function windTurbine(seed: number, H = 19): { obj: THREE.Group; rotor: THREE.Group; tower: THREE.Object3D } {
  const g = new THREE.Group();
  const kit = new Kit(rng(seed));
  kit.cyl(1.4, 1.6, 0.5, '#a39a91', 0, 0, 0, 12);
  kit.cyl(0.32, 0.6, H, '#f1ece4', 0, 0.4, 0, 14, { shade: 0.08, jitter: 0.01 });
  kit.box(0.9, 0.9, 2.4, '#f1ece4', 0, H + 0.3, -0.3, { r: 0.35 });
  const tower = kit.build();
  g.add(tower);
  const rotor = new THREE.Group();
  rotor.position.set(0, H + 0.75, 0.95);
  const bl = 8.5 * (H / 19);
  const rk = new Kit(rng(seed + 1));
  rk.geo(new THREE.SphereGeometry(0.42, 10, 8).scale(1, 1, 1.35), '#f1ece4', 0.01);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.CylinderGeometry(0.06, 0.26, bl, 6).translate(0, bl / 2 + 0.3, 0).scale(1, 1, 0.45);
    blade.rotateZ((i * Math.PI * 2) / 3);
    rk.geo(blade, '#f6f2ea', 0.01);
  }
  rotor.add(rk.build());
  g.add(rotor);
  beacon(g, 0, H + 1.3, -0.6, seed);
  return { obj: g, rotor, tower };
}

export function windFarm(seed: number, tier = 1): Piece {
  const g = new THREE.Group();
  const spots: [number, number][] = tier >= 3 ? [[-9, 7], [-3, -7], [4, 6], [10, -5]] : [[-8, 6], [1, -6], [9, 5]];
  const H = tier >= 3 ? 30 : tier >= 2 ? 24 : 18;
  const ts = spots.map(([x, z], i) => {
    const t = windTurbine(seed + i * 5, H + i * 1.2);
    t.obj.position.set(x, 0, z);
    t.obj.rotation.y = -0.35;
    g.add(t.obj);
    return t;
  });
  const k = new Kit(rng(seed + 20));
  k.box(3, 1.8, 2, '#e7dfd2', -10, 0, -8, { r: 0.1 });
  k.box(1.6, 2.4, 1.6, '#8a959a', -7.4, 0, -8, { r: 0.08 });
  // gravel crane pads at each turbine
  for (const [x, z] of spots) k.box(4, 0.08, 4, '#c4b8a6', x + 2.5, 0, z, { r: 0.04, shade: 0 });
  const pads = k.build();
  pads.castShadow = false;
  g.add(pads);
  let done = 1;
  return {
    obj: g, w: 26, d: 24, h: H + 10,
    progress(p) {
      done = p;
      ts.forEach((t, i) => {
        const local = Math.min(1, Math.max(0, p * 3 - i));
        t.obj.visible = local > 0 || p >= 1;
        t.rotor.visible = local >= 1;
        t.obj.scale.y = Math.max(0.05, local);
      });
    },
    update(e) { for (const [i, t] of ts.entries()) if (done >= 1 || t.rotor.visible) t.rotor.rotation.z -= e.dt * (0.9 + i * 0.13); },
  };
}

// ── Meshy-based facilities ───────────────────────────────────────────────────────────────────
export function gasPlant(): Piece {
  const g = new THREE.Group();
  const m = model('gasplant', 24);
  m.rotation.y = 0;
  g.add(m);
  const s = m.userData.size as THREE.Vector3;
  beacon(g, -s.x * 0.2, s.y * 0.97, -s.z * 0.15, 1.3);
  return { obj: g, w: 26, d: 24, h: s.y + 0.5 };
}

export function researchLab(): Piece {
  const g = new THREE.Group();
  const m = model('lab', 15);
  m.position.z = -2;
  g.add(m);
  const kit = new Kit(rng(77));
  // a small car park in front
  kit.box(14, 0.06, 6, '#6f6878', 0, 0.02, 8.4, { r: 0.04, shade: 0 });
  for (let i = 0; i < 6; i++) kit.box(0.12, 0.02, 2.4, 'ink9', -6 + i * 2.4, 0.08, 8.2, { r: 0, jitter: 0 });
  const lot = kit.build();
  lot.castShadow = false;
  g.add(lot);
  parkedCars(g, -6, 8.3, 6, 2.4, 78, Math.PI / 2);
  const s = m.userData.size as THREE.Vector3;
  const lm = glowMat('yel1', 0);
  lm.userData.nightOnly = 0.9;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(s.x * 0.3, s.y * 0.3, 0.05), lm);
  glow.position.set(-s.x * 0.05, s.y * 0.25, -2 + s.z / 2 - 0.4);
  g.add(glow);
  return { obj: g, w: 18, d: 22, h: s.y + 0.3 };
}

// ── set dressing ─────────────────────────────────────────────────────────────────────────────
/** An oil pumpjack (the Permian Basin), nodding. */
export function pumpjack(seed: number) {
  const r = rng(seed);
  const paint: Paint = (['blu3', '#4f7d5c', '#8c4a3a', 'yel0'] as Paint[])[Math.floor(r() * 4)];
  const g = new THREE.Group();
  const k = new Kit(r);
  k.box(5.2, 0.35, 1.4, '#7a7186', 0, 0, 0, { r: 0.06 });
  k.beam(V(-0.2, 0.3, -0.5), V(0, 2.6, 0), 0.18, paint);
  k.beam(V(-0.2, 0.3, 0.5), V(0, 2.6, 0), 0.18, paint);
  k.beam(V(0.9, 0.3, 0), V(0, 2.6, 0), 0.16, paint);
  k.box(1.0, 0.8, 0.9, '#5b5562', -1.9, 0.3, 0, { r: 0.08 }); // gearbox + motor
  k.cyl(0.25, 0.25, 0.6, '#8a8490', 2.4, 0.3, 0, 8); // wellhead
  g.add(k.build());
  const beam = new THREE.Group();
  beam.position.set(0, 2.7, 0);
  const bk = new Kit(rng(seed + 1));
  bk.box(4.2, 0.28, 0.3, paint, 0.2, -0.14, 0, { r: 0.05 });
  bk.box(0.5, 1.4, 0.36, paint, 2.45, -1.0, 0, { r: 0.1 }); // horsehead
  bk.box(0.25, 0.12, 0.6, '#5b5562', -1.6, -0.06, 0, { r: 0.02 });
  bk.beam(V(2.55, -1.7, 0), V(2.55, -2.3, 0), 0.05, 'ink4');
  beam.add(bk.build());
  g.add(beam);
  const crank = new THREE.Group();
  crank.position.set(-1.9, 1.15, 0.58);
  const ck = new Kit(rng(seed + 2));
  ck.box(1.6, 0.5, 0.18, '#5b5562', 0, -0.25, 0, { r: 0.06 });
  crank.add(ck.build());
  g.add(crank);
  const phase = r() * 6;
  const speed = 1.4 + r() * 0.5;
  return {
    obj: g,
    update(e: Env) {
      const a = e.t * speed + phase;
      beam.rotation.z = Math.sin(a) * 0.22;
      crank.rotation.z = a;
    },
  };
}

/** A lattice transmission pylon (z = the line's direction). */
export function pylon(seed: number, H = 11) {
  const k = new Kit(rng(seed));
  const b = 1.4, t = 0.35;
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) k.beam(V(sx * b, 0, sz * b), V(sx * t, H, sz * t), 0.12, '#8a8490');
  for (let y = 0; y < H - 1; y += 1.6) {
    const w0 = b + (t - b) * (y / H), w1 = b + (t - b) * ((y + 1.6) / H);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      k.beam(V(ax * w0, y, az * w0), V(bx * w1, y + 1.6, bz * w1), 0.06, '#9d95a6');
    }
  }
  for (const [y, w] of [[H * 0.72, 3.2], [H - 0.2, 2.2]]) {
    k.box(w * 2, 0.2, 0.25, '#8a8490', 0, y, 0, { r: 0, jitter: 0 });
    for (const sx of [-1, 1]) k.cyl(0.08, 0.08, 0.6, '#d8cfc3', sx * w * 0.9, y - 0.6, 0, 6);
  }
  return k.build();
}

/** Wires between two points that sag; returns one merged mesh. */
export function wires(points: THREE.Vector3[][], sag = 0.9, paint: Paint = '#3a3442') {
  const k = new Kit(rng(3));
  for (const line of points)
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      const n = 8;
      let prev = a;
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(Math.PI * t) * sag;
        k.beam(prev, p, 0.05, paint);
        prev = p;
      }
    }
  const m = k.build();
  m.castShadow = true;
  return m;
}

/** A wooden utility pole with a cross arm. */
export function utilityPole(k: Kit, x: number, y: number, z: number, H = 6.5, ry = 0) {
  k.cyl(0.13, 0.16, H, '#7d5232', x, y, z, 6);
  const ax = Math.cos(ry), az = -Math.sin(ry);
  k.beam(V(x - ax * 1.1, y + H - 0.5, z - az * 1.1), V(x + ax * 1.1, y + H - 0.5, z + az * 1.1), 0.13, '#6b4a2c');
}

/** A street lamp; the head glows at night. */
export function streetLamp(group: THREE.Object3D, kit: Kit, x: number, y: number, z: number, dir = 1) {
  kit.box(0.14, 4.6, 0.14, '#5b5562', x, y, z, { r: 0, jitter: 0 });
  kit.box(1.2, 0.12, 0.14, '#5b5562', x + dir * 0.55, y + 4.5, z, { r: 0, jitter: 0 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.3), lampMat);
  head.position.set(x + dir * 1.05, y + 4.45, z);
  group.add(head);
  lightPool(group, x + dir * 1.05, y, z, 4.2, lampPool);
}
export const lampPool = poolMat('#ffd9a0', 0.55);
export const lampMat = glowMat('yel1', 0);
lampMat.userData.glowBase = 0;
lampMat.userData.nightOnly = 3.2;

/** Scrub clumps and rocks (instanced, per-instance colours). */
export function scrub(points: [number, number, number][], seed: number, kind: 'scrub' | 'rock' | 'grass') {
  const r = rng(seed);
  const geo = kind === 'rock' ? new THREE.DodecahedronGeometry(0.6, 0) : new THREE.IcosahedronGeometry(0.7, 0);
  const mat = withClouds(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }));
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const pal: Paint[] = kind === 'rock' ? ['rck4', 'rck5', '#b9a48e', 'rck3'] : kind === 'grass' ? ['#9a9a4c', '#b0a65a', '#7f8c45'] : ['#6f7a3c', '#7d8a45', '#5e6b38', '#8d8a4a', '#6a6f3a'];
  points.forEach(([x, y, z], i) => {
    const sc = kind === 'rock' ? 0.4 + r() * 1.1 : 0.5 + r() * 0.9;
    q.setFromEuler(new THREE.Euler(r() * 0.4, r() * 6.3, r() * 0.4));
    s.set(sc * (1 + r() * 0.4), sc * (kind === 'rock' ? 0.55 : 0.75), sc * (1 + r() * 0.4));
    p.set(x, y + (kind === 'rock' ? 0.05 : 0.15) * sc, z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    const c = col(pal[Math.floor(r() * pal.length)]).clone().multiplyScalar(0.85 + r() * 0.3);
    mesh.setColorAt(i, c);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Many copies of a Meshy model as instanced meshes (trees). */
export function instanced(parts: { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[], size: THREE.Vector3, at: { x: number; y: number; z: number; s: number; ry: number }[], target: number) {
  const g = new THREE.Group();
  const scale = target / Math.max(size.x, size.z);
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, at.length);
    const m = new THREE.Matrix4();
    at.forEach((a, i) => {
      m.compose(new THREE.Vector3(a.x, a.y, a.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a.ry, 0)), new THREE.Vector3().setScalar(scale * a.s));
      im.setMatrixAt(i, m.multiply(part.matrix));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }
  return g;
}

// ── people ───────────────────────────────────────────────────────────────────────────────────
const SHIRTS: Paint[] = ['cyn3', 'org1', 'blu4', 'red3', 'yel0', '#e9e1d2', 'vio3', 'grn5'];
const SKIN: Paint[] = ['skn2', 'skn3', 'skn4', 'skn5'];
/** A tiny figure (about 1.7 units tall), feet at y = 0. */
export function person(seed: number, vest = false) {
  const r = rng(seed);
  const k = new Kit(r);
  const shirt = vest ? 'org1' : SHIRTS[Math.floor(r() * SHIRTS.length)];
  const legs: Paint = ['#3b4a6e', '#4e4148', '#7d5232', '#2f2a3d'][Math.floor(r() * 4)];
  k.box(0.22, 0.75, 0.24, legs, -0.07, 0, 0, { r: 0.05, jitter: 0.02 });
  k.box(0.22, 0.75, 0.24, legs, 0.07, 0, 0, { r: 0.05, jitter: 0.02 });
  k.box(0.46, 0.62, 0.3, shirt, 0, 0.72, 0, { r: 0.1, jitter: 0.04 });
  k.geo(new THREE.SphereGeometry(0.17, 10, 8).translate(0, 1.52, 0), SKIN[Math.floor(r() * SKIN.length)], 0.02);
  if (vest) k.geo(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.56, 0), 'yel0', 0);
  else if (r() < 0.6) k.geo(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).translate(0, 1.56, -0.02), ['snd1', 'ink2', 'snd4', 'org0'][Math.floor(r() * 4)], 0);
  const m = k.build();
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** People walking loops between points, with a bob in their step. */
export class Walkers {
  readonly group = new THREE.Group();
  private ws: { o: THREE.Object3D; path: THREE.Vector3[]; i: number; t: number; speed: number; wait: number }[] = [];
  add(path: [number, number][], seed: number, y = 0, vest = false) {
    const o = person(seed, vest);
    const pts = path.map(([x, z]) => new THREE.Vector3(x, y, z));
    o.position.copy(pts[0]);
    this.group.add(o);
    this.ws.push({ o, path: pts, i: 0, t: rng(seed)() , speed: 1.1 + rng(seed + 1)() * 0.5, wait: 0 });
  }
  update(e: Env) {
    for (const w of this.ws) {
      if (w.wait > 0) { w.wait -= e.dt; w.o.position.y = w.path[0].y; continue; }
      const a = w.path[w.i], b = w.path[(w.i + 1) % w.path.length];
      const len = a.distanceTo(b) || 1;
      w.t += (e.dt * w.speed) / len;
      if (w.t >= 1) { w.t = 0; w.i = (w.i + 1) % w.path.length; if (Math.random() < 0.3) w.wait = 1 + Math.random() * 3; continue; }
      w.o.position.lerpVectors(a, b, w.t);
      w.o.position.y = a.y + Math.abs(Math.sin(e.t * 9 * w.speed)) * 0.08;
      w.o.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    }
  }
}

// ── ranch: a windpump over a stock tank, cattle ──────────────────────────────────────────────
export function windpump(seed: number) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const H = 9, b = 1.1, t = 0.25;
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) k.beam(V(sx * b, 0, sz * b), V(sx * t, H, sz * t), 0.1, '#8a8490');
  for (let y = 0; y < H - 1; y += 1.5) {
    const w0 = b + (t - b) * (y / H), w1 = b + (t - b) * ((y + 1.5) / H);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      k.beam(V(ax * w0, y, az * w0), V(bx * w1, y + 1.5, bz * w1), 0.05, '#9d95a6');
    }
  }
  k.box(0.7, 0.3, 0.7, '#8a8490', 0, H, 0, { r: 0.04 });
  k.beam(V(0, H + 0.4, 0), V(0, H + 0.4, -3), 0.08, '#8a8490');
  k.box(0.05, 1.5, 2.2, '#c23a3f', 0, H - 0.3, -3.6, { r: 0 }); // tail vane
  g.add(k.build());
  const wheel = new THREE.Group();
  wheel.position.set(0, H + 0.4, 0.5);
  const wk = new Kit(rng(seed + 1));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(0.34, 1.5, 0.04).translate(0, 1.15, 0);
    blade.rotateY(0.35);
    blade.rotateZ(a);
    wk.geo(blade, i % 2 ? '#e6e0e3' : '#c3bcc7', 0.02);
  }
  wk.geo(new THREE.TorusGeometry(1.85, 0.05, 4, 24), '#9d95a6', 0);
  wk.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8).rotateX(Math.PI / 2), '#5b5562', 0);
  wheel.add(wk.build());
  g.add(wheel);
  return { obj: g, update(e: Env) { wheel.rotation.z -= e.dt * 1.6; } };
}

const waterMat = withClouds(new THREE.MeshStandardMaterial({ color: col('#3b7fae'), roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.92 }));
export function stockPond(r: number, seed: number) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  // a muddy bank, then the water
  k.geo(new THREE.CylinderGeometry(r + 1.4, r + 2.2, 0.35, 28).translate(0, -0.1, 0), '#9c6c3d', 0.03);
  const bank = k.build();
  bank.castShadow = false;
  g.add(bank);
  const w = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), waterMat);
  w.position.y = 0.1;
  w.receiveShadow = true;
  g.add(w);
  return g;
}

export function cow(seed: number) {
  const r = rng(seed);
  const k = new Kit(r);
  const hide: Paint = (['#7d5232', '#3b2a24', '#a8703f', '#e9e1d2'] as Paint[])[Math.floor(r() * 4)];
  for (const [x, z] of [[-0.5, -0.22], [-0.5, 0.22], [0.5, -0.22], [0.5, 0.22]]) k.box(0.14, 0.6, 0.14, '#3b2a24', x, 0, z, { r: 0.03 });
  k.box(1.5, 0.62, 0.7, hide, 0, 0.55, 0, { r: 0.16 });
  k.box(0.5, 0.42, 0.42, hide, 0.92, 0.82, 0, { r: 0.1 });
  k.box(0.18, 0.2, 0.36, '#c58a5a', 1.18, 0.78, 0, { r: 0.05 });
  if (hide === '#e9e1d2') k.box(0.5, 0.3, 0.71, '#3b2a24', -0.2, 0.75, 0, { r: 0.08 });
  const m = k.build();
  const g = new THREE.Group();
  g.add(m);
  const head = m;
  const ph = r() * 6;
  return { obj: g, update(e: Env) { head.rotation.z = Math.max(0, Math.sin(e.t * 0.4 + ph)) * -0.06; } };
}
