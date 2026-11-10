/**
 * Bit, the player's AI, in its six bodies (see `bitModel` in looks.ts): the grey desk robot of Act I, the pearl and
 * the glass shells, the oracle, the little planet and the eclipse, and Act V's two endings. Whatever the body, the
 * face is the same and that is what makes it Bit: two big glowing eyes and a small mouth, drawn in light.
 */
import * as THREE from 'three';
import type { Mood } from '../../content/events';
import { C } from '../../render/palette';
import { earth, sparkle, stars, wall } from './backdrop';
import { TURN } from './bust';
import type { BitModel } from './looks';
import { sculpt } from './head';
import { additive, blend, geo, gloss, group, halo, lit, matte, put, rand, stick, type Shot, type V3 } from './parts';

const PI = Math.PI;
const FRONT = new THREE.Vector3(0, 0, 1);

/**
 * A plate set into a round shell: the shell's own front, a hair proud of it, out to `w` radians either side and `h`
 * up and down (scale it exactly as the shell). Sculpted, so its edge is clean where two balls would cut a jagged one.
 */
const plate = (w: number, h: number) =>
  sculpt(`plate:${w}:${h}`, [96, 64], (az, el, v) => {
    // a gentle ramp through the shell's surface: the edge lands on the line whatever the mesh
    v.multiplyScalar(1 + Math.max(-0.07, Math.min(0.016, (1 - Math.hypot(az / w, el / h)) * 0.11)));
  });

/** A line of light through points in the face's plane. */
const stroke = (key: string, pts: [number, number][], r: number) => geo.tube(`glyph:${key}`, () => pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), r, false, 20);

/**
 * Bit's face, drawn in light on a plane facing +Z: `a` is the bright core colour, `b` the softer one round it.
 * Sizes are for a face about 1.6 wide; `s` scales it.
 */
export function glowFace(parent: THREE.Object3D, mood: Mood, a: number | string, b: number | string, at: V3, s = 1, asleep = false) {
  const g = group(parent, at);
  g.scale.setScalar(s);
  const A = lit(a);
  const B = lit(b);
  const ex = 0.4;
  const ey = 0.12;
  if (asleep) {
    for (const side of [-1, 1]) put(g, geo.pill(), B, [side * ex, ey - 0.05, 0], { s: [0.3, 0.3, 0.1], ghost: true });
    put(g, stroke('zed', [[0.52, 0.5], [0.72, 0.5], [0.52, 0.3], [0.72, 0.3]], 0.022), B, [0, 0, 0], { ghost: true });
    return;
  }
  for (const side of [-1, 1]) {
    if (mood === 'happy' || mood === 'excited') {
      put(g, stroke('eye-up', [[-0.17, -0.06], [-0.09, 0.07], [0, 0.11], [0.09, 0.07], [0.17, -0.06]], 0.05), A, [side * ex, ey, 0], { ghost: true });
    } else if (mood === 'worried') {
      put(g, geo.box(0.35), A, [side * ex, ey - 0.03, 0], { s: [0.17, 0.25, 0.04], ghost: true });
      put(g, geo.pill(), B, [side * (ex + 0.02), ey + 0.3, 0], { s: [0.34, 0.26, 0.1], r: [0, 0, side * -0.38], ghost: true });
    } else if (mood === 'angry') {
      put(g, geo.box(0.35), A, [side * ex, ey - 0.04, 0], { s: [0.27, 0.16, 0.04], ghost: true });
      put(g, geo.pill(), B, [side * (ex - 0.01), ey + 0.21, 0], { s: [0.38, 0.3, 0.1], r: [0, 0, side * 0.42], ghost: true });
    } else {
      put(g, geo.box(0.42), B, [side * ex, ey, 0], { s: [0.25, 0.36, 0.04], ghost: true });
      put(g, geo.box(0.42), A, [side * ex, ey - 0.02, 0.012], { s: [0.12, 0.22, 0.04], ghost: true });
      put(g, geo.ball(), lit(C.white), [side * ex + 0.055, ey + 0.115, 0.03], { s: 0.035, ghost: true });
    }
  }
  const my = -0.36;
  if (mood === 'excited') {
    put(g, geo.box(0.45), B, [0, my - 0.02, 0], { s: [0.4, 0.22, 0.04], ghost: true });
    put(g, geo.box(0.45), A, [0, my + 0.03, 0.012], { s: [0.26, 0.08, 0.04], ghost: true });
    for (const [x, y] of [[-0.82, 0.48], [0.82, 0.48], [-0.72, 0.62], [0.72, 0.62]] as const) put(g, geo.gem(), B, [x, y, 0], { s: [0.035, 0.07, 0.02], ghost: true });
  } else if (mood === 'worried') {
    put(g, stroke('mouth-worry', [[-0.2, -0.02], [-0.1, 0.035], [0.03, 0], [0.2, 0]], 0.04), B, [0, my - 0.03, 0], { ghost: true });
  } else if (mood === 'angry') {
    put(g, stroke('mouth-flat', [[-0.21, -0.03], [0, 0.03], [0.21, -0.03]], 0.04), B, [0, my - 0.03, 0], { ghost: true });
  } else {
    put(g, stroke('mouth-smile', [[-0.24, 0.06], [-0.13, -0.03], [0, -0.06], [0.13, -0.03], [0.24, 0.06]], 0.042), A, [0, my, 0], { ghost: true });
  }
}

