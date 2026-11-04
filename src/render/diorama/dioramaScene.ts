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
import { bigRotorFrames, emptyPlotArt, personFrames, rotorFrames, surfFrames, truckArt, truckVariant, type Emitter, type Mover, type RotorSpec } from './art';
import { bloomOf, puffArt } from './draw';
import { bands, campusLayout, itemTop, PARALLAX, type CampusLayout, type LayoutItem } from './layout';
import { bucket, itemArt } from './campusArt';
import { act3Key } from './act3Pieces';
import { sceneBands, type BandProp, type SceneBands } from './scenery';
import { launchFlash, rocketPose, type LaunchSpec } from './launch';
import { astronautFrames, driverPose, earthDisc, lunarSky, lunarStars, lunarSunArt, moonRoverArt, type DriverSpec } from './moon';
import { moonDiscArt, paleBlueDot, spaceSkyArt, spaceSkyPlan, spaceSunArt, swarmArt } from './space';
import { habitatSkyArt } from './habitat';
import { terrainCanvas } from '../worldMap/terrain';

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
  /** Frames advance in step with other synced plots (no per-plot offset). */
  sync: boolean;
  /** Running (not a construction site). */
  live: boolean;
  /** A rocket on its pad (launch complex). */
  rocket?: Rocket;
  /** A mass driver's capsule (the Moon). */
  driver?: Driver;
  /** Textures baked for this plot only (released when it goes). */
  own: Texture[];
}

interface Rocket {
  spec: LaunchSpec;
  sprite: Sprite;
  glow: Sprite;
  bloom: Sprite;
  frames: Texture[];
  glowFrames: Texture[];
  bloomFrames: Texture[];
  /** The flame lighting up the pad and its cloud at night (additive). */
  flash: Sprite;
  vent: number;
  trail: number;
}

interface Driver {
  spec: DriverSpec;
  sprite: Sprite;
  glow: Sprite;
  bloom: Sprite;
  frames: Texture[];
  glowFrames: Texture[];
  bloomFrames: Texture[];
}

