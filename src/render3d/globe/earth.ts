/**
 * The 3D Earth, painted from the game's own world raster (worldmap.bin): biome colours, shallow seas
 * from the coast distance, relief from the mountain biomes, region borders, city lights on the night
 * side and a cloud layer. Same scale-model palette as the campuses.
 */
import * as THREE from 'three';
import type { MapLod } from '../../world/mapData';
import { BIOME } from '../../content/mapcodes';
import { CITIES } from '../../content/cities';
import { fbm, noise } from '../kit';

export const R = 100;

const RAD = Math.PI / 180;
/** Unit vector for a longitude/latitude (matches SphereGeometry's uv mapping). */
export function dir(lon: number, lat: number, out = new THREE.Vector3()) {
  const phi = (lon + 180) * RAD, th = (90 - lat) * RAD;
  return out.set(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
}
export function lonLatOf(p: THREE.Vector3): { lon: number; lat: number } {
  const n = p.clone().normalize();
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, n.y))) / RAD;
  let lon = Math.atan2(n.z, -n.x) / RAD - 180;
  if (lon < -180) lon += 360;
  return { lon, lat };
}

// biome → colour (sRGB hex), painted like the campuses: warm, matte, a little desaturated
const BIOME_COL: Record<number, string> = {
  [BIOME.ICE]: '#eef3f8', [BIOME.TUNDRA]: '#9fa48a', [BIOME.BOREAL]: '#3f6b4a', [BIOME.TEMPERATE]: '#5f8f45',
  [BIOME.GRASS]: '#a3a85a', [BIOME.DESERT]: '#e0bf82', [BIOME.SAVANNA]: '#b9a25a', [BIOME.RAINFOREST]: '#2f6a3a',
  [BIOME.MOUNTAIN]: '#b8a48c', [BIOME.ALPINE]: '#c9c2bb', [BIOME.PLATEAU]: '#c8a674', [BIOME.WETLAND]: '#4f7f5a',
  [BIOME.FARMLAND]: '#8fa456', [BIOME.LAKE]: '#3b7fae', [BIOME.RIVER]: '#3b7fae',
};
const HEIGHT: Record<number, number> = { [BIOME.MOUNTAIN]: 0.75, [BIOME.ALPINE]: 1, [BIOME.PLATEAU]: 0.45, [BIOME.ICE]: 0.3, [BIOME.TUNDRA]: 0.18 };

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export interface EarthTextures {
  /** Land (1) vs sea (0), blurred at twice the raster's size: the shader cuts coasts out of it. */
  land: THREE.DataTexture;
  color: THREE.DataTexture;
  data: THREE.DataTexture;
  region: THREE.DataTexture;
  lights: THREE.CanvasTexture;
  clouds: THREE.DataTexture;
}

let cached: EarthTextures | null = null;

