/**
 * The sky behind the space views: the Milky Way (a warped band with star clouds, dust lanes, a warm
 * core and a little nebular colour) and a few thousand stars by magnitude and temperature. It sits
 * at infinity (drawn from directions only, at the far plane), dim enough that the UI's text and the
 * scene's own lights always win.
 */
import * as THREE from 'three';
import { rng } from '../kit';
import { quality } from '../quality';
import { NOISE, OUTPUT } from './glsl';

/** Star tints from hot to cool (most stars you can see are white to yellow). */
const TINTS: [number, number, number, number][] = [
  [0.68, 0.78, 1.0, 0.16], [0.86, 0.91, 1.0, 0.22], [1.0, 0.98, 0.94, 0.26], [1.0, 0.91, 0.72, 0.2], [1.0, 0.76, 0.52, 0.11], [1.0, 0.58, 0.42, 0.05],
];

const skyVS = /* glsl */ `
  varying vec3 vDir;
  void main(){
    vDir = position;
    // a direction, not a place: the camera's position never moves the sky
    vec4 mv = modelViewMatrix * vec4(position, 0.0);
    gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
    gl_Position.z = gl_Position.w * 0.99999;
  }`;

function milkyWay(gain: number) {
  const oct = quality.level === 'high' ? 5 : quality.level === 'medium' ? 4 : 3;
  return new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { uGain: { value: gain } },
    vertexShader: skyVS,
    fragmentShader: /* glsl */ `
      uniform float uGain; varying vec3 vDir;
      ${NOISE}
      void main(){
        // the galaxy's own frame: its plane is y = 0, its core lies along +x
        vec3 d = normalize(vDir);
        float core = exp(-pow(acos(clamp(d.x, -1.0, 1.0)) / 0.8, 2.0));
        float w1 = fbm(d * 2.3 + 3.1, 3) - 0.5;
        float y = d.y + w1 * 0.17;
        float width = mix(0.06, 0.135, core);
        float band = exp(-y * y / (width * width));
        float wide = exp(-y * y / (width * width * 7.0));
        // star clouds along the band, dark dust lanes threading its middle
        float clouds = fbm(d * vec3(7.0, 11.0, 7.0) + w1 * 1.5 + 9.0, ${oct});
        float lanes = fbm(d * vec3(9.0, 26.0, 9.0) + w1 * 3.0 + 4.0, ${oct});
        float dust = smoothstep(0.47, 0.7, lanes) * exp(-y * y / (width * width * 0.4));
        float I = band * (0.2 + 1.8 * clouds * clouds) * (0.42 + 1.5 * core) + wide * 0.07 * (0.5 + core);
        I *= 1.0 - dust * 0.86;
        vec3 col = mix(vec3(0.44, 0.55, 0.88), vec3(1.0, 0.79, 0.55), clamp(core * 1.15 + (clouds - 0.5) * 0.35, 0.0, 1.0));
        col = mix(col, vec3(0.78, 0.36, 0.2), dust * 0.55);
        // nebulae: rose emission knots in the band, a cold teal haze off it
        float k1 = pow(fbm(d * 6.0 + 21.0, 3), 5.0) * band * 9.0;
        float k2 = pow(fbm(d * 1.9 + 37.0, 3), 3.0) * (1.0 - band);
        vec3 c = (col * I + vec3(0.9, 0.2, 0.36) * k1 * 0.4 + vec3(0.08, 0.3, 0.42) * k2 * 0.42) * uGain;
        // (never quite black: a deep blue floor reads as space, pure black as a missing picture)
        gl_FragColor = vec4(c + vec3(0.0035, 0.0045, 0.011), 1.0);
        ${OUTPUT}
      }`,
  });
}

function stars(count: number, gain: number) {
  const r = rng(4242);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), mag = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // two populations: the whole sky, and the crowd along the galactic plane (thicker towards the core)
    let x: number, y: number, z: number;
    if (r() < 0.5) {
      y = r() * 2 - 1;
      const a = r() * Math.PI * 2, k = Math.sqrt(1 - y * y);
      x = Math.cos(a) * k; z = Math.sin(a) * k;
    } else {
      const a = (r() - 0.5) * Math.PI * 2 * (r() < 0.5 ? 0.45 : 1);
      const lat = (r() + r() + r() - 1.5) * (0.16 + 0.14 * Math.exp(-a * a));
      x = Math.cos(a) * Math.cos(lat); y = Math.sin(lat); z = Math.sin(a) * Math.cos(lat);
    }
    pos.set([x, y, z], i * 3);
    // magnitudes: a handful of bright ones, a crowd of faint ones
    const m = Math.pow(r(), 7) * 0.9 + r() * 0.1;
    mag[i] = m;
    let pick = r(), t = TINTS[0];
    for (const c of TINTS) { t = c; if ((pick -= c[3]) <= 0) break; }
    // faint stars lose their colour to the eye
    const sat = 0.35 + 0.65 * m;
    col.set([1 + (t[0] - 1) * sat, 1 + (t[1] - 1) * sat, 1 + (t[2] - 1) * sat], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPx: { value: 1 }, uGain: { value: gain } },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float aMag; uniform float uPx, uGain; varying vec3 vCol; varying float vSoft;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 0.0);
        gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
        gl_Position.z = gl_Position.w * 0.99999;
        // bright stars are bigger discs with a soft skirt; faint ones a couple of pixels
        float s = 1.7 + aMag * aMag * 5.0;
        gl_PointSize = s * uPx;
        vSoft = s;
        vCol = color * (0.2 + 2.8 * pow(aMag, 1.7)) * uGain;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vSoft;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * (2.2 + 14.0 / vSoft)) * (1.0 - smoothstep(0.7, 1.0, d));
        gl_FragColor = vec4(vCol * a, 1.0);
        ${OUTPUT}
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/**
 * How the galaxy should lie for a view looking along `forward`: its band crossing a little above the middle of the
 * frame on a slope, its bright core off to the left along it.
 */
export function galaxyFor(forward: THREE.Vector3, slope = 0.45, lift = 0.1, core = 0.5) {
  const f = forward.clone().normalize(), r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), u = new THREE.Vector3().crossVectors(r, f);
  const through = f.clone().addScaledVector(u, lift).normalize();
  const pole = new THREE.Vector3().crossVectors(through, r.multiplyScalar(Math.cos(slope)).addScaledVector(u, Math.sin(slope))).normalize();
  const along = new THREE.Vector3().crossVectors(pole, through);
  const heart = through.multiplyScalar(Math.cos(core)).addScaledVector(along, -Math.sin(core));
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(heart, pole, new THREE.Vector3().crossVectors(heart, pole)));
}

export class Backdrop {
  readonly object = new THREE.Group();
  private starMat: THREE.ShaderMaterial;

  /** `lie`: how the galaxy lies across this view's sky (see `galaxyFor`). `gain`: 1 = the default brightness. */
  constructor(lie: THREE.Quaternion, gain = 1) {
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), milkyWay(0.062 * gain));
    dome.material.side = THREE.BackSide;
    dome.frustumCulled = false;
    dome.renderOrder = -1000;
    const count = quality.level === 'high' ? 7500 : quality.level === 'medium' ? 5000 : 3200;
    const st = stars(count, gain);
    this.starMat = st.material as THREE.ShaderMaterial;
    this.object.add(dome, st);
    this.object.quaternion.copy(lie);
  }

  /** Star discs are sized in screen pixels. */
  resize(pixelRatio: number) {
    this.starMat.uniforms.uPx.value = pixelRatio;
  }
}
