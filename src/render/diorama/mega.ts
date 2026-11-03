/**
 * Megaproject dioramas (Act III): region-scale energy builds that grow in stages. Each energy kind
 * has a tileable "block" — a solar field to the horizon, a row of giant wind turbines (on land or
 * standing in the North Sea), a reactor unit of the fleet, a pumped-hydro mountain, a geothermal
 * well pad — plus support pieces (control centre, substation, HVDC converter, storage yards,
 * survey stakes) and construction sites in the builder's colours.
 */
import type { Backdrop } from '../../content/sites';
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { Emitter, FacilityArt, Mover, RotorSpec } from './art';
import { BIOMES } from './art';
import { beacon, CONCRETE, containment, coolingCells, coolingTower, facadeShade, fence, floodWash, pipe, revealFrom, scaffold, stack, STEEL, tank, transformerYard, vessel, vpipe, windowGrid, type Ramp } from './draw';
import {
  billboard,
  builderFlag,
  CHARTER,
  crane,
  crawlerLattice,
  hoarding,
  lushTree,
  person,
  type Ramp4,
  siteCabins,
  solarCanopy,
  surveyStakes,
  theodolite,
} from './act3kit';

const HAZE: Ramp = { hi: C.ink9, lit: C.ink9, mid: C.ink8, shade: C.ink7, dark: C.ink7 };

/** Ground surface colours for a megaproject field, by backdrop. */
export function fieldColours(b: Backdrop): { a: number; b: number; c: number; crop?: number } {
  switch (b) {
    case 'desert':
      return { a: C.snd6, b: C.snd5, c: C.snd7 };
    case 'plains':
      return { a: C.grn5, b: C.grn4, c: C.snd6, crop: C.snd6 };
    case 'boreal':
      return { a: C.grn3, b: C.grn2, c: C.ice2 };
    case 'mountain':
      return { a: C.grn4, b: C.grn3, c: C.rck4 };
    case 'volcanic':
      return { a: C.rck3, b: C.rck2, c: C.grn3 };
    case 'savanna':
      return { a: C.snd5, b: C.grn5, c: C.snd6 };
    case 'tropical':
      return { a: C.grn4, b: C.grn3, c: C.snd5 };
    default:
      return { a: BIOMES[b].ground[0], b: BIOMES[b].ground[1], c: BIOMES[b].ground[2] };
  }
}

const groundRow = (pc: PixelCanvas, W: number, H: number, b: Backdrop) => {
  const f = fieldColours(b);
  for (let y = H - 3; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === H - 3 ? f.c : bayer(x, y) < 6 ? f.b : f.a);
};

// ── solar: rows of trackers to the horizon ─────────────────────────────────────────────────
export const SOLAR_W = 240;
const SOLAR_H = 40;
/** Back → front. Every pitch divides SOLAR_W so fields tile seamlessly side by side. */
const FIELD_ROWS = [
  { y: 4, h: 2, pitch: 6 },
  { y: 8, h: 2, pitch: 8 },
  { y: 12, h: 3, pitch: 10 },
  { y: 17, h: 3, pitch: 12 },
  { y: 23, h: 4, pitch: 15 },
  { y: 30, h: 5, pitch: 20 },
];

/** A tileable block of a solar park: tracker rows receding, inverter skids, sheep or robots. */
export function solarField(backdrop: Backdrop, seed: number): FacilityArt {
  const W = SOLAR_W;
  const H = SOLAR_H;
  const f = fieldColours(backdrop);
  const grazing = backdrop === 'plains' || backdrop === 'savanna' || backdrop === 'temperate';
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  // the field surface, fading into the distance at the top
  for (let y = 2; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y < 6 && bayer(x, y) >= (y - 1) * 3) continue;
      pc.set(x, y, bayer(x, y) < 5 ? f.b : f.a);
    }
  }
  // a service track across the middle of the park
  for (let x = 0; x < W; x++) {
    pc.set(x, 21, f.c);
    if (bayer(x, 22) < 8) pc.set(x, 22, f.c);
  }
  for (const [ri, r] of FIELD_ROWS.entries()) {
    const pw = r.pitch - (r.pitch >= 12 ? 2 : 1);
    for (let x0 = 0; x0 < W; x0 += r.pitch) {
      // posts and the shadow under the table
      for (let k = 0; k < pw; k++) if (bayer(x0 + k, r.y + r.h) < 10) pc.set(x0 + k, r.y + r.h, f.b === C.snd5 ? C.snd4 : C.grn3);
      if (r.h >= 3) {
        pc.vline(x0 + 1, r.y + r.h, 1 + (r.h >= 4 ? 1 : 0), C.ink6);
        pc.vline(x0 + pw - 2, r.y + r.h, 1 + (r.h >= 4 ? 1 : 0), C.ink5);
      }
      for (let j = 0; j < r.h; j++) {
        const shift = Math.round((r.h - 1 - j) * 0.6);
        for (let k = 0; k < pw; k++) {
          const px = (x0 + k + shift) % W;
          let c = ri < 2 ? C.blu3 : C.blu2;
          if (j === 0) c = ri < 2 ? C.sky4 : (x0 + k) % 7 === 0 ? C.sky5 : C.sky4;
          else if (k % 4 === 0 || (r.h >= 4 && j === Math.floor(r.h / 2))) c = ri < 2 ? C.blu4 : C.blu3;
          if (j === r.h - 1 && r.h > 2) c = C.ink2;
          pc.set(px, r.y + j, c);
        }
      }
    }
  }
  // inverter skids along the service track (LED status lights at night)
  for (let x = 18 + (seed % 2) * 60; x < W - 8; x += 120) {
    pc.rect(x, 17, 7, 5, C.ink9);
    pc.hline(x, 17, 7, C.white);
    pc.vline(x + 6, 17, 5, C.ink7);
    pc.set(x + 2, 19, C.grn6);
    g.set(x + 2, 19, C.grn6);
    pc.set(x + 4, 19, C.grn6);
    g.set(x + 4, 19, C.grn6);
  }
  const movers: Mover[] = [];
  if (grazing) {
    // agrivoltaics: a flock grazing between the rows
    for (let k = 0; k < 7; k++) {
      const sx = Math.floor(hash2(k, seed, 3) * (W - 8));
      const sy = [28, 36, 36, 27, 36, 28, 36][k];
      pc.rect(sx, sy - 2, 3, 2, C.white);
      pc.set(sx + 3, sy - 2, C.ink2);
      pc.set(sx, sy, C.ink3);
      pc.set(sx + 2, sy, C.ink3);
    }
  } else {
    // panel-cleaning robots work along the front row
    const r = FIELD_ROWS[5];
    const bot = [0, 1].map((fr) => {
      const b = new PixelCanvas(5, 3);
      b.rect(0, 1, 5, 2, C.white);
      b.hline(0, 0, 5, C.ink8);
      b.set(fr ? 1 : 3, 2, C.ink4);
      b.set(4, 1, C.cyn5);
      return b;
    });
    movers.push({ frames: bot, path: [[10, r.y + 1], [W - 10, r.y + 1]], speed: 3 + (seed % 3), phase: hash2(seed, 1, 9), pingpong: true });
  }
  // a couple of technicians in high-vis
  person(pc, 70 + (seed % 3) * 40, 22, seed + 4);
  return { base: [pc], glow: [g], points: {}, movers };
}

// ── a solar tower: a field of heliostats aiming at a receiver that shines like a second sun ──
export const CSP_W = 210;
const CSP_H = 134;

/**
 * Concentrated solar power with molten-salt storage (it keeps generating after dark): heliostat
 * rows around a tall tower whose receiver blazes white by day, the hot and cold salt tanks and
 * the turbine hall at its foot.
 */
