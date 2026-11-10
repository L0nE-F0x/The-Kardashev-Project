/**
 * What the globe hangs in: stars (round, soft, steady while the camera turns), the Milky Way, the Sun itself with
 * its glare and a lens flare when it's in view, and the aurora's curtains round the magnetic poles.
 */
import * as THREE from 'three';
import { rng } from '../kit';
import { R } from './earth';

/** The Milky Way's pole (a tilted great circle) and the direction of its bright centre. */
const GALAXY_POLE = new THREE.Vector3(0.35, 0.82, -0.45).normalize();
const GALAXY_CORE = new THREE.Vector3(0.8, -0.1, 0.44).projectOnPlane(GALAXY_POLE).normalize();

/**
 * The starfield: round, soft stars (a small Gaussian per star, the same brightness wherever it falls between
 * pixels), mostly faint, a few bright ones in the colours stars come in, thickening along the Milky Way.
 * `pixelRatio` keeps them the same size on screen whatever the 3D resolution.
 */
export function starField(count = 14000) {
  const r = rng(42);
  const pos: number[] = [];
  const col: number[] = [];
  const size: number[] = [];
  // blue-white giants to red dwarfs, roughly as often as the eye meets them
  const tints: [number, number, number, number][] = [[0.7, 0.8, 1, 0.14], [0.86, 0.9, 1, 0.3], [1, 0.98, 0.95, 0.26], [1, 0.9, 0.72, 0.18], [1, 0.76, 0.52, 0.09], [1, 0.6, 0.42, 0.03]];
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    v.set(Math.cos(a) * k, u, Math.sin(a) * k);
    const band = Math.exp(-((v.dot(GALAXY_POLE) / 0.2) ** 2));
    // most stars are faint; over half the field is the band's own crowd of them, fainter still
    const crowd = i >= count * 0.42;
    const mag = Math.pow(r(), crowd ? 5 : 3.4);
    if (crowd && r() > band) continue;
    pos.push(v.x * 2500, v.y * 2500, v.z * 2500);
    let pick = r(), t = tints[0];
    for (const c of tints) { t = c; if ((pick -= c[3]) <= 0) break; }
    // the brightest few burn past white (bloom gives them a little halo)
    const b = 0.16 + mag * 0.9 + (mag > 0.9 ? (mag - 0.9) * 9 : 0);
    const wash = 0.45 + mag * 0.4; // faint stars show less of their colour
    col.push(b * (1 + (t[0] - 1) * wash), b * (1 + (t[1] - 1) * wash), b * (1 + (t[2] - 1) * wash));
    size.push(0.7 + mag * 1.0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `attribute float size; attribute vec3 color; uniform float pixelRatio; varying vec3 vC; varying float vK;
      void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // a sprite five sigmas wide; sigma = size × 0.6 CSS px, never under 0.65 device px (or it would alias)
        float sig = max(size * 0.6 * pixelRatio, 0.65);
        gl_PointSize = ceil(sig * 5.0) + 1.0; vK = gl_PointSize / sig; }`,
    fragmentShader: `varying vec3 vC; varying float vK;
      void main(){ vec2 q = (gl_PointCoord - 0.5) * vK; float g = exp(-dot(q, q) * 0.5); if (g < 0.01) discard;
        gl_FragColor = vec4(vC * g, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = -2;
  return pts;
}

/**
 * The Milky Way: a dome whose equator is the galaxy's plane. A soft band of unresolved stars, brighter and warmer
 * towards the core, with dust lanes down its middle, all from the tiling detail noise (mipmapped: it can't shimmer).
 * The starfield crowds its own faint stars along the same band.
 */
export function milkyWay(detail: THREE.Texture) {
  const m = new THREE.ShaderMaterial({
    uniforms: { tDetail: { value: detail }, core: { value: GALAXY_CORE.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(GALAXY_POLE, new THREE.Vector3(0, 1, 0))) } },
    vertexShader: `varying vec3 vD; varying vec2 vUv; void main(){ vD = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDetail; uniform vec3 core; varying vec3 vD; varying vec2 vUv;
      void main(){
        vec3 d = normalize(vD);
        // the sphere's own uv: round the band (repeating) and across it
        vec2 uv = vUv;
        float toCore = pow(max(dot(d, core), 0.0), 2.0);
        vec4 n1 = texture2D(tDetail, uv * vec2(5.0, 2.5) + 0.13), n2 = texture2D(tDetail, uv * vec2(16.0, 8.0) + 0.61);
        // the band swells towards the core and wanders a little
        float y = d.y + (n1.g - 0.5) * 0.07;
        float w = mix(0.085, 0.2, toCore);
        float band = exp(-y * y / (w * w));
        float clouds = 0.55 + n1.r * 0.55 + n2.g * 0.35;
        // dust: dark lanes down the middle, torn by the finer noise
        float dust = smoothstep(0.42, 0.68, n1.b * 0.6 + n2.r * 0.4) * exp(-y * y / (w * w * 0.2));
        vec3 c = mix(vec3(0.52, 0.62, 0.95), vec3(0.95, 0.84, 0.70), toCore * 0.8) * band * clouds * (0.014 + toCore * 0.024) * (1.0 - dust * 0.75);
        // and a breath of colour over the whole sky, so space isn't flat black
        c += vec3(0.0016, 0.002, 0.0042) * (0.4 + n1.a);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), m);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), GALAXY_POLE);
  mesh.frustumCulled = false;
  mesh.renderOrder = -3;
  return mesh;
}

