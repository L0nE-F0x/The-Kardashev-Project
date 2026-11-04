/**
 * Act V diorama previews without a browser, in Swarmlight (era 4): the L4 and L5 yards (with drift,
 * a halt and Solar Maximum's storm), Ring One in each mood and with each fate for Bit, the Aurora
 * habitat under each settlement plan by day and night, C, S and M asteroids at every status, the
 * big main-belt worlds, and the Moon with its foundry.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act5-diorama-preview.test.ts
 * PNGs only when PREVIEW_DIR is set. The always-on checks (every piece draws at its layout size with
 * matching frames and glows, plans follow the views, the scene key follows the scenery) always run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { C, paletteTable, setEra, type Era } from '../src/render/palette';
import { hash2, PixelCanvas } from '../src/render/pixels';
import { encodePngRgba } from '../tools/lib/png';
import { bands, campusLayout, itemTop, PARALLAX } from '../src/render/diorama/layout';
import { itemArt } from '../src/render/diorama/campusArt';
import { bloomOf, puffArt } from '../src/render/diorama/draw';
import { pieceArt, pieceSize } from '../src/render/diorama/industry';
import { act3Key, act3Plan } from '../src/render/diorama/act3Pieces';
import { sceneBands } from '../src/render/diorama/scenery';
import { driverPose, earthDisc, lunarPhase, lunarSky, lunarStars, lunarSunArt } from '../src/render/diorama/moon';
import { moonDiscArt, paleBlueDot, spaceSkyArt, spaceSkyPlan, spaceSunArt, swarmArt } from '../src/render/diorama/space';
import { habitatSkyArt } from '../src/render/diorama/habitat';
import { driftLevel, ringRacks, stormLevel, yardModules } from '../src/render/diorama/act5Pieces';
import { decodeWorldMap } from '../src/world/mapData';
import { subsolar } from '../src/world/sun';
import { terrainCanvas } from '../src/render/worldMap/terrain';
import { MOON_SITE, SPACE_SITES, siteDef } from '../src/content/sites';
import { ASTEROIDS } from '../src/content/system';
import { act5PreviewState, type Act5PreviewOpts } from '../src/sim/systemPreview';
import type { AsteroidType, GameState } from '../src/sim/types';

const dir = process.env.PREVIEW_DIR;

// ── a tiny RGB compositor that mirrors the Pixi layer stack ────────────────────────────────
type RGB = [number, number, number];
class Frame {
  data: Float32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Float32Array(w * h * 3);
  }
  draw(pc: PixelCanvas, ox: number, oy: number, tint: RGB = [1, 1, 1], alpha = 1) {
    const pal = paletteTable();
    for (let y = 0; y < pc.h; y++) {
      const ty = oy + y;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < pc.w; x++) {
        const tx = ox + x;
        if (tx < 0 || tx >= this.w) continue;
        const c = pc.data[y * pc.w + x];
        if (!c) continue;
        const o = (ty * this.w + tx) * 3;
        for (let k = 0; k < 3; k++) this.data[o + k] = this.data[o + k] * (1 - alpha) + (pal[c * 4 + k] / 255) * tint[k] * alpha;
      }
    }
  }
  add(pc: PixelCanvas, ox: number, oy: number, alpha: number) {
    const pal = paletteTable();
    for (let y = 0; y < pc.h; y++) {
      const ty = oy + y;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < pc.w; x++) {
        const tx = ox + x;
        if (tx < 0 || tx >= this.w) continue;
        const c = pc.data[y * pc.w + x];
        if (!c) continue;
        const o = (ty * this.w + tx) * 3;
        for (let k = 0; k < 3; k++) this.data[o + k] = Math.min(1, this.data[o + k] + (pal[c * 4 + k] / 255) * alpha);
      }
    }
  }
  png(scale: number) {
    const W = this.w * scale;
    const H = this.h * scale;
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (Math.floor(y / scale) * this.w + Math.floor(x / scale)) * 3;
        const o = (y * W + x) * 4;
        out[o] = Math.round(this.data[i] * 255);
        out[o + 1] = Math.round(this.data[i + 1] * 255);
        out[o + 2] = Math.round(this.data[i + 2] * 255);
        out[o + 3] = 255;
      }
    }
    return encodePngRgba(W, H, out);
  }
}

/** The scene's night grading (Earth and the habitat: 0.78 at full night; the lunar night: 0.74). */
const gradeAt = (d: number, lunar: boolean): RGB => (lunar ? [1 - 0.78 * d, 1 - 0.74 * d, 1 - 0.48 * d] : [1 - 0.76 * d, 1 - 0.73 * d, 1 - 0.5 * d]);

