/**
 * Act V: the L4 and L5 yards (sites 'l4', 'l5', from `yardsView`) and the Moon's foundry. Foundry
 * modules clamp onto the truss: a smelter tower fed from the hopper, a hull of machinery, radiator
 * fins, and an open fabrication bay where two robot arms make what the yards are making — thin-film
 * collector sheets, radiator rings for the compute rings, or curved hull plates for the habitats.
 * One module is always a half-built copy of its neighbour, printed from the bottom up out of its
 * cyan blueprint (the foundries copy themselves). Finished products leave from the outbound cradle
 * on the left and drift off toward the swarm; feed arrives on the right, in capsules from the Moon's
 * mass driver caught by a big cone, and slides along the truss to the hoppers.
 * Drift: warning lights and a quarantine net over one module; halted: arms frozen, lights dimmed;
 * Solar Maximum's storm: flickering lights and sparks crawling over the radiators.
 * Pure PixelCanvas code with palette indices only.
 */
import { C } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { FacilityArt, Mover } from './art';
import { roundShade, STEEL } from './draw';
import type { Ramp4 } from './act3kit';
import { blueprintReveal, glowBelow, plate, quarantineNet, roboArm, tugFrames, warnLight } from './act5kit';
import { moonGround } from './moon';

/** What a module makes: c collectors, r radiator rings, h hull sections. */
export type Product = 'c' | 'r' | 'h';

export interface YardFlags {
  halted: boolean;
  /** Solar Maximum: 0 none, 1..3. */
  storm: number;
  /** Quarantine level on this piece (a drifting strain): 0 none, 1..3. */
  q: number;
}

export function flagString(f: Partial<YardFlags>): string {
  return `${f.halted ? 'h' : ''}${f.storm ? `s${f.storm}` : ''}${f.q ? `q${f.q}` : ''}`;
}

export function parseFlags(s: string | undefined): YardFlags {
  const t = s ?? '';
  return { halted: t.includes('h'), storm: Number(/s(\d)/.exec(t)?.[1] ?? 0), q: Number(/q(\d)/.exec(t)?.[1] ?? 0) };
}

export const MODULE_W = 114;
export const MODULE_H = 100;

interface ModuleOpts {
  f: number;
  frames: number;
  product: Product;
  flags: YardFlags;
  r: Ramp4;
  num: number;
  seed: number;
  /** Arms parked, no sparks (a copy being printed). */
  rest?: boolean;
}

/** Does this pixel flicker off in the storm this frame? */
const flick = (x: number, y: number, f: number, storm: number) => storm > 0 && hash2(x * 3 + f, y, 77) < storm * 0.12;

