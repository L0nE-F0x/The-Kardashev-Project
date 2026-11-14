/**
 * A campus: a real place (the ground runs to the horizon), your facilities on
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
import { closeScope, disposeObject, fbm, Kit, mix, openScope, rng, noise, smooth, withClouds, withGrain } from '../kit';
import { deckHeight, hasModel, loadModels, modelParts, model, TOWNSFOLK, type PersonName } from '../models';
import {
  blinkBeacons, builtHeight, clipAbove, cow, crane, fence, fenceMesh, instanced, pad, pumpjack, pylon,
  scaffold, siteClutter, stockPond, streetLamp, utilityPole, walkMap, WALK_STEP, windpump, wires, type Env, type Piece,
} from '../pieces';
import { FACILITY_PIECES, SET_PIECES, setFactory } from './registry';
import { plumeUniforms } from '../fx';
import { campusLayout, cellRect, FRONT_Z, HIGHWAY_Z, PD, rectCenter, type CampusLayout, type PlotItem, type Rect } from './layout';
import { BACKDROPS, buildGround, type Backdrop, type Ground, type GroundModels } from './ground';
import { habFloor, habitatShell, HAB_LAND_Z, HAB_R } from './habitatShell';
import { plantField, plantPatches, treeUniforms, type Placement, type TreeKind } from './trees';
import { quality } from '../quality';
import { isPlanSite, planLayout, planSpecs, setLayout, setPiecesFor, type SetItem } from './viewOnly';
import { act3Key } from './plan';
import { CampusSky, type Weather } from './sky';
import { atmo, LampField } from '../atmosphere';
import { Precip } from './weather';
import { Crowd, makeBit, settleCars } from './life';
import { Traffic } from './vehicles';
import { bulbAt, bulbHalf, bulbMesh, cornerMesh, paintMesh, roadMesh, type Bulb } from './roads';
import { GrassPatch, grassColours, grassMaterial, sharedClump } from './grass';
import { fieldMesh, hedgePoints, inField } from './fields';
import { CampusPeople, shapeOf, type CarObj } from './people';
import { FENCED, placeKind, placeOf, sitePlan, type Door, type Place, type Rect as WRect } from './paths';
import { deskHolder } from '../../sim/systemView';
import { sfx } from '../../audio/sfx';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180;

/**
 * The latitude a campus takes its sun from. Real up to 40°, then squeezed (×0.3 beyond it), so the far north
 * gets a mid-latitude sun: Luleå (65.6°N) lights like 47.7°N — a winter noon sun near 20° instead of 1–7°, a
 * working day of daylight instead of a dim three hours. The sun still moves over the real day and year.
 */
export function lightLat(lat: number) {
  const a = Math.abs(lat);
  return Math.sign(lat) * (a <= 40 ? a : 40 + (a - 40) * 0.3);
}

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
  /** An expansion under way: the building as it was, cut away from the ground up as the new one rises through it. */
  old?: THREE.Object3D;
  /** How high the building has risen while it goes up (its floors above that aren't there yet: `walkH`). */
  clipY?: number;
  /** The building site while it's built (plot-local): the site office's door, the stacks, what stands about. */
  siteInfo?: { door: { x: number; z: number }; stack: { x: number; z: number }; solids: WRect[] };
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

/** The light a tour shot is filmed in, and its camera move (see `CampusScene.direct`). */
export type TourLight = 'dawn' | 'morning' | 'noon' | 'golden' | 'sunset' | 'dusk' | 'night';
export type TourMove = 'rise' | 'orbit' | 'push' | 'fly' | 'crane' | 'low' | 'sky';
interface Cam { x: number; z: number; dist: number; yaw: number; pitch: number }

/** The models that are buildings with a base of their own (what `walkH` asks for a floor). */
const DECK_MODELS = new Set(['garage', 'lab', 'gasplant', 'substation', 'watertower', 'office', 'bungalow']);

