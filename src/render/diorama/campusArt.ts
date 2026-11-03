/**
 * Which art a layout item shows right now (finished, under construction, mid-upgrade, rival,
 * set piece), plus a stable cache key for its textures. Pure — shared by the scene and the
 * headless preview.
 */
import type { FacilityType } from '../../sim/types';
import { constructionArt, emptyPlotArt, facilityArt, upgradeArt, type FacilityArt } from './art';
import { pieceArt, pieceKey, rivalArt, rivalConstructionArt } from './industry';
import { isAct3Piece } from './act3Pieces';
import type { LayoutItem } from './layout';

export interface ItemArt {
  key: string;
  art: FacilityArt;
  /** Construction site (no lights, no effects). */
  building: boolean;
  /**
   * Bake per scene and free on leaving (Act III's wide, state-dependent set pieces), instead of
   * keeping the textures for the whole session.
   */
  transient?: boolean;
}

const still = (pc: FacilityArt['base'][number]): FacilityArt => ({ base: [pc], glow: [], points: {} });
const cache = new Map<string, FacilityArt>();

function memo(key: string, make: () => FacilityArt): FacilityArt {
  let a = cache.get(key);
  if (!a) {
    a = make();
    cache.set(key, a);
    // construction buckets churn as sites progress: keep the cache bounded
    if (cache.size > 400) cache.delete(cache.keys().next().value as string);
  }
  return a;
}

/** Progress buckets: construction art changes in visible steps, not every day. */
export const bucket = (progress: number, steps = 8) => Math.floor(Math.max(0, Math.min(1, progress)) * steps) / steps;

export function itemArt(item: LayoutItem, label: string, day: number): ItemArt | null {
  switch (item.kind) {
    case 'empty':
      return { key: `empty:${item.w}`, art: still(emptyPlotArt(item.w, false)), building: false };
    case 'substation':
      return { key: 'substation', art: facilityArt('substation', label), building: false };
    case 'piece': {
      const p = item.piece!;
      return { key: `piece:${pieceKey(p)}`, art: pieceArt(p), building: false, transient: isAct3Piece(p.kind) };
    }
    case 'rival': {
      const b = item.rival!;
      if (b.status === 'building') {
        const span = Math.max(1, b.readyDay - b.startDay);
        const k = bucket((day - b.startDay) / span);
        const key = `rival:${b.owner}:${b.slots}:b${k}`;
        return { key, art: memo(key, () => still(rivalConstructionArt(b.owner, b.slots, k))), building: true };
      }
      return { key: `rival:${b.owner}:${b.slots}`, art: rivalArt(b.owner, b.slots), building: false };
    }
    case 'facility': {
      const f = item.facility!;
      const type = f.type as FacilityType;
      const tier = f.tier ?? 1;
      if (f.status === 'building') {
        const k = bucket(f.progress / Math.max(1, f.buildDays));
        const blocked = !!f.blocked;
        const key = `build:${type}:${tier}:${k}:${label}:${blocked}`;
        return { key, art: memo(key, () => still(constructionArt(type, k, label, tier, blocked))), building: true };
      }
      if (f.upgrade && f.upgrade.to > tier) {
        const k = bucket(f.upgrade.progress / Math.max(1, f.upgrade.buildDays), 6);
        const key = `up:${type}:${tier}>${f.upgrade.to}:${k}:${label}`;
        return { key, art: memo(key, () => upgradeArt(type, label, tier, f.upgrade!.to, k)), building: false };
      }
      return { key: `${type}:${label}:t${tier}`, art: facilityArt(type, label, tier), building: false };
    }
  }
}
