/**
 * Act IV in the megaproject dioramas: fusion fleets, one plant per design so the five read apart at
 * a glance — Sunforge's compact tokamak (a squat drum with a pink plasma ring in its viewport),
 * Twistfield's stellarator (a long hall with the twisted violet ribbon showing through the glass),
 * Kindle's laser ignition (a laser bay feeding a spherical target chamber that flashes), Quickpinch's
 * magnetised target (a cylinder ringed by pistons, liquid metal glowing orange) and the aneutronic
 * D-He3 plant (sleek, white and gold, no steam) — plus direct-air-capture farms (fan walls and
 * stone-injection wellheads). Pure PixelCanvas code with palette indices only.
 */
import type { Backdrop } from '../../content/sites';
import type { FusionDesignId } from '../../sim/types';
import { C } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { Emitter, FacilityArt } from './art';
import { beacon, CONCRETE, coolingCells, facadeShade, fence, pipe, roundShade, STEEL, tank, transformerYard, windowGrid, type Ramp } from './draw';
import { groundRow } from './mega';
import { lushTree, person, type Ramp4 } from './act3kit';

export const FUSION_SIZE: Record<FusionDesignId, [number, number]> = {
  tokamak: [150, 86],
  stellarator: [180, 80],
  laser: [204, 78],
  pinch: [156, 100],
  dhe3: [178, 64],
};

/** The partner that builds each design (its colours band the halls). */
export const DESIGN_BUILDER: Record<FusionDesignId, string> = {
  tokamak: 'sunforge',
  stellarator: 'twistfield',
  laser: 'kindle',
  pinch: 'quickpinch',
  dhe3: 'sunforge',
};

/** Each design's glow, for the distant kit in the back band and the map. */
export const DESIGN_GLOW: Record<FusionDesignId, number> = {
  tokamak: C.pnk1,
  stellarator: C.vio5,
  laser: C.yel2,
  pinch: C.org2,
  dhe3: C.yel1,
};

function unitPlate(pc: PixelCanvas, g: PixelCanvas, x: number, y: number, unit: number, col: number) {
  const t = `UNIT ${unit}`;
  pc.rect(x, y, measureText(t) + 4, 7, C.ink1);
  drawText(pc, t, x + 2, y + 1, col);
  drawText(g, t, x + 2, y + 1, col);
}

/** A squat drum with a shallow domed cap, lit from the upper left. Returns the wall top. */
function drum(pc: PixelCanvas, x: number, baseY: number, w: number, wallH: number, capH: number, ramp: Ramp = CONCRETE): number {
  const half = w / 2;
  const cx = x + half;
  const top = baseY - wallH;
  for (let xx = x; xx < x + w; xx++) {
    const dx = xx + 0.5 - cx;
    const k = Math.sqrt(Math.max(0, 1 - (dx / half) ** 2));
    const cap = Math.round(capH * k);
    for (let y = top - cap; y < baseY; y++) {
      let c = roundShade(ramp, dx, half, xx, y);
      if (y < top) {
        const up = (top - y) / Math.max(1, cap);
        if (dx < half * 0.2 && ditherAt(xx, y, 0.3 + up * 0.6)) c = ramp.hi;
        if (y === top - cap) c = dx < 0 ? ramp.hi : ramp.lit;
      }
      pc.set(xx, y, c);
    }
  }
  pc.hline(x, top, w, ramp.shade);
  for (let xx = x + 1; xx < x + w; xx += 3) pc.set(xx, top + 1, ramp.dark);
  return top;
}

/** A turbine hall with a clerestory of lit windows; returns its roof y. */
function turbineHall(pc: PixelCanvas, g: PixelCanvas, x: number, baseY: number, w: number, h: number, seed: number): number {
  const top = baseY - h;
  pc.rect(x, top, w, h, C.ink8);
  for (let xx = x + 2; xx < x + w; xx += 4) pc.vline(xx, top + 3, h - 4, C.ink7);
  pc.hline(x - 1, top - 1, w + 2, C.white);
  pc.rect(x, top + 3, w, 4, C.ink2);
  for (let xx = x + 1; xx < x + w - 2; xx += 3) {
    pc.rect(xx, top + 4, 2, 2, C.blu3);
    if (hash2(xx, seed, 33) > 0.3) g.rect(xx, top + 4, 2, 2, C.yel1);
  }
  facadeShade(pc, x, top, w, h, C.ink8, C.ink7);
  return top;
}

const finish = (pc: PixelCanvas, W: number, H: number, bd: Backdrop) => {
  groundRow(pc, W, H, bd);
  pc.rect(0, H - 3, W, 1, C.ink6);
};

