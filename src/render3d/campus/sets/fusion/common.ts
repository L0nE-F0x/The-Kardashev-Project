/**
 * Shared bits for Act IV's fusion plants and air-capture farms: the builder's livery (from the
 * partner's brand colour, as the pixel game's builderRamp), plasma materials that glow day and
 * night, see-through hall glass, curved walls and arc rings, soft halos, and the balance of plant
 * every D-T design shares (turbine hall, cooling cells, switchyard, control block, car park,
 * fence and lamps). Everything static goes through a Kit (bevelled, hand-painted, matte).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { col, glowMat, Kit, lightPool, poolMat, rng, type BoxOpts, type Paint } from '../../../kit';
import { plumeUniforms, sign } from '../../../fx';
import type { Env } from '../../../pieces';
import { person } from '../../../models';
import type { Act3SetOpts } from '../../act3sets';
import { parkedCars } from '../../life';
import { builderRamp, builderSign } from '../../planKit';
import { PALETTE } from '../../../../render/palette';
import {
  Anim, At, bayLines, beacon, lampHeadMat, mechTower, mixHex, P, paving, pipeRun, pipeStands, poleLamp, rollDoor, sagWires, shed,
  switchyard, transformer, V, wallLamp, windowRow, winMat,
} from '../../plants2/parts';

export { V, P, mixHex };
export const TAU = Math.PI * 2;

// ── the builder's colours ────────────────────────────────────────────────────────────────────
const PAL = PALETTE as Record<string, string>;
const KEYS = Object.keys(PALETTE);
const hexOf = (idx: number, fb: string) => PAL[KEYS[idx - 1]] ?? fb;

export interface Livery {
  /** Main colour (bands, signs), lighter trim, darker shade. */
  acc: string; hi: string; dark: string;
  /** Text that reads on `acc`. */
  ink: string;
  /** The builder's sign name. */
  name: string;
}
/** Luminance of a colour (0..1, sRGB-ish). */
export function lum(c: Paint) {
  const k = col(c);
  return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;
}
/**
 * The builder's livery: a known partner's brand ramp when the planner names one (the planner's own
 * accent is the Charter's blue for fusion fleets), else the accent/hi it passed.
 */
export function livery(o: Act3SetOpts, fallbackName = o.label): Livery {
  let acc = o.accent || '#345c96', hi = o.hi || '#6c9fd2', dark = mixHex(acc, '#2f2a3d', 0.3), name = fallbackName || 'CHARTER';
  if (o.builder && o.builder !== 'charter') {
    const r = builderRamp(o.builder);
    acc = hexOf(r.base, acc);
    hi = hexOf(r.lit, hi);
    dark = hexOf(r.mid, dark);
    name = builderSign(o.builder);
  }
  return { acc, hi, dark, ink: lum(acc) > 0.42 ? '#2f2a3d' : '#fbf7f0', name };
}

// ── materials ────────────────────────────────────────────────────────────────────────────────
/** A glowing material this piece drives itself (`userData.manual`: the sky leaves it alone). */
export function plasmaMat(c: Paint, base = 1.6) {
  const m = glowMat(c, base);
  m.userData.manual = true;
  m.roughness = 0.5;
  return m;
}
/**
 * Glowing gas (plasma): additive, brightest where you look along its surface (an optically thin
 * glow, like the pixel game's "brightest where we look along its rim"). `set(i)` drives it.
 */
export interface Gas { mat: THREE.ShaderMaterial; set(i: number): void }
export function plasmaGas(c: Paint, rim = 1.6, floor = 0.22): Gas {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: col(c).clone() }, uI: { value: 1 }, uRim: { value: rim }, uFloor: { value: floor } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uRim; uniform float uFloor; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(max(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0), uRim); float a = uFloor + (1.0 - uFloor) * f;
        gl_FragColor = vec4(uColor * a * uI, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { mat, set(i: number) { mat.uniforms.uI.value = i; } };
}
/** A plain glowing line/core (unlit, can go over 1 so it blooms). */
export function coreMat(c: Paint, k = 2) {
  const m = new THREE.MeshBasicMaterial({ color: col(c).clone().multiplyScalar(k), toneMapped: false });
  m.userData.base = col(c).clone();
  return m;
}
/** Hall glazing you can see through (a little sheen, no shadow). */
export const seeGlass = new THREE.MeshStandardMaterial({
  color: col('#a9d2dc'), transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.35, depthWrite: false, side: THREE.DoubleSide,
});
/** A pool of coloured light on the ground (plasma halls at night). Made per scene: pool materials belong to the scene that opened them. */
export function tintPool(c: string, k = 0.45) {
  return poolMat(c, k);
}
export { winMat, lampHeadMat };
/** Cyan beamline / LED glow, night only. */
export const cyanNight = glowMat('cyn5', 0);
cyanNight.color.copy(col('#2f4d63'));
cyanNight.userData.nightOnly = 1.4;

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────
/**
 * A thick curved wall: the annular sector rIn..rOut over angles a0..a1 (a measured from +z
 * towards +x, like CylinderGeometry's theta), from y0 up h. A full ring when a1 − a0 ≥ 2π.
 */
