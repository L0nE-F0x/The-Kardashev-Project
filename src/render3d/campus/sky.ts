/**
 * A campus sky driven by the real sun at the site: a shader dome (a gradient that brightens toward the sun, the
 * sun and moon as discs, drifting clouds lit from the sun's side, stars and the Milky Way at night), and the light
 * that goes with it: a warm key against a cool sky fill, a blue hour, a moonlit night. Colours, exposure and the
 * haze follow the sun's altitude; the shadows its true direction (the camera looks north, so a southern site's
 * noon sun stands in front of you). Weather dims the sun and greys the sky.
 */
import * as THREE from 'three';
import { cloudUniforms, col, glowMats, mix, poolMats, rng } from '../kit';
import { quality } from '../quality';
import { atmo } from '../atmosphere';
import { cachedEarthTextures, cloudMaterial, earthMaterial } from '../globe/earth';

interface Key {
  alt: number;
  /** The dome: the zenith, the horizon away from the sun (the haze's own colour), how bright the whole sky is. */
  top: string; hor: string; skyI: number;
  /** Light scattered round the sun: on the dome near it, and in the haze looking toward it. */
  glow: string; glowI: number;
  /** The key light (the sun; the moon once the sun is well down). */
  sun: string; sunI: number;
  /** The fill: sky from above, bounce from the ground. */
  hemiSky: string; hemiGround: string; hemiI: number;
  /** How thick the haze is, lamps and windows (0 by day), stars, and the camera's exposure. */
  haze: number; night: number; stars: number; exposure: number;
}
// by the sun's altitude in degrees. The fill stays cool while the key warms: that contrast is the golden hour.
const KEYS: Key[] = [
  { alt: -90, top: '#03050f', hor: '#0e1630', skyI: 1, glow: '#22306a', glowI: 0.5, sun: '#8fa8ff', sunI: 1.25, hemiSky: '#3a4ca8', hemiGround: '#1c2038', hemiI: 0.55, haze: 0.75, night: 1, stars: 1, exposure: 1.5 },
  { alt: -14, top: '#040714', hor: '#111a3a', skyI: 1, glow: '#22306a', glowI: 0.5, sun: '#8fa8ff', sunI: 1.25, hemiSky: '#3a4ca8', hemiGround: '#1c2038', hemiI: 0.55, haze: 0.75, night: 1, stars: 1, exposure: 1.5 },
  { alt: -8, top: '#0a1030', hor: '#23275a', skyI: 0.9, glow: '#6a3a6a', glowI: 0.5, sun: '#8fa8ff', sunI: 0.8, hemiSky: '#4654b4', hemiGround: '#24223c', hemiI: 0.62, haze: 0.85, night: 1, stars: 0.75, exposure: 1.6 },
  { alt: -4, top: '#18205c', hor: '#55487e', skyI: 0.62, glow: '#e0683e', glowI: 0.9, sun: '#ff8a5a', sunI: 0.04, hemiSky: '#6a6cc0', hemiGround: '#4a3040', hemiI: 0.74, haze: 1.0, night: 0.85, stars: 0.22, exposure: 1.9 },
  { alt: -1, top: '#2a418c', hor: '#8a7aa8', skyI: 0.55, glow: '#ff8440', glowI: 1.0, sun: '#ff7a3e', sunI: 0.9, hemiSky: '#7f86d0', hemiGround: '#6a4038', hemiI: 0.72, haze: 1.1, night: 0.5, stars: 0, exposure: 2.1 },
  { alt: 3, top: '#3a5cb0', hor: '#b8a6c0', skyI: 0.55, glow: '#ffa058', glowI: 0.85, sun: '#ff8f48', sunI: 2.5, hemiSky: '#8494dc', hemiGround: '#7a4e3c', hemiI: 0.74, haze: 1.15, night: 0.12, stars: 0, exposure: 2.1 },
  { alt: 10, top: '#3d6cc6', hor: '#d6ccd0', skyI: 0.72, glow: '#ffc88a', glowI: 0.6, sun: '#ffb46e', sunI: 3.3, hemiSky: '#90a6e6', hemiGround: '#8a6044', hemiI: 0.82, haze: 1.05, night: 0, stars: 0, exposure: 1.65 },
  { alt: 24, top: '#3878d4', hor: '#cfe2f0', skyI: 1.05, glow: '#fff0d6', glowI: 0.5, sun: '#ffe0b4', sunI: 3.5, hemiSky: '#a4c0ee', hemiGround: '#a07a54', hemiI: 0.95, haze: 0.9, night: 0, stars: 0, exposure: 1.15 },
  { alt: 50, top: '#2f76d8', hor: '#b9dcf6', skyI: 1.2, glow: '#ffffff', glowI: 0.35, sun: '#fff2de', sunI: 3.7, hemiSky: '#aecdf4', hemiGround: '#a8845c', hemiI: 0.95, haze: 0.78, night: 0, stars: 0, exposure: 1 },
  { alt: 90, top: '#2f76d8', hor: '#b9dcf6', skyI: 1.2, glow: '#ffffff', glowI: 0.35, sun: '#fff2de', sunI: 3.7, hemiSky: '#aecdf4', hemiGround: '#a8845c', hemiI: 0.95, haze: 0.78, night: 0, stars: 0, exposure: 1 },
];