// ── Sunforge's compact tokamak ─────────────────────────────────────────────────────────────
function tokamak(unit: number, bd: Backdrop, r: Ramp4): FacilityArt {
  const [W, H] = FUSION_SIZE.tokamak;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  for (let f = 0; f < 3; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the cryoplant for the superconducting magnets: frosted tanks on the left
    tank(pc, 2, base, 8, 24, STEEL, false, C.cyn4);
    tank(pc, 11, base, 6, 17, STEEL, false);
    for (let x = 2; x < 17; x++) for (let y = base - 5; y < base; y++) if (pc.get(x, y) && bayer(x, y) < 7) pc.set(x, y, C.ice2);
    // the tokamak hall: a squat drum with a shallow dome
    const hx = 20;
    const hw = 62;
    const wallTop = drum(pc, hx, base, hw, 36, 12, CONCRETE);
    pc.rect(hx, wallTop + 3, hw, 3, r.base);
    pc.hline(hx, wallTop + 3, hw, r.lit);
    facadeShade(pc, hx, wallTop + 3, hw, 3, r.base, r.mid, 0.7);
    // the viewport onto the plasma: a doughnut seen edge-on, brightest where we look along its rim
    const cx = hx + hw / 2;
    const cy = wallTop + 18;
    const RX = 16;
    const RY = 7;
    for (let y = Math.floor(cy - RY - 2); y <= Math.ceil(cy + RY + 2); y++) {
      for (let x = Math.floor(cx - RX - 2); x <= Math.ceil(cx + RX + 2); x++) {
        const d = Math.hypot((x + 0.5 - cx) / (RX + 1.5), (y + 0.5 - cy) / (RY + 1.5));
        if (d > 1) continue;
        pc.set(x, y, d > 0.84 ? (y < cy ? C.ink5 : C.ink6) : C.ink1);
      }
    }
    // the central solenoid, dark against the glow
    pc.rect(Math.round(cx) - 2, Math.round(cy - RY + 1), 4, Math.round(RY * 2 - 1), C.ink3);
    const hot = (f * 2.1) % (Math.PI * 2);
    for (let a = 0; a < 160; a++) {
      const t = (a / 160) * Math.PI * 2;
      const px = Math.round(cx - 0.5 + Math.cos(t) * (RX - 4));
      const py = Math.round(cy - 0.5 + Math.sin(t) * (RY - 3.2));
      const limb = Math.abs(Math.cos(t)); // the plasma looks thickest at the sides
      const spark = Math.cos(t - hot) > 0.85;
      const col = limb > 0.85 || spark ? C.white : limb > 0.45 ? C.pnk1 : C.pnk0;
      if (Math.sin(t) < 0 && Math.abs(px + 0.5 - cx) < 3) continue; // behind the solenoid
      pc.set(px, py, col);
      g.set(px, py, col);
      if (limb > 0.6) {
        const ox = Math.sign(Math.cos(t));
        pc.set(px - ox, py, C.pnk0);
        g.set(px - ox, py, C.pnk0);
      }
    }
    // a soft magenta haze inside the port
    for (let y = Math.floor(cy - RY + 1); y <= Math.ceil(cy + RY - 1); y++) {
      for (let x = Math.floor(cx - RX + 1); x <= Math.ceil(cx + RX - 1); x++) {
        if (pc.get(x, y) !== C.ink1) continue;
        const d = Math.hypot((x + 0.5 - cx) / RX, (y + 0.5 - cy) / RY);
        if (d < 0.95 && bayer(x + f, y) < 5) {
          pc.set(x, y, C.vio1);
          g.set(x, y, C.vio2);
        }
      }
    }
    // portholes and a door at the foot of the drum
    for (let k = 0; k < 6; k++) {
      const px = hx + 6 + k * 10;
      if (Math.abs(px + 1 - cx) < 6) continue;
      pc.rect(px, base - 9, 3, 2, C.ink2);
      if (hash2(k, unit, 5) > 0.3) g.rect(px, base - 9, 3, 2, C.yel1);
    }
    pc.rect(Math.round(cx) - 4, base - 7, 8, 7, C.ink4);
    pc.vline(Math.round(cx), base - 7, 7, C.ink3);
    // the turbine hall with mechanical-draft cells on its roof
    const tx = 88;
    const roof = turbineHall(pc, g, tx, base, W - tx - 4, 24, unit);
    const tops = coolingCells(pc, tx + 3, roof, 4, 9, f);
    emitters = tops.map(([x, y]) => ({ x, y, kind: 'steam' as const, rate: 1.6, spread: 2, size: 3 }));
    unitPlate(pc, g, tx + 4, base - 11, unit, C.pnk1);
    // vent stack and beacons
    pc.rect(hx + hw + 1, 20, 3, base - 20, C.ink8);
    pc.vline(hx + hw + 3, 20, base - 20, C.ink6);
    pc.hline(hx + hw, 19, 5, C.ink6);
    beacon(pc, g, hx + hw + 2, 18, f === 0);
    beacon(pc, g, Math.round(cx), wallTop - 12, f === 1);
    finish(pc, W, H, bd);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 30, H] }, emitters, fps: 4 };
}

