/**
 * A campus in the 3D edition: a real place (the ground runs to the horizon), your facilities on
 * their plots, kept in step with the sim, and life round them. Same contract as the pixel
 * DioramaScene: hover a facility or an empty plot, click to select the site, greet the advisors,
 * the menu tour's autoPan.
 */
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { PixelPointer } from '../../render/stage';
import type { Scene3D } from '../stage3d';
import { defaultLook, type Look } from '../post';
import { siteDef, type SiteDef } from '../../content/sites';
import { FACILITIES } from '../../content/facilities';
import { ADVISORS } from '../../content/advisors';
import { campusLines } from '../../content/campusLines';
import { MAX_EXTRA_SLOTS } from '../../sim/model';
import type { AdvisorId, Facility, GameState } from '../../sim/types';
import { subsolar } from '../../world/sun';
import { dir } from '../globe/earth';
import { closeScope, Kit, openScope, rng, noise, withClouds, withGrain } from '../kit';
import { hasModel, loadModels, modelParts, model, type PersonName } from '../models';
import {
  blinkBeacons, clipAbove, cow, crane, fence, fenceMesh, instanced, pad, pumpjack, pylon,
  scaffold, siteClutter, stockPond, streetLamp, utilityPole, windpump, wires, type Env, type Piece,
} from '../pieces';
import { FACILITY_PIECES, SET_PIECES, setFactory } from './registry';
import { plumeUniforms } from '../fx';
import { campusLayout, cellRect, FRONT_Z, HIGHWAY_Z, PD, rectCenter, type CampusLayout, type PlotItem, type Rect } from './layout';
import { BACKDROPS, buildGround, type Backdrop, type Ground } from './ground';
import { habFloor, habitatShell, HAB_R } from './habitatShell';
import { isPlanSite, planLayout, planSpecs, setLayout, setPiecesFor, type SetItem } from './viewOnly';
import { act3Key } from '../../render/diorama/act3Pieces';
import { CampusSky, type Weather } from './sky';
import { Precip } from './weather';
import { Crowd, makeBit, Traffic } from './life';
import { deskHolder } from '../../sim/systemView';
import { sfx } from '../../audio/sfx';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180;

interface Entry {
  f: Facility;
  item: PlotItem;
  root: THREE.Group;
  piece: Piece & { setLoad?(f: number): void };
  clip: boolean;
  site?: THREE.Group;
  crane?: THREE.Group;
  online: boolean;
  rectKey: string;
  crew?: Crowd;
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const lawnMat = withGrain(withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })), 0.45);

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/** Which advisor walks as which figure (until each has a model of their own). */
const ADVISOR_FIGURE: Partial<Record<AdvisorId, PersonName>> = { juno: 'engineer', penny: 'office', mira: 'researcher', sol: 'office', iris: 'scientist', kip: 'worker', lena: 'scientist' };

