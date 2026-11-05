/**
 * A pixel-art Earth in orthographic projection, sampled from the game's own terrain painting.
 * Used for the app icons, the share image and the landing page's spinning globe.
 */
import { CITIES } from '../content/cities';
import { C, KEYS, onEraChange, paletteTable } from './palette';
import { bayer, PixelCanvas } from './pixels';

const RAD = Math.PI / 180;

export interface GlobeOptions {
  /** Equirectangular indexed terrain (e.g. terrainCanvas(lod)). */
  terrain: PixelCanvas;
  /** Degrees per terrain pixel. */
  res: number;
  /** View centre. */
  lon0: number;
  lat0: number;
  cx: number;
  cy: number;
  r: number;
  /** Subsolar point; null = lit everywhere. */
  sun?: { lat: number; lon: number } | null;
  lights?: boolean;
  atmosphere?: boolean;
  /** Small globes: take the most common colour under each pixel instead of one sample. */
  smooth?: boolean;
  /**
   * Where the canvas sits in the picture (default 0, 0): the globe is worked out in the picture's
   * pixels and painted at (x - ox, y - oy), so a small canvas round it gets exactly the same pixels.
   */
  ox?: number;
  oy?: number;
}

/** Palette index → nearest palette index of a darker/tinted colour. */
function shadeLut(mult: [number, number, number], add: [number, number, number] = [0, 0, 0]): Uint8Array {
  const pal = paletteTable();
  const n = KEYS.length + 1;
  const lut = new Uint8Array(n);
  for (let i = 1; i < n; i++) {
    const r = pal[i * 4] * mult[0] + add[0];
    const g = pal[i * 4 + 1] * mult[1] + add[1];
    const b = pal[i * 4 + 2] * mult[2] + add[2];
    let best = i;
    let bestD = Infinity;
    for (let j = 1; j < n; j++) {
      const d = (pal[j * 4] - r) ** 2 + (pal[j * 4 + 1] - g) ** 2 + (pal[j * 4 + 2] - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    lut[i] = best;
  }
  return lut;
}

/** The shading tables, for the era they were built in (each era grades the palette differently). */
let luts: { night: Uint8Array; dusk: Uint8Array; limb: Uint8Array } | null = null;
function getLuts() {
  return (luts ??= {
    night: shadeLut([0.22, 0.26, 0.45], [2, 4, 14]),
    dusk: shadeLut([0.55, 0.52, 0.7]),
    limb: shadeLut([0.7, 0.72, 0.85]),
  });
}
onEraChange(() => (luts = null));

/** Lat/lon of a pixel on the globe, or null outside the disc. */
export function globeInverse(o: GlobeOptions, x: number, y: number): { lat: number; lon: number; rho: number } | null {
  const u = (x + 0.5 - o.cx) / o.r;
  const v = (o.cy - (y + 0.5)) / o.r;
  const rho2 = u * u + v * v;
  if (rho2 > 1) return null;
  const z = Math.sqrt(1 - rho2);
  const p0 = o.lat0 * RAD;
  const lat = Math.asin(v * Math.cos(p0) + z * Math.sin(p0)) / RAD;
  const lon = o.lon0 + Math.atan2(u, z * Math.cos(p0) - v * Math.sin(p0)) / RAD;
  return { lat, lon, rho: Math.sqrt(rho2) };
}

/**
 * The inverse projection of a globe's box (lat, longitude from the centre, rho, and the latitude's
 * sine and cosine per pixel; NaN outside the disc). A turning globe only changes its centre
 * longitude, so the orbit view and the system lens reuse it from one repaint to the next.
 */
interface Grid {
  key: string;
  lat: Float64Array;
  dlon: Float64Array;
  rho: Float64Array;
  sinLat: Float64Array;
  cosLat: Float64Array;
}
/** The two most recent grids, and the last geometry asked for (a grid is built the second time in a row). */
const grids: Grid[] = [];
let lastAsked = '';

function gridFor(o: GlobeOptions, x0: number, y0: number, w: number, h: number): Grid | null {
  const key = `${o.cx}|${o.cy}|${o.r}|${o.lat0}`;
  const hit = grids.find((g) => g.key === key);
  if (hit) return hit;
  // a one-off globe (the ending's pull-back resizes it every frame) isn't worth a grid
  if (key !== lastAsked) {
    lastAsked = key;
    return null;
  }
  const n = w * h;
  const g: Grid = { key, lat: new Float64Array(n), dlon: new Float64Array(n), rho: new Float64Array(n), sinLat: new Float64Array(n), cosLat: new Float64Array(n) };
  const p0 = o.lat0 * RAD;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      // the same sums as globeInverse, so the pixels come out identical
      const u = (x0 + i + 0.5 - o.cx) / o.r;
      const v = (o.cy - (y0 + j + 0.5)) / o.r;
      const rho2 = u * u + v * v;
      if (rho2 > 1) {
        g.lat[k] = NaN;
        continue;
      }
      const z = Math.sqrt(1 - rho2);
      const lat = Math.asin(v * Math.cos(p0) + z * Math.sin(p0)) / RAD;
      g.lat[k] = lat;
      g.dlon[k] = Math.atan2(u, z * Math.cos(p0) - v * Math.sin(p0)) / RAD;
      g.rho[k] = Math.sqrt(rho2);
      g.sinLat[k] = Math.sin(lat * RAD);
      g.cosLat[k] = Math.cos(lat * RAD);
    }
  }
  grids.unshift(g);
  if (grids.length > 2) grids.pop();
  return g;
}

