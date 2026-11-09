// Copy animation clips from one rigged GLB into another with the same skeleton (bones matched by name), e.g.
// Meshy's library animations (tools/meshy.mjs animate) into a figure's web copy that already has its walk.
//   node tools/glb-anim.mjs target.glb clips.glb name1,name2,… [--out out.glb] [--walk walk] [--step 2]
// Clips are named in order (a clip with an empty name is skipped); clips with those names already in the target are
// replaced; `--walk` renames the target's first clip. Tracks that never move off the target's rest pose (Meshy keys
// scale and bone offsets on every bone) are dropped; the root (Hips) keeps its height but not its drift across the
// ground, so a figure plays a clip on the spot. `--step n` keeps every n-th key (Meshy keys at 30 fps; 15 is plenty
// for a figure a few pixels tall and halves the file). No npm deps.
import fs from 'node:fs';

const [tgtPath, srcPath, namesArg, ...rest] = process.argv.slice(2);
if (!tgtPath || !srcPath || !namesArg) throw new Error('usage: glb-anim.mjs target.glb clips.glb name1,name2,… [--out out.glb] [--walk walk]');
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i < 0 ? d : rest[i + 1]; };
const outPath = opt('out', tgtPath);
const names = namesArg.split(',');
const STEP = Math.max(1, Number(opt('step', 1)));
/** Keep every STEP-th key (and the last) of a track with `comps` values per key. */
const thin = (data, comps) => {
  const n = data.length / comps;
  if (STEP <= 1 || n <= 2) return data;
  const keep = [];
  for (let i = 0; i < n; i += STEP) keep.push(i);
  if (keep[keep.length - 1] !== n - 1) keep.push(n - 1);
  const out = new Float32Array(keep.length * comps);
  keep.forEach((k, j) => out.set(data.subarray(k * comps, k * comps + comps), j * comps));
  return out;
};

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  return { json, bin };
}

const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
/** An accessor's values as floats (animation data: float32, tightly packed). */
function floats(g, idx) {
  const a = g.json.accessors[idx];
  if (a.componentType !== 5126) throw new Error(`accessor ${idx}: not float32`);
  const v = g.json.bufferViews[a.bufferView];
  const n = a.count * COMP[a.type];
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (v.byteStride && v.byteStride !== COMP[a.type] * 4) throw new Error(`accessor ${idx}: strided`);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = g.bin.readFloatLE(start + i * 4);
  return { a, data: out, comps: COMP[a.type] };
}

const tgt = readGlb(tgtPath);
const src = readGlb(srcPath);
const nodeByName = new Map(tgt.json.nodes.map((n, i) => [n.name, i]));
const hips = nodeByName.get('Hips');

// the target's buffer as a list of bufferView byte chunks; new ones are appended
const views = tgt.json.bufferViews.map((v) => tgt.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
const addAccessor = (data, type, withMinMax) => {
  const buf = Buffer.alloc(data.length * 4);
  for (let i = 0; i < data.length; i++) buf.writeFloatLE(data[i], i * 4);
  views.push(buf);
  tgt.json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: buf.length });
  const comps = COMP[type];
  const acc = { bufferView: tgt.json.bufferViews.length - 1, componentType: 5126, count: data.length / comps, type };
  if (withMinMax) {
    const min = Array(comps).fill(Infinity), max = Array(comps).fill(-Infinity);
    for (let i = 0; i < data.length; i++) { const k = i % comps; min[k] = Math.min(min[k], data[i]); max[k] = Math.max(max[k], data[i]); }
    acc.min = min;
    acc.max = max;
  }
  tgt.json.accessors.push(acc);
  return tgt.json.accessors.length - 1;
};

const rest0 = (node, path) => (path === 'rotation' ? node.rotation ?? [0, 0, 0, 1] : path === 'scale' ? node.scale ?? [1, 1, 1] : node.translation ?? [0, 0, 0]);
const near = (a, b, eps) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

if (opt('walk') && tgt.json.animations?.[0]) tgt.json.animations[0].name = opt('walk');
tgt.json.animations = (tgt.json.animations ?? []).filter((a) => !names.includes(a.name));
let kept = 0, dropped = 0;
src.json.animations.forEach((anim, ai) => {
  const name = names[ai];
  if (!name) return;
  const out = { name, channels: [], samplers: [] };
  const inputs = new Map();
  for (const ch of anim.channels) {
    const srcNode = src.json.nodes[ch.target.node];
    const ti = nodeByName.get(srcNode.name);
    if (ti === undefined) { dropped++; continue; }
    const sm = anim.samplers[ch.sampler];
    const o = floats(src, sm.output);
    const path = ch.target.path;
    const rest = rest0(tgt.json.nodes[ti], path);
    const first = Array.from(o.data.subarray(0, o.comps));
    let constant = true;
    for (let i = 0; i < o.data.length; i += o.comps) if (!near(Array.from(o.data.subarray(i, i + o.comps)), first, 1e-4)) { constant = false; break; }
    // never-moving tracks that sit on the rest pose: the mixer holds the rest pose anyway
    const eps = path === 'translation' ? Math.max(0.05, Math.hypot(...rest) * 0.002) : 2e-3;
    if (constant && near(first, rest, eps) && ti !== hips) { dropped++; continue; }
    const data = Float32Array.from(o.data);
    if (ti === hips && path === 'translation') {
      // the root stays on the spot: keep its height (crouches, sits), not its drift across the ground
      for (let i = 0; i < data.length; i += 3) { data[i] = first[0]; data[i + 2] = first[2]; }
    }
    if (!inputs.has(sm.input)) { const t = floats(src, sm.input); inputs.set(sm.input, addAccessor(thin(t.data, 1), 'SCALAR', true)); }
    const outIdx = addAccessor(thin(data, o.comps), o.a.type, false);
    out.samplers.push({ input: inputs.get(sm.input), output: outIdx, interpolation: sm.interpolation ?? 'LINEAR' });
    out.channels.push({ sampler: out.samplers.length - 1, target: { node: ti, path } });
    kept++;
  }
  tgt.json.animations.push(out);
  const t = floats(src, anim.samplers[0].input).data;
  console.log(`  ${name}: ${(t[t.length - 1] - t[0]).toFixed(2)} s, ${out.channels.length} tracks (from "${anim.name}")`);
});

// re-lay the buffer, 4-byte aligned (as tools/glb-tex.mjs)
let off = 0;
const chunks = [];
tgt.json.bufferViews.forEach((v, i) => {
  const pad = (4 - (off % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  v.byteOffset = off;
  v.byteLength = views[i].length;
  chunks.push(views[i]);
  off += views[i].length;
});
const binOut = Buffer.concat(chunks, off);
const binPad = (4 - (binOut.length % 4)) % 4;
tgt.json.buffers = [{ byteLength: binOut.length + binPad }];
let jsonBuf = Buffer.from(JSON.stringify(tgt.json));
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
const total = 12 + 8 + jsonBuf.length + 8 + binOut.length + binPad;
header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length + binPad, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(outPath, Buffer.concat([header, jh, jsonBuf, bh, binOut, Buffer.alloc(binPad)]));
console.log(`${outPath}: ${(total / 1e6).toFixed(2)} MB, ${tgt.json.animations.length} clips (${kept} tracks kept, ${dropped} still ones dropped)`);
