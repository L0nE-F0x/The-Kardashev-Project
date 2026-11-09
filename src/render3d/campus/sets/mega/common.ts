/**
 * Shared bits for the megaproject kit (Act III): materials, instancing for the dense fields,
 * ground decals (tracks, gravel), site furniture (cabins, boards, flags, lamps, people, trucks),
 * grid gear (transformers, insulators, gantries), pipes, cranes and the animation list every piece
 * keeps. Everything is built with the Kit (bevelled, hand-painted, matte) in the game's palette.
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, mix, paintMat, poolMat, rng, withClouds, type Paint } from '../../../kit';
import { plumeUniforms, sign } from '../../../fx';
import { person as boxPerson, type Env } from '../../../pieces';
import { model, person as rigged, type ModelName, type PersonName } from '../../../models';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ── colours ──────────────────────────────────────────────────────────────────────────────────
export const P = {
  concrete: '#cfc7bb', concreteD: '#a39a91', wall: '#e3ddd3', white: '#ece6dc', cream: '#efe8de',
  steel: '#9d95a6', steelD: '#7a7186', steelL: '#c3bcc7', dark: '#5b5562', ink: '#433c52', roof: '#5b5562',
  gravel: '#c4b8a6', gravelD: '#aea395', asphalt: '#6f6878', silver: '#d9d6d2', porcelain: '#e7e2da',
  glass: '#3b6f7a', glassD: '#2f4d63', blue: '#345c96', blueD: '#264276', blueL: '#6c9fd2', gold: '#fbd46e',
  orange: '#f08a46', red: '#c23a3f', yellow: '#f4c64e', green: '#4f7d5c', timber: '#b07a46', timberD: '#8c5a34',
  panel: '#2c3f6e', panelL: '#3a5288', frame: '#a9b6c6', foam: '#e8f3f0',
} as const;

/** The Charter's own colours (blue field, gold orbit, white planet). */
export const CHARTER = { field: '#345c96', dark: '#264276', ring: '#fbd46e', planet: '#fbf7f0' };

/** Colours for the land a field stands on (tracks, worn ground, crop strips), by backdrop. */
export function fieldOf(backdrop?: string) {
  switch (backdrop) {
    case 'desert': return { track: '#e6c784', worn: '#d8b070', crop: null, grass: '#cdb27a', grazing: false };
    case 'volcanic': return { track: '#8a7a72', worn: '#6a6a52', crop: null, grass: '#6a7a4a', grazing: false };
    case 'mountain': return { track: '#b9a48e', worn: '#8a8a5a', crop: null, grass: '#7d8f4e', grazing: true };
    case 'boreal': return { track: '#a89a86', worn: '#76805a', crop: null, grass: '#5f7f4a', grazing: false };
    case 'coast': return { track: '#c8b48e', worn: '#8a9a5a', crop: '#b9a45a', grass: '#6f8f45', grazing: true };
    case 'savanna': return { track: '#d4a862', worn: '#b89a5a', crop: null, grass: '#c9a454', grazing: true };
    case 'temperate': return { track: '#c8b48e', worn: '#8a9a5a', crop: '#c9b06a', grass: '#6f9446', grazing: true };
    case 'tropical': return { track: '#bb8a4c', worn: '#6f8a42', crop: null, grass: '#4f8a3a', grazing: false };
    default: return { track: '#d4b47a', worn: '#a9a556', crop: '#d4b066', grass: '#b9a75a', grazing: true };
  }
}

/** A hex accent made a little darker / lighter (builder liveries). */
export const shade = (c: Paint, k: number) => (k < 0 ? mix(c, '#2f2a3d', -k) : mix(c, '#fbf7f0', k));

// ── materials (module level: they live for the whole session and follow the night) ──────────
/** Panel glass: a touch of sheen so the rows catch the sun. */
export const panelMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.22 }));
/** Heliostat mirrors: they hold the sky. */
export const mirrorMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.3 }));
/** Reservoirs and lakes. */
export const lakeMat = withClouds(new THREE.MeshStandardMaterial({ color: col('#3b7fae'), roughness: 0.14, metalness: 0.12, transparent: true, opacity: 0.94 }));
/** Window glass: dark glass by day, lit warm (or cool) at night. */
export const winMat = glowMat('yel1', 0);
winMat.color.copy(col('#4a6b78'));
winMat.roughness = 0.35;
winMat.userData.nightOnly = 1.25;
/** Big glazing (a whole façade): the same glass, lit more softly so it doesn't blow out. */
export const winBig = glowMat('yel1', 0);
winBig.color.copy(col('#4a6b78'));
winBig.roughness = 0.35;
winBig.userData.nightOnly = 0.62;
export const winCool = glowMat('#cfe6ff', 0);
winCool.color.copy(col('#4a6b78'));
winCool.roughness = 0.35;
winCool.userData.nightOnly = 1.0;
export const cyanMat = glowMat('cyn5', 0);
cyanMat.color.copy(col('#2f4d63'));
cyanMat.userData.nightOnly = 1.1;
export const ledGreen = glowMat('grn6', 0.25);
export const ledAmber = glowMat('org2', 0.2);
export const lampHead = glowMat('yel2', 0);
lampHead.userData.nightOnly = 3.2;
export const buoyLight = glowMat('yel1', 0.1);
export const warmPool = poolMat('#ffe2b0', 0.5);
export const workPool = poolMat('#fff1d4', 0.62);
export const cyanPool = poolMat('#9ff0e0', 0.35);

