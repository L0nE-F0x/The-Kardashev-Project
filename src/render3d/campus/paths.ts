/**
 * Where people may walk on a 3D campus. Pure (no three.js), so the tests can build it.
 *
 * A cost grid over the ground: pavements and paths are cheap, a plot's hardstanding and open ground dearer, the
 * campus roads dearer still (people cross them, they don't stroll down them), and buildings, fences, parked cars,
 * site clutter and the highway closed (grown by a person's width). Routes are A* over it, then pulled straight
 * wherever the straight line keeps to ground no dearer than the way it replaces, so a walk keeps to the pavement
 * round a corner instead of cutting across the grass, and never through anything.
 */

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface P2 { x: number; z: number }
/** A door: the spot just outside it, and the way out (unit normal). */
export interface Door { x: number; z: number; nx: number; nz: number }
/** A parked car's bay: its centre, its heading (rotation about y), its length and width. */
export interface Bay { x: number; z: number; ry: number; len: number; wid: number }

/** How much walking on each kind of ground costs (per metre). */
export const COST = { pave: 1, path: 1, gravel: 1.3, hard: 1.7, ground: 2.6, road: 9 } as const;
/** How far people keep from anything solid (a person's half-width and a little air). */
export const PAD = 0.45;

const rectOf = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
export const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });
export const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** A car's footprint as an axis-aligned box (bays face along x or z). */
export function bayRect(b: Bay): Rect {
  const along = Math.abs(Math.cos(b.ry)) > 0.7; // ry 0 / π: the car lies along x (the models face −x)
  const hx = (along ? b.len : b.wid) / 2, hz = (along ? b.wid : b.len) / 2;
  return { x0: b.x - hx, z0: b.z - hz, x1: b.x + hx, z1: b.z + hz };
}

/** Does the segment a→b pass through the inside of r? (Liang–Barsky.) */
export function segmentHitsRect(a: P2, b: P2, r: Rect, eps = 1e-6): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q > eps;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (!clip(-dx, a.x - (r.x0 + eps)) || !clip(dx, (r.x1 - eps) - a.x) || !clip(-dz, a.z - (r.z0 + eps)) || !clip(dz, (r.z1 - eps) - a.z)) return false;
  return t0 < t1;
}

// ── the grid ─────────────────────────────────────────────────────────────────────────────────
export class WalkMap {
  readonly nx: number;
  readonly nz: number;
  /** Cost per metre ×10 for each cell (0 = closed). */
  readonly cost: Uint16Array;
  /** Everything solid, as it was given (for checks). */
  readonly solids: Rect[] = [];
  readonly fences: [P2, P2][] = [];
  private cache = new Map<string, P2[] | null>();
  // the search's buffers, kept between routes
  private g: Float32Array | null = null;
  private from: Int32Array | null = null;
  private closed: Uint8Array | null = null;

