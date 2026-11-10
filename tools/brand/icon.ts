/**
 * The app icon and favicon: the game's own globe (render3d/globe/earth.ts) over Africa, Europe and the Atlantic
 * with the edge of night and the city lights to the east, on a dark space tile. Run by tools/gen-assets.ts in
 * headless Chrome: `renderIcons()` renders two 1024 px masters (the full globe with a little weather for the big
 * sizes, a plainer and bolder one for 64 px and under) and returns every size as a PNG data URL, each scaled down
 * from its master by area averaging (plus a touch of sharpening when small).
 */
import * as THREE from 'three';
import mapUrl from '../../src/content/generated/worldmap.bin?url';
import { PALETTE } from '../../src/render/palette';
import { atmosphereMaterial, cloudMaterial, dir, earthMaterial, earthTextures, R } from '../../src/render3d/globe/earth';
import { decodeWorldMap } from '../../src/world/mapData';

const MASTER = 1024;
/** Where the camera stands and where the sun is: daylight on Africa and Europe, night coming in from the east. */
const VIEW = { lon: 12, lat: 14 };
/** How far west of the camera the sun stands (degrees): less = a thinner night at the right edge. */
const SUN_WEST = { full: 47, plain: 34 };

type Tile = 'rounded' | 'mac' | 'square' | 'none';

interface GlobeLook {
  sunWest: number;
  clouds: number;
  /** The planet's radius as a share of the picture's half-width. */
  fill: number;
  lights: number;
  /** A CSS filter for the globe (the small sizes want more colour). */
  filter: string;
}

/** The planet on black (its air glows additively, so it is laid over a background with `screen`), and its radius in pixels. */
interface Globe {
  canvas: HTMLCanvasElement;
  r: number;
}

function renderGlobe(look: GlobeLook, tex: ReturnType<typeof earthTextures>, W: number, H: number): Globe {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(MASTER * 2, MASTER * 2, false);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const earthMat = earthMaterial(tex, W, H, 'high');
  const cloudMat = cloudMaterial(tex, 'high');
  const atmo = atmosphereMaterial(1.1);
  const scene = new THREE.Scene();
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), earthMat);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.009, 192, 96), cloudMat);
  clouds.renderOrder = 2;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 128, 64), atmo);
  shell.renderOrder = 3;
  scene.add(earth, shell);
  if (look.clouds > 0) scene.add(clouds);
  cloudMat.uniforms.opacity.value = look.clouds;
  earthMat.uniforms.nightLights.value = look.lights;
  earthMat.uniforms.cloudShadow.value = look.clouds > 0 ? 1 : 0;
  const sunDir = dir(VIEW.lon - look.sunWest, VIEW.lat);
  for (const m of [earthMat, cloudMat, atmo]) m.uniforms.sunDir.value.copy(sunDir);
  earthMat.uniforms.cloudShift.value = cloudMat.uniforms.cloudShift.value = 0.31;
  // a long lens: the planet nearly flat on, so the continents keep their shapes out to the edge
  const camera = new THREE.PerspectiveCamera(12, 1, 10, 4000);
  const dist = R / look.fill / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.copy(dir(VIEW.lon, VIEW.lat)).multiplyScalar(dist);
  camera.lookAt(0, 0, 0);
  // twice: a renderer's first frame can miss materials (see logo.ts)
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = out.height = MASTER;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = look.filter;
  ctx.drawImage(renderer.domElement, 0, 0, MASTER, MASTER);
  renderer.dispose();
  renderer.forceContextLoss();
  const half = (camera.fov * Math.PI) / 360;
  return { canvas: out, r: ((MASTER / 2) * Math.tan(Math.asin(look.fill * Math.sin(half)))) / Math.tan(half) };
}

