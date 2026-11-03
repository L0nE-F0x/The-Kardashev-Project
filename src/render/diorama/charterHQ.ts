/**
 * The Charter HQ in Geneva (Act III): the Council hall — a glass-and-timber gridshell dome over a
 * timber colonnade — behind the flags of the twelve blocs, the secretariat's vertical forest, a
 * lakeside plaza and a jetty on Lake Geneva. Plus the Geneva bands: the Alps with Mont Blanc, the
 * lake with its far shore, the Jet d'Eau and sailboats. The hopeful centre of the world.
 */
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { FacilityArt } from './art';
import { facadeShade, floodWash } from './draw';
import { BLOC_FLAGS, BLOC_ORDER, blocFlagAt, CHARTER, emblem, festoon, flagOnPole, lushTree, person, planter, seated, solarCanopy } from './act3kit';

/** Light-stone paving along the bottom of every HQ piece (instead of a dirt strip). */
function paving(pc: PixelCanvas, x0: number, W: number, H: number) {
  for (let y = H - 3; y < H; y++) {
    for (let x = x0; x < W; x++) pc.set(x, y, y === H - 3 ? C.ink9 : (x >> 2) % 2 === (y & 1) ? C.ink8 : C.ink7);
  }
}

// ── the Council hall ───────────────────────────────────────────────────────────────────────
export const COUNCIL_W = 190;
export const COUNCIL_H = 114;

/**
 * Glass dome with a diamond timber gridshell, lit from the upper left. The glow canvas gets the
 * warm interior light through the glass (the lattice stays dark).
 */
