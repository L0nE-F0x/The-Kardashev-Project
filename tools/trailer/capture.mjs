// Records the shots in shots.mjs from the running game, frame by frame on a virtual clock (60 fps exactly).
// Needs the dev server and the headless Chrome on the real GPU (CLAUDE.md, "QA"; here on port 9333).
// usage: node capture.mjs [id,id,…|all] [--view wide|tall] [--still] [--out dir] [--fps 60]
//   wide = 2560×1440 (interface shots: a 1280×720 page at 2×, so the interface reads on a phone)
//   tall = 1080×1920 for the vertical cuts (interface shots are left out: the game has no portrait layout)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openPage, bootGame } from './cdp.mjs';
import { SHOTS } from './shots.mjs';

const args = process.argv.slice(2);
const flag = (f, has = true) => { const i = args.indexOf(f); if (i < 0) return null; const v = has ? args[i + 1] : true; args.splice(i, has ? 2 : 1); return v; };
const view = flag('--view') ?? 'wide';
const still = flag('--still', false);
// --preview: three small frames of each shot (start, middle, end) on one sheet, to direct by
const preview = flag('--preview', false);
const FPS = +(flag('--fps') ?? 60);
const HOME = path.join(process.env.HOME, '.cache/kardashev-marketing');
const OUT = path.resolve(flag('--out') ?? path.join(HOME, still ? 'stills-' + view : 'clips-' + view));
const only = args[0] && args[0] !== 'all' ? new Set(args[0].split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });

const SIZES = { wide: { clean: [2560, 1440, 1], hud: [1280, 720, 2] }, tall: { clean: [1080, 1920, 1] }, still: { clean: [1920, 1080, 2], hud: [1280, 720, 3] } };
if (view === 'tall') SIZES.still = { clean: [1080, 1920, 2] };
if (preview) { SIZES.wide = { clean: [1280, 720, 1], hud: [1280, 720, 1] }; SIZES.tall = { clean: [540, 960, 1] }; }
const sheet = [];
const director = fs.readFileSync(new URL('./director.js', import.meta.url), 'utf8');
const todo = SHOTS.filter((s) => (!only || only.has(s.id)) && (only || !s.skip) && (view !== 'tall' || (s.kind ?? 'clean') === 'clean'));
if (!todo.length) { console.error('no such shot'); process.exit(1); }

// one tab per kind of page (a resize mid-run leaves the interface laid out for the old size)
const pages = {};
async function pageFor(kind) {
  if (pages[kind]) return pages[kind];
  const [w, h, scale] = (still ? SIZES.still : SIZES[view])[kind];
  const page = await openPage({ width: w, height: h, scale });
  await bootGame(page);
  await page.js(`document.getElementById('boot')?.remove(); document.getElementById('bootveil')?.remove();`);
  await page.js(director);
  await page.js(`D.tall = ${view === 'tall'}`);
  return (pages[kind] = page);
}

for (const shot of todo) {
  const t0 = Date.now();
  const kind = shot.kind ?? 'clean';
  const page = await pageFor(kind);
  const { js, cdp } = page;
  const ms = 1000 / FPS;
  await js(`D.ui(${kind === 'hud'}); D.keys = null; D.each = null; D.post = null; D.cards = false; D.shot = {};`);
  await js(`(async () => { ${shot.setup} })()`);
  if (view === 'tall' && shot.tall) await js(`(async () => { ${shot.tall} })()`);
  // let the scene settle (shaders, people finding their places, smoke filling in) with the camera on its first frame
  await js(`(async () => { D.pose(0); await D.runAsync(${shot.warm ?? 90}, ${ms}, () => { D.pose(0); }); await D.loaded(120, 3000); })()`);
  if (shot.after) await js(`(async () => { ${shot.after} })()`);
  const n = Math.round(shot.secs * FPS);
  const rate = shot.rate ?? 1;
  const frame = (f) => js(`(() => { const u = ${n > 1 ? f / (n - 1) : 0}; D.pose(u); D.each?.(u, ${f}); __step(${ms * rate}); game.stage.fade = 0; D.post?.(u, ${f}); if (D.ptr) D.ptrDraw(); })()`);
  if (preview) {
    const at = shot.preview ?? [0, 0.5, 1];
    let f = 0;
    for (const [k, u] of at.entries()) {
      const target = Math.round(u * (n - 1));
      for (; f <= target; f++) await frame(f);
      const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
      const file = path.join(HOME, 'x', `p-${shot.id}-${k}.jpg`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      sheet.push(file);
    }
    const errs = await js(`(() => { const e = window.__errs ? window.__errs + ' frame errors: ' + window.__lastErr : ''; window.__errs = 0; return e + (D.shot.log ? ' ' + D.shot.log.join('; ') : ''); })()`);
    console.log(`${shot.id}: previewed in ${((Date.now() - t0) / 1000).toFixed(1)}s${page.errors.length ? ' · page errors: ' + page.errors.length : ''} ${errs}`);
    page.errors.length = 0;
    continue;
  }
  if (still) {
    const at = shot.still ?? [0.5];
    let f = 0;
    for (const [k, u] of at.entries()) {
      const target = Math.round(u * (n - 1));
      for (; f <= target; f++) await frame(f);
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `${shot.id}${at.length > 1 ? '-' + (k + 1) : ''}.png`), Buffer.from(data, 'base64'));
    }
    console.log(`${shot.id}: ${at.length} still(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    continue;
  }
  const file = path.join(OUT, `${shot.id}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '11', '-pix_fmt', 'yuv444p', '-color_range', 'pc', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < n; f++) {
    await frame(f);
    const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 97 });
    const buf = Buffer.from(data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f === Math.floor(n * 0.5)) fs.writeFileSync(path.join(OUT, `${shot.id}.jpg`), buf);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  const took = (Date.now() - t0) / 1000;
  const note = await js(`(() => { const e = window.__errs ? window.__errs + ' frame errors: ' + window.__lastErr : ''; window.__errs = 0; return e + (D.shot.log ? ' ' + D.shot.log.join('; ') : ''); })()`);
  if (note) console.log('  ', note);
  console.log(`${shot.id}: ${n} frames in ${took.toFixed(1)}s (${(n / took).toFixed(1)} fps)${page.errors.length ? ' · page errors: ' + page.errors.length : ''}`);
  page.errors.length = 0;
}
if (sheet.length) {
  // rows of three (one shot a row), six shots a sheet
  const { spawnSync } = await import('node:child_process');
  const cols = view === 'tall' ? 9 : 3, w = view === 'tall' ? 212 : 640, h = view === 'tall' ? 377 : 360, per = (view === 'tall' ? 3 : 6) * cols;
  for (let k = 0; k * per < sheet.length; k++) {
    const part = sheet.slice(k * per, (k + 1) * per);
    const lay = part.map((_, i) => `[${i}:v]scale=${w}:${h}[s${i}]`).join(';') + ';' + part.map((_, i) => `[s${i}]`).join('') +
      `xstack=inputs=${part.length}:layout=${part.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|')}:fill=black`;
    const out = path.join(HOME, 'x', `preview-${view}-${k}.jpg`);
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...part.flatMap((f) => ['-i', f]), '-filter_complex', part.length > 1 ? lay : `[0:v]scale=${w}:${h}`, '-frames:v', '1', '-q:v', '3', out]);
    if (r.status) console.error(r.stderr.toString());
    console.log('sheet:', out, todo.slice(k * per / 3, (k + 1) * per / 3).map((x) => x.id).join(' '));
  }
}
for (const p of Object.values(pages)) await p.close();
process.exit(0);
