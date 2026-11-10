/**
 * The Sun as a living star: a boiling photosphere (granules, sunspot belts, a reddening limb), a
 * corona of streamers and fine rays, prominences looping off the limb, and the lens it is seen
 * through (glare, a starburst, a streak, ghosts across the frame). Everything is far brighter than
 * the planets on purpose: the post pipeline's bloom does the rest.
 */
import * as THREE from 'three';
import { rng } from '../kit';
import { NOISE, OUTPUT } from './glsl';

/** How far the corona's card reaches, in solar radii. */
const CORONA = 9;

const surfaceFS = /* glsl */ `
  uniform float uTime, uStorm, uGain; varying vec3 vP; varying vec3 vN; varying vec3 vV;
  ${NOISE}
  void main(){
    vec3 p = normalize(vP);
    float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    // granulation: bright cells with dark lanes between them, at two scales, each boiling at its own pace
    vec2 c1 = cells(p * 7.0, uTime * 0.3), c2 = cells(p * 18.0 + 5.0, uTime * 0.7);
    float gran = smoothstep(0.02, 0.36, c1.y - c1.x) * 0.6 + smoothstep(0.02, 0.4, c2.y - c2.x) * 0.4;
    float mottle = fbm(p * 2.6 + vec3(0.0, uTime * 0.012, 0.0), 4);
    // sunspots in the two active belts, bright faculae round them (more of both in a storm)
    float belt = smoothstep(0.06, 0.2, abs(p.y)) * smoothstep(0.64, 0.42, abs(p.y));
    float sn = vnoise(p * 4.2 + vec3(11.0 + uTime * 0.004, 3.0, 7.0));
    float spot = smoothstep(0.8 - uStorm * 0.07, 0.86, sn) * belt;
    float fac = smoothstep(0.64, 0.8, sn) * belt * (1.0 - spot);
    float heat = (0.6 + 0.4 * gran) * (0.8 + 0.4 * mottle) + fac * 0.4;
    heat *= 1.0 - spot * 0.8;
    // limb darkening: the edge is dimmer and redder (we see cooler, higher gas there)
    float ld = 0.4 + 0.6 * pow(mu, 0.55);
    vec3 c = mix(vec3(1.0, 0.46, 0.12), vec3(1.0, 0.93, 0.76), clamp(heat * ld * 1.2 - 0.2, 0.0, 1.0)) * heat * ld * uGain;
    gl_FragColor = vec4(c, 1.0);
    ${OUTPUT}
  }`;

const coronaFS = /* glsl */ `
  uniform float uTime, uStorm, uMorph, uGain; uniform vec3 uTint; varying vec2 vUv;
  ${NOISE}
  void main(){
    float r = length(vUv) * ${CORONA.toFixed(1)};
    if (r < 0.9) discard;
    float a = atan(vUv.y, vUv.x);
    vec2 ring = vec2(cos(a), sin(a));
    // a few broad streamers that change as the view goes round, finer ones between, and thin rays
    float s1 = vnoise(vec3(ring * 1.5, uMorph + uTime * 0.012));
    float s2 = vnoise(vec3(ring * 4.5, uMorph * 1.7 - uTime * 0.02 + r * 0.12));
    float rays = vnoise(vec3(ring * 16.0, uTime * 0.05 + r * 0.22 + uMorph * 3.0));
    float streamer = s1 * s1 * 1.7 + s2 * s2 * s2 * 1.1;
    float h = max(r - 1.0, 0.0);
    // spicules: a restless fringe hugging the limb
    float fringe = exp(-h * 16.0) * (0.6 + 0.8 * vnoise(vec3(ring * 42.0, uTime * 0.6)));
    float inner = exp(-h * 4.6) * 1.25;
    float outer = pow(r, -2.5) * (0.3 + streamer * smoothstep(0.0, 1.3, h) * 1.25 + rays * rays * 0.4);
    float I = (fringe * 1.6 + inner + outer) * (1.0 + uStorm * 0.9);
    I *= smoothstep(${CORONA.toFixed(1)}, ${(CORONA * 0.45).toFixed(1)}, r);
    vec3 c = mix(vec3(1.0, 0.84, 0.58), vec3(1.0, 0.55, 0.24), smoothstep(0.0, 3.2, h)) * uTint;
    c = mix(c, vec3(1.0, 0.36, 0.2) * uTint, fringe * 0.5);
    gl_FragColor = vec4(c * I * uGain, 1.0);
    ${OUTPUT}
  }`;

/** A loop of glowing gas standing on the photosphere (unit sun radius): `span` radians foot to foot, `height` at its top. */
function prominenceGeometry(span: number, height: number, lean: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 28; i++) {
    const s = i / 28, a = (s - 0.5) * span, r = 0.985 + height * Math.pow(Math.sin(Math.PI * s), 0.7);
    pts.push(new THREE.Vector3(Math.sin(a) * r, Math.cos(a) * r, Math.sin(Math.PI * s) * lean));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018 + height * 0.09, 7, false);
}