function gridDome(pc: PixelCanvas, g: PixelCanvas, cx: number, baseY: number, A: number, B: number) {
  const L = [-0.55, 0.62, 0.56];
  const ll = Math.hypot(L[0], L[1], L[2]);
  for (let y = Math.floor(baseY - B); y < baseY; y++) {
    for (let x = Math.floor(cx - A); x <= Math.ceil(cx + A); x++) {
      const nx = (x + 0.5 - cx) / A;
      const ny = (baseY - (y + 0.5)) / B;
      if (nx * nx + ny * ny > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const d = (nx * L[0] + ny * L[1] + nz * L[2]) / ll;
      // the glass mirrors the sky: brighter where it faces the light, a hot spot up top-left
      let c: number;
      if (d > 0.93) c = ditherAt(x, y, (d - 0.93) * 14) ? C.white : C.sky5;
      else if (d > 0.78) c = ditherAt(x, y, (d - 0.78) * 6.6) ? C.sky5 : C.sky4;
      else if (d > 0.55) c = ditherAt(x, y, (d - 0.55) * 4.3) ? C.sky4 : C.sky3;
      else if (d > 0.3) c = ditherAt(x, y, (d - 0.3) * 4) ? C.sky3 : C.blu4;
      else c = ditherAt(x, y, Math.max(0, d + 0.1) * 2.5) ? C.blu4 : C.blu3;
      // the sky's horizon mirrored low on the dome
      if (ny < 0.22 && d > 0.2 && bayer(x, y) < 5) c = C.sky5;
      pc.set(x, y, c);
      // interior light through the glass at night: warm, brightest low down
      const warm = ny < 0.45 ? C.yel1 : ny < 0.8 ? C.yel0 : C.org2;
      g.set(x, y, bayer(x, y) < 3 && ny > 0.3 ? C.org2 : warm);
    }
  }
  // the gridshell: two families of helical ribs + three rings, front half only
  const timber = (nx: number, ny: number, nz: number) => {
    const d = (nx * L[0] + ny * L[1] + nz * L[2]) / ll;
    return d > 0.7 ? C.snd5 : d > 0.4 ? C.snd4 : d > 0.1 ? C.snd3 : C.snd2;
  };
  const plot = (lon: number, lat: number) => {
    if (Math.abs(lon) > Math.PI / 2) return;
    const nx = Math.cos(lat) * Math.sin(lon);
    const ny = Math.sin(lat);
    const nz = Math.cos(lat) * Math.cos(lon);
    const x = Math.round(cx - 0.5 + nx * A);
    const y = Math.round(baseY - 0.5 - ny * B);
    pc.set(x, y, timber(nx, ny, nz));
    g.set(x, y, 0);
  };
  for (let k = -9; k <= 9; k++) {
    const l0 = (k * Math.PI) / 6.5;
    for (let s = 0; s < Math.PI / 2 - 0.16; s += 0.004) {
      plot(l0 + s * 1.05, s);
      plot(l0 - s * 1.05, s);
    }
  }
  for (const lat of [0.5, 1.0]) for (let lon = -Math.PI / 2; lon <= Math.PI / 2; lon += 0.004) plot(lon, lat);
  // a solid timber ring beam at the base
  for (let x = Math.round(cx - A); x <= Math.round(cx + A); x++) {
    pc.set(x, baseY - 1, x < cx - A * 0.3 ? C.snd5 : C.snd4);
    g.set(x, baseY - 1, 0);
  }
}

/** The Council hall: podium, timber colonnade, inscription, bloc frieze, dome, lantern, flags. */
export function councilHall(): FacilityArt {
  const W = COUNCIL_W;
  const H = COUNCIL_H;
  const cx = Math.floor(W / 2);
  const lanternTop = 8;
  const domeTop = 16;
  const B = 37;
  const A = 60;
  const domeBase = domeTop + B; // cornice row
  const friezeY = domeBase + 1;
  const entY = friezeY + 2; // entablature rows [entY, entY + 7)
  const drumTop = entY + 7;
  const drumBot = H - 16;
  const drumX = cx - 66;
  const drumW = 132;
  const upperY = H - 16;
  const lowerY = H - 10;
  const base = new PixelCanvas(W, H);
  const baseG = new PixelCanvas(W, H);
  const pc = base;
  const g = baseG;
  // ── podium ──
  pc.rect(10, lowerY, W - 20, H - 3 - lowerY, C.ink8);
  pc.hline(10, lowerY, W - 20, C.white);
  for (let y = lowerY + 2; y < H - 3; y += 3) pc.hline(10, y, W - 20, C.ink7);
  pc.rect(20, upperY, W - 40, lowerY - upperY, C.ink9);
  pc.hline(20, upperY, W - 40, C.white);
  pc.hline(20, lowerY - 1, W - 40, C.ink7);
  facadeShade(pc, 10, lowerY, W - 20, H - 3 - lowerY, C.ink8, C.ink7, 0.7);
  // ── drum: timber colonnade with glass between ──
  for (let y = drumTop; y < drumBot; y++) {
    for (let x = drumX; x < drumX + drumW; x++) {
      const t = (y - drumTop) / (drumBot - drumTop);
      let c = t < 0.15 ? C.blu3 : C.blu2;
      if (hash2(x >> 2, 3, 41) > 0.82 && (x + y) % 9 < 2) c = C.sky4; // sky reflections
      pc.set(x, y, c);
      // interior: two levels of warm light, the debating floor brighter, bay by bay
      const lower = y > drumTop + (drumBot - drumTop) * 0.48;
      const bay = hash2(Math.floor((x - drumX) / 11), lower ? 1 : 2, 23);
      if (!lower && bay < 0.3) {
        if (bayer(x, y) < 6) g.set(x, y, C.org1);
      } else g.set(x, y, lower ? (bayer(x, y) < 3 + bay * 4 ? C.yel0 : C.yel1) : bayer(x, y) < 4 + bay * 8 ? C.org2 : C.yel0);
    }
  }
  const mid = drumTop + Math.round((drumBot - drumTop) * 0.46);
  pc.hline(drumX, mid, drumW, C.ink6);
  g.hline(drumX, mid, drumW, 0);
  // tiered seats seen through the glass (the hemicycle)
  for (let r = 0; r < 4; r++) {
    const y = drumBot - 3 - r * 3;
    const half = 30 + r * 8;
    for (let x = cx - half; x <= cx + half; x++) {
      if (x < drumX || x >= drumX + drumW) continue;
      pc.set(x, y + Math.round(((x - cx) / half) ** 2 * 2), C.ink3);
    }
  }
  for (let k = 0; k < 14; k++) {
    const x = drumX + 6 + Math.floor(hash2(k, 7, 3) * (drumW - 12));
    const y = mid + 4 + Math.floor(hash2(k, 8, 3) * 8);
    pc.set(x, y, C.ink2);
    pc.set(x, y + 1, C.ink2);
    g.set(x, y, 0);
    g.set(x, y + 1, 0);
  }
  // columns
  const entrance = { x: cx - 9, w: 18 };
  for (let x = drumX; x < drumX + drumW; x += 11) {
    if (x > entrance.x - 3 && x < entrance.x + entrance.w) continue;
    for (let y = drumTop; y < drumBot; y++) {
      pc.set(x, y, C.snd6);
      pc.set(x + 1, y, C.snd5);
      pc.set(x + 2, y, C.snd3);
      g.set(x, y, 0);
      g.set(x + 1, y, 0);
      g.set(x + 2, y, 0);
    }
    pc.hline(x - 1, drumTop, 5, C.white);
    pc.hline(x - 1, drumBot - 1, 5, C.ink9);
  }
  pc.vline(drumX + drumW - 1, drumTop, drumBot - drumTop, C.snd3);
  // the entrance: a tall glazed door under a timber canopy
  pc.rect(entrance.x, drumTop + 8, entrance.w, drumBot - drumTop - 8, C.cyn1);
  g.rect(entrance.x + 1, drumTop + 9, entrance.w - 2, drumBot - drumTop - 9, C.cyn4);
  for (let x = entrance.x; x <= entrance.x + entrance.w; x += 6) {
    pc.vline(x, drumTop + 8, drumBot - drumTop - 8, C.snd4);
    g.vline(x, drumTop + 8, drumBot - drumTop - 8, 0);
  }
  pc.hline(entrance.x - 4, drumTop + 7, entrance.w + 9, C.snd5);
  pc.hline(entrance.x - 4, drumTop + 6, entrance.w + 9, C.snd6);
  g.hline(entrance.x - 4, drumTop + 6, entrance.w + 9, 0);
  g.hline(entrance.x - 4, drumTop + 7, entrance.w + 9, 0);
  emblem(pc, g, cx - 7, drumTop + 10, true);
  // ── entablature with the inscription ──
  pc.rect(drumX - 2, entY, drumW + 4, 7, C.ink9);
  pc.hline(drumX - 2, entY, drumW + 4, C.white);
  pc.hline(drumX - 2, entY + 6, drumW + 4, C.ink7);
  const words = 'THE KARDASHEV PROJECT';
  const tw = measureText(words);
  drawText(pc, words, cx - Math.floor(tw / 2), entY + 1, C.ink3);
  drawText(g, words, cx - Math.floor(tw / 2), entY + 1, C.yel1);
  facadeShade(pc, drumX - 2, entY, drumW + 4, 7, C.ink9, C.ink8, 0.78);
  // ── the frieze: one panel per bloc, in its flag colour ──
  for (let i = 0; i < 12; i++) {
    const x0 = drumX + Math.round((i * drumW) / 12);
    const x1 = drumX + Math.round(((i + 1) * drumW) / 12);
    const f = BLOC_FLAGS[BLOC_ORDER[i]];
    for (let x = x0; x < x1; x++) {
      pc.set(x, friezeY, f.a);
      pc.set(x, friezeY + 1, x === x0 ? C.ink9 : f.b === C.white ? f.a : f.b);
      g.set(x, friezeY, f.a);
    }
  }
  // cornice
  pc.hline(drumX - 6, domeBase, drumW + 12, C.white);
  // ── the dome ──
  gridDome(pc, g, cx, domeBase, A, B);
  // a planted ring at the dome's foot (a roof garden all the way round)
  for (let x = cx - A - 4; x <= cx + A + 4; x++) {
    if (x < drumX - 6 || x >= drumX + drumW + 6) continue;
    const hgt = hash2(x, 1, 51) > 0.6 ? 2 : 1;
    for (let j = 0; j < hgt; j++) pc.set(x, domeBase - 1 - j, j === hgt - 1 && hash2(x, 2, 51) > 0.5 ? C.grn6 : C.grn4);
    if (hash2(x, 3, 51) < 0.05) pc.set(x, domeBase - 2, C.pnk1);
  }
  // ── lantern + the Charter flag ──
  pc.rect(cx - 4, lanternTop + 2, 9, domeTop - lanternTop, C.sky4);
  g.rect(cx - 4, lanternTop + 2, 9, domeTop - lanternTop, C.yel2);
  for (let x = cx - 4; x <= cx + 4; x += 4) {
    pc.vline(x, lanternTop + 2, domeTop - lanternTop, C.snd4);
    g.vline(x, lanternTop + 2, domeTop - lanternTop, 0);
  }
  pc.hline(cx - 5, lanternTop + 1, 11, C.snd5);
  pc.hline(cx - 4, lanternTop, 9, C.snd6);
  pc.vline(cx, 0, lanternTop, C.ink7);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) pc.set(cx + 1 + i, 1 + j, (i === 2 || i === 3) && (j === 1 || j === 2) ? C.white : CHARTER.field);
  // ── planters with trees at both ends of the podium ──
  for (const tx of [16, W - 17]) {
    pc.rect(tx - 5, upperY - 3, 11, 3, C.snd4);
    pc.hline(tx - 5, upperY - 3, 11, C.snd5);
    lushTree(pc, tx, upperY - 3, 7, tx, 2);
  }
  // ── steps up to the entrance ──
  for (let y = upperY; y < H - 3; y++) {
    const inset = Math.floor((y - upperY) / 2);
    const x0 = entrance.x - 12 - inset;
    const x1 = entrance.x + entrance.w + 12 + inset;
    for (let x = x0; x < x1; x++) pc.set(x, y, (y - upperY) % 2 === 0 ? C.white : C.ink8);
  }
  // floodlights wash the colonnade from below
  floodWash(pc, g, drumX, drumTop, drumW, drumBot - drumTop, 0.25);
  // people on the steps and the podium
  for (const [k, x] of [[1, cx - 26], [2, cx - 22], [3, cx + 17], [4, cx + 24], [5, 34], [6, W - 40]] as [number, number][]) {
    person(pc, x, k < 5 ? H - 3 : upperY, k + 40, k % 3 === 0 ? 1 : 0);
  }
  paving(pc, 0, W, H);
  // ── flag alley: six flags each side of the steps, waving ──
  const poles: [number, (typeof BLOC_ORDER)[number]][] = [];
  const left = [14, 24, 34, 44, 54, 64];
  const right = [W - 72, W - 62, W - 52, W - 42, W - 32, W - 22];
  BLOC_ORDER.forEach((id, i) => poles.push([i < 6 ? left[i] : right[i - 6], id]));
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const fp = base.clone();
    const fg = baseG.clone();
    for (const [i, [x, id]] of poles.entries()) {
      flagOnPole(fp, x, H - 3, 36, 8, 5, (f + i) % 4, (a, b) => blocFlagAt(id, a, b, 8, 5));
      fp.set(x - 1, H - 4, C.ink6);
      fp.set(x + 1, H - 4, C.ink6);
      // each flag is spot-lit at night
      fg.set(x, H - 40, C.yel1);
      for (let j = 0; j < 5; j++) for (let a = 0; a < 8; a++) if (bayer(x + a, j) < 3) fg.set(x + 1 + a, H - 39 + j, blocFlagAt(id, a, j, 8, 5));
    }
    frames.push(fp);
    glows.push(fg);
  }
  return { base: frames, glow: glows, points: {}, fps: 3 };
}