let terrain: { pc: PixelCanvas; res: number } | undefined;
function worldTerrain() {
  if (!terrain) {
    const buf = fs.readFileSync(path.resolve(__dirname, '../src/content/generated/worldmap.bin'));
    const lods = decodeWorldMap(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    terrain = { pc: terrainCanvas(lods[1]), res: lods[1].res };
  }
  return terrain;
}

interface Opts {
  /** Habitat / Moon: the night (mirrors closed, lunar night). Space is always sunlit. */
  night?: boolean;
  vw?: number;
  vh?: number;
  cam?: number;
  /** Scene seconds (for the catapult / mass driver). */
  t?: number;
  /** Animation frame of the pieces and band props. */
  frame?: number;
}

function pathPoint(p: [number, number][], t: number, pingpong: boolean): [number, number] {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const d = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    segs.push(d);
    total += d;
  }
  let u = ((t % 1) + 1) % 1;
  if (pingpong) u = u < 0.5 ? u * 2 : 2 - u * 2;
  let d = u * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return [p[i][0] + (p[i + 1][0] - p[i][0]) * k, p[i][1] + (p[i + 1][1] - p[i][1]) * k];
    }
    d -= segs[i];
  }
  return p[0];
}

/**
 * Render a site. Without `cam` it's a panorama (every band as wide as the scene); with `cam` it's
 * one screen at that camera x, bands offset by their parallax like the scene does.
 */