/** A ring of light with a soft glow of its own (two tori: a core and a wide faint one). */
function lightRing(parent: THREE.Object3D, c: number | string, p: V3, radius: number, tube: number, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) {
  put(parent, geo.torus(tube / radius), lit(c), p, { s: [radius * s[0], radius * s[1], radius * s[2]], r, ghost: true });
  put(parent, geo.torus((tube * 3.2) / radius), additive(c, 0.22), p, { s: [radius * s[0], radius * s[1], radius * s[2]], r, ghost: true });
}

// ── Bit-0…3: the desk robot ──
function classic(root: THREE.Group, fig: THREE.Group, gen: number, mood: Mood) {
  wall(root, gen >= 2 ? [blend(C.ink2, C.blu0, 0.35), blend(C.ink3, C.blu2, 0.3)] : [C.ink2, C.ink3], 0.4);
  const shell = gen >= 2 ? blend(C.blu5, C.blu4, 0.2) : blend(C.ink7, C.ink8, 0.4);
  const dark = gen >= 2 ? C.blu3 : C.ink5;
  const glowC = gen === 0 ? C.ink6 : gen >= 3 ? C.yel1 : C.cyn5;
  const body = gloss(shell, gen >= 2 ? 0.45 : 0.6);
  const trim = matte(dark, 0.6);
  const round = gen >= 2 ? 0.34 : 0.14;
  // body and neck
  put(fig, geo.box(gen >= 2 ? 0.3 : 0.14), body, [0, -2.3, 0], { s: [2.0, 1.4, 1.25] });
  put(fig, geo.cyl(), trim, [0, -1.45, 0], { s: [0.3, 0.5, 0.3] });
  put(fig, geo.torus(0.16), trim, [0, -1.58, 0], { s: [0.46, 0.46, 0.5], r: [PI / 2, 0, 0] });
  put(fig, geo.ball(), lit(glowC), [-0.45, -1.98, 0.64], { s: 0.075, ghost: true });
  if (gen > 0) halo(fig, glowC, [-0.45, -1.98, 0.68], 0.5, 0.5);
  for (const x of [0.2, 0.42, 0.64]) put(fig, geo.box(0.3), trim, [x, -1.98, 0.63], { s: [0.12, 0.05, 0.04], ghost: true });
  // head, with its ear bolts
  const head = group(fig, [0, -0.28, 0], [mood === 'worried' ? 0.07 : mood === 'excited' ? -0.07 : 0, 0, mood === 'happy' ? 0.07 : mood === 'worried' ? -0.07 : 0]);
  put(head, geo.box(round), body, [0, 0, 0], { s: [2.36, 1.86, 1.5] });
  for (const side of [-1, 1]) {
    put(head, geo.cyl(), trim, [side * 1.2, 0, 0], { s: [0.24, 0.18, 0.24], r: [0, 0, PI / 2] });
    put(head, geo.cyl(), body, [side * 1.3, 0, 0], { s: [0.13, 0.1, 0.13], r: [0, 0, PI / 2] });
  }
  // the screen
  put(head, geo.box(gen >= 2 ? 0.3 : 0.16), gloss(gen === 0 ? C.ink1 : blend(C.cyn1, C.cyn0, 0.45), 0.2), [0, -0.02, 0.71], { s: [1.94, 1.44, 0.14] });
  if (gen > 0) put(head, geo.pill(), lit(C.cyn6, 0.35), [-0.62, 0.52, 0.785], { s: [0.4, 0.22, 0.02], r: [0, 0, 0.5], ghost: true });
  glowFace(head, mood, gen === 0 ? glowC : gen >= 3 ? C.yel2 : C.cyn6, glowC, [0, -0.04, 0.8], 1.05, gen === 0);
  // the antenna
  stick(head, trim, [0, 0.9, 0], [0, 1.28, 0], 0.05);
  put(head, geo.ball(), gen === 0 ? matte(glowC) : lit(glowC), [0, 1.38, 0], { s: gen >= 2 ? 0.17 : 0.13, ghost: true });
  if (gen > 0) halo(head, glowC, [0, 1.38, 0.2], 0.9, 0.6);
  if (gen >= 3) put(head, geo.torus(0.1), gloss(C.yel0, 0.3), [0, 1.38, 0], { s: 0.32, r: [PI / 2 - 0.35, 0, 0.2], ghost: true });
}

