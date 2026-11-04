/**
 * The orbit view's drawing, free of Pixi so the scene and the headless previews share it: the
 * layout (Earth, the Moon, the three shells), the starfield, the Earth with the real sun, its
 * aurora, its halo and the supergrid glowing on the night side, the Moon and its base by stage,
 * the orbit rings, and every moving thing (data centres, space-solar stations and their beams,
 * launches, debris, the mass driver's payloads, the debris cascade) through an `FxSink`.
 *
 * Coordinates: view space is x right, y up, z toward the viewer, in Earth radii; the camera looks
 * at (lat0, lon0). Screen is the scene's internal pixels.
 */
import { ANCHORS } from '../../content/charter';
import { siteDef } from '../../content/sites';
import type { MoonView, OrbitView, PlanetMapView } from '../../sim/planetView';
import type { RegionId } from '../../content/mapcodes';
import { drawGlobe, drawStars } from '../globe';
import { drawText, measureText } from '../font';
import { C } from '../palette';
import { bayer, fbm, hash2, PixelCanvas } from '../pixels';
import { satelliteCanvas } from '../sprites/charterIcons';
import { greatCircle } from '../worldMap/act3Layers';
import { renderBloom, terrainCanvas } from '../worldMap/terrain';
import type { MapLod } from '../../world/mapData';
import { odcCanvas, odcFrameCanvas, spsCanvas, spsFrameCanvas } from './orbitSprites';

const RAD = Math.PI / 180;
export type Vec3 = [number, number, number];

export interface Cam {
  /** Longitude and latitude the camera looks down on (degrees). */
  lon0: number;
  lat0: number;
}

/** A circular orbit in view space: radius (Earth radii) and two orthonormal in-plane axes. */
export interface Ring {
  R: number;
  u: Vec3;
  w: Vec3;
}

export interface OrbitLayout {
  w: number;
  h: number;
  /** Earth's centre and radius on screen. */
  cx: number;
  cy: number;
  r: number;
  moon: { x: number; y: number; r: number };
  /** Low orbit: a tilted ring fixed in view space. */
  leo: Ring;
  /** Geostationary radius (the ring lies in the equator, so it tilts with the camera). */
  geoR: number;
  /** The cislunar transfer arc, a quadratic Bézier on screen from low orbit out to the Moon. */
  cis: { p0: [number, number]; p1: [number, number]; p2: [number, number] };
  /** The globe layer's canvas: top-left on screen, size, and the margin round the disc. */
  globe: { x: number; y: number; size: number; margin: number };
}

export const LEO_R = 1.2;
const LEO_TILT = -0.3;
const LEO_OPEN = 0.36;

/** Lay the scene out for an internal resolution (phones can be ~800×360, or tall in portrait). */
export function orbitLayout(w: number, h: number): OrbitLayout {
  const portrait = h > w * 1.1;
  const r = Math.max(24, Math.floor(portrait ? Math.min(w * 0.24, h * 0.2) : Math.min(h * 0.3, w * 0.2)));
  const cx = Math.round(portrait ? w * 0.5 : w * 0.43);
  const cy = Math.round(portrait ? h * 0.58 : h * 0.55);
  const mr = Math.max(7, Math.round(r * 0.17));
  const mx = Math.round(portrait ? w * 0.76 : Math.min(w - mr - 16, cx + r * 3.1));
  const my = Math.round(portrait ? Math.max(mr + 20, cy - r * 3) : cy - r * 0.7);
  const geoR = portrait ? 1.75 : 1.95;
  const ca = Math.cos(LEO_TILT);
  const sa = Math.sin(LEO_TILT);
  const sb = Math.sin(LEO_OPEN);
  const cb = Math.cos(LEO_OPEN);
  const leo: Ring = { R: LEO_R, u: [ca, sa, 0], w: [sa * sb, -ca * sb, cb] };
  // the transfer arc leaves low orbit on the Moon's side and bows up and out toward it
  const dx = mx - cx;
  const dy = my - cy;
  const d = Math.hypot(dx, dy) || 1;
  const p0: [number, number] = [cx + (dx / d) * r * 1.3, cy + (dy / d) * r * 1.3];
  const p2: [number, number] = [mx - (dx / d) * (mr + 3), my - (dy / d) * (mr + 3)];
  const bow = d * 0.28;
  const p1: [number, number] = [(p0[0] + p2[0]) / 2 + (dy / d) * bow, (p0[1] + p2[1]) / 2 - (dx / d) * bow * (portrait ? -1 : 1)];
  const margin = 8;
  const size = r * 2 + margin * 2;
  return { w, h, cx, cy, r, moon: { x: mx, y: my, r: mr }, leo, geoR, cis: { p0, p1, p2 }, globe: { x: cx - r - margin, y: cy - r - margin, size, margin } };
}

const terrainMemo = new WeakMap<MapLod, { plain?: PixelCanvas; bloom?: PixelCanvas }>();
/** The map terrain for the globe, with the Solarpunk Bloom regreening painted in from era 2 on (memoised). */
export function orbitTerrain(lod: MapLod, bloom: boolean): PixelCanvas {
  let m = terrainMemo.get(lod);
  if (!m) terrainMemo.set(lod, (m = {}));
  if (!bloom) return (m.plain ??= terrainCanvas(lod));
  if (!m.bloom) {
    const pc = terrainCanvas(lod).clone();
    const b = renderBloom(lod);
    for (let i = 0; i < pc.data.length; i++) if (b.data[i]) pc.data[i] = b.data[i];
    m.bloom = pc;
  }
  return m.bloom;
}

