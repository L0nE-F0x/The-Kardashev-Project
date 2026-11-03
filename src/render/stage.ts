import { autoDetectRenderer, Container, RenderTexture, Sprite, TextureSource, type Renderer } from 'pixi.js';
import { C, hex } from './palette';

TextureSource.defaultOptions.scaleMode = 'nearest';

/** A pointer position in internal (game-pixel) coordinates. */
export interface PixelPointer {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  id: number;
  button: number;
  pointerType: string;
}

export interface Scene {
  /** Drawn into the low-res render target, in internal pixel coordinates. */
  readonly root: Container;
  update(dt: number, now: number): void;
  resize(width: number, height: number): void;
  /** Fractional camera offset in internal pixels (smooth sub-pixel panning). */
  subpixel(): { x: number; y: number };
  pointerDown?(p: PixelPointer): void;
  pointerMove?(p: PixelPointer): void;
  pointerUp?(p: PixelPointer): void;
  pointerLeave?(): void;
  wheel?(p: PixelPointer, deltaY: number): void;
  destroy(): void;
}

/** Margin (in internal px) rendered around the view so sub-pixel offsets never expose an edge. */
const MARGIN = 1;

/**
 * The pixel-perfect stage. The world renders into a fixed low-resolution render target and is
 * scaled up to the screen by a whole number, so every pixel in the game is the same size.
 */
export class PixelStage {
  renderer!: Renderer;
  canvas!: HTMLCanvasElement;
  /** Device pixels per game pixel. */
  scale = 3;
  /** Internal resolution in game pixels. */
  width = 640;
  height = 360;
  /** Extra user zoom multiplier on top of the automatic scale (1 or 2). */
  zoomBoost = 1;
  private rt!: RenderTexture;
  private sceneHolder = new Container();
  private screenRoot = new Container();
  private screenSprite!: Sprite;
  private scene: Scene | null = null;
  private resizeListeners = new Set<(w: number, h: number) => void>();

  async init(host: HTMLElement): Promise<void> {
    this.renderer = await autoDetectRenderer({
      preference: 'webgl',
      width: 2,
      height: 2,
      resolution: 1,
      antialias: false,
      autoDensity: false,
      backgroundColor: hex(C.ink0),
      powerPreference: 'high-performance',
    });
    this.canvas = this.renderer.canvas as HTMLCanvasElement;
    this.canvas.className = 'game-canvas';
    host.appendChild(this.canvas);
    this.rt = RenderTexture.create({ width: this.width + MARGIN * 2, height: this.height + MARGIN * 2, scaleMode: 'nearest' });
    this.screenSprite = new Sprite(this.rt);
    this.screenRoot.addChild(this.screenSprite);
    this.sceneHolder.position.set(MARGIN, MARGIN);
    this.layout();
    window.addEventListener('resize', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());
    this.bindInput();
  }

  onResize(fn: (w: number, h: number) => void): () => void {
    this.resizeListeners.add(fn);
    return () => this.resizeListeners.delete(fn);
  }

  setZoomBoost(z: number) {
    this.zoomBoost = Math.max(1, Math.min(4, Math.round(z)));
    this.layout();
  }

  layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const devW = Math.max(1, Math.round(cssW * dpr));
    const devH = Math.max(1, Math.round(cssH * dpr));
    const base = Math.max(1, Math.round(Math.min(devW, devH) / 360));
    this.scale = base * this.zoomBoost;
    this.width = Math.ceil(devW / this.scale);
    this.height = Math.ceil(devH / this.scale);
    this.renderer.resize(devW, devH);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    // Recreate the low-res target: resizing a RenderTexture in place leaves the screen
    // sprite's frame stale, which shows only a corner of the scene.
    const oldRt = this.rt;
    this.rt = RenderTexture.create({ width: this.width + MARGIN * 2, height: this.height + MARGIN * 2, scaleMode: 'nearest' });
    this.screenSprite.texture = this.rt;
    oldRt.destroy(true);
    this.screenSprite.scale.set(this.scale);
    document.documentElement.style.setProperty('--px', `${this.scale / dpr}px`);
    this.scene?.resize(this.width, this.height);
    for (const fn of this.resizeListeners) fn(this.width, this.height);
  }

  setScene(scene: Scene | null): void {
    if (this.scene) {
      this.sceneHolder.removeChild(this.scene.root);
      this.scene.destroy();
    }
    this.scene = scene;
    if (scene) {
      this.sceneHolder.addChild(scene.root);
      scene.resize(this.width, this.height);
    }
  }

  getScene(): Scene | null {
    return this.scene;
  }

  frame(dt: number, now: number): void {
    const scene = this.scene;
    if (scene) scene.update(dt, now);
    this.renderer.render({ container: this.sceneHolder, target: this.rt, clear: true, clearColor: [0.04, 0.04, 0.07, 1] });
    const sub = scene ? scene.subpixel() : { x: 0, y: 0 };
    this.screenSprite.position.set(Math.round(-(MARGIN + sub.x) * this.scale), Math.round(-(MARGIN + sub.y) * this.scale));
    this.renderer.render({ container: this.screenRoot });
  }

  /** Convert a client (CSS) position into internal game pixels. */
  toInternal(clientX: number, clientY: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const sub = this.scene ? this.scene.subpixel() : { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) * dpr) / this.scale + sub.x,
      y: ((clientY - rect.top) * dpr) / this.scale + sub.y,
    };
  }

  private bindInput(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    const toP = (e: PointerEvent): PixelPointer => ({ ...this.toInternal(e.clientX, e.clientY), clientX: e.clientX, clientY: e.clientY, id: e.pointerId, button: e.button, pointerType: e.pointerType });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.scene?.pointerDown?.(toP(e));
    });
    c.addEventListener('pointermove', (e) => this.scene?.pointerMove?.(toP(e)));
    c.addEventListener('pointerup', (e) => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.scene?.pointerUp?.(toP(e));
    });
    c.addEventListener('pointercancel', (e) => this.scene?.pointerUp?.(toP(e)));
    c.addEventListener('pointerleave', () => this.scene?.pointerLeave?.());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.toInternal(e.clientX, e.clientY);
        this.scene?.wheel?.({ ...p, clientX: e.clientX, clientY: e.clientY, id: -1, button: 0, pointerType: 'mouse' }, e.deltaY);
      },
      { passive: false },
    );
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