export function cspTower(backdrop: Backdrop): FacilityArt {
  const W = CSP_W;
  const H = CSP_H;
  const f = fieldColours(backdrop);
  const cx = 104;
  const rTop = 6;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let fr = 0; fr < 2; fr++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the field surface
    for (let y = H - 40; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < H - 36 && bayer(x, y) >= (y - (H - 41)) * 3) continue;
        pc.set(x, y, bayer(x, y) < 5 ? f.b : f.a);
      }
    }
    // faint beams of concentrated light converging on the receiver
    for (const sx of [14, 50, 158, 194]) {
      const sy = H - 30;
      const n = Math.max(Math.abs(cx - sx), Math.abs(rTop + 8 - sy));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        if (t < 0.55 || t > 0.9 || (i + fr) % 2) continue;
        pc.set(Math.round(sx + (cx - sx) * t), Math.round(sy + (rTop + 8 - sy) * t), t > 0.75 ? C.yel2 : C.white);
      }
    }
    // heliostat rows: mirrors that hold the sky
    const rows = [
      { y: H - 37, h: 2, pitch: 6 },
      { y: H - 32, h: 2, pitch: 7 },
      { y: H - 27, h: 3, pitch: 10 },
      { y: H - 21, h: 3, pitch: 14 },
      { y: H - 14, h: 4, pitch: 15 },
      { y: H - 8, h: 4, pitch: 21 },
    ];
    for (const [ri, r] of rows.entries()) {
      for (let x0 = (ri * 3) % r.pitch; x0 < W; x0 += r.pitch) {
        const mw = Math.max(3, Math.round(r.pitch * 0.55));
        if (Math.abs(x0 + mw / 2 - cx) < 16 && ri > 2) continue; // the plant sits here
        for (let j = 0; j < r.h; j++) for (let k = 0; k < mw; k++) pc.set(x0 + k, r.y + j, j === 0 ? C.white : (x0 + k + j) % 5 === 0 ? C.sky5 : C.sky4);
        pc.hline(x0, r.y + r.h, mw, C.ink6);
        pc.vline(x0 + Math.floor(mw / 2), r.y + r.h, ri > 2 ? 2 : 1, C.ink5);
      }
    }
    // the tower
    for (let y = rTop + 14; y < H - 18; y++) {
      const half = y > H - 40 ? 5 : 4;
      for (let x = cx - half; x <= cx + half; x++) {
        const t = (x - (cx - half)) / (half * 2);
        pc.set(x, y, t < 0.25 ? C.white : t < 0.6 ? C.ink9 : t < 0.85 ? C.ink8 : C.ink7);
      }
      if ((y - rTop) % 16 === 0) pc.hline(cx - half, y, half * 2 + 1, C.ink7);
    }
    // the receiver: white-hot by day, ringed by a maintenance deck
    pc.rect(cx - 6, rTop + 2, 13, 12, C.yel1);
    for (let y = rTop + 2; y < rTop + 14; y++) for (let x = cx - 6; x <= cx + 6; x++) if (Math.abs(x - cx) < 4 - Math.abs(y - rTop - 8) * 0.2) pc.set(x, y, C.white);
    for (let y = rTop + 3; y < rTop + 13; y++) {
      pc.set(cx - 6, y, C.yel2);
      pc.set(cx + 6, y, ditherAt(cx, y, 0.5) ? C.yel1 : C.org2);
    }
    pc.hline(cx - 8, rTop + 14, 17, C.ink6);
    pc.hline(cx - 7, rTop + 1, 15, C.ink6);
    pc.vline(cx, rTop - 5, 6, C.ink7);
    beacon(pc, g, cx, rTop - 6, fr === 0);
    beacon(pc, g, cx - 7, rTop + 14, fr === 1);
    // a shimmer of glare around it
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const rr = 9 + (k % 3) * 2 + fr;
      pc.set(Math.round(cx + Math.cos(a) * rr), Math.round(rTop + 8 + Math.sin(a) * rr * 0.8), k % 2 ? C.yel2 : C.white);
    }
    g.rect(cx - 5, rTop + 4, 11, 8, C.org1);
    g.rect(cx - 3, rTop + 6, 7, 4, C.org2);
    // salt tanks (hot and cold) and the turbine hall at the foot
    tank(pc, cx - 30, H - 6, 14, 18, STEEL, true, C.org1);
    tank(pc, cx + 17, H - 6, 14, 16, STEEL, false, C.blu4);
    drawText(pc, 'HOT', cx - 29, H - 19, C.org0);
    pc.rect(cx - 12, H - 22, 26, 16, C.ink8);
    pc.hline(cx - 12, H - 22, 26, C.white);
    for (let x = cx - 10; x < cx + 12; x += 4) {
      pc.rect(x, H - 18, 2, 3, C.ink2);
      g.rect(x, H - 18, 2, 3, C.yel1);
    }
    facadeShade(pc, cx - 12, H - 22, 26, 16, C.ink8, C.ink7);
    pc.rect(0, H - 6, W, 3, f.b);
    groundRow(pc, W, H, backdrop);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

// ── storage: container batteries and their transformer ────────────────────────────────────
export function storageYard(accent: number): FacilityArt {
  const W = 108;
  const H = 34;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    pc.rect(0, H - 4, W, 4, C.ink6);
    pc.hline(0, H - 4, W, C.ink8);
    const row = (x0: number, n: number, top: number, bottom: number, cw: number, back: boolean, seed: number) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (cw + 2);
        pc.rect(x, top, cw, bottom - top, back ? C.ink8 : C.ink9);
        pc.hline(x, top, cw, back ? C.ink9 : C.white);
        for (let k = 2; k < cw - 1; k += 3) pc.vline(x + k, top + 2, bottom - top - 3, back ? C.ink7 : C.ink8);
        pc.vline(x + cw - 1, top, bottom - top, C.ink6);
        pc.rect(x, top + 2, cw, 1, accent);
        // HVAC on the roof
        pc.rect(x + 2, top - 2, 5, 2, C.ink7);
        for (let l = 0; l < 3; l++) {
          const on = l < 2 || (f + i + seed) % 2 === 0;
          const c = l === 2 ? C.yel0 : C.grn6;
          pc.set(x + 3 + l * 2, top + 5, on ? c : C.ink4);
          if (on) g.set(x + 3 + l * 2, top + 5, c);
        }
      }
    };
    row(10, 6, 6, H - 12, 12, true, 1);
    row(2, 5, 14, H - 4, 15, false, 0);
    transformerYard(pc, W - 20, H - 4, 1, true);
    beacon(pc, g, W - 21, H - 27, f === 0);
    fence(pc, 0, H - 9, W);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [44, H] }, fps: 1.2 };
}

// ── grid: substation and HVDC converter station ───────────────────────────────────────────
function pylon(pc: PixelCanvas, g: PixelCanvas | null, x: number, baseY: number, h: number, on = true) {
  for (let y = 0; y < h; y++) {
    const half = Math.max(1, Math.floor((y / h) * 6));
    pc.set(x - half, baseY - h + y, C.ink6);
    pc.set(x + half, baseY - h + y, C.ink6);
    if (y % 5 === 0) pc.line(x - half, baseY - h + y, x + half, baseY - h + y + 4, C.ink7);
  }
  pc.hline(x - 7, baseY - h + 3, 15, C.ink6);
  pc.hline(x - 5, baseY - h + 9, 11, C.ink6);
  for (const dx of [-7, 7, -5, 5]) pc.vline(x + dx, baseY - h + (Math.abs(dx) === 7 ? 4 : 10), 2, C.white);
  if (g) beacon(pc, g, x, baseY - h - 1, on);
}

export function megaSubstation(): FacilityArt {
  const W = 70;
  const H = 60;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    pc.rect(0, H - 4, W, 4, C.ink6);
    pc.hline(0, H - 4, W, C.ink8);
    transformerYard(pc, 4, H - 4, 3, true);
    // busbars and insulators
    for (let x = 2; x < 40; x += 6) {
      pc.vline(x, H - 30, 26, C.ink6);
      pc.rect(x - 1, H - 31, 3, 1, C.ink8);
    }
    pc.hline(0, H - 30, 40, C.ink7);
    pc.hline(0, H - 26, 40, C.ink7);
    pylon(pc, g, W - 14, H - 4, 50, f === 0);
    // lines leave toward the next piece
    for (const [dy, k] of [[-46, 0], [-40, 1]] as [number, number][]) {
      for (let x = W - 7; x < W; x++) pc.set(x, H - 4 + dy + Math.round((x - W + 7) * 0.25) + k, C.ink7);
      for (let x = 0; x < W - 21; x++) pc.set(x, H - 4 + dy + Math.round(Math.sin((x / (W - 21)) * Math.PI) * 3), C.ink7);
    }
    fence(pc, 0, H - 9, 44);
    floodWash(pc, g, 0, H - 24, 40, 20, 0.3, false);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

/** HVDC converter station: two valve halls, the DC yard, a big DC pylon and the line out. */
export function converterStation(route: string, building: boolean, progress: number, r: Ramp4): FacilityArt {
  const W = 140;
  const H = 66;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    pc.rect(0, H - 4, W, 4, C.ink6);
    pc.hline(0, H - 4, W, C.ink8);
    // valve halls
    for (const [hx, hw] of [[4, 44], [52, 44]] as [number, number][]) {
      const top = H - 44;
      pc.rect(hx, top, hw, H - 4 - top, C.ink8);
      pc.hline(hx, top, hw, C.white);
      for (let x = hx + 3; x < hx + hw; x += 4) pc.vline(x, top + 2, H - 7 - top, C.ink7);
      pc.rect(hx, top + 3, hw, 2, CHARTER.field);
      for (let x = hx + 4; x < hx + hw - 4; x += 6) {
        pc.rect(x, top + 8, 3, 2, C.ink2);
        if (hash2(x, hx, 3) > 0.4) g.rect(x, top + 8, 3, 2, C.cyn5);
      }
      facadeShade(pc, hx, top, hw, H - 4 - top, C.ink8, C.ink7);
      // wall bushings out to the DC yard
      pc.hline(hx + hw - 2, top + 14, 6, C.white);
    }
    const lw = measureText('HVDC');
    pc.rect(8, H - 34, lw + 4, 7, C.ink1);
    drawText(pc, 'HVDC', 10, H - 33, C.cyn5);
    drawText(g, 'HVDC', 10, H - 33, C.cyn5);
    const rw = measureText(route);
    if (rw < 84) {
      pc.rect(56, H - 34, rw + 4, 7, C.ink1);
      drawText(pc, route, 58, H - 33, C.yel0);
      drawText(g, route, 58, H - 33, C.yel0);
    }
    // DC yard: smoothing reactors on insulator stands
    for (let k = 0; k < 2; k++) {
      const x = 100 + k * 11;
      pc.vline(x + 3, H - 18, 14, C.white);
      pc.rect(x, H - 28, 8, 10, C.ink7);
      pc.hline(x, H - 28, 8, C.ink9);
      for (let y = H - 26; y < H - 18; y += 2) pc.hline(x, y, 8, C.ink6);
    }
    // the DC pylon: two arms, two bundles
    const px = W - 9;
    for (let y = 0; y < 56; y++) {
      const half = Math.max(1, Math.floor((y / 56) * 5));
      pc.set(px - half, H - 60 + y, C.ink6);
      pc.set(px + half, H - 60 + y, C.ink6);
      if (y % 6 === 0) pc.line(px - half, H - 60 + y, px + half, H - 60 + y + 5, C.ink7);
    }
    pc.hline(px - 8, H - 56, 17, C.ink6);
    pc.vline(px - 8, H - 55, 3, C.white);
    pc.vline(px + 8, H - 55, 3, C.white);
    beacon(pc, g, px, H - 61, f === 0);
    for (let x = 96; x < px - 8; x++) {
      const t = (x - 96) / (px - 104);
      pc.set(x, H - 52 + Math.round(Math.sin(t * Math.PI) * 2) + Math.round((1 - t) * 8), C.ink7);
    }
    let out = pc;
    if (building) {
      const p = Math.max(0.2, progress);
      const cut = Math.round(H - p * H);
      out = revealFrom(pc, cut);
      out.rect(0, H - 4, W, 4, C.ink5);
      scaffold(out, 4, Math.max(6, cut - 6), 92, Math.min(H - 5, cut + 8) - Math.max(6, cut - 6));
      crane(out, null, 74, 6, H - 4, 40, 10, Math.max(4, cut - 18), r, f === 0);
      hoarding(out, 0, H - 1, W, r);
      builderFlag(out, 2, H - 5, 18, r, f);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y < cut) g.set(x, y, 0);
    }
    frames.push(out);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

// ── the control centre and the stage-0 site board ─────────────────────────────────────────
export function megaOffice(site: string, backdrop: Backdrop): FacilityArt {
  const top = 'THE KARDASHEV PROJECT';
  const bw = Math.max(measureText(top), measureText(site)) + 28;
  const W = bw + 66;
  const H = 54;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the control centre: timber and glass, a meadow roof under a solar pergola
    const bx = 4;
    const bwid = 58;
    const btop = H - 25;
    pc.rect(bx, btop, bwid, H - 3 - btop, C.ink9);
    for (let fl = 0; fl < 2; fl++) {
      const y = btop + 3 + fl * 10;
      for (let x = bx + 2; x < bx + bwid - 2; x++) pc.set(x, y + 1, (x - bx) % 6 < 1 ? C.snd4 : C.blu2);
      for (let x = bx + 2; x < bx + bwid - 2; x++) for (let yy = y + 2; yy < y + 7; yy++) pc.set(x, yy, (x - bx) % 6 < 1 ? C.snd5 : (x + yy) % 9 === 0 ? C.sky4 : C.blu2);
      windowGrid(new PixelCanvas(1, 1), g, bx + 3, y + 2, 9, 1, { ww: 5, wh: 5, gx: 1, seed: fl + 5, lit: 0.7 });
    }
    facadeShade(pc, bx, btop, bwid, H - 3 - btop, C.ink9, C.ink8, 0.7);
    pc.hline(bx - 1, btop - 1, bwid + 2, C.grn4);
    for (let x = bx; x < bx + bwid; x++) if (hash2(x, 1, 5) > 0.5) pc.set(x, btop - 2, hash2(x, 2, 5) > 0.85 ? C.yel1 : C.grn5);
    solarCanopy(pc, bx + 4, btop - 2, bwid - 8, 4);
    lushTree(pc, bx + 2, H - 3, 4, 7, 1);
    // the Charter flag and the site board
    const fx = bx + bwid + 4;
    pc.vline(fx, H - 40, 37, C.ink7);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 9; i++) {
        const dy = Math.round(Math.sin(i * 0.7 - f * 1.5) * (i / 9) * 1.2);
        const ring = Math.hypot(i - 4, (j - 2) * 1.4) < 2.2;
        pc.set(fx + 1 + i, H - 40 + j + dy, ring ? (i + j) % 2 ? C.white : C.yel0 : CHARTER.field);
      }
    }
    billboard(pc, g, fx + 6, H - 3, top, site, 10);
    person(pc, fx + 10, H - 3, 31);
    person(pc, W - 10, H - 3, 32, 1);
    groundRow(pc, W, H, backdrop);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [34, H] }, fps: 2 };
}