  constructor(readonly bounds: Rect, readonly cell = 0.5) {
    this.nx = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) / cell));
    this.nz = Math.max(1, Math.ceil((bounds.z1 - bounds.z0) / cell));
    this.cost = new Uint16Array(this.nx * this.nz).fill(COST.ground * 10);
  }

  private ix(x: number) { return Math.floor((x - this.bounds.x0) / this.cell); }
  private iz(z: number) { return Math.floor((z - this.bounds.z0) / this.cell); }
  cx(i: number) { return this.bounds.x0 + (i + 0.5) * this.cell; }
  cz(j: number) { return this.bounds.z0 + (j + 0.5) * this.cell; }

  /** Each cell whose centre lies in r (call `fn(index)`). */
  private cells(r: Rect, fn: (k: number) => void) {
    const i0 = Math.max(0, Math.ceil((r.x0 - this.bounds.x0) / this.cell - 0.5)), i1 = Math.min(this.nx - 1, Math.floor((r.x1 - this.bounds.x0) / this.cell - 0.5));
    const j0 = Math.max(0, Math.ceil((r.z0 - this.bounds.z0) / this.cell - 0.5)), j1 = Math.min(this.nz - 1, Math.floor((r.z1 - this.bounds.z0) / this.cell - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * this.nx + i);
  }

  /** Lay a kind of ground over r (closed cells stay closed). `only` = paint over cells of exactly that cost. */
  surface(r: Rect, cost: number) {
    const c = Math.round(cost * 10);
    this.cells(r, (k) => { if (this.cost[k]) this.cost[k] = c; });
    this.cache.clear();
  }

  /** A strip of ground along a→b, w wide. */
  strip(a: P2, b: P2, w: number, cost: number) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    const c = Math.round(cost * 10);
    const done = new Set<number>();
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n, z = a.z + ((b.z - a.z) * s) / n;
      this.cells({ x0: x - w / 2, z0: z - w / 2, x1: x + w / 2, z1: z + w / 2 }, (k) => { if (!done.has(k) && this.cost[k]) { this.cost[k] = c; done.add(k); } });
    }
    this.cache.clear();
  }

  /** Something solid people walk round. */
  block(r: Rect, pad = PAD) {
    this.solids.push(r);
    this.cells(grow(r, pad), (k) => { this.cost[k] = 0; });
    this.cache.clear();
    this.comp = null;
  }

  /** Which open cells reach which (a label per connected patch, 0 = closed), worked out once per change. */
  private comp: Int32Array | null = null;
  private components() {
    if (this.comp) return this.comp;
    const { nx, nz, cost } = this;
    const comp = new Int32Array(nx * nz);
    const queue = new Int32Array(nx * nz);
    let label = 0;
    for (let s = 0; s < comp.length; s++) {
      if (!cost[s] || comp[s]) continue;
      label++;
      let head = 0, tail = 0;
      queue[tail++] = s;
      comp[s] = label;
      while (head < tail) {
        const k = queue[head++];
        const i = k % nx;
        // (four ways: the search's diagonals need both sides open, so they never join two patches)
        if (i > 0 && cost[k - 1] && !comp[k - 1]) { comp[k - 1] = label; queue[tail++] = k - 1; }
        if (i < nx - 1 && cost[k + 1] && !comp[k + 1]) { comp[k + 1] = label; queue[tail++] = k + 1; }
        if (k >= nx && cost[k - nx] && !comp[k - nx]) { comp[k - nx] = label; queue[tail++] = k - nx; }
        if (k + nx < comp.length && cost[k + nx] && !comp[k + nx]) { comp[k + nx] = label; queue[tail++] = k + nx; }
      }
    }
    return (this.comp = comp);
  }

  /** Can someone walk from a to b (each snapped to the nearest open ground)? Cheap: no search. */
  connected(a: P2, b: P2): boolean {
    const sa = this.nearestFree(a.x, a.z), sb = this.nearestFree(b.x, b.z);
    if (!sa || !sb) return false;
    const comp = this.components();
    const ka = this.iz(sa.z) * this.nx + this.ix(sa.x), kb = this.iz(sb.z) * this.nx + this.ix(sb.x);
    return comp[ka] > 0 && comp[ka] === comp[kb];
  }

  /** A fence (or wall) from a to b. */
  fence(a: P2, b: P2, pad = PAD) {
    this.fences.push([a, b]);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / (this.cell * 0.4)));
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n, z = a.z + ((b.z - a.z) * s) / n;
      this.cells({ x0: x - pad, z0: z - pad, x1: x + pad, z1: z + pad }, (k) => { this.cost[k] = 0; });
    }
    this.cache.clear();
    this.comp = null;
  }

  /** Open a gap again (a gate in a fence, a door's threshold). */
  open(r: Rect, cost: number = COST.path) {
    const c = Math.round(cost * 10);
    this.cells(r, (k) => { this.cost[k] = c; });
    this.cache.clear();
    this.comp = null;
  }

  costAt(x: number, z: number) {
    const i = this.ix(x), j = this.iz(z);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 0;
    return this.cost[j * this.nx + i] / 10;
  }
  free(x: number, z: number) { return this.costAt(x, z) > 0; }

  /** The nearest open cell's centre to (x, z), within `reach` metres (null if none). */
  nearestFree(x: number, z: number, reach = 6): P2 | null {
    if (this.free(x, z)) return { x, z };
    const i0 = this.ix(x), j0 = this.iz(z);
    const R = Math.ceil(reach / this.cell);
    let best: P2 | null = null, bd = Infinity;
    for (let r = 1; r <= R && !best; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz || !this.cost[j * this.nx + i]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = { x: this.cx(i), z: this.cz(j) }; }
      }
    }
    return best;
  }

  /** Is there room for a few people standing round (x, z) (every cell within r open and no dearer than `max`)? */
  roomAt(x: number, z: number, r: number, max = COST.ground) {
    for (let dz = -r; dz <= r; dz += this.cell * 0.9) for (let dx = -r; dx <= r; dx += this.cell * 0.9) {
      if (dx * dx + dz * dz > r * r) continue;
      const c = this.costAt(x + dx, z + dz);
      if (!c || c > max) return false;
    }
    return true;
  }

  /** The dearest ground along a→b (0 if it crosses anything closed). */
  lineCost(a: P2, b: P2) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / (this.cell * 0.25)));
    let worst = 0;
    for (let s = 0; s <= n; s++) {
      const c = this.costAt(a.x + ((b.x - a.x) * s) / n, a.z + ((b.z - a.z) * s) / n);
      if (!c) return 0;
      if (c > worst) worst = c;
    }
    return worst;
  }

  /**
   * The way from a to b: A* over the cells (8 ways, no cutting closed corners), pulled straight where the line keeps
   * to ground no dearer than the cells it skips. Ends at exactly a and b when they're open. Null if b can't be reached.
   */
  route(a: P2, b: P2): P2[] | null {
    const key = `${a.x.toFixed(1)},${a.z.toFixed(1)}>${b.x.toFixed(1)},${b.z.toFixed(1)}`;
    if (this.cache.has(key)) return this.cache.get(key)!?.slice() ?? null;
    const out = this.search(a, b);
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, out);
    return out?.slice() ?? null;
  }

  private search(a: P2, b: P2): P2[] | null {
    const sa = this.nearestFree(a.x, a.z), sb = this.nearestFree(b.x, b.z);
    if (!sa || !sb) return null;
    const { nx, nz, cost } = this;
    const start = this.iz(sa.z) * nx + this.ix(sa.x), goal = this.iz(sb.z) * nx + this.ix(sb.x);
    const gx = goal % nx, gz = Math.floor(goal / nx);
    const N = nx * nz;
    if (!this.g || this.g.length !== N) { this.g = new Float32Array(N); this.from = new Int32Array(N); this.closed = new Uint8Array(N); }
    const g = this.g.fill(Infinity), from = this.from!.fill(-1), closed = this.closed!.fill(0);
    // a binary heap of (f, cell)
    let hk = new Int32Array(1024), hf = new Float32Array(1024), hn = 0;
    const push = (k: number, f: number) => {
      if (hn === hk.length) { const k2 = new Int32Array(hn * 2); k2.set(hk); hk = k2; const f2 = new Float32Array(hn * 2); f2.set(hf); hf = f2; }
      let i = hn++;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hk[i] = hk[p]; hf[i] = hf[p]; i = p; }
      hk[i] = k; hf[i] = f;
    };
    const pop = () => {
      const top = hk[0];
      const lk = hk[--hn], lf = hf[hn];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= hn) break;
        if (c + 1 < hn && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hk[i] = hk[c]; hf[i] = hf[c]; i = c;
      }
      hk[i] = lk; hf[i] = lf;
      return top;
    };
    // octile distance in metres at the cheapest ground, a touch greedy (routes stay near-best, searches stay small)
    const h = (k: number) => {
      const dx = Math.abs((k % nx) - gx), dz = Math.abs(Math.floor(k / nx) - gz);
      return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * this.cell * COST.pave * 1.15;
    };
    g[start] = 0;
    push(start, h(start));
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    let found = false;
    while (hn) {
      const k = pop();
      if (closed[k]) continue;
      if (k === goal) { found = true; break; }
      closed[k] = 1;
      const i = k % nx, j = (k - i) / nx;
      for (let d = 0; d < 8; d++) {
        const ii = i + DI[d], jj = j + DJ[d];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = jj * nx + ii;
        if (!cost[n] || closed[n]) continue;
        // diagonals only past two open sides (never squeezing round a closed corner)
        if (d >= 4 && (!cost[j * nx + ii] || !cost[jj * nx + i])) continue;
        const step = (d >= 4 ? 1.4142 : 1) * this.cell * (cost[k] + cost[n]) / 20;
        const ng = g[k] + step;
        if (ng < g[n]) { g[n] = ng; from[n] = k; push(n, ng + h(n)); }
      }
    }
    if (!found) return null;
    const cellsOut: P2[] = [];
    for (let k = goal; k >= 0; k = from[k]) cellsOut.push({ x: this.cx(k % nx), z: this.cz(Math.floor(k / nx)) });
    cellsOut.reverse();
    // the exact ends where they're open
    if (this.free(a.x, a.z)) cellsOut[0] = { x: a.x, z: a.z };
    if (this.free(b.x, b.z)) cellsOut[cellsOut.length - 1] = { x: b.x, z: b.z };
    else cellsOut[cellsOut.length - 1] = sb;
    return this.pull(cellsOut);
  }

  /** String-pull a cell path: skip ahead while the straight line is open and no dearer than what it replaces. */
  private pull(p: P2[]): P2[] {
    if (p.length <= 2) return p;
    const out: P2[] = [p[0]];
    let i = 0;
    while (i < p.length - 1) {
      let best = i + 1, misses = 0;
      let worst = this.costAt(p[i].x, p[i].z);
      for (let j = i + 1; j < p.length && j <= i + 160; j++) {
        worst = Math.max(worst, this.costAt(p[j].x, p[j].z));
        const lc = this.lineCost(p[i], p[j]);
        if (lc && lc <= worst + 0.05) { best = j; misses = 0; } else if (++misses > 14) break;
      }
      out.push(p[best]);
      i = best;
    }
    return out;
  }
}

