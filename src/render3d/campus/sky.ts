/**
 * A campus sky driven by the real sun at the site: colours, light and night lights follow the
 * sun's altitude, the shadows its true direction (the camera looks north, so a southern site's
 * noon sun stands in front of you). Weather dims the sun and greys the sky.
 */
import * as THREE from 'three';
import { cloudUniforms, col, glowMats, mix, poolMats, rng } from '../kit';

interface Key {
  alt: number;
  top: string; hor: string; below: string; sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number; fog: string; night: number;
}
// by the sun's altitude in degrees
const KEYS: Key[] = [
  { alt: -90, top: '#070814', hor: '#1f2752', below: '#121838', sun: '#a9bcff', sunI: 1.0, hemiSky: '#5a6fae', hemiGround: '#2c2c46', hemiI: 0.95, fog: '#1f2752', night: 1 },
  { alt: -12, top: '#0d1028', hor: '#2a3260', below: '#161c40', sun: '#a9bcff', sunI: 0.95, hemiSky: '#5a6fae', hemiGround: '#33304a', hemiI: 0.95, fog: '#2a3260', night: 0.95 },
  { alt: -5, top: '#2b1a4e', hor: '#e47f55', below: '#4b3a6e', sun: '#ff7a4a', sunI: 0.9, hemiSky: '#6a5a9a', hemiGround: '#5a3440', hemiI: 0.8, fog: '#7a5a7a', night: 0.6 },
  { alt: 1, top: '#3d5fae', hor: '#ffa060', below: '#8e8ab8', sun: '#ff8a48', sunI: 2.2, hemiSky: '#7f8fd8', hemiGround: '#7a4a3a', hemiI: 0.72, fog: '#b49ab0', night: 0.15 },
  { alt: 8, top: '#3d63b4', hor: '#ffbf80', below: '#9890bc', sun: '#ff9f58', sunI: 3.1, hemiSky: '#8496d8', hemiGround: '#8a5a44', hemiI: 0.78, fog: '#bca6b4', night: 0 },
  { alt: 20, top: '#4a7ccb', hor: '#e8dfcf', below: '#aec0d4', sun: '#ffd9a8', sunI: 2.8, hemiSky: '#a8c2e6', hemiGround: '#a87a52', hemiI: 1.05, fog: '#c3d2de', night: 0 },
  { alt: 45, top: '#4f8ad6', hor: '#d6eaf6', below: '#a9c5de', sun: '#fff1dc', sunI: 3.0, hemiSky: '#b3d2f2', hemiGround: '#a8845c', hemiI: 1.2, fog: '#bcd6ea', night: 0 },
  { alt: 90, top: '#4f8ad6', hor: '#d6eaf6', below: '#a9c5de', sun: '#fff1dc', sunI: 3.0, hemiSky: '#b3d2f2', hemiGround: '#a8845c', hemiI: 1.2, fog: '#bcd6ea', night: 0 },
];

function sample(alt: number) {
  let i = 0;
  while (i + 1 < KEYS.length && KEYS[i + 1].alt <= alt) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const f = b.alt > a.alt ? Math.min(1, Math.max(0, (alt - a.alt) / (b.alt - a.alt))) : 0;
  const t = f * f * (3 - 2 * f);
  const c = (k: keyof Key) => mix(a[k] as string, b[k] as string, t);
  const n = (k: keyof Key) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t;
  return { top: c('top'), hor: c('hor'), below: c('below'), sun: c('sun'), hemiSky: c('hemiSky'), hemiGround: c('hemiGround'), fog: c('fog'), sunI: n('sunI'), hemiI: n('hemiI'), night: n('night') };
}

export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'dust';

