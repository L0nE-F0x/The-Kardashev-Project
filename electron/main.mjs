/**
 * Electron desktop shell for The Kardashev Project (Windows, macOS, Linux & Steam).
 * Serves the bundled `dist/` over an isolated `app://localhost` origin so ES modules, Web Workers,
 * WebGL2, and WebAudio run identically across every operating system without local ports.
 */
import { app, BrowserWindow, ipcMain, Menu, protocol, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGpuManager } from './gpu.mjs';
import { writeSavedFile } from './savefile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const ICON_PNG = path.join(__dirname, 'icons/icon.png');

app.setName('The Kardashev Project');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.lonefox.kardashevproject');
}

/** True when built for Steam (`KP_STEAM=1`) or launched by the Steam client (`SteamAppId` / `steam_appid.txt`). */
const isSteam =
  process.env.KP_STEAM === '1' ||
  process.env.KP_STEAM === 'true' ||
  Boolean(process.env.SteamAppId || process.env.STEAM_APPID || process.env.SteamGameId) ||
  fs.existsSync(path.join(path.dirname(process.execPath), 'steam_appid.txt'));

// ── Engine switches (must run before `app.whenReady()` spawns the GPU and audio processes) ────────────────
// Desktop games should play title music on launch without waiting for a browser-tab click gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Never fall back to software SwiftShader because of conservative browser driver blocklists.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

if (process.platform === 'linux' && !app.commandLine.hasSwitch('ozone-platform') && !app.commandLine.hasSwitch('ozone-platform-hint')) {
  // Under Steam / Steam Deck Gamescope, X11/XWayland lets Steam's Shift+Tab overlay hook cleanly;
  // standalone desktop launches use native Wayland on Wayland compositors (crisp fractional scaling) and X11 on X11.
  if (isSteam && process.env.DISPLAY && !process.env.KP_WAYLAND) {
    app.commandLine.appendSwitch('ozone-platform', 'x11');
  } else {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  }
}

const gpu = createGpuManager(app.getPath('userData'));
gpu.applyAtStart(app);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const isRelaunch = process.argv.includes('--kp-relaunch') || process.env.KP_MULTI_INSTANCE === '1';
if (!isRelaunch && !app.requestSingleInstanceLock()) {
  app.quit();
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const ALLOWED_HOSTS = new Set(['ame-apexforge.org', 'www.ame-apexforge.org', 'thekardashevproject.netlify.app', 'github.com']);

function isAllowedExternal(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    title: 'The Kardashev Project',
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 540,
    center: true,
    resizable: true,
    fullscreen: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0a12',
    ...(process.platform !== 'darwin' && fs.existsSync(ICON_PNG) ? { icon: ICON_PNG } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: isSteam ? ['--kp-steam=1'] : [],
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.KP_DEV_URL;
    if (url.startsWith('app://localhost/') || (devUrl && url.startsWith(devUrl))) return;
    event.preventDefault();
    if (isAllowedExternal(url)) void shell.openExternal(url);
  });

  const startUrl = process.env.KP_DEV_URL || 'app://localhost/play/index.html';
  void win.loadURL(startUrl);
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────────────────────────────────
ipcMain.handle('kp:save-file', (_event, payload) => {
  const { name, bytes, kind } = payload ?? {};
  const home = (() => {
    try {
      return app.getPath('home');
    } catch {
      return '';
    }
  })();
  const wanted = kind === 'picture' ? 'pictures' : 'documents';
  const fallbackSub = kind === 'picture' ? 'Pictures' : 'Documents';
  let baseDir = null;
  for (const key of [wanted, 'downloads', 'home']) {
    try {
      const candidate = app.getPath(key);
      if (!candidate) continue;
      // On Linux systems without ~/.config/user-dirs.dirs, XDG resolves 'pictures'/'documents' to $HOME itself.
      if (key === wanted && home && candidate === home && fs.existsSync(path.join(home, fallbackSub))) {
        baseDir = path.join(home, fallbackSub);
      } else {
        baseDir = candidate;
      }
      break;
    } catch {
      /* try next fallback */
    }
  }
  if (!baseDir) throw new Error('no writable user folder');
  return writeSavedFile({ baseDir, name, bytes });
});

ipcMain.handle('kp:quit', () => {
  app.quit();
});

ipcMain.handle('kp:restart', () => {
  const cleanArgs = process.argv.slice(1).filter((a) => a !== '--kp-relaunch');
  app.relaunch({ args: [...cleanArgs, '--kp-relaunch'] });
  app.exit(0);
});

ipcMain.handle('kp:toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (win) win.setFullScreen(!win.isFullScreen());
});

