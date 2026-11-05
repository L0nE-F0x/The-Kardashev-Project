/**
 * Act IV diorama previews without a browser, in Orbital Dawn (era 3): the Moon base at every stage
 * (with the next stage under construction, by day and in the lunar night, and the mass driver
 * firing), the megaprojects with fusion fleets of each design (and their construction sites), the
 * Sahara's air-capture farms, and the launch complex grown into a spaceport.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act4-diorama-preview.test.ts
 * PNGs only when PREVIEW_DIR is set. The always-on checks (art builds for every design and stage,
 * sizes, layouts, the launch and mass-driver cycles, and a smoke run of the real scene) always run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { C, paletteTable, setEra, type Era } from '../src/render/palette';
import { hash2, PixelCanvas } from '../src/render/pixels';
import { encodePngRgba } from '../tools/lib/png';
import { bands, campusLayout, itemTop, PARALLAX } from '../src/render/diorama/layout';
import { itemArt } from '../src/render/diorama/campusArt';
import { bigRotorFrames, rotorFrames, type RotorSpec } from '../src/render/diorama/art';
import { bloomOf, puffArt } from '../src/render/diorama/draw';
import { pieceArt, pieceSize, type PieceSpec } from '../src/render/diorama/industry';
import { act3Key, act3Plan } from '../src/render/diorama/act3Pieces';
import { sceneBands } from '../src/render/diorama/scenery';
import { igniteAt, launchFlash, rocketPose } from '../src/render/diorama/launch';
import { builderRamp } from '../src/render/diorama/act3kit';
import { DESIGN_BUILDER, FUSION_SIZE, fusionPlant, dacFarm, dacBlocks } from '../src/render/diorama/fusion';
import { driverPose, earthDisc, lunarPhase, lunarSky, lunarStars, lunarSunArt, massDriver } from '../src/render/diorama/moon';
import { decodeWorldMap } from '../src/world/mapData';
import { subsolar } from '../src/world/sun';
import { terrainCanvas } from '../src/render/worldMap/terrain';
import { CONTRACT_KINDS } from '../src/content/charter';
import { LAUNCH_SITES, MEGA_SITES, MOON_SITE, siteDef } from '../src/content/sites';
import { act4PreviewState } from '../src/sim/planetPreview';
import { megaView } from '../src/sim/charterView';
import { moonView, orbitView } from '../src/sim/planetView';
import type { ContractKind, ContractSize, FusionDesignId, GameState, Project } from '../src/sim/types';
import { act3Fixture } from './helpers/act3fixture';

const dir = process.env.PREVIEW_DIR;
const DESIGNS: FusionDesignId[] = ['tokamak', 'stellarator', 'laser', 'pinch', 'dhe3'];

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

/** The scene's night grading at a darkness d (Earth: 0.78; the lunar night: 0.74). */
const gradeAt = (d: number, lunar: boolean): RGB => (lunar ? [1 - 0.78 * d, 1 - 0.74 * d, 1 - 0.48 * d] : [1 - 0.76 * d, 1 - 0.73 * d, 1 - 0.5 * d]);
const rotorCanvas = (r: RotorSpec, k: number) => (r.style === 'big' ? bigRotorFrames(r.size, r.col)[k % 16] : rotorFrames(r.size, r.col)[k % 8]);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  night: boolean;
  vw?: number;
  vh?: number;
  cam?: number;
  /** Scene seconds (launch cycles run at +6 s, like the scene). */
  t?: number;
  /** Frame of animated pieces to draw. */
  frame?: number;
}

/**
 * Render a site. Without `cam` it's a panorama (every band as wide as the scene); with `cam` it's
 * one screen at that camera x, bands offset by their parallax like the scene does.
 */