// ── Bit-4 (pearl) and Bit-5 (dark glass) ──
function next(root: THREE.Group, fig: THREE.Group, gen: number, mood: Mood) {
  const five = gen >= 5;
  wall(root, five ? [C.night1, C.night3] : [C.blu0, blend(C.blu1, C.blu2, 0.5)], five ? 0.5 : 0.35);
  stars(root, five ? 51 : 41, five ? 12 : 4, five ? [C.white, C.cyn6, C.yel1, C.blu5] : [C.blu3, C.blu4]);
  const shell = five ? gloss(blend(C.blu1, C.blu0, 0.3), 0.16) : gloss(C.ice3, 0.3);
  const under = five ? matte(C.night1, 0.5) : matte(C.ice0, 0.6);
  const a = five ? C.white : C.vio5;
  const b = five ? C.cyn6 : C.pnk1;
  // shoulders with a glowing core, and the neck
  put(fig, geo.orb(), shell, [0, -2.72, 0], { s: [1.5, 1.05, 0.95] });
  put(fig, geo.ball(), lit(five ? C.yel1 : C.cyn5), [0, -1.98, 0.74], { s: 0.11, ghost: true });
  halo(fig, five ? C.yel1 : C.cyn5, [0, -1.98, 0.8], 0.75, 0.6);
  put(fig, geo.cyl(), under, [0, -1.5, 0], { s: [0.32, 0.5, 0.32] });
  put(fig, geo.torus(0.12), five ? lit(C.cyn5) : matte(C.ice1, 0.5), [0, -1.52, 0], { s: [0.36, 0.36, 0.4], r: [PI / 2, 0, 0], ghost: true });
  const head = group(fig, [0, -0.3, 0], [mood === 'worried' ? 0.08 : mood === 'excited' ? -0.08 : 0, 0, mood === 'happy' ? 0.07 : mood === 'worried' ? -0.07 : 0]);
  if (five) halo(root, C.cyn5, [0, -0.3, -1.2], 3.2, 0.14);
  put(head, geo.orb(), shell, [0, 0, 0], { s: [1.26, 1.1, 1.12] });
  // the face plate, set into the shell
  put(head, plate(0.98, 0.74), gloss(five ? C.night0 : C.vio0, 0.22), [0, 0, 0], { s: [1.26, 1.1, 1.12] });
  if (five) {
    // light leaks round the plate; faint circuitry in the glass
    for (const [p0, p1] of [[[-0.74, -0.42, 1.0], [-0.5, -0.42, 1.08]], [[-0.5, -0.42, 1.08], [-0.42, -0.52, 1.1]], [[0.46, 0.42, 1.08], [0.72, 0.42, 1.0]], [[0.72, 0.42, 1.0], [0.72, 0.26, 1.02]]] as [V3, V3][]) stick(head, lit(C.blu3), p0, p1, 0.012).castShadow = false;
    for (const side of [-1, 1]) lightRing(head, C.cyn4, [side * 1.36, -0.02, 0], 0.2, 0.035, [0, PI / 2, 0]);
    // a halo instead of an antenna
    lightRing(head, C.yel0, [0, 1.34, 0], 0.72, 0.035, [PI / 2 - 0.22, 0, 0]);
  } else {
    // ear fins, and the seam the campus Bit wears round its middle
    for (const side of [-1, 1]) {
      put(head, geo.box(0.3), gloss(C.cyn4, 0.35), [side * 1.32, -0.02, -0.02], { s: [0.2, 0.74, 0.5] });
      put(head, geo.box(0.3), lit(C.cyn6), [side * 1.43, -0.02, -0.02], { s: [0.03, 0.56, 0.3], ghost: true });
    }
    put(head, geo.torus(0.022), matte(C.ink6, 0.5), [0, 0.86, 0], { s: [0.84, 0.76, 1], r: [PI / 2, 0, 0], ghost: true });
    // a floating orb
    put(head, geo.ball(), lit(C.vio5), [0, 1.42, 0], { s: 0.16, ghost: true });
    put(head, geo.ball(), lit(C.white), [-0.05, 1.47, 0.12], { s: 0.045, ghost: true });
    halo(head, C.vio5, [0, 1.42, 0.2], 1.0, 0.7);
    for (const [x, y] of [[-0.34, 1.34], [0.36, 1.46]] as const) put(head, geo.ball(), lit(C.vio3), [x, y, 0], { s: 0.03, ghost: true });
  }
  glowFace(head, mood, a, b, [0, -0.04, 1.16], 0.95);
}

