/**
 * The globe's Act IV–V layers: the supergrid (planned dashed, building, online with power running,
 * down blinking red), fusion plants glowing at the megaprojects, air-capture farms, rectennas
 * shining gold, the AIs' banners over the provinces they run, province tints (an AI's colour in
 * Act IV; garden green or forge grey in Act V), beam fields, and the waste-heat haze.
 */
import * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { lineNodes, OVER_CLOUDS, softLine, type LineLook } from './soft';
import type { GameState } from '../../sim/types';
import { planetMapView } from '../../sim/planetView';
import { earthView } from '../../sim/systemView';
import { siteDef } from '../../content/sites';
import { CODE_BY_REGION } from '../../content/mapcodes';
import { PALETTE } from '../../render/palette';
import { dir, R } from './earth';
import { dropLine, globePath, POWER_PULSE } from './layers2';
import { model } from './markers';
import { Kit, rng } from '../kit';

function fat(pts: THREE.Vector3[], color: string, width: number, o: Partial<LineLook> = {}) {
  return softLine(pts, { color, width, dashSize: 0.9, gapSize: 0.7, opacity: 0.95, ...o });
}

/** A soft pool of light on the ground (fusion plants, rectennas, beam fields): bright past white at its heart. */
let glowDisc: THREE.CircleGeometry | null = null;
function glowGeo() {
  if (!glowDisc) { glowDisc = new THREE.CircleGeometry(1, 24); glowDisc.userData.shared = true; }
  return glowDisc;
}
function glowMaterial(colour: string) {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(colour) }, k: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 tint; uniform float k; varying vec2 vP; void main(){ float r = dot(vP, vP); gl_FragColor = vec4(tint * (exp(-r * 4.5) * 1.1 + exp(-r * 40.0) * 2.2) * (1.0 - r) * k, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** A small upright thing on the globe at lon/lat (its local up = the surface normal). */
function placeAt(o: THREE.Object3D, lon: number, lat: number, lift = 0) {
  const n = dir(lon, lat);
  o.position.copy(n).multiplyScalar(R + lift);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
}

export class PlanetLayer {
  readonly group = new THREE.Group();
  private links = new Map<string, { lines: Line2[]; nodes: THREE.Points; key: string; pts: THREE.Vector3[] }>();
  private marks = new THREE.Group();
  private markKey = '';
  private glows: { mesh: THREE.Mesh; base: number }[] = [];
  private banners: THREE.Object3D[] = [];
  private time = 0;

  constructor(private earthMat: THREE.ShaderMaterial) {
    this.group.add(this.marks);
  }

  update(s: GameState | null, dt: number, scale: (p: THREE.Vector3, px: number) => number, facing: (n: THREE.Vector3) => number, near: boolean) {
    this.time += dt;
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
      if (o) { for (const x of o.lines) dropLine(this.group, x); dropLine(this.group, o.nodes); }
      const pts = o?.pts ?? globePath([[l.route.a[1], l.route.a[0]], [l.route.b[1], l.route.b[0]]], 1.004, 0.6).map((p, i, arr) => p.multiplyScalar(1 + Math.sin((Math.PI * i) / (arr.length - 1)) * 0.015));
      const lines: Line2[] = [];
      // power runs along a working link
      if (l.status === 'online') lines.push(fat(pts, PALETTE.cyn6, 2.8, { pulse: POWER_PULSE, glow: 0.4 }));
      else if (l.status === 'down') lines.push(fat(pts, PALETTE.red3, 2.4, { glow: 0.5 }));
      else if (l.status === 'planned') lines.push(fat(pts, PALETTE.ink8, 1.2, { dashed: true, opacity: 0.5, glow: 0 }));
      else {
        const n = Math.max(2, Math.round(l.progress * (pts.length - 1)) + 1);
        lines.push(fat(pts.slice(0, n), PALETTE.org2, 2.4));
        if (n < pts.length) lines.push(fat(pts.slice(n - 1), PALETTE.ink8, 1.2, { dashed: true, glow: 0 }));
      }
      // a converter station at each end (the far one unlit until the line reaches it; faint on a line only planned)
      const live = l.status === 'online' ? PALETTE.cyn6 : l.status === 'down' ? PALETTE.red3 : l.status === 'planned' ? PALETTE.ink7 : PALETTE.org2;
      const nodes = lineNodes([pts[0], pts[pts.length - 1]], [live, l.status === 'building' ? PALETTE.ink8 : live], l.status === 'planned' ? 6 : 9);
      for (const x of lines) this.group.add(x);
      this.group.add(nodes);
      this.links.set(l.route.id, { lines, nodes, key, pts });
    }
    for (const [id, o] of this.links) if (!seen.has(id)) { for (const x of o.lines) dropLine(this.group, x); dropLine(this.group, o.nodes); this.links.delete(id); }
    const blink = Math.sin(this.time * 6) > 0;
    for (const o of this.links.values()) if (o.key.startsWith('down')) (o.lines[0].material as LineMaterial).opacity = blink ? 1 : 0.35;
    // marks on the ground: fusion plants, air capture, rectennas, beam fields, the AIs' banners
    const mk = JSON.stringify([pv.fusion.map((f) => f.siteId + f.status), pv.dac.map((d) => d.siteId + d.status), pv.rectennas.map((r) => r.region + r.status), pv.provinces.map((p) => p.ai), ev.provinces.map((p) => Math.round(p.beamTW / 20))]);
    if (mk !== this.markKey) {
      this.markKey = mk;
      for (const c of [...this.marks.children]) { this.marks.remove(c); (c as THREE.Mesh).geometry.dispose(); if (!c.userData.scaled) ((c as THREE.Mesh).material as THREE.Material).dispose(); }
      this.glows = [];
      this.banners = [];
      const glow = (lon: number, lat: number, colour: string, size: number, base = 1) => {
        const m = new THREE.Mesh(glowGeo(), glowMaterial(colour));
        const n = dir(lon, lat);
        m.position.copy(n).multiplyScalar(R * 1.0015);
        m.scale.setScalar(size * 1.5);
        m.renderOrder = OVER_CLOUDS;
        m.lookAt(n.clone().multiplyScalar(R * 2));
        this.marks.add(m);
        this.glows.push({ mesh: m, base });
      };
      for (const f of pv.fusion) {
        const site = siteDef(f.siteId);
        const k = new Kit(rng(f.siteId.length));
        k.geo(new THREE.TorusGeometry(0.32, 0.12, 8, 18).rotateX(Math.PI / 2).translate(0, 0.14, 0), f.status === 'online' ? '#d08fdc' : '#fbd46e', 0.03);
        const m = model(k);
        placeAt(m, site.lon + 0.8, site.lat - 0.5, 0.02);
        m.userData.scaled = true;
        this.marks.add(m);
        if (f.status === 'online') glow(site.lon + 0.8, site.lat - 0.5, '#e8b0ff', 0.6, 0.9);
      }
      for (const d of pv.dac) {
        const site = siteDef(d.siteId);
        const k = new Kit(rng(d.siteId.length + 3));
        for (let i = 0; i < 4; i++) k.box(0.12, 0.22, 0.5, '#9d95a6', -0.3 + i * 0.2, 0, 0, { r: 0.02 });
        const m = model(k);
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
        const m = model(k);
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
      g.mesh.visible = facing(n) > 0.02;
      (g.mesh.material as THREE.ShaderMaterial).uniforms.k.value = g.base * (0.25 + 0.75 * night) * (0.75 + Math.sin(this.time * 2 + g.mesh.position.x) * 0.2);
    }
    for (const b of this.banners) b.rotation.y = Math.sin(this.time * 1.5) * 0.15;
  }
}
