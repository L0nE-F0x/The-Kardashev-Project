import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Game } from '../../game/game';
import type { Scene, PixelPointer } from '../stage';
import type { MapLod } from '../../world/mapData';
import { sampleRegionCode } from '../../world/mapData';
import { CHOKEPOINTS } from '../../world/routing';
import { REGION_BY_CODE, CODE_BY_REGION } from '../../content/mapcodes';
import { REGIONS } from '../../content/regions';
import { CHARTER_HQ, SITES, siteDef } from '../../content/sites';
import type { GameState, Shipment } from '../../sim/types';
import { builderColor } from '../../sim/charterView';
import { closedChokepoints } from '../../sim/effects';
import { C, getEra, hex } from '../palette';
import { PixelCanvas } from '../pixels';
import { cachedTexture, labelTexture, refreshTexture, releaseTexture, textureOf } from '../textures';
import { renderBloom, renderBorders, renderTerrain } from './terrain';
import { lightPoints, renderLights, renderNight, type LightPoint } from './night';
import {
  cableShipTexture,
  cargoShipTexture,
  chokepointTexture,
  cloudTexture,
  cutMarkTexture,
  facilityIconTexture,
  pixelTexture,
  planeTexture,
  rivalCampusTexture,
  selectionTexture,
  shipTexture,
} from '../sprites/mapIcons';
import { hash2 } from '../pixels';
import {
  actOf,
  cableDraws,
  LANES,
  lanePath,
  laneShip,
  paintNetwork,
  rivalsAt,
  seaPath,
  siteGlyphs,
  siteMarker,
  siteTrack,
  siteVisible,
  trackAt,
  trackPixels,
  type CableDraw,
  type Px,
} from './act2Layers';
import {
  act3Label,
  act3On,
  anchorGlyphs,
  anchorKey,
  charterView,
  craneSpots,
  hvdcDraws,
  hvdcKey,
  hvdcTrack,
  launchFrame,
  liftoffActive,
  markerOrigin,
  megaCranes,
  megaPatchCanvas,
  megaPatchKey,
  megaPatchLights,
  orbitAngle,
  orbitPoint,
  paintHvdc,
  paintOrbit,
  rowSpots,
  spaceSolarSpot,
  type HvdcTrack,
} from './act3Layers';
import {
  anchorGlyphTexture,
  beamTexture,
  converterTexture,
  craneTexture,
  pulse2Texture,
  rocketTexture,
  satelliteTexture,
  spaceSolarTexture,
} from '../sprites/charterIcons';
import {
  act4Lights,
  act4On,
  aiBanners,
  bannerSpot,
  glyphRow4,
  paintProvinces,
  paintSupergrid,
  planetView,
  provinceKey,
  rectennaKey,
  rectennaPatch,
  sgDownPixels,
  sgDraws,
  sgFlow,
  sgKey,
  siteGlyphs4,
  siteGlyphs4Key,
} from './act4Layers';
import { aiBannerTexture, dacTexture, fusionTexture, sgPulseTexture, terminalTexture } from '../sprites/act4Icons';

/** The map tools this scene draws previews for ('fiber' arrives with Act II). */
type AnyTool = { kind: string; from: string | null } | null;

/** Act II network layer (cables + fiber) per LOD, painted into a full-map canvas. */
interface NetLayer {
  pc: PixelCanvas;
  tex: Texture;
  key: string;
}
const NET_CACHE: (NetLayer | null)[] = [null, null];
/** Solarpunk Bloom overlay per LOD (era 2+), painted the first time it's needed. */
const BLOOM_CACHE: (Texture | null)[] = [null, null];

/** Per-LOD textures, built lazily. */
interface LodLayer {
  lod: MapLod;
  terrain: Texture;
  borders: Texture;
  highlightPc: PixelCanvas;
  highlight: Texture;
  highlightCode: number;
  nightPc: PixelCanvas;
  night: Texture;
  lightsPc: PixelCanvas;
  lights: Texture;
  lightPts: LightPoint[];
}

/**
 * Copies of a full-map sprite for horizontal wrap-around. The camera sits in [0, W), and a wide
 * phone can show more than one map width at the zoomed-out level, so draw up to x = 3W.
 */
class WrapSprite {
  readonly sprites: Sprite[];
  constructor(parent: Container, tex: Texture, opts: { alpha?: number; blend?: 'multiply' | 'add' | 'normal' } = {}) {
    this.sprites = [-1, 0, 1, 2].map(() => {
      const s = new Sprite(tex);
      s.alpha = opts.alpha ?? 1;
      if (opts.blend) s.blendMode = opts.blend;
      parent.addChild(s);
      return s;
    });
  }
  setTexture(tex: Texture, W: number) {
    this.sprites.forEach((s, i) => {
      s.texture = tex;
      s.x = (i - 1) * W;
    });
  }
}

const LAT_TOP = 84;
/** LOD layers are expensive to paint, so they outlive individual scene instances. */
const LAYER_CACHE: (LodLayer | null)[] = [null, null];
const LAT_BOTTOM = -62;

export class MapScene implements Scene {
  readonly root = new Container();
  private readonly world = new Container();
  private readonly terrainL = new Container();
  private readonly overlayL = new Container();
  private readonly cloudL = new Container();
  private readonly linkG = new Graphics();
  /** Act II: cables + fiber (full-map texture), cut cables blinking, pulses along them. */
  private readonly netL = new Container();
  private readonly cutG = new Graphics();
  private readonly netPulseL = new Container();
  /** Act III: megaproject ground (under the night shade), HVDC pulses, things in the sky. */
  private readonly megaL = new Container();
  private readonly hvdcPulseL = new Container();
  private readonly skyL = new Container();
  private readonly stationL = new Container();
  private readonly routeG = new Graphics();
  private readonly pulseL = new Container();
  private readonly chokeL = new Container();
  private readonly markerL = new Container();
  private readonly shipL = new Container();
  private readonly labelL = new Container();
  private readonly previewG = new Graphics();
  private readonly selSprite = new Sprite();

