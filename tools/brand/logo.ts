/**
 * The logo as a 3D wordmark (public/logo.png): the pixel logo's composition (THE small in teal, KARDASHEV big in a
 * sunrise ramp with deep purple depth, the dotted K-scale line at 0.73, PROJECT letter-spaced in teal, a little sun
 * top right) built from extruded, bevelled letters, lit from the upper left, on a transparent background.
 * Letter outlines: tools/brand/glyphs.json (Inter Black / Bold, see glyphs.py). Run by tools/gen-assets.ts in
 * headless Chrome; `renderLogo()` returns a PNG data URL.
 *
 * The frame is the old logo's 121×41 art pixels (x right, y down), so every layout that held the pixel logo holds
 * this one: the letters start 8 units in from the left, as before.
 */
import * as THREE from 'three';
import { PALETTE } from '../../src/render/palette';
import glyphData from './glyphs.json';

type Cmd = [string, ...number[]];
interface Cut {
  capHeight: number;
  glyphs: Record<string, { adv: number; path: Cmd[] }>;
  advances: Record<string, number[]>;
}
const CUTS = glyphData as unknown as { big: Cut; small: Cut };

export const FRAME_W = 121;
export const FRAME_H = 41;

/** Everything worth tuning by eye. */
export const LOOK = {
  // KARDASHEV: left edge, baseline (frame units, y down), width, tracking (em/1000), depth and bevel in cap heights
  bigX: 8.2,
  bigBase: 25.6,
  bigW: 103.2,
  bigTrack: 6,
  bigDepth: 0.44,
  bigBevel: 0.05,
  // 1 = a smooth sunrise, towards 0 = the pixel logo's hard bands
  rampSoft: 0.16,
  // the small words: cap height, baselines, PROJECT's letter gap in cap heights
  smallCap: 4.25,
  theBase: 7.6,
  projBase: 37.3,
  projGap: 1.02,
  smallDepth: 0.2,
  smallBevel: 0.05,
  // the dotted K-scale line
  dotPitch: 2.06,
  dotR: 0.5,
  dotFill: 0.73,
  // the sun
  sunX: 110.6,
  sunY: 5.2,
  sunR: 2.7,
  // an oblique view: the faces stay square to the picture, the depth runs right and down as in the pixel logo
  // (how far a point moves per unit of depth)
  shearX: 0.2,
  shearY: 0.36,
  // light
  key: 3.1,
  rim: 2.2,
  fill: 1.35,
  // the baked shadow (frame units)
  shadowBlur: 1.1,
  shadowDx: 0.5,
  shadowDy: 0.9,
  shadowAlpha: 0.55,
};

/**
 * The sunrise on the big letters, bottom to top: the pixel logo's bands (cream, two golds, three oranges) with a
 * magenta one underneath. Each entry is a band's middle; `rampSoft` says how hard the edges between them are.
 */
const RAMP: [number, string][] = [
  [0.06, '#c4357a'],
  [0.2, PALETTE.org0],
  [0.35, PALETTE.org1],
  [0.5, PALETTE.org2],
  [0.645, PALETTE.yel0],
  [0.795, PALETTE.yel1],
  [0.935, PALETTE.yel2],
];

function shapesOf(cut: Cut, text: string, track: number, gap = 0): { shapes: THREE.Shape[]; width: number } {
  const path = new THREE.ShapePath();
  const adv = cut.advances[text.replace(/ /g, '')];
  let x = 0;
  let last = 0;
  [...text].forEach((ch, i) => {
    const g = cut.glyphs[ch];
    for (const c of g.path) {
      if (c[0] === 'M') path.moveTo(c[1] + x, c[2]);
      else if (c[0] === 'L') path.lineTo(c[1] + x, c[2]);
      else if (c[0] === 'Q') path.quadraticCurveTo(c[1] + x, c[2], c[3] + x, c[4]);
      else if (c[0] === 'C') path.bezierCurveTo(c[1] + x, c[2], c[3] + x, c[4], c[5] + x, c[6]);
    }
    last = x + g.adv;
    x += (adv?.[i] ?? g.adv) + track + gap;
  });
  return { shapes: path.toShapes(), width: last };
}