/** One foundry module at (ox, base). */
function drawModule(pc: PixelCanvas, g: PixelCanvas, ox: number, base: number, o: ModuleOpts) {
  const { f, frames, product, flags, r } = o;
  const live = !flags.halted && !o.rest;
  const ph = (f / frames) * Math.PI * 2;
  // ── the pressurised tube that links each module to its neighbours
  for (const [x0, x1] of [[ox, ox + 6], [ox + 110, ox + MODULE_W]] as [number, number][]) {
    for (let x = x0; x < x1; x++) {
      pc.set(x, base - 31, C.ink9);
      pc.set(x, base - 30, C.ink8);
      pc.set(x, base - 29, C.ink7);
      pc.set(x, base - 28, C.ink5);
      if (x % 4 === 0) pc.vline(x, base - 31, 4, C.ink6);
    }
  }
  // ── the feed pipe up the left side into the hopper
  for (let y = base - 70; y < base; y++) {
    pc.set(ox + 1, y, C.ink8);
    pc.set(ox + 2, y, C.ink6);
    if (y % 8 === 0) pc.set(ox + 1, y, C.ink5);
  }
  pc.hline(ox + 1, base - 71, 9, C.ink8);
  pc.hline(ox + 1, base - 70, 9, C.ink6);
  // ── mounting clamps on the truss
  for (const fx of [10, 60]) {
    for (let y = base - 5; y <= base; y++) {
      const k = y - (base - 5);
      pc.hline(ox + fx - k, y, 11 + k * 2, k === 0 ? C.ink7 : C.ink5);
    }
    pc.set(ox + fx - 5, base, C.ink3);
    pc.set(ox + fx + 15, base, C.ink3);
  }
  // ── the hull: a blocky front face lit from the left, panel seams, a livery band
  const hx0 = ox + 4;
  const hx1 = ox + 82;
  const ht = base - 48;
  const hb = base - 5;
  for (let y = ht; y < hb; y++) {
    for (let x = hx0; x < hx1; x++) {
      const t = (x - hx0) / (hx1 - hx0);
      let c = x - hx0 < 2 ? C.ink9 : t < 0.45 ? C.ink8 : ditherAt(x, y, (t - 0.45) * 1.8) ? C.ink7 : C.ink8;
      if ((x - hx0) % 13 === 12) c = C.ink6;
      if (y === ht) c = C.white;
      else if (y === ht + 1) c = C.ink9;
      else if (y >= hb - 2) c = C.ink6;
      pc.set(x, y, c);
    }
  }
  pc.vline(hx1 - 1, ht, hb - ht, C.ink5);
  for (let x = hx0; x < hx1; x++) {
    pc.set(x, ht + 5, r.base);
    pc.set(x, ht + 6, r.mid);
  }
  for (let x = hx0 + 2; x < hx1; x += 6) pc.set(x, hb - 3, C.ink5);
  // vents and a hatch
  for (let k = 0; k < 4; k++) pc.hline(ox + 60, base - 22 + k * 3, 12, C.ink6);
  pc.rect(ox + 36, base - 18, 9, 13, C.ink6);
  pc.box(ox + 36, base - 18, 9, 13, C.ink5);
  pc.set(ox + 43, base - 12, C.ink9);
  // ── the window row
  for (let k = 0; k < 9; k++) {
    const wx = ox + 34 + k * 5;
    const wy = base - 37;
    pc.rect(wx - 1, wy - 1, 4, 4, C.ink5);
    pc.rect(wx, wy, 2, 2, C.ink2);
    pc.set(wx, wy, C.blu3);
    const lit = flags.halted ? k % 3 === 0 : !flick(wx, wy, f, flags.storm) && hash2(k, o.seed + o.num, 3) > 0.2;
    if (lit) g.rect(wx, wy, 2, 2, flags.q >= 2 ? (k % 2 ? C.pnk0 : C.vio4) : k % 4 === 1 ? C.cyn5 : C.yel1);
  }
  // the module's number plate
  plate(pc, g, `F${o.num}`, ox + 48, base - 24, C.cyn5);
  // ── the smelter tower (a drum) and its furnace port
  const sx0 = ox + 6;
  const sx1 = ox + 30;
  const st = base - 62;
  for (let y = st; y < hb; y++) for (let x = sx0; x < sx1; x++) pc.set(x, y, roundShade(STEEL, x + 0.5 - (sx0 + sx1) / 2, (sx1 - sx0) / 2, x, y));
  for (let y = st + 6; y < hb; y += 9) pc.hline(sx0, y, sx1 - sx0, C.ink6);
  pc.hline(sx0, st, sx1 - sx0, C.white);
  const fcx = ox + 18;
  const fcy = base - 30;
  for (let y = fcy - 6; y <= fcy + 6; y++) {
    for (let x = fcx - 6; x <= fcx + 6; x++) {
      const d = Math.hypot(x - fcx, y - fcy);
      if (d > 6) continue;
      if (d > 4.6) pc.set(x, y, C.ink4);
      else if (flags.halted) pc.set(x, y, d < 2 ? C.red2 : C.red1);
      else {
        const k = (Math.floor(d * 1.3) + f) % 3;
        const c = d < 1.6 ? C.yel2 : [C.yel1, C.org2, C.org1][k];
        pc.set(x, y, c);
        g.set(x, y, c);
      }
    }
  }
  // the hopper on top, heaped with hauled rock
  for (let y = base - 76; y < st; y++) {
    const k = (y - (base - 76)) / (st - (base - 76));
    const hw = Math.round(12 - k * 6);
    for (let x = ox + 18 - hw; x < ox + 18 + hw; x++) pc.set(x, y, x < ox + 18 - hw + 2 ? C.ink9 : x > ox + 18 + hw - 3 ? C.ink5 : C.ink7);
  }
  for (let x = ox + 7; x < ox + 29; x++) {
    pc.set(x, base - 77, hash2(x, 1, o.seed) > 0.5 ? C.rck4 : C.rck2);
    if (hash2(x, 2, o.seed) > 0.6) pc.set(x, base - 78, (x + f) % 5 === 0 && live ? C.rck5 : C.rck3);
  }
  // ── the cupola
  for (let y = base - 56; y < ht; y++) for (let x = ox + 40; x < ox + 56; x++) pc.set(x, y, y === base - 56 ? C.white : x < ox + 43 ? C.ink9 : C.ink7);
  pc.hline(ox + 42, base - 53, 12, C.ink1);
  pc.hline(ox + 42, base - 52, 12, C.cyn3);
  if (!flags.halted && !flick(ox + 44, base - 52, f, flags.storm)) g.hline(ox + 42, base - 52, 12, C.cyn5);
  pc.set(ox + 43, base - 53, C.white);
  // ── radiators: thin white fins edge-on to the sun (two to four of them, module by module)
  const nRad = 2 + ((o.seed + o.num) % 3);
  const radX = [58, 64, 70, 76].slice(0, nRad);
  const tops = radX.map((_, i) => base - 90 + i * 4 + Math.round(hash2(i, o.num, 5) * 6));
  radX.forEach((rx, i) => {
    const x = ox + rx;
    for (let y = tops[i]; y < ht; y++) {
      pc.set(x, y, C.white);
      pc.set(x + 1, y, (y - tops[i]) % 4 === 0 ? C.ink7 : C.ink8);
      pc.set(x + 2, y, C.ink6);
      if (flags.storm && hash2(x, y, f + 9) < flags.storm * 0.05) {
        const c = hash2(x, y, f) > 0.5 ? C.cyn6 : C.vio5;
        pc.set(x - 1, y, c);
        g.set(x - 1, y, c);
      }
    }
  });
  if (flags.halted) warnLight(pc, g, ox + 58, tops[0] - 3, true, false);
  else {
    pc.set(ox + 58, tops[0] - 1, f % 2 ? C.red1 : C.red3);
    if (f % 2 === 0) g.set(ox + 58, tops[0] - 1, C.red3);
  }
  // a dish on some, a mast with a strobe on others
  if (o.seed === 1) {
    pc.vline(ox + 50, base - 64, 8, C.ink7);
    for (let k = -4; k <= 4; k++) {
      pc.set(ox + 51 + k, base - 66 - Math.round(k * 0.5), C.white);
      pc.set(ox + 52 + k, base - 65 - Math.round(k * 0.5), Math.abs(k) < 3 ? C.ink8 : C.ink6);
    }
    pc.line(ox + 50, base - 64, ox + 53, base - 69, C.ink7);
  } else if (o.seed === 2) {
    pc.vline(ox + 36, base - 66, 18, C.ink8);
    pc.vline(ox + 37, base - 66, 18, C.ink6);
    for (let y = base - 64; y < base - 50; y += 4) pc.hline(ox + 35, y, 4, C.ink7);
    const on = f % 3 === 0 && !flags.halted;
    pc.set(ox + 36, base - 67, on ? C.white : C.ink6);
    if (on) g.set(ox + 36, base - 67, C.white);
  }
  // ── the fabrication bay: an open frame
  const bx0 = ox + 84;
  const bx1 = ox + 111;
  const bt = base - 68;
  for (let y = bt; y < hb; y++) {
    pc.set(bx0, y, C.ink8);
    pc.set(bx0 + 1, y, C.ink6);
    pc.set(bx1, y, C.ink7);
    pc.set(bx1 + 1, y, C.ink5);
  }
  pc.hline(bx0, bt, bx1 - bx0 + 2, C.ink9);
  pc.hline(bx0, bt + 1, bx1 - bx0 + 2, C.ink6);
  pc.hline(bx0, hb, bx1 - bx0 + 2, C.ink6);
  pc.line(bx0 + 2, bt + 2, bx0 + 7, bt + 7, C.ink6);
  pc.line(bx1 - 1, bt + 2, bx1 - 6, bt + 7, C.ink6);
  const lamp = !flags.halted && !flick(bx1, hb - 6, f, flags.storm);
  pc.set(bx1 - 2, hb - 3, lamp ? C.grn6 : C.grn2);
  if (lamp) g.set(bx1 - 2, hb - 3, C.grn6);
  // ── the product and the two arms working on it
  const cx = ox + 97;
  const cy = base - 36;
  const pick = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const swing = live ? (Math.sin(ph) + 1) / 2 : 0.3;
  const jit = flags.q >= 3 && live ? Math.sin(ph * 3) * 4 : 0;
  let ta: [number, number];
  let tb: [number, number];
  let sparkB = live;
  if (product === 'c') {
    // a roll of thin film under the top beam, a sheet hanging from it, glinting as it turns
    const rx = cx;
    const ry = bt + 7;
    for (let y = ry - 4; y <= ry + 4; y++) for (let x = rx - 4; x <= rx + 4; x++) {
      const d = Math.hypot(x - rx, y - ry);
      if (d <= 4.2) pc.set(x, y, d > 3.2 ? C.ink6 : d > 1.5 ? (x < rx ? C.blu4 : C.blu3) : C.ink8);
    }
    const top = ry + 3;
    const len = 34;
    const skew = 7;
    const glintAt = live ? (f / frames) * (len + 16) - 8 : 12;
    for (let v = 0; v < len; v++) {
      const sh = Math.round((v / len) * skew);
      for (let u = 0; u < 12; u++) {
        const x = rx - 6 + u - sh;
        const y = top + v;
        let c = u % 4 === 0 || v % 5 === 0 ? C.ink7 : (u + v) % 2 ? C.blu3 : C.blu2;
        const gd = Math.abs(v + u * 0.6 - glintAt);
        if (gd < 1.5) c = C.white;
        else if (gd < 3.5 && c !== C.ink7) c = C.sky4;
        if (flags.storm && hash2(u + f * 5, v, 31) < flags.storm * 0.08) c = hash2(u, v, f) > 0.5 ? C.vio4 : C.cyn5;
        pc.set(x, y, c);
        if (gd < 1.5 || (flags.storm && c === C.cyn5)) g.set(x, y, gd < 1.5 ? C.sky5 : C.cyn5);
      }
    }
    // A smooths the film by the roll; B trims the bottom edge with its torch
    ta = pick([rx - 8, top + 8], [rx - 10, top + 20], swing);
    ta[0] += jit;
    tb = pick([rx + 6 - skew, top + len], [rx - 6 - skew, top + len], live ? f / Math.max(1, frames - 1) : 0.5);
  } else if (product === 'r') {
    // a radiator ring assembled sector by sector (the missing sectors still a blueprint)
    const R = 12;
    const built = live ? 6 + f : 8;
    for (let k = 0; k < 12; k++) {
      for (let a = 0; a < 12; a++) {
        const t = ((k + a / 12) / 12) * Math.PI * 2 - Math.PI / 2;
        for (const rr of [R, R - 1]) {
          const x = Math.round(cx + Math.cos(t) * rr);
          const y = Math.round(cy + Math.sin(t) * rr);
          if (k < built) pc.set(x, y, rr === R ? (Math.cos(t) < 0.2 ? C.white : C.ink8) : C.ink6);
          else if ((a + f) % 3 === 0) {
            pc.set(x, y, C.cyn3);
            g.set(x, y, C.cyn4);
          }
        }
        if (k < built && a === 6) {
          const x = Math.round(cx + Math.cos(t) * (R + 2));
          const y = Math.round(cy + Math.sin(t) * (R + 2));
          pc.set(x, y, C.ink7);
        }
      }
    }
    const tNext = ((built + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
    const tJoint = (built / 12) * Math.PI * 2 - Math.PI / 2;
    ta = [cx + Math.cos(tNext) * (R + 1) + jit, cy + Math.sin(tNext) * (R + 1)];
    tb = [cx + Math.cos(tJoint) * R, cy + Math.sin(tJoint) * R];
    if (!live) ta = [cx - 6, bt + 10];
  } else {
    // a curved hull plate for a habitat standing in the bay, ribbed inside, its seam welded as it goes
    const y0 = bt + 6;
    const y1 = hb - 4;
    const mid = (y0 + y1) / 2;
    const half = (y1 - y0) / 2;
    const bow = (y: number) => Math.round(bx0 + 7 + (1 - ((y - mid) / half) ** 2) * 9);
    const seamT = live ? f / Math.max(1, frames - 1) : 0.4;
    const seamY = Math.round(y1 - seamT * (y1 - y0));
    for (let y = y0; y <= y1; y++) {
      const x = bow(y);
      pc.set(x, y, C.white);
      pc.set(x + 1, y, C.ink9);
      pc.set(x + 2, y, C.ink8);
      pc.set(x + 3, y, C.ink7);
      pc.set(x + 4, y, C.ink5);
      if ((y - y0) % 7 === 3) pc.hline(x - 3, y, 3, C.ink6);
      // the weld bead up the outer face, glowing where it's fresh
      if (y >= seamY) {
        pc.set(x + 5, y, y - seamY < 4 && live ? C.org2 : C.ink8);
        if (y - seamY < 4 && live) g.set(x + 5, y, C.org1);
      }
    }
    pc.hline(bow(y0) - 1, y0 - 1, 6, C.ink6);
    pc.hline(bow(y1) - 1, y1 + 1, 6, C.ink6);
    ta = [bow(y0 + 4) - 2 + jit, y0 + 4];
    tb = [bow(seamY) + 6, seamY];
    sparkB = live;
  }
  // arm A from the hull's top corner; arm B from the bay floor
  roboArm(pc, g, ox + 79, ht - 1, ta[0], ta[1], 15, 15, { up: true, tool: product === 'c' ? 'grip' : 'claw', look: undefined });
  roboArm(pc, g, ox + 105, hb - 1, tb[0], tb[1], 14, 13, { up: false, tool: 'torch', spark: sparkB, seed: f + o.seed * 7, mount: 'floor' });
  if (flags.halted) {
    plate(pc, g, 'HALT', ox + 8, base - 20, C.yel1, C.red1, C.red3);
  }
}

/** A foundry module making `product`. */
export function foundryModule(product: Product, flags: YardFlags, r: Ramp4, num: number, seed: number): FacilityArt {
  const W = MODULE_W;
  const H = MODULE_H;
  const base = H - 1;
  const n = flags.halted ? 2 : 6;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < n; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    drawModule(pc, g, 0, base, { f, frames: n, product, flags, r, num, seed });
    if (flags.q) quarantineNet(pc, g, 1, base - 95, W - 2, 91, flags.q, f);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: flags.halted ? 1 : 4 };
}

/**
 * The self-copy: the next module being printed out of its blueprint, layer by layer, over a loop
 * (a gantry carries the print head; the finished part's lights come on as it rises).
 */
export function foundryCopy(product: Product, flags: YardFlags, r: Ramp4, num: number, seed: number): FacilityArt {
  const W = MODULE_W;
  const H = MODULE_H;
  const base = H - 1;
  const src = new PixelCanvas(W, H);
  const srcG = new PixelCanvas(W, H);
  drawModule(src, srcG, 0, base, { f: 0, frames: 6, product, flags: { halted: false, storm: 0, q: 0 }, r, num, seed, rest: true });
  const K = flags.halted ? 1 : 12;
  const topY = base - 90;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let k = 0; k < K; k++) {
    const p = flags.halted ? 0.5 : 0.1 + 0.86 * (k / (K - 1));
    const cut = Math.round(topY + (1 - p) * (base - topY));
    const g = new PixelCanvas(W, H);
    const pc = blueprintReveal(src, g, cut, k);
    glowBelow(srcG, g, Math.max(cut, base - 40));
    // the printer: posts either side, a beam riding the cut line and its head
    for (let y = topY - 2; y <= base; y++) {
      pc.set(0, y, C.ink7);
      pc.set(W - 1, y, C.ink5);
      if (y % 6 === 0) pc.set(1, y, C.ink5);
    }
    const by = Math.max(topY, cut - 2);
    pc.hline(0, by, W, C.ink8);
    pc.hline(0, by + 1, W, C.ink5);
    const span = W - 14;
    const u = flags.halted ? 0.3 : (k * 0.37) % 1;
    const hx = 5 + Math.round((u < 0.5 ? u * 2 : 2 - u * 2) * span);
    pc.rect(hx, by - 3, 5, 3, C.ink8);
    pc.hline(hx, by - 3, 5, C.white);
    pc.vline(hx + 2, by + 2, 2, C.ink4);
    if (!flags.halted) {
      for (const [dx, dy, c] of [[2, 4, C.white], [1, 5, C.yel2], [4, 4, C.org2], [0, 3, C.yel1]] as [number, number, number][]) {
        pc.set(hx + dx, by + dy, c);
        g.set(hx + dx, by + dy, c);
      }
    }
    warnLight(pc, g, W - 4, topY - 4, k % 2 === 0 && !flags.halted, false);
    plate(pc, g, `F${num}`, 4, base - 10, C.cyn5);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1.5 };
}