function compose(s: GameState | null, siteId: string, opts: Opts = {}): Frame {
  const vh = opts.vh ?? 180;
  const site = siteDef(siteId);
  const bd = site.backdrop;
  const space = bd === 'space' || bd === 'asteroid';
  const lunar = bd === 'lunar';
  const habitat = bd === 'habitat';
  const viewW = opts.vw ?? 320;
  const layout = campusLayout(s, siteId, viewW);
  const pano = opts.cam === undefined;
  const W = pano ? layout.width : viewW;
  const cam = pano ? 0 : Math.max(0, Math.min(layout.width - viewW, opts.cam!));
  const bandVw = pano ? layout.width : viewW;
  const b = bands(bandVw, vh, layout.width);
  const sb = sceneBands(site, layout, bandVw, vh);
  const fr = new Frame(W, vh);
  const night = !!opts.night;
  const glowOn = space || night;
  let tint: RGB = [1, 1, 1];
  const px = (k: number) => -Math.round(cam * k);
  const time = opts.t ?? 0;
  const fi = opts.frame ?? 0;
  const sc = layout.scenery;
  // ── sky
  if (space) {
    const place = sc?.kind === 'space' ? sc.place : 'asteroid';
    const au = sc?.kind === 'asteroid' ? sc.au : 1;
    const swarm = sc?.kind === 'space' || sc?.kind === 'asteroid' ? sc.swarm : 0;
    const sv = Math.min(W, viewW);
    const plan = spaceSkyPlan(sv, vh, place, au);
    const seed = 37 + (place === 'l5' ? 11 : place === 'ring' ? 23 : place === 'asteroid' ? 31 + Math.round(au * 7) : 0);
    fr.draw(spaceSkyArt(W, vh, seed), 0, 0);
    fr.draw(swarmArt(sv, vh, plan, swarm, seed), 0, 0, [0.95, 0.95, 0.95]);
    const sun = spaceSunArt(plan.sun.r);
    const half = (sun.w - 1) / 2;
    fr.draw(sun, Math.round(plan.sun.x - half), Math.round(plan.sun.y - half));
    if (plan.moon) fr.draw(moonDiscArt(plan.moon.r), plan.moon.x - plan.moon.r - 1, plan.moon.y - plan.moon.r - 1);
    if (plan.earth) {
      const sub = subsolar(new Date(Date.UTC(2084, 4, 1, 14)));
      const e = earthDisc(plan.earth.r, { lon0: ((sub.lon + 70 + 540) % 360) - 180, lat0: 12 }, sub, worldTerrain());
      fr.draw(e, Math.round(plan.earth.x - e.w / 2), Math.round(plan.earth.y - e.h / 2));
    } else if (plan.dot) fr.draw(paleBlueDot(), plan.dot.x - 1, plan.dot.y - 1);
    tint = plan.light;
  } else if (habitat) {
    const sky = habitatSkyArt(W, vh, b.groundY, 53);
    tint = night ? gradeAt(0.72, false) : [1, 1, 1];
    fr.draw(sky.base, 0, 0, tint);
    if (night) fr.draw(sky.glow, 0, 0);
  } else if (lunar) {
    const sky = new PixelCanvas(W, b.groundY + 4);
    sky.vgradient(0, 0, W, sky.h, [C.ink0, C.ink0, C.ink0, C.night0]);
    fr.draw(sky, 0, 0);
    fr.draw(lunarStars(W, sky.h), 0, 0, [0.95, 0.95, 0.95]);
    const t0 = Date.UTC(2084, 3, 1, 9);
    const want = night ? 0.86 : 0.12;
    const date = new Date(t0 + ((((want - lunarPhase(new Date(t0))) % 1) + 1) % 1) * 29.530588853 * 86_400_000);
    const sub = subsolar(date);
    const ls = lunarSky(date, sub.lon);
    const sv = Math.min(W, 640);
    if (ls.sun !== null) fr.draw(lunarSunArt(), Math.round(sv * ls.sun - 8), Math.round(b.farY + b.farH * 0.16 - 8));
    const r = Math.max(7, Math.round(vh * 0.045));
    fr.draw(earthDisc(r, ls.earth, sub, worldTerrain()), Math.round(sv * 0.7 - r - 2), Math.round(b.farY - r * 1.2));
    tint = night ? gradeAt(0.74, true) : gradeAt(0.04, true);
  }
  // ── bands
  fr.draw(sb.far, px(PARALLAX.far), b.farY, tint);
  fr.draw(sb.mid, px(PARALLAX.mid), b.midY, tint);
  const midGlows: [PixelCanvas, number, number][] = [];
  if (sb.midGlow && glowOn) midGlows.push([sb.midGlow, px(PARALLAX.mid), b.midY]);
  for (const p of sb.midProps) {
    const k = p.frames.length > 1 ? fi % p.frames.length : 0;
    fr.draw(p.frames[k], px(PARALLAX.mid) + p.x, p.y, tint);
    if (p.glow?.[k] && glowOn) midGlows.push([p.glow[k], px(PARALLAX.mid) + p.x, p.y]);
  }
  for (const [g, x, y] of midGlows) fr.draw(g, x, y, [1, 1, 1], 0.9);
  if (sb.back) {
    const bx = px(PARALLAX.back);
    fr.draw(sb.back.base, bx, sb.back.y, tint);
    if (glowOn) {
      fr.draw(sb.back.glow[0], bx, sb.back.y);
      fr.add(bloomOf(sb.back.glow[0]), bx, sb.back.y, sb.back.bloom);
    }
  }
  const wx = px(1);
  fr.draw(sb.groundFrames?.[fi % sb.groundFrames.length] ?? sb.ground, wx, b.groundY, tint);
  const glowJobs: [PixelCanvas, number, number][] = [];
  const puffs: [PixelCanvas, number, number, number][] = [];
  const late: (() => void)[] = [];
  const day = s?.day ?? 0;
  for (const it of layout.items) {
    const ia = itemArt(it, 'FXL', day);
    if (!ia) continue;
    const art = ia.art;
    const y = itemTop(it, b.groundY);
    const x = wx + it.x;
    const k = fi % art.base.length;
    fr.draw(art.base[k], x, y, tint);
    if (art.glow[k]) glowJobs.push([art.glow[k], x, y]);
    for (const m of art.movers ?? []) {
      const p = pathPoint(m.path, m.phase + fi * 0.07, !!m.pingpong);
      const mf = m.frames[fi % m.frames.length];
      fr.draw(mf, x + Math.round(p[0]) - Math.floor(mf.w / 2), y + Math.round(p[1]) - mf.h, tint);
    }
    for (const e of art.emitters ?? []) {
      const pix = e.kind === 'grit' || e.kind === 'spark' || e.kind === 'dust' || e.kind === 'mist';
      const n = Math.round(e.rate * (pix ? 2.5 : 5));
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * (pix ? 1.6 : 3);
        const vx = pix ? (hash2(i, 3, e.x) - 0.4) * (e.kind === 'spark' ? 22 : 10) : 3 + hash2(i, 1, e.x) * 3;
        const vy = pix ? -2 - hash2(i, 4, e.x) * (e.kind === 'spark' ? 12 : 6) : -5 - hash2(i, 2, e.x) * 3;
        const r = pix ? 1 : Math.min(e.size ?? 2, 1 + Math.floor((a / 3) * 3));
        const life = e.kind === 'spark' ? 0.4 : 1;
        if (e.kind === 'spark' && a > life) continue;
        puffs.push([puffArt(r, e.kind), Math.round(x + e.x + vx * a * (e.kind === 'spark' ? 0.3 : 1) - r), Math.round(y + e.y + vy * a * (e.kind === 'spark' ? 0.3 : 1) - r), 0.85]);
      }
    }
    if (art.driver) {
      const D = art.driver;
      const pose = driverPose(time, D);
      if (pose.visible) {
        const cx = Math.round(x + pose.x - D.ax);
        const cy = Math.round(y + pose.y - D.ay);
        late.push(() => fr.draw(D.frames[pose.frame], cx, cy, tint));
        glowJobs.push([D.glow[pose.frame], cx, cy]);
      }
    }
  }
  for (const f of late) f();
  for (const [pc, x, y, a] of puffs) fr.draw(pc, x, y, tint, a);
  fr.draw(sb.fgFrames?.[0] ?? sb.fg, wx, vh - b.fgH + 2, tint);
  if (glowOn) {
    const ga = space ? 0.92 : 1;
    const ba = space ? 0.3 : 0.55;
    for (const [g, x, y] of glowJobs) fr.draw(g, x, y, [1, 1, 1], ga);
    for (const [g, x, y] of glowJobs) fr.add(bloomOf(g), x, y, ba);
  }
  return fr;
}

