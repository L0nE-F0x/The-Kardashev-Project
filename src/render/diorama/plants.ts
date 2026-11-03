/**
 * Act II set-piece plants for the campus diorama: hydro dam, geothermal field, reactor restart,
 * SMR pack, big reactor, packaging plant, fab and the Gigawatt Campus. All procedural, all
 * palette-indexed; animation comes from frames (water, fans, LEDs, beacons) plus emitters
 * (steam and vapour particles spawned by the scene).
 */
import { C } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { Emitter, FacilityArt } from './art';
import { facilitySize } from './sizes';
import {
  beacon,
  CONCRETE,
  floodWash,
  containment,
  coolingCells,
  coolingTower,
  facadeShade,
  fanUnit,
  fence,
  OLD_CONCRETE,
  pipe,
  type Ramp,
  scaffold,
  signPlate,
  stack,
  STEEL,
  tank,
  transformerYard,
  vessel,
  vpipe,
  windowGrid,
} from './draw';

const ICE: Ramp = { hi: C.white, lit: C.ice3, mid: C.ice2, shade: C.ice1, dark: C.ice0 };
const HAZE: Ramp = { hi: C.ink9, lit: C.ink9, mid: C.ink8, shade: C.ink7, dark: C.ink7 };

/** Text at 2× (each font pixel becomes a 2×2 block — still on the pixel grid). */
export function bigText(pc: PixelCanvas, g: PixelCanvas | null, text: string, x: number, y: number, col: number) {
  const tmp = new PixelCanvas(measureText(text), 5);
  drawText(tmp, text, 0, 0, col);
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < tmp.w; i++) {
      if (!tmp.get(i, j)) continue;
      pc.rect(x + i * 2, y + j * 2, 2, 2, col);
      g?.rect(x + i * 2, y + j * 2, 2, 2, col);
    }
  }
  return tmp.w * 2;
}

/**
 * A data-hall facade block (used by the campus and by rival campuses): louvres, pilasters,
 * storey slabs with LED strips, rooftop chillers with fans, a stair core and lit windows.
 */
export function hallBlock(
  pc: PixelCanvas,
  g: PixelCanvas,
  x: number,
  top: number,
  w: number,
  bottom: number,
  f: number,
  opts: { floors?: number; accent?: number; accentLit?: number; trim?: number; seed?: number; chillers?: boolean; core?: boolean; beacons?: boolean } = {},
) {
  const floors = opts.floors ?? 1;
  const accent = opts.accent ?? C.cyn4;
  const accentLit = opts.accentLit ?? C.cyn5;
  const seed = opts.seed ?? 0;
  const h = bottom - top;
  pc.rect(x, top, w, h, C.ink4);
  pc.hline(x, top, w, opts.trim ?? C.ink6);
  pc.hline(x, top + 1, w, C.ink5);
  pc.vline(x, top, h, C.ink6);
  const fh = Math.floor(h / floors);
  for (let k = 0; k < floors; k++) {
    const fy = top + k * fh;
    if (k > 0) {
      pc.hline(x, fy, w, C.ink6);
      pc.hline(x, fy + 1, w, C.ink2);
      for (let xx = x + 2; xx < x + w - 2; xx += 2) {
        const on = ((xx >> 3) + f + k + seed) % 5 !== 0;
        pc.set(xx, fy + 1, on ? accent : C.ink3);
        if (on) g.set(xx, fy + 1, accentLit);
      }
    }
    for (let y = fy + 5; y < fy + fh - 2; y += 4) {
      pc.hline(x + 2, y, w - 4, C.ink3);
      pc.hline(x + 2, y - 1, w - 4, C.ink5);
    }
    // a strip of operator windows on each storey
    const wy = fy + 3;
    for (let xx = x + 4; xx < x + w - 14; xx += 3) {
      if (hash2(xx, k, seed + 41) < 0.35) continue;
      pc.set(xx, wy, C.ink1);
      pc.set(xx + 1, wy, C.ink1);
      if (hash2(xx, k, seed + 42) < 0.8) {
        const c = hash2(xx, k, seed + 43) > 0.6 ? accentLit : C.yel1;
        g.set(xx, wy, c);
        g.set(xx + 1, wy, c);
      }
    }
  }
  for (let xx = x + 14; xx < x + w - 4; xx += 16) pc.rect(xx, top + 2, 2, h - 3, C.ink3);
  if (opts.core !== false && w > 40) {
    const sx = x + w - 12;
    pc.rect(sx, top - 3, 8, h + 3, C.ink5);
    pc.hline(sx, top - 3, 8, C.ink7);
    for (let y = top + 1; y < bottom - 4; y += 5) {
      pc.rect(sx + 2, y, 4, 2, C.ink1);
      g.rect(sx + 2, y, 4, 2, (y + seed) % 3 ? C.yel1 : C.yel0);
    }
  }
  facadeShade(pc, x, top, w, h, C.ink4, C.ink3);
  if (opts.chillers !== false) {
    for (let xx = x + 3; xx + 16 <= x + w - (opts.core !== false && w > 40 ? 12 : 0); xx += 20) {
      pc.rect(xx, top - 7, 16, 7, C.ink6);
      pc.hline(xx, top - 7, 16, C.ink8);
      pc.vline(xx + 15, top - 7, 7, C.ink5);
      for (let y = top - 5; y < top - 1; y += 2) pc.hline(xx + 2, y, 12, C.ink5);
      for (const fx of [xx + 3, xx + 9]) {
        pc.rect(fx, top - 9, 5, 2, C.ink3);
        const ph = (f + fx) % 2;
        pc.set(fx + 1 + ph, top - 9, C.ink7);
        pc.set(fx + 3 - ph, top - 8, C.ink7);
      }
    }
  }
  if (opts.beacons) {
    beacon(pc, g, x + 1, top - 1, f % 2 === 0);
    beacon(pc, g, x + w - 2, top - 1, f % 2 === 1);
  }
}

