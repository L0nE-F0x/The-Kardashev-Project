/**
 * The solar-system view (Act V) in 3D: a living Sun (space/sun.ts) seen through a lens that flares,
 * Mercury, Venus, the Earth and Moon and Mars as lit worlds on their tilted orbits (time compressed
 * to about a year a minute from the game's date), the asteroid belt with your claims and the
 * foundries working them, haul ships to the L4/L5 yards, the swarm (swarm.ts) growing round the Sun
 * and beaming power home, Ring One, the Mercury probe, Solar Maximum's eruptions, the Milky Way behind.
 * Click the Earth for the orbit view, a place to go there, a planet to fly the camera to it.
 * With `cinematic` it plays the ending (cinematic.ts); the UI waits on `cinematicDone`.
 */
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { PixelPointer } from '../../render/stage';
import type { Scene3D } from '../stage3d';
import { defaultLook, type Look } from '../post';
import { systemView, type SystemView } from '../../sim/systemView';
import { ASTEROIDS } from '../../content/system';
import { dateOf } from '../../sim/core';
import { disposeObject, Kit, rng } from '../kit';
import { Labels, type LabelItem } from '../globe/labels';
import { PALETTE } from '../../render/palette';
import { quality } from '../quality';
import { Backdrop, galaxyFor } from '../space/backdrop';
import { Sun, SunFlare, sunVisibility } from '../space/sun';
import { airMaterial, asteroidGeometry, bodyMaterial, type BodyKind } from '../space/bodies';
import { Beams, orbitLine, sizeRibbons } from '../space/ribbons';
import { SpaceEarth } from '../space/earth';
import { spaceLabelStyle } from '../space/labelStyle';
import { NOISE, OUTPUT } from '../space/glsl';
import { Swarm } from './swarm';
import { cineEndView, cineShot, CINE_DONE, CINE_LENGTH, type CineShot } from './cinematic';

const AU = 230, SUN_R = 20, MOON_ORBIT = 15, MOON_R = 1.7, SWARM_R = AU * 0.9, BLOOM = 0.5;
/** Game days a second: about a year a minute (the ending holds its breath: the worlds turn at a quarter of that). */
const DAYS_PER_SEC = 6.1, CINE_PACE = 0.25;
const RAD = Math.PI / 180;
const PLANETS = [
  { id: 'mercury', name: 'Mercury', au: 0.39, days: 88, r: 3.0, inc: 7, node: 0.84, phase: 1.2, tilt: 0.01, spin: 0.03 },
  { id: 'venus', name: 'Venus', au: 0.72, days: 225, r: 5.8, inc: 3.4, node: 1.34, phase: 3.1, tilt: 0.05, spin: -0.01 },
  { id: 'earth', name: 'Earth', au: 1.0, days: 365.25, r: 6.2, inc: 0, node: 0, phase: 0, tilt: 0.41, spin: 0.22 },
  { id: 'mars', name: 'Mars', au: 1.52, days: 687, r: 4.2, inc: 1.85, node: 0.86, phase: 4.4, tilt: 0.44, spin: 0.2 },
] as const;
type PlanetId = (typeof PLANETS)[number]['id'];
const ROCK: Record<string, string> = { M: '#a9a2ae', S: '#a68f80', C: '#5f5866' };
const GOLD = new THREE.Color(1.0, 0.78, 0.42), CYAN = new THREE.Color(0.45, 0.95, 0.85);

const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.2 });
mat.userData.shared = true;
const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
rockMat.userData.shared = true;

interface Target { id: string; name: string; at: THREE.Vector3; r: number; open: string; focus?: boolean }

