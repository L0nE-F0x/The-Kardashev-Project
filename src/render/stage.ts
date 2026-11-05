import { autoDetectRenderer, Container, RenderTexture, Sprite, Texture, TextureSource, type Renderer } from 'pixi.js';
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
  /** Internal pixels per CSS pixel: touch slop and touch targets are sized in CSS pixels (a finger is ~40 wide). */
  perCss?: number;
}

/** How far a press may wander before it's a drag: a mouse holds still, a finger doesn't (10 CSS px). */
export function dragSlop(p: PixelPointer): number {
  return p.pointerType === 'mouse' || !p.perCss ? 3 : Math.max(3, 10 * p.perCss);
}

/** Hit radius around a tappable marker, in internal pixels: `mouse` for a mouse, about 20 CSS px for a finger. */
export function touchRadius(p: PixelPointer, mouse: number): number {
  return p.pointerType === 'mouse' || !p.perCss ? mouse : Math.max(mouse, 20 * p.perCss);
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
  /** The browser took the press away (a scroll, a second app, a system gesture): forget it, never act on it. */
  pointerCancel?(p: PixelPointer): void;
  pointerLeave?(): void;
  wheel?(p: PixelPointer, deltaY: number): void;
  /** True while the camera moves on its own or under the player's hand (a glide, a fling, a drag, a pinch). */
  busy?(): boolean;
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
  /** 0..1 black fade over the whole picture (scene transitions). */
  fade = 0;
  private fadeSprite!: Sprite;
  private rt!: RenderTexture;
  private sceneHolder = new Container();
  private screenRoot = new Container();
  private screenSprite!: Sprite;
  private scene: Scene | null = null;
  private resizeListeners = new Set<(w: number, h: number) => void>();
  /** The window size, pixel ratio and scale the stage was last laid out for. */
  private laidOut = '';

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
    this.fadeSprite = new Sprite(Texture.WHITE);
    this.fadeSprite.tint = 0x05050c;
    this.fadeSprite.alpha = 0;
    this.screenRoot.addChild(this.screenSprite, this.fadeSprite);
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
    // the window and the visual viewport both report a resize, and a zoom may be set to what it was:
    // rebuild the target and lay the scene out again only when something actually changed
    const key = `${cssW}x${cssH}@${dpr}|${base * this.zoomBoost}`;
    if (key === this.laidOut) return;
    this.laidOut = key;
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

  /**
   * Show a scene (the old one is destroyed). With `zoomBoost`, the zoom changes in between, so the
   * old scene isn't laid out (rebuilt) at the new size just before it goes, nor the new one twice.
   */
  setScene(scene: Scene | null, zoomBoost?: number): void {
    if (this.scene) {
      this.sceneHolder.removeChild(this.scene.root);
      this.scene.destroy();
      this.scene = null;
    }
    if (zoomBoost !== undefined) this.setZoomBoost(zoomBoost);
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
    this.fadeSprite.alpha = this.fade;
    this.fadeSprite.visible = this.fade > 0.001;
    this.fadeSprite.width = this.renderer.width;
    this.fadeSprite.height = this.renderer.height;
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
    const toP = (e: PointerEvent): PixelPointer => ({
      ...this.toInternal(e.clientX, e.clientY),
      clientX: e.clientX,
      clientY: e.clientY,
      id: e.pointerId,
      button: e.button,
      pointerType: e.pointerType,
      perCss: (window.devicePixelRatio || 1) / this.scale,
    });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.scene?.pointerDown?.(toP(e));
    });
    c.addEventListener('pointermove', (e) => this.scene?.pointerMove?.(toP(e)));
    c.addEventListener('pointerup', (e) => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.scene?.pointerUp?.(toP(e));
    });
    // a cancelled press is not a tap (it would select, open a diorama or greet someone)
    c.addEventListener('pointercancel', (e) => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.scene?.pointerCancel?.(toP(e));
    });
    c.addEventListener('pointerleave', () => this.scene?.pointerLeave?.());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.toInternal(e.clientX, e.clientY);
        // a notch is ~100 whatever the browser counts in (Firefox sends 3 lines, some mice a page)
        const dy = e.deltaMode === 1 ? e.deltaY * 34 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        this.scene?.wheel?.({ ...p, clientX: e.clientX, clientY: e.clientY, id: -1, button: 0, pointerType: 'mouse' }, dy);
      },
      { passive: false },
    );
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