// ── Twistfield's stellarator ───────────────────────────────────────────────────────────────
function stellarator(unit: number, bd: Backdrop, r: Ramp4): FacilityArt {
  const [W, H] = FUSION_SIZE.stellarator;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  for (let f = 0; f < 3; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the hall: a long stadium with a rounded roof
    const hx = 4;
    const hw = 124;
    const wallH = 30;
    const capH = 18;
    const top = base - wallH;
    for (let x = hx; x < hx + hw; x++) {
      const t = (x + 0.5 - hx) / hw;
      // rounded ends, flat middle
      const e = t < 0.18 ? Math.sqrt(1 - ((0.18 - t) / 0.18) ** 2) : t > 0.82 ? Math.sqrt(1 - ((t - 0.82) / 0.18) ** 2) : 1;
      const cap = Math.round(capH * e);
      const end = Math.round(wallH * (0.55 + 0.45 * e));
      for (let y = Math.min(top - cap, base - end); y < base; y++) {
        if (y < base - end && y >= top) continue;
        const up = y < top ? (top - y) / Math.max(1, cap) : 0;
        let c = t < 0.1 ? C.white : t > 0.88 ? C.ink7 : C.ink9;
        if (y < top) c = up > 0.7 ? (t < 0.5 ? C.white : C.ink9) : t > 0.7 && ditherAt(x, y, (t - 0.7) * 4) ? C.ink8 : ditherAt(x, y, 0.4 + up * 0.5) ? C.white : C.ink9;
        else if (t > 0.6 && ditherAt(x, y, (t - 0.6) * 2)) c = C.ink8;
        pc.set(x, y, c);
      }
    }
    // the twist painted over the roof in Twistfield's colours
    for (let x = hx + 6; x < hx + hw - 6; x++) {
      const y = Math.round(top - capH * 0.45 + Math.sin(x / 9) * 4);
      if (!pc.get(x, y)) continue;
      pc.set(x, y, r.base);
      pc.set(x, y + 1, r.mid);
    }
    // the glass gallery: modular coils and the plasma ribbon twisting through them
    const gx0 = hx + 12;
    const gx1 = hx + hw - 12;
    const gy0 = top + 3;
    const gy1 = top + 19;
    const mid = (gy0 + gy1) / 2;
    pc.rect(gx0 - 1, gy0 - 1, gx1 - gx0 + 2, gy1 - gy0 + 2, C.ink5);
    pc.rect(gx0, gy0, gx1 - gx0, gy1 - gy0, C.ink1);
    const ph = (f * Math.PI * 2) / 3;
    for (let x = gx0; x < gx1; x++) {
      const s = Math.sin((x - gx0) / 6 + ph);
      // the ribbon's centre line wanders as it twists; its width is how square-on we see it
      const cy = mid - 0.5 + Math.cos((x - gx0) / 6 + ph) * 1.6;
      const lo = Math.round(cy - Math.abs(s) * 4.5);
      const hi = Math.round(cy + Math.abs(s) * 4.5);
      const front = s > 0; // which face of the ribbon is toward us
      for (let y = lo; y <= hi; y++) {
        const edge = y === lo || y === hi;
        const thin = hi - lo < 2;
        let col = thin ? C.white : edge ? (front ? C.vio5 : C.blu6) : front ? (ditherAt(x, y, 0.35) ? C.vio5 : C.vio4) : ditherAt(x, y, 0.5) ? C.blu5 : C.vio3;
        if (!thin && y === (front ? lo + 1 : hi - 1)) col = C.pnk1;
        pc.set(x, y, col);
        g.set(x, y, col === C.vio3 ? C.vio4 : col === C.blu5 ? C.blu6 : col);
      }
    }
    for (let k = 0; gx0 + 3 + k * 6 < gx1 - 1; k++) {
      const cx = gx0 + 3 + k * 6;
      for (let y = gy0; y < gy1; y++) {
        const wob = Math.round(Math.sin(y * 0.55 + k * 1.3) * 1.2);
        pc.set(cx + wob, y, y < mid ? C.ink6 : C.ink5);
        pc.set(cx + wob + 1, y, C.ink3);
      }
    }
    pc.hline(gx0, gy0 + 3, gx1 - gx0, C.ink4);
    pc.hline(gx0, gy1 - 1, gx1 - gx0, C.ink3);
    // ground-floor windows and a door
    windowGrid(pc, g, hx + 14, base - 8, 18, 1, { ww: 3, wh: 2, gx: 2, seed: 70 + unit, lit: 0.6 });
    pc.rect(hx + hw - 26, base - 7, 7, 7, C.ink4);
    // turbine hall and cooling cells
    const tx = hx + hw + 4;
    const roof = turbineHall(pc, g, tx, base, W - tx - 2, 22, unit + 3);
    const tops = coolingCells(pc, tx + 3, roof, 3, 9, f);
    emitters = tops.map(([x, y]) => ({ x, y, kind: 'steam' as const, rate: 1.4, spread: 2, size: 3 }));
    unitPlate(pc, g, tx + 3, base - 11, unit, C.vio5);
    beacon(pc, g, hx + Math.round(hw / 2), top - capH - 1, f === 0);
    finish(pc, W, H, bd);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 24, H] }, emitters, fps: 3 };
}