export function ringWall(rOut: number, rIn: number, y0: number, h: number, a0 = 0, a1 = TAU, seg = 48) {
  const P2 = (r: number, a: number) => new THREE.Vector2(r * Math.sin(a), -r * Math.cos(a));
  const s = new THREE.Shape();
  if (a1 - a0 >= TAU - 1e-4) {
    s.absarc(0, 0, rOut, 0, TAU, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, rIn, 0, TAU, true);
    s.holes.push(hole);
  } else {
    const n = Math.max(2, Math.ceil((seg * (a1 - a0)) / TAU));
    for (let i = 0; i <= n; i++) {
      const p = P2(rOut, a0 + ((a1 - a0) * i) / n);
      if (i === 0) s.moveTo(p.x, p.y);
      else s.lineTo(p.x, p.y);
    }
    for (let i = n; i >= 0; i--) {
      const p = P2(rIn, a0 + ((a1 - a0) * i) / n);
      s.lineTo(p.x, p.y);
    }
    s.closePath();
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: seg });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}
/** A torus lying flat (axis y) over angles a0..a1 (a from +z towards +x), centred at the origin. */
export function arcTorus(R: number, r: number, a0 = 0, a1 = TAU, radial = 6, tubular = 48) {
  const L = a1 - a0;
  const g = new THREE.TorusGeometry(R, r, radial, Math.max(3, Math.round((tubular * L) / TAU)), L);
  g.rotateX(Math.PI / 2);
  // after the tilt the arc runs from a = π/2 down to π/2 − L
  g.rotateY(a1 - Math.PI / 2);
  return g;
}
/** An open cylinder band over angles a0..a1 (a from +z towards +x), base at y0. */
export function arcBand(r: number, y0: number, h: number, a0 = 0, a1 = TAU, seg = 48) {
  return new THREE.CylinderGeometry(r, r, h, Math.max(3, Math.round((seg * (a1 - a0)) / TAU)), 1, true, a0, a1 - a0).translate(0, y0 + h / 2, 0);
}
/** Flip a geometry's faces (for surfaces seen from inside). */
export function inward(g: THREE.BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.attributes.position, n = ng.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    for (const a of [p, n]) {
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return ng;
}
/** A horizontal cylinder (axis x or z) centred at (x, y, z). */
export function hcyl(k: Kit, r: number, len: number, paint: Paint, x: number, y: number, z: number, axis: 'x' | 'z' = 'x', seg = 12, shade = 0.08) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  k.geo(g.translate(x, y, z), paint, 0.03, shade);
}

/** Soft additive glows as points (halos round hot things; they never darken what's behind). */
let softTex: THREE.Texture | null = null;
function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}
export interface Halo { obj: THREE.Points; set(opacity: number): void }
export function halo(pts: THREE.Vector3[], sizes: number[], color: Paint, opacity = 1): Halo {
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
  return { obj: p, set(v: number) { mat.uniforms.opacity.value = v; } };
}