// ── the secretariat: a timber-and-glass slab with a vertical forest ───────────────────────
export function secretariat(): FacilityArt {
  const W = 106;
  const H = 100;
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const tx = 4;
  const tw = 66;
  const storeys = 7;
  const sh = 10;
  const lobbyH = 11;
  const top = H - 3 - lobbyH - storeys * sh;
  const wingX = tx + tw;
  const wingW = W - wingX - 3;
  const wingTop = H - 3 - lobbyH - 3 * sh;
  const facade = (x0: number, w: number, y0: number, n: number, seed: number) => {
    for (let s = 0; s < n; s++) {
      const y = y0 + s * sh;
      // slab edge
      pc.hline(x0, y, w, C.ink9);
      pc.hline(x0, y + 1, w, C.ink7);
      for (let yy = y + 2; yy < y + sh; yy++) {
        for (let x = x0; x < x0 + w; x++) {
          const fin = (x - x0) % 5;
          let c: number;
          if (fin === 0) c = C.snd5;
          else if (fin === 1) c = C.snd4;
          else c = (x + yy + s) % 11 === 0 ? C.sky4 : yy < y + 4 ? C.blu3 : C.blu2;
          pc.set(x, yy, c);
        }
      }
      // lights, clustered by floor
      const floorOn = hash2(s, seed, 3);
      for (let x = x0 + 2; x < x0 + w - 1; x += 5) {
        if (hash2(x, s, seed) < 0.25 + floorOn * 0.6) g.rect(x, y + 3, 3, sh - 4, hash2(x, s, seed + 1) > 0.75 ? C.ice2 : hash2(x, s, seed + 2) > 0.5 ? C.yel1 : C.yel0);
      }
      // balcony planters with greenery spilling over the slab
      for (let x = x0 + 1; x < x0 + w - 3; x += 5) {
        const r = hash2(x, s, seed + 7);
        if (r < 0.35) continue;
        pc.hline(x, y + sh - 1, 4, C.snd3);
        for (let i = 0; i < 4; i++) {
          if (hash2(x + i, s, seed + 8) > 0.35) pc.set(x + i, y + sh - 2, i % 2 ? C.grn5 : C.grn4);
          if (hash2(x + i, s, seed + 9) > 0.7) pc.set(x + i, y + sh, C.grn3); // trailing plants
        }
        if (r > 0.82) lushTree(pc, x + 2, y + sh - 1, 2, x + s * 13, hash2(x, s, 5) > 0.6 ? 2 : 0);
      }
    }
  };
  // the tower
  facade(tx, tw, top, storeys, 3);
  facadeShade(pc, tx, top, tw, storeys * sh, C.blu2, C.blu1, 0.6);
  facadeShade(pc, tx, top, tw, storeys * sh, C.snd5, C.snd4, 0.7);
  pc.vline(tx + tw - 1, top, storeys * sh, C.ink6);
  // the wing
  facade(wingX, wingW, wingTop, 3, 9);
  facadeShade(pc, wingX, wingTop, wingW, 3 * sh, C.blu2, C.blu1, 0.4);
  // roofs: a solar pergola and a roof garden on the tower, a meadow on the wing
  pc.hline(tx - 1, top - 1, tw + 2, C.ink8);
  solarCanopy(pc, tx + 2, top - 1, tw - 22, 4);
  lushTree(pc, tx + tw - 14, top - 1, 4, 61, 1);
  lushTree(pc, tx + tw - 6, top - 1, 3, 62);
  pc.hline(wingX, wingTop - 1, wingW, C.grn4);
  for (let x = wingX; x < wingX + wingW; x++) if (hash2(x, 4, 4) > 0.5) pc.set(x, wingTop - 2, hash2(x, 5, 4) > 0.8 ? C.yel1 : C.grn5);
  lushTree(pc, wingX + 7, wingTop - 1, 4, 64, 2);
  lushTree(pc, wingX + 22, wingTop - 1, 3, 65);
  person(pc, wingX + 13, wingTop - 1, 66);
  // a small wind turbine on the tower roof is a cliché; a mast with the Charter flag is not
  pc.vline(tx + 6, top - 16, 15, C.ink7);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) pc.set(tx + 7 + i, top - 16 + j, (i === 2 || i === 3) && (j === 1 || j === 2) ? C.white : CHARTER.field);
  // lobby: glazed, with a timber canopy and the sign
  const ly = H - 3 - lobbyH;
  pc.rect(tx, ly, W - tx - 3, lobbyH, C.cyn1);
  g.rect(tx + 1, ly + 2, W - tx - 5, lobbyH - 2, C.cyn4);
  for (let x = tx; x < W - 3; x += 7) {
    pc.vline(x, ly, lobbyH, C.snd4);
    g.vline(x, ly, lobbyH, 0);
  }
  pc.hline(tx - 2, ly, W - tx + 1, C.snd6);
  pc.hline(tx - 2, ly + 1, W - tx + 1, C.snd4);
  g.hline(tx - 2, ly, W - tx + 1, 0);
  const sign = 'SECRETARIAT';
  pc.rect(tx + 8, ly - 1, measureText(sign) + 4, 7, C.ink1);
  drawText(pc, sign, tx + 10, ly, C.yel0);
  drawText(g, sign, tx + 10, ly, C.yel0);
  // people coming and going
  person(pc, tx + 3, H - 3, 71);
  person(pc, W - 16, H - 3, 72, 1);
  planter(pc, W - 12, H - 3, 9);
  paving(pc, 0, W, H);
  return { base: [pc], glow: [g], points: { dock: [W - 26, H] } };
}