// ── a campus ─────────────────────────────────────────────────────────────────────────────────
/** A building (or yard, field, set piece) as the people see it, in world coordinates. */
export interface Place {
  id: string;
  /** What it is: drives who works there and what they do. */
  kind: 'hq' | 'hall' | 'lab' | 'plant' | 'yard' | 'field' | 'set' | 'rival';
  /** The plot (or the set piece's rect). */
  rect: Rect;
  /** The piece's footprint centre (world). */
  cx: number;
  cz: number;
  solids: Rect[];
  doors: Door[];
  bays: Bay[];
  /** A fence round the plot: its rect and the gate's x range on the front side. */
  fence?: { rect: Rect; gate: [number, number] };
  /** Under construction (a crew works round it). */
  building: boolean;
  /** The building site while it's built: the site office's door, the material stacks, what stands about. */
  site?: { door: Door; stack: P2; solids: Rect[] };
}

/** A facility type as a place: who works there and what they do. */
export function placeKind(type: string): Place['kind'] {
  return type === 'hq' ? 'hq' : type === 'datacenter' || type === 'campus' ? 'hall' : type === 'lab' ? 'lab'
    : type === 'solar' || type === 'wind' ? 'field' : type === 'battery' ? 'yard' : 'plant';
}
/** Facility types the scene fences (with a 7 m gate in the front). */
export const FENCED = new Set(['datacenter', 'battery', 'gas']);

