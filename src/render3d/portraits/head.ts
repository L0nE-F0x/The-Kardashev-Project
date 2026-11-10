/**
 * A head and its face: the skull (a soft egg, a little narrower at the jaw), where things sit on it (azimuth round
 * from the nose, elevation up from the eye line), and the features that carry the five moods: brows, eyes, mouth,
 * cheeks. Kept simple on purpose, like the game's figures: dot eyes, thick brows, a small mouth. The mood has to
 * read at 40 pixels, so each one changes the whole face, not a detail.
 */
import * as THREE from 'three';
import type { Mood } from '../../content/events';
import { C } from '../../render/palette';
import { blend, colour, geo, gloss, lit, matte, put, rand, shade, shared, sheer, smooth, soft, tint } from './parts';
import type { Look } from './looks';

// ── the skull and its surface ──
/** A unit direction → the point on the skull that way (in place). */
export function onSkull(v: THREE.Vector3): THREE.Vector3 {
  const y = v.y;
  let sx = 0.95;
  let sz = 0.98;
  let sy = 1;
  if (y < 0) {
    const t = -y;
    sx *= 1 - 0.17 * t * t;
    sz *= 1 - 0.06 * t * t;
    sy = 1.03;
  }
  return v.set(v.x * sx, y * sy, v.z * sz);
}

const dir = (az: number, el: number, out = new THREE.Vector3()) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

/** The point on the skull at an azimuth and elevation (radians), lifted `lift` off the surface. */
export function surf(az: number, el: number, lift = 0): THREE.Vector3 {
  const d = dir(az, el);
  const p = onSkull(d.clone());
  return p.addScaledVector(d, lift);
}

/** A group sitting on the skull there: its X runs round the head, its Y up it, its Z straight out. */
export function mount(head: THREE.Object3D, az: number, el: number, lift = 0): THREE.Group {
  const g = new THREE.Group();
  const n = dir(az, el);
  const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
  const up = new THREE.Vector3().crossVectors(n, right);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
  g.position.copy(surf(az, el, lift));
  head.add(g);
  return g;
}

interface Blank {
  /** Unit directions, three per vertex. */
  dirs: Float32Array;
  az: Float32Array;
  el: Float32Array;
  index: THREE.BufferAttribute;
}
const blanks = new Map<string, Blank>();
/**
 * A unit sphere as a welded grid (one vertex at each pole, no seam), made once per resolution: every sculpture
 * starts from it. Azimuth runs round from the nose (+Z) toward +X, elevation up from the eye line.
 */
function blank([around, rings]: [number, number]): Blank {
  const key = `${around}x${rings}`;
  let b = blanks.get(key);
  if (!b) {
    const n = 2 + (rings - 1) * around;
    const dirs = new Float32Array(n * 3);
    const az = new Float32Array(n);
    const el = new Float32Array(n);
    const place = (i: number, a: number, e: number) => {
      az[i] = a;
      el[i] = e;
      dirs[i * 3] = Math.sin(a) * Math.cos(e);
      dirs[i * 3 + 1] = Math.sin(e);
      dirs[i * 3 + 2] = Math.cos(a) * Math.cos(e);
    };
    place(0, 0, Math.PI / 2);
    for (let r = 1; r < rings; r++) for (let k = 0; k < around; k++) place(1 + (r - 1) * around + k, -Math.PI + (k / around) * Math.PI * 2, Math.PI / 2 - (r / rings) * Math.PI);
    place(n - 1, 0, -Math.PI / 2);
    const idx: number[] = [];
    const at = (r: number, k: number) => 1 + (r - 1) * around + (k % around);
    for (let k = 0; k < around; k++) {
      idx.push(0, at(1, k), at(1, k + 1));
      for (let r = 1; r < rings - 1; r++) idx.push(at(r, k), at(r + 1, k), at(r, k + 1), at(r, k + 1), at(r + 1, k), at(r + 1, k + 1));
      idx.push(n - 1, at(rings - 1, k + 1), at(rings - 1, k));
    }
    blanks.set(key, (b = { dirs, az, el, index: new THREE.BufferAttribute(n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1) }));
  }
  return b;
}

/** Smooth vertex normals for an indexed mesh (three's own are several times slower, and a face asks for a few of these). */
function normals(pos: Float32Array, index: ArrayLike<number>): Float32Array {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const k = 1 / (Math.hypot(out[i], out[i + 1], out[i + 2]) || 1);
    out[i] *= k;
    out[i + 1] *= k;
    out[i + 2] *= k;
  }
  return out;
}

