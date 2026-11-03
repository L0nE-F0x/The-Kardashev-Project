/**
 * Campus diorama previews without a browser: lays sites out exactly like the scene and composites
 * the same layers (sky, parallax bands, distant skyline, plots, effects, night tint, glow, bloom).
 *   PREVIEW_DIR=/some/dir npx vitest run tests/diorama-preview.test.ts
 * Skipped unless PREVIEW_DIR is set. The always-on checks at the bottom keep every art function
 * honest (sizes match, frames line up) in plain `npm test` runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { C, paletteTable, setEra, type Era } from '../src/render/palette';
import { hash2, PixelCanvas } from '../src/render/pixels';
import { encodePngRgba } from '../tools/lib/png';
import { bands, campusLayout, itemTop, PARALLAX, type CampusLayout } from '../src/render/diorama/layout';
import { itemArt } from '../src/render/diorama/campusArt';
import { backlot, facilityArt, facilitySize, farRidge, foreground, groundStrip, maxTier, midBand, rotorFrames, surfFrames } from '../src/render/diorama/art';
import { bloomOf, puffArt } from '../src/render/diorama/draw';
import { pieceArt, pieceSize, rivalArt, rivalSize, sitePieces } from '../src/render/diorama/industry';
import { newGame } from '../src/sim/state';
import { SITES, siteDef } from '../src/content/sites';
import type { Facility, FacilityType, GameState, RivalBuild } from '../src/sim/types';

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
  /** Normal blend of an indexed canvas, multiplied by a tint (the scene tints layers for night). */
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
  png(scale: number, crop?: { x: number; w: number }) {
    const x0 = crop?.x ?? 0;
    const cw = crop?.w ?? this.w;
    const W = cw * scale;
    const H = this.h * scale;
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (Math.floor(y / scale) * this.w + x0 + Math.floor(x / scale)) * 3;
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

/** Render a whole site as a panorama (camera at 0, every band as wide as the scene). */
function compose(s: GameState, siteId: string, opts: { night: boolean; vw?: number; vh?: number; t?: number }): { frame: Frame; layout: CampusLayout } {
  const vw = opts.vw ?? 320;
  const vh = opts.vh ?? 180;
  const site = siteDef(siteId);
  const layout = campusLayout(s, siteId, vw);
  const W = layout.width;
  const b = bands(W, vh, W);
  const fr = new Frame(W, vh);
  const tint: RGB = opts.night ? NIGHT_TINT : [1, 1, 1];
  const t = opts.t ?? 6;
  // sky
  const sky = new PixelCanvas(W, b.groundY + 4);
  sky.vgradient(0, 0, W, sky.h, opts.night ? [C.night0, C.night1, C.night2, C.night3] : [C.sky1, C.sky2, C.sky3, C.sky4, C.sky5]);
  fr.draw(sky, 0, 0, tint);
  if (opts.night) {
    const st = new PixelCanvas(W, Math.round(sky.h * 0.7));
    for (let i = 0; i < 90 * (W / 320); i++) st.set(Math.floor(hash2(i, 1, 33) * st.w), Math.floor(hash2(i, 2, 33) * st.h), hash2(i, 3, 33) > 0.85 ? C.yel2 : C.ice2);
    fr.draw(st, 0, 0, tint);
  }
  const seed = Math.floor(hash2(site.lat * 10, site.lon * 10, 3) * 1000);
  fr.draw(farRidge(site.backdrop, W, b.farH, seed), 0, b.farY, tint);
  fr.draw(midBand(site.backdrop, W, b.midH, seed, layout.beachFrom !== undefined ? layout.beachFrom + 10 : undefined), 0, b.midY, tint);
  if (layout.skyline > 0) {
    const bl = backlot(W, b.backH, seed, layout.skyline);
    fr.draw(bl.base, 0, b.backY, tint);
    if (opts.night) {
      fr.draw(bl.glow, 0, b.backY);
      fr.add(bloomOf(bl.glow), 0, b.backY, 0.5);
    }
  }
  fr.draw(groundStrip(site.backdrop, W, b.groundH, { beachFrom: layout.beachFrom, cableX: layout.cableX }), 0, b.groundY, tint);
  if (layout.beachFrom !== undefined) {
    const surf = surfFrames(W - layout.beachFrom)[0];
    fr.draw(surf, layout.beachFrom + 30, b.groundY + 3, tint);
  }
  const gy = b.groundY + 1;
  const glowJobs: [PixelCanvas, number, number][] = [];
  const puffs: [PixelCanvas, number, number][] = [];
  if (layout.propertyLine !== undefined) {
    const pl = new PixelCanvas(3, 14);
    pl.vline(1, 0, 14, C.ink6);
    pl.set(0, 0, C.ink7);
    pl.set(2, 0, C.ink7);
    fr.draw(pl, layout.propertyLine, gy - 14, tint);
  }
  for (const it of layout.items) {
    const ia = itemArt(it, 'LSL', s.day);
    if (!ia) continue;
    const art = ia.art;
    const y = itemTop(it, b.groundY);
    const fi = 0;
    fr.draw(art.base[fi], it.x, y, tint);
    if (art.glow[fi]) glowJobs.push([art.glow[fi], it.x, y]);
    for (const r of art.rotors ?? []) {
      const rf = rotorFrames(r.size, r.col)[Math.floor(hash2(r.x, 1, 1) * 8)];
      fr.draw(rf, it.x + r.x - r.size - 1, y + r.y - r.size - 1, tint);
    }
    for (const m of art.movers ?? []) {
      const p = pathPoint(m.path, m.phase, !!m.pingpong);
      fr.draw(m.frames[0], it.x + Math.round(p[0]) - Math.floor(m.frames[0].w / 2), y + Math.round(p[1]) - m.frames[0].h, tint);
    }
    if (!ia.building) {
      for (const e of art.emitters ?? []) {
        // a frozen plume: what the particle system looks like after a few seconds
        const n = Math.round(e.rate * t * (e.kind === 'steam' ? 1 : 0.8));
        const life = e.kind === 'steam' ? 4.2 : e.kind === 'smoke' ? 3.5 : e.kind === 'mist' ? 0.9 : 2.2;
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * life;
          const k = a / life;
          const vx = e.kind === 'mist' ? (hash2(i, 3, e.x) - 0.5) * 10 : 3 + hash2(i, 1, e.x) * 4;
          const vy = e.kind === 'mist' ? -4 - hash2(i, 4, e.x) * 6 : -6 - hash2(i, 2, e.x) * 4;
          const r = e.kind === 'mist' ? 1 : Math.min(e.kind === 'steam' ? 4 : 3, 1 + Math.floor(k * (e.kind === 'steam' ? 5 : 3)));
          if (e.kind !== 'mist' && k > 0.75 && hash2(i, 9, e.y) < (k - 0.75) * 4) continue;
          const px = it.x + e.x + (hash2(i, 5, e.y) - 0.5) * 2 * (e.spread ?? 1) + vx * a;
          const py = y + e.y + vy * a;
          puffs.push([puffArt(r, e.kind), Math.round(px - r), Math.round(py - r)]);
        }
      }
    }
  }
  for (const [pc, x, y] of puffs) fr.draw(pc, x, y, tint, 0.85);
  // street lamps along the road
  const lamp = PixelCanvas.from(`aa.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\n.a.\naaa`, { a: 'ink6' });
  for (let x = 40; x < W; x += 90) fr.draw(lamp, x, b.groundY + 4, tint);
  fr.draw(foreground(site.backdrop, W, b.fgH), 0, vh - b.fgH + 2, tint);
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
    for (let x = 40; x < W; x += 90) fr.add(halo, x - 7, b.groundY - 3, 1);
  }
  return { frame: fr, layout };
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

