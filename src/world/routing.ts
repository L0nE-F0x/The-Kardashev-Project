import { BIOME } from '../content/mapcodes';
import { haversineKm, siteDef } from '../content/sites';
import type { MapLod } from './mapData';

export interface Chokepoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Radius in degrees. */
  r: number;
}

export const CHOKEPOINTS: Chokepoint[] = [
  { id: 'malacca', name: 'Strait of Malacca', lat: 3.0, lon: 100.6, r: 1.6 },
  { id: 'suez', name: 'Suez Canal', lat: 30.3, lon: 32.5, r: 1.2 },
  { id: 'panama', name: 'Panama Canal', lat: 9.1, lon: -79.7, r: 1.0 },
  { id: 'hormuz', name: 'Strait of Hormuz', lat: 26.5, lon: 56.4, r: 0.9 },
  { id: 'bab', name: 'Bab-el-Mandeb', lat: 12.6, lon: 43.3, r: 0.9 },
  { id: 'bosporus', name: 'Turkish Straits', lat: 41.0, lon: 28.9, r: 1.0 },
];
export const CHOKEPOINT_BY_ID = Object.fromEntries(CHOKEPOINTS.map((c) => [c.id, c]));

/** Narrow straits and canals that a 0.5° raster closes up — carved back in as water. */
const CARVES: [number, number][][] = [
  [[31.6, 32.3], [30.0, 32.55], [29.5, 32.6], [28.6, 33.1], [27.6, 33.9]], // Suez + Gulf of Suez
  [[9.7, -79.95], [9.1, -79.7], [8.5, -79.4]], // Panama
  [[41.4, 29.15], [41.0, 29.0], [40.8, 28.4], [40.3, 26.7], [40.0, 26.0]], // Bosporus → Dardanelles
  [[36.0, -6.6], [36.0, -5.0]], // Gibraltar
  [[51.5, 1.8], [50.9, 1.3]], // Dover
  [[57.7, 10.9], [56.6, 11.8], [55.7, 12.7], [55.2, 13.0], [55.0, 13.8]], // Danish straits
  [[2.6, 101.1], [1.4, 103.2], [1.2, 103.8], [1.3, 104.5]], // Malacca south + Singapore Strait
  [[14.5, 42.0], [13.0, 43.1], [12.6, 43.4], [12.2, 44.0], [11.9, 44.8]], // Bab-el-Mandeb
  [[27.0, 55.4], [26.6, 56.2], [26.2, 56.6], [25.6, 57.2]], // Hormuz
  [[-5.7, 105.6], [-6.3, 105.9]], // Sunda
  [[-8.3, 115.75], [-9.1, 115.75]], // Lombok
];

export interface SeaRoute {
  /** [lon, lat] with continuous (unwrapped) longitudes. */
  path: [number, number][];
  km: number;
  chokepoints: string[];
}

export interface Route {
  path: [number, number][];
  overland: [number, number][];
  km: number;
  overlandKm: number;
  chokepoints: string[];
  mode: 'sea' | 'air';
}

/** Sea router over the 0.5° raster: A* with wrap, carved canals and closable chokepoints. */
export class Router {
  readonly W: number;
  readonly H: number;
  readonly res: number;
  private pass: Uint8Array;
  private choke: Uint8Array; // chokepoint index + 1 per pixel
  private cache = new Map<string, SeaRoute | null>();