export class CampusScene implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 6000);
  readonly look: Look = { ...defaultLook(), ao: true, tilt: 1.5, focus: 0.45 };
  readonly wantsAO = true;
  /** The menu tour: the camera drifts on its own. */
  autoPan = false;
  private scope: number;
  private site: SiteDef;
  private ground!: Ground;
  private sky!: CampusSky;
  private layout!: CampusLayout;
  private world = new THREE.Group();
  private roads = new THREE.Group();
  private entries = new Map<string, Entry>();
  private empties = new Map<number, THREE.Object3D>();
  private hitboxes = new THREE.Group();
  private hoverRing!: THREE.LineLoop;
  private crowd = new Crowd();
  private traffic = new Traffic();
  private updaters: ((e: Env) => void)[] = [];
  private bit: { obj: THREE.Object3D; hit: THREE.Mesh } | null = null;
  private layoutKey = '';
  /** Suppliers, the cloud, mines, landing stations: set pieces, no plots. */
  private viewOnly: boolean;
  private setPieces: { item: SetItem; piece: Piece; root: THREE.Group }[] = [];
  /** Rival labs' campuses on plots here (Act II). */
  private rivals = new Map<string, { root: THREE.Group; piece: Piece; crane: THREE.Group | null; key: string }>();
  private time = 0;
  private precip!: Precip;
  private timeOffset = 0;
  private w = 1;
  private h = 1;
  // camera rig: a point on the ground, a heading, a tilt from straight down, a distance
  private target = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.98;
  private dist = 170;
  private goal: { dist?: number } = {};
  private down: { x: number; y: number; moved: boolean; button: number; t: number } | null = null;
  private last: { x: number; y: number; t: number } | null = null;
  private vel = new THREE.Vector2();
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private ray = new THREE.Raycaster();

  constructor(private readonly game: Game, readonly siteId: string) {
    this.scope = openScope();
    this.site = siteDef(siteId);
    this.viewOnly = this.site.kind !== 'build';
    this.build();
    // first view: the plots, a little from the south-west
    this.target.set(this.layout.focus.x, 0, this.layout.focus.z);
    const width = this.layout.bounds.x1 - this.layout.bounds.x0;
    this.dist = Math.max(110, Math.min(this.planKey !== null ? 420 : 320, width * 1.2));
    this.yaw = -0.3;
    // a mine's pit floor hides behind its near rim from low down
    this.pitch = this.site.kind === 'mine' ? 1.0 : 1.16;
  }

  /** The planner's key the set pieces were built from (Act III–V sites), null elsewhere. */
  private planKey: string | null = null;
  private planCheck = 0;

  /** (Re)build everything but the camera: the ground, the sky, the pieces, the life. */
  private build() {
    const s = this.game.view;
    for (const c of [...this.scene.children]) this.scene.remove(c);
    this.world = new THREE.Group();
    this.roads = new THREE.Group();
    this.hitboxes = new THREE.Group();
    this.crowd = new Crowd();
    this.traffic = new Traffic();
    this.updaters = [];
    this.setPieces = [];
    this.entries.clear();
    this.empties.clear();
    this.rivals.clear();
    this.bit = null;
    this.layoutKey = '';
    let backdrop = (this.site.backdrop ?? 'plains') as Backdrop;
    let carve: ((x: number, z: number) => number | null) | undefined;
    let seaZ: number | undefined;
    this.scenery = 'campus';
    if (this.viewOnly) {
      // the set pieces come first: a mine's pit has to be dug into the ground before it's built
      let sl: ReturnType<typeof setLayout>;
      if (isPlanSite(this.site)) {
        const plan = planSpecs(s, this.site);
        this.planKey = act3Key(s, this.site) || plan.specs.map((p) => p.kind).join(',');
        this.scenery = plan.offshore ? 'offshore' : plan.scenery;
        // a station in space is one continuous structure: a single row, no gaps
        sl = this.scenery === 'space' ? planLayout(plan.specs, 1e9, 0) : planLayout(plan.specs);
        if (this.scenery === 'offshore') seaZ = 900;
        if (this.scenery === 'launch') seaZ = sl.bounds.z0 - 50;
        if (this.scenery === 'moon' || this.scenery === 'asteroid') backdrop = 'lunar';
        this.sceneExtra = plan.extra ?? {};
        if (this.scenery === 'geneva' && plan.lakeAt !== undefined) {
          // Lake Geneva begins at the jetty: the land drops away to the east of it
          const jetty = sl.items[plan.lakeAt];
          const lakeX = jetty ? jetty.rect.x0 + 4 : 60;
          const shore = (x: number, z: number) => {
            const d = x - lakeX + (noise(z * 0.03, 0.5, 9) - 0.5) * 18;
            if (d < 0) return null;
            return -0.2 - Math.min(1, d / 14) * 5;
          };
          carve = shore;
          // a water level for the lake (Geneva's mountain backdrop has none of its own); no sea comes in
          seaZ = -4000;
        }
      } else {
        this.planKey = null;
        sl = setLayout(setPiecesFor(this.site));
      }
      if (this.site.kind === 'landing') {
        // the cable comes ashore on the beach just behind the hut
        const hut = sl.items[0], mh = sl.items[1];
        if (hut && mh) mh.rect = { x0: (hut.rect.x0 + hut.rect.x1) / 2 - 3, z0: hut.rect.z0 - 30, x1: (hut.rect.x0 + hut.rect.x1) / 2 + 3, z1: hut.rect.z0 - 24 };
        seaZ = hut ? hut.rect.z0 - 60 : -50;
      }
      const carvers: ((x: number, z: number) => number | null)[] = [];
      if (carve) carvers.push(carve);
      for (const item of sl.items) {
        const sp = item.spec;
        const make = setFactory(sp.kind);
        const w = item.rect.x1 - item.rect.x0, d = item.rect.z1 - item.rect.z0;
        const opts = { seed: hashStr(this.siteId + sp.kind + (sp.n ?? '') + (sp.vseed ?? '')), w, d, tier: 1, brand: sp.brand, label: sp.label, variant: sp.variant, accent: sp.accent ?? '#f7b258', hi: sp.hi ?? '#fbd46e', n: sp.n, p: sp.p, builder: sp.builder, vseed: sp.vseed, backdrop: sp.backdrop, offshore: sp.offshore || this.scenery === 'offshore' };
        const piece = make ? make(opts) : genericPlant(sp.kind, w, d, opts.seed);
        const root = new THREE.Group();
        const c = rectCenter(item.rect);
        root.position.set(c.x, 0, c.z);
        // inside the habitat the floor curves up: stand each piece on it, square to it
        if (this.scenery === 'habitat') { root.position.y = habFloor(c.z); root.rotation.x = -Math.asin(Math.max(-1, Math.min(1, c.z / HAB_R))); }
        const onWater = this.scenery === 'offshore' || sp.kind === 'jetty';
        const bare = this.scenery === 'moon' || this.scenery === 'space' || this.scenery === 'asteroid' || this.scenery === 'habitat';
        if (!piece.ground && sp.kind !== 'manhole' && !onWater && !bare) root.add(pad(w - 0.6, d - 0.6, '#c4b8a6', hashStr(sp.kind)));
        root.add(piece.obj);
        piece.progress?.(1);
        this.setPieces.push({ item, piece, root });
        if (piece.ground) carvers.push((x, z) => piece.ground!(x - c.x, z - c.z));
      }
      if (carvers.length) carve = (x, z) => { for (const f of carvers) { const v = f(x, z); if (v !== null) return v; } return null; };
      this.layout = { cols: 0, cells: [], items: [], bounds: sl.bounds, accessX: sl.accessX, substation: { x: sl.accessX - 14, z: FRONT_Z - 12 }, focus: { x: 0, z: (sl.bounds.z0 + FRONT_Z) / 2 } };
    } else this.layout = campusLayout(s, this.siteId);
    // flatten for the most plots this site could ever have, so buying land never reshapes the ground
    const maxCols = this.viewOnly ? 0 : Math.ceil((this.site.slots + MAX_EXTRA_SLOTS + 4) / 2);
    const far = maxCols ? cellRect(maxCols, maxCols * 2 - 1) : this.layout.bounds;
    const flat: Rect = { x0: this.layout.bounds.x0, z0: this.layout.bounds.z0, x1: Math.max(this.layout.bounds.x1, far.x1 + 10), z1: this.layout.bounds.z1 };
    const seed = hashStr(this.siteId);
    const mesq = (at: { x: number; y: number; z: number; s: number; ry: number }[]) => { const p = modelParts('mesquite'); return p ? instanced(p.parts, p.size, at, 6.5) : null; };
    const oak = (at: { x: number; y: number; z: number; s: number; ry: number }[]) => { const p = modelParts('oak'); return p ? instanced(p.parts, p.size, at, 7) : null; };
    const roadless = this.scenery !== 'campus' && this.scenery !== 'geneva' && this.scenery !== 'launch' && this.scenery !== 'mega';
    const ex = this.sceneExtra as { km?: number; type?: string; place?: string; swarm?: number; habitats?: number; lived?: number };
    if (this.scenery === 'space') {
      // the yards and the ring float: no ground at all
      this.ground = { mesh: new THREE.Mesh(), water: null, plants: new THREE.Group(), h: () => 0, def: BACKDROPS.lunar };
    } else if (this.scenery === 'habitat') {
      this.ground = { mesh: habitatShell((ex.lived ?? 0) / 3) as unknown as THREE.Mesh, water: null, plants: new THREE.Group(), h: (_x, z) => habFloor(z), def: BACKDROPS.temperate };
    } else {
      this.groundOpts = {
        backdrop, seed, flat, clear: { ...this.layout.bounds, x1: this.layout.bounds.x1 + 12 }, carve, seaZ,
        curve: this.scenery === 'asteroid' ? 160 + Math.sqrt(ex.km ?? 10) * 30 : undefined,
        roads: roadless ? [] : [
          { a: [-1700, HIGHWAY_Z], b: [1700, HIGHWAY_Z], w: 12 },
          { a: [this.layout.accessX, HIGHWAY_Z], b: [this.layout.accessX, -PD - 6], w: 8 },
        ],
      };
      this.groundModels = { mesquite: mesq, oak };
      this.ground = buildGround(this.groundOpts, this.groundModels);
      if (this.scenery === 'asteroid') tintAsteroid(this.ground.mesh, ex.type ?? 'C');
    }
    this.scene.add(this.ground.mesh, this.ground.plants);
    if (this.ground.water) this.scene.add(this.ground.water);
    const offWorld = this.scenery === 'moon' || this.scenery === 'space' || this.scenery === 'asteroid' || this.scenery === 'habitat';
    const weather = offWorld ? 'clear' : this.pickWeather();
    const skyMode = this.scenery === 'moon' ? 'lunar' : this.scenery === 'space' ? 'space' : this.scenery === 'asteroid' ? 'asteroid' : this.scenery === 'habitat' ? 'habitat' : 'earth';
    this.sky = new CampusSky(this.scene, weather, skyMode, { place: ex.place, swarm: ex.swarm, habitats: ex.habitats });
    this.precip = new Precip(weather, seed);
    this.scene.add(this.precip.obj);
    const reach = Math.max(150, (this.layout.bounds.x1 - this.layout.bounds.x0) * 0.6, (this.layout.bounds.z1 - this.layout.bounds.z0) * 0.6);
    this.sky.focus(new THREE.Vector3((this.layout.bounds.x0 + this.layout.bounds.x1) / 2, 0, (this.layout.bounds.z0 + this.layout.bounds.z1) / 2), reach);
    this.scene.add(this.world, this.roads, this.hitboxes, this.crowd.group, this.traffic.group);
    this.hoverRing = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfde9a4, transparent: true, opacity: 0.9 }));
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);
    for (const p of this.setPieces) this.world.add(p.root);
    if (!roadless) {
      this.dressStatic();
      this.traffic.highway(HIGHWAY_Z, -1500, 1500, this.ground.h, seed);
    }
    this.carveKey = '';
    if (!this.viewOnly) this.sync(true);
    if (!roadless) this.populate();
    else if (this.scenery === 'moon') this.astronauts();
  }

  /** Suited crews bounding between the Moon base's pieces (they load on first visit). */
  private astronauts() {
    const crowd = this.crowd;
    const go = () => {
      if (this.crowd !== crowd) return;
      for (const [i, sp] of this.setPieces.entries()) {
        if (i % 2) continue;
        const r = sp.item.rect;
        crowd.add('astronaut', [[r.x0 + 2, r.z1 + 2], [r.x1 - 2, r.z1 + 3], [r.x1 - 4, r.z1 + 6]], this.ground.h, { pause: [2, 6], speed: 0.7 });
      }
    };
    if (hasModel('astronaut')) go();
    else loadModels(['astronaut']).then(go).catch(() => {});
  }

  /** Rebuild the land with the carving facilities' shapes (their lakes, gorges and banks). */
  private rebuildGround() {
    if (!this.groundOpts) return;
    const carvers = [...this.entries.values()].filter((e) => e.piece.ground).map((e) => {
      const c = e.root.position;
      return (x: number, z: number) => e.piece.ground!(x - c.x, z - c.z);
    });
    const base = this.groundOpts.carve;
    const carve = carvers.length || base ? (x: number, z: number) => { for (const f of carvers) { const v = f(x, z); if (v !== null) return v; } return base ? base(x, z) : null; } : undefined;
    this.scene.remove(this.ground.mesh, this.ground.plants);
    if (this.ground.water) this.scene.remove(this.ground.water);
    this.ground.mesh.geometry.dispose();
    this.ground = buildGround({ ...this.groundOpts, carve }, this.groundModels);
    this.scene.add(this.ground.mesh, this.ground.plants);
    if (this.ground.water) this.scene.add(this.ground.water);
  }

  /** What surrounds the pieces: a campus, Geneva's lakeside, open sea, a launch coast, the Moon. */
  private scenery = 'campus';
  private brownout = false;
  private groundOpts: Parameters<typeof buildGround>[0] | null = null;
  private groundModels: Parameters<typeof buildGround>[1] = {};
  /** Which facilities reshape the ground (a hydro plant's lake and gorge): the ground is rebuilt when it changes. */
  private carveKey = '';
  private sceneExtra: Record<string, unknown> = {};
  private moonSun: THREE.Vector3 | null = null;

  // ── the static campus ─────────────────────────────────────────────────────────────────────
  private dressStatic() {
    const h = this.ground.h;
    const g = this.world;
    const L = this.layout;
    const s = this.game.view;
    // the substation where the grid comes in, the HV line marching in from the west
    const sub = model('substation', 15);
    sub.position.set(L.substation.x, 0, L.substation.z);
    g.add(sub);
    const pyl: THREE.Vector3[] = [];
    for (let i = 5; i >= 1; i--) {
      const x = L.substation.x - i * 38, z = L.substation.z - 18 - i * 6;
      const p = pylon(i * 7 + 1);
      p.position.set(x, h(x, z), z);
      p.rotation.y = 0.15;
      g.add(p);
      pyl.push(V(x, h(x, z) + 11 * 0.72 - 0.6, z));
    }
    pyl.push(V(L.substation.x - 4, 5, L.substation.z - 2));
    g.add(wires([-3, 0, 3].map((dx) => pyl.map((p, i) => p.clone().add(V(i === pyl.length - 1 ? dx * 0.5 : dx, 0, 0)))), 1.2));
    // a water tower in drier country
    if (['plains', 'desert', 'savanna', 'temperate'].includes(this.site.backdrop ?? '')) {
      const wt = model('watertower', 5.5);
      wt.position.set(L.accessX - 30, h(L.accessX - 30, -10), -10);
      wt.rotation.y = 0.5;
      g.add(wt);
    }
    // the oil patch and a ranch corner on the plains of the Americas
    if (this.site.backdrop === 'plains' || this.site.backdrop === 'savanna') {
      const r = rng(hashStr(this.siteId) + 3);
      if (this.site.region === 'atl' || this.site.region === 'pac' || this.site.region === 'lat') {
        for (let i = 0; i < 6; i++) {
          const x = L.bounds.x0 - 20 - r() * 120, z = -60 - r() * 120;
          const pj = pumpjack(i * 13 + 3);
          pj.obj.position.set(x, h(x, z), z);
          pj.obj.rotation.y = r() * 3;
          g.add(pj.obj);
          this.updaters.push(pj.update);
        }
      }
      const px = L.bounds.x1 + 30, pz = -55;
      const pond = stockPond(4.5, 3);
      pond.position.set(px, h(px, pz), pz);
      g.add(pond);
      const wp = windpump(5);
      wp.obj.position.set(px + 7, h(px + 7, pz - 2), pz - 2);
      g.add(wp.obj);
      this.updaters.push(wp.update);
      for (let i = 0; i < 6; i++) {
        const x = px - 10 + r() * 24, z = pz - 8 + r() * 18;
        if (Math.hypot(x - px, z - pz) < 7) continue;
        const c = cow(i + 40);
        c.obj.position.set(x, h(x, z), z);
        c.obj.rotation.y = r() * 6;
        g.add(c.obj);
        this.updaters.push(c.update);
      }
    }
    void s;
    this.buildRoads();
  }

  /** Roads, poles and lamps: rebuilt when the campus gains columns of plots. */
  private buildRoads() {
    for (const c of [...this.roads.children]) { this.roads.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const L = this.layout;
    const h = this.ground.h;
    const kit = new Kit(rng(4));
    const east = (L.cells.length ? L.cells.reduce((a, c) => Math.max(a, c.x1), 0) : L.bounds.x1 - 10) + 6;
    const strip = (ax: number, az: number, bx: number, bz: number, w: number, c: string) => {
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 6));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
        kit.box(w, 0.14, len / n + 0.05, c, mx, h(mx, mz) - 0.06, mz, { r: 0.03, ry: ang, jitter: 0.015, shade: 0 });
      }
    };
    // the highway, both ways to the horizon, with its markings
    strip(-1500, HIGHWAY_Z, 1500, HIGHWAY_Z, 9, '#58565c');
    for (let x = -1500; x < 1500; x += 6) kit.box(2.6, 0.02, 0.22, '#fbd46e', x, h(x, HIGHWAY_Z) + 0.09, HIGHWAY_Z, { r: 0, jitter: 0 });
    for (const sz of [-4, 4]) strip(-1500, HIGHWAY_Z + sz, 1500, HIGHWAY_Z + sz, 0.18, '#d8d2c8');
    // the access road and the frontage road along the plots
    strip(L.accessX, HIGHWAY_Z - 4, L.accessX, -PD - 4, 6, '#66636a');
    strip(L.accessX, FRONT_Z, east, FRONT_Z, 6, '#66636a');
    kit.cyl(3, 3, 0.14, '#66636a', L.accessX, h(L.accessX, FRONT_Z) - 0.06, FRONT_Z, 16, { jitter: 0, shade: 0 });
    // a gravel service lane behind the back row
    strip(L.accessX, -PD - 4, east, -PD - 4, 3.2, '#cdb894');
    // poles along the frontage road carrying power from the substation
    const poles: THREE.Vector3[] = [];
    for (let x = L.accessX + 4; x <= east; x += 14) { const y = h(x, FRONT_Z + 4); poles.push(V(x, y + 6, FRONT_Z + 4)); }
    const pk = new Kit(rng(5));
    for (const p of poles) { const lk = pk; lk.cyl(0.13, 0.16, 6.5, '#7d5232', p.x, p.y - 6, p.z, 6); lk.beam(V(p.x, p.y - 0.5, p.z - 1.1), V(p.x, p.y - 0.5, p.z + 1.1), 0.13, '#6b4a2c'); }
    void utilityPole;
    this.roads.add(pk.build());
    this.roads.add(wires([poles.map((p) => p.clone().add(V(0, -0.5, -0.9))), poles.map((p) => p.clone().add(V(0, -0.5, 0.9)))], 0.45));
    // lamps up the access road and along the front
    const lamps = new Kit(rng(8));
    for (let z = -PD; z <= HIGHWAY_Z - 8; z += 12) streetLamp(this.roads, lamps, L.accessX + 3.6, h(L.accessX + 3.6, z), z, -1);
    for (let x = L.accessX + 10; x <= east; x += 16) streetLamp(this.roads, lamps, x, h(x, FRONT_Z - 3.6), FRONT_Z - 3.6, 1);
    this.roads.add(lamps.build());
    const m = kit.build();
    m.castShadow = false;
    this.roads.add(m);
  }

  // ── facilities ────────────────────────────────────────────────────────────────────────────
  private sync(force = false) {
    const s = this.game.view;
    const L = campusLayout(s, this.siteId);
    const key = `${L.cols}`;
    this.layout = L;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      if (!force) this.buildRoads();
    }
    const seen = new Set<string>();
    for (const item of L.items) {
      if (item.kind !== 'facility' || !item.facility) continue;
      const f = item.facility;
      seen.add(f.id);
      let e = this.entries.get(f.id);
      const rk = `${item.rect.x0},${item.rect.z0},${item.rect.x1},${item.rect.z1}|${tierOf(f)}`;
      if (e && e.rectKey !== rk) { this.removeEntry(e); e = undefined; }
      if (!e) e = this.addEntry(item, rk);
      if (!e) continue;
      e.f = f;
      const p = f.status === 'online' ? 1 : Math.min(1, f.progress / Math.max(1, f.buildDays));
      if (f.status === 'online' && !e.online) this.open(e);
      // an expansion under way: the crane and crew come back round the (target-size) building
      if (e.online && f.upgrade && !e.site) this.construction(e);
      else if (e.online && !f.upgrade && e.site) this.open(e);
      if (!e.online) {
        if (e.clip) clipAbove(e.piece.obj, 0.05 + Math.max(0.02, p) * e.piece.h);
        e.piece.progress?.(Math.max(0.02, p));
      }
      if (e.piece.setLoad) {
        const qty = (f.racks ?? []).reduce((a, b) => a + b.qty, 0);
        const cap = Math.max(1, (FACILITIES[f.type].itMW ?? 10) * tierMult(f) * 830);
        e.piece.setLoad(f.status === 'online' ? Math.min(1, qty / cap) : 0);
      }
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this.removeEntry(e);
    const ck = [...this.entries.values()].filter((e) => e.piece.ground).map((e) => e.f.id + e.rectKey).join(',');
    if (ck !== this.carveKey) {
      this.carveKey = ck;
      if (ck || !force) this.rebuildGround();
    }
    // rivals' campuses: their own halls behind their own fence, rising while they build
    const rseen = new Set<string>();
    for (const item of L.items) {
      if (item.kind !== 'rival' || !item.rival) continue;
      const b = item.rival;
      rseen.add(b.id);
      const key = `${item.rect.x0},${item.rect.z0},${item.rect.x1},${item.rect.z1}`;
      let r = this.rivals.get(b.id);
      if (r && r.key !== key) { this.world.remove(r.root); this.rivals.delete(b.id); r = undefined; }
      if (!r) {
        const w = item.rect.x1 - item.rect.x0, d = item.rect.z1 - item.rect.z0;
        const make = SET_PIECES.rival;
        const piece = make ? make({ seed: hashStr(b.id), w, d, tier: 1, brand: b.owner, label: b.owner.toUpperCase(), variant: String(b.slots) }) : genericPlant('rival', w, d, hashStr(b.id));
        const root = new THREE.Group();
        const c = rectCenter(item.rect);
        root.position.set(c.x, 0, c.z);
        root.add(pad(w - 0.6, d - 0.6, '#bdb4aa', hashStr(b.id)), piece.obj);
        let crane: THREE.Group | null = null;
        if (b.status !== 'online') {
          crane = crane3(Math.max(14, piece.h + 8), hashStr(b.id));
          crane.position.set(w / 2 - 3, 0, -d / 2 + 3);
          root.add(crane);
        }
        this.world.add(root);
        r = { root, piece, crane, key };
        this.rivals.set(b.id, r);
      }
      const day = s?.day ?? 0;
      const p = b.status === 'online' ? 1 : Math.max(0.02, Math.min(1, (day - b.startDay) / Math.max(1, b.readyDay - b.startDay)));
      if (b.status === 'online' && r.crane) { r.root.remove(r.crane); r.crane = null; clipAbove(r.piece.obj, null); }
      else if (b.status !== 'online') clipAbove(r.piece.obj, 0.05 + p * r.piece.h);
    }
    for (const [id, r] of this.rivals) if (!rseen.has(id)) { this.world.remove(r.root); this.rivals.delete(id); }
    // empty plots: survey stakes
    const empties = new Set<number>();
    for (const item of L.items) {
      if (item.kind !== 'empty') continue;
      const c = item.cells[0];
      empties.add(c);
      if (!this.empties.has(c)) {
        const o = emptyPlot(item.rect, c);
        this.world.add(o);
        this.empties.set(c, o);
      }
    }
    for (const [c, o] of this.empties) if (!empties.has(c)) { this.world.remove(o); this.empties.delete(c); }
    // hit boxes for every plot (hover + click)
    for (const c of [...this.hitboxes.children]) this.hitboxes.remove(c);
    for (const item of L.items) {
      const r = item.rect;
      const hgt = item.facility ? (this.entries.get(item.facility.id)?.piece.h ?? 4) : 1.5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, hgt, r.z1 - r.z0), hitMat);
      const c = rectCenter(r);
      b.position.set(c.x, hgt / 2, c.z);
      b.userData.item = item;
      this.hitboxes.add(b);
    }
  }

  private addEntry(item: PlotItem, rectKey: string): Entry | undefined {
    const f = item.facility!;
    const piece = makePiece(f, item.rect);
    const root = new THREE.Group();
    const c = rectCenter(item.rect);
    root.position.set(c.x, 0, c.z);
    const w = item.rect.x1 - item.rect.x0, d = item.rect.z1 - item.rect.z0;
    if (!piece.ground) root.add(pad(w - 0.6, d - 0.6, f.type === 'solar' || f.type === 'wind' ? '#c8b48e' : f.type === 'hq' ? '#6a8a40' : '#c4b8a6', hashStr(f.id), f.type === 'hq' ? lawnMat : undefined));
    root.add(piece.obj);
    if (f.type === 'datacenter' || f.type === 'battery' || f.type === 'gas') {
      const fk = new Kit(rng(hashStr(f.id) + 30));
      fence(fk, w - 1.2, d - 1.2, 7);
      const fm = fk.build();
      fm.castShadow = false;
      const fg = new THREE.Group();
      fg.add(fm);
      fenceMesh(fg, w - 1.2, d - 1.2, 7);
      root.add(fg);
    }
    this.world.add(root);
    const clip = f.type !== 'solar' && f.type !== 'battery' && f.type !== 'wind' && f.type !== 'hq';
    const e: Entry = { f, item, root, piece, clip, online: f.status === 'online', rectKey };
    if (!e.online || f.upgrade) this.construction(e);
    if (e.online) piece.progress?.(1);
    if (this.brownout) piece.setAlert?.(true);
    this.entries.set(f.id, e);
    return e;
  }

  private construction(e: Entry) {
    const site = new THREE.Group();
    const w = e.item.rect.x1 - e.item.rect.x0, d = e.item.rect.z1 - e.item.rect.z0;
    if (e.clip && !e.online) site.add(scaffold(Math.min(w - 2, e.piece.w - 1.2), e.piece.h, Math.min(d - 3, e.piece.d - 4), hashStr(e.f.id)));
    site.add(siteClutter(w - 2, d - 2, hashStr(e.f.id) + 3));
    if (e.clip || e.f.type === 'wind') {
      const c = crane(e.f.type === 'wind' ? 24 : Math.max(14, e.piece.h + 8), e.f.type === 'wind' ? 12 : 16, hashStr(e.f.id) + 5);
      c.position.set(w / 2 - 3, 0, -d / 2 + 3);
      site.add(c);
      e.crane = c;
    }
    // a mixer parked by the site office while the pour goes on
    const mx = model('mixer', 7.5);
    mx.position.set(-w / 2 + 5, 0.05, d / 2 - 4.5);
    mx.userData.drum = true;
    site.add(mx);
    e.root.add(site);
    e.site = site;
    const crew = new Crowd();
    const hw = Math.min(w, e.piece.w) / 2 + 1, hd = Math.min(d, e.piece.d) / 2;
    for (let i = 0; i < 4; i++) crew.add('worker', [[-hw + i * 2, hd + 1], [hw - i, hd + 1.5], [hw, -hd + i], [-hw + i, -hd]], () => 0.08, { pause: [1, 5] });
    site.add(crew.group);
    e.crew = crew;
  }

  private open(e: Entry) {
    const fresh = !e.online || !!e.site;
    e.online = true;
    if (e.site) e.root.remove(e.site);
    e.site = e.crane = e.crew = undefined;
    if (e.clip) clipAbove(e.piece.obj, null);
    e.piece.progress?.(1);
    if (fresh) this.flash(e.root.position);
  }

  private removeEntry(e: Entry) {
    this.world.remove(e.root);
    this.entries.delete(e.f.id);
  }

  /** A facility opens: a ring of light runs out across the ground. */
  private flashes: { m: THREE.Mesh; t: number }[] = [];
  private flash(at: THREE.Vector3) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfde9a4, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(at).setY(0.3);
    this.scene.add(m);
    this.flashes.push({ m, t: 0 });
  }

  // ── people ────────────────────────────────────────────────────────────────────────────────
  private populate() {
    const s = this.game.view;
    const h = this.ground.h;
    const L = this.layout;
    const east = L.cells.length ? L.cells.reduce((a, c) => Math.max(a, c.x1), 0) : L.bounds.x1 - 10;
    // people working at the set pieces (suppliers' staff, miners, the landing station's tech)
    for (const sp of this.setPieces) {
      const r = sp.item.rect;
      const n = sp.item.spec.kind === 'manhole' ? 0 : sp.item.spec.kind === 'openPit' || sp.item.spec.kind === 'brinePonds' ? 1 : 2;
      for (let i = 0; i < n; i++) this.crowd.add(sp.item.spec.kind === 'openPit' || sp.item.spec.kind === 'crusher' ? 'worker' : null, [[r.x0 + 2 + i * 3, r.z1 + 1.5], [r.x1 - 2, r.z1 + 2], [r.x1 - 3 - i, r.z1 + 4]], h, { pause: [1, 6] });
    }
    // passers-by on the frontage road's pavement
    for (let i = 0; i < 3; i++) this.crowd.add(null, [[L.accessX + 6, FRONT_Z - 4.2], [east, FRONT_Z - 4.2]], h, { pause: [0, 2] });
    // staff at each working building
    for (const e of this.entries.values()) {
      if (e.f.type !== 'datacenter' && e.f.type !== 'lab' && e.f.type !== 'hq' && e.f.type !== 'gas') continue;
      const c = e.root.position;
      const n = e.f.type === 'hq' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const pts: [number, number][] = e.f.type === 'datacenter'
          ? [[c.x - 7.5 + i, c.z + 9], [c.x - 7.5, c.z + 11], [c.x - 11 + i * 2, c.z + 11.2]]
          : [[c.x - 3 + i * 2, c.z + 6], [c.x - 4, c.z + 9], [c.x + 3, c.z + 9.5]];
        this.crowd.add(e.f.type === 'lab' ? (i ? 'scientist' : 'researcher') : e.f.type === 'datacenter' ? 'engineer' : null, pts, h, { pause: [1, 6] });
      }
    }
    // the advisors who are out today, and Bit
    for (const [i, id] of this.namedHere(s).entries()) {
      if (id === 'bit') continue;
      const x = L.accessX + 12 + i * 14;
      const own = `adv_${id}` as PersonName;
      const w = this.crowd.add(hasModel(own) ? own : ADVISOR_FIGURE[id] ?? 'office', [[x, FRONT_Z - 5], [x + 10, FRONT_Z - 5.5], [x + 12, FRONT_Z - 8], [x + 2, FRONT_Z - 8.5]], h, { advisor: id, pause: [2, 7], speed: 1.0 });
      // their own figure, as soon as it's loaded
      if (!hasModel(own)) { const crowd = this.crowd; loadModels([own]).then(() => { if (this.crowd === crowd) crowd.reskin(w, own); }).catch(() => {}); }
    }
    if (this.namedHere(s).includes('bit')) {
      this.bit = makeBit();
      this.bit.hit.userData.advisor = 'bit';
      this.scene.add(this.bit.obj);
    }
    // a delivery now and then up the access road and along the front
    this.traffic.loop('flatbed', [[L.accessX - 2, HIGHWAY_Z + 60], [L.accessX - 2, FRONT_Z + 1.5], [east, FRONT_Z + 1.5], [east, FRONT_Z - 1.5], [L.accessX + 2, FRONT_Z - 1.5], [L.accessX + 2, HIGHWAY_Z + 60]], h, 6, 0);
    this.traffic.loop('van', [[L.accessX - 2, HIGHWAY_Z + 60], [L.accessX - 2, FRONT_Z + 1.5], [east, FRONT_Z + 1.5], [east, FRONT_Z - 1.5], [L.accessX + 2, FRONT_Z - 1.5], [L.accessX + 2, HIGHWAY_Z + 60]], h, 7, 0.5);
  }

  /** Who of the cast is out on this campus (as the pixel campus picks them). */
  private namedHere(s: GameState | null): AdvisorId[] {
    if (!s) return [];
    const ours = s.facilities.some((f) => f.siteId === this.siteId) || s.company.homeSite === this.siteId;
    if (!ours) return [];
    const cast: AdvisorId[] = ['juno', 'penny', 'mira', 'sol', 'iris'];
    if (s.act >= 3) cast.push('kip');
    if (s.act >= 4) cast.push('lena');
    const building = s.facilities.some((f) => f.siteId === this.siteId && f.status !== 'online');
    const has = (t: string) => s.facilities.some((f) => f.siteId === this.siteId && f.type === t);
    const score = (id: AdvisorId) => {
      let v = noise(this.siteId.length * 7 + this.siteId.charCodeAt(0), cast.indexOf(id), 23) * 1.5;
      if (id === 'juno' && building) v += 2;
      if (id === 'iris' && has('lab')) v += 1.5;
      if (id === 'mira' && (has('fab') || has('packaging'))) v += 2;
      if (id === 'penny' && s.company.homeSite === this.siteId) v += 1.5;
      return v;
    };
    const present = cast.filter((id) => deskHolder(s, id) === id);
    const picked = present.sort((a, b) => score(b) - score(a)).slice(0, 3);
    if (s.company.homeSite === this.siteId || noise(this.siteId.charCodeAt(1), 3, 41) < 0.4) picked.push('bit');
    return picked;
  }

  private pickWeather(): Weather {
    if (!this.game.settings.weather) return 'clear';
    const day = this.game.view?.day ?? 0;
    const r = noise(Math.floor(day / 3) + 0.5, Math.floor(this.site.lat * 7 + this.site.lon) + 0.5, 17);
    const wet = this.site.backdrop === 'desert' ? 0.05 : this.site.water > 0.7 ? 0.35 : 0.22;
    if (r < wet) {
      const month = new Date().getUTCMonth();
      const winter = this.site.lat > 0 ? month < 3 || month > 10 : month > 4 && month < 9;
      return this.site.climateC < 8 && winter ? 'snow' : 'rain';
    }
    if (this.site.backdrop === 'desert' && r > 0.92) return 'dust';
    return r < wet + 0.2 ? 'cloudy' : 'clear';
  }

  // ── frame ─────────────────────────────────────────────────────────────────────────────────
  private sunNow(): { v: THREE.Vector3; alt: number } {
    if (this.game.dioramaTimelapse) this.timeOffset += 0;
    let date: Date;
    if (!this.game.settings.dayNight) {
      const now = new Date();
      date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12) - (this.site.lon / 15) * 3_600_000);
    } else date = new Date(Date.now() + this.timeOffset);
    const sub = subsolar(date);
    const sun = dir(sub.lon, sub.lat);
    const n = dir(this.site.lon, this.site.lat);
    const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const north = n.clone().cross(east);
    const up = sun.dot(n);
    // campus space: x east, y up, z south
    const v = new THREE.Vector3(sun.dot(east), up, -sun.dot(north)).normalize();
    return { v, alt: Math.asin(Math.max(-1, Math.min(1, up))) / RAD };
  }

  update(dt: number) {
    this.time += dt;
    if (this.scenery === 'moon' || this.scenery === 'space' || this.scenery === 'asteroid') {
      const a = (Date.now() / 3_600_000) * 0.26 + 0.6;
      const v = new THREE.Vector3(Math.sin(a) * 0.98, 0.14, Math.cos(a) * 0.98).normalize();
      this.moonSun = v;
    }
    if (this.game.dioramaTimelapse) this.timeOffset += dt * 2160 * 1000;
    const s = this.game.view;
    if (!this.viewOnly) this.sync();
    else if (this.planKey !== null && (this.planCheck -= dt) <= 0) {
      this.planCheck = 1;
      const key = act3Key(s, this.site) || planSpecs(s, this.site).specs.map((p) => p.kind).join(',');
      if (key !== this.planKey) this.build();
    }
    const sun = this.moonSun ? { v: this.moonSun, alt: 8 } : this.sunNow();
    this.sky.update(dt, sun.v, sun.alt);
    this.precip.update(dt, this.target, this.sky.night, this.time);
    const env: Env = {
      t: this.time, dt, night: this.sky.night,
      cue: (n) => {
        if (this.game.mode === 'title') return;
        if (n === 'launch') sfx('launch');
        else this.game.achieve?.('night-launch');
      },
    };
    for (const u of this.updaters) u(env);
    for (const sp of this.setPieces) sp.piece.update?.(env);
    // a brownout here (more load than power): the halls go red, the people react
    const pw = s?.stats?.sitePower?.[this.siteId];
    const brown = !!pw && pw.load > 0.5 && pw.frac < 0.95;
    if (brown !== this.brownout) {
      this.brownout = brown;
      for (const e of this.entries.values()) e.piece.setAlert?.(brown);
    }
    for (const r of this.rivals.values()) {
      r.piece.update?.(env);
      if (r.crane) r.crane.userData.top.rotation.y = Math.sin(env.t * 0.25) * 1.1;
    }
    for (const e of this.entries.values()) {
      e.piece.update?.(env);
      e.crew?.update(env);
      if (e.crane) e.crane.userData.top.rotation.y = Math.sin(env.t * 0.25 + hashStr(e.f.id)) * 1.1;
    }
    this.crowd.update(env);
    this.traffic.update(env);
    blinkBeacons(this.world, env);
    if (this.bit) {
      const p = this.bit.obj.position;
      const L = this.layout;
      const tx = L.accessX + 16 + Math.sin(this.time * 0.13) * 18, tz = FRONT_Z - 7 + Math.cos(this.time * 0.21) * 3;
      p.x += (tx - p.x) * Math.min(1, dt * 0.8);
      p.z += (tz - p.z) * Math.min(1, dt * 0.8);
      p.y = 1.6 + Math.sin(this.time * 2.2) * 0.18;
      this.bit.obj.rotation.y = Math.sin(this.time * 0.5) * 0.6;
    }
    for (const f of [...this.flashes]) {
      f.t += dt;
      f.m.scale.setScalar(1 + f.t * 30);
      (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - f.t * 0.9);
      if (f.t > 1) { this.scene.remove(f.m); this.flashes.splice(this.flashes.indexOf(f), 1); }
    }
    // night: stronger bloom; the miniature blur stays
    this.look.bloom = 0.16 + this.sky.night * 0.42;
    this.look.bloomThreshold = 1.5 - this.sky.night * 0.7;
    // the camera
    if (this.autoPan && !this.down) {
      this.yaw = -0.35 + Math.sin(this.time * 0.05) * 0.3;
      this.target.x = this.layout.focus.x + Math.sin(this.time * 0.035) * 25;
    } else if (!this.down) {
      this.target.x += this.vel.x * dt;
      this.target.z += this.vel.y * dt;
      this.vel.multiplyScalar(Math.exp(-dt * 4));
    }
    if (this.goal.dist !== undefined) {
      this.dist += (this.goal.dist - this.dist) * Math.min(1, dt * 6);
      if (Math.abs(this.goal.dist - this.dist) < 0.1) this.goal = {};
    }
    this.clampCam();
    this.placeCamera();
    void s;
  }

  private clampCam() {
    const b = this.layout.bounds;
    this.target.x = Math.max(b.x0 - 20, Math.min(b.x1 + 20, this.target.x));
    this.target.z = Math.max(b.z0 - 20, Math.min(b.z1, this.target.z));
    this.target.y = 0;
    this.pitch = Math.max(0.45, Math.min(1.28, this.pitch));
    this.dist = Math.max(22, Math.min(460, this.dist));
  }

  private placeCamera() {
    const off = new THREE.Vector3().setFromSphericalCoords(this.dist, this.pitch, this.yaw);
    this.camera.position.copy(this.target).add(off);
    const gy = this.ground.h(this.camera.position.x, this.camera.position.z) + 3;
    if (this.camera.position.y < gy) this.camera.position.y = gy;
    this.camera.lookAt(this.target);
    // the miniature read is strongest when you're up high
    this.look.tilt = 0.9 + 0.8 * THREE.MathUtils.smoothstep(this.dist, 40, 220);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    plumeUniforms.scale.value = h * Math.min(2, window.devicePixelRatio || 1) * 0.9;
  }

  busy() {
    return !!this.down?.moved || this.vel.length() > 0.5 || this.goal.dist !== undefined || this.pointers.size >= 2;
  }

  // ── picking ───────────────────────────────────────────────────────────────────────────────
  private rayAt(x: number, y: number) {
    this.ray.setFromCamera(new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1), this.camera);
    return this.ray;
  }

  private advisorAt(x: number, y: number): string | null {
    const targets: THREE.Object3D[] = this.crowd.hitTargets();
    if (this.bit) targets.push(this.bit.hit);
    const hit = this.rayAt(x, y).intersectObjects(targets, false)[0];
    if (!hit) return null;
    return hit.object.userData.walker?.advisor ?? hit.object.userData.advisor ?? null;
  }

  private itemAt(x: number, y: number): PlotItem | null {
    const hit = this.rayAt(x, y).intersectObjects(this.hitboxes.children, false)[0];
    return (hit?.object.userData.item as PlotItem) ?? null;
  }

  private setHoverRing(item: PlotItem | null) {
    this.hoverRing.visible = !!item;
    if (!item) return;
    const r = item.rect, y = 0.25;
    this.hoverRing.geometry.dispose();
    this.hoverRing.geometry = new THREE.BufferGeometry().setFromPoints([V(r.x0 + 0.4, y, r.z0 + 0.4), V(r.x1 - 0.4, y, r.z0 + 0.4), V(r.x1 - 0.4, y, r.z1 - 0.4), V(r.x0 + 0.4, y, r.z1 - 0.4)]);
  }

  private hoverAt(p: PixelPointer) {
    const g = this.game;
    const who = this.advisorAt(p.x, p.y);
    if (who) {
      this.setHoverRing(null);
      this.game.stage.canvas.style.cursor = 'pointer';
      return g.setHover(null);
    }
    this.game.stage.canvas.style.cursor = '';
    const item = this.itemAt(p.x, p.y);
    this.setHoverRing(item);
    if (item?.facility) return g.setHover({ kind: 'facility', id: item.facility.id, clientX: p.clientX, clientY: p.clientY });
    if (item?.kind === 'empty') return g.setHover({ kind: 'slot', siteId: this.siteId, index: item.emptyIndex ?? 0, clientX: p.clientX, clientY: p.clientY });
    g.setHover(null);
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
    this.down = { x: p.x, y: p.y, moved: false, button: p.button, t: performance.now() };
    this.last = { x: p.x, y: p.y, t: performance.now() };
    this.vel.set(0, 0);
  }

  pointerMove(p: PixelPointer) {
    if (this.pointers.has(p.id)) this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) this.dist *= this.pinch / d;
      this.pinch = d;
      return;
    }
    if (this.down && this.last) {
      const slop = p.pointerType === 'mouse' ? 3 : 10;
      if (!this.down.moved && Math.hypot(p.x - this.down.x, p.y - this.down.y) > slop) this.down.moved = true;
      if (this.down.moved) {
        const dx = p.x - this.last.x, dy = p.y - this.last.y;
        const now = performance.now();
        if (this.down.button === 2 || this.down.button === 1) {
          // turn and tilt
          this.yaw -= dx * 0.005;
          this.pitch -= dy * 0.004;
        } else {
          // pan across the ground, at the speed the ground moves under the cursor
          const k = (2 * this.dist * Math.tan((this.camera.fov * RAD) / 2)) / this.h;
          const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
          const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const move = right.multiplyScalar(-dx * k).addScaledVector(fwd, -dy * k / Math.cos(Math.PI / 2 - this.pitch));
          this.target.add(move);
          const dtt = Math.max(1, now - this.last.t) / 1000;
          this.vel.set(move.x / dtt, move.z / dtt);
        }
        this.last = { x: p.x, y: p.y, t: now };
        this.game.setHover(null);
        this.setHoverRing(null);
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
      if (this.last && performance.now() - this.last.t > 80) this.vel.set(0, 0);
      if (d.button !== 0) this.vel.set(0, 0);
      return;
    }
    if (d.button !== 0) return;
    const g = this.game;
    if (!g.state || g.mode !== 'diorama') return;
    const who = this.advisorAt(p.x, p.y) as AdvisorId | null;
    if (who) {
      g.metOnCampus?.(who);
      const lines = campusLines(who, g.view?.act ?? 1);
      const k = (LINE_INDEX.get(who) ?? Math.floor(noise(who.length + 0.5, 5.5, 3) * lines.length));
      LINE_INDEX.set(who, k + 1);
      if (lines.length) g.toast(lines[k % lines.length], 'info', who);
      void ADVISORS;
      return;
    }
    const item = this.itemAt(p.x, p.y);
    g.select({ kind: 'site', id: this.siteId });
    if (item?.kind === 'empty') g.toast('Pick something to build from the panel on the right →', 'info', 'juno');
  }

  pointerCancel(p: PixelPointer) {
    this.pointers.delete(p.id);
    this.down = null;
    this.vel.set(0, 0);
  }

  pointerLeave() {
    this.setHoverRing(null);
    this.game.setHover(null);
  }

  wheel(_p: PixelPointer, deltaY: number) {
    this.goal = { dist: Math.max(22, Math.min(460, (this.goal.dist ?? this.dist) * Math.pow(1.0015, deltaY))) };
  }

  /** Keyboard: arrows/WASD pan. */
  pan(dx: number, dy: number) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.target.addScaledVector(right, dx * this.dist * 0.01).addScaledVector(fwd, dy * this.dist * 0.01);
  }

  /** QA: put the camera somewhere (ground point, distance, heading, tilt from straight down). */
  aim(x: number, z: number, dist: number, yaw = this.yaw, pitch = this.pitch) {
    this.target.set(x, 0, z);
    this.dist = dist;
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0);
    this.goal = {};
  }

  get debug() { return { layout: this.layout, h: this.ground.h }; }

  zoomIn() { this.goal = { dist: Math.max(22, this.dist / 1.3) }; }
  zoomOut() { this.goal = { dist: Math.min(460, this.dist * 1.3) }; }

  destroy() {
    closeScope(this.scope);
    this.game.stage.canvas.style.cursor = '';
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    });
  }
}

