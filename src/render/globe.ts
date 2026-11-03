/**
 * A pixel-art Earth in orthographic projection, sampled from the game's own terrain painting.
 * Used for the app icons, the share image and the landing page's spinning globe.
 */
import { CITIES } from '../content/cities';
import { C, KEYS, paletteTable } from './palette';
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

let luts: { night: Uint8Array; dusk: Uint8Array; limb: Uint8Array } | null = null;
function getLuts() {
  return (luts ??= {
    night: shadeLut([0.22, 0.26, 0.45], [2, 4, 14]),
    dusk: shadeLut([0.55, 0.52, 0.7]),
    limb: shadeLut([0.7, 0.72, 0.85]),
  });
}

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

export function drawGlobe(pc: PixelCanvas, o: GlobeOptions): void {
  const { terrain, res } = o;
  const W = terrain.w;
  const H = terrain.h;
  const L = getLuts();
  const sun = o.sun ?? null;
  const sd = sun ? Math.sin(sun.lat * RAD) : 0;
  const cd = sun ? Math.cos(sun.lat * RAD) : 0;
  const x0 = Math.floor(o.cx - o.r - 2);
  const x1 = Math.ceil(o.cx + o.r + 2);
  const y0 = Math.floor(o.cy - o.r - 2);
  const y1 = Math.ceil(o.cy + o.r + 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const g = globeInverse(o, x, y);
      if (!g) {
        // thin atmosphere halo just outside the disc
        if (o.atmosphere) {
          const dx = x + 0.5 - o.cx;
          const dy = y + 0.5 - o.cy;
          const d = Math.hypot(dx, dy) / o.r;
          if (d < 1 + 1.6 / o.r) {
            let lit = true;
            if (sun) {
              // is the limb point under this halo pixel in daylight?
              const k = (o.r - 0.6) / (d * o.r);
              const edge = globeInverse(o, o.cx + dx * k - 0.5, o.cy + dy * k - 0.5);
              lit = !!edge && Math.sin(edge.lat * RAD) * sd + Math.cos(edge.lat * RAD) * cd * Math.cos((edge.lon - sun.lon) * RAD) > -0.05;
            }
            pc.set(x, y, lit ? C.cyn4 : C.blu1);
          }
        }
        continue;
      }
      let c: number;
      if (o.smooth) {
        // majority vote over the pixel's footprint on the map
        const span = (180 / Math.PI / o.r) * 0.5;
        const votes = new Map<number, number>();
        for (const fy of [-1, 0, 1]) {
          for (const fx of [-1, 0, 1]) {
            const la = g.lat + fy * span * 0.6;
            const lo = g.lon + (fx * span * 0.6) / Math.max(0.3, Math.cos(g.lat * RAD));
            const tx = ((Math.floor((lo + 180) / res) % W) + W) % W;
            const ty = Math.max(0, Math.min(H - 1, Math.floor((90 - la) / res)));
            const v = terrain.data[ty * W + tx] || C.sea1;
            votes.set(v, (votes.get(v) ?? 0) + (fx === 0 && fy === 0 ? 1.5 : 1));
          }
        }
        c = C.sea1;
        let best = -1;
        for (const [k, n] of votes) if (n > best) ((best = n), (c = k));
      } else {
        const tx = ((Math.floor((g.lon + 180) / res) % W) + W) % W;
        const ty = Math.max(0, Math.min(H - 1, Math.floor((90 - g.lat) / res)));
        c = terrain.data[ty * W + tx] || C.sea1;
      }
      // edge of the disc reads as a sphere
      if (g.rho > 0.9 && bayer(x, y) < (g.rho - 0.9) * 160) c = L.limb[c];
      if (sun) {
        const s = Math.sin(g.lat * RAD) * sd + Math.cos(g.lat * RAD) * cd * Math.cos((g.lon - sun.lon) * RAD);
        if (s < -0.12) c = L.night[c];
        else if (s < 0.04) c = bayer(x, y) < ((s + 0.12) / 0.16) * 16 ? L.dusk[c] : L.night[c];
      }
      pc.set(x, y, c);
    }
  }
  // specular glint on the lit ocean
  if (!sun || Math.cos((o.lon0 - sun.lon) * RAD) > 0) {
    const gx = Math.round(o.cx - o.r * 0.38);
    const gy = Math.round(o.cy - o.r * 0.38);
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
    const x = Math.round(o.cx + o.r * Math.cos(p) * Math.sin(dl) - 0.5);
    const y = Math.round(o.cy - o.r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)) - 0.5);
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