/** A sign (fx) placed at (x, y, z), turned by ry. */
export function placard(parent: THREE.Object3D, text: string, w: number, x: number, y: number, z: number, fg: Paint, bg: Paint | null, ry = 0, glow = false) {
  const s = sign(text, w, fg, bg, { glow });
  s.position.set(x, y, z);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

/** A person standing about (a rigged figure paused mid-step; nothing if the figures haven't loaded). */
export function figure(parent: THREE.Object3D, kind: 'worker' | 'engineer' | 'scientist' | 'office', x: number, z: number, ry: number, seed: number, y = 0) {
  const p = person(kind, 1.75 * (0.96 + (seed % 7) * 0.012));
  if (!p) return;
  p.walk.time = (seed % 13) * 0.07;
  p.mixer.update(0);
  p.walk.paused = true;
  p.obj.position.set(x, y, z);
  p.obj.rotation.y = ry;
  parent.add(p.obj);
}

// ── a lighter kit ────────────────────────────────────────────────────────────────────────────
/**
 * The Kit with a one-segment bevel (a crisp chamfer, a third of the triangles) and sharp boxes
 * for slivers no one sees rounded (thinner than 0.2): these plants repeat many small parts.
 */
export class LiteKit extends Kit {
  override box(w: number, h: number, d: number, paint: Paint, x = 0, y = 0, z = 0, o: BoxOpts = {}) {
    const small = Math.min(w, h, d);
    const r = o.r ?? Math.min(0.12, small * 0.06);
    const g = r > 0.001 && small > 0.2 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, small * 0.45)) : new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    return this.geo(g, paint, o.jitter ?? 0.05, o.shade ?? 0.25);
  }
}

// ── a piece under assembly ───────────────────────────────────────────────────────────────────
/** The parts a plant is built from: one mesh each for paint, windows, lamp heads. */
export class Ctx {
  readonly g = new THREE.Group();
  readonly anim = new Anim();
  readonly k: Kit;
  readonly lit: Kit;
  readonly lamps: Kit;
  /** Lit by night in cyan (beam galleries, status strips). */
  readonly cyan: Kit;
  readonly r: () => number;
  readonly W: number;
  readonly D: number;
  readonly L: Livery;
  constructor(readonly o: Act3SetOpts, name?: string) {
    this.r = rng(o.seed);
    this.k = new LiteKit(rng(o.seed + 1));
    this.lit = new LiteKit(rng(o.seed + 2));
    this.lamps = new LiteKit(rng(o.seed + 3));
    this.cyan = new LiteKit(rng(o.seed + 4));
    this.W = o.w;
    this.D = o.d;
    this.L = livery(o, name);
  }
  /** Merge the kits into the group. */
  finish() {
    const g = this.g;
    g.add(this.k.build());
    if (!this.lit.empty) g.add(this.lit.build(winMat));
    if (!this.lamps.empty) g.add(this.lamps.build(lampHeadMat));
    if (!this.cyan.empty) {
      const m = this.cyan.build(cyanNight);
      m.castShadow = false;
      g.add(m);
    }
    return g;
  }
  update = (e: Env) => this.anim.update(e);
}

// ── site furniture ───────────────────────────────────────────────────────────────────────────
/** The plant's yard: a concrete pad on the land, the fence with a gate at gateX, corner lamps. */
export function siteBase(c: Ctx, gateX = 0, gateW = 8, pave: Paint = '#cbc3b7') {
  const { k, W, D } = c;
  k.box(W - 0.8, 0.12, D - 0.8, pave, 0, -0.06, 0, { r: 0.08, jitter: 0.015, shade: 0 });
  // joints in the slab
  for (let x = -W / 2 + 4; x < W / 2 - 2; x += 4) k.box(0.05, 0.02, D - 1.4, mixHex(pave, '#7a7186', 0.18), x, 0.06, 0, { r: 0, jitter: 0, shade: 0 });
  fenceRect(c, W - 1.6, D - 1.6, gateX, gateW);
  // the gate: two posts with lamps and a road stub out to the edge
  for (const sx of [-1, 1]) {
    k.box(0.34, 2.0, 0.34, P.steelDark, gateX + (sx * gateW) / 2, 0, D / 2 - 0.8, { r: 0.04 });
  }
  paving(k, gateX, D / 2 - 1.6, gateW - 0.6, 2.2, P.asphalt, 0.06);
  for (const [x, z, dir] of [[-W / 2 + 1.6, -D / 2 + 1.6, 1], [W / 2 - 1.6, -D / 2 + 1.6, -1]] as [number, number, number][]) poleLamp(k, c.lamps, c.g, x, z, 5.6, dir);
}
/** Fence posts, rails and see-through panels round a w × d rectangle, a gate gap at gateX in the front. */
export function fenceRect(c: Ctx, w: number, d: number, gateX = 0, gate = 8, h = 1.6) {
  const { k } = c;
  const g0 = gateX - gate / 2, g1 = gateX + gate / 2;
  const runs: [number, number, number, number][] = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2], [-w / 2, d / 2, g0, d / 2], [g1, d / 2, w / 2, d / 2]];
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.2) continue;
    const n = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i <= n; i++) k.box(0.12, h, 0.12, P.steel, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, { r: 0, jitter: 0 });
    for (const y of [0.35, h - 0.05]) k.beam(V(x0, y, z0), V(x1, y, z1), 0.06, P.steel);
  }
  const hh = h - 0.05;
  const add = (len: number, x: number, z: number, ry: number) => {
    if (len < 0.1) return;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, hh), fenceMat);
    p.position.set(x, hh / 2, z);
    p.rotation.y = ry;
    c.g.add(p);
  };
  add(w, 0, -d / 2, 0);
  add(d, w / 2, 0, Math.PI / 2);
  add(d, -w / 2, 0, Math.PI / 2);
  add(g0 + w / 2, (-w / 2 + g0) / 2, d / 2, 0);
  add(w / 2 - g1, (g1 + w / 2) / 2, d / 2, 0);
}
const fenceMat = new THREE.MeshStandardMaterial({ color: col('#9a94a0'), transparent: true, opacity: 0.26, roughness: 1, side: THREE.DoubleSide, depthWrite: false });

