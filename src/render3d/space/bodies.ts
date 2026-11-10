/**
 * The worlds of the space views, drawn from maths rather than pictures so they hold up at any size:
 * the Moon (the near side's real seas, rayed craters, a far side of highlands), Mercury, Mars (dark
 * basalt plains, polar caps, a dusty limb) and Venus (cloud lanes sweeping round under a thick haze).
 * Each is lit by the Sun where it really is, with a hard airless terminator or a soft one through air;
 * relief is a height field whose slope tilts the light, so craters show as they really do: hardly at
 * all under a high Sun, in long shadow near the terminator. Small detail fades out as a body gets
 * small on screen (no shimmer).
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm as fbm2, rng } from '../kit';
import { quality } from '../quality';
import { NOISE, OUTPUT } from './glsl';

export type BodyKind = 'moon' | 'mercury' | 'mars' | 'venus';

const RAD = Math.PI / 180;
/** A point on the Moon by selenographic longitude (east +) and latitude; the near side faces −x. */
const sel = (lon: number, lat: number) => new THREE.Vector3(-Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD));
/** The lunar seas: where, and how wide (degrees). */
const MARIA: [number, number, number][] = [
  [-57, 18, 25], [-44, -5, 14], [-16, 33, 18], [17, 28, 11], [31, 8, 13], [59, 17, 8], [51, -8, 10], [35, -15, 6.5], [-17, -21, 11], [-39, -24, 7.5], [-22, 57, 8], [14, 55, 7],
];
/** Young craters with bright rays: Tycho, Copernicus, Kepler, Aristarchus, and one on the far side. */
const RAYS: [number, number, number][] = [[-11, -43, 1.0], [-20, 10, 0.7], [-38, 8, 0.45], [-47, 24, 0.5], [150, 20, 0.6]];

