/**
 * The 3D edition's stage: one WebGL canvas behind the same DOM UI, the current scene's camera and
 * post look, input handed to the scene in CSS pixels. Meets the same GameStage contract as the
 * pixel game's PixelStage, so Game drives either.
 */
import * as THREE from 'three';
import type { GameScene, GameStage, PixelPointer } from '../render/stage';
import { defaultLook, Post, type Look } from './post';

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

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
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
    this.scale = Math.min(dpr, 2);
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
    this.scene = scene;
    if (scene) {
      scene.camera.aspect = this.width / this.height;
      scene.camera.updateProjectionMatrix();
      scene.resize(this.width, this.height);
      this.post = new Post(this.renderer, scene.scene, scene.camera, !!scene.wantsAO);
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
    this.post.render(dt, s.look ?? defaultLook(), this.fade);
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
