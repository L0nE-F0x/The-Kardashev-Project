/**
 * The contract between the game and what draws it: a stage (render3d/stage3d.ts) showing one scene at a time
 * (the globe, a campus, orbit, the solar system), and the pointer events a scene receives.
 */

/** A pointer position in the stage's own units (CSS pixels). */
export interface PixelPointer {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  id: number;
  button: number;
  pointerType: string;
}

/** What the game needs from any scene. */
export interface GameScene {
  update(dt: number, now: number): void;
  resize(width: number, height: number): void;
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

/** What the game needs from the stage (Stage3D). */
export interface GameStage {
  readonly canvas: HTMLCanvasElement;
  /** Device pixels per scene unit (a CSS pixel, so the device pixel ratio). */
  readonly scale: number;
  /** 0..1 fade to black over everything (scene cuts in the menu tour). */
  fade: number;
  setScene(scene: GameScene | null, zoomBoost?: number): void;
  getScene(): GameScene | null;
  frame(dt: number, now: number): void;
  /** A PNG (data URL) of the scene as it stands, without the interface (photo mode). */
  capture?(): string | null;
}
