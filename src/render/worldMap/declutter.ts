/**
 * Map declutter for the MapScene, kept free of Pixi so it runs (and is tested) in Node.
 *
 * - `spreadMarkers` nudges crowded site markers apart by a few whole pixels (heavier markers, like
 *   your own sites, move less), so every site keeps a spot of its own to click on.
 * - `placeLabels` lays labels out greedily by priority: each tries a few spots around its marker
 *   and is hidden when none is free of the labels placed before it.
 *
 * Everything works in absolute map pixels of one LOD, wrapping horizontally every `W` pixels, so
 * the results don't depend on the camera: the scene re-runs them only when the inputs change.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Overlap of two spans [a0, a0+aw) and [b0, b0+bw). */
const span = (a0: number, aw: number, b0: number, bw: number) => Math.min(a0 + aw, b0 + bw) - Math.max(a0, b0);

/** `b.x` moved by whole map widths to sit nearest `a.x` (the map wraps east–west). */
export function nearX(ax: number, bx: number, W: number): number {
  return bx + Math.round((ax - bx) / W) * W;
}

/** Overlap area of two absolute rects on a map that wraps every W px (0 when apart). */
export function overlapArea(a: Rect, b: Rect, W: number): number {
  const bx = nearX(a.x + a.w / 2, b.x + b.w / 2, W) - b.w / 2;
  const ox = span(a.x, a.w, bx, b.w);
  const oy = span(a.y, a.h, b.y, b.h);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

// ── markers ──────────────────────────────────────────────────────────────────────────────────
export interface SpreadItem {
  id: string;
  /** The site's own pixel (absolute, whole pixels). */
  x: number;
  y: number;
  /**
   * What it draws, relative to that pixel: the marker first, then whatever hangs off it (glyph
   * row, rival campuses, cranes). Kept as separate boxes so a small marker can tuck into the
   * empty corner of a big footprint instead of being shoved round the whole of it.
   */
  rects: Rect[];
  /** Heavier items give way less (your own sites stay closest to where they really are). */
  weight: number;
}

/** The union of some rects. */
export function unionRect(rects: Rect[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface SpreadOpts {
  /** Map width in px (wrap period). */
  W: number;
  /** Furthest a marker may move from its site, per axis (x, y). */
  maxX: number;
  maxY: number;
  /** Space to keep between footprints (negative = how much they may still overlap). */
  gap: number;
  iterations?: number;
}

export interface Shift {
  dx: number;
  dy: number;
}

/** Stable pseudo-random sign from an id, for markers sitting exactly on top of each other. */
function idSign(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h & 1 ? 1 : -1;
}

/**
 * Push overlapping footprints apart along the axis where they overlap least (sideways first, so
 * labels keep the space above), splitting each push by weight, then round to whole pixels.
 * Deterministic: the same inputs always give the same layout, so nothing jitters frame to frame.
 */
export function spreadMarkers(items: SpreadItem[], opts: SpreadOpts): Map<string, Shift> {
  const n = items.length;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const { W, gap } = opts;
  const boxes = items.map((it) => unionRect(it.rects));
  // only pairs that could ever touch need looking at
  const reachX = opts.maxX * 2 + gap + 1;
  const reachY = opts.maxY * 2 + gap + 1;
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = nearX(items[i].x, items[j].x, W) - items[i].x;
      const oy = items[j].y - items[i].y;
      if (ox + b.x < a.x + a.w + reachX && a.x < ox + b.x + b.w + reachX && oy + b.y < a.y + a.h + reachY && a.y < oy + b.y + b.h + reachY) pairs.push([i, j]);
    }
  }
  const iterations = opts.iterations ?? 30;
  for (let it = 0; it < iterations && pairs.length; it++) {
    let moved = false;
    for (const [i, j] of pairs) {
      const a = items[i];
      const b = items[j];
      const ax = a.x + dx[i];
      const ay = a.y + dy[i];
      // b's pixel, moved by whole map widths next to a's
      const bx = nearX(a.x, b.x, W) + dx[j];
      const by = b.y + dy[j];
      // the deepest-overlapping pair of boxes decides the push
      let depth = 0;
      let alongX = true;
      let cx = 0;
      let cy = 0;
      for (const ra of a.rects) {
        for (const rb of b.rects) {
          const ox = span(ax + ra.x, ra.w, bx + rb.x, rb.w) + gap;
          const oy = span(ay + ra.y, ra.h, by + rb.y, rb.h) + gap;
          if (ox <= 0 || oy <= 0) continue;
          const x = ox <= oy * 1.5;
          const d = x ? ox : oy;
          if (d <= depth) continue;
          depth = d;
          alongX = x;
          // centre-to-centre direction of the two boxes
          cx = bx + rb.x + rb.w / 2 - (ax + ra.x + ra.w / 2);
          cy = by + rb.y + rb.h / 2 - (ay + ra.y + ra.h / 2);
        }
      }
      if (!depth) continue;
      const wa = a.weight / (a.weight + b.weight);
      const wb = 1 - wa;
      // half a step each pass keeps crowds from oscillating (ties broken by id so twins still part)
      const d = depth * 0.5 + 0.01;
      if (alongX) {
        const sx = cx > 0.01 ? 1 : cx < -0.01 ? -1 : idSign(a.id + b.id);
        dx[i] -= sx * d * wb;
        dx[j] += sx * d * wa;
      } else {
        const sy = cy > 0.01 ? 1 : cy < -0.01 ? -1 : idSign(b.id + a.id);
        dy[i] -= sy * d * wb;
        dy[j] += sy * d * wa;
      }
      moved = true;
    }
    for (let k = 0; k < n; k++) {
      dx[k] = Math.max(-opts.maxX, Math.min(opts.maxX, dx[k]));
      dy[k] = Math.max(-opts.maxY, Math.min(opts.maxY, dy[k]));
    }
    if (!moved) break;
  }
  const out = new Map<string, Shift>();
  for (let k = 0; k < n; k++) {
    const sx = Math.round(dx[k]);
    const sy = Math.round(dy[k]);
    if (sx || sy) out.set(items[k].id, { dx: sx, dy: sy });
  }
  return out;
}

// ── labels ───────────────────────────────────────────────────────────────────────────────────
export interface LabelReq {
  id: string;
  w: number;
  h: number;
  /** Higher goes first; ties keep their order. */
  prio: number;
  /**
   * 'site': spots around `marker` (above, below, beside, then the corners), clear of `foot`
   * (the marker plus its glyph rows). 'area': a region name centred on (`x`, `y`), nudged a little.
   */
  kind: 'site' | 'area';
  marker?: Rect;
  foot?: Rect;
  x?: number;
  y?: number;
  /** The marker this label belongs to, which it may sit next to (never counted as covered). */
  owner?: string;
  /** Always shown (hovered, selected): may cover any marker, and takes its usual spot if nothing is free. */
  force?: boolean;
  /** May cover markers (area names drawn under them); it still covers as few as it can. */
  soft?: boolean;
  /** The candidate it took last time, tried first so names don't hop about when something else changes. */
  prev?: number;
}

export interface Obstacle extends Rect {
  id: string;
  /** Labels must keep clear of hard obstacles (your own sites, the Charter's); soft ones they just avoid if they can. */
  hard: boolean;
}

const AREA_NUDGES: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const dy of [0, -5, 5, -10, 10, -15, 15]) for (const dx of [0, -8, 8, -16, 16, -24, 24]) out.push([dx, dy]);
  return out.sort((a, b) => Math.abs(a[0]) / 8 + Math.abs(a[1]) / 5 - (Math.abs(b[0]) / 8 + Math.abs(b[1]) / 5));
})();

