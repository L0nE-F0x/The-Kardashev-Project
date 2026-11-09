/**
 * The globe's Act III layers: megaproject patches that spread across the land stage by stage
 * (solar rows, little turbines turning, reactor domes, a reservoir), the intercontinental HVDC
 * links with power running along them, the orbital test satellite on its track, the space-solar
 * demonstrator's beam, and the launch site's rocket climbing away after the first liftoff.
 */
import * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { softLine } from './soft';
import type { GameState } from '../../sim/types';
import { siteDef } from '../../content/sites';
import { charterView, liftoffActive, mainKind, orbitAngle, orbitPoint } from '../../render/worldMap/act3Layers';
import type { MegaView } from '../../sim/charterView';
import { dir, R } from './earth';
import { along, globePath } from './layers2';
import { Kit, rng } from '../kit';
import { PALETTE } from '../../render/palette';

const RAD = Math.PI / 180;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });

/** A local frame on the globe at a point: x east, y up (out of the ground), z south. */
function frameAt(lon: number, lat: number, lift = 0) {
  const n = dir(lon, lat);
  const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const north = n.clone().cross(east);
  const m = new THREE.Matrix4().makeBasis(east, n, north.negate());
  m.setPosition(n.clone().multiplyScalar(R + lift));
  return m;
}

function lengths(pts: THREE.Vector3[]) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return acc;
}

/** The patch at a megaproject: its main kind's kit, spread over a disc that grows with the stage. */
function megaPatch(v: MegaView, seed: number): { obj: THREE.Group; rotors: THREE.Object3D[] } {
  const site = siteDef(v.siteId);
  const kind = mainKind(v);
  const stage = Math.max(1, v.stage);
  const radius = [0, 1.1, 1.9, 2.9][stage] * RAD * R;
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const rotors: THREE.Object3D[] = [];
  const r = rng(seed + 1);
  const inside = () => {
    for (;;) {
      const x = (r() - 0.5) * 2, z = (r() - 0.5) * 2;
      if (x * x + z * z < 1) return [x * radius, z * radius] as const;
    }
  };
  const offshore = site.id === 'mega-northsea';
  if (kind === 'solar') {
    // rows of dark panels in blocks, with sandy tracks between them
    const rows = Math.round(radius * 9);
    for (let i = 0; i < rows; i++) {
      const z = -radius + (i + 0.5) * ((radius * 2) / rows);
      const half = Math.sqrt(Math.max(0, radius * radius - z * z)) * (0.85 + r() * 0.1);
      for (let x = -half; x < half; x += 0.9) k.box(Math.min(0.8, half - x), 0.01, 0.08, '#2c3f6e', x + 0.4, 0, z, { r: 0, jitter: 0.06, shade: 0 });
    }
  } else if (kind === 'wind' || offshore) {
    const n = Math.round(radius * radius * 3.2) + 4;
    for (let i = 0; i < n; i++) {
      const [x, z] = inside();
      k.cyl(0.012, 0.02, 0.36, '#f1ece4', x, 0, z, 5);
      const rotor = new THREE.Group();
      const rk = new Kit(rng(i));
      for (let b = 0; b < 3; b++) rk.geo(new THREE.BoxGeometry(0.012, 0.16, 0.004).translate(0, 0.08, 0).rotateZ((b * Math.PI * 2) / 3), '#f6f2ea', 0);
      rotor.add(rk.build(mat));
      rotor.position.set(x, 0.37, z + 0.015);
      rotor.userData.spin = 2 + r() * 1.5;
      rotors.push(rotor);
      g.add(rotor);
    }
  } else if (kind === 'nuclear') {
    const n = stage * 2 + 1;
    for (let i = 0; i < n; i++) {
      const [x, z] = inside();
      k.geo(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0, z), '#e9e1d2', 0.03);
      k.cyl(0.07, 0.1, 0.28, '#d8cfc3', x + 0.22, 0, z - 0.05, 10);
    }
  } else if (kind === 'hydro') {
    k.geo(new THREE.CircleGeometry(radius * 0.7, 24).rotateX(-Math.PI / 2).translate(0, 0.004, 0), '#3b7fae', 0.02);
    k.box(radius * 0.5, 0.06, 0.05, '#bfae9f', 0, 0, radius * 0.7, { r: 0, jitter: 0 });
  } else {
    // geothermal and the rest: pads of plant with steam
    const n = stage * 3;
    for (let i = 0; i < n; i++) {
      const [x, z] = inside();
      k.box(0.12, 0.06, 0.09, '#c9c1b6', x, 0, z, { r: 0.01 });
      k.geo(new THREE.SphereGeometry(0.06, 6, 4).translate(x, 0.12, z), '#f4f1ec', 0);
    }
  }
  // the cleared ground under it all
  if (!offshore) k.geo(new THREE.CircleGeometry(radius * 1.05, 28).rotateX(-Math.PI / 2).translate(0, -0.004, 0), kind === 'solar' ? '#c9a879' : '#a8a070', 0.02);
  const m = k.build(mat);
  m.castShadow = false;
  m.receiveShadow = false;
  g.add(m);
  // cranes while something's being built here
  for (let i = 0; i < Math.min(3, v.building.length); i++) {
    const [x, z] = inside();
    const ck = new Kit(rng(i + 30));
    ck.box(0.02, 0.4, 0.02, '#fbd46e', x, 0, z, { r: 0, jitter: 0 });
    ck.box(0.3, 0.02, 0.02, '#fbd46e', x + 0.1, 0.4, z, { r: 0, jitter: 0 });
    g.add(ck.build(mat));
  }
  return { obj: g, rotors };
}