// ── animation ────────────────────────────────────────────────────────────────────────────────
/** What a piece animates each frame. */
export class Anim {
  readonly list: ((e: Env) => void)[] = [];
  add(f: (e: Env) => void) { this.list.push(f); }
  /** Spin an object about one of its axes (rad/s). */
  spin(o: THREE.Object3D, axis: 'x' | 'y' | 'z', speed: number) { this.list.push((e) => { o.rotation[axis] += e.dt * speed; }); }
  update = (e: Env) => { for (const f of this.list) f(e); };
}

// ── instancing ───────────────────────────────────────────────────────────────────────────────
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** A transform for `instances` (y rotation first, then x tilt, then z roll). */
export function xf(x: number, y: number, z: number, ry = 0, rx = 0, s = 1, rz = 0, sy = s) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, sy, s));
}
/**
 * One unit (a Kit's merged geometry) drawn many times: per-instance tint `tint(i)` (a brightness
 * multiplier, or a colour) on top of the unit's own hand-painted colours.
 */
export function instances(unit: Kit | THREE.BufferGeometry, at: THREE.Matrix4[], mat: THREE.Material = paintMat, tint?: (i: number) => number | THREE.Color) {
  const geo = unit instanceof Kit ? unit.build().geometry : unit;
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, at.length));
  const c = new THREE.Color();
  at.forEach((m, i) => {
    im.setMatrixAt(i, m);
    const t = tint ? tint(i) : 1;
    im.setColorAt(i, typeof t === 'number' ? c.setScalar(t) : t);
  });
  im.count = at.length;
  im.castShadow = true;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}
/** Random brightness jitter for instances. */
export const jit = (r: () => number, k = 0.08) => () => 1 + (r() - 0.5) * 2 * k;

// ── ground decals ────────────────────────────────────────────────────────────────────────────
/** A flat strip on the ground (a gravel track, a worn path), from (x0, z0) to (x1, z1). */
export function track(k: Kit, x0: number, z0: number, x1: number, z1: number, w: number, paint: Paint, y = 0.02) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.BoxGeometry(len, 0.06, w);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, y + 0.03, (z0 + z1) / 2);
  k.geo(g, paint, 0.03, 0);
}
/** A gravel yard (a pad smaller than the footprint, so the land shows round it). */
export function yard(k: Kit, w: number, d: number, x = 0, z = 0, paint: Paint = P.gravel) {
  k.box(w, 0.1, d, paint, x, -0.04, z, { r: 0.06, jitter: 0.02, shade: 0 });
}

/** A strip of ground draped over a height function (roads up a hillside). */
export function ribbon(pts: [number, number][], w: number, h: (x: number, z: number) => number, lift = 0.12) {
  const pos: number[] = [];
  const idx: number[] = [];
  // resample densely
  const path: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.7));
    for (let s = 0; s < n; s++) path.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
  }
  path.push(pts[pts.length - 1]);
  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i];
    const [px, pz] = path[Math.max(0, i - 1)], [nx, nz] = path[Math.min(path.length - 1, i + 1)];
    let dx = nx - px, dz = nz - pz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const ox = -dz * w / 2, oz = dx * w / 2;
    for (const s of [-1, 1]) {
      const vx = x + ox * s, vz = z + oz * s;
      pos.push(vx, Math.max(h(vx, vz), h(x, z)) + lift, vz);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  // make sure the faces point up
  const n = ng.attributes.normal;
  if (n.count && n.getY(0) < 0) {
    const p = ng.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, ax, ay, az);
    }
    ng.computeVertexNormals();
  }
  return ng;
}

// ── signs, boards, flags ─────────────────────────────────────────────────────────────────────
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const FONT = (px: number, w = 700) => `${w} ${px}px 'Atkinson Hyperlegible Next', system-ui, sans-serif`;

/** The Charter emblem (a white planet in a gold orbit on a blue disc) drawn at (x, y), radius r. */
function emblem(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = CHARTER.field;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = CHARTER.planet;
  g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fill();
  g.strokeStyle = CHARTER.ring;
  g.lineWidth = r * 0.14;
  g.beginPath(); g.ellipse(x, y, r * 0.8, r * 0.32, -0.35, 0, TAU); g.stroke();
}

/** The Charter's site board: the emblem, THE KARDASHEV PROJECT and the site's name. Faces +z. */
export function charterBoard(site: string, w: number) {
  const top = 'THE KARDASHEV PROJECT';
  const tex = canvasTex(`board:${site}`, 1024, 300, (g) => {
    g.fillStyle = CHARTER.dark; g.fillRect(0, 0, 1024, 300);
    g.strokeStyle = CHARTER.ring; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 286);
    g.fillStyle = '#f08a46'; g.fillRect(14, 272, 996, 14);
    emblem(g, 150, 146, 100);
    g.textBaseline = 'middle';
    g.fillStyle = '#fbf7f0';
    g.font = FONT(58);
    g.fillText(top, 280, 100, 720);
    g.fillStyle = CHARTER.ring;
    g.font = FONT(site.length > 18 ? 54 : 70);
    g.fillText(site, 280, 196, 720);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 300) / 1024), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
  m.userData.h = (w * 300) / 1024;
  return m;
}

