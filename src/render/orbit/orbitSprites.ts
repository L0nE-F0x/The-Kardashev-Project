/**
 * Orbit-view sprites: orbital data centres, space-solar stations, their construction frames and
 * a little launch vehicle. Palette keys into PixelCanvases (the scene caches them as textures).
 */
import { C, type ColorKey } from '../palette';
import { PixelCanvas } from '../pixels';

type Keys = Record<string, ColorKey | null>;

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
  return framed(PixelCanvas.from(ODC, ODC_KEYS));
}

/** An orbital data centre under construction. */
export function odcFrameCanvas(progress: number): PixelCanvas {
  return scaffold(PixelCanvas.from(ODC, ODC_KEYS), progress);
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
  return framed(PixelCanvas.from(big ? SPS : SPS_SMALL, SPS_KEYS));
}

export function spsFrameCanvas(big: boolean, progress: number): PixelCanvas {
  return scaffold(PixelCanvas.from(big ? SPS : SPS_SMALL, SPS_KEYS), progress);
}