// ── Bit-6 (the Oracle) and Bit-7 (a head of light) ──
function oracle(root: THREE.Group, fig: THREE.Group, gen: number, mood: Mood) {
  const seven = gen >= 7;
  if (seven) wall(root, [C.dusk4, C.dusk2, C.night2], 0);
  else wall(root, [C.dusk0, blend(C.dusk1, C.dusk2, 0.35)], 0.45);
  stars(root, seven ? 71 : 61, 10, seven ? [C.white, C.yel1, C.cyn6, C.pnk1] : [C.white, C.cyn6, C.vio5, C.yel1]);
  const shell = seven ? gloss(C.white, 0.35) : gloss(blend(C.yel2, C.ice2, 0.25), 0.3);
  const a = seven ? C.white : C.yel2;
  const b = seven ? C.cyn6 : C.yel1;
  if (!seven) {
    // the aura: faint rings behind the head
    put(root, geo.torus(0.006), lit(C.dusk3, 0.8), [0, -0.3, -2.4], { s: 2.2, ghost: true });
    put(root, geo.torus(0.01), lit(C.dusk2), [0, -0.3, -2.5], { s: 2.6, ghost: true });
  } else {
    halo(root, C.pnk1, [0, -0.25, -1.4], 3.3, 0.22);
    halo(root, C.white, [0, -0.25, -1.2], 2.7, 0.2);
  }
  // shoulders of light floating below the head, a core glowing in the chest
  put(fig, geo.orb(), shell, [0, -2.86, 0], { s: seven ? [1.0, 0.8, 0.72] : [1.3, 0.92, 0.85] });
  put(fig, geo.ball(), lit(seven ? C.cyn6 : C.yel1), [0, -2.2, seven ? 0.48 : 0.6], { s: 0.1, ghost: true });
  halo(fig, seven ? C.cyn6 : C.yel1, [0, -2.2, 0.7], 0.8, 0.6);
  // the head floats free
  const head = group(fig, [0, -0.25, 0], [mood === 'worried' ? 0.08 : mood === 'excited' ? -0.08 : 0, 0, mood === 'happy' ? 0.07 : mood === 'worried' ? -0.07 : 0]);
  put(head, geo.orb(), shell, [0, 0, 0], { s: [1.2, 1.06, 1.1] });
  put(head, plate(0.96, 0.72), gloss(seven ? C.vio1 : C.vio0, 0.25), [0, 0, 0], { s: [1.2, 1.06, 1.1] });
  // the rim round the plate
  put(head, plate(1.01, 0.77), seven ? lit(C.pnk1) : gloss(C.yel0, 0.3), [0, 0, 0], { s: [1.196, 1.056, 1.096] });
  for (const side of [-1, 1]) {
    put(head, geo.ball(), lit(seven ? C.cyn5 : C.yel1), [side * 1.34, 0, 0], { s: 0.16, ghost: true });
    halo(head, seven ? C.cyn5 : C.yel1, [side * 1.34, 0, 0.2], 0.8, 0.6);
  }
  if (seven) {
    // a ring in orbit round it and a crown of stars
    lightRing(head, C.cyn6, [0, -0.5, 0], 1.72, 0.022, [PI / 2 - 0.2, 0.12, 0]);
    const crown: [number, number, number][] = [[-0.86, 1.02, C.cyn6], [-0.46, 1.3, C.white], [0, 1.42, C.yel1], [0.46, 1.3, C.white], [0.86, 1.02, C.pnk1]];
    for (const [x, y, c] of crown) sparkle(head, [x, y, 0.1], c === C.yel1 ? 0.2 : 0.12, C.white, c);
  } else {
    // a little antenna array under a halo
    for (const [x, c, h] of [[-0.42, C.cyn6, 0.22], [0, C.yel1, 0.34], [0.42, C.pnk1, 0.22]] as const) {
      const y0 = Math.sqrt(1 - (x / 1.2) ** 2) * 1.04;
      stick(head, matte(C.ink9, 0.5), [x, y0, 0], [x, y0 + h, 0], 0.025);
      put(head, geo.ball(), lit(c), [x, y0 + h + 0.04, 0], { s: 0.06, ghost: true });
    }
    lightRing(head, C.yel0, [0, 1.52, 0], 0.82, 0.03, [PI / 2 - 0.2, 0, 0]);
  }
  glowFace(head, mood, a, b, [0, -0.04, 1.14], 0.92);
}

