/**
 * The orbit view (Act IV): the pixel Earth from space with the real sun, slowly turning, the
 * Moon and its base, the three shells, orbital data centres, space-solar stations beaming down
 * to their rectennas, launches, debris glitter and (in the finale) the debris cascade.
 *
 * Layers, back to front: the sky (painted once per size), the Moon, the back halves of the
 * orbits, things behind the Earth, the Earth (repainted only when it has turned half a pixel),
 * the front halves of the orbits, things in front of it, labels. Moving things are pooled 1×1
 * and small sprites, so nothing big is re-baked per frame.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../../game/game';
import { SITE_BY_ID } from '../../content/sites';
import { orbitView, type OrbitView } from '../../sim/planetView';
import { orbitExtras, type OrbitExtras } from '../../sim/systemView';
import { subsolar } from '../../world/sun';
import { getEra, hex, C } from '../palette';
import { PixelCanvas } from '../pixels';
import type { PixelPointer, Scene } from '../stage';
import { cachedTexture, labelTexture, refreshTexture, releaseTexture, textureOf } from '../textures';
import { pixelTexture } from '../sprites/mapIcons';
import { planetView, rectennaKey, sgKey } from '../worldMap/act4Layers';
import {
  extrasLabels,
  lagrangeSpots,
  moonSize,
  orbitExtrasFx,
  orbitFx,
  orbitLabels,
  orbitLayout,
  orbitTerrain,
  paintGlobe,
  paintMoon,
  paintRings,
  paintSky,
  sunView,
  toView,
  twinklers,
  type Cam,
  type OrbitLayout,
} from './orbitArt';

const RAD = Math.PI / 180;
/** Degrees per second the camera drifts round the Earth (west to east, like the planet turns). */
const DRIFT = 2.2;
const LAT_MIN = -30;
const LAT_MAX = 45;

/** A pool of sprites reused frame to frame: 1×1 tinted pixels and small textured sprites. */
class Pool {
  private sprites: Sprite[] = [];
  private used = 0;
  constructor(private readonly parent: Container) {}
  begin() {
    this.used = 0;
  }
  px(x: number, y: number, c: number) {
    const sp = this.next(pixelTexture());
    sp.tint = hex(c);
    sp.position.set(x, y);
  }
  spr(tex: Texture, x: number, y: number) {
    const sp = this.next(tex);
    sp.tint = 0xffffff;
    sp.position.set(x, y);
  }
  end() {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
  get size() {
    return this.used;
  }
  private next(tex: Texture): Sprite {
    let sp = this.sprites[this.used];
    if (!sp) {
      sp = new Sprite(tex);
      this.parent.addChild(sp);
      this.sprites.push(sp);
    } else if (sp.texture !== tex) sp.texture = tex;
    sp.visible = true;
    this.used++;
    return sp;
  }
}

interface Layer {
  pc: PixelCanvas;
  tex: Texture;
  sprite: Sprite;
}

export class OrbitScene implements Scene {
  readonly root = new Container();
  private readonly skyL = new Container();
  private readonly moonL = new Container();
  private readonly backL = new Container();
  private readonly backFx = new Container();
  private readonly globeL = new Container();
  private readonly frontL = new Container();
  private readonly frontFx = new Container();
  private readonly labelL = new Container();
  private readonly backPool = new Pool(this.backFx);
  private readonly frontPool = new Pool(this.frontFx);

  private L: OrbitLayout = orbitLayout(640, 360);
  private cam: Cam;
  private time = 0;
  private sun = subsolar(new Date());
  private sunAt = 0;
  private sky: Layer | null = null;
  private ringsBack: Layer | null = null;
  private ringsFront: Layer | null = null;
  private globe: Layer | null = null;
  private moon: Layer | null = null;
  private ringLat = NaN;
  private drawn = { lon0: NaN, lat0: NaN, key: '', at: -1 };
  private moonKey = '';
  private stars: { x: number; y: number; c: number }[] = [];
  private labels: { sprite: Sprite; key: string }[] = [];
  private glide: { lon0: number; lat0: number; lon1: number; lat1: number; t: number } | null = null;
  // input
  private down: { x: number; y: number; lon0: number; lat0: number; moved: boolean } | null = null;
  private pointers = new Set<number>();
  private idleUntil = 0;
  private moonHover = false;
  /** Act V: the yard or habitats under the pointer. */
  private spotHover: 'l4' | 'l5' | 'aurora' | null = null;
  private extras: OrbitExtras = orbitExtras(null);