/** Stage 0: open land with survey stakes, the Charter's board, a cabin and a theodolite. */
export function surveyedLand(site: string, backdrop: Backdrop, w: number, board: boolean): FacilityArt {
  const top = 'THE KARDASHEV PROJECT';
  const H = board ? 44 : 20;
  const pc = new PixelCanvas(w, H);
  const g = new PixelCanvas(w, H);
  surveyStakes(pc, 2, H - 2, w - 4, w);
  if (board) {
    const bw = billboard(pc, g, 6, H - 2, top, site, 12);
    // the site cabin with its lit window and a survey pickup
    const cx = 6 + bw + 10;
    if (cx + 52 < w) {
      pc.rect(cx, H - 11, 18, 9, C.ink9);
      pc.hline(cx, H - 11, 18, C.white);
      pc.rect(cx + 3, H - 9, 4, 3, C.ink1);
      g.rect(cx + 3, H - 9, 4, 3, C.yel1);
      pc.rect(cx + 10, H - 9, 4, 7, C.ink5);
      pc.rect(cx, H - 12, 18, 1, CHARTER.field);
      // pickup
      pc.rect(cx + 22, H - 6, 12, 3, C.white);
      pc.rect(cx + 28, H - 9, 6, 3, C.white);
      pc.rect(cx + 29, H - 8, 4, 1, C.sky4);
      pc.hline(cx + 22, H - 5, 12, C.org1);
      pc.set(cx + 24, H - 3, C.ink1);
      pc.set(cx + 31, H - 3, C.ink1);
      theodolite(pc, cx + 40, H - 2);
      person(pc, cx + 46, H - 2, 51);
    }
  } else {
    theodolite(pc, Math.round(w * 0.4), H - 2);
    person(pc, Math.round(w * 0.4) + 7, H - 2, 52);
  }
  for (let x = 0; x < w; x++) if (hash2(x, 3, 71) < 0.08) pc.set(x, H - 1, fieldColours(backdrop).c);
  return { base: [pc], glow: [g], points: {} };
}

// ── wind: giant turbines, on land or standing in the sea ──────────────────────────────────
interface Turbine {
  x: number;
  /** Base y (from the top of the sprite). */
  base: number;
  /** Hub height above the base. */
  hub: number;
  blade: number;
}

const LAND_TURBINES: Turbine[] = [
  { x: 14, base: -16, hub: 30, blade: 9 },
  { x: 124, base: -15, hub: 32, blade: 10 },
  { x: 96, base: -9, hub: 52, blade: 17 },
  { x: 196, base: -9, hub: 50, blade: 16 },
  { x: 42, base: -3, hub: 84, blade: 29 },
  { x: 156, base: -3, hub: 80, blade: 28 },
];
export const WIND_W = 220;
const WIND_H = 122;

function turbineTower(pc: PixelCanvas, g: PixelCanvas | null, t: Turbine, H: number, beaconOn: boolean, sea: boolean) {
  const baseY = H + t.base;
  const top = baseY - t.hub;
  const bigness = t.blade >= 20 ? 2 : t.blade >= 14 ? 1 : 0;
  const lit = bigness === 2 ? C.white : bigness === 1 ? C.ink9 : C.ink8;
  const mid = bigness === 2 ? C.ink9 : C.ink8;
  const sh = C.ink7;
  const tp = sea ? (bigness === 2 ? 12 : bigness === 1 ? 7 : 4) : 0; // transition piece above the water
  for (let y = top + 2; y < baseY - tp; y++) {
    const k = (y - top) / (baseY - top);
    const half = bigness === 2 ? (k > 0.55 ? 2 : 1) : bigness === 1 ? (k > 0.6 ? 1 : 1) : 0;
    for (let dx = -half; dx <= half; dx++) pc.set(t.x + dx, y, dx < 0 ? lit : dx > 0 ? sh : mid);
    if (half === 0) pc.set(t.x, y, lit);
  }
  if (sea) {
    // yellow transition piece with a platform, then the monopile into the water
    const half = bigness === 2 ? 2 : 1;
    for (let y = baseY - tp; y < baseY; y++) {
      for (let dx = -half; dx <= half; dx++) pc.set(t.x + dx, y, y < baseY - tp + Math.ceil(tp * 0.5) ? (dx < 0 ? C.yel1 : dx > 0 ? C.org1 : C.yel0) : dx > 0 ? C.ink4 : C.ink5);
    }
    pc.hline(t.x - half - 2, baseY - tp + Math.ceil(tp * 0.5), half * 2 + 5, C.ink6);
    if (bigness) pc.vline(t.x + half + 2, baseY - tp + Math.ceil(tp * 0.5) + 1, Math.floor(tp * 0.5) - 1, C.yel0);
    // foam where it meets the water
    pc.hline(t.x - half - 1, baseY - 1, half * 2 + 3, C.foam);
    if (bigness === 2) pc.set(t.x + half + 2, baseY - 1, C.white);
  } else {
    // foundation and the turbine's transformer box
    pc.hline(t.x - 3 - bigness, baseY - 1, 7 + bigness * 2, C.ink6);
    if (bigness === 2) {
      pc.rect(t.x + 4, baseY - 5, 4, 4, C.ink8);
      pc.hline(t.x + 4, baseY - 5, 4, C.white);
    }
  }
  // nacelle (behind the hub) + beacon
  const nw = bigness === 2 ? 9 : bigness === 1 ? 6 : 4;
  const nh = bigness === 2 ? 4 : bigness === 1 ? 3 : 2;
  pc.rect(t.x - 2, top - 1, nw, nh, lit);
  pc.hline(t.x - 2, top - 1 + nh - 1, nw, sh);
  if (bigness === 2) pc.hline(t.x + 1, top, nw - 3, CHARTER.field);
  pc.set(t.x + nw - 3, top - 2, beaconOn ? C.red3 : C.red1);
  if (beaconOn) g?.set(t.x + nw - 3, top - 2, C.red3);
}

function windRotors(list: Turbine[], H: number): RotorSpec[] {
  return list.map((t) => ({
    x: t.x,
    y: H + t.base - t.hub,
    size: t.blade,
    col: t.blade >= 20 ? C.white : t.blade >= 14 ? C.ink9 : C.ink8,
    style: t.blade >= 14 ? ('big' as const) : undefined,
  }));
}

