/**
 * Lines of light for the space views, all drawn as camera-facing ribbons with feathered edges (crisp
 * at any zoom, with or without MSAA): orbit lines that are brightest just behind their planet, soft
 * power beams with pulses running down them, and trails behind things that move on circles.
 * Widths are worked out in view space, so a line passing behind the camera is clipped cleanly.
 */
import * as THREE from 'three';
import { OUTPUT } from './glsl';

/** Shared by every ribbon: world units per CSS pixel at unit distance (set from the camera each frame). */
export const ribbonUniforms = { uPx: { value: 0.001 } };

/** Call once a frame: ribbons are sized in screen pixels. */
export function sizeRibbons(camera: THREE.PerspectiveCamera, heightPx: number) {
  ribbonUniforms.uPx.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, heightPx);
}

// (view-space ribbon: step sideways from the centre line, at right angles to it and to the line of sight)
const SIDE = /* glsl */ `
  vec3 ribbonSide(vec3 vc, vec3 vt){ vec3 s = cross(vt, vc); float l = length(s); return l > 1e-6 ? s / l : vec3(0.0, 1.0, 0.0); }`;

export interface OrbitLineOpts {
  color: THREE.ColorRepresentation;
  /** Width in pixels. */
  width?: number;
  opacity?: number;
  /** The faint part's share of the brightness (the rest is the trail behind the body). */
  base?: number;
  /** Dashes round the circle (0 = solid). */
  dash?: number;
}

/** A circle in the object's XZ plane; `uHead` is the angle of the body that rides it. */
export function orbitLine(radius: number, o: OrbitLineOpts) {
  const segs = 256;
  const ang = new Float32Array((segs + 1) * 2), side = new Float32Array((segs + 1) * 2), idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    ang[i * 2] = ang[i * 2 + 1] = (i / segs) * Math.PI * 2;
    side[i * 2] = -1; side[i * 2 + 1] = 1;
    if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * 6), 3));
  g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      ...ribbonUniforms, uRadius: { value: radius }, uWidth: { value: o.width ?? 1.4 }, uColor: { value: new THREE.Color(o.color) }, uOpacity: { value: o.opacity ?? 0.5 },
      uHead: { value: 0 }, uBase: { value: o.base ?? 0.22 }, uDash: { value: o.dash ?? 0 }, uFade: { value: new THREE.Vector2(400, 2400) },
    },
    vertexShader: /* glsl */ `
      attribute float aAng, aSide; uniform float uRadius, uWidth, uPx; varying float vEdge, vAng, vDist;
      ${SIDE}
      void main(){
        vec3 vc = (modelViewMatrix * vec4(vec3(cos(aAng), 0.0, sin(aAng)) * uRadius, 1.0)).xyz;
        vec3 vt = mat3(modelViewMatrix) * vec3(-sin(aAng), 0.0, cos(aAng));
        float half_ = uWidth * 0.5 + 1.0;
        vc += ribbonSide(vc, vt) * aSide * half_ * max(-vc.z, 0.01) * uPx;
        vEdge = aSide * half_; vAng = aAng; vDist = -vc.z;
        gl_Position = projectionMatrix * vec4(vc, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uWidth, uOpacity, uHead, uBase, uDash; uniform vec3 uColor; uniform vec2 uFade; varying float vEdge, vAng, vDist;
      void main(){
        float a = clamp(uWidth * 0.5 + 0.5 - abs(vEdge), 0.0, 1.0);
        // bodies move towards +angle: the line is brightest just behind them and fades round the lap
        float back = mod(uHead - vAng, 6.2831853) / 6.2831853;
        a *= uBase + (1.0 - uBase) * pow(1.0 - back, 5.0);
        if (uDash > 0.0) a *= smoothstep(0.2, 0.28, abs(fract(vAng * uDash / 6.2831853) - 0.5));
        // the far side of an orbit sits back
        a *= uOpacity * mix(1.0, 0.45, smoothstep(uFade.x, uFade.y, vDist));
        gl_FragColor = vec4(uColor * a, 1.0);
        ${OUTPUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
}

/**
 * Power beams: up to `cap` soft shafts between two moving points, in one draw call. A shaft has a
 * bright thread, a wide glow, and pulses travelling from its start to its end.
 */
export class Beams {
  readonly object: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private a: THREE.InstancedBufferAttribute;
  private b: THREE.InstancedBufferAttribute;
  private par: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(readonly cap: number) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.par = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aA', this.a);
    g.setAttribute('aB', this.b);
    g.setAttribute('aPar', this.par);
    g.setAttribute('aCol', this.col);
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { ...ribbonUniforms, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aA, aB, aCol; attribute vec4 aPar; uniform float uPx; varying vec2 vUv; varying vec3 vCol; varying float vLen, vPhase;
        ${SIDE}
        void main(){
          vec3 va = (modelViewMatrix * vec4(aA, 1.0)).xyz, vb = (modelViewMatrix * vec4(aB, 1.0)).xyz;
          vec3 vc = mix(va, vb, position.x);
          // aPar: width at the start and at the end (world units), brightness, a phase for the pulses
          float px = max(-vc.z, 0.01) * uPx;
          float w = max(mix(aPar.x, aPar.y, position.x), px * 1.6);
          vc += ribbonSide(vc, vb - va) * position.y * w;
          vUv = position.xy; vCol = aCol * aPar.z * min(1.0, mix(aPar.x, aPar.y, position.x) / (px * 1.6) + 0.35);
          vLen = length(vb - va); vPhase = aPar.w;
          gl_Position = projectionMatrix * vec4(vc, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying vec3 vCol; varying float vLen, vPhase;
        void main(){
          float x = vUv.y * vUv.y;
          float I = exp(-x * 5.0) * 0.5 + exp(-x * 42.0) * 0.8;
          // pulses running down the shaft, and soft ends
          float along = vUv.x * vLen;
          I *= 0.72 + 0.28 * sin(along * 0.5 - uTime * 5.0 + vPhase) * sin(along * 0.13 - uTime * 1.7 + vPhase * 2.0);
          I *= smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.985, vUv.x) * (1.0 - x);
          gl_FragColor = vec4(vCol * I, 1.0);
          ${OUTPUT}
        }`,
    });
    this.object = new THREE.Mesh(g, m);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
  }

  /** Start a frame's beams; then `add` each one. */
  begin(time: number) {
    this.n = 0;
    this.object.material.uniforms.uTime.value = time;
  }

  add(a: THREE.Vector3, b: THREE.Vector3, w0: number, w1: number, color: THREE.Color, gain: number) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.a.setXYZ(i, a.x, a.y, a.z);
    this.b.setXYZ(i, b.x, b.y, b.z);
    this.par.setXYZW(i, w0, w1, gain, i * 2.4);
    this.col.setXYZ(i, color.r, color.g, color.b);
  }

  end() {
    this.object.geometry.instanceCount = this.n;
    this.a.needsUpdate = this.b.needsUpdate = this.par.needsUpdate = this.col.needsUpdate = true;
  }
}