ipcMain.handle('kp:open-external', async (_event, url) => {
  if (isAllowedExternal(url)) await shell.openExternal(url);
});

ipcMain.handle('kp:gpu-get', () => gpu.getStatus(app));
ipcMain.handle('kp:gpu-set', (_event, prefer) => gpu.setPreference(prefer));
ipcMain.handle('kp:gpu-keep', () => gpu.keep());

// ── Self-updater (GitHub Releases only; strictly disabled on Steam and in dev) ────────────────────────────
let updaterReady = null;
let updateInstalling = false;

async function getAutoUpdater() {
  if (isSteam || !app.isPackaged) return null;
  if (updaterReady) return updaterReady;
  try {
    const mod = await import('electron-updater');
    const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater;
    if (!autoUpdater) return null;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    // Builds are not Authenticode-signed yet; SHA-512 against latest*.yml still verifies integrity.
    if ('verifyUpdateCodeSignature' in autoUpdater) autoUpdater.verifyUpdateCodeSignature = false;
    autoUpdater.on('download-progress', (info) => {
      const fraction = typeof info?.percent === 'number' ? Math.max(0, Math.min(1, info.percent / 100)) : null;
      mainWindow?.webContents.send('kp:update-status', { phase: 'downloading', fraction });
    });
    updaterReady = autoUpdater;
    return autoUpdater;
  } catch {
    return null;
  }
}

ipcMain.handle('kp:update-check', async () => {
  const autoUpdater = await getAutoUpdater();
  if (!autoUpdater) return null;
  // On Linux, electron-updater only self-updates AppImages ($APPIMAGE set), not system .deb packages.
  if (process.platform === 'linux' && !process.env.APPIMAGE) return null;
  try {
    const res = await autoUpdater.checkForUpdates();
    const next = res?.updateInfo?.version;
    if (!next || next === app.getVersion()) return null;
    return { version: next };
  } catch {
    return null;
  }
});

ipcMain.handle('kp:update-install', async () => {
  if (updateInstalling) return;
  const autoUpdater = await getAutoUpdater();
  if (!autoUpdater) throw new Error('Updates are unavailable in this build.');
  updateInstalling = true;
  try {
    mainWindow?.webContents.send('kp:update-status', { phase: 'downloading', fraction: null });
    await autoUpdater.downloadUpdate();
    mainWindow?.webContents.send('kp:update-status', { phase: 'installing' });
    // Let the renderer flush any final UI frame before replacing and restarting the app.
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 150);
  } catch (err) {
    updateInstalling = false;
    throw err;
  }
});

// ── Boot & custom protocol ────────────────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    try {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const filePath = path.resolve(DIST_DIR, '.' + rel);
      if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fs.promises.readFile(filePath);
      const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.get('range');
      if (range && range.startsWith('bytes=')) {
        const [s, e] = range.slice(6).split('-');
        const start = Number.parseInt(s, 10) || 0;
        const end = e ? Math.min(data.byteLength - 1, Number.parseInt(e, 10)) : data.byteLength - 1;
        if (start >= 0 && start <= end && end < data.byteLength) {
          return new Response(data.subarray(start, end + 1), {
            status: 206,
            headers: {
              'Content-Type': mime,
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${end}/${data.byteLength}`,
              'Content-Length': String(end - start + 1),
            },
          });
        }
      }
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(data.byteLength),
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