/** A tileable stretch of a land wind field: three depths of turbines over farmland. */
export function windField(backdrop: Backdrop, seed: number): FacilityArt {
  const W = WIND_W;
  const H = WIND_H;
  const f = fieldColours(backdrop);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const list = LAND_TURBINES.map((t, i) => (seed % 2 && i < 4 ? { ...t, x: (t.x + 50) % W } : t));
  for (let fr = 0; fr < 2; fr++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // farmland between the turbines, fading out toward the horizon
    for (let y = H - 19; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = H - 19 - y + 3;
        if (d > 0 && bayer(x, y) < d * 4) continue;
        let c = bayer(x, y) < 5 ? f.b : f.a;
        if (f.crop && Math.floor((x + (H - y) * 3) / 26) % 3 === 0) c = bayer(x, y) < 7 ? f.crop : C.snd7;
        pc.set(x, y, c);
      }
    }
    // a farm track to each near turbine
    for (let x = 0; x < W; x++) if (bayer(x, H - 6) < 9) pc.set(x, H - 6, f.c);
    for (const t of list) turbineTower(pc, g, t, H, fr === 0, false);
    // a farmhouse with a red barn on one tile
    if (seed % 3 === 1) {
      pc.rect(108, H - 13, 10, 6, C.red2);
      for (let k = 0; k < 6; k++) pc.hline(107 + Math.floor(k / 2), H - 14 - k, 12 - Math.floor(k / 2) * 2, C.red1);
      pc.rect(112, H - 10, 3, 3, C.ink2);
      pc.rect(120, H - 12, 7, 5, C.white);
      pc.rect(121, H - 15, 5, 3, C.ink5);
      g.set(122, H - 10, C.yel1);
      lushTree(pc, 131, H - 7, 3, 9);
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, rotors: windRotors(list, H), fps: 1, sync: true };
}

const SEA_TURBINES: Turbine[] = [
  { x: 22, base: -16, hub: 28, blade: 9 },
  { x: 128, base: -16, hub: 30, blade: 9 },
  { x: 76, base: -9, hub: 50, blade: 16 },
  { x: 182, base: -9, hub: 48, blade: 16 },
  { x: 36, base: -1, hub: 90, blade: 30 },
  { x: 142, base: -1, hub: 86, blade: 29 },
];

/** A tileable stretch of the North Sea field: monopiles, yellow transition pieces, a crew boat. */
export function windSea(seed: number): FacilityArt {
  const W = WIND_W;
  const H = WIND_H + 4;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const list = SEA_TURBINES.map((t, i) => (seed % 2 && i < 4 ? { ...t, x: (t.x + 46) % W } : t));
  for (let fr = 0; fr < 2; fr++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    for (const t of list) turbineTower(pc, g, t, H, fr === 0, true);
    // work lights on the transition-piece platforms
    for (const t of list.filter((x) => x.blade >= 20)) {
      g.set(t.x - 3, H + t.base - 6, C.yel1);
      g.set(t.x + 3, H + t.base - 6, C.yel1);
    }
    frames.push(pc);
    glows.push(g);
  }
  // a crew transfer vessel shuttles between the near turbines
  const ctv = [0, 1].map((k) => {
    const b = new PixelCanvas(12, 6);
    b.rect(1, 3, 10, 2, C.white);
    b.hline(0, 5, 12, k ? C.foam : C.white);
    b.rect(4, 1, 5, 2, C.ink9);
    b.rect(5, 1, 3, 1, C.sky4);
    b.set(9, 0, C.org1);
    b.hline(1, 4, 10, C.org1);
    return b;
  });
  const movers: Mover[] = [{ frames: ctv, path: [[list[4].x + 8, H + 1], [list[5].x - 8, H + 1]], speed: 7, phase: hash2(seed, 2, 4), pingpong: true }];
  return { base: frames, glow: glows, points: {}, rotors: windRotors(list, H), movers, fps: 1, sync: true };
}

/** The offshore substation: a topside on a jacket, with a helideck. */
export function seaSubstation(hvdc: boolean): FacilityArt {
  const W = 64;
  const H = 74;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // jacket legs with bracing, into the water
    const ty = H - 34;
    for (const lx of [10, 24, 38, 52]) pc.vline(lx, ty, H - ty - 1, C.yel0);
    for (let y = ty + 2; y < H - 2; y += 6) {
      pc.line(10, y, 24, y + 5, C.org1);
      pc.line(24, y, 38, y + 5, C.org1);
      pc.line(38, y, 52, y + 5, C.org1);
    }
    pc.hline(8, H - 1, 48, C.foam);
    // topside: two decks of equipment
    pc.rect(4, ty - 26, 56, 26, C.ink9);
    pc.hline(4, ty - 26, 56, C.white);
    pc.hline(4, ty - 13, 56, C.ink7);
    for (let x = 7; x < 58; x += 5) {
      pc.rect(x, ty - 22, 3, 3, C.ink2);
      if (hash2(x, 2, 7) > 0.4) g.rect(x, ty - 22, 3, 3, C.yel1);
    }
    transformerYard(pc, 8, ty - 1, 3, false);
    pc.rect(4, ty - 3, 56, 3, C.yel0);
    facadeShade(pc, 4, ty - 26, 56, 26, C.ink9, C.ink8);
    // helideck
    pc.rect(30, ty - 30, 30, 3, C.ink5);
    pc.hline(30, ty - 30, 30, C.grn5);
    drawText(pc, 'H', 43, ty - 36, C.white);
    pc.line(30, ty - 27, 24, ty - 20, C.ink6);
    // crane + beacon
    pc.vline(8, ty - 40, 14, C.yel0);
    pc.line(8, ty - 40, 26, ty - 34, C.yel0);
    beacon(pc, g, 8, ty - 41, f === 0);
    beacon(pc, g, 59, ty - 31, f === 1);
    drawText(pc, hvdc ? 'HVDC' : 'OSS', 44, ty - 11, C.ink3);
    // the Charter flag on the helideck mast
    pc.vline(58, ty - 44, 14, C.ink7);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) pc.set(53 + i, ty - 44 + j + (i < 2 && f ? 1 : 0), i === 2 && (j === 1 || j === 2) ? C.white : CHARTER.field);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

/** Stage 0 at sea: survey buoys with flashing lights and a survey vessel flying the Charter's flag. */
export function seaSurvey(w: number): FacilityArt {
  const H = 40;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(w, H);
    const g = new PixelCanvas(w, H);
    // yellow special-mark buoys in a grid, each with an X topmark and a light
    for (let x = 10; x < w - 6; x += 38) {
      for (const [dx, dy] of [[0, 0], [17, -9]] as [number, number][]) {
        const bx = x + dx;
        const by = H - 2 + dy;
        if (bx > w - 6) continue;
        pc.rect(bx - 1, by - 5, 3, 5, C.yel0);
        pc.set(bx + 1, by - 4, C.org1);
        pc.vline(bx, by - 9, 4, C.ink5);
        pc.set(bx - 1, by - 10, C.yel0);
        pc.set(bx + 1, by - 10, C.yel0);
        pc.set(bx, by - 11, C.yel0);
        pc.hline(bx - 2, by, 5, C.foam);
        const on = (f + (bx >> 3)) % 2 === 0;
        pc.set(bx, by - 12, on ? C.yel1 : C.ink6);
        if (on) g.set(bx, by - 12, C.yel1);
      }
    }
    // the survey vessel with its A-frame and the Charter flag
    const vx = Math.min(w - 64, 70);
    for (let x = 0; x < 52; x++) {
      const bow = x > 44 ? Math.ceil((x - 44) * 0.7) : 0;
      for (let y = H - 9 + bow; y < H - 2; y++) pc.set(vx + x, y, y === H - 9 + bow ? C.white : y > H - 5 ? C.blu2 : C.blu3);
    }
    pc.hline(vx, H - 2, 52, C.foam);
    pc.rect(vx + 24, H - 19, 18, 10, C.white);
    for (let x = vx + 26; x < vx + 40; x += 3) {
      pc.rect(x, H - 16, 2, 2, C.blu2);
      g.rect(x, H - 16, 2, 2, C.yel1);
    }
    pc.rect(vx + 26, H - 23, 12, 4, C.ink9);
    pc.vline(vx + 32, H - 33, 10, C.ink6);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) pc.set(vx + 33 + i, H - 33 + j + (i > 3 && f ? 1 : 0), (i === 2 || i === 3) && (j === 1 || j === 2) ? C.white : CHARTER.field);
    pc.line(vx + 2, H - 9, vx + 8, H - 20, C.org1);
    pc.line(vx + 14, H - 9, vx + 8, H - 20, C.org1);
    pc.vline(vx + 8, H - 19, 12 + f, C.ink7);
    drawText(pc, 'SURVEY', vx + 8, H - 7, C.white);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

// ── nuclear: one certified design, built again and again ──────────────────────────────────
export const REACTOR_W = 156;
const REACTOR_H = 118;

export function reactorUnit(unit: number, backdrop: Backdrop, accent: number): FacilityArt {
  const W = REACTOR_W;
  const H = REACTOR_H;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the cooling tower behind
    const tcx = 116;
    const tw = coolingTower(pc, tcx, H - 3, 108, 32, CONCRETE, { band: accent });
    beacon(pc, g, Math.round(tcx - tw.half) + 1, tw.top - 1, f === 0);
    beacon(pc, g, Math.round(tcx + tw.half) - 1, tw.top - 1, f === 1);
    emitters = [-0.55, -0.15, 0.25, 0.62].map((k) => ({ x: tcx + k * tw.half, y: tw.top - 1, kind: 'steam' as const, rate: 2.6, spread: 3, size: 5 }));
    floodWash(pc, g, tcx - 32, H - 50, 64, 47, 0.45);
    // two compact reactors side by side
    for (const [k, rx] of [[0, 8], [1, 38]] as [number, number][]) {
      const domeTop = containment(pc, rx, H - 3, 26, 26, CONCRETE);
      pc.hline(rx, H - 22, 26, accent);
      pc.set(rx + 13, domeTop + 3, f === k ? C.red3 : C.red1);
      if (f === k) g.set(rx + 13, domeTop + 3, C.red3);
    }
    stack(pc, g, 66, 26, H - 3, 3, true, f === 0);
    // aux building across the front
    pc.rect(4, H - 18, 64, 15, C.ink7);
    pc.hline(4, H - 18, 64, C.ink9);
    windowGrid(pc, g, 8, H - 15, 11, 2, { ww: 3, wh: 2, gx: 2, gy: 3, seed: 30 + unit, lit: 0.55 });
    facadeShade(pc, 4, H - 18, 64, 15, C.ink7, C.ink6);
    // turbine hall
    const hx = 68;
    const top = H - 34;
    pc.rect(hx, top, 40, H - 3 - top, C.ink8);
    for (let x = hx + 2; x < hx + 40; x += 4) pc.vline(x, top + 3, H - 6 - top, C.ink7);
    pc.hline(hx - 1, top - 1, 42, C.white);
    pc.rect(hx, top + 4, 40, 5, C.ink2);
    for (let x = hx + 1; x < hx + 39; x += 3) {
      pc.rect(x, top + 5, 2, 3, C.blu3);
      if (hash2(x, unit, 33) > 0.25) g.rect(x, top + 5, 2, 3, C.yel1);
    }
    facadeShade(pc, hx, top, 40, H - 3 - top, C.ink8, C.ink7);
    const lbl = `UNIT ${unit}`;
    pc.rect(hx + 4, H - 16, measureText(lbl) + 4, 7, C.ink1);
    drawText(pc, lbl, hx + 6, H - 15, C.cyn5);
    drawText(g, lbl, hx + 6, H - 15, C.cyn5);
    transformerYard(pc, W - 16, H - 3, 1, false);
    fence(pc, 0, H - 8, 6);
    groundRow(pc, W, H, backdrop);
    pc.rect(0, H - 3, W, 1, C.ink6);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [20, H] }, emitters, fps: 1 };
}

