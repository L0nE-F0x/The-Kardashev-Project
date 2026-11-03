import type { FacilityType } from '../../sim/types';

export type ArtType = FacilityType | 'substation';

/** Diorama sprite size per tier (index 0 = tier 1), in pixels. */
export const SIZES: Record<ArtType, [number, number][]> = {
  datacenter: [[112, 46], [164, 50], [172, 84]],
  solar: [[118, 26], [156, 32], [196, 38]],
  wind: [[104, 92], [150, 96], [196, 100]],
  battery: [[74, 26], [112, 32], [150, 36]],
  gas: [[96, 66], [124, 84], [156, 88]],
  lab: [[82, 48], [112, 60], [146, 76]],
  hq: [[66, 38]],
  substation: [[46, 44]],
  hydro: [[156, 74], [196, 78]],
  geothermal: [[112, 56], [136, 60], [168, 64]],
  restart: [[150, 100]],
  smr: [[124, 56], [168, 58]],
  reactor: [[240, 118]],
  packaging: [[132, 40], [164, 44], [196, 50]],
  fab: [[216, 86]],
  campus: [[432, 108]],
};

export function maxTier(type: ArtType): number {
  return SIZES[type].length;
}

export function clampTier(type: ArtType, tier: number): number {
  return Math.max(1, Math.min(SIZES[type].length, Math.round(tier) || 1));
}

export function facilitySize(type: ArtType, tier = 1): [number, number] {
  return SIZES[type][clampTier(type, tier) - 1];
}