/** A builder's board: their name (and the contract size) in white on their colour. */
export function builderBoard(text: string, w: number, accent: Paint, hi: Paint) {
  const a = `#${col(accent).getHexString(THREE.SRGBColorSpace)}`, b = `#${col(hi).getHexString(THREE.SRGBColorSpace)}`;
  const tex = canvasTex(`bboard:${text}:${a}:${b}`, 768, 220, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, 768, 220);
    g.fillStyle = b; g.fillRect(0, 0, 768, 26); g.fillRect(0, 194, 768, 26);
    g.fillStyle = '#fbf7f0';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = FONT(text.length > 12 ? 74 : 96);
    g.fillText(text, 384, 114, 720);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 220) / 768), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
}

/** Big painted letters (a unit number on a wall): text only, transparent. */
export function paintedText(text: string, w: number, paint: Paint, curved?: { r: number; arc: number }) {
  const hex = `#${col(paint).getHexString(THREE.SRGBColorSpace)}`;
  const tex = canvasTex(`paint:${text}:${hex}`, 512, 256, (g) => {
    g.fillStyle = hex;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = FONT(200, 800);
    g.fillText(text, 256, 140, 500);
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  if (curved) {
    const h = curved.r * curved.arc * 0.5;
    const g = new THREE.CylinderGeometry(curved.r, curved.r, h, 16, 1, true, -curved.arc / 2, curved.arc);
    return new THREE.Mesh(g, mat);
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), mat);
}

/** A flag that waves. `kind`: the Charter's, or a builder's two-tone. */
export function flag(parent: THREE.Object3D, anim: Anim, x: number, z: number, h: number, kind: 'charter' | { a: Paint; b: Paint }, seed = 1, y = 0, w = 2.4) {
  const k = new Kit(rng(seed));
  k.cyl(0.06, 0.09, h, '#d8d2cc', x, y, z, 6, { shade: 0 });
  k.geo(new THREE.SphereGeometry(0.12, 6, 4).translate(x, y + h + 0.05, z), P.gold, 0);
  parent.add(k.build());
  const fh = w * 0.62;
  let tex: THREE.Texture;
  if (kind === 'charter') {
    tex = canvasTex('flag:charter', 256, 160, (g) => {
      g.fillStyle = CHARTER.field; g.fillRect(0, 0, 256, 160);
      emblem(g, 128, 80, 62);
    });
  } else {
    const a = `#${col(kind.a).getHexString(THREE.SRGBColorSpace)}`, b = `#${col(kind.b).getHexString(THREE.SRGBColorSpace)}`;
    tex = canvasTex(`flag:${a}:${b}`, 128, 80, (g) => {
      g.fillStyle = a; g.fillRect(0, 0, 128, 80);
      g.fillStyle = b; g.fillRect(0, 28, 128, 24);
    });
  }
  const geo = new THREE.PlaneGeometry(w, fh, 8, 2).translate(w / 2, 0, 0);
  const base = Float32Array.from(geo.attributes.position.array as Float32Array);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
  m.position.set(x + 0.05, y + h - fh / 2 - 0.1, z);
  m.castShadow = true;
  parent.add(m);
  const ph = seed * 1.7;
  anim.add((e) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3];
      p.setZ(i, Math.sin(bx * 2.2 - e.t * 4 + ph) * 0.14 * (bx / w));
      p.setY(i, base[i * 3 + 1] - (bx / w) * 0.08);
    }
    p.needsUpdate = true;
  });
}

// ── furniture ────────────────────────────────────────────────────────────────────────────────
/** A red aviation light (the scene and the lab blink anything with userData.beacon). */
const beaconMat = glowMat('red3', 0.2);
const beaconGeo = new THREE.SphereGeometry(0.24, 8, 6);
beaconGeo.userData.shared = true;
export function beacon(parent: THREE.Object3D, x: number, y: number, z: number, phase = 0, s = 1) {
  const b = new THREE.Mesh(beaconGeo, beaconMat.clone());
  b.position.set(x, y, z);
  b.scale.setScalar(s);
  b.userData.beacon = phase;
  parent.add(b);
  return b;
}

/** Glowing window panes in one mesh (lit at night): rects given as [x, y, z, w, h, ry]. */
export function windows(parent: THREE.Object3D, rects: [number, number, number, number, number, number?][], mat: THREE.Material = winMat) {
  const gs = rects.map(([x, y, z, w, h, ry]) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (ry) g.rotateY(ry);
    return g.translate(x, y, z);
  });
  if (!gs.length) return;
  const k = new Kit(rng(1));
  for (const g of gs) k.geo(g, '#ffffff', 0, 0);
  const m = k.build(mat);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
}

/** A prefab site cabin (w along x), optional second storey; window glow goes to `glow`. */
export function cabin(k: Kit, glow: [number, number, number, number, number, number?][], x: number, z: number, w = 6, d = 2.6, wall: Paint = P.cream, band: Paint = CHARTER.field, y = 0) {
  const h = 2.6;
  k.box(w, 0.25, d, P.dark, x, y, z, { r: 0.04 });
  k.box(w, h, d, wall, x, y + 0.2, z, { r: 0.1, jitter: 0.03, shade: 0.12 });
  k.box(w + 0.06, 0.3, d + 0.06, band, x, y + h - 0.2, z, { r: 0.04, shade: 0 });
  k.box(w + 0.1, 0.14, d + 0.1, '#8a8490', x, y + h + 0.2, z, { r: 0.04, shade: 0 });
  // windows + a door on the front
  const nW = Math.max(1, Math.floor((w - 1.6) / 1.6));
  for (let i = 0; i < nW; i++) {
    const wx = x - w / 2 + 0.9 + i * 1.6 + 0.6;
    k.box(1.0, 0.8, 0.06, P.glassD, wx, y + 1.25, z + d / 2 + 0.01, { r: 0.02, jitter: 0.02, shade: 0 });
    glow.push([wx, y + 1.65, z + d / 2 + 0.05, 0.9, 0.7]);
  }
  k.box(0.8, 1.9, 0.06, '#8a8490', x + w / 2 - 0.7, y + 0.25, z + d / 2 + 0.01, { r: 0.02, shade: 0 });
  k.box(0.9, 0.3, 0.7, P.concreteD, x + w / 2 - 0.7, y, z + d / 2 + 0.4, { r: 0.04 });
}