// ── pumped hydro: a battery the size of a lake ────────────────────────────────────────────
export const HYDRO_W = 300;
const HYDRO_H = 128;

/**
 * A mountain with a hanging valley near the top, plugged by a concrete dam (the upper reservoir
 * shows as a sliver of water over the crest); penstocks run down the flank to a powerhouse on the
 * lower lake. Pumps push water uphill when power is cheap and it falls back through the turbines
 * when it isn't. The seed varies the summits and where the notch sits.
 */
export function pumpedHydro(backdrop: Backdrop, seed: number, build?: number): FacilityArt {
  // under construction (build = progress 0..1) the mountain is all there; the dam, the penstocks
  // and the powerhouse are what rise
  const bp = build === undefined ? 1 : Math.max(0.1, Math.min(0.97, build));
  const W = HYDRO_W;
  const H = HYDRO_H;
  const snowy = backdrop === 'mountain' || backdrop === 'boreal';
  const v1 = Math.round(hash2(seed, 1, 17) * 16);
  const v2 = Math.round(hash2(seed, 2, 17) * 14);
  const shift = Math.round((hash2(seed, 3, 17) - 0.5) * 24);
  const pts: [number, number][] = [
    [0, H - 3],
    [0.07, H - 24],
    [0.15, 44 + v2],
    [0.24, 12 + v1],
    [0.33, 26 + v2],
    [0.37, 31],
    [0.49, 30],
    [0.55, 38 + v1],
    [0.63, 62],
    [0.7, H - 40],
    [0.78, H - 3],
    [1, H - 3],
  ].map(([fx, y]) => [Math.round(fx * W) + (fx > 0.3 && fx < 0.6 ? shift : 0), y] as [number, number]);
  const nL = Math.round(0.375 * W) + shift;
  const nR = Math.round(0.485 * W) + shift;
  const nc = (nL + nR) / 2;
  const notchBottom = 60;
  const crest = 33;
  const base = (x: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      if (x < x0 || x > x1) continue;
      const t = (x - x0) / Math.max(1, x1 - x0);
      return y0 + (y1 - y0) * (0.5 - Math.cos(t * Math.PI) / 2);
    }
    return H - 3;
  };
  const prof: number[] = [];
  for (let x = 0; x < W; x++) {
    let y = base(x);
    if (y < H - 20) y += (fbm(x / 7, seed + 3, 1, 3) - 0.5) * 7;
    if (x > nL && x < nR) y = Math.max(y, notchBottom - (notchBottom - 30) * ((x - nc) / ((nR - nL) / 2)) ** 2);
    prof.push(Math.round(y));
  }
  // light from the upper left, from the smoothed slope of the ridge above each column
  const light: number[] = [];
  for (let x = 0; x < W; x++) {
    const sl = (prof[Math.min(W - 1, x + 6)] - prof[Math.max(0, x - 6)]) / 12;
    light.push(Math.max(0, Math.min(1, 0.55 - sl * 0.75)));
  }
  const ramp = (cols: number[], v: number, x: number, y: number) => {
    const t = Math.max(0, Math.min(0.999, v)) * (cols.length - 1);
    const i = Math.floor(t);
    return ditherAt(x, y, t - i) ? cols[Math.min(cols.length - 1, i + 1)] : cols[i];
  };
  const foot = Math.round(0.78 * W);
  const lakeL = Math.round(0.66 * W);
  const ph = { x: Math.round(0.79 * W), w: 42, top: H - 30 };
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the mountain, lit from the left: forest low down, meadow and rock above, snow on top
    for (let x = 0; x < foot + 8; x++) {
      const top = prof[x];
      const tree = H - 58 + Math.round((fbm(x / 11, seed + 9, 1, 2) - 0.5) * 16);
      for (let y = top; y < H - 3; y++) {
        const d = y - top;
        // deeper down the face the light evens out, with a little texture
        const lv = light[x] * Math.max(0.35, 1 - d / 70) + (1 - Math.max(0.35, 1 - d / 70)) * 0.45 + (hash2(x >> 2, y >> 2, seed + 2) - 0.5) * 0.12;
        let c: number;
        if (y > tree) c = ramp([C.grn1, C.grn2, C.grn3, C.grn4], lv, x, y);
        else {
          c = ramp([C.rck2, C.rck3, C.rck4, C.rck5], lv, x, y);
          if ((y + (x >> 3)) % 9 === 0 && bayer(x, y) < 9) c = lv > 0.5 ? C.rck3 : C.rck2; // strata
          if (y > tree - 8 && hash2(x >> 1, y >> 1, seed + 4) < 0.3) c = ramp([C.grn2, C.grn3, C.grn4], lv, x, y); // alpine meadow
        }
        if (snowy && y < 46 + Math.round((fbm(x / 6, seed + 5, 1, 2) - 0.5) * 14) && hash2(x, y, seed + 6) > 0.08) c = d < 1 && lv > 0.4 ? C.white : ramp([C.ice0, C.ice1, C.ice2, C.ice3], lv + 0.15, x, y);
        else if (d < 1 && y < tree) c = lv > 0.6 ? C.rck6 : lv > 0.35 ? C.rck5 : C.rck4;
        pc.set(x, y, c);
      }
      // pines along the treeline and scattered below it
      if (hash2(x, seed, 9) < 0.16) {
        const ty = Math.max(top + 4, tree + Math.round(hash2(x, seed, 10) * 30));
        if (ty < H - 6) for (let j = 0; j < 7; j++) pc.hline(x - (j >> 1), ty - 6 + j, (j >> 1) * 2 + 1, j % 3 === 0 ? C.grn2 : C.grn1);
      }
    }
    // the upper reservoir behind the dam: a sliver of water over the crest
    for (let x = nL - 4; x <= nR + 4 && bp >= 1; x++) {
      if (prof[x] > crest - 2) {
        pc.set(x, crest - 2, C.sea7);
        if (x % 5 !== f) pc.set(x, crest - 1, C.sea6);
      }
    }
    // the dam: a concrete arch plugging the notch, a road and lamps along the crest
    const damTop = bp >= 1 ? crest : Math.round(notchBottom - bp * (notchBottom - crest));
    for (let x = nL; x <= nR; x++) {
      for (let y = damTop; y < prof[x] + 1; y++) {
        const t = (x - nL) / (nR - nL);
        let c = (y - crest) % 6 === 5 ? C.ink7 : C.ink8;
        if (t < 0.18) c = (y - crest) % 6 === 5 ? C.ink8 : C.ink9;
        else if (t > 0.72 && ditherAt(x, y, (t - 0.72) * 3)) c = C.ink7;
        if ((x - nL) % 9 === 4) c = C.ink7;
        pc.set(x, y, c);
      }
    }
    if (bp >= 1) {
      for (let x = nL - 3; x <= nR + 3; x++) {
        pc.set(x, crest - 1, C.ink9);
        pc.set(x, crest, C.ink6);
      }
      for (let x = nL + 2; x < nR; x += 8) {
        pc.vline(x, crest - 5, 4, C.ink6);
        pc.set(x + 1, crest - 5, C.yel1);
        g.set(x + 1, crest - 5, C.yel1);
      }
      floodWash(pc, g, nL, crest, nR - nL, notchBottom - crest, 0.32, false);
    } else {
      // formwork on the rising wall
      scaffold(pc, nL - 2, damTop - 6, nR - nL + 4, 8, C.ink6, 4);
    }
    // the intake tower and the penstocks running down the flank to the powerhouse
    const sx = nR - 6;
    const sy = notchBottom - 2;
    for (let k = 0; k < 2; k++) {
      const x0 = sx + k * 4;
      const x1 = ph.x + 8 + k * 9;
      const y1 = ph.top + 4;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - sy));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (t > bp && bp < 1) break;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(sy + (y1 - sy) * t);
        pc.set(x, y, C.ink9);
        pc.set(x + 1, y, C.ink7);
        pc.set(x, y + 1, C.ink6);
        if ((i - f * 3 + 60) % 12 < 2) pc.set(x, y, C.sky4);
        if (i % 16 === 8) pc.rect(x - 1, y - 1, 4, 3, C.ink8);
      }
    }
    // the lower reservoir
    for (let y = H - 13; y < H; y++) {
      for (let x = lakeL + (H - y) * 2; x < W; x++) {
        const k = (x + f * 2 + y * 5) % 13;
        pc.set(x, y, y === H - 13 ? C.sea7 : k === 0 ? C.sea8 : y > H - 5 ? C.sea5 : C.sea6);
      }
    }
    // the powerhouse on the shore, its outlets churning the lake, a switchyard behind
    const phTop = bp >= 1 ? ph.top : Math.round(H - 12 - bp * (H - 12 - ph.top));
    if (bp < 1) {
      pc.rect(ph.x, phTop, ph.w, H - 12 - phTop, C.ink7);
      scaffold(pc, ph.x - 2, phTop - 8, ph.w + 4, 10, C.ink6, 5);
    }
    if (bp >= 1) pc.rect(ph.x, ph.top, ph.w, H - 12 - ph.top, C.ink8);
    if (bp >= 1) {
      pc.hline(ph.x - 1, ph.top - 1, ph.w + 2, C.white);
      pc.rect(ph.x, ph.top, ph.w, 2, CHARTER.field);
      for (let x = ph.x + 3; x < ph.x + ph.w - 3; x += 6) {
        pc.rect(x, ph.top + 5, 3, 6, C.ink2);
        if (hash2(x, seed, 2) > 0.2) g.rect(x, ph.top + 5, 3, 6, (x + f) % 3 ? C.yel1 : C.yel0);
      }
      facadeShade(pc, ph.x, ph.top, ph.w, H - 12 - ph.top, C.ink8, C.ink7, 0.55);
    }
    for (let k = 0; k < 3 && bp >= 1; k++) {
      const ox = ph.x + 4 + k * 13;
      pc.rect(ox, H - 13, 8, 2, C.ink2);
      pc.set(ox + ((f + k) % 4) * 2, H - 11, C.foam);
      pc.set(ox + ((f + k + 2) % 4) * 2, H - 10, C.white);
    }
    if (bp >= 1) transformerYard(pc, ph.x + 6, ph.top - 1, 2, false);
    pylon(pc, g, W - 9, ph.top + 4, 34, f < 2);
    // the road up to the dam
    for (let i = 0; i < 60; i++) {
      const x = 14 + i;
      const y = H - 6 - Math.round(i * 0.55);
      if (y > prof[x] + 2) pc.set(x, y, C.snd6);
    }
    for (let x = 0; x < lakeL; x++) for (let y = H - 3; y < H; y++) pc.set(x, y, y === H - 3 ? C.grn4 : bayer(x, y) < 6 ? C.grn3 : C.grn2);
    for (let x = lakeL; x < lakeL + 6; x++) for (let y = H - 3; y < H; y++) if (!pc.get(x, y)) pc.set(x, y, C.snd5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 4, emitters: [{ x: ph.x + 18, y: H - 12, kind: 'mist', rate: 5, spread: 16 }] };
}

