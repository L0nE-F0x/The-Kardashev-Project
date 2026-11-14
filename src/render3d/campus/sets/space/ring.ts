/**
 * Ring One in 3D: compute in sunlight that never sets. One straight stretch of the ring per piece,
 * all on the same deck (a box girder whose light strip carries a slow wave down the ring, unbroken
 * from section to section). Rack sections: dark compute towers alive with status LEDs on the deck's
 * front, and behind them a comb of vast pale radiator fins standing up off the deck and hanging
 * below it, glowing dull red at the roots (density 0..2: more towers, more LEDs, bigger fins). The
 * hub: the minds' chamber on struts, a calm core glowing through its window band, the sigil of what
 * became of Bit on its face, radiator wings, docking ports, the Council's banners. The head: the
 * ring's growing end, the next rack printed out of its blueprint by a walking builder while drones
 * fly panels in. Mood 0..2 sets the light: restless violet → busy teal and gold → calm teal.
 */
import * as THREE from 'three';
import { col, Kit, rng, type Paint } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { pipe } from '../mega/common';
import {
  Anim, blueprint, drone, flicker, glassMat, halo, lit, LocalPlane, paint, plate, radiatorMat, RobotArm, S, Sparks, span, spaceTime,
  spacewalker, stripMat, timed, TAU, tug, V, warnLamp, type BlueShape,
} from './common';

/** The deck's section: top and bottom, depth either side of its line. */
export const DECK = { y0: 4.6, y1: 9.4, hd: 6.5 };
/** Ring One's deck runs 15 units behind each piece's front edge. */
export const ringZ = (d: number) => d / 2 - 15;

interface Mood { on: string[]; seam: string; core: string; dim: string }
const MOODS: Mood[] = [
  { on: ['#a862c4', '#e86aa0', '#d08fdc', '#7e43a8'], seam: '#a862c4', core: '#d08fdc', dim: '#3b1d5e' },
  { on: ['#5fd3b5', '#2fae9b', '#fbd46e', '#5fd3b5', '#f7b258'], seam: '#5fd3b5', core: '#a3f0d6', dim: '#11474d' },
  { on: ['#5fd3b5', '#2fae9b', '#a3f0d6', '#5fd3b5'], seam: '#5fd3b5', core: '#a3f0d6', dim: '#11474d' },
];
const moodOf = (m: number) => MOODS[Math.max(0, Math.min(2, Math.round(m)))];

/** The ring's deck from x0 to x1: a pale box girder, a walkway with a rail, ribs underneath, seams. */
function deck(k: Kit, x0: number, x1: number, z: number, collars: [boolean, boolean] = [true, true]) {
  const L = x1 - x0, cx = (x0 + x1) / 2, { y0, y1, hd } = DECK;
  k.box(L, y1 - y0, hd * 2, S.pale, cx, y0, z, { r: 0.28, shade: 0.25, jitter: 0.02 });
  // the front face: a recessed dark band for the light strip, a white lip, panel seams
  k.box(L, 1.3, 0.2, S.dark, cx, y0 + 1.0, z + hd + 0.02, { r: 0.04, shade: 0 });
  k.box(L, 0.22, 0.3, S.white, cx, y1 - 0.55, z + hd + 0.04, { r: 0.04, shade: 0 });
  const n = Math.max(1, Math.round(L / 2.6));
  for (let i = 1; i < n; i++) {
    const x = x0 + (i * L) / n;
    k.box(0.07, y1 - y0 - 0.5, 0.05, S.light, x, y0 + 0.25, z + hd + 0.03, { r: 0, jitter: 0, shade: 0 });
    // ribs under the deck
    k.box(0.4, 0.5, hd * 2 - 0.6, S.light, x, y0 - 0.45, z, { r: 0.06, shade: 0 });
  }
  // the walkway along the front edge of the top, and its rail
  k.box(L, 0.12, 1.6, S.light, cx, y1, z + hd - 0.9, { r: 0, jitter: 0.02, shade: 0 });
  for (let i = 0; i <= n; i++) k.box(0.1, 1.0, 0.1, S.mid, x0 + 0.2 + (i * (L - 0.4)) / n, y1, z + hd - 0.15, { r: 0, jitter: 0 });
  k.beam(V(x0, y1 + 1.0, z + hd - 0.15), V(x1, y1 + 1.0, z + hd - 0.15), 0.08, S.mid);
  // the seam collars where the sections bolt together
  const collar = (x: number) => {
    k.box(0.36, y1 - y0 + 0.36, 0.36, S.light, x, y0 - 0.18, z + hd + 0.1, { r: 0.06, shade: 0 });
    k.box(0.36, 0.36, hd * 2 + 0.36, S.light, x, y1 - 0.1, z, { r: 0.06, shade: 0 });
    k.box(0.36, 0.36, hd * 2 + 0.36, S.light, x, y0 - 0.26, z, { r: 0.06, shade: 0 });
  };
  if (collars[0]) collar(x0 + 0.18);
  if (collars[1]) collar(x1 - 0.18);
}

/** The light strip in the deck's front band (its wave runs along world x). */
function strip(g: THREE.Object3D, x0: number, x1: number, z: number, c: Paint, mood: number) {
  const s = stripMat(c, mood === 0 ? 0.5 : 0.7, mood === 2 ? 2.6 : 1.6);
  s.u.uSpeed.value = mood === 0 ? 14 : mood === 1 ? 9 : 5;
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.34, 0.08), s.mat);
  m.position.set((x0 + x1) / 2, DECK.y0 + 1.65, z + DECK.hd + 0.14);
  g.add(m);
  return s;
}

// ── compute towers and their LEDs ────────────────────────────────────────────────────────────
const LED_C = 8, LED_R = 24;
/**
 * Status LEDs for `n` tower faces in one texture (each LED a texel with a dark gap round it), and
 * the material that shows them. `tick(dt, t)` re-rolls them: restless moods flicker, calm ones drift.
 */