/** Majority vote scratch (a pixel's footprint has at most nine samples). */
const voteKeys: number[] = [];
const voteN: number[] = [];

export function drawGlobe(pc: PixelCanvas, o: GlobeOptions): void {
  const { terrain, res } = o;
  const W = terrain.w;
  const H = terrain.h;
  const L = getLuts();
  const ox = o.ox ?? 0;
  const oy = o.oy ?? 0;
  const sun = o.sun ?? null;
  const sd = sun ? Math.sin(sun.lat * RAD) : 0;
  const cd = sun ? Math.cos(sun.lat * RAD) : 0;
  const x0 = Math.floor(o.cx - o.r - 2);
  const x1 = Math.ceil(o.cx + o.r + 2);
  const y0 = Math.floor(o.cy - o.r - 2);
  const y1 = Math.ceil(o.cy + o.r + 2);
  const gw = x1 - x0 + 1;
  const grid = gridFor(o, x0, y0, gw, y1 - y0 + 1);
  const g = { lat: 0, lon: 0, rho: 0 };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = (y - y0) * gw + (x - x0);
      let inside: boolean;
      if (grid) {
        inside = !Number.isNaN(grid.lat[k]);
        if (inside) {
          g.lat = grid.lat[k];
          g.lon = o.lon0 + grid.dlon[k];
          g.rho = grid.rho[k];
        }
      } else {
        const gi = globeInverse(o, x, y);
        inside = !!gi;
        if (gi) {
          g.lat = gi.lat;
          g.lon = gi.lon;
          g.rho = gi.rho;
        }
      }
      if (!inside) {
        // thin atmosphere halo just outside the disc
        if (o.atmosphere) {
          const dx = x + 0.5 - o.cx;
          const dy = y + 0.5 - o.cy;
          const d = Math.hypot(dx, dy) / o.r;
          if (d < 1 + 1.6 / o.r) {
            let lit = true;
            if (sun) {
              // is the limb point under this halo pixel in daylight?
              const f = (o.r - 0.6) / (d * o.r);
              const edge = globeInverse(o, o.cx + dx * f - 0.5, o.cy + dy * f - 0.5);
              lit = !!edge && Math.sin(edge.lat * RAD) * sd + Math.cos(edge.lat * RAD) * cd * Math.cos((edge.lon - sun.lon) * RAD) > -0.05;
            }
            pc.set(x - ox, y - oy, lit ? C.cyn4 : C.blu1);
          }
        }
        continue;
      }
      let c: number;
      if (o.smooth) {
        // majority vote over the pixel's footprint on the map (first to the top count wins, as samples come)
        const span = (180 / Math.PI / o.r) * 0.5;
        let nv = 0;
        for (let fy = -1; fy <= 1; fy++) {
          for (let fx = -1; fx <= 1; fx++) {
            const la = g.lat + fy * span * 0.6;
            const lo = g.lon + (fx * span * 0.6) / Math.max(0.3, Math.cos(g.lat * RAD));
            const tx = ((Math.floor((lo + 180) / res) % W) + W) % W;
            const ty = Math.max(0, Math.min(H - 1, Math.floor((90 - la) / res)));
            const v = terrain.data[ty * W + tx] || C.sea1;
            const add = fx === 0 && fy === 0 ? 1.5 : 1;
            let j = 0;
            while (j < nv && voteKeys[j] !== v) j++;
            if (j === nv) {
              voteKeys[nv] = v;
              voteN[nv++] = add;
            } else voteN[j] += add;
          }
        }
        c = C.sea1;
        let best = -1;
        for (let j = 0; j < nv; j++) if (voteN[j] > best) ((best = voteN[j]), (c = voteKeys[j]));
      } else {
        const tx = ((Math.floor((g.lon + 180) / res) % W) + W) % W;
        const ty = Math.max(0, Math.min(H - 1, Math.floor((90 - g.lat) / res)));
        c = terrain.data[ty * W + tx] || C.sea1;
      }
      // edge of the disc reads as a sphere
      if (g.rho > 0.9 && bayer(x, y) < (g.rho - 0.9) * 160) c = L.limb[c];
      if (sun) {
        const sinLat = grid ? grid.sinLat[k] : Math.sin(g.lat * RAD);
        const cosLat = grid ? grid.cosLat[k] : Math.cos(g.lat * RAD);
        const s = sinLat * sd + cosLat * cd * Math.cos((g.lon - sun.lon) * RAD);
        if (s < -0.12) c = L.night[c];
        else if (s < 0.04) c = bayer(x, y) < ((s + 0.12) / 0.16) * 16 ? L.dusk[c] : L.night[c];
      }
      pc.set(x - ox, y - oy, c);
    }
  }
  // specular glint on the lit ocean
  if (!sun || Math.cos((o.lon0 - sun.lon) * RAD) > 0) {
    const gx = Math.round(o.cx - o.r * 0.38) - ox;
    const gy = Math.round(o.cy - o.r * 0.38) - oy;
    for (const [dx, dy, col] of [[0, 0, C.sea8], [1, 0, C.sea7], [0, 1, C.sea7]] as const) {
      const cur = pc.get(gx + dx, gy + dy);
      if (cur === C.sea1 || cur === C.sea2 || cur === C.sea3 || cur === C.sea4) pc.set(gx + dx, gy + dy, col);
    }
  }
  if (sun && o.lights !== false) drawCityLights(pc, o);
}

