/**
 * The AIs that are not people and not Bit: the three rivals' models and the minds' envoy. Abstract forms with a
 * face you can read, each built from what it is:
 *   Apex (Meridian)    a faceted red crystal with a visor of light. Sharp, geometric, impatient.
 *   Weft (Lattice)     a round face woven of violet threads on a loom, knots for eyes. Careful, thorough.
 *   Sapling (Orchard)  a green bud with leaves sprouting on top. Open, cheap, a little reckless.
 *   Chorus             a pale face cut in slices like a voiceprint, one voice chosen among millions. Gentle, a little sad.
 */
import * as THREE from 'three';
import type { Mood } from '../../content/events';
import { C } from '../../render/palette';
import { sparkle, wall } from './backdrop';
import { TURN } from './bust';
import type { AvatarId } from './looks';
import { blend, geo, gloss, group, halo, lit, matte, put, rand, shared, soft, stick, type Shot, type V3 } from './parts';

const PI = Math.PI;
const line = (key: string, pts: V3[], r: number) => geo.tube(`avatar:${key}`, () => pts.map((p) => new THREE.Vector3(...p)), r, false, 20);
const nod = (mood: Mood): V3 => [mood === 'worried' ? 0.08 : mood === 'excited' ? -0.08 : mood === 'angry' ? 0.06 : 0, 0, mood === 'happy' ? 0.07 : mood === 'worried' ? -0.07 : 0];

// ── Apex ──
function apex(root: THREE.Group, fig: THREE.Group, mood: Mood) {
  wall(root, [C.red0, blend(C.red0, C.ink0, 0.4), C.ink0], 0);
  // a grid on the floor running to the horizon, red points in the dark above
  const floor = lit(C.red1);
  for (let i = -6; i <= 6; i++) stick(root, floor, [i * 0.9, -1.95, 1], [i * 0.26, -1.18, -4.5], 0.012).castShadow = false;
  for (const [y, z] of [[-1.82, 0], [-1.6, -1.4], [-1.42, -2.6], [-1.28, -3.6]] as const) stick(root, floor, [-4, y, z], [4, y, z], 0.012).castShadow = false;
  const r = rand(4);
  for (let i = 0; i < 9; i++) put(root, geo.ball(), lit(C.red2), [(r() - 0.5) * 4.2, -0.6 + r() * 2.2, -3.5], { s: 0.03, ghost: true });
  halo(root, C.red3, [0, -0.1, -1.5], 4.2, 0.22);
  // shoulders: an angular plinth, its edges lit
  const plinth = put(fig, geo.gem(), matte(C.ink2, 0.5), [0, -3.0, 0], { s: [1.9, 1.5, 1.2] });
  plinth.rotation.y = PI / 4;
  for (const side of [-1, 1]) stick(fig, lit(side < 0 ? C.red3 : C.red2), [0, -1.5, 0.02], [side * 1.34, -2.56, 0.86], 0.02).castShadow = false;
  stick(fig, lit(C.red2), [0, -1.52, 0.04], [0, -2.6, 1.0], 0.016).castShadow = false;
  // the crystal: a tall diamond, faceted, turned a little so one edge leads
  const head = group(fig, [0, -0.12, 0], nod(mood));
  const gem = group(head, [0, 0, 0], [0, 0.34, 0]);
  const W = 1.22;
  const H = 1.5;
  const D = 0.95;
  put(gem, geo.gem(), gloss(C.red3, 0.3), [0, 0, 0], { s: [W, H, D] });
  // edges catching the light
  const top: V3 = [0, H, 0];
  const front: V3 = [0, 0, D];
  const left: V3 = [-W, 0, 0];
  for (const [p0, p1, c] of [[top, left, C.org0], [top, front, C.org1], [left, front, C.org0], [front, [0, -H, 0] as V3, C.red3]] as const) stick(gem, lit(c), p0, p1, 0.016).castShadow = false;
  put(gem, geo.ball(), lit(C.yel2), top, { s: 0.045, ghost: true });
  halo(head, C.org2, [0, H, 0.1], 0.7, 0.7);
  // the visor: a dark band round the middle, a slit of light for each eye on its two front faces
  put(gem, shared('prism4', () => new THREE.CylinderGeometry(1, 1, 1, 4)), gloss(C.ink0, 0.25), [0, 0.03, 0], { s: [W * 1.02, 0.38, D * 1.02] });
  const eye = lit(mood === 'angry' ? C.yel1 : C.white);
  const facing = Math.atan2(D, W);
  for (const side of [-1, 1]) {
    const g = group(gem, [side * W * 0.47, 0.03, D * 0.53 + 0.05], [0, side * facing, 0]);
    const slant = mood === 'angry' ? side * -0.26 : mood === 'worried' ? side * 0.26 : 0;
    if (mood === 'happy' || mood === 'excited') {
      put(g, line('visor-smile', [[-0.26, -0.06, 0], [-0.12, 0.05, 0], [0.12, 0.05, 0], [0.26, -0.06, 0]], 0.04), eye, [0, 0, 0], { ghost: true });
    } else {
      put(g, geo.box(0.3), eye, [0, 0, 0], { s: [0.56, 0.1, 0.03], r: [0, 0, slant], ghost: true });
      put(g, geo.ball(), lit(C.org2), [side * 0.3, slant * side * 0.3, 0], { s: 0.04, ghost: true });
    }
    halo(g, mood === 'angry' ? C.yel1 : C.org2, [0, 0, 0.04], 0.6, 0.45);
  }
  if (mood === 'excited') for (const [x, y] of [[-1.5, 0.5], [1.5, 0.5], [-1.62, -0.42], [1.62, -0.42]] as const) sparkle(root, [x, y, 0.2], 0.12, C.yel1, C.org1);
  // a mouth: a notch across the two lower front facets (u toward the side corner, v toward the bottom tip)
  const on = (side: number, u: number, v: number): V3 => [side * W * u, -H * v, D * (1 - u - v) + 0.035];
  const lift = mood === 'happy' || mood === 'excited' ? 0.1 : mood === 'angry' || mood === 'worried' ? -0.1 : 0;
  for (const side of [-1, 1]) stick(gem, lit(C.ink0), on(side, 0.3, 0.4 - lift * 0.5), on(side, 0, 0.42 + lift * 0.5), 0.035).castShadow = false;
}