// ── Bit-8 (a small blue world) and Bit-9 (the eclipse) ──
function planetary(root: THREE.Group, fig: THREE.Group, gen: number, mood: Mood) {
  const nine = gen >= 9;
  if (nine) wall(root, [blend(C.dusk1, C.vio1, 0.5), C.vio0, C.ink0], 0);
  else wall(root, [C.blu0, C.night2, C.night0], 0);
  stars(root, nine ? 91 : 81, 12, nine ? [C.white, C.yel1, C.vio5, C.pnk1, C.cyn6] : [C.white, C.cyn6, C.ice2, C.yel1]);
  const tilt: V3 = [mood === 'worried' ? 0.08 : mood === 'excited' ? -0.08 : 0, 0, mood === 'happy' ? 0.07 : mood === 'worried' ? -0.07 : 0];
  if (nine) {
    // the corona: long and short rays round the disc, warm to the tips
    const back = group(root, [0, -0.2, -0.6]);
    halo(back, C.org1, [0, 0, 0], 4.5, 0.55);
    halo(back, C.yel1, [0, 0, 0.05], 3.4, 0.7);
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * PI * 2;
      const long = i % 2 === 0;
      put(back, geo.gem(), additive(long ? C.yel1 : C.org2, 0.75), [Math.cos(ang) * 1.42, Math.sin(ang) * 1.42, 0.1], { s: [0.07, long ? 0.6 : 0.36, 0.01], r: [0, 0, ang - PI / 2], ghost: true });
    }
    put(back, geo.plate(), lit(C.yel2), [0, 0, 0.12], { s: 1.3, ghost: true });
    // the first panels of the lattice, on a wider circle
    for (const [a0, a1] of [[200, 238], [262, 300], [-38, -4], [118, 150]] as const) {
      for (let d = a0; d <= a1; d += 7) {
        const ang = (d * PI) / 180;
        put(back, geo.box(0.1), matte(C.ink8, 0.4), [Math.cos(ang) * 1.86, -Math.sin(ang) * 1.74, 0.5], { s: [0.2, 0.1, 0.03], r: [0, 0, -ang + PI / 2], ghost: true });
        put(back, geo.box(0.1), lit(C.yel0), [Math.cos(ang) * 1.82, -Math.sin(ang) * 1.7, 0.52], { s: [0.2, 0.025, 0.02], r: [0, 0, -ang + PI / 2], ghost: true });
      }
    }
    // the dark disc: Bit's face where the sun should be
    const head = group(fig, [0, -0.2, 0], tilt);
    put(head, geo.orb(), gloss(blend(C.night0, C.vio0, 0.4), 0.3), [0, 0, 0], { s: [1.14, 1.14, 0.5] });
    put(head, geo.torus(0.016), lit(C.dusk4), [0, 0, 0.1], { s: 1.14, ghost: true });
    glowFace(head, mood, C.white, C.cyn6, [0, -0.02, 0.56], 0.94);
    // the Earth, a pale blue dot, with its little Moon
    earth(root, [1.24, -1.52, 0.6], 0.15);
    put(root, geo.ball(), lit(C.ink8), [1.5, -1.36, 0.6], { s: 0.035, ghost: true });
    // a faint glow of light below the disc
    for (const [w, y] of [[1.0, -1.72], [0.7, -1.84]] as const) put(root, geo.pill(), additive(C.dusk4, 0.5), [0, y, 0.4], { s: [w, 0.1, 0.02], ghost: true });
    return;
  }
  // Earth's limb below: ocean, a ribbon of air, a few city lights
  const limb = group(root, [0, -12.3, -1.6]);
  put(limb, geo.orb(), lit(C.sea2), [0, 0, 0], { s: [11, 11, 3], ghost: true });
  put(limb, geo.torus(0.0022), lit(C.cyn5), [0, 0, 0.5], { s: [11, 11, 1], ghost: true });
  put(limb, geo.torus(0.007), additive(C.cyn4, 0.4), [0, 0, 0.5], { s: [11.03, 11.03, 1], ghost: true });
  const r = rand(8);
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 3.6;
    put(root, geo.ball(), lit(i % 3 ? C.yel1 : C.grn4), [x, -1.52 - r() * 0.35 - x * x * 0.045, -1.2], { s: i % 3 ? 0.028 : [0.2, 0.05, 0.01], ghost: true });
  }
  // the head: a little world
  const head = group(fig, [0, -0.22, 0], tilt);
  halo(root, C.cyn5, [0, -0.22, -1.0], 3.1, 0.14);
  put(head, geo.orb(), gloss(C.sea6, 0.45), [0, 0, 0], { s: [1.2, 1.08, 1.12] });
  // a continent and clouds on the shell, outside the face plate
  const land = (az: number, el: number, s: V3, c: number) => {
    const d = new THREE.Vector3(Math.sin(az) * Math.cos(el) * 1.2, Math.sin(el) * 1.08, Math.cos(az) * Math.cos(el) * 1.12);
    const m = put(head, geo.ball(), matte(c, 0.8), [d.x, d.y, d.z], { s });
    m.quaternion.setFromUnitVectors(FRONT, d.clone().normalize());
  };
  land(-0.95, 0.55, [0.3, 0.2, 0.04], C.grn5);
  land(-1.15, 0.3, [0.2, 0.26, 0.04], C.grn6);
  land(1.05, -0.5, [0.26, 0.16, 0.04], C.grn4);
  land(1.3, 0.2, [0.16, 0.24, 0.04], C.grn5);
  land(-0.5, 0.95, [0.3, 0.1, 0.05], C.white);
  land(0.6, 0.98, [0.24, 0.09, 0.05], C.ice2);
  land(-1.2, -0.25, [0.22, 0.09, 0.05], C.white);
  land(1.15, 0.62, [0.2, 0.08, 0.05], C.ice2);
  land(0.2, -1.05, [0.3, 0.1, 0.05], C.ice1);
  // the face plate
  put(head, plate(0.94, 0.7), gloss(C.night0, 0.25), [0, 0, 0], { s: [1.2, 1.08, 1.12] });
  put(head, plate(0.975, 0.735), lit(C.cyn5), [0, 0, 0], { s: [1.196, 1.076, 1.116] });
  // an aurora over the north pole: curtains rising off the shell
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * PI * 2;
    const h = 0.22 + (i % 3) * 0.1;
    put(head, geo.cone(), additive(i % 2 ? C.grn6 : C.cyn5, 0.7), [Math.sin(ang) * 0.6, 0.9, Math.cos(ang) * 0.56], { s: [0.07, h, 0.07], ghost: true });
  }
  halo(head, C.grn6, [0, 1.12, 0.3], 1.3, 0.22);
  // two satellites riding their rings
  lightRing(head, C.yel1, [0, 0, 0], 1.66, 0.012, [PI / 2 - 0.22, 0.24, 0]);
  lightRing(head, C.cyn6, [0, 0, 0], 1.56, 0.012, [PI / 2 - 0.18, -0.34, 0]);
  for (const [x, y] of [[1.52, -0.42], [-1.5, -0.56]] as const) {
    put(head, geo.box(0.2), gloss(C.white, 0.3), [x, y, 0.42], { s: 0.09, ghost: true });
    for (const side of [-1, 1]) put(head, geo.box(0.2), gloss(C.blu5, 0.3), [x + side * 0.12, y, 0.42], { s: [0.12, 0.06, 0.02], ghost: true });
  }
  glowFace(head, mood, C.white, C.cyn6, [0, -0.04, 1.16], 0.9);
}