// ── hydro dam ──────────────────────────────────────────────────────────────────────────────
export function hydro(label: string, tier: number): FacilityArt {
  const [W, H] = facilitySize('hydro', tier);
  const crest = 13;
  const toe = H - 9;
  const edge = 28;
  const inset = 22;
  const xl = (y: number) => Math.round(edge + ((y - crest) / (toe - crest)) * inset);
  const xr = (y: number) => W - 1 - xl(y);
  const sw = tier === 1 ? 14 : 20;
  const hw = 30;
  const sx = tier === 1 ? xl(toe) + hw + 6 : Math.round(W / 2 - sw / 2);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // dam face
    for (let y = crest; y < toe; y++) {
      for (let x = xl(y) - 3; x <= xr(y) + 3; x++) {
        let c = C.ink8;
        if ((y - crest) % 6 === 5) c = C.ink7;
        else if ((x - 4) % 15 === 0) c = C.ink7;
        // the face darkens toward the toe (spray and shadow)
        const t = (y - crest) / (toe - crest);
        if (t > 0.5 && ditherAt(x, y, (t - 0.5) * 1.2)) c = c === C.ink8 ? C.ink7 : C.ink6;
        // seepage streaks
        if (hash2(x, 5, 91) < 0.07 && t > 0.2 && bayer(x, y) < 8) c = C.rck5;
        pc.set(x, y, c);
      }
    }
    // penstocks down to the powerhouse(s)
    const houses = tier === 1 ? [xl(toe) + 2] : [xl(toe) + 2, xr(toe) - 2 - hw];
    for (const hx of houses) {
      for (let k = 0; k < 3; k++) {
        const px = hx + 4 + k * 9;
        vpipe(pc, px, crest + 6, toe - 16 - crest - 6, C.ink6, C.ink5);
        pc.vline(px + 2, crest + 6, toe - 16 - crest - 6, C.ink4);
        pc.rect(px - 1, crest + 5, 5, 2, C.ink5);
      }
    }
    // spillway chute with falling water
    pc.vline(sx - 1, crest, toe - crest, C.ink5);
    pc.vline(sx + sw, crest, toe - crest, C.ink6);
    for (let y = crest + 4; y < toe + 2; y++) {
      for (let x = sx; x < sx + sw; x++) {
        const v = (y * 2 - f * 6 + Math.floor(hash2(x, 0, 13) * 9)) % 12;
        const vv = v < 0 ? v + 12 : v;
        let c = vv < 2 ? C.white : vv < 4 ? C.foam : vv < 8 ? C.sea8 : C.sea7;
        if (x === sx || x === sx + sw - 1) c = vv < 6 ? C.sea7 : C.sea6;
        pc.set(x, y, c);
      }
    }
    // radial gates at the top of the chute
    for (let x = sx; x < sx + sw; x += 6) {
      pc.rect(x, crest, 4, 4, C.ink5);
      pc.hline(x, crest, 4, C.ink7);
    }
    // tailwater pool between the abutments
    for (let y = toe; y < H - 3; y++) {
      for (let x = xl(toe) - 6; x <= xr(toe) + 6; x++) {
        const k = (x + f * 2 + y * 3) % 9;
        pc.set(x, y, k === 0 ? C.sea7 : y === toe ? C.sea6 : C.sea5);
      }
    }
    // plunge-pool spray
    for (let i = 0; i < 26; i++) {
      const x = sx - 5 + Math.floor(hash2(i, f, 7) * (sw + 10));
      const y = toe - 5 + Math.floor(hash2(i, f, 8) * 9);
      pc.set(x, y, hash2(i, f, 9) > 0.5 ? C.white : C.foam);
    }
    // powerhouse(s) at the toe
    for (const hx of houses) {
      const top = toe - 16;
      pc.rect(hx, top, hw, H - 3 - top, C.ink7);
      pc.hline(hx - 1, top - 1, hw + 2, C.ink9);
      pc.hline(hx - 1, top, hw + 2, C.ink8);
      for (let x = hx + 3; x < hx + hw - 3; x += 6) {
        pc.rect(x, top + 4, 3, 7, C.ink2);
        if (hash2(x, hx, 4) > 0.25) g.rect(x, top + 4, 3, 7, (x + f) % 3 ? C.yel1 : C.yel0);
      }
      facadeShade(pc, hx, top, hw, H - 3 - top, C.ink7, C.ink6, 0.55);
      // draft-tube outlets churning
      for (let k = 0; k < 3; k++) {
        const ox = hx + 3 + k * 9;
        pc.rect(ox, H - 6, 6, 3, C.ink2);
        pc.set(ox + ((f + k) % 3) * 2, H - 4, C.foam);
      }
      // roof bushings
      pc.vline(hx + hw - 8, top - 5, 4, C.white);
      pc.vline(hx + hw - 4, top - 5, 4, C.white);
    }
    signPlate(pc, g, label.slice(0, 3).toUpperCase(), houses[0] + 2, toe - 26, C.cyn5);
    for (let y = crest + 4; y < toe + 2; y++) for (let x = sx; x < sx + sw; x++) if (pc.get(x, y) === C.white && bayer(x, y) < 10) g.set(x, y, C.ice2);
    floodWash(pc, g, xl(toe) - 3, crest, xr(toe) - xl(toe) + 6, toe - crest, 0.3, false);
    // abutments: rocky ridges the dam is keyed into, sloping away to the plot edges
    for (const side of [-1, 1]) {
      const inner = (y: number) => (side < 0 ? xl(y) : xr(y)) + Math.round((hash2(y >> 1, side, 23) - 0.5) * 2);
      const edgeX = side < 0 ? xl(crest) + 4 : xr(crest) - 4;
      for (let x = 0; x < W; x++) {
        const d = side < 0 ? edgeX - x : x - edgeX;
        if (d < -12) continue;
        const ridge = Math.round(3 + Math.pow(Math.max(0, d), 1.1) * 0.62 + (hash2(x >> 2, side, 29) - 0.5) * 3);
        for (let y = Math.max(0, ridge); y < H - 3; y++) {
          const ix = inner(y);
          if (side < 0 ? x > ix : x < ix) continue;
          const fromTop = y - ridge;
          const fromEdge = side < 0 ? ix - x : x - ix;
          let c: number;
          if (fromTop < 2) c = C.grn4;
          else if (fromTop < 4) c = bayer(x, y) < 9 ? C.grn3 : C.grn2;
          else {
            // light from the left: left ridge's valley wall is in shadow, right ridge's is lit
            const lit = side < 0 ? fromEdge > 6 : fromEdge < 6;
            c = lit ? C.rck4 : C.rck3;
            if (fromEdge < 2) c = side < 0 ? C.rck2 : C.rck5;
            if ((y + (x >> 3)) % 7 === 0 && bayer(x, y) < 10) c = side < 0 ? C.rck2 : C.rck3; // strata
            if (hash2(x, y, 31) < 0.04) c = C.grn2;
          }
          pc.set(x, y, c);
        }
        // a few pines along the ridge line
        if (d > 2 && hash2(x, side, 37) < 0.09 && ridge > 4) {
          for (let j = 0; j < 6; j++) pc.hline(x - (j >> 1), ridge - 6 + j, (j >> 1) * 2 + 1, j % 3 === 0 ? C.grn2 : C.grn1);
        }
      }
    }
    // crest: road, parapet, lamps, intake gantry
    for (let x = xl(crest) - 6; x <= xr(crest) + 6; x++) {
      pc.set(x, crest - 3, C.ink9);
      pc.set(x, crest - 2, C.ink6);
      pc.set(x, crest - 1, C.ink5);
      if (x % 3 === 0) pc.set(x, crest - 4, C.ink8);
    }
    for (let x = xl(crest) + 4; x < xr(crest) - 2; x += 18) {
      pc.vline(x, crest - 8, 5, C.ink6);
      pc.set(x + 1, crest - 8, C.yel1);
      g.set(x + 1, crest - 8, C.yel1);
    }
    const gx = Math.round(W * 0.3);
    pc.vline(gx, crest - 13, 10, C.yel0);
    pc.vline(gx + 12, crest - 13, 10, C.yel0);
    pc.hline(gx - 1, crest - 13, 15, C.org1);
    pc.hline(gx - 1, crest - 14, 15, C.yel0);
    pc.rect(gx + 4, crest - 12, 4, 3, C.ink4);
    // a pylon on the right abutment carrying the output away
    const px = W - 14;
    const pbase = Math.round(3 + Math.pow(px - (xr(crest) - 4), 1.1) * 0.62) + 2;
    const ptop = pbase - 18;
    for (let y = 0; y < 18; y++) {
      const half = Math.floor(y / 6);
      pc.set(px - half, ptop + y, C.ink6);
      pc.set(px + half, ptop + y, C.ink6);
    }
    pc.hline(px - 4, ptop + 2, 9, C.ink6);
    for (let x = px + 5; x < W; x++) pc.set(x, ptop + 2 + Math.round((x - px) * 0.3), C.ink7);
    beacon(pc, g, px, ptop - 1, f < 2);
    // apron along the ground
    for (let x = 0; x < W; x++) for (let y = H - 3; y < H; y++) pc.set(x, y, bayer(x, y) < 6 ? C.rck2 : C.rck3);
    frames.push(pc);
    glows.push(g);
  }
  return {
    base: frames,
    glow: glows,
    points: {},
    emitters: [{ x: sx + sw / 2, y: toe - 3, kind: 'mist', rate: 9, spread: sw / 2 + 3 }],
    fps: 8,
  };
}

