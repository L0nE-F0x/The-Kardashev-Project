import { Container, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../../game/game';
import type { PixelPointer, Scene } from '../stage';
import { siteDef, type SiteDef } from '../../content/sites';
import type { Facility, FacilityType } from '../../sim/types';
import { C, getEra, hex } from '../palette';
import { bayer, hash2, PixelCanvas } from '../pixels';
import { cachedTexture, releaseTexture, textureOf } from '../textures';
import { pixelTexture } from '../sprites/mapIcons';
import { subsolar, sunAltitude, localSolarHour } from '../../world/sun';
import {
  constructionArt,
  emptyPlotArt,
  facilityArt,
  facilitySize,
  farRidge,
  foreground,
  groundStrip,
  midBand,
  personFrames,
  rotorFrames,
  TURBINE_LAYOUT,
  truckArt,
} from './art';

interface Plot {
  kind: 'facility' | 'empty' | 'substation';
  facility?: Facility;
  type?: FacilityType | 'substation';
  x: number;
  w: number;
  h: number;
  sprite: Sprite;
  glow?: Sprite;
  frames: Texture[];
  glowFrames: Texture[];
  rotors: { sprite: Sprite; frames: Texture[]; phase: number }[];
  points: Record<string, [number, number]>;
  fps: number;
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
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

const GAP = 10;
const EMPTY_W = 70;

export class DioramaScene implements Scene {
  readonly root = new Container();
  private readonly skyL = new Container();
  private readonly farL = new Container();
  private readonly cloudL = new Container();
  private readonly midL = new Container();
  private readonly world = new Container(); // ground, plots, actors (parallax 1)
  private readonly groundL = new Container();
  private readonly plotL = new Container();
  private readonly actorL = new Container();
  private readonly fxL = new Container();
  private readonly fgL = new Container();
  private readonly weatherL = new Container();
  private readonly dark = new Sprite();
  private readonly glowL = new Container();
  private readonly site: SiteDef;
  private vw = 640;
  private vh = 360;
  private camX = 0;
  private sceneW = 640;
  private groundY = 300;
  private plots: Plot[] = [];
  private plotKey = '';
  private walkers: Walker[] = [];
  private particles: Particle[] = [];
  private rain: Sprite[] = [];
  private clouds: { sprite: Sprite; x: number; v: number }[] = [];
  private truck: { sprite: Sprite; x: number; target: number; wait: number } | null = null;
  private skySprite = new Sprite();
  private stars = new Sprite();
  private sun = new Sprite();
  private moon = new Sprite();
  private haze = new Sprite();
  private skyKey = '';
  private skyTex: Texture | null = null;
  private starTex: Texture | null = null;
  private hazeTex: Texture | null = null;
  private ownTextures: Texture[] = [];
  private time = 0;
  private smokeTimer = 0;
  private truckTimer = 4;
  private weather: Weather = 'clear';
  private darkness = 0;
  private hoverPlot: Plot | null = null;
  private down: { x: number; camX: number; moved: boolean } | null = null;
  private timeOffset = 0;

  constructor(
    private readonly game: Game,
    private readonly siteId: string,
  ) {
    this.site = siteDef(siteId);
    this.root.addChild(this.skyL, this.farL, this.cloudL, this.midL, this.world, this.weatherL, this.dark, this.glowL);
    this.skyL.addChild(this.skySprite, this.stars, this.sun, this.moon, this.haze);
    this.world.addChild(this.groundL, this.plotL, this.actorL, this.fxL, this.fgL);
    this.dark.texture = pixelTexture();
    this.dark.blendMode = 'multiply';
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
    this.weather = this.pickWeather();
  }

  // ── layout ────────────────────────────────────────────────────────────────────────────────
  resize(w: number, h: number) {
    this.vw = w;
    this.vh = h;
    this.groundY = Math.max(90, Math.round(h * 0.8));
    this.plotKey = '';
    this.skyKey = '';
    this.rebuildPlots();
  }

  subpixel() {
    return { x: 0, y: 0 };
  }

  private facilitiesHere(): Facility[] {
    const s = this.game.state;
    if (!s) return [];
    return s.facilities.filter((f) => f.siteId === this.siteId);
  }

  /** Company initials for signage ("Little Sun Labs" → "LSL"). */
  private label(): string {
    const name = this.game.state?.company.name ?? 'Kardashev Project';
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words.map((w) => w[0]).join('') : name).slice(0, 3).toUpperCase();
  }

  /** Recreate background bands and facility sprites when the campus changes. */
  private rebuildPlots() {
    const s = this.game.state;
    const facs = this.facilitiesHere();
    const grid = s ? s.sites[this.siteId].grid.mw + s.sites[this.siteId].grid.pending.length : 0;
    const key = `${this.vw}x${this.vh}|${grid > 0}|${getEra()}|${facs.map((f) => `${f.id}:${f.status}:${f.status === 'building' ? Math.floor((f.progress / f.buildDays) * 8) : ''}`).join(',')}`;
    if (key === this.plotKey) return;
    this.plotKey = key;
    for (const p of this.plots) {
      p.sprite.destroy();
      p.glow?.destroy();
      p.rotors.forEach((r) => r.sprite.destroy());
    }
    this.plots = [];
    this.plotL.removeChildren();
    this.glowL.removeChildren();

    // order: substation, HQ, facilities, then empty plots
    const ordered: (Facility | 'substation' | 'empty')[] = [];
    if (grid > 0) ordered.push('substation');
    const hqF = facs.find((f) => f.type === 'hq');
    if (hqF) ordered.push(hqF);
    for (const f of facs) if (f.type !== 'hq') ordered.push(f);
    const used = facs.filter((f) => f.type !== 'hq').length;
    for (let i = used; i < this.site.slots; i++) ordered.push('empty');

    let x = 24;
    for (const item of ordered) {
      const plot = this.makePlot(item, x);
      this.plots.push(plot);
      x += plot.w + GAP;
    }
    this.sceneW = Math.max(this.vw, x + 24);
    this.camX = Math.max(0, Math.min(this.camX, this.sceneW - this.vw));
    this.rebuildBands();
    this.spawnWalkers();
  }

  private makePlot(item: Facility | 'substation' | 'empty', x: number): Plot {
    const gy = this.groundY + 1;
    if (item === 'empty') {
      const tex = cachedTexture(`dio:empty:${EMPTY_W}:false`, () => emptyPlotArt(EMPTY_W, false));
      const sprite = new Sprite(tex);
      sprite.position.set(x, gy - 6);
      this.plotL.addChild(sprite);
      return { kind: 'empty', x, w: EMPTY_W, h: 10, sprite, frames: [tex], glowFrames: [], rotors: [], points: {}, fps: 0 };
    }
    const type: FacilityType | 'substation' = item === 'substation' ? 'substation' : item.type;
    const [w, h] = facilitySize(type);
    const label = this.label();
    let frames: Texture[];
    let glowFrames: Texture[];
    let points: Record<string, [number, number]> = {};
    const building = item !== 'substation' && item.status === 'building';
    if (building) {
      const bucket = Math.floor((item.progress / item.buildDays) * 8) / 8;
      frames = [cachedTexture(`dio:build:${type}:${bucket}:${label}`, () => constructionArt(type as FacilityType, bucket, label))];
      glowFrames = [];
    } else {
      const art = facilityArt(type, label);
      frames = art.base.map((pc, i) => cachedTexture(`dio:${type}:${label}:${i}`, () => pc));
      glowFrames = art.glow.map((pc, i) => cachedTexture(`dio:${type}:${label}:g${i}`, () => pc));
      points = art.points;
    }
    const sprite = new Sprite(frames[0]);
    sprite.position.set(x, gy - h);
    this.plotL.addChild(sprite);
    let glow: Sprite | undefined;
    if (glowFrames.length) {
      glow = new Sprite(glowFrames[0]);
      glow.position.copyFrom(sprite.position);
      this.glowL.addChild(glow);
    }
    const rotors: Plot['rotors'] = [];
    if (type === 'wind' && !building) {
      TURBINE_LAYOUT.forEach((t, i) => {
        const fr = rotorFrames(t.size, t.col).map((pc, k) => cachedTexture(`dio:rotor:${t.size}:${k}`, () => pc));
        const sp = new Sprite(fr[0]);
        sp.position.set(x + t.x - t.size - 1, gy - h + t.top - t.size - 1);
        this.plotL.addChild(sp);
        rotors.push({ sprite: sp, frames: fr, phase: i * 2.7 });
      });
    }
    return { kind: item === 'substation' ? 'substation' : 'facility', facility: item === 'substation' ? undefined : item, type, x, w, h, sprite, glow, frames, glowFrames, rotors, points, fps: type === 'datacenter' ? 3 : type === 'battery' || type === 'hq' ? 1.2 : 0 };
  }

  /** Parallax bands sized to the scene. */
  private rebuildBands() {
    for (const t of this.ownTextures) releaseTexture(t);
    this.ownTextures = [];
    this.farL.removeChildren();
    this.midL.removeChildren();
    this.groundL.removeChildren();
    this.fgL.removeChildren();
    const seed = Math.floor(hash2(this.site.lat * 10, this.site.lon * 10, 3) * 1000);
    const farH = Math.round(this.vh * 0.32);
    const farW = Math.ceil(this.vw + (this.sceneW - this.vw) * 0.25) + 4;
    const far = textureOf(farRidge(this.site.backdrop, farW, farH, seed));
    const midH = Math.round(this.vh * 0.2);
    const midW = Math.ceil(this.vw + (this.sceneW - this.vw) * 0.55) + 4;
    const mid = textureOf(midBand(this.site.backdrop, midW, midH, seed));
    const gH = this.vh - this.groundY + 2;
    const ground = textureOf(groundStrip(this.site.backdrop, this.sceneW, gH));
    const fgH = 12;
    const fg = textureOf(foreground(this.site.backdrop, this.sceneW + 40, fgH));
    this.ownTextures.push(far, mid, ground, fg);
    const farS = new Sprite(far);
    farS.y = this.groundY - farH - Math.round(this.vh * 0.08);
    this.farL.addChild(farS);
    const midS = new Sprite(mid);
    midS.y = this.groundY - midH + 2;
    this.midL.addChild(midS);
    const gS = new Sprite(ground);
    gS.y = this.groundY;
    this.groundL.addChild(gS);
    const fgS = new Sprite(fg);
    fgS.y = this.vh - fgH + 2;
    this.fgL.addChild(fgS);
    // street lamps along the road
    for (let x = 40; x < this.sceneW; x += 90) {
      const post = new Sprite(cachedTexture('dio:lamp', () => PixelCanvas.from(`aa.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\naaa`, { a: 'ink6' })));
      post.position.set(x, this.groundY + 4);
      this.groundL.addChild(post);
      const halo = new Sprite(haloTexture());
      halo.position.set(x - 7, this.groundY - 3);
      halo.blendMode = 'add';
      (halo as Sprite & { lamp?: boolean }).lamp = true;
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
    const count = Math.min(12, 2 + this.plots.filter((p) => p.kind === 'facility').length * 2);
    for (let i = 0; i < count; i++) {
      const frames = personFrames(i).map((pc, k) => cachedTexture(`dio:person:${i % 12}:${k}`, () => pc));
      const sp = new Sprite(frames[0]);
      this.actorL.addChild(sp);
      const x = 20 + hash2(i, 1, 9) * (this.sceneW - 40);
      this.walkers.push({ sprite: sp, frames, x, target: x, speed: 6 + hash2(i, 2, 9) * 6, pause: hash2(i, 3, 9) * 3 });
    }
  }

  private pickWeather(): Weather {
    const s = this.game.state;
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
      // stars
      const st = new PixelCanvas(this.vw + 2, Math.round(skyH * 0.7));
      for (let i = 0; i < 90; i++) st.set(Math.floor(hash2(i, 1, 33) * st.w), Math.floor(hash2(i, 2, 33) * st.h), hash2(i, 3, 33) > 0.85 ? C.yel2 : C.ice2);
      if (this.starTex) releaseTexture(this.starTex);
      this.starTex = textureOf(st);
      this.stars.texture = this.starTex;
      // smog haze in the first era
      const hz = new PixelCanvas(this.vw + 2, 24);
      if (getEra() === 0 && phase !== 'night') for (let y = 0; y < 24; y++) for (let x = 0; x < hz.w; x++) if (bayer(x, y) < (y / 24) * 3.5) hz.set(x, y, C.snd6);
      if (this.hazeTex) releaseTexture(this.hazeTex);
      this.hazeTex = textureOf(hz);
      this.haze.texture = this.hazeTex;
      this.haze.y = this.groundY - Math.round(this.vh * 0.32);
      this.haze.alpha = 0.55;
    }
    this.stars.alpha = Math.max(0, (this.darkness - 0.45) * 2.2) * (0.85 + Math.sin(this.time * 1.7) * 0.15);
    // sun & moon along an arc
    const span = this.vw * 0.9;
    const horizon = this.groundY - 10;
    const sx = this.vw * 0.05 + ((hour - 6) / 12) * span;
    this.sun.visible = alt > -4 && this.weather !== 'rain';
    this.sun.position.set(Math.round(sx - 6), Math.round(horizon - Math.max(-4, alt) / 70 * (horizon - 16) - 6));
    const mh = (hour + 12) % 24;
    this.moon.visible = alt < -2;
    this.moon.position.set(Math.round(this.vw * 0.05 + ((mh - 6) / 12) * span - 4), Math.round(horizon * 0.35 + Math.abs(mh - 12) * 6));
    // night tint
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
    this.dark.tint = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    this.dark.width = this.vw + 2;
    this.dark.height = this.vh + 2;
    const lightsOn = Math.max(0, Math.min(1, (this.darkness - 0.25) * 2.4));
    this.glowL.alpha = lightsOn;
  }

  // ── per-frame ─────────────────────────────────────────────────────────────────────────────
  update(dt: number) {
    this.time += dt;
    this.rebuildPlots();
    this.updateSky(dt);
    const cx = Math.round(this.camX);
    this.world.x = -cx;
    this.glowL.x = -cx;
    this.farL.x = -Math.round(this.camX * 0.25);
    this.midL.x = -Math.round(this.camX * 0.55);
    // clouds
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > this.vw + 10) c.x = -c.sprite.width - 10;
      c.sprite.x = Math.round(c.x);
    }
    // facility animation
    const windSpeed = this.site.windCF * 2.4;
    for (const p of this.plots) {
      if (p.frames.length > 1 && p.fps > 0) {
        const fi = Math.floor(this.time * p.fps + p.x) % p.frames.length;
        p.sprite.texture = p.frames[fi];
        if (p.glow && p.glowFrames[fi]) p.glow.texture = p.glowFrames[fi];
      }
      for (const r of p.rotors) {
        const fi = Math.floor((this.time + r.phase) * 8 * windSpeed) % r.frames.length;
        r.sprite.texture = r.frames[fi];
      }
      if (p.type === 'gas' && p.points.stack && p.kind === 'facility' && p.facility?.status === 'online') {
        this.smokeTimer -= dt;
        if (this.smokeTimer <= 0) {
          this.smokeTimer = 0.12;
          this.spawnSmoke(p.x + p.points.stack[0], this.groundY + 1 - p.h + p.points.stack[1]);
        }
      }
    }
    // hover highlight
    for (const p of this.plots) {
      if (p.kind === 'empty') p.sprite.texture = cachedTexture(`dio:empty:${EMPTY_W}:${p === this.hoverPlot}`, () => emptyPlotArt(EMPTY_W, p === this.hoverPlot));
      else p.sprite.tint = p === this.hoverPlot ? 0xfff2cc : 0xffffff;
    }
    this.updateWalkers(dt);
    this.updateTruck(dt);
    this.updateParticles(dt);
    this.updateWeather(dt);
  }

  private spawnSmoke(x: number, y: number) {
    const sp = new Sprite(pixelTexture());
    sp.tint = hex(hash2(this.time * 100, 1, 1) > 0.5 ? C.ink8 : C.ice2);
    sp.width = 2;
    sp.height = 2;
    sp.position.set(Math.round(x), Math.round(y));
    this.fxL.addChild(sp);
    this.particles.push({ sprite: sp, vx: 3 + Math.random() * 4, vy: -6 - Math.random() * 4, life: 0, max: 3.5 });
  }

  private updateParticles(dt: number) {
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      if (p.life > p.max) {
        p.sprite.destroy();
        return false;
      }
      const sx = p.sprite.x + p.vx * dt;
      const sy = p.sprite.y + p.vy * dt;
      (p.sprite as Sprite & { fx?: number }).fx = sx;
      p.sprite.position.set(sx, sy);
      const grow = 2 + Math.floor((p.life / p.max) * 4);
      p.sprite.width = grow;
      p.sprite.height = grow;
      p.sprite.alpha = 0.8 * (1 - p.life / p.max);
      return true;
    });
    for (const p of this.particles) p.sprite.position.set(Math.round(p.sprite.x), Math.round(p.sprite.y));
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
          // walk to another facility's door
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

  private updateTruck(dt: number) {
    const dc = this.plots.find((p) => p.type === 'datacenter' && p.facility?.status === 'online');
    if (!this.truck) {
      this.truckTimer -= dt;
      if (this.truckTimer <= 0 && dc) {
        const sp = new Sprite(cachedTexture('dio:truck', truckArt));
        this.actorL.addChild(sp);
        this.truck = { sprite: sp, x: -30, target: dc.x + dc.w - 30, wait: 3 };
      }
      return;
    }
    const t = this.truck;
    if (t.x < t.target) t.x = Math.min(t.target, t.x + 28 * dt);
    else if (t.wait > 0) t.wait -= dt;
    else t.x += 28 * dt;
    t.sprite.position.set(Math.round(t.x), this.groundY + 8);
    if (t.x > this.sceneW + 30) {
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
      const top = p.kind === 'empty' ? this.groundY - 30 : this.groundY + 1 - p.h;
      if (wx >= p.x && wx < p.x + p.w && py >= top && py <= this.groundY + 10) return p;
    }
    return null;
  }

  pointerDown(p: PixelPointer) {
    this.down = { x: p.x, camX: this.camX, moved: false };
  }

  pointerMove(p: PixelPointer) {
    if (this.down) {
      const dx = p.x - this.down.x;
      if (Math.abs(dx) > 3) this.down.moved = true;
      if (this.down.moved) {
        this.camX = Math.max(0, Math.min(this.sceneW - this.vw, this.down.camX - dx));
        return;
      }
    }
    const plot = this.plotAt(p.x, p.y);
    this.hoverPlot = plot;
    if (!plot) return this.game.setHover(null);
    if (plot.kind === 'facility' && plot.facility) this.game.setHover({ kind: 'facility', id: plot.facility.id, clientX: p.clientX, clientY: p.clientY });
    else if (plot.kind === 'empty') this.game.setHover({ kind: 'slot', siteId: this.siteId, index: this.plots.indexOf(plot), clientX: p.clientX, clientY: p.clientY });
    else this.game.setHover({ kind: 'site', id: this.siteId, clientX: p.clientX, clientY: p.clientY });
  }

  pointerUp(p: PixelPointer) {
    const d = this.down;
    this.down = null;
    if (!d || d.moved) return;
    const plot = this.plotAt(p.x, p.y);
    this.game.select({ kind: 'site', id: this.siteId });
    if (plot?.kind === 'empty') this.game.toast('Pick something to build from the panel on the right →', 'info', 'juno');
  }

  pointerLeave() {
    this.hoverPlot = null;
    this.game.setHover(null);
  }

  wheel(_p: PixelPointer, deltaY: number) {
    this.camX = Math.max(0, Math.min(this.sceneW - this.vw, this.camX + Math.sign(deltaY) * 24));
  }

  pan(dx: number) {
    this.camX = Math.max(0, Math.min(this.sceneW - this.vw, this.camX + dx));
  }

  destroy() {
    for (const t of this.ownTextures) releaseTexture(t);
    for (const t of [this.skyTex, this.starTex, this.hazeTex]) if (t) releaseTexture(t);
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
