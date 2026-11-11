// Key art from the stills (capture.mjs --still): the logo and a line over a picture, at the sizes the stores and
// the social sites ask for. Drawn by art.html in Chrome. usage: node art.mjs [id,id,…] [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import { openPage, BASE, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const HOME = path.join(process.env.HOME, '.cache/kardashev-marketing');
const OUT = path.resolve(flag('--out') ?? path.join(HOME, 'art'));
fs.mkdirSync(OUT, { recursive: true });
const wide = (f) => path.join(HOME, 'stills-wide', f), tall = (f) => path.join(HOME, 'stills-tall', f);
const TAG = 'FROM A GARAGE TO A STAR';
const bottom = 'linear-gradient(180deg, rgba(5,4,12,0.25) 0%, rgba(5,4,12,0) 30%, rgba(5,4,12,0) 52%, rgba(5,4,12,0.82) 100%)';
const vignette = 'radial-gradient(ellipse at 50% 50%, rgba(5,4,12,0) 40%, rgba(5,4,12,0.6) 100%)';

/** [id, width, height, scale, { bg, pos, zoom, shade, items }, format] — sizes in CSS px; the file is width×scale wide. */
const ART = [
  // the main piece: the swarm closed round the Sun
  ['KeyArt-4K', 1920, 1080, 2, { bg: wide('type1-5.png'), pos: '50% 40%', shade: `${bottom}, ${vignette}`, items: [
    { logo: true, c: true, css: 'width: 900px; bottom: 150px;' },
    { cls: 'tag', c: true, text: TAG, css: 'font-size: 36px; bottom: 84px; padding-left: 0.2em;' },
  ] }, 'png'],
  // the same without words, for stores that add their own
  ['KeyArt-4K-clean', 1920, 1080, 2, { bg: wide('type1-5.png'), pos: '50% 40%', shade: vignette, items: [] }, 'png'],
  // YouTube thumbnail (1280×720): big enough to read at postage-stamp size
  ['Thumbnail-1280x720', 1280, 720, 1, { bg: wide('type1-5.png'), pos: '50% 36%', zoom: 1.12, shade: `linear-gradient(180deg, rgba(5,4,12,0.1) 0%, rgba(5,4,12,0) 40%, rgba(5,4,12,0.88) 100%)`, items: [
    { logo: true, c: true, css: 'width: 860px; bottom: 96px;' },
    { cls: 'tag', c: true, text: TAG, css: 'font-size: 38px; bottom: 34px; padding-left: 0.2em;' },
  ] }, 'jpg'],
  // X / Twitter header (1500×500; the profile picture covers the lower left, the edges get cropped on phones)
  ['X-Header-1500x500', 1500, 500, 2, { bg: wide('type1-5.png'), pos: '50% 42%', zoom: 1.05, shade: 'linear-gradient(90deg, rgba(5,4,12,0.5) 0%, rgba(5,4,12,0) 45%, rgba(5,4,12,0.55) 100%)', items: [
    { logo: true, css: 'width: 470px; right: 150px; top: 138px;' },
    { cls: 'tag', text: TAG, css: 'font-size: 19px; right: 150px; top: 318px; letter-spacing: 0.21em;' },
  ] }, 'jpg'],
  // a square for feeds
  ['Square-1080', 1080, 1080, 2, { bg: wide('type1-5.png'), pos: '50% 30%', zoom: 1.5, shade: `linear-gradient(180deg, rgba(5,4,12,0.15) 0%, rgba(5,4,12,0) 35%, rgba(5,4,12,0.9) 100%)`, items: [
    { logo: true, c: true, css: 'width: 820px; bottom: 210px;' },
    { cls: 'tag', c: true, text: TAG, css: 'font-size: 33px; bottom: 148px; padding-left: 0.2em;' },
    { cls: 'pill', c: true, text: 'COMING TO STEAM', css: 'font-size: 22px; bottom: 62px;' },
  ] }, 'jpg'],
  // an upright poster (stories, Shorts covers)
  ['Poster-1080x1920', 1080, 1920, 2, { bg: tall('type1-5.png'), pos: '50% 50%', shade: `linear-gradient(180deg, rgba(5,4,12,0.5) 0%, rgba(5,4,12,0) 26%, rgba(5,4,12,0) 58%, rgba(5,4,12,0.9) 100%)`, items: [
    { logo: true, c: true, css: 'width: 920px; bottom: 470px;' },
    { cls: 'tag', c: true, text: TAG, css: 'font-size: 36px; bottom: 396px; letter-spacing: 0.14em; padding-left: 0.14em;' },
    { cls: 'pill', c: true, text: 'COMING TO STEAM', css: 'font-size: 26px; bottom: 270px;' },
  ] }, 'jpg'],
  // the opening picture: where it starts
  ['Art-Earth-2026', 1920, 1080, 2, { bg: wide('earth-night-2.png'), pos: '50% 50%', shade: `linear-gradient(180deg, rgba(5,4,12,0) 55%, rgba(5,4,12,0.7) 100%)`, items: [
    { cls: 'note', c: true, text: 'EARTH · 2026 · 19.6 TERAWATTS · K 0.7290', css: 'font-size: 24px; bottom: 150px; color: #fbd46e; padding-left: 0.26em;' },
    { logo: true, c: true, css: 'width: 300px; bottom: 44px;' },
  ] }, 'jpg'],
];

const only = args[0] ? new Set(args[0].split(',')) : null;
const mime = (f) => (f.endsWith('.png') ? 'image/png' : 'image/jpeg');
for (const [id, w, h, scale, a, fmt] of ART) {
  if (only && !only.has(id)) continue;
  if (!fs.existsSync(a.bg)) { console.log(`${id}: no ${a.bg}`); continue; }
  const page = await openPage({ width: w, height: h, scale, url: `${BASE}/tools/trailer/art.html`, shim: false });
  for (let i = 0; i < 100; i++) { await sleep(100); try { if (await page.js('typeof window.art === "function"')) break; } catch {} }
  const data = `data:${mime(a.bg)};base64,${fs.readFileSync(a.bg).toString('base64')}`;
  // (the picture goes in as a blob: a data URL this long is too much for one script call)
  const CH = 1 << 20;
  await page.js('window.__b = []');
  for (let i = 0; i < data.length; i += CH) await page.js(`window.__b.push(${JSON.stringify(data.slice(i, i + CH))})`);
  await page.js(`(async () => { const r = await fetch(window.__b.join('')); const u = URL.createObjectURL(await r.blob()); await window.art(${JSON.stringify({ ...a, bg: '__BG__' })}.bg === '__BG__' ? { ...${JSON.stringify({ ...a, bg: '' })}, bg: u } : null); })()`);
  await sleep(250);
  const file = path.join(OUT, `${id}.${fmt}`);
  const r = await page.cdp('Page.captureScreenshot', fmt === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 93 });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log(file);
  await page.close();
}
process.exit(0);