interface PropSprite {
  prop: BandProp;
  sprite: Sprite;
  frames: Texture[];
  glow?: Sprite;
  glowFrames: Texture[];
  x: number;
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
  /** Horizontal drag (the rocket's ground cloud spreads, then slows). */
  drag: number;
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

/** How the sky works: Earth, the Moon, open space (Act V's yards and ring), an asteroid, inside a habitat. */
type SkyMode = 'earth' | 'lunar' | 'space' | 'asteroid' | 'habitat';

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
  private readonly midGlowL = new Container(); // lights across the lake (parallax 0.55, untinted)
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
  /** The Moon base: black sky, no weather, astronauts and rovers. */
  private readonly lunar: boolean;
  /** Act V: open space, an asteroid's surface or the inside of a habitat get their own skies. */
  private readonly mode: SkyMode;
  /** No air: no clouds, rain or birds (the Moon, space, asteroids). */
  private readonly airless: boolean;
  /** Screen-fixed lights in the sky (the habitat's far side at night), untinted. */
  private readonly skyGlowL = new Container();
  private skyGlow = new Sprite();
  private skyGlowTex: Texture | null = null;
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
  private seaAnim: { sprite: Sprite; frames: Texture[]; fps: number }[] = [];
  private props: PropSprite[] = [];
  private backRotors: { sprite: Sprite; frames: Texture[]; phase: number }[] = [];
  private backGlow: { sprite: Sprite; bloom: Sprite; frames: Texture[]; bloomFrames: Texture[] } | null = null;
  private bandsInfo: SceneBands | null = null;
  private clouds: { sprite: Sprite; x: number; v: number }[] = [];
  private truck: { sprite: Sprite; x: number; target: number; wait: number } | null = null;
  private skySprite = new Sprite();
  private stars = new Sprite();
  private sun = new Sprite();
  private moon = new Sprite();
  /** The Earth over the lunar horizon (Moon base only). */
  private earth = new Sprite();
  private earthKey = '';
  private earthTex: Texture | null = null;
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
    this.lunar = this.site.backdrop === 'lunar';
    const bd = this.site.backdrop;
    this.mode = bd === 'lunar' ? 'lunar' : bd === 'space' ? 'space' : bd === 'asteroid' ? 'asteroid' : bd === 'habitat' ? 'habitat' : 'earth';
    this.airless = this.mode === 'lunar' || this.mode === 'space' || this.mode === 'asteroid';
    this.skyGlowL.addChild(this.skyGlow);
    this.skyGlowL.visible = false;
    this.root.addChild(this.skyL, this.skyGlowL, this.farL, this.cloudL, this.midL, this.midGlowL, this.backL, this.backGlowL, this.world, this.weatherL, this.glowL, this.bloomL, this.hintL);
    this.skyL.addChild(this.skySprite, this.stars, this.sun, this.moon, this.earth, this.haze);
    this.earth.visible = false;
    this.world.addChild(this.groundL, this.plotL, this.actorL, this.fxL, this.fgL);
    this.bloomL.blendMode = 'add';
    this.sun.texture = cachedTexture('dio:sun', () => {
      const pc = new PixelCanvas(13, 13);
      pc.circle(6.5, 6.5, 6, C.yel0);
      pc.circle(6.5, 6.5, 5, C.yel1);
      pc.circle(5.5, 5.5, 2.5, C.yel2);
      return pc;
    });
    if (this.lunar) this.sun.texture = cachedTexture('dio:lunarsun', lunarSunArt);
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
    if (this.viewOnly) return `view|${act3Key(s, this.site)}`;
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
      if (p.rocket) {
        p.rocket.sprite.destroy();
        p.rocket.glow.destroy();
        p.rocket.bloom.destroy();
        p.rocket.flash.destroy();
      }
      if (p.driver) {
        p.driver.sprite.destroy();
        p.driver.glow.destroy();
        p.driver.bloom.destroy();
      }
      for (const t of p.own) releaseTexture(t);
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
    const own: Texture[] = [];
    // per-scene textures for transient pieces; identical frames share one texture
    const bake = (pcs: PixelCanvas[], key: string, map: (pc: PixelCanvas) => PixelCanvas = (pc) => pc): Texture[] => {
      if (!ia.transient) return pcs.map((pc, i) => cachedTexture(`dio:${ia.key}:${key}${i}`, () => map(pc)));
      const out: Texture[] = [];
      pcs.forEach((pc, i) => {
        const same = pcs.findIndex((q, j) => j < i && (q === pc || sameCanvas(q, pc)));
        if (same >= 0) out.push(out[same]);
        else {
          const t = textureOf(map(pc));
          own.push(t);
          out.push(t);
        }
      });
      return out;
    };
    const frames = bake(art.base, '');
    const glowFrames = ia.building ? [] : bake(art.glow, 'g');
    const bloomFrames = ia.building ? [] : bake(art.glow, 'b', bloomCached);
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
        const fr = rotorTextures(r);
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
    let rocket: Rocket | undefined;
    if (live && art.launch) {
      const L = art.launch;
      const frames = L.frames.map((pc, k) => cachedTexture(`dio:rocket:${ia.key}:${k}`, () => pc));
      const gf = L.glow.map((pc, k) => cachedTexture(`dio:rocket:${ia.key}:g${k}`, () => pc));
      const bf = L.glow.map((pc, k) => cachedTexture(`dio:rocket:${ia.key}:b${k}`, () => bloomOf(pc)));
      const rs = new Sprite(frames[0]);
      this.plotL.addChild(rs);
      const rg = new Sprite(gf[0]);
      this.glowL.addChild(rg);
      const rb = new Sprite(bf[0]);
      this.bloomL.addChild(rb);
      const flash = new Sprite(cachedTexture('dio:launchflash', () => launchFlash()));
      flash.blendMode = 'add';
      flash.visible = false;
      this.glowL.addChild(flash);
      rocket = { spec: L, sprite: rs, glow: rg, bloom: rb, flash, frames, glowFrames: gf, bloomFrames: bf, vent: 0, trail: 0 };
    }
    let driver: Driver | undefined;
    if (live && art.driver) {
      const D = art.driver;
      const frames = D.frames.map((pc, k) => cachedTexture(`dio:capsule:${ia.key}:${k}`, () => pc));
      const gf = D.glow.map((pc, k) => cachedTexture(`dio:capsule:${ia.key}:g${k}`, () => pc));
      const bf = D.glow.map((pc, k) => cachedTexture(`dio:capsule:${ia.key}:b${k}`, () => bloomOf(pc)));
      const cs = new Sprite(frames[0]);
      this.plotL.addChild(cs);
      const cg = new Sprite(gf[0]);
      this.glowL.addChild(cg);
      const cb = new Sprite(bf[0]);
      this.bloomL.addChild(cb);
      driver = { spec: D, sprite: cs, glow: cg, bloom: cb, frames, glowFrames: gf, bloomFrames: bf };
    }
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
      sync: !!art.sync,
      live,
      rocket,
      driver,
      own,
    };
  }

  /** Parallax bands sized to the scene (see scenery.ts: the preview composites the same canvases). */
  private rebuildBands() {
    for (const t of this.ownTextures) releaseTexture(t);
    this.ownTextures = [];
    this.farL.removeChildren();
    this.midL.removeChildren();
    this.midGlowL.removeChildren();
    this.backL.removeChildren();
    this.backGlowL.removeChildren();
    this.groundL.removeChildren();
    this.fgL.removeChildren();
    const L = this.layout!;
    const b = bands(this.vw, this.vh, this.sceneW);
    const sb = sceneBands(this.site, L, this.vw, this.vh);
    this.bandsInfo = sb;
    const own = (pc: PixelCanvas) => {
      const t = textureOf(pc);
      this.ownTextures.push(t);
      return t;
    };
    const farS = new Sprite(own(sb.far));
    farS.y = b.farY;
    this.farL.addChild(farS);
    const midS = new Sprite(own(sb.mid));
    midS.y = b.midY;
    this.midL.addChild(midS);
    if (sb.midGlow) {
      const mg = new Sprite(own(sb.midGlow));
      mg.y = b.midY;
      this.midGlowL.addChild(mg);
    }
    // band props: the Jet d'Eau, sailboats
    this.props = sb.midProps.map((p) => {
      const frames = p.frames.map(own);
      const sprite = new Sprite(frames[0]);
      sprite.position.set(p.x, p.y);
      this.midL.addChild(sprite);
      const glowFrames = (p.glow ?? []).map(own);
      let glow: Sprite | undefined;
      if (glowFrames.length) {
        glow = new Sprite(glowFrames[0]);
        glow.position.set(p.x, p.y);
        this.midGlowL.addChild(glow);
      }
      return { prop: p, sprite, frames, glow, glowFrames, x: p.x };
    });
    // the back lot: a distant skyline, or the megaproject running to the horizon
    this.backRotors = [];
    this.backGlow = null;
    if (sb.back) {
      const back = sb.back;
      const bs = new Sprite(own(back.base));
      bs.y = back.y;
      this.backL.addChild(bs);
      const glowFrames = back.glow.map(own);
      const bloomFrames = back.glow.map((g) => own(bloomOf(g)));
      const gs = new Sprite(glowFrames[0]);
      gs.y = back.y;
      const bbs = new Sprite(bloomFrames[0]);
      bbs.y = back.y;
      bbs.blendMode = 'add';
      bbs.alpha = back.bloom;
      this.backGlowL.addChild(gs, bbs);
      this.backGlow = { sprite: gs, bloom: bbs, frames: glowFrames, bloomFrames };
      back.rotors.forEach((r, i) => {
        const fr = rotorTextures(r);
        const sp = new Sprite(fr[0]);
        sp.position.set(r.x - r.size - 1, back.y + r.y - r.size - 1);
        this.backL.addChild(sp);
        this.backRotors.push({ sprite: sp, frames: fr, phase: i * 1.37 });
      });
    }
    // ground (animated at sea)
    this.seaAnim = [];
    if (sb.groundFrames) {
      const fr = sb.groundFrames.map(own);
      const gS = new Sprite(fr[0]);
      gS.y = this.groundY;
      this.groundL.addChild(gS);
      this.seaAnim.push({ sprite: gS, frames: fr, fps: 2.5 });
    } else {
      const gS = new Sprite(own(sb.ground));
      gS.y = this.groundY;
      this.groundL.addChild(gS);
    }
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
    if (sb.fgFrames) {
      const fr = sb.fgFrames.map(own);
      const fgS = new Sprite(fr[0]);
      fgS.y = this.vh - b.fgH + 2;
      this.fgL.addChild(fgS);
      this.seaAnim.push({ sprite: fgS, frames: fr, fps: 1.5 });
    } else {
      const fgS = new Sprite(own(sb.fg));
      fgS.y = this.vh - b.fgH + 2;
      this.fgL.addChild(fgS);
    }
    // street lamps along the road
    for (const x of sb.lamps) {
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
    const n = this.airless ? 0 : this.weather === 'clear' ? 3 : this.weather === 'dust' ? 2 : 7;
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(cachedTexture(`dio:cloud:${i % 4}:${this.weather === 'rain' ? 'g' : 'w'}`, () => cloudArt(i % 4, this.weather === 'rain')));
      sp.y = 12 + hash2(i, 9, 2) * this.vh * 0.25;
      this.cloudL.addChild(sp);
      this.clouds.push({ sprite: sp, x: hash2(i, 3, 4) * this.vw, v: 1.5 + hash2(i, 5, 6) * 2.5 });
    }
    this.buildWeather();
  }

  /** Walkers stay on dry land (the HQ's promenade ends at the quay). */
  private walkLimit(): number {
    const L = this.layout;
    return Math.max(40, (L?.lakeFrom ?? L?.beachFrom ?? this.sceneW + 20) - 20);
  }

  private spawnWalkers() {
    this.walkers.forEach((w) => w.sprite.destroy());
    this.walkers = [];
    if (this.bandsInfo?.walkers === false) return;
    const solid = this.plots.filter((p) => p.kind !== 'empty').length;
    let count = Math.min(Math.round(8 + this.sceneW / 60), 2 + solid * 2);
    // Act V: a few suited figures on an asteroid; the habitat fills up as it's lived in
    const sc = this.layout?.scenery;
    if (this.mode === 'asteroid') count = Math.min(count, 2 + Math.floor(solid / 2));
    if (sc?.kind === 'habitat') count = Math.round(count * (0.5 + sc.lived * 0.35));
    const limit = Math.min(this.sceneW - 20, this.walkLimit());
    for (let i = 0; i < count; i++) {
      const frames = this.lunar || this.mode === 'asteroid'
        ? astronautFrames(i).map((pc, k) => cachedTexture(`dio:astronaut:${i % 14}:${k}`, () => pc))
        : personFrames(i).map((pc, k) => cachedTexture(`dio:person:${i % 12}:${k}`, () => pc));
      const sp = new Sprite(frames[0]);
      this.actorL.addChild(sp);
      const x = 20 + hash2(i, 1, 9) * (limit - 20);
      this.walkers.push({ sprite: sp, frames, x, target: x, speed: 6 + hash2(i, 2, 9) * 6, pause: hash2(i, 3, 9) * 3 });
    }
  }

  private pickWeather(): Weather {
    if (!this.game.settings.weather || this.airless) return 'clear';
    const s = this.game.view;
    const day = s?.day ?? 0;
    const r = hash2(Math.floor(day / 3), Math.floor(this.site.lat * 7 + this.site.lon), 17);
    // the habitat's weather is scheduled: clouds some days, never a storm
    if (this.mode === 'habitat') return r < 0.35 ? 'cloudy' : 'clear';
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
    if (this.lunar) return this.updateLunarSky(dt);
    if (this.mode === 'space' || this.mode === 'asteroid') return this.updateSpaceSky();
    if (this.mode === 'habitat') return this.updateHabitatSky(dt);
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
    this.midGlowL.alpha = lightsOn;
    this.bloomL.alpha = lightsOn * 0.55;
    this.glowL.visible = this.backGlowL.visible = this.midGlowL.visible = lightsOn > 0.01;
    this.bloomL.visible = lightsOn > 0.01 && !this.game.settings.batterySaver;
  }

  /**
   * The Moon: a black sky full of stars that never fades, the sun skimming the far peaks (and
   * slipping behind them for the lunar night), and the Earth hanging over the rim with its own
   * day and night. No warm sunset grading: there is no air to scatter the light.
   */
  private updateLunarSky(dt: number) {
    const date = this.clock();
    const sub = subsolar(date);
    const sky = lunarSky(date, sub.lon, this.game.settings.dayNight);
    this.darkness += (sky.dark - this.darkness) * Math.min(1, dt * 2);
    const b = bands(this.vw, this.vh, this.sceneW);
    const key = `moon|${this.vw}x${this.vh}|${getEra()}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const skyH = this.groundY + 4;
      const pc = new PixelCanvas(this.vw + 2, skyH);
      pc.vgradient(0, 0, pc.w, pc.h, [C.ink0, C.ink0, C.ink0, C.night0]);
      if (this.skyTex) releaseTexture(this.skyTex);
      this.skyTex = textureOf(pc);
      this.skySprite.texture = this.skyTex;
      if (this.starTex) releaseTexture(this.starTex);
      this.starTex = textureOf(lunarStars(this.vw + 2, skyH));
      this.stars.texture = this.starTex;
      if (this.hazeTex) releaseTexture(this.hazeTex);
      this.hazeTex = textureOf(new PixelCanvas(1, 1));
      this.haze.texture = this.hazeTex;
      this.earthKey = '';
    }
    this.stars.alpha = 0.95;
    this.moon.visible = false;
    this.sun.visible = sky.sun !== null;
    if (sky.sun !== null) this.sun.position.set(Math.round(this.vw * sky.sun - 8), Math.round(b.farY + b.farH * 0.16 - 8));
    // the Earth, re-drawn as it turns (and as the terminator crosses it)
    const r = Math.max(7, Math.round(this.vh * 0.045));
    const ekey = `${Math.round(sky.earth.lon0 / 3)}|${Math.round(sub.lon / 3)}|${Math.round(sub.lat)}|${Math.round(sky.earth.lat0 / 3)}|${r}|${getEra()}`;
    if (ekey !== this.earthKey) {
      this.earthKey = ekey;
      const lod = this.game.world?.lods?.[1];
      const terrain = lod ? { pc: terrainCanvas(lod), res: lod.res } : undefined;
      if (this.earthTex) releaseTexture(this.earthTex);
      this.earthTex = textureOf(earthDisc(r, sky.earth, sub, terrain));
      this.earth.texture = this.earthTex;
    }
    this.earth.visible = true;
    this.earth.position.set(Math.round(this.vw * 0.7 - r - 2), Math.round(b.farY - r * 1.2));
    // grading: a cool earthshine at night, nothing warm; the sky layer stays as it is
    const d = this.darkness;
    const tint = (Math.round((1 - 0.78 * d) * 255) << 16) | (Math.round((1 - 0.74 * d) * 255) << 8) | Math.round((1 - 0.48 * d) * 255);
    this.skyL.tint = 0xffffff;
    for (const l of [this.farL, this.cloudL, this.midL, this.backL, this.world, this.weatherL]) l.tint = tint;
    const lightsOn = Math.max(0, Math.min(1, (d - 0.25) * 2.4));
    this.glowL.alpha = lightsOn;
    this.backGlowL.alpha = lightsOn;
    this.midGlowL.alpha = lightsOn;
    this.bloomL.alpha = lightsOn * 0.55;
    this.glowL.visible = this.backGlowL.visible = this.midGlowL.visible = lightsOn > 0.01;
    this.bloomL.visible = lightsOn > 0.01 && !this.game.settings.batterySaver;
  }

  /**
   * Act V, open space and the asteroids: no day or night (the sun never sets out here), so the
   * world stays sunlit and the lights glow against the black. The sun sits up on the left, the
   * swarm glitters across the sky, the Earth turns as a disc (or shows as a pale blue dot from the
   * asteroids). Solar Maximum's storm makes the light stutter.
   */
  private updateSpaceSky() {
    const sc = this.layout?.scenery;
    const place = sc?.kind === 'space' ? sc.place : 'asteroid';
    const au = sc?.kind === 'asteroid' ? sc.au : 1;
    const swarm = sc?.kind === 'space' || sc?.kind === 'asteroid' ? sc.swarm : 0;
    const storm = sc?.kind === 'space' ? sc.storm : 0;
    const plan = spaceSkyPlan(this.vw, this.vh, place, au);
    const key = `space|${this.vw}x${this.vh}|${getEra()}|${place}|${au}|${swarm}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const seed = 37 + (place === 'l5' ? 11 : place === 'ring' ? 23 : place === 'asteroid' ? 31 + Math.round(au * 7) : 0);
      if (this.skyTex) releaseTexture(this.skyTex);
      this.skyTex = textureOf(spaceSkyArt(this.vw + 2, this.vh, seed));
      this.skySprite.texture = this.skyTex;
      if (this.starTex) releaseTexture(this.starTex);
      this.starTex = textureOf(swarmArt(this.vw + 2, this.vh, plan, swarm, seed));
      this.stars.texture = this.starTex;
      if (this.hazeTex) releaseTexture(this.hazeTex);
      this.hazeTex = textureOf(new PixelCanvas(1, 1));
      this.haze.texture = this.hazeTex;
      this.sun.texture = cachedTexture(`dio:spacesun:${plan.sun.r}`, () => spaceSunArt(plan.sun.r));
      if (plan.moon) {
        const mr = plan.moon.r;
        this.moon.texture = cachedTexture(`dio:spacemoon:${mr}`, () => moonDiscArt(mr));
      }
      this.earthKey = '';
    }
    this.darkness = 0;
    this.stars.alpha = 0.8 + Math.sin(this.time * 1.3) * 0.2;
    const half = (this.sun.texture.width - 1) / 2;
    this.sun.visible = true;
    this.sun.position.set(Math.round(plan.sun.x - half), Math.round(plan.sun.y - half));
    this.moon.visible = !!plan.moon;
    if (plan.moon) this.moon.position.set(plan.moon.x - plan.moon.r - 1, plan.moon.y - plan.moon.r - 1);
    if (plan.earth) {
      const r = plan.earth.r;
      const sub = subsolar(this.clock());
      const ekey = `e|${Math.round(sub.lon / 3)}|${r}|${getEra()}`;
      if (ekey !== this.earthKey) {
        this.earthKey = ekey;
        const lod = this.game.world?.lods?.[1];
        const terrain = lod ? { pc: terrainCanvas(lod), res: lod.res } : undefined;
        if (this.earthTex) releaseTexture(this.earthTex);
        // lit from the left like everything else: the sun sits 70° west of the disc's centre
        this.earthTex = textureOf(earthDisc(r, { lon0: ((sub.lon + 70 + 540) % 360) - 180, lat0: 12 }, { lat: sub.lat, lon: sub.lon }, terrain));
        this.earth.texture = this.earthTex;
      }
      this.earth.visible = true;
      this.earth.position.set(Math.round(plan.earth.x - this.earth.texture.width / 2), Math.round(plan.earth.y - this.earth.texture.height / 2));
    } else if (plan.dot) {
      if (this.earthKey !== 'dot') {
        this.earthKey = 'dot';
        this.earth.texture = cachedTexture('dio:bluedot', paleBlueDot);
      }
      this.earth.visible = true;
      this.earth.position.set(plan.dot.x - 1, plan.dot.y - 1);
    } else this.earth.visible = false;
    // sunlight (weaker in the belt); the storm makes it stutter
    const flick = storm > 0 && hash2(Math.floor(this.time * 10), 7, 3) < 0.07 * storm ? 0.8 : 1;
    const [lr, lg, lb] = plan.light;
    const tint = (Math.round(lr * flick * 255) << 16) | (Math.round(lg * flick * 255) << 8) | Math.round(Math.min(1, lb * (flick < 1 ? 1.1 : 1)) * flick * 255);
    this.skyL.tint = 0xffffff;
    for (const l of [this.farL, this.cloudL, this.midL, this.backL, this.world, this.weatherL]) l.tint = tint;
    this.glowL.alpha = flick < 1 ? 0.45 : 0.92;
    this.backGlowL.alpha = 0.9;
    this.midGlowL.alpha = 0.9;
    this.bloomL.alpha = flick < 1 ? 0.15 : 0.3;
    this.glowL.visible = this.backGlowL.visible = this.midGlowL.visible = true;
    this.bloomL.visible = !this.game.settings.batterySaver;
    this.skyGlowL.visible = false;
  }

  /**
   * Act V, inside the habitat: the far side overhead and the sun-line along the axis. The mirrors
   * open at six and close at six: the line dims, the far side's towns and a few stars come out.
   */
  private updateHabitatSky(dt: number) {
    const hour = localSolarHour(this.site.lon, this.clock());
    const phase = hour >= 7 && hour < 17.5 ? 'day' : (hour >= 17.5 && hour < 18.3) || (hour >= 6.2 && hour < 7) ? 'golden' : hour >= 18.3 && hour < 19.2 ? 'sunset' : hour >= 5.2 && hour < 6.2 ? 'twilight' : 'night';
    const target = phase === 'day' ? 0 : phase === 'golden' ? 0.12 : phase === 'sunset' ? 0.38 : phase === 'twilight' ? 0.55 : 0.72;
    this.darkness += (target - this.darkness) * Math.min(1, dt * 2);
    const key = `hab|${this.vw}x${this.vh}|${getEra()}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const sky = habitatSkyArt(this.vw + 2, this.vh, this.groundY, 53);
      if (this.skyTex) releaseTexture(this.skyTex);
      this.skyTex = textureOf(sky.base);
      this.skySprite.texture = this.skyTex;
      if (this.skyGlowTex) releaseTexture(this.skyGlowTex);
      this.skyGlowTex = textureOf(sky.glow);
      this.skyGlow.texture = this.skyGlowTex;
      if (this.starTex) releaseTexture(this.starTex);
      this.starTex = textureOf(new PixelCanvas(1, 1));
      this.stars.texture = this.starTex;
      if (this.hazeTex) releaseTexture(this.hazeTex);
      this.hazeTex = textureOf(new PixelCanvas(1, 1));
      this.haze.texture = this.hazeTex;
    }
    this.sun.visible = this.moon.visible = this.earth.visible = false;
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
    const tint = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    for (const l of [this.skyL, this.farL, this.cloudL, this.midL, this.backL, this.world, this.weatherL]) l.tint = tint;
    const lightsOn = Math.max(0, Math.min(1, (d - 0.25) * 2.4));
    this.skyGlowL.alpha = lightsOn;
    this.skyGlowL.visible = lightsOn > 0.01;
    this.glowL.alpha = lightsOn;
    this.backGlowL.alpha = lightsOn;
    this.midGlowL.alpha = lightsOn;
    this.bloomL.alpha = lightsOn * 0.55;
    this.glowL.visible = this.backGlowL.visible = this.midGlowL.visible = lightsOn > 0.01;
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
    this.midL.x = this.midGlowL.x = -Math.round(this.camX * PARALLAX.mid);
    this.backL.x = this.backGlowL.x = -Math.round(this.camX * PARALLAX.back);
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > this.vw + 10) c.x = -c.sprite.width - 10;
      c.sprite.x = Math.round(c.x);
    }
    const windSpeed = Math.max(0.25, this.site.windCF) * 2.4;
    const saver = this.game.settings.batterySaver;
    // wide Act III scenes: only plots near the camera puff (the particle budget goes where you look)
    const cull = this.layout?.scenery !== undefined;
    const viewL = this.camX - this.vw * 0.5;
    const viewR = this.camX + this.vw * 1.5;
    for (const p of this.plots) {
      if (p.frames.length > 1 && p.fps > 0) {
        const fi = Math.floor(this.time * p.fps + (p.sync ? 0 : p.x)) % p.frames.length;
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
        if (cull && (p.x + e.x < viewL || p.x + e.x > viewR)) continue;
        const sx = p.x + e.x + (e.spread ? (Math.random() - 0.5) * 2 * e.spread : 0);
        this.spawnPuff(e.kind, sx, p.top + e.y, e.size);
      }
    }
    if (this.surf) this.surf.sprite.texture = this.surf.frames[Math.floor(this.time * 3) % this.surf.frames.length];
    for (const a of this.seaAnim) a.sprite.texture = a.frames[Math.floor(this.time * a.fps) % a.frames.length];
    for (const pr of this.props) {
      if (pr.prop.drift) {
        const wrap = pr.prop.wrap ?? this.vw;
        pr.x += pr.prop.drift * dt;
        if (pr.x > wrap) pr.x -= wrap + 20;
        if (pr.x < -20) pr.x += wrap + 20;
        pr.sprite.x = Math.round(pr.x);
      }
      if (pr.frames.length > 1 && pr.prop.fps > 0) {
        const fi = Math.floor(this.time * pr.prop.fps) % pr.frames.length;
        pr.sprite.texture = pr.frames[fi];
        if (pr.glow && pr.glowFrames[fi]) pr.glow.texture = pr.glowFrames[fi];
      }
    }
    for (const r of this.backRotors) r.sprite.texture = r.frames[Math.floor((this.time + r.phase) * 8 * windSpeed) % r.frames.length];
    if (this.backGlow && this.backGlow.frames.length > 1) {
      // aviation lights across the whole field blink together
      const fi = Math.floor(this.time) % this.backGlow.frames.length;
      this.backGlow.sprite.texture = this.backGlow.frames[fi];
      this.backGlow.bloom.texture = this.backGlow.bloomFrames[fi];
    }
    for (const p of this.plots) if (p.rocket) this.updateRocket(p, p.rocket, dt);
    for (const p of this.plots) if (p.driver) this.updateDriver(p, p.driver);
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

  private spawnPuff(kind: PuffKind, x: number, y: number, size?: number, v?: { vx: number; vy: number; life: number; drag?: number }) {
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
      case 'exhaust':
        vx = (Math.random() - 0.5) * 4;
        vy = -1 - Math.random() * 2;
        max = 5 + Math.random() * 2;
        maxR = size ?? 5;
        break;
      case 'dust':
        // regolith thrown up on the Moon: no air, so it arcs and falls straight back
        vx = (Math.random() - 0.5) * 8;
        vy = -5 - Math.random() * 5;
        max = 1 + Math.random() * 0.8;
        maxR = size ?? 1;
        break;
      case 'grit':
        // rock chipped off an asteroid: next to no gravity, it drifts off for good
        vx = (Math.random() - 0.3) * 10;
        vy = -2 - Math.random() * 6;
        max = 1.6 + Math.random() * 1.2;
        maxR = 1;
        break;
      case 'spark':
        vx = (Math.random() - 0.5) * 22;
        vy = -4 - Math.random() * 12;
        max = 0.25 + Math.random() * 0.3;
        maxR = 1;
        break;
      default:
        // spray / cold mist: drifts and falls back
        vx = (Math.random() - 0.5) * 10;
        vy = -4 - Math.random() * 6;
        max = 0.6 + Math.random() * 0.6;
        maxR = size ?? 1;
    }
    if (v) {
      vx = v.vx;
      vy = v.vy;
      max = v.life;
    }
    this.particles.push({ sprite: sp, kind, x, y, vx, vy, life: 0, max, size: maxR, r: -1, drag: v?.drag ?? (kind === 'exhaust' ? 0.6 : 0) });
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
      else if (p.kind === 'dust') p.vy += 9 * dt;
      else p.vy *= 1 - dt * 0.35;
      if (p.drag) p.vx *= Math.max(0, 1 - dt * p.drag);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const r = p.kind === 'mist' || p.kind === 'dust' || p.kind === 'grit' || p.kind === 'spark' ? 1 : p.kind === 'exhaust' ? Math.min(p.size, 2 + Math.floor(k * p.size * 1.6)) : Math.max(1, Math.min(p.size, 1 + Math.floor(k * (p.size + 1))));
      if (r !== p.r) {
        p.r = r;
        p.sprite.texture = cachedTexture(`dio:puff:${p.kind}:${r}`, () => puffArt(r, p.kind));
      }
      p.sprite.position.set(Math.round(p.x - r), Math.round(p.y - r));
      p.sprite.alpha = p.kind === 'mist' || p.kind === 'dust' || p.kind === 'spark' ? 0.9 : p.kind === 'grit' ? 0.9 * (1 - k) : 0.9 * (1 - k * k);
      this.particles[n++] = p;
    }
    this.particles.length = n;
  }

  /**
   * The launch cycle: venting on the pad, ignition (a cloud bursts out of the flame trench),
   * liftoff with a trail of exhaust, then a fresh rocket rolls out (fades in) for the next one.
   */
  private updateRocket(p: Plot, r: Rocket, dt: number) {
    const S = r.spec;
    const t = this.time + 6 + (S.offset ?? 0);
    const pose = rocketPose(t, S.period);
    const fw = r.frames[0].width;
    const x = p.x + S.x - Math.floor(fw / 2);
    const y = p.top + S.y - S.body + pose.dy;
    const visible = pose.phase !== 'gone';
    const u = S.period > 0 ? ((t % S.period) + S.period) % S.period : 99;
    const alpha = Math.min(1, u / 0.8);
    for (const sp of [r.sprite, r.glow, r.bloom]) {
      sp.visible = visible;
      sp.position.set(x, y);
      sp.alpha = alpha;
    }
    r.sprite.texture = r.frames[pose.frame];
    r.glow.texture = r.glowFrames[pose.frame];
    r.bloom.texture = r.bloomFrames[pose.frame];
    const padX = p.x + S.x;
    const padY = p.top + S.y;
    // the burn floods the pad (and the cloud) with orange light; it fades as the rocket climbs
    const fl = r.flash;
    const lit = pose.phase === 'ignite' ? pose.burn : pose.phase === 'flight' ? Math.max(0, 1 + (pose.dy + 30) / 160) : 0;
    fl.visible = lit > 0.02;
    fl.alpha = lit * (0.75 + Math.sin(this.time * 31) * 0.12);
    fl.position.set(padX - Math.floor(fl.width / 2), padY - Math.floor(fl.height * 0.62));
    if (pose.phase === 'pad') {
      r.vent -= dt;
      if (r.vent <= 0) {
        r.vent = 0.35 + Math.random() * 0.3;
        for (const [dx, dy] of S.vents) this.spawnPuff('vapor', padX + dx, padY + dy, 2);
      }
      return;
    }
    if (pose.phase === 'gone') return;
    const cam = padX > this.camX - this.vw && padX < this.camX + this.vw * 2;
    if (!cam) return;
    r.trail -= dt;
    if (r.trail > 0) return;
    r.trail = 0.045;
    if (pose.phase === 'ignite' || pose.dy > -40) {
      // the ground cloud: steam and exhaust bursting sideways out of the flame trench
      for (const side of [-1, 1]) {
        const sp = 18 + Math.random() * 30;
        this.spawnPuff('exhaust', padX + side * 22, padY + 6, 5 + Math.floor(Math.random() * 2), { vx: side * sp, vy: -1 - Math.random() * 8, life: 5 + Math.random() * 2.5, drag: 0.65 });
      }
    }
    if (pose.phase === 'flight') {
      const ny = y + S.body + 14;
      this.spawnPuff('exhaust', padX + (Math.random() - 0.5) * 3, ny, 3 + Math.floor(Math.random() * 3), { vx: (Math.random() - 0.5) * 5, vy: -1 + Math.random() * 3, life: 4 + Math.random() * 2.5, drag: 0.4 });
    }
  }

  /** The mass driver: a capsule waits in the breech, streaks down the rail and is flung off the ramp. */
  private updateDriver(p: Plot, d: Driver) {
    const pose = driverPose(this.time, d.spec);
    const x = Math.round(p.x + pose.x - d.spec.ax);
    const y = Math.round(p.top + pose.y - d.spec.ay);
    for (const sp of [d.sprite, d.glow, d.bloom]) {
      sp.visible = pose.visible;
      sp.position.set(x, y);
    }
    d.sprite.texture = d.frames[pose.frame];
    d.glow.texture = d.glowFrames[pose.frame];
    d.bloom.texture = d.bloomFrames[pose.frame];
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
          const limit = this.walkLimit();
          const plots = this.plots.filter((p) => p.kind !== 'empty' && p.x < limit);
          const p = plots[Math.floor(Math.random() * Math.max(1, plots.length))];
          w.target = Math.min(limit, p ? p.x + p.w * (0.2 + Math.random() * 0.6) : 20 + Math.random() * (this.sceneW - 40));
        }
        w.sprite.texture = w.frames[Math.floor(this.time * 6 + w.x) % 2];
        w.sprite.scale.x = dir < 0 ? -1 : 1;
      }
      w.sprite.position.set(Math.round(w.x) + (w.sprite.scale.x < 0 ? 3 : 0), footY);
    }
  }

  /** Trucks call at loading docks: chips to your halls, wafers and gases at suppliers. */
  private updateTruck(dt: number) {
    // nothing drives in open space or on an asteroid
    if (this.mode === 'space' || this.mode === 'asteroid') return;
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
      if (this.lunar) tex = cachedTexture('dio:moonrover', () => moonRoverArt());
      else if (!this.viewOnly) tex = cachedTexture('dio:truck', truckArt);
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
    const shore = this.layout?.beachFrom ?? this.layout?.lakeFrom;
    const end = shore ?? this.sceneW;
    if (t.x > end + 30 || (shore !== undefined && t.x > end - 20)) {
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
    for (const p of this.plots) for (const t of p.own) releaseTexture(t);
    for (const t of [this.skyTex, this.starTex, this.hazeTex, this.earthTex, this.skyGlowTex]) if (t) releaseTexture(t);
    for (const sp of this.pool) sp.destroy();
    this.root.destroy({ children: true });
  }
}

/** Bloom is the slow part of baking a piece: keep it alongside the (cached) art it belongs to. */
const blooms = new WeakMap<PixelCanvas, PixelCanvas>();
function bloomCached(glow: PixelCanvas): PixelCanvas {
  let b = blooms.get(glow);
  if (!b) {
    b = bloomOf(glow);
    blooms.set(glow, b);
  }
  return b;
}

/** Two canvases with the same pixels (animation frames that don't change share a texture). */
function sameCanvas(a: PixelCanvas, b: PixelCanvas): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
  return true;
}

/** Rotor frames for a turbine (giant ones get the tapered, finer-stepped set). */
function rotorTextures(r: RotorSpec): Texture[] {
  if (r.style === 'big') return bigRotorFrames(r.size, r.col).map((pc, k) => cachedTexture(`dio:brotor:${r.size}:${r.col}:${k}`, () => pc));
  return rotorFrames(r.size, r.col).map((pc, k) => cachedTexture(`dio:rotor:${r.size}:${r.col}:${k}`, () => pc));
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
