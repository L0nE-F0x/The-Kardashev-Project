/**
 * The parallax bands behind (and in front of) a diorama's plots, as pure PixelCanvases: far ridge,
 * mid band, the "back lot" (a distant skyline, or a megaproject running to the horizon), the
 * ground strip with its road, the foreground lip, street-lamp positions and band props (the Jet
 * d'Eau, sailboats). The scene turns these into sprites; the headless previews composite the
 * same canvases, so what you preview is what the player sees.
 */
import type { SiteDef } from '../../content/sites';
import { C } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { backlot, farRidge, foreground, groundStrip, midBand, type RotorSpec } from './art';
import { bands, type CampusLayout } from './layout';
import { alpsRidge, jetFrames, lakeBand, sailboat } from './charterHQ';
import { megaBack } from './mega';
import { lunarBack, lunarFar, lunarFg, lunarGround, lunarMid } from './moon';

/** An animated prop living in a band (it scrolls with that band's parallax). */
export interface BandProp {
  frames: PixelCanvas[];
  glow?: PixelCanvas[];
  /** Top-left in band coordinates (x) and screen coordinates (y). */
  x: number;
  y: number;
  fps: number;
  /** Drift speed in px/s (sailboats), wrapping around `wrap` px. */
  drift?: number;
  wrap?: number;
}

export interface BackBand {
  base: PixelCanvas;
  /** Night lights; several frames blink (aviation lights) in sync. */
  glow: PixelCanvas[];
  /** Screen y of the band's top. */
  y: number;
  /** Small spinning rotors on distant turbines (band coordinates). */
  rotors: RotorSpec[];
  /** Additive bloom strength for the glow (0 = none). */
  bloom: number;
}

export interface SceneBands {
  seed: number;
  far: PixelCanvas;
  mid: PixelCanvas;
  /** Lights in the mid band (villages across the lake). */
  midGlow?: PixelCanvas;
  midProps: BandProp[];
  back?: BackBand;
  ground: PixelCanvas;
  /** Animated ground (the open sea): frames that replace `ground`. */
  groundFrames?: PixelCanvas[];
  fg: PixelCanvas;
  fgFrames?: PixelCanvas[];
  /** x of each street lamp along the road. */
  lamps: number[];
  /** People stroll along the road (not out at sea). */
  walkers: boolean;
}

export function bandSeed(site: SiteDef): number {
  return Math.floor(hash2(site.lat * 10, site.lon * 10, 3) * 1000);
}

/** Every band for a site, sized for a viewport and the scene's width. */
export function sceneBands(site: SiteDef, L: CampusLayout, vw: number, vh: number): SceneBands {
  const b = bands(vw, vh, L.width);
  const seed = bandSeed(site);
  const groundY = b.groundY;
  const lampsUpTo = (end: number) => {
    const out: number[] = [];
    for (let x = 40; x < L.width; x += 90) {
      if (x > end - 10) break;
      out.push(x);
    }
    return out;
  };
  const sc = L.scenery;
  if (sc?.kind === 'moon') {
    // the Moon: crater-rim massifs, a crater plain, regolith with rover tracks; no road, no lamps
    const backH = 40;
    const mb = sc.stage > 0 ? lunarBack(sc.stage, b.backW, backH, seed) : null;
    return {
      seed,
      far: lunarFar(b.farW, b.farH, seed),
      mid: lunarMid(b.midW, b.midH, seed),
      midProps: [],
      back: mb ? { base: mb.base, glow: mb.glow, y: groundY + 1 - backH, rotors: [], bloom: 0.5 } : undefined,
      ground: lunarGround(L.width, b.groundH),
      fg: lunarFg(L.width + 40, b.fgH),
      lamps: [],
      walkers: true,
    };
  }
  if (sc?.kind === 'geneva') {
    const lake = lakeBand(b.midW, b.midH, seed);
    const lakeFrom = L.lakeFrom ?? L.width;
    const jet = jetFrames(Math.round(vh * 0.3));
    const jetX = Math.round(vw * 0.74 + (L.width - vw) * 0.55);
    const waterY = b.midY + lake.waterY + 5;
    const midProps: BandProp[] = [{ frames: jet.base, glow: jet.glow, x: jetX, y: waterY - jet.base[0].h, fps: 5 }];
    for (let i = 0; i < 3; i++) {
      const boat = sailboat(i);
      midProps.push({ frames: [boat], x: Math.round(hash2(i, seed, 5) * b.midW), y: waterY + 2 + i * 3 - boat.h, fps: 0, drift: (i % 2 ? -1 : 1) * (1.2 + i * 0.5), wrap: b.midW + 20 });
    }
    return {
      seed,
      far: alpsRidge(b.farW, b.farH, seed),
      mid: lake.base,
      midGlow: lake.glow,
      midProps,
      ground: groundStrip(site.backdrop, L.width, b.groundH, { lakeFrom }),
      fg: foreground(site.backdrop, L.width + 40, b.fgH, { lakeFrom }),
      lamps: lampsUpTo(lakeFrom),
      walkers: true,
    };
  }
  if (sc?.kind === 'mega' && sc.offshore) {
    const horizon = b.farY + Math.round(b.farH * 0.72);
    const backH = groundY + 1 - (horizon - 30);
    const mb = megaBack(sc.kinds, sc.stage, site.backdrop, true, b.backW, backH, seed, backH - (groundY + 1 - horizon));
    return {
      seed,
      far: farRidge('coast', b.farW, b.farH, seed),
      mid: openSea(b.midW, b.midH, horizon - b.midY, seed),
      midProps: [],
      back: sc.stage > 0 ? { base: mb.base, glow: mb.glow, y: groundY + 1 - backH, rotors: mb.rotors, bloom: 0.5 } : undefined,
      ground: seaStrip(L.width, b.groundH, 0),
      groundFrames: [0, 1, 2, 3].map((f) => seaStrip(L.width, b.groundH, f)),
      fg: seaForeground(L.width + 40, b.fgH, 0),
      fgFrames: [0, 1].map((f) => seaForeground(L.width + 40, b.fgH, f)),
      lamps: [],
      walkers: false,
    };
  }
  const out: SceneBands = {
    seed,
    far: farRidge(site.backdrop, b.farW, b.farH, seed),
    mid: midBand(site.backdrop, b.midW, b.midH, seed, L.beachFrom !== undefined ? L.beachFrom + 10 : undefined),
    midProps: [],
    ground: groundStrip(site.backdrop, L.width, b.groundH, { beachFrom: L.beachFrom, cableX: L.cableX }),
    fg: foreground(site.backdrop, L.width + 40, b.fgH),
    lamps: lampsUpTo(L.beachFrom ?? Infinity),
    walkers: true,
  };
  if (sc?.kind === 'mega' && sc.stage > 0) {
    const backH = 104;
    const mb = megaBack(sc.kinds, sc.stage, site.backdrop, false, b.backW, backH, seed, backH - 44);
    out.back = { base: mb.base, glow: mb.glow, y: groundY + 1 - backH, rotors: mb.rotors, bloom: 0.5 };
  } else if (L.skyline > 0) {
    const bl = backlot(b.backW, b.backH, seed, L.skyline);
    out.back = { base: bl.base, glow: [bl.glow], y: b.backY, rotors: [], bloom: 0.5 };
  }
  return out;
}