const LINE_INDEX = new Map<string, number>();

/** An asteroid's ground by its type: dark carbon (C), stony tan (S), metal grey (M). */
function tintAsteroid(mesh: THREE.Mesh, type: string) {
  const c = mesh.geometry.attributes.color as THREE.BufferAttribute;
  const k = type === 'C' ? [0.55, 0.52, 0.5] : type === 'S' ? [1.05, 0.95, 0.8] : [0.95, 0.95, 1.02];
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k[0], c.getY(i) * k[1], c.getZ(i) * k[2]);
  c.needsUpdate = true;
}
const crane3 = (h: number, seed: number) => crane(h, 16, seed + 5);

// ── facility pieces ──────────────────────────────────────────────────────────────────────────
const tierOf = (f: Facility) => f.upgrade?.to ?? f.tier ?? 1;
/** The capacity multiplier of a facility's current tier (what its racks fill). */
const tierMult = (f: Facility) => { const t = f.tier ?? 1; return t <= 1 ? 1 : FACILITIES[f.type].tiers?.[t - 2]?.mult ?? 1; };

function makePiece(f: Facility, rect: Rect): Piece {
  const seed = hashStr(f.id);
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  const make = FACILITY_PIECES[f.type];
  return make ? make({ seed, w, d, tier: tierOf(f), f }) : genericPlant(f.type, w, d, seed);
}

