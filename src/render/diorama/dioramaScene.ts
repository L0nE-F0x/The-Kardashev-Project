import { Container, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../../game/game';
import type { PixelPointer, Scene } from '../stage';
import { siteDef, type SiteDef } from '../../content/sites';
import type { GameState } from '../../sim/types';
import { C, getEra } from '../palette';
import { bayer, hash2, PixelCanvas } from '../pixels';
import { cachedTexture, releaseTexture, textureOf } from '../textures';
import { pixelTexture } from '../sprites/mapIcons';
import { subsolar, sunAltitude, localSolarHour } from '../../world/sun';
import { backlot, emptyPlotArt, farRidge, foreground, groundStrip, midBand, personFrames, rotorFrames, surfFrames, truckArt, truckVariant, type Emitter, type Mover } from './art';
import { bloomOf, puffArt } from './draw';
import { bands, campusLayout, itemTop, PARALLAX, type CampusLayout, type LayoutItem } from './layout';
import { bucket, itemArt } from './campusArt';

interface Plot {
  item: LayoutItem;
  kind: LayoutItem['kind'];
  x: number;
  w: number;
  h: number;
  top: number;
  sprite: Sprite;
  glow?: Sprite;
  bloom?: Sprite;
  frames: Texture[];
  glowFrames: Texture[];
  bloomFrames: Texture[];
  rotors: { sprite: Sprite; frames: Texture[]; phase: number }[];
  movers: { sprite: Sprite; frames: Texture[]; m: Mover; segs: number[]; len: number; t: number; lastX: number }[];
  emitters: { e: Emitter; timer: number }[];
  points: Record<string, [number, number]>;
  fps: number;
  /** Running (not a construction site). */
  live: boolean;
}

type PuffKind = Emitter['kind'];

interface Particle {
  sprite: Sprite;
  kind: PuffKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  r: number;
}

interface Walker {
  sprite: Sprite;
  frames: Texture[];
  x: number;
  target: number;
  speed: number;
  pause: number;
}

type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'dust';

const MAX_PARTICLES = 420;

/**
 * Side-view campus diorama. Build sites show your plots (tiered facilities, construction,
 * upgrades, empty land) and rival campuses; other sites (suppliers, mines, landing stations) are
 * view-only set pieces. Wide campuses scroll: drag (with fling), wheel / trackpad, arrow keys.
 */
export class DioramaScene implements Scene {
  readonly root = new Container();
  private readonly skyL = new Container();
  private readonly farL = new Container();
  private readonly cloudL = new Container();
  private readonly midL = new Container();
  private readonly backL = new Container(); // distant skyline (parallax 0.75)
  private readonly backGlowL = new Container();
  private readonly world = new Container(); // ground, plots, actors (parallax 1)
  private readonly groundL = new Container();
  private readonly plotL = new Container();
  private readonly actorL = new Container();
  private readonly fxL = new Container();
  private readonly fgL = new Container();
  private readonly weatherL = new Container();
  private readonly glowL = new Container();
  private readonly bloomL = new Container();
  private readonly hintL = new Container();
  private readonly site: SiteDef;
  private layout: CampusLayout | null = null;
  private vw = 640;
  private vh = 360;
  private camX = 0;
  private camTarget = 0;
  private vel = 0;
  private sceneW = 640;
  private groundY = 300;
  private plots: Plot[] = [];
  private plotKey = '';
  private walkers: Walker[] = [];
  private particles: Particle[] = [];
  private pool: Sprite[] = [];
  private rain: Sprite[] = [];
  private surf: { sprite: Sprite; frames: Texture[] } | null = null;
  private clouds: { sprite: Sprite; x: number; v: number }[] = [];
  private truck: { sprite: Sprite; x: number; target: number; wait: number } | null = null;
  private skySprite = new Sprite();
  private stars = new Sprite();
  private sun = new Sprite();
  private moon = new Sprite();
  private haze = new Sprite();
  private hintL0 = new Sprite();
  private hintR0 = new Sprite();
  private skyKey = '';
  private skyTex: Texture | null = null;
  private starTex: Texture | null = null;
  private hazeTex: Texture | null = null;
  private ownTextures: Texture[] = [];
  private time = 0;
  private truckTimer = 4;
  private weather: Weather = 'clear';
  private darkness = 0;
  private hoverPlot: Plot | null = null;
  private down: { x: number; camX: number; moved: boolean; lastX: number; lastT: number } | null = null;
  private timeOffset = 0;
  private idle = 0;
  private wheelX: ((e: WheelEvent) => void) | null = null;
  /** Menu cinematic: drift slowly across the campus. */
  autoPan = false;
  private panDir = 1;

  constructor(
    private readonly game: Game,
    private readonly siteId: string,
  ) {
    this.site = siteDef(siteId);
    this.root.addChild(this.skyL, this.farL, this.cloudL, this.midL, this.backL, this.backGlowL, this.world, this.weatherL, this.glowL, this.bloomL, this.hintL);
    this.skyL.addChild(this.skySprite, this.stars, this.sun, this.moon, this.haze);
    this.world.addChild(this.groundL, this.plotL, this.actorL, this.fxL, this.fgL);
    this.bloomL.blendMode = 'add';
    this.sun.texture = cachedTexture('dio:sun', () => {
      const pc = new PixelCanvas(13, 13);
      pc.circle(6.5, 6.5, 6, C.yel0);
      pc.circle(6.5, 6.5, 5, C.yel1);
      pc.circle(5.5, 5.5, 2.5, C.yel2);
      return pc;
    });
    this.moon.texture = cachedTexture('dio:moon', () => {
      const pc = new PixelCanvas(9, 9);
      pc.circle(4.5, 4.5, 4, C.ice2);
      pc.set(3, 3, C.ice1);
      pc.set(5, 6, C.ice1);
      pc.set(6, 3, C.ice1);
      return pc;
    });
    // "more this way" chevrons at the screen edges when the campus is wider than the view
    const chevron = (flip: boolean) =>
      cachedTexture(`dio:chev:${flip}`, () => {
        const pc = PixelCanvas.from(`a..\n.a.\n..a\n.a.\na..`, { a: 'white' });
        const out = new PixelCanvas(pc.w, pc.h);
        out.blit(pc, 0, 0, flip);
        return out;
      });
    this.hintL0.texture = chevron(true);
    this.hintR0.texture = chevron(false);
    this.hintL.addChild(this.hintL0, this.hintR0);
    this.weather = this.pickWeather();
    // horizontal trackpad swipes (the stage forwards only deltaY to scenes)
    const canvas = this.game.stage?.canvas;
    if (canvas) {
      this.wheelX = (e: WheelEvent) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.nudge(e.deltaX * (e.deltaMode === 1 ? 16 : 1) * 0.4);
      };
      canvas.addEventListener('wheel', this.wheelX, { passive: true });
    }
  }

  // ── public API ────────────────────────────────────────────────────────────────────────────
  /** Suppliers, mines and landing stations: look, don't build. */
  get viewOnly(): boolean {
    return this.site.kind !== 'build';
  }

  /** Camera position for a DOM scrollbar: x in [0, max], view and scene widths in game pixels. */
  scrollInfo(): { x: number; max: number; view: number; width: number } {
    return { x: Math.round(this.camX), max: Math.max(0, this.sceneW - this.vw), view: this.vw, width: this.sceneW };
  }

  /** Scroll to a fraction 0..1 of the campus (e.g. from a DOM scrollbar). */
  scrollTo(fraction: number, instant = false) {
    this.camTarget = Math.max(0, Math.min(1, fraction)) * Math.max(0, this.sceneW - this.vw);
    this.vel = 0;
    if (instant) this.camX = this.camTarget;
  }

  /** Centre the camera on one of your facilities (after building it, or from the inspector). */
  focusFacility(id: string, instant = false) {
    this.rebuildPlots();
    const p = this.plots.find((x) => x.item.facility?.id === id);
    if (!p) return;
    this.camTarget = this.clampCam(p.x + p.w / 2 - this.vw / 2);
    this.vel = 0;
    if (instant) this.camX = this.camTarget;
  }

  /** Keyboard / button panning (main.ts calls pan(±12, 0) on arrow keys). */
  pan(dx: number, _dy = 0) {
    this.nudge(dx * 2);
  }

  // ── layout ────────────────────────────────────────────────────────────────────────────────
  resize(w: number, h: number) {
    this.vw = w;
    this.vh = h;
    this.groundY = bands(w, h, w).groundY;
    this.plotKey = '';
    this.skyKey = '';
    this.rebuildPlots();
  }

  subpixel() {
    return { x: 0, y: 0 };
  }

  private clampCam(x: number) {
    return Math.max(0, Math.min(Math.max(0, this.sceneW - this.vw), x));
  }

  private nudge(dx: number) {
    this.camTarget = this.clampCam(this.camTarget + dx);
    this.vel = 0;
    this.idle = 0;
  }

  /** Company initials for signage ("Little Sun Labs" → "LSL"). */
  private label(): string {
    const name = this.game.view?.company.name ?? 'Kardashev Project';
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words.map((w) => w[0]).join('') : name).slice(0, 3).toUpperCase();
  }

  /** Everything that changes what the campus looks like (cheap to compute every frame). */
  private stateKey(s: GameState | null): string {
    if (!s) return 'none';
    if (this.viewOnly) return 'view';
    const ss = s.sites[this.siteId];
    const grid = ss ? ss.grid.mw + ss.grid.pending.length : 0;
    let k = `${grid > 0}|${ss?.extraSlots ?? 0}|`;
    for (const f of s.facilities) {
      if (f.siteId !== this.siteId) continue;
      k += `${f.id}:${f.status}:${f.tier ?? 1}:${f.status === 'building' ? bucket(f.progress / Math.max(1, f.buildDays)) : ''}:${f.upgrade ? `${f.upgrade.to}@${bucket(f.upgrade.progress / Math.max(1, f.upgrade.buildDays), 6)}` : ''}:${f.blocked ? 1 : 0},`;
    }
    for (const b of s.rivalBuilds ?? []) {
      if (b.siteId !== this.siteId) continue;
      k += `r${b.id}:${b.status}:${b.status === 'building' ? bucket((s.day - b.startDay) / Math.max(1, b.readyDay - b.startDay)) : ''},`;
    }
    return k;
  }

  /** Recreate background bands and facility sprites when the campus changes. */
  private rebuildPlots() {
    const s = this.game.view ?? null;
    const label = this.label();
    const key = `${this.vw}x${this.vh}|${getEra()}|${label}|${this.stateKey(s)}`;
    if (key === this.plotKey) return;
    this.plotKey = key;
    for (const p of this.plots) {
      p.sprite.destroy();
      p.glow?.destroy();
      p.bloom?.destroy();
      p.rotors.forEach((r) => r.sprite.destroy());
      p.movers.forEach((m) => m.sprite.destroy());
    }
    this.plots = [];
    this.hoverPlot = null;
    this.plotL.removeChildren();
    this.glowL.removeChildren();
    this.bloomL.removeChildren();

    const layout = campusLayout(s, this.siteId, this.vw);
    this.layout = layout;
    for (const item of layout.items) {
      const plot = this.makePlot(item, label, s?.day ?? 0);
      if (plot) this.plots.push(plot);
    }
    if (layout.propertyLine !== undefined) {
      const pl = new Sprite(cachedTexture('dio:propline', () => {
        const pc = new PixelCanvas(3, 14);
        pc.vline(1, 0, 14, C.ink6);
        pc.set(0, 0, C.ink8);
        pc.set(2, 0, C.ink8);
        pc.set(1, 4, C.red3);
        return pc;
      }));
      pl.position.set(layout.propertyLine, this.groundY + 1 - 14);
      this.plotL.addChildAt(pl, 0);
    }
    this.sceneW = layout.width;
    this.camX = this.clampCam(this.camX);
    this.camTarget = this.clampCam(this.camTarget);
    this.rebuildBands();
    this.spawnWalkers();
  }

  private makePlot(item: LayoutItem, label: string, day: number): Plot | null {
    const ia = itemArt(item, label, day);
    if (!ia) return null;
    const art = ia.art;
    const top = itemTop(item, this.groundY);
    const frames = art.base.map((pc, i) => cachedTexture(`dio:${ia.key}:${i}`, () => pc));
    const glowFrames = ia.building ? [] : art.glow.map((pc, i) => cachedTexture(`dio:${ia.key}:g${i}`, () => pc));
    const bloomFrames = ia.building ? [] : art.glow.map((pc, i) => cachedTexture(`dio:${ia.key}:b${i}`, () => bloomOf(pc)));
    const sprite = new Sprite(frames[0]);
    sprite.position.set(item.x, top);
    this.plotL.addChild(sprite);
    let glow: Sprite | undefined;
    let bloom: Sprite | undefined;
    if (glowFrames.length) {
      glow = new Sprite(glowFrames[0]);
      glow.position.copyFrom(sprite.position);
      this.glowL.addChild(glow);
      bloom = new Sprite(bloomFrames[0]);
      bloom.position.copyFrom(sprite.position);
      this.bloomL.addChild(bloom);
    }
    const live = !ia.building;
    const rotors: Plot['rotors'] = [];
    if (live) {
      (art.rotors ?? []).forEach((r, i) => {
        const fr = rotorFrames(r.size, r.col).map((pc, k) => cachedTexture(`dio:rotor:${r.size}:${r.col}:${k}`, () => pc));
        const sp = new Sprite(fr[0]);
        sp.position.set(item.x + r.x - r.size - 1, top + r.y - r.size - 1);
        this.plotL.addChild(sp);
        rotors.push({ sprite: sp, frames: fr, phase: i * 2.7 + item.x * 0.01 });
      });
    }
    const movers: Plot['movers'] = [];
    if (live) {
      (art.movers ?? []).forEach((m, i) => {
        const fr = m.frames.map((pc, k) => cachedTexture(`dio:mover:${ia.key}:${i}:${k}`, () => pc));
        const segs: number[] = [];
        let len = 0;
        for (let k = 0; k + 1 < m.path.length; k++) {
          const d = Math.hypot(m.path[k + 1][0] - m.path[k][0], m.path[k + 1][1] - m.path[k][1]);
          segs.push(d);
          len += d;
        }
        const sp = new Sprite(fr[0]);
        this.plotL.addChild(sp);
        movers.push({ sprite: sp, frames: fr, m, segs, len: Math.max(1, len), t: m.phase, lastX: 0 });
      });
    }
    const emitters = live ? (art.emitters ?? []).map((e) => ({ e, timer: hash2(e.x, e.y, item.x) / Math.max(0.1, e.rate) })) : [];
    return {
      item,
      kind: item.kind,
      x: item.x,
      w: item.w,
      h: item.h,
      top,
      sprite,
      glow,
      bloom,
      frames,
      glowFrames,
      bloomFrames,
      rotors,
      movers,
      emitters,
      points: art.points,
      fps: art.fps ?? 0,
      live,
    };
  }

  /** Parallax bands sized to the scene. */
  private rebuildBands() {
    for (const t of this.ownTextures) releaseTexture(t);
    this.ownTextures = [];
    this.farL.removeChildren();
    this.midL.removeChildren();
    this.backL.removeChildren();
    this.backGlowL.removeChildren();
    this.groundL.removeChildren();
    this.fgL.removeChildren();
    const L = this.layout!;
    const b = bands(this.vw, this.vh, this.sceneW);
    const seed = Math.floor(hash2(this.site.lat * 10, this.site.lon * 10, 3) * 1000);
    const far = textureOf(farRidge(this.site.backdrop, b.farW, b.farH, seed));
    const mid = textureOf(midBand(this.site.backdrop, b.midW, b.midH, seed, L.beachFrom !== undefined ? L.beachFrom + 10 : undefined));
    const ground = textureOf(groundStrip(this.site.backdrop, this.sceneW, b.groundH, { beachFrom: L.beachFrom, cableX: L.cableX }));
    const fg = textureOf(foreground(this.site.backdrop, this.sceneW + 40, b.fgH));
    this.ownTextures.push(far, mid, ground, fg);
    const farS = new Sprite(far);
    farS.y = b.farY;
    this.farL.addChild(farS);
    const midS = new Sprite(mid);
    midS.y = b.midY;
    this.midL.addChild(midS);
    if (L.skyline > 0) {
      const bl = backlot(b.backW, b.backH, seed, L.skyline);
      const bt = textureOf(bl.base);
      const gt = textureOf(bl.glow);
      const bb = textureOf(bloomOf(bl.glow));
      this.ownTextures.push(bt, gt, bb);
      const bs = new Sprite(bt);
      bs.y = b.backY;
      this.backL.addChild(bs);
      const gs = new Sprite(gt);
      gs.y = b.backY;
      const bbs = new Sprite(bb);
      bbs.y = b.backY;
      bbs.blendMode = 'add';
      bbs.alpha = 0.5;
      this.backGlowL.addChild(gs, bbs);
    }
    const gS = new Sprite(ground);
    gS.y = this.groundY;
    this.groundL.addChild(gS);
    // rolling surf at landing stations
    this.surf = null;
    if (L.beachFrom !== undefined) {
      const sw = Math.max(8, this.sceneW - L.beachFrom - 30);
      const fr = surfFrames(sw).map((pc, i) => cachedTexture(`dio:surf:${sw}:${i}`, () => pc));
      const sp = new Sprite(fr[0]);
      sp.position.set(L.beachFrom + 30, this.groundY + 3);
      this.groundL.addChild(sp);
      this.surf = { sprite: sp, frames: fr };
    }
    const fgS = new Sprite(fg);
    fgS.y = this.vh - b.fgH + 2;
    this.fgL.addChild(fgS);
    // street lamps along the road
    for (let x = 40; x < this.sceneW; x += 90) {
      if (L.beachFrom !== undefined && x > L.beachFrom - 10) break;
      const post = new Sprite(cachedTexture('dio:lamp', () => PixelCanvas.from(`aa.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\naaa`, { a: 'ink6' })));
      post.position.set(x, this.groundY + 4);
      this.groundL.addChild(post);
      const halo = new Sprite(haloTexture());
      halo.position.set(x - 7, this.groundY - 3);
      halo.blendMode = 'add';
      this.glowL.addChild(halo);
    }
    // clouds
    this.cloudL.removeChildren();
    this.clouds = [];
    const n = this.weather === 'clear' ? 3 : this.weather === 'dust' ? 2 : 7;
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(cachedTexture(`dio:cloud:${i % 4}:${this.weather === 'rain' ? 'g' : 'w'}`, () => cloudArt(i % 4, this.weather === 'rain')));
      sp.y = 12 + hash2(i, 9, 2) * this.vh * 0.25;
      this.cloudL.addChild(sp);
      this.clouds.push({ sprite: sp, x: hash2(i, 3, 4) * this.vw, v: 1.5 + hash2(i, 5, 6) * 2.5 });
    }
    this.buildWeather();
  }

  private spawnWalkers() {
    this.walkers.forEach((w) => w.sprite.destroy());
    this.walkers = [];
    const solid = this.plots.filter((p) => p.kind !== 'empty').length;
    const count = Math.min(Math.round(8 + this.sceneW / 60), 2 + solid * 2);
    for (let i = 0; i < count; i++) {
      const frames = personFrames(i).map((pc, k) => cachedTexture(`dio:person:${i % 12}:${k}`, () => pc));
      const sp = new Sprite(frames[0]);
      this.actorL.addChild(sp);
      const x = 20 + hash2(i, 1, 9) * (this.sceneW - 40);
      this.walkers.push({ sprite: sp, frames, x, target: x, speed: 6 + hash2(i, 2, 9) * 6, pause: hash2(i, 3, 9) * 3 });
    }
  }

  private pickWeather(): Weather {
    if (!this.game.settings.weather) return 'clear';
    const s = this.game.view;
    const day = s?.day ?? 0;
    const r = hash2(Math.floor(day / 3), Math.floor(this.site.lat * 7 + this.site.lon), 17);
    const wet = this.site.backdrop === 'desert' ? 0.05 : this.site.water > 0.7 ? 0.35 : 0.22;
    if (r < wet) {
      const month = new Date().getUTCMonth();
      const winter = this.site.lat > 0 ? month < 3 || month > 10 : month > 4 && month < 9;
      return this.site.climateC < 8 && winter ? 'snow' : 'rain';
    }
    if (this.site.backdrop === 'desert' && r > 0.9) return 'dust';
    return r < wet + 0.3 ? 'cloudy' : 'clear';
  }

  private buildWeather() {
    this.rain.forEach((r) => r.destroy());
    this.rain = [];
    if (this.weather !== 'rain' && this.weather !== 'snow') return;
    const n = this.weather === 'rain' ? 140 : 90;
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(this.weather === 'rain' ? cachedTexture('dio:drop', () => PixelCanvas.from('a\na\nb', { a: 'blu6', b: 'blu5' })) : pixelTexture());
      sp.alpha = this.weather === 'rain' ? 0.7 : 0.9;
      sp.position.set(hash2(i, 1, 71) * this.vw, hash2(i, 2, 71) * this.vh);
      this.weatherL.addChild(sp);
      this.rain.push(sp);
    }
  }

  // ── sky ───────────────────────────────────────────────────────────────────────────────────
  private clock(): Date {
    if (!this.game.settings.dayNight) {
      const now = new Date();
      const utcNoon = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12) - (this.site.lon / 15) * 3_600_000;
      return new Date(utcNoon);
    }
    return new Date(Date.now() + this.timeOffset);
  }

  private updateSky(dt: number) {
    if (this.game.dioramaTimelapse) this.timeOffset += dt * 2160 * 1000;
    const date = this.clock();
    const sub = subsolar(date);
    const alt = sunAltitude(this.site.lat, this.site.lon, sub);
    const hour = localSolarHour(this.site.lon, date);
    const phase = alt > 10 ? 'day' : alt > 0 ? 'golden' : alt > -6 ? 'sunset' : alt > -12 ? 'twilight' : 'night';
    const target = phase === 'day' ? 0 : phase === 'golden' ? 0.12 : phase === 'sunset' ? 0.38 : phase === 'twilight' ? 0.62 : 0.78;
    this.darkness += (target - this.darkness) * Math.min(1, dt * 2);
    const key = `${phase}|${this.weather}|${this.vw}x${this.vh}|${getEra()}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const skyH = this.groundY + 4;
      const cols: Record<string, number[]> = {
        day: [C.sky1, C.sky2, C.sky3, C.sky4, C.sky5],
        golden: [C.sky1, C.sky2, C.sky3, C.yel1, C.dusk6],
        sunset: [C.dusk1, C.dusk2, C.dusk3, C.dusk4, C.dusk5, C.dusk6],
        twilight: [C.night1, C.night2, C.dusk1, C.dusk2, C.dusk3],
        night: [C.night0, C.night1, C.night2, C.night3],
      };
      let ramp = cols[phase];
      if (this.weather === 'rain' || this.weather === 'snow') ramp = phase === 'day' || phase === 'golden' ? [C.ink5, C.ink6, C.ink7, C.ink8] : ramp;
      if (this.weather === 'dust' && (phase === 'day' || phase === 'golden')) ramp = [C.snd4, C.snd5, C.snd6, C.snd7];
      const pc = new PixelCanvas(this.vw + 2, skyH);
      pc.vgradient(0, 0, pc.w, pc.h, ramp);
      if (this.skyTex) releaseTexture(this.skyTex);
      this.skyTex = textureOf(pc);
      this.skySprite.texture = this.skyTex;
      const st = new PixelCanvas(this.vw + 2, Math.round(skyH * 0.7));
      for (let i = 0; i < 90; i++) st.set(Math.floor(hash2(i, 1, 33) * st.w), Math.floor(hash2(i, 2, 33) * st.h), hash2(i, 3, 33) > 0.85 ? C.yel2 : C.ice2);
      if (this.starTex) releaseTexture(this.starTex);
      this.starTex = textureOf(st);
      this.stars.texture = this.starTex;
      const hz = new PixelCanvas(this.vw + 2, 24);
      if (getEra() === 0 && phase !== 'night') for (let y = 0; y < 24; y++) for (let x = 0; x < hz.w; x++) if (bayer(x, y) < (y / 24) * 3.5) hz.set(x, y, C.snd6);
      if (this.hazeTex) releaseTexture(this.hazeTex);
      this.hazeTex = textureOf(hz);
      this.haze.texture = this.hazeTex;
      this.haze.y = this.groundY - Math.round(this.vh * 0.32);
      this.haze.alpha = 0.55;
    }
    this.stars.alpha = Math.max(0, (this.darkness - 0.45) * 2.2) * (0.85 + Math.sin(this.time * 1.7) * 0.15);
    const span = this.vw * 0.9;
    const horizon = this.groundY - 10;
    const sx = this.vw * 0.05 + ((hour - 6) / 12) * span;
    this.sun.visible = alt > -4 && this.weather !== 'rain';
    this.sun.position.set(Math.round(sx - 6), Math.round(horizon - (Math.max(-4, alt) / 70) * (horizon - 16) - 6));
    const mh = (hour + 12) % 24;
    this.moon.visible = alt < -2;
    this.moon.position.set(Math.round(this.vw * 0.05 + ((mh - 6) / 12) * span - 4), Math.round(horizon * 0.35 + Math.abs(mh - 12) * 6));
    // night grading: every lit layer is tinted; the glow layers above stay bright
    const night = [0.24, 0.27, 0.5];
    const warm = [1, 0.86, 0.72];
    const d = this.darkness;
    let r = 1 - (1 - night[0]) * d;
    let g = 1 - (1 - night[1]) * d;
    let b = 1 - (1 - night[2]) * d;
    if (phase === 'golden' || phase === 'sunset') {
      r *= warm[0];
      g *= warm[1];
      b *= warm[2];
    }
    if (this.weather === 'rain' || this.weather === 'snow') {
      r *= 0.85;
      g *= 0.87;
      b *= 0.92;
    }
    const tint = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    for (const l of [this.skyL, this.farL, this.cloudL, this.midL, this.backL, this.world, this.weatherL]) l.tint = tint;
    const lightsOn = Math.max(0, Math.min(1, (this.darkness - 0.25) * 2.4));
    this.glowL.alpha = lightsOn;
    this.backGlowL.alpha = lightsOn;
    this.bloomL.alpha = lightsOn * 0.55;
    this.glowL.visible = this.backGlowL.visible = lightsOn > 0.01;
    this.bloomL.visible = lightsOn > 0.01 && !this.game.settings.batterySaver;
  }

  // ── per-frame ─────────────────────────────────────────────────────────────────────────────
  update(dt: number) {
    this.time += dt;
    this.rebuildPlots();
    this.updateCamera(dt);
    this.updateSky(dt);
    this.weatherL.visible = this.game.settings.weather && !this.game.settings.reducedMotion;
    const cx = Math.round(this.camX);
    this.world.x = -cx;
    this.glowL.x = -cx;
    this.bloomL.x = -cx;
    this.farL.x = -Math.round(this.camX * PARALLAX.far);
    this.midL.x = -Math.round(this.camX * PARALLAX.mid);
    this.backL.x = this.backGlowL.x = -Math.round(this.camX * PARALLAX.back);
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > this.vw + 10) c.x = -c.sprite.width - 10;
      c.sprite.x = Math.round(c.x);
    }
    const windSpeed = Math.max(0.25, this.site.windCF) * 2.4;
    const saver = this.game.settings.batterySaver;
    for (const p of this.plots) {
      if (p.frames.length > 1 && p.fps > 0) {
        const fi = Math.floor(this.time * p.fps + p.x) % p.frames.length;
        p.sprite.texture = p.frames[fi];
        if (p.glow && p.glowFrames[fi]) p.glow.texture = p.glowFrames[fi];
        if (p.bloom && p.bloomFrames[fi]) p.bloom.texture = p.bloomFrames[fi];
      }
      for (const r of p.rotors) r.sprite.texture = r.frames[Math.floor((this.time + r.phase) * 8 * windSpeed) % r.frames.length];
      for (const mv of p.movers) this.moveMover(p, mv, dt);
      for (const em of p.emitters) {
        em.timer -= dt;
        if (em.timer > 0) continue;
        em.timer += (saver ? 2.2 : 1) / Math.max(0.1, em.e.rate);
        const e = em.e;
        const sx = p.x + e.x + (e.spread ? (Math.random() - 0.5) * 2 * e.spread : 0);
        this.spawnPuff(e.kind, sx, p.top + e.y, e.size);
      }
    }
    if (this.surf) this.surf.sprite.texture = this.surf.frames[Math.floor(this.time * 3) % this.surf.frames.length];
    // hover highlight
    for (const p of this.plots) {
      if (p.kind === 'empty') p.sprite.texture = cachedTexture(`dio:empty:${p.w}:${p === this.hoverPlot}`, () => emptyPlotArt(p.w, p === this.hoverPlot));
      else p.sprite.tint = p === this.hoverPlot ? 0xfff2cc : 0xffffff;
    }
    // edge hints
    const max = Math.max(0, this.sceneW - this.vw);
    this.idle += dt;
    const pulse = 0.35 + Math.sin(this.time * 3) * 0.15;
    const show = max > 0 && !this.autoPan ? Math.max(0.25, 1 - Math.max(0, this.idle - 2) * 0.5) * pulse * 1.6 : 0;
    const hy = Math.round(this.groundY * 0.55);
    this.hintL0.position.set(3, hy);
    this.hintR0.position.set(this.vw - 6, hy);
    this.hintL0.alpha = this.camX > 2 ? show : 0;
    this.hintR0.alpha = this.camX < max - 2 ? show : 0;
    this.updateWalkers(dt);
    this.updateTruck(dt);
    this.updateParticles(dt);
    this.updateWeather(dt);
  }

  private updateCamera(dt: number) {
    const max = Math.max(0, this.sceneW - this.vw);
    if (this.autoPan && max > 0) {
      this.camTarget += this.panDir * dt * 9;
      if (this.camTarget > max) this.panDir = -1;
      if (this.camTarget < 0) this.panDir = 1;
      this.camTarget = this.clampCam(this.camTarget);
      this.camX = this.camTarget;
      return;
    }
    if (this.down?.moved) return;
    if (Math.abs(this.vel) > 4) {
      // fling after a drag
      this.camX += this.vel * dt;
      this.vel *= Math.exp(-dt * 4.5);
      if (this.camX <= 0 || this.camX >= max) this.vel = 0;
      this.camX = this.clampCam(this.camX);
      this.camTarget = this.camX;
      return;
    }
    this.vel = 0;
    const diff = this.camTarget - this.camX;
    this.camX = Math.abs(diff) < 0.5 ? this.camTarget : this.camX + diff * Math.min(1, dt * 10);
    this.camX = this.clampCam(this.camX);
  }

  private moveMover(p: Plot, mv: Plot['movers'][number], dt: number) {
    const m = mv.m;
    mv.t = (mv.t + (dt * m.speed) / mv.len) % 1;
    let u = mv.t;
    let back = false;
    if (m.pingpong) {
      back = u >= 0.5;
      u = u < 0.5 ? u * 2 : 2 - u * 2;
    }
    let d = u * mv.len;
    let px = m.path[0][0];
    let py = m.path[0][1];
    let dir = 1;
    for (let i = 0; i < mv.segs.length; i++) {
      const a = m.path[i];
      const b = m.path[i + 1];
      if (d <= mv.segs[i] || i === mv.segs.length - 1) {
        const k = mv.segs[i] ? Math.min(1, d / mv.segs[i]) : 0;
        px = a[0] + (b[0] - a[0]) * k;
        py = a[1] + (b[1] - a[1]) * k;
        dir = Math.sign(b[0] - a[0]) || 1;
        break;
      }
      d -= mv.segs[i];
    }
    if (back) dir = -dir;
    const fw = mv.frames[0].width;
    const fh = mv.frames[0].height;
    mv.sprite.texture = mv.frames[Math.floor(this.time * 4) % mv.frames.length];
    // sprites face right; mirror them when driving left
    mv.sprite.scale.x = dir < 0 ? -1 : 1;
    mv.sprite.position.set(p.x + Math.round(px) - Math.floor(fw / 2) + (dir < 0 ? fw : 0), p.top + Math.round(py) - fh);
  }

  private spawnPuff(kind: PuffKind, x: number, y: number, size?: number) {
    if (this.particles.length >= MAX_PARTICLES) return;
    const sp = this.pool.pop() ?? new Sprite();
    sp.visible = true;
    sp.alpha = 1;
    this.fxL.addChild(sp);
    const wind = 2 + Math.max(0.1, this.site.windCF) * 10;
    let vx: number;
    let vy: number;
    let max: number;
    let maxR: number;
    switch (kind) {
      case 'steam':
        vx = wind * (0.6 + Math.random() * 0.6);
        vy = -7 - Math.random() * 4;
        max = 4 + Math.random() * 1.5;
        maxR = size ?? 4;
        break;
      case 'smoke':
        vx = 3 + Math.random() * 4;
        vy = -6 - Math.random() * 4;
        max = 3.5;
        maxR = size ?? 3;
        break;
      case 'vapor':
        vx = wind * 0.5 + Math.random() * 2;
        vy = -5 - Math.random() * 3;
        max = 2 + Math.random();
        maxR = size ?? 2;
        break;
      default:
        // spray / cold mist: drifts and falls back
        vx = (Math.random() - 0.5) * 10;
        vy = -4 - Math.random() * 6;
        max = 0.6 + Math.random() * 0.6;
        maxR = size ?? 1;
    }
    this.particles.push({ sprite: sp, kind, x, y, vx, vy, life: 0, max, size: maxR, r: -1 });
  }

  private updateParticles(dt: number) {
    let n = 0;
    for (const p of this.particles) {
      p.life += dt;
      if (p.life > p.max) {
        p.sprite.visible = false;
        this.fxL.removeChild(p.sprite);
        this.pool.push(p.sprite);
        continue;
      }
      const k = p.life / p.max;
      if (p.kind === 'mist') p.vy += 18 * dt;
      else p.vy *= 1 - dt * 0.35;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const r = p.kind === 'mist' ? 1 : Math.max(1, Math.min(p.size, 1 + Math.floor(k * (p.size + 1))));
      if (r !== p.r) {
        p.r = r;
        p.sprite.texture = cachedTexture(`dio:puff:${p.kind}:${r}`, () => puffArt(r, p.kind));
      }
      p.sprite.position.set(Math.round(p.x - r), Math.round(p.y - r));
      p.sprite.alpha = p.kind === 'mist' ? 0.9 : 0.9 * (1 - k * k);
      this.particles[n++] = p;
    }
    this.particles.length = n;
  }

  private updateWalkers(dt: number) {
    const footY = this.groundY + 3;
    for (const w of this.walkers) {
      if (w.pause > 0) {
        w.pause -= dt;
        w.sprite.texture = w.frames[0];
      } else {
        const dir = Math.sign(w.target - w.x);
        w.x += dir * w.speed * dt;
        if (Math.abs(w.target - w.x) < 1) {
          w.pause = 1 + Math.random() * 4;
          const plots = this.plots.filter((p) => p.kind !== 'empty');
          const p = plots[Math.floor(Math.random() * Math.max(1, plots.length))];
          w.target = p ? p.x + p.w * (0.2 + Math.random() * 0.6) : 20 + Math.random() * (this.sceneW - 40);
        }
        w.sprite.texture = w.frames[Math.floor(this.time * 6 + w.x) % 2];
        w.sprite.scale.x = dir < 0 ? -1 : 1;
      }
      w.sprite.position.set(Math.round(w.x) + (w.sprite.scale.x < 0 ? 3 : 0), footY);
    }
  }

  /** Trucks call at loading docks: chips to your halls, wafers and gases at suppliers. */
  private updateTruck(dt: number) {
    if (!this.truck) {
      this.truckTimer -= dt;
      if (this.truckTimer > 0) return;
      const docks = this.plots.filter((p) => p.live && p.points.dock && (this.viewOnly || p.item.type === 'datacenter' || p.item.type === 'campus' || p.item.type === 'fab' || p.item.type === 'packaging'));
      if (!docks.length) {
        this.truckTimer = 6;
        return;
      }
      const dock = docks[Math.floor(Math.random() * docks.length)];
      let tex: Texture;
      if (!this.viewOnly) tex = cachedTexture('dio:truck', truckArt);
      else {
        const pc = dock.item.piece;
        const kind = pc?.kind === 'gasWorks' || pc?.kind === 'gasYard' ? 'tanker' : this.site.kind === 'mine' ? 'flatbed' : 'box';
        const accent = pc?.accent ?? C.blu4;
        tex = cachedTexture(`dio:truck:${kind}:${accent}`, () => truckVariant(kind, accent));
      }
      const sp = new Sprite(tex);
      this.actorL.addChild(sp);
      this.truck = { sprite: sp, x: -30, target: dock.x + dock.points.dock[0] - 4, wait: 3 };
      return;
    }
    const t = this.truck;
    if (t.x < t.target) t.x = Math.min(t.target, t.x + 28 * dt);
    else if (t.wait > 0) t.wait -= dt;
    else t.x += 28 * dt;
    t.sprite.position.set(Math.round(t.x), this.groundY + 8);
    const end = this.layout?.beachFrom ?? this.sceneW;
    if (t.x > end + 30 || (this.layout?.beachFrom !== undefined && t.x > end - 20)) {
      t.sprite.destroy();
      this.truck = null;
      this.truckTimer = 10 + Math.random() * 15;
    }
  }

  private updateWeather(dt: number) {
    if (!this.rain.length) return;
    const rain = this.weather === 'rain';
    for (let i = 0; i < this.rain.length; i++) {
      const sp = this.rain[i];
      sp.y += (rain ? 140 : 18) * dt;
      sp.x += (rain ? -30 : Math.sin(this.time + i) * 6) * dt;
      if (sp.y > this.groundY + 12) {
        sp.y = -4;
        sp.x = Math.random() * (this.vw + 30);
      }
      if (sp.x < -4) sp.x += this.vw + 8;
    }
  }

  // ── input ─────────────────────────────────────────────────────────────────────────────────
  private plotAt(px: number, py: number): Plot | null {
    const wx = this.camX + px;
    for (const p of this.plots) {
      const top = p.kind === 'empty' ? this.groundY - 30 : p.top;
      if (wx >= p.x && wx < p.x + p.w && py >= top && py <= this.groundY + 10) return p;
    }
    return null;
  }

  pointerDown(p: PixelPointer) {
    this.down = { x: p.x, camX: this.camX, moved: false, lastX: p.x, lastT: performance.now() };
    this.vel = 0;
    this.idle = 0;
  }

  pointerMove(p: PixelPointer) {
    if (this.down) {
      const dx = p.x - this.down.x;
      if (Math.abs(dx) > 3) this.down.moved = true;
      if (this.down.moved) {
        const now = performance.now();
        const dtm = Math.max(1, now - this.down.lastT) / 1000;
        const v = -(p.x - this.down.lastX) / dtm;
        this.vel = this.vel * 0.6 + v * 0.4;
        this.down.lastX = p.x;
        this.down.lastT = now;
        this.camX = this.clampCam(this.down.camX - dx);
        this.camTarget = this.camX;
        this.idle = 0;
        if (this.hoverPlot) {
          this.hoverPlot = null;
          this.game.setHover(null);
        }
        return;
      }
    }
    const plot = this.plotAt(p.x, p.y);
    this.hoverPlot = plot;
    if (!plot) return this.game.setHover(null);
    if (plot.kind === 'facility' && plot.item.facility) this.game.setHover({ kind: 'facility', id: plot.item.facility.id, clientX: p.clientX, clientY: p.clientY });
    else if (plot.kind === 'empty') this.game.setHover({ kind: 'slot', siteId: this.siteId, index: plot.item.emptyIndex ?? 0, clientX: p.clientX, clientY: p.clientY });
    else this.game.setHover({ kind: 'site', id: this.siteId, clientX: p.clientX, clientY: p.clientY });
  }

  pointerUp(p: PixelPointer) {
    const d = this.down;
    this.down = null;
    if (!d) return;
    if (d.moved) {
      // keep the fling only if the finger was still moving when released
      if (performance.now() - d.lastT > 80) this.vel = 0;
      return;
    }
    this.vel = 0;
    const plot = this.plotAt(p.x, p.y);
    this.game.select({ kind: 'site', id: this.siteId });
    if (plot?.kind === 'empty') this.game.toast('Pick something to build from the panel on the right →', 'info', 'juno');
  }

  pointerLeave() {
    this.hoverPlot = null;
    this.game.setHover(null);
  }

  wheel(_p: PixelPointer, deltaY: number) {
    // mouse wheels send ~100 per notch, trackpads a stream of small deltas
    this.nudge(Math.abs(deltaY) >= 50 ? Math.sign(deltaY) * 36 : deltaY * 0.6);
  }

  destroy() {
    if (this.wheelX) this.game.stage?.canvas?.removeEventListener('wheel', this.wheelX);
    for (const t of this.ownTextures) releaseTexture(t);
    for (const t of [this.skyTex, this.starTex, this.hazeTex]) if (t) releaseTexture(t);
    for (const sp of this.pool) sp.destroy();
    this.root.destroy({ children: true });
  }
}

/** Dithered pixel halo for lamps (additive). */
function haloTexture(): Texture {
  return cachedTexture('dio:halo', () => {
    const pc = new PixelCanvas(15, 15);
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const d = Math.hypot(x - 7, y - 7) / 7;
        if (d > 1) continue;
        if (d < 0.25) pc.set(x, y, C.yel1);
        else if (bayer(x, y) < (1 - d) * 12) pc.set(x, y, d < 0.6 ? C.org2 : C.snd5);
      }
    }
    return pc;
  });
}

function cloudArt(v: number, grey: boolean): PixelCanvas {
  const w = 26 + v * 7;
  const h = 12 + (v % 2) * 3;
  const pc = new PixelCanvas(w, h);
  const base = h - 3;
  const body = grey ? C.ink7 : C.ice3;
  pc.ellipse(w / 2, base, w / 2 - 1, 2.2, body);
  const puffs = 3 + (v % 3);
  for (let b = 0; b < puffs; b++) {
    const t = (b + 0.5) / puffs;
    const cx = 3 + t * (w - 6) + (hash2(v, b, 1) - 0.5) * 3;
    const r = 2.5 + hash2(v, b, 3) * (h / 2 - 1.5) * (1.1 - Math.abs(t - 0.5));
    pc.ellipse(cx, base - r * 0.75, r * 1.2, r, body);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!pc.get(x, y)) continue;
      if (!pc.get(x, y - 1) || !pc.get(x - 1, y - 1)) pc.set(x, y, grey ? C.ink8 : C.white);
      else if (!pc.get(x, y + 1)) pc.set(x, y, grey ? C.ink6 : C.ice1);
      else if (!pc.get(x, y + 2) && bayer(x, y) < 8) pc.set(x, y, grey ? C.ink6 : C.ice2);
    }
  }
  return pc;
}
