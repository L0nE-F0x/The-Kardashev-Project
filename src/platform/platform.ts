/**
 * Where the game is running and what the host can do: browser, installed web app (PWA) or the
 * desktop app. Game code talks to this module only, so the desktop shell (Tauri today, maybe
 * Electron for Steam later) can be swapped without touching the game.
 */

export const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const REPO = 'L0nE-F0x/The-Kardashev-Project';

/** The Android app (the live site in the app's own WebView): always the latest release's APK. */
export const ANDROID_APK_URL = `https://github.com/${REPO}/releases/latest/download/TheKardashevProject-android.apk`;

const LAUNCH_KEY = 'kardashev.launchedAsApp';
try {
  // the installed web app starts at /play/?app=1 (the manifest's start_url), the Android app at /play/?app=android
  const app = new URLSearchParams(window.location.search).get('app');
  if (app !== null) window.sessionStorage.setItem(LAUNCH_KEY, app || '1');
} catch {
  /* storage blocked */
}

/** What the Android app (android/app/src/main/java/…/LauncherActivity.java) gives the page. */
interface AndroidBridge {
  saveFile(name: string, text: string): void;
  /** v0.6.0 and later: save a PNG (base64) through the phone's save-as screen. */
  saveImage?(name: string, base64: string): void;
  /** Since v0.5.1: download this APK and hand it to the phone's installer; progress comes back through window.kpUpdateStatus. */
  installUpdate?(url: string): void;
}

function androidBridge(): AndroidBridge | null {
  return (typeof window !== 'undefined' && (window as Window & { KardashevAndroid?: AndroidBridge }).KardashevAndroid) || null;
}

/** Running inside the Android app. */
export function isAndroidApp(): boolean {
  if (androidBridge()) return true;
  try {
    return window.sessionStorage.getItem(LAUNCH_KEY) === 'android';
  } catch {
    return false;
  }
}

// The Android app pads its WebView clear of the camera cutout itself, but the WebView still reports the cutout as
// safe-area insets: without this the HUD would sit a cutout's width further in (styles.css, --safe-*).
try {
  if (isAndroidApp()) document.documentElement.classList.add('native-insets');
} catch {
  /* not a browser */
}

export function isStandalone(): boolean {
  if (isDesktopApp || isAndroidApp()) return true;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    // The manifest asks for fullscreen, but F11 or a tiling window manager's fullscreen matches too:
    // only trust it when this session was launched from the installed app.
    return window.matchMedia('(display-mode: fullscreen)').matches && window.sessionStorage.getItem(LAUNCH_KEY) !== null;
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export function isPhone(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  } catch {
    return false;
  }
}

/** Save a text file: the Android app asks where to put it; everywhere else it's a download. */
export function saveTextFile(name: string, text: string, type = 'application/json'): void {
  const bridge = androidBridge();
  if (bridge) return bridge.saveFile(name, text);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Save a PNG (the Type I end card): a download in the browser, the phone's save-as screen in the Android app. False in Android apps older than v0.6.0. */
export function saveImage(name: string, dataUrl: string): boolean {
  const bridge = androidBridge();
  if (bridge) {
    if (!bridge.saveImage) return false;
    bridge.saveImage(name, dataUrl.slice(dataUrl.indexOf(',') + 1));
    return true;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/** Share a PNG through the phone's share sheet, where the browser supports it. */
export async function shareImage(name: string, dataUrl: string, text: string): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (!nav.share) return false;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], name, { type: 'image/png' });
    const data: ShareData = { files: [file], text, title: 'The Kardashev Project' };
    if (nav.canShare && !nav.canShare(data)) return false;
    await nav.share(data);
    return true;
  } catch {
    return false;
  }
}

/** Whether this browser can share images at all (for showing the button). */
export function canShareImages(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !androidBridge();
}

/**
 * The Android app's back gesture calls this first: return true when it closed something; when
 * nothing was open the app goes to the background.
 */
export function onHostBack(fn: () => boolean): void {
  if (typeof window !== 'undefined') (window as Window & { kpBack?: () => boolean }).kpBack = fn;
}

// ── in-app updates for the installed apps ───────────────────────────────────────────────────
// The browser and the installed web app update through the service worker (registerServiceWorker).
// The desktop app carries its own copy of the game, so it updates itself from GitHub releases (Tauri's
// updater: signed, see plugins.updater in src-tauri/tauri.conf.json). The Android app already runs the
// live site, so this only updates the small app around it, from the latest release's APK.

export type AppUpdateStatus =
  | { phase: 'ready' }
  | { phase: 'downloading'; fraction: number | null; attempt?: number }
  | { phase: 'permission' } // Android: allow the app to install updates
  | { phase: 'installing' }
  | { phase: 'browser' } // Android apps from before v0.5.1: the APK downloads in the browser
  | { phase: 'cancelled' }
  | { phase: 'failed'; reason: string };