/**
 * Things going round on circles with a fading trail behind each (satellites, tugs): every one is a
 * short ribbon bent along its own orbit in the vertex shader, so thousands cost nothing on the CPU.
 * Orbit = radius, inclination, node; `phase` + time × `rate` is where it is. `uShadow` (a direction
 * to the Sun, 0 length = off) puts out the ones inside the planet's shadow.
 */
export function trails(items: { r: number; inc: number; node: number; phase: number; rate: number; len: number; color: THREE.Color; gain: number }[], opts: { width?: number; planet?: number } = {}) {
  const SEG = 10;
  const pos = new Float32Array((SEG + 1) * 6), idx: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    pos.set([i / SEG, -1, 0, i / SEG, 1, 0], i * 6);
    if (i < SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const n = items.length;
  const orb = new Float32Array(n * 4), mov = new Float32Array(n * 4), col = new Float32Array(n * 3);
  items.forEach((it, i) => {
    orb.set([it.r, it.inc, it.node, it.phase], i * 4);
    mov.set([it.rate, it.len, it.gain, 0], i * 4);
    col.set([it.color.r, it.color.g, it.color.b], i * 3);
  });
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.setAttribute('aOrb', new THREE.InstancedBufferAttribute(orb, 4));
  g.setAttribute('aMov', new THREE.InstancedBufferAttribute(mov, 4));
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...ribbonUniforms, uTime: { value: 0 }, uWidth: { value: opts.width ?? 1.6 }, uShadow: { value: new THREE.Vector3() }, uPlanet: { value: opts.planet ?? 0 }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aOrb, aMov; attribute vec3 aCol; uniform float uTime, uWidth, uPx, uPlanet, uGain; uniform vec3 uShadow;
      varying vec2 vUv; varying vec3 vCol;
      ${SIDE}
      vec3 onOrbit(float th){
        float ci = cos(aOrb.y), si = sin(aOrb.y), cn = cos(aOrb.z), sn = sin(aOrb.z);
        vec3 p = vec3(cos(th), sin(th) * si, sin(th) * ci);
        return vec3(p.x * cn - p.z * sn, p.y, p.x * sn + p.z * cn) * aOrb.x;
      }
      void main(){
        // position.x: 0 at the head, 1 at the tail's end (aMov.y radians behind)
        float th = aOrb.w + uTime * aMov.x - position.x * aMov.y * sign(aMov.x);
        vec3 p = onOrbit(th), q = onOrbit(th + 0.01);
        vec3 vc = (modelViewMatrix * vec4(p, 1.0)).xyz;
        vec3 vt = mat3(modelViewMatrix) * (q - p);
        float half_ = uWidth * 0.5 + 1.0;
        vc += ribbonSide(vc, vt) * position.y * half_ * max(-vc.z, 0.01) * uPx * (1.0 - position.x * 0.6);
        vUv = vec2(position.x, position.y * half_);
        // in the planet's shadow nothing glints
        vec3 head = onOrbit(aOrb.w + uTime * aMov.x);
        float lit = 1.0;
        if (uPlanet > 0.0) { float along = dot(head, uShadow); lit = along > 0.0 ? 1.0 : smoothstep(uPlanet * 0.97, uPlanet * 1.03, length(head - uShadow * along)); }
        vCol = aCol * aMov.z * uGain * (0.12 + 0.88 * lit);
        gl_Position = projectionMatrix * vec4(vc, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uWidth; varying vec2 vUv; varying vec3 vCol;
      void main(){
        float a = clamp(uWidth * 0.5 + 0.5 - abs(vUv.y), 0.0, 1.0);
        // a bright head, a tail that thins away
        float t = 1.0 - vUv.x;
        gl_FragColor = vec4(vCol * a * (t * t * t * 0.55 + smoothstep(0.93, 1.0, t) * 2.2), 1.0);
        ${OUTPUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
}