/** Act II plants and the rest until their 3D art lands: an honest industrial block, coloured by kind. */
function genericPlant(type: string, w: number, d: number, seed: number): Piece {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const colour: Record<string, string> = { hydro: '#6c9fd2', geothermal: '#df5f3e', restart: '#d8cfc3', smr: '#e6e0e3', reactor: '#e6e0e3', packaging: '#a862c4', fab: '#9cc4ea', campus: '#ddd6cc' };
  const c = colour[type] ?? '#d8cfc3';
  k.box(w * 0.7, 6, d * 0.5, c, 0, 0, -1, { r: 0.2 });
  k.box(w * 0.72, 0.5, d * 0.52, '#5b5562', 0, 6, -1, { r: 0.1 });
  if (type === 'reactor' || type === 'restart' || type === 'smr') k.cyl(4, 5.5, 14, '#e9e1d2', w * 0.22, 0, d * 0.18, 20);
  if (type === 'geothermal') for (const x of [-5, 0, 5]) k.cyl(0.6, 0.6, 10, '#8a8490', x, 6, -1, 10);
  g.add(k.build());
  return { obj: g, w: w * 0.75, d: d * 0.6, h: type.includes('react') ? 15 : 8 };
}

/** An empty plot: survey stakes with flags and a string line. */
function emptyPlot(r: Rect, i: number) {
  const k = new Kit(rng(i + 90));
  const c = rectCenter(r);
  const w = r.x1 - r.x0 - 2, d = r.z1 - r.z0 - 2;
  const corners: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (const [x, z] of corners) {
    k.box(0.12, 1.1, 0.12, '#c08850', x, 0, z, { r: 0, jitter: 0 });
    k.box(0.5, 0.3, 0.03, 'org0', x + 0.25, 0.75, z, { r: 0, jitter: 0 });
  }
  for (let j = 0; j < 4; j++) {
    const [ax, az] = corners[j], [bx, bz] = corners[(j + 1) % 4];
    k.beam(V(ax, 0.5, az), V(bx, 0.5, bz), 0.025, 'yel1');
  }
  k.box(0.12, 1.4, 0.12, '#7d5232', -w / 2 + 2, 0, d / 2 + 0.5);
  k.box(1.6, 0.9, 0.08, '#efe8de', -w / 2 + 2, 1.2, d / 2 + 0.5);
  const m = k.build();
  m.position.set(c.x, 0, c.z);
  return m;
}