/** A newer release of the installed app. */
export interface AppUpdate {
  version: string;
  /** Download and install it. The desktop app restarts into the new version; Android hands over to its installer. */
  install(onStatus: (s: AppUpdateStatus) => void): void;
}

/** x.y.z → one comparable number (the Android versionCode formula in android/app/build.gradle). */
function versionNumber(v: string): number {
  const [a = 0, b = 0, c = 0] = v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  return a * 10000 + b * 100 + c;
}

/** Is there a newer release of this installed app? Null in the browser, in dev, offline, or when up to date. */
export async function checkAppUpdate(): Promise<AppUpdate | null> {
  if (!import.meta.env.PROD) return null;
  try {
    if (isDesktopApp) return await checkDesktopUpdate();
    if (isAndroidApp()) return await checkAndroidUpdate();
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

async function checkAndroidUpdate(): Promise<AppUpdate | null> {
  // the app's own version (its user agent ends in KardashevAndroid/x.y.z), not the website's
  const current = /KardashevAndroid\/([\d.]+)/.exec(navigator.userAgent)?.[1];
  if (!current) return null;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const release = (await res.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] };
  const latest = release.tag_name?.replace(/^v/, '');
  const apk = release.assets?.find((a) => a.name === 'TheKardashevProject-android.apk')?.browser_download_url;
  if (!latest || !apk || versionNumber(latest) <= versionNumber(current)) return null;
  return {
    version: latest,
    install(onStatus) {
      const bridge = androidBridge();
      if (!bridge?.installUpdate) {
        // the app opens links outside the game in the browser, which downloads the APK
        window.location.href = apk;
        onStatus({ phase: 'browser' });
        return;
      }
      (window as Window & { kpUpdateStatus?: (phase: string, detail?: string) => void }).kpUpdateStatus = (phase, detail) => {
        if (phase === 'failed') onStatus({ phase, reason: detail || 'unknown error' });
        else if (phase === 'downloading') onStatus({ phase, fraction: null });
        else if (phase === 'permission' || phase === 'installing' || phase === 'cancelled') onStatus({ phase });
      };
      bridge.installUpdate(apk);
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
 * the link must not also navigate the game window. Everywhere else it returns false and the link does it
 * itself: a new tab in the browser and the installed web app; the Android app's WebView sends every page
 * outside /play to the phone's browser (LauncherActivity#shouldOverrideUrlLoading).
 */
export function openExternal(url: string): boolean {
  if (!isDesktopApp) return false;
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl }) => openUrl(url))
    .catch((e) => console.warn('[platform] could not open', url, e));
  return true;
}

/** The browser can put the page in fullscreen (Android Chrome yes; iPhone Safari no). */
export function canFullscreen(): boolean {
  if (isDesktopApp) return false;
  try {
    return !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';
  } catch {
    return false;
  }
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}

/**
 * Phones in a browser tab: go fullscreen (hiding the address bar and system bars) and hold
 * landscape. Must run inside a tap. Resolves false when the browser refuses.
 */
export async function enterFullscreen(): Promise<boolean> {
  if (!canFullscreen() || isFullscreen()) return isFullscreen();
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    return false;
  }
  try {
    // only works in fullscreen, and only on phones and tablets
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* not supported here */
  }
  return true;
}

export async function toggleFullscreen(): Promise<void> {
  const w = window.__TAURI__?.window?.getCurrentWindow();
  if (w) {
    await w.setFullscreen(!(await w.isFullscreen()));
    return;
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await enterFullscreen();
  } catch {
    /* not allowed here (iOS) */
  }
}

// ── install prompt (Chromium/Android) ───────────────────────────────────────────────────────
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();

export function initInstallPrompt(): void {
  if (isDesktopApp) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((fn) => fn());
  });
}

export function onInstallChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

export function canPromptInstall(): boolean {
  return !!deferredPrompt;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installListeners.forEach((fn) => fn());
  return choice.outcome === 'accepted';
}

/** How the player installs here when there is no prompt to show. */
export function installHelp(): 'ios' | 'safari-mac' | 'android' | 'menu' | null {
  if (isDesktopApp || isStandalone()) return null;
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  const ua = navigator.userAgent;
  if (ua.includes('Safari') && !ua.includes('Chrome') && ua.includes('Mac')) return 'safari-mac';
  return 'menu';
}

// ── service worker (offline play + updates) ────────────────────────────────────────────────
export async function registerServiceWorker(onUpdateReady: (apply: () => void) => void): Promise<void> {
  if (isDesktopApp || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const { Workbox } = await import('workbox-window');
    const wb = new Workbox('/sw.js', { scope: '/' });
    wb.addEventListener('waiting', () => {
      onUpdateReady(() => {
        wb.addEventListener('controlling', () => window.location.reload());
        wb.messageSkipWaiting();
      });
    });
    await wb.register();
  } catch {
    /* offline support is a bonus, never a blocker */
  }
}
