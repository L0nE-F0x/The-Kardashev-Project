/**
 * Act III diorama previews without a browser: the Charter HQ, every megaproject at stages 0–3, and
 * a launch site as a candidate, under construction, online and lifting off — all in Solarpunk
 * Bloom (era 2). The compositor uses the scene's own band builder (scenery.ts), so the layers match.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act3-diorama-preview.test.ts
 * Skipped unless PREVIEW_DIR is set. The always-on checks at the bottom keep the art honest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { C, paletteTable, setEra, type Era } from '../src/render/palette';
import { bayer, hash2, PixelCanvas } from '../src/render/pixels';
import { encodePngRgba } from '../tools/lib/png';
import { bands, campusLayout, itemTop, PARALLAX } from '../src/render/diorama/layout';
import { itemArt } from '../src/render/diorama/campusArt';
import { bigRotorFrames, facilityArt, maxTier, rotorFrames, type RotorSpec } from '../src/render/diorama/art';
import { BLOOM_TONE, bloomOf, puffArt } from '../src/render/diorama/draw';
import { pieceArt, pieceSize, sitePieces, type PieceSpec } from '../src/render/diorama/industry';
import { act3Key, act3Plan } from '../src/render/diorama/act3Pieces';
import { sceneBands } from '../src/render/diorama/scenery';
import { launchFlash, rocketPose } from '../src/render/diorama/launch';
import { CHARTER_HQ, LAUNCH_SITES, MEGA_SITES, SITES, siteDef } from '../src/content/sites';
import { CONTRACT_KINDS, MEGA_STAGES, megaGW } from '../src/content/charter';
import { megaView } from '../src/sim/charterView';
import { newGame } from '../src/sim/state';
import type { ContractKind, ContractSize, Facility, FacilityType, GameState, Project } from '../src/sim/types';
import { act3Fixture } from './helpers/act3fixture';

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

const NIGHT_TINT: RGB = [1 - 0.76 * 0.78, 1 - 0.73 * 0.78, 1 - 0.5 * 0.78];

const rotorCanvas = (r: RotorSpec, k: number) => (r.style === 'big' ? bigRotorFrames(r.size, r.col)[k % 16] : rotorFrames(r.size, r.col)[k % 8]);

/** A small deterministic stand-in for the scene's particles (frozen after `t` seconds). */
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

interface Opts {
  night: boolean;
  /** Viewport (default 320×180). With `cam`, render the screen as the player sees it at that scroll. */
  vw?: number;
  vh?: number;
  cam?: number;
  /** Seconds into the rocket's launch cycle (scene time + 6). */
  launchT?: number;
}

/**
 * Render a site. Without `cam` it's a panorama (every band as wide as the scene); with `cam` it's
 * one screen at that camera x, bands offset by their parallax like the scene does.
 */
