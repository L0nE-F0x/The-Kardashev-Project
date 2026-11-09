/**
 * The globe's Act IV–V layers: the supergrid (planned dashed, building, online with power running,
 * down blinking red), fusion plants glowing at the megaprojects, air-capture farms, rectennas
 * shining gold, the AIs' banners over the provinces they run, province tints (an AI's colour in
 * Act IV; garden green or forge grey in Act V), beam fields, and the waste-heat haze.
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { GameState } from '../../sim/types';
import { planetMapView } from '../../sim/planetView';
import { earthView } from '../../sim/systemView';
import { siteDef } from '../../content/sites';
import { CODE_BY_REGION } from '../../content/mapcodes';
import { PALETTE } from '../../render/palette';
import { dir, R } from './earth';
import { along, globePath } from './layers2';
import { Kit, rng } from '../kit';

const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });

function fat(pts: THREE.Vector3[], color: string, width: number, dashed = false, opacity = 0.95) {
  const g = new LineGeometry();
  g.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
  const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, dashed, dashSize: 0.9, gapSize: 0.7, transparent: true, opacity });
  const l = new Line2(g, m);
  if (dashed) l.computeLineDistances();
  return l;
}
const lengths = (pts: THREE.Vector3[]) => { const a = [0]; for (let i = 1; i < pts.length; i++) a.push(a[i - 1] + pts[i].distanceTo(pts[i - 1])); return a; };

/** A small upright thing on the globe at lon/lat (its local up = the surface normal). */
function placeAt(o: THREE.Object3D, lon: number, lat: number, lift = 0) {
  const n = dir(lon, lat);
  o.position.copy(n).multiplyScalar(R + lift);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
}

export class PlanetLayer {
  readonly group = new THREE.Group();
  private links = new Map<string, { lines: Line2[]; key: string; pts: THREE.Vector3[]; acc: number[] }>();
  private pulses: { mesh: THREE.Mesh; path: { pts: THREE.Vector3[]; acc: number[] }; t: number }[] = [];
  private pulseKey = '';
  private marks = new THREE.Group();
  private markKey = '';
  private glows: { mesh: THREE.Mesh; base: number }[] = [];
  private banners: THREE.Object3D[] = [];
  private mats: LineMaterial[] = [];
  private res = new THREE.Vector2(1280, 720);
  private time = 0;

  constructor(private earthMat: THREE.ShaderMaterial) {
    this.group.add(this.marks);
  }

  setResolution(w: number, h: number) { this.res.set(w, h); }