/** What the piece builders tell (piece-local, origin at the footprint centre). */
export interface PieceShape {
  w: number;
  d: number;
  doors?: { x: number; z: number; nx?: number; nz?: number }[];
  blockers?: Rect[];
  bays?: Bay[];
}

/** A piece on its plot → a Place (world coordinates; the piece's origin at (cx, cz), no rotation). */
export function placeOf(id: string, kind: Place['kind'], rect: Rect, shape: PieceShape, cx: number, cz: number, o: { fence?: number; building?: boolean } = {}): Place {
  const solids = (shape.blockers ?? [{ x0: -shape.w / 2, z0: -shape.d / 2, x1: shape.w / 2, z1: shape.d / 2 }]).map((r) => rectOf(r.x0 + cx, r.z0 + cz, r.x1 + cx, r.z1 + cz));
  // doors: as given, else the middle of the front face (+z), a step out
  const doors: Door[] = (shape.doors?.length ? shape.doors : [{ x: 0, z: shape.d / 2 + 0.7, nx: 0, nz: 1 }]).map((d) => {
    const nx = d.nx ?? 0, nz = d.nz ?? 1, l = Math.hypot(nx, nz) || 1;
    return { x: d.x + cx, z: d.z + cz, nx: nx / l, nz: nz / l };
  });
  const bays = (shape.bays ?? []).map((b) => ({ ...b, x: b.x + cx, z: b.z + cz }));
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  const fence = o.fence !== undefined ? { rect: { x0: (rect.x0 + rect.x1) / 2 - (w - 1.2) / 2, z0: (rect.z0 + rect.z1) / 2 - (d - 1.2) / 2, x1: (rect.x0 + rect.x1) / 2 + (w - 1.2) / 2, z1: (rect.z0 + rect.z1) / 2 + (d - 1.2) / 2 }, gate: [(rect.x0 + rect.x1) / 2 - o.fence / 2, (rect.x0 + rect.x1) / 2 + o.fence / 2] as [number, number] } : undefined;
  return { id, kind, rect, cx, cz, solids, doors, bays, fence, building: !!o.building };
}