// ── Weft ──
function weft(root: THREE.Group, fig: THREE.Group, mood: Mood) {
  wall(root, [C.vio1, blend(C.vio2, C.vio1, 0.3), C.vio2], 0.35);
  // the loom: warp threads strung top to bottom, a beam across the bottom
  for (let i = -7; i <= 7; i++) stick(root, lit(i % 2 ? C.vio3 : blend(C.vio3, C.vio4, 0.5)), [i * 0.36, -2.4, -2.6], [i * 0.36, 2.2, -2.6], 0.014).castShadow = false;
  put(root, geo.box(0.3), matte(C.snd3, 0.8), [0, -1.86, -0.9], { s: [5, 0.26, 0.3] });
  // the threads the face is woven from, hanging down to the beam
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.2;
    stick(fig, matte(i % 2 ? C.vio5 : C.pnk1, 0.9), [x, -1.2, 0.1], [x * 1.25, -1.9, -0.4], 0.028);
  }
  const head = group(fig, [0, -0.12, 0], nod(mood));
  const R = 1.2;
  const D = 0.6;
  // the cloth: a round cushion, over-under threads across and down it
  put(head, geo.orb(), matte(C.vio3, 0.95), [0, 0, 0], { s: [R * 0.985, R * 0.985, R * D * 0.97] });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * 2 - 1;
    const rr = Math.sqrt(1 - t * t) * R;
    // weft (across) and warp (down)
    put(head, geo.torus(0.055 / Math.max(0.3, rr / R)), matte(i % 2 ? C.vio5 : C.pnk1, 0.95), [0, t * R, 0], { s: [rr, rr * D, rr], r: [PI / 2, 0, 0] });
    put(head, geo.torus(0.05 / Math.max(0.3, rr / R)), matte(i % 2 ? C.vio4 : C.vio5, 0.95), [t * R, 0, 0], { s: [rr * D, rr, rr], r: [0, PI / 2, 0] });
  }
  // the frame: a gold hoop with beads
  put(head, geo.torus(0.045), gloss(C.yel0, 0.3), [0, 0, 0], { s: R + 0.08 });
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * PI * 2;
    put(head, geo.ball(), gloss(C.yel2, 0.3), [Math.cos(ang) * (R + 0.08), Math.sin(ang) * (R + 0.08), 0.03], { s: 0.07 });
  }
  // eyes and mouth: dark knots tied into the cloth, each with a bright bead
  const knot = matte(C.vio0, 0.8);
  const z = R * D + 0.02;
  const ey = 0.16;
  for (const side of [-1, 1]) {
    const x = side * 0.42;
    if (mood === 'happy' || mood === 'excited') {
      put(head, line('weft-smile', [[-0.19, -0.07, 0], [-0.09, 0.06, 0], [0.09, 0.06, 0], [0.19, -0.07, 0]], 0.05), knot, [x, ey, z - 0.03], { ghost: true });
    } else {
      put(head, geo.ball(), knot, [x, ey, z - 0.06], { s: [0.16, 0.18, 0.09] });
      put(head, geo.ball(), lit(C.white), [x - 0.035, ey + 0.05, z + 0.02], { s: 0.04, ghost: true });
      if (mood === 'worried' || mood === 'angry') put(head, geo.pill(), knot, [x, ey + 0.32, z - 0.05], { s: [0.34, 0.36, 0.2], r: [0, 0, side * (mood === 'worried' ? -0.36 : 0.4)] });
    }
  }
  const my = -0.42;
  if (mood === 'excited') {
    put(head, geo.ball(), knot, [0, my, z - 0.04], { s: [0.2, 0.14, 0.06] });
    put(head, geo.ball(), matte(C.pnk0, 0.7), [0, my - 0.05, z + 0.01], { s: [0.1, 0.05, 0.03], ghost: true });
    for (const [x, y] of [[-1.6, 1.1], [1.6, 1.0], [-1.66, -0.9], [1.66, -1.0]] as const) sparkle(root, [x, y, 0.2], 0.12, C.yel1, C.yel0);
  } else if (mood === 'happy') {
    put(head, line('weft-mouth-smile', [[-0.26, 0.07, 0], [-0.13, -0.04, 0], [0.13, -0.04, 0], [0.26, 0.07, 0]], 0.045), knot, [0, my, z - 0.03], { ghost: true });
  } else if (mood === 'worried' || mood === 'angry') {
    // a wavering stitch
    put(head, line('weft-mouth-waver', [[-0.28, -0.04, 0], [-0.17, 0.04, 0], [-0.06, -0.04, 0], [0.06, 0.04, 0], [0.17, -0.04, 0], [0.28, 0.04, 0]], 0.04), knot, [0, my, z - 0.03], { ghost: true });
  } else {
    // a neat row of stitches
    for (const x of [-0.2, 0, 0.2]) put(head, geo.pill(), knot, [x, my, z - 0.04], { s: [0.15, 0.32, 0.2] });
  }
}