/** A lamp post with a head that glows at night and a light pool under it. */
export function lamp(parent: THREE.Object3D, k: Kit, x: number, z: number, h = 6, dir = 1, pool: THREE.MeshBasicMaterial = warmPool, y = 0, poolR = 5) {
  k.box(0.16, h, 0.16, P.dark, x, y, z, { r: 0, jitter: 0 });
  k.box(1.1, 0.12, 0.16, P.dark, x + dir * 0.5, y + h - 0.1, z, { r: 0, jitter: 0 });
  const head = new THREE.Mesh(lampGeo, lampHead);
  head.position.set(x + dir * 0.95, y + h - 0.18, z);
  parent.add(head);
  lightPool(parent, x + dir * 0.95, y, z, poolR, pool);
}
const lampGeo = new THREE.BoxGeometry(0.6, 0.14, 0.32);
lampGeo.userData.shared = true;

/** A floodlight mast (a tall pole with a bank of lamps), with a wide pool. */
export function floodMast(parent: THREE.Object3D, k: Kit, x: number, z: number, h = 12, face = 0, y = 0) {
  k.cyl(0.14, 0.22, h, P.steel, x, y, z, 8);
  k.box(1.6, 0.16, 0.16, P.dark, x, y + h, z, { r: 0, ry: face });
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.3), lampHead);
  head.position.set(x + Math.sin(face) * 0.2, y + h + 0.3, z + Math.cos(face) * 0.2);
  head.rotation.y = face;
  parent.add(head);
  lightPool(parent, x + Math.sin(face) * 5, y, z + Math.cos(face) * 5, 9, workPool);
}

const PEOPLE_KINDS: PersonName[] = ['worker', 'engineer'];
/** A person standing (a rigged figure paused mid-pose, or the box figure while models load). */
export function standing(parent: THREE.Object3D, x: number, z: number, ry: number, seed: number, kind?: PersonName, y = 0) {
  const r = rng(seed * 31 + 7);
  const p = rigged(kind ?? PEOPLE_KINDS[Math.floor(r() * PEOPLE_KINDS.length)], 1.75 * (0.95 + r() * 0.1));
  let o: THREE.Object3D;
  if (p) {
    p.walk.time = r() * p.walk.getClip().duration;
    p.mixer.update(0);
    p.walk.paused = true;
    o = p.obj;
  } else o = boxPerson(seed, true);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  parent.add(o);
  return o;
}

/** People walking back and forth between points (rigged, with their walk cycle). */
export function strollers(parent: THREE.Object3D, anim: Anim, paths: [number, number][][], seed: number, y = 0, speed = 1.2) {
  paths.forEach((path, i) => {
    const r = rng(seed + i * 13);
    const p = rigged(PEOPLE_KINDS[Math.floor(r() * 2)], 1.75 * (0.95 + r() * 0.1));
    const o = p?.obj ?? boxPerson(seed + i, true);
    parent.add(o);
    const pts = path.map(([x, z]) => V(x, y, z));
    let seg = 0, t = r(), wait = r() * 3;
    const sp = speed * (0.85 + r() * 0.3);
    o.position.copy(pts[0]);
    anim.add((e) => {
      if (wait > 0) {
        wait -= e.dt;
        p?.mixer.update(0);
        return;
      }
      const a = pts[seg], b = pts[(seg + 1) % pts.length];
      const len = a.distanceTo(b) || 1;
      t += (e.dt * sp) / len;
      if (t >= 1) {
        t = 0;
        seg = (seg + 1) % pts.length;
        if (r() < 0.5) wait = 1 + r() * 4;
        return;
      }
      o.position.lerpVectors(a, b, t);
      o.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      p?.mixer.update(e.dt * sp);
    });
  });
}