/** A plot's place on screen: see `CampusScene.plotAnchors`. */
export interface PlotAnchor {
  /** `f:<facility id>` or `e:<empty plot's ordinal>`. */
  key: string;
  facilityId?: string;
  emptyIndex?: number;
  /** Above the middle of the roof. */
  x: number;
  y: number;
  /** The box the building fills. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  on: boolean;
}

export class CampusScene implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 6000);
  readonly look: Look = { ...defaultLook(), ao: true, tone: 'filmic', contrast: 0.12, sharpen: 0.35, saturation: 1.14, vignette: 0.26 };
  readonly wantsAO = true;
  /** The menu tour: the camera drifts on its own. */
  autoPan = false;
  private scope: number;
  private site: SiteDef;
  private ground!: Ground;
  private sky!: CampusSky;
  /** The campus's lamps as a texture (the night's light on the ground and walls). */
  private lamps = new LampField();
  private lampAge = 0;
  private layout!: CampusLayout;
  private world = new THREE.Group();
  private roads = new THREE.Group();
  private entries = new Map<string, Entry>();
  private empties = new Map<number, THREE.Object3D>();
  private hitboxes = new THREE.Group();
  private hoverRing!: THREE.LineLoop;
  private crowd = new Crowd();
  /** The campus's working day (staff, crews, the guard, the advisors). */
  private people: CampusPeople | null = null;
  private peopleKey = '';
  private traffic = new Traffic();
  private updaters: ((e: Env) => void)[] = [];
  private bit: { obj: THREE.Object3D; hit: THREE.Mesh } | null = null;
  /** Dense grass round the camera when it's close (earthly sceneries with grass). */
  private grass: GrassPatch | null = null;
  private grassOcc = -1;
  private layoutKey = '';
  /** Suppliers, the cloud, mines, landing stations: set pieces, no plots. */
  private viewOnly: boolean;
  /** The view-only place's pieces (`pad`: it stands on a plot's pad, as a facility does: `walkH`). */
  private setPieces: { item: SetItem; piece: Piece; root: THREE.Group; pad: boolean }[] = [];
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
    // a mine's pit floor hides behind its near rim from low down; in space and inside the habitat the camera
    // looks out level, so the Earth hangs behind the station and Aurora's land rises up overhead
    this.pitch = this.site.kind === 'mine' ? 1.0 : this.scenery === 'space' ? 1.3 : this.scenery === 'habitat' ? 1.42 : 1.16;
    if (this.scenery === 'habitat') {
      // down the cylinder's axis, through a wider lens: the land curving up both sides, the sky windows, the sun-line
      this.dist = Math.min(this.dist, 130);
      this.yaw = -1.12;
      this.pitch = 1.45;
    }
    // arriving: the camera comes down from higher up and settles on the view (not in the menu tour, which directs its own)
    if (this.game.mode !== 'title' && this.scenery !== 'habitat' && this.scenery !== 'space') {
      this.arrival = { t: 0, dist: this.dist, pitch: this.pitch };
      this.dist *= 1.4;
      this.pitch = Math.min(this.pitch, 0.86);
    }
    // Aurora's town and Geneva's plaza have townsfolk (children, people in everyday clothes): load them, then
    // rebuild with them in place of the stand-ins
    if ((this.scenery === 'habitat' || this.scenery === 'geneva') && !TOWNSFOLK.every(hasModel)) {
      loadModels(TOWNSFOLK).then(() => { if (!this.gone) this.build(); }).catch(() => {});
    }
  }
  private gone = false;
  /** The arrival move in progress: where the camera is settling to. Any touch of the camera ends it. */
  private arrival: { t: number; dist: number; pitch: number } | null = null;

  /** The planner's key the set pieces were built from (Act III–V sites), null elsewhere. */
  private planKey: string | null = null;
  private planCheck = 0;

  /** (Re)build everything but the camera: the ground, the sky, the pieces, the life. */
  private build() {
    const s = this.game.view;
    for (const c of [...this.scene.children]) {
      this.scene.remove(c);
      disposeObject(c);
    }
    this.world = new THREE.Group();
    this.roads = new THREE.Group();
    this.hitboxes = new THREE.Group();
    this.crowd = new Crowd();
    this.people = null;
    this.peopleKey = '';
    this.traffic = new Traffic();
    this.updaters = [];
    this.setPieces = [];
    this.rowLanes = undefined;
    this.entries.clear();
    this.empties.clear();
    this.rivals.clear();
    this.bit = null;
    this.layoutKey = '';
    let backdrop = (this.site.backdrop ?? 'plains') as Backdrop;
    let carve: ((x: number, z: number) => number | null) | undefined;
    let seaZ: number | undefined;
    let open: ((x: number, z: number) => number) | undefined;
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
        // (a spaceport on the steppe launches over empty land: no sea behind its pad)
        if (this.scenery === 'launch' && !this.inland()) seaZ = sl.bounds.z0 - 50;
        if (this.scenery === 'moon' || this.scenery === 'asteroid') backdrop = 'lunar';
        this.sceneExtra = plan.extra ?? {};
        if (this.scenery === 'geneva' && plan.lakeAt !== undefined) {
          // Lake Geneva begins at the jetty: the land drops away to the east of it
          const jetty = sl.items[plan.lakeAt];
          const lakeX = jetty ? jetty.rect.x0 + 4 : 60;
          this.lakeX = lakeX;
          const shore = (x: number, z: number) => {
            const d = x - lakeX + (noise(z * 0.03, 0.5, 9) - 0.5) * 18;
            if (d < 0) return null;
            return -0.2 - Math.min(1, d / 14) * 5;
          };
          carve = shore;
          open = (x) => smooth(lakeX + 20, lakeX - 320, x);
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
        const padded = !piece.ground && sp.kind !== 'manhole' && !onWater && !bare;
        if (padded) root.add(pad(w - 0.6, d - 0.6, '#c4b8a6', hashStr(sp.kind)));
        root.add(piece.obj);
        settleCars(root);
        piece.progress?.(1);
        this.setPieces.push({ item, piece, root, pad: padded });
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
    const roadless = this.scenery !== 'campus' && this.scenery !== 'geneva' && this.scenery !== 'launch' && this.scenery !== 'mega';
    const ex = this.sceneExtra as { km?: number; type?: string; place?: string; swarm?: number; habitats?: number; lived?: number };
    if (this.scenery === 'space') {
      // the yards and the ring float: no ground at all
      this.ground = { mesh: new THREE.Mesh(), water: null, plants: new THREE.Group(), h: () => 0, tint: (_x, _z, c) => c.setRGB(0.5, 0.5, 0.5), def: BACKDROPS.lunar };
    } else if (this.scenery === 'habitat') {
      this.ground = { mesh: habitatShell((ex.lived ?? 0) / 3) as unknown as THREE.Mesh, water: null, plants: habitatMeadow(seed, this.layout.bounds, this.setPieces.map((sp) => sp.item.rect)), h: (_x, z) => habFloor(z), tint: (_x, _z, c) => c.setRGB(0.45, 0.6, 0.3), def: BACKDROPS.temperate };
    } else {
      this.groundOpts = {
        backdrop, seed, flat, clear: { ...this.layout.bounds, x1: this.layout.bounds.x1 + 12 }, carve, seaZ, open,
        // (saguaros and barrel cacti grow in the Americas only)
        cacti: this.site.lon > -170 && this.site.lon < -30,
        curve: this.scenery === 'asteroid' ? 160 + Math.sqrt(ex.km ?? 10) * 30 : undefined,
        // the highway runs along its own valley; the access road is graded after it, so it meets the highway level
        roads: roadless ? [] : [
          { a: [-1700, HIGHWAY_Z], b: [1700, HIGHWAY_Z], w: 12, valley: true },
          { a: [this.layout.accessX, HIGHWAY_Z], b: [this.layout.accessX, -PD - 6], w: 8 },
        ],
      };
      // Meshy scenery near the campus: width in metres at scale 1 (the code-built kinds' own sizes, a bit larger)
      // (off the Earth the rocks lose their sandstone tan: the texture's warm cast is cancelled to the regolith's grey)
      // (and on green land: a sandstone boulder in a meadow reads as a brown ball, so it goes to grey granite there)
      const dryLand = backdrop === 'plains' || backdrop === 'desert' || backdrop === 'savanna';
      const offEarth: [number, number, number] | undefined = this.scenery === 'moon' || this.scenery === 'asteroid' ? [0.64, 0.75, 1.02] : dryLand ? undefined : [0.7, 0.78, 0.92];
      const meshy = (n: SceneryName, w: number, light: number) => (at: { x: number; y: number; z: number; s: number; ry: number }[]) => {
        const p = sceneryParts(n);
        return p ? instanced(p.parts.map((q) => ({ ...q, mat: sceneryMat(q.mat, light, offEarth) })), p.size, at.map((a) => ({ ...a, y: a.y - 0.08 * a.s })), w) : null;
      };
      this.groundModels = { rock: meshy('rock_a', 1.6, 2.3), boulder: meshy('boulder_a', 3.0, 1.1) };
      if (this.scenery === 'campus' || this.scenery === 'mega') this.groundOpts.farms = { highwayZ: HIGHWAY_Z };
      this.ground = buildGround(this.groundOpts, this.groundModels);
      if (this.scenery === 'asteroid') tintAsteroid(this.ground.mesh, ex.type ?? 'C');
    }
    this.scene.add(this.ground.mesh, this.ground.plants);
    if (this.ground.water) this.scene.add(this.ground.water);
    this.farmland();
    this.grass = null;
    const grassy = this.scenery !== 'space' && this.scenery !== 'moon' && this.scenery !== 'asteroid' && this.scenery !== 'habitat' && this.scenery !== 'offshore' && backdrop !== 'desert' && backdrop !== 'lunar';
    if (grassy) {
      const dry = backdrop === 'plains' || backdrop === 'savanna';
      this.grass = new GrassPatch(this.ground.h, (x, z) => this.grassOk(x, z, roadless), grassColours(BACKDROPS[backdrop].ground), this.ground.tint, {
        density: dry ? 0.55 : backdrop === 'volcanic' || backdrop === 'mountain' ? 0.7 : 1,
        scale: dry ? [0.9, 1.6] : [0.75, 1.35],
        radius: 34 * Math.max(0.6, Math.min(1, quality.plants)),
      });
      this.scene.add(this.grass.mesh);
    }
    // a small world's ground curves away: stand each piece on it, square to the slope
    if (this.scenery === 'asteroid') {
      for (const sp of this.setPieces) {
        const p = sp.root.position, h = this.ground.h;
        p.y = h(p.x, p.z);
        const dx = (h(p.x + 2, p.z) - h(p.x - 2, p.z)) / 4, dz = (h(p.x, p.z + 2) - h(p.x, p.z - 2)) / 4;
        sp.root.rotation.set(-Math.atan(dz), 0, Math.atan(dx));
      }
    }
    const offWorld = this.scenery === 'moon' || this.scenery === 'space' || this.scenery === 'asteroid' || this.scenery === 'habitat';
    const weather = offWorld ? 'clear' : this.pickWeather();
    const skyMode = this.scenery === 'moon' ? 'lunar' : this.scenery === 'space' ? 'space' : this.scenery === 'asteroid' ? 'asteroid' : this.scenery === 'habitat' ? 'habitat' : 'earth';
    // far enough from the equator, clear nights bring the aurora
    const polar = Math.abs(this.site.lat);
    this.sky = new CampusSky(this.scene, weather, skyMode, { place: ex.place, swarm: ex.swarm, habitats: ex.habitats, aurora: offWorld ? 0 : THREE.MathUtils.smoothstep(polar, 50, 62), still: this.game.settings.reducedMotion });
    treeUniforms.uTreeSway.value = this.game.settings.reducedMotion ? 0 : 1;
    this.precip = new Precip(weather, seed);
    this.scene.add(this.precip.obj);
    const reach = Math.max(150, (this.layout.bounds.x1 - this.layout.bounds.x0) * 0.6, (this.layout.bounds.z1 - this.layout.bounds.z0) * 0.6);
    this.sky.focus(new THREE.Vector3((this.layout.bounds.x0 + this.layout.bounds.x1) / 2, 0, (this.layout.bounds.z0 + this.layout.bounds.z1) / 2), reach);
    if (!this.game.photo) this.setLens(this.scenery === 'habitat' ? 54 : 30);
    this.lamps.fit(Math.min(this.layout.bounds.x0, -40) - 80, this.layout.bounds.z0, Math.max(this.layout.bounds.x1, flat.x1), Math.max(this.layout.bounds.z1, HIGHWAY_Z + 20));
    this.lampAge = 0;
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

  // ── the walk map's places ─────────────────────────────────────────────────────────────────
  /** Everything people walk round and go into, as places (world coordinates), and the cars in their bays. */
  private placesNow(): { places: Place[]; cars: CarObj[]; extra: WRect[]; roots: Map<string, THREE.Object3D> } {
    const roots = new Map<string, THREE.Object3D>();
    const places: Place[] = [];
    const cars: CarObj[] = [];
    const extra: WRect[] = [];
    const add = (id: string, kind: Place['kind'], rect: Rect, piece: Piece, root: THREE.Object3D, o: { fence?: number; building?: boolean; site?: Entry['siteInfo'] } = {}) => {
      const { shape, cars: cs } = shapeOf(piece, root);
      const p = placeOf(id, kind, rect, shape, root.position.x, root.position.z, o);
      if (o.site) {
        const c = root.position;
        const s = o.site;
        p.site = {
          door: { x: s.door.x + c.x, z: s.door.z + c.z, nx: 0, nz: 1 },
          stack: { x: s.stack.x + c.x, z: s.stack.z + c.z },
          solids: s.solids.map((r) => ({ x0: r.x0 + c.x, z0: r.z0 + c.z, x1: r.x1 + c.x, z1: r.z1 + c.z })),
        };
      }
      places.push(p);
      roots.set(id, root);
      for (const c of cs) cars.push({ ...c, place: id });
    };
    for (const e of this.entries.values()) {
      add(e.f.id, placeKind(e.f.type), e.item.rect, e.piece, e.root, { fence: FENCED.has(e.f.type) ? 7 : undefined, building: !!e.site, site: e.site ? e.siteInfo : undefined });
    }
    for (const [id, r] of this.rivals) {
      const item = this.layout.items.find((i) => i.rival?.id === id);
      if (item) add(`rival:${id}`, 'rival', item.rect, r.piece, r.root);
    }
    // a surveyed plot: nobody walks across the string line
    for (const item of this.layout.items) if (item.kind === 'empty') extra.push({ x0: item.rect.x0 + 0.8, z0: item.rect.z0 + 0.8, x1: item.rect.x1 - 0.8, z1: item.rect.z1 - 0.8 });
    for (const [i, sp] of this.setPieces.entries()) {
      if (sp.item.spec.kind === 'manhole') { extra.push(sp.item.rect); continue; }
      // a piece that names its door is staffed: what its people walk round and stand on is read off it (once)
      const piece = sp.piece;
      if (piece.doors?.length) {
        const land = piece.ground ? (x: number, z: number) => piece.ground!(x, z) ?? 0 : undefined;
        if (!piece.blockers || !piece.floor) {
          const m = walkMap(piece.obj, piece.w, piece.d, land);
          piece.floor ??= m.floor;
          piece.blockers ??= m.blockers;
        }
      }
      add(`set:${i}:${sp.item.spec.kind}`, 'set', sp.item.rect, piece, sp.root);
    }
    // the substation where the grid comes in (and its yard)
    const s = this.layout.substation;
    extra.push({ x0: s.x - 9.2, z0: s.z - 8, x1: s.x + 9.2, z1: s.z + 8 });
    for (const t of this.streetTrees) extra.push({ x0: t.x - 0.45, z0: t.z - 0.45, x1: t.x + 0.45, z1: t.z + 0.45 });
    for (const t of this.posts) extra.push({ x0: t.x - 0.22, z0: t.z - 0.22, x1: t.x + 0.22, z1: t.z + 0.22 });
    return { places, cars, extra, roots };
  }

  // ── doors ─────────────────────────────────────────────────────────────────────────────────
  /**
   * The doors people use open for them. A piece paints its door on its wall; here each one in use gets a leaf of
   * the wall's own colour over a dark doorway, set on the wall behind the step (found by a ray from the step). The
   * leaf is only there while it moves: it swings out as someone comes up, they walk through into the dark, it
   * closes behind them. Without it people walked into a shut door and were gone.
   */
  private doorways = new THREE.Group();
  private doors: { door: Door; pivot: THREE.Object3D; hole: THREE.Object3D; open: number }[] = [];
  private buildDoorways(places: Place[], roots: Map<string, THREE.Object3D>) {
    for (const c of [...this.doorways.children]) {
      this.doorways.remove(c);
      c.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !m.userData.shared) m.dispose(); });
    }
    this.doors = [];
    if (!this.doorways.parent) this.scene.add(this.doorways);
    const from = new THREE.Vector3(), dir = new THREE.Vector3(), n = new THREE.Vector3();
    const W = 0.95, H = 2.05;
    doorLeaf ??= new THREE.BoxGeometry(W, H, 0.05).translate(W / 2, H / 2, 0);
    doorHole ??= new THREE.PlaneGeometry(W, H).translate(0, H / 2, 0);
    doorLeaf.userData.shared = doorHole.userData.shared = true;
    doorDark ??= new THREE.MeshBasicMaterial({ color: 0x0c0d11 });
    doorDark.userData.shared = true;
    for (const p of places) {
      const root = roots.get(p.id);
      if (!root || p.site) continue;
      root.updateMatrixWorld(true);
      const targets: THREE.Object3D[] = [];
      root.traverse((o) => {
        // (not a figure: a piece's own people, one of whom may be standing on the step when the doors are hung)
        if (!(o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) return;
        // (not the cars in its car park, nor anything hidden)
        for (let q: THREE.Object3D | null = o; q && q !== root; q = q.parent) if (q.userData.bay || !q.visible) return;
        targets.push(o);
      });
      for (const d of p.doors) {
        const y0 = this.walkH(d.x, d.z);
        // the wall behind the step: the nearest face that looks back at the step at chest height, and the same wall
        // again at head height (a door needs a wall as tall as itself: not a raised deck's edge, not a sill)
        let hit: THREE.Intersection | null = null;
        const wallAt = (hgt: number) => {
          from.set(d.x + d.nx * 0.5, y0 + hgt, d.z + d.nz * 0.5);
          dir.set(-d.nx, 0, -d.nz);
          this.ray.set(from, dir);
          this.ray.far = 2;
          for (const h of this.ray.intersectObjects(targets, false)) {
            if (!h.face) continue;
            n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
            if (n.x * d.nx + n.z * d.nz > 0.7) return h;
          }
          return null;
        };
        const chest = wallAt(1.25), head = chest && wallAt(1.9);
        if (chest && head && Math.abs(head.distance - chest.distance) < 0.4) hit = chest;
        this.ray.far = Infinity;
        if (!hit) continue;
        const back = hit.distance - 0.5;
        // (a wall some way behind the step is not this door's wall: a raised deck in between, an open bay. There
        // people go as they always did, a short step in)
        if (back > 1.2) continue;
        // how far in to walk to be through the doorway and out of sight
        d.in = Math.max(0.55, back + 0.5);
        const g = new THREE.Group();
        g.position.set(d.x - d.nx * back, y0, d.z - d.nz * back);
        g.rotation.y = Math.atan2(d.nx, d.nz);
        const hole = new THREE.Mesh(doorHole, doorDark);
        hole.position.z = 0.02;
        const pivot = new THREE.Group();
        pivot.position.set(-W / 2, 0, 0.035);
        const leaf = new THREE.Mesh(doorLeaf, new THREE.MeshStandardMaterial({ color: surfaceColour(hit), roughness: 0.8 }));
        leaf.castShadow = false;
        pivot.add(leaf);
        g.add(hole, pivot);
        g.visible = false;
        this.doorways.add(g);
        this.doors.push({ door: d, pivot, hole: g, open: 0 });
      }
    }
  }
  private swingDoors(dt: number) {
    for (const d of this.doors) {
      const want = this.people?.doorBusy(d.door) ? 1 : 0;
      if (!want && d.open === 0) continue;
      d.open += (want - d.open) * Math.min(1, dt * (want ? 9 : 4.5));
      if (!want && d.open < 0.01) d.open = 0;
      // (inwards, into the dark: a leaf swinging out swept through whoever was arriving at the step)
      d.pivot.rotation.y = d.open * 1.85;
      d.hole.visible = d.open > 0;
    }
  }

  /** Tell the people about the places (when something is built, finished, upgraded or knocked down). */
  private placePeople(force = false) {
    if (!this.people) return;
    const L = this.layout;
    const key = [L.cols, ...[...this.entries.values()].map((e) => `${e.f.id}${e.rectKey}${e.site ? 'b' : ''}`), ...[...this.rivals.keys()], this.setPieces.length].join('|');
    if (!force && key === this.peopleKey) return;
    this.peopleKey = key;
    const { places, cars, extra, roots } = this.placesNow();
    this.buildDoorways(places, roots);
    const east = this.eastEnd(L);
    this.people.setPlaces(L.bounds, { frontZ: FRONT_Z, accessX: L.accessX, highwayZ: HIGHWAY_Z, east: east + 6, laneZ: this.viewOnly ? null : -PD - 4, accessNorth: -PD - 4 }, places, cars, extra, this.localHour());
  }

  /** The campus's local (solar) time, 0–24: what the sun and the people follow. */
  localHour() {
    const d = this.simDate();
    return (((d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + this.site.lon / 15) % 24) + 24) % 24;
  }

  /** QA: set the campus's clock to a local hour (with the day–night cycle on). */
  setHour(h: number) {
    const now = this.localHour();
    this.timeOffset += ((((h - now) % 24) + 24) % 24) * 3_600_000;
  }

  /**
   * Set the clock to the hour today's sun gives this light: 'dawn' and 'morning' before noon, the rest after it
   * ('noon' = as high as it gets, 'night' = well after dark).
   */
  setLight(light: TourLight) {
    const want = { dawn: 3, morning: 24, noon: 90, golden: 9, sunset: 2.5, dusk: -4.5, night: -24 }[light];
    const am = light === 'dawn' || light === 'morning';
    let best = 12, err = Infinity;
    for (let h = am ? 2 : 11; h <= (am ? 12 : 26); h += 0.05) {
      this.setHour(h);
      const e = Math.abs(this.sunNow().alt - want);
      if (e < err - 1e-6) { err = e; best = h; }
    }
    this.setHour(best);
  }

  /** The menu tour directs a shot: the light it's filmed in, and a camera move played over its `secs`. */
  direct(d: { light?: TourLight; move?: TourMove; secs: number }) {
    if (d.light && this.scenery !== 'moon' && this.scenery !== 'space' && this.scenery !== 'asteroid' && this.scenery !== 'habitat') this.setLight(d.light);
    if (this.scenery === 'habitat') {
      // a slow turn toward the axis: the town first, then the whole drum
      const f = this.layout.focus;
      this.shot = { t: 0, secs: d.secs, from: { x: f.x - 10, z: f.z + 4, dist: 105, yaw: -0.8, pitch: 1.45 }, to: { x: f.x + 8, z: f.z + 4, dist: 135, yaw: -1.36, pitch: 1.44 } };
      this.runShot(0);
      return;
    }
    if (!d.move || this.scenery === 'space') return;
    const f = this.layout.focus, W = this.layout.bounds.x1 - this.layout.bounds.x0, D = this.dist;
    const at = (x: number, z: number, dist: number, yaw: number, pitch: number): Cam => ({ x: f.x + x, z: f.z + z, dist, yaw, pitch });
    const moves: Record<TourMove, [Cam, Cam]> = {
      // a crane shot: up from the grass with the horizon in view, to the classic three-quarter view
      rise: [at(-W * 0.12, 24, D * 0.5, -0.78, 1.5), at(0, 0, D * 0.86, -0.4, 1.22)],
      // round the campus at eye level with its roofs
      orbit: [at(0, 0, D * 0.74, -0.72, 1.36), at(0, 0, D * 0.74, 0.12, 1.36)],
      // from the wide view in to the buildings
      push: [at(0, 0, D * 1.2, -0.16, 1.3), at(-W * 0.08, 6, D * 0.48, -0.46, 1.4)],
      // along the frontage, low
      fly: [at(-W * 0.34, 12, D * 0.46, -0.3, 1.43), at(W * 0.34, 12, D * 0.46, 0.26, 1.43)],
      // down from high over the roofs to the horizon
      crane: [at(0, -10, D * 1.1, 0.34, 0.92), at(0, 6, D * 0.7, -0.18, 1.42)],
      // from out on the land, the campus against the sky
      low: [at(W * 0.1, 34, D * 0.72, 0.5, 1.475), at(-W * 0.04, 30, D * 0.6, 0.2, 1.46)],
      // from a person's height at the gate: the buildings against the sky (stars, the aurora)
      sky: [at(-W * 0.1, 16, D * 0.4, -0.3, 1.5), at(W * 0.05, 16, D * 0.4, 0.1, 1.5)],
    };
    this.shot = { t: 0, secs: d.secs, from: moves[d.move][0], to: moves[d.move][1] };
    this.runShot(0);
  }
  private shot: { t: number; secs: number; from: Cam; to: Cam } | null = null;
  private runShot(dt: number) {
    const sh = this.shot!;
    sh.t += dt;
    const k = Math.min(1, sh.t / sh.secs);
    // a touch of ease at each end, a steady move between (the cut's fade covers the rest)
    const e = k * 0.82 + (k * k * (3 - 2 * k)) * 0.18;
    const l = (a: number, b: number) => a + (b - a) * e;
    this.target.x = l(sh.from.x, sh.to.x);
    this.target.z = l(sh.from.z, sh.to.z);
    this.dist = l(sh.from.dist, sh.to.dist);
    this.yaw = l(sh.from.yaw, sh.to.yaw);
    this.pitch = l(sh.from.pitch, sh.to.pitch);
  }

  /** A place far from any shore (its backdrop is open country: the cosmodrome on the steppe). */
  private inland() { return this.site.backdrop === 'plains' || this.site.backdrop === 'desert'; }

  /** QA: the people's walk map and plans drawn over the ground. */
  debugPeople(on = true) { this.people?.debug(on); return this.people; }

  /** Suited crews bounding between the Moon base's pieces (they load on first visit). */
  private astronauts() {
    const crowd = this.crowd;
    const go = () => {
      if (this.crowd !== crowd) return;
      for (const [i, sp] of this.setPieces.entries()) {
        if (i % 2) continue;
        const r = sp.item.rect;
        crowd.add('astronaut', [[r.x0 + 2, r.z1 + 2], [r.x1 - 2, r.z1 + 3], [r.x1 - 4, r.z1 + 6]], this.ground.h, { pause: [2, 6], speed: 1.25, lope: 0.3 });
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
  private groundModels: GroundModels = {};
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
    {
      // its yard, as a high-voltage yard is kept: crushed stone underfoot, a chain-link fence all round with
      // warning plates, a gate and an apron onto the access road
      const yard = new THREE.Group();
      yard.position.set(L.substation.x, 0, L.substation.z);
      // (the fence helper's gate is on its +z side: turned to face the road, east)
      yard.rotation.y = Math.PI / 2;
      const YW = 16, YD = 18.4;
      yard.add(pad(YW, YD, '#a8a29a', 77));
      const fk = new Kit(rng(78));
      fence(fk, YW - 0.5, YD - 0.5, 4.4, '#7f7a86');
      for (const [x, z, ry] of [[-3.4, YD / 2 - 0.2, 0], [3.4, YD / 2 - 0.2, 0], [-YW / 2 + 0.2, 0, Math.PI / 2], [YW / 2 - 0.2, 0, Math.PI / 2], [0, -YD / 2 + 0.2, 0]] as const) {
        fk.box(0.62, 0.46, 0.04, 'yel1', x, 0.62, z, { r: 0, jitter: 0, shade: 0, ry });
        fk.box(0.2, 0.26, 0.05, '#2b2a30', x, 0.72, z, { r: 0, jitter: 0, shade: 0, ry });
      }
      // the apron out to the road's edge
      fk.box(4.4, 0.06, (L.accessX - 3 - (L.substation.x + YD / 2)) + 0.5, '#5a5760', 0, 0.08, YD / 2 + (L.accessX - 3 - (L.substation.x + YD / 2)) / 2, { r: 0, jitter: 0.02, shade: 0 });
      const fm = fk.build();
      fm.castShadow = false;
      yard.add(fm);
      fenceMesh(yard, YW - 0.5, YD - 0.5, 4.4);
      g.add(yard);
    }
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
      // the ranch corner stands on open range: the first of a few spots that no field covers
      const open = (x: number, z: number) => !(this.ground.fields ?? []).some((f) => inField(f, x, z, 16));
      const spot = ([[L.bounds.x1 + 30, -55], [L.bounds.x1 + 44, -18], [L.bounds.x1 + 36, -96], [L.bounds.x1 + 70, -60], [L.bounds.x0 - 70, -40], [L.bounds.x1 + 40, 24]] as const).find(([x, z]) => open(x, z));
      for (const [px, pz] of spot ? [spot] : []) {
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
    }
    void s;
    this.buildRoads();
  }

  /** The fields' surfaces, their hedgerows and tree lines, and the orchards' rows of trees. */
  private farmland() {
    const fields = this.ground.fields ?? [];
    if (!fields.length) return;
    const g = new THREE.Group();
    g.name = 'farmland';
    const h = this.ground.h;
    for (const f of fields) g.add(fieldMesh(f, h));
    const r = rng(hashStr(this.siteId) + 77);
    const bd = this.site.backdrop ?? 'plains';
    const conifer = bd === 'boreal' || bd === 'mountain';
    const trees: { x: number; y: number; z: number; s: number; ry: number }[] = [], bushes: typeof trees = [], orchard: typeof trees = [];
    const farTrees: Placement[] = [], farBushes: Placement[] = [];
    const cx = (this.layout.bounds.x0 + this.layout.bounds.x1) / 2, cz = (this.layout.bounds.z0 + this.layout.bounds.z1) / 2;
    for (const f of fields) {
      // near the campus the Meshy bush and tree; further out the light code-built ones
      const far = Math.hypot(f.cx - cx, f.cz - cz) > 230 || quality.plants < 0.5;
      for (const p of hedgePoints(f, 5.2, r)) {
        const at = { x: p.x, y: h(p.x, p.z) - 0.1, z: p.z, s: 0.75 + r() * 0.5, ry: r() * Math.PI * 2 };
        // a hedge of bushes with a tree standing out of it every so often
        if (r() < 0.22) (far ? farTrees : trees).push({ ...at, s: 0.8 + r() * 0.5 });
        else (far ? farBushes : bushes).push({ ...at, s: far ? 1.6 + r() * 0.8 : 1.1 + r() * 0.6 });
      }
      if (f.crop === 'orchard') {
        const c = Math.cos(f.rot), sn = Math.sin(f.rot);
        for (let lz = -f.d / 2 + 2.5; lz < f.d / 2 - 2; lz += 5) for (let lx = -f.w / 2 + 2; lx < f.w / 2 - 2; lx += 4.2) {
          const x = f.cx + lx * c - lz * sn, z = f.cz + lx * sn + lz * c;
          orchard.push({ x, y: h(x, z) - 0.05, z, s: 0.55 + r() * 0.2, ry: r() * Math.PI * 2 });
        }
      }
    }
    // (near the campus the full trees and bushes; further out the plain ones)
    const tree: TreeKind = conifer ? 'pine' : 'broadleaf';
    const bush: TreeKind = bd === 'plains' || bd === 'savanna' || bd === 'desert' || bd === 'volcanic' ? 'sage' : 'shrub';
    if (trees.length) g.add(plantField(tree, trees.map((t) => ({ ...t, s: t.s * (conifer ? 1.5 : 1.35) }))));
    if (bushes.length) g.add(plantField(bush, bushes.map((b) => ({ ...b, s: b.s * 1.25 })), { shadow: false }));
    if (farTrees.length) g.add(plantField(tree, farTrees.map((t) => ({ ...t, s: t.s * (conifer ? 1.5 : 1.35) })), { far: true, shadow: false }));
    if (farBushes.length) g.add(plantField(bush, farBushes, { far: true, shadow: false }));
    if (orchard.length) {
      const away = Math.hypot(orchard[0].x - cx, orchard[0].z - cz) > 230;
      g.add(plantField(bd === 'tropical' ? 'palm' : 'blob', orchard as Placement[], { far: away || quality.plants < 0.5, shadow: !away }));
    }
    this.scene.add(g);
  }

  /** Where the close-up grass may grow: not on the roads and pavements, the plots in use, the pieces or the water. */
  private grassOk(x: number, z: number, roadless: boolean) {
    const L = this.layout;
    const y = this.ground.h(x, z);
    if (this.ground.water && y < this.ground.water.position.y + 0.5) return false;
    if (!roadless) {
      const ax = L.accessX, { back: BACK, lanes } = this.backStreet();
      const east = this.eastEnd(L) + 6;
      if (Math.abs(z - HIGHWAY_Z) < 5.6) return false;
      if (x > ax - 3.5 && x < ax + 4.6 && z > BACK - 2 && z < HIGHWAY_Z) return false;
      if (z > FRONT_Z - 4.6 && z < FRONT_Z + 3.4 && x > ax && x < east) return false;
      const bulb = this.bulb;
      if (bulb && x > bulb.throat - 1 && Math.abs(z - FRONT_Z) < bulbHalf(bulb, x) + 0.6) return false;
      for (const l of lanes) if (Math.abs(z - l.z) < 1.9 && x > ax && x < l.x1) return false;
      if (x > L.substation.x - 9.6 && x < ax - 2.5 && Math.abs(z - L.substation.z) < 8.4) return false;
    }
    const inside = (r: Rect, m = 0.2) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
    for (const f of this.ground.fields ?? []) if (inField(f, x, z, 0.5)) return false;
    for (const it of L.items) if (it.kind !== 'empty' && inside(it.rect)) return false;
    for (const sp of this.setPieces) if (inside(sp.item.rect, 0.5)) return false;
    return true;
  }

  /** Roads, pavements, poles and lamps: rebuilt when the campus gains columns of plots. */
  private buildRoads() {
    for (const c of [...this.roads.children]) { this.roads.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const L = this.layout;
    const h = this.ground.h;
    const east = this.eastEnd(L) + 6;
    const ax = L.accessX, HZ = HIGHWAY_Z, FZ = FRONT_Z, { back: BACK, lanes } = this.backStreet();
    // (the pavement up the access road stops where a build site's lane would be, whatever lies behind)
    const PB = -PD - 4;
    const HW = 10, SW = 6, R = 3;
    // the highway, both ways to the horizon; its north edge line breaks where the access road joins
    const hwA = -1500, joinT = ax - hwA;
    this.roads.add(roadMesh({ kind: 'highway', a: [hwA, HZ], b: [1500, HZ], w: HW, breaks: [[joinT - SW / 2 - R, joinT + SW / 2 + R, 'l']] }, h));
    // the access road (north from the highway's edge to the service lane); its east edge and centre line break at
    // the frontage road's junction
    const accA: [number, number] = [ax, HZ - HW / 2 + 0.2], accB: [number, number] = [ax, BACK - 1.6];
    const jt = accA[1] - FZ;
    this.roads.add(roadMesh({ kind: 'street', a: accA, b: accB, w: SW, breaks: [[jt - SW / 2 - R, jt + SW / 2 + R, 'r'], [jt - SW / 2, jt + SW / 2, 'c'], [accA[1] - BACK - 2, 999, 'all']] }, h));
    // the frontage road along the plots, ending in a turning circle: the road flares into a round head with a
    // planted island in its middle, its edge line carried all the way round, a barrier where the road will go on
    // when the campus grows (the centre line stops short of the flare)
    const bulb = bulbAt(east - 5.5, FZ, SW / 2);
    this.bulb = bulb;
    const frontLen = bulb.throat + 0.3 - (ax + SW / 2 - 0.2);
    this.roads.add(roadMesh({ kind: 'street', a: [ax + SW / 2 - 0.2, FZ], b: [bulb.throat + 0.3, FZ], w: SW, breaks: [[0, 1.2, 'all'], [frontLen - 3, frontLen + 1, 'c']] }, h));
    this.roads.add(bulbMesh('street', bulb, h));
    {
      const k = new Kit(rng(31));
      const y = h(bulb.cx, FZ);
      // the island: a kerb ring, soil and planting inside it
      k.cyl(2.0, 2.06, 0.2, '#b7b0a6', bulb.cx, y - 0.02, FZ, 28, { jitter: 0.02, shade: 0.15 });
      k.cyl(1.72, 1.72, 0.05, mix(this.ground.def.ground[0], '#5b4a36', 0.45), bulb.cx, y + 0.17, FZ, 24, { jitter: 0.03, shade: 0 });
      // where the road ends for now: a striped board on two posts, reflector posts either side
      const bx = bulb.cx + bulb.r + 1.3, by = h(bx, FZ);
      for (const dz of [-1.5, 1.5]) k.box(0.1, 1.25, 0.1, '#6b6670', bx, by, FZ + dz, { r: 0, jitter: 0 });
      for (let i = 0; i < 8; i++) k.box(0.05, 0.42, 0.44, i % 2 ? '#ece7de' : '#c8452f', bx - 0.06, by + 0.72, FZ - 1.54 + i * 0.44, { r: 0, jitter: 0, shade: 0 });
      for (const a of [-0.62, 0.62]) {
        const px = bulb.cx + Math.cos(a) * (bulb.r + 0.9), pz = FZ + Math.sin(a) * (bulb.r + 0.9);
        k.box(0.12, 0.95, 0.12, '#ece7de', px, h(px, pz), pz, { r: 0.02, jitter: 0 });
        k.box(0.13, 0.16, 0.13, '#c8452f', px, h(px, pz) + 0.7, pz, { r: 0, jitter: 0, shade: 0 });
      }
      this.roads.add(k.build());
      // planting: a tree of the country in the island with low cover round its foot, and a row of them up the
      // access road's outer verge (clear of the substation's yard)
      this.streetTrees = [];
      const bd = this.site.backdrop ?? 'plains';
      const street: TreeKind | null = bd === 'temperate' || bd === 'coast' ? 'broadleaf' : bd === 'boreal' || bd === 'mountain' || bd === 'volcanic' ? 'birch'
        : bd === 'tropical' ? 'palm' : bd === 'plains' || bd === 'savanna' ? 'mesquite' : null;
      const dry = bd === 'plains' || bd === 'savanna' || bd === 'desert' || bd === 'volcanic';
      const size = { broadleaf: 1.15, birch: 1.25, palm: 1.0, mesquite: 0.8, saguaro: 1.0 } as Partial<Record<TreeKind, number>>;
      const isle = street ?? (this.site.lon > -170 && this.site.lon < -30 ? 'saguaro' : 'palm');
      this.roads.add(plantField(isle, [{ x: bulb.cx + 0.1, y: y + 0.18, z: FZ - 0.1, s: size[isle] ?? 1, ry: 1.3 }]));
      const cover: Placement[] = [];
      for (let i = 0; i < 5; i++) { const a = 0.6 + i * 1.26, d = 0.95 + (i % 2) * 0.3; cover.push({ x: bulb.cx + Math.cos(a) * d, y: y + 0.18, z: FZ + Math.sin(a) * d, s: 0.55 + (i % 3) * 0.12, ry: i * 2.1 }); }
      this.roads.add(plantField(isle === 'saguaro' ? 'barrel' : dry ? 'sage' : 'shrub', cover, { shadow: false }));
      if (street) {
        const row: Placement[] = [];
        const sub = L.substation;
        for (let z = -PD + 2; z <= HZ - 9; z += 12) {
          const x = ax - 6.6;
          if (Math.abs(z - sub.z) < 11 && x > sub.x - 10) continue;
          row.push({ x, y: h(x, z) - 0.05, z, s: (size[street] ?? 1) * (0.92 + ((z * 7.3) % 1 + 1) % 1 * 0.2), ry: z * 0.7 });
        }
        if (row.length) this.roads.add(plantField(street, row));
        this.streetTrees = row.map((t) => ({ x: t.x, z: t.z }));
      }
    }
    // rounded corners where the roads meet
    for (const sx of [-1, 1]) this.roads.add(cornerMesh('highway', [ax + sx * SW / 2, HZ - HW / 2 + 0.05], [0, -1], [sx, 0], R, h));
    this.roads.add(cornerMesh('street', [ax + SW / 2, FZ - SW / 2], [0, -1], [1, 0], R, h));
    this.roads.add(cornerMesh('street', [ax + SW / 2, FZ + SW / 2], [0, 1], [1, 0], R, h));
    // stop lines: out of the campus onto the highway, and from the frontage road onto the access road
    this.roads.add(paintMesh(h, [ax, HZ - HW / 2 - 0.9], [0, -1], 'stop', SW));
    this.roads.add(paintMesh(h, [ax + SW / 2 + 0.9, FZ], [1, 0], 'stop', SW));
    // a gravel service lane behind the back row
    for (const l of lanes) this.roads.add(roadMesh({ kind: 'lane', a: [ax + SW / 2 - 0.2, l.z], b: [l.x1, l.z], w: 3.2 }, h));
    // pavements with kerbs: along the plots' side of the frontage road, and up the access road's campus side
    this.roads.add(roadMesh({ kind: 'pavement', a: [ax + SW / 2 + 0.05, FZ - 3.75], b: [east - 6, FZ - 3.75], w: 1.4, kerb: 0.12 }, h));
    this.roads.add(roadMesh({ kind: 'pavement', a: [ax + 3.75, PB + 2], b: [ax + 3.75, FZ - 4.45], w: 1.4, kerb: 0.12 }, h));
    this.pavements = [
      { x0: ax + SW / 2 + 0.05, z0: FZ - 3.75 - 0.7, x1: east - 6, z1: FZ - 3.75 + 0.7 },
      // (up to the frontage pavement's far edge: the corner where the two meet belongs to both)
      { x0: ax + 3.75 - 0.7, z0: PB + 2, x1: ax + 3.75 + 0.7, z1: FZ - 3.05 },
    ];
    // poles along the frontage road carrying power from the substation
    const poles: THREE.Vector3[] = [];
    for (let x = L.accessX + 4; x <= east - 8; x += 14) { const y = h(x, FRONT_Z + 5); poles.push(V(x, y + 6, FRONT_Z + 5)); }
    const pk = new Kit(rng(5));
    this.posts = poles.map((p) => ({ x: p.x, z: p.z }));
    for (const p of poles) { const lk = pk; lk.cyl(0.13, 0.16, 6.5, '#7d5232', p.x, p.y - 6, p.z, 6); lk.beam(V(p.x, p.y - 0.5, p.z - 1.1), V(p.x, p.y - 0.5, p.z + 1.1), 0.13, '#6b4a2c'); }
    void utilityPole;
    this.roads.add(pk.build());
    this.roads.add(wires([poles.map((p) => p.clone().add(V(0, -0.5, -0.9))), poles.map((p) => p.clone().add(V(0, -0.5, 0.9)))], 0.45));
    // lamps up the access road (beside its pavement) and along the far verge of the frontage road
    const lamps = new Kit(rng(8));
    for (let z = -PD; z <= HIGHWAY_Z - 8; z += 12) if (Math.abs(z - FRONT_Z) > 5) { streetLamp(this.roads, lamps, L.accessX + 4.8, h(L.accessX + 4.8, z), z, -1); this.posts.push({ x: L.accessX + 4.8, z }); }
    for (let x = L.accessX + 11; x <= east - 8; x += 16) { streetLamp(this.roads, lamps, x, h(x, FRONT_Z + 3.7), FRONT_Z + 3.7, 1); this.posts.push({ x, z: FRONT_Z + 3.7 }); }
    this.roads.add(lamps.build());
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
    const occ = L.items.filter((i) => i.kind !== 'empty').length;
    if (occ !== this.grassOcc) { this.grassOcc = occ; this.grass?.invalidate(); }
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
      e.clipY = undefined;
      if (!e.online) {
        if (e.clip) clipAbove(e.piece.obj, (e.clipY = builtHeight(e.piece, p)));
        e.piece.progress?.(Math.max(0.02, p));
      } else if (f.upgrade && e.site) {
        const up = Math.min(1, f.upgrade.progress / Math.max(1, f.upgrade.buildDays));
        if (e.old) {
          // the new building rises through the old one: below the line the new, above it what still stands
          const y = builtHeight(e.piece, up);
          clipAbove(e.piece.obj, y);
          clipAbove(e.old, y, true);
          e.clipY = y;
          e.piece.progress?.(Math.max(0.02, up));
        } else {
          // rows of panels, cabinets or turbines: about half were there already, the rest go in
          e.piece.progress?.(Math.min(0.999, 0.55 + 0.45 * up));
        }
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
      else if (b.status !== 'online') clipAbove(r.piece.obj, builtHeight(r.piece, p));
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
    this.placePeople();
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
    settleCars(root);
    this.world.add(root);
    this.decks = null;
    // (a restart is an old plant put back to work: it stands there whole from the first day, cold, with the works on it)
    const clip = f.type !== 'solar' && f.type !== 'battery' && f.type !== 'wind' && f.type !== 'hq' && f.type !== 'restart';
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
    const type = e.f.type;
    const withCrane = e.clip || type === 'wind' || type === 'restart';
    // an expansion: what stood there stays until the new building has risen past it (rows of panels, cabinets and
    // turbines are added to instead)
    let wasSolid: WRect[] = [];
    if (e.online && e.f.upgrade && type !== 'solar' && type !== 'battery' && type !== 'wind') {
      const was = makePiece({ ...e.f, upgrade: undefined }, e.item.rect);
      e.old = was.obj;
      e.root.add(was.obj);
      wasSolid = was.blockers ?? [{ x0: -was.w / 2, z0: -was.d / 2, x1: was.w / 2, z1: was.d / 2 }];
    }
    // where everything stands (the crew in people.ts walk round it, clock on at the office, fetch from the stacks)
    const plan = sitePlan(w, d, e.piece, { scaffold: e.clip, crane: withCrane });
    // the scaffold rings the building itself (its first blocker when the piece says), else the middle of the footprint
    if (plan.scaffold) {
      // (no taller than a scaffold goes: a plant's stacks and towers stand well above the cage round its buildings)
      const sc = scaffold(plan.scaffold.w, Math.min(e.piece.h, 13), plan.scaffold.d, hashStr(e.f.id));
      sc.position.set(plan.scaffold.x, 0, plan.scaffold.z);
      site.add(sc);
    }
    site.add(siteClutter(w - 2, d - 2, hashStr(e.f.id) + 3));
    if (withCrane) {
      const c = crane(e.f.type === 'wind' ? 24 : Math.max(14, e.piece.h + 8), e.f.type === 'wind' ? 12 : 16, hashStr(e.f.id) + 5);
      c.position.set(w / 2 - 3, 0, -d / 2 + 3);
      site.add(c);
      e.crane = c;
    }
    // a mixer parked by the site office while the pour goes on
    // by the front-left corner, lengthways across the plot; where the piece itself reaches that far (the gas plant's
    // platform fills its plot but for a strip down each side), in the side strip instead, nose to the road
    const solid = [...(e.piece.blockers ?? [{ x0: -e.piece.w / 2, z0: -e.piece.d / 2, x1: e.piece.w / 2, z1: e.piece.d / 2 }]), ...wasSolid];
    const spots: [number, number, number, number, number][] = [
      [-w / 2 + 5, d / 2 - 4.5, 0, 3.9, 1.4],
      [-w / 2 + 2.1, d / 2 - 5.5, Math.PI / 2, 1.4, 3.9],
      [w / 2 - 2.1, d / 2 - 5.5, Math.PI / 2, 1.4, 3.9],
    ];
    // (a building that fills its plot leaves no room for one: the pour is pumped from the road)
    const clear = spots.find(([x, z, , hx, hz]) => !solid.some((b) => x + hx > b.x0 && x - hx < b.x1 && z + hz > b.z0 && z - hz < b.z1));
    if (clear) {
      const mx = model('mixer', 7.5);
      mx.position.set(clear[0], 0.125, clear[1]);
      mx.rotation.y = clear[2];
      mx.userData.drum = true;
      site.add(mx);
    }
    e.root.add(site);
    e.site = site;
    e.siteInfo = { door: plan.door, stack: plan.stack, solids: plan.solids };
  }

  private open(e: Entry) {
    const fresh = !e.online || !!e.site;
    e.online = true;
    if (e.site) e.root.remove(e.site);
    e.site = e.crane = e.siteInfo = undefined;
    if (e.old) { e.root.remove(e.old); disposeObject(e.old); e.old = undefined; }
    clipAbove(e.piece.obj, null);
    e.piece.progress?.(1);
    if (fresh) this.flash(e.root.position);
  }

  private removeEntry(e: Entry) {
    this.world.remove(e.root);
    this.decks = null;
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

  // ── where feet go ─────────────────────────────────────────────────────────────────────────
  /** The building models standing on this campus, each with its footprint and the way back into its own space. */
  private decks: { o: THREE.Object3D; inv: THREE.Matrix4; x0: number; z0: number; x1: number; z1: number }[] | null = null;

  private findDecks() {
    const out: NonNullable<CampusScene['decks']> = [];
    this.world.updateMatrixWorld(true);
    const corner = new THREE.Vector3();
    this.world.traverse((o) => {
      const n = o.userData.model as string | undefined;
      if (!n || !DECK_MODELS.has(n)) return;
      const size = o.userData.size as THREE.Vector3;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        // the copy's local box (its template is centred on its base), out to the world
        corner.set((sx * size.x) / 2 / o.scale.x, 0, (sz * size.z) / 2 / o.scale.z).applyMatrix4(o.matrixWorld);
        x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
        z0 = Math.min(z0, corner.z); z1 = Math.max(z1, corner.z);
      }
      out.push({ o, inv: o.matrixWorld.clone().invert(), x0, z0, x1, z1 });
    });
    return out;
  }

  /**
   * The campus's back street. A build site has one gravel lane behind its two rows. A view-only place planned in
   * several rows (a megaproject, the spaceport) has a lane along the front of every row behind the first, and the
   * access road runs up to the last of them (it stopped square in open ground beside the second row, and the one
   * lane ran under that row's pieces).
   */
  private backStreet(): { back: number; lanes: { z: number; x1: number }[] } {
    if (this.rowLanes === undefined) {
      // (asked for every blade of grass: worked out once; a view-only place is rebuilt whole when its plan changes)
      const fronts = new Map<number, number>();
      if (this.viewOnly) for (const sp of this.setPieces) {
        const z = Math.round(sp.item.rect.z1);
        if (z < 0) fronts.set(z, Math.max(fronts.get(z) ?? -Infinity, sp.item.rect.x1));
      }
      const lanes = [...fronts].map(([z, x1]) => ({ z: z + 4, x1: x1 + 3 }));
      this.rowLanes = lanes.length ? { back: Math.min(...lanes.map((l) => l.z)), lanes } : null;
    }
    return this.rowLanes ?? { back: -PD - 4, lanes: [{ z: -PD - 4, x1: this.eastEnd(this.layout) + 6 }] };
  }
  private rowLanes: { back: number; lanes: { z: number; x1: number }[] } | null | undefined;
  /** Where Geneva's lake begins (null elsewhere). */
  private lakeX: number | null = null;
  /**
   * How far east the campus's street reaches: the last plot, but short of the lake (the jetty is a plot too, and
   * the frontage road, its pavement, poles and lamps ran on into the water).
   */
  private eastEnd(L: CampusLayout) {
    const e = L.cells.length ? L.cells.reduce((a, c) => Math.max(a, c.x1), 0) : L.bounds.x1 - 10;
    return this.lakeX === null ? e : Math.min(e, this.lakeX - 26);
  }
  /** Lamp posts and power poles along the roads (nobody walks through one). */
  private posts: { x: number; z: number }[] = [];
  /** The trees planted along the access road (nobody walks through a trunk). */
  private streetTrees: { x: number; z: number }[] = [];
  /** The turning circle at the frontage road's end (set when the roads are built). */
  private bulb: Bulb | null = null;
  /** The pavements' rectangles (straight runs along the axes), kept when the roads are built: `walkH`. */
  private pavements: { x0: number; z0: number; x1: number; z1: number }[] = [];

  /** On a plot's pad (pieces.ts `pad`: 0.3 in from the plot's edge; pieces that shape their own ground have none). */
  private onPad(x: number, z: number) {
    const on = (r: Rect) => x >= r.x0 + 0.3 && x <= r.x1 - 0.3 && z >= r.z0 + 0.3 && z <= r.z1 - 0.3;
    for (const e of this.entries.values()) if (!e.piece.ground && on(e.item.rect)) return true;
    // (a view-only place's pieces stand on pads too: their people walk on them since v0.15.2)
    for (const sp of this.setPieces) if (sp.pad && on(sp.item.rect)) return true;
    return false;
  }

  /**
   * The height people stand at: the ground, or a building's own floor where that is higher (the garage's concrete
   * apron, the lab's steps: models.ts `deckHeight`). Without it they wade knee-deep through the slab.
   */
  private walkH = (x: number, z: number): number => {
    const g = this.ground.h(x, z);
    this.decks ??= this.findDecks();
    let y = g;
    // a plot's pad and a pavement both stand a kerb's height (0.12) above the ground
    if (this.onPad(x, z) || this.pavements.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) y = g + 0.12;
    for (const d of this.decks) {
      if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
      const v = deckHeight(d.o, d.inv, x, g, z);
      // a floor, not a ledge: nothing more than a tall step above the ground counts
      if (v !== null && v > y && v - g < 1.4) y = v;
    }
    // a piece's own paving, slabs, platforms and roads (the Act II plants, the gas plant, the staffed set pieces:
    // pieces.ts `walkFloor`); while it goes up, as far as it has risen (its crews walk its platform once it's there)
    const onFloor = (piece: Piece, root: THREE.Object3D, r: Rect, top = Infinity) => {
      if (!piece.floor || x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return;
      const v = piece.floor(x - root.position.x, z - root.position.z);
      if (v !== null && v <= top && root.position.y + v > y && root.position.y + v - g < WALK_STEP) y = root.position.y + v;
    };
    for (const e of this.entries.values()) onFloor(e.piece, e.root, e.item.rect, e.site ? e.clipY ?? Infinity : Infinity);
    for (const sp of this.setPieces) onFloor(sp.piece, sp.root, sp.item.rect);
    return y;
  };

  // ── people ────────────────────────────────────────────────────────────────────────────────
  private populate() {
    const s = this.game.view;
    const h = this.walkH;
    const L = this.layout;
    const east = this.eastEnd(L);
    // the working day: staff, crews, the night guard, the people at the set pieces (people.ts)
    const people = new CampusPeople(h);
    this.people = people;
    this.scene.add(people.group);
    this.placePeople(true);
    // the advisors who are out today (their own figures as soon as they've loaded), and Bit
    const advisors = this.namedHere(s).filter((id) => id !== 'bit').map((id) => {
      const own = `adv_${id}` as PersonName;
      if (!hasModel(own)) loadModels([own]).then(() => { if (this.people === people) people.reskin(id, own); }).catch(() => {});
      return { id, kind: hasModel(own) ? own : ADVISOR_FIGURE[id] ?? 'office' };
    });
    people.setAdvisors(advisors);
    if (this.namedHere(s).includes('bit')) {
      this.bit = makeBit();
      this.bit.hit.userData.advisor = 'bit';
      this.scene.add(this.bit.obj);
    }
    // deliveries: in along the highway, up the access road, along the frontage, round the turning circle, a stop to
    // unload outside the front-row buildings, out onto the highway again (right-hand traffic, see vehicles.ts)
    const docks = L.items.filter((it) => it.kind === 'facility' && it.rect.z0 > 0).map((it) => (it.rect.x0 + it.rect.x1) / 2);
    this.traffic.deliveries({ highwayZ: HIGHWAY_Z, accessX: L.accessX, frontZ: FRONT_Z, east: east + 6, docks, turn: this.bulb ? { x: this.bulb.cx, throat: this.bulb.throat } : undefined }, ['flatbed', 'van', 'pickup'], h);
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

  /** The sound bed this place calls for now: by where it is, the weather and the hour (audio/ambience.ts asks once a second). */
  ambience(): 'campus' | 'night' | 'rain' | 'coast' | 'lake' | 'moon' | 'space' | 'habitat' {
    const p = this.scenery, wet = this.precip.kind;
    if (p === 'moon') return 'moon';
    if (p === 'space' || p === 'asteroid') return 'space';
    if (p === 'habitat') return 'habitat';
    if (wet === 'rain' || wet === 'snow') return 'rain';
    if (p === 'offshore' || (p === 'launch' && !this.inland()) || this.site.backdrop === 'coast') return 'coast';
    if (p === 'geneva') return 'lake';
    return this.sky.night > 0.55 ? 'night' : 'campus';
  }

  /**
   * Settings → Weather or Reduce motion changed: the weather is chosen when the campus is built, so build it again
   * (it used to rain on until the player left the campus).
   */
  weatherSettingsChanged() {
    this.build();
  }

  /** Photo mode and QA: film in this weather (rebuilds the scene); null = the site's own again. */
  setWeather(w: Weather | null) {
    if (w === this.forceWeather) return;
    this.forceWeather = w;
    this.build();
  }
  private forceWeather: Weather | null = null;
  /** The weather chosen in photo mode (null = the site's own). */
  get weatherChoice() { return this.forceWeather; }

  /** Photo mode: the lens (field of view in degrees; the game's own is a long 30°) and how strong the blur is (1 = the game's). */
  setLens(fov: number) {
    this.camera.fov = Math.max(14, Math.min(70, fov));
    this.camera.updateProjectionMatrix();
  }
  get lens() { return this.camera.fov; }
  blur = 1;
  /** Leaving photo mode: the game's own lens, blur and weather again (the hour stays: time passes anyway). */
  photoReset() {
    this.blur = 1;
    this.setLens(this.scenery === 'habitat' ? 54 : 30);
    this.setWeather(null);
  }

  private pickWeather(): Weather {
    if (this.forceWeather) return this.forceWeather;
    if (!this.game.settings.weather) return 'clear';
    // Reduce motion: no rain, snow or blowing dust (the clouds hold still too: CampusSky's `still`)
    const calm = this.game.settings.reducedMotion;
    // the menu tour films in fair weather (a few shots under cloud, for variety)
    if (this.game.mode === 'title') return noise(this.site.lon * 0.37 + 0.5, this.site.lat * 0.53 + 0.5, 23) > 0.74 ? 'cloudy' : 'clear';
    const day = this.game.view?.day ?? 0;
    const r = noise(Math.floor(day / 3) + 0.5, Math.floor(this.site.lat * 7 + this.site.lon) + 0.5, 17);
    const wet = this.site.backdrop === 'desert' ? 0.05 : this.site.water > 0.7 ? 0.35 : 0.22;
    if (r < wet) {
      const month = new Date().getUTCMonth();
      const winter = this.site.lat > 0 ? month < 3 || month > 10 : month > 4 && month < 9;
      return calm ? 'cloudy' : this.site.climateC < 8 && winter ? 'snow' : 'rain';
    }
    if (this.site.backdrop === 'desert' && r > 0.92) return calm ? 'clear' : 'dust';
    return r < wet + 0.2 ? 'cloudy' : 'clear';
  }

  // ── frame ─────────────────────────────────────────────────────────────────────────────────
  /** The moment the campus shows: now (plus the time-lapse), or local noon today with the day–night cycle off. */
  private simDate(): Date {
    if (!this.game.settings.dayNight) {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12) - (this.site.lon / 15) * 3_600_000);
    }
    return new Date(Date.now() + this.timeOffset);
  }

  private sunNow(): { v: THREE.Vector3; alt: number } {
    const date = this.simDate();
    const sub = subsolar(date);
    const sun = dir(sub.lon, sub.lat);
    const n = dir(this.site.lon, lightLat(this.site.lat));
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
      if (e.crane) e.crane.userData.top.rotation.y = Math.sin(env.t * 0.25 + hashStr(e.f.id)) * 1.1;
    }
    this.crowd.update(env);
    this.camera.updateMatrixWorld();
    this.people?.update(env, this.localHour(), this.camera);
    if (this.people) this.people.walkers(this.traffic.walkers);
    this.swingDoors(env.dt);
    this.traffic.update(env);
    blinkBeacons(this.world, env);
    if (this.bit) {
      // Bit keeps company with an advisor (a little behind, on the way they came), or the guard at night
      const p = this.bit.obj.position;
      const to = this.people?.bitTarget();
      const L = this.layout;
      const tx = to ? to.x : L.accessX + 16 + Math.sin(this.time * 0.13) * 18, tz = to ? to.z : FRONT_Z - 7;
      const k = Math.min(1, dt * 1.6);
      p.x += (tx - p.x) * k;
      p.z += (tz - p.z) * k;
      // clear of the tallest head (a hard hat on an apron), wherever it floats
      p.y = this.walkH(p.x, p.z) + 2.5 + Math.sin(this.time * 2.2) * 0.15;
      const look = to ? to.heading : Math.sin(this.time * 0.5) * 0.6;
      this.bit.obj.rotation.y += Math.atan2(Math.sin(look - this.bit.obj.rotation.y), Math.cos(look - this.bit.obj.rotation.y)) * Math.min(1, dt * 3);
    }
    for (const f of [...this.flashes]) {
      f.t += dt;
      f.m.scale.setScalar(1 + f.t * 30);
      (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - f.t * 0.9);
      if (f.t > 1) { this.scene.remove(f.m); this.flashes.splice(this.flashes.indexOf(f), 1); }
    }
    // the lamp field (a few hundred quads): redrawn every other frame on high (every fourth below it), so headlights
    // sweep along the road smoothly
    if (atmo.uLampK.value.x > 0 && (this.lampAge -= 1) <= 0) {
      this.lampAge = quality.level === 'high' ? 2 : 4;
      this.lamps.render((this.game.stage as unknown as { renderer: THREE.WebGLRenderer }).renderer, this.scene);
    }
    // the picture is developed for the hour; at night the lamps and windows bloom
    this.look.exposure = this.sky.exposure;
    this.look.bloom = 0.14 + this.sky.night * 0.3;
    this.look.bloomThreshold = 1.3 - this.sky.night * 0.35;
    // the camera
    if (this.arrival) {
      const a = this.arrival;
      if (this.down || this.goal.dist !== undefined || this.pointers.size) this.arrival = null;
      else {
        // (long frames count as short ones: the move takes a few more of them on a slow machine, never a jump)
        const step = Math.min(dt, 0.05);
        a.t += step;
        // ease out: quick at first, settling gently
        const k = 1 - Math.exp(-step * 3.2);
        this.dist += (a.dist - this.dist) * k;
        this.pitch += (a.pitch - this.pitch) * k;
        if (a.t > 2.2) this.arrival = null;
      }
    }
    if (this.shot && this.autoPan && !this.down) this.runShot(dt);
    else if (this.autoPan && !this.down) {
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
    this.grass?.update(this.target, this.dist);
    void s;
  }

  private clampCam() {
    const b = this.layout.bounds;
    this.target.x = Math.max(b.x0 - 20, Math.min(b.x1 + 20, this.target.x));
    this.target.z = Math.max(b.z0 - 20, Math.min(b.z1, this.target.z));
    this.target.y = 0;
    // down to just above the horizon: the sky, the far land and the weather are part of the view
    this.pitch = Math.max(0.45, Math.min(1.5, this.pitch));
    this.dist = Math.max(22, Math.min(460, this.dist));
  }

  private placeCamera() {
    const off = new THREE.Vector3().setFromSphericalCoords(this.dist, this.pitch, this.yaw);
    this.camera.position.copy(this.target).add(off);
    const gy = this.ground.h(this.camera.position.x, this.camera.position.z) + 3;
    if (this.camera.position.y < gy) this.camera.position.y = gy;
    // inside the habitat look up over the town, so the land curving overhead fills the sky
    if (this.scenery === 'habitat') this.camera.lookAt(this.target.x, this.target.y + this.dist * 0.14, this.target.z);
    else this.camera.lookAt(this.target);
    // the miniature read: sharp where the camera looks, soft before and behind it (strongest from up high; close
    // in, almost none: a close-up should be crisp). Inside the habitat the land overhead must stay sharp.
    const focus = this.camera.position.distanceTo(this.target);
    this.look.dof = { focus, range: 0.24, max: (this.scenery === 'habitat' ? 1.5 : 1.5 + 4.5 * THREE.MathUtils.smoothstep(this.dist, 60, 300)) * this.blur };
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
    const targets: THREE.Object3D[] = [...this.crowd.hitTargets(), ...(this.people?.hitTargets() ?? [])];
    if (this.bit) targets.push(this.bit.hit);
    const hit = this.rayAt(x, y).intersectObjects(targets, false)[0];
    if (!hit) return null;
    return hit.object.userData.walker?.advisor ?? hit.object.userData.advisor ?? null;
  }

  private itemAt(x: number, y: number): PlotItem | null {
    const hit = this.rayAt(x, y).intersectObjects(this.hitboxes.children, false)[0];
    return (hit?.object.userData.item as PlotItem) ?? null;
  }

  /**
   * Where each plot stands on screen, in CSS pixels of the canvas (SPEC §34, the notes on the world): the point
   * above the middle of its roof and the box its building fills. `on` is false behind the camera or off the edge.
   */
  plotAnchors(): PlotAnchor[] {
    const out: PlotAnchor[] = [];
    const v = new THREE.Vector3();
    for (const b of this.hitboxes.children as THREE.Mesh[]) {
      const item = b.userData.item as PlotItem | undefined;
      if (!item || item.kind === 'rival') continue;
      const g = (b.geometry as THREE.BoxGeometry).parameters;
      const hw = g.width / 2, hh = g.height / 2, hd = g.depth / 2;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ahead = true;
      for (let i = 0; i < 8; i++) {
        v.set(b.position.x + (i & 1 ? hw : -hw), b.position.y + (i & 2 ? hh : -hh), b.position.z + (i & 4 ? hd : -hd)).project(this.camera);
        if (v.z > 1) ahead = false;
        const sx = ((v.x + 1) / 2) * this.w, sy = ((1 - v.y) / 2) * this.h;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      v.set(b.position.x, b.position.y + hh, b.position.z).project(this.camera);
      const x = ((v.x + 1) / 2) * this.w, y = ((1 - v.y) / 2) * this.h;
      const on = ahead && v.z < 1 && x > 0 && x < this.w && y > 0 && y < this.h;
      out.push({ key: item.facility ? `f:${item.facility.id}` : `e:${item.emptyIndex ?? 0}`, facilityId: item.facility?.id, emptyIndex: item.facility ? undefined : (item.emptyIndex ?? 0), x, y, x0, y0, x1, y1, on });
    }
    return out;
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
    this.arrival = null;
    this.shot = null;
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
    this.gone = true;
    this.people?.destroy();
    closeScope(this.scope);
    this.game.stage.canvas.style.cursor = '';
    this.lamps.dispose();
    atmo.uLampK.value.x = 0;
    disposeObject(this.scene);
  }
}

const LINE_INDEX = new Map<string, number>();

/**
 * Aurora's floor round the town: groves of broadleaf and birch, hedgerow shrubs and tufts in the meadow, each
 * standing square to the curved floor (tipped towards the axis), never on a piece.
 */
function habitatMeadow(seed: number, b: Rect, rects: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed + 7);
  const free = (x: number, z: number, m: number) => !rects.some((q) => x > q.x0 - m && x < q.x1 + m && z > q.z0 - m && z < q.z1 + m);
  const kinds: Record<'broadleaf' | 'birch' | 'blob' | 'shrub' | 'tuft', Placement[]> = { broadleaf: [], birch: [], blob: [], shrub: [], tuft: [] };
  const X0 = b.x0 - 240, X1 = b.x1 + 240, n = Math.round(3200 * quality.plants);
  const grove = (x: number, z: number) => fbm(x * 0.012, z * 0.012, 11, 3);
  // groves where the noise is in its top fifth, scrub at their edges (by rank, whatever the noise's range)
  const sample = Array.from({ length: 400 }, () => grove(X0 + r() * (X1 - X0), (r() * 2 - 1) * (HAB_LAND_Z - 10))).sort((a, c) => a - c);
  const treeAt = sample[Math.floor(sample.length * 0.8)], scrubAt = sample[Math.floor(sample.length * 0.68)];
  for (let i = 0; i < n; i++) {
    const x = X0 + r() * (X1 - X0), z = (r() * 2 - 1) * (HAB_LAND_Z - 10);
    if (!free(x, z, 2.5)) continue;
    const gv = grove(x, z);
    let kind: keyof typeof kinds;
    if (gv > treeAt) kind = r() < 0.7 ? 'broadleaf' : 'birch';
    else if (gv > scrubAt) { if (r() < 0.5) continue; kind = r() < 0.5 ? 'blob' : 'shrub'; }
    else if (r() < 0.04) kind = r() < 0.5 ? 'broadleaf' : 'birch'; // a lone tree in the meadow
    else if (r() < 0.6) kind = 'tuft';
    else continue;
    // trees keep clear of the town's paths; tufts may come close
    if (kind !== 'tuft' && !free(x, z, 6)) continue;
    const s = kind === 'tuft' ? 0.7 + r() * 0.5 : kind === 'shrub' ? 0.8 + r() * 0.5 : 0.9 + r() * 0.6;
    kinds[kind].push({ x, y: habFloor(z) - 0.05, z, s, ry: r() * Math.PI * 2, rx: -Math.asin(Math.max(-0.98, Math.min(0.98, z / HAB_R))), tint: 0.88 + r() * 0.24 });
  }
  // (the camera roams the whole floor, so the plain far ones take over patch by patch with distance, as on a
  // campus's land: full trees within 210 m at High, shrubs within 120, all plain on Low)
  for (const [k, at] of Object.entries(kinds)) {
    if (!at.length || k === 'tuft') continue;
    const reach = quality.plants < 0.5 ? 0 : (k === 'shrub' ? 120 : 210) * Math.min(1, 0.6 + quality.plants * 0.4);
    g.add(plantPatches(k as TreeKind, at, reach, { shadow: k !== 'shrub' }));
  }
  // the meadow's grass: clumps of blades, swaying, in the land's own greens
  const tufts = kinds.tuft;
  if (tufts.length) {
    const im = new THREE.InstancedMesh(sharedClump(), grassMaterial('carpet'), tufts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    tufts.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(p.rx ?? 0, p.ry, 0));
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s * 1.5, p.s * 1.3, p.s * 1.5));
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.set(r() < 0.5 ? 0x86b84e : 0x6ea544).multiplyScalar(0.9 + r() * 0.2));
    });
    im.castShadow = false;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

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

