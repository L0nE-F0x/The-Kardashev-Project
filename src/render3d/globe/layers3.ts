/**
 * The globe's Act III layers: megaproject patches that spread across the land stage by stage
 * (solar rows, little turbines turning, reactor domes, a reservoir), the intercontinental HVDC
 * links with power running along them, the orbital test satellite on its track, the space-solar
 * demonstrator's beam, and the launch site's rocket climbing away after the first liftoff.
 */
import * as THREE from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { softLine, type LineLook } from './soft';
import type { GameState } from '../../sim/types';
import { siteDef } from '../../content/sites';
import { charterView, liftoffActive, mainKind, orbitAngle, orbitPoint } from './layerData';
import type { MegaView } from '../../sim/charterView';
import { dir, R } from './earth';
import { dropLine, globePath, POWER_PULSE } from './layers2';
import { model } from './markers';
import { Kit, rng } from '../kit';
import { PALETTE } from '../../render/palette';

const RAD = Math.PI / 180;

/** Where the Sun stands (a unit vector; the globe sets it each frame): what lies on the ground goes dark with the land under it. */
export const groundSun = { value: new THREE.Vector3(1, 0, 0) };

/**
 * Paint for what lies on the ground (megaproject patches): lit as the Earth's own shader lights the land under it
 * (earth.ts: the same painted day, sunset tint, sky and moonlight), with a little shape from the sun's side. Lit
 * by the scene's lights instead (they are there for the markers), a patch on the night side shone like a lit disc
 * and one near the terminator sat darker than its ground.
 */
function groundPaint<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.groundSun = groundSun;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvGroundP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 groundSun; varying vec3 vGroundP;')
      .replace('#include <opaque_fragment>', `{
		float gdn = dot( normalize( vGroundP ), groundSun );
		float gday = smoothstep( -0.07, 0.26, gdn ) * ( 0.8 + 0.2 * clamp( gdn, 0.0, 1.0 ) );
		vec3 gsun = mix( vec3( 1.0, 0.47, 0.21 ), vec3( 1.0, 0.97, 0.92 ), smoothstep( -0.06, 0.24, gdn ) );
		float gshape = 0.76 + 0.32 * clamp( dot( inverseTransformDirection( normal, viewMatrix ), groundSun ) * 0.5 + 0.5, 0.0, 1.0 );
		outgoingLight = diffuseColor.rgb * ( gday * gshape * gsun * 1.3 + vec3( 0.07, 0.10, 0.19 ) * smoothstep( -0.2, 0.3, gdn ) + vec3( 0.034, 0.049, 0.109 ) );
	}
	#include <opaque_fragment>`);
  };
  return m;
}

const mat = groundPaint(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }));
mat.userData.shared = true;

/** A local frame on the globe at a point: x east, y up (out of the ground), z south. */
function frameAt(lon: number, lat: number, lift = 0) {
  const n = dir(lon, lat);
  const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const north = n.clone().cross(east);
  const m = new THREE.Matrix4().makeBasis(east, n, north.negate());
  m.setPosition(n.clone().multiplyScalar(R + lift));
  return m;
}

/**
 * Rows of solar panels with sandy tracks between them, as a tiling texture (64 × 16: one 0.9 × 0.22 block).
 * Mipmapped, so from far out the field fades to its average colour: drawn as geometry, rows a pixel apart
 * shimmered (moiré) as the globe turned.
 */
let solarTex: THREE.DataTexture | null = null;
function solarTexture() {
  if (solarTex) return solarTex;
  const w = 64, h = 16, a = new Uint8Array(w * h * 4);
  // (sRGB bytes, as the texture is flagged: through THREE.Color they went in as linear light and came out twice as dark)
  const sand = [0xc9, 0xa8, 0x79], panel = [0x34, 0x50, 0x8c], glint = [0x6f, 0x93, 0xd6];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const onPanel = x >= 2 && x < 58 && y >= 4 && y < 10;
    const c = onPanel ? (y === 4 ? glint : panel) : sand;
    const o = (y * w + x) * 4;
    a[o] = c[0]; a[o + 1] = c[1]; a[o + 2] = c[2]; a[o + 3] = 255;
  }
  solarTex = new THREE.DataTexture(a, w, h, THREE.RGBAFormat);
  solarTex.wrapS = solarTex.wrapT = THREE.RepeatWrapping;
  solarTex.magFilter = THREE.LinearFilter;
  solarTex.minFilter = THREE.LinearMipmapLinearFilter;
  solarTex.generateMipmaps = true;
  solarTex.anisotropy = 8;
  solarTex.colorSpace = THREE.SRGBColorSpace;
  solarTex.userData.shared = true;
  solarTex.needsUpdate = true;
  return solarTex;
}