// ── products in flight ─────────────────────────────────────────────────────────────────────
/** A product tumbling at angle th, centred at (x, y); `fade` 0..1 dithers it out with distance. */
function drawProduct(pc: PixelCanvas, g: PixelCanvas, kind: Product, x: number, y: number, th: number, fade: number, storm: number, f: number) {
  const keep = (px: number, py: number) => bayer(px, py) < fade * 16;
  if (kind === 'c') {
    const t = Math.cos(th);
    const hh = Math.max(1, Math.round(Math.abs(t) * 13));
    const edgeOn = hh <= 2;
    for (let v = 0; v < hh; v++) {
      const sh = Math.round((v / Math.max(1, hh)) * 6 * Math.sign(t || 1));
      for (let u = 0; u < 26; u++) {
        const px = x - 13 + u - sh;
        const py = y - Math.floor(hh / 2) + v;
        if (!keep(px, py)) continue;
        let c = edgeOn ? C.white : u % 6 === 0 || v === 0 || v === hh - 1 ? C.ink8 : t > 0.75 ? C.sky4 : t > 0 ? C.blu3 : C.blu1;
        if (storm && hash2(u + f * 3, v, 61) < storm * 0.07) c = hash2(u, v, f) > 0.5 ? C.vio4 : C.cyn5;
        pc.set(px, py, c);
        if (edgeOn || (t > 0.85 && (u + v) % 7 === 0)) g.set(px, py, C.sky5);
      }
    }
  } else if (kind === 'r') {
    // a radiator ring: a band with a lit near side, tumbling
    const c = Math.abs(Math.cos(th));
    const R = 10;
    const ry = Math.max(1.2, R * c);
    for (let py = Math.floor(y - ry - 1); py <= y + ry + 1; py++) {
      for (let px = x - R - 1; px <= x + R + 1; px++) {
        const u = (px + 0.5 - x) / R;
        const v = (py + 0.5 - y) / ry;
        const d = u * u + v * v;
        const inner = (px + 0.5 - x) ** 2 / (R - 2.6) ** 2 + (py + 0.5 - y) ** 2 / Math.max(0.4, ry - 2.6 * c) ** 2;
        if (d > 1 || inner < 1 || !keep(px, py)) continue;
        const near = py > y || c < 0.3;
        pc.set(px, py, u < -0.6 ? C.white : near ? (u < 0.3 ? C.ink9 : C.ink7) : C.ink6);
        if (c < 0.3 && u < 0) g.set(px, py, C.ink9);
      }
    }
  } else {
    // a hull plate: a thick bowed slab, turning end over end
    for (let a = -10; a <= 10; a++) {
      const t = th + a * 0.06;
      for (let k = 0; k < 4; k++) {
        const rr = 20 - k;
        const px = Math.round(x + Math.cos(t) * rr - Math.cos(th) * 18);
        const py = Math.round(y + Math.sin(t) * rr - Math.sin(th) * 18);
        if (!keep(px, py)) continue;
        pc.set(px, py, k === 0 ? C.white : k === 1 ? C.ink9 : k === 2 ? C.ink8 : C.ink6);
        if (k === 3 && Math.abs(a) % 5 === 0) pc.set(Math.round(x + Math.cos(t) * (rr - 1) - Math.cos(th) * 18), Math.round(y + Math.sin(t) * (rr - 1) - Math.sin(th) * 18), C.ink5);
      }
    }
  }
}

