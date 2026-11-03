import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../../game/game';
import type { Scene, PixelPointer } from '../stage';
import type { MapLod } from '../../world/mapData';
import { sampleRegionCode } from '../../world/mapData';
import { CHOKEPOINTS } from '../../world/routing';
import { REGION_BY_CODE, CODE_BY_REGION } from '../../content/mapcodes';
import { REGIONS } from '../../content/regions';
import { SITES, siteDef, type SiteDef } from '../../content/sites';
import type { FacilityType, Shipment } from '../../sim/types';
import { closedChokepoints } from '../../sim/effects';
import { C, hex, type ColorKey } from '../palette';
import { PixelCanvas } from '../pixels';
import { labelTexture, refreshTexture, textureOf } from '../textures';
import { renderBorders, renderTerrain } from './terrain';
import { lightPoints, renderLights, renderNight, type LightPoint } from './night';
import {
  candidateTexture,
  chokepointTexture,
  cloudMarkTexture,
  cloudTexture,
  facilityIconTexture,
  homeTexture,
  pixelTexture,
  planeTexture,
  selectionTexture,
  shipTexture,
  sitePinTexture,
  supplierTexture,
} from '../sprites/mapIcons';
import { hash2 } from '../pixels';

const SUPPLIER_COLOR: Record<string, ColorKey> = {
  lumen: 'cyn4',
  kestrel: 'org1',
  stackwell: 'vio4',
  hanbit: 'pnk0',
  veldt: 'yel0',
  bondline: 'grn6',
};

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
  private markers = new Map<string, { sprite: Sprite; icons: Sprite[]; label: Sprite | null; key: string }>();
  private chokeSprites = new Map<string, Sprite>();
  private regionLabels: Sprite[] = [];
  private pulses: { sprite: Sprite; link: string; t: number }[] = [];
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

  constructor(private readonly game: Game) {
    this.root.addChild(this.world);
    this.world.addChild(this.terrainL, this.overlayL, this.cloudL, this.routeG, this.linkG, this.pulseL, this.chokeL, this.markerL, this.shipL, this.previewG, this.selSprite, this.labelL);
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
    this.updateHighlight();
    this.updateMarkers();
    this.updateLinks();
    this.updateRoutes();
    this.updateShips();
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
  private siteFacilities(id: string): { type: FacilityType; building: boolean }[] {
    const s = this.game.view;
    if (!s) return [];
    return s.facilities.filter((f) => f.siteId === id && f.type !== 'hq').map((f) => ({ type: f.type, building: f.status === 'building' }));
  }

  private markerTexture(site: SiteDef, hovered: boolean): Texture {
    const s = this.game.view;
    if (site.kind === 'supplier') return supplierTexture(SUPPLIER_COLOR[site.supplier ?? 'lumen'] ?? 'ink8');
    if (site.kind === 'cloud') return cloudMarkTexture();
    if (s && s.company.homeSite === site.id && this.game.mode !== 'title') return homeTexture();
    if (s && (s.facilities.some((f) => f.siteId === site.id) || s.sites[site.id]?.grid.mw > 0 || s.sites[site.id]?.grid.pending.length)) return sitePinTexture('cyn4');
    return candidateTexture(hovered);
  }

  private updateMarkers() {
    const g = this.game;
    const hoveredSite = g.hover?.kind === 'site' ? g.hover.id : null;
    const selectedSite = g.selection?.kind === 'site' ? g.selection.id : null;
    const fine = this.lodIndex >= 1;
    for (const site of SITES) {
      let m = this.markers.get(site.id);
      if (!m) {
        const sprite = new Sprite();
        this.markerL.addChild(sprite);
        m = { sprite, icons: [], label: null, key: '' };
        this.markers.set(site.id, m);
      }
      const facs = this.siteFacilities(site.id);
      const hovered = hoveredSite === site.id;
      const showLabel = hovered || selectedSite === site.id || (fine && facs.length > 0) || (g.tool?.kind === 'link' && g.tool.from === site.id);
      const key = `${this.lodIndex}|${hovered}|${showLabel}|${facs.map((f) => f.type + (f.building ? 'b' : '')).join(',')}|${g.state?.company.homeSite === site.id}|${g.state?.sites[site.id]?.grid.mw ?? 0}`;
      const p = this.proj(site.lon, site.lat);
      const x = Math.floor(this.wrapX(p.x));
      const y = Math.floor(p.y);
      if (key !== m.key) {
        m.key = key;
        const tex = this.markerTexture(site, hovered);
        m.sprite.texture = tex;
        m.icons.forEach((ic) => ic.destroy());
        m.icons = [];
        if (fine || hovered) {
          // group facility icons by type
          const counts = new Map<string, { type: FacilityType; building: boolean; n: number }>();
          for (const f of facs) {
            const k = f.type + f.building;
            const e = counts.get(k) ?? { ...f, n: 0 };
            e.n++;
            counts.set(k, e);
          }
          for (const e of counts.values()) {
            const ic = new Sprite(facilityIconTexture(e.type, e.building));
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
      m.sprite.position.set(x - Math.floor(tex.width / 2), y - (site.kind === 'build' && tex.height > 6 ? tex.height - 1 : Math.floor(tex.height / 2)));
      let ix = x - Math.floor((m.icons.length * 8) / 2);
      for (const ic of m.icons) {
        ic.position.set(ix, y + 3);
        ix += 8;
      }
      if (m.label) m.label.position.set(x - Math.floor(m.label.texture.width / 2), m.sprite.y - m.label.texture.height - 1);
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
    const key = `${this.lodIndex}|${Math.round(this.camX / 50)}|${links.map((l) => l.id + l.status).join(',')}`;
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
    this.pulses.forEach((p) => p.sprite.destroy());
    this.pulses = [];
    for (const l of links) {
      if (l.status !== 'online') continue;
      for (let k = 0; k < 2; k++) {
        const sp = new Sprite(pixelTexture());
        sp.tint = hex(C.white);
        this.pulseL.addChild(sp);
        this.pulses.push({ sprite: sp, link: l.id, t: k * 0.5 });
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
    }
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
      const site = siteDef(sel.id);
      const lift = site.kind === 'build' && this.markers.get(sel.id)?.sprite.texture.height! > 6 ? 4 : 0;
      this.selSprite.position.set(Math.floor(p.x) - Math.floor(tex.width / 2), Math.floor(p.y) - Math.floor(tex.height / 2) - lift);
      this.selSprite.visible = true;
    } else this.selSprite.visible = false;
  }

  private updatePreview() {
    this.previewG.clear();
    const tool = this.game.tool;
    if (tool?.kind !== 'link' || !tool.from || !this.cursor) return;
    const a = this.sitePx(tool.from);
    const wx = this.camX + this.cursor.x;
    const wy = this.camY + this.cursor.y;
    this.pixelLine(this.previewG, a.x, a.y, wx, wy, hex(C.yel1), 2, 2);
  }

  // ── input ─────────────────────────────────────────────────────────────────────────────────
  private hitSite(px: number, py: number): string | null {
    const wx = this.camX + px;
    const wy = this.camY + py;
    let best: string | null = null;
    let bestD = 7;
    for (const site of SITES) {
      const p = this.proj(site.lon, site.lat);
      const x = this.wrapX(p.x);
      const lift = site.kind === 'build' && (this.markers.get(site.id)?.sprite.texture.height ?? 0) > 6 ? 4 : 0;
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
    if (this.game.tool?.kind === 'link') {
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