/** Extruded letters with the front face at z = 0 and the body behind it, scaled so the caps are `cap` tall. */
function word(cut: Cut, text: string, o: { cap: number; track?: number; gap?: number; depth: number; bevel: number; mat: THREE.Material }) {
  const k = o.cap / cut.capHeight;
  const { shapes } = shapesOf(cut, text, ((o.track ?? 0) * 2048) / 1000, (o.gap ?? 0) * cut.capHeight);
  const depth = (o.depth * o.cap) / k;
  const bevel = (o.bevel * o.cap) / k;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: depth - bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: 28 });
  geo.translate(0, 0, -depth); // the front face on z = 0
  geo.scale(k, k, k);
  geo.computeBoundingBox();
  return new THREE.Mesh(geo, o.mat);
}

/**
 * A matte painted material whose colour depends on where the surface is: the face and its bevel take a vertical
 * ramp, the walls behind take the depth colour (darker to the back).
 */
function paint(o: { ramp: [number, string][]; soft?: number; y0: number; y1: number; wall: string; wallBack: string; bevel: number; depth: number; rough?: number }) {
  const mat = new THREE.MeshStandardMaterial({ roughness: o.rough ?? 0.62, metalness: 0 });
  const stops = o.ramp.map(([t, c]) => ({ t, c: new THREE.Color(c) }));
  const soft = Math.max(0.02, o.soft ?? 1);
  // the ramp is written into the shader, so each ramp is its own program
  mat.customProgramCacheKey = () => JSON.stringify([o.ramp, soft]);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uY = { value: new THREE.Vector2(o.y0, o.y1) };
    sh.uniforms.uWall = { value: new THREE.Color(o.wall) };
    sh.uniforms.uWallBack = { value: new THREE.Color(o.wallBack) };
    sh.uniforms.uZ = { value: new THREE.Vector2(o.bevel, o.depth) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    const ramp = stops
      .slice(1)
      .map((s, i) => {
        // soft = 1: a smooth ramp from the stop below; soft → 0: a band that starts halfway between the two
        const mid = (stops[i].t + s.t) / 2;
        const half = ((s.t - stops[i].t) / 2) * soft;
        return `c = mix(c, vec3(${s.c.r.toFixed(4)}, ${s.c.g.toFixed(4)}, ${s.c.b.toFixed(4)}), smoothstep(${(mid - half).toFixed(4)}, ${(mid + half).toFixed(4)}, t));`;
      })
      .join('\n');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec2 uY;\nuniform vec2 uZ;\nuniform vec3 uWall;\nuniform vec3 uWallBack;')
      .replace(
        '#include <color_fragment>',
        `float t = clamp((vObj.y - uY.x) / (uY.y - uY.x), 0.0, 1.0);
         vec3 c = vec3(${stops[0].c.r.toFixed(4)}, ${stops[0].c.g.toFixed(4)}, ${stops[0].c.b.toFixed(4)});
         ${ramp}
         float wall = smoothstep(uZ.x * 0.96, uZ.x * 1.12, -vObj.z);
         vec3 w = mix(uWall, uWallBack, smoothstep(uZ.x, uZ.y, -vObj.z));
         diffuseColor.rgb = mix(c, w, wall);`,
      );
  };
  return mat;
}

export interface LogoOptions {
  /** Output pixels per frame unit (12 → 1452×492). */
  scale?: number;
  /** Supersampling factor (whole number). */
  ss?: number;
  look?: Partial<typeof LOOK>;
}

