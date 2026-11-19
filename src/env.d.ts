/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
/** Whether public/audio/theme.mp3 was there at build time. */
declare const __HAS_THEME__: boolean;
/** Whether this build was compiled with KP_STEAM=1 (disables GitHub self-updater). */
declare const __STEAM_BUILD__: boolean;

interface ImportMetaEnv {
  /** Public site origin, e.g. https://thekardashevproject.netlify.app (no trailing slash). */
  readonly VITE_SITE_URL: string;
}

interface KardashevDesktopBridge {
  readonly isSteam: boolean;
  saveFile(name: string, bytes: Uint8Array, kind: 'picture' | 'document'): Promise<string>;
  quit(): Promise<void>;
  restart(): Promise<void>;
  toggleFullscreen(): Promise<void>;
  openExternal(url: string): Promise<void>;
  gpuGet(): Promise<import('./platform/platform').GpuStatus>;
  gpuSet(prefer: 'auto' | 'strong'): Promise<void>;
  gpuKeep(): Promise<void>;
  checkUpdate(): Promise<{ version: string } | null>;
  installUpdate(): Promise<void>;
  onUpdateStatus(cb: (status: import('./platform/platform').AppUpdateStatus) => void): () => void;
}

interface Window {
  /** Present inside the Electron desktop app (exposed via contextBridge in electron/preload.cjs). */
  kardashevDesktop?: KardashevDesktopBridge;
}
