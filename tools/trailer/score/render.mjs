// Render the marketing score to WAV (48 kHz stereo, 24-bit):
//
//   node tools/trailer/score/render.mjs <trailer|teaser|calm|rise|all> [outdir] [--no-stems] [--no-check]
//
// outdir defaults to ~/.cache/kardashev-marketing/score. Writes <piece>.wav, the stems <piece>-music.wav and
// <piece>-fx.wav (same gain as the full mix, so they can be rebalanced), and with the check a spectrogram
// <piece>.png and a per-bar table on the console (analyze.mjs).
//
// Needs two things running (its own, never the capture's 5317 / 9333):
//   VITE_CACHE_DIR=node_modules/.vite-score npx vite --port 5318 --strictPort          (from the repo root)
//   google-chrome-stable --headless=new --remote-debugging-port=9334 \
//     --user-data-dir=$HOME/.cache/kardashev-marketing/chrome-score --autoplay-policy=no-user-gesture-required about:blank
// CDP= / BASE= point elsewhere. The sound is made in the page (an OfflineAudioContext through the game's own mix,
// src/audio/engine.ts) and posted back here; the loudness target and the true-peak ceiling are applied in Node.
// Seeded randomness only, so the same sources give the same music (not the same bytes: see renderPiece in kit.ts;
// two renders differ by rounding noise below −65 dBFS).
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { master, writeWav24, SR } from './master.mjs';
import { analyze } from './analyze.mjs';

process.env.CDP ??= 'http://127.0.0.1:9334';
process.env.BASE ??= 'http://127.0.0.1:5318';
const { openPage, sleep, BASE } = await import('../cdp.mjs');
const { MAP } = await import('../music-map.mjs');

/** Integrated loudness targets (LUFS). */
const TARGET = { trailer: -14, teaser: -14, calm: -15, rise: -14 };
/** The game's mix delays everything by its two compressors' look-ahead: 2 × 6 ms (measured with an impulse). */
const LATENCY = 576;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const which = args[0] ?? 'all';
const outdir = path.resolve(args[1] ?? path.join(os.homedir(), '.cache/kardashev-marketing/score'));
const names = which === 'all' ? Object.keys(TARGET) : [which];
for (const n of names) if (!(n in TARGET)) throw new Error(`unknown piece "${n}" (trailer, teaser, calm, rise, all)`);
fs.mkdirSync(outdir, { recursive: true });

// the page posts its samples here (interleaved 32-bit floats)
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
const postTo = `http://127.0.0.1:${server.address().port}/pcm`;

const page = await openPage({ url: `${BASE}/tools/trailer/score/page.html`, shim: false, width: 640, height: 360 });
try {
  const ready = async () => {
    for (let i = 0; ; i++) {
      await sleep(100);
      if (await page.js('!!window.__ready').catch(() => false)) return;
      if (i > 300) throw new Error('the render page did not load (is Vite running on BASE?)');
    }
  };
  await ready();
  const pcm = async (name, stem) => {
    // Vite reloads the page when a source file has just been saved: wait for it and render again
    for (let attempt = 0; ; attempt++) {
      got = null;
      try {
        const info = await page.js(`window.__render(${JSON.stringify(name)}, ${JSON.stringify(stem)}, ${JSON.stringify(postTo)})`);
        if (!got || got.length !== info.frames * 2 || info.sampleRate !== SR) throw new Error(`${name}/${stem}: the samples did not arrive`);
        return { inter: got, ms: info.ms };
      } catch (e) {
        if (attempt >= 3 || !/navigated or closed|context was destroyed|__render is not a function/.test(String(e.message))) throw e;
        await ready();
      }
    }
  };
  for (const name of names) {
    const { bars, tail } = MAP[name];
    const seconds = bars * 2 + tail;
    const full = await pcm(name, 'full');
    const m = master(full.inter, { seconds, latency: LATENCY, target: TARGET[name] });
    const file = path.join(outdir, `${name}.wav`);
    writeWav24(file, m.L, m.R);
    console.log(`${name}: ${seconds} s rendered in ${(full.ms / 1000).toFixed(1)} s → ${file}`);
    console.log(`  ${m.lufs.toFixed(2)} LUFS integrated, true peak ${m.truePeak.toFixed(2)} dBTP; final gain ${m.gainDb.toFixed(2)} dB, limiter: up to ${m.maxReductionDb.toFixed(2)} dB on ${(m.limitedShare * 100).toFixed(2)}% of the samples`);
    if (!flags.has('--no-stems'))
      for (const stem of ['music', 'fx']) {
        const s = await pcm(name, stem);
        const ms = master(s.inter, { seconds, latency: LATENCY, target: 0, gainDb: m.gainDb });
        writeWav24(path.join(outdir, `${name}-${stem}.wav`), ms.L, ms.R);
        console.log(`  stem ${name}-${stem}.wav: ${ms.lufs.toFixed(2)} LUFS, true peak ${ms.truePeak.toFixed(2)} dBTP`);
      }
    if (!flags.has('--no-check')) await analyze(file, name, { png: path.join(outdir, `${name}.png`) });
  }
} finally {
  await page.close();
  server.close();
}