// ── worlds ─────────────────────────────────────────────────────────────────────────────────
const world = (o: Act5PreviewOpts = {}, edit?: (s: GameState) => void) => {
  const s = act5PreviewState(o);
  edit?.(s);
  return s;
};
const capAt = (site: string, cap: number) => (s: GameState) => {
  const f = s.system!.foundries.find((x) => x.site === site);
  if (f) f.cap = cap;
  else s.system!.foundries.push({ id: `t5-${site}`, site, cap, founded: s.day - 100, owner: 'charter', drift: 0, haltedUntil: 0 });
};
const halt = (site: string) => (s: GameState) => s.system!.foundries.filter((f) => f.site === site).forEach((f) => (f.haltedUntil = s.day + 30));
const driftAt = (site: string, d: number) => (s: GameState) => s.system!.foundries.filter((f) => f.site === site).forEach((f) => (f.drift = d));
/** An asteroid at a status (3 adds a foundry of `cap`). */
const rock = (id: string, status: 0 | 1 | 2 | 3, cap = 4, owner = 'lodestar') => (s: GameState) => {
  s.system!.asteroids[id] = { status, owner: status >= 2 ? owner : null };
  s.system!.foundries = s.system!.foundries.filter((f) => f.site !== id);
  if (status === 3) s.system!.foundries.push({ id: `t5-${id}`, site: id, cap, founded: s.day - 300, owner, drift: 0, haltedUntil: 0 });
};

