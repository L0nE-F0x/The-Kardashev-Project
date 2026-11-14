/**
 * The hydro plant: a concrete gravity dam across a gorge the plot carves for itself, the reservoir
 * behind it, a gated spillway with white water down its steps, the powerhouse at the toe with
 * penstocks down the dam face, the tailrace out to the outlet works under the road embankment at the front (gated
 * culverts: the water leaves the plot underground), and a line
 * pylon on the abutment carrying the power away. Tier 2 (300 MW): a wider dam and gorge, a second
 * powerhouse and pylon, four penstocks.
 */
import * as THREE from 'three';
import { Kit, lightPool, noise, rng, withClouds } from '../../kit';
import { pylon, walkBlockers, walkFloor, type Piece } from '../../pieces';
import { parkedCars } from '../life';
import type { PieceOpts } from '../registry';
import {
  Anim, At, beacon, lakeMat, lampHeadMat, P, pipeRun, plants, poleLamp, riverMat, sagWires, shed, sstep, transformer, V,
  warmPool, windowRow, winMat, paving, extrudeX,
} from './parts';
import type { Placement } from '../trees';

// heights: gorge floor, tailwater, reservoir, dam crest; the dam's upstream face and crest. The
// reservoir sits up on a plateau the plot raises, and nothing is carved below -1.15: backdrops with
// a sea or lake level lay a flat world water plane at -1.2 or lower, and it must stay under the gorge.
const GF = -0.8, TW = -0.5, DC = 4.4, WL = DC - 1.45;
const ZU = -4.6, ZC = ZU + 2.4, SLOPE = 0.72;
const BASE = GF - 0.7;
const SC = WL - 0.4; // spillway crest
const PLAT = 3.8; // the plateau round the reservoir
/** The downstream face: z at height y. */
const faceZ = (y: number) => ZC + (DC - 0.8 - y) * SLOPE;
const TOE = faceZ(GF);
/** Outward normal of the downstream face in (z, y). */
const NZ = 1 / Math.hypot(1, SLOPE), NY = SLOPE / Math.hypot(1, SLOPE);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── water textures (shared; their offsets follow absolute time, so several dams can share them) ──
let foamTex: THREE.CanvasTexture | null = null;
let rippleTex: THREE.CanvasTexture | null = null;
function foamTexture() {
  if (foamTex) return foamTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(206,228,232,0.78)';
  g.fillRect(0, 0, 64, 256);
  const r = rng(91);
  g.filter = 'blur(1.2px)';
  g.lineCap = 'round';
  const streak = (fill: string, n: number, wMax: number, hMax: number) => {
    g.strokeStyle = fill;
    for (let i = 0; i < n; i++) {
      const x = r() * 64, y = r() * 256, w = 1 + r() * wMax, h = 6 + r() * hMax, dx0 = (r() - 0.5) * 5;
      g.lineWidth = w;
      for (const dx of [0, -64, 64]) for (const dy of [0, -256, 256]) {
        g.beginPath();
        g.moveTo(x + dx, y + dy);
        g.lineTo(x + dx + dx0, y + dy + h);
        g.stroke();
      }
    }
  };
  streak('rgba(140,186,196,0.55)', 40, 4, 30);
  streak('rgba(255,255,255,0.75)', 120, 3, 40);
  streak('rgba(255,255,255,1)', 60, 2, 18);
  foamTex = new THREE.CanvasTexture(c);
  foamTex.wrapS = foamTex.wrapT = THREE.RepeatWrapping;
  foamTex.colorSpace = THREE.SRGBColorSpace;
  return foamTex;
}
function rippleTexture() {
  if (rippleTex) return rippleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(17);
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = r() * 128, y = r() * 128, w = 6 + r() * 16;
    g.strokeStyle = `rgba(214,236,238,${0.35 + r() * 0.45})`;
    g.lineWidth = 1 + r() * 1.5;
    for (const dx of [0, -128, 128]) for (const dy of [0, -128, 128]) {
      g.beginPath();
      g.moveTo(x + dx - w / 2, y + dy);
      g.quadraticCurveTo(x + dx, y + dy - 2, x + dx + w / 2, y + dy);
      g.stroke();
    }
  }
  rippleTex = new THREE.CanvasTexture(c);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.colorSpace = THREE.SRGBColorSpace;
  return rippleTex;
}
/** A boil of white water seen from above: foam thick in the middle, thinning out to nothing at the rim. */
function boilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(53);
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(244,250,250,0.95)');
  grad.addColorStop(0.45, 'rgba(214,236,238,0.7)');
  grad.addColorStop(0.8, 'rgba(190,222,228,0.28)');
  grad.addColorStop(1, 'rgba(190,222,228,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // broken rings of foam carried outwards
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const rad = 8 + r() * 46, a0 = r() * 6.3, len = 0.3 + r() * 0.9;
    g.strokeStyle = `rgba(255,255,255,${(0.75 * (1 - rad / 60)).toFixed(2)})`;
    g.lineWidth = 1 + r() * 2.2;
    g.beginPath();
    g.arc(64, 64, rad, a0, a0 + len);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.center.set(0.5, 0.5);
  return t;
}
/** Opaque upstream, fading out over the downstream third (the churn dies away into the tailrace). */
function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.55, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}
/** The draw into a culvert: nothing upstream, thickening to the mouth, soft down both sides. */
function inflowTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d')!;
  const img = g.createImageData(32, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 32; x++) {
      const along = 1 - y / 63, across = Math.sin((Math.PI * (x + 0.5)) / 32);
      // narrower upstream (the streaks gather towards the mouth)
      const v = 255 * along * along * Math.min(1, Math.max(0, (across - 0.55 * (1 - along)) * 2.2));
      img.data.set([v, v, v, 255], (y * 32 + x) * 4);
    }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
