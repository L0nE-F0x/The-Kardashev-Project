// Directing by hand: run a script against a game tab that stays open between runs; its snaps come back as one sheet.
// usage: node x.mjs <tab> <script.mjs> [--size WxH[@scale]] [--new] [--cols n] [--full]
//   script: export default async ({ js, step, snap, page }) => { await js(`D.campus('lulea', { light: 'night' })`); await snap('a'); }
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openPage, bootGame } from './cdp.mjs';
const args = process.argv.slice(2);
const flag = (f, has = true) => { const i = args.indexOf(f); if (i < 0) return null; const v = has ? args[i + 1] : true; args.splice(i, has ? 2 : 1); return v; };
const sz = flag('--size'), fresh = flag('--new', false), cols = +(flag('--cols') ?? 2), full = flag('--full', false);
const [name, script] = args;
const HOME = path.join(process.env.HOME, '.cache/kardashev-marketing');
fs.mkdirSync(path.join(HOME, 'tabs'), { recursive: true });
fs.mkdirSync(path.join(HOME, 'x'), { recursive: true });
const f = path.join(HOME, 'tabs', name);
const m = sz?.match(/^(\d+)x(\d+)(?:@([\d.]+))?$/);
let page;
if (!fresh && fs.existsSync(f)) { try { page = await openPage({ attach: fs.readFileSync(f, 'utf8').trim() }); } catch {} }
if (!page) {
  page = await openPage(m ? { width: +m[1], height: +m[2], scale: +(m[3] ?? 1) } : { width: 2560, height: 1440 });
  fs.writeFileSync(f, page.id);
  await bootGame(page);
} else if (m) await page.size(+m[1], +m[2], +(m[3] ?? 1));
await page.js(fs.readFileSync(new URL('./director.js', import.meta.url), 'utf8'));
const base = path.basename(script).replace(/\.mjs$/, '');
const snaps = [];
const snap = async (label) => {
  await page.js('__step(16.667); game.stage.fade = 0');
  const vp = await page.js('({ w: innerWidth, h: innerHeight })');
  const file = path.join(HOME, 'x', `${base}-${label}.jpg`);
  const k = full ? 1 : Math.min(1, 1280 / vp.w);
  const r = await page.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: vp.w, height: vp.h, scale: k } });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  snaps.push(file);
};
const mod = await import(path.resolve(script));
const r = await mod.default({ js: page.js, step: page.step, snap, page });
if (r !== undefined) console.log(typeof r === 'string' ? r : JSON.stringify(r));
if (snaps.length > 1) {
  const c = Math.min(cols, snaps.length), rows = Math.ceil(snaps.length / c);
  const w = Math.floor(1920 / c);
  const out = path.join(HOME, 'x', `${base}.jpg`);
  const ins = snaps.flatMap((s) => ['-i', s]);
  const lay = snaps.map((_, i) => `[${i}:v]scale=${w}:-2[s${i}]`).join(';') + ';' + snaps.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${snaps.length}:layout=${snaps.map((_, i) => `${(i % c) ? Array.from({ length: i % c }, (_, j) => `w${j}`).join('+') : 0}_${Math.floor(i / c) ? Array.from({ length: Math.floor(i / c) }, (_, j) => `h${j * c}`).join('+') : 0}`).join('|')}:fill=black`;
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', lay, '-frames:v', '1', '-q:v', '3', out]);
  if (ff.status) console.error(ff.stderr.toString());
  console.log('sheet:', out, `${c}x${rows}`);
} else if (snaps.length) console.log('snap:', snaps[0]);
if (page.errors.length) console.log('page errors:', page.errors.length);
page.detach();
process.exit(0);