const write = (name: string, png: Buffer) => fs.writeFileSync(path.join(dir!, name), png);

describe.skipIf(!dir)('act V diorama previews (Swarmlight)', () => {
  it('the L4 and L5 yards: growth, drift, a halt, the storm', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(4 as Era);
    for (const id of ['l4', 'l5']) {
      const s = world();
      write(`a5-${id}.png`, compose(s, id).png(1));
      const w = campusLayout(s, id, 320).width;
      for (const [k, cam] of [[0, 0], [1, Math.round(w * 0.3)], [2, Math.round(w * 0.6)], [3, w]] as [number, number][]) write(`a5-${id}-view${k}.png`, compose(s, id, { cam }).png(3));
    }
    for (const f of [0, 1, 2, 3, 4, 5]) write(`a5-l4-anim-f${f}.png`, compose(world(), 'l4', { cam: 150, frame: f }).png(3));
    write(`a5-l4-copy.png`, compose(world(), 'l4', { cam: 10_000, frame: 5 }).png(3));
    write(`a5-l4-small.png`, compose(world({}, capAt('l4', 0.2)), 'l4').png(2));
    write(`a5-l4-big.png`, compose(world({ typeI: true }, capAt('l4', 150)), 'l4').png(1));
    write(`a5-l4-empty.png`, compose(world({}, (s) => (s.system!.foundries = s.system!.foundries.filter((f) => f.site !== 'l4'))), 'l4').png(2));
    for (const d of [20, 50, 90]) {
      const s = world({ drift: d });
      const it = campusLayout(s, 'l4', 320).items.find((x) => x.piece?.variant?.includes('q'))!;
      write(`a5-l4-drift${d}.png`, compose(s, 'l4', { cam: it.x - 100, frame: 1 }).png(3));
    }
    write(`a5-l4-halted.png`, compose(world({}, halt('l4')), 'l4', { cam: 150 }).png(3));
    write(`a5-l4-storm.png`, compose(world({ storm: 90 }), 'l4', { cam: 150, frame: 2 }).png(3));
    write(`a5-l5-storm-pano.png`, compose(world({ storm: 60 }), 'l5', { frame: 1 }).png(1));
    write(`a5-l5-phone.png`, compose(world(), 'l5', { cam: 200, vw: 422, vh: 195 }).png(3));
    setEra(0 as Era);
  });

  it('Ring One: moods, fates, the storm', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(4 as Era);
    const s = world();
    write(`a5-ring.png`, compose(s, 'ring').png(1));
    const w = campusLayout(s, 'ring', 320).width;
    for (const [k, cam] of [[0, 0], [1, Math.round(w * 0.4)], [2, w]] as [number, number][]) write(`a5-ring-view${k}.png`, compose(s, 'ring', { cam }).png(3));
    const hubAt = (st: GameState) => campusLayout(st, 'ring', 320).items.find((x) => x.piece?.kind === 'ringHub')!.x - 60;
    for (const [tag, mood, fate] of [['calm-costeward', 88, 'costeward'], ['mixed-free', 50, 'free'], ['restless-leash', 18, 'leash'], ['calm-none', 80, null]] as [string, number, 'costeward' | 'free' | 'leash' | null][]) {
      const st = world({}, (x) => ((x.system!.mindsMood = mood), (x.system!.bitFate = fate)));
      for (const f of [0, 1]) write(`a5-ring-${tag}-f${f}.png`, compose(st, 'ring', { cam: hubAt(st), frame: f }).png(3));
    }
    write(`a5-ring-small.png`, compose(world({}, (x) => (x.system!.rings = 12)), 'ring').png(2));
    write(`a5-ring-none.png`, compose(world({}, (x) => (x.system!.rings = 0)), 'ring').png(2));
    write(`a5-ring-typeI.png`, compose(world({ typeI: true }), 'ring').png(1));
    write(`a5-ring-storm.png`, compose(world({ storm: 90 }), 'ring', { cam: 100, frame: 3 }).png(3));
    setEra(0 as Era);
  });

  it('Aurora under each settlement plan, by day and night', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(4 as Era);
    const plans: [string, GameState][] = [
      ['early', world({ stage: 2 })],
      ['settle', world({ stage: 3 })],
      ['settle-full', world({ stage: 3 }, (x) => ((x.system!.spacePop = 400), x.charter!.projects.forEach((p) => p.kind === 'habitat' && ((p.status = 'done'), (p.size = 3)))))],
      ['stations', world({ stage: 3 }, (x) => (x.system!.settlement = 'stations'))],
      ['private', world({ stage: 3 }, (x) => (x.system!.settlement = 'private'))],
    ];
    for (const [tag, s] of plans) {
      write(`a5-aurora-${tag}.png`, compose(s, 'aurora').png(1));
      write(`a5-aurora-${tag}-night.png`, compose(s, 'aurora', { night: true }).png(1));
      write(`a5-aurora-${tag}-view.png`, compose(s, 'aurora', { cam: 0 }).png(3));
      write(`a5-aurora-${tag}-view-night.png`, compose(s, 'aurora', { cam: 0, night: true }).png(3));
    }
    const s = plans[2][1];
    const w = campusLayout(s, 'aurora', 320).width;
    for (const [k, cam] of [[1, Math.round(w * 0.35)], [2, Math.round(w * 0.7)]] as [number, number][]) {
      write(`a5-aurora-settle-view${k}.png`, compose(s, 'aurora', { cam, frame: k }).png(3));
      write(`a5-aurora-settle-view${k}-night.png`, compose(s, 'aurora', { cam, night: true }).png(3));
    }
    write(`a5-aurora-phone.png`, compose(s, 'aurora', { cam: 200, vw: 422, vh: 195 }).png(3));
    setEra(0 as Era);
  });

  it('asteroids of each type at every status, and the big worlds', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(4 as Era);
    for (const id of ['bennu', 'eros', 'da1986', 'ryugu', 'itokawa', 'didymos', 'apophis']) {
      for (const st of [0, 1, 2, 3] as const) {
        const s = world({}, rock(id, st, 5, id === 'eros' ? 'charter' : 'vonn'));
        write(`a5-ast-${id}-s${st}.png`, compose(s, id, { t: 2.4 }).png(2));
        if (st >= 1) write(`a5-ast-${id}-s${st}-view.png`, compose(s, id, { cam: st === 3 ? 160 : 40, t: 2.4, frame: 1 }).png(3));
      }
    }
    for (const id of ['ceres', 'vesta', 'psyche']) {
      const s = world({ stage: 3 }, rock(id, 3, 40, 'lodestar'));
      write(`a5-ast-${id}.png`, compose(s, id, { t: 2.6 }).png(2));
      write(`a5-ast-${id}-view.png`, compose(s, id, { cam: 0, t: 2.6 }).png(3));
      write(`a5-ast-${id}-s1.png`, compose(world({}, rock(id, 1)), id).png(2));
    }
    write(`a5-ast-eros-halted.png`, compose(world({}, (x) => (rock('eros', 3, 7, 'charter')(x), halt('eros')(x))), 'eros', { cam: 160 }).png(3));
    write(`a5-ast-da1986-drift.png`, compose(world({}, (x) => (rock('da1986', 3, 4, 'vonn')(x), driftAt('da1986', 80)(x))), 'da1986', { cam: 60 }).png(3));
    for (const t of [1, 1.9, 2.4, 3, 3.6]) write(`a5-ast-bennu-catapult-t${t}.png`, compose(world(), 'bennu', { cam: 10_000, t }).png(3));
    setEra(0 as Era);
  });

  it('the Moon with its foundry', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(4 as Era);
    const s = world();
    write(`a5-moon.png`, compose(s, MOON_SITE.id).png(1));
    const it = campusLayout(s, MOON_SITE.id, 320).items.find((x) => x.piece?.kind === 'moonFoundry')!;
    for (const f of [0, 4, 8]) write(`a5-moon-foundry-f${f}.png`, compose(s, MOON_SITE.id, { cam: it.x - 30, frame: f }).png(3));
    write(`a5-moon-foundry-night.png`, compose(s, MOON_SITE.id, { cam: it.x - 30, night: true }).png(3));
    write(`a5-moon-foundry-big.png`, compose(world({}, capAt('moon', 80)), MOON_SITE.id, { cam: it.x - 30 }).png(3));
    write(`a5-moon-foundry-halted.png`, compose(world({}, (x) => (halt('moon')(x), driftAt('moon', 70)(x))), MOON_SITE.id, { cam: it.x - 30 }).png(3));
    setEra(0 as Era);
  });
});