// ── Kindle's laser ignition ────────────────────────────────────────────────────────────────
function laser(unit: number, bd: Backdrop, r: Ramp4): FacilityArt {
  const [W, H] = FUSION_SIZE.laser;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  // the target chamber
  const scx = 150;
  const scy = base - 34;
  const SR = 22;
  // beam tubes: from the bay's end wall and roof to ports around the chamber
  const bayX = 4;
  const bayW = 108;
  const bayTop = base - 26;
  // beamlines fan out from the bay's end wall and converge on ports all over the chamber
  const ports: [number, number][] = [];
  for (const a of [118, 136, 154, 172, 190, 208, 226, 244]) {
    const t = (a * Math.PI) / 180;
    ports.push([Math.round(scx + Math.cos(t) * SR), Math.round(scy - Math.sin(t) * SR)]);
  }
  const starts: [number, number][] = ports.map((_, i) => [bayX + bayW - 1, bayTop + 3 + Math.round((i / (ports.length - 1)) * (base - bayTop - 7))]);
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the laser bay: a long, low hall
    pc.rect(bayX, bayTop, bayW, base - bayTop, C.ink8);
    for (let x = bayX + 3; x < bayX + bayW; x += 6) pc.vline(x, bayTop + 4, base - bayTop - 4, C.ink7);
    pc.hline(bayX - 1, bayTop - 1, bayW + 2, C.white);
    pc.rect(bayX, bayTop + 1, bayW, 3, r.base);
    pc.hline(bayX, bayTop + 1, bayW, r.lit);
    // the beamline gallery: a slit through which the lasers' path shows at night
    pc.rect(bayX + 6, bayTop + 9, bayW - 10, 3, C.ink2);
    for (let x = bayX + 6; x < bayX + bayW - 4; x++) {
      const on = f === 0 || ((x + f * 7) % 13 < 2 && f === 1);
      pc.set(x, bayTop + 10, on ? C.cyn5 : C.cyn1);
      if (on) g.set(x, bayTop + 10, C.cyn5);
      else if (x % 4 === 0) g.set(x, bayTop + 10, C.cyn2);
    }
    windowGrid(pc, g, bayX + 8, base - 9, 16, 1, { ww: 3, wh: 2, gx: 3, seed: 90 + unit, lit: 0.55 });
    facadeShade(pc, bayX, bayTop + 4, bayW, base - bayTop - 4, C.ink8, C.ink7, 0.75);
    unitPlate(pc, g, bayX + 4, bayTop + 14, unit, C.org2);
    // pedestal and a ring walkway
    pc.rect(scx - 9, scy + SR - 4, 18, base - scy - SR + 4, C.ink7);
    pc.vline(scx + 6, scy + SR - 4, base - scy - SR + 4, C.ink6);
    // the sphere
    for (let y = scy - SR; y <= scy + SR; y++) {
      for (let x = scx - SR; x <= scx + SR; x++) {
        const dx = x + 0.5 - scx;
        const dy = y + 0.5 - scy;
        const d = Math.hypot(dx, dy) / SR;
        if (d > 1) continue;
        const l = (-dx * 0.75 - dy) / SR;
        let c = l > 0.55 ? C.white : l > 0.05 ? C.ink9 : l > -0.45 ? C.ink8 : C.ink7;
        if (l > 0.05 && l <= 0.55 && ditherAt(x, y, (l - 0.05) * 2)) c = C.white;
        if (l <= 0.05 && l > -0.45 && ditherAt(x, y, (0.05 - l) * 1.6)) c = C.ink7;
        if (d > 0.93 && l < 0) c = C.ink6;
        pc.set(x, y, c);
      }
    }
    pc.hline(scx - SR - 2, scy + 3, SR * 2 + 5, C.ink5);
    pc.hline(scx - SR - 2, scy + 4, SR * 2 + 5, C.ink6);
    // beam tubes into the chamber's ports
    // a frame holding the beamlines where they leave the bay
    pc.rect(bayX + bayW, bayTop - 2, 4, base - bayTop + 2, C.ink6);
    pc.vline(bayX + bayW, bayTop - 2, base - bayTop + 2, C.ink8);
    starts.forEach(([sx, sy], i) => {
      const [px, py] = ports[i];
      pc.line(sx + 4, sy, px, py, C.ink8);
      pc.line(sx + 4, sy + 1, px, py + 1, C.ink6);
      if (f === 0) g.line(sx + 4, sy, px, py, C.cyn5);
      else if (f === 1 && i % 2 === 0) g.set(Math.round((sx + 4 + px) / 2), Math.round((sy + py) / 2), C.cyn3);
    });
    // the ports: a flash when the shot fires, then the afterglow
    const portCol = [C.white, C.org2, C.red3, C.ink3][f];
    for (const [px, py] of ports) {
      pc.rect(px - 1, py - 1, 3, 3, C.ink4);
      pc.set(px, py, portCol);
      if (f < 3) g.set(px, py, portCol);
    }
    for (const [dx, dy] of [[-6, -4], [5, -7], [-2, 6], [8, 3], [-9, 2], [1, -12]] as [number, number][]) {
      const x = scx + dx;
      const y = scy + dy;
      pc.rect(x, y, 2, 2, C.ink5);
      if (f === 0) {
        pc.rect(x, y, 2, 2, C.yel2);
        g.rect(x, y, 2, 2, C.yel2);
      } else if (f === 1) g.set(x, y, C.org1);
    }
    if (f === 0) {
      // the flash lights the sphere's rim
      for (let a = 0; a < 90; a++) {
        const t = (a / 90) * Math.PI * 2;
        const x = Math.round(scx - 0.5 + Math.cos(t) * (SR + 1));
        const y = Math.round(scy - 0.5 + Math.sin(t) * (SR + 1));
        if (bayer(x, y) < 6) g.set(x, y, C.yel1);
      }
    }
    // heat exchangers and the turbine block on the right
    tank(pc, 180, base, 8, 30, STEEL, true, r.base);
    const tx = 190;
    pc.rect(tx, base - 18, W - tx - 1, 18, C.ink8);
    pc.hline(tx, base - 18, W - tx - 1, C.white);
    pc.rect(tx + 2, base - 14, W - tx - 5, 3, C.ink2);
    g.rect(tx + 3, base - 13, 3, 1, C.yel1);
    const tops = coolingCells(pc, tx - 1, base - 18, 1, 6, f);
    emitters = tops.map(([x, y]) => ({ x, y, kind: 'steam' as const, rate: 1.1, spread: 2, size: 3 }));
    beacon(pc, g, scx, scy - SR - 1, f % 2 === 0);
    finish(pc, W, H, bd);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [60, H] }, emitters, fps: 5 };
}