// ── the plaza by the lake ──────────────────────────────────────────────────────────────────
export function plaza(): FacilityArt {
  const W = 148;
  const H = 52;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const lamps = [36, 80, 126];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // trees first (behind everything)
    lushTree(pc, 44, H - 3, 8, 3, 2);
    lushTree(pc, 90, H - 3, 9, 4);
    lushTree(pc, 141, H - 3, 6, 5, 1);
    // lamp posts with festoon lights strung between them
    for (const lx of lamps) {
      pc.vline(lx, H - 22, 19, C.ink6);
      pc.rect(lx - 1, H - 23, 3, 1, C.ink7);
      pc.set(lx, H - 22, C.yel1);
      g.set(lx, H - 22, C.yel2);
      g.set(lx - 1, H - 22, C.yel1);
      g.set(lx + 1, H - 22, C.yel1);
    }
    festoon(pc, g, lamps[0], H - 21, lamps[1], H - 21, 4, 1);
    festoon(pc, g, lamps[1], H - 21, lamps[2], H - 21, 5, 2);
    festoon(pc, g, 6, H - 18, lamps[0], H - 21, 3, 3);
    // the fountain: a low round basin with a ring of small dancing jets
    const fx = 18;
    pc.ellipse(fx, H - 5, 13, 3, C.ink9);
    pc.ellipse(fx, H - 5.5, 11.5, 2, C.sea6);
    for (let x = fx - 10; x <= fx + 10; x += 3) pc.set(x + (f % 3), H - 6, C.sea8);
    pc.hline(fx - 12, H - 4, 25, C.ink8);
    for (const [k, jx] of [[0, fx - 7], [1, fx - 3], [2, fx], [3, fx + 3], [4, fx + 7]] as [number, number][]) {
      const jh = (k === 2 ? 9 : k % 2 ? 6 : 4) + ((f + k) % 2);
      for (let j = 0; j < jh; j++) {
        pc.set(jx, H - 7 - j, (j + f + k) % 3 === 0 ? C.foam : C.white);
        g.set(jx, H - 7 - j, C.ice2);
      }
      pc.set(jx + (k < 2 ? -1 : 1), H - 7 - jh + 1, C.foam);
    }
    // the armillary: a bronze-and-gold sphere of rings on a plinth, the Charter's emblem in 3D
    const ax = 62;
    const ay = H - 21;
    pc.rect(ax - 4, H - 11, 9, 8, C.ink8);
    pc.hline(ax - 4, H - 11, 9, C.white);
    pc.vline(ax + 4, H - 11, 8, C.ink7);
    pc.vline(ax, ay + 7, 3, C.org1);
    pc.circle(ax + 0.5, ay + 0.5, 2.6, C.cyn4);
    pc.set(ax - 1, ay - 1, C.grn5);
    pc.set(ax + 1, ay, C.grn5);
    pc.ring(ax + 0.5, ay + 0.5, 7, C.yel0);
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2 + f * 0.2;
      const ex = Math.round(ax + Math.cos(t) * 6.5);
      const ey = Math.round(ay + Math.sin(t) * 2 - Math.cos(t) * 1.5);
      pc.set(ex, ey, Math.sin(t) > 0 ? C.yel1 : C.org1);
      const mx = Math.round(ax + Math.cos(t) * 2.4);
      const my = Math.round(ay + Math.sin(t) * 6.5);
      if (pc.get(mx, my) !== C.cyn4 && pc.get(mx, my) !== C.grn5) pc.set(mx, my, C.org2);
    }
    for (let y = ay - 8; y <= ay + 8; y++) for (let x = ax - 8; x <= ax + 8; x++) if (pc.get(x, y) === C.yel0 || pc.get(x, y) === C.yel1) g.set(x, y, C.yel0);
    // benches with people
    for (const bx of [70, 100]) {
      pc.hline(bx, H - 6, 10, C.snd4);
      pc.set(bx + 1, H - 5, C.ink5);
      pc.set(bx + 8, H - 5, C.ink5);
      pc.set(bx + 1, H - 4, C.ink5);
      pc.set(bx + 8, H - 4, C.ink5);
    }
    seated(pc, 71, H - 6, 11);
    seated(pc, 75, H - 6, 12);
    seated(pc, 102, H - 6, 13);
    // the café: a timber kiosk with a striped awning and parasol tables
    const kx = 110;
    pc.rect(kx, H - 15, 18, 12, C.snd5);
    pc.vline(kx + 17, H - 15, 12, C.snd3);
    for (let x = kx + 2; x < kx + 16; x += 3) pc.vline(x, H - 15, 12, C.snd4);
    pc.rect(kx + 3, H - 12, 12, 4, C.ink2);
    g.rect(kx + 3, H - 12, 12, 4, C.yel1);
    pc.rect(kx + 3, H - 8, 12, 1, C.snd6);
    for (let x = kx - 1; x < kx + 19; x++) {
      const stripe = Math.floor((x - kx + 1) / 3) % 2 ? C.white : C.red3;
      pc.set(x, H - 17, stripe);
      pc.set(x, H - 16, stripe);
      if ((x - kx) % 3 === 0) pc.set(x, H - 15, stripe);
    }
    drawText(pc, 'CAFE', kx + 3, H - 23, C.ink3);
    pc.rect(kx + 2, H - 24, 15, 7, C.snd6);
    drawText(pc, 'CAFE', kx + 3, H - 23, C.red2);
    drawText(g, 'CAFE', kx + 3, H - 23, C.org1);
    for (const [px, pcol] of [[96, C.yel0], [134, C.sea6]] as [number, number][]) {
      for (let i = -3; i <= 3; i++) pc.set(px + i, H - 13 + Math.abs(i) / 2, Math.abs(i) % 2 ? C.white : pcol);
      pc.hline(px - 2, H - 14, 5, pcol);
      pc.vline(px, H - 13, 8, C.ink6);
      pc.hline(px - 2, H - 7, 5, C.ink6);
      pc.set(px - 2, H - 6, C.ink5);
      pc.set(px + 2, H - 6, C.ink5);
    }
    seated(pc, 92, H - 5, 21);
    seated(pc, 130, H - 5, 22);
    seated(pc, 136, H - 5, 23);
    // people strolling and chatting; a kid with a balloon
    for (const [x, seed, pose] of [[4, 1, 0], [30, 2, 1], [33, 3, 0], [50, 4, 0], [84, 5, 1], [88, 6, 0], [122, 7, 0], [144, 8, 1]] as [number, number, number][]) {
      person(pc, x, H - 3, seed + 30, (pose + (f > 1 ? 1 : 0)) % 2 === 1 && seed % 3 === 0 ? 1 : pose);
    }
    const kidX = 55;
    pc.set(kidX + 1, H - 8, C.yel0);
    pc.hline(kidX, H - 7, 3, C.grn5);
    pc.hline(kidX, H - 6, 3, C.grn5);
    pc.set(kidX, H - 5, C.ink2);
    pc.set(kidX + 2, H - 5, C.ink2);
    pc.set(kidX, H - 4, C.ink1);
    pc.set(kidX + 2, H - 4, C.ink1);
    const by = H - 17 + (f === 1 || f === 2 ? -1 : 0);
    pc.vline(kidX + 3, by + 2, H - 8 - by - 2, C.ink6);
    pc.rect(kidX + 2, by, 3, 2, C.red3);
    pc.set(kidX + 2, by, C.pnk1);
    paving(pc, 0, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, emitters: [{ x: 18, y: H - 15, kind: 'mist', rate: 5, spread: 7 }], fps: 4 };
}

