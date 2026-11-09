/**
 * The website hero's Earth, in 3D: the game's own globe (render3d/globe/earth.ts — land, relief, sea, city lights,
 * clouds, the atmosphere) with the sun where it really is right now, turning with the pixel globe it fades in over
 * (`view.lon`, shared). Loaded once the page is idle (three.js comes in its own chunk, shared with the 3D game).
 * Returns false without WebGL (the pixel globe stays).
 */
import * as THREE from 'three';
import { atmosphereMaterial, cloudMaterial, dir, earthMaterial, earthTextures, R } from '../render3d/globe/earth';
import type { MapLod } from '../world/mapData';
import { subsolar } from '../world/sun';

export function spinGlobe3d(canvas: HTMLCanvasElement, lod: MapLod, still: boolean, view: { lon: number }): boolean {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return false;
  }
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);

  const tex = earthTextures(lod);
  const earthMat = earthMaterial(tex, lod.W, lod.H);
  const cloudMat = cloudMaterial(tex);
  const atmo = atmosphereMaterial(1.1);
  const scene = new THREE.Scene();
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 96), earthMat);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.009, 128, 64), cloudMat);
  clouds.renderOrder = 2;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 48), atmo);
  shell.renderOrder = 3;
  scene.add(earth, clouds, shell);
  cloudMat.uniforms.opacity.value = 0.85;

  const camera = new THREE.PerspectiveCamera(30, 1, 10, 2000);
  // the globe as big as the pixel one it replaces (~88% of the square), its atmosphere just inside the edge
  const DIST = (R * 1.12) / Math.sin((camera.fov * Math.PI) / 360);

  const size = () => {
    const w = canvas.clientWidth || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, w, false);
  };
  size();
  window.addEventListener('resize', size);

  const lat = 18;
  let visible = true;
  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(canvas);
  let time = 0;
  let last = performance.now();
  const draw = () => {
    const ss = subsolar(new Date());
    const sunDir = dir(ss.lon, ss.lat);
    earthMat.uniforms.sunDir.value.copy(sunDir);
    cloudMat.uniforms.sunDir.value.copy(sunDir);
    atmo.uniforms.sunDir.value.copy(sunDir);
    const shift = (time * 0.0016) % 1;
    earthMat.uniforms.cloudShift.value = shift;
    cloudMat.uniforms.cloudShift.value = shift;
    camera.position.copy(dir(view.lon, lat)).multiplyScalar(DIST);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
  draw();
  canvas.classList.add('ready');
  if (still) return true;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden) {
      time += dt;
      view.lon -= dt * 6; // west → east, as the pixel globe turned
      draw();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return true;
}
