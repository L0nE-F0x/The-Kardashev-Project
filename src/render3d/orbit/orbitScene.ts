/**
 * The orbit view (Act IV–V) in 3D: the Earth from space with the real sun, the Moon in its real
 * phase with the base growing on it, the shells with their satellites and debris glitter, orbital
 * data centres, space-solar stations beaming down to their rectennas, launches climbing out of the
 * spaceport; in Act V the L4/L5 yards, habitat cylinders, beam relays and the storm's aurora.
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
import { atmosphereMaterial, cloudMaterial, dir, earthMaterial, earthTextures, R } from '../globe/earth';
import { Kit, rng, noise } from '../kit';
import { Labels } from '../globe/labels';

const RAD = Math.PI / 180;
const MOON_R = 27, MOON_ORBIT = 380;
const LEO = R * 1.12, GEO = R * 1.62;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });

/** The rectenna point for a province's space-solar station (as the pixel orbit view). */
function rectennaOf(region: RegionId): [number, number] {
  const [lat, lon] = ANCHORS[region] ?? [0, 0];
  return [lat - 2.5, lon + 3];
}

let moonTex: THREE.DataTexture | null = null;
/** Grey highlands, darker maria, craters. */
function moonTexture() {
  if (moonTex) return moonTex;
  const w = 512, h = 256, data = new Uint8Array(w * h * 4);
  const craters: [number, number, number][] = [];
  const r = rng(77);
  for (let i = 0; i < 90; i++) craters.push([r() * w, r() * h, 2 + Math.pow(r(), 3) * 26]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const mare = noise(x * 0.012, y * 0.024, 3) * 0.6 + noise(x * 0.04, y * 0.08, 4) * 0.4;
    let v = 168 - (mare > 0.55 ? (mare - 0.55) * 260 : 0) + (noise(x * 0.3, y * 0.6, 5) - 0.5) * 18;
    for (const [cx, cy, cr] of craters) {
      const dx = Math.min(Math.abs(x - cx), w - Math.abs(x - cx)), d = Math.hypot(dx, (y - cy) * 2) / cr;
      if (d < 1) v -= (1 - d) * 22;
      else if (d < 1.25) v += (1.25 - d) * 40;
    }
    const o = (y * w + x) * 4;
    data[o] = v; data[o + 1] = v * 0.98; data[o + 2] = v * 0.95; data[o + 3] = 255;
  }
  moonTex = new THREE.DataTexture(data, w, h);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  moonTex.wrapS = THREE.RepeatWrapping;
  moonTex.magFilter = THREE.LinearFilter;
  moonTex.minFilter = THREE.LinearMipmapLinearFilter;
  moonTex.generateMipmaps = true;
  moonTex.needsUpdate = true;
  return moonTex;
}

