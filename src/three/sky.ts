/**
 * Sky, sun and the time of day. The day runs on its own slow loop (not the sim's clock, which
 * races through days), or is pinned to a moment.
 */
import * as THREE from 'three';
import { cloudUniforms, col, glowMats, mix, poolMats, rng } from './kit';

interface Key {
  t: number;
  top: string; hor: string; below: string; sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number;
  fog: string; night: number; exposure: number;
}
// a day, 0 = midnight, 0.5 = noon
const KEYS: Key[] = [
  { t: 0.0, top: '#070814', hor: '#1f2752', below: '#121838', sun: '#a9bcff', sunI: 1.1, hemiSky: '#5a6fae', hemiGround: '#2c2c46', hemiI: 1.0, fog: '#1f2752', night: 1, exposure: 1.0 },
  { t: 0.2, top: '#0d1028', hor: '#2a3260', below: '#161c40', sun: '#a9bcff', sunI: 1.0, hemiSky: '#5a6fae', hemiGround: '#33304a', hemiI: 1.0, fog: '#2a3260', night: 0.92, exposure: 1.0 },
  { t: 0.26, top: '#4470bd', hor: '#f6b56a', below: '#a48cb0', sun: '#ffaa70', sunI: 2.4, hemiSky: '#8a96d8', hemiGround: '#7a4a48', hemiI: 0.8, fog: '#c89a98', night: 0.3, exposure: 1.0 },
  { t: 0.34, top: '#4f86d0', hor: '#cfe4f2', below: '#a9c3db', sun: '#ffe2bd', sunI: 2.6, hemiSky: '#a9c8ec', hemiGround: '#a07a55', hemiI: 1.15, fog: '#b9d3e6', night: 0, exposure: 1.0 },
  { t: 0.5, top: '#4f8ad6', hor: '#d6eaf6', below: '#a9c5de', sun: '#fff1dc', sunI: 3.0, hemiSky: '#b3d2f2', hemiGround: '#a8845c', hemiI: 1.2, fog: '#bcd6ea', night: 0, exposure: 1.0 },
  { t: 0.66, top: '#4a7ccb', hor: '#e4e2d6', below: '#adc2d6', sun: '#ffd9a8', sunI: 2.8, hemiSky: '#a8c2e6', hemiGround: '#a87a52', hemiI: 1.1, fog: '#c3d2de', night: 0, exposure: 1.0 },
  { t: 0.735, top: '#3d5fae', hor: '#ffb070', below: '#8e8ab8', sun: '#ff9548', sunI: 3.3, hemiSky: '#7f8fd8', hemiGround: '#7a4a3a', hemiI: 0.72, fog: '#b49ab0', night: 0.08, exposure: 1.0 },
  { t: 0.78, top: '#2b1a4e', hor: '#e47f55', below: '#4b3a6e', sun: '#ff7a4a', sunI: 1.3, hemiSky: '#6a5a9a', hemiGround: '#5a3440', hemiI: 0.8, fog: '#7a5a7a', night: 0.55, exposure: 1.0 },
  { t: 0.84, top: '#0d1028', hor: '#2a3260', below: '#161c40', sun: '#a9bcff', sunI: 1.0, hemiSky: '#5a6fae', hemiGround: '#2c2c46', hemiI: 1.0, fog: '#2a3260', night: 0.95, exposure: 1.0 },
  { t: 1.0, top: '#070814', hor: '#1f2752', below: '#121838', sun: '#a9bcff', sunI: 1.1, hemiSky: '#5a6fae', hemiGround: '#2c2c46', hemiI: 1.0, fog: '#1f2752', night: 1, exposure: 1.0 },
];