// ── projection ───────────────────────────────────────────────────────────────────────────────
/** A point on the Earth's surface (unit sphere) in view space. */
export function toView(lat: number, lon: number, cam: Cam): Vec3 {
  const p = lat * RAD;
  const p0 = cam.lat0 * RAD;
  const dl = (lon - cam.lon0) * RAD;
  return [Math.cos(p) * Math.sin(dl), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl), Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl)];
}

export function screen(L: OrbitLayout, v: Vec3): { x: number; y: number } {
  return { x: L.cx + v[0] * L.r, y: L.cy - v[1] * L.r };
}

/** In front of the Earth, behind it but beside the disc (visible), or hidden behind it. */
export function depth(L: OrbitLayout, v: Vec3): 'front' | 'back' | 'hidden' {
  if (v[2] >= 0) return 'front';
  return v[0] * v[0] + v[1] * v[1] > 1 + 0.6 / L.r ? 'back' : 'hidden';
}

export function ringPoint(ring: Ring, theta: number, R = ring.R): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [R * (c * ring.u[0] + s * ring.w[0]), R * (c * ring.u[1] + s * ring.w[1]), R * (c * ring.u[2] + s * ring.w[2])];
}

/** A point on the geostationary ring above longitude `lon`. */
export function geoPoint(L: OrbitLayout, cam: Cam, lon: number, R = L.geoR): Vec3 {
  const dl = (lon - cam.lon0) * RAD;
  const p0 = cam.lat0 * RAD;
  return [R * Math.sin(dl), -R * Math.sin(p0) * Math.cos(dl), R * Math.cos(p0) * Math.cos(dl)];
}

export function cisPoint(L: OrbitLayout, u: number): [number, number] {
  const { p0, p1, p2 } = L.cis;
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
}

/** The sun's direction in view space (from the subsolar point). */
export function sunView(sun: { lat: number; lon: number }, cam: Cam): Vec3 {
  return toView(sun.lat, sun.lon, cam);
}

const sunDot = (lat: number, lon: number, sun: { lat: number; lon: number }) =>
  Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD);

// ── the sky ──────────────────────────────────────────────────────────────────────────────────
/** Deep space: a faint band of the Milky Way across the view and a scatter of stars. */
export function paintSky(pc: PixelCanvas, seed = 2045): void {
  pc.rect(0, 0, pc.w, pc.h, C.night0);
  const { w, h } = pc;
  // the galaxy: a soft band rising across the view, a little brighter along its spine, thick with faint stars
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = (y - (h * 0.92 - x * 0.5)) / (h * 0.26);
      const band = Math.exp(-d * d * 1.6) * (0.65 + fbm(x / 70, y / 50, seed, 3) * 0.7);
      if (band < 0.18) continue;
      const lvl = (band - 0.18) * 10;
      if (band > 0.75 && bayer(x, y) < (band - 0.75) * 14) pc.set(x, y, C.vio0);
      else if (bayer(x, y) < Math.min(7, lvl)) pc.set(x, y, C.night1);
      if (hash2(x, y, seed + 9) < band * 0.03) pc.set(x, y, hash2(x, y, seed + 10) < 0.5 ? C.ink5 : C.ink4);
    }
  }
  drawStars(pc, seed, Math.round((w * h) / 420));
  // a few bright stars with a cross glint
  for (let i = 0; i < Math.max(3, Math.round((w * h) / 30000)); i++) {
    const x = Math.floor(hash2(i, 3, seed) * w);
    const y = Math.floor(hash2(i, 4, seed) * h);
    pc.set(x, y, C.white);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pc.set(x + dx, y + dy, hash2(i, 5, seed) < 0.5 ? C.ice1 : C.sky4);
  }
}

/** Star pixels that twinkle (a stable subset of positions for the scene to flicker). */
export function twinklers(L: OrbitLayout, seed = 2045): { x: number; y: number; c: number }[] {
  const out: { x: number; y: number; c: number }[] = [];
  const n = Math.max(8, Math.round((L.w * L.h) / 9000));
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(i, 11, seed) * L.w);
    const y = Math.floor(hash2(i, 12, seed) * L.h);
    const dx = x - L.cx;
    const dy = y - L.cy;
    if (dx * dx + dy * dy < (L.r * 1.4) ** 2) continue;
    out.push({ x, y, c: hash2(i, 13, seed) < 0.3 ? C.yel1 : hash2(i, 13, seed) < 0.6 ? C.cyn6 : C.white });
  }
  return out;
}

// ── the orbit rings ──────────────────────────────────────────────────────────────────────────
/** Walk screen points, calling `set` once per new pixel with a running index (for dashes). */
function walk(points: Iterable<[number, number, 'front' | 'back' | 'hidden']>, set: (x: number, y: number, i: number, d: 'front' | 'back') => void) {
  let lx = NaN;
  let ly = NaN;
  let i = 0;
  for (const [fx, fy, d] of points) {
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x === lx && y === ly) continue;
    lx = x;
    ly = y;
    i++;
    if (d !== 'hidden') set(x, y, i, d);
  }
}

