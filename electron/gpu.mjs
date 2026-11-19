/**
 * Settings → Display → Graphics card: run the game on the stronger GPU of a machine that has two.
 *
 * Chromium picks its GPU when its GPU process starts, so the choice lives in `<userData>/gpu.json` and is applied
 * before `app.whenReady()`. A new choice is on trial (`trying`) until the player confirms the picture (`gpuKeep`):
 * if a start finds the last trial unconfirmed, it reverts to automatic by itself so a broken driver setup never
 * traps the player on a black window.
 */
import fs from 'node:fs';
import path from 'node:path';

const MARK = 'KARDASHEV_GPU_SWITCHED';
const LINUX_GPU_VARS = ['DRI_PRIME', '__NV_PRIME_RENDER_OFFLOAD', '__GLX_VENDOR_LIBRARY_NAME', '__VK_LAYER_NV_optimus'];
/** Software/virtual PCI vendor IDs (Microsoft Basic Render Driver, Google SwiftShader, Mesa llvmpipe). */
const SOFTWARE_VENDORS = new Set([0x0000, 0x1414, 0xffff]);

/** Pure state transition at launch: returns whether to apply discrete-GPU switches and any state update to persist. */
export function gpuStep(saved) {
  const prefer = saved?.prefer === 'strong' ? 'strong' : 'auto';
  const state = typeof saved?.state === 'string' ? saved.state : 'ok';
  if (prefer !== 'strong') return { apply: false, next: null };
  switch (state) {
    case 'trying':
      return { apply: false, next: { prefer: 'auto', state: 'failed' } };
    case 'new':
      return { apply: true, next: { prefer: 'strong', state: 'trying' } };
    case 'ok':
      return { apply: true, next: null };
    default:
      return { apply: false, next: null };
  }
}

/** Count real hardware GPUs from Linux `/dev/dri` and/or Chromium's `app.getGPUInfo('basic')`. */
export function countRealGpus(gpuInfo, platform = process.platform) {
  let driCount = null;
  if (platform === 'linux') {
    try {
      driCount = fs.readdirSync('/dev/dri').filter((f) => f.startsWith('renderD')).length;
    } catch {
      driCount = null;
    }
  }
  const devices = Array.isArray(gpuInfo?.gpuDevice)
    ? gpuInfo.gpuDevice.filter((d) => d && typeof d.vendorId === 'number' && !SOFTWARE_VENDORS.has(d.vendorId))
    : null;
  if (devices && devices.length > 0) {
    // Deduplicate by vendorId:deviceId in case virtual sub-devices appear
    const unique = new Set(devices.map((d) => `${d.vendorId}:${d.deviceId ?? 0}`));
    return driCount !== null ? Math.max(driCount, unique.size) : unique.size;
  }
  return driCount;
}

export function createGpuManager(userDataDir) {
  const file = path.join(userDataDir, 'gpu.json');
  let active = false;

  const load = () => {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        prefer: raw?.prefer === 'strong' ? 'strong' : 'auto',
        state: ['ok', 'new', 'trying', 'failed'].includes(raw?.state) ? raw.state : 'ok',
      };
    } catch {
      return { prefer: 'auto', state: 'ok' };
    }
  };

  const store = (next) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next));
  };

  const applyAtStart = (app) => {
    const { apply, next } = gpuStep(load());
    if (next) {
      try {
        store(next);
      } catch {
        // If we cannot persist the trial marker, refuse to start a trial that could repeat forever.
        return;
      }
    }
    if (apply) {
      app.commandLine.appendSwitch('force_high_performance_gpu');
      if (process.platform === 'linux') {
        if (fs.existsSync('/proc/driver/nvidia/version')) {
          process.env.__NV_PRIME_RENDER_OFFLOAD = '1';
          process.env.__GLX_VENDOR_LIBRARY_NAME = 'nvidia';
          process.env.__VK_LAYER_NV_optimus = 'NVIDIA_only';
        } else {
          process.env.DRI_PRIME = '1';
        }
        process.env[MARK] = '1';
      }
      active = true;
    } else if (process.env[MARK]) {
      for (const key of LINUX_GPU_VARS) delete process.env[key];
      delete process.env[MARK];
    }
  };

  const getStatus = async (app) => {
    const saved = load();
    let info = null;
    try {
      info = await app.getGPUInfo('basic');
    } catch {
      info = null;
    }
    const os =
      process.platform === 'linux' ? 'linux' : process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'other';
    return {
      os,
      gpus: countRealGpus(info, process.platform),
      prefer: saved.prefer,
      state: saved.state,
      active,
    };
  };

  const setPreference = (prefer) => {
    const strong = prefer === 'strong';
    store({ prefer: strong ? 'strong' : 'auto', state: strong ? 'new' : 'ok' });
  };

  const keep = () => {
    const saved = load();
    if (saved.prefer === 'strong') store({ prefer: 'strong', state: 'ok' });
  };

  return { applyAtStart, getStatus, setPreference, keep };
}
