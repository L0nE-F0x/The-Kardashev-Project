import fs from 'node:fs';
import path from 'node:path';
import { decodeWorldMap, type MapLod } from '../../src/world/mapData';
import { Router } from '../../src/world/routing';

let cached: { lods: MapLod[]; router: Router } | null = null;

/** Load the generated world map + router once per test process. */
export function loadWorld(): { lods: MapLod[]; router: Router } {
  if (cached) return cached;
  const buf = fs.readFileSync(path.resolve(__dirname, '../../src/content/generated/worldmap.bin'));
  const lods = decodeWorldMap(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  cached = { lods, router: new Router(lods[0]) };
  return cached;
}
