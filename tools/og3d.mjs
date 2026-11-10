// The website's Open Graph card (public/og-image.png, 1200×630): a campus shot
// (art3d/site/og-source.png, any 16:9 render from the game) with the logo and the pitch in the site's fonts.
//   node tools/og3d.mjs   (needs Playwright + Chrome, like the QA scripts)
//   node tools/og3d.mjs globe [http://127.0.0.1:5317/]   public/globe.png, the landing's Earth without WebGL or scripts: a
//   still of its globe, from a running dev server or preview (transparent round the planet)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b64 = (p) => fs.readFileSync(path.join(root, p)).toString('base64');
const html = `<!doctype html><html><head><style>
@font-face { font-family: 'A'; src: url(data:font/woff2;base64,${b64('src/assets/fonts/atkinson-hyperlegible-next-latin.woff2')}) format('woff2'); font-weight: 200 800; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #07060d; }
.bg { position: absolute; inset: 0; background: url(data:image/png;base64,${b64('art3d/site/og-source.png')}) center 62% / cover; }
.fade { position: absolute; inset: 0; background: linear-gradient(90deg, rgb(7 6 13 / 0.92) 0%, rgb(7 6 13 / 0.78) 34%, rgb(7 6 13 / 0.15) 62%, transparent 75%); }
.text { position: absolute; left: 56px; top: 92px; width: 520px; font-family: 'A'; color: #eeeaf6; }
img { width: 484px; image-rendering: pixelated; display: block; }
p { font-size: 30px; line-height: 1.32; margin: 30px 0 0; font-weight: 600; }
p b { color: #7ff0d3; font-weight: 800; }
.url { position: absolute; right: 26px; bottom: 20px; font-family: 'A'; font-size: 18px; font-weight: 700; color: rgb(255 255 255 / 0.82); text-shadow: 0 1px 6px rgb(0 0 0 / 0.7); }
</style></head><body><div class="bg"></div><div class="fade"></div>
<div class="text"><img src="data:image/png;base64,${b64('public/logo.png')}"><p>A cozy-but-real sim of the AI boom, <b>now in 3D</b>. Build power, chips and compute — and climb the Kardashev scale.</p></div>
<div class="url">thekardashevproject.netlify.app</div></body></html>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
if (process.argv[2] === 'globe') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(process.argv[3] ?? 'http://127.0.0.1:5317/');
  await page.waitForFunction(() => document.getElementById('globe')?.classList.contains('ready'), null, { timeout: 120000 });
  await page.addStyleTag({ content: 'html, body.landing { background: transparent !important; } .hero-globe .glow, .globe-shade, .kbadge { display: none !important; } #globe { width: 540px !important; transition: none !important; }' });
  await page.waitForTimeout(1500);
  await page.locator('#globe').screenshot({ path: path.join(root, 'public/globe.png'), omitBackground: true });
  await browser.close();
  console.log('public/globe.png');
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(root, 'public/og-image.png') });
await browser.close();
console.log('public/og-image.png');