function* ringPixels(L: OrbitLayout, f: (theta: number) => Vec3, R: number): Generator<[number, number, 'front' | 'back' | 'hidden']> {
  const n = Math.ceil(Math.PI * 2 * R * L.r * 1.6);
  for (let k = 0; k <= n; k++) {
    const v = f((k / n) * Math.PI * 2);
    const p = screen(L, v);
    yield [p.x, p.y, depth(L, v)];
  }
}

/**
 * The three shells as faint pixel orbits: low orbit a tilted blue ring, the geostationary belt
 * a dashed grey ellipse in the equator, the cislunar road a dotted violet arc to the Moon. Back
 * halves go in `back` (drawn behind the Earth), front halves in `front`.
 */
export function paintRings(back: PixelCanvas, front: PixelCanvas, L: OrbitLayout, cam: Cam): void {
  walk(ringPixels(L, (th) => ringPoint(L.leo, th), L.leo.R), (x, y, i, d) => {
    if (i % 3 === 2) return;
    (d === 'front' ? front : back).set(x, y, d === 'front' ? C.blu4 : C.blu2);
  });
  walk(ringPixels(L, (th) => geoPoint(L, cam, cam.lon0 + th / RAD), L.geoR), (x, y, i, d) => {
    if (i % 4 >= 2) return;
    (d === 'front' ? front : back).set(x, y, d === 'front' ? C.ink6 : C.ink4);
  });
  const cis = function* (): Generator<[number, number, 'front']> {
    const n = 400;
    for (let k = 0; k <= n; k++) {
      const [x, y] = cisPoint(L, k / n);
      yield [x, y, 'front'];
    }
  };
  walk(cis(), (x, y, i) => {
    if (i % 4 === 0) front.set(x, y, C.vio3);
  });
}

// ── the Earth ────────────────────────────────────────────────────────────────────────────────
export interface GlobeInput {
  terrain: PixelCanvas;
  res: number;
  cam: Cam;
  sun: { lat: number; lon: number };
  planet?: PlanetMapView | null;
  orbit?: OrbitView | null;
  smooth?: boolean;
  /** Seconds (aurora curtains ripple slowly); 0 for a still frame. */
  t?: number;
}

/**
 * Paint the Earth into the globe layer canvas (size `L.globe.size`): the terrain with the real
 * sun and city lights, a soft halo on the sunlit limb, aurora curtains over the night-side poles,
 * the supergrid glowing along its routes at night, fusion plants and rectennas shining, the
 * spaceport's pad lights.
 */