// ── geothermal: well pads, rigs, pipe loops, binary plants ─────────────────────────────────
export const GEO_W = 176;
const GEO_H = 98;

function drillRig(pc: PixelCanvas, g: PixelCanvas, x: number, baseY: number, h: number, r: Ramp4, f: number) {
  const floor = baseY - 12;
  // substructure + drill floor
  pc.rect(x - 10, floor, 22, 3, C.ink5);
  pc.hline(x - 10, floor, 22, C.ink7);
  for (let k = 0; k < 4; k++) pc.line(x - 9 + k * 6, floor + 3, x - 6 + k * 6, baseY - 1, C.ink6);
  // the derrick: a tapering lattice
  const top = floor - h;
  for (let y = top; y < floor; y++) {
    const t = (y - top) / h;
    const half = Math.round(2 + t * 6);
    pc.set(x - half, y, r.lit);
    pc.set(x + half, y, r.base);
    if ((y - top) % 6 === 0) {
      pc.hline(x - half, y, half * 2 + 1, r.base);
      pc.line(x - half, y, x + half, Math.min(floor - 1, y + 6), r.dark);
    }
    // a constellation of work lights up the mast at night
    if ((y - top) % 9 === 4) {
      g.set(x - half, y, C.yel1);
      g.set(x + half, y, C.yel0);
    }
  }
  pc.rect(x - 3, top - 4, 7, 4, r.base);
  pc.hline(x - 3, top - 4, 7, r.lit);
  beacon(pc, g, x, top - 5, f % 2 === 0);
  // travelling block moving down the mast
  const by = top + 6 + (f % 4) * 5;
  pc.rect(x - 1, by, 3, 3, C.ink3);
  pc.vline(x, top, by - top, C.ink6);
  // doghouse and pipe rack
  pc.rect(x + 12, floor - 6, 10, 9, r.base);
  pc.hline(x + 12, floor - 6, 10, r.lit);
  pc.rect(x + 14, floor - 4, 3, 2, C.sky4);
  g.rect(x + 14, floor - 4, 3, 2, C.yel1);
  for (let k = 0; k < 4; k++) pc.hline(x - 26, baseY - 3 - k, 14, k % 2 ? C.ink6 : C.ink7);
}

export function geoPad(backdrop: Backdrop, rig: boolean, r: Ramp4): FacilityArt {
  const W = GEO_W;
  const H = GEO_H;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  const wells = rig ? [100, 116, 132, 148] : [20, 40, 60, 100, 116, 132, 148];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    emitters = [];
    // pad gravel
    for (let x = 0; x < W; x++) for (let y = H - 5; y < H - 3; y++) pc.set(x, y, bayer(x, y) < 8 ? C.ink6 : C.rck4);
    if (rig) drillRig(pc, g, 46, H - 3, 66, r, f);
    // wellheads: christmas trees with a whisper of vapour
    for (const [k, wx] of wells.entries()) {
      pc.rect(wx - 3, H - 6, 9, 2, C.ink5);
      vpipe(pc, wx, H - 16, 10, C.ink8, C.ink6);
      pc.rect(wx - 1, H - 14, 4, 2, C.ink5);
      pc.rect(wx - 1, H - 10, 4, 2, C.ink5);
      pc.set(wx - 2, H - 13, C.red3);
      pc.hline(wx - 1, H - 17, 4, C.ink7);
      pc.set(wx + 4, H - 7, C.org1);
      g.set(wx + 4, H - 7, (k + f) % 4 ? C.org2 : C.org1);
      if (k % 2 === 0) emitters.push({ x: wx + 1, y: H - 18, kind: 'vapor', rate: 1.1 });
    }
    // the gathering line with expansion loops, continuous across pads
    for (const [i, py] of [H - 22, H - 26].entries()) {
      let x = 0;
      while (x < W) {
        const seg = Math.min(22, W - x);
        pipe(pc, x, py, seg, H - 4, i ? C.ink8 : C.ink9, C.ink6, 11);
        x += seg;
        if (x >= W - 8) break;
        pc.vline(x, py - 9, 10, C.ink8);
        pc.hline(x, py - 9, 6, C.ink8);
        pc.hline(x, py - 8, 6, C.ink6);
        pc.vline(x + 5, py - 9, 10, C.ink7);
        x += 6;
      }
    }
    for (const wx of wells) pc.vline(wx + 1, H - 22, 5, C.ink7);
    // separator station: tall cyclone separators split steam from brine
    for (const [k, sx] of [[0, rig ? 70 : 76], [1, rig ? 82 : 88]] as [number, number][]) {
      tank(pc, sx, H - 5, 8, 26 - k * 4, STEEL, k === 0);
      pc.rect(sx, H - 27 + k * 4, 8, 2, C.org1);
    }
    vessel(pc, rig ? 60 : 66, H - 12, 12, 5, STEEL);
    // silencers venting a test flow: big white plumes
    for (const [k, mx] of [[0, W - 13], [1, rig ? 2 : 4]] as [number, number][]) {
      if (k === 1 && rig) continue;
      pc.rect(mx, H - 17, 10, 12, C.rck4);
      pc.hline(mx, H - 17, 10, C.rck5);
      pc.vline(mx + 9, H - 17, 12, C.rck3);
      for (let y = H - 15; y < H - 6; y += 3) pc.hline(mx + 1, y, 8, C.rck3);
      emitters.push({ x: mx + 5, y: H - 19, kind: 'steam', rate: 3.2, spread: 3, size: 5 });
    }
    // fumaroles: the ground itself steams
    for (const vx of [rig ? 24 : 34, 140]) {
      pc.set(vx, H - 4, C.yel0);
      pc.set(vx + 1, H - 4, C.snd6);
      emitters.push({ x: vx, y: H - 5, kind: 'vapor', rate: 1.4, spread: 2 });
    }
    // the pad's control cabin
    pc.rect(rig ? 112 : 104, H - 12, 12, 7, C.ink9);
    pc.hline(rig ? 112 : 104, H - 12, 12, C.white);
    pc.rect((rig ? 112 : 104) + 2, H - 10, 3, 2, C.ink1);
    g.rect((rig ? 112 : 104) + 2, H - 10, 3, 2, C.yel1);
    groundRow(pc, W, H, backdrop);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, emitters, fps: 3 };
}