function compose(s: GameState | null, siteId: string, opts: Opts): Frame {
  const vh = opts.vh ?? 180;
  const site = siteDef(siteId);
  const lunar = site.backdrop === 'lunar';
  const viewW = opts.vw ?? 320;
  const layout = campusLayout(s, siteId, viewW);
  const pano = opts.cam === undefined;
  const W = pano ? layout.width : viewW;
  const cam = pano ? 0 : Math.max(0, Math.min(layout.width - viewW, opts.cam!));
  const bandVw = pano ? layout.width : viewW;
  const b = bands(bandVw, vh, layout.width);
  const sb = sceneBands(site, layout, bandVw, vh);
  const fr = new Frame(W, vh);
  const tint: RGB = opts.night ? gradeAt(lunar ? 0.74 : 0.78, lunar) : lunar ? gradeAt(0.04, true) : [1, 1, 1];
  const px = (k: number) => -Math.round(cam * k);
  const time = opts.t ?? 0;
  // sky
  const sky = new PixelCanvas(W, b.groundY + 4);
  if (lunar) {
    sky.vgradient(0, 0, W, sky.h, [C.ink0, C.ink0, C.ink0, C.night0]);
    fr.draw(sky, 0, 0);
    fr.draw(lunarStars(W, sky.h), 0, 0, [0.95, 0.95, 0.95]);
    // a lunar day (sun up, a nearly full Earth) or the lunar night (a gibbous Earth lighting the base)
    const t0 = Date.UTC(2062, 3, 1, 9);
    const want = opts.night ? 0.86 : 0.12;
    const date = new Date(t0 + ((((want - lunarPhase(new Date(t0))) % 1) + 1) % 1) * 29.530588853 * 86_400_000);
    const sub = subsolar(date);
    const ls = lunarSky(date, sub.lon);
    const sv = Math.min(W, 640);
    if (ls.sun !== null) fr.draw(lunarSunArt(), Math.round(sv * ls.sun - 8), Math.round(b.farY + b.farH * 0.16 - 8));
    const r = Math.max(7, Math.round(vh * 0.045));
    fr.draw(earthDisc(r, ls.earth, sub, worldTerrain()), Math.round(sv * 0.7 - r - 2), Math.round(b.farY - r * 1.2));
  } else {
    sky.vbands(0, 0, W, sky.h, opts.night ? [C.night0, C.night1, C.night2, C.night3] : [C.sky1, C.sky2, C.sky3, C.sky4, C.sky5]);
    fr.draw(sky, 0, 0, tint);
    if (opts.night) {
      const st = new PixelCanvas(W, Math.round(sky.h * 0.7));
      for (let i = 0; i < 90 * (W / 320); i++) st.set(Math.floor(hash2(i, 1, 33) * st.w), Math.floor(hash2(i, 2, 33) * st.h), hash2(i, 3, 33) > 0.85 ? C.yel2 : C.ice2);
      fr.draw(st, 0, 0, tint);
    }
  }
  fr.draw(sb.far, px(PARALLAX.far), b.farY, tint);
  fr.draw(sb.mid, px(PARALLAX.mid), b.midY, tint);
  for (const p of sb.midProps) fr.draw(p.frames[0], px(PARALLAX.mid) + p.x, p.y, tint);
  if (sb.back) {
    const bx = px(PARALLAX.back);
    fr.draw(sb.back.base, bx, sb.back.y, tint);
    sb.back.rotors.forEach((r, i) => fr.draw(rotorCanvas(r, i * 3), bx + r.x - r.size - 1, sb.back!.y + r.y - r.size - 1, tint));
    if (opts.night) {
      fr.draw(sb.back.glow[0], bx, sb.back.y);
      fr.add(bloomOf(sb.back.glow[0]), bx, sb.back.y, sb.back.bloom);
    }
  }
  const wx = px(1);
  fr.draw(sb.groundFrames?.[0] ?? sb.ground, wx, b.groundY, tint);
  const glowJobs: [PixelCanvas, number, number][] = [];
  const puffs: [PixelCanvas, number, number, number][] = [];
  const flashes: [PixelCanvas, number, number, number][] = [];
  const day = s?.day ?? 0;
  const late: (() => void)[] = [];
  for (const it of layout.items) {
    const ia = itemArt(it, 'FXL', day);
    if (!ia) continue;
    const art = ia.art;
    const y = itemTop(it, b.groundY);
    const x = wx + it.x;
    const fi = (opts.frame ?? 0) % art.base.length;
    fr.draw(art.base[fi], x, y, tint);
    if (art.glow[fi]) glowJobs.push([art.glow[fi], x, y]);
    for (const [ri, r] of (art.rotors ?? []).entries()) fr.draw(rotorCanvas(r, Math.floor(hash2(r.x, ri, 1) * 16)), x + r.x - r.size - 1, y + r.y - r.size - 1, tint);
    for (const m of art.movers ?? []) {
      const p = pathPoint(m.path, m.phase, !!m.pingpong);
      fr.draw(m.frames[0], x + Math.round(p[0]) - Math.floor(m.frames[0].w / 2), y + Math.round(p[1]) - m.frames[0].h, tint);
    }
    if (!ia.building) {
      for (const e of art.emitters ?? []) {
        const ballistic = e.kind === 'mist' || e.kind === 'dust';
        const n = Math.round(e.rate * 6 * (e.kind === 'steam' ? 1 : 0.8));
        const life = e.kind === 'steam' ? 4.2 : e.kind === 'smoke' ? 3.5 : ballistic ? 1.2 : 2.2;
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * life;
          const k = a / life;
          const vx = ballistic ? (hash2(i, 3, e.x) - 0.5) * 8 : 3 + hash2(i, 1, e.x) * 4;
          const vy = ballistic ? -5 - hash2(i, 4, e.x) * 5 + 9 * a : -6 - hash2(i, 2, e.x) * 4;
          const r = ballistic ? 1 : Math.min(e.size ?? (e.kind === 'steam' ? 4 : 3), 1 + Math.floor(k * (e.kind === 'steam' ? 5 : 3)));
          if (!ballistic && k > 0.75 && hash2(i, 9, e.y) < (k - 0.75) * 4) continue;
          puffs.push([puffArt(r, e.kind), Math.round(x + e.x + (hash2(i, 5, e.y) - 0.5) * 2 * (e.spread ?? 1) + vx * a - r), Math.round(y + e.y + vy * a - r), 0.85]);
        }
      }
    }
    if (art.launch) {
      const L = art.launch;
      const t = time + 6 + (L.offset ?? 0);
      const pose = rocketPose(t, L.period);
      const padX = x + L.x;
      const padY = y + L.y;
      if (L.period > 0 && pose.phase !== 'pad') {
        const rand = rng(7);
        const sim: { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; drag: number }[] = [];
        const t0 = Math.floor(t / L.period) * L.period + igniteAt(L.period);
        let trail = 0;
        for (let tt = t0; tt < t; tt += 1 / 30) {
          for (const p of sim) {
            p.life += 1 / 30;
            p.vy *= 1 - (1 / 30) * 0.35;
            p.vx *= Math.max(0, 1 - (1 / 30) * p.drag);
            p.x += p.vx / 30;
            p.y += p.vy / 30;
          }
          trail -= 1 / 30;
          if (trail > 0) continue;
          trail = 0.045;
          const ps = rocketPose(tt, L.period);
          if (ps.phase === 'gone') continue;
          if (ps.phase === 'ignite' || ps.dy > -40) {
            for (const side of [-1, 1]) sim.push({ x: padX + side * 22, y: padY + 6, vx: side * (18 + rand() * 30), vy: -1 - rand() * 8, life: 0, max: 5 + rand() * 2.5, size: 5 + Math.floor(rand() * 2), drag: 0.65 });
          }
          if (ps.phase === 'flight') sim.push({ x: padX + (rand() - 0.5) * 3, y: padY + ps.dy + 14, vx: (rand() - 0.5) * 5, vy: -1 + rand() * 3, life: 0, max: 4 + rand() * 2.5, size: 3 + Math.floor(rand() * 3), drag: 0.4 });
        }
        for (const p of sim) {
          if (p.life > p.max) continue;
          const k = p.life / p.max;
          const r = Math.min(p.size, 2 + Math.floor(k * p.size * 1.6));
          puffs.push([puffArt(r, 'exhaust'), Math.round(p.x - r), Math.round(p.y - r), 0.9 * (1 - k * k)]);
        }
      }
      const lit = pose.phase === 'ignite' ? pose.burn : pose.phase === 'flight' ? Math.max(0, 1 + (pose.dy + 30) / 160) : 0;
      if (opts.night && lit > 0.02) {
        const fl = launchFlash();
        flashes.push([fl, padX - Math.floor(fl.w / 2), padY - Math.floor(fl.h * 0.62), lit * 0.8]);
      }
      if (pose.phase !== 'gone') {
        const fw = L.frames[0].w;
        const rx = padX - Math.floor(fw / 2);
        const ry = padY - L.body + pose.dy;
        fr.draw(L.frames[pose.frame], rx, ry, tint);
        glowJobs.push([L.glow[pose.frame], rx, ry]);
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
  if (opts.night) {
    for (const [g, x, y] of glowJobs) fr.draw(g, x, y);
    for (const [g, x, y] of glowJobs) fr.add(bloomOf(g), x, y, 0.55);
    for (const [pc, x, y, a] of flashes) fr.add(pc, x, y, a);
  }
  return fr;
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

// ── worlds ─────────────────────────────────────────────────────────────────────────────────
/** The preview world with the Moon at `moon`; `building` false drops the next stage's contract. */
function moonWorld(moon: number, building = true): GameState {
  const s = act4PreviewState({ moon });
  if (!building) s.charter!.projects = s.charter!.projects.filter((p) => !(['moonbase', 'moonmine', 'massdriver'].includes(p.kind) && p.status === 'building'));
  return s;
}

let pv = 0;
function addProject(s: GameState, kind: ContractKind, where: string, size: ContractSize, progress = 1, opt?: string, builder?: string): Project {
  const def = CONTRACT_KINDS[kind];
  const days = def.days[size - 1];
  const p: Project = {
    id: `t4-${pv++}`, kind, size, where, region: 'eam', builder: builder ?? def.bidders[0] ?? 'halcyon', value: 1e9, price: 1e8, paid: 1e8, arrears: 0,
    startDay: s.day - days, days, promised: days, progress: progress * days, status: progress >= 1 ? 'done' : 'building', troubles: 0,
    gw: kind === 'ffleet' ? def.sizes[size - 1] * 0.85 : def.cat === 'energy' ? def.sizes[size - 1] : undefined, opt,
  };
  if (p.status === 'done') p.doneDay = s.day - 30;
  s.charter!.projects.push(p);
  return p;
}

/** The preview world plus a D-He3 fleet (the one design the preview world doesn't build). */
function dhe3World(): GameState {
  const s = act4PreviewState();
  addProject(s, 'ffleet', 'mega-patagonia', 2, 1, 'dhe3', 'sunforge');
  addProject(s, 'ffleet', 'mega-patagonia', 1, 0.75, 'dhe3', 'sunforge');
  return s;
}

const write = (name: string, png: Buffer) => fs.writeFileSync(path.join(dir!, name), png);

describe.skipIf(!dir)('act IV diorama previews (Orbital Dawn)', () => {
  it('the Moon base at every stage, day and lunar night', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(3 as Era);
    for (const st of [0, 1, 2, 3]) {
      for (const building of st < 3 ? [false, true] : [false]) {
        const s = moonWorld(st, building);
        const tag = `a4-moon-s${st}${building ? '-build' : ''}`;
        write(`${tag}.png`, compose(s, MOON_SITE.id, { night: false }).png(2));
        write(`${tag}-night.png`, compose(s, MOON_SITE.id, { night: true }).png(2));
        write(`${tag}-view.png`, compose(s, MOON_SITE.id, { night: false, cam: 0 }).png(3));
      }
    }
    const s3 = moonWorld(3, false);
    const w = campusLayout(s3, MOON_SITE.id, 320).width;
    for (const [k, cam] of [[1, Math.round(w * 0.3)], [2, Math.round(w * 0.55)], [3, w]] as [number, number][]) {
      write(`a4-moon-s3-view${k}.png`, compose(s3, MOON_SITE.id, { night: false, cam }).png(3));
      write(`a4-moon-s3-view${k}-night.png`, compose(s3, MOON_SITE.id, { night: true, cam }).png(3));
    }
    // every piece up close
    for (const it of campusLayout(s3, MOON_SITE.id, 320).items) write(`a4-moon-at-${it.piece!.kind}-${it.piece!.variant ?? 'x'}.png`, compose(s3, MOON_SITE.id, { night: false, cam: it.x - 20 }).png(3));
    for (const m of [0, 1, 2]) {
      const sb = moonWorld(m);
      const it = campusLayout(sb, MOON_SITE.id, 320).items.find((x) => x.piece?.kind === 'moonBuild')!;
      write(`a4-moon-build-${it.piece!.variant}.png`, compose(sb, MOON_SITE.id, { night: false, cam: it.x - 20 }).png(3));
    }
    // a lunar-night close-up and the Earth, big
    write(`a4-moon-s3-hab-night.png`, compose(s3, MOON_SITE.id, { night: true, cam: 200 }).png(3));
    for (const [k, lon] of [['full', 20], ['half', -70], ['new', 200]] as [string, number][]) {
      const e = earthDisc(24, { lon0: 20, lat0: 10 }, { lat: 5, lon }, worldTerrain());
      const fe = new Frame(e.w + 8, e.h + 8);
      const bg = new PixelCanvas(fe.w, fe.h);
      bg.rect(0, 0, fe.w, fe.h, C.ink0);
      fe.draw(bg, 0, 0);
      fe.draw(e, 4, 4);
      write(`a4-earth-${k}.png`, fe.png(4));
      const small = earthDisc(8, { lon0: 20, lat0: 10 }, { lat: 5, lon }, worldTerrain());
      const fs2 = new Frame(small.w + 4, small.h + 4);
      fs2.draw(bg, 0, 0);
      fs2.draw(small, 2, 2);
      write(`a4-earth-small-${k}.png`, fs2.png(8));
    }
    // the mass driver firing: in the breech, along the rail, off the ramp
    for (const t of [1, 1.9, 2.3, 2.6, 2.85, 3.1]) write(`a4-moon-driver-t${t}.png`, compose(s3, MOON_SITE.id, { night: false, cam: w, t }).png(3));
    write(`a4-moon-driver-night.png`, compose(s3, MOON_SITE.id, { night: true, cam: w, t: 2.6 }).png(3));
    write(`a4-moon-phone.png`, compose(s3, MOON_SITE.id, { night: false, cam: 300, vw: 422, vh: 195 }).png(3));
    setEra(0 as Era);
  });

  it('every megaproject with a fusion fleet, and the D-He3 design', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(3 as Era);
    const s = dhe3World();
    for (const id of ['mega-plains', 'mega-pacific', 'mega-siberia', 'mega-deccan', 'mega-gobi', 'mega-kalahari', 'mega-patagonia']) {
      write(`a4-${id}.png`, compose(s, id, { night: false }).png(1));
      write(`a4-${id}-night.png`, compose(s, id, { night: true, frame: 0 }).png(1));
      const layout = campusLayout(s, id, 320);
      const first = layout.items.find((it) => it.piece?.kind === 'fusionPlant' || it.piece?.variant?.startsWith('ffleet'));
      const cam = first ? Math.max(0, first.x - 30) : 0;
      write(`a4-view-${id}.png`, compose(s, id, { night: false, cam }).png(3));
      write(`a4-view-${id}-night.png`, compose(s, id, { night: true, cam }).png(3));
    }
    setEra(0 as Era);
  });

  it('air capture in the Sahara (online) and the Outback (building)', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(3 as Era);
    const s = act4PreviewState();
    for (const id of ['mega-sahara', 'mega-outback']) {
      write(`a4-${id}.png`, compose(s, id, { night: false }).png(1));
      const layout = campusLayout(s, id, 320);
      const it = layout.items.find((x) => x.piece?.kind === 'dacFarm' || x.piece?.variant === 'dac');
      const cam = it ? Math.max(0, it.x - 40) : 0;
      write(`a4-view-${id}-dac.png`, compose(s, id, { night: false, cam }).png(3));
      write(`a4-view-${id}-dac-night.png`, compose(s, id, { night: true, cam }).png(3));
    }
    setEra(0 as Era);
  });

  it('the launch complex as a spaceport', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(3 as Era);
    const s = act4PreviewState();
    const id = 'launch-guiana';
    write(`a4-spaceport.png`, compose(s, id, { night: false, t: 0 }).png(1));
    write(`a4-spaceport-night.png`, compose(s, id, { night: true, t: 4 }).png(1));
    for (const t of [0, 6, 12, 18]) write(`a4-view-spaceport-t${t}.png`, compose(s, id, { night: false, cam: 300, t }).png(3));
    // a spaceport still being built beside the Act III pad
    const b = act4PreviewState();
    b.charter!.projects.filter((p) => p.kind === 'spaceport').forEach((p) => ((p.status = 'building'), (p.progress = p.days * 0.6), (p.doneDay = undefined)));
    write(`a4-spaceport-building.png`, compose(b, id, { night: false }).png(1));
    setEra(0 as Era);
  });

  it('piece sheet: every Act IV piece, day and night', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(3 as Era);
    const specs: PieceSpec[] = [];
    const seen = new Set<string>();
    const worlds = [0, 1, 2, 3].flatMap((m) => [moonWorld(m), moonWorld(m, false)]);
    for (const s of [...worlds, dhe3World()]) {
      for (const site of [MOON_SITE, ...MEGA_SITES, siteDef('launch-guiana')]) {
        for (const p of act3Plan(s, site, 320).pieces) {
          const k = `${p.kind}|${p.variant ?? ''}`;
          if (seen.has(k) || ['survey', 'megaOffice', 'megaSub', 'converter', 'solarField', 'cspTower', 'storageYard', 'windField', 'windSea', 'seaSub', 'jackup', 'reactorUnit', 'pumpedHydro', 'seaSurvey', 'vab', 'tankFarm'].includes(p.kind)) continue;
          seen.add(k);
          specs.push(p);
        }
      }
    }
    for (const p of specs) {
      const a = pieceArt(p);
      const [w, h] = pieceSize(p);
      const one = new Frame(w * 2 + 6, h + 4);
      const sky = new PixelCanvas(one.w, one.h);
      const lunar = p.backdrop === 'lunar';
      sky.rect(0, 0, w + 3, one.h, lunar ? C.ink0 : C.sky4);
      sky.rect(w + 3, 0, w + 3, one.h, lunar ? C.ink0 : C.night1);
      one.draw(sky, 0, 0);
      one.draw(a.base[0], 1, 2);
      if (a.launch) one.draw(a.launch.frames[0], 1 + a.launch.x - Math.floor(a.launch.frames[0].w / 2), 2 + a.launch.y - a.launch.body);
      for (const m of a.movers ?? []) {
        const pt = pathPoint(m.path, m.phase, !!m.pingpong);
        one.draw(m.frames[0], 1 + Math.round(pt[0]) - Math.floor(m.frames[0].w / 2), 2 + Math.round(pt[1]) - m.frames[0].h);
      }
      one.draw(a.base[0], w + 5, 2, gradeAt(0.76, lunar));
      one.draw(a.glow[0], w + 5, 2);
      one.add(bloomOf(a.glow[0]), w + 5, 2, 0.55);
      write(`a4-piece-${p.kind}-${(p.variant || 'x').replace(/[:]/g, '_')}.png`, one.png(3));
    }
    // each fusion design and the DAC farm, every animation frame
    for (const d of DESIGNS) {
      const a = fusionPlant(d, 2, 'plains', builderRamp(DESIGN_BUILDER[d]));
      const [w, h] = FUSION_SIZE[d];
      const sheet = new Frame((w + 4) * a.base.length, (h + 4) * 2);
      const bg = new PixelCanvas(sheet.w, sheet.h);
      bg.rect(0, 0, sheet.w, h + 4, C.sky4);
      bg.rect(0, h + 4, sheet.w, h + 4, C.night1);
      sheet.draw(bg, 0, 0);
      a.base.forEach((pc, i) => {
        sheet.draw(pc, 2 + i * (w + 4), 2);
        sheet.draw(pc, 2 + i * (w + 4), h + 6, gradeAt(0.78, false));
        sheet.draw(a.glow[i], 2 + i * (w + 4), h + 6);
        sheet.add(bloomOf(a.glow[i]), 2 + i * (w + 4), h + 6, 0.55);
      });
      write(`a4-fusion-${d}-frames.png`, sheet.png(3));
    }
    setEra(0 as Era);
  });
});

