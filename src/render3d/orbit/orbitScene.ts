/**
 * The orbit view (Act IV–V) in 3D: the Earth filling the frame under the real Sun (a disc that
 * flares over the limb and reddens through the air), city lights on its night side, the Moon beyond
 * in its real phase with the base growing on it; satellites drawing trails round the shells, debris
 * glinting as it tumbles, orbital data centres and space-solar stations as lit models (stations.ts)
 * beaming down to their rectennas, launches climbing out of the spaceport as arcs of fire; in Act V
 * the L4/L5 yards, the habitat cylinders, relays catching the swarm's beams, and Solar Maximum's
 * storm as swollen aurorae and the solar wind breaking round the planet (storm.ts).
 * Click the Moon, a yard or the habitat to go there (as the pixel OrbitScene).
 */
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { PixelPointer } from '../../render/stage';
import type { Scene3D } from '../stage3d';
import { defaultLook, type Look } from '../post';
import { orbitView, type OrbitView } from '../../sim/planetView';
import { orbitExtras } from '../../sim/systemView';
import { siteDef } from '../../content/sites';
import { ANCHORS } from '../../content/charter';
import type { RegionId } from '../../content/mapcodes';
import { subsolar } from '../../world/sun';
import { dir, R } from '../globe/earth';
import { disposeObject, Kit, rng } from '../kit';
import { Labels, type LabelItem } from '../globe/labels';
import { quality } from '../quality';
import { Backdrop, galaxyFor } from '../space/backdrop';
import { Sun, SunFlare, sunVisibility } from '../space/sun';
import { bodyMaterial } from '../space/bodies';
import { Beams, orbitLine, sizeRibbons, trails } from '../space/ribbons';
import { SpaceEarth } from '../space/earth';
import { Lamps } from '../space/lamps';
import { spaceLabelStyle } from '../space/labelStyle';
import { OUTPUT } from '../space/glsl';
import { Fleet } from './stations';
import { SpaceWeather } from './storm';

const RAD = Math.PI / 180;
const MOON_R = 27, MOON_ORBIT = 380;
const LEO = R * 1.12, GEO = R * 1.62;
/** The Sun stands this far off, this big (about twice its true size in the sky: it has to read as a disc). */
const SUN_FAR = 6000, SUN_R = 60;
const HOME_DIST = 430, MIN_DIST = 185, BLOOM = 0.5;
const GOLD = new THREE.Color(1.0, 0.8, 0.45), ICE = new THREE.Color(0.62, 0.9, 1.0), FIRE = new THREE.Color(1.0, 0.66, 0.3);
const WARM = new THREE.Color(5, 3.1, 1.4), CYAN = new THREE.Color(1, 4.6, 4), WHITE = new THREE.Color(7, 7, 7.6);
const ORIGIN = new THREE.Vector3();
const baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
baseMat.userData.shared = true;

/** The rectenna point for a province's space-solar station (as the pixel orbit view). */
function rectennaOf(region: RegionId): [number, number] {
  const [lat, lon] = ANCHORS[region] ?? [0, 0];
  return [lat - 2.5, lon + 3];
}

