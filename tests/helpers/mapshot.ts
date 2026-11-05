/**
 * Headless snapshots of the live MapScene: walks its display tree and composites every visible
 * sprite (through the indexed canvas behind its texture) and every Graphics rect into RGBA, so
 * previews show exactly what the game draws: decluttered markers, laid-out labels, region names.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { paletteTable } from '../../src/render/palette';
import { canvasOf } from '../../src/render/textures';
import { encodePngRgba } from '../../tools/lib/png';

const fakeCanvas = () => ({
  width: 0, height: 0, style: {},
  addEventListener() {}, removeEventListener() {},
  getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage() {} }),
  toDataURL: () => 'data:',
});

/** Enough of a DOM for the MapScene to build its textures in Node. */
export function fakeDom() {
  (globalThis as any).document ??= { createElement: fakeCanvas, documentElement: { style: { setProperty() {} } } };
  (globalThis as any).window ??= globalThis;
}

export interface Shot {
  w: number;
  h: number;
  rgba: Uint8Array;
}

/** Composite a scene's root into a w×h RGBA image (internal pixels, no stage scaling). */
export function snapshot(root: Container, w: number, h: number, background = [11, 10, 18]): Shot {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = background[0];
    rgba[i * 4 + 1] = background[1];
    rgba[i * 4 + 2] = background[2];
    rgba[i * 4 + 3] = 255;
  }
  const pal = paletteTable();
  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
    const o = (y * w + x) * 4;
    rgba[o] = Math.round(rgba[o] * (1 - a) + r * a);
    rgba[o + 1] = Math.round(rgba[o + 1] * (1 - a) + g * a);
    rgba[o + 2] = Math.round(rgba[o + 2] * (1 - a) + b * a);
  };
  const walk = (node: Container, ox: number, oy: number, alpha: number) => {
    if (!node.visible || node.alpha <= 0) return;
    const x0 = ox + Math.round(node.x);
    const y0 = oy + Math.round(node.y);
    const a0 = alpha * node.alpha;
    if (node instanceof Sprite) {
      const hit = canvasOf(node.texture);
      if (hit) {
        const { pc } = hit;
        const tint = node.tint;
        const tr = ((tint >> 16) & 255) / 255;
        const tg = ((tint >> 8) & 255) / 255;
        const tb = (tint & 255) / 255;
        const a = a0 * (hit.alpha / 255);
        // skip whole sprites that can't touch the frame
        if (x0 + pc.w >= 0 && y0 + pc.h >= 0 && x0 < w && y0 < h) {
          for (let j = 0; j < pc.h; j++) {
            for (let i = 0; i < pc.w; i++) {
              const c = pc.data[j * pc.w + i];
              if (!c) continue;
              put(x0 + i, y0 + j, pal[c * 4] * tr, pal[c * 4 + 1] * tg, pal[c * 4 + 2] * tb, a);
            }
          }
        }
      }
    } else if (node instanceof Graphics) {
      for (const ins of node.context.instructions as any[]) {
        if (ins.action !== 'fill') continue;
        const col = ins.data.style.color as number;
        const a = a0 * (ins.data.style.alpha ?? 1);
        for (const p of ins.data.path.instructions as any[]) {
          if (p.action !== 'rect') continue;
          const [rx, ry, rw, rh] = p.data as number[];
          for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) put(x0 + rx + i, y0 + ry + j, (col >> 16) & 255, (col >> 8) & 255, col & 255, a);
        }
      }
    }
    // Pixi sorts zIndex'd children (stably) when it renders; do the same here
    const kids = node.sortableChildren ? [...node.children].sort((a, b) => a.zIndex - b.zIndex) : node.children;
    for (const ch of kids) walk(ch as Container, x0, y0, a0);
  };
  walk(root, 0, 0, 1);
  return { w, h, rgba };
}

export function cropShot(s: Shot, x: number, y: number, w: number, h: number): Shot {
  const rgba = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = Math.min(s.w - 1, Math.max(0, x + i));
      const sy = Math.min(s.h - 1, Math.max(0, y + j));
      rgba.set(s.rgba.subarray((sy * s.w + sx) * 4, (sy * s.w + sx) * 4 + 4), (j * w + i) * 4);
    }
  }
  return { w, h, rgba };
}

/**
 * A live MapScene for a state (no clouds or night shade, reduced motion), with a fake game
 * around it. `hover`/`selection` are site ids.
 */
export async function liveMap(state: unknown, opts: { lod?: number; hover?: string; selection?: string; w?: number; h?: number } = {}) {
  fakeDom();
  const { MapScene } = await import('../../src/render/worldMap/mapScene');
  const { loadWorld } = await import('./world');
  const game: any = {
    world: loadWorld(), state, view: state, mode: 'map',
    hover: opts.hover ? { kind: 'site', id: opts.hover, clientX: 0, clientY: 0 } : null,
    selection: opts.selection ? { kind: 'site', id: opts.selection } : null,
    tool: null,
    settings: { clouds: false, dayNight: false, reducedMotion: true, wheel: 'zoom' },
    stage: { scale: 3, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
    dayFraction: () => 0.5, setHover() {}, select() {}, linkClick() {}, enterDiorama() {},
  };
  const scene = new MapScene(game);
  scene.resize(opts.w ?? 640, opts.h ?? 360);
  if (opts.lod) scene.zoomIn();
  const frames = (n = 3) => {
    for (let i = 0; i < n; i++) scene.update(1 / 60, i * 16);
  };
  /** What the scene draws over a rect of map pixels (at its LOD), with the camera moved over it. */
  const crop = (x: number, y: number, w: number, h: number): Shot => {
    const sc = scene as any;
    const res = sc.lod.res;
    scene.centreOn((x + w / 2) * res - 180, 90 - (y + h / 2) * res);
    frames();
    const cx = Math.floor(sc.camX);
    const cy = Math.floor(sc.camY);
    const W = sc.lod.W;
    const ox = x - cx + Math.round((cx + sc.vw / 2 - x - w / 2) / W) * W;
    return cropShot(snapshot(sc.root, sc.vw, sc.vh), ox, y - cy, w, h);
  };
  return { scene, game, sc: scene as any, frames, crop };
}

/** PNG of a shot, upscaled by a whole number. */
export function shotPng(s: Shot, scale = 1): Buffer {
  const W = s.w * scale;
  const H = s.h * scale;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = (Math.floor(y / scale) * s.w + Math.floor(x / scale)) * 4;
      out.set(s.rgba.subarray(si, si + 4), (y * W + x) * 4);
    }
  }
  return encodePngRgba(W, H, out);
}