function drawCityLights(pc: PixelCanvas, o: GlobeOptions) {
  const sun = o.sun!;
  const p0 = o.lat0 * RAD;
  for (const [lat, lon, size] of CITIES) {
    const p = lat * RAD;
    const dl = (lon - o.lon0) * RAD;
    const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
    if (cosc < 0.15) continue; // behind the globe or on the very edge
    const s = Math.sin(p) * Math.sin(sun.lat * RAD) + Math.cos(p) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD);
    if (s > -0.08) continue; // daytime
    const x = Math.round(o.cx + o.r * Math.cos(p) * Math.sin(dl) - 0.5) - (o.ox ?? 0);
    const y = Math.round(o.cy - o.r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)) - 0.5) - (o.oy ?? 0);
    pc.set(x, y, size >= 3 ? C.yel2 : C.yel1);
    if (size >= 3 && o.r > 40) {
      pc.set(x + 1, y, C.org2);
      pc.set(x, y + 1, C.yel0);
    }
  }
}

/** Starfield background helper. */
export function drawStars(pc: PixelCanvas, seed: number, count: number): void {
  let h = seed;
  const rnd = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * pc.w);
    const y = Math.floor(rnd() * pc.h);
    const r = rnd();
    pc.set(x, y, r > 0.92 ? C.yel1 : r > 0.6 ? C.ice2 : C.ink6);
  }
}
