/**
 * Roads on a 3D campus: each one a continuous ribbon laid on the ground mesh (so it never floats, sinks or
 * breaks into tiles on a slope), painted by a shader: asphalt with wear, tyre tracks and patches, crisp
 * anti-aliased markings (they fade with distance instead of shimmering), gravel for a service lane, concrete
 * with joints for the pavements. Junctions get rounded corners, markings stop where a road joins, and a stop
 * line and a zebra crossing sit where people and cars meet.
 */
import * as THREE from 'three';
import { withClouds } from '../kit';

export type RoadKind = 'highway' | 'street' | 'lane' | 'pavement';

export interface RoadRun {
  kind: RoadKind;
  a: [number, number];
  b: [number, number];
  w: number;
  /** Stretches (metres from a) where an edge line or the centre line breaks for a junction: [from, to, which]. */
  breaks?: [number, number, 'l' | 'r' | 'c' | 'all'][];
  /** Raised kerb height (pavements). */
  kerb?: number;
}

type H = (x: number, z: number) => number;

// ── the paint ─────────────────────────────────────────────────────────────────────────────────
interface Paint { base: string; edge: number; edgeW: number; centre: 0 | 1 | 2; dash: [number, number]; lineCol: string; edgeCol: string; gravel?: boolean; joints?: number }
const PAINT: Record<RoadKind, Paint> = {
  // two lanes and gravel-edged shoulders: white edge lines, a dashed yellow centre line
  highway: { base: '#4a484f', edge: 3.85, edgeW: 0.16, centre: 1, dash: [3, 9], lineCol: '#f2c14e', edgeCol: '#e9e4da' },
  // the campus roads: a dashed white centre line, thin edge lines
  street: { base: '#55525a', edge: 2.6, edgeW: 0.12, centre: 2, dash: [2, 4], lineCol: '#ece7de', edgeCol: '#d9d3c8' },
  lane: { base: '#b9a27c', edge: 99, edgeW: 0, centre: 0, dash: [1, 1], lineCol: '#000000', edgeCol: '#000000', gravel: true },
  pavement: { base: '#b7b0a6', edge: 99, edgeW: 0, centre: 0, dash: [1, 1], lineCol: '#000000', edgeCol: '#000000', joints: 1.5 },
};

let noiseTex: THREE.DataTexture | null = null;
/** A tiling value-noise texture (r: fine, g: coarse) for asphalt grit, patches and gravel. */
function roadNoise() {
  if (noiseTex) return noiseTex;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x: number, y: number, period: number, s: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const c = (dx: number, dy: number) => hash(((xi + dx) % period + period) % period, ((yi + dy) % period + period) % period, s);
    return (c(0, 0) * (1 - u) + c(1, 0) * u) * (1 - v) + (c(0, 1) * (1 - u) + c(1, 1) * u) * v;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const fine = hash(x, y, 3) * 0.55 + vnoise(x / 2, y / 2, N / 2, 4) * 0.45;
      let coarse = 0, amp = 0.5, tot = 0;
      for (let o = 0; o < 4; o++) { const f = 8 * (1 << o); coarse += vnoise((x / N) * f, (y / N) * f, f, 9 + o) * amp; tot += amp; amp *= 0.5; }
      const k = (y * N + x) * 4;
      data[k] = fine * 255; data[k + 1] = (coarse / tot) * 255; data[k + 2] = hash(x, y, 11) * 255; data[k + 3] = 255;
    }
  noiseTex = new THREE.DataTexture(data, N, N);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.anisotropy = 8;
  noiseTex.needsUpdate = true;
  noiseTex.userData.shared = true;
  return noiseTex;
}