// ── geothermal ─────────────────────────────────────────────────────────────────────────────
export function geothermal(tier: number): FacilityArt {
  const [W, H] = facilitySize('geothermal', tier);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const emitters: Emitter[] = [];
  const cells = 1 + tier;
  const hallW = tier === 3 ? 40 : 36;
  const halls = tier === 3 ? [4, 46] : [4];
  const cellX = halls[halls.length - 1] + hallW + 6;
  const wellX0 = cellX + cells * 14 + 8;
  const wells: number[] = [];
  for (let x = wellX0; x < W - 14; x += 16) wells.push(x);
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // volcanic ridge behind
    for (let x = Math.floor(W * 0.35); x < W; x++) {
      const t = (x - W * 0.35) / (W * 0.65);
      const top = Math.round(H * 0.18 + Math.abs(t - 0.55) * H * 0.7 + (hash2(x >> 2, 3, 5) - 0.5) * 3);
      for (let y = top; y < H - 3; y++) pc.set(x, y, y - top < 2 ? C.rck4 : bayer(x, y) < 5 ? C.rck2 : C.rck3);
    }
    // fumarole crust (sulphur yellow) on the ridge
    const fx = Math.round(W * 0.35 + W * 0.65 * 0.55);
    const fy = Math.round(H * 0.18) + 2;
    for (let i = -3; i <= 3; i++) if (hash2(i, 2, 3) > 0.3) pc.set(fx + i, fy + Math.abs(i) / 2, i % 2 ? C.yel0 : C.snd6);
    if (f === 0) emitters.push({ x: fx, y: fy - 1, kind: 'vapor', rate: 2, spread: 2 });
    // turbine hall(s)
    for (const hx of halls) {
      const top = H - 30;
      pc.rect(hx, top, hallW, H - 3 - top, C.ink7);
      for (let x = hx + 2; x < hx + hallW - 1; x += 3) pc.vline(x, top + 3, H - 6 - top, C.ink6);
      pc.hline(hx - 1, top, hallW + 2, C.ink9);
      pc.hline(hx - 1, top + 1, hallW + 2, C.ink8);
      for (let x = hx + 3; x < hx + hallW - 4; x += 5) {
        pc.rect(x, top + 6, 3, 3, C.ink2);
        if (hash2(x, hx, 2) > 0.3) g.rect(x, top + 6, 3, 3, C.yel1);
      }
      pc.rect(hx + 4, H - 15, 12, 12, C.ink5);
      for (let y = H - 14; y < H - 3; y += 2) pc.hline(hx + 5, y, 10, C.ink4);
      facadeShade(pc, hx, top, hallW, H - 3 - top, C.ink7, C.ink6, 0.5);
      // door lamp
      pc.set(hx + 10, H - 17, C.yel1);
      g.set(hx + 10, H - 17, C.yel1);
      floodWash(pc, g, hx, H - 16, hallW, 13, 0.35);
      fanUnit(pc, hx + hallW - 14, top - 4, 10, f);
    }
    signPlate(pc, g, 'GEO', halls[0] + 20, H - 26, C.org2);
    // separator vessel and the steam pipes from the wells
    vessel(pc, cellX - 2, H - 22, 18, 6, STEEL);
    const pipeY = [H - 12, H - 15];
    for (const [i, py] of pipeY.entries()) {
      let x = halls[halls.length - 1] + hallW;
      const end = wells[wells.length - 1] + 2 - i * 3;
      // expansion loops every ~30 px
      while (x < end) {
        const seg = Math.min(26, end - x);
        pipe(pc, x, py, seg, H - 3, i ? C.ink8 : C.ink9, C.ink6, 9);
        x += seg;
        if (x >= end) break;
        pc.vline(x, py - 8, 9, C.ink8);
        pc.hline(x, py - 8, 6, C.ink8);
        pc.hline(x, py - 7, 6, C.ink6);
        pc.vline(x + 5, py - 8, 9, C.ink7);
        x += 6;
      }
    }
    // mechanical-draft cooling cells (steaming)
    const tops = coolingCells(pc, cellX, H - 3, cells, 18, f);
    if (f === 0) for (const [x, y] of tops) emitters.push({ x, y, kind: 'steam', rate: 3.5, spread: 3 });
    beacon(pc, g, cellX, H - 22, f % 2 === 0);
    floodWash(pc, g, cellX, H - 12, cells * 14, 9, 0.3, false);
    // wellheads ("Christmas trees") with a little vapour
    for (const [k, wx] of wells.entries()) {
      pc.rect(wx - 3, H - 5, 9, 2, C.ink5);
      vpipe(pc, wx, H - 15, 10, C.ink8, C.ink6);
      pc.rect(wx - 1, H - 13, 4, 2, C.ink5);
      pc.rect(wx - 1, H - 9, 4, 2, C.ink5);
      pc.set(wx - 2, H - 12, C.red3);
      pc.set(wx + 3, H - 8, C.red3);
      // work light on each wellhead pad
      pc.set(wx + 4, H - 6, C.org1);
      g.set(wx + 4, H - 6, (k + f) % 4 ? C.org2 : C.org1);
      pc.hline(wx - 1, H - 16, 4, C.ink7);
      if (f === 0 && k % 2 === 0) emitters.push({ x: wx + 1, y: H - 17, kind: 'vapor', rate: 1.2 });
    }
    // rock muffler venting at the far end
    const mx = W - 12;
    pc.rect(mx, H - 13, 10, 10, C.rck4);
    pc.hline(mx, H - 13, 10, C.rck5);
    pc.vline(mx + 9, H - 13, 10, C.rck3);
    for (let y = H - 11; y < H - 3; y += 3) pc.hline(mx + 1, y, 8, C.rck3);
    if (f === 0) emitters.push({ x: mx + 5, y: H - 15, kind: 'steam', rate: 2.5, spread: 3 });
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, emitters, fps: 3 };
}

