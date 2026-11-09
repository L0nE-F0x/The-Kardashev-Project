/**
 * The 3D edition's detail level (Settings → Display → 3D detail). Scenes read it when they're built
 * (shadow map size, plant density); the stage applies the resolution cap and ambient occlusion
 * at once.
 */
import { isPhone } from '../platform/platform';
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

/** The GPU's name when the browser tells it (Chrome does; WebKit says "Apple GPU" everywhere). */
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

/** A discrete or otherwise strong GPU by its name (anything else, or no name, counts as integrated). */
export const strongGpu = (name: string) => /nvidia|geforce|quadro|rtx|radeon (rx|pro)|radeon\(tm\) rx|arc\(tm\) a|arc a\d|apple m\d (pro|max|ultra)/i.test(name);

/**
 * The level for a setting: 'auto' is low on phones, high with a discrete GPU, medium otherwise (integrated GPUs, or
 * a browser that won't say), and the resolution adapts on top of it.
 */
export function resolveQuality(setting: 'auto' | QualityLevel | undefined): QualityLevel {
  if (setting && setting !== 'auto') return setting;
  if (isPhone()) return 'low';
  return strongGpu(gpuName()) ? 'high' : 'medium';
}

export function setQuality(level: QualityLevel, adaptive = false) {
  Object.assign(quality, PRESETS[level], { adaptive });
  kitDetail.bevelSeg = level === 'high' ? 2 : 1;
}
