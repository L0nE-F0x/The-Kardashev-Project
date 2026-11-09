/**
 * Shared bits for Shackleton Base (Act IV–V on the Moon): regolith and foil colours, printed
 * regolith domes, landers (the crew lander, Kip's scout), rovers, floodlight masts, solar wings,
 * radiators, survey stakes, the Charter flag (stiff top bar: no wind), suited figures, and dust
 * that flies in clean arcs and falls straight back (no air: no plumes or steam out here). The
 * sun skims the horizon, so `sunDir` finds the scene's light for things that track it.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { col, Kit, rng, type Paint } from '../../../kit';
import { plumeUniforms } from '../../../fx';
import { hasModel, loadModels, person } from '../../../models';
import type { Env } from '../../../pieces';
import { beacon, coolPool, lampHeadMat, pipeRun, warmPool, winMat as windowGlow } from '../../plants2/parts';
import { lightPool } from '../../../kit';
import { Ctx, hcyl, LiteKit, mixHex, TAU, V } from '../fusion/common';

/** The Charter's colours (blue field, gold orbit, white planet). */
export const CHARTER_HEX = { field: '#345c96', dark: '#264276', ring: '#fbd46e', planet: '#fbf7f0' };

export { Ctx, hcyl, LiteKit, mixHex, TAU, V, beacon, pipeRun, lampHeadMat, warmPool, coolPool };

// ── colours ──────────────────────────────────────────────────────────────────────────────────
export const M = {
  reg: '#9d95a6', reg2: '#8a8490', reg3: '#7a7186', regD: '#5b5562', berm: '#948c9c',
  printed: '#aaa2ad', printed2: '#968e9a', white: '#eeeae4', white2: '#dcd7d0', cream: '#e7e2da',
  foil: '#e3b04c', foil2: '#c98f3a', panel: '#2c3f6e', panelL: '#3a5288', rad: '#f3f0ea',
  steel: '#a39ba8', steelD: '#6a6474', dark: '#433c52', ink: '#2f2a3d', glass: '#2f4d63', ice: '#d6e2f0', frost: '#eef4fa',
} as const;

/** The direction to the sun in the piece's space (the scene's directional light), or a default low sun. */
const _sun = new THREE.Vector3();
export interface SunCache { light?: THREE.DirectionalLight; next?: number }
export function sunDir(obj: THREE.Object3D, cache: SunCache, t: number) {
  if (!cache.light && t >= (cache.next ?? 0)) {
    cache.next = t + 1.5;
    let root: THREE.Object3D = obj;
    while (root.parent) root = root.parent;
    if (root !== obj) root.traverse((o) => { if (!cache.light && (o as THREE.DirectionalLight).isDirectionalLight) cache.light = o as THREE.DirectionalLight; });
  }
  const l = cache.light;
  if (!l) return _sun.set(-0.64, 0.17, 0.75).normalize();
  return _sun.copy(l.position).sub(l.target.position).normalize();
}

// ── suited figures ───────────────────────────────────────────────────────────────────────────
/** An astronaut standing about (loads the suited figure on first use). */
export function astro(parent: THREE.Object3D, x: number, z: number, ry: number, seed: number, y = 0) {
  const put = () => {
    const p = person('astronaut', 1.8 * (0.97 + (seed % 5) * 0.012));
    if (!p) return;
    p.walk.time = (seed % 11) * 0.09;
    p.mixer.update(0);
    p.walk.paused = true;
    p.obj.position.set(x, y, z);
    p.obj.rotation.y = ry;
    parent.add(p.obj);
  };
  if (hasModel('astronaut')) put();
  else loadModels(['astronaut']).then(put).catch(() => {});
}