function fat(pts: THREE.Vector3[], color: string, width: number, dashed = false) {
  return softLine(pts, { color, width, dashed, dashSize: 0.8, gapSize: 0.6, opacity: 0.95 });
}

export class CharterLayer {
  readonly group = new THREE.Group();
  private patches = new Map<string, { obj: THREE.Group; rotors: THREE.Object3D[]; key: string }>();
  private hvdc = new Map<string, { lines: Line2[]; key: string; pts: THREE.Vector3[]; acc: number[] }>();
  private pulses: { mesh: THREE.Mesh; path: { pts: THREE.Vector3[]; acc: number[] }; t: number }[] = [];
  private pulseKey = '';
  private sat: THREE.Group | null = null;
  private track: Line2 | null = null;
  private beam: THREE.Group | null = null;
  private rocket: THREE.Group | null = null;
  private trail: THREE.Mesh[] = [];
  private mats: LineMaterial[] = [];
  private time = 0;

  private res = new THREE.Vector2(1280, 720);
  setResolution(w: number, h: number) {
    this.res.set(w, h);
  }
  private applyRes() {
    for (const m of this.mats) m.resolution.copy(this.res);
  }

  update(s: GameState | null, day: number, dt: number, scale: (p: THREE.Vector3, px: number) => number, facing: (n: THREE.Vector3) => number, near: boolean) {
    this.time += dt;
    this.applyRes();
    const on = !!s?.charter;
    this.group.visible = on;
    if (!on || !s) return;
    const v = charterView(s);
    // megaproject patches
    const seen = new Set<string>();
    for (const mv of v.megas) {
      if (mv.stage < 1 && !mv.online.length) continue;
      seen.add(mv.siteId);
      const key = `${mv.stage}|${mainKind(mv)}|${Math.min(3, mv.building.length)}`;
      let p = this.patches.get(mv.siteId);
      if (p && p.key !== key) { this.group.remove(p.obj); p = undefined; }
      if (!p) {
        const site = siteDef(mv.siteId);
        const made = megaPatch(mv, mv.siteId.length * 17);
        made.obj.matrixAutoUpdate = false;
        made.obj.matrix.copy(frameAt(site.lon, site.lat, 0.02));
        this.group.add(made.obj);
        p = { ...made, key };
        this.patches.set(mv.siteId, p);
      }
      for (const rt of p.rotors) rt.rotation.z -= dt * rt.userData.spin;
      p.obj.visible = near || mainKind(mv) === 'solar' || mainKind(mv) === 'hydro';
    }
    for (const [id, p] of this.patches) if (!seen.has(id)) { this.group.remove(p.obj); this.patches.delete(id); }
    // HVDC links
    const hseen = new Set<string>();
    for (const h of v.hvdc) {
      hseen.add(h.route.id);
      const key = `${h.status}|${Math.round(h.progress * 20)}`;
      const o = this.hvdc.get(h.route.id);
      if (o && o.key === key) continue;
      if (o) for (const l of o.lines) this.group.remove(l);
      const pts = o?.pts ?? globePath([[h.route.a[1], h.route.a[0]], [h.route.b[1], h.route.b[0]]], 1.004, 0.6).map((p, i, arr) => p.multiplyScalar(1 + Math.sin((Math.PI * i) / (arr.length - 1)) * 0.012));
      const lines: Line2[] = [];
      if (h.status === 'online') lines.push(fat(pts, PALETTE.yel0, 3));
      else {
        const n = Math.max(2, Math.round(h.progress * (pts.length - 1)) + 1);
        lines.push(fat(pts.slice(0, n), PALETTE.org2, 2.6));
        if (n < pts.length) lines.push(fat(pts.slice(n - 1), PALETTE.ink8, 1.4, true));
      }
      for (const l of lines) { this.group.add(l); this.mats.push(l.material as LineMaterial); }
      this.hvdc.set(h.route.id, { lines, key, pts, acc: lengths(pts) });
    }
    for (const [id, o] of this.hvdc) if (!hseen.has(id)) { for (const l of o.lines) this.group.remove(l); this.hvdc.delete(id); }
    const online = [...this.hvdc.values()].filter((o) => o.key.startsWith('online'));
    const pk = online.map((o) => o.key).join(',') + online.length;
    if (pk !== this.pulseKey) {
      this.pulseKey = pk;
      for (const p of this.pulses) this.group.remove(p.mesh);
      this.pulses = [];
      for (const path of online) for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false }));
        this.group.add(mesh);
        this.pulses.push({ mesh, path, t: i / 4 });
      }
    }
    for (const p of this.pulses) {
      p.t = (p.t + dt * 0.12) % 1;
      const { p: pos } = along(p.path.pts, p.path.acc, p.t);
      p.mesh.position.copy(pos);
      p.mesh.visible = facing(pos.clone().normalize()) > 0.05;
      p.mesh.scale.setScalar(scale(pos, 5) * 1.3);
    }
    // the orbital compute test: a satellite on an inclined orbit, its ground track dotted below
    if (v.orbitalTest && !this.sat) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 240; i++) { const p = orbitPoint((i / 240) * Math.PI * 2); pts.push(dir(p.lon, p.lat).multiplyScalar(R * 1.004)); }
      this.track = fat(pts, PALETTE.ice1, 1, true);
      (this.track.material as LineMaterial).opacity = 0.5;
      this.mats.push(this.track.material as LineMaterial);
      this.group.add(this.track);
      const k = new Kit(rng(5));
      k.box(0.5, 0.35, 0.35, '#e6e0e3', 0, 0, 0, { r: 0.05 });
      k.box(1.6, 0.03, 0.55, '#345c96', 0, 0.16, 0, { r: 0, jitter: 0 });
      this.sat = new THREE.Group();
      this.sat.add(k.build(mat));
      this.group.add(this.sat);
    }
    if (this.sat) {
      const p = orbitPoint(orbitAngle(performance.now() / 1000));
      const n = dir(p.lon, p.lat);
      this.sat.position.copy(n).multiplyScalar(R * 1.07);
      this.sat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      this.sat.scale.setScalar(scale(this.sat.position, 8));
      this.sat.visible = facing(n) > -0.1;
    }
    // space solar: a collector in high orbit beaming down to a receiver in the Sahara
    if (v.spaceSolar && !this.beam) {
      const site = siteDef('mega-sahara');
      const n = dir(site.lon + 3, site.lat + 2);
      this.beam = new THREE.Group();
      const craft = new Kit(rng(6));
      craft.box(4, 0.05, 4, '#345c96', 0, 0, 0, { r: 0, jitter: 0.05 });
      craft.box(0.6, 0.5, 0.6, '#e6e0e3', 0, -0.4, 0, { r: 0.08 });
      const cm = craft.build(mat);
      cm.position.copy(n).multiplyScalar(R * 1.16);
      cm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const len = R * 0.16;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.2, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.copy(n).multiplyScalar(R + len / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      this.beam.add(cm, cone);
      this.group.add(this.beam);
    }
    // the first liftoff replays from the launch site for a while: a rocket climbing out on its trail
    const lsite = v.launch ? siteDef(v.launch.siteId) : null;
    if (lsite && liftoffActive(v, day)) {
      if (!this.rocket) {
        const k = new Kit(rng(8));
        k.cyl(0.12, 0.12, 1.4, '#efe8de', 0, 0, 0, 10);
        k.geo(new THREE.ConeGeometry(0.12, 0.35, 10).translate(0, 1.57, 0), '#df5f3e', 0);
        this.rocket = new THREE.Group();
        this.rocket.add(k.build(mat));
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8).rotateX(Math.PI).translate(0, -0.25, 0), new THREE.MeshBasicMaterial({ color: '#fde9a4', toneMapped: false }));
        this.rocket.add(flame);
        this.group.add(this.rocket);
        for (let i = 0; i < 14; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshStandardMaterial({ color: '#f4f1ec', transparent: true, opacity: 0.8, roughness: 1 }));
          this.trail.push(puff);
          this.group.add(puff);
        }
      }
      const t = this.time % 6;
      const n = dir(lsite.lon, lsite.lat);
      const fly = Math.max(0, t - 0.8);
      const rise = fly * fly * 0.9;
      const base = n.clone().multiplyScalar(R + 0.05);
      const sc = scale(base, 3);
      this.rocket.position.copy(base).addScaledVector(n, rise * sc * 6);
      this.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      this.rocket.scale.setScalar(sc * 2.2);
      this.rocket.visible = facing(n) > 0 && rise < 14;
      this.trail.forEach((p, i) => {
        const f = i / this.trail.length;
        p.position.copy(base).addScaledVector(n, rise * sc * 6 * f);
        p.scale.setScalar(sc * (1.2 + (1 - f) * 2.5 + (t < 0.8 ? 1 : 0)));
        (p.material as THREE.MeshStandardMaterial).opacity = (0.75 - f * 0.4) * Math.max(0, 1 - Math.max(0, t - 4) / 2);
        p.visible = this.rocket!.visible && (t > 0.2) && f * rise < rise;
      });
    } else if (this.rocket) {
      this.group.remove(this.rocket, ...this.trail);
      this.rocket = null;
      this.trail = [];
    }
  }
}