const VEH_LEN: Partial<Record<ModelName, number>> = { pickup: 4.6, semitruck: 9.5, flatbed: 8, mixer: 7.5, van: 4.8, suv: 4.6, sedan: 4.4 };
/** A parked vehicle (models face −x; `ry` turns it). */
export function vehicle(parent: THREE.Object3D, kind: ModelName, x: number, z: number, ry = 0, y = 0.04) {
  const m = model(kind, VEH_LEN[kind] ?? 4.5);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

// ── grid gear ────────────────────────────────────────────────────────────────────────────────
/** A power transformer: tank, radiator fins, conservator, three bushings (s = scale). */
export function transformer(k: Kit, x: number, z: number, s = 1, band: Paint = P.blue, ry = 0, y = 0) {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const tank = '#8a8f80';
  k.box(3.2 * s, 0.35 * s, 2.4 * s, P.concreteD, x, y, z, { r: 0.05, ry });
  k.box(2.6 * s, 2.3 * s, 1.8 * s, tank, x, y + 0.3 * s, z, { r: 0.1 * s, ry });
  k.box(2.62 * s, 0.22 * s, 1.82 * s, band, x, y + 2.2 * s, z, { r: 0.04, ry, shade: 0 });
  // radiators either side
  for (const sd of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const [px, pz] = at((-1.0 + i * 0.5) * s, sd * 1.15 * s);
      k.box(0.08 * s, 1.8 * s, 0.45 * s, '#727868', px, y + 0.45 * s, pz, { r: 0, ry, jitter: 0.02 });
    }
  // conservator + bushings
  const [cx, cz] = at(-0.6 * s, -0.5 * s);
  hcyl(k, 0.32 * s, 1.6 * s, '#7c8072', cx, y + 3.4 * s, cz, Math.abs(Math.sin(ry)) > 0.7 ? 'z' : 'x');
  for (const bx of [-0.75, 0, 0.75]) {
    const [px, pz] = at(bx * s, 0.35 * s);
    k.cyl(0.08 * s, 0.17 * s, 1.5 * s, P.porcelain, px, y + 2.55 * s, pz, 7);
    k.geo(new THREE.SphereGeometry(0.12 * s, 6, 4).translate(px, y + 4.1 * s, pz), P.steelL, 0);
  }
}

/** An insulator column (porcelain sheds on a steel stand), as a unit for instancing (1 unit tall). */
export function insulatorUnit(paint: Paint = P.porcelain, sheds = 7) {
  const k = new Kit(rng(5));
  k.cyl(0.1, 0.13, 0.42, P.steelD, 0, 0, 0, 6, { shade: 0 });
  k.cyl(0.05, 0.05, 0.58, paint, 0, 0.4, 0, 6, { shade: 0 });
  for (let i = 0; i < sheds; i++) k.cyl(0.11, 0.13, 0.035, paint, 0, 0.44 + (i * 0.52) / sheds, 0, 8, { shade: 0, jitter: 0.02 });
  k.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6).translate(0, 0.99, 0), P.steelL, 0);
  return k;
}

/** A busbar gantry: two lattice columns and a beam (spanning x), at (x, z), `w` wide, `h` tall. */
export function gantry(k: Kit, x: number, z: number, w: number, h: number, paint: Paint = P.steel) {
  for (const sx of [-1, 1]) {
    const cx = x + (sx * w) / 2;
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) k.box(0.08, h, 0.08, paint, cx + dx, 0, z + dz, { r: 0, jitter: 0 });
    for (let y = 0.8; y < h; y += 1.2) {
      k.beam(V(cx - 0.3, y, z - 0.3), V(cx + 0.3, y + 1.0, z - 0.3), 0.04, paint);
      k.beam(V(cx - 0.3, y, z + 0.3), V(cx + 0.3, y + 1.0, z + 0.3), 0.04, paint);
    }
  }
  k.box(w + 0.8, 0.5, 0.6, paint, x, h - 0.2, z, { r: 0.02, jitter: 0 });
  for (let i = 0; i < 3; i++) {
    const bx = x - w / 3 + (i * w) / 3;
    k.cyl(0.05, 0.05, 1.3, P.porcelain, bx, h - 1.5, z, 6, { shade: 0 });
  }
}

/** Sagging wires between pairs of points, in one Kit. */
export function sagWires(k: Kit, a: THREE.Vector3, b: THREE.Vector3, sag = 0.8, t = 0.05, paint: Paint = '#3a3442', n = 8) {
  let prev = a;
  for (let s = 1; s <= n; s++) {
    const u = s / n;
    const p = a.clone().lerp(b, u);
    p.y -= Math.sin(Math.PI * u) * sag;
    k.beam(prev, p, t, paint);
    prev = p;
  }
}

/** A lattice transmission tower (x = across the line), `h` tall, with arms at the top. */
export function latticeTower(k: Kit, x: number, z: number, h: number, arm = 3.4, paint: Paint = '#8a8490', y = 0, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P3 = (lx: number, ly: number, lz: number) => V(x + lx * c + lz * s, y + ly, z - lx * s + lz * c);
  const b = 1.5, t = 0.4;
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) k.beam(P3(sx * b, 0, sz * b), P3(sx * t, h, sz * t), 0.13, paint);
  for (let yy = 0; yy < h - 1.2; yy += 1.8) {
    const w0 = b + (t - b) * (yy / h), w1 = b + (t - b) * ((yy + 1.8) / h);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      k.beam(P3(ax * w0, yy, az * w0), P3(bx * w1, yy + 1.8, bz * w1), 0.06, '#9d95a6');
    }
  }
  for (const [yy, w] of [[h * 0.78, arm], [h - 0.2, arm * 0.7]] as [number, number][]) {
    k.beam(P3(-w, yy, 0), P3(w, yy, 0), 0.22, paint);
    k.beam(P3(-w, yy, 0), P3(0, yy + 1.2, 0), 0.07, paint);
    k.beam(P3(w, yy, 0), P3(0, yy + 1.2, 0), 0.07, paint);
    for (const sx of [-1, 1]) k.cyl(0.07, 0.07, 0.9, P.porcelain, P3(sx * w * 0.92, 0, 0).x, yy - 0.9, P3(sx * w * 0.92, 0, 0).z, 6, { shade: 0 });
  }
  return { arms: [[h * 0.78 - 0.9, arm * 0.92], [h - 1.1, arm * 0.7 * 0.92]] as [number, number][] };
}

