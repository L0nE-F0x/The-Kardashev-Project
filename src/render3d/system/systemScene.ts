/**
 * The solar-system view (Act V) in 3D: the Sun, Mercury, Venus, the Earth (with the Moon) and Mars
 * on their orbits (time compressed to about a year a minute from the game's date), the asteroid belt
 * with your claims and the foundries working them, haul ships to the L4/L5 yards, the swarm's twelve
 * arcs lighting up along Earth's orbit, the compute rings, the Mercury probe, Solar Maximum's flares.
 * With `cinematic` it plays the ending: close on Earth, a long pull-back to the whole inner system as
 * the arcs ignite, then a slow drift (as the pixel SystemScene, `cinematicDone`).
 */
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { PixelPointer } from '../../render/stage';
import type { Scene3D } from '../stage3d';
import { defaultLook, type Look } from '../post';
import { systemView, type SystemView } from '../../sim/systemView';
import { ASTEROIDS } from '../../content/system';
import { dateOf } from '../../sim/core';
import { cloudMaterial, earthMaterial, earthTextures } from '../globe/earth';
import { disposeObject, Kit, rng, noise } from '../kit';
import { Labels } from '../globe/labels';
import { PALETTE } from '../../render/palette';

const AU = 230;
const CINE_HOLD = 2, CINE_PULL = 10;
const PLANETS = [
  { id: 'mercury', name: 'Mercury', au: 0.39, days: 88, r: 2.4, col: ['#8a7f78', '#bfb2a6'] },
  { id: 'venus', name: 'Venus', au: 0.72, days: 225, r: 4.6, col: ['#d8c08a', '#efe2bc'] },
  { id: 'earth', name: 'Earth', au: 1.0, days: 365.25, r: 5.2, col: ['#2c6399', '#5a9537'] },
  { id: 'mars', name: 'Mars', au: 1.52, days: 687, r: 3.2, col: ['#9c4f34', '#d4875a'] },
] as const;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });

