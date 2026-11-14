/**
 * Code-built pieces: the things that repeat, grow with the sim or move. Each matches the Meshy
 * house style (bevelled boxes, matte hand-painted colour, the game's palette).
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, paintMat, poolMat, rng, withClouds, type Paint } from './kit';
import { hasModel, loadModels, model } from './models';
import { waterMaterial } from './campus/water';
import { plantField, type Placement } from './campus/trees';
import { parkedCars } from './campus/life';

export interface Env {
  t: number;
  dt: number;
  /** 0 = full day, 1 = deep night. */
  night: number;
  /** A piece asks for a sound or reports a moment ('launch' at ignition, 'night-launch' when one lifts off in the dark). */
  cue?: (name: 'launch' | 'night-launch') => void;
}

export interface Piece {
  obj: THREE.Object3D;
  /** Footprint (local), for the plot pad. */
  w: number;
  d: number;
  /** Height the construction clip runs to. */
  h: number;
  update?(e: Env): void;
  /** 0..1 while building; 1 = done. */
  progress?(p: number): void;
  /**
   * Reshape the ground under the piece (an open pit, a reservoir basin): the height at a point in
   * the piece's own coordinates, or null to leave the ground as it is.
   */
  ground?(x: number, z: number): number | null;
  /**
   * The piece's own floor underfoot (piece-local; null where it lays none): `walkFloor` reads it off the paving,
   * slabs, roads and doorsteps of a piece that doesn't keep to the 0.14–0.15 tops, and `walkH` stands people on it.
   */
  floor?(x: number, z: number): number | null;
  /** A brownout at the site: halls flicker and show red. */
  setAlert?(on: boolean): void;
  /**
   * Where people go in and out (piece-local: the spot a step outside each door, and the way out, default +z). Without
   * it, the middle of the front face. `gate`: a gate in the yard's fence where there is no door to use (the gas
   * plant's), so no doorway is looked for. `tools/qa/doorcheck.mjs` checks that every door has a wall and a way in.
   */
  doors?: { x: number; z: number; nx?: number; nz?: number; gate?: boolean }[];
  /**
   * What people walk round (piece-local boxes: walls, plant, yards, clutter). Without it, the whole w × d. Cars
   * placed with `parkedCars` count by themselves.
   */
  blockers?: { x0: number; z0: number; x1: number; z1: number }[];
  /**
   * Paved ways the piece lays out itself (piece-local polylines from a door towards the front of the plot): the
   * scene paves them and carries on to the gate. Without it, a path is routed from the gate to each door.
   */
  walks?: { x: number; z: number }[][];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const hallPool = poolMat('#ffe2b0', 0.5);

// ── shared bits ──────────────────────────────────────────────────────────────────────────────
function beacon(parent: THREE.Object3D, x: number, y: number, z: number, phase = 0) {
  const m = glowMat('red3', 0.2);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), m.clone());
  (b.material as THREE.MeshStandardMaterial).userData.blink = phase;
  b.position.set(x, y, z);
  b.userData.beacon = phase;
  parent.add(b);
  return b;
}
/** Blink the red aviation lights (stronger at night). */
export function blinkBeacons(root: THREE.Object3D, e: Env) {
  root.traverse((o) => {
    if (o.userData.beacon === undefined) return;
    const on = Math.sin(e.t * 2.2 + o.userData.beacon) > 0.55 ? 1 : 0;
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = on * (0.6 + e.night * 5);
  });
}

export function fence(kit: Kit, w: number, d: number, gate = 6, post: Paint = '#8a8490') {
  const h = 1.3;
  const sides: [number, number, number, number][] = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2]];
  // front side with a gate gap in the middle
  sides.push([-w / 2, d / 2, -gate / 2, d / 2], [gate / 2, d / 2, w / 2, d / 2]);
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) kit.box(0.12, h, 0.12, post, x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, { r: 0, jitter: 0 });
    for (const y of [0.35, h - 0.05]) kit.beam(V(x0, y, z0), V(x1, y, z1), 0.06, post);
  }
}

/** A chain-link mesh panel that reads as see-through. */
const meshMat = new THREE.MeshStandardMaterial({ color: col('#9a94a0'), transparent: true, opacity: 0.28, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
export function fenceMesh(group: THREE.Group, w: number, d: number, gate = 6) {
  const h = 1.25;
  const add = (len: number, x: number, z: number, ry: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), meshMat);
    p.position.set(x, h / 2, z);
    p.rotation.y = ry;
    group.add(p);
  };
  add(w, 0, -d / 2, 0);
  add(d, w / 2, 0, Math.PI / 2);
  add(d, -w / 2, 0, Math.PI / 2);
  const seg = (w - gate) / 2;
  add(seg, -w / 2 + seg / 2, d / 2, 0);
  add(seg, w / 2 - seg / 2, d / 2, 0);
}

/** A gravel pad the size of the plot. */
export function pad(w: number, d: number, paint: Paint = '#c4b8a6', seed = 1, mat?: THREE.Material) {
  const kit = new Kit(rng(seed));
  kit.box(w, 0.16, d, paint, 0, -0.04, 0, { r: 0.08, jitter: 0.02, shade: 0 });
  const m = kit.build(mat);
  m.castShadow = false;
  return m;
}

// ── construction: crane + scaffold + clip ────────────────────────────────────────────────────
export function crane(h: number, jib: number, seed = 1) {
  const g = new THREE.Group();
  const kit = new Kit(rng(seed));
  const s = 0.9;
  kit.box(2.2, 0.6, 2.2, '#8a8490', 0, 0, 0, { r: 0.05 });
  for (const [x, z] of [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]]) kit.box(0.12, h, 0.12, 'yel0', x, 0, z, { r: 0, jitter: 0 });
  for (let y = 0; y < h - 0.5; y += 1.2) {
    kit.beam(V(-s / 2, y, -s / 2), V(s / 2, y + 1.2, -s / 2), 0.07, 'org2');
    kit.beam(V(s / 2, y, s / 2), V(-s / 2, y + 1.2, s / 2), 0.07, 'org2');
    kit.beam(V(s / 2, y, -s / 2), V(s / 2, y + 1.2, s / 2), 0.07, 'org2');
    kit.beam(V(-s / 2, y, s / 2), V(-s / 2, y + 1.2, -s / 2), 0.07, 'org2');
  }
  g.add(kit.build());
  const top = new THREE.Group();
  top.position.y = h;
  const k2 = new Kit(rng(seed + 1));
  k2.box(1.6, 1.1, 1.4, 'yel0', 0, 0, 0);
  k2.box(1.0, 0.8, 1.0, '#e9e1d2', 0.3, 0.1, 0.75, { r: 0.08 }); // cab
  k2.box(jib, 0.45, 0.45, 'yel0', jib / 2 - 1, 1.1, 0, { r: 0.04 });
  k2.box(jib * 0.35, 0.4, 0.45, 'yel0', -jib * 0.175 - 0.5, 1.1, 0, { r: 0.04 });
  k2.box(1.6, 1.2, 1.2, '#7a7186', -jib * 0.33, 0.2, 0, { r: 0.06 }); // counterweight
  k2.box(0.3, 2.2, 0.3, 'yel0', 0, 1.1, 0, { r: 0.02 });
  k2.beam(V(0, 3.3, 0), V(jib - 1, 1.5, 0), 0.05, 'ink5');
  k2.beam(V(0, 3.3, 0), V(-jib * 0.35, 1.5, 0), 0.05, 'ink5');
  // hook
  k2.beam(V(jib * 0.6, 1.1, 0), V(jib * 0.6, -h * 0.55, 0), 0.04, 'ink4');
  k2.box(0.35, 0.4, 0.35, 'org0', jib * 0.6, -h * 0.55 - 0.4, 0, { r: 0.05 });
  top.add(k2.build());
  g.add(top);
  // (on the slewing top: it turns with the jib)
  beacon(top, jib - 1.2, 1.6, 0, seed);
  g.userData.top = top;
  return g;
}

