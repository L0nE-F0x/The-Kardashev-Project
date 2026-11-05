/**
 * Orbit-view sprites: orbital data centres, space-solar stations, their construction frames and
 * a little launch vehicle. Palette keys into PixelCanvases (the scene caches them as textures).
 */
import { C, type ColorKey } from '../palette';
import { PixelCanvas } from '../pixels';

type Keys = Record<string, ColorKey | null>;

/** The orbit view asks for these every frame (for their sizes too): paint each one once. Never mutate them. */
const painted = new Map<string, PixelCanvas>();
function once(key: string, paint: () => PixelCanvas): PixelCanvas {
  let pc = painted.get(key);
  if (!pc) painted.set(key, (pc = paint()));
  return pc;
}

function framed(pc: PixelCanvas, outline: number = C.ink0): PixelCanvas {
  const out = new PixelCanvas(pc.w + 2, pc.h + 2);
  out.blit(pc, 1, 1);
  out.outline(outline);
  return out;
}

/** Dotted construction frame round a sprite's silhouette, filled from the left up to `progress`. */
function scaffold(src: PixelCanvas, progress: number): PixelCanvas {
  const out = new PixelCanvas(src.w, src.h);
  const fill = Math.round(progress * src.w);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (!c || c === C.ink0) continue;
      if (x < fill) out.set(x, y, c);
      else if ((x + y) % 2 === 0) out.set(x, y, C.ink6);
    }
  }
  // a welding spark at the build front
  if (fill > 0 && fill < src.w) out.set(fill, Math.floor(src.h / 2), C.yel2);
  return framed(out);
}

const ODC = `
  bc.aaa.bc
  cbeadaebc
  bc.aaa.bc
  ...f.f...
`;
const ODC_KEYS: Keys = { a: 'ink7', b: 'blu5', c: 'blu3', d: 'cyn5', e: 'ink8', f: 'ink9' };

/** An orbital data centre: a lit rack between two solar wings, white radiator fins trailing. */
export function odcCanvas(): PixelCanvas {
  return once('odc', () => framed(PixelCanvas.from(ODC, ODC_KEYS)));
}

/** An orbital data centre under construction. */
export function odcFrameCanvas(progress: number): PixelCanvas {
  return once(`odcf:${progress}`, () => scaffold(PixelCanvas.from(ODC, ODC_KEYS), progress));
}

const SPS = `
  yzyzyzy.yzyzyzy
  zyzyzyzazyzyzyz
  yzyzyzy.yzyzyzy
  .......a.......
  ......bdb......
`;
const SPS_SMALL = `
  yzyzy.yzyzy
  zzzzzazzzzz
  yzyzy.yzyzy
  .....a.....
  ....bdb....
`;
const SPS_KEYS: Keys = { y: 'yel1', z: 'org2', a: 'ink8', b: 'ink9', d: 'pnk1' };

/** A space-solar station: two gold arrays on a truss, the microwave dish facing Earth. */
export function spsCanvas(big: boolean): PixelCanvas {
  return once(`sps:${big}`, () => framed(PixelCanvas.from(big ? SPS : SPS_SMALL, SPS_KEYS)));
}

export function spsFrameCanvas(big: boolean, progress: number): PixelCanvas {
  return once(`spsf:${big}:${progress}`, () => scaffold(PixelCanvas.from(big ? SPS : SPS_SMALL, SPS_KEYS), progress));
}

// ── Act V: foundries at the Lagrange points, habitats ───────────────────────────────────────
/**
 * A foundry yard at an Earth–Moon Lagrange point (size 0..2 for more output): a hub with its
 * furnace glowing, a spine out to two gold solar wings, manipulator arms with welding tips, finished
 * collector sheets stacked beside it and, on the bigger yards, a copy of itself growing in a
 * dotted scaffold (the foundries build foundries).
 */
export function foundryCanvas(size: number): PixelCanvas {
  return once(`foundry:${size}`, () => paintFoundry(size));
}

function paintFoundry(size: number): PixelCanvas {
  const z = Math.max(0, Math.min(2, size));
  const W = [13, 17, 23][z];
  const H = [7, 9, 13][z];
  const pc = new PixelCanvas(W, H);
  const cy = z === 2 ? 5 : Math.floor(H / 2);
  const cx = Math.floor(W / 2);
  const wing = z + 2;
  // the solar wings and the spine between them
  for (let x = 0; x < wing; x++) {
    for (let y = cy - 2 - (z > 0 ? 1 : 0); y <= cy + 2 + (z > 0 ? 1 : 0); y++) {
      const c = (x + y) % 2 ? C.yel1 : C.org2;
      pc.set(x, y, c);
      pc.set(W - 1 - x, y, c);
    }
  }
  pc.hline(wing, cy, W - wing * 2, C.ink6);
  // the hub and its furnace
  pc.ellipse(cx + 0.5, cy + 0.5, 2.2 + z * 0.6, 1.8 + z * 0.4, C.ink8);
  pc.set(cx - 1 - z, cy - 1, C.white);
  pc.set(cx, cy, C.yel2);
  pc.set(cx + 1, cy, C.org1);
  if (z > 0) pc.set(cx, cy + 1, C.org1);
  // manipulator arms, welding at the tips
  pc.line(cx - 2, cy - 1, cx - 3 - z, cy - 2 - z, C.ink7);
  pc.set(cx - 3 - z, cy - 3 - z, C.yel2);
  pc.line(cx + 2, cy + 1, cx + 3 + z, cy + 2 + Math.min(1, z), C.ink7);
  // finished collector sheets stacked above the spine
  for (let k = 0; k <= z; k++) pc.hline(cx + 2, cy - 2 - k * 2, 3 + z, k % 2 ? C.yel0 : C.org2);
  // the copy it's building: a dotted scaffold hub with half its wing
  if (z === 2) {
    const sy = H - 3;
    for (let x = cx - 6; x <= cx + 2; x++) if ((x + sy) % 2 === 0) pc.set(x, sy, C.ink5);
    pc.ellipse(cx - 2.5, sy + 0.5, 1.6, 1.2, C.ink6);
    pc.set(cx - 3, sy, C.org1);
    for (let y = sy - 1; y <= sy + 1; y++) pc.set(cx - 7, y, y % 2 ? C.yel0 : C.ink5);
  }
  return framed(pc);
}

const HABITAT = `
  ..abbbbbbbba..
  .acgggdgggdca.
  acdgggdgggdgca
  .acgggdgggdca.
  ..abbbbbbbba..
`;

/** A habitat cylinder side on: end caps catching the sun, a lit band of fields and windows. */
export function habitatCylCanvas(): PixelCanvas {
  return once('habitatCyl', () => framed(PixelCanvas.from(HABITAT, { a: 'ink6', b: 'ink8', c: 'white', g: 'grn6', d: 'cyn5' })));
}