function compose(s: GameState | null, siteId: string, opts: Opts): Frame {
  const vh = opts.vh ?? 180;
  const site = siteDef(siteId);
  const viewW = opts.vw ?? 320;
  const layout = campusLayout(s, siteId, viewW);
  const pano = opts.cam === undefined;
  const W = pano ? layout.width : viewW;
  const cam = pano ? 0 : Math.max(0, Math.min(layout.width - viewW, opts.cam!));
  const bandVw = pano ? layout.width : viewW;
  const b = bands(bandVw, vh, layout.width);
  const sb = sceneBands(site, layout, bandVw, vh);
  const fr = new Frame(W, vh);
  const tint: RGB = opts.night ? NIGHT_TINT : [1, 1, 1];
  const px = (k: number) => -Math.round(cam * k);
  // sky
  const sky = new PixelCanvas(W, b.groundY + 4);
  sky.vgradient(0, 0, W, sky.h, opts.night ? [C.night0, C.night1, C.night2, C.night3] : [C.sky1, C.sky2, C.sky3, C.sky4, C.sky5]);
  fr.draw(sky, 0, 0, tint);
  if (opts.night) {
    const st = new PixelCanvas(W, Math.round(sky.h * 0.7));
    for (let i = 0; i < 90 * (W / 320); i++) st.set(Math.floor(hash2(i, 1, 33) * st.w), Math.floor(hash2(i, 2, 33) * st.h), hash2(i, 3, 33) > 0.85 ? C.yel2 : C.ice2);
    fr.draw(st, 0, 0, tint);
  }
  fr.draw(sb.far, px(PARALLAX.far), b.farY, tint);
  fr.draw(sb.mid, px(PARALLAX.mid), b.midY, tint);
  for (const p of sb.midProps) fr.draw(p.frames[0], px(PARALLAX.mid) + p.x, p.y, tint);
  if (opts.night && sb.midGlow) {
    fr.draw(sb.midGlow, px(PARALLAX.mid), b.midY);
    for (const p of sb.midProps) if (p.glow) fr.draw(p.glow[0], px(PARALLAX.mid) + p.x, p.y);
  }
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
  for (const it of layout.items) {
    const ia = itemArt(it, 'FXL', day);
    if (!ia) continue;
    const art = ia.art;
    const y = itemTop(it, b.groundY);
    const x = wx + it.x;
    fr.draw(art.base[0], x, y, tint);
    if (art.glow[0]) glowJobs.push([art.glow[0], x, y]);
    for (const [ri, r] of (art.rotors ?? []).entries()) fr.draw(rotorCanvas(r, Math.floor(hash2(r.x, ri, 1) * 16)), x + r.x - r.size - 1, y + r.y - r.size - 1, tint);
    for (const m of art.movers ?? []) {
      const p = pathPoint(m.path, m.phase, !!m.pingpong);
      fr.draw(m.frames[0], x + Math.round(p[0]) - Math.floor(m.frames[0].w / 2), y + Math.round(p[1]) - m.frames[0].h, tint);
    }
    if (!ia.building) {
      for (const e of art.emitters ?? []) {
        const n = Math.round(e.rate * 6 * (e.kind === 'steam' ? 1 : 0.8));
        const life = e.kind === 'steam' ? 4.2 : e.kind === 'smoke' ? 3.5 : e.kind === 'mist' ? 0.9 : 2.2;
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * life;
          const k = a / life;
          const vx = e.kind === 'mist' ? (hash2(i, 3, e.x) - 0.5) * 10 : 3 + hash2(i, 1, e.x) * 4;
          const vy = e.kind === 'mist' ? -4 - hash2(i, 4, e.x) * 6 : -6 - hash2(i, 2, e.x) * 4;
          const r = e.kind === 'mist' ? 1 : Math.min(e.size ?? (e.kind === 'steam' ? 4 : 3), 1 + Math.floor(k * (e.kind === 'steam' ? 5 : 3)));
          if (e.kind !== 'mist' && k > 0.75 && hash2(i, 9, e.y) < (k - 0.75) * 4) continue;
          puffs.push([puffArt(r, e.kind), Math.round(x + e.x + (hash2(i, 5, e.y) - 0.5) * 2 * (e.spread ?? 1) + vx * a - r), Math.round(y + e.y + vy * a - r), 0.85]);
        }
      }
    }
    if (art.launch) {
      const L = art.launch;
      const t = opts.launchT ?? 0;
      const pose = rocketPose(t, L.period);
      const padX = x + L.x;
      const padY = y + L.y;
      // replay the scene's exhaust rules for the time since ignition
      if (L.period > 0 && pose.phase !== 'pad') {
        const rand = rng(7);
        const sim: { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; drag: number }[] = [];
        const t0 = Math.floor(t / L.period) * L.period + 8.5;
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
          if (ps.phase === 'flight') {
            const ry = padY - L.body + ps.dy + L.body + 14;
            sim.push({ x: padX + (rand() - 0.5) * 3, y: ry, vx: (rand() - 0.5) * 5, vy: -1 + rand() * 3, life: 0, max: 4 + rand() * 2.5, size: 3 + Math.floor(rand() * 3), drag: 0.4 });
          }
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
  }
  for (const [pc, x, y, a] of puffs) fr.draw(pc, x, y, tint, a);
  const lamp = PixelCanvas.from(`aa.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\naaa`, { a: 'ink6' });
  for (const x of sb.lamps) fr.draw(lamp, wx + x, b.groundY + 4, tint);
  fr.draw(sb.fgFrames?.[0] ?? sb.fg, wx, vh - b.fgH + 2, tint);
  if (opts.night) {
    for (const [g, x, y] of glowJobs) fr.draw(g, x, y);
    for (const [g, x, y] of glowJobs) fr.add(bloomOf(g), x, y, 0.55);
    const halo = new PixelCanvas(15, 15);
    for (let yy = 0; yy < 15; yy++) {
      for (let xx = 0; xx < 15; xx++) {
        const d = Math.hypot(xx - 7, yy - 7) / 7;
        if (d > 1) continue;
        if (d < 0.25) halo.set(xx, yy, C.yel1);
        else if (((yy & 3) * 4 + (xx & 3)) % 16 < (1 - d) * 12) halo.set(xx, yy, d < 0.6 ? C.org2 : C.snd5);
      }
    }
    for (const x of sb.lamps) fr.add(halo, wx + x - 7, b.groundY - 3, 1);
    for (const [pc, x, y, a] of flashes) fr.add(pc, x, y, a);
  }
  return fr;
}

function pathPoint(path: [number, number][], t: number, pingpong: boolean): [number, number] {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    segs.push(d);
    total += d;
  }
  let u = ((t % 1) + 1) % 1;
  if (pingpong) u = u < 0.5 ? u * 2 : 2 - u * 2;
  let d = u * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k];
    }
    d -= segs[i];
  }
  return path[0];
}

