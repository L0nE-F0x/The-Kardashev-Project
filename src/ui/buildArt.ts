import type { FacilityType } from '../sim/types';

/**
 * The build menu's pictures: each facility type as its own 3D piece, rendered by `node tools/thumbs.mjs` into
 * src/assets/build/ (420 × 280 WebP, about 15 KB each). A type without a picture gets none and shows its icon.
 */
const ART = import.meta.glob('../assets/build/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BY_TYPE: Record<string, string> = Object.fromEntries(Object.entries(ART).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -5), url]));

export function buildArtUrl(type: FacilityType): string | null {
  return BY_TYPE[type] ?? null;
}