let foamMats: { spill: THREE.MeshStandardMaterial; churn: THREE.MeshStandardMaterial; basin: THREE.MeshStandardMaterial; inflow: THREE.MeshStandardMaterial; boil: THREE.MeshStandardMaterial; ripple: THREE.MeshStandardMaterial } | null = null;
function waterFx() {
  if (foamMats) return foamMats;
  const spillT = foamTexture();
  const churnT = foamTexture().clone();
  churnT.needsUpdate = true;
  churnT.repeat.set(1.6, 0.5);
  foamMats = {
    spill: withClouds(new THREE.MeshStandardMaterial({ map: spillT, transparent: true, roughness: 0.55, depthWrite: false })),
    churn: withClouds(new THREE.MeshStandardMaterial({ map: churnT, transparent: true, opacity: 0.9, roughness: 0.6, depthWrite: false })),
    basin: withClouds(new THREE.MeshStandardMaterial({ map: churnT, alphaMap: fadeTexture(), transparent: true, opacity: 0.9, roughness: 0.6, depthWrite: false })),
    inflow: withClouds(new THREE.MeshStandardMaterial({ map: churnT, alphaMap: inflowTexture(), transparent: true, opacity: 0.62, roughness: 0.6, depthWrite: false })),
    boil: withClouds(new THREE.MeshStandardMaterial({ map: boilTexture(), transparent: true, roughness: 0.6, depthWrite: false })),
    ripple: withClouds(new THREE.MeshStandardMaterial({ map: rippleTexture(), transparent: true, opacity: 0.8, roughness: 0.3, depthWrite: false })),
  };
  return foamMats;
}
function animateWater(t: number) {
  const m = waterFx();
  m.spill.map!.offset.y = -(t * 0.9) % 1;
  m.churn.map!.offset.set((Math.sin(t * 0.7) * 0.08) % 1, -(t * 0.35) % 1);
  m.ripple.map!.offset.y = -(t * 0.05) % 1;
  m.boil.map!.rotation = t * 0.5;
}

