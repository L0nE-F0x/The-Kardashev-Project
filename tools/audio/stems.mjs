#!/usr/bin/env node
// Each instrument's share of a track: renders the track once per strip with only that strip sounding (the rest of the
// mix as in the game) and measures it, so a mix nobody can hear can still be balanced.
//
//   node tools/audio/stems.mjs <module> [export=track] [--secs 60] [--mood drive,calm,tension]
//
// Prints, per strip: integrated loudness (LUFS), its distance from the full mix, true peak, spectral centroid.
// Same servers as render.mjs (BASE / CDP / PLAYWRIGHT).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyse } from './analyze.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5317';
const CDP = process.env.CDP ?? 'http://127.0.0.1:9222';
const PW = process.env.PLAYWRIGHT ?? '/home/lonefox/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  if (i < 0) return d;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const secs = Number(opt('secs', '60'));
const mood = (opt('mood', '') || '').split(',').filter(Boolean);
const [mod, name = 'track'] = argv;
if (!mod) {
  console.error('usage: stems.mjs <module> [export] [--secs 60] [--mood …]');
  process.exit(2);
}
let got = null;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method !== 'POST') return void res.end();
  const c = [];
  req.on('data', (x) => c.push(x));
  req.on('end', () => {
    const b = Buffer.concat(c);
    got = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    res.end('ok');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const postTo = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.connectOverCDP(CDP);
const context = await browser.newContext();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stems-'));
const moodObj = { calm: mood.includes('calm'), drive: mood.includes('drive') ? 1 : 0, tension: mood.includes('tension') ? 1 : 0 };
async function one(solo) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.WebSocket = class {
      constructor() { this.readyState = 0; }
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    };
  });
  try {
    await page.goto(`${BASE}/package.json`);
    got = null;
    const meta = await page.evaluate(
      async ({ mod, name, secs, moodObj, solo, postTo }) => {
        const E = await import('/tools/audio/entry.ts');
        if (solo === '?') return { names: await E.trackStrips(mod, name) };
        const r = solo ? await E.renderTrackSolo(mod, name, secs, moodObj, solo, 48000) : await E.renderTrack(mod, name, secs, moodObj, 48000);
        await fetch(postTo, { method: 'POST', body: r.pcm.buffer });
        return { nan: r.nan };
      },
      { mod, name, secs, moodObj, solo, postTo },
    );
    if (meta.names) return meta.names;
    // a minimal 16-bit WAV for ffmpeg's meter
    const n = got.length;
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, got[i])) * 32767), i * 2);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
    h.writeUInt32LE(48000, 24); h.writeUInt32LE(192000, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
    const f = path.join(tmp, `${solo || 'mix'}.wav`);
    fs.writeFileSync(f, Buffer.concat([h, data]));
    return { ...analyse(got, 48000, f), nan: meta.nan };
  } finally {
    await page.close().catch(() => {});
  }
}
try {
  const names = await one('?');
  const mix = await one('');
  console.log(`mix          ${String(mix.lufs).padStart(6)} LUFS  true peak ${mix.truePeak}  centroid ${mix.centroid} Hz  NaN ${mix.nan}`);
  for (const n of names) {
    const a = await one(n);
    const rel = a.lufs === null ? '' : (a.lufs - mix.lufs).toFixed(1).padStart(6);
    console.log(`${n.padEnd(12)} ${String(a.lufs).padStart(6)} LUFS ${rel} re mix  true peak ${String(a.truePeak).padStart(6)}  centroid ${String(a.centroid).padStart(5)} Hz`);
  }
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  server.closeAllConnections?.();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(0);