export function paintGlobe(pc: PixelCanvas, L: OrbitLayout, g: GlobeInput): void {
  pc.data.fill(0);
  const m = L.globe.margin;
  const cx = m + L.r;
  const cy = m + L.r;
  const r = L.r;
  const { cam, sun } = g;
  drawGlobe(pc, { terrain: g.terrain, res: g.res, lon0: cam.lon0, lat0: cam.lat0, cx, cy, r, sun, lights: true, atmosphere: false, smooth: g.smooth });
  const sv = sunView(sun, cam);
  // the halo: a thin bright line of air on the sunlit limb fading out into space, a violet rim on the dark side
  for (let y = 0; y < pc.h; y++) {
    for (let x = 0; x < pc.w; x++) {
      if (pc.get(x, y)) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const out = d - r;
      if (out < 0 || out > 5.5) continue;
      const lit = (dx / d) * sv[0] - (dy / d) * sv[1] + sv[2] * 0.25;
      if (out < 0.9) {
        if (lit > 0.5) pc.set(x, y, C.cyn4);
        else if (lit > -0.12) pc.set(x, y, bayer(x, y) < (lit + 0.12) * 26 ? C.cyn3 : C.blu2);
        else pc.set(x, y, C.blu1);
        continue;
      }
      const k = 1 - (out - 0.9) / 4.6;
      if (lit > -0.1) {
        const level = k * k * Math.min(1, lit + 0.5) * 11;
        if (bayer(x, y) < level) pc.set(x, y, out < 2.2 ? C.cyn2 : C.blu1);
      } else if (out < 2.6 && bayer(x, y) < k * 4) pc.set(x, y, C.vio1);
    }
  }
  const t = g.t ?? 0;
  const project = (lat: number, lon: number) => {
    const v = toView(lat, lon, cam);
    return { v, x: cx + v[0] * r, y: cy - v[1] * r };
  };
  // aurora: curtains of light rising off both polar ovals where it's night
  for (const pole of [1, -1]) {
    for (let lon = -180; lon < 180; lon += 1.5) {
      const lat = pole * (66.5 + Math.sin(lon * 3 * RAD + t * 0.2) * 2.2 + Math.sin(lon * 7 * RAD) * 0.8);
      const { v, x, y } = project(lat, lon);
      if (v[2] < 0.06) continue;
      const dark = sunDot(lat, lon, sun);
      if (dark > -0.04) continue;
      const strength = fbm(lon / 24 + t * 0.15, pole * 3, 401, 2);
      if (strength < 0.38) continue;
      const len = 1 + Math.round(strength * 4 * (r / 90));
      const ox = v[0];
      const oy = -v[1];
      const ol = Math.hypot(ox, oy) || 1;
      const sx = (ox / ol) * Math.sqrt(1 - v[2] * v[2]);
      const sy = (oy / ol) * Math.sqrt(1 - v[2] * v[2]);
      for (let k = 0; k <= len; k++) {
        const px = Math.round(x + sx * k * 1.1);
        const py = Math.round(y + sy * k * 1.1);
        const c = k === 0 ? C.grn6 : k < len * 0.5 ? C.cyn5 : k < len ? C.cyn6 : C.vio5;
        if (k > 0 && bayer(px, py) > 12 - k) continue;
        pc.set(px, py, c);
      }
    }
  }
  // the supergrid at night: a thread of light along every online route
  for (const l of g.planet?.links ?? []) {
    if (l.status !== 'online') continue;
    const pts = greatCircle(l.route.a, l.route.b);
    for (let i = 1; i < pts.length; i++) {
      const [lon0, lat0] = pts[i - 1];
      const [lon1, lat1] = pts[i];
      for (let k = 0; k < 6; k++) {
        const f = k / 6;
        const lat = lat0 + (lat1 - lat0) * f;
        const lon = lon0 + (lon1 - lon0) * f;
        const { v, x, y } = project(lat, lon);
        if (v[2] < 0.04 || sunDot(lat, lon, sun) > -0.05) continue;
        const X = Math.round(x - 0.5);
        const Y = Math.round(y - 0.5);
        pc.set(X, Y, (i * 6 + k) % 5 === 0 ? C.white : C.ice2);
        if (r > 70 && bayer(X, Y - 1) < 8 && pc.get(X, Y - 1) !== C.ice2 && pc.get(X, Y - 1) !== C.white) pc.set(X, Y - 1, C.vio2);
      }
    }
  }
  // fusion plants (at night) and rectennas (always) shine
  for (const f of g.planet?.fusion ?? []) {
    if (f.status !== 'online') continue;
    const s = siteDef(f.siteId);
    const { v, x, y } = project(s.lat, s.lon);
    if (v[2] < 0.1 || sunDot(s.lat, s.lon, sun) > -0.05) continue;
    pc.set(Math.round(x - 0.5), Math.round(y - 0.5), C.pnk1);
  }
  for (const rc of g.planet?.rectennas ?? []) {
    const { v, x, y } = project(rc.lat, rc.lon);
    if (v[2] < 0.08) continue;
    const X = Math.round(x - 0.5);
    const Y = Math.round(y - 0.5);
    pc.set(X, Y, rc.status === 'online' ? C.pnk1 : C.ink8);
    if (r > 70 && rc.status === 'online') {
      pc.set(X - 1, Y, C.pnk0);
      pc.set(X + 1, Y, C.pnk0);
    }
  }
  const port = g.orbit?.spaceport ? siteDef(g.orbit.spaceport) : null;
  if (port) {
    const { v, x, y } = project(port.lat, port.lon);
    if (v[2] > 0.08) {
      const X = Math.round(x - 0.5);
      const Y = Math.round(y - 0.5);
      pc.set(X, Y, C.white);
      pc.set(X + 1, Y, C.yel1);
      if ((g.orbit?.pads ?? 0) >= 4) pc.set(X - 1, Y, C.yel1);
    }
  }
}

// ── the Moon ─────────────────────────────────────────────────────────────────────────────────
/** Where the base sits on the Moon's disc (near the south pole), in units of the Moon's radius. */
const BASE_AT: [number, number] = [0.36, -0.5];

/** The Moon's canvas size for a radius. */
export const moonSize = (mr: number) => mr * 2 + 8;

/**
 * The Moon, lit by the real sun (its phase follows the Earth's terminator), with maria and
 * craters, faint earthshine on its night side, and the base by stage: an outpost dome, then a
 * mine pit and its ore heap, then the mass driver's rail running off across the plain.
 */
export function paintMoon(pc: PixelCanvas, mr: number, sv: Vec3, moon: MoonView | null, hover = false): void {
  pc.data.fill(0);
  const c = mr + 4;
  for (let y = 0; y < pc.h; y++) {
    for (let x = 0; x < pc.w; x++) {
      const u = (x + 0.5 - c) / mr;
      const v = -(y + 0.5 - c) / mr;
      const d2 = u * u + v * v;
      if (d2 > 1) continue;
      const z = Math.sqrt(1 - d2);
      const light = u * sv[0] + v * sv[1] + z * sv[2];
      const mare = fbm(u * 2.4 + 5, v * 2.4 + 2, 77, 3) > 0.56;
      const crater = hash2(Math.floor((u + 1) * mr * 0.45), Math.floor((v + 1) * mr * 0.45), 79) < 0.09;
      let col: number;
      if (light > 0.3) col = mare ? C.ink6 : crater ? C.ink7 : d2 > 0.8 ? C.ink8 : C.ink9;
      else if (light > 0.05) col = mare ? C.ink5 : crater ? C.ink6 : C.ink7;
      else if (light > -0.08) col = bayer(x, y) < ((light + 0.08) / 0.13) * 16 ? C.ink6 : C.ink3;
      else col = mare ? C.ink2 : C.ink3;
      pc.set(x, y, col);
    }
  }
  if (hover) pc.ring(c, c, mr + 2.5, C.white);
  const stage = moon?.stage ?? 0;
  if (stage < 1) return;
  const bx = Math.round(c + BASE_AT[0] * mr);
  const by = Math.round(c - BASE_AT[1] * mr);
  // the outpost: a dome with a lit window and a landing pad
  pc.set(bx, by, C.white);
  pc.set(bx + 1, by, C.ink9);
  pc.set(bx, by + 1, C.yel1);
  pc.set(bx + 1, by + 1, C.ink8);
  pc.set(bx - 2, by + 1, C.ink9);
  if (stage >= 2) {
    // the mine: a dark pit and an ore heap beside the dome
    pc.set(bx + 3, by - 1, C.ink1);
    pc.set(bx + 4, by - 1, C.ink1);
    pc.set(bx + 3, by, C.ink0);
    pc.set(bx + 5, by, C.snd4);
  }
  if (stage >= 3) {
    // the mass driver: a long rail of coils running off toward Earth
    const len = Math.max(5, Math.round(mr * 0.72));
    for (let k = 0; k < len; k++) {
      const x = bx - 3 - k;
      const y = by - Math.round(k * 0.4);
      pc.set(x, y, k % 2 ? C.cyn5 : C.ink9);
      if (k % 2 === 0) pc.set(x, y + 1, C.ink4);
    }
  }
}

