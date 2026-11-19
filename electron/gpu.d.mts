import type { App } from 'electron';
import type { GpuStatus } from '../src/platform/platform';

export interface SavedGpuChoice {
  prefer: 'auto' | 'strong' | string;
  state: 'ok' | 'new' | 'trying' | 'failed' | string;
}

export function gpuStep(saved?: Partial<SavedGpuChoice> | null): {
  apply: boolean;
  next: { prefer: 'auto' | 'strong'; state: 'ok' | 'new' | 'trying' | 'failed' } | null;
};

export function countRealGpus(
  gpuInfo?: { gpuDevice?: Array<{ vendorId: number; deviceId?: number }> } | null,
  platform?: NodeJS.Platform,
): number | null;

export function createGpuManager(userDataDir: string): {
  applyAtStart(app: App): void;
  getStatus(app: App): Promise<GpuStatus>;
  setPreference(prefer: 'auto' | 'strong'): void;
  keep(): void;
};
