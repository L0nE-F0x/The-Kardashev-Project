/**
 * The 3D edition's detail level (Settings → Display → 3D detail). Scenes read it when they're built
 * (shadow map size, plant density); the stage applies the resolution cap and ambient occlusion
 * at once.
 */
import { isPhone } from '../platform/platform';

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
}

const PRESETS: Record<QualityLevel, Quality> = {
  high: { level: 'high', shadowSize: 4096, ao: true, pixelRatio: 2, samples: 4, plants: 1, bloom: true },
  medium: { level: 'medium', shadowSize: 2048, ao: false, pixelRatio: 1.5, samples: 4, plants: 0.7, bloom: true },
  low: { level: 'low', shadowSize: 1024, ao: false, pixelRatio: 1, samples: 0, plants: 0.4, bloom: false },
};

export const quality: Quality = { ...PRESETS.high };

/** The level for a setting: 'auto' is low on phones, medium on small machines, high elsewhere. */
export function resolveQuality(setting: 'auto' | QualityLevel | undefined): QualityLevel {
  if (setting && setting !== 'auto') return setting;
  if (isPhone()) return 'low';
  const cores = navigator.hardwareConcurrency ?? 8;
  return cores <= 4 ? 'medium' : 'high';
}

export function setQuality(level: QualityLevel) {
  Object.assign(quality, PRESETS[level]);
}