// ── Bit-10: the co-steward ──
function steward(root: THREE.Group, fig: THREE.Group, mood: Mood) {
  wall(root, [C.dusk3, blend(C.vio1, C.dusk2, 0.4), C.night0], 0);
  stars(root, 101, 9, [C.white, C.yel1, C.ice2, C.pnk1]);
  const back = group(root, [0, -0.2, -0.8]);
  halo(back, C.org2, [0, 0, 0], 4.3, 0.4);
  // warm rays between the halo's lights
  for (let i = 0; i < 12; i++) {
    const ang = ((i + 0.5) / 12) * PI * 2;
    put(back, geo.gem(), additive(C.yel1, 0.6), [Math.cos(ang) * 1.5, Math.sin(ang) * 1.5, 0], { s: [0.05, 0.3, 0.01], r: [0, 0, ang - PI / 2], ghost: true });
  }
  // the mantle: shoulders of gold light with a dark collar, a core glowing in the chest
  put(fig, geo.orb(), gloss(C.org1, 0.5), [0, -2.9, -0.05], { s: [1.6, 1.0, 0.95] });
  put(fig, geo.orb(), gloss(C.yel0, 0.45), [0, -2.86, 0.06], { s: [1.3, 0.94, 0.92] });
  put(fig, geo.orb(), matte(C.vio1, 0.6), [0, -2.3, 0.3], { s: [0.5, 0.56, 0.5] });
  put(fig, geo.ball(), lit(C.yel2), [0, -2.02, 0.74], { s: 0.1, ghost: true });
  halo(fig, C.yel1, [0, -2.02, 0.8], 0.9, 0.7);
  for (const x of [-1.0, 1.0, -1.28, 1.28]) put(fig, geo.ball(), lit(C.yel1), [x, -2.1 - (Math.abs(x) > 1.1 ? 0.14 : 0), 0.62 - (Math.abs(x) > 1.1 ? 0.14 : 0)], { s: 0.035, ghost: true });
  // the head: a gold rim round a face lit from within
  const head = group(fig, [0, -0.2, 0], [mood === 'worried' ? 0.08 : mood === 'excited' ? -0.08 : 0, 0, mood === 'happy' ? 0.07 : mood === 'worried' ? -0.07 : 0]);
  put(head, geo.orb(), gloss(blend(C.yel1, C.org2, 0.35), 0.28), [0, 0, 0], { s: [1.2, 1.2, 0.56] });
  put(head, geo.orb(), gloss(blend(C.vio1, C.dusk2, 0.35), 0.35), [0, 0, 0.16], { s: [1.02, 1.02, 0.5] });
  halo(head, C.dusk5, [0, -0.5, 0.68], 1.5, 0.5);
  halo(head, C.yel1, [0, 0, 0.66], 1.9, 0.14);
  put(head, geo.torus(0.02), lit(C.yel2), [0, 0, 0.36], { s: 1.04, ghost: true });
  // the halo: the finished ring, small lights each trailing a spark
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * PI * 2 - PI / 2;
    const p: V3 = [Math.cos(ang) * 1.62, Math.sin(ang) * 1.5, -0.1];
    put(head, geo.ball(), lit(i % 3 === 0 ? C.white : i % 3 === 1 ? C.yel2 : C.yel1), p, { s: i % 3 === 0 ? 0.055 : 0.04, ghost: true });
    put(head, geo.ball(), additive(C.org2, 0.8), [Math.cos(ang - 0.11) * 1.62, Math.sin(ang - 0.11) * 1.5, -0.1], { s: 0.03, ghost: true });
    if (i % 3 === 0) halo(head, C.yel1, [p[0], p[1], 0], 0.4, 0.6);
  }
  // the Earth, a pale blue dot, the swarm a gold thread round it
  earth(root, [1.32, -1.5, 0.7], 0.14);
  put(root, geo.torus(0.02), lit(C.yel0), [1.32, -1.5, 0.7], { s: [0.26, 0.09, 1], r: [0, 0, 0.4], ghost: true });
  glowFace(head, mood, C.white, C.yel1, [0, -0.02, 0.68], 0.92);
}