// (everything is worked out in the body's own frame: the light, the eye and the neighbour's glow are brought into it)
const vertex = /* glsl */ `
  uniform vec4 uSun; uniform vec3 uFillDir; varying vec3 vP; varying vec3 vL; varying vec3 vV; varying vec3 vF;
  void main(){
    vP = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    mat3 home = transpose(mat3(modelMatrix));
    vL = home * (uSun.w > 0.5 ? uSun.xyz - wp.xyz : uSun.xyz);
    vV = home * (cameraPosition - wp.xyz);
    vF = home * uFillDir;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const COMMON = /* glsl */ `
  uniform vec3 uLight, uFill; uniform float uTime;
  varying vec3 vP; varying vec3 vL; varying vec3 vV; varying vec3 vF;
  ${NOISE}
  /** Impact craters scattered at one size (about f across a radius): shallow bowls with raised rims, in radii of the body. */
  float craters(vec3 p, float f, float seed){
    vec3 q = p * f, i = floor(q), fr = fract(q); float h = 0.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(x, y, z), o = hash33(i + g + seed * 13.7);
      // (most are small)
      float rad = 0.09 + 0.27 * o.z * o.z * o.z;
      float d = length(g + 0.15 + o * 0.7 - fr) / rad;
      if (d < 1.7) h += rad * (-(1.0 - d * d) * step(d, 1.0) * 0.3 + exp(-(d - 1.0) * (d - 1.0) / 0.03) * 0.11);
    }
    return h / f;
  }
  /** How much of a feature size is left at this many radians a pixel (1 = all of it). */
  float lod(float f, float px){ return clamp(1.6 - f * px * 4.5, 0.0, 1.0); }`;

/** Per kind: the height field (`aux` carries what it needs from the albedo pass) and the surface colour. */
const SURFACE: Record<BodyKind, string> = {
  moon: /* glsl */ `
    uniform vec4 uMaria[${MARIA.length}]; uniform vec4 uRays[${RAYS.length}];
    // aux: how much of a sea this is (young lava: smoother, with far fewer craters than the highlands)
    float relief(vec3 p, float px, float aux){
      float young = 1.0 - aux * 0.8;
      float h = craters(p, 4.0, 1.0) * young * lod(4.0, px);
      float l2 = lod(10.0, px), l3 = lod(24.0, px);
      if (l2 > 0.0) h += craters(p, 10.0, 2.0) * young * l2;
      #ifdef FINE
      if (l3 > 0.0) h += craters(p, 24.0, 3.0) * (1.0 - aux * 0.5) * l3;
      #endif
      return h + (fbm(p * 7.0 + 4.0, 3) - 0.5) * 0.012 * young;
    }
    void surface(vec3 p, float px, out vec3 alb, out float h, out float aux){
      float warp = fbm(p * 3.0 + 2.0, 4) - 0.5;
      float mare = 0.0;
      for (int i = 0; i < ${MARIA.length}; i++) {
        float ang = acos(clamp(dot(p, uMaria[i].xyz), -1.0, 1.0));
        mare = max(mare, 1.0 - smoothstep(uMaria[i].w * 0.72, uMaria[i].w * 1.08, ang + warp * 0.22));
      }
      aux = mare;
      h = relief(p, px, aux);
      float hl = fbm(p * 5.0 + 9.0, 5);
      vec3 high = mix(vec3(0.5, 0.48, 0.45), vec3(0.76, 0.74, 0.7), hl);
      vec3 low = mix(vec3(0.19, 0.2, 0.22), vec3(0.29, 0.29, 0.3), fbm(p * 9.0, 3));
      alb = mix(high, low, mare * 0.94);
      // rayed craters: a bright splash and streaks flung across the surface
      for (int i = 0; i < ${RAYS.length}; i++) {
        vec3 c = uRays[i].xyz; float ang = acos(clamp(dot(p, c), -1.0, 1.0));
        vec3 e1 = normalize(cross(c, vec3(0.0, 1.0, 0.1))), e2 = cross(c, e1);
        float phi = atan(dot(p, e2), dot(p, e1));
        float streak = pow(vnoise(vec3(cos(phi), sin(phi), float(i)) * 5.0), 3.0);
        float reach = uRays[i].w;
        alb += vec3(0.3) * (streak * exp(-ang / (0.42 * reach)) * smoothstep(0.02, 0.06, ang) * 1.6 + exp(-ang * ang / 0.0012) * 0.8) * reach;
      }
      // fresh rock on the rims
      alb *= 1.0 + max(h, 0.0) * 9.0;
    }`,
  mercury: /* glsl */ `
    float relief(vec3 p, float px, float aux){
      float young = 1.0 - aux * 0.6;
      float h = craters(p, 3.5, 5.0) * 1.2 * young * lod(3.5, px);
      float l2 = lod(9.0, px), l3 = lod(22.0, px);
      if (l2 > 0.0) h += craters(p, 9.0, 6.0) * 1.1 * young * l2;
      #ifdef FINE
      if (l3 > 0.0) h += craters(p, 22.0, 7.0) * l3;
      #endif
      return h + (fbm(p * 6.0 + 4.0, 3) - 0.5) * 0.014;
    }
    void surface(vec3 p, float px, out vec3 alb, out float h, out float aux){
      float n = fbm(p * 3.2 + 3.0, 5);
      aux = smoothstep(0.52, 0.66, fbm(p * 1.7 + 20.0, 4));
      h = relief(p, px, aux);
      alb = mix(vec3(0.36, 0.33, 0.3), vec3(0.62, 0.57, 0.5), n);
      alb = mix(alb, vec3(0.3, 0.27, 0.25), aux * 0.55);
      // bright young splashes
      alb += vec3(0.24, 0.22, 0.2) * pow(vnoise(p * 6.0 + 40.0), 7.0) * 3.0;
      alb *= 1.0 + max(h, 0.0) * 9.0;
    }`,
  mars: /* glsl */ `
    // old ground: gentle relief and worn craters, nothing like the Moon's (aux: the polar caps, smooth ice)
    float relief(vec3 p, float px, float aux){
      float h = (fbm(p * 5.5 + 1.0, 4) - 0.5) * 0.03 + (fbm(p * 13.0 + 6.0, 4) - 0.5) * 0.012;
      float l = lod(9.0, px);
      if (l > 0.0) h += craters(p, 9.0, 4.0) * 0.8 * l * (1.0 - aux);
      return h;
    }
    void surface(vec3 p, float px, out vec3 alb, out float h, out float aux){
      float n1 = fbm(p * 1.9 + 5.0, 5), n2 = fbm(p * 5.5 + 1.0, 4), n3 = fbm(p * 13.0 + 6.0, 4);
      // dark basalt plains wind-swept out of the bright dust, pale dust basins
      float dark = smoothstep(0.48, 0.62, n1 + (n2 - 0.5) * 0.3) * (1.0 - smoothstep(0.6, 0.95, abs(p.y)));
      alb = mix(vec3(0.66, 0.3, 0.14), vec3(0.92, 0.58, 0.33), n2 * 0.7 + n3 * 0.3);
      alb = mix(alb, vec3(0.27, 0.15, 0.11), dark * 0.85);
      alb = mix(alb, vec3(0.97, 0.7, 0.45), smoothstep(0.6, 0.75, fbm(p * 1.3 + 30.0, 4)) * (1.0 - dark) * 0.5);
      aux = smoothstep(0.87, 0.93, abs(p.y) + (n2 - 0.5) * 0.1);
      alb = mix(alb, vec3(0.96, 0.94, 0.92), aux);
      h = relief(p, px, aux);
    }`,
  venus: /* glsl */ `
    void surface(vec3 p, float px, out vec3 alb, out float h, out float aux){
      // the cloud tops race round the planet, fastest at the equator: the lanes sweep back towards the poles
      float a = uTime * 0.035 + (1.0 - p.y * p.y) * 1.7;
      vec3 q = vec3(p.x * cos(a) - p.z * sin(a), p.y, p.x * sin(a) + p.z * cos(a));
      float lanes = fbm(vec3(q.x * 1.5, q.y * 5.5, q.z * 1.5) + 2.0, 5);
      float fine = fbm(vec3(q.x * 4.0, q.y * 15.0, q.z * 4.0) + 8.0, 4);
      float v = lanes * 0.68 + fine * 0.32;
      alb = mix(vec3(0.72, 0.56, 0.3), vec3(0.99, 0.93, 0.76), smoothstep(0.3, 0.72, v));
      alb = mix(alb, vec3(1.0, 0.96, 0.84), smoothstep(0.78, 0.95, abs(p.y)) * 0.5);
      h = 0.0; aux = 0.0;
    }`,
};

/** Per kind: how dusty the light falls off (Lommel–Seeliger share), how far the relief tilts it, the air's wrap and haze. */
const LOOK: Record<BodyKind, { dusty: number; bump: number; wrap: number; haze: [number, number, number]; hazeK: number }> = {
  moon: { dusty: 0.7, bump: 1.5, wrap: 0, haze: [0, 0, 0], hazeK: 0 },
  mercury: { dusty: 0.6, bump: 1.5, wrap: 0, haze: [0, 0, 0], hazeK: 0 },
  mars: { dusty: 0.25, bump: 1.5, wrap: 0.12, haze: [0.95, 0.66, 0.5], hazeK: 0.4 },
  venus: { dusty: 0, bump: 0, wrap: 0.42, haze: [1.0, 0.9, 0.66], hazeK: 0.9 },
};

/**
 * A world's material. Set `uSun` each frame: xyz = the Sun's position with w = 1, or the direction
 * to it with w = 0. `uFill`/`uFillDir` is light from a neighbour (earthshine on the Moon), in world space.
 */
export function bodyMaterial(kind: BodyKind) {
  const k = LOOK[kind];
  return new THREE.ShaderMaterial({
    defines: quality.level === 'low' ? {} : { FINE: 1 },
    uniforms: {
      uSun: { value: new THREE.Vector4(0, 0, 0, 1) }, uLight: { value: new THREE.Color(1.2, 1.15, 1.08) }, uFill: { value: new THREE.Color(0.012, 0.014, 0.02) },
      uFillDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 },
      uMaria: { value: MARIA.map(([lon, lat, w]) => new THREE.Vector4(...sel(lon, lat).toArray(), w * RAD)) },
      uRays: { value: RAYS.map(([lon, lat, w]) => new THREE.Vector4(...sel(lon, lat).toArray(), w)) },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${SURFACE[kind]}
      void main(){
        vec3 p = normalize(vP), L = normalize(vL), V = normalize(vV), N = p;
        float px = length(fwidth(p));
        vec3 alb; float h, aux;
        surface(p, px, alb, h, aux);
        ${k.bump > 0 ? /* glsl */ `
        // the slope of the height field, from two more soundings a step along the ground, tilts the normal
        float e = max(px * 0.8, 0.0012), tilt = ${k.bump.toFixed(2)} * lod(4.0, px);
        if (tilt > 0.0) {
          vec3 t1 = normalize(cross(p, vec3(0.31, 1.0, 0.17))), t2 = cross(p, t1);
          N = normalize(p - (t1 * (relief(normalize(p + t1 * e), px, aux) - h) + t2 * (relief(normalize(p + t2 * e), px, aux) - h)) / e * tilt);
        }` : ''}
        float ndl = dot(N, L), ndlG = dot(p, L), ndv = max(dot(p, V), 0.0);
        // airless: a crisp terminator; through air: light creeps round it
        float term = smoothstep(${(-0.015 - k.wrap).toFixed(3)}, ${(0.06 + k.wrap * 0.9).toFixed(3)}, ndlG);
        float lam = max(mix(ndl, ndlG * 0.5 + 0.5, ${k.wrap.toFixed(2)}), 0.0);
        // dust scatters back the way the light came: a full disc is evenly bright, with no dark limb
        float seel = min(2.0 * lam / (lam + ndv + 0.001), 1.5);
        float diff = mix(lam, seel, ${k.dusty.toFixed(2)}) * term;
        vec3 c = alb * (uLight * diff + uFill * (0.6 + 0.4 * dot(p, normalize(vF))));
        // haze piling up towards the limb on the sunlit side
        c += vec3(${k.haze.join(', ')}) * pow(max(1.0 - ndv, 0.0), 3.0) * smoothstep(-0.1, 0.35, ndlG) * ${k.hazeK.toFixed(2)};
        gl_FragColor = vec4(c, 1.0);
        ${OUTPUT}
      }`,
  });
}