function sample(t: number) {
  let i = 0;
  while (i + 1 < KEYS.length && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const s = f * f * (3 - 2 * f);
  const c = (k: keyof Key) => mix(a[k] as string, b[k] as string, s);
  const n = (k: keyof Key) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * s;
  return { top: c('top'), hor: c('hor'), below: c('below'), sun: c('sun'), hemiSky: c('hemiSky'), hemiGround: c('hemiGround'), fog: c('fog'), sunI: n('sunI'), hemiI: n('hemiI'), night: n('night') };
}

export class Sky {
  readonly dome: THREE.Mesh;
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1);
  readonly stars: THREE.Points;
  readonly clouds = new THREE.Group();
  private uni = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, below: { value: new THREE.Color() } };
  /** 0..1 time of day. */
  time = 0.62;
  /** Seconds per full day when cycling (0 = pinned). */
  cycle = 0;
  night = 0;

  constructor(private scene: THREE.Scene) {
    const g = new THREE.SphereGeometry(1500, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.uni,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 below; varying vec3 vP;
        void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(hor, top, pow(smoothstep(0.0, 0.75, y), 0.7)) : mix(hor, below, smoothstep(0.0, -0.5, y));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(g, m);
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target, this.hemi);

    // stars
    const r = rng(42);
    const pts: number[] = [];
    for (let i = 0; i < 1400; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const k = Math.sqrt(1 - y * y);
      pts.push(Math.cos(a) * k * 1400, y * 1400, Math.sin(a) * k * 1400);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);

    // soft clouds drifting around and below the slabs
    const cr = rng(9);
    const cmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(cr() * 5);
      for (let k = 0; k < n; k++) {
        const s = 5 + cr() * 9;
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), cmat);
        b.position.set((k - n / 2) * s * 0.9 + cr() * 4, cr() * s * 0.4, cr() * 8);
        b.scale.y = 0.55;
        c.add(b);
      }
      const ang = cr() * Math.PI * 2, rad = 160 + cr() * 260;
      c.position.set(Math.cos(ang) * rad - 80, -40 - cr() * 50, Math.sin(ang) * rad);
      c.userData.drift = 1 + cr() * 2;
      this.clouds.add(c);
    }
    scene.add(this.clouds);
    scene.fog = new THREE.Fog(0xffffff, 420, 1300);
  }

  /** Point the sun's shadow box at a slab. */
  focus(center: THREE.Vector3, radius: number) {
    this.sun.target.position.copy(center);
    const sc = this.sun.shadow.camera;
    sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius;
    sc.updateProjectionMatrix();
  }

  update(dt: number, renderer: THREE.WebGLRenderer) {
    if (this.cycle > 0) this.time = (this.time + dt / this.cycle) % 1;
    const k = sample(this.time);
    this.night = k.night;
    this.uni.top.value.copy(k.top);
    this.uni.hor.value.copy(k.hor);
    this.uni.below.value.copy(k.below);
    (this.scene.fog as THREE.Fog).color.copy(k.fog);

    // the sun swings from east (left) over the back to the west; the moon takes over at night
    const day = this.time > 0.23 && this.time < 0.8;
    const a = day ? (this.time - 0.23) / 0.57 : ((this.time + 0.2) % 1) / 0.43;
    const az = -1.25 + a * 2.5;
    const el = Math.max(0.12, Math.sin(Math.PI * Math.min(1, Math.max(0, a))) * (day ? 1.05 : 0.8));
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.6 + 0.35).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 300);
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI;
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, k.night - 0.4) * 1.4;
    renderer.toneMappingExposure = 1;

    for (const c of this.clouds.children) {
      c.position.x += dt * c.userData.drift;
      if (c.position.x > 300) c.position.x -= 600;
    }
    const cm = (this.clouds.children[0].children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    cm.color.copy(col('#ffffff')).lerp(col('#4a4a78'), k.night * 0.8);

    cloudUniforms.uCloudTime.value += dt;
    cloudUniforms.uCloudK.value = 0.34 * (1 - k.night);
    for (const m of poolMats) m.opacity = Math.max(0, k.night - 0.25) * 1.33 * m.userData.strength;
    // windows, lamps, screens
    for (const m of glowMats) {
      if (m.userData.manual) continue;
      m.emissiveIntensity = m.userData.nightOnly ? k.night * m.userData.nightOnly : m.userData.glowBase + k.night * 2.4;
    }
  }
}