/** A couple of existing build-site campuses, to check them in Solarpunk Bloom. */
function buildWorld(): GameState {
  const s = newGame({ name: 'Little Sun Labs', homeSite: 'west-texas', seed: 7 });
  s.day = 1400;
  let id = 1;
  const fac = (siteId: string, type: FacilityType, tier = 1, extra: Partial<Facility> = {}) =>
    s.facilities.push({ id: `b${id++}`, type, siteId, status: 'online', progress: 1, buildDays: 1, startedDay: 0, onlineDay: 0, tier, ...extra });
  s.sites['west-texas'].grid.mw = 50;
  s.sites['west-texas'].extraSlots = 3;
  for (const [t, tier] of [['datacenter', 2], ['solar', 3], ['wind', 3], ['battery', 2], ['lab', 3], ['datacenter', 3]] as [FacilityType, number][]) fac('west-texas', t, tier);
  s.sites['columbia-gorge'].grid.mw = 50;
  fac('columbia-gorge', 'hydro', 2);
  fac('columbia-gorge', 'datacenter', 2);
  fac('columbia-gorge', 'geothermal', 3);
  return s;
}

/**
 * A world where every megaproject sits exactly at `stage` (the shared fixture's stages are by
 * contract size, so firm-power sites lag behind): secondary kinds first, then the main kind until
 * the GW threshold is crossed, plus a contract under construction below stage 3.
 */
function megaWorld(stage: 0 | 1 | 2 | 3): GameState {
  const s = act3Fixture(0);
  if (stage === 0) return s;
  const c = s.charter!;
  const builders = ['halcyon', 'brightwater', 'littlesun', 'tidewater', 'deepvein', 'saltflat', 'you'];
  let n = 0;
  const add = (kind: ContractKind, where: string, region: Project['region'], size: ContractSize, status: 'done' | 'building', progress = 1) => {
    const def = CONTRACT_KINDS[kind];
    const days = def.days[size - 1];
    c.projects.push({
      id: `mw${++n}`, kind, size, where, region, builder: builders[n % builders.length], value: 1e10, price: 2e9, paid: 0, arrears: 0, startDay: 3000, days, promised: days,
      progress: status === 'done' ? days : Math.round(days * progress), status, troubles: 0, gw: def.sizes[size - 1],
    });
  };
  for (const m of MEGA_SITES) {
    c.projects = c.projects.filter((p) => p.where !== m.id);
    const kinds = m.mega ?? ['solar'];
    if (stage >= 2) kinds.slice(1).forEach((k) => add(k, m.id, m.region, 2, 'done'));
    while (megaGW(s, m.id) < MEGA_STAGES[stage - 1]) add(kinds[0], m.id, m.region, stage as ContractSize, 'done');
    if (stage < 3) add(kinds[Math.min(kinds.length - 1, 1)], m.id, m.region, 2, 'building', stage === 1 ? 0.3 : 0.7);
  }
  return s;
}

/** The original full-scan bloom, to check the fast splatting one against. */
function bloomOfReference(glow: PixelCanvas): PixelCanvas {
  const out = new PixelCanvas(glow.w, glow.h);
  const { w, h } = glow;
  const src = glow.data;
  const tone = (c: number): number => BLOOM_TONE.get(c) ?? C.ink4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      let best = 0;
      let bc = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const c = src[yy * w + xx];
          if (!c) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          const s = d <= 1 ? 3 : d === 2 ? 2 : 1;
          if (s > best) {
            best = s;
            bc = c;
          }
        }
      }
      if (!best) continue;
      const level = best === 3 ? 13 : best === 2 ? 7 : 2;
      if (bayer(x, y) < level) out.set(x, y, tone(bc));
    }
  }
  return out;
}