// ── reactor restart ────────────────────────────────────────────────────────────────────────
export function restart(label: string): FacilityArt {
  const [W, H] = facilitySize('restart');
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the cooling tower stands behind the plant
    const tw = coolingTower(pc, 122, H - 3, 94, 26, OLD_CONCRETE, { stain: true, band: C.cyn4 });
    beacon(pc, g, Math.round(122 - tw.half) + 1, tw.top - 1, f === 0);
    beacon(pc, g, Math.round(122 + tw.half) - 1, tw.top - 1, f === 1);
    emitters = [-0.5, 0, 0.5].map((k) => ({ x: 122 + k * tw.half, y: tw.top - 1, kind: 'steam' as const, rate: 3.2, spread: 3, size: 5 }));
    floodWash(pc, g, 96, H - 50, 54, 47, 0.5);
    // vent stack
    stack(pc, g, 58, 16, H - 3, 4, true, f === 0);
    // old containment, freshly patched
    const domeTop = containment(pc, 20, H - 3, 34, 40, OLD_CONCRETE);
    for (let y = domeTop + 2; y < H - 3; y++) for (let x = 20; x < 54; x++) if (pc.get(x, y) && hash2(x, 3, 19) < 0.12 && bayer(x, y) < 5) pc.set(x, y, C.rck4);
    scaffold(pc, 40, domeTop + 6, 14, 22, C.ink6, 5);
    pc.hline(18, H - 44, 38, C.ink6);
    // aux block
    pc.rect(12, H - 22, 50, 19, C.ink7);
    pc.hline(12, H - 22, 50, C.ink9);
    windowGrid(pc, g, 16, H - 18, 9, 2, { ww: 3, wh: 2, gx: 2, gy: 3, seed: 3, lit: 0.6 });
    facadeShade(pc, 12, H - 22, 50, 19, C.ink7, C.ink6);
    // turbine hall: rusty old panels with new blue ones bolted in
    const hx = 62;
    const hw = 46;
    const top = H - 34;
    pc.rect(hx, top, hw, H - 3 - top, C.rck5);
    for (let x = hx + 2; x < hx + hw; x += 3) pc.vline(x, top + 2, H - 5 - top, C.rck4);
    for (let y = top + 2; y < H - 3; y += 8) {
      for (let x = hx; x < hx + hw; x += 9) {
        if (hash2(x, y, 23) < 0.45) {
          pc.rect(x, y, 8, 7, C.blu4);
          pc.hline(x, y, 8, C.blu5);
        }
      }
    }
    pc.hline(hx - 1, top - 1, hw + 2, C.ink8);
    pc.hline(hx - 1, top, hw + 2, C.rck4);
    for (let x = hx + 3; x < hx + hw - 3; x += 5) {
      pc.rect(x, top + 4, 3, 4, C.ink2);
      if (hash2(x, 7, 7) > 0.25) g.rect(x, top + 4, 3, 4, C.yel1);
    }
    facadeShade(pc, hx, top, hw, H - 3 - top, C.rck5, C.rck4);
    signPlate(pc, g, 'UNIT 1', hx + 4, H - 16, C.cyn5);
    signPlate(pc, g, label.slice(0, 3).toUpperCase(), hx + 30, H - 16, C.yel0);
    // new switchyard
    transformerYard(pc, 2, H - 3, 1, true);
    fence(pc, 0, H - 8, W);
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, emitters, fps: 1 };
}