// ── Quickpinch's magnetised target ─────────────────────────────────────────────────────────
function pinch(unit: number, bd: Backdrop, r: Ramp4): FacilityArt {
  const [W, H] = FUSION_SIZE.pinch;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  const vx = 46;
  const vw = 32;
  const vTop = base - 66;
  const vBot = base - 8;
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const heat = [C.yel2, C.org2, C.org1, C.org0][f];
    const out = f === 0 ? 0 : 1; // pistons fire inward on the bang
    // gas tanks that drive the pistons
    tank(pc, 4, base, 10, 34, STEEL, true, r.base);
    tank(pc, 17, base, 10, 26, STEEL, false, r.base);
    pipe(pc, 14, base - 20, vx - 14 - 10, null, C.ink7, C.ink5);
    pipe(pc, 26, base - 12, vx - 26 - 10, null, C.ink7, C.ink5);
    // plinth
    pc.rect(vx - 14, vBot, vw + 28, base - vBot, C.ink7);
    pc.hline(vx - 14, vBot, vw + 28, C.ink9);
    // the vessel: a tall cylinder with a domed top
    for (let y = vTop - 6; y < vBot; y++) {
      for (let x = vx; x < vx + vw; x++) {
        const dx = x + 0.5 - (vx + vw / 2);
        if (y < vTop) {
          const k = (vTop - y) / 6;
          if ((dx / (vw / 2)) ** 2 + k * k > 1) continue;
        }
        pc.set(x, y, roundShade(STEEL, dx, vw / 2, x, y));
      }
    }
    // the plasma gun on top: a tapered barrel with coil rings
    for (let y = vTop - 26; y < vTop - 5; y++) {
      const hw = 2 + Math.round(((y - (vTop - 26)) / 21) * 3);
      for (let x = vx + vw / 2 - hw; x < vx + vw / 2 + hw; x++) pc.set(x, y, x < vx + vw / 2 - hw + 2 ? C.ink9 : x > vx + vw / 2 + hw - 2 ? C.ink6 : C.ink8);
      if ((y - vTop) % 4 === 0) pc.hline(vx + vw / 2 - hw - 1, y, hw * 2 + 2, r.base);
    }
    beacon(pc, g, vx + vw / 2, vTop - 27, f % 2 === 0);
    // piston housings ringing the vessel: side stubs, and caps on the face
    for (let y = vTop + 2; y < vBot - 4; y += 7) {
      for (const side of [-1, 1]) {
        const len = 9 - out;
        const x0 = side < 0 ? vx - len : vx + vw;
        pc.rect(x0, y, len, 5, C.ink6);
        pc.hline(x0, y, len, C.ink8);
        pc.vline(side < 0 ? x0 : x0 + len - 1, y, 5, C.ink4);
        // the liquid metal between the housings glows through the seams
        pc.hline(x0, y + 5, len, heat);
        g.hline(x0, y + 5, len, heat);
      }
      for (let k = 0; k < 4; k++) {
        const cx = vx + 4 + k * 8;
        pc.rect(cx - 2, y, 5, 5, C.ink5);
        pc.rect(cx - 1, y + 1, 3, 3, out ? C.ink8 : C.ink9);
        pc.set(cx, y + 2, C.ink4);
        pc.set(cx + 2, y + 5, heat);
        g.set(cx + 2, y + 5, heat);
      }
    }
    // a glowing ring where the liquid metal drains at the base
    for (let x = vx; x < vx + vw; x++) {
      pc.set(x, vBot - 2, heat);
      g.set(x, vBot - 2, heat);
      pc.set(x, vBot - 1, C.org0);
    }
    unitPlate(pc, g, vx - 12, vBot + 2, unit, C.yel1);
    // turbine hall and cells
    const tx = vx + vw + 16;
    const roof = turbineHall(pc, g, tx, base, W - tx - 2, 24, unit + 5);
    const tops = coolingCells(pc, tx + 4, roof, 3, 9, f);
    emitters = tops.map(([x, y]) => ({ x, y, kind: 'steam' as const, rate: 1.5, spread: 2, size: 3 }));
    finish(pc, W, H, bd);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 24, H] }, emitters, fps: 4 };
}

