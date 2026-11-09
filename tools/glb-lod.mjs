// A lighter copy of a GLB for scenery drawn by the hundred (trees, bushes): each primitive's triangles simplified
// with meshoptimizer (keeping UV seams, so the texture still fits), everything else copied as it is.
//   node tools/glb-lod.mjs in.glb out.glb --tris 1200 [--error 0.04]
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';

const [inp, out, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i < 0 ? d : Number(rest[i + 1]); };
if (!inp || !out) throw new Error('usage: glb-lod.mjs in.glb out.glb --tris 1200');
await MeshoptSimplifier.ready;

const buf = fs.readFileSync(inp);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const binLen = buf.readUInt32LE(20 + jsonLen);
let bin = Buffer.from(buf.subarray(binStart, binStart + binLen));

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function read(accIndex) {
  const a = json.accessors[accIndex];
  const bv = json.bufferViews[a.bufferView];
  const T = COMP[a.componentType];
  const n = SIZE[a.type];
  const stride = bv.byteStride ? bv.byteStride / T.BYTES_PER_ELEMENT : n;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const src = new T(bin.buffer, bin.byteOffset + base, (a.count - 1) * stride + n);
  const outArr = new Float32Array(a.count * n);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) outArr[i * n + k] = src[i * stride + k];
  return { arr: outArr, count: a.count, n };
}

let total = 0, before = 0;
const totalTris = json.meshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + json.accessors[p.indices].count / 3, 0), 0);
const want = opt('tris', 1200);
for (const mesh of json.meshes)
  for (const p of mesh.primitives) {
    const ia = json.accessors[p.indices];
    const idxRaw = read(p.indices).arr;
    const indices = Uint32Array.from(idxRaw);
    const pos = read(p.attributes.POSITION).arr;
    const uv = p.attributes.TEXCOORD_0 !== undefined ? read(p.attributes.TEXCOORD_0).arr : null;
    const share = indices.length / 3 / totalTris;
    const target = Math.max(3, Math.floor(want * share) * 3);
    const [res] = uv
      ? MeshoptSimplifier.simplifyWithAttributes(indices, pos, 3, uv, 2, [0.6, 0.6], null, target, opt('error', 0.04), rest.includes('--permissive') ? ['Permissive'] : [])
      : MeshoptSimplifier.simplify(indices, pos, 3, target, opt('error', 0.04), []);
    before += indices.length / 3;
    total += res.length / 3;
    // append the new indices as a bufferView of their own (the old bytes stay, unused)
    const small = ia.componentType === 5123 && pos.length / 3 < 65536;
    const data = small ? Uint16Array.from(res) : res;
    const pad = (4 - (bin.length % 4)) % 4;
    const offset = bin.length + pad;
    bin = Buffer.concat([bin, Buffer.alloc(pad), Buffer.from(data.buffer, data.byteOffset, data.byteLength)]);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, target: 34963 });
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: small ? 5123 : 5125, count: res.length, type: 'SCALAR' });
    p.indices = json.accessors.length - 1;
  }
json.buffers[0].byteLength = bin.length;
const padBin = (4 - (bin.length % 4)) % 4;
bin = Buffer.concat([bin, Buffer.alloc(padBin)]);
let js = Buffer.from(JSON.stringify(json), 'utf8');
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(out, Buffer.concat([header, jh, js, bh, bin]));
console.log(`${out}: ${before} → ${total} tris, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