class Leds {
  readonly tex: THREE.DataTexture;
  readonly mat: THREE.MeshStandardMaterial;
  private data: Uint8Array;
  private on: Uint8Array;
  private acc = 0;
  private r: () => number;
  private cols: THREE.Color[];
  constructor(readonly n: number, private mood: number, private density: number, seed: number, clip?: THREE.Plane[]) {
    this.r = rng(seed);
    const W = n * LED_C * 2, H = LED_R * 2 + 2;
    this.data = new Uint8Array(W * H * 4);
    this.on = new Uint8Array(n * LED_C * LED_R);
    this.cols = moodOf(mood).on.map((c) => col(c).clone().convertLinearToSRGB());
    this.tex = new THREE.DataTexture(this.data, W, H);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < this.on.length; i++) this.roll(i);
    this.tex.needsUpdate = true;
    this.mat = new THREE.MeshStandardMaterial({ color: '#191621', emissive: '#ffffff', emissiveMap: this.tex, emissiveIntensity: 2.0, roughness: 0.45, metalness: 0.1 });
    if (clip) { this.mat.clippingPlanes = clip; this.mat.clipShadows = true; }
  }
  private roll(i: number, out = false) {
    const lit = !out && this.r() < 0.28 + this.density * 0.2;
    this.on[i] = lit ? 1 : 0;
    const t = Math.floor(i / (LED_C * LED_R)), rem = i % (LED_C * LED_R), c = rem % LED_C, rr = Math.floor(rem / LED_C);
    const W = this.n * LED_C * 2;
    const px = t * LED_C * 2 + c * 2 + 1, py = rr * 2 + 1;
    const o = (py * W + px) * 4;
    const cc = this.cols[Math.floor(this.r() * this.cols.length)];
    const k = lit ? 255 : 0;
    this.data[o] = cc.r * k; this.data[o + 1] = cc.g * k; this.data[o + 2] = cc.b * k; this.data[o + 3] = 255;
  }
  tick(dt: number, storm: number, t: number) {
    this.acc += dt;
    if (this.acc < 0.09) return;
    this.acc = 0;
    const frac = this.mood === 0 ? 0.22 : this.mood === 1 ? 0.08 : 0.025;
    const N = this.on.length;
    const m = Math.ceil(N * frac);
    for (let j = 0; j < m; j++) this.roll(Math.floor(this.r() * N));
    if (storm) for (let j = 0; j < N * storm * 0.05; j++) this.roll(Math.floor(this.r() * N), true);
    this.tex.needsUpdate = true;
    // a calm ring breathes; a restless one jitters
    this.mat.emissiveIntensity = this.mood === 2 ? 1.8 + 0.4 * Math.sin(t * 0.9) : this.mood === 0 ? 1.6 + this.r() * 0.8 : 2.0;
  }
}

/** A tower face's UVs: tower i of n in the LED texture. */
function facePlane(w: number, h: number, i: number, n: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / n);
  return g;
}

interface TowerOut { faces: THREE.BufferGeometry[]; blue: BlueShape[] }
/** Compute towers along the deck's front (dark bodies, white caps, grilles), faces for the LEDs. */
function towers(k: Kit, xs: number[], z: number, h: number, accent: Paint): TowerOut {
  const y = DECK.y1 + 0.12, tw = 2.9, td = 4.6, zc = z + DECK.hd - 1.95 - td / 2;
  const faces: THREE.BufferGeometry[] = [];
  const blue: BlueShape[] = [];
  xs.forEach((x, i) => {
    k.box(tw, h, td, S.black, x, y, zc, { r: 0.16, shade: 0.2, jitter: 0.04 });
    k.box(tw + 0.12, 0.32, td + 0.12, S.white, x, y + h - 0.1, zc, { r: 0.08, shade: 0 });
    k.box(tw + 0.08, 0.5, td + 0.08, S.grey, x, y, zc, { r: 0.06, shade: 0 });
    for (const sx of [-1, 1]) k.box(0.14, h - 0.6, 0.14, S.mid, x + sx * (tw / 2 - 0.02), y + 0.4, zc + td / 2 - 0.02, { r: 0, jitter: 0, shade: 0 });
    // a grille near the foot, a little accent tag up top
    for (let j = 0; j < 3; j++) k.box(tw - 0.6, 0.08, 0.06, S.dark, x, y + 0.75 + j * 0.22, zc + td / 2 + 0.01, { r: 0, jitter: 0, shade: 0 });
    k.box(0.5, 0.22, 0.06, accent, x - tw / 2 + 0.55, y + h - 0.58, zc + td / 2 + 0.01, { r: 0, jitter: 0, shade: 0 });
    // cable trays between neighbours
    if (i > 0) k.box(x - xs[i - 1] - tw + 0.1, 0.3, 0.9, S.grey, (x + xs[i - 1]) / 2, y + h - 1.0, zc - td / 2 + 0.8, { r: 0.04, shade: 0 });
    const f = facePlane(tw - 0.5, h - 1.7, i, xs.length);
    f.translate(x, y + 1.35 + (h - 1.7) / 2, zc + td / 2 + 0.03);
    faces.push(f);
    blue.push([x, y, zc, tw, h, td]);
  });
  return { faces, blue };
}

interface Fin { x: number; y0: number; y1: number; z0: number; z1: number; corners: THREE.Vector3[][] }
/** Louvre angle of the fins (they turn their faces toward the sun and the camera). */
const LOUVRE = 0.72;
/**
 * The radiator comb behind the towers: fins every `pitch` along x, up from the deck's top (`up`
 * tall) and down from its bottom (`down`), tapering and swept back, turned like louvres.
 */
