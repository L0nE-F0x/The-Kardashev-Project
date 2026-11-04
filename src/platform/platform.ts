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

/** Save a PNG (the Type I end card) as a download. The Android app can't save images: share or screenshot there. */
export function saveImage(name: string, dataUrl: string): boolean {
  if (androidBridge()) return false;
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
  | { phase: 'downloading'; fraction: number | null }
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

async function checkDesktopUpdate(): Promise<AppUpdate | null> {
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    install(onStatus) {
      let total = 0;
      let got = 0;
      onStatus({ phase: 'downloading', fraction: null });
      void (async () => {
        try {
          await update.downloadAndInstall((e) => {
            if (e.event === 'Started') total = e.data.contentLength ?? 0;
            else if (e.event === 'Progress') {
              got += e.data.chunkLength;
              onStatus({ phase: 'downloading', fraction: total ? Math.min(1, got / total) : null });
            } else if (e.event === 'Finished') onStatus({ phase: 'installing' });
          });
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