/** An eruption leaving the Sun in a storm: an expanding shell of thin gas, torn into arcs. */
function eruptionMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uK: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uK, uSeed; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){
        // seen edge-on a shell is a bright rim; noise tears it into arcs
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        float torn = smoothstep(0.42, 0.7, fbm(normalize(vP) * 2.2 + uSeed, 4));
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.22) * rim * torn * uK, 1.0);
        ${OUTPUT}
      }`,
  });
}

export class SystemScene3D implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  readonly look: Look = { ...defaultLook(), bloom: BLOOM, bloomThreshold: 1.1, vignette: 0.42, contrast: 0.08, sharpen: 0.2 };
  /** The ending's pull-back has finished (the UI waits for it). */
  cinematicDone: boolean;
  private backdrop: Backdrop;
  private sun = new Sun(SUN_R);
  private flare = new SunFlare();
  private earth: SpaceEarth;
  private planets = new Map<PlanetId, { def: (typeof PLANETS)[number]; holder: THREE.Group; ball: THREE.Mesh; q: THREE.Quaternion; line: ReturnType<typeof orbitLine>; air?: THREE.ShaderMaterial; angle: number }>();
  private moon: THREE.Mesh;
  private moonLine: ReturnType<typeof orbitLine>;
  private moonAngle = 0;
  private swarm: Swarm;
  private belt: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private beams = new Beams(96);
  private dyn = new THREE.Group();
  private asteroids = new Map<string, THREE.Object3D>();
  private yards: Partial<Record<'l4' | 'l5', THREE.Object3D>> = {};
  private ring: THREE.Object3D | null = null;
  private habitat: THREE.Object3D | null = null;
  private hauls: { from: string; to: 'l4' | 'l5'; phase: number }[] = [];
  private eruptions: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; phase: number }[] = [];
  private lamps: THREE.MeshBasicMaterial[] = [];
  private labels = new Labels();
  private key = '';
  private time = 0;
  /** Orbital time, in game days since the scene opened (it runs slow in the ending). */
  private clock = 0;
  private cineT = 0;
  private shot: CineShot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), wave: 10, system: 1, glow: 0, ribs: 1 };
  private w = 1;
  private h = 1;
  private az = -1.0;
  private el = 0.46;
  private vAz = 0;
  private vEl = 0;
  private dist = 880;
  private goalDist = 880;
  /** The body the camera circles (null = the Sun), and how far its centre still is from there. */
  private focus: PlanetId | null = null;
  private lag = new THREE.Vector3();
  private glide: { az: number; el: number } | null = null;
  private sunward: number | null = null;
  private down: { x: number; y: number; moved: boolean; t: number } | null = null;
  private hover: string | null = null;
  private last: { v: SystemView; targets: Target[] } | null = null;
  private tint = new THREE.Color(1, 1, 1);

  constructor(private readonly game: Game, private readonly opts: { cinematic?: boolean } = {}) {
    spaceLabelStyle();
    this.cinematicDone = !opts.cinematic;
    this.scene.background = new THREE.Color(0x020308);
    // the galaxy lies across the opening view (the ending: across its last, held frame), its bright heart beside the Sun
    const day = systemView(game.view).day;
    const view = opts.cinematic
      ? cineEndView(this.earthAngle(day, CINE_LENGTH * DAYS_PER_SEC * CINE_PACE))
      : new THREE.Vector3(-Math.cos(this.az) * Math.cos(this.el), -Math.sin(this.el), -Math.sin(this.az) * Math.cos(this.el));
    this.backdrop = new Backdrop(galaxyFor(view));
    this.scene.add(this.backdrop.object, this.sun.object, new THREE.PointLight(0xfff1dc, 4.2, 0, 0), new THREE.AmbientLight(0x30364c, 0.35));
    // the planets, each on its own tilted plane with an orbit line that trails behind it
    this.earth = new SpaceEarth(game, PLANETS[2].r, quality.level === 'low' ? 64 : 128);
    for (const p of PLANETS) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(p.node), 0, Math.sin(p.node)), p.inc * RAD);
      const line = orbitLine(p.au * AU, { color: p.id === 'earth' ? 0x8fd8ee : 0x9cb4d8, width: p.id === 'earth' ? 1.5 : 1.2, opacity: p.id === 'earth' ? 0.62 : 0.46 });
      line.quaternion.copy(q);
      const holder = new THREE.Group();
      holder.rotation.z = p.tilt;
      let ball: THREE.Mesh, air: THREE.ShaderMaterial | undefined;
      if (p.id === 'earth') {
        holder.add(this.earth.object);
        ball = this.earth.globe;
      } else {
        ball = new THREE.Mesh(new THREE.SphereGeometry(p.r, 64, 32), bodyMaterial(p.id as BodyKind, p.r));
        holder.add(ball);
        if (p.id !== 'mercury') {
          air = p.id === 'venus' ? airMaterial(0xffe2a8, 0.75, 1.14) : airMaterial(0xf2a27a, 0.3, 1.08);
          holder.add(new THREE.Mesh(new THREE.SphereGeometry(p.r * (p.id === 'venus' ? 1.14 : 1.08), 48, 24), air));
        }
      }
      this.scene.add(line, holder);
      this.planets.set(p.id, { def: p, holder, ball, q, line, air, angle: 0 });
    }
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 48, 24), bodyMaterial('moon', MOON_R));
    (this.moon.material as THREE.ShaderMaterial).uniforms.uFill.value.setRGB(0.045, 0.06, 0.09);
    this.moonLine = orbitLine(MOON_ORBIT, { color: 0xb9c2d6, width: 1, opacity: 0.3, base: 0.5 });
    this.scene.add(this.moon, this.moonLine);
    this.swarm = new Swarm(SWARM_R, 0.7);
    this.belt = this.makeBelt();
    this.scene.add(this.swarm.object, this.belt, this.beams.object, this.dyn, this.flare.object);
    // Solar Maximum: eruptions rolling out from the Sun
    const shell = new THREE.SphereGeometry(1, 48, 24);
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(shell, eruptionMaterial());
      mesh.material.uniforms.uSeed.value = i * 7.3;
      mesh.visible = false;
      this.eruptions.push({ mesh, phase: i / 3 });
      this.scene.add(mesh);
    }
    // lamps that pulse together: mining lights (warm), yard beacons (cyan), claims' rings take their owner's colour
    this.lamps = [new THREE.MeshBasicMaterial({ color: 0xffffff }), new THREE.MeshBasicMaterial({ color: 0xffffff })];
    for (const l of this.lamps) l.userData.shared = true;
  }

  /** The asteroid belt: a haze of rocks, each on its own circle (the inner ones lap the outer ones). */
  private makeBelt() {
    const r = rng(5);
    const n = quality.level === 'high' ? 9000 : quality.level === 'medium' ? 6000 : 3500;
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // thinner towards the edges, with a gap or two (the resonances with Jupiter)
      let au = 2.1 + (r() + r()) * 0.62;
      if (Math.abs(au - 2.5) < 0.03 || Math.abs(au - 2.82) < 0.025) au += 0.06;
      data.set([au, r() * Math.PI * 2, (r() + r() - 1) * 9 * au, r()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aRock', new THREE.BufferAttribute(data, 4));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uClock: { value: 0 }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `attribute vec4 aRock; uniform float uClock, uPx; varying float vK;
        void main(){
          float th = aRock.y + uClock * pow(aRock.x, -1.5);
          vec4 mv = modelViewMatrix * vec4(cos(th) * aRock.x * ${AU.toFixed(1)}, aRock.z, sin(th) * aRock.x * ${AU.toFixed(1)}, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.2 + aRock.w * aRock.w * 1.6) * uPx;
          // a few catch the light; the rest are dust in it
          vK = (0.03 + 0.3 * pow(aRock.w, 5.0)) * smoothstep(40.0, 200.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `varying float vK;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.95, 0.82, 0.68) * vK * smoothstep(1.0, 0.2, d), 1.0);
          ${OUTPUT} }`,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  }

  /** The Earth's angle round its orbit on game day `day`, `clock` days into the scene. */
  private earthAngle(day: number, clock: number) {
    const d = dateOf(Math.floor(day));
    return (((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + clock) / 365.25) * Math.PI * 2;
  }

  /** Put every planet where the orbital clock has it (and note the angle it has reached on its orbit). */
  private placePlanets(day: number) {
    const year = this.earthAngle(day, this.clock) * 365.25;
    for (const p of this.planets.values()) {
      p.angle = p.def.phase + year / p.def.days;
      p.holder.position.set(Math.cos(p.angle) * p.def.au * AU, 0, Math.sin(p.angle) * p.def.au * AU).applyQuaternion(p.q);
      p.line.material.uniforms.uHead.value = p.angle;
    }
  }

  private asteroidPos(id: string, day: number) {
    const a = ASTEROIDS.find((x) => x.id === id);
    if (!a) return new THREE.Vector3();
    const per = 365.25 * Math.pow(a.au, 1.5);
    const ang = (a.phase * Math.PI) / 180 + ((day + this.clock) / per) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(ang) * a.au * AU, Math.sin(ang * 3) * 4, Math.sin(ang) * a.au * AU);
  }

  /** A point on the Earth's orbit `lead` radians ahead of it (the yards ride just ahead and behind; Ring One trails). */
  private station(lead: number, earth: THREE.Vector3, lift = 3) {
    const a = Math.atan2(earth.z, earth.x) + lead;
    return new THREE.Vector3(Math.cos(a) * AU, lift, Math.sin(a) * AU);
  }

  private lagrange(which: 'l4' | 'l5', earth: THREE.Vector3) {
    return this.station(which === 'l4' ? 0.12 : -0.12, earth);
  }

  /** A lamp: a tiny ball that glows far past white, so the bloom finds it. */
  private lamp(on: THREE.Object3D, which: number, x: number, y: number, z: number, size = 0.16) {
    const m = new THREE.Mesh(LAMP_GEO, this.lamps[which]);
    m.position.set(x, y, z);
    m.scale.setScalar(size);
    on.add(m);
  }

  /** A foundry yard: frames, a furnace, sails half-built, beacons (bigger with its output). */
  private yard(cap: number, seed: number) {
    const g = new THREE.Group(), r = rng(seed);
    const n = cap >= 12 ? 5 : cap >= 4 ? 3 : 2;
    const k = new Kit(rng(seed));
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * 3.4, y = (r() - 0.5) * 1.6, z = (r() - 0.5) * 3.4;
      k.box(0.9, 0.5, 0.5, '#d9d2d6', x, y, z, { r: 0.05 });
      k.beam(new THREE.Vector3(x - 1.1, y + 0.25, z), new THREE.Vector3(x + 1.1, y + 0.25, z), 0.07, '#9d95a6');
      k.box(1.1, 0.02, 0.9, '#fbd46e', x + 0.9, y + 0.5, z + 0.5, { r: 0, jitter: 0.1 });
      this.lamp(g, i % 2, x - 0.5, y + 0.6, z, 0.11);
    }
    g.add(k.build(mat));
    return g;
  }

  /** Ring One: a wheel of compute with radiator fins, glowing cyan. */
  private ringOne() {
    const g = new THREE.Group(), k = new Kit(rng(12));
    k.geo(new THREE.TorusGeometry(2.3, 0.22, 8, 40).rotateX(Math.PI / 2), '#e6e0e3', 0.03);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.box(0.9, 0.03, 0.5, '#c3bcc7', Math.cos(a) * 2.9, -0.015, Math.sin(a) * 2.9, { r: 0, ry: -a });
      k.beam(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3), 0.05, '#9d95a6');
      this.lamp(g, 1, Math.cos(a + 0.4) * 2.3, 0.26, Math.sin(a + 0.4) * 2.3, 0.1);
    }
    k.cyl(0.35, 0.35, 0.7, '#fbf7f0', 0, -0.35, 0, 12);
    g.add(k.build(mat));
    g.rotation.x = 0.5;
    return g;
  }

  /** Aurora: a spinning cylinder with strips of window light. */
  private aurora() {
    const g = new THREE.Group(), k = new Kit(rng(14));
    k.cyl(0.55, 0.55, 3, '#e6e0e3', 0, -1.5, 0, 16);
    g.add(k.build(mat));
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.02), this.lamps[0]);
      strip.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.56, 0, Math.sin((i * Math.PI * 2) / 3) * 0.56);
      strip.lookAt(0, 0, 0);
      g.add(strip);
    }
    g.rotation.z = Math.PI / 2;
    return g;
  }

  private rebuild(v: SystemView) {
    const cap = (place: string) => v.foundries.filter((f) => f.place === place).reduce((a, f) => a + f.cap, 0);
    const key = JSON.stringify([
      v.asteroids.map((a) => a.id + a.status + (a.ownerColor ?? '') + (a.foundry > 0)), v.hauls.map((h) => h.from + h.to + Math.round(h.traffic * 4)),
      Math.sign(cap('l4')) + (cap('l4') >= 4 ? 1 : 0) + (cap('l4') >= 12 ? 1 : 0), Math.sign(cap('l5')) + (cap('l5') >= 4 ? 1 : 0) + (cap('l5') >= 12 ? 1 : 0), v.ringsTW > 0, v.habitatTW > 0 || v.spacePop > 0,
    ]);
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.dyn.children]) { this.dyn.remove(c); disposeObject(c); }
    this.asteroids.clear();
    this.hauls = [];
    for (const a of v.asteroids) {
      if (a.status === 0) continue;
      const g = new THREE.Group();
      const size = 1.4 + Math.min(3.4, Math.sqrt(a.def.km) * 0.28);
      const rock = new THREE.Mesh(asteroidGeometry(a.id.length * 13 + a.def.phase, size, new THREE.Color(ROCK[a.type])), rockMat);
      g.add(rock);
      // a claim: a ring in its owner's colour; a foundry: a works on the rock, mining lights across it
      if (a.status >= 2) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 1.75, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(a.ownerColor ? PALETTE[a.ownerColor] : '#fbd46e').multiplyScalar(1.6) }));
        ring.rotation.x = Math.PI / 2 - 0.35;
        g.add(ring);
      }
      if (a.foundry > 0) {
        const k = new Kit(rng(a.id.length * 7));
        k.box(size * 0.5, size * 0.28, size * 0.36, '#d9d2d6', size * 0.72, 0, 0, { r: 0.05 });
        k.box(size * 0.9, 0.03, size * 0.5, '#2c3f6e', size * 0.9, size * 0.4, 0, { r: 0 });
        rock.add(k.build(mat));
        const r = rng(a.id.length * 3);
        for (let i = 0; i < 5; i++) {
          const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(size * 0.92);
          this.lamp(rock, 0, d.x * 1.25, d.y * 0.85, d.z, 0.12);
        }
      }
      g.userData.rock = rock;
      this.dyn.add(g);
      this.asteroids.set(a.id, g);
    }
    for (const h of v.hauls) {
      const n = Math.max(1, Math.round(h.traffic * 5));
      for (let i = 0; i < n; i++) this.hauls.push({ from: h.from, to: h.to, phase: i / n });
    }
    this.yards = {};
    for (const y of ['l4', 'l5'] as const) if (cap(y) > 0) this.dyn.add((this.yards[y] = this.yard(cap(y), y === 'l4' ? 80 : 81)));
    this.ring = v.ringsTW > 0 ? this.ringOne() : null;
    this.habitat = v.habitatTW > 0 || v.spacePop > 0 ? this.aurora() : null;
    if (this.ring) this.dyn.add(this.ring);
    if (this.habitat) this.dyn.add(this.habitat);
  }

  /** The swarm's sunward face at `lon` radians behind the Earth (where a beam leaves it). */
  private onRing(lon: number, earthAngle: number, out: THREE.Vector3) {
    const a = earthAngle - 0.09 - lon;
    return out.set(Math.cos(a) * SWARM_R, 0, Math.sin(a) * SWARM_R);
  }

  update(dt: number) {
    this.time += dt;
    const cine = !!this.opts.cinematic;
    if (cine) this.cineT += dt;
    this.clock += dt * DAYS_PER_SEC * (cine ? CINE_PACE : 1);
    const v = systemView(this.game.view);
    this.rebuild(v);
    const day = v.day;
    this.placePlanets(day);
    const E = this.planets.get('earth')!, earth = E.holder.position, earthAngle = E.angle;
    const toSun = new THREE.Vector3();
    for (const p of this.planets.values()) {
      p.ball.rotation.y += dt * p.def.spin;
      if (p.def.id === 'venus') (p.ball.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    }
    this.earth.light(toSun.copy(earth).negate().normalize(), (this.time * 0.0016) % 1, this.time);
    // the Moon keeps one face to the Earth
    this.moonAngle = cine ? 1.25 + this.cineT * 0.05 + earthAngle : this.time * 0.5;
    this.moon.position.set(Math.cos(this.moonAngle) * MOON_ORBIT, 0, Math.sin(this.moonAngle) * MOON_ORBIT).add(earth);
    this.moon.rotation.y = -this.moonAngle;
    (this.moon.material as THREE.ShaderMaterial).uniforms.uFillDir.value.copy(earth).sub(this.moon.position).normalize();
    this.moonLine.position.copy(earth);
    this.moonLine.material.uniforms.uHead.value = this.moonAngle;
    // the camera
    const shot = cine ? cineShot(this.cineT, earth, E.def.r, this.shot) : null;
    if (shot) {
      this.camera.position.copy(shot.pos);
      this.camera.lookAt(shot.look);
      if (this.cineT >= CINE_DONE) this.cinematicDone = true;
    } else this.freeCamera(dt);
    this.camera.updateMatrixWorld();
    sizeRibbons(this.camera, this.h);
    const lines = shot ? shot.system : 1;
    for (const p of this.planets.values()) p.line.material.uniforms.uOpacity.value = (p.def.id === 'earth' ? 0.62 : 0.46) * lines;
    this.moonLine.material.uniforms.uOpacity.value = 0.3 * lines * THREE.MathUtils.smoothstep(this.camera.position.distanceTo(earth), 900, 300);
    // the swarm; where it stands between the viewer and the Sun, the Sun comes through dimmer and redder
    const storm = v.storm ?? 0;
    this.swarm.update(this.time, v.segments, earthAngle, v.damage, shot ? shot.wave : 10, shot ? shot.ribs : 1);
    const cam = this.camera.position, camR = Math.hypot(cam.x, cam.z);
    let veil = 0;
    if (camR > SWARM_R) {
      const y = Math.abs(cam.y) * (SWARM_R / camR), behind = (((earthAngle - 0.09 - Math.atan2(cam.z, cam.x)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      veil = (1 - THREE.MathUtils.smoothstep(y, 12, 44)) * (v.segments[Math.min(11, Math.floor((behind / (Math.PI * 2)) * 12))] ?? 0) * (shot ? THREE.MathUtils.smoothstep(shot.wave, 0, 1) : 1);
    }
    this.tint.setRGB(1, 1 - veil * 0.3, 1 - veil * 0.52);
    // (close in, the view stops down: the Sun's own grain instead of a white-out)
    const near = THREE.MathUtils.smoothstep(this.pixels(SUN_R, ORIGIN) / this.h, 0.05, 0.28);
    this.sun.update(dt, this.time, this.camera, storm, this.tint, near);
    const bodies = [{ at: earth, r: E.def.r }, { at: this.moon.position, r: MOON_R }, ...[...this.planets.values()].filter((p) => p.def.id !== 'earth').map((p) => ({ at: p.holder.position, r: p.def.r }))];
    const { vis } = sunVisibility(cam, ORIGIN, SUN_R, bodies);
    this.flare.update(this.camera, ORIGIN, vis, (0.9 + storm * 0.5 + Math.sin(this.time * 0.7) * 0.03) * (1 - veil * 0.4) * (1 - near * 0.6), this.tint);
    this.look.bloom = (BLOOM + storm * 0.2) * (1 - near * 0.5) + (shot ? shot.glow : 0);
    this.belt.material.uniforms.uClock.value = ((this.clock + day) / 365.25) * Math.PI * 2;
    this.belt.material.uniforms.uPx.value = this.game.stage.scale;
    this.backdrop.resize(this.game.stage.scale);
    // lamps breathe (mining lights warm, beacons cyan and quicker)
    this.lamps[0].color.setRGB(5, 3.2, 1.4).multiplyScalar(0.75 + Math.sin(this.time * 2.1) * 0.25);
    this.lamps[1].color.setRGB(1.2, 4.5, 3.8).multiplyScalar(Math.sin(this.time * 3.3) > 0.2 ? 1 : 0.25);
    // asteroids, the yards, Ring One, the habitat
    for (const [id, g] of this.asteroids) {
      g.position.copy(this.asteroidPos(id, day));
      (g.userData.rock as THREE.Object3D).rotation.y += dt * 0.25;
    }
    for (const y of ['l4', 'l5'] as const) {
      const o = this.yards[y];
      if (o) { o.position.copy(this.lagrange(y, earth)); o.rotation.y += dt * 0.12; }
    }
    if (this.ring) { this.ring.position.copy(this.station(-0.25, earth, 5)); this.ring.rotateY(dt * 0.4); }
    if (this.habitat) { this.habitat.position.copy(this.lagrange('l5', earth)).add(UP.clone().multiplyScalar(5)); this.habitat.rotateY(dt * 0.9); }
    // light on the move: haul ships as streaks along their arcs, the Mercury probe, power beams home
    this.beams.begin(this.time);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const arc = (from: THREE.Vector3, to: THREE.Vector3, t: number, out: THREE.Vector3) => {
      const lift = from.distanceTo(to) * 0.12;
      return out.copy(from).multiplyScalar((1 - t) * (1 - t)).addScaledVector(a.copy(from).add(to).multiplyScalar(0.5).setY(lift), 2 * t * (1 - t)).addScaledVector(to, t * t);
    };
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    for (const h of this.hauls) {
      const from = h.from === 'moon' ? this.moon.position : this.asteroidPos(h.from, day), to = this.lagrange(h.to, earth);
      const t = (h.phase + this.time * 0.035) % 1, len = Math.min(0.05, 14 / Math.max(20, from.distanceTo(to)));
      arc(from, to, t, p0);
      arc(from, to, Math.max(0, t - len), p1);
      // (not one in the lens's face as the ending opens by the Earth)
      if (p0.distanceToSquared(cam) > 50 * 50) this.beams.add(p1, p0, 0.02, 0.32, GOLD, 2.2 * Math.sin(Math.PI * t) ** 0.5);
    }
    if (v.mercury === 1) {
      const m = this.planets.get('mercury')!.holder.position;
      arc(earth, m, v.mercuryProgress, p0);
      arc(earth, m, Math.max(0, v.mercuryProgress - 0.04), p1);
      this.beams.add(p1, p0, 0.02, 0.4, CYAN, 3);
    }
    const power = (1 - v.damage * 0.6) * (shot ? THREE.MathUtils.smoothstep(shot.wave, 0.3, 1.6) : 1);
    const lit = (lon: number) => (v.segments[Math.min(11, Math.floor((lon / (Math.PI * 2)) * 12))] ?? 0) > 0.2;
    const send = (lons: number[], n: number, to: THREE.Vector3, color: THREE.Color, w: number) => {
      for (const lon of lons) {
        if (n <= 0) break;
        if (!lit(lon)) continue;
        this.beams.add(this.onRing(lon, earthAngle, b), to, 0.9, w, color, 0.55 * power);
        n--;
      }
    };
    if (power > 0.01) {
      send([0.16, 0.5, 0.95, 1.5], Math.min(4, Math.ceil(v.beamsTW / 40)), earth, GOLD, 1.6);
      if (this.ring) send([0.33, 0.75, 1.25], Math.min(3, Math.ceil(v.ringsTW / 300)), this.ring.position, CYAN, 1.2);
      if (this.habitat) send([0.05, 0.4], Math.min(2, Math.ceil(v.habitatTW / 300)), this.habitat.position, GOLD, 1.0);
    }
    this.beams.end();
    // Solar Maximum: eruptions swelling out past the planets
    for (const e of this.eruptions) {
      e.mesh.visible = storm > 0;
      if (!e.mesh.visible) continue;
      const k = (this.time * 0.07 + e.phase) % 1;
      e.mesh.scale.setScalar(SUN_R * 1.2 + k * AU * 1.5);
      e.mesh.rotation.set(e.phase * 9, this.time * 0.05 + e.phase * 4, 0);
      e.mesh.material.uniforms.uK.value = storm * 2.4 * Math.pow(1 - k, 2) * Math.min(1, k * 12);
    }
    this.updateLabels(v, earth);
  }

  /** Free flight: round the Sun (or the planet you clicked), with a little weight to it. */
  private freeCamera(dt: number) {
    const centre = this.focusPos();
    // round a planet the view turns with it, so its light stays where you put it (Mercury laps the Sun in seconds)
    const sunward = this.focus ? Math.atan2(-centre.z, -centre.x) : null;
    if (sunward !== null && this.sunward !== null) {
      const d = Math.atan2(Math.sin(sunward - this.sunward), Math.cos(sunward - this.sunward));
      this.az += d;
      if (this.glide) this.glide.az += d;
    }
    this.sunward = sunward;
    if (this.glide) {
      // flying to a planet: swing round to its sunlit side on the way
      const k = Math.min(1, dt * 2.6), da = Math.atan2(Math.sin(this.glide.az - this.az), Math.cos(this.glide.az - this.az));
      this.az += da * k;
      this.el += (this.glide.el - this.el) * k;
      if (Math.abs(da) + Math.abs(this.glide.el - this.el) < 0.004) this.glide = null;
    } else if (!this.down) {
      // a flick keeps turning and settles; left alone, the view drifts slowly round
      this.az += this.vAz * dt + dt * 0.008;
      this.el += this.vEl * dt;
      const k = Math.exp(-dt * 3.2);
      this.vAz *= k;
      this.vEl *= k;
    }
    this.dist += (this.goalDist - this.dist) * Math.min(1, dt * 4);
    this.el = Math.max(0.04, Math.min(1.45, this.el));
    this.lag.multiplyScalar(Math.exp(-dt * 3));
    centre.add(this.lag);
    // (the Sun sits a little above the middle: the near arc of the orbits gets the room)
    const lift = this.focus ? 0 : this.dist * 0.035;
    this.camera.position.set(Math.cos(this.az) * Math.cos(this.el), Math.sin(this.el), Math.sin(this.az) * Math.cos(this.el)).multiplyScalar(this.dist).add(centre);
    this.camera.lookAt(centre.x, centre.y - lift, centre.z);
  }

  private focusPos() {
    return this.focus ? this.planets.get(this.focus)!.holder.position.clone() : new THREE.Vector3();
  }

  private focusRadius() {
    return this.focus ? this.planets.get(this.focus)!.def.r : SUN_R;
  }

  /** Fly the camera to a planet (null = back to the Sun). */
  private setFocus(f: PlanetId | null) {
    const from = this.focusPos().add(this.lag);
    this.focus = f;
    this.sunward = null;
    const to = this.focusPos();
    this.lag.copy(from).sub(to);
    this.goalDist = f ? this.focusRadius() * 9 : 880;
    // a planet is best seen three-quarters lit: the Sun over one shoulder (whichever side is the shorter way round)
    const sunward = Math.atan2(-to.z, -to.x), turn = (a: number) => Math.abs(Math.atan2(Math.sin(a - this.az), Math.cos(a - this.az)));
    this.glide = f ? { az: turn(sunward + 0.95) < turn(sunward - 0.95) ? sunward + 0.95 : sunward - 0.95, el: 0.2 } : { az: this.az, el: 0.46 };
  }

  private screenOf(p: THREE.Vector3) {
    const q = p.clone().project(this.camera);
    if (q.z > 1) return null;
    return { x: (q.x * 0.5 + 0.5) * this.w, y: (-q.y * 0.5 + 0.5) * this.h };
  }

  /** A world radius at a world point, in screen pixels. */
  private pixels(r: number, at: THREE.Vector3) {
    return (r / Math.max(1, at.distanceTo(this.camera.position))) * (this.h / (2 * Math.tan((this.camera.fov * RAD) / 2)));
  }

  /** Things you can click: the Earth (→ orbit), the yards, the ring, the habitat, worked asteroids; planets to fly to. */
  private targets(v: SystemView, earth: THREE.Vector3): Target[] {
    const out: Target[] = [{ id: 'earth', name: 'Earth & Moon', at: earth.clone(), r: PLANETS[2].r, open: 'orbit' }];
    for (const p of this.planets.values()) if (p.def.id !== 'earth') out.push({ id: p.def.id, name: p.def.name, at: p.holder.position.clone(), r: p.def.r, open: '', focus: true });
    if (this.focus) out.push({ id: 'sun', name: 'The Sun', at: new THREE.Vector3(), r: SUN_R, open: '', focus: true });
    out.push({ id: 'l4', name: 'L4 Yards', at: this.lagrange('l4', earth), r: 2, open: 'l4' }, { id: 'l5', name: 'L5 Yards', at: this.lagrange('l5', earth), r: 2, open: 'l5' });
    if (v.ringsTW > 0) out.push({ id: 'ring', name: 'Ring One', at: this.station(-0.25, earth, 5), r: 3, open: 'ring' });
    if (v.habitatTW > 0 || v.spacePop > 0) out.push({ id: 'aurora', name: 'Aurora', at: this.lagrange('l5', earth).add(new THREE.Vector3(0, 5, 0)), r: 1.6, open: 'aurora' });
    for (const a of v.asteroids) if (a.status >= 1) out.push({ id: a.id, name: a.name, at: this.asteroidPos(a.id, v.day), r: 1.4 + Math.min(3.4, Math.sqrt(a.def.km) * 0.28), open: a.id });
    return out;
  }

  private updateLabels(v: SystemView, earth: THREE.Vector3) {
    const targets = this.targets(v, earth);
    this.last = { v, targets };
    if (this.opts.cinematic) { this.labels.show([]); return; }
    const items: LabelItem[] = [];
    for (const t of targets) {
      const p = this.screenOf(t.at);
      if (!p || t.id === this.focus) continue;
      const tone = this.hover === t.id ? 'sp hot' : t.open ? (t.id === 'earth' ? 'sp gold' : 'sp place') : 'sp';
      items.push({ id: t.id, text: t.name, x: p.x, y: p.y - this.pixels(t.r, t.at) - 5, pri: t.id === 'earth' ? 9 : t.open ? 5 : 2, tone });
    }
    this.labels.show(items, (this.game.mode === 'title' ? 0.8 : 1) * (1 - Math.min(1, this.game.stage.fade)));
  }

  private hitAt(x: number, y: number) {
    if (!this.last) return null;
    let best: Target | null = null, bd = Infinity;
    for (const t of this.last.targets) {
      const p = this.screenOf(t.at);
      if (!p || t.id === this.focus) continue;
      // within the body's disc, or near a small one
      const d = Math.hypot(p.x - x, p.y - y) - Math.max(0, this.pixels(t.r, t.at) - 6);
      if (d < 22 && d < bd) { bd = d; best = t; }
    }
    return best;
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }
  busy() { return !this.cinematicDone || !!this.down?.moved || !!this.glide || Math.abs(this.goalDist - this.dist) > 1 || this.lag.lengthSq() > 4 || Math.abs(this.vAz) + Math.abs(this.vEl) > 0.05; }

  pointerDown(p: PixelPointer) {
    if (this.opts.cinematic) return;
    this.down = { x: p.x, y: p.y, moved: false, t: performance.now() };
    this.vAz = this.vEl = 0;
    this.glide = null;
  }
  pointerMove(p: PixelPointer) {
    if (this.down) {
      const dx = p.x - this.down.x, dy = p.y - this.down.y;
      if (!this.down.moved && Math.hypot(dx, dy) > (p.pointerType === 'mouse' ? 3 : 10)) this.down.moved = true;
      if (this.down.moved) {
        const now = performance.now(), dt = Math.max(0.004, (now - this.down.t) / 1000);
        this.az += dx * 0.005;
        this.el += dy * 0.004;
        // the hand's speed, smoothed: what the view keeps when you let go
        this.vAz += ((dx * 0.005) / dt - this.vAz) * 0.4;
        this.vEl += ((dy * 0.004) / dt - this.vEl) * 0.4;
        this.down.x = p.x; this.down.y = p.y; this.down.t = now;
        return;
      }
    }
    const h = this.hitAt(p.x, p.y);
    this.hover = h && (h.open || h.focus) ? h.id : null;
    this.game.stage.canvas.style.cursor = this.hover ? 'pointer' : '';
  }
  pointerUp(p: PixelPointer) {
    const d = this.down;
    this.down = null;
    // a hand that stopped before letting go leaves the view still
    if (d && performance.now() - d.t > 90) this.vAz = this.vEl = 0;
    if (!d || d.moved || this.game.mode === 'title' || this.opts.cinematic) return;
    const h = this.hitAt(p.x, p.y);
    if (!h) return;
    if (h.open === 'orbit') this.game.enterOrbit();
    else if (h.open) this.game.enterDiorama(h.open);
    else if (h.focus) this.setFocus(h.id === 'sun' ? null : (h.id as PlanetId));
  }
  pointerCancel() { this.down = null; }
  pointerLeave() { this.hover = null; }

  private zoom(f: number) {
    if (this.opts.cinematic) return;
    const r = this.focusRadius();
    const min = this.focus ? r * 3.2 : 150, max = this.focus ? 520 : 2400;
    const want = this.goalDist * f;
    // pulling back far enough from a planet lets go of it
    if (this.focus && want > max) { this.setFocus(null); return; }
    this.goalDist = Math.max(min, Math.min(max, want));
  }
  wheel(_p: PixelPointer, deltaY: number) { this.zoom(Math.pow(1.0015, deltaY)); }
  zoomIn() { this.zoom(1 / 1.3); }
  zoomOut() { this.zoom(1.3); }

  destroy() {
    this.labels.destroy();
    this.game.stage.canvas.style.cursor = '';
    disposeObject(this.scene);
    for (const l of this.lamps) l.dispose();
  }
}

const ORIGIN = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
/** Every lamp is this one ball (shared, so it's never freed with one). */
const LAMP_GEO = new THREE.SphereGeometry(1, 8, 6);
LAMP_GEO.userData.shared = true;