// ── always-on checks ───────────────────────────────────────────────────────────────────────
describe('act IV diorama art', () => {
  it('every fusion design and the DAC farm draw at their size, frames and glows matching', () => {
    for (const d of DESIGNS) {
      for (const bd of ['plains', 'desert', 'coast', 'boreal'] as const) {
        const a = fusionPlant(d, 3, bd, builderRamp(DESIGN_BUILDER[d]));
        expect(a.base.length).toBeGreaterThan(1);
        expect(a.glow.length).toBe(a.base.length);
        for (const pc of [...a.base, ...a.glow]) expect([pc.w, pc.h]).toEqual(FUSION_SIZE[d]);
        expect(FUSION_SIZE[d][0]).toBeLessThanOrEqual(220);
        expect(FUSION_SIZE[d][1]).toBeLessThanOrEqual(130);
        // the plasma glows at night: every design has emissive pixels
        expect(a.glow[0].data.some((c) => c !== 0)).toBe(true);
      }
    }
    // D-He3: no steam
    expect(fusionPlant('dhe3', 1, 'plains', builderRamp('sunforge')).emitters ?? []).toHaveLength(0);
    const dac = dacFarm('desert', builderRamp('carbonfold'), 1);
    expect(dac.base.length).toBe(dac.glow.length);
    expect([0, 0.5, 1.5, 4, 12].map(dacBlocks)).toEqual([0, 1, 3, 4, 5]);
  });

  it('every Act IV piece at every Moon stage draws at its layout size', () => {
    for (const m of [0, 1, 2, 3]) {
      for (const building of [true, false]) {
        const s = moonWorld(m, building);
        for (const site of [MOON_SITE, ...MEGA_SITES, ...LAUNCH_SITES]) {
          for (const p of act3Plan(s, site, 320).pieces) {
            const a = pieceArt(p);
            const [w, h] = pieceSize(p);
            expect(a.base.length).toBeGreaterThan(0);
            expect(a.glow.length === 0 || a.glow.length === a.base.length).toBe(true);
            for (const pc of [...a.base, ...a.glow]) expect([pc.w, pc.h]).toEqual([w, h]);
            expect(h).toBeLessThan(140);
            for (const mv of a.movers ?? []) for (const [x] of mv.path) expect(x).toBeLessThanOrEqual(w);
            if (a.driver) {
              expect(a.driver.frames.length).toBe(3);
              expect(a.driver.glow.length).toBe(3);
              for (const [x, y] of a.driver.rail) {
                expect(x).toBeLessThan(w);
                expect(y).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });

  it('the Moon base grows stage by stage, in order, without overlaps', () => {
    const keys = new Set<string>();
    const widths: number[] = [];
    for (const m of [0, 1, 2, 3]) {
      const s = moonWorld(m, false);
      expect(moonView(s).stage).toBe(m);
      const l = campusLayout(s, MOON_SITE.id, 320);
      expect(l.viewOnly).toBe(true);
      expect(l.scenery).toEqual({ kind: 'moon', stage: m });
      let right = 0;
      for (const it of l.items) {
        expect(it.x).toBeGreaterThanOrEqual(right);
        expect(it.x + it.w).toBeLessThanOrEqual(l.width);
        right = it.x + it.w;
      }
      widths.push(l.width);
      keys.add(act3Key(s, MOON_SITE));
      const kinds = l.items.map((it) => it.piece!.kind);
      if (m >= 1) expect(kinds).toEqual(expect.arrayContaining(['moonHab', 'moonPad', 'rimSolar', 'iceRig']));
      if (m >= 2) expect(kinds).toEqual(expect.arrayContaining(['regolithMine', 'he3Plant', 'he3Tanks']));
      expect(kinds.includes('massDriver')).toBe(m >= 3);
      // the next stage under construction shows in the builder's colours
      const b = campusLayout(moonWorld(m, true), MOON_SITE.id, 320).items.find((it) => it.piece?.kind === 'moonBuild');
      if (m < 3) expect(b?.piece?.variant).toBe(['moonbase', 'moonmine', 'massdriver'][m]);
    }
    expect(widths[3]).toBeGreaterThan(widths[1]);
    expect(widths[2]).toBeGreaterThan(widths[1]);
    expect(keys.size).toBe(4);
  });

  it('fusion fleets and air capture join the megaproject dioramas', () => {
    const s = dhe3World();
    const plants = (id: string) => act3Plan(s, siteDef(id), 320).pieces.filter((p) => p.kind === 'fusionPlant');
    expect(plants('mega-plains').every((p) => p.variant === 'tokamak')).toBe(true);
    expect(plants('mega-plains').length).toBeGreaterThan(plants('mega-pacific').length);
    expect(plants('mega-siberia')[0]?.variant).toBe('stellarator');
    expect(plants('mega-deccan')[0]?.variant).toBe('laser');
    expect(plants('mega-patagonia')[0]?.variant).toBe('dhe3');
    // fleets still building show as construction sites of their design
    const gobi = act3Plan(s, siteDef('mega-gobi'), 320).pieces.find((p) => p.kind === 'megaBuild');
    expect(gobi?.variant).toBe('ffleet:pinch');
    expect(act3Plan(s, siteDef('mega-kalahari'), 320).pieces.some((p) => p.variant === 'ffleet:stellarator')).toBe(true);
    // air capture in the Sahara, a farm under way in the Outback
    expect(megaView(s, 'mega-sahara').dacGt).toBeGreaterThan(0);
    expect(act3Plan(s, siteDef('mega-sahara'), 320).pieces.filter((p) => p.kind === 'dacFarm').length).toBe(dacBlocks(megaView(s, 'mega-sahara').dacGt));
    expect(act3Plan(s, siteDef('mega-outback'), 320).pieces.some((p) => p.kind === 'megaBuild' && p.variant === 'dac')).toBe(true);
    // the far band shows the fleet too
    const sc = act3Plan(s, siteDef('mega-siberia'), 320).scenery;
    expect(sc.kind === 'mega' && sc.kinds).toContain('ffleet:stellarator');
  });

  it('nothing of Act IV shows in an Act III world', () => {
    for (const st of [0, 1, 2, 3] as const) {
      const s = act3Fixture(st);
      for (const site of [...MEGA_SITES, ...LAUNCH_SITES]) {
        for (const p of act3Plan(s, site, 320).pieces) {
          expect(['fusionPlant', 'dacFarm']).not.toContain(p.kind);
          expect(p.variant ?? '').not.toMatch(/^cycle:|ffleet|dac/);
          if (p.kind === 'launchPad' && p.variant !== 'building') {
            const L = pieceArt(p).launch!;
            expect(L.offset).toBeUndefined();
            expect([0, 20]).toContain(L.period);
          }
        }
      }
    }
    // the Act III launch cycle is unchanged
    expect(igniteAt(20)).toBe(8.5);
    expect(rocketPose(9, 20).phase).toBe('ignite');
  });

  it('the spaceport grows pads that launch in turn, faster with more cadence', () => {
    const s = act4PreviewState();
    const site = siteDef('launch-guiana');
    const pads = act3Plan(s, site, 320).pieces.filter((p) => p.kind === 'launchPad');
    expect(pads.length).toBe(1 + orbitView(s).pads);
    const specs = pads.map((p) => pieceArt(p).launch!);
    for (const L of specs) expect(L.period).toBeGreaterThanOrEqual(22);
    expect(new Set(specs.map((L) => L.offset ?? 0)).size).toBe(pads.length);
    // in any stretch of a period, every pad lifts off exactly once
    const P = specs[0].period;
    for (const L of specs) {
      let ignitions = 0;
      for (let t = 0; t < P; t += 0.25) if (rocketPose(t + 6 + (L.offset ?? 0), L.period).phase === 'ignite' && rocketPose(t + 5.75 + (L.offset ?? 0), L.period).phase === 'pad') ignitions++;
      expect(ignitions).toBe(1);
    }
    // a bigger spaceport launches more often
    const big = act4PreviewState();
    addProject(big, 'spaceport', 'launch-guiana', 3, 1, undefined, 'karman');
    const bigPads = act3Plan(big, site, 320).pieces.filter((p) => p.kind === 'launchPad').map((p) => pieceArt(p).launch!);
    expect(bigPads.length).toBeGreaterThan(pads.length);
    expect(bigPads[0].period / bigPads.length).toBeLessThan(P / pads.length);
  });

  it('the mass driver loads, fires down the rail and flings the capsule off the ramp', () => {
    const a = massDriver(builderRamp('karman'));
    const D = a.driver!;
    const load = driverPose(1, D);
    expect(load.phase).toBe('load');
    expect([load.x, load.y]).toEqual(D.rail[0]);
    const mid = driverPose(2.2, D);
    expect(mid.phase).toBe('accel');
    expect(mid.x).toBeGreaterThan(load.x);
    const fly = driverPose(3.1, D);
    expect(fly.phase).toBe('flight');
    expect(fly.x).toBeGreaterThan(D.rail[D.rail.length - 1][0]);
    expect(fly.y).toBeLessThan(D.rail[D.rail.length - 1][1]);
    expect(driverPose(D.period - 0.01, D).visible).toBe(false);
    expect(driverPose(D.period + 1, D)).toEqual(load);
  });

  it('the lunar sky: mostly sunlit, a stretch of night each month, the Earth turning', () => {
    let night = 0;
    let sun = 0;
    const t0 = Date.UTC(2062, 0, 1);
    for (let d = 0; d < 59; d += 0.25) {
      const date = new Date(t0 + d * 86_400_000);
      const sky = lunarSky(date, 0);
      if (sky.phase === 'night') night++;
      if (sky.sun !== null) {
        sun++;
        expect(sky.phase).not.toBe('night');
      }
      expect(Math.abs(sky.earth.lat0)).toBeLessThanOrEqual(24);
    }
    expect(night / 236).toBeGreaterThan(0.15);
    expect(night / 236).toBeLessThan(0.35);
    expect(sun).toBeGreaterThan(40);
    expect(lunarSky(new Date(t0), 0, false).phase).toBe('day');
    expect(lunarPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toBeCloseTo(0, 5);
    const e = earthDisc(8, { lon0: 0, lat0: 0 }, { lat: 0, lon: 90 });
    expect([e.w, e.h]).toEqual([21, 21]);
    expect(e.data.some((c) => c === C.sea4 || c === C.grn4 || c === C.white)).toBe(true);
  });
});

// ── the real scene, headless ───────────────────────────────────────────────────────────────
function stubCanvas() {
  return {
    width: 1,
    height: 1,
    style: {},
    getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} }),
    addEventListener() {},
    removeEventListener() {},
  };
}

let DioramaScene: typeof import('../src/render/diorama/dioramaScene').DioramaScene;

type Inner = {
  particles: { kind: string }[];
  plots: { rocket?: { sprite: { y: number; visible: boolean } }; driver?: { sprite: { x: number; visible: boolean } } }[];
  walkers: { frames: unknown[] }[];
  clouds: unknown[];
  rain: unknown[];
  weather: string;
  earth: { visible: boolean };
  stars: { alpha: number };
};
const inner = (scene: unknown) => scene as Inner;

function fakeGame(s: GameState, weather = true) {
  return {
    view: s,
    state: s,
    settings: { weather, dayNight: true, batterySaver: false, reducedMotion: false },
    dioramaTimelapse: true,
    stage: { canvas: stubCanvas() },
    setHover: () => {},
    select: () => {},
    toast: () => {},
  };
}

describe('act IV diorama scenes', () => {
  beforeAll(async () => {
    (globalThis as unknown as { document: unknown }).document = { createElement: () => stubCanvas() };
    ({ DioramaScene } = await import('../src/render/diorama/dioramaScene'));
  });

  it('runs the Moon at every stage: no weather, astronauts, the Earth up, the mass driver firing', () => {
    for (const m of [0, 1, 2, 3]) {
      const scene = new DioramaScene(fakeGame(moonWorld(m)) as never, MOON_SITE.id);
      scene.resize(320, 180);
      expect(scene.viewOnly).toBe(true);
      for (let i = 0; i < 90; i++) scene.update(1 / 30);
      const I = inner(scene);
      expect(I.weather).toBe('clear');
      expect(I.clouds.length).toBe(0);
      expect(I.rain.length).toBe(0);
      expect(I.earth.visible).toBe(true);
      expect(I.stars.alpha).toBeGreaterThan(0.5);
      expect(I.walkers.length).toBeGreaterThan(0);
      const driver = I.plots.find((p) => p.driver)?.driver;
      expect(!!driver).toBe(m >= 3);
      if (driver) {
        // a shot goes off every few seconds: the capsule moves
        const xs = new Set<number>();
        for (let i = 0; i < 30 * 6; i++) {
          scene.update(1 / 30);
          if (driver.sprite.visible) xs.add(driver.sprite.x);
        }
        expect(xs.size).toBeGreaterThan(5);
      }
      scene.scrollTo(1, true);
      for (let i = 0; i < 10; i++) scene.update(1 / 30);
      scene.autoPan = true;
      for (let i = 0; i < 10; i++) scene.update(1 / 20);
      expect(I.particles.every((p) => p.kind === 'dust' || p.kind === 'vapor')).toBe(true);
      scene.destroy();
    }
  });

  it('runs fusion megaprojects, air capture and the spaceport', () => {
    const s = dhe3World();
    for (const id of ['mega-plains', 'mega-siberia', 'mega-deccan', 'mega-gobi', 'mega-patagonia', 'mega-sahara', 'mega-outback']) {
      const scene = new DioramaScene(fakeGame(s) as never, id);
      scene.resize(320, 180);
      for (let i = 0; i < 40; i++) scene.update(1 / 30);
      scene.scrollTo(1, true);
      for (let i = 0; i < 20; i++) scene.update(1 / 30);
      scene.destroy();
    }
    const port = new DioramaScene(fakeGame(s) as never, 'launch-guiana');
    port.resize(320, 180);
    const rockets = () => inner(port).plots.filter((p) => p.rocket);
    port.update(1 / 30);
    expect(rockets().length).toBe(1 + orbitView(s).pads);
    const y0 = rockets().map((p) => p.rocket!.sprite.y);
    let launched = false;
    for (let i = 0; i < 30 * 30 && !launched; i++) {
      port.update(1 / 30);
      launched = rockets().some((p, k) => p.rocket!.sprite.y < y0[k] - 20);
    }
    expect(launched).toBe(true);
    port.destroy();
  });
});
