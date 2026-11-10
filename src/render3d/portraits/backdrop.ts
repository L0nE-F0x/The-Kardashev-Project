/**
 * What stands behind a bust: a soft studio wall in the look's two background colours (dark at the foot, light
 * behind the head, a pool of light where the key falls), and the motifs some looks carry: stars, a plasma ring,
 * the lunar horizon with the Earth over it, the inside of a habitat cylinder, a doubling curve on graph paper, the
 * swarm's first arc, a sparkle of good health. All of it sits unturned behind the figure.
 */
import * as THREE from 'three';
import { C } from '../../render/palette';
import { additive, blend, colour, geo, halo, hexOf, inside, lit, put, rand, shared, stick, type V3 } from './parts';
import type { Look } from './looks';

const walls = new Map<string, THREE.ShaderMaterial>();
/** The wall: three colours bottom to top (two looks' colours give a middle of their own), with a light pool and soft corners. */
function wallMat(bottom: string, middle: string, top: string, pool: number): THREE.ShaderMaterial {
  const key = `${bottom}:${middle}:${top}:${pool}`;
  let m = walls.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uA: { value: colour(bottom) }, uB: { value: colour(middle) }, uC: { value: colour(top) }, uPool: { value: pool } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: `uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uPool; varying vec2 vUv;
        void main() {
          float y = vUv.y;
          vec3 c = mix( uA, uB, smoothstep( 0.18, 0.5, y ) );
          c = mix( c, uC, smoothstep( 0.45, 0.86, y ) );
          // the key's pool on the wall, up and to the left of the head
          float d = length( ( vUv - vec2( 0.44, 0.6 ) ) * vec2( 1.0, 1.15 ) );
          c += uC * uPool * pow( max( 1.0 - d * 2.1, 0.0 ), 2.0 );
          // the corners fall away
          float v = length( ( vUv - 0.5 ) * vec2( 1.0, 1.0 ) );
          c *= 1.0 - 0.3 * smoothstep( 0.22, 0.56, v );
          gl_FragColor = vec4( c, 1.0 );
          #include <colorspace_fragment>
        }`,
      depthWrite: false,
    });
    walls.set(key, m);
  }
  return m;
}

/** Depth of the wall behind the figure, and how much bigger things there must be drawn to fill the frame. */
const WALL_Z = -5;

/** A plain wall in two or three colours (palette indices or hex strings), darkest first. */
export function wall(root: THREE.Object3D, colours: (number | string)[], pool = 0.3) {
  const c = colours.map((x) => (typeof x === 'number' ? hexOf(x) : x));
  const [a, b, d] = c.length >= 3 ? c : [blend(c[0], c[1], 0.2), blend(c[0], c[1], 0.62), c[1]];
  const m = put(root, shared('wall', () => new THREE.PlaneGeometry(4.86, 4.86)), wallMat(a, b, d, pool), [0, -0.2, WALL_Z], { ghost: true });
  m.renderOrder = -10;
  return m;
}

/** Stars scattered round the edges of the frame (never behind the face). */
export function stars(root: THREE.Object3D, seed: number, n = 12, tints: (number | string)[] = [C.white, C.yel1, C.sky4, C.ice2]) {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    for (let k = 0; k < 8; k++) {
      x = (r() - 0.5) * 4.6;
      y = -0.3 + (r() - 0.5) * 4.6;
      if (Math.hypot(x, (y - 0.1) * 0.8) > 1.35) break;
    }
    const big = r() < 0.3;
    const tint = tints[Math.floor(r() * tints.length)];
    put(root, geo.ball(), lit(tint), [x, y, WALL_Z + 0.6], { s: big ? 0.05 : 0.03, ghost: true });
    if (big) halo(root, tint, [x, y, WALL_Z + 0.65], 0.28, 0.6);
  }
}

/** A four-pointed sparkle. */
export function sparkle(root: THREE.Object3D, p: V3, size: number, c: number | string = C.white, glowC: number | string = C.yel1) {
  halo(root, glowC, p, size * 2.6, 0.7);
  put(root, geo.gem(), lit(c), p, { s: [size * 0.16, size, 0.01], ghost: true });
  put(root, geo.gem(), lit(c), p, { s: [size, size * 0.16, 0.01], ghost: true });
}

