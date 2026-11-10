import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string; description: string };

/** Dev-server only: lets the game POST crisp PNG screenshots into public/screenshots/. */
function screenshotSaver(): Plugin {
  return {
    name: 'kp-screenshot-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__screenshot', (req, res) => {
        // same-origin PNG uploads only: a non-simple content type forces a CORS preflight,
        // which the dev server refuses for other sites
        const origin = req.headers.origin;
        const sameOrigin = !origin || /^http:\/\/(127\.0\.0\.1|localhost):5317$/.test(origin);
        if (req.method !== 'POST' || req.headers['content-type'] !== 'image/png' || !sameOrigin) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const name = (new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? 'shot').replace(/[^a-z0-9-]/gi, '') || 'shot';
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync('public/screenshots', { recursive: true });
          writeFileSync(`public/screenshots/${name}.png`, Buffer.concat(chunks));
          res.end('saved');
        });
      });
    },
  };
}

/**
 * Two things are built from this repo, each into its own folder:
 *   - the game (`npm run build` → dist/): play/index.html, bundled into the desktop app by Tauri;
 *   - the website (`npm run build:site` → dist-site/): index.html, what Netlify serves. The game is not on it.
 * Both share public/, so each build drops the files only the other one uses.
 */
const SITE = process.env.KP_TARGET === 'site';
const OUT = SITE ? 'dist-site' : 'dist';
/** public/ files the website doesn't serve, and the ones the app doesn't carry. */
const NOT_ON_SITE = ['3d', 'audio'];
const NOT_IN_APP = ['screenshots', 'og-image.png', 'globe.png', 'robots.txt', 'sitemap.xml', 'sw.js'];

function pruneOutput(): Plugin {
  return {
    name: 'kp-prune-output',
    apply: 'build',
    closeBundle() {
      for (const name of SITE ? NOT_ON_SITE : NOT_IN_APP) rmSync(resolve(OUT, name), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  // relative base: works at the site root, on Netlify previews and inside the desktop app (tauri://localhost/play/)
  base: './',
  // helper checkouts that share one node_modules (a symlink) keep their own dependency cache
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    preact(),
    screenshotSaver(),
    pruneOutput(),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1800,
    outDir: OUT,
    rollupOptions: {
      input: SITE ? { main: 'index.html' } : { play: 'play/index.html' },
    },
  },
  // fixed address: the desktop app's dev mode (tauri.conf.json devUrl) points here
  server: { port: 5317, strictPort: true, host: '127.0.0.1' },
});
