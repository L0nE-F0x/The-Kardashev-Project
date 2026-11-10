/**
 * Renders the brand pictures in 3D, in headless Chrome:
 *   public/logo.png                          the 3D wordmark (tools/brand/logo.ts)
 *   public/favicon.ico, public/icons/*.png   the app icon: the game's own globe on a space tile (tools/brand/icon.ts)
 *   src-tauri/icons/*                        the desktop app's icons (PNG sizes, icon.ico, icon.icns)
 *   public/og-image.png                      the website's social card (tools/og3d.mjs, which sets the logo on it)
 *
 *   npm run gen:assets                 everything
 *   npm run gen:assets -- logo icons   only some of: logo, icons, og
 *
 * Needs Playwright and Chrome, like the QA scripts: PLAYWRIGHT=<path to playwright's index.mjs> if it isn't
 * installed here, CHROME=<binary> (default google-chrome-stable). It starts its own Vite server for the two tool
 * pages (BASE=http://127.0.0.1:5317/ uses a running one) and its own Chrome with the software renderer, so the
 * result doesn't depend on the machine's GPU (CDP=http://127.0.0.1:9222 uses a running Chrome instead: faster).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const TAURI_ICONS = path.join(ROOT, 'src-tauri/icons');
fs.mkdirSync(path.join(PUBLIC, 'icons'), { recursive: true });
fs.mkdirSync(TAURI_ICONS, { recursive: true });

const want = process.argv.slice(2).filter((a) => ['logo', 'icons', 'og'].includes(a));
const doing = (what: string) => want.length === 0 || want.includes(what);

const pngOf = (dataUrl: string): Buffer => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
const sizeOf = (png: Buffer) => `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`;

function write(file: string, data: Buffer, note = ''): void {
  fs.writeFileSync(file, data);
  console.log(`  ${path.relative(ROOT, file)}  ${note}`);
}

/** Windows .ico holding PNG images (Vista and later). */
function icoOf(entries: [size: number, png: Buffer][]): Buffer {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(([size, png], i) => {
    const o = 6 + i * 16;
    header[o] = size >= 256 ? 0 : size;
    header[o + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, o + 4);
    header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(png.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e[1])]);
}

/** macOS .icns holding PNG images, keyed by OSType. */
function icnsOf(entries: [type: string, png: Buffer][]): Buffer {
  const parts = entries.map(([type, png]) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([h, png]);
  });
  const body = Buffer.concat(parts);
  const h = Buffer.alloc(8);
  h.write('icns', 0, 'ascii');
  h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}

if (doing('logo') || doing('icons')) {
  // (Playwright isn't one of the project's packages: it comes from the machine, so it has no types here)
  const playwright: string = process.env.PLAYWRIGHT ?? 'playwright';
  const { chromium } = await import(playwright);
  // the tool pages are TypeScript that imports the game's own code: Vite serves them
  let base = process.env.BASE;
  let server: import('vite').ViteDevServer | null = null;
  if (!base) {
    const { createServer } = await import('vite');
    server = await createServer({
      root: ROOT,
      logLevel: 'error',
      cacheDir: process.env.VITE_CACHE_DIR || path.join(os.tmpdir(), 'kp-vite-gen-assets'),
      server: { port: 5391, strictPort: false, host: '127.0.0.1' },
    });
    await server.listen();
    base = server.resolvedUrls!.local[0];
  }
  const browser = process.env.CDP
    ? await chromium.connectOverCDP(process.env.CDP)
    : await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (process.env.CDP ? browser.contexts()[0] : await browser.newContext()).newPage();
  page.on('pageerror', (e: Error) => console.error('page error:', e.message));
  try {
    if (doing('logo')) {
      console.log('logo');
      await page.goto(new URL('tools/brand/logo.html', base).href);
      await page.waitForFunction('typeof window.renderLogo === "function"', null, { timeout: 120_000 });
      const png = pngOf((await page.evaluate('window.renderLogo()')) as string);
      write(path.join(PUBLIC, 'logo.png'), png, sizeOf(png));
    }
    if (doing('icons')) {
      console.log('icons');
      await page.goto(new URL('tools/brand/icon.html', base).href);
      await page.waitForFunction('typeof window.renderIcons === "function"', null, { timeout: 120_000 });
      const urls = (await page.evaluate('window.renderIcons()')) as Record<string, string>;
      const p = Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, pngOf(v)]));
      const out = (dir: string, file: string, key: string) => write(path.join(dir, file), p[key], sizeOf(p[key]));
      // the website and the game page: the bare globe when small (it reads in a tab), the tile when large
      out(PUBLIC, 'icons/icon-16.png', 'globe16');
      out(PUBLIC, 'icons/icon-32.png', 'globe32');
      out(PUBLIC, 'icons/icon-48.png', 'globe48');
      out(PUBLIC, 'icons/apple-touch-icon.png', 'square180');
      out(PUBLIC, 'icons/icon-192.png', 'tile192');
      out(PUBLIC, 'icons/icon-512.png', 'tile512');
      out(PUBLIC, 'icons/icon-maskable-512.png', 'maskable512');
      write(path.join(PUBLIC, 'favicon.ico'), icoOf([[16, p.globe16], [32, p.globe32], [48, p.globe48]]), '16, 32, 48');
      // the desktop app (Tauri): the bare globe up to 64 px (taskbars, lists), the tile above; macOS gets its own
      // tile with the standard margin
      console.log('desktop icons');
      out(TAURI_ICONS, '32x32.png', 'globe32');
      out(TAURI_ICONS, '64x64.png', 'globe64');
      out(TAURI_ICONS, '128x128.png', 'tile128');
      out(TAURI_ICONS, '128x128@2x.png', 'tile256');
      out(TAURI_ICONS, 'icon.png', 'tile512');
      write(path.join(TAURI_ICONS, 'icon.ico'), icoOf([[16, p.globe16], [24, p.globe24], [32, p.globe32], [48, p.globe48], [64, p.globe64], [256, p.tile256]]), '16, 24, 32, 48, 64, 256');
      write(
        path.join(TAURI_ICONS, 'icon.icns'),
        icnsOf([
          ['icp4', p.globe16],
          ['ic11', p.globe32],
          ['icp5', p.globe32],
          ['ic12', p.globe64],
          ['icp6', p.globe64],
          ['ic07', p.mac128],
          ['ic13', p.mac256],
          ['ic08', p.mac256],
          ['ic14', p.mac512],
          ['ic09', p.mac512],
          ['ic10', p.mac1024],
        ]),
        '16 to 1024',
      );
    }
  } finally {
    await page.close();
    if (!process.env.CDP) await browser.close();
    await server?.close();
  }
}

if (doing('og')) {
  console.log('social card');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/og3d.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exitCode = r.status ?? 1;
}
console.log('done');
process.exit(process.exitCode ?? 0);
