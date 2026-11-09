/**
 * Farmland round a campus, so it stands in a real, worked landscape rather than an empty one: fields in strips off
 * the highway (wheat, green crops, ploughed earth, stubble, flowering rapeseed, pasture), centre-pivot circles in dry
 * country, each drawn by a shader as rows that follow the field (crisp up close, a soft patchwork from afar), with
 * tree lines and hedgerows along some of their edges. Pure planning here; ground.ts keeps plants off the fields and
 * campusScene.ts draws them.
 */
import * as THREE from 'three';
import { rng, withClouds } from '../kit';
import type { Backdrop } from './ground';
import type { Rect } from './layout';

export type Crop = 'wheat' | 'green' | 'plough' | 'stubble' | 'rape' | 'pasture' | 'pivot' | 'orchard';

export interface Field {
  cx: number; cz: number;
  /** Size along its rows (w) and across them (d), metres. */
  w: number; d: number;
  /** Turn round y (radians). */
  rot: number;
  crop: Crop;
  /** Edges with a hedge or tree line: 0 = +z side, 1 = +x, 2 = -z, 3 = -x. */
  hedges: number[];
}

/** Which crops a backdrop's farms grow (weighted by repeats); none = no farmland. */
const CROPS: Partial<Record<Backdrop, Crop[]>> = {
  plains: ['wheat', 'wheat', 'stubble', 'plough', 'green', 'pivot', 'pivot', 'pasture'],
  savanna: ['stubble', 'pasture', 'pasture', 'plough', 'wheat', 'pivot'],
  desert: ['pivot', 'pivot', 'pivot', 'plough'],
  temperate: ['green', 'green', 'wheat', 'rape', 'plough', 'pasture', 'pasture', 'orchard'],
  coast: ['green', 'pasture', 'pasture', 'wheat', 'plough', 'orchard', 'rape'],
  tropical: ['green', 'green', 'orchard', 'pasture', 'plough'],
  boreal: ['pasture', 'pasture', 'green'],
  mountain: ['pasture', 'pasture', 'green'],
  volcanic: ['pasture', 'green', 'plough'],
};

/** Inside a field (with a margin), in world coordinates. */
export function inField(f: Field, x: number, z: number, margin = 0) {
  const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
  const dx = x - f.cx, dz = z - f.cz;
  const u = dx * c - dz * s, v = dx * s + dz * c;
  if (f.crop === 'pivot') return u * u + v * v < (f.w / 2 + margin) ** 2;
  return Math.abs(u) < f.w / 2 + margin && Math.abs(v) < f.d / 2 + margin;
}

/**
 * Lay out fields in strips either side of the highway and behind the campus, clear of the campus (`keep`), the
 * substation's line in from the west, and water (`wet`).
 */