// ── aneutronic D-He3: sleek, white and gold, no steam ──────────────────────────────────────
function dhe3(unit: number, bd: Backdrop): FacilityArt {
  const [W, H] = FUSION_SIZE.dhe3;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const hx = 14;
  const hw = 124;
  const hh = 30;
  const top = base - 4 - hh;
  const cy = top + hh / 2;
  const R = hh / 2;
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    lushTree(pc, 6, base, 5, 3 + unit, 1);
    // a low plinth
    pc.rect(hx + 6, base - 4, hw - 12, 4, C.ink8);
    pc.hline(hx + 6, base - 4, hw - 12, C.white);
    // the capsule hall: half-round ends, smooth white shell
    for (let x = hx; x < hx + hw; x++) {
      const ex = x + 0.5 < hx + R ? hx + R - (x + 0.5) : x + 0.5 > hx + hw - R ? x + 0.5 - (hx + hw - R) : 0;
      const half = Math.sqrt(Math.max(0, R * R - ex * ex));
      for (let y = Math.round(cy - half); y < Math.round(cy + half); y++) {
        const v = (y + 0.5 - cy) / R; // -1 top … 1 bottom
        const endShade = x > hx + hw - R ? (x - (hx + hw - R)) / R : 0;
        let c = v < -0.55 ? C.white : v < 0.1 ? (ditherAt(x, y, 0.3 + v) ? C.ink9 : C.white) : v < 0.6 ? C.ink9 : ditherAt(x, y, (v - 0.6) * 2) ? C.ink8 : C.ink9;
        if (endShade > 0.4 && ditherAt(x, y, endShade - 0.3)) c = C.ink8;
        pc.set(x, y, c);
      }
    }
    // gold rings and the gold band
    for (let x = hx + R + 2; x < hx + hw - R; x += 14) {
      for (let y = top + 1; y < top + hh - 1; y++) if (pc.get(x, y)) pc.set(x, y, y < cy ? C.yel0 : C.org1);
    }
    pc.hline(hx + 4, Math.round(cy + 6), hw - 8, C.yel0);
    pc.hline(hx + 4, Math.round(cy + 7), hw - 8, C.org1);
    // the slot along the axis: the plasma, white-gold, a pulse running along it
    const sx0 = hx + 10;
    const sx1 = hx + hw - 10;
    const pulse = sx0 + ((f + 0.5) / 4) * (sx1 - sx0);
    for (let x = sx0; x < sx1; x++) {
      const near = Math.abs(x - pulse) < 7;
      const col = near ? C.white : (x + f) % 5 === 0 ? C.yel2 : C.yel1;
      pc.set(x, Math.round(cy - 1), col);
      pc.set(x, Math.round(cy), near ? C.yel2 : C.yel0);
      g.set(x, Math.round(cy - 1), near ? C.white : C.yel1);
      g.set(x, Math.round(cy), near ? C.yel2 : C.yel0);
    }
    // the direct converter: gold fins, power out by wire (no turbines, no steam)
    const fx = hx + hw + 2;
    for (let k = 0; k < 6; k++) {
      pc.vline(fx + k * 2, base - 26 + (k % 2), 22 - (k % 2), k % 2 ? C.org1 : C.yel0);
      if (k % 2 === 0) g.set(fx + k * 2, base - 26, C.yel1);
    }
    pc.hline(fx - 1, base - 27, 13, C.ink8);
    pc.rect(fx - 1, base - 4, 13, 4, C.ink7);
    transformerYard(pc, fx + 14, base, 1, false);
    // helium-3 canisters from the Moon, with a crescent on the rack
    for (let k = 0; k < 3; k++) {
      const cx = W - 26 + k * 7;
      pc.rect(cx, base - 12, 5, 10, C.white);
      pc.vline(cx + 4, base - 12, 10, C.ink8);
      pc.rect(cx, base - 13, 5, 1, C.yel0);
      pc.rect(cx, base - 3, 5, 1, C.yel0);
    }
    pc.set(W - 22, base - 17, C.yel1);
    pc.set(W - 21, base - 18, C.yel1);
    pc.set(W - 21, base - 16, C.yel1);
    pc.set(W - 20, base - 18, C.yel1);
    pc.set(W - 20, base - 16, C.yel1);
    g.set(W - 21, base - 18, C.yel1);
    unitPlate(pc, g, hx + 18, base - 12, unit, C.yel1);
    windowGrid(pc, g, hx + 52, base - 11, 9, 1, { ww: 3, wh: 2, gx: 3, seed: 40 + unit, lit: 0.6 });
    lushTree(pc, W - 4, base, 3, 9 + unit, 0);
    finish(pc, W, H, bd);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 30, H] }, fps: 4 };
}