/** Binary-cycle plant: an air-cooled condenser deck of fans, the turbine skid and tanks. */
export function binaryPlant(backdrop: Backdrop): FacilityArt {
  const W = 140;
  const H = 54;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the continuous gathering line
    pipe(pc, 0, H - 22, W, H - 4, C.ink9, C.ink6, 11);
    pipe(pc, 0, H - 26, W, null, C.ink8, C.ink6);
    // ACC: a long deck on A-frames, fans on top
    const dx = 4;
    const dw = 84;
    const dy = H - 34;
    for (let x = dx + 2; x < dx + dw; x += 10) {
      pc.line(x, dy + 4, x + 4, H - 4, C.ink5);
      pc.line(x + 8, dy + 4, x + 4, H - 4, C.ink6);
    }
    for (let x = dx; x < dx + dw; x++) for (let y = dy + 4; y < dy + 12; y++) if ((x + y) % 4 === 0) pc.set(x, y, C.ink6);
    pc.rect(dx, dy, dw, 4, C.ink7);
    pc.hline(dx, dy, dw, C.ink9);
    for (let x = dx + 1; x + 8 <= dx + dw; x += 10) {
      pc.rect(x, dy - 3, 8, 3, C.ink4);
      pc.hline(x, dy - 3, 8, C.ink6);
      const ph = (f + (x >> 3)) % 4;
      pc.set(x + 1 + ph * 2, dy - 2, C.ink8);
      pc.set(x + 7 - ph * 2, dy - 2, C.ink8);
    }
    // turbine-generator building
    const bx = 92;
    pc.rect(bx, H - 26, 40, 23, C.ink8);
    pc.hline(bx, H - 26, 40, C.white);
    for (let x = bx + 3; x < bx + 38; x += 5) {
      pc.rect(x, H - 21, 3, 3, C.ink2);
      if (hash2(x, 4, 2) > 0.3) g.rect(x, H - 21, 3, 3, C.yel1);
    }
    facadeShade(pc, bx, H - 26, 40, 23, C.ink8, C.ink7);
    const lbl = 'GEO';
    pc.rect(bx + 4, H - 13, measureText(lbl) + 4, 7, C.ink1);
    drawText(pc, lbl, bx + 6, H - 12, C.org2);
    drawText(g, lbl, bx + 6, H - 12, C.org2);
    // working-fluid tanks
    vessel(pc, bx + 16, H - 11, 18, 6, STEEL);
    beacon(pc, g, dx + dw - 1, dy - 4, f % 2 === 0);
    // a wet cooling tower for the summer peak, steaming
    coolingCells(pc, bx + 2, H - 26, 2, 8, f);
    floodWash(pc, g, dx, dy, dw, 12, 0.3, false);
    groundRow(pc, W, H, backdrop);
    frames.push(pc);
    glows.push(g);
  }
  return {
    base: frames,
    glow: glows,
    points: { dock: [104, H] },
    fps: 4,
    emitters: [
      { x: 101, y: H - 41, kind: 'steam', rate: 2.6, spread: 3 },
      { x: 115, y: H - 41, kind: 'steam', rate: 2.6, spread: 3 },
    ],
  };
}

/**
 * A jack-up installation vessel standing on its four legs at x, its crane lifting a nacelle
 * (hook drop `drop`), tower sections and blades on deck, the operator's name on the hull.
 */
function jackup(pc: PixelCanvas, g: PixelCanvas, vx: number, H: number, r: Ramp4, f: number, drop: number, sign: string) {
  const deck = H - 20;
  for (const lx of [vx + 2, vx + 52]) {
    pc.vline(lx, deck - 40, H - deck + 40, r.lit);
    pc.vline(lx + 1, deck - 40, H - deck + 40, r.base);
    for (let y = deck - 38; y < H; y += 3) pc.set(lx + 2, y, r.dark);
    beacon(pc, g, lx + 1, deck - 41, f === 0);
  }
  pc.rect(vx - 2, deck, 62, 7, C.white);
  pc.hline(vx - 2, deck + 6, 62, r.base);
  pc.hline(vx - 2, deck + 7, 62, C.ink6);
  pc.rect(vx + 40, deck - 13, 16, 13, C.ink9);
  for (let x = vx + 42; x < vx + 54; x += 3) {
    pc.rect(x, deck - 10, 2, 2, C.blu3);
    g.rect(x, deck - 10, 2, 2, C.yel1);
  }
  pc.rect(vx + 40, deck - 16, 16, 3, C.grn5);
  drawText(pc, 'H', vx + 46, deck - 22, C.white);
  for (let k = 0; k < 3; k++) pc.rect(vx + 6 + k * 8, deck - 9, 5, 9, C.ink9);
  for (let k = 0; k < 2; k++) pc.hline(vx + 2, deck - 11 - k * 2, 32, k ? C.white : C.ink8);
  for (let x = vx - 6; x < vx + 64; x++) if ((x + f) % 3) pc.set(x, H - 1, C.foam);
  const hook = crawlerLattice(pc, g, vx + 20, deck, 84, 76, r, drop, f === 0);
  pc.rect(hook[0] - 4, hook[1], 9, 4, C.white);
  pc.hline(hook[0] - 4, hook[1] + 3, 9, C.ink7);
  drawText(pc, sign, vx, deck + 1, r.dark);
  // deck floodlights
  g.set(vx + 4, deck - 1, C.yel1);
  g.set(vx + 36, deck - 1, C.yel1);
}

/** The installation vessel at work on the next turbine (the North Sea field is never finished). */
export function jackupVessel(r: Ramp4, sign: string): FacilityArt {
  const W = 132;
  const H = WIND_H + 4;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const t: Turbine = { x: 108, base: -1, hub: 86, blade: 29 };
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the turbine being installed: monopile, transition piece and the first tower sections
    const tw = new PixelCanvas(W, H);
    turbineTower(tw, null, t, H, false, true);
    const cut = H + t.base - 52;
    for (let y = cut; y < H; y++) for (let x = 0; x < W; x++) if (tw.get(x, y)) pc.set(x, y, tw.get(x, y));
    pc.hline(t.x - 4, cut, 9, r.base);
    jackup(pc, g, 14, H, r, f, 30, sign);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

// ── construction: the finished block rising behind scaffolding, in the builder's colours ──
/**
 * A megaproject under construction. `full` is the finished art of the same block; the site reveals
 * it bottom-up (solar fills left to right), with cranes, hoarding, cabins and flags in the
 * builder's colours and a board naming the builder and the contract size.
 */
export function megaConstruction(kind: string, full: FacilityArt, progress: number, size: number, r: Ramp4, sign: string, sea: boolean): FacilityArt {
  const src = full.base[0];
  const { w: W, h: H } = src;
  const p = Math.max(0.12, Math.min(1, progress));
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const PANEL = new Set([C.blu2, C.blu3, C.blu4, C.sky4, C.sky5, C.ink2]);
  for (let f = 0; f < 2; f++) {
    const g = new PixelCanvas(W, H);
    let pc: PixelCanvas;
    if (kind === 'solar') {
      // piles are driven everywhere first; the tables go on from the left
      pc = new PixelCanvas(W, H);
      const cut = Math.round(W * p);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = src.get(x, y);
          if (!c) continue;
          if (x < cut || !PANEL.has(c)) pc.set(x, y, c);
        }
      }
      // the installation crew at the edge: a telehandler lifting a pallet of panels
      const tx = Math.min(W - 26, Math.max(10, cut + 2));
      pc.rect(tx, H - 9, 14, 4, r.base);
      pc.hline(tx, H - 9, 14, r.lit);
      pc.rect(tx + 9, H - 13, 4, 4, r.base);
      pc.set(tx + 10, H - 12, C.sky4);
      pc.line(tx + 3, H - 9, tx - 4, H - 15 - f, r.lit);
      pc.rect(tx - 8, H - 17 - f, 6, 3, C.blu3);
      pc.hline(tx - 8, H - 17 - f, 6, C.sky4);
      pc.set(tx + 2, H - 5, C.ink1);
      pc.set(tx + 11, H - 5, C.ink1);
      person(pc, tx + 16, H - 3, 11);
      person(pc, tx - 12, H - 3, 12 + f);
      for (let k = 0; k < 3; k++) {
        const px = Math.min(W - 10, cut + 32 + k * 10);
        pc.rect(px, H - 8, 7, 4, C.blu3);
        pc.hline(px, H - 8, 7, C.sky4);
        pc.hline(px, H - 4, 7, C.snd3);
      }
    } else if (kind === 'hydro') {
      // the mountain is already there: `full` is the half-built scheme; cranes at the dam and the powerhouse
      pc = src.clone();
      crane(pc, g, Math.round(W * 0.47), 6, Math.round(H * 0.5), 30, 8, 20, r, f === 0);
      crane(pc, g, Math.round(W * 0.9), 40, H - 12, 28, 6, 30, r, f === 1);
    } else {
      const cut = Math.round(H - p * H);
      pc = revealFrom(src, cut);
      if (kind === 'wind' && sea) {
        jackup(pc, g, 90, H, r, f, Math.max(6, cut - 26), sign);
      } else if (kind === 'wind') {
        // a lattice crawler crane hoisting a nacelle; blades waiting on trailers
        const hook = crawlerLattice(pc, g, 60, H - 3, Math.min(H - 20, 96), 74, r, Math.max(6, cut - 30), f === 0);
        pc.rect(hook[0] - 4, hook[1], 9, 4, C.white);
        pc.hline(hook[0] - 4, hook[1] + 3, 9, C.ink7);
        for (let k = 0; k < 2; k++) {
          const by = H - 6 - k * 3;
          pc.hline(100, by, 56, C.white);
          pc.hline(100, by + 1, 56, C.ink8);
          pc.set(156, by, C.ink7);
        }
        pc.rect(100, H - 4, 60, 1, C.ink4);
      } else {
        const sy = Math.max(4, cut - 8);
        scaffold(pc, 4, sy, W - 8, Math.min(H - 4, cut + 6) - sy, C.ink6);
        const n = size >= 3 ? 3 : size === 2 ? 2 : W > 120 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const cx = Math.min(W - 8, Math.round(((i + 0.6) / n) * W));
          crane(pc, g, cx, 2 + i * 4, H - 3, Math.min(cx - 2, 34 + (i % 2) * 8), 9, Math.max(3, cut - 12 - i * 4), r, (f + i) % 2 === 0);
        }
      }
    }
    if (!sea) {
      hoarding(pc, 0, H, W, r);
      siteCabins(pc, g, W - 34, H - 4, 2, r);
    }
    // the builder's board and flags
    const text = `${sign} ${['', 'S', 'M', 'L'][size] ?? ''}`.trim();
    const sw = measureText(text) + 6;
    const sx = 6;
    const syy = sea ? H - 40 : H - 22;
    pc.rect(sx, syy, sw, 9, r.dark);
    pc.box(sx, syy, sw, 9, r.lit);
    drawText(pc, text, sx + 3, syy + 2, C.white);
    drawText(g, text, sx + 3, syy + 2, C.ice2);
    if (sea) {
      // a marker buoy holds the board up out at sea
      pc.vline(sx + 3, syy + 9, H - syy - 12, C.ink6);
      pc.rect(sx + 1, H - 4, 5, 3, C.yel0);
      pc.hline(sx, H - 1, 7, C.foam);
    } else {
      pc.vline(sx + 3, syy + 9, H - syy - 13, C.ink6);
      pc.vline(sx + sw - 4, syy + 9, H - syy - 13, C.ink6);
      for (let k = 0; k < 3; k++) builderFlag(pc, sx + sw + 6 + k * 10, H - 4, 20, r, f + k);
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

// ── the distant kit: the megaproject continuing to the horizon (back band) ────────────────
export interface MegaBack {
  base: PixelCanvas;
  /** Two frames: aviation lights on / off (the rest of the lights stay). */
  glow: PixelCanvas[];
  rotors: RotorSpec[];
}

/** A billowing plume of steam: a cauliflower of puffs over the top, leaning downwind. */
function plume(pc: PixelCanvas, x: number, y: number, n: number, seed: number, scale = 1) {
  const puffs: [number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const t = k / Math.max(1, n - 1);
    puffs.push([x + (t * 3 + t * t * 7) * scale + (hash2(k, seed, 3) - 0.5) * 2, y - (2.5 + t * 15 - t * t * 2) * scale, (2.2 + t * 3.6) * scale * (0.85 + hash2(k, seed, 4) * 0.3)]);
  }
  // back to front so the lit tops of the near puffs win
  for (const [i, [cx, cy, r]] of puffs.entries()) {
    const t = i / Math.max(1, n - 1);
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        const dx = xx + 0.5 - cx;
        const dy = yy + 0.5 - cy;
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        if (d > 0.78 && bayer(xx, yy) < (d - 0.78) * 60) continue;
        if (t > 0.7 && bayer(xx, yy) < (t - 0.7) * 22) continue;
        const l = (-dx * 0.7 - dy) / r;
        pc.set(xx, yy, l > 0.3 ? C.white : l > -0.35 ? C.ice3 : C.ice2);
      }
    }
  }
}

