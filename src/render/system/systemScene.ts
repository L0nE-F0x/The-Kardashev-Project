/**
 * The solar-system view (Act V): the Sun, Mercury, Venus, Earth and Mars on their orbits (time
 * compressed to about a year a minute, starting from the game's date), the asteroid belt with your
 * claims and foundries, haul routes, the swarm's twelve arcs lighting up along Earth's orbit, the
 * Mercury probe, Solar Maximum's flares and shockwave, and a lens on Earth and the Moon with the
 * L4/L5 yards, the habitats and beams to Earth. With `cinematic` it plays the ending: close on
 * Earth, a long pull-back to the whole inner system as the arcs ignite, then a slow drift forever.
 *
 * Layers, back to front: the sky (painted once per size), the orbits and the belt's haze (repainted
 * when the camera changes, throttled), things behind the Sun, the Sun, things in front of it, the
 * ending's close-up of Earth, the lens and its contents, labels. Moving things are pooled 1×1 and
 * small cached sprites, so nothing big is re-baked per frame.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../../game/game';
import { orbitExtras, systemView, type SystemView } from '../../sim/systemView';
import { getEra, hex, C } from '../palette';
import { PixelCanvas } from '../pixels';
import { dragSlop, touchRadius, type PixelPointer, type Scene } from '../stage';
import { cachedTexture, labelTexture, refreshTexture, releaseTexture, textureOf } from '../textures';
import { pixelTexture } from '../sprites/mapIcons';
import { orbitTerrain } from '../orbit/orbitArt';
import {
  CINE_HOLD,
  CINE_PULL,
  cinematicCam,
  earthAngle,
  hoverLabel,
  inboundDirs,
  lensNear,
  makeProj,
  nearFx,
  nearTilt,
  paintNear,
  paintSystemSky,
  paintSystemStatic,
  polar,
  sunCanvas,
  sunPhiAt,
  sunRadius,
  sysCam,
  systemFx,
  systemLayout,
  systemTwinklers,
  TILT_MAX,
  TILT_MIN,
  VIEW_MAX,
  VIEW_MIN,
  type FxSink,
  type Hit,
  type Near,
  type SysCam,
  type SysLabel,
  type SysLayout,
} from './systemArt';

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
/** Each wheel notch / zoom key changes the view radius by this factor. */
const ZOOM_STEP = 1.18;
/** Radians per second the ending's camera drifts round the Sun once it has pulled back. */
const CINE_DRIFT = 0.012;
/** Degrees per second the Earth in the lens turns. */
const SPIN = 3;