// ── SMR pack (Little Sun) ──────────────────────────────────────────────────────────────────
function sunLogo(pc: PixelCanvas, g: PixelCanvas, cx: number, cy: number) {
  pc.circle(cx + 0.5, cy + 0.5, 2.6, C.yel0);
  g.circle(cx + 0.5, cy + 0.5, 2.6, C.yel0);
  for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    pc.set(cx + dx, cy + dy, C.org1);
    g.set(cx + dx, cy + dy, C.org1);
  }
}

export function smr(label: string, tier: number): FacilityArt {
  const [W, H] = facilitySize('smr', tier);
  const n = tier === 1 ? 4 : 8;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // cooling cells behind the control building
    const tops = coolingCells(pc, W - 31, H - 3, 2, 24, f);
    emitters = tops.map(([x, y]) => ({ x, y, kind: 'steam' as const, rate: 3, spread: 3 }));
    // plinth (the reactors sit in a semi-buried pool building)
    const px1 = W - 34;
    const pTop = H - 16;
    pc.rect(2, pTop, px1 - 2, H - 3 - pTop, C.ink8);
    pc.hline(2, pTop, px1 - 2, C.white);
    pc.hline(2, pTop + 1, px1 - 2, C.ink9);
    pc.rect(2, H - 7, px1 - 2, 4, C.ink7);
    facadeShade(pc, 2, pTop, px1 - 2, H - 3 - pTop, C.ink8, C.ink7);
    // modules
    const span = px1 - 10;
    const step = Math.floor(span / n);
    const mw = Math.min(14, step - 3);
    for (let i = 0; i < n; i++) {
      const mx = 8 + i * step;
      containment(pc, mx, pTop, mw, 13, CONCRETE);
      pc.rect(mx, pTop - 9, mw, 2, C.org1);
      pc.hline(mx, pTop - 9, mw, C.yel0);
      const on = (f + i) % 4 !== 0;
      pc.set(mx + Math.floor(mw / 2), pTop - 4, on ? C.cyn5 : C.cyn2);
      if (on) g.set(mx + Math.floor(mw / 2), pTop - 4, C.cyn5);
      drawText(pc, String(i + 1), mx + Math.floor(mw / 2) - 1, pTop - 15 + (mw < 12 ? 1 : 0), C.ink6);
    }
    sunLogo(pc, g, 10, H - 11);
    drawText(pc, 'LITTLE SUN', 17, H - 13, C.org0);
    // control building
    const cx = W - 32;
    pc.rect(cx, H - 18, 30, 15, C.ink9);
    pc.hline(cx, H - 18, 30, C.white);
    windowGrid(pc, g, cx + 3, H - 15, 6, 2, { ww: 2, wh: 2, gx: 2, gy: 3, seed: 11, lit: 0.75, glass: C.blu2 });
    facadeShade(pc, cx, H - 18, 30, 15, C.ink9, C.ink8);
    signPlate(pc, g, label.slice(0, 3).toUpperCase(), cx + 3, H - 9, C.yel0);
    fence(pc, 0, H - 8, 4);
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, emitters, fps: 2 };
}