// ── textures: the Charter flag and board ─────────────────────────────────────────────────────
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
function emblem(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = CHARTER_HEX.field;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = CHARTER_HEX.planet;
  g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fill();
  g.strokeStyle = CHARTER_HEX.ring;
  g.lineWidth = r * 0.14;
  g.beginPath(); g.ellipse(x, y, r * 0.8, r * 0.32, -0.35, 0, TAU); g.stroke();
}
const FONT = (px: number) => `700 ${px}px 'Atkinson Hyperlegible Next', system-ui, sans-serif`;
/** The Charter's site board: emblem, THE KARDASHEV PROJECT, the site, a second line. Faces +z. */
export function charterBoard(site: string, line2: string, w: number) {
  const tex = canvasTex(`mboard:${site}:${line2}`, 1024, 360, (g) => {
    g.fillStyle = CHARTER_HEX.dark; g.fillRect(0, 0, 1024, 360);
    g.strokeStyle = CHARTER_HEX.ring; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 346);
    emblem(g, 160, 180, 112);
    g.textBaseline = 'middle';
    g.fillStyle = '#fbf7f0'; g.font = FONT(54); g.fillText('THE KARDASHEV PROJECT', 300, 92, 700);
    g.fillStyle = CHARTER_HEX.ring; g.font = FONT(78); g.fillText(site, 300, 184, 700);
    g.fillStyle = '#9cc4ea'; g.font = FONT(50); g.fillText(line2, 300, 274, 700);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 360) / 1024), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
}
/** A builder's board in their colours. */
export function builderBoard(text: string, w: number, acc: string, hi: string, ink: string) {
  const tex = canvasTex(`mbb:${text}:${acc}:${hi}`, 768, 220, (g) => {
    g.fillStyle = acc; g.fillRect(0, 0, 768, 220);
    g.fillStyle = hi; g.fillRect(0, 0, 768, 24); g.fillRect(0, 196, 768, 24);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = FONT(text.length > 12 ? 74 : 96); g.fillText(text, 384, 114, 720);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 220) / 768), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
}
/** The Charter flag on a pole with a stiff top bar (there's no wind to fly it). */
export function moonFlag(parent: THREE.Object3D, k: Kit, x: number, z: number, h = 3.2, ry = 0.3) {
  k.cyl(0.05, 0.05, h, '#d9d6d2', x, 0, z, 6);
  const w = 1.5, fh = 0.95;
  k.box(w + 0.1, 0.05, 0.05, '#d9d6d2', x + Math.cos(ry) * (w / 2), h - 0.05, z - Math.sin(ry) * (w / 2), { r: 0, ry });
  const tex = canvasTex('mflag', 300, 190, (g) => {
    g.fillStyle = CHARTER_HEX.field; g.fillRect(0, 0, 300, 190);
    emblem(g, 150, 95, 70);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, fh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
  m.position.set(x + Math.cos(ry) * (w / 2), h - 0.08 - fh / 2, z - Math.sin(ry) * (w / 2));
  m.rotation.y = ry;
  m.castShadow = true;
  parent.add(m);
}

// ── structures ───────────────────────────────────────────────────────────────────────────────
/**
 * A dome printed out of regolith in layers (half-ellipsoid rx wide, h tall, at (x, z)): every
 * layer a stepped ring, alternate ones a shade apart. Returns the layer heights (for portholes).
 */
export function printedDome(k: Kit, x: number, z: number, rx: number, h: number, o: { layers?: number; rz?: number; paint?: Paint; upTo?: number; y?: number } = {}) {
  const n = o.layers ?? Math.max(8, Math.round(h / 0.42));
  const rz = o.rz ?? rx;
  const paint = o.paint ?? M.printed;
  const y0 = o.y ?? 0;
  const top = (o.upTo ?? 1) * h;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * h, b = ((i + 1) / n) * h;
    if (a >= top) break;
    const ra = Math.sqrt(Math.max(0, 1 - (a / h) ** 2)), rb = Math.sqrt(Math.max(0.0004, 1 - (Math.min(b, top) / h) ** 2));
    const g = new THREE.CylinderGeometry(rb, ra, Math.min(b, top) - a, 40, 1, i + 1 < n && b < top).scale(rx, 1, rz).translate(x, y0 + (a + Math.min(b, top)) / 2, z);
    k.geo(g, mixHex(paint, i % 2 ? '#7a7186' : '#ffffff', i % 2 ? 0.08 : 0.04), 0.02, 0);
  }
  return { top: y0 + top };
}
/** A regolith berm (a long mound) over something buried, along x at (x, z), len × w × h. */
export function berm(k: Kit, x: number, z: number, len: number, w: number, h: number, paint: Paint = M.berm, ry = 0) {
  const s = new THREE.Shape();
  const n = 10;
  s.moveTo(-w / 2, 0);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    s.lineTo(-w / 2 + t * w, h * Math.pow(Math.sin(t * Math.PI), 0.7));
  }
  s.lineTo(w / 2, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -len / 2).rotateY(Math.PI / 2 + ry).translate(x, 0, z);
  k.geo(g, paint, 0.04, 0.1);
}
/** A curved regolith berm round a centre: radius r0 (inner foot) to r1 (outer foot), h tall, over angles a0..a1 (from +z), closed at both ends. */
export function arcBerm(k: Kit, r0: number, r1: number, h: number, a0: number, a1: number, paint: Paint = M.berm, seg = 40) {
  const prof: THREE.Vector2[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    prof.push(new THREE.Vector2(r1 - t * (r1 - r0), 0.02 + h * Math.pow(Math.sin(t * Math.PI), 0.6)));
  }
  k.geo(new THREE.LatheGeometry(prof, seg, a0, a1 - a0), paint, 0.04, 0.12);
  // the ends: the mound's cross-section, facing out of the arc
  for (const [a, end] of [[a0, false], [a1, true]] as [number, boolean][]) {
    const sg = end ? -1 : 1;
    const sh = new THREE.Shape(prof.map((p) => new THREE.Vector2(sg * p.x, p.y)));
    const g = new THREE.ShapeGeometry(sh, 1);
    g.rotateY(end ? a + Math.PI / 2 : a - Math.PI / 2);
    k.geo(g, mixHex(paint, '#5b5562', 0.15), 0.03, 0);
  }
}
/** A horizontal habitat module (white, banded), axis x, centred at (x, y, z). */
export function habModule(k: Kit, x: number, y: number, z: number, len: number, r: number, band: Paint) {
  hcyl(k, r, len, M.white, x, y, z, 'x', 24, 0.04);
  for (const s of [-1, 1]) {
    k.geo(new THREE.SphereGeometry(r, 20, 8, 0, TAU, 0, Math.PI / 2).rotateZ((-s * Math.PI) / 2).scale(0.35, 1, 1).translate(x + (s * len) / 2, y, z), M.white2, 0.02, 0);
    k.geo(new THREE.TorusGeometry(r + 0.02, 0.09, 4, 28).rotateY(Math.PI / 2).translate(x + s * (len / 2 - 0.4), y, z), band, 0, 0);
  }
}
/** An airlock: a short cylinder with a hatch and a band in the livery, its door facing `ry`. */
export function airlock(k: Kit, x: number, z: number, ry: number, band: Paint, y = 0) {
  const d = V(Math.sin(ry), 0, Math.cos(ry));
  k.cyl(1.05, 1.1, 2.4, M.white, x, y, z, 18, { shade: 0.08 });
  k.geo(new THREE.SphereGeometry(1.05, 18, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.4, 1).translate(x, y + 2.4, z), M.white2, 0.02, 0);
  k.cyl(1.07, 1.07, 0.26, band, x, y + 1.9, z, 18, { shade: 0 });
  k.box(0.9, 1.6, 0.2, M.steelD, x + d.x * 1.0, y + 0.25, z + d.z * 1.0, { r: 0.05, ry });
  k.box(1.3, 0.12, 1.4, M.steel, x + d.x * 1.6, y, z + d.z * 1.6, { r: 0.02, ry });
}
/** A solar wing: a dark panel w × h on a frame, centre (x, y, z), turned by ry, tilted by tilt (from vertical). */
export function solarWing(k: Kit, x: number, y: number, z: number, w: number, h: number, ry: number, tilt = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ry, 0, 'YXZ'));
  const add = (g: THREE.BufferGeometry, p: Paint) => k.geo(g.applyQuaternion(q).translate(x, y, z), p, 0.03, 0);
  add(new THREE.BoxGeometry(w, h, 0.08), M.panel);
  add(new THREE.BoxGeometry(w + 0.12, 0.08, 0.1).translate(0, h / 2, 0), M.steel);
  add(new THREE.BoxGeometry(w + 0.12, 0.08, 0.1).translate(0, -h / 2, 0), M.steel);
  for (let i = 1; i < Math.round(w / 0.7); i++) add(new THREE.BoxGeometry(0.03, h, 0.1).translate(-w / 2 + (i * w) / Math.round(w / 0.7), 0, 0), M.panelL);
  add(new THREE.BoxGeometry(w, 0.03, 0.1), M.panelL);
}
/** A radiator: white fins standing edge-on (n panels w × h), at (x, z), turned by ry. */
export function radiator(k: Kit, x: number, z: number, n: number, w: number, h: number, ry = 0, y = 0) {
  const d = V(Math.cos(ry), 0, -Math.sin(ry));
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 0.55;
    k.box(0.08, h, w, M.rad, x + d.x * o, y + 0.4, z + d.z * o, { r: 0.02, ry, shade: 0.04 });
  }
  k.box(n * 0.55 + 0.2, 0.4, w + 0.2, M.steelD, x, y, z, { r: 0.04, ry });
}
/** A floodlight mast: a pole and a bank of lamps aimed by `face` (0 = towards +z), a pool where it falls. */
export function floodMast(c: Ctx, x: number, z: number, h: number, face: number, reach = 6, y = 0, poolR = 7) {
  const { k, lamps, g } = c;
  k.cyl(0.12, 0.2, h, M.steel, x, y, z, 8);
  k.box(0.3, 0.3, 0.3, M.steelD, x, y, z, { r: 0.03 });
  k.box(1.6, 0.16, 0.16, M.dark, x, y + h, z, { r: 0, ry: face + Math.PI / 2 });
  const d = V(Math.sin(face), 0, Math.cos(face));
  for (const s of [-0.5, 0.5]) lamps.box(0.55, 0.42, 0.24, '#e9e1d2', x + d.x * 0.2 + d.z * s, y + h + 0.12, z + d.z * 0.2 - d.x * s, { r: 0.04, ry: face });
  lightPool(g, x + d.x * reach, y, z + d.z * reach, poolR, coolPool, 1.2);
}
/** Survey stakes with little lights, in a grid over w × d at (x, z). */
export function stakes(c: Ctx, x: number, z: number, w: number, d: number, step = 4, seed = 1) {
  const r = rng(seed);
  const pts: THREE.Vector3[] = [];
  for (let sx = -w / 2; sx <= w / 2 + 0.01; sx += step)
    for (let sz = -d / 2; sz <= d / 2 + 0.01; sz += step) {
      if (r() < 0.25) continue;
      const px = x + sx + (r() - 0.5) * 0.4, pz = z + sz + (r() - 0.5) * 0.4;
      c.k.box(0.07, 0.9, 0.07, '#d9d6d2', px, 0, pz, { r: 0, jitter: 0 });
      c.k.box(0.12, 0.12, 0.12, r() < 0.5 ? 'org1' : 'yel0', px, 0.85, pz, { r: 0, jitter: 0 });
      pts.push(V(px, 1.02, pz));
    }
  return pts;
}