export const OUTBOUND_W = 178;
const OUTBOUND_H = 100;

/** The outbound cradle: finished products released into two lanes, drifting off to the left. */
export function yardsOutbound(main: Product, second: Product | null, flags: YardFlags, r: Ramp4): FacilityArt {
  const W = OUTBOUND_W;
  const H = OUTBOUND_H;
  const base = H - 1;
  const N = flags.halted ? 2 : 8;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const lanes: [Product, number, number][] = [[main, base - 62, 48]];
  if (second) lanes.push([second, base - 28, 56]);
  for (let f = 0; f < N; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const step = flags.halted ? 0 : f / N;
    for (const [kind, ly, spacing] of lanes) {
      for (let i = 0; i < 5; i++) {
        const x = Math.round(132 - (i + step) * spacing);
        if (x < -24) continue;
        const fade = Math.max(0, Math.min(1, (x + 6) / 50));
        drawProduct(pc, g, kind, x, ly + Math.round(Math.sin(x / 31) * 3), x / 22, fade, flags.storm, f);
      }
    }
    // the cradle: posts, beams and a release arm reaching for the next one out
    const c0 = 146;
    for (let y = base - 88; y <= base; y++) {
      pc.set(c0, y, C.ink8);
      pc.set(c0 + 1, y, C.ink6);
      pc.set(W - 3, y, C.ink7);
      pc.set(W - 2, y, C.ink5);
    }
    for (const yy of [base - 88, base - 44]) {
      pc.hline(c0, yy, W - 1 - c0, C.ink9);
      pc.hline(c0, yy + 1, W - 1 - c0, C.ink6);
    }
    for (let y = base - 86; y < base - 44; y += 7) pc.line(c0 + 2, y, W - 4, y + 6, C.ink5);
    const reach = flags.halted ? 0.5 : (Math.sin((f / N) * Math.PI * 2) + 1) / 2;
    roboArm(pc, g, c0 + 2, base - 62, 132 + 10 + reach * 4, base - 64 + reach * 3, 10, 10, { up: true, tool: 'grip', mount: 'none' });
    if (second) roboArm(pc, g, c0 + 2, base - 26, 132 + 8 - reach * 3, base - 28, 9, 9, { up: false, tool: 'grip', mount: 'none' });
    // the control pod
    const py0 = base - 22;
    for (let y = py0; y < base - 3; y++) for (let x = c0 + 6; x < W - 6; x++) pc.set(x, y, y === py0 ? C.white : x < c0 + 9 ? C.ink9 : C.ink8);
    pc.hline(c0 + 6, py0 + 3, W - 12 - c0, r.base);
    for (let x = c0 + 9; x < W - 8; x += 4) {
      pc.rect(x, py0 + 7, 2, 2, C.ink2);
      if (!flags.halted && !flick(x, py0, f, flags.storm)) g.rect(x, py0 + 7, 2, 2, C.yel1);
    }
    for (let y = base - 3; y <= base; y++) pc.hline(c0 + 8 - (y - base + 3), y, W - 16 - c0 + (y - base + 3) * 2, C.ink5);
    const t = 'OUTBOUND';
    const tw = measureText(t) + 4;
    pc.rect(c0 - tw - 2, base - 96, tw, 7, C.ink1);
    pc.hline(c0 - 2, base - 93, 3, C.ink6);
    drawText(pc, t, c0 - tw, base - 95, C.cyn5);
    if (!flags.halted) drawText(g, t, c0 - tw, base - 95, C.cyn5);
    pc.vline(c0 - tw + 2, base - 89, 1, C.ink6);
    warnLight(pc, g, W - 4, base - 92, f % 2 === 0, flags.halted);
    frames.push(pc);
    glows.push(g);
  }
  const movers: Mover[] = flags.halted ? [] : [{ frames: tugFrames(r), path: [[118, base - 40], [26, base - 46]], speed: 9, phase: 0.3, pingpong: true }];
  return { base: frames, glow: glows, points: {}, movers, fps: flags.halted ? 1 : 3 };
}