// ── big reactor ────────────────────────────────────────────────────────────────────────────
export function reactor(label: string): FacilityArt {
  const [W, H] = facilitySize('reactor');
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // two hyperbolic towers: the far one hazier
    const b = coolingTower(pc, 212, H - 3, 100, 26, HAZE);
    const a = coolingTower(pc, 166, H - 3, 114, 32, CONCRETE, { band: C.red3 });
    beacon(pc, g, Math.round(166 - a.half) + 1, a.top - 1, f === 0);
    beacon(pc, g, Math.round(166 + a.half) - 1, a.top - 1, f === 1);
    beacon(pc, g, Math.round(212 + b.half) - 1, b.top - 1, f === 0);
    floodWash(pc, g, 132, H - 56, 68, 53, 0.5);
    floodWash(pc, g, 196, H - 44, 44, 41, 0.35);
    emitters = [
      ...[-0.55, -0.15, 0.25, 0.6].map((k) => ({ x: 166 + k * a.half, y: a.top - 1, kind: 'steam' as const, rate: 3, spread: 3, size: 5 })),
      ...[-0.4, 0.1, 0.55].map((k) => ({ x: 212 + k * b.half, y: b.top - 1, kind: 'steam' as const, rate: 2.4, spread: 3, size: 5 })),
    ];
    // vent stack
    stack(pc, g, 80, 20, H - 3, 4, true, f === 1);
    // containment
    containment(pc, 24, H - 3, 50, 56, CONCRETE);
    pc.hline(22, H - 60, 54, C.ink7);
    // aux & fuel buildings around the base
    pc.rect(14, H - 24, 72, 21, C.ink7);
    pc.hline(14, H - 24, 72, C.ink9);
    windowGrid(pc, g, 18, H - 20, 13, 2, { ww: 3, wh: 2, gx: 2, gy: 4, seed: 21, lit: 0.55 });
    facadeShade(pc, 14, H - 24, 72, 21, C.ink7, C.ink6);
    // turbine hall in front of the towers
    const hx = 86;
    const hw = 58;
    const top = H - 42;
    pc.rect(hx, top, hw, H - 3 - top, C.ink8);
    for (let x = hx + 2; x < hx + hw; x += 4) pc.vline(x, top + 3, H - 6 - top, C.ink7);
    pc.hline(hx - 1, top - 1, hw + 2, C.white);
    pc.hline(hx - 1, top, hw + 2, C.ink9);
    pc.rect(hx, top + 5, hw, 6, C.ink2);
    for (let x = hx + 1; x < hx + hw - 1; x += 3) {
      pc.rect(x, top + 6, 2, 4, C.blu3);
      if (hash2(x, 3, 33) > 0.2) g.rect(x, top + 6, 2, 4, hash2(x, 4, 33) > 0.4 ? C.yel1 : C.yel2);
    }
    facadeShade(pc, hx, top, hw, H - 3 - top, C.ink8, C.ink7);
    // big roller door and the generator transformers
    pc.rect(hx + 6, H - 17, 14, 14, C.ink5);
    for (let y = H - 16; y < H - 3; y += 2) pc.hline(hx + 7, y, 12, C.ink4);
    signPlate(pc, g, `${label.slice(0, 3).toUpperCase()} NUCLEAR`, hx + 24, H - 30, C.cyn5);
    transformerYard(pc, 2, H - 3, 1, true);
    // lamps on the turbine hall roof
    for (let x = hx + 4; x < hx + hw; x += 14) {
      pc.set(x, top - 2, C.yel1);
      g.set(x, top - 2, C.yel1);
    }
    fence(pc, 0, H - 8, 14);
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, emitters, fps: 1 };
}