/**
 * A turbine hall (clad shed, the builder's band, clerestory windows, a roller door, roof vents),
 * its front on +z at z + d/2. Returns the roof height.
 */
export function turbineHall(c: Ctx, x: number, z: number, w: number, d: number, h: number) {
  const { k, lit, lamps, g, r, L } = c;
  const top = shed(k, x, z, w, d, h, { wall: '#ddd7ce', band: L.acc, ribs: 1.25 });
  windowRow(k, lit, 'z+', z + d / 2 + 0.03, x - w / 2 + 0.6, x + w / 2 - 0.6, h - 1.5, 0.9, 0.85, 0.35, r, 0.75);
  windowRow(k, lit, 'x-', x - w / 2 - 0.03, z - d / 2 + 0.6, z + d / 2 - 0.6, h - 1.5, 0.9, 0.85, 0.35, r, 0.7);
  rollDoor(k, x + w / 2 - 2.4, 0.3, z + d / 2 + 0.06, 3.0, 4.0);
  wallLamp(lamps, g, x + w / 2 - 2.4, 4.6, z + d / 2 + 0.2);
  wallLamp(lamps, g, x - w / 2 + 1.6, 4.0, z + d / 2 + 0.2);
  for (let bx = x - w / 2 + 1.6; bx < x + w / 2 - 1.0; bx += 2.6) k.box(1.2, 0.7, 1.1, P.hvac, bx, top, z - d * 0.18, { r: 0.08 });
  // a crane-bay monitor along the ridge
  k.box(w - 1.4, 1.1, 2.0, '#cfc9c0', x, top - 0.1, z + d * 0.12, { r: 0.08 });
  k.box(w - 1.2, 0.22, 2.3, P.roof, x, top + 1.0, z + d * 0.12, { r: 0.05, shade: 0 });
  windowRow(k, lit, 'z+', z + d * 0.12 + 1.02, x - w / 2 + 1.0, x + w / 2 - 1.0, top + 0.15, 0.8, 0.55, 0.3, r, 0.8);
  return top + 1.2;
}
/** The unit plate: UNIT n in the builder's colours, on a +z face. */
export function unitPlate(c: Ctx, x: number, y: number, z: number, w = 3.4, ry = 0) {
  const n = c.o.n ?? 1;
  return placard(c.g, `UNIT ${n}`, w, x, y, z, c.L.ink, c.L.acc, ry);
}
/** Generator step-up transformers in a row along x at z, wires up to `to` (gantry points). */
export function stepUp(c: Ctx, xs: number[], z: number, to: THREE.Vector3[][], s = 0.95) {
  const a = new At(c.k, 0, 0, 0);
  const wires: THREE.Vector3[][] = [];
  xs.forEach((bx, i) => {
    transformer(a, bx, z, s);
    const bush = [-0.65, 0, 0.65].map((b) => V(bx + b * s, 3.2 * s + 0.32, z + 0.2 * s));
    const line = to[i % Math.max(1, to.length)];
    bush.forEach((p, j) => wires.push([p, line?.[j] ?? p]));
  });
  sagWires(c.k, wires, 0.5, '#4a4452', 0.03);
}
/** An office/control block with windows, a door canopy and the builder's name on the roof. Returns the roof. */
export function controlBlock(c: Ctx, x: number, z: number, w: number, d: number, h: number, name = c.L.name) {
  const { k, lit, lamps, g, r, L } = c;
  const top = shed(k, x, z, w, d, h, { wall: P.cream, band: L.acc, ribs: 0 });
  const f = z + d / 2;
  for (let y = 1.1; y < h - 1.0; y += 1.8) windowRow(k, lit, 'z+', f + 0.02, x - w / 2 + 0.5, x + w / 2 - 0.5, y, 1.0, 1.0, 0.32, r, 0.75);
  windowRow(k, lit, 'x-', x - w / 2 - 0.02, z - d / 2 + 0.5, z + d / 2 - 0.5, 1.1, 0.9, 1.0, 0.4, r, 0.6);
  k.box(1.4, 2.1, 0.1, '#4a5a66', x + w / 2 - 1.4, 0.35, f + 0.04, { r: 0, jitter: 0 });
  k.box(2.4, 0.18, 1.5, L.acc, x + w / 2 - 1.4, 2.55, f + 0.7, { r: 0.04 });
  wallLamp(lamps, g, x + w / 2 - 1.4, 2.35, f + 0.2);
  // the name on a frame on the roof
  const sw = Math.min(w - 0.6, 0.62 * name.length + 1.4);
  k.box(sw + 0.3, 1.2, 0.2, P.roof, x - 0.3, top - 0.05, f - 0.5, { r: 0.02 });
  for (const sx of [-1, 1]) k.box(0.14, 0.8, 0.8, P.steelDark, x - 0.3 + (sx * sw) / 2.4, top - 0.05, f - 0.8, { r: 0 });
  const s = placard(g, name, sw, x - 0.3, top + 0.62, f - 0.38, L.ink, L.acc);
  return { top, signTop: top + 0.62 + (s.userData.signHeight as number) / 2 };
}
/** A car park: asphalt, bay lines and cars facing the building behind (−z). */
export function carPark(c: Ctx, x: number, z: number, n: number) {
  const gap = 2.3;
  paving(c.k, x, z, n * gap + 1.0, 4.2, P.asphalt, 0.06);
  bayLines(c.k, x - (n * gap) / 2, z, n, gap, 3.0, 0.14);
  parkedCars(c.g, x - (n * gap) / 2 + gap / 2, z, n, gap, c.o.seed + 9, Math.PI / 2);
}
/** A vent stack with platforms and a red light on top. */
export function ventStack(c: Ctx, x: number, z: number, h: number, paint: Paint = '#d3cdc4') {
  const { k, g } = c;
  k.cyl(0.9, 1.0, 0.6, P.concrete2, x, 0, z, 12);
  k.cyl(0.42, 0.55, h, paint, x, 0.5, z, 12, { shade: 0.1 });
  k.cyl(0.8, 0.8, 0.12, P.steel, x, h * 0.7, z, 12, { shade: 0 });
  k.cyl(0.5, 0.5, 0.35, c.L.acc, x, h - 0.6, z, 12, { shade: 0 });
  beacon(g, x, h + 0.75, z, x * 0.3);
}
/** Frosted cryogenic tanks (the magnets' helium) with a cold box. */
export function cryoplant(c: Ctx, x: number, z: number) {
  const { k } = c;
  for (const [dx, dz, rr, hh] of [[0, 0, 1.3, 6.4], [2.9, 0.4, 1.0, 4.8]] as [number, number, number, number][]) {
    k.cyl(rr + 0.25, rr + 0.3, 0.3, P.concrete2, x + dx, 0, z + dz, 16, { shade: 0.1 });
    k.cyl(rr, rr, hh, '#e6e9ea', x + dx, 0.25, z + dz, 18, { shade: 0.12, jitter: 0.02 });
    k.geo(new THREE.SphereGeometry(rr, 18, 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.4, 1).translate(x + dx, 0.25 + hh, z + dz), '#eef0f0', 0.02);
    // frost round the foot
    k.cyl(rr * 1.04, rr * 1.06, 0.9, '#f1f6fb', x + dx, 0.25, z + dz, 18, { shade: 0, jitter: 0.01 });
    k.cyl(rr * 1.02, rr * 1.02, 0.28, c.L.acc, x + dx, 0.25 + hh * 0.78, z + dz, 18, { shade: 0 });
  }
  shed(k, x + 1.2, z + 3.2, 4.6, 2.2, 2.8, { wall: '#e3dfd8', band: null, ribs: 0.9 });
  pipeRun(k, [V(x + 0.9, 1.8, z + 0.9), V(x + 0.9, 1.8, z + 2.1)], 0.16, P.silver, { seg: 8 });
  k.cyl(0.18, 0.18, 1.4, '#e6e9ea', x + 3.0, 3.0, z + 3.2, 8);
}