export function scaffold(w: number, h: number, d: number, seed = 1) {
  const kit = new Kit(rng(seed));
  const bay = 2.2, lvl = 1.8;
  const ring = (y: number) => {
    kit.beam(V(-w / 2, y, -d / 2), V(w / 2, y, -d / 2), 0.07, '#c9a35a');
    kit.beam(V(-w / 2, y, d / 2), V(w / 2, y, d / 2), 0.07, '#c9a35a');
    kit.beam(V(-w / 2, y, -d / 2), V(-w / 2, y, d / 2), 0.07, '#c9a35a');
    kit.beam(V(w / 2, y, -d / 2), V(w / 2, y, d / 2), 0.07, '#c9a35a');
  };
  for (let y = lvl; y <= h + 0.1; y += lvl) ring(y);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += w / Math.max(1, Math.round(w / bay))) {
    kit.box(0.09, h, 0.09, '#9d95a6', x, 0, -d / 2, { r: 0, jitter: 0 });
    kit.box(0.09, h, 0.09, '#9d95a6', x, 0, d / 2, { r: 0, jitter: 0 });
  }
  for (let z = -d / 2; z <= d / 2 + 0.01; z += d / Math.max(1, Math.round(d / bay))) {
    kit.box(0.09, h, 0.09, '#9d95a6', -w / 2, 0, z, { r: 0, jitter: 0 });
    kit.box(0.09, h, 0.09, '#9d95a6', w / 2, 0, z, { r: 0, jitter: 0 });
  }
  return kit.build();
}

/** Material piles, a site office and a port-a-loo for a site under construction. */
export function siteClutter(w: number, d: number, seed = 1) {
  const r = rng(seed);
  const kit = new Kit(r);
  kit.box(4, 1.5, 1.6, '#e9e1d2', -w / 2 + 2.6, 0, d / 2 - 1.4, { r: 0.08 });
  kit.box(1.2, 0.5, 0.06, 'cyn2', -w / 2 + 2.6, 0.7, d / 2 - 0.58, { r: 0 });
  kit.box(0.8, 1.6, 0.8, 'cyn3', -w / 2 + 5.2, 0, d / 2 - 1.2, { r: 0.1 });
  for (let i = 0; i < 4; i++) {
    const x = w / 2 - 2 - r() * 4, z = d / 2 - 1.5 - i * 1.3;
    kit.box(2.6, 0.5 + r() * 0.4, 1, i % 2 ? '#c08850' : '#9d95a6', x, 0, z, { r: 0.05 });
  }
  return kit.build();
}

// A building cut at the height it has reached. Cut by a plain clip plane, a wall has no thickness: seen from above,
// a half-built hall was a paper box. So the cut is drawn here (it replaces three's clipping chunk; shadows keep
// the plain clip, which is right for them). The view ray through a pixel crosses the cut somewhere; where that
// crossing lies within a wall's thickness of the surface the pixel shows, the pixel is the wall's top:
// - the near wall: its face just above the cut is kept, as cap, where the ray goes on into the wall below the cut;
// - the far wall: its inside below the cut is cap where the ray entered the cut just inside its outer face.
// Everything else seen from inside is bare structure, and the cap is lit as a level surface. Every value is
// defined for every pixel (WebKit turns undefined GLSL into NaN): the derivatives come first, before any discard;
// the divisions are guarded.
const CUT_T = 0.35;
const CUT_GLSL = /* glsl */ `
bool cutCap = false, cutBare = false;
#if NUM_CLIPPING_PLANES > 0
{
  vec3 cutP = - vClipPosition;
  vec3 cutN = cross( dFdx( cutP ), dFdy( cutP ) );
  float cutL = length( cutN );
  cutN = cutL > 1e-12 ? cutN / cutL : vec3( 0.0, 0.0, 1.0 );
  vec4 cutPl = clippingPlanes[ 0 ];
  float cutD = dot( cutPl.xyz, cutP ) + cutPl.w;
  vec3 cutRay = isOrthographic ? vec3( 0.0, 0.0, - 1.0 ) : cutP / max( length( cutP ), 1e-6 );
  float cutDen = dot( cutPl.xyz, cutRay );
  cutDen = abs( cutDen ) > 1e-4 ? cutDen : 1e-4;
  float cutDepth = ( gl_FrontFacing ? 1.0 : - 1.0 ) * dot( cutRay, cutN ) * cutD / cutDen;
  // (and not too far along the face: a face seen edge-on, a rib's side, would otherwise cap a long way up)
  float cutAlong = abs( cutD / cutDen ) * sqrt( max( 1.0 - cutDen * cutDen, 0.0 ) );
  bool cutEye = cutPl.w < 0.0;
  float cutTilt = abs( dot( cutN, cutPl.xyz ) );
  bool cutTop = cutEye && cutTilt < 0.6 && cutDepth > 0.0 && cutDepth < ${CUT_T.toFixed(2)} && cutAlong < ${(CUT_T * 1.6).toFixed(2)};
  if ( cutD < 0.0 ) {
    // (only an upright face: a pipe's shoulder above the cut is not a wall standing on it)
    if ( ! ( gl_FrontFacing && cutTop && cutTilt < 0.25 ) ) discard;
    cutCap = true;
  } else if ( ! gl_FrontFacing ) {
    if ( cutTop ) cutCap = true; else cutBare = true;
  }
}
#endif
`;

