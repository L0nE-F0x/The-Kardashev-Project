/**
 * The 3D edition's stage: one WebGL canvas behind the same DOM UI, the current scene's camera and
 * post look, input handed to the scene in CSS pixels. Meets the same GameStage contract as the
 * pixel game's PixelStage, so Game drives either.
 */
import * as THREE from 'three';
import type { GameScene, GameStage, PixelPointer } from '../render/stage';
import { defaultLook, Post, type Look } from './post';
import { getEra } from '../render/palette';
import { quality } from './quality';

/** A 3D scene: a three.js scene and camera, plus what it wants from the post pipeline. */
export interface Scene3D extends GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly look: Look;
  /** Ambient occlusion pass wanted at all (built once per scene). */
  readonly wantsAO?: boolean;
}

export const isScene3D = (s: GameScene | null): s is Scene3D => !!s && 'camera' in s && 'scene' in s;

export class Stage3D implements GameStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  scale = 1;
  fade = 0;
  private scene: Scene3D | null = null;
  private post: Post | null = null;
  private zoom = 1;
  private width = 1;
  private height = 1;
  private readonly blank = new THREE.Scene();
  private readonly blankCam = new THREE.PerspectiveCamera();
  /**
   * Adaptive resolution ('auto' detail): the share of the preset's pixel ratio rendered at, stepped down while frames
   * come slow and back up when there's room. The DOM UI stays crisp whatever it is.
   */
  private dyn = 1;
  private costs: number[] = [];
  private nextMeasure = 0;
  private quietUntil = 0;
  private lastStep = 0;
  private readonly px = new Uint8Array(4);

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // scenes render linear HDR into the post pipeline, which develops the picture (exposure, tone curve, grade)
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x0b0a12);
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    host.appendChild(this.canvas);
    this.blank.background = new THREE.Color(0x0b0a12);
    this.layout();
    window.addEventListener('resize', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());
    this.bindInput();
  }

  /** The share of the pixel ratio the adaptive resolution renders at now (1 = the preset's own). */
  get renderScale() {
    return this.dyn;
  }

  /**
   * Adaptive resolution: every 0.7 s one frame is timed from a sync before it to a sync after it (two 1-pixel reads;
   * what the GPU really spends, unlike the frame rate, which WebKit caps at 30 in low-power mode). Over ~22 ms (under
   * ~45 fps): a step down; when the next step up would still fit in ~15 ms, a step up (at most every 12 s, so the sharpness doesn't hunt).
   * Never under automation (QA screenshots stay sharp) or just after a scene change (shader compiles).
   */
  private adapt(cost: number, now: number) {
    this.costs.push(cost);
    if (this.costs.length < 3) return;
    const med = this.costs.sort((a, b) => a - b)[1];
    this.costs = [];
    const MIN = 0.5, STEP = 0.125;
    if (med > 22 && this.dyn > MIN) {
      this.dyn = Math.max(MIN, this.dyn - (med > 45 ? STEP * 2 : STEP));
      this.lastStep = now;
      this.quietUntil = now + 800;
      this.layout();
    } else if (this.dyn < 1 && med * ((this.dyn + STEP) / this.dyn) ** 2 < 15 && now - this.lastStep > 12000) {
      this.dyn = Math.min(1, this.dyn + STEP);
      this.lastStep = now;
      this.quietUntil = now + 800;
      this.layout();
    }
  }

  /** The detail level changed: re-lay out (resolution) and rebuild the post pipeline (AO, MSAA). */
  applyQuality() {
    this.dyn = 1;
    this.quietUntil = performance.now() + 2500;
    this.costs = [];
    this.layout();
    if (this.scene) {
      this.post?.dispose();
      this.post = new Post(this.renderer, this.scene.scene, this.scene.camera, !!this.scene.wantsAO && quality.ao, quality.samples);
    }
  }

  setZoomBoost(z: number) {
    // the pixel game's zoom is its pixel size; here it only sizes the UI's hairlines (--px)
    this.zoom = Math.max(1, Math.min(4, Math.round(z)));
    this.layout();
  }

  private layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.scale = Math.max(Math.min(dpr, 0.6), Math.min(dpr, quality.pixelRatio) * this.dyn);
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(w, h);
    // the UI's frames are drawn in "game pixels": keep them the size the pixel game uses
    const base = Math.max(1, Math.round(Math.min(w * dpr, h * dpr) / 360));
    document.documentElement.style.setProperty('--px', `${(base * this.zoom) / dpr}px`);
    if (this.scene) {
      this.scene.camera.aspect = w / h;
      this.scene.camera.updateProjectionMatrix();
      this.scene.resize(w, h);
    }
    this.post?.resize();
  }

  setScene(scene: GameScene | null, zoomBoost?: number) {
    if (this.scene) this.scene.destroy();
    this.post?.dispose();
    this.post = null;
    this.scene = null;
    if (zoomBoost !== undefined) this.setZoomBoost(zoomBoost);
    if (scene && !isScene3D(scene)) throw new Error('Stage3D needs a 3D scene');
    this.quietUntil = performance.now() + 2500;
    this.costs = [];
    this.scene = scene;
    if (scene) {
      scene.camera.aspect = this.width / this.height;
      scene.camera.updateProjectionMatrix();
      scene.resize(this.width, this.height);
      this.post = new Post(this.renderer, scene.scene, scene.camera, !!scene.wantsAO && quality.ao, quality.samples);
    }
  }

  getScene(): GameScene | null {
    return this.scene;
  }

  frame(dt: number, now: number) {
    const s = this.scene;
    if (!s || !this.post) {
      this.renderer.render(this.blank, this.blankCam);
      return;
    }
    s.update(dt, now);
    const look = s.look ?? defaultLook();
    const t = performance.now();
    const measure = quality.adaptive && !navigator.webdriver && t >= this.nextMeasure && t >= this.quietUntil && document.visibilityState === 'visible';
    const gl = this.renderer.getContext();
    if (measure) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
    const t0 = performance.now();
    this.post.render(dt, quality.bloom ? look : { ...look, bloom: 0 }, this.fade, getEra());
    if (measure) {
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
      const t1 = performance.now();
      this.nextMeasure = t1 + 700;
      this.adapt(t1 - t0, t1);
    }
  }

  private bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    const toP = (e: PointerEvent): PixelPointer => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, clientX: e.clientX, clientY: e.clientY, id: e.pointerId, button: e.button, pointerType: e.pointerType, perCss: 1 };
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.scene?.pointerDown?.(toP(e));
    });
    c.addEventListener('pointermove', (e) => this.scene?.pointerMove?.(toP(e)));
    c.addEventListener('pointerup', (e) => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.scene?.pointerUp?.(toP(e));
    });
    c.addEventListener('pointercancel', (e) => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.scene?.pointerCancel?.(toP(e));
    });
    c.addEventListener('pointerleave', () => this.scene?.pointerLeave?.());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 34 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.scene?.wheel?.({ x: e.clientX - r.left, y: e.clientY - r.top, clientX: e.clientX, clientY: e.clientY, id: -1, button: 0, pointerType: 'mouse', perCss: 1 }, dy);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
