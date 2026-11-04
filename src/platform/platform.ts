/**
 * Where the game is running and what the host can do: browser, installed web app (PWA) or the
 * desktop app. Game code talks to this module only, so the desktop shell (Tauri today, maybe
 * Electron for Steam later) can be swapped without touching the game.
 */

export const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** The Android app (the live site in the app's own WebView): always the latest release's APK. */
export const ANDROID_APK_URL = 'https://github.com/L0nE-F0x/The-Kardashev-Project/releases/latest/download/TheKardashevProject-android.apk';

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

/**
 * The Android app's back gesture calls this first: return true when it closed something; when
 * nothing was open the app goes to the background.
 */
export function onHostBack(fn: () => boolean): void {
  if (typeof window !== 'undefined') (window as Window & { kpBack?: () => boolean }).kpBack = fn;
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