function cutShader(fs: string): string {
  if (!fs.includes('#include <clipping_planes_fragment>')) return fs;
  return fs
    .replace('#include <clipping_planes_fragment>', CUT_GLSL)
    .replace('#include <color_fragment>', `#include <color_fragment>
	if ( cutCap ) diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.40, 0.39, 0.36 ), 0.55 );
	else if ( cutBare ) diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.22, 0.215, 0.21 ), 0.82 );`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\tif ( cutCap || cutBare ) roughnessFactor = 0.92;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tif ( cutCap || cutBare ) metalnessFactor = 0.0;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	#if NUM_CLIPPING_PLANES > 0
	if ( cutCap ) normal = - clippingPlanes[ 0 ].xyz;
	#endif`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\tif ( cutCap || cutBare ) totalEmissiveRadiance = vec3( 0.0 );');
}

/**
 * Clip everything in obj above world height y (null = no clip). Gives the meshes their own materials.
 * `below`: cut away what is under y instead (an old building while its replacement rises through it).
 */
export function clipAbove(obj: THREE.Object3D, y: number | null, below = false) {
  const walk = (o: THREE.Object3D) => {
    // planting and parked cars arrive when the building opens (never cut through by the rising clip), and leave
    // an old building as soon as the works on it begin
    if (o.userData.plant || o.userData.late) { o.visible = y === null; return; }
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if (y === null) {
        if (m.userData.ownMat) {
          m.material = m.userData.ownMat.orig;
          delete m.userData.ownMat;
        }
      } else {
        if (!m.userData.ownMat) {
          const orig = m.material as THREE.Material;
          const c = orig.clone();
          // keep the material's own shader hooks (the palette on Meshy models, grain, clouds), and draw the cut as
          // a real one (CUT_GLSL): walls with a top as thick as a wall, the inside bare
          const hook = orig.onBeforeCompile;
          c.onBeforeCompile = (sh, r) => {
            hook.call(orig, sh, r);
            sh.fragmentShader = cutShader(sh.fragmentShader);
          };
          c.customProgramCacheKey = () => orig.customProgramCacheKey() + '|cut2';
          const plane = below ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -y) : new THREE.Plane(new THREE.Vector3(0, -1, 0), y);
          c.clippingPlanes = [plane];
          c.clipShadows = true;
          c.side = THREE.DoubleSide;
          m.material = c;
          m.userData.ownMat = { orig, plane };
        }
        (m.userData.ownMat.plane as THREE.Plane).constant = below ? -y : y;
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(obj);
}

/**
 * What people walk round on a piece's plot (`Piece.blockers`), read off what the piece is built of: every surface in
 * a body's way, between knee and head height (0.3–1.9 m over the ground), marked on a grid of `cell` metres, the
 * marked cells joined into boxes, the biggest first (construction crews work round the first one). Slabs and paving
 * underfoot, canopies, crowns and wires overhead don't count; parked cars count by themselves (`userData.bay`). For
 * pieces too busy to list their blockers by hand: the Act II plants, with buildings, yards, tanks and fences all
 * over their plots. Call it on the finished piece's group (its own frame, the plot's ground at y 0).
 */
export function walkBlockers(obj: THREE.Object3D, w: number, d: number, cell = 0.25, groundAt?: (x: number, z: number) => number): { x0: number; z0: number; x1: number; z1: number }[] {
  const LO = 0.3, HI = 1.9;
  const nx = Math.ceil(w / cell), nz = Math.ceil(d / cell);
  const grid = new Uint8Array(nx * nz);
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  const mw = new THREE.Matrix4(), mi = new THREE.Matrix4(), mm = new THREE.Matrix4();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  // a triangle's part inside the height band: its corners and where its edges cross the band's floor and ceiling
  const box = { x0: 0, z0: 0, x1: 0, z1: 0, any: false };
  const take = (x: number, z: number) => {
    if (!box.any) { box.x0 = box.x1 = x; box.z0 = box.z1 = z; box.any = true; return; }
    box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.z0 = Math.min(box.z0, z); box.z1 = Math.max(box.z1, z);
  };
  const mark = () => {
    box.any = false;
    for (let i = 0; i < 3; i++) {
      const a = p[i], b = p[(i + 1) % 3];
      if (a.y >= LO && a.y <= HI) take(a.x, a.z);
      for (const y of [LO, HI]) {
        if ((a.y - y) * (b.y - y) < 0) {
          const t = (y - a.y) / (b.y - a.y);
          take(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        }
      }
    }
    if (!box.any) return;
    const i0 = Math.max(0, Math.floor((box.x0 + w / 2) / cell + 0.02)), i1 = Math.min(nx - 1, Math.floor((box.x1 + w / 2) / cell - 0.02));
    const j0 = Math.max(0, Math.floor((box.z0 + d / 2) / cell + 0.02)), j1 = Math.min(nz - 1, Math.floor((box.z1 + d / 2) / cell - 0.02));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * nx + i] = 1;
  };
  const walk = (o: THREE.Object3D) => {
    if (o.userData.bay || o.userData.lot || !o.layers.isEnabled(0)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !(m as THREE.SkinnedMesh).isSkinnedMesh) {
      const pos = m.geometry.getAttribute('position'), idx = m.geometry.getIndex();
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
      const tris = pos ? Math.floor((idx ? idx.count : pos.count) / 3) : 0;
      mw.multiplyMatrices(inv, m.matrixWorld);
      for (let k = 0; k < (inst ? inst.count : 1); k++) {
        if (inst) { inst.getMatrixAt(k, mi); mm.multiplyMatrices(mw, mi); } else mm.copy(mw);
        for (let t = 0; t < tris; t++) {
          for (let c = 0; c < 3; c++) {
            p[c].fromBufferAttribute(pos, idx ? idx.getX(t * 3 + c) : t * 3 + c).applyMatrix4(mm);
            if (groundAt) p[c].y -= groundAt(p[c].x, p[c].z);
          }
          if (Math.max(p[0].y, p[1].y, p[2].y) < LO || Math.min(p[0].y, p[1].y, p[2].y) > HI) continue;
          mark();
        }
      }
    }
    for (const ch of o.children) walk(ch);
  };
  walk(obj);
  // join the marked cells: runs along x, a run carried on down the rows while the next row has the same run
  const out: { x0: number; z0: number; x1: number; z1: number }[] = [];
  let open = new Map<string, { x0: number; z0: number; x1: number; z1: number }>();
  for (let j = 0; j <= nz; j++) {
    const next = new Map<string, { x0: number; z0: number; x1: number; z1: number }>();
    for (let i = 0; j < nz && i < nx; i++) {
      if (!grid[j * nx + i]) continue;
      const i0 = i;
      while (i + 1 < nx && grid[j * nx + i + 1]) i++;
      const key = `${i0},${i}`;
      const r = open.get(key);
      if (r) { r.z1 = -d / 2 + (j + 1) * cell; open.delete(key); next.set(key, r); }
      else next.set(key, { x0: -w / 2 + i0 * cell, z0: -d / 2 + j * cell, x1: -w / 2 + (i + 1) * cell, z1: -d / 2 + (j + 1) * cell });
    }
    for (const r of open.values()) out.push(r);
    open = next;
  }
  return out.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
}

/**
 * A piece's own floor (`Piece.floor`), read off what it is built of: the highest surface that faces up within a
 * step of the ground (0.6 m: paving, slabs, a road on its embankment, a doorstep, a building's plinth), exactly as
 * it lies (a grid of `cell` metres only says which surfaces to try at a point). `groundAt`: the land under a piece
 * that reshapes it.
 */
export function walkFloor(obj: THREE.Object3D, w: number, d: number, cell = 0.5, groundAt?: (x: number, z: number) => number): (x: number, z: number) => number | null {
  const STEP = 0.6;
  const nx = Math.ceil(w / cell), nz = Math.ceil(d / cell);
  const cells: number[][] = Array.from({ length: nx * nz }, () => []);
  const tris: number[] = [];
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  const mw = new THREE.Matrix4(), mi = new THREE.Matrix4(), mm = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = () => {
    // facing up (a box's top, a ramp), within a step of the land under it
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const ny = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
    if (nl < 1e-9 || ny / nl < 0.7) return;
    const g = (p: THREE.Vector3) => p.y - (groundAt ? groundAt(p.x, p.z) : 0);
    const top = Math.max(g(a), g(b), g(c));
    if (top > STEP || top < -0.05) return;
    const t = tris.length / 9;
    tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) + w / 2) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) + w / 2) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) + d / 2) / cell)), j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) + d / 2) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i].push(t);
  };
  const walk = (o: THREE.Object3D) => {
    // (not parked cars, planting, or a lamp's light pool: a disc on the lamp field's layer, out past the plot)
    if (o.userData.bay || o.userData.lot || o.userData.plant || !o.layers.isEnabled(0)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !(m as THREE.SkinnedMesh).isSkinnedMesh) {
      const pos = m.geometry.getAttribute('position'), idx = m.geometry.getIndex();
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
      const n = pos ? Math.floor((idx ? idx.count : pos.count) / 3) : 0;
      mw.multiplyMatrices(inv, m.matrixWorld);
      for (let k = 0; k < (inst ? inst.count : 1); k++) {
        if (inst) { inst.getMatrixAt(k, mi); mm.multiplyMatrices(mw, mi); } else mm.copy(mw);
        for (let t = 0; t < n; t++) {
          a.fromBufferAttribute(pos, idx ? idx.getX(t * 3) : t * 3).applyMatrix4(mm);
          b.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(mm);
          c.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(mm);
          if (Math.min(a.y, b.y, c.y) > STEP + 2) continue;
          tri();
        }
      }
    }
    for (const ch of o.children) walk(ch);
  };
  walk(obj);
  const T = new Float32Array(tris);
  // the highest of the surfaces in the point's cell that the point lies on (seen from above)
  return (x, z) => {
    const i = Math.floor((x + w / 2) / cell), j = Math.floor((z + d / 2) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return null;
    let h = -Infinity;
    for (const t of cells[j * nx + i]) {
      const o = t * 9, ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-5 || l2 < -1e-5 || l3 < -1e-5) continue;
      const y = l1 * T[o + 1] + l2 * T[o + 4] + l3 * T[o + 7];
      if (y > h) h = y;
    }
    return h > -Infinity ? h : null;
  };
}