// ── vehicles ─────────────────────────────────────────────────────────────────────────────────
/** A pressurised rover (4.6 long, nose +x): three big wheels a side, a white cabin, a solar roof, a livery stripe. */
export function pressRover(k: Kit, lit: Kit, x: number, z: number, ry: number, acc: Paint) {
  const q = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const add = (g: THREE.BufferGeometry, p: Paint, kk = k) => kk.geo(g.applyMatrix4(q), p, 0.03, 0);
  for (const wx of [-1.5, 0, 1.5]) for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12).rotateX(Math.PI / 2).translate(wx, 0.55, s * 1.05), '#5b5562');
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.44, 8).rotateX(Math.PI / 2).translate(wx, 0.55, s * 1.06), M.steel);
  }
  add(new THREE.BoxGeometry(4.2, 0.4, 1.8).translate(0, 0.95, 0), M.steelD);
  add(RoundedBox(4.0, 1.7, 1.9, 0.35).translate(0.1, 2.0, 0), M.white);
  add(new THREE.BoxGeometry(4.02, 0.24, 1.92).translate(0.1, 1.45, 0), acc);
  add(new THREE.BoxGeometry(1.0, 0.8, 1.6).translate(2.0, 2.2, 0), M.glass, lit);
  add(new THREE.BoxGeometry(3.0, 0.06, 1.7).translate(-0.3, 2.9, 0), M.panel);
  add(new THREE.BoxGeometry(0.7, 1.4, 0.1).translate(-1.6, 1.8, 0.96), M.steelD);
}
/** A little survey rover with a mast camera (1.8 long, nose +x). */
export function surveyRover(k: Kit, x: number, z: number, ry: number) {
  const q = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const add = (g: THREE.BufferGeometry, p: Paint) => k.geo(g.applyMatrix4(q), p, 0.03, 0);
  for (const wx of [-0.6, 0, 0.6]) for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10).rotateX(Math.PI / 2).translate(wx, 0.22, s * 0.55), '#5b5562');
  add(new THREE.BoxGeometry(1.6, 0.4, 0.9).translate(0, 0.55, 0), M.white);
  add(new THREE.BoxGeometry(1.5, 0.05, 0.95).translate(-0.1, 0.78, 0), M.panel);
  add(new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(0.55, 1.2, 0), M.steel);
  add(new THREE.BoxGeometry(0.34, 0.2, 0.26).translate(0.6, 1.7, 0), M.dark);
  add(new THREE.BoxGeometry(1.6, 0.12, 0.92).translate(0, 0.36, 0), M.foil);
}
/** Kip's scout lander: a gold-foil descent stage on four legs, a white deck, a dish and a solar wing. */
export function scoutLander(k: Kit, x: number, z: number, ry = 0.4) {
  const q = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const add = (g: THREE.BufferGeometry, p: Paint) => k.geo(g.applyMatrix4(q), p, 0.04, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const foot = V(Math.sin(a) * 1.9, 0.08, Math.cos(a) * 1.9), hip = V(Math.sin(a) * 1.0, 1.2, Math.cos(a) * 1.0);
    const len = foot.distanceTo(hip);
    add(new THREE.CylinderGeometry(0.07, 0.07, len, 6).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), hip.clone().sub(foot).normalize())).translate(foot.x, foot.y, foot.z), M.steel);
    add(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 10).translate(foot.x, 0.05, foot.z), M.steel);
  }
  add(new THREE.CylinderGeometry(1.25, 1.25, 1.1, 8).translate(0, 1.4, 0), M.foil);
  add(new THREE.CylinderGeometry(1.27, 1.27, 0.12, 8).translate(0, 1.35, 0), M.foil2);
  add(new THREE.CylinderGeometry(0.45, 0.6, 0.6, 12).translate(0, 0.75, 0), M.dark);
  add(new THREE.BoxGeometry(1.7, 0.8, 1.4).translate(0, 2.35, 0), M.white);
  add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6).translate(0.5, 3.2, 0.3), M.steel);
  add(new THREE.CylinderGeometry(0.55, 0.12, 0.25, 12).rotateX(-0.9).translate(0.5, 3.8, 0.3), '#f1eee8');
  add(new THREE.BoxGeometry(2.4, 0.05, 1.0).rotateZ(-0.2).translate(-2.0, 2.6, 0), M.panel);
  add(new THREE.BoxGeometry(0.6, 0.08, 0.1).translate(-0.9, 2.5, 0), M.steel);
}

