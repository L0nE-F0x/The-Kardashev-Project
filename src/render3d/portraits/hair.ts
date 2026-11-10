/**
 * Hair and hats: thirty styles, each a few sculpted shapes on the skull (a layer that follows a hairline, plus
 * balls, cones and chains for what stands off it). Hair is one mass with a second tone for locks and clumps,
 * like a painted figure; no strands.
 */
import * as THREE from 'three';
import { C } from '../../render/palette';
import { blend, bump, geo, gloss, halo, lerp, lit, matte, put, rand, shade, smooth, tint, type V3 } from './parts';
import { edge, layer, mount, surf, veil } from './head';
import type { Look } from './looks';

const PI = Math.PI;
type Line = [number, number][];
/** A hairline: elevation by |azimuth| through control points, eased between them. */
function through(a: number, pts: Line): number {
  if (a <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (a <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], smooth(pts[i - 1][0], pts[i][0], a));
  }
  return pts[pts.length - 1][1];
}
/** Short hair: over the forehead, round above the ears, down to the nape. */
const SHORT: Line = [[0, 0.7], [0.5, 0.68], [0.95, 0.52], [1.2, 0.22], [1.62, 0.02], [2.1, -0.38], [PI, -0.5]];
/** Drawn back off the face: a higher forehead. */
const BACK: Line = [[0, 0.76], [0.5, 0.73], [0.95, 0.56], [1.2, 0.22], [1.62, 0.02], [2.1, -0.38], [PI, -0.5]];
/** A fringe cut straight across, the sides falling over the ears to `down`. */
const fringe = (down: number, at = 0.42): Line => [[0, at], [0.7, at - 0.02], [0.86, at - 0.22], [0.99, down], [PI, down]];

const cap = (line: Line, full: number | ((az: number, el: number) => number)) => (az: number, el: number) =>
  edge(el - through(Math.abs(az), line), typeof full === 'number' ? full : full(az, el));
/** A fringe swept from a parting on one side down across the forehead to the other. */
const swept = (az: number, high = 0.78, low = 0.4) => lerp(high, low, smooth(-0.7, 0.85, az));

export interface HairTones {
  main: string;
  deep: string;
  high: string;
}
export function hairTones(L: Look): HairTones {
  let main = shade(blend(L.hair[0], L.hair[1], 0.55), 0.015);
  let high = shade(blend(L.hair[0], L.hair[1], 0.95), 0.02);
  const deep = blend(L.hair[0], L.hair[1], 0.15);
  if (L.grizzle !== undefined) {
    // salt and pepper: the mass goes grey-ish, the clumps and locks take the salt
    main = blend(main, L.grizzle, 0.34);
    high = blend(high, L.grizzle, 0.75);
  }
  return { main, deep, high };
}

/** Balls along a line, shrinking or not: braids, tails, ties. */
function chain(parent: THREE.Object3D, pts: V3[], r0: number, r1: number, mats: THREE.Material[], n = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const count = n || Math.max(3, Math.round(curve.getLength() / ((r0 + r1) * 0.62)));
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const p = curve.getPoint(t);
    const r = lerp(r0, r1, t);
    put(parent, geo.ball(), mats[i % mats.length], [p.x, p.y, p.z], { s: [r, r * 0.92, r] });
  }
}

/** A hard hat (Juno's, and the scuffed ones with a headlamp). */
function hardHat(head: THREE.Object3D, shell: string, trim: string, lamp: boolean) {
  const hat = new THREE.Group();
  hat.rotation.x = -0.1;
  head.add(hat);
  const m = matte(shell, 0.55);
  const t = matte(trim, 0.6);
  put(hat, geo.dome(), m, [0, 0.39, 0], { s: [1.12, 0.86, 1.16] });
  // the brim, longer at the front
  put(hat, geo.ball(), t, [0, 0.4, 0.06], { s: [1.24, 0.06, 1.36] });
  // the ridge over the crown
  put(hat, geo.torus(0.06, PI), t, [0, 0.39, 0], { s: [1.17, 0.9, 1.4], r: [0, PI / 2, 0] });
  if (lamp) {
    put(hat, geo.box(0.2), matte(C.ink2, 0.6), [0, 0.74, 1.04], { s: [0.4, 0.3, 0.22], r: [-0.5, 0, 0] });
    put(hat, geo.ball(), lit(C.yel1), [0, 0.76, 1.15], { s: [0.12, 0.09, 0.04], r: [-0.5, 0, 0], ghost: true });
    halo(hat, C.yel1, [0, 0.76, 1.2], 0.9, 0.55);
    put(hat, geo.torus(0.03), matte(C.ink3, 0.6), [0, 0.4, 0], { s: [1.14, 1.18, 1], r: [PI / 2, 0, 0] });
  }
}