/** A strip following a (z, y) path across x0..x1 (water sheets); uv v = distance along it. */
function strip(path: [number, number][], x0: number, x1: number, vScale: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0;
  path.forEach(([z, y], i) => {
    if (i) dist += Math.hypot(z - path[i - 1][0], y - path[i - 1][1]);
    pos.push(x0, y, z, x1, y, z);
    uv.push(0, dist / vScale, (x1 - x0) / vScale, dist / vScale);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function waterPlane(x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, uvScale = 0) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
  if (uvScale) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / uvScale, uv.getY(i) * (z1 - z0) / uvScale);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  return m;
}

/** The plot's own terrain: ridges along both sides, the gorge below the dam, the lake bed behind it. */
function terrain(hw: number, seed: number) {
  const hwAt = (z: number) => hw - (hw - 3.2) * sstep(7.2, 10.2, z);
  const h = (x: number, z: number): number => {
    const ax = Math.abs(x);
    const inner = lerp(9.6, hwAt(z) + 0.8, sstep(ZU - 2.5, ZU + 0.5, z));
    const edgeX = 1 - sstep(11.4, 13.7, ax);
    const n = 0.85 + 0.3 * noise(x * 0.22 + 3, z * 0.22, seed);
    // the plateau behind the dam (falling away in front of it), ridges along both sides
    let y = PLAT * edgeX * sstep(-13.5, -10.9, z) * (1 - sstep(ZC + 0.8, ZC + 3.6, z)) * (0.94 + 0.12 * noise(x * 0.15, z * 0.15, seed + 2));
    y += 2.6 * n * sstep(inner, inner + 2.6, ax) * edgeX * sstep(-13.5, -10.2, z) * (1 - sstep(2.0, 7.0, z));
    if (z > ZU - 1) {
      const hz = hwAt(z);
      const m = (1 - sstep(hz, hz + 1.9, ax)) * (1 - sstep(10.6, 11.6, z)) * sstep(ZU - 1, ZU + 0.2, z);
      y += (GF - 0.35 - y) * m;
    }
    if (z < ZU + 0.5) {
      const n2 = (noise(x * 0.3, z * 0.3, seed + 4) - 0.5) * 0.16;
      const e = Math.hypot(x / 10.4, (z + 7.6) / 4.1) + n2;
      const m = (1 - sstep(0.7, 1.0, e)) * (1 - sstep(ZU, ZU + 0.5, z));
      y = Math.min(y, y + (WL - 2.6 - y) * m);
    }
    return y;
  };
  return { h, hwAt };
}

export function hydro(o: PieceOpts): Piece {
  const T2 = o.tier >= 2;
  const r = rng(o.seed);
  const hw = T2 ? 8.6 : 7.2;
  const { h: H } = terrain(hw, o.seed % 97);
  const g = new THREE.Group();
  const anim = new Anim();
  const fx = waterFx();

  // where things go along x: the spillway, the powerhouse(s)
  const spill = T2 ? { x0: -2.7, x1: 2.7, bays: 3 } : { x0: -5.4, x1: -1.2, bays: 2 };
  const houses = T2 ? [{ x: 5.6, w: 5.6 }, { x: -5.6, w: 5.6 }] : [{ x: 3.8, w: 6.2 }];
  const pylons = T2 ? [{ x: 11.0, z: 2.2 }, { x: -11.0, z: 2.2 }] : [{ x: 11.0, z: 2.2 }];

  // ── the dam (rises with construction) ────────────────────────────────────────────────────
  const damK = new Kit(rng(o.seed + 1));
  const damProf: [number, number][] = [[ZU, BASE], [ZU, DC], [ZC, DC], [ZC, DC - 0.8], [faceZ(BASE), BASE]];
  const blocks = (a: number, b: number) => {
    const n = Math.max(1, Math.round((b - a) / 2.2));
    for (let i = 0; i < n; i++) extrudeX(damK, a + ((b - a) * i) / n + 0.02, a + ((b - a) * (i + 1)) / n - 0.02, damProf, i % 2 ? P.concrete : '#cbc2b4');
  };
  blocks(-12.8, spill.x0);
  blocks(spill.x1, 12.8);
  // the spillway: a broad crest, then steps down the face
  const sProf: [number, number][] = [[ZU, BASE], [ZU, SC - 0.35], [ZU + 0.45, SC], [faceZ(SC), SC]];
  for (let y = SC; y > GF + 0.1;) {
    const z = faceZ(y);
    const y2 = Math.max(GF, y - 0.55);
    sProf.push([z, y2], [faceZ(y2), y2]);
    y = y2;
  }
  sProf.push([faceZ(GF) + 0.2, GF - 0.3], [faceZ(GF) + 0.2, BASE]);
  extrudeX(damK, spill.x0, spill.x1, sProf, '#c9c0b2', 0.1);
  // ledges (inspection walkways) across the downstream face
  for (const y of [DC - 2.2, DC - 3.9]) {
    for (const [a, b] of [[-12.6, spill.x0], [spill.x1, 12.6]]) damK.box(b - a, 0.14, 0.4, '#b5ac9e', (a + b) / 2, y, faceZ(y) + 0.12, { r: 0, jitter: 0.02, shade: 0 });
  }
  // the stilling basin at the spillway's foot
  const sMid = (spill.x0 + spill.x1) / 2, sW = spill.x1 - spill.x0;
  const bz0 = TOE - 0.1, bz1 = TOE + 3.8;
  for (const sx of [spill.x0 - 0.2, spill.x1 + 0.2]) damK.box(0.4, TW + 0.55 - (GF - 0.4), bz1 - bz0, P.concrete2, sx, GF - 0.4, (bz0 + bz1) / 2, { r: 0.06 });
  damK.box(sW, TW - 0.15 - (GF - 0.4), 0.5, P.concrete2, sMid, GF - 0.4, bz1 - 0.25, { r: 0.05 });
  const damMesh = damK.build();
  const damG = new THREE.Group();
  damG.position.y = BASE;
  damMesh.position.y = -BASE;
  damG.add(damMesh);
  g.add(damG);

  // ── on the crest: road, parapets, piers, gates, bridge, intakes, the gantry crane, lamps ─────
  const crest = new THREE.Group();
  g.add(crest);
  const ck = new Kit(rng(o.seed + 2));
  const lamps = new Kit(rng(o.seed + 3));
  const lit = new Kit(rng(o.seed + 4));
  ck.box(25.4, 0.06, ZC - ZU - 0.9, P.asphalt, 0, DC, (ZU + ZC) / 2, { r: 0, shade: 0, jitter: 0.02 });
  for (const zz of [ZU + 0.18, ZC - 0.18]) ck.box(25.4, 0.55, 0.3, '#d9d1c4', 0, DC, zz, { r: 0.06, shade: 0.1 });
  // spillway piers, the bridge over them, radial gates between
  const bw = sW / spill.bays;
  for (let i = 0; i <= spill.bays; i++) {
    const px = spill.x0 + i * bw;
    ck.box(0.5, DC + 0.9 - (SC - 0.2), faceZ(SC) - ZU + 0.6, P.concrete, px, SC - 0.2, (ZU - 0.6 + faceZ(SC)) / 2, { r: 0.08 });
  }
  ck.box(sW + 0.5, 0.45, ZC - ZU - 0.3, P.concrete2, sMid, DC - 0.45, (ZU + ZC) / 2, { r: 0.05 });
  const gateY = SC + 1.0, gateZ = ZU + 2.2, R = 1.7;
  for (let i = 0; i < spill.bays; i++) {
    const cx = spill.x0 + (i + 0.5) * bw;
    for (let s = 0; s < 3; s++) {
      const th = Math.PI - 0.3 + (s + 0.5) * 0.24;
      const pz = gateZ + Math.cos(th) * R, py = gateY + Math.sin(th) * R;
      const plate = new THREE.BoxGeometry(bw - 0.55, 0.42, 0.1).rotateX(-th).translate(cx, py, pz);
      ck.geo(plate, '#4d6a86', 0.03);
    }
    for (const sx of [-1, 1]) ck.beam(V(cx + sx * (bw / 2 - 0.4), gateY + 0.2, ZU + 0.6), V(cx + sx * (bw / 2 - 0.4), gateY, gateZ), 0.12, '#3f5670');
  }
  // the intakes on the upstream face (one per penstock) with trash racks and hoist houses
  const penX: number[] = [];
  for (const hs of houses) penX.push(hs.x - 1.45, hs.x + 1.45);
  for (const px of penX) {
    ck.box(1.7, DC + 0.9 - (WL - 2.6), 1.5, P.concrete, px, WL - 2.6, ZU - 0.6, { r: 0.08, shade: 0.2 });
    ck.box(1.3, 3.0, 0.08, '#3a3442', px, WL - 2.5, ZU - 1.38, { r: 0, jitter: 0 });
    for (let y = WL + 0.05; y < DC + 0.6; y += 0.32) ck.box(1.3, 0.05, 0.06, '#5b5562', px, y, ZU - 1.38, { r: 0, jitter: 0 });
    ck.box(1.2, 0.8, 1.1, '#e7dfd2', px, DC + 0.9, ZU - 0.6, { r: 0.1 });
    ck.box(1.3, 0.12, 1.2, P.roof, px, DC + 1.7, ZU - 0.6, { r: 0.03, shade: 0 });
  }
  // the gantry crane over the first powerhouse's intakes
  {
    const gx = houses[0].x;
    const legH = 3.2;
    for (const sx of [-1.9, 1.9]) for (const zz of [ZU - 0.9, ZC - 0.35]) ck.box(0.3, legH, 0.3, P.safety, gx + sx, DC, zz, { r: 0.03, jitter: 0.02 });
    for (const sx of [-1.9, 1.9]) ck.box(0.42, 0.45, ZC - ZU + 0.95, P.safety, gx + sx, DC + legH, (ZU - 0.9 + ZC - 0.35) / 2, { r: 0.04 });
    for (const zz of [ZU - 0.9, ZC - 0.35]) ck.box(4.2, 0.5, 0.42, P.safety, gx, DC + legH, zz, { r: 0.04 });
    ck.box(1.4, 0.7, 1.0, '#e9e1d2', gx + 0.4, DC + legH + 0.45, ZU - 0.3, { r: 0.08 });
    ck.box(0.9, 0.8, 0.9, '#cfc6b8', gx - 1.2, DC + legH - 0.8, ZC - 0.35, { r: 0.08 }); // cab
    ck.beam(V(gx + 0.4, DC + legH, ZU - 0.3), V(gx + 0.4, DC + 1.8, ZU - 0.3), 0.04, 'ink4');
    for (const sx of [-1.9, 1.9]) for (const zz of [ZU - 0.9, ZC - 0.35]) ck.box(0.45, 0.25, 0.6, '#5b5562', gx + sx, DC, zz, { r: 0.03 });
  }
  // a gatehouse where the crest road meets the right abutment
  const ghx = hw + 0.9;
  ck.box(2.4, 2.6, 2.0, P.cream, ghx, DC, (ZU + ZC) / 2, { r: 0.12, shade: 0.15 });
  ck.box(2.7, 0.3, 2.3, P.roof, ghx, DC + 2.6, (ZU + ZC) / 2, { r: 0.06, shade: 0 });
  lit.box(1.0, 0.7, 0.06, P.glass, ghx - 0.4, DC + 1.3, ZC - 0.37, { r: 0, jitter: 0 });
  ck.box(0.7, 1.6, 0.06, '#5b5562', ghx + 0.6, DC, ZC - 0.37, { r: 0, jitter: 0 });
  for (let x = -hw + 0.6; x < hw - 0.5; x += 4.6) {
    if (Math.abs(x - houses[0].x) < 2.6) continue;
    poleLamp(ck, lamps, crest, x, ZC - 0.25, 3.0, -1, DC);
  }
  // a log boom (floating buoys) across the reservoir in front of the spillway
  {
    const ax0 = spill.x0 - 1.4, ax1 = spill.x1 + 1.4;
    let prev: THREE.Vector3 | null = null;
    const n = Math.round((ax1 - ax0) / 0.55) + 4;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(ax0, ax1, t), z = ZU - 0.4 - Math.sin(Math.PI * t) * 3.0;
      ck.cyl(0.17, 0.17, 0.3, i % 2 ? 'yel0' : 'org1', x, WL - 0.14, z, 8, { shade: 0 });
      const p = V(x, WL + 0.08, z);
      if (prev) ck.beam(prev, p, 0.04, '#5b5562');
      prev = p;
    }
  }
  crest.add(ck.build());
  crest.add(lamps.build(lampHeadMat), lit.build(winMat));

  // ── penstocks down the face ──────────────────────────────────────────────────────────────
  const penK = new Kit(rng(o.seed + 5));
  const zb = TOE + 1.1;
  for (const px of penX) {
    const face = (y: number) => V(px, y, faceZ(y));
    const off = (v: THREE.Vector3, d: number) => V(v.x, v.y + NY * d, v.z + NZ * d);
    const top = off(face(DC - 1.3), 0.62), top0 = off(face(DC - 1.3), -0.3), bend = off(face(GF + 2.4), 0.62);
    const end = V(px, bend.y, zb + 0.3);
    pipeRun(penK, [top0, top, bend, end], 0.5, '#5d7c80', { seg: 12, band: 1.3, bandPaint: '#4c686c' });
    penK.box(1.4, 1.3, 1.3, P.concrete2, px, top.y - 0.75, top.z - 0.1, { r: 0.08 });
    penK.box(1.5, bend.y + 0.75 - (GF - 0.4), 1.4, P.concrete2, px, GF - 0.4, bend.z, { r: 0.08 });
  }
  const penMesh = penK.build();
  g.add(penMesh);

  // ── powerhouse(s) at the toe, transformers on the tailrace deck ──────────────────────────
  const phG = new THREE.Group();
  phG.position.y = GF - 0.4;
  g.add(phG);
  const phK = new Kit(rng(o.seed + 6));
  const phLit = new Kit(rng(o.seed + 7));
  const phLamps = new Kit(rng(o.seed + 8));
  const bushings: THREE.Vector3[][] = [];
  const shortWires: THREE.Vector3[][] = [];
  const deckY = GF + 2.0;
  const zh = zb + 2.8, zf = zb + 4.7;
  const boils: THREE.Mesh[] = [];
  for (const hs of houses) {
    // substructure with the draft-tube outlets on the tailrace side
    phK.box(hs.w, deckY - (GF - 0.4), zf - zb, P.concreteDark, hs.x, GF - 0.4, (zb + zf) / 2, { r: 0.1, shade: 0.3 });
    phK.box(hs.w + 0.1, 0.2, zf - zb + 0.1, '#b5ac9e', hs.x, deckY - 0.2, (zb + zf) / 2, { r: 0.03, shade: 0 });
    for (const sx of [-1.45, 1.45]) {
      phK.box(1.5, 0.9, 0.08, '#2a2630', hs.x + sx, TW - 0.3, zf + 0.02, { r: 0, jitter: 0 });
      const b = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20).rotateX(-Math.PI / 2).scale(1, 1, 1.25), fx.boil);
      b.position.set(hs.x + sx, TW + 0.04, zf + 0.95);
      b.renderOrder = 1;
      boils.push(b);
      g.add(b);
    }
    // the generator hall
    shed(phK, hs.x, (zb + zh) / 2, hs.w - 0.3, zh - zb, 2.5, { y: deckY, wall: P.cream, band: 'cyn3', ribs: 0.9, plinth: null });
    windowRow(phK, phLit, 'z+', zh, hs.x - hs.w / 2 + 0.5, hs.x + hs.w / 2 - 0.5, deckY + 1.1, 0.62, 1.0, 0.3, r, 0.85);
    phK.box(1.4, 1.8, 0.1, P.steel, hs.x - hs.w / 2 + 1.1, deckY, zh + 0.05, { r: 0.02 });
    // transformers on the deck
    const a = new At(phK, 0, deckY, 0);
    const gz = zf - 0.25;
    const gpts = gantryPts(a, hs.x, gz, Math.min(4.6, hs.w - 0.8), 3.6);
    for (const sx of [-1.45, 1.45]) {
      transformer(a, hs.x + sx, (zh + gz) / 2 - 0.15, 0.6);
      const bs = [-0.65, 0, 0.65].map((bx) => V(hs.x + sx + bx * 0.6, deckY + 3.2 * 0.6 + 0.42, (zh + gz) / 2 - 0.15 + 0.2 * 0.6));
      bs.forEach((p, j) => shortWires.push([p, gpts[j]]));
    }
    bushings.push(gpts);
    phLamps.box(0.5, 0.18, 0.22, '#e9e1d2', hs.x + 1.6, deckY + 2.2, zh + 0.12, { r: 0, jitter: 0 });
    lightPool(phG, hs.x + 1.6, deckY - (GF - 0.4), zh + 1.4, 3, warmPool);
  }
  const phMesh = phK.build(), phLitMesh = phLit.build(winMat), phLampMesh = phLamps.build(lampHeadMat);
  for (const m of [phMesh, phLitMesh, phLampMesh]) { m.position.y = -(GF - 0.4); phG.add(m); }

  // ── water ────────────────────────────────────────────────────────────────────────────────
  const lake = waterPlane(-10.6, 10.6, -11.4, ZU + 0.2, WL, lakeMat);
  g.add(lake);
  const tail = waterPlane(-hw - 1.2, hw + 1.2, TOE - 0.6, 10.3, TW, riverMat);
  g.add(tail);
  const ripple = waterPlane(-hw - 1.2, hw + 1.2, TOE - 0.6, 10.3, TW + 0.02, fx.ripple, 7);
  ripple.renderOrder = 1;
  g.add(ripple);
  // the spill: over the crest, under the gates, down the steps, into the basin
  const sPath: [number, number][] = [[ZU - 0.4, WL + 0.01], [ZU + 0.45, SC + 0.26], [faceZ(SC) - 0.1, SC + 0.2]];
  for (let y = SC - 0.2; y > GF + 0.3; y -= 0.6) sPath.push([faceZ(y) + NZ * 0.14, y + NY * 0.14]);
  sPath.push([faceZ(GF) + 0.5, TW + 0.12], [bz1 - 0.4, TW + 0.06]);
  const sheet = new THREE.Mesh(strip(sPath, spill.x0 + 0.05, spill.x1 - 0.05, 3), fx.spill);
  sheet.renderOrder = 1;
  g.add(sheet);
  const churn = waterPlane(spill.x0, spill.x1, bz0, bz1 + 2.4, TW + 0.05, fx.basin);
  churn.renderOrder = 1;
  g.add(churn);
  // the draw into the culverts at the far end: streaks gathering speed towards each mouth (the plane is turned
  // half round, so the churn runs south and is thickest at the gates)
  const inflow = [-2.1, 0, 2.1].map((cx) => {
    const m = waterPlane(cx - 0.75, cx + 0.75, 7.9, 10.3, TW + 0.035, fx.inflow);
    m.rotation.y = Math.PI;
    m.renderOrder = 1;
    g.add(m);
    return m;
  });
  anim.plume(g, sMid, TW + 0.2, TOE + 0.9, { count: 18, life: 3.4, rise: 0.8, spread: 0.7, size0: 1.4, size1: 4.4, color: '#f4f7f7', opacity: 0.5, radius: sW * 0.35, wind: 0.35 }, o.seed + 40);

  // ── the land: embankment road at the front, control building, pylon(s), trees ────────────
  const lk = new Kit(rng(o.seed + 9));
  const lLit = new Kit(rng(o.seed + 10));
  const lLamps = new Kit(rng(o.seed + 11));
  // The tailrace's end: the outlet works. The road's embankment closes the gorge; in its upstream face three box
  // culverts (the head of the tailrace tunnel) take the water under the hill, each under its own slide gate, raised,
  // with an actuator on the parapet; wing walls funnel the flow in and riprap packs the corners behind them.
  const EB = GF - 0.8, FZ = 9.75, BZ = 10.35, SOF = 0.0;
  // (the concrete tops out at 0.19, under the road's asphalt at 0.22)
  lk.box(11.8, 0.19 - EB, 12.45 - BZ, P.concrete2, 0, EB, (BZ + 12.45) / 2, { r: 0.12, shade: 0.3 });
  lk.box(11.8, 0.19 - SOF, BZ - FZ + 0.2, P.concrete2, 0, SOF, (FZ + BZ) / 2 + 0.1, { r: 0.05, shade: 0 });
  const mouths = [-2.1, 0, 2.1], MW = 1.5;
  for (const sx of [-1, 1]) lk.box(5.9 - 2.85, SOF + 0.05 - EB, BZ - FZ + 0.2, P.concrete2, sx * (5.9 + 2.85) / 2, EB, (FZ + BZ) / 2 + 0.1, { r: 0.08, shade: 0.3 });
  for (const px of [-1.05, 1.05]) lk.box(0.6, SOF + 0.05 - EB, BZ - FZ + 0.2, P.concrete, px, EB, (FZ + BZ) / 2 + 0.1, { r: 0.06, shade: 0.3 });
  lk.box(6.6, 0.82, 0.3, P.concrete, 0, 0.2, FZ + 0.15, { r: 0.05, shade: 0.1 }); // the parapet the gates hang on
  lk.box(6.9, 0.1, 0.44, '#b5ac9e', 0, 1.0, FZ + 0.15, { r: 0.02, shade: 0 });
  for (const cx of mouths) {
    lk.box(MW, SOF - EB, 0.05, '#221f28', cx, EB, BZ - 0.02, { r: 0, jitter: 0, shade: 0 }); // the dark of the barrel
    lk.box(MW + 0.1, 0.78, 0.07, '#4d6a86', cx, 0.12, FZ - 0.05, { r: 0.02, jitter: 0.03 }); // the gate, raised
    for (let y = 0.3; y < 0.85; y += 0.24) lk.box(MW + 0.1, 0.05, 0.05, '#3f5670', cx, y, FZ - 0.1, { r: 0, jitter: 0, shade: 0 });
    for (const sx of [-1, 1]) lk.box(0.1, 1.0 - TW, 0.14, '#3f5670', cx + sx * (MW / 2 + 0.06), TW - 0.1, FZ - 0.06, { r: 0, jitter: 0 }); // guides
    lk.cyl(0.04, 0.04, 0.5, P.steel2, cx, 1.08, FZ + 0.1, 6, { shade: 0 }); // the stem
    lk.box(0.36, 0.3, 0.3, '#3f5670', cx, 1.08, FZ + 0.15, { r: 0.05 });
    lk.geo(new THREE.TorusGeometry(0.17, 0.025, 4, 12).translate(cx, 1.5, FZ + 0.34), 'red3', 0, 0); // handwheel
  }
  for (const sx of [-1, 1]) lk.box(1.7, 0.3 - (GF - 0.45), 0.3, P.concrete2, sx * 3.62, GF - 0.45, FZ - 0.42, { r: 0.05, shade: 0.25, ry: sx * 0.562 });
  paving(lk, 0, 11.25, 27.4, 1.9, P.asphalt, 0.14);
  for (const zz of [10.15, 12.3]) {
    lk.beam(V(-5.8, 0.85, zz), V(5.8, 0.85, zz), 0.1, '#d9d1c4');
    for (let x = -5.6; x <= 5.7; x += 1.4) lk.box(0.12, 0.7, 0.12, P.steel, x, 0.2, zz, { r: 0, jitter: 0 });
  }
  // the control building at the front-left
  const cbx = T2 ? -12.0 : -11.4, cbz = 8.6, cbw = T2 ? 2.9 : 3.8;
  shed(lk, cbx, cbz, cbw, 3.2, 3.6, { wall: P.cream, band: 'cyn3', ribs: 0, y: 0.05 });
  windowRow(lk, lLit, 'z+', cbz + 1.6, cbx - cbw / 2 + 0.3, cbx + cbw / 2 - 0.3, 2.2, 0.7, 0.9, 0.3, r, 0.8);
  windowRow(lk, lLit, 'x+', cbx + cbw / 2, cbz - 1.2, cbz + 1.2, 2.2, 0.7, 0.9, 0.3, r, 0.7);
  lk.box(0.9, 1.9, 0.08, '#4a5a66', cbx - cbw / 2 + 0.8, 0.35, cbz + 1.63, { r: 0, jitter: 0 });
  lk.box(0.12, 2.6, 0.12, P.steel, cbx + 1.4, 4.0, cbz - 1.0, { r: 0, jitter: 0 }); // antenna mast
  lLamps.box(0.5, 0.18, 0.22, '#e9e1d2', cbx - 1.1, 2.6, cbz + 1.75, { r: 0, jitter: 0 });
  lightPool(g, cbx - 1.1, 0.1, cbz + 3.0, 3.2, warmPool);
  paving(lk, cbx + 0.4, cbz + 2.0, 4.6, 1.0, '#b9b1a6', 0.12);
  // a kiosk and a parked truck at the front-right
  lk.box(1.6, 1.8, 1.2, '#e7dfd2', 9.2, 0.1, 8.9, { r: 0.08 });
  lk.box(1.7, 0.15, 1.3, P.roof, 9.2, 1.9, 8.9, { r: 0.03, shade: 0 });
  lk.box(0.72, 1.5, 0.06, '#4a5a66', 8.85, 0.12, 9.52, { r: 0, jitter: 0 });
  for (let y = 1.25; y < 1.62; y += 0.12) lk.box(0.5, 0.05, 0.05, '#8a8490', 9.65, y, 9.52, { r: 0, jitter: 0 });
  paving(lk, 11.7, 8.9, 2.9, 5.0, '#8f8892', 0.1);
  parkedCars(g, 11.7, 8.7, 1, 3, o.seed + 60, Math.PI / 2, ['pickup']);
  // pylon(s) on the abutments, the lines down to the transformers
  const wires: THREE.Vector3[][] = [];
  pylons.forEach((pp, i) => {
    const gy = Math.max(0, H(pp.x, pp.z)) - 0.15;
    const PH = 9.2;
    const m = pylon(o.seed + 50 + i, PH);
    const tgt = houses[i] ?? houses[0];
    const ry = Math.atan2(tgt.x - pp.x, (zh + zf) / 2 - pp.z);
    m.position.set(pp.x, gy, pp.z);
    m.rotation.y = ry;
    g.add(m);
    for (const [fx2, fz2] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) {
      const q = V(fx2, 0, fz2).applyAxisAngle(V(0, 1, 0), ry);
      const fy = Math.min(gy, H(pp.x + q.x, pp.z + q.z)) - 0.3;
      lk.box(0.7, gy + 0.3 - fy, 0.7, P.concrete2, pp.x + q.x, fy, pp.z + q.z, { r: 0.06, ry });
    }
    beacon(g, pp.x, gy + PH + 0.35, pp.z, i * 1.7);
    const arm = (lx: number, ly: number) => V(lx, ly, 0).applyAxisAngle(V(0, 1, 0), ry).add(V(pp.x, gy, pp.z));
    const ends = [arm(-2.88, PH * 0.72 - 0.65), arm(2.88, PH * 0.72 - 0.65), arm(-1.8, PH - 0.85)];
    (bushings[i] ?? bushings[0]).forEach((p, j) => wires.push([p, ends[j]]));
  });
  const wk = new Kit(rng(o.seed + 12));
  sagWires(wk, wires, 0.45, '#4a4452', 0.035);
  sagWires(wk, shortWires, 0.12, '#4a4452', 0.03);
  const wireMesh = wk.build();
  g.add(wireMesh);
  g.add(lk.build(), lLit.build(winMat), lLamps.build(lampHeadMat));

  // trees on the ridges, boulders on the gorge walls, scrub round the shore
  const pines: Placement[] = [], rocks: Placement[] = [], scrub: Placement[] = [], riprap: Placement[] = [];
  const clearOf = (x: number, z: number) =>
    pylons.every((p) => Math.hypot(x - p.x, z - p.z) > 2.6) && Math.hypot(x - cbx, z - cbz) > 3.4 && !(z > ZU - 1.4 && z < ZC + 0.8 && Math.abs(x) < hw + 3.4);
  for (let i = 0; i < 400 && pines.length < (T2 ? 30 : 36); i++) {
    const x = (r() - 0.5) * 27, z = (r() - 0.5) * 25;
    const y = H(x, z);
    if (y > PLAT + 0.4 && clearOf(x, z)) pines.push({ x, y: y - 0.1, z, s: 0.42 + r() * 0.3, ry: r() * 6.3, tint: 0.85 + r() * 0.3 });
  }
  for (let i = 0; i < 500 && rocks.length < 22; i++) {
    const x = (r() - 0.5) * 27, z = -3 + r() * 13;
    const y = H(x, z);
    if (y < 2.4 && y > TW + 0.25 && z > ZC && clearOf(x, z)) rocks.push({ x, y: y - 0.05, z, s: 0.22 + r() * 0.3, ry: r() * 6.3, tint: 0.85 + r() * 0.3 });
  }
  for (let i = 0; i < 500 && scrub.length < 40; i++) {
    const x = (r() - 0.5) * 27, z = -12.5 + r() * 9;
    const y = H(x, z);
    if (y > WL + 0.15 && y < WL + 1.3 && clearOf(x, z)) scrub.push({ x, y: y - 0.05, z, s: 0.4 + r() * 0.5, ry: r() * 6.3, tint: 0.85 + r() * 0.3 });
  }
  // riprap behind the wing walls and along the last of the banks, at the waterline
  for (let i = 0; i < 700 && riprap.length < 30; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (3.1 + r() * 4.6), z = 8.3 + r() * 1.35;
    const y = H(x, z);
    const behind = Math.abs(x) > 2.95 + (FZ - z) * 1.6; // outside the funnel the wing walls make
    if (behind && y > TW - 0.42 && y < TW + 0.3) riprap.push({ x, y: Math.max(y, TW - 0.3) - 0.04, z, s: 0.2 + r() * 0.2, ry: r() * 6.3, tint: 0.8 + r() * 0.3 });
  }
  if (riprap.length) g.add(plants('rock', riprap));
  if (pines.length) g.add(plants('pine', pines));
  if (rocks.length) g.add(plants('rock', rocks));
  if (scrub.length) g.add(plants('shrub', scrub));

  anim.extra.push((e) => {
    animateWater(e.t);
    for (const [i, b] of boils.entries()) b.scale.set(1 + Math.sin(e.t * 2.1 + i) * 0.06, 1, 1 + Math.cos(e.t * 1.7 + i) * 0.08);
  });
  const water = [sheet, churn, tail, ripple, ...boils, ...inflow];
  const land = (x: number, z: number) => (Math.abs(x) > 14.2 || Math.abs(z) > 13.2 ? 0 : H(x, z));
  return {
    obj: g, w: o.w, d: o.d, h: 12,
    ground: (x, z) => (Math.abs(x) > 14.2 || Math.abs(z) > 13.2 ? null : H(x, z)),
    // the control building's door; what stands in the way is measured from the reshaped land
    doors: [{ x: cbx - cbw / 2 + 0.8, z: cbz + 1.63 + 0.65 }],
    blockers: walkBlockers(g, o.w, o.d, 0.25, land),
    floor: walkFloor(g, o.w, o.d, 0.25, land),
    progress(p) {
      anim.done = p;
      damG.scale.y = Math.max(0.03, sstep(0.04, 0.72, p));
      crest.visible = p >= 0.78;
      phG.visible = p > 0.3;
      phG.scale.y = Math.max(0.03, sstep(0.3, 0.8, p));
      penMesh.visible = p >= 0.6;
      wireMesh.visible = p >= 0.85;
      lake.visible = p > 0.72;
      lake.position.y = lerp(WL - 2.4, WL, sstep(0.72, 1, p));
      for (const m of water) m.visible = p >= 1;
      tail.visible = p >= 0.9;
    },
    update(e) { anim.update(e); },
  };
}

/** A small H-frame gantry on the powerhouse deck; returns its three insulator points. */
function gantryPts(a: At, x: number, z: number, w: number, h: number) {
  for (const sx of [-1, 1]) a.box(0.24, h, 0.24, P.galv, x + (sx * w) / 2, 0, z, { r: 0.02, jitter: 0.02 });
  a.box(w + 0.4, 0.28, 0.28, P.galv, x, h - 0.15, z, { r: 0.02 });
  return [-1, 0, 1].map((i) => {
    a.cyl(0.06, 0.06, 0.6, P.insulator, x + i * w * 0.3, h - 0.75, z, 6, 0);
    return a.pt(x + i * w * 0.3, h - 0.8, z);
  });
}