// ── a timber jetty out into the lake, with a solar ferry and swans ────────────────────────
export function jetty(): FacilityArt {
  const W = 124;
  const H = 34;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const deckY = H - 7;
  const pierEnd = 62;
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the ferry, moored off the end of the pier
    const bx = pierEnd - 6;
    const bw = 54;
    for (let x = 0; x < bw; x++) {
      const bow = x > bw - 8 ? Math.ceil((x - (bw - 8)) * 0.7) : 0;
      const stern = x < 2 ? 1 : 0;
      for (let y = H - 10 + bow + stern; y < H - 2; y++) pc.set(bx + x, y, y === H - 10 + bow + stern ? C.white : y >= H - 4 ? C.blu2 : y >= H - 6 ? C.cyn4 : C.ink9);
    }
    drawText(pc, 'LEMAN', bx + 14, H - 9, C.blu2);
    for (let x = bx - 1; x < bx + bw + 1; x++) if ((x + f) % 4) pc.set(x, H - 2, C.foam);
    // cabin with big windows and a solar roof
    pc.rect(bx + 8, H - 19, 30, 9, C.ink9);
    pc.vline(bx + 37, H - 19, 9, C.ink8);
    for (let x = bx + 10; x < bx + 36; x += 5) {
      pc.rect(x, H - 17, 4, 4, C.blu3);
      pc.set(x, H - 17, C.sky4);
      g.rect(x, H - 17, 4, 4, x % 2 ? C.yel1 : C.yel0);
    }
    pc.hline(bx + 5, H - 21, 36, C.blu3);
    pc.hline(bx + 6, H - 22, 34, C.sky4);
    for (let x = bx + 8; x < bx + 40; x += 8) pc.vline(x, H - 20, 1, C.ink6);
    pc.vline(bx + 44, H - 27, 17, C.ink7);
    pc.set(bx + 44, H - 28, f ? C.grn6 : C.red3);
    g.set(bx + 44, H - 28, f ? C.grn6 : C.red3);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) pc.set(bx + 45 + i, H - 27 + j, i === 1 && j === 1 ? C.white : CHARTER.field);
    // the pier: deck on posts, a railing, a lamp at the end
    for (let x = 0; x < pierEnd; x++) {
      pc.set(x, deckY, C.snd5);
      pc.set(x, deckY + 1, x % 4 === 0 ? C.snd2 : C.snd3);
    }
    for (let x = 1; x < pierEnd; x += 8) {
      pc.vline(x, deckY + 2, H - deckY - 2, C.snd2);
      pc.set(x, H - 1, C.sea7);
    }
    for (let x = 0; x < pierEnd; x += 6) pc.vline(x, deckY - 4, 4, C.snd3);
    pc.hline(0, deckY - 4, pierEnd, C.snd4);
    const lx = pierEnd - 2;
    pc.vline(lx, deckY - 15, 15, C.ink6);
    pc.rect(lx - 1, deckY - 17, 3, 2, C.ink5);
    pc.set(lx, deckY - 16, C.yel1);
    g.set(lx, deckY - 16, C.yel2);
    g.set(lx - 1, deckY - 16, C.yel1);
    g.set(lx + 1, deckY - 16, C.yel1);
    for (let k = 0; k < 5; k++) g.set(lx - 4 + k * 2, H - 1 - (k % 2), k % 2 ? C.org1 : C.yel0);
    // people: a couple at the rail, a fisher at the end
    person(pc, 12, deckY, 81);
    person(pc, 16, deckY, 82, 1);
    person(pc, pierEnd - 10, deckY, 83);
    pc.line(pierEnd - 7, deckY - 6, pierEnd + 2, deckY - 12, C.ink7);
    // swans
    for (const [sx, sy] of [[W - 10 - f, H - 3], [W - 17, H - 2]] as [number, number][]) {
      pc.hline(sx, sy, 3, C.white);
      pc.set(sx + 1, sy - 1, C.white);
      pc.set(sx, sy - 2, C.white);
      pc.set(sx, sy - 3, C.white);
      pc.set(sx - 1, sy - 3, C.org1);
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

// ── Geneva bands ───────────────────────────────────────────────────────────────────────────
/**
 * The Alps from across the lake: a jagged skyline with Mont Blanc's dome, snowfields lit from the
 * left with blue-violet shadows, hazy rock below. Used as the far band at the Charter HQ.
 */
export function alpsRidge(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  interface Peak { x: number; y: number; sl: number; sr: number }
  const peaks: Peak[] = [];
  let x = -20;
  let i = 0;
  while (x < w + 40) {
    const big = hash2(i, seed, 11);
    peaks.push({ x, y: h * (0.2 + (1 - big) * 0.32), sl: 0.55 + hash2(i, seed, 12) * 0.5, sr: 0.6 + hash2(i, seed, 13) * 0.55 });
    x += 26 + Math.floor(hash2(i, seed, 14) * 30);
    i++;
  }
  // Mont Blanc: a broad white dome, the highest thing on the horizon
  const mb = Math.min(w - 60, Math.max(140, Math.round(w * 0.55)));
  peaks.push({ x: mb, y: h * 0.06, sl: 0.42, sr: 0.48 });
  peaks.push({ x: mb - 30, y: h * 0.2, sl: 0.7, sr: 0.5 }); // the Aiguilles
  peaks.push({ x: mb - 38, y: h * 0.17, sl: 1.1, sr: 1.2 });
  const cone = (p: Peak, xx: number) => p.y + (xx < p.x ? (p.x - xx) * p.sl : (xx - p.x) * p.sr);
  const snowLine = h * 0.52;
  for (let xx = 0; xx < w; xx++) {
    let best = peaks[0];
    let top = Infinity;
    for (const p of peaks) {
      const c = cone(p, xx);
      if (c < top) {
        top = c;
        best = p;
      }
    }
    top += (fbm(xx / 7, seed, 3, 2) - 0.5) * 4;
    // the dome of Mont Blanc is rounded, not pointed
    if (best.x === mb) top = Math.max(top, best.y + ((xx - mb) / 28) ** 2 * 5);
    const t0 = Math.max(0, Math.round(top));
    for (let y = t0; y < h; y++) {
      const ridge = best.x + Math.round((fbm(y / 4, seed + 7, 1, 2) - 0.5) * 6 + (y - best.y) * 0.12);
      const lit = xx < ridge;
      const snowy = y < snowLine + (fbm(xx / 9, y / 9, seed + 5) - 0.5) * 18 - (lit ? 0 : 4);
      // couloirs: snow streaks running down below the snowline on the lit faces
      const couloir = !snowy && lit && hash2(xx >> 1, 1, seed) < 0.18 && y < snowLine + 10 && bayer(xx, y) < 10 - (y - snowLine);
      let c: number;
      if (snowy || couloir) {
        if (lit) c = y - t0 < 1 ? C.white : ditherAt(xx, y, 0.35) ? C.ice2 : C.ice3;
        else c = ditherAt(xx, y, 0.4) ? C.ice0 : C.ice1;
        // rock outcrops poking through the snow
        if (hash2(xx >> 1, y >> 1, seed + 9) < 0.07 && y - t0 > 2) c = lit ? C.ink7 : C.ink6;
      } else {
        c = lit ? (ditherAt(xx, y, 0.3) ? C.ink7 : C.ice0) : ditherAt(xx, y, 0.35) ? C.ink5 : C.ink6;
      }
      // haze: the foot of the range dissolves into the air above the lake
      const haze = (y - h * 0.7) / (h * 0.3);
      if (haze > 0 && bayer(xx, y) < haze * 14) c = C.ice1;
      pc.set(xx, y, c);
    }
  }
  return pc;
}

/**
 * Lake Geneva in the middle distance: the far shore's wooded hills and villages, then open water
 * with ripples and reflections. Glow holds village lights and their reflections.
 */
export function lakeBand(w: number, h: number, seed: number): { base: PixelCanvas; glow: PixelCanvas; waterY: number } {
  const pc = new PixelCanvas(w, h);
  const g = new PixelCanvas(w, h);
  const shore = Math.round(h * 0.42);
  for (let x = 0; x < w; x++) {
    const top = Math.round(h * 0.16 + (fbm(x / 34, seed + 2, 1, 3) - 0.5) * h * 0.24);
    for (let y = top; y < shore; y++) {
      let c = y - top < 1 ? C.grn4 : bayer(x, y) < 5 ? C.grn3 : C.grn2;
      // vineyards in rows on the sunny slopes
      if (y - top > 2 && fbm(x / 20, seed + 3) > 0.55 && (y + (x >> 1)) % 3 === 0) c = C.grn4;
      pc.set(x, y, c);
    }
  }
  // villages along the shore
  for (let x = 6; x < w - 6; x += 14 + Math.floor(hash2(x, seed, 31) * 26)) {
    const n = 2 + Math.floor(hash2(x, seed, 32) * 4);
    for (let k = 0; k < n; k++) {
      const hx = x + k * 3;
      const hy = shore - 3 - Math.floor(hash2(hx, seed, 33) * 3);
      pc.set(hx, hy, C.white);
      pc.set(hx + 1, hy, C.ink9);
      pc.set(hx, hy - 1, C.red2);
      pc.set(hx + 1, hy - 1, C.red2);
      if (hash2(hx, seed, 34) > 0.3) g.set(hx + (k % 2), hy, C.yel1);
      if (hash2(hx, seed, 35) > 0.85) {
        pc.vline(hx + 1, hy - 4, 3, C.ink9); // a church spire
        pc.set(hx + 1, hy - 5, C.ink7);
      }
    }
  }
  // water
  for (let y = shore; y < h; y++) {
    const t = (y - shore) / Math.max(1, h - shore);
    for (let x = 0; x < w; x++) {
      let c = t < 0.25 ? C.sea6 : t < 0.6 ? (ditherAt(x, y, (t - 0.25) * 2.8) ? C.sea5 : C.sea6) : bayer(x, y) < 4 ? C.sea4 : C.sea5;
      // the far shore mirrored, broken by ripples
      if (y - shore < 3 && hash2(x >> 1, y, seed + 4) > 0.35) c = C.sea4;
      if ((x + y * 7 + Math.floor(hash2(y, seed, 6) * 40)) % 23 < 3 && y - shore > 2) c = t < 0.5 ? C.sea7 : C.sea6;
      if (hash2(x, y, seed + 8) < 0.012) c = C.foam;
      pc.set(x, y, c);
    }
  }
  pc.hline(0, shore, w, C.snd6);
  for (let x = 0; x < w; x++) if (hash2(x, 2, seed) > 0.6) pc.set(x, shore, C.grn3);
  // lights reflected in the water at night
  for (let x = 0; x < w; x++) {
    for (let y = shore - 6; y < shore; y++) {
      if (!g.get(x, y)) continue;
      for (let k = 1; k < 6; k++) if (bayer(x, shore + k * 2) < 10 - k * 2) g.set(x, shore + k * 2 - 1, k < 3 ? C.yel0 : C.org1);
    }
  }
  return { base: pc, glow: g, waterY: shore };
}

/** The Jet d'Eau: a 140 m plume of lake water, bent by the wind (frames; floodlit at night). */
export function jetFrames(height: number): { base: PixelCanvas[]; glow: PixelCanvas[] } {
  const W = 30;
  const H = height;
  const base: PixelCanvas[] = [];
  const glow: PixelCanvas[] = [];
  const cx = 6;
  const top = 5;
  const lean = (y: number) => {
    const t = (H - 1 - y) / (H - 1 - top);
    return Math.round(t * t * t * 4);
  };
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    // the spray curtain falling downwind of the plume
    for (let k = 0; k < 150; k++) {
      const a = hash2(k, 1, 7);
      const fall = (hash2(k, 2, 7) + f * 0.25) % 1;
      const x = cx + 4 + Math.round(a * 16 + fall * 4);
      const y = top + 4 + Math.round(fall * (H - top - 10) * (0.35 + a * 0.65));
      if (bayer(x, y) < 13 - fall * 12) pc.set(x, y, fall < 0.3 ? C.white : fall < 0.6 ? C.ice3 : C.ice2);
    }
    // the column
    for (let y = H - 1; y >= top; y--) {
      const x = cx + lean(y);
      const t = (H - 1 - y) / (H - 1 - top);
      pc.set(x, y, (y + f * 2) % 6 === 0 ? C.ice3 : C.white);
      pc.set(x + 1, y, (y + f) % 4 === 0 ? C.ice2 : C.ice3);
      if (t > 0.55) pc.set(x - 1, y, (y + f) % 3 ? C.ice3 : C.ice2);
    }
    // the crown: a billowing head blown downwind
    const hx = cx + lean(top);
    const puffs: [number, number, number][] = [
      [hx + 1, top + 1, 2.6],
      [hx + 5, top + 2, 3.2],
      [hx + 9, top + 4, 3.4],
      [hx + 13, top + 7, 3],
      [hx + 17, top + 11, 2.4],
    ];
    for (const [i, [px, py, r]] of puffs.entries()) {
      const wob = ((f + i) % 2) * 0.4;
      for (let y = Math.floor(py - r - 1); y <= Math.ceil(py + r + 1); y++) {
        for (let x = Math.floor(px - r - 1); x <= Math.ceil(px + r + 1); x++) {
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py) / (r + wob);
          if (d > 1 || (d > 0.75 && bayer(x, y) < (d - 0.75) * 50)) continue;
          const l = (-(x + 0.5 - px) - (y + 0.5 - py)) / r;
          pc.set(x, y, l > 0.2 ? C.white : l > -0.6 ? C.ice3 : C.ice2);
        }
      }
    }
    // foam ring where it leaves the lake
    pc.hline(cx - 3, H - 1, 9, C.foam);
    pc.hline(cx - 1, H - 2, 5, C.white);
    pc.set(cx - 2 + (f % 2), H - 3, C.foam);
    base.push(pc);
    const g = new PixelCanvas(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pc.get(x, y) && bayer(x, y) < 12) g.set(x, y, pc.get(x, y) === C.white ? C.ice3 : C.ice2);
    glow.push(g);
  }
  return { base, glow };
}

/** A small sailboat (variant picks the sail colour). */
export function sailboat(v: number): PixelCanvas {
  const pc = new PixelCanvas(9, 11);
  const jib = [C.red3, C.yel0, C.sea6, C.white][v % 4];
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i <= Math.floor(j * 0.6); i++) pc.set(4 - i, 1 + j, i === 0 ? C.ink9 : C.white);
    for (let i = 1; i <= Math.floor(j * 0.4); i++) pc.set(4 + i, 3 + j - 2, jib);
  }
  pc.vline(4, 0, 9, C.ink5);
  pc.hline(1, 9, 7, C.ink9);
  pc.hline(2, 10, 5, C.ink7);
  return pc;
}