// A piece under construction goes up at the pace of the work in it, not of a ruler: a plant is mostly low
// buildings and one tall stack, and a clip that climbs evenly has the buildings done in the first quarter and
// then nothing but the stack for the rest. So the clip's height follows how much wall there is at each height
// (floors and roofs count a quarter: they are laid, not raised), with some of the even climb kept so that the
// tall part is never left to the last day.
const RISE_N = 40;
const rise = new WeakMap<THREE.Object3D, Float32Array>();

function riseCurve(obj: THREE.Object3D, h: number): Float32Array {
  const hist = new Float32Array(RISE_N);
  obj.updateMatrixWorld(true);
  const y0 = obj.getWorldPosition(new THREE.Vector3()).y;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const mw = new THREE.Matrix4(), mi = new THREE.Matrix4();
  const tri = (weight: number) => {
    n.subVectors(b, a).cross(c.sub(a));
    const l = n.length();
    if (l < 1e-9) return;
    c.add(a);
    const lo = Math.min(a.y, b.y, c.y) - y0, hi = Math.max(a.y, b.y, c.y) - y0;
    if (hi < 0.2) return;
    const i0 = Math.max(0, Math.min(RISE_N - 1, Math.floor((lo / h) * RISE_N))), i1 = Math.max(0, Math.min(RISE_N - 1, Math.floor((hi / h) * RISE_N)));
    const w = (l * 0.5 * (0.25 + 0.75 * (1 - Math.abs(n.y) / l)) * weight) / (i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) hist[i] += w;
  };
  const walk = (o: THREE.Object3D) => {
    if (o.userData.plant || o.userData.late) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const pos = m.geometry.getAttribute('position'), idx = m.geometry.getIndex();
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
      const copies = inst ? inst.count : 1;
      const tris = pos ? Math.floor((idx ? idx.count : pos.count) / 3) : 0;
      // (a sample of the triangles is enough: a few thousand per mesh)
      const step = Math.max(1, Math.ceil((tris * copies) / 4000));
      for (let k = 0; k < copies; k++) {
        if (inst) { inst.getMatrixAt(k, mi); mw.multiplyMatrices(m.matrixWorld, mi); } else mw.copy(m.matrixWorld);
        for (let t = (k * 7) % step; t < tris; t += step) {
          a.fromBufferAttribute(pos, idx ? idx.getX(t * 3) : t * 3).applyMatrix4(mw);
          b.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(mw);
          c.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(mw);
          tri(step);
        }
      }
    }
    for (const ch of o.children) walk(ch);
  };
  walk(obj);
  let total = 0;
  for (let i = 0; i < RISE_N; i++) total += hist[i];
  const out = new Float32Array(RISE_N + 1);
  let bin = 0, cum = 0;
  for (let k = 0; k <= RISE_N; k++) {
    const even = (k / RISE_N) * h;
    if (total <= 0) { out[k] = even; continue; }
    const want = (k / RISE_N) * total;
    while (bin < RISE_N - 1 && cum + hist[bin] < want) cum += hist[bin++];
    const byWork = ((bin + (hist[bin] > 0 ? Math.min(1, (want - cum) / hist[bin]) : 1)) / RISE_N) * h;
    out[k] = byWork * 0.72 + even * 0.28;
  }
  out[RISE_N] = h;
  return out;
}

/** How high a piece under construction stands at progress p (0–1): the height to clip it at. */
export function builtHeight(piece: { obj: THREE.Object3D; h: number }, p: number): number {
  let c = rise.get(piece.obj);
  if (!c) { c = riseCurve(piece.obj, piece.h); rise.set(piece.obj, c); }
  const f = Math.max(0.02, Math.min(1, p)) * RISE_N, i = Math.min(RISE_N - 1, Math.floor(f));
  return 0.05 + c[i] + (c[i + 1] - c[i]) * (f - i);
}

// ── the data hall ────────────────────────────────────────────────────────────────────────────
export interface HallOpts {
  W?: number;
  D?: number;
  H?: number;
  /** Rows of rooftop chillers. */
  chRows?: number;
  /** 2 = a two-storey hall (a floor band half way up). */
  storeys?: number;
  /** Leave out the car park (big halls fill the plot). */
  noParking?: boolean;
}