/**
 * A halo of air round a planet (a back-face shell `shell` × its radius): a thin bright rim, on the
 * lit side only. Set `uSun` as for the body.
 */
export function airMaterial(color: THREE.ColorRepresentation, strength: number, shell = 1.12) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uSun: { value: new THREE.Vector4(0, 0, 0, 1) }, uColor: { value: new THREE.Color(color) }, uK: { value: strength }, uShell: { value: shell } },
    vertexShader: /* glsl */ `uniform vec4 uSun; uniform float uShell; varying vec3 vP; varying vec3 vCam; varying vec3 vL;
      void main(){ float pr = length(position) / uShell; vP = position / pr; vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz / pr;
        // the way to the Sun in the planet's own frame (from its centre: near enough across so small a ball)
        vL = normalize(transpose(mat3(modelMatrix)) * (uSun.w > 0.5 ? uSun.xyz - modelMatrix[3].xyz : uSun.xyz));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uK, uShell; varying vec3 vP; varying vec3 vCam; varying vec3 vL;
      void main(){
        // how close this line of sight passes to the planet, in planet radii
        vec3 rd = normalize(vP - vCam);
        vec3 p = vCam + rd * max(-dot(vCam, rd), 0.0);
        float b = length(p), h = max(b - 1.0, 0.0);
        float dens = exp(-h / 0.025) * (1.0 - smoothstep((uShell - 1.0) * 0.6, uShell - 1.0, h));
        gl_FragColor = vec4(uColor * dens * uK * smoothstep(-0.25, 0.3, dot(p / max(b, 1e-4), normalize(vL))), 1.0);
        ${OUTPUT}
      }`,
  });
}