/** A sphere reshaped by a rule on (azimuth, elevation): welded, smooth normals. */
export function sculpt(key: string, seg: [number, number], rule: (az: number, el: number, v: THREE.Vector3, d: THREE.Vector3) => void): THREE.BufferGeometry {
  return shared(`sculpt:${key}`, () => {
    const b = blank(seg);
    const pos = new Float32Array(b.dirs.length);
    const v = new THREE.Vector3();
    const d = new THREE.Vector3();
    for (let i = 0, n = b.az.length; i < n; i++) {
      d.set(b.dirs[i * 3], b.dirs[i * 3 + 1], b.dirs[i * 3 + 2]);
      v.copy(d);
      rule(b.az[i], b.el[i], v, d);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals(pos, b.index.array), 3));
    g.setIndex(b.index);
    return g;
  });
}

/**
 * A veil over the skull: skin-tight, and as dense at each point as `alpha(az, el)` says (0…1), so its edge fades
 * instead of ending. For `tint` materials.
 */
export function veil(key: string, alpha: (az: number, el: number) => number): THREE.BufferGeometry {
  return shared(`veil:${key}`, () => {
    const b = blank([64, 44]);
    const n = b.az.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(b.dirs[i * 3], b.dirs[i * 3 + 1], b.dirs[i * 3 + 2]);
      onSkull(v).multiplyScalar(1.006);
      pos.set([v.x, v.y, v.z], i * 3);
      col.set([1, 1, 1, Math.max(0, Math.min(1, alpha(b.az[i], b.el[i])))], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals(pos, b.index.array), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(b.index);
    return g;
  });
}

const skullGeo = () => sculpt('skull', [56, 40], (_az, _el, v) => { onSkull(v); });

/**
 * A layer lying on the skull (hair, a beard, a hat's lining): `thick(az, el)` is how far it stands off. Where that
 * goes below 0 the surface dips inside the head, so the layer's edge is where the thickness crosses 0 (and that line
 * comes out clean whatever the mesh, because the surface passes through the skull there instead of jumping).
 */
export function layer(key: string, thick: (az: number, el: number) => number, seg: [number, number] = [84, 54]): THREE.BufferGeometry {
  return sculpt(`layer:${key}`, seg, (az, el, v, d) => {
    onSkull(v);
    v.addScaledVector(d, Math.max(-0.07, thick(az, el)));
  });
}
/** A layer's edge: nothing at the line, full thickness a little way in (`inside` = radians inside the line, negative outside). */
export const edge = (inside: number, full: number) => Math.min(full, inside * 1.5);

// ── the face ──
interface Face {
  /** Brows: how high above their rest, and how far the inner ends are raised (+) or pulled down (−). */
  browUp: number;
  browTilt: number;
  eyes: 'dot' | 'arc' | 'wide' | 'small';
  mouth: 'rest' | 'smile' | 'open' | 'wobble' | 'frown';
  blush: boolean;
  /** The head's nod (+ chin down), tilt to a shoulder and turn, in radians. */
  pitch: number;
  roll: number;
  turn: number;
}
export const FACES: Record<Mood, Face> = {
  neutral: { browUp: 0, browTilt: 0, eyes: 'dot', mouth: 'rest', blush: false, pitch: 0, roll: 0, turn: 0 },
  happy: { browUp: 0.035, browTilt: 0.1, eyes: 'arc', mouth: 'smile', blush: true, pitch: -0.03, roll: 0.09, turn: 0 },
  worried: { browUp: 0.05, browTilt: 0.5, eyes: 'small', mouth: 'wobble', blush: false, pitch: 0.1, roll: -0.1, turn: 0.06 },
  angry: { browUp: -0.085, browTilt: -0.55, eyes: 'dot', mouth: 'frown', blush: false, pitch: 0.13, roll: 0, turn: -0.04 },
  excited: { browUp: 0.1, browTilt: 0.12, eyes: 'wide', mouth: 'open', blush: true, pitch: -0.1, roll: -0.06, turn: 0 },
};

/** Where the features sit. */
export const EYE = { az: 0.32, el: -0.07 };
const BROW_EL = 0.2;
const MOUTH_EL = -0.6;

export interface Skin {
  base: string;
  shadow: string;
  light: string;
  /** For lines drawn on the face. */
  crease: string;
}
export function skinOf(L: Look): Skin {
  const base = blend(L.skin[1], L.skin[2], 0.3);
  return { base, shadow: blend(L.skin[0], L.skin[1], 0.5), light: blend(L.skin[1], L.skin[2], 0.7), crease: shade(blend(L.skin[0], L.skin[1], 0.35), -0.05) };
}
/** The brow colour: the hair's dark tone (silver hair gets a grey brow that still shows). */
export function browOf(L: Look): string {
  const tone = colour(blend(L.hair[0], L.hair[1], 0.25));
  const hsl = { h: 0, s: 0, l: 0 };
  tone.getHSL(hsl);
  // silver and white hair: a grey brow that still shows; blond: a sandy brown one
  if (hsl.l > 0.5 && hsl.s < 0.25) return blend(C.ink5, L.hair[0], 0.3);
  if (hsl.l > 0.5) return blend(L.hair[0], C.snd3, 0.78);
  return shade(blend(L.hair[0], L.hair[1], 0.25), -0.03);
}

/** A line drawn along the skull through (azimuth, elevation) points, as a tube. */
export function seam(key: string, pts: [number, number][], radius: number, lift = 0.012): THREE.BufferGeometry {
  return geo.tube(`seam:${key}`, () => pts.map(([az, el]) => surf(az, el, lift)), radius, false, Math.max(12, pts.length * 3));
}

/**
 * What makes one face not quite another's: small leanings of proportion, the same for a person in every mood and
 * at every age (they come from the parts of a look that never change: skin, clothes, backdrop, hair style).
 */
export interface Quirks {
  /** The head a little wider or longer. */
  wide: number;
  long: number;
  eyeGap: number;
  eyeSize: number;
  eyeTall: number;
  nose: number;
  brow: number;
  mouth: number;
}
export function quirksOf(L: Look): Quirks {
  let h = 2166136261;
  for (const ch of JSON.stringify([L.bg, L.skin, L.cloth, L.style])) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = rand(h);
  const around = (spread: number) => 1 + (r() * 2 - 1) * spread;
  return { wide: around(0.05), long: around(0.04), eyeGap: (r() * 2 - 1) * 0.035, eyeSize: around(0.12), eyeTall: around(0.12), nose: around(0.22), brow: around(0.2), mouth: around(0.12) };
}

/** The skull, ears, nose and the face in a mood. `head` is centred on the skull. */
export function face(head: THREE.Object3D, L: Look, mood: Mood) {
  const F = FACES[mood];
  const Q = quirksOf(L);
  const eyeAz = EYE.az + Q.eyeGap;
  const skin = skinOf(L);
  const skinMat = matte(skin.base, 0.72);
  put(head, skullGeo(), skinMat, [0, 0, 0]);
  // ears
  for (const side of [-1, 1]) {
    const ear = mount(head, side * 1.54, -0.12, -0.03);
    put(ear, geo.ball(), skinMat, [0, 0, 0], { s: [0.15, 0.2, 0.1] });
    put(ear, geo.ball(), matte(skin.shadow, 0.8), [side * -0.02, 0, 0.065], { s: [0.07, 0.11, 0.05], ghost: true });
  }
  // nose: a small soft button, a touch warmer than the skin
  const nose = mount(head, 0, -0.3, 0);
  put(nose, geo.ball(), matte(blend(skin.base, C.pnk0, 0.08), 0.72), [0, 0, 0.02], { s: [0.095 * Q.nose, 0.105 * Q.nose, 0.11 * Q.nose] });

  // brows
  const brow = matte(browOf(L), 0.9);
  const heavy = mood === 'angry' ? 1.25 : 1;
  for (const side of [-1, 1]) {
    const b = mount(head, side * (eyeAz + 0.02), BROW_EL + F.browUp, 0.012);
    // inner end up: the outer end drops (and the other way round)
    put(b, geo.pill(), brow, [side * 0.01, 0, 0], { s: [0.3, 0.44 * heavy * Q.brow, 0.3], r: [0, 0, -side * F.browTilt], ghost: true });
  }

  // eyes: big dark beads with a glint toward the key light
  const ink = gloss(C.ink0, 0.2);
  for (const side of [-1, 1]) {
    const e = mount(head, side * eyeAz, EYE.el, 0);
    if (F.eyes === 'arc') {
      // smiling eyes: two arcs
      put(e, eyeArc(), matte(C.ink0, 0.6), [0, -0.04, 0.012], { ghost: true });
    } else {
      const k = F.eyes === 'wide' ? 1.22 : F.eyes === 'small' ? 0.86 : 1;
      put(e, geo.ball(), ink, [0, 0, -0.012], { s: [0.112 * k * Q.eyeSize, 0.15 * k * Q.eyeSize * Q.eyeTall, 0.05], ghost: true });
      put(e, geo.ball(), lit(C.white), [-0.035 * k, 0.055 * k, 0.03], { s: (F.eyes === 'wide' ? 0.044 : 0.034) * k, ghost: true });
      if (F.eyes === 'wide') put(e, geo.ball(), lit(C.white, 0.85), [0.04, -0.055, 0.03], { s: 0.02, ghost: true });
    }
    if (L.bags || L.age === 2) put(e, bagArc(), sheer(skin.crease, 0.5), [0, -0.012, 0.004], { ghost: true });
  }

  // cheeks
  if (F.blush || L.ruddy) {
    const strength = L.ruddy ? (F.blush ? 0.75 : 0.6) : 0.55;
    for (const side of [-1, 1]) {
      const c = mount(head, side * 0.64, -0.36, 0.02);
      put(c, geo.plate(), soft(blend(C.pnk0, C.red3, L.ruddy ? 0.45 : 0.2), strength), [0, 0, 0], { s: [0.24, 0.17, 1], order: 2 });
    }
  }
  if (L.glow || L.age === 3) {
    // the treatments: light on the cheekbones
    for (const side of [-1, 1]) {
      const c = mount(head, side * 0.6, -0.2, 0.02);
      put(c, geo.plate(), soft(blend(skin.light, C.white, 0.6), 0.75), [0, 0, 0], { s: [0.19, 0.09, 1], r: [0, 0, side * 0.35], order: 3 });
    }
  }

  // mouth
  const painted = L.lips !== undefined;
  const lip = painted ? blend(L.lips!, C.red2, 0.2) : blend(C.red2, skin.shadow, 0.3);
  const r = painted ? 0.04 : 0.033;
  const curve = (key: string, w: number, depth: number, el = MOUTH_EL) =>
    seam(`mouth:${key}`, Array.from({ length: 9 }, (_, i) => { const u = i / 4 - 1; return [u * w, el - depth * (1 - u * u)] as [number, number]; }), r);
  if (F.mouth === 'rest') {
    put(head, curve(`rest${r}:${Q.mouth.toFixed(2)}`, 0.17 * Q.mouth, 0.03), matte(painted ? lip : blend(skin.shadow, C.red1, 0.5), 0.8), [0, 0, 0], { ghost: true });
  } else if (F.mouth === 'smile') {
    put(head, curve(`smile${r}`, 0.27, 0.12, MOUTH_EL + 0.055), matte(lip, 0.7), [0, 0, 0], { ghost: true });
  } else if (F.mouth === 'frown') {
    put(head, curve(`frown${r}`, 0.21, -0.1, MOUTH_EL - 0.06), matte(lip, 0.7), [0, 0, 0], { ghost: true });
  } else if (F.mouth === 'wobble') {
    put(head, seam(`mouth:wobble${r}`, [[-0.17, MOUTH_EL - 0.05], [-0.085, MOUTH_EL - 0.005], [0, MOUTH_EL - 0.04], [0.085, MOUTH_EL], [0.17, MOUTH_EL - 0.04]], r), matte(lip, 0.7), [0, 0, 0], { ghost: true });
  } else {
    // open, delighted
    const m = mount(head, 0, MOUTH_EL - 0.02, 0);
    put(m, geo.ball(), matte(blend(C.red0, C.ink0, 0.25), 0.6), [0, 0, 0], { s: [0.18, 0.14, 0.04], ghost: true });
    put(m, geo.ball(), matte(C.pnk0, 0.6), [0, -0.07, 0.016], { s: [0.11, 0.055, 0.03], ghost: true });
    if (painted) put(m, geo.torus(0.16), matte(lip, 0.7), [0, 0, 0.012], { s: [0.18, 0.14, 0.18], ghost: true });
  }

  // what a life leaves on a face
  const lineMat = sheer(skin.crease, 0.26);
  if (L.lines || L.age === 1 || L.age === 2) {
    const deep = L.age === 2 ? 1.25 : 1;
    for (const side of [-1, 1]) {
      // crow's feet
      const c = mount(head, side * (EYE.az + 0.24), EYE.el + 0.005, 0.004);
      put(c, geo.pill(), lineMat, [0, 0.035, 0], { s: [0.085 * deep, 0.13, 0.13], r: [0, 0, side * 0.45], ghost: true, order: 2 });
      put(c, geo.pill(), lineMat, [0, -0.035, 0], { s: [0.085 * deep, 0.13, 0.13], r: [0, 0, side * -0.45], ghost: true, order: 2 });
    }
  }
  if ((L.lines && F.mouth !== 'open') || L.age === 2) {
    for (const side of [-1, 1]) {
      // the fold from the nose to the corner of the mouth
      put(head, seam(`fold:${side}`, [[side * 0.2, -0.36], [side * 0.31, -0.48], [side * 0.34, -0.62]], 0.015, 0.004), lineMat, [0, 0, 0], { ghost: true, order: 2 });
    }
  }
  if (L.age === 2) {
    // a worry line across the forehead
    put(head, seam('forehead', [[-0.22, 0.44], [0, 0.455], [0.22, 0.44]], 0.013, 0.004), lineMat, [0, 0, 0], { ghost: true, order: 2 });
  }
  if (L.freckles) {
    const dot = sheer(blend(skin.shadow, C.snd2, 0.4), 0.75);
    for (const side of [-1, 1]) for (const [a, e] of [[0.4, -0.26], [0.54, -0.22], [0.48, -0.34], [0.64, -0.3], [0.28, -0.22], [0.16, -0.25]]) {
      const f = mount(head, side * a, e, 0.004);
      put(f, geo.ball(), dot, [0, 0, 0], { s: [0.026, 0.026, 0.008], ghost: true, order: 3 });
    }
  }
  if (L.scar) {
    // an old cut through the brow and down the cheek
    put(head, seam('scar-brow', [[0.52, 0.38], [0.5, 0.26], [0.5, 0.14]], 0.014, 0.014), matte(blend(skin.light, C.pnk1, 0.3), 0.7), [0, 0, 0], { ghost: true });
    put(head, seam('scar-cheek', [[0.53, -0.2], [0.56, -0.3], [0.62, -0.42]], 0.014, 0.006), matte(blend(skin.light, C.pnk1, 0.3), 0.7), [0, 0, 0], { ghost: true });
  }
}

const eyeArc = () => geo.tube('eye-arc', () => [-1, -0.5, 0, 0.5, 1].map((u) => new THREE.Vector3(u * 0.12, 0.095 * (1 - u * u), 0)), 0.032, false, 16);
const bagArc = () => geo.tube('eye-bag', () => [-1, 0, 1].map((u) => new THREE.Vector3(u * 0.12, -0.18 - 0.035 * (1 - u * u), 0)), 0.014, false, 10);

// ── things worn on the face and head ──
/** Glasses: round rims with a bridge and arms (`thin`: light wire frames). */
export function glasses(head: THREE.Object3D, thin: boolean) {
  const frame = thin ? gloss(C.ink6, 0.4) : matte(C.ink1, 0.55);
  const tube = thin ? 0.075 : 0.12;
  const R = thin ? 0.185 : 0.175;
  for (const side of [-1, 1]) {
    const e = mount(head, side * EYE.az, EYE.el, 0.1);
    put(e, geo.torus(tube), frame, [0, 0, 0], { s: R, ghost: true });
    // a glint on the glass
    put(e, geo.plate(), lit(C.white, 0.07), [0, 0, 0], { s: R, ghost: true, order: 4 });
    put(e, geo.pill(), lit(C.white, 0.4), [-0.06, 0.08, 0.002], { s: [0.09, 0.08, 0.02], r: [0, 0, 0.7], ghost: true, order: 5 });
    // the arm back to the ear
    const a = surf(side * (EYE.az + 0.24), EYE.el + 0.02, 0.1);
    const b = surf(side * 1.5, 0.04, 0.03);
    const arm = new THREE.Mesh(geo.cyl(), frame);
    arm.position.copy(a).add(b).multiplyScalar(0.5);
    arm.scale.set(thin ? 0.012 : 0.02, a.distanceTo(b), thin ? 0.012 : 0.02);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    head.add(arm);
  }
  const bridge = mount(head, 0, EYE.el + 0.03, 0.1);
  put(bridge, geo.pill(), frame, [0, 0, 0.02], { s: [0.34, thin ? 0.12 : 0.18, thin ? 0.12 : 0.18], ghost: true });
}

/** Beard, stubble, goatee, moustache. */
export function whiskers(head: THREE.Object3D, L: Look, hair: string, hairDark: string) {
  // the jaw from ear to ear, up to under the nose, with the mouth left open
  const jaw = (az: number, el: number) => {
    const a = Math.abs(az);
    const top = a < 0.42 ? -0.42 : a < 0.9 ? -0.42 + ((a - 0.42) / 0.48) * 0.3 : -0.12 + ((a - 0.9) / 0.6) * 0.16;
    const mouth = (az / 0.27) ** 2 + ((el - MOUTH_EL + 0.01) / 0.125) ** 2;
    return Math.min(top - el, (1.5 - a) * 0.9, (mouth - 1) * 0.12);
  };
  if (L.beard) put(head, layer('beard', (az, el) => edge(jaw(az, el), 0.07)), matte(hair, 0.95), [0, 0, 0]);
  else if (L.stubble) put(head, veil('stubble', (az, el) => smooth(-0.02, 0.2, jaw(az, el) + 0.05)), tint(blend(hairDark, C.ink3, 0.45), 0.34), [0, 0, 0], { ghost: true, order: 1 });
  if (L.goatee) {
    const g = mount(head, 0, -0.86, 0);
    put(g, geo.ball(), matte(hair, 0.95), [0, 0, 0.01], { s: [0.15, 0.17, 0.1] });
    const s = mount(head, 0, -0.69, 0);
    put(s, geo.ball(), matte(hair, 0.95), [0, 0, 0], { s: [0.05, 0.05, 0.035] });
  }
  if (L.moustache) {
    // a walrus: two heavy halves drooping past the corners of the mouth
    for (const side of [-1, 1]) {
      const m = mount(head, side * 0.11, -0.42, 0.02);
      put(m, geo.ball(), matte(hair, 0.95), [0, 0, 0], { s: [0.17, 0.085, 0.075], r: [0, 0, side * -0.38] });
    }
  }
}

/** Earrings, earbuds, a headset. */
export function earWear(head: THREE.Object3D, L: Look) {
  if (L.earrings !== undefined) {
    for (const side of [-1, 1]) {
      const e = mount(head, side * 1.5, -0.3, 0.02);
      put(e, geo.ball(), gloss(L.earrings, 0.25), [0, -0.03, 0.04], { s: 0.062 });
    }
  }
  if (L.earbuds) {
    for (const side of [-1, 1]) {
      const e = mount(head, side * 1.5, -0.1, 0.07);
      put(e, geo.ball(), gloss(C.white, 0.3), [0, 0, 0.02], { s: [0.06, 0.07, 0.05] });
      put(e, geo.pill(), gloss(C.white, 0.3), [side * -0.03, -0.09, 0.02], { s: [0.16, 0.2, 0.2], r: [0, 0, Math.PI / 2 - side * 0.25] });
    }
  }
  if (L.headset) {
    // a band over the top, a cup on each ear, a boom to the corner of the mouth
    const band = matte(C.ink4, 0.6);
    put(head, geo.torus(0.034, Math.PI), band, [0, 0.02, -0.04], { s: [1.07, 1.13, 1.07] });
    for (const side of [-1, 1]) {
      const e = mount(head, side * 1.54, -0.08, 0.1);
      put(e, geo.ball(), matte(C.ink3, 0.6), [0, 0, 0], { s: [0.17, 0.23, 0.1] });
      put(e, geo.ball(), matte(C.ink5, 0.6), [0, 0, 0.07], { s: [0.09, 0.13, 0.05] });
    }
    const a = surf(1.4, -0.22, 0.14);
    const b = surf(0.5, -0.56, 0.2);
    const boom = new THREE.Mesh(geo.cyl(), band);
    boom.position.copy(a).add(b).multiplyScalar(0.5);
    boom.scale.set(0.018, a.distanceTo(b), 0.018);
    boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    head.add(boom);
    put(head, geo.ball(), matte(C.red3, 0.5), [b.x, b.y, b.z], { s: [0.055, 0.055, 0.07] });
  }
}