/**
 * The far reaches of a megaproject at parallax 0.75: panel rows to the horizon, rows of small
 * turbines (spinning — the scene adds the rotors), cooling towers with plumes, steam fields,
 * distant dams. Everything stands on the far field that starts at row `fieldTop`; below it the
 * band is solid field (or sea), so the gaps between plots look out over more of the project.
 */
export function megaBack(kinds: string[], stage: number, backdrop: Backdrop, offshore: boolean, w: number, h: number, seed: number, fieldTop: number): MegaBack {
  const pc = new PixelCanvas(w, h);
  const on = new PixelCanvas(w, h);
  const off = new PixelCanvas(w, h);
  const rotors: RotorSpec[] = [];
  const f = fieldColours(backdrop);
  const density = stage >= 3 ? 1 : stage === 2 ? 0.65 : 0.38;
  const ft = Math.max(4, fieldTop);
  // the far field (or the sea), with a soft edge at the horizon
  for (let y = ft; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (offshore) {
        const t = (y - ft) / Math.max(1, h - ft);
        let c = t < 0.2 ? C.sea7 : ditherAt(x, y, t) ? C.sea5 : C.sea6;
        if ((x + y * 13 + Math.floor(hash2(y, seed, 5) * 40)) % 21 < 2) c = C.sea7;
        pc.set(x, y, y === ft ? C.sea8 : c);
        continue;
      }
      if (y - ft < 2 && bayer(x, y) >= (y - ft + 1) * 6) continue;
      let c = bayer(x, y) < 6 ? f.b : f.a;
      // crop strips and tracks further down, seen through the gaps between plots
      if (f.crop && y - ft > 8 && Math.floor((x + (h - y) * 4) / 30) % 3 === 0) c = bayer(x, y) < 7 ? f.crop : C.snd7;
      if (y - ft > 6 && (y - ft) % 13 === 0) c = f.c;
      pc.set(x, y, c);
    }
  }
  // long stretches per kind across the width
  const segs: { kind: string; x0: number; x1: number }[] = [];
  if (kinds.length) {
    let x = 0;
    let i = 0;
    while (x < w) {
      const len = 160 + Math.floor(hash2(i, seed, 7) * 220);
      segs.push({ kind: kinds[i % kinds.length], x0: x, x1: Math.min(w, x + len) });
      x += len + 12;
      i++;
    }
  }
  for (const s of segs) {
    if (s.kind === 'solar') {
      // thin panel rows to the horizon, broken into tables, glinting
      for (const [ri, ry] of [ft + 1, ft + 3, ft + 6].entries()) {
        for (let x = s.x0; x < s.x1; x++) {
          if (hash2(x >> 4, ri, seed) > 0.3 + density * 0.7) continue;
          if (x % (3 + ri) === 0) continue;
          pc.set(x, ry, (x + ri * 5) % 11 === 0 ? C.sky4 : ri === 2 ? C.blu2 : C.blu3);
          if (ri === 2) pc.set(x, ry + 1, C.ink3);
        }
      }
      // storage halls dotted along it
      for (let x = s.x0 + 24; x < s.x1 - 20; x += Math.round(96 / density)) {
        pc.rect(x, ft - 3, 11, 4, C.ink9);
        pc.hline(x, ft - 3, 11, C.white);
        pc.vline(x + 10, ft - 3, 4, C.ink7);
        on.set(x + 2, ft - 2, C.grn6);
        off.set(x + 2, ft - 2, C.grn6);
      }
    } else if (s.kind === 'wind') {
      const step = Math.round(26 / density);
      for (let x = s.x0 + 8; x < s.x1 - 8; x += step + Math.floor(hash2(x, seed, 3) * 12)) {
        const far = hash2(x, seed, 4) > 0.5;
        const th = far ? 15 + Math.floor(hash2(x, seed, 5) * 4) : 22 + Math.floor(hash2(x, seed, 6) * 7);
        const base = ft + (far ? 1 : 4);
        const top = base - th;
        pc.vline(x, top + 1, base - top - 1, far ? C.ink8 : C.ink9);
        pc.rect(x - 1, top, 3, 1, far ? C.ink8 : C.ink9);
        if (offshore) {
          pc.set(x, base - 2, C.yel0);
          pc.set(x, base - 1, C.yel0);
          pc.hline(x - 1, base, 3, C.foam);
        }
        on.set(x + 1, top - 1, C.red3);
        rotors.push({ x, y: top, size: far ? 4 : 6, col: far ? C.ink8 : C.ink9 });
      }
    } else if (s.kind === 'nuclear') {
      for (let x = s.x0 + 30; x < s.x1 - 20; x += Math.round(84 / density)) {
        const th = 20 + Math.floor(hash2(x, seed, 8) * 6);
        const t = coolingTower(pc, x, ft + 3, th, 8, HAZE);
        plume(pc, x, t.top - 1, 6, x, 1);
        on.set(x, t.top - 1, C.red3);
        // the reactor domes at its foot
        pc.ellipse(x - 13, ft + 1, 4.5, 4, C.ink9);
        pc.ellipse(x - 23, ft + 1, 4.5, 4, C.ink9);
        pc.hline(x - 28, ft + 2, 22, C.ink8);
        on.set(x - 13, ft, C.yel1);
        off.set(x - 13, ft, C.yel1);
      }
    } else if (s.kind === 'geo') {
      for (let x = s.x0 + 16; x < s.x1 - 10; x += Math.round(48 / density)) {
        pc.rect(x, ft - 2, 8, 3, C.ink8);
        pc.hline(x, ft - 2, 8, C.ink9);
        plume(pc, x + 3, ft - 3, 4, x, 0.75);
        pc.hline(x - 14, ft, 14, C.ink9);
        on.set(x + 1, ft - 1, C.org1);
        off.set(x + 1, ft - 1, C.org1);
      }
    } else if (s.kind === 'hydro') {
      // a distant dam wall across a valley notch, lit along the crest
      for (let x = s.x0 + 40; x < s.x1 - 40; x += Math.round(170 / density)) {
        for (let k = -14; k < 44; k++) {
          const ridge = Math.round(Math.abs(k - 15) * 0.5);
          if (k < 0 || k >= 30) {
            pc.vline(x + k, ft - 16 + ridge, 17 - ridge, bayer(x + k, ridge) < 8 ? C.rck4 : C.rck3);
            continue;
          }
          const hh = 14 - Math.round(Math.abs(k - 15) * 0.2);
          pc.vline(x + k, ft + 1 - hh, hh, k < 3 ? C.ink9 : C.ink8);
          if (k % 6 === 3) {
            on.set(x + k, ft - hh, C.yel1);
            off.set(x + k, ft - hh, C.yel1);
          }
        }
        for (let k = 3; k < 27; k++) pc.set(x + k, ft - 14, C.sea7);
      }
    }
  }
  // transmission lines marching across
  if (!offshore && stage > 0) {
    for (let x = 30 + Math.floor(hash2(seed, 2, 2) * 40); x < w; x += 76) {
      const top = ft - 17;
      for (let y = top; y < ft + 1; y++) {
        const half = Math.floor(((y - top) / 18) * 2);
        pc.set(x - half, y, C.ink7);
        pc.set(x + half, y, C.ink7);
      }
      pc.hline(x - 3, top + 1, 7, C.ink7);
      for (let k = 1; k < 76 && x + k < w; k++) pc.set(x + k, top + 1 + Math.round(Math.sin((k / 76) * Math.PI) * 3), C.ink7);
      on.set(x, top - 1, C.red3);
    }
  }
  // aerial perspective: knock the brightest tops back toward the sky
  for (let y = 0; y < ft; y++) for (let x = 0; x < w; x++) if (pc.get(x, y) === C.ink9 && bayer(x, y) < 3) pc.set(x, y, C.ink8);
  return { base: pc, glow: [on, off], rotors };
}