/**
 * A building site on a w × d plot (plot-local), as the scene dresses it: the scaffold round the building (its first
 * blocker, or the middle of the footprint), the site office and loo by the front, the stacks, the crane's base at
 * the back, the mixer by the office. What stands there, where the crew clock on, where they fetch from.
 */
export function sitePlan(w: number, d: number, piece: { w: number; d: number; blockers?: Rect[] }, o: { scaffold: boolean; crane: boolean }) {
  const solids: Rect[] = [];
  const body = piece.blockers?.[0];
  let scaffold: { x: number; z: number; w: number; d: number } | null = null;
  if (o.scaffold) {
    const sw = body ? body.x1 - body.x0 + 1.2 : Math.min(w - 2, piece.w - 1.2), sd = body ? body.z1 - body.z0 + 1.2 : Math.min(d - 3, piece.d - 4);
    scaffold = { x: body ? (body.x0 + body.x1) / 2 : 0, z: body ? (body.z0 + body.z1) / 2 : 0, w: sw, d: sd };
    solids.push({ x0: scaffold.x - sw / 2 - 0.1, z0: scaffold.z - sd / 2 - 0.1, x1: scaffold.x + sw / 2 + 0.1, z1: scaffold.z + sd / 2 + 0.1 });
  }
  // (siteClutter(w − 2, d − 2): the office 4 × 1.6, the loo, four stacks)
  const cw = w - 2, cd = d - 2;
  solids.push({ x0: -cw / 2 + 0.6, z0: cd / 2 - 2.2, x1: -cw / 2 + 4.6, z1: cd / 2 - 0.6 });
  solids.push({ x0: -cw / 2 + 4.8, z0: cd / 2 - 1.6, x1: -cw / 2 + 5.6, z1: cd / 2 - 0.8 });
  solids.push({ x0: cw / 2 - 7.3, z0: cd / 2 - 5.9, x1: cw / 2 - 0.7, z1: cd / 2 - 1.0 });
  if (o.crane) solids.push({ x0: w / 2 - 4.1, z0: -d / 2 + 1.9, x1: w / 2 - 1.9, z1: -d / 2 + 4.1 });
  // the mixer truck, 7.5 long, by the office
  solids.push({ x0: -w / 2 + 1.2, z0: d / 2 - 6.2, x1: -w / 2 + 8.8, z1: d / 2 - 2.8 });
  return { scaffold, solids, door: { x: -cw / 2 + 2.6, z: cd / 2 + 0.05 }, stack: { x: cw / 2 - 4, z: cd / 2 - 6.6 } };
}