/** A horizontal cylinder centred at (cx, cy, cz), along x or z. */
export function hcyl(k: Kit, r: number, len: number, paint: Paint, cx: number, cy: number, cz: number, axis: 'x' | 'z' = 'x', seg = 10, rBot = r) {
  if (axis === 'x') k.cyl(r, rBot, len, paint, cx + len / 2, cy, cz, seg, { rz: Math.PI / 2, shade: 0 });
  else k.cyl(r, rBot, len, paint, cx, cy, cz - len / 2, seg, { rx: Math.PI / 2, shade: 0 });
}

// ── pipes ────────────────────────────────────────────────────────────────────────────────────
/** A pipe through points (cylinders with ball joints at the bends). */
export function pipe(k: Kit, pts: THREE.Vector3[], r: number, paint: Paint, seg = 10) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    if (len < 0.001) continue;
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z);
    k.geo(g, paint, 0.02, 0);
  }
  for (let i = 0; i < pts.length; i++) k.geo(new THREE.SphereGeometry(r * 1.02, seg, 5).translate(pts[i].x, pts[i].y, pts[i].z), paint, 0.02, 0);
}

/** A pipe support (a little H-frame) under a horizontal pipe at height y. */
export function pipeSupport(k: Kit, x: number, z: number, y: number, w = 0.9, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const sd of [-1, 1]) k.box(0.12, y, 0.12, P.steelD, x + sd * (w / 2) * c, 0, z - sd * (w / 2) * s, { r: 0, jitter: 0 });
  k.box(w + 0.2, 0.12, 0.2, P.steelD, x, y - 0.12, z, { r: 0, ry, jitter: 0 });
}

// ── cranes ───────────────────────────────────────────────────────────────────────────────────
/** A tower crane in a builder's colours; `userData.top` slews, `userData.hook` rises and falls. */
export function towerCrane(h: number, jib: number, accent: Paint, hi: Paint, seed = 1) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const s = 1.0;
  k.box(3, 0.8, 3, P.concreteD, 0, 0, 0, { r: 0.06 });
  for (const [x, z] of [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]]) k.box(0.13, h, 0.13, accent, x, 0, z, { r: 0, jitter: 0 });
  for (let y = 0.6; y < h - 0.8; y += 1.3) {
    k.beam(V(-s / 2, y, -s / 2), V(s / 2, y + 1.3, -s / 2), 0.07, hi);
    k.beam(V(s / 2, y, s / 2), V(-s / 2, y + 1.3, s / 2), 0.07, hi);
    k.beam(V(s / 2, y, -s / 2), V(s / 2, y + 1.3, s / 2), 0.07, hi);
    k.beam(V(-s / 2, y, s / 2), V(-s / 2, y + 1.3, -s / 2), 0.07, hi);
  }
  g.add(k.build());
  const top = new THREE.Group();
  top.position.y = h;
  const t = new Kit(rng(seed + 1));
  t.box(1.7, 1.1, 1.5, accent, 0, 0, 0);
  t.box(1.1, 0.9, 1.1, P.cream, 0.35, 0.05, 0.85, { r: 0.1 });
  t.box(0.9, 0.5, 0.05, P.glassD, 0.35, 0.4, 1.42, { r: 0.02 });
  // the jib as a triangular truss
  const jy = 1.1;
  t.box(jib, 0.1, 0.1, accent, jib / 2 - 0.8, jy, -0.35, { r: 0, jitter: 0 });
  t.box(jib, 0.1, 0.1, accent, jib / 2 - 0.8, jy, 0.35, { r: 0, jitter: 0 });
  t.box(jib, 0.1, 0.1, accent, jib / 2 - 0.8, jy + 0.75, 0, { r: 0, jitter: 0 });
  for (let x = -0.8; x < jib - 1; x += 1.0) {
    t.beam(V(x, jy, -0.35), V(x + 0.5, jy + 0.75, 0), 0.05, hi);
    t.beam(V(x, jy, 0.35), V(x + 0.5, jy + 0.75, 0), 0.05, hi);
    t.beam(V(x + 0.5, jy + 0.75, 0), V(x + 1.0, jy, -0.35), 0.05, hi);
    t.beam(V(x + 0.5, jy + 0.75, 0), V(x + 1.0, jy, 0.35), 0.05, hi);
  }
  const cj = jib * 0.32;
  t.box(cj, 0.4, 0.7, accent, -cj / 2 - 0.8, jy, 0, { r: 0.04 });
  t.box(1.6, 1.3, 1.1, '#7a7186', -cj + 0.2, jy - 0.4, 0, { r: 0.06 });
  t.box(0.32, 2.6, 0.32, accent, 0, jy, 0, { r: 0.02 });
  t.beam(V(0, jy + 2.6, 0), V(jib - 1.2, jy + 0.8, 0), 0.05, P.ink);
  t.beam(V(0, jy + 2.6, 0), V(-cj, jy + 0.4, 0), 0.05, P.ink);
  top.add(t.build());
  // trolley + hook
  const hook = new THREE.Group();
  const hk = new Kit(rng(seed + 2));
  hk.box(0.8, 0.3, 0.8, P.dark, 0, -0.3, 0, { r: 0.04 });
  hk.box(0.5, 0.5, 0.4, P.yellow, 0, -1.0, 0, { r: 0.06 });
  hook.add(hk.build());
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.04).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: col(P.ink), roughness: 0.8 }));
  hook.add(cable);
  hook.position.set(jib * 0.6, jy, 0);
  top.add(hook);
  g.add(top);
  beacon(top, jib - 1.4, jy + 1.0, 0, seed);
  beacon(top, 0, jy + 2.8, 0, seed + 1);
  g.userData.top = top;
  g.userData.hook = hook;
  g.userData.cable = cable;
  g.userData.jy = jy;
  return g;
}
/** Slew a tower crane and work its hook (call from update). */
export function workCrane(c: THREE.Object3D, e: Env, phase: number, swing = 1.0, drop = 8) {
  const top = c.userData.top as THREE.Object3D, hook = c.userData.hook as THREE.Object3D, cable = c.userData.cable as THREE.Object3D;
  top.rotation.y = phase + Math.sin(e.t * 0.18 + phase) * swing;
  const d = 2 + (0.5 + 0.5 * Math.sin(e.t * 0.31 + phase * 2)) * drop;
  hook.children[0].position.y = -d + 0.6;
  cable.scale.y = Math.max(0.1, d - 0.6);
}

