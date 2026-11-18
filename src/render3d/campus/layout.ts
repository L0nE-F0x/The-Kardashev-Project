/**
 * Where everything stands on a 3D campus. Pure (no three.js), like the pixel layout.
 *
 * Plots sit in two rows (back and front), column by column from the west, facing a frontage road
 * that meets the highway through an access road on the west side. A facility that takes two plots
 * fills a whole column, one that takes four fills two. The substation stands by the gate.
 * The campus grows to the east from a fixed west edge: buying land never moves what's built (or the gate,
 * the access road and the substation), and the ground levelled for the biggest campus covers every plot.
 */
import { FACILITIES } from '../../content/facilities';
import type { Facility, GameState, RivalBuild } from '../../sim/types';
import { siteSlots } from '../../sim/model';

export const PW = 28;
export const PD = 26;
export const GAP = 4;
/** z of the frontage road's centre line, and the highway's. */
export const FRONT_Z = PD + 5.5;
export const HIGHWAY_Z = PD + 22;

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export const rectCenter = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

export interface PlotItem {
  kind: 'facility' | 'empty' | 'rival';
  rect: Rect;
  /** Plot indexes it covers. */
  cells: number[];
  facility?: Facility;
  rival?: RivalBuild;
  /** Ordinal among the empty plots (the "slot" hover). */
  emptyIndex?: number;
}

export interface CampusLayout {
  cols: number;
  cells: Rect[];
  items: PlotItem[];
  /** The whole fenced campus (plots + roads), flattened ground. */
  bounds: Rect;
  accessX: number;
  substation: { x: number; z: number };
  /** Where the camera looks first (the middle of the plots). */
  focus: { x: number; z: number };
}

/** x of the first column's west edge (every campus). */
export const WEST_X = -(PW + GAP);
/** x of the access road's centre line. */
export const ACCESS_X = WEST_X - 8;

export function cellRect(_cols: number, i: number): Rect {
  const col = Math.floor(i / 2), row = i % 2;
  const x0 = WEST_X + col * (PW + GAP);
  // row 0 = front (towards the road), row 1 = back
  const z0 = row === 0 ? 1 : -PD - 1;
  return { x0, z0, x1: x0 + PW, z1: z0 + PD };
}

const slotsOf = (f: Facility) => FACILITIES[f.type].slots ?? 1;

export function campusLayout(s: GameState | null, siteId: string, minPlots = 2): CampusLayout {
  const facs = s ? s.facilities.filter((f) => f.siteId === siteId) : [];
  const rivals = s?.rivalBuilds?.filter((b) => b.siteId === siteId) ?? [];
  const used = facs.reduce((a, f) => a + slotsOf(f), 0) + rivals.reduce((a, b) => a + b.slots, 0);
  const n = Math.max(minPlots, s ? siteSlots(s, siteId) : minPlots, used);
  const cols = Math.max(1, Math.ceil(n / 2));
  const cells = Array.from({ length: cols * 2 }, (_, i) => cellRect(cols, i));
  const merge = (ids: number[]): Rect => ({
    x0: Math.min(...ids.map((i) => cells[i].x0)), z0: Math.min(...ids.map((i) => cells[i].z0)),
    x1: Math.max(...ids.map((i) => cells[i].x1)), z1: Math.max(...ids.map((i) => cells[i].z1)),
  });
  type Tenant = { facility?: Facility; rival?: RivalBuild; slots: number };
  let free: boolean[] = [];
  /** Give each tenant its plots, in this order. `whole` is false when one that needs whole columns found none. */
  const place = (order: Tenant[]): { items: PlotItem[]; whole: boolean } => {
    free = cells.map((_, i) => i < n);
    let whole = true;
    const take = (count: number): number[] | null => {
      if (count <= 1) {
        const i = free.findIndex((f) => f);
        if (i < 0) return null;
        free[i] = false;
        return [i];
      }
      // whole columns
      const colsNeeded = Math.ceil(count / 2);
      for (let c = 0; c + colsNeeded <= cols; c++) {
        const ids: number[] = [];
        for (let k = 0; k < colsNeeded; k++) ids.push((c + k) * 2, (c + k) * 2 + 1);
        if (ids.every((i) => free[i])) {
          for (const i of ids) free[i] = false;
          return ids;
        }
      }
      whole = false;
      return take(1);
    };
    const out: PlotItem[] = [];
    for (const t of order) {
      const ids = take(t.slots);
      if (!ids) continue;
      out.push(t.rival ? { kind: 'rival', rect: merge(ids), cells: ids, rival: t.rival } : { kind: 'facility', rect: merge(ids), cells: ids, facility: t.facility });
    }
    return { items: out, whole };
  };
  // the HQ first, then the rest in the order they were built (stable as the campus grows), then the rivals
  const ordered: Tenant[] = [
    ...[...facs.filter((f) => f.type === 'hq'), ...facs.filter((f) => f.type !== 'hq')].map((f) => ({ facility: f, slots: slotsOf(f) })),
    ...rivals.map((b) => ({ rival: b, slots: b.slots })),
  ];
  let placed = place(ordered);
  // The sim counts plots, not columns: a nuclear plant (two plots) can be bought when the free ones are a back plot
  // here and a front plot there. Stood on one of them, its second tower and its switchyard rose out of the
  // neighbours and nobody could reach its door. So when a big one finds no whole column, the campus is laid out
  // again with the big ones first (from the west, the order they were built), and everything else round them.
  if (!placed.whole) placed = place([...ordered.filter((t) => t.slots > 1), ...ordered.filter((t) => t.slots <= 1)]);
  const items: PlotItem[] = placed.items;
  let e = 0;
  free.forEach((f, i) => { if (f && i < n) items.push({ kind: 'empty', rect: cells[i], cells: [i], emptyIndex: e++ }); });
  const east = WEST_X + cols * (PW + GAP) - GAP;
  const accessX = ACCESS_X;
  return {
    cols, cells, items,
    bounds: { x0: accessX - 26, z0: -PD - 8, x1: east + 10, z1: HIGHWAY_Z + 6 },
    accessX,
    substation: { x: accessX - 14, z: FRONT_Z - 12 },
    focus: { x: (WEST_X + east) / 2, z: 4 },
  };
}