/** Bend a patch built flat in its local frame (y up) onto the globe, so its wide discs don't float at the edges. */
function bendToGlobe(g: THREE.Object3D) {
  for (const o of g.children) {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + mesh.position.x, z = pos.getZ(i) + mesh.position.z;
        pos.setY(i, pos.getY(i) - (x * x + z * z) / (2 * R));
      }
      pos.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    } else o.position.y -= (o.position.x * o.position.x + o.position.z * o.position.z) / (2 * R);
  }
}

/**
 * A flat disc lying on the ground, in rings out from the centre: bent onto the globe it follows the curve (one fan
 * of triangles from the centre sagged under the surface halfway out).
 */
const disk = (radius: number, segs: number) => new THREE.RingGeometry(0, radius, segs, 6).rotateX(-Math.PI / 2);

/** Is there land at a longitude/latitude? (The globe answers from the world map.) */
export type LandTest = (lon: number, lat: number) => boolean;

/**
 * The patch at a megaproject: its main kind's kit, spread over a disc that grows with the stage. What is scattered
 * stands on land (out at sea for the offshore field): at a coast the disc reaches well over the water.
 */
function megaPatch(v: MegaView, seed: number, isLand?: LandTest): { obj: THREE.Group; rotors: THREE.Object3D[] } {
  const site = siteDef(v.siteId);
  const kind = mainKind(v);
  const stage = Math.max(1, v.stage);
  const radius = [0, 1.1, 1.9, 2.9][stage] * RAD * R;
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const rotors: THREE.Object3D[] = [];
  const r = rng(seed + 1);
  const offshore = site.id === 'mega-northsea';
  const inside = () => {
    // (a few dozen tries for the right ground, then anywhere: a site that is all coast still gets its kit)
    for (let tries = 0; ; tries++) {
      const x = (r() - 0.5) * 2 * radius, z = (r() - 0.5) * 2 * radius;
      if (x * x + z * z >= radius * radius) continue;
      // the patch's own frame: x east, z south
      const lat = site.lat - z / (RAD * R);
      if (!isLand || tries > 60 || isLand(site.lon + x / (RAD * R * Math.max(0.2, Math.cos(lat * RAD))), lat) !== offshore) return [x, z] as const;
    }
  };
  if (kind === 'solar') {
    // rows of dark panels in blocks, with sandy tracks between them (a textured disc: see solarTexture)
    const t = solarTexture();
    const disc = new THREE.Mesh(disk(radius, 48).translate(0, 0.006, 0), groundPaint(new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0 })));
    // the disc's uv spans its diameter: one block is 0.9 wide, a row 0.22 deep
    const geo = disc.geometry;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * radius * 2) / 0.9, (uv.getY(i) * radius * 2) / 0.22);
    disc.castShadow = disc.receiveShadow = false;
    g.add(disc);
  } else if (kind === 'wind' || offshore) {
    const n = Math.round(radius * radius * 3.2) + 4;
    for (let i = 0; i < n; i++) {
      const [x, z] = inside();
      k.cyl(0.012, 0.02, 0.36, '#f1ece4', x, 0, z, 5);
      const rotor = new THREE.Group();
      const rk = new Kit(rng(i));
      for (let b = 0; b < 3; b++) rk.geo(new THREE.BoxGeometry(0.012, 0.16, 0.004).translate(0, 0.08, 0).rotateZ((b * Math.PI * 2) / 3), '#f6f2ea', 0);
      rotor.add(rk.build(mat));
      rotor.position.set(x, 0.37, z + 0.015);
      rotor.userData.spin = 2 + r() * 1.5;
      rotors.push(rotor);
      g.add(rotor);
    }
  } else if (kind === 'nuclear') {
    const n = stage * 2 + 1;
    for (let i = 0; i < n; i++) {
      const [x, z] = inside();
      k.geo(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0, z), '#e9e1d2', 0.03);
      k.cyl(0.07, 0.1, 0.28, '#d8cfc3', x + 0.22, 0, z - 0.05, 10);
    }
  } else if (kind === 'hydro') {
    // a reservoir behind its dam (kept small: at the full disc's size it was a round lake as wide as a country)
    const lake = Math.min(1.4, radius * 0.45);
    k.geo(disk(lake, 24).translate(0, 0.004, 0), '#3b7fae', 0.02);
    k.box(lake * 0.8, 0.06, 0.05, '#bfae9f', 0, 0, lake, { r: 0, jitter: 0 });
  } else {
    // geothermal and the rest: pads of plant with steam
    const n = stage * 3;
    for (let i = 0; i < n; i++) {
      const [x, z] = inside();
      k.box(0.12, 0.06, 0.09, '#c9c1b6', x, 0, z, { r: 0.01 });
      k.geo(new THREE.SphereGeometry(0.06, 6, 4).translate(x, 0.12, z), '#f4f1ec', 0);
    }
  }
  // the graded sand round a solar field. Nothing under the rest: turbines, reactors and plant stand on the land as
  // it is (a cleared disc that size was a khaki circle hundreds of kilometres across, out over the sea at a coast)
  if (kind === 'solar') k.geo(disk(radius * 1.05, 28).translate(0, -0.004, 0), '#c9a879', 0.02);
  const m = k.build(mat);
  m.castShadow = false;
  m.receiveShadow = false;
  g.add(m);
  // cranes while something's being built here
  for (let i = 0; i < Math.min(3, v.building.length); i++) {
    const [x, z] = inside();
    const ck = new Kit(rng(i + 30));
    ck.box(0.02, 0.4, 0.02, '#fbd46e', x, 0, z, { r: 0, jitter: 0 });
    ck.box(0.3, 0.02, 0.02, '#fbd46e', x + 0.1, 0.4, z, { r: 0, jitter: 0 });
    g.add(ck.build(mat));
  }
  bendToGlobe(g);
  return { obj: g, rotors };
}

