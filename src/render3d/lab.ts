/**
 * The piece lab (play3d/lab.html, dev only): one facility or set piece on a plot, with the real
 * ground, sky, post look and a person for scale. For building and checking 3D art.
 *
 *   /play3d/lab.html?piece=fab&tier=1&w=60&d=26          a facility type from the registry
 *   /play3d/lab.html?set=logicFab&brand=lumen&w=60        a view-only set piece
 *   …&progress=0.5 (under construction) &alt=35 (sun altitude °) &az=-40 (sun azimuth °, 0 = south)
 *   …&backdrop=desert &yaw=-0.5 &pitch=1.0 &dist=80 &night=1
 *
 * Console: lab.show({ piece, set, tier, w, d, progress, alt, az, backdrop, yaw, pitch, dist, brand, label, variant })
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Post, defaultLook, type Look } from './post';
import { loadModels, PEOPLE, person } from './models';
import { buildGround, type Backdrop } from './campus/ground';
import { CampusSky } from './campus/sky';
import { FACILITY_PIECES, setFactory } from './campus/registry';
import { sizeOf } from './campus/viewOnly';
import { clipAbove, pad, type Env, type Piece } from './pieces';
import { plumeUniforms } from './fx';
import { habitatShell } from './campus/habitatShell';
import { closeScope, openScope } from './kit';
import type { FacilityType } from '../sim/types';

interface LabOpts {
  piece?: string; set?: string; tier?: number; w?: number; d?: number; progress?: number;
  alt?: number; az?: number; backdrop?: Backdrop; yaw?: number; pitch?: number; dist?: number;
  brand?: string; label?: string; variant?: string; night?: number;
  // Act III–V set pieces
  accent?: string; hi?: string; n?: number; p?: number; builder?: string; vseed?: number; sea?: number; moon?: number;
  space?: number; habitat?: number; asteroid?: string;
}

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

let scene = new THREE.Scene();
let post: Post | null = null;
let piece: Piece | null = null;
let sky: CampusSky | null = null;
let scope = 0;
let sunV = new THREE.Vector3(0, 1, 0);
let sunAlt = 35;
const look: Look = { ...defaultLook(), ao: true, tilt: 1.0, focus: 0.45 };
let t = 0;

async function show(o: LabOpts = {}) {
  await loadModels(['garage', 'lab', 'gasplant', 'substation', 'watertower', 'mesquite', 'oak', 'pickup', 'semitruck', 'sedan', 'hatchback', 'suv', 'van', 'mixer', 'flatbed', ...PEOPLE]);
  if (scope) closeScope(scope);
  scope = openScope();
  post?.dispose();
  scene = new THREE.Scene();
  const w = o.w ?? 28, d = o.d ?? 26;
  const opts = { seed: 7, w, d, tier: o.tier ?? 1 };
  if (o.set) {
    const f = setFactory(o.set);
    const [sw, sd] = sizeOf(o.set);
    const so = { ...opts, w: o.w ?? sw, d: o.d ?? sd };
    piece = f ? f({ ...so, brand: o.brand ?? o.builder ?? 'lumen', label: o.label ?? (o.brand ?? 'LUMEN').toUpperCase(), variant: o.variant, accent: o.accent ?? '#f7b258', hi: o.hi ?? '#fbd46e', n: o.n, p: o.p, builder: o.builder, vseed: o.vseed, backdrop: o.backdrop, offshore: !!o.sea }) : null;
    Object.assign(opts, { w: so.w, d: so.d });
  } else {
    const f = FACILITY_PIECES[(o.piece ?? 'datacenter') as FacilityType];
    piece = f ? f(opts) : null;
  }
  const carve = piece?.ground?.bind(piece);
  const W = opts.w, D = opts.d;
  if (o.habitat) scene.add(habitatShell(0.6));
  else if (!o.space) {
    const ground = buildGround({ backdrop: o.moon || o.asteroid ? 'lunar' : o.backdrop ?? 'plains', seed: 3, flat: { x0: -W / 2 - 30, z0: -D / 2 - 30, x1: W / 2 + 30, z1: D / 2 + 30 }, roads: [], carve, seaZ: o.sea ? 900 : undefined, curve: o.asteroid ? 220 : undefined });
    scene.add(ground.mesh, ground.plants);
    if (ground.water) scene.add(ground.water);
  }
  sky = new CampusSky(scene, 'clear', o.space ? 'space' : o.habitat ? 'habitat' : o.asteroid ? 'asteroid' : o.moon ? 'lunar' : 'earth', { place: o.space ? 'l4' : undefined, swarm: o.space || o.asteroid ? 6 : 0 });
  sky.focus(new THREE.Vector3(), Math.max(W, D) + 20);
  sunAlt = o.night ? -30 : o.alt ?? (o.moon || o.space || o.asteroid ? 10 : 35);
  const az = ((o.az ?? -40) * Math.PI) / 180;
  const el = (Math.max(-80, sunAlt) * Math.PI) / 180;
  // azimuth 0 = due south (towards the camera), negative = east
  sunV = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  if (!carve && !q.has('nopad') && !o.sea && !o.moon && !o.space && !o.habitat && !o.asteroid) scene.add(pad(W - 0.6, D - 0.6, '#c4b8a6', 1));
  if (!piece) console.warn('lab: no such piece', o);
  if (piece) {
    scene.add(piece.obj);
    if (o.progress !== undefined && o.progress < 1) {
      clipAbove(piece.obj, 0.05 + Math.max(0.02, o.progress) * piece.h);
      piece.progress?.(o.progress);
    } else piece.progress?.(1);
  }
  // ?people=1: everyone with a rig in a row (a lineup for checking the figures)
  if (q.has('people')) {
    const all = ['worker', 'engineer', 'researcher', 'scientist', 'office', 'adv_juno', 'adv_penny', 'adv_mira', 'adv_sol', 'adv_iris', 'adv_kip', 'adv_lena', 'astronaut'] as const;
    await loadModels([...all]);
    all.forEach((k, i) => {
      const f = person(k);
      if (!f) return;
      f.obj.position.set(-12 + i * 2, 0, 8);
      f.walk.paused = true;
      f.walk.time = 0;
      f.mixer.update(0);
      scene.add(f.obj);
    });
  }
  // a person for scale, at the plot's front-left corner
  const p = person('worker');
  if (p) {
    p.obj.position.set(-W / 2 + 1, o.sea || o.space ? -100 : 0, D / 2 + 1.5);
    p.walk.paused = true;
    scene.add(p.obj);
  }
  post = new Post(renderer, scene, camera, true);
  const dist = o.dist ?? Math.max(60, Math.max(W, D) * 2.6);
  const pitch = o.pitch ?? 1.0, yaw = o.yaw ?? -0.45;
  controls.target.set(0, 3, 0);
  camera.position.setFromSphericalCoords(dist, pitch, yaw).add(controls.target);
  controls.update();
  return piece ? { w: piece.w, d: piece.d, h: piece.h } : null;
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - (frame as unknown as { last?: number }).last! || 16) / 1000);
  (frame as unknown as { last?: number }).last = now;
  t += dt;
  controls.update();
  if (sky) sky.update(dt, sunV, sunAlt);
  const env: Env = { t, dt, night: sky?.night ?? 0 };
  piece?.update?.(env);
  scene.traverse((ob) => {
    if (ob.userData.beacon !== undefined) ((ob as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 2.2 + ob.userData.beacon) > 0.55 ? 0.6 + env.night * 5 : 0;
  });
  look.bloom = 0.16 + env.night * 0.42;
  look.bloomThreshold = 1.5 - env.night * 0.7;
  post?.render(dt, look, 0);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post?.resize();
  plumeUniforms.scale.value = innerHeight * renderer.getPixelRatio() * 0.9;
});
plumeUniforms.scale.value = innerHeight * renderer.getPixelRatio() * 0.9;
camera.aspect = innerWidth / innerHeight;
camera.updateProjectionMatrix();

const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
const first: LabOpts = {
  piece: q.get('piece') ?? undefined, set: q.get('set') ?? undefined, tier: num('tier'), w: num('w'), d: num('d'), progress: num('progress'),
  alt: num('alt'), az: num('az'), backdrop: (q.get('backdrop') as Backdrop) ?? undefined, yaw: num('yaw'), pitch: num('pitch'), dist: num('dist'),
  brand: q.get('brand') ?? undefined, label: q.get('label') ?? undefined, variant: q.get('variant') ?? undefined, night: num('night'),
  accent: q.get('accent') ? `#${q.get('accent')}` : undefined, hi: q.get('hi') ? `#${q.get('hi')}` : undefined, n: num('n'), p: num('p'),
  builder: q.get('builder') ?? undefined, vseed: num('vseed'), sea: num('sea'), moon: num('moon'),
  space: num('space'), habitat: num('habitat'), asteroid: q.get('asteroid') ?? undefined,
};
Object.assign(window, { lab: { show, scene: () => scene, camera, controls } });
show(first).then(() => { (window as unknown as { labReady: boolean }).labReady = true; requestAnimationFrame(frame); });