// ── packaging plant ────────────────────────────────────────────────────────────────────────
export function packaging(label: string, tier: number, opts: { W?: number; accent?: number; accentHi?: number; sign?: string } = {}): FacilityArt {
  const [W0, H] = facilitySize('packaging', tier);
  const W = opts.W ?? W0;
  const accent = opts.accent ?? C.blu4;
  const accentHi = opts.accentHi ?? C.blu5;
  const officeW = tier >= 2 || opts.W ? 30 : 0;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const hx = officeW;
    const hw = W - 22 - officeW;
    const top = H - 26 - (tier - 1) * 3;
    // sawtooth roof (north-light glazing glows at night)
    for (let x = hx; x < hx + hw; x += 10) {
      for (let k = 0; k < 10 && x + k < hx + hw; k++) {
        const hgt = Math.max(0, 5 - Math.floor(k / 2));
        for (let j = 0; j < hgt; j++) pc.set(x + k, top - 1 - j, k === 0 ? C.sky4 : C.ink8);
        if (k === 0) {
          for (let j = 0; j < 5; j++) {
            pc.set(x, top - 1 - j, C.sky4);
            pc.set(x + 1, top - 1 - j, j > 0 && j < 4 ? C.blu5 : C.ink8);
            g.set(x, top - 1 - j, C.ice3);
          }
        }
      }
    }
    // walls
    pc.rect(hx, top, hw, H - 3 - top, C.ink9);
    for (let x = hx + 7; x < hx + hw; x += 8) pc.vline(x, top + 4, H - 7 - top, C.ink8);
    pc.rect(hx, top, hw, 3, accent);
    pc.hline(hx, top + 3, hw, accentHi);
    // window band onto the lines
    const by = top + 7;
    pc.rect(hx + 4, by, hw - 8, 8, C.ice2);
    g.rect(hx + 4, by, hw - 8, 8, C.ice3);
    pc.hline(hx + 4, by + 6, hw - 8, C.ink4);
    for (let x = hx + 6; x < hx + hw - 10; x += 12) {
      pc.rect(x, by + 2, 5, 4, C.ink5);
      pc.hline(x, by + 2, 5, C.ink6);
      g.rect(x, by + 2, 5, 4, 0);
      pc.set(x + 2, by + 3, (f + x) % 2 ? C.grn6 : C.org1);
      g.set(x + 2, by + 3, (f + x) % 2 ? C.grn6 : C.org1);
    }
    for (let x = hx + 4 + ((f * 2) % 6); x < hx + hw - 5; x += 6) {
      pc.rect(x, by + 4, 2, 2, C.cyn4);
      g.rect(x, by + 4, 2, 2, C.cyn5);
    }
    for (let x = hx + 4; x < hx + hw - 4; x += 16) {
      pc.vline(x, by, 8, C.ink8);
      g.vline(x, by, 8, 0);
    }
    pc.rect(hx, H - 6, hw, 3, C.ink7);
    facadeShade(pc, hx, top, hw, H - 3 - top, C.ink9, C.ink8, 0.7);
    // entrance + sign
    const ex = hx + 8;
    pc.rect(ex, H - 11, 10, 8, C.cyn1);
    g.rect(ex + 1, H - 10, 8, 7, C.cyn4);
    pc.hline(ex - 2, H - 12, 14, accent);
    const sign = opts.sign ?? `${label.slice(0, 3).toUpperCase()} PKG`;
    signPlate(pc, g, sign, ex + 16, H - 13, accentHi);
    // office block
    if (officeW) {
      const otop = top - 6;
      pc.rect(0, otop, officeW, H - 3 - otop, C.ink6);
      pc.hline(0, otop, officeW, C.ink8);
      windowGrid(pc, g, 3, otop + 4, 6, Math.floor((H - 8 - otop) / 6), { ww: 3, wh: 3, gx: 1, gy: 3, seed: 17, lit: 0.7, glass: C.blu2 });
      facadeShade(pc, 0, otop, officeW, H - 3 - otop, C.ink6, C.ink5);
      fanUnit(pc, 4, otop - 4, 10, f);
      fanUnit(pc, 16, otop - 4, 10, f + 1);
    }
    // nitrogen tanks
    tank(pc, W - 20, H - 3, 8, 28, STEEL, false, accent);
    tank(pc, W - 10, H - 3, 8, 24, STEEL, true, accent);
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 30, H] }, fps: 4 };
}

// ── fab ────────────────────────────────────────────────────────────────────────────────────
export interface FabOpts {
  W?: number;
  H?: number;
  accent?: number;
  accentHi?: number;
  sign?: string;
  variant?: 'logic' | 'memory';
}

export function fab(label: string, opts: FabOpts = {}): FacilityArt {
  const [W0, H0] = facilitySize('fab');
  const W = opts.W ?? W0;
  const H = opts.H ?? H0;
  const accent = opts.accent ?? C.cyn4;
  const accentHi = opts.accentHi ?? C.cyn5;
  const memory = opts.variant === 'memory';
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  const bx = 44;
  const cubW = 46;
  const bw = W - bx - cubW;
  const top = H - 64;
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    emitters = [];
    // ultrapure-water tanks
    tank(pc, 2, H - 3, 12, 34, ICE, false, C.blu4);
    tank(pc, 15, H - 3, 12, 30, ICE, true, C.blu4);
    tank(pc, 28, H - 3, 12, 26, ICE, false, C.blu4);
    drawText(pc, 'UPW', 4, H - 30, C.blu3);
    // chemical tanks in front
    for (let i = 0; i < 3; i++) tank(pc, 3 + i * 8, H - 3, 6, 9, STEEL, false);
    // main cleanroom block (windowless)
    const steps = memory ? [[bx, top, Math.round(bw * 0.58)], [bx + Math.round(bw * 0.58), top + 10, bw - Math.round(bw * 0.58)]] : [[bx, top, bw]];
    for (const [x, y, w] of steps) {
      pc.rect(x, y, w, H - 3 - y, C.ink9);
      // mechanical floor band
      for (let yy = y; yy < y + 10; yy++) pc.hline(x, yy, w, yy % 2 ? C.ink7 : C.ink8);
      pc.hline(x, y, w, C.white);
      pc.rect(x, y + 10, w, 2, accent);
      // panel joints
      for (let yy = y + 20; yy < H - 6; yy += 9) pc.hline(x + 1, yy, w - 2, C.ink8);
      for (let xx = x + 18; xx < x + w; xx += 18) pc.vline(xx, y + 12, H - 15 - y, C.ink8);
      pc.rect(x, H - 7, w, 4, C.ink7);
      facadeShade(pc, x, y, w, H - 3 - y, C.ink9, C.ink8, 0.55);
      pc.vline(x, y, H - 3 - y, C.white);
    }
    // logo
    const sign = opts.sign ?? `${label.slice(0, 3).toUpperCase()} FAB`;
    const lw = measureText(sign) * 2;
    const lx = bx + Math.max(8, Math.round((Math.round(bw * (memory ? 0.58 : 1)) - lw) / 2));
    pc.rect(lx - 4, top + 17, lw + 8, 15, C.ink1);
    bigText(pc, g, sign, lx, top + 20, accentHi);
    if (memory) {
      // stacked-die mark: four memory dies on a base
      const mx = bx + Math.round(bw * 0.58) + 10;
      const my = top + 22;
      for (let k = 0; k < 4; k++) {
        pc.rect(mx, my + k * 3, 14, 2, k % 2 ? accentHi : accent);
        g.rect(mx, my + k * 3, 14, 2, k % 2 ? accentHi : accent);
      }
      pc.rect(mx - 2, my + 12, 18, 2, C.ink3);
    }
    // exhaust stacks and scrubbers on the roof
    const nStacks = Math.max(3, Math.floor(bw / 30));
    for (let k = 0; k < nStacks; k++) {
      const sx = bx + 12 + Math.round(k * ((bw - 24) / Math.max(1, nStacks - 1)));
      const roof = memory && sx >= bx + Math.round(bw * 0.58) ? top + 10 : top;
      const st = roof - 20 - (k % 2) * 5;
      stack(pc, g, sx, st, roof, 3, false, (f + k) % 2 === 0);
      emitters.push({ x: sx + 1, y: st - 2, kind: 'vapor', rate: 1.4 });
      if (k < nStacks - 1) fanUnit(pc, sx + 8, roof - 4, 10, f + k);
    }
    // glazed entrance link with gowning-room glow
    pc.rect(bx - 4, H - 15, 34, 12, C.blu2);
    pc.hline(bx - 5, H - 16, 36, C.ink8);
    for (let x = bx - 3; x < bx + 29; x += 4) {
      pc.rect(x, H - 13, 3, 8, C.sky4);
      g.rect(x, H - 13, 3, 8, x % 8 ? C.cyn5 : C.yel1);
    }
    // central utility building with cooling cells
    const cx = W - cubW;
    pc.rect(cx, H - 30, cubW - 2, 27, C.ink7);
    pc.hline(cx, H - 30, cubW - 2, C.ink8);
    for (let y = H - 26; y < H - 6; y += 3) pc.hline(cx + 2, y, cubW - 6, C.ink6);
    facadeShade(pc, cx, H - 30, cubW - 2, 27, C.ink7, C.ink6);
    const tops = coolingCells(pc, cx + 2, H - 30, 3, 9, f);
    for (const [x, y] of tops) emitters.push({ x, y, kind: 'steam', rate: 2.4, spread: 3 });
    // loading dock
    pc.rect(cx + 18, H - 14, 14, 11, C.ink2);
    for (let y = H - 13; y < H - 3; y += 2) pc.hline(cx + 19, y, 12, C.ink3);
    pc.set(cx + 25, H - 16, C.yel1);
    g.set(cx + 25, H - 16, C.yel1);
    // bulk gas pipe rack between the CUB and the fab
    pipe(pc, cx - 6, H - 22, 10, H - 3, C.ink8, C.ink6, 5);
    pipe(pc, cx - 6, H - 19, 10, null, C.grn6, C.grn4);
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - cubW + 18, H] }, emitters, fps: 2 };
}

