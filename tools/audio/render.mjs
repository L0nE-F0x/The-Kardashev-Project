#!/usr/bin/env node
// Render the game's music, an instrument demo or the sound effects to WAV (and MP3), offline through the game's own
// mix, and measure it. Nobody can listen in QA: this is how the score is checked.
//
//   node tools/audio/render.mjs track <module> [export]   --secs 90 [--mood drive,calm,tension] [--seed 1]
//   node tools/audio/render.mjs fn <module> <export>      --secs 20          (an instrument demo: export(lab))
//   node tools/audio/render.mjs sfx [id ...]              [--gap 3]
//   common: --out <file.wav> [--mp3 <file.mp3>] [--gain-db 0] [--json]
//
// <module> is a path from the repo root as the dev server serves it, e.g. /src/audio/tracks/era0.ts (export `track`)
// or /src/audio/tracks.ts with export TRACKS.era0. Needs the dev server (BASE, default http://127.0.0.1:5317) and a
// headless Chrome with remote debugging (CDP, default http://127.0.0.1:9222), e.g.
//   google-chrome-stable --headless=new --remote-debugging-port=9222 --user-data-dir=<scratch> about:blank
// PLAYWRIGHT= points at Playwright's index.mjs (default: the npx cache copy). Each run opens its own page on a plain
// JSON URL (no Vite client, so no hot reload can interrupt a render) and closes it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyse, formatAnalysis } from './analyze.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5317';
const CDP = process.env.CDP ?? 'http://127.0.0.1:9222';
const PW = process.env.PLAYWRIGHT ?? '/home/lonefox/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const out = opt('out', null);
const mp3 = opt('mp3', null);
const secs = Number(opt('secs', '60'));
const mood = (opt('mood', '') || '').split(',').filter(Boolean);
const seed = Number(opt('seed', '1'));
const gap = Number(opt('gap', '3'));
const gainDb = Number(opt('gain-db', '0'));
const json = argv.includes('--json') ? (argv.splice(argv.indexOf('--json'), 1), true) : false;
const [mode, ...rest] = argv;
if (!out || !['track', 'fn', 'sfx'].includes(mode)) {
  console.error('usage: render.mjs track|fn|sfx … --out file.wav (see the header)');
  process.exit(2);
}

// the page posts its samples here (interleaved float32)
let got = null;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method !== 'POST') return void res.end();
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const b = Buffer.concat(chunks);
    got = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    res.end('ok');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const postTo = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.connectOverCDP(CDP);
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
});
// no hot reload may reach a render page (other files change while it renders): a WebSocket that never connects
await page.addInitScript(() => {
  window.WebSocket = class {
    constructor() {
      this.readyState = 0;
    }
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
});
const limit = (secs + 60) * 1000;
let meta;
try {
  await page.goto(`${BASE}/package.json`, { waitUntil: 'load' });
  meta = await Promise.race([new Promise((_, no) => setTimeout(() => no(new Error(`render timed out after ${limit / 1000} s`)), limit)), page.evaluate(
    async ({ mode, rest, secs, mood, seed, gap, postTo }) => {
      const E = await import('/tools/audio/entry.ts');
      let r;
      if (mode === 'track') r = await E.renderTrack(rest[0], rest[1] ?? 'track', secs, { calm: mood.includes('calm'), drive: mood.includes('drive') ? 1 : 0, tension: mood.includes('tension') ? 1 : 0 }, 48000, seed);
      else if (mode === 'fn') r = await E.renderFn(rest[0], rest[1] ?? 'demo', secs, 48000);
      else r = await E.renderSfx(rest.length ? rest : ['click', 'hover', 'select', 'confirm', 'error', 'page', 'open', 'close', 'whoosh', 'bubble', 'hello', 'build', 'built', 'cash', 'research', 'trained', 'objective', 'alert', 'achievement', 'fanfare', 'act', 'start', 'decision', 'launch', 'thump', 'jump', 'arc', 'storm'], gap, 48000);
      await fetch(postTo, { method: 'POST', body: r.pcm.buffer });
      return { sr: r.sr, nan: r.nan, ms: Math.round(r.ms), at: r.at ?? null };
    },
    { mode, rest, secs, mood, seed, gap, postTo },
  )]);
} catch (e) {
  console.error(String(e), errors.join('\n'));
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  // the page's keep-alive connection would hold the process open for a minute
  server.closeAllConnections?.();
  server.close();
}
if (!got || !meta) {
  console.error('no audio came back', errors.join('\n'));
  process.exit(1);
}

// write a 24-bit WAV (with the optional gain: previews for listening are raised, measurements are not)
const k = Math.pow(10, gainDb / 20);
const frames = got.length / 2;
const data = Buffer.alloc(frames * 6);
for (let i = 0; i < got.length; i++) {
  const v = Math.max(-1, Math.min(1, got[i] * k));
  const x = Math.round(v * 8388607);
  data.writeIntLE(x, i * 3, 3);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0);
h.writeUInt32LE(36 + data.length, 4);
h.write('WAVEfmt ', 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(2, 22);
h.writeUInt32LE(meta.sr, 24);
h.writeUInt32LE(meta.sr * 6, 28);
h.writeUInt16LE(6, 32);
h.writeUInt16LE(24, 34);
h.write('data', 36);
h.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.concat([h, data]));
if (mp3) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', out, '-b:a', '192k', mp3]);

const a = analyse(got, meta.sr, out, { gainDb });
a.renderMs = meta.ms;
a.realtime = +(secs / (meta.ms / 1000)).toFixed(1);
a.nan = meta.nan;
a.errors = errors;
if (meta.at) a.at = meta.at;
console.log(json ? JSON.stringify(a) : formatAnalysis(a));
process.exit(process.exitCode ?? 0);