/** Cooling cells with steam (a mechanical-draft tower from Act II's kit). Returns its top. */
export function coolingCells(c: Ctx, x: number, z: number, cells: number, cell = 3.6, ry = 0) {
  return mechTower(c.k, c.g, c.anim, x, z, { cells, cell, h: 5.6, ry, plume: { count: 12, life: 6, rise: 2.1, opacity: 0.55 } }, c.o.seed + 20);
}

/**
 * The balance of plant every D-T design shares, down the right side (x ≥ 9): the turbine hall at
 * the back, cooling cells along the right edge, the switchyard by the front, step-up transformers
 * and the line out. Returns the tallest point.
 */
export function balanceOfPlant(c: Ctx) {
  const { W, D, k } = c;
  const hx = W / 2 - 7.0, hz = -D / 2 + 6.9, hw = 12.4, hd = 9.6;
  const hallTop = turbineHall(c, hx, hz, hw, hd, 8.6);
  unitPlate(c, hx + 1.6, 5.4, hz + hd / 2 + 0.36, 3.6);
  // cooling cells along the right edge (their stair at the back), circulating water from the hall
  const cx = W / 2 - 3.5, cz = 1.4;
  const towerTop = coolingCells(c, cx, cz, 2, 3.8, Math.PI / 2);
  for (const dz of [-0.9, 0.9]) {
    const pts = [V(cx - 2.6, 0.9, cz + dz), V(hx + 3.6 + dz, 0.9, cz + dz), V(hx + 3.6 + dz, 0.9, hz + hd / 2 + 0.2)];
    pipeRun(k, pts, 0.3, '#6f7f88', { seg: 10 });
  }
  const sx = W / 2 - 7.8, sz = D / 2 - 5.9;
  const lines = switchyard(k, c.g, sx, sz, 11.0, 7.0, { bays: 2, gantryH: 5.2 });
  stepUp(c, [hx - 4.2, hx - 0.6], hz + hd / 2 + 1.9, [lines[0], lines[2]], 0.85);
  // the line out to a terminal tower at the right edge
  const tx = W / 2 - 1.5, tz = sz + 2.2;
  k.box(0.42, 8.6, 0.42, P.galv, tx, 0, tz, { r: 0.03 });
  k.box(0.36, 0.36, 3.4, P.galv, tx, 7.6, tz, { r: 0.03 });
  k.box(0.9, 0.3, 0.9, P.concrete2, tx, 0, tz, { r: 0.03 });
  const front = lines[3] ?? [];
  sagWires(k, front.map((p, i) => [p, V(tx, 7.5, tz - 1.2 + i * 1.2)]), 0.5, '#4a4452', 0.035);
  return Math.max(hallTop, towerTop, 8.8);
}

/** Lamp posts at points (pole into k, head into lamps, a warm pool). */
export function lampsAt(c: Ctx, pts: [number, number, number][], h = 5.2) {
  for (const [x, z, dir] of pts) poleLamp(c.k, c.lamps, c.g, x, z, h, dir);
}
/** A glow on the ground in a colour (night), e.g. the plasma hall's light through its glass. */
export function glowPool(c: Ctx, x: number, z: number, r: number, colour: string, k = 0.45, sx = 1) {
  lightPool(c.g, x, 0, z, r, tintPool(colour, k), sx);
}
export { pipeRun, pipeStands, shed, beacon, At };
