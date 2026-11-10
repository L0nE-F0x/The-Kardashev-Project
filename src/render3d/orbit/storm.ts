/**
 * Space weather round the Earth: the auroral ovals (curtains of green rising to rose, standing on a
 * ring round each magnetic pole, brightest on the night side) and, in Solar Maximum's storm, the
 * solar wind itself: streaks pouring in from the Sun, parting round the magnetosphere and trailing
 * off down its tail, while the ovals swell towards the equator.
 */
import * as THREE from 'three';
import { rng } from '../kit';
import { quality } from '../quality';
import { NOISE, OUTPUT } from '../space/glsl';
import { ribbonUniforms } from '../space/ribbons';

const SEG = 200;

/** One curtain round a magnetic pole. `reach`: how far from the pole it stands (radians). */
function curtain(radius: number, axis: THREE.Vector3, reach: number, seed: number) {
  const ang = new Float32Array((SEG + 1) * 2), up = new Float32Array((SEG + 1) * 2), idx: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    ang[i * 2] = ang[i * 2 + 1] = (i / SEG) * Math.PI * 2;
    up[i * 2 + 1] = 1;
    if (i < SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 6), 3));
  g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
  g.setAttribute('aUp', new THREE.BufferAttribute(up, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uAxis: { value: axis }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uR: { value: radius }, uReach: { value: reach }, uTime: { value: 0 }, uK: { value: 0 }, uSeed: { value: seed } },
    vertexShader: /* glsl */ `
      attribute float aAng, aUp; uniform vec3 uAxis, uSun; uniform float uR, uReach, uTime, uSeed; varying float vAng, vUp, vNight;
      void main(){
        vec3 e1 = normalize(cross(uAxis, vec3(0.3, 0.1, 0.9))), e2 = cross(uAxis, e1);
        // the oval wanders and ripples; its top edge flickers higher and lower
        float col = uReach * (1.0 + 0.12 * sin(aAng * 3.0 + uTime * 0.21 + uSeed) + 0.07 * sin(aAng * 8.0 - uTime * 0.33 + uSeed * 2.0));
        vec3 d = uAxis * cos(col) + (e1 * cos(aAng) + e2 * sin(aAng)) * sin(col);
        float top = 0.045 + 0.03 * sin(aAng * 5.0 + uTime * 0.4 + uSeed) + uReach * 0.06;
        vAng = aAng; vUp = aUp; vNight = 1.0 - smoothstep(-0.3, 0.25, dot(d, uSun));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(d * uR * (1.008 + top * aUp), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uK, uSeed; varying float vAng, vUp, vNight;
      ${NOISE}
      void main(){
        // rays: thin bright folds that drift along the curtain
        vec2 ring = vec2(cos(vAng), sin(vAng));
        float rays = vnoise(vec3(ring * 34.0, uTime * 0.3 + uSeed)) * 0.6 + vnoise(vec3(ring * 90.0, uTime * 0.7 - uSeed)) * 0.4;
        float body = smoothstep(0.0, 0.07, vUp) * pow(max(1.0 - vUp, 0.0), 1.5);
        vec3 c = mix(vec3(0.16, 1.0, 0.5), vec3(0.95, 0.22, 0.55), smoothstep(0.2, 0.85, vUp));
        gl_FragColor = vec4(c * body * (0.25 + 1.5 * rays * rays) * uK * (0.22 + 0.78 * vNight), 1.0);
        ${OUTPUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

/** The solar wind in a storm: streaks along the flow round the magnetosphere (`rm`: its nose, from the Earth's centre). */
function wind(radius: number) {
  const count = quality.level === 'high' ? 1100 : quality.level === 'medium' ? 600 : 300;
  const SEGS = 6, rm = radius * 2.1;
  const pos = new Float32Array((SEGS + 1) * 6), idx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    pos.set([i / SEGS, -1, 0, i / SEGS, 1, 0], i * 6);
    if (i < SEGS) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const seed = new Float32Array(count * 4), r = rng(77);
  for (let i = 0; i < count; i++) seed.set([Math.sqrt(r()) * radius * 4.6, r() * Math.PI * 2, r(), 0.07 + r() * 0.06], i * 4);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...ribbonUniforms, uSun: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uK: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform vec3 uSun; uniform float uTime, uK, uPx; varying vec2 vUv; varying float vI;
      const float RM = ${rm.toFixed(1)};
      // a point on a flow line: x along the wind (+ towards the Sun), b its distance from the Sun-Earth line far upstream;
      // the magnetosphere shoulders the flow aside, and its tail keeps it apart
      float aside(float x){ return x > 0.0 ? exp(-x * x / (RM * RM * 1.1)) : 1.0 - 0.3 * (1.0 - exp(-x * x / (RM * RM * 12.0))); }
      vec3 flow(float x, vec3 e1, vec3 e2){ float b = sqrt(aSeed.x * aSeed.x + RM * RM * aside(x)); return uSun * x + (e1 * cos(aSeed.y) + e2 * sin(aSeed.y)) * b; }
      void main(){
        vec3 e1 = normalize(cross(uSun, vec3(0.0, 1.0, 0.2))), e2 = cross(uSun, e1);
        float u = fract(aSeed.z + uTime * aSeed.w), x = mix(${(radius * 7).toFixed(1)}, ${(-radius * 8).toFixed(1)}, u) + position.x * ${(radius * 0.5).toFixed(1)};
        vec3 p = flow(x, e1, e2), q = flow(x + 2.0, e1, e2);
        vec3 vc = (modelViewMatrix * vec4(p, 1.0)).xyz, vt = mat3(modelViewMatrix) * (q - p);
        vec3 s = cross(vt, vc); float l = length(s);
        vc += (l > 1e-6 ? s / l : vec3(0.0, 1.0, 0.0)) * position.y * 2.2 * max(-vc.z, 0.01) * uPx;
        vUv = position.xy;
        // brightest where the flow piles up against the nose, fading in from the Sun and out down the tail
        float off = (length(p) - RM) / (RM * 0.35), pile = exp(-off * off) * smoothstep(-RM, RM * 0.5, x);
        vI = uK * (0.22 + 1.3 * pile) * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.7, 1.0, u));
        gl_Position = projectionMatrix * vec4(vc, 1.0);
      }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; varying float vI;
      void main(){
        float a = clamp(1.6 - abs(vUv.y) * 2.2, 0.0, 1.0) * (1.0 - vUv.x) * (1.0 - vUv.x);
        gl_FragColor = vec4(mix(vec3(1.0, 0.42, 0.2), vec3(1.0, 0.8, 0.62), vI * 0.6) * a * vI, 1.0);
        ${OUTPUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

export class SpaceWeather {
  readonly object = new THREE.Group();
  private curtains: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private wind: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  /** `north`: the direction of the north magnetic pole. */
  constructor(radius: number, north: THREE.Vector3) {
    for (const pole of [1, -1]) for (const [reach, seed] of [[0.3, 1], [0.38, 5]]) {
      const c = curtain(radius, north.clone().multiplyScalar(pole), reach, seed * pole) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
      c.userData.reach = reach;
      this.curtains.push(c);
      this.object.add(c);
    }
    this.wind = wind(radius) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    this.object.add(this.wind);
  }

  /** `storm`: null on a quiet day (a faint oval round each pole), else 0..1. */
  update(time: number, sun: THREE.Vector3, storm: number | null) {
    const k = storm ?? 0;
    this.curtains.forEach((c, i) => {
      const u = c.material.uniforms, outer = i % 2 === 1;
      u.uTime.value = time * (1 + k * 1.5);
      u.uSun.value.copy(sun);
      // quiet: one thin oval; a storm lights the second and pushes both towards the equator
      u.uK.value = outer ? k * 1.5 : 0.3 + k * 1.5;
      u.uReach.value = (c.userData.reach as number) * (1 + k * 0.55);
      c.visible = u.uK.value > 0.01;
    });
    this.wind.visible = storm !== null;
    const w = this.wind.material.uniforms;
    w.uTime.value = time;
    w.uSun.value.copy(sun);
    w.uK.value = 0.35 + k * 0.5;
  }
}