/** The mass driver's muzzle on the Moon's canvas (where payloads leave), relative to its top-left. */
export function moonMuzzle(mr: number): [number, number] {
  const c = mr + 4;
  const bx = Math.round(c + BASE_AT[0] * mr);
  const by = Math.round(c - BASE_AT[1] * mr);
  const len = Math.max(5, Math.round(mr * 0.72));
  return [bx - 3 - len, by - Math.round((len - 1) * 0.4)];
}

/** The base spot on the Moon's canvas (for blinking beacons and build lights). */
export function moonBase(mr: number): [number, number] {
  const c = mr + 4;
  return [Math.round(c + BASE_AT[0] * mr), Math.round(c - BASE_AT[1] * mr)];
}

// ── labels ───────────────────────────────────────────────────────────────────────────────────
export interface OrbitLabel {
  text: string;
  x: number;
  y: number;
  color: number;
}

const debrisColor = (d: number) => (d >= 60 ? C.red3 : d >= 30 ? C.org1 : C.ink7);

/** Shell names (coloured by how much debris each holds) and the Moon's. */
export function orbitLabels(L: OrbitLayout, cam: Cam, ov: OrbitView | null): OrbitLabel[] {
  const out: OrbitLabel[] = [];
  const debris = ov?.debris ?? { leo: 0, geo: 0, cis: 0 };
  const leoEnd = screen(L, ringPoint(L.leo, 0));
  out.push({ text: 'LOW ORBIT', x: Math.round(leoEnd.x + 4), y: Math.round(leoEnd.y - 3), color: debrisColor(debris.leo) });
  const geoEnd = screen(L, geoPoint(L, cam, cam.lon0 + 90));
  const gt = 'GEOSTATIONARY';
  out.push({ text: gt, x: Math.round(Math.min(L.w - measureText(gt) - 3, geoEnd.x - measureText(gt) / 2)), y: Math.round(geoEnd.y + 5), color: debrisColor(debris.geo) });
  const [mx, my] = cisPoint(L, 0.5);
  out.push({ text: 'CISLUNAR', x: Math.round(mx - measureText('CISLUNAR') / 2), y: Math.round(my - 9), color: debrisColor(debris.cis) });
  const mt = (ov?.moon.stage ?? 0) >= 1 ? 'MOON BASE' : 'MOON';
  out.push({ text: mt, x: Math.round(L.moon.x - measureText(mt) / 2), y: L.moon.y + L.moon.r + 5, color: C.ink8 });
  return out;
}

// ── things that move ─────────────────────────────────────────────────────────────────────────
export interface FxSink {
  /** One pixel; `front` = in front of the Earth (else behind it, beside the disc). */
  px(x: number, y: number, c: number, front: boolean): void;
  /** A sprite (by cache key) with its top-left. */
  spr(key: string, make: () => PixelCanvas, x: number, y: number, front: boolean): void;
}

export interface FxOpts {
  /** Reduced motion: everything holds still (one frozen frame). */
  still?: boolean;
  /** Battery saver: fewer debris particles. */
  lite?: boolean;
  /** The Moon is hovered. */
  moonHover?: boolean;
}

const ODC_LAP = 46;
const GEO_DEBRIS_LAP = 400;
const LEO_DEBRIS_LAP = 34;
const LAUNCH_SECS = 5.5;

/** The rectenna point for a province's space-solar station. */
export function rectennaOf(region: RegionId): [number, number] {
  const [lat, lon] = ANCHORS[region] ?? [0, 0];
  return [lat - 2.5, lon + 3];
}

/**
 * Everything that moves, for a moment `t` (seconds): debris glitter per shell (denser with more
 * debris, flashing red in a cascade), orbital data centres circling in low orbit (building ones
 * as frames), space-solar stations riding the geostationary belt over their rectennas and beaming
 * down when they face us, launches climbing from the spaceport at the cadence's rate, the mass
 * driver's payloads, and twinkling stars.
 */