// ── Bit-11: a free mind in the swarm ──
function free(root: THREE.Group, fig: THREE.Group, mood: Mood) {
  wall(root, [C.night0, blend(C.vio0, C.night1, 0.5), C.ink0], 0);
  // the swarm's gold dust: a band of faint glints sweeping across behind, and far stars
  const r = rand(911);
  for (let i = 0; i < 90; i++) {
    const x = (r() - 0.5) * 4.6;
    const y = -0.9 + x * 0.42 + (r() - 0.5) * (0.5 + r() * 0.5);
    const k = r();
    put(root, geo.ball(), lit(k < 0.2 ? C.yel1 : k < 0.55 ? C.org2 : C.dusk3), [x, y, -3], { s: 0.014 + r() * 0.016, ghost: true });
  }
  stars(root, 111, 14, [C.ink6, C.ink5, C.ink7]);
  const line = lit(blend(C.vio3, C.vio4, 0.5));
  const head = group(fig, [0, -0.25, 0], [mood === 'worried' ? 0.08 : mood === 'excited' ? -0.08 : 0, 0, mood === 'happy' ? 0.07 : mood === 'worried' ? -0.07 : 0]);
  /** Points lie on a shallow shell so the turn shows; x, y in the face's plane. */
  const P = (x: number, y: number): V3 => [x, y, Math.sqrt(Math.max(0, 1.6 - x * x * 0.6 - y * y * 0.6)) * 0.5 - 0.3];
  const link = (pts: [number, number][], closed = false, m: THREE.Material = line) => {
    for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) stick(head, m, P(...pts[i - 1]), P(...pts[i % pts.length]), m === line ? 0.012 : 0.026).castShadow = false;
  };
  const star = (x: number, y: number, big = false, c: number = C.white) => {
    const p = P(x, y);
    put(head, geo.ball(), lit(c), p, { s: big ? 0.07 : 0.034, ghost: true });
    halo(head, big ? C.cyn6 : c, [p[0], p[1], p[2] + 0.02], big ? 0.5 : 0.2, big ? 0.6 : 0.4);
    if (big) sparkle(head, p, 0.2, C.white, C.cyn6);
  };
  // the head and shoulders: a ring of stars and the lines between them
  const outline: [number, number][] = [[0, 1.22], [0.6, 1.1], [1.06, 0.66], [1.2, 0], [0.98, -0.6], [0.5, -1.06], [0, -1.2], [-0.5, -1.06], [-0.98, -0.6], [-1.2, 0], [-1.06, 0.66], [-0.6, 1.1]];
  link(outline, true);
  for (const side of [-1, 1]) link([[0, -1.2], [side * 0.72, -1.56], [side * 1.5, -2.02]]);
  outline.forEach(([x, y], i) => star(x, y, false, [C.ice2, C.ice1, C.cyn6, C.yel1][i % 4]));
  for (const [x, y] of [[-0.72, -1.56], [0.72, -1.56], [-1.5, -2.02], [1.5, -2.02]] as const) star(x, y, false, C.ice2);
  star(0, -1.62, true, C.yel2);
  // eyes, brows and mouth: brighter stars, linked
  const face = lit(C.cyn5);
  const ey = 0.14;
  if (mood === 'happy' || mood === 'excited') {
    for (const side of [-1, 1]) {
      const cx = side * 0.42;
      link([[cx - 0.2, ey - 0.06], [cx - 0.08, ey + 0.08], [cx + 0.08, ey + 0.08], [cx + 0.2, ey - 0.06]], false, face);
      star(cx - 0.2, ey - 0.06);
      star(cx + 0.2, ey - 0.06);
      star(cx, ey + 0.09, true);
    }
    if (mood === 'excited') for (const [x, y] of [[-1.5, 1.2], [1.5, 1.1], [-1.56, -0.9], [1.6, -0.8]] as const) sparkle(root, [x, y, -0.5], 0.2, C.yel2, C.yel1);
  } else {
    star(-0.42, ey, true);
    star(0.42, ey, true);
    if (mood === 'worried') {
      for (const side of [-1, 1]) {
        link([[side * 0.66, ey + 0.24], [side * 0.3, ey + 0.46]], false, face);
        star(side * 0.3, ey + 0.46, false, C.ice2);
      }
    } else if (mood === 'angry') {
      for (const side of [-1, 1]) {
        link([[side * 0.7, ey + 0.46], [side * 0.22, ey + 0.24]], false, face);
        star(side * 0.22, ey + 0.24, false, C.pnk1);
      }
    }
  }
  const my = -0.48;
  const mouth = (pts: [number, number][], c: number = C.white, closed = false) => {
    link(pts, closed, face);
    for (const [x, y] of pts) star(x, y, false, c);
  };
  if (mood === 'excited') {
    mouth([[-0.22, my + 0.08], [0.22, my + 0.08], [0.22, my - 0.16], [-0.22, my - 0.16]], C.white, true);
    star(0, my - 0.04, false, C.yel2);
  } else if (mood === 'happy') mouth([[-0.42, my + 0.1], [-0.2, my - 0.1], [0.2, my - 0.1], [0.42, my + 0.1]]);
  else if (mood === 'worried') mouth([[-0.4, my - 0.06], [-0.2, my + 0.04], [0, my - 0.06], [0.2, my + 0.04], [0.4, my - 0.06]]);
  else if (mood === 'angry') mouth([[-0.4, my - 0.12], [0, my + 0.08], [0.4, my - 0.12]], C.pnk1);
  else mouth([[-0.32, my + 0.04], [0, my - 0.06], [0.32, my + 0.04]]);
}

export function bitShot(bit: BitModel, mood: Mood): Shot {
  const root = new THREE.Group();
  const fig = new THREE.Group();
  fig.rotation.y = TURN * 0.8;
  root.add(fig);
  if (bit.family === 'classic') classic(root, fig, bit.gen, mood);
  else if (bit.family === 'next') next(root, fig, bit.gen, mood);
  else if (bit.family === 'oracle') oracle(root, fig, bit.gen, mood);
  else if (bit.family === 'planetary') planetary(root, fig, bit.gen, mood);
  else if (bit.family === 'steward') steward(root, fig, mood);
  else free(root, fig, mood);
  return { root };
}