/** Build the textures once (about a quarter-second on a laptop). Rows run north → south. */
export function earthTextures(lod: MapLod): EarthTextures {
  if (cached) return cached;
  const { W, H } = lod;
  const color = new Uint8Array(W * H * 4);
  const data = new Uint8Array(W * H * 4);
  const region = new Uint8Array(W * H);
  const cols: Record<number, [number, number, number]> = {};
  for (const k of Object.keys(BIOME_COL)) cols[Number(k)] = hex(BIOME_COL[Number(k)]);
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * lod.res;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = lod.biome[i];
      const lon = x * lod.res - 180;
      const land = b !== BIOME.OCEAN && b !== BIOME.LAKE;
      region[i] = lod.region[i];
      const o = i * 4;
      if (land) {
        const c = cols[b] ?? cols[BIOME.TEMPERATE];
        // large soft patches (drier, wetter), finer mottling
        const n1 = fbm(lon * 0.08, lat * 0.08, 3, 3) - 0.5;
        const n2 = noise(lon * 0.6, lat * 0.6, 9) - 0.5;
        const k = 1 + n1 * 0.22 + n2 * 0.06;
        const warm = n1 * 18;
        color[o] = Math.max(0, Math.min(255, c[0] * k + warm));
        color[o + 1] = Math.max(0, Math.min(255, c[1] * k));
        color[o + 2] = Math.max(0, Math.min(255, c[2] * k - warm * 0.5));
        color[o + 3] = 255;
        const hgt = (HEIGHT[b] ?? 0.06) * (0.55 + fbm(lon * 0.3, lat * 0.3, 21, 3) * 0.9);
        data[o + 1] = Math.min(255, hgt * 255);
        data[o + 2] = b === BIOME.ICE ? 255 : 0;
      } else {
        const c = b === BIOME.LAKE ? cols[BIOME.LAKE] : [26, 58, 112];
        color[o] = c[0]; color[o + 1] = c[1]; color[o + 2] = c[2];
        color[o + 3] = b === BIOME.LAKE ? 120 : 0;
        // shallow water near the coast
        const d = lod.coast[i];
        data[o] = Math.max(0, Math.min(255, (1 - (d - 1) / 9) * 255));
        data[o + 1] = 0;
      }
      data[o + 3] = 255;
    }
  }
  // smooth the relief: three 3×3 passes over the height channel
  for (let pass = 0; pass < 3; pass++) {
    const src = data.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      let acc = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const wgt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
        acc += src[(((y + dy) * W + ((x + dx + W) % W)) * 4) + 1] * wgt; n += wgt;
      }
      data[(y * W + x) * 4 + 1] = acc / n;
    }
  }
  // soften biome edges: two 3×3 passes over the land colours (sea pixels stay as they are)
  for (let pass = 0; pass < 2; pass++) {
    const src = color.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] < 200) continue;
      let r = 0, g2 = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = ((y + dy) * W + ((x + dx + W) % W)) * 4;
        if (src[j + 3] < 200) continue;
        const wgt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
        r += src[j] * wgt; g2 += src[j + 1] * wgt; b += src[j + 2] * wgt; n += wgt;
      }
      color[i] = r / n; color[i + 1] = g2 / n; color[i + 2] = b / n;
    }
  }
  // spread land colours a few pixels out to sea (alpha stays 0), so a smooth coast never shows sea colour on land
  for (let pass = 0; pass < 3; pass++) {
    const src = color.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] > 200 || lod.coast[y * W + x] > 4) continue;
      let r = 0, g2 = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const yy = Math.max(0, Math.min(H - 1, y + dy)), xx = (x + dx + W) % W;
        const j = (yy * W + xx) * 4;
        if (src[j + 3] > 200 || (pass > 0 && src[j + 3] === 1)) { r += src[j]; g2 += src[j + 1]; b += src[j + 2]; n++; }
      }
      if (n) { color[i] = r / n; color[i + 1] = g2 / n; color[i + 2] = b / n; color[i + 3] = 1; }
    }
  }
  const tex = (arr: Uint8Array, w: number, h: number, fmt: THREE.PixelFormat, srgb: boolean, nearest = false) => {
    const t = new THREE.DataTexture(arr, w, h, fmt);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    t.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = !nearest;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  // the land field: 2x, a few box-blur passes, so the coastline the shader draws is smooth
  const W2 = W * 2, H2 = H * 2;
  let f = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) f[y * W2 + x] = color[((y >> 1) * W + (x >> 1)) * 4 + 3] > 200 ? 1 : 0;
  for (let pass = 0; pass < 3; pass++) {
    const g = new Float32Array(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const l = y * W2 + ((x - 1 + W2) % W2), r = y * W2 + ((x + 1) % W2);
      g[y * W2 + x] = (f[l] + f[y * W2 + x] * 2 + f[r]) / 4;
    }
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const u = Math.max(0, y - 1) * W2 + x, d = Math.min(H2 - 1, y + 1) * W2 + x;
      f[y * W2 + x] = (g[u] + g[y * W2 + x] * 2 + g[d]) / 4;
    }
  }
  const land8 = new Uint8Array(W2 * H2);
  for (let i = 0; i < f.length; i++) land8[i] = Math.round(f[i] * 255);
  f = new Float32Array(0);
  cached = {
    land: tex(land8, W2, H2, THREE.RedFormat, false),
    color: tex(color, W, H, THREE.RGBAFormat, true),
    data: tex(data, W, H, THREE.RGBAFormat, false),
    region: tex(region, W, H, THREE.RedFormat, false, true),
    lights: cityLights(),
    clouds: cloudMap(),
  };
  return cached;
}

/** City lights: a glow per city, a scatter of towns round each, roads between the big ones. */
function cityLights(): THREE.CanvasTexture {
  const w = 2048, h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const px = (lon: number, lat: number) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h] as const;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [lat, lon, size] of CITIES) {
    const [x, y] = px(lon, lat);
    const r = 0.8 + size * 0.7;
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 2);
    grd.addColorStop(0, `rgba(255,224,170,${0.55 + size * 0.12})`);
    grd.addColorStop(0.5, 'rgba(255,190,120,0.18)');
    grd.addColorStop(1, 'rgba(255,170,100,0)');
    g.fillStyle = grd;
    g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    // suburbs and towns around it, thinning out
    for (let k = 0; k < 14 + size * 18; k++) {
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 1.6) * (3 + size * 4);
      g.fillStyle = `rgba(255,210,150,${0.12 + rnd() * 0.35})`;
      g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 0.8 + rnd() * 0.6, 0.8 + rnd() * 0.6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** 3D value noise (for fields on the sphere, with no seam and no stretching). */