/** A pool of sprites reused frame to frame: 1×1 tinted pixels and small textured sprites (tints cached). */
class Pool {
  private sprites: Sprite[] = [];
  private tints: number[] = [];
  private used = 0;
  constructor(private readonly parent: Container) {}
  begin() {
    this.used = 0;
  }
  px(x: number, y: number, c: number) {
    const i = this.used;
    const sp = this.next(pixelTexture());
    if (this.tints[i] !== c) {
      sp.tint = hex(c);
      this.tints[i] = c;
    }
    sp.position.set(x, y);
  }
  spr(tex: Texture, x: number, y: number) {
    const i = this.used;
    const sp = this.next(tex);
    if (this.tints[i] !== -1) {
      sp.tint = 0xffffff;
      this.tints[i] = -1;
    }
    sp.position.set(x, y);
  }
  end() {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
  /** Forget cached tints (the palette changed under them). */
  retint() {
    this.tints = [];
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

/** What the pointer is over, for the UI (a tooltip, a cursor). */
export interface SystemHover {
  id: string;
  label: string;
  /** The diorama id a click opens ('orbit' = the orbit view), or null. */
  open: string | null;
  /** Internal pixels. */
  x: number;
  y: number;
}

export class SystemScene implements Scene {
  readonly root = new Container();
  private readonly skyL = new Container();
  private readonly staticL = new Container();
  private readonly backFx = new Container();
  private readonly sunFx = new Container();
  private readonly frontFx = new Container();
  private readonly nearL = new Container();
  private readonly nearFxL = new Container();
  private readonly lensL = new Container();
  private readonly lensFx = new Container();
  private readonly labelL = new Container();
  private readonly backPool = new Pool(this.backFx);
  private readonly sunPool = new Pool(this.sunFx);
  private readonly frontPool = new Pool(this.frontFx);
  private readonly nearPool = new Pool(this.nearFxL);
  private readonly lensPool = new Pool(this.lensFx);

  /** True once the ending's pull-back has finished (always true outside the cinematic). */
  cinematicDone: boolean;
  private readonly cinematic: boolean;
  private L: SysLayout = systemLayout(640, 360);
  private time = 0;
  /** The view radius (AU) asked for, and the one shown (eased toward it). */
  private view = VIEW_MIN;
  private viewNow = VIEW_MIN;
  private rot = 0;
  private tilt = this.L.tilt;
  private tiltSet = false;
  private cam: SysCam = sysCam(this.L);
  private cineT = 0;
  /** The game day the planets started from (the date sets where they are; then compressed time moves them). */
  private dayAnchor = 0;
  private seen: unknown = undefined;
  private sky: Layer | null = null;
  private statik: Layer | null = null;
  private lens: Layer | null = null;
  private near: Layer | null = null;
  private staticKey = '';
  private staticAt = -1;
  private lensKey = '';
  private nearAt = -1;
  private era = -1;
  private stars: { x: number; y: number; c: number }[] = [];
  private labels: { sprite: Sprite; key: string }[] = [];
  /** What the pointer can find this frame (main view and lens), and where Earth is. */
  private hits: Hit[] = [];
  private earth: [number, number] = [0, 0];
  private hover: Hit | null = null;
  private cursor: { x: number; y: number } | null = null;
  // input
  private down: { x: number; y: number; rot0: number; tilt0: number; moved: boolean } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(private readonly game: Game, opts: { cinematic?: boolean } = {}) {
    this.cinematic = !!opts.cinematic;
    this.cinematicDone = !this.cinematic;
    this.root.addChild(this.skyL, this.staticL, this.backFx, this.sunFx, this.frontFx, this.nearL, this.nearFxL, this.lensL, this.lensFx, this.labelL);
    this.resize(640, 360);
  }

  /** Where Earth is on screen this frame (internal pixels). */
  get earthAt(): { x: number; y: number } {
    return { x: this.earth[0], y: this.earth[1] };
  }

  /** What's under the pointer (null if nothing). */
  get hovered(): SystemHover | null {
    const h = this.hover;
    return h ? { id: h.id, label: h.label, open: h.open, x: h.x, y: h.y } : null;
  }

  // ── layout ───────────────────────────────────────────────────────────────────────────────
  resize(width: number, height: number) {
    const w = Math.max(64, Math.floor(width));
    const h = Math.max(64, Math.floor(height));
    if (this.sky && this.L.w === w && this.L.h === h) return;
    this.L = systemLayout(w, h);
    if (!this.tiltSet) this.tilt = this.L.tilt;
    this.stars = systemTwinklers(this.L);
    this.sky = this.layer(this.sky, this.skyL, w, h);
    paintSystemSky(this.sky.pc);
    refreshTexture(this.sky.tex);
    this.statik = this.layer(this.statik, this.staticL, w, h);
    this.staticKey = '';
    const size = this.L.lens.r * 2 + 6;
    this.lens = this.layer(this.lens, this.lensL, size, size + 6);
    this.lens.sprite.position.set(this.L.lens.x - Math.floor(size / 2), this.L.lens.y - Math.floor(size / 2) - 6);
    this.lensKey = '';
    if (this.near) this.near = this.layer(this.near, this.nearL, w, h);
    this.nearAt = -1;
  }

  /** A canvas layer: reused when the size matches, else replaced (old texture freed). */
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
    const st = this.game.settings;
    const still = !!st?.reducedMotion;
    const lite = !!st?.batterySaver;
    this.time += dt;
    const s = this.game.view;
    if (s !== this.seen) {
      this.seen = s;
      this.dayAnchor = s?.day ?? 0;
    }
    const v = systemView(s);
    const habitats = orbitExtras(s).habitats;
    const day = this.dayAnchor;
    const t = this.time;
    if (getEra() !== this.era) {
      // the palette changed: cached tints point at old colours
      this.era = getEra();
      for (const p of [this.backPool, this.sunPool, this.frontPool, this.nearPool, this.lensPool]) p.retint();
    }
    // the camera: the ending's pull-back, or the player's zoom and turn
    let cineU: number | null = null;
    let nearG: Near | null = null;
    const ePos = polar(1, earthAngle(day, still ? 7.3 : t));
    if (this.cinematic) {
      this.cineT += dt;
      cineU = Math.max(0, Math.min(1, (this.cineT - CINE_HOLD) / CINE_PULL));
      if (cineU >= 1) {
        this.cinematicDone = true;
        if (!still) this.rot += CINE_DRIFT * dt;
      }
      const c = cinematicCam(this.L, ePos, cineU, this.rot);
      this.cam = c.cam;
      if (c.R > 0) {
        const [ex, ey] = makeProj(this.L, this.cam)(...ePos);
        nearG = { x: ex, y: ey, R: c.R, er: c.er, rot: this.cam.rot, tilt: nearTilt(this.cam.tilt), sunPhi: sunPhiAt(this.L, this.cam, day, still ? 7.3 : t), spin: -20 + t * SPIN };
      }
    } else {
      const k = 1 - Math.pow(0.0005, dt);
      this.viewNow += (this.view - this.viewNow) * k;
      if (Math.abs(this.viewNow - this.view) < 0.002) this.viewNow = this.view;
      this.cam = sysCam(this.L, this.viewNow, this.rot, this.tilt);
    }
    this.updateStatic(v, lite);
    this.updateSun(v, still);
    const lensOn = !this.cinematic;
    const sink = (back: Pool, front: Pool): FxSink => ({
      px: (x, y, c, fr) => (fr ? front : back).px(x, y, c),
      spr: (key, make, x, y, fr) => (fr ? front : back).spr(cachedTexture(key, make), x, y),
    });
    this.backPool.begin();
    this.frontPool.begin();
    const res = systemFx(
      sink(this.backPool, this.frontPool),
      this.L,
      this.cam,
      { view: v, day, t, habitats },
      { still, lite, hover: this.hover?.id ?? null, cine: cineU, hideEarth: !!nearG, lens: lensOn ? this.L.lens : null },
      this.stars,
    );
    this.backPool.end();
    this.frontPool.end();
    this.earth = res.earth;
    const hits = [...res.hits];
    const nearIn = { view: v, habitats, t, inbound: inboundDirs(this.L, this.cam, v, day, still ? 7.3 : t) };
    // the ending's close-up of Earth and the Moon
    this.nearPool.begin();
    if (nearG) {
      if (!this.near) this.near = this.layer(null, this.nearL, this.L.w, this.L.h);
      this.near.sprite.visible = true;
      if (this.nearAt < 0 || this.time - this.nearAt >= 1 / 30) {
        this.nearAt = this.time;
        this.near.pc.data.fill(0);
        paintNear(this.near.pc, nearG, { terrain: this.terrain() });
        refreshTexture(this.near.tex);
      }
      nearFx({ px: (x, y, c) => this.nearPool.px(x, y, c), spr: (key, make, x, y) => this.nearPool.spr(cachedTexture(key, make), x, y) }, nearG, nearIn, { still, hover: null });
    } else if (this.near) this.near.sprite.visible = false;
    this.nearPool.end();
    // the lens
    this.lensPool.begin();
    this.lensL.visible = lensOn;
    if (lensOn) {
      const g = lensNear(this.L, this.cam, sunPhiAt(this.L, this.cam, day, still ? 7.3 : t), -20 + (still ? 0 : t * SPIN));
      this.updateLens(g);
      hits.push(
        ...nearFx(
          { px: (x, y, c) => this.lensPool.px(x, y, c), spr: (key, make, x, y) => this.lensPool.spr(cachedTexture(key, make), x, y) },
          g,
          nearIn,
          { still, hover: this.hover?.id ?? null, clip: this.L.lens.r - 1 },
        ),
      );
    }
    this.lensPool.end();
    this.hits = hits;
    // targets move under a still pointer: keep the hover honest
    if (this.cursor && !this.down && !this.cinematic) this.setHover(this.hitAt(this.cursor.x, this.cursor.y));
    else if (this.hover) this.hover = hits.find((h) => h.id === this.hover!.id) ?? null;
    this.updateLabels(this.hover ? [...res.labels, hoverLabel(this.L, this.hover)] : res.labels);
  }

  private terrain(): { pc: PixelCanvas; res: number } | null {
    const lod = this.game.world?.lods?.[0];
    return lod ? { pc: orbitTerrain(lod, getEra() >= 2), res: lod.res } : null;
  }

  /** The orbits and the belt's haze: repainted when the camera or the highlighted orbit changes (throttled). */
  private updateStatic(v: SystemView, lite: boolean) {
    const c = this.cam;
    const hv = this.hover ? v.asteroids.find((a) => a.id === this.hover!.id) : null;
    const key = `${c.scale.toFixed(3)}|${c.tilt.toFixed(3)}|${c.x.toFixed(5)},${c.y.toFixed(5)}|${c.rot.toFixed(2)}|${hv?.id ?? ''}|${v.mercury}|${this.era}`;
    if (key === this.staticKey) return;
    const gap = lite ? 1 / 12 : 1 / 30;
    const hoverOnly = this.staticKey.split('|').slice(0, 4).join('|') === key.split('|').slice(0, 4).join('|');
    if (!hoverOnly && this.staticAt >= 0 && this.time - this.staticAt < gap) return;
    this.staticKey = key;
    this.staticAt = this.time;
    paintSystemStatic(this.statik!.pc, this.L, c, { extra: hv ? { a: hv.def.au, c: hv.ownerColor ? C[hv.ownerColor] : C.ink6 } : null, mercury: v.mercury });
    refreshTexture(this.statik!.tex);
  }

  private updateSun(v: SystemView, still: boolean) {
    this.sunPool.begin();
    const rs = sunRadius(this.cam.scale);
    const [sx, sy] = makeProj(this.L, this.cam)(0, 0);
    const storm = v.storm !== null;
    const frame = still ? 0 : Math.floor(this.time * (storm ? 2.2 : 0.7)) % 3;
    const G = Math.round(rs * (storm ? 3.4 : 2.9));
    if (sx > -G && sy > -G && sx < this.L.w + G && sy < this.L.h + G) this.sunPool.spr(cachedTexture(`sys:sun:${rs}:${frame}:${storm}`, () => sunCanvas(rs, frame, storm)), Math.round(sx - G - 0.5), Math.round(sy - G - 0.5));
    this.sunPool.end();
  }

  /** The lens's still part: repainted when the Earth has turned, the light moved or the view turned. */
  private updateLens(g: Near) {
    const L = this.lens!;
    const spinStep = Math.max(1, 0.5 / (g.er * RAD));
    const key = `${Math.round((g.sunPhi / TAU) * 64)}|${Math.round(g.spin / spinStep)}|${g.tilt.toFixed(2)}|${g.rot.toFixed(2)}|${this.era}`;
    if (key === this.lensKey) return;
    this.lensKey = key;
    const ox = L.sprite.x;
    const oy = L.sprite.y;
    L.pc.data.fill(0);
    paintNear(L.pc, { ...g, x: g.x - ox, y: g.y - oy }, { terrain: this.terrain(), lens: this.L.lens.r });
    refreshTexture(L.tex);
  }

  private updateLabels(list: SysLabel[]) {
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

  // ── hover and targets ────────────────────────────────────────────────────────────────────
  private inLens(x: number, y: number): boolean {
    const z = this.L.lens;
    return !this.cinematic && Math.hypot(x - z.x, y - z.y) <= z.r + 1;
  }

  /** The nearest target under a point: lens targets inside the lens, the main view's outside it. */
  private hitAt(x: number, y: number, slack = 2): Hit | null {
    const lens = this.inLens(x, y);
    let best: Hit | null = null;
    let bd = Infinity;
    for (const h of this.hits) {
      if (!!h.lens !== lens) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= h.r + slack && d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  private setHover(h: Hit | null) {
    const was = this.hover?.id ?? null;
    this.hover = h;
    if ((h?.id ?? null) !== was) this.game.notify?.();
  }

  /** Client (CSS px) position of a target for the tutorial spotlight: an asteroid id, 'l4', 'l5', 'moon', 'aurora', 'ring', 'earth', 'sun', 'swarm', 'lens'. */
  locate(target: string): { x: number; y: number } | null {
    let p: { x: number; y: number } | null = null;
    if (target === 'lens') p = { x: this.L.lens.x, y: this.L.lens.y };
    else {
      const h = this.hits.find((x) => x.id === target);
      if (h) p = { x: h.x, y: h.y };
    }
    const stage = this.game.stage;
    if (!p || !stage?.canvas || typeof window === 'undefined' || !stage.canvas.getBoundingClientRect) return p;
    const rect = stage.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: rect.left + (p.x * stage.scale) / dpr, y: rect.top + (p.y * stage.scale) / dpr };
  }

  // ── camera controls (keyboard, UI) ───────────────────────────────────────────────────────
  /** Turn and tilt the view by internal pixels (keyboard arrows). */
  pan(dx: number, dy: number) {
    if (this.cinematic) return;
    this.rot += dx * 0.01;
    this.tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, this.tilt - dy * 0.004));
    this.tiltSet = true;
  }

  /** `+` / wheel up: closer in; past the inner system, the orbit view. */
  zoomIn() {
    if (this.cinematic) return;
    if (this.view <= VIEW_MIN + 1e-3) {
      if (this.game.mode !== 'title') this.game.enterOrbit();
      return;
    }
    this.view = Math.max(VIEW_MIN, this.view / ZOOM_STEP);
  }

  /** `-` / wheel down: out toward the belt. */
  zoomOut() {
    if (this.cinematic) return;
    this.view = Math.min(VIEW_MAX, this.view * ZOOM_STEP);
  }

  // ── input ────────────────────────────────────────────────────────────────────────────────
  pointerDown(p: PixelPointer) {
    if (this.cinematic) return;
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.down = null;
      return;
    }
    if (this.pointers.size > 2) return;
    this.down = { x: p.x, y: p.y, rot0: this.rot, tilt0: this.tilt, moved: false };
  }

  pointerMove(p: PixelPointer) {
    if (this.cinematic) return;
    if (this.pointers.has(p.id)) this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2 && this.pinchDist > 0) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 4) {
        this.view = Math.max(VIEW_MIN, Math.min(VIEW_MAX, (this.view * this.pinchDist) / d));
        this.pinchDist = d;
      }
      return;
    }
    const d = this.down;
    if (d && this.pointers.has(p.id)) {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) > dragSlop(p)) d.moved = true;
      if (d.moved) {
        // sideways turns the system round the Sun, up and down tilts it
        this.rot = d.rot0 + dx * 0.008;
        this.tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, d.tilt0 + dy * 0.003));
        this.tiltSet = true;
        this.setHover(null);
        return;
      }
    }
    this.cursor = { x: p.x, y: p.y };
    this.setHover(this.hitAt(p.x, p.y));
  }

  pointerUp(p: PixelPointer) {
    if (this.cinematic) return;
    this.pointers.delete(p.id);
    if (this.pointers.size < 2) this.pinchDist = 0;
    const d = this.down;
    this.down = null;
    if (!d || d.moved) return;
    // a finger is wider than a planet here: the nearest target within ~20 CSS px
    const h = this.hitAt(p.x, p.y, touchRadius(p, 2));
    if (!h || !h.open || this.game.mode === 'title') return;
    if (h.open === 'orbit') this.game.enterOrbit();
    else this.game.enterDiorama(h.open);
  }

  pointerLeave() {
    this.cursor = null;
    this.setHover(null);
  }

  wheel(_p: PixelPointer, deltaY: number) {
    if (this.cinematic) return;
    if (deltaY < 0) this.zoomIn();
    else this.zoomOut();
  }

  destroy() {
    for (const l of [this.sky, this.statik, this.lens, this.near]) if (l) releaseTexture(l.tex);
    this.sky = this.statik = this.lens = this.near = null;
    this.root.destroy({ children: true });
  }
}