/** The Sun standing in the scene (the solar-system view). */
export class Sun {
  readonly object = new THREE.Group();
  private ball: THREE.Mesh;
  private surface: THREE.ShaderMaterial;
  private corona: THREE.ShaderMaterial;
  private loops: { mesh: THREE.Mesh; phase: number; rate: number }[] = [];
  private loopMat: THREE.ShaderMaterial;

  constructor(readonly radius: number) {
    this.surface = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uStorm: { value: 0 }, uGain: { value: 3.0 } },
      vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: surfaceFS,
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), this.surface);
    this.corona = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uStorm: { value: 0 }, uMorph: { value: 0 }, uGain: { value: 0.6 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      // a card that always faces the camera, centred on the Sun (the near half of the ball hides its middle)
      vertexShader: /* glsl */ `varying vec2 vUv;
        void main(){ vUv = position.xy; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * ${CORONA.toFixed(1)} * length(modelMatrix[0].xyz);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: coronaFS,
    });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.corona);
    card.frustumCulled = false;
    card.renderOrder = 2;
    this.loopMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uGain: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uTime, uGain; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          // a tube of thin gas: brightest through its middle, feet anchored and bright, knots drifting along it
          float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
          float feet = 0.45 + 0.55 * pow(abs(vUv.x - 0.5) * 2.0, 2.0);
          float knots = 0.65 + 0.35 * sin(vUv.x * 34.0 - uTime * 1.4) * sin(vUv.x * 13.0 + uTime * 0.6);
          gl_FragColor = vec4(vec3(1.0, 0.3, 0.1) * core * feet * knots * uGain * 2.6, 1.0);
          ${OUTPUT}
        }`,
    });
    const r = rng(31);
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(prominenceGeometry(0.16 + r() * 0.3, 0.07 + r() * r() * 0.3, (r() - 0.5) * 0.12), this.loopMat);
      // stood anywhere in the active belts, turned any way round
      const lat = (r() < 0.5 ? 1 : -1) * (0.15 + r() * 0.5), lon = r() * Math.PI * 2;
      mesh.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2 - lat, lon, 0, 'YXZ')).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI));
      mesh.renderOrder = 3;
      this.ball.add(mesh);
      this.loops.push({ mesh, phase: r() * 6.28, rate: 0.12 + r() * 0.2 });
    }
    this.object.add(this.ball, card);
    this.object.scale.setScalar(radius);
  }

  /**
   * `storm` 0..1 (Solar Maximum): more spots, a fiercer corona, taller loops. `tint`: the light reaching the
   * viewer (the swarm reddens it where it stands in the way).
   */
  update(dt: number, time: number, camera: THREE.Camera, storm = 0, tint?: THREE.Color) {
    this.ball.rotation.y += dt * 0.025;
    for (const m of [this.surface, this.corona, this.loopMat]) m.uniforms.uTime.value = time;
    this.surface.uniforms.uStorm.value = storm;
    this.corona.uniforms.uStorm.value = storm;
    // the streamers are fixed in space: going round the Sun changes which ones stand out on the limb
    const c = camera.position;
    this.corona.uniforms.uMorph.value = Math.atan2(c.z, c.x) * 1.3 + Math.atan2(c.y, Math.hypot(c.x, c.z)) * 0.9;
    if (tint) this.corona.uniforms.uTint.value.copy(tint);
    for (const l of this.loops) l.mesh.scale.setScalar(1 + Math.sin(time * l.rate + l.phase) * 0.12 + storm * 0.45);
    this.loopMat.uniforms.uGain.value = 1 + storm * 0.8;
  }
}

/**
 * How much of the Sun's disc a viewer sees past round bodies in the way (0..1), and how close its
 * light skims the first one's limb (1 = grazing: through an atmosphere it reddens).
 */
export function sunVisibility(eye: THREE.Vector3, sun: THREE.Vector3, sunRadius: number, bodies: { at: THREE.Vector3; r: number }[]) {
  const toSun = sun.clone().sub(eye), dSun = toSun.length();
  toSun.divideScalar(dSun);
  const angSun = Math.atan2(sunRadius, dSun);
  let vis = 1, graze = 0;
  for (const b of bodies) {
    const to = b.at.clone().sub(eye), d = to.length();
    if (d >= dSun || d <= b.r) continue;
    const sep = Math.acos(Math.max(-1, Math.min(1, to.dot(toSun) / d)));
    const clear = sep - Math.asin(b.r / d);
    const k = Math.max(0, Math.min(1, (clear + angSun) / (2 * angSun)));
    vis = Math.min(vis, k * k * (3 - 2 * k));
    graze = Math.max(graze, 1 - Math.max(0, Math.min(1, clear / (angSun * 6 + 0.02))));
  }
  return { vis, graze };
}