// ── the open sea (offshore megaprojects) ───────────────────────────────────────────────────
/** Mid band out at sea: water from the horizon down, a few far-off turbines and a ship. */
function openSea(w: number, h: number, horizon: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const top = Math.max(0, horizon);
  for (let y = top; y < h; y++) {
    const t = (y - top) / Math.max(1, h - top);
    for (let x = 0; x < w; x++) {
      let c = t < 0.15 ? C.sea7 : ditherAt(x, y, t * 1.4) ? C.sea5 : C.sea6;
      if ((x + y * 11 + Math.floor(hash2(y, seed, 3) * 30)) % 19 < 2) c = C.sea7;
      pc.set(x, y, c);
    }
  }
  pc.hline(0, top, w, C.sea8);
  // a far row of turbines on the horizon (too far to see the blades turn)
  for (let x = 12; x < w; x += 9 + Math.floor(hash2(x, seed, 4) * 7)) {
    pc.vline(x, top - 6, 6, C.ink8);
    pc.set(x - 1, top - 7, C.ink8);
    pc.set(x + 1, top - 7, C.ink8);
    pc.set(x, top - 8, C.ink8);
  }
  // a container ship heading for the Rhine
  const sx = Math.floor(hash2(seed, 1, 1) * (w - 40)) + 10;
  pc.rect(sx, top + 2, 22, 2, C.ink6);
  for (let k = 0; k < 6; k++) pc.rect(sx + 2 + k * 3, top, 2, 2, [C.red2, C.blu3, C.org1, C.grn3][k % 4]);
  pc.rect(sx + 19, top - 2, 3, 4, C.ink9);
  return pc;
}

/** The sea where the ground strip would be: swells rolling past (frames 0..3). */
function seaStrip(w: number, h: number, f: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    for (let x = 0; x < w; x++) {
      const swell = Math.sin((x + f * 3) / (9 + y * 0.6) + y * 1.7) + Math.sin((x - f * 2) / 23 + y * 0.9);
      let c = t < 0.15 ? C.sea6 : t < 0.5 ? (ditherAt(x, y, (t - 0.15) * 2.5) ? C.sea5 : C.sea6) : bayer(x, y) < 6 ? C.sea4 : C.sea5;
      if (swell > 1.55) c = t < 0.4 ? C.sea8 : C.sea7;
      else if (swell > 1.3) c = t < 0.4 ? C.sea7 : C.sea6;
      if (swell > 1.8 && hash2(x, y, f) > 0.5) c = C.foam;
      pc.set(x, y, c);
    }
  }
  return pc;
}

function seaForeground(w: number, h: number, f: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.round(4 + Math.sin((x + f * 4) / 11) * 1.5 + Math.sin(x / 5.3) * 0.8);
    for (let y = top; y < h; y++) pc.set(x, y, y === top ? C.sea5 : y - top < 3 ? C.sea3 : C.sea2);
    if ((x + f * 4) % 11 === 0) pc.set(x, top - 1, C.foam);
  }
  return pc;
}