export function dataHall(seed: number, o: HallOpts = {}): Piece & { setLoad(f: number): void } {
  const g = new THREE.Group();
  const kit = new Kit(rng(seed));
  const W = o.W ?? 21, D = o.D ?? 11, H = o.H ?? 5.2;
  const chRows = o.chRows ?? 2;
  const wall: Paint = '#ddd6cc';
  // body: a plinth, walls with ribbed cladding, a parapet roof
  kit.box(W + 0.6, 0.5, D + 0.6, '#a39a91', 0, 0, 0, { r: 0.08 });
  kit.box(W, H, D, wall, 0, 0.4, 0, { r: 0.18, jitter: 0.02, shade: 0.18 });
  for (let x = -W / 2 + 0.9; x < W / 2 - 0.5; x += 1.15) {
    kit.box(0.22, H - 1.2, 0.12, '#c9c1b6', x, 0.9, D / 2 + 0.065, { r: 0.04, jitter: 0.01, shade: 0 });
    kit.box(0.22, H - 1.2, 0.12, '#c9c1b6', x, 0.9, -D / 2 - 0.065, { r: 0.04, jitter: 0.01, shade: 0 });
  }
  kit.box(W + 0.3, 0.5, D + 0.3, '#5b5562', 0, H + 0.35, 0, { r: 0.1, shade: 0 }); // parapet
  kit.box(W - 0.4, 0.1, D - 0.4, '#6f6878', 0, H + 0.6, 0, { r: 0, shade: 0 }); // roof membrane
  // teal accent band + entrance block with canopy at the front-left
  kit.box(W + 0.02, 0.45, D + 0.02, 'cyn3', 0, H - 0.35, 0, { r: 0.05, shade: 0 });
  if ((o.storeys ?? 1) > 1) kit.box(W + 0.04, 0.3, D + 0.04, '#b9b1a6', 0, H / 2, 0, { r: 0.04, shade: 0 });
  kit.box(4.2, 3.6, 2.2, '#efe8de', -W / 2 + 3, 0.4, D / 2 + 1, { r: 0.15 });
  kit.box(4.8, 0.3, 3.2, 'cyn2', -W / 2 + 3, 3.4, D / 2 + 1.4, { r: 0.08 });
  kit.box(2, 2.4, 0.1, '#3b6f7a', -W / 2 + 3, 0.5, D / 2 + 2.12, { r: 0.02 });
  // loading dock + roll-up doors on the right
  for (const x of [W / 2 - 3, W / 2 - 6.2]) {
    kit.box(2.6, 2.9, 0.12, '#8a8490', x, 0.5, D / 2 + 0.08, { r: 0.02 });
    for (let y = 0.8; y < 3.3; y += 0.3) kit.box(2.5, 0.04, 0.05, '#7a7186', x, y, D / 2 + 0.16, { r: 0, jitter: 0 });
  }
  kit.box(7.5, 1.0, 2.2, '#a39a91', W / 2 - 4.6, 0, D / 2 + 1.1, { r: 0.06 });
  // generator row along the back
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + 2.4 + i * 4.1;
    kit.box(3.4, 1.7, 1.6, '#e7dfd2', x, 0, -D / 2 - 2.3, { r: 0.12 });
    kit.box(3.42, 0.35, 1.62, 'org0', x, 0, -D / 2 - 2.3, { r: 0.05, shade: 0 });
    kit.cyl(0.14, 0.14, 0.9, '#5b5562', x + 1.1, 1.7, -D / 2 - 2.6, 6);
  }
  // pipe rack from the gens to the hall
  kit.box(W - 2, 0.25, 0.5, '#8a8490', 0, 2.2, -D / 2 - 0.9, { r: 0.04 });
  for (let x = -W / 2 + 1.5; x < W / 2 - 1; x += 3.5) kit.box(0.18, 2.2, 0.18, '#7a7186', x, 0, -D / 2 - 0.9, { r: 0, jitter: 0 });
  g.add(kit.build());

  // rooftop chillers with spinning fans
  const fans: THREE.Object3D[] = [];
  const fanGeo = new THREE.BoxGeometry(1.0, 0.04, 0.16);
  const fanMat = new THREE.MeshStandardMaterial({ color: col('#433c52'), roughness: 0.7 });
  const roof = new Kit(rng(seed + 3));
  const chCols = Math.floor((W - 1.6) / 3.2);
  for (let r = 0; r < chRows; r++)
    for (let c = 0; c < chCols; c++) {
      const x = -W / 2 + 2.3 + c * 3.2, z = chRows > 1 ? -D / 2 + 3.1 + r * ((D - 6.2) / (chRows - 1)) : 0;
      roof.box(2.7, 1.1, 2.3, '#b9c2c4', x, H + 0.6, z, { r: 0.1, jitter: 0.03 });
      roof.box(2.76, 0.18, 2.36, '#8a959a', x, H + 0.62, z, { r: 0.04, shade: 0 });
      for (const fx of [-0.65, 0.65]) {
        roof.cyl(0.58, 0.58, 0.1, '#5e6670', x + fx, H + 1.7, z, 14);
        const f = new THREE.Group();
        const a = new THREE.Mesh(fanGeo, fanMat), b = new THREE.Mesh(fanGeo, fanMat);
        b.rotation.y = Math.PI / 2;
        f.add(a, b);
        f.position.set(x + fx, H + 1.83, z);
        f.userData.spin = 6 + (c * 7 + r * 3) % 5;
        fans.push(f);
        g.add(f);
      }
    }
  g.add(roof.build());

  // the lights inside: a clerestory band that glows cyan as the hall fills
  const band = glowMat('cyn5', 0);
  band.userData.manual = true;
  for (const z of [D / 2 + 0.07, -D / 2 - 0.07]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W - 1.4, 0.35, 0.05), band);
    m.position.set(0, H - 0.95, z);
    g.add(m);
  }
  // (lit low: at 1.2 the lobby's glass burnt out to a blank white board at night)
  const windows = glowMat('yel1', 0);
  windows.userData.nightOnly = 0.5;
  windows.color.copy(col('#3b6f7a')); // dark glass by day (it mirrors the sky), lit from inside at night
  const win = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.05), windows);
  win.position.set(-W / 2 + 3, 2.2, D / 2 + 2.15);
  g.add(win);
  // wall packs over the doors
  for (const x of [W / 2 - 3, W / 2 - 6.2, -W / 2 + 3]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.2), glowMat('yel1', 0.05));
    l.position.set(x, 3.7, D / 2 + 0.15 + (x < 0 ? 2.2 : 0));
    g.add(l);
    lightPool(g, x, 0, D / 2 + 2.6 + (x < 0 ? 1.6 : 0), 3.6, hallPool);
  }
  for (let i = 0; i < 5; i++) lightPool(g, -W / 2 + 2.4 + i * 4.1, 0, -D / 2 - 3.6, 2.6, hallPool);
  // a car park and the hall's own transformers at the front (asphalt and slabs lie on the plot's pad, whose top is
  // 0.12: anything lower is buried in it)
  const front = new Kit(rng(seed + 5));
  // the lobby window's frame and mullions (so it reads as glazing, lit or not)
  for (const dx of [-1.72, -0.57, 0.57, 1.72]) front.box(0.07, 1.16, 0.06, '#5b5562', -W / 2 + 3 + dx, 1.62, D / 2 + 2.18, { r: 0, jitter: 0, shade: 0 });
  for (const y of [1.6, 2.72]) front.box(3.5, 0.07, 0.06, '#5b5562', -W / 2 + 3, y, D / 2 + 2.18, { r: 0, jitter: 0, shade: 0 });
  if (!o.noParking) {
    front.box(12, 0.05, 4.4, '#6f6878', -6.5, 0.09, D / 2 + 5.6, { r: 0.03, shade: 0 });
    for (let i = 0; i < 6; i++) front.box(0.1, 0.02, 2.2, 'ink9', -12 + i * 2.2, 0.13, D / 2 + 5.4, { r: 0, jitter: 0 });
  }
  // (without a car park the transformers stand closer, inside the plot's fence)
  const tz = o.noParking ? D / 2 + 3.8 : D / 2 + 5.4;
  for (const x of [5.5, 8.5]) {
    front.box(2.2, 2.0, 1.8, '#8a8f80', x, 0.15, tz, { r: 0.08 });
    for (let k = 0; k < 4; k++) front.box(0.08, 1.5, 1.9, '#727868', x - 0.9 + k * 0.6, 0.35, tz, { r: 0, jitter: 0 });
    for (const bx of [-0.6, 0, 0.6]) front.cyl(0.09, 0.12, 0.8, '#d8cfc3', x + bx, 2.15, tz, 6);
  }
  front.box(5.6, 0.12, 3, '#a39a91', 7, 0, tz, { r: 0.03, shade: 0 });
  const fm = front.build();
  g.add(fm);
  // five bays between the six lines (the cars stood half a metre off their bays, the sixth off the asphalt); no
  // vans: one would reach over the walk along the building
  if (!o.noParking) parkedCars(g, -10.9, D / 2 + 5.6, 5, 2.2, seed + 9, Math.PI / 2, ['sedan', 'hatchback', 'suv', 'pickup']);

  let load = 0;
  let alert = false;
  const cyan = col('cyn5').clone(), red = col('red3').clone();
  return {
    obj: g, w: W + 2, d: D + 7, h: H + 2.5,
    // the glass door in the entrance block; the hall with its generators and pipe rack, the block, the dock, the transformers
    doors: [{ x: -W / 2 + 3, z: D / 2 + 2.75 }],
    // the walk between the entrance and the car park, then down beside the last bay towards the gate
    walks: [[{ x: -W / 2 + 3, z: D / 2 + 2.8 }, { x: 0.3, z: D / 2 + 2.8 }, { x: 0.3, z: D / 2 + (o.noParking ? 5 : 7.9) }]],
    blockers: [
      { x0: -W / 2 - 0.3, z0: -D / 2 - 3.1, x1: W / 2 + 0.3, z1: D / 2 + 0.3 },
      { x0: -W / 2 + 0.9, z0: D / 2, x1: -W / 2 + 5.1, z1: D / 2 + 2.15 },
      { x0: W / 2 - 8.35, z0: D / 2, x1: W / 2 - 0.85, z1: D / 2 + 2.2 },
      { x0: 4.2, z0: tz - 1.5, x1: 9.8, z1: tz + 1.5 },
    ],
    setLoad(f) { load = f; },
    setAlert(on) { alert = on; },
    update(e) {
      for (const f of fans) f.rotation.y += e.dt * f.userData.spin * (alert ? 0.15 : 0.3 + load);
      if (alert) {
        // a brownout: the band pulses red and flickers
        const pulse = Math.sin(e.t * 5) > 0 ? 1 : 0.25;
        band.emissive.copy(red);
        band.color.copy(red);
        band.emissiveIntensity = (0.6 + e.night * 1.6) * pulse * (Math.random() < 0.06 ? 0.2 : 1);
      } else {
        band.emissive.copy(cyan);
        band.color.copy(cyan);
        band.emissiveIntensity = load * (0.45 + e.night * 1.3);
      }
    },
  };
}