export const DOCK_W = 156;
const DOCK_H = 104;

/** The mass catcher: a cone of netting that catches the feed capsules, a silo and an ore hauler alongside. */
export function yardsDock(flags: YardFlags, r: Ramp4, label: string): FacilityArt {
  const W = DOCK_W;
  const H = DOCK_H;
  const base = H - 1;
  const ay = base - 54;
  const N = flags.halted ? 2 : 8;
  const rad = (x: number) => 8 + ((x - 62) / (W - 6 - 62)) * 30;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < N; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the hauler parked under the cone, its pods of rock waiting to be emptied
    const hy = base - 18;
    pc.hline(66, hy + 4, 70, C.ink6);
    for (let k = 0; k < 6; k++) {
      const px = 70 + k * 10;
      pc.rect(px, hy, 8, 8, k % 2 ? C.rck3 : C.rck2);
      pc.hline(px, hy, 8, C.rck5);
      pc.vline(px, hy, 8, C.rck4);
      pc.set(px + 3, hy + 3, C.rck1);
    }
    pc.rect(130, hy + 1, 10, 7, C.ink8);
    pc.hline(130, hy + 1, 10, C.white);
    pc.rect(136, hy + 3, 3, 2, C.sky4);
    pc.hline(130, hy + 6, 10, r.base);
    pc.rect(62, hy + 2, 4, 5, C.ink5);
    pc.set(61, hy + 4, flags.halted ? C.ink4 : C.cyn5);
    for (let y = hy + 8; y <= base; y++) if (y % 2) pc.set(100, y, C.ink6);
    // the silo at the narrow end, and its chute to the feed line
    const s0 = 26;
    const s1 = 62;
    for (let y = base - 74; y < base - 30; y++) for (let x = s0; x < s1; x++) pc.set(x, y, roundShade(STEEL, x + 0.5 - (s0 + s1) / 2, (s1 - s0) / 2, x, y));
    for (let y = base - 74; y < base - 30; y += 10) pc.hline(s0, y, s1 - s0, C.ink6);
    for (let x = s0; x < s1; x++) {
      pc.set(x, base - 68, r.base);
      pc.set(x, base - 67, r.mid);
    }
    for (let y = base - 30; y <= base; y++) {
      const k = Math.min(1, (y - (base - 30)) / 10);
      const hw = Math.round(14 - k * 10);
      for (let x = 44 - hw; x < 44 + hw; x++) pc.set(x, y, x < 44 - hw + 2 ? C.ink8 : x > 44 + hw - 3 ? C.ink5 : C.ink7);
    }
    plate(pc, flags.halted ? null : g, label, s0 + 2, base - 62, C.cyn5);
    // the cone: rings and a mesh, lights chasing round the mouth
    for (let x = 62; x < W - 5; x++) {
      const rr = rad(x);
      const yt = Math.round(ay - rr);
      const yb = Math.round(ay + rr);
      pc.set(x, yt, C.ink9);
      pc.set(x, yt + 1, C.ink6);
      pc.set(x, yb, C.ink6);
      pc.set(x, yb - 1, C.ink4);
      for (let y = yt + 2; y < yb - 1; y++) if ((x + y) % 5 === 0 || (x - y + 200) % 5 === 0) pc.set(x, y, bayer(x, y) < 6 ? C.ink5 : C.ink4);
    }
    for (const rx of [62, 84, 106, 128, W - 6]) {
      const rr = rad(rx);
      for (let y = Math.round(ay - rr); y <= Math.round(ay + rr); y++) {
        const v = (y - ay) / rr;
        const dx = Math.round(Math.sqrt(Math.max(0, 1 - v * v)) * rr * 0.18);
        pc.set(rx - dx, y, C.ink8);
        pc.set(rx + dx, y, C.ink6);
      }
    }
    const mr = rad(W - 6);
    for (let k = 0; k < 10; k++) {
      const v = -1 + (k / 9) * 2;
      const y = Math.round(ay + v * mr);
      const on = !flags.halted && (k + f) % 3 === 0;
      pc.set(W - 6, y, on ? C.cyn5 : C.cyn2);
      if (on) g.set(W - 6, y, C.cyn5);
    }
    warnLight(pc, g, W - 7, Math.round(ay - mr) - 3, f % 2 === 0, flags.halted);
    // a capsule from the Moon coming in to the catch
    if (!flags.halted) {
      const u = f / N;
      const cxp = Math.round(W + 4 - u * (W - 50));
      const cyp = ay + Math.round((1 - u) * 6);
      if (cxp > 66) {
        for (let k = 1; k < 12; k++) {
          if (bayer(cxp + k, cyp) > (1 - k / 12) * 14) continue;
          pc.set(cxp + k, cyp, k < 4 ? C.yel1 : C.org1);
          g.set(cxp + k, cyp, k < 4 ? C.yel1 : C.org1);
        }
        pc.rect(cxp - 2, cyp - 1, 3, 3, C.org1);
        pc.set(cxp - 2, cyp - 1, C.yel2);
        g.rect(cxp - 2, cyp - 1, 3, 3, C.yel1);
      } else {
        // caught: a flash at the throat
        for (const [dx, dy] of [[0, 0], [1, -1], [1, 1], [-1, 0], [2, 0]] as [number, number][]) {
          pc.set(64 + dx, ay + dy, C.yel2);
          g.set(64 + dx, ay + dy, C.yel1);
        }
      }
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: flags.halted ? 1 : 4 };
}

