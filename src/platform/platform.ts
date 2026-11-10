/**
 * What the host can do. The game ships as a desktop app (Windows, macOS, Linux); in development the same page
 * runs in a browser tab. Game code talks to this module only, so the desktop shell (Tauri today, maybe Electron
 * for Steam later) can be swapped without touching the game.
 */

export const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Save a text file (a save export, the playtest log) as a download. */
export function saveTextFile(name: string, text: string, type = 'application/json'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Save a PNG (the Type I end card, a photo) as a download. */
export function saveImage(name: string, dataUrl: string): boolean {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

// ── in-app updates ──────────────────────────────────────────────────────────────────────────
// The app carries its own copy of the game, so it updates itself from GitHub releases (Tauri's updater: signed,
// see plugins.updater in src-tauri/tauri.conf.json).

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

/** Is there a newer release of the app? Null in dev, offline, or when up to date. */
export async function checkAppUpdate(): Promise<AppUpdate | null> {
  if (!import.meta.env.PROD || !isDesktopApp) return null;
  try {
    return await checkDesktopUpdate();
  } catch {
    /* offline, rate-limited or no release yet: try again later */
  }
  return null;
}

/**
 * Time limits for each try at the updater's own download (ms; 0 = none). Since v0.9.4 that is only the fallback
 * when the app's own download (`installDesktop`) can't run. Every try opens a new connection, so a stalled one is
 * replaced instead of waited out; the last try has no limit, so a genuinely slow line still gets there.
 */
export const DESKTOP_DOWNLOAD_LIMITS = [180_000, 0];

/** The bit of Tauri's Update that the retry needs (a fake one in tests). */
export interface Downloadable {
  download(onEvent: (e: DownloadProgress) => void, options?: { timeout?: number }): Promise<void>;
}
export type DownloadProgress = { event: 'Started'; data: { contentLength?: number } } | { event: 'Progress'; data: { chunkLength: number } } | { event: 'Finished' };

const errText = (err: unknown) => String((err as Error)?.message ?? err);

/** Download the update, starting over on a fresh connection when a try runs past its limit. */
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
      // a file that fails its signature won't pass on the next try
      if (/signature/i.test(errText(err))) break;
    }
  }
  throw lastErr;
}

/** What the app's own download reports (src-tauri/src/fastdl.rs, `UpdateEvent`). */
type FastEvent = { event: 'progress'; got: number; total: number } | { event: 'installing' };

/**
 * The app's own download (v0.9.4, src-tauri/src/fastdl.rs): the file in pieces over six connections spread across
 * the download host's addresses, a stalled or crawling connection swapped for a fresh one (keeping its bytes), then
 * the updater's own install, which checks the signature first. The updater's download uses one connection and
 * waits it out: the 93 MB AppImage of 0.9.3 crawled at ~30 KB/s for 25+ minutes on a 500 Mbps line, while this
 * fetched it in 5–7 s.
 */
async function fastInstall(rid: number, onStatus: (s: AppUpdateStatus) => void): Promise<void> {
  const { Channel, invoke } = await import('@tauri-apps/api/core');
  const events = new Channel<FastEvent>();
  events.onmessage = (e) =>
    onStatus(e.event === 'progress' ? { phase: 'downloading', fraction: e.total ? Math.min(1, e.got / e.total) : null } : { phase: 'installing' });
  await invoke('update_fast', { rid, onEvent: events });
}

/** The parts of Tauri's Update the desktop install uses (a fake one in tests). */
export interface DesktopUpdate extends Downloadable {
  readonly rid: number;
  install(): Promise<void>;
}

/**
 * Download and install a desktop update: the app's own download first. When that can't run (its errors start with
 * "fast download:": a server without range requests, no network), the updater's own download and install. A bad
 * signature or a failed install is final: downloading again wouldn't change it.
 */
export async function installDesktop(update: DesktopUpdate, onStatus: (s: AppUpdateStatus) => void, fast = fastInstall): Promise<void> {
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

async function checkDesktopUpdate(): Promise<AppUpdate | null> {
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    install(onStatus) {
      void (async () => {
        try {
          await installDesktop(update, onStatus);
          // Windows has already closed the app to run the installer; elsewhere, restart into it
          const { relaunch } = await import('@tauri-apps/plugin-process');
          await relaunch();
        } catch (err) {
          onStatus({ phase: 'failed', reason: String((err as Error)?.message ?? err) });
        }
      })();
    },
  };
}

export async function quitApp(): Promise<void> {
  const w = window.__TAURI__?.window?.getCurrentWindow();
  if (w) await w.close();
  else window.close();
}

/**
 * Open a page outside the game, from a link's click handler. The desktop app hands it to the system browser
 * (tauri-plugin-opener: src-tauri/capabilities/default.json lists the pages it may open) and returns true, so
 * the link must not also navigate the game window. In a browser tab (development) it returns false and the
 * link opens a new tab itself.
 */
export function openExternal(url: string): boolean {
  if (!isDesktopApp) return false;
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl }) => openUrl(url))
    .catch((e) => console.warn('[platform] could not open', url, e));
  return true;
}

export async function toggleFullscreen(): Promise<void> {
  const w = window.__TAURI__?.window?.getCurrentWindow();
  if (w) {
    await w.setFullscreen(!(await w.isFullscreen()));
    return;
  }
  // a browser tab (development)
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* not allowed here */
  }
}
