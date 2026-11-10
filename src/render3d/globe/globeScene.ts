/**
 * The world map of the 3D edition: a globe. Same contract as the pixel MapScene (hover, select,
 * double-click into a campus, the link tool, the tutorial's `site:` targets, the menu tour's
 * cinematic glides, keyboard pan/zoom).
 */
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { PixelPointer } from '../../render/stage';
import type { Scene3D } from '../stage3d';
import { defaultLook, type Look } from '../post';
import { SITES, siteDef, type SiteDef } from '../../content/sites';
import { CODE_BY_REGION, REGION_BY_CODE } from '../../content/mapcodes';
import { CHOKEPOINTS } from '../../world/routing';
import { closedChokepoints } from '../../sim/effects';
import { sampleRegionCode, project } from '../../world/mapData';
import { subsolar } from '../../world/sun';
import { siteVisible } from '../../render/worldMap/act2Layers';
import { REGIONS } from '../../content/regions';
import type { GameState, Shipment } from '../../sim/types';
import { atmosphereMaterial, cloudMaterial, dir, earthMaterial, earthTextures, lonLatOf, R } from './earth';
import { disposeObject, Kit, rng } from '../kit';
import { Labels } from './labels';
import { globePath, NetworkLayer } from './layers2';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { softLine, softLineMaterial } from './soft';
import { Aurora, milkyWay, starField, Sun } from './space';
import { quality } from '../quality';
import { CharterLayer } from './layers3';
import { PlanetLayer } from './layers45';
import { rivalsAt, landingActive, mineOwned } from '../../render/worldMap/act2Layers';

const RAD = Math.PI / 180;
const MIN_DIST = 9, MAX_DIST = 330;

type MarkerKind = 'home' | 'owned' | 'build' | 'supplier' | 'cloud' | 'landing' | 'mine' | 'charter' | 'mega' | 'launch' | 'other';

interface Marker {
  site: SiteDef;
  group: THREE.Group;
  sig: string;
  kind: MarkerKind;
  /** Height of the top above the surface, in marker units. */
  top: number;
}

const markerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });

export class GlobeScene implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.5, 6000);
  // no FXAA: the globe anti-aliases its own edges (coasts, lines, stars), and FXAA only made thin lines flicker
  readonly look: Look = { ...defaultLook(), bloom: 0.32, bloomThreshold: 1.0, vignette: 0.34, fxaa: false };
  private earth: THREE.Mesh;
  private earthMat: THREE.ShaderMaterial;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.ShaderMaterial;
  private atmo: THREE.ShaderMaterial;
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  private markers = new Map<string, Marker>();
  private markerRoot = new THREE.Group();
  private shipRoot = new THREE.Group();
  private routeRoot = new THREE.Group();
  private linkRoot = new THREE.Group();
  private chokeRoot = new THREE.Group();
  private ships = new Map<string, { obj: THREE.Object3D; line: Line2; key: string }>();
  private stars = starField(quality.level === 'low' ? 5000 : 14000);
  private sunDisc = new Sun(quality.level !== 'low');
  private aurora: Aurora | null = null;
  private linkKey = '';
  private selRing: THREE.Mesh;
  private labels: Labels;
  private network: NetworkLayer;
  private charter = new CharterLayer();
  private planet: PlanetLayer;
  private w = 1;
  private h = 1;
  private time = 0;
  // camera: the point looked at (lon, lat) and the distance above it
  private lon = -100;
  private lat = 30;
  private dist = 260;
  private goal: { lon: number; lat: number; dist: number } | null = null;
  private vel = { lon: 0, lat: 0 };
  private cine: { from: [number, number]; to: [number, number]; t: number; secs: number; dist: number } | null = null;
  private down: { x: number; y: number; moved: boolean; t: number } | null = null;
  private last: { x: number; y: number; t: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private lastClick = { t: 0, site: '' };
  private cursor: { x: number; y: number } | null = null;

  constructor(private readonly game: Game) {
    const lod = game.world.lods[game.world.lods.length - 1];
    const tex = earthTextures(lod);
    this.earthMat = earthMaterial(tex, lod.W, lod.H);
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), this.earthMat);
    this.cloudMat = cloudMaterial(tex);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.009, 160, 80), this.cloudMat);
    this.clouds.renderOrder = 2;
    this.atmo = atmosphereMaterial(1.1);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 48), this.atmo);
    atmo.renderOrder = 3;
    this.scene.add(this.earth, this.clouds, atmo);
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight(0xb8c8ff, 0x302a3a, 0.7), new THREE.AmbientLight(0x404060, 0.4));
    this.scene.add(this.stars, this.sunDisc.group);
    if (quality.level !== 'low') {
      this.aurora = new Aurora(tex.detail);
      this.scene.add(milkyWay(tex.detail), this.aurora.mesh);
    }
    this.scene.add(this.markerRoot, this.shipRoot, this.routeRoot, this.linkRoot, this.chokeRoot);
    this.scene.background = new THREE.Color(0x030408);
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 6, 40), new THREE.MeshBasicMaterial({ color: 0xfde9a4 }));
    this.selRing.rotation.x = Math.PI / 2;
    this.selRing.visible = false;
    this.buildChokepoints();
    this.labels = new Labels();
    this.network = new NetworkLayer(game.world.router);
    this.planet = new PlanetLayer(this.earthMat);
    this.scene.add(this.network.group, this.charter.group, this.planet.group);
    // start over home (or the middle of the Atlantic in the menu)
    const s = game.state;
    if (s) {
      const home = siteDef(s.company.homeSite);
      this.lon = home.lon;
      this.lat = Math.max(-40, Math.min(60, home.lat - 6));
    }
  }

  // ── camera ────────────────────────────────────────────────────────────────────────────────
  private placeCamera() {
    const T = dir(this.lon, this.lat).multiplyScalar(R);
    const n = T.clone().normalize();
    const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const north = n.clone().cross(east);
    // close in, the camera tilts towards the horizon like a model on a table
    const tilt = (1 - THREE.MathUtils.smoothstep(this.dist, 18, 150)) * 0.95;
    const back = n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(north, -Math.sin(tilt));
    this.camera.position.copy(T).addScaledVector(back, this.dist);
    this.camera.up.copy(north.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(n, Math.sin(tilt)));
    this.camera.lookAt(T);
    this.camera.near = Math.max(0.2, this.dist * 0.05);
    this.camera.far = this.dist + R * 3 + 3000;
    this.camera.updateProjectionMatrix();
  }

  private degPerPx() {
    const worldPerPx = (2 * this.dist * Math.tan((this.camera.fov * RAD) / 2)) / this.h;
    return (worldPerPx / R) / RAD;
  }

  private clampView() {
    this.lat = Math.max(-62, Math.min(76, this.lat));
    this.lon = ((this.lon + 540) % 360) - 180;
    this.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.dist));
  }

  cinematic(from: [number, number], to: [number, number], secs: number, lod: number) {
    this.cine = { from, to, t: 0, secs, dist: lod >= 1 ? 120 : 215 };
    this.goal = null;
  }

  centreOn(lon: number, lat: number, animate = false) {
    if (animate) this.goal = { lon, lat: lat - 4, dist: Math.min(this.dist, 140) };
    else {
      this.lon = lon;
      this.lat = lat;
    }
  }

  focusSite(id: string) {
    const s = siteDef(id);
    this.centreOn(s.lon, s.lat, true);
  }

  zoomIn(anchor?: { x: number; y: number }) { this.zoomBy(1 / 1.35, anchor); }
  zoomOut(anchor?: { x: number; y: number }) { this.zoomBy(1.35, anchor); }

  private zoomBy(k: number, anchor?: { x: number; y: number }) {
    this.cine = null;
    const g = this.goal ?? { lon: this.lon, lat: this.lat, dist: this.dist };
    let { lon, lat } = g;
    if (anchor && k < 1) {
      const ll = this.pick(anchor.x, anchor.y);
      if (ll) {
        let dl = ll.lon - lon;
        dl = ((dl + 540) % 360) - 180;
        lon += dl * 0.3;
        lat += (ll.lat - lat) * 0.3;
      }
    }
    this.goal = { lon, lat, dist: Math.max(MIN_DIST, Math.min(MAX_DIST, g.dist * k)) };
  }

  pan(dx: number, dy: number) {
    this.cine = null;
    const k = this.degPerPx() * 4;
    this.goal = { lon: (this.goal?.lon ?? this.lon) + dx * k, lat: (this.goal?.lat ?? this.lat) - dy * k, dist: this.goal?.dist ?? this.dist };
  }

  busy() {
    return (this.cine !== null && this.cine.t < 1) || this.goal !== null || !!this.down?.moved || this.pointers.size >= 2 || Math.hypot(this.vel.lon, this.vel.lat) > 0.5;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.network?.setResolution(w, h);
    for (const e of this.ships?.values() ?? []) (e.line.material as LineMaterial).resolution.set(w, h);
    for (const l of this.linkRoot?.children ?? []) ((l as Line2).material as LineMaterial).resolution.set(w, h);
    this.charter?.setResolution(w, h);
    this.planet?.setResolution(w, h);
  }

  // ── frame ─────────────────────────────────────────────────────────────────────────────────
  update(dt: number) {
    this.time += dt;
    const g = this.game;
    const s = g.view;
    if (this.cine) {
      const c = this.cine;
      c.t = Math.min(1, c.t + dt / c.secs);
      const k = c.t * c.t * (3 - 2 * c.t);
      let dl = c.to[0] - c.from[0];
      dl = ((dl + 540) % 360) - 180;
      this.lon = c.from[0] + dl * k;
      this.lat = c.from[1] + (c.to[1] - c.from[1]) * k - 6;
      this.dist += (c.dist - this.dist) * Math.min(1, dt * 2);
    } else if (this.goal) {
      const e = Math.min(1, dt * 5);
      let dl = this.goal.lon - this.lon;
      dl = ((dl + 540) % 360) - 180;
      this.lon += dl * e;
      this.lat += (this.goal.lat - this.lat) * e;
      this.dist += (this.goal.dist - this.dist) * e;
      if (Math.abs(dl) < 0.01 && Math.abs(this.goal.lat - this.lat) < 0.01 && Math.abs(this.goal.dist - this.dist) < 0.05) this.goal = null;
    } else if (!this.down) {
      this.lon += this.vel.lon * dt;
      this.lat += this.vel.lat * dt;
      const f = Math.exp(-dt * 4);
      this.vel.lon *= f;
      this.vel.lat *= f;
    }
    this.clampView();
    this.placeCamera();

    // the sun where it really is right now (like the pixel map)
    const day = (s?.day ?? 0) + g.dayFraction();
    const ss = subsolar(new Date());
    const sunDir = dir(ss.lon, ss.lat);
    this.earthMat.uniforms.sunDir.value.copy(sunDir);
    this.cloudMat.uniforms.sunDir.value.copy(sunDir);
    this.atmo.uniforms.sunDir.value.copy(sunDir);
    this.sun.position.copy(sunDir).multiplyScalar(500);
    this.sunDisc.update(sunDir, this.camera);
    this.aurora?.update(sunDir, this.time, 0.45 + 0.55 * (1 - THREE.MathUtils.smoothstep(this.dist, 90, 260)));
    // the weather drifts east, a turn of the globe in half an hour
    const shift = (this.time / 1800) % 1;
    this.earthMat.uniforms.cloudShift.value = shift;
    this.cloudMat.uniforms.cloudShift.value = shift;
    this.earthMat.uniforms.time.value = this.time % 7200;
    // clouds (and their shadows) thin out as you come down to the ground, and in play the map reads through them
    const high = THREE.MathUtils.smoothstep(this.dist, 26, 115);
    this.cloudMat.uniforms.opacity.value = high * (g.mode === 'title' ? 0.95 : 0.8);
    this.earthMat.uniforms.cloudShadow.value = high;

    // region hover / selection
    const hov = g.hover?.kind === 'region' ? CODE_BY_REGION[g.hover.id] : -1;
    const sel = g.selection?.kind === 'region' ? CODE_BY_REGION[g.selection.id] : -1;
    this.earthMat.uniforms.hoverCode.value = hov ?? -1;
    this.earthMat.uniforms.selCode.value = sel ?? -1;

    this.updateMarkers(s);
    this.network.update(s, day, dt, (p, px) => this.screenScale(p, px), (n) => this.facing(n));
    this.charter.update(s, day, dt, (p, px) => this.screenScale(p, px), (n) => this.facing(n), this.dist < 120);
    this.planet.update(s, dt, (p, px) => this.screenScale(p, px), (n) => this.facing(n), this.dist < 200);
    this.earthMat.uniforms.tintOn.value = (this.earthMat.uniforms.regionTint.value as THREE.Vector4[]).some((t) => t.w > 0) ? 1 : 0;
    this.updateShips(s, day);
    this.updateLinks(s);
    this.updateChokepoints(s);
    this.updateLabels(s);
    this.updateToolPreview();
    // stars keep their size on screen whatever the 3D resolution
    (this.stars.material as THREE.ShaderMaterial).uniforms.pixelRatio.value = g.stage.scale || 1;
  }

  /** The power-line / fiber tool: a dashed line from the chosen site to the cursor. */
  private toolLine: Line2 | null = null;
  private updateToolPreview() {
    const tool = this.game.tool;
    const from = tool?.from ? siteDef(tool.from) : null;
    const to = this.cursor ? this.pick(this.cursor.x, this.cursor.y) : null;
    if (!from || !to) { if (this.toolLine) this.toolLine.visible = false; return; }
    const hov = this.game.hover?.kind === 'site' ? siteDef(this.game.hover.id) : null;
    const end = hov ?? { lon: to.lon, lat: to.lat };
    const pts = globePath([[from.lon, from.lat], [end.lon, end.lat]], 1.004, 0.5);
    const flat = pts.flatMap((p) => [p.x, p.y, p.z]);
    if (!this.toolLine) {
      const m = softLineMaterial({ color: tool!.kind === 'fiber' ? 0xfbd46e : 0xf7b258, width: 2.4, dashed: true, dashSize: 0.8, gapSize: 0.5, opacity: 0.95 });
      this.toolLine = new Line2(new LineGeometry(), m);
      this.scene.add(this.toolLine);
    }
    this.toolLine.geometry.dispose();
    this.toolLine.geometry = new LineGeometry();
    this.toolLine.geometry.setPositions(flat);
    this.toolLine.computeLineDistances();
    (this.toolLine.material as LineMaterial).resolution.set(this.w, this.h);
    this.toolLine.visible = true;
  }

  /** Marker scale for a world point: about the same size on screen at any zoom. */
  private screenScale(p: THREE.Vector3, px = 1) {
    const d = this.camera.position.distanceTo(p);
    return (d * 2 * Math.tan((this.camera.fov * RAD) / 2) / this.h) * px;
  }

  private facing(n: THREE.Vector3) {
    const toCam = this.camera.position.clone().sub(n.clone().multiplyScalar(R)).normalize();
    return n.dot(toCam);
  }

  // ── markers ───────────────────────────────────────────────────────────────────────────────
  private kindOf(site: SiteDef, s: GameState | null): MarkerKind {
    if (s && site.id === s.company.homeSite) return 'home';
    if (site.kind === 'build') return s?.facilities.some((f) => f.siteId === site.id) ? 'owned' : 'build';
    if (site.kind === 'supplier' || site.kind === 'cloud' || site.kind === 'landing' || site.kind === 'mine' || site.kind === 'charter' || site.kind === 'mega' || site.kind === 'launch') return site.kind;
    return 'other';
  }

  private updateMarkers(s: GameState | null) {
    const alive = new Set<string>();
    const hovered = this.game.hover?.kind === 'site' ? this.game.hover.id : null;
    const selected = this.game.selection?.kind === 'site' ? this.game.selection.id : null;
    for (const site of SITES) {
      if (site.kind === 'moon') continue;
      if (!siteVisible(site, s)) continue;
      alive.add(site.id);
      const kind = this.kindOf(site, s);
      const facs = s ? s.facilities.filter((f) => f.siteId === site.id) : [];
      const rivals = rivalsAt(s, site.id);
      const active = (site.kind === 'landing' && landingActive(s, site.id)) || (site.kind === 'mine' && mineOwned(s, site.id));
      const sig = `${kind}|${facs.map((f) => f.type + f.status[0]).join(',')}|${rivals.map((r) => r.owner + (r.building ? 'b' : '')).join(',')}|${active}`;
      let m = this.markers.get(site.id);
      if (!m || m.sig !== sig) {
        if (m) { this.markerRoot.remove(m.group); m.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
        m = makeMarker(site, kind, facs.map((f) => f.status === 'online'), sig, rivals, active);
        this.markerRoot.add(m.group);
        this.markers.set(site.id, m);
      }
      const n = dir(site.lon, site.lat);
      const p = n.clone().multiplyScalar(R);
      const vis = this.facing(n);
      m.group.visible = vis > 0.08;
      if (!m.group.visible) continue;
      const big = site.id === hovered || site.id === selected ? 1.3 : 1;
      const sc = this.screenScale(p, 9) * big;
      m.group.position.copy(n).multiplyScalar(R + 0.02);
      m.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      m.group.scale.setScalar(sc);
    }
    for (const [id, m] of this.markers) if (!alive.has(id)) { this.markerRoot.remove(m.group); this.markers.delete(id); }
    // the selection ring
    const selM = selected ? this.markers.get(selected) : null;
    this.selRing.visible = !!selM?.group.visible;
    if (selM && this.selRing.visible) {
      if (!this.selRing.parent) this.markerRoot.add(this.selRing);
      this.selRing.removeFromParent();
      selM.group.add(this.selRing);
      this.selRing.position.y = 0.12;
      this.selRing.scale.setScalar(1 + Math.sin(this.time * 4) * 0.06);
    }
  }

  // ── ships and their routes ────────────────────────────────────────────────────────────────
  private shipPos(sh: Shipment, t: number): { p: THREE.Vector3; fwd: THREE.Vector3; onLand: boolean } | null {
    let path: [number, number][];
    let f: number;
    if (t < sh.portDay || !sh.overland.length) {
      path = sh.route;
      f = (t - sh.departDay) / Math.max(1, sh.portDay - sh.departDay);
    } else {
      path = sh.overland;
      f = (t - sh.portDay) / Math.max(1, sh.arriveDay - sh.portDay);
    }
    f = Math.max(0, Math.min(1, f));
    if (!path.length) return null;
    const pts = path.map(([lon, lat]) => dir(lon, lat));
    if (pts.length < 2) return { p: pts[0], fwd: new THREE.Vector3(1, 0, 0), onLand: false };
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = pts[i].angleTo(pts[i - 1]); seg.push(d); total += d; }
    let want = total * f;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length - 1) {
        const k = seg[i] > 0 ? Math.min(1, want / seg[i]) : 0;
        const p = pts[i].clone().lerp(pts[i + 1], k).normalize();
        const fwd = pts[i + 1].clone().sub(pts[i]).normalize();
        return { p, fwd, onLand: t >= sh.portDay && sh.mode === 'sea' };
      }
      want -= seg[i];
    }
    return null;
  }

  private updateShips(s: GameState | null, t: number) {
    const ships = s?.shipments ?? [];
    const alive = new Set<string>();
    const hov = this.game.hover?.kind === 'shipment' ? this.game.hover.id : '';
    for (const sh of ships) {
      alive.add(sh.id);
      let e = this.ships.get(sh.id);
      const key = `${sh.portDay}|${sh.route.length}|${sh.overland.length}`;
      if (!e || e.key !== key) {
        if (e) { this.shipRoot.remove(e.obj); this.routeRoot.remove(e.line); e.line.geometry.dispose(); e.line.material.dispose(); }
        const obj = sh.mode === 'air' ? planeMesh() : shipMesh();
        const pts: THREE.Vector3[] = [];
        const path = [...sh.route, ...sh.overland.slice(1)];
        for (let i = 0; i < path.length; i++) {
          const a = dir(path[i][0], path[i][1]);
          if (i > 0) {
            // great-circle steps between the router's points
            const b0 = dir(path[i - 1][0], path[i - 1][1]);
            const steps = Math.ceil(b0.angleTo(a) / (1.5 * RAD));
            for (let k = 1; k < steps; k++) pts.push(b0.clone().lerp(a, k / steps).normalize().multiplyScalar(R * 1.003));
          }
          pts.push(a.multiplyScalar(R * 1.003));
        }
        const line = softLine(pts, { color: sh.mode === 'air' ? 0xd6e2f0 : 0xc9ece6, width: 1, dashed: true, dashSize: 0.9, gapSize: 0.7, opacity: 0.75 });
        (line.material as LineMaterial).resolution.set(this.w, this.h);
        this.shipRoot.add(obj);
        this.routeRoot.add(line);
        e = { obj, line, key };
        this.ships.set(sh.id, e);
      }
      (e.line.material as LineMaterial).color.set(sh.id === hov ? 0xfde9a4 : sh.mode === 'air' ? 0xd6e2f0 : 0xc9ece6);
      const pos = this.shipPos(sh, t);
      e.obj.visible = !!pos && this.facing(pos.p) > 0.05;
      if (!pos || !e.obj.visible) continue;
      const n = pos.p;
      const lift = sh.mode === 'air' ? 0.6 : 0.03;
      const world = n.clone().multiplyScalar(R + lift);
      const fwd = pos.fwd.clone().sub(n.clone().multiplyScalar(pos.fwd.dot(n))).normalize();
      const side = new THREE.Vector3().crossVectors(n, fwd);
      e.obj.matrix.makeBasis(fwd, n, side.negate());
      e.obj.matrix.setPosition(world);
      const sc = this.screenScale(world, 7) * (sh.id === hov ? 1.3 : 1);
      e.obj.matrix.scale(new THREE.Vector3(sc, sc, sc));
      e.obj.matrixAutoUpdate = false;
      e.obj.matrixWorldNeedsUpdate = true;
    }
    for (const [id, e] of this.ships) if (!alive.has(id)) { this.shipRoot.remove(e.obj); this.routeRoot.remove(e.line); e.line.geometry.dispose(); e.line.material.dispose(); this.ships.delete(id); }
  }

  // ── power links between sites ─────────────────────────────────────────────────────────────
  private updateLinks(s: GameState | null) {
    const links = s?.links ?? [];
    const key = links.map((l) => l.id + l.status).join(',');
    if (key === this.linkKey) return;
    this.linkKey = key;
    for (const c of [...this.linkRoot.children]) { this.linkRoot.remove(c); (c as Line2).geometry.dispose(); ((c as Line2).material as LineMaterial).dispose(); }
    for (const l of links) {
      const a = siteDef(l.a), b = siteDef(l.b);
      const pa = dir(a.lon, a.lat), pb = dir(b.lon, b.lat);
      const ang = pa.angleTo(pb);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const p = pa.clone().lerp(pb, t).normalize();
        pts.push(p.multiplyScalar(R * (1.002 + Math.sin(Math.PI * t) * ang * 0.08)));
      }
      const line = l.status === 'online'
        ? softLine(pts, { color: 0xfbd46e, width: 1.2, opacity: 0.9 })
        : softLine(pts, { color: 0xf7b258, width: 1.2, dashed: true, dashSize: 0.6, gapSize: 0.6, opacity: 0.8 });
      (line.material as LineMaterial).resolution.set(this.w, this.h);
      this.linkRoot.add(line);
    }
  }

  // ── chokepoints ───────────────────────────────────────────────────────────────────────────
  private buildChokepoints() {
    for (const c of CHOKEPOINTS) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5fd3b5, emissive: 0x1c8780, emissiveIntensity: 0.6, roughness: 0.5 }));
      m.userData.id = c.id;
      this.chokeRoot.add(m);
    }
  }

  private updateChokepoints(s: GameState | null) {
    const closed = s ? closedChokepoints(s) : new Set<string>();
    const hov = this.game.hover?.kind === 'chokepoint' ? this.game.hover.id : '';
    for (const m of this.chokeRoot.children as THREE.Mesh[]) {
      const c = CHOKEPOINTS.find((x) => x.id === m.userData.id)!;
      const n = dir(c.lon, c.lat);
      const p = n.clone().multiplyScalar(R + 0.3);
      m.visible = this.facing(n) > 0.08 && this.dist < 200;
      m.position.copy(p);
      m.scale.setScalar(this.screenScale(p, 7) * (hov === c.id ? 1.4 : 1));
      m.rotation.y = this.time;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.color.set(closed.has(c.id) ? 0xc23a3f : 0x5fd3b5);
      mat.emissive.set(closed.has(c.id) ? 0x93243a : 0x1c8780);
    }
  }

  // ── labels ────────────────────────────────────────────────────────────────────────────────
  private screenOf(p: THREE.Vector3): { x: number; y: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  private markerTop(id: string): THREE.Vector3 | null {
    const m = this.markers.get(id);
    if (!m || !m.group.visible) return null;
    return m.group.localToWorld(new THREE.Vector3(0, m.top, 0));
  }

  private updateLabels(s: GameState | null) {
    const hovered = this.game.hover?.kind === 'site' ? this.game.hover.id : null;
    const selected = this.game.selection?.kind === 'site' ? this.game.selection.id : null;
    const items: { id: string; text: string; x: number; y: number; pri: number; tone: string }[] = [];
    const near = this.dist < 150;
    for (const [id, m] of this.markers) {
      if (!m.group.visible) continue;
      const always = m.kind === 'home' || m.kind === 'owned' || m.kind === 'supplier' || m.kind === 'charter';
      if (!always && !near && id !== hovered && id !== selected) continue;
      const top = this.markerTop(id);
      const sp = top && this.screenOf(top);
      if (!sp) continue;
      const pri = id === hovered || id === selected ? 10 : m.kind === 'home' ? 8 : m.kind === 'owned' ? 7 : always ? 5 : 1;
      items.push({ id, text: m.site.name, x: sp.x, y: sp.y - 4, pri, tone: id === hovered || id === selected ? 'hot' : m.kind });
    }
    // the regions' names, big and faint, from far out (or the hovered one)
    const hovR = this.game.hover?.kind === 'region' ? this.game.hover.id : this.game.selection?.kind === 'region' ? this.game.selection.id : null;
    for (const r of Object.values(REGIONS)) {
      if (this.dist < 170 && r.id !== hovR) continue;
      const n = dir(r.label.lon, r.label.lat);
      if (this.facing(n) < 0.25) continue;
      const sp = this.screenOf(n.multiplyScalar(R * 1.01));
      if (sp) items.push({ id: 'r:' + r.id, text: r.name.toUpperCase(), x: sp.x, y: sp.y, pri: r.id === hovR ? 9 : 0.5, tone: r.id === hovR ? 'region hot-region' : 'region' });
    }
    this.labels.show(items, (this.game.mode === 'title' ? 0.85 : 1) * (1 - Math.min(1, this.game.stage.fade)));
    void s;
  }

  // ── picking ───────────────────────────────────────────────────────────────────────────────
  /** Longitude/latitude under a screen point, or null off the globe. */
  private pick(x: number, y: number): { lon: number; lat: number } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1), this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const b = o.dot(d), c = o.lengthSq() - R * R;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    return lonLatOf(o.clone().addScaledVector(d, t));
  }

  private hitSite(x: number, y: number, radius = 14): string | null {
    let best: string | null = null;
    let bd = radius;
    for (const [id, m] of this.markers) {
      if (!m.group.visible) continue;
      const c = this.screenOf(m.group.localToWorld(new THREE.Vector3(0, m.top * 0.5, 0)));
      if (!c) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  private hitShipment(x: number, y: number): string | null {
    for (const [id, e] of this.ships) {
      if (!e.obj.visible) continue;
      const c = this.screenOf(new THREE.Vector3().setFromMatrixPosition(e.obj.matrix));
      if (c && Math.hypot(c.x - x, c.y - y) < 10) return id;
    }
    return null;
  }

  private hitChokepoint(x: number, y: number): string | null {
    for (const m of this.chokeRoot.children) {
      if (!m.visible) continue;
      const c = this.screenOf(m.position);
      if (c && Math.hypot(c.x - x, c.y - y) < 10) return m.userData.id;
    }
    return null;
  }

  private regionAt(x: number, y: number) {
    const ll = this.pick(x, y);
    if (!ll) return null;
    const lod = this.game.world.lods[0];
    const p = project(lod, ll.lon, ll.lat);
    return REGION_BY_CODE[sampleRegionCode(lod, p.x, p.y)] ?? null;
  }

  private hoverAt(p: PixelPointer) {
    const g = this.game;
    const site = this.hitSite(p.x, p.y);
    if (site) return g.setHover({ kind: 'site', id: site, clientX: p.clientX, clientY: p.clientY });
    const ship = this.hitShipment(p.x, p.y);
    if (ship) return g.setHover({ kind: 'shipment', id: ship, clientX: p.clientX, clientY: p.clientY });
    const choke = this.hitChokepoint(p.x, p.y);
    if (choke) return g.setHover({ kind: 'chokepoint', id: choke, clientX: p.clientX, clientY: p.clientY });
    const region = this.regionAt(p.x, p.y);
    if (region) return g.setHover({ kind: 'region', id: region, clientX: p.clientX, clientY: p.clientY });
    g.setHover(null);
  }

  /** Client position of a `site:<id>` marker, for the tutorial spotlight. */
  locate(target: string): { x: number; y: number } | null {
    if (!target.startsWith('site:')) return null;
    const top = this.markerTop(target.slice(5));
    const sp = top && this.screenOf(top);
    if (!sp) return null;
    const r = this.game.stage.canvas.getBoundingClientRect();
    return { x: r.left + sp.x, y: r.top + sp.y + 6 };
  }

  // ── input ─────────────────────────────────────────────────────────────────────────────────
  pointerDown(p: PixelPointer) {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.down = null;
      return;
    }
    this.down = { x: p.x, y: p.y, moved: false, t: performance.now() };
    this.last = { x: p.x, y: p.y, t: performance.now() };
    this.vel = { lon: 0, lat: 0 };
    this.cine = null;
    this.goal = null;
  }

  pointerMove(p: PixelPointer) {
    this.cursor = { x: p.x, y: p.y };
    if (this.pointers.has(p.id)) this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) this.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.dist * (this.pinch / d)));
      this.pinch = d;
      return;
    }
    if (this.down) {
      const slop = p.pointerType === 'mouse' ? 3 : 10;
      if (!this.down.moved && Math.hypot(p.x - this.down.x, p.y - this.down.y) > slop) this.down.moved = true;
      if (this.down.moved && this.last) {
        const k = this.degPerPx();
        const dx = p.x - this.last.x, dy = p.y - this.last.y;
        this.lon -= dx * k / Math.max(0.3, Math.cos(this.lat * RAD));
        this.lat += dy * k;
        const now = performance.now();
        const dtt = Math.max(1, now - this.last.t) / 1000;
        this.vel = { lon: (-dx * k) / dtt, lat: (dy * k) / dtt };
        this.last = { x: p.x, y: p.y, t: now };
        this.game.setHover(null);
        return;
      }
    }
    this.hoverAt(p);
  }

  pointerUp(p: PixelPointer) {
    this.pointers.delete(p.id);
    if (this.pointers.size < 2) this.pinch = 0;
    const d = this.down;
    this.down = null;
    if (!d) return;
    if (d.moved) {
      if (this.last && performance.now() - this.last.t > 80) this.vel = { lon: 0, lat: 0 };
      return;
    }
    const g = this.game;
    if (g.mode !== 'map' || !g.state) return;
    const site = this.hitSite(p.x, p.y, p.pointerType === 'mouse' ? 14 : 24);
    const tool = g.tool;
    if (tool?.kind === 'link' || tool?.kind === 'fiber') {
      if (site) g.linkClick(site);
      return;
    }
    if (site) {
      const now = performance.now();
      const kind = siteDef(site).kind;
      if (this.lastClick.site === site && now - this.lastClick.t < 350 && (kind === 'build' || kind === 'charter' || kind === 'mega' || kind === 'launch')) {
        g.enterDiorama(site);
        return;
      }
      this.lastClick = { t: now, site };
      g.select({ kind: 'site', id: site });
      this.focusSite(site);
      return;
    }
    const region = this.regionAt(p.x, p.y);
    g.select(region ? { kind: 'region', id: region } : null);
  }

  pointerCancel(p: PixelPointer) {
    this.pointers.delete(p.id);
    if (this.pointers.size < 2) this.pinch = 0;
    this.down = null;
  }

  pointerLeave() {
    this.cursor = null;
    this.game.setHover(null);
  }

  wheel(p: PixelPointer, deltaY: number) {
    if (this.game.settings.wheel === 'pan') return this.pan(0, Math.sign(deltaY) * 14);
    const k = Math.pow(1.0015, deltaY);
    this.zoomBy(k, deltaY < 0 ? { x: p.x, y: p.y } : undefined);
  }

  destroy() {
    this.labels.destroy();
    disposeObject(this.scene);
    void this.cursor;
  }
}

