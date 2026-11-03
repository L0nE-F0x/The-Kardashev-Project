import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

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

export default defineConfig({
  // relative base: works at the site root, on Netlify previews and inside the desktop app
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    preact(),
    screenshotSaver(),
    VitePWA({
      // the site is served from the domain root: absolute URLs work for both / and /play/
      base: '/',
      // we register the service worker ourselves (skipped inside the desktop app)
      injectRegister: null,
      registerType: 'prompt',
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['favicon.ico', 'icons/*.png', 'og-image.png'],
      manifest: {
        id: '/play/',
        name: 'The Kardashev Project',
        short_name: 'Kardashev',
        description: pkg.description,
        start_url: '/play/?app=1',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#0b0a12',
        theme_color: '#0b0a12',
        categories: ['games', 'simulation', 'strategy'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: '/screenshots/map.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'The world map at night' },
          { src: '/screenshots/campus-day.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'A data center campus' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,bin,png,svg,ico,webp,mp3}'],
        // marketing images are for the website, not for offline play
        globIgnores: ['screenshots/**', 'og-image.png', 'globe.png'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        // the installed app opens /play/?app=1 — serve the cached page for it offline
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^app$/],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: 'index.html',
        play: 'play/index.html',
      },
    },
  },
  // fixed address: the desktop app's dev mode (tauri.conf.json devUrl) points here
  server: { port: 5317, strictPort: true, host: '127.0.0.1' },
});