const COLOURS = ['top', 'hor', 'glow', 'sun', 'hemiSky', 'hemiGround'] as const;
const NUMBERS = ['skyI', 'glowI', 'sunI', 'hemiI', 'haze', 'night', 'stars', 'exposure'] as const;
type Sample = Record<(typeof COLOURS)[number], THREE.Color> & Record<(typeof NUMBERS)[number], number>;

function sample(alt: number): Sample {
  let i = 0;
  while (i + 1 < KEYS.length && KEYS[i + 1].alt <= alt) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const f = b.alt > a.alt ? Math.min(1, Math.max(0, (alt - a.alt) / (b.alt - a.alt))) : 0;
  const t = f * f * (3 - 2 * f);
  const out = {} as Sample;
  for (const k of COLOURS) out[k] = mix(a[k], b[k], t);
  for (const k of NUMBERS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'dust';

const DOME_VS = /* glsl */ `varying vec3 vP;
void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;

const DOME_FS = /* glsl */ `
uniform vec3 top; uniform vec3 hor; uniform float skyI;
uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 glowCol; uniform float sunDisc;
uniform vec3 moonDir; uniform float moonK;
uniform float stars; uniform float time;
uniform sampler2D tNoise;
// x: cover 0..1, y: opacity, z: how dark the bases are, w: drift
uniform vec4 cloud; uniform vec3 cloudLit; uniform vec3 cloudDark;
varying vec3 vP;

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cloudN(vec2 uv) {
  return texture2D(tNoise, uv).r * 0.56 + texture2D(tNoise, uv * 2.7 + 0.31).r * 0.29 + texture2D(tNoise, uv * 6.3 + 0.67).r * 0.15;
}
void main() {
  vec3 d = normalize(vP);
  float y = d.y;
  float up = clamp(y, 0.0, 1.0);
  // the gradient: the horizon band is thin, the zenith colour comes quickly
  vec3 c = mix(hor, top, 1.0 - pow(1.0 - up, 5.0));
  float cs = max(dot(d, sunDir), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.55, up);
  // light scattered round the sun: a wide warm wash low down, a tight bright halo
  c = c * skyI + glowCol * (pow(cs, 5.0) * 0.42 * low + pow(cs, 40.0) * 0.5 + pow(cs, 400.0) * 1.2);
  float cover = 0.0;
  if (y > 0.0 && cloud.y > 0.0) {
    // a flat layer seen from below, curved a little so it reaches the horizon gently
    vec2 uv = d.xz / (y + 0.16) * 0.085 + vec2(time * cloud.w, time * cloud.w * 0.37);
    float n = cloudN(uv);
    float edge = mix(0.66, 0.36, cloud.x);
    cover = smoothstep(edge - 0.03, edge + 0.1, n);
    // thicker toward the sun = in its own shade; thin edges catch the light
    vec2 toSun = normalize(sunDir.xz + vec2(1e-4)) * 0.035;
    float shade = clamp((cloudN(uv + toSun) - n) * 5.0 + 0.5 + (n - edge) * 2.2 * cloud.z, 0.0, 1.0);
    vec3 cc = mix(cloudLit, cloudDark, shade);
    cc += sunCol * 0.02 * pow(cs, 12.0) * (1.0 - shade);
    cover *= cloud.y * smoothstep(0.0, 0.16, y);
    // far clouds sink into the haze
    cc = mix(hor * skyI, cc, smoothstep(0.02, 0.3, y) * 0.85 + 0.15);
    c = mix(c, cc, cover);
  }
  float clear = 1.0 - cover;
  if (stars > 0.01 && y > -0.05) {
    // stars: one in a few cells of a fine grid on the sphere, twinkling; a faint band of the Milky Way
    vec3 p = d * 190.0; vec3 ip = floor(p); vec3 fp = fract(p) - 0.5;
    float h = hash3(ip);
    float mag = pow(fract(h * 91.7), 6.0);
    float tw = 0.75 + 0.25 * sin(time * (1.5 + h * 3.0) + h * 40.0);
    float star = step(0.9, h) * smoothstep(0.26, 0.0, length(fp + (vec3(fract(h * 7.1), fract(h * 13.3), fract(h * 23.7)) - 0.5) * 0.5)) * (0.25 + mag * 2.6) * tw;
    vec3 tint = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.86, 0.7), fract(h * 57.0));
    vec3 axis = normalize(vec3(0.35, 0.5, -0.8));
    float band = exp(-pow(dot(d, axis) * 3.4, 2.0));
    float mw = band * (0.35 + 0.65 * texture2D(tNoise, d.xz * 0.9 + d.y * 0.5).r) * texture2D(tNoise, d.zy * 2.3 + 0.2).r;
    c += (tint * star + vec3(0.42, 0.5, 0.78) * mw * 0.16) * stars * clear * smoothstep(-0.05, 0.12, y);
  }
  if (moonK > 0.01) {
    float cm = dot(d, moonDir);
    float disc = smoothstep(0.99962, 0.99974, cm);
    // a hint of maria so it isn't a flat disc
    float mare = texture2D(tNoise, (d.xy - moonDir.xy) * 9.0 + 0.5).r;
    c += (vec3(0.9, 0.93, 1.0) * disc * (2.1 + (mare - 0.5) * 1.6) + vec3(0.35, 0.45, 0.8) * (pow(max(cm, 0.0), 900.0) * 0.5 + pow(max(cm, 0.0), 60.0) * 0.07)) * moonK * clear;
  }
  // the sun itself: far over 1, so it blooms
  c += sunCol * smoothstep(0.99986, 0.99993, cs) * sunDisc * clear;
  // under the horizon: the haze the far land fades into (the same sum as the fog's)
  if (y < 0.0) c = mix(c, hor * skyI + glowCol * pow(cs, 5.0) * 0.42, smoothstep(0.0, -0.02, y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CampusSky {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1);
  /** Kept for callers that add to it; the clouds themselves are painted on the dome. */
  readonly clouds = new THREE.Group();
  private dome: THREE.Mesh;
  private uni = {
    top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, skyI: { value: 1 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, glowCol: { value: new THREE.Color() }, sunDisc: { value: 1 },
    moonDir: { value: new THREE.Vector3(0, 1, 0) }, moonK: { value: 0 },
    stars: { value: 0 }, time: { value: 0 }, tNoise: cloudUniforms.uCloudTex,
    cloud: { value: new THREE.Vector4(0.4, 1, 0.5, 0.0016) }, cloudLit: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() },
  };
  night = 0;
  /** What the camera should expose for (the scene hands it to the post look). */
  exposure = 1;
  private fog: THREE.Fog;

  /** 'earth' (the default), 'lunar' (the Moon), 'space' (the yards, the ring), 'habitat' (inside Aurora), 'asteroid'. */
  private readonly lunar: boolean;
  constructor(scene: THREE.Scene, private weather: Weather = 'clear', readonly mode: 'earth' | 'lunar' | 'space' | 'habitat' | 'asteroid' | boolean = 'earth', extra: { place?: string; swarm?: number; habitats?: number } = {}) {
    if (mode === true) mode = 'lunar';
    if (mode === false) mode = 'earth';
    this.mode = mode;
    this.lunar = mode === 'lunar' || mode === 'space' || mode === 'asteroid';
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 48, 24),
      new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uni, vertexShader: DOME_VS, fragmentShader: DOME_FS }),
    );
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.2;
    scene.add(this.sun, this.sun.target, this.hemi);
    const cover = weather === 'clear' ? 0.42 : weather === 'dust' ? 0.2 : weather === 'cloudy' ? 0.78 : 1;
    this.uni.cloud.value.set(cover, this.lunar || mode === 'habitat' ? 0 : 1, weather === 'rain' || weather === 'snow' ? 1 : 0.55, 0.0016);
    this.fog = new THREE.Fog(0xffffff, 380, 1900);
    scene.fog = this.fog;
    if (this.lunar && mode !== 'asteroid') {
      // the Earth hangs in the black: low over the Moon's horizon, big beside the yards
      const big = mode === 'space' && extra.place !== 'ring';
      const er = big ? 260 : 70;
      const pos = new THREE.Vector3(big ? -500 : -900, big ? -330 : 260, -2200);
      const tex = cachedEarthTextures();
      if (tex) {
        // the real Earth (the globe's textures), lit from the side so its night half shows its cities
        const mat = earthMaterial(tex, 1440, 720);
        mat.uniforms.sunDir.value.set(0.8, 0.25, 0.55).normalize();
        mat.fog = false;
        const earth = new THREE.Mesh(new THREE.SphereGeometry(er, 64, 32), mat);
        earth.position.copy(pos);
        earth.rotation.set(0.3, 2.2, 0);
        const cm = cloudMaterial(tex);
        cm.uniforms.sunDir.value.copy(mat.uniforms.sunDir.value);
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(er * 1.01, 64, 32), cm);
        clouds.position.copy(pos);
        clouds.rotation.copy(earth.rotation);
        scene.add(earth, clouds);
      } else {
        const earth = new THREE.Mesh(new THREE.SphereGeometry(er, 48, 28), new THREE.MeshStandardMaterial({ color: 0x5f9ad8, roughness: 0.6, emissive: 0x16304f, emissiveIntensity: 0.4, fog: false }));
        earth.position.copy(pos);
        scene.add(earth);
      }
      if (mode === 'space') {
        const moon = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 20), new THREE.MeshStandardMaterial({ color: 0xbfb6ac, roughness: 1, fog: false }));
        moon.position.set(1100, -60, -2500);
        scene.add(moon);
      }
    }
    if (this.lunar && (extra.swarm ?? 0) > 0) {
      // the swarm glitters in a band round the sun
      const r2 = rng(17);
      const n = Math.round(200 + (extra.swarm ?? 0) * 160);
      const pts: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (r2() - 0.5) * 2.4 + 0.4, y = Math.sin(a * 2) * 0.08 + (r2() - 0.5) * 0.05 + 0.25;
        pts.push(Math.sin(a) * 2700, y * 2700, -Math.cos(a) * 2700);
      }
      const sg2 = new THREE.BufferGeometry();
      sg2.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.Points(sg2, new THREE.PointsMaterial({ color: 0xfbd46e, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false })));
    }
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
    const u = this.uni;
    u.time.value += dt;
    if (this.mode === 'habitat') return this.updateHabitat(dt);
    if (this.lunar) return this.updateLunar(dt, sunLocal);
    const k = sample(alt);
    const wet = this.weather === 'rain' || this.weather === 'snow';
    const grey = this.weather === 'cloudy' ? 0.35 : wet ? 0.7 : 0;
    const dust = this.weather === 'dust' ? 0.5 : 0;
    const day = 1 - k.night;
    // weather: the sky greys (less so at night, when it's dark either way), dust turns it ochre
    const g = (c: THREE.Color, to: string) => c.lerp(col(to), grey * (0.25 + 0.75 * day)).lerp(col('#c8a070'), dust * day);
    this.night = k.night;
    this.exposure = k.exposure;
    u.top.value.copy(g(k.top, day > 0.5 ? '#8a8e9c' : '#1c2030'));
    u.hor.value.copy(g(k.hor, day > 0.5 ? '#b4b4bc' : '#2a2e40'));
    u.skyI.value = k.skyI * (1 - grey * 0.2);
    u.glowCol.value.copy(k.glow).multiplyScalar(k.glowI * (1 - grey * 0.8));
    u.sunDir.value.copy(sunLocal);
    // the disc dims and reddens as it sinks; cloud cover hides it
    u.sunCol.value.copy(k.sun).multiplyScalar(5 + 22 * THREE.MathUtils.smoothstep(alt, 0, 16));
    u.sunDisc.value = Math.max(0, 1 - grey * 1.5);
    // the moon stands roughly opposite the sun at night
    const moon = sunLocal.clone().multiplyScalar(-1);
    // (kept high: a low moon would leave the land unlit half the night)
    moon.y = Math.max(0.75, moon.y);
    moon.normalize();
    u.moonDir.value.copy(moon);
    u.moonK.value = 1 - THREE.MathUtils.smoothstep(alt, -8, -3);
    u.stars.value = k.stars * (1 - grey);
    // clouds: sunlit tops in the key's colour (the sunset's glow from below at twilight), bases in the sky's shade
    const dayAmt = THREE.MathUtils.smoothstep(alt, -3, 9);
    const dusk = Math.max(0, 1 - Math.abs(alt + 1) / 6);
    u.cloudLit.value.copy(k.sun).lerp(col('#ffffff'), 0.4).multiplyScalar(0.07 + 1.25 * dayAmt * (1 - grey * 0.45)).add(k.glow.clone().multiplyScalar(dusk * 0.75));
    u.cloudDark.value.copy(k.top).lerp(k.hor, 0.55).lerp(col('#8a8e9c'), 0.3 * day).multiplyScalar((0.55 + 0.4 * dayAmt) * (1 - (wet ? 0.4 : 0)));
    // the haze takes the horizon's colour, and the glow's looking toward the light
    this.fog.color.copy(u.hor.value).multiplyScalar(u.skyI.value);
    const useMoon = alt <= -4;
    atmo.uAtmoSun.value.copy(alt > -7 ? sunLocal : moon);
    atmo.uAtmoGlow.value.copy(u.glowCol.value);
    atmo.uAtmoSkyTop.value.copy(u.top.value).multiplyScalar(u.skyI.value);
    atmo.uAtmoSkyHor.value.copy(this.fog.color);
    atmo.uAtmoHaze.value.set(k.haze / (wet ? 330 : dust ? 420 : this.weather === 'cloudy' ? 600 : 760), 0.012, 0, 1);
    const lightDir = useMoon ? moon.clone() : sunLocal.clone();
    if (lightDir.y < 0.06) lightDir.y = 0.06;
    lightDir.normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(lightDir, 500);
    this.sun.color.copy(k.sun);
    // under cloud the light is mostly the sky's: soft shadows, an even grey fill
    this.sun.intensity = k.sunI * Math.max(0.12, 1 - grey * 1.2) * (1 - dust * 0.3);
    this.hemi.color.copy(g(k.hemiSky, '#9a9aa6'));
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI * (1 + grey * 1.1);
    cloudUniforms.uCloudTime.value += dt;
    cloudUniforms.uCloudK.value = (this.weather === 'clear' ? 0.34 : 0.45) * (1 - k.night);
    this.lamps(Math.max(0, k.night - 0.2) * 1.25);
    for (const m of glowMats) {
      if (m.userData.manual) continue;
      m.emissiveIntensity = m.userData.nightOnly ? k.night * m.userData.nightOnly : m.userData.glowBase + k.night * 2.4;
    }
  }

  /** How strongly the lamp field lights the campus (0 by day). The pools themselves keep a steady strength. */
  private lamps(k: number) {
    atmo.uLampK.value.x = k * LAMP_GAIN;
    for (const m of poolMats) m.opacity = m.userData.strength;
  }

  /** Inside the habitat: soft daylight from the sun-line overhead, green bounce from the land all round. */
  private updateHabitat(dt: number) {
    const u = this.uni;
    this.night = 0;
    this.exposure = 1;
    u.top.value.set(0xc4e0f2);
    u.hor.value.set(0xd6eaf6);
    u.skyI.value = 1;
    u.glowCol.value.set(0x000000);
    u.sunDisc.value = 0;
    u.moonK.value = 0;
    u.stars.value = 0;
    this.fog.color.set(0xd6e6f0);
    atmo.uAtmoGlow.value.set(0x000000);
    atmo.uAtmoSkyTop.value.copy(u.top.value);
    atmo.uAtmoSkyHor.value.copy(u.hor.value);
    atmo.uAtmoHaze.value.set(1 / 1500, 0, 0, 0.9);
    this.sun.position.copy(this.sun.target.position).add(new THREE.Vector3(60, 500, 80));
    this.sun.color.set(0xfff4e0);
    this.sun.intensity = 2.4;
    this.hemi.color.set(0xcfe8c8);
    this.hemi.groundColor.set(0x5a8a4a);
    this.hemi.intensity = 1.5;
    cloudUniforms.uCloudTime.value += dt;
    cloudUniforms.uCloudK.value = 0.18;
    this.lamps(0);
    for (const m of glowMats) {
      if (m.userData.manual) continue;
      m.emissiveIntensity = m.userData.nightOnly ? 0 : m.userData.glowBase;
    }
  }

  /** The Moon: a black sky full of stars, a hard white sun low over the rim, earthshine for fill. */
  private updateLunar(dt: number, sunLocal: THREE.Vector3) {
    const u = this.uni;
    this.night = 0.55;
    this.exposure = 2.3;
    u.top.value.set(0x010103);
    u.hor.value.set(0x020205);
    u.skyI.value = 1;
    // no air: no wash of light round the sun, only its own glare
    u.glowCol.value.set(0xfff4e0).multiplyScalar(0.03);
    u.sunDir.value.copy(sunLocal);
    u.sunCol.value.set(0xfff8ee).multiplyScalar(40);
    u.sunDisc.value = 1;
    u.moonK.value = 0;
    u.stars.value = 1.25;
    this.fog.color.set(0x020205);
    atmo.uAtmoGlow.value.set(0x000000);
    atmo.uAtmoSkyTop.value.set(0x000000);
    atmo.uAtmoSkyHor.value.set(0x000000);
    atmo.uAtmoHaze.value.set(0, 0, 0, 0);
    this.sun.position.copy(this.sun.target.position).addScaledVector(sunLocal, 500);
    this.sun.color.set(0xfff8ee);
    this.sun.intensity = 3.6;
    // earthshine and the ground's own bounce are all that fill the shadows
    this.hemi.color.set(0x7888a8);
    this.hemi.groundColor.set(0x3a3840);
    this.hemi.intensity = 0.2;
    cloudUniforms.uCloudK.value = 0;
    this.lamps(0.55);
    for (const m of glowMats) {
      if (m.userData.manual) continue;
      m.emissiveIntensity = m.userData.nightOnly ? 0.6 * m.userData.nightOnly : m.userData.glowBase + 1.2;
    }
    void dt;
  }
}

/** Lamp-field units to light: tuned so a street lamp's pool reads on asphalt and doesn't burn out on concrete. */
const LAMP_GAIN = 9;
