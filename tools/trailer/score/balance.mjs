// The mix, a strip at a time:  node tools/trailer/score/balance.mjs <piece>
// Renders the piece once per channel strip with only that strip sounding (through the game's mix, at the piece's
// level) and prints each strip's loudness in every cue of the map: what carries a section, and what cannot be heard.
// Same servers as render.mjs. A development aid; nothing is written.
import http from 'node:http';
import { kWeight, loudnessOf, SR } from './master.mjs';

process.env.CDP ??= 'http://127.0.0.1:9334';
process.env.BASE ??= 'http://127.0.0.1:5318';
const { openPage, sleep, BASE } = await import('../cdp.mjs');
const { MAP } = await import('../music-map.mjs');
const name = process.argv[2] ?? 'trailer';
const map = MAP[name];

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
  for (let i = 0; i < 300; i++) {
    await sleep(100);
    if (await page.js('!!window.__ready').catch(() => false)) break;
  }
  const run = async (solo) => {
    const info = await page.js(`window.__render(${JSON.stringify(name)}, 'full', ${JSON.stringify(postTo)}, ${JSON.stringify(solo)})`);
    const N = got.length / 2, L = new Float64Array(N), R = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      L[i] = got[i * 2];
      R[i] = got[i * 2 + 1];
    }
    const kl = kWeight(L), kr = kWeight(R);
    return { strips: info.strips, row: map.cues.map(([, from, to]) => loudnessOf(kl, kr, from * 2 + 576 / SR, to * 2 + 576 / SR)) };
  };
  const all = await run(null);
  console.log(`${name}: loudness (LUFS, before the final gain) of each strip alone, per cue\n`);
  console.log(`${'strip'.padEnd(9)} ${map.cues.map((c) => c[0].slice(0, 7).padStart(7)).join(' ')}`);
  const fmt = (row) => row.map((v) => (v < -70 ? '      ·' : v.toFixed(1).padStart(7))).join(' ');
  console.log(`${'ALL'.padEnd(9)} ${fmt(all.row)}`);
  for (const s of all.strips) console.log(`${s.padEnd(9)} ${fmt((await run(s)).row)}`);
} finally {
  await page.close();
  server.close();
}