  constructor(private readonly game: Game) {
    this.root.addChild(this.skyL, this.moonL, this.backL, this.backFx, this.globeL, this.frontL, this.frontFx, this.labelL);
    // start with the terminator in view: the sunlit side on the left, evening to the right
    this.cam = { lon0: this.sun.lon + 40, lat0: 22 };
    this.resize(640, 360);
  }

  // ── layout ───────────────────────────────────────────────────────────────────────────────
  resize(width: number, height: number) {
    const w = Math.max(64, Math.floor(width));
    const h = Math.max(64, Math.floor(height));
    if (this.sky && this.L.w === w && this.L.h === h) return;
    this.L = orbitLayout(w, h);
    this.stars = twinklers(this.L);
    this.sky = this.layer(this.sky, this.skyL, w, h);
    paintSky(this.sky.pc);
    refreshTexture(this.sky.tex);
    this.ringsBack = this.layer(this.ringsBack, this.backL, w, h);
    this.ringsFront = this.layer(this.ringsFront, this.frontL, w, h);
    this.ringLat = NaN;
    const g = this.L.globe;
    this.globe = this.layer(this.globe, this.globeL, g.size, g.size);
    this.globe.sprite.position.set(g.x, g.y);
    const ms = moonSize(this.L.moon.r);
    this.moon = this.layer(this.moon, this.moonL, ms, ms);
    this.moon.sprite.position.set(this.L.moon.x - this.L.moon.r - 4, this.L.moon.y - this.L.moon.r - 4);
    this.drawn = { lon0: NaN, lat0: NaN, key: '', at: -1 };
    this.moonKey = '';
  }

  /** A full-canvas layer: reused when the size matches, else replaced (old texture freed). */
  private layer(old: Layer | null, parent: Container, w: number, h: number): Layer {
    if (old && old.pc.w === w && old.pc.h === h) {
      old.pc.data.fill(0);
      return old;
    }
    if (old) {
      old.sprite.destroy();
      releaseTexture(old.tex);
    }
    const pc = new PixelCanvas(w, h);
    const tex = textureOf(pc);
    const sprite = new Sprite(tex);
    parent.addChild(sprite);
    return { pc, tex, sprite };
  }

  subpixel() {
    return { x: 0, y: 0 };
  }

  // ── per frame ────────────────────────────────────────────────────────────────────────────
  update(dt: number, now: number) {
    void now;
    this.time += dt;
    const st = this.game.settings;
    const still = st.reducedMotion;
    const s = this.game.view;
    const ov = orbitView(s);
    this.extras = orbitExtras(s);
    // the camera: a glide to a point, the user's drag, or a slow drift round the planet
    if (this.glide) {
      const gl = this.glide;
      gl.t = Math.min(1, gl.t + dt / 1.4);
      const e = gl.t * gl.t * (3 - 2 * gl.t);
      this.cam.lon0 = gl.lon0 + (gl.lon1 - gl.lon0) * e;
      this.cam.lat0 = gl.lat0 + (gl.lat1 - gl.lat0) * e;
      if (gl.t >= 1) this.glide = null;
    } else if (!still && !this.down && this.time > this.idleUntil) this.cam.lon0 -= DRIFT * dt;
    if (this.cam.lon0 < -540 || this.cam.lon0 > 540) this.cam.lon0 = ((((this.cam.lon0 + 180) % 360) + 360) % 360) - 180;
    if (this.time - this.sunAt > 20) {
      this.sun = subsolar(new Date());
      this.sunAt = this.time;
      this.drawn.key = '';
    }
    this.updateRings();
    this.updateGlobe(s, ov, st.batterySaver);
    this.updateMoon(ov);
    this.updateFx(ov, still, st.batterySaver);
    this.updateLabels(ov);
  }

  private updateRings() {
    const lat = Math.round(this.cam.lat0 * 2) / 2;
    if (lat === this.ringLat) return;
    this.ringLat = lat;
    const b = this.ringsBack!;
    const f = this.ringsFront!;
    b.pc.data.fill(0);
    f.pc.data.fill(0);
    paintRings(b.pc, f.pc, this.L, { lon0: this.cam.lon0, lat0: lat });
    refreshTexture(b.tex);
    refreshTexture(f.tex);
  }