function station(kind: 'odc' | 'sps' | 'relay' | 'yard' | 'build', seed: number) {
  const k = new Kit(rng(seed));
  if (kind === 'odc') {
    k.box(1.4, 0.7, 0.7, '#e6e0e3', 0, -0.35, 0, { r: 0.08 });
    k.box(0.2, 0.2, 4.2, '#345c96', -0.9, -0.1, 0, { r: 0 });
    k.box(0.2, 0.2, 4.2, '#345c96', 0.9, -0.1, 0, { r: 0 });
    k.box(2.6, 0.06, 1.4, '#c3bcc7', 0, 0.45, 0, { r: 0 }); // radiator
  } else if (kind === 'sps') {
    k.box(5.5, 0.06, 5.5, '#2c3f6e', 0, 0, 0, { r: 0, jitter: 0.06 });
    k.box(0.7, 0.7, 0.7, '#efe8de', 0, -0.5, 0, { r: 0.1 });
  } else if (kind === 'relay') {
    k.box(0.8, 0.8, 0.8, '#efe8de', 0, -0.4, 0, { r: 0.1 });
    k.geo(new THREE.CylinderGeometry(1.1, 0.2, 0.5, 12).translate(0, -1.1, 0), '#c3bcc7', 0.02);
  } else if (kind === 'yard') {
    k.box(2.4, 1.4, 1.4, '#c3bcc7', 0, -0.7, 0, { r: 0.1 });
    k.beam(new THREE.Vector3(-3, 0, 0), new THREE.Vector3(3, 0, 0), 0.25, '#9d95a6');
    k.box(1.6, 0.05, 1.6, '#fbd46e', 2.4, 0.4, 1, { r: 0 });
  } else {
    k.box(1.2, 0.8, 0.8, '#fbd46e', 0, -0.4, 0, { r: 0.05 });
    k.beam(new THREE.Vector3(-1.4, 0, -0.6), new THREE.Vector3(1.4, 0, 0.6), 0.12, '#f08a46');
  }
  const m = k.build(mat);
  m.castShadow = false;
  m.receiveShadow = false;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export class OrbitScene3D implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 8000);
  readonly look: Look = { ...defaultLook(), bloom: 0.35, bloomThreshold: 1.15, vignette: 0.36 };
  private earthMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private atmo: THREE.ShaderMaterial;
  private sun = new THREE.DirectionalLight(0xfff4e6, 2.8);
  private moonPivot = new THREE.Group();
  private moon: THREE.Mesh;
  private moonBase = new THREE.Group();
  private dyn = new THREE.Group();
  private debris: THREE.Points;
  private debrisMat: THREE.PointsMaterial;
  private labels = new Labels();
  private key = '';
  private odcs: { obj: THREE.Object3D; phase: number; inc: number; node: number }[] = [];
  private spsObjs: { obj: THREE.Object3D; beam: THREE.Mesh; ground: THREE.Mesh }[] = [];
  private launches: { obj: THREE.Group; t0: number }[] = [];
  private aurora: THREE.Mesh[] = [];
  private habitats: THREE.Object3D[] = [];
  private yards: { l4: THREE.Group; l5: THREE.Group };
  private w = 1;
  private h = 1;
  private time = 0;
  private az = -0.6;
  private el = 0.32;
  private dist = 640;
  private goalDist = 640;
  private down: { x: number; y: number; moved: boolean } | null = null;
  private idleUntil = 0;
  private hover: string | null = null;
  private framed = false;

  constructor(private readonly game: Game, private readonly opts: { tour?: boolean } = {}) {
    const lod = game.world.lods[game.world.lods.length - 1];
    const tex = earthTextures(lod);
    this.earthMat = earthMaterial(tex, lod.W, lod.H);
    this.cloudMat = cloudMaterial(tex);
    this.atmo = atmosphereMaterial(1.1);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 96), this.earthMat);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.009, 128, 64), this.cloudMat);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 48), this.atmo);
    clouds.renderOrder = 2;
    atmo.renderOrder = 3;
    this.scene.add(earth, clouds, atmo, this.sun, this.sun.target, new THREE.AmbientLight(0x404a70, 0.35));
    this.scene.background = new THREE.Color(0x03040a);
    this.scene.add(starfield());
    // the Moon on its orbit (in the plane the camera sees edge-on-ish)
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 64, 32), new THREE.MeshStandardMaterial({ map: moonTexture(), roughness: 1, metalness: 0 }));
    this.moon.position.set(MOON_ORBIT, 0, 0);
    this.moon.add(this.moonBase);
    this.moonPivot.add(this.moon);
    this.moonPivot.rotation.x = 5 * RAD;
    this.scene.add(this.moonPivot);
    // orbit rings: low orbit, geostationary, the Moon's
    for (const [r, op] of [[LEO, 0.18], [GEO, 0.22]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 4, 160), new THREE.MeshBasicMaterial({ color: 0x9cc4ea, transparent: true, opacity: op, depthWrite: false }));
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }
    const mo = new THREE.Mesh(new THREE.TorusGeometry(MOON_ORBIT, 0.4, 4, 240), new THREE.MeshBasicMaterial({ color: 0x9d95a6, transparent: true, opacity: 0.16, depthWrite: false }));
    mo.rotation.x = Math.PI / 2;
    this.moonPivot.add(mo);
    // debris glitter (a pool, sized each frame by the shells' debris)
    const n = 2400;
    const pos = new Float32Array(n * 3);
    const r = rng(3);
    for (let i = 0; i < n; i++) {
      const shell = i % 3;
      const rad = shell === 0 ? LEO * (0.97 + r() * 0.08) : shell === 1 ? GEO * (0.98 + r() * 0.05) : R * (2.2 + r() * 1.6);
      const a = r() * Math.PI * 2, inc = (r() - 0.5) * (shell === 1 ? 0.08 : 1.6);
      pos.set([Math.cos(a) * rad, Math.sin(a) * Math.sin(inc) * rad, Math.sin(a) * Math.cos(inc) * rad], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.debrisMat = new THREE.PointsMaterial({ color: 0xe6e0e3, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false });
    this.debris = new THREE.Points(dg, this.debrisMat);
    this.scene.add(this.debris, this.dyn);
    this.yards = { l4: new THREE.Group(), l5: new THREE.Group() };
    this.moonPivot.add(this.yards.l4, this.yards.l5);
    for (const [g, a] of [[this.yards.l4, 60], [this.yards.l5, -60]] as const) g.position.set(Math.cos(a * RAD) * MOON_ORBIT, 0, -Math.sin(a * RAD) * MOON_ORBIT);
  }

  /** Rebuild what depends on the state (stations, base, yards) when it changes. */
  private rebuild(ov: OrbitView) {
    const ex = orbitExtras(this.game.view);
    const key = JSON.stringify([ov.stage, Math.round(ov.odcGW), ov.odcBuilding.length, ov.sps.map((x) => x.region + x.status), ov.moon.stage, ov.moon.he3, Math.round(ex.l4), Math.round(ex.l5), ex.habitats, Math.round(ex.beamsTW), ex.storm !== null]);
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.dyn.children]) this.dyn.remove(c);
    this.odcs = [];
    this.spsObjs = [];
    const r = rng(9);
    // orbital data centres in low orbit (building ones are scaffolds)
    const nOdc = Math.min(28, Math.ceil(ov.odcGW / 3)) + ov.odcBuilding.length;
    for (let i = 0; i < nOdc; i++) {
      const obj = station(i >= nOdc - ov.odcBuilding.length ? 'build' : 'odc', i);
      this.dyn.add(obj);
      this.odcs.push({ obj, phase: r() * Math.PI * 2, inc: (r() - 0.5) * 1.2, node: r() * Math.PI * 2 });
    }
    // space-solar stations in the geostationary belt over their rectennas, beaming down; relays for Act V's beams
    const beams = [...ov.sps.map((x) => ({ region: x.region, online: x.status === 'online' }))];
    const relays = Math.min(10, Math.round(ex.beamsTW / 4));
    const REG: RegionId[] = ['pac', 'atl', 'lat', 'eur', 'nor', 'stp', 'mena', 'ssa', 'sas', 'eam', 'fab', 'seo'];
    for (let i = 0; i < relays; i++) beams.push({ region: REG[(i * 5) % REG.length], online: true });
    beams.forEach((b, i) => {
      const [lat, lon] = rectennaOf(b.region);
      const obj = station(i < ov.sps.length ? 'sps' : 'relay', i + 50);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0xfde9a4, transparent: true, opacity: b.online ? 0.85 : 0.3, toneMapped: false }));
      const gp = dir(lon, lat);
      ground.position.copy(gp).multiplyScalar(R * 1.002);
      ground.lookAt(gp.clone().multiplyScalar(R * 2));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.5, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: b.online ? 0.16 : 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      obj.userData.lonlat = [lon, lat];
      this.dyn.add(obj, ground, beam);
      this.spsObjs.push({ obj, beam, ground });
    });
    // the Moon base: lights and domes at the south pole, then the mine, then the mass driver
    for (const c of [...this.moonBase.children]) this.moonBase.remove(c);
    if (ov.moon.stage >= 1) {
      const k = new Kit(rng(4));
      for (let i = 0; i < 3 + ov.moon.stage * 3; i++) {
        const a = r() * Math.PI * 2, d = r() * 4;
        k.geo(new THREE.SphereGeometry(0.5 + r() * 0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(Math.cos(a) * d, 0, Math.sin(a) * d), '#e6e0e3', 0.03);
      }
      if (ov.moon.stage >= 3) k.box(18, 0.4, 0.8, '#9d95a6', 6, 0, 0, { r: 0.05 });
      const base = k.build(mat);
      base.position.set(0, -MOON_R + 0.1, 0);
      base.rotation.x = Math.PI;
      this.moonBase.add(base);
      const glow = new THREE.PointLight(0xffd9a0, 30, 30, 2);
      glow.position.set(0, -MOON_R - 2, 0);
      this.moonBase.add(glow);
    }
    // Act V: foundry yards at L4/L5 (bigger with output), habitat cylinders at L5
    for (const [g, mt] of [[this.yards.l4, ex.l4], [this.yards.l5, ex.l5]] as const) {
      for (const c of [...g.children]) g.remove(c);
      const n2 = mt <= 0 ? 0 : mt >= 12 ? 6 : mt >= 4 ? 4 : 2;
      for (let i = 0; i < n2; i++) {
        const y = station('yard', i + 80);
        y.position.set((r() - 0.5) * 14, (r() - 0.5) * 8, (r() - 0.5) * 14);
        y.rotation.set(r() * 3, r() * 3, r() * 3);
        g.add(y);
      }
    }
    this.habitats = [];
    for (let i = 0; i < ex.habitats; i++) {
      const k = new Kit(rng(i + 90));
      k.cyl(2.2, 2.2, 12, '#e6e0e3', 0, -6, 0, 18);
      for (let s = 0; s < 3; s++) k.box(0.6, 12, 0.05, '#3b6f7a', Math.cos((s * Math.PI * 2) / 3) * 2.21, -6, Math.sin((s * Math.PI * 2) / 3) * 2.21, { r: 0, jitter: 0 });
      const cyl = k.build(mat);
      cyl.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(cyl);
      holder.position.set(10 + i * 6, (i % 2) * 6 - 3, 12);
      this.yards.l5.add(holder);
      this.habitats.push(cyl);
    }
    // the storm's aurora over both poles
    for (const a of this.aurora) this.scene.remove(a);
    this.aurora = [];
    if (ex.storm !== null) {
      for (const pole of [1, -1]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.34, R * 0.3, R * 0.16, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fd3b5, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.position.y = pole * R * 0.93;
        this.aurora.push(m);
        this.scene.add(m);
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    const g = this.game;
    const s = g.view;
    const ov = orbitView(s);
    this.rebuild(ov);
    const ex = orbitExtras(s);
    // the camera turns slowly on its own unless you've just touched it
    if (!this.down && this.time > this.idleUntil) this.az += dt * 0.03;
    this.dist += (this.goalDist - this.dist) * Math.min(1, dt * 4);
    this.el = Math.max(-1.2, Math.min(1.2, this.el));
    this.camera.position.set(Math.cos(this.az) * Math.cos(this.el), Math.sin(this.el), Math.sin(this.az) * Math.cos(this.el)).multiplyScalar(this.dist);
    this.camera.lookAt(this.dist > 500 ? new THREE.Vector3(MOON_ORBIT * 0.18, 0, 0).applyQuaternion(this.moonPivot.quaternion) : new THREE.Vector3());
    // the real sun; the Moon at its real phase (its elongation from the sun)
    const ss = subsolar(new Date());
    const sunDir = dir(ss.lon, ss.lat);
    this.earthMat.uniforms.sunDir.value.copy(sunDir);
    this.cloudMat.uniforms.sunDir.value.copy(sunDir);
    this.atmo.uniforms.sunDir.value.copy(sunDir);
    this.sun.position.copy(sunDir).multiplyScalar(2000);
    const shift = (this.time * 0.0016) % 1;
    this.earthMat.uniforms.cloudShift.value = shift;
    this.cloudMat.uniforms.cloudShift.value = shift;
    const synodic = 29.530588;
    const age = (((Date.now() / 86_400_000 - 10962.77) % synodic) + synodic) % synodic;
    const sunAng = Math.atan2(-sunDir.z, sunDir.x);
    this.moonPivot.rotation.y = sunAng + (age / synodic) * Math.PI * 2 + Math.PI;
    this.moon.rotation.y = -this.moonPivot.rotation.y;
    // first frame: look from where the Moon stands off to one side of the Earth
    if (!this.framed) { this.framed = true; this.az = -this.moonPivot.rotation.y + 1.25; }
    // stations in motion
    for (const o of this.odcs) {
      const a = o.phase + this.time * 0.2;
      const p = new THREE.Vector3(Math.cos(a) * LEO, Math.sin(a) * Math.sin(o.inc) * LEO, Math.sin(a) * Math.cos(o.inc) * LEO).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.node);
      o.obj.position.copy(p);
      o.obj.lookAt(new THREE.Vector3());
    }
    for (const sp of this.spsObjs) {
      const [lon, lat] = sp.obj.userData.lonlat as [number, number];
      const over = dir(lon, 0).multiplyScalar(GEO);
      sp.obj.position.copy(over);
      sp.obj.lookAt(new THREE.Vector3());
      const ground = dir(lon, lat).multiplyScalar(R * 1.002);
      const mid = over.clone().add(ground).multiplyScalar(0.5);
      sp.beam.position.copy(mid);
      sp.beam.scale.set(1, over.distanceTo(ground), 1);
      sp.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ground.clone().sub(over).normalize().negate());
      (sp.ground.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.time * 3) * 0.2;
    }
    // launches climbing out of the spaceport, one every few seconds when the cadence is up
    if (ov.spaceport) {
      const every = Math.max(2.5, 9 / Math.max(0.3, ov.cadence));
      if (!this.launches.length || this.time - this.launches[this.launches.length - 1].t0 > every) {
        const k = new Kit(rng(this.launches.length));
        k.cyl(0.25, 0.25, 2, '#efe8de', 0, 0, 0, 8);
        const obj = new THREE.Group();
        obj.add(k.build(mat));
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfde9a4, toneMapped: false }));
        flame.position.y = -0.4;
        obj.add(flame);
        this.scene.add(obj);
        this.launches.push({ obj, t0: this.time });
      }
      const site = siteDef(ov.spaceport);
      const n = dir(site.lon, site.lat);
      for (const l of [...this.launches]) {
        const t = (this.time - l.t0) / 5.5;
        if (t > 1) { this.scene.remove(l.obj); this.launches.splice(this.launches.indexOf(l), 1); continue; }
        // up, then bending east into orbit
        const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
        const p = n.clone().multiplyScalar(R + t * t * (LEO - R) * 1.1).addScaledVector(east, t * t * t * 30);
        l.obj.position.copy(p);
        l.obj.lookAt(p.clone().add(n.clone().multiplyScalar(1 - t).addScaledVector(east, t * 1.5)));
        l.obj.rotateX(Math.PI / 2);
        l.obj.visible = true;
      }
    }
    // debris: more glitter the dirtier the shells; red in a cascade
    const cnt = Math.min(2400, Math.round((ov.debris.leo + ov.debris.geo + ov.debris.cis) * 8 + 60));
    this.debris.geometry.setDrawRange(0, cnt);
    this.debrisMat.color.set(ov.cascade !== null ? (Math.sin(this.time * 8) > 0 ? 0xc23a3f : 0xf08a46) : 0xe6e0e3);
    this.debris.rotation.y = this.time * 0.05;
    for (const c of this.habitats) c.rotation.y += dt * 0.6;
    for (const a of this.aurora) {
      (a.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(this.time * 2 + a.position.y) * 0.1;
      a.rotation.y += dt * 0.2;
    }
    void ex;
    this.updateLabels();
  }

  private screenOf(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  private spots(): { id: string; name: string; at: THREE.Vector3; r: number }[] {
    const s = this.game.view;
    const out: { id: string; name: string; at: THREE.Vector3; r: number }[] = [{ id: 'moon', name: 'The Moon', at: this.moon.getWorldPosition(new THREE.Vector3()), r: MOON_R }];
    if (s?.system) {
      out.push({ id: 'l4', name: 'L4 Yards', at: this.yards.l4.getWorldPosition(new THREE.Vector3()), r: 16 });
      out.push({ id: 'l5', name: 'L5 Yards', at: this.yards.l5.getWorldPosition(new THREE.Vector3()), r: 16 });
      if (this.habitats.length) out.push({ id: 'aurora', name: 'Aurora', at: this.yards.l5.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(14, 0, 12)), r: 14 });
    }
    return out;
  }

  private updateLabels() {
    const items = [];
    for (const sp of this.spots()) {
      const p = this.screenOf(sp.at.clone().add(new THREE.Vector3(0, sp.r + 4, 0)));
      if (p) items.push({ id: sp.id, text: sp.name, x: p.x, y: p.y, pri: 5, tone: this.hover === sp.id ? 'hot' : 'owned' });
    }
    this.labels.show(items, (this.game.mode === 'title' ? 0.8 : 1) * (1 - Math.min(1, this.game.stage.fade)));
  }

  private spotAt(x: number, y: number): string | null {
    for (const sp of this.spots()) {
      const c = this.screenOf(sp.at);
      if (!c) continue;
      const edge = this.screenOf(sp.at.clone().add(this.camera.up.clone().multiplyScalar(sp.r)));
      const rad = edge ? Math.max(14, Math.hypot(edge.x - c.x, edge.y - c.y)) : 14;
      if (Math.hypot(c.x - x, c.y - y) < rad) return sp.id;
    }
    return null;
  }

  resize(w: number, h: number) { this.w = w; this.h = h; }

  busy() { return !!this.down?.moved || Math.abs(this.goalDist - this.dist) > 1; }

  pointerDown(p: PixelPointer) { this.down = { x: p.x, y: p.y, moved: false }; }

  pointerMove(p: PixelPointer) {
    if (this.down) {
      const dx = p.x - this.down.x, dy = p.y - this.down.y;
      if (!this.down.moved && Math.hypot(dx, dy) > (p.pointerType === 'mouse' ? 3 : 10)) this.down.moved = true;
      if (this.down.moved) {
        this.az += dx * 0.005;
        this.el += dy * 0.004;
        this.down.x = p.x;
        this.down.y = p.y;
        this.idleUntil = this.time + 4;
        return;
      }
    }
    this.hover = this.spotAt(p.x, p.y);
    this.game.stage.canvas.style.cursor = this.hover ? 'pointer' : '';
  }

  pointerUp() {
    const d = this.down;
    this.down = null;
    this.idleUntil = this.time + 2.5;
    if (!d || d.moved || this.game.mode === 'title') return;
    if (this.hover) this.game.enterDiorama(this.hover);
  }

  pointerCancel() { this.down = null; }
  pointerLeave() { this.hover = null; }

  wheel(_p: PixelPointer, deltaY: number) {
    this.goalDist = Math.max(170, Math.min(1300, this.goalDist * Math.pow(1.0015, deltaY)));
    this.idleUntil = this.time + 3;
  }

  zoomIn() { this.goalDist = Math.max(170, this.goalDist / 1.3); }
  zoomOut() { this.goalDist = Math.min(1300, this.goalDist * 1.3); }

  destroy() {
    this.labels.destroy();
    this.game.stage.canvas.style.cursor = '';
    void this.opts;
  }
}

function starfield() {
  const r = rng(42);
  const pts: number[] = [], cols: number[] = [];
  for (let i = 0; i < 3500; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    pts.push(Math.cos(a) * k * 4000, u * 4000, Math.sin(a) * k * 4000);
    const b = 0.45 + r() * 0.55;
    cols.push(b, b * 0.96, b * (0.9 + r() * 0.1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
}