function hash3(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm3(x: number, y: number, z: number, seed: number, oct: number) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f, seed + i * 31); n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}

/** The cloud field: billowy clusters from 3D noise on the sphere, thicker along the storm tracks. */
function cloudMap(): THREE.DataTexture {
  const w = 1024, h = 512;
  const arr = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    const cl = Math.cos(lat * RAD), sl = Math.sin(lat * RAD);
    // the trade-wind belts are clearer, the storm tracks and the tropics' convection cloudier
    const belt = 0.46 + 0.16 * Math.cos(lat * RAD * 4) + (Math.abs(lat) > 68 ? 0.08 : 0);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * 360 - 180;
      const px = cl * Math.cos(lon * RAD), pz = cl * Math.sin(lon * RAD), py = sl;
      // a warp makes the clusters swirl a little
      const wx = fbm3(px * 2 + 7, py * 2, pz * 2, 3, 2) - 0.5, wz = fbm3(px * 2, py * 2 + 5, pz * 2, 4, 2) - 0.5;
      const base = fbm3(px * 3.2 + wx, py * 3.2, pz * 3.2 + wz, 5, 4);
      const puff = fbm3(px * 11 + wx * 2, py * 11, pz * 11 + wz * 2, 9, 3);
      const v = base * 0.72 + puff * 0.28;
      const k = Math.max(0, Math.min(1, (v * belt * 1.9 - 0.56) * 3.6));
      const o = (y * w + x) * 4;
      arr[o] = arr[o + 1] = arr[o + 2] = 255;
      arr[o + 3] = k * 255;
    }
  }
  const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ── materials ────────────────────────────────────────────────────────────────────────────────