/** One flare element: where on the line from the Sun through the middle of the frame, how big, what shape. */
type Flare = [axis: number, size: number, shape: number, gain: number, r: number, g: number, b: number];
const FLARES: Flare[] = [
  [0, 0.36, 0, 0.3, 1.0, 0.86, 0.62],   // the glare round the disc
  [0, 1.7, 5, 0.03, 1.0, 0.72, 0.46],   // a wide veil
  [0, 0.66, 2, 0.26, 1.0, 0.9, 0.72],   // the starburst
  [0, 1.5, 1, 0.15, 1.0, 0.78, 0.52],   // the streak
  [0, 0.44, 4, 0.018, 1.0, 0.8, 0.6],   // a faint halo ring
  [0.38, 0.05, 3, 0.07, 0.35, 0.85, 0.75],
  [0.6, 0.1, 3, 0.05, 1.0, 0.62, 0.3],
  [0.94, 0.035, 3, 0.1, 0.8, 0.9, 1.0],
  [1.3, 0.15, 4, 0.04, 0.7, 0.5, 1.0],
  [1.62, 0.08, 3, 0.05, 1.0, 0.75, 0.4],
  [2.05, 0.26, 4, 0.03, 0.4, 0.8, 0.9],
];

/** The lens the Sun is seen through: one mesh of screen-space cards, lit by where the Sun stands in the frame. */
export class SunFlare {
  readonly object: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private ndc = new THREE.Vector3();

  constructor() {
    const n = FLARES.length;
    const pos = new Float32Array(n * 12), par = new Float32Array(n * 16), col = new Float32Array(n * 12), idx: number[] = [];
    FLARES.forEach((f, i) => {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], k) => {
        pos.set([x, y, 0], (i * 4 + k) * 3);
        par.set([f[0], f[1], f[2], f[3]], (i * 4 + k) * 4);
        col.set([f[4], f[5], f[6]], (i * 4 + k) * 3);
      });
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPar', new THREE.BufferAttribute(par, 4));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uGain: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uSpin: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aPar; attribute vec3 color; uniform vec2 uSun; uniform float uAspect, uGain; uniform vec3 uTint;
        varying vec2 vUv; varying vec3 vCol; varying float vShape;
        void main(){
          vUv = position.xy; vShape = aPar.z;
          // ghosts sit along the line from the Sun through the middle of the frame, and only show when it's off-centre
          float ghost = step(0.01, aPar.x);
          vCol = color * mix(vec3(1.0), uTint, 1.0 - ghost * 0.5) * aPar.w * uGain * mix(1.0, smoothstep(0.06, 0.5, length(uSun)), ghost);
          vec2 c = uSun * (1.0 - aPar.x);
          gl_Position = vec4(c + position.xy * aPar.y * vec2(1.0 / uAspect, 1.0), 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uSpin; varying vec2 vUv; varying vec3 vCol; varying float vShape;
        void main(){
          float d = length(vUv), I;
          int s = int(vShape + 0.5);
          if (s == 0) I = exp(-d * d * 9.0) + 0.22 / (1.0 + d * d * 60.0) * smoothstep(1.0, 0.6, d);
          else if (s == 1) I = exp(-abs(vUv.y) * 90.0) * exp(-abs(vUv.x) * 3.4) + exp(-abs(vUv.y) * 22.0) * exp(-abs(vUv.x) * 9.0) * 0.3;
          else if (s == 2) { float a = atan(vUv.y, vUv.x) + uSpin;
            I = (pow(abs(cos(a * 3.0)), 90.0) + pow(abs(cos(a * 7.0 + 0.6)), 40.0) * 0.22 + pow(abs(sin(a * 11.0)), 24.0) * 0.1) * exp(-d * 4.2); }
          else if (s == 3) I = smoothstep(1.0, 0.9, d) * (0.35 + 0.65 * smoothstep(0.4, 1.0, d));
          else if (s == 4) I = exp(-pow((d - 0.8) / 0.07, 2.0));
          else I = smoothstep(1.0, 0.0, d) * smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vCol * I, 1.0);
          ${OUTPUT}
        }`,
    });
    this.object = new THREE.Mesh(g, this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 1000;
  }

  /** `at`: where the Sun is in the world. `vis` 0..1: how much of it shows. `tint`: its colour from here. */
  update(camera: THREE.PerspectiveCamera, at: THREE.Vector3, vis: number, gain = 1, tint?: THREE.Color) {
    const p = this.ndc.copy(at).project(camera);
    // behind the camera, or far off the frame: no flare (it lingers a little past the edge, as a real lens does)
    const off = Math.max(Math.abs(p.x), Math.abs(p.y));
    const k = p.z > 1 || p.z < -1 ? 0 : 1 - Math.max(0, Math.min(1, (off - 1) / 0.45));
    const u = this.mat.uniforms;
    u.uGain.value = vis * gain * k * k;
    u.uSun.value.set(p.x, p.y);
    u.uAspect.value = camera.aspect;
    // the starburst turns a little as the Sun crosses the frame
    u.uSpin.value = p.x * 0.35 + p.y * 0.2;
    if (tint) u.uTint.value.copy(tint);
    this.object.visible = u.uGain.value > 0.002;
  }
}