/** A lattice boom between two points (four chords and zig-zag lacing), `b` wide. */
export function latticeBoom(k: Kit, a: THREE.Vector3, z: THREE.Vector3, b: number, chord: Paint, lace: Paint, taper = 0.5) {
  const dir = z.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const side = V(0, 0, 1).cross(dir).normalize().multiplyScalar(-1);
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  const up = dir.clone().cross(side).normalize();
  const corner = (t: number, sx: number, sy: number) => {
    const w = b * (1 - t * (1 - taper)) * 0.5;
    return a.clone().addScaledVector(dir, t * len).addScaledVector(V(0, 0, 1), sx * w).addScaledVector(up, sy * w);
  };
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam(corner(0, sx, sy), corner(1, sx, sy), 0.12, chord);
  const n = Math.max(2, Math.round(len / 1.4));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const s = i % 2 ? 1 : -1;
    k.beam(corner(t0, -1, s), corner(t1, -1, -s), 0.05, lace);
    k.beam(corner(t0, 1, s), corner(t1, 1, -s), 0.05, lace);
    k.beam(corner(t0, s, -1), corner(t1, -s, -1), 0.05, lace);
    k.beam(corner(t0, s, 1), corner(t1, -s, 1), 0.05, lace);
  }
}

/** Construction hoarding along x (panels in the builder's colours with a stripe). */
export function hoarding(k: Kit, x0: number, x1: number, z: number, accent: Paint, hi: Paint, gaps: [number, number][] = []) {
  const pw = 2.4;
  for (let x = x0; x + pw <= x1 + 0.01; x += pw) {
    const cx = x + pw / 2;
    if (gaps.some(([a, b]) => cx > a && cx < b)) continue;
    k.box(pw - 0.06, 1.9, 0.1, accent, cx, 0.05, z, { r: 0.02, jitter: 0.03, shade: 0.1 });
    k.box(pw - 0.06, 0.24, 0.12, hi, cx, 1.35, z, { r: 0, jitter: 0.02, shade: 0 });
    k.box(0.1, 2.0, 0.6, P.steelD, x, 0, z - 0.25, { r: 0, jitter: 0 });
  }
}

/** Stacked material: pallets of crates, rebar bundles, pipe stacks (a laydown area). */
export function laydown(k: Kit, x: number, z: number, w: number, d: number, seed: number, kinds: ('crate' | 'rebar' | 'pipe' | 'panel' | 'section' | 'drum')[] = ['crate', 'rebar', 'pipe']) {
  const r = rng(seed);
  k.box(w, 0.06, d, P.gravelD, x, 0.0, z, { r: 0.03, jitter: 0.02, shade: 0 });
  const cols = Math.max(1, Math.floor(w / 2.6)), rows = Math.max(1, Math.floor(d / 1.8));
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const cx = x - w / 2 + 1.3 + i * (w - 2.6) / Math.max(1, cols - 1);
      const cz = z - d / 2 + 0.9 + j * (d - 1.8) / Math.max(1, rows - 1);
      const kind = kinds[Math.floor(r() * kinds.length)];
      if (kind === 'crate') {
        const n = 1 + Math.floor(r() * 3);
        for (let l = 0; l < n; l++) k.box(2.0, 0.7, 1.2, l % 2 ? '#c08850' : '#b07a46', cx, 0.06 + l * 0.72, cz, { r: 0.05 });
      } else if (kind === 'panel') {
        const n = 2 + Math.floor(r() * 3);
        for (let l = 0; l < n; l++) {
          k.box(2.1, 0.16, 1.3, '#a07848', cx, 0.06 + l * 0.48, cz, { r: 0.02 });
          k.box(2.0, 0.3, 1.2, P.panel, cx, 0.22 + l * 0.48, cz, { r: 0.02 });
        }
      } else if (kind === 'rebar') {
        for (let l = 0; l < 6; l++) k.box(2.2, 0.08, 0.08, '#8c4a3a', cx, 0.1 + (l % 3) * 0.1, cz - 0.3 + Math.floor(l / 3) * 0.3 + (l % 3) * 0.05, { r: 0, jitter: 0.05 });
        k.box(0.12, 0.12, 1.0, P.timberD, cx - 0.8, 0.06, cz, { r: 0 });
        k.box(0.12, 0.12, 1.0, P.timberD, cx + 0.8, 0.06, cz, { r: 0 });
      } else if (kind === 'pipe') {
        for (let l = 0; l < 3; l++) hcyl(k, 0.32, 2.2, P.steel, cx, 0.4, cz - 0.65 + l * 0.65);
        hcyl(k, 0.32, 2.2, P.steel, cx, 0.95, cz - 0.32);
        hcyl(k, 0.32, 2.2, P.steel, cx, 0.95, cz + 0.32);
      } else if (kind === 'drum') {
        // cable drums: timber flanges, black cable wound on
        for (const dz of [-0.45, 0.45]) hcyl(k, 0.85, 0.12, P.timber, cx, 0.86, cz + dz, 'z', 14);
        hcyl(k, 0.62, 0.8, '#2f2a3d', cx, 0.86, cz, 'z', 12);
      } else {
        hcyl(k, 0.9, 2.2, P.white, cx, 1.0, cz, 'x', 14);
        k.box(0.3, 0.4, 1.8, P.timberD, cx - 0.8, 0.06, cz, { r: 0.02 });
        k.box(0.3, 0.4, 1.8, P.timberD, cx + 0.8, 0.06, cz, { r: 0.02 });
      }
    }
}