/** The motifs a person's look can carry. */
export function motifs(root: THREE.Object3D, L: Look) {
  if (L.stars) stars(root, 11);
  if (L.horizon) {
    // the Moon's surface low behind the shoulders, the Earth hanging over it
    const [dark, light] = L.horizon;
    put(root, geo.orb(), lit(blend(dark, light, 0.45)), [0.4, -9.75, WALL_Z + 1.2], { s: [9, 8, 2], ghost: true });
    put(root, geo.torus(0.012, Math.PI), lit(hexOf(light)), [0.4, -9.75, WALL_Z + 1.3], { s: [9, 8, 1], ghost: true });
    for (const [x, y, s] of [[-1.9, -1.72, 0.2], [1.6, -1.66, 0.26], [2.2, -1.9, 0.14], [-0.9, -1.95, 0.12]] as const) put(root, geo.ball(), lit(hexOf(dark)), [x, y, WALL_Z + 1.25], { s: [s, s * 0.3, 0.02], ghost: true });
    earth(root, [1.72, 1.32, WALL_Z + 1], 0.36);
  }
  if (L.torus) {
    // a ring of plasma behind the head, the near side brighter
    const [dark, light] = L.torus;
    const ring = new THREE.Group();
    ring.position.set(0, 0.2, -1.9);
    ring.rotation.set(1.28, 0, -0.1);
    root.add(ring);
    put(ring, geo.torus(0.085), additive(dark, 0.55), [0, 0, 0], { s: 2.25, ghost: true });
    put(ring, geo.torus(0.035), lit(light), [0, 0, 0], { s: 2.25, ghost: true });
    put(ring, geo.torus(0.012), lit(C.white), [0, 0, 0], { s: 2.25, ghost: true });
    halo(root, light, [-2.05, 0.3, -1.6], 1.1, 0.5);
    halo(root, light, [2.05, 0.1, -1.6], 1.1, 0.5);
    for (const [x, y] of [[-1.5, 1.2], [1.85, 0.75], [-1.95, -0.6], [1.2, 1.45]] as const) put(root, geo.ball(), lit(C.white), [x, y, -2.6], { s: 0.03, ghost: true });
  }
  if (L.cylinder) cylinderWorld(root);
  if (L.curve !== undefined) {
    // graph paper and an exponential: doubling, doubling, doubling
    const z = WALL_Z + 0.5;
    const line = lit(blend(L.bg[1], C.white, 0.16));
    for (let i = -3; i <= 3; i++) {
      stick(root, line, [i * 0.8, -3.2, z], [i * 0.8, 2.6, z], 0.012).castShadow = false;
      stick(root, line, [-3.2, -0.3 + i * 0.8, z], [3.2, -0.3 + i * 0.8, z], 0.012).castShadow = false;
    }
    const f = (x: number) => -2.5 + 0.11 * Math.pow(2, (x + 2.6) * 1.05);
    const pts = () => Array.from({ length: 30 }, (_, i) => { const x = -2.6 + i * 0.165; return new THREE.Vector3(x, f(x), 0); });
    put(root, geo.tube('doubling', pts, 0.04, false, 60), lit(L.curve), [0, 0, z + 0.1], { ghost: true });
    for (const x of [-1.6, -0.65, 0.3, 1.25, 1.9]) if (f(x) < 2.4) put(root, geo.ball(), lit(C.white), [x, f(x), z + 0.15], { s: 0.075, ghost: true });
  }
  if (L.swarm) {
    // the swarm's first arc: panels on a wide ring round the head, catching the light
    const [dark, light] = L.swarm;
    const n = 19;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.02 + (0.96 * i) / (n - 1));
      const x = Math.cos(a) * 2.25;
      const y = -0.15 + Math.sin(a) * 2.05;
      const k = i % 3;
      const m = put(root, geo.box(0.08), lit(k === 0 ? hexOf(C.white) : k === 1 ? hexOf(light) : hexOf(dark)), [x, y, -2.4], { s: [0.2, 0.11, 0.03], r: [0, 0, a + Math.PI / 2], ghost: true });
      m.rotation.y = 0.5;
      if (k === 0) halo(root, light, [x, y, -2.35], 0.5, 0.5);
    }
  }
  if (L.glow) {
    sparkle(root, [1.4, 1.2, -2.5], 0.3);
    sparkle(root, [-1.52, 0.55, -2.5], 0.13, C.yel2);
    sparkle(root, [1.66, 0.45, -2.5], 0.1, C.yel1);
  }
}