export function planFields(backdrop: Backdrop, seed: number, keep: Rect, highwayZ: number, wet: (x: number, z: number) => boolean, steep: (x: number, z: number) => boolean): Field[] {
  const crops = CROPS[backdrop];
  if (!crops) return [];
  const r = rng(seed + 313);
  const out: Field[] = [];
  const pick = () => crops[Math.floor(r() * crops.length)];
  const clash = (f: Field) => {
    const R = Math.hypot(f.w, f.d) / 2;
    if (f.cx + R > keep.x0 - 14 && f.cx - R < keep.x1 + 14 && f.cz + R > keep.z0 - 14 && f.cz - R < keep.z1 + 10) {
      // a closer look at the corners
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const lx = (u * f.w) / 2, lz = (v * f.d) / 2, c = Math.cos(f.rot), s = Math.sin(f.rot);
        const x = f.cx + lx * c - lz * s, z = f.cz + lx * s + lz * c;
        if (x > keep.x0 - 14 && x < keep.x1 + 14 && z > keep.z0 - 14 && z < keep.z1 + 10) return true;
      }
    }
    for (const o of out) if (Math.hypot(o.cx - f.cx, o.cz - f.cz) < (Math.max(o.w, o.d) + Math.max(f.w, f.d)) / 2 + 4) return true;
    // clear of the highway corridor and its verges
    for (let k = -1; k <= 1; k += 0.25) {
      const lx = (k * f.w) / 2;
      for (const lz of [-f.d / 2, 0, f.d / 2]) {
        const c = Math.cos(f.rot), s = Math.sin(f.rot);
        const x = f.cx + lx * c - lz * s, z = f.cz + lx * s + lz * c;
        if (Math.abs(z - highwayZ) < 14 || wet(x, z) || steep(x, z)) return true;
      }
    }
    return false;
  };
  // strips off the highway, both sides, out to ~550 m; a band behind the campus
  const rows: { z0: number; dir: 1 | -1 }[] = [{ z0: highwayZ + 15, dir: 1 }, { z0: highwayZ - 15, dir: -1 }, { z0: keep.z0 - 16, dir: -1 }];
  for (const row of rows) {
    let x = -560 + r() * 30;
    while (x < 560) {
      const crop = pick();
      const w = crop === 'pivot' ? 90 + r() * 50 : 46 + r() * 70;
      const d = crop === 'pivot' ? w : 70 + r() * 110;
      const f: Field = { cx: x + w / 2, cz: row.z0 + (row.dir * d) / 2, w, d, rot: (r() - 0.5) * 0.06, crop, hedges: [] };
      if (crop !== 'pivot') {
        // rows run across the strip or along it
        if (r() < 0.5) { f.rot += Math.PI / 2; [f.w, f.d] = [f.d, f.w]; }
        for (let e = 0; e < 4; e++) if (r() < 0.32) f.hedges.push(e);
      }
      if (!clash(f)) out.push(f);
      x += w + 4 + r() * 10;
      // a second tier further out now and then
      if (r() < 0.75) {
        const crop2 = pick();
        const w2 = crop2 === 'pivot' ? 100 + r() * 40 : 60 + r() * 60, d2 = crop2 === 'pivot' ? w2 : 70 + r() * 90;
        const f2: Field = { cx: f.cx + (r() - 0.5) * 30, cz: row.z0 + row.dir * (d + 8 + d2 / 2), w: w2, d: d2, rot: (r() - 0.5) * 0.06, crop: crop2, hedges: [] };
        if (crop2 !== 'pivot') for (let e = 0; e < 4; e++) if (r() < 0.32) f2.hedges.push(e);
        if (!clash(f2)) out.push(f2);
      }
    }
  }
  return out;
}

// ── drawing ───────────────────────────────────────────────────────────────────────────────────
const CROP_PAINT: Record<Crop, { a: string; b: string; rows: number; furrow: number }> = {
  // a = the crop, b = the ground between the rows; rows = row spacing (m); furrow = how strongly rows show
  wheat: { a: '#d9b45a', b: '#b98e48', rows: 0.9, furrow: 0.35 },
  green: { a: '#5f9a3e', b: '#7d6440', rows: 1.1, furrow: 0.55 },
  plough: { a: '#8a6446', b: '#6e4c34', rows: 0.8, furrow: 0.6 },
  stubble: { a: '#cdb27a', b: '#a98e5e', rows: 0.7, furrow: 0.25 },
  rape: { a: '#e8d23a', b: '#7d9a3e', rows: 1.0, furrow: 0.3 },
  pasture: { a: '#7ea24a', b: '#6a8c40', rows: 3.0, furrow: 0.08 },
  pivot: { a: '#5a9a3a', b: '#8a7048', rows: 1.2, furrow: 0.4 },
  orchard: { a: '#4f8034', b: '#8a8a52', rows: 5.0, furrow: 0.7 },
};