/** One plant of a fusion fleet, of the given design (unit number for the plate). */
export function fusionPlant(design: FusionDesignId, unit: number, bd: Backdrop, r: Ramp4): FacilityArt {
  switch (design) {
    case 'stellarator':
      return stellarator(unit, bd, r);
    case 'laser':
      return laser(unit, bd, r);
    case 'pinch':
      return pinch(unit, bd, r);
    case 'dhe3':
      return dhe3(unit, bd);
    default:
      return tokamak(unit, bd, r);
  }
}

// ── direct air capture: fan walls and stone-injection wellheads ────────────────────────────
export const DAC_W = 204;
const DAC_H = 58;

function fan(pc: PixelCanvas, g: PixelCanvas, cx: number, cy: number, f: number, on: boolean) {
  const R = 5;
  for (let y = cy - R - 1; y <= cy + R; y++) {
    for (let x = cx - R - 1; x <= cx + R; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > R + 0.4) continue;
      pc.set(x, y, d > R - 0.8 ? (y < cy ? C.ink5 : C.ink6) : C.ink2);
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = ((k * 90 + f * 30) * Math.PI) / 180;
    for (let s = 1.5; s < R - 0.6; s += 0.7) pc.set(Math.floor(cx + Math.cos(a) * s), Math.floor(cy + Math.sin(a) * s), C.ink6);
  }
  pc.rect(cx - 1, cy - 1, 2, 2, C.ink7);
  if (on) g.set(cx - 1, cy - 1, C.grn6);
}