// ── fixtures ───────────────────────────────────────────────────────────────────────────────
let fid = 1000;
function fac(s: GameState, siteId: string, type: FacilityType, tier = 1, extra: Partial<Facility> = {}) {
  s.facilities.push({ id: `p${fid++}`, type, siteId, status: 'online', progress: 1, buildDays: 1, startedDay: 0, onlineDay: 0, tier, ...extra });
}
function rival(s: GameState, siteId: string, owner: string, slots: number, status: RivalBuild['status'] = 'online') {
  s.rivalBuilds ??= [];
  s.rivalBuilds.push({ id: `r${fid++}`, owner, siteId, slots, itMW: slots * 100, status, startDay: s.day - 200, readyDay: s.day + 200 });
}

function world(): GameState {
  const s = newGame({ name: 'Little Sun Labs', homeSite: 'west-texas', seed: 7 });
  s.day = 1400;
  s.rivalBuilds ??= [];
  const grid = (id: string) => (s.sites[id].grid.mw = 50);
  // tier mix (home)
  s.sites['west-texas'].extraSlots = 3;
  grid('west-texas');
  fac(s, 'west-texas', 'datacenter', 1);
  fac(s, 'west-texas', 'datacenter', 2);
  fac(s, 'west-texas', 'datacenter', 3);
  fac(s, 'west-texas', 'solar', 3);
  fac(s, 'west-texas', 'wind', 3);
  fac(s, 'west-texas', 'battery', 2);
  fac(s, 'west-texas', 'gas', 2);
  fac(s, 'west-texas', 'lab', 3);
  // upgrades + construction
  grid('iberia');
  fac(s, 'iberia', 'datacenter', 2, { upgrade: { to: 3, progress: 300, buildDays: 540 } });
  fac(s, 'iberia', 'solar', 2, { upgrade: { to: 3, progress: 100, buildDays: 400 } });
  fac(s, 'iberia', 'gas', 1, { upgrade: { to: 2, progress: 700, buildDays: 900 } });
  fac(s, 'iberia', 'lab', 1, { upgrade: { to: 2, progress: 120, buildDays: 240 } });
  fac(s, 'iberia', 'battery', 1);
  fac(s, 'iberia', 'wind', 2);
  fac(s, 'iberia', 'datacenter', 1, { status: 'building', progress: 200, buildDays: 450 });
  // megasite with everything
  s.sites['wyoming'].extraSlots = 3;
  grid('wyoming');
  fac(s, 'wyoming', 'campus', 1);
  fac(s, 'wyoming', 'reactor', 1);
  fac(s, 'wyoming', 'datacenter', 3);
  fac(s, 'wyoming', 'smr', 2);
  rival(s, 'wyoming', 'meridian', 2);
  rival(s, 'wyoming', 'lattice', 1, 'building');
  // megasite under construction
  grid('gobi');
  fac(s, 'gobi', 'campus', 1, { status: 'building', progress: 500, buildDays: 900 });
  fac(s, 'gobi', 'reactor', 1, { status: 'building', progress: 1300, buildDays: 3240 });
  fac(s, 'gobi', 'fab', 1, { status: 'building', progress: 300, buildDays: 1440, blocked: 'Waiting for EUV export licence' });
  rival(s, 'gobi', 'orchard', 1);
  // firm power sites
  grid('columbia-gorge');
  fac(s, 'columbia-gorge', 'hydro', 1);
  fac(s, 'columbia-gorge', 'hydro', 2);
  fac(s, 'columbia-gorge', 'datacenter', 2);
  fac(s, 'columbia-gorge', 'battery', 3);
  grid('reykjanes');
  fac(s, 'reykjanes', 'geothermal', 1);
  fac(s, 'reykjanes', 'geothermal', 2);
  fac(s, 'reykjanes', 'geothermal', 3);
  fac(s, 'reykjanes', 'datacenter', 1);
  grid('lakeshore');
  fac(s, 'lakeshore', 'restart', 1);
  fac(s, 'lakeshore', 'fab', 1);
  grid('kyushu');
  fac(s, 'kyushu', 'packaging', 1);
  fac(s, 'kyushu', 'packaging', 2);
  fac(s, 'kyushu', 'packaging', 3);
  fac(s, 'kyushu', 'smr', 1);
  rival(s, 'kyushu', 'orchard', 1);
  return s;
}