/** An empty yard: a berth frame with a beacon, waiting for its first seed. */
export function yardsBerth(w: number, label: string): FacilityArt {
  const W = Math.max(120, w);
  const H = 70;
  const base = H - 1;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const x0 = 30;
    const x1 = 110;
    for (let y = base - 56; y <= base; y++) {
      pc.set(x0, y, C.ink8);
      pc.set(x0 + 1, y, C.ink6);
      pc.set(x1, y, C.ink7);
      pc.set(x1 + 1, y, C.ink5);
    }
    pc.hline(x0, base - 56, x1 - x0 + 2, C.ink9);
    pc.hline(x0, base - 55, x1 - x0 + 2, C.ink6);
    for (let x = x0 + 4; x < x1; x += 10) pc.set(x, base - 54, (x / 10 + f) % 2 ? C.cyn2 : C.cyn5);
    // the berth's clamps, open
    for (const cx of [x0 + 18, x1 - 22]) {
      pc.rect(cx, base - 4, 6, 4, C.ink5);
      pc.hline(cx, base - 4, 6, C.ink7);
      pc.set(cx + 1, base - 5, C.yel0);
      pc.set(cx + 4, base - 5, C.yel0);
    }
    plate(pc, g, `${label} YARDS`, x0 + 4, base - 44, C.white, C.ink1, C.cyn3);
    plate(pc, g, 'AWAITING SEED', x0 + 4, base - 34, C.cyn5, C.ink1);
    warnLight(pc, g, x0, base - 60, f === 0, false);
    warnLight(pc, g, x1, base - 60, f === 1, false);
    for (let x = x1 + 12; x < W - 6; x += 22) {
      pc.vline(x, base - 8, 8, C.ink7);
      pc.set(x, base - 9, f ? C.cyn5 : C.cyn2);
      if (f) g.set(x, base - 9, C.cyn5);
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

// ════════════════════════════════════════ THE MOON'S FOUNDRY ════════════════════════════════════════
/** A compact foundry block on the regolith (52 wide): smelter, hopper, radiator, an arm. */
function lunarBlock(pc: PixelCanvas, g: PixelCanvas, ox: number, base: number, f: number, frames: number, flags: YardFlags, r: Ramp4, num: number, rest = false) {
  const live = !flags.halted && !rest;
  const top = base - 34;
  // printed regolith walls (the Moon's foundries are built of the Moon)
  for (let y = top; y < base; y++) {
    for (let x = ox; x < ox + 40; x++) {
      const t = (x - ox) / 40;
      let c = x - ox < 2 ? C.ink9 : t < 0.5 ? C.ink8 : ditherAt(x, y, (t - 0.5) * 1.6) ? C.ink6 : C.ink7;
      if ((base - y) % 3 === 0) c = c === C.ink9 ? C.ink8 : c === C.ink8 ? C.ink7 : C.ink6;
      if (y === top) c = C.white;
      pc.set(x, y, c);
    }
  }
  for (let x = ox; x < ox + 40; x++) {
    pc.set(x, top + 3, r.base);
    pc.set(x, top + 4, r.mid);
  }
  // the smelter's port
  for (let y = base - 18; y < base - 8; y++) for (let x = ox + 6; x < ox + 16; x++) {
    const edge = y === base - 18 || x === ox + 6 || x === ox + 15;
    const c = edge ? C.ink4 : flags.halted ? C.red1 : [C.yel1, C.org2, C.org1][(x + y + f) % 3];
    pc.set(x, y, c);
    if (!edge && !flags.halted) g.set(x, y, c);
  }
  // windows
  for (let k = 0; k < 4; k++) {
    const wx = ox + 20 + k * 4;
    pc.rect(wx, top + 8, 2, 2, C.ink2);
    if (!flags.halted || k === 0) g.rect(wx, top + 8, 2, 2, flags.q >= 2 ? C.pnk0 : C.yel1);
  }
  plate(pc, g, `M${num}`, ox + 20, base - 14, C.cyn5);
  // the hopper and a radiator
  for (let y = top - 10; y < top; y++) {
    const k = (y - (top - 10)) / 10;
    const hw = Math.round(9 - k * 4);
    for (let x = ox + 12 - hw; x < ox + 12 + hw; x++) pc.set(x, y, x < ox + 12 - hw + 2 ? C.ink9 : x > ox + 12 + hw - 3 ? C.ink5 : C.ink7);
  }
  for (let x = ox + 4; x < ox + 20; x++) if (hash2(x, num, 5) > 0.4) pc.set(x, top - 11, C.ink6);
  for (let y = top - 26; y < top; y++) {
    pc.set(ox + 34, y, C.white);
    pc.set(ox + 35, y, (y % 4 === 0) ? C.ink7 : C.ink8);
    pc.set(ox + 36, y, C.ink6);
  }
  pc.set(ox + 34, top - 27, f % 2 ? C.red1 : C.red3);
  if (f % 2 === 0) g.set(ox + 34, top - 27, C.red3);
  // an arm passing parts to the next block
  const ph = (f / frames) * Math.PI * 2;
  const s = live ? (Math.sin(ph) + 1) / 2 : 0.4;
  roboArm(pc, g, ox + 40, top + 1, ox + 46 + s * 4, top - 4 - s * 8, 9, 9, { up: true, tool: 'torch', spark: live && s > 0.6, seed: f + num });
}

export function lunarFoundryWidth(n: number): number {
  return 26 + n * 52 + 56 + 28;
}

/**
 * The Moon's foundry (Act V): blocks of printed regolith, one more always being printed at the end,
 * feeding capsules down a conveyor to the mass driver's breech. `n` blocks (1..4).
 */
export function lunarFoundry(n: number, flags: YardFlags, r: Ramp4): FacilityArt {
  const W = lunarFoundryWidth(n);
  const H = 82;
  const base = H - 3;
  const K = flags.halted ? 2 : 12;
  // the block being printed, drawn once
  const src = new PixelCanvas(W, H);
  const srcG = new PixelCanvas(W, H);
  const cx0 = 26 + n * 52;
  lunarBlock(src, srcG, cx0, base, 0, 6, flags, r, n + 1, true);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let k = 0; k < K; k++) {
    const g = new PixelCanvas(W, H);
    const p = flags.halted ? 0.5 : 0.1 + 0.86 * (k / (K - 1));
    const cut = Math.round(base - 62 + (1 - p) * 62);
    const pc = blueprintReveal(src, g, cut, k);
    glowBelow(srcG, g, Math.max(cut, base - 30));
    // the regolith feed coming in from the left, in a covered conveyor
    for (let x = 0; x < 26; x++) {
      pc.set(x, base - 6, C.ink8);
      pc.set(x, base - 5, C.ink6);
      pc.set(x, base - 4, C.ink5);
      if ((x + k * 2) % 6 < 2) pc.set(x, base - 5, C.ink4);
      if (x % 8 === 0) pc.vline(x, base - 3, 3, C.ink5);
    }
    for (let i = 0; i < n; i++) lunarBlock(pc, g, 26 + i * 52, base, k % 6, 6, flags, r, i + 1);
    // the printer's gantry over the new block
    for (let y = base - 66; y < base; y++) {
      pc.set(cx0 - 3, y, C.ink7);
      pc.set(cx0 + 44, y, C.ink5);
    }
    const by = Math.max(base - 66, cut - 2);
    pc.hline(cx0 - 3, by, 48, C.ink8);
    pc.hline(cx0 - 3, by + 1, 48, C.ink5);
    const hx = cx0 + 2 + Math.round(((k * 0.37) % 1) * 36);
    pc.rect(hx, by - 3, 4, 3, C.ink8);
    if (!flags.halted) {
      pc.set(hx + 1, by + 2, C.white);
      g.set(hx + 1, by + 2, C.yel2);
      pc.set(hx + 2, by + 3, C.org2);
      g.set(hx + 2, by + 3, C.org2);
    }
    // the conveyor of capsules out to the mass driver
    const c0 = W - 28;
    for (let x = c0; x < W; x++) {
      pc.set(x, base - 8, C.ink8);
      pc.set(x, base - 7, C.ink5);
      if (x % 7 === 0) pc.vline(x, base - 6, 6, C.ink6);
      if (!flags.halted && (x - c0 + k * 3) % 9 < 3) {
        pc.set(x, base - 9, C.yel0);
        if ((x - c0 + k * 3) % 9 === 0) pc.set(x, base - 9, C.org1);
      }
    }
    if (flags.halted) plate(pc, g, 'HALT', 30, base - 50, C.yel1, C.red1, C.red3);
    if (flags.q) quarantineNet(pc, g, 24, base - 64, 46, 64, flags.q, k);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: flags.halted ? 1 : 2 };
}

void bayer;
