/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  /** Public site origin, e.g. https://thekardashevproject.netlify.app (no trailing slash). */
  readonly VITE_SITE_URL: string;
}

interface Window {
  /** Present inside the Tauri desktop app. */
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: {
    window?: { getCurrentWindow(): { close(): Promise<void>; setFullscreen(v: boolean): Promise<void>; isFullscreen(): Promise<boolean> } };
  };
}