/**
 * The crew lander: a tall stainless body with a nose, the livery band, lit windows, splayed legs,
 * engine bells. Origin at the feet; it's about 13 tall. Returns the group, its flame and the
 * height.
 */
export function crewLander(acc: Paint, hi: Paint, seed: number) {
  const grp = new THREE.Group();
  const k = new LiteKit(rng(seed)), lit = new LiteKit(rng(seed + 1));
  const R = 1.4, y0 = 1.6, H = 8.4;
  k.cyl(R, R, H, '#cfd2d5', 0, y0, 0, 24, { shade: 0.06 });
  k.geo(new THREE.CylinderGeometry(0.35, R, 2.6, 24, 1).translate(0, y0 + H + 1.3, 0), '#d9dcdf', 0.02, 0);
  k.geo(new THREE.SphereGeometry(0.35, 12, 6, 0, TAU, 0, Math.PI / 2).translate(0, y0 + H + 2.6, 0), '#d9dcdf', 0.02, 0);
  k.cyl(R + 0.02, R + 0.02, 0.6, acc, 0, y0 + H * 0.62, 0, 24, { shade: 0 });
  k.cyl(R + 0.02, R + 0.02, 0.16, hi, 0, y0 + H * 0.62 + 0.62, 0, 24, { shade: 0 });
  k.cyl(R + 0.015, R + 0.015, 1.6, '#8f9296', 0, y0, 0, 24, { shade: 0 });
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    lit.box(0.42, 0.42, 0.1, M.glass, Math.sin(a) * (R + 0.01), y0 + H * 0.82, Math.cos(a) * (R + 0.01), { r: 0.04, ry: a, jitter: 0 });
  }
  // the crew hatch and a fold-down lift
  k.box(0.8, 1.2, 0.1, '#9aa0a6', Math.sin(0.9) * (R + 0.02), y0 + H * 0.72, Math.cos(0.9) * (R + 0.02), { r: 0.04, ry: 0.9 });
  // RCS pods
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3;
    k.box(0.36, 0.5, 0.3, '#8f9296', Math.sin(a) * (R + 0.15), y0 + H - 0.9, Math.cos(a) * (R + 0.15), { r: 0.05, ry: a });
  }
  // legs and pads
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const foot = V(Math.sin(a) * 3.4, 0.1, Math.cos(a) * 3.4), hip = V(Math.sin(a) * (R - 0.1), y0 + 2.6, Math.cos(a) * (R - 0.1));
    k.beam(foot, hip, 0.24, '#9aa0a6');
    k.beam(foot.clone().setY(0.3), V(Math.sin(a) * (R - 0.1), y0 + 0.4, Math.cos(a) * (R - 0.1)), 0.14, M.steelD);
    k.cyl(0.5, 0.55, 0.16, M.steelD, foot.x, 0, foot.z, 10, { shade: 0 });
  }
  // engine bells
  for (const [bx, bz] of [[0.6, 0], [-0.3, 0.52], [-0.3, -0.52]]) k.geo(new THREE.CylinderGeometry(0.22, 0.5, 0.9, 12, 1, true).translate(bx, y0 - 0.45, bz), '#5b5562', 0.02, 0);
  grp.add(k.build(), lit.build(windowGlow));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.2, 14, 1, true).rotateX(Math.PI).translate(0, y0 - 0.9 - 2.1, 0), flameMat);
  flame.visible = false;
  grp.add(flame);
  return { obj: grp, flame, h: y0 + H + 2.95 };
}
/** A pale, nearly clear flame in vacuum. */
export const flameMat = new THREE.MeshBasicMaterial({ color: col('#dfeaff').clone().multiplyScalar(1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

const RoundedBox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);

// ── dust ─────────────────────────────────────────────────────────────────────────────────────
let dustTex: THREE.Texture | null = null;
function dustTexture() {
  if (dustTex) return dustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  dustTex = new THREE.CanvasTexture(c);
  return dustTex;
}
/**
 * Regolith dust in vacuum: grains thrown out in clean ballistic arcs that fall straight back
 * under the Moon's gravity (no billowing). `burst` throws a ring of it (a landing, a dig).
 */
export class Dust {
  readonly obj: THREE.Points;
  private p: Float32Array;
  private v: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private extra: Float32Array;
  private next = 0;
  constructor(readonly n = 160, color: Paint = '#c3bcc7', private size = 0.55, private g = 1.62) {
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(99);
    this.life = new Float32Array(n).fill(1);
    this.extra = new Float32Array(n * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    geo.setAttribute('extra', new THREE.BufferAttribute(this.extra, 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: dustTexture() }, color: { value: col(color).clone() }, scale: plumeUniforms.scale },
      vertexShader: `attribute vec2 extra; varying float vA; uniform float scale;
        void main(){ vA = extra.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = extra.x * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.obj = new THREE.Points(geo, mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 5;
  }
  /** Throw `n` grains from (x, y, z): out at `speed` (spread over `arc` round direction `dir`), up at `up`. */
  emit(x: number, y: number, z: number, n: number, speed: number, up: number, rand: () => number, dir = 0, arc = TAU, life = 2.6) {
    for (let i = 0; i < n; i++) {
      const j = this.next;
      this.next = (this.next + 1) % this.n;
      const a = dir + (rand() - 0.5) * arc, s = speed * (0.4 + rand() * 0.8);
      this.p.set([x + (rand() - 0.5) * 0.6, y, z + (rand() - 0.5) * 0.6], j * 3);
      this.v.set([Math.sin(a) * s, up * (0.5 + rand() * 0.8), Math.cos(a) * s], j * 3);
      this.age[j] = 0;
      this.life[j] = life * (0.7 + rand() * 0.6);
    }
  }
  update(e: Env) {
    const dt = Math.min(0.05, e.dt);
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] > this.life[i]) { this.extra[i * 2 + 1] = 0; continue; }
      this.age[i] += dt;
      const k = i * 3;
      this.v[k + 1] -= this.g * dt;
      this.p[k] += this.v[k] * dt;
      this.p[k + 1] += this.v[k + 1] * dt;
      this.p[k + 2] += this.v[k + 2] * dt;
      if (this.p[k + 1] < 0.05) { this.p[k + 1] = 0.05; this.v[k] *= 0.3; this.v[k + 1] = 0; this.v[k + 2] *= 0.3; }
      const t = this.age[i] / this.life[i];
      this.extra[i * 2] = this.size * (1 + t * 0.6);
      this.extra[i * 2 + 1] = Math.min(1, t * 8) * (1 - t) * 0.8;
    }
    (this.obj.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.obj.geometry.attributes.extra as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** A ground decal strip (rover tracks, a trodden path) from (x0, z0) to (x1, z1). */
export function track(k: Kit, x0: number, z0: number, x1: number, z1: number, w: number, paint: Paint = '#7f7889', y = 0.02) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.BoxGeometry(len, 0.04, w);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  k.geo(g, paint, 0.02, 0);
}
/** Rover tracks along a polyline: two thin dark ribbons. */
export function roverTracks(k: Kit, pts: [number, number][], gauge = 1.0) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    for (const s of [-1, 1]) track(k, ax + nx * s * gauge / 2, az + nz * s * gauge / 2, bx + nx * s * gauge / 2, bz + nz * s * gauge / 2, 0.22);
  }
}
/** A boulder or two (dark, lit on their sunward shoulders by the scene's own light). */
export function boulder(k: Kit, x: number, z: number, s: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(s, 0);
  const r = rng(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.55 + r() * 0.3), p.getZ(i) * (0.8 + r() * 0.4));
  g.computeVertexNormals();
  k.geo(g.translate(x, s * 0.3, z), mixHex(M.reg2, '#5b5562', r() * 0.4), 0.05, 0);
}
export { lightPool };