export async function renderLogo(opts: LogoOptions = {}): Promise<string> {
  const L = { ...LOOK, ...opts.look };
  const scale = opts.scale ?? 12;
  const ss = opts.ss ?? 3;
  const W = FRAME_W * scale;
  const H = FRAME_H * scale;

  const scene = new THREE.Scene();
  // frame units, y up: a frame point (x, y) sits at (x, FRAME_H - y)
  const Y = (y: number) => FRAME_H - y;

  // ── KARDASHEV
  const big = CUTS.big;
  const probe = shapesOf(big, 'KARDASHEV', (L.bigTrack * 2048) / 1000);
  const cap = (L.bigW / probe.width) * big.capHeight;
  const bigMat = paint({ ramp: RAMP, soft: L.rampSoft, y0: -0.02 * cap, y1: 1.02 * cap, wall: PALETTE.vio3, wallBack: PALETTE.vio1, bevel: L.bigBevel * cap, depth: L.bigDepth * cap, rough: 0.42 });
  const kard = word(big, 'KARDASHEV', { cap, track: L.bigTrack, depth: L.bigDepth, bevel: L.bigBevel, mat: bigMat });
  kard.position.set(L.bigX - kard.geometry.boundingBox!.min.x, Y(L.bigBase), 0);
  scene.add(kard);
  const left = L.bigX;
  const right = L.bigX + (kard.geometry.boundingBox!.max.x - kard.geometry.boundingBox!.min.x);

  // ── THE and PROJECT
  const teal: [number, string][] = [
    [0, PALETTE.cyn4],
    [0.45, PALETTE.cyn5],
    [1, PALETTE.cyn6],
  ];
  const tealMat = () => paint({ ramp: teal, y0: 0, y1: L.smallCap, wall: PALETTE.cyn2, wallBack: PALETTE.cyn0, bevel: L.smallBevel * L.smallCap, depth: L.smallDepth * L.smallCap, rough: 0.6 });
  const the = word(CUTS.small, 'THE', { cap: L.smallCap, track: 90, depth: L.smallDepth, bevel: L.smallBevel, mat: tealMat() });
  the.position.set(left - the.geometry.boundingBox!.min.x, Y(L.theBase), 0);
  scene.add(the);
  const proj = word(CUTS.small, 'PROJECT', { cap: L.smallCap, gap: L.projGap, depth: L.smallDepth, bevel: L.smallBevel, mat: tealMat() });
  const pb = proj.geometry.boundingBox!;
  proj.position.set(right - pb.max.x, Y(L.projBase), 0);
  scene.add(proj);
  const projLeft = right - (pb.max.x - pb.min.x);

  // ── the dotted line: the K scale, lit up to 0.73
  {
    const y = Y(L.projBase - L.smallCap / 2);
    const end = projLeft - 3.4;
    const n = Math.floor((end - left) / L.dotPitch) + 1;
    const geo = new THREE.SphereGeometry(L.dotR, 20, 12);
    geo.scale(1, 1, 0.7);
    const on = new THREE.MeshStandardMaterial({ color: PALETTE.cyn5, roughness: 0.5, emissive: PALETTE.cyn3, emissiveIntensity: 0.35 });
    const off = new THREE.MeshStandardMaterial({ color: PALETTE.ink7, roughness: 0.7 });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, i < Math.round(n * L.dotFill) ? on : off);
      m.position.set(left + L.dotR + i * L.dotPitch, y, -L.dotR * 0.5);
      scene.add(m);
    }
  }

  // ── the sun
  const sun = new THREE.Mesh(new THREE.SphereGeometry(L.sunR, 48, 32), new THREE.MeshStandardMaterial({ color: PALETTE.yel0, roughness: 0.5, emissive: PALETTE.yel0, emissiveIntensity: 0.62 }));
  sun.position.set(L.sunX, Y(L.sunY), -L.sunR);
  scene.add(sun);

  // ── light: a warm key from the upper left, a cool rim from the lower right behind, a soft sky/ground fill
  const key = new THREE.DirectionalLight('#fff3df', L.key);
  key.position.set(-0.5, 0.8, 1);
  const rim = new THREE.DirectionalLight('#8fb4ff', L.rim);
  rim.position.set(0.9, -0.5, -0.15);
  const low = new THREE.DirectionalLight('#ff9c7a', L.fill * 0.5);
  low.position.set(0.2, -0.8, 0.6);
  scene.add(key, rim, low, new THREE.HemisphereLight('#fff6ea', '#5a3f88', L.fill));

  // ── camera: square on, with the depth sheared right and down (a cabinet projection), so baselines stay level
  const cam = new THREE.OrthographicCamera(-FRAME_W / 2, FRAME_W / 2, FRAME_H / 2, -FRAME_H / 2, -200, 200);
  cam.position.set(FRAME_W / 2, FRAME_H / 2, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  cam.projectionMatrix.multiply(new THREE.Matrix4().set(1, 0, -L.shearX, 0, 0, 1, L.shearY, 0, 0, 0, 1, 0, 0, 0, 0, 1));
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W * ss, H * ss, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NoToneMapping;
  // twice: on a renderer's first frame, materials that share one program with an earlier material draw nothing
  renderer.render(scene, cam);
  renderer.render(scene, cam);

  // ── down to size (box filter), then the shadow and the sun's glow underneath
  const big2d = document.createElement('canvas');
  big2d.width = W * ss;
  big2d.height = H * ss;
  const bctx = big2d.getContext('2d', { willReadFrequently: true })!;
  bctx.drawImage(renderer.domElement, 0, 0);
  const art = boxDown(bctx.getImageData(0, 0, W * ss, H * ss), ss);
  const artCanvas = document.createElement('canvas');
  artCanvas.width = W;
  artCanvas.height = H;
  artCanvas.getContext('2d')!.putImageData(art, 0, 0);

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  // the shadow: the art's silhouette in near-black violet, blurred, a little down and right
  const sh = document.createElement('canvas');
  sh.width = W;
  sh.height = H;
  const sctx = sh.getContext('2d')!;
  sctx.filter = `blur(${L.shadowBlur * scale}px)`;
  sctx.drawImage(artCanvas, L.shadowDx * scale, L.shadowDy * scale);
  sctx.filter = 'none';
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#07050f';
  sctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = L.shadowAlpha;
  ctx.drawImage(sh, 0, 0);
  ctx.globalAlpha = 1;
  // the sun's glow
  const p = new THREE.Vector3(L.sunX, Y(L.sunY), -L.sunR).project(cam);
  const gx = ((p.x + 1) / 2) * W;
  const gy = ((1 - p.y) / 2) * H;
  const gr = L.sunR * scale * 2.0;
  const glow = ctx.createRadialGradient(gx, gy, L.sunR * scale * 0.7, gx, gy, gr);
  glow.addColorStop(0, 'rgb(251 190 96 / 0.6)');
  glow.addColorStop(0.45, 'rgb(240 138 70 / 0.2)');
  glow.addColorStop(1, 'rgb(240 138 70 / 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  ctx.drawImage(artCanvas, 0, 0);

  renderer.dispose();
  renderer.forceContextLoss();
  return out.toDataURL('image/png');
}

/** Average whole blocks of `f`×`f` pixels, weighting colour by alpha (no dark fringes on the transparent edge). */
export function boxDown(src: ImageData, f: number): ImageData {
  if (f === 1) return src;
  const w = Math.floor(src.width / f);
  const h = Math.floor(src.height / f);
  const out = new ImageData(w, h);
  const s = src.data;
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < f; j++) {
        let i = ((y * f + j) * src.width + x * f) * 4;
        for (let k = 0; k < f; k++, i += 4) {
          const al = s[i + 3];
          r += s[i] * al;
          g += s[i + 1] * al;
          b += s[i + 2] * al;
          a += al;
        }
      }
      const q = (y * w + x) * 4;
      if (a > 0) {
        o[q] = Math.round(r / a);
        o[q + 1] = Math.round(g / a);
        o[q + 2] = Math.round(b / a);
        o[q + 3] = Math.round(a / (f * f));
      }
    }
  }
  return out;
}

(window as unknown as { renderLogo: typeof renderLogo }).renderLogo = renderLogo;