  /** Repaint the Earth when it has turned half a pixel, the sun moved or the planet changed (throttled). */
  private updateGlobe(s: Game['view'], ov: OrbitView, battery: boolean) {
    const pv = planetView(s);
    const bloom = getEra() >= 2;
    const key = `${bloom}|${sgKey(pv)}|${rectennaKey(pv)}|${pv.fusion.filter((f) => f.status === 'online').length}|${ov.spaceport}|${ov.pads}`;
    const r = this.L.r;
    const moved = Math.abs(this.cam.lon0 - this.drawn.lon0) * RAD * r >= 0.5 || Math.abs(this.cam.lat0 - this.drawn.lat0) * RAD * r >= 0.5;
    if (!moved && key === this.drawn.key) return;
    const gap = this.down ? 1 / 40 : battery ? 1 / 8 : 1 / 20;
    if (this.drawn.at >= 0 && this.time - this.drawn.at < gap && key === this.drawn.key) return;
    const lod = this.game.world.lods[r >= 60 ? Math.min(1, this.game.world.lods.length - 1) : 0];
    paintGlobe(this.globe!.pc, this.L, { terrain: orbitTerrain(lod, bloom), res: lod.res, smooth: r < 60, cam: this.cam, sun: this.sun, planet: pv, orbit: ov, t: this.time });
    refreshTexture(this.globe!.tex);
    this.drawn = { lon0: this.cam.lon0, lat0: this.cam.lat0, key, at: this.time };
    // the Moon's phase follows the same sun
    this.moonKey = '';
  }

  private updateMoon(ov: OrbitView) {
    const sv = sunView(this.sun, this.cam);
    const key = `${ov.moon.stage}|${this.moonHover}|${sv.map((v) => Math.round(v * 20)).join(',')}`;
    if (key === this.moonKey) return;
    this.moonKey = key;
    paintMoon(this.moon!.pc, this.L.moon.r, sv, ov.moon, this.moonHover);
    refreshTexture(this.moon!.tex);
  }

  private updateFx(ov: OrbitView, still: boolean, battery: boolean) {
    this.backPool.begin();
    this.frontPool.begin();
    const back = this.backPool;
    const front = this.frontPool;
    orbitFx(
      {
        px: (x, y, c, fr) => (fr ? front : back).px(x, y, c),
        spr: (key, make, x, y, fr) => (fr ? front : back).spr(cachedTexture(`orbit:${key}`, make), x, y),
      },
      this.L,
      this.cam,
      ov,
      this.time,
      { still, lite: battery },
      this.stars,
    );
    if (this.extras.active) {
      orbitExtrasFx(
        {
          px: (x, y, c, fr) => (fr ? front : back).px(x, y, c),
          spr: (key, make, x, y, fr) => (fr ? front : back).spr(cachedTexture(`orbit:${key}`, make), x, y),
        },
        this.L,
        this.cam,
        this.extras,
        this.time,
        { still, lite: battery },
      );
      // the yard or habitats under the pointer: a white bracket
      const h = this.spotHover;
      if (h) {
        const sp = this.spotAt(h);
        if (sp) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          front.px(sp[0] + dx * 9, sp[1] + dy * 6, C.white);
          front.px(sp[0] + dx * 8, sp[1] + dy * 6, C.white);
          front.px(sp[0] + dx * 9, sp[1] + dy * 5, C.white);
        }
      }
    }
    this.backPool.end();
    this.frontPool.end();
  }

  private updateLabels(ov: OrbitView) {
    const list = this.extras.active ? [...orbitLabels(this.L, this.cam, ov), ...extrasLabels(this.L, this.extras)] : orbitLabels(this.L, this.cam, ov);
    list.forEach((lb, i) => {
      const key = `${lb.text}|${lb.color}`;
      let e = this.labels[i];
      if (!e) {
        e = { sprite: new Sprite(), key: '' };
        this.labelL.addChild(e.sprite);
        this.labels[i] = e;
      }
      if (e.key !== key) {
        e.key = key;
        e.sprite.texture = labelTexture(lb.text, lb.color, C.ink0);
      }
      e.sprite.position.set(lb.x - 1, lb.y - 1);
      e.sprite.visible = true;
    });
    for (let i = list.length; i < this.labels.length; i++) this.labels[i].sprite.visible = false;
  }

  // ── camera controls (keyboard, tutorial, UI) ────────────────────────────────────────────
  /** Turn the globe by internal pixels (keyboard arrows). */
  pan(dx: number, dy: number) {
    this.glide = null;
    this.cam.lon0 += dx / (this.L.r * RAD);
    this.cam.lat0 = Math.max(LAT_MIN, Math.min(LAT_MAX, this.cam.lat0 - dy / (this.L.r * RAD)));
    this.idleUntil = this.time + 3;
  }

  /** Glide the camera round to look down on a point (e.g. the spaceport, a rectenna). */
  focus(lat: number, lon: number) {
    let lon1 = lon;
    while (lon1 - this.cam.lon0 > 180) lon1 -= 360;
    while (this.cam.lon0 - lon1 > 180) lon1 += 360;
    this.glide = { lon0: this.cam.lon0, lat0: this.cam.lat0, lon1, lat1: Math.max(LAT_MIN, Math.min(LAT_MAX, lat)), t: 0 };
    this.idleUntil = this.time + 6;
  }