/** Survey stakes with flagging tape. */
export function stake(k: Kit, x: number, z: number, tape: Paint = '#f0508a', h = 1.0) {
  k.box(0.08, h, 0.08, '#c08850', x, 0, z, { r: 0, jitter: 0.06 });
  k.box(0.04, 0.14, 0.34, tape, x, h - 0.28, z + 0.18, { r: 0, jitter: 0.04 });
}

/** A buoy (cylinder, cone and an X topmark) — a unit for instancing, waterline at y = 0. */
export function buoyUnit(body: Paint = P.yellow) {
  const k = new Kit(rng(3));
  k.cyl(0.55, 0.7, 0.9, body, 0, -0.45, 0, 12, { shade: 0.1 });
  k.cyl(0.3, 0.55, 1.1, body, 0, 0.45, 0, 10, { shade: 0 });
  k.box(0.08, 1.2, 0.08, P.dark, 0, 1.5, 0, { r: 0 });
  k.box(0.6, 0.1, 0.1, body, 0, 2.6, 0, { r: 0, ry: 0.8 });
  k.box(0.6, 0.1, 0.1, body, 0, 2.6, 0, { r: 0, ry: -0.8 });
  return k;
}

/** Foam rings on the sea round a pile (a flat ring at the waterline). */
const foamMat = new THREE.MeshStandardMaterial({ color: col(P.foam), transparent: true, opacity: 0.75, roughness: 0.9, depthWrite: false });
export function foamRing(parent: THREE.Object3D, x: number, z: number, r: number, y = -1.17) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.55, 20).rotateX(-Math.PI / 2), foamMat);
  m.position.set(x, y, z);
  m.renderOrder = 1;
  parent.add(m);
  return m;
}
/** A white wake (an elongated flat blob) behind a boat. */
const wakeMat = new THREE.MeshStandardMaterial({ color: col(P.foam), transparent: true, opacity: 0.32, roughness: 0.9, depthWrite: false });
export function wake(len: number, w: number) {
  const g = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
  g.scale(len, 1, w);
  const m = new THREE.Mesh(g, wakeMat);
  m.renderOrder = 1;
  return m;
}

/** A survey drone circling (radius r at height h round (x, z)), its little lights blinking. */
export function drone(parent: THREE.Object3D, anim: Anim, x: number, z: number, r: number, h: number, seed: number) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  k.box(0.5, 0.16, 0.5, '#fbf7f0', 0, 0, 0, { r: 0.05 });
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    k.beam(V(0, 0.06, 0), V(Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5), 0.05, '#5b5562');
    k.cyl(0.24, 0.24, 0.02, '#433c52', Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5, 10, { shade: 0 });
  }
  k.box(0.14, 0.12, 0.14, '#2f2a3d', 0, -0.12, 0.12, { r: 0 });
  g.add(k.build());
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), ledGreen);
  led.position.set(0, 0.1, -0.26);
  g.add(led);
  parent.add(g);
  const ph = seed * 0.37;
  anim.add((e) => {
    const a = e.t * 0.18 + ph;
    g.position.set(x + Math.cos(a) * r, h + Math.sin(e.t * 0.7 + ph) * 0.4, z + Math.sin(a) * r * 0.7);
    g.rotation.y = -a;
    g.rotation.z = 0.12;
  });
}

/** Sea level for offshore pieces (the ground's water plane). */
export const SEA = -1.2;
/** The sea floor out there. */
export const SEABED = -7.2;

/** A plain sign (the fx helper) placed on a face. */
export function placard(parent: THREE.Object3D, text: string, w: number, x: number, y: number, z: number, fg: Paint, bg: Paint | null, ry = 0, glow = false) {
  const s = sign(text, w, fg, bg, { glow });
  s.position.set(x, y, z);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

/**
 * Soft additive glows as points (a receiver's halo, shafts of light): points stay out of the
 * ambient-occlusion pass, so they never darken what's behind them. Sizes in world units.
 */
let softTex: THREE.Texture | null = null;
function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}
export function glowPoints(pts: THREE.Vector3[], sizes: number[], color: Paint, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: softTexture() }, color: { value: col(color).clone() }, opacity: { value: opacity }, scale: plumeUniforms.scale },
    vertexShader: `attribute float size; uniform float scale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(color * a * opacity, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.renderOrder = 6;
  return p;
}

/** Plants instanced (code-built trees from trees.ts) with their own material. */
export const plantMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));

export type { Env };
