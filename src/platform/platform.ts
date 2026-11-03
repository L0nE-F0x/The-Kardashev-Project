/**
 * Where the game is running and what the host can do: browser, installed web app (PWA) or the
 * desktop app. Game code talks to this module only, so the desktop shell (Tauri today, maybe
 * Electron for Steam later) can be swapped without touching the game.
 */

export const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function isStandalone(): boolean {
  if (isDesktopApp) return true;
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}

export function isPhone(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  } catch {
    return false;
  }
}

export async function quitApp(): Promise<void> {
  const w = window.__TAURI__?.window?.getCurrentWindow();
  if (w) await w.close();
  else window.close();
}

export async function toggleFullscreen(): Promise<void> {
  const w = window.__TAURI__?.window?.getCurrentWindow();
  if (w) {
    await w.setFullscreen(!(await w.isFullscreen()));
    return;
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
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
export function installHelp(): 'ios' | 'safari-mac' | 'menu' | null {
  if (isDesktopApp || isStandalone()) return null;
  if (isIOS()) return 'ios';
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