/** Hair, a hat if the style has one, and the colour touches (streak, temples, dyed tips). */
export function hair(head: THREE.Object3D, L: Look) {
  const tone = hairTones(L);
  const main = matte(tone.main, 0.92);
  const high = matte(tone.high, 0.92);
  const tipC = L.tips !== undefined ? matte(L.tips, 0.9) : null;
  const ball = (p: V3, s: number | V3, m: THREE.Material = main, r?: V3) => put(head, geo.ball(), m, p, { s, r });
  const lay = (key: string, fn: (az: number, el: number) => number, m: THREE.Material = main) => put(head, layer(key, fn), m, [0, 0, 0]);
  /** Hair hanging behind the shoulders and down each side of the neck. */
  const fall = (length: number, width = 1) => {
    ball([0, -0.55 - length * 0.4, -0.42], [0.92 * width, 0.5 + length * 0.55, 0.52]);
    for (const side of [-1, 1]) {
      ball([side * 0.8 * width, -0.5 - length * 0.42, -0.05], [0.27, 0.45 + length * 0.5, 0.44]);
      if (tipC) ball([side * 0.8 * width, -0.62 - length * 0.82, -0.03], [0.275, 0.3, 0.45], tipC);
    }
    if (tipC) ball([0, -0.7 - length * 0.82, -0.42], [0.93 * width, 0.3, 0.53], tipC);
  };

  switch (L.style) {
    case 'hardhat':
      lay('short', cap(SHORT, 0.05));
      hardHat(head, blend(C.yel0, C.org2, 0.12), blend(C.org2, C.yel0, 0.35), false);
      break;
    case 'helmet': {
      const [dark, light] = L.hat ?? [C.ink7, C.ink9];
      lay('short', cap(SHORT, 0.05));
      hardHat(head, blend(light, dark, 0.2), blend(dark, light, 0.15), true);
      break;
    }
    case 'bob':
      lay('bob', cap(fringe(-0.64), (_az, el) => 0.09 + 0.07 * smooth(0.3, -0.55, el)));
      break;
    case 'long':
      lay('long', cap([[0, 0.66], [0.55, 0.63], [0.8, 0.4], [0.97, -0.3], [1.1, -0.7], [PI, -0.7]], (_az, el) => 0.085 + 0.03 * smooth(0.2, -0.6, el)));
      fall(1.25);
      break;
    case 'curly': {
      lay('short', cap(SHORT, 0.07));
      // a head of tight curls: clumps all over the cap
      const r = rand(7);
      const n = 96;
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 1.55;
        const az = ((i * 2.39996) % (PI * 2)) - PI;
        const el = Math.asin(Math.max(-1, Math.min(1, y)));
        if (el < through(Math.abs(az), SHORT) + 0.06) continue;
        const p = surf(az, el, 0.07 + r() * 0.05);
        ball([p.x, p.y, p.z], 0.19 + r() * 0.07, r() < 0.4 ? high : main);
      }
      break;
    }
    case 'bun':
      lay('back', cap(BACK, 0.06));
      ball([0, 1.12, -0.3], [0.4, 0.36, 0.4], high);
      put(head, geo.torus(0.12), main, [0, 0.9, -0.24], { s: [0.3, 0.3, 0.3], r: [PI / 2 - 0.25, 0, 0] });
      break;
    case 'spiky': {
      lay('short-thick', cap(SHORT, 0.085));
      // spikes swept up and back
      const r = rand(3);
      for (let row = 0; row < 4; row++) {
        const el = 0.86 + row * 0.2;
        const n = [5, 5, 4, 3][row];
        for (let i = 0; i < n; i++) {
          const az = (i - (n - 1) / 2) * (0.5 - row * 0.03) + (row % 2) * 0.12;
          const p = surf(az, el, -0.02);
          const cone = put(head, geo.cone(), (i + row) % 2 ? high : main, [p.x, p.y, p.z], { s: [0.2, 0.5 + r() * 0.22 - row * 0.05, 0.2] });
          cone.rotation.set(-0.5 + row * -0.28 + (r() - 0.5) * 0.2, 0, -az * 0.55 - 0.12);
        }
      }
      break;
    }
    case 'slick':
      lay('slick', cap(BACK, (az, el) => 0.065 + 0.055 * smooth(0.5, 1.2, el) + 0.05 * smooth(1.7, 2.6, Math.abs(az))), high);
      // comb lines
      for (const az of [-0.5, -0.17, 0.17, 0.5]) put(head, geo.tube(`comb:${az}`, () => [0.8, 1.05, 1.3, 1.5].map((el) => surf(az * (1.6 - el * 0.55), el, 0.115)), 0.022), main, [0, 0, 0], { ghost: true });
      break;
    case 'receding':
      lay('receding', (az, el) => {
        const a = Math.abs(az);
        const top = lerp(0.5, 1.0, smooth(1.1, 2.7, a));
        return edge(Math.min(top - el, el - through(a, SHORT), (a - 0.98) * 0.8), 0.085);
      });
      break;
    case 'bald':
      lay('bald', (az, el) => {
        const a = Math.abs(az);
        const top = lerp(0.3, 0.55, smooth(1.4, 2.7, a));
        return edge(Math.min(top - el, el - through(a, SHORT), (a - 1.22) * 0.8), 0.045);
      });
      break;
    case 'beanie': {
      const [dark, light] = L.band ?? [C.grn4, C.grn6];
      lay('short', cap(SHORT, 0.06));
      const knit = matte(light, 0.95);
      put(head, geo.dome(), knit, [0, 0.36, -0.03], { s: [1.1, 0.96, 1.13], r: [-0.12, 0, 0] });
      // the ribbed cuff and the pom-pom
      put(head, geo.torus(0.13), matte(dark, 0.95), [0, 0.4, -0.02], { s: [1.04, 1.08, 1.05], r: [PI / 2 - 0.12, 0, 0] });
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * PI * 2;
        put(head, geo.ball(), knit, [Math.sin(a) * 1.13, 0.4 + Math.cos(a) * 0.14 * 0.12, Math.cos(a) * 1.17 - 0.02], { s: [0.035, 0.13, 0.035], ghost: true });
      }
      ball([0, 1.36, -0.16], 0.24, matte(C.white, 0.98));
      // two braids over the shoulders
      for (const side of [-1, 1]) {
        chain(head, [[side * 0.9, 0.05, 0.2], [side * 0.98, -0.6, 0.3], [side * 0.9, -1.3, 0.5], [side * 0.84, -1.75, 0.62]], 0.17, 0.14, [main, high]);
        ball([side * 0.83, -1.86, 0.64], [0.13, 0.07, 0.13], matte(L.band?.[1] ?? C.red3, 0.8));
        ball([side * 0.83, -1.99, 0.65], [0.1, 0.1, 0.1], high);
      }
      break;
    }
    case 'puff': {
      lay('short', cap(SHORT, 0.06));
      // a big round afro behind the head
      const afro = layer('afro', (az, el) => 0.2 + 0.035 * Math.sin(az * 11 + el * 3) * Math.sin(el * 12 + 1) + 0.02 * Math.sin(az * 23 + el * 17), [72, 48]);
      put(head, afro, main, [0, 0.42, -0.34], { s: 1.02 });
      if (L.band) {
        const g = new THREE.Group();
        g.position.set(0, 0.5, 0.06);
        g.rotation.set(PI / 2 - 0.62, 0, 0);
        head.add(g);
        put(g, geo.torus(0.075), matte(L.band[0], 0.8), [0, 0, 0], { s: [1.0, 1.0, 1.0] });
        put(g, geo.torus(0.035), matte(L.band[1], 0.8), [0, 0, -0.07], { s: [1.02, 1.02, 1.0] });
      }
      break;
    }
    case 'wavy':
      lay('wavy', cap(BACK, (az, el) => 0.105 + 0.035 * Math.sin(az * 6 + el * 4) * smooth(0.25, 0.8, el) + 0.04 * smooth(0.6, 1.2, el)));
      for (const az of [-0.62, -0.2, 0.22, 0.64]) put(head, geo.tube(`wave:${az}`, () => [0.78, 1.0, 1.25, 1.45].map((el) => surf(az * (1.7 - el * 0.6) + 0.1 * Math.sin(el * 6), el, 0.2)), 0.03), high, [0, 0, 0], { ghost: true });
      break;
    case 'updo':
      lay('updo', (az, el) => {
        const a = Math.abs(az);
        const f = swept(az);
        const line = a < 0.84 ? f : lerp(f, -0.42, smooth(0.84, 1.0, a));
        return edge(el - line, 0.1 + 0.04 * smooth(-0.6, 0.8, az) * smooth(0.3, 0.8, el));
      });
      // the knot at the nape
      ball([0.3, -0.2, -0.98], [0.36, 0.32, 0.3], high);
      break;
    case 'crop':
      lay('crop', cap(SHORT, (_az, el) => 0.045 + 0.02 * smooth(0.7, 1.1, el)));
      break;
    case 'ponytail': {
      lay('back', cap(BACK, 0.06));
      ball([0.12, 0.72, -0.86], 0.26, main);
      put(head, geo.torus(0.3), matte(L.band?.[1] ?? C.red3, 0.8), [0.2, 0.62, -0.98], { s: 0.17, r: [0.9, 0.3, 0] });
      chain(head, [[0.26, 0.5, -1.06], [0.66, -0.2, -1.0], [0.9, -0.95, -0.74], [0.92, -1.6, -0.5]], 0.25, 0.13, [main, high, main]);
      break;
    }
    case 'messy': {
      lay('messy', cap(SHORT, (az, el) => 0.1 + 0.035 * Math.sin(az * 9 + el * 5) * Math.sin(el * 7)));
      // slept at the factory: clumps every which way
      const r = rand(21);
      for (let i = 0; i < 16; i++) {
        const az = (r() - 0.5) * 4.6;
        const el = 0.72 + r() * 0.75;
        const p = surf(az, el, 0.1);
        const tuft = put(head, geo.cone(), r() < 0.45 ? high : main, [p.x, p.y, p.z], { s: [0.17, 0.3 + r() * 0.26, 0.17] });
        tuft.rotation.set((r() - 0.5) * 1.5, 0, -az * 0.7 + (r() - 0.5) * 0.9);
      }
      break;
    }
    case 'sidepart':
      lay('sidepart', (az, el) => {
        const a = Math.abs(az);
        const f = lerp(0.74, 0.6, smooth(-0.55, 0.8, az));
        const line = a < 0.5 ? f : through(a, [[0.5, f], [0.95, 0.52], [1.2, 0.22], [1.62, 0.02], [2.1, -0.38], [PI, -0.5]]);
        const part = bump(az, -0.52, 0.075) * smooth(0.55, 0.75, el) * smooth(-2.2, -1.2, -Math.abs(az));
        return edge(el - line, 0.07 + 0.055 * smooth(-0.45, 0.5, az) * smooth(0.4, 0.8, el) - 0.045 * part);
      });
      break;
    case 'pompadour':
      lay('pompadour', cap(SHORT, (az, el) => 0.07 + 0.36 * bump(az, 0, 0.62) * bump(el, 0.98, 0.36)), main);
      for (const az of [-0.36, 0, 0.36]) put(head, geo.tube(`pomp:${az}`, () => [0.74, 0.92, 1.12, 1.34].map((el) => surf(az * (1.5 - el * 0.5), el, 0.085 + 0.36 * bump(az, 0, 0.62) * bump(el, 0.98, 0.36))), 0.035), high, [0, 0, 0], { ghost: true });
      break;
    case 'longwavy': {
      lay('longwavy', (az, el) => {
        const a = Math.abs(az);
        const f = swept(az, 0.8, 0.42);
        const line = a < 0.84 ? f : lerp(f, -0.62, smooth(0.84, 1.0, a));
        return edge(el - line, 0.1 + 0.03 * Math.sin(el * 9 + az * 2));
      });
      ball([0, -1.0, -0.42], [0.95, 0.95, 0.5]);
      // waves falling to the shoulders
      for (const side of [-1, 1]) {
        const pts: V3[] = [];
        for (let i = 0; i < 6; i++) pts.push([side * (0.93 + 0.1 * Math.sin(i * 1.9)), -0.3 - i * 0.3, 0.02 + 0.03 * i]);
        chain(head, pts, 0.3, 0.22, [main, main, high], 8);
      }
      break;
    }
    case 'locs': {
      lay('locs', cap(BACK, (az) => 0.055 + 0.03 * Math.max(0, Math.sin(az * 15))));
      // gathered into a high bun, with a gold cuff
      const r = rand(9);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        ball([Math.sin(a) * 0.3, 1.2 + (i % 2) * 0.07, -0.22 + Math.cos(a) * 0.3], [0.19, 0.17 + r() * 0.04, 0.19], i % 3 ? main : high);
      }
      ball([0, 1.3, -0.22], [0.3, 0.2, 0.3], main);
      put(head, geo.torus(0.16), gloss(L.band?.[1] ?? C.yel0, 0.35), [0, 1.02, -0.2], { s: 0.36, r: [PI / 2 - 0.12, 0, 0] });
      break;
    }
    case 'cap': {
      const [dark, light] = L.hat ?? [C.ink8, C.white];
      lay('short', cap(SHORT, 0.05));
      const hat = new THREE.Group();
      hat.rotation.x = -0.12;
      head.add(hat);
      // a ship captain's cap: white crown, black band and visor, a gold badge
      put(hat, geo.cyl(), matte(C.ink1, 0.7), [0, 0.6, -0.02], { s: [1.03, 0.24, 1.07] });
      put(hat, geo.ball(), matte(light, 0.8), [0, 0.86, -0.04], { s: [1.26, 0.26, 1.3] });
      put(hat, geo.ball(), matte(blend(light, dark, 0.35), 0.8), [0, 0.8, -0.04], { s: [1.2, 0.2, 1.24] });
      put(hat, geo.ball(), gloss(C.ink0, 0.3), [0, 0.5, 0.88], { s: [0.72, 0.045, 0.46], r: [0.3, 0, 0] });
      put(hat, geo.ball(), gloss(C.yel0, 0.3), [0, 0.64, 1.07], { s: [0.12, 0.12, 0.05] });
      put(hat, geo.torus(0.16), gloss(C.yel0, 0.3), [0, 0.64, 1.065], { s: [0.17, 0.15, 0.1] });
      break;
    }
    case 'gele': {
      const [dark, light] = L.hat ?? L.band ?? [C.grn4, C.grn6];
      const a = matte(light, 0.75);
      const b = matte(blend(dark, light, 0.25), 0.75);
      // a tall head wrap: pleated folds rising to a fan, gold along the edge
      lay('wrap', cap([[0, 0.46], [1.0, 0.4], [1.6, 0.3], [PI, 0.0]], 0.1), a);
      put(head, geo.torus(0.045), gloss(C.yel0, 0.4), [0, 0.47, 0.08], { s: [1.0, 1.02, 1.0], r: [PI / 2 - 0.2, 0, 0] });
      for (let i = 0; i < 5; i++) {
        ball([0.1 + i * 0.07, 0.86 + i * 0.15, -0.12 - i * 0.02], [1.1 - i * 0.07, 0.2, 0.86 - i * 0.05], i % 2 ? b : a, [0.05, 0, 0.1 + i * 0.1]);
      }
      ball([0.5, 1.52, -0.2], [0.66, 0.4, 0.14], a, [0, -0.2, -0.55]);
      ball([0.44, 1.5, -0.26], [0.72, 0.44, 0.1], b, [0, -0.2, -0.55]);
      ball([-0.5, 1.1, -0.16], [0.4, 0.24, 0.4], b, [0, 0, 0.5]);
      break;
    }
    case 'pixie': {
      lay('pixie', (az, el) => {
        const a = Math.abs(az);
        const f = swept(az, 0.74, 0.47);
        const line = a < 0.6 ? f : through(a, [[0.6, f], [0.95, 0.5], [1.2, 0.24], [1.62, 0.04], [2.1, -0.3], [PI, -0.42]]);
        return edge(el - line, 0.085 + 0.03 * Math.sin(az * 8 + el * 6));
      });
      // choppy on top
      const r = rand(31);
      for (let i = 0; i < 7; i++) {
        const az = -0.9 + i * 0.3;
        const p = surf(az, 1.0 + (i % 2) * 0.16, 0.06);
        const tuft = put(head, geo.cone(), i % 2 ? high : main, [p.x, p.y, p.z], { s: [0.16, 0.24 + r() * 0.1, 0.16] });
        tuft.rotation.set(-0.3, 0, -az * 0.6 - 0.5);
      }
      break;
    }
    case 'braid': {
      lay('back', cap(BACK, 0.06));
      // a braid wrapped round the crown like a circlet
      const [b0, b1] = L.band ? [matte(L.band[0], 0.9), matte(L.band[1], 0.9)] : [main, high];
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        const el = 0.72 - 0.34 * smooth(1.2, 2.6, Math.abs(a > PI ? a - PI * 2 : a));
        const p = surf(a > PI ? a - PI * 2 : a, el, 0.1);
        ball([p.x, p.y, p.z], [0.125, 0.115, 0.125], i % 2 ? b1 : b0);
      }
      break;
    }
    case 'undercut':
      // shaved sides, a long top swept over
      put(head, veil('shaved', (az, el) => smooth(-0.04, 0.12, el - through(Math.abs(az), SHORT))), tint(tone.deep, 0.62), [0, 0, 0], { ghost: true, order: 1 });
      lay('undercut-top', (az, el) => {
        const a = Math.abs(az);
        const line = through(a, [[0, 0.68], [0.8, 0.62], [1.3, 0.56], [2.2, 0.3], [PI, 0.1]]);
        return edge(el - line, 0.12 + 0.12 * smooth(-0.7, 0.9, az) * smooth(0.5, 0.9, el));
      }, high);
      ball([0.62, 0.66, 0.5], [0.3, 0.2, 0.36], high, [0.2, 0, -0.5]);
      for (const az of [-0.3, 0.1, 0.5]) put(head, geo.tube(`under:${az}`, () => [0.78, 1.0, 1.25].map((el) => surf(az + (1.2 - el) * 0.5, el, 0.14 + 0.12 * smooth(-0.7, 0.9, az + (1.2 - el) * 0.5))), 0.03), main, [0, 0, 0], { ghost: true });
      break;
    case 'bandana': {
      const [dark, light] = L.band ?? [C.red2, C.red3];
      // a cloud of curls round the face
      const r = rand(13);
      for (let i = 0; i < 46; i++) {
        const side = i % 2 ? 1 : -1;
        const az = side * (1.02 + r() * 1.9);
        const el = -0.62 + r() * 1.0;
        const p = surf(az, el, 0.12 + r() * 0.12);
        ball([p.x, p.y, p.z], 0.2 + r() * 0.09, r() < 0.4 ? high : main);
      }
      ball([0, 0.3, -0.5], [1.05, 1.0, 0.75]);
      // the bandana over the top, knotted at the side
      lay('bandana', cap([[0, 0.5], [1.0, 0.44], [1.7, 0.34], [PI, 0.2]], 0.1), matte(light, 0.8));
      lay('bandana-edge', (az, el) => {
        const line = through(Math.abs(az), [[0, 0.5], [1.0, 0.44], [1.7, 0.34], [PI, 0.2]]);
        return edge(Math.min(el - line, line + 0.17 - el), 0.118);
      }, matte(dark, 0.8));
      const dots = matte(C.white, 0.8);
      for (let i = 0; i < 14; i++) {
        const p = surf((r() - 0.5) * 2.4, 0.78 + r() * 0.6, 0.1);
        ball([p.x, p.y, p.z], 0.035, dots);
      }
      const k = surf(1.0, 0.62, 0.14);
      ball([k.x, k.y, k.z], 0.13, matte(dark, 0.8));
      for (const [dx, dy, rz] of [[0.12, 0.2, -0.6], [0.24, 0.02, -1.5]] as const) put(head, geo.cone(), matte(light, 0.8), [k.x + dx * 0.4, k.y + dy * 0.4, k.z], { s: [0.1, 0.34, 0.06], r: [0, 0, rz] });
      break;
    }
    case 'shag': {
      lay('shag', cap(fringe(-0.7, 0.4), (az, el) => 0.1 + 0.03 * Math.sin(az * 10) * smooth(0.2, -0.5, el)));
      ball([0, -0.95, -0.4], [0.98, 0.8, 0.5]);
      // layers ending in flicked points on the shoulders
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const az = side * (1.0 + i * 0.42);
          const p = surf(az, -0.5, 0.1);
          const len = 0.6 + (i % 2) * 0.22;
          ball([p.x * 1.03, p.y - len * 0.55, p.z], [0.2, len * 0.62, 0.22], i % 2 ? high : main, [0, 0, side * (0.12 + (i % 2) * 0.1)]);
          const tip = put(head, geo.cone(), i % 2 ? high : main, [p.x * 1.06 + side * 0.06, p.y - len * 1.02, p.z], { s: [0.15, 0.3, 0.16] });
          tip.rotation.set(PI, 0, side * 0.5);
        }
      }
      break;
    }
    case 'chullo': {
      const [dark, light] = L.hat ?? [C.red2, C.red3];
      const pat = L.weave ?? (L.band ? [L.band[1], C.white, L.band[0]] : [C.yel0, C.white, C.grn5]);
      lay('short', cap(SHORT, 0.05));
      const wool = matte(light, 0.98);
      // the cap with its ear flaps
      lay('chullo', (az, el) => {
        const a = Math.abs(az);
        const flap = bump(a, 1.5, 0.42);
        const line = lerp(through(a, [[0, 0.44], [1.0, 0.4], [PI, 0.12]]), -0.72, flap * flap);
        return edge(el - line, 0.11);
      }, wool);
      // bands of pattern
      const ring = (y: number, c: number, tube: number) => {
        const rr = Math.sqrt(Math.max(0.05, 1 - (y * 0.97) ** 2)) + 0.115;
        put(head, geo.torus(tube), matte(c, 0.95), [0, y, 0], { s: [rr * 0.95, rr * 0.98, 1], r: [PI / 2, 0, 0] });
      };
      ring(0.56, pat[0], 0.035);
      ring(0.86, pat[0], 0.045);
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * PI * 2;
        const y = 0.71 + (i % 2 ? 0.04 : -0.04);
        const rr = Math.sqrt(1 - (y * 0.97) ** 2) + 0.115;
        ball([Math.sin(a) * rr * 0.95, y, Math.cos(a) * rr * 0.98], 0.055, matte(pat[1 + (i % 2)] ?? pat[1], 0.95));
      }
      // the ties and the pom-pom
      for (const side of [-1, 1]) {
        chain(head, [[side * 0.98, -0.78, 0.08], [side * 0.92, -1.25, 0.3], [side * 0.82, -1.7, 0.5]], 0.075, 0.065, [matte(pat[0], 0.95), wool, matte(dark, 0.95)]);
        ball([side * 0.8, -1.82, 0.54], 0.11, matte(pat[1], 0.98));
      }
      ball([0, 1.26, 0], 0.2, matte(pat[0], 0.98));
      break;
    }
    case 'sidebraid': {
      lay('parted', cap(BACK, (az, el) => 0.07 - 0.04 * bump(az, 0, 0.06) * smooth(0.6, 0.8, el)));
      // one thick braid over the shoulder
      chain(head, [[-0.8, -0.1, -0.5], [-0.98, -0.62, 0.0], [-0.86, -1.2, 0.46], [-0.66, -1.72, 0.66], [-0.56, -2.1, 0.72]], 0.25, 0.17, [main, high]);
      const [b0, b1] = L.band ?? [C.yel0, C.yel1];
      put(head, geo.torus(0.3), gloss(b0, 0.4), [-0.58, -2.02, 0.72], { s: 0.16, r: [PI / 2, 0, 0] });
      put(head, geo.torus(0.3), gloss(b1, 0.4), [-0.56, -2.1, 0.72], { s: 0.15, r: [PI / 2, 0, 0] });
      break;
    }
  }

  // ── colour touches ──
  if (L.streak !== undefined) {
    // a streak through the fringe
    const lift = L.style === 'long' ? 0.1 : 0.115;
    const pts: [number, number][] = L.style === 'bob' ? [[-0.3, 1.2], [-0.36, 0.9], [-0.4, 0.62], [-0.42, 0.44]] : [[-0.3, 1.2], [-0.42, 0.95], [-0.62, 0.72], [-0.84, 0.4], [-0.98, 0.0]];
    put(head, geo.tube(`streak:${L.style}`, () => pts.map(([az, el]) => surf(az, el, lift)), 0.06), matte(L.streak, 0.9), [0, 0, 0], { ghost: true });
  }
  if (L.temples !== undefined) {
    for (const side of [-1, 1]) {
      const t = mount(head, side * 1.2, 0.36, 0.06);
      put(t, geo.ball(), matte(L.temples, 0.92), [0, 0, 0], { s: [0.2, 0.17, 0.03] });
    }
  }
}