const SCENES = ['west-texas', 'iberia', 'wyoming', 'gobi', 'columbia-gorge', 'reykjanes', 'lakeshore', 'kyushu'];
const VIEW_ONLY = ['lumen-hsinchu', 'kestrel-ohio', 'stackwell-boise', 'hanbit-icheon', 'veldt-veldhoven', 'bondline-penang', 'cumulus-quincy', 'mine-atacama', 'mine-pilbara', 'mine-copperbelt', 'mine-helium', 'mine-neon', 'cls-cornwall'];

describe.skipIf(!dir)('diorama previews', () => {
  it('campuses day and night', () => {
    fs.mkdirSync(dir!, { recursive: true });
    setEra(1 as Era);
    const s = world();
    for (const id of [...SCENES, ...VIEW_ONLY]) {
      for (const night of [false, true]) {
        const { frame } = compose(s, id, { night });
        fs.writeFileSync(path.join(dir!, `dio-${id}-${night ? 'night' : 'day'}.png`), frame.png(2));
      }
    }
    // one screen-sized view at the real pixel size ×3, as the player sees it
    const { frame } = compose(s, 'wyoming', { night: true });
    fs.writeFileSync(path.join(dir!, `view-wyoming-night.png`), frame.png(3, { x: 30, w: 320 }));
    const d = compose(s, 'wyoming', { night: false });
    fs.writeFileSync(path.join(dir!, `view-wyoming-day.png`), d.frame.png(3, { x: 30, w: 320 }));
    setEra(0 as Era);
  });

  it('facility sheet (every type × tier, base and glow)', () => {
    setEra(1 as Era);
    const types: FacilityType[] = ['datacenter', 'solar', 'wind', 'battery', 'gas', 'lab', 'hydro', 'geothermal', 'restart', 'smr', 'reactor', 'packaging', 'fab', 'campus'];
    const rows: { pcs: PixelCanvas[] }[] = [];
    for (const type of types) {
      const pcs: PixelCanvas[] = [];
      for (let t = 1; t <= maxTier(type); t++) {
        const a = facilityArt(type, 'LSL', t);
        pcs.push(a.base[0], a.glow[0]);
      }
      rows.push({ pcs });
    }
    const W = Math.max(...rows.map((r) => r.pcs.reduce((a, p) => a + p.w + 6, 0))) + 6;
    const H = rows.reduce((a, r) => a + Math.max(...r.pcs.map((p) => p.h)) + 8, 8);
    const sheet = new Frame(W, H);
    const bg = new PixelCanvas(W, H);
    bg.rect(0, 0, W, H, C.sky4);
    sheet.draw(bg, 0, 0);
    let y = 4;
    for (const r of rows) {
      let x = 4;
      const rh = Math.max(...r.pcs.map((p) => p.h));
      r.pcs.forEach((p, i) => {
        if (i % 2) {
          const dark = new PixelCanvas(p.w, p.h);
          dark.rect(0, 0, p.w, p.h, C.night1);
          sheet.draw(dark, x, y + rh - p.h);
          sheet.draw(p, x, y + rh - p.h);
          sheet.add(bloomOf(p), x, y + rh - p.h, 0.55);
        } else sheet.draw(p, x, y + rh - p.h);
        x += p.w + 6;
      });
      y += rh + 8;
    }
    fs.writeFileSync(path.join(dir!, 'facility-sheet.png'), sheet.png(2));
    setEra(0 as Era);
  });
});

