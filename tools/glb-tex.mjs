// Shrink a GLB's textures (no npm deps; uses ImageMagick's `magick`) and print its size and bounds.
//   node tools/glb-tex.mjs in.glb out.glb [--size 1024] [--quality 86]
// Images are re-encoded as WebP (three's GLTFLoader reads image/webp in core glTF via the browser).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [inp, out, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i < 0 ? d : rest[i + 1]; };
const SIZE = Number(opt('size', 1024));
const Q = Number(opt('quality', 86));

const b = fs.readFileSync(inp);
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));

// new bytes per bufferView (images replaced, everything else copied)
const views = json.bufferViews.map((v) => bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
for (const img of json.images ?? []) {
  if (img.bufferView === undefined) continue;
  const src = views[img.bufferView];
  const res = execFileSync('magick', ['-', '-resize', `${SIZE}x${SIZE}>`, '-quality', String(Q), 'webp:-'], { input: src, maxBuffer: 1 << 28 });
  views[img.bufferView] = res;
  img.mimeType = 'image/webp';
}
// re-lay the buffer, 4-byte aligned
let off = 0;
const chunks = [];
json.bufferViews.forEach((v, i) => {
  const pad = (4 - (off % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  v.byteOffset = off;
  v.byteLength = views[i].length;
  chunks.push(views[i]);
  off += views[i].length;
});
const binOut = Buffer.concat(chunks, off);
const binPad = (4 - (binOut.length % 4)) % 4;
json.buffers = [{ byteLength: binOut.length + binPad }];
let jsonBuf = Buffer.from(JSON.stringify(json));
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
const total = 12 + 8 + jsonBuf.length + 8 + binOut.length + binPad;
header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length + binPad, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(out, Buffer.concat([header, jh, jsonBuf, bh, binOut, Buffer.alloc(binPad)]));

// report: triangles and bounds
let tris = 0;
const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (const m of json.meshes) for (const p of m.primitives) {
  const a = json.accessors[p.attributes.POSITION];
  tris += (p.indices !== undefined ? json.accessors[p.indices].count : a.count) / 3;
  for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a.min[k]); max[k] = Math.max(max[k], a.max[k]); }
}
const nodeScale = json.nodes?.find((n) => n.scale)?.scale;
console.log(`${out}: ${(total / 1e6).toFixed(2)} MB, ${tris} tris, size ${max.map((v, k) => (v - min[k]).toFixed(2)).join(' × ')}${nodeScale ? ` (node scale ${nodeScale})` : ''}, min y ${min[1].toFixed(2)}`);