/** The planet alone on a transparent square, with a rim of air `rim` wide (a share of the radius) so the disc stays round on any background. */
function bare(g: Globe, rim: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = MASTER;
  const ctx = c.getContext('2d')!;
  const m = MASTER / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(m, m, g.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(g.canvas, 0, 0);
  ctx.restore();
  const w = g.r * rim;
  const air = ctx.createLinearGradient(m - g.r, m - g.r * 0.4, m + g.r, m + g.r * 0.4);
  air.addColorStop(0, '#9fdcff');
  air.addColorStop(0.5, '#4f9bf0');
  air.addColorStop(1, '#3048a8');
  ctx.strokeStyle = air;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(m, m, g.r - w * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

/** A tiny repeatable random number source (the stars must not move between runs). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The space tile: a deep blue-violet fall of colour, a faint glow behind the planet, a few soft stars. */
function tile(kind: Exclude<Tile, 'none'>, globe: Globe, globeScale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = MASTER;
  const ctx = c.getContext('2d')!;
  const inset = kind === 'mac' ? Math.round(MASTER * 0.1) : 0;
  const side = MASTER - inset * 2;
  const radius = kind === 'mac' ? side * 0.225 : kind === 'rounded' ? MASTER * 0.18 : 0;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inset, inset, side, side, radius);
  ctx.clip();
  const g = ctx.createLinearGradient(0, inset, 0, inset + side);
  g.addColorStop(0, '#080a1c');
  g.addColorStop(0.45, PALETTE.night1);
  g.addColorStop(0.8, '#1a1640');
  g.addColorStop(1, '#2a1748');
  ctx.fillStyle = g;
  ctx.fillRect(inset, inset, side, side);
  // the planet's air lighting the dark behind it
  const halo = ctx.createRadialGradient(MASTER * 0.46, MASTER * 0.48, side * 0.3 * globeScale, MASTER * 0.46, MASTER * 0.48, side * 0.62 * globeScale);
  halo.addColorStop(0, 'rgb(70 150 235 / 0.34)');
  halo.addColorStop(0.5, 'rgb(60 110 220 / 0.12)');
  halo.addColorStop(1, 'rgb(60 110 220 / 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(inset, inset, side, side);
  const rnd = rng(7);
  for (let i = 0; i < 46; i++) {
    const x = inset + rnd() * side;
    const y = inset + rnd() * side;
    const r = (1.6 + rnd() * rnd() * 5) * (side / MASTER);
    const a = 0.35 + rnd() * 0.6;
    const s = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    s.addColorStop(0, `rgb(255 247 232 / ${a})`);
    s.addColorStop(0.4, `rgb(214 226 255 / ${a * 0.45})`);
    s.addColorStop(1, 'rgb(214 226 255 / 0)');
    ctx.fillStyle = s;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  // the planet, then its glow laid over the tile outside the disc
  const gs = side * globeScale;
  const g0 = MASTER / 2 - gs / 2;
  const gr = (globe.r * gs) / MASTER;
  ctx.save();
  ctx.beginPath();
  ctx.arc(MASTER / 2, MASTER / 2, gr, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(globe.canvas, g0, g0, gs, gs);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, MASTER, MASTER);
  ctx.arc(MASTER / 2, MASTER / 2, gr - 1, 0, Math.PI * 2);
  ctx.clip('evenodd');
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(globe.canvas, g0, g0, gs, gs);
  ctx.restore();
  // a soft light along the tile's top edge and a darker foot, so it sits as an object
  if (kind !== 'square') {
    const rim = ctx.createLinearGradient(0, inset, 0, inset + side);
    rim.addColorStop(0, 'rgb(150 170 255 / 0.16)');
    rim.addColorStop(0.05, 'rgb(150 170 255 / 0)');
    rim.addColorStop(0.94, 'rgb(0 0 0 / 0)');
    rim.addColorStop(1, 'rgb(0 0 0 / 0.22)');
    ctx.fillStyle = rim;
    ctx.fillRect(inset, inset, side, side);
  }
  ctx.restore();
  return c;
}

/** Scale a square canvas down to `size` by averaging the area under each pixel (alpha-weighted), then sharpen. */
function resample(src: HTMLCanvasElement, size: number, sharpen: number): string {
  const S = src.width;
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, S, S).data;
  const f = S / size;
  const acc = new Float32Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const y0 = y * f;
    const y1 = (y + 1) * f;
    for (let x = 0; x < size; x++) {
      const x0 = x * f;
      const x1 = (x + 1) * f;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const i = (sy * S + sx) * 4;
          const al = sd[i + 3] * w;
          r += sd[i] * al;
          g += sd[i + 1] * al;
          b += sd[i + 2] * al;
          a += al;
          wsum += w;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        acc[o] = r / a;
        acc[o + 1] = g / a;
        acc[o + 2] = b / a;
        acc[o + 3] = a / wsum;
      }
    }
  }
  const out = new ImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) {
        let v = acc[o + k];
        if (sharpen > 0 && acc[o + 3] > 0) {
          // unsharp mask against the four neighbours (only those that hold colour)
          let n = 0;
          let sum = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            const q = (yy * size + xx) * 4;
            if (acc[q + 3] < 128) continue;
            sum += acc[q + k];
            n++;
          }
          if (n) v += (v - sum / n) * sharpen;
        }
        out.data[o + k] = Math.max(0, Math.min(255, Math.round(v)));
      }
      out.data[o + 3] = Math.round(acc[o + 3]);
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c.toDataURL('image/png');
}

export async function renderIcons(): Promise<Record<string, string>> {
  const lods = decodeWorldMap(await (await fetch(mapUrl)).arrayBuffer());
  // the fine map: this is a still, baked once
  const lod = lods[1] ?? lods[0];
  const tex = earthTextures(lod);
  // the big sizes: the whole look, a little weather
  const full = renderGlobe({ sunWest: SUN_WEST.full, clouds: 0.5, fill: 0.9, lights: 1.5, filter: 'saturate(1.12) contrast(1.04)' }, tex, lod.W, lod.H);
  // 64 px and under: no weather, more colour, a thinner night, the planet edge to edge with a rim of air
  const plain = renderGlobe({ sunWest: SUN_WEST.plain, clouds: 0, fill: 0.97, lights: 2.4, filter: 'saturate(1.4) contrast(1.12) brightness(1.08)' }, tex, lod.W, lod.H);
  const small = bare(plain, 0.1);
  const medium = bare(plain, 0.055);
  const rounded = tile('rounded', full, 0.86);
  const square = tile('square', full, 0.8);
  const maskable = tile('square', full, 0.62);
  const mac = tile('mac', full, 0.86);
  const out: Record<string, string> = {};
  for (const s of [16, 24, 32, 48, 64]) out[`globe${s}`] = resample(s <= 24 ? small : medium, s, s <= 32 ? 0.5 : 0.3);
  for (const s of [128, 192, 256, 512, 1024]) out[`tile${s}`] = resample(rounded, s, s <= 192 ? 0.15 : 0);
  for (const s of [128, 256, 512, 1024]) out[`mac${s}`] = resample(mac, s, s <= 128 ? 0.15 : 0);
  out.square180 = resample(square, 180, 0.15);
  out.maskable512 = resample(maskable, 512, 0);
  return out;
}

(window as unknown as { renderIcons: typeof renderIcons }).renderIcons = renderIcons;