  private lodIndex = 0;
  private terrain!: WrapSprite;
  private borders!: WrapSprite;
  private highlight!: WrapSprite;
  private night!: WrapSprite;
  private lights!: WrapSprite;
  private vw = 640;
  private vh = 360;
  private camX = 0;
  private camY = 0;
  private targetX: number | null = null;
  private cine: { x0: number; y0: number; x1: number; y1: number; t: number; secs: number } | null = null;
  private targetY: number | null = null;
  private lastNight = 0;
  private time = 0;
  private clouds: { lon: number; lat: number; v: number; sprite: Sprite; shadow: Sprite }[] = [];
  private markers = new Map<string, { sprite: Sprite; icons: Sprite[]; label: Sprite | null; key: string; lift: boolean }>();
  private chokeSprites = new Map<string, Sprite>();
  private regionLabels: Sprite[] = [];
  private pulses: { sprite: Sprite; tail: Sprite | null; link: string; t: number }[] = [];
  // ── Act II ──
  private net: WrapSprite | null = null;
  private tracks = new Map<string, Px[]>();
  private netPulses: { sprite: Sprite; track: string; t: number; speed: number }[] = [];
  private netPulseKey = '';
  private cutKey = '';
  private rivalSprites = new Map<string, Sprite>();
  private cutSprites = new Map<string, { mark: Sprite; ship: Sprite }>();
  private layShips = new Map<string, Sprite>();
  private traffic: Sprite[] = [];
  private shipSprites = new Map<string, Sprite>();
  private linkKey = '';
  private routeKey = '';
  // ── Act III ──
  private megaSprites = new Map<string, { sprite: Sprite; key: string; tex: Texture | null; ox: number; oy: number; lights: LightPoint[] }>();
  private megaCraneSprites: { sprite: Sprite; site: string; i: number }[] = [];
  private megaCraneKey = '';
  private hvdcTracks = new Map<string, HvdcTrack>();
  private hvdcPulses: { sprite: Sprite; tail: Sprite; id: string; t: number; speed: number }[] = [];
  private hvdcPulseKey = '';
  private hvdcSprites: { sprite: Sprite; id: string; at: 'a' | 'b' | 'head' }[] = [];
  private hvdcSpriteKey = '';
  private anchorSprites: { sprite: Sprite; lat: number; lon: number; dx: number; dy: number }[] = [];
  private anchorSpriteKey = '';
  private satSprite: Sprite | null = null;
  private solarSprite: Sprite | null = null;
  private beamSprite: Sprite | null = null;
  private rocketSprite: Sprite | null = null;
  private puffSprites: Sprite[] = [];
  private bloom: WrapSprite | null = null;
  private bloomLod = -1;
  /** The Charter view the mega layers were last built from (rebuild keys only when it changes). */
  private megaView: unknown = null;
  private megaLod = -1;
  private charterSeen: unknown = null;
  private charterLod = -1;
  // ── Act IV ──
  /** Province greening + heat haze (two shimmer phases), supergrid faults, aurora pulses. */
  private readonly planetGroundL = new Container();
  private readonly sgDownG = new Graphics();
  private readonly sgPulseL = new Container();
  private province: { lod: number; key: string; pcs: [PixelCanvas, PixelCanvas]; texs: [Texture, Texture]; wrap: WrapSprite; built: number } | null = null;
  private rectennaSprites: { sprite: Sprite; tex: Texture; lat: number; lon: number; ox: number; oy: number }[] = [];
  private rectennaSpriteKey = '';
  private glyph4Sprites: { sprite: Sprite; site: string; i: number; kind: 'fusion' | 'dac'; building: boolean; progress: number }[] = [];
  private glyph4Key = '';
  private bannerSprites: { sprite: Sprite; ai: NonNullable<ReturnType<typeof aiBanners>[number]['ai']>; color: ReturnType<typeof aiBanners>[number]['color']; lat: number; lon: number }[] = [];
  private bannerKey = '';
  private sgSprites: { sprite: Sprite; id: string; at: 'a' | 'b' | 'head' }[] = [];
  private sgSpriteKey = '';
  private sgPulses: { sprite: Sprite; tail: Sprite; id: string; t: number; speed: number; dir: 1 | -1 }[] = [];
  private sgPulseKey = '';
  private sgDownKey = '';
  private sgFlowAt = -1e9;
  private planetSeen: unknown = null;
  private planetLod = -1;
  /** Night lights from fusion plants and rectennas, for the LOD they were worked out for. */
  private planetLights: { lod: number; pts: LightPoint[] } = { lod: -1, pts: [] };
  // input
  private down: { x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private lastWheel = 0;
  private cursor: { x: number; y: number } | null = null;
  private lastClick = { t: 0, site: '' };
  /** Sea routes (A*) are worked out lazily, at most one per frame. */
  private routeBudget = 1;

  constructor(private readonly game: Game) {
    this.root.addChild(this.world);
    this.world.addChild(this.terrainL, this.megaL, this.planetGroundL, this.overlayL, this.netL, this.cutG, this.sgDownG, this.netPulseL, this.hvdcPulseL, this.sgPulseL, this.cloudL, this.routeG, this.linkG, this.pulseL, this.stationL, this.chokeL, this.markerL, this.shipL, this.skyL, this.previewG, this.selSprite, this.labelL);
    const initial = this.layer(0);
    this.terrain = new WrapSprite(this.terrainL, initial.terrain);
    this.borders = new WrapSprite(this.overlayL, initial.borders, { alpha: 0.32 });
    this.highlight = new WrapSprite(this.overlayL, initial.highlight, { alpha: 0.55 });
    this.night = new WrapSprite(this.overlayL, initial.night, { blend: 'multiply' });
    this.lights = new WrapSprite(this.overlayL, initial.lights);
    this.applyLod();
    this.buildClouds();
    // start centred on the player's home, or the Atlantic on the title screen
    const home = game.view ? siteDef(game.view.company.homeSite) : null;
    this.centreOn(home ? home.lon : -20, home ? home.lat : 25);
    // pre-build the detailed LOD while the player looks around
    setTimeout(() => this.layer(1), 400);
  }

  // ── LOD management ────────────────────────────────────────────────────────────────────────
  private layer(i: number): LodLayer {
    const existing = LAYER_CACHE[i];
    if (existing) return existing;
    const lod = this.game.world.lods[i];
    const nightPc = renderNight(lod, new Date());
    const lightPts = lightPoints(lod);
    const lightsPc = renderLights(lod, nightPc, lightPts);
    const highlightPc = new PixelCanvas(lod.W, lod.H);
    const L: LodLayer = {
      lod,
      terrain: textureOf(renderTerrain(lod)),
      borders: textureOf(renderBorders(lod)),
      highlightPc,
      highlight: textureOf(highlightPc),
      highlightCode: -1,
      nightPc,
      night: textureOf(nightPc),
      lightsPc,
      lights: textureOf(lightsPc),
      lightPts,
    };
    LAYER_CACHE[i] = L;
    return L;
  }

  private get L(): LodLayer {
    return this.layer(this.lodIndex);
  }

  private get lod(): MapLod {
    return this.L.lod;
  }

  private applyLod() {
    const L = this.L;
    const W = L.lod.W;
    this.terrain.setTexture(L.terrain, W);
    this.borders.setTexture(L.borders, W);
    this.highlight.setTexture(L.highlight, W);
    this.night.setTexture(L.night, W);
    this.lights.setTexture(L.lights, W);
    this.refreshNight(true);
    this.linkKey = '';
    this.routeKey = '';
    this.markers.forEach((m) => (m.key = ''));
    this.tracks.clear();
    this.netPulseKey = '';
    this.cutKey = '';
    this.hvdcTracks.clear();
    this.hvdcPulseKey = '';
    this.hvdcSpriteKey = '';
    this.anchorSpriteKey = '';
    this.megaCraneKey = '';
    this.sgSpriteKey = '';
    this.sgPulseKey = '';
    this.sgDownKey = '';
    this.rectennaSpriteKey = '';
    this.bloomLod = -1;
    if (this.net) this.net.setTexture(this.netLayer().tex, W);
    this.rebuildRegionLabels();
    for (const c of this.clouds) this.placeCloud(c);
  }

  private setLod(i: number, anchor?: { x: number; y: number }) {
    if (i === this.lodIndex || i < 0 || i >= this.game.world.lods.length) return;
    const ax = anchor?.x ?? this.vw / 2;
    const ay = anchor?.y ?? this.vh / 2;
    const res0 = this.lod.res;
    const lon = (this.camX + ax) * res0 - 180;
    const lat = 90 - (this.camY + ay) * res0;
    this.lodIndex = i;
    this.applyLod();
    const res1 = this.lod.res;
    this.camX = (lon + 180) / res1 - ax;
    this.camY = (90 - lat) / res1 - ay;
    this.targetX = this.targetY = null;
    this.clampCam();
  }

  zoomIn(anchor?: { x: number; y: number }) {
    this.setLod(this.lodIndex + 1, anchor);
  }

  zoomOut(anchor?: { x: number; y: number }) {
    this.setLod(this.lodIndex - 1, anchor);
  }

  // ── camera ────────────────────────────────────────────────────────────────────────────────
  /** Menu cinematic: glide from one point to another over `secs`, at a given zoom level. */
  cinematic(from: [number, number], to: [number, number], secs: number, lod: number) {
    if (lod !== this.lodIndex) {
      this.lodIndex = Math.max(0, Math.min(this.game.world.lods.length - 1, lod));
      this.applyLod();
    }
    const res = this.lod.res;
    const x0 = (from[0] + 180) / res - this.vw / 2;
    const y0 = (90 - from[1]) / res - this.vh / 2;
    let x1 = (to[0] + 180) / res - this.vw / 2;
    const y1 = (90 - to[1]) / res - this.vh / 2;
    const W = this.lod.W;
    if (x1 - x0 > W / 2) x1 -= W;
    else if (x0 - x1 > W / 2) x1 += W;
    this.cine = { x0, y0, x1, y1, t: 0, secs };
    this.camX = x0;
    this.camY = y0;
    this.clampCam();
  }

  /** Client (CSS px) position of a `site:<id>` marker, for the tutorial spotlight. */
  locate(target: string): { x: number; y: number } | null {
    if (!target.startsWith('site:')) return null;
    const id = target.slice(5);
    if (!siteDef(id)) return null;
    const p = this.sitePx(id);
    const stage = this.game.stage;
    const rect = stage.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const ix = p.x - this.camX;
    const iy = p.y - this.camY - 4;
    if (ix < -20 || iy < -20 || ix > this.vw + 20 || iy > this.vh + 20) return null;
    return { x: rect.left + (ix * stage.scale) / dpr, y: rect.top + (iy * stage.scale) / dpr };
  }

  centreOn(lon: number, lat: number, animate = false) {
    const x = (lon + 180) / this.lod.res - this.vw / 2;
    const y = (90 - lat) / this.lod.res - this.vh / 2;
    if (animate) {
      // take the short way around the wrap
      const W = this.lod.W;
      let dx = x - this.camX;
      dx = ((dx % W) + W * 1.5) % W - W / 2;
      this.targetX = this.camX + dx;
      this.targetY = y;
    } else {
      this.camX = x;
      this.camY = y;
    }
    this.clampCam();
  }

  private clampCam() {
    const res = this.lod.res;
    const top = (90 - LAT_TOP) / res;
    const bottom = (90 - LAT_BOTTOM) / res;
    const H = this.lod.H;
    if (bottom - top > this.vh) this.camY = Math.max(top, Math.min(bottom - this.vh, this.camY));
    // a view taller than the playable band reveals more of the poles before any empty space
    else if (H > this.vh) this.camY = Math.max(0, Math.min(H - this.vh, (top + bottom) / 2 - this.vh / 2));
    else this.camY = H / 2 - this.vh / 2;
    const W = this.lod.W;
    if (this.camX < 0 || this.camX >= W) {
      const shift = Math.floor(this.camX / W) * W;
      this.camX -= shift;
      if (this.targetX !== null) this.targetX -= shift;
    }
  }

  subpixel() {
    return { x: this.camX - Math.floor(this.camX), y: this.camY - Math.floor(this.camY) };
  }

  resize(w: number, h: number) {
    const cx = this.camX + this.vw / 2;
    const cy = this.camY + this.vh / 2;
    this.vw = w;
    this.vh = h;
    this.camX = cx - w / 2;
    this.camY = cy - h / 2;
    this.clampCam();
  }

  /** World x of a longitude, shifted by whole map widths to sit nearest the camera centre. */
  private wrapX(x: number): number {
    const W = this.lod.W;
    const centre = this.camX + this.vw / 2;
    return x + Math.round((centre - x) / W) * W;
  }

  private proj(lon: number, lat: number): { x: number; y: number } {
    return { x: (lon + 180) / this.lod.res, y: (90 - lat) / this.lod.res };
  }

  // ── per-frame ─────────────────────────────────────────────────────────────────────────────
  update(dt: number, now: number) {
    this.time += dt;
    if (this.cine) {
      // menu cinematic: an eased glide between two points
      this.cine.t = Math.min(1, this.cine.t + dt / this.cine.secs);
      const e = this.cine.t * this.cine.t * (3 - 2 * this.cine.t);
      this.camX = this.cine.x0 + (this.cine.x1 - this.cine.x0) * e;
      this.camY = this.cine.y0 + (this.cine.y1 - this.cine.y0) * e;
      this.clampCam();
    }
    const st = this.game.settings;
    this.cloudL.visible = st.clouds;
    this.night.sprites.forEach((sp) => (sp.visible = st.dayNight));
    this.lights.sprites.forEach((sp) => (sp.visible = st.dayNight));
    if (this.targetX !== null && this.targetY !== null) {
      const k = 1 - Math.pow(0.001, dt);
      this.camX += (this.targetX - this.camX) * k;
      this.camY += (this.targetY - this.camY) * k;
      if (Math.abs(this.targetX - this.camX) < 0.3 && Math.abs(this.targetY - this.camY) < 0.3) this.targetX = this.targetY = null;
      this.clampCam();
    }
    this.world.position.set(-Math.floor(this.camX), -Math.floor(this.camY));
    if (now - this.lastNight > 30_000) this.refreshNight(false);
    this.updateClouds(dt);
    this.updateBloom();
    this.routeBudget = 1;
    this.updateHighlight();
    this.updateMarkers();
    this.updateRivals();
    this.updateNetwork(dt);
    this.updateCharter(dt);
    this.updatePlanet(dt);
    this.updateLinks();
    this.updateRoutes();
    this.updateShips();
    this.updateTraffic();
    this.updatePulses(dt);
    this.updateChokepoints();
    this.updateSelection();
    this.updatePreview();
    this.updateLabelsWrap();
  }

  private refreshNight(force: boolean) {
    const L = this.L;
    this.lastNight = performance.now();
    renderNight(L.lod, new Date(), L.nightPc);
    refreshTexture(L.night);
    this.refreshLights();
    void force;
  }

  /** City lights, plus (Act III) the megaprojects' lights, on the night side. */
  private refreshLights() {
    const L = this.L;
    let pts = L.lightPts;
    // (the patches' lights are in the current LOD's pixels only once they've been rebuilt for it)
    if (this.megaSprites.size && this.megaLod === this.lodIndex) {
      const extra: LightPoint[] = [];
      for (const m of this.megaSprites.values()) if (m.tex) extra.push(...m.lights);
      if (extra.length) pts = [...L.lightPts, ...extra];
    }
    // Act IV: fusion plants and rectenna receivers glow on the night side
    if (this.planetLights.lod === this.lodIndex && this.planetLights.pts.length) pts = [...pts, ...this.planetLights.pts];
    renderLights(L.lod, L.nightPc, pts, L.lightsPc);
    refreshTexture(L.lights);
  }

  /** Solarpunk Bloom (era 2+): the regreened Sahel, shelterbelts and regrown woods over the terrain. */
  private updateBloom() {
    if (getEra() < 2) {
      if (this.bloom) for (const sp of this.bloom.sprites) sp.visible = false;
      return;
    }
    let tex = BLOOM_CACHE[this.lodIndex];
    if (!tex) {
      tex = textureOf(renderBloom(this.lod));
      BLOOM_CACHE[this.lodIndex] = tex;
    }
    if (!this.bloom) this.bloom = new WrapSprite(this.terrainL, tex);
    if (this.bloomLod !== this.lodIndex) {
      this.bloom.setTexture(tex, this.lod.W);
      this.bloomLod = this.lodIndex;
    }
    for (const sp of this.bloom.sprites) sp.visible = true;
  }

  private buildClouds() {
    for (let i = 0; i < 22; i++) {
      const v = i % 6;
      const shadow = new Sprite(cloudTexture(v, true));
      shadow.alpha = 0.18;
      const sprite = new Sprite(cloudTexture(v, false));
      sprite.alpha = 0.8;
      this.cloudL.addChild(shadow, sprite);
      const c = { lon: hash2(i, 1, 51) * 360 - 180, lat: hash2(i, 2, 52) * 120 - 55, v: 0.04 + hash2(i, 3, 53) * 0.05, sprite, shadow };
      this.clouds.push(c);
      this.placeCloud(c);
    }
  }

  private placeCloud(c: (typeof this.clouds)[number]) {
    const p = this.proj(c.lon, c.lat);
    const x = Math.floor(this.wrapX(p.x));
    const y = Math.floor(p.y);
    c.sprite.position.set(x, y);
    c.shadow.position.set(x + 2, y + 3);
  }

  private updateClouds(dt: number) {
    const still = this.game.settings.reducedMotion;
    for (const c of this.clouds) {
      if (!still) c.lon += c.v * dt;
      if (c.lon > 180) c.lon -= 360;
      this.placeCloud(c);
    }
  }

  private hoverRegionCode(): number {
    const g = this.game;
    if (g.hover?.kind === 'region') return CODE_BY_REGION[g.hover.id];
    if (g.selection?.kind === 'region') return CODE_BY_REGION[g.selection.id];
    return -1;
  }

  private updateHighlight() {
    const L = this.L;
    const code = this.hoverRegionCode();
    if (code === L.highlightCode) return;
    L.highlightCode = code;
    if (code < 0) L.highlightPc.data.fill(0);
    else {
      const pc = renderBorders(L.lod, code);
      // keep only the highlight pixels (white), not the borders
      for (let i = 0; i < pc.data.length; i++) L.highlightPc.data[i] = pc.data[i] === C.white ? C.white : 0;
    }
    refreshTexture(L.highlight);
  }

  // ── markers ───────────────────────────────────────────────────────────────────────────────
  private updateMarkers() {
    const g = this.game;
    const s = g.view;
    const act2 = actOf(s).act >= 2;
    const hoveredSite = g.hover?.kind === 'site' ? g.hover.id : null;
    const selectedSite = g.selection?.kind === 'site' ? g.selection.id : null;
    const tool = g.tool as AnyTool;
    const fine = this.lodIndex >= 1;
    // Act III: the rocket leaves its pad while the liftoff replays
    const act3 = act3On(s);
    const flying = act3 && !g.settings.reducedMotion && liftoffActive(charterView(s), s!.day);
    for (const site of SITES) {
      let m = this.markers.get(site.id);
      if (!siteVisible(site, s)) {
        // Act II sites stay hidden until the act (and phase) opens them
        if (m) {
          m.sprite.visible = false;
          m.icons.forEach((ic) => ic.destroy());
          m.icons = [];
          m.label?.destroy();
          m.label = null;
          m.key = '';
        }
        continue;
      }
      if (!m) {
        const sprite = new Sprite();
        this.markerL.addChild(sprite);
        m = { sprite, icons: [], label: null, key: '', lift: false };
        this.markers.set(site.id, m);
      }
      m.sprite.visible = true;
      const glyphs = siteGlyphs(s, site.id);
      const hovered = hoveredSite === site.id;
      const showLabel = hovered || selectedSite === site.id || (fine && glyphs.length > 0) || (fine && act3 && act3Label(site, s)) || ((tool?.kind === 'link' || tool?.kind === 'fiber') && tool.from === site.id);
      const marker = siteMarker(site, s, hovered, g.mode === 'title', { flying });
      const key = `${this.lodIndex}|${hovered}|${showLabel}|${glyphs.map((f) => `${f.type}${f.building ? 'b' : ''}${f.upgrade ? 'u' : ''}${f.tier}`).join(',')}|${marker.key}|${act2}`;
      const p = this.proj(site.lon, site.lat);
      const x = Math.floor(this.wrapX(p.x));
      const y = Math.floor(p.y);
      if (key !== m.key) {
        m.key = key;
        m.sprite.texture = cachedTexture(marker.key, marker.make);
        m.lift = marker.lift;
        m.icons.forEach((ic) => ic.destroy());
        m.icons = [];
        if (fine || hovered) {
          for (const e of glyphs) {
            // Act II shows construction and upgrades with a tiny crane; Act I keeps its hazard tape
            const ic = new Sprite(facilityIconTexture(e.type, e.building, { upgrade: e.upgrade, tier: e.tier, crane: act2 }));
            this.markerL.addChild(ic);
            m.icons.push(ic);
          }
        }
        if (m.label) {
          m.label.destroy();
          m.label = null;
        }
        if (showLabel) {
          m.label = new Sprite(labelTexture(site.kind === 'build' ? site.name.toUpperCase() : site.name.split('·')[0].trim().toUpperCase(), hovered ? C.yel1 : C.white, C.ink0));
          this.labelL.addChild(m.label);
        }
      }
      const tex = m.sprite.texture;
      m.sprite.position.set(x - Math.floor(tex.width / 2), y - (m.lift ? tex.height - 1 : Math.floor(tex.height / 2)));
      // facility glyphs in a row under the marker, bottoms aligned (cranes poke up)
      const total = m.icons.reduce((n, ic) => n + ic.texture.width + 1, 0);
      let ix = x - Math.floor(total / 2);
      for (const ic of m.icons) {
        ic.position.set(ix, y + 10 - ic.texture.height);
        ix += ic.texture.width + 1;
      }
      if (m.label) m.label.position.set(x - Math.floor(m.label.texture.width / 2), m.sprite.y - m.label.texture.height - 1);
    }
  }

  /** Rival campuses: small markers in their colours, beside the site's own marker. */
  private updateRivals() {
    const s = this.game.view;
    const alive = new Set<string>();
    if (s && actOf(s).act >= 2) {
      const bySite = new Set((s.rivalBuilds ?? []).map((r) => r.siteId));
      for (const siteId of bySite) {
        const site = siteDef(siteId);
        if (!siteVisible(site, s)) continue;
        const p = this.proj(site.lon, site.lat);
        const x = Math.floor(this.wrapX(p.x));
        const y = Math.floor(p.y);
        const lift = this.markers.get(siteId)?.lift ?? false;
        let rx = x + (lift ? 5 : 3);
        const ry = y - (lift ? 10 : 7);
        for (const r of rivalsAt(s, siteId)) {
          const k = `${siteId}:${r.owner}`;
          alive.add(k);
          let sp = this.rivalSprites.get(k);
          if (!sp) {
            sp = new Sprite();
            this.markerL.addChild(sp);
            this.rivalSprites.set(k, sp);
          }
          sp.texture = rivalCampusTexture(r.owner, r.building);
          sp.position.set(rx, ry);
          rx += sp.texture.width - 1;
        }
      }
    }
    for (const [k, sp] of this.rivalSprites) {
      if (!alive.has(k)) {
        sp.destroy();
        this.rivalSprites.delete(k);
      }
    }
  }

  private rebuildRegionLabels() {
    this.regionLabels.forEach((s) => s.destroy());
    this.regionLabels = [];
    if (this.lodIndex !== 0) return;
    for (const r of Object.values(REGIONS)) {
      const sp = new Sprite(labelTexture(r.name.toUpperCase(), C.ink9, C.ink0));
      sp.alpha = 0.85;
      (sp as Sprite & { lonlat?: [number, number] }).lonlat = [r.label.lon, r.label.lat];
      this.labelL.addChild(sp);
      this.regionLabels.push(sp);
    }
  }

  private updateLabelsWrap() {
    for (const sp of this.regionLabels) {
      const [lon, lat] = (sp as Sprite & { lonlat: [number, number] }).lonlat;
      const p = this.proj(lon, lat);
      sp.position.set(Math.floor(this.wrapX(p.x) - sp.texture.width / 2), Math.floor(p.y));
    }
  }

  // ── links & routes ────────────────────────────────────────────────────────────────────────
  private pixelLine(g: Graphics, x0: number, y0: number, x1: number, y1: number, color: number, dash = 0, gap = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let i = 0;
    for (;;) {
      if (!dash || i % (dash + gap) < dash) g.rect(x0, y0, 1, 1);
      i++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    g.fill(color);
  }

  private sitePx(id: string): { x: number; y: number } {
    const s = siteDef(id);
    const p = this.proj(s.lon, s.lat);
    return { x: this.wrapX(p.x), y: p.y };
  }

  private updateLinks() {
    const s = this.game.view;
    const links = s?.links ?? [];
    const act2 = actOf(s).act >= 2;
    const key = `${this.lodIndex}|${Math.round(this.camX / 50)}|${links.map((l) => l.id + l.status).join(',')}|${act2}`;
    if (key === this.linkKey) return;
    this.linkKey = key;
    this.linkG.clear();
    for (const l of links) {
      const a = this.sitePx(l.a);
      const b = this.sitePx(l.b);
      // shortest way around
      let bx = b.x;
      const W = this.lod.W;
      if (bx - a.x > W / 2) bx -= W;
      else if (a.x - bx > W / 2) bx += W;
      if (l.status === 'online') {
        this.pixelLine(this.linkG, a.x + 1, a.y + 1, bx + 1, b.y + 1, hex(C.ink0));
        this.pixelLine(this.linkG, a.x, a.y, bx, b.y, hex(C.yel0));
      } else {
        // under construction: bold dashes with a drop shadow so they read on any terrain
        this.pixelLine(this.linkG, a.x + 1, a.y + 1, bx + 1, b.y + 1, hex(C.ink0), 3, 2);
        this.pixelLine(this.linkG, a.x, a.y, bx, b.y, hex(C.org2), 3, 2);
      }
    }
    // reset pulses
    this.pulses.forEach((p) => {
      p.sprite.destroy();
      p.tail?.destroy();
    });
    this.pulses = [];
    for (const l of links) {
      if (l.status !== 'online') continue;
      // Act II: three power "comets" per line, a bright head with a warm tail
      const n = act2 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        let tail: Sprite | null = null;
        if (act2) {
          tail = new Sprite(pixelTexture());
          tail.tint = hex(C.yel2);
          this.pulseL.addChild(tail);
        }
        const sp = new Sprite(pixelTexture());
        sp.tint = hex(C.white);
        this.pulseL.addChild(sp);
        this.pulses.push({ sprite: sp, tail, link: l.id, t: k / n });
      }
    }
  }

  private updatePulses(dt: number) {
    const s = this.game.view;
    if (!s) return;
    for (const p of this.pulses) {
      const l = s.links.find((x) => x.id === p.link);
      if (!l) continue;
      p.t = (p.t + dt * (40 / Math.max(20, l.km / this.lod.res / 111))) % 1;
      const a = this.sitePx(l.a);
      const b = this.sitePx(l.b);
      let bx = b.x;
      const W = this.lod.W;
      if (bx - a.x > W / 2) bx -= W;
      else if (a.x - bx > W / 2) bx += W;
      p.sprite.position.set(Math.round(a.x + (bx - a.x) * p.t), Math.round(a.y + (b.y - a.y) * p.t));
      if (p.tail) {
        const len = Math.max(1, Math.hypot(bx - a.x, b.y - a.y));
        const tt = Math.max(0, p.t - 1.6 / len);
        p.tail.position.set(Math.round(a.x + (bx - a.x) * tt), Math.round(a.y + (b.y - a.y) * tt));
      }
    }
  }

  // ── Act II network: subsea cables, fiber, cuts, pulses, cosmetic traffic ──────────────────
  private netLayer(): NetLayer {
    const i = this.lodIndex;
    let L = NET_CACHE[i];
    if (!L) {
      const pc = new PixelCanvas(this.lod.W, this.lod.H);
      L = { pc, tex: textureOf(pc), key: '' };
      NET_CACHE[i] = L;
    }
    return L;
  }

  /** A cable's map pixels, or null until its sea route has been worked out. */
  private cableTrack(c: { a: string; b: string }): Px[] | null {
    const id = `cable:${c.a}|${c.b}`;
    const hit = this.tracks.get(id);
    if (hit) return hit;
    const path = seaPath(this.game.world.router, c.a, c.b, undefined, false);
    if (!path) return null;
    const t = trackPixels(path, this.lod);
    this.tracks.set(id, t);
    return t;
  }

  private fiberTrack(a: string, b: string): Px[] {
    const id = `fiber:${a}|${b}`;
    let t = this.tracks.get(id);
    if (!t) {
      t = siteTrack(a, b, this.lod);
      this.tracks.set(id, t);
    }
    return t;
  }

  private clearNet() {
    this.netPulses.forEach((p) => p.sprite.destroy());
    this.netPulses = [];
    this.netPulseKey = '';
    this.cutSprites.forEach((e) => {
      e.mark.destroy();
      e.ship.destroy();
    });
    this.cutSprites.clear();
    this.layShips.forEach((sp) => sp.destroy());
    this.layShips.clear();
    this.cutG.clear();
    this.cutKey = '';
  }

  private updateNetwork(dt: number) {
    const s = this.game.view;
    const on = !!s && actOf(s).act >= 2;
    this.netL.visible = on;
    this.cutG.visible = on;
    this.netPulseL.visible = on && !this.game.settings.reducedMotion;
    if (!s || !on) {
      if (this.netPulses.length || this.cutSprites.size || this.layShips.size) this.clearNet();
      return;
    }
    const cables = cableDraws(s);
    // fill in one missing sea route per frame
    for (const c of cables) {
      if (this.cableTrack(c)) continue;
      if (this.routeBudget > 0) {
        this.routeBudget--;
        seaPath(this.game.world.router, c.a, c.b);
      }
      break;
    }
    if (!this.net) {
      this.net = new WrapSprite(this.netL, this.netLayer().tex);
      this.net.setTexture(this.netLayer().tex, this.lod.W);
    }
    const fiber = s.network?.fiber ?? [];
    const known = cables.filter((c) => this.tracks.has(`cable:${c.a}|${c.b}`)).length;
    // Act III: HVDC links and the orbital test's ground track share the network layer
    const cv = act3On(s) ? charterView(s) : null;
    const act3Key = cv ? `${hvdcKey(cv)}|${cv.orbitalTest}` : '';
    // Act IV: the supergrid paints over the HVDC links
    const pv = act4On(s) ? planetView(s) : null;
    const act4Key = pv ? sgKey(pv) : '';
    const key = `${known}|${cables.map((c) => `${c.id}:${c.kind}:${Math.floor(c.built * 40)}:${c.cut}`).join(',')}|${fiber.map((f) => f.id + f.status + f.a + f.b).join(',')}|${act3Key}|${act4Key}`;
    const L = this.netLayer();
    // while routes are still being worked out (a frame each), paint once at the start and once at the end
    if (L.key !== key && (known === cables.length || !L.key)) {
      L.key = key;
      L.pc.data.fill(0);
      paintNetwork(L.pc, this.lod, s, (c) => this.cableTrack(c));
      if (cv) {
        if (cv.orbitalTest) paintOrbit(L.pc, this.lod);
        paintHvdc(L.pc, this.lod, hvdcDraws(cv, this.lod, (h) => this.hvdcTrackOf(h.route)));
      }
      if (pv) paintSupergrid(L.pc, this.lod, sgDraws(pv, this.lod, (l) => this.hvdcTrackOf(l.route)));
      refreshTexture(L.tex);
    }
    this.updateCuts(cables);
    this.updateNetPulses(cables, dt, key);
  }

  /** An HVDC route's pixels at the current LOD (great circle, cached). */
  private hvdcTrackOf(route: { id: string; a: [number, number]; b: [number, number] }): HvdcTrack {
    let t = this.hvdcTracks.get(route.id);
    if (!t) {
      t = hvdcTrack(route, this.lod);
      this.hvdcTracks.set(route.id, t);
    }
    return t;
  }

  /** Cut cables blink bright red over their dark-red line; a cross and a repair ship mark the break. */
  private updateCuts(cables: CableDraw[]) {
    const cut = cables.filter((c) => c.cut && this.cableTrack(c));
    const key = `${this.lodIndex}|${Math.round(this.camX / 50)}|${cut.map((c) => c.id).join(',')}`;
    if (key !== this.cutKey) {
      this.cutKey = key;
      this.cutG.clear();
      const W = this.lod.W;
      for (const c of cut) {
        const t = this.cableTrack(c)!;
        const shift = this.wrapX(t[0].x) - t[0].x;
        for (const off of [-W, 0, W]) for (const p of t) this.cutG.rect(p.x + shift + off, p.y, 1, 1);
      }
      if (cut.length) this.cutG.fill(hex(C.red3));
    }
    const blinkOn = this.game.settings.reducedMotion || Math.floor(this.time * 2.5) % 2 === 0;
    this.cutG.alpha = blinkOn ? 1 : 0;
    const alive = new Set<string>();
    for (const c of cut) {
      alive.add(c.id);
      let e = this.cutSprites.get(c.id);
      if (!e) {
        e = { mark: new Sprite(cutMarkTexture()), ship: new Sprite(cableShipTexture()) };
        this.markerL.addChild(e.ship, e.mark);
        this.cutSprites.set(c.id, e);
      }
      const p = trackAt(this.cableTrack(c)!, 0.5);
      const x = Math.floor(this.wrapX(p.x));
      e.mark.position.set(x - 3, p.y - 3);
      e.mark.alpha = blinkOn ? 1 : 0.55;
      e.ship.position.set(x + 4, p.y - 2);
    }
    for (const [id, e] of this.cutSprites) {
      if (alive.has(id)) continue;
      e.mark.destroy();
      e.ship.destroy();
      this.cutSprites.delete(id);
    }
    // your own cables under construction: the cable ship sits at the end of the laid stretch
    const laying = new Set<string>();
    for (const c of cables) {
      if (c.kind !== 'own' || c.built >= 1 || c.cut) continue;
      const t = this.cableTrack(c);
      if (!t) continue;
      laying.add(c.id);
      let sp = this.layShips.get(c.id);
      if (!sp) {
        sp = new Sprite(cableShipTexture());
        this.shipL.addChild(sp);
        this.layShips.set(c.id, sp);
      }
      const i = Math.floor(c.built * (t.length - 1));
      const p = t[i];
      const ahead = t[Math.min(t.length - 1, i + 3)];
      const dir = ahead.x >= p.x ? 1 : -1;
      sp.scale.x = dir;
      sp.position.set(Math.round(this.wrapX(p.x) - (dir > 0 ? 3 : -3)), p.y - 3);
    }
    for (const [id, sp] of this.layShips) {
      if (laying.has(id)) continue;
      sp.destroy();
      this.layShips.delete(id);
    }
  }

  /** Data flowing along your leased/own cables and fiber. Hidden with reduced motion. */
  private updateNetPulses(cables: CableDraw[], dt: number, netKey: string) {
    const s = this.game.view!;
    const key = `${this.lodIndex}|${netKey}`;
    if (key !== this.netPulseKey) {
      this.netPulseKey = key;
      this.netPulses.forEach((p) => p.sprite.destroy());
      this.netPulses = [];
      const add = (track: string, n: number, color: number, speed: number) => {
        for (let k = 0; k < n; k++) {
          const sp = new Sprite(pixelTexture());
          sp.tint = hex(color);
          this.netPulseL.addChild(sp);
          this.netPulses.push({ sprite: sp, track, t: k / n + hash2(k, track.length, 7) * 0.2, speed });
        }
      };
      for (const c of cables) {
        if (c.cut || !(c.kind === 'leased' || (c.kind === 'own' && c.built >= 1)) || !this.cableTrack(c)) continue;
        add(`cable:${c.a}|${c.b}`, 3, C.white, 24);
      }
      for (const f of s.network?.fiber ?? []) {
        if (f.status !== 'online') continue;
        this.fiberTrack(f.a, f.b);
        add(`fiber:${f.a}|${f.b}`, 2, C.white, 32);
      }
    }
    if (this.game.settings.reducedMotion) return;
    for (const p of this.netPulses) {
      const t = this.tracks.get(p.track);
      if (!t || t.length < 2) {
        p.sprite.visible = false;
        continue;
      }
      p.t = (p.t + (dt * p.speed) / t.length) % 1;
      const q = trackAt(t, p.t);
      p.sprite.visible = true;
      p.sprite.position.set(Math.floor(this.wrapX(q.x)), q.y);
    }
  }

  /** Act II: extra cargo ships plying the busy lanes (cosmetic, not clickable). */
  private updateTraffic() {
    const s = this.game.view;
    if (!s || actOf(s).act < 2) {
      if (this.traffic.length) {
        this.traffic.forEach((sp) => sp.destroy());
        this.traffic = [];
      }
      return;
    }
    if (!this.traffic.length) {
      for (const lane of LANES) {
        const sp = new Sprite(cargoShipTexture(lane.cargo, lane.hull));
        sp.alpha = 0.9;
        this.shipL.addChildAt(sp, 0);
        this.traffic.push(sp);
      }
    }
    const router = this.game.world.router;
    const closed = closedChokepoints(s);
    const ck = [...closed].sort().join(',');
    const days = s.day + this.game.dayFraction();
    LANES.forEach((lane, i) => {
      const sp = this.traffic[i];
      const id = `lane:${lane.a}|${lane.b}|${ck}`;
      let t = this.tracks.get(id);
      if (!t) {
        let path = lanePath(router, lane, closed, false);
        if (!path && this.routeBudget > 0) {
          this.routeBudget--;
          path = lanePath(router, lane, closed, true);
        }
        if (path) {
          t = trackPixels(path, this.lod);
          this.tracks.set(id, t);
        }
      }
      const pos = t ? laneShip(t, days, lane, this.lod.res * 111) : null;
      if (!pos) {
        sp.visible = false;
        return;
      }
      sp.visible = true;
      sp.scale.x = pos.dir;
      sp.position.set(Math.round(this.wrapX(pos.p.x) - (pos.dir > 0 ? 3 : -3)), Math.round(pos.p.y - 2));
    });
  }

  // ── Act III: megaprojects, HVDC links, anchors, the launch and the orbit ─────────────────
  private clearCharter() {
    for (const m of this.megaSprites.values()) {
      m.sprite.destroy();
      if (m.tex) releaseTexture(m.tex);
    }
    const hadLights = [...this.megaSprites.values()].some((m) => m.lights.length);
    this.megaSprites.clear();
    this.megaView = null;
    this.charterSeen = null;
    if (hadLights) this.refreshLights();
    this.megaCraneSprites.forEach((c) => c.sprite.destroy());
    this.megaCraneSprites = [];
    this.megaCraneKey = '';
    this.hvdcPulses.forEach((p) => {
      p.sprite.destroy();
      p.tail.destroy();
    });
    this.hvdcPulses = [];
    this.hvdcPulseKey = '';
    this.hvdcSprites.forEach((h) => h.sprite.destroy());
    this.hvdcSprites = [];
    this.hvdcSpriteKey = '';
    this.anchorSprites.forEach((a) => a.sprite.destroy());
    this.anchorSprites = [];
    this.anchorSpriteKey = '';
    for (const sp of [this.satSprite, this.solarSprite, this.beamSprite, this.rocketSprite]) if (sp) sp.visible = false;
    this.puffSprites.forEach((p) => (p.visible = false));
  }

  private updateCharter(dt: number) {
    const s = this.game.view;
    if (!s || !act3On(s)) {
      const any = this.megaSprites.size || this.megaCraneSprites.length || this.hvdcPulses.length || this.hvdcSprites.length || this.anchorSprites.length;
      if (any || this.satSprite?.visible || this.solarSprite?.visible || this.rocketSprite?.visible || this.puffSprites.some((p) => p.visible)) this.clearCharter();
      return;
    }
    const v = charterView(s);
    // structure (which sprites exist) only changes with the view or the zoom level; positions every frame
    const fresh = v !== this.charterSeen || this.lodIndex !== this.charterLod;
    this.charterSeen = v;
    this.charterLod = this.lodIndex;
    this.updateMegaGround(v);
    this.updateMegaCranes(v, fresh);
    this.updateHvdcSprites(v, fresh);
    this.updateHvdcPulses(v, dt, fresh);
    this.updateAnchors(v, fresh);
    this.updateSky(v, s);
  }

  /** Megaproject footprints: one sprite per site, repainted when its stage or kinds change. */
  private updateMegaGround(v: ReturnType<typeof charterView>) {
    if (v !== this.megaView || this.megaLod !== this.lodIndex) {
      this.megaView = v;
      this.megaLod = this.lodIndex;
      let lightsChanged = false;
      for (const mv of v.megas) {
        const key = `${this.lodIndex}|${megaPatchKey(mv, this.lod.res)}`;
        let m = this.megaSprites.get(mv.siteId);
        if (!m) {
          const sprite = new Sprite();
          this.megaL.addChild(sprite);
          m = { sprite, key: '', tex: null, ox: 0, oy: 0, lights: [] };
          this.megaSprites.set(mv.siteId, m);
        }
        if (m.key === key) continue;
        m.key = key;
        const old = m.tex;
        const patch = megaPatchCanvas(siteDef(mv.siteId), mv, this.lod);
        m.tex = patch ? textureOf(patch.pc) : null;
        m.sprite.texture = m.tex ?? Texture.EMPTY;
        m.sprite.visible = !!patch;
        m.lights = [];
        if (patch) {
          m.ox = patch.ox;
          m.oy = patch.oy;
          // its night lights, in unwrapped map pixels
          const site = siteDef(mv.siteId);
          const sx = Math.floor((site.lon + 180) / this.lod.res) + patch.ox;
          const sy = Math.floor((90 - site.lat) / this.lod.res) + patch.oy;
          m.lights = megaPatchLights(patch.pc).map((p) => ({ x: sx + p.x, y: sy + p.y, c: p.c }));
        }
        if (old) releaseTexture(old);
        lightsChanged = true;
      }
      if (lightsChanged) this.refreshLights();
    }
    for (const [id, m] of this.megaSprites) {
      if (!m.tex) continue;
      const site = siteDef(id);
      const p = this.proj(site.lon, site.lat);
      m.sprite.position.set(Math.floor(this.wrapX(p.x)) + m.ox, Math.floor(p.y) + m.oy);
    }
  }

  /** Builder-coloured cranes beside each megaproject with work under way. */
  private updateMegaCranes(v: ReturnType<typeof charterView>, fresh: boolean) {
    const key = fresh ? v.megas.map((mv) => `${mv.siteId}:${megaCranes(mv).join('.')}`).join(',') : this.megaCraneKey;
    if (key !== this.megaCraneKey) {
      this.megaCraneKey = key;
      this.megaCraneSprites.forEach((c) => c.sprite.destroy());
      this.megaCraneSprites = [];
      for (const mv of v.megas) {
        megaCranes(mv).forEach((col, i) => {
          const sprite = new Sprite(craneTexture(col));
          this.markerL.addChild(sprite);
          this.megaCraneSprites.push({ sprite, site: mv.siteId, i });
        });
      }
    }
    for (const c of this.megaCraneSprites) {
      const marker = this.markers.get(c.site);
      if (!marker?.sprite.visible) {
        c.sprite.visible = false;
        continue;
      }
      const site = siteDef(c.site);
      const p = this.proj(site.lon, site.lat);
      const x = Math.floor(this.wrapX(p.x));
      const y = Math.floor(p.y);
      const tex = marker.sprite.texture;
      const sizes = this.megaCraneSprites.filter((o) => o.site === c.site).map((o) => ({ w: o.sprite.texture.width, h: o.sprite.texture.height }));
      const spot = craneSpots(x, y, tex.width, tex.height, sizes)[c.i];
      c.sprite.visible = true;
      c.sprite.position.set(spot.x, spot.y);
    }
  }

  /** Converter stations at both ends of every HVDC link, and the build head (a crane, or a cable ship at sea). */
  private updateHvdcSprites(v: ReturnType<typeof charterView>, fresh: boolean) {
    const key = fresh ? `${this.lodIndex}|${hvdcKey(v)}` : this.hvdcSpriteKey;
    if (key !== this.hvdcSpriteKey) {
      this.hvdcSpriteKey = key;
      this.hvdcSprites.forEach((h) => h.sprite.destroy());
      this.hvdcSprites = [];
      for (const h of v.hvdc) {
        const online = h.status === 'online';
        for (const at of ['a', 'b'] as const) {
          const sprite = new Sprite(converterTexture(online));
          this.stationL.addChild(sprite);
          this.hvdcSprites.push({ sprite, id: h.route.id, at });
        }
        if (!online) {
          const t = this.hvdcTrackOf(h.route);
          const i = Math.floor(h.progress * (t.pts.length - 1));
          const sprite = new Sprite(t.sea[i] ? cableShipTexture() : craneTexture(builderColor(h.builder), true));
          this.stationL.addChild(sprite);
          this.hvdcSprites.push({ sprite, id: h.route.id, at: 'head' });
        }
      }
    }
    for (const e of this.hvdcSprites) {
      const h = v.hvdc.find((x) => x.route.id === e.id);
      if (!h) continue;
      const t = this.hvdcTrackOf(h.route);
      const pts = t.pts;
      const tex = e.sprite.texture;
      if (e.at === 'head') {
        const i = Math.floor(h.progress * (pts.length - 1));
        const p = pts[i];
        const x = Math.floor(this.wrapX(p.x));
        if (t.sea[i]) e.sprite.position.set(x - 3, p.y - 3);
        else e.sprite.position.set(x - 2, p.y - tex.height + 1);
      } else {
        const p = e.at === 'a' ? pts[0] : pts[pts.length - 1];
        e.sprite.position.set(Math.floor(this.wrapX(p.x)) - Math.floor(tex.width / 2), p.y - tex.height + 2);
      }
    }
  }

  /** Power flowing along online HVDC links, from the megaproject end. Hidden with reduced motion. */
  private updateHvdcPulses(v: ReturnType<typeof charterView>, dt: number, fresh: boolean) {
    this.hvdcPulseL.visible = !this.game.settings.reducedMotion;
    const key = fresh ? `${this.lodIndex}|${hvdcKey(v)}` : this.hvdcPulseKey;
    const big = this.lodIndex >= 1;
    if (key !== this.hvdcPulseKey) {
      this.hvdcPulseKey = key;
      this.hvdcPulses.forEach((p) => {
        p.sprite.destroy();
        p.tail.destroy();
      });
      this.hvdcPulses = [];
      for (const h of v.hvdc) {
        if (h.status !== 'online') continue;
        const len = this.hvdcTrackOf(h.route).pts.length;
        const n = Math.max(2, Math.round(len / 40));
        for (let k = 0; k < n; k++) {
          const tail = new Sprite(big ? pulse2Texture() : pixelTexture());
          tail.tint = hex(C.yel0);
          const sprite = new Sprite(big ? pulse2Texture() : pixelTexture());
          sprite.tint = hex(C.white);
          this.hvdcPulseL.addChild(tail, sprite);
          this.hvdcPulses.push({ sprite, tail, id: h.route.id, t: k / n, speed: 28 });
        }
      }
    }
    if (this.game.settings.reducedMotion) return;
    for (const p of this.hvdcPulses) {
      const h = v.hvdc.find((x) => x.route.id === p.id);
      if (!h) continue;
      const pts = this.hvdcTrackOf(h.route).pts;
      if (pts.length < 2) continue;
      p.t = (p.t + (dt * p.speed) / pts.length) % 1;
      const q = trackAt(pts, p.t);
      const r = trackAt(pts, Math.max(0, p.t - 2.5 / pts.length));
      const shift = Math.floor(this.wrapX(q.x)) - q.x;
      p.sprite.position.set(q.x + shift, q.y);
      p.tail.position.set(r.x + shift, r.y);
    }
  }

  /** Public compute campuses, open cables and Commons lines, gathered at each bloc's anchor. */
  private updateAnchors(v: ReturnType<typeof charterView>, fresh: boolean) {
    const key = fresh ? anchorKey(v) : this.anchorSpriteKey;
    if (key !== this.anchorSpriteKey) {
      this.anchorSpriteKey = key;
      this.anchorSprites.forEach((a) => a.sprite.destroy());
      this.anchorSprites = [];
      for (const a of v.anchors) {
        const glyphs = anchorGlyphs(a).map((g) => anchorGlyphTexture(g.kind, g.builder, g.building));
        rowSpots(0, 0, glyphs.map((t) => ({ w: t.width, h: t.height }))).forEach((spot, i) => {
          const sprite = new Sprite(glyphs[i]);
          this.markerL.addChild(sprite);
          this.anchorSprites.push({ sprite, lat: a.lat, lon: a.lon, dx: spot.x, dy: spot.y });
        });
      }
    }
    for (const a of this.anchorSprites) {
      const p = this.proj(a.lon, a.lat);
      a.sprite.position.set(Math.floor(this.wrapX(p.x)) + a.dx, Math.floor(p.y) + a.dy);
    }
  }

  /** The orbital test satellite, the space-solar craft beaming down, and the liftoff replay. */
  private updateSky(v: ReturnType<typeof charterView>, s: GameState) {
    const still = this.game.settings.reducedMotion;
    // the orbital compute test crossing the map on its inclined orbit
    if (v.orbitalTest) {
      if (!this.satSprite) {
        this.satSprite = new Sprite(satelliteTexture());
        this.skyL.addChild(this.satSprite);
      }
      const g = orbitPoint(still ? 1.1 : orbitAngle(this.time));
      const p = this.proj(g.lon, g.lat);
      const tex = this.satSprite.texture;
      this.satSprite.position.set(Math.floor(this.wrapX(p.x)) - Math.floor(tex.width / 2), Math.floor(p.y) - Math.floor(tex.height / 2));
      this.satSprite.visible = true;
    } else if (this.satSprite) this.satSprite.visible = false;
    // the space-solar demonstrator hangs over the launch complex and beams power down
    const groundId = v.launch?.siteId ?? CHARTER_HQ;
    if (v.spaceSolar) {
      if (!this.solarSprite) {
        this.beamSprite = new Sprite();
        this.solarSprite = new Sprite(spaceSolarTexture());
        this.skyL.addChild(this.beamSprite, this.solarSprite);
      }
      const site = siteDef(groundId);
      const p = this.proj(site.lon, site.lat);
      const tex = this.solarSprite.texture;
      const bob = still ? 0 : Math.round(Math.sin(this.time * 1.3));
      const spot = spaceSolarSpot(Math.floor(this.wrapX(p.x)), Math.floor(p.y), tex.width, tex.height, bob);
      this.solarSprite.position.set(spot.craft.x, spot.craft.y);
      this.solarSprite.visible = true;
      this.beamSprite!.texture = beamTexture(spot.beam.len);
      this.beamSprite!.position.set(spot.beam.x, spot.beam.y);
      this.beamSprite!.alpha = still ? 0.45 : 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 2.2));
      this.beamSprite!.visible = true;
    } else {
      if (this.solarSprite) this.solarSprite.visible = false;
      if (this.beamSprite) this.beamSprite.visible = false;
    }
    // the cliffhanger liftoff, replayed for a month of game time
    const flying = !still && liftoffActive(v, s.day) && !!v.launch;
    let used = 0;
    if (flying) {
      const marker = this.markers.get(v.launch!.siteId);
      const site = siteDef(v.launch!.siteId);
      const p = this.proj(site.lon, site.lat);
      const pad = marker?.sprite.texture;
      const o = markerOrigin(Math.floor(this.wrapX(p.x)), Math.floor(p.y), pad?.width ?? 13, pad?.height ?? 16, true);
      const baseX = o.x + 5;
      const baseY = o.y + 4;
      const f = launchFrame(this.time);
      if (!this.rocketSprite) {
        this.rocketSprite = new Sprite();
        this.skyL.addChild(this.rocketSprite);
      }
      for (const pf of f.puffs) {
        let sp = this.puffSprites[used];
        if (!sp) {
          sp = new Sprite(pixelTexture());
          this.skyL.addChildAt(sp, 0);
          this.puffSprites.push(sp);
        }
        sp.tint = hex(pf.c);
        sp.position.set(baseX + 1 + pf.dx, baseY + 9 + pf.dy);
        sp.visible = true;
        used++;
      }
      if (f.rise !== null) {
        this.rocketSprite.texture = rocketTexture(f.flame);
        this.rocketSprite.position.set(baseX - 1, baseY - 1 - f.rise);
        this.rocketSprite.visible = true;
      } else this.rocketSprite.visible = false;
    } else if (this.rocketSprite) this.rocketSprite.visible = false;
    for (let i = used; i < this.puffSprites.length; i++) this.puffSprites[i].visible = false;
  }

  // ── Act IV: the supergrid, fusion and air capture, rectennas, provinces, AI banners ───────
  private clearPlanet() {
    if (this.province) {
      this.province.wrap.sprites.forEach((sp) => sp.destroy());
      this.province.texs.forEach((t) => releaseTexture(t));
      this.province = null;
    }
    this.rectennaSprites.forEach((r) => {
      r.sprite.destroy();
      releaseTexture(r.tex);
    });
    this.rectennaSprites = [];
    this.rectennaSpriteKey = '';
    this.glyph4Sprites.forEach((g) => g.sprite.destroy());
    this.glyph4Sprites = [];
    this.glyph4Key = '';
    this.bannerSprites.forEach((b) => b.sprite.destroy());
    this.bannerSprites = [];
    this.bannerKey = '';
    this.sgSprites.forEach((e) => e.sprite.destroy());
    this.sgSprites = [];
    this.sgSpriteKey = '';
    this.sgPulses.forEach((p) => {
      p.sprite.destroy();
      p.tail.destroy();
    });
    this.sgPulses = [];
    this.sgPulseKey = '';
    this.sgDownG.clear();
    this.sgDownKey = '';
    this.planetSeen = null;
    const hadLights = this.planetLights.pts.length > 0;
    this.planetLights = { lod: -1, pts: [] };
    if (hadLights) this.refreshLights();
  }

  private updatePlanet(dt: number) {
    const s = this.game.view;
    if (!s || !act4On(s)) {
      if (this.province || this.rectennaSprites.length || this.glyph4Sprites.length || this.bannerSprites.length || this.sgSprites.length || this.sgPulses.length || this.sgDownKey || this.planetLights.pts.length) this.clearPlanet();
      return;
    }
    const v = planetView(s);
    const fresh = v !== this.planetSeen || this.lodIndex !== this.planetLod;
    this.planetSeen = v;
    this.planetLod = this.lodIndex;
    if (fresh) {
      const pts = act4Lights(v, this.lod);
      const old = this.planetLights;
      const same = old.lod === this.lodIndex && old.pts.length === pts.length && old.pts.every((p, i) => p.x === pts[i].x && p.y === pts[i].y);
      this.planetLights = { lod: this.lodIndex, pts };
      if (!same) this.refreshLights();
    }
    this.updateProvinces(v);
    this.updateRectennas(v, fresh);
    this.updateGlyphs4(v, fresh);
    this.updateBanners(v, fresh);
    this.updateSgSprites(v, fresh);
    this.updateSgPulses(v, dt, fresh);
    this.updateSgDown(v);
  }

  /** Greening and heat haze over the provinces: two shimmer phases swapped a few times a second. */
  private updateProvinces(v: ReturnType<typeof planetView>) {
    const key = provinceKey(v);
    const P = this.province;
    const stale = !P || P.lod !== this.lodIndex || (P.key !== key && performance.now() - P.built > 2000);
    if (stale) {
      if (P && P.lod === this.lodIndex) {
        // same LOD: repaint in place
        paintProvinces(this.lod, v, 0, P.pcs[0]);
        paintProvinces(this.lod, v, 1, P.pcs[1]);
        P.texs.forEach((t) => refreshTexture(t));
        P.key = key;
        P.built = performance.now();
      } else {
        if (P) {
          P.wrap.sprites.forEach((sp) => sp.destroy());
          P.texs.forEach((t) => releaseTexture(t));
        }
        const pcs: [PixelCanvas, PixelCanvas] = [paintProvinces(this.lod, v, 0), paintProvinces(this.lod, v, 1)];
        const texs: [Texture, Texture] = [textureOf(pcs[0]), textureOf(pcs[1])];
        const wrap = new WrapSprite(this.planetGroundL, texs[0]);
        wrap.setTexture(texs[0], this.lod.W);
        this.province = { lod: this.lodIndex, key, pcs, texs, wrap, built: performance.now() };
      }
    }
    const Q = this.province!;
    const phase = this.game.settings.reducedMotion || !v.showHeat ? 0 : Math.floor(this.time * 2.2) % 2;
    if (Q.wrap.sprites[0].texture !== Q.texs[phase]) Q.wrap.setTexture(Q.texs[phase], this.lod.W);
  }

  /** Rectenna fields where space-solar stations beam power down. */
  private updateRectennas(v: ReturnType<typeof planetView>, fresh: boolean) {
    const key = fresh ? `${this.lodIndex}|${rectennaKey(v)}` : this.rectennaSpriteKey;
    if (key !== this.rectennaSpriteKey) {
      this.rectennaSpriteKey = key;
      this.rectennaSprites.forEach((r) => {
        r.sprite.destroy();
        releaseTexture(r.tex);
      });
      this.rectennaSprites = [];
      for (const r of v.rectennas) {
        const patch = rectennaPatch(r, this.lod);
        const tex = textureOf(patch.pc);
        const sprite = new Sprite(tex);
        this.planetGroundL.addChild(sprite);
        this.rectennaSprites.push({ sprite, tex, lat: r.lat, lon: r.lon, ox: patch.ox, oy: patch.oy });
      }
    }
    for (const r of this.rectennaSprites) {
      const p = this.proj(r.lon, r.lat);
      r.sprite.position.set(Math.floor(this.wrapX(p.x)) + r.ox, Math.floor(p.y) + r.oy);
    }
  }

  /** Fusion plants (by design) and air-capture banks in a row under each megaproject's marker. */
  private updateGlyphs4(v: ReturnType<typeof planetView>, fresh: boolean) {
    const key = fresh ? siteGlyphs4Key(v) : this.glyph4Key;
    if (key !== this.glyph4Key) {
      this.glyph4Key = key;
      this.glyph4Sprites.forEach((g) => g.sprite.destroy());
      this.glyph4Sprites = [];
      for (const [site, list] of siteGlyphs4(v)) {
        list.forEach((g, i) => {
          const tex = g.kind === 'fusion' ? fusionTexture(g.design, g.building, g.progress) : dacTexture(g.building, g.progress);
          const sprite = new Sprite(tex);
          this.markerL.addChild(sprite);
          this.glyph4Sprites.push({ sprite, site, i, kind: g.kind, building: g.building, progress: g.progress });
        });
      }
    }
    const spin = this.game.settings.reducedMotion ? 0 : Math.floor(this.time * 4) % 2;
    const bySite = new Map<string, typeof this.glyph4Sprites>();
    for (const g of this.glyph4Sprites) {
      if (g.kind === 'dac' && !g.building) g.sprite.texture = dacTexture(false, 1, spin);
      const list = bySite.get(g.site) ?? [];
      list.push(g);
      bySite.set(g.site, list);
    }
    for (const [site, list] of bySite) {
      const marker = this.markers.get(site);
      if (!marker?.sprite.visible) {
        list.forEach((g) => (g.sprite.visible = false));
        continue;
      }
      const sd = siteDef(site);
      const p = this.proj(sd.lon, sd.lat);
      const spots = glyphRow4(Math.floor(this.wrapX(p.x)), Math.floor(p.y), marker.sprite.texture.height, list.map((g) => ({ w: g.sprite.texture.width, h: g.sprite.texture.height })));
      list.forEach((g, i) => {
        g.sprite.visible = true;
        g.sprite.position.set(spots[i].x, spots[i].y);
      });
    }
  }

  /** A banner in each AI's colour over the provinces it runs, fluttering. */
  private updateBanners(v: ReturnType<typeof planetView>, fresh: boolean) {
    const list = aiBanners(v);
    const key = fresh ? list.map((b) => `${b.region}:${b.ai}`).join(',') : this.bannerKey;
    if (key !== this.bannerKey) {
      this.bannerKey = key;
      this.bannerSprites.forEach((b) => b.sprite.destroy());
      this.bannerSprites = [];
      for (const b of list) {
        const sprite = new Sprite(aiBannerTexture(b.ai, b.color, 0));
        this.markerL.addChild(sprite);
        this.bannerSprites.push({ sprite, ai: b.ai, color: b.color, lat: b.lat, lon: b.lon });
      }
    }
    const still = this.game.settings.reducedMotion;
    this.bannerSprites.forEach((b, i) => {
      b.sprite.texture = aiBannerTexture(b.ai, b.color, still ? 0 : Math.floor(this.time * 2.5 + i * 0.7) % 2);
      const p = this.proj(b.lon, b.lat);
      const tex = b.sprite.texture;
      const spot = bannerSpot(Math.floor(this.wrapX(p.x)), Math.floor(p.y), tex.width, tex.height);
      b.sprite.position.set(spot.x, spot.y);
    });
  }

  /** Terminals at both ends of every supergrid link that's begun, and the build head on the ones being laid. */
  private updateSgSprites(v: ReturnType<typeof planetView>, fresh: boolean) {
    const key = fresh ? `${this.lodIndex}|${sgKey(v)}` : this.sgSpriteKey;
    if (key !== this.sgSpriteKey) {
      this.sgSpriteKey = key;
      this.sgSprites.forEach((e) => e.sprite.destroy());
      this.sgSprites = [];
      for (const l of v.links) {
        if (l.status === 'planned') continue;
        for (const at of ['a', 'b'] as const) {
          const sprite = new Sprite(terminalTexture(l.status));
          this.stationL.addChild(sprite);
          this.sgSprites.push({ sprite, id: l.route.id, at });
        }
        if (l.status === 'building') {
          const t = this.hvdcTrackOf(l.route);
          const i = Math.floor(l.progress * (t.pts.length - 1));
          const sprite = new Sprite(t.sea[i] ? cableShipTexture() : craneTexture(builderColor(l.builder ?? 'halcyon'), true));
          this.stationL.addChild(sprite);
          this.sgSprites.push({ sprite, id: l.route.id, at: 'head' });
        }
      }
    }
    for (const e of this.sgSprites) {
      const l = v.links.find((x) => x.route.id === e.id);
      if (!l) continue;
      const t = this.hvdcTrackOf(l.route);
      const pts = t.pts;
      const tex = e.sprite.texture;
      if (e.at === 'head') {
        const i = Math.floor(l.progress * (pts.length - 1));
        const p = pts[i];
        const x = Math.floor(this.wrapX(p.x));
        if (t.sea[i]) e.sprite.position.set(x - 3, p.y - 3);
        else e.sprite.position.set(x - 2, p.y - tex.height + 1);
      } else {
        const p = e.at === 'a' ? pts[0] : pts[pts.length - 1];
        e.sprite.position.set(Math.floor(this.wrapX(p.x)) - Math.floor(tex.width / 2), p.y - tex.height + 2);
      }
    }
  }

  /** Aurora pulses along online links, flowing out of the sunlit end toward the night. Hidden with reduced motion. */
  private updateSgPulses(v: ReturnType<typeof planetView>, dt: number, fresh: boolean) {
    this.sgPulseL.visible = !this.game.settings.reducedMotion;
    // the sun moves slowly: re-check which way each link flows twice a minute
    const reflow = this.time - this.sgFlowAt > 30;
    const key = fresh || reflow ? `${this.lodIndex}|${sgKey(v)}` : this.sgPulseKey;
    const big = this.lodIndex >= 1;
    if (key !== this.sgPulseKey || reflow) {
      this.sgPulseKey = key;
      this.sgFlowAt = this.time;
      this.sgPulses.forEach((p) => {
        p.sprite.destroy();
        p.tail.destroy();
      });
      this.sgPulses = [];
      const now = new Date();
      for (const l of v.links) {
        if (l.status !== 'online') continue;
        const len = this.hvdcTrackOf(l.route).pts.length;
        const flow = sgFlow(l.route, now);
        const n = Math.max(2, Math.round((len / 34) * (0.6 + flow.strength * 0.6)));
        for (let k = 0; k < n; k++) {
          const tail = new Sprite(big ? sgPulseTexture() : pixelTexture());
          tail.tint = hex(C.cyn4);
          const sprite = new Sprite(big ? sgPulseTexture() : pixelTexture());
          sprite.tint = hex(C.cyn6);
          this.sgPulseL.addChild(tail, sprite);
          this.sgPulses.push({ sprite, tail, id: l.route.id, t: k / n, speed: 18 + flow.strength * 26, dir: flow.dir });
        }
      }
    }
    if (this.game.settings.reducedMotion) return;
    for (const p of this.sgPulses) {
      const l = v.links.find((x) => x.route.id === p.id);
      if (!l) continue;
      const pts = this.hvdcTrackOf(l.route).pts;
      if (pts.length < 2) continue;
      p.t = (p.t + (dt * p.speed) / pts.length) % 1;
      const along = p.dir > 0 ? p.t : 1 - p.t;
      const back = p.dir > 0 ? Math.max(0, p.t - 2.5 / pts.length) : Math.min(1, 1 - p.t + 2.5 / pts.length);
      const q = trackAt(pts, along);
      const r = trackAt(pts, back);
      const shift = Math.floor(this.wrapX(q.x)) - q.x;
      p.sprite.position.set(q.x + shift, q.y);
      p.tail.position.set(r.x + shift, r.y);
    }
  }

  /** Links that are down blink bright red over their dark line. */
  private updateSgDown(v: ReturnType<typeof planetView>) {
    const down = v.links.filter((l) => l.status === 'down');
    const key = `${this.lodIndex}|${Math.round(this.camX / 50)}|${down.map((l) => l.route.id).join(',')}`;
    if (key !== this.sgDownKey) {
      this.sgDownKey = key;
      this.sgDownG.clear();
      const W = this.lod.W;
      const pts = sgDownPixels(sgDraws({ ...v, links: down }, this.lod, (l) => this.hvdcTrackOf(l.route)));
      if (pts.length) {
        const shift = this.wrapX(pts[0].x) - pts[0].x;
        for (const off of [-W, 0, W]) for (const p of pts) this.sgDownG.rect(p.x + shift + off, p.y, 1, 1);
        this.sgDownG.fill(hex(C.red3));
      }
    }
    this.sgDownG.alpha = this.game.settings.reducedMotion || Math.floor(this.time * 2.5) % 2 === 0 ? 1 : 0;
  }

  private routePixels(path: [number, number][]): { x: number; y: number }[] {
    const pts = path.map(([lon, lat]) => this.proj(lon, lat));
    if (!pts.length) return pts;
    // shift the whole polyline so its first point is near the camera
    const shift = this.wrapX(pts[0].x) - pts[0].x;
    return pts.map((p) => ({ x: p.x + shift, y: p.y }));
  }

  private updateRoutes() {
    const s = this.game.view;
    const ships = s?.shipments ?? [];
    const sel = this.game.hover?.kind === 'shipment' ? this.game.hover.id : '';
    const key = `${this.lodIndex}|${Math.round(this.camX / 40)}|${ships.map((x) => x.id + x.portDay).join(',')}|${sel}`;
    if (key === this.routeKey) return;
    this.routeKey = key;
    this.routeG.clear();
    for (const sh of ships) {
      const pts = this.routePixels([...sh.route, ...sh.overland.slice(1)]);
      const col = sh.id === sel ? hex(C.yel1) : hex(sh.mode === 'air' ? C.ice2 : C.foam);
      for (let i = 1; i < pts.length; i++) this.pixelLine(this.routeG, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, col, 1, 2);
    }
    this.routeG.alpha = 0.8;
  }

  private shipPosition(sh: Shipment): { x: number; y: number; dir: number } | null {
    const s = this.game.view!;
    const t = s.day + this.game.dayFraction();
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
    const pts = this.routePixels(path);
    if (pts.length < 2) return pts[0] ? { ...pts[0], dir: 1 } : null;
    let total = 0;
    const seg: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      seg.push(d);
      total += d;
    }
    let want = total * f;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length - 1) {
        const k = seg[i] > 0 ? want / seg[i] : 0;
        const a = pts[i];
        const b = pts[i + 1];
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dir: b.x >= a.x ? 1 : -1 };
      }
      want -= seg[i];
    }
    return null;
  }

  private updateShips() {
    const s = this.game.view;
    const ships = s?.shipments ?? [];
    const alive = new Set<string>();
    for (const sh of ships) {
      alive.add(sh.id);
      let sp = this.shipSprites.get(sh.id);
      if (!sp) {
        sp = new Sprite(sh.mode === 'air' ? planeTexture() : shipTexture());
        this.shipL.addChild(sp);
        this.shipSprites.set(sh.id, sp);
      }
      const pos = this.shipPosition(sh);
      if (!pos) {
        sp.visible = false;
        continue;
      }
      sp.visible = true;
      const onLand = s!.day + this.game.dayFraction() >= sh.portDay && sh.mode === 'sea';
      sp.scale.x = pos.dir;
      sp.alpha = onLand ? 0.7 : 1;
      sp.position.set(Math.round(this.wrapX(pos.x) - (pos.dir > 0 ? 3 : -3)), Math.round(pos.y - 2 + (sh.mode === 'sea' && Math.floor(this.time * 2 + sh.departDay) % 2 ? 0 : 0)));
    }
    for (const [id, sp] of this.shipSprites) {
      if (!alive.has(id)) {
        sp.destroy();
        this.shipSprites.delete(id);
      }
    }
  }

  private updateChokepoints() {
    const s = this.game.view;
    const closed = s ? closedChokepoints(s) : new Set<string>();
    for (const c of CHOKEPOINTS) {
      let sp = this.chokeSprites.get(c.id);
      if (!sp) {
        sp = new Sprite();
        this.chokeL.addChild(sp);
        this.chokeSprites.set(c.id, sp);
      }
      sp.texture = chokepointTexture(closed.has(c.id));
      const p = this.proj(c.lon, c.lat);
      sp.position.set(Math.floor(this.wrapX(p.x)) - 3, Math.floor(p.y) - 3);
      sp.alpha = closed.has(c.id) ? 1 : 0.75;
    }
  }

  private updateSelection() {
    const sel = this.game.selection;
    if (sel?.kind === 'site') {
      const frame = Math.floor(this.time * 2.5) % 2;
      const tex = selectionTexture(frame);
      this.selSprite.texture = tex;
      const p = this.sitePx(sel.id);
      const lift = this.liftOf(sel.id);
      this.selSprite.position.set(Math.floor(p.x) - Math.floor(tex.width / 2), Math.floor(p.y) - Math.floor(tex.height / 2) - lift);
      this.selSprite.visible = true;
    } else this.selSprite.visible = false;
  }

  private updatePreview() {
    this.previewG.clear();
    const tool = this.game.tool as AnyTool;
    if ((tool?.kind !== 'link' && tool?.kind !== 'fiber') || !tool.from || !this.cursor) return;
    const a = this.sitePx(tool.from);
    const wx = this.camX + this.cursor.x;
    const wy = this.camY + this.cursor.y;
    // power lines preview in yellow, fiber in its pink glow
    this.pixelLine(this.previewG, a.x, a.y, wx, wy, hex(tool.kind === 'fiber' ? C.pnk1 : C.yel1), 2, 2);
  }

  /** How far above the site a lifted marker's middle sits (4 for pins; more for the tall launch pad). */
  private liftOf(id: string): number {
    const m = this.markers.get(id);
    if (!m?.lift) return 0;
    return Math.max(4, Math.floor(m.sprite.texture.height / 2) - 1);
  }

  // ── input ─────────────────────────────────────────────────────────────────────────────────
  private hitSite(px: number, py: number): string | null {
    const wx = this.camX + px;
    const wy = this.camY + py;
    let best: string | null = null;
    let bestD = 7;
    const s = this.game.view;
    for (const site of SITES) {
      if (!siteVisible(site, s)) continue;
      const p = this.proj(site.lon, site.lat);
      const x = this.wrapX(p.x);
      const lift = this.liftOf(site.id);
      const d = Math.hypot(x - wx, p.y - lift - wy);
      if (d < bestD) {
        bestD = d;
        best = site.id;
      }
    }
    return best;
  }

  private hitShipment(px: number, py: number): string | null {
    const s = this.game.view;
    if (!s) return null;
    const wx = this.camX + px;
    const wy = this.camY + py;
    for (const sh of s.shipments) {
      const pos = this.shipPosition(sh);
      if (pos && Math.hypot(this.wrapX(pos.x) - wx, pos.y - wy) < 5) return sh.id;
    }
    return null;
  }

  private hitChokepoint(px: number, py: number): string | null {
    const wx = this.camX + px;
    const wy = this.camY + py;
    for (const c of CHOKEPOINTS) {
      const p = this.proj(c.lon, c.lat);
      if (Math.hypot(this.wrapX(p.x) - wx, p.y - wy) < 4) return c.id;
    }
    return null;
  }

  private hoverAt(p: PixelPointer) {
    const site = this.hitSite(p.x, p.y);
    if (site) return this.game.setHover({ kind: 'site', id: site, clientX: p.clientX, clientY: p.clientY });
    const ship = this.hitShipment(p.x, p.y);
    if (ship) return this.game.setHover({ kind: 'shipment', id: ship, clientX: p.clientX, clientY: p.clientY });
    const choke = this.hitChokepoint(p.x, p.y);
    if (choke) return this.game.setHover({ kind: 'chokepoint', id: choke, clientX: p.clientX, clientY: p.clientY });
    const code = sampleRegionCode(this.lod, this.camX + p.x, this.camY + p.y);
    const region = REGION_BY_CODE[code];
    if (region) return this.game.setHover({ kind: 'region', id: region, clientX: p.clientX, clientY: p.clientY });
    this.game.setHover(null);
  }

  pointerDown(p: PixelPointer) {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.down = null;
      return;
    }
    this.down = { x: p.x, y: p.y, camX: this.camX, camY: this.camY, moved: false };
    this.targetX = this.targetY = null;
  }

  pointerMove(p: PixelPointer) {
    this.cursor = { x: p.x, y: p.y };
    if (this.pointers.has(p.id)) this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (d > this.pinchDist * 1.35) {
        this.zoomIn(mid);
        this.pinchDist = d;
      } else if (d < this.pinchDist * 0.7) {
        this.zoomOut(mid);
        this.pinchDist = d;
      }
      return;
    }
    if (this.down) {
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      if (!this.down.moved && Math.hypot(dx, dy) > 3) this.down.moved = true;
      if (this.down.moved) {
        this.camX = this.down.camX - dx;
        this.camY = this.down.camY - dy;
        this.clampCam();
        this.game.setHover(null);
        return;
      }
    }
    this.hoverAt(p);
  }

  pointerUp(p: PixelPointer) {
    this.pointers.delete(p.id);
    const d = this.down;
    this.down = null;
    if (!d || d.moved || this.game.mode !== 'map' || !this.game.state) return;
    const site = this.hitSite(p.x, p.y);
    const tool = this.game.tool as AnyTool;
    if (tool?.kind === 'link' || tool?.kind === 'fiber') {
      // Game.linkClick handles both line tools (power and fiber)
      if (site) this.game.linkClick(site);
      return;
    }
    if (site) {
      const now = performance.now();
      const kind = siteDef(site).kind;
      if (this.lastClick.site === site && now - this.lastClick.t < 350 && (kind === 'build' || kind === 'charter' || kind === 'mega' || kind === 'launch')) {
        this.game.enterDiorama(site);
        return;
      }
      this.lastClick = { t: now, site };
      this.game.select({ kind: 'site', id: site });
      return;
    }
    const code = sampleRegionCode(this.lod, this.camX + p.x, this.camY + p.y);
    const region = REGION_BY_CODE[code];
    this.game.select(region ? { kind: 'region', id: region } : null);
  }

  pointerLeave() {
    this.cursor = null;
    this.game.setHover(null);
  }

  wheel(p: PixelPointer, deltaY: number) {
    if (this.game.settings.wheel === 'pan') {
      this.pan(0, Math.sign(deltaY) * 14);
      return;
    }
    const now = performance.now();
    if (now - this.lastWheel < 220) return;
    this.lastWheel = now;
    if (deltaY < 0) this.zoomIn(p);
    else this.zoomOut(p);
  }

  /** Pan the camera by internal pixels (keyboard). */
  pan(dx: number, dy: number) {
    this.camX += dx;
    this.camY += dy;
    this.targetX = this.targetY = null;
    this.clampCam();
  }

  focusSite(id: string) {
    const s = siteDef(id);
    this.centreOn(s.lon, s.lat, true);
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}