export function dacFarm(bd: Backdrop, r: Ramp4, seed: number): FacilityArt {
  const W = DAC_W;
  const H = DAC_H;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 3; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // two banks of contactors: a wall of big fans over the sorbent filters
    for (const [bx, bw] of [[4, 70], [78, 70]] as [number, number][]) {
      const top = base - 38;
      pc.rect(bx, top, bw, base - 3 - top, C.ink8);
      pc.hline(bx - 1, top - 1, bw + 2, C.white);
      pc.rect(bx, top, bw, 2, r.base);
      pc.hline(bx, top, bw, r.lit);
      for (let row = 0; row < 2; row++) {
        for (let k = 0; k < 5; k++) fan(pc, g, bx + 8 + k * 13, top + 9 + row * 12, f + k + row, (k + row + seed) % 3 === 0);
      }
      // sorbent filter panels under the fans (honeycomb)
      for (let y = top + 27; y < base - 4; y++) for (let x = bx + 2; x < bx + bw - 2; x++) pc.set(x, y, (x + (y % 2) * 2) % 4 === 0 ? C.ink4 : y % 2 ? C.ink5 : C.ink6);
      facadeShade(pc, bx, top + 2, bw, base - top - 5, C.ink8, C.ink7, 0.7);
      // legs
      pc.rect(bx, base - 3, bw, 3, C.ink6);
      for (let x = bx + 2; x < bx + bw; x += 8) pc.rect(x, base - 3, 3, 3, C.ink7);
      pc.vline(bx + bw - 1, top, base - top, C.ink6);
    }
    // the CO2 line to the compressor and on to the wellheads
    pipe(pc, 148, base - 8, 22, base, C.ink8, C.ink6, 7);
    const cx = 152;
    pc.rect(cx, base - 18, 18, 15, C.ink7);
    pc.hline(cx, base - 18, 18, C.ink9);
    pc.rect(cx + 2, base - 14, 6, 3, C.ink2);
    g.rect(cx + 3, base - 13, 4, 1, C.yel1);
    drawText(pc, 'CO2', cx + 3, base - 9, C.grn6);
    drawText(g, 'CO2', cx + 3, base - 9, C.grn6);
    pipe(pc, cx + 18, base - 6, W - cx - 18, null, C.ink7, C.ink5);
    // stone-injection wellheads: the gas goes down into basalt and turns to rock
    for (const wx of [180, 196]) {
      pc.rect(wx - 3, base - 2, 7, 2, C.ink7);
      pc.vline(wx, base - 12, 10, C.ink6);
      pc.vline(wx + 1, base - 12, 10, C.ink4);
      for (const y of [base - 11, base - 7]) {
        pc.hline(wx - 2, y, 6, C.ink5);
        pc.set(wx - 2, y - 1, C.red3);
        pc.set(wx + 3, y - 1, C.red3);
      }
      pc.rect(wx - 1, base - 14, 4, 2, C.ink7);
    }
    // a slim derrick over the newest well
    for (let y = base - 40; y < base; y++) {
      const half = Math.floor(((y - (base - 40)) / 40) * 6);
      pc.set(188 - half, y, C.ink6);
      pc.set(188 + half, y, C.ink6);
      if ((y - base) % 6 === 0) pc.hline(188 - half, y, half * 2 + 1, C.ink7);
    }
    beacon(pc, g, 188, base - 41, f === 0);
    // the plate: how much it pulls out of the sky
    const t = 'DAC';
    pc.rect(6, base - 48, measureText(t) + 4, 7, C.ink1);
    drawText(pc, t, 8, base - 47, C.grn6);
    drawText(g, t, 8, base - 47, C.grn6);
    pc.vline(8, base - 41, 2, C.ink6);
    person(pc, 150, base, 300 + seed);
    fence(pc, 172, base - 6, W - 172);
    finish(pc, W, H, bd);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [164, H] }, fps: 6 };
}

/** How many DAC farm blocks a site's air capture shows (Gt CO₂ per year). */
export function dacBlocks(gt: number): number {
  if (gt <= 0) return 0;
  return Math.max(1, Math.min(5, Math.round(1 + Math.log2(gt / 0.5))));
}