function fat(pts: THREE.Vector3[], color: string, width: number, o: Partial<LineLook> = {}) {
  return softLine(pts, { color, width, dashSize: 0.8, gapSize: 0.6, opacity: 0.95, ...o });
}

export class CharterLayer {
  readonly group = new THREE.Group();
  private patches = new Map<string, { obj: THREE.Group; rotors: THREE.Object3D[]; key: string }>();
  private hvdc = new Map<string, { lines: Line2[]; key: string; pts: THREE.Vector3[] }>();
  private sat: THREE.Group | null = null;
  private track: Line2 | null = null;
  private beam: THREE.Group | null = null;
  private rocket: THREE.Group | null = null;
  private trail: THREE.Mesh[] = [];
  private time = 0;

  constructor(private readonly isLand?: LandTest) {}

  /** Take a patch off the globe and free what was built for it (the shared paints and the panels' texture stay). */
  private dropPatch(obj: THREE.Object3D) {
    this.group.remove(obj);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      if (m.isMesh && !(m.material as THREE.Material).userData.shared) (m.material as THREE.Material).dispose();
    });
  }

  update(s: GameState | null, day: number, dt: number, scale: (p: THREE.Vector3, px: number) => number, facing: (n: THREE.Vector3) => number, near: boolean) {
    this.time += dt;
    const on = !!s?.charter;
    this.group.visible = on;
    if (!on || !s) return;
    const v = charterView(s);
    // megaproject patches
    const seen = new Set<string>();
    for (const mv of v.megas) {
      if (mv.stage < 1 && !mv.online.length) continue;
      seen.add(mv.siteId);
      const key = `${mv.stage}|${mainKind(mv)}|${Math.min(3, mv.building.length)}`;
      let p = this.patches.get(mv.siteId);
      if (p && p.key !== key) { this.dropPatch(p.obj); p = undefined; }
      if (!p) {
        const site = siteDef(mv.siteId);
        const made = megaPatch(mv, mv.siteId.length * 17, this.isLand);
        made.obj.matrixAutoUpdate = false;
        made.obj.matrix.copy(frameAt(site.lon, site.lat, 0.02));
        this.group.add(made.obj);
        p = { ...made, key };
        this.patches.set(mv.siteId, p);
      }
      for (const rt of p.rotors) rt.rotation.z -= dt * rt.userData.spin;
      p.obj.visible = near || mainKind(mv) === 'solar' || mainKind(mv) === 'hydro';
    }
    for (const [id, p] of this.patches) if (!seen.has(id)) { this.dropPatch(p.obj); this.patches.delete(id); }
    // HVDC links
    const hseen = new Set<string>();
    for (const h of v.hvdc) {
      hseen.add(h.route.id);
      const key = `${h.status}|${Math.round(h.progress * 20)}`;
      const o = this.hvdc.get(h.route.id);
      if (o && o.key === key) continue;
      if (o) for (const l of o.lines) dropLine(this.group, l);
      const pts = o?.pts ?? globePath([[h.route.a[1], h.route.a[0]], [h.route.b[1], h.route.b[0]]], 1.004, 0.6).map((p, i, arr) => p.multiplyScalar(1 + Math.sin((Math.PI * i) / (arr.length - 1)) * 0.012));
      const lines: Line2[] = [];
      // power runs along a finished link
      if (h.status === 'online') lines.push(fat(pts, PALETTE.yel0, 2.8, { pulse: POWER_PULSE, glow: 0.4 }));
      else {
        const n = Math.max(2, Math.round(h.progress * (pts.length - 1)) + 1);
        lines.push(fat(pts.slice(0, n), PALETTE.org2, 2.4));
        if (n < pts.length) lines.push(fat(pts.slice(n - 1), PALETTE.ink8, 1.4, { dashed: true, glow: 0 }));
      }
      for (const l of lines) this.group.add(l);
      this.hvdc.set(h.route.id, { lines, key, pts });
    }
    for (const [id, o] of this.hvdc) if (!hseen.has(id)) { for (const l of o.lines) dropLine(this.group, l); this.hvdc.delete(id); }
    // the orbital compute test: a satellite on an inclined orbit, its ground track dotted below
    if (v.orbitalTest && !this.sat) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 240; i++) { const p = orbitPoint((i / 240) * Math.PI * 2); pts.push(dir(p.lon, p.lat).multiplyScalar(R * 1.004)); }
      this.track = fat(pts, PALETTE.ice1, 1, { dashed: true, opacity: 0.5, glow: 0 });
      this.group.add(this.track);
      const k = new Kit(rng(5));
      k.box(0.5, 0.35, 0.35, '#e6e0e3', 0, 0, 0, { r: 0.05 });
      k.box(1.6, 0.03, 0.55, '#345c96', 0, 0.16, 0, { r: 0, jitter: 0 });
      this.sat = new THREE.Group();
      this.sat.add(model(k));
      this.group.add(this.sat);
    }
    if (this.sat) {
      const p = orbitPoint(orbitAngle(performance.now() / 1000));
      const n = dir(p.lon, p.lat);
      this.sat.position.copy(n).multiplyScalar(R * 1.07);
      this.sat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      this.sat.scale.setScalar(scale(this.sat.position, 8));
      this.sat.visible = facing(n) > -0.1;
    }
    // space solar: a collector in high orbit beaming down to a receiver in the Sahara
    if (v.spaceSolar && !this.beam) {
      const site = siteDef('mega-sahara');
      const n = dir(site.lon + 3, site.lat + 2);
      this.beam = new THREE.Group();
      const craft = new Kit(rng(6));
      craft.box(4, 0.05, 4, '#345c96', 0, 0, 0, { r: 0, jitter: 0.05 });
      craft.box(0.6, 0.5, 0.6, '#e6e0e3', 0, -0.4, 0, { r: 0.08 });
      const cm = model(craft);
      cm.position.copy(n).multiplyScalar(R * 1.16);
      cm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const len = R * 0.16;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.2, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.copy(n).multiplyScalar(R + len / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      this.beam.add(cm, cone);
      this.group.add(this.beam);
    }
    // the first liftoff replays from the launch site for a while: a rocket climbing out on its trail
    const lsite = v.launch ? siteDef(v.launch.siteId) : null;
    if (lsite && liftoffActive(v, day)) {
      if (!this.rocket) {
        const k = new Kit(rng(8));
        k.cyl(0.12, 0.12, 1.4, '#efe8de', 0, 0, 0, 10);
        k.geo(new THREE.ConeGeometry(0.12, 0.35, 10).translate(0, 1.57, 0), '#df5f3e', 0);
        this.rocket = new THREE.Group();
        this.rocket.add(model(k));
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8).rotateX(Math.PI).translate(0, -0.25, 0), new THREE.MeshBasicMaterial({ color: '#fde9a4', toneMapped: false }));
        this.rocket.add(flame);
        this.group.add(this.rocket);
        for (let i = 0; i < 14; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshStandardMaterial({ color: '#f4f1ec', transparent: true, opacity: 0.8, roughness: 1 }));
          this.trail.push(puff);
          this.group.add(puff);
        }
      }
      const t = this.time % 6;
      const n = dir(lsite.lon, lsite.lat);
      const fly = Math.max(0, t - 0.8);
      const rise = fly * fly * 0.9;
      const base = n.clone().multiplyScalar(R + 0.05);
      const sc = scale(base, 3);
      this.rocket.position.copy(base).addScaledVector(n, rise * sc * 6);
      this.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      this.rocket.scale.setScalar(sc * 2.2);
      this.rocket.visible = facing(n) > 0 && rise < 14;
      this.trail.forEach((p, i) => {
        const f = i / this.trail.length;
        p.position.copy(base).addScaledVector(n, rise * sc * 6 * f);
        p.scale.setScalar(sc * (1.2 + (1 - f) * 2.5 + (t < 0.8 ? 1 : 0)));
        (p.material as THREE.MeshStandardMaterial).opacity = (0.75 - f * 0.4) * Math.max(0, 1 - Math.max(0, t - 4) / 2);
        p.visible = this.rocket!.visible && (t > 0.2) && f * rise < rise;
      });
    } else if (this.rocket) {
      this.group.remove(this.rocket, ...this.trail);
      this.rocket = null;
      this.trail = [];
    }
  }
}