  update(s: GameState | null, dt: number, scale: (p: THREE.Vector3, px: number) => number, facing: (n: THREE.Vector3) => number, near: boolean) {
    this.time += dt;
    for (const m of this.mats) m.resolution.copy(this.res);
    const pv = planetMapView(s);
    const ev = earthView(s);
    const tints = this.earthMat.uniforms.regionTint.value as THREE.Vector4[];
    for (const t of tints) t.set(0, 0, 0, 0);
    this.earthMat.uniforms.haze.value.w = 0;
    this.group.visible = pv.active || ev.active;
    if (!this.group.visible) return;
    // province tints: an AI's colour where one runs it (Act IV); garden ↔ forge (Act V)
    for (const p of pv.provinces) {
      const code = CODE_BY_REGION[p.region];
      if (p.aiColor) {
        const c = new THREE.Color(PALETTE[p.aiColor]);
        tints[code].set(c.r, c.g, c.b, 0.14);
      }
    }
    for (const p of ev.provinces) {
      const code = CODE_BY_REGION[p.region];
      const g = p.garden / 100;
      const c = new THREE.Color(g >= 0 ? '#3f7b35' : '#8a7a6e');
      tints[code].set(c.r, c.g, c.b, Math.min(0.42, Math.abs(g) * 0.42));
    }
    if (ev.active && ev.lineWm2 > 0) this.earthMat.uniforms.haze.value.w = Math.min(1, Math.max(0, ev.heatWm2 / ev.lineWm2 - 0.4));
    else if (pv.showHeat) this.earthMat.uniforms.haze.value.w = Math.min(0.6, Math.max(...pv.provinces.map((p) => p.wasteHeat), 0) / 2);
    // the supergrid
    const seen = new Set<string>();
    for (const l of pv.links) {
      seen.add(l.route.id);
      const key = `${l.status}|${Math.round(l.progress * 20)}`;
      const o = this.links.get(l.route.id);
      if (o && o.key === key) continue;
      if (o) for (const x of o.lines) this.group.remove(x);
      const pts = o?.pts ?? globePath([[l.route.a[1], l.route.a[0]], [l.route.b[1], l.route.b[0]]], 1.004, 0.6).map((p, i, arr) => p.multiplyScalar(1 + Math.sin((Math.PI * i) / (arr.length - 1)) * 0.015));
      const lines: Line2[] = [];
      if (l.status === 'online') lines.push(fat(pts, PALETTE.cyn6, 3));
      else if (l.status === 'down') lines.push(fat(pts, PALETTE.red3, 2.6));
      else if (l.status === 'planned') lines.push(fat(pts, PALETTE.ink8, 1.2, true, 0.5));
      else {
        const n = Math.max(2, Math.round(l.progress * (pts.length - 1)) + 1);
        lines.push(fat(pts.slice(0, n), PALETTE.org2, 2.6));
        if (n < pts.length) lines.push(fat(pts.slice(n - 1), PALETTE.ink8, 1.2, true));
      }
      for (const x of lines) { this.group.add(x); this.mats.push(x.material as LineMaterial); x.material.resolution.copy(this.res); }
      this.links.set(l.route.id, { lines, key, pts, acc: lengths(pts) });
    }
    for (const [id, o] of this.links) if (!seen.has(id)) { for (const x of o.lines) this.group.remove(x); this.links.delete(id); }
    const blink = Math.sin(this.time * 6) > 0;
    for (const o of this.links.values()) if (o.key.startsWith('down')) (o.lines[0].material as LineMaterial).opacity = blink ? 1 : 0.35;
    const online = [...this.links.values()].filter((o) => o.key.startsWith('online'));
    const pk = online.map((o) => o.key).join(',') + online.length;
    if (pk !== this.pulseKey) {
      this.pulseKey = pk;
      for (const p of this.pulses) this.group.remove(p.mesh);
      this.pulses = [];
      for (const path of online) for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#e6fff6', toneMapped: false }));
        this.group.add(mesh);
        this.pulses.push({ mesh, path, t: i / 3 });
      }
    }
    for (const p of this.pulses) {
      p.t = (p.t + dt * 0.1) % 1;
      const { p: pos } = along(p.path.pts, p.path.acc, p.t);
      p.mesh.position.copy(pos);
      p.mesh.visible = facing(pos.clone().normalize()) > 0.05;
      p.mesh.scale.setScalar(scale(pos, 5) * 1.2);
    }
    // marks on the ground: fusion plants, air capture, rectennas, beam fields, the AIs' banners
    const mk = JSON.stringify([pv.fusion.map((f) => f.siteId + f.status), pv.dac.map((d) => d.siteId + d.status), pv.rectennas.map((r) => r.region + r.status), pv.provinces.map((p) => p.ai), ev.provinces.map((p) => Math.round(p.beamTW / 20))]);
    if (mk !== this.markKey) {
      this.markKey = mk;
      for (const c of [...this.marks.children]) this.marks.remove(c);
      this.glows = [];
      this.banners = [];
      const glow = (lon: number, lat: number, colour: string, size: number, base = 1) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(size * 0.6, 20), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        const n = dir(lon, lat);
        m.position.copy(n).multiplyScalar(R * 1.0015);
        m.lookAt(n.clone().multiplyScalar(R * 2));
        this.marks.add(m);
        this.glows.push({ mesh: m, base });
      };
      for (const f of pv.fusion) {
        const site = siteDef(f.siteId);
        const k = new Kit(rng(f.siteId.length));
        k.geo(new THREE.TorusGeometry(0.32, 0.12, 8, 18).rotateX(Math.PI / 2).translate(0, 0.14, 0), f.status === 'online' ? '#d08fdc' : '#fbd46e', 0.03);
        const m = k.build(mat);
        placeAt(m, site.lon + 0.8, site.lat - 0.5, 0.02);
        m.userData.scaled = true;
        this.marks.add(m);
        if (f.status === 'online') glow(site.lon + 0.8, site.lat - 0.5, '#e8b0ff', 0.6, 0.9);
      }
      for (const d of pv.dac) {
        const site = siteDef(d.siteId);
        const k = new Kit(rng(d.siteId.length + 3));
        for (let i = 0; i < 4; i++) k.box(0.12, 0.22, 0.5, '#9d95a6', -0.3 + i * 0.2, 0, 0, { r: 0.02 });
        const m = k.build(mat);
        placeAt(m, site.lon - 0.9, site.lat + 0.6, 0.02);
        m.userData.scaled = true;
        this.marks.add(m);
      }
      for (const r of pv.rectennas) glow(r.lon, r.lat, '#fde9a4', r.status === 'online' ? 0.9 : 0.5, r.status === 'online' ? 1 : 0.4);
      for (const p of ev.provinces) if (p.beamTW > 0) glow(p.lon + 2, p.lat - 2, '#fbd46e', Math.min(2.4, 0.6 + p.beamTW / 60), 0.8);
      for (const p of pv.provinces) {
        if (!p.ai || !p.aiColor) continue;
        const k = new Kit(rng(p.region.length));
        k.box(0.05, 1.4, 0.05, '#e6e0e3', 0, 0, 0, { r: 0, jitter: 0 });
        k.box(0.7, 0.42, 0.03, PALETTE[p.aiColor], 0.36, 0.95, 0, { r: 0, jitter: 0.04 });
        const m = k.build(mat);
        placeAt(m, p.lon, p.lat, 0.02);
        m.userData.scaled = true;
        this.marks.add(m);
        this.banners.push(m);
      }
    }
    for (const c of this.marks.children) {
      if (!c.userData.scaled) continue;
      const n = c.position.clone().normalize();
      c.visible = facing(n) > 0.05 && near;
      c.scale.setScalar(scale(c.position, 12));
    }
    // they shine on the night side (a faint gold by day)
    const sun = this.earthMat.uniforms.sunDir.value as THREE.Vector3;
    for (const g of this.glows) {
      const n = g.mesh.position.clone().normalize();
      const night = 1 - THREE.MathUtils.smoothstep(n.dot(sun), -0.12, 0.1);
      g.mesh.visible = facing(n) > 0.02 && night > 0.05;
      (g.mesh.material as THREE.MeshBasicMaterial).opacity = g.base * night * (0.6 + Math.sin(this.time * 2 + g.mesh.position.x) * 0.15);
    }
    for (const b of this.banners) b.rotation.y = Math.sin(this.time * 1.5) * 0.15;
  }
}