/**
 * The Sun where it really stands: a disc too bright to look at, its glare, and (when it's in view) a restrained
 * lens flare: a streak through it and a few faint ghosts strung along the line through the middle of the picture.
 * The Earth hides the disc by depth; `update` works out how much of it has cleared the limb.
 */
export class Sun {
  readonly group = new THREE.Group();
  private glare: THREE.Mesh;
  private flare: THREE.Mesh | null = null;
  private v = new THREE.Vector3();

  constructor(flare: boolean) {
    this.glare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { k: { value: 1 }, size: { value: 520 } },
      vertexShader: `uniform float size; varying vec2 vP;
        void main(){ vP = position.xy; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * size; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float k; varying vec2 vP;
        void main(){
          float r = length(vP);
          // the disc (anti-aliased), a tight corona, a wide soft glare
          float disc = 1.0 - smoothstep(0.0, 1.0, (r - 0.021) / max(fwidth(r), 1e-5) + 0.5);
          float glare = exp(-r * 34.0) * 3.0 + exp(-r * 9.0) * 0.5 + 0.035 / (1.0 + r * r * 90.0);
          // four fine spikes, as a lens draws them
          float spikes = exp(-abs(vP.y) * 110.0) * exp(-abs(vP.x) * 3.6) + exp(-abs(vP.x) * 110.0) * exp(-abs(vP.y) * 6.5) * 0.6;
          vec3 c = vec3(1.0, 0.95, 0.86) * disc * 30.0 + vec3(1.0, 0.86, 0.66) * (glare + spikes * 0.6) * k;
          gl_FragColor = vec4(c * smoothstep(1.0, 0.7, r), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.glare.frustumCulled = false;
    this.glare.renderOrder = -1;
    this.group.add(this.glare);
    if (flare) {
      this.flare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { sun: { value: new THREE.Vector2() }, aspect: { value: 1 }, k: { value: 0 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `uniform vec2 sun; uniform float aspect, k; varying vec2 vP;
          // a soft disc of light at t along the line from the sun through the centre (t = 1: the sun itself)
          float ghost(vec2 p, vec2 s, float t, float rad){ float d = length(p - s * t) / rad; return 1.0 - smoothstep(0.55, 1.0, d); }
          void main(){
            vec2 p = vec2(vP.x * aspect, vP.y), s = vec2(sun.x * aspect, sun.y);
            vec3 c = vec3(0.45, 0.65, 1.0) * exp(-abs(p.y - s.y) * 80.0) * exp(-abs(p.x - s.x) * 1.6) * 0.1;
            c += vec3(0.30, 0.55, 1.0) * ghost(p, s, 0.42, 0.05) * 0.025 + vec3(1.0, 0.62, 0.30) * ghost(p, s, 0.18, 0.028) * 0.035
              + vec3(0.45, 1.0, 0.70) * ghost(p, s, -0.26, 0.085) * 0.014 + vec3(1.0, 0.50, 0.55) * ghost(p, s, -0.52, 0.045) * 0.022
              + vec3(1.0, 0.85, 0.60) * ghost(p, s, -1.25, 0.14) * 0.012;
            gl_FragColor = vec4(c * k, 1.0);
          }`,
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      }));
      this.flare.frustumCulled = false;
      this.flare.renderOrder = 50;
      this.group.add(this.flare);
    }
  }

  /** `sunDir`: unit vector to the sun (the Earth sits at the origin with radius R). */
  update(sunDir: THREE.Vector3, camera: THREE.PerspectiveCamera) {
    this.glare.position.copy(sunDir).multiplyScalar(2400);
    // how much of the disc clears the limb: the angle between the sun and the Earth's centre against the Earth's size
    const cam = camera.position, far = cam.length();
    const toSun = Math.acos(THREE.MathUtils.clamp(-cam.dot(sunDir) / far, -1, 1)), limb = Math.asin(Math.min(1, R / far));
    const clear = THREE.MathUtils.smoothstep(toSun, limb - 0.004, limb + 0.02);
    (this.glare.material as THREE.ShaderMaterial).uniforms.k.value = 0.25 + 0.75 * clear;
    if (!this.flare) return;
    const s = this.v.copy(this.glare.position).project(camera);
    const inView = s.z < 1 ? THREE.MathUtils.smoothstep(1.25 - Math.max(Math.abs(s.x), Math.abs(s.y)), 0, 0.3) : 0;
    const u = (this.flare.material as THREE.ShaderMaterial).uniforms;
    u.k.value = clear * inView;
    this.flare.visible = u.k.value > 0.003;
    u.sun.value.set(s.x, s.y);
    u.aspect.value = camera.aspect;
  }
}

/**
 * The aurora: curtains of light standing on the auroral ovals (round the magnetic poles, widest at midnight) over
 * a soft band of glow, shown where it's dark. One mesh (per pole two curtains and the band), placed in the vertex
 * shader so the ovals follow the sun round and their folds wander.
 */
export class Aurora {
  readonly mesh: THREE.Mesh;

  constructor(detail: THREE.Texture) {
    const SEG = 240;
    // ring: angle round the oval, 0..1 across the strip, north or south, kind (0, 1 = curtains; 2 = the glow band)
    const ring: number[] = [], idx: number[] = [];
    for (let q = 0; q < 6; q++) {
      const base = ring.length / 4;
      for (let i = 0; i <= SEG; i++) for (let j = 0; j < 2; j++) ring.push((i / SEG) * Math.PI * 2, j, q < 3 ? 1 : -1, q % 3);
      for (let i = 0; i < SEG; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('ring', new THREE.Float32BufferAttribute(ring, 4));
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((ring.length / 4) * 3), 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { tDetail: { value: detail }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, time: { value: 0 }, pole: { value: geomagneticPole() }, strength: { value: 1 } },
      vertexShader: `attribute vec4 ring; uniform sampler2D tDetail; uniform vec3 sunDir, pole; uniform float time; varying vec3 vUv; varying float vK;
        void main(){
          vec3 p = pole * ring.z;
          // a frame round the pole: e1 points away from the sun (midnight on the oval)
          vec3 e1 = -(sunDir - p * dot(sunDir, p)); e1 = length(e1) > 1e-3 ? normalize(e1) : normalize(cross(p, vec3(1.0, 0.0, 0.0)));
          vec3 e2 = cross(p, e1);
          float a = ring.x, u = a / 6.2832, flat_ = step(1.5, ring.w), row = ring.w * 0.31 + ring.z * 0.17;
          // the oval: further from the pole at midnight than at noon; each curtain wanders about it in slow folds
          vec4 f1 = textureLod(tDetail, vec2(u * 3.0, row + time * 0.0016), 3.0), f2 = textureLod(tDetail, vec2(u * 9.0, row + 0.4 - time * 0.003), 3.0);
          float colat = 18.5 + 4.0 * cos(a) + (1.0 - flat_) * ((f1.r - 0.5) * 9.0 + (f2.g - 0.5) * 3.0 + ring.w * 2.0) + flat_ * ((f1.r - 0.5) * 5.0 + (ring.y - 0.5) * 10.0);
          colat = radians(colat);
          vec3 d = p * cos(colat) + (e1 * cos(a) + e2 * sin(a)) * sin(colat);
          // bright round midnight, gone by noon, and only where the sky is dark
          vK = smoothstep(-0.35, 0.7, cos(a)) * (1.0 - smoothstep(-0.26, -0.06, dot(d, sunDir)));
          vUv = vec3(u, ring.y, ring.w);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(d * ${R.toFixed(1)} * (1.013 + (1.0 - flat_) * ring.y * 0.036), 1.0);
        }`,
      fragmentShader: `uniform sampler2D tDetail; uniform float time, strength; varying vec3 vUv; varying float vK;
        void main(){
          if (vK < 0.004) discard;
          // slow patches of activity along the oval
          float busy = smoothstep(0.3, 0.75, texture2D(tDetail, vec2(vUv.x * 5.0 - time * 0.004, 0.71 + vUv.z * 0.2)).g);
          vec3 c;
          if (vUv.z > 1.5) {
            // the band of glow under the curtains, soft across
            float x = (vUv.y - 0.5) * 2.0;
            c = vec3(0.10, 0.85, 0.45) * exp(-x * x * 7.0) * (1.0 - x * x) * (0.35 + busy) * 0.04;
          } else {
            // rays: fine upright streaks of uneven strength, drifting along the curtain
            float rays = texture2D(tDetail, vec2(vUv.x * 44.0 + time * 0.011, 0.37 + time * 0.002)).r * texture2D(tDetail, vec2(vUv.x * 150.0 - time * 0.02, 0.83)).b * 4.0;
            // a sharp lower edge, a long fade upward (taller where a ray burns); green below, violet at the top
            float y = vUv.y, up = smoothstep(0.0, 0.06, y) * exp(-y * (5.2 - min(rays, 1.6) * 2.0)) * (1.0 - y) * (1.0 - y);
            c = mix(vec3(0.14, 1.0, 0.42), vec3(0.55, 0.20, 0.90), smoothstep(0.2, 0.8, y)) * (0.12 + rays * rays * 0.9) * up * (0.2 + busy) * 0.4;
          }
          gl_FragColor = vec4(c * vK * strength, 1.0);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  /** `strength`: 1 close in; the globe turns it down from far out, where the curtains pile up along the limb. */
  update(sunDir: THREE.Vector3, time: number, strength = 1) {
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    u.sunDir.value.copy(sunDir);
    u.time.value = time;
    u.strength.value = strength;
  }
}

/** The north geomagnetic pole (80.7°N 72.7°W) as dir() would give it; the south one is opposite. */
function geomagneticPole() {
  const phi = ((-72.7 + 180) * Math.PI) / 180, th = ((90 - 80.7) * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
}