let doorLeaf: THREE.BufferGeometry | null = null;
let doorHole: THREE.BufferGeometry | null = null;
let doorDark: THREE.MeshBasicMaterial | null = null;
/** A texture's pixels, small (for reading a colour off a model's surface). */
const texels = new WeakMap<object, ImageData | null>();
/** The colour of a surface where a ray met it: its vertex paint, its texture, or its material's own. */
function surfaceColour(hit: THREE.Intersection): THREE.Color {
  const mesh = hit.object as THREE.Mesh;
  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  const out = new THREE.Color(mat.color ?? 0xffffff);
  const vc = mesh.geometry.attributes.color;
  if (vc && mat.vertexColors && hit.face) return out.multiply(new THREE.Color(vc.getX(hit.face.a), vc.getY(hit.face.a), vc.getZ(hit.face.a)));
  const img = mat.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (img && hit.uv && typeof document !== 'undefined') {
    let px = texels.get(img);
    if (px === undefined) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      try { cx?.drawImage(img, 0, 0, 256, 256); px = cx?.getImageData(0, 0, 256, 256) ?? null; } catch { px = null; }
      texels.set(img, px);
    }
    if (px) {
      const u = ((hit.uv.x % 1) + 1) % 1, v0 = ((hit.uv.y % 1) + 1) % 1, v = mat.map!.flipY ? 1 - v0 : v0;
      const k = (Math.min(255, Math.floor(v * 256)) * 256 + Math.min(255, Math.floor(u * 256))) * 4;
      out.multiply(new THREE.Color().setRGB(px.data[k] / 255, px.data[k + 1] / 255, px.data[k + 2] / 255, THREE.SRGBColorSpace));
    }
  }
  return out;
}
type SceneryName = 'rock_a' | 'boulder_a';
const sceneryParts = (n: SceneryName) => modelParts(n);
/** A scenery model's material, lightened (some Meshy textures come out darker than the land round them). Shared per source. */
const sceneryMats = new Map<string, THREE.Material>();
function sceneryMat(m: THREE.Material, light: number, tint?: [number, number, number]): THREE.Material {
  if (light === 1 && !tint) return m;
  const key = m.uuid + light + (tint ? tint.join() : '');
  let c = sceneryMats.get(key);
  if (!c) {
    c = m.clone();
    (c as THREE.MeshStandardMaterial).color?.setScalar(light);
    if (tint) (c as THREE.MeshStandardMaterial).color?.multiply(new THREE.Color(tint[0], tint[1], tint[2]));
    c.onBeforeCompile = m.onBeforeCompile;
    c.customProgramCacheKey = m.customProgramCacheKey;
    c.userData.shared = true;
    sceneryMats.set(key, c);
  }
  return c;
}
