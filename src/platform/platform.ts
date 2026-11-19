/**
 * What the host can do. The game ships as an Electron desktop app (Windows, macOS, Linux & Steam);
 * in development the same page can also run in a browser tab. Game code talks to this module only.
 */

const bridge = typeof window !== 'undefined' ? window.kardashevDesktop : undefined;

export const isDesktopApp = Boolean(bridge);

/** True when built with KP_STEAM=1 or launched by the Steam client (disables the GitHub self-updater). */
export const isSteamBuild = (typeof __STEAM_BUILD__ !== 'undefined' && __STEAM_BUILD__) || Boolean(bridge?.isSteam);

// ── saving files ────────────────────────────────────────────────────────────────────────────
// Inside the desktop app, `electron/savefile.mjs` writes pictures into Pictures/The Kardashev Project
// and everything else into Documents/The Kardashev Project, never overwriting an existing file.
// A browser tab in development falls back to a standard file download.

/** Where a saved file went: its full path in the app, '' for a browser download, null when it failed. */
export type Saved = string | null;

async function saveFile(name: string, data: Uint8Array, kind: 'picture' | 'document', type: string): Promise<Saved> {
  if (bridge) {
    try {
      const safe = name.replace(/[^\w .()-]+/g, '-');
      return await bridge.saveFile(safe, data, kind);
    } catch (err) {
      console.warn('[platform] could not save', name, err);
      return null;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return '';
}

/** Save a text file (an exported company, the playtest log). */
export function saveTextFile(name: string, text: string, type = 'application/json'): Promise<Saved> {
  return saveFile(name, new TextEncoder().encode(text), 'document', type);
}

/** Save a PNG given as a data URL (a photo, the Type I end card). */
export function saveImage(name: string, dataUrl: string): Promise<Saved> {
  try {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return saveFile(name, bytes, 'picture', 'image/png');
  } catch {
    return Promise.resolve(null);
  }
}

/** A short line for the player: "Saved to Pictures/The Kardashev Project." (the last two folders of the path). */
export function savedNote(saved: Saved, failed: string): string {
  if (saved === null) return failed;
  if (!saved) return 'Saved to your downloads.';
  const parts = saved.split(/[\\/]/).filter(Boolean);
  return `Saved to ${parts.slice(-3, -1).join('/')}.`;
}

// ── in-app updates ──────────────────────────────────────────────────────────────────────────
// Direct GitHub Release installs update themselves via electron-updater; Steam builds disable this completely.

export type AppUpdateStatus =
  | { phase: 'ready' }
  | { phase: 'downloading'; fraction: number | null; attempt?: number }
  | { phase: 'installing' }
  | { phase: 'failed'; reason: string };

/** A newer release of the app. */
export interface AppUpdate {
  version: string;
  /** Download and install it; the app restarts into the new version. */
  install(onStatus: (s: AppUpdateStatus) => void): void;
}

const errText = (err: unknown) => String((err as Error)?.message ?? err);

/** Is there a newer release of the app? Null in dev, on Steam, offline, or when up to date. */
export async function checkAppUpdate(): Promise<AppUpdate | null> {
  if (!import.meta.env.PROD || !bridge || isSteamBuild) return null;
  try {
    const found = await bridge.checkUpdate();
    if (!found) return null;
    return {
      version: found.version,
      install(onStatus) {
        const off = bridge.onUpdateStatus((status) => onStatus(status));
        void bridge.installUpdate().catch((err) => {
          off();
          onStatus({ phase: 'failed', reason: errText(err) });
        });
      },
    };
  } catch {
    /* offline, rate-limited or no release yet: try again later */
    return null;
  }
}

/** Time limits for each try at a stream download (ms; 0 = none). Kept as a pure retry helper for updater streams. */
export const DESKTOP_DOWNLOAD_LIMITS = [180_000, 0];

export interface Downloadable {
  download(onEvent: (e: DownloadProgress) => void, options?: { timeout?: number }): Promise<void>;
}
export type DownloadProgress = { event: 'Started'; data: { contentLength?: number } } | { event: 'Progress'; data: { chunkLength: number } } | { event: 'Finished' };

/** Download an update stream, starting over on a fresh connection when a try runs past its limit. */
export async function downloadWithRetry(update: Downloadable, onStatus: (s: AppUpdateStatus) => void, limits = DESKTOP_DOWNLOAD_LIMITS): Promise<void> {
  let lastErr: unknown = null;
  for (let i = 0; i < limits.length; i++) {
    let total = 0;
    let got = 0;
    const attempt = i + 1;
    onStatus({ phase: 'downloading', fraction: null, attempt });
    try {
      await update.download((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0;
        else if (e.event === 'Progress') {
          got += e.data.chunkLength;
          onStatus({ phase: 'downloading', fraction: total ? Math.min(1, got / total) : null, attempt });
        }
      }, limits[i] ? { timeout: limits[i] } : undefined);
      return;
    } catch (err) {
      lastErr = err;
      if (/signature/i.test(errText(err))) break;
    }
  }
  throw lastErr;
}

export interface DesktopUpdate extends Downloadable {
  readonly rid: number;
  install(): Promise<void>;
}

/** Fallback-capable desktop update installer helper (tested in tests/update-retry.test.ts). */
export async function installDesktop(
  update: DesktopUpdate,
  onStatus: (s: AppUpdateStatus) => void,
  fast: (rid: number, onStatus: (s: AppUpdateStatus) => void) => Promise<void> = async () => {
    throw new Error('fast download: unavailable');
  },
): Promise<void> {
  try {
    await fast(update.rid, onStatus);
    return;
  } catch (err) {
    if (!/^fast download:/.test(errText(err))) throw err;
  }
  await downloadWithRetry(update, onStatus);
  onStatus({ phase: 'installing' });
  await update.install();
}

// ── which graphics card (machines with two) ─────────────────────────────────────────────────
// Chromium picks its GPU when its GPU process starts, so the choice lives in `<userData>/gpu.json`
// (electron/gpu.mjs) and takes effect on a restart. A new choice is on trial until `keepGpu`.

export interface GpuStatus {
  os: 'linux' | 'windows' | 'macos' | 'other';
  /** Hardware graphics cards found, or null where the host can't count them. */
  gpus: number | null;
  prefer: 'auto' | 'strong';
  /** ok · new (chosen, restart pending) · trying (running on it, not confirmed yet) · failed (a trial was undone). */
  state: 'ok' | 'new' | 'trying' | 'failed';
  /** This run was started on the stronger card. */
  active: boolean;
}

/** The app's graphics-card choice; null in a browser tab (development) or when the host can't say. */
export async function gpuStatus(): Promise<GpuStatus | null> {
  if (!bridge) return null;
  try {
    return await bridge.gpuGet();
  } catch {
    return null;
  }
}

/** Choose the card for the next start. False when it couldn't be saved. */
export async function setGpuPreference(prefer: 'auto' | 'strong'): Promise<boolean> {
  if (!bridge) return false;
  try {
    await bridge.gpuSet(prefer);
    return true;
  } catch {
    return false;
  }
}

/** The picture on the stronger card is fine: keep it. */
export async function keepGpu(): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.gpuKeep();
  } catch {
    /* the next start undoes the trial, which is the safe side */
  }
}

/** Close the app and start it again (after a graphics-card change). */
export async function restartApp(): Promise<void> {
  if (!bridge) return window.location.reload();
  await bridge.restart();
}

export async function quitApp(): Promise<void> {
  if (bridge) await bridge.quit();
  else window.close();
}

/**
 * Open a page outside the game, from a link's click handler. The desktop app hands it to the system browser
 * and returns true, so the link must not also navigate the game window.
 */
export function openExternal(url: string): boolean {
  if (!bridge) return false;
  bridge.openExternal(url).catch((e) => console.warn('[platform] could not open', url, e));
  return true;
}

export async function toggleFullscreen(): Promise<void> {
  if (bridge) {
    await bridge.toggleFullscreen();
    return;
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* not allowed here */
  }
}