// ── solar ────────────────────────────────────────────────────────────────────────────────────

// ── battery yard ─────────────────────────────────────────────────────────────────────────────

// ── wind ─────────────────────────────────────────────────────────────────────────────────────
export function windTurbine(seed: number, H = 19): { obj: THREE.Group; rotor: THREE.Group; tower: THREE.Object3D } {
  const g = new THREE.Group();
  const kit = new Kit(rng(seed));
  kit.cyl(1.4, 1.6, 0.5, '#a39a91', 0, 0, 0, 12);
  kit.cyl(0.32, 0.6, H, '#f1ece4', 0, 0.4, 0, 14, { shade: 0.08, jitter: 0.01 });
  kit.box(0.9, 0.9, 2.4, '#f1ece4', 0, H + 0.3, -0.3, { r: 0.35 });
  const tower = kit.build();
  g.add(tower);
  const rotor = new THREE.Group();
  rotor.position.set(0, H + 0.75, 0.95);
  const bl = 8.5 * (H / 19);
  const rk = new Kit(rng(seed + 1));
  rk.geo(new THREE.SphereGeometry(0.42, 10, 8).scale(1, 1, 1.35), '#f1ece4', 0.01);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.CylinderGeometry(0.06, 0.26, bl, 6).translate(0, bl / 2 + 0.3, 0).scale(1, 1, 0.45);
    blade.rotateZ((i * Math.PI * 2) / 3);
    rk.geo(blade, '#f6f2ea', 0.01);
  }
  rotor.add(rk.build());
  g.add(rotor);
  beacon(g, 0, H + 1.3, -0.6, seed);
  return { obj: g, rotor, tower };
}


// ── Meshy-based facilities ───────────────────────────────────────────────────────────────────


// ── set dressing ─────────────────────────────────────────────────────────────────────────────
/** An oil pumpjack (the Permian Basin), nodding. */
export function pumpjack(seed: number) {
  const r = rng(seed);
  const paint: Paint = (['blu3', '#4f7d5c', '#8c4a3a', 'yel0'] as Paint[])[Math.floor(r() * 4)];
  const g = new THREE.Group();
  const k = new Kit(r);
  k.box(5.2, 0.35, 1.4, '#7a7186', 0, 0, 0, { r: 0.06 });
  k.beam(V(-0.2, 0.3, -0.5), V(0, 2.6, 0), 0.18, paint);
  k.beam(V(-0.2, 0.3, 0.5), V(0, 2.6, 0), 0.18, paint);
  k.beam(V(0.9, 0.3, 0), V(0, 2.6, 0), 0.16, paint);
  k.box(1.0, 0.8, 0.9, '#5b5562', -1.9, 0.3, 0, { r: 0.08 }); // gearbox + motor
  k.cyl(0.25, 0.25, 0.6, '#8a8490', 2.4, 0.3, 0, 8); // wellhead
  g.add(k.build());
  const beam = new THREE.Group();
  beam.position.set(0, 2.7, 0);
  const bk = new Kit(rng(seed + 1));
  bk.box(4.2, 0.28, 0.3, paint, 0.2, -0.14, 0, { r: 0.05 });
  bk.box(0.5, 1.4, 0.36, paint, 2.45, -1.0, 0, { r: 0.1 }); // horsehead
  bk.box(0.25, 0.12, 0.6, '#5b5562', -1.6, -0.06, 0, { r: 0.02 });
  bk.beam(V(2.55, -1.7, 0), V(2.55, -2.3, 0), 0.05, 'ink4');
  beam.add(bk.build());
  g.add(beam);
  const crank = new THREE.Group();
  crank.position.set(-1.9, 1.15, 0.58);
  const ck = new Kit(rng(seed + 2));
  ck.box(1.6, 0.5, 0.18, '#5b5562', 0, -0.25, 0, { r: 0.06 });
  crank.add(ck.build());
  g.add(crank);
  const phase = r() * 6;
  const speed = 1.4 + r() * 0.5;
  return {
    obj: g,
    update(e: Env) {
      const a = e.t * speed + phase;
      beam.rotation.z = Math.sin(a) * 0.22;
      crank.rotation.z = a;
    },
  };
}

/** A lattice transmission pylon (z = the line's direction). */
export function pylon(seed: number, H = 11) {
  const k = new Kit(rng(seed));
  const b = 1.4, t = 0.35;
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) k.beam(V(sx * b, 0, sz * b), V(sx * t, H, sz * t), 0.12, '#8a8490');
  for (let y = 0; y < H - 1; y += 1.6) {
    const w0 = b + (t - b) * (y / H), w1 = b + (t - b) * ((y + 1.6) / H);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      k.beam(V(ax * w0, y, az * w0), V(bx * w1, y + 1.6, bz * w1), 0.06, '#9d95a6');
    }
  }
  for (const [y, w] of [[H * 0.72, 3.2], [H - 0.2, 2.2]]) {
    k.box(w * 2, 0.2, 0.25, '#8a8490', 0, y, 0, { r: 0, jitter: 0 });
    for (const sx of [-1, 1]) k.cyl(0.08, 0.08, 0.6, '#d8cfc3', sx * w * 0.9, y - 0.6, 0, 6);
  }
  return k.build();
}