  /** `+` / wheel up from orbit: back down to the world map. */
  zoomIn() {
    this.game.enterMap();
  }

  /** Client (CSS px) position of a target for the tutorial spotlight: 'moon', or 'site:<id>' when it faces us. */
  locate(target: string): { x: number; y: number } | null {
    let p: { x: number; y: number } | null = null;
    if (target === 'moon') p = { x: this.L.moon.x, y: this.L.moon.y };
    else if (target === 'l4' || target === 'l5' || target === 'aurora') {
      const sp = this.spotAt(target);
      if (sp) p = { x: sp[0], y: sp[1] };
    }
    else if (target.startsWith('site:')) {
      const id = target.slice(5);
      const site = this.siteLatLon(id);
      if (site) {
        const v = toView(site[0], site[1], this.cam);
        if (v[2] > 0.1) p = { x: this.L.cx + v[0] * this.L.r, y: this.L.cy - v[1] * this.L.r };
      }
    }
    const stage = this.game.stage;
    if (!p || !stage?.canvas || typeof window === 'undefined') return p;
    const rect = stage.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: rect.left + (p.x * stage.scale) / dpr, y: rect.top + (p.y * stage.scale) / dpr };
  }

  private siteLatLon(id: string): [number, number] | null {
    const site = SITE_BY_ID[id];
    return site && site.kind !== 'moon' ? [site.lat, site.lon] : null;
  }

  // ── input ────────────────────────────────────────────────────────────────────────────────
  private overMoon(x: number, y: number): boolean {
    const m = this.L.moon;
    return Math.hypot(x - m.x, y - m.y) <= m.r + 5;
  }

  /** Act V: where the L4/L5 yards and the habitats are on screen (null if there's nothing there). */
  private spotAt(id: 'l4' | 'l5' | 'aurora'): [number, number] | null {
    const ex = this.extras;
    if (!ex.active) return null;
    const sp = lagrangeSpots(this.L);
    if (id === 'aurora') return ex.habitats > 0 ? [sp.l5[0] - 1, sp.l5[1] + 13] : null;
    return ex[id] > 0 ? sp[id] : null;
  }

  private overSpot(x: number, y: number): 'l4' | 'l5' | 'aurora' | null {
    for (const id of ['l4', 'l5', 'aurora'] as const) {
      const p = this.spotAt(id);
      if (p && Math.abs(x - p[0]) <= 10 && Math.abs(y - p[1]) <= (id === 'aurora' ? 12 : 7)) return id;
    }
    return null;
  }

  pointerDown(p: PixelPointer) {
    this.pointers.add(p.id);
    if (this.pointers.size > 1) {
      this.down = null;
      return;
    }
    this.glide = null;
    this.down = { x: p.x, y: p.y, lon0: this.cam.lon0, lat0: this.cam.lat0, moved: false };
  }

  pointerMove(p: PixelPointer) {
    const d = this.down;
    if (d && this.pointers.has(p.id)) {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
      if (d.moved) {
        // the surface follows the finger
        this.cam.lon0 = d.lon0 - dx / (this.L.r * RAD);
        this.cam.lat0 = Math.max(LAT_MIN, Math.min(LAT_MAX, d.lat0 + dy / (this.L.r * RAD)));
        this.moonHover = false;
        this.spotHover = null;
        return;
      }
    }
    this.moonHover = this.overMoon(p.x, p.y);
    this.spotHover = this.moonHover ? null : this.overSpot(p.x, p.y);
  }

  pointerUp(p: PixelPointer) {
    this.pointers.delete(p.id);
    const d = this.down;
    this.down = null;
    this.idleUntil = this.time + 2.5;
    if (!d || d.moved) return;
    if (this.game.mode === 'title') return;
    if (this.overMoon(p.x, p.y)) this.game.enterDiorama('moon');
    else {
      const spot = this.overSpot(p.x, p.y);
      if (spot) this.game.enterDiorama(spot);
    }
  }

  pointerLeave() {
    this.moonHover = false;
    this.spotHover = null;
  }

  wheel(_p: PixelPointer, deltaY: number) {
    // wheel up zooms back in to the map; down turns the globe a little
    if (deltaY < 0) this.zoomIn();
    else this.pan(-14, 0);
  }

  destroy() {
    for (const l of [this.sky, this.ringsBack, this.ringsFront, this.globe, this.moon]) if (l) releaseTexture(l.tex);
    this.sky = this.ringsBack = this.ringsFront = this.globe = this.moon = null;
    this.root.destroy({ children: true });
  }
}