// ── gigawatt campus ────────────────────────────────────────────────────────────────────────
export function campus(label: string): FacilityArt {
  const [W, H] = facilitySize('campus');
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  const towers = [
    { x: 26, w: 78, top: 20, floors: 5 },
    { x: 128, w: 96, top: 6, floors: 6 },
    { x: 250, w: 82, top: 24, floors: 5 },
  ];
  const fronts = [
    { x: 0, w: 122 },
    { x: 128, w: 108 },
    { x: 242, w: 94 },
  ];
  const fTop = H - 40;
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    emitters = [];
    // back row: tall multi-storey hall blocks
    towers.forEach((t, i) => hallBlock(pc, g, t.x, t.top, t.w, fTop + 4, f, { floors: t.floors, seed: i * 7 + 1, beacons: true }));
    // giant sign on the tallest block
    const t1 = towers[1];
    const txt = label.slice(0, 3).toUpperCase();
    const tw = measureText(txt) * 2;
    pc.rect(t1.x + 8, t1.top + 4, tw + 8, 15, C.ink1);
    bigText(pc, g, txt, t1.x + 12, t1.top + 7, C.cyn5);
    // cooling-cell bank (steaming)
    const tops = coolingCells(pc, 344, H - 3, 6, 30, f);
    for (const [x, y] of tops) emitters.push({ x, y, kind: 'steam', rate: 2.2, spread: 3 });
    beacon(pc, g, 344, H - 34, f % 2 === 0);
    beacon(pc, g, 344 + 6 * 14 - 1, H - 34, f % 2 === 1);
    // front row: two-storey halls
    fronts.forEach((h, i) => {
      hallBlock(pc, g, h.x, fTop, h.w, H - 3, f, { floors: 2, seed: 30 + i, core: false });
      // loading dock
      const dx = h.x + h.w - 22;
      pc.rect(dx, H - 15, 15, 12, C.ink2);
      for (let y = H - 14; y < H - 3; y += 2) pc.hline(dx + 1, y, 13, C.ink3);
      pc.rect(dx - 2, H - 17, 19, 2, C.ink6);
      g.set(dx + 7, H - 18, C.yel1);
    });
    // NOC lobby with a glowing entrance
    pc.rect(30, H - 14, 26, 11, C.cyn1);
    pc.hline(28, H - 15, 30, C.ink8);
    g.rect(31, H - 13, 24, 9, C.cyn4);
    for (let x = 33; x < 55; x += 5) {
      pc.vline(x, H - 13, 9, C.ink8);
      g.vline(x, H - 13, 9, 0);
    }
    signPlate(pc, g, 'GW CAMPUS', 60, H - 15, C.cyn5);
    // substation in front of the cooling bank
    transformerYard(pc, 352, H - 3, 3, true);
    // genset row
    for (let x = 392; x < W - 4; x += 12) {
      pc.rect(x, H - 9, 10, 6, C.ink6);
      pc.hline(x, H - 9, 10, C.ink8);
      pc.vline(x + 7, H - 12, 3, C.ink5);
    }
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [fronts[1].x + fronts[1].w - 22, H] }, emitters, fps: 3 };
}
