import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../../game/game';
import type { Scene, PixelPointer } from '../stage';
import type { MapLod } from '../../world/mapData';
import { sampleRegionCode } from '../../world/mapData';
import { CHOKEPOINTS } from '../../world/routing';
import { REGION_BY_CODE, CODE_BY_REGION } from '../../content/mapcodes';
import { REGIONS } from '../../content/regions';
import { SITES, siteDef } from '../../content/sites';
import type { Shipment } from '../../sim/types';
import { closedChokepoints } from '../../sim/effects';
import { C, hex } from '../palette';
import { PixelCanvas } from '../pixels';
import { cachedTexture, labelTexture, refreshTexture, textureOf } from '../textures';
import { renderBorders, renderTerrain } from './terrain';
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

/** The map tools this scene draws previews for ('fiber' arrives with Act II). */
type AnyTool = { kind: string; from: string | null } | null;

/** Act II network layer (cables + fiber) per LOD, painted into a full-map canvas. */
interface NetLayer {
  pc: PixelCanvas;
  tex: Texture;
  key: string;
}
const NET_CACHE: (NetLayer | null)[] = [null, null];

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

/** Three copies of a full-map sprite, for horizontal wrap-around. */
class WrapSprite {
  readonly sprites: Sprite[];
  constructor(parent: Container, tex: Texture, opts: { alpha?: number; blend?: 'multiply' | 'add' | 'normal' } = {}) {
    this.sprites = [-1, 0, 1].map(() => {
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
    this.world.addChild(this.terrainL, this.overlayL, this.netL, this.cutG, this.netPulseL, this.cloudL, this.routeG, this.linkG, this.pulseL, this.chokeL, this.markerL, this.shipL, this.previewG, this.selSprite, this.labelL);
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
    this.routeBudget = 1;
    this.updateHighlight();
    this.updateMarkers();
    this.updateRivals();
    this.updateNetwork(dt);
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
    renderLights(L.lod, L.nightPc, L.lightPts, L.lightsPc);
    refreshTexture(L.night);
    refreshTexture(L.lights);
    void force;
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
      const showLabel = hovered || selectedSite === site.id || (fine && glyphs.length > 0) || ((tool?.kind === 'link' || tool?.kind === 'fiber') && tool.from === site.id);
      const marker = siteMarker(site, s, hovered, g.mode === 'title');
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
    const key = `${known}|${cables.map((c) => `${c.id}:${c.kind}:${Math.floor(c.built * 40)}:${c.cut}`).join(',')}|${fiber.map((f) => f.id + f.status + f.a + f.b).join(',')}`;
    const L = this.netLayer();
    // while routes are still being worked out (a frame each), paint once at the start and once at the end
    if (L.key !== key && (known === cables.length || !L.key)) {
      L.key = key;
      L.pc.data.fill(0);
      paintNetwork(L.pc, this.lod, s, (c) => this.cableTrack(c));
      refreshTexture(L.tex);
    }
    this.updateCuts(cables);
    this.updateNetPulses(cables, dt, key);
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
      const lift = this.markers.get(sel.id)?.lift ? 4 : 0;
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
      const lift = this.markers.get(site.id)?.lift ? 4 : 0;
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
      if (this.lastClick.site === site && now - this.lastClick.t < 350 && siteDef(site).kind === 'build') {
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