// ── Sapling ──
function sapling(root: THREE.Group, fig: THREE.Group, mood: Mood) {
  wall(root, [C.grn1, blend(C.grn2, C.grn3, 0.4)], 0.5);
  const r = rand(6);
  for (let i = 0; i < 9; i++) {
    const tint = [C.yel1, C.grn7, C.grn6, C.yel0, C.white][i % 5];
    const p: V3 = [(r() < 0.5 ? -1 : 1) * (1.25 + r() * 0.5), -1.2 + r() * 2.6, -1.5];
    put(root, geo.ball(), lit(tint), p, { s: 0.025 + r() * 0.02, ghost: true });
    halo(root, tint, p, 0.22, 0.4);
  }
  // shoulders: two broad leaves cupping the head
  for (const side of [-1, 1]) {
    const leaf = group(fig, [side * 0.95, -2.2, 0.05], [0.25, side * -0.3, side * -0.72]);
    put(leaf, geo.orb(), matte(side < 0 ? C.grn4 : C.grn3, 0.85), [0, 0, 0], { s: [1.35, 0.5, 0.82] });
    put(leaf, geo.pill(), matte(side < 0 ? C.grn6 : C.grn5, 0.85), [0, 0.4, 0.3], { s: [2.1, 0.22, 0.22], r: [0, 0.3, 0], ghost: true });
  }
  const head = group(fig, [0, -0.3, 0], nod(mood));
  // the bud, with a seam where it is opening
  put(head, geo.orb(), matte(C.grn6, 0.7), [0, 0, 0], { s: [1.18, 1.08, 1.1] });
  put(head, line('bud-seam', [[0.02, 1.07, 0.1], [-0.04, 0.98, 0.42], [0.03, 0.82, 0.68], [-0.02, 0.62, 0.9]], 0.022), matte(C.grn4, 0.8), [0, 0, 0.012], { ghost: true });
  put(head, geo.plate(), soft(C.grn8, 0.6), [-0.5, 0.56, 0.86], { s: [0.3, 0.2, 1], r: [-0.5, -0.5, 0.4], order: 2 });
  // the stem and its leaves (they droop when worried, stand up when angry or excited)
  const droop = mood === 'worried';
  const perk = mood === 'angry' || mood === 'excited';
  const lift = droop ? -0.55 : perk ? 0.62 : 0.2;
  stick(head, matte(C.grn4, 0.8), [0, 1.0, 0], [0, 1.34, 0], 0.05);
  for (const side of [-1, 1]) {
    const leaf = group(head, [0, 1.3, 0], [0, side * -0.2, side * lift]);
    put(leaf, geo.orb(), matte(C.grn7, 0.8), [side * 0.46, 0, 0], { s: [0.5, 0.09, 0.26] });
    put(leaf, geo.pill(), matte(C.grn8, 0.8), [side * 0.46, 0.085, 0], { s: [0.74, 0.12, 0.12], ghost: true });
  }
  if (mood === 'excited') put(head, geo.orb(), matte(C.grn8, 0.8), [0, 1.5, 0], { s: [0.1, 0.2, 0.1] });
  // big friendly eyes
  const ink = gloss(C.ink0, 0.2);
  const ey = 0.02;
  const z = 1.02;
  for (const side of [-1, 1]) {
    const x = side * 0.4;
    const g = group(head, [x, ey, z], [0, side * 0.33, 0]);
    if (mood === 'happy' || mood === 'excited') {
      put(g, line('bud-smile', [[-0.15, -0.06, 0], [-0.075, 0.05, 0], [0.075, 0.05, 0], [0.15, -0.06, 0]], 0.04), matte(C.ink0, 0.6), [0, 0, 0], { ghost: true });
      put(g, geo.plate(), soft(C.pnk1, 0.7), [side * 0.2, -0.32, -0.02], { s: [0.24, 0.16, 1], order: 2 });
    } else {
      put(g, geo.ball(), ink, [0, 0, -0.04], { s: [0.15, 0.19, 0.07], ghost: true });
      put(g, geo.ball(), lit(C.white), [-0.05, 0.07, 0.035], { s: 0.048, ghost: true });
      if (mood === 'worried' || mood === 'angry') put(g, geo.pill(), matte(mood === 'worried' ? C.grn3 : C.grn2, 0.8), [0, 0.3, 0], { s: [0.34, 0.34, 0.2], r: [0, 0, side * (mood === 'worried' ? -0.4 : 0.45)], ghost: true });
    }
  }
  const my = -0.42;
  const mz = 1.05;
  const lip = matte(C.ink0, 0.6);
  if (mood === 'excited') {
    put(head, geo.ball(), matte(C.grn1, 0.6), [0, my, mz - 0.02], { s: [0.18, 0.14, 0.05], ghost: true });
    put(head, geo.ball(), matte(C.pnk0, 0.6), [0, my - 0.06, mz + 0.01], { s: [0.1, 0.05, 0.03], ghost: true });
    for (const [x, y] of [[-1.5, 0.6], [1.56, 0.2], [-1.4, -0.9]] as const) sparkle(root, [x, y, 0.3], 0.12, C.yel1, C.yel0);
  } else if (mood === 'happy') put(head, line('bud-mouth-smile', [[-0.22, 0.06, -0.03], [-0.11, -0.03, 0], [0.11, -0.03, 0], [0.22, 0.06, -0.03]], 0.035), lip, [0, my, mz], { ghost: true });
  else if (mood === 'worried') put(head, line('bud-mouth-worry', [[-0.16, -0.03, -0.02], [-0.05, 0.03, 0], [0.06, -0.02, 0], [0.16, 0.0, -0.02]], 0.032), lip, [0, my, mz], { ghost: true });
  else if (mood === 'angry') put(head, line('bud-mouth-frown', [[-0.2, -0.05, -0.03], [0, 0.04, 0], [0.2, -0.05, -0.03]], 0.035), lip, [0, my, mz], { ghost: true });
  else put(head, line('bud-mouth-rest', [[-0.14, 0.015, -0.02], [0, -0.015, 0], [0.14, 0.015, -0.02]], 0.032), matte(C.grn3, 0.7), [0, my, mz], { ghost: true });
}