/** Wires between two points that sag; returns one merged mesh. */
export function wires(points: THREE.Vector3[][], sag = 0.9, paint: Paint = '#3a3442') {
  const k = new Kit(rng(3));
  for (const line of points)
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      const n = 8;
      let prev = a;
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(Math.PI * t) * sag;
        k.beam(prev, p, 0.05, paint);
        prev = p;
      }
    }
  const m = k.build();
  m.castShadow = true;
  return m;
}

/** A wooden utility pole with a cross arm. */
export function utilityPole(k: Kit, x: number, y: number, z: number, H = 6.5, ry = 0) {
  k.cyl(0.13, 0.16, H, '#7d5232', x, y, z, 6);
  const ax = Math.cos(ry), az = -Math.sin(ry);
  k.beam(V(x - ax * 1.1, y + H - 0.5, z - az * 1.1), V(x + ax * 1.1, y + H - 0.5, z + az * 1.1), 0.13, '#6b4a2c');
}

/** A street lamp: a tapered column on a base, an arm swept over the road, a lantern whose lens glows at night. */
let lampLens: THREE.BufferGeometry | null = null;
export function streetLamp(group: THREE.Object3D, kit: Kit, x: number, y: number, z: number, dir = 1) {
  const C = '#5b5562';
  kit.cyl(0.12, 0.15, 0.22, C, x, y, z, 8, { jitter: 0 });
  kit.cyl(0.048, 0.085, 4.1, C, x, y + 0.2, z, 8, { jitter: 0 });
  // the arm: up out of the column and over in a quarter turn, then out to the lantern
  const top = y + 4.28, R = 0.5;
  let prev = V(x, top, z);
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * Math.PI / 2;
    const p = V(x + dir * R * (1 - Math.cos(a)), top + R * Math.sin(a), z);
    kit.beam(prev, p, 0.075, C);
    prev = p;
  }
  kit.beam(prev, V(x + dir * 0.86, top + R + 0.02, z), 0.07, C);
  // the lantern: a shallow housing, its lens underneath
  kit.box(0.62, 0.1, 0.27, '#4a4552', x + dir * 1.05, top + R - 0.03, z, { r: 0.035, jitter: 0 });
  lampLens ??= new THREE.BoxGeometry(0.46, 0.045, 0.19);
  const head = new THREE.Mesh(lampLens, lampMat);
  head.position.set(x + dir * 1.07, top + R - 0.045, z);
  group.add(head);
  lightPool(group, x + dir * 1.05, y, z, 4.2, lampPool);
}
export const lampPool = poolMat('#ffd9a0', 0.55);
export const lampMat = glowMat('yel1', 0);
lampMat.userData.glowBase = 0;
lampMat.userData.nightOnly = 3.2;

/** Scrub clumps and rocks (instanced, per-instance colours). */
export function scrub(points: [number, number, number][], seed: number, kind: 'scrub' | 'rock' | 'grass') {
  const r = rng(seed);
  const geo = kind === 'rock' ? new THREE.DodecahedronGeometry(0.6, 0) : new THREE.IcosahedronGeometry(0.7, 0);
  const mat = withClouds(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }));
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const pal: Paint[] = kind === 'rock' ? ['rck4', 'rck5', '#b9a48e', 'rck3'] : kind === 'grass' ? ['#9a9a4c', '#b0a65a', '#7f8c45'] : ['#6f7a3c', '#7d8a45', '#5e6b38', '#8d8a4a', '#6a6f3a'];
  points.forEach(([x, y, z], i) => {
    const sc = kind === 'rock' ? 0.4 + r() * 1.1 : 0.5 + r() * 0.9;
    q.setFromEuler(new THREE.Euler(r() * 0.4, r() * 6.3, r() * 0.4));
    s.set(sc * (1 + r() * 0.4), sc * (kind === 'rock' ? 0.55 : 0.75), sc * (1 + r() * 0.4));
    p.set(x, y + (kind === 'rock' ? 0.05 : 0.15) * sc, z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    const c = col(pal[Math.floor(r() * pal.length)]).clone().multiplyScalar(0.85 + r() * 0.3);
    mesh.setColorAt(i, c);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Many copies of a Meshy model as instanced meshes (trees). */
export function instanced(parts: { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[], size: THREE.Vector3, at: { x: number; y: number; z: number; s: number; ry: number }[], target: number) {
  const g = new THREE.Group();
  const scale = target / Math.max(size.x, size.z);
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, at.length);
    const m = new THREE.Matrix4();
    at.forEach((a, i) => {
      m.compose(new THREE.Vector3(a.x, a.y, a.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a.ry, 0)), new THREE.Vector3().setScalar(scale * a.s));
      im.setMatrixAt(i, m.multiply(part.matrix));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }
  return g;
}

// ── people ───────────────────────────────────────────────────────────────────────────────────
const SHIRTS: Paint[] = ['cyn3', 'org1', 'blu4', 'red3', 'yel0', '#e9e1d2', 'vio3', 'grn5'];
const SKIN: Paint[] = ['skn2', 'skn3', 'skn4', 'skn5'];
/** A tiny figure (about 1.7 units tall), feet at y = 0. */
export function person(seed: number, vest = false) {
  const r = rng(seed);
  const k = new Kit(r);
  const shirt = vest ? 'org1' : SHIRTS[Math.floor(r() * SHIRTS.length)];
  const legs: Paint = ['#3b4a6e', '#4e4148', '#7d5232', '#2f2a3d'][Math.floor(r() * 4)];
  k.box(0.22, 0.75, 0.24, legs, -0.07, 0, 0, { r: 0.05, jitter: 0.02 });
  k.box(0.22, 0.75, 0.24, legs, 0.07, 0, 0, { r: 0.05, jitter: 0.02 });
  k.box(0.46, 0.62, 0.3, shirt, 0, 0.72, 0, { r: 0.1, jitter: 0.04 });
  k.geo(new THREE.SphereGeometry(0.17, 10, 8).translate(0, 1.52, 0), SKIN[Math.floor(r() * SKIN.length)], 0.02);
  if (vest) k.geo(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.56, 0), 'yel0', 0);
  else if (r() < 0.6) k.geo(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).translate(0, 1.56, -0.02), ['snd1', 'ink2', 'snd4', 'org0'][Math.floor(r() * 4)], 0);
  const m = k.build();
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** People walking loops between points, with a bob in their step. */
export class Walkers {
  readonly group = new THREE.Group();
  private ws: { o: THREE.Object3D; path: THREE.Vector3[]; i: number; t: number; speed: number; wait: number }[] = [];
  add(path: [number, number][], seed: number, y = 0, vest = false) {
    const o = person(seed, vest);
    const pts = path.map(([x, z]) => new THREE.Vector3(x, y, z));
    o.position.copy(pts[0]);
    this.group.add(o);
    this.ws.push({ o, path: pts, i: 0, t: rng(seed)() , speed: 1.1 + rng(seed + 1)() * 0.5, wait: 0 });
  }
  update(e: Env) {
    for (const w of this.ws) {
      if (w.wait > 0) { w.wait -= e.dt; w.o.position.y = w.path[0].y; continue; }
      const a = w.path[w.i], b = w.path[(w.i + 1) % w.path.length];
      const len = a.distanceTo(b) || 1;
      w.t += (e.dt * w.speed) / len;
      if (w.t >= 1) { w.t = 0; w.i = (w.i + 1) % w.path.length; if (Math.random() < 0.3) w.wait = 1 + Math.random() * 3; continue; }
      w.o.position.lerpVectors(a, b, w.t);
      w.o.position.y = a.y + Math.abs(Math.sin(e.t * 9 * w.speed)) * 0.08;
      w.o.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    }
  }
}

// ── ranch: a windpump over a stock tank, cattle ──────────────────────────────────────────────
export function windpump(seed: number) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const H = 9, b = 1.1, t = 0.25;
  const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) k.beam(V(sx * b, 0, sz * b), V(sx * t, H, sz * t), 0.1, '#8a8490');
  for (let y = 0; y < H - 1; y += 1.5) {
    const w0 = b + (t - b) * (y / H), w1 = b + (t - b) * ((y + 1.5) / H);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      k.beam(V(ax * w0, y, az * w0), V(bx * w1, y + 1.5, bz * w1), 0.05, '#9d95a6');
    }
  }
  k.box(0.7, 0.3, 0.7, '#8a8490', 0, H, 0, { r: 0.04 });
  k.beam(V(0, H + 0.4, 0), V(0, H + 0.4, -3), 0.08, '#8a8490');
  k.box(0.05, 1.5, 2.2, '#c23a3f', 0, H - 0.3, -3.6, { r: 0 }); // tail vane
  g.add(k.build());
  const wheel = new THREE.Group();
  wheel.position.set(0, H + 0.4, 0.5);
  const wk = new Kit(rng(seed + 1));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(0.34, 1.5, 0.04).translate(0, 1.15, 0);
    blade.rotateY(0.35);
    blade.rotateZ(a);
    wk.geo(blade, i % 2 ? '#e6e0e3' : '#c3bcc7', 0.02);
  }
  wk.geo(new THREE.TorusGeometry(1.85, 0.05, 4, 24), '#9d95a6', 0);
  wk.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8).rotateX(Math.PI / 2), '#5b5562', 0);
  wheel.add(wk.build());
  g.add(wheel);
  return { obj: g, update(e: Env) { wheel.rotation.z -= e.dt * 1.6; } };
}