export class CampusSky {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1);
  readonly clouds = new THREE.Group();
  private dome: THREE.Mesh;
  private stars: THREE.Points;
  private uni = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, below: { value: new THREE.Color() } };
  night = 0;
  private fog: THREE.Fog;
  private cloudMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, private weather: Weather = 'clear') {
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uni,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
        fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 below; varying vec3 vP;
          void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(hor, top, pow(smoothstep(0.0, 0.6, y), 0.7)) : mix(hor, below, smoothstep(0.0, -0.3, y));
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);

    const r = rng(42);
    const pts: number[] = [];
    for (let i = 0; i < 1600; i++) {
      const u = r(), a = r() * Math.PI * 2;
      const y = 0.08 + u * 0.92, k = Math.sqrt(1 - y * y);
      pts.push(Math.cos(a) * k * 2800, y * 2800, Math.sin(a) * k * 2800);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);

    // slow clouds high over the land (more of them in bad weather)
    const cr = rng(9);
    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.94, fog: true });
    const count = weather === 'clear' ? 14 : weather === 'dust' ? 8 : 34;
    for (let i = 0; i < count; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(cr() * 5);
      for (let k = 0; k < n; k++) {
        const s = 9 + cr() * 14;
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), this.cloudMat);
        b.position.set((k - n / 2) * s * 0.95 + cr() * 6, cr() * s * 0.35, cr() * 12);
        b.scale.y = 0.5;
        c.add(b);
      }
      const ang = cr() * Math.PI * 2, rad = 250 + cr() * 900;
      c.position.set(Math.cos(ang) * rad, 140 + cr() * 90, Math.sin(ang) * rad - 200);
      c.userData.drift = 2 + cr() * 3;
      this.clouds.add(c);
    }
    scene.add(this.clouds);
    this.fog = new THREE.Fog(0xffffff, 380, 1900);
    scene.fog = this.fog;
  }

  /** Point the shadow box at the campus. */
  focus(center: THREE.Vector3, radius: number) {
    this.sun.target.position.copy(center);
    const sc = this.sun.shadow.camera;
    sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius; sc.near = 1; sc.far = 900;
    sc.updateProjectionMatrix();
  }

  /** `sunLocal`: unit vector to the sun in campus space (x east, y up, z south); `alt` in degrees. */
  update(dt: number, sunLocal: THREE.Vector3, alt: number) {
    const k = sample(alt);
    const wet = this.weather === 'rain' || this.weather === 'snow';
    const grey = this.weather === 'cloudy' ? 0.35 : wet ? 0.65 : 0;
    const dust = this.weather === 'dust' ? 0.5 : 0;
    const g = (c: THREE.Color, to = '#9a9aa6') => c.lerp(col(to), grey * (1 - k.night * 0.7)).lerp(col('#c8a070'), dust * (1 - k.night));
    this.night = k.night;
    this.uni.top.value.copy(g(k.top));
    this.uni.hor.value.copy(g(k.hor, '#b4b4bc'));
    this.uni.below.value.copy(g(k.below, '#9a9aa6'));
    this.fog.color.copy(g(k.fog, '#a8a8b2'));
    this.fog.near = wet ? 180 : 380;
    this.fog.far = wet ? 1100 : dust ? 1200 : 1900;
    // the moon stands roughly opposite the sun at night
    const lightDir = alt > -4 ? sunLocal.clone() : sunLocal.clone().multiplyScalar(-1).setY(Math.max(0.35, -sunLocal.y));
    if (lightDir.y < 0.06) lightDir.y = 0.06;
    lightDir.normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(lightDir, 500);
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI * (1 - grey * 0.65) * (1 - dust * 0.3);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI * (1 + grey * 0.25);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, k.night - 0.4) * 1.4 * (1 - grey);
    for (const c of this.clouds.children) {
      c.position.x += dt * c.userData.drift;
      if (c.position.x > 1300) c.position.x -= 2600;
    }
    this.cloudMat.color.copy(col('#ffffff')).lerp(col('#4a4a78'), k.night * 0.8).lerp(col('#8a8a96'), grey * 0.6);
    cloudUniforms.uCloudTime.value += dt;
    cloudUniforms.uCloudK.value = (this.weather === 'clear' ? 0.3 : 0.45) * (1 - k.night);
    for (const m of poolMats) m.opacity = Math.max(0, k.night - 0.25) * 1.33 * m.userData.strength;
    for (const m of glowMats) {
      if (m.userData.manual) continue;
      m.emissiveIntensity = m.userData.nightOnly ? k.night * m.userData.nightOnly : m.userData.glowBase + k.night * 2.4;
    }
  }
}