const write = (name: string, png: Buffer) => fs.writeFileSync(path.join(dir!, name), png);

describe.skipIf(!dir)('act III diorama previews (Solarpunk Bloom)', () => {
  it('the Charter HQ, day and night', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(2 as Era);
    const s = act3Fixture(2);
    for (const night of [false, true]) write(`a3-charter-hq-${night ? 'night' : 'day'}.png`, compose(s, CHARTER_HQ, { night }).png(2));
    const w = campusLayout(s, CHARTER_HQ, 320).width;
    // a phone in landscape (422×195) and a tall desktop window (320×200)
    write(`a3-view-charter-phone.png`, compose(s, CHARTER_HQ, { night: false, cam: 9999, vw: 422, vh: 195 }).png(3));
    write(`a3-view-charter-tall.png`, compose(s, CHARTER_HQ, { night: true, cam: 0, vw: 320, vh: 200 }).png(3));
    for (const [k, cam] of [[0, 0], [1, Math.round((w - 320) / 2)], [2, w]] as [number, number][]) {
      write(`a3-view-charter-${k}-day.png`, compose(s, CHARTER_HQ, { night: false, cam }).png(3));
      write(`a3-view-charter-${k}-night.png`, compose(s, CHARTER_HQ, { night: true, cam }).png(3));
    }
    setEra(0 as Era);
  });

  it('every megaproject at stages 0–3', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(2 as Era);
    const worlds = ([0, 1, 2, 3] as const).map((st) => megaWorld(st));
    for (const site of MEGA_SITES) {
      worlds.forEach((s, st) => write(`a3-${site.id}-s${st}.png`, compose(s, site.id, { night: false }).png(1)));
      write(`a3-${site.id}-s3-night.png`, compose(worlds[3], site.id, { night: true }).png(1));
      write(`a3-view-${site.id}-s3.png`, compose(worlds[3], site.id, { night: false, cam: 0 }).png(3));
      const w3 = campusLayout(worlds[3], site.id, 320).width;
      write(`a3-view-${site.id}-s3-mid.png`, compose(worlds[3], site.id, { night: false, cam: Math.round(w3 * 0.42) }).png(3));
      write(`a3-view-${site.id}-s3-end.png`, compose(worlds[3], site.id, { night: true, cam: w3 }).png(3));
      if (site.id === 'mega-northsea' || site.id === 'mega-nordic') write(`a3-view-${site.id}-phone.png`, compose(worlds[2], site.id, { night: false, cam: 200, vw: 422, vh: 195 }).png(3));
    }
    setEra(0 as Era);
  });

  it('a launch site: candidate, building, online, liftoff', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(2 as Era);
    const id = LAUNCH_SITES[0].id;
    const cand = act3Fixture(0);
    write(`a3-launch-candidate.png`, compose(cand, id, { night: false }).png(2));
    write(`a3-launch-other-candidate.png`, compose(act3Fixture(2), LAUNCH_SITES[3].id, { night: false }).png(2));
    write(`a3-launch-building.png`, compose(act3Fixture(1), id, { night: false }).png(2));
    const on = act3Fixture(2);
    write(`a3-launch-online-day.png`, compose(on, id, { night: false }).png(2));
    write(`a3-launch-online-night.png`, compose(on, id, { night: true }).png(2));
    const lift = act3Fixture(3);
    for (const t of [4, 9, 10.6, 11.8, 13.2, 16]) {
      write(`a3-launch-liftoff-t${t}.png`, compose(lift, id, { night: false, cam: 40, launchT: t }).png(3));
    }
    write(`a3-launch-liftoff-night.png`, compose(lift, id, { night: true, cam: 40, launchT: 11.4 }).png(3));
    setEra(0 as Era);
  });

  it('piece sheet (every Act III piece, base and night glow)', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(2 as Era);
    const seen = new Map<string, PieceSpec>();
    for (const s of [null, ...([0, 1, 2, 3] as const).map((st) => act3Fixture(st))]) {
      for (const site of [siteDef(CHARTER_HQ), ...MEGA_SITES, ...LAUNCH_SITES]) {
        for (const p of act3Plan(s, site, 320).pieces) {
          const k = `${p.kind}|${p.variant ?? ''}|${p.backdrop ?? ''}`;
          if (!seen.has(k)) seen.set(k, p);
        }
      }
    }
    const specs = [...seen.values()];
    // pack into rows no wider than 1100 px
    const rows: PieceSpec[][] = [[]];
    let rw = 0;
    for (const p of specs) {
      const w = pieceSize(p)[0] * 2 + 18;
      if (rw + w > 1100 && rows[rows.length - 1].length) {
        rows.push([]);
        rw = 0;
      }
      rows[rows.length - 1].push(p);
      rw += w;
    }
    const rowH = rows.map((r) => Math.max(...r.map((p) => pieceSize(p)[1])) + 8);
    const W = 1100;
    const H = rowH.reduce((a, b) => a + b, 8);
    const sheet = new Frame(W, H);
    const bg = new PixelCanvas(W, H);
    bg.rect(0, 0, W, H, C.sky4);
    sheet.draw(bg, 0, 0);
    let y = 4;
    rows.forEach((r, ri) => {
      let x = 4;
      for (const p of r) {
        const a = pieceArt(p);
        const [w, h] = pieceSize(p);
        const yy = y + rowH[ri] - 8 - h;
        sheet.draw(a.base[0], x, yy);
        for (const rt of a.rotors ?? []) sheet.draw(rotorCanvas(rt, 3), x + rt.x - rt.size - 1, yy + rt.y - rt.size - 1);
        if (a.launch) sheet.draw(a.launch.frames[0], x + a.launch.x - Math.floor(a.launch.frames[0].w / 2), yy + a.launch.y - a.launch.body);
        const dark = new PixelCanvas(w, h);
        dark.rect(0, 0, w, h, C.night1);
        sheet.draw(dark, x + w + 6, yy);
        sheet.draw(a.base[0], x + w + 6, yy, NIGHT_TINT);
        sheet.draw(a.glow[0], x + w + 6, yy);
        sheet.add(bloomOf(a.glow[0]), x + w + 6, yy, 0.55);
        x += w * 2 + 18;
      }
      y += rowH[ri];
    });
    write('a3-piece-sheet.png', sheet.png(2));
    // and each piece on its own, day beside night, at 3×
    for (const p of specs) {
      const a = pieceArt(p);
      const [w, h] = pieceSize(p);
      const one = new Frame(w * 2 + 6, h + 4);
      const sky = new PixelCanvas(one.w, one.h);
      sky.rect(0, 0, w + 3, one.h, C.sky4);
      sky.rect(w + 3, 0, w + 3, one.h, C.night1);
      one.draw(sky, 0, 0);
      one.draw(a.base[0], 1, 2);
      for (const rt of a.rotors ?? []) one.draw(rotorCanvas(rt, 3), 1 + rt.x - rt.size - 1, 2 + rt.y - rt.size - 1);
      if (a.launch) one.draw(a.launch.frames[0], 1 + a.launch.x - Math.floor(a.launch.frames[0].w / 2), 2 + a.launch.y - a.launch.body);
      one.draw(a.base[0], w + 5, 2, NIGHT_TINT);
      one.draw(a.glow[0], w + 5, 2);
      one.add(bloomOf(a.glow[0]), w + 5, 2, 0.55);
      write(`a3-piece-${p.kind}-${p.variant || 'x'}-${p.backdrop ?? 'x'}.png`, one.png(3));
    }
    setEra(0 as Era);
  });

  it('existing campuses in Solarpunk Bloom', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(2 as Era);
    const s = buildWorld();
    for (const id of ['west-texas', 'columbia-gorge']) {
      write(`a3-era2-${id}-day.png`, compose(s, id, { night: false }).png(2));
      write(`a3-era2-${id}-night.png`, compose(s, id, { night: true }).png(2));
    }
    setEra(0 as Era);
  });
});

