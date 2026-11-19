import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanSaveName, freeSavePath, writeSavedFile } from '../electron/savefile.mjs';
import { countRealGpus, gpuStep } from '../electron/gpu.mjs';
import { resolveQuality, setOnStrongGpu, softwareGpu, strongGpu } from '../src/render3d/quality';

describe('desktop savefile helper (electron/savefile.mjs)', () => {
  it('keeps file names inside the folder and strips path separators', () => {
    expect(cleanSaveName('../../etc/passwd')).toBe('-..-etc-passwd');
    expect(cleanSaveName('little-sun-day120.kardashev.json')).toBe('little-sun-day120.kardashev.json');
    expect(cleanSaveName('  .. ')).toBe('kardashev');
    expect(cleanSaveName('a/b\\c:d')).not.toMatch(/[/\\:]/);
  });

  it('never overwrites an existing file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-savefile-test-'));
    try {
      const a = freeSavePath(dir, 'shot.png');
      fs.writeFileSync(a, '1');
      const b = freeSavePath(dir, 'shot.png');
      expect(path.basename(b)).toBe('shot (2).png');
      fs.writeFileSync(b, '2');
      expect(path.basename(freeSavePath(dir, 'shot.png'))).toBe('shot (3).png');

      const out1 = writeSavedFile({ baseDir: dir, name: 'photo.png', bytes: new Uint8Array([1, 2, 3]) });
      const out2 = writeSavedFile({ baseDir: dir, name: 'photo.png', bytes: new Uint8Array([4, 5, 6]) });
      expect(path.basename(out1)).toBe('photo.png');
      expect(path.basename(out2)).toBe('photo (2).png');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('desktop dual-GPU trial state machine (electron/gpu.mjs)', () => {
  it('never applies discrete switches when preference is auto', () => {
    expect(gpuStep({ prefer: 'auto', state: 'ok' })).toEqual({ apply: false, next: null });
    expect(gpuStep({ prefer: 'auto', state: 'failed' })).toEqual({ apply: false, next: null });
  });

  it('puts a newly chosen stronger GPU on trial first', () => {
    expect(gpuStep({ prefer: 'strong', state: 'new' })).toEqual({
      apply: true,
      next: { prefer: 'strong', state: 'trying' },
    });
  });

  it('reverts an unconfirmed trial back to automatic on next start', () => {
    expect(gpuStep({ prefer: 'strong', state: 'trying' })).toEqual({
      apply: false,
      next: { prefer: 'auto', state: 'failed' },
    });
  });

  it('applies a confirmed choice quietly', () => {
    expect(gpuStep({ prefer: 'strong', state: 'ok' })).toEqual({ apply: true, next: null });
  });

  it('counts real hardware GPUs while ignoring software fallback adapters', () => {
    expect(
      countRealGpus(
        {
          gpuDevice: [
            { vendorId: 0x10de, deviceId: 0x2507 }, // NVIDIA RTX 3050
            { vendorId: 0x1414, deviceId: 0x008c }, // Microsoft Basic Render Driver
          ],
        },
        'win32',
      ),
    ).toBe(1);

    expect(
      countRealGpus(
        {
          gpuDevice: [
            { vendorId: 0x8086, deviceId: 0xa7a0 }, // Intel Iris Xe
            { vendorId: 0x10de, deviceId: 0x28a0 }, // NVIDIA RTX 4060 Laptop
            { vendorId: 0x1414, deviceId: 0x008c }, // Microsoft Basic Render Driver
          ],
        },
        'win32',
      ),
    ).toBe(2);
  });
});

describe('cross-platform GPU tier detection (src/render3d/quality.ts)', () => {
  it('detects discrete and modern high-tier GPUs across Windows, macOS, and Linux', () => {
    expect(strongGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(strongGpu('ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(strongGpu('AMD Radeon 780M (radeonsi, phoenix, LLVM 19.1.0)')).toBe(true);
    expect(strongGpu('AMD Radeon 8060S Graphics')).toBe(true);
    expect(strongGpu('ANGLE (Intel, Intel(R) Arc(TM) B580 Graphics Direct3D11, D3D11)')).toBe(true);
    expect(strongGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)')).toBe(true);
    expect(strongGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)')).toBe(true);
  });

  it('keeps older integrated GPUs and Steam Deck handheld APU on Medium by default', () => {
    expect(strongGpu('AMD Radeon 610M (radeonsi, raphael_mendocino)')).toBe(false);
    expect(strongGpu('AMD Custom GPU 0405 (radeonsi, vangogh, ACO, DRM 3.54)')).toBe(false);
    expect(strongGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11, D3D11)')).toBe(false);
  });

  it('identifies software fallback renderers', () => {
    expect(softwareGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
    expect(softwareGpu('llvmpipe (LLVM 19.1.7, 256 bits)')).toBe(true);
    expect(strongGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader)')).toBe(false);
  });

  it('honours explicit settings and strong-GPU override in resolveQuality', () => {
    setOnStrongGpu(false);
    expect(resolveQuality('low')).toBe('low');
    expect(resolveQuality('medium')).toBe('medium');
    expect(resolveQuality('high')).toBe('high');
    setOnStrongGpu(true);
    expect(resolveQuality('auto')).toBe('high');
    setOnStrongGpu(false);
  });
});