/**
 * What moving an area name costs, in px² of marker it may cover instead: a name stays over its
 * region and lets a small marker sit on it rather than drift off into the next crowd.
 */
const AREA_MOVE_COST = 4;

/** Candidate top-left corners for a label, best first, with what moving there costs. */
export function labelSpots(r: LabelReq): { x: number; y: number; cost: number }[] {
  if (r.kind === 'area') {
    // its own spot, then nudges outwards (a row up or down counts as far as 8 px sideways)
    const x = Math.floor((r.x ?? 0) - r.w / 2);
    const y = Math.floor(r.y ?? 0);
    return AREA_NUDGES.map(([dx, dy]) => ({ x: x + dx, y: y + dy, cost: AREA_MOVE_COST * (Math.abs(dx) + Math.abs(dy) * 1.6) }));
  }
  const m = r.marker!;
  const f = r.foot ?? m;
  const cx = m.x + Math.floor(m.w / 2);
  const cy = m.y + Math.floor(m.h / 2);
  const above = Math.min(m.y, f.y) - r.h;
  const below = f.y + f.h;
  const midY = cy - Math.floor(r.h / 2);
  const centred = cx - Math.floor(r.w / 2);
  return [
    { x: centred, y: above },
    { x: centred, y: below },
    { x: f.x + f.w, y: midY },
    { x: f.x - r.w, y: midY },
    { x: m.x + m.w - 3, y: above },
    { x: m.x - r.w + 3, y: above },
    { x: m.x + m.w - 3, y: below },
    { x: m.x - r.w + 3, y: below },
  ].map((p) => ({ ...p, cost: 0 }));
}

/**
 * Greedy label layout: highest priority first, each at the first candidate spot that overlaps no
 * label placed before it and no hard obstacle, covering as few soft ones as it can. A label with no
 * such spot is hidden (null), unless it's `force`d. Returns each label's top-left and candidate index.
 */
export function placeLabels(reqs: LabelReq[], obstacles: Obstacle[], W: number): Map<string, { x: number; y: number; i: number } | null> {
  const order = reqs.map((r, i) => ({ r, i })).sort((a, b) => b.r.prio - a.r.prio || a.i - b.i);
  const placed: Rect[] = [];
  const out = new Map<string, { x: number; y: number; i: number } | null>();
  for (const { r } of order) {
    const spots = labelSpots(r);
    const tryOrder = spots.map((_, i) => i);
    if (r.prev !== undefined && r.prev > 0 && r.prev < spots.length) {
      tryOrder.splice(r.prev, 1);
      tryOrder.unshift(r.prev);
    }
    let best: { x: number; y: number; i: number } | null = null;
    let bestScore = Infinity;
    for (const i of tryOrder) {
      const box = { x: spots[i].x, y: spots[i].y, w: r.w, h: r.h };
      if (placed.some((p) => overlapArea(box, p, W) > 0)) continue;
      let score = spots[i].cost;
      let blocked = false;
      for (const o of obstacles) {
        if (score >= bestScore) break;
        if (o.id === r.owner) continue;
        const a = overlapArea(box, o, W);
        if (!a) continue;
        if (o.hard && !r.force && !r.soft) {
          blocked = true;
          break;
        }
        score += a;
      }
      if (blocked || score >= bestScore) continue;
      best = { x: spots[i].x, y: spots[i].y, i };
      bestScore = score;
      if (score === 0) break;
    }
    // nowhere free of other labels: hovered and selected names still show, in their usual spot
    if (!best && r.force) best = { x: spots[0].x, y: spots[0].y, i: 0 };
    out.set(r.id, best);
    if (best) placed.push({ x: best.x, y: best.y, w: r.w, h: r.h });
  }
  return out;
}
