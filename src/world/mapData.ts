import { BIOME } from '../content/mapcodes';

export interface MapLod {
  W: number;
  H: number;
  /** Degrees per pixel. */
  res: number;
  region: Uint8Array;
  biome: Uint8Array;
  /** Distance (px, 4-neighbour) to the nearest pixel of the other kind (land↔sea). */
  coast: Int16Array;
}

/** Decode worldmap.bin (see tools/gen-worldmap.mjs for the format). */
export function decodeWorldMap(buf: ArrayBuffer): MapLod[] {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (bytes[0] !== 0x4b || bytes[1] !== 0x50 || bytes[2] !== 0x57 || bytes[3] !== 0x4d) throw new Error('worldmap.bin: bad magic');
  const count = bytes[5];
  const heads: { W: number; H: number; len: number }[] = [];
  let off = 6;
  for (let i = 0; i < count; i++) {
    heads.push({ W: dv.getUint16(off, true), H: dv.getUint16(off + 2, true), len: dv.getUint32(off + 4, true) });
    off += 8;
  }
  const lods: MapLod[] = [];
  for (const h of heads) {
    const packed = new Uint8Array(h.W * h.H);
    let p = 0;
    const end = off + h.len;
    while (off < end) {
      const v = bytes[off++];
      let run = 0;
      let shift = 0;
      for (;;) {
        const b = bytes[off++];
        run |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      packed.fill(v, p, p + run);
      p += run;
    }
    const region = new Uint8Array(packed.length);
    const biome = new Uint8Array(packed.length);
    for (let i = 0; i < packed.length; i++) {
      region[i] = packed[i] >> 4;
      biome[i] = packed[i] & 0x0f;
    }
    lods.push({ W: h.W, H: h.H, res: 360 / h.W, region, biome, coast: coastDistance(h.W, h.H, biome) });
  }
  return lods;
}

/** BFS distance from each pixel to the nearest pixel of the opposite land/sea type. */
function coastDistance(W: number, H: number, biome: Uint8Array): Int16Array {
  const dist = new Int16Array(W * H).fill(-1);
  const isSea = (i: number) => biome[i] === BIOME.OCEAN;
  const queue = new Int32Array(W * H);
  let qh = 0;
  let qt = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const s = isSea(i);
      const l = y * W + ((x - 1 + W) % W);
      const r = y * W + ((x + 1) % W);
      const u = y > 0 ? i - W : i;
      const d = y < H - 1 ? i + W : i;
      if (isSea(l) !== s || isSea(r) !== s || isSea(u) !== s || isSea(d) !== s) {
        dist[i] = 1;
        queue[qt++] = i;
      }
    }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % W;
    const y = (i / W) | 0;
    const s = isSea(i);
    const nb = [y * W + ((x - 1 + W) % W), y * W + ((x + 1) % W), y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const n of nb) {
      if (n < 0 || dist[n] >= 0 || isSea(n) !== s) continue;
      dist[n] = dist[i] + 1;
      queue[qt++] = n;
    }
  }
  for (let i = 0; i < dist.length; i++) if (dist[i] < 0) dist[i] = 999;
  return dist;
}

/** Equirectangular projection helpers for a LOD. */
export function project(lod: { res: number }, lon: number, lat: number): { x: number; y: number } {
  return { x: (lon + 180) / lod.res, y: (90 - lat) / lod.res };
}

export function unproject(lod: { res: number }, x: number, y: number): { lon: number; lat: number } {
  return { lon: x * lod.res - 180, lat: 90 - y * lod.res };
}

export function sampleRegionCode(lod: MapLod, x: number, y: number): number {
  const xi = ((Math.floor(x) % lod.W) + lod.W) % lod.W;
  const yi = Math.floor(y);
  if (yi < 0 || yi >= lod.H) return 0;
  return lod.region[yi * lod.W + xi];
}

export function sampleBiome(lod: MapLod, x: number, y: number): number {
  const xi = ((Math.floor(x) % lod.W) + lod.W) % lod.W;
  const yi = Math.floor(y);
  if (yi < 0 || yi >= lod.H) return 0;
  return lod.biome[yi * lod.W + xi];
}