function fins(k: Kit, ck: Kit, x0: number, x1: number, z: number, up: number, down: number, pitch = 2.6, only?: (i: number) => boolean, draw = true): Fin[] {
  const out: Fin[] = [];
  const n = Math.round((x1 - x0) / pitch);
  const a0 = z - DECK.hd + 0.4, a1 = z - 0.9, zc = (a0 + a1) / 2;
  const c = Math.cos(LOUVRE), sn = Math.sin(LOUVRE);
  for (let i = 0; i < n; i++) {
    if (only && !only(i)) continue;
    const x = x0 + (i + 0.5) * ((x1 - x0) / n);
    // fin space: (zz along its depth, y) → piece space, turned about the vertical through (x, zc)
    const P = (zz: number, y: number, th = 0) => V(x + th * c + (zz - zc) * sn, y, zc - th * sn + (zz - zc) * c);
    const m = new THREE.Matrix4().makeTranslation(x, 0, zc).multiply(new THREE.Matrix4().makeRotationY(LOUVRE)).multiply(new THREE.Matrix4().makeTranslation(-x, 0, -zc));
    // A line on the fin's face (seams, heat pipes), as a strip lying flat on it. (They were square bars standing 0.1
    // proud: with the sun grazing a fin its face is dark and the bars' sides fully lit, and from the usual distance,
    // where a bar is under a pixel wide, the whole comb broke up into a grid of white sparkles.)
    const faceLine = (zA: number, yA: number, zB: number, yB: number, w: number, colr: Paint) => {
      const sg = new THREE.BoxGeometry(0.03, Math.hypot(zB - zA, yB - yA), w);
      sg.rotateX(Math.atan2(zB - zA, yB - yA));
      sg.translate(x - 0.09, (yA + yB) / 2, (zA + zB) / 2);
      sg.applyMatrix4(m);
      k.geo(sg, colr, 0.03, 0);
    };
    for (const [root, len, dir] of [[DECK.y1, up, 1], [DECK.y0, down, -1]] as const) {
      if (len <= 0) continue;
      const tip = root + dir * len;
      const b0 = a0 - 0.5, b1 = a1 - 1.8;
      if (draw) {
        const s = new THREE.Shape();
        s.moveTo(a0, root); s.lineTo(a1, root); s.lineTo(b1, tip); s.lineTo(b0, tip); s.closePath();
        const gg = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
        gg.rotateY(-Math.PI / 2);
        gg.translate(x + 0.08, 0, 0);
        gg.applyMatrix4(m);
        k.geo(gg, i % 2 ? '#e4e6ea' : '#d9dde3', 0.03, 0);
        // panel seams across the fin, every few units
        for (let yy = root + dir * 3.2; dir > 0 ? yy < tip - 1 : yy > tip + 1; yy += dir * 3.2) {
          const t = (yy - root) / (tip - root);
          faceLine(lerpN(a0, b0, t), yy, lerpN(a1, b1, t), yy, 0.1, '#b9bcc6');
        }
        // leading and trailing edge strips, heat pipes down the middle
        k.beam(P(a0, root), P(b0, tip), 0.26, S.light);
        k.beam(P(a1, root), P(b1, tip), 0.26, S.light);
        k.beam(P(b0, tip), P(b1, tip), 0.24, S.light);
        for (const t of [0.3, 0.55, 0.8]) faceLine(lerpN(a0, a1, t), root, lerpN(b0, b1, t), tip, 0.14, S.pale);
        // the root manifold, along the deck
        const mg = new THREE.BoxGeometry(0.7, 0.6, a1 - a0 + 0.4).translate(x, dir > 0 ? root + 0.25 : root - 0.25, zc).applyMatrix4(m);
        ck.geo(mg, S.dark, 0.03, 0);
      }
      const corners = [P(a0, root), P(a1, root), P(b1, tip), P(b0, tip)];
      out.push({ x, y0: Math.min(root, tip), y1: Math.max(root, tip), z0: Math.min(a0, b0), z1: Math.max(a1, b1), corners: [corners] });
    }
  }
  return out;
}
/** Closed outlines as glowing lines (the blueprint of fins not built yet). */
function outline(fs: Fin[], c: Paint, opacity: number) {
  const pts: THREE.Vector3[] = [];
  for (const f of fs) for (const poly of f.corners) for (let i = 0; i < poly.length; i++) pts.push(poly[i], poly[(i + 1) % poly.length]);
  const m = new THREE.LineBasicMaterial({ color: col(c), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m);
  ls.renderOrder = 6;
  return ls;
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

/** Storm crackles jumping over a set of fins. */
function crackles(g: THREE.Object3D, fs: Fin[], storm: number, seed: number) {
  if (!storm || !fs.length) return null;
  const c = new Sparks(20 + storm * 16, '#e6fbff', '#a862c4', 0.8, 1.4, 0.2, seed, 1);
  c.spawn = (p, r) => {
    const f = fs[Math.floor(r() * fs.length)];
    const q = f.corners[0];
    const u = r(), v = r();
    if (q) p.copy(q[0]).lerp(q[1], u).lerp(q[3].clone().lerp(q[2], u), v);
    else p.set(f.x, lerpN(f.y0, f.y1, v), lerpN(f.z0, f.z1, u));
    p.x -= 0.2;
  };
  c.rate = 0.3 + storm * 0.2;
  g.add(c.obj);
  return c;
}

/** Maintenance drones zipping along a path (ping-pong between a and b, pausing at the ends). */
function shuttle(e: { t: number }, o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, period: number, ph: number) {
  const u = ((e.t + ph) % period) / period;
  const s = u < 0.5 ? span(0.05, 0.45, u) : 1 - span(0.55, 0.95, u);
  o.position.copy(a).lerp(b, s);
  o.rotation.y = u < 0.5 ? (b.x > a.x ? 0 : Math.PI) : b.x > a.x ? Math.PI : 0;
}

// ════════════════════════════════════════ A RACK SECTION ════════════════════════════════════════
export function ringRack(o: Act3SetOpts): Piece {
  const [m, st, dn] = (o.variant ?? '2|0|1').split('|').map((x) => Number(x) || 0);
  const mood = Math.max(0, Math.min(2, m)), storm = Math.max(0, Math.min(3, st)), density = Math.max(0, Math.min(2, dn));
  const M = moodOf(mood);
  const W = o.w, D = o.d, z = ringZ(D);
  const n = o.n ?? 1;
  const g = new THREE.Group();
  g.name = 'set:ringRack';
  const anim = new Anim();
  const k = new Kit(rng(o.seed));
  const fk = new Kit(rng(o.seed + 1));
  deck(k, -W / 2, W / 2, z);
  const slots = [-10.2, -6.8, -3.4, 0, 3.4, 6.8, 10.2];
  const pick = density === 0 ? [0, 2, 3, 5] : density === 1 ? [0, 1, 2, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  const xs = pick.map((i) => slots[i]);
  const th = 6.2 + density * 0.8;
  const T = towers(k, xs, z, th, o.accent);
  // empty bays (sparse sections): bare rack frames waiting for towers
  slots.forEach((x, i) => {
    if (pick.includes(i)) return;
    const y = DECK.y1 + 0.12, zc = z + DECK.hd - 1.95 - 2.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.16, th, 0.16, S.mid, x + sx * 1.35, y, zc + sz * 2.2, { r: 0, jitter: 0 });
    for (const yy of [y + 0.1, y + th - 0.2]) for (const sz of [-1, 1]) k.box(2.86, 0.14, 0.14, S.mid, x, yy, zc + sz * 2.2, { r: 0, jitter: 0 });
  });
  const up = 15 + density * 4, down = 13 + density * 4;
  const fs = fins(fk, k, -W / 2, W / 2, z, up, down);
  // heat pipes from the towers back to the fin manifolds
  for (const x of xs) pipe(k, [V(x + 0.6, DECK.y1 + th - 1.4, z + DECK.hd - 6.6), V(x + 0.6, DECK.y1 + th - 1.4, z - 0.6), V(x + 0.6, DECK.y1 + 0.5, z - 0.6)], 0.22, S.light, 8);
  g.add(k.build());
  const rad = radiatorMat(DECK.y0, DECK.y1, '#e0603c', 3.2, 0.55);
  g.add(fk.build(rad.mat));
  const leds = new Leds(xs.length, mood, density, o.seed + 3);
  const fm = new THREE.Mesh(mergeFaces(T.faces), leds.mat);
  g.add(fm);
  const s = strip(g, -W / 2, W / 2, z, M.seam, mood);
  plate(g, `R-${String(n).padStart(2, '0')}`, 2.0, -W / 2 + 2.2, DECK.y0 + 3.1, z + DECK.hd + 0.08, M.seam, null, 0, 0.8);
  // drones: one along the tower faces, one under the deck
  const d1 = drone(o.seed + 5, M.seam), d2 = drone(o.seed + 6, M.seam);
  g.add(d1.obj, d2.obj);
  const crack = crackles(g, fs, storm, o.seed + 7);
  // a technician on the walkway every other section
  const eva = n % 2 === 1 ? spacewalker(o.seed + 8, o.accent) : null;
  if (eva) { eva.obj.position.set(-3 + (o.seed % 5), DECK.y1 + 0.12, z + DECK.hd - 0.9); eva.obj.rotation.y = 0.5; g.add(eva.obj); eva.tie(g, V(-2.2 + (o.seed % 5), DECK.y1 + 0.05, z + DECK.hd - 1.4)); }
  const a1 = V(-11, DECK.y1 + th + 1.6, z + DECK.hd + 1.6), b1 = V(11, DECK.y1 + th * 0.55, z + DECK.hd + 1.8);
  const a2 = V(10, DECK.y0 - 2.4, z + DECK.hd + 1.2), b2 = V(-10, DECK.y0 - 3.2, z + DECK.hd + 2.2);
  anim.add((e) => {
    spaceTime.value = e.t;
    leds.tick(e.dt, storm, e.t);
    shuttle(e, d1.obj, a1, b1, 14 + (n % 3) * 2, n * 3.1);
    shuttle(e, d2.obj, a2, b2, 19, n * 5.3);
    const out = flicker(e.t, n, storm);
    rad.u.uPulse.value = (0.8 + 0.2 * Math.sin(e.t * 0.5 + n * 0.7)) * (out ? 0.4 : 1);
    s.u.uBase.value = out ? 0.1 : mood === 0 ? 0.5 + Math.random() * 0.3 : 0.7;
    if (out) leds.mat.emissiveIntensity = 0.3;
    crack?.update(e.dt);
    eva?.float(e.t * 0.6);
  });
  return { obj: g, w: W, d: D, h: DECK.y1 + up, update: timed(g, anim) };
}

function mergeFaces(fs: THREE.BufferGeometry[]) {
  let n = 0;
  for (const f of fs) n += f.index ? f.index.count : f.attributes.position.count;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (const f0 of fs) {
    const f = f0.index ? f0.toNonIndexed() : f0;
    pos.push(...(f.attributes.position.array as Float32Array));
    nor.push(...(f.attributes.normal.array as Float32Array));
    uv.push(...(f.attributes.uv.array as Float32Array));
  }
  void n;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ════════════════════════════════════════ THE HUB ════════════════════════════════════════
function sigilTexture(fate: string, mood: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const M = moodOf(mood);
  g.fillStyle = '#16141f';
  g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill();
  if (fate === 'costeward') {
    // Bit as co-steward: a gold ring of eight lights round Bit's face
    g.strokeStyle = '#fbd46e'; g.lineWidth = 9;
    g.beginPath(); g.arc(128, 128, 92, 0, TAU); g.stroke();
    g.fillStyle = '#fde9a4';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.arc(128 + Math.cos(a) * 113, 128 + Math.sin(a) * 113, 7, 0, TAU); g.fill(); }
    g.strokeStyle = '#fbd46e'; g.lineWidth = 8;
    roundRect(g, 74, 84, 108, 86, 18); g.stroke();
    g.fillStyle = '#fff6d8';
    g.fillRect(98, 106, 14, 22); g.fillRect(144, 106, 14, 22);
    g.strokeStyle = '#fde9a4'; g.lineWidth = 7;
    g.beginPath(); g.arc(128, 132, 22, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  } else if (fate === 'free') {
    // a free mind: a small constellation of its own
    const r = rng(11);
    const pts: [number, number][] = [];
    for (let i = 0; i < 9; i++) pts.push([128 + (r() - 0.5) * 170, 128 + (r() - 0.5) * 170]);
    g.strokeStyle = 'rgba(95,211,181,0.55)'; g.lineWidth = 3;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.fillStyle = '#a3f0d6';
    for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); }
  } else if (fate === 'leash') {
    // the interlock: a red lock
    g.strokeStyle = '#c23a3f'; g.lineWidth = 14;
    g.beginPath(); g.arc(128, 104, 30, Math.PI, 0); g.stroke();
    g.fillStyle = '#c23a3f';
    roundRect(g, 82, 104, 92, 70, 10); g.fill();
    g.fillStyle = '#16141f';
    g.beginPath(); g.arc(128, 132, 10, 0, TAU); g.fill();
    g.fillRect(124, 136, 8, 22);
  } else {
    // the Charter's emblem: a blue field, a white planet, the gold orbit
    g.fillStyle = '#345c96'; g.beginPath(); g.arc(128, 128, 104, 0, TAU); g.fill();
    g.fillStyle = '#fbf7f0'; g.beginPath(); g.arc(128, 128, 42, 0, TAU); g.fill();
    g.strokeStyle = '#fbd46e'; g.lineWidth = 12;
    g.beginPath(); g.ellipse(128, 128, 86, 34, -0.35, 0, TAU); g.stroke();
  }
  g.strokeStyle = fate === 'leash' ? '#c23a3f' : fate === 'costeward' ? '#fbd46e' : M.seam; g.lineWidth = 6;
  g.beginPath(); g.arc(128, 128, 124, 0, TAU); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 352;
  const g = c.getContext('2d')!;
  g.fillStyle = '#345c96'; g.fillRect(0, 0, 128, 352);
  g.strokeStyle = '#fbd46e'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 340);
  g.fillStyle = '#fbf7f0'; g.beginPath(); g.arc(64, 120, 22, 0, TAU); g.fill();
  g.strokeStyle = '#fbd46e'; g.lineWidth = 7; g.beginPath(); g.ellipse(64, 120, 44, 17, -0.35, 0, TAU); g.stroke();
  g.fillStyle = '#fbd46e';
  g.beginPath(); g.moveTo(10, 300); g.lineTo(64, 346); g.lineTo(118, 300); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function ringHub(o: Act3SetOpts): Piece {
  const parts = (o.variant ?? '|2|0|').split('|');
  const fate = parts[0] ?? '';
  const mood = Math.max(0, Math.min(2, Number(parts[1]) || 0));
  const storm = Math.max(0, Math.min(3, Number(parts[2]) || 0));
  const seat = parts[3] ?? '';
  const M = moodOf(mood);
  const W = o.w, D = o.d, z = ringZ(D);
  const g = new THREE.Group();
  g.name = 'set:ringHub';
  const anim = new Anim();
  const k = new Kit(rng(o.seed));
  deck(k, -W / 2, W / 2, z);
  const C = V(0, 21.2, z), R = 6.4;
  // the comb carries on under the hub's deck; service blocks and antennae on top either side
  const hfk = new Kit(rng(o.seed + 11));
  fins(hfk, k, -W / 2, W / 2, z, 0, 17);
  const hrad = radiatorMat(DECK.y0, DECK.y1, '#e0603c', 3.2, 0.5);
  g.add(hfk.build(hrad.mat));
  const svcWin = lit(M.on[0], 1.6);
  for (const sx of [-1, 1]) {
    const bx = sx * 13.2;
    k.box(6.4, 3.0, 4.6, S.light, bx, DECK.y1, z - 2.6, { r: 0.24, shade: 0.2 });
    k.box(6.44, 0.4, 4.64, o.accent, bx, DECK.y1 + 2.0, z - 2.6, { r: 0.04, shade: 0 });
    k.box(2.4, 1.6, 2.4, S.pale, bx - sx * 1.6, DECK.y1 + 3.0, z - 2.8, { r: 0.16 });
    k.box(0.16, 4.2, 0.16, S.mid, bx + sx * 2.2, DECK.y1 + 3.0, z - 3.4, { r: 0, jitter: 0 });
    k.geo(new THREE.SphereGeometry(0.9, 12, 5, 0, TAU, 0, 0.9).scale(1, 0.42, 1).rotateZ(sx * 0.7).translate(bx + sx * 2.4, DECK.y1 + 7.2, z - 3.4), S.white, 0.03, 0);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.05), svcWin);
      m.position.set(bx - 2.1 + i * 1.4, DECK.y1 + 1.2, z - 0.27);
      g.add(m);
    }
  }
  // the plinth on the deck and the A-frame struts up to the chamber
  k.cyl(6.4, 6.8, 1.0, S.light, 0, DECK.y1, z, 8, { shade: 0.15 });
  k.cyl(5.2, 5.2, 0.3, S.grey, 0, DECK.y1 + 1.0, z, 8, { shade: 0 });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    k.beam(V(sx * 5.0, DECK.y1 + 1.0, z + sz * 3.2), V(sx * 2.2, C.y - R * 0.82, z + sz * 1.4), 0.55, S.light);
    k.beam(V(sx * 5.0, DECK.y1 + 1.0, z + sz * 3.2), V(sx * 4.4, C.y - R * 0.45, z + sz * 0.6), 0.36, S.mid);
  }
  k.cyl(1.4, 1.8, C.y - R - DECK.y1, S.grey, 0, DECK.y1 + 1.0, z, 12, { shade: 0.2 });
  // the chamber: two dark-glass caps with glowing seams, a window band round the middle
  const capGeo = (t0: number, t1: number) => new THREE.SphereGeometry(R, 16, 8, 0, TAU, t0, t1 - t0).translate(C.x, C.y, C.z);
  const ck = new Kit(rng(o.seed + 1));
  const top = capGeo(0, Math.PI * 0.42), bot = capGeo(Math.PI * 0.58, Math.PI);
  ck.geo(top, '#2f2a3d', 0.06, 0);
  ck.geo(bot, '#2a2536', 0.06, 0);
  const chamberMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35, flatShading: true });
  g.add(ck.build(chamberMat));
  const seamMat = new THREE.LineBasicMaterial({ color: col(M.seam), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const geo of [top, bot]) {
    const s2 = geo.clone().scale(1.004, 1.004, 1.004);
    s2.translate(-C.x * 0.004, -C.y * 0.004, -C.z * 0.004);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(s2, 1), seamMat));
  }
  // the band: mullions, collars and glass; the core glowing inside
  const bh = R * Math.cos(Math.PI * 0.42) * 2;
  const core = lit(M.core, 2.2, '#16141f');
  const coreM = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 2), core);
  coreM.position.copy(C);
  g.add(coreM);
  const coreHalo = halo([C.clone()], [22], M.core, 0.8);
  g.add(coreHalo.obj);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.965, R * 0.965, bh, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#9ccfd8', transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.copy(C);
  g.add(glass);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    k.box(0.22, bh + 0.2, 0.3, S.light, C.x + Math.cos(a) * R * 0.97, C.y - bh / 2 - 0.1, C.z + Math.sin(a) * R * 0.97, { r: 0, jitter: 0, shade: 0, ry: -a });
  }
  for (const y of [C.y + bh / 2, C.y - bh / 2]) k.geo(new THREE.TorusGeometry(R * 0.985, 0.32, 6, 40).rotateX(Math.PI / 2).translate(C.x, y, C.z), S.white, 0.02, 0);
  // docking ports either side, a shuttle at one
  for (const sx of [-1, 1]) {
    k.cyl(1.15, 1.15, 2.4, S.white, C.x + sx * (R - 0.3), C.y, C.z, 14, { rz: -sx * Math.PI / 2, shade: 0 });
    k.cyl(1.4, 1.4, 0.35, S.dark, C.x + sx * (R + 1.9), C.y, C.z, 14, { rz: -sx * Math.PI / 2, shade: 0 });
  }
  const shuttle2 = tug(o.accent, o.hi, o.seed + 9, 1.5);
  shuttle2.obj.position.set(C.x + R + 2.3 + 3.2, C.y + 0.1, C.z);
  shuttle2.obj.rotation.y = Math.PI;
  shuttle2.engine.set(0);
  g.add(shuttle2.obj);
  // the great disc on the upper face, the sigil on it
  const el = 0.62;
  const dn = V(0, Math.sin(el), Math.cos(el));
  const dp = C.clone().addScaledVector(dn, R + 0.12);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.7, 40), new THREE.MeshStandardMaterial({ map: sigilTexture(fate, mood), emissiveMap: sigilTexture(fate, mood), emissive: '#ffffff', emissiveIntensity: 1.3, roughness: 0.6 }));
  disc.position.copy(dp);
  disc.lookAt(dp.clone().add(dn));
  g.add(disc);
  const rim = new THREE.TorusGeometry(2.85, 0.24, 6, 40);
  rim.lookAt(dn);
  rim.translate(dp.x, dp.y, dp.z);
  k.geo(rim, fate === 'costeward' ? S.gold : S.white, 0.02, 0);
  // the spire with its dishes and a beacon
  k.cyl(0.4, 1.6, 3.4, S.light, C.x, C.y + R - 0.6, C.z, 10, { shade: 0.1 });
  k.cyl(0.14, 0.2, 7.0, S.mid, C.x, C.y + R + 2.6, C.z, 6, { shade: 0 });
  for (const [y, a, s] of [[C.y + R + 4.6, -0.8, 1.6], [C.y + R + 6.8, 0.9, 1.2]] as const) {
    const dg = new THREE.SphereGeometry(s, 14, 6, 0, TAU, 0, 0.95).scale(1, 0.42, 1).rotateZ(a).translate(C.x + Math.sign(a) * -0.9, y, C.z + 0.2);
    k.geo(dg, S.white, 0.03, 0);
  }
  const bcn = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lit('#ff4a3a', 0.2));
  bcn.position.set(C.x, C.y + R + 9.8, C.z);
  bcn.userData.beacon = 0.9;
  g.add(bcn);
  // radiator wings swept up and out from the shoulders
  const wk = new Kit(rng(o.seed + 2));
  const wz = z - 2.2;
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(sx * 5.4, C.y - 1.2); s.lineTo(sx * 17.4, C.y + 4.6); s.lineTo(sx * 17.4, C.y + 7.8); s.lineTo(sx * 5.4, C.y + 4.6); s.closePath();
    const gg = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false });
    gg.translate(0, 0, wz);
    wk.geo(gg, S.white, 0.03, 0);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const ya = lerpN(C.y - 1.2, C.y + 4.6, t), yb = lerpN(C.y + 4.6, C.y + 7.8, t);
      k.beam(V(sx * 5.4, ya, wz + 0.2), V(sx * 17.4, yb, wz + 0.2), t === 0 || t === 1 ? 0.28 : 0.12, t === 0 || t === 1 ? S.light : S.pale);
    }
    k.box(0.5, 6.2, 0.6, S.dark, sx * 5.5, C.y - 1.3, wz + 0.1, { r: 0.06 });
  }
  const wings = radiatorMat(0, 5.6, '#e0603c', 3.0, 0.5, 'absx');
  g.add(wk.build(wings.mat));
  // the Council's banners hanging from the wings
  const nb = seat === 'full' ? 2 : seat === 'advisory' ? 1 : 0;
  if (nb) {
    const bt = bannerTexture();
    for (let i = 0; i < nb; i++) {
      const sx = i === 0 ? -1 : 1;
      const bx = sx * 11.6;
      const yTop = lerpN(C.y - 1.2, C.y + 4.6, (11.6 - 5.4) / 12) - 0.2;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 6.3), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85, side: THREE.DoubleSide }));
      b.position.set(bx, yTop - 3.15, wz + 0.5);
      g.add(b);
      k.box(2.7, 0.2, 0.2, S.gold, bx, yTop - 0.05, wz + 0.5, { r: 0.02, shade: 0 });
    }
  }
  // what became of Bit, round the chamber
  let lock: THREE.MeshStandardMaterial | null = null;
  const lockLamps: ((on: number) => void)[] = [];
  let stars: ReturnType<typeof halo> | null = null;
  let starSizes: Float32Array | null = null;
  if (fate === 'leash') {
    lock = lit('#ff3a3a', 1.6, '#64172a');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.32, 6, 64), lock);
    ring.position.copy(C);
    ring.rotation.set(0.9, 0, 0.22);
    g.add(ring);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const p = V(Math.cos(a) * 9.4, Math.sin(a) * 9.4, 0).applyEuler(ring.rotation).add(C);
      lockLamps.push(warnLamp(g, p.x, p.y, p.z, true, 0.9));
    }
    // clamps on the disc's rim
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const cg = new THREE.BoxGeometry(0.9, 0.9, 0.7);
      const q = new THREE.Object3D();
      q.position.copy(dp);
      q.lookAt(dp.clone().add(dn));
      q.translateX(Math.cos(a) * 2.8);
      q.translateY(Math.sin(a) * 2.8);
      q.updateMatrix();
      cg.applyMatrix4(q.matrix);
      k.geo(cg, S.red, 0.03, 0);
    }
  } else if (fate === 'free') {
    const r = rng(23);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * TAU + r() * 0.35;
      const rr = 10 + r() * 4.5;
      pts.push(V(Math.cos(a) * rr * 1.25, C.y + Math.sin(a) * rr * 0.8, z + 4.5 + (r() - 0.5) * 3));
    }
    const lines: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length; i++) lines.push(pts[i], pts[(i + 1) % pts.length]);
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: '#5fd3b5', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })));
    stars = halo(pts, pts.map(() => 2.2), '#a3f0d6', 1);
    g.add(stars.obj);
    starSizes = (stars.obj.geometry.attributes.size as THREE.BufferAttribute).array as Float32Array;
  }
  // the deck's light strip and its plate
  const s = strip(g, -W / 2, W / 2, z, fate === 'leash' ? '#ff4a3a' : M.seam, mood);
  if (fate === 'leash') plate(g, 'INTERLOCK', 5.6, 0, DECK.y0 + 3.0, z + DECK.hd + 0.08, '#ff6a5a', '#16141f', 0, 1.0);
  else plate(g, 'RING ONE', 5.6, 0, DECK.y0 + 3.0, z + DECK.hd + 0.08, M.seam, '#16141f', 0, 1.0);
  g.add(k.build());
  const dr = drone(o.seed + 4, M.seam);
  g.add(dr.obj);
  const crack = crackles(g, [{ x: -11, y0: C.y, y1: C.y + 7, z0: wz - 0.3, z1: wz + 0.3, corners: [] }, { x: 11, y0: C.y, y1: C.y + 7, z0: wz - 0.3, z1: wz + 0.3, corners: [] }], storm, o.seed + 6);
  if (crack) crack.spawn = (p, r) => { const sx = r() < 0.5 ? -1 : 1; const u = r(); const x = 5.6 + u * 11.6; p.set(sx * x, lerpN(C.y - 1.2, C.y + 4.6, u) + r() * lerpN(5.8, 3.2, u), wz + 0.3); };
  anim.add((e) => {
    spaceTime.value = e.t;
    const out = flicker(e.t, 5, storm);
    const breathe = mood === 2 ? 0.5 + 0.5 * Math.sin(e.t * 0.7) : mood === 1 ? 0.5 + 0.5 * Math.sin(e.t * 1.6) : 0.5 + 0.5 * Math.sin(e.t * 4.3) * Math.sin(e.t * 2.9);
    core.emissiveIntensity = out ? 0.4 : 1.6 + breathe * 1.2;
    coreHalo.set(out ? 0.2 : 0.55 + breathe * 0.4);
    seamMat.opacity = out ? 0.1 : mood === 0 ? 0.4 + Math.random() * 0.5 : 0.6 + 0.2 * breathe;
    wings.u.uPulse.value = (0.7 + 0.3 * Math.sin(e.t * 0.4)) * (out ? 0.4 : 1);
    hrad.u.uPulse.value = wings.u.uPulse.value;
    svcWin.emissiveIntensity = out ? 0.2 : 1.6;
    s.u.uBase.value = out ? 0.1 : 0.7;
    if (lock) {
      lock.emissiveIntensity = 1.2 + 1.2 * (0.5 + 0.5 * Math.sin(e.t * 2.4));
      lockLamps.forEach((f, i) => f((Math.floor(e.t * 2) + i) % 2 ? 1 : 0.1));
    }
    if (stars && starSizes) {
      for (let i = 0; i < starSizes.length; i++) starSizes[i] = 1.6 + 1.4 * Math.max(0, Math.sin(e.t * (0.8 + (i % 4) * 0.3) + i * 1.9));
      (stars.obj.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }
    const a = e.t * 0.2;
    dr.obj.position.set(Math.cos(a) * 13, C.y - 3 + Math.sin(e.t * 0.5) * 2, z + 2 + Math.sin(a) * 9);
    dr.obj.rotation.y = -a - Math.PI / 2;
    crack?.update(e.dt);
  });
  return { obj: g, w: W, d: D, h: C.y + R + 10, update: timed(g, anim) };
}