/** The Earth from far off: a blue ball with land and cloud, lit from the upper left. */
export function earth(root: THREE.Object3D, p: V3, r: number) {
  halo(root, C.sky4, p, r * 3.2, 0.45);
  const g = new THREE.Group();
  g.position.set(...p);
  g.scale.setScalar(r);
  root.add(g);
  put(g, geo.orb(), lit(C.sea5), [0, 0, 0], { ghost: true });
  // the night side
  put(g, geo.orb(), lit(C.sea1, 0.75), [0.2, -0.16, 0.12], { s: 0.96, ghost: true });
  for (const [x, y, s, c] of [[-0.42, 0.34, 0.3, C.grn6], [-0.1, 0.52, 0.2, C.grn5], [-0.5, -0.12, 0.18, C.grn5], [0.1, 0.1, 0.22, C.white], [-0.3, 0.7, 0.16, C.white], [-0.65, 0.25, 0.14, C.white]] as const) {
    put(g, geo.ball(), lit(c), [x, y, Math.sqrt(Math.max(0.05, 1 - x * x - y * y)) * 0.97], { s: [s, s * 0.72, 0.05], ghost: true });
  }
}

/**
 * Inside an O'Neill cylinder, looking along it: the land curves up both sides in strips of field, a river runs
 * along the valley floor, and the far end is lost in the sky's haze.
 */
function cylinderWorld(root: THREE.Object3D) {
  const R = 3.1;
  const g = new THREE.Group();
  g.position.set(0, 0.95, 0);
  root.add(g);
  const fields = [C.grn5, C.grn4, C.grn6, C.grn5, C.grn7, C.grn4];
  // rings of land along the axis, each ring four fields of different crops; they wrap the floor and both walls and
  // leave the sky open overhead. (Angles run from straight down, round by the right.)
  const span = Math.PI * 0.31;
  for (let i = 0; i < 9; i++) {
    const haze = Math.min(0.75, i * 0.085);
    for (let k = 0; k < 4; k++) {
      const a0 = -span * 2 + k * span + (i % 2) * 0.1;
      const strip = shared(`habitat-field:${k}:${i % 2}`, () => new THREE.CylinderGeometry(R, R, 1.52, 10, 1, true, a0, span * 0.97).rotateX(Math.PI / 2));
      put(g, strip, inside(blend(fields[(i * 2 + k) % fields.length], C.sky4, haze)), [0, 0, -1 - i * 1.6], { ghost: true });
    }
  }
  // the river along the valley floor, and the lamp line along the axis
  put(g, geo.box(0.02), lit(blend(C.sea7, C.white, 0.2)), [0.25, -R + 0.03, -8], { s: [0.22, 0.02, 15], ghost: true });
  put(g, geo.box(0.02), lit(C.white), [0, 0.2, -9], { s: [0.05, 0.05, 12], ghost: true });
  halo(root, C.white, [0, 1.25, -4], 3.4, 0.35);
  // roofs catching the light on the near slopes
  const r = rand(5);
  for (let i = 0; i < 16; i++) {
    const a = (r() - 0.5) * Math.PI * 1.1;
    put(g, geo.box(0.05), lit(r() < 0.5 ? C.white : C.snd7), [Math.sin(a) * (R - 0.04), -Math.cos(a) * (R - 0.04), -1.2 - r() * 6], { s: [0.09, 0.09, 0.12], r: [0, 0, a], ghost: true });
  }
}