/** Half the ribbon's width for a kind (where its gravel rim lies). */
const half = (p: Paint) => (p.edge > 3 ? 5 : 3);
const mats = new Map<RoadKind, THREE.MeshStandardMaterial>();
function roadMaterial(kind: RoadKind) {
  const m0 = mats.get(kind);
  if (m0) return m0;
  const p = PAINT[kind];
  const m = withClouds(new THREE.MeshStandardMaterial({ color: p.base, roughness: kind === 'pavement' ? 0.85 : 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: kind === 'pavement' ? -6 : -4, side: kind === 'pavement' ? THREE.DoubleSide : THREE.FrontSide }));
  const tex = roadNoise();
  const prev = m.onBeforeCompile;
  const c = (s: string) => { const k = new THREE.Color(s); return `vec3(${k.r.toFixed(4)}, ${k.g.toFixed(4)}, ${k.b.toFixed(4)})`; };
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uRoadNoise = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 road; attribute vec3 marks; varying vec2 vRoad; varying vec3 vMarks; varying vec2 vRoadW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRoad = road; vMarks = marks; vRoadW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vRoad; varying vec3 vMarks; varying vec2 vRoadW; uniform sampler2D uRoadNoise;
        // a line |x| < w, anti-aliased by its own screen footprint, faded out as it gets thinner than a pixel
        float roadLine(float x, float w) {
          float fw = max(fwidth(x), 1e-4);
          float a = 1.0 - smoothstep(w - fw, w + fw, abs(x));
          return a * clamp(w / fw, 0.0, 1.0);
        }
        float roadDash(float v, float on, float period) {
          float ph = mod(v, period);
          float fw = max(fwidth(v), 1e-4);
          return smoothstep(0.0, fw, ph) * (1.0 - smoothstep(on - fw, on, ph)) * clamp(on / (fw * 2.0), 0.0, 1.0);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float u = vRoad.x, v = vRoad.y;
          vec4 nz = texture2D(uRoadNoise, vRoadW * 0.35);
          vec4 nc = texture2D(uRoadNoise, vRoadW * 0.021 + 0.31);
          float far = smoothstep(60.0, 380.0, distance(cameraPosition.xz, vRoadW));
          vec3 col = diffuseColor.rgb;
          ${p.gravel ? `
          // gravel: grit, two worn ruts, grass creeping in at the edges
          col *= 0.86 + nz.r * 0.28 * (1.0 - far * 0.6);
          col *= 1.0 - 0.10 * (roadLine(abs(u) - 0.75, 0.32));
          col = mix(col, vec3(0.43, 0.48, 0.25), smoothstep(1.1, 1.75, abs(u) + (nc.g - 0.5) * 0.6) * 0.7);
          ` : p.joints ? `
          // concrete slabs: joints across every ${p.joints} m, a kerb edge line, faint staining
          col *= 0.94 + nz.r * 0.1 + (nc.g - 0.5) * 0.12;
          col *= 1.0 - 0.28 * roadLine(mod(v + ${(p.joints / 2).toFixed(2)}, ${p.joints.toFixed(2)}) - ${(p.joints / 2).toFixed(2)}, 0.025) * (1.0 - far);
          ` : `
          // asphalt: grit, darker tyre tracks down each lane, lighter sealed patches, dust towards the edges
          col *= 0.9 + nz.r * 0.16 * (1.0 - far * 0.7);
          float lane = ${p.edge.toFixed(2)} * 0.5;
          float tracks = roadLine(abs(abs(u) - lane) - 0.55, 0.28);
          col *= 1.0 - 0.09 * tracks;
          col = mix(col, col * 1.18, smoothstep(0.66, 0.74, nc.g) * 0.8);
          col = mix(col, col * vec3(1.18, 1.12, 1.0), smoothstep(${(p.edge - 0.4).toFixed(2)}, ${(p.edge + 0.6).toFixed(2)}, abs(u)) * 0.5);
          // sealed cracks: thin dark lines wandering across the lanes (near the camera only)
          float crk = texture2D(uRoadNoise, vRoadW * 0.047 + 0.63).g;
          float crkW = max(fwidth(crk), 1e-5);
          // (in stretches, not rings: only where a second field is high)
          col *= 1.0 - 0.17 * (1.0 - smoothstep(0.5, 1.5, abs(crk - 0.5) / crkW)) * smoothstep(0.5, 0.62, nc.b + nc.r * 0.5) * (1.0 - smoothstep(18.0, 55.0, distance(cameraPosition.xz, vRoadW)));
          // the ragged edge: loose gravel where the asphalt meets the verge
          float rim = smoothstep(${(half(p) - 0.42).toFixed(2)}, ${(half(p) - 0.1).toFixed(2)}, abs(u) + (nz.r - 0.5) * 0.3 + (nc.r - 0.5) * 0.2);
          col = mix(col, vec3(0.42, 0.39, 0.34) * (0.75 + nz.b * 0.5), rim * 0.85);
          float worn = 0.78 + nz.g * 0.3;
          float edgeL = roadLine(u + ${p.edge.toFixed(2)}, ${p.edgeW.toFixed(3)}) * vMarks.x;
          float edgeR = roadLine(u - ${p.edge.toFixed(2)}, ${p.edgeW.toFixed(3)}) * vMarks.z;
          col = mix(col, ${c(p.edgeCol)} * worn, clamp(edgeL + edgeR, 0.0, 1.0));
          ${p.centre ? `float cl = roadLine(u, 0.08) * roadDash(v, ${p.dash[0].toFixed(1)}, ${(p.dash[0] + p.dash[1]).toFixed(1)}) * vMarks.y;
          col = mix(col, ${c(p.lineCol)} * worn, cl);` : ''}
          `}
          diffuseColor.rgb = col;
        }`);
  };
  m.customProgramCacheKey = () => 'road-' + kind;
  m.userData.shared = true;
  mats.set(kind, m);
  return m;
}

// ── geometry ──────────────────────────────────────────────────────────────────────────────────
/** One road as a ribbon on the ground (`h` = the ground mesh's height), raised `lift`; pavements get a kerb. */
export function roadMesh(run: RoadRun, h: H): THREE.Mesh {
  const [ax, az] = run.a, [bx, bz] = run.b;
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / (len || 1), uz = (bz - az) / (len || 1);
  // left-hand normal (looking from a to b)
  const nx = -uz, nz = ux;
  const half = run.w / 2;
  const kerb = run.kerb ?? 0;
  const lift = kerb ? kerb : 0.035;
  const across = kerb ? [-half, half] : [-half, -half * 0.5, 0, half * 0.5, half];
  const steps = Math.max(1, Math.ceil(len / 2));
  const pos: number[] = [], road: number[] = [], marks: number[] = [], idx: number[] = [];
  const markAt = (t: number): [number, number, number] => {
    let l = 1, c = 1, r = 1;
    for (const [t0, t1, which] of run.breaks ?? []) {
      if (t < t0 - 0.5 || t > t1 + 0.5) continue;
      if (which === 'l' || which === 'all') l = 0;
      if (which === 'r' || which === 'all') r = 0;
      if (which === 'c' || which === 'all') c = 0;
    }
    return [l, c, r];
  };
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * len;
    const m = markAt(t);
    for (const off of across) {
      const x = ax + ux * t + nx * off, z = az + uz * t + nz * off;
      pos.push(x, h(x, z) + lift, z);
      road.push(off, t);
      marks.push(...m);
    }
  }
  const W = across.length;
  for (let i = 0; i < steps; i++)
    for (let j = 0; j + 1 < W; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  if (kerb) {
    // the kerb faces down to the ground on both sides
    for (const side of [0, W - 1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= steps; i++) {
        const k = (i * W + side) * 3;
        pos.push(pos[k], pos[k + 1], pos[k + 2], pos[k], pos[k + 1] - kerb - 0.06, pos[k + 2]);
        road.push(across[side], (i / steps) * len, across[side], (i / steps) * len);
        marks.push(1, 1, 1, 1, 1, 1);
      }
      for (let i = 0; i < steps; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (side === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('road', new THREE.Float32BufferAttribute(road, 2));
  g.setAttribute('marks', new THREE.Float32BufferAttribute(marks, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, roadMaterial(run.kind));
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'road:' + run.kind;
  return mesh;
}

/**
 * A rounded corner where two roads meet at right angles: the patch between corner `c`, the two road edges running
 * away from it (unit directions `da`, `db`) and a quarter circle of radius `r`.
 */
export function cornerMesh(kind: RoadKind, c: [number, number], da: [number, number], db: [number, number], r: number, h: H): THREE.Mesh {
  const cx = c[0] + (da[0] + db[0]) * r, cz = c[1] + (da[1] + db[1]) * r;
  const pos: number[] = [c[0], h(c[0], c[1]) + 0.035, c[1]];
  const road: number[] = [0, 0], marks: number[] = [0, 0, 0];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    // from the point r along da round to the point r along db, bulging towards the corner
    const a = (i / n) * Math.PI / 2;
    const x = cx - db[0] * r * Math.cos(a) - da[0] * r * Math.sin(a);
    const z = cz - db[1] * r * Math.cos(a) - da[1] * r * Math.sin(a);
    pos.push(x, h(x, z) + 0.035, z);
    road.push(0, 0);
    marks.push(0, 0, 0);
  }
  return fan(kind, pos, road, marks, n);
}

/**
 * The turning circle at the end of a street: the road flares out through two fillets into a round head, as a real
 * cul-de-sac is laid. `throat` = where the straight road stops and the flare begins.
 */
export interface Bulb { cx: number; cz: number; r: number; throat: number; half: number; fillet: number }
export function bulbAt(throat: number, z: number, half = 3, r = 8, fillet = 5): Bulb {
  return { cx: throat + Math.sqrt((r + fillet) ** 2 - (half + fillet) ** 2), cz: z, r, throat, half, fillet };
}
/** Half the asphalt's width at x along a bulb (0 beyond its head). */
export function bulbHalf(b: Bulb, x: number) {
  if (x <= b.throat) return b.half;
  if (x >= b.cx + b.r) return 0;
  // where the fillet hands over to the head
  const px = b.cx + (b.throat - b.cx) * (b.r / (b.r + b.fillet));
  if (x < px) return b.half + b.fillet - Math.sqrt(Math.max(0, b.fillet ** 2 - (x - b.throat) ** 2));
  return Math.sqrt(Math.max(0, b.r ** 2 - (x - b.cx) ** 2));
}

/**
 * The bulb's asphalt: rings laid in from its outline, so the street's own paint carries round it (the edge line
 * follows the kerb line all the way round, the tyre tracks circle the island, the dust gathers at the rim).
 */
export function bulbMesh(kind: RoadKind, b: Bulb, h: H): THREE.Mesh {
  const edge = PAINT[kind].edge;
  // one side's outline from the throat to the tip, each point with its inward normal
  const out: { x: number; z: number; nx: number; nz: number }[] = [];
  const F = { x: b.throat, z: b.half + b.fillet };
  const a1 = Math.atan2(-(b.half + b.fillet), b.cx - b.throat);
  const nf = 10;
  for (let i = 0; i <= nf; i++) {
    const a = -Math.PI / 2 + ((a1 + Math.PI / 2) * i) / nf;
    out.push({ x: F.x + Math.cos(a) * b.fillet, z: F.z + Math.sin(a) * b.fillet, nx: Math.cos(a), nz: Math.sin(a) });
  }
  const a2 = Math.atan2(b.half + b.fillet, b.throat - b.cx);
  const nc = 30;
  for (let i = 1; i <= nc; i++) {
    const a = a2 * (1 - i / nc);
    out.push({ x: b.cx + Math.cos(a) * b.r, z: Math.sin(a) * b.r, nx: -Math.cos(a), nz: -Math.sin(a) });
  }
  const rings = [0, 0.25, 0.55, 1.2, 2.4];
  const pos: number[] = [], road: number[] = [], marks: number[] = [], idx: number[] = [];
  const W = rings.length + 1;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    let v = 0;
    out.forEach((p, i) => {
      if (i) v += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z);
      for (const d of rings) {
        const x = p.x + p.nx * d, z = b.cz + side * (p.z + p.nz * d);
        pos.push(x, h(x, z) + 0.035, z);
        // the street's own cross-section: its edge is `edge + 0.4` from the middle
        road.push(edge + 0.4 - d, v);
        marks.push(0, 0, 1);
      }
      // the middle: straight in to the axis, or the head's centre
      const ax = Math.min(b.cx, p.x + p.nx * rings[rings.length - 1]);
      pos.push(ax, h(ax, b.cz) + 0.035, b.cz);
      road.push(0, v);
      marks.push(0, 0, 1);
    });
    for (let i = 0; i + 1 < out.length; i++)
      for (let k = 0; k + 1 < W; k++) {
        const a = base + i * W + k, c = a + W;
        // (wound to face up: the two sides run opposite ways round)
        if (side > 0) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('road', new THREE.Float32BufferAttribute(road, 2));
  g.setAttribute('marks', new THREE.Float32BufferAttribute(marks, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, roadMaterial(kind));
  mesh.receiveShadow = true;
  mesh.name = 'road:bulb';
  return mesh;
}

function fan(kind: RoadKind, pos: number[], road: number[], marks: number[], n: number) {
  const idx: number[] = [];
  // wound to face up (fans can go either way round)
  const cross = (pos[3] - pos[0]) * (pos[8] - pos[2]) - (pos[5] - pos[2]) * (pos[6] - pos[0]);
  for (let i = 1; i <= n; i++) { if (cross < 0) idx.push(0, i, i + 1); else idx.push(0, i + 1, i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('road', new THREE.Float32BufferAttribute(road, 2));
  g.setAttribute('marks', new THREE.Float32BufferAttribute(marks, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, roadMaterial(kind));
  mesh.receiveShadow = true;
  return mesh;
}

/** White paint laid on a road: a stop line or a zebra crossing (stripes across a road running along `dir`). */
let paintMat: THREE.MeshStandardMaterial | null = null;
export function paintMesh(h: H, at: [number, number], dir: [number, number], kind: 'stop' | 'zebra', roadW: number): THREE.Mesh {
  if (!paintMat) {
    paintMat = withClouds(new THREE.MeshStandardMaterial({ color: '#ebe6dc', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));
    paintMat.userData.shared = true;
  }
  const m = paintMat;
  const pos: number[] = [], idx: number[] = [];
  const nx = -dir[1], nz = dir[0];
  const quad = (along0: number, along1: number, across0: number, across1: number) => {
    const b = pos.length / 3;
    for (const [al, ac] of [[along0, across0], [along1, across0], [along0, across1], [along1, across1]]) {
      const x = at[0] + dir[0] * al + nx * ac, z = at[1] + dir[1] * al + nz * ac;
      pos.push(x, h(x, z) + 0.05, z);
    }
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  };
  if (kind === 'stop') quad(-0.25, 0.25, -roadW / 2 + 0.3, 0);
  else for (let a = -roadW / 2 + 0.4; a < roadW / 2 - 0.4; a += 1.0) quad(-1.5, 1.5, a, a + 0.5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  if (nrm.getY(0) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + (2 - (i % 3))])); g.computeVertexNormals(); }
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}
