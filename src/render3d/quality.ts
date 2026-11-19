/**
 * The detail level (Settings → Display → 3D detail). Scenes read it when they're built
 * (shadow map size, plant density); the stage applies the resolution cap and ambient occlusion
 * at once.
 */
import { kitDetail } from './kit';

export type QualityLevel = 'high' | 'medium' | 'low';

export interface Quality {
  level: QualityLevel;
  shadowSize: number;
  ao: boolean;
  /** Highest device pixel ratio rendered at. */
  pixelRatio: number;
  /** MSAA samples on the main render target. */
  samples: number;
  /** Plants and scatter on the land, 0..1. */
  plants: number;
  bloom: boolean;
  /**
   * Let the stage lower (and raise again) the 3D resolution while the GPU can't keep up (the 'auto' setting; a
   * level the player picks holds still).
   */
  adaptive: boolean;
}

// Measured on an Intel Raptor Lake iGPU (on battery) at ~1.1 MP: the scene ~18 ms, ambient occlusion +24 ms at full
// resolution, 4× MSAA +11 ms, bloom +3.5 ms, shadows ~5 ms. So: AO only on high (at half resolution, see post.ts),
// MSAA only on high, FXAA below it.
const PRESETS: Record<QualityLevel, Omit<Quality, 'adaptive'>> = {
  high: { level: 'high', shadowSize: 4096, ao: true, pixelRatio: 2, samples: 4, plants: 1, bloom: true },
  medium: { level: 'medium', shadowSize: 2048, ao: false, pixelRatio: 1.5, samples: 0, plants: 0.7, bloom: true },
  low: { level: 'low', shadowSize: 1024, ao: false, pixelRatio: 1, samples: 0, plants: 0.4, bloom: false },
};

export const quality: Quality = { ...PRESETS.high, adaptive: false };

/** The GPU's name from WebGL2's debug extension (Chromium/Electron reports the real adapter across OSes). */
function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

/** CPU/software fallback renderers (missing GPU driver or VM): step straight to Low so the game stays playable. */
export const softwareGpu = (name: string) => /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render/i.test(name);

/**
 * A discrete or high-tier modern GPU by its WebGL/ANGLE renderer string:
 * - NVIDIA (RTX, GTX, GeForce, Quadro)
 * - AMD Radeon RX / Pro / AI PRO / VII / modern RDNA3+ 780M/880M/890M/8050S/8060S
 * - Intel Arc A/B/C-series and Lunar Lake Arc 130V/140V
 * - Apple Silicon (M1 Pro/Max/Ultra and all M2/M3/M4+)
 */
export const strongGpu = (name: string) =>
  !softwareGpu(name) &&
  /nvidia|geforce|quadro|rtx|radeon(\(tm\))?\s*(rx|pro|ai\s*pro|vii|[789]\d0m|80[56]0s)|\barc(\(tm\))?\s+([abce]\d{3}|\d{3}v)|apple\s+m([2-9]|\d\d)|apple\s+m1\s+(pro|max|ultra)/i.test(name);

let onStrongGpu = false;
/** The app was started on the stronger graphics card (Settings → Display → Graphics card): Auto then means High. */
export function setOnStrongGpu(v: boolean) {
  onStrongGpu = v;
}

/**
 * The level for a setting: 'auto' picks High on discrete / strong modern GPUs, Low on software fallbacks, and Medium
 * otherwise (older integrated GPUs, Steam Deck handheld APU for battery life), with adaptive resolution on top.
 */
export function resolveQuality(setting: 'auto' | QualityLevel | undefined): QualityLevel {
  if (setting && setting !== 'auto') return setting;
  const name = gpuName();
  if (softwareGpu(name)) return 'low';
  return onStrongGpu || strongGpu(name) ? 'high' : 'medium';
}

export function setQuality(level: QualityLevel, adaptive = false) {
  Object.assign(quality, PRESETS[level], { adaptive });
  kitDetail.bevelSeg = level === 'high' ? 2 : 1;
}