// ── Chorus ──
function chorus(root: THREE.Group, fig: THREE.Group, mood: Mood) {
  wall(root, [C.blu0, blend(C.blu1, C.blu2, 0.3)], 0.4);
  // the many: a grid of faint points, brighter toward the face
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const x = i * 0.44;
    const y = -0.2 + j * 0.44;
    const d = Math.hypot(x, y);
    put(root, geo.ball(), lit(d < 1.8 ? C.blu4 : d < 2.4 ? C.blu3 : C.blu2), [x, y, -2.8], { s: 0.022, ghost: true });
  }
  // the shoulders: a voiceprint of bars rising toward the neck
  for (let i = -8; i <= 8; i++) {
    const x = i * 0.2;
    const h = Math.max(0.12, 1.02 - Math.abs(i) * 0.1 + ((i * i * 7) % 5) * 0.06);
    put(fig, geo.box(0.3), matte(i < 0 ? C.blu5 : C.blu4, 0.7), [x, -2.62 + h / 2, 0], { s: [0.14, h + 0.8, 0.3] });
    put(fig, geo.box(0.3), lit(C.cyn5), [x, -2.23 + h, 0], { s: [0.14, 0.05, 0.3], ghost: true });
  }
  put(fig, geo.cyl(), matte(C.blu3, 0.7), [0, -1.3, 0], { s: [0.26, 0.5, 0.26] });
  const head = group(fig, [0, -0.1, 0], nod(mood));
  // the face: a pale oval in slices, each a little out of step with the next, like a waveform
  const n = 17;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * 2 - 1;
    const ripple = Math.abs(t) < 0.8 ? [0, 0.045, 0, -0.045][i % 4] : 0;
    const w = Math.sqrt(1 - t * t) * 0.98 + ripple;
    put(head, geo.orb(), matte(i % 3 === 0 ? C.ice2 : C.white, 0.55), [0, t * 1.24, 0], { s: [w, 0.068, w * 0.9] });
  }
  put(head, geo.orb(), matte(blend(C.ice1, C.ice2, 0.5), 0.7), [0, 0, 0], { s: [0.93, 1.21, 0.83] });
  const ink = matte(C.blu0, 0.6);
  const z = 0.94;
  const ey = 0.1;
  const dash = (key: string, pts: [number, number][], x: number, y: number, m: THREE.Material = ink, r = 0.046) => put(head, line(key, pts.map(([px, py]) => [px, py, -Math.abs(px + x) * 0.22] as V3), r), m, [x, y, z], { ghost: true });
  for (const side of [-1, 1]) {
    const x = side * 0.36;
    if (mood === 'happy' || mood === 'excited') {
      // eyes closed in a smile
      dash(`ch-smile${side}`, [[-0.15, -0.06], [0, 0.06], [0.15, -0.06]], x, ey, ink, 0.05);
      put(head, geo.plate(), soft(C.pnk1, 0.7), [side * 0.56, -0.2, z - 0.14], { s: [0.22, 0.14, 1], r: [0, side * 0.5, 0], order: 2 });
    } else {
      // dark, glassy eyes; a little sad even at rest (the outer corners low, the brows raised in the middle)
      const big = mood === 'angry' ? 0.8 : 1;
      put(head, geo.ball(), gloss(C.blu0, 0.2), [x, ey, z - 0.1], { s: [0.12, 0.15 * big, 0.07], r: [0, 0, side * -0.18], ghost: true });
      put(head, geo.ball(), lit(mood === 'worried' ? C.cyn6 : C.white), [x - 0.035, ey + 0.05, z - 0.02], { s: 0.036, ghost: true });
      const slope = mood === 'angry' ? -0.16 : mood === 'worried' ? 0.17 : 0.08;
      dash(`ch-brow-${mood}${side}`, [[side * 0.17, 0], [side * -0.13, slope]], x, ey + (mood === 'angry' ? 0.2 : 0.27), mood === 'neutral' ? matte(C.blu3, 0.6) : ink, mood === 'neutral' ? 0.032 : 0.042);
    }
  }
  if (mood === 'worried') {
    // a tear
    put(head, geo.ball(), lit(C.cyn5), [-0.32, ey - 0.28, z - 0.04], { s: [0.04, 0.065, 0.04], ghost: true });
    halo(head, C.cyn6, [-0.32, ey - 0.28, z], 0.3, 0.6);
  }
  if (mood === 'excited') for (const [x, y] of [[-1.5, 1.2], [1.5, 1.1], [-1.6, -0.5], [1.62, -0.4], [1.2, 1.5]] as const) sparkle(root, [x, y, 0.2], 0.11, C.white, C.cyn6);
  // the mouth: a waveform
  const wave: Record<Mood, number[]> = {
    neutral: [0, 0, 0, -1, 0, 1, 0, 0, 0],
    happy: [1, 0, -1, -1, -1, -1, -1, 0, 1],
    worried: [-1, 0, 1, 0, -1, 0, 1, 0, -1],
    angry: [-1, 1, -1, 1, -1, 1, -1, 1, -1],
    excited: [0, 1, -1, 1, -2, 1, -1, 1, 0],
  };
  const k = mood === 'angry' ? 0.035 : 0.05;
  dash(`ch-mouth-${mood}`, wave[mood].map((v, i) => [(i - 4) * 0.08, v * k] as [number, number]), 0, -0.52, ink, 0.036);
}

export function avatarShot(id: AvatarId, mood: Mood): Shot {
  const root = new THREE.Group();
  const fig = new THREE.Group();
  fig.rotation.y = TURN * 0.8;
  root.add(fig);
  if (id === 'apex') apex(root, fig, mood);
  else if (id === 'weft') weft(root, fig, mood);
  else if (id === 'sapling') sapling(root, fig, mood);
  else chorus(root, fig, mood);
  return { root };
}
