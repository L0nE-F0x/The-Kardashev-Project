/**
 * The 3D look test (dev only: /3d/). Act I's two places as scale-model slabs, run by the real sim.
 * See art3d/DIRECTION.md for the art direction.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FACILITIES } from '../content/facilities';
import { loadModels } from './models';
import { Sky } from './sky';
import { Post } from './post';
import { World } from './world';
import { Campus } from './campus';
import { SimRun } from './simrun';
import { Hud } from './hud';
import { BAY, TEXAS, type SlabDef } from './terrain';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = 0.3;
controls.maxPolarAngle = 1.18;
controls.minDistance = 22;
controls.maxDistance = 320;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;

const sky = new Sky(scene);
const post = new Post(renderer, scene, camera);

// views per site: where the camera looks from
const VIEWS: Record<string, { def: SlabDef; target: THREE.Vector3; dist: number; az: number; pol: number }> = {
  'west-texas': { def: TEXAS, target: new THREE.Vector3(2, 0, 4), dist: 178, az: -0.32, pol: 0.92 },
  'bay-area': { def: BAY, target: new THREE.Vector3(0, 2, 4), dist: 105, az: -0.28, pol: 0.98 },
};
let site: keyof typeof VIEWS = 'west-texas';

function viewPose(id: string) {
  const v = VIEWS[id];
  const target = v.target.clone().add(v.def.at);
  const pos = new THREE.Vector3().setFromSphericalCoords(v.dist, v.pol, v.az).add(target);
  return { target, pos };
}

let flight: { t: number; from: { target: THREE.Vector3; pos: THREE.Vector3 }; to: { target: THREE.Vector3; pos: THREE.Vector3 } } | null = null;
function flyTo(id: string, instant = false) {
  site = id;
  const to = viewPose(id);
  const v = VIEWS[id];
  sky.focus(v.def.at.clone(), Math.max(v.def.w, v.def.d) * 0.62);
  if (instant) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    return;
  }
  flight = { t: 0, from: { target: controls.target.clone(), pos: camera.position.clone() }, to };
}

async function start() {
  const [run] = await Promise.all([SimRun.create(), loadModels()]);
  const world = new World(scene);
  const campus = new Campus(world.texas);
  let lastHud = 0;
  const hud = new Hud(run, {
    site: (id) => flyTo(id),
    look: (l) => post.setLook(l),
    time: (t) => { if (t === 'cycle') sky.cycle = 150; else { sky.cycle = 0; sky.time = t; } },
    pixelSize: (n) => post.setPixelSize(n),
    tilt: (on) => (post.tiltAmount = on ? 1.6 : 0),
    build: (t) => {
      const r = run.build(t);
      hud.toast(r.ok ? `Broke ground on a ${FACILITIES[t].name}` : r.reason);
      campus.sync(run.s);
      hud.refresh();
    },
    speed: (n) => (run.speed = n),
    autopilot: (on) => (run.autopilot = on),
    hide: () => {},
  });
  campus.onOpened = (f) => hud.toast(`${FACILITIES[f.type].name} online at West Texas`);
  flyTo('west-texas', true);
  campus.sync(run.s);
  hud.refresh();

  const timer = new THREE.Timer();
  let t = 0;
  const frame = (now: number) => {
    timer.update(now);
    const dt = Math.min(0.1, timer.getDelta());
    t += dt;
    if (run.step(dt)) campus.sync(run.s);
    if (t - lastHud > 0.25) { hud.refresh(); lastHud = t; }

    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.8);
      const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      controls.target.lerpVectors(flight.from.target, flight.to.target, k);
      camera.position.lerpVectors(flight.from.pos, flight.to.pos, k);
      // a little lift in the middle of the flight
      camera.position.y += Math.sin(Math.PI * k) * 40;
      if (flight.t >= 1) flight = null;
    } else {
      // keep the look-at point on the slab
      const v = VIEWS[site];
      const c = v.def.at;
      const tg = controls.target;
      const nx = THREE.MathUtils.clamp(tg.x, c.x - v.def.w / 2, c.x + v.def.w / 2), nz = THREE.MathUtils.clamp(tg.z, c.z - v.def.d / 2, c.z + v.def.d / 2);
      if (nx !== tg.x || nz !== tg.z) { camera.position.x += nx - tg.x; camera.position.z += nz - tg.z; tg.x = nx; tg.z = nz; }
      controls.update();
    }

    sky.update(dt, renderer);
    const env = { t, dt, night: sky.night };
    world.update(env);
    campus.update(env);
    post.render(dt, sky.night);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // for poking at it from the console
  const look = (x: number, y: number, z: number, dist: number, az = -0.3, pol = 0.95) => {
    flight = null;
    controls.target.set(x, y, z);
    camera.position.setFromSphericalCoords(dist, pol, az).add(controls.target);
    controls.update();
  };
  Object.assign(window, { kp3d: { run, sky, post, camera, controls, scene, renderer, campus, world, flyTo, hud, look } });
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize();
});

start().catch((e) => {
  console.error(e);
  document.getElementById('hud')!.innerHTML = `<pre style="color:#f88;padding:20px">${String(e?.stack ?? e)}</pre>`;
});
