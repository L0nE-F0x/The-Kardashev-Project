import { BufferImageSource, Texture } from 'pixi.js';
import { onEraChange } from './palette';
import { bakeRgba, PixelCanvas } from './pixels';
import { drawText, measureText } from './font';

interface Entry {
  pc: PixelCanvas;
  /** The baked RGBA pixels: the texture's own resource (no canvas), re-baked in place and uploaded from here. */
  rgba: Uint8Array;
  texture: Texture;
  alpha: number;
  /** The cachedTexture key, if it has one. */
  key: string | null;
}

/** Every live texture, by texture (an era change walks them all). */
const registry = new Map<Texture, Entry>();
const byKey = new Map<string, Texture>();

/**
 * Bake an indexed PixelCanvas into a nearest-filtered Pixi texture. The texture is registered
 * so an era change re-bakes it in place (same Texture object, new colours).
 */
export function textureOf(pc: PixelCanvas, alpha = 255): Texture {
  const rgba = new Uint8Array(pc.w * pc.h * 4);
  bakeRgba(pc, rgba, alpha);
  const source = new BufferImageSource({ resource: rgba, width: pc.w, height: pc.h, format: 'rgba8unorm', scaleMode: 'nearest', autoGenerateMipmaps: false });
  const texture = new Texture({ source });
  registry.set(texture, { pc, rgba, texture, alpha, key: null });
  return texture;
}

/** Memoised variant for sprites drawn once by a factory. */
export function cachedTexture(key: string, make: () => PixelCanvas, alpha = 255): Texture {
  let t = byKey.get(key);
  if (!t) {
    t = textureOf(make(), alpha);
    byKey.set(key, t);
    registry.get(t)!.key = key;
  }
  return t;
}

/** Update a registered texture after its PixelCanvas changed. */
export function refreshTexture(texture: Texture): void {
  const e = registry.get(texture);
  if (!e) return;
  bakeRgba(e.pc, e.rgba, e.alpha);
  texture.source.update();
}

/**
 * The indexed canvas (and bake alpha) behind a registered texture, or null. Headless previews use
 * it to composite a live scene's sprites without a GPU.
 */
export function canvasOf(texture: Texture): { pc: PixelCanvas; alpha: number } | null {
  const e = registry.get(texture);
  return e ? { pc: e.pc, alpha: e.alpha } : null;
}

/** Drop a texture from the registry and free GPU memory. */
export function releaseTexture(texture: Texture): void {
  const e = registry.get(texture);
  registry.delete(texture);
  if (e?.key !== null && e?.key !== undefined && byKey.get(e.key) === texture) byKey.delete(e.key);
  texture.destroy(true);
}

/** How many textures are alive (tests and leak checks). */
export function textureCount(): number {
  return registry.size;
}

onEraChange(() => {
  for (const e of registry.values()) {
    bakeRgba(e.pc, e.rgba, e.alpha);
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