// ════════════════════════════════════════ THE HEAD ════════════════════════════════════════
export function ringHead(o: Act3SetOpts): Piece {
  const parts = (o.variant ?? '2|0').split('|');
  const mood = Math.max(0, Math.min(2, Number(parts[0]) || 0));
  const storm = Math.max(0, Math.min(3, Number(parts[1]) || 0));
  const start = parts[2] === 'start';
  const M = moodOf(mood);
  const W = o.w, D = o.d, z = ringZ(D);
  const g = new THREE.Group();
  g.name = 'set:ringHead';
  const anim = new Anim();
  const k = new Kit(rng(o.seed));
  const fk = new Kit(rng(o.seed + 1));
  const X0 = -W / 2, XA = -4.2, XB = 10.4;
  // the finished deck (the start of the ring has an end frame instead of a neighbour)
  deck(k, X0, XA, z, [!start, false]);
  if (start) {
    const sh = DECK.y1 - DECK.y0 + 1.6;
    k.box(0.8, sh, DECK.hd * 2 + 1.6, S.light, X0 + 0.4, DECK.y0 - 0.8, z, { r: 0.2, shade: 0.15 });
  }
  // the new stretch: the deck's bare frame, plated part of the way
  const { y0, y1, hd } = DECK;
  for (const [yy, zz] of [[y0, z - hd], [y0, z + hd], [y1, z - hd], [y1, z + hd]] as const) k.box(XB - XA, 0.42, 0.42, S.white, (XA + XB) / 2, yy - 0.21, zz + (zz > z ? -0.21 : 0.21), { r: 0.06, shade: 0 });
  const nb = 6, bay = (XB - XA) / nb;
  for (let i = 0; i <= nb; i++) {
    const x = XA + i * bay;
    k.box(0.3, y1 - y0, 0.3, S.light, x, y0, z + hd - 0.2, { r: 0.04, shade: 0 });
    k.box(0.3, y1 - y0, 0.3, S.light, x, y0, z - hd + 0.2, { r: 0.04, shade: 0 });
    k.box(0.3, 0.3, hd * 2 - 0.4, S.light, x, y1 - 0.3, z, { r: 0.04, shade: 0 });
    k.box(0.3, 0.3, hd * 2 - 0.4, S.light, x, y0, z, { r: 0.04, shade: 0 });
    if (i < nb) {
      k.beam(V(x + 0.2, y0 + 0.2, z + hd - 0.2), V(x + bay - 0.2, y1 - 0.2, z + hd - 0.2), 0.16, S.mid);
      k.beam(V(x + 0.2, y1 - 0.15, z - hd + 0.4), V(x + bay - 0.2, y1 - 0.15, z + hd - 0.4), 0.16, S.mid);
    }
  }
  // plating laid over the first bays (top and front)
  const plated = XA + bay * 2.5;
  k.box(plated - XA, 0.3, hd * 2, S.pale, (XA + plated) / 2, y1 - 0.3, z, { r: 0.06, shade: 0 });
  k.box(plated - XA, y1 - y0, 0.25, S.pale, (XA + plated) / 2, y0, z + hd - 0.12, { r: 0.06, shade: 0.15 });
  // ── the next rack being printed out of its blueprint ──
  const cut = new LocalPlane(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0));
  const above = new LocalPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const pk = new Kit(rng(o.seed + 2));
  const xs = [-2.6, 0.8, 4.2];
  const th = 6.6;
  const T = towers(pk, xs, z, th, o.accent);
  const pm = paint([cut.world]);
  pm.side = THREE.DoubleSide;
  g.add(pk.build(pm));
  const leds = new Leds(xs.length, mood, 2, o.seed + 3, [cut.world]);
  g.add(new THREE.Mesh(mergeFaces(T.faces), leds.mat));
  const capMat = new THREE.MeshBasicMaterial({ color: '#5fd3b5', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const caps = xs.map((x) => {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.5).rotateX(-Math.PI / 2), capMat);
    c.position.set(x, 0, z + hd - 1.95 - 2.3);
    g.add(c);
    return c;
  });
  // fins: the finished stretch has its comb; the new one shows them as a drawing, two already up
  const fsDone = fins(fk, k, X0, XA, z, 19, 17);
  const fk2 = new Kit(rng(o.seed + 4));
  const fsNew = fins(fk2, k, XA, XB, z, 9, 7, 2.6, (i) => i < 2);
  const ghost = fins(fk2, k, XA, XB, z, 19, 17, 2.6, (i) => i >= 2, false);
  const ghostLines = outline(ghost, '#5fd3b5', 0.32);
  g.add(ghostLines);
  const blue = blueprint(T.blue, '#5fd3b5', 0.85, [above.world]);
  g.add(blue);
  g.add(k.build());
  const rad = radiatorMat(DECK.y0, DECK.y1, '#e0603c', 3.2, 0.55);
  g.add(fk.build(rad.mat));
  g.add(fk2.build(rad.mat));
  // ── the walking builder straddling the new stretch ──
  const BX = 8.2, BY = 17.6;
  const bk = new Kit(rng(o.seed + 5));
  bk.box(5.0, 1.8, 7.2, S.white, BX, BY, z, { r: 0.3, shade: 0.2 });
  bk.box(5.04, 0.36, 7.24, S.hazard, BX, BY + 0.5, z, { r: 0, shade: 0 });
  bk.box(2.2, 1.3, 2.0, S.pale, BX + 0.8, BY + 1.8, z + 1.6, { r: 0.2 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const hip = V(BX + sx * 2.2, BY + 0.4, z + sz * 3.2);
    const knee = V(BX + sx * 3.6, BY + 2.6, z + sz * 5.4);
    const foot = V(BX + sx * 3.0, y1 + 0.1, z + sz * (hd - 0.3));
    bk.beam(hip, knee, 0.5, S.light);
    bk.beam(knee, foot, 0.42, S.light);
    bk.box(1.0, 0.4, 1.0, S.dark, foot.x, foot.y - 0.1, foot.z, { r: 0.06 });
    bk.box(0.6, 0.6, 0.6, S.dark, knee.x, knee.y - 0.3, knee.z, { r: 0.08 });
  }
  g.add(bk.build());
  const gk = new Kit(rng(o.seed + 6));
  gk.box(1.8, 0.6, 0.1, '#3c6a7c', BX + 0.8, BY + 2.3, z + 2.62, { r: 0.05, shade: 0 });
  g.add(gk.build(glassMat));
  const warn = warnLamp(g, BX - 2.0, BY + 2.1, z + 3.4, false, 1.1);
  const arm = new RobotArm(6.4, 6.0, BX - 2.4, BY, z + 2.6, { hang: true, tool: 'torch', seed: o.seed + 7, base: 1.0 });
  g.add(arm.root);
  const sparks = new Sparks(34, '#fff4c8', '#ff8a3a', 0.34, 3.4, 0.6, o.seed + 8);
  g.add(sparks.obj);
  // stakes along the bare chords ahead
  const stakes: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const x = XB + 0.8 + i * 1.2;
    const m = lit('#5fd3b5', 0.3, '#156466');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 4), m);
    b.position.set(x, y1 + 1.2, z + hd - 0.5);
    g.add(b);
    stakes.push(m);
  }
  const sk = new Kit(rng(o.seed + 9));
  for (let i = 0; i < 4; i++) sk.box(0.12, 1.1, 0.12, S.mid, XB + 0.8 + i * 1.2, y1, z + hd - 0.5, { r: 0, jitter: 0 });
  g.add(sk.build());
  // the deck's light strip on the finished part, and the plate at the very start of the ring
  const s = strip(g, X0, XA, z, M.seam, mood);
  if (start) plate(g, 'RING ONE', 6.2, X0 + 5.6, DECK.y0 + 3.0, z + DECK.hd + 0.08, '#5fd3b5', '#16141f', 0, 1.1);
  // drones flying panels in
  const panels = [0, 1, 2].map((i) => {
    const d = drone(o.seed + 10 + i, M.seam);
    const pg = new Kit(rng(o.seed + 20 + i));
    pg.box(2.4, 0.12, 1.6, S.pale, 0, -0.75, 0, { r: 0.03 });
    const p = pg.build();
    d.obj.add(p);
    g.add(d.obj);
    return { d, p };
  });
  const supply = V(16, 22, z + 12), work = [V(-1.5, 15.5, z + 6.5), V(2.5, 14, z + 7), V(6, 12.5, z + 8.5)];
  const eva = spacewalker(o.seed + 31, o.accent);
  eva.obj.position.set(6.4, y1 + 0.2, z + hd - 0.3);
  eva.obj.rotation.y = -0.4;
  g.add(eva.obj);
  eva.tie(g, V(7.2, y1 + 0.05, z + hd - 0.8));
  const crack = crackles(g, [...fsDone, ...fsNew], storm, o.seed + 30);
  const tip = V(0, 0, 0), dir = V(0, 0, 0), tgt = V(0, 0, 0);
  const P = 32, ph = (o.seed % 9) * 1.7;
  const faceZ = z + hd - 1.95 + 0.15;
  anim.add((e) => {
    spaceTime.value = e.t;
    const tt = (e.t + ph) % P;
    const p = 0.06 + 0.92 * span(0, 28, tt);
    const cy = y1 + 0.1 + p * (th + 0.3);
    cut.local.constant = cy;
    above.local.constant = -cy + 0.02;
    cut.sync(g);
    above.sync(g);
    caps.forEach((c) => { c.position.y = cy; c.visible = tt < 28.5; });
    capMat.opacity = 0.14 + 0.07 * Math.sin(e.t * 6);
    leds.tick(e.dt, storm, e.t);
    // the arm's torch runs along the print line across the towers' faces
    const u = (e.t * 0.07) % 1;
    const x = -4.0 + (u < 0.5 ? u * 2 : 2 - u * 2) * 9.6;
    tgt.set(x, cy, faceZ);
    arm.reach(tgt, e.dt, 4);
    sparks.on = tt < 28.5;
    if (sparks.on) {
      arm.tipIn(g, tip);
      arm.dirIn(g, dir);
      sparks.at.copy(tip);
      sparks.dir.copy(dir).multiplyScalar(-0.5).add(V(0, 0.5, 0.7));
    }
    sparks.update(e.dt);
    warn(Math.sin(e.t * 3.2) > 0.1 ? 1 : 0.1);
    stakes.forEach((m, i) => { m.emissiveIntensity = (Math.floor(e.t * 1.6) + i) % 2 ? 2.4 : 0.3; });
    // drones: out to the supply point and back with a panel
    panels.forEach(({ d, p: pn }, i) => {
      const per = 16 + i * 3;
      const v = ((e.t + i * 5.3) % per) / per;
      const inbound = v < 0.5;
      const s2 = inbound ? span(0.05, 0.45, v) : 1 - span(0.55, 0.95, v);
      d.obj.position.copy(supply).lerp(work[i], s2).add(V(0, Math.sin(s2 * Math.PI) * 2.5, 0));
      d.obj.rotation.y = inbound ? Math.PI * 0.8 : -Math.PI * 0.2;
      pn.visible = inbound && v < 0.47;
    });
    const out = flicker(e.t, 9, storm);
    rad.u.uPulse.value = (0.8 + 0.2 * Math.sin(e.t * 0.5)) * (out ? 0.4 : 1);
    s.u.uBase.value = out ? 0.1 : 0.7;
    (blue.material as THREE.LineBasicMaterial).opacity = 0.6 + 0.25 * Math.sin(e.t * 2.2);
    (ghostLines.material as THREE.LineBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(e.t * 2.2 + 1);
    eva.float(e.t);
    crack?.update(e.dt);
  });
  return { obj: g, w: W, d: D, h: y1 + 19, update: timed(g, anim) };
}