let pondWater: THREE.MeshStandardMaterial | null = null;
/**
 * A stock pond (a ranch's earthen tank): an uneven pool behind a low bank of trodden earth, wet mud at the water's
 * edge, reeds and scrub round it. The water is the lakes' own (ripples, a soft edge), shallow and a little green.
 */
export function stockPond(r: number, seed: number) {
  const g = new THREE.Group();
  const rr = rng(seed);
  const ph = [rr() * 6, rr() * 6, rr() * 6];
  const R = (a: number) => r * (1 + 0.14 * Math.sin(2 * a + ph[0]) + 0.08 * Math.sin(3 * a + ph[1]) + 0.05 * Math.sin(5 * a + ph[2]));
  const N = 40;
  // the bank: wet rim, crest, a trodden top, the foot running out into the land
  const rings: [number, number, string][] = [[-0.35, 0.06, '#4f3f30'], [0.15, 0.2, '#6a5238'], [0.7, 0.34, '#8f6f4a'], [1.5, 0.3, '#9c7c52'], [2.9, -0.06, '#a98a5c']];
  const pos: number[] = [], cols: number[] = [], idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, base = R(a);
    rings.forEach(([d, y, c2], k) => {
      const wob = k >= 3 ? (rr() - 0.5) * 0.5 : 0;
      pos.push(Math.cos(a) * (base + d + wob), y, Math.sin(a) * (base + d + wob));
      const cc = col(c2), j = 0.92 + rr() * 0.16;
      cols.push(cc.r * j, cc.g * j, cc.b * j);
    });
  }
  const W = rings.length;
  for (let i = 0; i < N; i++) for (let k = 0; k + 1 < W; k++) {
    const p0 = i * W + k, p1 = ((i + 1) % N) * W + k;
    idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  bg.setIndex(idx);
  bg.computeVertexNormals();
  const bank = new THREE.Mesh(bg, paintMat);
  bank.castShadow = false;
  bank.receiveShadow = true;
  g.add(bank);
  // the water: deeper toward the middle
  const wp: number[] = [0, 0.14, 0], wd: number[] = [1.6], wi: number[] = [];
  const fr: [number, number][] = [[0.55, 1.0], [0.88, 0.35], [1.02, -0.06]];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, base = R(a);
    for (const [f, d] of fr) { wp.push(Math.cos(a) * base * f, 0.14, Math.sin(a) * base * f); wd.push(d); }
  }
  for (let i = 0; i < N; i++) {
    const p0 = 1 + i * 3, p1 = 1 + ((i + 1) % N) * 3;
    wi.push(0, p1, p0);
    for (let k = 0; k < 2; k++) wi.push(p0 + k, p1 + k, p0 + k + 1, p1 + k, p1 + k + 1, p0 + k + 1);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute('aDepth', new THREE.Float32BufferAttribute(wd, 1));
  wg.setIndex(wi);
  wg.computeVertexNormals();
  pondWater ??= waterMaterial('#6f9a84', '#2f5a66');
  pondWater.userData.shared = true;
  const w = new THREE.Mesh(wg, pondWater);
  w.receiveShadow = true;
  g.add(w);
  // reeds at the water's edge, scrub on the bank
  const reeds: Placement[] = [], scrubs: Placement[] = [];
  for (let i = 0; i < 22; i++) { const a = rr() * Math.PI * 2, d = R(a) + 0.05 + rr() * 0.5; reeds.push({ x: Math.cos(a) * d, y: 0.16, z: Math.sin(a) * d, s: 1.3 + rr() * 0.9, ry: rr() * 6, tint: 0.8 + rr() * 0.2 }); }
  for (let i = 0; i < 4; i++) { const a = rr() * Math.PI * 2, d = R(a) + 1.6 + rr() * 0.8; scrubs.push({ x: Math.cos(a) * d, y: 0.2, z: Math.sin(a) * d, s: 0.7 + rr() * 0.5, ry: rr() * 6 }); }
  g.add(plantField('tuft', reeds, { shadow: false }), plantField('sage', scrubs, { shadow: false }));
  return g;
}

// cattle: two sculpted cows (standing, grazing), loaded the first time a place has any
let cowDark: Map<THREE.Material, THREE.Material> | null = null;
/**
 * A cow (about 2.3 m long, facing +x). The models load on first use: until then the group is empty. One in three
 * is a black one (the same model, its hide darkened).
 */
export function cow(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const kind = r() < 0.55 ? 'cow_b' : 'cow_a';
  const dark = r() < 0.33, size = 2.15 + r() * 0.35, flip = r() < 0.5;
  const fill = () => {
    const m = model(kind, size);
    // (the models stand along z)
    m.rotation.y = Math.PI / 2;
    if (flip) m.scale.z *= -1;
    if (dark) {
      cowDark ??= new Map();
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        let d = cowDark!.get(src);
        if (!d) {
          const c = src.clone();
          c.color.setRGB(0.3, 0.27, 0.26);
          c.onBeforeCompile = src.onBeforeCompile;
          c.customProgramCacheKey = src.customProgramCacheKey;
          c.userData.shared = true;
          cowDark!.set(src, d = c);
        }
        mesh.material = d;
      });
    }
    g.add(m);
  };
  if (hasModel(kind)) fill();
  else loadModels([kind]).then(fill).catch(() => {});
  return { obj: g, update(_e: Env) { void _e; } };
}