export function orbitFx(sink: FxSink, L: OrbitLayout, cam: Cam, ov: OrbitView, t: number, opts: FxOpts = {}, stars: { x: number; y: number; c: number }[] = []): void {
  const still = !!opts.still;
  const T = still ? 7.3 : t;
  const place = (v: Vec3) => ({ ...screen(L, v), d: depth(L, v) });
  const dot = (v: Vec3, c: number) => {
    const p = place(v);
    if (p.d !== 'hidden') sink.px(Math.round(p.x - 0.5), Math.round(p.y - 0.5), c, p.d === 'front');
  };
  // twinkling stars
  if (!still) for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const k = hash2(i, Math.floor(T * 1.6 + i * 0.37), 61);
    if (k < 0.25) sink.px(s.x, s.y, k < 0.08 ? s.c : C.ice1, false);
  }
  const cascade = ov.cascade;
  const lite = opts.lite ? 0.6 : 1;
  // ── debris ──
  const leo = L.leo;
  const n = [leo.u[1] * leo.w[2] - leo.u[2] * leo.w[1], leo.u[2] * leo.w[0] - leo.u[0] * leo.w[2], leo.u[0] * leo.w[1] - leo.u[1] * leo.w[0]];
  const flash = (i: number) => {
    if (cascade !== null && hash2(i, Math.floor(T * 9), 67) < 0.08 + cascade / 260) return hash2(i, Math.floor(T * 9), 68) < 0.5 ? C.red3 : C.org1;
    const g = hash2(i, Math.floor(T * 3 + hash2(i, 0, 66) * 7), 65);
    return g < 0.05 ? C.white : g < 0.09 ? C.ice2 : null;
  };
  const leoN = Math.round((ov.debris.leo / 100) * 220 * lite * (cascade !== null ? 1 + cascade / 60 : 1));
  for (let i = 0; i < leoN; i++) {
    const th = hash2(i, 1, 51) * Math.PI * 2 + ((T * Math.PI * 2) / LEO_DEBRIS_LAP) * (0.75 + hash2(i, 2, 51) * 0.5);
    const R = leo.R * (1 + (hash2(i, 3, 51) - 0.5) * 0.12);
    const off = (hash2(i, 4, 51) - 0.5) * 0.18;
    const p = ringPoint(leo, th, R);
    const v: Vec3 = [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off];
    dot(v, flash(i) ?? (hash2(i, 5, 51) < 0.45 ? C.ink7 : hash2(i, 5, 51) < 0.8 ? C.ink6 : C.ink8));
  }
  const geoN = Math.round((ov.debris.geo / 100) * 110 * lite);
  for (let i = 0; i < geoN; i++) {
    const lon = hash2(i, 1, 53) * 360 + (T * 360) / GEO_DEBRIS_LAP * (hash2(i, 2, 53) - 0.5);
    const v = geoPoint(L, cam, lon, L.geoR * (1 + (hash2(i, 3, 53) - 0.5) * 0.05));
    v[1] += (hash2(i, 4, 53) - 0.5) * 0.08;
    dot(v, flash(i + 1000) ?? (hash2(i, 5, 53) < 0.5 ? C.ink6 : C.ink7));
  }
  const cisN = Math.round((ov.debris.cis / 100) * 50 * lite);
  for (let i = 0; i < cisN; i++) {
    const u = (hash2(i, 1, 57) + T / 260) % 1;
    const [x, y] = cisPoint(L, u);
    const j = (hash2(i, 2, 57) - 0.5) * 8;
    sink.px(Math.round(x + j * 0.6), Math.round(y + j), flash(i + 2000) ?? C.ink6, true);
  }
  // the cascade: collisions spraying fragments, the low-orbit ring pulsing red
  if (cascade !== null) {
    const pulse = still || Math.floor(T * 3) % 2 === 0;
    if (pulse) {
      const steps = Math.ceil(Math.PI * 2 * leo.R * L.r);
      for (let k = 0; k < steps; k += 5) dot(ringPoint(leo, (k / steps) * Math.PI * 2), C.red2);
    }
    const bursts = 2 + Math.round(cascade / 18);
    for (let b = 0; b < bursts; b++) {
      const cycle = 1.3 + hash2(b, 9, 71) * 0.9;
      const age = ((T + hash2(b, 8, 71) * cycle) % cycle) / cycle;
      const gen = Math.floor((T + hash2(b, 8, 71) * cycle) / cycle);
      const th = hash2(b, gen, 72) * Math.PI * 2;
      const at = place(ringPoint(leo, th));
      if (at.d === 'hidden') continue;
      const front = at.d === 'front';
      const rad = 1 + age * 7;
      const col = age < 0.15 ? C.white : age < 0.4 ? C.yel1 : age < 0.65 ? C.org1 : C.red3;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + b + gen;
        const rr = rad * (0.6 + hash2(k, gen, 73) * 0.5);
        sink.px(Math.round(at.x + Math.cos(a) * rr), Math.round(at.y + Math.sin(a) * rr * 0.75), col, front);
      }
      // the spray smears out along the orbit
      for (let k = 1; k <= Math.round(age * 9); k++) {
        for (const dir of [1, -1]) {
          const q = place(ringPoint(leo, th + dir * k * 0.012, leo.R * (1 + dir * k * 0.002)));
          if (q.d !== 'hidden' && (k + gen) % 2 === 0) sink.px(Math.round(q.x), Math.round(q.y), k < 3 ? C.org1 : C.red2, q.d === 'front');
        }
      }
      if (age < 0.2) {
        sink.px(Math.round(at.x), Math.round(at.y), C.white, front);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sink.px(Math.round(at.x) + dx, Math.round(at.y) + dy, C.yel2, front);
      }
    }
  }
  // ── orbital data centres ──
  const online = ov.odcGW > 0 ? Math.max(1, Math.min(10, Math.round(ov.odcGW * 1.2))) : 0;
  const building = ov.odcBuilding.slice(0, 4);
  const total = online + building.length;
  const odcSpr = odcCanvas();
  for (let i = 0; i < total; i++) {
    const th = (i / Math.max(1, total)) * Math.PI * 2 + (T * Math.PI * 2) / ODC_LAP + 0.4;
    const p = place(ringPoint(leo, th));
    if (p.d === 'hidden') continue;
    const x = Math.round(p.x - odcSpr.w / 2);
    const y = Math.round(p.y - odcSpr.h / 2);
    if (i < online) sink.spr('odc', odcCanvas, x, y, p.d === 'front');
    else {
      const prog = Math.round(building[i - online] * 8) / 8;
      sink.spr(`odcf:${prog}`, () => odcFrameCanvas(prog), x, y, p.d === 'front');
    }
  }
  if (!total && ov.orbitalTest) {
    const p = place(ringPoint(leo, (T * Math.PI * 2) / ODC_LAP));
    const sat = satelliteCanvas();
    if (p.d !== 'hidden') sink.spr('sat', satelliteCanvas, Math.round(p.x - sat.w / 2), Math.round(p.y - sat.h / 2), p.d === 'front');
  }
  // ── space solar: stations over their rectennas, beaming down ──
  const stations = ov.sps.length ? ov.sps.map((s) => ({ ...s, lonlat: rectennaOf(s.region) })) : [];
  if (!stations.length && ov.spaceSolarDemo && ov.spaceport) {
    const s = siteDef(ov.spaceport);
    stations.push({ region: s.region as RegionId, gw: 0.5, status: 'online', progress: 1, lonlat: [s.lat, s.lon] });
  }
  stations.forEach((st, i) => {
    const big = st.gw >= 6;
    const v = geoPoint(L, cam, st.lonlat[1]);
    const p = place(v);
    if (p.d === 'hidden') return;
    const spr = big ? spsCanvas(true) : spsCanvas(false);
    const x = Math.round(p.x - spr.w / 2);
    const y = Math.round(p.y - spr.h / 2);
    if (st.status === 'online') sink.spr(`sps:${big}`, () => spsCanvas(big), x, y, p.d === 'front');
    else {
      const prog = Math.round(st.progress * 8) / 8;
      sink.spr(`spsf:${big}:${prog}`, () => spsFrameCanvas(big, prog), x, y, p.d === 'front');
    }
    if (st.status !== 'online' || p.d !== 'front') return;
    const g = toView(st.lonlat[0], st.lonlat[1], cam);
    if (g[2] < 0.08) return;
    const a = { x: p.x, y: y + spr.h - 1 };
    const b = screen(L, g);
    const len = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
    const shift = still ? 0 : Math.floor(T * 14 + i * 3);
    for (let k = 1; k < len; k++) {
      const f = k / len;
      const x2 = Math.round(a.x + (b.x - a.x) * f - 0.5);
      const y2 = Math.round(a.y + (b.y - a.y) * f - 0.5);
      const ph = (k - shift) & 3;
      if (ph < 2) sink.px(x2, y2, ph === 0 ? C.pnk1 : C.yel1, true);
    }
    // where it lands: a glow on the receiver
    const bx = Math.round(b.x - 0.5);
    const by = Math.round(b.y - 0.5);
    sink.px(bx, by, C.white, true);
    if (!still && Math.floor(T * 4) % 2) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sink.px(bx + dx, by + dy, C.pnk0, true);
  });
  // ── launches from the spaceport ──
  const port = ov.spaceport ? siteDef(ov.spaceport) : null;
  if (port && ov.cadence > 0) {
    const P = toView(port.lat, port.lon, cam);
    const tangent = (dlat: number, dlon: number): Vec3 => {
      const Q = toView(port.lat + dlat, port.lon + dlon, cam);
      const d: Vec3 = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
      const l = Math.hypot(...d) || 1;
      return [d[0] / l, d[1] / l, d[2] / l];
    };
    const east = tangent(0, 1);
    const north = tangent(1, 0);
    /** A flight's ground track: due east into the equatorial shell, or north-east into an inclined one. */
    const path = (s: number, az: number): Vec3 => {
      const E: Vec3 = [east[0] * Math.sin(az) + north[0] * Math.cos(az), east[1] * Math.sin(az) + north[1] * Math.cos(az), east[2] * Math.sin(az) + north[2] * Math.cos(az)];
      const phi = 0.8 * s * s;
      const alt = 1 + (LEO_R - 1 + 0.01) * (1 - (1 - s) ** 2.4);
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      return [(P[0] * c + E[0] * sn) * alt, (P[1] * c + E[1] * sn) * alt, (P[2] * c + E[2] * sn) * alt];
    };
    const rate = Math.min(2.4, 0.12 + ov.cadence * 0.3);
    const flights: [number, number][] = [];
    if (still) flights.push([0.62, Math.PI / 2]);
    else {
      for (let k = Math.floor((T - LAUNCH_SECS) * rate) - 1; k <= Math.floor(T * rate); k++) {
        const tk = k / rate + (hash2(k, 1, 81) - 0.5) * (0.4 / rate);
        const s = (T - tk) / LAUNCH_SECS;
        if (s >= 0 && s <= 1) flights.push([s, hash2(k, 2, 81) < 0.55 ? Math.PI / 2 : Math.PI / 3.2]);
      }
    }
    for (const [s, az] of flights) {
      for (let j = 16; j >= 1; j--) {
        const sj = s - j * 0.011;
        if (sj < 0) continue;
        if (s > 0.8 && j > 16 - (s - 0.8) * 80) continue;
        const col = j < 2 ? C.yel2 : j < 4 ? C.yel1 : j < 6 ? C.org1 : j < 11 ? C.ink8 : C.ink6;
        if (j > 6 && hash2(j, Math.floor(s * 40), 83) < 0.3) continue;
        dot(path(sj, az), col);
      }
      // the vehicle: a bright point, flaring every other frame
      const h = place(path(s, az));
      if (h.d !== 'hidden') {
        const hx = Math.round(h.x - 0.5);
        const hy = Math.round(h.y - 0.5);
        sink.px(hx, hy, C.white, h.d === 'front');
        if (L.r >= 70 && (still || Math.floor(T * 12) % 2 === 0)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sink.px(hx + dx, hy + dy, C.yel1, h.d === 'front');
      }
    }
  }
  // ── the Moon: build lights, the base beacon, the mass driver's payloads ──
  const mv = ov.moon;
  const mo = { x: L.moon.x - L.moon.r - 4, y: L.moon.y - L.moon.r - 4 };
  const [bx, by] = moonBase(L.moon.r);
  if (mv.stage >= 1 && (still || Math.floor(T * 1.2) % 3 === 0)) sink.px(mo.x + bx + 1, mo.y + by - 1, C.red3, true);
  if (mv.building && (still || Math.floor(T * 3) % 2 === 0)) sink.px(mo.x + bx - 1, mo.y + by - 2, C.yel0, true);
  if (mv.stage >= 3) {
    const [mx, my] = moonMuzzle(L.moon.r);
    const muzzle: [number, number] = [mo.x + mx, mo.y + my];
    const shots = still ? [0.5] : [0, 1, 2, 3].map((k) => ((T / 1.7 + k * 0.25) % 1));
    for (const s of shots) {
      // out of the muzzle, then along the cislunar road back toward Earth
      const lead = 0.06;
      const pos = (q: number): [number, number] => {
        if (q < lead) {
          const [ex, ey] = cisPoint(L, 1);
          const f = q / lead;
          return [muzzle[0] + (ex - muzzle[0]) * f, muzzle[1] + (ey - muzzle[1]) * f];
        }
        return cisPoint(L, 1 - (q - lead) / (1 - lead));
      };
      const [x, y] = pos(s);
      sink.px(Math.round(x), Math.round(y), C.yel1, true);
      const [tx, ty] = pos(Math.max(0, s - 0.012));
      sink.px(Math.round(tx), Math.round(ty), C.org1, true);
      if (s < 0.03 && !still) sink.px(muzzle[0], muzzle[1], C.white, true);
    }
  }
}