/** A lumpy, cratered rock about `radius` across its middle (smooth-shaded, with its own albedo in vertex colours). */
export function asteroidGeometry(seed: number, radius: number, tone: THREE.Color, stretch: [number, number, number] = [1.3, 0.85, 1]) {
  // (welded, so the lumps shade smoothly: the polyhedron comes as loose triangles with a texture seam)
  const loose = new THREE.IcosahedronGeometry(1, quality.level === 'low' ? 4 : 7);
  loose.deleteAttribute('uv');
  loose.deleteAttribute('normal');
  const g = mergeVertices(loose);
  loose.dispose();
  const pos = g.attributes.position, r = rng(seed * 97 + 5);
  // a few dents (old impacts) and a lobe or two
  const dents = Array.from({ length: 6 }, () => ({ c: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), w: 0.25 + r() * 0.4, d: 0.08 + r() * 0.16 }));
  const col = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let k = 0.78 + fbm2(v.x * 1.3 + seed, v.y * 1.3 + v.z * 0.7, seed, 4) * 0.5 + fbm2(v.z * 4 + 9, v.x * 4 + v.y * 3, seed + 3, 3) * 0.1;
    for (const d of dents) { const a = v.angleTo(d.c) / d.w; if (a < 1) k -= d.d * (1 - a * a); }
    const shade = 0.7 + fbm2(v.x * 5 + 1, v.y * 5 + v.z * 5, seed + 9, 3) * 0.6;
    col.set([tone.r * shade, tone.g * shade, tone.b * shade], i * 3);
    pos.setXYZ(i, v.x * k * radius * stretch[0], v.y * k * radius * stretch[1], v.z * k * radius * stretch[2]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