describe('diorama art', () => {
  it('every facility type and tier draws at its declared size with matching frames', () => {
    const types: FacilityType[] = ['hq', 'datacenter', 'solar', 'wind', 'battery', 'gas', 'lab', 'hydro', 'geothermal', 'restart', 'smr', 'reactor', 'packaging', 'fab', 'campus'];
    for (const type of types) {
      for (let t = 1; t <= maxTier(type); t++) {
        const a = facilityArt(type, 'ABC', t);
        const [w, h] = facilitySize(type, t);
        expect(a.base.length).toBeGreaterThan(0);
        for (const pc of [...a.base, ...a.glow]) expect([pc.w, pc.h]).toEqual([w, h]);
        expect(a.glow.length === 0 || a.glow.length === a.base.length).toBe(true);
      }
    }
  });

  it('set pieces and rival campuses match their sizes', () => {
    for (const site of SITES.filter((x) => x.kind !== 'build')) {
      for (const p of sitePieces(site)) {
        const a = pieceArt(p);
        const [w, h] = pieceSize(p);
        for (const pc of [...a.base, ...a.glow]) expect([pc.w, pc.h]).toEqual([w, h]);
      }
    }
    for (const owner of ['meridian', 'lattice', 'orchard']) {
      for (const n of [1, 2, 3]) {
        const a = rivalArt(owner, n);
        expect([a.base[0].w, a.base[0].h]).toEqual(rivalSize(n));
      }
    }
  });

  it('lays out every site (build and view-only) inside the scene width', () => {
    const s = world();
    for (const site of SITES) {
      const l = campusLayout(s, site.id, 320);
      expect(l.viewOnly).toBe(site.kind !== 'build');
      for (const it of l.items) {
        expect(it.x).toBeGreaterThanOrEqual(0);
        expect(it.x + it.w).toBeLessThanOrEqual(l.width);
        expect(itemArt(it, 'ABC', s.day)).not.toBeNull();
      }
    }
    // the megasite with extra land scrolls well past one screen
    expect(campusLayout(s, 'wyoming', 320).width).toBeGreaterThan(1200);
    void PARALLAX;
  });
});