export function earthMaterial(t: EarthTextures, W: number, H: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tLand: { value: t.land }, tColor: { value: t.color }, tData: { value: t.data }, tRegion: { value: t.region }, tLights: { value: t.lights }, tClouds: { value: t.clouds },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, cloudShift: { value: 0 }, texel: { value: new THREE.Vector2(1 / W, 1 / H) },
      hoverCode: { value: -1 }, selCode: { value: -1 }, time: { value: 0 }, nightLights: { value: 1 },
      regionTint: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) }, haze: { value: new THREE.Vector4(1, 0.55, 0.3, 0) },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = vec2(uv.x, 1.0 - uv.y); vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tLand, tColor, tData, tRegion, tLights, tClouds; uniform vec3 sunDir; uniform float cloudShift, hoverCode, selCode, time, nightLights; uniform vec2 texel; uniform vec4 regionTint[16]; uniform vec4 haze;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float code(vec2 uv){ return floor(texture2D(tRegion, uv).r * 255.0 + 0.5); }
      void main(){
        // organic biome edges: look the colour up through a little noise warp
        vec2 warp = (vec2(vnoise(vUv * vec2(1800.0, 900.0)), vnoise(vUv * vec2(1800.0, 900.0) + 17.0)) - 0.5) * texel * 2.2
                  + (vec2(vnoise(vUv * vec2(420.0, 210.0) + 5.0), vnoise(vUv * vec2(420.0, 210.0) + 9.0)) - 0.5) * texel * 3.0;
        vec4 col = texture2D(tColor, vUv + warp);
        vec4 dat = texture2D(tData, vUv + warp * 0.6);
        float lf = texture2D(tLand, vUv).r;
        float cut = 0.5 + (vnoise(vUv * vec2(3200.0, 1600.0)) - 0.5) * 0.22 + (vnoise(vUv * vec2(800.0, 400.0)) - 0.5) * 0.18;
        float land = smoothstep(cut - 0.04, cut + 0.04, lf);
        vec3 n = normalize(vN);
        vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n));
        vec3 north = cross(n, east);
        // relief from the height channel
        float h0 = dat.g;
        float hx = texture2D(tData, vUv + vec2(texel.x, 0.0)).g - texture2D(tData, vUv - vec2(texel.x, 0.0)).g;
        float hy = texture2D(tData, vUv - vec2(0.0, texel.y)).g - texture2D(tData, vUv + vec2(0.0, texel.y)).g;
        vec3 N = normalize(n - (east * hx + north * hy) * 0.9 * land);
        float fine = vnoise(vUv * vec2(2400.0, 1200.0)) * 0.08 + vnoise(vUv * vec2(600.0, 300.0)) * 0.1;
        vec3 ground = col.rgb * (0.92 + fine);
        // a sandy rim along the coast
        ground = mix(ground, vec3(0.83, 0.74, 0.52), (1.0 - smoothstep(cut + 0.04, cut + 0.16, lf)) * 0.55);
        vec3 deep = vec3(0.012, 0.045, 0.13), shallow = vec3(0.05, 0.30, 0.42);
        float shal = max(pow(dat.r, 1.6), smoothstep(cut - 0.32, cut, lf) * 0.8);
        vec3 sea = mix(deep, shallow, shal) * (0.95 + vnoise(vUv * vec2(900.0, 450.0)) * 0.08);
        vec3 alb = mix(sea, ground, land);
        // region borders and the hovered / selected region
        float c0 = code(vUv);
        // Act IV–V: provinces tinted by who runs them, garden green or forge grey
        for (int i = 0; i < 16; i++) if (float(i) == c0) alb = mix(alb, regionTint[i].rgb * (0.8 + fine), regionTint[i].a * land);
        // the hovered / selected region: a soft fill with a brighter rim
        if (hoverCode > 0.0 || selCode > 0.0) {
          float want = c0 == selCode ? selCode : hoverCode;
          float inside = 0.0;
          for (int k = 0; k < 8; k++) {
            float a = float(k) * 0.785;
            inside += code(vUv + vec2(cos(a), sin(a)) * texel * 2.5) == want ? 1.0 : 0.0;
          }
          inside /= 8.0;
          float mine = c0 == want ? 1.0 : 0.0;
          float rim = mine * (1.0 - inside);
          vec3 tint = want == selCode ? vec3(1.0, 0.84, 0.45) : vec3(1.0, 0.95, 0.82);
          alb = mix(alb, tint, (mine * 0.13 + rim * 0.5) * land);
        }
        // light: a soft terminator with a warm band, clouds' shadows
        float d = dot(N, sunDir);
        float dn = dot(n, sunDir);
        float lit = smoothstep(-0.08, 0.35, d);
        vec2 cuv = vUv + vec2(cloudShift, 0.0) - sunDir.xz * 0.002;
        float cs = texture2D(tClouds, cuv).a;
        lit *= 1.0 - cs * 0.45;
        vec3 warm = mix(vec3(1.0, 0.55, 0.32), vec3(1.0), smoothstep(0.0, 0.3, dn));
        vec3 c = alb * (lit * warm * 1.15 + vec3(0.05, 0.065, 0.12));
        // the sea's glint
        vec3 V = normalize(cameraPosition - vW);
        vec3 Hh = normalize(sunDir + V);
        float spec = pow(max(dot(n, Hh), 0.0), 220.0) * (1.0 - land) * smoothstep(0.0, 0.2, dn);
        c += vec3(1.0, 0.9, 0.75) * spec * 0.45;
        // city lights on the night side
        float night = 1.0 - smoothstep(-0.12, 0.08, dn);
        float li = texture2D(tLights, vUv).r * land * night * nightLights;
        c += vec3(1.0, 0.72, 0.38) * li * 1.6;
        // waste heat: a warm haze over the whole day side
        c = mix(c, haze.rgb * lit, haze.a * 0.35);
        // haze over the surface towards the limb (day side)
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        c = mix(c, vec3(0.45, 0.68, 1.0) * smoothstep(-0.1, 0.4, dn), rim * 0.55);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function cloudMaterial(t: EarthTextures) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tClouds: { value: t.clouds }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, cloudShift: { value: 0 }, opacity: { value: 0.85 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = vec2(uv.x, 1.0 - uv.y); vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tClouds; uniform vec3 sunDir; uniform float cloudShift, opacity; varying vec2 vUv; varying vec3 vN;
      void main(){
        float a = texture2D(tClouds, vUv + vec2(cloudShift, 0.0)).a;
        float dn = dot(normalize(vN), sunDir);
        float lit = smoothstep(-0.15, 0.4, dn);
        vec3 c = mix(vec3(0.05, 0.06, 0.12), mix(vec3(1.0, 0.7, 0.55), vec3(1.0), smoothstep(0.0, 0.35, dn)), lit) * 0.9;
        gl_FragColor = vec4(c, a * opacity * (0.35 + 0.65 * lit));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** The halo round the limb: a back-face shell, brightest at the Earth's edge, fading to nothing at the shell's. */
export function atmosphereMaterial(shell = 1.1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, edge: { value: Math.sqrt(1 - 1 / (shell * shell)) } },
    vertexShader: `varying vec3 vNV; varying vec3 vN; void main(){ vN = normalize(position); vNV = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 sunDir; uniform float edge; varying vec3 vNV; varying vec3 vN;
      void main(){
        float t = clamp(-vNV.z / edge, 0.0, 1.0);
        float glow = pow(t, 2.4);
        float dn = dot(normalize(vN), sunDir);
        vec3 c = mix(vec3(1.0, 0.45, 0.25), vec3(0.32, 0.6, 1.0), smoothstep(-0.1, 0.4, dn)) * smoothstep(-0.4, 0.1, dn);
        gl_FragColor = vec4(c * glow * 1.3, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