/** The campus roads, as the scene lays them (see campusScene's buildRoads and the ground's contract). */
export interface Roads {
  /** z of the frontage road's centre line, x of the access road's, z of the highway's. */
  frontZ: number;
  accessX: number;
  highwayZ: number;
  /** x where the frontage road ends in the east. */
  east: number;
  /** z of the gravel service lane behind the back row (null: none). */
  laneZ: number | null;
  /** The north end of the access road. */
  accessNorth: number;
}

/** The pavements (centre lines) people walk along: the frontage road's campus side, the access road's east side. */
export const frontPavementZ = (r: Roads) => r.frontZ - 3.75;
export const accessPavementX = (r: Roads) => r.accessX + 3.75;

/**
 * The campus's walk map: pavements, the service lane, the roads (crossable), each place's ground (hardstanding on
 * its plot), then everything solid and the fences with their gates. `extra` = more solids (site clutter, benches…).
 */
export function campusWalkMap(bounds: Rect, roads: Roads, places: Place[], extra: Rect[] = []): WalkMap {
  const m = new WalkMap(bounds);
  const pz = frontPavementZ(roads), ax = accessPavementX(roads);
  // the roads: crossable but no place for a stroll; the highway is closed to walkers
  m.surface(rectOf(roads.accessX - 3, roads.accessNorth, roads.accessX + 3, roads.highwayZ - 6), COST.road);
  m.surface(rectOf(roads.accessX, roads.frontZ - 3, roads.east + 6, roads.frontZ + 3), COST.road);
  m.block(rectOf(bounds.x0, roads.highwayZ - 6, bounds.x1, bounds.z1), 0);
  if (roads.laneZ !== null) m.surface(rectOf(roads.accessX, roads.laneZ - 1.6, roads.east + 2, roads.laneZ + 1.6), COST.gravel);
  // plots: hardstanding (gravel pads, car parks)
  for (const p of places) m.surface(p.rect, COST.hard);
  // the pavements (laid after, so they win)
  m.surface(rectOf(roads.accessX + 3.05, pz - 0.7, roads.east + 6, pz + 0.7), COST.pave);
  m.surface(rectOf(ax - 0.7, roads.accessNorth, ax + 0.7, roads.highwayZ - 7), COST.pave);
  for (const p of places) {
    for (const s of p.solids) m.block(s);
    // parked cars (a building site's car park is empty till it opens)
    if (!p.building) for (const b of p.bays) m.block(bayRect(b), 0.35);
    if (p.fence) {
      const f = p.fence.rect, [g0, g1] = p.fence.gate;
      m.fence({ x: f.x0, z: f.z0 }, { x: f.x1, z: f.z0 });
      m.fence({ x: f.x0, z: f.z0 }, { x: f.x0, z: f.z1 });
      m.fence({ x: f.x1, z: f.z0 }, { x: f.x1, z: f.z1 });
      m.fence({ x: f.x0, z: f.z1 }, { x: g0, z: f.z1 });
      m.fence({ x: g1, z: f.z1 }, { x: f.x1, z: f.z1 });
    }
  }
  for (const r of extra) m.block(r);
  for (const p of places) if (p.site) for (const s of p.site.solids) m.block(s);
  // every door's threshold stays open (a door set into a blocker's padding)
  for (const p of places) for (const d of [...p.doors, ...(p.site ? [p.site.door] : [])]) if (!m.free(d.x, d.z)) m.open({ x0: d.x - 0.3, z0: d.z - 0.3, x1: d.x + 0.3, z1: d.z + 0.3 }, COST.path);
  return m;
}

/** Where a place's people meet the pavement: the gate (fenced) or the pavement right in front of the first door. */
export function placeGate(p: Place, roads: Roads): P2 {
  const pz = frontPavementZ(roads);
  if (p.fence) return { x: (p.fence.gate[0] + p.fence.gate[1]) / 2, z: p.fence.rect.z1 + 0.9 };
  const d = p.doors[0];
  // a back-row plot meets the walk between the rows; a front-row one the pavement
  if (p.rect.z1 < 0) return { x: d.x, z: p.rect.z1 + 1 };
  return { x: d.x, z: pz };
}

/** Length of a polyline. */
export function pathLength(p: P2[]) {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
  return s;
}