// ── always-on checks ───────────────────────────────────────────────────────────────────────
describe('act III diorama art', () => {
  const states = ([0, 1, 2, 3] as const).map((st) => act3Fixture(st));
  const sites = [siteDef(CHARTER_HQ), ...MEGA_SITES, ...LAUNCH_SITES];

  it('every piece draws at its layout size with matching frame and glow counts', () => {
    for (const s of [null, ...states]) {
      for (const site of sites) {
        for (const p of act3Plan(s, site, 320).pieces) {
          const a = pieceArt(p);
          const [w, h] = pieceSize(p);
          expect(a.base.length).toBeGreaterThan(0);
          expect(a.glow.length === 0 || a.glow.length === a.base.length).toBe(true);
          for (const pc of [...a.base, ...a.glow]) expect([pc.w, pc.h]).toEqual([w, h]);
          for (const r of a.rotors ?? []) {
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x).toBeLessThan(w);
          }
          if (a.launch) {
            const L = a.launch;
            expect(L.frames.length).toBe(4);
            expect(L.glow.length).toBe(4);
            for (const pc of [...L.frames, ...L.glow]) expect([pc.w, pc.h]).toEqual([L.frames[0].w, L.frames[0].h]);
            expect(L.body).toBeLessThan(L.frames[0].h);
          }
        }
      }
    }
  });

  it('lays out every Act III site inside its scene, in order, without overlaps', () => {
    for (const s of [null, ...states]) {
      for (const site of sites) {
        const l = campusLayout(s, site.id, 320);
        expect(l.viewOnly).toBe(true);
        expect(l.scenery).toBeDefined();
        let right = 0;
        for (const it of l.items) {
          expect(it.x).toBeGreaterThanOrEqual(right);
          expect(it.x + it.w).toBeLessThanOrEqual(l.width);
          expect(itemArt(it, 'ABC', s?.day ?? 0)).not.toBeNull();
          right = it.x + it.w;
        }
      }
    }
    // the HQ's lake starts at the jetty; the North Sea is offshore
    expect(campusLayout(states[2], CHARTER_HQ, 320).lakeFrom).toBeGreaterThan(300);
    expect(campusLayout(states[3], 'mega-northsea', 320).offshore).toBe(true);
  });

  it('megaprojects grow with their stage and rebuild when the view changes', () => {
    const worlds = ([0, 1, 2, 3] as const).map((st) => megaWorld(st));
    for (const site of MEGA_SITES) {
      worlds.forEach((s, st) => expect(megaView(s, site.id).stage).toBe(st));
      const widths = worlds.map((s) => campusLayout(s, site.id, 320).width);
      expect(widths[3]).toBeGreaterThan(widths[1]);
      expect(widths[2]).toBeGreaterThan(widths[1]);
      expect(widths[3]).toBeGreaterThan(1800);
      const keys = new Set(worlds.map((s) => act3Key(s, site)));
      expect(keys.size).toBe(4);
    }
    // the launch site's look follows the contract: candidate → building → online → liftoff
    const launch = LAUNCH_SITES[0];
    expect(new Set(states.map((s) => act3Key(s, launch))).size).toBe(4);
  });

  it('the fast bloom matches the full scan pixel for pixel', () => {
    const glows: PixelCanvas[] = [];
    for (const type of ['datacenter', 'solar', 'wind', 'battery', 'gas', 'lab', 'hq', 'hydro', 'geothermal', 'restart', 'smr', 'reactor', 'packaging', 'fab', 'campus'] as FacilityType[]) {
      for (let t = 1; t <= maxTier(type); t++) glows.push(...facilityArt(type, 'ABC', t).glow);
    }
    for (const site of SITES.filter((x) => x.kind !== 'build')) for (const p of sitePieces(site, states[3])) glows.push(...pieceArt(p).glow);
    const rnd = new PixelCanvas(97, 61);
    for (let i = 0; i < 400; i++) rnd.set(Math.floor(hash2(i, 1, 5) * 97), Math.floor(hash2(i, 2, 5) * 61), [C.yel1, C.red3, C.cyn5, C.white, C.grn6][i % 5]);
    glows.push(rnd);
    for (const g of glows) expect(Buffer.from(bloomOf(g).data).equals(Buffer.from(bloomOfReference(g).data))).toBe(true);
  });

  it('the launch cycle stands, ignites, climbs and clears the screen', () => {
    expect(rocketPose(3, 20).phase).toBe('pad');
    expect(rocketPose(9, 20).phase).toBe('ignite');
    const a = rocketPose(11, 20);
    const b = rocketPose(13, 20);
    expect(a.phase).toBe('flight');
    expect(b.dy).toBeLessThan(a.dy);
    expect(rocketPose(19.5, 20).phase).toBe('gone');
    expect(rocketPose(5, 0)).toEqual({ dy: 0, frame: 0, phase: 'pad', burn: 0 });
  });
});
