import { CanvasSource, Texture } from 'pixi.js';
import { onEraChange } from './palette';
import { bakeInto, PixelCanvas } from './pixels';
import { drawText, measureText } from './font';

interface Entry {
  pc: PixelCanvas;
  canvas: HTMLCanvasElement;
  texture: Texture;
  alpha: number;
}

const registry = new Set<Entry>();
const byKey = new Map<string, Texture>();

/**
 * Bake an indexed PixelCanvas into a nearest-filtered Pixi texture. The texture is registered
 * so an era change re-bakes it in place (same Texture object, new colours).
 */
export function textureOf(pc: PixelCanvas, alpha = 255): Texture {
  const canvas = document.createElement('canvas');
  bakeInto(pc, canvas, alpha);
  const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest', autoGenerateMipmaps: false });
  const texture = new Texture({ source });
  registry.add({ pc, canvas, texture, alpha });
  return texture;
}

/** Memoised variant for sprites drawn once by a factory. */
export function cachedTexture(key: string, make: () => PixelCanvas, alpha = 255): Texture {
  let t = byKey.get(key);
  if (!t) {
    t = textureOf(make(), alpha);
    byKey.set(key, t);
  }
  return t;
}

/** Update a registered texture after its PixelCanvas changed. */
export function refreshTexture(texture: Texture): void {
  for (const e of registry) {
    if (e.texture === texture) {
      bakeInto(e.pc, e.canvas, e.alpha);
      texture.source.update();
      return;
    }
  }
}

/** Drop a texture from the registry and free GPU memory. */
export function releaseTexture(texture: Texture): void {
  for (const e of registry) {
    if (e.texture === texture) {
      registry.delete(e);
      break;
    }
  }
  for (const [k, t] of byKey) if (t === texture) byKey.delete(k);
  texture.destroy(true);
}

onEraChange(() => {
  for (const e of registry) {
    bakeInto(e.pc, e.canvas, e.alpha);
    e.texture.source.update();
  }
});

/** A text label in the 3×5 font with an optional 1px outline. */
export function labelTexture(text: string, color: number, outline: number | null): Texture {
  const key = `label:${text}:${color}:${outline}`;
  return cachedTexture(key, () => {
    const pad = outline === null ? 0 : 1;
    const pc = new PixelCanvas(measureText(text) + pad * 2, 5 + pad * 2);
    drawText(pc, text, pad, pad, color);
    if (outline !== null) pc.outline(outline, true);
    return pc;
  });
}