// ── marker art: little scale-model plinths ───────────────────────────────────────────────────
const KIND_COL: Record<MarkerKind, string> = {
  home: '#fbd46e', owned: '#5fd3b5', build: '#e9e1d2', supplier: '#a862c4', cloud: '#6c9fd2', landing: '#2fae9b',
  mine: '#d4a862', charter: '#f7b258', mega: '#f08a46', launch: '#e6e0e3', other: '#c3bcc7',
};

const RIVAL_COL: Record<string, string> = { meridian: '#c23a3f', lattice: '#7e43a8', orchard: '#5a9537' };

function makeMarker(site: SiteDef, kind: MarkerKind, online: boolean[], sig: string, rivals: { owner: string; building: boolean }[] = [], active = false): Marker {
  const k = new Kit(rng(site.id.length * 31 + site.lat * 7));
  const col = active ? '#a3f0d6' : KIND_COL[kind];
  // rivals' halls stand on little pads beside the plinth (a crane while they build)
  rivals.forEach((r, i) => {
    const a = -0.9 + i * 0.75, x = Math.cos(a) * 1.55, z = Math.sin(a) * 1.55;
    k.geo(new THREE.CylinderGeometry(0.42, 0.46, 0.18, 6).translate(x, 0.09, z), '#433c52', 0.02);
    k.box(0.5, r.building ? 0.25 : 0.42, 0.4, RIVAL_COL[r.owner] ?? '#9d95a6', x, 0.18, z, { r: 0.03 });
    if (r.building) {
      k.box(0.05, 0.75, 0.05, '#fbd46e', x + 0.2, 0.18, z, { r: 0, jitter: 0 });
      k.box(0.5, 0.05, 0.05, '#fbd46e', x + 0.2, 0.9, z, { r: 0, jitter: 0 });
    }
  });
  const hexPlinth = (r: number, h: number, c: string, y = 0) => k.geo(new THREE.CylinderGeometry(r, r * 1.08, h, 6).translate(0, y + h / 2, 0), c, 0.02);
  hexPlinth(1.15, 0.28, '#433c52');
  hexPlinth(1.0, 0.16, col, 0.28);
  let top = 0.6;
  if (kind === 'home') {
    k.box(0.9, 0.55, 0.7, '#efe8de', 0, 0.44, 0, { r: 0.04 });
    k.geo(new THREE.ConeGeometry(0.72, 0.42, 4).rotateY(Math.PI / 4).translate(0, 0.99 + 0.21, 0), '#5b5562', 0);
    k.box(0.38, 0.32, 0.05, '#f7b258', 0.12, 0.44, 0.36, { r: 0 });
    top = 1.45;
  } else if (kind === 'owned') {
    const n = Math.max(1, Math.min(6, online.length));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4, r = n > 1 ? 0.48 : 0;
      const h = 0.35 + ((i * 37) % 5) * 0.08;
      k.box(0.42, h, 0.36, online[i] === false ? '#fbd46e' : '#e7e1d6', Math.cos(a) * r, 0.44, Math.sin(a) * r, { r: 0.03 });
      k.box(0.44, 0.06, 0.38, online[i] === false ? '#df5f3e' : '#5b5562', Math.cos(a) * r, 0.44 + h, Math.sin(a) * r, { r: 0.01 });
    }
    top = 1.25;
  } else if (kind === 'build') {
    k.cyl(0.04, 0.04, 0.9, '#9d95a6', 0, 0.44, 0, 6);
    k.box(0.4, 0.24, 0.03, '#df5f3e', 0.2, 1.08, 0, { r: 0 });
    top = 1.4;
  } else if (kind === 'supplier') {
    k.box(0.95, 0.42, 0.6, '#d8cfc3', 0, 0.44, 0, { r: 0.03 });
    k.cyl(0.1, 0.12, 0.8, '#7a7186', 0.3, 0.44, -0.12, 8);
    k.box(0.5, 0.18, 0.62, '#7e43a8', -0.18, 0.86, 0, { r: 0.02 });
    top = 1.3;
  } else if (kind === 'cloud') {
    for (const [x, y, r] of [[-0.25, 0.75, 0.3], [0.1, 0.82, 0.36], [0.4, 0.72, 0.26]]) k.geo(new THREE.SphereGeometry(r, 10, 8).translate(x, y, 0), '#e6eef8', 0.02);
    top = 1.2;
  } else if (kind === 'mine') {
    k.geo(new THREE.ConeGeometry(0.6, 0.55, 7).translate(0, 0.44 + 0.27, 0), '#9c6c3d', 0.04);
    top = 1.1;
  } else if (kind === 'landing') {
    k.geo(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.44, 0), '#efe8de', 0.02);
    top = 1.0;
  } else {
    k.box(0.6, 0.6, 0.6, col, 0, 0.44, 0, { r: 0.08 });
    top = 1.15;
  }
  const mesh = k.build(markerMat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const g = new THREE.Group();
  g.add(mesh);
  return { site, group: g, sig, kind, top };
}

function shipMesh() {
  const k = new Kit(rng(3));
  k.box(1.8, 0.32, 0.55, '#93243a', 0, 0, 0, { r: 0.08 });
  k.box(1.75, 0.12, 0.5, '#efe8de', 0, 0.32, 0, { r: 0.02 });
  for (let i = 0; i < 4; i++) k.box(0.3, 0.24, 0.42, ['#345c96', '#df5f3e', '#2fae9b', '#fbd46e'][i], -0.55 + i * 0.32, 0.44, 0, { r: 0.02 });
  k.box(0.3, 0.45, 0.45, '#efe8de', 0.72, 0.44, 0, { r: 0.04 });
  const m = k.build(markerMat);
  m.castShadow = false;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function planeMesh() {
  const k = new Kit(rng(4));
  k.cyl(0.13, 0.13, 1.6, '#e6e0e3', 0, 0, 0, 8, { rz: Math.PI / 2 });
  k.box(0.35, 0.05, 1.7, '#c3bcc7', 0.1 - 0.8, 0, 0, { r: 0 });
  k.box(0.25, 0.4, 0.05, '#c23a3f', -1.5, 0, 0, { r: 0 });
  const m = k.build(markerMat);
  m.castShadow = false;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
