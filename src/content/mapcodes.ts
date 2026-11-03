/** Region + biome ids baked into worldmap.bin. Keep in sync with tools/gen-worldmap.mjs. */
export const REGION_IDS = ['pac', 'atl', 'lat', 'eur', 'nor', 'stp', 'mena', 'ssa', 'sas', 'eam', 'fab', 'seo'] as const;
export type RegionId = (typeof REGION_IDS)[number];

/** Raster region code (1..12) → RegionId. 0 = water, 13 = Antarctica / unclaimed. */
export const REGION_BY_CODE: (RegionId | null)[] = [null, ...REGION_IDS, null];
export const CODE_BY_REGION = Object.fromEntries(REGION_IDS.map((r, i) => [r, i + 1])) as Record<RegionId, number>;
export const ANTARCTICA_CODE = 13;

export const BIOME = {
  OCEAN: 0,
  ICE: 1,
  TUNDRA: 2,
  BOREAL: 3,
  TEMPERATE: 4,
  GRASS: 5,
  DESERT: 6,
  SAVANNA: 7,
  RAINFOREST: 8,
  MOUNTAIN: 9,
  ALPINE: 10,
  PLATEAU: 11,
  WETLAND: 12,
  FARMLAND: 13,
  LAKE: 14,
  RIVER: 15,
} as const;
