/**
 * The swarm: thousands of thin-film collectors on real orbits just inside the Earth's, drawn in one
 * instanced call and moved, turned and lit on the GPU. They ride a few dozen orbital planes, so the
 * ring is woven from threads: the first lies in the ecliptic, later ones tilt further until the last
 * arc over the Sun like the ribs of a shell. Each collector faces the Sun with its own slow wobble:
 * from the far side you see lit gold faces and moving glints, from the near side dark backs with
 * ember light soaking through, standing in front of the Sun.
 * The sim's twelve arcs (`segments`, each 0..1) fill in order round the ring from just behind Earth.
 */
import * as THREE from 'three';
import { rng } from '../kit';
import { quality } from '../quality';
import { OUTPUT } from '../space/glsl';
import { ribbonUniforms } from '../space/ribbons';

const SEGS = 12;
/** Orbital planes: the flat band first, then the tilted ribs (radians of inclination). */
const BAND = 28, RIBS = [0.34, -0.42, 0.7, -0.86];

export class Swarm {
  readonly object: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private fill = new Float32Array(SEGS);

  /** `radius`: the ring's mean distance from the Sun. `size`: a collector's half-width. */
  constructor(radius: number, size: number) {
    const count = quality.level === 'high' ? 19000 : quality.level === 'medium' ? 9500 : 3400;
    // the ribs are sparse strings; the band's threads carry the crowd
    const perBand = Math.floor(count / (BAND + RIBS.length * 0.45)), perRib = Math.floor(perBand * 0.45);
    const n = perBand * BAND + perRib * RIBS.length;
    const orb = new Float32Array(n * 4), seed = new Float32Array(n * 4);
    const r = rng(5);
    let i = 0;
    for (let k = 0; k < BAND + RIBS.length; k++) {
      const rib = k >= BAND, per = rib ? perRib : perBand;
      // the band's planes fan out a few degrees either side of the ecliptic, each at its own distance
      const inc = rib ? RIBS[k - BAND] : (k % 2 ? 1 : -1) * 0.15 * Math.pow(k / BAND, 1.5);
      const node = r() * Math.PI * 2;
      const rad = radius * (rib ? 1.0 + (k - BAND) * 0.004 : 0.965 + 0.07 * r());
      const rank = k / BAND;
      for (let j = 0; j < per; j++, i++) {
        // mean longitude behind the Earth (0 = at the Earth, growing backwards round the ring)
        const lon = ((j + r() * 0.7) / per) * Math.PI * 2;
        const seg = Math.min(SEGS - 1, Math.floor((lon / (Math.PI * 2)) * SEGS));
        const along = (lon / (Math.PI * 2)) * SEGS - seg;
        // a segment fills as a wedge: its first thread end to end, then the next threads behind it; a rib's sails
        // come in any order once the ring is nearly whole (the +16 marks them)
        const order = rib ? r() : Math.min(0.985, along * 0.2 + Math.pow(rank, 0.8) * 0.78 + r() * 0.02);
        orb.set([rad * (1 + (r() - 0.5) * 0.004), inc, node, -lon - node], i * 4);
        seed.set([seg + (rib ? 16 : 0), order, r(), r()], i * 4);
      }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aOrb', new THREE.InstancedBufferAttribute(orb, 4));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        ...ribbonUniforms, uFill: { value: this.fill }, uLon: { value: 0 }, uTime: { value: 0 }, uSize: { value: size }, uDamage: { value: 0 },
        uWave: { value: 10 }, uGain: { value: 1 }, uRibs: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aOrb, aSeed; uniform float uFill[${SEGS}]; uniform float uLon, uTime, uSize, uPx, uDamage, uWave, uGain, uRibs;
        varying vec3 vCol; varying vec2 vUv;
        void main(){
          float rib = step(15.5, aSeed.x), fill = uFill[int(aSeed.x - rib * 16.0 + 0.5)];
          float grow = mix(smoothstep(aSeed.y, aSeed.y + 0.03, fill), smoothstep(aSeed.y, aSeed.y + 0.03, uRibs) * step(0.5, fill), rib);
          // where it is: along its circle, the circle tipped over, the tipped circle turned to its node
          float th = aOrb.w, ci = cos(aOrb.y), si = sin(aOrb.y), nd = aOrb.z + uLon, cn = cos(nd), sn = sin(nd);
          vec3 p = vec3(cos(th), sin(th) * si, sin(th) * ci);
          vec3 pos = vec3(p.x * cn - p.z * sn, p.y, p.x * sn + p.z * cn) * aOrb.x;
          vec3 toCam = cameraPosition - pos; float dist = length(toCam); vec3 V = toCam / dist;
          // it faces the Sun, tipped a little off true and slowly coning round: the glint comes and goes
          vec3 S = -normalize(pos);
          vec3 t1 = normalize(cross(S, vec3(0.0, 1.0, 0.0))), t2 = cross(S, t1);
          float psi = aSeed.z * 6.2831853 + uTime * (0.22 + aSeed.w * 0.8);
          vec3 n = normalize(S + (t1 * cos(psi) + t2 * sin(psi)) * (0.1 + 0.55 * fract(aSeed.z * 7.13 + aSeed.w * 3.7)));
          // the ending's wave: until it passes (counted in radians round the ring from the Earth) a collector is
          // feathered edge-on and dark; as it passes, it swings to the Sun and flares
          float lon = aOrb.w + aOrb.z; float away = abs(atan(sin(lon), cos(lon)));
          float lit = smoothstep(away - 0.02, away + 0.1, uWave), flash = exp(-max(uWave - away, 0.0) * 5.5) * lit;
          vec3 b1 = normalize(cross(n, t2)), b2 = cross(n, b1);
          // never smaller than a pixel or so (far off they'd shimmer), never in the lens's face
          float px = dist * uPx, size = max(uSize, px * 0.85);
          float k = grow * smoothstep(30.0, 70.0, dist) * mix(0.55, 1.0, lit);
          vec3 wp = pos + (b1 * position.x + b2 * position.y) * size * k;
          vUv = position.xy;
          float face = dot(n, V), ndl = max(dot(n, S), 0.0);
          float spec = pow(max(dot(reflect(-S, n), V), 0.0), 70.0);
          vec3 front = vec3(1.0, 0.7, 0.28) * (0.2 + 0.5 * ndl) + vec3(1.0, 0.88, 0.66) * spec * 11.0;
          vec3 back = vec3(0.5, 0.13, 0.04) * (0.35 + 0.4 * ndl);
          vec3 c = (face > 0.0 ? front : back) * min(1.0, (uSize / size) * (uSize / size) + 0.3);
          c = mix(vec3(0.05, 0.022, 0.012), c, lit) + vec3(1.0, 0.82, 0.5) * flash * 7.0;
          // knocked dark by the storm: dead, with the odd spark
          float dead = step(aSeed.w, uDamage);
          c = mix(c, vec3(0.5, 0.75, 1.0) * step(0.965, fract(uTime * 2.3 + aSeed.z * 31.0)) * 3.0 + c * 0.06, dead);
          vCol = c * uGain;
          gl_Position = k > 0.001 ? projectionMatrix * viewMatrix * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying vec2 vUv;
        void main(){
          // a six-sided sail with a darker frame
          vec2 a = abs(vUv); float hex = max(a.x * 0.866 + a.y * 0.5, a.y);
          if (hex > 0.94) discard;
          gl_FragColor = vec4(vCol * (hex > 0.8 ? 0.55 : 1.0), 1.0);
          ${OUTPUT}
        }`,
    });
    this.object = new THREE.Mesh(g, m);
    this.object.frustumCulled = false;
  }

  /**
   * `segments`: the sim's twelve arcs. `earthAngle`: where the Earth is on its orbit (the ring keeps station with it).
   * `wave`: the ending's ignition front in radians from the Earth (≥ π: all lit).
   */
  update(time: number, segments: number[], earthAngle: number, damage: number, wave = 10, gain = 1) {
    let sum = 0;
    for (let i = 0; i < SEGS; i++) sum += this.fill[i] = segments[i] ?? 0;
    const u = this.object.material.uniforms;
    // the ribs string themselves over the Sun as the last arcs of the ring close
    u.uRibs.value = THREE.MathUtils.smoothstep(sum / SEGS, 0.72, 1);
    u.uTime.value = time;
    u.uLon.value = earthAngle - 0.09;
    u.uDamage.value = damage;
    u.uWave.value = wave;
    u.uGain.value = gain;
  }
}