// ── a whole frame (previews) ─────────────────────────────────────────────────────────────────
export interface FrameInput extends GlobeInput {
  orbit: OrbitView;
  t: number;
  opts?: FxOpts;
}

/** Compose a full frame into one canvas (the headless previews; the scene layers these parts itself). */
export function renderOrbitFrame(pc: PixelCanvas, L: OrbitLayout, f: FrameInput): void {
  paintSky(pc);
  const sv = sunView(f.sun, f.cam);
  const moon = new PixelCanvas(moonSize(L.moon.r), moonSize(L.moon.r));
  paintMoon(moon, L.moon.r, sv, f.orbit.moon, f.opts?.moonHover);
  pc.blit(moon, L.moon.x - L.moon.r - 4, L.moon.y - L.moon.r - 4);
  const back = new PixelCanvas(L.w, L.h);
  const front = new PixelCanvas(L.w, L.h);
  paintRings(back, front, L, f.cam);
  const memo = new Map<string, PixelCanvas>();
  const fxBack = new PixelCanvas(L.w, L.h);
  const fxFront = new PixelCanvas(L.w, L.h);
  orbitFx(
    {
      px: (x, y, c, fr) => (fr ? fxFront : fxBack).set(x, y, c),
      spr: (key, make, x, y, fr) => {
        let s = memo.get(key);
        if (!s) memo.set(key, (s = make()));
        (fr ? fxFront : fxBack).blit(s, x, y);
      },
    },
    L, f.cam, f.orbit, f.t, f.opts, twinklers(L),
  );
  pc.blit(back, 0, 0);
  pc.blit(fxBack, 0, 0);
  const globe = new PixelCanvas(L.globe.size, L.globe.size);
  paintGlobe(globe, L, f);
  pc.blit(globe, L.globe.x, L.globe.y);
  pc.blit(front, 0, 0);
  pc.blit(fxFront, 0, 0);
  for (const lb of orbitLabels(L, f.cam, f.orbit)) {
    const tmp = new PixelCanvas(measureText(lb.text) + 2, 7);
    drawText(tmp, lb.text, 1, 1, lb.color);
    tmp.outline(C.ink0, true);
    pc.blit(tmp, lb.x - 1, lb.y - 1);
  }
}