/** Debris and dead satellites: specks on their own orbits that flash as they tumble, dark inside the Earth's shadow. */
function debrisCloud(n: number) {
  const orb = new Float32Array(n * 4), seed = new Float32Array(n * 4), r = rng(3);
  for (let i = 0; i < n; i++) {
    const shell = i % 3;
    const rad = shell === 0 ? LEO * (0.97 + r() * 0.08) : shell === 1 ? GEO * (0.98 + r() * 0.05) : R * (2.2 + r() * 1.6);
    orb.set([rad, (r() - 0.5) * (shell === 1 ? 0.08 : 1.6), r() * Math.PI * 2, r() * Math.PI * 2], i * 4);
    seed.set([0.2 * Math.pow(LEO / rad, 1.5), r(), r(), r()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aOrb', new THREE.BufferAttribute(orb, 4));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uTint: { value: new THREE.Color(0.9, 0.88, 0.9) }, uAlarm: { value: 0 } },
    vertexShader: /* glsl */ `attribute vec4 aOrb, aSeed; uniform float uTime, uPx, uAlarm; uniform vec3 uSun; varying float vK;
      void main(){
        float th = aOrb.w + uTime * aSeed.x, ci = cos(aOrb.y), si = sin(aOrb.y), cn = cos(aOrb.z), sn = sin(aOrb.z);
        vec3 p = vec3(cos(th), sin(th) * si, sin(th) * ci);
        p = vec3(p.x * cn - p.z * sn, p.y, p.x * sn + p.z * cn) * aOrb.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        // a flat face catches the Sun once a tumble; a cascade sets the whole shell flashing
        float glint = pow(max(sin(uTime * (0.5 + aSeed.y * 2.4 + uAlarm * 3.0) + aSeed.z * 40.0), 0.0), 22.0);
        float along = dot(p, uSun), lit = along > 0.0 ? 1.0 : smoothstep(${(R * 0.97).toFixed(1)}, ${(R * 1.04).toFixed(1)}, length(p - uSun * along));
        vK = (0.1 + aSeed.w * 0.12 + glint * (1.6 + uAlarm * 2.0)) * (0.06 + 0.94 * lit);
        gl_PointSize = (1.4 + aSeed.w * 1.2 + glint * 2.4) * uPx;
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uTint; varying float vK;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uTint * vK * (1.0 - smoothstep(0.15, 1.0, d)), 1.0);
        ${OUTPUT} }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/** The glow on the ground where a beam comes down. */
function rectennaMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `uniform float uK; varying vec2 vUv;
      void main(){ float d = length(vUv); gl_FragColor = vec4(vec3(1.0, 0.74, 0.36) * (exp(-d * d * 7.0) * 2.2 + exp(-d * d * 1.6) * 0.35) * (1.0 - smoothstep(0.7, 1.0, d)) * uK, 1.0);
        ${OUTPUT} }`,
  });
}

interface Spot { id: string; name: string; at: THREE.Vector3; r: number }

export class OrbitScene3D implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 9000);
  readonly look: Look = { ...defaultLook(), bloom: BLOOM, bloomThreshold: 1.1, vignette: 0.38, contrast: 0.08, sharpen: 0.2 };
  private backdrop: Backdrop | null = null;
  private earth: SpaceEarth;
  private sun = new Sun(SUN_R);
  private flare = new SunFlare();
  private sunLight = new THREE.DirectionalLight(0xfff4e6, 3.4);
  private sunDir = new THREE.Vector3(1, 0, 0);
  private tint = new THREE.Color(1, 1, 1);
  private moonPivot = new THREE.Group();
  private moon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private moonBase = new THREE.Group();
  private moonLine: ReturnType<typeof orbitLine>;
  private lamps = new Lamps(900);
  private fleet = new Fleet(this.lamps);
  private beams = new Beams(64);
  private dyn = new THREE.Group();
  private sats: ReturnType<typeof trails> | null = null;
  private debris: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private weather: SpaceWeather;
  private labels = new Labels();
  private key = '';
  private odcs: { obj: THREE.Object3D; phase: number; inc: number; node: number }[] = [];
  private spsObjs: { obj: THREE.Object3D; ground: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; lon: number; lat: number; relay: boolean; online: boolean; k: number }[] = [];
  private launches: number[] = [];
  private habitats: THREE.Object3D[] = [];
  private yards: { l4: THREE.Group; l5: THREE.Group };
  private w = 1;
  private h = 1;
  private time = 0;
  private az = -0.6;
  private el = 0.2;
  private vAz = 0;
  private vEl = 0;
  private dist = HOME_DIST * 1.12;
  private goalDist = HOME_DIST;
  private down: { x: number; y: number; moved: boolean; t: number } | null = null;
  private idleUntil = 0;
  private hover: string | null = null;

  constructor(private readonly game: Game) {
    spaceLabelStyle();
    this.scene.background = new THREE.Color(0x03040a);
    this.earth = new SpaceEarth(game, R, quality.level === 'low' ? 128 : 192);
    // the Sun's light, and the Earth's own: blue light off the day side fills what faces it
    this.scene.add(this.earth.object, this.sun.object, this.flare.object, this.sunLight, this.sunLight.target, new THREE.PointLight(0x7ea6e0, 0.55, 0, 0), new THREE.AmbientLight(0x262c40, 0.4));
    // the Moon on its orbit, one face to the Earth (its near side looks down −x, towards the pivot)
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 96, 48), bodyMaterial('moon'));
    this.moon.material.uniforms.uFill.value.setRGB(0.035, 0.05, 0.075);
    this.moon.position.set(MOON_ORBIT, 0, 0);
    this.moon.add(this.moonBase);
    this.moonLine = orbitLine(MOON_ORBIT, { color: 0xb9c2d6, width: 1.1, opacity: 0.34, base: 0.3 });
    this.moonLine.material.uniforms.uFade.value.set(500, 1400);
    this.moonPivot.add(this.moon, this.moonLine);
    this.moonPivot.rotation.x = 5 * RAD;
    this.scene.add(this.moonPivot);
    // the shells: low orbit and the geostationary belt
    for (const [r, op] of [[LEO, 0.2], [GEO, 0.26]] as const) {
      const ring = orbitLine(r, { color: 0x9cc4ea, width: 1.1, opacity: op, base: 1 });
      ring.material.uniforms.uFade.value.set(HOME_DIST - r, HOME_DIST + r);
      this.scene.add(ring);
    }
    this.debris = debrisCloud(quality.level === 'low' ? 1500 : 2800);
    // the magnetic poles sit a little off the Earth's axis (the north one over arctic Canada)
    this.weather = new SpaceWeather(R, dir(-72, 80));
    this.scene.add(this.debris, this.dyn, this.beams.object, this.lamps.object, this.weather.object);
    this.yards = { l4: new THREE.Group(), l5: new THREE.Group() };
    this.moonPivot.add(this.yards.l4, this.yards.l5);
    for (const [g, a] of [[this.yards.l4, 60], [this.yards.l5, -60]] as const) g.position.set(Math.cos(a * RAD) * MOON_ORBIT, 0, -Math.sin(a * RAD) * MOON_ORBIT);
  }

  /** Rebuild what depends on the state (stations, satellites, the base, yards) when it changes. */
  private rebuild(ov: OrbitView) {
    const ex = orbitExtras(this.game.view);
    const key = JSON.stringify([ov.stage, Math.round(ov.odcGW), ov.odcBuilding.length, ov.sps.map((x) => x.region + x.status), ov.moon.stage, ov.moon.he3, Math.round(ex.l4), Math.round(ex.l5), ex.habitats, Math.round(ex.beamsTW), Math.round(ov.cadence * 2)]);
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.dyn.children]) { this.dyn.remove(c); disposeObject(c); }
    this.lamps.clear();
    this.odcs = [];
    this.spsObjs = [];
    const r = rng(9);
    // orbital data centres in low orbit (the ones still building are scaffolds)
    const nOdc = Math.min(28, Math.ceil(ov.odcGW / 3)) + ov.odcBuilding.length;
    for (let i = 0; i < nOdc; i++) {
      const obj = this.fleet.make(i >= nOdc - ov.odcBuilding.length ? 'build' : 'odc', i);
      obj.scale.setScalar(0.7);
      this.dyn.add(obj);
      this.odcs.push({ obj, phase: r() * Math.PI * 2, inc: (r() - 0.5) * 1.2, node: r() * Math.PI * 2 });
    }
    // space-solar stations in the geostationary belt over their rectennas; relays there for Act V's beams
    const beams = ov.sps.map((x) => ({ region: x.region, online: x.status === 'online', relay: false }));
    const relays = Math.min(10, Math.round(ex.beamsTW / 4));
    const REG: RegionId[] = ['pac', 'atl', 'lat', 'eur', 'nor', 'stp', 'mena', 'ssa', 'sas', 'eam', 'fab', 'seo'];
    for (let i = 0; i < relays; i++) beams.push({ region: REG[(i * 5) % REG.length], online: true, relay: true });
    beams.forEach((b, i) => {
      const [lat, lon] = rectennaOf(b.region);
      const obj = this.fleet.make(b.relay ? 'relay' : 'sps', i);
      obj.scale.setScalar(b.relay ? 0.8 : 0.9);
      // (stations over the same province stand side by side along the belt)
      const slot = lon + (b.relay ? 5 : 0) + (i % 3) * 1.6;
      obj.position.copy(dir(slot, 0)).multiplyScalar(GEO);
      obj.lookAt(ORIGIN);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), rectennaMaterial());
      const gp = dir(lon, lat);
      ground.position.copy(gp).multiplyScalar(R * 1.004);
      ground.lookAt(gp.multiplyScalar(R * 2));
      ground.renderOrder = 3;
      this.dyn.add(obj, ground);
      this.spsObjs.push({ obj, ground, lon, lat, relay: b.relay, online: b.online, k: 0.6 + r() * 0.4 });
    });
    // satellites fly in constellations: strings of them evenly spaced round each plane, the planes fanned round the
    // Earth (more planes and fuller ones as the frontier fills), two polar planes crossing them, a few high and slow
    const planes = Math.min(9, 3 + ov.stage + Math.round(ov.cadence)), per = (quality.level === 'low' ? 6 : 9) + ov.stage * 2;
    const items = [];
    for (let k = 0; k < planes + 3; k++) {
      const polar = k >= planes && k < planes + 2, high = k === planes + 2;
      const rad = high ? R * 1.38 : LEO * (1 + (k % 3) * 0.03), count = high ? 7 : polar ? Math.ceil(per * 0.6) : per;
      for (let j = 0; j < count; j++) {
        items.push({
          r: rad, inc: polar ? 1.5 : high ? 0.3 : 0.92, node: polar ? (k - planes) * 1.6 + 0.4 : (k / planes) * Math.PI * 2, phase: (j / count) * Math.PI * 2 + k * 0.37,
          rate: 0.2 * Math.pow(LEO / rad, 1.5), len: high ? 0.05 : 0.075, color: high ? GOLD : ICE, gain: 0.5 + r() * 0.3,
        });
      }
    }
    this.sats = trails(items, { width: 1.3, planet: R });
    this.dyn.add(this.sats);
    this.buildMoonBase(ov);
    // Act V: foundry yards at L4/L5 (more of them with output), habitat cylinders at L5
    for (const [g, mt] of [[this.yards.l4, ex.l4], [this.yards.l5, ex.l5]] as const) {
      for (const c of [...g.children]) { g.remove(c); disposeObject(c); }
      const n2 = mt <= 0 ? 0 : mt >= 12 ? 5 : mt >= 4 ? 3 : 2;
      for (let i = 0; i < n2; i++) {
        const y = this.fleet.make('yard', i);
        y.position.set((r() - 0.5) * 20, (r() - 0.5) * 10, (r() - 0.5) * 20);
        y.rotation.set(r() * 3, r() * 3, r() * 3);
        g.add(y);
      }
    }
    this.habitats = [];
    for (let i = 0; i < ex.habitats; i++) {
      const cyl = this.fleet.make('habitat', i);
      const holder = new THREE.Group();
      holder.add(cyl);
      holder.position.set(16 + i * 9, (i % 2) * 9 - 4, 14 - (i % 3) * 5);
      holder.rotation.set(0.2, 0.5 + i * 0.3, 0.1);
      this.yards.l5.add(holder);
      this.habitats.push(cyl);
    }
  }

  /** The Moon base at the south pole: domes and lights, then the mine, then the mass driver with its running lights. */
  private buildMoonBase(ov: OrbitView) {
    for (const c of [...this.moonBase.children]) { this.moonBase.remove(c); disposeObject(c); }
    if (ov.moon.stage < 1) return;
    const k = new Kit(rng(4)), r = rng(4);
    const holder = new THREE.Group();
    // (the pole is the Moon's −y: build the base upright, then turn it over onto the ground there)
    holder.position.y = -MOON_R + 0.05;
    holder.rotation.x = Math.PI;
    for (let i = 0; i < 3 + ov.moon.stage * 3; i++) {
      const a = r() * Math.PI * 2, d = 0.6 + r() * 3.6, s = 0.4 + r() * 0.5;
      k.geo(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(Math.cos(a) * d, 0, Math.sin(a) * d), '#e6e0e3', 0.03);
      this.lamps.add(holder, Math.cos(a) * d, s + 0.1, Math.sin(a) * d, WARM, 0.3);
    }
    this.lamps.add(holder, 0, 1.6, 0, WHITE, 0.4, 2.6, 0.08);
    if (ov.moon.he3) this.lamps.add(holder, 2.2, 0.5, -1.6, CYAN, 0.45);
    if (ov.moon.stage >= 3) {
      // the mass driver: a rail across the regolith, its lights chasing each load down it
      k.box(18, 0.3, 0.6, '#9d95a6', 9, 0, 3, { r: 0.05 });
      for (let i = 0; i < 9; i++) this.lamps.add(holder, i * 2.1 + 0.5, 0.5, 3, WARM, 0.26, 1.35, 0.16, -i / 9);
    }
    holder.add(k.build(baseMat));
    this.moonBase.add(holder);
  }

  /** First frame: stand where the Earth is big and well lit, the Moon beyond its shoulder. */
  private frame() {
    const moonAz = -this.moonPivot.rotation.y, sunAz = Math.atan2(this.sunDir.z, this.sunDir.x);
    const off = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    // the Moon 120–145° round from the camera, either way; of those, the place whose light is best: the Sun
    // off one shoulder, the terminator down the face, city lights on the far side of it
    let best = moonAz + 2.3, score = Infinity;
    for (const side of [-1, 1]) for (let a = 2.1; a <= 2.52; a += 0.07) {
      const az = moonAz + side * a, s = Math.abs(off(az, sunAz) - 1.75);
      if (s < score) { score = s; best = az; }
    }
    this.az = best;
    const forward = new THREE.Vector3(-Math.cos(this.az) * Math.cos(this.el), -Math.sin(this.el), -Math.sin(this.az) * Math.cos(this.el));
    this.backdrop = new Backdrop(galaxyFor(forward, 0.55, 0.42, 0.75));
    this.scene.add(this.backdrop.object);
  }

  update(dt: number) {
    this.time += dt;
    const g = this.game, ov = orbitView(g.view), ex = orbitExtras(g.view);
    // the real Sun; the Moon at its real phase (its elongation from the Sun)
    const ss = subsolar(new Date());
    dir(ss.lon, ss.lat, this.sunDir);
    const synodic = 29.530588;
    const age = (((Date.now() / 86_400_000 - 10962.77) % synodic) + synodic) % synodic;
    this.moonPivot.rotation.y = Math.atan2(-this.sunDir.z, this.sunDir.x) + (age / synodic) * Math.PI * 2 + Math.PI;
    if (!this.backdrop) this.frame();
    this.rebuild(ov);
    const storm = ex.storm;
    // the camera: a flick keeps turning and settles; left alone, the view drifts slowly round
    if (!this.down) {
      this.az += this.vAz * dt + (this.time > this.idleUntil ? dt * 0.012 : 0);
      this.el += this.vEl * dt;
      const k = Math.exp(-dt * 3.2);
      this.vAz *= k;
      this.vEl *= k;
    }
    this.dist += (this.goalDist - this.dist) * Math.min(1, dt * (g.mode === 'title' ? 0.35 : 3.5));
    this.el = Math.max(-1.2, Math.min(1.2, this.el));
    const cam = this.camera.position.set(Math.cos(this.az) * Math.cos(this.el), Math.sin(this.el), Math.sin(this.az) * Math.cos(this.el)).multiplyScalar(this.dist);
    // look a little towards the Moon's side (more, the further out): the Earth sits off-centre with the Moon in frame
    const moonAt = this.moon.getWorldPosition(new THREE.Vector3());
    const aside = moonAt.clone().addScaledVector(cam, -moonAt.dot(cam) / cam.lengthSq()).normalize();
    aside.multiplyScalar(34 + THREE.MathUtils.smoothstep(this.dist, 450, 1100) * 70);
    // close in, the view lifts to the horizon: the limb and its air across the frame, stations passing over it
    const lift = (1 - THREE.MathUtils.smoothstep(this.dist, MIN_DIST, 330)) * R * 0.86;
    this.camera.lookAt(aside.addScaledVector(new THREE.Vector3(0, 1, 0).addScaledVector(cam, -cam.y / cam.lengthSq()).normalize(), lift));
    this.camera.updateMatrixWorld();
    sizeRibbons(this.camera, this.h);
    const scale = g.stage.scale;
    // light
    this.earth.light(this.sunDir, (this.time * 0.0016) % 1, this.time);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(2000);
    const sunAt = this.sunDir.clone().multiplyScalar(SUN_FAR);
    this.sun.object.position.copy(sunAt);
    const mu = this.moon.material.uniforms;
    mu.uSun.value.set(this.sunDir.x, this.sunDir.y, this.sunDir.z, 0);
    mu.uFillDir.value.copy(moonAt).negate().normalize();
    // the Sun through the lens: hidden behind the Earth or the Moon, red where its light skims the air
    const behind = sunVisibility(cam, sunAt, SUN_R, [{ at: ORIGIN, r: R }]);
    const vis = Math.min(behind.vis, sunVisibility(cam, sunAt, SUN_R, [{ at: moonAt, r: MOON_R }]).vis);
    this.tint.setRGB(1, 1 - behind.graze * 0.42, 1 - behind.graze * 0.72);
    this.sun.update(dt, this.time, this.camera, storm ?? 0, this.tint);
    this.flare.update(this.camera, sunAt, vis, 1 + (storm ?? 0) * 0.4, this.tint);
    this.look.bloom = BLOOM + (storm ?? 0) * 0.15;
    this.backdrop?.resize(scale);
    this.weather.update(this.time, this.sunDir, storm);
    // stations in motion
    const p = new THREE.Vector3();
    for (const o of this.odcs) {
      const a = o.phase + this.time * 0.2, cn = Math.cos(o.node), sn = Math.sin(o.node);
      p.set(Math.cos(a), Math.sin(a) * Math.sin(o.inc), Math.sin(a) * Math.cos(o.inc));
      o.obj.position.set(p.x * cn - p.z * sn, p.y, p.x * sn + p.z * cn).multiplyScalar(LEO * 1.01);
      o.obj.lookAt(ORIGIN);
    }
    // beams: every station's shaft down to its rectenna; a relay first catches one coming in from the swarm
    this.beams.begin(this.time);
    const groundAt = new THREE.Vector3(), from = new THREE.Vector3();
    const flicker = storm !== null ? 0.55 + 0.45 * Math.sin(this.time * 23) * Math.sin(this.time * 7.3) : 1;
    for (const sp of this.spsObjs) {
      dir(sp.lon, sp.lat, groundAt).multiplyScalar(R * 1.003);
      const k = sp.online ? sp.k * flicker : 0;
      sp.ground.material.uniforms.uK.value = sp.online ? (0.75 + Math.sin(this.time * 2.4 + sp.lon) * 0.2) * flicker : 0.12;
      if (k <= 0) continue;
      this.beams.add(sp.obj.position, groundAt, 0.4, 2.3, sp.relay ? ICE : GOLD, 0.5 * k);
      if (sp.relay) this.beams.add(from.copy(sp.obj.position).addScaledVector(this.sunDir, 900).addScaledVector(sp.obj.position, 0.6), sp.obj.position, 4, 0.5, ICE, 0.22 * k);
    }
    // launches: a bright head climbing out of the spaceport and bending east into orbit, its fire trailing behind
    if (ov.spaceport) {
      const every = Math.max(2.2, 8 / Math.max(0.3, ov.cadence));
      if (!this.launches.length || this.time - this.launches[this.launches.length - 1] > every) this.launches.push(this.time);
      const site = siteDef(ov.spaceport), up = dir(site.lon, site.lat), east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
      const at = (t: number, out: THREE.Vector3) => {
        const down = 1.5 * t * t, rad = R + (LEO * 1.01 - R) * (1 - (1 - t) * (1 - t));
        return out.copy(up).multiplyScalar(Math.cos(down)).addScaledVector(east, Math.sin(down)).multiplyScalar(rad);
      };
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      this.launches = this.launches.filter((t0) => this.time - t0 < 9);
      for (const t0 of this.launches) {
        const t = (this.time - t0) / 7.5;
        if (t > 1.12) continue;
        // the trail: older fire further back, thinner and dimmer; the engines cut as it reaches orbit
        const burn = 1 - THREE.MathUtils.smoothstep(t, 0.92, 1.1);
        for (let i = 0; i < 8; i++) {
          const t1 = Math.min(1, t) - i * 0.035, t2 = t1 - 0.035;
          if (t2 < 0) break;
          at(t1, a); at(t2, b);
          this.beams.add(b, a, 0.5 + i * 0.12, 0.42 + i * 0.12, FIRE, (i === 0 ? 5 : 1.9 * Math.pow(0.7, i)) * burn);
        }
      }
    }
    this.beams.end();
    // satellites and debris: more glitter the dirtier the shells; a cascade turns it red and frantic
    if (this.sats) {
      const u = this.sats.material.uniforms;
      u.uTime.value = this.time;
      u.uShadow.value.copy(this.sunDir);
      u.uGain.value = 1.3;
    }
    const du = this.debris.material.uniforms;
    this.debris.geometry.setDrawRange(0, Math.min(this.debris.geometry.attributes.position.count, Math.round((ov.debris.leo + ov.debris.geo + ov.debris.cis) * 9 + 80)));
    du.uTime.value = this.time;
    du.uPx.value = scale;
    du.uSun.value.copy(this.sunDir);
    du.uAlarm.value = ov.cascade !== null ? 1 : 0;
    if (ov.cascade !== null) du.uTint.value.setRGB(1.6, 0.42 + Math.sin(this.time * 6) * 0.14, 0.2);
    else du.uTint.value.setRGB(0.9, 0.88, 0.9);
    for (const c of this.habitats) c.rotation.x += dt * 0.5;
    for (const y of [this.yards.l4, this.yards.l5]) for (const c of y.children) if (!this.habitats.includes(c.children[0])) c.rotation.y += dt * 0.05;
    this.lamps.update(this.time, this.camera, this.h * scale, scale, storm !== null ? 0.7 + 0.3 * flicker : 1);
    this.updateLabels();
  }

  private screenOf(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** A world radius at a world point, in screen pixels. */
  private pixels(r: number, at: THREE.Vector3) {
    return (r / Math.max(1, at.distanceTo(this.camera.position))) * (this.h / (2 * Math.tan((this.camera.fov * RAD) / 2)));
  }

  /** The places you can go that are in sight (not behind the Earth). */
  private spots(): Spot[] {
    const s = this.game.view;
    const out: Spot[] = [{ id: 'moon', name: 'The Moon', at: this.moon.getWorldPosition(new THREE.Vector3()), r: MOON_R }];
    if (s?.system) {
      out.push({ id: 'l4', name: 'L4 Yards', at: this.yards.l4.getWorldPosition(new THREE.Vector3()), r: 14 });
      out.push({ id: 'l5', name: 'L5 Yards', at: this.yards.l5.getWorldPosition(new THREE.Vector3()), r: 14 });
      if (this.habitats.length) out.push({ id: 'aurora', name: 'Aurora', at: this.habitats[0].getWorldPosition(new THREE.Vector3()), r: 8 });
    }
    const cam = this.camera.position, to = new THREE.Vector3();
    return out.filter((sp) => {
      const d = to.copy(sp.at).sub(cam).length(), along = -cam.dot(to) / d;
      // (the line of sight's nearest pass to the Earth's centre)
      return along <= 0 || along >= d || cam.clone().addScaledVector(to, along / d).length() > R;
    });
  }

  private updateLabels() {
    const items: LabelItem[] = [];
    for (const sp of this.spots()) {
      const p = this.screenOf(sp.at);
      if (p) items.push({ id: sp.id, text: sp.name, x: p.x, y: p.y - this.pixels(sp.r, sp.at) - 6, pri: sp.id === 'moon' ? 6 : 5, tone: this.hover === sp.id ? 'sp hot' : 'sp place' });
    }
    this.labels.show(items, (this.game.mode === 'title' ? 0.8 : 1) * (1 - Math.min(1, this.game.stage.fade)));
  }

  private spotAt(x: number, y: number): string | null {
    let best: string | null = null, bd = Infinity;
    for (const sp of this.spots()) {
      const c = this.screenOf(sp.at);
      if (!c) continue;
      const d = Math.hypot(c.x - x, c.y - y) - Math.max(14, this.pixels(sp.r, sp.at));
      if (d < 0 && d < bd) { bd = d; best = sp.id; }
    }
    return best;
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }

  busy() { return !!this.down?.moved || Math.abs(this.goalDist - this.dist) > 1 || Math.abs(this.vAz) + Math.abs(this.vEl) > 0.05; }

  pointerDown(p: PixelPointer) {
    this.down = { x: p.x, y: p.y, moved: false, t: performance.now() };
    this.vAz = this.vEl = 0;
  }

  pointerMove(p: PixelPointer) {
    if (this.down) {
      const dx = p.x - this.down.x, dy = p.y - this.down.y;
      if (!this.down.moved && Math.hypot(dx, dy) > (p.pointerType === 'mouse' ? 3 : 10)) this.down.moved = true;
      if (this.down.moved) {
        // (a hand moves the view less the closer in it is: the ground under the pointer keeps pace)
        const now = performance.now(), dt = Math.max(0.004, (now - this.down.t) / 1000), k = Math.min(1, this.dist / 520);
        this.az += dx * 0.005 * k;
        this.el += dy * 0.004 * k;
        this.vAz += ((dx * 0.005 * k) / dt - this.vAz) * 0.4;
        this.vEl += ((dy * 0.004 * k) / dt - this.vEl) * 0.4;
        this.down.x = p.x; this.down.y = p.y; this.down.t = now;
        this.idleUntil = this.time + 6;
        return;
      }
    }
    this.hover = this.spotAt(p.x, p.y);
    this.game.stage.canvas.style.cursor = this.hover ? 'pointer' : '';
  }

  pointerUp() {
    const d = this.down;
    this.down = null;
    this.idleUntil = this.time + 4;
    // a hand that stopped before letting go leaves the view still
    if (d && performance.now() - d.t > 90) this.vAz = this.vEl = 0;
    if (!d || d.moved || this.game.mode === 'title') return;
    if (this.hover) this.game.enterDiorama(this.hover);
  }

  pointerCancel() { this.down = null; }
  pointerLeave() { this.hover = null; }

  wheel(_p: PixelPointer, deltaY: number) {
    this.goalDist = Math.max(MIN_DIST, Math.min(1300, this.goalDist * Math.pow(1.0015, deltaY)));
    this.idleUntil = this.time + 4;
  }

  zoomIn() { this.goalDist = Math.max(MIN_DIST, this.goalDist / 1.3); }
  zoomOut() { this.goalDist = Math.min(1300, this.goalDist * 1.3); }

  destroy() {
    this.labels.destroy();
    this.game.stage.canvas.style.cursor = '';
    disposeObject(this.scene);
    this.fleet.dispose();
    this.backdrop?.dispose();
  }
}