  constructor(lod: MapLod) {
    this.W = lod.W;
    this.H = lod.H;
    this.res = lod.res;
    const { W, H } = this;
    const water = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const lat = 90 - (y + 0.5) * this.res;
      if (lat > 72 || lat < -62) continue;
      for (let x = 0; x < W; x++) if (lod.biome[y * W + x] === BIOME.OCEAN) water[y * W + x] = 1;
    }
    // carve as a plus-shaped brush so the channel is always 4-connected
    for (const line of CARVES) {
      for (let i = 1; i < line.length; i++) {
        this.rasterLine(line[i - 1], line[i], (idx) => {
          const x = idx % W;
          const y = (idx / W) | 0;
          water[idx] = 1;
          water[y * W + ((x + 1) % W)] = 1;
          water[y * W + ((x - 1 + W) % W)] = 1;
          if (y > 0) water[idx - W] = 1;
          if (y < H - 1) water[idx + W] = 1;
        });
      }
    }
    // keep only the world ocean (drop the Caspian, lakes, enclosed bits)
    this.pass = new Uint8Array(W * H);
    const seed = this.idx(0, -30); // mid-Atlantic
    const q = [seed];
    this.pass[seed] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % W;
      const y = (i / W) | 0;
      for (const n of [y * W + ((x + 1) % W), y * W + ((x - 1 + W) % W), y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (n >= 0 && water[n] && !this.pass[n]) {
          this.pass[n] = 1;
          q.push(n);
        }
      }
    }
    this.choke = new Uint8Array(W * H);
    CHOKEPOINTS.forEach((c, ci) => {
      const r = Math.ceil(c.r / this.res) + 1;
      const cx = (c.lon + 180) / this.res;
      const cy = (90 - c.lat) / this.res;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(cx + dx);
          const y = Math.floor(cy + dy);
          if (y < 0 || y >= H) continue;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) * this.res > c.r) continue;
          const idx = y * W + (((x % W) + W) % W);
          if (this.pass[idx]) this.choke[idx] = ci + 1;
        }
      }
    });
  }

  private idx(lat: number, lon: number): number {
    const x = Math.floor((lon + 180) / this.res);
    const y = Math.max(0, Math.min(this.H - 1, Math.floor((90 - lat) / this.res)));
    return y * this.W + (((x % this.W) + this.W) % this.W);
  }

  private rasterLine(a: [number, number], b: [number, number], fn: (idx: number) => void) {
    const steps = Math.ceil(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) / (this.res / 3)) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      fn(this.idx(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }

  isWater(lat: number, lon: number): boolean {
    return this.pass[this.idx(lat, lon)] === 1;
  }

  /** Nearest world-ocean pixel to a coordinate (spiral search). */
  private nearestWater(lat: number, lon: number): number {
    const c = this.idx(lat, lon);
    if (this.pass[c]) return c;
    const cx = c % this.W;
    const cy = (c / this.W) | 0;
    for (let r = 1; r < 40; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const y = cy + dy;
          if (y < 0 || y >= this.H) continue;
          const i = y * this.W + (((cx + dx) % this.W) + this.W) % this.W;
          if (!this.pass[i]) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return c;
  }

  private centre(i: number): [number, number] {
    const x = i % this.W;
    const y = (i / this.W) | 0;
    return [-180 + (x + 0.5) * this.res, 90 - (y + 0.5) * this.res];
  }

  /** Shortest sea path between two coordinates ([lat, lon]) avoiding closed chokepoints. */
  seaRoute(from: [number, number], to: [number, number], closed: ReadonlySet<string>): SeaRoute | null {
    const key = `${from}|${to}|${[...closed].sort().join(',')}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const result = this.astar(from, to, closed);
    this.cache.set(key, result);
    return result;
  }

  private blocked(i: number, closedMask: number): boolean {
    if (!this.pass[i]) return true;
    const c = this.choke[i];
    return c !== 0 && (closedMask & (1 << (c - 1))) !== 0;
  }

  private astar(from: [number, number], to: [number, number], closed: ReadonlySet<string>): SeaRoute | null {
    const { W, H, res } = this;
    let closedMask = 0;
    CHOKEPOINTS.forEach((c, i) => {
      if (closed.has(c.id)) closedMask |= 1 << i;
    });
    const start = this.nearestWater(from[0], from[1]);
    const goal = this.nearestWater(to[0], to[1]);
    const N = W * H;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    const heap = new MinHeap();
    const [glon, glat] = this.centre(goal);
    const kmPerDeg = 111.2;
    const h = (i: number) => {
      const [lon, lat] = this.centre(i);
      return haversineKm(lat, lon, glat, glon) * 0.999;
    };
    g[start] = 0;
    heap.push(start, h(start));
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (done[cur]) continue;
      done[cur] = 1;
      const x = cur % W;
      const y = (cur / W) | 0;
      const lat = 90 - (y + 0.5) * res;
      const dxKm = res * kmPerDeg * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
      const dyKm = res * kmPerDeg;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const n = ny * W + (((x + ox) % W) + W) % W;
          if (done[n] || this.blocked(n, closedMask)) continue;
          // diagonal moves need at least one open orthogonal neighbour (no slipping between two land corners)
          if (ox && oy && this.blocked(y * W + (((x + ox) % W) + W) % W, closedMask) && this.blocked(ny * W + x, closedMask)) continue;
          const step = ox && oy ? Math.hypot(dxKm, dyKm) : ox ? dxKm : dyKm;
          const ng = g[cur] + step;
          if (ng < g[n]) {
            g[n] = ng;
            came[n] = cur;
            heap.push(n, ng + h(n));
          }
        }
      }
    }
    if (came[goal] < 0 && goal !== start) return null;
    // walk back
    const cells: number[] = [];
    for (let c = goal; c >= 0; c = came[c]) {
      cells.push(c);
      if (c === start) break;
    }
    cells.reverse();
    // unwrap to continuous pixel coordinates
    const pts: [number, number][] = [];
    let offset = 0;
    let prevX = cells[0] % W;
    for (const c of cells) {
      const x = c % W;
      if (x - prevX > W / 2) offset -= W;
      else if (prevX - x > W / 2) offset += W;
      prevX = x;
      pts.push([x + offset + 0.5, ((c / W) | 0) + 0.5]);
    }
    const smooth = this.stringPull(pts, closedMask);
    const path = smooth.map(([px, py]) => [-180 + px * res, 90 - py * res] as [number, number]);
    let km = 0;
    for (let i = 1; i < path.length; i++) km += haversineKm(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
    const chokes = new Set<string>();
    for (const c of cells) if (this.choke[c]) chokes.add(CHOKEPOINTS[this.choke[c] - 1].id);
    return { path, km, chokepoints: [...chokes] };
  }

  private lineClear(a: [number, number], b: [number, number], closedMask: number): boolean {
    const d = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    const steps = Math.ceil(d * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.floor(a[0] + (b[0] - a[0]) * t);
      const y = Math.floor(a[1] + (b[1] - a[1]) * t);
      if (y < 0 || y >= this.H) return false;
      if (this.blocked(y * this.W + (((x % this.W) + this.W) % this.W), closedMask)) return false;
    }
    return true;
  }

  private stringPull(pts: [number, number][], closedMask: number): [number, number][] {
    if (pts.length <= 2) return pts;
    const out: [number, number][] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 60);
      while (j > i + 1 && !this.lineClear(pts[i], pts[j], closedMask)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}

/** Route between two sites for a shipment. */
export function routeBetween(router: Router, fromSite: string, toSite: string, mode: 'sea' | 'air', closed: ReadonlySet<string>): Route {
  const A = siteDef(fromSite);
  const B = siteDef(toSite);
  if (mode === 'air') {
    let lon2 = B.lon;
    if (lon2 - A.lon > 180) lon2 -= 360;
    else if (A.lon - lon2 > 180) lon2 += 360;
    return {
      path: [[A.lon, A.lat], [lon2, B.lat]],
      overland: [],
      km: haversineKm(A.lat, A.lon, B.lat, B.lon),
      overlandKm: 0,
      chokepoints: [],
      mode,
    };
  }
  const sea = router.seaRoute(A.port, B.port, closed) ?? router.seaRoute(A.port, B.port, new Set());
  const path = sea ? sea.path.slice() : [[A.port[1], A.port[0]] as [number, number], [B.port[1], B.port[0]] as [number, number]];
  // first-mile and last-mile legs as straight lines (rail/road)
  const first: [number, number] = [A.lon, A.lat];
  const end = path[path.length - 1];
  let lastLon = B.lon;
  if (lastLon - end[0] > 180) lastLon -= 360;
  else if (end[0] - lastLon > 180) lastLon += 360;
  let startLon = first[0];
  if (startLon - path[0][0] > 180) startLon -= 360;
  else if (path[0][0] - startLon > 180) startLon += 360;
  path.unshift([startLon, first[1]]);
  const overland: [number, number][] = [end, [lastLon, B.lat]];
  const firstKm = haversineKm(A.lat, A.lon, A.port[0], A.port[1]);
  const lastKm = haversineKm(B.port[0], B.port[1], B.lat, B.lon);
  return {
    path,
    overland,
    km: (sea?.km ?? haversineKm(A.port[0], A.port[1], B.port[0], B.port[1]) * 1.4) + firstKm,
    overlandKm: lastKm * 1.25,
    chokepoints: sea?.chokepoints ?? [],
    mode,
  };
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