function planetTexture(a: string, b: string, seed: number, bands = false) {
  const w = 256, h = 128, data = new Uint8Array(w * h * 4);
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = bands ? noise(x * 0.02, y * 0.15, seed) * 0.7 + noise(x * 0.08, y * 0.3, seed + 1) * 0.3 : noise(x * 0.03, y * 0.06, seed) * 0.6 + noise(x * 0.15, y * 0.3, seed + 1) * 0.4;
    const c = ca.clone().lerp(cb, t);
    const o = (y * w + x) * 4;
    data[o] = c.r * 255; data[o + 1] = c.g * 255; data[o + 2] = c.b * 255; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class SystemScene3D implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  readonly look: Look = { ...defaultLook(), bloom: 0.55, bloomThreshold: 1.0, vignette: 0.4 };
  /** The ending's pull-back has finished (the UI waits for it). */
  cinematicDone: boolean;
  private planets = new Map<string, { obj: THREE.Mesh; au: number; days: number; r: number }>();
  private moon: THREE.Mesh;
  private sun: THREE.Mesh;
  private sunGlow: THREE.Sprite;
  private swarm: THREE.InstancedMesh;
  private swarmSeg: Int16Array;
  /** Every collector's matrix as laid out; each frame copies the lit ones to the front. */
  private swarmBase: Float32Array;
  private swarmMat: THREE.MeshStandardMaterial;
  private belt: THREE.Points;
  private asteroids = new Map<string, THREE.Mesh>();
  private dyn = new THREE.Group();
  private flares: THREE.Mesh[] = [];
  private shock: THREE.Mesh;
  private probe: THREE.Mesh;
  private labels = new Labels();
  private key = '';
  private hauls: { ship: THREE.Object3D; from: string; to: 'l4' | 'l5'; phase: number }[] = [];
  private earthMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private time = 0;
  private cineT = 0;
  private w = 1;
  private h = 1;
  private az = -1.0;
  private el = 0.55;
  private dist = 900;
  private goalDist = 900;
  private down: { x: number; y: number; moved: boolean } | null = null;
  private hover: string | null = null;

  constructor(private readonly game: Game, private readonly opts: { cinematic?: boolean } = {}) {
    this.cinematicDone = !opts.cinematic;
    this.scene.background = new THREE.Color(0x020308);
    this.scene.add(starfield());
    // the Sun: a white-hot ball, a glow, the light every planet is lit by
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(16, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.4), toneMapped: true }));
    const glowTex = radialTexture();
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd08a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sunGlow.scale.setScalar(110);
    this.scene.add(this.sun, this.sunGlow, new THREE.PointLight(0xfff1dc, 4, 0, 0), new THREE.AmbientLight(0x30364c, 0.5));
    // orbits
    for (const p of PLANETS) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(p.au * AU, 0.35, 4, 256), new THREE.MeshBasicMaterial({ color: 0x9cc4ea, transparent: true, opacity: 0.14, depthWrite: false }));
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
    const lod = game.world.lods[game.world.lods.length - 1];
    const tex = earthTextures(lod);
    this.earthMat = earthMaterial(tex, lod.W, lod.H);
    this.cloudMat = cloudMaterial(tex);
    PLANETS.forEach((p, i) => {
      const m = p.id === 'earth'
        ? new THREE.Mesh(new THREE.SphereGeometry(p.r, 64, 32), this.earthMat)
        : new THREE.Mesh(new THREE.SphereGeometry(p.r, 40, 24), new THREE.MeshStandardMaterial({ map: planetTexture(p.col[0], p.col[1], i * 7 + 2, p.id === 'venus'), roughness: 0.9 }));
      if (p.id === 'earth') m.add(new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.01, 48, 24), this.cloudMat));
      this.scene.add(m);
      this.planets.set(p.id, { obj: m, au: p.au, days: p.days, r: p.r });
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), new THREE.MeshStandardMaterial({ color: 0xbfb6ac, roughness: 1 }));
    this.scene.add(this.moon);
    // the asteroid belt's haze
    const r = rng(5);
    const n = 5000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = (2.15 + r() * 1.15 + (r() - 0.5) * 0.2) * AU;
      pos.set([Math.cos(a) * d, (r() - 0.5) * 12, Math.sin(a) * d], i * 3);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.belt = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0x9a8a7a, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.6, depthWrite: false }));
    this.scene.add(this.belt);
    // the swarm: collectors in twelve arcs along Earth's orbit (lit as they fill)
    const count = 12 * 220;
    this.swarmMat = new THREE.MeshStandardMaterial({ color: 0xfbd46e, emissive: 0xf7b258, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 });
    this.swarm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), this.swarmMat, count);
    this.swarmSeg = new Int16Array(count);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const seg = Math.floor(i / 220);
      this.swarmSeg[i] = seg;
      const a = ((seg + r()) / 12) * Math.PI * 2;
      const d = AU * (0.93 + (r() - 0.5) * 0.08);
      m4.makeRotationFromEuler(new THREE.Euler(r() * 0.5, -a, r() * 0.5)).setPosition(Math.cos(a) * d, (r() - 0.5) * 16, Math.sin(a) * d);
      this.swarm.setMatrixAt(i, m4);
    }
    this.swarmBase = (this.swarm.instanceMatrix.array as Float32Array).slice();
    this.swarm.count = 0;
    this.scene.add(this.swarm);
    // the storm's flares and shockwave
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.TorusGeometry(6 + i, 1.2, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.4), transparent: true, opacity: 0.8 }));
      f.visible = false;
      this.flares.push(f);
      this.scene.add(f);
    }
    this.shock = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.shock.visible = false;
    this.probe = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), new THREE.MeshBasicMaterial({ color: 0xa3f0d6 }));
    this.probe.visible = false;
    this.scene.add(this.shock, this.probe, this.dyn);
    if (opts.cinematic) { this.dist = 40; this.goalDist = 40; }
  }

  private planetPos(id: string, day: number) {
    const p = this.planets.get(id)!;
    const d = dateOf(Math.floor(day));
    const doy = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
    // about a year a minute, from the game's date
    const phase = { mercury: 1.2, venus: 3.1, earth: 0, mars: 4.4 }[id] ?? 0;
    const a = phase + ((doy + this.time * 6.1) / p.days) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * p.au * AU, 0, Math.sin(a) * p.au * AU);
  }

  private asteroidPos(id: string, day: number) {
    const a = ASTEROIDS.find((x) => x.id === id);
    if (!a) return new THREE.Vector3();
    const per = 365.25 * Math.pow(a.au, 1.5);
    const ang = (a.phase * Math.PI) / 180 + ((day + this.time * 6.1) / per) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(ang) * a.au * AU, Math.sin(ang * 3) * 4, Math.sin(ang) * a.au * AU);
  }

  /** The Earth–Moon L4/L5 points in this view (just ahead of / behind the Earth along its orbit). */
  private lagrange(which: 'l4' | 'l5', earth: THREE.Vector3) {
    const a = Math.atan2(earth.z, earth.x) + (which === 'l4' ? 0.06 : -0.06);
    return new THREE.Vector3(Math.cos(a) * AU, 3, Math.sin(a) * AU);
  }

  private rebuild(v: SystemView) {
    const key = JSON.stringify([v.asteroids.map((a) => a.id + a.status + (a.ownerColor ?? '')), v.foundries.map((f) => f.place + Math.round(f.cap)), v.hauls.map((h) => h.from + h.to + Math.round(h.traffic * 4))]);
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.dyn.children]) { this.dyn.remove(c); disposeObject(c); }
    this.asteroids.clear();
    this.hauls = [];
    for (const a of v.asteroids) {
      if (a.status === 0) continue;
      const k = new Kit(rng(a.id.length * 13));
      k.geo(new THREE.DodecahedronGeometry(1.6 + Math.min(3.4, Math.sqrt(a.def.km) * 0.3), 1).scale(1.3, 0.8, 1), a.type === 'M' ? '#9d95a6' : a.type === 'S' ? '#a08d84' : '#5b536a', 0.15);
      if (a.status >= 2) k.box(0.3, 2.4, 0.3, a.ownerColor ? PALETTE[a.ownerColor] : '#fbd46e', 0, 1, 0, { r: 0 });
      if (a.foundry > 0) k.box(2.2, 1.2, 1.4, '#c3bcc7', 2.2, 0, 0, { r: 0.1 });
      const m = k.build(mat);
      m.userData.id = a.id;
      this.dyn.add(m);
      this.asteroids.set(a.id, m);
    }
    for (const h of v.hauls) {
      const n = Math.max(1, Math.round(h.traffic * 5));
      for (let i = 0; i < n; i++) {
        const ship = new THREE.Mesh(SHIP_GEO, SHIP_MAT);
        this.dyn.add(ship);
        this.hauls.push({ ship, from: h.from, to: h.to, phase: i / n });
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    const s = this.game.view;
    const v = systemView(s);
    this.rebuild(v);
    const day = v.day;
    for (const [id, p] of this.planets) {
      p.obj.position.copy(this.planetPos(id, day));
      p.obj.rotation.y += dt * (id === 'venus' ? 0.05 : 0.4);
    }
    const earth = this.planets.get('earth')!.obj.position;
    const ma = this.time * 0.8;
    this.moon.position.copy(earth).add(new THREE.Vector3(Math.cos(ma) * 12, 0, Math.sin(ma) * 12));
    // the Earth's terminator faces the Sun
    const sunDir = earth.clone().negate().normalize();
    this.earthMat.uniforms.sunDir.value.copy(sunDir);
    this.cloudMat.uniforms.sunDir.value.copy(sunDir);
    // the swarm: a fraction of each arc's collectors shine
    let lit = 0;
    const total = this.swarmSeg.length;
    const arr = this.swarm.instanceMatrix.array as Float32Array;
    const cam = this.camera.position, base = this.swarmBase;
    for (let i = 0; i < total; i++) {
      const fill = v.segments[this.swarmSeg[i]] ?? 0;
      if ((i % 220) / 220 >= fill) continue;
      // (the swarm rides Earth's orbit: a collector right by the camera would fill the screen when it's close to Earth)
      const dx = base[i * 16 + 12] - cam.x, dy = base[i * 16 + 13] - cam.y, dz = base[i * 16 + 14] - cam.z;
      if (dx * dx + dy * dy + dz * dz < 40 * 40) continue;
      // pack the lit ones to the front (the draw count), from the untouched layout
      arr.set(this.swarmBase.subarray(i * 16, i * 16 + 16), lit * 16);
      lit++;
    }
    this.swarm.count = this.opts.cinematic ? Math.round(lit * Math.min(1, Math.max(0, (this.cineT - CINE_HOLD) / CINE_PULL) * 1.2)) : lit;
    this.swarm.instanceMatrix.needsUpdate = true;
    this.swarmMat.emissiveIntensity = (0.9 + Math.sin(this.time * 2) * 0.1) * (1 - v.damage * (0.5 + Math.sin(this.time * 17) * 0.3));
    this.swarm.rotation.y = -this.time * 0.02;
    // asteroids, foundries, hauls
    for (const [id, m] of this.asteroids) {
      m.position.copy(this.asteroidPos(id, day));
      m.rotation.y += dt * 0.5;
    }
    for (const h of this.hauls) {
      const from = h.from === 'moon' ? this.moon.position : this.asteroidPos(h.from, day);
      const to = this.lagrange(h.to, earth);
      const t = (h.phase + this.time * 0.04) % 1;
      const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 30, 0));
      const p = new THREE.Vector3().copy(from).multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * t * (1 - t)).addScaledVector(to, t * t);
      h.ship.position.copy(p);
      h.ship.lookAt(to);
      // (one right by the camera would fill the screen: the cinematic starts at Earth, where the Moon's hauls set off)
      h.ship.visible = p.distanceToSquared(this.camera.position) > 45 * 45;
    }
    // the Mercury probe on its way, Solar Maximum's flares and shockwave
    this.probe.visible = v.mercury === 1;
    if (this.probe.visible) this.probe.position.copy(earth).lerp(this.planets.get('mercury')!.obj.position, v.mercuryProgress);
    const storm = v.storm;
    this.flares.forEach((f, i) => {
      f.visible = storm !== null && Math.sin(this.time * (1.3 + i * 0.4) + i) > 0.2;
      f.rotation.set(i * 1.3 + this.time * 0.2, i * 0.7, 0);
      f.scale.setScalar(1 + (storm ?? 0) * 0.6);
    });
    this.shock.visible = storm !== null;
    if (storm !== null) {
      const k = (this.time * 0.15) % 1;
      this.shock.scale.setScalar(20 + k * AU * 1.4);
      (this.shock.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k) * storm;
    }
    // camera: the ending's pull-back, or free orbit round the Sun
    if (this.opts.cinematic) {
      this.cineT += dt;
      const u = Math.max(0, Math.min(1, (this.cineT - CINE_HOLD) / CINE_PULL));
      const k = u * u * (3 - 2 * u);
      const near = earth.clone().add(new THREE.Vector3(18, 9, 22));
      const far = new THREE.Vector3(Math.cos(this.time * 0.01) * 700, 520, Math.sin(this.time * 0.01) * 700);
      this.camera.position.copy(near).lerp(far, k);
      this.camera.lookAt(earth.clone().lerp(new THREE.Vector3(), k));
      if (u >= 1 && !this.cinematicDone) this.cinematicDone = true;
    } else {
      if (!this.down) this.az += dt * 0.01;
      this.dist += (this.goalDist - this.dist) * Math.min(1, dt * 4);
      this.el = Math.max(0.05, Math.min(1.45, this.el));
      this.camera.position.set(Math.cos(this.az) * Math.cos(this.el), Math.sin(this.el), Math.sin(this.az) * Math.cos(this.el)).multiplyScalar(this.dist);
      this.camera.lookAt(0, 0, 0);
    }
    this.sunGlow.scale.setScalar(110 + Math.sin(this.time * 1.5) * 5 + (storm ?? 0) * 60);
    this.updateLabels(v, earth);
  }

  private screenOf(p: THREE.Vector3) {
    const q = p.clone().project(this.camera);
    if (q.z > 1) return null;
    return { x: (q.x * 0.5 + 0.5) * this.w, y: (-q.y * 0.5 + 0.5) * this.h };
  }

  /** Things you can click: the Earth (→ orbit), the yards, the ring, the habitat, worked asteroids. */
  private targets(v: SystemView, earth: THREE.Vector3): { id: string; name: string; at: THREE.Vector3; open: string }[] {
    const out = [{ id: 'earth', name: 'Earth & Moon', at: earth.clone(), open: 'orbit' }];
    for (const p of PLANETS) if (p.id !== 'earth') out.push({ id: p.id, name: p.name, at: this.planets.get(p.id)!.obj.position.clone(), open: '' });
    out.push({ id: 'l4', name: 'L4 Yards', at: this.lagrange('l4', earth), open: 'l4' }, { id: 'l5', name: 'L5 Yards', at: this.lagrange('l5', earth), open: 'l5' });
    if (v.ringsTW > 0) out.push({ id: 'ring', name: 'Ring One', at: new THREE.Vector3(AU * 0.55, 0, 0), open: 'ring' });
    if (v.habitatTW > 0 || v.spacePop > 0) out.push({ id: 'aurora', name: 'Aurora', at: this.lagrange('l5', earth).add(new THREE.Vector3(0, 8, 0)), open: 'aurora' });
    for (const a of v.asteroids) if (a.status >= 1) out.push({ id: a.id, name: a.name, at: this.asteroidPos(a.id, v.day), open: a.id });
    return out;
  }

  private last: { v: SystemView; earth: THREE.Vector3 } | null = null;

  private updateLabels(v: SystemView, earth: THREE.Vector3) {
    this.last = { v, earth: earth.clone() };
    if (this.opts.cinematic) { this.labels.show([]); return; }
    const items = [];
    for (const t of this.targets(v, earth)) {
      const p = this.screenOf(t.at.clone().add(new THREE.Vector3(0, 9, 0)));
      if (p) items.push({ id: t.id, text: t.name, x: p.x, y: p.y, pri: t.open ? 5 : 2, tone: this.hover === t.id ? 'hot' : t.open ? 'owned' : 'build' });
    }
    this.labels.show(items, 1 - Math.min(1, this.game.stage.fade));
  }

  private hitAt(x: number, y: number) {
    if (!this.last) return null;
    let best: { id: string; open: string } | null = null, bd = 22;
    for (const t of this.targets(this.last.v, this.last.earth)) {
      const p = this.screenOf(t.at);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }
  busy() { return !this.cinematicDone || !!this.down?.moved || Math.abs(this.goalDist - this.dist) > 1; }

  pointerDown(p: PixelPointer) { if (!this.opts.cinematic) this.down = { x: p.x, y: p.y, moved: false }; }
  pointerMove(p: PixelPointer) {
    if (this.down) {
      const dx = p.x - this.down.x, dy = p.y - this.down.y;
      if (!this.down.moved && Math.hypot(dx, dy) > (p.pointerType === 'mouse' ? 3 : 10)) this.down.moved = true;
      if (this.down.moved) { this.az += dx * 0.005; this.el += dy * 0.004; this.down.x = p.x; this.down.y = p.y; return; }
    }
    const h = this.hitAt(p.x, p.y);
    this.hover = h?.open ? h.id : null;
    this.game.stage.canvas.style.cursor = this.hover ? 'pointer' : '';
  }
  pointerUp(p: PixelPointer) {
    const d = this.down;
    this.down = null;
    if (!d || d.moved || this.game.mode === 'title' || this.opts.cinematic) return;
    const h = this.hitAt(p.x, p.y);
    if (!h?.open) return;
    if (h.open === 'orbit') this.game.enterOrbit();
    else this.game.enterDiorama(h.open);
  }
  pointerCancel() { this.down = null; }
  pointerLeave() { this.hover = null; }
  wheel(_p: PixelPointer, deltaY: number) { if (!this.opts.cinematic) this.goalDist = Math.max(160, Math.min(2200, this.goalDist * Math.pow(1.0015, deltaY))); }
  zoomIn() { this.goalDist = Math.max(160, this.goalDist / 1.3); }
  zoomOut() { this.goalDist = Math.min(2200, this.goalDist * 1.3); }
  destroy() { this.labels.destroy(); this.game.stage.canvas.style.cursor = ''; disposeObject(this.scene); }
}

/** A haul ship: a little lit hull (shared by every ship, so it's never freed with one). */
const SHIP_GEO = new THREE.BoxGeometry(1.6, 0.6, 0.6);
SHIP_GEO.userData.shared = true;
const SHIP_MAT = new THREE.MeshStandardMaterial({ color: 0xfde9a4, emissive: 0xf7b258, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.3 });
SHIP_MAT.userData.shared = true;

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,240,210,1)');
  grd.addColorStop(0.2, 'rgba(255,200,120,0.55)');
  grd.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function starfield() {
  const r = rng(43);
  const pts: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    pts.push(Math.cos(a) * k * 9000, u * 9000, Math.sin(a) * k * 9000);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdedbe8, size: 1.5, sizeAttenuation: false, depthWrite: false }));
}