// ── always-on checks ───────────────────────────────────────────────────────────────────────
const worlds = (): GameState[] => [
  world(),
  world({ storm: 80, drift: 60 }),
  world({ typeI: true, stage: 3 }),
  world({ stage: 3 }, (x) => ((x.system!.settlement = 'stations'), halt('l4')(x), driftAt('l5', 40)(x))),
  world({ stage: 3 }, (x) => ((x.system!.settlement = 'private'), (x.system!.bitFate = 'leash'), (x.system!.mindsMood = 10))),
  world({}, (x) => ((x.system!.foundries = []), (x.system!.rings = 0), (x.system!.bitFate = 'free'))),
];

describe('act V diorama art', () => {
  it('every Act V piece draws at its layout size, frames and glows matching', () => {
    const seen = new Set<string>();
    for (const s of worlds()) {
      for (const site of [...SPACE_SITES, MOON_SITE]) {
        const l = campusLayout(s, site.id, 320);
        expect(l.viewOnly).toBe(true);
        let right = 0;
        for (const it of l.items) {
          const p = it.piece!;
          expect(it.x).toBeGreaterThanOrEqual(right);
          right = it.x + it.w;
          const a = pieceArt(p);
          const [w, h] = pieceSize(p);
          expect([w, h]).toEqual([it.w, it.h]);
          expect(a.base.length).toBeGreaterThan(0);
          expect(a.glow.length === 0 || a.glow.length === a.base.length).toBe(true);
          for (const pc of [...a.base, ...a.glow]) expect([pc.w, pc.h]).toEqual([w, h]);
          expect(h).toBeLessThan(140);
          if (a.driver) {
            expect(a.driver.frames.length).toBe(3);
            for (const [x, y] of a.driver.rail) {
              expect(x).toBeLessThan(w);
              expect(y).toBeGreaterThan(0);
            }
          }
          seen.add(p.kind);
        }
        expect(right).toBeLessThanOrEqual(l.width);
        const sb = sceneBands(site, l, 320, 180);
        expect(sb.ground.w).toBe(l.width);
        for (const pr of sb.midProps) expect(pr.glow === undefined || pr.glow.length === pr.frames.length).toBe(true);
      }
    }
    for (const k of ['yardsModule', 'yardsCopy', 'yardsOutbound', 'yardsDock', 'yardsBerth', 'ringRack', 'ringHub', 'ringHead', 'habHouses', 'habSchool', 'habPark', 'habFarm', 'habDorms', 'habWorks', 'habTower', 'habVilla', 'habBuild', 'astRocks', 'astBeacon', 'astClaim', 'astRig', 'astCatapult', 'moonFoundry']) {
      expect(seen.has(k), k).toBe(true);
    }
  });

  it('the yards and the ring grow with capacity, on a log scale', () => {
    expect([0, 0.1, 1, 14, 100, 1000].map(yardModules)).toEqual([0, 1, 3, 6, 8, 8]);
    expect([0, 10, 600, 5000, 1e5].map(ringRacks)).toEqual([0, 2, 6, 8, 9]);
    expect([null, 0, 0.5, 1].map(stormLevel)).toEqual([0, 1, 2, 3]);
    expect([0, 10, 50, 90].map(driftLevel)).toEqual([0, 1, 2, 3]);
    const mods = (s: GameState, id: string) => act3Plan(s, siteDef(id), 320).pieces.filter((p) => p.kind === 'yardsModule');
    expect(mods(world({}, capAt('l4', 150)), 'l4').length).toBeGreaterThan(mods(world({}, capAt('l4', 0.3)), 'l4').length);
    // L4 leans to collectors, L5 to hulls; one module is always being copied
    const s = world();
    expect(mods(s, 'l4')[0].variant?.[0]).toBe('c');
    expect(mods(s, 'l5')[0].variant?.[0]).toBe('h');
    expect(act3Plan(s, siteDef('l4'), 320).pieces.filter((p) => p.kind === 'yardsCopy')).toHaveLength(1);
    // a strain drifting at L4: one module under a quarantine net
    expect(mods(world({ drift: 70 }), 'l4').filter((p) => p.variant?.includes('q3'))).toHaveLength(1);
    expect(mods(s, 'l4').some((p) => p.variant?.includes('q'))).toBe(false);
    // L5 hangs its habitats in the sky; L4 doesn't
    const l5 = act3Plan(s, siteDef('l5'), 320).scenery;
    expect(l5?.kind === 'space' && l5.habitats).toBeGreaterThan(0);
  });

  it('the asteroid plans follow the status, the Moon gets its foundry only in Act V', () => {
    for (const a of ASTEROIDS) {
      for (const st of [0, 1, 2, 3] as const) {
        const s = world({}, rock(a.id, st));
        const kinds = act3Plan(s, siteDef(a.id), 320).pieces.map((p) => p.kind);
        expect(kinds.includes('astBeacon')).toBe(st === 1);
        expect(kinds.includes('astClaim')).toBe(st >= 2);
        expect(kinds.includes('astRig')).toBe(st === 3);
        expect(kinds.includes('astCatapult')).toBe(st === 3);
        const sc = act3Plan(s, siteDef(a.id), 320).scenery;
        expect(sc?.kind === 'asteroid' && sc.type).toBe(a.type as AsteroidType);
      }
    }
    expect(act3Plan(world(), MOON_SITE, 320).pieces.some((p) => p.kind === 'moonFoundry')).toBe(true);
    const noFoundry = world({}, (x) => (x.system!.foundries = x.system!.foundries.filter((f) => f.site !== 'moon')));
    expect(act3Plan(noFoundry, MOON_SITE, 320).pieces.some((p) => p.kind === 'moonFoundry')).toBe(false);
  });

  it('the scene key changes with what the sky shows (the storm, the swarm)', () => {
    const a = act3Key(world(), siteDef('l5'));
    const b = act3Key(world({ storm: 50 }), siteDef('l5'));
    const c = act3Key(world({ collectors: 4000 }), siteDef('l5'));
    expect(new Set([a, b, c]).size).toBe(3);
    for (const id of SPACE_SITES.map((x) => x.id)) expect(act3Key(world(), siteDef(id)).length).toBeGreaterThan(0);
  });
});