const fieldMats = new Map<Crop, THREE.MeshStandardMaterial>();
function fieldMaterial(crop: Crop) {
  const m0 = fieldMats.get(crop);
  if (m0) return m0;
  const p = CROP_PAINT[crop];
  const ca = new THREE.Color(p.a), cb = new THREE.Color(p.b);
  const v3 = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  const m = withClouds(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, rr) => {
    prev?.call(m, sh, rr);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 fieldUV; varying vec2 vField; varying vec3 vFieldW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvField = fieldUV; vFieldW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vField; varying vec3 vFieldW;
        float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          ${crop === 'pivot' ? 'float coord = length(vField);' : 'float coord = vField.y;'}
          float ph = coord / ${p.rows.toFixed(2)};
          float fw = max(fwidth(ph), 1e-4);
          // rows: a soft triangle wave, faded to its average once a row is under a pixel or two
          float tri = abs(fract(ph) - 0.5) * 2.0;
          float rowsK = clamp(1.0 - (fw - 0.25) * 2.0, 0.0, 1.0);
          float row = mix(0.5, smoothstep(0.25, 0.75, tri), rowsK);
          vec3 a = ${v3(ca)}, b = ${v3(cb)};
          float n = fn(vFieldW.xz * 0.06) * 0.6 + fn(vFieldW.xz * 0.35) * 0.4;
          vec3 col = mix(b, a, mix(1.0, row, ${p.furrow.toFixed(2)}));
          col *= 0.9 + n * 0.2;
          ${crop === 'wheat' || crop === 'stubble' ? 'col = mix(col, col * vec3(1.08, 1.02, 0.85), smoothstep(0.55, 0.8, fn(vFieldW.xz * 0.02 + 3.0)));' : ''}
          ${crop === 'pivot' ? '// the pivot arm\n          float ang = atan(vField.y, vField.x); col *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.02 + fwidth(ang), abs(ang - 0.7))) * step(length(vField), 1e9);' : ''}
          diffuseColor.rgb = col;
        }`);
  };
  m.customProgramCacheKey = () => 'field-' + crop;
  m.userData.shared = true;
  fieldMats.set(crop, m);
  return m;
}

/** A field's surface laid on the ground (a grid every ~4 m, so it follows the land). */
export function fieldMesh(f: Field, h: (x: number, z: number) => number): THREE.Mesh {
  const nu = Math.max(2, Math.ceil(f.w / 4)), nv = Math.max(2, Math.ceil(f.d / 4));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  const round = f.crop === 'pivot';
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      let lx = (i / nu - 0.5) * f.w, lz = (j / nv - 0.5) * f.d;
      if (round) {
        // squash the square grid onto the disc
        const ux = (i / nu) * 2 - 1, vz = (j / nv) * 2 - 1;
        lx = ux * Math.sqrt(1 - (vz * vz) / 2) * (f.w / 2);
        lz = vz * Math.sqrt(1 - (ux * ux) / 2) * (f.w / 2);
      }
      const x = f.cx + lx * c - lz * s, z = f.cz + lx * s + lz * c;
      pos.push(x, h(x, z) + 0.04, z);
      uv.push(lx, lz);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, d = a + nu + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('fieldUV', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  if (nrm.getY(0) < 0) { const ix = g.index!; for (let k = 0; k < ix.count; k += 3) { const t = ix.getX(k + 1); ix.setX(k + 1, ix.getX(k + 2)); ix.setX(k + 2, t); } g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, fieldMaterial(f.crop));
  m.receiveShadow = true;
  m.name = 'field:' + f.crop;
  return m;
}

/** Points along a field's hedged edges, every `step` m (for hedges and tree lines). */
export function hedgePoints(f: Field, step: number, r: () => number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  for (const e of f.hedges) {
    const along = e % 2 === 0 ? f.w : f.d;
    for (let t = -along / 2; t <= along / 2; t += step * (0.7 + r() * 0.6)) {
      let lx = 0, lz = 0;
      if (e === 0) { lx = t; lz = f.d / 2 + 1.6; } else if (e === 2) { lx = t; lz = -f.d / 2 - 1.6; } else if (e === 1) { lx = f.w / 2 + 1.6; lz = t; } else { lx = -f.w / 2 - 1.6; lz = t; }
      out.push({ x: f.cx + lx * c - lz * s + (r() - 0.5) * 0.8, z: f.cz + lx * s + lz * c + (r() - 0.5) * 0.8 });
    }
  }
  return out;
}
